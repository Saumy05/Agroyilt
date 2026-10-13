'use strict';
/**
 * Distance Trip Service (trolley / distance-based billing)
 *
 * The vendor's phone streams GPS fixes while the trip is running. Straight-line
 * distance between fixes under-/over-states what was actually driven, so every batch is
 * converted to ROAD distance:
 *
 *   1. dense runs   → snapped to the road network (Google Roads, else OSRM map-matching)
 *   2. big gaps     → real driving route between the two fixes (Google Directions, else OSRM route)
 *   3. last resort  → straight line (still noise-filtered)
 *
 * Fare = baseCharge for the first baseKm, then perKmRate for every km after that
 * (admin-controlled; snapshotted on the booking at creation).
 */
const axios = require('axios');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const { BOOKING_STATUS } = require('../utils/constants');

const GOOGLE_KEY = () => process.env.GOOGLE_MAPS_API_KEY;
const OSRM_URL = () => (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const HTTP_TIMEOUT_MS = 5000;

// Noise / sanity limits
const MAX_ACCURACY_M = 50;       // ignore fixes worse than this
const MIN_MOVE_M = 15;           // ignore GPS jitter while stationary
const MAX_SPEED_KMH = 120;       // a trolley never does this; treat as a GPS jump
const DENSE_GAP_M = 400;         // fixes closer than this are map-matched, further apart are routed
const MAX_POINTS_PER_BATCH = 200;
const MAX_FIX_AGE_FUTURE_MS = 5 * 60 * 1000;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const haversineM = (a, b) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const validCoord = (p) =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);

/** Fare for a given distance. 0–baseKm costs baseCharge, every extra km costs perKmRate (pro-rata). */
const calcDistanceFare = (pricing, km) => {
  const baseKm = Number(pricing?.baseKm) || 0;
  const baseCharge = Number(pricing?.baseCharge) || 0;
  const perKm = Number(pricing?.perKmRate) || 0;
  const dist = Math.max(0, Number(km) || 0);
  return round2(baseCharge + Math.max(0, dist - baseKm) * perKm);
};

/** Normalises + filters raw client fixes against the last accepted point. */
const cleanPoints = (raw, last) => {
  const now = Date.now();
  const out = [];
  let prev = last && validCoord(last) ? { lat: last.lat, lng: last.lng, ts: last.ts || 0 } : null;

  const sorted = (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_POINTS_PER_BATCH)
    .map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng), ts: Number(p?.ts ?? p?.timestamp), acc: p?.accuracy === undefined || p?.accuracy === null ? null : Number(p.accuracy) }))
    .filter((p) => validCoord(p) && Number.isFinite(p.ts) && p.ts <= now + MAX_FIX_AGE_FUTURE_MS)
    .sort((a, b) => a.ts - b.ts);

  for (const p of sorted) {
    if (p.acc !== null && Number.isFinite(p.acc) && p.acc > MAX_ACCURACY_M) continue;
    if (prev) {
      if (p.ts <= prev.ts) continue; // duplicate / replayed fix
      const m = haversineM(prev, p);
      if (m < MIN_MOVE_M) continue;
      const hours = (p.ts - prev.ts) / 3600000;
      if (hours > 0 && (m / 1000) / hours > MAX_SPEED_KMH) continue; // teleport
    }
    out.push({ lat: p.lat, lng: p.lng, ts: p.ts });
    prev = p;
  }
  return out;
};

// ── Road-distance providers ──────────────────────────────────────────────────

const snapGoogleRoads = async (pts) => {
  const key = GOOGLE_KEY();
  if (!key) throw new Error('no google key');
  const path = pts.map((p) => `${p.lat},${p.lng}`).join('|');
  const { data } = await axios.get('https://roads.googleapis.com/v1/snapToRoads', {
    params: { path, interpolate: true, key }, timeout: HTTP_TIMEOUT_MS
  });
  const snapped = (data?.snappedPoints || []).map((s) => ({ lat: s.location.latitude, lng: s.location.longitude }));
  if (snapped.length < 2) throw new Error('google roads returned no path');
  let m = 0;
  for (let i = 1; i < snapped.length; i++) m += haversineM(snapped[i - 1], snapped[i]);
  return m;
};

const matchOsrm = async (pts) => {
  const coords = pts.map((p) => `${p.lng},${p.lat}`).join(';');
  const { data } = await axios.get(`${OSRM_URL()}/match/v1/driving/${coords}`, {
    params: { overview: 'false', gaps: 'ignore', radiuses: pts.map(() => 30).join(';') },
    timeout: HTTP_TIMEOUT_MS
  });
  if (data?.code !== 'Ok' || !data.matchings?.length) throw new Error('osrm match failed');
  return data.matchings.reduce((s, m) => s + (m.distance || 0), 0);
};

const routeGoogle = async (a, b) => {
  const key = GOOGLE_KEY();
  if (!key) throw new Error('no google key');
  const { data } = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
    params: { origin: `${a.lat},${a.lng}`, destination: `${b.lat},${b.lng}`, mode: 'driving', key }, timeout: HTTP_TIMEOUT_MS
  });
  const meters = data?.routes?.[0]?.legs?.reduce((s, l) => s + (l.distance?.value || 0), 0);
  if (data?.status !== 'OK' || !meters) throw new Error('google directions failed');
  return meters;
};

const routeOsrm = async (a, b) => {
  const { data } = await axios.get(`${OSRM_URL()}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}`, {
    params: { overview: 'false' }, timeout: HTTP_TIMEOUT_MS
  });
  const meters = data?.routes?.[0]?.distance;
  if (data?.code !== 'Ok' || !meters) throw new Error('osrm route failed');
  return meters;
};

const firstOk = async (tries) => {
  for (const [method, fn] of tries) {
    try { return { meters: await fn(), method }; } catch (_) { /* try next provider */ }
  }
  return null;
};

/**
 * Road distance (km) for an ordered list of already-cleaned fixes.
 * `startFrom` is the previously accepted point so consecutive batches join up.
 * @returns {{km:number, method:string}}
 */
const roadDistance = async (pts, startFrom = null) => {
  const seq = startFrom ? [startFrom, ...pts] : [...pts];
  if (seq.length < 2) return { km: 0, method: 'none' };

  // split into dense runs (map-match) separated by big gaps (route)
  const runs = [];
  const gaps = [];
  let run = [seq[0]];
  for (let i = 1; i < seq.length; i++) {
    if (haversineM(seq[i - 1], seq[i]) > DENSE_GAP_M) {
      runs.push(run);
      gaps.push([seq[i - 1], seq[i]]);
      run = [seq[i]];
    } else run.push(seq[i]);
  }
  runs.push(run);

  let meters = 0;
  const methods = new Set();

  for (const r of runs) {
    if (r.length < 2) continue;
    for (let i = 0; i < r.length - 1; i += 99) { // Google Roads limit is 100 points; chunks share one point
      const chunk = r.slice(i, i + 100);
      if (chunk.length < 2) continue;
      const hit = await firstOk([['google_roads', () => snapGoogleRoads(chunk)], ['osrm_match', () => matchOsrm(chunk)]]);
      if (hit) { meters += hit.meters; methods.add(hit.method); }
      else {
        for (let k = 1; k < chunk.length; k++) meters += haversineM(chunk[k - 1], chunk[k]);
        methods.add('straight_line');
      }
    }
  }
  for (const [a, b] of gaps) {
    const hit = await firstOk([['google_route', () => routeGoogle(a, b)], ['osrm_route', () => routeOsrm(a, b)]]);
    if (hit) { meters += hit.meters; methods.add(hit.method); }
    else { meters += haversineM(a, b) * 1.3; methods.add('straight_line'); } // roads are never straight
  }

  const method = methods.size === 1 ? [...methods][0] : [...methods].sort().join('+');
  return { km: meters / 1000, method };
};

// ── Booking integration ──────────────────────────────────────────────────────

const isDistanceBooking = (b) => b?.rental_type === 'distance_based';

/** Pricing snapshot for a new booking from the admin's service template. */
const pricingFromService = (service) => {
  const d = service?.distance_pricing || {};
  return { baseKm: Number(d.baseKm) || 0, baseCharge: Number(d.baseCharge) || 0, perKmRate: Number(d.perKmRate) || 0 };
};

/**
 * Trolley is booked as an implement (a sub-category) attached to a machine, while the admin sets the
 * per-km tier on a Service of the same name. Finds that tier for a given implement.
 * Services under the same machine category win over same-named services elsewhere.
 * @returns {Promise<{enabled:true, baseKm:number, baseCharge:number, perKmRate:number, serviceId:string}|null>}
 */
const resolveImplementDistancePricing = async (implementId, machineCategoryId = null) => {
  if (!implementId || !mongoose.isValidObjectId(String(implementId))) return null;
  const Category = require('../models/Category');
  const Service = require('../models/Service');
  const impl = await Category.findById(implementId).select('title').lean();
  if (!impl?.title) return null;
  const esc = impl.title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const candidates = await Service.find({
    'distance_pricing.enabled': true,
    'distance_pricing.baseCharge': { $gt: 0 },
    status: { $ne: 'inactive' },
    title: new RegExp(`^\\s*${esc}\\s*$`, 'i')
  }).lean();
  if (!candidates.length) return null;
  const sameMachine = candidates.find((s) => machineCategoryId && String(s.categoryId) === String(machineCategoryId));
  const svc = sameMachine || candidates[0];
  return { enabled: true, ...pricingFromService(svc), serviceId: String(svc._id) };
};

/** Starts tracking (called when the vendor starts the trip). Idempotent. */
const startTracking = (bookingId, start = null, now = new Date()) => {
  const $set = { 'distanceTrip.status': 'RUNNING', 'distanceTrip.startedAt': now, 'distanceTrip.totalDistanceKm': 0, 'distanceTrip.fare': 0 };
  if (start && validCoord(start)) {
    $set['distanceTrip.lastPoint'] = { lat: Number(start.lat), lng: Number(start.lng), ts: Number(start.ts) || now.getTime() };
  }
  return Booking.updateOne({ _id: bookingId, 'distanceTrip.status': { $ne: 'RUNNING' } }, { $set });
};

const liveView = (b) => {
  const d = b.distanceTrip || {};
  return {
    status: d.status,
    totalDistanceKm: round2(d.totalDistanceKm || 0),
    fare: calcDistanceFare(d.pricing, d.totalDistanceKm || 0),
    pricing: d.pricing,
    startedAt: d.startedAt,
    stoppedAt: d.stoppedAt,
    method: d.method
  };
};

/**
 * Adds a batch of GPS fixes to a running trip. Safe against concurrent/duplicate batches:
 * the write only lands if no other batch was applied since we read the booking.
 * @returns {Promise<{accepted:number, addedKm:number, ...liveView}>}
 */
const recordPoints = async (bookingId, vendorId, rawPoints, { attempt = 0 } = {}) => {
  const b = await Booking.findOne({ _id: bookingId, vendorId }).select('rental_type status distanceTrip userId');
  if (!b) { const e = new Error('Booking not found'); e.status = 404; throw e; }
  if (!isDistanceBooking(b)) { const e = new Error('This booking is not billed by distance'); e.status = 400; throw e; }
  if (b.status !== BOOKING_STATUS.IN_PROGRESS || b.distanceTrip?.status !== 'RUNNING') {
    const e = new Error('Distance tracking is not running for this booking'); e.status = 409; throw e;
  }

  const d = b.distanceTrip;
  const last = d.lastPoint && validCoord(d.lastPoint) ? { lat: d.lastPoint.lat, lng: d.lastPoint.lng, ts: d.lastPoint.ts || 0 } : null;
  const pts = cleanPoints(rawPoints, last);
  if (!pts.length) return { accepted: 0, addedKm: 0, ...liveView(b) };

  // The very first fix only anchors the trip; distance starts counting from it.
  const anchor = last || pts[0];
  const toMeasure = last ? pts : pts.slice(1);
  const { km, method } = toMeasure.length ? await roadDistance(toMeasure, anchor) : { km: 0, method: d.method };

  const tail = pts[pts.length - 1];
  const updated = await Booking.findOneAndUpdate(
    { _id: bookingId, vendorId, status: BOOKING_STATUS.IN_PROGRESS, 'distanceTrip.status': 'RUNNING', 'distanceTrip.seq': d.seq || 0 },
    {
      $inc: { 'distanceTrip.totalDistanceKm': round2(km), 'distanceTrip.seq': 1, 'distanceTrip.pointsAccepted': pts.length },
      $set: { 'distanceTrip.lastPoint': { lat: tail.lat, lng: tail.lng, ts: tail.ts }, 'distanceTrip.method': method || d.method }
    },
    { new: true }
  ).select('rental_type status distanceTrip userId');

  if (!updated) { // another batch won the race; re-run on fresh state
    if (attempt >= 3) { const e = new Error('Too many concurrent location updates, retry'); e.status = 409; throw e; }
    return recordPoints(bookingId, vendorId, rawPoints, { attempt: attempt + 1 });
  }

  const view = { accepted: pts.length, addedKm: round2(km), ...liveView(updated) };
  try {
    const io = global.io;
    if (io) io.to(`user_${updated.userId}`).emit('distance_updated', { bookingId: updated._id, ...liveView(updated) });
  } catch (_) { /* realtime is best-effort */ }
  return view;
};

/**
 * Freezes the trip and returns the final distance/fare. Mutates the (unsaved) booking doc so the
 * billing save persists it. Idempotent.
 */
const freezeTrip = (booking, now = new Date()) => {
  const d = booking.distanceTrip;
  if (!d) return null;
  d.totalDistanceKm = round2(d.totalDistanceKm || 0);
  d.fare = calcDistanceFare(d.pricing, d.totalDistanceKm);
  if (d.status !== 'STOPPED') {
    d.status = 'STOPPED';
    d.stoppedAt = now;
  }
  return { distanceKm: d.totalDistanceKm, fare: d.fare };
};

module.exports = {
  calcDistanceFare,
  cleanPoints,
  roadDistance,
  haversineM,
  isDistanceBooking,
  pricingFromService,
  resolveImplementDistancePricing,
  startTracking,
  recordPoints,
  freezeTrip,
  liveView
};

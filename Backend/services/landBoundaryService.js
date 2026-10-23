'use strict';

/**
 * Land boundary (the field's border as marked on the map): validation, area, and overlap with other leases.
 *
 * A boundary is the list of corner points the owner marked: [{ lat, lng }, ...]. It is stored as a GeoJSON Polygon
 * ([lng, lat], closed ring, counter-clockwise) so MongoDB can search it, plus the original points for editing.
 * Everything here is plain JS (no paid map services): the area is the geodesic area of the points.
 */

const LandLease = require('../models/LandLease');

const EARTH_RADIUS_M = 6378137;
const SQ_M_PER_ACRE = 4046.8564224;
const MIN_POINTS = 3;
const MAX_POINTS = 200;
const MIN_AREA_ACRES = 0.01;
const MAX_AREA_ACRES = 5000;
// India, with a margin: catches a swapped latitude / longitude or a point dropped far away by mistake
const BOUNDS = { minLat: 6, maxLat: 38, minLng: 68, maxLng: 98 };
// two neighbouring fields marked separately overlap a little (GPS is only good to a few metres); a copy of the same land overlaps almost fully
const OVERLAP_REJECT_RATIO = 0.2;

const toRad = (d) => (d * Math.PI) / 180;
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

/** Geodesic area (m²) of a ring of { lat, lng } points (first point not repeated). */
const polygonAreaSqM = (pts) => {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    sum += toRad(p2.lng - p1.lng) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
  }
  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
};

/** Signed planar area, only used for the ring's direction. */
const signedArea = (pts) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length];
    s += a.lng * b.lat - b.lng * a.lat;
  }
  return s / 2;
};

const centroid = (pts) => ({
  lat: round(pts.reduce((s, p) => s + p.lat, 0) / pts.length, 7),
  lng: round(pts.reduce((s, p) => s + p.lng, 0) / pts.length, 7)
});

const orient = (a, b, c) => (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);

/** True when segments ab and cd cross each other (touching at an end point does not count). */
const segmentsCross = (a, b, c, d) => {
  const o1 = orient(a, b, c); const o2 = orient(a, b, d);
  const o3 = orient(c, d, a); const o4 = orient(c, d, b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
};

const selfIntersects = (pts) => {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // edges that share a corner are neighbours, not a crossing
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
};

/**
 * Checks and tidies the corner points a farmer marked.
 * @returns {{ ok: true, points, geojson, areaAcres, center } | { ok: false, code: string, message: string }}
 */
const buildBoundary = (rawPoints) => {
  if (!Array.isArray(rawPoints)) return { ok: false, code: 'BOUNDARY_REQUIRED', message: 'Mark the land border on the map first.' };

  let points = rawPoints.map(p => ({ lat: Number(p?.lat), lng: Number(p?.lng) }));
  if (points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng))) {
    return { ok: false, code: 'BOUNDARY_INVALID', message: 'The border has a corner without a valid location.' };
  }
  points = points.map(p => ({ lat: round(p.lat, 7), lng: round(p.lng, 7) }));
  // a corner tapped twice in a row is one corner; a copy of the first corner at the end just closes the ring
  points = points.filter((p, i) => i === 0 || p.lat !== points[i - 1].lat || p.lng !== points[i - 1].lng);
  if (points.length > 1 && points[0].lat === points[points.length - 1].lat && points[0].lng === points[points.length - 1].lng) points.pop();

  if (points.length < MIN_POINTS) {
    return { ok: false, code: 'BOUNDARY_TOO_SMALL', message: `Mark at least ${MIN_POINTS} corners of the land.` };
  }
  if (points.length > MAX_POINTS) {
    return { ok: false, code: 'BOUNDARY_TOO_LARGE', message: `Use at most ${MAX_POINTS} corners.` };
  }
  if (points.some(p => p.lat < BOUNDS.minLat || p.lat > BOUNDS.maxLat || p.lng < BOUNDS.minLng || p.lng > BOUNDS.maxLng)) {
    return { ok: false, code: 'BOUNDARY_OUT_OF_COUNTRY', message: 'A corner is outside India. Check the location and mark the border again.' };
  }
  if (selfIntersects(points)) {
    return { ok: false, code: 'BOUNDARY_CROSSED', message: 'The border lines cross each other. Move the corners so the border goes around the land once.' };
  }

  const areaAcres = round(polygonAreaSqM(points) / SQ_M_PER_ACRE, 4);
  if (areaAcres < MIN_AREA_ACRES) {
    return { ok: false, code: 'BOUNDARY_TOO_SMALL', message: 'The marked land is too small. Check the corners.' };
  }
  if (areaAcres > MAX_AREA_ACRES) {
    return { ok: false, code: 'BOUNDARY_TOO_LARGE', message: 'The marked land is too large. Check the corners.' };
  }

  // GeoJSON: counter-clockwise, [lng, lat], first point repeated at the end
  const ccw = signedArea(points) >= 0 ? points : [...points].reverse();
  const ring = ccw.map(p => [p.lng, p.lat]);
  ring.push([...ring[0]]);
  return {
    ok: true,
    points,
    geojson: { type: 'Polygon', coordinates: [ring] },
    areaAcres,
    center: centroid(points)
  };
};

// ── overlap ──────────────────────────────────────────────────────────────────────────────────────
const inside = (pt, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]; const b = ring[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};

/**
 * How much of the smaller field the two borders share (0 to 1). Measured by sampling a grid over the area both
 * rectangles cover: fields that only touch along a fence share (almost) nothing, a copy of the same land shares all.
 */
const overlapRatio = (ringA, ringB, samples = 60) => {
  const bbox = (r) => ({ minX: Math.min(...r.map(p => p[0])), maxX: Math.max(...r.map(p => p[0])), minY: Math.min(...r.map(p => p[1])), maxY: Math.max(...r.map(p => p[1])) });
  const a = bbox(ringA); const b = bbox(ringB);
  const minX = Math.max(a.minX, b.minX); const maxX = Math.min(a.maxX, b.maxX);
  const minY = Math.max(a.minY, b.minY); const maxY = Math.min(a.maxY, b.maxY);
  if (minX >= maxX || minY >= maxY) return 0;

  let hits = 0;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const pt = [minX + ((i + 0.5) / samples) * (maxX - minX), minY + ((j + 0.5) / samples) * (maxY - minY)];
      if (inside(pt, ringA) && inside(pt, ringB)) hits++;
    }
  }
  const midLat = (minY + maxY) / 2;
  const boxM2 = (maxY - minY) * 111320 * (maxX - minX) * 111320 * Math.cos(toRad(midLat));
  const overlapM2 = (hits / (samples * samples)) * boxM2;
  const smallerM2 = Math.min(polygonAreaSqM(ringA.slice(0, -1).map(p => ({ lat: p[1], lng: p[0] }))), polygonAreaSqM(ringB.slice(0, -1).map(p => ({ lat: p[1], lng: p[0] }))));
  return smallerM2 > 0 ? Math.min(1, overlapM2 / smallerM2) : 0;
};

/**
 * Another listing (open, waiting for signatures, or leased) whose border covers this one.
 * @returns {Promise<object|null>} the lease it overlaps, or null
 */
const findOverlappingLease = async (geojson, excludeLeaseId = null) => {
  const candidates = await LandLease.find({
    ...(excludeLeaseId ? { _id: { $ne: excludeLeaseId } } : {}),
    status: { $in: ['active', 'agreement_pending', 'leased'] },
    boundary: { $geoIntersects: { $geometry: geojson } }
  }).select('title khasraNumber boundary location.village ownerId').limit(25).lean();

  const ring = geojson.coordinates[0];
  for (const c of candidates) {
    if (overlapRatio(ring, c.boundary.coordinates[0]) >= OVERLAP_REJECT_RATIO) return c;
  }
  return null;
};

/** Message when the marked area and the typed area disagree a lot (the farmer fixes whichever is wrong). */
const AREA_MISMATCH_RATIO = 0.3;
const areaMismatch = (typedAcres, markedAcres) => {
  const typed = Number(typedAcres);
  if (!(typed > 0) || !(markedAcres > 0)) return null;
  const diff = Math.abs(typed - markedAcres) / Math.max(typed, markedAcres);
  return diff > AREA_MISMATCH_RATIO
    ? `The area you typed (${typed} acres) is very different from the area of the marked border (${round(markedAcres, 2)} acres). Fix one of them.`
    : null;
};

module.exports = { buildBoundary, polygonAreaSqM, centroid, overlapRatio, findOverlappingLease, areaMismatch, SQ_M_PER_ACRE };

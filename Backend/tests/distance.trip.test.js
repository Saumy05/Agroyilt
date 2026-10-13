'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const h = require('./helpers/harness');
const f = require('./helpers/flow');
const D = require('../services/distanceTripService');

// ── Pure helpers ─────────────────────────────────────────────────────────────
describe('Distance fare (admin tier)', () => {
  const tier = { baseKm: 10, baseCharge: 100, perKmRate: 10 };
  it('charges the base for the first baseKm and the per-km rate after', () => {
    assert.equal(D.calcDistanceFare(tier, 0), 100);
    assert.equal(D.calcDistanceFare(tier, 4.2), 100);
    assert.equal(D.calcDistanceFare(tier, 10), 100);
    assert.equal(D.calcDistanceFare(tier, 20), 200);
    assert.equal(D.calcDistanceFare(tier, 12.5), 125);
  });
  it('is safe with missing/garbage input', () => {
    assert.equal(D.calcDistanceFare(null, 5), 0);
    assert.equal(D.calcDistanceFare(tier, -3), 100);
    assert.equal(D.calcDistanceFare(tier, 'x'), 100);
  });
});

describe('GPS fix cleaning', () => {
  const t0 = Date.now() - 600000;
  const at = (lat, lng, sec, acc) => ({ lat, lng, ts: t0 + sec * 1000, accuracy: acc });
  it('drops poor accuracy, jitter, duplicates and teleports', () => {
    const out = D.cleanPoints([
      at(18.5200, 73.8500, 0, 8),
      at(18.5200, 73.8500, 5, 8),        // not moved: jitter
      at(18.5300, 73.8500, 60, 200),     // inaccurate fix
      at(18.5210, 73.8500, 70, 8),       // ~111 m: valid
      at(18.5210, 73.8500, 70, 8),       // duplicate timestamp
      at(19.5000, 73.8500, 75, 8)        // ~108 km in 5 s: teleport
    ], null);
    assert.deepEqual(out.map(p => p.lat), [18.52, 18.521]);
  });
  it('ignores invalid coordinates', () => {
    assert.deepEqual(D.cleanPoints([{ lat: 0, lng: 0, ts: t0 }, { lat: 'a', lng: 1, ts: t0 }, null], null), []);
  });
});

describe('Road distance', () => {
  const realGet = axios.get;
  const pts = [{ lat: 18.52, lng: 73.85 }, { lat: 18.522, lng: 73.85 }, { lat: 18.524, lng: 73.85 }];
  after(() => { axios.get = realGet; });

  it('uses the road-snapped distance when a provider answers', async () => {
    axios.get = async (url) => {
      if (url.includes('/match/')) return { data: { code: 'Ok', matchings: [{ distance: 1234 }] } };
      throw new Error('unexpected ' + url);
    };
    const r = await D.roadDistance(pts.slice(1), pts[0]);
    assert.equal(r.method, 'osrm_match');
    assert.ok(Math.abs(r.km - 1.234) < 1e-9);
  });

  it('routes across big gaps instead of trusting a straight line', async () => {
    axios.get = async (url) => {
      if (url.includes('/route/')) return { data: { code: 'Ok', routes: [{ distance: 9000 }] } };
      throw new Error('unexpected ' + url);
    };
    const r = await D.roadDistance([{ lat: 18.60, lng: 73.85 }], { lat: 18.52, lng: 73.85 }); // ~8.9 km apart
    assert.equal(r.method, 'osrm_route');
    assert.equal(r.km, 9);
  });

  it('falls back to straight-line when every provider is down', async () => {
    axios.get = async () => { throw new Error('offline'); };
    const r = await D.roadDistance(pts.slice(1), pts[0]);
    assert.equal(r.method, 'straight_line');
    assert.ok(r.km > 0.4 && r.km < 0.5);
  });
});

// ── End to end ───────────────────────────────────────────────────────────────
describe('Trolley booking billed by distance', () => {
  let ctx, w, svc;
  const realGet = axios.get;
  before(async () => { ctx = await h.boot(); });
  after(async () => { axios.get = realGet; await h.shutdown(); });
  beforeEach(async () => {
    await h.clearDb(); h.fakeIo.reset();
    w = await f.world(ctx);
    svc = await h.make.service(w.cat, {
      title: 'Trolley', rental_type: 'distance_based',
      distance_pricing: { enabled: true, baseKm: 10, baseCharge: 100, perKmRate: 10 }
    });
    axios.get = async () => { throw new Error('offline'); };
  });

  const payload = (over = {}) => ({ serviceId: String(svc._id), rental_type: 'distance_based', ...over });
  const book = async (over = {}) => {
    const r = await f.createBooking(w, payload(over));
    return r;
  };
  const vendorHdr = () => h.auth(w.vendor, 'VENDOR');
  const send = (id, points) => w.api.post(`/api/vendors/bookings/${id}/distance/points`).set(vendorHdr()).send({ points });

  // a straight north-south drive; each fix 0.001° (~111 m) apart, 5 s apart
  const drive = (n, startSec = 0) => Array.from({ length: n }, (_, i) => ({
    lat: 18.52 + i * 0.001, lng: 73.85, ts: Date.now() - 3600000 + (startSec + i * 5) * 1000, accuracy: 6
  }));

  it('books at the admin base charge and snapshots the tier', async () => {
    const r = await book();
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const b = await h.M('Booking').findById(r.body.data._id);
    assert.equal(b.rental_type, 'distance_based');
    assert.equal(b.basePrice, 100);
    assert.deepEqual({ ...b.distanceTrip.pricing.toObject?.() }, { baseKm: 10, baseCharge: 100, perKmRate: 10 });

    // admin edits the tier afterwards: the open booking keeps its snapshot
    await h.M('Service').updateOne({ _id: svc._id }, { $set: { 'distance_pricing.perKmRate': 99 } });
    const again = await h.M('Booking').findById(b._id);
    assert.equal(again.distanceTrip.pricing.perKmRate, 10);
  });

  it('rejects distance booking on a service the admin has not enabled for it', async () => {
    await h.M('Service').updateOne({ _id: svc._id }, { $set: { 'distance_pricing.enabled': false } });
    const r = await book();
    assert.equal(r.status, 400);
  });

  it('bills 20 km at 100 + 10 x 10 = 200 (+5% rental GST)', async () => {
    const id = (await book()).body.data._id;
    await f.toInProgress(w, id);

    let b = await h.M('Booking').findById(id);
    assert.equal(b.distanceTrip.status, 'RUNNING');
    assert.equal(b.serviceTimer.status, 'NOT_STARTED', 'no time-based timer for distance jobs');

    // provider answers 20 km of road for the whole drive
    axios.get = async (url) => {
      if (url.includes('/match/')) return { data: { code: 'Ok', matchings: [{ distance: 20000 }] } };
      throw new Error('offline');
    };
    const r1 = await send(id, drive(30));
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    // first fix only anchors the trip
    assert.equal(r1.body.data.accepted, 30);
    assert.equal(r1.body.data.totalDistanceKm, 20);
    assert.equal(r1.body.data.fare, 200);

    const done = await f.endTrip(w, id);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    b = await h.M('Booking').findById(id);
    assert.equal(b.distanceTrip.status, 'STOPPED');
    assert.equal(b.distanceTrip.fare, 200);
    assert.equal(b.finalAmount, 210);
    assert.equal(b.balanceDue, 210);
    const bill = await h.M('VendorBill').findById(b.vendorBillId);
    assert.equal(bill.totalServiceBase, 200);
    assert.match(bill.services[0].name, /20 km/);
  });

  it('a short trip inside the base distance still costs exactly the base charge', async () => {
    const id = (await book()).body.data._id;
    await f.toInProgress(w, id);
    axios.get = async (url) => url.includes('/match/') ? { data: { code: 'Ok', matchings: [{ distance: 3500 }] } } : Promise.reject(new Error('offline'));
    await send(id, drive(10));
    assert.equal((await f.endTrip(w, id)).status, 200);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.distanceTrip.totalDistanceKm, 3.5);
    assert.equal(b.finalAmount, 105);
  });

  it('batches add up, and replayed batches are not double counted', async () => {
    const id = (await book()).body.data._id;
    await f.toInProgress(w, id);
    axios.get = async (url) => url.includes('/match/') ? { data: { code: 'Ok', matchings: [{ distance: 4000 }] } } : Promise.reject(new Error('offline'));
    const batch1 = drive(5);
    const batch2 = drive(5, 25).map((p, i) => ({ ...p, lat: 18.52 + (5 + i) * 0.001 }));
    await send(id, batch1);
    await send(id, batch1); // replay: all timestamps already seen
    const r = await send(id, batch2);
    assert.equal(r.status, 200);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.distanceTrip.totalDistanceKm, 8, 'two real batches of 4 km each');
  });

  it('points are only accepted for the owning vendor while the trip is running', async () => {
    const id = (await book()).body.data._id;
    assert.equal((await send(id, drive(3))).status, 409, 'not started');
    await f.toInProgress(w, id);
    const stranger = await h.make.vendor();
    const r = await w.api.post(`/api/vendors/bookings/${id}/distance/points`).set(h.auth(stranger, 'VENDOR')).send({ points: drive(3) });
    assert.equal(r.status, 404);
    assert.equal((await w.api.post(`/api/vendors/bookings/${id}/distance/points`).send({ points: drive(3) })).status, 401);
    assert.equal((await f.endTrip(w, id)).status, 200);
    assert.equal((await send(id, drive(3))).status, 409, 'trip stopped');
  });

  it('a vendor who never sends GPS bills only the base charge', async () => {
    const id = (await book()).body.data._id;
    await f.toInProgress(w, id);
    assert.equal((await f.endTrip(w, id)).status, 200);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.finalAmount, 105);
  });

  it('final points sent with the end request are included in the bill', async () => {
    const id = (await book()).body.data._id;
    await f.toInProgress(w, id);
    axios.get = async (url) => url.includes('/match/') ? { data: { code: 'Ok', matchings: [{ distance: 15000 }] } } : Promise.reject(new Error('offline'));
    const done = await f.endTrip(w, id, { points: drive(20) });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const b = await h.M('Booking').findById(id);
    assert.equal(b.distanceTrip.totalDistanceKm, 15);
    assert.equal(b.finalAmount, 157.5); // (100 + 5 x 10) + 5% GST
  });
});

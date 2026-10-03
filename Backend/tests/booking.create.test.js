'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const f = require('./helpers/flow');

let ctx, w;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => { await h.clearDb(); h.fakeIo.reset(); w = await f.world(ctx); });

const post = (farmer, body) => w.api.post('/api/user/bookings').set(h.auth(farmer, 'USER')).send(body);

describe('createBooking — validation', () => {
  it('creates a targeted request, alerts only the chosen vendor and stores a 15-minute BookingRequest', async () => {
    const r = await f.createBooking(w);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const b = await h.M('Booking').findById(r.body.data._id);
    assert.equal(b.status, 'requested');
    assert.deepEqual(b.notifiedVendors.map(String), [String(w.vendor._id)]);
    const req = await h.M('BookingRequest').findOne({ bookingId: b._id });
    assert.equal(req.status, 'PENDING');
    const mins = (req.expiresAt - Date.now()) / 60000;
    assert.ok(mins > 14 && mins <= 15);
    assert.ok(h.fakeIo.sentTo(`vendor_${w.vendor._id}`).some(e => e.event === 'new_booking_request'));
  });

  it('rejects dates in the past, slots that already passed, bad slots and dates > 90 days out', async () => {
    const cases = [
      [{ scheduledDate: '2020-01-01' }, /past/i],
      [{ timeSlot: { start: '11:00', end: '09:00' } }, /later than start/i],
      [{ timeSlot: { start: '10:00', end: '10:00' } }, /later than start/i],
      [{ timeSlot: { start: 'xx', end: 'yy' } }, /time slot/i],
      [{ scheduledDate: h.dateIn(120) }, /90 days/i]
    ];
    for (const [over, msg] of cases) {
      const r = await f.createBooking(w, over);
      assert.equal(r.status, 400, JSON.stringify(over));
      assert.match(r.body.message, msg);
    }
    // today, with a slot that already started (in app timezone)
    const local = new Date(Date.now() + 330 * 60000);
    const today = local.toISOString().slice(0, 10);
    const hh = String(local.getUTCHours()).padStart(2, '0');
    if (local.getUTCHours() >= 1) {
      const r = await f.createBooking(w, { scheduledDate: today, timeSlot: { start: '00:30', end: `${hh}:59` } , rental_type: 'daily' });
      assert.equal(r.status, 400);
      assert.match(r.body.message, /already passed/i);
    }
    assert.equal(await h.M('Booking').countDocuments(), 0, 'nothing was persisted');
  });

  it('hourly slots must be 30-minute multiples of at least 30 minutes', async () => {
    let r = await f.createBooking(w, { timeSlot: { start: '09:00', end: '09:15' } });
    assert.equal(r.status, 400);
    r = await f.createBooking(w, { timeSlot: { start: '09:00', end: '09:50' } });
    assert.equal(r.status, 400);
  });

  it('ignores a client-supplied visiting charge and price for machinery (server decides)', async () => {
    const r = await f.createBooking(w, { visitingCharges: 0, visitationFee: 0, basePrice: 1, amount: 1, discount: 999 });
    assert.equal(r.status, 201);
    const b = await h.M('Booking').findById(r.body.data._id);
    assert.equal(b.visitingCharges, 49);
    assert.equal(b.basePrice, 1200); // 2h × ₹600
    assert.equal(b.discount, 0);
    assert.equal(b.tax, 60); // 5% GST
    assert.equal(b.finalAmount, 1200 + 60 + 49);
  });

  it('a client flag can never grant a paid Plus membership', async () => {
    const r = await f.createBooking(w, { isPlusAdded: true });
    assert.equal(r.status, 201);
    const u = await h.M('User').findById(w.farmer._id);
    assert.ok(!u.plans || !u.plans.isActive, 'membership must not be activated by the request body');
  });

  it('does not leak a stack trace on failure', async () => {
    const r = await post(w.farmer, { serviceId: String(new (require('mongoose').Types.ObjectId)()), scheduledDate: h.dateIn(2), scheduledTime: '09:00', timeSlot: { start: '09:00', end: '10:00' }, address: { addressLine1: 'a', city: 'b', state: 'c', pincode: '1' } });
    assert.ok([404, 500].includes(r.status));
    assert.equal(r.body.stack, undefined);
  });

  it('requires authentication and the farmer role', async () => {
    let r = await w.api.post('/api/user/bookings').send(h.bookingPayload(w.eq));
    assert.equal(r.status, 401);
    r = await w.api.post('/api/user/bookings').set(h.auth(w.vendor, 'VENDOR')).send(h.bookingPayload(w.eq));
    assert.equal(r.status, 403);
  });
});

describe('createBooking — vendor eligibility', () => {
  it('refuses unapproved, suspended, inactive and cash-blocked vendors', async () => {
    for (const patch of [
      { approvalStatus: 'pending' },
      { approvalStatus: 'suspended' },
      { isActive: false },
      { 'wallet.isBlocked': true }
    ]) {
      await h.M('Vendor').updateOne({ _id: w.vendor._id }, { $set: patch });
      const r = await f.createBooking(w);
      assert.equal(r.status, 400, JSON.stringify(patch));
      await h.M('Vendor').updateOne({ _id: w.vendor._id }, { $set: { approvalStatus: 'approved', isActive: true, 'wallet.isBlocked': false } });
    }
    assert.equal(await h.M('Booking').countDocuments(), 0);
  });

  it('refuses equipment that is not live or not owned by the chosen vendor', async () => {
    const other = await h.make.vendor();
    let r = await f.createBooking(w, { vendorId: String(other._id) });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /does not belong/i);
    await h.M('VendorEquipment').updateOne({ _id: w.eq._id }, { $set: { status: 'inactive' } });
    r = await f.createBooking(w);
    assert.equal(r.status, 400);
    assert.match(r.body.message, /not available/i);
  });
});

describe('createBooking — slot conflicts and abuse', () => {
  it('blocks a second request for an overlapping slot, allows adjacent slots and other days', async () => {
    assert.equal((await f.createBooking(w)).status, 201);
    const other = await h.make.farmer();
    let r = await f.createBooking(w, {}, other);
    assert.equal(r.status, 409);
    assert.equal(r.body.conflict, true);
    r = await f.createBooking(w, { timeSlot: { start: '10:00', end: '12:00' } }, other);
    assert.equal(r.status, 409, 'overlap 10:00-11:00');
    r = await f.createBooking(w, { timeSlot: { start: '11:00', end: '12:00' } }, other);
    assert.equal(r.status, 201, 'touching slots do not overlap');
    r = await f.createBooking(w, { scheduledDate: h.dateIn(3) }, other);
    assert.equal(r.status, 201, 'another day is free');
    assert.equal(await h.M('Booking').countDocuments(), 3, 'rejected attempts leave no orphan bookings');
  });

  it('two farmers racing for the same slot: exactly one wins', async () => {
    const a = await h.make.farmer(); const b = await h.make.farmer(); const c = await h.make.farmer();
    const results = await Promise.all([a, b, c].map(fm => f.createBooking(w, {}, fm)));
    const ok = results.filter(r => r.status === 201).length;
    assert.equal(ok, 1, results.map(r => r.status).join(','));
    assert.equal(await h.M('Booking').countDocuments({ status: 'requested' }), 1);
  });

  it('caps how many unanswered requests one farmer can hold (slot hoarding)', async () => {
    const days = [2, 3, 4, 5, 6, 7];
    const statuses = [];
    for (const d of days) statuses.push((await f.createBooking(w, { scheduledDate: h.dateIn(d) })).status);
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
  });
});

describe('createBooking — carried-over penalty', () => {
  it('adds the penalty to the total and clears it only after the booking exists', async () => {
    await h.M('User').updateOne({ _id: w.farmer._id }, { $set: { 'wallet.penalty': 49 } });
    const r = await f.createBooking(w);
    assert.equal(r.status, 201);
    const b = await h.M('Booking').findById(r.body.data._id);
    assert.equal(b.penalty, 49);
    assert.equal(b.finalAmount, 1200 + 60 + 49 + 49);
    assert.equal((await f.userWallet(w.farmer)).penalty, 0);
  });

  it('keeps the penalty when the booking is refused (conflict / ineligible vendor)', async () => {
    await f.createBooking(w, {}, await h.make.farmer()); // someone else holds the slot
    await h.M('User').updateOne({ _id: w.farmer._id }, { $set: { 'wallet.penalty': 49 } });
    const r = await f.createBooking(w);
    assert.equal(r.status, 409);
    assert.equal((await f.userWallet(w.farmer)).penalty, 49, 'penalty must survive a failed booking');
  });
});

describe('non-machinery service pricing', () => {
  it('rejects negative / below-minimum client prices and always uses the platform visiting charge', async () => {
    const cat = await h.make.category({ title: 'Electrician', slug: 'elec', requiresDriver: false });
    const svc = await h.make.service(cat, { basePrice: 500, priceRangeMin: 300 });
    const payload = (over) => ({
      serviceId: String(svc._id), vendorId: String(w.vendor._id), scheduledDate: h.dateIn(2), scheduledTime: '09:00',
      timeSlot: { start: '09:00', end: '10:00' }, serviceCategory: 'Electrician', paymentMethod: 'pay_at_home',
      address: { addressLine1: 'a', city: 'b', state: 'c', pincode: '1', lat: 1, lng: 1 }, ...over
    });
    let r = await post(w.farmer, payload({ basePrice: -5 }));
    assert.equal(r.status, 400);
    r = await post(w.farmer, payload({ basePrice: 10, amount: 10 }));
    assert.equal(r.status, 400);
    r = await post(w.farmer, payload({ basePrice: 400, discount: 9999 }));
    assert.equal(r.status, 400);
    r = await post(w.farmer, payload({ basePrice: 400, visitingCharges: 0 }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await h.M('Booking').findById(r.body.data._id)).visitingCharges, 49);
  });
});

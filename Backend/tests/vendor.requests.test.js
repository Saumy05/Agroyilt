'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const f = require('./helpers/flow');
const { BookingScheduler } = require('../services/bookingScheduler');

let ctx, w;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => { await h.clearDb(); h.fakeIo.reset(); w = await f.world(ctx); });

/** A broadcast-style booking that two vendors were alerted about (legacy/open request path). */
const openRequest = async (vendors) => {
  const b = await h.M('Booking').create({
    bookingNumber: `T${Date.now()}${Math.floor(Math.random() * 1e4)}`, userId: w.farmer._id, serviceId: w.eq._id,
    serviceName: 'Tractor', serviceCategory: 'Agriculture', categoryId: w.cat._id, status: 'searching',
    scheduledDate: new Date(Date.now() + 2 * 864e5), scheduledTime: '09:00', timeSlot: { start: '09:00', end: '11:00' },
    rental_type: 'hourly', basePrice: 1200, finalAmount: 1309, vendorId: null,
    notifiedVendors: vendors.map(v => v._id), waveStartedAt: new Date(),
    address: { addressLine1: 'Secret Lane 9', city: 'Pune', state: 'MH', pincode: '411001', lat: 18.5234, lng: 73.8567 }
  });
  for (const v of vendors) {
    await h.M('BookingRequest').create({ bookingId: b._id, vendorId: v._id, status: 'PENDING', expiresAt: new Date(Date.now() + 15 * 60000) });
  }
  return b;
};

describe('acceptBooking', () => {
  it('only one of several alerted vendors can win a concurrent accept', async () => {
    const v2 = await h.make.vendor(); const v3 = await h.make.vendor();
    const b = await openRequest([w.vendor, v2, v3]);
    const res = await Promise.all([w.vendor, v2, v3].map(v => f.accept(w, b._id, v)));
    const winners = res.filter(r => r.status === 200);
    assert.equal(winners.length, 1, res.map(r => r.status).join(','));
    assert.ok(res.filter(r => r.status !== 200).every(r => [409, 400].includes(r.status)));
    const after = await h.M('Booking').findById(b._id);
    assert.equal(after.status, 'confirmed');
    assert.ok(after.vendorId);
    // the losers' popups are dismissed, requests expired
    const reqs = await h.M('BookingRequest').find({ bookingId: b._id });
    assert.equal(reqs.filter(r => r.status === 'ACCEPTED').length, 1);
    assert.equal(reqs.filter(r => r.status === 'EXPIRED').length, 2);
    assert.ok(h.fakeIo.emitted.filter(e => e.event === 'booking_taken').length >= 2);
  });

  it('refuses a vendor who was never alerted (cannot snipe someone else\'s request)', async () => {
    const outsider = await h.make.vendor();
    const b = await openRequest([w.vendor]);
    const r = await f.accept(w, b._id, outsider);
    assert.equal(r.status, 403);
    assert.equal((await h.M('Booking').findById(b._id)).status, 'searching');
  });

  it('refuses a targeted booking for a different vendor', async () => {
    const id = await f.newBooking(w);
    const other = await h.make.vendor();
    const r = await f.accept(w, id, other);
    assert.equal(r.status, 403);
  });

  it('refuses expired requests, unapproved/blocked vendors, and unknown ids', async () => {
    const id = await f.newBooking(w);
    await h.M('BookingRequest').updateOne({ bookingId: id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await f.accept(w, id)).status, 410);
    await h.M('BookingRequest').updateOne({ bookingId: id }, { $set: { expiresAt: new Date(Date.now() + 60000) } });

    await h.M('Vendor').updateOne({ _id: w.vendor._id }, { $set: { 'wallet.isBlocked': true } });
    assert.equal((await f.accept(w, id)).status, 403);
    await h.M('Vendor').updateOne({ _id: w.vendor._id }, { $set: { 'wallet.isBlocked': false, approvalStatus: 'pending' } });
    // a pending vendor is stopped by the auth middleware (suspended/rejected) or the eligibility check
    assert.ok([403].includes((await f.accept(w, id)).status));
    await h.M('Vendor').updateOne({ _id: w.vendor._id }, { $set: { approvalStatus: 'approved' } });

    assert.equal((await f.accept(w, 'not-an-id')).status, 404);
    assert.equal((await f.accept(w, new (h.mongoose.Types.ObjectId)())).status, 404);
    assert.equal((await f.accept(w, id)).status, 200, 'still acceptable once the problems are gone');
  });

  it('cannot accept the same booking twice or accept a cancelled one', async () => {
    const id = await f.newBooking(w);
    assert.equal((await f.accept(w, id)).status, 200);
    assert.equal((await f.accept(w, id)).status, 400);
    const id2 = await f.newBooking(w, { scheduledDate: h.dateIn(3) });
    await w.asFarmer(w.api.post(`/api/user/bookings/${id2}/cancel`)).send({});
    assert.ok([400, 410].includes((await f.accept(w, id2)).status), 'a cancelled request is gone');
    assert.equal((await h.M('Booking').findById(id2)).status, 'cancelled');
  });

  it('refuses an overlapping job the vendor already holds', async () => {
    const id1 = await f.newBooking(w);
    await f.accept(w, id1);
    // craft a second pending request on the same slot for the same vendor (bypassing creation-time checks)
    const b = await openRequest([w.vendor]);
    await h.M('Booking').updateOne({ _id: b._id }, { $set: { scheduledDate: (await h.M('Booking').findById(id1)).scheduledDate, equipmentId: w.eq._id } });
    const r = await f.accept(w, b._id);
    assert.equal(r.status, 409);
    assert.match(r.body.message, /overlapping/i);
  });

  it('gives standalone machinery a handover OTP at accept and hides it from the vendor', async () => {
    const id = await f.newBooking(w);
    const r = await f.accept(w, id);
    const b = await h.M('Booking').findById(id);
    assert.match(b.driver_start_otp, /^\d{4}$/);
    assert.equal(r.body.data.driver_start_otp, '••••');
  });
});

describe('rejectBooking', () => {
  it('a targeted reject closes the request, keeps the advance for a re-pick and tells the farmer', async () => {
    const id = await f.newBooking(w);
    const r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/reject`)).send({ reason: 'busy' });
    assert.equal(r.status, 200);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'rejected');
    assert.equal(b.cancelledBy, 'vendor');
    assert.equal(b.rejectionReason, 'busy');
    assert.equal((await h.M('BookingRequest').findOne({ bookingId: id })).status, 'REJECTED');
    const ev = h.fakeIo.sentTo(`user_${w.farmer._id}`).find(e => e.event === 'vendor_rejected');
    assert.equal(ev.payload.canReselect, true);
  });

  it('one vendor declining an open request leaves it open for the others', async () => {
    const v2 = await h.make.vendor();
    const b = await openRequest([w.vendor, v2]);
    const r = await w.asVendor(w.api.post(`/api/vendors/bookings/${b._id}/reject`)).send({});
    assert.equal(r.status, 200);
    assert.equal((await h.M('Booking').findById(b._id)).status, 'searching');
    assert.equal((await f.accept(w, b._id, v2)).status, 200);
  });

  it('a late reject never overwrites an accepted booking', async () => {
    const id = await f.newBooking(w);
    await f.accept(w, id);
    const r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/reject`)).send({});
    assert.equal(r.status, 200);
    assert.notEqual((await h.M('Booking').findById(id)).status, 'rejected');
  });

  it('rejecting a stranger\'s booking is refused, double reject is harmless', async () => {
    const id = await f.newBooking(w);
    const other = await h.make.vendor();
    assert.equal((await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/reject`), other).send({})).status, 404);
    assert.equal((await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/reject`)).send({})).status, 200);
    assert.equal((await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/reject`)).send({})).status, 200);
  });

  it('the legacy equipment endpoint behaves exactly like the main one (no status bypass)', async () => {
    const id = await f.newBooking(w);
    let r = await w.asVendor(w.api.put(`/api/vendors/equipment/bookings/${id}/respond`)).send({ status: 'accepted' });
    assert.equal(r.status, 200);
    // it can no longer "accept" a cancelled / finished booking
    await h.M('Booking').updateOne({ _id: id }, { $set: { status: 'cancelled' } });
    r = await w.asVendor(w.api.put(`/api/vendors/equipment/bookings/${id}/respond`)).send({ status: 'accepted' });
    assert.equal(r.status, 400);
    r = await w.asVendor(w.api.put(`/api/vendors/equipment/bookings/${id}/respond`)).send({ status: 'bogus' });
    assert.equal(r.status, 400);
  });
});

describe('what a vendor can see', () => {
  it('open requests hide the customer phone/email/street address until accepted', async () => {
    const b = await openRequest([w.vendor]);
    let r = await w.asVendor(w.api.get(`/api/vendors/bookings/${b._id}`));
    assert.equal(r.status, 200);
    const txt = JSON.stringify(r.body);
    assert.ok(!txt.includes('Secret Lane 9'));
    assert.ok(!txt.includes(w.farmer.phone));
    assert.equal(r.body.data.address.city, 'Pune');
    assert.equal(r.body.data.address.lat, 18.52, 'coordinates are rounded');

    await f.accept(w, b._id);
    r = await w.asVendor(w.api.get(`/api/vendors/bookings/${b._id}`));
    assert.ok(JSON.stringify(r.body).includes('Secret Lane 9'));
    assert.ok(JSON.stringify(r.body).includes(w.farmer.phone));
  });

  it('a vendor who was not alerted gets 404, and cannot list the request', async () => {
    const outsider = await h.make.vendor();
    const b = await openRequest([w.vendor]);
    assert.equal((await w.asVendor(w.api.get(`/api/vendors/bookings/${b._id}`), outsider)).status, 404);
    const list = await w.asVendor(w.api.get('/api/vendors/bookings'), outsider);
    assert.equal(list.body.data.length, 0);
  });

  it('the list drops requests the vendor already declined and never shows other vendors\' jobs', async () => {
    const v2 = await h.make.vendor();
    const b = await openRequest([w.vendor, v2]);
    await w.asVendor(w.api.post(`/api/vendors/bookings/${b._id}/reject`)).send({});
    assert.equal((await w.asVendor(w.api.get('/api/vendors/bookings'))).body.data.length, 0);
    assert.equal((await w.asVendor(w.api.get('/api/vendors/bookings'), v2)).body.data.length, 1);
    const id = await f.newBooking(w);
    assert.equal((await w.asVendor(w.api.get(`/api/vendors/bookings/${id}`), v2)).status, 404);
  });

  it('pending (reconnect) feed only returns live, unexpired requests', async () => {
    const live = await f.newBooking(w);
    const stale = await f.newBooking(w, { scheduledDate: h.dateIn(3) });
    await h.M('BookingRequest').updateOne({ bookingId: stale }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await w.asVendor(w.api.get('/api/vendors/bookings/pending'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.map(x => String(x.bookingId)), [String(live)]);
    assert.equal(r.body.data[0].customerPhone, undefined);
  });

  it('pagination is bounded', async () => {
    const r = await w.asVendor(w.api.get('/api/vendors/bookings?limit=100000&page=-4'));
    assert.equal(r.status, 200);
    assert.equal(r.body.pagination.limit, 100);
    assert.equal(r.body.pagination.page, 1);
  });
});

describe('BookingScheduler', () => {
  const run = () => new BookingScheduler(h.fakeIo).processTimeouts();
  const age = (id, minutes, extra = {}) => h.M('Booking').updateOne({ _id: id }, { $set: { waveStartedAt: new Date(Date.now() - minutes * 60000), ...extra } });

  it('times out an unanswered targeted request after 15 minutes and tells both sides', async () => {
    const id = await f.newBooking(w);
    await run();
    assert.equal((await h.M('Booking').findById(id)).status, 'requested', 'still within the window');
    await age(id, 16);
    await run();
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'rejected');
    assert.equal(b.cancelledBy, 'system');
    assert.equal((await h.M('BookingRequest').findOne({ bookingId: id })).status, 'EXPIRED');
    assert.ok(h.fakeIo.sentTo(`user_${w.farmer._id}`).some(e => e.event === 'vendor_rejected' && e.payload.canReselect));
    assert.ok(h.fakeIo.sentTo(`vendor_${w.vendor._id}`).some(e => e.event === 'booking_taken'));
  });

  it('closes orphaned SEARCHING bookings that no vendor was ever alerted about', async () => {
    const b = await openRequest([]);
    await age(b._id, 20);
    await run();
    assert.equal((await h.M('Booking').findById(b._id)).status, 'rejected');
  });

  it('never overwrites a booking the vendor accepted in the meantime', async () => {
    const id = await f.newBooking(w);
    await age(id, 30);
    await f.accept(w, id); // accept lands before the sweep
    await run();
    assert.equal((await h.M('Booking').findById(id)).status, 'confirmed');
  });

  it('auto-closes REJECTED bookings after 24h and refunds a paid advance', async () => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay' });
    await h.M('Booking').updateOne({ _id: id }, { $set: { status: 'requested', requestHeldForPayment: false, paymentStatus: 'success', paymentMethod: 'razorpay', advancePaidAmount: 1309 } });
    await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/reject`)).send({});
    await run();
    assert.equal((await h.M('Booking').findById(id)).status, 'rejected', 'grace period: farmer may re-pick');
    await h.M('Booking').updateOne({ _id: id }, { $set: { cancelledAt: new Date(Date.now() - 25 * 3600000) } });
    await run();
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'cancelled');
    assert.equal(b.paymentStatus, 'refunded');
    assert.equal((await f.userWallet(w.farmer)).balance, 1309);
    await run(); // idempotent
    assert.equal((await f.userWallet(w.farmer)).balance, 1309);
  });
});

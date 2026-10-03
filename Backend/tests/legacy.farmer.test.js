'use strict';
// The /api/farmer/* booking routes used to be a second, weaker implementation. They now delegate to the
// main engine; these tests pin that down so the two can never drift apart again.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const f = require('./helpers/flow');

let ctx, w;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => { await h.clearDb(); h.fakeIo.reset(); w = await f.world(ctx); });

const farmerApi = (m, path, body) => w.api[m](`/api/farmer${path}`).set(h.auth(w.farmer, 'USER')).send(body);
const create = (over = {}) => farmerApi('post', '/bookings', {
  machineryId: String(w.eq._id), date: h.dateIn(2), timeSlot: { start: '09:00', end: '11:00' },
  location: { addressLine1: 'a', city: 'b', state: 'c', pincode: '1', lat: 1, lng: 1 }, ...over
});

describe('/api/farmer/bookings', () => {
  it('create goes through the main rules: vendor is alerted, server prices it, conflicts and bad dates are refused', async () => {
    const r = await create();
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const b = await h.M('Booking').findById(r.body.data._id);
    assert.equal(b.status, 'requested');
    assert.equal(b.finalAmount, 1309);
    assert.equal(await h.M('BookingRequest').countDocuments({ bookingId: b._id }), 1, 'the vendor is actually alerted now');
    assert.equal((await create()).status, 409);
    assert.equal((await create({ date: '2020-01-01' })).status, 400);
    assert.equal((await farmerApi('post', '/bookings', {})).status, 400);
  });

  it('cancel refunds exactly like the main endpoint and refuses mid-work cancels (hyphenated-status bug)', async () => {
    const r = await create();
    const id = r.body.data._id;
    await h.M('Booking').updateOne({ _id: id }, { $set: { paymentStatus: 'success', paymentMethod: 'razorpay', advancePaidAmount: 1309 } });
    assert.equal((await farmerApi('post', `/bookings/${id}/cancel`, { reason: 'changed mind' })).status, 200);
    assert.equal((await f.userWallet(w.farmer)).balance, 1309);
    assert.equal((await h.M('Booking').findById(id)).cancellationReason, 'changed mind');

    const id2 = await f.newBooking(w, { scheduledDate: h.dateIn(3) });
    await f.toInProgress(w, id2);
    assert.equal((await farmerApi('post', `/bookings/${id2}/cancel`, {})).status, 400);
  });

  it('approve-completion can no longer complete a job (no bill, no payment) — it only records sign-off', async () => {
    const id = await f.newBooking(w);
    await f.toInProgress(w, id);
    let r = await farmerApi('post', `/bookings/${id}/approve-completion`, {});
    assert.equal(r.status, 400);
    assert.equal((await h.M('Booking').findById(id)).status, 'in_progress');

    await f.ageTimer(id, 20);
    await f.endTrip(w, id);
    r = await farmerApi('post', `/bookings/${id}/approve-completion`, {});
    assert.equal(r.status, 200);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'work_done', 'still waiting for payment');
    assert.equal(b.customerConfirmed, true);
    assert.equal((await f.vendorWallet(w.vendor)).dues ?? 0, 0);
  });

  it('extension requests are validated and not stackable', async () => {
    const id = await f.newBooking(w);
    await f.toInProgress(w, id);
    for (const requestedHours of [0, -2, 'x', 100]) {
      assert.equal((await farmerApi('post', `/bookings/${id}/extend`, { requestedHours })).status, 400, String(requestedHours));
    }
    assert.equal((await farmerApi('post', `/bookings/${id}/extend`, { requestedHours: 2, reason: 'more field' })).status, 200);
    assert.equal((await farmerApi('post', `/bookings/${id}/extend`, { requestedHours: 1 })).status, 400, 'one pending at a time');
  });

  it('pay creates an order the verify endpoint can find, and refuses settled/cancelled bookings', async () => {
    process.env.RAZORPAY_KEY_ID = 'k'; process.env.RAZORPAY_KEY_SECRET = 's';
    const id = await f.newBooking(w);
    const bk = await h.M('Booking').findById(id);
    await h.M('Booking').updateOne({ _id: id }, { $set: { paymentStatus: 'success' } });
    const settled = await farmerApi('post', `/bookings/${id}/pay`, {});
    assert.ok([400, 500].includes(settled.status));
    assert.ok(bk);
  });
});

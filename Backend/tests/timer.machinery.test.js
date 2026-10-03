'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const f = require('./helpers/flow');

let ctx, w, stranger;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => { await h.clearDb(); h.fakeIo.reset(); w = await f.world(ctx); stranger = await h.make.farmer(); });

const T = (verb, id, who, body = {}) => {
  const m = verb === 'status' ? 'get' : 'post';
  const r = w.api[m](`/api/bookings/service-timer/${id}/${verb}`).set(who);
  return m === 'get' ? r : r.send(body);
};
const asV = () => h.auth(w.vendor, 'VENDOR');
const asF = (u = w.farmer) => h.auth(u, 'USER');
const running = async () => { const id = await f.newBooking(w); await f.toInProgress(w, id); return id; };
const timerOf = async (id) => (await h.M('Booking').findById(id).select('+resumeOtp')).serviceTimer;

describe('Service timer — access', () => {
  it('needs auth, and only the booking\'s own farmer/vendor/admin can touch it', async () => {
    const id = await running();
    assert.equal((await w.api.get(`/api/bookings/service-timer/${id}/status`)).status, 401);
    const otherVendor = await h.make.vendor();
    for (const verb of ['status', 'pause', 'resume', 'end', 'start']) {
      assert.equal((await T(verb, id, asF(stranger))).status, 403, `farmer stranger ${verb}`);
      assert.equal((await T(verb, id, h.auth(otherVendor, 'VENDOR'))).status, 403, `vendor stranger ${verb}`);
    }
  });

  it('a farmer id can never be mistaken for a vendor id (role is part of the check)', async () => {
    const id = await running();
    // a Vendor token whose id equals the farmer's id must not act as the farmer
    const forged = h.token({ _id: w.farmer._id }, 'VENDOR');
    const r = await w.api.get(`/api/bookings/service-timer/${id}/status`).set({ Authorization: `Bearer ${forged}` });
    assert.ok([401, 403].includes(r.status));
  });

  it('the farmer cannot start billing; start needs the work to be in progress', async () => {
    const id = await f.newBooking(w);
    await f.accept(w, id);
    assert.equal((await T('start', id, asV())).status, 400, 'not started yet');
    await f.toInProgress(w, id);
    assert.equal((await T('start', id, asF())).status, 403);
    const again = await T('start', id, asV());
    assert.equal(again.status, 200, 'already running is a harmless no-op');
    assert.equal((await timerOf(id)).logs.filter(l => l.action === 'START').length, 1);
  });
});

describe('Service timer — pause / resume rules', () => {
  it('vendor pause needs the farmer\'s resume OTP; wrong tries are limited; the OTP is single-use', async () => {
    const id = await running();
    const p = await T('pause', id, asV(), { reason: 'refueling' });
    assert.equal(p.status, 200);
    assert.equal(p.body.data.resumeOtp, undefined, 'never sent to the vendor');
    const otp = (await timerOf(id)).resumeOtp;
    assert.match(otp, /^\d{4}$/);
    // farmer got it
    const note = await h.M('Notification').findOne({ userId: w.farmer._id, type: 'service_timer_paused' });
    assert.ok(note.message.includes(otp));
    assert.ok(!JSON.stringify(h.fakeIo.emitted.filter(e => e.room.startsWith('vendor_') || e.room.startsWith('booking_'))).includes(`"${otp}"`), 'resume OTP not broadcast to vendor/shared rooms');

    assert.equal((await T('resume', id, asV())).status, 400, 'no OTP');
    const wrong = otp === '1111' ? '2222' : '1111';
    assert.equal((await T('resume', id, asV(), { otp: wrong })).status, 400);
    assert.equal((await timerOf(id)).status, 'PAUSED');
    assert.equal((await T('resume', id, asV(), { otp })).status, 200);
    assert.equal((await timerOf(id)).status, 'RUNNING');
    assert.equal((await timerOf(id)).resumeOtp, null, 'consumed');
    // the old OTP cannot resume a later pause
    await T('pause', id, asV());
    assert.equal((await T('resume', id, asV(), { otp })).status, otp === (await timerOf(id)).resumeOtp ? 200 : 400);
  });

  it('a farmer-initiated pause can be resumed by the vendor without an OTP (no stalling by walking away)', async () => {
    const id = await running();
    assert.equal((await T('pause', id, asF(), { reason: 'break' })).status, 200);
    assert.equal((await timerOf(id)).lastPausedBy, 'farmer');
    assert.equal((await T('resume', id, asV())).status, 200);
    assert.equal((await timerOf(id)).status, 'RUNNING');
  });

  it('state guards: cannot pause twice, resume when running, pause when not in progress', async () => {
    const id = await running();
    assert.equal((await T('resume', id, asV())).status, 400);
    assert.equal((await T('pause', id, asV())).status, 200);
    assert.equal((await T('pause', id, asV())).status, 400);
    const id2 = await f.newBooking(w, { scheduledDate: h.dateIn(3) });
    await f.accept(w, id2);
    assert.equal((await T('pause', id2, asV())).status, 400);
  });

  it('free-text input is normalised (reason whitelist, notes length)', async () => {
    const id = await running();
    await T('pause', id, asV(), { reason: '<script>', notes: 'x'.repeat(5000) });
    const t = await timerOf(id);
    assert.equal(t.lastPauseReason, 'other');
    assert.equal(t.lastPauseNotes.length, 500);
  });

  it('paused time is not billed', async () => {
    const id = await running();
    // 60 min running → pause → 45 min paused → resume → 0 more
    await f.ageTimer(id, 60);
    await T('pause', id, asV(), { reason: 'machine_issue' });
    const otp = (await timerOf(id)).resumeOtp;
    await h.M('Booking').updateOne({ _id: id }, { $set: { 'serviceTimer.currentPauseStartedAt': new Date(Date.now() - 45 * 60000) } });
    await T('resume', id, asV(), { otp });
    // now end immediately
    const r = await f.endTrip(w, id);
    assert.equal(r.status, 200);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.serviceTimer.billingSummary.totalActiveMinutes, 60);
    assert.equal(b.serviceTimer.billingSummary.totalPausedMinutes, 45);
    assert.equal(b.finalAmount, Math.round((60 * 10 + 49) * 1.05 * 100) / 100);
  });
});

describe('Service timer — ending through the timer endpoint', () => {
  it('provider needs the END otp; farmer can end; partial end is recorded; ending twice is refused', async () => {
    const id = await running();
    await f.ageTimer(id, 40);
    assert.equal((await T('end', id, asV(), {})).status, 400, 'no otp');
    assert.equal((await T('end', id, asV(), { end_otp: '0000' })).status, 400, 'wrong otp');
    const { driver_end_otp } = await f.secret(id);
    const r = await T('end', id, asV(), { end_otp: driver_end_otp, isPartial: true, reason: 'engine failure' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.paymentOtp, undefined, 'vendor response never carries the payment OTP');
    const b = await f.secret(id, '+paymentOtp');
    assert.equal(b.status, 'work_done');
    assert.equal(b.serviceTimer.billingSummary.isPartialEnd, true);
    assert.equal(b.serviceTimer.billingSummary.partialEndReason, 'engine failure');
    assert.equal(b.serviceTimer.logs.at(-1).action, 'PARTIAL_END');
    assert.ok(b.paymentOtp && b.paymentOtp !== driver_end_otp);
    assert.equal((await T('end', id, asV(), { end_otp: driver_end_otp })).status, 400);
    assert.equal(await h.M('VendorBill').countDocuments({ bookingId: id }), 1);
    // farmer got the payment OTP in their own room only
    assert.ok(h.fakeIo.sentTo(`user_${w.farmer._id}`).some(e => JSON.stringify(e.payload).includes(b.paymentOtp)));
    assert.ok(!h.fakeIo.emitted.filter(e => !e.room.startsWith('user_') && !e.room.startsWith('user:')).some(e => JSON.stringify(e.payload).includes(`"${b.paymentOtp}"`)));
  });

  it('a farmer can end the service without an OTP (they are the approver) and sees the payment OTP', async () => {
    const id = await running();
    await f.ageTimer(id, 15);
    const r = await T('end', id, asF(), {});
    assert.equal(r.status, 200);
    assert.ok(r.body.data.paymentOtp);
  });

  it('concurrent ends bill once', async () => {
    const id = await running();
    await f.ageTimer(id, 25);
    const { driver_end_otp } = await f.secret(id);
    const rs = await Promise.all([1, 2, 3].map(() => T('end', id, asV(), { end_otp: driver_end_otp })));
    assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join(','));
    assert.equal(await h.M('VendorBill').countDocuments({ bookingId: id }), 1);
  });

  it('prepaid booking ended via the timer endpoint reconciles and credits once', async () => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay' });
    await h.M('Booking').updateOne({ _id: id }, { $set: { status: 'requested', requestHeldForPayment: false, paymentStatus: 'success', paymentMethod: 'razorpay', advancePaidAmount: 1309 } });
    await f.toInProgress(w, id);
    await f.ageTimer(id, 30);
    const { driver_end_otp } = await f.secret(id);
    assert.equal((await T('end', id, asV(), { end_otp: driver_end_otp })).status, 200);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'completed');
    assert.equal((await f.userWallet(w.farmer)).balance, 1309 - 366.45);
    assert.equal(await h.M('Transaction').countDocuments({ bookingId: id, type: 'earnings_credit' }), 1);
  });

  it('timer rate for equipment without a price list = booking total ÷ booked minutes (not ÷ 60)', async () => {
    const { resolveRates } = require('../controllers/bookingControllers/serviceTimerController');
    const r = await resolveRates({ serviceTimer: {}, basePrice: 1200, durationMinutes: 120, visitingCharges: 0, selectedImplements: [] });
    assert.equal(r.ratePerMinute, 10);
    const r2 = await resolveRates({ serviceTimer: {}, basePrice: 2400, estimatedDuration: 4, selectedImplements: [] });
    assert.equal(r2.ratePerMinute, 10);
    const r3 = await resolveRates({ serviceTimer: {}, selectedImplements: [] });
    assert.equal(r3.ratePerMinute, 15, 'documented last-resort default');
  });
});

describe('Extensions', () => {
  const addExt = async (id, hours = 2) => {
    await h.M('Booking').updateOne({ _id: id }, { $push: { extensionRequests: { requestedHours: hours, chargeAmount: 0, status: 'pending' } } });
    return (await h.M('Booking').findById(id)).extensionRequests.at(-1)._id;
  };
  const approve = (id, rid, v = asV()) => w.api.post(`/api/vendors/bookings/${id}/extension/${rid}/approve`).set(v).send({});
  const reject = (id, rid, v = asV()) => w.api.post(`/api/vendors/bookings/${id}/extension/${rid}/reject`).set(v).send({});

  it('approval prices from the rate card, adds to the booking and notifies the farmer; once only', async () => {
    const id = await running();
    const rid = await addExt(id, 2);
    const base = (await h.M('Booking').findById(id)).basePrice;
    const r = await approve(id, rid);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const b = await h.M('Booking').findById(id);
    assert.equal(b.extensionChargesTotal, 1200);
    assert.equal(b.basePrice, base + 1200);
    assert.ok(await h.M('Notification').findOne({ userId: w.farmer._id, type: 'extension_approved' }));
    assert.equal((await approve(id, rid)).status, 400, 'already processed');
  });

  it('is refused unless in progress, for bad hours, and for other vendors; rejection notifies', async () => {
    const id = await f.newBooking(w);
    await f.accept(w, id);
    const rid = await addExt(id);
    assert.equal((await approve(id, rid)).status, 400, 'not in progress');
    const id2 = await running().catch(() => null);
    const id3 = await f.newBooking(w, { scheduledDate: h.dateIn(3) });
    await f.toInProgress(w, id3);
    const bad = await addExt(id3, 99);
    assert.equal((await approve(id3, bad)).status, 400, 'absurd duration');
    const good = await addExt(id3, 1);
    const other = await h.make.vendor();
    assert.equal((await approve(id3, good, h.auth(other, 'VENDOR'))).status, 404);
    assert.equal((await reject(id3, good)).status, 200);
    assert.ok(await h.M('Notification').findOne({ userId: w.farmer._id, type: 'extension_rejected' }));
    assert.equal((await reject(id3, good)).status, 400);
  });
});

describe('Vendor-app machinery endpoints (/vendors/equipment/bookings/:id/start|complete)', () => {
  const start = (id, body, who = asV()) => w.api.post(`/api/vendors/equipment/bookings/${id}/start`).set(who).send(body);
  const complete = (id, body, who = asV()) => w.api.post(`/api/vendors/equipment/bookings/${id}/complete`).set(who).send(body);

  it('share the verified flow: start needs the handover OTP, complete bills once and issues a PAYMENT otp', async () => {
    const id = await f.newBooking(w);
    await f.accept(w, id);
    await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/start`));
    const v = await f.secret(id);
    await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/visit/verify`)).send({ otp: v.visitOtp });
    const { driver_start_otp } = await f.secret(id);

    assert.equal((await start(id, { otp: '0000', startKmPhoto: 'a.jpg' })).status, 400);
    assert.equal((await start(id, { otp: driver_start_otp, startKmPhoto: 'a.jpg' })).status, 200);
    assert.equal((await start(id, { otp: driver_start_otp })).status, 400, 'cannot start twice');
    let b = await f.secret(id);
    assert.equal(b.status, 'in_progress');
    assert.equal(b.serviceTimer.status, 'RUNNING');

    await f.ageTimer(id, 90);
    const r = await complete(id, { endKmPhoto: 'b.jpg', workUnits: 3, evidencePhoto: 'c.jpg' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(JSON.stringify(r.body).match(/\d{4}/g)?.includes((await f.secret(id, '+paymentOtp')).paymentOtp) && r.body.data.paymentOtp !== '••••', false, 'masked for the vendor');
    b = await f.secret(id, '+paymentOtp');
    assert.equal(b.status, 'work_done');
    assert.equal(b.finalAmount, 996.45, 'billed from the live timer, not the original estimate');
    assert.equal(b.end_kilometer_photo, 'b.jpg');
    assert.equal(b.work_evidence_photo, 'c.jpg', 'evidence now persists (schema field)');
    assert.equal(b.workUnits, 3);
    assert.equal(await h.M('VendorBill').countDocuments({ bookingId: id }), 1);
    assert.equal((await complete(id, { endKmPhoto: 'again.jpg' })).status, 400, 'no second bill');

    const pay = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/payment/collect`)).send({ otp: b.paymentOtp });
    assert.equal(pay.status, 200);
    assert.equal((await f.vendorWallet(w.vendor)).dues, 996.45, 'cash collected = the real bill');
  });

  it('cannot complete before starting, and other vendors cannot drive the booking', async () => {
    const id = await f.newBooking(w);
    await f.accept(w, id);
    assert.equal((await complete(id, { endKmPhoto: 'x' })).status, 400);
    const other = await h.make.vendor();
    assert.equal((await start(id, { otp: '1234' }, h.auth(other, 'VENDOR'))).status, 404);
    assert.equal((await complete(id, {}, h.auth(other, 'VENDOR'))).status, 404);
    assert.equal((await w.api.post(`/api/vendors/equipment/bookings/${id}/start`).set(asF()).send({})).status, 403);
  });
});

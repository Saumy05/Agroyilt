'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const f = require('./helpers/flow');

let ctx, w;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => { await h.clearDb(); h.fakeIo.reset(); w = await f.world(ctx); });

describe('Machinery booking — full cash lifecycle', () => {
  it('runs request → accept → journey → visit → start → timer → end → pay → review', async () => {
    const id = await f.newBooking(w);
    let b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'requested');
    assert.equal(String(b.vendorId), String(w.vendor._id));

    // accept
    let r = await f.accept(w, id);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.status, 'confirmed');
    // vendor must NOT be marked ON_JOB just because they accepted a future job
    assert.notEqual((await h.M('Vendor').findById(w.vendor._id)).availability, 'ON_JOB');

    // journey, visit, start
    b = await f.toInProgress(w, id);
    assert.equal(b.status, 'in_progress');
    assert.equal(b.serviceTimer.status, 'RUNNING');
    assert.equal(b.driver_start_otp, null, 'start OTP is single-use');
    assert.ok(b.driver_end_otp, 'end OTP issued');
    assert.equal((await h.M('Vendor').findById(w.vendor._id)).availability, 'ON_JOB');

    // 90 minutes of work, then end
    await f.ageTimer(id, 90);
    r = await f.endTrip(w, id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    b = await f.secret(id);
    assert.equal(b.status, 'work_done');
    assert.equal(b.paymentStatus, 'pending');
    // 90 min × ₹10/min = 900 + ₹49 base = 949; +5% GST = 996.45
    assert.equal(b.finalAmount, 996.45);
    assert.equal(b.balanceDue, 996.45);
    assert.ok(b.paymentOtp, 'payment OTP issued');
    assert.notEqual(b.paymentOtp, b.driver_end_otp ?? 'x');
    const bill = await h.M('VendorBill').findOne({ bookingId: id });
    assert.equal(bill.totalServiceBase, 949);
    assert.equal(bill.vendorTotalEarning, 854.1);
    assert.equal(bill.earningsCredited, false, 'vendor is not credited before payment');

    // pay in cash with the PAYMENT OTP
    r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/payment/collect`)).send({ otp: b.paymentOtp });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    b = await f.secret(id);
    assert.equal(b.status, 'completed');
    assert.equal(b.paymentStatus, 'collected_by_vendor');
    assert.equal(b.cashCollected, true);
    assert.equal(b.balanceDue, 0);

    const wal = await f.vendorWallet(w.vendor);
    assert.equal(wal.dues, 996.45);
    assert.equal(wal.earnings, 854.1);
    assert.equal(wal.totalCashCollected, 996.45);
    assert.equal((await h.M('Vendor').findById(w.vendor._id)).availability, 'AVAILABLE');

    // review is now allowed, once
    r = await w.asFarmer(w.api.post(`/api/user/bookings/${id}/review`)).send({ rating: 4, review: 'ok' });
    assert.equal(r.status, 200);
    r = await w.asFarmer(w.api.post(`/api/user/bookings/${id}/review`)).send({ rating: 1 });
    assert.equal(r.status, 400);
    assert.equal((await h.M('Vendor').findById(w.vendor._id)).rating, 4);
    assert.equal((await h.M('Vendor').findById(w.vendor._id)).totalReviews, 1);
  });

  it('never lets the end OTP (or start OTP) confirm a cash payment', async () => {
    const id = await f.newBooking(w);
    await f.toInProgress(w, id);
    const before = await f.secret(id, '+paymentOtp');
    const endOtp = before.driver_end_otp;
    await f.ageTimer(id, 30);
    assert.equal((await f.endTrip(w, id)).status, 200);

    const r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/payment/collect`)).send({ otp: endOtp });
    assert.equal(r.status, 400);
    assert.equal((await h.M('Booking').findById(id)).status, 'work_done');
    assert.equal((await f.vendorWallet(w.vendor)).dues ?? 0, 0);
  });

  it('collecting cash twice (replay / double-tap) credits the vendor once', async () => {
    const id = await f.newBooking(w);
    await f.toInProgress(w, id);
    await f.ageTimer(id, 60);
    await f.endTrip(w, id);
    const { paymentOtp } = await f.secret(id, '+paymentOtp');

    const [a, b2] = await Promise.all([
      w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/payment/collect`)).send({ otp: paymentOtp }),
      w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/payment/collect`)).send({ otp: paymentOtp })
    ]);
    assert.deepEqual([a.status, b2.status].sort(), [200, 409]);
    const replay = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/payment/collect`)).send({ otp: paymentOtp });
    assert.equal(replay.status, 409);

    const wal = await f.vendorWallet(w.vendor);
    const bill = await h.M('VendorBill').findOne({ bookingId: id });
    assert.equal(wal.earnings, bill.vendorTotalEarning);
    assert.equal(wal.dues, bill.grandTotal);
    assert.equal(await h.M('Transaction').countDocuments({ bookingId: id, type: 'earnings_credit' }), 1);
    assert.equal(await h.M('Transaction').countDocuments({ bookingId: id, type: 'cash_collected' }), 1);
  });

  it('ending the trip twice does not bill or credit twice', async () => {
    const id = await f.newBooking(w, {}, w.farmer);
    await f.toInProgress(w, id);
    await f.ageTimer(id, 45);
    const { driver_end_otp } = await f.secret(id);
    const send = () => w.asVendor(w.api.post(`/api/vendors/bookings/${id}/trip/end`)).send({ end_kilometer_photo: 'x', driver_end_otp });
    const [a, b2] = await Promise.all([send(), send()]);
    assert.ok([a.status, b2.status].includes(200));
    assert.ok([a.status, b2.status].every(s => [200, 400, 409].includes(s)), `${a.status}/${b2.status}`);
    assert.equal(await h.M('VendorBill').countDocuments({ bookingId: id }), 1);
    const again = await send();
    assert.equal(again.status, 400);
  });

  it('wrong OTPs are counted and lock the booking after 5 attempts', async () => {
    const id = await f.newBooking(w);
    await f.accept(w, id);
    await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/start`));
    const real = (await f.secret(id)).visitOtp;
    const wrong = real === '1111' ? '2222' : '1111';

    for (let i = 0; i < 4; i++) {
      const r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/visit/verify`)).send({ otp: wrong });
      assert.equal(r.status, 400);
      assert.match(r.body.message, /attempt\(s\) left/);
    }
    let r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/visit/verify`)).send({ otp: wrong });
    assert.equal(r.status, 429);
    // even the CORRECT code is refused while locked
    r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/visit/verify`)).send({ otp: real });
    assert.equal(r.status, 429);
    assert.equal((await h.M('Booking').findById(id)).status, 'journey_started');

    // lock expires → correct code works
    await h.M('Booking').updateOne({ _id: id }, { $set: { otpLockedUntil: new Date(Date.now() - 1000) } });
    r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/visit/verify`)).send({ otp: real });
    assert.equal(r.status, 200);
  });

  it('cannot skip steps: start trip before visit, journey from wrong state, visit OTP replay', async () => {
    const id = await f.newBooking(w);
    // not accepted yet
    let r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/start`));
    assert.equal(r.status, 400);
    await f.accept(w, id);
    const { driver_start_otp } = await f.secret(id);
    r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/trip/start`)).send({ driver_start_otp });
    assert.equal(r.status, 400, 'driver-led machinery must reach the location first');
    // vendor cannot fast-forward statuses through the generic route
    for (const status of ['in_progress', 'work_done', 'visited']) {
      r = await w.asVendor(w.api.put(`/api/vendors/bookings/${id}/status`)).send({ status });
      assert.equal(r.status, 400, status);
    }
    r = await w.asVendor(w.api.put(`/api/vendors/bookings/${id}/status`)).send({ status: 'completed' });
    assert.equal(r.status, 400);
    // double journey start
    assert.equal((await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/start`))).status, 200);
    assert.equal((await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/start`))).status, 400);
  });

  it('end OTP only works from the right state and with the right code', async () => {
    const id = await f.newBooking(w);
    let r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/trip/end`)).send({ driver_end_otp: '1234' });
    assert.equal(r.status, 400, 'cannot end before starting');
    await f.toInProgress(w, id);
    r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/trip/end`)).send({ driver_end_otp: '0000', end_kilometer_photo: 'x' });
    assert.equal(r.status, 400);
    r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/trip/end`)).send({ end_kilometer_photo: 'x' });
    assert.equal(r.status, 400, 'missing OTP');
    assert.equal((await h.M('Booking').findById(id)).status, 'in_progress');
  });

  it('rejects absurd work units on billing', async () => {
    const id = await f.newBooking(w);
    await f.toInProgress(w, id);
    for (const workUnits of [-3, 0, 'abc', 1e9]) {
      const r = await f.endTrip(w, id, { workUnits });
      assert.equal(r.status, 400, String(workUnits));
    }
    assert.equal((await h.M('Booking').findById(id)).status, 'in_progress');
  });
});

describe('Secrets never reach the vendor', () => {
  it('vendor API responses and vendor socket rooms contain no real OTPs', async () => {
    const id = await f.newBooking(w);
    const vendorViews = [];
    let r = await f.accept(w, id); vendorViews.push(r.body);
    r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/start`)); vendorViews.push(r.body);
    let b = await f.secret(id);
    const visitOtp = b.visitOtp;
    r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/visit/verify`)).send({ otp: visitOtp }); vendorViews.push(r.body);
    b = await f.secret(id);
    const startOtp = b.driver_start_otp;
    r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/trip/start`)).send({ driver_start_otp: startOtp, start_kilometer_photo: 'x' }); vendorViews.push(r.body);
    b = await f.secret(id);
    const endOtp = b.driver_end_otp;
    vendorViews.push((await w.asVendor(w.api.get(`/api/vendors/bookings/${id}`))).body);
    vendorViews.push((await w.asVendor(w.api.get('/api/vendors/bookings'))).body);

    await f.ageTimer(id, 20);
    r = await f.endTrip(w, id); vendorViews.push(r.body);
    b = await f.secret(id, '+paymentOtp');
    const payOtp = b.paymentOtp;
    vendorViews.push((await w.asVendor(w.api.get(`/api/vendors/bookings/${id}`))).body);

    const real = [visitOtp, startOtp, endOtp, payOtp];
    for (const v of vendorViews) assert.deepEqual(f.leakedOtps(v, real), [], 'OTP leaked in a vendor response');

    // what each socket room received
    const toVendor = h.fakeIo.emitted.filter(e => e.room.startsWith('vendor_') || e.room.startsWith('booking_'));
    for (const e of toVendor) assert.deepEqual(f.leakedOtps(e.payload, real), [], `OTP leaked to ${e.room}/${e.event}`);

    // the FARMER does see their own codes
    const farmerRoom = h.fakeIo.emitted.filter(e => e.room.startsWith('user_'));
    assert.ok(f.leakedOtps(farmerRoom.map(e => e.payload), [visitOtp, payOtp]).length > 0);
  });

  it('service-timer status endpoint hides OTPs from the vendor but not from the farmer', async () => {
    const id = await f.newBooking(w);
    const b = await f.toInProgress(w, id);
    let r = await w.asVendor(w.api.get(`/api/bookings/service-timer/${id}/status`));
    assert.equal(r.status, 200);
    assert.equal(r.body.data.driver_end_otp, null);
    r = await w.asFarmer(w.api.get(`/api/bookings/service-timer/${id}/status`));
    assert.equal(r.body.data.driver_end_otp, b.driver_end_otp);
  });
});

'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const f = require('./helpers/flow');

let ctx, w, stranger, otherVendor;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => {
  await h.clearDb(); h.fakeIo.reset(); w = await f.world(ctx);
  stranger = await h.make.farmer(); otherVendor = await h.make.vendor();
});

/** Booking driven to WORK_DONE (bill generated, cash payment OTP issued). */
const workDone = async (over = {}, minutes = 60) => {
  const id = await f.newBooking(w, over);
  await f.toInProgress(w, id);
  await f.ageTimer(id, minutes);
  assert.equal((await f.endTrip(w, id)).status, 200);
  return id;
};
const cash = (verb, id, who, body = {}) => {
  const req = w.api.post(`/api/bookings/cash/${id}/${verb}`);
  return who ? req.set(who).send(body) : req.send(body);
};
const asV = (v = w.vendor) => h.auth(v, 'VENDOR');
const asF = (u = w.farmer) => h.auth(u, 'USER');

describe('Cash collection — who may call it', () => {
  it('needs authentication', async () => {
    const id = await workDone();
    assert.equal((await cash('initiate', id, null)).status, 401);
    assert.equal((await cash('confirm', id, null)).status, 401);
  });

  it('the FARMER cannot confirm their own payment even though they know the OTP', async () => {
    const id = await workDone();
    const { paymentOtp } = await f.secret(id, '+paymentOtp');
    const r = await cash('confirm', id, asF(), { otp: paymentOtp });
    assert.equal(r.status, 403);
    assert.equal((await cash('initiate', id, asF())).status, 403);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'work_done');
    assert.equal(b.cashCollected, false);
    assert.equal((await f.vendorWallet(w.vendor)).dues ?? 0, 0);
  });

  it('another vendor / a stranger farmer cannot initiate, confirm or read status', async () => {
    const id = await workDone();
    const { paymentOtp } = await f.secret(id, '+paymentOtp');
    for (const who of [asV(otherVendor), asF(stranger)]) {
      assert.equal((await cash('initiate', id, who)).status, 403);
      assert.equal((await cash('confirm', id, who, { otp: paymentOtp })).status, 403);
      assert.equal((await w.api.get(`/api/bookings/cash/${id}/status`).set(who)).status, 403);
    }
    assert.equal((await cash('customer-confirm', id, asF(stranger))).status, 403);
    assert.equal((await cash('customer-confirm', id, asV())).status, 403, 'vendors cannot confirm on the customer\'s behalf');
    assert.equal((await h.M('Booking').findById(id)).customerConfirmed, false);
    // the real parties can
    assert.equal((await w.api.get(`/api/bookings/cash/${id}/status`).set(asV())).status, 200);
    assert.equal((await w.api.get(`/api/bookings/cash/${id}/status`).set(asF())).status, 200);
    assert.equal((await cash('customer-confirm', id, asF())).status, 200);
  });

  it('malformed ids are a clean 404, not a crash', async () => {
    assert.equal((await cash('initiate', 'zzz', asV())).status, 404);
    assert.equal((await cash('confirm', 'zzz', asV(), { otp: '1' })).status, 404);
  });
});

describe('Cash collection — behaviour', () => {
  it('initiate ignores client amounts/items, re-issues the same payment OTP and never reuses the end OTP', async () => {
    const id = await workDone();
    const before = await f.secret(id, '+paymentOtp');
    const r = await cash('initiate', id, asV(), { totalAmount: 1, extraItems: [{ name: 'free', price: 0 }] });
    assert.equal(r.status, 200);
    const after = await f.secret(id, '+paymentOtp');
    assert.equal(after.finalAmount, before.finalAmount, 'bill amount is not client-controlled');
    assert.equal(after.paymentOtp, before.paymentOtp, 'stable OTP on retry');
    assert.equal(r.body.amountDue, before.finalAmount);
  });

  it('only works once the work is done, and only with the payment OTP', async () => {
    const id = await f.newBooking(w);
    await f.toInProgress(w, id);
    assert.equal((await cash('initiate', id, asV())).status, 400, 'still in progress');
    assert.equal((await cash('confirm', id, asV(), { otp: '1234' })).status, 400);

    const id2 = await workDone({ scheduledDate: h.dateIn(3) });
    const b = await f.secret(id2, '+paymentOtp');
    const wrong = b.paymentOtp === '0001' ? '0002' : '0001';
    for (let i = 0; i < 4; i++) assert.equal((await cash('confirm', id2, asV(), { otp: wrong })).status, 400);
    assert.equal((await cash('confirm', id2, asV(), { otp: wrong })).status, 429, '5th wrong attempt locks');
    assert.equal((await cash('confirm', id2, asV(), { otp: b.paymentOtp })).status, 429, 'even the right one while locked');
    await h.M('Booking').updateOne({ _id: id2 }, { $set: { otpLockedUntil: null } });
    assert.equal((await cash('confirm', id2, asV(), { otp: b.paymentOtp })).status, 200);
  });

  it('settles once through this route too (double submit, replay)', async () => {
    const id = await workDone();
    const { paymentOtp } = await f.secret(id, '+paymentOtp');
    const rs = await Promise.all([1, 2, 3].map(() => cash('confirm', id, asV(), { otp: paymentOtp })));
    assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join(','));
    assert.equal((await cash('confirm', id, asV(), { otp: paymentOtp })).status, 409);
    const bill = await h.M('VendorBill').findOne({ bookingId: id });
    const wal = await f.vendorWallet(w.vendor);
    assert.equal(wal.dues, bill.grandTotal);
    assert.equal(wal.earnings, bill.vendorTotalEarning);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'completed');
    assert.equal(b.paymentStatus, 'collected_by_vendor');
    assert.equal(b.cashCollectedBy, 'vendor', 'vendor role is recorded correctly');
    assert.equal(String(b.cashCollectorId), String(w.vendor._id));
  });

  it('refuses cash on a booking that is already paid (the old uppercase-SUCCESS bug)', async () => {
    const id = await workDone();
    await h.M('Booking').updateOne({ _id: id }, { $set: { paymentStatus: 'success' } });
    const { paymentOtp } = await f.secret(id, '+paymentOtp');
    assert.equal((await cash('initiate', id, asV())).status, 400);
    assert.equal((await cash('confirm', id, asV(), { otp: paymentOtp })).status, 409);
    assert.equal((await f.vendorWallet(w.vendor)).dues ?? 0, 0);
  });

  it('blocks the vendor when cash dues exceed the limit and then they cannot take new work', async () => {
    await h.M('Vendor').updateOne({ _id: w.vendor._id }, { $set: { 'wallet.cashLimit': 50 } });
    const id = await workDone();
    const { paymentOtp } = await f.secret(id, '+paymentOtp');
    await cash('confirm', id, asV(), { otp: paymentOtp });
    const v = await h.M('Vendor').findById(w.vendor._id);
    assert.equal(v.wallet.isBlocked, true);
    assert.match(v.wallet.blockReason, /Cash limit exceeded/);
    const r = await f.createBooking(w, { scheduledDate: h.dateIn(5) }, stranger);
    assert.equal(r.status, 400, 'blocked vendors cannot be booked');
  });
});

describe('Admin UPI QR', () => {
  const gen = (id, who, body = {}) => w.api.post(`/api/bookings/cash/${id}/generate-admin-qr`).set(who).send(body);
  const conf = (id, who, body = {}) => w.api.post(`/api/bookings/cash/${id}/confirm-admin-qr`).set(who).send(body);

  it('generation is limited to the booking\'s parties and uses the server-side amount', async () => {
    const id = await workDone();
    assert.equal((await gen(id, asF(stranger))).status, 403);
    assert.equal((await gen(id, asV(otherVendor))).status, 403);
    const r = await gen(id, asF(), { amount: 1 });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    const b = await h.M('Booking').findById(id);
    assert.equal(r.body.data.amount, b.finalAmount, 'client amount ignored');
    assert.ok(r.body.data.upiUri.includes(`am=${b.finalAmount.toFixed(2)}`));
    assert.equal(b.finalAmount, b.balanceDue);
  });

  it('cannot generate for a paid or not-yet-billable booking', async () => {
    const id = await f.newBooking(w);
    assert.equal((await gen(id, asF())).status, 400, 'requested');
    const id2 = await workDone({ scheduledDate: h.dateIn(3) });
    await h.M('Booking').updateOne({ _id: id2 }, { $set: { paymentStatus: 'success' } });
    assert.equal((await gen(id2, asF())).status, 400);
  });

  it('only the provider may confirm; farmers/strangers/other vendors cannot', async () => {
    const id = await workDone();
    await gen(id, asF());
    for (const who of [asF(), asF(stranger), asV(otherVendor)]) {
      assert.equal((await conf(id, who, { utr: '123456789012' })).status, 403);
    }
    assert.equal((await h.M('Booking').findById(id)).status, 'work_done');
    assert.equal((await f.vendorWallet(w.vendor)).earnings ?? 0, 0);
  });

  it('needs a plausible UTR, rejects reuse across bookings, ignores client amounts', async () => {
    const id = await workDone();
    await gen(id, asF());
    for (const utr of [undefined, '', 'abc', '12 34', '!!!!!!!!!!!!']) {
      assert.equal((await conf(id, asV(), { utr })).status, 400, String(utr));
    }
    const ok = await conf(id, asV(), { utr: '412345678901', amount: 1 });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'completed');
    assert.equal(b.paymentMethod, 'qr_online');
    assert.equal(b.paymentStatus, 'success');
    assert.equal(b.qrPayment.utr, '412345678901');
    assert.equal(ok.body.data.amount, b.finalAmount, 'amount comes from the bill');

    const bill = await h.M('VendorBill').findOne({ bookingId: id });
    const wal = await f.vendorWallet(w.vendor);
    assert.equal(wal.earnings, bill.vendorTotalEarning);
    assert.equal(wal.dues ?? 0, 0, 'QR money goes to the platform: no cash dues');

    // same UTR on a second booking
    const id2 = await workDone({ scheduledDate: h.dateIn(3) });
    await gen(id2, asF());
    const dup = await conf(id2, asV(), { utr: '412345678901' });
    assert.equal(dup.status, 409);
    assert.equal((await h.M('Booking').findById(id2)).status, 'work_done');
  });

  it('confirming twice (or concurrently) credits the vendor once', async () => {
    const id = await workDone();
    await gen(id, asF());
    const rs = await Promise.all([1, 2, 3].map(() => conf(id, asV(), { utr: '999888777666' })));
    assert.ok(rs.every(r => [200, 409].includes(r.status)), rs.map(r => r.status).join(','));
    assert.equal(rs.filter(r => r.status === 200).length >= 1, true);
    assert.equal(await h.M('Transaction').countDocuments({ bookingId: id, type: 'earnings_credit' }), 1);
    const bill = await h.M('VendorBill').findOne({ bookingId: id });
    assert.equal((await f.vendorWallet(w.vendor)).earnings, bill.vendorTotalEarning);
  });

  it('cannot confirm before the work is done or after cash was collected', async () => {
    const id = await f.newBooking(w);
    await f.toInProgress(w, id);
    assert.equal((await conf(id, asV(), { utr: '555555555555' })).status, 400);
    const id2 = await workDone({ scheduledDate: h.dateIn(3) });
    const { paymentOtp } = await f.secret(id2, '+paymentOtp');
    await cash('confirm', id2, asV(), { otp: paymentOtp });
    assert.equal((await conf(id2, asV(), { utr: '666666666666' })).status, 409);
  });

  it('qr-status is private to the parties', async () => {
    const id = await workDone();
    assert.equal((await w.api.get(`/api/bookings/cash/${id}/qr-status`).set(asF(stranger))).status, 403);
    assert.equal((await w.api.get(`/api/bookings/cash/${id}/qr-status`).set(asV())).status, 200);
  });
});

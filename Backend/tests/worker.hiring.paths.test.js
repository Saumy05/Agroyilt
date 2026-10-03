'use strict';
// Every OTHER route that can start / complete / settle a worker job must funnel into the same audited path.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const hire = require('./helpers/hiring');

let ctx, farmer, w1, w2;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => {
  await h.clearDb(); h.fakeIo.reset();
  await h.make.settings({ workerCommissionPercentage: 10, workerPlatformChargePercentage: 5, adminUpiId: 'admin@upi' });
  farmer = await h.make.farmer();
  [w1, w2] = [await hire.makeWorker(), await hire.makeWorker()];
});
const A = (id) => h.M('IndWorkerAssignment').findById(id);
const W = (w) => hire.asWorker(ctx.api, w);

describe('late-arrival penalty', () => {
  it('is applied once, with one consistent amount, persisted, and the worker\'s earnings are not reduced twice', async () => {
    await h.make.settings({ workerPenaltyEnabled: true, workerPenaltyType: 'fixed', workerPenaltyAmount: 50, workerPenaltyFreeMinutes: 0 });
    await h.M('Worker').updateOne({ _id: w1._id }, { $set: { 'wallet.balance': 200 } });
    const b = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true, startTime: '00:01', endTime: '23:50', durationMinutes: 600 });
    const a = b.assignments[0];
    const netBefore = (await A(a._id)).netEarning;
    await W(w1).post(`/${a._id}/start-journey`); await W(w1).post(`/${a._id}/arrived`);
    const otp = (await hire.secretOf(a._id)).visitOtpCode;
    const rs = await Promise.all([1, 2, 3].map(() => W(w1).post(`/${a._id}/verify-visit-otp`, { otp })));
    assert.ok(rs.some(r => r.status === 200));
    const doc = await A(a._id);
    assert.equal(doc.latePenalty.applied, true);
    assert.equal(doc.latePenalty.amount, 50);
    assert.equal(doc.netEarning, netBefore, 'earnings untouched: the wallet penalty is the single mechanism');
    assert.equal((await h.M('Worker').findById(w1._id)).wallet.balance, 150, 'charged once');
    assert.equal(await h.M('WorkerPenalty').countDocuments({ workerId: w1._id }), 1);
  });

  it('falls back to dues (and restricts) when the wallet cannot cover it; concurrent calls charge once', async () => {
    const { applyWorkerPenalty } = require('../services/workerFinancialService');
    await h.make.settings({ workerPenaltyEnabled: true, maxWorkerDues: 100 });
    await h.M('Worker').updateOne({ _id: w2._id }, { $set: { 'wallet.balance': 10 } });
    await Promise.all([1, 2, 3].map(() => applyWorkerPenalty(w2._id, null, 'evt_x', 'late_arrival', 'late', { amount: 150 })));
    const w = await h.M('Worker').findById(w2._id);
    assert.equal(w.wallet.balance, 10);
    assert.equal(w.outstandingDues, 150);
    assert.equal(w.isRestricted, true);
    assert.equal(await h.M('WorkerPenalty').countDocuments({ penaltyEventId: 'evt_x' }), 1);
  });
});

describe('alternative settlement routes cannot pay a job twice', () => {
  const qr = (id, who, utr) => ctx.api.post(`/api/bookings/cash/${id}/confirm-admin-qr`).set(who).send({ utr });

  it('QR confirmation: refused before the work started, and after the job was settled another way; once otherwise', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1, w2]);
    const [a1, a2] = b.assignments;
    assert.equal((await qr(a1._id, h.auth(w1, 'WORKER'), 'UTR123456789')).status, 409, 'not started');

    await hire.startWork(ctx, w1, a1);
    const rs = await Promise.all([1, 2, 3].map((i) => qr(a1._id, h.auth(w1, 'WORKER'), `UTR12345678${i}`)));
    // late duplicates get an idempotent "already confirmed" 200 or a 409 — the point is the single payout below
    assert.ok(rs.some(r => r.status === 200) && rs.every(r => [200, 409].includes(r.status)), rs.map(r => `${r.status}`).join());
    const net = (await A(a1._id)).netEarning;
    assert.equal(await hire.workerWallet(w1), net, 'credited once');
    assert.equal((await A(a1._id)).assignmentStatus, 'COMPLETED');

    // job 2 completes through the OTP flow; a QR confirmation afterwards must not pay again
    await hire.startWork(ctx, w2, a2);
    const otp = (await hire.farmerCompletionOtp(ctx, farmer, b.request, a2)).body.data.completionOtp;
    assert.equal((await W(w2).post(`/${a2._id}/verify-completion-otp`, { otp })).status, 200);
    const w2Before = await hire.workerWallet(w2);
    assert.equal((await qr(a2._id, h.auth(w2, 'WORKER'), 'UTR999999999')).status, 409);
    assert.equal(await hire.workerWallet(w2), w2Before);
  });

  it('the legacy farmer-triggered worker settlement is closed for assignment-backed bookings', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1]);
    const res = await ctx.api.post(`/api/users/booking/${b.assignments[0].legacyBookingId || (await h.M('Booking').findOne({ workerRequestId: b.request._id }))._id}/worker-settlement`).set(h.auth(farmer, 'USER')).send({ otp: '1234' });
    assert.equal(res.status, 409);
    assert.equal(await hire.workerWallet(w1), 0);
  });

  it('legacy /jobs/:id endpoints delegate: sequencing, atomic attempts and expiry apply there too', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = b.assignments[0];
    const booking = await h.M('Booking').findOne({ workerRequestId: b.request._id });
    const job = (verb, body = {}) => ctx.api.post(`/api/workers/jobs/${booking._id}/${verb}`).set(h.auth(w1, 'WORKER')).send(body);

    assert.equal((await job('visit/verify', { otp: '1234' })).status, 409, 'journey first');
    assert.equal((await job('start-journey')).status, 200);
    const real = (await hire.secretOf(a._id)).visitOtpCode;
    const wrong = real === '1111' ? '2222' : '1111';
    const rs = await Promise.all(Array.from({ length: 30 }, () => job('visit/verify', { otp: wrong })));
    assert.equal((await A(a._id)).visitOtpAttempts, 5, 'the old path no longer allows unlimited guesses');
    assert.ok(rs.filter(r => r.status === 400).length <= 5);
    assert.equal((await job('visit/verify', { otp: real })).status, 429, 'locked');
    assert.equal((await A(a._id)).visitOtpStatus, 'LOCKED');
  });

  it('a worker cannot self-complete or self-mark-paid through PUT /jobs/:id/status', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const booking = await h.M('Booking').findOne({ workerRequestId: b.request._id });
    const put = (body) => ctx.api.put(`/api/workers/jobs/${booking._id}/status`).set(h.auth(w1, 'WORKER')).send(body);
    assert.equal((await put({ status: 'in_progress', workerPaymentStatus: 'PAID' })).status, 403);
    assert.equal((await put({ status: 'in_progress' })).status, 409, 'assignment-backed jobs only move through the assignment flow');
    const fresh = await h.M('Booking').findById(booking._id);
    assert.notEqual(fresh.isWorkerPaid, true);
    assert.equal(fresh.status, 'confirmed');
  });

  it('cash collection on an assignment-backed booking charges the commission exactly once', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = b.assignments[0];
    await h.M('Worker').updateOne({ _id: w1._id }, { $set: { 'wallet.balance': 0 } });
    const booking = await h.M('Booking').findOne({ workerRequestId: b.request._id }).select('+paymentOtp');
    await h.M('Booking').updateOne({ _id: booking._id }, { $set: { status: 'in_progress', finalAmount: 1000, paymentOtp: '4321', commissionRate: 10 } });
    await hire.startWork(ctx, w1, a);
    const collect = (otp) => ctx.api.post(`/api/bookings/cash/${booking._id}/confirm`).set(h.auth(w1, 'WORKER')).send({ otp });
    const rs = await Promise.all([1, 2].map(() => collect('4321')));
    assert.ok(rs.some(r => r.status === 200), rs.map(r => r.status).join());
    const w = await h.M('Worker').findById(w1._id);
    assert.equal(w.outstandingDues, 100, 'one commission, not two');
    // finishing through the OTP flow afterwards must not charge it again
    const gen = await hire.farmerCompletionOtp(ctx, farmer, b.request, a);
    await W(w1).post(`/${a._id}/verify-completion-otp`, { otp: gen.body.data?.completionOtp || '0000' });
    assert.equal((await h.M('Worker').findById(w1._id)).outstandingDues, 100);
  });
});

describe('ledger', () => {
  it('a credit is applied at most once per key, even concurrently; a crash leaves a visible pending row, never a double credit', async () => {
    const ledger = require('../services/ledgerService');
    const rs = await Promise.all(Array.from({ length: 8 }, () => ledger.applyOnce({ ownerId: farmer._id, ownerModel: 'User', amount: 10, key: 'k1', reason: 'refund', referenceId: 'r1' })));
    assert.equal(rs.filter(r => r.applied).length, 1);
    assert.equal(await hire.farmerWalletBalance(farmer), 10);
    assert.equal((await h.M('User').findById(farmer._id)).wallet.balance, 10, 'the embedded balance moved with it');

    // simulate a crash after the ledger row was written but before the balance moved
    const wallet = await ledger.ensureWallet(farmer._id, 'User');
    await h.M('WalletTransaction').create({ walletId: wallet._id, type: 'credit', amount: 5, reason: 'refund', referenceId: 'r2', idempotencyKey: 'k2', status: 'pending', createdAt: new Date(Date.now() - 3600000) });
    const retry = await ledger.applyOnce({ ownerId: farmer._id, ownerModel: 'User', amount: 5, key: 'k2', reason: 'refund', referenceId: 'r2' });
    assert.equal(retry.applied, false);
    assert.equal(await hire.farmerWalletBalance(farmer), 10, 'never double-credited');
    await h.M('WalletTransaction').collection.updateOne({ idempotencyKey: 'k2' }, { $set: { createdAt: new Date(Date.now() - 3600000) } });
    assert.equal((await ledger.reconcilePendingLedger()).length, 1, 'the half-done row is surfaced for reconciliation');
  });
});

describe('worker withdrawal', () => {
  it('withdrawing before the start returns that worker\'s share, penalises per settings, and never twice', async () => {
    await h.make.settings({ workerPenaltyEnabled: true, workerPenaltyAmount: 30, workerPenaltyType: 'fixed', workerCommissionPercentage: 10, workerPlatformChargePercentage: 5 });
    await h.M('Worker').updateOne({ _id: w1._id }, { $set: { 'wallet.balance': 100 } });
    const b = await hire.confirmedBooking(ctx, farmer, [w1, w2]);
    const [a1, a2] = b.assignments;
    const share = b.request.financialSnapshot.maximumWorkerAmount / 2;
    const rs = await Promise.all([1, 2].map(() => W(w1).post(`/${a1._id}/cancel`, { reason: 'ill' })));
    assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join());
    assert.equal((await A(a1._id)).assignmentStatus, 'CANCELLED');
    assert.equal((await A(a1._id)).cancelledBy, 'worker');
    assert.equal(await hire.farmerWalletBalance(farmer), share);
    assert.equal((await h.M('Worker').findById(w1._id)).wallet.balance, 70);
    assert.equal((await A(a2._id)).assignmentStatus, 'CONFIRMED');
    assert.equal((await h.M('WorkerBookingRequest').findById(b.request._id)).status, 'confirmed');
  });

  it('the last worker withdrawing cancels the booking with a full refund; started work cannot be abandoned', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1]);
    const c = await hire.confirmedBooking(ctx, farmer, [w2], { scheduledDate: new Date(Date.now() + 4 * 86400000) });
    await hire.startWork(ctx, w1, b.assignments[0]);
    assert.equal((await W(w1).post(`/${b.assignments[0]._id}/cancel`)).status, 409);
    const r = await W(w2).post(`/${c.assignments[0]._id}/cancel`, {});
    assert.equal(r.status, 200);
    assert.equal(r.body.data.bookingCancelled, true);
    assert.equal((await h.M('WorkerBookingRequest').findById(c.request._id)).status, 'cancelled');
    assert.equal(await hire.farmerWalletBalance(farmer), c.request.financialSnapshot.totalPayable);
    assert.equal((await W(w2).post(`/${c.assignments[0]._id}/cancel`)).status, 404);
  });

  it('another worker cannot withdraw someone else\'s assignment', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1]);
    assert.equal((await W(w2).post(`/${b.assignments[0]._id}/cancel`)).status, 404);
  });
});

describe('cash booking completion', () => {
  it('marks the parent paid (cash collected) once every assignment is settled', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = b.assignments[0];
    assert.equal((await h.M('WorkerBookingRequest').findById(b.request._id)).paymentStatus, 'pending');
    await hire.startWork(ctx, w1, a);
    const otp = (await hire.farmerCompletionOtp(ctx, farmer, b.request, a)).body.data.completionOtp;
    assert.equal((await W(w1).post(`/${a._id}/verify-completion-otp`, { otp })).status, 200);
    const p = await h.M('WorkerBookingRequest').findById(b.request._id);
    assert.equal(p.status, 'completed');
    assert.equal(p.paymentStatus, 'success');
    assert.equal(await hire.farmerWalletBalance(farmer), 0, 'cash bookings never refund to the wallet');
  });
});

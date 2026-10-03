'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const hire = require('./helpers/hiring');

let ctx, farmer, w1, w2;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => {
  await h.clearDb(); h.fakeIo.reset();
  await h.make.settings({ workerCommissionPercentage: 10, workerPlatformChargePercentage: 5 });
  farmer = await h.make.farmer();
  [w1, w2] = [await hire.makeWorker(), await hire.makeWorker()];
});
const A = (id) => h.M('IndWorkerAssignment').findById(id);
const W = (w) => hire.asWorker(ctx.api, w);
const noOtpLeak = (body) => {
  const t = JSON.stringify(body);
  return !/visitOtpCode|completionOtpCode|visitOtpHash|completionOtpHash/.test(t);
};

describe('authorization / secrecy', () => {
  it('worker routes reject non-worker roles; farmer routes reject workers', async () => {
    const { assignments, request } = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = assignments[0];
    const vendor = await h.make.vendor();
    for (const who of [h.auth(farmer, 'USER'), h.auth(vendor, 'VENDOR')]) {
      assert.equal((await ctx.api.post(`/api/workers/assignments/${a._id}/start-journey`).set(who).send({})).status, 403);
      assert.equal((await ctx.api.patch(`/api/workers/farmer-request/${request._id}/respond`).set(who).send({ action: 'accept' })).status, 403);
    }
    assert.equal((await ctx.api.post(`/api/users/farmer-worker-request/${request._id}/cancel`).set(h.auth(w1, 'WORKER')).send({})).status, 403);
  });

  it('the worker never receives OTP codes or hashes from any assignment endpoint', async () => {
    const { assignments } = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = assignments[0];
    const bodies = [
      (await W(w1).get(`/${a._id}`)).body,
      (await W(w1).get('/my-assignments')).body,
      (await W(w1).post(`/${a._id}/start-journey`)).body,
      (await W(w1).post(`/${a._id}/arrived`)).body
    ];
    bodies.forEach((b, i) => assert.ok(noOtpLeak(b), `leak in response #${i}: ${JSON.stringify(b).slice(0, 200)}`));
    const verify = await W(w1).post(`/${a._id}/verify-visit-otp`, { otp: (await hire.secretOf(a._id)).visitOtpCode });
    assert.equal(verify.status, 200);
    assert.ok(noOtpLeak(verify.body));
  });

  it('another worker / the farmer role cannot read someone else\'s assignment; a stranger farmer neither', async () => {
    const { assignments } = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const stranger = await h.make.farmer();
    assert.equal((await W(w2).get(`/${assignments[0]._id}`)).status, 403);
    const asStranger = await ctx.api.get(`/api/workers/assignments/${assignments[0]._id}`).set(h.auth(stranger, 'USER'));
    assert.equal(asStranger.status, 403);
    const asOwner = await ctx.api.get(`/api/workers/assignments/${assignments[0]._id}`).set(h.auth(farmer, 'USER'));
    assert.equal(asOwner.status, 200);
    assert.equal(asOwner.body.data.netEarning, undefined, 'farmer does not see the worker\'s earnings');
  });
});

describe('OTP security', () => {
  it('visit OTP needs the journey first and cannot be used before the scheduled day', async () => {
    const { assignments } = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = assignments[0];
    const otp = (await hire.secretOf(a._id)).visitOtpCode;
    assert.equal((await W(w1).post(`/${a._id}/verify-visit-otp`, { otp })).status, 409, 'no journey yet');
    assert.equal((await W(w1).post(`/${a._id}/arrived`)).status, 409, 'arrival requires the journey');
    await W(w1).post(`/${a._id}/start-journey`);
    // move the schedule into the future
    await h.M('WorkerBookingRequest').updateOne({ _id: a.parentRequestId }, { $set: { scheduledDate: hire.tomorrow() } });
    assert.equal((await W(w1).post(`/${a._id}/verify-visit-otp`, { otp })).status, 409, 'before the scheduled day');
  });

  it('wrong OTPs are limited to 5 attempts even when sent in parallel; the OTP is then dead', async () => {
    const { assignments } = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = assignments[0];
    await W(w1).post(`/${a._id}/start-journey`);
    const real = (await hire.secretOf(a._id)).visitOtpCode;
    const wrong = real === '1111' ? '2222' : '1111';
    const rs = await Promise.all(Array.from({ length: 40 }, () => W(w1).post(`/${a._id}/verify-visit-otp`, { otp: wrong })));
    // 4 plain "invalid", the 5th locks it (429); the other 35 are refused without evaluating any code
    assert.equal(rs.filter(r => r.status === 400).length, 4, rs.map(r => r.status).join(','));
    const doc = await A(a._id);
    assert.equal(doc.visitOtpAttempts, 5);
    assert.equal(doc.visitOtpStatus, 'LOCKED');
    // even the CORRECT code is refused once locked
    assert.equal((await W(w1).post(`/${a._id}/verify-visit-otp`, { otp: real })).status, 429);
  });

  it('the farmer can re-issue a locked/expired visit OTP (capped); the new one works, the old one does not', async () => {
    const { request, assignments } = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = assignments[0];
    await W(w1).post(`/${a._id}/start-journey`);
    const old = (await hire.secretOf(a._id)).visitOtpCode;
    const wrong = old === '1111' ? '2222' : '1111';
    for (let i = 0; i < 5; i++) await W(w1).post(`/${a._id}/verify-visit-otp`, { otp: wrong });
    const regen = () => ctx.api.post(`/api/users/farmer-worker-request/${request._id}/assignment/${a._id}/regenerate-visit-otp`).set(h.auth(farmer, 'USER')).send({});
    const r1 = await regen();
    assert.equal(r1.status, 200);
    const fresh = r1.body.data.visitOtp;
    assert.match(fresh, /^\d{4}$/);
    if (fresh !== old) assert.equal((await W(w1).post(`/${a._id}/verify-visit-otp`, { otp: old })).status, 400);
    assert.equal((await W(w1).post(`/${a._id}/verify-visit-otp`, { otp: fresh })).status, 200);
    assert.equal((await regen()).status, 409, 'already verified');
  });

  it('regeneration is capped', async () => {
    const { request, assignments } = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = assignments[0];
    const regen = () => ctx.api.post(`/api/users/farmer-worker-request/${request._id}/assignment/${a._id}/regenerate-visit-otp`).set(h.auth(farmer, 'USER')).send({});
    for (let i = 0; i < 5; i++) assert.equal((await regen()).status, 200);
    assert.equal((await regen()).status, 429);
  });

  it('an expired visit OTP is rejected', async () => {
    const { assignments } = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = assignments[0];
    await W(w1).post(`/${a._id}/start-journey`);
    const otp = (await hire.secretOf(a._id)).visitOtpCode;
    await h.M('IndWorkerAssignment').updateOne({ _id: a._id }, { $set: { visitOtpExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await W(w1).post(`/${a._id}/verify-visit-otp`, { otp })).status, 410);
  });

  it('completion needs a verified visit and a valid, unexpired, farmer-issued OTP', async () => {
    const { request, assignments } = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = assignments[0];
    assert.equal((await W(w1).post(`/${a._id}/verify-completion-otp`, { otp: '1234' })).status, 409, 'visit not verified');
    assert.equal((await hire.farmerCompletionOtp(ctx, farmer, request, a)).status, 409, 'farmer cannot issue it before work started');
    assert.equal((await hire.startWork(ctx, w1, a)).status, 200);
    const gen = await hire.farmerCompletionOtp(ctx, farmer, request, a);
    assert.equal(gen.status, 200);
    const otp = gen.body.data.completionOtp;
    await h.M('IndWorkerAssignment').updateOne({ _id: a._id }, { $set: { completionOtpExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await W(w1).post(`/${a._id}/verify-completion-otp`, { otp })).status, 410);
    const gen2 = await hire.farmerCompletionOtp(ctx, farmer, request, a);
    assert.equal((await W(w1).post(`/${a._id}/verify-completion-otp`, { otp: gen2.body.data.completionOtp })).status, 200);
  });
});

describe('settlement integrity', () => {
  const finish = async (booking, worker, assignment) => {
    await hire.startWork(ctx, worker, assignment);
    const gen = await hire.farmerCompletionOtp(ctx, farmer, booking.request, assignment);
    return gen.body.data.completionOtp;
  };

  it('parallel completion calls credit the worker exactly once and complete the parent once (online booking)', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1, w2]);
    const [a1, a2] = b.assignments;
    const otp1 = await finish(b, w1, a1);
    const otp2 = await finish(b, w2, a2);

    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => W(w1).post(`/${a1._id}/verify-completion-otp`, { otp: otp1 })));
    assert.ok(rs.every(r => [200, 202].includes(r.status)), rs.map(r => r.status).join());
    const net1 = (await A(a1._id)).netEarning;
    assert.equal(await hire.workerWallet(w1), net1, 'credited once');
    assert.equal(await h.M('Transaction').countDocuments({ workerId: w1._id, type: 'earnings_credit' }), 1);
    assert.equal((await A(a1._id)).assignmentStatus, 'COMPLETED');
    assert.equal((await h.M('WorkerBookingRequest').findById(b.request._id)).status, 'partially_completed');

    // finish the 2nd worker concurrently with replays → parent completes and the reserve refund lands once
    await Promise.all([1, 2, 3].map(() => W(w2).post(`/${a2._id}/verify-completion-otp`, { otp: otp2 })));
    const parent = await h.M('WorkerBookingRequest').findById(b.request._id);
    assert.equal(parent.status, 'completed');
    const gross = (await A(a1._id)).grossAmount + (await A(a2._id)).grossAmount;
    const expectedRefund = Math.max(0, parent.financialSnapshot.maximumWorkerAmount - gross);
    assert.equal(await hire.farmerWalletBalance(farmer), expectedRefund, 'unused reserve refunded exactly once');
    assert.equal(await h.M('WalletTransaction').countDocuments({ reason: 'refund' }), expectedRefund > 0 ? 1 : 0);
  });

  it('cash booking: commission is deducted atomically and once; concurrent completion does not double-charge', async () => {
    await h.M('Worker').updateOne({ _id: w1._id }, { $set: { 'wallet.balance': 5 } });
    const b = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    const a = b.assignments[0];
    const otp = await finish(b, w1, a);
    await Promise.all([1, 2, 3].map(() => W(w1).post(`/${a._id}/verify-completion-otp`, { otp })));
    const doc = await A(a._id);
    const w = await h.M('Worker').findById(w1._id);
    assert.equal(w.wallet.balance, 0, 'wallet floors at 0');
    assert.equal(w.outstandingDues, doc.commissionAmount - 5, 'only the uncovered part becomes dues, once');
    assert.equal(doc.settlementStatus, 'SETTLED');
  });

  it('a settlement that failed is retried safely (no double credit) by the reconciler', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1]);
    const a = b.assignments[0];
    const otp = await finish(b, w1, a);
    // simulate a crash after the credit but before SETTLED
    const svc = require('../services/workerSettlementService');
    await h.M('IndWorkerAssignment').updateOne({ _id: a._id }, { $set: { completionStatus: 'OTP_VERIFIED', workCompletedAt: new Date() } });
    const first = await svc.settleAssignment(a._id);
    assert.equal(first.claimed, true);
    await h.M('IndWorkerAssignment').updateOne({ _id: a._id }, { $set: { settlementStatus: 'FAILED', assignmentStatus: 'CONFIRMED' } });
    const again = await svc.reconcile();
    assert.equal(again.settlements, 1);
    assert.equal(await hire.workerWallet(w1), (await A(a._id)).netEarning, 'credited once even though settlement ran twice');
    void otp;
  });
});

describe('cancellation', () => {
  it('cancel after confirmation refunds once; replays and parallel cancels do not refund again', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1, w2]);
    const F = hire.asFarmer(ctx.api, farmer);
    const total = b.request.financialSnapshot.totalPayable;
    const rs = await Promise.all([1, 2, 3].map(() => F.cancel(b.request._id)));
    assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join());
    assert.equal(await hire.farmerWalletBalance(farmer), total);
    assert.equal(await h.M('IndWorkerAssignment').countDocuments({ parentRequestId: b.request._id, assignmentStatus: 'CANCELLED' }), 2);
    assert.equal((await F.cancel(b.request._id)).status, 409);
    assert.equal(await hire.farmerWalletBalance(farmer), total);
  });

  it('cannot cancel once a worker has started work, and nothing is touched', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1, w2]);
    await hire.startWork(ctx, w1, b.assignments[0]);
    const res = await hire.asFarmer(ctx.api, farmer).cancel(b.request._id);
    assert.equal(res.status, 400);
    assert.equal((await h.M('WorkerBookingRequest').findById(b.request._id)).status, 'in_progress', 'parent reflects real progress');
    assert.equal(await h.M('IndWorkerAssignment').countDocuments({ parentRequestId: b.request._id, assignmentStatus: 'CONFIRMED' }), 2);
    assert.equal(await hire.farmerWalletBalance(farmer), 0);
  });

  it('a cash booking that is already in progress cannot be cancelled either (no half-cancel)', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
    await hire.startWork(ctx, w1, b.assignments[0]);
    assert.equal((await hire.asFarmer(ctx.api, farmer).cancel(b.request._id)).status, 400);
    assert.equal((await A(b.assignments[0]._id)).assignmentStatus, 'CONFIRMED');
  });
});

describe('request lifecycle guards', () => {
  it('a worker responding to a CONFIRMED request changes nothing and never expires/cancels it', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1]);
    // make the scheduled window look long gone
    await h.M('WorkerBookingRequest').updateOne({ _id: b.request._id }, { $set: { scheduledDate: new Date(Date.now() - 5 * 86400000), expiresAt: new Date(Date.now() - 86400000) } });
    const outsider = await hire.makeWorker();
    const res = await W(outsider).respond(b.request._id, { action: 'accept' });
    assert.ok([409, 410].includes(res.status), String(res.status));
    const rej = await W(outsider).respond(b.request._id, { action: 'reject' });
    assert.equal(rej.status, 200);
    const req = await h.M('WorkerBookingRequest').findById(b.request._id);
    assert.equal(req.status, 'confirmed');
    assert.equal(await h.M('IndWorkerAssignment').countDocuments({ parentRequestId: b.request._id, assignmentStatus: 'CONFIRMED' }), 1);
    assert.equal(await hire.farmerWalletBalance(farmer), 0, 'no surprise refund');
  });

  it('no TTL index deletes parent requests', async () => {
    const idx = await h.M('WorkerBookingRequest').collection.indexes();
    assert.ok(!idx.some(i => i.expireAfterSeconds !== undefined), JSON.stringify(idx.filter(i => i.expireAfterSeconds !== undefined)));
  });

  it('the legacy TTL index is dropped by the migration', async () => {
    const M = h.M('WorkerBookingRequest');
    await M.collection.createIndex({ expiresAt: 1 }, { name: 'expiresAt_1', expireAfterSeconds: 0 }).catch(() => {});
    await M.dropLegacyTtlIndex();
    const idx = await M.collection.indexes();
    assert.ok(!idx.some(i => i.expireAfterSeconds !== undefined));
  });

  it('workers who never showed are auto-cancelled and refunded; started-but-overdue bookings are only flagged', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1]);
    await h.M('WorkerBookingRequest').updateOne({ _id: b.request._id }, { $set: { scheduledDate: new Date(Date.now() - 5 * 86400000), confirmedAt: new Date(Date.now() - 4 * 86400000) } });
    const { autoCancelNoShows } = require('../services/workerBookingCancelService');
    const out = await autoCancelNoShows();
    assert.equal(out.cancelled, 1);
    assert.equal((await h.M('WorkerBookingRequest').findById(b.request._id)).status, 'cancelled');
    assert.equal(await hire.farmerWalletBalance(farmer), b.request.financialSnapshot.totalPayable);

    const c = await hire.confirmedBooking(ctx, farmer, [w2]);
    await hire.startWork(ctx, w2, c.assignments[0]);
    await h.M('WorkerBookingRequest').updateOne({ _id: c.request._id }, { $set: { status: 'confirmed', scheduledDate: new Date(Date.now() - 5 * 86400000), confirmedAt: new Date(Date.now() - 4 * 86400000) } });
    const out2 = await autoCancelNoShows();
    assert.equal(out2.cancelled, 0);
    assert.equal(out2.flagged, 1);
  });

  it('an unpaid request that is still being filled is the only thing request-expiry touches', async () => {
    const r = await hire.makeRequest(farmer, [w1], { expiresAt: new Date(Date.now() - 1000), scheduledDate: new Date(Date.now() - 86400000 * 2) });
    const { checkAndExpireWorkerRequests } = require('../services/workerBookingExpiryService');
    await checkAndExpireWorkerRequests();
    assert.equal((await h.M('WorkerBookingRequest').findById(r._id)).status, 'expired');
  });
});

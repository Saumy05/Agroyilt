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
const P = (id) => h.M('WorkerBookingRequest').findById(id);
const F = () => hire.asFarmer(ctx.api, farmer);
const post = (path, body = {}) => ctx.api.post(`/api/users/farmer-worker-request${path}`).set(h.auth(farmer, 'USER')).send(body);

describe('DAILY lifecycle', () => {
  it('a full 3-day booking settles once, completes the parent and refunds the unused reserve once', async () => {
    const b = await hire.confirmedDaily(ctx, farmer, [w1], { days: 3, rate: 550, max: 600 });
    const a = b.assignments[0];
    const r1 = await hire.workDay(ctx, farmer, w1, b.request, a);
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal((await A(a._id)).workedDays, 1);
    assert.equal((await A(a._id)).currentDayIndex, 2);
    assert.equal((await P(b.request._id)).status, 'in_progress');
    assert.equal((await hire.workDay(ctx, farmer, w1, b.request, a)).status, 200);
    const last = await hire.workDay(ctx, farmer, w1, b.request, a);
    assert.equal(last.status, 200);

    const doc = await A(a._id);
    assert.equal(doc.assignmentStatus, 'COMPLETED');
    assert.equal(doc.workedDays, 3);
    assert.equal(doc.netEarning, 550 * 3 * 0.9);
    assert.equal(await hire.workerWallet(w1), 550 * 3 * 0.9);
    assert.equal((await P(b.request._id)).status, 'completed');
    assert.equal(await hire.farmerWalletBalance(farmer), 600 * 3 - 550 * 3, 'unused reserve (max rate − agreed rate) refunded once');
  });

  it('day N cannot be worked before its calendar day', async () => {
    const b = await hire.confirmedDaily(ctx, farmer, [w1], { days: 3, startedDaysAgo: 0 });
    const a = b.assignments[0];
    assert.equal((await hire.workDay(ctx, farmer, w1, b.request, a)).status, 200);
    const day2 = await hire.workDay(ctx, farmer, w1, b.request, a);
    assert.equal(day2.status, 409, 'day 2 is tomorrow');
    assert.equal((await A(a._id)).workedDays, 1);
  });

  it('completion OTP generation is limited to the current, started day', async () => {
    const b = await hire.confirmedDaily(ctx, farmer, [w1], { days: 2 });
    const a = b.assignments[0];
    const gen = () => post(`/${b.request._id}/assignment/${a._id}/daily-completion-otp`);
    assert.equal((await gen()).status, 409, 'day not started');
    await hire.workDay(ctx, farmer, w1, b.request, a);
    await hire.workDay(ctx, farmer, w1, b.request, a);
    assert.equal((await gen()).status, 404, 'assignment finished');
  });
});

describe('decrease worker', () => {
  it('before work starts: the worker is removed and exactly their reserve share is refunded (idempotent)', async () => {
    const b = await hire.confirmedDaily(ctx, farmer, [w1, w2], { days: 3, max: 600 });
    const [a1] = b.assignments;
    const share = b.request.financialSnapshot.maximumWorkerAmount / 2;
    const dec = () => post(`/${b.request._id}/decrease-worker`, { assignmentId: String(a1._id), reason: 'not needed' });
    const r = await dec();
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await A(a1._id)).assignmentStatus, 'CANCELLED');
    assert.equal(await hire.farmerWalletBalance(farmer), share);
    const again = await dec();
    assert.equal(again.status, 404, 'a cancelled assignment is no longer active');
    assert.equal(await hire.farmerWalletBalance(farmer), share, 'no second refund');
    assert.equal((await P(b.request._id)).status, 'confirmed');
  });

  it('removing the LAST worker before they start cancels the whole booking with the full refund', async () => {
    const b = await hire.confirmedDaily(ctx, farmer, [w1], { days: 2 });
    const r = await post(`/${b.request._id}/decrease-worker`, { assignmentId: String(b.assignments[0]._id) });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.bookingCancelled, true);
    assert.equal((await P(b.request._id)).status, 'cancelled');
    assert.equal(await hire.farmerWalletBalance(farmer), b.request.financialSnapshot.totalPayable);
  });

  it('between days: the worker stops NOW — settled for days worked, no extra paid day, unused days refunded', async () => {
    const b = await hire.confirmedDaily(ctx, farmer, [w1, w2], { days: 4, rate: 500, max: 500 });
    const [a1, a2] = b.assignments;
    await hire.workDay(ctx, farmer, w1, b.request, a1);               // w1: day 1 done, day 2 pre-created
    const r = await post(`/${b.request._id}/decrease-worker`, { assignmentId: String(a1._id) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const doc = await A(a1._id);
    assert.equal(doc.assignmentStatus, 'COMPLETED');
    assert.equal(doc.workedDays, 1);
    assert.equal(doc.netEarning, 500 * 0.9);
    assert.equal(doc.dailyLogs.filter(l => l.workStatus === 'NOT_STARTED').length, 0, 'the empty next day was dropped');
    assert.equal(await hire.workerWallet(w1), 450);
    assert.equal(await hire.farmerWalletBalance(farmer), 3 * 500, '3 unused days refunded right away');
    // the other worker is unaffected and the parent is only partially complete
    assert.equal((await P(b.request._id)).status, 'partially_completed');
    assert.equal((await A(a2._id)).assignmentStatus, 'CONFIRMED');
  });

  it('mid-day: the worker finishes today and then stops; completing the day settles + refunds once', async () => {
    const b = await hire.confirmedDaily(ctx, farmer, [w1, w2], { days: 3, rate: 500, max: 500 });
    const [a1] = b.assignments;
    const W = hire.asWorker(ctx.api, w1);
    await W.post(`/${a1._id}/daily/start-day`); await W.post(`/${a1._id}/daily/arrived`);
    const cur = await hire.secretOf(a1._id);
    await W.post(`/${a1._id}/daily/verify-visit-otp`, { otp: cur.dailyLogs[0].visitOtpCode });
    const r = await post(`/${b.request._id}/decrease-worker`, { assignmentId: String(a1._id) });
    assert.equal(r.status, 200);
    assert.equal((await A(a1._id)).assignmentStatus, 'CONFIRMED', 'still working today');
    const gen = await post(`/${b.request._id}/assignment/${a1._id}/daily-completion-otp`);
    const done = await Promise.all([1, 2].map(() => W.post(`/${a1._id}/daily/verify-completion-otp`, { otp: gen.body.data.completionOtp })));
    assert.ok(done.some(d => d.status === 200));
    const doc = await A(a1._id);
    assert.equal(doc.assignmentStatus, 'COMPLETED');
    assert.equal(doc.workedDays, 1);
    assert.equal(await hire.farmerWalletBalance(farmer), 2 * 500);
    assert.equal(await hire.workerWallet(w1), 450);
  });

  it('hourly: a running job cannot be cut short; an unstarted worker can be removed', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1, w2]);
    await hire.startWork(ctx, w1, b.assignments[0]);
    assert.equal((await post(`/${b.request._id}/decrease-worker`, { assignmentId: String(b.assignments[0]._id) })).status, 409);
    assert.equal((await post(`/${b.request._id}/decrease-worker`, { assignmentId: String(b.assignments[1]._id) })).status, 200);
  });

  it('a stranger farmer cannot decrease someone else\'s worker', async () => {
    const b = await hire.confirmedDaily(ctx, farmer, [w1, w2]);
    const other = await h.make.farmer();
    const res = await ctx.api.post(`/api/users/farmer-worker-request/${b.request._id}/decrease-worker`).set(h.auth(other, 'USER')).send({ assignmentId: String(b.assignments[0]._id) });
    assert.equal(res.status, 404);
  });
});

describe('add extra workers', () => {
  it('creates a separate add-on request: nothing is assigned or charged until workers accept and the farmer pays', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1], { scheduledDate: hire.tomorrow() });
    const before = await h.M('IndWorkerAssignment').countDocuments({});
    const r = await post(`/${b.request._id}/add-workers`, { additionalWorkersCount: 2, offeredRate: 130 });
    if (r.status !== 200) console.log('add-workers:', r.status, JSON.stringify(r.body));
    assert.equal(r.status, 200);
    assert.equal(r.body.data.paymentRequired, true);
    assert.equal(await h.M('IndWorkerAssignment').countDocuments({}), before, 'no assignment without consent/payment');
    const child = await h.M('WorkerBookingRequest').findById(r.body.data.requestId);
    assert.equal(String(child.addOnOfRequestId), String(b.request._id));
    assert.equal(child.requiredWorkers, 2);
    assert.equal(await hire.farmerWalletBalance(farmer), 0);
    // a second add-on while one is open is refused (no spam / double dispatch)
    assert.equal((await post(`/${b.request._id}/add-workers`, { additionalWorkersCount: 1, offeredRate: 130 })).status, 409);
  });

  it('validates input and only works on active bookings', async () => {
    const b = await hire.confirmedBooking(ctx, farmer, [w1]);
    assert.equal((await post(`/${b.request._id}/add-workers`, { additionalWorkersCount: 0 })).status, 400);
    assert.equal((await post(`/${b.request._id}/add-workers`, { additionalWorkersCount: 999 })).status, 400);
    assert.equal((await post(`/${b.request._id}/add-workers`, { additionalWorkersCount: 1, offeredRate: -5 })).status, 400);
    const pending = await hire.makeRequest(farmer, [w2]);
    assert.equal((await post(`/${pending._id}/add-workers`, { additionalWorkersCount: 1, offeredRate: 100 })).status, 409);
  });
});

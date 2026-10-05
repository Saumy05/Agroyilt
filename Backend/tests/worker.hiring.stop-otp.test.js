'use strict';
// Stop → End OTP: the farmer's End OTP exists only after the worker stops work; no OTP material reaches the worker.
const { it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const hire = require('./helpers/hiring');

let ctx, farmer, w1;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => {
  await h.clearDb(); h.fakeIo.reset();
  await h.make.settings({ workerCommissionPercentage: 10, workerPlatformChargePercentage: 5 });
  farmer = await h.make.farmer();
  w1 = await hire.makeWorker();
});
const farmerSnap = async (req) => (await ctx.api.get(`/api/users/farmer-worker-request/${req._id}/tracking`).set(h.auth(farmer, 'USER'))).body.data.workers[0];
const workerSnapRaw = async (a) => JSON.stringify((await ctx.api.get(`/api/workers/jobs/${a._id}/tracking`).set(h.auth(w1, 'WORKER'))).body);

it('HOURLY: no End OTP while working; Stop unlocks it; worker cannot complete before Stop', async () => {
  const { assignments, request } = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true });
  const a = assignments[0];
  const W = hire.asWorker(ctx.api, w1);
  assert.equal((await hire.startWork(ctx, w1, a)).status, 200);

  assert.equal((await farmerSnap(request)).completionOtp, null, 'farmer sees no End OTP while work is running');
  assert.equal((await ctx.api.post(`/api/users/farmer-worker-request/${request._id}/assignment/${a._id}/completion-otp`).set(h.auth(farmer, 'USER')).send({})).status, 409, 'cannot generate before Stop');
  assert.equal((await W.post(`/${a._id}/verify-completion-otp`, { otp: '1234' })).status, 409, 'worker cannot complete before Stop');
  assert.doesNotMatch(await workerSnapRaw(a), /OtpCode|OtpHash/, 'no OTP material reaches the worker');

  assert.equal((await W.post(`/${a._id}/submit-proof`, {})).status, 200);
  const snap = await farmerSnap(request);
  assert.match(String(snap.completionOtp), /^\d{4}$/, 'End OTP shown after Stop');
  assert.equal(snap.journeyStatus, 'WORK_SUBMITTED');
  assert.doesNotMatch(await workerSnapRaw(a), /OtpCode|OtpHash/);
  const done = await W.post(`/${a._id}/verify-completion-otp`, { otp: snap.completionOtp });
  assert.equal(done.status, 200, JSON.stringify(done.body));
});

it('DAILY: same rule per day, and the next day starts locked again', async () => {
  const b = await hire.confirmedDaily(ctx, farmer, [w1], { days: 2 });
  const a = b.assignments[0];
  const W = hire.asWorker(ctx.api, w1);
  await W.post(`/${a._id}/daily/start-day`);
  await W.post(`/${a._id}/daily/arrived`);
  assert.doesNotMatch(await workerSnapRaw(a), /OtpCode|OtpHash/, 'no OTP material reaches the worker (daily)');
  const visit = (await farmerSnap(b.request)).visitOtp;
  assert.match(String(visit), /^\d{4}$/);
  assert.equal((await W.post(`/${a._id}/daily/verify-visit-otp`, { otp: visit })).status, 200);

  const s1 = await farmerSnap(b.request);
  assert.equal(s1.completionOtp, null, 'no End OTP while working');
  assert.equal(s1.currentDayLog?.completionOtpCode, undefined, 'raw day log carries no code');
  const gen = () => ctx.api.post(`/api/users/farmer-worker-request/${b.request._id}/assignment/${a._id}/daily-completion-otp`).set(h.auth(farmer, 'USER')).send({});
  assert.equal((await gen()).status, 409);
  assert.equal((await W.post(`/${a._id}/daily/verify-completion-otp`, { otp: '1234' })).status, 409);

  assert.equal((await W.post(`/${a._id}/daily/submit-proof`, {})).status, 200);
  const s2 = await farmerSnap(b.request);
  assert.match(String(s2.completionOtp), /^\d{4}$/);
  assert.equal((await W.post(`/${a._id}/daily/verify-completion-otp`, { otp: s2.completionOtp })).status, 200);

  const s3 = await farmerSnap(b.request);
  assert.equal(s3.completionOtp, null, 'day 2 starts with no End OTP');
  assert.equal(s3.journeyStatus, 'NOT_STARTED');
});

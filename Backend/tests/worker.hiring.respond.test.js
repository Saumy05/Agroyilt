'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const hire = require('./helpers/hiring');

let ctx, farmer, w1, w2, w3;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => {
  await h.clearDb(); h.fakeIo.reset();
  await h.make.settings({ workerCommissionPercentage: 10, workerPlatformChargePercentage: 5 });
  farmer = await h.make.farmer();
  [w1, w2, w3] = [await hire.makeWorker(), await hire.makeWorker(), await hire.makeWorker()];
});
const P = (id) => h.M('WorkerBookingRequest').findById(id);
const respond = (w, id, body) => hire.asWorker(ctx.api, w).respond(id, body);
const day3 = () => { const d = new Date(Date.now() + 3 * 86400000); d.setHours(0, 0, 0, 0); return d; };
const pendingReq = (workers, over = {}) => hire.makeRequest(farmer, workers, {
  dispatchedTo: workers.map(w => ({ workerId: w._id, status: 'pending' })), workerOffers: [], status: 'pending', ...over
});

describe('worker accept / reject', () => {
  it('records one offer per worker; repeats are idempotent and flip-flopping never duplicates offers', async () => {
    const r = await pendingReq([w1, w2], { requiredWorkers: 2 });
    assert.equal((await respond(w1, r._id, { action: 'accept', offeredRate: 120 })).status, 200);
    assert.equal((await respond(w1, r._id, { action: 'accept', offeredRate: 120 })).status, 200);
    assert.equal((await respond(w1, r._id, { action: 'reject' })).status, 200);
    assert.equal((await respond(w1, r._id, { action: 'accept', offeredRate: 110 })).status, 200);
    const req = await P(r._id);
    assert.equal(req.workerOffers.filter(o => String(o.workerId) === String(w1._id)).length, 1);
    assert.equal(req.workerOffers[0].offeredRate, 110);
    assert.equal(req.workerOffers[0].status, 'pending');
    assert.equal(req.status, 'pending', 'still waiting for the second worker');
  });

  it('enough acceptances move the request to awaiting_farmer_confirmation exactly once', async () => {
    const r = await pendingReq([w1, w2], { requiredWorkers: 2 });
    await Promise.all([respond(w1, r._id, { action: 'accept' }), respond(w2, r._id, { action: 'accept' })]);
    const req = await P(r._id);
    assert.equal(req.status, 'awaiting_farmer_confirmation');
    assert.equal(req.acceptedWorkersCount, 2);
    assert.equal(req.workerOffers.length, 2, 'parallel answers did not clobber each other');
  });

  it('everyone declined → rejected; partial acceptance → awaiting confirmation', async () => {
    const a = await pendingReq([w1, w2], { requiredWorkers: 2 });
    await respond(w1, a._id, { action: 'reject' }); await respond(w2, a._id, { action: 'reject' });
    assert.equal((await P(a._id)).status, 'rejected');
    const b = await pendingReq([w1, w2], { requiredWorkers: 2 });
    await respond(w1, b._id, { action: 'accept' }); await respond(w2, b._id, { action: 'reject' });
    assert.equal((await P(b._id)).status, 'awaiting_farmer_confirmation');
  });

  it('rejects nonsense or out-of-range rates and never writes anything for them', async () => {
    const r = await pendingReq([w1]);
    for (const rate of [-5, 0, 'abc', 99999]) {
      assert.equal((await respond(w1, r._id, { action: 'accept', offeredRate: rate })).status, 400, String(rate));
    }
    const req = await P(r._id);
    assert.equal(req.workerOffers.length, 0);
    assert.equal(req.dispatchedTo[0].status, 'pending');
  });

  it('a worker with a conflicting booking is refused BEFORE anything is written', async () => {
    const busy = await hire.confirmedBooking(ctx, farmer, [w1], { cash: true, scheduledDate: day3() });
    const f2 = await h.make.farmer();
    const r = await hire.makeRequest(f2, [w1], { scheduledDate: busy.request.scheduledDate, dispatchedTo: [{ workerId: w1._id, status: 'pending' }], workerOffers: [], status: 'pending' });
    const res = await respond(w1, r._id, { action: 'accept' });
    assert.equal(res.status, 409);
    const req = await P(r._id);
    assert.equal(req.dispatchedTo[0].status, 'pending');
    assert.equal(req.workerOffers.length, 0);
  });

  it('restricted / suspended workers cannot accept (but may decline)', async () => {
    const r = await pendingReq([w1, w2]);
    await h.M('Worker').updateOne({ _id: w1._id }, { $set: { isRestricted: true } });
    await h.M('Worker').updateOne({ _id: w2._id }, { $set: { approvalStatus: 'suspended' } });
    assert.equal((await respond(w1, r._id, { action: 'accept' })).status, 403);
    assert.equal((await respond(w1, r._id, { action: 'reject' })).status, 200);
    assert.equal((await respond(w2, r._id, { action: 'accept' })).status, 403, 'suspended accounts are stopped at the door');
  });

  it('an undispatched worker may only self-register when their skills match', async () => {
    const r = await pendingReq([w1], { requiredSkills: ['harvesting'] });
    await h.M('Worker').updateOne({ _id: w2._id }, { $set: { skills: ['plumbing'] } });
    await h.M('Worker').updateOne({ _id: w3._id }, { $set: { skills: ['harvesting'] } });
    assert.equal((await respond(w2, r._id, { action: 'accept' })).status, 403);
    assert.equal((await respond(w3, r._id, { action: 'accept' })).status, 200);
    assert.equal((await P(r._id)).dispatchedTo.filter(d => String(d.workerId) === String(w3._id)).length, 1);
  });

  it('a confirmed / completed / cancelled request never changes because of a late response', async () => {
    for (const status of ['confirmed', 'in_progress', 'completed', 'cancelled', 'rejected']) {
      const r = await pendingReq([w1], { status });
      const res = await respond(w1, r._id, { action: 'accept' });
      assert.ok([409, 410].includes(res.status), `${status}: ${res.status}`);
      assert.equal((await P(r._id)).status, status);
    }
  });
});

describe('team leader claim', () => {
  const leader = (over = {}) => hire.makeWorker({ workerType: 'TEAM_LEADER', teamId: new h.mongoose.Types.ObjectId(), ...over });

  it('exactly one leader wins a group request, even when several accept at once', async () => {
    const [l1, l2, l3] = [await leader(), await leader(), await leader()];
    const r = await hire.makeRequest(farmer, [l1, l2, l3], {
      requestType: 'team_leader', bookingMode: 'TEAM_LEADER', requiredWorkers: 8,
      dispatchedTo: [l1, l2, l3].map(l => ({ workerId: l._id, status: 'pending' })), workerOffers: [], status: 'pending'
    });
    const rs = await Promise.all([l1, l2, l3].map(l => respond(l, r._id, { action: 'accept' })));
    assert.equal(rs.filter(x => x.status === 200).length, 1, rs.map(x => x.status).join());
    assert.equal(rs.filter(x => x.status === 409).length, 2);
    const req = await P(r._id);
    assert.ok(req.teamLeaderId);
    assert.equal(req.workerOffers.length, 1);
    assert.equal(String(req.workerOffers[0].workerId), String(req.teamLeaderId));
  });

  it('a leader who fails the availability check does not claim the request or withdraw the others', async () => {
    const [l1, l2] = [await leader(), await leader()];
    const busy = await hire.confirmedBooking(ctx, farmer, [l1], { cash: true, scheduledDate: day3() });
    const f2 = await h.make.farmer();
    const r = await hire.makeRequest(f2, [l1, l2], {
      requestType: 'team_leader', bookingMode: 'TEAM_LEADER', requiredWorkers: 8, scheduledDate: busy.request.scheduledDate,
      dispatchedTo: [l1, l2].map(l => ({ workerId: l._id, status: 'pending' })), workerOffers: [], status: 'pending'
    });
    assert.equal((await respond(l1, r._id, { action: 'accept' })).status, 409);
    const req = await P(r._id);
    assert.equal(req.teamLeaderId, null);
    assert.ok(req.dispatchedTo.every(d => d.status === 'pending'), 'nobody was withdrawn');
    assert.equal((await respond(l2, r._id, { action: 'accept' })).status, 200);
  });
});

describe('request creation bounds', () => {
  const create = (body) => ctx.api.post('/api/users/farmer-worker-request').set(h.auth(farmer, 'USER')).send({
    workTitle: 'Harvest', workDescription: 'Harvest the wheat field A', requiredWorkers: 2, bookingType: 'HOURLY',
    scheduledDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), startTime: '09:00', endTime: '13:00',
    minRate: 100, maxRate: 150, location: { city: 'Pune', lat: 18.5, lng: 73.8 }, ...body
  });

  it('rejects absurd crews, rates, durations and unknown/ineligible target workers', async () => {
    assert.equal((await create({ requiredWorkers: 5000 })).status, 400);
    assert.equal((await create({ minRate: 5, maxRate: 1e9 })).status, 400);
    assert.equal((await create({ targetedWorkerId: 'nope' })).status, 400);
    await h.M('Worker').updateOne({ _id: w1._id }, { $set: { isRestricted: true } });
    assert.equal((await create({ targetedWorkerId: String(w1._id) })).status, 400);
    assert.equal((await ctx.api.post('/api/users/farmer-worker-request').set(h.auth(farmer, 'USER')).send({
      workTitle: 'Dig', workDescription: 'Dig the irrigation canal', requiredWorkers: 1, bookingType: 'DAILY',
      startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), numberOfDays: 365, minDailyRate: 400, location: { city: 'Pune' }
    })).status, 400);
  });
});

describe('authentication hygiene', () => {
  it('suspended workers and deactivated users are locked out; query-string tokens never authorise writes', async () => {
    await h.M('Worker').updateOne({ _id: w1._id }, { $set: { approvalStatus: 'suspended' } });
    assert.equal((await ctx.api.get('/api/workers/booking-requests').set(h.auth(w1, 'WORKER'))).status, 403);
    await h.M('User').updateOne({ _id: farmer._id }, { $set: { isActive: false } });
    assert.equal((await ctx.api.post('/api/users/farmer-worker-request').set(h.auth(farmer, 'USER')).send({})).status, 403);

    const tok = h.token(w2, 'WORKER');
    assert.equal((await ctx.api.get(`/api/workers/booking-requests?token=${tok}`)).status, 200, 'download-style GET links keep working');
    const r = await pendingReq([w2]);
    assert.equal((await ctx.api.patch(`/api/workers/farmer-request/${r._id}/respond?token=${tok}`).send({ action: 'accept' })).status, 401);
  });
});

describe('conflict engine', () => {
  const ctl = () => require('../controllers/workerControllers/farmerWorkerRequestController');

  it('fails CLOSED when it cannot prove the worker is free', async () => {
    assert.equal(await ctl().hasTimeConflict(w1._id, null, '09:00', '10:00'), true);
    assert.equal(await ctl().hasTimeConflict(w1._id, new Date(), 'bad', '10:00'), true);
    assert.equal(await ctl().hasDailyConflict(w1._id, null, null), true);
  });

  it('a worker mid-way through a DAILY job (in_progress) is not free for an overlapping DAILY request', async () => {
    const start = hire.today(); const end = new Date(start); end.setDate(end.getDate() + 3);
    await hire.makeRequest(farmer, [w1], { bookingType: 'DAILY', startDate: start, endDate: end, numberOfDays: 4, status: 'in_progress', finalWorkers: [w1._id], scheduledDate: null });
    assert.equal(await ctl().hasDailyConflict(w1._id, end, new Date(end.getTime() + 86400000)), true);
    assert.equal(await ctl().hasDailyConflict(w2._id, end, new Date(end.getTime() + 86400000)), false);
  });
});

'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const hire = require('./helpers/hiring');
const { settleAssignment } = require('../services/workerSettlementService');

let ctx, farmer, leader;

before(async () => {
  ctx = await h.boot({ replSet: true });
});

after(async () => {
  await h.shutdown();
});

beforeEach(async () => {
  await h.clearDb();
  h.fakeIo.reset();
  await h.make.settings({
    workerCommissionPercentage: 10,
    workerPlatformChargePercentage: 5,
    maxWorkerDues: 2000,
    workerCashPaymentEnabled: true
  });
  farmer = await h.make.farmer();
  leader = await hire.makeWorker({
    name: 'Leader Ramesh',
    workerType: 'TEAM_LEADER',
    dailyRate: 600,
    hourlyRate: 100,
    wallet: { balance: 0 },
    outstandingDues: 0
  });
});

const asLeader = (api) => ({
  post: (path, body = {}) => api.post(`/api/workers/team${path}`).set(h.auth(leader, 'WORKER')).send(body),
  put:  (path, body = {}) => api.put(`/api/workers/team${path}`).set(h.auth(leader, 'WORKER')).send(body),
  get:  (path) => api.get(`/api/workers/team${path}`).set(h.auth(leader, 'WORKER')),
  respondGroup: (id, body = {}) => api.patch(`/api/workers/group-request/${id}/respond`).set(h.auth(leader, 'WORKER')).send(body),
  selectWorkers: (id, workerIds) => api.patch(`/api/workers/group-request/${id}/select-workers`).set(h.auth(leader, 'WORKER')).send({ workerIds })
});

const asFarmer = (api) => ({
  createGroup: (body) => api.post('/api/users/group-request').set(h.auth(farmer, 'USER')).send(body),
  confirmCash: (id) => api.post(`/api/users/group-request/${id}/confirm-cash`).set(h.auth(farmer, 'USER')).send({})
});

describe('Team Leader & Offline Member Full Cash Settlement Flow', () => {
  it('1. Team Leader can register an offline worker with agricultural skills and daily wage', async () => {
    const L = asLeader(ctx.api);
    const res = await L.post('/offline-member', {
      name: 'Shyam Singh',
      phone: '9876543210',
      skills: ['Harvesting', 'Plowing & Tillage'],
      dailyRate: 500,
      experienceYears: 4
    });

    assert.equal(res.status, 201, `Failed to create offline member: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.member.name, 'Shyam Singh');

    const offlineMember = await h.M('Worker').findById(res.body.member._id);
    assert.ok(offlineMember);
    assert.equal(offlineMember.isOfflineMember, true);
    assert.equal(String(offlineMember.managedByLeaderId), String(leader._id));
    assert.deepEqual(offlineMember.skills, ['Harvesting', 'Plowing & Tillage']);
    assert.equal(offlineMember.dailyRate, 500);
  });

  it('2. Team Leader can update offline member skills, wage, and experience', async () => {
    const L = asLeader(ctx.api);
    const createRes = await L.post('/offline-member', {
      name: 'Radhe Lal',
      skills: ['Harvesting'],
      dailyRate: 450,
      experienceYears: 2
    });
    assert.equal(createRes.status, 201);
    const memberId = createRes.body.member._id;

    const updateRes = await L.put(`/offline-member/${memberId}`, {
      name: 'Radhe Lal (Master)',
      skills: ['Harvesting', 'Pesticide Spraying', 'Tractor Operation'],
      dailyRate: 600,
      experienceYears: 5
    });

    assert.equal(updateRes.status, 200, `Failed to update offline member: ${JSON.stringify(updateRes.body)}`);
    assert.equal(updateRes.body.success, true);
    assert.equal(updateRes.body.member.name, 'Radhe Lal (Master)');

    const updated = await h.M('Worker').findById(memberId);
    assert.equal(updated.name, 'Radhe Lal (Master)');
    assert.equal(updated.dailyRate, 600);
    assert.equal(updated.experienceYears, 5);
    assert.deepEqual(updated.skills, ['Harvesting', 'Pesticide Spraying', 'Tractor Operation']);
  });

  it('3. Complete Group Request -> Leader Worker Selection -> Farmer Cash Booking -> Team Leader Negative Wallet Debiting', async () => {
    const L = asLeader(ctx.api);
    const F = asFarmer(ctx.api);

    // Step A: Team Leader adds offline member
    const offlineRes = await L.post('/offline-member', {
      name: 'Kallu Ram',
      skills: ['Harvesting'],
      dailyRate: 500
    });
    assert.equal(offlineRes.status, 201);
    const offlineMemberId = offlineRes.body.member._id;

    // Step B: Farmer sends Group Request to Team Leader
    const today = new Date();
    today.setHours(8, 0, 0, 0);

    const groupReqRes = await F.createGroup({
      teamLeaderId: String(leader._id),
      workTitle: 'Paddy Harvesting',
      workCategory: 'Harvesting',
      requiredWorkers: 1,
      requiredSkills: ['Harvesting'],
      farmerOfferedRatePerWorker: 500,
      bookingType: 'DAILY',
      rateUnit: 'daily',
      startDate: today.toISOString(),
      numberOfDays: 1,
      scheduledDate: today.toISOString(),
      startTime: '08:00',
      endTime: '17:00',
      addressLine1: 'Village Farm 12',
      city: 'Nagpur'
    });

    assert.equal(groupReqRes.status, 201, `Failed to create group request: ${JSON.stringify(groupReqRes.body)}`);
    const groupRequestId = groupReqRes.body.data._id;

    // Step C: Leader accepts group request
    const acceptRes = await L.respondGroup(groupRequestId, { action: 'accept' });
    assert.equal(acceptRes.status, 200);

    // Step D: Leader selects offline worker and submits team
    const selectRes = await L.selectWorkers(groupRequestId, [offlineMemberId]);
    assert.equal(selectRes.status, 200, `Failed to select workers: ${JSON.stringify(selectRes.body)}`);

    const groupReqDoc = await h.M('WorkerGroupRequest').findById(groupRequestId);
    assert.equal(groupReqDoc.status, 'awaiting_payment');
    assert.ok(groupReqDoc.financialSnapshot);
    assert.equal(groupReqDoc.financialSnapshot.selectedWorkerCount, 1);
    assert.equal(groupReqDoc.financialSnapshot.agreedRatePerWorker, 500);

    // Step E: Farmer confirms booking with Cash to Team Leader on Completion
    const confirmCashRes = await F.confirmCash(groupRequestId);
    assert.equal(confirmCashRes.status, 200, `Cash confirmation failed: ${JSON.stringify(confirmCashRes.body)}`);
    assert.equal(confirmCashRes.body.success, true);

    const confirmedGroupReq = await h.M('WorkerGroupRequest').findById(groupRequestId);
    assert.equal(confirmedGroupReq.status, 'confirmed');
    assert.equal(confirmedGroupReq.paymentMethod, 'cash');
    assert.equal(confirmedGroupReq.paymentStatus, 'cash_pending');

    // Verify IndWorkerAssignment created with leader link & isCashBooking
    const assignment = await h.M('IndWorkerAssignment').findOne({
      parentRequestId: confirmedGroupReq.workerBookingRequestId,
      workerId: offlineMemberId
    });
    assert.ok(assignment, 'Assignment should be created for offline member');
    assert.equal(assignment.isCashBooking, true);
    assert.equal(String(assignment.teamLeaderId), String(leader._id));

    // Step F: Job completes -> Set completionStatus to OTP_VERIFIED and run settlement
    // In cash booking: farmer pays ₹500 cash to Team Leader.
    // Platform fee & commission must be debited from the Team Leader's wallet (debtorId).
    // Leader has ₹0 balance initially -> must become negative (outstandingDues > 0).
    await h.M('IndWorkerAssignment').updateOne(
      { _id: assignment._id },
      { $set: { completionStatus: 'OTP_VERIFIED', workedDays: 1 } }
    );

    const settleResult = await settleAssignment(assignment._id);
    assert.equal(settleResult.claimed, true, 'Settlement must be claimed');

    // Verify Team Leader's dues / negative wallet
    const updatedLeader = await h.M('Worker').findById(leader._id);
    assert.ok(updatedLeader.outstandingDues > 0, `Leader outstandingDues should be > 0, got ${updatedLeader.outstandingDues}`);
    
    // Commission is 10% of 500 = 50, platform fee is 5% = 25 -> Total platform charge = 75
    assert.equal(updatedLeader.outstandingDues, 75, `Expected 75 dues (50 comm + 25 plat fee), got ${updatedLeader.outstandingDues}`);

    // Verify cash_collected transaction was created for debtorId = leader._id
    const cashTx = await h.M('Transaction').findOne({
      workerId: leader._id,
      type: 'cash_collected'
    });
    assert.ok(cashTx, 'Transaction of type cash_collected must be recorded');
    assert.equal(String(cashTx.workerId), String(leader._id), 'Transaction workerId must be Team Leader');
  });

  it('4. Team Leader exceeding maximum allowed dues cannot accept new cash bookings', async () => {
    // Set low max dues limit
    await h.make.settings({
      maxWorkerDues: 100,
      workerCashPaymentEnabled: true
    });

    // Make leader have 150 outstanding dues (exceeding 100 limit)
    await h.M('Worker').updateOne(
      { _id: leader._id },
      { $set: { outstandingDues: 150, isRestricted: false } }
    );

    const L = asLeader(ctx.api);
    const F = asFarmer(ctx.api);

    // Setup an offline member and group request ready for payment
    const offlineRes = await L.post('/offline-member', { name: 'Moti Ram', skills: ['Harvesting'] });
    assert.equal(offlineRes.status, 201, `Failed to create offline member: ${JSON.stringify(offlineRes.body)}`);
    const today = new Date();
    today.setHours(8, 0, 0, 0);

    const groupReqRes = await F.createGroup({
      teamLeaderId: String(leader._id),
      workTitle: 'Field Harvesting',
      workCategory: 'Harvesting',
      requiredWorkers: 1,
      farmerOfferedRatePerWorker: 500,
      bookingType: 'DAILY',
      rateUnit: 'daily',
      startDate: today.toISOString(),
      numberOfDays: 1,
      scheduledDate: today.toISOString(),
      startTime: '08:00',
      endTime: '17:00'
    });
    assert.equal(groupReqRes.status, 201, `Failed to create group request: ${JSON.stringify(groupReqRes.body)}`);
    const groupRequestId = groupReqRes.body.data._id;

    await L.respondGroup(groupRequestId, { action: 'accept' });
    await L.selectWorkers(groupRequestId, [offlineRes.body.member._id]);

    // Farmer tries to confirm with Cash -> Should be rejected with 403 due to leader dues
    const confirmCashRes = await F.confirmCash(groupRequestId);
    assert.equal(confirmCashRes.status, 403);
    assert.equal(confirmCashRes.body.success, false);
    assert.match(confirmCashRes.body.message, /unpaid platform dues/i);
  });
});

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
const F = () => hire.asFarmer(ctx.api, farmer);
const count = (m, q) => h.M(m).countDocuments(q);

describe('select-workers validation', () => {
  it('dedupes ids, caps at requiredWorkers and rejects non-ids', async () => {
    const r = await hire.makeRequest(farmer, [w1, w2, w3], { requiredWorkers: 2 });
    assert.equal((await F().select(r._id, ['x'])).status, 400);
    assert.equal((await F().select(r._id, [w1._id, w2._id, w3._id])).status, 400, 'more than required');
    const ok = await F().select(r._id, [w1._id, w1._id]);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.financials.selectedWorkerCount, 1, 'duplicate collapsed, charged once');
  });

  it('a worker who declined after accepting is not selectable', async () => {
    const r = await hire.makeRequest(farmer, [w1, w2]);
    const w1h = hire.asWorker(ctx.api, w1);
    assert.equal((await w1h.respond(r._id, { action: 'reject' })).status, 200);
    const res = await F().select(r._id, [w1._id]);
    assert.equal(res.status, 400);
    assert.equal((await F().select(r._id, [w2._id])).status, 200);
  });

  it('refuses workers who are suspended/restricted/inactive', async () => {
    const r = await hire.makeRequest(farmer, [w1, w2]);
    await h.M('Worker').updateOne({ _id: w1._id }, { $set: { isRestricted: true } });
    assert.equal((await F().select(r._id, [w1._id])).status, 409);
  });
});

describe('payment integrity', () => {
  it('price changed after the order was created: the old order cannot confirm and is refunded', async () => {
    const r = await hire.makeRequest(farmer, [w1, w2, w3]);
    assert.equal((await F().select(r._id, [w1._id])).status, 200);
    const order = (await F().createPayment(r._id)).body.data;
    assert.equal((await F().select(r._id, [w1._id, w2._id, w3._id])).status, 200); // price triples

    const res = await F().verify(r._id, order.orderId, 'valid_sig', 'pay_old');
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.refunded, true);
    assert.equal(await count('IndWorkerAssignment', { parentRequestId: r._id }), 0, 'no assignments for an underpaid booking');
    assert.equal(await hire.farmerWalletBalance(farmer), order.amount / 100, 'the money is back in the wallet');
    const again = await F().verify(r._id, order.orderId, 'valid_sig', 'pay_old');
    assert.equal(await hire.farmerWalletBalance(farmer), order.amount / 100, 'a replay refunds only once');
    assert.ok([409].includes(again.status));
  });

  it('parallel verifies create exactly one set of assignments and bookings', async () => {
    const r = await hire.makeRequest(farmer, [w1, w2]);
    await F().select(r._id, [w1._id, w2._id]);
    const order = (await F().createPayment(r._id)).body.data;
    const rs = await Promise.all([1, 2, 3, 4].map(() => F().verify(r._id, order.orderId)));
    assert.ok(rs.some(x => x.status === 200), rs.map(x => x.status).join());
    assert.equal(await count('IndWorkerAssignment', { parentRequestId: r._id }), 2);
    assert.equal(await count('Booking', { workerRequestId: r._id }), 2);
    const req = await h.M('WorkerBookingRequest').findById(r._id);
    assert.equal(req.status, 'confirmed');
    assert.equal(req.paymentStatus, 'success');
    assert.equal(await hire.farmerWalletBalance(farmer), 0, 'no stray refund');
  });

  it('a bad signature never changes booking state', async () => {
    const r = await hire.makeRequest(farmer, [w1]);
    await F().select(r._id, [w1._id]);
    const order = (await F().createPayment(r._id)).body.data;
    assert.equal((await F().verify(r._id, order.orderId, 'forged')).status, 400);
    const req = await h.M('WorkerBookingRequest').findById(r._id);
    assert.equal(req.paymentStatus, 'pending');
    assert.equal(await count('IndWorkerAssignment', { parentRequestId: r._id }), 0);
  });

  it('cannot create an order for a cancelled request; a late payment on it is refunded', async () => {
    const r = await hire.makeRequest(farmer, [w1]);
    await F().select(r._id, [w1._id]);
    const order = (await F().createPayment(r._id)).body.data;
    assert.equal((await F().cancel(r._id)).status, 200);
    assert.equal((await F().createPayment(r._id)).status, 404);
    const res = await F().verify(r._id, order.orderId, 'valid_sig', 'pay_late');
    assert.equal(res.status, 409);
    assert.equal(res.body.refunded, true);
    assert.equal((await h.M('WorkerBookingRequest').findById(r._id)).status, 'cancelled', 'a dead request is not revived');
    assert.equal(await hire.farmerWalletBalance(farmer), order.amount / 100);
  });

  it('confirm-cash then online payment cannot create a second set of assignments', async () => {
    const r = await hire.makeRequest(farmer, [w1]);
    await F().select(r._id, [w1._id]);
    const order = (await F().createPayment(r._id)).body.data;
    assert.equal((await F().cash(r._id)).status, 200);
    assert.equal((await F().createPayment(r._id)).status, 404);
    const res = await F().verify(r._id, order.orderId, 'valid_sig', 'pay_x');
    assert.equal(res.status, 409);
    assert.equal(await count('IndWorkerAssignment', { parentRequestId: r._id }), 1);
    assert.equal(await hire.farmerWalletBalance(farmer), order.amount / 100, 'the stray online payment is returned');
  });

  it('parallel cash confirms are single-shot', async () => {
    const r = await hire.makeRequest(farmer, [w1, w2]);
    await F().select(r._id, [w1._id, w2._id]);
    const rs = await Promise.all([1, 2, 3].map(() => F().cash(r._id)));
    assert.ok(rs.filter(x => x.status === 200).length >= 1);
    assert.equal(await count('IndWorkerAssignment', { parentRequestId: r._id }), 2);
  });

  it('commission 0% is honoured (not silently turned into 10%)', async () => {
    await h.make.settings({ workerCommissionPercentage: 0 });
    const r = await hire.makeRequest(farmer, [w1]);
    await F().select(r._id, [w1._id]);
    await F().cash(r._id);
    const a = await h.M('IndWorkerAssignment').findOne({ parentRequestId: r._id });
    assert.equal(a.commissionRate, 0);
    assert.equal(a.commissionAmount, 0);
  });

  it('a worker committed elsewhere at the same time cannot be confirmed twice', async () => {
    const f2 = await h.make.farmer();
    const day = hire.tomorrow();
    const rA = await hire.makeRequest(farmer, [w1], { scheduledDate: day });
    const rB = await hire.makeRequest(f2, [w1], { scheduledDate: day });
    await hire.asFarmer(ctx.api, farmer).select(rA._id, [w1._id]);
    await hire.asFarmer(ctx.api, f2).select(rB._id, [w1._id]);
    const [a, b] = await Promise.all([hire.asFarmer(ctx.api, farmer).cash(rA._id), hire.asFarmer(ctx.api, f2).cash(rB._id)]);
    const wins = [a, b].filter(x => x.status === 200).length;
    assert.equal(wins, 1, `${a.status}/${b.status}`);
    assert.equal(await count('IndWorkerAssignment', { workerId: w1._id, assignmentStatus: 'CONFIRMED' }), 1);
  });
});

describe('crash recovery', () => {
  it('a confirmation that crashed after the claim can be re-run: no duplicates, and it completes', async () => {
    const r = await hire.makeRequest(farmer, [w1, w2]);
    await F().select(r._id, [w1._id, w2._id]);
    const order = (await F().createPayment(r._id)).body.data;
    // simulate: claim taken, ONE assignment written, then the process died
    await h.M('WorkerBookingRequest').updateOne({ _id: r._id }, { $set: { paymentStatus: 'processing', confirmClaimedAt: new Date() } });
    const busy = await F().verify(r._id, order.orderId, 'valid_sig', 'pay_crash');
    assert.equal(busy.status, 409, 'a live claim is respected');
    await h.M('WorkerBookingRequest').updateOne({ _id: r._id }, { $set: { confirmClaimedAt: new Date(Date.now() - 10 * 60 * 1000) } });
    await h.M('IndWorkerAssignment').create({
      parentRequestId: r._id, farmerId: farmer._id, workerId: w1._id, agreedRate: 120, grossAmount: 480, commissionRate: 10, commissionAmount: 48, netEarning: 432,
      creationIdempotencyKey: `assign_${r._id}_${w1._id}`, bookingType: 'HOURLY'
    });
    const again = await F().verify(r._id, order.orderId, 'valid_sig', 'pay_crash');
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(await count('IndWorkerAssignment', { parentRequestId: r._id }), 2, 'the half-written assignment was adopted, not duplicated');
    assert.equal((await h.M('WorkerBookingRequest').findById(r._id)).status, 'confirmed');
  });
});

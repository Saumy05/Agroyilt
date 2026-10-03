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
  await h.make.settings({ workerCommissionPercentage: 10, workerPlatformChargePercentage: 10 });
  farmer = await h.make.farmer();
  [w1, w2] = [await hire.makeWorker(), await hire.makeWorker()];
});
const A = (id) => h.M('IndWorkerAssignment').findById(id);
const E = (id) => h.M('IndWorkerExtension').findById(id);
const P = (id) => h.M('WorkerBookingRequest').findById(id);
const api = (m, path, who, body) => ctx.api[m](path).set(who).send(body || {});
const asF = (f = farmer) => h.auth(f, 'USER');
const base = (b) => `/api/users/farmer-worker-request/${b.request._id}`;
const createExt = (b, body, f = farmer) => api('post', `${base(b)}/extension`, asF(f), body);
const respond = (ext, w, response) => api('post', `/api/workers/assignments/extension/${ext}/respond`, h.auth(w, 'WORKER'), { response });
const payOrder = (b, ext) => api('post', `${base(b)}/extension/${ext}/create-payment`, asF());
const verify = (b, ext, orderId, pay = 'pay_ext_1', sig = 'valid_sig') => api('post', `${base(b)}/extension/${ext}/verify-payment`, asF(), { razorpay_order_id: orderId, razorpay_payment_id: pay, razorpay_signature: sig });

// 120/h × 60 min = ₹120 gross, 10% commission, 10% platform fee → farmer pays ₹132
const hourly = async (over = {}) => hire.confirmedBooking(ctx, farmer, [w1, w2], { rate: 120, minRate: 100, maxRate: 150, ...over });

describe('hourly extension (online)', () => {
  it('payment is refused until the workers answered; then pays the frozen amount; applies exactly once', async () => {
    const b = await hourly();
    const created = await createExt(b, { selectedWorkerIds: [String(w1._id)], extensionMinutes: 60 });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const extId = created.body.data._id;

    assert.equal((await payOrder(b, extId)).status, 409, 'workers still responding');
    assert.equal((await respond(extId, w2, 'accept')).status, 403, 'not a requested worker');
    assert.equal((await respond(extId, w1, 'accept')).status, 200);
    assert.equal((await respond(extId, w1, 'accept')).status, 400, 'cannot answer twice');

    const ext = await E(extId);
    assert.equal(ext.status, 'PAYMENT_PENDING');
    assert.equal(ext.totalPayable, 132);

    const order = (await payOrder(b, extId)).body.data;
    assert.equal(order.amount, 13200);
    const again = (await payOrder(b, extId)).body.data;
    assert.equal(again.orderId, order.orderId, 'the live order is reused');

    const a0 = await A(b.assignments[0]._id);
    const rs = await Promise.all([1, 2, 3].map(() => verify(b, extId, order.orderId)));
    assert.ok(rs.some(r => r.status === 200), rs.map(r => r.status).join());
    const a1 = await A(b.assignments[0]._id);
    assert.equal(a1.grossAmount, a0.grossAmount + 120, 'applied once, not three times');
    assert.equal(a1.netEarning, Math.round((a0.netEarning + 108) * 100) / 100);
    assert.equal((await E(extId)).status, 'CONFIRMED');
    assert.equal(await hire.farmerWalletBalance(farmer), 0, 'no stray refund');
    const parent = await P(b.request._id);
    assert.equal(parent.endTime, '14:00', 'the booking\'s schedule reflects the extra hour');
  });

  it('only one extension can be open per booking, even under parallel creates; input is bounded', async () => {
    const b = await hourly();
    const body = { selectedWorkerIds: [String(w1._id)], extensionMinutes: 30 };
    const rs = await Promise.all([1, 2, 3, 4].map(() => createExt(b, body)));
    assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join());
    assert.equal(await h.M('IndWorkerExtension').countDocuments({ parentRequestId: b.request._id }), 1);

    const c = await hourly({ scheduledDate: new Date(Date.now() + 4 * 86400000) });
    for (const m of [1, 4, 5000, 12.5, 'abc']) {
      assert.equal((await createExt(c, { selectedWorkerIds: [String(w1._id)], extensionMinutes: m })).status, 400, String(m));
    }
    assert.equal((await createExt(c, { selectedWorkerIds: ['nope'], extensionMinutes: 30 })).status, 400);
  });

  it('a price mismatch or a dead extension never keeps the money: it is refunded', async () => {
    const b = await hourly();
    const extId = (await createExt(b, { selectedWorkerIds: [String(w1._id)], extensionMinutes: 60 })).body.data._id;
    await respond(extId, w1, 'accept');
    const order = (await payOrder(b, extId)).body.data;
    await h.M('IndWorkerExtension').updateOne({ _id: extId }, { $set: { totalPayable: 999 } });
    const res = await verify(b, extId, order.orderId, 'pay_mismatch');
    assert.equal(res.status, 409);
    assert.equal(res.body.refunded, true);
    assert.equal(await hire.farmerWalletBalance(farmer), 132);
    assert.equal((await A(b.assignments[0]._id)).grossAmount, b.assignments[0].grossAmount, 'nothing applied');
  });

  it('if the worker already settled/cancelled meanwhile, their extension cannot be applied and is refunded', async () => {
    const b = await hourly();
    const extId = (await createExt(b, { selectedWorkerIds: [String(w1._id)], extensionMinutes: 60 })).body.data._id;
    await respond(extId, w1, 'accept');
    const order = (await payOrder(b, extId)).body.data;
    await h.M('IndWorkerAssignment').updateOne({ _id: b.assignments[0]._id }, { $set: { assignmentStatus: 'CANCELLED' } });
    const res = await verify(b, extId, order.orderId, 'pay_late_ext');
    assert.equal(res.status, 200);
    assert.equal(await hire.farmerWalletBalance(farmer), 132, 'the whole share is given back');
    assert.equal((await A(b.assignments[0]._id)).grossAmount, b.assignments[0].grossAmount);
  });

  it('a timed-out evaluation expires the extension; paying its order afterwards is refunded', async () => {
    const b = await hourly();
    const extId = (await createExt(b, { selectedWorkerIds: [String(w1._id)], extensionMinutes: 60 })).body.data._id;
    await h.M('IndWorkerExtension').updateOne({ _id: extId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await respond(extId, w1, 'accept')).status, 400, 'too late');
    assert.equal((await E(extId)).status, 'EXPIRED');
    // forge an order for it (as if the farmer had one open) and pay
    await h.M('IndWorkerExtension').updateOne({ _id: extId }, { $set: { totalPayable: 132 }, $push: { paymentOrders: { orderId: 'order_old', amountPaise: 13200 } } });
    const res = await verify(b, extId, 'order_old', 'pay_after_expiry');
    assert.equal(res.status, 409);
    assert.equal(await hire.farmerWalletBalance(farmer), 132);
    // …and the booking can be extended again afterwards
    assert.equal((await createExt(b, { selectedWorkerIds: [String(w1._id)], extensionMinutes: 30 })).status, 200);
  });

  it('declined by everyone → REJECTED; the farmer is not charged and can ask again', async () => {
    const b = await hourly();
    const extId = (await createExt(b, { selectedWorkerIds: [String(w1._id)], extensionMinutes: 60 })).body.data._id;
    await respond(extId, w1, 'reject');
    assert.equal((await E(extId)).status, 'REJECTED');
    assert.equal((await payOrder(b, extId)).status, 400);
    assert.equal((await createExt(b, { selectedWorkerIds: [String(w1._id)], extensionMinutes: 30 })).status, 200);
  });

  it('extension only on active bookings', async () => {
    const r = await hire.makeRequest(farmer, [w1]);
    const res = await api('post', `/api/users/farmer-worker-request/${r._id}/extension`, asF(), { selectedWorkerIds: [String(w1._id)], extensionMinutes: 30 });
    assert.equal(res.status, 409);
  });

  it('listing extensions is owner-only', async () => {
    const b = await hourly();
    await createExt(b, { selectedWorkerIds: [String(w1._id)], extensionMinutes: 30 });
    const stranger = await h.make.farmer();
    assert.equal((await api('get', `${base(b)}/extensions`, asF())).status, 200);
    assert.equal((await api('get', `${base(b)}/extensions`, asF(stranger))).status, 404);
    assert.equal((await api('get', `${base(b)}/extensions`, h.auth(w1, 'WORKER'))).status, 403);
  });
});

describe('extension on a cash booking', () => {
  it('has no online step: it applies as soon as the worker accepts, once, and the commission follows', async () => {
    const b = await hourly({ cash: true });
    const extId = (await createExt(b, { selectedWorkerIds: [String(w1._id)], extensionMinutes: 60 })).body.data._id;
    assert.equal((await E(extId)).paymentMode, 'cash');
    assert.equal((await respond(extId, w1, 'accept')).status, 200);
    const ext = await E(extId);
    assert.equal(ext.status, 'CONFIRMED');
    assert.equal((await A(b.assignments[0]._id)).grossAmount, b.assignments[0].grossAmount + 120);
    assert.equal((await payOrder(b, extId)).status, 400);
  });
});

describe('gateway webhook for worker payments', () => {
  const hook = (orderId, paymentId, amount) => ctx.api.post('/api/webhooks/payment/razorpay').send({
    event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, notes: {} } } }
  });

  it('a booking payment captured while the app was closed still confirms the booking — once, even on retries', async () => {
    const r = await hire.makeRequest(farmer, [w1, w2], { scheduledDate: hire.tomorrow() });
    await hire.asFarmer(ctx.api, farmer).select(r._id, [w1._id, w2._id]);
    const order = (await hire.asFarmer(ctx.api, farmer).createPayment(r._id)).body.data;
    const rs = await Promise.all([1, 2, 3].map(() => hook(order.orderId, 'pay_wh_1', order.amount)));
    // a delivery that lands while another is mid-confirmation asks the gateway to retry (500); never a duplicate
    assert.ok(rs.some(x => x.status === 200) && rs.every(x => [200, 500].includes(x.status)), rs.map(x => x.status).join());
    assert.equal((await hook(order.orderId, 'pay_wh_1', order.amount)).status, 200, 'the retry is a clean no-op');
    const req = await P(r._id);
    assert.equal(req.status, 'confirmed');
    assert.equal(req.paymentStatus, 'success');
    assert.equal(await h.M('IndWorkerAssignment').countDocuments({ parentRequestId: r._id }), 2);
    // the app comes back and verifies the same payment: idempotent success, no duplicates
    const v = await hire.asFarmer(ctx.api, farmer).verify(r._id, order.orderId, 'valid_sig', 'pay_wh_1');
    assert.equal(v.status, 200);
    assert.equal(await h.M('IndWorkerAssignment').countDocuments({ parentRequestId: r._id }), 2);
    assert.equal(await hire.farmerWalletBalance(farmer), 0);
  });

  it('a webhook for a booking that was cancelled refunds instead of reviving it', async () => {
    const r = await hire.makeRequest(farmer, [w1], { scheduledDate: hire.tomorrow() });
    await hire.asFarmer(ctx.api, farmer).select(r._id, [w1._id]);
    const order = (await hire.asFarmer(ctx.api, farmer).createPayment(r._id)).body.data;
    await hire.asFarmer(ctx.api, farmer).cancel(r._id);
    const res = await hook(order.orderId, 'pay_wh_late', order.amount);
    assert.equal(res.status, 200);
    assert.equal((await P(r._id)).status, 'cancelled');
    assert.equal(await hire.farmerWalletBalance(farmer), order.amount / 100);
  });

  it('an extension payment arriving only via the webhook is applied once', async () => {
    const b = await hourly();
    const extId = (await createExt(b, { selectedWorkerIds: [String(w1._id)], extensionMinutes: 60 })).body.data._id;
    await respond(extId, w1, 'accept');
    const order = (await payOrder(b, extId)).body.data;
    await Promise.all([1, 2].map(() => hook(order.orderId, 'pay_wh_ext', order.amount)));
    assert.equal((await E(extId)).status, 'CONFIRMED');
    assert.equal((await A(b.assignments[0]._id)).grossAmount, b.assignments[0].grossAmount + 120);
  });
});

'use strict';
const crypto = require('node:crypto');
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const f = require('./helpers/flow');

const SECRET = 'whsec_test_123';
let ctx, w;
before(async () => { process.env.RAZORPAY_WEBHOOK_SECRET = SECRET; ctx = await h.boot({ replSet: true }); });
after(async () => { delete process.env.RAZORPAY_WEBHOOK_SECRET; await h.shutdown(); });
beforeEach(async () => { await h.clearDb(); h.fakeIo.reset(); w = await f.world(ctx); });

const event = (bookingId, paymentId, amountRupees, extra = {}) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: 'order_x', amount: Math.round(amountRupees * 100), notes: { bookingId: String(bookingId) }, ...extra } } }
});
const send = (body, sig) => {
  const signature = sig ?? crypto.createHmac('sha256', SECRET).update(JSON.stringify(body)).digest('hex');
  return w.api.post('/api/webhooks/payment/razorpay').set('x-razorpay-signature', signature).send(body);
};

describe('Razorpay webhook', () => {
  it('rejects a missing or wrong signature when a secret is configured', async () => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay' });
    const ev = event(id, 'pay_w1', 1309);
    assert.equal((await w.api.post('/api/webhooks/payment/razorpay').send(ev)).status, 400);
    assert.equal((await send(ev, 'deadbeef')).status, 400);
    assert.equal((await send(ev, 'x'.repeat(64))).status, 400);
    assert.equal((await h.M('Booking').findById(id)).paymentStatus, 'pending');
  });

  it('marks the booking paid even if the app never calls /verify (crash after paying), once', async () => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay' });
    const ev = event(id, 'pay_w2', 1309);
    const rs = await Promise.all([send(ev), send(ev), send(ev)]);
    assert.ok(rs.every(r => r.status === 200), rs.map(r => r.status).join(','));
    const b = await h.M('Booking').findById(id);
    assert.equal(b.paymentStatus, 'success');
    assert.equal(b.advancePaidAmount, 1309);
    assert.equal(b.paymentMethod, 'razorpay');
    assert.equal(await h.M('Transaction').countDocuments({ bookingId: id, type: 'payment' }), 1);
    assert.deepEqual(b.processedPaymentIds, ['pay_w2']);
  });

  it('shares idempotency with POST /payments/verify: whichever comes second does nothing', async () => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay' });
    const order = (await w.api.post('/api/payments/create-order').set(h.auth(w.farmer, 'USER')).send({ bookingId: String(id) })).body.data.orderId;
    await send(event(id, 'pay_w3', 1309, { order_id: order }));
    const v = await w.api.post('/api/payments/verify').set(h.auth(w.farmer, 'USER')).send({ razorpay_order_id: order, razorpay_payment_id: 'pay_w3', razorpay_signature: 'valid_sig' });
    assert.equal(v.status, 200);
    assert.equal(v.body.alreadyProcessed, true);
    assert.equal(await h.M('Transaction').countDocuments({ bookingId: id, type: 'payment' }), 1);
    assert.equal((await h.M('Booking').findById(id)).advancePaidAmount, 1309);
  });

  it('a late payment on a cancelled booking is refunded, not kept', async () => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay' });
    await w.asFarmer(w.api.post(`/api/user/bookings/${id}/cancel`)).send({});
    await send(event(id, 'pay_w4', 1309));
    assert.equal((await f.userWallet(w.farmer)).balance, 1309);
    await send(event(id, 'pay_w4', 1309));
    assert.equal((await f.userWallet(w.farmer)).balance, 1309);
  });

  it('ignores other events and payments without a booking, and survives garbage', async () => {
    assert.equal((await send({ event: 'order.paid', payload: {} })).status, 200);
    assert.equal((await send(event('not-an-id', 'pay_w5', 10))).status, 200);
    assert.equal((await send({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_w6', amount: 100, notes: {} } } } })).status, 200);
  });
});

describe('Razorpay webhook — jobs without a vendor', () => {
  it('acknowledges (200) so the gateway stops retrying, and still records the payment', async () => {
    const worker = await h.M('Worker').create({ name: 'W' });
    const b = await h.M('Booking').create({
      bookingNumber: `WK${Date.now()}`, userId: w.farmer._id, workerId: worker._id, serviceName: 'Labour', serviceCategory: 'Labour',
      status: 'awaiting_payment', scheduledDate: new Date(), finalAmount: 500, providerType: 'WORKER'
    });
    const r = await send(event(b._id, 'pay_w7', 500));
    assert.equal(r.status, 200);
    assert.equal((await h.M('Booking').findById(b._id)).advancePaidAmount, 500);
  });
});

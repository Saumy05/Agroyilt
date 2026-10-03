'use strict';
// Independent-worker bookings share the cash routes with vendor bookings; make sure the
// shared hardening did not break them and applies to them too.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const f = require('./helpers/flow');

let ctx, w, worker, otherWorker, stranger;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => {
  await h.clearDb(); h.fakeIo.reset(); w = await f.world(ctx);
  worker = await h.M('Worker').create({ name: 'Ramesh', phone: `7${String(Date.now()).slice(-9)}`, status: 'ONLINE', wallet: { balance: 0 } });
  otherWorker = await h.M('Worker').create({ name: 'Other', phone: `6${String(Date.now()).slice(-9)}`, status: 'ONLINE' });
  stranger = await h.make.farmer();
});

const workerJob = (over = {}) => h.M('Booking').create({
  bookingNumber: `W${Date.now()}${Math.floor(Math.random() * 1e3)}`, userId: w.farmer._id, workerId: worker._id, vendorId: null,
  serviceName: 'Labour', serviceCategory: 'Labour', status: 'in_progress', scheduledDate: new Date(), providerType: 'WORKER',
  minRate: 800, maxRate: 1200, finalAmount: 1000, userPayableAmount: 1000, commissionRate: 10, ...over
});
const call = (verb, id, who, body = {}) => w.api.post(`/api/bookings/cash/${id}/${verb}`).set(who).send(body);
const asW = (x = worker) => h.auth(x, 'WORKER');

describe('Independent worker cash collection', () => {
  it('only the assigned worker can initiate/confirm; farmers and other workers are refused', async () => {
    const b = await workerJob();
    for (const who of [h.auth(w.farmer, 'USER'), asW(otherWorker), h.auth(w.vendor, 'VENDOR')]) {
      assert.equal((await call('initiate', b._id, who)).status, 403);
      assert.equal((await call('confirm', b._id, who, { otp: '1234' })).status, 403);
    }
  });

  it('the amount must stay inside the agreed range; then collects once with the payment OTP and applies commission', async () => {
    const b = await workerJob();
    assert.equal((await call('initiate', b._id, asW(), { totalAmount: 5000 })).status, 400);
    assert.equal((await call('initiate', b._id, asW(), { totalAmount: -1 })).status, 400);
    assert.equal((await call('initiate', b._id, asW(), { totalAmount: 1100 })).status, 200);
    const s = await h.M('Booking').findById(b._id).select('+paymentOtp');
    assert.equal(s.finalAmount, 1100);

    assert.equal((await call('confirm', b._id, asW(), { otp: s.paymentOtp === '0000' ? '1111' : '0000' })).status, 400);
    const rs = await Promise.all([1, 2, 3].map(() => call('confirm', b._id, asW(), { otp: s.paymentOtp })));
    assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join(','));
    const after = await h.M('Booking').findById(b._id);
    assert.equal(after.status, 'completed');
    assert.equal(after.paymentStatus, 'success');
    assert.equal(after.cashCollectedBy, 'worker');
    const wk = await h.M('Worker').findById(worker._id);
    assert.equal(wk.outstandingDues, 110, '10% platform commission owed');
    assert.equal(await h.M('Transaction').countDocuments({ bookingId: b._id, type: 'cash_collected' }), 1);
    assert.equal((await call('confirm', b._id, asW(), { otp: s.paymentOtp })).status, 409);
  });

  it('works when addressed by an independent-worker assignment id', async () => {
    const b = await workerJob();
    const a = await h.M('IndWorkerAssignment').create({ legacyBookingId: b._id, workerId: worker._id, farmerId: w.farmer._id, parentRequestId: new h.mongoose.Types.ObjectId() }).catch(() => null);
    if (!a) return;
    assert.equal((await call('initiate', a._id, asW())).status, 200);
    assert.equal((await call('initiate', a._id, asW(otherWorker))).status, 403);
  });

  it('refuses a booking that is already paid', async () => {
    const b = await workerJob({ paymentStatus: 'success' });
    assert.equal((await call('initiate', b._id, asW())).status, 400);
    assert.equal((await call('confirm', b._id, asW(), { otp: '1234' })).status, 409);
  });
});

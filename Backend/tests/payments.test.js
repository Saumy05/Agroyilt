'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/harness');
const f = require('./helpers/flow');

let ctx, w;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => { await h.clearDb(); h.fakeIo.reset(); w = await f.world(ctx); });

const pay = (path, body, farmer = w.farmer) => w.api.post(`/api/payments${path}`).set(h.auth(farmer, 'USER')).send(body);
const verify = (orderId, paymentId, sig = 'valid_sig') => pay('/verify', { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig });

/** Creates a razorpay order for the booking and returns its id. */
const orderFor = async (id) => {
  const r = await pay('/create-order', { bookingId: String(id) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data.orderId;
};

describe('Razorpay prepayment', () => {
  it('records the advance exactly once even if verify is called repeatedly / concurrently', async () => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay' });
    const order = await orderFor(id);
    const calls = await Promise.all([1, 2, 3, 4].map(() => verify(order, 'pay_1')));
    assert.ok(calls.every(r => r.status === 200));
    assert.equal(calls.filter(r => r.body.alreadyProcessed).length, 3);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.paymentStatus, 'success');
    assert.equal(b.advancePaidAmount, b.finalAmount);
    assert.equal(b.status, 'requested', 'vendor still has to accept; payment must not skip acceptance');
    assert.equal(b.requestHeldForPayment, false);
    assert.equal(await h.M('Transaction').countDocuments({ bookingId: id, type: 'payment' }), 1);
  });

  it('rejects a forged signature and unknown orders', async () => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay' });
    const order = await orderFor(id);
    assert.equal((await verify(order, 'pay_x', 'forged')).status, 400);
    assert.equal((await verify('order_nope', 'pay_y')).status, 404);
    assert.equal((await pay('/verify', {})).status, 400);
    assert.equal((await h.M('Booking').findById(id)).paymentStatus, 'pending');
  });

  it('keeps every order id: paying an older order still finds the booking', async () => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay' });
    const first = await orderFor(id);
    await orderFor(id); // user retried; razorpayOrderId now points at the second order
    const r = await verify(first, 'pay_old');
    assert.equal(r.status, 200);
    assert.equal((await h.M('Booking').findById(id)).paymentStatus, 'success');
  });

  it('cannot create orders for someone else\'s, settled, cancelled or finished bookings', async () => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay' });
    const stranger = await h.make.farmer();
    assert.equal((await pay('/create-order', { bookingId: String(id) }, stranger)).status, 404);
    await verify(await orderFor(id), 'pay_1');
    assert.equal((await pay('/create-order', { bookingId: String(id) })).status, 400, 'already paid');
    const id2 = await f.newBooking(w, { scheduledDate: h.dateIn(3) });
    await w.asFarmer(w.api.post(`/api/user/bookings/${id2}/cancel`)).send({});
    assert.equal((await pay('/create-order', { bookingId: String(id2) })).status, 400, 'cancelled');
  });

  it('a payment that lands after cancellation is refunded to the wallet, once', async () => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay' });
    const order = await orderFor(id);
    await w.asFarmer(w.api.post(`/api/user/bookings/${id}/cancel`)).send({});
    const r = await verify(order, 'pay_late');
    assert.equal(r.status, 200);
    assert.equal(r.body.refunded, 1309);
    assert.equal((await f.userWallet(w.farmer)).balance, 1309);
    await verify(order, 'pay_late');
    assert.equal((await f.userWallet(w.farmer)).balance, 1309);
    assert.equal((await h.M('Booking').findById(id)).paymentStatus, 'refunded');
  });
});

describe('Pay-online bookings: the vendor is alerted only after payment', () => {
  const vendorAlerts = () => h.fakeIo.emitted.filter(e => e.room === `vendor_${w.vendor._id}` && e.event === 'new_booking_request');

  it('holds an unpaid online booking: no alert, no BookingRequest, not visible or acceptable by the vendor', async () => {
    const r = await f.createBooking(w, { paymentMethod: 'razorpay' });
    assert.equal(r.status, 201);
    assert.equal(r.body.paymentRequired, true);
    const id = r.body.data._id;
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'awaiting_payment');
    assert.equal(b.requestHeldForPayment, true);
    assert.equal(vendorAlerts().length, 0, 'no socket alert before payment');
    assert.equal(await h.M('BookingRequest').countDocuments({ bookingId: id }), 0);
    assert.equal(await h.M('Notification').countDocuments({ vendorId: w.vendor._id, relatedId: id }), 0);
    const list = await w.asVendor(w.api.get('/api/vendors/bookings'));
    assert.equal((list.body.data?.bookings || list.body.data || []).filter(x => String(x._id) === String(id)).length, 0);
    assert.notEqual((await f.accept(w, id)).status, 200, 'cannot accept before payment');
    const upd = await w.asVendor(w.api.put(`/api/vendors/bookings/${id}/status`)).send({ status: 'confirmed' });
    assert.notEqual(upd.status, 200);
  });

  it('a verified payment releases the request to the vendor exactly once', async () => {
    const id = (await f.createBooking(w, { paymentMethod: 'razorpay' })).body.data._id;
    const order = await orderFor(id);
    await Promise.all([1, 2, 3].map(() => verify(order, 'pay_hold')));
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'requested');
    assert.equal(b.requestHeldForPayment, false);
    assert.equal(b.paymentStatus, 'success');
    assert.equal(vendorAlerts().length, 1);
    assert.equal(await h.M('BookingRequest').countDocuments({ bookingId: id, status: 'PENDING' }), 1);
    assert.equal((await f.accept(w, id)).status, 200);
  });

  it('cash bookings still alert the vendor immediately', async () => {
    const r = await f.createBooking(w, { paymentMethod: 'pay_at_home' });
    assert.equal(r.body.paymentRequired, false);
    assert.equal(r.body.data.status, 'requested');
    assert.equal(vendorAlerts().length, 1);
  });

  it('the farmer can cancel an unpaid held booking', async () => {
    const id = (await f.createBooking(w, { paymentMethod: 'razorpay' })).body.data._id;
    const c = await w.asFarmer(w.api.post(`/api/user/bookings/${id}/cancel`)).send({});
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal((await h.M('Booking').findById(id)).status, 'cancelled');
  });

  it('payment for a slot the vendor lost meanwhile is refunded and the vendor is not alerted', async () => {
    const id = (await f.createBooking(w, { paymentMethod: 'razorpay' })).body.data._id;
    const order = await orderFor(id);
    const other = await h.make.farmer();
    assert.equal((await f.createBooking(w, { paymentMethod: 'pay_at_home' }, other)).status, 201, 'held booking does not block the slot');
    await f.accept(w, (await h.M('Booking').findOne({ userId: other._id }))._id);
    const r = await verify(order, 'pay_clash');
    assert.equal(r.status, 200);
    assert.equal((await h.M('Booking').findById(id)).status, 'cancelled');
    assert.equal((await f.userWallet(w.farmer)).balance, 1309);
    assert.equal(vendorAlerts().filter(e => String(e.payload.bookingId) === String(id)).length, 0);
  });
});

describe('Wallet payment', () => {
  it('debits once under concurrency and fails cleanly on low balance', async () => {
    await h.M('User').updateOne({ _id: w.farmer._id }, { $set: { 'wallet.balance': 1500 } });
    const id = await f.newBooking(w, { paymentMethod: 'wallet' });
    const rs = await Promise.all([1, 2, 3].map(() => pay('/wallet', { bookingId: String(id) })));
    assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join(','));
    assert.equal((await f.userWallet(w.farmer)).balance, 1500 - 1309);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.paymentStatus, 'success');
    assert.equal(b.paymentMethod, 'wallet');
    assert.equal(await h.M('Transaction').countDocuments({ bookingId: id, type: 'debit' }), 1);

    const id2 = await f.newBooking(w, { paymentMethod: 'wallet', scheduledDate: h.dateIn(3) });
    const low = await pay('/wallet', { bookingId: String(id2) });
    assert.equal(low.status, 400);
    assert.match(low.body.message, /insufficient/i);
    assert.equal((await f.userWallet(w.farmer)).balance, 191, 'no debit on failure');
    assert.equal((await h.M('Booking').findById(id2)).paymentStatus, 'pending');
  });

  it('is refused for other people\'s, cancelled and already-paid bookings', async () => {
    await h.M('User').updateOne({ _id: w.farmer._id }, { $set: { 'wallet.balance': 5000 } });
    const id = await f.newBooking(w);
    assert.equal((await pay('/wallet', { bookingId: String(id) }, await h.make.farmer())).status, 404);
    assert.equal((await pay('/wallet', { bookingId: String(id) })).status, 200);
    assert.equal((await pay('/wallet', { bookingId: String(id) })).status, 400);
    await w.asFarmer(w.api.post(`/api/user/bookings/${id}/cancel`)).send({});
    assert.equal((await pay('/wallet', { bookingId: String(id) })).status, 400);
    assert.equal((await f.userWallet(w.farmer)).balance, 5000, 'cancel refunded the wallet payment in full');
  });
});

describe('Pay at home', () => {
  it('only works while the booking is open; never resurrects or skips acceptance', async () => {
    const id = await f.newBooking(w);
    let r = await pay('/pay-at-home', { bookingId: String(id) });
    assert.equal(r.status, 200);
    assert.equal((await h.M('Booking').findById(id)).status, 'requested', 'vendor must still accept');

    for (const status of ['cancelled', 'completed', 'in_progress', 'work_done', 'rejected']) {
      await h.M('Booking').updateOne({ _id: id }, { $set: { status } });
      r = await pay('/pay-at-home', { bookingId: String(id) });
      assert.equal(r.status, 400, status);
      assert.equal((await h.M('Booking').findById(id)).status, status);
    }
  });

  it('refuses when the booking is already paid', async () => {
    const id = await f.newBooking(w);
    await h.M('Booking').updateOne({ _id: id }, { $set: { paymentStatus: 'success' } });
    assert.equal((await pay('/pay-at-home', { bookingId: String(id) })).status, 400);
  });
});

describe('Prepaid booking reconciled against the real bill', () => {
  const finish = async (minutes, over = {}) => {
    const id = await f.newBooking(w, { paymentMethod: 'razorpay', ...over });
    await verify(await orderFor(id), `pay_${id}`);
    await f.toInProgress(w, id);
    await f.ageTimer(id, minutes);
    const r = await f.endTrip(w, id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return id;
  };

  it('bill below the advance → completed, surplus refunded to the farmer, vendor credited once', async () => {
    const id = await finish(30); // bill ≈ (30×10+49)×1.05 = 366.45 vs advance 1309
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'completed');
    assert.equal(b.paymentStatus, 'success');
    assert.equal(b.finalAmount, 366.45);
    assert.equal(b.balanceDue, 0);
    assert.equal((await f.userWallet(w.farmer)).balance, 1309 - 366.45);
    const bill = await h.M('VendorBill').findOne({ bookingId: id });
    assert.equal(bill.earningsCredited, true);
    assert.equal((await f.vendorWallet(w.vendor)).earnings, bill.vendorTotalEarning);
    assert.equal((await f.vendorWallet(w.vendor)).dues ?? 0, 0, 'platform holds the money: no cash dues');
    assert.equal((await h.M('Vendor').findById(w.vendor._id)).availability, 'AVAILABLE');
  });

  it('bill above the advance → balance due, collected in cash once; dues = only what the vendor held', async () => {
    const id = await finish(180); // (180×10+49)×1.05 = 1941.45 vs advance 1309
    let b = await f.secret(id, '+paymentOtp');
    assert.equal(b.status, 'work_done');
    assert.equal(b.paymentStatus, 'partial');
    assert.equal(b.finalAmount, 1941.45);
    assert.equal(b.balanceDue, 632.45);
    assert.equal((await f.userWallet(w.farmer)).balance, 0, 'no refund');
    assert.equal((await h.M('VendorBill').findOne({ bookingId: id })).earningsCredited, false);

    const r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/payment/collect`)).send({ otp: b.paymentOtp });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    b = await f.secret(id);
    assert.equal(b.status, 'completed');
    const wal = await f.vendorWallet(w.vendor);
    assert.equal(wal.dues, 632.45, 'vendor only holds the balance in cash');
    assert.equal(wal.totalCashCollected, 632.45);
    const bill = await h.M('VendorBill').findOne({ bookingId: id });
    assert.equal(wal.earnings, bill.vendorTotalEarning, 'full earning credited, once');
  });

  it('bill above the advance → balance can also be paid online (wallet) and completes the job', async () => {
    const id = await finish(180);
    await h.M('User').updateOne({ _id: w.farmer._id }, { $set: { 'wallet.balance': 1000 } });
    const r = await pay('/wallet', { bookingId: String(id) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.amount, 632.45);
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'completed');
    assert.equal(b.paymentStatus, 'success');
    assert.equal(b.balanceDue, 0);
    assert.equal((await f.userWallet(w.farmer)).balance, 1000 - 632.45);
    assert.equal(await h.M('Transaction').countDocuments({ bookingId: id, type: 'earnings_credit' }), 1);
  });

  it('balance paid online via Razorpay uses the balance (not the original total) and credits once', async () => {
    const id = await finish(180);
    const r = await pay('/create-order', { bookingId: String(id) });
    assert.equal(r.body.data.amount, 632.45);
    await verify(r.body.data.orderId, 'pay_balance');
    await verify(r.body.data.orderId, 'pay_balance');
    const b = await h.M('Booking').findById(id);
    assert.equal(b.status, 'completed');
    assert.equal(await h.M('Transaction').countDocuments({ bookingId: id, type: 'earnings_credit' }), 1);
  });

  it('a prepaid booking cannot ALSO be collected in cash (double payment)', async () => {
    const id = await finish(30);
    const b = await f.secret(id, '+paymentOtp');
    const r = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/payment/collect`)).send({ otp: b.paymentOtp || '1234' });
    assert.equal(r.status, 409);
    assert.equal((await f.vendorWallet(w.vendor)).dues ?? 0, 0);
  });
});

describe('Non-machinery service bill (completeSelfJob)', () => {
  const setup = async () => {
    const cat = await h.make.category({ title: 'Electrician', slug: `el-${Date.now()}`, requiresDriver: false });
    const svc = await h.make.service(cat, { basePrice: 500, priceRangeMin: 100 });
    const r = await w.api.post('/api/user/bookings').set(h.auth(w.farmer, 'USER')).send({
      serviceId: String(svc._id), vendorId: String(w.vendor._id), scheduledDate: h.dateIn(2), scheduledTime: '09:00',
      timeSlot: { start: '09:00', end: '10:00' }, serviceCategory: 'Electrician', paymentMethod: 'pay_at_home', basePrice: 500,
      address: { addressLine1: 'a', city: 'b', state: 'c', pincode: '1', lat: 1, lng: 1 }
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = r.body.data._id;
    await f.accept(w, id);
    await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/start`));
    const b = await f.secret(id);
    await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/visit/verify`)).send({ otp: b.visitOtp });
    return id;
  };
  const complete = (id, body) => w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/complete`)).send(body);

  it('bills services + parts + visiting charge + carried penalty, then settles in cash', async () => {
    await h.M('User').updateOne({ _id: w.farmer._id }, { $set: { 'wallet.penalty': 49 } });
    const id = await setup();
    // penalty is charged on a booking created AFTER it was assigned; simulate on this booking
    await h.M('Booking').updateOne({ _id: id }, { $set: { penalty: 49 } });
    const r = await complete(id, { workPhotos: ['p.jpg'], billDetails: { services: [{ name: 'Extra', price: 100, quantity: 2 }], parts: [{ name: 'Fuse', price: 50, quantity: 1, gstPercentage: 18 }] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const bill = await h.M('VendorBill').findOne({ bookingId: id });
    assert.equal(bill.penaltyCharges, 49);
    const base = 500 + 200;                 // original + extra service
    const gst = base * 0.18 + 50 * 0.18;    // service GST + parts GST
    const expected = Math.round((base + 50 + gst + 49 + 49) * 100) / 100; // + visiting 49 + penalty 49
    assert.equal(bill.grandTotal, expected);
    assert.equal(bill.vendorServiceEarning, Math.round(base * 0.7 * 100) / 100);
    assert.equal(bill.vendorPartsEarning, 5);
    assert.equal(bill.companyRevenue, Math.round((expected - bill.vendorTotalEarning) * 100) / 100, 'penalty is company revenue, never vendor earning');

    const b = await f.secret(id, '+paymentOtp');
    assert.equal(b.status, 'work_done');
    assert.equal(b.balanceDue, expected);
    assert.ok(b.workDoneDetails.items.length >= 3, 'bill items persisted (schema)');

    const pay1 = await w.asVendor(w.api.post(`/api/vendors/bookings/${id}/self/payment/collect`)).send({ otp: b.paymentOtp });
    assert.equal(pay1.status, 200);
    assert.equal((await f.vendorWallet(w.vendor)).dues, expected);
  });

  it('rejects negative, NaN, fractional-quantity and absurd line items; no bill is created', async () => {
    const id = await setup();
    const bad = [
      { services: [{ name: 'x', price: -100, quantity: 1 }] },
      { services: [{ name: 'x', price: 'abc', quantity: 1 }] },
      { parts: [{ name: 'x', price: 10, quantity: 0 }] },
      { parts: [{ name: 'x', price: 10, quantity: 1.5 }] },
      { parts: [{ name: 'x', price: 99999999, quantity: 1 }] },
      { parts: [{ name: 'x', price: 10, quantity: 5000 }] }
    ];
    for (const billDetails of bad) {
      const r = await complete(id, { billDetails });
      assert.equal(r.status, 400, JSON.stringify(billDetails));
    }
    assert.equal(await h.M('VendorBill').countDocuments({ bookingId: id }), 0);
    assert.equal((await h.M('Booking').findById(id)).status, 'visited');
  });

  it('a double submit creates one bill', async () => {
    const id = await setup();
    const rs = await Promise.all([complete(id, {}), complete(id, {})]);
    assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join(','));
    assert.equal(await h.M('VendorBill').countDocuments({ bookingId: id }), 1);
  });

  it('cannot complete a job that was never visited', async () => {
    const cat = await h.make.category({ title: 'Plumber', slug: `pl-${Date.now()}`, requiresDriver: false });
    const svc = await h.make.service(cat);
    const id = (await w.api.post('/api/user/bookings').set(h.auth(w.farmer, 'USER')).send({
      serviceId: String(svc._id), vendorId: String(w.vendor._id), scheduledDate: h.dateIn(2), scheduledTime: '09:00',
      timeSlot: { start: '09:00', end: '10:00' }, serviceCategory: 'Plumber', paymentMethod: 'pay_at_home', basePrice: 500,
      address: { addressLine1: 'a', city: 'b', state: 'c', pincode: '1', lat: 1, lng: 1 }
    })).body.data._id;
    await f.accept(w, id);
    assert.equal((await complete(id, {})).status, 400);
  });
});

'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/harness');
const f = require('./helpers/flow');
const S = require('../services/bookingSettlementService');
const { validateSchedule, appDateKey, parseSlotInterval, isIntervalOverlapping } = require('../utils/timeSlotHelper');

let ctx;
before(async () => { ctx = await h.boot(); });
after(async () => { await h.shutdown(); });
beforeEach(async () => { await h.clearDb(); });

describe('validateSchedule (timezone-aware)', () => {
  const noon = new Date('2026-10-03T06:30:00Z'); // 12:00 IST
  it('uses IST, not the server clock', () => {
    // 2026-10-03 18:45 UTC == 2026-10-04 00:15 IST → "today" is Oct 4
    const now = new Date('2026-10-03T18:45:00Z');
    assert.equal(appDateKey(now), '2026-10-04');
    assert.equal(validateSchedule('2026-10-03', { start: '09:00', end: '10:00' }, now).ok, false, 'Oct 3 is already yesterday in IST');
    assert.equal(validateSchedule('2026-10-04', { start: '09:00', end: '10:00' }, now).ok, true);
  });
  it('same-day slot must start in the future (IST)', () => {
    assert.equal(validateSchedule('2026-10-03', { start: '11:59', end: '13:00' }, noon).ok, false);
    assert.equal(validateSchedule('2026-10-03', { start: '12:00', end: '13:00' }, noon).ok, false, 'starting right now is too late');
    assert.equal(validateSchedule('2026-10-03', { start: '12:01', end: '13:00' }, noon).ok, true);
  });
  it('handles 12-hour formats, bad input and the 90-day horizon', () => {
    assert.equal(validateSchedule('2026-10-05', { start: '09:00 AM', end: '11:30 AM' }, noon).ok, true);
    assert.equal(validateSchedule('2026-10-05', { start: '11:00 PM', end: '9:00 AM' }, noon).ok, false);
    assert.equal(validateSchedule('garbage', { start: '09:00', end: '10:00' }, noon).ok, false);
    assert.equal(validateSchedule(null, { start: '09:00', end: '10:00' }, noon).ok, false);
    assert.equal(validateSchedule('2026-10-05', null, noon).ok, false);
    assert.equal(validateSchedule('2027-02-01', { start: '09:00', end: '10:00' }, noon).ok, false);
    assert.equal(validateSchedule('2026-12-31', { start: '09:00', end: '10:00' }, noon).ok, true);
  });
  it('9:00 vs 10:00 compares numerically (string compare would get this wrong)', () => {
    assert.equal(validateSchedule('2026-10-05', { start: '9:00', end: '10:00' }, noon).ok, true);
  });
  it('supports overnight slots when allowOvernight option is enabled', () => {
    assert.equal(validateSchedule('2026-10-05', { start: '10:00 PM', end: '6:00 AM' }, noon, { allowOvernight: true }).ok, true);
    assert.equal(validateSchedule('2026-10-05', { start: '22:00', end: '06:00' }, noon, { allowOvernight: true }).ok, true);
    assert.equal(validateSchedule('2026-10-05', { start: '22:00', end: '22:00' }, noon, { allowOvernight: true }).ok, false);
    const overnightSlot = parseSlotInterval({ start: '22:00', end: '06:00' });
    assert.equal(overnightSlot.startMinutes, 1320);
    assert.equal(overnightSlot.endMinutes, 1800); // 360 + 1440
  });
});

describe('OTP helpers', () => {
  it('are 4 digits, never leading-zero stripped, and distinct when asked', () => {
    for (let i = 0; i < 500; i++) {
      const o = S.generateOtp();
      assert.match(o, /^[1-9]\d{3}$/);
      assert.notEqual(S.generateDistinctOtp(o, null, undefined), o);
    }
  });
  it('are not biased towards a few values', () => {
    const seen = new Set();
    for (let i = 0; i < 3000; i++) seen.add(S.generateOtp());
    assert.ok(seen.size > 1500, `only ${seen.size} distinct codes in 3000 draws`);
  });
  it('toProviderView masks every secret but keeps "is pending" truthiness', () => {
    const view = S.toProviderView({
      toObject: () => ({ visitOtp: '1111', paymentOtp: '2222', customerConfirmationOTP: '2222', driver_start_otp: '3333', driver_end_otp: '4444', resumeOtp: '5555', driver_end_otp_x: 'keep', otpAttempts: { end: 2 }, otpLockedUntil: new Date(), serviceTimer: { resumeOtp: '6666', status: 'PAUSED' }, status: 'x' })
    });
    const txt = JSON.stringify(view);
    for (const s of ['1111', '2222', '3333', '4444', '5555', '6666']) assert.ok(!txt.includes(s), s);
    assert.equal(view.driver_start_otp, '••••');
    assert.equal(view.serviceTimer.status, 'PAUSED');
    assert.equal(view.otpAttempts, undefined);
    assert.equal(view.status, 'x');
    assert.equal(S.toProviderView(null), null);
  });
  it('stripOtpKeys removes OTP-ish keys from socket payloads', () => {
    const out = S.stripOtpKeys({ a: 1, paymentOtp: '1', otp: '2', driver_end_otp: '3', visitOtp: '4' });
    assert.deepEqual(out, { a: 1 });
  });
});

describe('vendor eligibility', () => {
  it('flags every reason a vendor must not receive work', () => {
    assert.match(S.vendorIneligibleReason(null), /not found/i);
    assert.ok(S.vendorIneligibleReason({ isActive: false, approvalStatus: 'approved' }));
    for (const s of ['pending', 'rejected', 'suspended', undefined]) assert.ok(S.vendorIneligibleReason({ approvalStatus: s }), String(s));
    assert.ok(S.vendorIneligibleReason({ approvalStatus: 'approved', wallet: { isBlocked: true } }));
    assert.equal(S.vendorIneligibleReason({ approvalStatus: 'approved', wallet: {} }), null);
    assert.equal(S.vendorIneligibleReason({ approvalStatus: 'verified' }), null);
  });
});

describe('billing maths', () => {
  const equipment = { pricing: { hourly: { isEnabled: true, price: 600 }, land_based: { isEnabled: true, price: 800 }, daily: { isEnabled: true, price: 4000 } } };
  const mk = (over) => ({ serviceTimer: null, visitingCharges: 49, basePrice: 1200, selectedImplements: [], startedAt: new Date(Date.now() - 90 * 60000), rental_type: 'hourly', ...over });
  const now = new Date();

  it('timer billing: minutes rounded UP, minimum 1 minute once started, admin base added', () => {
    const c = S.computeMachineryBase({ booking: mk({ serviceTimer: { status: 'COMPLETED', accumulatedActiveSeconds: 61, ratePerMinute: 10, adminBaseCharge: 49 } }), now });
    assert.equal(c.totalActiveMinutes, 2);
    assert.equal(c.base, 69);
    const c0 = S.computeMachineryBase({ booking: mk({ serviceTimer: { status: 'COMPLETED', accumulatedActiveSeconds: 1, ratePerMinute: 10, adminBaseCharge: 0 }, visitingCharges: 0 }), now });
    assert.equal(c0.totalActiveMinutes, 1);
    const z = S.computeMachineryBase({ booking: mk({ serviceTimer: { status: 'RUNNING', accumulatedActiveSeconds: 0, ratePerMinute: 10, adminBaseCharge: 49 } }), now });
    assert.equal(z.totalActiveMinutes, 0);
    assert.equal(z.base, 49, 'only the base charge when nothing ran');
  });
  it('rental billing by hours/land/daily, with implements and the visiting charge', () => {
    const hourly = S.computeMachineryBase({ booking: mk({ selectedImplements: [{ pricing: { hourly: { isEnabled: true, price: 100 } } }] }), equipment, now });
    assert.equal(hourly.base, (600 + 100) * 2 + 49, '90 min rounds up to 2 billable hours');
    const land = S.computeMachineryBase({ booking: mk({ rental_type: 'land_based' }), equipment, workUnits: 3, now });
    assert.equal(land.base, 800 * 3 + 49);
    const daily = S.computeMachineryBase({ booking: mk({ rental_type: 'daily', startedAt: new Date(Date.now() - 30 * 3600000) }), equipment, now });
    assert.equal(daily.base, 4000 * 2 + 49, '30h → 2 days');
    const unknown = S.computeMachineryBase({ booking: mk({ rental_type: null, basePrice: 777 }), now });
    assert.equal(unknown.base, 777 + 49);
  });
  it('implements priced for another rental type are ignored', () => {
    const c = S.computeMachineryBase({ booking: mk({ selectedImplements: [{ pricing: { daily: { isEnabled: true, price: 999 } } }] }), equipment, now });
    assert.equal(c.base, 600 * 2 + 49);
  });
});

describe('ledger helpers are idempotent', () => {
  it('creditVendorEarningOnce credits a bill once however often it is called', async () => {
    const w = await f.world(ctx);
    const bk = await h.M('Booking').create({ bookingNumber: 'U1', userId: w.farmer._id, vendorId: w.vendor._id, serviceId: w.eq._id, serviceName: 's', serviceCategory: 'c', scheduledDate: new Date() });
    const bill = await h.M('VendorBill').create({ bookingId: bk._id, vendorId: w.vendor._id, grandTotal: 100, vendorTotalEarning: 80 });
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => S.creditVendorEarningOnce(bill, bk)));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await f.vendorWallet(w.vendor)).earnings, 80);
  });

  it('refundToWallet refunds at most what was paid, once, and supports a deduction', async () => {
    const w = await f.world(ctx);
    const bk = await h.M('Booking').create({ bookingNumber: 'U2', userId: w.farmer._id, vendorId: w.vendor._id, serviceId: w.eq._id, serviceName: 's', serviceCategory: 'c', scheduledDate: new Date(), paymentStatus: 'success', paymentMethod: 'razorpay', advancePaidAmount: 500, finalAmount: 500 });
    const rs = await Promise.all([1, 2, 3].map(async () => S.refundToWallet(await h.M('Booking').findById(bk._id), { amount: 450 })));
    assert.equal(rs.reduce((a, b) => a + b, 0), 450, 'exactly one refund won the compare-and-swap');
    assert.equal((await f.userWallet(w.farmer)).balance, 450);
    // the 50 left can still be refunded later, but never more
    const left = await S.refundToWallet(await h.M('Booking').findById(bk._id));
    assert.equal(left, 50);
    assert.equal(await S.refundToWallet(await h.M('Booking').findById(bk._id)), 0);
    assert.equal((await f.userWallet(w.farmer)).balance, 500);
    assert.equal((await h.M('Booking').findById(bk._id)).paymentStatus, 'refunded');
  });

  it('refund ignores unpaid and cash bookings', async () => {
    const w = await f.world(ctx);
    const bk = await h.M('Booking').create({ bookingNumber: 'U3', userId: w.farmer._id, serviceId: w.eq._id, serviceName: 's', serviceCategory: 'c', scheduledDate: new Date(), paymentMethod: 'cash', finalAmount: 500 });
    assert.equal(await S.refundToWallet(bk), 0);
    assert.equal(S.getAdvancePaid(bk), 0);
    assert.equal(S.getAdvancePaid({ paymentStatus: 'success', paymentMethod: 'razorpay', finalAmount: 700 }), 700, 'legacy paid bookings without advancePaidAmount');
    assert.equal(S.getAdvancePaid({ paymentStatus: 'collected_by_vendor', paymentMethod: 'cash', finalAmount: 700 }), 0);
  });
});

describe('contract: every notification type used by the booking/payment code exists in the schema enum', () => {
  it('has no type the Notification model would reject (silent failure class)', () => {
    const root = path.join(__dirname, '..');
    const enumSrc = fs.readFileSync(path.join(root, 'models/Notification.js'), 'utf8');
    const start = enumSrc.indexOf('enum: [');
    const allowed = new Set([...enumSrc.slice(start, enumSrc.indexOf(']', start)).matchAll(/'([a-zA-Z_]+)'/g)].map(m => m[1]));
    const files = [
      'controllers/bookingControllers/vendorBookingController.js', 'controllers/bookingControllers/userBookingController.js',
      'controllers/bookingControllers/serviceTimerController.js', 'controllers/bookingControllers/cashCollectionController.js',
      'controllers/bookingControllers/paymentQrController.js', 'controllers/paymentControllers/paymentController.js',
      'services/bookingScheduler.js', 'services/bookingSettlementService.js'
    ];
    const bad = [];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      for (const m of src.matchAll(/createNotification\(\{[\s\S]*?\btype:\s*'([a-zA-Z_]+)'/g)) {
        if (!allowed.has(m[1])) bad.push(`${rel}: ${m[1]}`);
      }
    }
    assert.deepEqual(bad, []);
  });
});

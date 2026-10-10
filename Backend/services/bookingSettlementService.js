'use strict';

/**
 * Booking Settlement Service
 * ──────────────────────────
 * Single place for everything that moves money or verifies a secret in the
 * farmer ⇄ vendor booking flow. Every ledger effect here is idempotent:
 * it is claimed with an atomic conditional update first, so retries, double
 * taps, duplicate webhooks and concurrent requests cannot double-credit.
 */

const crypto = require('crypto');
const Booking = require('../models/Booking');
const BookingRequest = require('../models/BookingRequest');
const VendorBill = require('../models/VendorBill');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const { BOOKING_STATUS, PAYMENT_STATUS, BILL_STATUS } = require('../utils/constants');
const { getVendorPayoutPercentage } = require('../utils/vendorPayout');

const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_MINUTES = 15;

const ONLINE_METHODS = ['wallet', 'razorpay', 'upi', 'card', 'online', 'qr_online'];
const PAID_STATUSES = [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR];

const ACTIVE_JOB_STATUSES = [
  BOOKING_STATUS.JOURNEY_STARTED,
  BOOKING_STATUS.VISITED,
  BOOKING_STATUS.IN_PROGRESS
];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// OTP
// ─────────────────────────────────────────────────────────────────────────────

/** Cryptographically random 4-digit OTP. */
const generateOtp = () => crypto.randomInt(1000, 10000).toString();

/** Generates a 4-digit OTP that differs from every OTP in `avoid`. */
const generateDistinctOtp = (...avoid) => {
  const blocked = new Set(avoid.filter(Boolean).map(String));
  let otp = generateOtp();
  while (blocked.has(otp)) otp = generateOtp();
  return otp;
};

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Verifies an OTP for one stage with brute-force protection.
 * 5 wrong attempts lock all OTP entry on the booking for 15 minutes.
 *
 * @param {string} bookingId
 * @param {'visit'|'start'|'end'|'payment'|'resume'} stage
 * @param {string|null} expected  the stored OTP for THIS stage only
 * @param {string} submitted
 * @returns {Promise<{ok:boolean, status?:number, message?:string}>}
 */
const verifyBookingOtp = async (bookingId, stage, expected, submitted) => {
  const lockDoc = await Booking.findById(bookingId).select('otpLockedUntil').lean();
  if (lockDoc?.otpLockedUntil && new Date(lockDoc.otpLockedUntil) > new Date()) {
    const mins = Math.ceil((new Date(lockDoc.otpLockedUntil) - Date.now()) / 60000);
    return {
      ok: false,
      status: 429,
      message: `Too many incorrect OTP attempts. Try again in ${mins} minute(s).`
    };
  }

  const sub = submitted == null ? '' : String(submitted).trim();
  if (!expected || !sub || !safeEqual(sub, String(expected).trim())) {
    const updated = await Booking.findByIdAndUpdate(
      bookingId,
      { $inc: { [`otpAttempts.${stage}`]: 1 } },
      { new: true }
    ).select('otpAttempts');
    const attempts = updated?.otpAttempts?.[stage] || 0;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await Booking.findByIdAndUpdate(bookingId, {
        $set: {
          otpLockedUntil: new Date(Date.now() + OTP_LOCK_MINUTES * 60000),
          otpAttempts: { visit: 0, start: 0, end: 0, payment: 0, resume: 0 }
        }
      });
      return {
        ok: false,
        status: 429,
        message: `Too many incorrect OTP attempts. Locked for ${OTP_LOCK_MINUTES} minutes.`
      };
    }
    return {
      ok: false,
      status: 400,
      message: `Invalid OTP. ${Math.max(0, OTP_MAX_ATTEMPTS - attempts)} attempt(s) left.`
    };
  }

  await Booking.findByIdAndUpdate(bookingId, { $set: { [`otpAttempts.${stage}`]: 0 } });
  return { ok: true };
};

// ─────────────────────────────────────────────────────────────────────────────
// Response sanitising — a vendor must never be able to read the farmer's OTPs
// ─────────────────────────────────────────────────────────────────────────────

const SECRET_FIELDS = [
  'visitOtp',
  'paymentOtp',
  'customerConfirmationOTP',
  'driver_start_otp',
  'driver_end_otp',
  'resumeOtp'
];

/**
 * Returns a plain object safe to send to the vendor / worker side.
 * Secret values are replaced with a mask (not removed) so UI code that only
 * checks "is an OTP pending?" keeps working.
 */
const toProviderView = (doc) => {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  for (const f of SECRET_FIELDS) {
    if (obj[f]) obj[f] = '••••';
  }
  delete obj.otpAttempts;
  delete obj.otpLockedUntil;
  if (obj.serviceTimer) {
    obj.serviceTimer = { ...obj.serviceTimer };
    if (obj.serviceTimer.resumeOtp) obj.serviceTimer.resumeOtp = '••••';
  }
  return obj;
};

/** Removes OTP-bearing keys from any socket/notification payload sent to a provider room. */
const stripOtpKeys = (payload) => {
  const out = { ...payload };
  for (const k of [
    ...SECRET_FIELDS,
    'end_otp',
    'otp',
    'driver_start_otp',
    'driver_end_otp'
  ]) delete out[k];
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Eligibility
// ─────────────────────────────────────────────────────────────────────────────

/** Returns null if the vendor may take new work, otherwise a user-facing reason. */
const vendorIneligibleReason = (vendor) => {
  if (!vendor) return 'Vendor not found';
  if (vendor.isActive === false) return 'This vendor is currently unavailable';
  if (!['approved', 'verified'].includes(vendor.approvalStatus)) return 'This vendor is not approved to take bookings';
  if (vendor.wallet?.isBlocked) return 'This vendor cannot accept new bookings right now';
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Availability & request bookkeeping
// ─────────────────────────────────────────────────────────────────────────────

const markVendorBusy = (vendorId) =>
  Vendor.findByIdAndUpdate(vendorId, { availability: 'ON_JOB' });

/** Sets the vendor AVAILABLE only if no other job of theirs is currently running. */
const releaseVendorIfIdle = async (vendorId, exceptBookingId = null) => {
  if (!vendorId) return;
  const query = { vendorId, status: { $in: ACTIVE_JOB_STATUSES } };
  if (exceptBookingId) query._id = { $ne: exceptBookingId };
  const stillBusy = await Booking.exists(query);
  if (!stillBusy) await Vendor.findByIdAndUpdate(vendorId, { availability: 'AVAILABLE' });
};

const expireOpenRequests = (bookingId, status = 'EXPIRED', extra = {}) =>
  BookingRequest.updateMany(
    { bookingId, status: { $in: ['PENDING', 'VIEWED'] } },
    { $set: { status, respondedAt: new Date(), ...extra } }
  );

// ─────────────────────────────────────────────────────────────────────────────
// Payments: advance, refunds
// ─────────────────────────────────────────────────────────────────────────────

/** Amount the farmer already paid through wallet/online before the final bill. */
const getAdvancePaid = (booking) => {
  if (booking.advancePaidAmount > 0) return booking.advancePaidAmount;
  if (booking.paymentStatus === PAYMENT_STATUS.SUCCESS && ONLINE_METHODS.includes(booking.paymentMethod)) {
    return Number(booking.finalAmount) || 0;
  }
  return 0;
};

/**
 * Refunds up to `amount` (default: everything not yet refunded) to the farmer's
 * in-app wallet. Idempotent via a compare-and-swap on `refundedAmount`.
 * @returns {Promise<number>} amount actually refunded
 */
const refundToWallet = async (booking, { amount = null, reason = 'Booking refund' } = {}) => {
  const paid = getAdvancePaid(booking);
  const already = booking.refundedAmount || 0;
  const refundable = round2(paid - already);
  if (refundable <= 0) return 0;

  const toRefund = round2(amount == null ? refundable : Math.min(amount, refundable));
  if (toRefund <= 0) return 0;

  const fullyRefunded = round2(already + toRefund) >= paid;
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, refundedAmount: already },
    {
      $inc: { refundedAmount: toRefund },
      ...(fullyRefunded ? { $set: { paymentStatus: PAYMENT_STATUS.REFUNDED } } : {})
    },
    { new: true }
  );
  if (!claimed) return 0; // another request already refunded

  const Wallet = require('../models/Wallet');
  await Wallet.findOneAndUpdate(
    { userId: booking.userId, userModel: 'User' },
    { $inc: { balance: toRefund } },
    { upsert: true, new: true }
  );

  const user = await User.findByIdAndUpdate(
    booking.userId,
    { $inc: { 'wallet.balance': toRefund } },
    { new: true }
  ).select('wallet');

  await Transaction.create({
    userId: booking.userId,
    bookingId: booking._id,
    type: 'refund',
    amount: toRefund,
    status: 'completed',
    paymentMethod: 'wallet',
    description: `${reason} — booking #${booking.bookingNumber}`,
    balanceAfter: user?.wallet?.balance
  });

  booking.refundedAmount = claimed.refundedAmount;
  if (fullyRefunded) booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
  return toRefund;
};

/** Marks money as received online/wallet — atomically, exactly once per amount. */
const recordAdvancePayment = async (bookingId, amount, patch = {}) =>
  Booking.findOneAndUpdate(
    { _id: bookingId, paymentStatus: { $nin: [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.REFUNDED] } },
    {
      $set: { paymentStatus: PAYMENT_STATUS.SUCCESS, advancePaidAmount: amount, ...patch }
    },
    { new: true }
  );

// ─────────────────────────────────────────────────────────────────────────────
// Vendor earnings & cash ledger (idempotent)
// ─────────────────────────────────────────────────────────────────────────────

/** Credits vendor earnings for a bill exactly once, no matter how many paths call it. */
const creditVendorEarningOnce = async (bill, booking, { via = 'system', paymentMethod = 'system' } = {}) => {
  if (!bill) return false;
  const claimed = await VendorBill.findOneAndUpdate(
    { _id: bill._id, earningsCredited: { $ne: true } },
    { $set: { earningsCredited: true, status: BILL_STATUS.PAID, paidAt: new Date() } },
    { new: true }
  );
  if (!claimed) return false;

  const earning = claimed.vendorTotalEarning || 0;
  if (earning > 0) {
    await Vendor.findByIdAndUpdate(claimed.vendorId, { $inc: { 'wallet.earnings': earning } });
    await Transaction.create({
      vendorId: claimed.vendorId,
      userId: booking.userId,
      bookingId: booking._id,
      type: 'earnings_credit',
      amount: earning,
      status: 'completed',
      paymentMethod,
      description: `Earnings ₹${earning} credited for booking #${booking.bookingNumber} (${via})`,
      metadata: {
        type: 'earnings_increase',
        billId: claimed._id.toString(),
        serviceEarning: claimed.vendorServiceEarning,
        partsEarning: claimed.vendorPartsEarning
      }
    });
  }
  return true;
};

const getRentalSettings = async () => {
  const s = await Settings.findOne({ type: 'global' }).lean();
  return {
    gstPct: s?.rentalGstPercentage ?? 5,
    payoutPct: getVendorPayoutPercentage(s),
    settings: s
  };
};

/** Creates a bill for a booking whose bill is missing (legacy paths). Never invents an amount. */
const ensureBill = async (booking) => {
  let bill = await VendorBill.findOne({ bookingId: booking._id });
  if (bill) return bill;

  const total = Number(booking.finalAmount);
  if (!(total > 0)) {
    const err = new Error('No bill exists and the booking has no final amount');
    err.status = 409;
    throw err;
  }
  const { gstPct, payoutPct } = await getRentalSettings();
  const base = round2(total / (1 + gstPct / 100));
  const gst = round2(total - base);
  const earning = round2((base * payoutPct) / 100);
  return VendorBill.create({
    bookingId: booking._id,
    vendorId: booking.vendorId,
    services: [{
      name: booking.serviceName || 'Service',
      price: base, gstPercentage: gstPct, quantity: 1, gstAmount: gst, total, isOriginal: true
    }],
    originalServiceBase: base,
    originalGST: gst,
    totalServiceBase: base,
    totalGST: gst,
    grandTotal: total,
    payoutConfig: { serviceSplitPercentage: payoutPct, serviceGstPercentage: gstPct },
    vendorServiceEarning: earning,
    vendorTotalEarning: earning,
    companyRevenue: round2(total - earning),
    status: BILL_STATUS.GENERATED
  });
};

/**
 * Settles a cash payment for a vendor booking.
 * Atomic claim → ledger effects → revert the claim on failure so it can be retried.
 *
 * @returns {Promise<{already:boolean, grandTotal?:number, cashAmount?:number, vendorEarning?:number, dues?:number}>}
 */
const settleVendorCash = async (bookingId, { collectorRole, collectorId }) => {
  const claimed = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      cashCollected: { $ne: true },
      paymentStatus: { $nin: [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR, PAYMENT_STATUS.REFUNDED] },
      status: { $in: [BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.AWAITING_PAYMENT] }
    },
    { $set: { cashCollected: true } },
    { new: false } // pre-image: we need the paymentStatus/balance the caller saw
  );
  if (!claimed) {
    const err = new Error('Payment already collected or booking is not awaiting payment');
    err.status = 409;
    throw err;
  }

  try {
    const bill = await ensureBill(claimed);
    const grandTotal = bill.grandTotal || claimed.finalAmount;
    const advance = getAdvancePaid(claimed);
    const exactDue = claimed.balanceDue > 0 ? claimed.balanceDue : round2(Math.max(0, grandTotal - advance));
    // Physical cash is rounded UP to the nearest whole Rupee (Math.ceil) so no fractional paise are needed
    const cashAmount = Math.ceil(exactDue);
    const cashChange = round2(cashAmount - exactDue);
    const vendorId = claimed.vendorId;

    // Vendor now physically holds `cashAmount`; the platform owes them their earning.
    const earningClaim = await VendorBill.findOneAndUpdate(
      { _id: bill._id, earningsCredited: { $ne: true } },
      { $set: { earningsCredited: true, cashSettled: true, status: BILL_STATUS.PAID, paidAt: new Date() } }
    );
    const vendorEarning = earningClaim ? (bill.vendorTotalEarning || 0) : 0;

    const walletInc = {
      'wallet.dues': cashAmount,
      'wallet.totalCashCollected': cashAmount,
      ...(vendorEarning ? { 'wallet.earnings': vendorEarning } : {})
    };
    const v = await Vendor.findByIdAndUpdate(vendorId, { $inc: walletInc }, { new: true }).select('wallet');
    const limit = v?.wallet?.cashLimit || 10000;
    const netOwed = (v?.wallet?.dues || 0) - (v?.wallet?.earnings || 0);
    if (v && netOwed > limit && !v.wallet.isBlocked) {
      await Vendor.findByIdAndUpdate(vendorId, {
        $set: {
          'wallet.isBlocked': true,
          'wallet.blockedAt': new Date(),
          'wallet.blockReason': `Cash limit exceeded. Net owed: ₹${netOwed.toFixed(2)}, Limit: ₹${limit}`
        }
      });
    }

    const planCovered = claimed.paymentMethod === 'plan_benefit';
    await Booking.updateOne(
      { _id: bookingId },
      {
        $set: {
          status: BOOKING_STATUS.COMPLETED,
          paymentStatus: planCovered ? PAYMENT_STATUS.SUCCESS : PAYMENT_STATUS.COLLECTED_BY_VENDOR,
          ...(advance > 0 || planCovered ? {} : { paymentMethod: 'cash' }),
          cashCollected: true,
          cashCollectedAt: new Date(),
          cashCollectedBy: collectorRole === 'worker' ? 'worker' : 'vendor',
          cashCollectorId: collectorId,
          completedAt: new Date(),
          balanceDue: 0,
          finalAmount: grandTotal,
          userPayableAmount: grandTotal,
          vendorBillId: bill._id,
          paymentOtp: null,
          customerConfirmationOTP: null,
          finalSettlementStatus: collectorRole === 'vendor' ? 'DONE' : 'PENDING'
        }
      }
    );

    // If loose paise were rounded up, credit the change back into the farmer's wallet
    if (cashChange > 0 && claimed.userId) {
      try {
        const Wallet = require('../models/Wallet');
        const WalletTransaction = require('../models/WalletTransaction');

        const wallet = await Wallet.findOneAndUpdate(
          { userId: claimed.userId, userModel: 'User' },
          { $inc: { balance: cashChange } },
          { new: true, upsert: true }
        );

        await User.findByIdAndUpdate(
          claimed.userId,
          { $set: { 'wallet.balance': wallet.balance } }
        );

        await WalletTransaction.create({
          walletId: wallet._id,
          type: 'credit',
          amount: cashChange,
          reason: 'refund',
          status: 'completed',
          description: `Cash change ₹${cashChange.toFixed(2)} from booking #${claimed.bookingNumber} added to wallet`,
          referenceId: claimed._id.toString()
        });

        await Transaction.create({
          userId: claimed.userId,
          bookingId,
          type: 'refund',
          amount: cashChange,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Cash change ₹${cashChange.toFixed(2)} from booking #${claimed.bookingNumber} added to wallet`,
          balanceAfter: wallet.balance,
          referenceId: claimed._id.toString()
        });

        const { createNotification } = require('../controllers/notificationControllers/notificationController');
        await createNotification({
          userId: claimed.userId,
          type: 'wallet_credited',
          title: 'Cash Change Added to Wallet',
          message: `₹${cashChange.toFixed(2)} change from your cash payment was credited to your AgroYilt Wallet!`,
          relatedId: claimed._id,
          relatedType: 'booking',
          pushData: { type: 'wallet_credited', amount: cashChange }
        });
      } catch (notifErr) {
        console.warn('[settleVendorCash] Wallet credit/notification error:', notifErr.message);
      }
    }

    await Transaction.create({
      vendorId,
      bookingId,
      type: 'cash_collected',
      amount: cashAmount,
      status: 'completed',
      paymentMethod: 'cash',
      description: `Cash ₹${cashAmount} collected for booking #${claimed.bookingNumber}${cashChange > 0 ? ` (includes ₹${cashChange} customer wallet change)` : ''}. Dues increased.`,
      metadata: { type: 'dues_increase', customerId: claimed.userId, collectedBy: collectorRole, billId: bill._id.toString(), grandTotal, vendorEarning, cashChange }
    });
    if (vendorEarning > 0) {
      await Transaction.create({
        vendorId,
        bookingId,
        type: 'earnings_credit',
        amount: vendorEarning,
        status: 'completed',
        paymentMethod: 'wallet',
        description: `Earnings ₹${vendorEarning} credited for booking #${claimed.bookingNumber}`,
        metadata: { type: 'earnings_increase', billId: bill._id.toString() }
      });
    }

    try {
      const { recordBookingEarning } = require('./earningTrackerService');
      await recordBookingEarning({
        date: new Date(),
        totalRevenue: grandTotal,
        platformCommission: round2((bill.companyRevenue || 0) - (bill.totalGST || 0)),
        vendorEarnings: bill.vendorTotalEarning,
        totalGST: bill.totalGST,
        totalTDS: 0
      });
    } catch (e) { /* stats only */ }

    await releaseVendorIfIdle(vendorId, bookingId);
    return { already: false, grandTotal, cashAmount, vendorEarning, dues: v?.wallet?.dues };
  } catch (err) {
    // Roll the claim back so the vendor can retry; ledger writes above are individually idempotent.
    await Booking.updateOne({ _id: bookingId, status: { $ne: BOOKING_STATUS.COMPLETED } }, { $set: { cashCollected: false } });
    throw err;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Machinery billing (single implementation for trip-end, timer-end, machinery-complete)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the base (pre-GST) amount for a machinery booking.
 * Timer-based when a live timer exists, otherwise from the booked rental type.
 */
const computeMachineryBase = ({ booking, service, equipment, workUnits, now }) => {
  const isRental = Boolean(
    booking.fulfillmentMode === 'rental' ||
    booking.categoryId?.fulfillmentMode === 'rental' ||
    booking.equipmentId?.listingType === 'rental' ||
    (booking.rental_type && (booking.requiresDriver === false || booking.categoryId?.requiresDriver === false))
  );

  const t = booking.serviceTimer;
  const hasTimer = !isRental && !!t && ((t.accumulatedActiveSeconds || 0) > 0 || ['RUNNING', 'PAUSED', 'COMPLETED'].includes(t.status));
  if (hasTimer) {
    const active = t.accumulatedActiveSeconds || 0;
    const totalActiveMinutes = Math.max(active > 0 ? 1 : 0, Math.ceil(active / 60));
    const adminBase = t.adminBaseCharge || booking.visitingCharges || 0;
    const rate = t.ratePerMinute || 15;
    const timeCharge = round2(totalActiveMinutes * rate);
    return { base: round2(adminBase + timeCharge), hasTimer: true, totalActiveMinutes, adminBase, timeCharge };
  }

  const durationMs = now - (booking.startedAt || now);
  const hours = Math.max(1, Math.ceil(durationMs / 3600000));
  const days = Math.max(1, Math.ceil(durationMs / 86400000));
  const units = parseFloat(workUnits) || booking.workUnits || 1;
  const hourly = equipment?.pricing?.hourly?.isEnabled ? equipment.pricing.hourly.price : service?.hourly_price;
  const land = equipment?.pricing?.land_based?.isEnabled ? equipment.pricing.land_based.price : service?.land_price;
  const daily = equipment?.pricing?.daily?.isEnabled ? equipment.pricing.daily.price : service?.daily_price;

  let base;
  switch (booking.rental_type) {
    case 'hourly': base = (hourly || booking.basePrice || 0) * hours; break;
    case 'land_based': base = (land || booking.basePrice || 0) * units; break;
    case 'daily': base = (daily || booking.basePrice || 0) * days; break;
    case 'monthly': base = service?.monthly_price || booking.basePrice || 0; break;
    default: base = booking.basePrice || 0;
  }
  for (const impl of booking.selectedImplements || []) {
    const p = impl.pricing || {};
    if (booking.rental_type === 'hourly' && p.hourly?.isEnabled) base += (p.hourly.price || 0) * hours;
    else if (booking.rental_type === 'land_based' && p.land_based?.isEnabled) base += (p.land_based.price || 0) * units;
    else if (booking.rental_type === 'daily' && p.daily?.isEnabled) base += (p.daily.price || 0) * days;
  }
  // Visiting charge was part of the up-front estimate; keep the final bill comparable to it.
  base += Number(booking.visitingCharges) || 0;
  return { base: round2(base), hasTimer: false };
};

/**
 * Moves a booking to the right post-work state for a generated bill and reconciles
 * whatever the farmer already paid:
 *
 *  • nothing paid / cash        → WORK_DONE, balanceDue = bill, fresh payment OTP
 *  • paid ≥ bill                → COMPLETED, surplus refunded, vendor credited once
 *  • paid < bill (prepaid est.) → WORK_DONE + PARTIAL, balanceDue = difference
 *  • plan benefit               → COMPLETED (plan covers it), vendor credited once
 *
 * @returns {Promise<number>} amount refunded to the farmer (surplus advance)
 */
const applyBillToBooking = async (booking, bill, { now = new Date() } = {}) => {
  const grandTotal = bill.grandTotal;
  const planCovered = booking.paymentMethod === 'plan_benefit';
  const advance = getAdvancePaid(booking);
  booking.finalAmount = grandTotal;
  booking.userPayableAmount = grandTotal;
  booking.vendorBillId = bill._id;
  booking.cashCollected = false;
  let refunded = 0;

  if (planCovered || (advance > 0 && advance >= grandTotal - 0.99)) {
    booking.status = BOOKING_STATUS.COMPLETED;
    booking.completedAt = now;
    booking.balanceDue = 0;
    booking.paymentOtp = null;
    booking.customerConfirmationOTP = null;
    if (!planCovered) booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
    await booking.save();
    if (!planCovered && advance - grandTotal > 0.99) {
      refunded = await refundToWallet(booking, { amount: round2(advance - grandTotal), reason: 'Refund of unused advance' });
    }
    await creditVendorEarningOnce(bill, booking, { via: 'bill settled from advance' });
    await releaseVendorIfIdle(booking.vendorId, booking._id);
  } else {
    const payOtp = generateDistinctOtp(booking.driver_start_otp, booking.driver_end_otp);
    booking.status = BOOKING_STATUS.WORK_DONE;
    booking.balanceDue = round2(grandTotal - advance);
    booking.paymentStatus = advance > 0 ? PAYMENT_STATUS.PARTIAL : PAYMENT_STATUS.PENDING;
    booking.paymentOtp = payOtp;
    booking.customerConfirmationOTP = payOtp;
    await booking.save();
  }
  return refunded;
};

/**
 * Generates the final bill for a machinery booking and moves the booking to the
 * right state, reconciling any amount the farmer already paid.
 *
 *  • nothing paid / cash        → WORK_DONE, balanceDue = bill, fresh payment OTP
 *  • paid ≥ bill                → COMPLETED, surplus refunded, vendor credited once
 *  • paid < bill (prepaid est.) → WORK_DONE + PARTIAL, balanceDue = difference
 *  • plan benefit               → COMPLETED (plan covers it), vendor credited once
 *
 * Idempotent: calling it again on an already-finalised booking returns the existing result.
 */
const finalizeMachineryBilling = async (booking, { service = null, equipment = null, workUnits = null, now = new Date() } = {}) => {
  if (booking.vendorBillId && [BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.COMPLETED].includes(booking.status)) {
    const existing = await VendorBill.findById(booking.vendorBillId);
    return { bill: existing, alreadyFinal: true, booking };
  }

  const { gstPct, payoutPct } = await getRentalSettings();
  const calc = computeMachineryBase({ booking, service, equipment, workUnits, now });
  const base = calc.base;
  const gst = round2((base * gstPct) / 100);
  const penalty = round2(booking.penalty || 0);
  const grandTotal = round2(base + gst + penalty);
  const vendorEarning = round2((base * payoutPct) / 100);

  const name = calc.hasTimer
    ? `${service?.title || booking.serviceName || 'Machinery Service'} (${calc.totalActiveMinutes} Mins Work)`
    : `${service?.title || booking.serviceName || 'Equipment Rental'} (${booking.rental_type || 'service'})`;

  const bill = await VendorBill.findOneAndUpdate(
    { bookingId: booking._id },
    {
      $set: {
        vendorId: booking.vendorId,
        services: [{ name, price: base, gstPercentage: gstPct, quantity: 1, gstAmount: gst, total: round2(base + gst), isOriginal: true }],
        originalServiceBase: base,
        originalGST: gst,
        totalServiceBase: base,
        totalGST: gst,
        penaltyCharges: penalty,
        grandTotal,
        payoutConfig: { serviceSplitPercentage: payoutPct, serviceGstPercentage: gstPct },
        vendorServiceEarning: vendorEarning,
        vendorTotalEarning: vendorEarning,
        companyRevenue: round2(grandTotal - vendorEarning),
        status: BILL_STATUS.GENERATED
      }
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  const refunded = await applyBillToBooking(booking, bill, { now });

  return { bill, alreadyFinal: false, booking, grandTotal, vendorEarning, refunded, hasTimer: calc.hasTimer, calc };
};

module.exports = {
  OTP_MAX_ATTEMPTS,
  ONLINE_METHODS,
  PAID_STATUSES,
  ACTIVE_JOB_STATUSES,
  round2,
  generateOtp,
  generateDistinctOtp,
  verifyBookingOtp,
  toProviderView,
  stripOtpKeys,
  vendorIneligibleReason,
  markVendorBusy,
  releaseVendorIfIdle,
  expireOpenRequests,
  getAdvancePaid,
  refundToWallet,
  recordAdvancePayment,
  creditVendorEarningOnce,
  getRentalSettings,
  ensureBill,
  settleVendorCash,
  computeMachineryBase,
  applyBillToBooking,
  finalizeMachineryBilling
};

// ─────────────────────────────────────────────────────────────────────────────
// Applying an online / wallet payment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a booking request to its (single, farmer-selected) vendor: BookingRequest row,
 * realtime alert, push and DB notification. Used at creation for cash bookings and after the
 * payment is verified for online bookings.
 */
const dispatchVendorRequest = async (booking, { io = null, distance = null, chosenVendor = null } = {}) => {
  const Service = require('../models/Service');
  const { createNotification } = require('../controllers/notificationControllers/notificationController');
  const { sendNewBookingNotification } = require('./firebaseNotificationService');
  const vendorId = booking.vendorId;
  if (!vendorId) return;
  const [user, service] = await Promise.all([
    User.findById(booking.userId).select('name phone'),
    Service.findById(booking.serviceId).select('title')
  ]);
  const serviceTitle = service?.title || booking.serviceName || 'Service';
  const customerName = user?.name || 'Customer';

  try {
    await BookingRequest.create({
      bookingId: booking._id, providerType: 'VENDOR', vendorId, status: 'PENDING', wave: 1,
      distance, sentAt: new Date(), expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });
  } catch (err) {
    if (err.code !== 11000) console.error('[dispatchVendorRequest] BookingRequest create error:', err);
  }

  if (io) {
    const bookingData = {
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      serviceName: serviceTitle,
      serviceCategory: booking.serviceCategory || 'Category',
      customerName,
      customerPhone: user?.phone,
      scheduledDate: booking.scheduledDate,
      scheduledTime: booking.scheduledTime,
      timeSlot: booking.timeSlot,
      price: booking.finalAmount,
      basePrice: booking.basePrice,
      address: booking.address,
      distance,
      rental_type: booking.rental_type || '',
      estimatedDuration: booking.estimatedDuration || '',
      landSize: booking.landSize || '',
      selectedImplements: booking.selectedImplements || [],
      playSound: true,
      message: `New booking request from ${customerName}!`
    };
    const room = `vendor_${vendorId.toString()}`;
    io.to(room).emit('new_booking_request', bookingData);
    io.to(room).emit('new_booking', bookingData);
    io.to(room).emit('booking_updated', { bookingId: booking._id, status: 'requested' });
  }

  let pushSent = false;
  try {
    const vendorDoc = chosenVendor?.fcmTokens ? chosenVendor : await Vendor.findById(vendorId);
    if (vendorDoc?.fcmTokens?.length > 0) {
      await sendNewBookingNotification(vendorDoc, {
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        serviceName: serviceTitle,
        serviceCategory: booking.serviceCategory || 'Category',
        customerName,
        customerPhone: user?.phone,
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        price: booking.finalAmount,
        distance,
        location: `${booking.address?.city || ''}, ${booking.address?.state || ''}`.trim()
      });
      pushSent = true;
    }
  } catch (err) {
    console.error('[FCM] Push notification failed for vendor', vendorId, err);
  }

  createNotification({
    vendorId,
    type: 'booking_request',
    title: 'New Booking Request',
    message: `New booking request for ${serviceTitle} from ${customerName}`,
    relatedId: booking._id,
    relatedType: 'booking',
    priority: 'high',
    skipPush: pushSent,
    data: {
      bookingId: booking._id, serviceName: serviceTitle, customerName, customerPhone: user?.phone,
      scheduledDate: booking.scheduledDate, scheduledTime: booking.scheduledTime,
      location: booking.address, price: booking.finalAmount, distance
    },
    pushData: { type: 'new_booking', dataOnly: false, priority: 'high', link: `/vendor/booking/${booking._id}` }
  }).catch(err => console.error('[Notification] Background save error (vendor):', err));
};


/**
 * Applies money that has ALREADY been taken (wallet debit / verified gateway payment).
 * The caller guarantees exclusivity (processedPaymentIds claim or booking status claim).
 *
 *  • cancelled booking         → recorded and refunded to wallet straight away
 *  • work done, bill exists    → pays the balance; completes the booking & credits vendor once
 *  • otherwise (pre-work)      → advance recorded, booking confirmed
 */
const applyOnlinePayment = async (bookingId, { amount, method, paymentRef, io = null }) => {
  const b = await Booking.findById(bookingId);
  const newAdvance = round2((b.advancePaidAmount || 0) + amount);
  b.paymentMethod = method;
  b.paymentId = paymentRef;
  if (method === 'razorpay') b.razorpayPaymentId = paymentRef;
  b.advancePaidAmount = newAdvance;
  let refunded = 0;
  let completed = false;
  let lateRefund = false;

  if (b.status === BOOKING_STATUS.CANCELLED) {
    b.paymentStatus = PAYMENT_STATUS.SUCCESS;
    await b.save();
    refunded = await refundToWallet(b, { reason: 'Refund: payment received after the booking was cancelled' });
    lateRefund = true;
  } else if (b.status === BOOKING_STATUS.WORK_DONE && b.vendorBillId) {
    const total = b.finalAmount || 0;
    if (newAdvance >= total - 0.99) {
      b.paymentStatus = PAYMENT_STATUS.SUCCESS;
      b.status = BOOKING_STATUS.COMPLETED;
      b.completedAt = new Date();
      b.balanceDue = 0;
      b.paymentOtp = null;
      b.customerConfirmationOTP = null;
      await b.save();
      completed = true;
      const bill = await VendorBill.findById(b.vendorBillId);
      if (bill) await creditVendorEarningOnce(bill, b, { via: `${method} payment` });
      if (b.vendorId) await releaseVendorIfIdle(b.vendorId, b._id);
    } else {
      b.paymentStatus = PAYMENT_STATUS.PARTIAL;
      b.balanceDue = round2(total - newAdvance);
      await b.save();
    }
  } else if (b.status === BOOKING_STATUS.AWAITING_PAYMENT && b.requestHeldForPayment && b.vendorId) {
    // Paid up-front: now (and only now) the held request goes to the vendor
    b.paymentStatus = PAYMENT_STATUS.SUCCESS;
    b.requestHeldForPayment = false;
    b.status = BOOKING_STATUS.REQUESTED;
    b.notifiedVendors = [b.vendorId];
    b.waveStartedAt = new Date();
    await b.save();
    const clash = await findVendorSlotConflict(
      { scheduledDate: b.scheduledDate, timeSlot: b.timeSlot, scheduledTime: b.scheduledTime, rental_type: b.rental_type, equipmentId: b.equipmentId, fulfillmentMode: b.fulfillmentMode },
      b.vendorId,
      { excludeId: b._id }
    );
    if (clash) {
      b.status = BOOKING_STATUS.CANCELLED;
      b.cancellationReason = 'Vendor became unavailable for this slot while payment was pending';
      b.cancelledAt = new Date();
      b.notifiedVendors = [];
      await b.save();
      refunded = await refundToWallet(b, { reason: 'Refund: vendor was booked for this slot before your payment completed' });
      lateRefund = true;
    } else {
      try { await dispatchVendorRequest(b, { io }); } catch (e) { console.error('[applyOnlinePayment] dispatch failed:', e.message); }
    }
  } else {
    b.paymentStatus = PAYMENT_STATUS.SUCCESS;
    if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.AWAITING_PAYMENT].includes(b.status)) {
      b.status = BOOKING_STATUS.CONFIRMED;
    } else if (b.status === BOOKING_STATUS.REQUESTED && !b.vendorId) {
      b.status = BOOKING_STATUS.CONFIRMED;
    }
    await b.save();
  }
  return { booking: b, refunded, completed, lateRefund };
};

// ─────────────────────────────────────────────────────────────────────────────
// Slot conflicts & timer
// ─────────────────────────────────────────────────────────────────────────────

const CONFLICT_STATUSES = [
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.ASSIGNED,
  BOOKING_STATUS.JOURNEY_STARTED,
  BOOKING_STATUS.VISITED,
  BOOKING_STATUS.IN_PROGRESS,
  BOOKING_STATUS.WORK_DONE
];

/**
 * Finds another booking of the same vendor (and same machine, when known) whose
 * time interval overlaps the given booking. Returns the conflicting booking or null.
 *
 * @param {object} target     { scheduledDate, timeSlot, scheduledTime, rental_type, equipmentId, fulfillmentMode }
 * @param {string} vendorId
 * @param {object} [opts]     { excludeId, statuses, beatenBy } — `beatenBy` = {at, id} makes the
 *                            check one-sided so two racing requests cannot both back off.
 */
const findVendorSlotConflict = async (target, vendorId, { excludeId = null, statuses = CONFLICT_STATUSES, beatenBy = null } = {}) => {
  const { parseSlotInterval, isIntervalOverlapping } = require('../utils/timeSlotHelper');
  const day = new Date(target.scheduledDate);
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const end = new Date(day); end.setHours(23, 59, 59, 999);

  const query = { vendorId, scheduledDate: { $gte: start, $lte: end }, status: { $in: statuses } };
  if (excludeId) query._id = { $ne: excludeId };

  const others = await Booking.find(query)
    .select('equipmentId scheduledDate scheduledTime timeSlot rental_type status bookingNumber acceptedAt createdAt fulfillmentMode');
  const mine = parseSlotInterval(target.timeSlot, target.scheduledTime, target.rental_type);
  const targetIsRental = target.fulfillmentMode === 'rental';

  for (const other of others) {
    const otherIsRental = other.fulfillmentMode === 'rental';
    if (targetIsRental) {
      // Machine-only rental: only a booking of the SAME machine can clash. The vendor being
      // busy on a service (or with other machines) never blocks it.
      if (!target.equipmentId || !other.equipmentId ||
          other.equipmentId.toString() !== target.equipmentId.toString()) continue;
    } else {
      // Service: rentals don't use the vendor's time, so they never block it.
      if (otherIsRental) continue;
      const sameMachine = !target.equipmentId || !other.equipmentId ||
        other.equipmentId.toString() === target.equipmentId.toString();
      if (!sameMachine) continue;
    }
    if (beatenBy) {
      const t = (beatenBy.field === 'createdAt' ? other.createdAt : other.acceptedAt) || other.createdAt;
      const earlier = t < beatenBy.at || (t.getTime() === beatenBy.at.getTime() && other._id.toString() < beatenBy.id.toString());
      if (!earlier) continue;
    }
    if (isIntervalOverlapping(parseSlotInterval(other.timeSlot, other.scheduledTime, other.rental_type), mine)) return other;
  }
  return null;
};

/** Flushes any open running/paused interval and marks the timer finished. */
const closeServiceTimer = (booking, now = new Date(), status = 'COMPLETED') => {
  const t = booking.serviceTimer;
  if (!t) return;
  if (t.status === 'RUNNING' && t.currentSessionStartedAt) {
    t.accumulatedActiveSeconds = (t.accumulatedActiveSeconds || 0) +
      Math.max(0, Math.floor((now - new Date(t.currentSessionStartedAt)) / 1000));
    t.currentSessionStartedAt = null;
  } else if (t.status === 'PAUSED' && t.currentPauseStartedAt) {
    t.accumulatedPausedSeconds = (t.accumulatedPausedSeconds || 0) +
      Math.max(0, Math.floor((now - new Date(t.currentPauseStartedAt)) / 1000));
    t.currentPauseStartedAt = null;
  }
  t.status = status;
  t.resumeOtp = null;
  if (status !== 'COMPLETED') t.stoppedAt = now;
};

/**
 * Cancels a booking on behalf of the provider/system with a full refund.
 * Atomic on status so concurrent actions cannot both succeed.
 * @returns {Promise<{booking:object|null, refunded:number}>}
 */
const cancelBookingWithRefund = async (bookingId, { allowedStatuses, by, reason, extraQuery = {} }) => {
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, status: { $in: allowedStatuses }, ...extraQuery },
    { $set: { status: BOOKING_STATUS.CANCELLED, cancelledAt: new Date(), cancelledBy: by, cancellationReason: reason } },
    { new: true }
  );
  if (!booking) return { booking: null, refunded: 0 };

  if (booking.serviceTimer && ['RUNNING', 'PAUSED'].includes(booking.serviceTimer.status)) {
    closeServiceTimer(booking, new Date(), 'STOPPED');
    await booking.save();
  }
  await expireOpenRequests(booking._id, 'CANCELLED');
  const refunded = await refundToWallet(booking, { reason: `Refund: booking cancelled by ${by}` });
  if (booking.vendorId) await releaseVendorIfIdle(booking.vendorId, booking._id);
  return { booking, refunded };
};

Object.assign(module.exports, { applyOnlinePayment, dispatchVendorRequest, CONFLICT_STATUSES, findVendorSlotConflict, closeServiceTimer, cancelBookingWithRefund });

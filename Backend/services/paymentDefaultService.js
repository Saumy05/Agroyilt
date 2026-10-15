'use strict';

/**
 * Farmer payment default ("the farmer will not pay the final bill").
 *
 *   reportNonPayment    → vendor reports it once the bill exists (WORK_DONE, unpaid). Opens an URGENT Dispute with the
 *                         trip evidence. The farmer can still pay normally until support decides.
 *   resolveAgainstFarmer→ admin decides the farmer owes it. The booking closes as PAYMENT_DEFAULT, the platform pays the
 *                         vendor's earning so the vendor is not left out of pocket, and the amount becomes the farmer's dues.
 *   payDuesFromWallet   → the farmer clears dues (oldest first) from the wallet.
 *   markDuesPaid        → admin records dues collected outside the app.
 *
 * Dues block new bookings (see assertNoDues). The dues are a field on the farmer, never a negative wallet.
 */

const Booking = require('../models/Booking');
const Dispute = require('../models/Dispute');
const User = require('../models/User');
const VendorBill = require('../models/VendorBill');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../utils/constants');
const ledger = require('./ledgerService');
const WalletTransaction = require('../models/WalletTransaction');
const { creditVendorEarningOnce, releaseVendorIfIdle } = require('./bookingSettlementService');

const REASONS = ['FARMER_REFUSES_TO_PAY', 'FARMER_DISPUTES_AMOUNT', 'FARMER_UNREACHABLE'];
const REASON_LABEL = {
  FARMER_REFUSES_TO_PAY: 'Farmer refuses to pay',
  FARMER_DISPUTES_AMOUNT: 'Farmer disputes the amount',
  FARMER_UNREACHABLE: 'Farmer is unreachable'
};
const OPEN_DISPUTE = { $nin: ['RESOLVED', 'DISMISSED', 'PARTIAL_SETTLEMENT', 'resolved', 'dismissed'] };
const UNPAID = [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PARTIAL];
const TAG = 'FARMER_NON_PAYMENT';

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const fail = (status, message) => Object.assign(new Error(message), { status });
const dueOf = (b) => round2(b.balanceDue > 0 ? b.balanceDue : (b.finalAmount || 0));

const notify = async (payload) => {
  try {
    const { createNotification } = require('../controllers/notificationControllers/notificationController');
    await createNotification(payload);
  } catch (e) { console.warn('[paymentDefault] notify failed', e.message); }
};

/** Vendor reports that the farmer will not pay. Atomic and idempotent per booking. */
const reportNonPayment = async ({ bookingId, vendorId, reason, notes = '' }) => {
  if (!REASONS.includes(reason)) throw fail(400, 'Please select why the payment could not be collected.');
  const cleanNotes = String(notes || '').trim().slice(0, 500);
  const now = new Date();

  const booking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      vendorId,
      status: BOOKING_STATUS.WORK_DONE,
      paymentStatus: { $in: UNPAID },
      cashCollected: { $ne: true },
      vendorBillId: { $ne: null },
      'paymentDispute.isActive': { $ne: true }
    },
    { $set: { 'paymentDispute.isActive': true, 'paymentDispute.reason': reason, 'paymentDispute.notes': cleanNotes || null, 'paymentDispute.reportedAt': now } },
    { new: true }
  );
  if (!booking) {
    const existing = await Booking.findById(bookingId).select('vendorId status paymentStatus paymentDispute').lean();
    if (!existing || String(existing.vendorId) !== String(vendorId)) throw fail(404, 'Booking not found.');
    if (existing.paymentDispute?.isActive) throw fail(409, 'This has already been reported. Support is on it.');
    throw fail(400, 'Non-payment can only be reported after the work is done and the bill is ready, while it is still unpaid.');
  }

  const due = dueOf(booking);
  let dispute;
  try {
    const trip = booking.distanceTrip?.status === 'STOPPED' || booking.rental_type === 'distance_based'
      ? ` Trip: ${round2(booking.distanceTrip?.totalDistanceKm || 0)} km driven${booking.distanceTrip?.estimatedKm ? ` (farmer estimated ${booking.distanceTrip.estimatedKm} km)` : ''}.`
      : '';
    dispute = await Dispute.create({
      bookingDomain: 'VENDOR_BOOKING',
      vendorBookingId: booking._id,
      raisedBy: vendorId,
      raisedByModel: 'Vendor',
      raisedByRole: 'VENDOR',
      reason: 'Payment Dispute',
      description: `${REASON_LABEL[reason]}. Bill ₹${booking.finalAmount}, still due ₹${due}.${trip}${cleanNotes ? ` Notes: ${cleanNotes}` : ''}`,
      status: 'OPEN',
      priority: 'URGENT',
      internalTags: [TAG, reason]
    });
  } catch (err) {
    await Booking.updateOne({ _id: booking._id }, { $set: { 'paymentDispute.isActive': false, 'paymentDispute.reportedAt': null } });
    throw err;
  }
  await Booking.updateOne({ _id: booking._id }, { $set: { 'paymentDispute.disputeId': dispute._id } });

  await notify({
    userId: booking.userId,
    type: 'dispute_update',
    title: 'Payment still pending',
    message: `Your operator reported that the bill of ₹${due} is unpaid. Please pay it now from your booking. Otherwise support will review it, and unpaid dues block new bookings.`,
    relatedId: booking._id,
    relatedType: 'booking',
    priority: 'high',
    pushData: { type: 'dispute_update', bookingId: booking._id.toString(), link: `/user/booking/${booking._id}` }
  });

  return { booking, dispute, due };
};

/** Clears the vendor's report (dispute dismissed, or the farmer paid). */
const clearReport = async (bookingId) => {
  await Booking.updateOne({ _id: bookingId }, { $set: { 'paymentDispute.isActive': false } });
};

/**
 * Admin: the farmer owes this bill. Closes the booking as PAYMENT_DEFAULT, pays the vendor's earning from the platform
 * and records the farmer's dues. Atomic on the booking state, so it can only happen once.
 * @returns {{ dues:number, paidToVendor:number }}
 */
const resolveAgainstFarmer = async (dispute, { adminId = null, adminName = 'Admin' } = {}) => {
  if (dispute.bookingDomain !== 'VENDOR_BOOKING' || !dispute.vendorBookingId) {
    throw new Error('Payment default applies to vendor bookings only');
  }
  const now = new Date();
  const current = await Booking.findById(dispute.vendorBookingId).select('status paymentStatus balanceDue finalAmount cashCollected');
  if (!current) throw new Error('Booking not found');
  if (current.status !== BOOKING_STATUS.WORK_DONE || !UNPAID.includes(current.paymentStatus) || current.cashCollected) {
    throw new Error('This booking is no longer unpaid. If the farmer has paid, dismiss the dispute instead.');
  }
  const due = dueOf(current);
  if (!(due > 0)) throw new Error('Nothing is due on this booking');

  const booking = await Booking.findOneAndUpdate(
    { _id: current._id, status: BOOKING_STATUS.WORK_DONE, paymentStatus: { $in: UNPAID }, cashCollected: { $ne: true } },
    {
      $set: {
        status: BOOKING_STATUS.COMPLETED,
        completedAt: now,
        paymentStatus: PAYMENT_STATUS.PAYMENT_DEFAULT,
        paymentOtp: null,
        customerConfirmationOTP: null,
        'paymentDispute.isActive': false,
        'paymentDefault.amount': due,
        'paymentDefault.status': 'OPEN',
        'paymentDefault.createdAt': now,
        'paymentDefault.disputeId': dispute._id
      }
    },
    { new: true }
  );
  if (!booking) throw new Error('This booking changed while resolving. Please reload and try again.');

  // The farmer owes the platform; the vendor is paid now (platform advances their earning).
  await User.updateOne({ _id: booking.userId }, { $inc: { outstandingDues: due } });
  let paidToVendor = 0;
  const bill = booking.vendorBillId ? await VendorBill.findById(booking.vendorBillId) : null;
  if (bill) {
    const credited = await creditVendorEarningOnce(bill, booking, { via: `farmer payment default (paid by platform, admin ${adminName})`, paymentMethod: 'system' });
    if (credited) paidToVendor = round2(bill.vendorTotalEarning || 0);
  }
  if (booking.vendorId) await releaseVendorIfIdle(booking.vendorId, booking._id);

  await notify({
    userId: booking.userId,
    type: 'dispute_update',
    title: 'Dues added to your account',
    message: `The bill for booking #${booking.bookingNumber} was not paid, so ₹${due} is now due on your account. You cannot make new bookings until it is cleared. Pay it from your wallet or contact support.`,
    relatedId: booking._id,
    relatedType: 'booking',
    priority: 'high',
    pushData: { type: 'dispute_update', bookingId: booking._id.toString(), link: `/user/booking/${booking._id}` }
  });
  if (booking.vendorId) {
    await notify({
      vendorId: booking.vendorId,
      type: 'dispute_update',
      title: 'Payment issue resolved',
      message: `Support resolved the unpaid bill for booking #${booking.bookingNumber}. Your earning${paidToVendor > 0 ? ` of ₹${paidToVendor}` : ''} has been paid to your wallet.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high'
    });
  }

  return { dues: due, paidToVendor, booking };
};

/** Marks one booking's dues as paid exactly once and lowers the farmer's total. */
const closeDues = async (bookingId, via) => {
  const claimed = await Booking.findOneAndUpdate(
    { _id: bookingId, 'paymentDefault.status': 'OPEN' },
    { $set: { 'paymentDefault.status': 'PAID', 'paymentDefault.paidAt': new Date(), 'paymentDefault.paidVia': via } },
    { new: true }
  );
  if (!claimed) return null;
  const amount = round2(claimed.paymentDefault.amount);
  await User.updateOne({ _id: claimed.userId }, [
    { $set: { outstandingDues: { $round: [{ $max: [0, { $subtract: [{ $ifNull: ['$outstandingDues', 0] }, amount] }] }, 2] } } }
  ]);
  return { booking: claimed, amount };
};

/** The farmer's open dues, per booking. */
const getDues = async (userId) => {
  const [user, items] = await Promise.all([
    User.findById(userId).select('outstandingDues').lean(),
    Booking.find({ userId, 'paymentDefault.status': 'OPEN' })
      .select('bookingNumber serviceName paymentDefault completedAt').sort({ 'paymentDefault.createdAt': 1 }).lean()
  ]);
  return {
    total: round2(user?.outstandingDues || 0),
    items: items.map((b) => ({ bookingId: b._id, bookingNumber: b.bookingNumber, serviceName: b.serviceName, amount: b.paymentDefault.amount, since: b.paymentDefault.createdAt }))
  };
};

/** Farmer clears dues from the wallet, oldest first, as many as the balance covers. Each debit applies once. */
const payDuesFromWallet = async (userId) => {
  const { items } = await getDues(userId);
  let paid = 0;
  const cleared = [];
  for (const it of items) {
    const key = `farmer_dues_${it.bookingId}`;
    const amount = round2(it.amount);
    let r = await ledger.debitIfEnough({ ownerId: userId, ownerModel: 'User', amount, key, reason: 'dues_recovery', referenceId: it.bookingId });
    if (r.duplicate) {
      // The key was used before: a completed row means the debit already happened (a crash before closeDues), so just close.
      // A failed row means an earlier try had too little balance and nothing was debited, so try again under a fresh key.
      const prior = await WalletTransaction.findOne({ idempotencyKey: key }).select('status').lean();
      if (prior?.status === 'failed') {
        r = await ledger.debitIfEnough({ ownerId: userId, ownerModel: 'User', amount, key: `${key}_${Date.now()}`, reason: 'dues_recovery', referenceId: it.bookingId });
      } else if (prior?.status !== 'completed') {
        break; // another request is mid-way
      } else {
        r = { applied: true };
      }
    }
    if (!r.applied) break; // not enough balance for this one
    const closed = await closeDues(it.bookingId, 'wallet');
    if (closed) { paid = round2(paid + closed.amount); cleared.push(String(it.bookingId)); }
  }
  return { paid, cleared, ...(await getDues(userId)) };
};

/** Admin records dues collected outside the app. */
const markDuesPaid = async (dispute, { adminName = 'Admin' } = {}) => {
  if (!dispute.vendorBookingId) throw fail(400, 'This dispute has no booking');
  const closed = await closeDues(dispute.vendorBookingId, 'admin_recorded');
  if (!closed) throw fail(400, 'There are no open dues on this booking');
  await notify({
    userId: closed.booking.userId,
    type: 'dispute_update',
    title: 'Dues cleared',
    message: `Your dues of ₹${closed.amount} for booking #${closed.booking.bookingNumber} were recorded as paid (${adminName}). You can book again.`,
    relatedId: closed.booking._id,
    relatedType: 'booking',
    priority: 'high'
  });
  return closed;
};

/** Throws a 403 (code FARMER_DUES_PENDING) when the farmer still owes dues. */
const assertNoDues = async (userId) => {
  const user = await User.findById(userId).select('outstandingDues').lean();
  const dues = round2(user?.outstandingDues || 0);
  if (dues > 0) {
    throw Object.assign(new Error(`You have ₹${dues} in unpaid dues from an earlier booking. Please clear it to book again.`), { status: 403, code: 'FARMER_DUES_PENDING', dues });
  }
};

module.exports = {
  REASONS, REASON_LABEL, TAG,
  reportNonPayment, clearReport, resolveAgainstFarmer, getDues, payDuesFromWallet, markDuesPaid, assertNoDues
};

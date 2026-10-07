'use strict';

/**
 * End-OTP escape valve.
 *
 * When the farmer cannot / will not give the End OTP, the vendor must not be stuck on the field:
 *   reportEndOtpUnavailable  → freezes billable time, opens an URGENT Dispute carrying the vendor's photo evidence.
 *   adminForceEndAndBill     → support ends the service WITHOUT the OTP through the normal billing path
 *                              (same bill / GST / vendor payout as a normal end), then payment collection continues as usual.
 *
 * The normal OTP path keeps working: if the farmer returns, the vendor can still end with the OTP.
 */

const Booking = require('../models/Booking');
const Dispute = require('../models/Dispute');
const VendorEquipment = require('../models/VendorEquipment');
const { BOOKING_STATUS } = require('../utils/constants');
const { closeServiceTimer, finalizeMachineryBilling } = require('./bookingSettlementService');

const REASONS = ['FARMER_NOT_ANSWERING', 'FARMER_DISPUTING_WORK', 'FARMER_LEFT_FIELD'];
const REASON_LABEL = {
  FARMER_NOT_ANSWERING: 'Farmer not answering the phone',
  FARMER_DISPUTING_WORK: 'Farmer disputing the work',
  FARMER_LEFT_FIELD: 'Farmer left the field'
};
const OPEN_DISPUTE = { $nin: ['RESOLVED', 'DISMISSED', 'PARTIAL_SETTLEMENT', 'resolved', 'dismissed'] };

const fail = (status, message) => Object.assign(new Error(message), { status });
const isUrl = (v) => typeof v === 'string' && v.trim().length > 0 && v.length < 2048;

/**
 * Vendor reports that the End OTP is unavailable.
 * @returns {{ booking, dispute }}
 */
const reportEndOtpUnavailable = async ({ bookingId, vendorId, reason, notes = '', photos = [], odometerPhoto }) => {
  if (!REASONS.includes(reason)) throw fail(400, 'Please select why the End OTP is unavailable.');
  const fieldPhotos = (Array.isArray(photos) ? photos : []).filter(isUrl).slice(0, 2);
  if (!isUrl(odometerPhoto)) throw fail(400, 'A photo of the engine / odometer reading is required.');
  if (fieldPhotos.length < 1) throw fail(400, 'At least one photo of the completed field is required.');

  const now = new Date();
  const cleanNotes = String(notes || '').trim().slice(0, 500);

  // Atomic claim: only an in-progress, running/paused job of THIS vendor, and only once.
  const booking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      vendorId,
      status: BOOKING_STATUS.IN_PROGRESS,
      'serviceTimer.status': { $in: ['RUNNING', 'PAUSED'] },
      'endOtpDispute.isActive': { $ne: true }
    },
    { $set: { 'endOtpDispute.isActive': true, 'endOtpDispute.reason': reason, 'endOtpDispute.notes': cleanNotes || null, 'endOtpDispute.reportedAt': now } },
    { new: true }
  );
  if (!booking) {
    const existing = await Booking.findById(bookingId).select('vendorId status endOtpDispute').lean();
    if (!existing || String(existing.vendorId) !== String(vendorId)) throw fail(404, 'Booking not found.');
    if (existing.endOtpDispute?.isActive) throw fail(409, 'This has already been reported. Support is on it.');
    throw fail(400, 'This can only be reported while the service is in progress.');
  }

  let dispute;
  try {
    const description = `${REASON_LABEL[reason]}. Vendor could not get the End OTP and left evidence.${cleanNotes ? ` Notes: ${cleanNotes}` : ''}`;
    const evidence = [
      { url: odometerPhoto, caption: 'End engine / odometer reading' },
      ...fieldPhotos.map((url, i) => ({ url, caption: `Completed field photo ${i + 1}` }))
    ].map((e) => ({ ...e, uploadedBy: vendorId, uploaderModel: 'Vendor', uploaderRole: 'VENDOR', fileType: 'image', uploadedAt: now }));

    dispute = await Dispute.findOne({ vendorBookingId: booking._id, raisedBy: vendorId, status: OPEN_DISPUTE });
    if (dispute) {
      dispute.evidence.push(...evidence);
      dispute.priority = 'URGENT';
      dispute.reason = 'OTP Refusal';
      dispute.internalTags = [...new Set([...(dispute.internalTags || []), 'END_OTP_UNAVAILABLE', reason])];
      await dispute.save();
    } else {
      dispute = await Dispute.create({
        bookingDomain: 'VENDOR_BOOKING',
        vendorBookingId: booking._id,
        raisedBy: vendorId,
        raisedByModel: 'Vendor',
        raisedByRole: 'VENDOR',
        reason: 'OTP Refusal',
        description,
        evidence,
        attachments: evidence.map((e) => e.url),
        status: 'OPEN',
        priority: 'URGENT',
        internalTags: ['END_OTP_UNAVAILABLE', reason]
      });
    }
  } catch (err) {
    // Nothing was frozen yet; release the claim so the vendor can retry.
    await Booking.updateOne({ _id: booking._id }, { $set: { 'endOtpDispute.isActive': false, 'endOtpDispute.reportedAt': null } });
    throw err;
  }

  // Freeze billable time at the moment of the report: the farmer is not billed for time after it.
  closeServiceTimer(booking, now, 'STOPPED');
  booking.endOtpDispute.disputeId = dispute._id;
  booking.serviceTimer.logs.push({
    action: 'OTP_UNAVAILABLE',
    performedBy: 'vendor',
    performedById: vendorId,
    performedByRole: 'Vendor',
    reason: REASON_LABEL[reason],
    notes: cleanNotes || null,
    timestamp: now,
    activeSecondsSnapshot: booking.serviceTimer.accumulatedActiveSeconds || 0,
    pausedSecondsSnapshot: booking.serviceTimer.accumulatedPausedSeconds || 0
  });
  await booking.save();

  return { booking, dispute };
};

/**
 * Support ends the service without the farmer's OTP and generates the bill exactly like a normal end.
 * Leaves the booking in the normal post-work state (usually WORK_DONE awaiting payment).
 * @returns {{ booking, result } | null} null when the booking is not in a state this can handle
 */
const adminForceEndAndBill = async (bookingId, { adminId = null, adminName = 'Admin', disputeId = null } = {}) => {
  const now = new Date();
  const claimed = await Booking.findOneAndUpdate(
    { _id: bookingId, status: BOOKING_STATUS.IN_PROGRESS, 'serviceTimer.status': { $in: ['RUNNING', 'PAUSED', 'STOPPED'] } },
    { $set: { status: BOOKING_STATUS.WORK_DONE } },
    { new: true }
  ).populate('serviceId');
  if (!claimed) return null;

  claimed.driver_end_otp = null;
  closeServiceTimer(claimed, now, 'COMPLETED');

  const equipment = claimed.equipmentId ? await VendorEquipment.findById(claimed.equipmentId) : null;
  const result = await finalizeMachineryBilling(claimed, { service: claimed.serviceId, equipment, now });
  const b = result.booking;

  const note = `Admin ended service without End OTP${disputeId ? ` — Dispute #${disputeId}` : ''}`;
  b.adminOverride = true;
  b.adminOverrideNote = note;
  if (b.endOtpDispute) b.endOtpDispute.isActive = false;
  b.serviceTimer.billingSummary = {
    totalActiveMinutes: result.calc.totalActiveMinutes || 0,
    totalPausedMinutes: Math.floor((b.serviceTimer.accumulatedPausedSeconds || 0) / 60),
    adminBaseCharge: result.calc.adminBase || 0,
    timeCharge: result.calc.timeCharge || 0,
    subtotal: result.calc.base,
    discount: b.discount || 0,
    finalPayable: result.grandTotal,
    isPartialEnd: false,
    partialEndReason: null,
    calculatedAt: now
  };
  b.serviceTimer.logs.push({
    action: 'END',
    performedBy: 'system',
    reason: `${note} (by ${adminName})`,
    timestamp: now,
    activeSecondsSnapshot: b.serviceTimer.accumulatedActiveSeconds || 0,
    pausedSecondsSnapshot: b.serviceTimer.accumulatedPausedSeconds || 0
  });
  await b.save();

  const needsPayment = b.status === BOOKING_STATUS.WORK_DONE;
  try {
    const { createNotification } = require('../controllers/notificationControllers/notificationController');
    await createNotification({
      userId: b.userId,
      type: 'work_completed',
      title: 'Work Completed & Bill Ready',
      message: needsPayment
        ? `Support has completed your service after reviewing the work. Amount due: ₹${b.balanceDue}. Payment OTP: ${b.paymentOtp}. Share this OTP with the operator ONLY after paying.`
        : `Support has completed your service. Bill ₹${result.grandTotal} was settled from your advance.`,
      relatedId: b._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: { type: 'work_done', bookingId: b._id.toString(), paymentOtp: needsPayment ? b.paymentOtp : undefined, link: `/user/booking/${b._id}` }
    });
  } catch (e) { console.warn('[adminForceEndAndBill] notify failed', e.message); }

  return { booking: b, result };
};

module.exports = { REASONS, REASON_LABEL, reportEndOtpUnavailable, adminForceEndAndBill };

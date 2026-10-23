'use strict';

const Booking = require('../../models/Booking');
const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
const IndWorkerExtension = require('../../models/IndWorkerExtension');
const Worker = require('../../models/Worker');
const User = require('../../models/User');
const Wallet = require('../../models/Wallet');
const Vendor = require('../../models/Vendor');
const Transaction = require('../../models/Transaction');
const Settings = require('../../models/Settings');
const { PAYMENT_STATUS, BOOKING_STATUS } = require('../../utils/constants');
const {
  getAdvancePaid,
  creditVendorEarningOnce,
  ensureBill,
  releaseVendorIfIdle
} = require('../../services/bookingSettlementService');

/** Caller's relationship to a booking/assignment/request: 'farmer' | 'provider' | 'admin' | null. */
const qrCallerRelation = (req, { booking, assignment, parentReq }) => {
  const role = String(req.user?.role || req.userRole || '').toUpperCase();
  const uid = String(req.user?._id || req.user?.id || '');
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return 'admin';
  const farmerOf = (d) => String(d?.farmerId?._id || d?.farmerId || d?.userId?._id || d?.userId || '');
  const target = assignment || booking || parentReq;
  if (role === 'USER' && farmerOf(target) === uid) return 'farmer';
  if (role === 'VENDOR' && booking?.vendorId && String(booking.vendorId._id || booking.vendorId) === uid) return 'provider';
  if (role === 'WORKER') {
    const w = assignment?.workerId || booking?.workerId || parentReq?.workerId;
    if (w && String(w._id || w) === uid) return 'provider';
    if (parentReq?.selectedWorkerIds && parentReq.selectedWorkerIds.some(sw => String(sw._id || sw) === uid)) return 'provider';
  }
  return null;
};

const { getIO } = require('../../sockets');
const { createNotification } = require('../notificationControllers/notificationController');

/** Safe socket emit helper */
const emitSafe = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (e) {
    // Non-fatal
  }
};

/**
 * Helper to fetch Admin UPI configuration from Settings
 */
const getAdminUpiConfig = async () => {
  const settings = await Settings.findOne({ type: 'global' });
  const adminUpiId = settings?.adminUpiId || process.env.ADMIN_UPI_ID || 'agroyilt@icici';
  const merchantName = settings?.adminUpiMerchantName || settings?.companyName || 'AgroYilt Technologies';
  return { adminUpiId, merchantName, settings };
};

/**
 * What a worker assignment's QR must collect, and whether a QR may be used for it now. One place, used by QR creation,
 * QR confirmation and the "pay all" request QR, so the amount and the rules never drift apart.
 *  - amount: exactly what the farmer owes the worker for this collection (the worker's pay + the platform fee on it + any
 *    travel charge), the same figure the cash path collects. DAILY: only the last day collects, and it collects whatever
 *    the earlier days' cash did not already cover.
 *  - rules: a cash booking only (an online-paid job is already paid); a DAILY job only on its last day (a QR confirmation
 *    completes the whole assignment, so earlier days are collected in cash and day by day).
 * @returns {{ ok: true, payable: number, parent: object, cash: object } | { ok: false, status: number, message: string }}
 */
const assignmentQrDue = async (assignment) => {
  const { isCashAssignment } = require('../../services/workerSettlementService');
  const { buildWorkerCashCollection } = require('../../services/workerFinancialService');
  const parent = await WorkerBookingRequest.findById(assignment.parentRequestId)
    .select('paymentMethod paymentStatus financialSnapshot bookingType durationMinutes numberOfDays auditLog workTitle');
  if (!isCashAssignment(assignment, parent)) {
    return { ok: false, status: 409, message: 'This job was paid online, so there is nothing to collect with a UPI QR.' };
  }
  const exts = await IndWorkerExtension.find({ parentRequestId: assignment.parentRequestId, status: 'CONFIRMED' });
  const cash = buildWorkerCashCollection(assignment, parent, exts);
  if (cash.today && !cash.today.isLastDay) {
    return {
      ok: false, status: 409,
      message: `UPI QR can be used on the last day only (day ${cash.today.dayNumber} of ${cash.today.totalDays} is today). Collect each earlier day's pay in cash.`
    };
  }
  const payable = cash.today ? cash.today.amount : cash.totalToCollect;
  if (!(payable > 0)) return { ok: false, status: 400, message: 'Invalid payable amount for QR generation' };
  return { ok: true, payable, parent, cash };
};

/**
 * Settles one worker assignment as paid through the admin QR: claims it once, then runs the shared settlement. The worker's
 * wallet is credited the net pay (and travel charge) not already covered by earlier cash days; the platform keeps the
 * commission and the platform fee.
 * @returns {{ ok: true, payable, credited, grossAmount, commissionAmount, netEarning } | { ok: false, status, message }}
 */
const settleAssignmentByQr = async (assignment, { utr, adminUpiId, expectedAmount, paymentId }) => {
  const due = await assignmentQrDue(assignment);
  if (!due.ok) return due;
  // what is owed changed after the QR was made (an extension, a bill edit): do not split the money on a stale amount
  if (expectedAmount != null && !sameMoney(due.payable, expectedAmount)) {
    return { ok: false, status: 409, review: true, message: `The amount owed changed to ₹${due.payable} after the QR (₹${expectedAmount}) was made.` };
  }

  // The provider cannot be paid for a job that never started (their UTR is not verified against the bank here).
  if (assignment.visitOtpStatus !== 'VERIFIED' && !(assignment.workedDays > 0)) {
    return { ok: false, status: 409, message: 'A QR payment can only be confirmed after the work has started.' };
  }

  const isDaily = assignment.bookingType === 'DAILY';
  const bookedDays = Math.max(1, Number(assignment.bookedDays) || 1);
  let grossAmount = Number(assignment.grossAmount) || 0;
  let commissionAmount = Number(assignment.commissionAmount) || 0;
  let netEarning = Number(assignment.netEarning) || 0;
  if (isDaily) {
    // the last day is being closed by this payment, so every booked day counts as worked
    const { calculateDailyWorkerSettlement } = require('../../services/workerFinancialService');
    const s = calculateDailyWorkerSettlement({ ...assignment.toObject(), workedDays: bookedDays });
    grossAmount = s.grossAmount; commissionAmount = s.commissionAmount; netEarning = s.netEarning;
  }
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    return { ok: false, status: 400, message: 'A valid payment amount is required.' };
  }

  const now = new Date();
  const dayIdx = Math.max(1, Number(assignment.currentDayIndex) || 1);
  const claimed = await IndWorkerAssignment.findOneAndUpdate(
    { _id: assignment._id, assignmentStatus: 'CONFIRMED', settlementStatus: { $in: ['PENDING', 'FAILED'] } },
    {
      $set: {
        completionStatus: 'OTP_VERIFIED', workStatus: 'SUBMITTED', paymentMethod: 'qr_online', isCashBooking: false,
        grossAmount, commissionAmount, netEarning, workCompletedAt: now, cashPlatformFee: 0,
        qrPayment: {
          ...sessionFields(assignment),
          refId: assignment.qrPayment?.refId || `qr_settle_assign_${assignment._id}`, amount: due.payable, adminUpiId,
          status: 'COMPLETED', utr, razorpayPaymentId: paymentId || null, confirmedAt: now
        },
        ...(isDaily ? { workedDays: bookedDays, 'dailyLogs.$[d].workStatus': 'COMPLETED', 'dailyLogs.$[d].completedAt': now } : {})
      }
    },
    { new: true, ...(isDaily ? { arrayFilters: [{ 'd.dayNumber': dayIdx }] } : {}) }
  );
  if (!claimed) return { ok: false, status: 409, message: 'This assignment is already settled or being settled.' };

  // Settle through the shared, idempotent ledger path (credit exactly once, retry-safe).
  const settlementSvc = require('../../services/workerSettlementService');
  const outcome = await settlementSvc.settleAssignment(assignment._id, { useStoredAmounts: true });
  if (outcome.error) {
    return { ok: false, status: 500, message: 'Payment was recorded but settlement failed; it will be retried automatically.' };
  }
  if (assignment.legacyBookingId) {
    await Booking.findByIdAndUpdate(assignment.legacyBookingId, {
      paymentStatus: PAYMENT_STATUS.SUCCESS, paymentMethod: 'qr_online', cashCollected: false, finalAmount: grossAmount
    });
  }

  // what actually reached the worker's wallet (earlier cash days were credited/settled on their own days)
  const earlier = assignment.cashDays || [];
  const earlierNet = earlier.reduce((sum, d) => sum + (d.workerAmount || 0) - (d.commission || 0), 0);
  const earlierTravel = earlier.reduce((sum, d) => sum + (d.travelCharge || 0), 0);
  const credited = Math.round((Math.max(0, netEarning - earlierNet) + Math.max(0, (Number(assignment.travelCharge) || 0) - earlierTravel)) * 100) / 100;
  return { ok: true, payable: due.payable, credited, grossAmount, commissionAmount, netEarning };
};

/**
 * POST /api/bookings/payment/generate-admin-qr (and /api/bookings/cash/:id/generate-admin-qr)
 * Generates an AgroYilt Admin Dynamic UPI QR code with locked-in bill amount.
 */
exports.generateAdminPaymentQr = async (req, res) => {
  try {
    const id = req.params.id || req.body.id || req.body.bookingId;
    // The payable amount is always derived server-side (bill / agreed rate); client amounts are ignored.
    const amount = undefined;
    const extraItems = undefined;

    if (!id || !/^[0-9a-fA-F]{24}$/.test(String(id))) {
      return res.status(400).json({ success: false, message: 'Valid target ID is required' });
    }

    // Resolve target: Assignment, Booking, or WorkerBookingRequest
    let assignment = await IndWorkerAssignment.findById(id).populate('farmerId workerId');
    let booking = null;
    let parentReq = null;

    if (!assignment) {
      booking = await Booking.findById(id).populate('userId workerId vendorId');
      if (!booking) {
        parentReq = await WorkerBookingRequest.findById(id).populate('farmerId');
      }
    }

    if (!assignment && !booking && !parentReq) {
      return res.status(404).json({ success: false, message: 'Booking or Assignment not found' });
    }

    // Determine target entity details
    if (!qrCallerRelation(req, { booking, assignment, parentReq })) {
      return res.status(403).json({ success: false, message: 'Not authorized for this booking.' });
    }
    if (assignment && (assignment.assignmentStatus === 'COMPLETED' || assignment.settlementStatus === 'SETTLED')) {
      return res.status(400).json({ success: false, message: 'This assignment is already settled.' });
    }
    if (parentReq && parentReq.paymentStatus === 'success') {
      return res.status(400).json({ success: false, message: 'This request is already paid.' });
    }
    if (booking && [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR, PAYMENT_STATUS.REFUNDED].includes(booking.paymentStatus)) {
      return res.status(400).json({ success: false, message: 'This booking is already paid.' });
    }
    if (booking && ![BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.AWAITING_PAYMENT, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.VISITED].includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot generate a payment QR while the booking is "${booking.status}"` });
    }

    let docType = 'assignment';
    let targetDoc = assignment;
    let payableAmount = 0;
    let farmerId = null;
    let farmerName = 'Farmer';
    let referenceNumber = '';

    if (assignment) {
      docType = 'assignment';
      targetDoc = assignment;
      farmerId = assignment.farmerId?._id || assignment.farmerId;
      farmerName = assignment.farmerId?.name || 'Farmer';
      referenceNumber = `WRK-${assignment._id.toString().slice(-6).toUpperCase()}`;

      // The QR collects exactly what the farmer owes the worker (pay + platform fee + travel), and only when a QR may be used
      const due = await assignmentQrDue(assignment);
      if (!due.ok) return res.status(due.status).json({ success: false, message: due.message });
      payableAmount = due.payable;

      // Check if legacy booking is attached
      if (assignment.legacyBookingId) {
        booking = await Booking.findById(assignment.legacyBookingId);
      }
    } else if (booking) {
      docType = 'booking';
      targetDoc = booking;
      farmerId = booking.userId?._id || booking.userId;
      farmerName = booking.userId?.name || 'Customer';
      referenceNumber = booking.bookingNumber || `BKG-${booking._id.toString().slice(-6).toUpperCase()}`;

      // Update extra items if provided
      if (extraItems && Array.isArray(extraItems) && extraItems.length > 0) {
        booking.workDoneDetails = {
          ...booking.workDoneDetails,
          items: extraItems.map(item => ({
            title: item.name || item.title,
            qty: Number(item.qty) || Number(item.quantity) || 1,
            price: Number(item.price) || 0
          }))
        };

        booking.extraCharges = extraItems.map(item => ({
          name: item.name || item.title,
          quantity: Number(item.qty) || Number(item.quantity) || 1,
          price: Number(item.price) || 0,
          total: (Number(item.qty) || Number(item.quantity) || 1) * (Number(item.price) || 0)
        }));

        booking.extraChargesTotal = booking.extraCharges.reduce((sum, item) => sum + item.total, 0);
        booking.markModified('workDoneDetails');
        booking.markModified('extraCharges');
      }

      if (amount !== undefined && Number(amount) > 0) {
        payableAmount = Number(amount);
        booking.finalAmount = payableAmount;
        booking.userPayableAmount = payableAmount;
      } else {
        payableAmount = booking.balanceDue > 0 ? booking.balanceDue : (booking.finalAmount || 0);
      }
    } else if (parentReq) {
      docType = 'worker_request';
      targetDoc = parentReq;
      farmerId = parentReq.farmerId?._id || parentReq.farmerId;
      farmerName = parentReq.farmerId?.name || 'Farmer';
      referenceNumber = `REQ-${parentReq._id.toString().slice(-6).toUpperCase()}`;

      // One QR for every worker of the request: the sum of what each of them is owed (all must be ready to be paid this way)
      const activeAssignments = await IndWorkerAssignment.find({ parentRequestId: parentReq._id, assignmentStatus: { $ne: 'CANCELLED' }, settlementStatus: { $ne: 'SETTLED' } });
      if (activeAssignments.length === 0) {
        return res.status(400).json({ success: false, message: 'There is nothing left to pay on this request.' });
      }
      for (const asg of activeAssignments) {
        const due = await assignmentQrDue(asg);
        if (!due.ok) return res.status(due.status).json({ success: false, message: due.message });
        payableAmount += due.payable;
      }
      payableAmount = Math.round(payableAmount * 100) / 100;
    }

    if (payableAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payable amount for QR generation' });
    }

    const { merchantName } = await getAdminUpiConfig();
    const rzp = require('../../services/razorpayService');
    const transactionNote = `AgroYilt Service Bill ${referenceNumber}`;

    // Reuse a QR that is still open for exactly this amount; otherwise close the old one and make a new one
    const existing = targetDoc.qrPayment;
    const reusable = existing && existing.status === 'PENDING' && existing.razorpayQrId && existing.razorpayQrImageUrl
      && existing.expiresAt && new Date(existing.expiresAt).getTime() > Date.now() + 3 * 60 * 1000
      && sameMoney(existing.amount, payableAmount);

    let qrSession;
    if (reusable) {
      qrSession = sessionFields(targetDoc);
    } else {
      if (existing?.status === 'PENDING' && existing.razorpayQrId) await rzp.closeQr(existing.razorpayQrId);

      const cleanId = (targetDoc._id || id).toString().slice(-8).toUpperCase();
      const refId = `AGY_QR_${cleanId}_${Date.now()}`;
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes
      const created = await rzp.createUpiQr({
        amount: payableAmount,
        name: `AgroYilt ${referenceNumber}`.slice(0, 40),
        description: transactionNote,
        closeBy: expiresAt,
        notes: { agyTargetType: docType, agyTargetId: String(targetDoc._id), agyRefId: refId }
      });
      if (!created.success || !created.qr?.id || !created.qr?.image_url) {
        console.error('[generateAdminPaymentQr] Razorpay QR failed:', created.error);
        return res.status(503).json({ success: false, message: 'UPI QR is not available right now. Please collect cash or try again shortly.' });
      }

      qrSession = {
        refId, amount: payableAmount, adminUpiId: null, status: 'PENDING', generatedAt: new Date(), expiresAt,
        razorpayQrId: created.qr.id, razorpayQrImageUrl: created.qr.image_url
      };
      targetDoc.qrPayment = qrSession;
      await targetDoc.save();

      // Also persist in legacy booking if linked
      if (booking && targetDoc !== booking) {
        booking.qrPayment = qrSession;
        await booking.save();
      }
    }
    const { refId, expiresAt, razorpayQrImageUrl: qrCodeDataUrl } = qrSession;

    // Tell the farmer's screen a QR is ready
    if (farmerId) {
      emitSafe(`user_${farmerId}`, 'admin_qr_generated', { id: targetDoc._id, amount: payableAmount, refId, qrCodeDataUrl, merchantName });
    }
    emitSafe(`booking_${targetDoc._id}`, 'admin_qr_generated', { id: targetDoc._id, amount: payableAmount, refId, qrCodeDataUrl });

    return res.status(200).json({
      success: true,
      message: 'Payment QR generated successfully',
      data: {
        id: targetDoc._id,
        type: docType,
        amount: payableAmount,
        adminUpiId: null,
        merchantName,
        refId,
        upiUri: null,
        qrCodeDataUrl,
        expiresAt,
        referenceNumber
      }
    });

  } catch (error) {
    console.error('[generateAdminPaymentQr]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Lets the settlement code below answer with `res.status(x).json(y)` while the caller (HTTP handler or webhook) receives { status, body }. */
const makeReply = () => {
  const r = { code: 200, status(c) { r.code = c; return r; }, json(body) { return { status: r.code, body }; } };
  return r;
};

/** The QR session fields worth keeping when a payment settles the target. */
const sessionFields = (doc) => {
  const q = doc?.qrPayment || {};
  return {
    refId: q.refId || null, amount: q.amount ?? null, adminUpiId: q.adminUpiId || null,
    generatedAt: q.generatedAt || null, expiresAt: q.expiresAt || null,
    razorpayQrId: q.razorpayQrId || null, razorpayQrImageUrl: q.razorpayQrImageUrl || null
  };
};

const sameMoney = (a, b) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);

/**
 * Applies a payment Razorpay has confirmed (captured, for exactly the amount the QR was made for) to the worker
 * assignment, booking or worker request it was made for: marks it paid and settles the money.
 * `expectedAmount` is what the QR was made for; if what is owed has changed since (an extension, a bill edit) the
 * payment is NOT applied: the target is flagged for review so no money is mis-split.
 * @returns {Promise<{ status: number, body: object }>}
 */
const runQrSettlement = async ({ assignment = null, booking = null, parentReq = null }, ctx) => {
  const res = makeReply();
  const { utr: cleanUtr, paymentId, expectedAmount, confirmedBy: confirmedByUserId } = ctx;
  const adminUpiId = ctx.adminUpiId || null;

    // ─────────────────────────────────────────────────────────────────────────
    // FLOW A: INDIVIDUAL WORKER ASSIGNMENT
    // ─────────────────────────────────────────────────────────────────────────
    if (assignment) {
      if (assignment.assignmentStatus === 'COMPLETED' || assignment.settlementStatus === 'SETTLED') {
        // Already paid out. Never pay a second time because a QR is confirmed after the job was settled another way.
        return res.status(assignment.paymentMethod === 'qr_online' ? 200 : 409).json({
          success: assignment.paymentMethod === 'qr_online',
          message: assignment.paymentMethod === 'qr_online'
            ? 'Payment already confirmed and settled via Admin QR'
            : 'This assignment was already settled; the QR payment cannot be applied.',
          data: { assignmentId: assignment._id, settled: true }
        });
      }

      const workerId = assignment.workerId;
      const farmerId = assignment.farmerId;
      const result = await settleAssignmentByQr(assignment, { utr: cleanUtr, adminUpiId, expectedAmount, paymentId });
      if (!result.ok) return res.status(result.status).json({ success: false, message: result.message, ...(result.review ? { review: true } : {}) });
      const { payable, credited, grossAmount, commissionAmount, netEarning: workerNetEarning } = result;

      await require('../../services/workerSettlementService').finishParent(assignment.parentRequestId);

      // 7. Socket Events
      const eventData = {
        requestId: assignment.parentRequestId,
        assignmentId: assignment._id,
        workerId: assignment.workerId,
        paymentMethod: 'qr_online',
        amountPaid: payable,
        grossAmount,
        netEarning: workerNetEarning,
        credited,
        settlementStatus: 'SETTLED',
        status: 'completed',
        utr: cleanUtr || null,
        serverTimestamp: new Date()
      };

      emitSafe(`user_${farmerId}`, 'qr_payment_success', eventData);
      emitSafe(`worker_${workerId}`, 'qr_payment_success', eventData);
      emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_settled', eventData);
      emitSafe(`booking_req_${assignment.parentRequestId}`, 'assignment_settled', eventData);

      // 8. Push Notifications
      await createNotification({
        userId: farmerId,
        type: 'payment_success',
        title: 'UPI Payment Confirmed!',
        message: `Your payment of ₹${payable} via Admin QR has been successfully verified. Work marked complete.`,
        relatedId: assignment._id,
        relatedType: 'IndWorkerAssignment',
        priority: 'high'
      });

      await createNotification({
        recipientType: 'worker',
        recipientId: workerId,
        type: 'payment_success',
        title: '💰 Wallet Credited via Admin QR!',
        message: `₹${credited} has been added to your AgroYilt wallet for completing this job. (Farmer paid via Admin QR).`,
        relatedId: assignment.parentRequestId || assignment._id,
        relatedType: 'IndWorkerAssignment',
        priority: 'high'
      });

      return res.status(200).json({
        success: true,
        message: `Admin QR payment verified! ₹${credited} credited to worker wallet.`,
        data: {
          assignmentId: assignment._id,
          amountPaid: payable,
          grossAmount,
          netEarning: workerNetEarning,
          credited,
          commissionAmount,
          paymentMethod: 'qr_online'
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FLOW B: VENDOR / EQUIPMENT / SINGLE WORKER BOOKING
    // ─────────────────────────────────────────────────────────────────────────
    if (booking) {
      if (booking.paymentStatus === PAYMENT_STATUS.SUCCESS && booking.paymentMethod === 'qr_online') {
        return res.status(200).json({
          success: true,
          message: 'Payment already confirmed and settled',
          data: { bookingId: booking._id, paymentStatus: booking.paymentStatus }
        });
      }
      if ([PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR, PAYMENT_STATUS.REFUNDED].includes(booking.paymentStatus) || booking.cashCollected) {
        return res.status(409).json({ success: false, message: 'This booking has already been paid.' });
      }
      if (![BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.AWAITING_PAYMENT].includes(booking.status)) {
        return res.status(400).json({ success: false, message: `Cannot confirm payment while the booking is "${booking.status}"` });
      }

      const advance = getAdvancePaid(booking);
      const collectionAmount = booking.balanceDue > 0 ? booking.balanceDue : Math.max(0, (booking.finalAmount || 0) - advance);
      if (expectedAmount != null && !sameMoney(collectionAmount, expectedAmount)) {
        return res.status(409).json({ success: false, review: true, message: `The bill changed to ₹${collectionAmount} after the QR (₹${expectedAmount}) was made.` });
      }

      // Atomic claim: only one confirm can win
      const claimed = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          cashCollected: { $ne: true },
          paymentStatus: { $nin: [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR, PAYMENT_STATUS.REFUNDED] },
          status: { $in: [BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.AWAITING_PAYMENT] }
        },
        {
          $set: {
            paymentStatus: PAYMENT_STATUS.SUCCESS,
            paymentMethod: 'qr_online',
            advancePaidAmount: advance + collectionAmount,
            balanceDue: 0,
            status: BOOKING_STATUS.COMPLETED,
            completedAt: new Date(),
            paymentOtp: null,
            customerConfirmationOTP: null,
            qrPayment: { ...(booking.qrPayment || {}), status: 'COMPLETED', utr: cleanUtr, confirmedAt: new Date(), confirmedBy: String(confirmedByUserId), razorpayPaymentId: paymentId }
          }
        },
        { new: true }
      );
      if (!claimed) {
        return res.status(409).json({ success: false, message: 'This booking has already been paid.' });
      }

      let vendorEarning = 0;
      if (claimed.vendorId) {
        const bill = await ensureBill(claimed);
        vendorEarning = bill.vendorTotalEarning || 0;
        // QR money lands in the platform account: vendor earnings only, no cash dues
        await creditVendorEarningOnce(bill, claimed, { via: 'admin UPI QR', paymentMethod: 'qr_online' });
        await releaseVendorIfIdle(claimed.vendorId, claimed._id);
      }

      const updatePayload = {
        bookingId: claimed._id,
        status: claimed.status,
        paymentStatus: claimed.paymentStatus,
        paymentMethod: 'qr_online',
        finalAmount: claimed.finalAmount,
        message: 'Admin UPI QR payment verified and booking completed!'
      };
      emitSafe(`user_${claimed.userId}`, 'booking_updated', updatePayload);
      emitSafe(`booking_${claimed._id}`, 'booking_updated', updatePayload);
      if (claimed.vendorId) emitSafe(`vendor_${claimed.vendorId}`, 'booking_updated', updatePayload);

      await createNotification({
        userId: claimed.userId,
        type: 'payment_success',
        title: 'Payment Received (Admin UPI QR)',
        message: `Your payment of ₹${collectionAmount} via UPI QR has been verified. Job Completed. Thanks!`,
        relatedId: claimed._id,
        relatedType: 'booking',
        priority: 'high'
      });

      return res.status(200).json({
        success: true,
        message: 'Admin QR payment verified successfully',
        data: { bookingId: claimed._id, amount: collectionAmount, vendorEarning, paymentMethod: 'qr_online' }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FLOW C: PARENT WORKER REQUEST
    // ─────────────────────────────────────────────────────────────────────────
    if (parentReq) {
      if (parentReq.paymentStatus === 'success' && parentReq.paymentMethod === 'qr_online') {
        return res.status(200).json({
          success: true,
          message: 'Payment already confirmed and settled via Admin QR',
          data: { requestId: parentReq._id }
        });
      }

      // Every worker of the request must be ready to be paid this way before any of them is settled
      const assignments = await IndWorkerAssignment.find({
        parentRequestId: parentReq._id,
        assignmentStatus: { $ne: 'CANCELLED' }
      });
      const unsettled = assignments.filter(asg => asg.settlementStatus !== 'SETTLED');
      if (unsettled.length === 0) {
        return res.status(400).json({ success: false, message: 'There is nothing left to pay on this request.' });
      }
      let totalPayable = 0;
      for (const asg of unsettled) {
        const due = await assignmentQrDue(asg);
        if (!due.ok) return res.status(due.status).json({ success: false, message: due.message });
        if (asg.visitOtpStatus !== 'VERIFIED' && !(asg.workedDays > 0)) {
          return res.status(409).json({ success: false, message: 'A QR payment can only be confirmed after every worker has started the work.' });
        }
        totalPayable += due.payable;
      }
      totalPayable = Math.round(totalPayable * 100) / 100;
      if (expectedAmount != null && !sameMoney(totalPayable, expectedAmount)) {
        return res.status(409).json({ success: false, review: true, message: `The amount owed changed to ₹${totalPayable} after the QR (₹${expectedAmount}) was made.` });
      }

      // Settle each worker (idempotent: if one fails, confirming again carries on with the rest)
      const settlementSvc = require('../../services/workerSettlementService');
      for (const asg of unsettled) {
        // the request-level total was checked above; each worker's own amount is checked against what they are owed
        const result = await settleAssignmentByQr(asg, { utr: cleanUtr, adminUpiId, paymentId });
        if (!result.ok) {
          return res.status(result.status).json({ success: false, message: `${result.message} Confirm again to continue with the remaining workers.` });
        }

        emitSafe(`worker_${asg.workerId}`, 'qr_payment_success', {
          requestId: parentReq._id,
          assignmentId: asg._id,
          workerId: asg.workerId,
          grossAmount: result.grossAmount,
          netEarning: result.netEarning,
          credited: result.credited,
          paymentMethod: 'qr_online'
        });

        await createNotification({
          recipientType: 'worker',
          recipientId: asg.workerId,
          type: 'payment_success',
          title: '💰 Wallet Credited via Admin QR!',
          message: `₹${result.credited} has been added to your AgroYilt wallet for completing this job. (Farmer paid via Admin QR).`,
          relatedId: parentReq._id,
          relatedType: 'WorkerBookingRequest',
          priority: 'high'
        });
      }

      // The request is paid; its status moves to completed only once every worker is settled (finishParent decides)
      await WorkerBookingRequest.updateOne({ _id: parentReq._id }, {
        $set: {
          paymentStatus: 'success', paymentMethod: 'qr_online', isCashBooking: false,
          qrPayment: {
            ...sessionFields(parentReq),
            refId: parentReq.qrPayment?.refId || `qr_${Date.now()}`, amount: totalPayable, adminUpiId,
            status: 'COMPLETED', utr: cleanUtr, razorpayPaymentId: paymentId || null, confirmedAt: new Date()
          }
        }
      });
      await settlementSvc.finishParent(parentReq._id);

      emitSafe(`user_${parentReq.farmerId}`, 'qr_payment_success', {
        requestId: parentReq._id,
        status: 'completed',
        amount: totalPayable
      });

      await createNotification({
        userId: parentReq.farmerId,
        type: 'payment_success',
        title: 'UPI Payment Confirmed!',
        message: `Your payment of ₹${totalPayable} via Admin QR has been successfully verified. Work completed!`,
        relatedId: parentReq._id,
        relatedType: 'WorkerBookingRequest',
        priority: 'high'
      });

      return res.status(200).json({
        success: true,
        message: 'Parent request QR payment confirmed & all worker assignments settled',
        data: { requestId: parentReq._id, amount: totalPayable }
      });
    }

  return res.status(404).json({ success: false, message: 'Nothing to settle for this payment.' });
};

/**
 * A payment Razorpay confirmed for a QR: find what it was for, check it, apply it. Used by the webhook and by the
 * "check payment" button, so both do exactly the same thing.
 * @param {object} docs  { assignment | booking | parentReq } the QR was made for
 * @param {object} payment  Razorpay payment entity ({ id, amount (paise), status, ... })
 */
const applyVerifiedQrPayment = async (docs, payment, { confirmedBy = 'razorpay' } = {}) => {
  const target = docs.assignment || docs.booking || docs.parentReq;
  const session = target?.qrPayment;
  if (!target || !session?.razorpayQrId) {
    return { status: 409, body: { success: false, message: 'No payment QR was generated for this.' } };
  }
  if (session.status === 'COMPLETED') {
    return { status: 200, body: { success: true, message: 'Payment already confirmed and settled', data: { id: target._id, settled: true } } };
  }
  if (payment.status !== 'captured') {
    return { status: 409, body: { success: false, pending: true, message: 'Payment is being processed. Please wait a moment.' } };
  }
  if (!sameMoney(Number(payment.amount) / 100, session.amount)) {
    target.qrPayment = { ...sessionFields(target), status: 'REVIEW', razorpayPaymentId: payment.id, reviewReason: `Paid ₹${Number(payment.amount) / 100} but the QR was for ₹${session.amount}` };
    await target.save();
    console.error(`[QR REVIEW] payment ${payment.id} amount ${payment.amount} paise does not match QR amount ${session.amount} for ${target._id}`);
    return { status: 409, body: { success: false, review: true, message: 'The amount paid does not match the QR. Support will review this payment.' } };
  }
  // one Razorpay payment settles one thing, once
  const usedElsewhere = await Promise.all([
    Booking.exists({ 'qrPayment.razorpayPaymentId': payment.id, _id: { $ne: target._id } }),
    // (a request-level QR also stamps its payment on each worker's assignment: those are the same payment, not another use)
    IndWorkerAssignment.exists({ 'qrPayment.razorpayPaymentId': payment.id, _id: { $ne: target._id }, parentRequestId: { $ne: target._id } }),
    WorkerBookingRequest.exists({ 'qrPayment.razorpayPaymentId': payment.id, _id: { $ne: target._id } })
  ]);
  if (usedElsewhere.some(Boolean)) {
    return { status: 409, body: { success: false, message: 'This payment has already been applied to something else.' } };
  }

  const out = await runQrSettlement(docs, {
    utr: String(payment.acquirer_data?.rrn || payment.id).toUpperCase(),
    paymentId: payment.id,
    expectedAmount: session.amount,
    confirmedBy
  });
  if (out.body?.review) {
    target.qrPayment = { ...sessionFields(target), status: 'REVIEW', razorpayPaymentId: payment.id, reviewReason: out.body.message };
    await target.save();
    console.error(`[QR REVIEW] payment ${payment.id} for ${target._id}: ${out.body.message}`);
  }
  return out;
};

/** Finds what a Razorpay QR was made for. */
const findQrTarget = async ({ qrCodeId, refId }) => {
  const filter = qrCodeId ? { 'qrPayment.razorpayQrId': qrCodeId } : refId ? { 'qrPayment.refId': refId } : null;
  if (!filter) return null;
  const assignment = await IndWorkerAssignment.findOne(filter);
  if (assignment) return { assignment };
  const booking = await Booking.findOne(filter);
  if (booking) return { booking };
  const parentReq = await WorkerBookingRequest.findOne(filter);
  if (parentReq) return { parentReq };
  return null;
};

/**
 * Razorpay webhook entry point for QR payments (`qr_code.credited`, or `payment.captured` for a QR payment).
 * Safe to receive more than once. @returns {Promise<{ handled: boolean, status?: number, note: string }>}
 */
exports.handleRazorpayQrPayment = async ({ qrCodeId, refId, payment }) => {
  if (!(qrCodeId || refId) || !payment?.id) return { handled: false, note: 'missing QR id or payment' };
  const docs = await findQrTarget({ qrCodeId, refId });
  if (!docs) return { handled: false, note: 'no booking found for this QR' };
  const out = await applyVerifiedQrPayment(docs, payment);
  return { handled: true, status: out.status, note: out.body?.message || '' };
};

/**
 * POST /api/bookings/payment/confirm-admin-qr (and /api/bookings/cash/:id/confirm-admin-qr)
 * "Check payment": asks Razorpay whether this QR has been paid and, if so, settles exactly as the webhook would.
 * Nobody types a reference: the payment is confirmed by Razorpay, never by the person collecting.
 */
exports.confirmAdminQrPayment = async (req, res) => {
  try {
    const id = req.params.id || req.body.id || req.body.bookingId;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Target ID is required' });
    }

    let assignment = await IndWorkerAssignment.findById(id);
    let booking = null;
    let parentReq = null;
    if (!assignment) {
      booking = await Booking.findById(id);
      if (!booking) parentReq = await WorkerBookingRequest.findById(id);
    }
    if (!assignment && !booking && !parentReq) {
      return res.status(404).json({ success: false, message: 'Booking or Assignment not found' });
    }

    const rel = qrCallerRelation(req, { booking, assignment, parentReq });
    if (rel !== 'provider' && rel !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the service provider (or an admin) can check a QR payment.' });
    }

    const target = assignment || booking || parentReq;
    const session = target.qrPayment;
    if (!session?.razorpayQrId) {
      return res.status(409).json({ success: false, message: 'Show the payment QR first.' });
    }
    if (session.status === 'COMPLETED') {
      return res.status(200).json({ success: true, message: 'Payment already confirmed and settled', data: { id: target._id, settled: true } });
    }

    const fetched = await require('../../services/razorpayService').fetchQrPayments(session.razorpayQrId);
    if (!fetched.success) {
      return res.status(502).json({ success: false, message: 'Could not check the payment right now. Please try again in a moment.' });
    }
    const paid = (fetched.payments || []).find(p => p.status === 'captured' && sameMoney(Number(p.amount) / 100, session.amount));
    if (!paid) {
      return res.status(409).json({ success: false, pending: true, message: 'Payment not received yet. It can take a minute after the farmer pays.' });
    }

    const out = await applyVerifiedQrPayment({ assignment, booking, parentReq }, paid, { confirmedBy: String(req.user?._id || req.user?.id || 'user') });
    return res.status(out.status).json(out.body);
  } catch (error) {
    console.error('[confirmAdminQrPayment]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/bookings/payment/:id/qr-status (and /api/bookings/cash/:id/qr-status)
 * Checks the live payment status of an Admin QR transaction (polled by frontend).
 */
exports.getAdminQrStatus = async (req, res) => {
  try {
    const { id } = req.params;

    let assignment = await IndWorkerAssignment.findById(id).select('settlementStatus completionStatus paymentMethod isCashBooking qrPayment grossAmount farmerId workerId');
    if (assignment) {
      if (!qrCallerRelation(req, { assignment })) {
        return res.status(403).json({ success: false, message: 'Not authorized for this booking.' });
      }
      const isPaid = assignment.settlementStatus === 'SETTLED' || assignment.qrPayment?.status === 'COMPLETED';
      return res.status(200).json({
        success: true,
        data: {
          id: assignment._id,
          type: 'assignment',
          isPaid,
          status: assignment.settlementStatus,
          paymentMethod: assignment.paymentMethod,
          amount: assignment.qrPayment?.amount ?? assignment.grossAmount,
          qrPayment: assignment.qrPayment || null
        }
      });
    }

    let booking = await Booking.findById(id).select('paymentStatus paymentMethod cashCollected status finalAmount qrPayment userId vendorId workerId');
    if (booking) {
      if (!qrCallerRelation(req, { booking })) {
        return res.status(403).json({ success: false, message: 'Not authorized for this booking.' });
      }
      const isPaid = booking.paymentStatus === PAYMENT_STATUS.SUCCESS || booking.qrPayment?.status === 'COMPLETED';
      return res.status(200).json({
        success: true,
        data: {
          id: booking._id,
          type: 'booking',
          isPaid,
          status: booking.paymentStatus,
          paymentMethod: booking.paymentMethod,
          amount: booking.finalAmount,
          qrPayment: booking.qrPayment || null
        }
      });
    }

    let parentReq = await WorkerBookingRequest.findById(id).select('paymentStatus paymentMethod status qrPayment financialSnapshot farmerId selectedWorkerIds');
    if (parentReq) {
      if (!qrCallerRelation(req, { parentReq })) {
        return res.status(403).json({ success: false, message: 'Not authorized for this booking.' });
      }
      const isPaid = parentReq.paymentStatus === 'success' || parentReq.qrPayment?.status === 'COMPLETED';
      return res.status(200).json({
        success: true,
        data: {
          id: parentReq._id,
          type: 'worker_request',
          isPaid,
          status: parentReq.paymentStatus,
          paymentMethod: parentReq.paymentMethod,
          amount: parentReq.qrPayment?.amount ?? parentReq.financialSnapshot?.totalPayable ?? 0,
          qrPayment: parentReq.qrPayment || null
        }
      });
    }

    return res.status(404).json({ success: false, message: 'Target not found' });
  } catch (error) {
    console.error('[getAdminQrStatus]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

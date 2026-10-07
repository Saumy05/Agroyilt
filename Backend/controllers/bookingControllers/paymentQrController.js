'use strict';

const QRCode = require('qrcode');
const Booking = require('../../models/Booking');
const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
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

// UPI UTR / bank reference numbers are 12-22 alphanumerics
const UTR_PATTERN = /^[A-Za-z0-9]{10,24}$/;
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

      // Calculate amount
      if (amount !== undefined && Number(amount) > 0) {
        payableAmount = Number(amount);
      } else {
        const workedDays = assignment.workedDays || 1;
        const rate = assignment.agreedRate || 0;
        payableAmount = assignment.grossAmount || (rate * workedDays) || 0;
      }

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

      if (amount !== undefined && Number(amount) > 0) {
        payableAmount = Number(amount);
      } else {
        payableAmount = parentReq.financialSnapshot?.totalPayable || 0;
      }
    }

    if (payableAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payable amount for QR generation' });
    }

    // Get Admin UPI details
    const { adminUpiId, merchantName } = await getAdminUpiConfig();

    // Unique transaction reference
    const cleanId = (targetDoc._id || id).toString().slice(-8).toUpperCase();
    const refId = `AGY_QR_${cleanId}_${Date.now()}`;
    const transactionNote = `AgroYilt Service Bill ${referenceNumber}`;

    // NPCI UPI Deep Link format
    const upiUri = `upi://pay?pa=${encodeURIComponent(adminUpiId)}&pn=${encodeURIComponent(merchantName)}&am=${payableAmount.toFixed(2)}&tr=${encodeURIComponent(refId)}&tn=${encodeURIComponent(transactionNote)}&cu=INR`;

    // Generate Base64 Data URL
    const qrCodeDataUrl = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 360,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes expiry

    // Save pending QR session on document
    const qrSession = {
      refId,
      amount: payableAmount,
      adminUpiId,
      status: 'PENDING',
      generatedAt: new Date(),
      expiresAt
    };

    targetDoc.qrPayment = qrSession;
    await targetDoc.save();

    // Also persist in legacy booking if linked
    if (booking && targetDoc !== booking) {
      booking.qrPayment = qrSession;
      await booking.save();
    }

    // Broadcast socket event to farmer & booking rooms
    if (farmerId) {
      emitSafe(`user_${farmerId}`, 'admin_qr_generated', {
        id: targetDoc._id,
        amount: payableAmount,
        refId,
        upiUri,
        adminUpiId,
        merchantName
      });
    }

    emitSafe(`booking_${targetDoc._id}`, 'admin_qr_generated', {
      id: targetDoc._id,
      amount: payableAmount,
      refId,
      upiUri
    });

    return res.status(200).json({
      success: true,
      message: 'Admin UPI QR generated successfully',
      data: {
        id: targetDoc._id,
        type: docType,
        amount: payableAmount,
        adminUpiId,
        merchantName,
        refId,
        upiUri,
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

/**
 * POST /api/bookings/payment/confirm-admin-qr (and /api/bookings/cash/:id/confirm-admin-qr)
 * Confirms payment received into AgroYilt Admin UPI Account.
 * Performs automatic financial split:
 *   - Admin retains 10% platform commission.
 *   - Worker wallet receives 90% net earnings.
 *   - Worker owes ZERO cash dues.
 *   - Sets paymentMethod = 'qr_online' & settles booking/assignment.
 */
exports.confirmAdminQrPayment = async (req, res) => {
  try {
    const id = req.params.id || req.body.id || req.body.bookingId;
    const { utr } = req.body;
    const amount = undefined; // amounts always come from the bill, never from the client
    const confirmedByUserId = req.user?._id || req.user?.id;
    const userRole = (req.user?.role || '').toLowerCase();

    if (!id) {
      return res.status(400).json({ success: false, message: 'Target ID is required' });
    }

    // Resolve target
    let assignment = await IndWorkerAssignment.findById(id);
    let booking = null;
    let parentReq = null;

    if (!assignment) {
      booking = await Booking.findById(id);
      if (!booking) {
        parentReq = await WorkerBookingRequest.findById(id);
      }
    }

    if (!assignment && !booking && !parentReq) {
      return res.status(404).json({ success: false, message: 'Booking or Assignment not found' });
    }

    const rel = qrCallerRelation(req, { booking, assignment, parentReq });
    if (rel !== 'provider' && rel !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the service provider (or an admin) can confirm a QR payment.' });
    }
    if (!utr || !UTR_PATTERN.test(String(utr).trim())) {
      return res.status(400).json({ success: false, message: 'A valid UTR / bank reference number is required to confirm a QR payment.' });
    }
    const cleanUtr = String(utr).trim().toUpperCase();
    const utrUsed = await Promise.all([
      Booking.exists({ 'qrPayment.utr': cleanUtr, ...(booking ? { _id: { $ne: booking._id } } : {}) }),
      IndWorkerAssignment.exists({ 'qrPayment.utr': cleanUtr, ...(assignment ? { _id: { $ne: assignment._id } } : {}) })
    ]);
    if (utrUsed.some(Boolean)) {
      return res.status(409).json({ success: false, message: 'This UTR has already been used for another payment.' });
    }

    const { adminUpiId, settings } = await getAdminUpiConfig();

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

      const grossAmount = (amount !== undefined && Number(amount) > 0)
        ? Number(amount)
        : (assignment.grossAmount || (assignment.agreedRate * (assignment.workedDays || 1)) || 0);
      if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
        return res.status(400).json({ success: false, message: 'A valid payment amount is required.' });
      }

      const commissionRate = assignment.commissionRate ?? settings?.workerCommissionPercentage ?? 10;
      const commissionAmount = Math.round((grossAmount * commissionRate) / 100);
      const workerNetEarning = grossAmount - commissionAmount;

      const workerId = assignment.workerId;
      const farmerId = assignment.farmerId;
      const idempotencyKey = `qr_settle_assign_${assignment._id}`;

      // The provider cannot be paid for a job that never started (their UTR is not verified against the bank here).
      if (assignment.visitOtpStatus !== 'VERIFIED' && !(assignment.workedDays > 0)) {
        return res.status(409).json({ success: false, message: 'A QR payment can only be confirmed after the work has started.' });
      }

      // 1. Atomically claim the settlement: exactly one confirmation can ever win for this assignment.
      const claimed = await IndWorkerAssignment.findOneAndUpdate(
        { _id: assignment._id, assignmentStatus: 'CONFIRMED', settlementStatus: { $in: ['PENDING', 'FAILED'] } },
        {
          $set: {
            completionStatus: 'OTP_VERIFIED', workStatus: 'SUBMITTED', paymentMethod: 'qr_online', isCashBooking: false,
            grossAmount, commissionAmount, netEarning: workerNetEarning, workCompletedAt: new Date(), cashPlatformFee: 0,
            qrPayment: {
              refId: assignment.qrPayment?.refId || idempotencyKey, amount: grossAmount, adminUpiId, status: 'COMPLETED',
              utr: cleanUtr, confirmedAt: new Date()
            }
          }
        },
        { new: true }
      );
      if (!claimed) {
        return res.status(409).json({ success: false, message: 'This assignment is already settled or being settled.' });
      }

      // 2. Settle through the shared, idempotent ledger path (credit exactly once, retry-safe).
      const settlementSvc = require('../../services/workerSettlementService');
      const outcome = await settlementSvc.settleAssignment(assignment._id, { useStoredAmounts: true });
      if (outcome.error) {
        return res.status(500).json({ success: false, message: 'Payment was recorded but settlement failed; it will be retried automatically.' });
      }
      if (assignment.legacyBookingId) {
        await Booking.findByIdAndUpdate(assignment.legacyBookingId, {
          paymentStatus: PAYMENT_STATUS.SUCCESS, paymentMethod: 'qr_online', cashCollected: false, finalAmount: grossAmount
        });
      }
      await settlementSvc.finishParent(assignment.parentRequestId);

      // 7. Socket Events
      const eventData = {
        requestId: assignment.parentRequestId,
        assignmentId: assignment._id,
        workerId: assignment.workerId,
        paymentMethod: 'qr_online',
        grossAmount,
        netEarning: workerNetEarning,
        settlementStatus: 'SETTLED',
        status: 'completed',
        utr: utr || null,
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
        message: `Your payment of ₹${grossAmount} via Admin QR has been successfully verified. Work marked complete.`,
        relatedId: assignment._id,
        relatedType: 'IndWorkerAssignment',
        priority: 'high'
      });

      await createNotification({
        recipientType: 'worker',
        recipientId: workerId,
        type: 'payment_success',
        title: '💰 Wallet Credited via Admin QR!',
        message: `₹${workerNetEarning} has been added to your AgroYilt wallet for completing this job. (Farmer paid via Admin QR).`,
        relatedId: assignment.parentRequestId || assignment._id,
        relatedType: 'IndWorkerAssignment',
        priority: 'high'
      });

      return res.status(200).json({
        success: true,
        message: `Admin QR payment verified! ₹${workerNetEarning} credited to worker wallet.`,
        data: {
          assignmentId: assignment._id,
          grossAmount,
          netEarning: workerNetEarning,
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
            qrPayment: { ...(booking.qrPayment || {}), status: 'COMPLETED', utr: cleanUtr, confirmedAt: new Date(), confirmedBy: String(confirmedByUserId) }
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

      const totalPayable = parentReq.financialSnapshot?.totalPayable || 0;
      parentReq.paymentStatus = 'success';
      parentReq.paymentMethod = 'qr_online';
      parentReq.isCashBooking = false;
      parentReq.status = 'completed';
      parentReq.qrPayment = {
        refId: parentReq.qrPayment?.refId || `qr_${Date.now()}`,
        amount: totalPayable,
        adminUpiId,
        status: 'COMPLETED',
        utr: cleanUtr,
        confirmedAt: new Date()
      };
      await parentReq.save();

      // Settle all active child assignments for this parent request
      const settlementSvc = require('../../services/workerSettlementService');
      const assignments = await IndWorkerAssignment.find({
        parentRequestId: parentReq._id,
        assignmentStatus: { $ne: 'CANCELLED' }
      });

      for (const asg of assignments) {
        if (asg.settlementStatus !== 'SETTLED') {
          const workedDays = asg.workedDays || 1;
          const grossAmount = asg.grossAmount || (asg.agreedRate * workedDays) || 0;
          const commRate = asg.commissionRate ?? settings?.workerCommissionPercentage ?? 10;
          const commAmount = Math.round((grossAmount * commRate) / 100);
          const workerNetEarning = grossAmount - commAmount;

          await IndWorkerAssignment.updateOne(
            { _id: asg._id },
            {
              $set: {
                completionStatus: 'OTP_VERIFIED',
                workStatus: 'SUBMITTED',
                paymentMethod: 'qr_online',
                isCashBooking: false,
                grossAmount,
                commissionAmount: commAmount,
                netEarning: workerNetEarning,
                workCompletedAt: new Date(),
                cashPlatformFee: 0,
                qrPayment: {
                  refId: `qr_${asg._id}`,
                  amount: grossAmount,
                  adminUpiId,
                  status: 'COMPLETED',
                  utr: cleanUtr,
                  confirmedAt: new Date()
                }
              }
            }
          );
          await settlementSvc.settleAssignment(asg._id, { useStoredAmounts: true });

          emitSafe(`worker_${asg.workerId}`, 'qr_payment_success', {
            requestId: parentReq._id,
            assignmentId: asg._id,
            workerId: asg.workerId,
            grossAmount,
            netEarning: workerNetEarning,
            paymentMethod: 'qr_online'
          });

          await createNotification({
            recipientType: 'worker',
            recipientId: asg.workerId,
            type: 'payment_success',
            title: '💰 Wallet Credited via Admin QR!',
            message: `₹${workerNetEarning} has been added to your AgroYilt wallet for completing this job. (Farmer paid online).`,
            relatedId: parentReq._id,
            relatedType: 'WorkerBookingRequest',
            priority: 'high'
          });
        }
      }

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

    let assignment = await IndWorkerAssignment.findById(id).select('settlementStatus completionStatus paymentMethod isCashBooking qrPayment grossAmount');
    if (assignment) {
      const isPaid = assignment.settlementStatus === 'SETTLED' || assignment.qrPayment?.status === 'COMPLETED';
      return res.status(200).json({
        success: true,
        data: {
          id: assignment._id,
          type: 'assignment',
          isPaid,
          status: assignment.settlementStatus,
          paymentMethod: assignment.paymentMethod,
          amount: assignment.grossAmount,
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

    let parentReq = await WorkerBookingRequest.findById(id).select('paymentStatus paymentMethod status qrPayment financialSnapshot');
    if (parentReq) {
      const isPaid = parentReq.paymentStatus === 'success' || parentReq.qrPayment?.status === 'COMPLETED';
      return res.status(200).json({
        success: true,
        data: {
          id: parentReq._id,
          type: 'worker_request',
          isPaid,
          status: parentReq.paymentStatus,
          paymentMethod: parentReq.paymentMethod,
          amount: parentReq.financialSnapshot?.totalPayable || 0,
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

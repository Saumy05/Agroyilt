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
const { PAYMENT_STATUS } = require('../../utils/constants');
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
    const { amount, extraItems } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: 'Target ID is required' });
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
        payableAmount = booking.finalAmount || Number(booking.price) || 0;
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
      if (payableAmount) booking.finalAmount = payableAmount;
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
    const { utr, amount } = req.body;
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

    const { adminUpiId, settings } = await getAdminUpiConfig();

    // ─────────────────────────────────────────────────────────────────────────
    // FLOW A: INDIVIDUAL WORKER ASSIGNMENT
    // ─────────────────────────────────────────────────────────────────────────
    if (assignment) {
      if (assignment.settlementStatus === 'SETTLED' && assignment.paymentMethod === 'qr_online') {
        return res.status(200).json({
          success: true,
          message: 'Payment already confirmed and settled via Admin QR',
          data: { assignmentId: assignment._id, settled: true }
        });
      }

      const grossAmount = (amount !== undefined && Number(amount) > 0)
        ? Number(amount)
        : (assignment.grossAmount || (assignment.agreedRate * (assignment.workedDays || 1)) || 0);

      const commissionRate = assignment.commissionRate || settings?.workerCommissionPercentage || 10;
      const commissionAmount = Math.round((grossAmount * commissionRate) / 100);
      const workerNetEarning = grossAmount - commissionAmount;

      const workerId = assignment.workerId;
      const farmerId = assignment.farmerId;
      const idempotencyKey = `qr_settle_assign_${assignment._id}_${Date.now()}`;

      // 1. Credit Worker in Worker Model (Net Earnings)
      await Worker.findByIdAndUpdate(workerId, {
        $inc: { 'wallet.balance': workerNetEarning },
        status: 'ONLINE'
      });

      // 2. Ensure Wallet document exists & credit
      let workerWallet = await Wallet.findOne({ workerId, userModel: 'Worker' });
      if (!workerWallet) {
        workerWallet = await Wallet.findOne({ userId: workerId });
      }
      if (workerWallet) {
        workerWallet.balance = (workerWallet.balance || 0) + workerNetEarning;
        await workerWallet.save();
      } else {
        await Wallet.create({ userId: workerId, userModel: 'Worker', balance: workerNetEarning });
      }

      // 3. Create Transaction Records (Earnings Credit to Worker)
      await Transaction.create({
        workerId,
        userId: farmerId,
        bookingId: assignment.legacyBookingId || null,
        type: 'earnings_credit',
        amount: workerNetEarning,
        status: 'completed',
        paymentMethod: 'qr_online',
        description: `Admin UPI QR payment ₹${grossAmount} confirmed. Worker net earnings ₹${workerNetEarning} credited (10% platform commission ₹${commissionAmount} retained).`,
        referenceId: idempotencyKey,
        metadata: {
          type: 'admin_qr_settlement',
          grossAmount,
          commissionAmount,
          workerNetEarning,
          utr: utr || null,
          adminUpiId
        }
      });

      // 4. Update IndWorkerAssignment doc
      assignment.settlementStatus = 'SETTLED';
      assignment.completionStatus = 'OTP_VERIFIED';
      assignment.workStatus = 'SUBMITTED';
      assignment.paymentMethod = 'qr_online';
      assignment.isCashBooking = false;
      assignment.grossAmount = grossAmount;
      assignment.commissionAmount = commissionAmount;
      assignment.netEarning = workerNetEarning;
      assignment.settledAt = new Date();
      assignment.workCompletedAt = new Date();
      assignment.settlementTransactionId = idempotencyKey;
      assignment.qrPayment = {
        refId: assignment.qrPayment?.refId || idempotencyKey,
        amount: grossAmount,
        adminUpiId,
        status: 'COMPLETED',
        utr: utr || null,
        confirmedAt: new Date()
      };
      await assignment.save();

      // 5. If legacy Booking is linked, update it
      if (assignment.legacyBookingId) {
        await Booking.findByIdAndUpdate(assignment.legacyBookingId, {
          status: 'completed',
          paymentStatus: PAYMENT_STATUS.SUCCESS,
          paymentMethod: 'qr_online',
          cashCollected: false,
          finalAmount: grossAmount,
          workDoneAt: new Date(),
          completedAt: new Date()
        });
      }

      // 6. Check if all assignments for parent request are settled -> complete parent & refund unused escrow
      if (assignment.parentRequestId) {
        try {
          const allAssignments = await IndWorkerAssignment.find({
            parentRequestId: assignment.parentRequestId,
            assignmentStatus: { $ne: 'CANCELLED' }
          });
          const allSettled = allAssignments.length > 0 && allAssignments.every(a => a.settlementStatus === 'SETTLED');
          if (allSettled) {
            await WorkerBookingRequest.findByIdAndUpdate(assignment.parentRequestId, {
              status: 'completed',
              paymentStatus: 'success',
              paymentMethod: 'qr_online'
            });

            emitSafe(`booking_req:${assignment.parentRequestId}`, 'booking_completed', {
              requestId: assignment.parentRequestId,
              status: 'completed',
              serverTimestamp: new Date()
            });

            const { processDailyFarmerRefund } = require('../../services/workerFinancialService');
            await processDailyFarmerRefund(assignment.parentRequestId);
          }
        } catch (parentErr) {
          console.warn('[QR Settlement Parent Check]', parentErr.message);
        }
      }

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

      const collectionAmount = (amount !== undefined && Number(amount) > 0) ? Number(amount) : (booking.finalAmount || Number(booking.price) || 0);

      // Settle Vendor or Worker
      let vendorEarning = 0;
      let workerNetEarning = 0;
      const idempotencyKey = `qr_settle_bkg_${booking._id}_${Date.now()}`;

      if (booking.vendorId) {
        // Vendor settlement
        const VendorBill = require('../../models/VendorBill');
        let bill = await VendorBill.findOne({ bookingId: booking._id });

        if (!bill) {
          const serviceSplitPct = settings?.rentalPayoutPercentage ?? 90;
          const gstPct = settings?.rentalGstPercentage ?? 5;
          const baseAmount = Math.round(collectionAmount / (1 + gstPct / 100));
          const gstAmount = parseFloat((collectionAmount - baseAmount).toFixed(2));
          vendorEarning = parseFloat(((baseAmount * serviceSplitPct) / 100).toFixed(2));

          bill = await VendorBill.create({
            bookingId: booking._id,
            vendorId: booking.vendorId,
            services: [{
              name: booking.serviceName || 'Equipment Service',
              price: baseAmount,
              gstPercentage: gstPct,
              quantity: 1,
              gstAmount: gstAmount,
              total: collectionAmount,
              isOriginal: true
            }],
            originalServiceBase: baseAmount,
            originalGST: gstAmount,
            totalServiceBase: baseAmount,
            totalGST: gstAmount,
            grandTotal: collectionAmount,
            payoutConfig: { serviceSplitPercentage: serviceSplitPct, serviceGstPercentage: gstPct },
            vendorServiceEarning: vendorEarning,
            vendorTotalEarning: vendorEarning,
            companyRevenue: parseFloat((collectionAmount - vendorEarning).toFixed(2)),
            status: 'paid',
            paidAt: new Date()
          });
        } else {
          vendorEarning = bill.vendorTotalEarning;
          bill.status = 'paid';
          bill.paidAt = new Date();
          await bill.save();
        }

        // Credit Vendor Wallet Earnings (WITHOUT increasing dues because money went to company)
        await Vendor.findByIdAndUpdate(booking.vendorId, {
          $inc: { 'wallet.earnings': vendorEarning }
        });

        await Transaction.create({
          vendorId: booking.vendorId,
          userId: booking.userId,
          bookingId: booking._id,
          amount: vendorEarning,
          type: 'earnings_credit',
          paymentMethod: 'qr_online',
          description: `Admin UPI QR Payment of ₹${collectionAmount} received. Vendor earnings ₹${vendorEarning} credited.`,
          status: 'completed',
          metadata: { billId: bill._id.toString(), utr: utr || null }
        });

      } else if (booking.workerId) {
        // Direct Worker settlement
        const commissionRate = booking.commissionRate ?? settings?.workerCommissionPercentage ?? 10;
        const commissionAmount = Math.round((collectionAmount * commissionRate) / 100);
        workerNetEarning = collectionAmount - commissionAmount;

        await Worker.findByIdAndUpdate(booking.workerId, {
          $inc: { 'wallet.balance': workerNetEarning },
          status: 'ONLINE'
        });

        let workerWallet = await Wallet.findOne({ workerId: booking.workerId, userModel: 'Worker' }) || await Wallet.findOne({ userId: booking.workerId });
        if (workerWallet) {
          workerWallet.balance = (workerWallet.balance || 0) + workerNetEarning;
          await workerWallet.save();
        } else {
          await Wallet.create({ userId: booking.workerId, userModel: 'Worker', balance: workerNetEarning });
        }

        await Transaction.create({
          workerId: booking.workerId,
          userId: booking.userId,
          bookingId: booking._id,
          amount: workerNetEarning,
          type: 'earnings_credit',
          paymentMethod: 'qr_online',
          description: `Admin UPI QR payment ₹${collectionAmount} received. Worker net earnings ₹${workerNetEarning} credited to wallet.`,
          status: 'completed',
          metadata: { grossAmount: collectionAmount, commissionAmount, workerNetEarning, utr: utr || null }
        });
      }

      // Update Booking
      booking.finalAmount = collectionAmount;
      booking.userPayableAmount = collectionAmount;
      booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
      booking.paymentMethod = 'qr_online';
      booking.cashCollected = false; // Online QR payment, NOT physical cash
      booking.status = 'completed';
      booking.completedAt = new Date();
      booking.qrPayment = {
        refId: booking.qrPayment?.refId || idempotencyKey,
        amount: collectionAmount,
        adminUpiId,
        status: 'COMPLETED',
        utr: utr || null,
        confirmedAt: new Date()
      };
      await booking.save();

      // Socket update
      const updatePayload = {
        bookingId: booking._id,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMethod: 'qr_online',
        finalAmount: collectionAmount,
        message: 'Admin UPI QR payment verified and booking completed!'
      };

      emitSafe(`user_${booking.userId}`, 'booking_updated', updatePayload);
      emitSafe(`booking_${booking._id}`, 'booking_updated', updatePayload);
      if (booking.vendorId) emitSafe(`vendor_${booking.vendorId}`, 'booking_updated', updatePayload);
      if (booking.workerId) emitSafe(`worker_${booking.workerId}`, 'booking_updated', updatePayload);

      // Notification
      await createNotification({
        userId: booking.userId,
        type: 'payment_success',
        title: 'Payment Received (Admin UPI QR)',
        message: `Your payment of ₹${collectionAmount} via UPI QR has been verified. Job Completed. Thanks!`,
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high'
      });

      return res.status(200).json({
        success: true,
        message: 'Admin QR payment verified successfully and credited to wallet',
        data: {
          bookingId: booking._id,
          amount: collectionAmount,
          vendorEarning,
          workerNetEarning,
          paymentMethod: 'qr_online'
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FLOW C: PARENT WORKER REQUEST
    // ─────────────────────────────────────────────────────────────────────────
    if (parentReq) {
      parentReq.paymentStatus = 'success';
      parentReq.paymentMethod = 'qr_online';
      parentReq.status = 'completed';
      parentReq.qrPayment = {
        refId: parentReq.qrPayment?.refId || `qr_${Date.now()}`,
        amount: parentReq.financialSnapshot?.totalPayable || 0,
        adminUpiId,
        status: 'COMPLETED',
        utr: utr || null,
        confirmedAt: new Date()
      };
      await parentReq.save();

      emitSafe(`user_${parentReq.farmerId}`, 'qr_payment_success', {
        requestId: parentReq._id,
        status: 'completed'
      });

      return res.status(200).json({
        success: true,
        message: 'Parent request QR payment confirmed',
        data: { requestId: parentReq._id }
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

    let booking = await Booking.findById(id).select('paymentStatus paymentMethod cashCollected status finalAmount qrPayment');
    if (booking) {
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

const Booking = require('../../models/Booking');
const Transaction = require('../../models/Transaction');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');
const { recordBookingEarning } = require('../../services/earningTrackerService');
const {
  generateDistinctOtp,
  verifyBookingOtp,
  settleVendorCash,
  PAID_STATUSES
} = require('../../services/bookingSettlementService');

const WORK_DONE_STATES = [BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.AWAITING_PAYMENT];
// Independent-worker jobs can be settled slightly earlier in their lifecycle
const WORKER_COLLECTABLE = [
  BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.AWAITING_PAYMENT, BOOKING_STATUS.IN_PROGRESS,
  BOOKING_STATUS.VISITED, BOOKING_STATUS.ACCEPTED
];

/** Resolves a booking id, or an independent-worker assignment id that points at a booking. */
const resolveBooking = async (id, selectExtra = '') => {
  if (!id || !/^[0-9a-fA-F]{24}$/.test(String(id))) return { booking: null, assignment: null };
  let booking = await Booking.findById(id).select(selectExtra);
  let assignment = null;
  if (!booking) {
    const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
    assignment = await IndWorkerAssignment.findById(id);
    if (assignment && assignment.legacyBookingId) {
      booking = await Booking.findById(assignment.legacyBookingId).select(selectExtra);
    }
  }
  return { booking, assignment };
};

/**
 * Who is this caller relative to the booking?
 * Returns 'vendor' | 'worker' | 'farmer' | 'admin' | null. Role AND id must match.
 */
const callerRelation = (req, booking, assignment = null) => {
  const role = String(req.userRole || req.user?.role || '').toUpperCase();
  const uid = String(req.user?._id || req.user?.id || req.userId || '');
  if (!uid) return null;
  if (role === 'VENDOR' && booking.vendorId && String(booking.vendorId) === uid) return 'vendor';
  if (role === 'WORKER') {
    if (booking.workerId && String(booking.workerId) === uid) return 'worker';
    if (assignment?.workerId && String(assignment.workerId) === uid) return 'worker';
  }
  if (role === 'USER' && String(booking.userId) === uid) return 'farmer';
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return 'admin';
  return null;
};

const isAlreadyPaid = (booking) =>
  booking.cashCollected === true || PAID_STATUSES.includes(booking.paymentStatus) ||
  booking.paymentStatus === PAYMENT_STATUS.REFUNDED;

/**
 * Initiate Cash Collection (vendor / assigned worker only)
 * Finalises the bill and issues the farmer's payment OTP. Amounts come from the bill, never from the client
 * (independent-worker jobs may set the final amount inside the agreed min/max range).
 */
exports.initiateCashCollection = async (req, res) => {
  try {
    const { booking, assignment } = await resolveBooking(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const who = callerRelation(req, booking, assignment);
    if (who !== 'vendor' && who !== 'worker') {
      return res.status(403).json({ success: false, message: 'Only the assigned service provider can start cash collection.' });
    }

    if (isAlreadyPaid(booking)) {
      return res.status(400).json({ success: false, message: 'Payment has already been completed for this booking.' });
    }

    const isIndependentWorker = !booking.vendorId && !!booking.workerId;
    const allowedMethods = ['cash', 'pay_at_home', 'plan_benefit', 'online', 'razorpay', 'wallet', null, undefined];
    if (!isIndependentWorker && !allowedMethods.includes(booking.paymentMethod)) {
      return res.status(400).json({ success: false, message: 'This booking is not eligible for cash collection' });
    }
    const okStatuses = isIndependentWorker ? WORKER_COLLECTABLE : WORK_DONE_STATES;
    if (!okStatuses.includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot collect payment while the booking is "${booking.status}"` });
    }

    if (isIndependentWorker) {
      const { totalAmount, extraItems } = req.body;
      if (totalAmount !== undefined) {
        const amt = Number(totalAmount);
        const min = booking.minRate || 0;
        const max = booking.maxRate || booking.minRate || 0;
        if (!Number.isFinite(amt) || amt <= 0 || (max > 0 && (amt < min || amt > max))) {
          return res.status(400).json({ success: false, message: `Amount must be between ₹${min} and ₹${max}` });
        }
        booking.finalAmount = amt;
        booking.userPayableAmount = amt;
      }
      if (Array.isArray(extraItems) && extraItems.length > 0) {
        booking.workDoneDetails = {
          ...(booking.workDoneDetails || {}),
          items: extraItems.slice(0, 50).map(item => ({
            title: String(item.name || item.title || '').slice(0, 100),
            qty: Math.max(1, Number(item.qty) || Number(item.quantity) || 1),
            price: Math.max(0, Number(item.price) || 0)
          }))
        };
        booking.markModified('workDoneDetails');
      }
    }

    // Payment OTP is its own secret: never the start/end OTP. Re-use an existing one so retries are stable.
    const existing = await Booking.findById(booking._id).select('+paymentOtp');
    const otp = existing.paymentOtp || existing.customerConfirmationOTP ||
      generateDistinctOtp(booking.driver_start_otp, booking.driver_end_otp);
    booking.customerConfirmationOTP = otp;
    booking.paymentOtp = otp;
    await booking.save();

    const io = req.app?.get ? req.app.get('io') : null;
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        finalAmount: booking.finalAmount,
        balanceDue: booking.balanceDue,
        customerConfirmationOTP: otp,
        paymentOtp: otp,
        workDoneDetails: booking.workDoneDetails
      });
    }

    const { createNotification } = require('../notificationControllers/notificationController');
    const due = booking.balanceDue > 0 ? booking.balanceDue : booking.finalAmount;
    await createNotification({
      userId: booking.userId,
      type: 'work_done',
      title: 'Payment Request & Bill Ready',
      message: `Bill: ₹${due}. OTP: ${otp}. Pay the cash first, then share this OTP to complete payment.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: { type: 'work_done', bookingId: booking._id.toString(), paymentOtp: otp, link: `/user/booking/${booking._id}` }
    });

    res.status(200).json({ success: true, message: 'Bill finalized', totalAmount: booking.finalAmount, amountDue: due });
  } catch (error) {
    console.error('Initiate cash collection error:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate cash collection' });
  }
};

/**
 * Confirm Cash Collection (vendor / assigned worker only, with the farmer's PAYMENT OTP).
 * Vendor bookings settle through the shared idempotent ledger; amounts always come from the bill.
 */
exports.confirmCashCollection = async (req, res) => {
  try {
    const id = req.params.id || req.body.bookingId || req.body.id;
    const { otp } = req.body;

    const { booking, assignment } = await resolveBooking(id, '+paymentOtp');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const who = callerRelation(req, booking, assignment);
    if (who !== 'vendor' && who !== 'worker') {
      return res.status(403).json({ success: false, message: 'Only the assigned service provider can confirm cash collection.' });
    }
    if (isAlreadyPaid(booking)) {
      return res.status(409).json({ success: false, message: 'Payment has already been collected for this booking.' });
    }

    const isIndependentWorker = !booking.vendorId && !!booking.workerId;
    const okStatuses = isIndependentWorker ? WORKER_COLLECTABLE : WORK_DONE_STATES;
    if (!okStatuses.includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot collect payment while the booking is "${booking.status}"` });
    }

    const isPlanBenefitNoExtras = booking.paymentMethod === 'plan_benefit' && (!booking.userPayableAmount || booking.userPayableAmount === 0);
    if (!isPlanBenefitNoExtras) {
      const expected = booking.paymentOtp || booking.customerConfirmationOTP;
      if (!expected) {
        return res.status(400).json({ success: false, message: 'No Payment Confirmation OTP found for this booking. Please generate OTP first.' });
      }
      const check = await verifyBookingOtp(booking._id, 'payment', expected, otp);
      if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });
    }

    const collectorId = req.user?._id || req.user?.id;
    let grandTotal = booking.finalAmount;
    let finalDues = null;

    if (booking.vendorId) {
      let result;
      try {
        result = await settleVendorCash(booking._id, { collectorRole: who, collectorId });
      } catch (e) {
        if (e.status) return res.status(e.status).json({ success: false, message: e.message });
        throw e;
      }
      grandTotal = result.grandTotal;
      finalDues = result.dues;
    } else {
      // Independent worker: atomic claim so a double submit cannot settle twice
      const claim = await Booking.updateOne(
        { _id: booking._id, cashCollected: { $ne: true } },
        { $set: { cashCollected: true } }
      );
      if (claim.modifiedCount === 0) {
        return res.status(409).json({ success: false, message: 'Payment has already been collected for this booking.' });
      }
      try {
        grandTotal = booking.finalAmount;
        booking.cashCollected = true;
        booking.cashCollectedAt = new Date();
        booking.cashCollectedBy = 'worker';
        booking.cashCollectorId = collectorId;
        booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
        booking.status = BOOKING_STATUS.COMPLETED;
        booking.completedAt = new Date();
        booking.paymentOtp = undefined;
        await booking.save();

    {
          // Independent Worker Cash Collection Logic
          const Worker = require('../../models/Worker');
          const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
          const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
          const workerId = booking.workerId;
          
          const commissionRate = booking.commissionRate ?? 10;
          const commissionAmount = booking.commissionAmount ?? Math.round((grandTotal * commissionRate) / 100);
          const workerNetEarning = grandTotal - commissionAmount;
    
          const workerDoc = await Worker.findById(workerId);
          if (workerDoc) {
            // Worker collected grandTotal in physical cash in hand.
            // Platform commission is deducted from wallet balance if positive, or added to dues.
            let walletBalance = workerDoc.wallet?.balance || 0;
            if (walletBalance >= commissionAmount) {
              workerDoc.wallet.balance = walletBalance - commissionAmount;
            } else {
              const remainingDue = commissionAmount - walletBalance;
              workerDoc.wallet.balance = 0;
              workerDoc.outstandingDues = (workerDoc.outstandingDues || 0) + remainingDue;
            }
            await workerDoc.save();
          }
    
          await Transaction.create({
            workerId: workerId,
            bookingId: booking._id,
            amount: grandTotal,
            type: 'cash_collected',
            paymentMethod: 'cash',
            status: 'completed',
            description: `Cash ₹${grandTotal} collected directly from farmer for booking #${booking.bookingNumber || booking._id.toString().slice(-6)}. Platform commission ₹${commissionAmount} applied.`,
            metadata: {
              type: 'cash_collection',
              bookingNumber: booking.bookingNumber,
              grandTotal,
              commissionAmount,
              workerNetEarning
            }
          });
    
          // Atomically settle linked IndWorkerAssignment
          try {
            const assignment = await IndWorkerAssignment.findOne({
              $or: [{ legacyBookingId: booking._id }, { parentRequestId: booking.workerRequestId, workerId }]
            });
            if (assignment) {
              assignment.settlementStatus = 'SETTLED';
              assignment.completionStatus = 'OTP_VERIFIED';
              assignment.workStatus = 'COMPLETED';
              assignment.settledAt = new Date();
              assignment.workCompletedAt = new Date();
              await assignment.save();
    
              if (assignment.parentRequestId) {
                const allAssignments = await IndWorkerAssignment.find({
                  parentRequestId: assignment.parentRequestId,
                  assignmentStatus: { $ne: 'CANCELLED' }
                });
                const allSettled = allAssignments.length > 0 && allAssignments.every(a => a.settlementStatus === 'SETTLED');
                if (allSettled) {
                  await WorkerBookingRequest.findByIdAndUpdate(assignment.parentRequestId, { status: 'completed' });
                }
              }
            }
          } catch (assignErr) {
            console.warn('[Cash Collection Assignment Settle]', assignErr.message);
          }
        }

        recordBookingEarning({
          date: new Date(),
          totalRevenue: grandTotal,
          platformCommission: Math.round(grandTotal * ((booking.commissionRate ?? 10) / 100)),
          vendorEarnings: grandTotal - Math.round(grandTotal * ((booking.commissionRate ?? 10) / 100)),
          totalGST: 0,
          totalTDS: 0
        });
      } catch (e) {
        await Booking.updateOne({ _id: booking._id }, { $set: { cashCollected: false } });
        throw e;
      }
    }

    const io = req.app?.get ? req.app.get('io') : null;
    if (io) {
      const updatePayload = {
        bookingId: booking._id,
        status: BOOKING_STATUS.COMPLETED,
        paymentStatus: booking.vendorId ? PAYMENT_STATUS.COLLECTED_BY_VENDOR : PAYMENT_STATUS.SUCCESS,
        cashCollected: true,
        finalAmount: grandTotal,
        message: 'Cash payment confirmed and booking completed!'
      };
      io.to(`user_${booking.userId}`).emit('booking_updated', updatePayload);
      io.to(`booking_${booking._id}`).emit('booking_updated', updatePayload);
      if (booking.vendorId) io.to(`vendor_${booking.vendorId}`).emit('booking_updated', updatePayload);
    }

    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'payment_received',
      title: 'Payment Received (Cash)',
      message: `Payment of ₹${grandTotal} received in cash. Job Completed. Thanks!`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high'
    });

    res.status(200).json({
      success: true,
      message: 'Cash collection confirmed and recorded in ledger',
      data: { bookingId: booking._id, amount: grandTotal, walletDues: finalDues }
    });
  } catch (error) {
    console.error('Confirm cash collection error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm cash collection' });
  }
};

/** Farmer acknowledges they paid. Only the booking's own farmer may do this. */
exports.customerConfirmPayment = async (req, res) => {
  try {
    const { booking } = await resolveBooking(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (callerRelation(req, booking) !== 'farmer') {
      return res.status(403).json({ success: false, message: 'Only the customer of this booking can confirm payment.' });
    }
    await Booking.updateOne({ _id: booking._id }, { $set: { customerConfirmed: true } });
    res.status(200).json({ success: true, message: 'Payment confirmed by customer' });
  } catch (error) {
    console.error('Customer confirm payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm payment' });
  }
};

/** Cash status — visible only to the parties of the booking (and admins). */
exports.getCashCollectionStatus = async (req, res) => {
  try {
    const { booking, assignment } = await resolveBooking(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!callerRelation(req, booking, assignment)) {
      return res.status(403).json({ success: false, message: 'Not authorized for this booking.' });
    }
    const { cashCollected, cashCollectedAt, cashCollectedBy, paymentStatus, balanceDue } = booking;
    res.status(200).json({ success: true, data: { _id: booking._id, cashCollected, cashCollectedAt, cashCollectedBy, paymentStatus, balanceDue } });
  } catch (error) {
    console.error('Cash status error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch status' });
  }
};

const Booking = require('../../models/Booking');
const User = require('../../models/User');
const Settings = require('../../models/Settings');
const Plan = require('../../models/Plan');
const { validationResult } = require('express-validator');
const { PAYMENT_STATUS, BOOKING_STATUS } = require('../../utils/constants');
const { createOrder, verifyPayment, refundPayment } = require('../../services/razorpayService');
const { createNotification } = require('../notificationControllers/notificationController');
const { recordBookingEarning } = require('../../services/earningTrackerService');
const {
  applyOnlinePayment,
  getAdvancePaid
} = require('../../services/bookingSettlementService');

const TERMINAL_STATUSES = [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REJECTED, BOOKING_STATUS.COMPLETED];
const SETTLED_PAYMENT = [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR, PAYMENT_STATUS.REFUNDED];

/** What the farmer still owes right now: the balance after the final bill, else the booking total. */
const amountDue = (b) => (b.balanceDue > 0 ? b.balanceDue : b.finalAmount);

/**
 * Create Razorpay order for booking payment
 */
const createPaymentOrder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const userId = req.user.id;
    const { bookingId } = req.body;

    const booking = await Booking.findOne({ _id: bookingId, userId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (TERMINAL_STATUSES.includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot pay for a booking that is ${booking.status}` });
    }
    if (SETTLED_PAYMENT.includes(booking.paymentStatus) || booking.cashCollected) {
      return res.status(400).json({ success: false, message: 'Payment already completed for this booking' });
    }

    const payableAmount = Math.max(1, Math.round(Number(amountDue(booking) || booking.userPayableAmount || booking.basePrice || 1) * 100) / 100);

    const orderResult = await createOrder(payableAmount, 'INR', booking.bookingNumber, {
      bookingId: booking._id.toString(),
      userId: userId.toString(),
      bookingNumber: booking.bookingNumber
    });
    if (!orderResult.success) {
      console.error('Razorpay order creation failed:', orderResult.error);
      return res.status(500).json({ success: false, message: 'Failed to create payment order' });
    }

    // Keep EVERY order id: a payment on an older order must still find this booking
    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: { razorpayOrderId: orderResult.orderId, [`razorpayOrderAmounts.${orderResult.orderId}`]: payableAmount },
        $addToSet: { razorpayOrderIds: orderResult.orderId }
      }
    );

    res.status(200).json({
      success: true,
      message: 'Payment order created successfully',
      data: {
        orderId: orderResult.orderId,
        amount: orderResult.amount / 100,
        currency: orderResult.currency,
        key: process.env.RAZORPAY_KEY_ID,
        bookingId: booking._id
      }
    });
  } catch (error) {
    console.error('Create payment order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment order. Please try again.' });
  }
};

/**
 * Verify payment (webhook handler)
 */
const verifyPaymentWebhook = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment details' });
    }
    if (!verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    const found = await Booking.findOne({
      $or: [{ razorpayOrderId: razorpay_order_id }, { razorpayOrderIds: razorpay_order_id }]
    });
    if (!found) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Idempotency: the client verify call, the gateway webhook and any retry all land here.
    // Only the request that claims this payment id may move money.
    const claimed = await Booking.findOneAndUpdate(
      { _id: found._id, processedPaymentIds: { $ne: razorpay_payment_id } },
      { $push: { processedPaymentIds: razorpay_payment_id } },
      { new: true }
    );
    if (!claimed) {
      return res.status(200).json({ success: true, message: 'Payment already processed', alreadyProcessed: true });
    }

    const paidAmount = Number(claimed.razorpayOrderAmounts?.[razorpay_order_id]) || amountDue(claimed);
    const { booking, refunded, completed, lateRefund } = await applyOnlinePayment(claimed._id, {
      amount: paidAmount, method: 'razorpay', paymentRef: razorpay_payment_id, io: req.app.get('io')
    });

    const Transaction = require('../../models/Transaction');
    await Transaction.create({
      userId: booking.userId,
      bookingId: booking._id,
      amount: paidAmount,
      type: 'payment',
      paymentMethod: 'razorpay',
      status: 'completed',
      description: `Online payment for booking ${booking.bookingNumber}`,
      referenceId: razorpay_payment_id
    });

    // Independent worker bookings are paid out to the worker's wallet on completion
    if (completed && booking.workerId && !booking.vendorId) {
      const Worker = require('../../models/Worker');
      const workerEarning = Math.round(booking.finalAmount * 0.8 * 100) / 100;
      await Worker.findByIdAndUpdate(booking.workerId, { $inc: { 'wallet.balance': workerEarning } });
      await Booking.updateOne({ _id: booking._id }, { $set: { workerPaymentStatus: 'PAID', isWorkerPaid: true, workerPaidAt: new Date() } });
      await Transaction.create({
        workerId: booking.workerId, bookingId: booking._id, amount: workerEarning, type: 'worker_payment',
        paymentMethod: 'system', status: 'completed',
        description: `Earnings ₹${workerEarning} credited for booking #${booking.bookingNumber} (online payment)`,
        metadata: { type: 'earnings_increase', bookingNumber: booking.bookingNumber }
      });
    }

    if (completed) {
      const VendorBill = require('../../models/VendorBill');
      const bill = booking.vendorBillId ? await VendorBill.findById(booking.vendorBillId) : null;
      recordBookingEarning({
        date: new Date(),
        totalRevenue: bill ? bill.grandTotal : booking.finalAmount,
        platformCommission: bill ? bill.companyRevenue : (booking.finalAmount * 0.2),
        vendorEarnings: bill ? bill.vendorTotalEarning : (booking.finalAmount * 0.8),
        totalGST: bill ? bill.totalGST : 0,
        totalTDS: 0
      });
    }

    await createNotification({
      userId: booking.userId,
      type: 'payment_success',
      title: lateRefund ? 'Payment Refunded' : 'Payment Successful',
      message: lateRefund
        ? `Your payment of ₹${paidAmount} arrived after booking ${booking.bookingNumber} was cancelled. ₹${refunded} has been refunded to your wallet.`
        : `Payment of ₹${paidAmount} for booking ${booking.bookingNumber} was successful. Thank you!`,
      relatedId: booking._id,
      relatedType: 'payment',
      priority: 'high'
    });

    if (!lateRefund) {
      const title = completed ? 'Payment Received (Online)' : 'Booking Payment Received';
      const msg = completed
        ? `User paid online for booking ${booking.bookingNumber}. Earnings credited to your wallet. Job Completed!`
        : `Payment received for booking ${booking.bookingNumber}.`;
      if (booking.vendorId) {
        await createNotification({ vendorId: booking.vendorId, type: 'payment_success', title, message: msg, relatedId: booking._id, relatedType: 'booking', priority: 'high' });
      }
      if (booking.workerId) {
        await createNotification({
          workerId: booking.workerId, type: 'payment_success', title, message: msg, relatedId: booking._id, relatedType: 'booking',
          priority: 'high', pushData: { type: 'payment_success', bookingId: booking._id.toString() }
        });
      }
    }

    const io = req.app.get('io');
    if (io) {
      const payload = { bookingId: booking._id, status: booking.status, paymentStatus: booking.paymentStatus, paymentMethod: booking.paymentMethod };
      if (booking.vendorId) io.to(`vendor_${booking.vendorId}`).emit('booking_updated', payload);
      if (booking.workerId) io.to(`worker_${booking.workerId}`).emit('booking_updated', payload);
      io.to(`user_${booking.userId}`).emit('booking_updated', payload);
    }

    res.status(200).json({ success: true, message: 'Payment verified successfully', refunded });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
};

/**
 * Process wallet payment
 */
const processWalletPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const userId = req.user.id;
    const { bookingId } = req.body;

    const pre = await Booking.findOne({ _id: bookingId, userId });
    if (!pre) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (TERMINAL_STATUSES.includes(pre.status)) {
      return res.status(400).json({ success: false, message: `Cannot pay for a booking that is ${pre.status}` });
    }
    if (SETTLED_PAYMENT.includes(pre.paymentStatus) || pre.cashCollected) {
      return res.status(400).json({ success: false, message: 'Payment already completed for this booking' });
    }

    const due = Math.round(Number(amountDue(pre)) * 100) / 100;
    if (!(due > 0)) return res.status(400).json({ success: false, message: 'Nothing to pay for this booking' });

    // 1. Claim the booking first: only one request can ever debit for it
    const claim = await Booking.findOneAndUpdate(
      {
        _id: pre._id, userId, paymentStatus: { $nin: SETTLED_PAYMENT }, cashCollected: { $ne: true },
        status: { $nin: TERMINAL_STATUSES },
        $or: [{ paymentLockAt: null }, { paymentLockAt: { $lt: new Date(Date.now() - 60000) } }]
      },
      { $set: { paymentLockAt: new Date() } },
      { new: true }
    );
    if (!claim) return res.status(409).json({ success: false, message: 'Payment already in progress or completed' });

    // 2. Atomic debit — fails cleanly when the balance is too low, even under concurrency
    const user = await User.findOneAndUpdate(
      { _id: userId, 'wallet.balance': { $gte: due } },
      { $inc: { 'wallet.balance': -due } },
      { new: true }
    );
    if (!user) {
      await Booking.updateOne({ _id: pre._id }, { $set: { paymentLockAt: null } });
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
    }

    const Transaction = require('../../models/Transaction');
    await Transaction.create({
      userId, bookingId: pre._id, amount: due, type: 'debit', paymentMethod: 'wallet', status: 'completed',
      description: `Wallet payment for booking ${pre.bookingNumber}`, balanceAfter: user.wallet.balance
    });

    let applied;
    try {
      applied = await applyOnlinePayment(pre._id, { amount: due, method: 'wallet', paymentRef: `WALLET_${Date.now()}`, io: req.app.get('io') });
    } catch (applyErr) {
      // Money was debited but could not be applied: put it back so the farmer is never charged for nothing
      await User.updateOne({ _id: userId }, { $inc: { 'wallet.balance': due } });
      await Transaction.create({
        userId, bookingId: pre._id, amount: due, type: 'refund', paymentMethod: 'wallet', status: 'completed',
        description: `Automatic reversal of failed wallet payment for booking ${pre.bookingNumber}`
      });
      await Booking.updateOne({ _id: pre._id }, { $set: { paymentLockAt: null } });
      throw applyErr;
    }
    const { booking, completed } = applied;

    await Booking.updateOne({ _id: pre._id }, { $set: { paymentLockAt: null } });

    if (completed) {
      recordBookingEarning({
        date: new Date(), totalRevenue: booking.finalAmount, platformCommission: booking.finalAmount * 0.2,
        vendorEarnings: booking.finalAmount * 0.8, totalGST: 0, totalTDS: 0
      });
    }

    await createNotification({
      userId, type: 'payment_success', title: 'Payment Successful',
      message: `Payment of ₹${due} for booking ${booking.bookingNumber} was successful.`,
      relatedId: booking._id, relatedType: 'payment', priority: 'high'
    });
    const title = completed ? 'Payment Received (Wallet)' : 'Booking Payment Received';
    const msg = completed
      ? `User paid via wallet for booking ${booking.bookingNumber}. Earnings credited to your wallet. Job Completed!`
      : `Payment received for booking ${booking.bookingNumber}.`;
    if (booking.vendorId) await createNotification({ vendorId: booking.vendorId, type: 'payment_success', title, message: msg, relatedId: booking._id, relatedType: 'booking', priority: 'high' });
    if (booking.workerId) await createNotification({ workerId: booking.workerId, type: 'payment_success', title, message: msg, relatedId: booking._id, relatedType: 'booking', priority: 'high' });

    res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: { bookingId: booking._id, amount: due, remainingBalance: user.wallet.balance }
    });
  } catch (error) {
    console.error('Process wallet payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to process payment. Please try again.' });
  }
};

/**
 * Process refund
 */
const processRefund = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { bookingId } = req.body;
    const { amount } = req.body; // Optional: partial refund

    // Get booking
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if payment was successful
    if (booking.paymentStatus !== PAYMENT_STATUS.SUCCESS) {
      return res.status(400).json({
        success: false,
        message: 'Payment not completed for this booking'
      });
    }

    // Process refund based on payment method
    if (booking.paymentMethod === 'razorpay' && booking.razorpayPaymentId) {
      // Razorpay refund
      const refundResult = await refundPayment(
        booking.razorpayPaymentId,
        amount || booking.finalAmount,
        {
          bookingId: booking._id.toString(),
          reason: 'Booking cancellation'
        }
      );

      if (!refundResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to process refund'
        });
      }

      // Update booking payment status
      booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
    } else if (booking.paymentMethod === 'wallet') {
      // Wallet refund - add back to user wallet
      const user = await User.findById(booking.userId);
      if (user) {
        user.wallet.balance += (amount || booking.finalAmount);
        await user.save();
      }

      // Update booking payment status
      booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Refund not supported for this payment method'
      });
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        bookingId: booking._id,
        refundAmount: amount || booking.finalAmount
      }
    });
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund. Please try again.'
    });
  }
};

/**
 * Get payment history
 */
const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bookings with successful payments
    const bookings = await Booking.find({
      userId,
      paymentStatus: PAYMENT_STATUS.SUCCESS
    })
      .populate('serviceId', 'title iconUrl')
      .populate('vendorId', 'name businessName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Booking.countDocuments({
      userId,
      paymentStatus: PAYMENT_STATUS.SUCCESS
    });

    res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history. Please try again.'
    });
  }
};

/**
 * Confirm Pay at Home option
 */
const confirmPayAtHome = async (req, res) => {
  try {
    const userId = req.user.id;
    const { bookingId } = req.body;

    const booking = await Booking.findOne({ _id: bookingId, userId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (SETTLED_PAYMENT.includes(booking.paymentStatus) || booking.cashCollected) {
      return res.status(400).json({ success: false, message: 'Payment already completed for this booking' });
    }

    // Choosing "pay at home" is only meaningful before the work is done, and must never
    // resurrect a cancelled/rejected/finished booking or bypass the vendor's acceptance.
    const OPEN = [BOOKING_STATUS.PENDING, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.AWAITING_PAYMENT, BOOKING_STATUS.REQUESTED, BOOKING_STATUS.CONFIRMED];
    if (!OPEN.includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot change the payment method of a booking that is ${booking.status}` });
    }

    const set = { paymentMethod: 'pay_at_home', paymentStatus: PAYMENT_STATUS.PENDING };
    if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.AWAITING_PAYMENT].includes(booking.status) && booking.vendorId) {
      set.status = BOOKING_STATUS.CONFIRMED;
    } else if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.AWAITING_PAYMENT].includes(booking.status)) {
      set.status = BOOKING_STATUS.CONFIRMED;
    }
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, userId, status: { $in: OPEN }, paymentStatus: { $nin: SETTLED_PAYMENT } },
      { $set: set },
      { new: true }
    );
    if (!updated) return res.status(409).json({ success: false, message: 'Booking changed state, please refresh.' });

    if (updated.vendorId) {
      await createNotification({
        vendorId: updated.vendorId,
        type: 'booking_confirmed',
        title: 'Payment Method: Pay at Home',
        message: `Booking ${updated.bookingNumber} will be paid in cash after the service.`,
        relatedId: updated._id,
        relatedType: 'booking'
      });
    }

    res.status(200).json({ success: true, message: 'Booking confirmed with Pay at Home option', data: updated });
  } catch (error) {
    console.error('Confirm Pay at Home error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm booking. Please try again.' });
  }
};

const calculateUpgradeAmount = (currentPlan, newPlanPrice) => {
  if (!currentPlan || !currentPlan.isActive) return { amount: newPlanPrice, credit: 0 };

  const now = new Date();
  const expiry = new Date(currentPlan.expiry);

  if (expiry <= now) return { amount: newPlanPrice, credit: 0 };

  const totalDuration = 30 * 24 * 60 * 60 * 1000;
  const remainingTime = expiry.getTime() - now.getTime();

  let remainingRatio = remainingTime / totalDuration;
  if (remainingRatio > 1) remainingRatio = 1;
  if (remainingRatio < 0) remainingRatio = 0;

  const credit = Math.floor((currentPlan.price || 0) * remainingRatio);

  if (credit <= 0) return { amount: newPlanPrice, credit: 0 };

  let finalAmount = newPlanPrice - credit;
  if (finalAmount < 0) finalAmount = 0;

  return { amount: Math.ceil(finalAmount), credit };
};

const getUpgradeDetails = async (req, res) => {
  try {
    const { planId } = req.query;
    if (!planId) return res.status(400).json({ success: false, message: 'Plan ID required' });

    const newPlan = await Plan.findById(planId);
    if (!newPlan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const user = await User.findById(req.user.id);
    const { amount, credit } = calculateUpgradeAmount(user.plans, newPlan.price);

    res.status(200).json({
      success: true,
      data: {
        originalPrice: newPlan.price,
        credit,
        finalAmount: amount
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};






const createPlanOrder = async (req, res) => {
  try {
    const { planId } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const user = await User.findById(req.user.id);

    // Calculate dynamic pricing
    const { amount } = calculateUpgradeAmount(user.plans, plan.price);

    // Add 18% Tax
    const amountWithTax = Math.ceil(amount * 1.18);

    const orderResult = await createOrder(
      amountWithTax,
      'INR',
      `PLAN_${Date.now()}`,
      { type: 'plan', planId, userId: req.user.id }
    );
    if (!orderResult.success) {
      return res.status(500).json({ success: false, message: 'Order creation failed' });
    }

    res.status(200).json({
      success: true,
      data: {
        orderId: orderResult.orderId,
        amount: orderResult.amount / 100,
        key: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const verifyPlanPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;

    // Import verifyPayment if needed, but it's destructured at top
    const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) return res.status(400).json({ success: false, message: 'Invalid signature' });

    const plan = await Plan.findById(planId);
    const user = await User.findById(req.user.id);

    const validityDays = plan.validityDays || 30;
    user.plans = {
      isActive: true,
      planId: plan._id,
      name: plan.name,
      expiry: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000),
      price: plan.price,
      rentalDiscountPercentage: plan.rentalDiscountPercentage || 0,
      marketplaceDiscountPercentage: plan.marketplaceDiscountPercentage || 0
    };

    await user.save();

    res.status(200).json({ success: true, message: 'Plan activated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createPaymentOrder,
  verifyPaymentWebhook,
  processWalletPayment,
  processRefund,
  getPaymentHistory,
  confirmPayAtHome,
  createPlanOrder,
  verifyPlanPayment,
  getUpgradeDetails
};


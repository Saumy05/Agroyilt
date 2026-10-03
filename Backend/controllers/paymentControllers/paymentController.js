const Booking = require('../../models/Booking');
const User = require('../../models/User');
const Settings = require('../../models/Settings');
const Plan = require('../../models/Plan');
const { validationResult } = require('express-validator');
const { PAYMENT_STATUS, BOOKING_STATUS } = require('../../utils/constants');
const { createOrder, verifyPayment, refundPayment } = require('../../services/razorpayService');
const { createNotification } = require('../notificationControllers/notificationController');
const { recordBookingEarning } = require('../../services/earningTrackerService');

/**
 * Create Razorpay order for booking payment
 */
const createPaymentOrder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { bookingId } = req.body;

    // Get booking
    const booking = await Booking.findOne({ _id: bookingId, userId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if payment already done
    if (booking.paymentStatus === PAYMENT_STATUS.SUCCESS) {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this booking'
      });
    }

    // Robustly determine payable amount
    const payableAmount = Math.max(1, Number(booking.finalAmount || booking.userPayableAmount || booking.totalAmount || booking.basePrice || 1));

    // Create Razorpay order
    console.log('Creating Razorpay order with amount:', payableAmount);
    const orderResult = await createOrder(
      payableAmount,
      'INR',
      booking.bookingNumber,
      {
        bookingId: booking._id.toString(),
        userId: userId.toString(),
        bookingNumber: booking.bookingNumber
      }
    );

    console.log('[PAYMENT] Razorpay order created:', orderResult.orderId);

    if (!orderResult.success) {
      console.error('Razorpay order creation failed:', orderResult.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment order',
        error: orderResult.error || 'Unknown error'
      });
    }

    // Update booking with Razorpay order ID and ensure finalAmount is set
    booking.razorpayOrderId = orderResult.orderId;
    if (!booking.finalAmount || booking.finalAmount <= 0) {
      booking.finalAmount = payableAmount;
    }
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Payment order created successfully',
      data: {
        orderId: orderResult.orderId,
        amount: orderResult.amount / 100, // Convert back to rupees
        currency: orderResult.currency,
        key: process.env.RAZORPAY_KEY_ID,
        bookingId: booking._id
      }
    });
  } catch (error) {
    console.error('Create payment order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order. Please try again.',
      error: error.message
    });
  }
};

/**
 * Verify payment (webhook handler)
 */
const verifyPaymentWebhook = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    // Verify signature
    const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Find booking by Razorpay order ID
    const booking = await Booking.findOne({ razorpayOrderId: razorpay_order_id });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Update booking payment status
    booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
    booking.paymentMethod = 'razorpay';
    booking.razorpayPaymentId = razorpay_payment_id;
    booking.paymentId = razorpay_payment_id;

    // Update booking status based on current state
    if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.AWAITING_PAYMENT].includes(booking.status)) {
      booking.status = BOOKING_STATUS.CONFIRMED;
    } else if (booking.status === BOOKING_STATUS.REQUESTED) {
      if (!booking.vendorId) {
        booking.status = BOOKING_STATUS.CONFIRMED;
      }
    } else if (booking.status === BOOKING_STATUS.WORK_DONE) {
      booking.status = BOOKING_STATUS.COMPLETED;
      booking.completedAt = new Date();
    }

    await booking.save();

    // ── Credit Vendor Wallet from VendorBill (single source of truth) ──
    const Transaction = require('../../models/Transaction');
    const Vendor = require('../../models/Vendor');
    const VendorBill = require('../../models/VendorBill');

    // User payment transaction
    await Transaction.create({
      userId: booking.userId,
      bookingId: booking._id,
      amount: booking.finalAmount,
      type: 'payment',
      paymentMethod: 'razorpay',
      status: 'completed',
      description: `Online payment for booking ${booking.bookingNumber}`,
      referenceId: razorpay_payment_id
    });

    // Fetch VendorBill for earnings (only if bill exists = post-completion payment)
    const bill = await VendorBill.findOne({ bookingId: booking._id });

    if (bill && booking.vendorId) {
      const vendorEarning = bill.vendorTotalEarning;

      // Mark bill as paid
      bill.status = 'paid';
      bill.paidAt = new Date();
      await bill.save();

      // Online payment: only earnings increase, NO dues (platform holds the money)
      await Vendor.findByIdAndUpdate(booking.vendorId, {
        $inc: { 'wallet.earnings': vendorEarning }
      });

      // Earnings credit transaction
      if (vendorEarning > 0) {
        await Transaction.create({
          vendorId: booking.vendorId,
          bookingId: booking._id,
          amount: vendorEarning,
          type: 'earnings_credit',
          paymentMethod: 'system',
          status: 'completed',
          description: `Earnings ₹${vendorEarning} credited for booking ${booking.bookingNumber} (online payment)`,
          metadata: {
            type: 'earnings_increase',
            billId: bill._id.toString(),
            serviceEarning: bill.vendorServiceEarning,
            partsEarning: bill.vendorPartsEarning
          }
        });
      }

      console.log(`[Payment] Credited ₹${vendorEarning} to vendor ${booking.vendorId}`);
    }

    // ── Credit Independent Worker Wallet if booking is directly assigned to an independent worker ──
    if (booking.workerId && !booking.vendorId) {
      const Worker = require('../../models/Worker');
      const workerEarning = bill ? bill.vendorTotalEarning : (booking.finalAmount * 0.8);

      await Worker.findByIdAndUpdate(booking.workerId, {
        $inc: { 'wallet.balance': workerEarning }
      });

      booking.workerPaymentStatus = 'PAID';
      booking.isWorkerPaid = true;
      booking.workerPaidAt = new Date();
      await booking.save();

      await Transaction.create({
        workerId: booking.workerId,
        bookingId: booking._id,
        amount: workerEarning,
        type: 'worker_payment',
        paymentMethod: 'system',
        status: 'completed',
        description: `Earnings ₹${workerEarning} credited for booking #${booking.bookingNumber} (online payment)`,
        metadata: {
          type: 'earnings_increase',
          bookingNumber: booking.bookingNumber
        }
      });

      console.log(`[Payment] Credited ₹${workerEarning} to independent worker ${booking.workerId}`);
    }

    // Record stats in the Daily Earning Tracker
    recordBookingEarning({
      date: new Date(),
      totalRevenue: bill ? bill.grandTotal : booking.finalAmount,
      platformCommission: bill ? bill.companyRevenue : (booking.finalAmount * 0.2),
      vendorEarnings: bill ? bill.vendorTotalEarning : (booking.finalAmount * 0.8),
      totalGST: bill ? bill.totalGST : 0,
      totalTDS: 0 // Tracked in withdrawals
    });

    // Send notification to user
    await createNotification({
      userId: booking.userId,
      type: 'payment_success',
      title: 'Payment Successful',
      message: `Payment of ₹${booking.finalAmount} for booking ${booking.bookingNumber} was successful. Thank you!`,
      relatedId: booking._id,
      relatedType: 'payment',
      priority: 'high'
    });

    // Notify vendor & worker
    let vendorTitle = 'Booking Confirmed';
    let vendorMsg = `Payment received for booking ${booking.bookingNumber}. The service is now confirmed.`;

    if (booking.status === BOOKING_STATUS.COMPLETED) {
      const vendorEarning = bill ? bill.vendorTotalEarning : (booking.finalAmount * 0.8);
      vendorTitle = 'Payment Received (Online)';
      vendorMsg = `User paid ₹${booking.finalAmount} online for booking ${booking.bookingNumber}. Earnings of ₹${vendorEarning} credited to your wallet. Job Completed!`;
    }

    if (booking.vendorId) {
      await createNotification({
        vendorId: booking.vendorId,
        type: 'payment_success',
        title: vendorTitle,
        message: vendorMsg,
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high'
      });
    }

    if (booking.workerId) {
      let workerTitle = vendorTitle;
      let workerMsg = vendorMsg;
      if (!booking.vendorId) {
        // Independent Worker
        const workerEarning = bill ? bill.vendorTotalEarning : (booking.finalAmount * 0.8);
        workerTitle = 'Payment Received (Online)';
        workerMsg = booking.status === BOOKING_STATUS.COMPLETED ? 
          `Payment of ₹${booking.finalAmount} received successfully. Earnings of ₹${workerEarning} credited to your wallet.` : 
          `Payment of ₹${booking.finalAmount} received successfully.`;
      }
      
      await createNotification({
        workerId: booking.workerId,
        type: 'payment_success',
        title: workerTitle,
        message: workerMsg,
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high',
        pushData: {
          type: 'payment_success',
          bookingId: booking._id.toString()
        }
      });
    }

    // Emit socket event to update vendor real-time
    const io = req.app.get('io');
    if (io) {
      if (booking.vendorId) {
        io.to(`vendor_${booking.vendorId}`).emit('booking_updated', {
          bookingId: booking._id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          paymentMethod: booking.paymentMethod
        });
      }
      if (booking.workerId) {
        io.to(`worker_${booking.workerId}`).emit('booking_updated', {
          bookingId: booking._id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          paymentMethod: booking.paymentMethod
        });
      }
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully'
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment'
    });
  }
};

/**
 * Process wallet payment
 */
const processWalletPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { bookingId } = req.body;

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get booking
    const booking = await Booking.findOne({ _id: bookingId, userId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if payment already done
    if (booking.paymentStatus === PAYMENT_STATUS.SUCCESS) {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this booking'
      });
    }

    // Check wallet balance
    if (user.wallet.balance < booking.finalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance'
      });
    }

    // Deduct from user wallet
    user.wallet.balance -= booking.finalAmount;
    await user.save();

    const Transaction = require('../../models/Transaction');
    await Transaction.create({
      userId,
      bookingId: booking._id,
      amount: booking.finalAmount,
      type: 'debit',
      paymentMethod: 'wallet',
      status: 'completed',
      description: `Wallet payment for booking ${booking.bookingNumber}`,
      balanceAfter: user.wallet.balance
    });

    // Update booking payment status
    booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
    booking.paymentMethod = 'wallet';
    booking.paymentId = `WALLET_${Date.now()}`;

    // Update booking status
    if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.AWAITING_PAYMENT].includes(booking.status)) {
      booking.status = BOOKING_STATUS.CONFIRMED;
    } else if (booking.status === BOOKING_STATUS.WORK_DONE) {
      booking.status = BOOKING_STATUS.COMPLETED;
      booking.completedAt = new Date();
    }

    await booking.save();

    // ── Credit Vendor Wallet from VendorBill (single source of truth) ──
    const Vendor = require('../../models/Vendor');
    const VendorBill = require('../../models/VendorBill');

    const bill = await VendorBill.findOne({ bookingId: booking._id });

    if (bill && booking.vendorId) {
      const vendorEarning = bill.vendorTotalEarning;

      // Mark bill as paid
      bill.status = 'paid';
      bill.paidAt = new Date();
      await bill.save();

      // Wallet payment: only earnings increase, NO dues (platform holds the money)
      await Vendor.findByIdAndUpdate(booking.vendorId, {
        $inc: { 'wallet.earnings': vendorEarning }
      });

      if (vendorEarning > 0) {
        await Transaction.create({
          vendorId: booking.vendorId,
          bookingId: booking._id,
          amount: vendorEarning,
          type: 'earnings_credit',
          paymentMethod: 'system',
          status: 'completed',
          description: `Earnings ₹${vendorEarning} credited for booking ${booking.bookingNumber} (wallet payment)`,
          metadata: {
            type: 'earnings_increase',
            billId: bill._id.toString(),
            serviceEarning: bill.vendorServiceEarning,
            partsEarning: bill.vendorPartsEarning
          }
        });
      }

      console.log(`[Wallet Payment] Credited ₹${vendorEarning} to vendor ${booking.vendorId}`);
    }

    // Record stats in the Daily Earning Tracker
    recordBookingEarning({
      date: new Date(),
      totalRevenue: bill ? bill.grandTotal : booking.finalAmount,
      platformCommission: bill ? bill.companyRevenue : (booking.finalAmount * 0.2),
      vendorEarnings: bill ? bill.vendorTotalEarning : (booking.finalAmount * 0.8),
      totalGST: bill ? bill.totalGST : 0,
      totalTDS: 0 // Tracked in withdrawals
    });

    // Send notification to user
    await createNotification({
      userId,
      type: 'payment_success',
      title: 'Payment Successful',
      message: `Payment of ₹${booking.finalAmount} for booking ${booking.bookingNumber} was successful.`,
      relatedId: booking._id,
      relatedType: 'payment',
      priority: 'high'
    });

    // Notify vendor & worker
    let vendorTitle = 'Booking Confirmed';
    let vendorMsg = `Payment received for booking ${booking.bookingNumber}. The service is now confirmed.`;

    if (booking.status === BOOKING_STATUS.COMPLETED) {
      const vendorEarning = bill ? bill.vendorTotalEarning : (booking.finalAmount * 0.8);
      vendorTitle = 'Payment Received (Wallet)';
      vendorMsg = `User paid ₹${booking.finalAmount} via wallet for booking ${booking.bookingNumber}. Earnings of ₹${vendorEarning} credited to your wallet. Job Completed!`;
    }

    if (booking.vendorId) {
      await createNotification({
        vendorId: booking.vendorId,
        type: 'payment_success',
        title: vendorTitle,
        message: vendorMsg,
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high'
      });
    }

    if (booking.workerId) {
      await createNotification({
        workerId: booking.workerId,
        type: 'payment_success',
        title: vendorTitle,
        message: vendorMsg,
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        bookingId: booking._id,
        amount: booking.finalAmount,
        remainingBalance: user.wallet.balance
      }
    });
  } catch (error) {
    console.error('Process wallet payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment. Please try again.'
    });
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
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.paymentStatus === PAYMENT_STATUS.SUCCESS) {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this booking'
      });
    }

    // Update booking status — NO earnings set (VendorBill handles that later)
    booking.paymentMethod = 'pay_at_home';
    booking.paymentStatus = PAYMENT_STATUS.PENDING;
    booking.status = BOOKING_STATUS.CONFIRMED;

    await booking.save();

    // Notify Vendor that booking is confirmed
    await createNotification({
      vendorId: booking.vendorId,
      type: 'booking_confirmed',
      title: 'Booking Confirmed (Pay at Home)',
      message: `Booking ${booking.bookingNumber} has been confirmed. Payment method: Pay at Home.`,
      relatedId: booking._id,
      relatedType: 'booking'
    });

    res.status(200).json({
      success: true,
      message: 'Booking confirmed with Pay at Home option',
      data: booking
    });
  } catch (error) {
    console.error('Confirm Pay at Home error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm booking. Please try again.'
    });
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


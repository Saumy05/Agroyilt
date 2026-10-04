const User = require('../../models/User');
const Wallet = require('../../models/Wallet');
const WalletTransaction = require('../../models/WalletTransaction');
const Transaction = require('../../models/Transaction');
const { validationResult } = require('express-validator');
const { createOrder, verifyPayment } = require('../../services/razorpayService');

/**
 * Get wallet balance (Single Source of Truth: Wallet collection)
 */
const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;

    let wallet = await Wallet.findOne({ userId, userModel: 'User' });
    if (!wallet) {
      // Seed from User model if legacy balance exists
      const user = await User.findById(userId).select('wallet');
      const initialBalance = user?.wallet?.balance || 0;
      wallet = await Wallet.create({
        userId,
        userModel: 'User',
        balance: initialBalance,
        currency: 'INR'
      });
    }

    // Keep User model in sync
    await User.findByIdAndUpdate(userId, { 'wallet.balance': wallet.balance });

    return res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        currency: wallet.currency || 'INR'
      }
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet balance. Please try again.'
    });
  }
};

/**
 * Add money to wallet (Create Razorpay Order)
 */
const addMoneyToWallet = async (req, res) => {
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
    const { amount } = req.body;

    if (amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum amount to add is ₹100'
      });
    }

    const orderResult = await createOrder(
      amount,
      'INR',
      `WT_${Date.now()}`,
      {
        userId: userId.toString(),
        type: 'wallet_topup'
      }
    );

    if (!orderResult.success) {
      return res.status(500).json({
        success: false,
        message: orderResult.error || 'Failed to create payment order'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment order created successfully',
      data: {
        orderId: orderResult.orderId,
        amount: orderResult.amount / 100,
        currency: orderResult.currency,
        key: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Add money to wallet error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment order. Please try again.'
    });
  }
};

/**
 * Verify wallet top-up payment & credit balance
 */
const verifyWalletTopup = async (req, res) => {
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
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount
    } = req.body;

    const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    let wallet = await Wallet.findOne({ userId, userModel: 'User' });
    if (!wallet) {
      wallet = await Wallet.create({ userId, userModel: 'User', balance: 0 });
    }

    const previousBalance = wallet.balance || 0;
    const topupAmount = Number(amount);
    wallet.balance = previousBalance + topupAmount;
    await wallet.save();

    // Sync User model
    await User.findByIdAndUpdate(userId, { 'wallet.balance': wallet.balance });

    const idempotencyKey = `topup_${razorpay_payment_id}`;

    // 1. Create WalletTransaction
    await WalletTransaction.create({
      walletId: wallet._id,
      type: 'credit',
      amount: topupAmount,
      reason: 'topup',
      referenceId: razorpay_payment_id,
      gatewayTransactionId: razorpay_payment_id,
      idempotencyKey,
      status: 'completed'
    });

    // 2. Create Transaction record for unified passbook
    await Transaction.create({
      userId,
      type: 'credit',
      amount: topupAmount,
      status: 'completed',
      paymentMethod: 'razorpay',
      description: 'Wallet Top-up via Razorpay',
      balanceBefore: previousBalance,
      balanceAfter: wallet.balance,
      referenceId: razorpay_payment_id,
      metadata: {
        orderId: razorpay_order_id,
        signature: razorpay_signature
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Money added to wallet successfully',
      data: {
        balance: wallet.balance
      }
    });
  } catch (error) {
    console.error('Verify wallet topup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add money to wallet. Please try again.'
    });
  }
};

/**
 * Get unified wallet transaction history / Passbook
 */
const getWalletTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let wallet = await Wallet.findOne({ userId, userModel: 'User' });
    if (!wallet) {
      wallet = await Wallet.findOne({ userId });
    }
    const walletId = wallet ? wallet._id : null;

    // Fetch from WalletTransaction and Transaction (exclude vendor-scoped or cash collection transactions)
    const [walletTxns, generalTxns] = await Promise.all([
      walletId ? WalletTransaction.find({ walletId }).sort({ createdAt: -1 }).limit(500).lean() : [],
      Transaction.find({
        userId,
        $or: [{ vendorId: null }, { vendorId: { $exists: false } }],
        type: { $ne: 'cash_collected' }
      }).sort({ createdAt: -1 }).limit(500).lean()
    ]);

    // Merge and deduplicate by referenceId / idempotencyKey
    const seenRefs = new Set();
    const merged = [];

    walletTxns.forEach(wt => {
      const ref = wt.referenceId || wt.gatewayTransactionId || wt.idempotencyKey || wt._id.toString();
      seenRefs.add(ref);
      merged.push({
        id: wt._id,
        type: wt.type || 'credit',
        amount: wt.amount,
        description: wt.description || (wt.reason === 'refund' ? 'Booking Unused Reserve Refund' : (wt.reason === 'topup' ? 'Wallet Top-up' : (wt.reason === 'referral_reward' ? 'Referral Reward' : (wt.reason === 'referral_reversal' ? 'Referral Reward Reversal' : (wt.reason || 'Wallet Credit'))))),
        date: wt.createdAt,
        status: wt.status || 'completed',
        balanceAfter: wt.balanceAfter,
        referenceId: wt.referenceId
      });
    });

    generalTxns.forEach(gt => {
      const ref = gt.referenceId || (gt.bookingId ? gt.bookingId.toString() : null) || gt._id.toString();
      if (!seenRefs.has(ref) && !seenRefs.has(gt._id.toString())) {
        seenRefs.add(ref);
        merged.push({
          id: gt._id,
          type: gt.type || 'credit',
          amount: gt.amount,
          description: gt.description || 'Wallet Transaction',
          date: gt.createdAt,
          status: gt.status || 'completed',
          balanceAfter: gt.balanceAfter,
          referenceId: gt.referenceId
        });
      }
    });

    // Sort descending by date
    merged.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate full ledger metrics
    const totalSpent = merged
      .filter(t => ['payment', 'withdrawal', 'platform_fee', 'convenience_fee', 'gst', 'worker_payment'].includes(t.type))
      .reduce((sum, t) => sum + (t.amount || 0), 0) -
      merged
      .filter(t => ['refund', 'cashback'].includes(t.type))
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalPenalty = merged
      .filter(t => ['penalty', 'fine', 'cancellation_fee', 'debit'].includes(t.type))
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const total = merged.length;
    const paginated = merged.slice(skip, skip + parseInt(limit));

    return res.status(200).json({
      success: true,
      data: paginated,
      summary: {
        totalSpent: Math.max(0, totalSpent),
        totalPenalty: Math.max(0, totalPenalty),
        totalCount: total
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get wallet transactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction history. Please try again.'
    });
  }
};

module.exports = {
  getWalletBalance,
  addMoneyToWallet,
  verifyWalletTopup,
  getWalletTransactions
};

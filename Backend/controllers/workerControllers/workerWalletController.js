'use strict';

const Worker = require('../../models/Worker');
const Transaction = require('../../models/Transaction');
const { getWorkerFinancialSettings } = require('../../services/workerFinancialService');
const withdrawalService = require('../../services/withdrawalService');

exports.getWallet = async (req, res) => {
  try {
    const workerId = req.user._id;
    const worker = await Worker.findById(workerId).select('wallet outstandingDues isRestricted restrictionReason vendorId workerType');
    
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
    
    const settings = await getWorkerFinancialSettings();
    
    let workerWalletDoc = null;
    try {
      const Wallet = require('../../models/Wallet');
      workerWalletDoc = await Wallet.findOne({ $or: [{ workerId }, { userId: workerId }] });
    } catch (e) {
      // Wallet model might not exist or be optional
    }

    const currentBalance = (worker.wallet?.balance !== undefined && worker.wallet?.balance !== null)
      ? Number(worker.wallet.balance)
      : (workerWalletDoc?.balance !== undefined ? Number(workerWalletDoc.balance) : 0);

    const reservedWithdrawal = Number(worker.wallet?.reservedWithdrawal || 0);

    return res.json({
      success: true,
      data: {
        balance: currentBalance,
        reservedWithdrawal,
        workerType: worker.workerType || 'WORKER',
        wallet: {
          balance: currentBalance,
          reservedWithdrawal,
          workerType: worker.workerType || 'WORKER',
          ...(worker.wallet || {})
        },
        outstandingDues: worker.outstandingDues || 0,
        isRestricted: worker.isRestricted || false,
        restrictionReason: worker.restrictionReason || null,
        maxDuesAllowed: settings.maxWorkerDues,
        vendorId: worker.vendorId || null
      }
    });
  } catch (error) {
    console.error('[getWallet]', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch wallet details' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const workerId = req.user._id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ workerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments({ workerId });

    return res.json({
      success: true,
      data: transactions,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[getTransactions]', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

exports.requestPayout = async (req, res) => {
  try {
    const workerId = req.user._id || req.user.id;
    const { amount, notes } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }

    // dues are paid from the balance before anything can be withdrawn
    const { recovered } = await require('../../services/workerDuesService').recoverDuesFromWallet({
      workerId, key: `dues_recovery_withdrawal_${workerId}_${Date.now()}`
    });
    if (recovered > 0) {
      const fresh = await Worker.findById(workerId).select('wallet.balance');
      if (Number(amount) > Number(fresh?.wallet?.balance || 0)) {
        return res.status(400).json({ success: false, message: `₹${recovered} of your balance was used to pay your dues. You can now withdraw up to ₹${Number(fresh?.wallet?.balance || 0)}.` });
      }
    }

    const result = await withdrawalService.createWithdrawalRequest({
      requesterId: workerId,
      requesterRole: 'worker',
      amountINR: Number(amount),
      notes
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: result.data
    });
  } catch (error) {
    console.error('[requestPayout]', error);
    return res.status(400).json({ success: false, message: error.message || 'Failed to request payout' });
  }
};

// ── Dues: what the worker owes the platform (see services/workerDuesService) ─────────────────────────────

const WorkerDuesPayment = require('../../models/WorkerDuesPayment');
const duesSvc = require('../../services/workerDuesService');

/** Amount to pay: the full current dues, or a part of them (whole rupees, at least ₹1). */
const duesAmount = async (workerId, requested) => {
  const worker = await Worker.findById(workerId).select('outstandingDues');
  const dues = Math.round((Number(worker?.outstandingDues) || 0) * 100) / 100;
  if (!(dues > 0)) return { error: 'You have no dues to pay.' };
  const amount = requested === undefined || requested === null || requested === '' ? dues : Math.round(Number(requested) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 1) return { error: 'Enter an amount of at least ₹1.' };
  if (amount > dues) return { error: `Amount cannot be more than your dues (₹${dues}).` };
  return { amount, dues };
};

/** POST /workers/wallet/dues/create-order — Razorpay order for the dues (amount fixed here, not by the client). */
exports.createDuesOrder = async (req, res) => {
  try {
    const workerId = req.user._id;
    const { amount, error } = await duesAmount(workerId, req.body?.amount);
    if (error) return res.status(400).json({ success: false, message: error });

    const { createOrder } = require('../../services/razorpayService');
    const order = await createOrder(amount, 'INR', `DUES_${String(workerId).slice(-6)}_${Date.now()}`, { type: 'worker_dues', workerId: String(workerId) });
    if (!order.success) return res.status(502).json({ success: false, message: 'Could not start the payment. Please try again.' });

    const payment = await WorkerDuesPayment.create({ workerId, amount, method: 'online', status: 'CREATED', razorpayOrderId: order.orderId });
    return res.json({
      success: true,
      data: { paymentId: payment._id, orderId: order.orderId, amount, currency: order.currency || 'INR', key: process.env.RAZORPAY_KEY_ID }
    });
  } catch (error) {
    console.error('[createDuesOrder]', error);
    return res.status(500).json({ success: false, message: 'Failed to start dues payment' });
  }
};

/** POST /workers/wallet/dues/verify — applies the payment exactly once (the webhook shares the same path). */
exports.verifyDuesPayment = async (req, res) => {
  try {
    const workerId = req.user._id;
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    if (!orderId || !paymentId || !signature) return res.status(400).json({ success: false, message: 'Payment details are missing.' });

    const payment = await WorkerDuesPayment.findOne({ workerId, razorpayOrderId: orderId, method: 'online' });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });

    const { verifyPayment } = require('../../services/razorpayService');
    if (!verifyPayment(orderId, paymentId, signature)) return res.status(400).json({ success: false, message: 'Payment could not be verified.' });

    const r = await duesSvc.applyDuesPayment(payment._id, { fromStatus: 'CREATED', set: { razorpayPaymentId: paymentId } });
    if (!r.applied && r.payment?.status !== 'PAID') return res.status(409).json({ success: false, message: 'This payment can no longer be applied.' });
    const worker = await Worker.findById(workerId).select('outstandingDues isRestricted');
    return res.json({
      success: true,
      message: r.applied ? 'Dues paid. Thank you!' : 'This payment was already applied.',
      data: { payment: r.payment, outstandingDues: worker?.outstandingDues || 0, isRestricted: Boolean(worker?.isRestricted) }
    });
  } catch (error) {
    console.error('[verifyDuesPayment]', error);
    return res.status(500).json({ success: false, message: 'Failed to verify dues payment' });
  }
};

/** POST /workers/wallet/dues/offline — the worker paid the admin by cash/UPI; dues change only when the admin approves. */
exports.submitOfflineDuesPayment = async (req, res) => {
  try {
    const workerId = req.user._id;
    const { mode, reference, proofUrl, note } = req.body || {};
    if (!['cash', 'upi'].includes(mode)) return res.status(400).json({ success: false, message: 'Choose how you paid: cash or UPI.' });
    if (mode === 'upi' && !String(reference || '').trim()) return res.status(400).json({ success: false, message: 'Enter the UPI reference number.' });

    const { amount, error } = await duesAmount(workerId, req.body?.amount);
    if (error) return res.status(400).json({ success: false, message: error });

    if (await WorkerDuesPayment.exists({ workerId, method: 'offline', status: 'PENDING_REVIEW' })) {
      return res.status(409).json({ success: false, message: 'You already have a payment waiting for the admin to confirm.' });
    }
    const payment = await WorkerDuesPayment.create({
      workerId, amount, method: 'offline', status: 'PENDING_REVIEW', offlineMode: mode,
      reference: String(reference || '').trim() || null, proofUrl: proofUrl || null, note: String(note || '').trim() || null
    });
    return res.status(201).json({ success: true, message: 'Sent to the admin. Your dues will update once they confirm the payment.', data: payment });
  } catch (error) {
    console.error('[submitOfflineDuesPayment]', error);
    return res.status(500).json({ success: false, message: 'Failed to submit payment' });
  }
};

/** GET /workers/wallet/dues/payments — the worker's recent dues payments (so a pending / rejected one is visible). */
exports.listDuesPayments = async (req, res) => {
  try {
    const payments = await WorkerDuesPayment.find({ workerId: req.user._id, status: { $ne: 'CREATED' } }).sort({ createdAt: -1 }).limit(10).lean();
    return res.json({ success: true, data: payments });
  } catch (error) {
    console.error('[listDuesPayments]', error);
    return res.status(500).json({ success: false, message: 'Failed to load dues payments' });
  }
};

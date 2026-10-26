'use strict';

/**
 * Online (Razorpay) payments for a user's wallet top-up, a soil-test report and a subscription plan.
 * Each one is applied from the ORDER the server created (amount, user and target come from the order, never the client)
 * and at most once per gateway payment, so the app's verify call and the gateway webhook can both arrive and
 * whichever comes first wins.
 */

const User = require('../models/User');
const Plan = require('../models/Plan');
const Vendor = require('../models/Vendor');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const Transaction = require('../models/Transaction');
const SoilTestRequest = require('../models/SoilTestRequest');
const { getOrderDetails } = require('./razorpayService');

const fail = (code, reason) => ({ ok: false, code, reason });

/** The order as Razorpay holds it: its notes say what it was for, its amount is what was charged. */
const loadOrder = async (orderId, type, userId) => {
  const res = await getOrderDetails(orderId);
  if (!res.success) return { error: fail(500, 'Could not read the payment order.') };
  const order = res.order;
  if (type && order.notes?.type !== type) return { error: fail(400, 'This payment is not for that purchase.') };
  if (!order.notes?.userId) return { error: fail(400, 'Payment order has no user.') };
  if (userId && String(order.notes.userId) !== String(userId)) return { error: fail(403, 'This payment belongs to another user.') };
  return { order, amount: Math.round(Number(order.amount) || 0) / 100 };
};

// ── Wallet top-up ───────────────────────────────────────────────────────────────────────────────────────────────

const applyWalletTopup = async ({ orderId, paymentId, userId }) => {
  const { order, amount, error } = await loadOrder(orderId, 'wallet_topup', userId);
  if (error) return error;
  if (!(amount > 0)) return fail(400, 'Invalid order amount.');
  const ownerId = order.notes.userId;

  let wallet = await Wallet.findOne({ userId: ownerId, userModel: 'User' });
  if (!wallet) wallet = await Wallet.create({ userId: ownerId, userModel: 'User', balance: 0 });

  // the ledger row (unique idempotencyKey) is the claim for this payment
  let claim;
  try {
    claim = await WalletTransaction.create({
      walletId: wallet._id, type: 'credit', amount, reason: 'topup',
      referenceId: paymentId, gatewayTransactionId: paymentId,
      idempotencyKey: `topup_${paymentId}`, status: 'completed'
    });
  } catch (e) {
    if (e.code === 11000) return { ok: true, already: true, amount };
    throw e;
  }

  let credited;
  try {
    credited = await Wallet.findOneAndUpdate({ _id: wallet._id }, { $inc: { balance: amount } }, { new: true });
    await User.findByIdAndUpdate(ownerId, { 'wallet.balance': credited.balance });
  } catch (e) {
    await WalletTransaction.deleteOne({ _id: claim._id }).catch(() => {}); // let a retry apply it
    throw e;
  }

  try {
    await Transaction.create({
      userId: ownerId, type: 'credit', amount, status: 'completed', paymentMethod: 'razorpay',
      description: 'Wallet Top-up via Razorpay',
      balanceBefore: credited.balance - amount, balanceAfter: credited.balance,
      referenceId: paymentId, metadata: { orderId }
    });
  } catch (e) { console.error('[onlinePayment] top-up passbook row failed:', e.message); }
  return { ok: true, amount, balance: credited.balance };
};

// ── Soil-test report ────────────────────────────────────────────────────────────────────────────────────────────

const applySoilTestPayment = async ({ orderId, paymentId, userId, requestId }) => {
  const { order, amount, error } = await loadOrder(orderId, null, userId);
  if (error) return error;
  const targetId = order.notes.requestId;
  if (!targetId || (requestId && String(targetId) !== String(requestId))) return fail(400, 'This payment is not for that soil test.');

  const request = await SoilTestRequest.findById(targetId);
  if (!request) return fail(404, 'Request not found');
  if (String(request.userId) !== String(order.notes.userId)) return fail(403, 'This payment belongs to another user.');
  if (amount < (request.totalAmount || 0)) return fail(409, 'Paid amount is less than the report price.');

  // the status flip is the claim; a second delivery of the same payment finds it already paid
  const claimed = await SoilTestRequest.findOneAndUpdate(
    { _id: request._id, paymentStatus: 'pending' },
    { $set: { paymentStatus: 'paid', paymentMethod: 'online', transactionId: paymentId } },
    { new: true }
  );
  if (!claimed) {
    return request.transactionId === paymentId
      ? { ok: true, already: true }
      : { ok: true, already: true, note: 'Report was already paid another way; this extra payment needs a manual refund.' };
  }

  try {
    const user = await User.findById(claimed.userId);
    await Transaction.create({
      userId: claimed.userId, type: 'debit', amount: claimed.totalAmount, status: 'completed', paymentMethod: 'online',
      description: 'Paid for Soil Test Report via Online',
      balanceBefore: user?.wallet?.balance || 0, balanceAfter: user?.wallet?.balance || 0,
      referenceId: claimed._id.toString(), metadata: { orderId, paymentId }
    });
  } catch (e) { console.error('[onlinePayment] soil test user txn failed:', e.message); }

  try {
    if (claimed.vendorId && claimed.vendorEarning > 0) {
      const vendor = await Vendor.findById(claimed.vendorId);
      if (vendor) {
        const prev = vendor.wallet?.earnings || 0;
        if (!vendor.wallet) vendor.wallet = { earnings: 0, dues: 0 };
        vendor.wallet.earnings = prev + claimed.vendorEarning;
        await vendor.save();
        await Transaction.create({
          vendorId: vendor._id, type: 'credit', amount: claimed.vendorEarning, status: 'completed', paymentMethod: 'system',
          description: 'Earnings from Soil Test Report (Online payment routed)',
          balanceBefore: prev, balanceAfter: vendor.wallet.earnings, referenceId: claimed._id.toString()
        });
        try {
          const { createNotification } = require('../controllers/notificationControllers/notificationController');
          await createNotification({
            vendorId: vendor._id, type: 'soil_test_payment_received', title: '💰 Payment Received',
            message: `You have earned ₹${claimed.vendorEarning} for the completed soil test (ID: ${claimed._id.toString().slice(-6)}).`,
            relatedId: claimed._id, relatedType: 'service',
            pushData: { type: 'soil_test_payment_received', requestId: claimed._id.toString(), amount: claimed.vendorEarning, link: '/vendor/soil-tests' }
          });
        } catch (noticeErr) { console.error('Notification error (Vendor Credit):', noticeErr); }
      }
    }
  } catch (e) { console.error('[onlinePayment] soil test vendor credit failed:', e.message); }
  return { ok: true };
};

// ── Subscription plan ───────────────────────────────────────────────────────────────────────────────────────────

const applyPlanPayment = async ({ orderId, paymentId, userId }) => {
  const { order, amount, error } = await loadOrder(orderId, 'plan', userId);
  if (error) return error;
  const plan = await Plan.findById(order.notes.planId);
  if (!plan) return fail(404, 'Plan not found');

  // the passbook row (unique metadata.idempotencyKey) is the claim for this payment
  try {
    await Transaction.create({
      userId: order.notes.userId, type: 'payment', amount, status: 'completed', paymentMethod: 'razorpay',
      description: `Subscription plan: ${plan.name}`, referenceId: paymentId,
      metadata: { idempotencyKey: `plan_${paymentId}`, orderId, planId: String(plan._id) }
    });
  } catch (e) {
    if (e.code === 11000) return { ok: true, already: true };
    throw e;
  }

  const user = await User.findById(order.notes.userId);
  if (!user) return fail(404, 'User not found');
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
  return { ok: true };
};

/** Webhook entry: @returns {{handled: boolean, retry?: boolean, note?: string}} */
const handleCapturedPayment = async ({ orderId, paymentId, notes }) => {
  let run;
  if (notes?.type === 'wallet_topup') run = applyWalletTopup;
  else if (notes?.type === 'plan') run = applyPlanPayment;
  else if (notes?.type === 'soil_test') run = applySoilTestPayment;
  else return { handled: false };
  try {
    const r = await run({ orderId, paymentId });
    return { handled: true, retry: !r.ok && r.code === 500, note: r.ok ? (r.note || (r.already ? 'Already applied' : undefined)) : r.reason };
  } catch (e) {
    console.error('[onlinePayment webhook]', e);
    return { handled: true, retry: true, note: e.message };
  }
};

module.exports = { applyWalletTopup, applySoilTestPayment, applyPlanPayment, handleCapturedPayment };

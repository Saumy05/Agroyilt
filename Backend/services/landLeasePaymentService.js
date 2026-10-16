'use strict';

/**
 * Pays a land lease installment (fixed-rent) or settlement (crop-share) from the tenant's wallet,
 * or online through Razorpay when the wallet can't cover it (the whole amount, never a split).
 *
 * Money safety (same idea as services/workerExtensionService.js payFromWallet):
 *  - The item is CLAIMED first (`pending` -> `processing`, a fresh paymentKey is stored on it).
 *  - Every ledger step uses a key derived from that paymentKey, so a crash or a double tap re-runs the same steps
 *    and each step moves money at most once.
 *  - Not enough balance releases the claim, so the next attempt gets a new paymentKey (a failed ledger row keeps its key).
 *  - A crash after the debit leaves the item `processing`; the next tap resumes with the same paymentKey.
 *  - Online: the paymentKey is `rzp_<paymentId>`, so one gateway payment can credit the owner at most once.
 *    If the item was settled another way meanwhile, the captured payment is refunded to the tenant's wallet.
 */

const crypto = require('crypto');
const LandLease = require('../models/LandLease');
const ledger = require('./ledgerService');
const { notifyLease } = require('./landLeaseNotifyService');
const razorpayService = require('./razorpayService');

const ONLINE_PREFIX = 'rzp_';
const toPaise = (inr) => Math.round(Number(inr) * 100);

const KINDS = {
  installment: { field: 'installments', openStatus: 'pending', label: 'rent installment' },
  settlement: { field: 'settlements', openStatus: 'confirmed', label: 'crop-share settlement' }
};

const releaseClaim = (leaseId, kind, itemId, paymentKey) => {
  const { field, openStatus } = KINDS[kind];
  return LandLease.updateOne(
    { _id: leaseId, [field]: { $elemMatch: { _id: itemId, status: 'processing', paymentKey } } },
    { $set: { [`${field}.$.status`]: openStatus, [`${field}.$.paymentKey`]: null } }
  );
};

const claim = async (lease, kind, item) => {
  const { field, openStatus } = KINDS[kind];
  if (item.status === 'processing' && item.paymentKey) return item.paymentKey; // resume a crashed attempt
  const paymentKey = `${item._id}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const res = await LandLease.updateOne(
    { _id: lease._id, [field]: { $elemMatch: { _id: item._id, status: openStatus } } },
    { $set: { [`${field}.$.status`]: 'processing', [`${field}.$.paymentKey`]: paymentKey } }
  );
  return res.modifiedCount === 1 ? paymentKey : null;
};

const finish = async ({ lease, kind, item, tenantId, paymentKey, method = 'wallet' }) => {
  const { field, label } = KINDS[kind];
  const ref = `${lease._id}:${item._id}`;
  const title = lease.title;

  const credit = await ledger.applyOnce({
    ownerId: lease.ownerId, ownerModel: 'User', amount: item.ownerAmount, key: `lease_credit_${paymentKey}`,
    reason: 'lease_receipt', referenceId: ref
  });
  if (!credit.applied && !credit.duplicate) throw new Error('owner credit failed');

  await ledger.recordPassbookOnce(`lease_tenant_${paymentKey}`, {
    userId: tenantId, type: 'payment', amount: item.amount, status: 'completed', paymentMethod: method,
    description: `Land lease ${label} for "${title}"`, referenceId: ref,
    metadata: { landLeaseId: lease._id, itemId: item._id, kind }
  });
  await ledger.recordPassbookOnce(`lease_owner_${paymentKey}`, {
    userId: lease.ownerId, type: 'earnings_credit', amount: item.ownerAmount, status: 'completed', paymentMethod: 'wallet',
    description: `Land lease ${label} received for "${title}"`, referenceId: ref,
    metadata: { landLeaseId: lease._id, itemId: item._id, kind }
  });
  if (item.commission > 0) {
    await ledger.recordPassbookOnce(`lease_commission_${paymentKey}`, {
      type: 'commission', amount: item.commission, status: 'completed', paymentMethod: 'system',
      description: `Platform commission on land lease ${label} for "${title}"`, referenceId: ref,
      metadata: { landLeaseId: lease._id, itemId: item._id, kind }
    });
  }

  await LandLease.updateOne(
    { _id: lease._id, [field]: { $elemMatch: { _id: item._id, status: 'processing', paymentKey } } },
    { $set: { [`${field}.$.status`]: 'paid', [`${field}.$.paidAt`]: new Date() } }
  );
};

/** Shared checks before any payment starts. Returns {lease, item} or {error}. */
const loadPayable = async ({ leaseId, tenantId, kind, itemId }) => {
  const meta = KINDS[kind];
  if (!meta) return { error: { ok: false, code: 400, reason: 'Unknown payment type.' } };

  const lease = await LandLease.findById(leaseId);
  if (!lease) return { error: { ok: false, code: 404, reason: 'Land lease not found.' } };
  if (String(lease.currentTenantId) !== String(tenantId) || lease.status !== 'leased') {
    return { error: { ok: false, code: 403, reason: 'Only the current tenant can pay for this lease.' } };
  }

  const item = lease[meta.field].id(itemId);
  if (!item) return { error: { ok: false, code: 404, reason: 'Payment item not found.' } };
  if (item.status === 'paid') return { error: { ok: false, code: 409, reason: 'This payment is already done.' } };

  if (kind === 'installment') {
    const earlierUnpaid = lease.installments.some((i) => i.number < item.number && i.status !== 'paid');
    if (earlierUnpaid) return { error: { ok: false, code: 409, reason: 'Please pay the earlier installments first.' } };
  }
  if (kind === 'settlement' && item.status !== 'confirmed' && item.status !== 'processing') {
    return { error: { ok: false, code: 409, reason: 'The owner has not confirmed this settlement yet.' } };
  }
  return { lease, item };
};

/** Runs the post-payment steps (retried once), notifies the owner and returns the fresh lease. */
const complete = async (ctx) => {
  const { lease, kind, item } = ctx;
  try {
    await finish(ctx);
  } catch (err) {
    console.error('[landLeasePayment] finishing after payment failed, retrying once:', err.message);
    try {
      await finish(ctx);
    } catch (err2) {
      console.error('[landLeasePayment] retry failed:', err2.message);
      return { ok: false, code: 500, reason: 'Your payment is safe. Finishing it failed; please tap pay again in a minute.' };
    }
  }

  const what = kind === 'installment' ? `किराया, किस्त ${item.number}` : 'बटाई हिस्सा';
  notifyLease(lease.ownerId, 'land_lease_payment', `💰 ${what} मिला (Lease payment received)`,
    `"${lease.title}" का ₹${item.ownerAmount} आपके वॉलेट में जमा हुआ।`, lease._id);

  const fresh = await LandLease.findById(lease._id).lean();
  return { ok: true, lease: fresh };
};

/**
 * Pay from the tenant's wallet.
 * @returns {{ok: boolean, code?: number, reason?: string, insufficient?: boolean, balance?: number, required?: number, lease?: object}}
 */
const payItem = async ({ leaseId, tenantId, kind, itemId }) => {
  const { lease, item, error } = await loadPayable({ leaseId, tenantId, kind, itemId });
  if (error) return error;

  const paymentKey = await claim(lease, kind, item);
  if (!paymentKey) return { ok: false, code: 409, reason: 'This payment is already being processed.' };

  // An online payment already took the money: only finish it, never debit the wallet on top
  const paidOnline = String(paymentKey).startsWith(ONLINE_PREFIX);
  if (!paidOnline) {
    const debit = await ledger.debitIfEnough({
      ownerId: tenantId, ownerModel: 'User', amount: item.amount, key: `lease_debit_${paymentKey}`,
      reason: 'lease_payment', referenceId: `${lease._id}:${item._id}`
    });
    if (debit.insufficient) {
      await releaseClaim(lease._id, kind, item._id, paymentKey);
      const bal = Number(debit.balance) || 0;
      return {
        ok: false, code: 402, insufficient: true, balance: bal, required: item.amount,
        reason: `Wallet balance is low. You need ₹${item.amount}, you have ₹${bal}.`
      };
    }
    // debit.duplicate means this attempt already took the money earlier (crash/double tap): carry on, every step is idempotent
  }

  const done = await complete({ lease, kind, item, tenantId, paymentKey, method: paidOnline ? 'razorpay' : 'wallet' });
  if (!done.ok && !paidOnline) done.reason = 'Your wallet payment is safe. Finishing the payment failed; please tap pay again in a minute.';
  return done;
};

/**
 * Online step 1: open a Razorpay order for the full amount of one item.
 * @returns {{ok: boolean, code?: number, reason?: string, order?: {orderId, amount, currency}}}
 */
const createOnlineOrder = async ({ leaseId, tenantId, kind, itemId }) => {
  const { lease, item, error } = await loadPayable({ leaseId, tenantId, kind, itemId });
  if (error) return error;

  const { field, openStatus } = KINDS[kind];
  if (item.status !== openStatus) return { ok: false, code: 409, reason: 'This payment is already being processed.' };

  const order = await razorpayService.createOrder(item.amount, 'INR', `lease_${String(item._id).slice(-12)}_${Date.now()}`, {
    leaseId: String(lease._id), itemId: String(item._id), kind, tenantId: String(tenantId)
  });
  if (!order.success) return { ok: false, code: 502, reason: 'Could not start the online payment. Please try again.' };

  await LandLease.updateOne(
    { _id: lease._id, [field]: { $elemMatch: { _id: item._id, status: openStatus } } },
    { $set: { [`${field}.$.razorpayOrderId`]: order.orderId } }
  );
  return { ok: true, order: { orderId: order.orderId, amount: order.amount, currency: order.currency } };
};

/** The captured online payment can't be applied (item settled another way): hand it back as wallet money, once. */
const refundToWallet = async ({ lease, tenantId, paymentId, amount }) => {
  const key = `lease_late_refund_${paymentId}`;
  const res = await ledger.applyOnce({
    ownerId: tenantId, ownerModel: 'User', amount, key, reason: 'refund',
    referenceId: String(lease._id), gatewayTransactionId: paymentId
  });
  if (res.applied) {
    await ledger.recordPassbookOnce(key, {
      userId: tenantId, type: 'refund', amount, status: 'completed', paymentMethod: 'wallet',
      description: `Refund of online payment ${paymentId}: this lease payment was already settled`, referenceId: String(lease._id)
    });
  }
};

/**
 * Online step 2: the checkout succeeded. Verify the signature and the payment with Razorpay, then credit the owner.
 */
const verifyOnlinePayment = async ({ leaseId, tenantId, kind, itemId, orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) return { ok: false, code: 400, reason: 'Payment details are missing.' };
  if (!razorpayService.verifyPayment(orderId, paymentId, signature)) {
    return { ok: false, code: 400, reason: 'Payment verification failed.' };
  }

  const meta = KINDS[kind];
  if (!meta) return { ok: false, code: 400, reason: 'Unknown payment type.' };
  const lease = await LandLease.findById(leaseId);
  if (!lease || String(lease.currentTenantId) !== String(tenantId)) {
    return { ok: false, code: 403, reason: 'Only the current tenant can pay for this lease.' };
  }
  const item = lease[meta.field].id(itemId);
  if (!item) return { ok: false, code: 404, reason: 'Payment item not found.' };

  const paymentKey = `${ONLINE_PREFIX}${paymentId}`;
  if (item.status === 'paid' && item.paymentKey === paymentKey) return { ok: true, lease: lease.toObject() }; // repeated call

  if (item.razorpayOrderId !== orderId) return { ok: false, code: 400, reason: 'This payment does not match the order.' };

  const details = await razorpayService.getPaymentDetails(paymentId);
  const pay = details.payment;
  if (!details.success || !pay || pay.order_id !== orderId || pay.status !== 'captured' || Number(pay.amount) !== toPaise(item.amount)) {
    return { ok: false, code: 402, reason: 'We could not confirm this payment with the bank. If money was deducted it will be refunded.' };
  }

  // Claim with the payment's own key: a retry of the same payment resumes, anything else is refused
  let claimedKey = null;
  if (item.status === 'processing' && item.paymentKey === paymentKey) {
    claimedKey = paymentKey;
  } else {
    const { field, openStatus } = meta;
    const res = await LandLease.updateOne(
      { _id: lease._id, [field]: { $elemMatch: { _id: item._id, status: openStatus } } },
      { $set: { [`${field}.$.status`]: 'processing', [`${field}.$.paymentKey`]: paymentKey } }
    );
    if (res.modifiedCount === 1) claimedKey = paymentKey;
  }
  if (!claimedKey) {
    await refundToWallet({ lease, tenantId, paymentId, amount: item.amount });
    return { ok: false, code: 409, reason: `This was already paid another way. Your online payment of ₹${item.amount} was refunded to your wallet.` };
  }

  return complete({ lease, kind, item, tenantId, paymentKey, method: 'razorpay' });
};

module.exports = { payItem, createOnlineOrder, verifyOnlinePayment };

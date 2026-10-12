'use strict';

/**
 * Pays a land lease installment (fixed-rent) or settlement (crop-share) from the tenant's wallet.
 *
 * Money safety (same idea as services/workerExtensionService.js payFromWallet):
 *  - The item is CLAIMED first (`pending` -> `processing`, a fresh paymentKey is stored on it).
 *  - Every ledger step uses a key derived from that paymentKey, so a crash or a double tap re-runs the same steps
 *    and each step moves money at most once.
 *  - Not enough balance releases the claim, so the next attempt gets a new paymentKey (a failed ledger row keeps its key).
 *  - A crash after the debit leaves the item `processing`; the next tap resumes with the same paymentKey.
 */

const crypto = require('crypto');
const LandLease = require('../models/LandLease');
const ledger = require('./ledgerService');
const { notifyLease } = require('./landLeaseNotifyService');

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

const finish = async ({ lease, kind, item, tenantId, paymentKey }) => {
  const { field, label } = KINDS[kind];
  const ref = `${lease._id}:${item._id}`;
  const title = lease.title;

  const credit = await ledger.applyOnce({
    ownerId: lease.ownerId, ownerModel: 'User', amount: item.ownerAmount, key: `lease_credit_${paymentKey}`,
    reason: 'lease_receipt', referenceId: ref
  });
  if (!credit.applied && !credit.duplicate) throw new Error('owner credit failed');

  await ledger.recordPassbookOnce(`lease_tenant_${paymentKey}`, {
    userId: tenantId, type: 'payment', amount: item.amount, status: 'completed', paymentMethod: 'wallet',
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

/**
 * @returns {{ok: boolean, code?: number, reason?: string, insufficient?: boolean, balance?: number, required?: number, lease?: object}}
 */
const payItem = async ({ leaseId, tenantId, kind, itemId }) => {
  const meta = KINDS[kind];
  if (!meta) return { ok: false, code: 400, reason: 'Unknown payment type.' };

  const lease = await LandLease.findById(leaseId);
  if (!lease) return { ok: false, code: 404, reason: 'Land lease not found.' };
  if (String(lease.currentTenantId) !== String(tenantId) || lease.status !== 'leased') {
    return { ok: false, code: 403, reason: 'Only the current tenant can pay for this lease.' };
  }

  const item = lease[meta.field].id(itemId);
  if (!item) return { ok: false, code: 404, reason: 'Payment item not found.' };
  if (item.status === 'paid') return { ok: false, code: 409, reason: 'This payment is already done.' };

  if (kind === 'installment') {
    const earlierUnpaid = lease.installments.some((i) => i.number < item.number && i.status !== 'paid');
    if (earlierUnpaid) return { ok: false, code: 409, reason: 'Please pay the earlier installments first.' };
  }
  if (kind === 'settlement' && item.status !== 'confirmed' && item.status !== 'processing') {
    return { ok: false, code: 409, reason: 'The owner has not confirmed this settlement yet.' };
  }

  const paymentKey = await claim(lease, kind, item);
  if (!paymentKey) return { ok: false, code: 409, reason: 'This payment is already being processed.' };

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

  const ctx = { lease, kind, item, tenantId, paymentKey };
  try {
    await finish(ctx);
  } catch (err) {
    console.error('[landLeasePayment] finishing after the debit failed, retrying once:', err.message);
    try {
      await finish(ctx);
    } catch (err2) {
      console.error('[landLeasePayment] retry failed:', err2.message);
      return { ok: false, code: 500, reason: 'Your wallet payment is safe. Finishing the payment failed; please tap pay again in a minute.' };
    }
  }

  const what = kind === 'installment' ? `किराया, किस्त ${item.number}` : 'बटाई हिस्सा';
  notifyLease(lease.ownerId, 'land_lease_payment', `💰 ${what} मिला (Lease payment received)`,
    `"${lease.title}" का ₹${item.ownerAmount} आपके वॉलेट में जमा हुआ।`, lease._id);

  const fresh = await LandLease.findById(lease._id).lean();
  return { ok: true, lease: fresh };
};

module.exports = { payItem };

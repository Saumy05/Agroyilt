'use strict';

/**
 * Worker dues: what a worker owes the platform (cash-job platform fees, commission, penalties their wallet could not
 * cover). Three ways they come down:
 *   1. recoverDuesFromWallet — automatically, from wallet balance (after online earnings land, after a penalty,
 *      before a withdrawal).
 *   2. online payment (Razorpay) — WorkerDuesPayment method 'online'.
 *   3. offline payment to the admin, approved by the admin — WorkerDuesPayment method 'offline'.
 * Every path ends in syncDuesRestriction, which blocks the worker above the dues limit and unblocks below it.
 */

const Worker = require('../models/Worker');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const WorkerDuesPayment = require('../models/WorkerDuesPayment');
const ledger = require('./ledgerService');

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const DUES_REASON = /^Outstanding dues/;

const emitWallet = (workerId, reason) => {
  try {
    const io = require('../sockets').getIO();
    for (const room of [`worker_${workerId}`, `worker:${workerId}`]) io.to(room).emit('wallet_balance_updated', { reason, timestamp: new Date() });
  } catch (_) { /* sockets are best-effort */ }
};

/**
 * Block the worker while dues are above the limit; lift a dues block once they are back under it.
 * A block that was set for another reason (non-dues restrictionReason) is never lifted here.
 */
const syncDuesRestriction = async (workerId) => {
  const { getWorkerFinancialSettings } = require('./workerFinancialService');
  const max = Number((await getWorkerFinancialSettings()).maxWorkerDues) || 0;
  const w = await Worker.findById(workerId).select('outstandingDues isRestricted restrictionReason');
  if (!w) return;
  const dues = Number(w.outstandingDues) || 0;
  if (dues > max && !w.isRestricted) {
    await Worker.updateOne({ _id: workerId, isRestricted: { $ne: true } }, {
      $set: { isRestricted: true, restrictionReason: `Outstanding dues (₹${dues}) exceeded allowed limit (₹${max})` }
    });
  } else if (dues <= max && w.isRestricted && (!w.restrictionReason || DUES_REASON.test(w.restrictionReason))) {
    await Worker.updateOne({ _id: workerId, isRestricted: true }, { $set: { isRestricted: false, restrictionReason: null } });
  }
};

/**
 * Pay dues from the wallet balance, as far as the balance goes. `key` makes one triggering event apply at most once.
 * @returns {{recovered: number}}
 */
const recoverDuesFromWallet = async ({ workerId, key, referenceId = null }) => {
  const pre = await Worker.findById(workerId).select('outstandingDues wallet.balance');
  if (!pre || !(pre.outstandingDues > 0) || !(pre.wallet?.balance > 0)) return { recovered: 0 };

  const wallet = await ledger.ensureWallet(workerId, 'Worker');
  try {
    await WalletTransaction.create({
      walletId: wallet._id, type: 'debit', amount: 0, reason: 'dues_recovery',
      referenceId: String(referenceId || workerId), idempotencyKey: key, status: 'pending'
    });
  } catch (err) {
    if (err && err.code === 11000) return { recovered: 0, duplicate: true };
    throw err;
  }

  // One atomic pipeline: take min(dues, balance) from both, from the SAME document state.
  const take = { $max: [0, { $min: [{ $ifNull: ['$outstandingDues', 0] }, { $ifNull: ['$wallet.balance', 0] }] }] };
  const before = await Worker.findOneAndUpdate({ _id: workerId }, [
    { $set: { _take: take } },
    {
      $set: {
        outstandingDues: { $round: [{ $subtract: [{ $ifNull: ['$outstandingDues', 0] }, '$_take'] }, 2] },
        'wallet.balance': { $round: [{ $subtract: [{ $ifNull: ['$wallet.balance', 0] }, '$_take'] }, 2] }
      }
    },
    { $unset: '_take' }
  ], { new: false });
  const recovered = round2(Math.max(0, Math.min(Number(before?.outstandingDues) || 0, Number(before?.wallet?.balance) || 0)));

  if (recovered > 0) {
    await Wallet.updateOne({ _id: wallet._id }, [{ $set: { balance: { $round: [{ $max: [0, { $subtract: [{ $ifNull: ['$balance', 0] }, recovered] }] }, 2] } } }]);
    await ledger.recordPassbookOnce(key, {
      workerId, type: 'debit', amount: recovered, status: 'completed', paymentMethod: 'wallet',
      description: `Dues of ₹${recovered} paid from your wallet balance`, referenceId: String(referenceId || key),
      metadata: { type: 'dues_recovery' }
    });
  }
  await WalletTransaction.updateOne({ idempotencyKey: key }, { $set: { amount: recovered, status: 'completed' } });
  await syncDuesRestriction(workerId);
  if (recovered > 0) emitWallet(workerId, 'dues_recovered');
  return { recovered };
};

/**
 * Apply a dues payment exactly once (CREATED/PENDING_REVIEW → PAID). Dues come down by up to `amount`; if they had
 * already dropped meanwhile (auto-recovery), the rest is credited to the wallet so no money is lost.
 */
const applyDuesPayment = async (paymentId, { fromStatus, set = {} }) => {
  const claimed = await WorkerDuesPayment.findOneAndUpdate(
    { _id: paymentId, status: fromStatus },
    { $set: { status: 'PAID', paidAt: new Date(), ...set } },
    { new: true }
  );
  if (!claimed) return { applied: false, payment: await WorkerDuesPayment.findById(paymentId) };

  const amount = Number(claimed.amount);
  const before = await Worker.findOneAndUpdate({ _id: claimed.workerId }, [
    { $set: { outstandingDues: { $round: [{ $max: [0, { $subtract: [{ $ifNull: ['$outstandingDues', 0] }, amount] }] }, 2] } } }
  ], { new: false });
  const appliedToDues = round2(Math.min(amount, Math.max(0, Number(before?.outstandingDues) || 0)));
  const excessToWallet = round2(amount - appliedToDues);

  if (excessToWallet > 0) {
    await ledger.applyOnce({
      ownerId: claimed.workerId, ownerModel: 'Worker', amount: excessToWallet,
      key: `dues_payment_excess_${claimed._id}`, reason: 'refund', referenceId: claimed._id
    });
  }
  await WorkerDuesPayment.updateOne({ _id: claimed._id }, { $set: { appliedToDues, excessToWallet } });

  const how = claimed.method === 'online' ? 'online' : `to the admin (${claimed.offlineMode || 'cash'})`;
  await ledger.recordPassbookOnce(`dues_payment_${claimed._id}`, {
    workerId: claimed.workerId, type: 'payment', amount, status: 'completed',
    paymentMethod: claimed.method === 'online' ? 'razorpay' : (claimed.offlineMode || 'cash'),
    description: `Dues of ₹${amount} paid ${how}${excessToWallet > 0 ? ` · ₹${excessToWallet} extra added to your wallet` : ''}`,
    referenceId: claimed.razorpayPaymentId || claimed.reference || String(claimed._id),
    metadata: { type: 'dues_payment', duesPaymentId: String(claimed._id), appliedToDues, excessToWallet }
  });

  await syncDuesRestriction(claimed.workerId);
  emitWallet(claimed.workerId, 'dues_paid');
  return { applied: true, payment: await WorkerDuesPayment.findById(claimed._id) };
};

module.exports = { syncDuesRestriction, recoverDuesFromWallet, applyDuesPayment, emitWallet };

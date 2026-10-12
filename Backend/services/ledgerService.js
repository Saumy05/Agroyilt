'use strict';

/**
 * Idempotent wallet ledger.
 *
 * Invariant: a ledger row with a given idempotencyKey exists at most once (unique index), and the
 * balance moves AT MOST once per key. The row is inserted FIRST in state `pending`, the balance is
 * moved with a single atomic $inc, then the row is flipped to `completed`. A crash between steps can
 * therefore never double-credit — it leaves a `pending` row that reconcilePendingLedger() reports.
 *
 * (The previous code read a wallet, added to it in memory, saved it, and only then wrote the ledger
 *  row — two concurrent callers both credited, and the unique key then failed AFTER the money moved.)
 */

const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const Worker = require('../models/Worker');
const Transaction = require('../models/Transaction');

const EMBEDDED = { User, Worker };

const DUPLICATE = 11000;

const ensureWallet = async (ownerId, ownerModel) => {
  await Wallet.updateOne(
    { userId: ownerId, userModel: ownerModel },
    { $setOnInsert: { userId: ownerId, userModel: ownerModel, balance: 0 } },
    { upsert: true }
  ).catch((err) => { if (!err || err.code !== DUPLICATE) throw err; });
  // Concurrent first-time upserts can create two rows when no unique index exists yet: everybody deterministically
  // uses the OLDEST one, so all money lands on a single wallet.
  return Wallet.findOne({ userId: ownerId, userModel: ownerModel }).sort({ _id: 1 });
};

/**
 * Credit (amount > 0) or debit (amount < 0) a wallet exactly once for `key`.
 * @returns {{applied: boolean, duplicate: boolean, balance?: number}}
 */
const applyOnce = async ({ ownerId, ownerModel, amount, key, reason, referenceId, gatewayTransactionId = null }) => {
  if (!key) throw new Error('ledger key required');
  if (!Number.isFinite(amount) || amount === 0) return { applied: false, duplicate: false, balance: undefined };

  const wallet = await ensureWallet(ownerId, ownerModel);

  try {
    await WalletTransaction.create({
      walletId: wallet._id,
      type: amount > 0 ? 'credit' : 'debit',
      amount: Math.abs(amount),
      reason,
      referenceId: String(referenceId),
      gatewayTransactionId,
      idempotencyKey: key,
      status: 'pending'
    });
  } catch (err) {
    if (err && err.code === DUPLICATE) return { applied: false, duplicate: true };
    throw err;
  }

  const updated = await Wallet.findOneAndUpdate({ _id: wallet._id }, { $inc: { balance: amount } }, { new: true });
  const Model = EMBEDDED[ownerModel];
  if (Model) await Model.updateOne({ _id: ownerId }, { $inc: { 'wallet.balance': amount } });
  await WalletTransaction.updateOne({ idempotencyKey: key }, { $set: { status: 'completed' } });
  return { applied: true, duplicate: false, balance: updated.balance };
};

/**
 * Debit a wallet exactly once for `key`, but only if the balance covers the WHOLE amount (nothing moves otherwise).
 * The Wallet collection is the source of truth for the balance; a legacy balance that only exists on the account
 * document seeds a missing wallet, as the wallet screen does.
 * @returns {{applied: boolean, duplicate: boolean, insufficient?: boolean, balance?: number}}
 */
const debitIfEnough = async ({ ownerId, ownerModel, amount, key, reason, referenceId }) => {
  if (!key) throw new Error('ledger key required');
  if (!(Number.isFinite(amount) && amount > 0)) return { applied: false, duplicate: false };

  const Model = EMBEDDED[ownerModel];
  const legacy = Model ? Number((await Model.findById(ownerId).select('wallet.balance').lean())?.wallet?.balance) || 0 : 0;
  await Wallet.updateOne(
    { userId: ownerId, userModel: ownerModel },
    { $setOnInsert: { userId: ownerId, userModel: ownerModel, balance: legacy } },
    { upsert: true }
  ).catch((err) => { if (!err || err.code !== DUPLICATE) throw err; });
  const wallet = await Wallet.findOne({ userId: ownerId, userModel: ownerModel }).sort({ _id: 1 });

  try {
    await WalletTransaction.create({
      walletId: wallet._id, type: 'debit', amount, reason, referenceId: String(referenceId), idempotencyKey: key, status: 'pending'
    });
  } catch (err) {
    if (err && err.code === DUPLICATE) return { applied: false, duplicate: true };
    throw err;
  }

  const updated = await Wallet.findOneAndUpdate({ _id: wallet._id, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { new: true });
  if (!updated) {
    await WalletTransaction.updateOne({ idempotencyKey: key }, { $set: { status: 'failed' } });
    const fresh = await Wallet.findById(wallet._id).select('balance').lean();
    return { applied: false, duplicate: false, insufficient: true, balance: fresh ? fresh.balance : wallet.balance };
  }
  if (Model) await Model.updateOne({ _id: ownerId }, { $set: { 'wallet.balance': updated.balance } });
  await WalletTransaction.updateOne({ idempotencyKey: key }, { $set: { status: 'completed' } });
  return { applied: true, duplicate: false, balance: updated.balance };
};

/** Unified passbook row, written at most once per key (best effort, never blocks money movement). */
const recordPassbookOnce = async (key, doc) => {
  try {
    await Transaction.updateOne({ 'metadata.idempotencyKey': key }, { $setOnInsert: { ...doc, metadata: { ...(doc.metadata || {}), idempotencyKey: key } } }, { upsert: true });
  } catch (err) {
    if (!err || err.code !== DUPLICATE) console.warn('[ledger] passbook write failed:', err && err.message);
  }
};

/** Rows left `pending` longer than `olderThanMs` — money state needs a human/cron look. */
const reconcilePendingLedger = async (olderThanMs = 10 * 60 * 1000) =>
  WalletTransaction.find({ status: 'pending', createdAt: { $lt: new Date(Date.now() - olderThanMs) } }).lean();

module.exports = { applyOnce, debitIfEnough, recordPassbookOnce, reconcilePendingLedger, ensureWallet };

'use strict';

/**
 * Settlement, refund and parent-progress logic for independent-worker bookings.
 *
 * Design rules
 *  - every money movement goes through ledgerService (unique key, pending → atomic $inc → completed);
 *  - every state change is a guarded findOneAndUpdate, so the winner of a race is unambiguous;
 *  - everything is safe to retry: a crash leaves FAILED / stale PROCESSING which the same call re-claims.
 */

const crypto = require('crypto');
const WorkerBookingRequest = require('../models/WorkerBookingRequest');
const IndWorkerAssignment = require('../models/IndWorkerAssignment');
const IndWorkerExtension = require('../models/IndWorkerExtension');
const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const ledger = require('./ledgerService');

const STALE_PROCESSING_MS = 5 * 60 * 1000;
const toP = (inr) => Math.round(Number(inr) * 100);
const toINR = (p) => p / 100;
const audit = (event, actor, actorId, meta) => ({ at: new Date(), actor, actorId: actorId || null, event, meta: meta || null });

/** `refundAmount` historically defaults to null, and $inc cannot add to null. */
const addRefunded = async (parentId, amount, extra = {}) => {
  await WorkerBookingRequest.updateOne({ _id: parentId, refundAmount: null }, { $set: { refundAmount: 0 } });
  return WorkerBookingRequest.updateOne({ _id: parentId }, { $inc: { refundAmount: amount }, ...extra });
};

const emit = (room, event, payload) => {
  try { require('../sockets').getIO().to(room).emit(event, payload); } catch (_) { /* sockets are best-effort */ }
};

const isPaidOnline = (parent) =>
  ['success', 'paid', 'PAID', 'SUCCESS'].includes(parent.paymentStatus) && parent.paymentMethod !== 'cash';

// ── cash commission: deduct from wallet, remainder becomes dues, exactly once ────────────────────
const deductCashCommissionOnce = async ({ workerId, amount, key, referenceId }) => {
  if (!(amount > 0)) return { applied: false };
  const wallet = await ledger.ensureWallet(workerId, 'Worker');
  try {
    await WalletTransaction.create({
      walletId: wallet._id, type: 'debit', amount, reason: 'commission_deduction',
      referenceId: String(referenceId), idempotencyKey: key, status: 'pending'
    });
  } catch (err) {
    if (err && err.code === 11000) return { applied: false, duplicate: true };
    throw err;
  }
  // One atomic pipeline update: balance floors at 0 and whatever the wallet could not cover is added to dues.
  await Worker.updateOne({ _id: workerId }, [{
    $set: {
      outstandingDues: { $add: [{ $ifNull: ['$outstandingDues', 0] }, { $max: [0, { $subtract: [amount, { $ifNull: ['$wallet.balance', 0] }] }] }] },
      'wallet.balance': { $max: [0, { $subtract: [{ $ifNull: ['$wallet.balance', 0] }, amount] }] }
    }
  }]);
  await Wallet.updateOne({ _id: wallet._id }, [{ $set: { balance: { $max: [0, { $subtract: [{ $ifNull: ['$balance', 0] }, amount] }] } } }]);
  await WalletTransaction.updateOne({ idempotencyKey: key }, { $set: { status: 'completed' } });
  return { applied: true };
};

// ── time-based pay (HOURLY) ──────────────────────────────────────────────────────────────────────
/**
 * Price an HOURLY assignment by the time actually worked, once the worker stops: agreedRate (₹/hr) × minutes between
 * the Start OTP and Stop Work, less breaks, rounded up to the minute and never above the booked minutes. Paid-for
 * extensions keep their own gross/commission. The unused part of the farmer's prepayment comes back through
 * processBookingRefund (refund = reserve − gross actually earned). Safe to re-run: it always starts from the rate.
 * @returns {{ repriced: boolean, workedMinutes?: number, bookedMinutes?: number, assignment?: object }}
 */
const repriceHourlyByTime = async (assignmentId) => {
  const a = await IndWorkerAssignment.findById(assignmentId);
  if (!a || a.bookingType === 'DAILY' || a.bookingType === 'THEKA' || a.settlementStatus !== 'PENDING' || a.completionStatus !== 'PENDING') return { repriced: false };
  if (!a.workStartedAt || !(Number(a.agreedRate) > 0)) return { repriced: false };

  const parent = await WorkerBookingRequest.findById(a.parentRequestId).select('durationMinutes startTime endTime');
  if (!parent) return { repriced: false };

  const exts = await IndWorkerExtension.find({ status: 'CONFIRMED', 'workerExtensions.assignmentId': a._id });
  let extGrossP = 0; let extCommissionP = 0; let extMinutes = 0;
  for (const e of exts) {
    if (!(a.appliedExtensionIds || []).some(id => String(id) === String(e._id))) continue;
    const w = e.workerExtensions.find(x => String(x.assignmentId) === String(a._id) && x.status === 'ACCEPTED');
    if (!w) continue;
    extGrossP += toP(w.extensionGrossAmount || 0);
    extCommissionP += toP(w.extensionCommissionAmount || 0);
    extMinutes += Number(w.extensionMinutes || e.extensionMinutes || 0);
  }

  const { bookedMinutes } = require('../utils/workerBookingMath');
  const baseMinutes = Math.max(1, bookedMinutes(parent) - extMinutes);
  const end = a.workSubmittedAt || new Date();
  const elapsed = Math.ceil((end.getTime() - new Date(a.workStartedAt).getTime()) / 60000);
  const workedMinutes = Math.min(baseMinutes, Math.max(1, elapsed - (Number(a.breakDurationMinutes) || 0)));

  const baseGrossP = Math.round(toP(a.agreedRate) * (workedMinutes / 60));
  const baseCommissionP = Math.floor((baseGrossP * (a.commissionRate ?? 10)) / 100);
  const grossP = baseGrossP + extGrossP;
  const commissionP = baseCommissionP + extCommissionP;

  const updated = await IndWorkerAssignment.findOneAndUpdate(
    { _id: a._id, settlementStatus: 'PENDING', completionStatus: 'PENDING' },
    {
      $set: { grossAmount: toINR(grossP), commissionAmount: toINR(commissionP), netEarning: toINR(grossP - commissionP), workedMinutes },
      $push: { auditLog: audit('priced_by_time', 'system', null, { workedMinutes, baseMinutes, gross: toINR(grossP) }) }
    },
    { new: true }
  );
  return { repriced: !!updated, workedMinutes, bookedMinutes: baseMinutes, assignment: updated || a };
};

// ── cash bookings ────────────────────────────────────────────────────────────────────────────────
const isCashAssignment = (a, parent) => {
  const isOnlinePay = a.paymentMethod === 'qr_online' || a.paymentMethod === 'online' || a.isCashBooking === false;
  return !isOnlinePay && (Boolean(a.isCashBooking) || a.paymentMethod === 'cash' || (parent && parent.paymentMethod === 'cash'));
};

/** Who holds the cash and owes the app's share: the Team Leader for a team / offline member's job, else the worker. */
const resolveCashDebtor = async (a) => {
  if (a.teamLeaderId) return a.teamLeaderId;
  const workerDoc = await Worker.findById(a.workerId).select('name isOfflineMember managedByLeaderId');
  if (workerDoc?.isOfflineMember && workerDoc?.managedByLeaderId) return workerDoc.managedByLeaderId;
  return a.workerId;
};

const sumDays = (days, field) => (days || []).reduce((sum, d) => sum + toP(d[field] || 0), 0);

/**
 * Records one completed day of a DAILY cash booking: the cash received that day, the app commission and the platform
 * fee on it. Every write has its own idempotency key, so replaying a day (retry, or the final settlement catching up)
 * never records it twice.
 */
const applyCashDay = async (a, parent, entry) => {
  const key = `settle_assign_${a._id}_day${entry.dayNumber}`;
  const debtorId = await resolveCashDebtor(a);
  const forLeader = debtorId.toString() !== a.workerId.toString();
  const forJob = parent?.workTitle ? ` for ${parent.workTitle}` : '';
  const job = { assignmentId: String(a._id), workTitle: parent?.workTitle || null, dayNumber: entry.dayNumber };

  if (entry.cashAmount > 0) {
    await ledger.recordPassbookOnce(`${key}_cash`, {
      workerId: debtorId, type: 'cash_collected', amount: entry.cashAmount, status: 'completed', paymentMethod: 'cash',
      description: forLeader
        ? `Day ${entry.dayNumber} cash ₹${entry.cashAmount} received for team member${forJob}`
        : `Day ${entry.dayNumber} cash ₹${entry.cashAmount} received from the farmer${forJob}`,
      referenceId: key,
      metadata: { ...job, type: 'cash_received', workerAmount: entry.workerAmount, platformFee: entry.platformFee, memberId: a.workerId }
    });
  }
  if (entry.commission > 0) {
    await deductCashCommissionOnce({ workerId: debtorId, amount: entry.commission, key: `${key}_commission`, referenceId: a._id });
    await ledger.recordPassbookOnce(`${key}_commission`, {
      workerId: debtorId, type: 'commission_deduction', amount: entry.commission, status: 'completed', paymentMethod: 'cash',
      description: forLeader ? `App commission for team member's day ${entry.dayNumber}${forJob}` : `App commission on your day ${entry.dayNumber} pay${forJob}`,
      referenceId: key,
      metadata: { ...job, type: 'cash_collection_commission', grossAmount: entry.workerAmount, commissionAmount: entry.commission, memberId: a.workerId }
    });
  }
  if (entry.platformFee > 0) {
    await deductCashCommissionOnce({ workerId: debtorId, amount: entry.platformFee, key: `${key}_platform_fee`, referenceId: a._id });
    await ledger.recordPassbookOnce(`${key}_platform_fee`, {
      workerId: debtorId, type: 'platform_fee', amount: entry.platformFee, status: 'completed', paymentMethod: 'cash',
      description: forLeader ? `Platform fee collected from farmer for team member's day ${entry.dayNumber}${forJob}` : `Platform fee the farmer paid you in cash for day ${entry.dayNumber}${forJob}`,
      referenceId: key,
      metadata: { ...job, type: 'cash_collection_platform_fee', grossAmount: entry.workerAmount, platformFee: entry.platformFee, memberId: a.workerId }
    });
  }
  await require('./workerDuesService').syncDuesRestriction(debtorId);
  await IndWorkerAssignment.updateOne(
    { _id: a._id, 'cashDays.dayNumber': entry.dayNumber },
    { $set: { 'cashDays.$.status': 'DONE' } }
  );
  emit(`worker_${debtorId}`, 'wallet_balance_updated', { assignmentId: String(a._id), reason: 'cash_day', timestamp: new Date() });
  emit(`worker:${debtorId}`, 'wallet_balance_updated', { assignmentId: String(a._id), reason: 'cash_day', timestamp: new Date() });
};

/**
 * A day of a DAILY cash booking was just completed (End OTP): record that day's cash, commission and fee now, not at
 * the very end. Safe to call again for the same day. Any day missed here is picked up by the final settlement.
 * @returns {{ recorded: boolean, reason?: string }}
 */
const settleCashDay = async (assignmentId, dayNumber) => {
  const a = await IndWorkerAssignment.findById(assignmentId);
  if (!a || a.bookingType !== 'DAILY' || a.settlementStatus === 'SETTLED') return { recorded: false, reason: 'not_applicable' };
  const parent = await WorkerBookingRequest.findById(a.parentRequestId).select('paymentMethod paymentStatus financialSnapshot bookingType durationMinutes numberOfDays auditLog workTitle');
  if (!isCashAssignment(a, parent)) return { recorded: false, reason: 'not_cash' };
  // legacy cash / QR paths record their own cash entry at settlement
  if (a.cashPlatformFee !== null && a.cashPlatformFee !== undefined) return { recorded: false, reason: 'legacy' };

  const existing = (a.cashDays || []).find(d => d.dayNumber === dayNumber);
  if (existing) {
    if (existing.status !== 'DONE') await applyCashDay(a, parent, existing);
    return { recorded: true };
  }

  const { buildWorkerCashCollection } = require('./workerFinancialService');
  const exts = await IndWorkerExtension.find({ parentRequestId: a.parentRequestId, status: 'CONFIRMED' });
  const cash = buildWorkerCashCollection(a, parent, exts);
  const planned = (cash.schedule || [])[dayNumber - 1];
  if (!planned) return { recorded: false, reason: 'no_such_day' };

  const entry = { ...planned, status: 'PENDING', at: new Date() };
  // claim the day first (one winner), then do the writes; a crash in between is finished by the next call or the final settlement
  const claimed = await IndWorkerAssignment.findOneAndUpdate(
    { _id: a._id, settlementStatus: { $ne: 'SETTLED' }, 'cashDays.dayNumber': { $ne: dayNumber } },
    { $push: { cashDays: entry, auditLog: audit('cash_day_collected', 'system', null, { dayNumber, cash: entry.cashAmount }) } },
    { new: true }
  );
  if (!claimed) return { recorded: false, reason: 'already_claimed' };
  await applyCashDay(claimed, parent, entry);
  return { recorded: true };
};

// ── settle one assignment ────────────────────────────────────────────────────────────────────────
/**
 * Preconditions: completion OTP already verified. Safe to call concurrently / repeatedly.
 * @returns {{claimed: boolean, error?: Error, assignment: object}}
 */
const settleAssignment = async (assignmentId, { useStoredAmounts = false } = {}) => {
  const now = new Date();
  const a = await IndWorkerAssignment.findOneAndUpdate(
    {
      _id: assignmentId,
      assignmentStatus: 'CONFIRMED',
      completionStatus: 'OTP_VERIFIED',
      $or: [
        { settlementStatus: { $in: ['PENDING', 'FAILED'] } },
        { settlementStatus: 'PROCESSING', settlementClaimedAt: { $lt: new Date(now.getTime() - STALE_PROCESSING_MS) } }
      ]
    },
    { $set: { settlementStatus: 'PROCESSING', settlementClaimedAt: now } },
    { new: true }
  );
  if (!a) return { claimed: false, assignment: await IndWorkerAssignment.findById(assignmentId) };

  const key = `settle_assign_${a._id}`;
  try {
    const parent = await WorkerBookingRequest.findById(a.parentRequestId).select('paymentMethod paymentStatus financialSnapshot bookingType durationMinutes numberOfDays auditLog workTitle');
    const isCash = isCashAssignment(a, parent);

    let gross = a.grossAmount, commission = a.commissionAmount, net = a.netEarning;
    if (a.bookingType === 'DAILY' && !useStoredAmounts) {
      const { calculateDailyWorkerSettlement } = require('./workerFinancialService');
      const s = calculateDailyWorkerSettlement(a);
      gross = s.grossAmount; commission = s.commissionAmount; net = s.netEarning;
    }

    // passbook entries of one job share `metadata.assignmentId` so the worker's wallet can show them together
    const job = { assignmentId: String(a._id), workTitle: parent?.workTitle || null };
    const forJob = parent?.workTitle ? ` for ${parent.workTitle}` : '';

    let cashPlatformFee = null;
    let cashFeeLeft = 0;      // platform fee still to hand back at this settlement (earlier days of a DAILY job already did theirs)
    let commissionLeft = commission || 0; // likewise for the app commission
    if (isCash) {
      // Determine if this worker is an offline worker or part of a team job managed by a Team Leader
      const debtorId = await resolveCashDebtor(a);

      // The farmer paid the platform fee to the worker/leader in cash with the wages: give it back to the app, once.
      // (cashPlatformFee is pre-set to 0 by the legacy cash / QR paths, which record their own cash entry.)
      cashPlatformFee = a.cashPlatformFee;
      if (cashPlatformFee === null || cashPlatformFee === undefined) {
        const { buildWorkerCashCollection } = require('./workerFinancialService');
        const exts = await IndWorkerExtension.find({ parentRequestId: a.parentRequestId, status: 'CONFIRMED' });
        const cash = buildWorkerCashCollection(a, parent, exts, { grossOverride: gross });
        cashPlatformFee = cash.platformFee;
        // DAILY cash: earlier days were already recorded as they were completed. Finish any that were left half-done,
        // then record only what they have not covered, so the days add up to exactly the full amount.
        for (const day of (a.cashDays || [])) {
          if (day.status !== 'DONE') await applyCashDay(a, parent, day);
        }
        const hadDays = (a.cashDays || []).length > 0;
        const cashLeftP = Math.max(0, toP(cash.totalToCollect) - sumDays(a.cashDays, 'cashAmount'));
        commissionLeft = hadDays ? Math.max(0, toINR(toP(commission || 0) - sumDays(a.cashDays, 'commission'))) : (commission || 0);
        cashPlatformFee = cash.platformFee; // the total, stored on the assignment below
        cashFeeLeft = hadDays ? Math.max(0, toINR(toP(cash.platformFee) - sumDays(a.cashDays, 'platformFee'))) : cash.platformFee;
        // cash in hand is not wallet money: recorded for the cash collector (Team Leader if team/offline job, else worker)
        if (!hadDays || cashLeftP > 0) {
          await ledger.recordPassbookOnce(`${key}_cash`, {
            workerId: debtorId, type: 'cash_collected', amount: toINR(cashLeftP), status: 'completed', paymentMethod: 'cash',
            description: debtorId.toString() !== a.workerId.toString()
              ? `Cash ₹${toINR(cashLeftP)} received for team member${forJob}`
              : `Cash ₹${toINR(cashLeftP)} received from the farmer${forJob}`,
            referenceId: key,
            metadata: { ...job, type: 'cash_received', workerAmount: gross, platformFee: cashFeeLeft, memberId: a.workerId }
          });
        }
      } else {
        cashFeeLeft = cashPlatformFee;
      }

      // Deduct commission and platform fee from the debtor (Team Leader if team/offline job, else worker)
      await deductCashCommissionOnce({ workerId: debtorId, amount: commissionLeft, key: `${key}_commission`, referenceId: a._id });
      await ledger.recordPassbookOnce(`${key}_commission`, {
        workerId: debtorId, type: 'commission_deduction', amount: commissionLeft, status: 'completed', paymentMethod: 'cash',
        description: debtorId.toString() !== a.workerId.toString()
          ? `App commission for team member's job${forJob}`
          : `App commission on your pay${forJob}`,
        referenceId: key,
        metadata: { ...job, type: 'cash_collection_commission', grossAmount: gross, commissionAmount: commissionLeft, netEarning: net, memberId: a.workerId }
      });

      if (cashFeeLeft > 0) {
        await deductCashCommissionOnce({ workerId: debtorId, amount: cashFeeLeft, key: `${key}_platform_fee`, referenceId: a._id });
        await ledger.recordPassbookOnce(`${key}_platform_fee`, {
          workerId: debtorId, type: 'platform_fee', amount: cashFeeLeft, status: 'completed', paymentMethod: 'cash',
          description: debtorId.toString() !== a.workerId.toString()
            ? `Platform fee collected from farmer for team member${forJob}`
            : `Platform fee the farmer paid you in cash${forJob}`,
          referenceId: key,
          metadata: { ...job, type: 'cash_collection_platform_fee', grossAmount: gross, platformFee: cashFeeLeft, memberId: a.workerId }
        });
      }
      await require('./workerDuesService').syncDuesRestriction(debtorId);

      // Emit wallet update to the debtor (Team Leader)
      if (debtorId.toString() !== a.workerId.toString()) {
        emit(`worker_${debtorId}`, 'wallet_balance_updated', { assignmentId: String(a._id), reason: 'settlement', timestamp: new Date() });
        emit(`worker:${debtorId}`, 'wallet_balance_updated', { assignmentId: String(a._id), reason: 'settlement', timestamp: new Date() });
      }
    } else {
      // Online payment: if offline worker, credit earnings to the Team Leader so leader can disburse cash
      let recipientId = a.workerId;
      const targetWorker = await Worker.findById(a.workerId).select('name isOfflineMember managedByLeaderId');
      if (targetWorker?.isOfflineMember && (a.teamLeaderId || targetWorker?.managedByLeaderId)) {
        recipientId = a.teamLeaderId || targetWorker.managedByLeaderId;
      }

      // DAILY: earlier days were collected in cash and already settled (the worker kept that cash and paid the commission
      // and fee through the wallet), so only the part not covered by those days is credited now.
      const earlierDays = a.cashDays || [];
      const creditNet = earlierDays.length
        ? Math.max(0, toINR(toP(net) - earlierDays.reduce((sum, d) => sum + toP(d.workerAmount || 0) - toP(d.commission || 0), 0)))
        : net;
      const commissionNow = earlierDays.length ? Math.max(0, toINR(toP(commission || 0) - sumDays(earlierDays, 'commission'))) : commission;
      await ledger.applyOnce({ ownerId: recipientId, ownerModel: 'Worker', amount: creditNet, key: `${key}_credit`, reason: 'earnings_credit', referenceId: a._id });
      await ledger.recordPassbookOnce(`${key}_credit`, {
        workerId: recipientId, type: 'earnings_credit', amount: creditNet, status: 'completed', paymentMethod: 'wallet',
        description: recipientId.toString() !== a.workerId.toString()
          ? `Earnings for offline member ${targetWorker?.name || ''}${forJob} (after ₹${commissionNow} commission)`
          : `Earnings${forJob} (after ₹${commissionNow} app commission)`,
        referenceId: key,
        metadata: { ...job, grossAmount: gross, commissionAmount: commissionNow, netEarning: creditNet, memberId: a.workerId }
      });
      // Travel charge: paid in full on top of the earnings (no commission). Settlement only runs after the visit and
      // completion OTPs, so arrival is already confirmed.
      const travel = earlierDays.length
        ? Math.max(0, toINR(toP(a.travelCharge || 0) - sumDays(earlierDays, 'travelCharge')))
        : (Number(a.travelCharge) || 0);
      if (travel > 0) {
        await ledger.applyOnce({ ownerId: recipientId, ownerModel: 'Worker', amount: travel, key: `${key}_travel_credit`, reason: 'earnings_credit', referenceId: a._id });
        await ledger.recordPassbookOnce(`${key}_travel_credit`, {
          workerId: recipientId, type: 'earnings_credit', amount: travel, status: 'completed', paymentMethod: 'wallet',
          description: `Travel charge${forJob}${a.travelDistanceKm ? ` (${a.travelDistanceKm} km)` : ''}`,
          referenceId: key,
          metadata: { ...job, type: 'travel_charge', travelCharge: travel, distanceKm: a.travelDistanceKm, memberId: a.workerId }
        });
      }
      // money just landed in the wallet: pay any outstanding dues from it first
      await require('./workerDuesService').recoverDuesFromWallet({ workerId: recipientId, key: `${key}_dues_recovery`, referenceId: a._id });
      if (recipientId.toString() !== a.workerId.toString()) {
        emit(`worker_${recipientId}`, 'wallet_balance_updated', { assignmentId: String(a._id), reason: 'settlement', timestamp: new Date() });
        emit(`worker:${recipientId}`, 'wallet_balance_updated', { assignmentId: String(a._id), reason: 'settlement', timestamp: new Date() });
      }
    }

    const done = await IndWorkerAssignment.findOneAndUpdate(
      { _id: a._id, settlementStatus: 'PROCESSING' },
      {
        $set: {
          settlementStatus: 'SETTLED', assignmentStatus: 'COMPLETED', settledAt: new Date(), settlementTransactionId: key,
          grossAmount: gross, commissionAmount: commission, netEarning: net, workCompletedAt: a.workCompletedAt || new Date(),
          ...(isCash ? { cashPlatformFee } : {})
        },
        $push: { auditLog: audit('settled', 'system', null, { key, net, commission, cash: isCash, cashPlatformFee }) }
      },
      { new: true }
    );

    // the worker's wallet/dues just changed: let an open Wallet screen refresh
    emit(`worker_${a.workerId}`, 'wallet_balance_updated', { assignmentId: String(a._id), reason: 'settlement', timestamp: new Date() });
    emit(`worker:${a.workerId}`, 'wallet_balance_updated', { assignmentId: String(a._id), reason: 'settlement', timestamp: new Date() });

    // a worker who finishes goes back online — unless the account is suspended/inactive
    await Worker.updateOne({ _id: a.workerId, status: { $nin: ['suspended', 'inactive'] } }, { $set: { status: 'ONLINE' } });
    if (a.legacyBookingId) {
      // finalAmount follows what the job was really worth (extensions added, an hourly job priced by the time worked, days stopped early)
      const finalGross = Number((done || a).grossAmount);
      await Booking.updateOne({ _id: a.legacyBookingId }, { $set: { status: 'completed', settlementStatus: 'completed', completedAt: new Date(), paymentStatus: isCash ? 'collected_by_vendor' : 'success', ...(Number.isFinite(finalGross) && finalGross >= 0 ? { finalAmount: finalGross } : {}) } });
    }
    return { claimed: true, assignment: done || a };
  } catch (error) {
    console.error('[settleAssignment] failed (will be retried safely):', error);
    await IndWorkerAssignment.updateOne({ _id: a._id, settlementStatus: 'PROCESSING' }, { $set: { settlementStatus: 'FAILED' } });
    return { claimed: true, error, assignment: a };
  }
};

// ── parent progress (forward-only) ───────────────────────────────────────────────────────────────
const hasStarted = (a) =>
  a.visitOtpStatus === 'VERIFIED' || ['IN_PROGRESS', 'SUBMITTED'].includes(a.workStatus) ||
  (a.journeyStatus && a.journeyStatus !== 'NOT_STARTED') || (a.workedDays || 0) > 0;

/**
 * Derive in_progress / partially_completed / completed from the assignments and move the parent forward.
 * @returns {{ completedNow: boolean }} true only for the single caller that performed the → completed move.
 */
const syncParentProgress = async (parentId) => {
  const asg = await IndWorkerAssignment.find({ parentRequestId: parentId, assignmentStatus: { $ne: 'CANCELLED' } })
    .select('assignmentStatus settlementStatus visitOtpStatus workStatus journeyStatus workedDays').lean();
  if (asg.length === 0) return { completedNow: false };

  const settled = (a) => a.assignmentStatus === 'COMPLETED' && a.settlementStatus === 'SETTLED';
  const allDone = asg.every(settled);
  const anyDone = asg.some(settled);
  const anyStarted = asg.some(hasStarted);

  let target = null; let from = [];
  if (allDone) { target = 'completed'; from = ['confirmed', 'in_progress', 'partially_completed']; }
  else if (anyDone) { target = 'partially_completed'; from = ['confirmed', 'in_progress']; }
  else if (anyStarted) { target = 'in_progress'; from = ['confirmed']; }
  if (!target) return { completedNow: false };

  const moved = await WorkerBookingRequest.findOneAndUpdate(
    { _id: parentId, status: { $in: from } },
    { $set: { status: target, ...(target === 'completed' ? { completedAt: new Date() } : {}) }, $push: { auditLog: audit(`status_${target}`, 'system', null, null) } },
    { new: true }
  );
  // a cash booking's payment has been collected by the workers once every assignment is settled
  if (moved && target === 'completed' && moved.paymentMethod === 'cash' && moved.paymentStatus !== 'success') {
    await WorkerBookingRequest.updateOne({ _id: parentId }, { $set: { paymentStatus: 'success' } });
  }
  return { completedNow: !!moved && target === 'completed', request: moved };
};

// ── refunds ──────────────────────────────────────────────────────────────────────────────────────
const extensionTotals = async (assignmentId) => {
  const exts = await IndWorkerExtension.find({ status: 'CONFIRMED', 'workerExtensions.assignmentId': assignmentId });
  let gross = 0; let days = 0;
  for (const e of exts) {
    const w = e.workerExtensions.find(x => String(x.assignmentId) === String(assignmentId) && x.status === 'ACCEPTED');
    if (w) { gross += toP(w.extensionGrossAmount || 0); days += Number(w.additionalDays || 0); }
  }
  return { grossPaise: gross, days };
};

/** Gross the worker earned from the ORIGINAL booking (paid-for extensions are priced and paid separately). */
const baseActualPaise = async (a) => {
  const ext = await extensionTotals(a._id);
  if (a.bookingType === 'DAILY') {
    const baseDays = Math.max(0, (Number(a.bookedDays) || 1) - ext.days);
    return toP(a.agreedRate) * Math.min(Number(a.workedDays) || 0, baseDays);
  }
  return Math.max(0, toP(a.grossAmount) - ext.grossPaise);
};

const creditFarmerOnce = async ({ parent, amount, key, reason, description, meta }) => {
  const res = await ledger.applyOnce({
    ownerId: parent.farmerId, ownerModel: 'User', amount, key, reason: 'refund',
    referenceId: parent._id.toString(), gatewayTransactionId: parent.razorpayPaymentId || null
  });
  if (res.applied) {
    await ledger.recordPassbookOnce(key, {
      userId: parent.farmerId, type: 'refund', amount, status: 'completed', paymentMethod: 'wallet',
      description, referenceId: parent._id.toString(), metadata: { bookingId: parent._id.toString(), ...(meta || {}) }
    });
    emit(`user_${parent.farmerId}`, 'wallet_balance_updated', { balance: res.balance, refundAmount: amount, type: 'credit', message: description, timestamp: new Date() });
    emit(`user:${parent.farmerId}`, 'wallet_balance_updated', { balance: res.balance, refundAmount: amount, type: 'credit', message: description, timestamp: new Date() });
  }
  return res;
};

/**
 * Unused-reserve refund once every assignment is settled (HOURLY and DAILY).
 * refund = reserve − Σ(base gross actually earned) − what was already refunded early.
 * Platform fee is retained (unchanged policy). Idempotent via the ledger key; never throws into callers.
 */
const processBookingRefund = async (parentId) => {
  try {
    const parent = await WorkerBookingRequest.findById(parentId);
    if (!parent) return { success: false, message: 'Request not found' };
    if (!isPaidOnline(parent)) return { success: true, message: 'Cash booking - refund not applicable', refundAmount: 0 };

    const snap = parent.financialSnapshot;
    if (!snap || !snap.maximumWorkerAmount) return { success: false, message: 'No financial snapshot found' };

    const asg = await IndWorkerAssignment.find({ parentRequestId: parent._id, assignmentStatus: { $ne: 'CANCELLED' } });
    let actualPaise = 0;
    for (const a of asg) actualPaise += await baseActualPaise(a);

    const totalPaise = Math.max(0, toP(snap.maximumWorkerAmount) - actualPaise);
    const alreadyPaise = toP(parent.refundAmount || 0);
    const duePaise = totalPaise - alreadyPaise;
    if (duePaise <= 0) return { success: true, message: 'No refund due', refundAmount: 0 };

    const amount = toINR(duePaise);
    const bookingRef = parent.bookingNumber || require('../utils/bookingRef').requestRef(parent._id);
    const res = await creditFarmerOnce({
      parent, amount, key: `refund_${parent._id}_booking`, reason: 'refund',
      description: `Unused Reserve Refund for ${parent.workTitle || 'Worker'} Booking (#${bookingRef})`,
      meta: { actualWorkerTotal: toINR(actualPaise), maxWorkerTotal: snap.maximumWorkerAmount }
    });
    if (res.applied) {
      await addRefunded(parent._id, amount, { $set: { refundCredited: true, refundCreditedAt: new Date() }, $push: { auditLog: audit('reserve_refund', 'system', null, { amount }) } });
      try {
        const { createNotification } = require('../controllers/notificationControllers/notificationController');
        await createNotification({
          userId: parent.farmerId, type: 'refund', title: 'Refund Credited to Wallet!',
          message: `₹${amount} credited to your AgroYilt wallet. Workers finalized at ₹${toINR(actualPaise)} (Reserve: ₹${snap.maximumWorkerAmount}).`,
          relatedId: parent._id, relatedType: 'WorkerBookingRequest', priority: 'high', pushData: { type: 'refund', amount, link: '/user/wallet' }
        });
      } catch (e) { console.warn('[refund] notification failed:', e.message); }
    } else if (res.duplicate) {
      await WorkerBookingRequest.updateOne({ _id: parent._id }, { $set: { refundCredited: true } });
    }
    return { success: true, refundAmount: res.applied ? amount : 0, applied: res.applied };
  } catch (err) {
    // never lose a refund silently: it is retried by the periodic reconciler (see reconcileCompletedRefunds)
    console.error('[processBookingRefund] failed:', err);
    return { success: false, message: err.message };
  }
};

/** A worker ended early (decrease): give back the unworked days of the ORIGINAL booking right away. */
const refundUnusedDays = async (assignmentId) => {
  const a = await IndWorkerAssignment.findById(assignmentId);
  if (!a || a.bookingType !== 'DAILY') return { success: false };
  const parent = await WorkerBookingRequest.findById(a.parentRequestId);
  if (!parent || !isPaidOnline(parent)) return { success: true, refundAmount: 0 };

  const ext = await extensionTotals(a._id);
  const baseDays = Math.max(0, (Number(a.bookedDays) || 1) - ext.days);
  const unusedDays = Math.max(0, baseDays - (Number(a.workedDays) || 0));
  const amount = toINR(toP(a.agreedRate) * unusedDays);
  if (amount <= 0) return { success: true, refundAmount: 0 };

  const res = await creditFarmerOnce({
    parent, amount, key: `early_decrease_refund_${a._id}`, reason: 'refund',
    description: `Refund ₹${amount} for ${unusedDays} unused day(s) (worker schedule concluded early)`,
    meta: { type: 'early_decrease_refund', assignmentId: a._id.toString(), unusedDays }
  });
  if (res.applied) await addRefunded(parent._id, amount, { $push: { auditLog: audit('early_decrease_refund', 'system', null, { assignmentId: a._id, amount }) } });
  return { success: true, refundAmount: res.applied ? amount : 0 };
};

/** Reserve share of ONE worker (used when a not-yet-started worker is removed). */
const refundWorkerReserveShare = async (assignmentId, { actor = 'farmer', actorId = null } = {}) => {
  const a = await IndWorkerAssignment.findById(assignmentId);
  if (!a) return { success: false };
  const parent = await WorkerBookingRequest.findById(a.parentRequestId);
  if (!parent || !isPaidOnline(parent)) return { success: true, refundAmount: 0 };
  const snap = parent.financialSnapshot || {};
  const count = Number(snap.selectedWorkerCount) || (parent.selectedWorkerIds || []).length || 1;
  // new snapshots know each worker's own gross; older ones only the pooled reserve, shared equally
  const own = (snap.workerRates || []).find(r => String(r.workerId) === String(a.workerId));
  const amount = own && Number(own.grossAmount) > 0
    ? toINR(toP(own.grossAmount))
    : toINR(Math.round(toP(snap.maximumWorkerAmount || 0) / count));
  if (amount <= 0) return { success: true, refundAmount: 0 };
  const res = await creditFarmerOnce({
    parent, amount, key: `worker_removed_refund_${a._id}`, reason: 'refund',
    description: `Refund ₹${amount} for a worker removed before starting work`, meta: { type: 'worker_removed_refund', assignmentId: a._id.toString() }
  });
  if (res.applied) await addRefunded(parent._id, amount, { $push: { auditLog: audit('worker_removed_refund', actor, actorId, { assignmentId: a._id, amount }) } });
  return { success: true, refundAmount: res.applied ? amount : 0 };
};

/**
 * Safety net run by the scheduler: completed online bookings whose reserve refund never landed
 * (crash / transient error) and settlements stuck in FAILED / stale PROCESSING.
 */
const reconcile = async () => {
  const out = { refunds: 0, settlements: 0 };
  const stale = new Date(Date.now() - STALE_PROCESSING_MS);
  const stuck = await IndWorkerAssignment.find({
    assignmentStatus: 'CONFIRMED', completionStatus: 'OTP_VERIFIED',
    $or: [{ settlementStatus: 'FAILED' }, { settlementStatus: 'PROCESSING', settlementClaimedAt: { $lt: stale } }]
  }).select('_id parentRequestId').limit(100).lean();
  for (const s of stuck) {
    const r = await settleAssignment(s._id);
    if (r.claimed && !r.error) { out.settlements++; await finishParent(s.parentRequestId); }
  }
  const unrefunded = await WorkerBookingRequest.find({ status: 'completed', paymentMethod: 'online', refundCredited: { $ne: true } }).select('_id').limit(100).lean();
  for (const p of unrefunded) {
    const r = await processBookingRefund(p._id);
    if (r.applied) out.refunds++;
  }
  return out;
};

/** After a settlement: advance the parent, and (once, by the winner) pay out the reserve refund. */
const finishParent = async (parentId) => {
  const { completedNow, request } = await syncParentProgress(parentId);
  if (completedNow) {
    await processBookingRefund(parentId);
    emit(`booking_req:${parentId}`, 'booking_completed', { requestId: parentId, status: 'completed', serverTimestamp: new Date() });
    if (request) emit(`user_${request.farmerId}`, 'booking_completed', { bookingId: String(parentId), requestId: String(parentId), status: 'completed', serverTimestamp: new Date() });
  }
  return { completedNow };
};

module.exports = {
  addRefunded, repriceHourlyByTime, settleAssignment, settleCashDay, isCashAssignment, syncParentProgress, finishParent, processBookingRefund, refundUnusedDays, refundWorkerReserveShare,
  reconcile, creditFarmerOnce, isPaidOnline, deductCashCommissionOnce, audit, hasStarted, STALE_PROCESSING_MS
};

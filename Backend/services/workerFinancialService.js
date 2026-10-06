'use strict';

const mongoose = require('mongoose');
const Worker = require('../models/Worker');
const User = require('../models/User');
const Booking = require('../models/Booking');
const WorkerSettlement = require('../models/WorkerSettlement');
const WorkerPenalty = require('../models/WorkerPenalty');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');

/**
 * Worker Financial Service
 * Handles settlements, dues, penalties, canonical payment summary calculation,
 * and idempotent refund processing for Independent Workers.
 */

exports.getWorkerFinancialSettings = async () => {
  let settings = await Settings.findOne({ type: 'global' });
  if (!settings) {
    settings = await Settings.create({ type: 'global' });
  }
  return {
    workerCommissionPercentage:      settings.workerCommissionPercentage      ?? 10,
    workerPlatformChargePercentage:  settings.workerPlatformChargePercentage  ?? 1, // same default as models/Settings
    extensionExpiryMinutes:          settings.extensionExpiryMinutes          ?? 30,
    workerPenaltyEnabled:            settings.workerPenaltyEnabled            ?? false,
    workerPenaltyType:               settings.workerPenaltyType               ?? 'fixed',
    workerPenaltyAmount:             settings.workerPenaltyAmount             ?? 50,
    workerPenaltyPerMinute:          settings.workerPenaltyPerMinute          ?? 5,
    workerPenaltyFreeMinutes:        settings.workerPenaltyFreeMinutes        ?? 10,
    workerPenaltyMaxAmount:          settings.workerPenaltyMaxAmount          ?? 500,
    workerPenaltyPercentage:         settings.workerPenaltyPercentage         ?? 5,
    maxWorkerDues:                   settings.maxWorkerDues                   ?? 500,
    workerJourneyWindowMinutes:      settings.workerJourneyWindowMinutes      ?? 120,
    workerEarlyStartMinutes:         settings.workerEarlyStartMinutes         ?? 30,
    workerCashPaymentEnabled:        settings.workerCashPaymentEnabled        ?? true
  };
};

/**
 * Paise helpers (integer math, never float)
 * toP: INR -> paise; toINR: paise -> INR
 */
const toP   = (inr) => Math.round(Number(inr) * 100);
const toINR = (p)   => p / 100;

exports.calculateBookingCommission = async (grossAmount) => {
  const settings = await exports.getWorkerFinancialSettings();
  // Integer paise math to avoid floating-point error
  const grossPaise      = toP(grossAmount);
  const commissionPaise = Math.floor((grossPaise * settings.workerCommissionPercentage) / 100);
  const netPaise        = grossPaise - commissionPaise;

  return {
    commissionRate:   settings.workerCommissionPercentage,
    commissionAmount: toINR(commissionPaise),
    netAmount:        toINR(netPaise)
  };
};

/**
 * Canonical Farmer Payment Summary Builder
 * @param {Object} request - WorkerBookingRequest document
 * @param {Array} assignments - Array of IndWorkerAssignment documents
 * @param {Object} booking - Optional legacy Booking document
 */
exports.buildFarmerPaymentSummary = (request, assignments = [], booking = null, extensions = []) => {
  const snap = request?.financialSnapshot || {};
  const isDaily = request?.bookingType === 'DAILY';
  const selectedWorkerCount = Number(snap.selectedWorkerCount || request?.selectedWorkerIds?.length || request?.requiredWorkers || 1);
  const maxRatePerWorker = Number(
    snap.maximumBudget ||
    (isDaily
      ? (request?.maxDailyRate || request?.minDailyRate || request?.maxRate || request?.minRate)
      : (request?.maxRate || request?.minRate)) ||
    booking?.maxRate || booking?.agreedRate || booking?.totalAmount || 0
  );

  let durationHours = 1;
  let diffMinutes = 60;
  if (!isDaily) {
    if (request?.durationMinutes && Number(request.durationMinutes) > 0) {
      diffMinutes = Number(request.durationMinutes);
      durationHours = Math.max(1, Math.round(diffMinutes / 60));
    } else if (request?.startTime && request?.endTime) {
      const [sH, sM] = request.startTime.split(':').map(Number);
      const [eH, eM] = request.endTime.split(':').map(Number);
      if (!isNaN(sH) && !isNaN(eH)) {
        let dm = (eH * 60 + (eM || 0)) - (sH * 60 + (sM || 0));
        if (dm < 0) dm += 24 * 60;
        if (dm > 0) {
          diffMinutes = dm;
          durationHours = Math.max(1, Math.round(dm / 60));
        }
      }
    }
  }
  const days = isDaily ? (Number(request?.numberOfDays) || 1) : 1;

  const defaultReserve = isDaily
    ? Math.round(maxRatePerWorker * selectedWorkerCount * days)
    : Math.round(maxRatePerWorker * selectedWorkerCount * durationHours);

  const workerReserveAmount = Math.round(Number(snap.maximumWorkerAmount || defaultReserve));
  const platformChargeRate = Number(snap.platformChargeRate ?? 10);
  const platformFeeAmount = Number(
    snap.platformChargeAmount !== undefined && snap.platformChargeAmount !== null && snap.platformChargeAmount > 0
      ? snap.platformChargeAmount
      : Math.round((workerReserveAmount * platformChargeRate) / 100)
  );
  const totalPaidAmount = Math.round(Number(snap.totalPayable || (workerReserveAmount + platformFeeAmount) || booking?.farmerPaidAmount || booking?.totalAmount || 0));

  const validAssignments = (assignments && assignments.length > 0)
    ? assignments.filter(a => a && a.assignmentStatus !== 'CANCELLED')
    : [];

  const allSettled = validAssignments.length > 0 && validAssignments.every(a => a.settlementStatus === 'SETTLED');
  const isCompleted = request?.status === 'completed' || allSettled || booking?.status === 'work_done' || booking?.status === 'completed';

  // ── Confirmed Extensions Aggregation ──────────────────────────────────────
  const confirmedExts = (extensions || []).filter(e => e && e.status === 'CONFIRMED');
  const hasExtension = confirmedExts.length > 0;
  let totalExtensionMinutes = 0;
  let totalAdditionalDays = 0;
  let totalExtensionGrossAmount = 0;
  let totalExtensionPlatformFee = 0;
  let totalExtensionPaidAmount = 0;

  confirmedExts.forEach(ext => {
    if (ext.extensionMinutes) totalExtensionMinutes += Number(ext.extensionMinutes);
    if (ext.additionalDays) totalAdditionalDays += Number(ext.additionalDays);
    totalExtensionGrossAmount += Number(ext.totalServiceAmount || 0);
    totalExtensionPlatformFee += Number(ext.platformFeeAmount || 0);
    totalExtensionPaidAmount += Number(ext.totalPayableAmount || ext.totalPayable || (Number(ext.totalServiceAmount || 0) + Number(ext.platformFeeAmount || 0)));
  });

  const totalGrossAmount = validAssignments.length > 0
    ? validAssignments.reduce((sum, a) => sum + (Number(a.grossAmount) || Number(a.agreedRate) || 0), 0)
    : (booking?.workerGrossEarning || booking?.agreedRate || 0);

  const baseActualWorkerAmount = Math.max(0, Math.round((totalGrossAmount - totalExtensionGrossAmount) * 100) / 100);

  const extensionsSummary = {
    hasExtension,
    count: confirmedExts.length,
    totalExtensionMinutes,
    totalAdditionalDays,
    totalExtensionGrossAmount: Math.round(totalExtensionGrossAmount * 100) / 100,
    totalExtensionPlatformFee: Math.round(totalExtensionPlatformFee * 100) / 100,
    totalExtensionPaidAmount: Math.round(totalExtensionPaidAmount * 100) / 100,
    baseActualWorkerAmount,
    extensionWorkerAmount: Math.round(totalExtensionGrossAmount * 100) / 100,
    items: confirmedExts.map(ext => ({
      extensionId: ext._id,
      bookingType: ext.bookingType,
      extensionMinutes: ext.extensionMinutes,
      additionalDays: ext.additionalDays,
      serviceAmount: ext.totalServiceAmount,
      platformFeeAmount: ext.platformFeeAmount,
      totalPaid: ext.totalPayableAmount || ext.totalPayable,
      paymentReference: ext.razorpayPaymentId,
      paidAt: ext.paidAt || ext.updatedAt,
      workers: (ext.workerExtensions || [])
        .filter(w => w.status === 'ACCEPTED')
        .map(w => ({
          workerId: w.workerId?._id || w.workerId,
          workerName: w.workerId?.name || 'Worker',
          rate: w.agreedRate,
          extensionGrossAmount: w.extensionGrossAmount,
          extensionMinutes: w.extensionMinutes,
          additionalDays: w.additionalDays
        }))
    }))
  };

  let actualWorkerAmount = null;
  let unusedWorkerReserve = null;
  let refundAmount = null;
  let refundStatus = 'PENDING';

  const paymentStatusRaw = request?.paymentStatus || booking?.paymentStatus || 'pending';
  const isPaid = ['success', 'paid', 'PAID', 'SUCCESS'].includes(paymentStatusRaw);

  if (!isPaid) {
    refundStatus = 'NOT_ELIGIBLE';
  } else if (request?.refundCredited) {
    actualWorkerAmount = totalGrossAmount;
    unusedWorkerReserve = Math.max(0, workerReserveAmount - actualWorkerAmount);
    refundAmount = request.refundAmount != null ? request.refundAmount : unusedWorkerReserve;
    refundStatus = refundAmount > 0 ? 'REFUNDED' : 'NOT_ELIGIBLE';
  } else if (isCompleted) {
    actualWorkerAmount = totalGrossAmount;
    unusedWorkerReserve = Math.max(0, workerReserveAmount - actualWorkerAmount);
    refundAmount = request?.refundAmount != null ? request.refundAmount : unusedWorkerReserve;
    refundStatus = refundAmount > 0 ? (request?.refundCredited ? 'REFUNDED' : 'PENDING') : 'NOT_ELIGIBLE';
  } else {
    // In progress / pending completion: actual amounts are not finalized yet
    actualWorkerAmount = null;
    unusedWorkerReserve = null;
    refundAmount = null;
    refundStatus = 'PENDING';
  }

  return {
    selectedWorkerCount,
    maxRatePerWorker,
    bookingType: isDaily ? 'DAILY' : 'HOURLY',
    durationHours: !isDaily ? Number(durationHours.toFixed(2)) : null,
    durationMinutes: !isDaily ? diffMinutes : null,
    numberOfDays: isDaily ? days : null,
    workerReserveAmount,
    platformFeeAmount,
    totalPaidAmount,
    actualWorkerAmount,
    unusedWorkerReserve,
    refundAmount,
    refundStatus,
    paymentStatus: isPaid ? 'PAID' : (paymentStatusRaw ? paymentStatusRaw.toUpperCase() : 'PENDING'),
    paymentReference: request?.razorpayPaymentId || booking?.paymentId || null,
    currency: snap.currency || 'INR',
    bill: request ? exports.buildFarmerBill(request, validAssignments, confirmedExts, { isPaid, refundAmount, refundStatus }) : null,
    extensionsSummary
  };
};

/**
 * Canonical Worker Payment Summary Builder (Isolated per worker)
 * @param {Object} assignment - IndWorkerAssignment document
 * @param {Object} booking - Optional legacy Booking document
 * @param {Array} confirmedExtensions - Optional array of confirmed IndWorkerExtension docs
 */
exports.buildWorkerPaymentSummary = (assignment, booking = null, confirmedExtensions = []) => {
  if (!assignment && !booking) return null;

  const agreedRate = Number(assignment?.agreedRate ?? (booking?.agreedRate || booking?.workerOfferedRate || booking?.workerGrossEarning || booking?.totalAmount || 0));
  const rateUnit = assignment?.rateUnit || booking?.rateUnit || 'daily';
  const grossAmount = Number(assignment?.grossAmount ?? (booking?.workerGrossEarning || booking?.agreedRate || agreedRate));
  const commissionRate = Number(assignment?.commissionRate ?? (booking?.commissionRate || 10));
  const commissionAmount = Number(assignment?.commissionAmount ?? (booking?.commissionAmount || Math.round((grossAmount * commissionRate) / 100)));
  const netEarning = Number(assignment?.netEarning ?? (booking?.workerNetEarning || (grossAmount - commissionAmount)));

  let rawSettlementStatus = assignment?.settlementStatus || (booking?.settlementStatus === 'completed' ? 'SETTLED' : (booking?.status === 'work_done' || booking?.status === 'completed' ? 'SETTLED' : 'PENDING'));
  let settlementStatus = rawSettlementStatus ? rawSettlementStatus.toUpperCase() : 'PENDING';
  if (settlementStatus === 'COMPLETED') settlementStatus = 'SETTLED';

  const settlementTransactionId = assignment?.settlementTransactionId || (settlementStatus === 'SETTLED' ? `TXN-${(booking?._id || assignment?._id || '').toString().slice(-6).toUpperCase()}` : null);
  const settledAt = assignment?.settledAt || (settlementStatus === 'SETTLED' ? (assignment?.updatedAt || booking?.workDoneAt || booking?.updatedAt || null) : null);

  // ── Worker Extension Itemization ──────────────────────────────────────────
  const workerIdStr = (assignment?.workerId?._id || assignment?.workerId || booking?.workerId?._id || booking?.workerId || '').toString();

  let workerExtGross = 0;
  let workerExtCommission = 0;
  let workerExtNet = 0;
  let workerExtMinutes = 0;
  let workerExtDays = 0;
  const workerExtItems = [];

  (confirmedExtensions || []).forEach(ext => {
    if (ext && ext.status === 'CONFIRMED' && Array.isArray(ext.workerExtensions)) {
      const match = ext.workerExtensions.find(w => 
        (w.workerId?._id || w.workerId || '').toString() === workerIdStr && w.status === 'ACCEPTED'
      );
      if (match) {
        const gross = Number(match.extensionGrossAmount || 0);
        const comm = Number(match.extensionCommissionAmount || 0);
        const net = Number(match.extensionNetAmount || 0);
        const mins = Number(match.extensionMinutes || ext.extensionMinutes || 0);
        const days = Number(match.additionalDays || ext.additionalDays || 0);

        workerExtGross += gross;
        workerExtCommission += comm;
        workerExtNet += net;
        workerExtMinutes += mins;
        workerExtDays += days;

        workerExtItems.push({
          extensionId: ext._id,
          extensionMinutes: mins,
          additionalDays: days,
          agreedRate: match.agreedRate,
          rateUnit: match.rateUnit,
          grossAmount: gross,
          commissionAmount: comm,
          netAmount: net,
          confirmedAt: ext.paidAt || ext.updatedAt
        });
      }
    }
  });

  const hasExtension = workerExtGross > 0;
  const baseGrossAmount = Math.max(0, Math.round((grossAmount - workerExtGross) * 100) / 100);
  const baseCommissionAmount = Math.max(0, Math.round((commissionAmount - workerExtCommission) * 100) / 100);
  const baseNetEarning = Math.max(0, Math.round((netEarning - workerExtNet) * 100) / 100);

  const extensionBreakdown = {
    hasExtension,
    baseGrossAmount,
    baseCommissionAmount,
    baseNetEarning,
    extensionGrossAmount: Math.round(workerExtGross * 100) / 100,
    extensionCommissionAmount: Math.round(workerExtCommission * 100) / 100,
    extensionNetAmount: Math.round(workerExtNet * 100) / 100,
    extensionMinutes: workerExtMinutes,
    additionalDays: workerExtDays,
    items: workerExtItems
  };

  return {
    agreedRate,
    rateUnit,
    grossAmount,
    commissionRate,
    commissionAmount,
    netEarning,
    settlementStatus,
    settlementTransactionId,
    settledAt,
    extensionBreakdown
  };
};

const sumP = (items, pick) => items.reduce((sum, x) => sum + pick(x), 0);

/**
 * Booked length of a booking before any extension: its current minutes/days minus the extensions that were applied
 * to it (applyExtension moves the parent's endTime/durationMinutes/numberOfDays forward and logs `extension_applied`).
 */
const baseSchedule = (request, confirmedExtensions = []) => {
  const appliedIds = new Set((request?.auditLog || []).filter(a => a && a.event === 'extension_applied').map(a => String(a.meta?.extensionId)));
  const applied = confirmedExtensions.filter(e => (appliedIds.size ? appliedIds.has(String(e._id)) : true));
  if (request?.bookingType === 'DAILY') {
    const extDays = applied.reduce((s, e) => s + (Number(e.additionalDays) || 0), 0);
    return { minutes: null, days: Math.max(1, (Number(request?.numberOfDays) || 1) - extDays) };
  }
  const extMinutes = applied.reduce((s, e) => s + (Number(e.extensionMinutes) || 0), 0);
  return { minutes: Math.max(0, (Number(request?.durationMinutes) || 60) - extMinutes), days: null };
};

/**
 * Cash a worker collects from the farmer on a cash booking — the ONE place this is computed (worker screens, farmer
 * bill and settlement all use it). Per part of the job (the booked work, then each cash extension):
 *   amount = worker's pay + platform fee on that pay.
 * The worker keeps the cash and gives back platformFee + commission through the wallet at settlement.
 * `grossOverride` lets settlement price a DAILY job by the days actually worked.
 */
exports.buildWorkerCashCollection = (assignment, request, extensions = [], { grossOverride = null } = {}) => {
  if (!assignment) return null;
  const isDaily = assignment.bookingType === 'DAILY' || request?.bookingType === 'DAILY';
  const baseRate = Number(request?.financialSnapshot?.platformChargeRate) || 0;
  const assignmentId = String(assignment._id);
  const workerId = String(assignment.workerId?._id || assignment.workerId || '');
  const appliedIds = new Set((assignment.appliedExtensionIds || []).map(String));
  const confirmed = (extensions || []).filter(e => e && e.status === 'CONFIRMED');

  const extParts = [];
  for (const ext of confirmed) {
    if (appliedIds.size && !appliedIds.has(String(ext._id))) continue;
    const share = (ext.workerExtensions || []).find(w => w.status === 'ACCEPTED' &&
      (String(w.assignmentId) === assignmentId || String(w.workerId?._id || w.workerId) === workerId));
    if (!share) continue;
    const grossP = toP(share.extensionGrossAmount || 0);
    const rate = ext.platformFeeRate !== undefined && ext.platformFeeRate !== null ? Number(ext.platformFeeRate) : baseRate;
    extParts.push({
      extensionId: ext._id,
      minutes: isDaily ? null : Number(share.extensionMinutes || ext.extensionMinutes || 0),
      days: isDaily ? Number(share.additionalDays || ext.additionalDays || 0) : null,
      grossP,
      feeP: Math.round((grossP * rate) / 100),
      inCash: ext.paymentMode === 'cash'
    });
  }

  const grossP = toP(grossOverride ?? assignment.grossAmount ?? 0);
  const baseGrossP = Math.max(0, grossP - sumP(extParts, e => e.grossP));
  const baseFeeP = Math.round((baseGrossP * baseRate) / 100);
  const extDays = sumP(extParts, e => e.days || 0);
  const base = baseSchedule(request, confirmed);

  const lines = [
    {
      kind: 'booking',
      minutes: isDaily ? null : base.minutes,
      days: isDaily ? Math.max(1, (Number(assignment.bookedDays) || base.days || 1) - extDays) : null,
      workerAmount: toINR(baseGrossP), platformFee: toINR(baseFeeP), amount: toINR(baseGrossP + baseFeeP)
    },
    // an online-paid extension is not collected in cash (cash bookings only create cash extensions)
    ...extParts.filter(e => e.inCash).map(e => ({
      kind: 'extension', extensionId: e.extensionId, minutes: e.minutes, days: e.days,
      workerAmount: toINR(e.grossP), platformFee: toINR(e.feeP), amount: toINR(e.grossP + e.feeP)
    }))
  ];

  const totalP = sumP(lines, l => toP(l.amount));
  const feeP = sumP(lines, l => toP(l.platformFee));
  const commission = Number(assignment.commissionAmount) || 0;
  const platformFee = toINR(feeP);

  return {
    isCashBooking: true,
    totalToCollect: toINR(totalP),
    workerWage: toINR(grossP),
    platformFee,
    platformFeeRate: baseRate,
    commissionAmount: commission,
    netEarnings: Number(assignment.netEarning ?? (toINR(grossP) - commission)),
    walletDeduction: Math.round((platformFee + commission) * 100) / 100,
    lines,
    instruction: `Collect ₹${toINR(totalP)} cash from the farmer. After the job, the platform fee (₹${platformFee}) and app commission (₹${commission}) are taken from your wallet.`
  };
};

/**
 * What the farmer pays for ONE worker of a booking — the per-worker Booking record the farmer's booking list and
 * booking page show. Cash: exactly what that worker collects. Online: that worker's share of the booking payment
 * plus the online extensions that worker took.
 */
exports.buildFarmerAmountForWorker = (request, assignment, extensions = []) => {
  if (!request || !assignment) return null;
  if (request.paymentMethod === 'cash') {
    const cash = exports.buildWorkerCashCollection(assignment, request, extensions);
    const paid = assignment.settlementStatus === 'SETTLED' || assignment.completionStatus === 'OTP_VERIFIED';
    return { total: cash.totalToCollect, paymentMethod: 'cash', status: paid ? 'paid' : 'due' };
  }
  const snap = request.financialSnapshot || {};
  let totalP = Math.round(toP(snap.totalPayable || 0) / (Number(snap.selectedWorkerCount) || 1));
  for (const ext of (extensions || []).filter(e => e && e.status === 'CONFIRMED' && e.paymentMode !== 'cash')) {
    const share = (ext.workerExtensions || []).find(w => w.status === 'ACCEPTED' && String(w.assignmentId) === String(assignment._id));
    if (!share) continue;
    const grossP = toP(share.extensionGrossAmount || 0);
    totalP += grossP + Math.round((grossP * (Number(ext.platformFeeRate) || 0)) / 100);
  }
  const paid = ['success', 'paid', 'PAID', 'SUCCESS'].includes(request.paymentStatus);
  return { total: toINR(totalP), paymentMethod: 'online', status: paid ? 'paid' : 'due' };
};

/**
 * Batch version for booking lists: sets `farmerAmount` on each worker Booking (plain objects with workerRequestId).
 * Three queries for the whole page, whatever its size.
 */
exports.attachFarmerAmounts = async (bookings = []) => {
  const worker = bookings.filter(b => b && b.workerRequestId);
  if (!worker.length) return bookings;
  const WorkerBookingRequest = require('../models/WorkerBookingRequest');
  const IndWorkerAssignment = require('../models/IndWorkerAssignment');
  const IndWorkerExtension = require('../models/IndWorkerExtension');
  const ids = [...new Set(worker.map(b => String(b.workerRequestId)))];
  const [requests, assignments, extensions] = await Promise.all([
    WorkerBookingRequest.find({ _id: { $in: ids } }).select('financialSnapshot paymentMethod paymentStatus bookingType durationMinutes numberOfDays auditLog').lean(),
    IndWorkerAssignment.find({ parentRequestId: { $in: ids } }).lean(),
    IndWorkerExtension.find({ parentRequestId: { $in: ids }, status: 'CONFIRMED' }).lean()
  ]);
  const reqById = new Map(requests.map(r => [String(r._id), r]));
  for (const b of worker) {
    const pid = String(b.workerRequestId);
    const mine = assignments.filter(a => String(a.parentRequestId) === pid);
    const own = mine.find(a => String(a.legacyBookingId) === String(b._id))
      || mine.find(a => String(a.workerId) === String(b.workerId?._id || b.workerId));
    const amount = exports.buildFarmerAmountForWorker(reqById.get(pid), own, extensions.filter(e => String(e.parentRequestId) === pid));
    if (amount) b.farmerAmount = amount;
  }
  return bookings;
};

/**
 * What the farmer pays, line by line (the booked work, then each extension), and how: online (already paid) or
 * cash (paid to the workers at the end). On a cash booking every line is the sum of the workers' cash collections,
 * so the farmer's total always equals what the workers are told to collect.
 */
exports.buildFarmerBill = (request, assignments = [], extensions = [], { isPaid = false, refundAmount = null, refundStatus = null } = {}) => {
  if (!request) return null;
  const snap = request.financialSnapshot || {};
  const isDaily = request.bookingType === 'DAILY';
  const isCash = request.paymentMethod === 'cash';
  const rateUnit = isDaily ? 'daily' : 'hourly';
  const confirmed = (extensions || []).filter(e => e && e.status === 'CONFIRMED');
  const base = baseSchedule(request, confirmed);
  const active = (assignments || []).filter(a => a && a.parentRequestId && ['CONFIRMED', 'COMPLETED'].includes(a.assignmentStatus));
  const common = { paymentMethod: isCash ? 'cash' : 'online', bookingType: isDaily ? 'DAILY' : 'HOURLY', platformFeeRate: Number(snap.platformChargeRate) || 0 };

  if (isCash && active.length) {
    const workers = active.map(a => ({
      a,
      cash: exports.buildWorkerCashCollection(a, request, confirmed),
      paid: a.settlementStatus === 'SETTLED' || a.completionStatus === 'OTP_VERIFIED'
    }));
    const sumLines = (parts) => ({
      workerAmount: toINR(sumP(parts, l => toP(l.workerAmount))),
      platformFee: toINR(sumP(parts, l => toP(l.platformFee))),
      total: toINR(sumP(parts, l => toP(l.amount)))
    });
    const rates = [...new Set(active.map(a => Number(a.agreedRate) || 0))];
    const lines = [{
      kind: 'booking', minutes: base.minutes, days: base.days, workerCount: active.length,
      rate: rates.length === 1 ? rates[0] : null, rateUnit,
      ...sumLines(workers.map(w => w.cash.lines.find(l => l.kind === 'booking'))),
      payment: 'cash', status: workers.every(w => w.paid) ? 'paid' : 'due'
    }];
    for (const ext of confirmed) {
      const shares = workers
        .map(w => ({ w, line: w.cash.lines.find(l => l.kind === 'extension' && String(l.extensionId) === String(ext._id)) }))
        .filter(x => x.line);
      if (!shares.length) continue;
      lines.push({
        kind: 'extension', extensionId: ext._id,
        minutes: isDaily ? null : Number(ext.extensionMinutes) || 0, days: isDaily ? Number(ext.additionalDays) || 0 : null,
        workerCount: shares.length, rate: null, rateUnit,
        ...sumLines(shares.map(x => x.line)),
        payment: 'cash', status: shares.every(x => x.w.paid) ? 'paid' : 'due'
      });
    }
    const cashDueP = sumP(workers.filter(w => !w.paid), w => toP(w.cash.totalToCollect));
    const cashPaidP = sumP(workers.filter(w => w.paid), w => toP(w.cash.totalToCollect));
    return {
      ...common, lines,
      total: toINR(cashDueP + cashPaidP), paidOnline: 0, cashDue: toINR(cashDueP), cashPaid: toINR(cashPaidP),
      workers: workers.map(w => ({
        assignmentId: w.a._id, workerId: w.a.workerId?._id || w.a.workerId, workerName: w.a.workerId?.name || null,
        cashToPay: w.cash.totalToCollect, status: w.paid ? 'paid' : 'due'
      })),
      refund: null
    };
  }

  // Online booking (or a cash booking that has no workers yet): priced at the farmer's maximum rate, as charged.
  const lines = [{
    kind: 'booking', minutes: base.minutes, days: base.days,
    workerCount: Number(snap.selectedWorkerCount) || (request.selectedWorkerIds || []).length || 1,
    rate: Number(snap.maximumBudget) || null, rateUnit,
    workerAmount: Number(snap.maximumWorkerAmount) || 0, platformFee: Number(snap.platformChargeAmount) || 0,
    total: Number(snap.totalPayable) || toINR(toP(snap.maximumWorkerAmount || 0) + toP(snap.platformChargeAmount || 0)),
    payment: isCash ? 'cash' : 'online', status: !isCash && isPaid ? 'paid' : 'due'
  }];
  for (const ext of confirmed) {
    const extCash = ext.paymentMode === 'cash';
    lines.push({
      kind: 'extension', extensionId: ext._id,
      minutes: isDaily ? null : Number(ext.extensionMinutes) || 0, days: isDaily ? Number(ext.additionalDays) || 0 : null,
      workerCount: Number(ext.acceptedWorkerCount) || 0, rate: null, rateUnit,
      workerAmount: Number(ext.totalServiceAmount) || 0, platformFee: Number(ext.platformFeeAmount) || 0,
      total: Number(ext.totalPayable || ext.totalPayableAmount) || 0,
      payment: extCash ? 'cash' : 'online', status: !extCash && ext.paymentStatus === 'success' ? 'paid' : 'due'
    });
  }
  const totalP = sumP(lines, l => toP(l.total));
  const cashP = sumP(lines.filter(l => l.payment === 'cash'), l => toP(l.total));
  return {
    ...common, lines,
    total: toINR(totalP),
    paidOnline: toINR(sumP(lines.filter(l => l.payment === 'online' && l.status === 'paid'), l => toP(l.total))),
    cashDue: toINR(cashP), cashPaid: 0, workers: [],
    refund: isCash ? null : { amount: refundAmount, status: refundStatus }
  };
};

/**
 * Idempotent Farmer Wallet Refund Processor
 * Triggered at assignment completion/settlement stage when actual worker amounts are known.
 */
exports.processFarmerBookingRefund = async (parentRequestId) =>
  require('./workerSettlementService').processBookingRefund(parentRequestId);

/**
 * Adds amount to worker's outstanding dues. Restricts worker if max dues exceeded.
 */
exports.addWorkerDues = async (workerId, amount, session = null) => {
  const settings = await exports.getWorkerFinancialSettings();

  const worker = await Worker.findById(workerId).session(session);
  if (!worker) throw new Error('Worker not found');

  worker.outstandingDues += amount;

  if (worker.outstandingDues > settings.maxWorkerDues) {
    worker.isRestricted = true;
    worker.restrictionReason = `Outstanding dues (?${worker.outstandingDues}) exceeded allowed limit (?${settings.maxWorkerDues})`;
    worker.restrictedAt = new Date();
  }

  await worker.save({ session });
  return worker;
};

/**
 * Applies a penalty to a worker. Idempotent based on penaltyEventId.
 */
/**
 * Amount of an automatic penalty under the admin's rule (Admin → Settings → worker penalty):
 *   per_minute : (minutes late after the grace period) × ₹/min, capped — lateness only; any other event uses the flat amount
 *   percentage : % of the worker's pay for that job (flat amount if the pay is unknown)
 *   fixed      : the flat amount
 */
exports.computeWorkerPenalty = (settings, { grossAmount = 0, lateMinutes = null } = {}) => {
  const flat = Number(settings.workerPenaltyAmount) || 0;
  if (settings.workerPenaltyType === 'per_minute' && lateMinutes !== null) {
    return Math.min(Number(settings.workerPenaltyMaxAmount) || 500, Math.max(0, lateMinutes) * (Number(settings.workerPenaltyPerMinute) || 0));
  }
  if (settings.workerPenaltyType === 'percentage' && Number(grossAmount) > 0) {
    return Math.round(((Number(grossAmount) * (Number(settings.workerPenaltyPercentage) || 0)) / 100) * 100) / 100;
  }
  return flat;
};

/**
 * opts.amount — the exact amount (already priced by the caller, or typed by the admin)
 * opts.manual — an admin decision (dispute): applies even when automatic penalties are switched off
 */
exports.applyWorkerPenalty = async (workerId, bookingId, penaltyEventId, penaltyType, reason, opts = {}) => {
  const settings = await exports.getWorkerFinancialSettings();

  if (!settings.workerPenaltyEnabled && !opts.manual) return null;

  // Idempotency check
  const existingPenalty = await WorkerPenalty.findOne({ penaltyEventId });
  if (existingPenalty) return existingPenalty;

  let penaltyAmount = settings.workerPenaltyAmount;
  if (Number.isFinite(Number(opts.amount)) && Number(opts.amount) > 0) {
    // the caller already priced the penalty (per-minute / percentage of the assignment): use exactly that
    penaltyAmount = Number(opts.amount);
  } else if (settings.workerPenaltyType === 'percentage' && bookingId) {
    const booking = await Booking.findById(bookingId);
    if (booking && booking.workerGrossEarning) {
      penaltyAmount = (booking.workerGrossEarning * settings.workerPenaltyPercentage) / 100;
    }
  }

  penaltyAmount = Math.round(Number(penaltyAmount) * 100) / 100;

  // Claim the event first (unique penaltyEventId): a replay can never charge twice.
  try {
    await WorkerPenalty.create({
      workerId, bookingId, penaltyEventId, penaltyType, penaltyAmount, reason,
      walletDeducted: false, addedToDues: false, status: 'pending'
    });
  } catch (err) {
    if (err && err.code === 11000) return WorkerPenalty.findOne({ penaltyEventId });
    throw err;
  }

  // One atomic pipeline update decides wallet-vs-dues from the SAME document state it modifies.
  const maxDues = Number(settings.maxWorkerDues) || 0;
  const before = await Worker.findOneAndUpdate(
    { _id: workerId },
    [
      { $set: { _hadBal: { $gte: [{ $ifNull: ['$wallet.balance', 0] }, penaltyAmount] } } },
      {
        $set: {
          'wallet.balance': { $cond: ['$_hadBal', { $subtract: [{ $ifNull: ['$wallet.balance', 0] }, penaltyAmount] }, { $ifNull: ['$wallet.balance', 0] }] },
          outstandingDues: { $cond: ['$_hadBal', { $ifNull: ['$outstandingDues', 0] }, { $add: [{ $ifNull: ['$outstandingDues', 0] }, penaltyAmount] }] }
        }
      },
      {
        $set: {
          isRestricted: { $or: ['$isRestricted', { $and: [{ $not: ['$_hadBal'] }, { $gt: ['$outstandingDues', maxDues] }] }] }
        }
      },
      { $unset: '_hadBal' }
    ],
    { new: false }
  );
  if (!before) {
    await WorkerPenalty.updateOne({ penaltyEventId }, { $set: { status: 'failed' } });
    throw new Error('Worker not found');
  }
  const prevBalance = Number(before.wallet?.balance || 0);
  const walletDeducted = prevBalance >= penaltyAmount;

  await Transaction.create({
    workerId, bookingId: bookingId || null, type: 'penalty', amount: penaltyAmount, status: 'completed', paymentMethod: 'system',
    description: `Penalty for ${reason}`, referenceId: penaltyEventId,
    balanceBefore: prevBalance, balanceAfter: walletDeducted ? prevBalance - penaltyAmount : prevBalance,
    metadata: { idempotencyKey: `penalty_${penaltyEventId}`, walletDeducted }
  }).catch(e => { if (!e || e.code !== 11000) console.warn('[penalty] passbook failed:', e && e.message); });

  await WorkerPenalty.updateOne({ penaltyEventId }, { $set: { walletDeducted, addedToDues: !walletDeducted, status: 'applied' } });
  // a penalty the balance could not fully cover went to dues whole: let the balance pay what it can
  await require('./workerDuesService').recoverDuesFromWallet({ workerId, key: `penalty_${penaltyEventId}_dues_recovery`, referenceId: penaltyEventId });
  try {
    const io = require('../sockets').getIO();
    for (const room of [`worker_${workerId}`, `worker:${workerId}`]) io.to(room).emit('wallet_balance_updated', { reason: 'penalty', timestamp: new Date() });
  } catch (_) { /* sockets are best-effort */ }
  return WorkerPenalty.findOne({ penaltyEventId });
};

// ============================================================================
// DAILY BOOKING FINANCIAL FUNCTIONS
// ============================================================================

/**
 * Calculate DAILY worker settlement amounts (paise-based, idempotent).
 * Called after each day is completed; final settlement on last day.
 *
 * @param {Object} assignment - IndWorkerAssignment (DAILY)
 * @param {number} commissionRateOverride - optional, uses assignment.commissionRate if not supplied
 * @returns {{ grossAmount, commissionAmount, netEarning, workedDays }}
 */
exports.calculateDailyWorkerSettlement = (assignment, commissionRateOverride = null) => {
  const workedDays     = assignment.workedDays || 0;
  const agreedDailyRate = Number(assignment.agreedRate || 0);
  const commissionRate  = commissionRateOverride ?? assignment.commissionRate ?? 10;

  // Integer paise math
  const grossPaise      = toP(agreedDailyRate) * workedDays;
  const commissionPaise = Math.floor((grossPaise * commissionRate) / 100);
  const netPaise        = grossPaise - commissionPaise;

  return {
    workedDays,
    grossAmount:      toINR(grossPaise),
    commissionRate,
    commissionAmount: toINR(commissionPaise),
    netEarning:       toINR(netPaise)
  };
};

/**
 * Idempotent DAILY Farmer Wallet Refund Processor.
 * Triggered when all assignments for a DAILY booking are terminal.
 * Refunds unused reserve = (maxDailyRate x workers x days) - sum(actualWorkerGross).
 *
 * @param {string|ObjectId} parentRequestId
 * @returns {{ success, refundAmount, balance? }}
 */
exports.processDailyFarmerRefund = async (parentRequestId) =>
  require('./workerSettlementService').processBookingRefund(parentRequestId);

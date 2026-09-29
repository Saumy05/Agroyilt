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
    workerPlatformChargePercentage:  settings.workerPlatformChargePercentage  ?? 0,
    extensionExpiryMinutes:          settings.extensionExpiryMinutes          ?? 30,
    workerPenaltyEnabled:            settings.workerPenaltyEnabled            ?? false,
    workerPenaltyType:               settings.workerPenaltyType               ?? 'fixed',
    workerPenaltyAmount:             settings.workerPenaltyAmount             ?? 50,
    workerPenaltyPerMinute:          settings.workerPenaltyPerMinute          ?? 5,
    workerPenaltyFreeMinutes:        settings.workerPenaltyFreeMinutes        ?? 10,
    workerPenaltyMaxAmount:          settings.workerPenaltyMaxAmount          ?? 500,
    workerPenaltyPercentage:         settings.workerPenaltyPercentage         ?? 5,
    maxWorkerDues:                   settings.maxWorkerDues                   ?? 500,
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
      durationHours = diffMinutes / 60;
    } else if (request?.startTime && request?.endTime) {
      const [sH, sM] = request.startTime.split(':').map(Number);
      const [eH, eM] = request.endTime.split(':').map(Number);
      if (!isNaN(sH) && !isNaN(eH)) {
        let dm = (eH * 60 + (eM || 0)) - (sH * 60 + (sM || 0));
        if (dm < 0) dm += 24 * 60;
        if (dm > 0) {
          diffMinutes = dm;
          durationHours = dm / 60;
        }
      }
    }
  }
  const days = isDaily ? (Number(request?.numberOfDays) || 1) : 1;

  const defaultReserve = isDaily
    ? Math.round(maxRatePerWorker * selectedWorkerCount * days)
    : Math.round(maxRatePerWorker * selectedWorkerCount * durationHours);

  const workerReserveAmount = Number(snap.maximumWorkerAmount || defaultReserve);
  const platformChargeRate = Number(snap.platformChargeRate ?? 10);
  const platformFeeAmount = Number(
    snap.platformChargeAmount !== undefined && snap.platformChargeAmount !== null && snap.platformChargeAmount > 0
      ? snap.platformChargeAmount
      : Math.round(((workerReserveAmount * platformChargeRate) / 100) * 100) / 100
  );
  const totalPaidAmount = Number(snap.totalPayable || (workerReserveAmount + platformFeeAmount) || booking?.farmerPaidAmount || booking?.totalAmount || 0);

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

/**
 * Idempotent Farmer Wallet Refund Processor
 * Triggered at assignment completion/settlement stage when actual worker amounts are known.
 */
exports.processFarmerBookingRefund = async (parentRequestId) => {
  const WorkerBookingRequest = require('../models/WorkerBookingRequest');
  const IndWorkerAssignment = require('../models/IndWorkerAssignment');
  const IndWorkerExtension = require('../models/IndWorkerExtension');
  const Wallet = require('../models/Wallet');
  const WalletTransaction = require('../models/WalletTransaction');

  const request = await WorkerBookingRequest.findById(parentRequestId);
  if (!request) return { success: false, message: 'Request not found' };

  if (request.refundCredited) {
    return { success: true, message: 'Refund already credited', refundAmount: request.refundAmount };
  }

  const snap = request.financialSnapshot;
  if (!snap || !snap.maximumWorkerAmount) {
    return { success: false, message: 'No financial snapshot found' };
  }

  const assignments = await IndWorkerAssignment.find({
    parentRequestId: request._id,
    assignmentStatus: { $ne: 'CANCELLED' }
  });

  const maxWorkerTotal = snap.maximumWorkerAmount;
  const actualWorkerTotal = assignments.reduce((sum, a) => sum + (Number(a.grossAmount) || Number(a.agreedRate) || 0), 0);

  // Exclude separately paid extensions from actualWorkerTotal so reserve refund is not penalized
  let confirmedExtGross = 0;
  try {
    const confirmedExts = await IndWorkerExtension.find({
      parentRequestId: request._id,
      status: 'CONFIRMED'
    });
    confirmedExtGross = confirmedExts.reduce((sum, e) => sum + (Number(e.totalServiceAmount) || 0), 0);
  } catch (extErr) {
    console.warn('[processFarmerBookingRefund] Error fetching extensions:', extErr.message);
  }

  const baseActualWorkerTotal = Math.max(0, actualWorkerTotal - confirmedExtGross);
  const refundAmount = Math.max(0, maxWorkerTotal - baseActualWorkerTotal);

  if (refundAmount <= 0) {
    request.refundAmount = 0;
    request.refundCredited = false;
    await request.save();
    return { success: true, message: 'No refund due', refundAmount: 0 };
  }

  const refundKey = `refund_${request._id.toString()}_booking`;
  const existingRefund = await WalletTransaction.findOne({ idempotencyKey: refundKey });
  if (existingRefund) {
    request.refundAmount = refundAmount;
    request.refundCredited = true;
    request.refundCreditedAt = existingRefund.createdAt;
    await request.save();
    return { success: true, message: 'Refund already completed', refundAmount };
  }

  let farmerWallet = await Wallet.findOne({ userId: request.farmerId, userModel: 'User' });
  if (!farmerWallet) {
    farmerWallet = await Wallet.create({ userId: request.farmerId, userModel: 'User', balance: 0 });
  }

  const prevBalance = farmerWallet.balance || 0;
  farmerWallet.balance = prevBalance + refundAmount;
  await farmerWallet.save();

  // Sync embedded User model balance
  await User.findByIdAndUpdate(request.farmerId, { 'wallet.balance': farmerWallet.balance });

  const bookingRef = request.bookingNumber || `WRK-${request._id.toString().slice(-6).toUpperCase()}`;
  const refundDesc = `Unused Reserve Refund for ${request.workTitle || 'Worker'} Booking (#${bookingRef})`;

  // 1. Log in WalletTransaction
  await WalletTransaction.create({
    walletId: farmerWallet._id,
    type: 'credit',
    amount: refundAmount,
    reason: 'refund',
    referenceId: request._id.toString(),
    gatewayTransactionId: request.razorpayPaymentId || null,
    idempotencyKey: refundKey,
    status: 'completed'
  });

  // 2. Log in Transaction for unified passbook
  await Transaction.create({
    userId: request.farmerId,
    type: 'refund',
    amount: refundAmount,
    status: 'completed',
    paymentMethod: 'wallet',
    description: refundDesc,
    balanceBefore: prevBalance,
    balanceAfter: farmerWallet.balance,
    referenceId: request._id.toString(),
    metadata: {
      bookingId: request._id.toString(),
      bookingNumber: bookingRef,
      actualWorkerTotal,
      maxWorkerTotal
    }
  });

  request.refundAmount = refundAmount;
  request.refundCredited = true;
  request.refundCreditedAt = new Date();
  await request.save();

  console.log(`[REFUND IDEMPOTENT] Farmer ${request.farmerId} refunded Rs.${refundAmount}, New Balance: Rs.${farmerWallet.balance}`);

  // Emit real-time wallet update to Farmer socket room
  try {
    const { getIO } = require('../sockets');
    const io = getIO();
    if (io) {
      const socketPayload = {
        balance: farmerWallet.balance,
        refundAmount,
        type: 'credit',
        message: refundDesc,
        timestamp: new Date()
      };
      io.to(`user_${request.farmerId}`).emit('wallet_balance_updated', socketPayload);
      io.to(`user:${request.farmerId}`).emit('wallet_balance_updated', socketPayload);
      io.to(`user_${request.farmerId}`).emit('wallet_updated', socketPayload);
      io.to(`user:${request.farmerId}`).emit('wallet_updated', socketPayload);
    }
  } catch (sockErr) {
    console.warn('[REFUND SOCKET EMIT WARNING]:', sockErr.message);
  }

  try {
    const { createNotification } = require('../controllers/notificationControllers/notificationController');
    await createNotification({
      userId: request.farmerId,
      type: 'refund',
      title: 'Refund Credited to Wallet!',
      message: `₹${refundAmount} credited to your AgroYilt wallet. Workers finalized at ₹${actualWorkerTotal} (Reserve: ₹${maxWorkerTotal}).`,
      relatedId: request._id,
      relatedType: 'WorkerBookingRequest',
      priority: 'high',
      pushData: { type: 'refund', amount: refundAmount, link: '/user/wallet' }
    });
  } catch (notifErr) {
    console.warn('[REFUND NOTIF WARNING]:', notifErr.message);
  }

  return { success: true, message: 'Refund successfully credited', refundAmount, balance: farmerWallet.balance };
};

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
exports.applyWorkerPenalty = async (workerId, bookingId, penaltyEventId, penaltyType, reason) => {
  const settings = await exports.getWorkerFinancialSettings();

  if (!settings.workerPenaltyEnabled) return null;

  // Idempotency check
  const existingPenalty = await WorkerPenalty.findOne({ penaltyEventId });
  if (existingPenalty) return existingPenalty;

  let penaltyAmount = settings.workerPenaltyAmount;
  if (settings.workerPenaltyType === 'percentage' && bookingId) {
    const booking = await Booking.findById(bookingId);
    if (booking && booking.workerGrossEarning) {
      penaltyAmount = (booking.workerGrossEarning * settings.workerPenaltyPercentage) / 100;
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Determine how to apply penalty (deduct from wallet if balance > penalty, else add to dues)
    const worker = await Worker.findById(workerId).session(session);
    let walletDeducted = false;
    let addedToDues = false;

    if (worker.wallet.balance >= penaltyAmount) {
      worker.wallet.balance -= penaltyAmount;
      walletDeducted = true;

      // Ledger entry for wallet deduction
      await Transaction.create([{
        workerId,
        bookingId,
        type: 'penalty',
        amount: penaltyAmount,
        status: 'completed',
        paymentMethod: 'system',
        description: `Penalty for ${reason}`,
        referenceId: penaltyEventId,
        balanceBefore: worker.wallet.balance + penaltyAmount,
        balanceAfter: worker.wallet.balance
      }], { session });
    } else {
      worker.outstandingDues += penaltyAmount;
      addedToDues = true;

      if (worker.outstandingDues > settings.maxWorkerDues) {
        worker.isRestricted = true;
        worker.restrictionReason = `Outstanding dues (?${worker.outstandingDues}) exceeded limit due to penalty`;
        worker.restrictedAt = new Date();
      }
    }

    await worker.save({ session });

    const penalty = await WorkerPenalty.create([{
      workerId,
      bookingId,
      penaltyEventId,
      penaltyType,
      penaltyAmount,
      reason,
      walletDeducted,
      addedToDues,
      status: 'applied'
    }], { session });

    await session.commitTransaction();
    return penalty[0];
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
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
exports.processDailyFarmerRefund = async (parentRequestId) => {
  const WorkerBookingRequest = require('../models/WorkerBookingRequest');
  const IndWorkerAssignment  = require('../models/IndWorkerAssignment');
  const Wallet         = require('../models/Wallet');
  const WalletTransaction = require('../models/WalletTransaction');

  const request = await WorkerBookingRequest.findById(parentRequestId);
  if (!request) return { success: false, message: 'Request not found' };
  if (request.bookingType !== 'DAILY') return { success: false, message: 'Not a DAILY booking' };
  if (request.refundCredited) {
    return { success: true, message: 'Refund already credited', refundAmount: request.refundAmount };
  }

  const snap = request.financialSnapshot;
  if (!snap || !snap.maximumWorkerAmount) {
    return { success: false, message: 'No financial snapshot found' };
  }

  const assignments = await IndWorkerAssignment.find({
    parentRequestId: request._id,
    assignmentStatus: { $ne: 'CANCELLED' }
  });

  // Actual gross = sum of (agreedRate x workedDays) per assignment
  const actualWorkerTotal = assignments.reduce((sum, a) => {
    const days  = a.workedDays || 0;
    const rate  = Number(a.agreedRate || 0);
    return sum + toINR(toP(rate) * days);
  }, 0);

  const maxWorkerTotal = snap.maximumWorkerAmount;
  const refundAmount   = Math.max(0, toINR(toP(maxWorkerTotal) - toP(actualWorkerTotal)));

  if (refundAmount <= 0) {
    request.refundAmount   = 0;
    request.refundCredited = false;
    await request.save();
    return { success: true, message: 'No refund due', refundAmount: 0 };
  }

  const refundKey      = `daily_refund_${request._id.toString()}`;
  const existingRefund = await WalletTransaction.findOne({ idempotencyKey: refundKey });
  if (existingRefund) {
    request.refundAmount      = refundAmount;
    request.refundCredited    = true;
    request.refundCreditedAt  = existingRefund.createdAt;
    await request.save();
    return { success: true, message: 'Refund already completed', refundAmount };
  }

  let farmerWallet = await Wallet.findOne({ userId: request.farmerId, userModel: 'User' });
  if (!farmerWallet) {
    farmerWallet = await Wallet.create({ userId: request.farmerId, userModel: 'User', balance: 0 });
  }

  const prevBalance     = farmerWallet.balance || 0;
  farmerWallet.balance  = prevBalance + refundAmount;
  await farmerWallet.save();

  await User.findByIdAndUpdate(request.farmerId, { 'wallet.balance': farmerWallet.balance });

  const bookingRef  = request.bookingNumber || `WRK-${request._id.toString().slice(-6).toUpperCase()}`;
  const refundDesc  = `Unused Reserve Refund (DAILY) for ${request.workTitle || 'Worker'} Booking (#${bookingRef})`;

  await WalletTransaction.create({
    walletId:             farmerWallet._id,
    type:                 'credit',
    amount:               refundAmount,
    reason:               'refund',
    referenceId:          request._id.toString(),
    gatewayTransactionId: request.razorpayPaymentId || null,
    idempotencyKey:       refundKey,
    status:               'completed'
  });

  await Transaction.create({
    userId:        request.farmerId,
    type:          'refund',
    amount:        refundAmount,
    status:        'completed',
    paymentMethod: 'wallet',
    description:   refundDesc,
    balanceBefore: prevBalance,
    balanceAfter:  farmerWallet.balance,
    referenceId:   request._id.toString(),
    metadata: { bookingId: request._id.toString(), bookingNumber: bookingRef, actualWorkerTotal, maxWorkerTotal }
  });

  request.refundAmount     = refundAmount;
  request.refundCredited   = true;
  request.refundCreditedAt = new Date();
  await request.save();

  console.log(`[DAILY REFUND] Farmer ${request.farmerId} refunded Rs.${refundAmount}`);

  // Real-time wallet update
  try {
    const { getIO } = require('../sockets');
    const io = getIO();
    if (io) {
      const socketPayload = { balance: farmerWallet.balance, refundAmount, type: 'credit', message: refundDesc, timestamp: new Date() };
      io.to(`user_${request.farmerId}`).emit('wallet_balance_updated', socketPayload);
      io.to(`user:${request.farmerId}`).emit('wallet_balance_updated', socketPayload);
    }
  } catch (sockErr) { console.warn('[DAILY REFUND SOCKET]:', sockErr.message); }

  try {
    const { createNotification } = require('../controllers/notificationControllers/notificationController');
    await createNotification({
      userId:     request.farmerId,
      type:       'refund',
      title:      'Refund Credited to Wallet!',
      message:    `₹${refundAmount} credited for Daily Worker Booking (#${bookingRef}). Workers earned ₹${actualWorkerTotal} of ₹${maxWorkerTotal} reserve.`,
      relatedId:  request._id,
      relatedType:'WorkerBookingRequest',
      priority:   'high',
      pushData:   { type: 'refund', amount: refundAmount, link: '/user/wallet' }
    });
  } catch (notifErr) { console.warn('[DAILY REFUND NOTIF]:', notifErr.message); }

  return { success: true, message: 'DAILY refund successfully credited', refundAmount, balance: farmerWallet.balance };
};

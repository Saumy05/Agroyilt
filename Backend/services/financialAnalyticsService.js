'use strict';

const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const VendorBill = require('../models/VendorBill');
const WorkerSettlement = require('../models/WorkerSettlement');
const RegistrationFeePayment = require('../models/RegistrationFeePayment');
const Withdrawal = require('../models/Withdrawal');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Worker = require('../models/Worker');

/**
 * Normalized Financial Transaction Categories
 */
const FINANCIAL_CATEGORIES = {
  GROSS_CUSTOMER_PAYMENT: 'GROSS_CUSTOMER_PAYMENT',
  PLATFORM_FEE: 'PLATFORM_FEE',
  VENDOR_COMMISSION: 'VENDOR_COMMISSION',
  WORKER_COMMISSION: 'WORKER_COMMISSION',
  USER_FARMER_FEE: 'USER_FARMER_FEE',
  VENDOR_PLATFORM_FEE: 'VENDOR_PLATFORM_FEE',
  WORKER_PLATFORM_FEE: 'WORKER_PLATFORM_FEE',
  RECOGNIZED_REFUND: 'RECOGNIZED_REFUND',
  WITHDRAWAL: 'WITHDRAWAL',
  EARNINGS_CREDIT: 'EARNINGS_CREDIT',
  WORKER_PAYMENT: 'WORKER_PAYMENT',
  REFERRAL_REWARD: 'REFERRAL_REWARD',
  SETTLEMENT: 'SETTLEMENT',
  WALLET_TRANSFER: 'WALLET_TRANSFER',
  PENALTY: 'PENALTY',
  ADJUSTMENT: 'ADJUSTMENT',
  OTHER: 'OTHER'
};

/**
 * Paise Helpers (Integer Math to Prevent Floating-Point Inaccuracies)
 */
const toPaise = (inr) => Math.round(Number(inr || 0) * 100);
const toINR = (paise) => Math.round(Number(paise || 0)) / 100;

/**
 * Parse Canonical Date Range Filter
 * Supports: today, yesterday, last_7_days, last_30_days, this_month, previous_month, custom
 */
const getDateRangeFilter = (timeFilter = 'all', customStart, customEnd) => {
  const now = new Date();
  let start = null;
  let end = new Date(now);

  switch (timeFilter.toLowerCase()) {
    case 'today': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    }
    case 'yesterday': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      break;
    }
    case 'last_7_days': {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'last_30_days': {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'this_month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    }
    case 'previous_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    }
    case 'custom': {
      if (customStart) {
        start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
      }
      if (customEnd) {
        end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
      }
      break;
    }
    default: {
      if (customStart && customEnd) {
        start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
        end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
      }
      break;
    }
  }

  const query = {};
  if (start && end) {
    query.$gte = start;
    query.$lte = end;
  } else if (start) {
    query.$gte = start;
  } else if (end && timeFilter !== 'all') {
    query.$lte = end;
  }

  return {
    dateQuery: Object.keys(query).length > 0 ? query : null,
    startDate: start,
    endDate: end
  };
};

/**
 * Normalizes a Transaction document into its economic category & platform revenue contribution
 */
const classifyTransaction = (tx) => {
  const type = String(tx.type || '').toLowerCase();
  const desc = String(tx.description || '').toLowerCase();
  const status = String(tx.status || '').toLowerCase();
  const amount = Number(tx.amount || 0);

  let category = FINANCIAL_CATEGORIES.OTHER;
  let isRevenue = false;
  let isRefund = false;
  let isGrossPayment = false;
  let revenueImpact = 0; // Positive for revenue, negative for refund, 0 for neutral
  let role = 'user';

  if (tx.vendorId) role = 'vendor';
  else if (tx.workerId) role = 'worker';
  else if (tx.userId) role = 'user';

  switch (type) {
    case 'payment':
    case 'cash_collected':
    case 'ecommerce_full_payment': {
      category = FINANCIAL_CATEGORIES.GROSS_CUSTOMER_PAYMENT;
      isGrossPayment = status === 'completed';
      if (status === 'completed' && tx.metadata?.companyRevenue) {
        revenueImpact = Number(tx.metadata.companyRevenue) || 0;
      }
      break;
    }

    case 'commission': {
      if (role === 'vendor') {
        category = FINANCIAL_CATEGORIES.VENDOR_COMMISSION;
      } else if (role === 'worker') {
        category = FINANCIAL_CATEGORIES.WORKER_COMMISSION;
      } else {
        category = FINANCIAL_CATEGORIES.PLATFORM_FEE;
      }
      if (status === 'completed') {
        isRevenue = true;
        revenueImpact = amount;
      }
      break;
    }

    case 'platform_fee': {
      category = FINANCIAL_CATEGORIES.PLATFORM_FEE;
      if (status === 'completed') {
        isRevenue = true;
        revenueImpact = amount;
      }
      break;
    }

    case 'convenience_fee': {
      category = FINANCIAL_CATEGORIES.USER_FARMER_FEE;
      if (status === 'completed') {
        isRevenue = true;
        revenueImpact = amount;
      }
      break;
    }

    case 'penalty': {
      category = FINANCIAL_CATEGORIES.PENALTY;
      if (status === 'completed') {
        isRevenue = true;
        revenueImpact = amount;
      }
      break;
    }

    case 'refund': {
      category = FINANCIAL_CATEGORIES.RECOGNIZED_REFUND;
      if (status === 'completed') {
        isRefund = true;
        revenueImpact = -amount;
      }
      break;
    }

    case 'earnings_credit': {
      category = FINANCIAL_CATEGORIES.EARNINGS_CREDIT;
      break;
    }

    case 'worker_payment': {
      category = FINANCIAL_CATEGORIES.WORKER_PAYMENT;
      break;
    }

    case 'withdrawal': {
      category = FINANCIAL_CATEGORIES.WITHDRAWAL;
      break;
    }

    case 'referral_reward':
    case 'referral_reversal': {
      category = FINANCIAL_CATEGORIES.REFERRAL_REWARD;
      break;
    }

    case 'settlement': {
      category = FINANCIAL_CATEGORIES.SETTLEMENT;
      break;
    }

    case 'credit': {
      if (desc.includes('topup') || desc.includes('top-up') || desc.includes('wallet')) {
        category = FINANCIAL_CATEGORIES.WALLET_TRANSFER;
      } else if (desc.includes('reward')) {
        category = FINANCIAL_CATEGORIES.REFERRAL_REWARD;
      } else {
        category = FINANCIAL_CATEGORIES.OTHER;
      }
      break;
    }

    case 'debit': {
      category = FINANCIAL_CATEGORIES.WALLET_TRANSFER;
      break;
    }

    default:
      category = FINANCIAL_CATEGORIES.OTHER;
      break;
  }

  return {
    category,
    role,
    isRevenue,
    isRefund,
    isGrossPayment,
    revenueImpact: toINR(toPaise(revenueImpact))
  };
};

/**
 * Calculate Production-Ready Financial Revenue Analytics
 * Completely de-duplicated, paise-safe, and backed by immutable records.
 */
const getFinancialOverview = async ({
  timeFilter = 'all',
  startDate,
  endDate,
  role = 'all',
  status = 'all'
} = {}) => {
  const { dateQuery, startDate: start, endDate: end } = getDateRangeFilter(timeFilter, startDate, endDate);

  // Base Match Query for Transactions
  const txMatch = {};
  if (dateQuery) {
    txMatch.createdAt = dateQuery;
  }
  if (status && status !== 'all') {
    txMatch.status = status;
  }

  // Role filter on transaction
  if (role && role !== 'all') {
    if (role === 'user' || role === 'farmer') {
      txMatch.userId = { $ne: null };
    } else if (role === 'vendor') {
      txMatch.vendorId = { $ne: null };
    } else if (role === 'worker') {
      txMatch.workerId = { $ne: null };
    }
  }

  // 1. Transaction Model Aggregation
  // Calculate completed metrics using strict paise condition checks
  const txAggregation = await Transaction.aggregate([
    { $match: { ...txMatch, status: 'completed' } },
    {
      $group: {
        _id: null,
        // Gross Customer Payments (GMV - NOT REVENUE)
        grossCustomerPaymentsPaise: {
          $sum: {
            $cond: [
              { $in: ['$type', ['payment', 'cash_collected', 'ecommerce_full_payment']] },
              { $round: [{ $multiply: ['$amount', 100] }, 0] },
              0
            ]
          }
        },
        // Direct Platform Fees (ecommerce fees, convenience fees, penalties)
        directPlatformFeesPaise: {
          $sum: {
            $cond: [
              { $in: ['$type', ['platform_fee', 'convenience_fee', 'penalty']] },
              { $round: [{ $multiply: ['$amount', 100] }, 0] },
              0
            ]
          }
        },
        // Explicit Vendor Commissions logged in ledger
        explicitVendorCommissionPaise: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$type', 'commission'] },
                  { $ne: ['$vendorId', null] }
                ]
              },
              { $round: [{ $multiply: ['$amount', 100] }, 0] },
              0
            ]
          }
        },
        // Explicit Worker Commissions logged in ledger
        explicitWorkerCommissionPaise: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$type', 'commission'] },
                  { $ne: ['$workerId', null] }
                ]
              },
              { $round: [{ $multiply: ['$amount', 100] }, 0] },
              0
            ]
          }
        },
        // User/Farmer Convenience Fees & Penalties
        userFarmerConvenienceFeesPaise: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ['$type', ['convenience_fee', 'penalty']] },
                  { $ne: ['$userId', null] }
                ]
              },
              { $round: [{ $multiply: ['$amount', 100] }, 0] },
              0
            ]
          }
        },
        // Recognized Refunds (ONLY actual completed refunds)
        recognizedRefundsPaise: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'refund'] },
              { $round: [{ $multiply: ['$amount', 100] }, 0] },
              0
            ]
          }
        },
        // Completed Withdrawals (Liability outflow - NOT REVENUE / NOT REFUND)
        totalWithdrawalsPaise: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'withdrawal'] },
              { $round: [{ $multiply: ['$amount', 100] }, 0] },
              0
            ]
          }
        },
        // Referral Rewards (Marketing expense - NOT REVENUE)
        totalReferralRewardsPaise: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'referral_reward'] },
              { $round: [{ $multiply: ['$amount', 100] }, 0] },
              0
            ]
          }
        },
        // Vendor Earnings Credited (Liability credit - NOT REVENUE)
        vendorEarningsCreditedPaise: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'earnings_credit'] },
              { $round: [{ $multiply: ['$amount', 100] }, 0] },
              0
            ]
          }
        },
        // Worker Earnings Credited (Liability credit - NOT REVENUE)
        workerEarningsCreditedPaise: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'worker_payment'] },
              { $round: [{ $multiply: ['$amount', 100] }, 0] },
              0
            ]
          }
        }
      }
    }
  ]);

  const txData = txAggregation[0] || {};

  // 2. VendorBill Canonical Platform Revenue (Single Source of Truth for Vendor Commissions)
  const billMatch = { status: 'paid' };
  if (dateQuery) {
    billMatch.paidAt = dateQuery;
  }
  const billAggregation = await VendorBill.aggregate([
    { $match: billMatch },
    {
      $group: {
        _id: null,
        // Platform's earning excludes the GST it collects for the government
        companyRevenuePaise: { $sum: { $round: [{ $multiply: [{ $subtract: ['$companyRevenue', { $ifNull: ['$totalGST', 0] }] }, 100] }, 0] } },
        visitingChargesPaise: { $sum: { $round: [{ $multiply: ['$visitingCharges', 100] }, 0] } },
        totalGSTPaise: { $sum: { $round: [{ $multiply: ['$totalGST', 100] }, 0] } }
      }
    }
  ]);
  const billData = billAggregation[0] || {};

  // 3. WorkerSettlement Canonical Platform Revenue (Single Source of Truth for Worker Commissions)
  const workerSettlementMatch = { status: 'completed' };
  if (dateQuery) {
    workerSettlementMatch.createdAt = dateQuery;
  }
  const workerSettlementAggregation = await WorkerSettlement.aggregate([
    { $match: workerSettlementMatch },
    {
      $group: {
        _id: null,
        commissionAmountPaise: { $sum: { $round: [{ $multiply: ['$commissionAmount', 100] }, 0] } }
      }
    }
  ]);
  const workerData = workerSettlementAggregation[0] || {};

  // 4. RegistrationFeePayment (Platform fees for farmer/vendor/worker onboarding)
  const regFeeMatch = { status: 'PAID' };
  if (dateQuery) {
    regFeeMatch.paidAt = dateQuery;
  }
  if (role && role !== 'all') {
    const roleUpper = role.toUpperCase();
    if (roleUpper === 'FARMER' || roleUpper === 'USER') regFeeMatch.role = 'USER';
    else if (roleUpper === 'VENDOR') regFeeMatch.role = 'VENDOR';
    else if (roleUpper === 'WORKER') regFeeMatch.role = 'WORKER';
  }

  const regFeeAggregation = await RegistrationFeePayment.aggregate([
    { $match: regFeeMatch },
    {
      $group: {
        _id: '$role',
        totalPaise: { $sum: { $round: [{ $multiply: ['$amount', 100] }, 0] } }
      }
    }
  ]);

  let userRegistrationPaise = 0;
  let vendorRegistrationPaise = 0;
  let workerRegistrationPaise = 0;

  regFeeAggregation.forEach(item => {
    if (item._id === 'USER') userRegistrationPaise = item.totalPaise;
    else if (item._id === 'VENDOR') vendorRegistrationPaise = item.totalPaise;
    else if (item._id === 'WORKER') workerRegistrationPaise = item.totalPaise;
  });

  const totalRegistrationFeesPaise = userRegistrationPaise + vendorRegistrationPaise + workerRegistrationPaise;

  // 5. Canonical Multi-Source Normalization & Non-Overlapping Commission Consolidation
  // Use canonical bill totals or explicit ledger commission without double counting
  const vendorCommissionPaise = billData.companyRevenuePaise && billData.companyRevenuePaise > 0
    ? billData.companyRevenuePaise
    : (txData.explicitVendorCommissionPaise || 0);

  const workerCommissionPaise = workerData.commissionAmountPaise && workerData.commissionAmountPaise > 0
    ? workerData.commissionAmountPaise
    : (txData.explicitWorkerCommissionPaise || 0);

  // Platform Fees: direct platform fees + registration fees
  const totalPlatformFeesPaise = (txData.directPlatformFeesPaise || 0) + totalRegistrationFeesPaise;

  // Role Breakdown
  const userFarmerPlatformFeesPaise = (txData.userFarmerConvenienceFeesPaise || 0) + userRegistrationPaise;
  const vendorPlatformFeesPaise = vendorCommissionPaise + vendorRegistrationPaise;
  const workerPlatformFeesPaise = workerCommissionPaise + workerRegistrationPaise;

  // Recognized Platform Revenue = Vendor Commission + Worker Commission + Total Platform Fees
  const totalRecognizedRevenuePaise = vendorCommissionPaise + workerCommissionPaise + totalPlatformFeesPaise;

  // Recognized Refunds (Never includes withdrawals)
  const totalRefundsPaise = txData.recognizedRefundsPaise || 0;

  // Net Revenue = Total Recognized Revenue - Recognized Refunds
  const netRevenuePaise = totalRecognizedRevenuePaise - totalRefundsPaise;

  // Gross Customer Payments (GMV - NOT REVENUE)
  const grossCustomerPaymentsPaise = (txData.grossCustomerPaymentsPaise || 0) + totalRegistrationFeesPaise;

  return {
    success: true,
    data: {
      // Row 1: Core Recognition
      totalRevenue: toINR(totalRecognizedRevenuePaise),
      totalRefunds: toINR(totalRefundsPaise),
      netRevenue: toINR(netRevenuePaise),

      // Row 2: Breakdown & Gross Payments
      grossCustomerPayments: toINR(grossCustomerPaymentsPaise),
      totalPlatformFees: toINR(totalPlatformFeesPaise),
      totalCommission: toINR(vendorCommissionPaise + workerCommissionPaise),
      vendorCommission: toINR(vendorCommissionPaise),
      workerCommission: toINR(workerCommissionPaise),

      // Row 3: Role-Specific Platform Fees
      userFarmerPlatformFees: toINR(userFarmerPlatformFeesPaise),
      vendorPlatformFees: toINR(vendorPlatformFeesPaise),
      workerPlatformFees: toINR(workerPlatformFeesPaise),

      // Non-Revenue Liability / Expense Totals (Strictly Segregated)
      totalWithdrawals: toINR(txData.totalWithdrawalsPaise || 0),
      totalReferralRewards: toINR(txData.totalReferralRewardsPaise || 0),
      totalVendorEarningsCredited: toINR(txData.vendorEarningsCreditedPaise || 0),
      totalWorkerEarningsCredited: toINR(txData.workerEarningsCreditedPaise || 0),

      // Metadata
      filterMetadata: {
        timeFilter,
        startDate: start ? start.toISOString() : null,
        endDate: end ? end.toISOString() : null,
        role,
        status
      }
    }
  };
};

/**
 * Get Paginated Financial Transactions with Normalized Category Enrichment
 */
const getFinancialTransactions = async ({
  page = 1,
  limit = 10,
  search = '',
  timeFilter = 'all',
  startDate,
  endDate,
  role = 'all',
  status = 'all',
  category = 'all',
  type = 'all'
} = {}) => {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const query = {};

  // Date filtering
  const { dateQuery } = getDateRangeFilter(timeFilter, startDate, endDate);
  if (dateQuery) {
    query.createdAt = dateQuery;
  }

  // Status filtering
  if (status && status !== 'all') {
    query.status = status;
  }

  // Type filtering
  if (type && type !== 'all') {
    query.type = type;
  }

  // Role filtering
  if (role && role !== 'all') {
    if (role === 'user' || role === 'farmer') {
      query.userId = { $ne: null };
    } else if (role === 'vendor') {
      query.vendorId = { $ne: null };
    } else if (role === 'worker') {
      query.workerId = { $ne: null };
    }
  }

  // Search filtering
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');

    const [matchedUsers, matchedVendors, matchedWorkers, matchedBookings] = await Promise.all([
      User.find({ $or: [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }] }).select('_id'),
      Vendor.find({ $or: [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }, { businessName: searchRegex }] }).select('_id'),
      Worker.find({ $or: [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }] }).select('_id'),
      Booking.find({ bookingNumber: searchRegex }).select('_id')
    ]);

    const orConditions = [
      { referenceId: searchRegex },
      { description: searchRegex },
      { userId: { $in: matchedUsers.map(u => u._id) } },
      { vendorId: { $in: matchedVendors.map(v => v._id) } },
      { workerId: { $in: matchedWorkers.map(w => w._id) } },
      { bookingId: { $in: matchedBookings.map(b => b._id) } }
    ];

    if (search.trim().match(/^[0-9a-fA-F]{24}$/)) {
      orConditions.push({ _id: new mongoose.Types.ObjectId(search.trim()) });
    }

    query.$or = orConditions;
  }

  const [rawTransactions, total] = await Promise.all([
    Transaction.find(query)
      .populate('userId', 'name email phone')
      .populate('vendorId', 'name email phone businessName address')
      .populate('workerId', 'name email phone workerType skills address')
      .populate('bookingId', 'bookingNumber serviceName finalAmount status scheduledDate')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Transaction.countDocuments(query)
  ]);

  // Enrich with Financial Classification
  const enriched = rawTransactions.map(tx => {
    const classification = classifyTransaction(tx);
    return {
      ...tx,
      financialCategory: classification.category,
      financialRole: classification.role,
      isRevenue: classification.isRevenue,
      isRefund: classification.isRefund,
      isGrossPayment: classification.isGrossPayment,
      revenueImpact: classification.revenueImpact
    };
  });

  const filteredData = (category && category !== 'all')
    ? enriched.filter(item => item.financialCategory === category)
    : enriched;

  return {
    success: true,
    data: filteredData,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  };
};

/**
 * Backend Financial Health Check & Reconciliation Engine
 * Detects duplicate provider payments, unlinked refunds, and impossible balances.
 */
const reconcileFinancials = async () => {
  const anomalies = [];

  try {
    // 1. Check duplicate external referenceIds on completed payments
    const duplicates = await Transaction.aggregate([
      {
        $match: {
          referenceId: { $ne: null, $nin: ['', 'null'] },
          status: 'completed',
          type: { $in: ['payment', 'platform_fee', 'ecommerce_full_payment'] }
        }
      },
      {
        $group: {
          _id: '$referenceId',
          count: { $sum: 1 },
          transactionIds: { $push: '$_id' },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    if (duplicates.length > 0) {
      duplicates.forEach(dup => {
        anomalies.push({
          type: 'DUPLICATE_PAYMENT_REFERENCE',
          severity: 'HIGH',
          referenceId: dup._id,
          count: dup.count,
          message: `Reference ID ${dup._id} appears in ${dup.count} separate transactions with total ₹${dup.totalAmount}`,
          transactionIds: dup.transactionIds
        });
      });
    }

    // 2. Check refunds without parent booking or user
    const orphanRefunds = await Transaction.find({
      type: 'refund',
      status: 'completed',
      $or: [{ userId: null }, { amount: { $lte: 0 } }]
    }).limit(10).lean();

    if (orphanRefunds.length > 0) {
      orphanRefunds.forEach(ref => {
        anomalies.push({
          type: 'INVALID_ORPHAN_REFUND',
          severity: 'MEDIUM',
          transactionId: ref._id,
          message: `Refund of ₹${ref.amount} is missing user reference or has non-positive amount`
        });
      });
    }

    // 3. Check for negative amount anomalies
    const negativeAmounts = await Transaction.find({
      amount: { $lt: 0 }
    }).limit(10).lean();

    if (negativeAmounts.length > 0) {
      negativeAmounts.forEach(neg => {
        anomalies.push({
          type: 'NEGATIVE_AMOUNT_RECORDED',
          severity: 'CRITICAL',
          transactionId: neg._id,
          message: `Transaction record has negative amount: ₹${neg.amount}`
        });
      });
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      isHealthy: anomalies.length === 0,
      anomalyCount: anomalies.length,
      anomalies
    };
  } catch (error) {
    console.error('Reconciliation error:', error);
    return {
      success: false,
      isHealthy: false,
      error: error.message || 'Reconciliation failed'
    };
  }
};

module.exports = {
  FINANCIAL_CATEGORIES,
  toPaise,
  toINR,
  getDateRangeFilter,
  classifyTransaction,
  getFinancialOverview,
  getFinancialTransactions,
  reconcileFinancials
};

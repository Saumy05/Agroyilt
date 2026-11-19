const mongoose = require('mongoose');
const Vendor = require('../../models/Vendor');
const Worker = require('../../models/Worker');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const IncentiveRecord = require('../../models/IncentiveRecord');
const AdminAuditLog = require('../../models/AdminAuditLog');
const Booking = require('../../models/Booking');
const { notifySafe } = require('../../services/adminActionNotifier');

/**
 * Helper to resolve model and entity fields polymorphically
 */
const resolveEntityModel = (role) => {
  const normalized = (role || 'vendor').toLowerCase().trim();
  switch (normalized) {
    case 'vendor':
      return { Model: Vendor, roleName: 'Vendor', keyId: 'vendorId' };
    case 'worker':
      return { Model: Worker, roleName: 'Worker', keyId: 'workerId' };
    case 'user':
    case 'farmer':
      return { Model: User, roleName: 'User', keyId: 'userId' };
    default:
      return { Model: Vendor, roleName: 'Vendor', keyId: 'vendorId' };
  }
};

/**
 * Helper to get normalized balance, credits, and dues from an entity document
 */
const getEntityFinancials = (doc, role) => {
  const normRole = (role || 'vendor').toLowerCase();
  let walletBalance = 0;
  let dues = 0;
  let credits = doc.wallet?.credits || 0;
  let totalIncentivesEarned = doc.wallet?.totalIncentivesEarned || 0;

  if (normRole === 'vendor') {
    walletBalance = doc.wallet?.earnings ?? (doc.wallet?.balance || 0);
    dues = doc.wallet?.dues || 0;
  } else if (normRole === 'worker') {
    walletBalance = doc.wallet?.balance || 0;
    dues = doc.outstandingDues || 0;
  } else {
    walletBalance = doc.wallet?.balance || 0;
    dues = doc.outstandingDues || 0;
  }

  return {
    walletBalance,
    credits,
    dues,
    totalIncentivesEarned
  };
};

/**
 * 1. Get Wallet Balances list
 * GET /api/admin/wallets
 */
const getWalletBalances = async (req, res) => {
  try {
    const { role = 'vendor', page = 1, limit = 20, search = '', filterDue = 'false' } = req.query;
    const { Model, roleName } = resolveEntityModel(role);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let matchQuery = { isDeleted: { $ne: true } };

    // Search filter
    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: 'i' };
      matchQuery.$or = [
        { name: regex },
        { phone: regex },
        { email: regex }
      ];
      if (role.toLowerCase() === 'vendor') {
        matchQuery.$or.push({ businessName: regex });
      }
    }

    // Filter by entities that owe dues to admin
    if (filterDue === 'true') {
      if (role.toLowerCase() === 'vendor') {
        matchQuery['wallet.dues'] = { $gt: 0 };
      } else {
        matchQuery['outstandingDues'] = { $gt: 0 };
      }
    }

    const sortField = role.toLowerCase() === 'vendor' ? { 'wallet.dues': -1, createdAt: -1 } : { outstandingDues: -1, createdAt: -1 };

    const docs = await Model.find(matchQuery)
      .sort(sortField)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Model.countDocuments(matchQuery);

    const formattedList = docs.map(doc => {
      const fin = getEntityFinancials(doc, role);
      return {
        _id: doc._id,
        name: doc.name || 'Unnamed',
        phone: doc.phone || '',
        email: doc.email || '',
        businessName: doc.businessName || '',
        profilePhoto: doc.profilePhoto || null,
        role: roleName,
        walletBalance: fin.walletBalance,
        credits: fin.credits,
        dues: fin.dues,
        totalIncentivesEarned: fin.totalIncentivesEarned,
        cashLimit: doc.wallet?.cashLimit || 10000,
        isBlocked: doc.wallet?.isBlocked || false,
        isActive: doc.isActive !== false
      };
    });

    // Summary calculations
    let totalDuesSum = 0;
    let totalBalancesSum = 0;
    formattedList.forEach(item => {
      totalDuesSum += item.dues;
      totalBalancesSum += item.walletBalance;
    });

    res.status(200).json({
      success: true,
      role: roleName,
      data: formattedList,
      summary: {
        totalDuesSum,
        totalBalancesSum,
        totalCount: total
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[adminWalletController.getWalletBalances] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet balances'
    });
  }
};

/**
 * 2. Universal Wallet Adjustment (Matches Screen 1)
 * POST /api/admin/wallets/adjust
 * 
 * Target: 'wallet_balance' | 'cod_dues'
 * Action: 'credit' | 'debit'
 */
const adjustWallet = async (req, res) => {
  try {
    const {
      role = 'vendor',
      targetId,
      walletTarget, // 'wallet_balance' or 'cod_dues'
      actionType,   // 'credit' or 'debit'
      amount,
      reason,
      allowNegative = false
    } = req.body;

    if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ success: false, message: 'Valid Target ID is required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Adjustment amount must be a positive number greater than 0' });
    }

    if (!['wallet_balance', 'cod_dues'].includes(walletTarget)) {
      return res.status(400).json({ success: false, message: "Invalid walletTarget. Must be 'wallet_balance' or 'cod_dues'" });
    }

    if (!['credit', 'debit'].includes(actionType)) {
      return res.status(400).json({ success: false, message: "Invalid actionType. Must be 'credit' or 'debit'" });
    }

    const { Model, roleName, keyId } = resolveEntityModel(role);
    const entity = await Model.findById(targetId);

    if (!entity) {
      return res.status(404).json({ success: false, message: `${roleName} not found` });
    }

    const finBefore = getEntityFinancials(entity, role);
    let balanceBefore = 0;
    let balanceAfter = 0;
    let transactionType = '';
    let description = '';

    if (walletTarget === 'wallet_balance') {
      balanceBefore = finBefore.walletBalance;

      if (actionType === 'credit') {
        balanceAfter = balanceBefore + numAmount;
        transactionType = 'admin_adjustment_credit';
        description = `Admin Credit to Wallet Balance: ₹${numAmount.toLocaleString()}. Reason: ${reason || 'Manual Adjustment'}`;
      } else {
        // Debit
        if (balanceBefore < numAmount && !allowNegative) {
          return res.status(400).json({
            success: false,
            message: `Insufficient wallet balance (Current: ₹${balanceBefore.toFixed(2)}). Cannot deduct ₹${numAmount.toFixed(2)} without override.`
          });
        }
        balanceAfter = balanceBefore - numAmount;
        transactionType = 'admin_adjustment_debit';
        description = `Admin Debit from Wallet Balance: ₹${numAmount.toLocaleString()}. Reason: ${reason || 'Manual Adjustment'}`;
      }

      // Apply to entity
      if (!entity.wallet) entity.wallet = {};
      if (role.toLowerCase() === 'vendor') {
        entity.wallet.earnings = balanceAfter;
      } else {
        entity.wallet.balance = balanceAfter;
      }
    } else {
      // COD / Outstanding Dues
      balanceBefore = finBefore.dues;

      if (actionType === 'credit') {
        // Credit to dues means increasing the debt/dues owed
        balanceAfter = balanceBefore + numAmount;
        transactionType = 'admin_dues_credit';
        description = `Admin recorded added liability to COD Dues: ₹${numAmount.toLocaleString()}. Reason: ${reason || 'Manual Adjustment'}`;
      } else {
        // Debit from dues means clearing/reducing the debt
        balanceAfter = Math.max(0, balanceBefore - numAmount);
        transactionType = 'admin_dues_debit';
        description = `Admin cleared/reduced COD Dues by ₹${numAmount.toLocaleString()}. Reason: ${reason || 'Manual Adjustment'}`;
      }

      // Apply to entity
      if (role.toLowerCase() === 'vendor') {
        if (!entity.wallet) entity.wallet = {};
        entity.wallet.dues = balanceAfter;
      } else {
        entity.outstandingDues = balanceAfter;
      }
    }

    // Save entity update
    await entity.save();

    // Create Transaction record
    const transactionPayload = {
      type: transactionType,
      amount: numAmount,
      status: 'completed',
      paymentMethod: 'system',
      description,
      balanceBefore,
      balanceAfter,
      metadata: {
        adjustedByAdminId: req.user?._id || req.user?.id,
        adminName: req.user?.name || 'Super Admin',
        role: roleName,
        target: walletTarget,
        actionType,
        reason: reason || ''
      }
    };
    transactionPayload[keyId] = entity._id;

    const transaction = await Transaction.create(transactionPayload);

    // Write to Admin Audit Log
    await AdminAuditLog.log({
      adminId: req.user?._id || req.user?.id,
      adminName: req.user?.name || 'Super Admin',
      adminEmail: req.user?.email || 'admin@agroyilt.com',
      adminRole: req.user?.role || 'super_admin',
      action: `ADJUST_${roleName.toUpperCase()}_WALLET`,
      module: 'SETTLEMENT',
      targetId: entity._id,
      targetModel: roleName,
      targetName: entity.name,
      description: `${actionType.toUpperCase()} of ₹${numAmount} applied to ${walletTarget === 'wallet_balance' ? 'Wallet Balance' : 'COD Dues'} for ${roleName} ${entity.name}. Reason: ${reason || 'None'}`,
      metadata: {
        walletTarget,
        actionType,
        amount: numAmount,
        before: balanceBefore,
        after: balanceAfter,
        reason
      }
    });

    // Notify the user/vendor/worker (fire-and-forget to avoid blocking HTTP response on push)
    const notifyPayload = {
      type: 'wallet_adjustment',
      title: actionType === 'credit' ? '💰 Wallet Adjustment Added' : '📉 Wallet Adjustment Deducted',
      message: `An adjustment of ₹${numAmount.toLocaleString()} was ${actionType === 'credit' ? 'credited to' : 'deducted from'} your ${walletTarget === 'wallet_balance' ? 'wallet balance' : 'dues'}.${reason ? ` Reason: ${reason}` : ''}`,
      priority: 'high',
      skipPush: true
    };
    notifyPayload[keyId] = entity._id;
    notifySafe(notifyPayload).catch(() => {});

    const finAfter = getEntityFinancials(entity, role);

    res.status(200).json({
      success: true,
      message: `Successfully updated ${walletTarget === 'wallet_balance' ? 'Wallet Balance' : 'COD Dues'} for ${entity.name}`,
      data: {
        entityId: entity._id,
        name: entity.name,
        role: roleName,
        financials: finAfter,
        transaction
      }
    });
  } catch (error) {
    console.error('[adminWalletController.adjustWallet] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to adjust wallet: ' + error.message
    });
  }
};

/**
 * 3. Get Incentives Leaderboard / Period List (Matches Screen 2)
 * GET /api/admin/incentives
 */
const getIncentivesLeaderboard = async (req, res) => {
  try {
    const { role = 'vendor', page = 1, limit = 20, period = 'All Time', search = '' } = req.query;
    const { Model, roleName } = resolveEntityModel(role);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let matchQuery = { isDeleted: { $ne: true } };

    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: 'i' };
      matchQuery.$or = [
        { name: regex },
        { phone: regex }
      ];
      if (role.toLowerCase() === 'vendor') {
        matchQuery.$or.push({ businessName: regex });
      }
    }

    const docs = await Model.find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Model.countDocuments(matchQuery);

    // Compute metrics for each entity
    const items = await Promise.all(docs.map(async (doc) => {
      const fin = getEntityFinancials(doc, role);

      // Bookings count query
      let bookingQuery = { status: 'completed' };
      if (role.toLowerCase() === 'vendor') {
        bookingQuery.vendorId = doc._id;
      } else if (role.toLowerCase() === 'worker') {
        bookingQuery.workerId = doc._id;
      } else {
        bookingQuery.userId = doc._id;
      }

      const completedBookings = await Booking.countDocuments(bookingQuery);

      // Calculate total incentive awarded in this specific period
      let incentivePeriodQuery = {
        recipientId: doc._id,
        recipientModel: roleName
      };
      if (period && period !== 'All Time') {
        incentivePeriodQuery.period = period;
      }

      const incentiveRecords = await IncentiveRecord.find(incentivePeriodQuery).select('amount');
      const periodIncentiveTotal = incentiveRecords.reduce((sum, r) => sum + (r.amount || 0), 0);

      const rating = doc.rating?.average || doc.rating || (doc.ratingsAverage || 5.0);

      return {
        _id: doc._id,
        name: doc.name || 'Unnamed',
        phone: doc.phone || '',
        businessName: doc.businessName || '',
        profilePhoto: doc.profilePhoto || null,
        role: roleName,
        incentive: periodIncentiveTotal || (doc.wallet?.totalIncentivesEarned || 0),
        walletBalance: fin.walletBalance,
        dues: fin.dues,
        rating: rating ? Number(rating).toFixed(1) : '5.0',
        completedBookings: `${completedBookings} Completed`,
        completedBookingsCount: completedBookings
      };
    }));

    res.status(200).json({
      success: true,
      role: roleName,
      period,
      data: items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[adminWalletController.getIncentivesLeaderboard] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch incentives leaderboard'
    });
  }
};

/**
 * 4. Award Incentive (Matches Screen 2 Modal)
 * POST /api/admin/incentives/award
 */
const awardIncentive = async (req, res) => {
  try {
    const {
      role = 'vendor',
      targetId,
      amount,
      reason,
      period = 'All Time'
    } = req.body;

    if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ success: false, message: 'Valid Target ID is required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Incentive amount must be greater than 0' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason / remarks are required to award an incentive' });
    }

    const { Model, roleName, keyId } = resolveEntityModel(role);
    const entity = await Model.findById(targetId);

    if (!entity) {
      return res.status(404).json({ success: false, message: `${roleName} not found` });
    }

    const finBefore = getEntityFinancials(entity, role);
    const balanceBefore = finBefore.walletBalance;
    const balanceAfter = balanceBefore + numAmount;

    // Apply credit to entity wallet balance
    if (!entity.wallet) entity.wallet = {};
    if (role.toLowerCase() === 'vendor') {
      entity.wallet.earnings = balanceAfter;
    } else {
      entity.wallet.balance = balanceAfter;
    }
    entity.wallet.totalIncentivesEarned = (entity.wallet.totalIncentivesEarned || 0) + numAmount;

    await entity.save();

    // Create Transaction record
    const transactionType = role.toLowerCase() === 'worker' ? 'worker_incentive' : (role.toLowerCase() === 'user' ? 'user_incentive' : 'vendor_incentive');
    const transactionPayload = {
      type: transactionType,
      amount: numAmount,
      status: 'completed',
      paymentMethod: 'system',
      description: `Performance Incentive Awarded: ₹${numAmount.toLocaleString()}. Remarks: ${reason.trim()}`,
      balanceBefore,
      balanceAfter,
      metadata: {
        awardedByAdminId: req.user?._id || req.user?.id,
        adminName: req.user?.name || 'Super Admin',
        role: roleName,
        period,
        reason: reason.trim()
      }
    };
    transactionPayload[keyId] = entity._id;

    const transaction = await Transaction.create(transactionPayload);

    // Create IncentiveRecord snapshot
    const incentiveRecord = await IncentiveRecord.create({
      recipientId: entity._id,
      recipientModel: roleName,
      recipientName: entity.name,
      recipientPhone: entity.phone,
      amount: numAmount,
      reason: reason.trim(),
      period,
      metricsSnapshot: {
        completedBookings: 0,
        rating: 5.0,
        currentDues: finBefore.dues,
        walletBalance: balanceBefore
      },
      awardedBy: req.user?._id || req.user?.id,
      adminName: req.user?.name || 'Super Admin',
      transactionId: transaction._id,
      status: 'credited'
    });

    // Write to Admin Audit Log
    await AdminAuditLog.log({
      adminId: req.user?._id || req.user?.id,
      adminName: req.user?.name || 'Super Admin',
      adminEmail: req.user?.email || 'admin@agroyilt.com',
      adminRole: req.user?.role || 'super_admin',
      action: `AWARD_${roleName.toUpperCase()}_INCENTIVE`,
      module: 'VENDOR_MANAGEMENT',
      targetId: entity._id,
      targetModel: roleName,
      targetName: entity.name,
      description: `Awarded ₹${numAmount} incentive to ${roleName} ${entity.name}. Remarks: ${reason}`,
      metadata: {
        amount: numAmount,
        reason,
        period,
        balanceBefore,
        balanceAfter
      }
    });

    // Send high-priority notification to recipient (fire-and-forget)
    const notifyPayload = {
      type: 'incentive_awarded',
      title: '🎉 Performance Incentive Received!',
      message: `Congratulations! An incentive bonus of ₹${numAmount.toLocaleString()} has been credited to your wallet. Remarks: ${reason.trim()}`,
      priority: 'high',
      skipPush: true
    };
    notifyPayload[keyId] = entity._id;
    notifySafe(notifyPayload).catch(() => {});

    const finAfter = getEntityFinancials(entity, role);

    res.status(200).json({
      success: true,
      message: `Incentive of ₹${numAmount} awarded successfully to ${entity.name}`,
      data: {
        entityId: entity._id,
        name: entity.name,
        role: roleName,
        financials: finAfter,
        incentiveRecord,
        transaction
      }
    });
  } catch (error) {
    console.error('[adminWalletController.awardIncentive] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to award incentive: ' + error.message
    });
  }
};

/**
 * 5. Get Ledger / Transaction History for an entity
 * GET /api/admin/wallets/ledger/:role/:id
 */
const getWalletLedger = async (req, res) => {
  try {
    const { role, id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const { Model, roleName, keyId } = resolveEntityModel(role);

    const entity = await Model.findById(id).lean();
    if (!entity) {
      return res.status(404).json({ success: false, message: `${roleName} not found` });
    }

    const query = {};
    query[keyId] = entity._id;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Transaction.countDocuments(query);
    const fin = getEntityFinancials(entity, role);

    res.status(200).json({
      success: true,
      data: {
        entity: {
          _id: entity._id,
          name: entity.name,
          phone: entity.phone,
          businessName: entity.businessName || '',
          role: roleName,
          financials: fin
        },
        transactions
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[adminWalletController.getWalletLedger] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ledger'
    });
  }
};

module.exports = {
  getWalletBalances,
  adjustWallet,
  getIncentivesLeaderboard,
  awardIncentive,
  getWalletLedger
};

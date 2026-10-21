const Vendor = require('../../models/Vendor');
const Transaction = require('../../models/Transaction');
const Settlement = require('../../models/Settlement');
const Withdrawal = require('../../models/Withdrawal');
const mongoose = require('mongoose');
const { recordSettlement, recordWithdrawal } = require('../../services/earningTrackerService');
const withdrawalService = require('../../services/withdrawalService');
const { notifySafe } = require('../../services/adminActionNotifier');

/**
 * Get all vendors with their wallet balances
 */
const getVendorBalances = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, filterDue } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let matchQuery = { approvalStatus: 'approved' };
    if (search) {
      matchQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // If filtering by vendors who owe money
    if (filterDue === 'true') {
      matchQuery['wallet.dues'] = { $gt: 0 };
    }

    const vendors = await Vendor.find(matchQuery)
      .select('name businessName phone email wallet profilePhoto')
      .sort({ 'wallet.dues': -1 }) // Highest dues first
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Vendor.countDocuments(matchQuery);

    // Calculate total amount due to admin
    const totalDueResult = await Vendor.aggregate([
      { $match: { 'wallet.dues': { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$wallet.dues' } } }
    ]);

    const totalDueToAdmin = Math.abs(totalDueResult[0]?.total || 0);

    // Format vendor data
    const vendorData = vendors.map(v => ({
      _id: v._id,
      name: v.name,
      businessName: v.businessName,
      phone: v.phone,
      email: v.email,
      profilePhoto: v.profilePhoto,
      dues: v.wallet?.dues || 0,
      earnings: v.wallet?.earnings || 0,
      amountDue: v.wallet?.dues || 0,
      balance: (v.wallet?.earnings || 0) - (v.wallet?.dues || 0), // Net for reference
      totalCashCollected: v.wallet?.totalCashCollected || 0,
      cashLimit: v.wallet?.cashLimit || 10000,
      isBlocked: v.wallet?.isBlocked || false
    }));

    res.status(200).json({
      success: true,
      data: vendorData,
      summary: {
        totalDueToAdmin,
        vendorsWithDue: await Vendor.countDocuments({ 'wallet.dues': { $gt: 0 } })
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get vendor balances error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor balances'
    });
  }
};

/**
 * Get specific vendor's ledger/transactions
 */
const getVendorLedger = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 50, type } = req.query;

    const vendor = await Vendor.findById(vendorId)
      .select('name businessName phone wallet');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const query = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (type) query.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('bookingId', 'bookingNumber serviceName');

    const total = await Transaction.countDocuments(query);

    res.status(200).json({
      success: true,
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        businessName: vendor.businessName,
        phone: vendor.phone,
        phone: vendor.phone,
        dues: vendor.wallet?.dues || 0,
        earnings: vendor.wallet?.earnings || 0,
        amountDue: vendor.wallet?.dues || 0
      },
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get vendor ledger error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor ledger'
    });
  }
};

/**
 * Get all pending settlement requests
 */
const getPendingSettlements = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const settlements = await Settlement.find({ status: 'pending' })
      .populate('vendorId', 'name businessName phone profilePhoto wallet.balance')
      .sort({ createdAt: 1 }) // Oldest first
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Settlement.countDocuments({ status: 'pending' });

    // Calculate total pending settlement amount
    const totalPending = await Settlement.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.status(200).json({
      success: true,
      data: settlements,
      summary: {
        totalPendingAmount: totalPending[0]?.total || 0,
        pendingCount: total
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get pending settlements error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending settlements'
    });
  }
};

/**
 * Approve settlement request
 */
const approveSettlement = async (req, res) => {
  try {
    const { settlementId } = req.params;
    const { adminNotes } = req.body;
    const adminId = req.user.id;

    const settlement = await Settlement.findById(settlementId);
    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: 'Settlement not found'
      });
    }

    if (settlement.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Settlement is not in pending status'
      });
    }

    const vendor = await Vendor.findById(settlement.vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    const currentDues = vendor.wallet?.dues || 0;

    // Settlement reduces DUES
    // Ensure we don't go below zero (though validation handles request)
    vendor.wallet.dues = Math.max(0, currentDues - settlement.amount);

    // Auto-unblock if dues drop below limit
    let unblocked = false;
    if (vendor.wallet.isBlocked && vendor.wallet.dues <= (vendor.wallet.cashLimit || 10000)) {
      unblocked = true;
      vendor.wallet.isBlocked = false;
      vendor.wallet.blockedAt = null;
      vendor.wallet.blockReason = null;
    }

    await vendor.save();

    // Update settlement
    settlement.status = 'approved';
    settlement.processedBy = adminId;
    settlement.processedAt = new Date();
    settlement.adminNotes = adminNotes;
    settlement.balanceAfter = vendor.wallet.dues;
    // Send Dues Payment (Settlement) Email
    const { sendDuesPaymentApprovedEmail } = require('../../services/emailService');
    sendDuesPaymentApprovedEmail(vendor, settlement.amount, vendor.wallet.dues).catch(e => console.error(e));

    await settlement.save();

    // Record this settlement in the earning tracker
    recordSettlement(new Date(), settlement.amount);

    await notifySafe({
      vendorId: vendor._id, type: 'settlement_approved', relatedId: settlement._id, relatedType: 'settlement',
      title: 'Settlement approved',
      message: `Your settlement of ₹${settlement.amount} was approved. Dues left: ₹${vendor.wallet.dues}.${unblocked ? ' Your account is active again and you can take bookings.' : ''}`
    });

    res.status(200).json({
      success: true,
      message: 'Settlement approved successfully',
      data: {
        settlement,
        newDues: vendor.wallet.dues
      }
    });
  } catch (error) {
    console.error('Approve settlement error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve settlement'
    });
  }
};

/**
 * Reject settlement request
 */
const rejectSettlement = async (req, res) => {
  try {
    const { settlementId } = req.params;
    const { rejectionReason } = req.body;
    const adminId = req.user.id;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const settlement = await Settlement.findById(settlementId);
    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: 'Settlement not found'
      });
    }

    if (settlement.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Settlement is not in pending status'
      });
    }

    settlement.status = 'rejected';
    settlement.processedBy = adminId;
    settlement.processedAt = new Date();
    settlement.rejectionReason = rejectionReason;
    await settlement.save();

    await notifySafe({
      vendorId: settlement.vendorId, type: 'settlement_rejected', relatedId: settlement._id, relatedType: 'settlement',
      title: 'Settlement not approved',
      message: `Your settlement of ₹${settlement.amount} was not approved. Reason: ${rejectionReason}`
    });

    res.status(200).json({
      success: true,
      message: 'Settlement rejected',
      data: settlement
    });
  } catch (error) {
    console.error('Reject settlement error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject settlement'
    });
  }
};

/**
 * Get settlement history (all statuses)
 */
const getSettlementHistory = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, vendorId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (status) query.status = status;
    if (vendorId) query.vendorId = vendorId;

    const settlements = await Settlement.find(query)
      .populate('vendorId', 'name businessName phone')
      .populate('processedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Settlement.countDocuments(query);

    res.status(200).json({
      success: true,
      data: settlements,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get settlement history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlement history'
    });
  }
};

/**
 * Dashboard summary for admin
 */
const getSettlementDashboard = async (req, res) => {
  try {
    // Total amount due to admin
    // Total amount due to admin
    const totalDueResult = await Vendor.aggregate([
      { $match: { 'wallet.dues': { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$wallet.dues' } } }
    ]);
    const totalDueToAdmin = totalDueResult[0]?.total || 0;

    // Pending settlements
    const pendingSettlements = await Settlement.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    // Today's cash collections
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCollections = await Transaction.aggregate([
      {
        $match: {
          type: 'cash_collected',
          createdAt: { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // This week settlements
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekSettlements = await Transaction.aggregate([
      {
        $match: {
          type: 'settlement',
          status: 'completed',
          createdAt: { $gte: weekStart }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalDueToAdmin,
        vendorsWithDue: await Vendor.countDocuments({ 'wallet.dues': { $gt: 0 } }),
        pendingSettlements: {
          amount: pendingSettlements[0]?.total || 0,
          count: pendingSettlements[0]?.count || 0
        },
        todayCashCollected: {
          amount: todayCollections[0]?.total || 0,
          count: todayCollections[0]?.count || 0
        },
        weeklySettlements: {
          amount: weekSettlements[0]?.total || 0,
          count: weekSettlements[0]?.count || 0
        }
      }
    });
  } catch (error) {
    console.error('Get settlement dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data'
    });
  }
};

/**
 * Block Vendor (Manual or auto-triggered)
 */
const blockVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { reason } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    vendor.wallet.isBlocked = true;
    vendor.wallet.blockedAt = new Date();
    vendor.wallet.blockReason = reason || 'Blocked by admin due to pending dues.';
    await vendor.save();

    await notifySafe({
      vendorId: vendor._id, type: 'vendor_blocked', title: 'You cannot take new bookings',
      message: `${String(vendor.wallet.blockReason).replace(/[.\s]+$/, '')}. Clear your dues or contact support to get back to work.`
    });

    res.status(200).json({ success: true, message: 'Vendor blocked successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Unblock Vendor
 */
const unblockVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    vendor.wallet.isBlocked = false;
    vendor.wallet.blockedAt = null;
    vendor.wallet.blockReason = null;
    await vendor.save();

    await notifySafe({ vendorId: vendor._id, type: 'vendor_unblocked', title: 'You can take bookings again', message: 'Your account has been unblocked by the admin. You can accept new bookings now.' });

    res.status(200).json({ success: true, message: 'Vendor unblocked successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update Vendor Cash Limit
 */
const updateCashLimit = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { limit } = req.body;

    if (!limit || limit < 0) {
      return res.status(400).json({ success: false, message: 'Invalid limit' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    vendor.wallet.cashLimit = limit;

    // Auto unblock if new limit covers dues
    let unblockedByLimit = false;
    if (vendor.wallet.isBlocked && (vendor.wallet.dues || 0) <= limit) {
      unblockedByLimit = true;
      vendor.wallet.isBlocked = false;
      vendor.wallet.blockedAt = null;
      vendor.wallet.blockReason = null;
    }

    await vendor.save();

    if (unblockedByLimit) {
      await notifySafe({ vendorId: vendor._id, type: 'vendor_unblocked', title: 'You can take bookings again', message: `Your cash limit was raised to ₹${limit}, which covers your dues. You can accept new bookings now.` });
    }

    res.status(200).json({ success: true, message: 'Cash limit updated successfully', limit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getVendorBalances,
  getVendorLedger,
  getPendingSettlements,
  approveSettlement,
  rejectSettlement,
  getSettlementHistory,
  getSettlementDashboard,
  blockVendor,
  unblockVendor,
  updateCashLimit,

  // Withdrawal functions (Delegated to centralized withdrawalService)
  getWithdrawalRequests: async (req, res) => {
    try {
      const { page = 1, limit = 20, status, role, search } = req.query;
      const result = await withdrawalService.getAdminWithdrawals({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        status,
        role,
        search
      });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  approveWithdrawal: async (req, res) => {
    try {
      const { withdrawalId } = req.params;
      const { transactionReference, notes, adminNotes } = req.body;
      const adminId = req.user.id || req.user._id;

      let withdrawal = await Withdrawal.findById(withdrawalId);
      if (!withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });

      // If pending, accept for payout
      if (withdrawal.status === 'PENDING' || withdrawal.status === 'pending') {
        const acceptRes = await withdrawalService.acceptWithdrawal(withdrawalId, adminId, notes || adminNotes);
        return res.status(200).json({
          success: true,
          message: 'Withdrawal accepted for manual payout processing',
          data: acceptRes.data
        });
      }

      return res.status(200).json({
        success: true,
        message: `Withdrawal status is ${withdrawal.status}`,
        data: withdrawal
      });
    } catch (error) {
      console.error('Approve withdrawal error:', error);
      return res.status(400).json({ success: false, message: error.message });
    }
  },

  rejectWithdrawal: async (req, res) => {
    try {
      const { withdrawalId } = req.params;
      const { reason, rejectionReason } = req.body;
      const adminId = req.user.id || req.user._id;

      const rReason = rejectionReason || reason;
      if (!rReason || !rReason.trim()) {
        return res.status(400).json({ success: false, message: 'Rejection reason is mandatory' });
      }

      const result = await withdrawalService.rejectWithdrawal(withdrawalId, adminId, rReason.trim());
      return res.status(200).json({
        success: true,
        message: 'Withdrawal rejected and reserved balance refunded',
        data: result.data
      });
    } catch (error) {
      console.error('Reject withdrawal error:', error);
      return res.status(400).json({ success: false, message: error.message });
    }
  }
};

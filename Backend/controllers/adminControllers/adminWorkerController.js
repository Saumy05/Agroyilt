const Worker = require('../../models/Worker');
const User = require('../../models/User');
const Admin = require('../../models/Admin');
const Review = require('../../models/Review');
const Booking = require('../../models/Booking');
const { validationResult } = require('express-validator');
const { WORKER_STATUS, BOOKING_STATUS, VENDOR_STATUS } = require('../../utils/constants');
const { createNotification } = require('../notificationControllers/notificationController');
const { buildAdminScopeFilter, auditAdminAction, verifyResourceScope, extractAdminScopeFields } = require('../../utils/adminScopeHelper');

/**
 * Get all workers with filters and pagination
 */
const getAllWorkers = async (req, res) => {
  try {
    const {
      search,
      approvalStatus,
      isActive,
      workerType,
      page = 1,
      limit = 20
    } = req.query;

    // Build query
    const query = {};

    if (approvalStatus) {
      query.approvalStatus = approvalStatus;
    }
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Filter by Worker Type (TEAM_LEADER vs INDEPENDENT / WORKER)
    if (workerType && workerType !== 'all') {
      const typeUpper = workerType.toUpperCase();
      if (typeUpper === 'TEAM_LEADER') {
        query.workerType = 'TEAM_LEADER';
      } else if (typeUpper === 'INDEPENDENT' || typeUpper === 'WORKER') {
        query.workerType = { $ne: 'TEAM_LEADER' };
      }
    }

    // Search by name, email, phone, category, or skills
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { serviceCategory: { $regex: search, $options: 'i' } },
        { skills: { $regex: search, $options: 'i' } }
      ];
    }

    // Apply Geographic Scope Filter for scoped Admins
    const scopeFilter = buildAdminScopeFilter(req.user, 'worker');
    const finalQuery = Object.keys(scopeFilter).length > 0
      ? { $and: [query, scopeFilter] }
      : query;

    if (req.query.createdByMe === 'true' && req.user?._id) {
      query.createdByAdmin = req.user._id;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch workers and total count in parallel with .lean()
    const [workers, total] = await Promise.all([
      Worker.find(finalQuery)
        .select('-password')
        .populate('createdByAdmin', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Worker.countDocuments(finalQuery)
    ]);

    // Batch aggregate jobs & ratings in 2 single queries instead of 2N queries
    const Review = require('../../models/Review');
    const workerIds = workers.map(w => w._id);

    const [completedJobsStats, reviewStats] = await Promise.all([
      workerIds.length > 0
        ? Booking.aggregate([
            { $match: { workerId: { $in: workerIds }, status: BOOKING_STATUS.COMPLETED } },
            { $group: { _id: '$workerId', count: { $sum: 1 } } }
          ])
        : [],
      workerIds.length > 0
        ? Review.aggregate([
            { $match: { workerId: { $in: workerIds } } },
            { $group: { _id: '$workerId', avgRating: { $avg: '$rating' } } }
          ])
        : []
    ]);

    const jobsMap = new Map(completedJobsStats.map(item => [item._id.toString(), item.count]));
    const ratingsMap = new Map(reviewStats.map(item => [item._id.toString(), Number(item.avgRating.toFixed(1))]));

    const dynamicWorkers = workers.map(w => {
      const idStr = w._id.toString();
      return {
        ...w,
        totalJobs: jobsMap.get(idStr) ?? w.totalJobs ?? 0,
        rating: ratingsMap.get(idStr) ?? w.rating ?? 0
      };
    });

    // Base filter for counting types (respecting status filter if applied)
    const baseCountQuery = {};
    if (approvalStatus) {
      baseCountQuery.approvalStatus = approvalStatus;
    }
    const finalBaseCount = Object.keys(scopeFilter).length > 0
      ? { $and: [baseCountQuery, scopeFilter] }
      : baseCountQuery;

    const [totalWorkersCount, independentCount, teamLeaderCount, myWorkersCount] = await Promise.all([
      Worker.countDocuments(finalBaseCount),
      Worker.countDocuments({ ...finalBaseCount, workerType: { $ne: 'TEAM_LEADER' } }),
      Worker.countDocuments({ ...finalBaseCount, workerType: 'TEAM_LEADER' }),
      req.user?._id ? Worker.countDocuments({ createdByAdmin: req.user._id }) : 0
    ]);

    res.status(200).json({
      success: true,
      data: dynamicWorkers,
      counts: {
        total: totalWorkersCount,
        independent: independentCount,
        teamLeader: teamLeaderCount,
        myRegistrations: myWorkersCount
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all workers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch workers. Please try again.'
    });
  }
};

/**
 * Get worker details
 */
const getWorkerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id).select('-password').populate('createdByAdmin', 'name email role');

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // IDOR protection: verify worker is within admin's geographic scope
    if (!verifyResourceScope(req.user, worker.toObject ? worker.toObject() : worker, 'worker')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This worker is outside your assigned geographic scope.'
      });
    }

    // Get worker booking stats
    const jobStats = await Booking.aggregate([
      {
        $match: { workerId: worker._id }
      },
      {
        $group: {
          _id: null,
          totalJobs: { $sum: 1 },
          completedJobs: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0]
            }
          },
          // Assuming workers might get paid or we just track job value
          totalJobValue: {
            $sum: '$finalAmount'
          }
        }
      }
    ]);

    // If Team Leader or linked to a team, fetch team details
    let team = null;
    if (worker.workerType === 'TEAM_LEADER' || worker.teamId) {
      try {
        const Team = require('../../models/Team');
        if (worker.teamId) {
          team = await Team.findById(worker.teamId).lean();
        }
        if (!team) {
          team = await Team.findOne({ leaderId: worker._id }).lean();
        }
      } catch (teamErr) {
        console.error('Error fetching team for worker:', teamErr);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        worker,
        team,
        stats: jobStats[0] || {
          totalJobs: 0,
          completedJobs: 0,
          totalJobValue: 0
        }
      }
    });
  } catch (error) {
    console.error('Get worker details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker details. Please try again.'
    });
  }
};

/**
 * Approve worker registration
 */
const approveWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    if (!verifyResourceScope(req.user, worker.toObject ? worker.toObject() : worker, 'worker')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This worker is outside your assigned geographic scope.'
      });
    }

    worker.approvalStatus = 'approved';
    worker.isActive = true;
    worker.approvalDate = new Date();
    await worker.save();

    await auditAdminAction(
      req,
      'APPROVE_WORKER',
      'WORKER_MANAGEMENT',
      `Approved worker application for "${worker.name}" (${worker.phone})`,
      worker._id,
      'Worker',
      worker.name
    );

    // Trigger Referral Reward Qualification if worker was referred
    try {
      const referralService = require('../../services/referralService');
      await referralService.qualifyAndRewardReferral({
        referredUserId: worker._id,
        event: 'approval'
      });
    } catch (refErr) {
      console.error('Referral qualification error for approved worker:', refErr);
    }

    // Send notification to worker
    try {
      await createNotification({
        workerId: worker._id,
        type: 'worker_approved',
        title: '🎉 Worker Account Approved!',
        message: 'Congratulations! Your worker account has been approved by the admin. You can now login.',
        relatedId: worker._id,
        relatedType: 'worker',
        data: { workerId: worker._id, status: 'approved' },
        pushData: { type: 'worker_alert', link: '/worker/login' }
      });
    } catch (notifErr) {
      console.error('Failed to send worker approval notification:', notifErr);
    }

    res.status(200).json({
      success: true,
      message: 'Worker approved successfully',
      data: worker
    });
  } catch (error) {
    console.error('Approve worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve worker. Please try again.'
    });
  }
};

/**
 * Reject worker registration
 */
const rejectWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    if (!verifyResourceScope(req.user, worker.toObject ? worker.toObject() : worker, 'worker')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This worker is outside your assigned geographic scope.'
      });
    }

    worker.approvalStatus = 'rejected';
    worker.isActive = false;
    worker.rejectionReason = reason || 'Application does not meet requirements';
    await worker.save();

    await auditAdminAction(
      req,
      'REJECT_WORKER',
      'WORKER_MANAGEMENT',
      `Rejected worker application for "${worker.name}" (${worker.phone}) - ${reason || 'No reason'}`,
      worker._id,
      'Worker',
      worker.name
    );

    // Send notification to worker
    try {
      await createNotification({
        workerId: worker._id,
        type: 'worker_rejected',
        title: 'Worker Application Status',
        message: `Your worker application was rejected by the admin.${reason ? ` Reason: ${reason}` : ''}`,
        relatedId: worker._id,
        relatedType: 'worker',
        data: { workerId: worker._id, status: 'rejected', reason: worker.rejectionReason }
      });
    } catch (notifErr) {
      console.error('Failed to send worker rejection notification:', notifErr);
    }

    res.status(200).json({
      success: true,
      message: 'Worker rejected successfully',
      data: worker
    });
  } catch (error) {
    console.error('Reject worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject worker. Please try again.'
    });
  }
};

/**
 * Suspend worker
 */
const suspendWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    if (!verifyResourceScope(req.user, worker.toObject ? worker.toObject() : worker, 'worker')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This worker is outside your assigned geographic scope.'
      });
    }

    worker.approvalStatus = 'suspended';
    worker.isActive = false;
    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Worker suspended successfully',
      data: worker
    });
  } catch (error) {
    console.error('Suspend worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend worker. Please try again.'
    });
  }
};

/**
 * Get worker jobs
 */
const getWorkerJobs = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    const query = { workerId: id };
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const jobs = await Booking.find(query)
      .populate('userId', 'name phone')
      .populate('serviceId', 'title iconUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get worker jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker jobs.'
    });
  }
};

/**
 * Get worker earnings
 */
const getWorkerEarnings = async (req, res) => {
  // Placeholder for now, can be expanded if we track granular worker earnings
  res.status(200).json({
    success: true,
    data: {
      totalEarnings: 0
    }
  });
};

/**
 * Pay worker manually
 */
const payWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reference, notes } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid amount'
      });
    }

    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Update wallet balance
    // Assuming balance is amount owed to Admin? 
    // Usually admin pays worker, so worker balance increases or decreases?
    // In this system, vendor owes admin (negative balance).
    // For workers, positive balance probably means earnings they can withdraw.
    // If admin pays them, it should reduce their pending balance or just reflect as a transaction.
    // If the user says "pay worker", it usually means adding money to their wallet or clearing dues.

    if (!worker.wallet) worker.wallet = { balance: 0 };
    worker.wallet.balance += parseFloat(amount);

    await worker.save();

    res.status(200).json({
      success: true,
      message: `Successfully recorded payment of ₹${amount} to ${worker.name}`,
      data: {
        balance: worker.wallet.balance
      }
    });
  } catch (error) {
    console.error('Pay worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment. Please try again.'
    });
  }
};

/**
 * Get all worker jobs (global)
 */
const getAllWorkerJobs = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;

    const query = { workerId: { $exists: true, $ne: null } };
    if (status && status !== 'all') {
      if (status === 'completed') {
        query.status = { $in: [BOOKING_STATUS.COMPLETED, 'completed', 'work_done'] };
      } else if (status === 'in_progress') {
        query.status = { $in: ['in_progress', 'confirmed', 'accepted', 'journey_started', 'started'] };
      } else {
        query.status = status;
      }
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // If search is provided, match by bookingNumber, serviceName, worker or farmer info
    if (search && search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      const [matchingWorkers, matchingUsers] = await Promise.all([
        Worker.find({ $or: [{ name: searchRegex }, { phone: searchRegex }, { email: searchRegex }] }).select('_id'),
        User.find({ $or: [{ name: searchRegex }, { phone: searchRegex }, { email: searchRegex }] }).select('_id')
      ]);

      const workerIds = matchingWorkers.map(w => w._id);
      const userIds = matchingUsers.map(u => u._id);

      query.$or = [
        { bookingNumber: searchRegex },
        { serviceName: searchRegex },
        { cropType: searchRegex },
        { workerId: { $in: workerIds } },
        { userId: { $in: userIds } }
      ];
    }

    const jobs = await Booking.find(query)
      .populate('workerId', 'name phone profilePhoto profileImage workerType skills serviceCategories address rating')
      .populate('userId', 'name phone email address')
      .populate('serviceId', 'title iconUrl serviceCategory')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    // Quick stats for worker bookings tab
    const [allCount, completedCount, inProgressCount, pendingCount, cancelledCount] = await Promise.all([
      Booking.countDocuments({ workerId: { $exists: true, $ne: null } }),
      Booking.countDocuments({ workerId: { $exists: true, $ne: null }, status: { $in: [BOOKING_STATUS.COMPLETED, 'work_done', 'completed'] } }),
      Booking.countDocuments({ workerId: { $exists: true, $ne: null }, status: { $in: ['in_progress', 'confirmed', 'accepted', 'journey_started', 'started'] } }),
      Booking.countDocuments({ workerId: { $exists: true, $ne: null }, status: { $in: ['pending', 'awaiting_payment'] } }),
      Booking.countDocuments({ workerId: { $exists: true, $ne: null }, status: BOOKING_STATUS.CANCELLED })
    ]);

    res.status(200).json({
      success: true,
      data: jobs,
      stats: {
        total: allCount,
        completed: completedCount,
        inProgress: inProgressCount,
        pending: pendingCount,
        cancelled: cancelledCount
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all worker jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch all worker jobs.'
    });
  }
};

/**
 * Get comprehensive worker analytics
 */
const getWorkerAnalytics = async (req, res) => {
  try {
    // 1. Overall counts
    const [
      totalWorkers,
      totalTeamLeaders,
      totalIndependentWorkers,
      approvedWorkers,
      pendingWorkers,
      suspendedWorkers,
      rejectedWorkers
    ] = await Promise.all([
      Worker.countDocuments(),
      Worker.countDocuments({ workerType: 'TEAM_LEADER' }),
      Worker.countDocuments({ workerType: { $ne: 'TEAM_LEADER' } }),
      Worker.countDocuments({ approvalStatus: 'approved' }),
      Worker.countDocuments({ approvalStatus: 'pending' }),
      Worker.countDocuments({ approvalStatus: 'suspended' }),
      Worker.countDocuments({ approvalStatus: 'rejected' })
    ]);

    // 2. Booking stats for workers
    const workerJobStats = await Booking.aggregate([
      {
        $match: {
          workerId: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          totalJobs: { $sum: 1 },
          completedJobs: {
            $sum: {
              $cond: [
                { $in: ['$status', [BOOKING_STATUS.COMPLETED, 'completed', 'work_done']] },
                1,
                0
              ]
            }
          },
          cancelledJobs: {
            $sum: {
              $cond: [
                { $eq: ['$status', BOOKING_STATUS.CANCELLED] },
                1,
                0
              ]
            }
          },
          inProgressJobs: {
            $sum: {
              $cond: [
                { $in: ['$status', ['in_progress', 'confirmed', 'accepted', 'journey_started', 'started']] },
                1,
                0
              ]
            }
          },
          totalRevenue: {
            $sum: {
              $cond: [
                { $in: ['$status', [BOOKING_STATUS.COMPLETED, 'completed', 'work_done']] },
                { $ifNull: ['$finalAmount', '$basePrice', 0] },
                0
              ]
            }
          }
        }
      }
    ]);

    const jobSummary = workerJobStats[0] || {
      totalJobs: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      inProgressJobs: 0,
      totalRevenue: 0
    };

    // 3. Average rating
    const ratingStats = await Worker.aggregate([
      { $match: { rating: { $gt: 0 } } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const avgRating = ratingStats[0]?.avgRating ? Number(ratingStats[0].avgRating.toFixed(1)) : 4.8;

    // 4. Monthly booking trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrends = await Booking.aggregate([
      {
        $match: {
          workerId: { $exists: true, $ne: null },
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$createdAt' }
          },
          totalBookings: { $sum: 1 },
          completedBookings: {
            $sum: {
              $cond: [
                { $in: ['$status', [BOOKING_STATUS.COMPLETED, 'completed', 'work_done']] },
                1,
                0
              ]
            }
          },
          revenue: {
            $sum: {
              $cond: [
                { $in: ['$status', [BOOKING_STATUS.COMPLETED, 'completed', 'work_done']] },
                { $ifNull: ['$finalAmount', '$basePrice', 0] },
                0
              ]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 5. Skills Distribution from Workers
    const skillsAggregation = await Worker.aggregate([
      { $unwind: '$skills' },
      { $group: { _id: '$skills', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);

    // 6. Top Performing Workers (based on completed jobs and rating)
    const topWorkers = await Worker.find({ approvalStatus: 'approved' })
      .select('name phone profilePhoto profileImage workerType skills rating totalJobs completedJobs wallet status')
      .sort({ completedJobs: -1, rating: -1, totalJobs: -1 })
      .limit(8);

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalWorkers,
          totalTeamLeaders,
          totalIndependentWorkers,
          approvedWorkers,
          pendingWorkers,
          suspendedWorkers,
          rejectedWorkers,
          totalJobs: jobSummary.totalJobs,
          completedJobs: jobSummary.completedJobs,
          cancelledJobs: jobSummary.cancelledJobs,
          inProgressJobs: jobSummary.inProgressJobs,
          totalRevenue: jobSummary.totalRevenue,
          avgRating
        },
        workerTypeDistribution: [
          { name: 'Team Leaders', value: totalTeamLeaders, color: '#f59e0b' },
          { name: 'Independent Workers', value: totalIndependentWorkers, color: '#3b82f6' }
        ],
        statusDistribution: [
          { name: 'Approved', value: approvedWorkers, color: '#10b981' },
          { name: 'Pending', value: pendingWorkers, color: '#f59e0b' },
          { name: 'Suspended', value: suspendedWorkers, color: '#ef4444' },
          { name: 'Rejected', value: rejectedWorkers, color: '#64748b' }
        ],
        monthlyTrends: monthlyTrends.map(item => ({
          month: item._id,
          totalBookings: item.totalBookings,
          completedBookings: item.completedBookings,
          revenue: item.revenue
        })),
        skillsDistribution: skillsAggregation.map(item => ({
          skill: item._id || 'General Work',
          count: item.count
        })),
        topWorkers
      }
    });
  } catch (error) {
    console.error('Get worker analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker analytics.'
    });
  }
};

/**
 * Get worker payments summary
 */
const getWorkerPaymentsSummary = async (req, res) => {
  try {
    // For now, return workers with non-zero balances or recent job activity
    const workers = await Worker.find({
      'wallet.balance': { $exists: true }
    })
      .select('name phone wallet email serviceCategory approvalStatus')
      .sort({ 'wallet.balance': -1 });

    res.status(200).json({
      success: true,
      data: workers
    });
  } catch (error) {
    console.error('Get worker payments summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker payments summary.'
    });
  }
};

/**
 * Toggle worker active status
 */
const toggleWorkerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body; // Expecting { isActive: true/false }

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    if (!verifyResourceScope(req.user, worker.toObject ? worker.toObject() : worker, 'worker')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This worker is outside your assigned geographic scope.'
      });
    }

    worker.isActive = isActive;
    await worker.save();

    await auditAdminAction(
      req,
      worker.isActive ? 'ACTIVATE_WORKER' : 'DEACTIVATE_WORKER',
      'WORKER_MANAGEMENT',
      `${worker.isActive ? 'Activated' : 'Deactivated'} worker "${worker.name}" (${worker.phone})`,
      worker._id,
      'Worker',
      worker.name
    );

    res.status(200).json({
      success: true,
      message: `Worker ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: worker
    });
  } catch (error) {
    console.error('Toggle worker status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update worker status'
    });
  }
};

/**
 * Delete worker details
 */
const deleteWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findByIdAndDelete(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    await auditAdminAction(
      req,
      'DELETE_WORKER',
      'WORKER_MANAGEMENT',
      `Deleted worker "${worker.name}" (${worker.phone})`,
      worker._id,
      'Worker',
      worker.name
    );

    res.status(200).json({
      success: true,
      message: 'Worker deleted successfully'
    });
  } catch (error) {
    console.error('Delete worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete worker'
    });
  }
};

/**
 * Add worker directly by Admin
 */
const addWorker = async (req, res) => {
  try {
    const { name, email, phone, workerType, serviceCategory, skills, hourlyRate, dailyRate } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }

    // Validate 10-digit Indian mobile number
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    const indianMobileRegex = /^[6-9]\d{9}$/;
    if (!cleanPhone || cleanPhone.length !== 10 || !indianMobileRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
      });
    }

    const existing = await Worker.findOne({ phone: cleanPhone });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Worker with this phone already exists' });
    }

    // Auto-assign admin's scope fields (Phase 4: scope enforcement on create)
    const scopeFields = extractAdminScopeFields(req.user);

    const worker = await Worker.create({
      name: name.trim(),
      email: email || null,
      phone: cleanPhone,
      workerType: workerType || 'WORKER',
      serviceCategory: serviceCategory || '',
      skills: Array.isArray(skills) ? skills : (skills ? [skills] : []),
      hourlyRate: hourlyRate || 0,
      dailyRate: dailyRate || 0,
      approvalStatus: 'approved',
      approvalDate: new Date(),
      isActive: true,
      isPhoneVerified: true,
      ...scopeFields,
      createdByAdmin: req.user?._id || null,
      createdByType: req.user?.role === 'super_admin' ? 'SUPER_ADMIN' : 'ADMIN',
      creationSource: req.user?.role === 'super_admin' ? 'SUPER_ADMIN_CREATED' : 'ADMIN_CREATED',
      createdByAdminSnapshot: req.user ? {
        adminId: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      } : null,
      address: {
        addressLine1: req.body.address || '',
        city: req.body.city || req.user?.cityName || '',
        district: scopeFields.districtName || req.body.district || req.user?.districtName || '',
        subDistrict: scopeFields.subDistrictName || req.body.subDistrict || req.user?.subDistrictName || '',
        districtId: scopeFields.districtId || null,
        subDistrictId: scopeFields.subDistrictId || null,
        state: req.body.state || 'Maharashtra',
        pincode: req.body.pincode || ''
      }
    });

    await auditAdminAction(
      req,
      'CREATE_WORKER',
      'WORKER_MANAGEMENT',
      `Registered worker "${worker.name}" (${worker.phone}) [Type: ${worker.workerType}]`,
      worker._id,
      'Worker',
      worker.name
    );

    res.status(201).json({
      success: true,
      message: 'Worker added successfully',
      data: worker
    });
  } catch (error) {
    console.error('Admin add worker error:', error);
    res.status(500).json({ success: false, message: 'Failed to add worker: ' + error.message });
  }
};

module.exports = {
  getAllWorkers,
  getWorkerDetails,
  approveWorker,
  rejectWorker,
  suspendWorker,
  getWorkerJobs,
  getWorkerEarnings,
  payWorker,
  getAllWorkerJobs,
  getWorkerAnalytics,
  getWorkerPaymentsSummary,
  toggleWorkerStatus,
  deleteWorker,
  addWorker
};

const Booking = require('../../models/Booking');
const Worker = require('../../models/Worker');
const { BOOKING_STATUS } = require('../../utils/constants');

/**
 * Get worker dashboard statistics
 */
const getDashboardStats = async (req, res) => {
  try {
    const workerId = req.user.id;

    // Get Worker Profile for Rating (fallback)
    const worker = await Worker.findById(workerId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // 2. Earnings = what the worker keeps (after app commission), all time and this calendar month.
    //    Farmer jobs (cash AND online) come from settled assignments; vendor-team / older jobs from vendor payments
    //    or, failing that, completed bookings that are not farmer jobs. Penalties are deductions, not shown here.
    let totalEarnings = 0;
    let thisMonthEarnings = 0;
    try {
      const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
      const Transaction = require('../../models/Transaction');
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const sumWithMonth = (dateExpr, amountExpr) => ([
        {
          $group: {
            _id: null,
            total: { $sum: amountExpr },
            month: { $sum: { $cond: [{ $gte: [dateExpr, monthStart] }, amountExpr, 0] } }
          }
        }
      ]);

      const [assignStats, vendorPayStats, farmerJobBookings] = await Promise.all([
        IndWorkerAssignment.aggregate([
          { $match: { workerId: worker._id, settlementStatus: 'SETTLED' } },
          ...sumWithMonth({ $ifNull: ['$settledAt', { $ifNull: ['$workCompletedAt', '$updatedAt'] }] }, { $ifNull: ['$netEarning', 0] })
        ]),
        Transaction.aggregate([
          { $match: { workerId: worker._id, type: 'worker_payment', status: 'completed' } },
          ...sumWithMonth('$createdAt', { $ifNull: ['$amount', 0] })
        ]),
        IndWorkerAssignment.distinct('legacyBookingId', { workerId: worker._id, legacyBookingId: { $ne: null } })
      ]);

      // completed bookings that are not farmer jobs (those are counted through their assignment above)
      let otherStats = [];
      if (!(vendorPayStats[0]?.total > 0)) {
        otherStats = await Booking.aggregate([
          {
            $match: {
              workerId: worker._id,
              status: { $in: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.WORK_DONE] },
              _id: { $nin: farmerJobBookings },
              workerRequestId: { $in: [null] },
              bookingNumber: { $not: /^WRK-/ }
            }
          },
          ...sumWithMonth(
            { $ifNull: ['$completedAt', '$updatedAt'] },
            { $ifNull: ['$workerNetEarning', { $multiply: [{ $ifNull: ['$finalAmount', { $ifNull: ['$agreedRate', 0] }] }, 0.9] }] }
          )
        ]);
      }

      const pick = (stats, k) => Number(stats[0]?.[k]) || 0;
      const round2 = (n) => Math.round(n * 100) / 100;
      totalEarnings = round2(pick(assignStats, 'total') + pick(vendorPayStats, 'total') + pick(otherStats, 'total'));
      thisMonthEarnings = round2(pick(assignStats, 'month') + pick(vendorPayStats, 'month') + pick(otherStats, 'month'));
    } catch (err) {
      console.warn('[getDashboardStats] Earning calculation fallback:', err.message);
    }

    const BookingRequest = require('../../models/BookingRequest');
    const myRequests = await BookingRequest.find({ workerId: worker._id, status: { $ne: 'REJECTED' } }).select('bookingId');
    const requestBookingIds = myRequests.map(r => r.bookingId);

    const workerFilter = {
      $or: [
        { workerId: worker._id },
        { notifiedWorkers: worker._id },
        { 'potentialWorkers.workerId': worker._id },
        { _id: { $in: requestBookingIds } }
      ]
    };

    // 3. Count Active Jobs (Assigned, Visited, In Progress, Requested, Searching)
    const activeJobsCount = await Booking.countDocuments({
      ...workerFilter,
      status: {
        $in: [
          BOOKING_STATUS.ASSIGNED,
          BOOKING_STATUS.VISITED,
          BOOKING_STATUS.IN_PROGRESS,
          BOOKING_STATUS.CONFIRMED,
          BOOKING_STATUS.REQUESTED,
          BOOKING_STATUS.SEARCHING,
          BOOKING_STATUS.PENDING
        ]
      }
    });

    // 4. Count Completed Jobs
    const completedJobsCount = await Booking.countDocuments({
      workerId: worker._id,
      status: { $in: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.WORK_DONE] }
    });

    // 5. Calculate Average Rating
    const ratingStats = await Booking.aggregate([
      {
        $match: {
          workerId: worker._id,
          rating: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" }
        }
      }
    ]);

    const averageRating = ratingStats.length > 0 ? parseFloat(ratingStats[0].avgRating.toFixed(1)) : (worker.rating || 0);

    // 6. Get Recent Jobs
    const recentJobs = await Booking.find(workerFilter)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('userId', 'name')
      .populate('serviceId', 'title');

    res.status(200).json({
      success: true,
      data: {
        totalEarnings,
        thisMonthEarnings,
        activeJobs: activeJobsCount,
        completedJobs: completedJobsCount,
        rating: averageRating,
        recentJobs
      }
    });

  } catch (error) {
    console.error('Get worker dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
};

module.exports = {
  getDashboardStats
};

const Booking = require('../../models/Booking');
const VendorBill = require('../../models/VendorBill');
const Worker = require('../../models/Worker');
const Service = require('../../models/Service');
const EcommerceOrder = require('../../models/EcommerceOrder');
const Settings = require('../../models/Settings');
const { getVendorPayoutPercentage } = require('../../utils/vendorPayout');
const { BOOKING_STATUS, PAYMENT_STATUS, WORKER_STATUS } = require('../../utils/constants');

const mongoose = require('mongoose');

/**
 * Get vendor dashboard stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
    const vendor = await require('../../models/Vendor').findById(vendorId);
    const vendorCategories = vendor?.service || [];
    const categoryRegexPatterns = (vendorCategories || []).map(cat => new RegExp(`^${cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));

    const unassignedAlertCondition = {
      vendorId: null,
      status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] },
      $or: [
        ...(categoryRegexPatterns.length > 0 ? [{ serviceCategory: { $in: categoryRegexPatterns } }] : []),
        { notifiedVendors: vendorObjectId },
        { 'potentialVendors.vendorId': vendorObjectId },
        { notifiedVendors: vendorId },
        { 'potentialVendors.vendorId': vendorId }
      ]
    };

    // Optimize by running all independent DB queries in parallel
    const [
      totalBookings,
      pendingBookings,
      completedBookings,
      inProgressBookings,
      workersOnline,
      earningsResult,
      recentBookings,
      ecommerceEarningsResult
    ] = await Promise.all([
      // Total bookings (excluding accepted but unpaid)
      Booking.countDocuments({
        vendorId,
        status: { $ne: BOOKING_STATUS.AWAITING_PAYMENT }
      }),
      // Pending bookings (Alerts)
      Booking.countDocuments({
        $or: [
          { vendorId, status: BOOKING_STATUS.REQUESTED },
          unassignedAlertCondition
        ]
      }),
      // Completed bookings
      Booking.countDocuments({
        vendorId,
        status: BOOKING_STATUS.COMPLETED
      }),
      // Active Jobs (In Progress)
      Booking.countDocuments({
        vendorId,
        status: {
          $in: [
            BOOKING_STATUS.AWAITING_PAYMENT,
            BOOKING_STATUS.ACCEPTED,
            BOOKING_STATUS.PENDING,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.ASSIGNED,
            BOOKING_STATUS.JOURNEY_STARTED,
            BOOKING_STATUS.VISITED,
            BOOKING_STATUS.IN_PROGRESS,
            BOOKING_STATUS.WORK_DONE
          ]
        }
      }),
      // Workers Online
      Worker.countDocuments({
        vendorId,
        status: WORKER_STATUS.ONLINE
      }),
      // Total revenue from VendorBill
      VendorBill.aggregate([
        {
          $match: {
            vendorId: vendorObjectId,
            status: 'paid'
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$grandTotal' },
            vendorEarnings: { $sum: '$vendorTotalEarning' }
          }
        }
      ]),
      // Recent bookings (last 20)
      Booking.find({
        $or: [
          { vendorId, status: { $ne: BOOKING_STATUS.AWAITING_PAYMENT } },
          unassignedAlertCondition
        ]
      })
        .populate('userId', 'name phone')
        .populate('serviceId', 'title iconUrl')
        .populate('workerId', 'name')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      EcommerceOrder.aggregate([
        {
          $match: {
            vendorId: vendorObjectId,
            deliveryStatus: 'delivered'
          }
        },
        {
          $group: {
            _id: null,
            totalEcommerceEarnings: { $sum: '$pricing.vendorBalance' }
          }
        }
      ])
    ]);

    // Rating (Average from Bookings)
    let rating = vendor?.rating || 0;
    if (rating === 0) {
      const ratingResult = await Booking.aggregate([
        {
          $match: {
            vendorId: vendorId,
            rating: { $ne: null }
          }
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$rating" }
          }
        }
      ]);
      rating = ratingResult.length > 0 ? parseFloat(ratingResult[0].avgRating.toFixed(1)) : 0;
    }

    const totalRevenue = earningsResult[0]?.totalRevenue || 0;
    const vendorEarnings = vendor?.wallet?.earnings || 0;
    const ecommerceEarnings = ecommerceEarningsResult[0]?.totalEcommerceEarnings || 0;

    // Compliance Alerts (New Agriculture Feature)
    const complianceAlerts = [];
    if (vendor?.complianceDocuments) {
      const docs = vendor.complianceDocuments;
      const today = new Date();
      const checkDoc = (name, doc) => {
        if (doc && doc.expiryDate) {
          const diffDays = Math.ceil((new Date(doc.expiryDate) - today) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) complianceAlerts.push({ type: 'CRITICAL', message: `${name} Expired!`, doc: name });
          else if (diffDays <= 30) complianceAlerts.push({ type: 'WARNING', message: `${name} expiring in ${diffDays} days`, doc: name });
        }
      };
      checkDoc('License', docs.drivingLicense);
      checkDoc('RC Book', docs.rcBook);
      checkDoc('Insurance', docs.insurance);
    }

    // Fetch Global Settings to pass dynamic payout percentage to the app
    const globalSettings = await Settings.findOne({ type: 'global' });
    const servicePayoutPercentage = getVendorPayoutPercentage(globalSettings);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalBookings,
          pendingBookings,
          completedBookings,
          inProgressBookings,
          totalRevenue,
          vendorEarnings,
          ecommerceEarnings, // NEW
          workersOnline,
          rating,
          complianceAlerts, // Add this
          servicePayoutPercentage
        },
        recentBookings
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats. Please try again.'
    });
  }
};

/**
 * Get revenue analytics
 */
const getRevenueAnalytics = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
    const { period = 'monthly' } = req.query; // daily, weekly, monthly

    let groupFormat = '%Y-%m-%d';
    if (period === 'weekly') {
      groupFormat = '%Y-%W'; // Year-Week
    } else if (period === 'monthly') {
      groupFormat = '%Y-%m'; // Year-Month
    }

    // Revenue analytics from VendorBill
    const revenueData = await VendorBill.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          status: 'paid'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupFormat,
              date: '$paidAt'
            }
          },
          revenue: { $sum: '$grandTotal' },
          earnings: { $sum: '$vendorTotalEarning' },
          bookings: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        revenueData
      }
    });
  } catch (error) {
    console.error('Get revenue analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue analytics. Please try again.'
    });
  }
};

/**
 * Get worker performance
 */
const getWorkerPerformance = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    // Get workers for this vendor
    const workers = await Worker.find({ vendorId })
      .select('name phone rating totalJobs completedJobs');

    // Get booking stats per worker
    const workerStats = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          workerId: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$workerId',
          totalJobs: { $sum: 1 },
          completedJobs: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0]
            }
          },
          totalRevenue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', BOOKING_STATUS.COMPLETED] },
                    { $eq: ['$paymentStatus', PAYMENT_STATUS.SUCCESS] }
                  ]
                },
                '$finalAmount',
                0
              ]
            }
          }
        }
      }
    ]);

    // Combine worker data with stats
    const performance = workers.map(worker => {
      const stats = workerStats.find(s => s._id.toString() === worker._id.toString());
      return {
        workerId: worker._id,
        name: worker.name,
        phone: worker.phone,
        rating: worker.rating || 0,
        totalJobs: stats?.totalJobs || 0,
        completedJobs: stats?.completedJobs || 0,
        totalRevenue: stats?.totalRevenue || 0,
        completionRate: stats?.totalJobs
          ? ((stats.completedJobs / stats.totalJobs) * 100).toFixed(2)
          : 0
      };
    });

    res.status(200).json({
      success: true,
      data: performance
    });
  } catch (error) {
    console.error('Get worker performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker performance. Please try again.'
    });
  }
};

/**
 * Get service performance metrics
 */
const getServicePerformance = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    // Get service stats
    const serviceStats = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorObjectId
        }
      },
      {
        $group: {
          _id: '$serviceId',
          totalBookings: { $sum: 1 },
          completedBookings: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0]
            }
          },
          totalRevenue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', BOOKING_STATUS.COMPLETED] },
                    { $eq: ['$paymentStatus', PAYMENT_STATUS.SUCCESS] }
                  ]
                },
                '$finalAmount',
                0
              ]
            }
          },
          averageRating: { $avg: '$rating' }
        }
      }
    ]);

    // Populate service details
    const serviceIds = serviceStats.map(s => s._id);
    const services = await Service.find({ _id: { $in: serviceIds } })
      .select('title iconUrl slug');

    const performance = serviceStats.map(stat => {
      const service = services.find(s => s._id.toString() === stat._id.toString());
      return {
        serviceId: stat._id,
        serviceName: service?.title || 'Unknown Service',
        iconUrl: service?.iconUrl,
        totalBookings: stat.totalBookings,
        completedBookings: stat.completedBookings,
        totalRevenue: stat.totalRevenue,
        averageRating: stat.averageRating ? stat.averageRating.toFixed(2) : null,
        completionRate: stat.totalBookings
          ? ((stat.completedBookings / stat.totalBookings) * 100).toFixed(2)
          : 0
      };
    });

    res.status(200).json({
      success: true,
      data: performance
    });
  } catch (error) {
    console.error('Get service performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service performance. Please try again.'
    });
  }
};

/**
 * Get equipment ROI analytics (Hourly vs Land-based vs Monthly)
 */
const getEquipmentROIAnalytics = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const mongoose = require('mongoose');

    // Stats by Rental Type
    const rentalTypeStats = await Booking.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          status: BOOKING_STATUS.COMPLETED
        }
      },
      {
        $group: {
          _id: '$rental_type',
          totalEarnings: { $sum: '$finalAmount' }, // Fallback to finalAmount if vendorEarnings not available
          count: { $sum: 1 }
        }
      }
    ]);

    // Stats by Equipment Name (Tractor vs Harvester etc)
    const equipmentStats = await Booking.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          status: BOOKING_STATUS.COMPLETED
        }
      },
      {
        $group: {
          _id: '$serviceName',
          totalEarnings: { $sum: '$finalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalEarnings: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        rentalTypeStats,
        equipmentStats
      }
    });
  } catch (error) {
    console.error('Get equipment ROI analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch equipment analytics' });
  }
};

module.exports = {
  getDashboardStats,
  getRevenueAnalytics,
  getWorkerPerformance,
  getServicePerformance,
  getEquipmentROIAnalytics
};


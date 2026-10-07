const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Worker = require('../../models/Worker');
const Booking = require('../../models/Booking');
const Withdrawal = require('../../models/Withdrawal');
const Settlement = require('../../models/Settlement');
const SoilTestRequest = require('../../models/SoilTestRequest');
const EcommerceOrder = require('../../models/EcommerceOrder');
const Admin = require('../../models/Admin');
const AdminPayroll = require('../../models/AdminPayroll');

const { BOOKING_STATUS, PAYMENT_STATUS, VENDOR_STATUS } = require('../../utils/constants');
const { buildAdminScopeFilter } = require('../../utils/adminScopeHelper');
const { calculateAdminCombinedIncentives } = require('../../utils/adminIncentiveHelper');

/**
 * Get overall dashboard stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Apply Admin Geographic Scope
    const userScope = buildAdminScopeFilter(req.user, 'user');
    const vendorScope = buildAdminScopeFilter(req.user, 'vendor');
    const workerScope = buildAdminScopeFilter(req.user, 'worker');
    const bookingScope = buildAdminScopeFilter(req.user, 'booking');

    const userQuery = Object.keys(userScope).length > 0 ? { $and: [{ isActive: true, ...dateFilter }, userScope] } : { isActive: true, ...dateFilter };
    const vendorQuery = Object.keys(vendorScope).length > 0 ? { $and: [{ isActive: true, ...dateFilter }, vendorScope] } : { isActive: true, ...dateFilter };
    const workerBase = Object.keys(workerScope).length > 0 ? { $and: [dateFilter, workerScope] } : dateFilter;
    const bookingBase = Object.keys(bookingScope).length > 0 ? { $and: [dateFilter, bookingScope] } : dateFilter;

    // Special match for booking completions (using completedAt for revenue)
    const bookingMatch = {
      status: BOOKING_STATUS.COMPLETED,
      paymentStatus: { $in: [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR, 'success', 'collected_by_vendor', 'collected_by_worker', 'paid'] }
    };
    if (startDate || endDate) {
      bookingMatch.completedAt = {};
      if (startDate) bookingMatch.completedAt.$gte = new Date(startDate);
      if (endDate) bookingMatch.completedAt.$lte = new Date(endDate);
    }
    if (Object.keys(bookingScope).length > 0) {
      Object.assign(bookingMatch, bookingScope);
    }

    // Run all dashboard metric queries in parallel for high performance
    const adminId = req.user?._id;
    const workerTypeScope = Object.keys(workerScope).length > 0 ? { $and: [dateFilter, workerScope] } : dateFilter;

    const [
      totalUsers,
      vendorStatusStats,
      workerTypeStats,
      bookingStatusStats,
      revenueResult,
      soilTestRevenueResult,
      ecommerceRevenueResult,
      pendingWithdrawals,
      pendingSettlementsCount,
      recentActivityDocs,
      [myFarmersCount, myVendorsCount, myWorkersCount]
    ] = await Promise.all([
      // 1. Total users
      User.countDocuments(userQuery),

      // 2. Vendor counts grouped by approvalStatus in 1 query
      Vendor.aggregate([
        { $match: vendorQuery },
        { $group: { _id: '$approvalStatus', count: { $sum: 1 } } }
      ]),

      // 3. Worker counts grouped by workerType in 1 query
      Worker.aggregate([
        { $match: workerTypeScope },
        { $group: { _id: '$workerType', count: { $sum: 1 } } }
      ]),

      // 4. Booking counts grouped by status in 1 query
      Booking.aggregate([
        { $match: bookingBase },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),

      // 5. Booking revenue
      Booking.aggregate([
        { $match: bookingMatch },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$finalAmount' },
            totalBookings: { $sum: 1 }
          }
        }
      ]),

      // 6. Soil test revenue
      SoilTestRequest.aggregate([
        {
          $match: {
            paymentStatus: 'paid',
            ...(startDate || endDate ? { 
              updatedAt: { 
                ...(startDate ? { $gte: new Date(startDate) } : {}), 
                ...(endDate ? { $lte: new Date(endDate) } : {}) 
              } 
            } : {})
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$totalAmount' },
            totalCommission: { $sum: '$adminCommission' },
            count: { $sum: 1 }
          }
        }
      ]),

      // 7. Ecommerce revenue
      EcommerceOrder.aggregate([
        {
          $match: {
            paymentStatus: 'paid',
            deliveryStatus: { $ne: 'cancelled' },
            ...(startDate || endDate ? { 
              createdAt: { 
                ...(startDate ? { $gte: new Date(startDate) } : {}), 
                ...(endDate ? { $lte: new Date(endDate) } : {}) 
              } 
            } : {})
          }
        },
        {
          $group: {
            _id: null,
            totalCommission: { $sum: '$pricing.platformFee' },
            count: { $sum: 1 }
          }
        }
      ]),

      // 8. Pending withdrawals
      Withdrawal.countDocuments({ status: 'pending' }),

      // 9. Pending settlements
      Settlement.countDocuments({ status: 'pending' }),

      // 10. Recent 10 bookings with .lean() and projection (Scoped to territory for field admins)
      Booking.find(bookingBase)
        .select('bookingNumber status finalAmount basePrice createdAt serviceName userId vendorId serviceId acceptedAt assignedAt visitedAt completedAt workerPaymentStatus')
        .populate('userId', 'name phone')
        .populate('vendorId', 'name businessName')
        .populate('serviceId', 'title')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      // 11. My personal registrations count (Admin Traceability)
      adminId
        ? Promise.all([
            User.countDocuments({ createdByAdmin: adminId }),
            Vendor.countDocuments({ createdByAdmin: adminId }),
            Worker.countDocuments({ createdByAdmin: adminId })
          ])
        : Promise.resolve([0, 0, 0])
    ]);

    // Fetch Admin Compensation, Official Payroll Status & Territory details
    let adminCompensation = null;
    if (adminId) {
      try {
        const adminDoc = await Admin.findById(adminId).select('salary scopeType cityName districtName subDistrictName').lean();
        if (adminDoc) {
          const farmerIncentive = adminDoc.salary?.farmerIncentive || 0;
          const vendorIncentive = adminDoc.salary?.vendorIncentive || 0;
          const workerIncentive = adminDoc.salary?.workerIncentive || 0;
          const baseSalary = adminDoc.salary?.baseSalary || 0;

          // Date window for current month's live attribution
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth() + 1;
          const currentPayrollMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
          const cycleStartDate = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0);
          const cycleEndDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

          // Check current month registrations & official payroll record with per-admin threshold
          const [calc, payrollRecord] = await Promise.all([
            calculateAdminCombinedIncentives(adminDoc, {
              startDate: cycleStartDate,
              endDate: cycleEndDate,
              persist: false
            }),
            AdminPayroll.findOne({ adminId, payrollMonth: currentPayrollMonth }).lean()
          ]);

          const curFarmers = calc.counts.farmers;
          const curVendors = calc.counts.vendors;
          const curWorkers = calc.counts.workers;
          const currentTotalRegistrations = calc.totalCombinedRegistrations;
          const minRegistrationsThreshold = calc.minRegistrationsThreshold;
          const qualifyingRegistrationsCount = calc.qualifyingRegistrationsCount;
          const registrationsRemainingToUnlock = calc.registrationsRemainingToUnlock;
          const isThresholdMet = calc.isThresholdMet;

          const farmerIncentives = calc.incentives.farmerIncentivesEarned;
          const vendorIncentives = calc.incentives.vendorIncentivesEarned;
          const workerIncentives = calc.incentives.workerIncentivesEarned;
          const curEarnedIncentive = calc.incentives.totalIncentivesEarned;
          const estimatedCurrentCompensation = baseSalary + curEarnedIncentive;

          // Payment Status Extraction
          const lastPayment = payrollRecord?.payments?.filter(p => p.status === 'SUCCESS').slice(-1)[0] || null;
          const paymentStatus = payrollRecord ? payrollRecord.status : 'PENDING_PAYMENT';
          const paidThisMonth = payrollRecord?.paidAmount || 0;
          const pendingSalary = payrollRecord ? payrollRecord.remainingAmount : estimatedCurrentCompensation;

          adminCompensation = {
            baseSalary,
            farmerIncentive,
            vendorIncentive,
            workerIncentive,
            minRegistrationsThreshold,
            currentTotalRegistrations,
            qualifyingRegistrationsCount,
            registrationsRemainingToUnlock,
            isThresholdMet,
            farmerIncentives,
            vendorIncentives,
            workerIncentives,
            payFrequency: adminDoc.salary?.payFrequency || 'monthly',
            salaryStatus: adminDoc.salary?.status || 'ACTIVE',

            // Current Month Live Compensation
            payrollMonth: currentPayrollMonth,
            monthName: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
            curFarmers,
            curVendors,
            curWorkers,
            earnedIncentive: curEarnedIncentive,
            curEarnedIncentive,
            estimatedCurrentCompensation,
            totalEstimatedPayout: estimatedCurrentCompensation,

            // All-Time Registrations
            allTimeFarmers: myFarmersCount,
            allTimeVendors: myVendorsCount,
            allTimeWorkers: myWorkersCount,

            // Official Payroll & Payment Status (SEPARATED FROM ACCRUED COMPENSATION)
            payrollId: payrollRecord?._id || null,
            payrollStatus: paymentStatus,
            isPaid: payrollRecord?.status === 'PAID',
            isPartiallyPaid: payrollRecord?.status === 'PARTIALLY_PAID',
            paidThisMonth,
            pendingSalary,
            paidAt: lastPayment?.paymentDate || null,
            paymentMethod: lastPayment?.paymentMethod || null,
            utr: lastPayment?.transactionReference || null,
            paymentProofUrl: lastPayment?.paymentProofUrl || null,

            // Geographic Scope
            scopeType: adminDoc.scopeType || 'GLOBAL',
            cityName: adminDoc.cityName || '',
            districtName: adminDoc.districtName || '',
            subDistrictName: adminDoc.subDistrictName || ''
          };
        }
      } catch (err) {
        console.error('Failed to load admin compensation:', err);
      }
    }

    // Parse vendor counts
    let totalVendors = 0;
    let pendingVendors = 0;
    let approvedVendors = 0;
    vendorStatusStats.forEach(item => {
      totalVendors += item.count;
      if (item._id === VENDOR_STATUS.PENDING) pendingVendors = item.count;
      if (item._id === VENDOR_STATUS.APPROVED) approvedVendors = item.count;
    });

    // Parse worker counts
    let totalWorkers = 0;
    let totalTeamLeaders = 0;
    let totalIndependentWorkers = 0;
    workerTypeStats.forEach(item => {
      totalWorkers += item.count;
      if (item._id === 'TEAM_LEADER') {
        totalTeamLeaders += item.count;
      } else {
        totalIndependentWorkers += item.count;
      }
    });

    // Parse booking counts
    let totalBookings = 0;
    let pendingBookings = 0;
    let completedBookings = 0;
    let cancelledBookings = 0;
    bookingStatusStats.forEach(item => {
      totalBookings += item.count;
      if (item._id === BOOKING_STATUS.COMPLETED) completedBookings = item.count;
      else if (item._id === BOOKING_STATUS.CANCELLED) cancelledBookings = item.count;
      else pendingBookings += item.count;
    });

    // Revenue calculations
    const bookingRevData = revenueResult[0] || { totalRevenue: 0, totalBookings: 0 };
    const bookingRevenue = bookingRevData.totalRevenue;
    const bookingCommission = bookingRevenue * 0.2; // 20% commission

    const soilTestRevData = soilTestRevenueResult[0] || { totalAmount: 0, totalCommission: 0, count: 0 };
    const soilTestCommission = soilTestRevData.totalCommission;

    const ecommerceRevData = ecommerceRevenueResult[0] || { totalCommission: 0, count: 0 };
    const ecommerceCommission = ecommerceRevData.totalCommission;

    const totalRevenue = bookingCommission + soilTestCommission + ecommerceCommission;

    const recentBookings = recentActivityDocs.map(b => ({
      id: b.bookingNumber || b._id,
      _id: b._id,
      status: b.status,
      user: { name: b.userId?.name || 'Customer' },
      serviceType: b.serviceId?.title || b.serviceName,
      price: b.finalAmount || b.basePrice || 0,
      createdAt: b.createdAt,
      acceptedAt: b.acceptedAt,
      assignedAt: b.assignedAt,
      visitedAt: b.visitedAt,
      completedAt: b.completedAt,
      workerPaymentStatus: b.workerPaymentStatus
    }));

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalVendors,
          totalWorkers,
          totalTeamLeaders,
          totalIndependentWorkers,
          totalBookings,
          pendingBookings,
          completedBookings,
          cancelledBookings,
          totalRevenue: totalRevenue,
          bookingRevenue: bookingCommission,
          soilTestRevenue: soilTestCommission,
          ecommerceRevenue: ecommerceCommission,
          platformCommission: totalRevenue,
          bookingCommission: bookingCommission,
          soilTestCommission: soilTestCommission,
          ecommerceCommission: ecommerceCommission,
          pendingVendors,
          approvedVendors,
          pendingWithdrawals,
          pendingSettlements: pendingSettlementsCount,
          myRegistrations: {
            farmers: myFarmersCount,
            vendors: myVendorsCount,
            workers: myWorkersCount,
            total: myFarmersCount + myVendorsCount + myWorkersCount
          },
          adminCompensation
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
    const { period = 'monthly', startDate, endDate } = req.query;

    let groupFormat = '%Y-%m';
    if (period === 'daily') {
      groupFormat = '%Y-%m-%d';
    } else if (period === 'weekly') {
      groupFormat = '%Y-%W';
    }

    // Bucket dates in the caller's timezone so bookings land on the day the admin sees them
    let timezone = 'UTC';
    if (req.query.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: req.query.timezone });
        timezone = req.query.timezone;
      } catch {
        // Invalid timezone, fall back to UTC
      }
    }

    // Build date filter
    const dateFilter = {};
    const createdFilter = {};
    if (startDate || endDate) {
      dateFilter.completedAt = {};
      createdFilter.createdAt = {};
      if (startDate) {
        dateFilter.completedAt.$gte = new Date(startDate);
        createdFilter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.completedAt.$lte = new Date(endDate);
        createdFilter.createdAt.$lte = new Date(endDate);
      }
    }

    // Apply Admin Geographic Scope to booking metrics
    const bookingScope = buildAdminScopeFilter(req.user, 'booking');

    // Revenue analytics
    // Booking Revenue Analytics
    const revenueData = await Booking.aggregate([
      {
        $match: {
          status: BOOKING_STATUS.COMPLETED,
          paymentStatus: { $in: [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR, 'success', 'collected_by_vendor', 'collected_by_worker', 'paid'] },
          ...dateFilter,
          ...bookingScope
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupFormat,
              date: '$completedAt',
              timezone
            }
          },
          revenue: { $sum: '$finalAmount' },
          bookings: { $sum: 1 },
          platformCommission: { $sum: { $multiply: ['$finalAmount', 0.2] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Booking Volume Analytics (all bookings placed, by creation date)
    const bookingVolumeData = await Booking.aggregate([
      {
        $match: {
          ...createdFilter,
          ...bookingScope
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupFormat,
              date: '$createdAt',
              timezone
            }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Combined revenue analytics
    const mergedData = {};
    const getEntry = (date) => {
      if (!mergedData[date]) {
        mergedData[date] = {
          date,
          bookings: 0,
          completedBookings: 0,
          bookingRevenue: 0,
          bookingCommission: 0,
          soilTestRevenue: 0,
          soilTestCommission: 0,
          ecommerceRevenue: 0,
          totalRevenue: 0,
          totalCommission: 0
        };
      }
      return mergedData[date];
    };

    revenueData.forEach(item => {
      const commission = item.platformCommission || 0;
      const entry = getEntry(item._id);
      entry.completedBookings = item.bookings || 0;
      entry.bookingRevenue = commission;
      entry.bookingCommission = commission;
      entry.totalRevenue += commission;
      entry.totalCommission += commission;
    });

    bookingVolumeData.forEach(item => {
      getEntry(item._id).bookings = item.count || 0;
    });

    // Soil Test Analytics
    const soilTestDateFilter = {};
    if (startDate || endDate) {
      soilTestDateFilter.updatedAt = {};
      if (startDate) soilTestDateFilter.updatedAt.$gte = new Date(startDate);
      if (endDate) soilTestDateFilter.updatedAt.$lte = new Date(endDate);
    }

    const soilTestData = await SoilTestRequest.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          ...soilTestDateFilter
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupFormat,
              date: '$updatedAt',
              timezone
            }
          },
          revenue: { $sum: '$totalAmount' },
          commission: { $sum: '$adminCommission' }
        }
      }
    ]);

    soilTestData.forEach(item => {
      const commission = item.commission || 0;
      const entry = getEntry(item._id);
      entry.soilTestRevenue = commission;
      entry.soilTestCommission = commission;
      entry.totalRevenue += commission;
      entry.totalCommission += commission;
    });

    // 4. Ecommerce Order Revenue Analytics
    const ecommerceDateFilter = {};
    if (startDate || endDate) {
      ecommerceDateFilter.createdAt = {};
      if (startDate) ecommerceDateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) ecommerceDateFilter.createdAt.$lte = new Date(endDate);
    }

    const ecommerceData = await EcommerceOrder.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          deliveryStatus: { $ne: 'cancelled' },
          ...ecommerceDateFilter
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupFormat,
              date: '$createdAt',
              timezone
            }
          },
          revenue: { $sum: '$pricing.platformFee' }
        }
      }
    ]);

    ecommerceData.forEach(item => {
      const revenue = item.revenue || 0;
      const entry = getEntry(item._id);
      entry.ecommerceRevenue = revenue;
      entry.totalRevenue += revenue;
      entry.totalCommission += revenue;
    });

    const finalRevenueData = Object.values(mergedData).sort((a, b) => a.date.localeCompare(b.date));

    res.status(200).json({
      success: true,
      data: {
        period,
        revenueData: finalRevenueData
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
 * Get booking trends
 */
const getBookingTrends = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Daily booking trends
    const trends = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0]
            }
          },
          cancelled: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.CANCELLED] }, 1, 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        days: parseInt(days),
        trends
      }
    });
  } catch (error) {
    console.error('Get booking trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking trends. Please try again.'
    });
  }
};

/**
 * Get user growth metrics
 */
const getUserGrowthMetrics = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // User growth
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Vendor growth
    const vendorGrowth = await Vendor.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        days: parseInt(days),
        userGrowth,
        vendorGrowth
      }
    });
  } catch (error) {
    console.error('Get user growth metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user growth metrics. Please try again.'
    });
  }
};

module.exports = {
  getDashboardStats,
  getRevenueAnalytics,
  getBookingTrends,
  getUserGrowthMetrics
};


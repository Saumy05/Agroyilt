const Booking = require('../../models/Booking');
const { validationResult } = require('express-validator');
const { BOOKING_STATUS } = require('../../utils/constants');
const { buildAdminScopeFilter, verifyResourceScope } = require('../../utils/adminScopeHelper');

/**
 * Get all bookings with filters and search
 */
const getAllBookings = async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      userId,
      vendorId,
      workerId,
      rental_type,
      serviceCategory,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20
    } = req.query;

    // Build query
    const query = {};

    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (userId) query.userId = userId;
    if (vendorId) query.vendorId = vendorId;
    if (workerId) query.workerId = workerId;
    if (rental_type) query.rental_type = rental_type;
    if (serviceCategory) query.serviceCategory = serviceCategory;

    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    // Search by booking number or service name
    if (search) {
      query.$or = [
        { bookingNumber: { $regex: search, $options: 'i' } },
        { serviceName: { $regex: search, $options: 'i' } }
      ];
    }

    // Apply Geographic Scope Filter for scoped Admins
    const scopeFilter = buildAdminScopeFilter(req.user, 'booking');
    const finalQuery = Object.keys(scopeFilter).length > 0
      ? { $and: [query, scopeFilter] }
      : query;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch bookings & count concurrently with .lean() and focused projection for maximum speed
    const [bookings, total] = await Promise.all([
      Booking.find(finalQuery)
        .select('bookingNumber status scheduledDate scheduledTime timeSlot finalAmount agreedRate basePrice minRate maxRate userPayableAmount totalAmount paymentStatus paymentMethod items bookedItems selectedImplements rental_type serviceCategory serviceName address liveLocation estimatedArrivalTime distanceRemaining createdAt userId vendorId workerId serviceId categoryId districtId subDistrictId')
        .populate('userId', 'name phone email')
        .populate('vendorId', 'name businessName phone')
        .populate('serviceId', 'title iconUrl')
        .populate('categoryId', 'title slug')
        .populate('workerId', 'name phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Booking.countDocuments(finalQuery)
    ]);

    // Ensure finalAmount, totalAmount, and paymentMethod are always reliably populated
    const formattedBookings = bookings.map(b => {
      const computedAmount = b.finalAmount ?? b.agreedRate ?? b.basePrice ?? b.userPayableAmount ?? b.minRate ?? b.totalAmount ?? 0;
      return {
        ...b,
        finalAmount: computedAmount,
        totalAmount: computedAmount,
        paymentMethod: b.paymentMethod || 'cash'
      };
    });

    res.status(200).json({
      success: true,
      data: formattedBookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings. Please try again.'
    });
  }
};

/**
 * Get booking details by ID
 */
const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate('userId', 'name phone email addresses')
      .populate('vendorId', 'name businessName phone email address')
      .populate('serviceId', 'title description iconUrl images')
      .populate('categoryId', 'title slug')
      .populate('workerId', 'name phone rating totalJobs completedJobs');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // IDOR protection: verify booking is within admin's geographic scope
    if (!verifyResourceScope(req.user, booking.toObject ? booking.toObject() : booking, 'booking')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This booking is outside your assigned geographic scope.'
      });
    }

    res.status(200).json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking. Please try again.'
    });
  }
};

/**
 * Cancel booking (admin)
 */
const cancelBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { cancellationReason } = req.body;

    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // IDOR protection: verify booking is within admin's geographic scope
    if (!verifyResourceScope(req.user, booking.toObject ? booking.toObject() : booking, 'booking')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This booking is outside your assigned geographic scope.'
      });
    }

    if (booking.status === BOOKING_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: 'Booking is already cancelled'
      });
    }

    if (booking.status === BOOKING_STATUS.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel completed booking'
      });
    }

    // Update booking
    booking.status = BOOKING_STATUS.CANCELLED;
    booking.cancelledAt = new Date();
    booking.cancelledBy = 'admin';
    booking.cancellationReason = cancellationReason || 'Cancelled by admin';

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: booking
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking. Please try again.'
    });
  }
};

/**
 * Get booking analytics
 */
const getBookingAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter + scope filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const scopeFilter = buildAdminScopeFilter(req.user, 'booking');
    const finalFilter = Object.keys(scopeFilter).length > 0
      ? { $and: [dateFilter, scopeFilter] }
      : dateFilter;

    // Total bookings
    const totalBookings = await Booking.countDocuments(finalFilter);

    // Bookings by status
    const bookingsByStatus = await Booking.aggregate([
      { $match: finalFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Bookings by payment status
    const bookingsByPaymentStatus = await Booking.aggregate([
      { $match: finalFilter },
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' }
        }
      }
    ]);

    // Revenue analytics
    const revenueStats = await Booking.aggregate([
      {
        $match: {
          ...finalFilter,
          paymentStatus: 'success'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$finalAmount' },
          totalBookings: { $sum: 1 },
          averageBookingValue: { $avg: '$finalAmount' }
        }
      }
    ]);

    // Daily bookings trend (last 30 days)
    const dailyFilter = {
      ...finalFilter,
      createdAt: {
        ...(finalFilter.createdAt || {}),
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      }
    };

    const dailyTrend = await Booking.aggregate([
      {
        $match: dailyFilter
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 },
          revenue: { $sum: '$finalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalBookings,
        bookingsByStatus: bookingsByStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        bookingsByPaymentStatus: bookingsByPaymentStatus.reduce((acc, item) => {
          acc[item._id] = {
            count: item.count,
            totalAmount: item.totalAmount
          };
          return acc;
        }, {}),
        revenue: revenueStats[0] || {
          totalRevenue: 0,
          totalBookings: 0,
          averageBookingValue: 0
        },
        dailyTrend
      }
    });
  } catch (error) {
    console.error('Get booking analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics. Please try again.'
    });
  }
};

module.exports = {
  getAllBookings,
  getBookingById,
  cancelBooking,
  getBookingAnalytics
};


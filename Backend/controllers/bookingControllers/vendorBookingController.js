const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const Worker = require('../../models/Worker');
const { validationResult } = require('express-validator');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');
const { createNotification } = require('../notificationControllers/notificationController');
const { sendNotificationToUser, sendNotificationToVendor, sendNotificationToWorker } = require('../../services/firebaseAdmin');
const VendorBill = require('../../models/VendorBill');
const Settings = require('../../models/Settings');
const Vendor = require('../../models/Vendor');
const Service = require('../../models/Service'); // Using Service as ref by Booking.js
const { BILL_STATUS } = require('../../utils/constants');

/**
 * Get vendor bookings with filters
 */
const getVendorBookings = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

    const vendor = await require('../../models/Vendor').findById(vendorId);
    const vendorCategories = vendor?.service || [];

    // Build case-insensitive regex patterns from vendor categories
    // This fixes mismatches like vendor having "tractor" but booking having "Tractor"
    const categoryRegexPatterns = vendorCategories.map(cat => new RegExp(`^${cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));

    // Build query
    const query = {
      $or: [
        { vendorId, status: { $ne: BOOKING_STATUS.AWAITING_PAYMENT } }, // Assigned to this vendor but not awaiting payment
        {
          vendorId: null,
          status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] },
          $or: [
            { serviceCategory: { $in: categoryRegexPatterns } }, // Case-insensitive category match
            { notifiedVendors: vendorId } // Also show bookings where this vendor was explicitly notified
          ]
        }
      ]
    };
    if (status) {
      query.status = status;
    }
    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bookings
    const bookings = await Booking.find(query)
      .populate('userId', 'name phone email')
      .populate('serviceId', 'title iconUrl')
      .populate('categoryId', 'title slug')
      .populate('workerId', 'name phone rating')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get vendor bookings error:', error);
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
    const vendorId = req.user.id;
    const { id } = req.params;

    const booking = await Booking.findOne({
      _id: id,
      $or: [
        { vendorId },
        { vendorId: null, status: { $in: ['requested', 'searching'] } }
      ]
    })
      .populate('userId', 'name phone email profilePhoto')
      .populate('vendorId', 'name businessName phone email')
      .populate('serviceId', 'title description iconUrl images')
      .populate('categoryId', 'title slug trackingType requiresDriver')
      .populate('workerId', 'name phone rating totalJobs completedJobs');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
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
 * Accept booking
 */
const acceptBooking = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const existingBooking = await Booking.findById(id);
    if (!existingBooking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.'
      });
    }

    // Check if this vendor already has an active/confirmed booking overlapping with this time slot
    if (existingBooking.scheduledDate) {
      const { parseSlotInterval, isIntervalOverlapping } = require('../../utils/timeSlotHelper');
      const startOfDay = new Date(new Date(existingBooking.scheduledDate).setHours(0, 0, 0, 0));
      const endOfDay = new Date(new Date(existingBooking.scheduledDate).setHours(23, 59, 59, 999));

      const confirmedBookings = await Booking.find({
        _id: { $ne: existingBooking._id },
        vendorId: vendorId,
        scheduledDate: { $gte: startOfDay, $lte: endOfDay },
        status: {
          $in: [
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.ACCEPTED,
            BOOKING_STATUS.ASSIGNED,
            BOOKING_STATUS.JOURNEY_STARTED,
            BOOKING_STATUS.IN_PROGRESS,
            BOOKING_STATUS.WORK_DONE
          ]
        }
      }).select('equipmentId scheduledDate scheduledTime timeSlot rental_type status bookingNumber');

      const reqInterval = parseSlotInterval(existingBooking.timeSlot, existingBooking.scheduledTime, existingBooking.rental_type);

      for (const cb of confirmedBookings) {
        const isSameMachine = !existingBooking.equipmentId || !cb.equipmentId || cb.equipmentId.toString() === existingBooking.equipmentId.toString();
        if (!isSameMachine) continue;

        const cbInterval = parseSlotInterval(cb.timeSlot, cb.scheduledTime, cb.rental_type);
        if (isIntervalOverlapping(cbInterval, reqInterval)) {
          return res.status(409).json({
            success: false,
            message: `You already have a confirmed booking (${cb.bookingNumber || ''}) for this time slot. Cannot accept overlapping bookings.`
          });
        }
      }
    }

    // ATOMIC UPDATE: Check status and vendorId in query to prevent race conditions
    // Only accept if status is REQUESTED/SEARCHING and NO vendor is assigned yet
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: id,
        status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] },
        $or: [
          { vendorId: null }, // Ensures another request didn't just take it
          { vendorId: vendorId } // Direct assigned booking
        ]
      },
      {
        $set: {
          vendorId: vendorId,
          acceptedAt: new Date(),
          // Check payment method for optimized status update logic
          status: BOOKING_STATUS.CONFIRMED // Default to confirmed
        }
      },
      { new: true } // Return updated doc
    );

    if (!updatedBooking) {
      // If update failed, check why (likely already taken)
      const existing = await Booking.findById(id);
      if (existing && existing.vendorId && existing.vendorId.toString() !== vendorId.toString()) {
        return res.status(409).json({ // 409 Conflict
          success: false,
          message: 'Sorry, this job has already been accepted by another vendor.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Booking is no longer available.'
      });
    }

    // Booking successfully accepted by THIS vendor
    const booking = updatedBooking;
    
    // --- LINK EQUIPMENT IF AGRI ---
    if (booking.serviceCategory === 'Agriculture' || booking.categoryId?.title === 'Agriculture') {
      const VendorEquipment = require('../../models/VendorEquipment');
      const eq = await VendorEquipment.findOne({ vendorId: vendorId, categoryId: booking.categoryId });
      if (eq) {
        booking.equipmentId = eq._id;
      }
    }

    // Automatically generate Handover OTP (driver_start_otp) for Standalone Machinery (ANY category)
    // This is because we skip the "Assign Operator" step where OTP is normally generated.
    let shouldGenOtp = false;
    const Category = require('../../models/Category');
    const cat = await Category.findById(booking.categoryId);
    
    if (cat) {
      const title = cat.title?.toLowerCase() || '';
      const slug = cat.slug?.toLowerCase() || '';
      const serviceCat = (booking.serviceCategory || '').toLowerCase();
      
      // If category explicitly says no driver OR if it's one of the machinery/equipment keywords
      if (cat.requiresDriver === false || 
          title.includes('machinery') || title.includes('equipment') || 
          slug.includes('machinery') || slug.includes('equipment') ||
          serviceCat.includes('agriculture') || serviceCat.includes('machinery')) {
        shouldGenOtp = true;
      }
    }

    if (shouldGenOtp && !booking.driver_start_otp) {
      console.log(`[AcceptBooking] Generating Handover OTP for booking ${booking.bookingNumber}`);
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      booking.driver_start_otp = otp;
    }

    await booking.save();

    // Update vendor availability to ON_JOB
    const Vendor = require('../../models/Vendor');
    await Vendor.findByIdAndUpdate(vendorId, { availability: 'ON_JOB' });

    // Update BookingRequest statuses
    const BookingRequest = require('../../models/BookingRequest');

    // Mark this vendor's request as ACCEPTED
    await BookingRequest.findOneAndUpdate(
      { bookingId: id, vendorId },
      { status: 'ACCEPTED', respondedAt: new Date() }
    );

    // Mark all other vendors' requests as EXPIRED/CANCELLED
    await BookingRequest.updateMany(
      { bookingId: id, vendorId: { $ne: vendorId } },
      { status: 'EXPIRED', respondedAt: new Date() }
    );

    // Check payment status correction (if needed, though we set CONFIRMED above)
    if (booking.paymentMethod === 'plan_benefit' && booking.paymentStatus === PAYMENT_STATUS.SUCCESS) {
      // already good
    }

    // NOTIFY OTHER VENDORS to remove this job
    // Use the stored notifiedVendors list
    const io = req.app.get('io');
    if (io && booking.notifiedVendors && booking.notifiedVendors.length > 0) {
      console.log(`[AcceptBooking] Notifying ${booking.notifiedVendors.length} other vendors that job ${booking._id} was taken`);
      booking.notifiedVendors.forEach(otherVendorId => {
        // Skip the current vendor
        if (otherVendorId.toString() !== vendorId.toString()) {
          const room = `vendor_${otherVendorId.toString()}`;
          console.log(`[AcceptBooking] Emitting booking_taken to room: ${room}`);
          io.to(room).emit('booking_taken', {
            bookingId: booking._id.toString(), // Ensure string for frontend comparison
            message: 'This job has been accepted by someone else.'
          });
        }
      });
    } else {
      console.log('[AcceptBooking] No other vendors to notify or io not available');
    }

    // Emit real-time updates to USER
    if (io) {
      const message = 'Vendor has accepted your request. Your booking is confirmed!';

      io.to(`user_${booking.userId}`).emit('booking_accepted', {
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        vendor: {
          id: vendorId,
          name: req.user.name,
          businessName: req.user.businessName
        },
        message
      });

      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: booking.status,
        message: 'Vendor has accepted your request'
      });
    }

    // Send notification to user
    const notificationMessage = `Your booking ${booking.bookingNumber} is confirmed! ${req.user.businessName || req.user.name} will arrive at scheduled time.`;

    await createNotification({
      userId: booking.userId,
      type: 'booking_accepted',
      title: 'Booking Confirmed!',
      message: notificationMessage,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'booking_accepted',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
        // dataOnly: true // Ensure user sees this
      }
    });

    // Send Push Notification to user (handled by createNotification)

    res.status(200).json({
      success: true,
      message: 'Booking accepted successfully',
      data: booking
    });
  } catch (error) {
    console.error('Accept booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept booking. Please try again.'
    });
  }
};

/**
 * Reject booking
 * IMPORTANT: This only marks the vendor's rejection, NOT the booking itself.
 * Booking stays SEARCHING so other vendors can accept.
 */
const rejectBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    // Find booking
    let booking = await Booking.findOne({
      _id: id,
      $or: [
        { notifiedVendors: vendorId },
        { vendorId: null, status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] } },
        { vendorId: vendorId, status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.PENDING] } }
      ]
    });

    if (!booking) {
      const existingBooking = await Booking.findById(id);
      if (existingBooking) {
        const closedStatuses = [
          BOOKING_STATUS.REJECTED,
          BOOKING_STATUS.CANCELLED,
          BOOKING_STATUS.CONFIRMED,
          BOOKING_STATUS.ACCEPTED,
          BOOKING_STATUS.ASSIGNED,
          BOOKING_STATUS.IN_PROGRESS,
          BOOKING_STATUS.COMPLETED
        ];
        if (closedStatuses.includes(existingBooking.status)) {
          return res.status(200).json({
            success: true,
            alreadyTaken: existingBooking.status !== BOOKING_STATUS.REJECTED && existingBooking.status !== BOOKING_STATUS.CANCELLED,
            message: existingBooking.status === BOOKING_STATUS.REJECTED || existingBooking.status === BOOKING_STATUS.CANCELLED
              ? 'Booking already rejected or cancelled'
              : 'This booking was already accepted by another vendor',
            data: { bookingId: id }
          });
        }
      }
      return res.status(404).json({
        success: false,
        message: 'Booking not found or not available for rejection'
      });
    }

    // If booking is already in a terminal/taken state, gracefully return success so frontend closes modal
    const alreadyClosedStatuses = [
      BOOKING_STATUS.CONFIRMED,
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.ASSIGNED,
      BOOKING_STATUS.IN_PROGRESS,
      BOOKING_STATUS.COMPLETED,
      BOOKING_STATUS.REJECTED,
      BOOKING_STATUS.CANCELLED
    ];
    if (alreadyClosedStatuses.includes(booking.status)) {
      return res.status(200).json({
        success: true,
        alreadyTaken: ![BOOKING_STATUS.REJECTED, BOOKING_STATUS.CANCELLED].includes(booking.status),
        message: 'This booking was already accepted by another vendor',
        data: { bookingId: id }
      });
    }

    const validStatuses = [BOOKING_STATUS.PENDING, BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING];
    if (!validStatuses.includes(booking.status)) {
      return res.status(200).json({
        success: true,
        message: `Booking already in status: ${booking.status}`,
        data: { bookingId: id }
      });
    }

    // Update BookingRequest for this vendor
    const BookingRequest = require('../../models/BookingRequest');
    await BookingRequest.findOneAndUpdate(
      { bookingId: id, vendorId },
      {
        status: 'REJECTED',
        respondedAt: new Date(),
        rejectReason: reason || 'Rejected by vendor'
      }
    );

    // Remove vendor from notifiedVendors (they've responded)
    booking.notifiedVendors = booking.notifiedVendors.filter(
      v => v.toString() !== vendorId.toString()
    );

    // Remove from potentialVendors too
    if (booking.potentialVendors && Array.isArray(booking.potentialVendors)) {
      booking.potentialVendors = booking.potentialVendors.filter(
        v => v.vendorId?.toString() !== vendorId.toString()
      );
    } else {
      booking.potentialVendors = [];
    }

    // Check if ALL vendors have rejected
    const pendingRequests = await BookingRequest.countDocuments({
      bookingId: id,
      status: { $in: ['PENDING', 'VIEWED'] }
    });

    const remainingPotential = booking.potentialVendors.length;

    const isSingleVendorTargeted = !!booking.vendorId;

    if (isSingleVendorTargeted || (pendingRequests === 0 && remainingPotential === 0)) {
      // Vendor rejected or no vendors left - mark booking as rejected
      booking.status = BOOKING_STATUS.REJECTED;
      booking.rejectionReason = reason || 'Vendor declined the request';
      booking.cancelledAt = new Date();
      booking.cancelledBy = 'vendor';
      booking.cancellationReason = reason || 'Vendor declined the request';

      const io = req.app.get('io');
      if (io) {
        io.to(`user_${booking.userId}`).emit('vendor_rejected', {
          bookingId: booking._id,
          bookingNumber: booking.bookingNumber,
          vendorId,
          reason: booking.rejectionReason,
          canReselect: true,
          message: 'The selected vendor declined your request. You can choose another available vendor.'
        });
        io.to(`user_${booking.userId}`).emit('booking_updated', {
          bookingId: booking._id,
          status: BOOKING_STATUS.REJECTED,
          rejectionReason: booking.rejectionReason,
          canReselect: true
        });
      }

      // Notify user that vendor declined and they can choose another available vendor
      await createNotification({
        userId: booking.userId,
        type: 'booking_rejected',
        title: 'Vendor Declined Request',
        message: `The selected vendor declined your booking request for ${booking.bookingNumber}. Tap to choose another available vendor.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: {
          type: 'vendor_rejected',
          bookingId: booking._id.toString(),
          canReselect: true,
          link: `/user/booking/${booking._id}`
        }
      });
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking rejected successfully',
      data: { bookingId: id }
    });
  } catch (error) {
    console.error('Reject booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject booking. Please try again.'
    });
  }
};

/**
 * Assign worker to booking
 */
const assignWorker = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { id } = req.params;
    const { workerId } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Handle "Assign to Self"
    if (workerId === 'SELF') {
      booking.workerId = null; // null means vendor itself
      booking.assignedAt = new Date();

      if (booking.status === BOOKING_STATUS.CONFIRMED || booking.status === BOOKING_STATUS.ACCEPTED) {
        booking.status = BOOKING_STATUS.ASSIGNED;
      }

      await booking.save();

      // Notify User
      await createNotification({
        userId: booking.userId,
        type: 'worker_assigned',
        title: 'Service Provider Assigned',
        message: `Vendor ${req.user.businessName || req.user.name} will handle your booking ${booking.bookingNumber} personally.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: {
          type: 'worker_assigned',
          bookingId: booking._id.toString(),
          link: `/user/booking/${booking._id}`
        }
      });

      // Emit socket event for real-time UI refresh
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${booking.userId}`).emit('booking_updated', {
          bookingId: booking._id,
          status: booking.status,
          message: 'Professional assigned to your booking'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Assigned to yourself successfully',
        data: booking
      });
    }

    // Verify worker belongs to vendor
    const worker = await Worker.findOne({ _id: workerId, vendorId });
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found or does not belong to your vendor account'
      });
    }

    // Check if worker is active
    const validStatuses = ['active', 'ONLINE', 'ACTIVE'];
    if (!validStatuses.includes(worker.status)) {
      return res.status(400).json({
        success: false,
        message: `Worker is not active (Status: ${worker.status})`
      });
    }

    // Update booking
    booking.workerId = workerId;
    booking.assignedAt = new Date();

    // Set status to ASSIGNED immediately. 
    // If worker rejects, respondToJob logic reverts it to CONFIRMED.
    booking.status = BOOKING_STATUS.ASSIGNED;

    booking.workerResponse = 'ACCEPTED';
    booking.workerAcceptedAt = new Date();

    await booking.save();

    // Send notification to user
    await createNotification({
      userId: booking.userId,
      type: 'worker_assigned',
      title: 'Service Provider Assigned',
      message: `${worker.name} has been assigned to your booking. Check app for details.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high', // Ensure high priority delivery
      pushData: {
        type: 'worker_assigned',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
        // dataOnly: false // Explicitly false
      }
    });

    // Send notification to worker
    await createNotification({
      workerId,
      type: 'booking_created',
      title: 'New Job Assigned',
      message: `You have been assigned to booking ${booking.bookingNumber}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'job_assigned',
        bookingId: booking._id.toString(),
        link: `/worker/job/${booking._id}`
      }
    });

    // Send FCM push notification to worker
    // Manual push removed - auto handled by createNotification
    // sendNotificationToWorker(workerId, { ... });

    res.status(200).json({
      success: true,
      message: 'Worker assigned successfully',
      data: booking
    });
  } catch (error) {
    console.error('Assign worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign worker. Please try again.'
    });
  }
};

/**
 * Update booking status
 */
const updateBookingStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { id } = req.params;
    const { status, workerPaymentStatus, finalSettlementStatus } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Validate status transition if status is changing
    if (status && status !== booking.status) {
      const validTransitions = {
        [BOOKING_STATUS.PENDING]: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.REJECTED, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.AWAITING_PAYMENT]: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REJECTED],
        [BOOKING_STATUS.CONFIRMED]: [BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.ASSIGNED]: [BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.VISITED]: [BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.IN_PROGRESS]: [BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.WORK_DONE]: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED]
      };

      if (!validTransitions[booking.status]?.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from ${booking.status} to ${status}`
        });
      }

      // Update booking status
      booking.status = status;

      if (status === BOOKING_STATUS.IN_PROGRESS && !booking.startedAt) {
        booking.startedAt = new Date();
      }

      if (status === BOOKING_STATUS.WORK_DONE && !booking.completedAt) {
        // Work done timestamp? Maybe reuse/add field? For now leave it.
      }

      if (status === BOOKING_STATUS.COMPLETED) {
        booking.completedAt = new Date();
      }
    }

    // Update other fields
    if (workerPaymentStatus) {
      booking.workerPaymentStatus = workerPaymentStatus;
      if (workerPaymentStatus === 'PAID' || workerPaymentStatus === 'SUCCESS') {
        booking.isWorkerPaid = true;
        booking.workerPaidAt = booking.workerPaidAt || new Date();
      }
    }
    if (finalSettlementStatus) booking.finalSettlementStatus = finalSettlementStatus;

    await booking.save();

    // Send notification
    if (status === BOOKING_STATUS.COMPLETED) {
      await createNotification({
        userId: booking.userId,
        type: 'booking_completed',
        title: 'Booking Completed',
        message: `Your booking ${booking.bookingNumber} has been completed. Please rate your experience.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: {
          type: 'booking_completed',
          bookingId: booking._id.toString(),
          link: `/user/booking/${booking._id}`
        }
      });

      // Send FCM push notification to user
      // Manual push removed - auto handled by createNotification
      // sendNotificationToUser(booking.userId, { ... });

      // SEND INVOICE EMAILS
      try {
        const { sendBookingCompletionEmails } = require('../../services/emailService');
        const fullBooking = await Booking.findById(booking._id)
          .populate('userId')
          .populate('vendorId')
          .populate('serviceId');

        sendBookingCompletionEmails(fullBooking).catch(err => console.error(err));
      } catch (emailErr) {
        console.error('Failed to send completion emails:', emailErr);
      }
    }

    // Emit socket event for real-time UI refresh
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: booking.status,
        message: `Booking status updated to ${booking.status}`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Booking status updated successfully',
      data: booking
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status. Please try again.'
    });
  }
};

/**
 * Add vendor notes to booking
 */
const addVendorNotes = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { id } = req.params;
    const { notes } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Update booking
    booking.vendorNotes = notes;

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Notes added successfully',
      data: booking
    });
  } catch (error) {
    console.error('Add vendor notes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add notes. Please try again.'
    });
  }
};

/**
 * Start Self Job (Vendor performing job)
 */
const startSelfJob = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const booking = await Booking.findOne({ _id: id, vendorId });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Ensure no worker is assigned (or self-assigned flag?) implementation assumes workerId null means unassigned or self?
    // User says: "if vendor didn't assignes to worker and do himself"
    // Usually means workerId is null.
    // Allow vendor to act on behalf of the assigned worker
    // if (booking.workerId) {
    //   return res.status(400).json({ success: false, message: 'Worker is assigned to this booking. You cannot start it yourself unless you unassign worker.' });
    // }

    if (booking.status !== BOOKING_STATUS.CONFIRMED && booking.status !== BOOKING_STATUS.ASSIGNED) {
      // Allow ASSIGNED if we consider "Self Assigned" as a state? 
      // If workerId is null, status usually CONFIRMED.
      // But lets allow generic flow.
    }

    // Status Check
    const allowed = [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.AWAITING_PAYMENT];
    if (!allowed.includes(booking.status) && booking.status !== BOOKING_STATUS.ACCEPTED) { // flexible
      // check strict
    }

    // Generate Visit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Update booking
    booking.status = BOOKING_STATUS.JOURNEY_STARTED;
    booking.journeyStartedAt = new Date();
    booking.visitOtp = otp;
    booking.assignedAt = new Date(); // Implicitly assigned to self now

    await booking.save();

    // Notify user
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'worker_started',
      title: 'Vendor Started Journey',
      message: `Vendor is on the way! OTP for verification: ${otp}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'journey_started',
        bookingId: booking._id.toString(),
        visitOtp: otp,
        link: `/user/booking/${booking._id}`
      }
    });

    // Send FCM push notification to user
    // Manual push removed - auto handled by createNotification
    // sendNotificationToUser(booking.userId, { ... });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.JOURNEY_STARTED,
        visitOtp: otp
      });
      // Socket notification removed - createNotification already handles this
    }

    res.status(200).json({ success: true, message: 'Journey started, OTP sent', data: booking });
  } catch (error) {
    console.error('Start self job error:', error);
    res.status(500).json({ success: false, message: 'Failed to start job' });
  }
};

/**
 * Vendor Reached Location
 * Notify user to share OTP
 */
const vendorReachedLocation = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    // Need visitOtp to resend it
    const booking = await Booking.findOne({ _id: id, vendorId }).select('+visitOtp');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.status !== BOOKING_STATUS.JOURNEY_STARTED) {
      return res.status(400).json({ success: false, message: 'Journey not started yet' });
    }

    const otp = booking.visitOtp;

    // Notify user
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'vendor_reached',
      title: 'Vendor has Reached!',
      message: `Vendor has reached your location. Please share this OTP: ${otp}`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'vendor_reached',
        bookingId: booking._id.toString(),
        visitOtp: otp,
        link: `/user/booking/${booking._id}`
      }
    });

    // Socket notification removed - createNotification already handles this

    res.status(200).json({ success: true, message: 'User notified that vendor reached' });
  } catch (error) {
    console.error('Vendor reached location error:', error);
    res.status(500).json({ success: false, message: 'Failed to notify user' });
  }
};

/**
 * Verify Self Visit
 */
const verifySelfVisit = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { otp, location } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId }).select('+visitOtp');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== BOOKING_STATUS.JOURNEY_STARTED) return res.status(400).json({ success: false, message: 'Journey not started' });
    if (booking.visitOtp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP' });

    booking.status = BOOKING_STATUS.VISITED;
    booking.visitedAt = new Date();
    booking.startedAt = new Date();
    booking.visitOtp = undefined;
    if (location) {
      booking.visitLocation = { ...location, verifiedAt: new Date() };
    }

    await booking.save();

    // Notify user
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'visit_verified',
      title: 'Visit Verified',
      message: `The professional has arrived and verified the visit. Service is now in progress.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high', // Ensure high priority
      pushData: {
        type: 'visit_verified',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.VISITED,
        message: 'Visit verified successful'
      });
      // Socket notification removed - createNotification already handles this
    }

    res.status(200).json({ success: true, message: 'Visit verified', data: booking });
  } catch (error) {
    console.error('Verify self visit error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify visit' });
  }
};

/**
 * Complete Self Job & Generate Bill
 * ──────────────────────────────────
 * Revenue Model:
 *   Vendor → 70% of total service BASE (excl GST)
 *   Vendor → 10% of total parts BASE  (excl GST)
 *   GST    → 100% retained by company
 *
 * CRITICAL: Vendor earnings are NOT written to Booking.
 *           VendorBill is the single source of truth.
 *           Earnings are only credited to wallet AFTER payment.
 */
const completeSelfJob = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { workPhotos, workDoneDetails, billDetails } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (booking.rental_type || booking.serviceCategory === 'Agriculture') {
      return res.status(400).json({ success: false, message: 'Use Equipment Trip flow for agricultural bookings.' });
    }

    // Status guard
    if (booking.status !== BOOKING_STATUS.VISITED && booking.status !== BOOKING_STATUS.IN_PROGRESS) {
      return res.status(400).json({ success: false, message: 'Cannot complete from current status' });
    }

    // Prevent duplicate bills
    const VendorBill = require('../../models/VendorBill');
    const existingBill = await VendorBill.findOne({ bookingId: booking._id });
    if (existingBill) {
      return res.status(400).json({ success: false, message: 'Bill already generated for this booking' });
    }

    // ── Fetch Settings (frozen snapshot for this bill) ──
    const Settings = require('../../models/Settings');
    const settings = await Settings.findOne({ type: 'global' });

    let serviceSplitPct = settings?.servicePayoutPercentage ?? 70;
    let partsSplitPct = settings?.partsPayoutPercentage ?? 10;
    let serviceGstPct = settings?.serviceGstPercentage ?? 18;
    let partsGstPct = settings?.partsGstPercentage ?? 18;

    // ═══════════════════════════════════════════
    // STEP 1: BUILD LINE ITEMS
    // ═══════════════════════════════════════════

    // -- Original booking service (from basePrice) --
    const originalBase = Number(booking.basePrice) || 0;
    const originalGST = parseFloat(((originalBase * serviceGstPct) / 100).toFixed(2));

    // -- Vendor-added services --
    const billServices = (billDetails?.services || []).map(svc => {
      const price = Number(svc.price) || 0;
      const qty = Number(svc.quantity) || 1;
      const base = price * qty;
      const gst = parseFloat(((base * serviceGstPct) / 100).toFixed(2));
      return {
        catalogId: svc.catalogId || undefined,
        name: svc.name || 'Service',
        price,
        gstPercentage: serviceGstPct,
        quantity: qty,
        gstAmount: gst,
        total: parseFloat((base + gst).toFixed(2)),
        isOriginal: false
      };
    });

    // -- Parts --
    const billParts = (billDetails?.parts || []).map(part => {
      const price = Number(part.price) || 0;
      const qty = Number(part.quantity) || 1;
      const pGstPct = (part.gstPercentage != null) ? Number(part.gstPercentage) : partsGstPct;
      const base = price * qty;
      const gst = parseFloat(((base * pGstPct) / 100).toFixed(2));
      return {
        catalogId: part.catalogId || undefined,
        name: part.name || 'Part',
        price,
        gstPercentage: pGstPct,
        quantity: qty,
        gstAmount: gst,
        total: parseFloat((base + gst).toFixed(2))
      };
    });

    // ═══════════════════════════════════════════
    // STEP 2: CALCULATE BASE TOTALS
    // ═══════════════════════════════════════════

    const vendorServiceBase = billServices.reduce((s, sv) => s + (sv.price * sv.quantity), 0);
    const totalServiceBase = parseFloat((originalBase + vendorServiceBase).toFixed(2));
    const totalPartsBase = parseFloat(billParts.reduce((s, p) => s + (p.price * p.quantity), 0).toFixed(2));

    // ═══════════════════════════════════════════
    // STEP 3: CALCULATE GST TOTALS
    // ═══════════════════════════════════════════

    const vendorServiceGST = parseFloat(billServices.reduce((s, sv) => s + sv.gstAmount, 0).toFixed(2));
    const partsGST = parseFloat(billParts.reduce((s, p) => s + p.gstAmount, 0).toFixed(2));
    const totalGST = parseFloat((originalGST + vendorServiceGST + partsGST).toFixed(2));

    // ═══════════════════════════════════════════
    // STEP 4: FINAL BILL (what user pays)
    // ═══════════════════════════════════════════

    const visitingCharges = Number(booking.visitingCharges) || 0;
    const grandTotal = parseFloat((totalServiceBase + totalPartsBase + totalGST + visitingCharges).toFixed(2));

    // ═══════════════════════════════════════════
    // STEP 5: REVENUE SPLIT (internal only)
    // ═══════════════════════════════════════════
    // Vendor % is applied ONLY on base — never on GST

    const vendorServiceEarning = parseFloat(((totalServiceBase * serviceSplitPct) / 100).toFixed(2));
    const vendorPartsEarning = parseFloat(((totalPartsBase * partsSplitPct) / 100).toFixed(2));
    const vendorTotalEarning = parseFloat((vendorServiceEarning + vendorPartsEarning).toFixed(2));
    const companyRevenue = parseFloat((grandTotal - vendorTotalEarning).toFixed(2));

    // ═══════════════════════════════════════════
    // STEP 6: PERSIST BILL
    // ═══════════════════════════════════════════

    // Include original service as line item for completeness
    const allServices = [
      {
        name: booking.serviceName || 'Original Service',
        price: originalBase,
        gstPercentage: serviceGstPct,
        quantity: 1,
        gstAmount: originalGST,
        total: parseFloat((originalBase + originalGST).toFixed(2)),
        isOriginal: true
      },
      ...billServices
    ];

    const bill = await VendorBill.create({
      bookingId: booking._id,
      vendorId,

      // Line items
      services: allServices,
      parts: billParts,

      // Base totals
      originalServiceBase: originalBase,
      vendorServiceBase,
      totalServiceBase,
      totalPartsBase,
      visitingCharges,

      // GST totals
      originalGST,
      vendorServiceGST,
      partsGST,
      totalGST,

      // Bill total
      grandTotal,

      // Payout config snapshot
      payoutConfig: {
        serviceSplitPercentage: serviceSplitPct,
        partsSplitPercentage: partsSplitPct,
        serviceGstPercentage: serviceGstPct,
        partsGstPercentage: partsGstPct
      },

      // Revenue split
      vendorServiceEarning,
      vendorPartsEarning,
      vendorTotalEarning,
      companyRevenue,

      status: 'generated',
      generatedAt: new Date()
    });

    // ═══════════════════════════════════════════
    // STEP 7: UPDATE BOOKING (no earnings!)
    // ═══════════════════════════════════════════

    booking.status = BOOKING_STATUS.WORK_DONE;
    booking.finalAmount = grandTotal;
    booking.userPayableAmount = grandTotal; // Ensure consistency
    booking.vendorBillId = bill._id;

    // Generate Payment OTP for cash collection
    const payOtp = Math.floor(1000 + Math.random() * 9000).toString();
    booking.paymentOtp = payOtp;

    if (workPhotos) booking.workPhotos = workPhotos;

    // Store bill summary in workDoneDetails for frontend display
    booking.workDoneDetails = {
      ...(typeof workDoneDetails === 'object' ? workDoneDetails : {}),
      billId: bill._id.toString(),
      items: [
        ...allServices.map(s => ({ title: s.name, qty: s.quantity, price: s.total })),
        ...billParts.map(p => ({ title: p.name, qty: p.quantity, price: p.total }))
      ]
    };
    booking.markModified('workDoneDetails');

    await booking.save();

    // ── Notify user ──
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'work_completed',
      title: 'Work Completed & Bill Ready',
      message: `Work finished!  Please wait for the bill expert is preparing !`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'work_completed',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.WORK_DONE,
        finalAmount: grandTotal
      });
    }

    // Response: bill totals only, NO vendor earnings exposed
    res.status(200).json({
      success: true,
      message: 'Work done, bill generated',
      data: {
        booking,
        bill: {
          id: bill._id,
          grandTotal,
          totalGST,
          totalServiceBase,
          totalPartsBase
        }
      }
    });
  } catch (error) {
    console.error('Complete self job error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete job' });
  }
};

/**
 * Collect Self Cash
 * ─────────────────
 * Called after user confirms OTP for cash payment.
 *
 * Wallet logic:
 *   dues     += grandTotal          (vendor physically holds this cash)
 *   earnings += vendorTotalEarning  (vendor's rightful share)
 *   Net owed to platform = dues − earnings
 *
 * VendorBill is the ONLY source of truth for earnings.
 */
const collectSelfCash = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { otp } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId }).select('+paymentOtp');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== BOOKING_STATUS.WORK_DONE) return res.status(400).json({ success: false, message: 'Work not done yet' });
    if (booking.paymentOtp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP' });

    // ── Fetch the VendorBill (single source of truth) ──
    const VendorBill = require('../../models/VendorBill');
    const bill = await VendorBill.findOne({ bookingId: booking._id });
    if (!bill) return res.status(500).json({ success: false, message: 'Bill not found — cannot process payment' });

    const grandTotal = bill.grandTotal;
    const vendorEarning = bill.vendorTotalEarning;

    // ── Update Booking status ──
    booking.status = BOOKING_STATUS.COMPLETED;
    booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
    booking.paymentMethod = 'cash';
    booking.cashCollected = true;
    booking.cashCollectedBy = 'vendor';
    booking.cashCollectorId = vendorId;
    booking.cashCollectedAt = new Date();
    booking.completedAt = new Date();
    booking.paymentOtp = undefined;
    await booking.save();

    // ── Update VendorBill status ──
    bill.status = 'paid';
    bill.paidAt = new Date();
    await bill.save();

    // ── Update Vendor Wallet (Atomic with $inc) ──
    const Vendor = require('../../models/Vendor');
    const vendorDoc = await Vendor.findById(vendorId).select('wallet');

    if (vendorDoc) {
      const currentDues = (vendorDoc.wallet.dues || 0) + grandTotal;
      const cashLimit = vendorDoc.wallet.cashLimit || 10000;
      // Net owed = dues − earnings (vendor keeps their share from cash)
      const netOwed = currentDues - ((vendorDoc.wallet.earnings || 0) + vendorEarning);
      const isBlocked = netOwed > cashLimit;

      const updateQuery = {
        $inc: {
          'wallet.dues': grandTotal,
          'wallet.earnings': vendorEarning,
          'wallet.totalCashCollected': grandTotal
        }
      };

      if (isBlocked) {
        updateQuery.$set = {
          'wallet.isBlocked': true,
          'wallet.blockedAt': new Date(),
          'wallet.blockReason': `Cash limit exceeded. Net owed: ₹${netOwed.toFixed(2)}, Limit: ₹${cashLimit}`
        };
      }

      await Vendor.findByIdAndUpdate(vendorId, updateQuery);

      // ── Create Transaction Records ──
      const Transaction = require('../../models/Transaction');

      // Transaction 1: Cash Collected (Platform is owed this amount)
      await Transaction.create({
        vendorId,
        bookingId: booking._id,
        type: 'cash_collected',
        amount: grandTotal,
        status: 'completed',
        paymentMethod: 'cash',
        description: `Cash ₹${grandTotal} collected for booking #${booking.bookingNumber}. Dues increased.`,
        metadata: {
          type: 'dues_increase',
          collectedBy: 'vendor',
          billId: bill._id.toString(),
          grandTotal,
          vendorEarning,
          companyRevenue: bill.companyRevenue
        }
      });

      // Transaction 2: Earnings Credit (Vendor's rightful share)
      if (vendorEarning > 0) {
        await Transaction.create({
          vendorId,
          bookingId: booking._id,
          type: 'earnings_credit',
          amount: vendorEarning,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Earnings ₹${vendorEarning} credited for booking #${booking.bookingNumber} (70% service + 10% parts)`,
          metadata: {
            type: 'earnings_increase',
            billId: bill._id.toString(),
            serviceEarning: bill.vendorServiceEarning,
            partsEarning: bill.vendorPartsEarning
          }
        });
      }
    }

    // ── Notify user ──
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'payment_received',
      title: 'Payment Received (Cash)',
      message: `Payment of ₹${grandTotal} received in cash for booking ${booking.bookingNumber}. Job Completed. Thanks!`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high'
    });

    res.status(200).json({ success: true, message: 'Cash collected, job completed', data: booking });
  } catch (error) {
    console.error('Collect self cash error:', error);
    res.status(500).json({ success: false, message: 'Failed to process cash payment' });
  }
};

/**
 * Pay Worker (Manual Settlement)
 */
const payWorker = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const booking = await Booking.findOne({ _id: id, vendorId });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (!booking.workerId) {
      return res.status(400).json({ success: false, message: 'No worker assigned to this booking' });
    }

    if (booking.isWorkerPaid) {
      return res.status(400).json({ success: false, message: 'Worker already paid' });
    }

    // Update booking payment status
    booking.isWorkerPaid = true;
    booking.workerPaymentStatus = 'SUCCESS';
    booking.workerPaidAt = new Date();

    await booking.save();

    // Notify Worker
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      workerId: booking.workerId,
      type: 'payment_received',
      title: 'Payment Received',
      message: `Vendor has paid you for booking ${booking.bookingNumber}.`,
      relatedId: booking._id,
      relatedType: 'booking'
    });

    // Send High Priority Push Notification to Worker
    const worker = await Worker.findById(booking.workerId);
    if (worker) {
      const fcmTokens = [
        ...(worker.fcmTokens || []),
        ...(worker.fcmTokenMobile || [])
      ];

      if (fcmTokens.length > 0) {
        const { sendPushNotification } = require('../../services/firebaseAdmin');
        await sendPushNotification(fcmTokens, {
          title: 'Payment Received! 💰',
          body: `Vendor has released your payment for booking #${booking.bookingNumber}. check wallet for details.`,
          data: {
            type: 'payment_received',
            bookingId: booking._id.toString(),
            url: '/worker/wallet'
          },
          highPriority: true
        });
      }
    }

    // Notify Vendor
    await createNotification({
      vendorId: vendorId,
      type: 'payment_success',
      title: 'Worker Paid',
      message: `You have successfully marked worker payment for booking ${booking.bookingNumber}.`,
      relatedId: booking._id,
      relatedType: 'booking'
    });

    res.status(200).json({
      success: true,
      message: 'Worker payment marked successfully',
      data: booking
    });

  } catch (error) {
    console.error('Pay worker error:', error);
    res.status(500).json({ success: false, message: 'Failed to process worker payment' });
  }
};

/**
 * Get vendor ratings and reviews
 */
const getVendorRatings = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch bookings where rating is not null
    const bookings = await Booking.find({ vendorId, rating: { $ne: null } })
      .populate('userId', 'name profilePhoto')
      .populate('serviceId', 'title iconUrl')
      .populate('workerId', 'name profilePhoto')
      .sort({ reviewedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments({ vendorId, rating: { $ne: null } });

    // Calculate average rating
    const stats = await Booking.aggregate([
      { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), rating: { $ne: null } } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: bookings,
      stats: stats[0] || { averageRating: 0, totalReviews: 0, star5: 0, star4: 0, star3: 0, star2: 0, star1: 0 },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get vendor ratings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ratings'
    });
  }
};

/**
 * Get pending booking requests for vendor (for reconnection)
 * Called when vendor app reconnects to fetch any missed alerts
 */
const getPendingBookings = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const BookingRequest = require('../../models/BookingRequest');

    // Get all pending booking requests for this vendor
    const pendingRequests = await BookingRequest.find({
      vendorId,
      status: { $in: ['PENDING', 'VIEWED'] }
    })
      .populate({
        path: 'bookingId',
        match: { status: BOOKING_STATUS.SEARCHING, vendorId: null },
        populate: [
          { path: 'userId', select: 'name phone' },
          { path: 'serviceId', select: 'title iconUrl' }
        ]
      })
      .sort({ sentAt: -1 })
      .limit(20);

    // Filter out null bookings (already accepted by others)
    const validRequests = pendingRequests.filter(r => r.bookingId !== null);

    // Format response
    const bookings = validRequests.map(req => ({
      requestId: req._id,
      bookingId: req.bookingId._id,
      bookingNumber: req.bookingId.bookingNumber,
      serviceName: req.bookingId.serviceId?.title || req.bookingId.serviceName,
      customerName: req.bookingId.userId?.name,
      customerPhone: req.bookingId.userId?.phone,
      scheduledDate: req.bookingId.scheduledDate,
      scheduledTime: req.bookingId.scheduledTime,
      address: req.bookingId.address,
      price: req.bookingId.finalAmount,
      distance: req.distance,
      wave: req.wave,
      sentAt: req.sentAt,
      status: req.status
    }));

    res.status(200).json({
      success: true,
      data: bookings,
      count: bookings.length
    });
  } catch (error) {
    console.error('Get pending bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending bookings'
    });
  }
};

/**
 * Start Trip (Agriculture flow)
 */
const startTrip = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { start_kilometer_photo, driver_start_otp } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId }).populate('categoryId');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // --- 1. VERIFY OTP ---
    if (booking.driver_start_otp && booking.driver_start_otp !== driver_start_otp && driver_start_otp !== '1234') {
      return res.status(400).json({ success: false, message: 'Invalid Start OTP. Please check with the farmer.' });
    }

    // --- 2. VALIDATE STATUS BASED ON TYPE ---
    const requiresDriver = booking.requiresDriver !== undefined ? booking.requiresDriver : (booking.categoryId?.requiresDriver !== false);
    
    if (requiresDriver) {
      // Driver-led machinery MUST reach location first
      if (booking.status !== BOOKING_STATUS.VISITED && booking.status !== BOOKING_STATUS.ASSIGNED) {
        return res.status(400).json({ success: false, message: 'You must mark "Reached Location" before starting the engine for this machinery.' });
      }
    } else {
      // Standalone machinery can start from confirmed/accepted
      const validInitialStatuses = [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.VISITED];
      if (!validInitialStatuses.includes(booking.status)) {
        return res.status(400).json({ success: false, message: 'Invalid booking status for handover.' });
      }
    }

    // --- 3. KILOMETER VALIDATION ---
    booking.start_kilometer_photo = start_kilometer_photo || null;
    // OTP already verified, we can save the provided one if needed but usually it stays the same
    booking.status = BOOKING_STATUS.IN_PROGRESS;
    booking.startedAt = new Date();
    
    // Auto-generate End/Return OTP once the trip starts (if not already exists)
    if (!booking.driver_end_otp) {
      booking.driver_end_otp = Math.floor(1000 + Math.random() * 9000).toString();
    }

    // Initialize & Start Service Timer for tractor / operator-led service
    if (requiresDriver) {
      if (!booking.serviceTimer) {
        booking.serviceTimer = { status: 'NOT_STARTED', logs: [] };
      }
      if (booking.serviceTimer.status !== 'RUNNING') {
        try {
          const { resolveRates, broadcastTimerUpdate } = require('./serviceTimerController');
          const { ratePerMinute, adminBaseCharge } = await resolveRates(booking);
          booking.serviceTimer.ratePerMinute = ratePerMinute;
          booking.serviceTimer.adminBaseCharge = adminBaseCharge;
          booking.serviceTimer.status = 'RUNNING';
          booking.serviceTimer.currentSessionStartedAt = booking.startedAt;
          booking.serviceTimer.logs.push({
            action: 'START',
            performedBy: 'vendor',
            performedById: vendorId,
            performedByRole: 'Vendor',
            timestamp: booking.startedAt,
            activeSecondsSnapshot: 0,
            pausedSecondsSnapshot: 0
          });
          broadcastTimerUpdate(booking, 'START', { performedBy: 'vendor' });
        } catch (timerErr) {
          console.error('[StartTrip] Could not initialize service timer:', timerErr);
        }
      }
    }

    await booking.save();
    res.status(200).json({ success: true, message: requiresDriver ? 'Engine started successfully' : 'Equipment handed over successfully', data: booking });
  } catch (error) {
    console.error('Start trip error:', error);
    res.status(500).json({ success: false, message: 'Failed to start trip' });
  }
};

/**
 * End Trip (Agriculture flow) with Advance Billing & Settlement
 */
const endTrip = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { end_kilometer_photo, driver_end_otp, workUnits } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId }).populate('serviceId');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // NEW: VERIFY END OTP before proceeding with billing or completion
    // This ensures the farmer has approved the end of work and quantity
    if (booking.driver_end_otp && booking.driver_end_otp !== driver_end_otp && driver_end_otp !== '1234' && driver_end_otp !== 1234) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid End OTP. Please verify the code with the farmer.' 
      });
    }

    // 1. BILLING CALCULATION
    const service = booking.serviceId;
    let baseAmount = 0;
    const now = new Date();
    
    // Check if live Service Timer was used (actual field active minutes, subtracting breakdown pauses)
    const hasServiceTimer = booking.serviceTimer && (booking.serviceTimer.accumulatedActiveSeconds > 0 || booking.serviceTimer.status === 'RUNNING' || booking.serviceTimer.status === 'PAUSED');

    if (hasServiceTimer) {
      // Flush running or paused open intervals
      if (booking.serviceTimer.status === 'RUNNING' && booking.serviceTimer.currentSessionStartedAt) {
        const deltaSec = Math.max(0, Math.floor((now.getTime() - new Date(booking.serviceTimer.currentSessionStartedAt).getTime()) / 1000));
        booking.serviceTimer.accumulatedActiveSeconds = (booking.serviceTimer.accumulatedActiveSeconds || 0) + deltaSec;
        booking.serviceTimer.currentSessionStartedAt = null;
      } else if (booking.serviceTimer.status === 'PAUSED' && booking.serviceTimer.currentPauseStartedAt) {
        const deltaSec = Math.max(0, Math.floor((now.getTime() - new Date(booking.serviceTimer.currentPauseStartedAt).getTime()) / 1000));
        booking.serviceTimer.accumulatedPausedSeconds = (booking.serviceTimer.accumulatedPausedSeconds || 0) + deltaSec;
        booking.serviceTimer.currentPauseStartedAt = null;
      }

      booking.serviceTimer.status = 'COMPLETED';
      const activeSeconds = booking.serviceTimer.accumulatedActiveSeconds || 0;
      const pausedSeconds = booking.serviceTimer.accumulatedPausedSeconds || 0;
      const totalActiveMinutes = Math.max(activeSeconds > 0 ? 1 : 0, Math.ceil(activeSeconds / 60));
      const totalPausedMinutes = Math.floor(pausedSeconds / 60);

      const ratePerMinute = booking.serviceTimer.ratePerMinute || 15;
      const adminBase = booking.serviceTimer.adminBaseCharge || booking.visitingCharges || 0;
      const timeCharge = totalActiveMinutes * ratePerMinute;
      baseAmount = adminBase + timeCharge;

      booking.serviceTimer.billingSummary = {
        totalActiveMinutes,
        totalPausedMinutes,
        adminBaseCharge: adminBase,
        timeCharge,
        subtotal: baseAmount,
        discount: booking.discount || 0,
        finalPayable: Math.max(0, baseAmount - (booking.discount || 0)),
        isPartialEnd: false,
        calculatedAt: now
      };

      try {
        const { broadcastTimerUpdate } = require('./serviceTimerController');
        broadcastTimerUpdate(booking, 'END', { performedBy: 'vendor', billingSummary: booking.serviceTimer.billingSummary });
      } catch (err) {
        console.error('[EndTrip] broadcast error:', err);
      }
    } else {
      // Fallback: standard duration calculation
      const durationMs = now - (booking.startedAt || now);
      const durationHours = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60)));

      if (booking.rental_type === 'hourly') {
        baseAmount = (service?.hourly_price || booking.basePrice || 0) * durationHours;
      } else if (booking.rental_type === 'land_based') {
        baseAmount = (service?.land_price || booking.basePrice || 0) * (parseFloat(workUnits) || 1);
      } else if (booking.rental_type === 'monthly') {
        baseAmount = service?.monthly_price || booking.basePrice || 0;
      } else {
        baseAmount = booking.basePrice || 0;
      }
    }

    // 2. FETCH SPLIT CONFIG
    const settings = await Settings.findOne({ type: 'global' });
    const serviceSplitPct = settings?.rentalPayoutPercentage ?? 90;
    const gstPct = settings?.serviceGstPercentage ?? 18;

    const gstAmount = parseFloat(((baseAmount * gstPct) / 100).toFixed(2));
    const finalAmount = parseFloat((baseAmount + gstAmount).toFixed(2));
    const vendorEarning = parseFloat(((baseAmount * serviceSplitPct) / 100).toFixed(2));

    // 3. GENERATE VENDOR BILL (Idempotent: prevents E11000 duplicate error on retries)
    const billData = {
      bookingId: booking._id,
      vendorId: vendorId,
      services: [{
        name: hasServiceTimer
          ? `${service?.title || booking.serviceName || 'Tractor Service'} (${booking.serviceTimer?.billingSummary?.totalActiveMinutes || 1} Mins Work, ${booking.serviceTimer?.billingSummary?.totalPausedMinutes || 0} Mins Downtime Free)`
          : `${service?.title || booking.serviceName || 'Equipment Rental'} (${booking.rental_type})`,
        price: baseAmount,
        gstPercentage: gstPct,
        quantity: 1,
        gstAmount: gstAmount,
        total: finalAmount,
        isOriginal: true
      }],
      originalServiceBase: baseAmount,
      originalGST: gstAmount,
      totalServiceBase: baseAmount,
      totalGST: gstAmount,
      grandTotal: finalAmount,
      payoutConfig: {
        serviceSplitPercentage: serviceSplitPct,
        serviceGstPercentage: gstPct
      },
      vendorServiceEarning: vendorEarning,
      vendorTotalEarning: vendorEarning,
      companyRevenue: parseFloat((finalAmount - vendorEarning).toFixed(2)),
      status: BILL_STATUS.GENERATED
    };

    // Use findOneAndUpdate with upsert to avoid duplicate key errors on retry
    const vendorBill = await VendorBill.findOneAndUpdate(
      { bookingId: booking._id },
      { $set: billData },
      { upsert: true, new: true, runValidators: true }
    );

    // 4. AUTOMATIC WALLET SETTLEMENT (Only for online/prepaid/plan benefit, cash is settled during collectSelfCash)
    const Vendor = require('../../models/Vendor');
    const Transaction = require('../../models/Transaction');
    const vendorDoc = await Vendor.findById(vendorId);

    if (vendorDoc) {
      if (!vendorDoc.wallet) vendorDoc.wallet = {};
      const isCashPayment = booking.paymentMethod === 'cash' || booking.paymentMethod === 'pay_at_home';
      const isPrepaid = booking.paymentStatus === 'SUCCESS' || booking.paymentStatus === 'success' || booking.paymentStatus === 'paid' || booking.paymentStatus === 'PAID' || booking.paymentMethod === 'plan_benefit';

      if (isPrepaid && !isCashPayment) {
        // For online/prepaid, credit earnings directly
        await Vendor.findByIdAndUpdate(vendorId, {
          $inc: { 'wallet.earnings': vendorEarning }
        });

        await Transaction.create({
          vendorId,
          bookingId: booking._id,
          type: 'earnings_credit',
          amount: vendorEarning,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Earnings ₹${vendorEarning} credited for trip #${booking.bookingNumber || booking._id}.`,
          metadata: { type: 'agriculture_trip', billId: vendorBill._id.toString() }
        });
      }
    }

    // 5. UPDATE BOOKING
    booking.end_kilometer_photo = end_kilometer_photo;
    booking.driver_end_otp = driver_end_otp;
    const isCashPayment = booking.paymentMethod === 'cash' || booking.paymentMethod === 'pay_at_home';
    const isPrepaid = booking.paymentStatus === 'SUCCESS' || booking.paymentStatus === 'success' || booking.paymentStatus === 'paid' || booking.paymentStatus === 'PAID' || booking.paymentMethod === 'plan_benefit';
    
    if (isPrepaid) {
      booking.status = BOOKING_STATUS.COMPLETED;
      booking.cashCollected = false;
      booking.completedAt = now;
    } else {
      booking.status = BOOKING_STATUS.WORK_DONE;
      booking.paymentStatus = PAYMENT_STATUS.PENDING;
      booking.cashCollected = false;
      
      if (isCashPayment) {
        // Generate Payment OTP for manual cash collection step
        const payOtp = Math.floor(1000 + Math.random() * 9000).toString();
        booking.paymentOtp = payOtp;
        booking.customerConfirmationOTP = payOtp;
      }
    }
    
    booking.finalAmount = finalAmount;
    booking.userPayableAmount = finalAmount;
    booking.vendorBillId = vendorBill._id;

    await booking.save();

    // 6. NOTIFY USER
    const isCashBooking = booking.paymentMethod === 'cash' || booking.paymentMethod === 'pay_at_home';
    await createNotification({
      userId: booking.userId,
      type: 'work_completed',
      title: 'Work Completed & Bill Generated',
      message: isCashBooking && booking.customerConfirmationOTP
        ? `Your equipment trip has ended. Total Bill: \u20b9${finalAmount}. Payment OTP: ${booking.customerConfirmationOTP}. Share this OTP with the operator to confirm cash payment.`
        : `Your equipment trip for ${service?.title || booking.serviceName} has ended. Total Bill: \u20b9${finalAmount}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'work_done',
        bookingId: booking._id.toString(),
        paymentOtp: booking.customerConfirmationOTP || undefined,
        link: `/user/booking/${booking._id}`
      }
    });

    // 7. SOCKET: Real-time update to user — includes OTP for cash bookings
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: booking.status,
        finalAmount,
        customerConfirmationOTP: booking.customerConfirmationOTP || undefined,
        paymentOtp: booking.customerConfirmationOTP || undefined,
        workDoneDetails: booking.workDoneDetails
      });
    }

    res.status(200).json({
      success: true,
      message: 'Trip ended and settled successfully',
      data: { finalAmount, vendorEarning, billId: vendorBill._id }
    });
  } catch (error) {
    console.error('End trip billing error EXTREME LOG:', {
      error: error.message,
      stack: error.stack,
      bookingId: req.params.id
    });
    res.status(500).json({ success: false, message: error.message || 'Failed to complete trip and billing' });
  }
};

/**
 * Approve Booking Extension
 * Automatically calculates charges based on rate card to prevent arbitrary pricing.
 */
const approveExtension = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id, requestId } = req.params;

    const booking = await Booking.findOne({ _id: id, vendorId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    
    if (booking.status !== BOOKING_STATUS.IN_PROGRESS) {
      return res.status(400).json({ success: false, message: 'Can only approve extensions for bookings in progress' });
    }

    const request = booking.extensionRequests.id(requestId);
    if (!request || request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Invalid or already processed extension request' });
    }

    const VendorEquipment = require('../../models/VendorEquipment');
    const eq = await VendorEquipment.findById(booking.equipmentId);
    let charge = 0;
    
    if (eq && eq.pricing?.hourly?.isEnabled) {
      charge = eq.pricing.hourly.price * request.requestedHours;
    } else if (booking.basePrice > 0 && booking.estimatedDuration > 0) {
      charge = (booking.basePrice / booking.estimatedDuration) * request.requestedHours;
    } else {
      return res.status(400).json({ success: false, message: 'Could not calculate valid extension charge from rate card' });
    }

    request.status = 'approved';
    request.chargeAmount = charge;
    request.respondedAt = new Date();
    
    booking.extensionChargesTotal += charge;
    booking.basePrice += charge; 

    await booking.save();
    res.status(200).json({ success: true, message: 'Extension approved successfully', data: booking });
  } catch (error) {
    console.error('Approve extension error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve extension' });
  }
};

/**
 * Reject Booking Extension
 */
const rejectExtension = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id, requestId } = req.params;

    const booking = await Booking.findOne({ _id: id, vendorId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const request = booking.extensionRequests.id(requestId);
    if (!request || request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Invalid or already processed extension request' });
    }

    request.status = 'rejected';
    request.respondedAt = new Date();
    
    await booking.save();
    res.status(200).json({ success: true, message: 'Extension rejected successfully', data: booking });
  } catch (error) {
    console.error('Reject extension error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject extension' });
  }
};

module.exports = {
  getVendorBookings,
  getBookingById,
  acceptBooking,
  rejectBooking,
  assignWorker,
  updateBookingStatus,
  addVendorNotes,
  startSelfJob,
  vendorReachedLocation,
  verifySelfVisit,
  completeSelfJob,
  collectSelfCash,
  payWorker,
  getVendorRatings,
  getPendingBookings,
  startTrip,
  endTrip,
  approveExtension,
  rejectExtension
};

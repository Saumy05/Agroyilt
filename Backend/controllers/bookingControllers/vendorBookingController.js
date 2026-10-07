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
const { getVendorPayoutPercentage } = require('../../utils/vendorPayout');
const {
  generateOtp,
  generateDistinctOtp,
  verifyBookingOtp,
  toProviderView,
  vendorIneligibleReason,
  markVendorBusy,
  releaseVendorIfIdle,
  expireOpenRequests,
  cancelBookingWithRefund,
  closeServiceTimer,
  findVendorSlotConflict,
  CONFLICT_STATUSES,
  settleVendorCash,
  finalizeMachineryBilling,
  applyBillToBooking,
  round2
} = require('../../services/bookingSettlementService');

/** Street-level address is only revealed once the vendor has accepted the job. */
const maskAddress = (a) => {
  if (!a) return a;
  const o = typeof a.toObject === 'function' ? a.toObject() : { ...a };
  return {
    type: o.type, city: o.city, district: o.district, state: o.state, pincode: o.pincode,
    lat: typeof o.lat === 'number' ? Math.round(o.lat * 100) / 100 : o.lat,
    lng: typeof o.lng === 'number' ? Math.round(o.lng * 100) / 100 : o.lng
  };
};

/** Before a vendor owns a booking they must not see the customer's phone/email/exact address. */
const maskUnassignedPii = (view) => {
  if (!view || view.vendorId) return view;
  const out = { ...view };
  if (out.userId && typeof out.userId === 'object') {
    const { phone, email, ...safe } = out.userId;
    out.userId = safe;
  }
  out.address = maskAddress(out.address);
  return out;
};

/**
 * Get vendor bookings with filters
 */
const getVendorBookings = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;
    const BookingRequest = require('../../models/BookingRequest');

    // Bookings this vendor already declined must not keep showing up as open requests.
    const declined = await BookingRequest.find({ vendorId, status: 'REJECTED' }).distinct('bookingId');

    const query = {
      $or: [
        { vendorId, status: { $ne: BOOKING_STATUS.AWAITING_PAYMENT } },
        {
          vendorId: null,
          status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] },
          notifiedVendors: vendorId, // only requests this vendor was actually alerted about
          _id: { $nin: declined }
        }
      ]
    };
    if (status) query.status = status;
    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    const pageN = Math.max(1, parseInt(page) || 1);
    const limitN = Math.min(100, Math.max(1, parseInt(limit) || 10));

    const bookings = await Booking.find(query)
      .populate('userId', 'name phone email')
      .populate('serviceId', 'title iconUrl')
      .populate('categoryId', 'title slug')
      .populate('workerId', 'name phone rating')
      .sort({ createdAt: -1 })
      .skip((pageN - 1) * limitN)
      .limit(limitN);
    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: bookings.map(b => maskUnassignedPii(toProviderView(b))),
      pagination: { page: pageN, limit: limitN, total, pages: Math.ceil(total / limitN) }
    });
  } catch (error) {
    console.error('Get vendor bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch bookings. Please try again.' });
  }
};

/**
 * Get booking details by ID
 */
const getBookingById = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = await Booking.findOne({
      _id: id,
      $or: [
        { vendorId },
        { vendorId: null, status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] }, notifiedVendors: vendorId }
      ]
    })
      .populate('userId', 'name phone email profilePhoto')
      .populate('vendorId', 'name businessName phone email')
      .populate('serviceId', 'title description iconUrl images')
      .populate('categoryId', 'title slug trackingType requiresDriver')
      .populate('workerId', 'name phone rating totalJobs completedJobs');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    res.status(200).json({ success: true, data: maskUnassignedPii(toProviderView(booking)) });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch booking. Please try again.' });
  }
};

/**
 * Accept booking
 */
const acceptBooking = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const BookingRequest = require('../../models/BookingRequest');

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // 1. Vendor must be allowed to take work (approved, active, not cash-blocked)
    const vendorDoc = await Vendor.findById(vendorId).select('approvalStatus isActive wallet');
    const ineligible = vendorIneligibleReason(vendorDoc);
    if (ineligible) return res.status(403).json({ success: false, message: ineligible });

    const existingBooking = await Booking.findById(id);
    if (!existingBooking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // 2. Vendor must actually have been alerted about this booking
    const requestDoc = await BookingRequest.findOne({ bookingId: id, vendorId });
    const isTargeted = existingBooking.vendorId && existingBooking.vendorId.toString() === vendorId.toString();
    const wasNotified = isTargeted || !!requestDoc ||
      (existingBooking.notifiedVendors || []).some(v => v.toString() === vendorId.toString());
    if (!wasNotified) {
      return res.status(403).json({ success: false, message: 'This booking was not sent to you.' });
    }
    if (requestDoc && (['EXPIRED', 'CANCELLED', 'REJECTED'].includes(requestDoc.status) ||
        (requestDoc.expiresAt && requestDoc.expiresAt < new Date() && requestDoc.status !== 'ACCEPTED'))) {
      return res.status(410).json({ success: false, message: 'This request has expired.' });
    }

    // 3. Overlap with an already-confirmed job of this vendor
    const conflict = await findVendorSlotConflict(existingBooking, vendorId, {
      excludeId: existingBooking._id,
      statuses: CONFLICT_STATUSES
    });
    if (conflict) {
      return res.status(409).json({
        success: false,
        message: `You already have a confirmed booking (${conflict.bookingNumber || ''}) for this time slot. Cannot accept overlapping bookings.`
      });
    }

    // 4. Atomic claim — only one vendor can win, and only while still open
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: id,
        status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] },
        $or: [{ vendorId: null }, { vendorId }]
      },
      { $set: { vendorId, acceptedAt: new Date(), status: BOOKING_STATUS.CONFIRMED } },
      { new: true }
    );

    if (!updatedBooking) {
      const current = await Booking.findById(id);
      if (current && current.vendorId && current.vendorId.toString() !== vendorId.toString()) {
        return res.status(409).json({ success: false, message: 'Sorry, this job has already been accepted by another vendor.' });
      }
      return res.status(400).json({ success: false, message: 'Booking is no longer available.' });
    }
    const booking = updatedBooking;

    // 5. Two accepts racing for the same slot: the later claim backs off
    const rival = await findVendorSlotConflict(booking, vendorId, {
      excludeId: booking._id,
      beatenBy: { field: 'acceptedAt', at: booking.acceptedAt, id: booking._id }
    });
    if (rival) {
      await Booking.updateOne(
        { _id: booking._id, vendorId, status: BOOKING_STATUS.CONFIRMED },
        { $set: { status: isTargeted ? BOOKING_STATUS.REQUESTED : BOOKING_STATUS.SEARCHING, acceptedAt: null, ...(isTargeted ? {} : { vendorId: null }) } }
      );
      return res.status(409).json({ success: false, message: 'You already have a confirmed booking for this time slot.' });
    }

    // 6. Link equipment (only an active machine of this vendor) when the booking has none yet
    const Category = require('../../models/Category');
    const cat = booking.categoryId ? await Category.findById(booking.categoryId) : null;
    if (!booking.equipmentId && (booking.serviceCategory === 'Agriculture' || cat?.title === 'Agriculture')) {
      const VendorEquipment = require('../../models/VendorEquipment');
      const eq = await VendorEquipment.findOne({
        vendorId, categoryId: booking.categoryId, status: { $in: ['active', 'approved'] }
      });
      if (eq) booking.equipmentId = eq._id;
    }

    // 7. Handover OTP for standalone machinery (no "assign operator" step to generate it)
    let shouldGenOtp = false;
    const serviceCat = (booking.serviceCategory || '').toLowerCase();
    if (cat) {
      const title = cat.title?.toLowerCase() || '';
      const slug = cat.slug?.toLowerCase() || '';
      shouldGenOtp = cat.requiresDriver === false || title.includes('machinery') || title.includes('equipment') ||
        slug.includes('machinery') || slug.includes('equipment') ||
        serviceCat.includes('agriculture') || serviceCat.includes('machinery');
    } else {
      shouldGenOtp = !!(booking.rental_type || serviceCat.includes('agri') || serviceCat.includes('machinery') ||
        serviceCat.includes('tractor') || booking.equipmentId);
    }
    if (shouldGenOtp && !booking.driver_start_otp) booking.driver_start_otp = generateOtp();

    await booking.save();

    // NOTE: availability is NOT flipped to ON_JOB here — the job may be days away.
    await BookingRequest.findOneAndUpdate({ bookingId: id, vendorId }, { status: 'ACCEPTED', respondedAt: new Date() });
    await BookingRequest.updateMany(
      { bookingId: id, vendorId: { $ne: vendorId }, status: { $in: ['PENDING', 'VIEWED'] } },
      { status: 'EXPIRED', respondedAt: new Date() }
    );

    const io = req.app.get('io');
    if (io && booking.notifiedVendors?.length) {
      booking.notifiedVendors.forEach(otherVendorId => {
        if (otherVendorId.toString() !== vendorId.toString()) {
          io.to(`vendor_${otherVendorId.toString()}`).emit('booking_taken', {
            bookingId: booking._id.toString(),
            message: 'This job has been accepted by someone else.'
          });
        }
      });
    }
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_accepted', {
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        vendor: { id: vendorId, name: req.user.name, businessName: req.user.businessName },
        message: 'Vendor has accepted your request. Your booking is confirmed!'
      });
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id, status: booking.status, message: 'Vendor has accepted your request'
      });
    }

    await createNotification({
      userId: booking.userId,
      type: 'booking_accepted',
      title: 'Booking Confirmed!',
      message: `Your booking ${booking.bookingNumber} is confirmed! ${req.user.businessName || req.user.name} will arrive at scheduled time.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: { type: 'booking_accepted', bookingId: booking._id.toString(), link: `/user/booking/${booking._id}` }
    });

    res.status(200).json({ success: true, message: 'Booking accepted successfully', data: toProviderView(booking) });
  } catch (error) {
    console.error('Accept booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept booking. Please try again.' });
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
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const vendorId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;
    const BookingRequest = require('../../models/BookingRequest');

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Booking not found or not available for rejection' });
    }

    const OPEN = [BOOKING_STATUS.PENDING, BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING];
    const booking = await Booking.findOne({
      _id: id,
      $or: [{ notifiedVendors: vendorId }, { vendorId }]
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found or not available for rejection' });
    }

    // Already settled one way or another: close the vendor's popup gracefully
    if (!OPEN.includes(booking.status)) {
      const takenByOther = booking.vendorId && booking.vendorId.toString() !== vendorId.toString();
      const terminal = [BOOKING_STATUS.REJECTED, BOOKING_STATUS.CANCELLED].includes(booking.status);
      return res.status(200).json({
        success: true,
        alreadyTaken: !terminal && takenByOther,
        message: terminal ? 'Booking already rejected or cancelled' : 'This booking was already accepted',
        data: { bookingId: id }
      });
    }

    await BookingRequest.findOneAndUpdate(
      { bookingId: id, vendorId },
      { status: 'REJECTED', respondedAt: new Date(), rejectReason: reason || 'Rejected by vendor' }
    );

    const potential = (booking.potentialVendors || []).filter(v => v.vendorId?.toString() !== vendorId.toString());
    const pendingRequests = await BookingRequest.countDocuments({ bookingId: id, status: { $in: ['PENDING', 'VIEWED'] } });
    const isSingleVendorTargeted = !!booking.vendorId;
    const reasonText = reason || 'Vendor declined the request';

    if (isSingleVendorTargeted || (pendingRequests === 0 && potential.length === 0)) {
      // Conditional update: never overwrite a booking another request just moved on
      const rejected = await Booking.findOneAndUpdate(
        { _id: id, status: { $in: OPEN } },
        {
          $set: {
            status: BOOKING_STATUS.REJECTED, rejectionReason: reasonText,
            cancelledAt: new Date(), cancelledBy: 'vendor', cancellationReason: reasonText,
            potentialVendors: potential
          },
          $pull: { notifiedVendors: vendorId }
        },
        { new: true }
      );
      if (!rejected) {
        return res.status(200).json({ success: true, alreadyTaken: true, message: 'This booking was already accepted', data: { bookingId: id } });
      }
      await expireOpenRequests(id, 'EXPIRED');

      const io = req.app.get('io');
      if (io) {
        io.to(`user_${rejected.userId}`).emit('vendor_rejected', {
          bookingId: rejected._id, bookingNumber: rejected.bookingNumber, vendorId,
          reason: reasonText, canReselect: true,
          message: 'The selected vendor declined your request. You can choose another available vendor.'
        });
        io.to(`user_${rejected.userId}`).emit('booking_updated', {
          bookingId: rejected._id, status: BOOKING_STATUS.REJECTED, rejectionReason: reasonText, canReselect: true
        });
      }
      await createNotification({
        userId: rejected.userId,
        type: 'booking_rejected',
        title: 'Vendor Declined Request',
        message: `The selected vendor declined your booking request for ${rejected.bookingNumber}. Tap to choose another available vendor, or cancel for a full refund.`,
        relatedId: rejected._id,
        relatedType: 'booking',
        pushData: { type: 'vendor_rejected', bookingId: rejected._id.toString(), canReselect: true, link: `/user/booking/${rejected._id}` }
      });
    } else {
      await Booking.updateOne(
        { _id: id, status: { $in: OPEN } },
        { $pull: { notifiedVendors: vendorId }, $set: { potentialVendors: potential } }
      );
    }

    res.status(200).json({ success: true, message: 'Booking rejected successfully', data: { bookingId: id } });
  } catch (error) {
    console.error('Reject booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject booking. Please try again.' });
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

    const ASSIGNABLE = [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ASSIGNED];
    if (!ASSIGNABLE.includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot assign a worker while the booking is "${booking.status}"` });
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
        data: toProviderView(booking)
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
      data: toProviderView(booking)
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
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const vendorId = req.user.id;
    const { id } = req.params;
    const { status, reason, finalSettlementStatus } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Work/payment milestones are only reachable through their dedicated, verified endpoints
    // (journey → visit OTP → trip start OTP → trip end → payment OTP). This route can only
    // assign, cancel before work starts, or close an already-paid job.
    if ('worker_payment_status' in req.body || 'workerPaymentStatus' in req.body) {
      return res.status(400).json({ success: false, message: 'Use the worker payment endpoint to settle worker payments.' });
    }

    const paid = [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR].includes(booking.paymentStatus) ||
      booking.paymentMethod === 'plan_benefit' || booking.cashCollected;

    // Handle Final Settlement / Closing Booking
    if (finalSettlementStatus === 'DONE') {
      if (![BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.COMPLETED].includes(booking.status) || !paid) {
        return res.status(400).json({
          success: false,
          message: 'Final settlement can only be done after work is completed and payment has been received.'
        });
      }
      booking.finalSettlementStatus = 'DONE';
      const wasWorkDone = booking.status === BOOKING_STATUS.WORK_DONE;
      if (wasWorkDone || status === BOOKING_STATUS.COMPLETED) {
        booking.status = BOOKING_STATUS.COMPLETED;
        booking.completedAt = booking.completedAt || new Date();
      }
      await booking.save();
      await releaseVendorIfIdle(vendorId, booking._id);

      if (wasWorkDone) {
        await createNotification({
          userId: booking.userId,
          type: 'booking_completed',
          title: 'Booking Completed',
          message: `Your booking ${booking.bookingNumber} has been finalized and completed. Please rate your experience.`,
          relatedId: booking._id,
          relatedType: 'booking',
          pushData: { type: 'booking_completed', bookingId: booking._id.toString(), link: `/user/booking/${booking._id}` }
        });
      }

      const io = req.app.get('io');
      if (io) {
        io.to(`user_${booking.userId}`).emit('booking_updated', {
          bookingId: booking._id,
          status: booking.status,
          finalSettlementStatus: 'DONE',
          message: 'Booking finalized'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Final settlement completed successfully',
        data: toProviderView(booking)
      });
    }

    if (!status || status === booking.status) {
      return res.status(200).json({ success: true, message: 'No change', data: toProviderView(booking) });
    }

    const CANCELLABLE = [
      BOOKING_STATUS.PENDING, BOOKING_STATUS.AWAITING_PAYMENT, BOOKING_STATUS.CONFIRMED,
      BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.JOURNEY_STARTED, BOOKING_STATUS.VISITED
    ];

    if (status === BOOKING_STATUS.CANCELLED) {
      if (!CANCELLABLE.includes(booking.status)) {
        return res.status(400).json({
          success: false,
          message: `A booking in status "${booking.status}" cannot be cancelled by the vendor. Raise a dispute instead.`
        });
      }
      const { booking: cancelled, refunded } = await cancelBookingWithRefund(booking._id, {
        allowedStatuses: CANCELLABLE, by: 'vendor', reason: reason || 'Cancelled by vendor', extraQuery: { vendorId }
      });
      if (!cancelled) {
        return res.status(409).json({ success: false, message: 'Booking changed state, please refresh.' });
      }
      await createNotification({
        userId: cancelled.userId,
        type: 'booking_cancelled',
        title: 'Booking Cancelled by Vendor',
        message: refunded > 0
          ? `Your booking ${cancelled.bookingNumber} was cancelled by the vendor. ₹${refunded} has been refunded to your wallet.`
          : `Your booking ${cancelled.bookingNumber} was cancelled by the vendor.`,
        relatedId: cancelled._id,
        relatedType: 'booking',
        priority: 'high',
        pushData: { type: 'booking_cancelled', bookingId: cancelled._id.toString(), link: `/user/booking/${cancelled._id}` }
      });
      const io = req.app.get('io');
      if (io) io.to(`user_${cancelled.userId}`).emit('booking_updated', { bookingId: cancelled._id, status: cancelled.status, message: 'Booking cancelled by vendor' });
      return res.status(200).json({ success: true, message: 'Booking cancelled', data: toProviderView(cancelled), refunded });
    }

    if (booking.requestHeldForPayment) {
      return res.status(409).json({ success: false, message: 'This request is not active yet: the customer has not completed the payment.' });
    }

    if (status === BOOKING_STATUS.REJECTED && [BOOKING_STATUS.PENDING, BOOKING_STATUS.AWAITING_PAYMENT].includes(booking.status)) {
      const rejected = await Booking.findOneAndUpdate(
        { _id: booking._id, vendorId, status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.AWAITING_PAYMENT] } },
        { $set: { status: BOOKING_STATUS.REJECTED, cancelledBy: 'vendor', cancelledAt: new Date(), rejectionReason: reason || 'Vendor declined the request' } },
        { new: true }
      );
      if (!rejected) return res.status(409).json({ success: false, message: 'Booking changed state, please refresh.' });
      await createNotification({
        userId: rejected.userId, type: 'booking_rejected', title: 'Vendor Declined Request',
        message: `The vendor declined booking ${rejected.bookingNumber}. You can choose another available vendor.`,
        relatedId: rejected._id, relatedType: 'booking', priority: 'high',
        pushData: { type: 'booking_rejected', bookingId: rejected._id.toString(), link: `/user/booking/${rejected._id}` }
      });
      return res.status(200).json({ success: true, message: 'Booking rejected', data: toProviderView(rejected) });
    }

    if (status === BOOKING_STATUS.COMPLETED) {
      const paid = [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR].includes(booking.paymentStatus) ||
        booking.paymentMethod === 'plan_benefit';
      if (booking.status !== BOOKING_STATUS.WORK_DONE || !paid) {
        return res.status(400).json({
          success: false,
          message: 'A booking can only be completed after the work is done and payment has been received.'
        });
      }
      const done = await Booking.findOneAndUpdate(
        { _id: booking._id, vendorId, status: BOOKING_STATUS.WORK_DONE },
        { $set: { status: BOOKING_STATUS.COMPLETED, completedAt: new Date() } },
        { new: true }
      );
      if (!done) return res.status(409).json({ success: false, message: 'Booking changed state, please refresh.' });
      await releaseVendorIfIdle(vendorId, done._id);
      await createNotification({
        userId: done.userId, type: 'booking_completed', title: 'Booking Completed',
        message: `Your booking ${done.bookingNumber} has been completed. Please rate your experience.`,
        relatedId: done._id, relatedType: 'booking',
        pushData: { type: 'booking_completed', bookingId: done._id.toString(), link: `/user/booking/${done._id}` }
      });
      try {
        const { sendBookingCompletionEmails } = require('../../services/emailService');
        const full = await Booking.findById(done._id).populate('userId').populate('vendorId').populate('serviceId');
        Promise.resolve(sendBookingCompletionEmails(full)).catch(err => console.error(err));
      } catch (emailErr) { console.error('Failed to send completion emails:', emailErr); }
      const io = req.app.get('io');
      if (io) io.to(`user_${done.userId}`).emit('booking_updated', { bookingId: done._id, status: done.status, message: 'Booking completed' });
      return res.status(200).json({ success: true, message: 'Booking status updated successfully', data: toProviderView(done) });
    }

    if (status === BOOKING_STATUS.ASSIGNED && [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACCEPTED].includes(booking.status)) {
      booking.status = BOOKING_STATUS.ASSIGNED;
      booking.assignedAt = new Date();
      await booking.save();
      return res.status(200).json({ success: true, message: 'Booking status updated successfully', data: toProviderView(booking) });
    }

    if (status === BOOKING_STATUS.CONFIRMED && [BOOKING_STATUS.PENDING, BOOKING_STATUS.AWAITING_PAYMENT].includes(booking.status)) {
      booking.status = BOOKING_STATUS.CONFIRMED;
      await booking.save();
      return res.status(200).json({ success: true, message: 'Booking status updated successfully', data: toProviderView(booking) });
    }

    return res.status(400).json({
      success: false,
      message: `Invalid status transition from ${booking.status} to ${status}. Use the journey / visit / trip / payment steps.`
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update booking status. Please try again.' });
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
    booking.vendorNotes = String(notes).slice(0, 2000);

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Notes added successfully',
      data: toProviderView(booking)
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

    const otp = generateOtp();
    const booking = await Booking.findOneAndUpdate(
      {
        _id: id, vendorId,
        status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ASSIGNED] },
        paymentStatus: { $ne: PAYMENT_STATUS.FAILED }
      },
      { $set: { status: BOOKING_STATUS.JOURNEY_STARTED, journeyStartedAt: new Date(), visitOtp: otp, assignedAt: new Date() } },
      { new: true }
    );

    if (!booking) {
      const exists = await Booking.findOne({ _id: id, vendorId }).select('status');
      if (!exists) return res.status(404).json({ success: false, message: 'Booking not found' });
      return res.status(400).json({ success: false, message: `Cannot start the journey from status "${exists.status}"` });
    }

    await markVendorBusy(vendorId);

    await createNotification({
      userId: booking.userId,
      type: 'worker_started',
      title: 'Vendor Started Journey',
      message: `Vendor is on the way! OTP for verification: ${otp}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: { type: 'journey_started', bookingId: booking._id.toString(), visitOtp: otp, link: `/user/booking/${booking._id}` }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', { bookingId: booking._id, status: BOOKING_STATUS.JOURNEY_STARTED, visitOtp: otp });
    }

    res.status(200).json({ success: true, message: 'Journey started, OTP sent to the customer', data: toProviderView(booking) });
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
    if (booking.status !== BOOKING_STATUS.JOURNEY_STARTED) {
      return res.status(400).json({ success: false, message: 'Journey not started' });
    }

    const check = await verifyBookingOtp(booking._id, 'visit', booking.visitOtp, otp);
    if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });

    const visited = await Booking.findOneAndUpdate(
      { _id: booking._id, vendorId, status: BOOKING_STATUS.JOURNEY_STARTED },
      {
        $set: {
          status: BOOKING_STATUS.VISITED, visitedAt: new Date(), startedAt: new Date(), visitOtp: null,
          ...(location ? { visitLocation: { ...location, verifiedAt: new Date() } } : {})
        }
      },
      { new: true }
    );
    if (!visited) return res.status(409).json({ success: false, message: 'Booking changed state, please refresh.' });

    await createNotification({
      userId: visited.userId,
      type: 'visit_verified',
      title: 'Visit Verified',
      message: 'The professional has arrived and verified the visit. Service is now in progress.',
      relatedId: visited._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: { type: 'visit_verified', bookingId: visited._id.toString(), link: `/user/booking/${visited._id}` }
    });
    const io = req.app.get('io');
    if (io) io.to(`user_${visited.userId}`).emit('booking_updated', { bookingId: visited._id, status: BOOKING_STATUS.VISITED, message: 'Visit verified successful' });

    res.status(200).json({ success: true, message: 'Visit verified', data: toProviderView(visited) });
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

    let serviceSplitPct = getVendorPayoutPercentage(settings);
    let partsSplitPct = settings?.partsPayoutPercentage ?? 10;
    let serviceGstPct = settings?.serviceGstPercentage ?? 18;
    let partsGstPct = settings?.partsGstPercentage ?? 18;

    // Reject nonsense line items (negative / NaN / absurd values) before they reach the bill
    const badItem = [...(billDetails?.services || []), ...(billDetails?.parts || [])].find(it => {
      const price = Number(it.price);
      const qty = it.quantity === undefined ? 1 : Number(it.quantity);
      return !Number.isFinite(price) || price < 0 || price > 1000000 || !Number.isInteger(qty) || qty < 1 || qty > 1000;
    });
    if (badItem) {
      return res.status(400).json({ success: false, message: 'Bill items need a non-negative price and a whole-number quantity between 1 and 1000.' });
    }

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
    const penaltyCharges = round2(booking.penalty || 0); // carried-over cancellation penalty: company revenue, not vendor earning
    const grandTotal = parseFloat((totalServiceBase + totalPartsBase + totalGST + visitingCharges + penaltyCharges).toFixed(2));

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

    let bill;
    try {
      bill = await VendorBill.create({
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
      penaltyCharges,

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
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ success: false, message: 'Bill already generated for this booking' });
      throw e;
    }

    // ═══════════════════════════════════════════
    // STEP 7: UPDATE BOOKING (no earnings!)
    // ═══════════════════════════════════════════

    if (workPhotos) booking.workPhotos = workPhotos;
    booking.workDoneDetails = {
      ...(workDoneDetails && typeof workDoneDetails === 'object' ? workDoneDetails : {}),
      billId: bill._id.toString(),
      items: [
        ...allServices.map(s => ({ title: s.name, qty: s.quantity, price: s.total })),
        ...billParts.map(p => ({ title: p.name, qty: p.quantity, price: p.total }))
      ]
    };
    booking.markModified('workDoneDetails');

    // Reconcile with anything already paid: cash → WORK_DONE + payment OTP; prepaid → settle/refund/balance
    let refunded = 0;
    try {
      refunded = await applyBillToBooking(booking, bill);
    } catch (e) {
      // don't leave an orphan bill that would block a retry
      await VendorBill.deleteOne({ _id: bill._id, earningsCredited: { $ne: true } });
      throw e;
    }
    const payOtp = booking.status === BOOKING_STATUS.WORK_DONE ? booking.paymentOtp : null;

    // ── Notify user ──
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'work_completed',
      title: 'Work Completed & Bill Ready',
      message: payOtp
        ? `Work completed for booking ${booking.bookingNumber}. Amount due: ₹${booking.balanceDue}. Payment OTP: ${payOtp}. Share it with the vendor ONLY after paying.`
        : `Work completed for booking ${booking.bookingNumber}. Total bill ₹${grandTotal} was settled from your advance${refunded ? `; ₹${refunded} refunded to your wallet` : ''}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      data: {
        bookingId: booking._id,
        grandTotal,
        paymentOtp: payOtp
      },
      pushData: {
        type: 'work_completed',
        bookingId: booking._id.toString(),
        finalAmount: grandTotal,
        link: `/user/booking/${booking._id}`
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: booking.status,
        finalAmount: grandTotal,
        balanceDue: booking.balanceDue
      });
    }

    // Response: bill totals only, NO vendor earnings exposed
    res.status(200).json({
      success: true,
      message: 'Work done, bill generated',
      data: {
        booking: toProviderView(booking),
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

    if (booking.cashCollected || [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_VENDOR].includes(booking.paymentStatus)) {
      return res.status(409).json({ success: false, message: 'Payment for this booking has already been collected.' });
    }
    if (![BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.AWAITING_PAYMENT].includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'Work not done yet' });
    }

    // Payment OTP only — the start/end OTPs can never confirm a payment.
    const expected = booking.paymentOtp || booking.customerConfirmationOTP;
    if (!expected) {
      return res.status(400).json({ success: false, message: 'No Payment OTP generated. Please request OTP from the customer.' });
    }
    const check = await verifyBookingOtp(booking._id, 'payment', expected, otp);
    if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });

    let result;
    try {
      result = await settleVendorCash(booking._id, { collectorRole: 'vendor', collectorId: vendorId });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ success: false, message: e.message });
      throw e;
    }

    const done = await Booking.findById(booking._id);
    await createNotification({
      userId: done.userId,
      type: 'payment_received',
      title: 'Payment Received (Cash)',
      message: `Payment of ₹${result.cashAmount} received in cash for booking ${done.bookingNumber}. Job Completed. Thanks!`,
      relatedId: done._id,
      relatedType: 'booking',
      priority: 'high',
      data: { bookingId: done._id, finalAmount: result.grandTotal, paymentMethod: 'cash', status: BOOKING_STATUS.COMPLETED },
      pushData: { type: 'payment_received', bookingId: done._id.toString(), link: `/user/booking/${done._id}` }
    });
    const io = req.app.get('io') || global.io;
    if (io) {
      io.to(`user_${done.userId}`).emit('booking_updated', {
        bookingId: done._id, status: BOOKING_STATUS.COMPLETED, paymentStatus: done.paymentStatus,
        paymentMethod: done.paymentMethod, finalAmount: result.grandTotal, message: 'Payment received in cash. Job completed!'
      });
    }

    res.status(200).json({ success: true, message: 'Cash collected, job completed', data: toProviderView(done) });
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
    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      return res.status(400).json({ success: false, message: 'The worker can only be paid after the booking is completed' });
    }

    // Atomic: two taps cannot both mark (and notify) the payment
    const paid = await Booking.findOneAndUpdate(
      { _id: booking._id, vendorId, isWorkerPaid: { $ne: true } },
      { $set: { isWorkerPaid: true, workerPaymentStatus: 'SUCCESS', workerPaidAt: new Date() } },
      { new: true }
    );
    if (!paid) return res.status(400).json({ success: false, message: 'Worker already paid' });
    booking.isWorkerPaid = true;
    booking.workerPaymentStatus = 'SUCCESS';

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
      data: toProviderView(booking)
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

    const pendingRequests = await BookingRequest.find({
      vendorId,
      status: { $in: ['PENDING', 'VIEWED'] },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
    })
      .populate({
        path: 'bookingId',
        match: {
          status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] },
          $or: [{ vendorId: null }, { vendorId }]
        },
        populate: [
          { path: 'userId', select: 'name' },
          { path: 'serviceId', select: 'title iconUrl' }
        ]
      })
      .sort({ sentAt: -1 })
      .limit(20);

    const valid = pendingRequests.filter(r => r.bookingId !== null);
    const bookings = valid.map(r => ({
      requestId: r._id,
      bookingId: r.bookingId._id,
      bookingNumber: r.bookingId.bookingNumber,
      serviceName: r.bookingId.serviceId?.title || r.bookingId.serviceName,
      customerName: r.bookingId.userId?.name,
      scheduledDate: r.bookingId.scheduledDate,
      scheduledTime: r.bookingId.scheduledTime,
      address: maskAddress(r.bookingId.address),
      price: r.bookingId.finalAmount,
      distance: r.distance,
      wave: r.wave,
      sentAt: r.sentAt,
      expiresAt: r.expiresAt,
      status: r.status
    }));

    res.status(200).json({ success: true, data: bookings, count: bookings.length });
  } catch (error) {
    console.error('Get pending bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending bookings' });
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

    // Status first, so a wrong-state call does not burn OTP attempts
    const requiresDriver = booking.categoryId?.requiresDriver !== false;
    const validInitial = requiresDriver
      ? [BOOKING_STATUS.VISITED, BOOKING_STATUS.ASSIGNED]
      : [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.VISITED];
    if (!validInitial.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: requiresDriver
          ? 'You must mark "Reached Location" before starting the engine for this machinery.'
          : 'Invalid booking status for handover.'
      });
    }

    const check = await verifyBookingOtp(booking._id, 'start', booking.driver_start_otp, driver_start_otp);
    if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });

    const now = new Date();
    const claimed = await Booking.findOneAndUpdate(
      { _id: booking._id, vendorId, status: { $in: validInitial } },
      {
        $set: {
          status: BOOKING_STATUS.IN_PROGRESS,
          startedAt: now,
          start_kilometer_photo: start_kilometer_photo || null,
          driver_start_otp: null, // single use
          // distinct from the start OTP; used ONLY to end the trip
          driver_end_otp: generateDistinctOtp(booking.driver_start_otp)
        }
      },
      { new: true }
    ).populate('categoryId');
    if (!claimed) return res.status(409).json({ success: false, message: 'Booking changed state, please refresh.' });

    await markVendorBusy(vendorId);

    const shouldStartTimer = requiresDriver || Boolean(
      claimed.serviceTimer ||
      claimed.rental_type === 'hourly' ||
      claimed.bookingType === 'hourly' ||
      claimed.ratePerMinute ||
      /tractor|rotavator|harvester|tiller|agriculture|machinery/i.test(`${claimed.serviceCategory || ''} ${claimed.serviceName || ''}`)
    );

    if (shouldStartTimer) {
      try {
        const { resolveRates, broadcastTimerUpdate } = require('./serviceTimerController');
        if (!claimed.serviceTimer) claimed.serviceTimer = { status: 'NOT_STARTED', logs: [] };
        if (claimed.serviceTimer.status !== 'RUNNING') {
          const { ratePerMinute, adminBaseCharge } = await resolveRates(claimed);
          claimed.serviceTimer.ratePerMinute = ratePerMinute;
          claimed.serviceTimer.adminBaseCharge = adminBaseCharge;
          claimed.serviceTimer.status = 'RUNNING';
          claimed.serviceTimer.currentSessionStartedAt = now;
          claimed.serviceTimer.logs.push({
            action: 'START', performedBy: 'vendor', performedById: vendorId, performedByRole: 'Vendor',
            timestamp: now, activeSecondsSnapshot: 0, pausedSecondsSnapshot: 0
          });
          await claimed.save();
          broadcastTimerUpdate(claimed, 'START', { performedBy: 'vendor' });
        }
      } catch (timerErr) {
        console.error('[StartTrip] Could not initialize service timer:', timerErr);
      }
    }

    try {
      const serviceName = claimed.serviceName || 'Machinery';
      await createNotification({
        userId: claimed.userId,
        type: 'trip_started',
        title: (requiresDriver || shouldStartTimer) ? '🚜 Machinery Engine Started' : '📦 Equipment Handed Over',
        message: (requiresDriver || shouldStartTimer)
          ? `The operator has started the engine for ${serviceName}. Work is now in progress.`
          : `The equipment for booking ${claimed.bookingNumber} has been handed over. Rental period is now active.`,
        relatedId: claimed._id,
        relatedType: 'booking',
        priority: 'high',
        data: { bookingId: claimed._id, serviceName, status: BOOKING_STATUS.IN_PROGRESS, startedAt: claimed.startedAt },
        pushData: { type: 'trip_started', bookingId: claimed._id.toString(), link: `/user/booking/${claimed._id}` }
      });
    } catch (notifErr) {
      console.error('[StartTrip] Notification error:', notifErr.message);
    }

    const io = req.app.get('io') || global.io;
    if (io) {
      io.to(`user_${claimed.userId}`).emit('booking_updated', {
        bookingId: claimed._id, status: BOOKING_STATUS.IN_PROGRESS, startedAt: claimed.startedAt,
        message: (requiresDriver || shouldStartTimer) ? 'Machinery engine started' : 'Equipment handed over'
      });
    }

    res.status(200).json({
      success: true,
      message: (requiresDriver || shouldStartTimer) ? 'Engine started successfully' : 'Equipment handed over successfully',
      data: toProviderView(claimed)
    });
  } catch (error) {
    console.error('Start trip error:', error);
    res.status(500).json({ success: false, message: 'Failed to start trip' });
  }
};

/**
 * End Trip (Agriculture flow) with Advance Billing & Settlement
 */
const isEndable = (b) => b.status === BOOKING_STATUS.IN_PROGRESS || (b.status === BOOKING_STATUS.WORK_DONE && !b.vendorBillId);
const endTrip = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { end_kilometer_photo, driver_end_otp, workUnits, work_evidence_photo } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId }).populate('serviceId');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (!isEndable(booking)) {
      return res.status(400).json({ success: false, message: `Cannot end a trip that is "${booking.status}"` });
    }
    if (!booking.driver_end_otp) {
      return res.status(400).json({ success: false, message: 'No Completion/End OTP found on this booking. Please check with the farmer.' });
    }

    // End OTP only — it is never accepted as a payment OTP.
    const check = await verifyBookingOtp(booking._id, 'end', booking.driver_end_otp, driver_end_otp);
    if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });

    const result = await completeMachineryTrip(req, booking, { end_kilometer_photo, workUnits, work_evidence_photo, endOtpUsed: true });
    res.status(200).json({
      success: true,
      message: 'Trip ended and billed successfully',
      data: { finalAmount: result.grandTotal, vendorEarning: result.vendorEarning, billId: result.bill._id, status: result.booking.status, balanceDue: result.booking.balanceDue }
    });
  } catch (error) {
    console.error('End trip billing error:', { error: error.message, stack: error.stack, bookingId: req.params.id });
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Failed to complete trip and billing' });
  }
};

/**
 * Shared by /trip/end and the machinery "complete work" endpoint:
 * closes the timer, bills once, reconciles advance payments and notifies the farmer.
 */
const completeMachineryTrip = async (req, booking, { end_kilometer_photo, workUnits, work_evidence_photo, endOtpUsed }) => {
  const now = new Date();
  const wu = workUnits !== undefined && workUnits !== null && workUnits !== '' ? Number(workUnits) : null;
  if (wu !== null && (!Number.isFinite(wu) || wu <= 0 || wu > 100000)) {
    const e = new Error('workUnits must be a positive number'); e.status = 400; throw e;
  }

  // Claim the booking so two concurrent "end" calls cannot both bill
  const claimed = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      $or: [
        { status: BOOKING_STATUS.IN_PROGRESS },
        { status: BOOKING_STATUS.WORK_DONE, vendorBillId: null } // retry after a failed billing attempt
      ]
    },
    { $set: {
        status: BOOKING_STATUS.WORK_DONE,
        end_kilometer_photo: end_kilometer_photo || null,
        work_evidence_photo: work_evidence_photo || null,
        ...(wu !== null ? { workUnits: wu } : {})
    } },
    { new: true }
  ).populate('serviceId');
  if (!claimed) {
    const e = new Error('Booking changed state, please refresh.'); e.status = 409; throw e;
  }

  claimed.driver_end_otp = null; // single use; persisted by the billing save below
  closeServiceTimer(claimed, now, 'COMPLETED');
  const VendorEquipment = require('../../models/VendorEquipment');
  const equipment = claimed.equipmentId ? await VendorEquipment.findById(claimed.equipmentId) : null;

  const result = await finalizeMachineryBilling(claimed, { service: claimed.serviceId, equipment, workUnits: wu, now });
  const b = result.booking;

  if (b.serviceTimer && result.calc?.hasTimer) {
    b.serviceTimer.billingSummary = {
      totalActiveMinutes: result.calc.totalActiveMinutes,
      totalPausedMinutes: Math.floor((b.serviceTimer.accumulatedPausedSeconds || 0) / 60),
      adminBaseCharge: result.calc.adminBase,
      timeCharge: result.calc.timeCharge,
      subtotal: result.calc.base,
      discount: b.discount || 0,
      finalPayable: result.grandTotal,
      isPartialEnd: false,
      calculatedAt: now
    };
    await b.save();
    try { require('./serviceTimerController').broadcastTimerUpdate(b, 'END', { performedBy: 'vendor', billingSummary: b.serviceTimer.billingSummary }); } catch (e) { /* non-fatal */ }
  }

  const needsPayment = b.status === BOOKING_STATUS.WORK_DONE;
  await createNotification({
    userId: b.userId,
    type: 'work_completed',
    title: 'Work Completed & Bill Generated',
    message: needsPayment
      ? `Your service has ended. Amount due: ₹${b.balanceDue}. Payment OTP: ${b.paymentOtp}. Share this OTP with the operator ONLY after you have paid in cash.`
      : `Your service has ended. Total bill ₹${result.grandTotal} was settled from your advance${result.refunded ? `; ₹${result.refunded} refunded to your wallet` : ''}.`,
    relatedId: b._id,
    relatedType: 'booking',
    priority: 'high',
    pushData: { type: 'work_done', bookingId: b._id.toString(), paymentOtp: needsPayment ? b.paymentOtp : undefined, link: `/user/booking/${b._id}` }
  });

  const io = req.app.get('io');
  if (io) {
    io.to(`user_${b.userId}`).emit('booking_updated', {
      bookingId: b._id, status: b.status, finalAmount: result.grandTotal, balanceDue: b.balanceDue,
      customerConfirmationOTP: needsPayment ? b.customerConfirmationOTP : undefined,
      paymentOtp: needsPayment ? b.paymentOtp : undefined
    });
  }
  return result;
};

/** Machinery "start work" used by the vendor app: same rules as /trip/start. */
const machineryStart = (req, res) => {
  req.body = { start_kilometer_photo: req.body.startKmPhoto || req.body.conditionPhoto || null, driver_start_otp: req.body.otp };
  return startTrip(req, res);
};

/** Machinery "complete work" used by the vendor app: bills and moves to payment (farmer pays with a payment OTP). */
const machineryComplete = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const booking = await Booking.findOne({ _id: req.params.id || req.params.bookingId, vendorId }).populate('serviceId');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!isEndable(booking)) {
      return res.status(400).json({ success: false, message: `Cannot complete work that is "${booking.status}"` });
    }
    const { endKmPhoto, workUnits, evidencePhoto } = req.body;
    const result = await completeMachineryTrip(req, booking, { end_kilometer_photo: endKmPhoto, workUnits, work_evidence_photo: evidencePhoto, endOtpUsed: false });
    res.status(200).json({
      success: true,
      message: result.booking.status === BOOKING_STATUS.WORK_DONE ? 'Work marked as done. Payment OTP sent to farmer.' : 'Work completed and settled.',
      data: toProviderView(result.booking)
    });
  } catch (error) {
    console.error('Machinery complete error:', error);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Completion failed' });
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
    if (!(request.requestedHours > 0 && request.requestedHours <= 24)) {
      return res.status(400).json({ success: false, message: 'Invalid extension duration' });
    }

    const VendorEquipment = require('../../models/VendorEquipment');
    const eq = booking.equipmentId ? await VendorEquipment.findById(booking.equipmentId) : null;
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

    await createNotification({
      userId: booking.userId, type: 'extension_approved', title: 'Extension Approved',
      message: `Your request for ${request.requestedHours} more hour(s) was approved (₹${Math.round(charge)} extra).`,
      relatedId: booking._id, relatedType: 'booking', priority: 'high',
      pushData: { type: 'extension_approved', bookingId: booking._id.toString(), link: `/user/booking/${booking._id}` }
    });
    res.status(200).json({ success: true, message: 'Extension approved successfully', data: toProviderView(booking) });
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

    await createNotification({
      userId: booking.userId, type: 'extension_rejected', title: 'Extension Declined',
      message: `The vendor declined your request for ${request.requestedHours} more hour(s).`,
      relatedId: booking._id, relatedType: 'booking',
      pushData: { type: 'extension_rejected', bookingId: booking._id.toString(), link: `/user/booking/${booking._id}` }
    });
    res.status(200).json({ success: true, message: 'Extension rejected successfully', data: toProviderView(booking) });
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
  rejectExtension,
  machineryStart,
  machineryComplete
};

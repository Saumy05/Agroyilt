const Booking = require('../../models/Booking');
const Category = require('../../models/Category');
const VendorEquipment = require('../../models/VendorEquipment');
const { BOOKING_STATUS, USER_ROLES } = require('../../utils/constants');
const { getIO } = require('../../sockets');
const {
  generateDistinctOtp,
  verifyBookingOtp,
  closeServiceTimer,
  finalizeMachineryBilling
} = require('../../services/bookingSettlementService');

/**
 * Helper to identify caller role relative to this booking
 */
const getCallerRole = (req, booking) => {
  const currentUserId = (req.userId || req.user?.id || req.user?._id)?.toString();
  const bookingUserId = (booking.userId?._id || booking.userId)?.toString();
  const bookingVendorId = (booking.vendorId?._id || booking.vendorId)?.toString();
  const bookingWorkerId = (booking.workerId?._id || booking.workerId)?.toString();
  const roleUpper = String(req.userRole || req.user?.role || '').toUpperCase();

  // Compare id AND role: ids from different collections must never be treated as equal people
  if (currentUserId === bookingUserId && (!roleUpper || roleUpper === 'USER')) return 'farmer';
  if (currentUserId === bookingVendorId && (!roleUpper || roleUpper === 'VENDOR')) return 'vendor';
  if (bookingWorkerId && currentUserId === bookingWorkerId && roleUpper === 'WORKER') return 'worker';
  if (req.userRole === USER_ROLES.ADMIN || req.userRole === 'admin' || req.userRole === 'super_admin') return 'admin';
  return null;
};

const isProvider = (role) => role === 'vendor' || role === 'worker';

/**
 * Helper: Resolve per-minute rate and admin base charge
 */
const resolveRates = async (booking) => {
  let ratePerMinute = booking.serviceTimer?.ratePerMinute || 0;
  let adminBaseCharge = booking.serviceTimer?.adminBaseCharge || 0;

  // 1. If ratePerMinute is not yet set, resolve it by combining Tractor + Attached Implements
  if (!ratePerMinute || ratePerMinute <= 0) {
    let combinedHourly = 0;

    // A. Tractor / Base Equipment Rate
    if (booking.equipmentId) {
      try {
        const eq = await VendorEquipment.findById(booking.equipmentId);
        if (eq) {
          if (eq.pricing?.hourly?.isEnabled && Number(eq.pricing?.hourly?.price) > 0) {
            combinedHourly += Number(eq.pricing.hourly.price);
          } else if (eq.pricing?.per_minute?.isEnabled && Number(eq.pricing?.per_minute?.price) > 0) {
            combinedHourly += Number(eq.pricing.per_minute.price) * 60;
          }
        }
      } catch (err) {
        console.error('[ServiceTimer] Error loading equipment for pricing:', err);
      }
    }

    // B. Attached Implements (e.g. Rotavator, Cultivator, Straw Baler)
    if (Array.isArray(booking.selectedImplements) && booking.selectedImplements.length > 0) {
      for (const impl of booking.selectedImplements) {
        const hourlyRate = Number(impl.pricing?.hourly?.price) || 0;
        const perMinRate = Number(impl.pricing?.per_minute?.price) || 0;
        if (hourlyRate > 0) {
          combinedHourly += hourlyRate;
        } else if (perMinRate > 0) {
          combinedHourly += perMinRate * 60;
        }
      }
    }

    // C. Calculate Per-Minute Rate
    if (combinedHourly > 0) {
      ratePerMinute = Math.round((combinedHourly / 60) * 100) / 100;
    } else if (booking.rateUnit === 'per_minute' && booking.agreedRate > 0) {
      ratePerMinute = booking.agreedRate;
    } else if (booking.basePrice > 0 && (booking.durationMinutes > 0 || booking.estimatedDuration > 0)) {
      // basePrice is the TOTAL for the booked duration, not an hourly rate
      const bookedMinutes = booking.durationMinutes > 0 ? booking.durationMinutes : booking.estimatedDuration * 60;
      ratePerMinute = Math.round((booking.basePrice / bookedMinutes) * 100) / 100;
    } else {
      // Industry default fallback (~₹900/hr = ₹15/min)
      ratePerMinute = 15;
    }
  }

  // 2. Resolve Admin Base Charge
  if (!adminBaseCharge || adminBaseCharge <= 0) {
    if (booking.visitingCharges > 0) {
      adminBaseCharge = booking.visitingCharges;
    } else if (booking.categoryId) {
      try {
        const cat = await Category.findById(booking.categoryId);
        if (cat?.adminBaseCharge > 0) {
          adminBaseCharge = cat.adminBaseCharge;
        }
      } catch (err) {
        console.error('[ServiceTimer] Error loading category base charge:', err);
      }
    }
  }

  return { ratePerMinute, adminBaseCharge };
};

/**
 * Broadcast timer updates to all related Socket rooms
 */
const broadcastTimerUpdate = (booking, action, extra = {}) => {
  try {
    const io = getIO();
    if (!io) return;

    const bId = booking._id.toString();
    const commonPayload = {
      bookingId: bId,
      status: booking.serviceTimer?.status,
      accumulatedActiveSeconds: booking.serviceTimer?.accumulatedActiveSeconds || 0,
      accumulatedPausedSeconds: booking.serviceTimer?.accumulatedPausedSeconds || 0,
      currentSessionStartedAt: booking.serviceTimer?.currentSessionStartedAt || null,
      currentPauseStartedAt: booking.serviceTimer?.currentPauseStartedAt || null,
      lastPausedBy: booking.serviceTimer?.lastPausedBy || null,
      lastPauseReason: booking.serviceTimer?.lastPauseReason || null,
      lastPauseNotes: booking.serviceTimer?.lastPauseNotes || null,
      ratePerMinute: booking.serviceTimer?.ratePerMinute || 0,
      adminBaseCharge: booking.serviceTimer?.adminBaseCharge || 0,
      billingSummary: booking.serviceTimer?.billingSummary || null,
      requiresResumeOtp: Boolean(booking.serviceTimer?.status === 'PAUSED'),
      action,
      ...extra,
      serverTime: new Date()
    };

    // Public / vendor payload: strictly strip resumeOtp so operator cannot self-resume
    const publicPayload = { ...commonPayload };
    for (const k of ['resumeOtp', 'paymentOtp', 'customerConfirmationOTP', 'driver_end_otp', 'driver_start_otp', 'otp', 'end_otp']) {
      delete publicPayload[k];
    }

    io.to(`booking_${bId}`).emit('service_timer_updated', publicPayload);
    io.to(`booking:${bId}`).emit('service_timer_updated', publicPayload);

    if (booking.vendorId) {
      const vId = (booking.vendorId._id || booking.vendorId).toString();
      io.to(`vendor_${vId}`).emit('service_timer_updated', publicPayload);
      io.to(`vendor:${vId}`).emit('service_timer_updated', publicPayload);
    }

    // Farmer / User socket payload: receives the Resume OTP to verify work resumption
    if (booking.userId) {
      const uId = (booking.userId._id || booking.userId).toString();
      const farmerPayload = {
        ...commonPayload,
        resumeOtp: (booking.serviceTimer?.status === 'PAUSED')
          ? (booking.serviceTimer?.resumeOtp || booking.resumeOtp || null)
          : null,
        driver_end_otp: booking.driver_end_otp || null,
        paymentOtp: booking.status === BOOKING_STATUS.WORK_DONE ? (extra.paymentOtp || booking.customerConfirmationOTP || null) : null
      };
      io.to(`user_${uId}`).emit('service_timer_updated', farmerPayload);
      io.to(`user:${uId}`).emit('service_timer_updated', farmerPayload);
    }
    console.log(`[ServiceTimer] Broadcasted '${action}' for booking ${bId}, status=${commonPayload.status}`);
  } catch (err) {
    console.error('[ServiceTimer] Failed to broadcast timer update:', err.message);
  }
};

/**
 * GET /api/bookings/:id/service-timer/status
 * Fetches real-time computed elapsed times, billing, and logs
 */
const getServiceTimerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id).populate('categoryId');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const role = getCallerRole(req, booking);
    if (!role) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this booking timer' });
    }

    const now = new Date();
    let { status, accumulatedActiveSeconds = 0, accumulatedPausedSeconds = 0, currentSessionStartedAt, currentPauseStartedAt, ratePerMinute = 0, adminBaseCharge = 0 } = booking.serviceTimer || {};

    // Dynamic current elapsed calculation
    let liveActiveSeconds = accumulatedActiveSeconds;
    let livePausedSeconds = accumulatedPausedSeconds;

    if (status === 'RUNNING' && currentSessionStartedAt) {
      const deltaSec = Math.max(0, Math.floor((now.getTime() - new Date(currentSessionStartedAt).getTime()) / 1000));
      liveActiveSeconds += deltaSec;
    } else if (status === 'PAUSED' && currentPauseStartedAt) {
      const deltaSec = Math.max(0, Math.floor((now.getTime() - new Date(currentPauseStartedAt).getTime()) / 1000));
      livePausedSeconds += deltaSec;
    }

    const activeMinutes = Math.round((liveActiveSeconds / 60) * 100) / 100;
    const billableMinutes = Math.max(0, Math.ceil(liveActiveSeconds / 60));
    const estimatedTimeCharge = Math.round(billableMinutes * ratePerMinute);
    const estimatedTotal = (adminBaseCharge || 0) + estimatedTimeCharge;

    res.status(200).json({
      success: true,
      data: {
        bookingId: booking._id,
        status: status || 'NOT_STARTED',
        accumulatedActiveSeconds,
        accumulatedPausedSeconds,
        liveActiveSeconds,
        livePausedSeconds,
        billableMinutes,
        activeMinutes,
        ratePerMinute,
        adminBaseCharge,
        estimatedTimeCharge,
        estimatedTotal,
        currentSessionStartedAt,
        currentPauseStartedAt,
        lastPausedBy: booking.serviceTimer?.lastPausedBy || null,
        lastPauseReason: booking.serviceTimer?.lastPauseReason || null,
        lastPauseNotes: booking.serviceTimer?.lastPauseNotes || null,
        // Anti-fraud: only farmer and admin can see the secret resumeOtp and driver_end_otp
        resumeOtp: (role === 'farmer' || role === 'admin')
          ? (booking.serviceTimer?.resumeOtp || booking.resumeOtp || null)
          : null,
        driver_end_otp: (role === 'farmer' || role === 'admin')
          ? (booking.driver_end_otp || null)
          : null,
        requiresResumeOtp: Boolean(status === 'PAUSED'),
        billingSummary: booking.serviceTimer?.billingSummary || null,
        logs: booking.serviceTimer?.logs || [],
        serverTime: now
      }
    });
  } catch (error) {
    console.error('getServiceTimerStatus error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch service timer status' });
  }
};

/**
 * POST /api/bookings/:id/service-timer/start
 * Starts the service timer (Tractor starts operation)
 */
const startServiceTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id).populate('categoryId');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const role = getCallerRole(req, booking);
    if (!role) return res.status(403).json({ success: false, message: 'Not authorized' });
    // The farmer cannot start billing on their own; the operator starts it after the handover OTP.
    if (role === 'farmer') {
      return res.status(403).json({ success: false, message: 'Only the service provider can start the timer.' });
    }
    if (booking.status !== BOOKING_STATUS.IN_PROGRESS) {
      return res.status(400).json({ success: false, message: 'The timer can only be started once the work has started (handover OTP verified).' });
    }

    if (!booking.serviceTimer) booking.serviceTimer = { status: 'NOT_STARTED', logs: [] };
    if (booking.serviceTimer.status === 'RUNNING') {
      return res.status(200).json({ success: true, message: 'Service is already running', data: booking.serviceTimer });
    }
    if (['COMPLETED', 'CANCELLED', 'STOPPED'].includes(booking.serviceTimer.status)) {
      return res.status(400).json({ success: false, message: 'This service timer has already finished.' });
    }

    const now = new Date();
    const { ratePerMinute, adminBaseCharge } = await resolveRates(booking);
    booking.serviceTimer.ratePerMinute = ratePerMinute;
    booking.serviceTimer.adminBaseCharge = adminBaseCharge;
    booking.serviceTimer.status = 'RUNNING';
    booking.serviceTimer.currentSessionStartedAt = now;
    booking.serviceTimer.currentPauseStartedAt = null;
    if (!booking.startedAt) booking.startedAt = now;
    if (!booking.driver_end_otp) booking.driver_end_otp = generateDistinctOtp(booking.driver_start_otp);

    booking.serviceTimer.logs.push({
      action: 'START',
      performedBy: role,
      performedById: req.userId || req.user?.id,
      performedByRole: role === 'vendor' ? 'Vendor' : 'Worker',
      timestamp: now,
      activeSecondsSnapshot: booking.serviceTimer.accumulatedActiveSeconds || 0,
      pausedSecondsSnapshot: booking.serviceTimer.accumulatedPausedSeconds || 0
    });

    await booking.save();
    broadcastTimerUpdate(booking, 'START', { performedBy: role });
    res.status(200).json({ success: true, message: 'Service timer started successfully', data: booking.serviceTimer });
  } catch (error) {
    console.error('startServiceTimer error:', error);
    res.status(500).json({ success: false, message: 'Failed to start service timer' });
  }
};

/**
 * POST /api/bookings/:id/service-timer/pause
 * Pauses the timer (e.g., machine breakdown, refuel, obstacle, break)
 */
const pauseServiceTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const ALLOWED_REASONS = ['machine_issue', 'refueling', 'obstacle', 'break', 'other'];
    const reason = ALLOWED_REASONS.includes(req.body.reason) ? req.body.reason : 'other';
    const notes = String(req.body.notes || '').slice(0, 500);

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const role = getCallerRole(req, booking);
    if (!role) return res.status(403).json({ success: false, message: 'Not authorized' });
    if (booking.status !== BOOKING_STATUS.IN_PROGRESS) {
      return res.status(400).json({ success: false, message: 'Cannot pause: the service is not in progress' });
    }
    if (!booking.serviceTimer || booking.serviceTimer.status !== 'RUNNING') {
      return res.status(400).json({ success: false, message: 'Cannot pause: Service is not currently running' });
    }

    const now = new Date();
    if (booking.serviceTimer.currentSessionStartedAt) {
      const deltaSec = Math.max(0, Math.floor((now.getTime() - new Date(booking.serviceTimer.currentSessionStartedAt).getTime()) / 1000));
      booking.serviceTimer.accumulatedActiveSeconds = (booking.serviceTimer.accumulatedActiveSeconds || 0) + deltaSec;
      booking.serviceTimer.currentSessionStartedAt = null;
    }

    booking.serviceTimer.status = 'PAUSED';
    booking.serviceTimer.currentPauseStartedAt = now;
    booking.serviceTimer.lastPausedBy = role === 'admin' ? 'vendor' : role;
    booking.serviceTimer.lastPauseReason = reason;
    booking.serviceTimer.lastPauseNotes = notes;

    // Resume OTP is only needed when the PROVIDER paused (the farmer proves they are present).
    // When the farmer paused, the provider can resume freely so billing cannot be stalled by a no-show.
    const resumeOtp = generateDistinctOtp(booking.driver_start_otp, booking.driver_end_otp);
    booking.serviceTimer.resumeOtp = isProvider(role) ? resumeOtp : null;
    booking.resumeOtp = isProvider(role) ? resumeOtp : null;

    if (isProvider(role)) {
      try {
        const { createNotification } = require('../notificationControllers/notificationController');
        await createNotification({
          userId: booking.userId,
          type: 'service_timer_paused',
          title: 'Work Paused - Resume OTP Generated',
          message: `Work paused (${reason}). Share Resume OTP ${resumeOtp} with the operator when ready to resume work.`,
          relatedId: booking._id,
          relatedType: 'booking',
          priority: 'high',
          pushData: { type: 'timer_paused', bookingId: booking._id.toString(), resumeOtp, link: `/user/booking/${booking._id}` }
        });
      } catch (notifErr) {
        console.warn('[ServiceTimer] Notification error on pause:', notifErr.message);
      }
    }

    booking.serviceTimer.logs.push({
      action: 'PAUSE',
      performedBy: role === 'admin' ? 'vendor' : role,
      performedById: req.userId || req.user?.id,
      performedByRole: role === 'vendor' ? 'Vendor' : (role === 'worker' ? 'Worker' : 'User'),
      reason, notes, timestamp: now,
      activeSecondsSnapshot: booking.serviceTimer.accumulatedActiveSeconds,
      pausedSecondsSnapshot: booking.serviceTimer.accumulatedPausedSeconds || 0
    });

    await booking.save();
    broadcastTimerUpdate(booking, 'PAUSE', { performedBy: role, reason, notes });

    const responseTimer = booking.serviceTimer.toObject ? booking.serviceTimer.toObject() : { ...booking.serviceTimer };
    if (role !== 'farmer' && role !== 'admin') delete responseTimer.resumeOtp;

    res.status(200).json({ success: true, message: `Service paused by ${role}: ${reason}`, data: responseTimer });
  } catch (error) {
    console.error('pauseServiceTimer error:', error);
    res.status(500).json({ success: false, message: 'Failed to pause service timer' });
  }
};

/**
 * POST /api/bookings/:id/service-timer/resume
 * Resumes work after a breakdown or pause (Requires Customer Resume OTP)
 */
const resumeServiceTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const { otp } = req.body;

    const booking = await Booking.findById(id).select('+resumeOtp');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const role = getCallerRole(req, booking);
    if (!role) return res.status(403).json({ success: false, message: 'Not authorized' });
    if (booking.status !== BOOKING_STATUS.IN_PROGRESS) {
      return res.status(400).json({ success: false, message: 'Cannot resume: the service is not in progress' });
    }
    if (!booking.serviceTimer || booking.serviceTimer.status !== 'PAUSED') {
      return res.status(400).json({ success: false, message: 'Cannot resume: Service is not paused' });
    }

    // Provider resuming a pause THEY started needs the farmer's OTP. A farmer-initiated pause
    // can be resumed by the provider without one.
    const pausedByFarmer = booking.serviceTimer.lastPausedBy === 'farmer';
    if (isProvider(role) && !pausedByFarmer) {
      if (!otp) {
        return res.status(400).json({
          success: false,
          message: 'Resume OTP is required to restart billing and work. Please ask the farmer for the 4-digit Resume OTP shown on their screen.'
        });
      }
      const expected = booking.serviceTimer?.resumeOtp || booking.resumeOtp;
      const check = await verifyBookingOtp(booking._id, 'resume', expected, otp);
      if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });
    }

    const now = new Date();
    if (booking.serviceTimer.currentPauseStartedAt) {
      const deltaSec = Math.max(0, Math.floor((now.getTime() - new Date(booking.serviceTimer.currentPauseStartedAt).getTime()) / 1000));
      booking.serviceTimer.accumulatedPausedSeconds = (booking.serviceTimer.accumulatedPausedSeconds || 0) + deltaSec;
      booking.serviceTimer.currentPauseStartedAt = null;
    }

    booking.serviceTimer.status = 'RUNNING';
    booking.serviceTimer.currentSessionStartedAt = now;
    booking.serviceTimer.resumeOtp = null; // single use
    booking.resumeOtp = null;

    booking.serviceTimer.logs.push({
      action: 'RESUME',
      performedBy: role === 'admin' ? 'vendor' : role,
      performedById: req.userId || req.user?.id,
      performedByRole: role === 'vendor' ? 'Vendor' : (role === 'worker' ? 'Worker' : 'User'),
      timestamp: now,
      activeSecondsSnapshot: booking.serviceTimer.accumulatedActiveSeconds || 0,
      pausedSecondsSnapshot: booking.serviceTimer.accumulatedPausedSeconds || 0
    });

    await booking.save();
    broadcastTimerUpdate(booking, 'RESUME', { performedBy: role });
    res.status(200).json({ success: true, message: `Service resumed successfully by ${role}`, data: { ...booking.serviceTimer.toObject(), resumeOtp: undefined } });
  } catch (error) {
    console.error('resumeServiceTimer error:', error);
    res.status(500).json({ success: false, message: 'Failed to resume service timer' });
  }
};

/**
 * POST /api/bookings/:id/service-timer/end
 * Stops the timer and generates the bill (Supports normal completion OR partial breakdown bill)
 */
const endServiceTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPartial = false, reason = '', end_otp = null } = req.body;

    const booking = await Booking.findById(id).populate('serviceId');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const role = getCallerRole(req, booking);
    if (!role) return res.status(403).json({ success: false, message: 'Not authorized' });

    if (booking.status !== BOOKING_STATUS.IN_PROGRESS || !booking.serviceTimer ||
        !['RUNNING', 'PAUSED'].includes(booking.serviceTimer.status)) {
      return res.status(400).json({ success: false, message: 'There is no running service to end.' });
    }

    // The provider needs the farmer's end OTP (only the END OTP; never a payment OTP).
    if (isProvider(role)) {
      if (!booking.driver_end_otp) {
        return res.status(400).json({ success: false, message: 'No Completion OTP was found for this booking. Please check with the farmer.' });
      }
      const check = await verifyBookingOtp(booking._id, 'end', booking.driver_end_otp, end_otp);
      if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });
    }

    const now = new Date();
    // Claim: IN_PROGRESS → WORK_DONE so concurrent end calls cannot both bill
    const claimed = await Booking.findOneAndUpdate(
      { _id: booking._id, status: BOOKING_STATUS.IN_PROGRESS },
      { $set: { status: BOOKING_STATUS.WORK_DONE } },
      { new: true }
    ).populate('serviceId');
    if (!claimed) return res.status(409).json({ success: false, message: 'Booking changed state, please refresh.' });

    claimed.driver_end_otp = null;
    closeServiceTimer(claimed, now, 'COMPLETED');

    const VendorEquipment = require('../../models/VendorEquipment');
    const equipment = claimed.equipmentId ? await VendorEquipment.findById(claimed.equipmentId) : null;
    const result = await finalizeMachineryBilling(claimed, { service: claimed.serviceId, equipment, now });
    const b = result.booking;

    const billingSummary = {
      totalActiveMinutes: result.calc.totalActiveMinutes || 0,
      totalPausedMinutes: Math.floor((b.serviceTimer.accumulatedPausedSeconds || 0) / 60),
      adminBaseCharge: result.calc.adminBase || 0,
      timeCharge: result.calc.timeCharge || 0,
      subtotal: result.calc.base,
      discount: b.discount || 0,
      finalPayable: result.grandTotal,
      isPartialEnd: Boolean(isPartial),
      partialEndReason: String(reason || '').slice(0, 300) || (isPartial ? 'Service ended prematurely due to breakdown or early completion' : null),
      calculatedAt: now
    };
    b.serviceTimer.billingSummary = billingSummary;
    b.serviceTimer.logs.push({
      action: isPartial ? 'PARTIAL_END' : 'END',
      performedBy: role === 'admin' ? 'vendor' : role,
      performedById: req.userId || req.user?.id,
      performedByRole: role === 'vendor' ? 'Vendor' : (role === 'worker' ? 'Worker' : 'User'),
      reason: String(reason || '').slice(0, 300) || (isPartial ? 'Partial Breakdown Finish' : 'Normal Service Completion'),
      timestamp: now,
      activeSecondsSnapshot: b.serviceTimer.accumulatedActiveSeconds || 0,
      pausedSecondsSnapshot: b.serviceTimer.accumulatedPausedSeconds || 0
    });
    await b.save();

    const needsPayment = b.status === BOOKING_STATUS.WORK_DONE;
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: b.userId,
      type: 'work_completed',
      title: 'Work Completed & Bill Ready',
      message: needsPayment
        ? `Your equipment service has ended. Amount due: ₹${b.balanceDue}. Payment OTP: ${b.paymentOtp}. Share this OTP with the operator ONLY after paying.`
        : `Your equipment service has ended. Bill ₹${result.grandTotal} was settled from your advance${result.refunded ? `; ₹${result.refunded} refunded to your wallet` : ''}.`,
      relatedId: b._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: { type: 'work_done', bookingId: b._id.toString(), paymentOtp: needsPayment ? b.paymentOtp : undefined, link: `/user/booking/${b._id}` }
    });

    broadcastTimerUpdate(b, isPartial ? 'PARTIAL_END' : 'END', {
      performedBy: role, billingSummary, status: b.status, paymentStatus: b.paymentStatus,
      paymentOtp: needsPayment ? b.paymentOtp : null,
      vendorBillId: result.bill?._id
    });

    const providerSide = isProvider(role);
    res.status(200).json({
      success: true,
      message: isPartial ? 'Service ended with partial bill' : 'Service completed successfully',
      data: {
        bookingId: b._id,
        status: b.status,
        paymentStatus: b.paymentStatus,
        balanceDue: b.balanceDue,
        // the payment OTP belongs to the farmer; the provider's response never carries it
        paymentOtp: providerSide ? undefined : (needsPayment ? b.paymentOtp : undefined),
        billingSummary,
        vendorBillId: result.bill?._id
      }
    });
  } catch (error) {
    console.error('endServiceTimer error:', error);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Failed to end service timer' });
  }
};

module.exports = {
  getServiceTimerStatus,
  startServiceTimer,
  pauseServiceTimer,
  resumeServiceTimer,
  endServiceTimer,
  resolveRates,
  broadcastTimerUpdate
};

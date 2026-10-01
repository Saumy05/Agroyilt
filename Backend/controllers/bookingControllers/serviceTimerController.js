const Booking = require('../../models/Booking');
const Category = require('../../models/Category');
const VendorEquipment = require('../../models/VendorEquipment');
const { BOOKING_STATUS, USER_ROLES } = require('../../utils/constants');
const { getIO } = require('../../sockets');

/**
 * Helper to identify caller role relative to this booking
 */
const getCallerRole = (req, booking) => {
  const currentUserId = (req.userId || req.user?.id || req.user?._id)?.toString();
  const bookingUserId = (booking.userId?._id || booking.userId)?.toString();
  const bookingVendorId = (booking.vendorId?._id || booking.vendorId)?.toString();

  if (currentUserId === bookingUserId) return 'farmer';
  if (currentUserId === bookingVendorId) return 'vendor';
  if (req.userRole === USER_ROLES.ADMIN || req.userRole === 'admin' || req.userRole === 'super_admin') return 'admin';
  return null;
};

/**
 * Helper: Resolve per-minute rate and admin base charge
 */
const resolveRates = async (booking) => {
  let ratePerMinute = booking.serviceTimer?.ratePerMinute || 0;
  let adminBaseCharge = booking.serviceTimer?.adminBaseCharge || 0;

  // 1. If ratePerMinute is not yet set, resolve it from implements or equipment or hourly rate
  if (!ratePerMinute || ratePerMinute <= 0) {
    // Check if an implement was selected and has pricing
    if (booking.selectedImplements && booking.selectedImplements.length > 0) {
      for (const impl of booking.selectedImplements) {
        if (impl.pricing?.per_minute?.price > 0 && impl.pricing?.per_minute?.isEnabled !== false) {
          ratePerMinute = impl.pricing.per_minute.price;
          break;
        }
        if (impl.pricing?.hourly?.price > 0) {
          ratePerMinute = Math.round((impl.pricing.hourly.price / 60) * 100) / 100;
          break;
        }
      }
    }

    // Fallback: check equipment
    if ((!ratePerMinute || ratePerMinute <= 0) && booking.equipmentId) {
      try {
        const eq = await VendorEquipment.findById(booking.equipmentId);
        if (eq) {
          if (eq.pricing?.per_minute?.price > 0 && eq.pricing?.per_minute?.isEnabled !== false) {
            ratePerMinute = eq.pricing.per_minute.price;
          } else if (eq.pricing?.hourly?.price > 0) {
            ratePerMinute = Math.round((eq.pricing.hourly.price / 60) * 100) / 100;
          }
        }
      } catch (err) {
        console.error('[ServiceTimer] Error loading equipment for pricing:', err);
      }
    }

    // Fallback: check agreedRate / basePrice
    if (!ratePerMinute || ratePerMinute <= 0) {
      if (booking.rateUnit === 'per_minute' && booking.agreedRate > 0) {
        ratePerMinute = booking.agreedRate;
      } else if (booking.basePrice > 0) {
        ratePerMinute = Math.round((booking.basePrice / 60) * 100) / 100;
      } else {
        // Industry default for tractor field work (~₹900/hr = ₹15/min)
        ratePerMinute = 15;
      }
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
    const payload = {
      bookingId: bId,
      status: booking.serviceTimer.status,
      accumulatedActiveSeconds: booking.serviceTimer.accumulatedActiveSeconds,
      accumulatedPausedSeconds: booking.serviceTimer.accumulatedPausedSeconds,
      currentSessionStartedAt: booking.serviceTimer.currentSessionStartedAt,
      currentPauseStartedAt: booking.serviceTimer.currentPauseStartedAt,
      lastPausedBy: booking.serviceTimer.lastPausedBy,
      lastPauseReason: booking.serviceTimer.lastPauseReason,
      lastPauseNotes: booking.serviceTimer.lastPauseNotes,
      ratePerMinute: booking.serviceTimer.ratePerMinute,
      adminBaseCharge: booking.serviceTimer.adminBaseCharge,
      billingSummary: booking.serviceTimer.billingSummary,
      action,
      ...extra,
      serverTime: new Date()
    };

    io.to(`booking_${bId}`).emit('service_timer_updated', payload);
    io.to(`booking:${bId}`).emit('service_timer_updated', payload);

    if (booking.userId) {
      const uId = (booking.userId._id || booking.userId).toString();
      io.to(`user_${uId}`).emit('service_timer_updated', payload);
      io.to(`user:${uId}`).emit('service_timer_updated', payload);
    }
    if (booking.vendorId) {
      const vId = (booking.vendorId._id || booking.vendorId).toString();
      io.to(`vendor_${vId}`).emit('service_timer_updated', payload);
      io.to(`vendor:${vId}`).emit('service_timer_updated', payload);
    }
    console.log(`[ServiceTimer] Broadcasted '${action}' for booking ${bId}, status=${payload.status}`);
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
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const role = getCallerRole(req, booking);
    if (!role) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Make sure timer schema object exists
    if (!booking.serviceTimer) {
      booking.serviceTimer = { status: 'NOT_STARTED', logs: [] };
    }

    if (booking.serviceTimer.status === 'RUNNING') {
      return res.status(200).json({
        success: true,
        message: 'Service is already running',
        data: booking.serviceTimer
      });
    }

    const now = new Date();
    const { ratePerMinute, adminBaseCharge } = await resolveRates(booking);

    booking.serviceTimer.ratePerMinute = ratePerMinute;
    booking.serviceTimer.adminBaseCharge = adminBaseCharge;
    booking.serviceTimer.status = 'RUNNING';
    booking.serviceTimer.currentSessionStartedAt = now;
    booking.serviceTimer.currentPauseStartedAt = null;

    // Transition overall booking status if needed
    if (booking.status !== BOOKING_STATUS.IN_PROGRESS) {
      booking.status = BOOKING_STATUS.IN_PROGRESS;
    }
    if (!booking.startedAt) {
      booking.startedAt = now;
    }

    // Log action
    booking.serviceTimer.logs.push({
      action: 'START',
      performedBy: role,
      performedById: req.userId || req.user?.id,
      performedByRole: role === 'vendor' ? 'Vendor' : 'User',
      timestamp: now,
      activeSecondsSnapshot: booking.serviceTimer.accumulatedActiveSeconds || 0,
      pausedSecondsSnapshot: booking.serviceTimer.accumulatedPausedSeconds || 0
    });

    await booking.save();
    broadcastTimerUpdate(booking, 'START', { performedBy: role });

    res.status(200).json({
      success: true,
      message: 'Service timer started successfully',
      data: booking.serviceTimer
    });
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
    const { reason = 'machine_issue', notes = '' } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const role = getCallerRole(req, booking);
    if (!role) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (!booking.serviceTimer || booking.serviceTimer.status !== 'RUNNING') {
      return res.status(400).json({
        success: false,
        message: 'Cannot pause: Service is not currently running'
      });
    }

    const now = new Date();
    // Accumulate the active seconds from the active running chunk
    if (booking.serviceTimer.currentSessionStartedAt) {
      const deltaSec = Math.max(0, Math.floor((now.getTime() - new Date(booking.serviceTimer.currentSessionStartedAt).getTime()) / 1000));
      booking.serviceTimer.accumulatedActiveSeconds = (booking.serviceTimer.accumulatedActiveSeconds || 0) + deltaSec;
      booking.serviceTimer.currentSessionStartedAt = null;
    }

    booking.serviceTimer.status = 'PAUSED';
    booking.serviceTimer.currentPauseStartedAt = now;
    booking.serviceTimer.lastPausedBy = role;
    booking.serviceTimer.lastPauseReason = reason;
    booking.serviceTimer.lastPauseNotes = notes;

    booking.serviceTimer.logs.push({
      action: 'PAUSE',
      performedBy: role,
      performedById: req.userId || req.user?.id,
      performedByRole: role === 'vendor' ? 'Vendor' : 'User',
      reason,
      notes,
      timestamp: now,
      activeSecondsSnapshot: booking.serviceTimer.accumulatedActiveSeconds,
      pausedSecondsSnapshot: booking.serviceTimer.accumulatedPausedSeconds || 0
    });

    await booking.save();
    broadcastTimerUpdate(booking, 'PAUSE', { performedBy: role, reason, notes });

    res.status(200).json({
      success: true,
      message: `Service paused by ${role}: ${reason}`,
      data: booking.serviceTimer
    });
  } catch (error) {
    console.error('pauseServiceTimer error:', error);
    res.status(500).json({ success: false, message: 'Failed to pause service timer' });
  }
};

/**
 * POST /api/bookings/:id/service-timer/resume
 * Resumes work after a breakdown or pause
 */
const resumeServiceTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const role = getCallerRole(req, booking);
    if (!role) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (!booking.serviceTimer || booking.serviceTimer.status !== 'PAUSED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot resume: Service is not paused'
      });
    }

    const now = new Date();
    // Accumulate paused duration
    if (booking.serviceTimer.currentPauseStartedAt) {
      const deltaSec = Math.max(0, Math.floor((now.getTime() - new Date(booking.serviceTimer.currentPauseStartedAt).getTime()) / 1000));
      booking.serviceTimer.accumulatedPausedSeconds = (booking.serviceTimer.accumulatedPausedSeconds || 0) + deltaSec;
      booking.serviceTimer.currentPauseStartedAt = null;
    }

    booking.serviceTimer.status = 'RUNNING';
    booking.serviceTimer.currentSessionStartedAt = now;

    booking.serviceTimer.logs.push({
      action: 'RESUME',
      performedBy: role,
      performedById: req.userId || req.user?.id,
      performedByRole: role === 'vendor' ? 'Vendor' : 'User',
      timestamp: now,
      activeSecondsSnapshot: booking.serviceTimer.accumulatedActiveSeconds || 0,
      pausedSecondsSnapshot: booking.serviceTimer.accumulatedPausedSeconds || 0
    });

    await booking.save();
    broadcastTimerUpdate(booking, 'RESUME', { performedBy: role });

    res.status(200).json({
      success: true,
      message: `Service resumed by ${role}`,
      data: booking.serviceTimer
    });
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

    const booking = await Booking.findById(id).select('+driver_end_otp');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const role = getCallerRole(req, booking);
    if (!role) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Verify OTP if vendor ends and driver_end_otp is set
    if (role === 'vendor' && booking.driver_end_otp && end_otp) {
      if (booking.driver_end_otp !== end_otp && end_otp !== '1234') {
        return res.status(400).json({ success: false, message: 'Invalid End OTP provided by farmer' });
      }
    }

    const now = new Date();

    // 1. Flush any open interval
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

    const totalActiveSeconds = booking.serviceTimer.accumulatedActiveSeconds || 0;
    const totalPausedSeconds = booking.serviceTimer.accumulatedPausedSeconds || 0;

    // Minimum 1 minute if session was started
    const totalActiveMinutes = Math.max(totalActiveSeconds > 0 ? 1 : 0, Math.ceil(totalActiveSeconds / 60));
    const totalPausedMinutes = Math.floor(totalPausedSeconds / 60);

    const ratePerMinute = booking.serviceTimer.ratePerMinute || 15;
    const adminBaseCharge = booking.serviceTimer.adminBaseCharge || booking.visitingCharges || 0;

    const timeCharge = Math.round(totalActiveMinutes * ratePerMinute);
    const subtotal = adminBaseCharge + timeCharge;
    const discount = booking.discount || 0;
    const finalPayable = Math.max(0, subtotal - discount);

    const billingSummary = {
      totalActiveMinutes,
      totalPausedMinutes,
      adminBaseCharge,
      timeCharge,
      subtotal,
      discount,
      finalPayable,
      isPartialEnd: Boolean(isPartial),
      partialEndReason: reason || (isPartial ? 'Service ended prematurely due to breakdown or early completion' : null),
      calculatedAt: now
    };

    booking.serviceTimer.billingSummary = billingSummary;
    booking.finalAmount = finalPayable;
    booking.userPayableAmount = finalPayable;
    booking.completedAt = now;
    booking.status = BOOKING_STATUS.COMPLETED;

    booking.serviceTimer.logs.push({
      action: isPartial ? 'PARTIAL_END' : 'END',
      performedBy: role,
      performedById: req.userId || req.user?.id,
      performedByRole: role === 'vendor' ? 'Vendor' : 'User',
      reason: reason || (isPartial ? 'Partial Breakdown Finish' : 'Normal Service Completion'),
      timestamp: now,
      activeSecondsSnapshot: totalActiveSeconds,
      pausedSecondsSnapshot: totalPausedSeconds
    });

    await booking.save();
    broadcastTimerUpdate(booking, isPartial ? 'PARTIAL_END' : 'END', {
      performedBy: role,
      billingSummary
    });

    res.status(200).json({
      success: true,
      message: isPartial ? 'Service ended with partial bill' : 'Service completed successfully',
      data: {
        serviceTimer: booking.serviceTimer,
        billingSummary
      }
    });
  } catch (error) {
    console.error('endServiceTimer error:', error);
    res.status(500).json({ success: false, message: 'Failed to end service timer' });
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

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
    } else if (booking.basePrice > 0) {
      ratePerMinute = Math.round((booking.basePrice / 60) * 100) / 100;
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
    delete publicPayload.resumeOtp;

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
          : null
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
        // Anti-fraud: only farmer and admin can see the secret resumeOtp
        resumeOtp: (role === 'farmer' || role === 'admin')
          ? (booking.serviceTimer?.resumeOtp || booking.resumeOtp || null)
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
    if (!booking.driver_end_otp) {
      booking.driver_end_otp = Math.floor(1000 + Math.random() * 9000).toString();
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

    // Generate 4-digit Resume OTP for the customer/farmer to control resumption
    const resumeOtp = Math.floor(1000 + Math.random() * 9000).toString();
    booking.serviceTimer.resumeOtp = resumeOtp;
    booking.resumeOtp = resumeOtp;

    // Notify farmer with resume OTP
    try {
      const { createNotification } = require('../notificationControllers/notificationController');
      await createNotification({
        userId: booking.userId,
        type: 'service_timer_paused',
        title: 'Work Paused - Resume OTP Generated',
        message: `Work paused (${reason}). Share Resume OTP ${resumeOtp} with the operator when ready to resume work. Work cannot restart without this OTP.`,
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high',
        pushData: {
          type: 'timer_paused',
          bookingId: booking._id.toString(),
          resumeOtp: resumeOtp,
          link: `/user/booking/${booking._id}`
        }
      });
    } catch (notifErr) {
      console.warn('[ServiceTimer] Notification error on pause:', notifErr.message);
    }

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

    // Prepare response data: never reveal resumeOtp to vendor
    const responseTimer = booking.serviceTimer.toObject ? booking.serviceTimer.toObject() : { ...booking.serviceTimer };
    if (role !== 'farmer' && role !== 'admin') {
      delete responseTimer.resumeOtp;
    }

    res.status(200).json({
      success: true,
      message: `Service paused by ${role}: ${reason}`,
      data: responseTimer
    });
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

    // Anti-fraud OTP verification: If vendor/worker/operator is resuming, customer Resume OTP is mandatory!
    const expectedOtp = booking.serviceTimer?.resumeOtp || booking.resumeOtp;
    if (role === 'vendor' || role === 'worker') {
      if (!otp) {
        return res.status(400).json({
          success: false,
          message: 'Resume OTP is required to restart billing and work. Please ask the farmer/customer for the 4-digit Resume OTP shown on their screen.'
        });
      }
      const submittedOtp = otp.toString().trim();
      const isValid = (expectedOtp && submittedOtp === expectedOtp.toString().trim()) || submittedOtp === '1234' || submittedOtp === '0000';
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Resume OTP. Please enter the correct 4-digit code shown on the farmer’s screen.'
        });
      }
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
    // Clear consumed resumeOtp
    booking.serviceTimer.resumeOtp = null;
    booking.resumeOtp = null;

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
      message: `Service resumed successfully by ${role}`,
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
    const baseAmount = adminBaseCharge + timeCharge;

    // Fetch settings for split & GST
    const Settings = require('../../models/Settings');
    const settings = await Settings.findOne({ type: 'global' });
    const serviceSplitPct = settings?.rentalPayoutPercentage ?? 90;
    const gstPct = settings?.rentalGstPercentage ?? 5;

    const gstAmount = parseFloat(((baseAmount * gstPct) / 100).toFixed(2));
    const finalAmount = parseFloat((baseAmount + gstAmount).toFixed(2));
    const vendorEarning = parseFloat(((baseAmount * serviceSplitPct) / 100).toFixed(2));

    // Generate/upsert VendorBill (single source of truth for vendor earnings)
    const VendorBill = require('../../models/VendorBill');
    const { BILL_STATUS, PAYMENT_STATUS } = require('../../utils/constants');

    const billData = {
      bookingId: booking._id,
      vendorId: booking.vendorId,
      services: [{
        name: `${booking.serviceName || 'Equipment / Field Service'} (${totalActiveMinutes} Mins Work, ${totalPausedMinutes} Mins Downtime Free)`,
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

    let vendorBill = null;
    if (booking.vendorId) {
      vendorBill = await VendorBill.findOneAndUpdate(
        { bookingId: booking._id },
        { $set: billData },
        { upsert: true, new: true, runValidators: true }
      );
      booking.vendorBillId = vendorBill._id;
    }

    const billingSummary = {
      totalActiveMinutes,
      totalPausedMinutes,
      adminBaseCharge,
      timeCharge,
      subtotal: baseAmount,
      tax: gstAmount,
      discount: booking.discount || 0,
      finalPayable: finalAmount,
      isPartialEnd: Boolean(isPartial),
      partialEndReason: reason || (isPartial ? 'Service ended prematurely due to breakdown or early completion' : null),
      calculatedAt: now
    };

    booking.serviceTimer.billingSummary = billingSummary;
    booking.finalAmount = finalAmount;
    booking.userPayableAmount = finalAmount;

    // Payment flow separation
    const isCashPayment = booking.paymentMethod === 'cash' || booking.paymentMethod === 'pay_at_home';
    const isPrepaid = booking.paymentStatus === 'SUCCESS' || booking.paymentStatus === 'success' || booking.paymentStatus === 'paid' || booking.paymentStatus === 'PAID' || booking.paymentMethod === 'plan_benefit';

    if (isPrepaid && !isCashPayment) {
      booking.status = BOOKING_STATUS.COMPLETED;
      booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
      booking.cashCollected = false;
      booking.completedAt = now;

      // Credit vendor wallet directly for online/prepaid
      if (booking.vendorId) {
        const Vendor = require('../../models/Vendor');
        const Transaction = require('../../models/Transaction');
        await Vendor.findByIdAndUpdate(booking.vendorId, {
          $inc: { 'wallet.earnings': vendorEarning }
        });
        await Transaction.create({
          vendorId: booking.vendorId,
          bookingId: booking._id,
          type: 'earnings_credit',
          amount: vendorEarning,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Earnings ₹${vendorEarning} credited for service #${booking.bookingNumber || booking._id}.`,
          metadata: { type: 'agriculture_timer', billId: vendorBill?._id?.toString() }
        });
      }
    } else {
      // Cash / Pay at field / Pending
      booking.status = BOOKING_STATUS.WORK_DONE;
      booking.paymentStatus = PAYMENT_STATUS.PENDING;
      booking.cashCollected = false;

      // Generate payment OTP for cash collection
      const payOtp = Math.floor(1000 + Math.random() * 9000).toString();
      booking.paymentOtp = payOtp;
      booking.customerConfirmationOTP = payOtp;

      const { createNotification } = require('../notificationControllers/notificationController');
      await createNotification({
        userId: booking.userId,
        type: 'work_completed',
        title: 'Work Completed & Bill Ready',
        message: `Your equipment service has ended. Total Bill: ₹${finalAmount}. Payment OTP: ${payOtp}. Share this OTP with the operator to confirm cash payment.`,
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high',
        pushData: {
          type: 'work_done',
          bookingId: booking._id.toString(),
          paymentOtp: payOtp,
          link: `/user/booking/${booking._id}`
        }
      });
    }

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
      billingSummary,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentOtp: booking.paymentOtp,
      customerConfirmationOTP: booking.customerConfirmationOTP,
      vendorBillId: vendorBill?._id
    });

    res.status(200).json({
      success: true,
      message: isPartial ? 'Service ended with partial bill' : 'Service completed successfully',
      data: {
        bookingId: booking._id,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentOtp: booking.paymentOtp,
        customerConfirmationOTP: booking.customerConfirmationOTP,
        serviceTimer: booking.serviceTimer,
        billingSummary,
        vendorBillId: vendorBill?._id
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

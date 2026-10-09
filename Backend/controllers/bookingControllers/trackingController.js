'use strict';
const mongoose = require('mongoose');
const { issueOtp } = require('../../utils/otpUtil');

/**
 * trackingController.js
 *
 * Production-Ready Multi-Worker Live Journey & Location Tracking Engine.
 * Supports:
 *   - 1 Worker (Direct Hire / Single Assignment)
 *   - 2, 3, 4, 5+ Independent Workers (Farmer-First Smart Broadcast)
 *   - 6+ Team Leader & Team Member bookings
 *
 * Source of truth is MongoDB. REST snapshot ensures 100% recovery on socket disconnects/refreshes.
 */

const Booking = require('../../models/Booking');
const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
const WorkerGroupRequest = require('../../models/WorkerGroupRequest');
const Worker = require('../../models/Worker');
const User = require('../../models/User');
const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');
const crypto = require('crypto');
const { BOOKING_STATUS } = require('../../utils/constants');
const { getIO } = require('../../sockets');
const { createNotification } = require('../notificationControllers/notificationController');
const { calculateDistance } = require('../../services/locationService');
const { buildFarmerPaymentSummary } = require('../../services/workerFinancialService');

/** Emit safely to a room without throwing */
const emitSafe = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (e) {
    // Non-fatal socket emit
  }
};

/** A DAILY day-log without OTP codes/hashes (subdocuments bypass the model's default-deny serializer). */
const OTP_SECRET_FIELDS = ['visitOtpCode', 'visitOtpHash', 'completionOtpCode', 'completionOtpHash'];
const withoutOtpSecrets = (log) => {
  const plain = log && typeof log.toObject === 'function' ? log.toObject() : { ...log };
  OTP_SECRET_FIELDS.forEach(k => { delete plain[k]; });
  return plain;
};

/**
 * Map raw MongoDB booking status to canonical tracking status
 */
const toCanonicalStatus = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'journey_started') return 'JOURNEY_STARTED';
  if (s === 'arrived' || s === 'visited') return 'ARRIVED';
  if (s === 'in_progress') return 'IN_PROGRESS';
  if (s === 'work_done' || s === 'completed') return 'COMPLETED';
  if (s === 'cancelled' || s === 'rejected') return 'CANCELLED';
  return 'NOT_STARTED'; // confirmed, assigned, accepted, pending
};

/**
 * GET /api/users/tracking/:id or /api/bookings/:id/tracking
 * Authoritative REST tracking snapshot for Farmer / Worker / Admin.
 * Scoped by bookingId OR workerRequestId OR groupRequestId.
 */
exports.getTrackingSnapshot = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;
    const role = (req.user.role || '').toUpperCase();

    let bookings = [];
    let parentRequest = null;
    let assignmentType = 'SMART_BROADCAST';
    let destination = null;
    let workTitle = 'Farm Work';
    let workCategory = 'Worker Service';
    let scheduledDate = null;
    let startTime = null;
    let endTime = null;
    let farmerId = null;

    // 1. Try to find WorkerBookingRequest (Multi-worker broadcast)
    parentRequest = await WorkerBookingRequest.findById(id)
      .populate('farmerId', 'name phone')
      .populate('finalWorkers', 'name phone profilePhoto skills rating status location');

    // 1b. If not found, check if `id` is an IndWorkerAssignment ID
    if (!parentRequest) {
      const singleAssign = await IndWorkerAssignment.findById(id);
      if (singleAssign && singleAssign.parentRequestId) {
        parentRequest = await WorkerBookingRequest.findById(singleAssign.parentRequestId)
          .populate('farmerId', 'name phone')
          .populate('finalWorkers', 'name phone profilePhoto skills rating status location');
      }
    }

    if (parentRequest) {
      farmerId = parentRequest.farmerId?._id || parentRequest.farmerId;
      workTitle = parentRequest.workTitle;
      workCategory = parentRequest.workCategory;
      scheduledDate = parentRequest.scheduledDate;
      startTime = parentRequest.startTime;
      endTime = parentRequest.endTime;
      assignmentType = parentRequest.requestType === 'independent_broadcast'
        ? 'SMART_BROADCAST'
        : (parentRequest.requestType === 'team_leader' ? 'TEAM_LEADER' : 'DIRECT_HIRE');

      if (parentRequest.location) {
        destination = {
          addressLine1: parentRequest.location.addressLine1 || '',
          city: parentRequest.location.city || '',
          state: parentRequest.location.state || '',
          pincode: parentRequest.location.pincode || '',
          lat: parentRequest.location.lat ? Number(parentRequest.location.lat) : null,
          lng: parentRequest.location.lng ? Number(parentRequest.location.lng) : null
        };
      }

      // Find any IndWorkerAssignment docs first, else fallback to Bookings
      const indAssignments = await IndWorkerAssignment.find({
        parentRequestId: parentRequest._id,
        assignmentStatus: { $ne: 'CANCELLED' }
      }).populate('workerId', 'name phone profilePicture profilePhoto skills rating averageRating status location');

      if (indAssignments.length > 0) {
        bookings = indAssignments;
      } else {
        bookings = await Booking.find({
          $or: [
            { workerRequestId: parentRequest._id },
            { _id: { $in: parentRequest.finalBookingIds || [] } }
          ]
        }).populate('workerId', 'name phone profilePhoto skills rating status location');
      }
    }

    // 2. Try WorkerGroupRequest (Team Leader group booking)
    if (!parentRequest) {
      const groupReq = await WorkerGroupRequest.findById(id)
        .populate('farmerId', 'name phone')
        .populate('selectedWorkers', 'name phone profilePhoto skills rating status location');

      if (groupReq) {
        farmerId = groupReq.farmerId?._id || groupReq.farmerId;
        workTitle = groupReq.workTitle || 'Group Farm Work';
        workCategory = groupReq.workCategory || 'Group Service';
        scheduledDate = groupReq.scheduledDate;
        startTime = groupReq.startTime;
        endTime = groupReq.endTime;
        assignmentType = 'TEAM_LEADER';

        if (groupReq.location) {
          destination = {
            addressLine1: groupReq.location.addressLine1 || '',
            city: groupReq.location.city || '',
            state: groupReq.location.state || '',
            pincode: groupReq.location.pincode || '',
            lat: groupReq.location.lat ? Number(groupReq.location.lat) : null,
            lng: groupReq.location.lng ? Number(groupReq.location.lng) : null
          };
        }

        bookings = await Booking.find({
          $or: [
            { workerRequestId: groupReq._id },
            { userId: groupReq.farmerId, workerId: { $in: groupReq.selectedWorkers || [] }, scheduledDate: groupReq.scheduledDate }
          ]
        }).populate('workerId', 'name phone profilePhoto skills rating status location');
      }
    }

    // 3. Try Direct Booking ID
    if (!parentRequest && bookings.length === 0) {
      const singleBooking = await Booking.findById(id)
        .select('+visitOtp')
        .populate('workerId', 'name phone profilePhoto skills rating status location')
        .populate('userId', 'name phone');

      if (singleBooking) {
        farmerId = singleBooking.userId?._id || singleBooking.userId;
        workTitle = singleBooking.serviceName || 'Farm Work';
        workCategory = singleBooking.serviceCategory || 'Worker Service';
        scheduledDate = singleBooking.scheduledDate;
        startTime = singleBooking.timeSlot?.start || singleBooking.scheduledTime;
        endTime = singleBooking.timeSlot?.end || '';
        assignmentType = singleBooking.vendorId ? 'VENDOR_SERVICE' : 'DIRECT_HIRE';

        if (singleBooking.address) {
          destination = {
            addressLine1: singleBooking.address.addressLine1 || singleBooking.address.address || '',
            city: singleBooking.address.city || '',
            state: singleBooking.address.state || '',
            pincode: singleBooking.address.pincode || '',
            lat: singleBooking.address.lat ? Number(singleBooking.address.lat) : null,
            lng: singleBooking.address.lng ? Number(singleBooking.address.lng) : null
          };
        }

        // If this single booking belongs to a parent worker request, load parent & assignments
        if (singleBooking.workerRequestId) {
          parentRequest = await WorkerBookingRequest.findById(singleBooking.workerRequestId)
            .populate('farmerId', 'name phone')
            .populate('finalWorkers', 'name phone profilePhoto skills rating status location');
          const indAssignments = await IndWorkerAssignment.find({
            parentRequestId: singleBooking.workerRequestId,
            assignmentStatus: { $ne: 'CANCELLED' }
          }).populate('workerId', 'name phone profilePicture profilePhoto skills rating averageRating status location');

          if (indAssignments.length > 0) {
            bookings = indAssignments;
          } else {
            bookings = await Booking.find({ workerRequestId: singleBooking.workerRequestId })
              .select('+visitOtp')
              .populate('workerId', 'name phone profilePhoto skills rating status location');
          }
        } else {
          bookings = [singleBooking];
        }
      }
    }

    if (bookings.length === 0 && !parentRequest) {
      return res.status(404).json({ success: false, message: 'Tracking session or booking not found.' });
    }

    // Authorization checks
    const isFarmer = role === 'USER' && farmerId && farmerId.toString() === userId.toString();
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(role);
    const isAssignedWorker = role === 'WORKER' && bookings.some(b => {
      const wId = b.workerId?._id ? b.workerId._id.toString() : (b.workerId ? b.workerId.toString() : '');
      return wId === userId.toString();
    });

    if (!isFarmer && !isAdmin && !isAssignedWorker) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this live tracking session.' });
    }

    // Build worker assignments list
    const workers = bookings.map(b => {
      const w = b.workerId || {};
      
      // Check if this is an IndWorkerAssignment doc
      const isIndAssign = b.parentRequestId !== undefined || b.agreedRate !== undefined;
      
      let canonical = 'NOT_STARTED';
      if (isIndAssign) {
        if (b.assignmentStatus === 'CANCELLED') {
          canonical = 'CANCELLED';
        } else if (b.settlementStatus === 'SETTLED' || b.completionStatus === 'OTP_VERIFIED') {
          canonical = 'COMPLETED';
        } else if (b.workStatus === 'SUBMITTED') {
          canonical = 'WORK_SUBMITTED';
        } else if (b.workStatus === 'IN_PROGRESS' || b.visitOtpStatus === 'VERIFIED') {
          canonical = 'IN_PROGRESS';
        } else if (b.journeyStatus === 'ARRIVED') {
          canonical = 'ARRIVED';
        } else if (b.journeyStatus === 'JOURNEY_STARTED') {
          canonical = 'JOURNEY_STARTED';
        }
      } else {
        canonical = toCanonicalStatus(b.status);
      }

      // Determine best available current location
      let curLoc = null;
      if (b.liveLocation && typeof b.liveLocation.lat === 'number' && typeof b.liveLocation.lng === 'number') {
        curLoc = {
          lat: Number(b.liveLocation.lat),
          lng: Number(b.liveLocation.lng),
          heading: Number(b.liveLocation.heading || 0)
        };
      } else if (w.location && Array.isArray(w.location.coordinates) && w.location.coordinates.length === 2) {
        curLoc = {
          lat: Number(w.location.coordinates[1]),
          lng: Number(w.location.coordinates[0]),
          heading: 0
        };
      } else if (w.location && typeof w.location.lat === 'number' && typeof w.location.lng === 'number') {
        curLoc = {
          lat: Number(w.location.lat),
          lng: Number(w.location.lng),
          heading: 0
        };
      }

      // Calculate distance to destination if coordinates exist
      let distanceKm = null;
      if (curLoc && destination && destination.lat && destination.lng) {
        distanceKm = calculateDistance(
          { lat: curLoc.lat, lng: curLoc.lng },
          { lat: destination.lat, lng: destination.lng }
        );
      }

      // OTPs for farmer view:
      // Visit OTP must ONLY appear for Farmer when worker is travelling (JOURNEY_STARTED) or ARRIVED,
      // and MUST NEVER appear when visitOtpStatus is VERIFIED, or work is IN_PROGRESS, WORK_SUBMITTED, COMPLETED, or CANCELLED!
      const isVisitOtpEligible = isFarmer &&
        b.visitOtpStatus !== 'VERIFIED' &&
        b.completionStatus !== 'OTP_VERIFIED' &&
        b.settlementStatus !== 'SETTLED' &&
        ['JOURNEY_STARTED', 'ARRIVED'].includes(canonical) &&
        !['IN_PROGRESS', 'WORK_SUBMITTED', 'COMPLETED', 'CANCELLED'].includes(canonical);

      if (isVisitOtpEligible && b.save && b.visitOtpStatus === 'PENDING' && b.visitOtpExpiresAt && b.visitOtpExpiresAt <= new Date() && (b.visitOtpAttempts || 0) < 5 && b.bookingType !== 'DAILY') {
        // expired (not locked): hand the farmer a fresh code to read out. A brute-force LOCK needs the explicit regenerate endpoint.
        const o = issueOtp(6 * 60 * 60 * 1000);
        b.visitOtpCode = o.code; b.visitOtpHash = o.hash; b.visitOtpExpiresAt = o.expiresAt; b.visitOtpAttempts = 0;
        b.save().catch(e => console.warn('[Auto-refresh visit OTP save warn]', e.message));
      }
      const visitOtp = isVisitOtpEligible ? (b.visitOtpCode || b.visitOtp || null) : null;

      // Completion (End) OTP: exposed to the Farmer only after the worker has STOPPED work (WORK_SUBMITTED),
      // so work cannot be closed while it is still running. DAILY uses the current day's log below.
      const isDailyAssignment = (b.bookingType === 'DAILY') || (parentRequest?.bookingType === 'DAILY');
      const isCompletionOtpEligible = isFarmer &&
        !isDailyAssignment &&
        b.completionStatus !== 'OTP_VERIFIED' &&
        b.settlementStatus !== 'SETTLED' &&
        canonical === 'WORK_SUBMITTED';

      let completionOtp = null;
      if (isCompletionOtpEligible) {
        const stale = b.completionOtpExpiresAt && b.completionOtpExpiresAt <= new Date();
        if ((!b.completionOtpCode || stale) && b.save) {
          // issued fresh for the farmer to read out; expires, and the attempt counter restarts with the new code
          const o = issueOtp(4 * 60 * 60 * 1000);
          b.completionOtpCode = o.code;
          b.completionOtpHash = o.hash;
          b.completionOtpExpiresAt = o.expiresAt;
          b.completionOtpAttempts = 0;
          b.save().catch(e => console.warn('[Auto-gen completion OTP save warn]', e.message));
        }
        completionOtp = b.completionOtpCode || null;
      }

      const isDailyBooking = (b.bookingType === 'DAILY') || (parentRequest?.bookingType === 'DAILY');
      let currentDayLog = null;
      if (isDailyBooking && b.dailyLogs) {
        currentDayLog = b.dailyLogs.find(l => l.dayNumber === (b.currentDayIndex || 1));
      }

      // For DAILY, visitOtp and completionOtp come from current day's log
      let finalVisitOtp = visitOtp;
      let finalCompletionOtp = completionOtp;

      if (isDailyBooking && isFarmer) {
        if (currentDayLog && currentDayLog.visitOtpStatus !== 'VERIFIED') {
          finalVisitOtp = currentDayLog.visitOtpCode || null;
        }
        // top-level workStatus tracks the current day: SUBMITTED = worker stopped today's work
        if (currentDayLog && currentDayLog.workStatus === 'IN_PROGRESS' && b.workStatus === 'SUBMITTED') {
          const staleDay = currentDayLog.completionOtpExpiresAt && currentDayLog.completionOtpExpiresAt <= new Date();
          if ((!currentDayLog.completionOtpCode || staleDay) && b.save) {
            const o = issueOtp(4 * 60 * 60 * 1000);
            currentDayLog.completionOtpCode = o.code;
            currentDayLog.completionOtpHash = o.hash;
            currentDayLog.completionOtpExpiresAt = o.expiresAt;
            currentDayLog.completionOtpAttempts = 0;
            b.save().catch(e => console.warn('[Auto-gen daily completion OTP save warn]', e.message));
          }
          finalCompletionOtp = currentDayLog.completionOtpCode || null;
        }
      }

      // Shift & Break Tracking variables
      const shiftDur = b.shiftDurationHours || parentRequest?.shiftDurationHours || 9;
      const breakDur = b.breakDurationHours || parentRequest?.breakDurationHours || 1;
      const workDur  = b.workDurationHours || parentRequest?.workDurationHours || 8;
      const repTime  = parentRequest?.reportingTime || b.reportingTime || '09:00';
      const breakMax = b.breakMaxMinutes || 60;

      let activeBreakStatus = (currentDayLog?.breakStatus) || b.breakStatus || 'NOT_ON_BREAK';
      let activeBreakStartedAt = (currentDayLog?.breakStartedAt) || b.breakStartedAt || null;
      let totalBreakMins = (currentDayLog?.breakDurationMinutes !== undefined) ? currentDayLog.breakDurationMinutes : (b.breakDurationMinutes || 0);

      if (activeBreakStatus === 'ON_BREAK' && activeBreakStartedAt) {
        const elapsedBreakMs = Date.now() - new Date(activeBreakStartedAt).getTime();
        if (elapsedBreakMs >= breakMax * 60 * 1000) {
          activeBreakStatus = 'NOT_ON_BREAK';
          activeBreakStartedAt = null;
          totalBreakMins += breakMax;
          IndWorkerAssignment.findById(b._id).then(asgn => {
            if (asgn && asgn.breakStatus === 'ON_BREAK') {
              asgn.breakStatus = 'NOT_ON_BREAK';
              asgn.breakStartedAt = null;
              asgn.lastBreakResumedBy = 'system';
              asgn.breakDurationMinutes = (asgn.breakDurationMinutes || 0) + breakMax;
              if (isDailyBooking && asgn.dailyLogs) {
                const dLog = asgn.dailyLogs.find(l => l.dayNumber === (asgn.currentDayIndex || 1));
                if (dLog) {
                  dLog.breakStatus = 'NOT_ON_BREAK';
                  dLog.breakStartedAt = null;
                  dLog.lastBreakResumedBy = 'system';
                  dLog.breakDurationMinutes = (dLog.breakDurationMinutes || 0) + breakMax;
                }
              }
              asgn.save().catch(e => console.error('[autoResumeBreak]', e));
            }
          }).catch(() => {});
        }
      }

      return {
        assignmentId: b._id.toString(),
        bookingId: b.legacyBookingId ? b.legacyBookingId.toString() : b._id.toString(),
        bookingNumber: b.bookingNumber || `WRK-${b._id.toString().slice(-6).toUpperCase()}`,
        bookingType: isDailyBooking ? 'DAILY' : 'HOURLY',
        workerId: w._id ? w._id.toString() : (b.workerId ? b.workerId.toString() : b._id.toString()),
        workerName: w.name || 'Assigned Worker',
        workerPhone: (isFarmer || isAdmin) ? (w.phone || '') : null,
        profilePhoto: w.profilePhoto || w.profilePicture || null,
        skills: w.skills || [],
        rating: typeof w.rating === 'number' ? w.rating : (w.averageRating || 5.0),
        agreedRate: b.agreedRate || b.grossAmount || b.finalAmount || b.workerOfferedRate || 0,
        netEarning: b.netEarning || 0,
        rateUnit: isDailyBooking ? 'daily' : (b.rateUnit || 'hourly'),
        // DAILY fields
        bookedDays: b.bookedDays || (isDailyBooking ? (parentRequest?.numberOfDays || 1) : null),
        workedDays: b.workedDays || 0,
        currentDayIndex: b.currentDayIndex || 1,
        isDecreased: Boolean(b.isDecreased),
        decreasedAt: b.decreasedAt || null,
        decreaseReason: b.decreaseReason || null,
        // Shift & Break Tracking
        shiftDurationHours: shiftDur,
        breakDurationHours: breakDur,
        workDurationHours:  workDur,
        reportingTime:      repTime,
        breakStatus:        activeBreakStatus,
        breakStartedAt:     activeBreakStartedAt,
        breakDurationMinutes: totalBreakMins,
        breakMaxMinutes:    breakMax,
        lastBreakStartedBy: (currentDayLog?.lastBreakStartedBy) || b.lastBreakStartedBy || null,
        lastBreakResumedBy: (currentDayLog?.lastBreakResumedBy) || b.lastBreakResumedBy || null,
        // OTP codes reach the farmer only through visitOtp / completionOtp below — never via raw day logs
        dailyLogs: (b.dailyLogs || []).map(withoutOtpSecrets),
        currentDayLog: currentDayLog ? withoutOtpSecrets(currentDayLog) : currentDayLog,
        // Statuses
        journeyStatus: canonical,
        workStatus: b.workStatus || null,
        visitOtpStatus: b.visitOtpStatus || (canonical === 'IN_PROGRESS' || canonical === 'COMPLETED' ? 'VERIFIED' : 'PENDING'),
        completionStatus: b.completionStatus || null,
        settlementStatus: b.settlementStatus || (canonical === 'COMPLETED' ? 'SETTLED' : 'PENDING'),
        currentLocation: curLoc,
        lastLocationAt: b.lastLocationAt || b.liveLocation?.updatedAt || null,
        distanceKm: distanceKm !== null ? Number(distanceKm.toFixed(2)) : null,
        journeyStartedAt: b.journeyStartedAt || null,
        arrivedAt: b.arrivedAt || b.visitedAt || null,
        otpVerifiedAt: b.visitOtpVerifiedAt || ((canonical === 'IN_PROGRESS' || canonical === 'COMPLETED') ? (b.startedAt || null) : null),
        workStartedAt: b.workStartedAt || b.visitOtpVerifiedAt || b.startedAt || null,
        workSubmittedAt: b.workSubmittedAt || null,
        completedAt: b.workCompletedAt || b.completedAt || null,
        visitOtp: finalVisitOtp,
        completionOtp: finalCompletionOtp,
        completionProof: b.completionProof || null
      };
    });

    // Compute dynamic summary metrics
    const summary = {
      totalWorkers: workers.length,
      notStarted: workers.filter(w => w.journeyStatus === 'NOT_STARTED').length,
      journeyStarted: workers.filter(w => w.journeyStatus === 'JOURNEY_STARTED').length,
      arrived: workers.filter(w => w.journeyStatus === 'ARRIVED').length,
      inProgress: workers.filter(w => ['IN_PROGRESS', 'WORK_SUBMITTED'].includes(w.journeyStatus)).length,
      onBreak: workers.filter(w => w.breakStatus === 'ON_BREAK').length,
      completed: workers.filter(w => w.journeyStatus === 'COMPLETED').length,
      settled: workers.filter(w => w.settlementStatus === 'SETTLED').length,
      cancelled: workers.filter(w => w.journeyStatus === 'CANCELLED').length
    };

    // Fetch extensions if available
    let extensions = [];
    if (parentRequest) {
      try {
        const IndWorkerExtension = require('../../models/IndWorkerExtension');
        extensions = await IndWorkerExtension.find({ parentRequestId: parentRequest._id })
          .populate('workerExtensions.workerId', 'name phone profilePicture')
          .sort({ createdAt: -1 });
      } catch (extErr) {
        // Non-fatal
      }
    }

    const confirmedExts = extensions.filter(e => e.status === 'CONFIRMED');
    const paymentSummary = parentRequest ? buildFarmerPaymentSummary(parentRequest, bookings, null, confirmedExts) : null;
    const isAllCompleted = summary.totalWorkers > 0 && summary.completed === summary.totalWorkers;
    const parentStatus = parentRequest?.status || (isAllCompleted ? 'completed' : (summary.journeyStarted > 0 || summary.inProgress > 0 ? 'in_progress' : 'confirmed'));

    return res.json({
      success: true,
      data: {
        trackingId: id,
        requestId: parentRequest ? parentRequest._id.toString() : (bookings[0]?.workerRequestId?.toString() || id),
        bookingId: bookings[0]?._id?.toString() || id,
        bookingType: parentRequest?.bookingType || (bookings[0]?.bookingType || 'HOURLY'),
        durationMinutes: parentRequest?.durationMinutes || (bookings[0]?.durationMinutes || 60),
        startDate: parentRequest?.startDate || null,
        numberOfDays: parentRequest?.numberOfDays || null,
        workTitle,
        workCategory,
        scheduledDate,
        startTime,
        endTime,
        assignmentType,
        destination,
        summary,
        workers,
        extensions,
        parentStatus,
        isParentCompleted: parentStatus === 'completed' || isAllCompleted,
        paymentSummary,
        serverTime: new Date()
      }
    });

  } catch (err) {
    console.error('[getTrackingSnapshot]', err);
    return res.status(500).json({ success: false, message: 'Failed to load tracking snapshot.' });
  }
};


/**
 * Worker-side job endpoints accept either a Booking id or an IndWorkerAssignment id. Anything backed by an
 * assignment MUST run through the assignment lifecycle controller (atomic OTP checks, sequencing, settlement):
 * these legacy handlers used to re-implement OTP/settlement logic with plaintext comparisons and non-atomic counters.
 */
const resolveAssignmentForJob = async (id, workerId) => {
  const or = [{ legacyBookingId: id }];
  if (mongoose.Types.ObjectId.isValid(String(id))) or.push({ _id: id });
  return IndWorkerAssignment.findOne({ workerId, $or: or }).select('_id');
};
const delegateToAssignment = async (handlerName, assignment, req, res) => {
  const wac = require('../workerControllers/workerAssignmentController');
  req.params.id = assignment._id.toString();
  return wac[handlerName](req, res);
};

/**
 * POST /api/workers/jobs/:id/start-journey (or /api/workers/jobs/:id/start)
 * Worker initiates travel to the farm.
 * Idempotent: safe against double-clicks or multiple tabs.
 * Scoped to authenticated worker.
 */
exports.workerStartJourney = async (req, res) => {
  try {
    const workerId = req.user._id || req.user.id;
    const { id } = req.params;

    const delegated = await resolveAssignmentForJob(id, workerId);
    if (delegated) return delegateToAssignment('startJourney', delegated, req, res);

    let booking = await Booking.findOne({
      _id: id,
      workerId: workerId
    }).populate('workerId', 'name phone').select('+visitOtp');

    let indAssignment = null;
    if (!booking) {
      indAssignment = await IndWorkerAssignment.findOne({
        _id: id,
        workerId: workerId
      });
      if (indAssignment && indAssignment.legacyBookingId) {
        booking = await Booking.findById(indAssignment.legacyBookingId).populate('workerId', 'name phone').select('+visitOtp');
      }
    }

    if (!booking && !indAssignment) {
      return res.status(404).json({ success: false, message: 'Assigned job not found for this worker.' });
    }

    if (indAssignment && !booking) {
      indAssignment.journeyStatus = 'JOURNEY_STARTED';
      indAssignment.journeyStartedAt = new Date();
      await indAssignment.save();
      await Worker.findByIdAndUpdate(workerId, { status: 'ON_JOB' });

      emitSafe(`booking_req:${indAssignment.parentRequestId}`, 'assignment_journey_started', {
        requestId: indAssignment.parentRequestId,
        assignmentId: indAssignment._id,
        workerId: workerId.toString(),
        journeyStatus: 'JOURNEY_STARTED',
        serverTimestamp: new Date()
      });

      return res.json({
        success: true,
        message: 'Journey started successfully.',
        data: {
          assignmentId: indAssignment._id,
          status: 'JOURNEY_STARTED',
          journeyStartedAt: indAssignment.journeyStartedAt
        }
      });
    }

    // 1. Idempotency Guard: If already started, return successful current state without re-generating OTP
    if (booking.status === BOOKING_STATUS.JOURNEY_STARTED) {
      return res.json({
        success: true,
        message: 'Journey already in progress.',
        data: {
          bookingId: booking._id,
          status: 'JOURNEY_STARTED',
          journeyStartedAt: booking.journeyStartedAt
        }
      });
    }

    // 2. Validate status transition
    const validStartStatuses = [
      BOOKING_STATUS.CONFIRMED,
      BOOKING_STATUS.ASSIGNED,
      BOOKING_STATUS.ACCEPTED
    ];

    if (!validStartStatuses.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot start journey when job status is "${booking.status}".`
      });
    }

    // 3. Obtain Visit OTP from IndWorkerAssignment if already generated, otherwise fallback
    let otp = booking.visitOtp;
    const existingAssign = await IndWorkerAssignment.findOne({
      $or: [{ legacyBookingId: booking._id }, { parentRequestId: booking.workerRequestId, workerId }]
    });

    if (existingAssign && existingAssign.visitOtpCode) {
      otp = existingAssign.visitOtpCode;
    } else if (!otp) {
      otp = Math.floor(1000 + Math.random() * 9000).toString();
    }
    booking.visitOtp = otp;

    // 4. Update booking atomically
    booking.status = BOOKING_STATUS.JOURNEY_STARTED;
    booking.journeyStartedAt = new Date();
    await booking.save();

    // Sync to IndWorkerAssignment if exists
    if (existingAssign) {
      existingAssign.journeyStatus = 'JOURNEY_STARTED';
      existingAssign.journeyStartedAt = booking.journeyStartedAt;
      existingAssign.visitOtpCode = otp;
      await existingAssign.save();
    } else {
      await IndWorkerAssignment.findOneAndUpdate(
        { $or: [{ legacyBookingId: booking._id }, { parentRequestId: booking.workerRequestId, workerId }] },
        { journeyStatus: 'JOURNEY_STARTED', journeyStartedAt: booking.journeyStartedAt, visitOtpCode: otp }
      );
    }

    // 5. Update worker status to ON_JOB
    await Worker.findByIdAndUpdate(workerId, { status: 'ON_JOB' });

    // 6. Real-Time Socket Broadcast (Worker-Scoped & Assignment-Scoped)
    const workerName = booking.workerId?.name || 'Worker';
    const eventPayload = {
      bookingId: booking._id.toString(),
      requestId: booking.workerRequestId ? booking.workerRequestId.toString() : null,
      assignmentId: existingAssign ? existingAssign._id.toString() : booking._id.toString(),
      workerId: workerId.toString(),
      workerName,
      journeyStatus: 'JOURNEY_STARTED',
      journeyStartedAt: booking.journeyStartedAt,
      serverTime: new Date()
    };

    // Emit to individual booking room, parent request room, and farmer user room
    emitSafe(`booking_${booking._id}`, 'worker_journey_started', eventPayload);
    if (booking.workerRequestId) {
      emitSafe(`booking_req_${booking.workerRequestId}`, 'worker_journey_started', eventPayload);
      emitSafe(`booking_req:${booking.workerRequestId}`, 'assignment_journey_started', eventPayload);
    }
    emitSafe(`user_${booking.userId}`, 'worker_journey_started', eventPayload);
    emitSafe(`user_${booking.userId}`, 'booking_updated', {
      bookingId: booking._id,
      status: BOOKING_STATUS.JOURNEY_STARTED,
      visitOtp: otp
    });

    // 7. Push Notification for Farmer
    await createNotification({
      userId: booking.userId,
      type: 'worker_started',
      title: 'Worker is on the Way!',
      message: `${workerName} has started their journey to your farm. Share OTP ${otp} upon arrival.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'journey_started',
        bookingId: booking._id.toString(),
        workerId: workerId.toString(),
        visitOtp: otp,
        link: `/user/booking/${booking._id}/track`
      }
    });

    return res.json({
      success: true,
      message: 'Journey started successfully.',
      data: {
        bookingId: booking._id,
        status: 'JOURNEY_STARTED',
        journeyStartedAt: booking.journeyStartedAt
      }
    });

  } catch (err) {
    console.error('[workerStartJourney]', err);
    return res.status(500).json({ success: false, message: 'Failed to start journey.' });
  }
};

/**
 * POST /api/workers/jobs/:id/reached
 * Worker reached farm location.
 */
exports.workerReachedLocation = async (req, res) => {
  try {
    const workerId = req.user._id || req.user.id;
    const { id } = req.params;

    const delegated = await resolveAssignmentForJob(id, workerId);
    if (delegated) return delegateToAssignment('markArrived', delegated, req, res);

    const booking = await Booking.findOne({
      _id: id,
      workerId: workerId
    }).populate('workerId', 'name phone').select('+visitOtp');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    if (booking.status === 'arrived' || booking.status === 'visited') {
      return res.json({ success: true, message: 'Arrival already recorded.', data: booking });
    }

    if (booking.status !== BOOKING_STATUS.JOURNEY_STARTED) {
      return res.status(400).json({
        success: false,
        message: `Cannot mark reached when status is "${booking.status}".`
      });
    }

    booking.visitedAt = new Date();
    booking.status = 'arrived';
    await booking.save();

    // Sync to IndWorkerAssignment
    const indAssign = await IndWorkerAssignment.findOneAndUpdate(
      { $or: [{ legacyBookingId: booking._id }, { parentRequestId: booking.workerRequestId, workerId }] },
      { journeyStatus: 'ARRIVED', arrivedAt: booking.visitedAt },
      { new: true }
    );

    const workerName = booking.workerId?.name || 'Worker';
    const otp = indAssign?.visitOtpCode || booking.visitOtp;

    const eventPayload = {
      bookingId: booking._id.toString(),
      requestId: booking.workerRequestId ? booking.workerRequestId.toString() : null,
      assignmentId: indAssign ? indAssign._id.toString() : booking._id.toString(),
      workerId: workerId.toString(),
      workerName,
      journeyStatus: 'ARRIVED',
      arrivedAt: booking.visitedAt,
      serverTime: new Date()
    };

    emitSafe(`booking_${booking._id}`, 'worker_arrived', eventPayload);
    if (booking.workerRequestId) {
      emitSafe(`booking_req_${booking.workerRequestId}`, 'worker_arrived', eventPayload);
      emitSafe(`booking_req:${booking.workerRequestId}`, 'assignment_arrived', eventPayload);
    }
    emitSafe(`user_${booking.userId}`, 'worker_arrived', eventPayload);

    // Notify farmer
    await createNotification({
      userId: booking.userId,
      type: 'worker_reached',
      title: 'Worker Reached Farm',
      message: `${workerName} has reached your farm! Please share your Visit OTP (${otp}) with them.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'worker_reached',
        bookingId: booking._id.toString(),
        visitOtp: otp,
        link: `/user/booking/${booking._id}/track`
      }
    });

    return res.json({
      success: true,
      message: 'Reached location recorded. Farmer notified to share OTP.',
      data: {
        bookingId: booking._id,
        status: 'ARRIVED',
        arrivedAt: booking.visitedAt
      }
    });

  } catch (err) {
    console.error('[workerReachedLocation]', err);
    return res.status(500).json({ success: false, message: 'Failed to record arrival.' });
  }
};

/**
 * POST /api/workers/jobs/:id/visit/verify
 * Worker verifies the Farmer's 4-digit or 6-digit Visit OTP to begin work.
 */
exports.workerVerifyVisitOtp = async (req, res) => {
  try {
    const workerId = req.user._id || req.user.id;
    const { id } = req.params;
    const { otp, location } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP is required.' });
    }

    const delegated = await resolveAssignmentForJob(id, workerId);
    if (delegated) return delegateToAssignment('verifyVisitOtp', delegated, req, res);

    const booking = await Booking.findOne({
      _id: id,
      workerId: workerId
    }).select('+visitOtp');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    if (booking.status === BOOKING_STATUS.IN_PROGRESS || booking.status === BOOKING_STATUS.COMPLETED) {
      return res.json({ success: true, message: 'OTP already verified. Work is in progress.', data: booking });
    }

    const indAssign = await IndWorkerAssignment.findOne({
      $or: [{ legacyBookingId: booking._id }, { parentRequestId: booking.workerRequestId, workerId }]
    }).select('+visitOtpHash');

    if (indAssign) {
      // single audited path: atomic attempt reservation, expiry, sequencing (never a plaintext compare)
      const workerAssignmentController = require('../workerControllers/workerAssignmentController');
      req.params.id = indAssign._id.toString();
      return workerAssignmentController.verifyVisitOtp(req, res);
    }

    const trimmedOtp = otp.toString().trim();
    const inputHash = crypto.createHash('sha256').update(trimmedOtp).digest('hex');
    const matchesBooking = booking.visitOtp && booking.visitOtp === trimmedOtp;
    const matchesAssignCode = indAssign?.visitOtpCode && indAssign.visitOtpCode === trimmedOtp;
    const matchesAssignHash = indAssign?.visitOtpHash && indAssign.visitOtpHash === inputHash;

    if (!matchesBooking && !matchesAssignCode && !matchesAssignHash) {
      if (indAssign) {
        indAssign.visitOtpAttempts = (indAssign.visitOtpAttempts || 0) + 1;
        await indAssign.save();
      }
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please ask the Farmer for the correct verification code.' });
    }

    booking.status = BOOKING_STATUS.IN_PROGRESS;
    booking.startedAt = new Date();
    if (location && location.lat && location.lng) {
      booking.visitLocation = {
        lat: Number(location.lat),
        lng: Number(location.lng),
        address: location.address || '',
        verifiedAt: new Date()
      };
    }
    await booking.save();

    if (indAssign) {
      indAssign.visitOtpStatus = 'VERIFIED';
      indAssign.visitOtpVerifiedAt = booking.startedAt;
      indAssign.workStatus = 'IN_PROGRESS';
      indAssign.workStartedAt = booking.startedAt;
      indAssign.journeyStatus = 'ARRIVED';
      await indAssign.save();
    }

    const eventPayload = {
      bookingId: booking._id.toString(),
      requestId: booking.workerRequestId ? booking.workerRequestId.toString() : null,
      assignmentId: indAssign ? indAssign._id.toString() : booking._id.toString(),
      workerId: workerId.toString(),
      journeyStatus: 'IN_PROGRESS',
      workStatus: 'IN_PROGRESS',
      visitOtpStatus: 'VERIFIED',
      otpVerifiedAt: booking.startedAt,
      startedAt: booking.startedAt,
      serverTime: new Date()
    };

    emitSafe(`booking_${booking._id}`, 'worker_otp_verified', eventPayload);
    emitSafe(`booking_${booking._id}`, 'worker_work_started', eventPayload);
    if (booking.workerRequestId) {
      emitSafe(`booking_req_${booking.workerRequestId}`, 'worker_otp_verified', eventPayload);
      emitSafe(`booking_req_${booking.workerRequestId}`, 'worker_work_started', eventPayload);
      emitSafe(`booking_req:${booking.workerRequestId}`, 'assignment_visit_otp_verified', eventPayload);
      emitSafe(`booking_req:${booking.workerRequestId}`, 'assignment_work_started', eventPayload);
    }
    emitSafe(`user_${booking.userId}`, 'worker_otp_verified', eventPayload);
    emitSafe(`user_${booking.userId}`, 'worker_work_started', eventPayload);
    emitSafe(`user_${booking.userId}`, 'booking_updated', {
      bookingId: booking._id,
      status: BOOKING_STATUS.IN_PROGRESS
    });

    await createNotification({
      userId: booking.userId,
      type: 'work_started',
      title: 'Work In Progress',
      message: 'OTP verified. Worker has begun work on your farm.',
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'in_progress',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}/track`
      }
    });

    return res.json({
      success: true,
      message: 'OTP verified successfully. Work is now In Progress.',
      data: booking
    });

  } catch (err) {
    console.error('[workerVerifyVisitOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to verify OTP.' });
  }
};

/**
 * POST /api/workers/jobs/:id/complete
 * Worker marks job complete, uploads photos, settles wallet, and updates parent.
 */
exports.workerCompleteJob = async (req, res) => {
  try {
    const workerId = req.user._id || req.user.id;
    const { id } = req.params;
    const { workPhotos, notes, otp } = req.body;

    // ── Step 1: Check if id is a direct IndWorkerAssignment (new unified flow) ──
    let directAssignment = null;
    try {
      directAssignment = await IndWorkerAssignment.findOne({
        _id: id,
        workerId
      }).select('+completionOtpHash');
    } catch (_) { /* id may not be a valid ObjectId — fine, fall through */ }

    if (directAssignment) {
      const workerAssignmentController = require('../workerControllers/workerAssignmentController');
      // Delegate entirely to the unified assignment controller
      if (directAssignment.bookingType === 'DAILY') {
        req.params.id = directAssignment._id.toString();
        return workerAssignmentController.verifyDailyCompletionOtp(req, res);
      }
      req.params.id = directAssignment._id.toString();
      return workerAssignmentController.verifyCompletionOtp(req, res);
    }

    // ── Step 2: Legacy Booking lookup ────────────────────────────────────────
    const booking = await Booking.findOne({
      _id: id,
      workerId: workerId
    });

    if (!booking) {
      // Final attempt: look up assignment via legacyBookingId in case id is a BookingRequest or legacy Booking id
      const assignmentByLegacy = await IndWorkerAssignment.findOne({
        $or: [
          { legacyBookingId: id },
          { parentRequestId: id, workerId }
        ]
      }).select('+completionOtpHash');

      if (assignmentByLegacy) {
        const workerAssignmentController = require('../workerControllers/workerAssignmentController');
        req.params.id = assignmentByLegacy._id.toString();
        if (assignmentByLegacy.bookingType === 'DAILY') {
          return workerAssignmentController.verifyDailyCompletionOtp(req, res);
        }
        return workerAssignmentController.verifyCompletionOtp(req, res);
      }

      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    if (booking.status === BOOKING_STATUS.COMPLETED) {
      return res.json({ success: true, message: 'Job already marked as completed.', data: booking });
    }

    // Sync to IndWorkerAssignment for legacy bookings and execute settlement atomically
    const assignment = await IndWorkerAssignment.findOne({
      $or: [{ legacyBookingId: booking._id }, { parentRequestId: booking.workerRequestId, workerId }]
    }).select('+completionOtpHash');

    // Any booking backed by an IndWorkerAssignment completes through the ONE audited path
    // (OTP verification + atomic settlement); this legacy handler must never settle money itself.
    if (assignment) {
      const workerAssignmentController = require('../workerControllers/workerAssignmentController');
      req.params.id = assignment._id.toString();
      return workerAssignmentController.verifyCompletionOtp(req, res);
    }

    booking.status = BOOKING_STATUS.COMPLETED;
    booking.completedAt = new Date();
    if (Array.isArray(workPhotos) && workPhotos.length > 0) {
      booking.workPhotos = workPhotos;
    }
    await booking.save();

    // Reset worker status to ONLINE
    await Worker.findByIdAndUpdate(workerId, { status: 'ONLINE' });

    const eventPayload = {
      bookingId: booking._id.toString(),
      requestId: booking.workerRequestId ? booking.workerRequestId.toString() : null,
      assignmentId: assignment ? assignment._id.toString() : booking._id.toString(),
      workerId: workerId.toString(),
      journeyStatus: 'COMPLETED',
      settlementStatus: 'SETTLED',
      completedAt: booking.completedAt,
      serverTime: new Date()
    };

    await Worker.findByIdAndUpdate(workerId, { status: 'ONLINE' });
    emitSafe(`worker_${workerId}`, 'worker_availability_changed', { status: 'ONLINE', workerId: workerId.toString() });
    emitSafe(`worker_${workerId}`, 'worker_status_updated', { status: 'ONLINE', workerId: workerId.toString() });

    emitSafe(`booking_${booking._id}`, 'worker_work_completed', eventPayload);
    if (booking.workerRequestId) {
      emitSafe(`booking_req_${booking.workerRequestId}`, 'worker_work_completed', eventPayload);
    }
    emitSafe(`user_${booking.userId}`, 'worker_work_completed', eventPayload);
    emitSafe(`user_${booking.userId}`, 'booking_updated', {
      bookingId: booking._id,
      status: BOOKING_STATUS.COMPLETED
    });

    return res.json({
      success: true,
      message: 'Job completed and payment settled successfully.',
      data: booking
    });

  } catch (err) {
    console.error('[workerCompleteJob]', err);
    return res.status(500).json({ success: false, message: 'Failed to complete job.' });
  }
};

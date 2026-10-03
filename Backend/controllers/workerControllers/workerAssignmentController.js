'use strict';

/**
 * workerAssignmentController.js
 *
 * Unified Worker Lifecycle Controller for IndWorkerAssignment documents.
 * Handles journey start, live location updates, arrival, visit OTP,
 * work submission proof, completion OTP, and worker wallet settlement.
 */

const IndWorkerAssignment   = require('../../models/IndWorkerAssignment');
const WorkerBookingRequest  = require('../../models/WorkerBookingRequest');
const Worker                = require('../../models/Worker');
const User                  = require('../../models/User');
const Booking               = require('../../models/Booking');
const Wallet                = require('../../models/Wallet');
const WalletTransaction     = require('../../models/WalletTransaction');
const Transaction           = require('../../models/Transaction');
const Notification          = require('../../models/Notification');
const crypto                = require('crypto');
const { getIO }             = require('../../sockets');

const mongoose              = require('mongoose');

const { sendNotificationToUser, sendNotificationToWorker } = require('../../services/firebaseAdmin');

/** Emit socket event safely */
const emitSafe = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (e) {
    console.warn('[Socket] emit failed (non-fatal):', e.message);
  }
};

/** Create Notification helper */
const notify = async ({ recipientType, recipientId, type, title, message, relatedId, relatedType, data }) => {
  try {
    const deepLink = data?.link || (
      recipientType === 'user'
        ? (relatedId ? `/user/farmer-worker-request/${relatedId}/track` : '/user/my-bookings')
        : (relatedId ? `/worker/job/${relatedId}` : '/worker/jobs')
    );

    const notifDoc = {
      type,
      title,
      message,
      relatedId,
      relatedType,
      data: { ...(data || {}), link: deepLink }
    };
    if (recipientType === 'user')   notifDoc.userId   = recipientId;
    if (recipientType === 'worker') notifDoc.workerId = recipientId;
    
    let notif = null;
    try {
      notif = await Notification.create(notifDoc);
    } catch (dbErr) {
      console.warn('[Notification DB create error - non-fatal]:', dbErr?.message);
    }

    const payload = notif ? (notif.toObject ? notif.toObject() : notif) : {
      ...notifDoc,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date()
    };

    const broadcastPayload = {
      ...payload,
      link: deepLink,
      ...(data || {})
    };

    const idStr = recipientId.toString();
    const rooms = recipientType === 'user'
      ? [`user_${idStr}`, `user:${idStr}`]
      : [`worker_${idStr}`, `worker:${idStr}`];

    rooms.forEach(room => {
      emitSafe(room, 'notification', broadcastPayload);
      if (type) {
        emitSafe(room, type, broadcastPayload);
      }
      if (recipientType === 'user') {
        emitSafe(room, 'userNotificationsUpdated', { unreadCountIncrement: 1, notificationId: payload._id });
      } else if (recipientType === 'worker') {
        emitSafe(room, 'workerNotificationsUpdated', { unreadCountIncrement: 1, notificationId: payload._id });
      }
    });

    // FCM Push Notification Fallback
    try {
      if (recipientType === 'worker') {
        sendNotificationToWorker(recipientId, {
          title: title || 'AgroYilt Work Update',
          body: message || '',
          data: {
            type: type || 'notification',
            requestId: String(relatedId || ''),
            link: deepLink
          }
        }).catch(fcmErr => {
          if (process.env.NODE_ENV !== 'test') {
            console.warn('[FCM Worker Notify Non-fatal]:', fcmErr?.message);
          }
        });
      } else if (recipientType === 'user') {
        sendNotificationToUser(recipientId, {
          title: title || 'AgroYilt Update',
          body: message || '',
          data: {
            type: type || 'notification',
            requestId: String(relatedId || ''),
            link: deepLink
          }
        }).catch(fcmErr => {
          if (process.env.NODE_ENV !== 'test') {
            console.warn('[FCM User Notify Non-fatal]:', fcmErr?.message);
          }
        });
      }
    } catch (fcmSyncErr) {
      console.warn('[FCM Sync Notify Non-fatal]:', fcmSyncErr?.message);
    }
  } catch (e) {
    console.warn('[Notification] creation failed (non-fatal):', e.message);
  }
};

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────
const { verifyOtp, stampOtp } = require('../../services/assignmentOtpService');
const settlement = require('../../services/workerSettlementService');
const { issueOtp } = require('../../utils/otpUtil');

const VISIT_OTP_TTL_MS = 6 * 60 * 60 * 1000;
const TZ_MIN = () => Number(process.env.APP_TZ_OFFSET_MINUTES ?? 330);
/** Midnight (app time zone) of the calendar day containing `d`. */
const dayStart = (d) => new Date(Math.floor((new Date(d).getTime() + TZ_MIN() * 60000) / 86400000) * 86400000 - TZ_MIN() * 60000);

/** True once the calendar day this assignment/day is scheduled for has begun. */
const workDayReached = async (assignment, dayIdx) => {
  const parent = await WorkerBookingRequest.findById(assignment.parentRequestId).select('scheduledDate startDate bookingType');
  if (!parent) return false;
  const base = assignment.bookingType === 'DAILY' ? parent.startDate : parent.scheduledDate;
  if (!base) return true; // nothing to enforce against
  const scheduled = assignment.bookingType === 'DAILY'
    ? new Date(dayStart(base).getTime() + (Math.max(1, dayIdx) - 1) * 86400000)
    : dayStart(base);
  return Date.now() >= scheduled.getTime();
};

const nextDayLog = (dayNumber) => {
  const v = issueOtp(48 * 60 * 60 * 1000);
  return {
    dayNumber, date: new Date(), journeyStatus: 'NOT_STARTED',
    visitOtpCode: v.code, visitOtpHash: v.hash, visitOtpStatus: 'PENDING', visitOtpExpiresAt: v.expiresAt, visitOtpAttempts: 0,
    workStatus: 'NOT_STARTED'
  };
};

const audit = settlement.audit;

const OTP_ERRORS = {
  locked:     [429, 'Too many invalid attempts. Ask the farmer to generate a new OTP.'],
  expired:    [410, 'This OTP has expired. Ask the farmer to generate a new one.'],
  not_found:  [404, 'Assignment not found.'],
  bad_format: [400, 'OTP must be a 4-digit code.']
};
const sendOtpFailure = (res, r, label) => {
  if (r.status === 'invalid') return res.status(400).json({ success: false, message: `Invalid ${label}. Attempts left: ${r.attemptsLeft}` });
  const [code, message] = OTP_ERRORS[r.status] || [400, 'OTP verification failed.'];
  return res.status(code).json({ success: false, message });
};

/**
 * GET /api/worker/assignments/:id
 * Single assignment. Authorization is role-aware; the model's default-deny serializer strips OTP secrets.
 */
exports.getAssignmentDetails = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const callerId = String(req.user._id);
    const role = String(req.userRole || '').toUpperCase();

    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }
    const assignment = await IndWorkerAssignment.findById(assignmentId)
      .populate('farmerId', 'name phone profilePicture address')
      .populate('parentRequestId');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    const farmerRef = assignment.farmerId && assignment.farmerId._id ? assignment.farmerId._id : assignment.farmerId;
    const isAssignedWorker = role === 'WORKER' && String(assignment.workerId) === callerId;
    const isTeamLeader = role === 'WORKER' && assignment.teamLeaderId && String(assignment.teamLeaderId) === callerId;
    const isFarmer = role === 'USER' && String(farmerRef) === callerId;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(role);

    if (!isAssignedWorker && !isTeamLeader && !isFarmer && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to assignment.' });
    }

    const assignmentData = assignment.toObject();
    const { buildWorkerPaymentSummary } = require('../../services/workerFinancialService');
    assignmentData.paymentSummary = buildWorkerPaymentSummary(assignment);

    if (isAssignedWorker || isTeamLeader) {
      // workers never see what the farmer paid in total, platform fees or other workers' offers
      if (assignmentData.parentRequestId && typeof assignmentData.parentRequestId === 'object') {
        ['financialSnapshot', 'razorpayOrderId', 'razorpayPaymentId', 'paymentOrders', 'workerOffers', 'refundAmount', 'auditLog']
          .forEach(k => delete assignmentData.parentRequestId[k]);
      }
    }
    if (isFarmer) {
      // the farmer does not see the worker's commission / net earning
      ['commissionRate', 'commissionAmount', 'netEarning', 'settlementTransactionId'].forEach(k => delete assignmentData[k]);
      delete assignmentData.paymentSummary;
    }

    return res.json({ success: true, data: assignmentData });
  } catch (err) {
    console.error('[getAssignmentDetails]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch assignment details.' });
  }
};

/**
 * GET /api/worker/assignments/my-assignments
 */
exports.getMyAssignments = async (req, res) => {
  try {
    const workerId = req.user._id;
    const { status } = req.query;

    const filter = { workerId };
    if (status) {
      filter.assignmentStatus = String(status);
    }

    const assignments = await IndWorkerAssignment.find(filter)
      .populate('farmerId', 'name phone profilePicture')
      .populate('parentRequestId', 'workTitle workDescription scheduledDate startTime endTime location rateUnit minRate maxRate')
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: assignments });
  } catch (err) {
    console.error('[getMyAssignments]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch assignments.' });
  }
};

/**
 * POST /api/worker/assignments/:id/start-journey   (also DAILY start-day)
 */
exports.startJourney = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;

    const current = await IndWorkerAssignment.findOne({ _id: assignmentId, workerId, assignmentStatus: 'CONFIRMED' });
    if (!current) {
      return res.status(404).json({ success: false, message: 'Assignment not found or not in confirmed state.' });
    }
    if (current.journeyStatus === 'JOURNEY_STARTED' || current.journeyStatus === 'ARRIVED') {
      return res.json({ success: true, message: 'Journey already started.', data: current });
    }

    const now = new Date();
    // The visit OTP the farmer will read out is issued NOW (journey start), not at booking time: an OTP minted at
    // confirmation would have expired long before the worker arrives.
    const visit = issueOtp(VISIT_OTP_TTL_MS);
    const assignment = await IndWorkerAssignment.findOneAndUpdate(
      { _id: assignmentId, workerId, assignmentStatus: 'CONFIRMED', journeyStatus: 'NOT_STARTED' },
      {
        $set: {
          journeyStatus: 'JOURNEY_STARTED', journeyStartedAt: now,
          visitOtpCode: visit.code, visitOtpHash: visit.hash, visitOtpExpiresAt: visit.expiresAt, visitOtpAttempts: 0
        }
      },
      { new: true }
    );
    if (!assignment) {
      const again = await IndWorkerAssignment.findById(assignmentId);
      return res.json({ success: true, message: 'Journey already started.', data: again });
    }

    if (assignment.bookingType === 'DAILY') {
      const dayIdx = assignment.currentDayIndex || 1;
      const upd = await IndWorkerAssignment.updateOne(
        { _id: assignmentId, dailyLogs: { $elemMatch: { dayNumber: dayIdx, visitOtpStatus: 'PENDING' } } },
        {
          $set: {
            'dailyLogs.$.journeyStatus': 'JOURNEY_STARTED', 'dailyLogs.$.journeyStartedAt': now,
            'dailyLogs.$.visitOtpCode': visit.code, 'dailyLogs.$.visitOtpHash': visit.hash,
            'dailyLogs.$.visitOtpExpiresAt': visit.expiresAt, 'dailyLogs.$.visitOtpAttempts': 0
          }
        }
      );
      if (upd.matchedCount === 0) {
        const exists = await IndWorkerAssignment.exists({ _id: assignmentId, 'dailyLogs.dayNumber': dayIdx });
        if (!exists) {
          const log = nextDayLog(dayIdx);
          log.journeyStatus = 'JOURNEY_STARTED'; log.journeyStartedAt = now;
          log.visitOtpCode = visit.code; log.visitOtpHash = visit.hash; log.visitOtpExpiresAt = visit.expiresAt;
          await IndWorkerAssignment.updateOne({ _id: assignmentId, 'dailyLogs.dayNumber': { $ne: dayIdx } }, { $push: { dailyLogs: log } });
        }
      }
    }
    await settlement.syncParentProgress(assignment.parentRequestId);

    emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_journey_started', {
      requestId: assignment.parentRequestId, assignmentId: assignment._id, workerId: assignment.workerId,
      journeyStatus: 'JOURNEY_STARTED', dayNumber: assignment.bookingType === 'DAILY' ? (assignment.currentDayIndex || 1) : null,
      serverTimestamp: new Date()
    });

    await notify({
      recipientType: 'user', recipientId: assignment.farmerId, type: 'worker_journey_started',
      title: 'Worker is on the way!', message: 'Worker has started journey towards your farm.',
      relatedId: assignment.parentRequestId, relatedType: 'WorkerBookingRequest', data: { assignmentId: assignment._id }
    });

    return res.json({ success: true, message: 'Journey started successfully.', data: assignment });
  } catch (err) {
    console.error('[startJourney]', err);
    return res.status(500).json({ success: false, message: 'Failed to start journey.' });
  }
};

/**
 * POST /api/worker/assignments/:id/arrived
 */
exports.markArrived = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;

    const current = await IndWorkerAssignment.findOne({ _id: assignmentId, workerId, assignmentStatus: 'CONFIRMED' });
    if (!current) {
      return res.status(404).json({ success: false, message: 'Assignment not found or not in confirmed state.' });
    }
    if (current.journeyStatus === 'ARRIVED') {
      return res.json({ success: true, message: 'Already marked as arrived.', data: current });
    }
    if (current.journeyStatus !== 'JOURNEY_STARTED') {
      return res.status(409).json({ success: false, message: 'Start your journey before marking arrival.' });
    }

    const now = new Date();
    const assignment = await IndWorkerAssignment.findOneAndUpdate(
      { _id: assignmentId, workerId, assignmentStatus: 'CONFIRMED', journeyStatus: 'JOURNEY_STARTED' },
      { $set: { journeyStatus: 'ARRIVED', arrivedAt: now } },
      { new: true }
    );
    if (!assignment) {
      return res.json({ success: true, message: 'Already marked as arrived.', data: await IndWorkerAssignment.findById(assignmentId) });
    }
    if (assignment.bookingType === 'DAILY') {
      await IndWorkerAssignment.updateOne(
        { _id: assignmentId, 'dailyLogs.dayNumber': assignment.currentDayIndex || 1 },
        { $set: { 'dailyLogs.$.journeyStatus': 'ARRIVED', 'dailyLogs.$.arrivedAt': now } }
      );
    }

    emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_arrived', {
      requestId: assignment.parentRequestId, assignmentId: assignment._id, workerId: assignment.workerId,
      journeyStatus: 'ARRIVED', dayNumber: assignment.bookingType === 'DAILY' ? (assignment.currentDayIndex || 1) : null,
      serverTimestamp: new Date()
    });
    await notify({
      recipientType: 'user', recipientId: assignment.farmerId, type: 'worker_arrived',
      title: 'Worker has arrived!', message: 'Worker has arrived at your farm. Please provide the Visit OTP to begin work.',
      relatedId: assignment.parentRequestId, relatedType: 'WorkerBookingRequest', data: { assignmentId: assignment._id }
    });

    return res.json({ success: true, message: 'Marked arrived at farm. Please ask farmer for Visit OTP.', data: assignment });
  } catch (err) {
    console.error('[markArrived]', err);
    return res.status(500).json({ success: false, message: 'Failed to mark arrival.' });
  }
};

/** Late-arrival penalty for HOURLY visits. One mechanism only: the wallet/dues penalty (never also netEarning). */
const applyLatePenalty = async (assignment) => {
  try {
    const { getWorkerFinancialSettings, applyWorkerPenalty } = require('../../services/workerFinancialService');
    const settings = await getWorkerFinancialSettings();
    if (!settings.workerPenaltyEnabled) return;
    const parent = await WorkerBookingRequest.findById(assignment.parentRequestId).select('scheduledDate startTime');
    if (!parent || !parent.scheduledDate || !parent.startTime) return;
    const [sHour, sMin] = parent.startTime.split(':').map(Number);
    if (isNaN(sHour)) return;

    const scheduled = dayStart(parent.scheduledDate).getTime() + ((sHour * 60) + (sMin || 0)) * 60000;
    const diffMins = Math.floor((assignment.visitOtpVerifiedAt.getTime() - scheduled) / 60000);
    const freeMins = Number(settings.workerPenaltyFreeMinutes) || 0;
    if (diffMins <= freeMins) return;

    const lateMins = diffMins - freeMins;
    let amount = 0;
    if (settings.workerPenaltyType === 'per_minute') {
      amount = Math.min(Number(settings.workerPenaltyMaxAmount) || 500, lateMins * (Number(settings.workerPenaltyPerMinute) || 5));
    } else if (settings.workerPenaltyType === 'percentage') {
      amount = Math.round(((Number(assignment.grossAmount) || 0) * (Number(settings.workerPenaltyPercentage) || 5)) / 100);
    } else {
      amount = Number(settings.workerPenaltyAmount) || 50;
    }
    if (!(amount > 0)) return;

    const claimed = await IndWorkerAssignment.findOneAndUpdate(
      { _id: assignment._id, 'latePenalty.applied': { $ne: true } },
      { $set: { latePenalty: { applied: true, amount, minutesLate: diffMins, ruleType: settings.workerPenaltyType, appliedAt: new Date() } } },
      { new: true }
    );
    if (!claimed) return; // somebody already applied it
    await applyWorkerPenalty(assignment.workerId, assignment.legacyBookingId, `late_pen_${assignment._id}`, 'late_arrival',
      `Late arrival by ${diffMins} minutes (grace: ${freeMins}m)`, { amount });
  } catch (penErr) {
    console.warn('[Late penalty check error - non-fatal]:', penErr.message);
  }
};

/**
 * POST /api/worker/assignments/:id/verify-visit-otp   (also DAILY)
 */
exports.verifyVisitOtp = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;
    const { otp } = req.body || {};

    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP is required.' });
    }

    const assignment = await IndWorkerAssignment.findOne({ _id: assignmentId, workerId, assignmentStatus: 'CONFIRMED' });
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    const isDaily = assignment.bookingType === 'DAILY';
    const dayIdx = assignment.currentDayIndex || 1;
    const log = isDaily ? assignment.dailyLogs?.find(l => l.dayNumber === dayIdx) : null;
    if (isDaily && !log) {
      return res.status(400).json({ success: false, message: `Day ${dayIdx} attendance has not started yet.` });
    }

    const alreadyVerified = isDaily ? log.visitOtpStatus === 'VERIFIED' : assignment.visitOtpStatus === 'VERIFIED';
    if (alreadyVerified) {
      return res.json({ success: true, message: isDaily ? `Day ${dayIdx} Visit OTP already verified.` : 'Visit OTP already verified.', data: assignment });
    }

    // sequence + schedule: must be travelling/arrived, and the scheduled day must have begun
    if (!['JOURNEY_STARTED', 'ARRIVED'].includes(assignment.journeyStatus)) {
      return res.status(409).json({ success: false, message: 'Start your journey before verifying the visit OTP.' });
    }
    if (!(await workDayReached(assignment, isDaily ? dayIdx : 1))) {
      return res.status(409).json({ success: false, message: 'Work cannot be started before the scheduled day.' });
    }

    const now = new Date();
    const verifiedSet = isDaily
      ? {
          visitOtpStatus: 'VERIFIED', visitOtpVerifiedAt: now, workStatus: 'IN_PROGRESS', workStartedAt: now, journeyStatus: 'ARRIVED',
          'dailyLogs.$.workStatus': 'IN_PROGRESS', 'dailyLogs.$.workStartedAt': now, 'dailyLogs.$.journeyStatus': 'ARRIVED'
        }
      : { workStatus: 'IN_PROGRESS', workStartedAt: now, journeyStatus: 'ARRIVED' };

    const result = await verifyOtp({ assignmentId, workerId, kind: 'visit', dayNumber: isDaily ? dayIdx : null, otp, verifiedSet });
    if (result.status === 'already') {
      return res.json({ success: true, message: 'Visit OTP already verified.', data: await IndWorkerAssignment.findById(assignmentId) });
    }
    if (result.status !== 'verified') return sendOtpFailure(res, result, 'OTP');

    const verified = result.assignment;
    if (!isDaily) await applyLatePenalty(verified);
    await settlement.syncParentProgress(verified.parentRequestId);

    emitSafe(`booking_req:${verified.parentRequestId}`, 'assignment_visit_otp_verified', {
      requestId: verified.parentRequestId, assignmentId: verified._id, workerId: verified.workerId,
      ...(isDaily ? { dayNumber: dayIdx } : {}), visitOtpStatus: 'VERIFIED', workStatus: 'IN_PROGRESS', serverTimestamp: new Date()
    });

    return res.json({
      success: true,
      message: isDaily ? `Day ${dayIdx} Visit OTP verified! Work is in progress.` : 'Visit OTP verified! Work is now in progress.',
      data: await IndWorkerAssignment.findById(assignmentId)
    });
  } catch (err) {
    console.error('[verifyVisitOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to verify visit OTP.' });
  }
};

/**
 * POST /api/worker/assignments/:id/submit-proof
 */
exports.submitProof = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;
    const { fileUrl, publicId, notes } = req.body || {};

    if (fileUrl !== undefined && fileUrl !== null && (typeof fileUrl !== 'string' || fileUrl.length > 2048 || !/^https?:\/\//i.test(fileUrl))) {
      return res.status(400).json({ success: false, message: 'fileUrl must be an http(s) URL.' });
    }

    const existing = await IndWorkerAssignment.findOne({ _id: assignmentId, workerId, assignmentStatus: 'CONFIRMED' });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }
    if (existing.visitOtpStatus !== 'VERIFIED') {
      return res.status(400).json({ success: false, message: 'Visit OTP must be verified before submitting work proof.' });
    }

    // only while the work is open: never after completion / settlement
    const assignment = await IndWorkerAssignment.findOneAndUpdate(
      {
        _id: assignmentId, workerId, assignmentStatus: 'CONFIRMED', visitOtpStatus: 'VERIFIED',
        completionStatus: 'PENDING', settlementStatus: 'PENDING', workStatus: { $in: ['IN_PROGRESS', 'SUBMITTED'] }
      },
      {
        $set: {
          workStatus: 'SUBMITTED', workSubmittedAt: new Date(),
          completionProof: {
            fileUrl: fileUrl || existing.completionProof?.fileUrl || null,
            publicId: publicId || null, notes: typeof notes === 'string' ? notes.slice(0, 1000) : '', uploadedAt: new Date()
          }
        }
      },
      { new: true }
    );
    if (!assignment) {
      return res.status(409).json({ success: false, message: 'Work can no longer be submitted for this assignment.' });
    }

    emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_work_submitted', {
      requestId: assignment.parentRequestId, assignmentId: assignment._id, workerId: assignment.workerId,
      workStatus: 'SUBMITTED', proof: assignment.completionProof, serverTimestamp: new Date()
    });
    await notify({
      recipientType: 'user', recipientId: assignment.farmerId, type: 'worker_work_submitted',
      title: 'Work Proof Submitted!', message: 'Worker has submitted completion proof. Please verify work and share Completion OTP to release payment.',
      relatedId: assignment.parentRequestId, relatedType: 'WorkerBookingRequest', data: { assignmentId: assignment._id }
    });

    return res.json({ success: true, message: 'Work proof submitted. Please ask farmer for Completion OTP.', data: assignment });
  } catch (err) {
    console.error('[submitProof]', err);
    return res.status(500).json({ success: false, message: 'Failed to submit proof.' });
  }
};

/** Settle (idempotent), advance the parent, refund once — shared tail of every completion path. */
const settleAndFinish = async (assignmentId) => {
  const r = await settlement.settleAssignment(assignmentId);
  let assignment = r.assignment;
  if (r.claimed && !r.error) {
    assignment = await IndWorkerAssignment.findById(assignmentId);
    if (assignment.isDecreased) await settlement.refundUnusedDays(assignmentId);
    await settlement.finishParent(assignment.parentRequestId);
  }
  return { ...r, assignment };
};
exports._settleAndFinish = settleAndFinish;

/**
 * POST /api/worker/assignments/:id/verify-completion-otp   (also DAILY)
 * Worker enters the Completion OTP the farmer shows -> settlement.
 */
exports.verifyCompletionOtp = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;
    const { otp } = req.body || {};

    if (!otp) {
      return res.status(400).json({ success: false, message: 'Completion OTP is required.' });
    }

    const assignment = await IndWorkerAssignment.findOne({ _id: assignmentId, workerId, assignmentStatus: { $in: ['CONFIRMED', 'COMPLETED'] } });
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }
    if (assignment.assignmentStatus === 'COMPLETED' || (assignment.completionStatus === 'OTP_VERIFIED' && assignment.settlementStatus === 'SETTLED')) {
      return res.json({ success: true, message: 'Completion already verified and settled.', data: assignment });
    }

    const isDaily = assignment.bookingType === 'DAILY';
    const dayIdx = assignment.currentDayIndex || 1;
    const log = isDaily ? assignment.dailyLogs?.find(l => l.dayNumber === dayIdx) : null;

    if (isDaily) {
      if (!log) return res.status(400).json({ success: false, message: `Day ${dayIdx} attendance record not found.` });
      if (log.workStatus === 'COMPLETED') {
        return res.json({ success: true, message: `Day ${dayIdx} already verified and completed.`, data: assignment });
      }
      if (log.visitOtpStatus !== 'VERIFIED') {
        return res.status(409).json({ success: false, message: `Day ${dayIdx} visit must be verified before completion.` });
      }
    } else if (assignment.completionStatus !== 'OTP_VERIFIED' && assignment.visitOtpStatus !== 'VERIFIED') {
      return res.status(409).json({ success: false, message: 'Visit OTP must be verified before completing the work.' });
    }

    // HOURLY retry of a settlement that previously failed (OTP was already accepted)
    if (!isDaily && assignment.completionStatus === 'OTP_VERIFIED') {
      const r = await settleAndFinish(assignmentId);
      return respondCompletion(res, r.assignment, r);
    }

    const now = new Date();
    const result = await verifyOtp({
      assignmentId, workerId, kind: 'completion', dayNumber: isDaily ? dayIdx : null, otp,
      verifiedSet: isDaily ? {} : { workCompletedAt: now }
    });
    if (result.status === 'already') {
      return res.json({ success: true, message: 'Completion already verified.', data: await IndWorkerAssignment.findById(assignmentId) });
    }
    if (result.status !== 'verified') return sendOtpFailure(res, result, 'Completion OTP');

    // ── DAILY: advance the day counter atomically ──
    if (isDaily) {
      const after = await IndWorkerAssignment.findOneAndUpdate({ _id: assignmentId }, { $inc: { workedDays: 1 } }, { new: true });
      const totalBookedDays = Number(after.bookedDays) || 1;
      const terminal = after.isDecreased || after.workedDays >= totalBookedDays;

      if (!terminal) {
        const next = after.workedDays + 1;
        await IndWorkerAssignment.updateOne(
          { _id: assignmentId },
          {
            $set: { currentDayIndex: next, journeyStatus: 'NOT_STARTED', visitOtpStatus: 'PENDING', workStatus: 'NOT_STARTED', completionStatus: 'PENDING' },
            $push: { dailyLogs: nextDayLog(next), auditLog: audit('day_completed', 'worker', workerId, { day: after.workedDays }) }
          }
        );
        // a decrease that landed while we were advancing must still stop the worker
        const post = await IndWorkerAssignment.findById(assignmentId);
        if (post.isDecreased) {
          const fin = await finalizeDecreasedBetweenDays(assignmentId);
          return respondCompletion(res, fin.assignment, fin);
        }

        emitSafe(`booking_req:${after.parentRequestId}`, 'assignment_day_completed', {
          requestId: after.parentRequestId, assignmentId: after._id, workerId: after.workerId,
          completedDay: after.workedDays, nextDay: next, totalDays: totalBookedDays, serverTimestamp: new Date()
        });
        await notify({
          recipientType: 'user', recipientId: after.farmerId, type: 'day_completed',
          title: `Day ${after.workedDays} Work Completed!`,
          message: `Worker completed Day ${after.workedDays} of ${totalBookedDays}. Day ${next} is scheduled next.`,
          relatedId: after.parentRequestId, relatedType: 'WorkerBookingRequest', data: { assignmentId: after._id }
        });
        return res.json({
          success: true,
          message: `Day ${after.workedDays} completed successfully! Next working day is Day ${next}.`,
          data: await IndWorkerAssignment.findById(assignmentId)
        });
      }

      await IndWorkerAssignment.updateOne(
        { _id: assignmentId },
        { $set: { completionStatus: 'OTP_VERIFIED', completionOtpVerifiedAt: now, workCompletedAt: now }, $push: { auditLog: audit('completion_verified', 'worker', workerId, { workedDays: after.workedDays }) } }
      );
    }

    const r = await settleAndFinish(assignmentId);
    return respondCompletion(res, r.assignment, r);
  } catch (err) {
    console.error('[verifyCompletionOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to verify completion OTP.' });
  }
};

const respondCompletion = async (res, assignment, r) => {
  const a = assignment;
  if (r && r.error) {
    return res.status(202).json({
      success: true, settlementPending: true,
      message: 'Completion verified. Payment is being processed and will be retried automatically.',
      data: a
    });
  }
  if (a) {
    await notify({
      recipientType: 'user', recipientId: a.farmerId, type: 'work_completed', title: 'Work Completed!',
      message: 'Worker has completed the work on your farm and payment has been settled.',
      relatedId: a._id, relatedType: 'IndWorkerAssignment', data: { assignmentId: a._id, requestId: a.parentRequestId }
    });
    const eventData = {
      requestId: a.parentRequestId, assignmentId: a._id, workerId: a.workerId, completionStatus: 'OTP_VERIFIED',
      settlementStatus: a.settlementStatus, netEarning: a.netEarning, workedDays: a.workedDays, serverTimestamp: new Date()
    };
    for (const room of [`booking_req:${a.parentRequestId}`, `booking_req_${a.parentRequestId}`]) {
      emitSafe(room, 'assignment_completion_otp_verified', eventData);
      emitSafe(room, 'assignment_settled', eventData);
    }
    await notify({
      recipientType: 'worker', recipientId: a.workerId, type: 'assignment_settled', title: 'Payment Credited to Wallet!',
      message: `₹${a.netEarning} has been added to your AgroYilt wallet for completing this job.`,
      relatedId: a.parentRequestId, relatedType: 'WorkerBookingRequest', data: { assignmentId: a._id, netEarning: a.netEarning }
    });
  }
  return res.json({
    success: true,
    message: a && a.bookingType === 'DAILY'
      ? `DAILY assignment finished and settled! ₹${a.netEarning} for ${a.workedDays} days.`
      : `Completion OTP verified! Payment of ₹${a ? a.netEarning : 0} processed.`,
    data: a
  });
};

/**
 * A DAILY worker was decreased while between days (the next day's log already exists but nothing has started):
 * stop now — drop the empty day, mark complete for the days actually worked, and settle.
 */
const finalizeDecreasedBetweenDays = async (assignmentId) => {
  const claimed = await IndWorkerAssignment.findOneAndUpdate(
    { _id: assignmentId, assignmentStatus: 'CONFIRMED', isDecreased: true, completionStatus: 'PENDING', visitOtpStatus: { $ne: 'VERIFIED' }, workedDays: { $gt: 0 } },
    {
      $set: { completionStatus: 'OTP_VERIFIED', completionOtpVerifiedAt: new Date(), workCompletedAt: new Date() },
      $pull: { dailyLogs: { workStatus: 'NOT_STARTED', visitOtpStatus: 'PENDING' } },
      $push: { auditLog: audit('decreased_between_days', 'system', null, null) }
    },
    { new: true }
  );
  if (!claimed) return { assignment: await IndWorkerAssignment.findById(assignmentId), claimed: false };
  return settleAndFinish(assignmentId);
};
exports._finalizeDecreasedBetweenDays = finalizeDecreasedBetweenDays;

/**
 * POST /api/worker/assignments/:id/cancel   Body: { reason }
 * A worker withdraws from a job BEFORE any work started. The farmer's money for that worker is returned
 * (the whole booking is cancelled + fully refunded if this was the last worker), the worker is penalised per the
 * admin settings, and the farmer can request a replacement with "add workers".
 */
exports.workerWithdraw = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;
    const reason = typeof (req.body || {}).reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) return res.status(404).json({ success: false, message: 'Assignment not found.' });

    const assignment = await IndWorkerAssignment.findOne({ _id: assignmentId, workerId, assignmentStatus: 'CONFIRMED' });
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found or no longer active.' });
    }
    if (settlement.hasStarted(assignment) || assignment.settlementStatus !== 'PENDING' || assignment.completionStatus !== 'PENDING') {
      return res.status(409).json({ success: false, message: 'You cannot withdraw after the work has started. Please contact support.' });
    }

    const cancelSvc = require('../../services/workerBookingCancelService');
    const farmerCtl = require('./farmerWorkerRequestController');
    const open = await IndWorkerAssignment.countDocuments({ parentRequestId: assignment.parentRequestId, assignmentStatus: 'CONFIRMED' });
    let refundAmount = 0;
    let bookingCancelled = false;

    if (open <= 1) {
      const result = await cancelSvc.cancelWorkerBooking({ requestId: assignment.parentRequestId, actor: 'worker', actorId: workerId, reason: reason || 'Worker withdrew' });
      if (!result.ok) return res.status(result.code).json({ success: false, message: result.reason });
      bookingCancelled = true; refundAmount = result.refundAmount;
      await farmerCtl.announceCancellation({ request: result.request, workerIds: [], refundAmount, wasConfirmed: true, by: 'worker' });
    } else {
      const cancelled = await IndWorkerAssignment.findOneAndUpdate(
        { _id: assignment._id, workerId, assignmentStatus: 'CONFIRMED', settlementStatus: 'PENDING', completionStatus: 'PENDING', visitOtpStatus: { $ne: 'VERIFIED' }, workedDays: { $in: [0, null] }, journeyStatus: 'NOT_STARTED' },
        {
          $set: { assignmentStatus: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason || 'Worker withdrew', cancelledBy: 'worker' },
          $push: { auditLog: audit('worker_withdrew', 'worker', workerId, { reason }) }
        },
        { new: true }
      );
      if (!cancelled) {
        return res.status(409).json({ success: false, message: 'The job has just started and can no longer be withdrawn from.' });
      }
      if (cancelled.legacyBookingId) await Booking.updateOne({ _id: cancelled.legacyBookingId, status: { $nin: ['completed', 'cancelled'] } }, { $set: { status: 'cancelled', cancellationReason: reason || 'Worker withdrew' } });
      refundAmount = (await settlement.refundWorkerReserveShare(cancelled._id, { actor: 'worker', actorId: workerId })).refundAmount || 0;
    }

    // penalty per admin settings (idempotent by event id; never blocks the withdrawal)
    try {
      const { getWorkerFinancialSettings, applyWorkerPenalty } = require('../../services/workerFinancialService');
      const settings = await getWorkerFinancialSettings();
      if (settings.workerPenaltyEnabled) {
        await applyWorkerPenalty(workerId, assignment.legacyBookingId, `cancel_pen_${assignment._id}`, 'cancellation', `Withdrew from assignment ${assignment._id}`);
      }
    } catch (penErr) { console.warn('[workerWithdraw penalty - non-fatal]', penErr.message); }

    emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_cancelled', { requestId: assignment.parentRequestId, assignmentId: assignment._id, workerId, by: 'worker', serverTimestamp: new Date() });
    await notify({
      recipientType: 'user', recipientId: assignment.farmerId, type: 'worker_withdrew', title: 'A worker withdrew',
      message: bookingCancelled
        ? 'Your only worker withdrew, so the booking was cancelled and refunded. You can book again.'
        : `A worker withdrew from your booking${refundAmount > 0 ? ` and ₹${refundAmount} was refunded to your wallet` : ''}. You can add a replacement worker.`,
      relatedId: assignment.parentRequestId, relatedType: 'WorkerBookingRequest', data: { assignmentId: assignment._id, refundAmount }
    });

    return res.json({ success: true, message: 'You have withdrawn from this job.', data: { bookingCancelled, refundAmount } });
  } catch (err) {
    console.error('[workerWithdraw]', err);
    return res.status(500).json({ success: false, message: 'Failed to withdraw from the job.' });
  }
};

/**
 * PATCH /api/worker/assignments/:id/location
 * Worker GPS ping update
 */
exports.updateLocation = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;
    const { lat, lng, accuracy, speed, heading } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, message: 'Latitude and Longitude are required.' });
    }

    const assignment = await IndWorkerAssignment.findOne({
      _id: assignmentId,
      workerId,
      assignmentStatus: 'CONFIRMED'
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    assignment.liveLocation = {
      lat: Number(lat),
      lng: Number(lng),
      accuracy: accuracy ? Number(accuracy) : null,
      speed: speed ? Number(speed) : null,
      heading: heading ? Number(heading) : null
    };
    assignment.lastLocationAt = new Date();
    assignment.locationStatus = 'AVAILABLE';
    await assignment.save();

    // Also update Worker model's live location
    await Worker.findByIdAndUpdate(workerId, {
      'location.coordinates': [Number(lng), Number(lat)],
      'currentLocation.lat': Number(lat),
      'currentLocation.lng': Number(lng),
      lastLocationUpdate: new Date()
    });

    // Socket update
    emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_location_updated', {
      requestId: assignment.parentRequestId,
      assignmentId: assignment._id,
      workerId: assignment.workerId,
      liveLocation: assignment.liveLocation,
      locationStatus: 'AVAILABLE',
      serverTimestamp: new Date()
    });

    return res.json({
      success: true,
      message: 'Location updated.',
      data: {
        liveLocation: assignment.liveLocation,
        lastLocationAt: assignment.lastLocationAt
      }
    });
  } catch (err) {
    console.error('[updateLocation]', err);
    return res.status(500).json({ success: false, message: 'Failed to update location.' });
  }
};

// Dedicated DAILY lifecycle handlers
exports.startDailyDay = exports.startJourney;
exports.markDailyArrived = exports.markArrived;
exports.verifyDailyVisitOtp = exports.verifyVisitOtp;
exports.verifyDailyCompletionOtp = exports.verifyCompletionOtp;


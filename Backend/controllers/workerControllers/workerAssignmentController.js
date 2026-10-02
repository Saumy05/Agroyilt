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
    const notifDoc = { type, title, message, relatedId, relatedType, data: data || {} };
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

    const idStr = recipientId.toString();
    const rooms = recipientType === 'user'
      ? [`user_${idStr}`, `user:${idStr}`]
      : [`worker_${idStr}`, `worker:${idStr}`];

    rooms.forEach(room => emitSafe(room, 'notification', payload));
  } catch (e) {
    console.warn('[Notification] creation failed (non-fatal):', e.message);
  }
};

/**
 * GET /api/worker/assignments/:id
 * Get single assignment details
 */
exports.getAssignmentDetails = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;

    const assignment = await IndWorkerAssignment.findById(assignmentId)
      .populate('farmerId', 'name phone profilePicture address')
      .populate('parentRequestId');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    // Worker or Farmer access check
    const isAssignedWorker = assignment.workerId.toString() === workerId.toString();
    const isTeamLeader = assignment.teamLeaderId && assignment.teamLeaderId.toString() === workerId.toString();
    const isFarmer = assignment.farmerId._id ? assignment.farmerId._id.toString() === workerId.toString() : assignment.farmerId.toString() === workerId.toString();

    if (!isAssignedWorker && !isTeamLeader && !isFarmer) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to assignment.' });
    }

    const assignmentData = assignment.toObject ? assignment.toObject() : { ...assignment };
    const { buildWorkerPaymentSummary } = require('../../services/workerFinancialService');
    assignmentData.paymentSummary = buildWorkerPaymentSummary(assignment);

    // If Worker or TeamLeader, ensure they cannot see parent request total paid, platform fees, or other workers' financials
    if (isAssignedWorker || isTeamLeader) {
      if (assignmentData.parentRequestId && typeof assignmentData.parentRequestId === 'object') {
        delete assignmentData.parentRequestId.financialSnapshot;
        delete assignmentData.parentRequestId.razorpayOrderId;
        delete assignmentData.parentRequestId.razorpayPaymentId;
        delete assignmentData.parentRequestId.workerOffers;
        delete assignmentData.parentRequestId.refundAmount;
      }
    }

    return res.json({
      success: true,
      data: assignmentData
    });
  } catch (err) {
    console.error('[getAssignmentDetails]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch assignment details.' });
  }
};

/**
 * GET /api/worker/assignments/my-assignments
 * List all assignments for currently logged in worker
 */
exports.getMyAssignments = async (req, res) => {
  try {
    const workerId = req.user._id;
    const { status } = req.query;

    const filter = { workerId };
    if (status) {
      filter.assignmentStatus = status;
    }

    const assignments = await IndWorkerAssignment.find(filter)
      .populate('farmerId', 'name phone profilePicture')
      .populate('parentRequestId', 'workTitle workDescription scheduledDate startTime endTime location rateUnit minRate maxRate')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: assignments
    });
  } catch (err) {
    console.error('[getMyAssignments]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch assignments.' });
  }
};

/**
 * POST /api/worker/assignments/:id/start-journey
 * Worker starts travelling to the farm
 */
exports.startJourney = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;

    const assignment = await IndWorkerAssignment.findOne({
      _id: assignmentId,
      workerId,
      assignmentStatus: 'CONFIRMED'
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found or not in confirmed state.' });
    }

    if (assignment.journeyStatus === 'JOURNEY_STARTED' || assignment.journeyStatus === 'ARRIVED') {
      return res.json({ success: true, message: 'Journey already started.', data: assignment });
    }

    assignment.journeyStatus = 'JOURNEY_STARTED';
    assignment.journeyStartedAt = new Date();

    if (assignment.bookingType === 'DAILY') {
      const dayIdx = assignment.currentDayIndex || 1;
      let log = assignment.dailyLogs?.find(l => l.dayNumber === dayIdx);
      if (!log) {
        const rawVisitOtp = Math.floor(1000 + Math.random() * 9000).toString();
        const visitOtpHash = crypto.createHash('sha256').update(rawVisitOtp).digest('hex');
        assignment.dailyLogs.push({
          dayNumber: dayIdx,
          date: new Date(),
          journeyStatus: 'JOURNEY_STARTED',
          journeyStartedAt: new Date(),
          visitOtpCode: rawVisitOtp,
          visitOtpHash,
          visitOtpStatus: 'PENDING',
          visitOtpExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          workStatus: 'NOT_STARTED'
        });
      } else {
        log.journeyStatus = 'JOURNEY_STARTED';
        log.journeyStartedAt = new Date();
      }
    }

    await assignment.save();

    // Socket update to parent request room
    emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_journey_started', {
      requestId: assignment.parentRequestId,
      assignmentId: assignment._id,
      workerId: assignment.workerId,
      journeyStatus: 'JOURNEY_STARTED',
      dayNumber: assignment.bookingType === 'DAILY' ? (assignment.currentDayIndex || 1) : null,
      serverTimestamp: new Date()
    });

    // Notify farmer
    await notify({
      recipientType: 'user',
      recipientId: assignment.farmerId,
      type: 'worker_journey_started',
      title: 'Worker is on the way!',
      message: 'Worker has started journey towards your farm.',
      relatedId: assignment.parentRequestId,
      relatedType: 'WorkerBookingRequest',
      data: { assignmentId: assignment._id }
    });

    return res.json({
      success: true,
      message: 'Journey started successfully.',
      data: assignment
    });
  } catch (err) {
    console.error('[startJourney]', err);
    return res.status(500).json({ success: false, message: 'Failed to start journey.' });
  }
};

/**
 * POST /api/worker/assignments/:id/arrived
 * Worker marks that they have arrived at the farm
 */
exports.markArrived = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;

    const assignment = await IndWorkerAssignment.findOne({
      _id: assignmentId,
      workerId,
      assignmentStatus: 'CONFIRMED'
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found or not in confirmed state.' });
    }

    assignment.journeyStatus = 'ARRIVED';
    assignment.arrivedAt = new Date();

    if (assignment.bookingType === 'DAILY') {
      const dayIdx = assignment.currentDayIndex || 1;
      let log = assignment.dailyLogs?.find(l => l.dayNumber === dayIdx);
      if (log) {
        log.journeyStatus = 'ARRIVED';
        log.arrivedAt = new Date();
      }
    }

    await assignment.save();

    // Socket update
    emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_arrived', {
      requestId: assignment.parentRequestId,
      assignmentId: assignment._id,
      workerId: assignment.workerId,
      journeyStatus: 'ARRIVED',
      dayNumber: assignment.bookingType === 'DAILY' ? (assignment.currentDayIndex || 1) : null,
      serverTimestamp: new Date()
    });

    // Notify farmer
    await notify({
      recipientType: 'user',
      recipientId: assignment.farmerId,
      type: 'worker_arrived',
      title: 'Worker has arrived!',
      message: 'Worker has arrived at your farm. Please provide the Visit OTP to begin work.',
      relatedId: assignment.parentRequestId,
      relatedType: 'WorkerBookingRequest',
      data: { assignmentId: assignment._id }
    });

    return res.json({
      success: true,
      message: 'Marked arrived at farm. Please ask farmer for Visit OTP.',
      data: assignment
    });
  } catch (err) {
    console.error('[markArrived]', err);
    return res.status(500).json({ success: false, message: 'Failed to mark arrival.' });
  }
};

/**
 * POST /api/worker/assignments/:id/verify-visit-otp
 * Worker enters the Visit OTP provided by the farmer
 */
exports.verifyVisitOtp = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP is required.' });
    }

    const assignment = await IndWorkerAssignment.findOne({
      _id: assignmentId,
      workerId,
      assignmentStatus: 'CONFIRMED'
    }).select('+visitOtpHash');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    if (assignment.bookingType === 'DAILY') {
      const dayIdx = assignment.currentDayIndex || 1;
      let log = assignment.dailyLogs?.find(l => l.dayNumber === dayIdx);

      if (!log) {
        return res.status(400).json({ success: false, message: `Day ${dayIdx} attendance has not started yet.` });
      }

      if (log.visitOtpStatus === 'VERIFIED') {
        return res.json({ success: true, message: `Day ${dayIdx} Visit OTP already verified.`, data: assignment });
      }

      if ((log.visitOtpAttempts || 0) >= 5) {
        log.visitOtpStatus = 'EXPIRED';
        await assignment.save();
        return res.status(429).json({ success: false, message: 'Too many invalid attempts. Ask farmer to generate a new OTP.' });
      }

      const inputHash = crypto.createHash('sha256').update(otp.toString().trim()).digest('hex');
      const directMatch = log.visitOtpCode && log.visitOtpCode === otp.toString().trim();
      const hashMatch = log.visitOtpHash && log.visitOtpHash === inputHash;

      if (!directMatch && !hashMatch) {
        log.visitOtpAttempts = (log.visitOtpAttempts || 0) + 1;
        await assignment.save();
        return res.status(400).json({
          success: false,
          message: `Invalid OTP. Attempts left: ${5 - log.visitOtpAttempts}`
        });
      }

      log.visitOtpStatus = 'VERIFIED';
      log.visitOtpVerifiedAt = new Date();
      log.workStatus = 'IN_PROGRESS';
      log.workStartedAt = new Date();
      log.journeyStatus = 'ARRIVED';

      assignment.visitOtpStatus = 'VERIFIED';
      assignment.visitOtpVerifiedAt = new Date();
      assignment.workStatus = 'IN_PROGRESS';
      assignment.workStartedAt = new Date();
      assignment.journeyStatus = 'ARRIVED';
      await assignment.save();

      emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_visit_otp_verified', {
        requestId: assignment.parentRequestId,
        assignmentId: assignment._id,
        workerId: assignment.workerId,
        dayNumber: dayIdx,
        visitOtpStatus: 'VERIFIED',
        workStatus: 'IN_PROGRESS',
        serverTimestamp: new Date()
      });

      return res.json({
        success: true,
        message: `Day ${dayIdx} Visit OTP verified! Work is in progress.`,
        data: assignment
      });
    }

    // --- HOURLY VISIT OTP FLOW ---
    if (assignment.visitOtpStatus === 'VERIFIED') {
      return res.json({ success: true, message: 'Visit OTP already verified.', data: assignment });
    }

    // Check attempts limit
    if (assignment.visitOtpAttempts >= 5) {
      assignment.visitOtpStatus = 'LOCKED';
      await assignment.save();
      return res.status(429).json({ success: false, message: 'Too many invalid attempts. Please ask farmer to regenerate OTP.' });
    }

    const inputHash = crypto.createHash('sha256').update(otp.toString().trim()).digest('hex');
    const directMatch = assignment.visitOtpCode && assignment.visitOtpCode === otp.toString().trim();
    const hashMatch = assignment.visitOtpHash && assignment.visitOtpHash === inputHash;

    if (!directMatch && !hashMatch) {
      assignment.visitOtpAttempts = (assignment.visitOtpAttempts || 0) + 1;
      await assignment.save();
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. Attempts left: ${5 - assignment.visitOtpAttempts}`
      });
    }

    // OTP Valid
    assignment.visitOtpStatus = 'VERIFIED';
    assignment.visitOtpVerifiedAt = new Date();
    assignment.workStatus = 'IN_PROGRESS';
    assignment.workStartedAt = new Date();
    assignment.journeyStatus = 'ARRIVED';

    // ── HOURLY LATE PENALTY CHECK (Authoritative from Admin Settings) ──
    try {
      const { getWorkerFinancialSettings, applyWorkerPenalty } = require('../../services/workerFinancialService');
      const settings = await getWorkerFinancialSettings();

      if (settings.workerPenaltyEnabled) {
        const parentRequest = await WorkerBookingRequest.findById(assignment.parentRequestId);
        if (parentRequest && parentRequest.scheduledDate && parentRequest.startTime) {
          const [sHour, sMin] = parentRequest.startTime.split(':').map(Number);
          const schedDate = new Date(parentRequest.scheduledDate);
          schedDate.setHours(sHour, sMin, 0, 0);

          const diffMins = Math.floor((assignment.visitOtpVerifiedAt - schedDate) / (1000 * 60));
          const freeMins = Number(settings.workerPenaltyFreeMinutes) || 0;

          if (diffMins > freeMins) {
            const lateMins = diffMins - freeMins;
            let penaltyAmount = 0;

            if (settings.workerPenaltyType === 'per_minute') {
              const perMin = Number(settings.workerPenaltyPerMinute) || 5;
              const maxPen = Number(settings.workerPenaltyMaxAmount) || 500;
              penaltyAmount = Math.min(maxPen, lateMins * perMin);
            } else if (settings.workerPenaltyType === 'percentage') {
              const pct = Number(settings.workerPenaltyPercentage) || 5;
              penaltyAmount = Math.round(((Number(assignment.grossAmount) || 0) * pct) / 100);
            } else {
              penaltyAmount = Number(settings.workerPenaltyAmount) || 50;
            }

            if (penaltyAmount > 0 && !assignment.latePenalty?.applied) {
              assignment.latePenalty = {
                applied: true,
                amount: penaltyAmount,
                minutesLate: diffMins,
                ruleType: settings.workerPenaltyType,
                appliedAt: new Date()
              };
              assignment.netEarning = Math.max(0, (Number(assignment.netEarning) || 0) - penaltyAmount);

              await applyWorkerPenalty(
                workerId,
                assignment.legacyBookingId,
                `late_pen_${assignment._id}`,
                settings.workerPenaltyType,
                `Late arrival by ${diffMins} minutes (grace: ${freeMins}m)`
              );
            }
          }
        }
      }
    } catch (penErr) {
      console.warn('[Late penalty check error - non-fatal]:', penErr.message);
    }

    await assignment.save();

    // Socket update
    emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_visit_otp_verified', {
      requestId: assignment.parentRequestId,
      assignmentId: assignment._id,
      workerId: assignment.workerId,
      visitOtpStatus: 'VERIFIED',
      workStatus: 'IN_PROGRESS',
      serverTimestamp: new Date()
    });

    return res.json({
      success: true,
      message: 'Visit OTP verified! Work is now in progress.',
      data: assignment
    });
  } catch (err) {
    console.error('[verifyVisitOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to verify visit OTP.' });
  }
};

/**
 * POST /api/worker/assignments/:id/submit-proof
 * Worker submits proof of completion (photo URL / notes)
 */
exports.submitProof = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;
    const { fileUrl, publicId, notes } = req.body;

    const assignment = await IndWorkerAssignment.findOne({
      _id: assignmentId,
      workerId,
      assignmentStatus: 'CONFIRMED'
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    if (assignment.visitOtpStatus !== 'VERIFIED') {
      return res.status(400).json({ success: false, message: 'Visit OTP must be verified before submitting work proof.' });
    }

    assignment.workStatus = 'SUBMITTED';
    assignment.workSubmittedAt = new Date();
    assignment.completionProof = {
      fileUrl: fileUrl || assignment.completionProof?.fileUrl || null,
      publicId: publicId || null,
      notes: notes || '',
      uploadedAt: new Date()
    };
    await assignment.save();

    // Socket update
    emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_work_submitted', {
      requestId: assignment.parentRequestId,
      assignmentId: assignment._id,
      workerId: assignment.workerId,
      workStatus: 'SUBMITTED',
      proof: assignment.completionProof,
      serverTimestamp: new Date()
    });

    // Notify farmer to generate/give Completion OTP
    await notify({
      recipientType: 'user',
      recipientId: assignment.farmerId,
      type: 'worker_work_submitted',
      title: 'Work Proof Submitted!',
      message: 'Worker has submitted completion proof. Please verify work and share Completion OTP to release payment.',
      relatedId: assignment.parentRequestId,
      relatedType: 'WorkerBookingRequest',
      data: { assignmentId: assignment._id }
    });

    return res.json({
      success: true,
      message: 'Work proof submitted. Please ask farmer for Completion OTP.',
      data: assignment
    });
  } catch (err) {
    console.error('[submitProof]', err);
    return res.status(500).json({ success: false, message: 'Failed to submit proof.' });
  }
};

/**
 * POST /api/worker/assignments/:id/verify-completion-otp
 * Worker enters Completion OTP provided by farmer -> triggers settlement
 */
exports.verifyCompletionOtp = async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const workerId = req.user._id;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: 'Completion OTP is required.' });
    }

    const assignment = await IndWorkerAssignment.findOne({
      _id: assignmentId,
      workerId,
      assignmentStatus: 'CONFIRMED'
    }).select('+completionOtpHash');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    if (assignment.completionStatus === 'OTP_VERIFIED' && assignment.settlementStatus === 'SETTLED') {
      return res.json({ success: true, message: 'Completion already verified and settled.', data: assignment });
    }

    const isDaily = assignment.bookingType === 'DAILY';

    if (isDaily) {
      const dayIdx = assignment.currentDayIndex || 1;
      let log = assignment.dailyLogs?.find(l => l.dayNumber === dayIdx);

      if (!log) {
        return res.status(400).json({ success: false, message: `Day ${dayIdx} attendance record not found.` });
      }

      if (log.workStatus === 'COMPLETED') {
        return res.json({ success: true, message: `Day ${dayIdx} already verified and completed.`, data: assignment });
      }

      if ((log.completionOtpAttempts || 0) >= 5) {
        return res.status(429).json({ success: false, message: 'Too many invalid attempts. Ask farmer to generate a new Completion OTP.' });
      }

      const inputHash = crypto.createHash('sha256').update(otp.toString().trim()).digest('hex');
      const directMatch = (log.completionOtpCode && log.completionOtpCode === otp.toString().trim()) ||
                          (assignment.completionOtpCode && assignment.completionOtpCode === otp.toString().trim());
      const hashMatch = (log.completionOtpHash && log.completionOtpHash === inputHash) ||
                        (assignment.completionOtpHash && assignment.completionOtpHash === inputHash);

      if (!directMatch && !hashMatch) {
        log.completionOtpAttempts = (log.completionOtpAttempts || 0) + 1;
        await assignment.save();
        return res.status(400).json({
          success: false,
          message: `Invalid Completion OTP. Attempts left: ${5 - log.completionOtpAttempts}`
        });
      }

      // Day verified!
      log.workStatus = 'COMPLETED';
      log.completedAt = new Date();
      assignment.workedDays = (assignment.workedDays || 0) + 1;

      const isDecreased = Boolean(assignment.isDecreased);
      const totalBookedDays = Number(assignment.bookedDays) || 1;
      const isTerminal = isDecreased || (assignment.workedDays >= totalBookedDays);

      if (!isTerminal) {
        // More days remaining -> advance to next day
        assignment.currentDayIndex = assignment.workedDays + 1;
        assignment.journeyStatus = 'NOT_STARTED';
        assignment.visitOtpStatus = 'PENDING';
        assignment.workStatus = 'NOT_STARTED';
        assignment.completionStatus = 'PENDING';

        // Pre-generate next day's fresh visit OTP
        const nextVisitOtp = Math.floor(1000 + Math.random() * 9000).toString();
        const nextVisitOtpHash = crypto.createHash('sha256').update(nextVisitOtp).digest('hex');
        assignment.dailyLogs.push({
          dayNumber: assignment.currentDayIndex,
          date: new Date(),
          journeyStatus: 'NOT_STARTED',
          visitOtpCode: nextVisitOtp,
          visitOtpHash: nextVisitOtpHash,
          visitOtpStatus: 'PENDING',
          visitOtpExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          workStatus: 'NOT_STARTED'
        });

        await assignment.save();

        emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_day_completed', {
          requestId: assignment.parentRequestId,
          assignmentId: assignment._id,
          workerId: assignment.workerId,
          completedDay: assignment.workedDays,
          nextDay: assignment.currentDayIndex,
          totalDays: totalBookedDays,
          serverTimestamp: new Date()
        });

        await notify({
          recipientType: 'user',
          recipientId: assignment.farmerId,
          type: 'day_completed',
          title: `Day ${assignment.workedDays} Work Completed!`,
          message: `Worker completed Day ${assignment.workedDays} of ${totalBookedDays}. Day ${assignment.currentDayIndex} is scheduled next.`,
          relatedId: assignment.parentRequestId,
          relatedType: 'WorkerBookingRequest',
          data: { assignmentId: assignment._id }
        });

        return res.json({
          success: true,
          message: `Day ${assignment.workedDays} completed successfully! Next working day is Day ${assignment.currentDayIndex}.`,
          data: assignment
        });
      }

      // WORKER HAS REACHED TERMINAL STATE (All days done OR decreased)
      // Execute final settlement for this worker
      const { calculateDailyWorkerSettlement, processDailyFarmerRefund } = require('../../services/workerFinancialService');
      const settlement = calculateDailyWorkerSettlement(assignment);

      assignment.completionStatus = 'OTP_VERIFIED';
      assignment.completionOtpVerifiedAt = new Date();
      assignment.workCompletedAt = new Date();
      assignment.grossAmount = settlement.grossAmount;
      assignment.commissionAmount = settlement.commissionAmount;
      assignment.netEarning = settlement.netEarning;

      const idempotencyKey = `settle_daily_assign_${assignment._id}_${Date.now()}`;
      if (assignment.settlementStatus !== 'SETTLED') {
        try {
          assignment.settlementStatus = 'PROCESSING';
          await assignment.save();

          const parentReq = await WorkerBookingRequest.findById(assignment.parentRequestId);
          const isCash = Boolean(assignment.isCashBooking) || assignment.paymentMethod === 'cash' || (parentReq && parentReq.paymentMethod === 'cash');

          if (isCash) {
            // Worker collected physical cash on farm directly from customer
            const commission = settlement.commissionAmount || 0;
            const workerDoc = await Worker.findById(workerId);
            if (workerDoc) {
              let walletBal = workerDoc.wallet?.balance || 0;
              if (walletBal >= commission) {
                workerDoc.wallet.balance = walletBal - commission;
              } else {
                const remainingDue = commission - walletBal;
                workerDoc.wallet.balance = 0;
                workerDoc.outstandingDues = (workerDoc.outstandingDues || 0) + remainingDue;
              }
              workerDoc.status = 'ONLINE';
              await workerDoc.save();

              let workerWallet = await Wallet.findOne({ workerId, userModel: 'Worker' }) || await Wallet.findOne({ userId: workerId });
              if (workerWallet) {
                workerWallet.balance = workerDoc.wallet.balance;
                await workerWallet.save();
              }
            } else {
              await Worker.findByIdAndUpdate(workerId, { status: 'ONLINE' });
            }

            await Transaction.create({
              workerId,
              type: 'commission_deduction',
              amount: commission,
              status: 'completed',
              paymentMethod: 'cash',
              description: `DAILY Cash Commission ₹${commission} for ${assignment.workedDays} days (Assignment ${assignment._id})`,
              referenceId: idempotencyKey,
              metadata: {
                type: 'cash_collection_commission',
                grossAmount: settlement.grossAmount,
                commissionAmount: commission,
                netEarning: settlement.netEarning
              }
            });
          } else {
            await Worker.findByIdAndUpdate(workerId, {
              $inc: { 'wallet.balance': settlement.netEarning },
              status: 'ONLINE'
            });

            let workerWallet = await Wallet.findOne({ workerId, userModel: 'Worker' });
            if (!workerWallet) workerWallet = await Wallet.findOne({ userId: workerId });
            if (workerWallet) {
              workerWallet.balance = (workerWallet.balance || 0) + settlement.netEarning;
              await workerWallet.save();
            } else {
              await Wallet.create({ userId: workerId, userModel: 'Worker', balance: settlement.netEarning });
            }

            await Transaction.create({
              workerId,
              type: 'earnings_credit',
              amount: settlement.netEarning,
              status: 'completed',
              paymentMethod: 'wallet',
              description: `DAILY Earnings for ${assignment.workedDays} days (Assignment ${assignment._id})`,
              referenceId: idempotencyKey
            });
          }

          assignment.settlementStatus = 'SETTLED';
          assignment.settledAt = new Date();
          assignment.settlementTransactionId = idempotencyKey;
          await assignment.save();

        } catch (settleErr) {
          console.error('[DAILY SETTLEMENT ERROR]', settleErr);
          assignment.settlementStatus = 'FAILED';
          await assignment.save();
        }
      }

      // Check if all assignments for parent booking are settled
      try {
        const allAssignments = await IndWorkerAssignment.find({
          parentRequestId: assignment.parentRequestId,
          assignmentStatus: { $ne: 'CANCELLED' }
        });
        const allSettled = allAssignments.length > 0 && allAssignments.every(a => a.settlementStatus === 'SETTLED');
        if (allSettled) {
          await WorkerBookingRequest.findByIdAndUpdate(assignment.parentRequestId, { status: 'completed' });
          await processDailyFarmerRefund(assignment.parentRequestId);
          emitSafe(`booking_req:${assignment.parentRequestId}`, 'booking_completed', {
            requestId: assignment.parentRequestId,
            status: 'completed',
            serverTimestamp: new Date()
          });
        }
      } catch (parentErr) {
        console.warn('[Parent DAILY Settlement Check]', parentErr.message);
      }

      emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_settled', {
        requestId: assignment.parentRequestId,
        assignmentId: assignment._id,
        workerId: assignment.workerId,
        completionStatus: 'OTP_VERIFIED',
        settlementStatus: assignment.settlementStatus,
        netEarning: assignment.netEarning,
        workedDays: assignment.workedDays,
        serverTimestamp: new Date()
      });

      return res.json({
        success: true,
        message: `DAILY assignment finished and settled! ₹${assignment.netEarning} credited to wallet for ${assignment.workedDays} days.`,
        data: assignment
      });
    }

    // --- HOURLY COMPLETION OTP FLOW ---
    const inputHash = crypto.createHash('sha256').update(otp.toString().trim()).digest('hex');
    const directMatch = assignment.completionOtpCode && assignment.completionOtpCode === otp.toString().trim();
    const hashMatch = assignment.completionOtpHash && assignment.completionOtpHash === inputHash;

    if (!directMatch && !hashMatch) {
      assignment.completionOtpAttempts = (assignment.completionOtpAttempts || 0) + 1;
      await assignment.save();
      return res.status(400).json({
        success: false,
        message: `Invalid Completion OTP. Attempts left: ${5 - assignment.completionOtpAttempts}`
      });
    }

    // OTP Verified!
    assignment.completionStatus = 'OTP_VERIFIED';
    assignment.completionOtpVerifiedAt = new Date();
    assignment.workCompletedAt = new Date();

    // -------------------------------------------------------------------------
    // SETTLEMENT: Credit Worker Wallet
    // -------------------------------------------------------------------------
    const idempotencyKey = `settle_assign_${assignment._id}`;

    if (assignment.settlementStatus !== 'SETTLED') {
      try {
        assignment.settlementStatus = 'PROCESSING';
        await assignment.save();

        const parentReq = await WorkerBookingRequest.findById(assignment.parentRequestId);
        const isCash = Boolean(assignment.isCashBooking) || assignment.paymentMethod === 'cash' || (parentReq && parentReq.paymentMethod === 'cash');

        if (isCash) {
          // Cash on Service flow
          const commission = assignment.commissionAmount || 0;
          const workerDoc = await Worker.findById(workerId);
          if (workerDoc) {
            let walletBal = workerDoc.wallet?.balance || 0;
            if (walletBal >= commission) {
              workerDoc.wallet.balance = walletBal - commission;
            } else {
              const remainingDue = commission - walletBal;
              workerDoc.wallet.balance = 0;
              workerDoc.outstandingDues = (workerDoc.outstandingDues || 0) + remainingDue;
            }
            workerDoc.status = 'ONLINE';
            await workerDoc.save();

            let workerWallet = await Wallet.findOne({ workerId, userModel: 'Worker' }) || await Wallet.findOne({ userId: workerId });
            if (workerWallet) {
              workerWallet.balance = workerDoc.wallet.balance;
              await workerWallet.save();
            }
          } else {
            await Worker.findByIdAndUpdate(workerId, { status: 'ONLINE' });
          }

          await Transaction.create({
            workerId,
            type: 'commission_deduction',
            amount: commission,
            status: 'completed',
            paymentMethod: 'cash',
            description: `Cash Commission ₹${commission} for assignment ${assignment._id}`,
            referenceId: idempotencyKey,
            metadata: {
              type: 'cash_collection_commission',
              grossAmount: assignment.grossAmount,
              commissionAmount: commission,
              netEarning: assignment.netEarning
            }
          });
        } else {
          const netEarning = assignment.netEarning;

          // 1. Credit Worker in Worker Model
          await Worker.findByIdAndUpdate(workerId, {
            $inc: { 'wallet.balance': netEarning },
            status: 'ONLINE'
          });

          // 2. Also ensure Wallet doc exists & credit
          let workerWallet = await Wallet.findOne({ workerId, userModel: 'Worker' });
          if (!workerWallet) {
            workerWallet = await Wallet.findOne({ userId: workerId });
          }
          if (workerWallet) {
            workerWallet.balance = (workerWallet.balance || 0) + netEarning;
            await workerWallet.save();
          } else {
            await Wallet.create({ userId: workerId, userModel: 'Worker', balance: netEarning });
          }

          // 3. Create Transaction records
          await Transaction.create({
            workerId,
            type: 'earnings_credit',
            amount: netEarning,
            status: 'completed',
            paymentMethod: 'wallet',
            description: `Earnings for assignment ${assignment._id}`,
            referenceId: idempotencyKey
          });
        }

        assignment.settlementStatus = 'SETTLED';
        assignment.settledAt = new Date();
        assignment.settlementTransactionId = idempotencyKey;
        await assignment.save();

        // Also update legacy Booking doc if linked
        if (assignment.legacyBookingId) {
          await Booking.findByIdAndUpdate(assignment.legacyBookingId, {
            status: 'completed',
            settlementStatus: 'completed',
            workDoneAt: new Date(),
            completedAt: new Date()
          });
        }
      } catch (settleErr) {
        console.error('[SETTLEMENT ERROR]', settleErr);
        assignment.settlementStatus = 'FAILED';
        await assignment.save();
      }
    } else {
      await Worker.findByIdAndUpdate(workerId, { status: 'ONLINE' });
    }

    // 1. Notify Farmer that this individual worker completed work
    await notify({
      recipientType: 'user',
      recipientId: assignment.farmerId,
      type: 'work_completed',
      title: 'Work Completed!',
      message: 'Worker has completed the work on your farm and payment has been settled.',
      relatedId: assignment._id,
      relatedType: 'IndWorkerAssignment',
      data: { assignmentId: assignment._id, requestId: assignment.parentRequestId }
    });

    // 2. Check if ALL assignments for this parent request are settled -> complete parent and process refund
    try {
      const allAssignments = await IndWorkerAssignment.find({
        parentRequestId: assignment.parentRequestId,
        assignmentStatus: { $ne: 'CANCELLED' }
      });
      const allSettled = allAssignments.length > 0 && allAssignments.every(a => a.settlementStatus === 'SETTLED');
      if (allSettled) {
        await WorkerBookingRequest.findByIdAndUpdate(assignment.parentRequestId, {
          status: 'completed'
        });

        emitSafe(`booking_req:${assignment.parentRequestId}`, 'booking_completed', {
          requestId: assignment.parentRequestId,
          status: 'completed',
          serverTimestamp: new Date()
        });
        emitSafe(`booking_req_${assignment.parentRequestId}`, 'booking_completed', {
          requestId: assignment.parentRequestId,
          status: 'completed',
          serverTimestamp: new Date()
        });
        emitSafe(`user_${assignment.farmerId}`, 'booking_completed', {
          bookingId: assignment.parentRequestId.toString(),
          requestId: assignment.parentRequestId.toString(),
          status: 'completed',
          serverTimestamp: new Date()
        });

        // Notify farmer of full completion
        await notify({
          recipientType: 'user',
          recipientId: assignment.farmerId,
          type: 'booking_completed',
          title: 'Booking Completed Successfully!',
          message: 'All workers have completed their work. Unused payment reserve has been refunded to your wallet.',
          relatedId: assignment.parentRequestId,
          relatedType: 'WorkerBookingRequest',
          data: { requestId: assignment.parentRequestId }
        });

        // Process refund after completion notification
        const { processFarmerBookingRefund } = require('../../services/workerFinancialService');
        await processFarmerBookingRefund(assignment.parentRequestId);
      }
    } catch (parentErr) {
      console.warn('[Parent Status Update & Refund]', parentErr.message);
    }

    // Socket update
    const eventData = {
      requestId: assignment.parentRequestId,
      assignmentId: assignment._id,
      workerId: assignment.workerId,
      completionStatus: 'OTP_VERIFIED',
      settlementStatus: assignment.settlementStatus,
      netEarning: assignment.netEarning,
      serverTimestamp: new Date()
    };

    emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_completion_otp_verified', eventData);
    emitSafe(`booking_req_${assignment.parentRequestId}`, 'assignment_completion_otp_verified', eventData);

    emitSafe(`booking_req:${assignment.parentRequestId}`, 'assignment_settled', eventData);
    emitSafe(`booking_req_${assignment.parentRequestId}`, 'assignment_settled', eventData);

    // Notify worker
    await notify({
      recipientType: 'worker',
      recipientId: workerId,
      type: 'assignment_settled',
      title: 'Payment Credited to Wallet!',
      message: `₹${assignment.netEarning} has been added to your AgroYilt wallet for completing this job.`,
      relatedId: assignment.parentRequestId,
      relatedType: 'WorkerBookingRequest',
      data: { assignmentId: assignment._id, netEarning: assignment.netEarning }
    });

    return res.json({
      success: true,
      message: 'Completion OTP verified! Payment of ?' + assignment.netEarning + ' credited to your wallet.',
      data: assignment
    });
  } catch (err) {
    console.error('[verifyCompletionOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to verify completion OTP.' });
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


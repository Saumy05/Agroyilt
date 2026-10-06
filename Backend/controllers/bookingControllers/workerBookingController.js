const Booking = require('../../models/Booking');
const BookingRequest = require('../../models/BookingRequest');
const { validationResult } = require('express-validator');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');

const IndWorkerAssignment = require('../../models/IndWorkerAssignment');

/**
 * Get assigned jobs for worker
 */
/**
 * The IndWorkerAssignment is the source of truth for a farmer-worker job. The mirror Booking's status is NOT
 * advanced by the lifecycle (journey / arrival / visit OTP / proof), so any worker-facing job view must take its
 * status from the assignment. For DAILY bookings the top-level dimensions describe the current day.
 *
 * confirmed → journey_started → visited → in_progress → work_done (stopped, awaiting End OTP) → completed
 */
const assignmentJobStatus = (a) => {
  if (!a) return null;
  if (['CANCELLED', 'REPLACED'].includes(a.assignmentStatus)) return 'cancelled';
  if (a.assignmentStatus === 'COMPLETED' || a.settlementStatus === 'SETTLED') return 'completed';
  if (a.completionStatus === 'OTP_VERIFIED' || a.workStatus === 'SUBMITTED') return 'work_done';
  if (a.workStatus === 'IN_PROGRESS') return 'in_progress';
  if (a.journeyStatus === 'ARRIVED') return 'visited';
  if (a.journeyStatus === 'JOURNEY_STARTED') return 'journey_started';
  return 'confirmed';
};

/** Lifecycle fields copied onto a worker job payload so the UI can render the stepper. */
const assignmentLifecycleFields = (a) => ({
  status: assignmentJobStatus(a),
  assignmentId: a._id,
  assignmentStatus: a.assignmentStatus,
  journeyStatus: a.journeyStatus,
  visitOtpStatus: a.visitOtpStatus,
  workStatus: a.workStatus,
  completionStatus: a.completionStatus,
  settlementStatus: a.settlementStatus,
  journeyStartedAt: a.journeyStartedAt,
  arrivedAt: a.arrivedAt,
  workStartedAt: a.workStartedAt,
  workSubmittedAt: a.workSubmittedAt,
  completedAt: a.workCompletedAt || a.completionOtpVerifiedAt || null
});

const getAssignedJobs = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { status, page = 1, limit = 50 } = req.query;

    const BookingRequest = require('../../models/BookingRequest');
    const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
    const { buildWorkerPaymentSummary } = require('../../services/workerFinancialService');

    const myRequests = await BookingRequest.find({ workerId, status: { $ne: 'REJECTED' } }).select('bookingId');
    const requestBookingIds = myRequests.map(r => r.bookingId);

    // Build query matching assigned jobs or notified/potential/requested jobs
    const query = {
      $or: [
        { workerId },
        { notifiedWorkers: workerId },
        { 'potentialWorkers.workerId': workerId },
        { _id: { $in: requestBookingIds } }
      ]
    };
    if (status) {
      if (status.toUpperCase() === 'PENDING' || status.toUpperCase() === 'REQUESTED') {
        query.status = { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.PENDING] };
      } else {
        query.status = status;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // ── 1. Legacy Booking records ──────────────────────────────────────────────
    const bookings = await Booking.find(query)
      .populate('userId', 'name phone email')
      .populate('vendorId', 'name businessName phone')
      .populate('serviceId', 'title iconUrl')
      .populate('categoryId', 'title slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const enrichedBookings = await Promise.all(bookings.map(async (bookingDoc) => {
      const b = bookingDoc.toObject ? bookingDoc.toObject() : { ...bookingDoc };
      const isWorkerBooking = b.providerType === 'WORKER' || Boolean(b.workerRequestId) || (b.bookingNumber && b.bookingNumber.startsWith('WRK-')) || (b.bookingNumber && b.bookingNumber.startsWith('GRP-'));
      if (isWorkerBooking) {
        b.providerType = 'WORKER';
        try {
          const assignment = await IndWorkerAssignment.findOne({
            workerId,
            $or: [
              { legacyBookingId: b._id },
              { parentRequestId: b.workerRequestId }
            ]
          });
          const summary = buildWorkerPaymentSummary(assignment, b);
          if (summary) {
            b.paymentSummary = summary;
            b.workerGrossEarning = summary.grossAmount;
            b.commissionRate = summary.commissionRate;
            b.commissionAmount = summary.commissionAmount;
            b.workerNetEarning = summary.netEarning;
            b.finalAmount = summary.netEarning;
          } else {
            const gross = b.workerGrossEarning || b.agreedRate || b.workerOfferedRate || b.finalAmount || 0;
            const comm = Math.round((gross * 10) / 100);
            b.workerGrossEarning = gross;
            b.commissionRate = 10;
            b.commissionAmount = comm;
            b.workerNetEarning = gross - comm;
            b.finalAmount = gross - comm;
          }
          if (assignment) Object.assign(b, assignmentLifecycleFields(assignment));
        } catch (e) {
          const gross = b.workerGrossEarning || b.agreedRate || b.workerOfferedRate || b.finalAmount || 0;
          const comm = Math.round((gross * 10) / 100);
          b.workerNetEarning = gross - comm;
          b.finalAmount = gross - comm;
        }
      }
      return b;
    }));

    // ── 2. IndWorkerAssignment records (confirmed group / independent bookings) ─
    // These are the authoritative docs created after farmer payment. They do NOT
    // always have a corresponding legacy Booking doc, so we must include them
    // separately — this is the core fix for "Ram Kumar not showing job card".
    const assignmentQuery = { workerId, assignmentStatus: { $ne: 'CANCELLED' } };
    const assignments = await IndWorkerAssignment.find(assignmentQuery)
      .populate('farmerId', 'name phone email')
      .populate({
        path: 'parentRequestId',
        select: 'workTitle workCategory workDescription scheduledDate startTime endTime location rateUnit minRate maxRate bookingType startDate endDate numberOfDays'
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Track mirror bookings / assignments already included to avoid showing the same job twice
    const existingBookingIds = new Set(enrichedBookings.map(b => b._id.toString()));
    const existingAssignmentIds = new Set(
      enrichedBookings.filter(b => b.assignmentId).map(b => b.assignmentId.toString())
    );

    for (const aDoc of assignments) {
      const a = aDoc.toObject ? aDoc.toObject() : { ...aDoc };

      // Skip if this assignment is already represented by its mirror Booking
      if (a.legacyBookingId && existingBookingIds.has(a.legacyBookingId.toString())) continue;
      if (existingAssignmentIds.has(a._id.toString())) continue;
      // Skip if the assignment _id is already in list (shouldn't happen but be safe)
      if (existingBookingIds.has(a._id.toString())) continue;

      const parent = (a.parentRequestId && typeof a.parentRequestId === 'object') ? a.parentRequestId : {};
      let summary = null;
      try { summary = buildWorkerPaymentSummary(aDoc); } catch (_) {}

      const gross = summary?.grossAmount || a.agreedRate || 0;
      const commRate = summary?.commissionRate || a.commissionRate || 10;
      const commAmt = summary?.commissionAmount || Math.round((gross * commRate) / 100);
      const net = summary?.netEarning || (gross - commAmt);

      const normalizedJob = {
        _id: a._id,
        __type: 'IndWorkerAssignment',
        bookingNumber: `ASGN-${a._id.toString().slice(-6).toUpperCase()}`,
        providerType: 'WORKER',
        workerId: a.workerId,
        workerResponse: 'ACCEPTED',
        workerAcceptedAt: a.createdAt,
        userId: a.farmerId,
        serviceName: parent.workTitle || parent.workCategory || 'Farm Work',
        serviceCategory: parent.workCategory || 'Worker',
        ...assignmentLifecycleFields(a),
        scheduledDate: parent.scheduledDate || a.createdAt,
        scheduledTime: parent.startTime || '',
        address: parent.location || {},
        agreedRate: a.agreedRate,
        rateUnit: a.rateUnit || parent.rateUnit || 'daily',
        bookingType: a.bookingType || parent.bookingType || 'HOURLY',
        startDate: parent.startDate || null,
        endDate: parent.endDate || null,
        numberOfDays: a.bookedDays || parent.numberOfDays || null,
        workedDays: a.workedDays || 0,
        workerGrossEarning: gross,
        commissionRate: commRate,
        commissionAmount: commAmt,
        workerNetEarning: net,
        finalAmount: net,
        paymentSummary: summary || null,
        paymentStatus: a.settlementStatus === 'SETTLED' ? 'success' : 'pending',
        assignmentId: a._id,
        parentRequestId: a.parentRequestId?._id || a.parentRequestId,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      };

      enrichedBookings.push(normalizedJob);
    }

    // Sort final merged list: newest first
    enrichedBookings.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));

    res.status(200).json({
      success: true,
      data: enrichedBookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: enrichedBookings.length,
        pages: Math.ceil(enrichedBookings.length / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get assigned jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch jobs. Please try again.'
    });
  }
};

/**
 * Get job details by ID
 */
const getJobById = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { id } = req.params;

    const BookingRequest = require('../../models/BookingRequest');
    const myRequest = await BookingRequest.findOne({ bookingId: id, workerId });

    const booking = await Booking.findOne({
      _id: id,
      $or: [
        { workerId },
        { notifiedWorkers: workerId },
        { 'potentialWorkers.workerId': workerId },
        ...(myRequest ? [{ _id: id }] : [])
      ]
    })
      .populate('userId', 'name phone email')
      .populate('vendorId', 'name businessName phone email address')
      .populate('serviceId', 'title description iconUrl images')
      .populate('categoryId', 'title slug');

    if (!booking) {
      const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
      const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
      const assignDoc = await IndWorkerAssignment.findOne({ _id: id, workerId });
      if (assignDoc) {
        const parent = await WorkerBookingRequest.findById(assignDoc.parentRequestId).populate('farmerId', 'name phone email');
        const syntheticBooking = {
          _id: assignDoc._id,
          assignmentId: assignDoc._id,
          parentRequestId: assignDoc.parentRequestId,
          providerType: 'WORKER',
          workerId: assignDoc.workerId,
          workerResponse: 'ACCEPTED',
          workerAcceptedAt: assignDoc.createdAt,
          serviceName: parent?.workTitle || 'Farm Work',
          workTitle: parent?.workTitle || 'Farm Work',
          userId: parent?.farmerId ? {
            _id: parent.farmerId._id,
            name: parent.farmerId.name,
            phone: parent.farmerId.phone,
            email: parent.farmerId.email
          } : null,
          address: parent?.location ? {
            address: parent.location.addressLine1,
            city: parent.location.city,
            state: parent.location.state,
            pincode: parent.location.pincode,
            lat: parent.location.lat,
            lng: parent.location.lng
          } : null,
          scheduledDate: parent?.startDate || parent?.scheduledDate,
          scheduledTime: parent?.startTime,
          ...assignmentLifecycleFields(assignDoc),
          paymentMethod: assignDoc.paymentMethod || (assignDoc.isCashBooking ? 'cash' : 'online'),
          bookingType: assignDoc.bookingType || parent?.bookingType || 'HOURLY',
          bookedDays: assignDoc.bookedDays || parent?.numberOfDays || 1,
          workedDays: assignDoc.workedDays || 0,
          currentDayIndex: assignDoc.currentDayIndex || 1,
          isDecreased: Boolean(assignDoc.isDecreased),
          decreasedAt: assignDoc.decreasedAt,
          decreaseReason: assignDoc.decreaseReason,
          dailyLogs: assignDoc.dailyLogs || [],
          agreedRate: assignDoc.agreedRate,
          finalAmount: assignDoc.agreedRate,
          rateUnit: (assignDoc.bookingType === 'DAILY' || parent?.bookingType === 'DAILY') ? 'daily' : 'hourly'
        };

        const IndWorkerExtension = require('../../models/IndWorkerExtension');
        let confirmedExtensions = [];
        try {
          if (assignDoc.parentRequestId) {
            confirmedExtensions = await IndWorkerExtension.find({
              parentRequestId: assignDoc.parentRequestId,
              status: 'CONFIRMED'
            });
          }
        } catch (extErr) {}

        const { buildWorkerPaymentSummary } = require('../../services/workerFinancialService');
        syntheticBooking.paymentSummary = buildWorkerPaymentSummary(assignDoc, null, confirmedExtensions);
        if (syntheticBooking.paymentSummary) {
          syntheticBooking.workerFinancials = {
            workerOfferedRate: syntheticBooking.paymentSummary.agreedRate || syntheticBooking.paymentSummary.grossAmount,
            commissionRate: syntheticBooking.paymentSummary.commissionRate,
            commissionAmount: syntheticBooking.paymentSummary.commissionAmount,
            netEarnings: syntheticBooking.paymentSummary.netEarning,
            extensionBreakdown: syntheticBooking.paymentSummary.extensionBreakdown
          };
          syntheticBooking.workerGrossEarning = syntheticBooking.paymentSummary.grossAmount;
          syntheticBooking.commissionRate = syntheticBooking.paymentSummary.commissionRate;
          syntheticBooking.commissionAmount = syntheticBooking.paymentSummary.commissionAmount;
          syntheticBooking.workerNetEarning = syntheticBooking.paymentSummary.netEarning;
        }

        try {
          const activeExt = await IndWorkerExtension.findOne({
            parentRequestId: assignDoc.parentRequestId,
            status: 'WORKER_EVALUATION',
            expiresAt: { $gt: new Date() }
          }).populate('workerExtensions.workerId', 'name phone profilePicture');
          if (activeExt) {
            syntheticBooking.activeExtension = activeExt;
          }
        } catch (e) {}

        const isCash = Boolean(assignDoc.isCashBooking) || assignDoc.paymentMethod === 'cash' || parent?.paymentMethod === 'cash';
        if (isCash) {
          const totalFarmerPayable = parent?.financialSnapshot?.totalPayable || (assignDoc.agreedRate ? assignDoc.agreedRate + (parent?.financialSnapshot?.platformChargeAmount || 0) : 0);
          const workerWage = syntheticBooking.paymentSummary?.grossAmount || assignDoc.grossAmount || assignDoc.agreedRate || 0;
          const platformFee = parent?.financialSnapshot?.platformChargeAmount || Math.max(0, totalFarmerPayable - workerWage);

          syntheticBooking.cashCollection = {
            isCashBooking: true,
            totalToCollect: totalFarmerPayable > 0 ? totalFarmerPayable : workerWage,
            workerWage: workerWage,
            platformFee: platformFee,
            commissionAmount: syntheticBooking.paymentSummary?.commissionAmount || assignDoc.commissionAmount || Math.round((workerWage * 0.1)),
            netEarnings: syntheticBooking.paymentSummary?.netEarning || assignDoc.netEarning || (workerWage - (syntheticBooking.paymentSummary?.commissionAmount || Math.round((workerWage * 0.1)))),
            instruction: `Collect ₹${totalFarmerPayable > 0 ? totalFarmerPayable : workerWage} cash from the farmer. Platform fee (₹${platformFee}) will be deducted from your wallet balance.`
          };
          syntheticBooking.cashToCollect = syntheticBooking.cashCollection.totalToCollect;
        }

        return res.status(200).json({
          success: true,
          data: syntheticBooking
        });
      }

      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const jobData = booking.toObject ? booking.toObject() : { ...booking };

    // Check if Independent Worker booking
    const isWorkerBooking = booking.providerType === 'WORKER' || Boolean(booking.workerRequestId) || (booking.bookingNumber && booking.bookingNumber.startsWith('WRK-'));
    if (isWorkerBooking) {
      jobData.providerType = 'WORKER';
      try {
        const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
        const IndWorkerExtension = require('../../models/IndWorkerExtension');
        const { buildWorkerPaymentSummary } = require('../../services/workerFinancialService');

        const assignment = await IndWorkerAssignment.findOne({
          workerId,
          $or: [
            { legacyBookingId: booking._id },
            { parentRequestId: booking.workerRequestId }
          ]
        });

        const pReqId = assignment?.parentRequestId || booking.workerRequestId;
        let confirmedExtensions = [];
        if (pReqId) {
          try {
            confirmedExtensions = await IndWorkerExtension.find({
              parentRequestId: pReqId,
              status: 'CONFIRMED'
            });
          } catch (e) {}
        }

        jobData.paymentSummary = buildWorkerPaymentSummary(assignment, booking, confirmedExtensions);
        if (jobData.paymentSummary) {
          jobData.workerFinancials = {
            workerOfferedRate: jobData.paymentSummary.agreedRate || jobData.paymentSummary.grossAmount,
            commissionRate: jobData.paymentSummary.commissionRate,
            commissionAmount: jobData.paymentSummary.commissionAmount,
            netEarnings: jobData.paymentSummary.netEarning,
            extensionBreakdown: jobData.paymentSummary.extensionBreakdown
          };
          jobData.workerGrossEarning = jobData.paymentSummary.grossAmount;
          jobData.commissionRate = jobData.paymentSummary.commissionRate;
          jobData.commissionAmount = jobData.paymentSummary.commissionAmount;
          jobData.workerNetEarning = jobData.paymentSummary.netEarning;
        }

        if (assignment) {
          Object.assign(jobData, assignmentLifecycleFields(assignment));
          // ── FIX 1: Explicitly pin assignmentId so `isAssignmentJob` is always truthy ──
          jobData.assignmentId = String(assignment._id);
          jobData.workerResponse = 'ACCEPTED';
          jobData.workerAcceptedAt = assignment.createdAt;
          jobData.bookingType = assignment.bookingType || booking.bookingType || 'HOURLY';
          jobData.bookedDays = assignment.bookedDays;
          jobData.workedDays = assignment.workedDays;
          jobData.currentDayIndex = assignment.currentDayIndex;
          jobData.isDecreased = Boolean(assignment.isDecreased);
          jobData.decreasedAt = assignment.decreasedAt;
          jobData.decreaseReason = assignment.decreaseReason;
          jobData.dailyLogs = assignment.dailyLogs || [];
          jobData.rateUnit = jobData.bookingType === 'DAILY' ? 'daily' : 'hourly';

          try {
            const IndWorkerExtension = require('../../models/IndWorkerExtension');
            const activeExt = await IndWorkerExtension.findOne({
              parentRequestId: assignment.parentRequestId || booking.workerRequestId,
              status: 'WORKER_EVALUATION',
              expiresAt: { $gt: new Date() }
            }).populate('workerExtensions.workerId', 'name phone profilePicture');
            if (activeExt) {
              jobData.activeExtension = activeExt;
            }
          } catch (e) {}
        }

        try {
          const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
          const pReq = pReqId ? await WorkerBookingRequest.findById(pReqId).select('financialSnapshot paymentMethod paymentStatus') : null;
          const isCash = jobData.paymentMethod === 'cash' || Boolean(assignment?.isCashBooking) || (pReq && pReq.paymentMethod === 'cash');
          if (isCash) {
            const totalFarmerPayable = pReq?.financialSnapshot?.totalPayable || (booking.finalAmount ? booking.finalAmount + (pReq?.financialSnapshot?.platformChargeAmount || 0) : 0);
            const workerWage = jobData.paymentSummary?.grossAmount || assignment?.grossAmount || booking.finalAmount || 0;
            const platformFee = pReq?.financialSnapshot?.platformChargeAmount || Math.max(0, totalFarmerPayable - workerWage);

            jobData.cashCollection = {
              isCashBooking: true,
              totalToCollect: totalFarmerPayable > 0 ? totalFarmerPayable : workerWage,
              workerWage: workerWage,
              platformFee: platformFee,
              commissionAmount: jobData.paymentSummary?.commissionAmount || assignment?.commissionAmount || Math.round((workerWage * 0.1)),
              netEarnings: jobData.paymentSummary?.netEarning || assignment?.netEarning || (workerWage - (jobData.paymentSummary?.commissionAmount || Math.round((workerWage * 0.1)))),
              instruction: `Collect ₹${totalFarmerPayable > 0 ? totalFarmerPayable : workerWage} cash from the farmer. Platform fee (₹${platformFee}) will be deducted from your wallet balance.`
            };
            jobData.cashToCollect = jobData.cashCollection.totalToCollect;
          }
        } catch (cashErr) {}

        // STRICT ROLE ISOLATION: Worker must NEVER see Farmer total, Platform Fee, or other workers' financials
        delete jobData.farmerPaidAmount;
        delete jobData.platformFeeAmount;
        delete jobData.platformFeeRate;
        delete jobData.financialSnapshot;
      } catch (finErr) {
        console.warn('[workerBookingController getJobById] Payment summary enrichment warning:', finErr.message);
      }
    }

    res.status(200).json({
      success: true,
      data: jobData
    });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch job. Please try again.'
    });
  }
};

/**
 * Accept job (Atomic)
 */
const acceptJob = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { id } = req.params;

    const myRequest = await BookingRequest.findOne({ bookingId: id, workerId });

    // ATOMIC UPDATE: Check status and workerId in query to prevent race conditions
    // Only accept if status is REQUESTED/SEARCHING/PENDING/CONFIRMED and NO worker or this worker is assigned
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: id,
        status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED] },
        $or: [
          { workerId: null }, // Ensures another request didn't just take it
          { workerId: workerId }, // Direct assigned booking
          { notifiedWorkers: workerId },
          { 'potentialWorkers.workerId': workerId },
          ...(myRequest ? [{ _id: id }] : [])
        ]
      },
      {
        $set: {
          workerId: workerId,
          acceptedAt: new Date(),
          workerAcceptedAt: new Date(),
          workerResponse: 'ACCEPTED',
          status: BOOKING_STATUS.CONFIRMED // Default to confirmed
        }
      },
      { new: true } // Return updated doc
    );

    if (!updatedBooking) {
      // If update failed, check why (likely already taken)
      const existing = await Booking.findById(id);
      if (existing && existing.workerId) {
        return res.status(409).json({ // 409 Conflict
          success: false,
          message: 'Sorry, this job has already been accepted by another worker.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Booking is no longer available.'
      });
    }

    const booking = updatedBooking;

    // Generate Visit OTP for Worker
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    booking.visitOtp = otp;
    
    await booking.save();

    // Update worker availability to ON_JOB
    const Worker = require('../../models/Worker');
    await Worker.findByIdAndUpdate(workerId, { status: 'ON_JOB' });

    // Update BookingRequest statuses

    // Mark this worker's request as ACCEPTED
    await BookingRequest.findOneAndUpdate(
      { bookingId: id, workerId },
      { status: 'ACCEPTED', respondedAt: new Date() }
    );

    // Mark all other workers' requests as EXPIRED/CANCELLED
    await BookingRequest.updateMany(
      { bookingId: id, workerId: { $ne: workerId } },
      { status: 'EXPIRED', respondedAt: new Date() }
    );

    // NOTIFY OTHER WORKERS to remove this job
    // Use the stored notifiedWorkers list
    const io = req.app.get('io');
    if (io && booking.notifiedWorkers && booking.notifiedWorkers.length > 0) {
      console.log(`[AcceptJob] Notifying ${booking.notifiedWorkers.length} other workers that job ${booking._id} was taken`);
      booking.notifiedWorkers.forEach(otherWorkerId => {
        // Skip the current worker
        if (otherWorkerId.toString() !== workerId.toString()) {
          const room = `worker_${otherWorkerId.toString()}`;
          console.log(`[AcceptJob] Emitting job_taken to room: ${room}`);
          io.to(room).emit('job_taken', {
            bookingId: booking._id.toString(), // Ensure string for frontend comparison
            message: 'This job has been accepted by someone else.'
          });
        }
      });
    }

    // NOTIFY USER
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'worker_assigned',
      title: 'Worker Assigned',
      message: `A worker has accepted your job.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'worker_assigned',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    });

    res.status(200).json({
      success: true,
      message: 'Job successfully accepted',
      data: booking
    });
  } catch (error) {
    console.error('Accept job error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept job. Please try again.'
    });
  }
};

/**
 * Update job status
 */
const updateJobStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const workerId = req.user.id;
    const { id } = req.params;
    const { status, finalSettlementStatus, workerPaymentStatus } = req.body;

    const booking = await Booking.findOne({ _id: id, workerId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // A worker can never mark their own payout/settlement as done, and a job that belongs to the assignment
    // lifecycle can only progress through it (OTP-verified visit/completion + atomic settlement).
    if (finalSettlementStatus !== undefined || workerPaymentStatus !== undefined) {
      return res.status(403).json({ success: false, message: 'Payment and settlement status cannot be set by the worker.' });
    }
    if (await IndWorkerAssignment.exists({ legacyBookingId: booking._id })) {
      return res.status(409).json({ success: false, message: 'This job is managed through the assignment flow (start journey, visit OTP, completion OTP).' });
    }

    // Validate status transition if status is changing
    if (status && status !== booking.status) {
      const validTransitions = {
        [BOOKING_STATUS.ASSIGNED]: [BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS],
        [BOOKING_STATUS.CONFIRMED]: [BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.IN_PROGRESS],
        [BOOKING_STATUS.VISITED]: [BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.COMPLETED],
        [BOOKING_STATUS.IN_PROGRESS]: [BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.COMPLETED],
        [BOOKING_STATUS.WORK_DONE]: [BOOKING_STATUS.COMPLETED],
        [BOOKING_STATUS.JOURNEY_STARTED]: [BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS]
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

      if (status === BOOKING_STATUS.VISITED && !booking.startedAt) {
        booking.startedAt = new Date();
      }

      if (status === BOOKING_STATUS.COMPLETED) {
        booking.completedAt = new Date();
      }

      // Emit socket event for real-time update to user
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${booking.userId}`).emit('booking_updated', {
          bookingId: booking._id,
          status: booking.status,
          message: `Job status updated to ${booking.status}`
        });
      }

      // Add Push Notification for User
      const { createNotification } = require('../notificationControllers/notificationController');

      if (status === BOOKING_STATUS.IN_PROGRESS) {
        await createNotification({
          userId: booking.userId,
          type: 'work_started',
          title: 'Work In Progress',
          message: 'Professional has started working on your service.',
          relatedId: booking._id,
          relatedType: 'booking',
          priority: 'high',
          pushData: { type: 'in_progress', bookingId: booking._id.toString(), link: `/user/booking/${booking._id}` }
        });
      }

    }

    // Update additional fields
    if (finalSettlementStatus) booking.finalSettlementStatus = finalSettlementStatus;
    if (workerPaymentStatus) {
      booking.workerPaymentStatus = workerPaymentStatus;
      if (workerPaymentStatus === 'PAID' || workerPaymentStatus === 'SUCCESS') {
        booking.isWorkerPaid = true;
        booking.workerPaidAt = booking.workerPaidAt || new Date();
      }
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Job status updated successfully',
      data: booking
    });
  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update job status. Please try again.'
    });
  }
};

/**
 * Mark job as started (Journey Started)
 */
const startJob = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { id } = req.params;

    const booking = await Booking.findOne({ _id: id, workerId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (booking.status !== BOOKING_STATUS.ASSIGNED && booking.status !== BOOKING_STATUS.CONFIRMED && booking.status !== BOOKING_STATUS.ACCEPTED) {
      return res.status(400).json({
        success: false,
        message: `Cannot start journey with status: ${booking.status}`
      });
    }

    // Generate Visit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Update booking
    booking.status = BOOKING_STATUS.JOURNEY_STARTED;
    booking.journeyStartedAt = new Date();
    booking.visitOtp = otp; // In production, hash this!

    await booking.save();

    // Notify user with OTP
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'worker_started',
      title: 'Worker Started Journey',
      message: `Worker is on the way! specific OTP for site visit verification is: ${otp}. Please share this with worker upon arrival.`,
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

    // Notify vendor
    await createNotification({
      vendorId: booking.vendorId,
      type: 'worker_started',
      title: 'Worker Started Journey',
      message: `Your worker has started the journey for booking ${booking.bookingNumber}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'journey_started',
        bookingId: booking._id.toString(),
        link: `/vendor/bookings/${booking._id}`
      }
    });

    // Explicitly emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.JOURNEY_STARTED,
        visitOtp: otp
      });

      // Socket notification removed - createNotification already handles this
    }

    res.status(200).json({
      success: true,
      message: 'Journey started, OTP sent to user',
      data: booking
    });
  } catch (error) {
    console.error('Start job error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start job. Please try again.'
    });
  }
};

/**
 * Worker Reached Location
 * Notify user to share OTP
 */
const workerReachedLocation = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { id } = req.params;

    // Need visitOtp to resend it
    const booking = await Booking.findOne({ _id: id, workerId }).select('+visitOtp');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Job not found' });
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
      title: 'Professional has Reached!',
      message: `Professional has reached your location. Please share this OTP: ${otp}`,
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

    res.status(200).json({ success: true, message: 'User notified that professional reached' });
  } catch (error) {
    console.error('Worker reached location error:', error);
    res.status(500).json({ success: false, message: 'Failed to notify user' });
  }
};

/**
 * Verify Site Visit with OTP
 */
const verifyVisit = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { id } = req.params;
    const { otp, location } = req.body;

    // Use query to select visitOtp and driver_start_otp which are usually hidden
    const booking = await Booking.findOne({ _id: id, workerId }).select('+visitOtp +driver_start_otp');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (booking.status !== BOOKING_STATUS.JOURNEY_STARTED) {
      return res.status(400).json({ success: false, message: 'Worker has not started journey yet' });
    }

    const expectedOtp = booking.visitOtp || booking.driver_start_otp;
    const submittedOtp = otp ? otp.toString().trim() : '';
    if (!expectedOtp || !submittedOtp || submittedOtp !== expectedOtp.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Invalid Visit OTP. Please enter the code from the customer.' });
    }

    // Update status
    booking.status = BOOKING_STATUS.VISITED;
    booking.visitedAt = new Date();
    booking.startedAt = new Date(); // Legacy compatibility
    booking.visitOtp = undefined; // Clear OTP
    booking.driver_start_otp = undefined;
    if (location) {
      booking.visitLocation = {
        ...location,
        verifiedAt: new Date()
      };
    }

    await booking.save();

    // Notify user
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

    // Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: booking.status,
        message: 'Visit verified successful'
      });
      // Socket notification removed - createNotification already handles this
    }

    res.status(200).json({
      success: true,
      message: 'Site visit verified successfully',
      data: booking
    });
  } catch (error) {
    console.error('Verify visit error:', error);
    res.status(500).json({ success: false, message: 'Failed to verifying visit' });
  }
};

/**
 * Mark job as completed (Work Done) & Generate Payment OTP
 */
const completeJob = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { id } = req.params;
    const { workPhotos, workDoneDetails } = req.body;

    const booking = await Booking.findOne({ _id: id, workerId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (booking.status !== BOOKING_STATUS.VISITED && booking.status !== BOOKING_STATUS.IN_PROGRESS) {
      return res.status(400).json({
        success: false,
        message: `Cannot complete job with status: ${booking.status}`
      });
    }

    // Update booking
    booking.status = BOOKING_STATUS.WORK_DONE;

    // Generate Payment OTP (Moved to Offline Payment selection step)
    // const payOtp = Math.floor(1000 + Math.random() * 9000).toString();
    // booking.paymentOtp = payOtp;

    if (workPhotos && Array.isArray(workPhotos)) {
      booking.workPhotos = workPhotos;
    }
    if (workDoneDetails) {
      booking.workDoneDetails = workDoneDetails;
    }

    await booking.save();

    // Notify user
    const { createNotification } = require('../notificationControllers/notificationController');

    // 1. Notify user that work is completed and await amount confirmation
    await createNotification({
      userId: booking.userId,
      type: 'work_completed',
      title: 'Work Completed',
      message: `Work finished! Please confirm the final payable amount.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'work_completed',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    });

    // Notify vendor
    await createNotification({
      vendorId: booking.vendorId,
      type: 'worker_completed',
      title: 'Work Done',
      message: `Your worker has marked work as done for booking ${booking.bookingNumber}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'worker_completed',
        bookingId: booking._id.toString(),
        link: `/vendor/bookings/${booking._id}`
      }
    });

    // Explicitly emit socket event to ensure user gets real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.WORK_DONE
      });

      // Socket notification removed - createNotification already handles this
    }

    res.status(200).json({
      success: true,
      message: 'Work done marked, OTP sent to user',
      data: booking
    });
  } catch (error) {
    console.error('Complete job error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete job. Please try again.'
    });
  }
};

/**
 * Collect Cash & Complete Booking
 * Uses VendorBill as the single source of truth for earnings.
 */
const collectCash = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { id } = req.params;
    const { otp } = req.body;

    const booking = await Booking.findOne({ _id: id, workerId }).select('+paymentOtp');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Allow both work_done (vendor flow) and awaiting_payment (independent worker flow)
    const isIndependentWorker = !booking.vendorId && !!booking.workerId;
    if (booking.status !== BOOKING_STATUS.WORK_DONE && booking.status !== BOOKING_STATUS.AWAITING_PAYMENT) {
      return res.status(400).json({ success: false, message: 'Work is not marked as done yet' });
    }

    const expectedPayOtp = booking.paymentOtp || booking.customerConfirmationOTP || booking.driver_end_otp;
    const submittedPayOtp = otp ? otp.toString().trim() : '';
    if (!expectedPayOtp || !submittedPayOtp || submittedPayOtp !== expectedPayOtp.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Invalid Payment OTP. Please enter the correct code from the farmer.' });
    }

    let grandTotal = 0;
    let vendorEarning = 0;
    let bill = null;

    if (isIndependentWorker) {
      // Independent Worker: No VendorBill — use finalAmount directly
      grandTotal = booking.finalAmount || booking.totalAmount || booking.basePrice || 0;
      vendorEarning = 0; // Platform handles worker earnings separately
    } else {
      // Vendor flow: Use VendorBill as single source of truth
      const VendorBill = require('../../models/VendorBill');
      bill = await VendorBill.findOne({ bookingId: booking._id });
      if (!bill) {
        return res.status(500).json({ success: false, message: 'Bill not found — cannot process payment' });
      }
      grandTotal = bill.grandTotal;
      vendorEarning = bill.vendorTotalEarning;
    }

    // Update Booking Status
    booking.status = BOOKING_STATUS.COMPLETED;
    booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
    booking.paymentMethod = 'cash';
    booking.cashCollected = true;
    booking.cashCollectedBy = 'worker';
    booking.cashCollectorId = workerId;
    booking.cashCollectedAt = new Date();
    booking.completedAt = new Date();
    booking.paymentOtp = undefined;
    await booking.save();

    // Mark bill as paid (only for vendor flow)
    if (bill) {
      bill.status = 'paid';
      bill.paidAt = new Date();
      await bill.save();
    }

    // Update Vendor Wallet (only for vendor flow)
    const Vendor = require('../../models/Vendor');
    if (booking.vendorId && bill) {
      const vendorDoc = await Vendor.findById(booking.vendorId).select('wallet');
      if (vendorDoc) {
        const currentDues = (vendorDoc.wallet.dues || 0) + grandTotal;
        const cashLimit = vendorDoc.wallet.cashLimit || 10000;
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

        await Vendor.findByIdAndUpdate(booking.vendorId, updateQuery);

        // Create Transactions
        const Transaction = require('../../models/Transaction');

        // 1. Cash Collected
        await Transaction.create({
          vendorId: booking.vendorId,
          bookingId: booking._id,
          workerId,
          type: 'cash_collected',
          amount: grandTotal,
          status: 'completed',
          paymentMethod: 'cash',
          description: `Cash ₹${grandTotal} collected by worker for booking #${booking.bookingNumber}`,
          metadata: {
            type: 'dues_increase',
            collectedBy: 'worker',
            billId: bill._id.toString(),
            grandTotal,
            vendorEarning,
            companyRevenue: bill.companyRevenue
          }
        });

        // 2. Earnings Credit
        if (vendorEarning > 0) {
          await Transaction.create({
            vendorId: booking.vendorId,
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
    } else if (booking.workerId && !booking.vendorId) {
      // Independent Worker Cash Collection Logic
      const Worker = require('../../models/Worker');
      const IndWorkerAssignment = require('../../models/IndWorkerAssignment');
      const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
      const Transaction = require('../../models/Transaction');
      
      const commissionRate = booking.commissionRate ?? 10;
      const commissionAmount = booking.commissionAmount ?? Math.round((grandTotal * commissionRate) / 100);
      const workerNetEarning = grandTotal - commissionAmount;

      const workerDoc = await Worker.findById(workerId);
      if (workerDoc) {
        let walletBalance = workerDoc.wallet?.balance || 0;
        if (walletBalance >= commissionAmount) {
          workerDoc.wallet.balance = walletBalance - commissionAmount;
        } else {
          const remainingDue = commissionAmount - walletBalance;
          workerDoc.wallet.balance = 0;
          workerDoc.outstandingDues = (workerDoc.outstandingDues || 0) + remainingDue;
        }
        workerDoc.status = 'ONLINE';
        await workerDoc.save();
      }

      await Transaction.create({
        workerId: workerId,
        bookingId: booking._id,
        amount: grandTotal,
        type: 'cash_collected',
        paymentMethod: 'cash',
        status: 'completed',
        description: `Cash ₹${grandTotal} collected directly from farmer for booking #${booking.bookingNumber || booking._id.toString().slice(-6)}. Platform commission ₹${commissionAmount} applied.`,
        metadata: {
          type: 'cash_collection',
          bookingNumber: booking.bookingNumber,
          grandTotal,
          commissionAmount,
          workerNetEarning
        }
      });

      // Atomically settle linked IndWorkerAssignment
      try {
        const assignment = await IndWorkerAssignment.findOne({
          $or: [{ legacyBookingId: booking._id }, { parentRequestId: booking.workerRequestId, workerId }]
        });
        if (assignment) {
          assignment.settlementStatus = 'SETTLED';
          assignment.completionStatus = 'OTP_VERIFIED';
          assignment.workStatus = 'COMPLETED';
          assignment.settledAt = new Date();
          assignment.workCompletedAt = new Date();
          await assignment.save();

          if (assignment.parentRequestId) {
            const allAssignments = await IndWorkerAssignment.find({
              parentRequestId: assignment.parentRequestId,
              assignmentStatus: { $ne: 'CANCELLED' }
            });
            const allSettled = allAssignments.length > 0 && allAssignments.every(a => a.settlementStatus === 'SETTLED');
            if (allSettled) {
              await WorkerBookingRequest.findByIdAndUpdate(assignment.parentRequestId, { status: 'completed' });
            }
          }
        }
      } catch (assignErr) {
        console.warn('[WorkerBookingController Cash Collection Assignment Settle]', assignErr.message);
      }
    }

    // Notify User
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

    res.status(200).json({
      success: true,
      message: 'Cash collected and job completed',
      data: booking
    });

  } catch (error) {
    console.error('Collect cash error:', error);
    res.status(500).json({ success: false, message: 'Failed to collect cash' });
  }
};

/**
 * Add worker notes to booking
 */
const addWorkerNotes = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const workerId = req.user.id;
    const { id } = req.params;
    const { notes } = req.body;

    const booking = await Booking.findOne({ _id: id, workerId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Update booking
    booking.workerNotes = notes;

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Notes added successfully',
      data: booking
    });
  } catch (error) {
    console.error('Add worker notes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add notes. Please try again.'
    });
  }
};

/**
 * Respond to job (Accept/Reject)
 */
const respondToJob = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { id } = req.params;
    const { status } = req.body; // 'ACCEPTED' or 'REJECTED'

    const BookingRequest = require('../../models/BookingRequest');
    const myRequest = await BookingRequest.findOne({ bookingId: id, workerId });

    let booking = await Booking.findOne({
      _id: id,
      $or: [
        { workerId },
        { notifiedWorkers: workerId },
        { 'potentialWorkers.workerId': workerId },
        ...(myRequest ? [{ _id: id }] : [])
      ]
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Idempotency check: If already in desired state, return success without re-notifying
    if (status === 'ACCEPTED' && booking.workerResponse === 'ACCEPTED') {
      return res.status(200).json({ success: true, message: 'Job already accepted', data: booking });
    }

    if (status === 'REJECTED' && booking.workerResponse === 'REJECTED') {
      return res.status(200).json({ success: true, message: 'Job already rejected', data: booking });
    }

    if (status === 'ACCEPTED') {
      booking.status = BOOKING_STATUS.ASSIGNED;
      booking.workerAcceptedAt = new Date();
      booking.workerResponse = 'ACCEPTED';

      const { createNotification } = require('../notificationControllers/notificationController');

      // Notify Vendor
      await createNotification({
        vendorId: booking.vendorId,
        type: 'job_accepted',
        title: 'Worker Accepted Job',
        message: `Worker has accepted job ${booking.bookingNumber}`,
        relatedId: booking._id,
        relatedType: 'booking'
      });

      // Notify User
      await createNotification({
        userId: booking.userId,
        type: 'worker_accepted',
        title: 'Worker Confirmed',
        message: 'The assigned professional has accepted your booking.',
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high',
        pushData: { type: 'worker_accepted', bookingId: booking._id.toString(), link: `/user/booking/${booking._id}` }
      });

    } else if (status === 'REJECTED') {
      booking.workerId = null;
      booking.status = BOOKING_STATUS.CONFIRMED; // Revert to unassigned state

      const { createNotification } = require('../notificationControllers/notificationController');
      await createNotification({
        vendorId: booking.vendorId,
        type: 'job_rejected',
        title: 'Worker Declined Job',
        message: `Worker declined job ${booking.bookingNumber}`,
        relatedId: booking._id,
        relatedType: 'booking'
      });
    }

    await booking.save();
    res.status(200).json({ success: true, message: `Job ${status.toLowerCase()}`, data: booking });

  } catch (error) {
    console.error('Respond job error:', error);
    res.status(500).json({ success: false, message: 'Failed to respond to job' });
  }
};

/**
 * Start Machinery Work (For Drivers)
 * Requires Start OTP from Farmer + KM/Meter Photo
 */
const startMachineryWork = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { id } = req.params;
    const { otp, startKmPhoto } = req.body;

    const booking = await Booking.findOne({ _id: id, workerId }).select('+driver_start_otp');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const expectedStartOtp = booking.driver_start_otp || booking.visitOtp;
    const submittedStartOtp = otp ? otp.toString().trim() : '';
    if (!expectedStartOtp || !submittedStartOtp || submittedStartOtp !== expectedStartOtp.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Invalid Start OTP. Please ask farmer for correct OTP.' });
    }

    booking.status = BOOKING_STATUS.IN_PROGRESS;
    booking.startedAt = new Date();
    booking.start_kilometer_photo = startKmPhoto || null;
    booking.driver_start_otp = undefined; // Clear OTP after use

    await booking.save();

    // Notify Farmer
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'work_started',
      title: 'Machinery Work Started',
      message: `The driver has started the work for ${booking.serviceId?.title}. Track progress in your dashboard.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high'
    });

    res.status(200).json({ success: true, message: 'Work started successfully', data: booking });
  } catch (error) {
    console.error('Start machinery work error:', error);
    res.status(500).json({ success: false, message: 'Failed to start machinery work' });
  }
};

/**
 * Complete Machinery Work (For Drivers)
 * Requires Finish KM/Meter Photo - Generates End OTP for Farmer
 */
const completeMachineryWork = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { id } = req.params;
    const { endKmPhoto } = req.body;

    const booking = await Booking.findOne({ _id: id, workerId });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Generate End-Work OTP for Farmer to confirm completion
    const endOtp = Math.floor(1000 + Math.random() * 9000).toString();

    booking.status = BOOKING_STATUS.WORK_DONE;
    booking.end_kilometer_photo = endKmPhoto || null;
    booking.driver_end_otp = endOtp;

    await booking.save();

    // Notify Farmer with End OTP
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'work_completed',
      title: 'Machinery Work Finished',
      message: `Machinery work is done. Please verify and share the Finish OTP: ${endOtp} with the driver only if satisfied.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high'
    });

    res.status(200).json({ success: true, message: 'Work marked as finished. Finish OTP sent to farmer.', data: booking });
  } catch (error) {
    console.error('Complete machinery work error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete machinery work' });
  }
};

module.exports = {
  getAssignedJobs,
  getJobById,
  acceptJob,
  updateJobStatus,
  startJob,
  workerReachedLocation,
  verifyVisit,
  completeJob,
  collectCash,
  addWorkerNotes,
  respondToJob,
  startMachineryWork,
  completeMachineryWork
};

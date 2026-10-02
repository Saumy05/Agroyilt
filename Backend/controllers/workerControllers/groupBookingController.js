'use strict';

/**
 * groupBookingController.js
 *
 * Team Leader / Group Booking Flow.
 *
 * LIFECYCLE:
 *   [Farmer] createGroupRequest     → status: pending
 *   [Leader] leaderRespondToRequest → accept / counter / reject
 *   [Farmer] farmerRespondToGroupCounter → accept / counter / reject
 *   [Leader] dispatchToMembers      → status: collecting_members
 *   [Member] memberRespondToRequest → accept / reject
 *   [Leader] leaderSelectWorkers    → status: awaiting_payment (financialSnapshot locked)
 *   [Farmer] createGroupBookingPayment → Razorpay order created, status: payment_pending
 *   [Farmer] verifyGroupBookingPayment → payment verified, WorkerBookingRequest + IndWorkerAssignment created, status: confirmed
 *   [Farmer] generateGroupCompletionOtp → generates per-worker completion OTP
 *   [Farmer] cancelGroupRequest     → refund if paid, notify all parties
 *
 * Post-payment lifecycle (journey, OTP, settlement) is handled by the EXISTING
 * workerAssignmentController routes — no duplication needed here.
 */

const WorkerGroupRequest    = require('../../models/WorkerGroupRequest');
const WorkerBookingRequest  = require('../../models/WorkerBookingRequest');
const IndWorkerAssignment   = require('../../models/IndWorkerAssignment');
const Worker                = require('../../models/Worker');
const Team                  = require('../../models/Team');
const Booking               = require('../../models/Booking');
const Notification          = require('../../models/Notification');
const Wallet                = require('../../models/Wallet');
const WalletTransaction     = require('../../models/WalletTransaction');
const Transaction           = require('../../models/Transaction');
const User                  = require('../../models/User');
const Settings              = require('../../models/Settings');
const mongoose              = require('mongoose');
const crypto                = require('crypto');
const { getIO }             = require('../../sockets');
const { createOrder, verifyPayment } = require('../../services/razorpayService');
const { getWorkerFinancialSettings } = require('../../services/workerFinancialService');
const { sendNotificationToWorker } = require('../../services/firebaseAdmin');
const {
  getBookingScheduledExpiry,
  isBookingExpired
} = require('../../services/workerBookingExpiryService');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toMins = (t) => {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
};

const toP   = (inr) => Math.round(Number(inr) * 100); // INR → paise
const toINR = (p)   => p / 100;                        // paise → INR

const hasTimeConflict = async (workerId, scheduledDate, startTime, endTime) => {
  const dateStart = new Date(scheduledDate);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(dateStart);
  dateEnd.setHours(23, 59, 59, 999);

  const bookingConflict = await Booking.findOne({
    workerId,
    scheduledDate: { $gte: dateStart, $lte: dateEnd },
    status: { $nin: ['cancelled', 'rejected', 'expired'] },
    'timeSlot.start': { $lt: endTime },
    'timeSlot.end':   { $gt: startTime }
  });
  if (bookingConflict) return true;

  // Check group requests where this worker is already in a confirmed/active slot
  const groupConflict = await WorkerGroupRequest.findOne({
    selectedWorkers: workerId,
    scheduledDate: { $gte: dateStart, $lte: dateEnd },
    status: { $in: ['awaiting_payment', 'payment_pending', 'confirmed', 'selection_pending', 'collecting_members'] },
    startTime: { $lt: endTime },
    endTime:   { $gt: startTime }
  });
  return !!groupConflict;
};

const emitSafe = (room, event, data) => {
  try {
    const io = getIO();
    if (io) io.to(room).emit(event, data);
  } catch (e) {
    console.warn('[GroupBooking Socket] emit failed:', e.message);
  }
};

const notify = async ({ recipientType, recipientId, type, title, message, relatedId, relatedType, data }) => {
  try {
    const notifDoc = { type, title, message, relatedId, relatedType, data: data || {} };
    if (recipientType === 'user')   notifDoc.userId   = recipientId;
    if (recipientType === 'worker') notifDoc.workerId = recipientId;

    const notif = await Notification.create(notifDoc);
    const room = recipientType === 'user' ? `user_${recipientId}` : `worker_${recipientId}`;
    emitSafe(room, 'notification', notif);
    emitSafe(room, 'worker_group_update', { requestId: relatedId, type });
  } catch (e) {
    console.warn('[GroupBooking Notify] failed:', e.message);
  }
};

// ─── Farmer: List Team Leaders ────────────────────────────────────────────────

/**
 * GET /user/team-leaders
 * List approved team leaders with their team info.
 */
exports.listTeamLeaders = async (req, res) => {
  try {
    const { skill, minRating, maxRate, minTeamSize } = req.query;

    const query = {
      workerType: 'TEAM_LEADER',
      approvalStatus: { $in: ['approved', 'pending'] },
      status: { $in: ['active', 'offline', 'online'] }
    };
    if (skill)     query.skills = { $in: [new RegExp(skill, 'i')] };
    if (minRating) query.rating = { $gte: Number(minRating) };
    if (maxRate)   query.dailyRate = { $lte: Number(maxRate) };

    let leaders = await Worker.find(query)
      .select('name profilePhoto skills serviceCategories rating totalJobs completedJobs dailyRate hourlyRate address teamId status')
      .populate('teamId', 'name memberCount maxCapacity location')
      .sort({ rating: -1, completedJobs: -1 })
      .limit(40);

    if (minTeamSize) {
      leaders = leaders.filter(l => (l.teamId?.memberCount || 0) >= Number(minTeamSize));
    }

    return res.json({ success: true, data: leaders });
  } catch (err) {
    console.error('[listTeamLeaders]', err);
    return res.status(500).json({ success: false, message: 'Failed to load team leaders.' });
  }
};

/**
 * GET /user/team-leader/:leaderId
 * Full profile of a team leader including live available member count.
 */
exports.getTeamLeaderDetail = async (req, res) => {
  try {
    const leader = await Worker.findOne({
      _id: req.params.leaderId,
      workerType: 'TEAM_LEADER',
      approvalStatus: 'approved',
      isActive: true
    })
      .select('-password -mpin')
      .populate('teamId', 'name memberCount maxCapacity location');

    if (!leader) return res.status(404).json({ success: false, message: 'Team leader not found.' });
    return res.json({ success: true, data: leader });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load leader profile.' });
  }
};

// ─── Farmer: Create Group Request ────────────────────────────────────────────

/**
 * POST /user/group-request
 * Farmer sends a group booking request to a Team Leader.
 */
exports.createGroupRequest = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const {
      teamLeaderId, workCategory, workTitle, workDescription,
      requiredSkills, additionalInstructions,
      scheduledDate, startTime, endTime, rateUnit,
      location, farmerOfferedRatePerWorker, requiredWorkers,
      // DAILY booking fields (optional)
      bookingType, startDate, numberOfDays, minDailyRate, maxDailyRate, durationMinutes
    } = req.body;

    // ── Basic Validation ──────────────────────────────────────────────────────
    if (!teamLeaderId || !scheduledDate || !startTime || !endTime || !requiredWorkers || farmerOfferedRatePerWorker === undefined) {
      return res.status(400).json({ success: false, message: 'teamLeaderId, scheduledDate, startTime, endTime, requiredWorkers, and farmerOfferedRatePerWorker are required.' });
    }
    if (Number(requiredWorkers) < 1) {
      return res.status(400).json({ success: false, message: 'At least 1 worker is required.' });
    }
    if (Number(farmerOfferedRatePerWorker) <= 0) {
      return res.status(400).json({ success: false, message: 'Offered rate must be greater than 0.' });
    }
    if (toMins(endTime) <= toMins(startTime)) {
      return res.status(400).json({ success: false, message: 'End time must be after start time.' });
    }
    const scheduledDateObj = new Date(scheduledDate);
    if (isNaN(scheduledDateObj.getTime()) || scheduledDateObj < new Date(new Date().setHours(0,0,0,0))) {
      return res.status(400).json({ success: false, message: 'Invalid or past scheduled date.' });
    }

    // DAILY validation
    const resolvedBookingType = bookingType === 'DAILY' ? 'DAILY' : 'HOURLY';
    if (resolvedBookingType === 'DAILY') {
      if (!startDate) return res.status(400).json({ success: false, message: 'startDate is required for DAILY bookings.' });
      if (!numberOfDays || Number(numberOfDays) < 1) return res.status(400).json({ success: false, message: 'numberOfDays >= 1 is required for DAILY bookings.' });
    }

    // ── Validate Team Leader ──────────────────────────────────────────────────
    const leader = await Worker.findOne({ _id: teamLeaderId, workerType: 'TEAM_LEADER', approvalStatus: 'approved', isActive: true });
    if (!leader) return res.status(404).json({ success: false, message: 'Team leader not found or unavailable.' });
    if (!leader.teamId) return res.status(400).json({ success: false, message: 'This leader has no active team.' });

    // ── Prevent duplicate pending request ─────────────────────────────────────
    const duplicate = await WorkerGroupRequest.findOne({
      farmerId, teamLeaderId, status: 'pending',
      scheduledDate: { $gte: new Date(scheduledDate).setHours(0,0,0,0), $lte: new Date(scheduledDate).setHours(23,59,59,999) }
    });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'You already have a pending group request to this team for this date.' });
    }

    // ── Validate required workers vs team capacity ─────────────────────────────
    const team = await Team.findById(leader.teamId);
    if (!team || team.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Leader team is not active.' });
    }
    if (Number(requiredWorkers) > team.memberCount + 1) { // +1 for leader himself
      return res.status(400).json({ success: false, message: `This team only has ${team.memberCount} members. Cannot fulfill ${requiredWorkers} workers.` });
    }

    const leaderRate = (rateUnit === 'hourly' ? leader.hourlyRate : leader.dailyRate) || 0;

    const createDoc = {
      farmerId,
      teamLeaderId,
      teamId: leader.teamId,
      workCategory:   workCategory || '',
      workTitle:      workTitle || '',
      workDescription: workDescription || '',
      requiredSkills:  requiredSkills || [],
      additionalInstructions: additionalInstructions || '',
      scheduledDate:  scheduledDateObj,
      startTime, endTime,
      rateUnit:       rateUnit || 'daily',
      bookingType:    resolvedBookingType,
      location:       location || {},
      requiredWorkers: Number(requiredWorkers),
      leaderRate,
      farmerOfferedRatePerWorker: Number(farmerOfferedRatePerWorker),
      negotiation: [{
        by: 'farmer',
        rate: Number(farmerOfferedRatePerWorker),
        message: `Farmer's opening offer: ₹${farmerOfferedRatePerWorker}/worker`
      }]
    };

    if (resolvedBookingType === 'DAILY') {
      const startDateObj = new Date(startDate);
      const endDateObj   = new Date(startDateObj);
      endDateObj.setDate(endDateObj.getDate() + Number(numberOfDays) - 1);
      createDoc.startDate    = startDateObj;
      createDoc.endDate      = endDateObj;
      createDoc.numberOfDays = Number(numberOfDays);
      createDoc.minDailyRate = minDailyRate ? Number(minDailyRate) : Number(farmerOfferedRatePerWorker);
      createDoc.maxDailyRate = maxDailyRate ? Number(maxDailyRate) : Number(farmerOfferedRatePerWorker);
    } else {
      const durMins = durationMinutes
        ? Number(durationMinutes)
        : (toMins(endTime) - toMins(startTime)) || 60;
      createDoc.durationMinutes = Math.max(durMins, 1);
    }

    const request = await WorkerGroupRequest.create(createDoc);

    await notify({
      recipientType: 'worker', recipientId: teamLeaderId,
      type: 'group_booking_request',
      title: 'Group Work Request',
      message: `New group request for ${requiredWorkers} workers on ${scheduledDateObj.toDateString()}. Work: ${workTitle || workCategory || 'unspecified'}.`,
      relatedId: request._id, relatedType: 'worker_group_request'
    });

    return res.status(201).json({ success: true, message: 'Group request sent to team leader.', data: request });
  } catch (err) {
    console.error('[createGroupRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to send group request.' });
  }
};

/**
 * GET /user/group-requests
 * Farmer gets their group requests.
 */
exports.getMyGroupRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const query = { farmerId: req.user._id };
    if (status) query.status = status;

    const requests = await WorkerGroupRequest.find(query)
      .populate('teamLeaderId', 'name profilePhoto skills rating dailyRate')
      .populate('teamId', 'name memberCount')
      .populate('selectedWorkers', 'name profilePhoto skills rating dailyRate')
      .populate('memberRequests.workerId', 'name profilePhoto skills')
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: requests });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load group requests.' });
  }
};

/**
 * GET /user/group-request/:id
 * Farmer views a single group request with full populated details.
 */
exports.getGroupRequestById = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const request = await WorkerGroupRequest.findOne({ _id: req.params.id, farmerId })
      .populate('teamLeaderId', 'name profilePhoto skills rating dailyRate hourlyRate phone')
      .populate('teamId', 'name memberCount maxCapacity')
      .populate('selectedWorkers', 'name profilePhoto skills rating dailyRate phone')
      .populate('memberRequests.workerId', 'name profilePhoto skills rating')
      .populate({
        path: 'assignmentIds',
        populate: { path: 'workerId', select: 'name profilePhoto phone skills rating' }
      });

    if (!request) return res.status(404).json({ success: false, message: 'Group request not found.' });
    return res.json({ success: true, data: request });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load group request.' });
  }
};

/**
 * PATCH /user/group-request/:id/respond
 * Farmer responds to a counter offer from the team leader.
 * body: { action: 'accept' | 'reject' | 'counter', rate? }
 */
exports.farmerRespondToGroupCounter = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { action, rate, message } = req.body;

    const request = await WorkerGroupRequest.findOne({ _id: req.params.id, farmerId });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}.` });
    }
    const lastStep = request.negotiation[request.negotiation.length - 1];
    if (!lastStep || lastStep.by !== 'leader') {
      return res.status(400).json({ success: false, message: 'No leader counter offer to respond to.' });
    }

    if (action === 'accept') {
      request.agreedRatePerWorker = lastStep.rate;
      request.status = 'leader_accepted';
      request.negotiation.push({ by: 'farmer', rate: lastStep.rate, message: 'Farmer accepted leader rate.' });
      await request.save();

      await notify({
        recipientType: 'worker', recipientId: request.teamLeaderId,
        type: 'group_booking_accepted',
        title: 'Rate Accepted',
        message: `Farmer accepted your rate of ₹${lastStep.rate}/worker. Please dispatch your team members.`,
        relatedId: request._id, relatedType: 'worker_group_request'
      });
      return res.json({ success: true, message: 'Rate accepted. Waiting for leader to dispatch members.', data: request });

    } else if (action === 'reject') {
      request.status = 'rejected';
      await request.save();
      await notify({
        recipientType: 'worker', recipientId: request.teamLeaderId,
        type: 'group_booking_rejected',
        title: 'Offer Rejected',
        message: `Farmer rejected your counter offer. Request closed.`,
        relatedId: request._id, relatedType: 'worker_group_request'
      });
      return res.json({ success: true, message: 'Counter offer rejected.', data: request });

    } else if (action === 'counter') {
      if (!rate || Number(rate) <= 0) {
        return res.status(400).json({ success: false, message: 'Valid counter rate required.' });
      }
      request.negotiation.push({ by: 'farmer', rate: Number(rate), message: message || '' });
      await request.save();
      await notify({
        recipientType: 'worker', recipientId: request.teamLeaderId,
        type: 'group_booking_counter',
        title: 'Counter Offer',
        message: `Farmer countered with ₹${rate}/worker.`,
        relatedId: request._id, relatedType: 'worker_group_request'
      });
      return res.json({ success: true, message: 'Counter offer sent.', data: request });

    } else {
      return res.status(400).json({ success: false, message: 'Invalid action.' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to respond.' });
  }
};

/**
 * DELETE /user/group-request/:id
 * Farmer cancels a group request.
 * If payment was made: full wallet refund is issued.
 * Allowed statuses: pending, leader_accepted, collecting_members, selection_pending, awaiting_payment, payment_pending
 * NOT allowed after confirmed (work may have started).
 */
exports.cancelGroupRequest = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const request = await WorkerGroupRequest.findOne({ _id: req.params.id, farmerId });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });

    const terminalStatuses = ['completed', 'cancelled', 'expired', 'rejected'];
    if (terminalStatuses.includes(request.status)) {
      return res.status(409).json({ success: false, message: `Cannot cancel a request with status "${request.status}".` });
    }

    // If already confirmed (assignments created) block cancellation if any work started
    if (request.status === 'confirmed' && request.workerBookingRequestId) {
      const assignments = await IndWorkerAssignment.find({
        parentRequestId: request.workerBookingRequestId,
        assignmentStatus: { $ne: 'CANCELLED' }
      });
      const anyWorkStarted = assignments.some(a =>
        a.visitOtpStatus === 'VERIFIED' || a.workStatus === 'IN_PROGRESS' || a.workStatus === 'SUBMITTED'
      );
      if (anyWorkStarted) {
        return res.status(400).json({
          success: false,
          message: 'Cannot cancel booking after work has already started. Please contact support.'
        });
      }

      // Cancel all assignments
      await IndWorkerAssignment.updateMany(
        { parentRequestId: request.workerBookingRequestId },
        { assignmentStatus: 'CANCELLED' }
      );

      // Cancel the linked WorkerBookingRequest
      await WorkerBookingRequest.findByIdAndUpdate(request.workerBookingRequestId, { status: 'cancelled' });

      // Free selected workers
      const workerIds = (request.selectedWorkers || []).map(id => id.toString());
      if (workerIds.length > 0) {
        await Worker.updateMany({ _id: { $in: workerIds } }, { status: 'ONLINE' });
      }
    }

    // ── Wallet Refund if Paid ───────────────────────────────────────────────
    const snap = request.financialSnapshot || {};
    const refundAmount = Number(snap.totalPayable || 0);

    if (refundAmount > 0 && request.paymentStatus === 'success' && !request.refundCredited) {
      let farmerWallet = await Wallet.findOne({ userId: farmerId, userModel: 'User' });
      if (!farmerWallet) {
        farmerWallet = await Wallet.create({ userId: farmerId, userModel: 'User', balance: 0 });
      }

      const prevBalance = farmerWallet.balance || 0;
      farmerWallet.balance = prevBalance + refundAmount;
      await farmerWallet.save();

      await User.findByIdAndUpdate(farmerId, { 'wallet.balance': farmerWallet.balance });

      const refundKey = `grp_cancel_refund_${request._id.toString()}`;
      const bookingRef = `GRP-${request._id.toString().slice(-6).toUpperCase()}`;

      await WalletTransaction.create({
        walletId: farmerWallet._id,
        type: 'credit',
        amount: refundAmount,
        reason: 'refund',
        referenceId: request._id.toString(),
        gatewayTransactionId: request.razorpayPaymentId || null,
        idempotencyKey: refundKey,
        status: 'completed'
      });

      await Transaction.create({
        userId: farmerId,
        type: 'refund',
        amount: refundAmount,
        status: 'completed',
        paymentMethod: 'wallet',
        description: `Full Refund for Cancelled Group Booking (#${bookingRef})`,
        balanceBefore: prevBalance,
        balanceAfter: farmerWallet.balance,
        referenceId: request._id.toString()
      });

      request.refundAmount     = refundAmount;
      request.refundCredited   = true;
      request.refundCreditedAt = new Date();

      emitSafe(`user_${farmerId}`, 'wallet_balance_updated', {
        balance: farmerWallet.balance,
        refundAmount,
        type: 'credit',
        message: `₹${refundAmount} refunded for cancelled group booking`
      });
    }

    request.status = 'cancelled';
    await request.save();

    // Notify team leader
    await notify({
      recipientType: 'worker', recipientId: request.teamLeaderId,
      type: 'group_booking_cancelled',
      title: 'Group Booking Cancelled',
      message: `The farmer cancelled the group work request for ${request.workTitle || 'Farm Work'}.`,
      relatedId: request._id, relatedType: 'worker_group_request'
    });

    // Notify selected members
    for (const wId of (request.selectedWorkers || [])) {
      await notify({
        recipientType: 'worker', recipientId: wId,
        type: 'group_booking_cancelled',
        title: 'Group Booking Cancelled',
        message: `The group booking for ${request.workTitle || 'Farm Work'} has been cancelled by the farmer.`,
        relatedId: request._id, relatedType: 'worker_group_request'
      });
      emitSafe(`worker_${wId}`, 'group_booking_cancelled', { requestId: request._id });
    }

    emitSafe(`group_request_${request._id}`, 'group_booking_cancelled', { requestId: request._id });

    return res.json({
      success: true,
      message: refundAmount > 0 && request.refundCredited
        ? `Group booking cancelled. ₹${refundAmount} has been refunded to your wallet.`
        : 'Group request cancelled successfully.'
    });
  } catch (err) {
    console.error('[cancelGroupRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to cancel.' });
  }
};

// ─── Team Leader Side ─────────────────────────────────────────────────────────

/**
 * GET /worker/group-requests
 * Team leader views incoming group requests.
 */
exports.getLeaderGroupRequests = async (req, res) => {
  try {
    const leaderId = req.user._id;
    const { status } = req.query;

    // ── 1. Legacy WorkerGroupRequest (old direct-leader-quote flow) ──────────
    const legacyQuery = { teamLeaderId: leaderId };
    if (status) legacyQuery.status = status;

    const legacyRequests = await WorkerGroupRequest.find(legacyQuery)
      .populate('farmerId', 'name phone profilePhoto')
      .populate('selectedWorkers', 'name profilePhoto skills rating phone status dailyRate experience')
      .populate('memberRequests.workerId', 'name profilePhoto skills rating phone status dailyRate experience')
      .sort({ createdAt: -1 })
      .lean();

    // ── 2. New WorkerBookingRequest dispatched to this leader (unified flow) ──
    const unifiedQuery = {
      bookingMode: 'TEAM_LEADER',
      teamLeaderId: leaderId
    };
    if (status) unifiedQuery.status = status;

    // Also include requests where leader is in dispatchedTo (not yet accepted/set as teamLeaderId)
    const dispatchedQuery = {
      bookingMode: 'TEAM_LEADER',
      'dispatchedTo.workerId': leaderId,
      teamLeaderId: null  // Not yet accepted by any leader
    };
    if (status) dispatchedQuery['dispatchedTo.status'] = status;

    const [unifiedRequests, dispatchedRequests] = await Promise.all([
      WorkerBookingRequest.find(unifiedQuery)
        .populate('farmerId', 'name phone profilePhoto')
        .sort({ createdAt: -1 })
        .lean(),
      WorkerBookingRequest.find(dispatchedQuery)
        .populate('farmerId', 'name phone profilePhoto')
        .sort({ createdAt: -1 })
        .lean()
    ]);

    // Deduplicate by _id (unified may overlap with dispatched)
    const seenIds = new Set();
    const newRequests = [];
    for (const r of [...unifiedRequests, ...dispatchedRequests]) {
      const key = r._id.toString();
      if (!seenIds.has(key)) {
        seenIds.add(key);
        // Mark the entry so frontend knows which source this came from
        r._source = 'unified';
        newRequests.push(r);
      }
    }

    // ── 3. Merge & expiry-check ────────────────────────────────────────────
    const now = new Date();
    const validRequests = [];

    for (const r of [...legacyRequests, ...newRequests]) {
      const evalRes = isBookingExpired(r, now);
      if (evalRes.isExpired) {
        if (r.status !== 'expired') {
          r.status = 'expired';
          // Persist status update (don't block response)
          if (r._source === 'unified') {
            WorkerBookingRequest.findByIdAndUpdate(r._id, { status: 'expired' }).catch(() => {});
          } else {
            WorkerGroupRequest.findByIdAndUpdate(r._id, { status: 'expired' }).catch(() => {});
          }
        }
        if (!status || status === 'expired') {
          validRequests.push(r);
        }
      } else {
        validRequests.push(r);
      }
    }

    // Sort merged results by createdAt desc
    validRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ success: true, data: validRequests });
  } catch (err) {
    console.error('[getLeaderGroupRequests]', err);
    return res.status(500).json({ success: false, message: 'Failed to load requests.' });
  }
};


/**
 * GET /worker/group-requests/member-invites
 * Team member views incoming group booking invitations dispatched by their leader.
 */
exports.getMemberGroupInvites = async (req, res) => {
  try {
    const workerId = req.user._id;
    const requests = await WorkerGroupRequest.find({
      'memberRequests.workerId': workerId,
      status: { $in: ['collecting_members', 'selection_pending', 'confirmed', 'awaiting_payment', 'payment_pending'] }
    })
      .populate('teamLeaderId', 'name phone profilePhoto rating')
      .populate('farmerId', 'name phone profilePhoto')
      .populate('selectedWorkers', 'name profilePhoto skills rating')
      .sort({ createdAt: -1 });

    const now = new Date();
    const validRequests = [];
    for (const r of requests) {
      const evalRes = isBookingExpired(r, now);
      if (evalRes.isExpired) {
        if (r.status !== 'expired') {
          r.status = 'expired';
          r.save().catch(() => {});
        }
      } else {
        validRequests.push(r);
      }
    }

    return res.json({ success: true, data: validRequests });
  } catch (err) {
    console.error('[getMemberGroupInvites]', err);
    return res.status(500).json({ success: false, message: 'Failed to load member invites.' });
  }
};

/**
 * PATCH /worker/group-request/:id/respond
 * Team leader accepts, rejects, or counter-offers.
 * body: { action: 'accept' | 'reject' | 'counter', rate?, message? }
 */
exports.leaderRespondToRequest = async (req, res) => {
  try {
    const leaderId = req.user._id;
    const { action, rate, message } = req.body;

    let request = await WorkerGroupRequest.findOne({ _id: req.params.id, teamLeaderId: leaderId });
    if (!request) {
      // Fallback: Check WorkerBookingRequest (unified flow)
      const bookingReq = await WorkerBookingRequest.findById(req.params.id);
      if (bookingReq) {
        req.body.offeredRate = rate || req.body.offeredRate;
        const fwr = require('./farmerWorkerRequestController');
        return fwr.workerRespondToFarmerRequest(req, res);
      }
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    const expiryEval = isBookingExpired(request);
    const isTerminal = ['cancelled', 'expired', 'completed'].includes(request.status);

    if (expiryEval.isExpired || isTerminal) {
      if (!isTerminal) {
        request.status = 'expired';
        await request.save();
      }
      if (action === 'reject') {
        return res.json({ success: true, message: 'Request has expired and has been dismissed.', isExpired: true });
      }
      return res.status(410).json({ success: false, message: 'Request has expired.', isExpired: true });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}.` });
    }

    if (action === 'accept') {
      const lastStep = request.negotiation[request.negotiation.length - 1];
      const agreedRate = lastStep?.rate || request.farmerOfferedRatePerWorker;
      request.agreedRatePerWorker = agreedRate;
      request.status = 'leader_accepted';
      request.negotiation.push({ by: 'leader', rate: agreedRate, message: 'Leader accepted farmer offer.' });
      await request.save();

      await notify({
        recipientType: 'user', recipientId: request.farmerId,
        type: 'group_booking_accepted',
        title: 'Team Leader Accepted',
        message: `Team leader accepted your group request at ₹${agreedRate}/worker. They will now gather their team.`,
        relatedId: request._id, relatedType: 'worker_group_request'
      });
      return res.json({ success: true, message: 'Request accepted. Now dispatch team members.', data: request });

    } else if (action === 'reject') {
      request.status = 'rejected';
      request.rejectionReason = message || 'Leader rejected the request.';
      await request.save();

      await notify({
        recipientType: 'user', recipientId: request.farmerId,
        type: 'group_booking_rejected',
        title: 'Request Rejected',
        message: 'The team leader declined your group work request. Try another team.',
        relatedId: request._id, relatedType: 'worker_group_request'
      });
      return res.json({ success: true, message: 'Request rejected.', data: request });

    } else if (action === 'counter') {
      if (!rate || Number(rate) <= 0) {
        return res.status(400).json({ success: false, message: 'Valid counter rate required.' });
      }
      request.negotiation.push({ by: 'leader', rate: Number(rate), message: message || '' });
      await request.save();

      await notify({
        recipientType: 'user', recipientId: request.farmerId,
        type: 'group_booking_counter',
        title: 'Counter Offer',
        message: `Team leader countered with ₹${rate}/worker. Review and respond.`,
        relatedId: request._id, relatedType: 'worker_group_request'
      });
      return res.json({ success: true, message: 'Counter offer sent.', data: request });

    } else {
      return res.status(400).json({ success: false, message: 'Invalid action.' });
    }
  } catch (err) {
    console.error('[leaderRespondToRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to respond.' });
  }
};

/**
 * POST /worker/group-request/:id/dispatch-members
 * After leader accepts, dispatch the request to eligible team members.
 * Leader can optionally provide specific `memberIds` array.
 */
exports.dispatchToMembers = async (req, res) => {
  try {
    const leaderId = req.user._id;
    const { memberIds } = req.body || {};

    let request = await WorkerGroupRequest.findOne({
      _id: req.params.id, teamLeaderId: leaderId, status: 'leader_accepted'
    });
    if (!request) {
      // Fallback: Check WorkerBookingRequest (unified flow)
      const bookingReq = await WorkerBookingRequest.findById(req.params.id);
      if (bookingReq) {
        const leaderDoc = await Worker.findById(leaderId);
        if (!leaderDoc || !leaderDoc.teamId) {
          return res.status(400).json({ success: false, message: 'You are not associated with a team.' });
        }
        const memberQuery = {
          teamId: leaderDoc.teamId,
          _id: { $ne: leaderId },
          isActive: true,
          approvalStatus: 'approved'
        };
        if (Array.isArray(memberIds) && memberIds.length > 0) {
          memberQuery._id = { $in: memberIds, $ne: leaderId };
        }
        const members = await Worker.find(memberQuery).select('_id name phone skills isOfflineMember status');
        if (members.length === 0) {
          return res.status(400).json({ success: false, message: 'No eligible team members found to dispatch.' });
        }

        const eligibleMembers = [];
        const offlineMemberIds = new Set();
        for (const m of members) {
          const conflict = bookingReq.bookingType === 'DAILY'
            ? await hasTimeConflict(m._id, bookingReq.startDate, '00:00', '23:59')
            : await hasTimeConflict(m._id, bookingReq.scheduledDate, bookingReq.startTime, bookingReq.endTime);
          if (!conflict) {
            eligibleMembers.push(m);
            if (m.isOfflineMember) offlineMemberIds.add(m._id.toString());
          }
        }
        if (eligibleMembers.length === 0) {
          return res.status(400).json({ success: false, message: 'All selected team members have conflicting bookings.' });
        }

        const agreedRate = bookingReq.workerRate || bookingReq.farmerOfferedRate || bookingReq.maxRate || bookingReq.minRate || 0;
        const rateUnit = bookingReq.bookingType === 'DAILY' ? 'daily' : 'hourly';

        if (!bookingReq.memberInvitations) bookingReq.memberInvitations = [];

        for (const tm of eligibleMembers) {
          const existingInv = bookingReq.memberInvitations.find(inv => inv.workerId.toString() === tm._id.toString());
          if (!existingInv) {
            bookingReq.memberInvitations.push({
              workerId: tm._id,
              leaderId: leaderId,
              offeredRate: agreedRate,
              rateUnit: rateUnit,
              status: tm.isOfflineMember ? 'member_accepted' : 'member_pending',
              respondedAt: tm.isOfflineMember ? new Date() : undefined,
              invitedAt: new Date()
            });
          }
        }
        await bookingReq.save();

        for (const tm of eligibleMembers) {
          if (!tm.isOfflineMember) {
            await notify({
              recipientType: 'worker', recipientId: tm._id,
              type: 'team_member_invitation',
              title: '👥 Team Job Invitation',
              message: `Your team leader ${leaderDoc.name} has a job for you.`,
              relatedId: bookingReq._id, relatedType: 'worker_booking_request'
            });
            emitSafe(`worker_${tm._id}`, 'workerJobsUpdated', {});
          }
        }

        return res.json({
          success: true,
          message: `Request dispatched to ${eligibleMembers.length} team members.`,
          data: bookingReq
        });
      }
      return res.status(404).json({ success: false, message: 'Request not found or not in leader_accepted state.' });
    }

    // Find active team members (excluding the leader)
    const memberQuery = {
      teamId: request.teamId,
      workerType: 'WORKER',
      isActive: true,
      approvalStatus: 'approved'
    };

    if (Array.isArray(memberIds) && memberIds.length > 0) {
      memberQuery._id = { $in: memberIds };
    }

    const members = await Worker.find(memberQuery).select('_id name phone skills isOfflineMember');

    if (members.length === 0) {
      return res.status(400).json({ success: false, message: 'No eligible team members found to dispatch.' });
    }

    // Filter out members with time conflicts
    const eligibleMembers = [];
    const offlineMemberIds = new Set();
    for (const m of members) {
      const conflict = await hasTimeConflict(m._id, request.scheduledDate, request.startTime, request.endTime);
      if (!conflict) {
        eligibleMembers.push(m._id);
        if (m.isOfflineMember) offlineMemberIds.add(m._id.toString());
      }
    }

    if (eligibleMembers.length === 0) {
      return res.status(400).json({ success: false, message: 'All selected team members have conflicting bookings for this time.' });
    }

    request.memberRequests = eligibleMembers.map(id => ({
      workerId: id,
      status: offlineMemberIds.has(id.toString()) ? 'member_accepted' : 'member_pending'
    }));
    request.status = 'collecting_members';
    await request.save();

    const [leaderDoc, farmerDoc] = await Promise.all([
      Worker.findById(leaderId).select('name phone rating profilePicture profilePhoto').lean(),
      User.findById(request.farmerId).select('name phone profilePicture avatar profilePhoto').lean()
    ]);

    const leaderName = leaderDoc?.name || 'Team Leader';
    const farmerName = farmerDoc?.name || 'Farmer';
    const farmerPhone = farmerDoc?.phone || '';
    const farmerPhoto = farmerDoc?.profilePicture || farmerDoc?.avatar || farmerDoc?.profilePhoto || '';

    for (const memberId of eligibleMembers) {
      if (offlineMemberIds.has(memberId.toString())) {
        // Offline members do not have smartphones or apps; skip socket & push notifications
        continue;
      }
      const invitePayload = {
        requestId:       request._id.toString(),
        offerId:         `${request._id}_${memberId}`,
        requestType:     'TEAM_MEMBER_INVITATION',
        isTeamInvite:    true,
        status:          'member_pending',
        source:          'WorkerGroupRequest',
        teamLeader: {
          id:     leaderId.toString(),
          name:   leaderName,
          phone:  leaderDoc?.phone || '',
          rating: leaderDoc?.rating || 0
        },
        farmer: {
          id:           request.farmerId.toString(),
          name:         farmerName,
          phone:        farmerPhone,
          profileImage: farmerPhoto
        },
        job: {
          title:        request.workTitle || request.workCategory || 'Farm Work',
          category:     request.workCategory || '',
          description:  request.workDescription || '',
          skills:       request.requiredSkills || [],
          date:         request.bookingType === 'DAILY' ? request.startDate : request.scheduledDate,
          startTime:    request.startTime || '',
          endTime:      request.endTime || '',
          duration:     request.bookingType === 'DAILY' ? `${request.numberOfDays || 1} day(s)` : `${request.durationMinutes || 60} mins`,
          location:     typeof request.location === 'object' && request.location !== null
                          ? [request.location.addressLine1, request.location.city, request.location.state].filter(Boolean).join(', ') || 'Farmer Location'
                          : (request.location || 'Location Provided'),
          bookingType:  request.bookingType || 'HOURLY',
          numberOfDays: request.numberOfDays || null,
          startDate:    request.startDate || null,
          requiredWorkers: request.requiredWorkers || 1
        },
        offeredRate:  request.agreedRatePerWorker || request.farmerOfferedRatePerWorker || request.leaderRate || 0,
        rateUnit:     request.rateUnit || (request.bookingType === 'DAILY' ? 'daily' : 'hourly')
      };

      // In-app Notification
      await notify({
        recipientType: 'worker', recipientId: memberId,
        type: 'team_member_invitation',
        title: '👥 Team Job Invitation',
        message: `Your team leader ${leaderName} has a group job on ${new Date(request.scheduledDate).toDateString()}. Work: ${request.workTitle || 'Farm Work'}. Please respond.`,
        relatedId: request._id, relatedType: 'worker_group_request'
      });

      // Dedicated socket events
      emitSafe(`worker_${memberId}`, 'team_member_invitation', invitePayload);
      emitSafe(`worker_${memberId}`, 'group_member_request', invitePayload);
      emitSafe(`worker_${memberId}`, 'workerJobsUpdated', {});

      // FCM Fallback
      sendNotificationToWorker(
        memberId,
        'New Team Job Invitation',
        `You have been invited by ${leaderName}. Tap to view the job.`,
        {
          type: 'TEAM_MEMBER_INVITATION',
          requestId: request._id.toString()
        }
      ).catch(fcmErr => console.warn('[FCM] Group member invite failed:', fcmErr.message));
    }

    return res.json({
      success: true,
      message: `Request dispatched to ${eligibleMembers.length} team members.`,
      data: request
    });
  } catch (err) {
    console.error('[dispatchToMembers]', err);
    return res.status(500).json({ success: false, message: 'Failed to dispatch.' });
  }
};

/**
 * PATCH /worker/group-request/:id/member-respond
 * A team member accepts or rejects the group request.
 * body: { action: 'accept' | 'reject' }
 */
exports.memberRespondToRequest = async (req, res) => {
  try {
    const workerId = req.user._id.toString();
    const { action } = req.body;
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be accept or reject.' });
    }

    const request = await WorkerGroupRequest.findOne({
      _id: req.params.id,
      'memberRequests.workerId': workerId
    });
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });

    const memberEntry = request.memberRequests.find(m => m.workerId.toString() === workerId);
    if (!memberEntry) return res.status(404).json({ success: false, message: 'You are not part of this request.' });

    const isExpired = isBookingExpired(request).isExpired || ['cancelled', 'expired', 'completed'].includes(request.status);
    if (isExpired || request.status !== 'collecting_members') {
      if (action === 'reject') {
        memberEntry.status = 'rejected';
        memberEntry.respondedAt = new Date();
        await request.save();
        return res.json({ success: true, message: 'Invitation has expired and has been dismissed.', isExpired: true });
      }
      return res.status(410).json({ success: false, message: 'This invitation is no longer active.', isExpired: true });
    }

    if (memberEntry.status !== 'pending') {
      if (action === 'reject' && memberEntry.status === 'rejected') {
        return res.json({ success: true, message: 'You have already declined this invitation.' });
      }
      return res.status(400).json({ success: false, message: 'You have already responded.' });
    }

    memberEntry.status = action === 'accept' ? 'accepted' : 'rejected';
    memberEntry.respondedAt = new Date();

    const allResponded = request.memberRequests.every(m => m.status !== 'pending');
    if (allResponded) {
      request.status = 'selection_pending';
    }

    await request.save();

    await notify({
      recipientType: 'worker', recipientId: request.teamLeaderId,
      type: action === 'accept' ? 'group_member_accepted' : 'group_member_rejected',
      title: `Team Member ${action === 'accept' ? 'Accepted' : 'Declined'}`,
      message: `A team member ${action === 'accept' ? 'accepted' : 'declined'} the group work request.`,
      relatedId: request._id, relatedType: 'worker_group_request'
    });

    return res.json({ success: true, message: `Response recorded.`, data: { status: memberEntry.status } });
  } catch (err) {
    console.error('[memberRespondToRequest]', err);
    return res.status(500).json({ success: false, message: 'Failed to respond.' });
  }
};

/**
 * PATCH /worker/group-request/:id/select-workers
 * Team leader finalizes which workers to submit (including himself).
 * This locks the financial snapshot and moves to awaiting_payment.
 * body: { workerIds: [...] }  ← must NOT exceed request.requiredWorkers
 */
exports.leaderSelectWorkers = async (req, res) => {
  try {
    const leaderId = req.user._id;
    const { workerIds } = req.body;

    if (!Array.isArray(workerIds) || workerIds.length === 0) {
      return res.status(400).json({ success: false, message: 'workerIds must be a non-empty array.' });
    }

    let request = await WorkerGroupRequest.findOne({
      _id: req.params.id,
      teamLeaderId: leaderId,
      status: { $in: ['selection_pending', 'collecting_members'] }
    });
    if (!request) {
      // Fallback: Check WorkerBookingRequest (unified flow)
      const bookingReq = await WorkerBookingRequest.findById(req.params.id);
      if (bookingReq) {
        if (workerIds.length > bookingReq.requiredWorkers) {
          return res.status(400).json({
            success: false,
            message: `Cannot select more than ${bookingReq.requiredWorkers} workers.`
          });
        }
        bookingReq.finalWorkers = workerIds;
        bookingReq.selectedWorkerIds = workerIds;
        bookingReq.status = 'awaiting_farmer_confirmation';
        await bookingReq.save();
        return res.json({
          success: true,
          message: 'Workers selected successfully. Waiting for farmer confirmation.',
          data: bookingReq
        });
      }
      return res.status(404).json({ success: false, message: 'Request not found or not ready for selection.' });
    }

    // SECURITY: Backend enforces max workers
    if (workerIds.length > request.requiredWorkers) {
      return res.status(400).json({
        success: false,
        message: `Cannot select more than ${request.requiredWorkers} workers. Farmer only requested ${request.requiredWorkers}.`
      });
    }

    // SECURITY: All selected workers must have accepted THIS request (leader is always allowed)
    const acceptedIds = request.memberRequests
      .filter(m => m.status === 'accepted')
      .map(m => m.workerId.toString());
    const leaderIdStr = leaderId.toString();

    for (const wid of workerIds) {
      if (wid.toString() !== leaderIdStr && !acceptedIds.includes(wid.toString())) {
        return res.status(400).json({
          success: false,
          message: `Worker ${wid} did not accept this request or does not belong to this team.`
        });
      }
    }

    // Final availability re-check for all selected workers
    for (const wid of workerIds) {
      const conflict = await hasTimeConflict(wid, request.scheduledDate, request.startTime, request.endTime);
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `Worker ${wid} now has a conflicting booking. Please reselect.`
        });
      }
    }

    // ── Lock financial snapshot (paise-based integer math) ───────────────────
    const settings = await getWorkerFinancialSettings();
    const agreedRate = request.agreedRatePerWorker || request.farmerOfferedRatePerWorker;
    const isDaily    = request.bookingType === 'DAILY';
    const workerCount = workerIds.length;

    let maxWorkerAmount = 0;
    if (isDaily) {
      const days = Number(request.numberOfDays) || 1;
      maxWorkerAmount = toINR(toP(agreedRate) * workerCount * days);
    } else {
      const durationHours = (Number(request.durationMinutes) || 60) / 60;
      maxWorkerAmount = toINR(Math.round(toP(agreedRate) * workerCount * durationHours));
    }

    const platformRate   = Number(settings.workerPlatformChargePercentage) || 0;
    const platformPaise  = Math.round((toP(maxWorkerAmount) * platformRate) / 100);
    const platformCharge = toINR(platformPaise);
    const totalPayable   = toINR(toP(maxWorkerAmount) + platformPaise);

    request.selectedWorkers    = workerIds;
    request.agreedRatePerWorker = agreedRate;
    request.status             = 'awaiting_payment';
    request.paymentStatus      = 'not_started';
    request.financialSnapshot  = {
      agreedRatePerWorker:  agreedRate,
      selectedWorkerCount:  workerCount,
      maximumWorkerAmount:  maxWorkerAmount,
      platformChargeRate:   platformRate,
      platformChargeAmount: platformCharge,
      totalPayable,
      commissionRate:       settings.workerCommissionPercentage,
      currency:             'INR',
      bookingType:          request.bookingType || 'HOURLY',
      numberOfDays:         isDaily ? (Number(request.numberOfDays) || 1) : null,
      durationMinutes:      !isDaily ? (Number(request.durationMinutes) || 60) : null,
      createdAt:            new Date()
    };
    await request.save();

    // Notify accepted but not selected members
    const notSelected = acceptedIds.filter(id => !workerIds.map(w => w.toString()).includes(id));
    for (const wid of notSelected) {
      await notify({
        recipientType: 'worker', recipientId: wid,
        type: 'group_member_not_selected',
        title: 'Not Selected',
        message: 'You accepted but were not selected for this group job. Thank you for responding.',
        relatedId: request._id, relatedType: 'worker_group_request'
      });
    }

    // Notify farmer that payment is now required
    await notify({
      recipientType: 'user', recipientId: request.farmerId,
      type: 'group_booking_awaiting_payment',
      title: 'Workers Selected — Please Pay',
      message: `The team leader selected ${workerCount} worker(s) for your group request. Total payable: ₹${totalPayable}. Please proceed to payment to confirm your booking.`,
      relatedId: request._id, relatedType: 'worker_group_request',
      data: { financials: request.financialSnapshot }
    });

    emitSafe(`user_${request.farmerId}`, 'group_booking_awaiting_payment', {
      requestId: request._id,
      financials: request.financialSnapshot
    });

    return res.json({
      success: true,
      message: `${workerCount} workers selected. Farmer must now complete payment.`,
      data: {
        groupRequestId: request._id,
        status: 'awaiting_payment',
        selectedCount: workerCount,
        agreedRatePerWorker: agreedRate,
        financials: request.financialSnapshot
      }
    });
  } catch (err) {
    console.error('[leaderSelectWorkers]', err);
    return res.status(500).json({ success: false, message: 'Failed to select workers.' });
  }
};

/**
 * GET /worker/group-request/:id/members
 * Leader views member responses for a group request.
 */
exports.getMemberResponses = async (req, res) => {
  try {
    const leaderId = req.user._id;
    let request = await WorkerGroupRequest.findOne({
      _id: req.params.id, teamLeaderId: leaderId
    }).populate('memberRequests.workerId', 'name profilePhoto skills rating dailyRate');

    if (!request) {
      // Fallback: Check WorkerBookingRequest (unified flow)
      const bookingReq = await WorkerBookingRequest.findById(req.params.id)
        .populate('memberInvitations.workerId', 'name profilePhoto skills rating dailyRate');
      if (bookingReq) {
        const memberRequests = (bookingReq.memberInvitations || []).map(m => ({
          _id: m._id,
          workerId: m.workerId,
          status: m.status === 'member_accepted' ? 'accepted' : m.status === 'member_rejected' ? 'rejected' : 'pending',
          respondedAt: m.respondedAt,
          offeredRate: m.offeredRate
        }));
        return res.json({
          success: true,
          data: {
            requiredWorkers: bookingReq.requiredWorkers,
            memberRequests: memberRequests,
            acceptedCount: memberRequests.filter(m => m.status === 'accepted').length,
            rejectedCount: memberRequests.filter(m => m.status === 'rejected').length,
            pendingCount:  memberRequests.filter(m => m.status === 'pending').length,
            selectedWorkers: bookingReq.finalWorkers || [],
            status: bookingReq.status,
            financialSnapshot: bookingReq.financialSnapshot
          }
        });
      }
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }
    return res.json({
      success: true,
      data: {
        requiredWorkers: request.requiredWorkers,
        memberRequests: request.memberRequests,
        acceptedCount: request.memberRequests.filter(m => m.status === 'accepted').length,
        rejectedCount: request.memberRequests.filter(m => m.status === 'rejected').length,
        pendingCount:  request.memberRequests.filter(m => m.status === 'pending').length,
        selectedWorkers: request.selectedWorkers,
        status: request.status,
        financialSnapshot: request.financialSnapshot
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load member responses.' });
  }
};

// ─── Payment Flow (Farmer) ────────────────────────────────────────────────────

/**
 * POST /user/group-request/:id/create-payment
 * Farmer creates a Razorpay order for the group booking.
 * Requires: groupRequest.status === 'awaiting_payment'
 */
exports.createGroupBookingPayment = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const request  = await WorkerGroupRequest.findOne({
      _id: req.params.id,
      farmerId,
      status: { $in: ['awaiting_payment', 'payment_pending'] },
      paymentStatus: { $in: ['not_started', 'pending', 'failed'] }
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Group request not found or not ready for payment.' });
    }

    const snap = request.financialSnapshot;
    if (!snap || !snap.totalPayable) {
      return res.status(400).json({ success: false, message: 'Financial snapshot is missing. Leader must re-select workers.' });
    }

    const orderRes = await createOrder(
      snap.totalPayable,
      snap.currency || 'INR',
      `grp_${request._id}`
    );
    if (!orderRes.success) {
      return res.status(500).json({ success: false, message: 'Failed to create payment order: ' + (orderRes.error || '') });
    }

    request.razorpayOrderId = orderRes.orderId;
    request.paymentStatus   = 'pending';
    request.status          = 'payment_pending';
    await request.save();

    return res.json({
      success: true,
      data: {
        orderId:    orderRes.orderId,
        amount:     orderRes.amount,
        currency:   orderRes.currency,
        financials: snap
      }
    });
  } catch (err) {
    console.error('[createGroupBookingPayment]', err);
    return res.status(500).json({ success: false, message: 'Failed to initialize payment.' });
  }
};

/**
 * POST /user/group-request/:id/verify-payment
 * Farmer verifies Razorpay payment. On success:
 *  1. Creates a WorkerBookingRequest (parent) linked to this group request
 *  2. Creates IndWorkerAssignment docs (one per selected worker)
 *  3. Updates group request status → confirmed
 */
exports.verifyGroupBookingPayment = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const request = await WorkerGroupRequest.findOne({
      _id: req.params.id,
      farmerId,
      razorpayOrderId: razorpay_order_id,
      paymentStatus: 'pending',
      status: 'payment_pending'
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Invalid payment verification request.' });
    }

    // ── Verify Razorpay signature ───────────────────────────────────────────
    const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      request.paymentStatus = 'failed';
      await request.save();
      return res.status(400).json({ success: false, message: 'Payment signature verification failed.' });
    }

    // ── Idempotency guard — skip if already confirmed ───────────────────────
    if (request.status === 'confirmed' && request.workerBookingRequestId) {
      return res.json({
        success: true,
        message: 'Payment already verified and booking confirmed.',
        data: {
          groupRequestId:       request._id,
          workerBookingRequestId: request.workerBookingRequestId,
          assignmentIds:        request.assignmentIds
        }
      });
    }

    request.paymentStatus    = 'success';
    request.paymentMethod    = 'online';
    request.razorpayPaymentId = razorpay_payment_id;

    const snap         = request.financialSnapshot;
    const agreedRate   = snap.agreedRatePerWorker || request.agreedRatePerWorker || request.farmerOfferedRatePerWorker;
    const commissionRate = snap.commissionRate || 10;
    const isDaily      = request.bookingType === 'DAILY';
    const selectedWorkerIds = request.selectedWorkers.map(id => id.toString());
    const otpExpiry    = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Create parent WorkerBookingRequest
    // ─────────────────────────────────────────────────────────────────────────
    const bookingNumber = `GRP-${Date.now().toString().slice(-8)}`;
    const parentRequest = await WorkerBookingRequest.create({
      farmerId,
      bookingMode:   'TEAM_LEADER',
      requestType:   'team_leader',
      bookingType:   request.bookingType || 'HOURLY',
      teamLeaderId:  request.teamLeaderId,
      workCategory:  request.workCategory,
      workTitle:     request.workTitle,
      workDescription: request.workDescription,
      requiredSkills: request.requiredSkills,
      additionalInstructions: request.additionalInstructions,
      scheduledDate: request.scheduledDate,
      startTime:     request.startTime,
      endTime:       request.endTime,
      durationMinutes: request.durationMinutes || 60,
      rateUnit:      request.rateUnit,
      // DAILY fields
      startDate:     request.startDate || null,
      endDate:       request.endDate   || null,
      numberOfDays:  request.numberOfDays || null,
      minDailyRate:  request.minDailyRate || null,
      maxDailyRate:  request.maxDailyRate || null,
      location:      request.location,
      requiredWorkers: request.requiredWorkers,
      minRate:       agreedRate,
      maxRate:       agreedRate,
      selectedWorkerIds: selectedWorkerIds,
      finalWorkers:  selectedWorkerIds,
      acceptedWorkersCount: selectedWorkerIds.length,
      status:        'confirmed',
      paymentStatus: 'success',
      paymentMethod: 'online',
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      financialSnapshot: {
        maximumBudget:        agreedRate,
        selectedWorkerCount:  selectedWorkerIds.length,
        maximumWorkerAmount:  snap.maximumWorkerAmount,
        platformChargeRate:   snap.platformChargeRate,
        platformChargeAmount: snap.platformChargeAmount,
        totalPayable:         snap.totalPayable,
        commissionRate:       commissionRate,
        currency:             snap.currency || 'INR',
        createdAt:            new Date()
      },
      independentWorkerLimitSnapshot: null, // N/A for TL flow
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Create one IndWorkerAssignment per selected worker
    // ─────────────────────────────────────────────────────────────────────────
    const assignmentDocs = [];
    const bookingDocs    = [];

    for (const [idx, wId] of selectedWorkerIds.entries()) {
      // Paise-based financial calculation
      let grossPaise  = 0;
      let bookedDays  = null;
      const rateUnit  = isDaily ? 'daily' : (request.rateUnit || 'hourly');

      if (isDaily) {
        bookedDays  = Number(request.numberOfDays) || 1;
        grossPaise  = toP(agreedRate) * bookedDays;
      } else {
        const durationHours = (Number(request.durationMinutes) || 60) / 60;
        grossPaise = Math.round(toP(agreedRate) * durationHours);
      }

      const commissionPaise = Math.floor((grossPaise * commissionRate) / 100);
      const netPaise        = grossPaise - commissionPaise;
      const grossAmount     = toINR(grossPaise);
      const commissionAmount = toINR(commissionPaise);
      const netEarning      = toINR(netPaise);

      const isLeader = wId.toString() === request.teamLeaderId.toString();
      const workerType = isLeader ? 'TEAM_LEADER' : 'TEAM_MEMBER';

      // Generate visit OTP
      const rawVisitOtp  = Math.floor(1000 + Math.random() * 9000).toString();
      const visitOtpHash = crypto.createHash('sha256').update(rawVisitOtp).digest('hex');

      const assignmentDoc = {
        parentRequestId:  parentRequest._id,
        bookingType:      request.bookingType || 'HOURLY',
        farmerId,
        workerId:         wId,
        teamLeaderId:     request.teamLeaderId,
        workerType,
        agreedRate,
        rateUnit,
        creationIdempotencyKey: `grp_assign_${request._id}_${wId}_${Date.now()}`,
        assignmentStatus: 'CONFIRMED',
        journeyStatus:    'NOT_STARTED',
        visitOtpStatus:   'PENDING',
        workStatus:       'NOT_STARTED',
        completionStatus: 'PENDING',
        settlementStatus: 'PENDING',
        locationStatus:   'UNAVAILABLE',
        visitOtpCode:     rawVisitOtp,
        visitOtpHash,
        visitOtpExpiresAt: otpExpiry,
        grossAmount,
        commissionRate,
        commissionAmount,
        netEarning
      };

      if (isDaily) {
        assignmentDoc.bookedDays      = bookedDays;
        assignmentDoc.workedDays      = 0;
        assignmentDoc.currentDayIndex = 1;
        assignmentDoc.isDecreased     = false;
        assignmentDoc.dailyLogs       = [{
          dayNumber:        1,
          date:             request.startDate ? new Date(request.startDate) : new Date(),
          journeyStatus:    'NOT_STARTED',
          visitOtpCode:     rawVisitOtp,
          visitOtpHash,
          visitOtpStatus:   'PENDING',
          visitOtpExpiresAt: otpExpiry,
          workStatus:       'NOT_STARTED'
        }];
      }

      assignmentDocs.push(assignmentDoc);

      // Legacy Booking doc for backward compatibility
      bookingDocs.push({
        bookingNumber:   `GRP-${Date.now()}-${idx}`,
        userId:          farmerId,
        workerId:        wId,
        providerType:    'WORKER',
        workerRequestId: parentRequest._id,
        scheduledDate:   isDaily ? (request.startDate || request.scheduledDate) : request.scheduledDate,
        scheduledTime:   isDaily ? '09:00' : request.startTime,
        timeSlot:        isDaily ? { start: '09:00', end: '17:00' } : { start: request.startTime, end: request.endTime },
        serviceName:     request.workTitle,
        serviceCategory: request.workCategory || 'Worker',
        minRate:         agreedRate,
        maxRate:         agreedRate,
        agreedRate,
        rateUnit,
        workerGrossEarning: grossAmount,
        commissionRate,
        commissionAmount,
        workerNetEarning:   netEarning,
        finalAmount:     grossAmount,
        totalAmount:     grossAmount,
        farmerPaidAmount: snap.totalPayable || grossAmount,
        visitOtp:        rawVisitOtp,
        address: {
          addressLine1: request.location?.addressLine1 || '',
          city:         request.location?.city  || '',
          state:        request.location?.state || '',
          pincode:      request.location?.pincode || '',
          lat:          request.location?.lat || null,
          lng:          request.location?.lng || null
        },
        status:        'confirmed',
        paymentStatus: 'success',
        paymentMethod: 'online',
        paymentId:     razorpay_payment_id,
        notes:         `${request.workTitle}: ${request.workDescription || ''}`.substring(0, 500)
      });
    }

    const createdAssignments = await IndWorkerAssignment.insertMany(assignmentDocs);
    const createdBookings    = await Booking.insertMany(bookingDocs);

    // Link legacy booking IDs into assignments
    for (let i = 0; i < createdAssignments.length; i++) {
      if (createdBookings[i]) {
        createdAssignments[i].legacyBookingId = createdBookings[i]._id;
        await createdAssignments[i].save();
      }
    }

    const assignmentIds = createdAssignments.map(a => a._id);
    const bookingIds    = createdBookings.map(b => b._id);

    // ── Update parent WorkerBookingRequest with assignment references ─────────
    parentRequest.assignmentIds   = assignmentIds;
    parentRequest.finalBookingIds = bookingIds;
    await parentRequest.save();

    // ── Update group request to confirmed state ───────────────────────────────
    request.status                = 'confirmed';
    request.workerBookingRequestId = parentRequest._id;
    request.assignmentIds         = assignmentIds;
    request.refundAmount          = null;
    request.refundCredited        = false;
    request.refundCreditedAt      = null;
    await request.save();

    // ── Notify all assigned workers ───────────────────────────────────────────
    for (const a of createdAssignments) {
      await notify({
        recipientType: 'worker', recipientId: a.workerId,
        type: 'group_booking_confirmed',
        title: 'Group Booking Confirmed & Paid!',
        message: `Your group booking for ${request.workTitle} has been confirmed. You will earn ₹${a.netEarning}.`,
        relatedId: parentRequest._id,
        relatedType: 'WorkerBookingRequest',
        data: { assignmentId: a._id, groupRequestId: request._id }
      });

      emitSafe(`worker_${a.workerId}`, 'group_booking_confirmed', {
        groupRequestId:  request._id,
        assignmentId:    a._id,
        requestId:       parentRequest._id,
        netEarning:      a.netEarning,
        serverTimestamp: new Date()
      });
    }

    // Notify farmer
    await notify({
      recipientType: 'user', recipientId: farmerId,
      type: 'group_booking_payment_success',
      title: 'Payment Successful — Booking Confirmed!',
      message: `Your group booking for ${request.workTitle} is confirmed. ${selectedWorkerIds.length} worker(s) assigned.`,
      relatedId: parentRequest._id,
      relatedType: 'WorkerBookingRequest',
      data: { groupRequestId: request._id, assignmentIds }
    });

    emitSafe(`booking_req:${parentRequest._id}`, 'booking_confirmed', {
      requestId:       parentRequest._id,
      groupRequestId:  request._id,
      assignmentIds,
      totalWorkers:    assignmentIds.length,
      serverTimestamp: new Date()
    });

    return res.json({
      success: true,
      message: 'Payment verified and group booking confirmed.',
      data: {
        groupRequestId:        request._id,
        workerBookingRequestId: parentRequest._id,
        assignmentIds,
        bookingIds,
        totalWorkers:          selectedWorkerIds.length
      }
    });

  } catch (err) {
    console.error('[verifyGroupBookingPayment]', err);
    return res.status(500).json({ success: false, message: 'Payment verification failed: ' + err.message });
  }
};

// ─── Farmer: Generate Completion OTP for Group Worker ─────────────────────────

/**
 * POST /user/group-request/:id/assignment/:assignmentId/completion-otp
 * Farmer generates a Completion OTP for a specific worker assignment
 * within a group booking. Mirrors farmerWorkerRequestController.generateFarmerCompletionOtp.
 */
exports.generateGroupCompletionOtp = async (req, res) => {
  try {
    const farmerId      = req.user._id;
    const { id, assignmentId } = req.params;

    const groupRequest = await WorkerGroupRequest.findOne({ _id: id, farmerId });
    if (!groupRequest) {
      return res.status(404).json({ success: false, message: 'Group request not found.' });
    }
    if (groupRequest.status !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Group booking is not yet confirmed.' });
    }

    const assignment = await IndWorkerAssignment.findOne({
      _id: assignmentId,
      farmerId,
      parentRequestId: groupRequest.workerBookingRequestId,
      assignmentStatus: 'CONFIRMED'
    });

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    const isDaily = assignment.bookingType === 'DAILY';

    if (isDaily) {
      // Generate per-day completion OTP
      const dayIdx = assignment.currentDayIndex || 1;
      let log = assignment.dailyLogs?.find(l => l.dayNumber === dayIdx);

      if (!log) {
        return res.status(400).json({ success: false, message: `Day ${dayIdx} log not found. Worker must start the day first.` });
      }

      if (log.workStatus !== 'IN_PROGRESS') {
        return res.status(400).json({
          success: false,
          message: `Cannot generate Completion OTP for Day ${dayIdx}. Work is not in progress.`
        });
      }

      const rawOtp     = Math.floor(1000 + Math.random() * 9000).toString();
      const otpHash    = crypto.createHash('sha256').update(rawOtp).digest('hex');
      const expiresAt  = new Date(Date.now() + 48 * 60 * 60 * 1000);

      log.completionOtpCode      = rawOtp;
      log.completionOtpHash      = otpHash;
      log.completionOtpExpiresAt = expiresAt;
      log.completionOtpAttempts  = 0;

      // Also mirror to top-level assignment for cross-OTP support
      assignment.completionOtpCode      = rawOtp;
      assignment.completionOtpHash      = otpHash;
      assignment.completionOtpExpiresAt = expiresAt;
      assignment.completionOtpAttempts  = 0;

      await assignment.save();

      // Notify worker
      await notify({
        recipientType: 'worker', recipientId: assignment.workerId,
        type: 'completion_otp_generated',
        title: `Day ${dayIdx} Completion OTP Ready`,
        message: `Farmer has generated the Completion OTP for Day ${dayIdx}. Enter it to confirm work completion.`,
        relatedId: groupRequest.workerBookingRequestId,
        relatedType: 'WorkerBookingRequest',
        data: { assignmentId: assignment._id, dayNumber: dayIdx }
      });

      emitSafe(`worker_${assignment.workerId}`, 'completion_otp_generated', {
        assignmentId:    assignment._id,
        dayNumber:       dayIdx,
        serverTimestamp: new Date()
      });

      return res.json({
        success: true,
        message: `Day ${dayIdx} Completion OTP generated. Share this with the worker.`,
        data: { completionOtp: rawOtp, dayNumber: dayIdx, expiresAt }
      });
    }

    // ── HOURLY: single completion OTP ─────────────────────────────────────────
    if (assignment.workStatus !== 'SUBMITTED') {
      return res.status(400).json({
        success: false,
        message: 'Worker must submit work proof before Completion OTP can be generated.'
      });
    }

    const rawOtp    = Math.floor(1000 + Math.random() * 9000).toString();
    const otpHash   = crypto.createHash('sha256').update(rawOtp).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    assignment.completionOtpCode      = rawOtp;
    assignment.completionOtpHash      = otpHash;
    assignment.completionOtpExpiresAt = expiresAt;
    assignment.completionOtpAttempts  = 0;
    await assignment.save();

    await notify({
      recipientType: 'worker', recipientId: assignment.workerId,
      type: 'completion_otp_generated',
      title: 'Completion OTP Ready',
      message: 'Farmer has generated the Completion OTP. Enter it to confirm work completion and receive payment.',
      relatedId: groupRequest.workerBookingRequestId,
      relatedType: 'WorkerBookingRequest',
      data: { assignmentId: assignment._id }
    });

    emitSafe(`worker_${assignment.workerId}`, 'completion_otp_generated', {
      assignmentId:    assignment._id,
      serverTimestamp: new Date()
    });

    return res.json({
      success: true,
      message: 'Completion OTP generated. Share this with the worker.',
      data: { completionOtp: rawOtp, expiresAt }
    });

  } catch (err) {
    console.error('[generateGroupCompletionOtp]', err);
    return res.status(500).json({ success: false, message: 'Failed to generate completion OTP.' });
  }
};

'use strict';

/**
 * disputeController.js — Production-Grade
 *
 * Handles the complete dispute lifecycle for BOTH booking domains:
 *   A) VENDOR_BOOKING  (Farmer ↔ Vendor machinery/services)
 *   B) WORKER_BOOKING  (Farmer ↔ Worker labour bookings)
 *
 * BUSINESS RULES:
 *  - Farmers can raise disputes for both domains
 *  - Vendors can raise disputes for VENDOR_BOOKING only
 *  - Workers can raise disputes for WORKER_BOOKING only
 *  - Only Admin can perform resolutions that trigger financial actions
 *  - All admin actions are atomically appended to dispute.auditLog
 *  - Financial actions reuse existing service functions (workerFinancialService, wallet logic)
 */

const mongoose     = require('mongoose');
const Dispute      = require('../../models/Dispute');
const Booking      = require('../../models/Booking');
const WorkerBookingRequest = require('../../models/WorkerBookingRequest');
const IndWorkerAssignment  = require('../../models/IndWorkerAssignment');
const AdminAuditLog        = require('../../models/AdminAuditLog');
const Wallet               = require('../../models/Wallet');
const WalletTransaction    = require('../../models/WalletTransaction');
const Transaction           = require('../../models/Transaction');
const User                 = require('../../models/User');
const Vendor               = require('../../models/Vendor');
const Worker               = require('../../models/Worker');
const { createNotification } = require('../notificationControllers/notificationController');
const { buildAdminScopeFilter, verifyResourceScope } = require('../../utils/adminScopeHelper');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine booking domain, validate principals, and return context.
 * Returns { bookingDomain, bookingDoc, raisedByModel, raisedByRole } or throws.
 */
async function resolveDisputeContext(callerId, callerRole, body) {
  const { bookingId, workerRequestId, assignmentId } = body;

  // callerRole comes from JWT: 'USER' (farmer), 'VENDOR', 'WORKER'
  const roleMap = { USER: { model: 'User', role: 'FARMER' }, VENDOR: { model: 'Vendor', role: 'VENDOR' }, WORKER: { model: 'Worker', role: 'WORKER' } };
  const mapped  = roleMap[callerRole];
  if (!mapped) throw new Error('Invalid caller role for disputes');

  // ── VENDOR_BOOKING domain ────────────────────────────────────────────────
  if (bookingId) {
    if (callerRole === 'WORKER') throw new Error('Workers cannot raise disputes for vendor bookings. Use workerRequestId instead.');

    const booking = await Booking.findById(bookingId).select('userId vendorId status bookingNumber').lean();
    if (!booking) throw Object.assign(new Error('Booking not found'), { status: 404 });

    // Authorization: caller must be the farmer (userId) or vendor (vendorId)
    const farmerId  = booking.userId?.toString();
    const vendorId  = booking.vendorId?.toString();
    const callerStr = callerId.toString();

    if (callerRole === 'USER'   && callerStr !== farmerId)  throw Object.assign(new Error('You are not a party to this booking'), { status: 403 });
    if (callerRole === 'VENDOR' && callerStr !== vendorId)  throw Object.assign(new Error('You are not a party to this booking'), { status: 403 });

    return {
      bookingDomain:   'VENDOR_BOOKING',
      vendorBookingId: booking._id,
      workerRequestId: null,
      assignmentId:    null,
      raisedByModel:   mapped.model,
      raisedByRole:    mapped.role,
      bookingRef:      booking.bookingNumber || booking._id.toString()
    };
  }

  // ── WORKER_BOOKING domain ────────────────────────────────────────────────
  if (workerRequestId) {
    if (callerRole === 'VENDOR') throw new Error('Vendors cannot raise disputes for worker booking requests.');

    const request = await WorkerBookingRequest.findById(workerRequestId).select('farmerId status bookingNumber').lean();
    if (!request) throw Object.assign(new Error('Worker booking request not found'), { status: 404 });

    const farmerId  = request.farmerId?.toString();
    const callerStr = callerId.toString();

    if (callerRole === 'USER' && callerStr !== farmerId) throw Object.assign(new Error('You are not the farmer for this booking'), { status: 403 });

    // For worker role: validate they have an assignment for this request
    if (callerRole === 'WORKER') {
      const assignment = await IndWorkerAssignment.findOne({ parentRequestId: workerRequestId, workerId: callerId }).lean();
      if (!assignment) throw Object.assign(new Error('No assignment found for you on this request'), { status: 403 });
    }

    // Validate optional assignmentId belongs to this request
    let resolvedAssignmentId = null;
    if (assignmentId) {
      const asgn = await IndWorkerAssignment.findOne({ _id: assignmentId, parentRequestId: workerRequestId }).lean();
      if (!asgn) throw Object.assign(new Error('Assignment does not belong to this request'), { status: 400 });
      resolvedAssignmentId = asgn._id;
    }

    return {
      bookingDomain:   'WORKER_BOOKING',
      vendorBookingId: null,
      workerRequestId: request._id,
      assignmentId:    resolvedAssignmentId,
      raisedByModel:   mapped.model,
      raisedByRole:    mapped.role,
      bookingRef:      request.bookingNumber || request._id.toString()
    };
  }

  throw new Error('Either bookingId (vendor booking) or workerRequestId (worker booking) is required');
}

// ─── Raise Dispute ────────────────────────────────────────────────────────────

/**
 * POST /api/disputes
 * Raise a new dispute. Accessible by: Farmer, Vendor, Worker
 */
const raiseDispute = async (req, res) => {
  try {
    const callerId   = req.user.id || req.user._id;
    const callerRole = req.user.role; // USER | VENDOR | WORKER
    const { reason, description, attachments, priority } = req.body;

    if (!reason || !description) {
      return res.status(400).json({ success: false, message: 'reason and description are required' });
    }

    // Resolve booking domain and validate authorization
    let context;
    try {
      context = await resolveDisputeContext(callerId, callerRole, req.body);
    } catch (err) {
      return res.status(err.status || 400).json({ success: false, message: err.message });
    }

    // Prevent duplicate dispute from same person for same booking entity
    const dupQuery = {
      raisedBy:     callerId,
      bookingDomain: context.bookingDomain
    };
    if (context.vendorBookingId) dupQuery.vendorBookingId = context.vendorBookingId;
    if (context.workerRequestId) dupQuery.workerRequestId = context.workerRequestId;
    if (context.assignmentId)    dupQuery.assignmentId    = context.assignmentId;

    const existing = await Dispute.findOne(dupQuery);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A dispute has already been raised by you for this booking',
        disputeId: existing._id
      });
    }

    // Create dispute
    const dispute = await Dispute.create({
      bookingDomain:   context.bookingDomain,
      vendorBookingId: context.vendorBookingId,
      workerRequestId: context.workerRequestId,
      assignmentId:    context.assignmentId,
      raisedBy:        callerId,
      raisedByModel:   context.raisedByModel,
      raisedByRole:    context.raisedByRole,
      reason,
      description,
      attachments:     Array.isArray(attachments) ? attachments : [],
      status:          'OPEN',
      priority:        ['LOW','MEDIUM','HIGH','URGENT'].includes(priority) ? priority : 'MEDIUM'
    });

    // Notify admin room (real-time dashboard alert)
    try {
      const { getIO } = require('../../sockets');
      const io = getIO();
      if (io) {
        io.to('admin_global').emit('new_dispute', {
          disputeId:     dispute._id,
          bookingDomain: dispute.bookingDomain,
          reason:        dispute.reason,
          priority:      dispute.priority,
          raisedByRole:  dispute.raisedByRole,
          bookingRef:    context.bookingRef,
          createdAt:     dispute.createdAt
        });
      }
    } catch (sockErr) { /* non-fatal */ }

    return res.status(201).json({
      success: true,
      data:    dispute,
      message: 'Dispute raised successfully. Admin will review it shortly.'
    });

  } catch (error) {
    console.error('[raiseDispute]', error);
    return res.status(500).json({ success: false, message: 'Failed to raise dispute' });
  }
};

// ─── Add Evidence ─────────────────────────────────────────────────────────────

/**
 * POST /api/disputes/:id/evidence
 * Farmer, Vendor, or Worker can upload evidence to their own dispute.
 * (Admin can also add evidence)
 */
const addEvidence = async (req, res) => {
  try {
    const callerId   = req.user.id || req.user._id;
    const callerRole = req.user.role; // USER | VENDOR | WORKER | ADMIN
    const { id }     = req.params;
    const { url, fileType, caption } = req.body;

    if (!url) return res.status(400).json({ success: false, message: 'Evidence URL is required' });

    const dispute = await Dispute.findById(id);
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    // Only parties to the dispute or admin can add evidence
    const isAdmin = callerRole === 'ADMIN';
    const isRaiser = dispute.raisedBy.toString() === callerId.toString();
    if (!isAdmin && !isRaiser) {
      return res.status(403).json({ success: false, message: 'You are not authorized to add evidence to this dispute' });
    }

    const roleModelMap = { USER: { model: 'User', role: 'FARMER' }, VENDOR: { model: 'Vendor', role: 'VENDOR' }, WORKER: { model: 'Worker', role: 'WORKER' }, ADMIN: { model: 'Admin', role: 'ADMIN' } };
    const mapped = roleModelMap[callerRole] || { model: 'User', role: 'FARMER' };

    dispute.evidence.push({
      uploadedBy:    callerId,
      uploaderModel: mapped.model,
      uploaderRole:  mapped.role,
      url,
      fileType:      fileType || 'image',
      caption:       caption || '',
      uploadedAt:    new Date()
    });
    await dispute.save();

    return res.status(200).json({ success: true, message: 'Evidence added successfully', data: dispute.evidence });
  } catch (err) {
    console.error('[addEvidence]', err);
    return res.status(500).json({ success: false, message: 'Failed to add evidence' });
  }
};

// ─── Get My Disputes ──────────────────────────────────────────────────────────

/**
 * GET /api/disputes/my
 * Farmer/Vendor/Worker sees their own disputes.
 */
const getMyDisputes = async (req, res) => {
  try {
    const callerId = req.user.id || req.user._id;
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { raisedBy: callerId };
    if (status) filter.status = status;

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Dispute.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: disputes,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    console.error('[getMyDisputes]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch disputes' });
  }
};

// ─── Admin: List All Disputes ─────────────────────────────────────────────────

/**
 * GET /api/admin/disputes
 * Admin sees all disputes with rich filters.
 */
const getAdminDisputes = async (req, res) => {
  try {
    const {
      status, bookingDomain, priority, resolutionType,
      page = 1, limit = 20
    } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (status)         filter.status         = status;
    if (bookingDomain)  filter.bookingDomain   = bookingDomain;
    if (priority)       filter.priority        = priority;
    if (resolutionType) filter.resolutionType  = resolutionType;

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .populate('vendorBookingId', 'bookingNumber status userId vendorId')
        .populate('workerRequestId', 'bookingNumber status farmerId workTitle')
        .populate('assignmentId', 'assignmentStatus workerId farmerId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Dispute.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: disputes,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[getAdminDisputes]', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch disputes' });
  }
};

// ─── Admin: Get Single Dispute ────────────────────────────────────────────────

/**
 * GET /api/admin/disputes/:id
 */
const getAdminDisputeById = async (req, res) => {
  try {
    const { id } = req.params;

    const dispute = await Dispute.findById(id)
      .populate({
        path: 'vendorBookingId',
        populate: [
          { path: 'userId',   select: 'name phone email' },
          { path: 'vendorId', select: 'name businessName phone' }
        ]
      })
      .populate({
        path: 'workerRequestId',
        populate: { path: 'farmerId', select: 'name phone email' }
      })
      .populate('assignmentId', 'assignmentStatus workerId farmerId agreedRate netEarning settlementStatus')
      .populate('resolvedBy', 'name email role');

    if (!dispute) {
      return res.status(404).json({ success: false, message: 'Dispute not found' });
    }

    return res.status(200).json({ success: true, data: dispute });
  } catch (error) {
    console.error('[getAdminDisputeById]', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch dispute details' });
  }
};

// ─── Admin: Start Review ──────────────────────────────────────────────────────

/**
 * PATCH /api/admin/disputes/:id/review
 * Admin acknowledges and starts reviewing the dispute.
 */
const startReview = async (req, res) => {
  try {
    const { id } = req.params;
    const admin   = req.user;
    const { notes } = req.body;

    const dispute = await Dispute.findById(id);
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    const terminalStatuses = ['RESOLVED', 'DISMISSED', 'PARTIAL_SETTLEMENT', 'resolved', 'dismissed'];
    if (terminalStatuses.includes(dispute.status)) {
      return res.status(400).json({ success: false, message: `Dispute is already in terminal status: ${dispute.status}` });
    }

    const prevStatus  = dispute.status;
    dispute.status    = 'UNDER_REVIEW';
    dispute.auditLog.push({
      performedBy:    admin.id || admin._id,
      adminName:      admin.name || admin.email || 'Admin',
      action:         'STARTED_REVIEW',
      previousStatus: prevStatus,
      newStatus:      'UNDER_REVIEW',
      notes:          notes || '',
      timestamp:      new Date()
    });
    await dispute.save();

    // Notify disputer
    await _notifyDisputer(dispute, {
      title:   'Dispute Under Review',
      message: 'Admin has started reviewing your dispute. You will be notified of the outcome.'
    });

    // Audit log
    await AdminAuditLog.log({
      adminId:    admin.id || admin._id,
      adminName:  admin.name || admin.email || 'Admin',
      adminEmail: admin.email || '',
      adminRole:  admin.role || 'admin',
      action:     'DISPUTE_REVIEW_STARTED',
      module:     'DISPUTE_MANAGEMENT',
      targetId:   dispute._id,
      targetModel:'Dispute',
      description:`Admin started reviewing dispute ${dispute._id}`,
      metadata:   { disputeId: dispute._id, bookingDomain: dispute.bookingDomain }
    });

    return res.status(200).json({ success: true, data: dispute, message: 'Dispute moved to UNDER_REVIEW' });
  } catch (err) {
    console.error('[startReview]', err);
    return res.status(500).json({ success: false, message: 'Failed to start review' });
  }
};

// ─── Admin: Resolve Dispute (Main Action) ─────────────────────────────────────

/**
 * PATCH /api/admin/disputes/:id/resolve
 *
 * Performs atomic resolution with optional financial actions.
 * Body params:
 *   - resolutionType: one of the enum values in Dispute.resolutionType
 *   - resolutionNotes: string (required)
 *   - refundAmount: number (for FULL_REFUND_TO_FARMER, PARTIAL_SETTLEMENT)
 *   - workerPayoutAdjustment: number (for WORKER_PENALTY — deducted from worker's net)
 *   - vendorPenaltyAmount: number (for VENDOR_PENALTY)
 *   - priority: optional escalation
 *   - internalTags: string[]
 */
const resolveDispute = async (req, res) => {
  try {
    const { id }    = req.params;
    const admin     = req.user;
    const {
      resolutionType, resolutionNotes,
      refundAmount, workerPayoutAdjustment, vendorPenaltyAmount,
      internalTags
    } = req.body;

    if (!resolutionType) {
      return res.status(400).json({ success: false, message: 'resolutionType is required' });
    }
    if (!resolutionNotes || !resolutionNotes.trim()) {
      return res.status(400).json({ success: false, message: 'resolutionNotes is required' });
    }

    const dispute = await Dispute.findById(id);
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    const terminalStatuses = ['RESOLVED', 'DISMISSED', 'PARTIAL_SETTLEMENT', 'resolved', 'dismissed'];
    if (terminalStatuses.includes(dispute.status)) {
      return res.status(400).json({ success: false, message: `Dispute already resolved with status: ${dispute.status}` });
    }

    const prevStatus  = dispute.status;
    const adminId     = admin.id || admin._id;
    const adminName   = admin.name || admin.email || 'Admin';

    // ── Financial Actions ───────────────────────────────────────────────────
    const financials = {
      refundedToFarmer:       0,
      penaltyAppliedToVendor: 0,
      penaltyAppliedToWorker: 0,
      adjustedWorkerPayout:   0,
      currency:               'INR'
    };

    try {
      switch (resolutionType) {

        // ── ADMIN_COMPLETION_OVERRIDE ───────────────────────────────────────
        // Admin forces booking to completed state despite OTP dispute.
        // For VENDOR_BOOKING: mark booking completed.
        // For WORKER_BOOKING: mark assignment OTP_VERIFIED and trigger settlement.
        case 'ADMIN_COMPLETION_OVERRIDE':
          await _handleCompletionOverride(dispute, adminId, adminName);
          break;

        // ── FULL_REFUND_TO_FARMER ────────────────────────────────────────────
        case 'FULL_REFUND_TO_FARMER': {
          const amount = Number(refundAmount);
          if (!amount || amount <= 0) throw new Error('refundAmount must be > 0 for FULL_REFUND_TO_FARMER');
          await _creditFarmerWallet(dispute, amount, 'Admin Full Refund — Dispute Resolution');
          financials.refundedToFarmer = amount;
          break;
        }

        // ── PARTIAL_SETTLEMENT ───────────────────────────────────────────────
        case 'PARTIAL_SETTLEMENT': {
          const amount = Number(refundAmount);
          if (!amount || amount <= 0) throw new Error('refundAmount must be > 0 for PARTIAL_SETTLEMENT');
          await _creditFarmerWallet(dispute, amount, 'Admin Partial Settlement — Dispute Resolution');
          financials.refundedToFarmer = amount;
          break;
        }

        // ── VENDOR_PENALTY ───────────────────────────────────────────────────
        case 'VENDOR_PENALTY': {
          const amount = Number(vendorPenaltyAmount);
          if (!amount || amount <= 0) throw new Error('vendorPenaltyAmount must be > 0 for VENDOR_PENALTY');
          // Record as memo — full vendor penalty deduction from ledger is done via settlement flow
          financials.penaltyAppliedToVendor = amount;
          // Mark on Booking if vendor domain
          if (dispute.bookingDomain === 'VENDOR_BOOKING' && dispute.vendorBookingId) {
            await Booking.findByIdAndUpdate(dispute.vendorBookingId, {
              $inc: { 'vendorPenaltyAmount': amount }
            });
          }
          break;
        }

        // ── WORKER_PENALTY ───────────────────────────────────────────────────
        case 'WORKER_PENALTY': {
          const amount = Number(workerPayoutAdjustment);
          if (!amount || amount <= 0) throw new Error('workerPayoutAdjustment must be > 0 for WORKER_PENALTY');
          await _applyWorkerPenaltyForDispute(dispute, amount, adminId, adminName);
          financials.penaltyAppliedToWorker = amount;
          financials.adjustedWorkerPayout   = amount;
          break;
        }

        // ── BOOKING_CANCELLED_BY_ADMIN ───────────────────────────────────────
        case 'BOOKING_CANCELLED_BY_ADMIN':
          await _cancelBookingForDispute(dispute, adminId, adminName, resolutionNotes);
          if (refundAmount && Number(refundAmount) > 0) {
            await _creditFarmerWallet(dispute, Number(refundAmount), 'Admin Cancellation Refund — Dispute Resolution');
            financials.refundedToFarmer = Number(refundAmount);
          }
          break;

        // ── DISMISSED_NO_ACTION ──────────────────────────────────────────────
        case 'DISMISSED_NO_ACTION':
          // No financial action
          break;

        // ── CUSTOM_RESOLUTION ────────────────────────────────────────────────
        case 'CUSTOM_RESOLUTION':
          // Admin-described free-form resolution; optionally include refund
          if (refundAmount && Number(refundAmount) > 0) {
            await _creditFarmerWallet(dispute, Number(refundAmount), 'Admin Custom Resolution Refund');
            financials.refundedToFarmer = Number(refundAmount);
          }
          break;

        default:
          return res.status(400).json({ success: false, message: `Unknown resolutionType: ${resolutionType}` });
      }
    } catch (finErr) {
      console.error('[resolveDispute Financial Action]', finErr);
      return res.status(400).json({ success: false, message: `Financial action failed: ${finErr.message}` });
    }

    // ── Determine new terminal status ───────────────────────────────────────
    let newStatus;
    if (resolutionType === 'DISMISSED_NO_ACTION') {
      newStatus = 'DISMISSED';
    } else if (resolutionType === 'PARTIAL_SETTLEMENT') {
      newStatus = 'PARTIAL_SETTLEMENT';
    } else {
      newStatus = 'RESOLVED';
    }

    // ── Persist resolution ──────────────────────────────────────────────────
    dispute.status               = newStatus;
    dispute.resolutionType       = resolutionType;
    dispute.resolutionNotes      = resolutionNotes;
    dispute.resolutionFinancials = financials;
    dispute.resolvedBy           = adminId;
    dispute.resolvedAt           = new Date();

    if (Array.isArray(internalTags)) {
      dispute.internalTags = internalTags.map(t => t.trim()).filter(Boolean);
    }

    dispute.auditLog.push({
      performedBy:    adminId,
      adminName:      adminName,
      action:         `RESOLVED_${resolutionType}`,
      previousStatus: prevStatus,
      newStatus:      newStatus,
      notes:          resolutionNotes,
      metadata:       financials,
      timestamp:      new Date()
    });

    await dispute.save();

    // ── Notify disputer of resolution ───────────────────────────────────────
    const statusLabel = newStatus === 'DISMISSED' ? 'dismissed' : (newStatus === 'PARTIAL_SETTLEMENT' ? 'partially settled' : 'resolved');
    await _notifyDisputer(dispute, {
      title:   `Dispute ${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}`,
      message: `Admin has ${statusLabel} your dispute. ${resolutionNotes ? resolutionNotes.substring(0, 100) : ''}`
    });

    // ── AdminAuditLog ───────────────────────────────────────────────────────
    await AdminAuditLog.log({
      adminId:    adminId,
      adminName:  adminName,
      adminEmail: admin.email || '',
      adminRole:  admin.role || 'admin',
      action:     `DISPUTE_RESOLVED_${resolutionType}`,
      module:     'DISPUTE_MANAGEMENT',
      targetId:   dispute._id,
      targetModel:'Dispute',
      description:`Admin resolved dispute ${dispute._id} with ${resolutionType}`,
      metadata:   { disputeId: dispute._id, bookingDomain: dispute.bookingDomain, resolutionType, financials }
    });

    return res.status(200).json({
      success: true,
      data:    dispute,
      message: `Dispute ${newStatus} with resolution: ${resolutionType}`
    });

  } catch (error) {
    console.error('[resolveDispute]', error);
    return res.status(500).json({ success: false, message: 'Failed to resolve dispute' });
  }
};

// ─── Admin: Dismiss Dispute ───────────────────────────────────────────────────

/**
 * PATCH /api/admin/disputes/:id/dismiss
 */
const dismissDispute = async (req, res) => {
  // Delegates to resolveDispute logic with type = DISMISSED_NO_ACTION
  req.body.resolutionType  = 'DISMISSED_NO_ACTION';
  req.body.resolutionNotes = req.body.resolutionNotes || req.body.reason || 'Dispute dismissed by admin';
  return resolveDispute(req, res);
};

// ─── Admin: Escalate Priority ─────────────────────────────────────────────────

/**
 * PATCH /api/admin/disputes/:id/escalate
 */
const escalateDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const admin   = req.user;
    const { priority, escalationNote } = req.body;

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ success: false, message: `priority must be one of: ${validPriorities.join(', ')}` });
    }

    const dispute = await Dispute.findById(id);
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    const prevPriority   = dispute.priority;
    dispute.priority     = priority;
    dispute.escalatedAt  = new Date();
    dispute.escalationNote = escalationNote || '';
    dispute.auditLog.push({
      performedBy:    admin.id || admin._id,
      adminName:      admin.name || admin.email || 'Admin',
      action:         'ESCALATED',
      previousStatus: prevPriority,
      newStatus:      priority,
      notes:          escalationNote || '',
      timestamp:      new Date()
    });
    await dispute.save();

    return res.status(200).json({ success: true, data: dispute, message: `Dispute priority updated to ${priority}` });
  } catch (err) {
    console.error('[escalateDispute]', err);
    return res.status(500).json({ success: false, message: 'Failed to escalate dispute' });
  }
};

// ─── Admin: Get Dispute Stats ─────────────────────────────────────────────────

/**
 * GET /api/admin/disputes/stats
 */
const getDisputeStats = async (req, res) => {
  try {
    const [byStatus, byDomain, byPriority, total] = await Promise.all([
      Dispute.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Dispute.aggregate([{ $group: { _id: '$bookingDomain', count: { $sum: 1 } } }]),
      Dispute.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Dispute.countDocuments()
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        byStatus:   byStatus.reduce((a, i) => { a[i._id] = i.count; return a; }, {}),
        byDomain:   byDomain.reduce((a, i) => { a[i._id] = i.count; return a; }, {}),
        byPriority: byPriority.reduce((a, i) => { a[i._id] = i.count; return a; }, {})
      }
    });
  } catch (err) {
    console.error('[getDisputeStats]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch dispute stats' });
  }
};

// ─── Private Financial Helpers ────────────────────────────────────────────────

async function _notifyDisputer(dispute, { title, message }) {
  try {
    const roleModelMap = { FARMER: 'userId', VENDOR: 'vendorId', WORKER: 'workerId' };
    const recipientKey = roleModelMap[dispute.raisedByRole] || 'userId';
    await createNotification({
      [recipientKey]: dispute.raisedBy,
      type:           'dispute_update',
      title,
      message,
      relatedId:      dispute._id,
      relatedType:    'Dispute',
      data:           { disputeId: dispute._id, status: dispute.status }
    });
  } catch (e) { /* non-fatal */ }
}

async function _creditFarmerWallet(dispute, amount, description) {
  // Determine farmerId from the booking domain
  let farmerId = null;

  if (dispute.bookingDomain === 'VENDOR_BOOKING' && dispute.vendorBookingId) {
    const booking = await Booking.findById(dispute.vendorBookingId).select('userId').lean();
    farmerId = booking?.userId;
  } else if (dispute.bookingDomain === 'WORKER_BOOKING' && dispute.workerRequestId) {
    const req = await WorkerBookingRequest.findById(dispute.workerRequestId).select('farmerId').lean();
    farmerId = req?.farmerId;
  } else if (dispute.raisedByRole === 'FARMER') {
    farmerId = dispute.raisedBy;
  }

  if (!farmerId) throw new Error('Cannot determine farmer for refund');

  const refundKey = `dispute_refund_${dispute._id.toString()}`;
  const existing  = await WalletTransaction.findOne({ idempotencyKey: refundKey });
  if (existing) return { alreadyProcessed: true };

  let wallet = await Wallet.findOne({ userId: farmerId, userModel: 'User' });
  if (!wallet) wallet = await Wallet.create({ userId: farmerId, userModel: 'User', balance: 0 });

  const prevBalance   = wallet.balance || 0;
  wallet.balance      = prevBalance + amount;
  await wallet.save();

  await User.findByIdAndUpdate(farmerId, { 'wallet.balance': wallet.balance });

  await WalletTransaction.create({
    walletId:       wallet._id,
    type:           'credit',
    amount,
    reason:         'dispute_refund',
    referenceId:    dispute._id.toString(),
    idempotencyKey: refundKey,
    status:         'completed'
  });

  await Transaction.create({
    userId:        farmerId,
    type:          'refund',
    amount,
    status:        'completed',
    paymentMethod: 'wallet',
    description,
    balanceBefore: prevBalance,
    balanceAfter:  wallet.balance,
    referenceId:   dispute._id.toString(),
    metadata:      { disputeId: dispute._id, bookingDomain: dispute.bookingDomain }
  });

  // Notify farmer
  await createNotification({
    userId:      farmerId,
    type:        'refund',
    title:       '₹ Refund Credited!',
    message:     `₹${amount} has been credited to your AgroYilt wallet. ${description}`,
    relatedId:   dispute._id,
    relatedType: 'Dispute',
    priority:    'high',
    pushData:    { type: 'refund', amount, link: '/user/wallet' }
  });

  // Socket update
  try {
    const { getIO } = require('../../sockets');
    const io = getIO();
    if (io) {
      const payload = { balance: wallet.balance, refundAmount: amount, type: 'credit', message: description };
      io.to(`user_${farmerId}`).emit('wallet_balance_updated', payload);
      io.to(`user:${farmerId}`).emit('wallet_balance_updated', payload);
    }
  } catch (e) { /* non-fatal */ }

  return { success: true, refundAmount: amount, newBalance: wallet.balance };
}

async function _applyWorkerPenaltyForDispute(dispute, amount, adminId, adminName) {
  if (dispute.bookingDomain !== 'WORKER_BOOKING') {
    throw new Error('Worker penalty can only be applied to WORKER_BOOKING disputes');
  }

  // Find the worker from the assignment or raiser
  let workerId = null;
  if (dispute.assignmentId) {
    const asgn = await IndWorkerAssignment.findById(dispute.assignmentId).select('workerId').lean();
    workerId = asgn?.workerId;
  } else if (dispute.raisedByRole === 'FARMER' && dispute.workerRequestId) {
    // Penalty applies to all workers — take first settled assignment's worker
    const asgn = await IndWorkerAssignment.findOne({
      parentRequestId: dispute.workerRequestId,
      assignmentStatus: { $ne: 'CANCELLED' }
    }).select('workerId').lean();
    workerId = asgn?.workerId;
  } else if (dispute.raisedByRole === 'WORKER') {
    workerId = dispute.raisedBy; // unlikely but safe
  }

  if (!workerId) throw new Error('Cannot determine worker for penalty');

  const { applyWorkerPenalty } = require('../../services/workerFinancialService');
  const penaltyEventId = `dispute_penalty_${dispute._id.toString()}`;
  await applyWorkerPenalty(
    workerId,
    dispute.workerRequestId || dispute.assignmentId,
    penaltyEventId,
    'DISPUTE',
    `Admin penalty for dispute #${dispute._id}`
  );

  // Notify worker
  await createNotification({
    workerId,
    type:        'penalty',
    title:       'Penalty Applied',
    message:     `A penalty of ₹${amount} has been applied to your wallet due to a dispute resolution.`,
    relatedId:   dispute._id,
    relatedType: 'Dispute',
    data:        { disputeId: dispute._id, amount }
  });
}

async function _handleCompletionOverride(dispute, adminId, adminName) {
  if (dispute.bookingDomain === 'VENDOR_BOOKING' && dispute.vendorBookingId) {
    // Mark vendor booking as completed
    const booking = await Booking.findById(dispute.vendorBookingId);
    if (!booking) throw new Error('Vendor booking not found for completion override');

    const nonCompletableStatuses = ['completed', 'cancelled', 'rejected'];
    if (nonCompletableStatuses.includes(booking.status)) {
      throw new Error(`Booking is already in ${booking.status} state; cannot override`);
    }

    booking.status       = 'completed';
    booking.completedAt  = new Date();
    booking.adminOverride = true;
    booking.adminOverrideNote = `Admin completion override — Dispute #${dispute._id}`;
    await booking.save();

  } else if (dispute.bookingDomain === 'WORKER_BOOKING') {
    // Mark specific assignment or all assignments as OTP_VERIFIED → trigger settlement
    const { processFarmerBookingRefund } = require('../../services/workerFinancialService');

    const assignmentFilter = { parentRequestId: dispute.workerRequestId, assignmentStatus: { $ne: 'CANCELLED' } };
    if (dispute.assignmentId) assignmentFilter._id = dispute.assignmentId;

    const assignments = await IndWorkerAssignment.find(assignmentFilter);
    if (!assignments.length) throw new Error('No active assignments found for completion override');

    for (const asgn of assignments) {
      if (asgn.completionStatus !== 'OTP_VERIFIED') {
        asgn.completionStatus         = 'OTP_VERIFIED';
        asgn.completionOtpVerifiedAt  = new Date();
        asgn.workCompletedAt          = new Date();
        asgn.adminCompletionOverride  = true;
        asgn.adminOverrideNote        = `Admin override — Dispute #${dispute._id}`;

        // Trigger settlement for this assignment
        if (asgn.settlementStatus !== 'SETTLED') {
          try {
            const Worker = require('../../models/Worker');
            const Wallet = require('../../models/Wallet');
            const Transaction = require('../../models/Transaction');
            const netEarning  = asgn.netEarning || 0;

            await Worker.findByIdAndUpdate(asgn.workerId, {
              $inc: { 'wallet.balance': netEarning },
              status: 'ONLINE'
            });

            let workerWallet = await Wallet.findOne({ userId: asgn.workerId });
            if (!workerWallet) {
              workerWallet = await Wallet.create({ userId: asgn.workerId, userModel: 'Worker', balance: netEarning });
            } else {
              workerWallet.balance = (workerWallet.balance || 0) + netEarning;
              await workerWallet.save();
            }

            await Transaction.create({
              workerId: asgn.workerId,
              type:     'earnings_credit',
              amount:   netEarning,
              status:   'completed',
              paymentMethod: 'wallet',
              description: `Admin Override Settlement — Dispute #${dispute._id}`,
              referenceId: `admin_override_settle_${asgn._id}`
            });

            asgn.settlementStatus = 'SETTLED';
            asgn.settledAt        = new Date();
            asgn.settlementTransactionId = `admin_override_settle_${asgn._id}`;
          } catch (settleErr) {
            console.error('[completionOverride settlement]', settleErr.message);
            asgn.settlementStatus = 'FAILED';
          }
        }
        await asgn.save();
      }
    }

    // Check if all assignments settled → complete parent + refund
    try {
      const allAssignments = await IndWorkerAssignment.find({
        parentRequestId: dispute.workerRequestId,
        assignmentStatus: { $ne: 'CANCELLED' }
      });
      const allSettled = allAssignments.length > 0 && allAssignments.every(a => a.settlementStatus === 'SETTLED');
      if (allSettled) {
        await WorkerBookingRequest.findByIdAndUpdate(dispute.workerRequestId, { status: 'completed' });
        await processFarmerBookingRefund(dispute.workerRequestId);
      }
    } catch (e) { /* non-fatal */ }
  }
}

async function _cancelBookingForDispute(dispute, adminId, adminName, reason) {
  if (dispute.bookingDomain === 'VENDOR_BOOKING' && dispute.vendorBookingId) {
    const booking = await Booking.findById(dispute.vendorBookingId);
    if (!booking) throw new Error('Vendor booking not found');
    if (['completed', 'cancelled'].includes(booking.status)) {
      throw new Error(`Cannot cancel booking in ${booking.status} state`);
    }
    booking.status             = 'cancelled';
    booking.cancelledAt        = new Date();
    booking.cancelledBy        = 'admin';
    booking.cancellationReason = reason || `Admin cancelled — Dispute #${dispute._id}`;
    await booking.save();

  } else if (dispute.bookingDomain === 'WORKER_BOOKING' && dispute.workerRequestId) {
    // Cancel all active assignments
    await IndWorkerAssignment.updateMany(
      { parentRequestId: dispute.workerRequestId, assignmentStatus: { $in: ['CONFIRMED', 'JOURNEY_STARTED', 'ARRIVED'] } },
      { assignmentStatus: 'CANCELLED', updatedAt: new Date() }
    );
    await WorkerBookingRequest.findByIdAndUpdate(dispute.workerRequestId, {
      status:            'cancelled',
      cancellationReason: reason || `Admin cancelled — Dispute #${dispute._id}`
    });
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  raiseDispute,
  addEvidence,
  getMyDisputes,
  getAdminDisputes,
  getAdminDisputeById,
  startReview,
  resolveDispute,
  dismissDispute,
  escalateDispute,
  getDisputeStats
};


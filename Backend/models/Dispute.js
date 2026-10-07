'use strict';

const mongoose = require('mongoose');

/**
 * Dispute Model — v2
 *
 * Handles complaints & disputes for BOTH booking domains:
 *   A) Farmer ↔ Vendor  (bookingDomain = 'VENDOR_BOOKING')  → linked via vendorBookingId → Booking
 *   B) Farmer ↔ Worker  (bookingDomain = 'WORKER_BOOKING')  → linked via workerRequestId → WorkerBookingRequest
 *                                                           and optionally assignmentId → IndWorkerAssignment
 *
 * NEVER: cross-domain references (vendor booking dispute should NOT reference worker assignments)
 * ALWAYS: admin resolution actions are recorded in the auditLog sub-array for immutability
 */

// ── Evidence item sub-schema ────────────────────────────────────────────────
const evidenceSchema = new mongoose.Schema({
  uploadedBy:    { type: mongoose.Schema.Types.ObjectId, required: true },
  uploaderModel: { type: String, enum: ['User', 'Vendor', 'Worker', 'Admin'], required: true },
  uploaderRole:  { type: String, enum: ['FARMER', 'VENDOR', 'WORKER', 'ADMIN'], required: true },
  url:           { type: String, required: true },
  fileType:      { type: String, enum: ['image', 'video', 'document', 'audio'], default: 'image' },
  caption:       { type: String, trim: true, default: '' },
  uploadedAt:    { type: Date, default: Date.now }
}, { _id: true });

// ── Immutable audit-log entry sub-schema ────────────────────────────────────
const auditEntrySchema = new mongoose.Schema({
  performedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  adminName:      { type: String, required: true },
  action:         { type: String, required: true },
  previousStatus: { type: String },
  newStatus:      { type: String },
  notes:          { type: String, trim: true, default: '' },
  metadata:       { type: mongoose.Schema.Types.Mixed, default: null },
  timestamp:      { type: Date, default: Date.now }
}, { _id: true });

// ── Main Dispute Schema ─────────────────────────────────────────────────────
const disputeSchema = new mongoose.Schema({

  // ── 1. Booking Domain Classification ──────────────────────────────────────
  bookingDomain: {
    type: String,
    enum: ['VENDOR_BOOKING', 'WORKER_BOOKING'],
    required: true,
    index: true
  },

  // ── 2. Domain-Specific References ─────────────────────────────────────────
  // VENDOR_BOOKING domain
  vendorBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null,
    index: true
  },

  // WORKER_BOOKING domain — parent request
  workerRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkerBookingRequest',
    default: null,
    index: true
  },

  // WORKER_BOOKING domain — specific assignment (optional, for per-worker disputes)
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IndWorkerAssignment',
    default: null,
    index: true
  },

  // ── 3. Principals ─────────────────────────────────────────────────────────
  raisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  raisedByModel: {
    type: String,
    enum: ['User', 'Vendor', 'Worker'],
    required: true
  },
  raisedByRole: {
    type: String,
    enum: ['FARMER', 'VENDOR', 'WORKER'],
    required: true
  },

  // ── 4. Dispute Content ────────────────────────────────────────────────────
  reason: {
    type: String,
    required: true,
    enum: [
      'Quality Issue',
      'Delay / Late Arrival',
      'Payment Dispute',
      'No Show',
      'Poor Driver Behavior',
      'OTP Refusal',
      'Work Not Completed',
      'Worker Absent',
      'Underpayment',
      'Overbilling',
      'Other'
    ]
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },

  // ── 5. Evidence ───────────────────────────────────────────────────────────
  evidence: [evidenceSchema],
  attachments: [{ type: String }], // Legacy flat URLs

  // ── 6. Status Machine ─────────────────────────────────────────────────────
  status: {
    type: String,
    enum: [
      'OPEN',
      'UNDER_REVIEW',
      'RESOLVED',
      'DISMISSED',
      'PARTIAL_SETTLEMENT',
      // Legacy aliases for backward-compat
      'pending',
      'investigating',
      'resolved',
      'dismissed'
    ],
    default: 'OPEN',
    index: true
  },

  // ── 7. Resolution Fields ──────────────────────────────────────────────────
  resolutionType: {
    type: String,
    enum: [
      'ADMIN_COMPLETION_OVERRIDE',
      'PARTIAL_SETTLEMENT',
      'FULL_REFUND_TO_FARMER',
      'VENDOR_PENALTY',
      'WORKER_PENALTY',
      'BOOKING_CANCELLED_BY_ADMIN',
      'DISMISSED_NO_ACTION',
      'CUSTOM_RESOLUTION'
    ],
    default: null
  },
  resolutionNotes: {
    type: String,
    trim: true,
    default: ''
  },
  resolutionFinancials: {
    refundedToFarmer:       { type: Number, default: 0 },
    penaltyAppliedToVendor: { type: Number, default: 0 },
    penaltyAppliedToWorker: { type: Number, default: 0 },
    adjustedWorkerPayout:   { type: Number, default: 0 },
    currency:               { type: String, default: 'INR' }
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },

  // ── 8. Admin Intervention History (Immutable Log) ─────────────────────────
  auditLog: [auditEntrySchema],

  // ── 9. Priority / Escalation ─────────────────────────────────────────────
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM',
    index: true
  },
  escalatedAt:    { type: Date, default: null },
  escalationNote: { type: String, default: '' },

  // ── 10. Internal Admin Tags ───────────────────────────────────────────────
  internalTags: [{ type: String, trim: true }],

  // ── 11. Lane Bridging: Source Support Ticket ──────────────────────────────
  sourceTicketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupportTicket',
    default: null,
    index: true
  },
  sourceTicketNumber: {
    type: String,
    trim: true,
    default: null
  }

}, {
  timestamps: true
});

// ── Compound Indexes ─────────────────────────────────────────────────────────
disputeSchema.index({ bookingDomain: 1, status: 1, createdAt: -1 });
disputeSchema.index({ vendorBookingId: 1, raisedBy: 1 }, { sparse: true });
disputeSchema.index({ workerRequestId: 1, raisedBy: 1 }, { sparse: true });
disputeSchema.index({ resolvedBy: 1, resolvedAt: -1 }, { sparse: true });

module.exports = mongoose.model('Dispute', disputeSchema);

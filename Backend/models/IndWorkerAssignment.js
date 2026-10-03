'use strict';

/**
 * IndWorkerAssignment
 *
 * Source of truth for each individual worker's assignment within a
 * WorkerBookingRequest (parent). One document per selected worker.
 *
 * Lifecycle dimensions are SEPARATED into multiple status fields so that
 * transitions can be independently tracked and validated without a single
 * monolithic status string.
 *
 * NEVER: one assignment contains multiple workers
 * ALWAYS: 1 WorkerBookingRequest -> N IndWorkerAssignment (even for N=1)
 */

const mongoose = require('mongoose');

// OTP TTL (minutes)
const OTP_TTL_MINUTES = 60; // 1 hour for visit/completion OTP

const indWorkerAssignmentSchema = new mongoose.Schema(
  {
    // Parent reference
    parentRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkerBookingRequest',
      required: true,
      index: true
    },

    // Principals
    farmerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
      index: true
    },
    /**
     * Set only when the booking mode is TEAM_LEADER.
     * The Team Leader who coordinated this assignment.
     */
    teamLeaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      default: null
    },

    // Worker classification
    workerType: {
      type: String,
      enum: ['INDEPENDENT', 'TEAM_MEMBER'],
      default: 'INDEPENDENT',
      required: true
    },

    // Rate agreed at payment lock-in
    agreedRate: {
      type: Number,
      required: true,
      min: 0
    },
    rateUnit: {
      type: String,
      enum: ['hourly', 'daily'],
      default: 'daily'
    },

    // ════════════════════════════════════════════════════════════════════════
    // BOOKING TYPE — mirrors the parent WorkerBookingRequest.bookingType.
    //   HOURLY: uses scheduledDate + startTime + endTime + single OTP flow
    //   DAILY:  uses startDate + numberOfDays + per-day dailyLogs
    // Existing documents with bookingType=null are treated as legacy HOURLY.
    // ════════════════════════════════════════════════════════════════════════
    bookingType: {
      type: String,
      enum: ['HOURLY', 'DAILY'],
      default: 'HOURLY',
      index: true
    },

    // Idempotency key for assignment creation
    creationIdempotencyKey: {
      type: String,
      unique: true,
      sparse: true
    },

    // -------------------------------------------------------------------------
    // STATUS DIMENSIONS
    // -------------------------------------------------------------------------

    /**
     * Top-level assignment lifecycle:
     *   CONFIRMED   - created after successful payment, worker is committed
     *   COMPLETED   - all work verified and settlement finished (terminal; no further mutation)
     *   CANCELLED   - cancelled by farmer, admin, or system
     *   REPLACED    - worker was replaced (another worker substituted)
     */
    assignmentStatus: {
      type: String,
      enum: ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'REPLACED'],
      default: 'CONFIRMED',
      index: true
    },

    /**
     * Journey phase:
     *   NOT_STARTED      - worker hasn't started travelling yet
     *   JOURNEY_STARTED  - worker pressed "Start Journey"
     *   ARRIVED          - worker marked themselves as arrived at farm
     */
    journeyStatus: {
      type: String,
      enum: ['NOT_STARTED', 'JOURNEY_STARTED', 'ARRIVED'],
      default: 'NOT_STARTED'
    },

    /**
     * Visit OTP dimension:
     *   PENDING  - OTP not yet verified
     *   VERIFIED - farmer showed OTP, worker verified
     *   EXPIRED  - OTP TTL elapsed
     *   LOCKED   - too many failed attempts
     */
    visitOtpStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED'],
      default: 'PENDING'
    },

    /**
     * Work dimension:
     *   NOT_STARTED  - work hasn't begun
     *   IN_PROGRESS  - worker started work (post visit-OTP)
     *   SUBMITTED    - worker submitted completion proof
     */
    workStatus: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED'],
      default: 'NOT_STARTED'
    },

    /**
     * Completion dimension:
     *   PENDING      - completion OTP not yet verified
     *   OTP_VERIFIED - farmer confirmed completion via OTP
     */
    completionStatus: {
      type: String,
      enum: ['PENDING', 'OTP_VERIFIED'],
      default: 'PENDING'
    },

    /**
     * Settlement dimension:
     *   PENDING    - not yet processed
     *   PROCESSING - in flight
     *   SETTLED    - worker wallet credited
     *   FAILED     - settlement failed
     */
    settlementStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SETTLED', 'FAILED'],
      default: 'PENDING',
      index: true
    },

    /**
     * Location availability:
     *   AVAILABLE    - fresh GPS coordinates on record
     *   STALE        - last update was > threshold ago
     *   UNAVAILABLE  - worker GPS unavailable
     */
    locationStatus: {
      type: String,
      enum: ['AVAILABLE', 'STALE', 'UNAVAILABLE'],
      default: 'UNAVAILABLE'
    },

    // -------------------------------------------------------------------------
    // OTP FIELDS
    // -------------------------------------------------------------------------
    visitOtpCode: {
      type: String,
      default: null
    },
    visitOtpHash: {
      type: String,
      default: null,
      select: false
    },
    visitOtpExpiresAt: {
      type: Date,
      default: null
    },
    visitOtpAttempts: {
      type: Number,
      default: 0
    },

    completionOtpCode: {
      type: String,
      default: null
    },
    completionOtpHash: {
      type: String,
      default: null,
      select: false
    },
    completionOtpExpiresAt: {
      type: Date,
      default: null
    },
    completionOtpAttempts: {
      type: Number,
      default: 0
    },

    // -------------------------------------------------------------------------
    // LIVE LOCATION
    // -------------------------------------------------------------------------
    liveLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      speed: { type: Number, default: null },
      heading: { type: Number, default: null }
    },
    lastLocationAt: {
      type: Date,
      default: null,
      index: true
    },

    // -------------------------------------------------------------------------
    // TIMESTAMPS
    // -------------------------------------------------------------------------
    journeyStartedAt:         { type: Date, default: null },
    arrivedAt:                { type: Date, default: null },
    visitOtpVerifiedAt:       { type: Date, default: null },
    workStartedAt:            { type: Date, default: null },
    workSubmittedAt:          { type: Date, default: null },
    completionOtpVerifiedAt:  { type: Date, default: null },
    workCompletedAt:          { type: Date, default: null },
    settledAt:                { type: Date, default: null },
    cancelledAt:              { type: Date, default: null },

    cancellationReason:       { type: String, default: null },

    // -------------------------------------------------------------------------
    // WORK PROOF
    // -------------------------------------------------------------------------
    completionProof: {
      fileUrl:    { type: String, default: null },
      publicId:   { type: String, default: null },
      mimeType:   { type: String, default: null },
      notes:      { type: String, default: null },
      uploadedAt: { type: Date,   default: null }
    },

    // -------------------------------------------------------------------------
    // FINANCIALS
    // -------------------------------------------------------------------------
    grossAmount: {
      type: Number,
      required: true,
      min: 0
    },
    commissionRate: {
      type: Number,
      required: true,
      min: 0
    },
    commissionAmount: {
      type: Number,
      required: true,
      min: 0
    },
    netEarning: {
      type: Number,
      required: true,
      min: 0
    },
    settlementTransactionId: {
      type: String,
      default: null,
      index: true
    },

    legacyBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null
    },

    // Payment details
    paymentMethod: {
      type: String,
      enum: ['online', 'cash', 'plan_benefit', 'qr_online'],
      default: 'online'
    },
    isCashBooking: {
      type: Boolean,
      default: false
    },
    qrPayment: {
      refId: { type: String, default: null },
      amount: { type: Number, default: null },
      adminUpiId: { type: String, default: null },
      status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
      utr: { type: String, default: null },
      generatedAt: { type: Date, default: null },
      confirmedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null }
    },

    // ════════════════════════════════════════════════════════════════════════
    // DAILY-ONLY: PER-DAY ATTENDANCE LOGS
    // One entry is created per working day when the worker starts that day.
    // ════════════════════════════════════════════════════════════════════════
    dailyLogs: [{
      dayNumber: { type: Number, required: true },          // 1, 2, 3 ...
      date:      { type: Date,   required: true },           // calendar date for this day

      // Worker journey for this day
      journeyStatus: {
        type: String,
        enum: ['NOT_STARTED', 'JOURNEY_STARTED', 'ARRIVED'],
        default: 'NOT_STARTED'
      },
      journeyStartedAt: { type: Date, default: null },
      arrivedAt:        { type: Date, default: null },

      // Reach / Visit OTP for this day (fresh per day; previous day OTP cannot be reused)
      visitOtpCode:       { type: String, default: null },
      visitOtpHash:       { type: String, default: null, select: false },
      visitOtpVerifiedAt: { type: Date,   default: null },
      visitOtpAttempts:   { type: Number, default: 0 },
      visitOtpStatus: {
        type: String,
        enum: ['PENDING', 'VERIFIED', 'EXPIRED'],
        default: 'PENDING'
      },
      visitOtpExpiresAt: { type: Date, default: null },

      // Work status for this day
      workStatus: {
        type: String,
        enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'],
        default: 'NOT_STARTED'
      },
      workStartedAt: { type: Date, default: null },

      // Completion OTP for this day (farmer gives to worker to confirm day done)
      completionOtpCode:       { type: String, default: null },
      completionOtpHash:       { type: String, default: null, select: false },
      completionOtpVerifiedAt: { type: Date,   default: null },
      completionOtpAttempts:   { type: Number, default: 0 },
      completionOtpExpiresAt:  { type: Date,   default: null },

      completedAt: { type: Date, default: null }
    }],

    // DAILY lifecycle counters
    workedDays:      { type: Number, default: 0 },    // actual completed days
    bookedDays:      { type: Number, default: null },  // original days booked
    currentDayIndex: { type: Number, default: 1 },    // which day is currently active (1-based)

    // DAILY decrease (farmer removes this worker before all days are done)
    isDecreased:    { type: Boolean, default: false },
    decreasedAt:    { type: Date,    default: null },
    decreaseReason: { type: String,  default: null },

    // Extension references
    extensionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'IndWorkerExtension' }],

    // Number of times the farmer re-issued a visit OTP (capped, see otpUtil.OTP_MAX_REGENERATIONS)
    visitOtpRegenerations: { type: Number, default: 0 },

    // extensions already applied to this assignment (makes applying them idempotent)
    appliedExtensionIds: [{ type: mongoose.Schema.Types.ObjectId }],

    // Settlement claim (atomic PENDING/FAILED -> PROCESSING) so a crashed run can be detected/retried
    settlementClaimedAt: { type: Date, default: null },

    // Late-arrival penalty actually applied (previously written but dropped by strict mode)
    latePenalty: {
      applied:     { type: Boolean, default: false },
      amount:      { type: Number, default: 0 },
      minutesLate: { type: Number, default: 0 },
      ruleType:    { type: String, default: null },
      appliedAt:   { type: Date, default: null }
    },

    cancelledBy: { type: String, default: null },

    // Audit trail of lifecycle events (who/what/when) — append-only
    auditLog: [{
      at:     { type: Date, default: Date.now },
      actor:  { type: String },          // 'farmer' | 'worker' | 'system' | 'admin'
      actorId:{ type: mongoose.Schema.Types.ObjectId, default: null },
      event:  { type: String },
      meta:   { type: mongoose.Schema.Types.Mixed, default: null }
    }]
  },
  {
    timestamps: true
  }
);

// ── Default-deny serialization of secrets ───────────────────────────────────
// Plaintext OTPs are kept only so the FARMER can be shown the code. They (and their hashes) must never
// leave through a generic res.json(assignment); code that deliberately needs them reads the fields
// explicitly or serializes with `toJSON({ includeOtp: true })`.
const OTP_SECRET_FIELDS = ['visitOtpCode', 'visitOtpHash', 'completionOtpCode', 'completionOtpHash'];
const stripOtpSecrets = (_doc, ret, options) => {
  if (options && options.includeOtp) return ret;
  OTP_SECRET_FIELDS.forEach(k => { delete ret[k]; });
  if (Array.isArray(ret.dailyLogs)) {
    ret.dailyLogs.forEach(l => { if (l) OTP_SECRET_FIELDS.forEach(k => { delete l[k]; }); });
  }
  return ret;
};
indWorkerAssignmentSchema.set('toJSON', { transform: stripOtpSecrets });
indWorkerAssignmentSchema.set('toObject', { transform: stripOtpSecrets });

// Indexes
indWorkerAssignmentSchema.index({ parentRequestId: 1, assignmentStatus: 1 });
indWorkerAssignmentSchema.index({ workerId: 1, assignmentStatus: 1 });
indWorkerAssignmentSchema.index({ farmerId: 1, assignmentStatus: 1 });
indWorkerAssignmentSchema.index({ parentRequestId: 1, workerId: 1, assignmentStatus: 1 });
indWorkerAssignmentSchema.index({ settlementStatus: 1, workCompletedAt: 1 });
indWorkerAssignmentSchema.index({ lastLocationAt: 1, assignmentStatus: 1 });
indWorkerAssignmentSchema.index({ bookingType: 1, assignmentStatus: 1 });  // DAILY queries
indWorkerAssignmentSchema.index({ workerId: 1, bookingType: 1, assignmentStatus: 1 });  // DAILY conflict

indWorkerAssignmentSchema.statics.OTP_TTL_MINUTES = OTP_TTL_MINUTES;
indWorkerAssignmentSchema.statics.OTP_MAX_ATTEMPTS = 5;

module.exports = mongoose.model('IndWorkerAssignment', indWorkerAssignmentSchema);
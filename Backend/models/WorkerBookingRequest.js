'use strict';
const mongoose = require('mongoose');

/**
 * WorkerBookingRequest — Parent document for a farmer's worker hiring event.
 *
 * UNIFIED ARCHITECTURE:
 *   1 WorkerBookingRequest  →  N IndWorkerAssignment (one per selected worker)
 *
 * bookingMode is ALWAYS determined by the backend using independentWorkerLimitSnapshot.
 * The frontend must NEVER determine booking mode.
 *
 * Legacy fields are preserved (but marked deprecated) so existing data remains readable.
 */
const workerBookingRequestSchema = new mongoose.Schema({
  farmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // DEPRECATED: legacy single-worker target (kept for backward compat only)
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null,
    index: true
  },

  // Work Details
  workCategory:           { type: String, default: '' },
  workTitle:              { type: String, default: '' },
  workDescription:        { type: String, default: '' },
  requiredSkills:         [{ type: String }],
  additionalInstructions: { type: String, default: '' },

  // Schedule
  // HOURLY-only: required for HOURLY bookings, null for DAILY bookings
  scheduledDate:   { type: Date, default: null, index: true },
  startTime:       { type: String, default: null }, // HH:mm — HOURLY only
  endTime:         { type: String, default: null }, // HH:mm — HOURLY only
  durationMinutes: { type: Number, default: 60 },
  rateUnit:        { type: String, enum: ['hourly', 'daily'], default: 'daily' },

  // ════════════════════════════════════════════════════════════════════════
  // BOOKING TYPE — authoritative, set by backend only.
  //   HOURLY: uses scheduledDate + startTime + endTime
  //   DAILY:  uses startDate + numberOfDays + endDate
  // Existing documents with bookingType=null are treated as legacy HOURLY.
  // ════════════════════════════════════════════════════════════════════════
  bookingType: {
    type: String,
    enum: ['HOURLY', 'DAILY'],
    default: 'HOURLY',
    index: true
  },

  // ════════════════════════════════════════════════════════════════════════
  // DAILY-ONLY SCHEDULE FIELDS
  // (HOURLY uses existing scheduledDate + startTime + endTime above)
  // ════════════════════════════════════════════════════════════════════════
  startDate:    { type: Date, default: null },  // DAILY start date
  endDate:      { type: Date, default: null },  // DAILY end date (startDate + numberOfDays - 1)
  numberOfDays: { type: Number, default: null, min: 1 },

  // DAILY budget (per day)
  minDailyRate: { type: Number, default: null },
  maxDailyRate: { type: Number, default: null },

  // Location
  location: {
    addressLine1: String,
    city:         String,
    state:        String,
    pincode:      String,
    lat:          Number,
    lng:          Number
  },

  // Rate Negotiation (legacy / single-worker only)
  workerRate:        { type: Number, default: null },
  farmerOfferedRate: { type: Number, default: null },
  agreedRate:        { type: Number, default: null },

  negotiation: [{
    by:        { type: String, enum: ['farmer', 'worker'], required: true },
    rate:      { type: Number, required: true },
    message:   { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],

  // ════════════════════════════════════════════════════════════════════════
  // UNIFIED BOOKING MODE (set by backend — never frontend)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * bookingMode — how this request was routed (immutable after creation).
   *   INDEPENDENT_WORKERS — requiredWorkers <= independentWorkerLimitSnapshot
   *   TEAM_LEADER         — requiredWorkers >  independentWorkerLimitSnapshot
   */
  bookingMode: {
    type: String,
    enum: ['INDEPENDENT_WORKERS', 'TEAM_LEADER'],
    default: null,
    index: true
  },

  /**
   * DEPRECATED: requestType — kept for backward compat with old documents.
   * New code should use bookingMode. Both are set on new requests.
   */
  requestType: {
    type: String,
    enum: ['single', 'independent_broadcast', 'team_leader'],
    default: 'single'
  },

  // How many workers the farmer needs
  requiredWorkers: { type: Number, default: 1, min: 1 },

  // ════════════════════════════════════════════════════════════════════════
  // ADMIN ROUTING SNAPSHOT (immutable after creation)
  // CRITICAL: routing must never be re-evaluated using current Admin settings.
  // ════════════════════════════════════════════════════════════════════════
  independentWorkerLimitSnapshot: { type: Number, default: null },

  // Full routing snapshot (for audit)
  routingSnapshot: {
    maxIndependentWorkerRequest: { type: Number, default: null },
    workerSearchRadiusKm:        { type: Number, default: null }
  },

  // ════════════════════════════════════════════════════════════════════════
  // DISPATCH — workers who were notified about this request
  // ════════════════════════════════════════════════════════════════════════
  dispatchedTo: [{
    workerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
    status:      { type: String, enum: ['pending', 'accepted', 'rejected', 'withdrawn', 'expired'], default: 'pending' },
    respondedAt: { type: Date, default: null }
  }],

  eligibleWorkersCount:   { type: Number, default: 0 },
  dispatchedWorkersCount: { type: Number, default: 0 },
  acceptedWorkersCount:   { type: Number, default: 0 },
  rejectedWorkersCount:   { type: Number, default: 0 },

  // Workers who confirmed (set at final booking creation)
  finalWorkers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Worker' }],

  farmerAcceptedPartial: { type: Boolean, default: false },

  // Budget range
  minRate: { type: Number, default: null },
  maxRate: { type: Number, default: null },

  // ════════════════════════════════════════════════════════════════════════
  // WORKER OFFERS — stored server-side, NOT exposed to Farmer pre-payment
  // ════════════════════════════════════════════════════════════════════════
  workerOffers: [{
    workerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
    offeredRate: { type: Number, required: true },
    submittedAt: { type: Date, default: Date.now },
    status:      { type: String, enum: ['pending', 'accepted', 'selected', 'rejected', 'expired'], default: 'pending' }
  }],

  // Team Leader ID if this is handled via Team Leader flow
  teamLeaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },

  // ════════════════════════════════════════════════════════════════════════
  // TEAM MEMBER INVITATIONS (Team Leader → Selected Team Members)
  // Backend single source of truth for individual member invitations.
  // ════════════════════════════════════════════════════════════════════════
  memberInvitations: [{
    workerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true, index: true },
    leaderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
    offeredRate: { type: Number, required: true },
    rateUnit:    { type: String, enum: ['hourly', 'daily'], default: 'daily' },
    status:      { 
      type: String, 
      enum: ['member_pending', 'member_accepted', 'member_rejected', 'member_expired'], 
      default: 'member_pending',
      index: true
    },
    invitedAt:   { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null }
  }],

  // Worker IDs explicitly selected by Farmer (before payment)
  selectedWorkerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Worker' }],

  // ════════════════════════════════════════════════════════════════════════
  // NEW: IndWorkerAssignment references (unified architecture)
  // These are created after successful payment verification.
  // This is the new source of truth for per-worker lifecycle.
  // ════════════════════════════════════════════════════════════════════════
  assignmentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IndWorkerAssignment'
  }],

  // ════════════════════════════════════════════════════════════════════════
  // PAYMENT TRACKING
  // ════════════════════════════════════════════════════════════════════════
  paymentStatus: {
    type: String,
    enum: ['not_started', 'pending', 'success', 'failed', 'cash_pending'],
    default: 'not_started'
  },
  paymentMethod: {
    type: String,
    enum: ['online', 'wallet', 'cash', 'qr_online', null],
    default: null
  },
  razorpayOrderId:   { type: String, default: null },
  razorpayPaymentId: { type: String, default: null },
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

  // Immutable financial snapshot (locked at payment creation time)
  financialSnapshot: {
    maximumBudget:        { type: Number, default: null },
    selectedWorkerCount:  { type: Number, default: null },
    maximumWorkerAmount:  { type: Number, default: null },
    platformChargeRate:   { type: Number, default: null },
    platformChargeAmount: { type: Number, default: null },
    totalPayable:         { type: Number, default: null },
    commissionRate:       { type: Number, default: null },
    currency:             { type: String, default: 'INR' },
    createdAt:            { type: Date, default: null }
  },

  // Refund tracking
  refundAmount:      { type: Number, default: null },
  refundCredited:    { type: Boolean, default: false },
  refundCreditedAt:  { type: Date, default: null },

  // ════════════════════════════════════════════════════════════════════════
  // STATUS — parent-level lifecycle
  // ════════════════════════════════════════════════════════════════════════
  status: {
    type: String,
    enum: [
      'pending',                     // Dispatched; waiting for worker responses
      'matching',                    // Backend finding workers (brief interim)
      'accepted',                    // Single-worker (legacy): worker accepted
      'rejected',                    // All workers rejected / no one accepted
      'awaiting_farmer_confirmation', // Enough acceptances; farmer must select & pay
      'confirmed',                   // Payment done; IndWorkerAssignment docs created
      'in_progress',                 // At least one assignment journey started
      'partially_completed',         // Some assignments settled, others pending
      'completed',                   // All selected assignments settled
      'cancelled',                   // Farmer or admin cancelled
      'expired'                      // Timed out without completion
    ],
    default: 'pending',
    index: true
  },

  // ════════════════════════════════════════════════════════════════════════
  // DEPRECATED LEGACY FIELDS — kept for backward compat; do NOT use for
  // new lifecycle logic. New code must use assignmentIds.
  // ════════════════════════════════════════════════════════════════════════

  // @deprecated — use assignmentIds instead
  finalBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  // @deprecated — use assignmentIds instead
  finalBookingIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  }],

  // Auto-expiry
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  },

  // Extension references (IndWorkerExtension docs linked to this booking)
  extensionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'IndWorkerExtension' }],

  rejectionReason: { type: String, default: null }
}, { timestamps: true });

// ── Indexes ──────────────────────────────────────────────────────────────────
workerBookingRequestSchema.index({ farmerId: 1, status: 1 });
workerBookingRequestSchema.index({ finalBookingIds: 1 });
workerBookingRequestSchema.index({ finalBookingId: 1 });
workerBookingRequestSchema.index({ workerId: 1, status: 1 });
workerBookingRequestSchema.index({ 'dispatchedTo.workerId': 1 });
workerBookingRequestSchema.index({ workerId: 1, scheduledDate: 1, status: 1 });
workerBookingRequestSchema.index({ bookingMode: 1, status: 1 });
workerBookingRequestSchema.index({ bookingType: 1, status: 1 });
workerBookingRequestSchema.index({ startDate: 1, endDate: 1, status: 1 });  // DAILY conflict detection
workerBookingRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL
// Prevent duplicate active broadcast from same farmer for same date+time
workerBookingRequestSchema.index(
  { farmerId: 1, scheduledDate: 1, startTime: 1, requestType: 1 },
  { partialFilterExpression: { status: 'pending', requestType: 'independent_broadcast' } }
);

module.exports = mongoose.model('WorkerBookingRequest', workerBookingRequestSchema);

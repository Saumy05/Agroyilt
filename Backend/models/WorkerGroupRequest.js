'use strict';
const mongoose = require('mongoose');

/**
 * WorkerGroupRequest
 * Tracks a farmer's group-worker hire request through a Team Leader,
 * including member dispatch, individual acceptance, leader selection,
 * and rate negotiation.
 *
 * LIFECYCLE (v2 — unified with IndWorkerAssignment architecture):
 *   pending → leader_accepted → collecting_members → selection_pending
 *       → awaiting_payment  (NEW — leader selected, farmer must pay)
 *       → payment_pending   (NEW — Razorpay order created)
 *       → confirmed         (NEW — payment verified, IndWorkerAssignment docs created)
 *       → completed / cancelled / rejected / expired
 */
const workerGroupRequestSchema = new mongoose.Schema({
  farmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  teamLeaderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    index: true
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true,
    index: true
  },

  // Work Details
  workCategory:    { type: String, default: '' },
  workTitle:       { type: String, default: '' },
  workDescription: { type: String, default: '' },
  requiredSkills:  [{ type: String }],
  additionalInstructions: { type: String, default: '' },

  // Schedule
  scheduledDate: { type: Date, required: true, index: true },
  startTime:     { type: String, required: true },
  endTime:       { type: String, required: true },
  rateUnit:      { type: String, enum: ['hourly', 'daily', 'theka'], default: 'daily' },

  // ════════════════════════════════════════════════════════════════════════
  // BOOKING TYPE — mirrors WorkerBookingRequest.bookingType
  //   HOURLY: uses scheduledDate + startTime + endTime + durationMinutes
  //   DAILY:  uses startDate + numberOfDays
  //   THEKA:  uses scheduledDate + startTime + endTime (contract/task-based)
  // ════════════════════════════════════════════════════════════════════════
  bookingType: {
    type: String,
    enum: ['HOURLY', 'DAILY', 'THEKA'],
    default: 'HOURLY'
  },

  // DAILY-only schedule fields
  startDate:    { type: Date,   default: null },
  endDate:      { type: Date,   default: null },
  numberOfDays: { type: Number, default: null, min: 1 },
  durationMinutes: { type: Number, default: 60 }, // HOURLY only

  // DAILY rate fields
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

  // Worker Count
  requiredWorkers: { type: Number, required: true, min: 1 },

  // Rate Negotiation (per worker, per unit)
  leaderRate:                 { type: Number, required: true }, // Snapshot of leader's rate
  farmerOfferedRatePerWorker: { type: Number, required: true },
  agreedRatePerWorker:        { type: Number, default: null },  // Set only after agreement

  negotiation: [{
    by:        { type: String, enum: ['farmer', 'leader'], required: true },
    rate:      { type: Number, required: true },
    message:   { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],

  // Overall request status (Farmer ↔ Leader negotiation + lifecycle)
  status: {
    type: String,
    enum: [
      'pending',             // Waiting for leader to respond
      'leader_accepted',     // Leader accepted, not yet dispatched to members
      'collecting_members',  // Member requests sent out
      'selection_pending',   // All members responded, leader yet to select
      'awaiting_payment',    // Leader selected workers; farmer must pay  ← NEW
      'payment_pending',     // Razorpay order created; awaiting farmer payment  ← NEW
      'confirmed',           // Payment verified; IndWorkerAssignment docs created  ← NEW
      'completed',           // All assignments settled  ← NEW
      'rejected',            // Leader rejected
      'cancelled',           // Farmer or admin cancelled
      'expired'              // Timed out
    ],
    default: 'pending',
    index: true
  },

  // Individual member requests sent by the leader
  memberRequests: [{
    workerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
    status:      { 
      type: String, 
      enum: ['pending', 'member_pending', 'accepted', 'member_accepted', 'rejected', 'member_rejected', 'expired', 'member_expired', 'withdrawn'], 
      default: 'member_pending' 
    },
    respondedAt: { type: Date, default: null }
  }],

  // Final workers selected by the leader (array of workerIds)
  selectedWorkers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker'
  }],

  // ════════════════════════════════════════════════════════════════════════
  // UNIFIED ARCHITECTURE LINKS  ← NEW
  // Created after payment verification. One WorkerBookingRequest (parent)
  // with N IndWorkerAssignment docs (one per selected worker).
  // ════════════════════════════════════════════════════════════════════════

  /** The parent WorkerBookingRequest created for this group booking */
  workerBookingRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkerBookingRequest',
    default: null
  },

  /** Mirror of WorkerBookingRequest.assignmentIds for quick access */
  assignmentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IndWorkerAssignment'
  }],

  // ════════════════════════════════════════════════════════════════════════
  // FINANCIAL SNAPSHOT  ← NEW
  // Locked at the moment the leader calls select-workers. Immutable after that.
  // ════════════════════════════════════════════════════════════════════════
  financialSnapshot: {
    agreedRatePerWorker:  { type: Number, default: null },
    selectedWorkerCount:  { type: Number, default: null },
    maximumWorkerAmount:  { type: Number, default: null }, // agreedRate × workers × duration
    platformChargeRate:   { type: Number, default: null },
    platformChargeAmount: { type: Number, default: null },
    totalPayable:         { type: Number, default: null },
    commissionRate:       { type: Number, default: null },
    currency:             { type: String, default: 'INR' },
    bookingType:          { type: String, default: null },
    numberOfDays:         { type: Number, default: null },
    durationMinutes:      { type: Number, default: null },
    createdAt:            { type: Date,   default: null },
    // Travel charge for the Team Leader's trip to the farm (admin: Settings > Travel Charges); part of totalPayable
    travelChargeTotal:    { type: Number, default: 0 },
    travelCharges: [{
      _id: false,
      workerId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Worker' },
      distanceKm:     { type: Number, default: null },
      method:         { type: String, default: null },
      outboundAmount: { type: Number, default: 0 },
      returnAmount:   { type: Number, default: 0 },
      amount:         { type: Number, default: 0 },
      capped:         { type: Boolean, default: false }
    }]
  },

  // ════════════════════════════════════════════════════════════════════════
  // PAYMENT TRACKING  ← NEW
  // ════════════════════════════════════════════════════════════════════════
  paymentStatus: {
    type: String,
    enum: ['not_started', 'pending', 'success', 'failed', 'cash_pending'],
    default: 'not_started'
  },
  paymentMethod: {
    type: String,
    enum: ['online', 'wallet', 'cash', null],
    default: null
  },
  razorpayOrderId:   { type: String, default: null },
  razorpayPaymentId: { type: String, default: null },

  // Refund tracking
  refundAmount:     { type: Number,  default: null },
  refundCredited:   { type: Boolean, default: false },
  refundCreditedAt: { type: Date,    default: null },

  // ════════════════════════════════════════════════════════════════════════
  // LEGACY — kept for backward compat
  // ════════════════════════════════════════════════════════════════════════

  // @deprecated — use assignmentIds instead
  finalBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },

  rejectionReason: { type: String, default: null },

  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours
  }
}, { timestamps: true });

// Indexes
workerGroupRequestSchema.index({ farmerId: 1, status: 1 });
workerGroupRequestSchema.index({ teamLeaderId: 1, status: 1 });
workerGroupRequestSchema.index({ teamId: 1, scheduledDate: 1 });
workerGroupRequestSchema.index({ 'memberRequests.workerId': 1 });
workerGroupRequestSchema.index({ workerBookingRequestId: 1 });

module.exports = mongoose.model('WorkerGroupRequest', workerGroupRequestSchema);

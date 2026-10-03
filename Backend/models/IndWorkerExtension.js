'use strict';

/**
 * IndWorkerExtension
 *
 * Tracks a single extension request from a Farmer for a confirmed booking.
 * Works for both HOURLY (extension in minutes) and DAILY (additional days).
 *
 * LIFECYCLE:
 *   REQUESTED       -> Farmer created the extension; workers being notified
 *   WORKER_EVALUATION -> At least one worker notified; waiting for responses
 *   PAYMENT_PENDING -> Evaluation window closed; farmer must pay for accepted workers
 *   CONFIRMED       -> Payment verified; extensions applied to assignments
 *   REJECTED        -> All workers rejected (or 0 accepted after evaluation)
 *   EXPIRED         -> Evaluation timeout passed with no accepted workers (DISTINCT from REJECTED)
 *   CANCELLED       -> Farmer cancelled before payment
 *
 * Per-worker status:
 *   REQUESTED -> ACCEPTED | REJECTED | EXPIRED
 *   EXPIRED means the worker did NOT respond within extensionExpiryMinutes.
 *   REJECTED means the worker explicitly declined.
 *   These are DISTINCT for audit trail.
 */

const mongoose = require('mongoose');

const indWorkerExtensionSchema = new mongoose.Schema({

  // Parent booking reference
  parentRequestId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'WorkerBookingRequest',
    required: true,
    index:    true
  },

  // Booking mode
  bookingType: {
    type:     String,
    enum:     ['HOURLY', 'DAILY'],
    required: true,
    index:    true
  },

  // Principals
  farmerId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true
  },

  // ── Extension details (only one of extensionMinutes or additionalDays is set) ──
  extensionMinutes: { type: Number, default: null },  // HOURLY only
  additionalDays:   { type: Number, default: null },  // DAILY only

  // ── Extension lifecycle ──────────────────────────────────────────────────────
  status: {
    type:    String,
    enum:    ['REQUESTED', 'WORKER_EVALUATION', 'PAYMENT_PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
    default: 'REQUESTED',
    index:   true
  },

  // Workers have until expiresAt to respond. Past this => EXPIRED (not REJECTED).
  expiresAt: { type: Date, required: true, index: true },

  // ── Per-worker extension entries ─────────────────────────────────────────────
  workerExtensions: [{
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'IndWorkerAssignment',
      required: true
    },
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'Worker',
      required: true
    },

    // Individual worker response
    status: {
      type:    String,
      enum:    ['REQUESTED', 'ACCEPTED', 'REJECTED', 'EXPIRED'],
      default: 'REQUESTED'
    },
    respondedAt: { type: Date, default: null },

    // ── Financial snapshot (immutable after ACCEPTED; set on acceptance) ──────
    // These capture the worker's agreed rate at response time so future
    // Settings changes do NOT retroactively alter this extension's pricing.
    agreedRate:       { type: Number, default: null },  // hourly or daily rate
    rateUnit:         { type: String, default: null },  // 'hourly' | 'daily'
    extensionMinutes: { type: Number, default: null },  // HOURLY: minutes this worker accepted
    additionalDays:   { type: Number, default: null },  // DAILY: days this worker accepted

    // Gross extension earning for THIS worker (INR, paise-precise)
    extensionGrossAmount:     { type: Number, default: null },  // before commission
    extensionCommissionAmount:{ type: Number, default: null },
    extensionNetAmount:       { type: Number, default: null },  // credited to worker wallet

    // Farmer-side: amount this worker contributed to farmer's payable
    extensionFarmerCharge:    { type: Number, default: null }   // agreedRate x duration + pro-rated fee
  }],

  // ── Aggregated financials (set once evaluation window closes) ───────────────
  acceptedWorkerCount:   { type: Number, default: 0 },
  totalServiceAmount:    { type: Number, default: 0 },  // sum of worker extension amounts (INR)
  platformFeeRate:       { type: Number, default: 0 },
  platformFeeAmount:     { type: Number, default: 0 },  // admin platform fee (INR)
  totalPayable:          { type: Number, default: 0 },  // totalServiceAmount + platformFeeAmount
  totalPayableAmount:    { type: Number, default: 0 },
  farmerTotalAmount:     { type: Number, default: 0 },

  // Snapshot of financial settings used (frozen for this extension)
  financialSnapshot: {
    commissionRate:          { type: Number, default: null },
    platformChargeRate:      { type: Number, default: null },
    extensionExpiryMinutes:  { type: Number, default: null },
    createdAt:               { type: Date,   default: null }
  },

  // ── Payment tracking ─────────────────────────────────────────────────────────
  paymentStatus: {
    type:    String,
    enum:    ['not_started', 'pending', 'processing', 'success', 'failed'],
    default: 'not_started',
    index:   true
  },
  razorpayOrderId:  { type: String, default: null },
  razorpayPaymentId:{ type: String, default: null },
  // every order created for this extension, with its amount (payments on any of them are matched / refunded)
  paymentOrders: [{
    orderId:     { type: String, required: true },
    amountPaise: { type: Number, required: true },
    createdAt:   { type: Date, default: Date.now }
  }],
  // 'cash' extensions of cash bookings have no online step: they apply as soon as the workers have answered
  paymentMode: { type: String, enum: ['online', 'cash'], default: 'online' },
  confirmClaimedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  // true while REQUESTED / WORKER_EVALUATION / PAYMENT_PENDING — backs the "one open extension per booking" index
  isActive: { type: Boolean, default: true },

  // ── Idempotency ──────────────────────────────────────────────────────────────
  // Unique key set at creation to prevent duplicate extension creation.
  idempotencyKey: { type: String, unique: true, sparse: true },

  // Settlement state (applied to IndWorkerAssignments post-payment)
  settledAt: { type: Date, default: null }

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
indWorkerExtensionSchema.index({ parentRequestId: 1, status: 1 });
indWorkerExtensionSchema.index({ 'workerExtensions.workerId': 1, status: 1 });
indWorkerExtensionSchema.index({ 'workerExtensions.assignmentId': 1, status: 1 });
indWorkerExtensionSchema.index({ expiresAt: 1, status: 1 });  // expiry cron queries
indWorkerExtensionSchema.index({ razorpayOrderId: 1 });
indWorkerExtensionSchema.index({ 'paymentOrders.orderId': 1 });
// at most ONE open extension per booking, enforced by the database (the old check-then-create could race)
indWorkerExtensionSchema.index({ parentRequestId: 1 }, { name: 'one_open_extension_per_booking', unique: true, partialFilterExpression: { isActive: true } });

module.exports = mongoose.model('IndWorkerExtension', indWorkerExtensionSchema);

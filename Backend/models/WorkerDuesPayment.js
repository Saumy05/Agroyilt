'use strict';

/**
 * WorkerDuesPayment — one attempt by a worker to pay their outstanding dues to the platform.
 *
 *   online : CREATED (Razorpay order made) → PAID (signature verified, dues reduced exactly once)
 *   offline: PENDING_REVIEW (worker paid the admin by cash/UPI) → PAID (admin approved) | REJECTED
 *
 * The amount is fixed by the server when the record is created; the client never decides how much is applied.
 */

const mongoose = require('mongoose');

const workerDuesPaymentSchema = new mongoose.Schema({
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true, index: true },
  amount:   { type: Number, required: true, min: 1 },
  method:   { type: String, enum: ['online', 'offline'], required: true },
  status:   { type: String, enum: ['CREATED', 'PENDING_REVIEW', 'PAID', 'REJECTED'], required: true, index: true },

  // online
  razorpayOrderId:   { type: String, default: null, index: true },
  razorpayPaymentId: { type: String, default: null },

  // offline (worker → admin)
  offlineMode: { type: String, enum: ['cash', 'upi', null], default: null },
  reference:   { type: String, default: null },   // UPI reference / receipt number
  proofUrl:    { type: String, default: null },   // screenshot, optional
  note:        { type: String, default: null },

  // admin review
  reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt:  { type: Date, default: null },
  adminNote:   { type: String, default: null },

  // what actually happened when PAID: dues reduced, and any amount above the remaining dues sent to the wallet
  appliedToDues:  { type: Number, default: 0 },
  excessToWallet: { type: Number, default: 0 },
  paidAt:         { type: Date, default: null }
}, { timestamps: true });

workerDuesPaymentSchema.index({ status: 1, method: 1, createdAt: -1 });

module.exports = mongoose.model('WorkerDuesPayment', workerDuesPaymentSchema);

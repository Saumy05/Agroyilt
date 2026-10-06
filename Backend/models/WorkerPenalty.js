const mongoose = require('mongoose');

const workerPenaltySchema = new mongoose.Schema({
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    index: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  penaltyEventId: {
    type: String,
    required: true,
    unique: true // Ensures idempotency per event (e.g., cancellation)
  },
  
  penaltyType: {
    type: String,
    enum: ['cancellation', 'no_show', 'late_arrival', 'dispute', 'other'],
    required: true
  },
  penaltyAmount: {
    type: Number,
    required: true,
    min: 0
  },
  reason: {
    type: String,
    required: true
  },
  appliedBy: {
    type: String, // e.g., 'system', 'admin'
    default: 'system'
  },
  
  // Action Tracking
  walletDeducted: { type: Boolean, default: false },
  addedToDues: { type: Boolean, default: false },

  status: {
    type: String,
    enum: ['pending', 'applied', 'reversed', 'failed'],
    default: 'applied'
  }
}, { timestamps: true });

module.exports = mongoose.model('WorkerPenalty', workerPenaltySchema);

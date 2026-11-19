const mongoose = require('mongoose');

/**
 * IncentiveRecord Model
 *
 * Records performance incentives granted by admins to Vendors, Workers, or Users.
 * Captures historical performance metrics (rating, bookings completed, dues)
 * at the exact moment the incentive was awarded.
 */
const incentiveRecordSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
    refPath: 'recipientModel'
  },
  recipientModel: {
    type: String,
    required: true,
    enum: ['Vendor', 'Worker', 'User'],
    index: true
  },
  recipientName: {
    type: String,
    default: ''
  },
  recipientPhone: {
    type: String,
    default: ''
  },
  amount: {
    type: Number,
    required: [true, 'Incentive amount is required'],
    min: [1, 'Incentive amount must be at least ₹1']
  },
  reason: {
    type: String,
    required: [true, 'Reason or remarks are required'],
    trim: true
  },
  period: {
    type: String,
    default: 'All Time'
  },
  metricsSnapshot: {
    completedBookings: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    currentDues: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 }
  },
  awardedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  adminName: {
    type: String,
    default: 'Super Admin'
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  },
  status: {
    type: String,
    enum: ['credited', 'reversed'],
    default: 'credited'
  }
}, {
  timestamps: true
});

incentiveRecordSchema.index({ recipientId: 1, createdAt: -1 });
incentiveRecordSchema.index({ recipientModel: 1, createdAt: -1 });

module.exports = mongoose.model('IncentiveRecord', incentiveRecordSchema);

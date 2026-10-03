const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
    type: {
    type: String,
    enum: ['credit', 'debit', 'refund', 'withdrawal', 'commission', 'commission_deduction', 'cash_collected', 'settlement', 'worker_payment', 'earnings_credit', 'tds_deduction', 'payment', 'platform_fee', 'convenience_fee', 'gst', 'penalty', 'ecommerce_full_payment', 'referral_reward', 'referral_reversal'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['wallet', 'razorpay', 'cash', 'bank_transfer', 'system', 'other', 'hand_to_hand', 'online', 'qr_online', 'upi'],
    default: 'wallet'
  },
  description: {
    type: String,
    required: true
  },
  referenceId: {
    type: String,  // Payment gateway reference
    default: null
  },
  balanceBefore: {
    type: Number,
    default: 0
  },
  balanceAfter: {
    type: Number,
    default: 0
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Index for faster queries
transactionSchema.index({ userId: 1, createdAt: -1 });
// at-most-once passbook rows for ledger-driven credits/refunds (see services/ledgerService.js)
transactionSchema.index({ 'metadata.idempotencyKey': 1 }, { unique: true, partialFilterExpression: { 'metadata.idempotencyKey': { $type: 'string' } } });
transactionSchema.index({ vendorId: 1, createdAt: -1 });
transactionSchema.index({ workerId: 1, createdAt: -1 });
transactionSchema.index({ bookingId: 1 });
transactionSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);

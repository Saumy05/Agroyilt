const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  amount: {
    type: Number, // Integer in paise
    required: true
  },
  reason: {
    type: String,
    enum: ['booking_payment', 'commission_deduction', 'refund', 'payout', 'security_deposit_hold', 'security_deposit_release', 'topup', 'referral_reward', 'referral_reversal', 'earnings_credit', 'penalty'],
    required: true
  },
  referenceId: {
    type: String, // bookingId, payoutRequestId, etc.
    required: true
  },
  gatewayTransactionId: {
    type: String,
    default: null
  },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed'],
    default: 'completed'
  }
}, { timestamps: true });

// Ensure fast duplicate lookups and history fetching
walletTransactionSchema.index({ gatewayTransactionId: 1 });
walletTransactionSchema.index({ walletId: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);

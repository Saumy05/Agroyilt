const mongoose = require('mongoose');

/**
 * Settlement Model
 * Tracks vendor settlements (payments to admin to clear negative balance)
 */
const settlementSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  // Before settlement
  balanceBefore: {
    type: Number,
    required: true
  },
  // After settlement (should be closer to 0 or 0)
  balanceAfter: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['upi', 'bank_transfer', 'cash', 'other', 'razorpay'],
    default: 'upi'
  },
  // Reference/Transaction ID from vendor's payment
  paymentReference: {
    type: String,
    default: null
  },
  // Screenshot or proof of payment (Cloudinary URL)
  paymentProof: {
    type: String,
    default: null
  },
  // Admin notes
  adminNotes: {
    type: String,
    default: null
  },
  // Vendor notes
  vendorNotes: {
    type: String,
    default: null
  },
  // Processed by admin
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  },
  // Rejection reason
  rejectionReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
settlementSchema.index({ vendorId: 1, createdAt: -1 });
settlementSchema.index({ status: 1, createdAt: -1 });
// one gateway payment can clear a vendor's dues at most once (verify call and webhook race on this)
settlementSchema.index(
  { paymentReference: 1 },
  { unique: true, partialFilterExpression: { paymentMethod: 'razorpay', paymentReference: { $type: 'string' } } }
);

module.exports = mongoose.model('Settlement', settlementSchema);

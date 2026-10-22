const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  // Universal requester references
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'requesterModel',
    required: true,
    index: true
  },
  requesterModel: {
    type: String,
    enum: ['User', 'Vendor', 'Worker'],
    required: true,
    index: true
  },
  requesterRole: {
    type: String,
    enum: ['user', 'farmer', 'vendor', 'worker'],
    required: true,
    index: true
  },
  workerType: {
    type: String,
    enum: ['WORKER', 'TEAM_LEADER', null],
    default: null
  },
  // Backward compatibility for existing Vendor queries
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null,
    index: true
  },

  // Monetary representations (both INR and safe integer paise)
  amount: {
    type: Number,
    required: true,
    min: [1, 'Withdrawal amount must be at least ₹1']
  },
  amountPaise: {
    type: Number,
    required: true,
    min: [100, 'Withdrawal amount must be at least 100 paise']
  },
  currency: {
    type: String,
    default: 'INR'
  },

  // State Machine Status
  // PENDING -> ADMIN_ACCEPTED -> PROCESSING -> COMPLETED
  // or PENDING / ADMIN_ACCEPTED / PROCESSING -> REJECTED
  status: {
    type: String,
    enum: [
      'PENDING',
      'ADMIN_ACCEPTED',
      'PROCESSING',
      'COMPLETED',
      'REJECTED',
      'FAILED',
      // Legacy lowercase statuses for backward compatibility
      'pending',
      'approved',
      'rejected'
    ],
    default: 'PENDING',
    index: true
  },

  // Immutable Snapshot of Banking Details at the moment of request
  bankDetailsSnapshot: {
    accountHolderName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    accountNumberMasked: { type: String, trim: true },
    ifscCode: { type: String, trim: true },
    bankName: { type: String, trim: true },
    branchName: { type: String, trim: true },
    upiId: { type: String, trim: true }
  },
  // Legacy bankDetails object for backward compatibility
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    bankName: String,
    branchName: String,
    upiId: String
  },

  // Minimum withdrawal limit at request time for auditability
  minimumLimitAtRequestPaise: {
    type: Number,
    default: 30000 // default ₹300
  },
  minimumLimitAtRequest: {
    type: Number,
    default: 300
  },

  // Lifecycle Timestamps & Actors
  requestDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  processingAt: {
    type: Date,
    default: null
  },
  processingBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  },

  // Legacy fields for backward compatibility
  processedDate: {
    type: Date,
    default: null
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },

  // Manual Payment Proof & Reference
  paymentProof: {
    type: String, // Cloudinary URL or secure storage URI
    default: null
  },
  paymentProofPublicId: {
    type: String,
    default: null
  },
  paymentProofMimeType: {
    type: String,
    default: null
  },
  paymentReference: {
    type: String, // Bank reference number / UTR / transaction ID
    default: null
  },
  transactionReference: {
    type: String, // Legacy alias
    default: null
  },
  // Note typed by the requester when they raised the request
  requestNotes: {
    type: String,
    default: null
  },
  // Note written by the admin while accepting / processing / completing
  adminNotes: {
    type: String,
    default: null
  },

  // Deductions (TDS, platform fee if applicable)
  tdsRate: {
    type: Number,
    default: 0
  },
  tdsAmount: {
    type: Number,
    default: 0
  },
  platformFeeRate: {
    type: Number,
    default: 0
  },
  platformFeeAmount: {
    type: Number,
    default: 0
  },
  netAmount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for fast querying
withdrawalSchema.index({ requesterId: 1, createdAt: -1 });
withdrawalSchema.index({ requesterRole: 1, status: 1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });
withdrawalSchema.index({ requestDate: -1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);

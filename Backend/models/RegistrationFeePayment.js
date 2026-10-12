const mongoose = require('mongoose');

const registrationFeePaymentSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'roleModel'
  },
  roleModel: {
    type: String,
    enum: ['User', 'Vendor', 'Worker'],
    required: true
  },
  role: {
    type: String,
    enum: ['USER', 'VENDOR', 'WORKER'],
    required: true
  },
  mobileNumberNormalized: {
    type: String,
    required: true
  },
  gatewayOrderId: {
    type: String,
    sparse: true
  },
  gatewayPaymentId: {
    type: String,
    sparse: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PAID', 'FAILED', 'CANCELLED'],
    default: 'PENDING'
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  feeVersion: {
    type: Number
  },
  paidAt: {
    type: Date
  },
  // Set when a Team Leader paid this fee for an offline (no-smartphone) member
  paidByWorkerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null
  },
  paymentMethod: {
    type: String,
    enum: ['razorpay', 'wallet'],
    default: 'razorpay'
  }
}, { timestamps: true });

// Prevent duplicate successful payments for the exact same account
// A unique index on accountId and status="PAID" is tricky because status is a string,
// but we can add a partial index for PAID status.
registrationFeePaymentSchema.index(
  { accountId: 1, status: 1 }, 
  { unique: true, partialFilterExpression: { status: 'PAID' } }
);

module.exports = mongoose.model('RegistrationFeePayment', registrationFeePaymentSchema);

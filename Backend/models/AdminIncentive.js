const mongoose = require('mongoose');

/**
 * AdminIncentive Model
 * 
 * Immutable, idempotent audit record for per-registration incentive calculations.
 * Ensures:
 * 1. Each (adminId, registeredUserId) pair is calculated strictly once.
 * 2. Complete financial auditing with sequence number, threshold applied, role rate, and earned amount.
 * 3. Geographic scope snapshot at registration time.
 */
const adminIncentiveSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
    index: true
  },
  registeredUserId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  registeredUserRole: {
    type: String,
    enum: ['FARMER', 'VENDOR', 'WORKER'],
    required: true,
    index: true
  },
  registeredUserName: {
    type: String,
    default: ''
  },
  registeredUserPhone: {
    type: String,
    default: ''
  },
  registeredAt: {
    type: Date,
    required: true,
    index: true
  },
  // Global cumulative chronological sequence index for this Admin's scope (1-indexed)
  sequenceNumber: {
    type: Number,
    required: true
  },
  // Minimum combined registration threshold applicable at time of this calculation
  thresholdApplicable: {
    type: Number,
    required: true,
    default: 0
  },
  // Whether this registration exceeded the threshold (sequenceNumber > thresholdApplicable)
  isEligible: {
    type: Boolean,
    required: true,
    default: false
  },
  // Role-specific incentive rate configured on Admin (₹)
  rate: {
    type: Number,
    required: true,
    default: 0
  },
  // Earned incentive amount (rate if isEligible === true, 0 if threshold-locked)
  incentiveAmount: {
    type: Number,
    required: true,
    default: 0
  },
  // Unique idempotency reference key: `INC_${adminId}_${registeredUserId}`
  registrationRef: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Geographic scope snapshot
  scopeType: {
    type: String,
    default: 'GLOBAL'
  },
  districtId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    default: null
  },
  districtName: {
    type: String,
    default: ''
  },
  subDistrictId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubDistrict',
    default: null
  },
  subDistrictName: {
    type: String,
    default: ''
  },
  cityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    default: null
  },
  cityName: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['ACCRUED', 'INCLUDED_IN_PAYROLL', 'PAID', 'VOID'],
    default: 'ACCRUED',
    index: true
  },
  payrollId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminPayroll',
    default: null
  },
  payrollMonth: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Compound unique index ensuring an admin cannot earn duplicate incentives on the same user
adminIncentiveSchema.index({ adminId: 1, registeredUserId: 1 }, { unique: true });
adminIncentiveSchema.index({ adminId: 1, isEligible: 1, registeredAt: -1 });
adminIncentiveSchema.index({ adminId: 1, sequenceNumber: 1 });

module.exports = mongoose.model('AdminIncentive', adminIncentiveSchema);

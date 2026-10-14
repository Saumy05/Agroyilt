const mongoose = require('mongoose');

const referralRewardConfigSchema = new mongoose.Schema({
  type: {
    type: String,
    default: 'global',
    unique: true
  },
  // Referral program is off until an admin turns it on
  systemEnabled: {
    type: Boolean,
    default: false
  },
  registrationUrl: {
    type: String,
    default: 'https://agroyilt.com/app/register',
    trim: true
  },
  roles: {
    farmer: {
      enabled: { type: Boolean, default: false },
      rewardAmountPaise: { type: Number, default: 5000, min: 0 } // ₹50
    },
    vendor: {
      enabled: { type: Boolean, default: false },
      rewardAmountPaise: { type: Number, default: 4000, min: 0 } // ₹40
    },
    worker: {
      enabled: { type: Boolean, default: false },
      rewardAmountPaise: { type: Number, default: 5000, min: 0 } // ₹50
    }
  },
  qualificationEvent: {
    type: String,
    enum: [
      'ADMIN_APPROVAL',
      'REGISTRATION',
      'REGISTRATION_FEE_PAYMENT',
      'on_approval',
      'on_registration',
      'on_registration_fee_payment'
    ],
    default: 'ADMIN_APPROVAL'
  },
  version: {
    type: Number,
    default: 1
  },
  auditHistory: [{
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    adminEmail: {
      type: String
    },
    role: {
      type: String,
      enum: ['farmer', 'vendor', 'worker', 'system']
    },
    field: {
      type: String
    },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now
    },
    notes: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('ReferralRewardConfig', referralRewardConfigSchema);

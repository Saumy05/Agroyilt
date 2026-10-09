const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { WORKER_STATUS } = require('../utils/constants');

const workerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true
  },
  email: {
    type: String,
    unique: true,
    sparse: true, // Allow multiple nulls
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: false,  // Optional for offline members registered by a Team Leader
    unique: true,
    sparse: true,     // Allow multiple nulls (offline members may have no phone)
    trim: true
  },
  role: {
    type: String,
    enum: ['worker'],
    default: 'worker'
  },
  workerType: {
    type: String,
    enum: ['WORKER', 'TEAM_LEADER'],
    default: 'WORKER'
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    default: null
  },

  // ── Offline / No-Smartphone Member (A6) ───────────────────────────────────
  // When a Team Leader registers a laborer who has no phone/app.
  // The leader acts as the digital gateway for this member.
  isOfflineMember: {
    type: Boolean,
    default: false,
    index: true
  },
  managedByLeaderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null,
    index: true
  },
  password: {
    type: String,
    select: false
  },
  // MPIN Login
  mpin: {
    type: String,
    select: false // Never returned in normal queries
  },
  isMpinSet: {
    type: Boolean,
    default: false
  },
  mpinAttempts: {
    type: Number,
    default: 0
  },
  mpinLockedUntil: {
    type: Date,
    default: null
  },
  aadhar: {
    number: {
      type: String,
      trim: true,
      default: null
    },
    document: {
      type: String, // Cloudinary URL (Front)
      default: null
    },
    backDocument: {
      type: String, // Cloudinary URL (Back)
      default: null
    }
  },
  // Commute & Transport Details
  hasBike: {
    type: Boolean,
    default: false,
    index: true
  },
  drivingLicense: {
    number: {
      type: String,
      trim: true,
      uppercase: true,
      default: null
    },
    document: {
      type: String, // Cloudinary URL
      default: null
    }
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending'
  },
  approvalDate: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  },
  registrationFeeStatus: {
    type: String,
    enum: ['UNPAID', 'PAID'],
    default: 'UNPAID'
  },
  registrationFeeAmount: {
    type: Number,
    default: 0
  },
  registrationFeeVersion: {
    type: Number,
    default: 1
  },
  registrationFeePaymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RegistrationFeePayment',
    default: null
  },
  serviceCategories: [{
    type: String
  }],
  skills: [{
    type: String
  }],
  hourlyRate: {
    type: Number,
    default: 0
  },
  dailyRate: {
    type: Number,
    default: 0
  },
  experienceYears: {
    type: Number,
    default: 1
  },
  landRate: {
    type: Number,
    default: 0
  },
  customRates: [{
    skill: String,
    hourly_price: Number,
    daily_price: Number,
    land_price: Number
  }],
  status: {
    type: String,
    enum: Object.values(WORKER_STATUS),
    default: WORKER_STATUS.OFFLINE
  },
  profilePhoto: {
    type: String,
    default: null
  },
  address: {
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
    fullAddress: String
  },
  rating: {
    type: Number,
    default: 0
  },
  totalJobs: {
    type: Number,
    default: 0
  },
  completedJobs: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  // Wallet
  wallet: {
    balance: {
      type: Number,
      default: 0
    },
    reservedWithdrawal: {
      type: Number,
      default: 0
    },
    totalWithdrawn: {
      type: Number,
      default: 0
    }
  },
  outstandingDues: {
    type: Number,
    default: 0
  },
  isRestricted: {
    type: Boolean,
    default: false
  },
  restrictionReason: {
    type: String,
    default: null
  },
  bankDetails: {
    accountHolderName: { type: String, trim: true, default: null },
    accountNumber: { type: String, trim: true, default: null },
    ifscCode: { type: String, trim: true, uppercase: true, default: null },
    bankName: { type: String, trim: true, default: null },
    branchName: { type: String, trim: true, default: null },
    upiId: { type: String, trim: true, default: null },
    updatedAt: { type: Date, default: null }
  },
  // Settings
  settings: {
    notifications: {
      type: Boolean,
      default: true
    },
    soundAlerts: {
      type: Boolean,
      default: true
    },
    language: {
      type: String,
      default: 'en'
    }
  },
  // Real-time Location
  location: {
    lat: Number,
    lng: Number,
    updatedAt: Date
  },
  // Additional Stats
  cancelledJobs: {
    type: Number,
    default: 0
  },
  totalReviews: {
    type: Number,
    default: 0
  },

  // Real-time Socket Connectivity (strictly separate from business availability 'status')
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeenAt: {
    type: Date,
    default: null
  },
  currentSocketId: {
    type: String,
    default: null
  },

  // FCM Push Notification Tokens
  fcmTokens: [{
    token: { type: String, required: true },
    platform: { type: String, enum: ["web", "android", "ios", "mobile"], default: "web" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],

  // ── Geographic Scope (for Admin filtering by districtId/subDistrictId) ─────
  districtId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    default: null,
    index: true
  },
  districtName: {
    type: String,
    default: null
  },
  subDistrictId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubDistrict',
    default: null,
    index: true
  },
  subDistrictName: {
    type: String,
    default: null
  },

  // Admin Traceability: which admin created/registered this worker (immutable)
  createdByAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
    index: true,
    immutable: true
  },
  createdByType: {
    type: String,
    enum: ['ADMIN', 'SUPER_ADMIN', 'SYSTEM', 'VENDOR', null],
    default: null,
    index: true,
    immutable: true
  },
  creationSource: {
    type: String,
    enum: [
      'ADMIN_CREATED',
      'SUPER_ADMIN_CREATED',
      'SELF_REGISTERED',
      'IMPORT',
      'SYSTEM',
      'MIGRATION',
      'VENDOR_CREATED',
      'LEGACY_OR_SELF',
      'OFFLINE_MEMBER_CREATED'  // Added by Team Leader for no-smartphone laborers
    ],
    default: 'SELF_REGISTERED',
    index: true,
    immutable: true
  },
  createdByAdminSnapshot: {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    role: { type: String, trim: true }
  }
}, {
  timestamps: true
});

// Indexes for faster queries
workerSchema.index({ createdAt: -1 });
workerSchema.index({ approvalStatus: 1, createdAt: -1 });
workerSchema.index({ workerType: 1, createdAt: -1 });
workerSchema.index({ createdByAdmin: 1, createdAt: -1 });
workerSchema.index({ creationSource: 1, createdAt: -1 });
workerSchema.index({ createdByType: 1, createdAt: -1 });
workerSchema.index({ status: 1 });
workerSchema.index({ isOnline: 1 });
workerSchema.index({ districtId: 1, createdAt: -1 });
workerSchema.index({ subDistrictId: 1, createdAt: -1 });

// Hash password before saving
workerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
workerSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Worker', workerSchema);



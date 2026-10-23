const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true // Allows multiple null values
  },
  phone: {
    type: String,
    required: [true, 'Please provide a phone number'],
    unique: true,
    trim: true
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    default: null,
    lowercase: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
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
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  profilePhoto: {
    type: String,
    default: null
  },
  // What the farmer owes after an admin-resolved payment default (blocks new bookings until cleared)
  outstandingDues: {
    type: Number,
    default: 0
  },
  wallet: {
    balance: {
      type: Number,
      default: 0
    },
    penalty: {
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
  bankDetails: {
    accountHolderName: { type: String, trim: true, default: null },
    accountNumber: { type: String, trim: true, default: null },
    ifscCode: { type: String, trim: true, uppercase: true, default: null },
    bankName: { type: String, trim: true, default: null },
    branchName: { type: String, trim: true, default: null },
    upiId: { type: String, trim: true, default: null },
    updatedAt: { type: Date, default: null }
  },
  // Up to 5 saved addresses (MAX_USER_ADDRESSES in utils/addressList.js), exactly one default and kept first.
  addresses: [{
    type: {
      type: String, // home, work, other
      default: 'home'
    },
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
    isDefault: {
      type: Boolean,
      default: false
    },
    lat: Number,
    lng: Number
  }],
  // Farms / Khet Details
  farms: [{
    name: {
      type: String,
      trim: true,
      default: 'My Farm'
    },
    location: {
      addressLine1: String,
      city: String,
      state: String,
      pincode: String,
      lat: Number,
      lng: Number,
      fullAddress: String
    },
    sizeInAcres: {
      type: Number,
      default: 0
    },
    cropType: [{
      type: String
    }],
    khasraNumber: {
      type: String,
      trim: true,
      default: null
    },
    polygonCoordinates: [{
      lat: Number,
      lng: Number
    }]
  }],
  plans: {
    isActive: {
      type: Boolean,
      default: false
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      default: null
    },
    name: {
      type: String,
      default: null
    },
    expiry: {
      type: Date,
      default: null
    },
    price: {
      type: Number,
      default: 0
    },
    rentalDiscountPercentage: {
      type: Number,
      default: 0
    },
    marketplaceDiscountPercentage: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
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
  // Equipment Owner KYC Properties
  kyc_status: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  kyc_documents: [{
    type: String
  }],
  // Settings
  settings: {
    notifications: {
      type: Boolean,
      default: true
    },
    language: {
      type: String,
      default: 'en'
    }
  },
  // Statistics
  totalBookings: {
    type: Number,
    default: 0
  },
  completedBookings: {
    type: Number,
    default: 0
  },
  cancelledBookings: {
    type: Number,
    default: 0
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

  // Admin Traceability: which admin created/registered this user (immutable)
  createdByAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
    index: true,
    immutable: true
  },
  createdByType: {
    type: String,
    enum: ['ADMIN', 'SUPER_ADMIN', 'SYSTEM', null],
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
      'LEGACY_OR_SELF'
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
  },

}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Indexes
userSchema.index({ createdAt: -1 });
userSchema.index({ approvalStatus: 1, createdAt: -1 });
userSchema.index({ createdByAdmin: 1, createdAt: -1 });
userSchema.index({ creationSource: 1, createdAt: -1 });
userSchema.index({ createdByType: 1, createdAt: -1 });
userSchema.index({ 'addresses.city': 1 });
userSchema.index({ 'addresses.district': 1 });
userSchema.index({ districtId: 1, createdAt: -1 });
userSchema.index({ subDistrictId: 1, createdAt: -1 });
// No 2dsphere index on farms.location: that field is a plain address object (lat/lng/city/...), not GeoJSON, so the index
// made MongoDB reject every save of a farm that has a location ("Can't extract geo keys"). Nothing queries it by geo.

/** One-time migration (idempotent): drop the farms.location 2dsphere index from databases that already have it. */
userSchema.statics.dropLegacyFarmGeoIndex = async function () {
  try {
    const idx = await this.collection.indexes();
    const geo = idx.find(i => i.name === 'farms.location_2dsphere');
    if (geo) {
      await this.collection.dropIndex('farms.location_2dsphere');
      console.warn('[User] dropped legacy index farms.location_2dsphere');
    }
  } catch (err) {
    if (err && err.codeName !== 'NamespaceNotFound') console.error('[User] farm geo index migration failed:', err.message);
  }
};

module.exports = mongoose.model('User', userSchema);


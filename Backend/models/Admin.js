const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Granular permission keys for Admin access control.
 * Each key maps to a specific resource+action pair.
 */
const PERMISSION_KEYS = [
  // Dashboard
  'dashboard.view',
  // Users
  'users.view', 'users.create', 'users.edit', 'users.block', 'users.delete',
  // Vendors
  'vendors.view', 'vendors.create', 'vendors.edit', 'vendors.approve', 'vendors.block', 'vendors.delete',
  // Workers
  'workers.view', 'workers.create', 'workers.edit', 'workers.approve', 'workers.block', 'workers.delete',
  // Bookings
  'bookings.view', 'bookings.edit', 'bookings.cancel',
  // Machinery Approvals
  'machinery.approvals.view', 'machinery.approvals.manage',
  // Machinery Management
  'machinery.view', 'machinery.edit', 'machinery.delete',
  // Agri Marketplace
  'marketplace.view', 'marketplace.orders', 'marketplace.stores',
  // Referrals
  'referrals.view', 'referrals.manage',
  // Settlements & Payments
  'settlements.view', 'settlements.process', 'payments.view', 'payouts.view', 'payouts.approve',
  // Reports
  'reports.view', 'reports.export',
  // Content & Catalog
  'services.view', 'services.edit', 'categories.view', 'categories.edit',
  'brands.view', 'brands.edit', 'products.view', 'products.edit',
  // Disputes
  'disputes.view', 'disputes.manage',
  // Plans
  'plans.view', 'plans.edit',
  // Website
  'website.view', 'website.edit',
  // Reviews & Support
  'reviews.view', 'reviews.moderate', 'support.view', 'support.reply',
  // Soil Testing
  'soiltest.view', 'soiltest.edit',
  // Settings (Super Admin only - kept here for schema completeness)
  'settings.view', 'settings.edit',
];

const permissionsSchema = {};
PERMISSION_KEYS.forEach(key => {
  permissionsSchema[key] = { type: Boolean, default: false };
});

const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    select: false
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin'],
    default: 'admin'
  },

  // ── Geographic Scope ──────────────────────────────────────────────────────
  scopeType: {
    type: String,
    enum: ['GLOBAL', 'CITY', 'DISTRICT', 'SUB_DISTRICT'],
    default: 'CITY'
    // GLOBAL → Super Admin / unrestricted admin
    // CITY   → scoped to one city
    // DISTRICT → scoped to one district within a city
    // SUB_DISTRICT → scoped to one sub-district within a district
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

  // ── Granular Permissions (ignored for super_admin, they have all) ─────────
  permissions: {
    type: Object,
    default: {}
  },

  // ── Traceability ──────────────────────────────────────────────────────────
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null   // null = seeded / self-created (first super admin)
  },

  // ── Profile ───────────────────────────────────────────────────────────────
  profilePhoto: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },

  // ── Salary & Incentive Configuration (Super Admin Managed) ────────────────
  salary: {
    baseSalary: {
      type: Number,
      default: 0
    },
    payFrequency: {
      type: String,
      enum: ['monthly', 'weekly', 'biweekly'],
      default: 'monthly'
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    },
    effectiveFrom: {
      type: Date,
      default: Date.now
    },
    effectiveTo: {
      type: Date,
      default: null
    },
    farmerIncentive: {
      type: Number,
      default: 0
    },
    vendorIncentive: {
      type: Number,
      default: 0
    },
    workerIncentive: {
      type: Number,
      default: 0
    },
    minRegistrationsForIncentive: {
      type: Number,
      default: 0,
      min: 0
    },
    bankDetails: {
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      bankName: { type: String, default: '' },
      accountHolderName: { type: String, default: '' },
      upiId: { type: String, default: '' }
    },
    notes: {
      type: String,
      default: ''
    }
  },

  // ── Versioned Salary History (Immutable record of previous salary configurations)
  salaryHistory: [{
    version: { type: Number, default: 1 },
    baseSalary: { type: Number, required: true },
    payFrequency: { type: String, default: 'monthly' },
    status: { type: String, default: 'ACTIVE' },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
    farmerIncentive: { type: Number, default: 0 },
    vendorIncentive: { type: Number, default: 0 },
    workerIncentive: { type: Number, default: 0 },
    minRegistrationsForIncentive: { type: Number, default: 0, min: 0 },
    bankDetails: {
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      bankName: { type: String, default: '' },
      accountHolderName: { type: String, default: '' },
      upiId: { type: String, default: '' }
    },
    notes: { type: String, default: '' },
    changeReason: { type: String, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    changedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Compound indexes for rapid admin filtering and sorting
adminSchema.index({ role: 1, isActive: 1, createdAt: -1 });
adminSchema.index({ createdAt: -1 });

// ── Hooks ─────────────────────────────────────────────────────────────────

adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

adminSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Check if this admin has a specific permission.
 * Super admins always return true.
 */
adminSchema.methods.hasPermission = function (permissionKey) {
  if (this.role === 'super_admin') return true;
  return !!(this.permissions && this.permissions[permissionKey]);
};

/**
 * Returns a safe public representation (no password, no internal fields)
 */
adminSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    scopeType: this.scopeType,
    cityId: this.cityId,
    cityName: this.cityName,
    districtId: this.districtId,
    districtName: this.districtName,
    subDistrictId: this.subDistrictId,
    subDistrictName: this.subDistrictName,
    permissions: this.permissions || {},
    isActive: this.isActive,
    lastLogin: this.lastLogin,
    createdBy: this.createdBy,
    profilePhoto: this.profilePhoto,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// ── Statics ───────────────────────────────────────────────────────────────

/**
 * All available permission keys (useful for UI rendering)
 */
adminSchema.statics.PERMISSION_KEYS = PERMISSION_KEYS;

/**
 * Default permissions for a new Admin (all false, SA enables selectively)
 */
adminSchema.statics.defaultPermissions = function () {
  const p = {};
  PERMISSION_KEYS.forEach(k => { p[k] = false; });
  return p;
};

module.exports = mongoose.model('Admin', adminSchema);
module.exports.PERMISSION_KEYS = PERMISSION_KEYS;

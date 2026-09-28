const mongoose = require('mongoose');

/**
 * SubDistrict Model
 * Represents a sub-district / block / mandal / tehsil within a District.
 * Used for Admin geographic scoping at the finest granularity.
 *
 * Hierarchy: State → District → SubDistrict
 *
 * Migration note:
 *   - stateId + districtId are the NEW authoritative parent references.
 *   - cityId is kept as a LEGACY field for backward compatibility.
 *     Do NOT rely on cityId for new business logic.
 */
const subDistrictSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Sub-district name is required'],
    trim: true
  },
  // Canonical normalized name for uniqueness matching
  nameNormalized: {
    type: String,
    lowercase: true,
    trim: true,
    index: true
  },

  // ── NEW: District parent reference (authoritative) ────────────────────────
  districtId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    required: [true, 'District reference is required'],
    index: true
  },
  districtName: {
    type: String,
    trim: true,
    default: ''
  },

  // ── NEW: State reference (denormalized for fast queries) ──────────────────
  stateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'State',
    default: null,
    index: true
  },
  stateName: {
    type: String,
    trim: true,
    default: ''
  },

  // ── LEGACY: City parent reference (backward compatibility only) ──────────
  // Keep for old records. Do NOT use for new service-scope logic.
  cityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    default: null,
    index: true
  },
  cityName: {
    type: String,
    trim: true,
    default: ''
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  }
}, {
  timestamps: true
});

// Normalize name before validation
subDistrictSchema.pre('validate', function (next) {
  if (this.name) {
    this.nameNormalized = this.name.trim().toLowerCase();
  }
  next();
});

// Compound unique: sub-district name is unique within a district
subDistrictSchema.index({ districtId: 1, nameNormalized: 1 }, { unique: true, sparse: true });
subDistrictSchema.index({ districtId: 1, isActive: 1, displayOrder: 1 });
subDistrictSchema.index({ stateId: 1, isActive: 1 });
// Legacy index for city-based queries
subDistrictSchema.index({ cityId: 1, isActive: 1 });

module.exports = mongoose.model('SubDistrict', subDistrictSchema);

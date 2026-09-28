const mongoose = require('mongoose');

/**
 * District Model
 * Represents a district within a State.
 * Used for Admin geographic scoping and service availability.
 *
 * Hierarchy: State → District → SubDistrict
 *
 * Migration note:
 *   - stateId is the NEW authoritative parent reference.
 *   - cityId is kept as a LEGACY field for backward compatibility with
 *     historical records that referenced the old City collection.
 *     Do NOT rely on cityId for new business logic.
 */
const districtSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'District name is required'],
    trim: true
  },
  // Canonical normalized name for uniqueness matching (e.g. 'indore')
  nameNormalized: {
    type: String,
    lowercase: true,
    trim: true,
    index: true
  },

  // ── NEW: State parent reference (authoritative) ──────────────────────────
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
districtSchema.pre('validate', function (next) {
  if (this.name) {
    this.nameNormalized = this.name.trim().toLowerCase();
  }
  next();
});

// Compound unique: district name is unique within a State
districtSchema.index({ stateId: 1, nameNormalized: 1 }, { unique: true, sparse: true });
districtSchema.index({ stateId: 1, isActive: 1, displayOrder: 1 });
// Legacy index for city-based queries
districtSchema.index({ cityId: 1, isActive: 1 });

module.exports = mongoose.model('District', districtSchema);

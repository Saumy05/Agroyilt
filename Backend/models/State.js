const mongoose = require('mongoose');

/**
 * State Model
 * Top-level geographic unit for AgroYilt.
 * Replaces City as the primary service/catalog scope.
 *
 * Hierarchy:
 *   State → District → SubDistrict
 *
 * The "GLOBAL_INDIA" scope does NOT use a State record;
 * it is represented by the scopeLevel constant alone.
 */
const stateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'State name is required'],
    trim: true,
    index: true
  },
  // Canonical normalized name for uniqueness (e.g. 'madhya pradesh')
  nameNormalized: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  // ISO 3166-2 state code (e.g. 'IN-MP' for Madhya Pradesh) — optional but useful
  code: {
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
stateSchema.pre('validate', function (next) {
  if (this.name) {
    this.nameNormalized = this.name.trim().toLowerCase();
  }
  next();
});

// Compound indexes
stateSchema.index({ isActive: 1, displayOrder: 1, nameNormalized: 1 });

module.exports = mongoose.model('State', stateSchema);

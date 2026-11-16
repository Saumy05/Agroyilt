const mongoose = require('mongoose');

/**
 * Language Model
 * Manages supported and active languages for AgroYilt.
 * English is default; Hindi is enabled by default;
 * Other languages can be enabled/disabled or added by Admin.
 */
const languageSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Language code is required (e.g. en, hi, mr)'],
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Language name is required (e.g. English, Hindi)'],
    trim: true
  },
  nativeName: {
    type: String,
    required: [true, 'Native language name is required (e.g. English, हिन्दी)'],
    trim: true
  },
  flag: {
    type: String,
    default: '🌐',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: false,
    index: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isRTL: {
    type: Boolean,
    default: false
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  isSystem: {
    type: Boolean,
    default: false // System languages (en, hi) cannot be deleted, though secondary can be toggled
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Language', languageSchema);

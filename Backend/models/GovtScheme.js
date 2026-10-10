const mongoose = require('mongoose');

const govtSchemeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  tag: {
    type: String,
    default: 'सरकारी अनुदान',
    trim: true
  },
  category: {
    type: String,
    default: 'कृषि योजना',
    trim: true
  },
  summary: {
    type: String,
    required: true,
    trim: true
  },
  eligibility: {
    type: String,
    default: '',
    trim: true
  },
  docs: [{
    type: String,
    trim: true
  }],
  portalUrl: {
    type: String,
    default: '',
    trim: true
  },
  portalName: {
    type: String,
    default: '',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GovtScheme', govtSchemeSchema);

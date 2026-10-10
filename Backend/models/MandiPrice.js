const mongoose = require('mongoose');

const mandiPriceSchema = new mongoose.Schema({
  commodity: {
    type: String,
    required: true,
    trim: true
  },
  commodityEnglish: {
    type: String,
    default: '',
    trim: true
  },
  market: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    default: 'Haryana',
    trim: true
  },
  district: {
    type: String,
    default: '',
    trim: true
  },
  modalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  minPrice: {
    type: Number,
    default: 0
  },
  maxPrice: {
    type: Number,
    default: 0
  },
  priceUnit: {
    type: String,
    default: 'क्विं.'
  },
  change: {
    type: String,
    default: '+₹0'
  },
  isUp: {
    type: Boolean,
    default: true
  },
  quality: {
    type: String,
    default: 'सामान्य'
  },
  arrivalDate: {
    type: Date,
    default: Date.now
  },
  isGovtApiSynced: {
    type: Boolean,
    default: false
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

module.exports = mongoose.model('MandiPrice', mandiPriceSchema);

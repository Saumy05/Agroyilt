const mongoose = require('mongoose');
const { SERVICE_STATUS } = require('../utils/constants');

/**
 * Service Model (New Structure)
 * Represents individual services strictly under a Brand.
 * 
 * IMPORTANT: Services created by Admin are TEMPLATES / REFERENCE DATA.
 * They are not meant to be booked directly. The prices defined here act
 * as the MAXIMUM CAPS that vendors cannot exceed when they list their 
 * actual equipment (VendorEquipment).
 */
const serviceSchema = new mongoose.Schema({
  isTemplate: {
    type: Boolean,
    default: true
  },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: false,
    index: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    index: true
  },
  // Geographic Scope Architecture
  scope: {
    type: String,
    enum: ['GLOBAL_INDIA', 'STATE', 'DISTRICT', 'SUB_DISTRICT'],
    default: 'GLOBAL_INDIA',
    index: true
  },
  stateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'State',
    default: null,
    index: true
  },
  districtId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    default: null,
    index: true
  },
  subDistrictId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubDistrict',
    default: null,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Please provide a service title'],
    trim: true,
    index: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  iconUrl: {
    type: String,
    default: null
  },
  // This acts as the Maximum Cap for base price
  basePrice: {
    type: Number,
    required: false,
    min: [0, 'Price cannot be negative']
  },
  gstPercentage: {
    type: Number,
    required: [true, 'GST percentage is required'],
    min: 0,
    default: 18
  },
  status: {
    type: String,
    enum: Object.values(SERVICE_STATUS),
    default: SERVICE_STATUS.ACTIVE,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  // ==========================================
  // EQUIPMENT RENTAL SPECIFIC FIELDS (UPDATED)
  // ==========================================
  rental_type: {
    type: String,
    enum: ['hourly', 'land_based', 'monthly'],
    default: 'hourly'
  },
  priceRangeMin: {
    type: Number,
    required: false,
    min: 0
  },
  priceRangeMax: {
    type: Number,
    required: false,
    min: 0
  },
  pricingUnit: {
    type: String,
    enum: ['per_acre', 'per_hour', 'per_day'],
    required: false
  },
  hourly_price: {
    type: Number,
    default: 0
  },
  land_price: {
    type: Number,
    default: 0
  },
  daily_price: {
    type: Number,
    default: 0
  },
  land_unit: {
    type: String,
    default: 'acre'
  },
  // ==========================================
  // CONTEXTUAL PRICING (New)
  // Differentiates between Standalone vs Sub-category Implement pricing
  // ==========================================
  pricing_context: {
    type: String,
    enum: ['standalone', 'sub-category', 'any'],
    default: 'any'
  },
  // If context is 'sub-category', this specifies the parent it applies to
  // (e.g. Rate for 'Rotavator' when rented with 'Mahindra Tractor')
  parentSourceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  equipment_features: [{
    type: String
  }]
}, {
  timestamps: true
});

// Generate slug from title before saving
serviceSchema.pre('validate', async function (next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

module.exports = mongoose.model('Service', serviceSchema);

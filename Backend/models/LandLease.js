const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  farmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  farmerName: {
    type: String,
    default: 'Interested Farmer'
  },
  farmerPhone: {
    type: String,
    default: ''
  },
  proposedPrice: {
    type: Number, // For fixed-rent
    default: null
  },
  proposedShare: {
    type: Number, // For crop-share
    default: null
  },
  durationMonths: {
    type: Number,
    default: 12
  },
  proposedCrops: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const landLeaseSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  sizeInAcres: {
    type: Number,
    required: true
  },
  khasraNumber: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    addressLine1: String,
    city: String,
    district: String,
    state: String,
    pincode: String,
    lat: Number,
    lng: Number,
    fullAddress: String
  },
  geoLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [75.8577, 26.9124] // [lng, lat]
    }
  },
  leaseType: {
    type: String,
    enum: ['fixed-rent', 'crop-share'],
    required: true
  },
  pricePerAcre: {
    type: Number, // Only applicable for fixed-rent (₹ / acre / year)
    default: null
  },
  sharePercentage: {
    type: Number, // Only applicable for crop-share (% owner share)
    default: null
  },
  soilType: {
    type: String,
    default: 'Alluvial Soil (दोमट मिट्टी)'
  },
  irrigationSource: {
    type: String,
    default: 'Tubewell / बोरवेल'
  },
  electricity: {
    type: Boolean,
    default: true
  },
  fencing: {
    type: Boolean,
    default: false
  },
  roadAccess: {
    type: String,
    default: 'Paved Road / पक्की सड़क'
  },
  suitableCrops: [{
    type: String
  }],
  images: [{
    type: String
  }],
  availableFrom: {
    type: Date,
    required: true
  },
  availableTo: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending_verification', 'active', 'leased', 'inactive'],
    default: 'active',
    index: true
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  documents: [{
    type: String // Cloudinary URLs for proof of ownership / jamabandi / fard
  }],
  currentTenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  offers: [offerSchema]
}, {
  timestamps: true
});

landLeaseSchema.index({ 'geoLocation': '2dsphere' });

module.exports = mongoose.model('LandLease', landLeaseSchema);

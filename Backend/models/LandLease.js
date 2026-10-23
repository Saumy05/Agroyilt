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
  // Fixed rent: the farmer promises to pay installment 1 from the wallet as soon as the lease starts (both have signed)
  payFirstInstallmentOnStart: {
    type: Boolean,
    default: false
  },
  message: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled'], // cancelled: accepted, but the agreement was never signed
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const installmentSchema = new mongoose.Schema({
  number: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  amount: { type: Number, required: true }, // INR the tenant pays
  commission: { type: Number, default: 0 }, // INR kept by the platform
  ownerAmount: { type: Number, default: 0 }, // INR credited to the owner
  status: { type: String, enum: ['pending', 'processing', 'paid'], default: 'pending' },
  paidAt: { type: Date, default: null },
  paymentKey: { type: String, default: null },
  razorpayOrderId: { type: String, default: null },
  dueReminderSentAt: { type: Date, default: null },  // "installment due" reminder to the tenant
  lateReminderSentAt: { type: Date, default: null }  // "installment overdue" reminder to the tenant and owner
});

const settlementSchema = new mongoose.Schema({
  cropName: { type: String, trim: true, default: '' },
  harvestValue: { type: Number, required: true }, // INR total value of the harvest
  sharePercentage: { type: Number, required: true }, // owner % frozen at submission
  amount: { type: Number, required: true }, // INR owner's share = harvestValue * share%
  commission: { type: Number, default: 0 },
  ownerAmount: { type: Number, default: 0 },
  note: { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: ['submitted', 'confirmed', 'rejected', 'processing', 'paid'],
    default: 'submitted'
  },
  paidAt: { type: Date, default: null },
  paymentKey: { type: String, default: null },
  razorpayOrderId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
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
    village: String,
    tehsil: String,
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
  // The field's border as marked on the map. `boundary` is the GeoJSON Polygon ([lng, lat], closed) MongoDB searches;
  // `boundaryPoints` are the corners as marked (numbered 1..n in the agreement). No default: a listing without a border
  // must have no `boundary` at all, because the geo index rejects an empty one.
  boundary: {
    type: { type: String, enum: ['Polygon'] },
    coordinates: { type: [[[Number]]], default: undefined }
  },
  boundaryPoints: {
    type: [{ _id: false, lat: Number, lng: Number }],
    default: undefined
  },
  boundaryAreaAcres: { type: Number, default: null }, // geodesic area of the marked border
  boundarySetAt: { type: Date, default: null },
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
    default: 'Alluvial Soil'
  },
  irrigationSource: {
    type: String,
    default: 'Tubewell'
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
    default: 'Paved Road'
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
    enum: ['pending_verification', 'active', 'agreement_pending', 'leased', 'inactive'], // agreement_pending: an offer is accepted, waiting for both signatures
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
  // The agreement being signed (agreement_pending) or signed (leased)
  agreementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LeaseAgreement',
    default: null
  },
  offers: [offerSchema],
  // Terms frozen when the owner accepts an offer
  agreement: {
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    durationMonths: { type: Number, default: null },
    agreedPrice: { type: Number, default: null }, // fixed-rent: INR / acre / year
    agreedShare: { type: Number, default: null }, // crop-share: owner %
    totalRent: { type: Number, default: null }, // fixed-rent: INR for the whole term
    commissionPercentage: { type: Number, default: 0 },
    advanceFirstInstallment: { type: Boolean, default: false }, // installment 1 is charged from the tenant's wallet at the start
    firstPaymentDueBy: { type: Date, default: null }            // after this, an unpaid installment 1 lets the owner end the lease at once
  },
  // The owner's notice to end the lease for unpaid rent. immediate: no waiting period (first installment never paid).
  terminationNotice: {
    status: { type: String, enum: ['open', 'cleared', 'executed'], default: undefined },
    reason: { type: String, default: undefined },
    immediate: { type: Boolean, default: undefined },
    givenAt: { type: Date, default: undefined },
    endsAt: { type: Date, default: undefined }
  },
  endedReason: { type: String, default: null }, // e.g. 'non_payment'
  installments: [installmentSchema],
  settlements: [settlementSchema]
}, {
  timestamps: true
});

landLeaseSchema.index({ 'geoLocation': '2dsphere' });
landLeaseSchema.index({ boundary: '2dsphere' });

module.exports = mongoose.model('LandLease', landLeaseSchema);

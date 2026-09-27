const mongoose = require('mongoose');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../utils/constants');

/**
 * Booking Model
 * Represents service bookings made by users
 * Organized by logical sections for better maintainability
 */
const bookingSchema = new mongoose.Schema({
  // ==========================================
  // 1. IDENTIFIERS
  // ==========================================
  bookingNumber: {
    type: String,
    unique: true,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: false,
    index: true
  },
  equipmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorEquipment',
    default: null,
    index: true
  },
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null,
    index: true
  },
  workerRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkerBookingRequest',
    default: null
  },
  agreedRate: { type: Number, default: null },
  rateUnit: { type: String, default: null },
  notifiedVendors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  }],
  notifiedWorkers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker'
  }],

  // ==========================================
  // WAVE-BASED ALERTING
  // ==========================================
  potentialVendors: [{
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    distance: { type: Number } // in km
  }],
  potentialWorkers: [{
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker' },
    distance: { type: Number } // in km
  }],
  currentWave: {
    type: Number,
    default: 1
  },
  waveStartedAt: {
    type: Date,
    default: null
  },

  // ==========================================
  // 2. SERVICE INFORMATION
  // ==========================================
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: function() { return !this.workerId; },
    index: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: false,
    index: true
  },

  serviceName: {
    type: String,
    required: function() { return !this.workerId; }
  },
  serviceCategory: {
    type: String,
    required: function() { return !this.workerId; }
  },
  // Visual Identity (For easier UI access)
  categoryIcon: { type: String, default: null }, // URL to category icon
  brandName: { type: String, default: null },    // e.g. "LG", "Samsung"
  brandIcon: { type: String, default: null },    // URL to brand logo
  description: {
    type: String,
    trim: true
  },
  serviceImages: [{
    type: String
  }],
  // Booked Items (Brand > Card snapshot)
  bookedItems: [{
    brandName: { type: String, default: '' },
    brandIcon: { type: String, default: null },
    serviceName: { type: String, default: '' },
    card: {
      title: { type: String },
      subtitle: { type: String },
      price: { type: Number, default: 0 },
      originalPrice: { type: Number },
      duration: { type: String },
      description: { type: String },
      imageUrl: { type: String },
      features: [{ type: String }]
    },
    quantity: { type: Number, default: 1 }
  }],

  // ==========================================
  // MACHINERY: SPECIFIC ATTACHMENTS (Implements)
  // ==========================================
  selectedImplements: [{
    subCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    },
    title: String,
    pricing: {
      hourly:     { price: Number, isEnabled: Boolean },
      land_based: { price: Number, isEnabled: Boolean },
      daily:      { price: Number, isEnabled: Boolean }
    }
  }],

  // ==========================================
  // 3. PRICING & BILLING
  // ==========================================
  minRate: {
    type: Number,
    default: null
  },
  maxRate: {
    type: Number,
    default: null
  },
  basePrice: {
    type: Number,
    required: false,
    default: null
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  visitingCharges: {
    type: Number,
    default: 0,
    min: 0
  },
  penalty: {
    type: Number,
    default: 0,
    min: 0
  },
  // Extra Charges (Added by Vendor)
  /* Deprecated: Use VendorBill for detailed charges
  extraCharges: [{
    name: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    price: { type: Number, required: true },
    total: { type: Number, required: true }
  }],
  extraChargesTotal: {
    type: Number,
    default: 0
  },
  */
  // Booking Extensions
  extensionRequests: [{
    requestedHours: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    chargeAmount: { type: Number, required: true },
    reason: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null }
  }],
  extensionChargesTotal: {
    type: Number,
    default: 0
  },
  // Total Value of the Booking (set after bill generation)
  finalAmount: {
    type: Number,
    required: false,
    default: null
  },
  // Amount specifically payable by the user (might differ from finalAmount in plan cases)
  userPayableAmount: {
    type: Number,
    default: 0
  },
  // Reference to VendorBill (single source of truth for earnings/commission)
  vendorBillId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorBill',
    default: null
  },

  // ==========================================
  // 4. PAYMENT INFORMATION
  // ==========================================
  paymentStatus: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.PENDING,
    index: true
  },
  paymentMethod: {
    type: String, // 'wallet', 'razorpay', 'cash', 'card', 'plan_benefit'
    default: null
  },
  paymentId: {
    type: String,
    default: null
  },
  razorpayOrderId: {
    type: String,
    default: null,
    index: true
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  // Cash Collection Details
  cashCollected: {
    type: Boolean,
    default: false
  },
  cashCollectedAt: {
    type: Date,
    default: null
  },
  cashCollectedBy: {
    type: String,
    enum: ['vendor', 'worker'],
    default: null
  },
  cashCollectorId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'cashCollectedBy',
    default: null
  },

  // ==========================================
  // 5. ADDRESS INFORMATION
  // ==========================================
  address: {
    type: { type: String, default: 'home' },
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    landmark: { type: String, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },

  // Geographic Scope IDs (for admin district-scoped filtering)
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

  // ==========================================
  // 6. SCHEDULING
  // ==========================================
  scheduledDate: {
    type: Date,
    required: [true, 'Scheduled date is required'],
    index: true
  },
  scheduledTime: {
    type: String,
    default: null
  },
  timeSlot: {
    start: { type: String, default: '' },
    end: { type: String, default: '' },
    date: { type: String },
    time: { type: String }
  },
  rental_type: {
    type: String,
    enum: ['hourly', 'land_based', 'monthly', 'daily'],
    default: null
  },
  endDate: {
    type: Date,
    default: null
  },
  estimatedDuration: {
    type: Number, // for hourly: number of hours
    default: null
  },
  durationMinutes: {
    type: Number,
    default: null
  },
  startReminderSent: {
    type: Boolean,
    default: false
  },
  endReminderSent: {
    type: Boolean,
    default: false
  },
  // Agriculture: Specific Fields
  cropType: {
    type: String,
    default: null
  },
  landSize: {
    type: String, // e.g. "5 Acres"
    default: null
  },
  chemicalUsed: {
    type: String,
    default: null
  },
  waterRequirement: {
    type: String, // e.g. "50 Liters"
    default: null
  },
  actualAreaSprayed: {
    type: Number, // In acres, for final billing if needed
    default: null
  },

  // ==========================================
  // 7. STATUS & TRACKING
  // ==========================================
  bookingType: {
    type: String,
    enum: ['instant', 'scheduled'],
    default: 'scheduled',
    index: true
  },
  status: {
    type: String,
    enum: Object.values(BOOKING_STATUS),
    default: BOOKING_STATUS.PENDING,
    index: true
  },
  workerResponse: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
    default: 'PENDING'
  },
  // Timestamps
  acceptedAt: { type: Date, default: null },
  assignedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  journeyStartedAt: { type: Date, default: null },
  visitedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },

  // ==========================================
  // 8. SECURITY & OTPs
  // ==========================================
  visitOtp: {
    type: String,
    select: false
  },
  paymentOtp: {
    type: String,
    select: false
  },
  customerConfirmationOTP: {
    type: String,
    default: null
  },
  customerConfirmed: {
    type: Boolean,
    default: false
  },
  driver_start_otp: {
    type: String,
    default: null
  },
  driver_end_otp: {
    type: String,
    default: null
  },

  // ==========================================
  // 9. WORK COMPLETION
  // ==========================================
  workPhotos: [{
    type: String
  }],
  start_kilometer_photo: {
    type: String,
    default: null
  },
  end_kilometer_photo: {
    type: String,
    default: null
  },
  visitLocation: {
    lat: Number,
    lng: Number,
    address: String,
    verifiedAt: Date
  },
  // Note: Detailed billing (items/parts) is now handled by VendorBill model
  // workDoneDetails and extraCharges are deprecated in favor of VendorBill

  // ==========================================
  // 10. CANCELLATION
  // ==========================================
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, default: null },
  cancelledBy: { type: String, default: null },

  // ==========================================
  // 11. REVIEW & RATING
  // ==========================================
  rating: { type: Number, default: null, min: 1, max: 5 },
  review: { type: String, default: null },
  reviewImages: [{ type: String }],
  reviewedAt: { type: Date, default: null },

  // ==========================================
  // 12. SETTLEMENT (Worker/User)
  // ==========================================
  workerPaymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'SUCCESS'],
    default: 'PENDING'
  },
  isWorkerPaid: { type: Boolean, default: false },
  workerPaidAt: { type: Date, default: null },
  finalSettlementStatus: {
    type: String,
    enum: ['PENDING', 'DONE'],
    default: 'PENDING'
  },

  // ==========================================
  // 13. LIVE TRACKING (New - Agriculture Feature)
  // ==========================================
  liveLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    heading: { type: Number, default: 0 },
    updatedAt: { type: Date, default: null }
  },
  estimatedArrivalTime: { type: Date, default: null },
  distanceRemaining: { type: Number, default: null }, // in km

  // ==========================================
  // 14. NOTES
  // ==========================================
  vendorNotes: { type: String, default: null },
  workerNotes: { type: String, default: null }

}, {
  timestamps: true
});

// Generate unique booking number (5-8 alphanumeric)
bookingSchema.pre('save', async function (next) {
  if (this.isNew && !this.bookingNumber) {
    // Math.random().toString(36).substring(2, 8) generates exactly 6 alphanumeric chars
    // .toUpperCase() converts it to a clean order ID format (e.g., 'K9R2X4')
    this.bookingNumber = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

// Indexes
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ bookingNumber: 1 });
bookingSchema.index({ userId: 1, status: 1, createdAt: -1 });
bookingSchema.index({ vendorId: 1, status: 1, createdAt: -1 });
bookingSchema.index({ workerId: 1, status: 1, createdAt: -1 });
bookingSchema.index({ scheduledDate: 1, status: 1 });
bookingSchema.index({ paymentStatus: 1, status: 1 });
bookingSchema.index({ districtId: 1, createdAt: -1 });
bookingSchema.index({ subDistrictId: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);


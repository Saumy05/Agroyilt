const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  type: {
    type: String,
    default: 'global',
    unique: true
  },
  visitedCharges: {
    type: Number,
    default: 0,
    min: 0
  },
  serviceGstPercentage: {
    type: Number,
    default: 18,
    min: 0,
    max: 100
  },
  partsGstPercentage: {
    type: Number,
    default: 18,
    min: 0,
    max: 100
  },
  servicePayoutPercentage: {
    type: Number,
    default: 90, // Vendor gets 90% of service base price
    min: 0,
    max: 100
  },
  partsPayoutPercentage: {
    type: Number,
    default: 100, // Vendor gets 100% of parts base price
    min: 0,
    max: 100
  },
  // ==========================================
  // AGRICULTURE / MACHINE RENTING SPECIFIC
  // ==========================================
  rentalGstPercentage: {
    type: Number,
    default: 5, // Agriculture GST is 5% (NOT 18% like normal services)
    min: 0,
    max: 100
  },
  rentalPayoutPercentage: {
    type: Number,
    default: 90, // Equipment Owner keeps 90% of rental charges
    min: 0,
    max: 100
  },
  tdsPercentage: {
    type: Number,
    default: 1, // 1% default TDS u/s 194-O
    min: 0,
    max: 100
  },
  platformFeePercentage: {
    type: Number,
    default: 1, // 1% default platform fee
    min: 0,
    max: 100
  },
  workerPlatformChargePercentage: {
    type: Number,
    default: 1, // 1% default platform fee for worker booking
    min: 0,
    max: 100
  },
  workerCommissionPercentage: {
    type: Number,
    default: 10, // 10% default admin commission on worker earnings
    min: 0,
    max: 100
  },
  vendorCashLimit: {
    type: Number,
    default: 10000,
    min: 0
  },
  minWithdrawalAmountPaise: {
    type: Number,
    default: 30000, // ₹300 = 30000 paise
    min: 100 // minimum 100 paise = ₹1
  },
  cancellationPenalty: {
    type: Number,
    default: 49,
    min: 0
  },
  // Per-booking vendor commission deduction
  bookingCommissionPercentage: {
    type: Number,
    default: 10, // 10% commission deducted from vendor per booking
    min: 0,
    max: 100
  },
  // Razorpay Settings
  razorpayKeyId: {
    type: String,
    default: null
  },
  razorpayKeySecret: {
    type: String,
    default: null
  },
  razorpayWebhookSecret: {
    type: String,
    default: null
  },
  // Admin Company UPI Settings for QR Payments
  adminUpiId: {
    type: String,
    default: 'agroyilt@icici'
  },
  adminUpiMerchantName: {
    type: String,
    default: 'AgroYilt Technologies'
  },
  // Cloudinary Settings
  cloudinaryCloudName: {
    type: String,
    default: null
  },
  cloudinaryApiKey: {
    type: String,
    default: null
  },
  cloudinaryApiSecret: {
    type: String,
    default: null
  },
  // Future extensible fields
  currency: {
    type: String,
    default: 'INR'
  },

  // Billing & Invoice Configuration
  companyName: {
    type: String,
    default: 'TodayMyDream'
  },
  companyGSTIN: {
    type: String,
    default: ''
  },
  companyPAN: {
    type: String,
    default: ''
  },
  companyAddress: {
    type: String,
    default: ''
  },
  companyCity: {
    type: String,
    default: ''
  },
  companyState: {
    type: String,
    default: ''
  },
  companyPincode: {
    type: String,
    default: ''
  },
  companyPhone: {
    type: String,
    default: ''
  },
  companyEmail: {
    type: String,
    default: ''
  },

  // Invoice Settings
  invoicePrefix: {
    type: String,
    default: 'INV'
  },
  sacCode: {
    type: String,
    default: '998599'  // Event services SAC code
  },
  currentInvoiceNumber: {
    type: Number,
    default: 0
  },

  // Support Settings
  supportEmail: {
    type: String,
    default: ''
  },
  supportPhone: {
    type: String,
    default: ''
  },
  supportWhatsapp: {
    type: String,
    default: ''
  },

  // Branding & App Identity
  appName: {
    type: String,
    default: 'AgroYilt'
  },
  appTagline: {
    type: String,
    default: 'Smart Agriculture Equipment Booking'
  },
  appLogo: {
    type: String,
    default: '/AgroyiltLogo.png'
  },
  appFavicon: {
    type: String,
    default: '/AgroyiltLogo.png'
  },

  // ==========================================
  // WORKER HIRING ROUTING RULES
  // ==========================================
  // Max workers that can be hired independently (without a Team Leader).
  // If requiredWorkers <= this value → Independent Worker Flow.
  // If requiredWorkers >  this value → Team Leader Flow.
  maxIndependentWorkerRequest: {
    type: Number,
    default: 5,
    min: 1
  },
  // Radius (in km) within which to search for nearby workers / team leaders.
  workerSearchRadiusKm: {
    type: Number,
    default: 15,
    min: 1
  },

  // ==========================================
  // WORKER EXTENSION SETTINGS
  // ==========================================
  // Minutes workers have to accept/reject an extension request.
  // Workers who do not respond before expiry get status = EXPIRED (NOT REJECTED).
  extensionExpiryMinutes: {
    type: Number,
    default: 30,
    min: 1
  },

  // ==========================================
  // WORKER PENALTY SETTINGS (HOURLY ONLY)
  // ==========================================
  workerPenaltyEnabled: { type: Boolean, default: false },
  workerPenaltyType: {
    type: String,
    enum: ['fixed', 'per_minute', 'percentage'],
    default: 'fixed'
  },
  workerPenaltyAmount:      { type: Number, default: 50,  min: 0 }, // flat ₹ penalty
  workerPenaltyPerMinute:   { type: Number, default: 5,   min: 0 }, // ₹ per minute late
  workerPenaltyFreeMinutes: { type: Number, default: 10,  min: 0 }, // grace period
  workerPenaltyMaxAmount:   { type: Number, default: 500, min: 0 }, // cap
  workerPenaltyPercentage:  { type: Number, default: 5,   min: 0, max: 100 }, // % of earning
  maxWorkerDues:            { type: Number, default: 500, min: 0 }, // outstanding dues threshold
  workerCashPaymentEnabled: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);


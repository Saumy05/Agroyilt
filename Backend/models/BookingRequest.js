const mongoose = require('mongoose');

/**
 * BookingRequest Model
 * Tracks individual vendor alerts for bookings
 * Enables retry logic, delivery confirmation, and analytics
 */
const bookingRequestSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  providerType: {
    type: String,
    enum: ['VENDOR', 'WORKER'],
    default: 'VENDOR'
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: false,
    index: true
  },
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: false,
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  wave: {
    type: Number,
    default: 1
  },
  distance: {
    type: Number, // in km
    default: null
  },
  // Timestamps
  sentAt: {
    type: Date,
    default: Date.now
  },
  viewedAt: {
    type: Date,
    default: null
  },
  respondedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  },
  // Delivery tracking
  socketDelivered: {
    type: Boolean,
    default: false
  },
  pushDelivered: {
    type: Boolean,
    default: false
  },
  // Response reason (for rejections)
  rejectReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
bookingRequestSchema.index({ bookingId: 1, vendorId: 1 }, { unique: true });
bookingRequestSchema.index({ vendorId: 1, status: 1 });
bookingRequestSchema.index({ bookingId: 1, status: 1 });
// NOTE: deliberately NOT a TTL index. Requests are kept for analytics/audit; expiry is enforced by
// the booking scheduler and by the expiresAt check in acceptBooking.
bookingRequestSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('BookingRequest', bookingRequestSchema);

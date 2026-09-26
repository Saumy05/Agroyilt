const mongoose = require('mongoose');

/**
 * Notification Model
 * Stores notifications for users, vendors, workers, and admins
 */
const notificationSchema = new mongoose.Schema({
  // Recipient Information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null,
    index: true
  },
  workerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null,
    index: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
    index: true
  },
  // Notification Type
  type: {
    type: String,
    required: true,
    enum: [
      'booking_created',
      'booking_request',      // New booking request to vendor
      'booking_requested',    // New booking created confirmation to user
      'booking_accepted',     // Vendor accepted booking
      'booking_confirmed',
      'booking_cancelled',
      'booking_completed',
      'booking_rejected',
      'booking_rescheduled',
      'job_accepted',
      'job_rejected',
      'job_cancelled',
      'worker_assigned',
      'worker_started',
      'worker_completed',
      'work_done',
      'work_completed',       // Added for vendor self completion
      'vendor_reached',
      'journey_started',
      'visit_verified',
      'payment_received',
      'payment_success',
      'payment_failed',
      'payment_refunded',
      'review_submitted',
      'vendor_approved',
      'vendor_rejected',
      'vendor_approval_request',
      'farmer_approved',
      'farmer_rejected',
      'farmer_approval_request',
      'worker_approved',
      'worker_rejected',
      'worker_approval_request',
      'wallet_topup',
      'payout_requested',
      'payout_processed',
      'scrap_listed',
      'new_scrap_added',
      'scrap_accepted',
      'scrap_completed',
      'vendor_withdrawal_request',
      'withdrawal_request',
      'withdrawal_accepted',
      'withdrawal_processing',
      'withdrawal_rejected',
      'withdrawal_completed',
      'soil_test_request',
      'soil_test_assigned',
      'soil_test_report_uploaded',
      'soil_test_report_approved',
      'soil_test_payment_received',
      'soil_test_rejected_by_vendor',
      'soil_test_rejected',
      'soil_test_status_updated',
      'weather_update',
      'weather_critical',
      'ecommerce_order',
      'ecommerce_order_update',
      'ecommerce_out_of_stock',
      'team_invite_received',
      'team_invite_accepted',
      'team_invite_rejected',
      'team_invite_cancelled',
      'team_merge_request',
      'team_merge_accepted',
      'team_merge_rejected',
      'team_migration_request',
      'team_member_joined',
      'team_member_left',
      'team_member_removed',
      // Worker Booking System
      'worker_booking_request',
      'worker_booking_accepted',
      'worker_booking_rejected',
      'worker_booking_counter',
      'worker_booking_confirmed',
      'group_booking_request',
      'group_booking_accepted',
      'group_booking_rejected',
      'group_booking_counter',
      'group_booking_confirmed',
      'group_member_request',
      'group_member_accepted',
      'group_member_rejected',
      'group_member_selected',
      'group_member_not_selected',
      'worker_journey_started',
      'worker_arrived',
      'worker_work_submitted',
      'assignment_settled',
      'refund',
      'referral_reward',
      'referral_reversed',
      'support_ticket_reply',
      'support_ticket_status',
      'support_update',
      'SUPPORT_TICKET_REPLY',
      'SUPPORT_TICKET_STATUS',
      'general'
    ],
    index: true
  },
  // Notification Content
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  // Related Entity (optional)
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  relatedType: {
    type: String,
    default: null
  },
  // Notification Status
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  // Additional Data
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for faster queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ vendorId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ workerId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ adminId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);


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
      'extension_approved',   // Vendor approved an extension request
      'extension_rejected',   // Vendor declined an extension request
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
      'service_timer_paused',
      'service_timer_resumed',
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
      'team_member_invitation',
      'team_migration_request',
      // Worker Booking System
      'worker_booking_request',
      'worker_booking_accepted',
      'worker_booking_rejected',
      'worker_booking_counter',
      'worker_booking_confirmed',
      'worker_booking_cancelled',
      'worker_booking_partial',
      'worker_booking_expired',
      'worker_request_no_match',
      'worker_request_cancelled',
      'worker_request_slot_lost',
      'worker_request_expired',
      'worker_decreased',
      'worker_withdrew',
      'worker_decrease_refund',
      'early_decrease_refund',
      'team_extra_workers_requested',
      'extra_worker_dispatch',
      'group_booking_request',
      'group_booking_accepted',
      'group_booking_rejected',
      'group_booking_counter',
      'group_booking_confirmed',
      'group_booking_cancelled',
      'group_booking_awaiting_payment',
      'group_booking_payment_success',
      'group_member_request',
      'group_member_accepted',
      'group_member_rejected',
      'group_member_selected',
      'group_member_not_selected',
      'worker_journey_started',
      'worker_arrived',
      'worker_work_submitted',
      'completion_otp_generated',
      'day_completed',
      'assignment_settled',
      // Time Extensions
      'extension_requested',
      'extension_worker_response',
      'extension_confirmed',
      // Financial & Cash
      'cash_collected',
      'cash_collection',
      'dues_increase',
      'earnings_increase',
      'earnings_credit',
      'commission_deduction',
      'cash_collection_commission',
      'admin_qr_settlement',
      'admin_alert',
      'refund',
      'referral_reward',
      'referral_reversed',
      'referral_reversal',
      'support_ticket_reply',
      'support_ticket_status',
      'support_update',
      'SUPPORT_TICKET_REPLY',
      'SUPPORT_TICKET_STATUS',
      // Real-time flow notifications (Vendor <-> Farmer <-> Worker)
      'new_booking',
      'new_booking_request',
      'new_job',
      'job_assigned',
      'booking_approaching',
      'booking_ending',
      'trip_started',
      'work_started',
      'worker_reached',
      'job_request',
      'worker_final_amount_confirmed',
      'worker_accepted',
      'cash_payment_selected',
      'offline_payment_selected',
      'reselect_vendor',
      'booking_reselected',
      'service_timer_started',
      'service_timer_stopped',
      'agriculture_trip',
      'agriculture_timer',
      'timer_paused',
      'dispute_update',
      'penalty',
      'bid_accepted',
      'bid_rejected',
      'requirement_expired',
      'bid_expired',
      'vendor_cash_limit_exceeded',
      'vendor_settlement_request',
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


const mongoose = require('mongoose');

/**
 * AdminAuditLog Model
 *
 * Records every significant action performed by an Admin or Super Admin.
 * Provides a tamper-evident audit trail for compliance and debugging.
 */
const adminAuditLogSchema = new mongoose.Schema({
  // The admin who performed the action
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
    index: true
  },
  adminName: {
    type: String,
    required: true
  },
  adminEmail: {
    type: String,
    required: true
  },
  adminRole: {
    type: String,
    required: true
  },

  // Action category and detail
  action: {
    type: String,
    required: true,
    // Examples:  'CREATE_ADMIN', 'UPDATE_PERMISSIONS', 'APPROVE_VENDOR',
    //            'BLOCK_USER', 'DELETE_WORKER', 'VIEW_REPORT', etc.
  },
  module: {
    type: String,
    required: true,
    enum: [
      'AUTH', 'ADMIN_MANAGEMENT', 'USER_MANAGEMENT', 'VENDOR_MANAGEMENT',
      'WORKER_MANAGEMENT', 'BOOKING_MANAGEMENT', 'DISPUTE_MANAGEMENT', 'SETTLEMENT', 'PAYMENT',
      'PAYROLL', 'REPORT', 'SETTINGS', 'CONTENT', 'REVIEW', 'SUPPORT', 'CITY', 'SOIL_TEST', 'OTHER'
    ]
  },

  // Target entity (optional – what/who was acted upon)
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  targetModel: {
    type: String,
    default: null   // 'User', 'Vendor', 'Worker', 'Admin', 'Booking', etc.
  },
  targetName: {
    type: String,
    default: null
  },

  // Human-readable description of the change
  description: {
    type: String,
    required: true
  },

  // Snapshot of what changed (before/after values)
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // HTTP context
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },

  // Severity / result
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILURE', 'WARNING'],
    default: 'SUCCESS'
  }
}, {
  timestamps: true
});

// Index for fast admin-specific queries
adminAuditLogSchema.index({ adminId: 1, createdAt: -1 });
// Index for module-level queries
adminAuditLogSchema.index({ module: 1, createdAt: -1 });
// Index for target-entity queries (e.g. "all actions on user X")
adminAuditLogSchema.index({ targetId: 1, createdAt: -1 });
// TTL index: auto-purge logs older than 1 year (optional, set to 0 to disable)
// adminAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

/**
 * Static helper: log an admin action
 * @param {Object} params
 */
adminAuditLogSchema.statics.log = async function ({
  adminId,
  adminName,
  adminEmail,
  adminRole,
  action,
  module,
  targetId = null,
  targetModel = null,
  targetName = null,
  description,
  metadata = null,
  ipAddress = null,
  userAgent = null,
  status = 'SUCCESS'
}) {
  try {
    await this.create({
      adminId,
      adminName,
      adminEmail,
      adminRole,
      action,
      module,
      targetId,
      targetModel,
      targetName,
      description,
      metadata,
      ipAddress,
      userAgent,
      status
    });
  } catch (err) {
    // Audit logging must never break the main flow
    console.error('[AuditLog] Failed to write audit entry:', err.message);
  }
};

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);

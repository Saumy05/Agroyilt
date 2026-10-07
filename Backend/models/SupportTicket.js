const mongoose = require('mongoose');

/**
 * SupportTicket Model
 * Production-ready customer & partner support tickets for AgroYilt
 */
const supportTicketSchema = new mongoose.Schema({
  // Unique human-readable ticket number (e.g. AGY-2026-10245)
  ticketNumber: {
    type: String,
    unique: true,
    required: true,
    index: true,
    uppercase: true,
    trim: true
  },
  // Ticket Creator
  createdByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'createdByModel',
    index: true
  },
  createdByModel: {
    type: String,
    required: true,
    enum: ['User', 'Vendor', 'Worker', 'Admin'],
    default: 'User'
  },
  createdByRole: {
    type: String,
    required: true,
    enum: ['USER', 'VENDOR', 'WORKER', 'TEAM_LEADER', 'ADMIN', 'SUPER_ADMIN'],
    default: 'USER',
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    default: ''
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },

  // Ticket Content
  subject: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      'ACCOUNT', 'LOGIN', 'BOOKING', 'PAYMENT', 'REFUND',
      'WALLET', 'WITHDRAWAL', 'WORKER', 'VENDOR', 'EQUIPMENT',
      'RATING', 'TECHNICAL_ISSUE', 'OTHER'
    ],
    default: 'OTHER',
    index: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },

  // Optional Context References
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  bookingNumber: {
    type: String,
    trim: true,
    default: null
  },
  transactionId: {
    type: String,
    trim: true,
    default: null
  },
  attachments: [{
    type: String // Cloudinary / file URLs
  }],

  // Status & Priority
  status: {
    type: String,
    enum: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'WAITING_FOR_ADMIN', 'RESOLVED', 'CLOSED'],
    default: 'OPEN',
    index: true
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM',
    index: true
  },

  // Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
    index: true
  },
  assignedAdminName: {
    type: String,
    default: null
  },
  // When the current owner claimed it (or last touched it); drives the stale-claim release for URGENT tickets
  claimedAt: {
    type: Date,
    default: null
  },

  // Conversation tracking
  lastMessage: {
    type: String,
    default: ''
  },
  lastMessageSender: {
    type: String,
    enum: ['USER', 'ADMIN'],
    default: 'USER'
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastRepliedAt: {
    type: Date,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  unreadUserCount: {
    type: Number,
    default: 0
  },
  unreadAdminCount: {
    type: Number,
    default: 1
  },
  reopenCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for query performance
supportTicketSchema.index({ createdByUserId: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ createdByRole: 1, status: 1 });

/**
 * Generate human-readable ticket number (e.g. AGY-2026-100245)
 */
supportTicketSchema.statics.generateTicketNumber = async function() {
  const currentYear = new Date().getFullYear();
  let uniqueNumber = '';
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    attempts++;
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    uniqueNumber = `AGY-${currentYear}-${randomDigits}`;
    const found = await this.findOne({ ticketNumber: uniqueNumber });
    if (!found) {
      exists = false;
    }
  }

  return uniqueNumber;
};

module.exports = mongoose.model('SupportTicket', supportTicketSchema);

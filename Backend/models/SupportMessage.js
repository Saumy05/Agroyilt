const mongoose = require('mongoose');

/**
 * SupportMessage Model
 * Threaded messages for AgroYilt Support Ticket conversations
 */
const supportMessageSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupportTicket',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  senderRole: {
    type: String,
    enum: ['USER', 'VENDOR', 'WORKER', 'TEAM_LEADER', 'ADMIN', 'SUPER_ADMIN'],
    required: true
  },
  senderType: {
    type: String,
    enum: ['CUSTOMER', 'ADMIN', 'INTERNAL_NOTE'],
    required: true,
    index: true
  },
  senderName: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  attachments: [{
    type: String
  }],
  // Internal notes are strictly for Admin/Super Admin and must NEVER be visible to customers
  isInternalNote: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

supportMessageSchema.index({ ticketId: 1, createdAt: 1 });

module.exports = mongoose.model('SupportMessage', supportMessageSchema);

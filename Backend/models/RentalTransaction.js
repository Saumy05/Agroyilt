const mongoose = require('mongoose');

const rentalTransactionSchema = new mongoose.Schema({
  farmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  equipmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorEquipment',
    required: true,
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  rentalAmount: {
    type: Number,
    required: true
  },
  securityDeposit: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['reserved', 'picked_up', 'returned', 'disputed', 'cancelled'],
    default: 'reserved',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  razorpayOrderId: {
    type: String,
    default: null
  },
  depositRefundStatus: {
    type: String,
    enum: ['pending', 'released', 'forfeited', 'partial'],
    default: 'pending'
  },
  vendorConfirmedReturn: {
    type: Boolean,
    default: false
  },
  farmerConfirmedReturn: {
    type: Boolean,
    default: false
  },
  handoverNotes: {
    type: String,
    default: null
  },
  damageReport: {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'damageReport.reporterRole',
      default: null
    },
    reporterRole: {
      type: String,
      enum: ['User', 'Vendor'],
      default: null
    },
    description: {
      type: String,
      default: null
    },
    photos: [{
      type: String
    }],
    estimatedCost: {
      type: Number,
      default: 0
    },
    severity: {
      type: String,
      enum: ['minor', 'moderate', 'severe'],
      default: 'minor'
    },
    reportedAt: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('RentalTransaction', rentalTransactionSchema);

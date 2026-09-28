const mongoose = require('mongoose');

/**
 * AdminPayroll Model
 * 
 * Represents an immutable, auditable monthly payroll record for an Administrator.
 * Contains calculation snapshots, itemized incentive breakdowns, payment tracking,
 * and strict state machine lifecycle.
 */
const adminPayrollSchema = new mongoose.Schema({
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
  adminScopeType: {
    type: String,
    default: 'GLOBAL'
  },
  adminTerritory: {
    type: String,
    default: 'Global Access'
  },

  // Payroll Period
  payrollMonth: {
    type: String,
    required: true,
    index: true // Format: 'YYYY-MM', e.g., '2026-09'
  },
  year: {
    type: Number,
    required: true,
    index: true
  },
  month: {
    type: Number,
    required: true,
    index: true // 1 - 12
  },
  cycleStartDate: {
    type: Date,
    required: true
  },
  cycleEndDate: {
    type: Date,
    required: true
  },

  // ── Calculation Snapshot (Immutable copy of configuration applicable at cycle time) ──
  salaryConfigSnapshot: {
    baseSalary: { type: Number, default: 0 },
    payFrequency: { type: String, default: 'monthly' },
    farmerIncentiveRate: { type: Number, default: 0 },
    vendorIncentiveRate: { type: Number, default: 0 },
    workerIncentiveRate: { type: Number, default: 0 },
    minRegistrationsForIncentive: { type: Number, default: 0 },
    effectiveFrom: { type: Date },
    bankDetails: {
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      bankName: { type: String, default: '' },
      accountHolderName: { type: String, default: '' },
      upiId: { type: String, default: '' }
    }
  },

  // ── Calculation Details ──
  baseSalary: {
    type: Number,
    default: 0
  },
  farmerCount: {
    type: Number,
    default: 0
  },
  farmerIncentives: {
    type: Number,
    default: 0
  },
  vendorCount: {
    type: Number,
    default: 0
  },
  vendorIncentives: {
    type: Number,
    default: 0
  },
  workerCount: {
    type: Number,
    default: 0
  },
  workerIncentives: {
    type: Number,
    default: 0
  },
  totalIncentives: {
    type: Number,
    default: 0
  },
  minRegistrationsThreshold: {
    type: Number,
    default: 0
  },
  totalRegistrationsCount: {
    type: Number,
    default: 0
  },
  qualifyingRegistrationsCount: {
    type: Number,
    default: 0
  },

  // Authoritative, itemized registration proof
  incentiveItems: [{
    sourceType: {
      type: String,
      enum: ['FARMER_REGISTRATION', 'VENDOR_REGISTRATION', 'WORKER_REGISTRATION'],
      required: true
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    sourceName: { type: String, default: '' },
    sourcePhone: { type: String, default: '' },
    rate: { type: Number, required: true },
    quantity: { type: Number, default: 1 },
    amount: { type: Number, required: true },
    isThresholdLocked: { type: Boolean, default: false },
    registeredAt: { type: Date, default: Date.now }
  }],

  // Bonuses, Deductions, and Adjustments
  bonus: {
    type: Number,
    default: 0
  },
  bonusReason: {
    type: String,
    default: ''
  },
  deductions: {
    type: Number,
    default: 0
  },
  deductionReason: {
    type: String,
    default: ''
  },
  adjustments: [{
    type: {
      type: String,
      enum: ['BONUS', 'DEDUCTION', 'CORRECTION'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    addedByName: { type: String, default: '' },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Monetary Totals (Net Payable = baseSalary + totalIncentives + bonus - deductions)
  grossPayable: {
    type: Number,
    default: 0
  },
  netPayable: {
    type: Number,
    required: true,
    default: 0
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  remainingAmount: {
    type: Number,
    default: 0
  },

  // ── State Machine Lifecycle ──
  status: {
    type: String,
    enum: [
      'DRAFT',
      'PENDING_REVIEW',
      'APPROVED',
      'READY_FOR_PAYMENT',
      'PAYMENT_PROCESSING',
      'PARTIALLY_PAID',
      'PAID',
      'FAILED',
      'CANCELLED',
      'REVERSED'
    ],
    default: 'PENDING_REVIEW',
    index: true
  },

  // Once locked (APPROVED or PAID), automatic recalculation cannot mutate the record
  isLocked: {
    type: Boolean,
    default: false
  },

  // ── Manual Payment Records ──
  payments: [{
    paymentId: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    paymentDate: {
      type: Date,
      required: true
    },
    paymentMethod: {
      type: String,
      enum: ['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'OTHER'],
      required: true
    },
    transactionReference: {
      type: String,
      default: '' // UTR / Txn Reference
    },
    bankReference: {
      type: String,
      default: ''
    },
    chequeNumber: {
      type: String,
      default: ''
    },
    chequeBank: {
      type: String,
      default: ''
    },
    chequeDate: {
      type: Date
    },
    cashReceiverName: {
      type: String,
      default: ''
    },
    cashVoucherNumber: {
      type: String,
      default: ''
    },
    paymentProofUrl: {
      type: String,
      default: ''
    },
    paymentProofFileName: {
      type: String,
      default: ''
    },
    notes: {
      type: String,
      default: ''
    },
    adjustmentReason: {
      type: String,
      default: ''
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    recordedByName: {
      type: String,
      default: ''
    },
    recordedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'REVERSED'],
      default: 'SUCCESS'
    },
    reversedAt: {
      type: Date
    },
    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    reversedByName: {
      type: String,
      default: ''
    },
    reversalReason: {
      type: String,
      default: ''
    }
  }],

  // ── Approval & Audit Details ──
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  generatedByName: {
    type: String,
    default: ''
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  approvedByName: {
    type: String,
    default: ''
  },
  approvedAt: {
    type: Date
  },
  lockedAt: {
    type: Date
  },
  calculatedAt: {
    type: Date,
    default: Date.now
  },
  lastPaymentDate: {
    type: Date
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// ── Compound Indexes for Idempotency and High-Performance Lookups ──
// Ensure strictly ONE payroll record per admin per month (Idempotency guarantee)
adminPayrollSchema.index({ adminId: 1, payrollMonth: 1 }, { unique: true });
adminPayrollSchema.index({ payrollMonth: 1, status: 1 });
adminPayrollSchema.index({ year: 1, month: 1 });
adminPayrollSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('AdminPayroll', adminPayrollSchema);

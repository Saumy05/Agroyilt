const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
    refPath: 'userModel'
  },
  userModel: {
    type: String,
    required: true,
    enum: ['User', 'Vendor', 'Worker', 'Admin']
  },
  balance: {
    type: Number, // Stored as integer (paise) to avoid float issues
    default: 0
  },
  reservedBalance: {
    type: Number, // Stored as integer (paise) reserved for pending withdrawals
    default: 0
  },
  currency: {
    type: String,
    default: 'INR'
  }
}, { timestamps: true });

// One wallet per owner. Without this, concurrent first-time upserts silently create several wallets for the same
// owner and money lands on whichever one a reader happens to pick (see scripts/dedupe-wallets.js to clean existing data,
// which must be done BEFORE this index can be built on a database that already has duplicates).
walletSchema.index({ userId: 1, userModel: 1 }, { unique: true });

module.exports = mongoose.model('Wallet', walletSchema);

const mongoose = require('mongoose');

const partySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  mobile: { type: String, default: '' }
}, { _id: false });

// One party's signature. Only the server fills it, from the signed-in account and the request; the name is never typed.
const signatureSchema = new mongoose.Schema({
  signed: { type: Boolean, default: false },
  lockedName: { type: String, default: null }, // the account's registered name at the moment of signing
  signedAt: { type: Date, default: null },
  ipAddress: { type: String, default: null },
  userAgent: { type: String, default: null },
  device: {
    platform: { type: String, default: null },
    model: { type: String, default: null },
    appVersion: { type: String, default: null }
  },
  consentText: { type: String, default: null }, // the exact sentence they agreed to
  otpVerifiedAt: { type: Date, default: null },
  contentHash: { type: String, default: null }  // hash of the agreement text this signature is on
}, { _id: false });

// Pending signing code for a party (hashed). Never sent to the client.
const otpSchema = new mongoose.Schema({
  hash: { type: String, default: null, select: false },
  expiresAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, default: null },
  sendCount: { type: Number, default: 0 }
}, { _id: false });

const auditSchema = new mongoose.Schema({
  action: { type: String, required: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  role: { type: String, default: null }, // landowner | farmer | admin | system
  timestamp: { type: Date, default: Date.now },
  details: { type: String, default: '' },
  ipAddress: { type: String, default: null }
}, { _id: false });

/**
 * The lease agreement of one accepted offer, signed by both parties on the same document.
 * The text and the terms are frozen when it is made; `contentHash` proves nobody changed them afterwards.
 */
const leaseAgreementSchema = new mongoose.Schema({
  leaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'LandLease', required: true },
  offerId: { type: mongoose.Schema.Types.ObjectId, default: null },
  referenceNo: { type: String, required: true, unique: true }, // short number printed on the document, e.g. AGY-L-7F3A2C
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgreementTemplate', default: null },
  templateVersion: { type: Number, default: null },
  type: { type: String, enum: ['FIXED_RENT', 'BATAI_CROP_SHARE'], required: true },
  language: { type: String, enum: ['hi', 'en'], default: 'hi' },

  landowner: { type: partySchema, required: true },
  farmer: { type: partySchema, required: true },

  // Everything the agreement states about the land and the deal, frozen at creation (including the border corners)
  termsSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  renderedContent: { type: String, required: true }, // the final text (placeholders filled in)
  contentHash: { type: String, required: true },     // SHA-256 of the text + the terms

  status: {
    type: String,
    enum: ['DRAFT', 'PARTIALLY_SIGNED', 'FULLY_EXECUTED', 'CANCELLED', 'DISPUTED', 'EXPIRED'],
    default: 'DRAFT',
    index: true
  },
  signatures: {
    landowner: { type: signatureSchema, default: () => ({}) },
    farmer: { type: signatureSchema, default: () => ({}) }
  },
  otp: {
    landowner: { type: otpSchema, default: () => ({}) },
    farmer: { type: otpSchema, default: () => ({}) }
  },
  auditTrail: { type: [auditSchema], default: [] },

  expiresAt: { type: Date, default: null },        // unsigned agreements lapse after this
  reminderSentAt: { type: Date, default: null },
  executedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: String, default: null },     // landowner | farmer | admin | system
  cancelReason: { type: String, default: '' },
  dispute: {
    flagged: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    flaggedAt: { type: Date, default: null },
    statusBefore: { type: String, default: null }
  }
}, { timestamps: true });

// one live agreement per lease: cancelled / expired ones may stay as history
leaseAgreementSchema.index(
  { leaseId: 1 },
  { name: 'one_live_agreement_per_lease', unique: true, partialFilterExpression: { status: { $in: ['DRAFT', 'PARTIALLY_SIGNED', 'FULLY_EXECUTED', 'DISPUTED'] } } }
);
leaseAgreementSchema.index({ leaseId: 1, createdAt: -1 }); // history of a lease
leaseAgreementSchema.index({ 'landowner.userId': 1, createdAt: -1 });
leaseAgreementSchema.index({ 'farmer.userId': 1, createdAt: -1 });

module.exports = mongoose.model('LeaseAgreement', leaseAgreementSchema);

const mongoose = require('mongoose');

/**
 * The wording of a lease agreement, edited by the admin. One ACTIVE template per (type, language) is used when a new
 * agreement is made; agreements keep their own copy of the text they were made from, so editing a template never
 * changes an agreement that already exists.
 *
 * `content` is plain text with a little markdown (# headings, **bold**, - bullets, 1. numbered lists) and {{placeholders}}.
 * Raw HTML is not supported on purpose: the text is shown to farmers, so it must not be able to carry scripts.
 */
const agreementTemplateSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  type: { type: String, enum: ['FIXED_RENT', 'BATAI_CROP_SHARE'], required: true },
  language: { type: String, enum: ['hi', 'en'], required: true },
  content: { type: String, required: true, maxlength: 60000 },
  standardClauses: { type: [{ type: String, trim: true, maxlength: 2000 }], default: [] },
  isActive: { type: Boolean, default: false },
  version: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, { timestamps: true });

// at most one active template for each type + language
agreementTemplateSchema.index({ type: 1, language: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

module.exports = mongoose.model('AgreementTemplate', agreementTemplateSchema);

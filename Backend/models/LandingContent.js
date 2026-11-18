const mongoose = require('mongoose');

/**
 * LandingContent Model
 * Stores customizable text, titles, badges, descriptions, and highlights
 * for all sections of the AgroYilt Landing Page.
 */
const landingContentSchema = new mongoose.Schema({
  hero: { type: mongoose.Schema.Types.Mixed, default: {} },
  about: { type: mongoose.Schema.Types.Mixed, default: {} },
  problemSolution: { type: mongoose.Schema.Types.Mixed, default: {} },
  services: { type: mongoose.Schema.Types.Mixed, default: {} },
  workflow: { type: mongoose.Schema.Types.Mixed, default: {} },
  videoTutorials: { type: mongoose.Schema.Types.Mixed, default: {} },
  ecosystem: { type: mongoose.Schema.Types.Mixed, default: {} },
  features: { type: mongoose.Schema.Types.Mixed, default: {} },
  testimonials: { type: mongoose.Schema.Types.Mixed, default: {} },
  companyDeepDive: { type: mongoose.Schema.Types.Mixed, default: {} },
  faq: { type: mongoose.Schema.Types.Mixed, default: {} },
  cta: { type: mongoose.Schema.Types.Mixed, default: {} },
  footer: { type: mongoose.Schema.Types.Mixed, default: {} },
  navbar: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, {
  timestamps: true
});

module.exports = mongoose.model('LandingContent', landingContentSchema);

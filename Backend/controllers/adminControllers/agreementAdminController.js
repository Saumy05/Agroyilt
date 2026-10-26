const crypto = require('crypto');
const mongoose = require('mongoose');
const LandLease = require('../../models/LandLease');
const LeaseAgreement = require('../../models/LeaseAgreement');
const AgreementTemplate = require('../../models/AgreementTemplate');
const svc = require('../../services/leaseAgreementService');
const render = require('../../services/agreementRenderService');
const { notifyLease } = require('../../services/landLeaseNotifyService');
const Settings = require('../../models/Settings');
const { streamAgreementPdf, streamEvidencePdf } = require('../../services/agreementPdfService');
const { ensureDefaultTemplates } = require('../../services/agreementDefaults');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const adminIdOf = (req) => req.user?.id || req.user?._id || null;
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v));
const TYPES = ['FIXED_RENT', 'BATAI_CROP_SHARE'];
const LANGS = ['hi', 'en'];
const ALL_STATUS = ['DRAFT', 'PARTIALLY_SIGNED', 'FULLY_EXECUTED', 'CANCELLED', 'DISPUTED', 'EXPIRED'];

// What every template must contain, so that no agreement can be made without the parties, the land and its border
const REQUIRED_PLACEHOLDERS = {
  all: ['landowner_name', 'farmer_name', 'khasra_no', 'boundary_table'],
  FIXED_RENT: ['rent_amount'],
  BATAI_CROP_SHARE: ['share_percentage']
};

const missingPlaceholders = (type, content) => {
  const text = String(content || '');
  return [...REQUIRED_PLACEHOLDERS.all, ...(REQUIRED_PLACEHOLDERS[type] || [])]
    .filter(k => !new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'i').test(text));
};

const summaryRow = (ag) => ({
  id: ag._id, referenceNo: ag.referenceNo, status: svc.isExpired(ag) ? 'EXPIRED' : ag.status, type: ag.type, language: ag.language,
  landowner: ag.landowner.name, landownerMobile: ag.landowner.mobile, farmer: ag.farmer.name, farmerMobile: ag.farmer.mobile,
  landownerSigned: !!ag.signatures?.landowner?.signed, farmerSigned: !!ag.signatures?.farmer?.signed,
  khasraNumber: ag.termsSnapshot?.khasraNumber, village: ag.termsSnapshot?.village, landAreaAcres: ag.termsSnapshot?.landAreaAcres,
  createdAt: ag.createdAt, executedAt: ag.executedAt, expiresAt: ag.expiresAt, disputed: !!ag.dispute?.flagged
});

/** The evidence record of an agreement: who did what, when, from where, on exactly which text. Fingerprinted so a later copy can be checked. */
const buildEvidenceRecord = (ag, adminId) => {
  const v = svc.view(ag, null, { forAdmin: true });
  const record = {
    purpose: 'Electronic record of a lease agreement and its digital signatures, prepared for evidence (Section 65B of the Indian Evidence Act / Section 63 of the Bharatiya Sakshya Adhiniyam). A responsible person must sign the certificate that accompanies it.',
    agreement: { referenceNo: ag.referenceNo, type: ag.type, language: ag.language, status: v.status, templateVersion: ag.templateVersion, createdAt: ag.createdAt, executedAt: ag.executedAt },
    document: { contentHashSha256: ag.contentHash, characters: ag.renderedContent.length },
    parties: { landowner: { name: ag.landowner.name, mobile: ag.landowner.mobile, userId: String(ag.landowner.userId) }, farmer: { name: ag.farmer.name, mobile: ag.farmer.mobile, userId: String(ag.farmer.userId) } },
    signatures: v.signatures,
    signedTextMatchesRecord: ['landowner', 'farmer'].map(r => ({ party: r, signed: !!ag.signatures[r].signed, hashMatches: ag.signatures[r].signed ? ag.signatures[r].contentHash === ag.contentHash : null })),
    timeline: v.timeline,
    generatedAt: new Date().toISOString(),
    generatedByAdmin: String(adminId || '')
  };
  record.recordHashSha256 = crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
  return record;
};

const agreementAdminController = {
  // GET /api/admin/agreements?status=&type=&from=&to=&search=&page=&limit=
  list: async (req, res) => {
    try {
      const { status, type, from, to, search, page = 1, limit = 20 } = req.query;
      const filter = {};
      if (ALL_STATUS.includes(status)) filter.status = status;
      if (TYPES.includes(type)) filter.type = type;
      if (from || to) {
        filter.createdAt = {};
        if (from && !isNaN(new Date(from))) filter.createdAt.$gte = new Date(from);
        if (to && !isNaN(new Date(to))) { const end = new Date(to); end.setHours(23, 59, 59, 999); filter.createdAt.$lte = end; }
      }
      if (search && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), 'i');
        filter.$or = [{ referenceNo: rx }, { 'landowner.name': rx }, { 'farmer.name': rx }, { 'landowner.mobile': rx }, { 'farmer.mobile': rx }, { 'termsSnapshot.khasraNumber': rx }, { 'termsSnapshot.village': rx }];
      }
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
      const [rows, total, byStatus] = await Promise.all([
        LeaseAgreement.find(filter).select('-renderedContent').sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
        LeaseAgreement.countDocuments(filter),
        LeaseAgreement.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }])
      ]);
      const counts = Object.fromEntries(ALL_STATUS.map(s => [s, 0]));
      byStatus.forEach(b => { counts[b._id] = b.n; });
      res.status(200).json({
        success: true,
        data: rows.map(summaryRow),
        counts,
        pagination: { page: pageNum, pages: Math.max(1, Math.ceil(total / limitNum)), total }
      });
    } catch (error) {
      console.error('Admin list agreements error:', error);
      res.status(500).json({ success: false, message: 'Failed to load agreements' });
    }
  },

  // GET /api/admin/agreements/:id — the document, both signatures with device details, the timeline
  getById: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const ag = await LeaseAgreement.findById(req.params.id);
      if (!ag) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const lease = await LandLease.findById(ag.leaseId).select('title status agreement currentTenantId').lean();
      res.status(200).json({ success: true, data: { ...svc.view(ag, null, { forAdmin: true }), lease: lease ? { id: lease._id, title: lease.title, status: lease.status } : null } });
    } catch (error) {
      console.error('Admin get agreement error:', error);
      res.status(500).json({ success: false, message: 'Failed to load the agreement' });
    }
  },

  // GET /api/admin/agreements/:id/audit — the evidence record: who did what, when, from where, on exactly which text
  getAudit: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const ag = await LeaseAgreement.findById(req.params.id);
      if (!ag) return res.status(404).json({ success: false, message: 'Agreement not found' });
      res.status(200).json({ success: true, data: buildEvidenceRecord(ag, adminIdOf(req)) });
    } catch (error) {
      console.error('Admin audit error:', error);
      res.status(500).json({ success: false, message: 'Failed to build the audit record' });
    }
  },

  // GET /api/admin/agreements/:id/audit.pdf — the same record as a PDF to print, sign and file
  downloadEvidencePdf: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const ag = await LeaseAgreement.findById(req.params.id);
      if (!ag) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const settings = await Settings.findOne({ type: 'global' }).select('companyName appName').lean();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${ag.referenceNo}-evidence-record.pdf"`);
      streamEvidencePdf(buildEvidenceRecord(ag, adminIdOf(req)), res, { settings: settings || {} });
    } catch (error) {
      console.error('Admin evidence PDF error:', error);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Could not make the evidence record' });
    }
  },

  // GET /api/admin/agreements/:id/pdf — the certified PDF: the agreement with both signature certificates, IP and device included
  downloadPdf: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const ag = await LeaseAgreement.findById(req.params.id);
      if (!ag) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const settings = await Settings.findOne({ type: 'global' }).select('companyName appName').lean();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${ag.referenceNo}-certified.pdf"`);
      streamAgreementPdf(ag, res, { settings: settings || {}, forAdmin: true });
    } catch (error) {
      console.error('Admin agreement PDF error:', error);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Could not make the PDF' });
    }
  },

  // POST /api/admin/agreements/:id/dispute { notes } — mark as disputed (the lease itself is not changed)
  flagDispute: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const notes = String(req.body?.notes || '').trim();
      if (notes.length < 5) return res.status(400).json({ success: false, message: 'Write the case notes (at least a few words).' });
      const current = await LeaseAgreement.findOne({ _id: req.params.id, status: { $in: ['DRAFT', 'PARTIALLY_SIGNED', 'FULLY_EXECUTED'] } }).select('status');
      const ag = current && await LeaseAgreement.findOneAndUpdate(
        { _id: current._id, status: current.status },
        {
          $set: {
            status: 'DISPUTED',
            dispute: { flagged: true, notes: notes.slice(0, 2000), flaggedBy: adminIdOf(req), flaggedAt: new Date(), statusBefore: current.status }
          },
          $push: { auditTrail: svc.audit('dispute_flagged', { by: adminIdOf(req), role: 'admin', details: notes.slice(0, 500), ip: req.ip }) }
        },
        { new: true }
      );
      if (!ag) return res.status(409).json({ success: false, message: 'This agreement cannot be marked as disputed in its current state.' });
      res.status(200).json({ success: true, message: 'Marked as disputed', data: summaryRow(ag) });
    } catch (error) {
      console.error('Admin flag dispute error:', error);
      res.status(500).json({ success: false, message: 'Failed to flag the dispute' });
    }
  },

  // POST /api/admin/agreements/:id/dispute/resolve { notes }
  resolveDispute: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const current = await LeaseAgreement.findOne({ _id: req.params.id, status: 'DISPUTED' });
      if (!current) return res.status(409).json({ success: false, message: 'This agreement is not marked as disputed.' });
      const restoreTo = ALL_STATUS.includes(current.dispute?.statusBefore) ? current.dispute.statusBefore : 'FULLY_EXECUTED';
      const ag = await LeaseAgreement.findOneAndUpdate(
        { _id: current._id, status: 'DISPUTED' },
        {
          $set: { status: restoreTo, 'dispute.flagged': false },
          $push: { auditTrail: svc.audit('dispute_resolved', { by: adminIdOf(req), role: 'admin', details: String(req.body?.notes || '').slice(0, 500), ip: req.ip }) }
        },
        { new: true }
      );
      res.status(200).json({ success: true, message: 'Dispute closed', data: summaryRow(ag) });
    } catch (error) {
      console.error('Admin resolve dispute error:', error);
      res.status(500).json({ success: false, message: 'Failed to close the dispute' });
    }
  },

  // POST /api/admin/agreements/:id/remind — in-app + push reminder to whoever has not signed (SMS costs money, so none is sent)
  remind: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const ag = await LeaseAgreement.findOne({ _id: req.params.id, status: { $in: ['DRAFT', 'PARTIALLY_SIGNED'] } });
      if (!ag || svc.isExpired(ag)) return res.status(409).json({ success: false, message: 'This agreement is not waiting for signatures.' });
      const waiting = ['landowner', 'farmer'].filter(r => !ag.signatures[r].signed);
      waiting.forEach(r => notifyLease(ag[r].userId, 'land_lease_agreement_reminder', '⏰ अनुबंध पर हस्ताक्षर बाकी (Signature pending)',
        'आपके पट्टा अनुबंध पर हस्ताक्षर बाकी हैं। कृपया पढ़कर हस्ताक्षर करें।', ag.leaseId, { link: `/user/agreements/${ag._id}`, agreementId: String(ag._id) }));
      await LeaseAgreement.updateOne({ _id: ag._id }, { $push: { auditTrail: svc.audit('admin_reminder', { by: adminIdOf(req), role: 'admin', details: `Reminded: ${waiting.join(', ')}`, ip: req.ip }) } });
      res.status(200).json({ success: true, message: `Reminder sent to ${waiting.map(r => ag[r].name).join(' and ')}`, data: { reminded: waiting } });
    } catch (error) {
      console.error('Admin remind error:', error);
      res.status(500).json({ success: false, message: 'Failed to send the reminder' });
    }
  },

  // POST /api/admin/agreements/:id/cancel { reason } — only while not fully signed
  cancel: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const ag = await LeaseAgreement.findById(req.params.id);
      if (!ag) return res.status(404).json({ success: false, message: 'Agreement not found' });
      const result = await svc.cancel(ag, { by: 'admin', userId: adminIdOf(req), reason: req.body?.reason, ip: req.ip });
      if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
      res.status(200).json({ success: true, message: 'Agreement cancelled', data: summaryRow(result.agreement) });
    } catch (error) {
      console.error('Admin cancel agreement error:', error);
      res.status(500).json({ success: false, message: 'Failed to cancel the agreement' });
    }
  },

  // ── templates ──────────────────────────────────────────────────────────────────────────────────
  listTemplates: async (req, res) => {
    try {
      await ensureDefaultTemplates(); // the built-in wording appears the first time the admin opens this screen
      const rows = await AgreementTemplate.find().sort({ type: 1, language: 1, isActive: -1, updatedAt: -1 }).lean();
      res.status(200).json({ success: true, data: rows });
    } catch (error) {
      console.error('Admin list templates error:', error);
      res.status(500).json({ success: false, message: 'Failed to load templates' });
    }
  },

  placeholders: (req, res) => res.status(200).json({ success: true, data: { placeholders: render.PLACEHOLDERS, required: REQUIRED_PLACEHOLDERS } }),

  getTemplate: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Template not found' });
      const t = await AgreementTemplate.findById(req.params.id).lean();
      if (!t) return res.status(404).json({ success: false, message: 'Template not found' });
      res.status(200).json({ success: true, data: t });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to load the template' });
    }
  },

  createTemplate: async (req, res) => {
    try {
      const { title, type, language, content } = req.body || {};
      const standardClauses = Array.isArray(req.body?.standardClauses) ? req.body.standardClauses.map(c => String(c).trim()).filter(Boolean) : [];
      if (!String(title || '').trim()) return res.status(400).json({ success: false, message: 'Title is required' });
      if (!TYPES.includes(type)) return res.status(400).json({ success: false, message: 'Choose the lease type' });
      if (!LANGS.includes(language)) return res.status(400).json({ success: false, message: 'Choose the language' });
      const missing = missingPlaceholders(type, content);
      if (missing.length) return res.status(400).json({ success: false, message: `The template must contain: ${missing.map(m => `{{${m}}}`).join(', ')}` });
      const doc = await AgreementTemplate.create({ title: String(title).trim(), type, language, content: String(content), standardClauses, isActive: false, version: 1, createdBy: adminIdOf(req), updatedBy: adminIdOf(req) });
      res.status(201).json({ success: true, message: 'Template saved. Activate it to use it for new agreements.', data: doc, warnings: render.findUnknownPlaceholders(content).map(k => `Unknown placeholder {{${k}}} will be left empty`) });
    } catch (error) {
      console.error('Admin create template error:', error);
      res.status(500).json({ success: false, message: 'Failed to save the template' });
    }
  },

  updateTemplate: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Template not found' });
      const doc = await AgreementTemplate.findById(req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: 'Template not found' });
      const { title, content } = req.body || {};
      const nextContent = content !== undefined ? String(content) : doc.content;
      const nextClauses = Array.isArray(req.body?.standardClauses) ? req.body.standardClauses.map(c => String(c).trim()).filter(Boolean) : doc.standardClauses;
      const missing = missingPlaceholders(doc.type, nextContent);
      if (missing.length) return res.status(400).json({ success: false, message: `The template must contain: ${missing.map(m => `{{${m}}}`).join(', ')}` });
      const changed = nextContent !== doc.content || JSON.stringify(nextClauses) !== JSON.stringify(doc.standardClauses);
      if (title !== undefined) doc.title = String(title).trim() || doc.title;
      doc.content = nextContent;
      doc.standardClauses = nextClauses;
      if (changed) doc.version += 1; // agreements already made keep the version (and text) they were made from
      doc.updatedBy = adminIdOf(req);
      await doc.save();
      res.status(200).json({ success: true, message: changed ? `Saved as version ${doc.version}. Only new agreements use it.` : 'Saved', data: doc, warnings: render.findUnknownPlaceholders(nextContent).map(k => `Unknown placeholder {{${k}}} will be left empty`) });
    } catch (error) {
      console.error('Admin update template error:', error);
      res.status(500).json({ success: false, message: 'Failed to save the template' });
    }
  },

  // POST /api/admin/agreement-templates/:id/activate — makes this the one used for its type + language
  activateTemplate: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Template not found' });
      const doc = await AgreementTemplate.findById(req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: 'Template not found' });
      await AgreementTemplate.updateMany({ type: doc.type, language: doc.language, _id: { $ne: doc._id }, isActive: true }, { $set: { isActive: false } });
      doc.isActive = true;
      await doc.save();
      res.status(200).json({ success: true, message: 'Template activated', data: doc });
    } catch (error) {
      console.error('Admin activate template error:', error);
      res.status(500).json({ success: false, message: 'Failed to activate the template' });
    }
  },

  // DELETE /api/admin/agreement-templates/:id — only a template that is not active
  deleteTemplate: async (req, res) => {
    try {
      if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Template not found' });
      const doc = await AgreementTemplate.findById(req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: 'Template not found' });
      if (doc.isActive) return res.status(400).json({ success: false, message: 'Activate another template first: the active one cannot be deleted.' });
      await doc.deleteOne();
      res.status(200).json({ success: true, message: 'Template deleted' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to delete the template' });
    }
  },

  // POST /api/admin/agreement-templates/preview { type, language, content, standardClauses } — how it will read, with sample data
  previewTemplate: async (req, res) => {
    try {
      const { type, language, content } = req.body || {};
      if (!TYPES.includes(type) || !LANGS.includes(language)) return res.status(400).json({ success: false, message: 'Choose the lease type and language' });
      const standardClauses = Array.isArray(req.body?.standardClauses) ? req.body.standardClauses : [];
      const fixed = type === 'FIXED_RENT';
      const lease = {
        leaseType: fixed ? 'fixed-rent' : 'crop-share', khasraNumber: '142/18', sizeInAcres: 2.5, boundaryAreaAcres: 2.48,
        boundaryPoints: [{ lat: 24.570286, lng: 80.830314 }, { lat: 24.570286, lng: 80.83091 }, { lat: 24.570812, lng: 80.83091 }, { lat: 24.570812, lng: 80.830314 }],
        location: { village: 'Sample Village', tehsil: 'Sample Tehsil', district: 'Sample District', state: 'Madhya Pradesh', fullAddress: 'Sample Village' },
        availableFrom: new Date(), suitableCrops: ['Wheat', 'Gram'], pricePerAcre: 8000, sharePercentage: 40
      };
      const terms = render.buildTerms({ lease, offer: { durationMonths: 12, proposedPrice: 8000, proposedShare: 40, proposedCrops: 'Wheat, Gram' } });
      const { text, unknown } = render.fillTemplate({ content: String(content || ''), standardClauses, language }, {
        terms, owner: { name: 'Sample Landowner', mobile: '9876543210' }, farmer: { name: 'Sample Farmer', mobile: '9000000000' },
        referenceNo: 'AGY-L-PREVIEW', agreementDate: new Date(), language
      });
      res.status(200).json({ success: true, data: { html: render.toHtml(text, terms, language), unknown, missing: missingPlaceholders(type, content) } });
    } catch (error) {
      console.error('Admin preview template error:', error);
      res.status(500).json({ success: false, message: 'Failed to build the preview' });
    }
  }
};

module.exports = agreementAdminController;

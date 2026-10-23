const LeaseAgreement = require('../../models/LeaseAgreement');
const Settings = require('../../models/Settings');
const svc = require('../../services/leaseAgreementService');
const { streamAgreementPdf } = require('../../services/agreementPdfService');

/**
 * GET /api/agreement-files/:id.pdf?t=<token> — the PDF of an agreement for the holder of a short-lived link made for one of its
 * two parties (see POST /farmer/agreements/:id/pdf-link). No login header is needed, the signed token is the proof.
 */
exports.downloadByToken = async (req, res) => {
  try {
    const claim = svc.readDownloadToken(req.query.t);
    const id = String(req.params.id || '').replace(/\.pdf$/i, '');
    if (!claim || claim.agreementId !== id) return res.status(403).send('This link is not valid or has expired. Open the agreement and download again.');
    const ag = await LeaseAgreement.findById(id);
    if (!ag || !svc.partyRole(ag, claim.userId)) return res.status(404).send('Agreement not found');
    const settings = await Settings.findOne({ type: 'global' }).select('companyName appName').lean();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${ag.referenceNo}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    streamAgreementPdf(ag, res, { settings: settings || {}, forAdmin: false });
  } catch (error) {
    console.error('Agreement PDF download error:', error);
    if (!res.headersSent) res.status(500).send('Could not make the PDF');
  }
};

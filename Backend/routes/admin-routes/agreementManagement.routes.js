const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, isSuperAdmin } = require('../../middleware/roleMiddleware');
const c = require('../../controllers/adminControllers/agreementAdminController');

router.use(authenticate, isAdmin);

// agreement templates: the legal wording, so only a Super Admin can read or change it (fixed paths first, so they are not taken for an :id)
router.use('/agreement-templates', isSuperAdmin);
router.get('/agreement-templates', c.listTemplates);
router.get('/agreement-templates/placeholders', c.placeholders);
router.post('/agreement-templates/preview', c.previewTemplate);
router.post('/agreement-templates', c.createTemplate);
router.get('/agreement-templates/:id', c.getTemplate);
router.put('/agreement-templates/:id', c.updateTemplate);
router.post('/agreement-templates/:id/activate', c.activateTemplate);
router.delete('/agreement-templates/:id', c.deleteTemplate);

// agreements
router.get('/agreements', c.list);
router.get('/agreements/:id', c.getById);
router.get('/agreements/:id/audit', c.getAudit);
router.get('/agreements/:id/audit.pdf', c.downloadEvidencePdf);
router.get('/agreements/:id/pdf', c.downloadPdf);
router.post('/agreements/:id/dispute', c.flagDispute);
router.post('/agreements/:id/dispute/resolve', c.resolveDispute);
router.post('/agreements/:id/remind', c.remind);
router.post('/agreements/:id/cancel', c.cancel);

module.exports = router;

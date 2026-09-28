const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getAdminDisputes,
  getAdminDisputeById,
  startReview,
  resolveDispute,
  dismissDispute,
  escalateDispute,
  getDisputeStats
} = require('../../controllers/commonControllers/disputeController');

/**
 * Admin: Dispute Management
 * Base: /api/admin/disputes
 */

// Stats (must come before /:id to avoid route shadowing)
router.get('/stats',         authenticate, isAdmin, getDisputeStats);

// List & detail
router.get('/',              authenticate, isAdmin, getAdminDisputes);
router.get('/:id',           authenticate, isAdmin, getAdminDisputeById);

// Workflow transitions
router.patch('/:id/review',   authenticate, isAdmin, startReview);
router.patch('/:id/resolve',  authenticate, isAdmin, resolveDispute);
router.patch('/:id/dismiss',  authenticate, isAdmin, dismissDispute);
router.patch('/:id/escalate', authenticate, isAdmin, escalateDispute);

module.exports = router;


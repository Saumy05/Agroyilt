const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requirePermission } = require('../../middleware/roleMiddleware');
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

// Stats & Read operations: accessible by Support Agents & Supervisors (disputes.view)
router.get('/stats',         authenticate, isAdmin, requirePermission('disputes.view'), getDisputeStats);
router.get('/',              authenticate, isAdmin, requirePermission('disputes.view'), getAdminDisputes);
router.get('/:id',           authenticate, isAdmin, requirePermission('disputes.view'), getAdminDisputeById);

// Investigation workflow transitions (review & escalate)
router.patch('/:id/review',   authenticate, isAdmin, requirePermission('disputes.view'), startReview);
router.patch('/:id/escalate', authenticate, isAdmin, requirePermission('disputes.view'), escalateDispute);

// Financial resolutions & dismissal: RESTRICTED to Support Supervisors (disputes.manage)
router.patch('/:id/resolve',  authenticate, isAdmin, requirePermission('disputes.manage'), resolveDispute);
router.patch('/:id/dismiss',  authenticate, isAdmin, requirePermission('disputes.manage'), dismissDispute);

module.exports = router;


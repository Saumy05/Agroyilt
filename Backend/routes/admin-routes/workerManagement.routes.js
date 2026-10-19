const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requireAnyPermission } = require('../../middleware/roleMiddleware');
const {
  getAllWorkers,
  getWorkerDetails,
  approveWorker,
  rejectWorker,
  suspendWorker,
  getWorkerJobs,
  getWorkerEarnings,
  payWorker,
  getAllWorkerJobs,
  getOpenWorkerRequests,
  getWorkerAnalytics,
  getWorkerPaymentsSummary,
  toggleWorkerStatus,
  deleteWorker,
  addWorker
} = require('../../controllers/adminControllers/adminWorkerController');

// Validation rules
const rejectWorkerValidation = [
  body('reason').optional().trim()
];

const payWorkerValidation = [
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('reference').optional().trim(),
  body('notes').optional().trim()
];

// Routes
// the Payments page also lists approved workers (to pick who to pay)
router.get('/workers', authenticate, isAdmin, requireAnyPermission('workers.view', 'payments.view'), getAllWorkers);
router.post('/workers', authenticate, isAdmin, requireAnyPermission('workers.create'), addWorker);
router.get('/workers/analytics', authenticate, isAdmin, requireAnyPermission('workers.view'), getWorkerAnalytics);
router.get('/workers/jobs', authenticate, isAdmin, requireAnyPermission('workers.view'), getAllWorkerJobs);
router.get('/workers/requests', authenticate, isAdmin, requireAnyPermission('workers.view'), getOpenWorkerRequests);
router.get('/workers/payments', authenticate, isAdmin, requireAnyPermission('workers.view', 'payments.view'), getWorkerPaymentsSummary);
router.get('/workers/:id', authenticate, isAdmin, requireAnyPermission('workers.view'), getWorkerDetails);
router.post('/workers/:id/approve', authenticate, isAdmin, requireAnyPermission('workers.approve'), approveWorker);
router.post('/workers/:id/reject', authenticate, isAdmin, requireAnyPermission('workers.approve'), rejectWorkerValidation, rejectWorker);
router.post('/workers/:id/suspend', authenticate, isAdmin, requireAnyPermission('workers.block'), suspendWorker);
router.post('/workers/:id/pay', authenticate, isAdmin, requireAnyPermission('workers.edit', 'settlements.process', 'payouts.approve', 'payments.view'), payWorkerValidation, payWorker);
router.patch('/workers/:id/status', authenticate, isAdmin, requireAnyPermission('workers.block'), toggleWorkerStatus); // New
router.delete('/workers/:id', authenticate, isAdmin, requireAnyPermission('workers.delete'), deleteWorker); // New
router.get('/workers/:id/jobs', authenticate, isAdmin, requireAnyPermission('workers.view'), getWorkerJobs);
router.get('/workers/:id/earnings', authenticate, isAdmin, requireAnyPermission('workers.view'), getWorkerEarnings);

module.exports = router;

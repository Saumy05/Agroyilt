const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  raiseDispute,
  addEvidence,
  getMyDisputes
} = require('../../controllers/commonControllers/disputeController');

/**
 * Common Dispute Routes
 * Base: /api/disputes
 * Accessible by: User (Farmer), Vendor, Worker
 */

// Raise a new dispute (VENDOR_BOOKING: requires bookingId | WORKER_BOOKING: requires workerRequestId)
router.post('/', authenticate, raiseDispute);

// Get my disputes (for the authenticated party's role)
router.get('/my', authenticate, getMyDisputes);

// Add evidence to an existing dispute
router.post('/:id/evidence', authenticate, addEvidence);

module.exports = router;


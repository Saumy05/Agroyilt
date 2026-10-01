const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getServiceTimerStatus,
  startServiceTimer,
  pauseServiceTimer,
  resumeServiceTimer,
  endServiceTimer
} = require('../../controllers/bookingControllers/serviceTimerController');

// All endpoints require authentication (User or Vendor)
router.use(authenticate);

// Timer management endpoints
router.get('/:id/status', getServiceTimerStatus);
router.post('/:id/start', startServiceTimer);
router.post('/:id/pause', pauseServiceTimer);
router.post('/:id/resume', resumeServiceTimer);
router.post('/:id/end', endServiceTimer);

module.exports = router;

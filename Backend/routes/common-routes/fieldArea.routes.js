const express = require('express');
const router = express.Router();
const fieldAreaController = require('../../controllers/commonControllers/fieldAreaController');
const { authenticate } = require('../../middleware/authMiddleware');

// Public calculation endpoints
router.post('/calculate', fieldAreaController.calculate);
router.get('/regions', fieldAreaController.getRegions);

// Authenticated endpoint to save farm boundary to profile
router.post('/save-farm', authenticate, fieldAreaController.saveFarmBoundary);

module.exports = router;

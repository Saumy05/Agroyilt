const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isUser } = require('../../middleware/roleMiddleware');
const { getMyAvailability } = require('../../controllers/adminControllers/paymentRulesController');

// Which payment methods the farmer may use where they are booking
router.get('/', authenticate, isUser, getMyAvailability);

module.exports = router;

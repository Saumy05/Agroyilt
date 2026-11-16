const express = require('express');
const router = express.Router();
const { getActiveLanguages } = require('../../controllers/commonControllers/languageController');

// GET /api/public/languages - Fetch active languages for worker, user, and landing apps
router.get('/languages', getActiveLanguages);

module.exports = router;

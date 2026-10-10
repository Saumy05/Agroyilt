const express = require('express');
const router = express.Router();
const { getPublicKisanSuvidhaData } = require('../../controllers/commonControllers/kisanSuvidhaController');

// Public route to fetch Mandi Bhav and Govt Schemes
router.get('/', getPublicKisanSuvidhaData);
router.get('/data', getPublicKisanSuvidhaData);

module.exports = router;

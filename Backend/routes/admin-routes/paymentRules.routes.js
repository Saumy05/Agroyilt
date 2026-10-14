const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isSuperAdmin } = require('../../middleware/roleMiddleware');
const c = require('../../controllers/adminControllers/paymentRulesController');

// Payment method rules by area: Super Admin only
router.use(authenticate, isSuperAdmin);
router.get('/', c.getOverview);
router.put('/global', c.saveGlobal);
router.put('/area', c.saveArea);
router.delete('/area/:level/:areaId', c.resetArea);

module.exports = router;

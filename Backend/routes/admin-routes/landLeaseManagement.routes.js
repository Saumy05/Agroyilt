const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const adminLandLeaseController = require('../../controllers/adminControllers/adminLandLeaseController');

router.use(authenticate, isAdmin);

router.get('/land-leases', adminLandLeaseController.list);
router.get('/land-leases/stats', adminLandLeaseController.stats);
router.get('/land-leases/:id', adminLandLeaseController.getById);

module.exports = router;

const express = require('express');
const router = express.Router();
const equipmentController = require('../../controllers/adminControllers/equipmentController');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');

// Protected admin-only routes
router.use(authenticate);
router.use(isAdmin);

router.get('/', equipmentController.getAllEquipment);
router.patch('/:id/status', equipmentController.updateEquipmentStatus);
router.patch('/:id/requested-implements/:reqId', equipmentController.reviewRequestedImplement);
router.put('/:id', equipmentController.updateEquipment);
router.delete('/:id', equipmentController.deleteEquipment);
router.patch('/:id/restore', equipmentController.restoreEquipment);
router.put('/:id/restore', equipmentController.restoreEquipment);

module.exports = router;

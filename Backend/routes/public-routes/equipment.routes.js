const express = require('express');
const router = express.Router();
const { 
  getPublicEquipment, 
  getPublicEquipmentById, 
  checkAvailability,
  findQualifiedVendors
} = require('../../controllers/publicControllers/publicEquipmentController');

const farmerSearchController = require('../../controllers/farmerControllers/farmerSearchController');

// Public routes - no authentication required
router.get('/', getPublicEquipment);
router.post('/qualified-vendors', findQualifiedVendors);
router.get('/qualified-vendors', findQualifiedVendors);
router.get('/search', farmerSearchController.searchMachinery);
router.get('/search/:id', farmerSearchController.getMachineryDetails);
router.get('/:id', getPublicEquipmentById);
router.get('/:id/availability', checkAvailability);

module.exports = router;

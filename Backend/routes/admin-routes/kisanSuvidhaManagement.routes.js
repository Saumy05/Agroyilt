const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getAdminKisanSuvidhaData,
  createMandiPrice,
  updateMandiPrice,
  deleteMandiPrice,
  createGovtScheme,
  updateGovtScheme,
  deleteGovtScheme,
  resetKisanSuvidhaDefaults
} = require('../../controllers/commonControllers/kisanSuvidhaController');

// All routes are protected and for admin only
router.use(authenticate, isAdmin);

// Get all data
router.get('/data', getAdminKisanSuvidhaData);
router.post('/seed-defaults', resetKisanSuvidhaDefaults);

// Mandi Price CRUD
router.post('/mandi', createMandiPrice);
router.put('/mandi/:id', updateMandiPrice);
router.delete('/mandi/:id', deleteMandiPrice);

// Govt Scheme CRUD
router.post('/schemes', createGovtScheme);
router.put('/schemes/:id', updateGovtScheme);
router.delete('/schemes/:id', deleteGovtScheme);

module.exports = router;

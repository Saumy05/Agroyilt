const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isVendor } = require('../../middleware/roleMiddleware');
const {
  getMyEquipment,
  getEquipmentById,
  addEquipment,
  updateEquipment,
  deleteEquipment,
  respondToRentalBooking,
  startMachineryWork,
  completeMachineryWork
} = require('../../controllers/vendorControllers/vendorEquipmentController');

// Validation rules
const addEquipmentValidation = [
  body('categoryId').custom((value, { req }) => {
    if (!value && !req.body.requestedCategoryName) {
      throw new Error('Please select a machine category or request a new one');
    }
    return true;
  }),
  body('name').notEmpty().withMessage('Equipment name is required').trim(),
  body('pricing').notEmpty().withMessage('At least one pricing type should be configured'),
];

// All routes require authentication and vendor role
router.use(authenticate, isVendor);

// GET /api/vendor/equipment - List all machines
router.get('/', getMyEquipment);

// GET /api/vendor/equipment/:id - Get single machine
router.get('/:id', getEquipmentById);

// POST /api/vendor/equipment - Add new machinery
router.post('/', addEquipmentValidation, addEquipment);

// PUT /api/vendor/equipment/:id - Update machinery
router.put('/:id', updateEquipment);

// Machinery Booking Lifecycle (Vendor directly manages work)
router.put('/bookings/:bookingId/respond', respondToRentalBooking);
router.post('/bookings/:bookingId/start', startMachineryWork);
router.post('/bookings/:bookingId/complete', completeMachineryWork);

// DELETE /api/vendor/equipment/:id - Remove machinery
router.delete('/:id', deleteEquipment);

module.exports = router;

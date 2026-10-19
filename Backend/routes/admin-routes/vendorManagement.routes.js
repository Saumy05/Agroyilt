const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requireAnyPermission } = require('../../middleware/roleMiddleware');
const {
  getAllVendors,
  getVendorDetails,
  approveVendor,
  rejectVendor,
  suspendVendor,
  getVendorBookings,
  getVendorEarnings,
  getAllVendorBookings,
  getVendorPaymentsSummary,
  toggleVendorStatus,
  deleteVendor,
  updateVendorServices,
  addVendor
} = require('../../controllers/adminControllers/adminVendorController');

// Validation rules
const rejectVendorValidation = [
  body('reason').optional().trim()
];

// Routes
router.get('/vendors', authenticate, isAdmin, requireAnyPermission('vendors.view', 'soiltest.view'), getAllVendors);
router.post('/vendors', authenticate, isAdmin, requireAnyPermission('vendors.create'), addVendor);
router.get('/vendors/bookings', authenticate, isAdmin, requireAnyPermission('vendors.view'), getAllVendorBookings);
router.get('/vendors/payments', authenticate, isAdmin, requireAnyPermission('vendors.view', 'payments.view'), getVendorPaymentsSummary);
router.get('/vendors/:id', authenticate, isAdmin, requireAnyPermission('vendors.view'), getVendorDetails);
router.post('/vendors/:id/approve', authenticate, isAdmin, requireAnyPermission('vendors.approve'), approveVendor);
router.post('/vendors/:id/reject', authenticate, isAdmin, requireAnyPermission('vendors.approve'), rejectVendorValidation, rejectVendor);
router.post('/vendors/:id/suspend', authenticate, isAdmin, requireAnyPermission('vendors.block'), suspendVendor);
router.patch('/vendors/:id/status', authenticate, isAdmin, requireAnyPermission('vendors.block'), toggleVendorStatus); // New
router.patch('/vendors/:id/services', authenticate, isAdmin, requireAnyPermission('vendors.edit'), updateVendorServices);
router.delete('/vendors/:id', authenticate, isAdmin, requireAnyPermission('vendors.delete'), deleteVendor); // New
router.get('/vendors/:id/bookings', authenticate, isAdmin, requireAnyPermission('vendors.view'), getVendorBookings);
router.get('/vendors/:id/earnings', authenticate, isAdmin, requireAnyPermission('vendors.view'), getVendorEarnings);

module.exports = router;


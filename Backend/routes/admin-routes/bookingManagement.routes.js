const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requireAnyPermission } = require('../../middleware/roleMiddleware');
const {
  getAllBookings,
  getBookingById,
  cancelBooking,
  getBookingAnalytics
} = require('../../controllers/bookingControllers/adminBookingController');

// Validation rules
const cancelBookingValidation = [
  body('cancellationReason').optional().trim()
];

// Routes
router.get('/bookings', authenticate, isAdmin, requireAnyPermission('bookings.view'), getAllBookings);
router.get('/bookings/analytics', authenticate, isAdmin, requireAnyPermission('bookings.view'), getBookingAnalytics);
router.get('/bookings/:id', authenticate, isAdmin, requireAnyPermission('bookings.view', 'disputes.view'), getBookingById);
router.post('/bookings/:id/cancel', authenticate, isAdmin, requireAnyPermission('bookings.cancel'), cancelBookingValidation, cancelBooking);

module.exports = router;


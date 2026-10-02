const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isUser } = require('../../middleware/roleMiddleware');

const {
  generateAdminPaymentQr,
  confirmAdminQrPayment,
  getAdminQrStatus
} = require('../../controllers/bookingControllers/paymentQrController');

// Admin QR payment routes
router.post('/payment/generate-admin-qr', authenticate, generateAdminPaymentQr);
router.post('/payment/:id/generate-admin-qr', authenticate, generateAdminPaymentQr);
router.post('/payment/confirm-admin-qr', authenticate, confirmAdminQrPayment);
router.post('/payment/:id/confirm-admin-qr', authenticate, confirmAdminQrPayment);
router.get('/payment/:id/qr-status', authenticate, getAdminQrStatus);

// Placeholder routes - to be implemented
router.get('/', authenticate, isUser, (req, res) => {
  res.json({ success: true, message: 'User booking route' });
});

module.exports = router;


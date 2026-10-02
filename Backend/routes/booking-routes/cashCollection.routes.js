const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isVendor, isWorker } = require('../../middleware/roleMiddleware');
const {
  initiateCashCollection,
  confirmCashCollection,
  customerConfirmPayment,
  getCashCollectionStatus
} = require('../../controllers/bookingControllers/cashCollectionController');
const {
  generateAdminPaymentQr,
  confirmAdminQrPayment,
  getAdminQrStatus
} = require('../../controllers/bookingControllers/paymentQrController');

// All routes require authentication
router.use(authenticate);

// Vendor/Worker routes
router.post('/:id/initiate', initiateCashCollection);
router.post('/:id/confirm', confirmCashCollection);

// Admin Dynamic UPI QR Payment routes
router.post('/:id/generate-admin-qr', generateAdminPaymentQr);
router.post('/generate-admin-qr', generateAdminPaymentQr);
router.post('/:id/confirm-admin-qr', confirmAdminQrPayment);
router.post('/confirm-admin-qr', confirmAdminQrPayment);
router.get('/:id/qr-status', getAdminQrStatus);

// Customer route
router.post('/:id/customer-confirm', customerConfirmPayment);

// Status route (shared)
router.get('/:id/status', getCashCollectionStatus);

module.exports = router;

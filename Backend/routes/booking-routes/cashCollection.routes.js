const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isVendor, isWorker, isUser } = require('../../middleware/roleMiddleware');

// Cash is only ever collected by the vendor or worker who did the job
const isVendorOrWorker = (req, res, next) => {
  const role = String(req.userRole || '').toUpperCase();
  if (role === 'VENDOR' || role === 'WORKER') return next();
  return res.status(403).json({ success: false, message: 'Access denied. Vendor or worker role required.' });
};
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
router.post('/:id/initiate', isVendorOrWorker, initiateCashCollection);
router.post('/:id/confirm', isVendorOrWorker, confirmCashCollection);

// Admin Dynamic UPI QR Payment routes
router.post('/:id/generate-admin-qr', generateAdminPaymentQr);
router.post('/generate-admin-qr', generateAdminPaymentQr);
router.post('/:id/confirm-admin-qr', confirmAdminQrPayment);
router.post('/confirm-admin-qr', confirmAdminQrPayment);
router.get('/:id/qr-status', getAdminQrStatus);

// Customer route
router.post('/:id/customer-confirm', isUser, customerConfirmPayment);

// Status route (shared)
router.get('/:id/status', getCashCollectionStatus);

module.exports = router;

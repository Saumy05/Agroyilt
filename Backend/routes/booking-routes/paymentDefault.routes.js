const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const c = require('../../controllers/bookingControllers/paymentDefaultController');

// Vendor: report that the farmer will not pay. Farmer: see and clear dues.
router.use(authenticate);
router.post('/:id/report', c.reportNonPayment);
router.get('/my-dues', c.getMyDues);
router.post('/pay-wallet', c.payDuesFromWallet);

module.exports = router;

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const {
  getWallet,
  getTransactions,
  requestPayout,
  createDuesOrder,
  verifyDuesPayment,
  submitOfflineDuesPayment,
  listDuesPayments
} = require('../../controllers/workerControllers/workerWalletController');

// Get wallet balance
router.get('/', authenticate, isWorker, getWallet);

// Get transaction history
router.get('/transactions', authenticate, isWorker, getTransactions);

// Request payout from vendor
router.post('/request-payout', authenticate, isWorker, requestPayout);

// Pay outstanding dues: online (Razorpay) or offline to the admin (applied when the admin approves)
router.post('/dues/create-order', authenticate, isWorker, createDuesOrder);
router.post('/dues/verify', authenticate, isWorker, verifyDuesPayment);
router.post('/dues/offline', authenticate, isWorker, submitOfflineDuesPayment);
router.get('/dues/payments', authenticate, isWorker, listDuesPayments);

module.exports = router;

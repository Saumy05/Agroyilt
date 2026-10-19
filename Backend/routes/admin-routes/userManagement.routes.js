const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requireAnyPermission } = require('../../middleware/roleMiddleware');
const {
  getAllUsers,
  getUserDetails,
  toggleUserStatus,
  deleteUser,
  getUserBookings,
  getUserWalletTransactions,
  getAllUserBookings,
  updateKycStatus,
  addUser,
  updateApprovalStatus
} = require('../../controllers/adminControllers/adminUserController');

// Validation rules
const toggleStatusValidation = [
  body('isActive').isBoolean().withMessage('isActive must be a boolean')
];

// Routes
router.get('/users', authenticate, isAdmin, requireAnyPermission('users.view'), getAllUsers);
router.get('/users/bookings', authenticate, isAdmin, requireAnyPermission('users.view'), getAllUserBookings);
router.get('/users/:id', authenticate, isAdmin, requireAnyPermission('users.view'), getUserDetails);
router.put('/users/:id/status', authenticate, isAdmin, requireAnyPermission('users.block'), toggleStatusValidation, toggleUserStatus);
router.put('/users/:id/approval', authenticate, isAdmin, requireAnyPermission('users.edit'), updateApprovalStatus);
router.delete('/users/:id', authenticate, isAdmin, requireAnyPermission('users.delete'), deleteUser);
router.get('/users/:id/bookings', authenticate, isAdmin, requireAnyPermission('users.view'), getUserBookings);
router.get('/users/:id/wallet', authenticate, isAdmin, requireAnyPermission('users.view'), getUserWalletTransactions);
router.put('/users/:id/kyc-status', authenticate, isAdmin, requireAnyPermission('users.edit'), updateKycStatus);
router.post('/users', authenticate, isAdmin, requireAnyPermission('users.create'), addUser);

module.exports = router;


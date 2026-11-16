const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getAdminCoupons,
  createCoupon,
  updateCoupon,
  toggleCouponStatus,
  deleteCoupon,
  restoreCoupon
} = require('../../controllers/commonControllers/couponController');

// All coupon management routes require Admin auth
router.use(authenticate, isAdmin);

// GET /api/admin/coupons - list all coupons & stats
router.get('/', getAdminCoupons);

// POST /api/admin/coupons - create new coupon
router.post('/', createCoupon);

// PUT /api/admin/coupons/:id - update coupon
router.put('/:id', updateCoupon);

// PATCH /api/admin/coupons/:id/toggle - toggle active status
router.patch('/:id/toggle', toggleCouponStatus);

// PATCH /api/admin/coupons/:id/restore - restore soft-deleted coupon
router.patch('/:id/restore', restoreCoupon);

// DELETE /api/admin/coupons/:id - soft delete coupon
router.delete('/:id', deleteCoupon);

module.exports = router;

import api from './api';

/**
 * Coupon & Festival Offers Service
 * Handles coupon validation at checkout for users,
 * and full administrative management (CRUD, status toggles, analytics).
 */

/**
 * Validate a promo code during checkout
 * @param {string} code - The coupon code to test
 * @param {number} bookingAmount - Current cart/booking order value
 * @param {string} [categoryId] - Optional category ID
 * @param {string} [serviceId] - Optional service ID
 */
export const validateCoupon = async (code, bookingAmount = 0, categoryId = null, serviceId = null) => {
  const res = await api.post('/coupons/validate', {
    code,
    bookingAmount,
    categoryId,
    serviceId
  });
  return res.data;
};

/**
 * Get active and available promo codes for user checkout
 */
export const getAvailableCoupons = async () => {
  try {
    const res = await api.get('/coupons/available');
    return res.data;
  } catch (error) {
    console.warn('Could not fetch available coupons:', error?.message);
    return { success: false, coupons: [] };
  }
};

/**
 * Admin: Get all coupons and summary metrics
 */
export const getAdminCoupons = async () => {
  const res = await api.get('/admin/coupons');
  return res.data;
};

/**
 * Admin: Create a new festival / promo coupon
 */
export const createCoupon = async (couponData) => {
  const res = await api.post('/admin/coupons', couponData);
  return res.data;
};

/**
 * Admin: Update an existing coupon
 */
export const updateCoupon = async (id, couponData) => {
  const res = await api.put(`/admin/coupons/${id}`, couponData);
  return res.data;
};

/**
 * Admin: Toggle coupon active/inactive status
 */
export const toggleCouponStatus = async (id) => {
  const res = await api.patch(`/admin/coupons/${id}/toggle`);
  return res.data;
};

/**
 * Admin: Delete a coupon (soft delete)
 */
export const deleteCoupon = async (id) => {
  const res = await api.delete(`/admin/coupons/${id}`);
  return res.data;
};

/**
 * Admin: Restore a soft-deleted coupon
 */
export const restoreCoupon = async (id) => {
  const res = await api.patch(`/admin/coupons/${id}/restore`);
  return res.data;
};

export default {
  validateCoupon,
  getAvailableCoupons,
  getAdminCoupons,
  createCoupon,
  updateCoupon,
  toggleCouponStatus,
  deleteCoupon,
  restoreCoupon
};

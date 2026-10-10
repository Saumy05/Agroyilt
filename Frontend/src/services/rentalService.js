import api from './api';

/**
 * Rental Service
 * Manages equipment rental return handover, verification, and damage claims for both Farmers and Vendors.
 */
export const rentalService = {
  /**
   * Confirm equipment return handover
   * @param {string} id - Booking ID or RentalTransaction ID
   * @param {Object} data - { notes?: string }
   * @param {'farmer' | 'vendor'} role - User perspective
   */
  confirmReturn: async (id, data = {}, role = 'farmer') => {
    const endpoint = role === 'vendor'
      ? `/vendors/equipment/bookings/${id}/confirm-return`
      : `/farmer/rentals/${id}/confirm-return`;
    const response = await api.post(endpoint, data);
    return response.data;
  },

  /**
   * Report equipment damage and freeze security deposit
   * @param {string} id - Booking ID or RentalTransaction ID
   * @param {Object} data - { description, photos, estimatedCost, severity }
   * @param {'farmer' | 'vendor'} role - User perspective
   */
  reportDamage: async (id, data, role = 'farmer') => {
    const endpoint = role === 'vendor'
      ? `/vendors/equipment/bookings/${id}/damage-report`
      : `/farmer/rentals/${id}/damage-report`;
    const response = await api.post(endpoint, data);
    return response.data;
  },

  /**
   * Get rental handover and damage status
   * @param {string} id - Booking ID or RentalTransaction ID
   * @param {'farmer' | 'vendor'} role - User perspective
   */
  getRentalDetails: async (id, role = 'farmer') => {
    const endpoint = role === 'vendor'
      ? `/vendors/equipment/bookings/${id}/rental-status`
      : `/farmer/rentals/${id}`;
    const response = await api.get(endpoint);
    return response.data;
  }
};

export default rentalService;

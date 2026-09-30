import api from './api';
import { apiCache } from '../utils/apiCache';

/**
 * Booking Service
 * Handles all API calls for Bookings
 */

export const bookingService = {
  // Create a new booking
  create: async (bookingData) => {
    console.log('[BookingService] Creating booking request');
    apiCache.invalidatePrefix('/users/bookings');
    const response = await api.post('/users/bookings', bookingData);
    return response.data;
  },

  // Get user bookings with filters
  getUserBookings: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);

    const url = `/users/bookings${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    if (!params.skipCache) {
      const cached = apiCache.get(url);
      if (cached) return cached;
    }

    const response = await api.get(url);
    if (response.data?.success) {
      apiCache.set(url, response.data, 20); // 20s TTL
    }
    return response.data;
  },

  // Get booking details by ID
  getById: async (id) => {
    const response = await api.get(`/users/bookings/${id}`);
    return response.data;
  },

  // Cancel booking
  cancel: async (id, cancellationReason) => {
    apiCache.invalidatePrefix('/users/bookings');
    const response = await api.post(`/users/bookings/${id}/cancel`, { cancellationReason });
    return response.data;
  },

  // Reschedule booking
  reschedule: async (id, rescheduleData) => {
    apiCache.invalidatePrefix('/users/bookings');
    const response = await api.put(`/users/bookings/${id}/reschedule`, rescheduleData);
    return response.data;
  },

  // Add review and rating
  addReview: async (id, reviewData) => {
    apiCache.invalidatePrefix('/users/bookings');
    const response = await api.post(`/users/bookings/${id}/review`, reviewData);
    return response.data;
  },

  // Get user ratings and reviews
  getRatings: async (params = {}) => {
    const response = await api.get('/users/bookings/ratings', { params });
    return response.data;
  },

  // ── Agriculture Feature: Check equipment availability for a date+time slot ──
  // Calls the backend API we built in Step 2 (checkEquipmentAvailability controller)
  checkEquipmentAvailability: async (equipmentId, date, time) => {
    console.log(`[BookingService] Checking availability for Equipment: ${equipmentId} on ${date} at ${time}`);
    const response = await api.get('/users/bookings/check-availability', {
      params: { equipmentId, date, time }
    });
    return response.data;
  },

  // Calculate authoritative price from backend
  calculatePrice: async (payload) => {
    const response = await api.post('/users/bookings/calculate-price', payload);
    return response.data;
  },

  // ── INDEPENDENT WORKER FLOW ──
  confirmFinalAmount: async (id, payload) => {
    const response = await api.post(`/users/bookings/${id}/confirm-amount`, payload);
    return response.data;
  },
  selectOfflinePayment: async (id) => {
    const response = await api.post(`/users/bookings/${id}/select-offline-payment`);
    return response.data;
  },

  // Reselect a new vendor when previous vendor rejects, times out, or becomes unavailable
  reselectVendor: async (id, payload) => {
    apiCache.invalidatePrefix('/users/bookings');
    const response = await api.put(`/users/bookings/${id}/reselect-vendor`, payload);
    return response.data;
  }
};

export default bookingService;

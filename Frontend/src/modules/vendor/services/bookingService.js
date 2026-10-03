/**
 * Booking Service
 * Handles all booking-related API calls
 * 
 * Note: This is a structure file for backend integration.
 * Replace localStorage calls with actual API endpoints.
 */

import api from '../../../services/api';

const API_BASE_URL = '/api/vendors';

/**
 * Get all bookings
 * @param {Object} filters - Filter options (status, date range, etc.)
 * @returns {Promise<Array>} List of bookings
 */
export const getBookings = async (filters = {}) => {
  try {
    const response = await api.get('/vendors/bookings', { params: filters });
    return response.data;
  } catch (error) {
    console.error('Error fetching bookings:', error);
    throw error;
  }
};

/**
 * Get booking by ID
 * @param {string} bookingId - Booking ID
 * @returns {Promise<Object>} Booking details
 */
export const getBookingById = async (bookingId) => {
  try {
    const response = await api.get(`/vendors/bookings/${bookingId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching booking:', error);
    throw error;
  }
};

/**
 * Accept a booking
 * @param {string} bookingId - Booking ID
 * @returns {Promise<Object>} Updated booking
 */
export const acceptBooking = async (bookingId) => {
  try {
    const response = await api.post(`/vendors/bookings/${bookingId}/accept`);
    return response.data;
  } catch (error) {
    console.error('Error accepting booking:', error);
    throw error;
  }
};

/**
 * Reject a booking
 * @param {string} bookingId - Booking ID
 * @param {string} reason - Rejection reason
 * @returns {Promise<Object>} Updated booking
 */
export const rejectBooking = async (bookingId, reason = '') => {
  try {
    const response = await api.post(`/vendors/bookings/${bookingId}/reject`, { reason });
    return response.data;
  } catch (error) {
    console.error('Error rejecting booking:', error);
    throw error;
  }
};

// assignWorker removed — Workers are independent users, not Vendor-managed


/**
 * Update booking status
 * @param {string} bookingId - Booking ID
 * @param {string} status - New status
 * @param {Object} data - Additional data (images, notes, etc.)
 * @returns {Promise<Object>} Updated booking
 */
export const updateBookingStatus = async (bookingId, status, data = {}) => {
  try {
    const response = await api.put(`/vendors/bookings/${bookingId}/status`, { status, ...data });
    return response.data;
  } catch (error) {
    console.error('Error updating booking status:', error);
    throw error;
  }
};

/**
 * Start Self Job (Vendor)
 */
export const startSelfJob = async (bookingId) => {
  const response = await api.post(`/vendors/bookings/${bookingId}/self/start`);
  return response.data;
};

/**
 * Notify Reached (Vendor)
 */
export const vendorReached = async (bookingId) => {
  const response = await api.post(`/vendors/bookings/${bookingId}/self/reached`);
  return response.data;
};

/**
 * Verify Self Visit (Vendor)
 */
export const verifySelfVisit = async (bookingId, otp, location) => {
  const response = await api.post(`/vendors/bookings/${bookingId}/self/visit/verify`, { otp, location });
  return response.data;
};

/**
 * Complete Self Job (Vendor)
 */
export const completeSelfJob = async (bookingId, data) => {
  const response = await api.post(`/vendors/bookings/${bookingId}/self/complete`, data);
  return response.data;
};

/**
 * Start Trip - Upload Start KM Photo + Verify Farmer OTP
 * @param {string} bookingId
 * @param {string} kmPhotoUrl - Cloudinary URL of start KM photo
 * @param {string} otp        - OTP provided by farmer
 */
export const startTrip = async (bookingId, kmPhotoUrl, otp) => {
  const response = await api.post(`/vendors/bookings/${bookingId}/trip/start`, {
    start_kilometer_photo: kmPhotoUrl,
    driver_start_otp: otp
  });
  return response.data;
};

/**
 * End Trip - Upload End KM Photo + Verify Farmer OTP + Work Units
 * @param {string} bookingId
 * @param {string} kmPhotoUrl - Cloudinary URL of end KM photo
 * @param {string} otp        - OTP provided by farmer
 * @param {number} workUnits  - Total units (acres/quantity) for billing
 */
export const endTrip = async (bookingId, kmPhotoUrl, otp, workUnits, workEvidencePhoto) => {
  const response = await api.post(`/vendors/bookings/${bookingId}/trip/end`, {
    end_kilometer_photo: kmPhotoUrl,
    driver_end_otp: otp,
    workUnits: workUnits,
    work_evidence_photo: workEvidencePhoto
  });
  return response.data;
};

/**
 * Machinery Start Work — Vendor/Driver verifies farmer's Start OTP + uploads KM photo
 * Calls the correct equipment-specific backend route
 * @param {string} bookingId
 * @param {string} otp - 4-digit OTP provided by farmer
 * @param {string} startKmPhoto - Cloudinary URL of starting meter photo
 */
export const machineryStartWork = async (bookingId, otp, startKmPhoto) => {
  const response = await api.post(`/vendors/equipment/bookings/${bookingId}/start`, {
    otp,
    startKmPhoto
  });
  return response.data;
};

/**
 * Machinery Complete Work — Vendor/Driver submits end KM photo and evidence to mark work done
 * System will automatically generate and send End OTP to farmer
 * @param {string} bookingId
 * @param {string} endKmPhoto - Cloudinary URL of ending meter photo
 * @param {number} workUnits - Amount of work done (e.g., acres) if land based
 * @param {string} evidencePhoto - Cloudinary URL of evidence of work
 */
export const machineryCompleteWork = async (bookingId, endKmPhoto, workUnits, evidencePhoto) => {
  const response = await api.post(`/vendors/equipment/bookings/${bookingId}/complete`, {
    endKmPhoto, workUnits, evidencePhoto
  });
  return response.data;
};

/**
 * Collect Self Cash (Vendor)
 */
export const collectSelfCash = async (bookingId, otp, amount) => {
  const response = await api.post(`/vendors/bookings/${bookingId}/self/payment/collect`, { otp, amount });
  return response.data;
};

/**
 * Pay Worker (Worker Payment Settlement)
 */
export const payWorker = async (bookingId) => {
  const response = await api.post(`/vendors/bookings/${bookingId}/pay-worker`);
  return response.data;
};

/**
 * Get pending booking alerts
 * @returns {Promise<Array>} List of pending bookings
 */
export const getPendingAlerts = async () => {
  try {
    // TODO: Replace with actual API call
    // const response = await fetch(`${API_BASE_URL}/bookings/pending`);
    // return await response.json();

    // Mock implementation
    const pending = JSON.parse(localStorage.getItem('vendorPendingJobs') || '[]');
    return pending;
  } catch (error) {
    console.error('Error fetching pending alerts:', error);
    throw error;
  }
};

/**
 * Get vendor ratings and reviews
 */
export const getRatings = async (params = {}) => {
  try {
    const response = await api.get('/vendors/bookings/ratings', { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching ratings:', error);
    throw error;
  }
};

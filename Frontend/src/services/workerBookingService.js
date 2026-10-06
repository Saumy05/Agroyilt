import api from './api';

/**
 * Worker Booking Service — Farmer side
 * Handles all API calls for the Farmer-First Worker Request System
 * as well as legacy Single Worker and Group Worker requests.
 */

export const workerBookingService = {
  // ── FARMER-FIRST BROADCAST REQUESTS (NEW) ───────────────────────────────

  /**
   * Submit a new farmer-first worker request.
   * Backend auto-routes to Independent Workers or Team Leader flow.
   */
  createFarmerRequest: async (payload) => {
    const response = await api.post('/users/farmer-worker-request', payload);
    return response.data;
  },

  /** Get all of the farmer's broadcast requests */
  getMyFarmerRequests: async (params = {}) => {
    const qp = new URLSearchParams();
    if (params.status) qp.append('status', params.status);
    if (params.page)   qp.append('page',   params.page);
    if (params.limit)  qp.append('limit',  params.limit);
    if (params.withCards) qp.append('withCards', '1');
    const response = await api.get(`/users/farmer-worker-requests${qp.toString() ? `?${qp.toString()}` : ''}`);
    return response.data;
  },

  /** Get a specific farmer broadcast request by ID */
  getFarmerRequestById: async (id) => {
    const response = await api.get(`/users/farmer-worker-request/${id}`);
    return response.data;
  },

  /**
   * Farmer confirms (or rejects) the available workers for their request.
   * @param {string} id - Request ID
   * @param {boolean} accept - true to accept available workers, false to reject
   */
  
  // Worker Selection & Payment (Independent Worker Flow)
  selectWorkersForBooking: async (requestId, selectedWorkerIds) => {
    const response = await api.post(`/users/farmer-worker-request/${requestId}/select-workers`, { selectedWorkerIds });
    return response.data;
  },
  
  createWorkerBookingPayment: async (requestId) => {
    const response = await api.post(`/users/farmer-worker-request/${requestId}/create-payment`);
    return response.data;
  },
  
  verifyWorkerBookingPayment: async (requestId, paymentData) => {
    const response = await api.post(`/users/farmer-worker-request/${requestId}/verify-payment`, paymentData);
    return response.data;
  },

  confirmWorkerBookingCash: async (requestId) => {
    const response = await api.post(`/users/farmer-worker-request/${requestId}/confirm-cash`);
    return response.data;
  },

  generateAdminPaymentQr: async (id, amount, extraItems = []) => {
    const response = await api.post(`/bookings/payment/${id}/generate-admin-qr`, { amount, extraItems });
    return response.data;
  },

  confirmAdminPaymentQr: async (id, utr, amount) => {
    const response = await api.post(`/bookings/payment/${id}/confirm-admin-qr`, { utr, amount });
    return response.data;
  },

  getAdminPaymentQrStatus: async (id) => {
    const response = await api.get(`/bookings/payment/${id}/qr-status`);
    return response.data;
  },

  getTrackingData: async (requestId) => {
    const response = await api.get(`/users/farmer-worker-request/${requestId}/tracking`);
    return response.data;
  },

  generateCompletionOtp: async (requestId, assignmentId) => {
    const response = await api.post(`/users/farmer-worker-request/${requestId}/assignment/${assignmentId}/completion-otp`);
    return response.data;
  },

  generateDailyCompletionOtp: async (requestId, assignmentId, dayNumber) => {
    const response = await api.post(`/users/farmer-worker-request/${requestId}/assignment/${assignmentId}/daily-completion-otp`, { dayNumber });
    return response.data;
  },

  regenerateVisitOtp: async (requestId, assignmentId) => {
    const response = await api.post(`/users/farmer-worker-request/${requestId}/assignment/${assignmentId}/regenerate-visit-otp`);
    return response.data;
  },
  
  processWorkerSettlement: async (bookingId, data) => {
    const response = await api.post(`/booking/${bookingId}/worker-settlement`, data);
    return response.data;
  },
confirmFarmerRequest: async (id, accept) => {
    const response = await api.post(`/users/farmer-worker-request/${id}/confirm`, { accept });
    return response.data;
  },

  /** Farmer cancels a pending/matching broadcast request */
  cancelFarmerRequest: async (id) => {
    const response = await api.delete(`/users/farmer-worker-request/${id}`);
    return response.data;
  },

  // ── WORKER SIDE (for inclusion in workerService; available here for convenience) ──

  /** Worker responds to a farmer broadcast request */
  workerRespondToFarmerRequest: async (id, action, data = {}) => {
    const payload = typeof data === 'object' && data !== null ? { action, ...data } : { action, offeredRate: data };
    const response = await api.patch(`/workers/farmer-request/${id}/respond`, payload);
    return response.data;
  },

  // ── Single Worker (legacy) ───────────────────────────────────────────────

  /** List eligible workers for single-worker hire */
  listWorkers: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.skill)      params.append('skill', filters.skill);
    if (filters.minRating)  params.append('minRating', filters.minRating);
    if (filters.maxRate)    params.append('maxRate', filters.maxRate);
    if (filters.category)   params.append('category', filters.category);
    const response = await api.get(`/users/workers${params.toString() ? `?${params.toString()}` : ''}`);
    return response.data;
  },

  /** Send a single worker booking request (legacy: farmer picks specific worker) */
  createRequest: async (payload) => {
    const response = await api.post('/users/worker-request', payload);
    return response.data;
  },

  /** Get farmer's own single worker requests */
  getMyRequests: async (params = {}) => {
    const qp = new URLSearchParams();
    if (params.status) qp.append('status', params.status);
    const response = await api.get(`/users/worker-requests${qp.toString() ? `?${qp.toString()}` : ''}`);
    return response.data;
  },

  /** Get a specific single worker request */
  getRequestById: async (id) => {
    const response = await api.get(`/users/worker-request/${id}`);
    return response.data;
  },

  /** Farmer responds to a worker's counter offer */
  respondToCounter: async (id, action, rate, message = '') => {
    const response = await api.patch(`/users/worker-request/${id}/respond`, { action, rate, message });
    return response.data;
  },

  /** Farmer cancels their own pending request */
  cancelRequest: async (id) => {
    const response = await api.delete(`/users/worker-request/${id}`);
    return response.data;
  },

  // ── Group Worker (legacy) ────────────────────────────────────────────────

  /** List team leaders */
  listTeamLeaders: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.skill)        params.append('skill', filters.skill);
    if (filters.minRating)    params.append('minRating', filters.minRating);
    if (filters.maxRate)      params.append('maxRate', filters.maxRate);
    if (filters.minTeamSize)  params.append('minTeamSize', filters.minTeamSize);
    const response = await api.get(`/users/team-leaders${params.toString() ? `?${params.toString()}` : ''}`);
    return response.data;
  },

  /** Get a specific team leader's full profile */
  getTeamLeader: async (id) => {
    const response = await api.get(`/users/team-leader/${id}`);
    return response.data;
  },

  /** Send a group booking request to a team leader */
  createGroupRequest: async (payload) => {
    const response = await api.post('/users/group-request', payload);
    return response.data;
  },

  /** Get farmer's own group requests */
  getMyGroupRequests: async (params = {}) => {
    const qp = new URLSearchParams();
    if (params.status) qp.append('status', params.status);
    const response = await api.get(`/users/group-requests${qp.toString() ? `?${qp.toString()}` : ''}`);
    return response.data;
  },

  /** Farmer responds to a leader's counter offer on a group request */
  respondToGroupCounter: async (id, action, rate, message = '') => {
    const response = await api.patch(`/users/group-request/${id}/respond`, { action, rate, message });
    return response.data;
  },

  /** Farmer cancels a pending group request */
  cancelGroupRequest: async (id) => {
    const response = await api.delete(`/users/group-request/${id}`);
    return response.data;
  },
};

export default workerBookingService;


import api from './api';

const workerService = {
  // Profile
  getProfile: async () => {
    const response = await api.get('/workers/profile');
    return response.data;
  },

  updateProfile: async (profileData) => {
    const response = await api.put('/workers/profile', profileData);
    return response.data;
  },

  updateAvailability: async (status) => {
    const response = await api.put('/workers/profile/availability', { status });
    return response.data;
  },

  updateLocation: async (lat, lng) => {
    // Assuming backend accepts { location: { lat, lng } } or similar
    // We send partial update if supported, or implementation depends on backend
    return api.put('/workers/profile/location', { lat, lng });
    // But for suggestion, specific endpoint is cleaner if available. 
    // If not, we fall back to generic profile update.
  },

  getDashboardStats: async () => {
    const response = await api.get('/workers/stats');
    return response.data;
  },

  // Jobs
  getAssignedJobs: async (params) => {
    const response = await api.get('/workers/jobs', { params });
    return response.data;
  },

  getJobById: async (id) => {
    const response = await api.get(`/workers/jobs/${id}`);
    return response.data;
  },

  updateJobStatus: async (id, status, data = {}) => {
    const response = await api.put(`/workers/jobs/${id}/status`, { status, ...data });
    return response.data;
  },

  startJob: async (id) => {
    const response = await api.post(`/workers/jobs/${id}/start`);
    return response.data;
  },

  workerReached: async (id) => {
    const response = await api.post(`/workers/jobs/${id}/reached`);
    return response.data;
  },

  completeJob: async (id, data = {}) => {
    const response = await api.post(`/workers/jobs/${id}/complete`, data);
    return response.data;
  },

  verifyVisit: async (id, otp, location) => {
    const response = await api.post(`/workers/jobs/${id}/visit/verify`, { otp, location });
    return response.data;
  },

  // ── Independent Worker Assignment Lifecycle (Unified Architecture) ──
  getAssignmentDetails: async (assignmentId) => {
    const response = await api.get(`/workers/assignments/${assignmentId}`);
    return response.data;
  },

  startAssignmentJourney: async (assignmentId) => {
    const response = await api.post(`/workers/assignments/${assignmentId}/start-journey`);
    return response.data;
  },

  assignmentReached: async (assignmentId) => {
    const response = await api.post(`/workers/assignments/${assignmentId}/arrived`);
    return response.data;
  },

  verifyAssignmentVisitOtp: async (assignmentId, otp) => {
    const response = await api.post(`/workers/assignments/${assignmentId}/verify-visit-otp`, { otp });
    return response.data;
  },

  submitAssignmentProof: async (assignmentId, data) => {
    const response = await api.post(`/workers/assignments/${assignmentId}/submit-proof`, data);
    return response.data;
  },

  verifyAssignmentCompletionOtp: async (assignmentId, otp) => {
    const response = await api.post(`/workers/assignments/${assignmentId}/verify-completion-otp`, { otp });
    return response.data;
  },

  updateAssignmentLocation: async (assignmentId, locationData) => {
    const response = await api.patch(`/workers/assignments/${assignmentId}/location`, locationData);
    return response.data;
  },

  // ── Daily Booking Multi-day Lifecycle ──
  startDailyDay: async (assignmentId) => {
    const response = await api.post(`/workers/assignments/${assignmentId}/daily/start-day`);
    return response.data;
  },

  markDailyArrived: async (assignmentId) => {
    const response = await api.post(`/workers/assignments/${assignmentId}/daily/arrived`);
    return response.data;
  },

  verifyDailyVisitOtp: async (assignmentId, otp) => {
    const response = await api.post(`/workers/assignments/${assignmentId}/daily/verify-visit-otp`, { otp });
    return response.data;
  },

  verifyDailyCompletionOtp: async (assignmentId, otp) => {
    const response = await api.post(`/workers/assignments/${assignmentId}/daily/verify-completion-otp`, { otp });
    return response.data;
  },

  respondToExtension: async (extensionId, response) => {
    const res = await api.post(`/workers/assignments/extension/${extensionId}/respond`, { response });
    return res.data;
  },

  initiateCashCollection: async (id, totalAmount, extraItems = []) => {
    const response = await api.post(`/bookings/cash/${id}/initiate`, {
      totalAmount,
      extraItems
    });
    return response.data;
  },

  collectCash: async (id, otp, amount, extraItems = []) => {
    const response = await api.post(`/bookings/cash/${id}/confirm`, {
      otp,
      amount,
      extraItems
    });
    return response.data;
  },

  generateAdminQr: async (id, amount, extraItems = []) => {
    const response = await api.post(`/bookings/cash/${id}/generate-admin-qr`, {
      amount,
      extraItems
    });
    return response.data;
  },

  confirmAdminQr: async (id, utr, amount) => {
    const response = await api.post(`/bookings/cash/${id}/confirm-admin-qr`, {
      utr,
      amount
    });
    return response.data;
  },

  getAdminQrStatus: async (id) => {
    const response = await api.get(`/bookings/cash/${id}/qr-status`);
    return response.data;
  },

  addJobNotes: async (id, notes) => {
    const response = await api.post(`/workers/jobs/${id}/notes`, { notes });
    return response.data;
  },

  respondToJob: async (id, status) => {
    const response = await api.put(`/workers/jobs/${id}/respond`, { status });
    return response.data;
  },

  respondToRequest: async (id, action, data = {}) => {
    const response = await api.patch(`/workers/booking-request/${id}/respond`, { action, ...data });
    return response.data;
  },

  respondToFarmerRequest: async (id, action, data = {}) => {
    const response = await api.patch(`/workers/farmer-request/${id}/respond`, { action, ...data });
    return response.data;
  },

  getPendingFarmerRequests: async () => {
    const response = await api.get('/workers/farmer-requests/pending');
    return response.data;
  },

  getMemberInvites: async () => {
    try {
      const response = await api.get('/workers/farmer-requests/member-invites');
      return response.data;
    } catch (e) {
      const response = await api.get('/workers/group-requests/member-invites');
      return response.data;
    }
  },

  acceptJob: async (id) => {
    const response = await api.put(`/workers/jobs/${id}/accept`);
    return response.data;
  },

  // Notifications
  getNotifications: async (params) => {
    const response = await api.get('/notifications/worker', { params });
    return response.data;
  },

  markNotificationAsRead: async (id) => {
    const response = await api.put(`/notifications/${id}/read`);
    return response.data;
  },

  markAllNotificationsAsRead: async () => {
    const response = await api.put('/notifications/read-all');
    return response.data;
  },

  deleteNotification: async (id) => {
    const response = await api.delete(`/notifications/${id}`);
    return response.data;
  },

  deleteAllNotifications: async () => {
    const response = await api.delete('/notifications/delete-all');
    return response.data;
  }
};

export default workerService;




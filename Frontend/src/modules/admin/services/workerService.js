import api from '../../../services/api';

/**
 * Service for Admin to manage Workers and Team Leaders
 */
export const workerService = {
  /**
   * Add a worker directly (admin-created, approved immediately)
   */
  addWorker: async (data) => {
    const response = await api.post('/admin/workers', data);
    return response.data;
  },

  /**
   * Get all workers/team leaders with pagination and filters
   */
  getAllWorkers: async (params = {}) => {
    const qp = new URLSearchParams();
    if (params.page) qp.append('page', params.page);
    if (params.limit) qp.append('limit', params.limit);
    if (params.search) qp.append('search', params.search);
    if (params.approvalStatus) qp.append('approvalStatus', params.approvalStatus);
    if (params.isActive !== undefined) qp.append('isActive', params.isActive);
    if (params.workerType) qp.append('workerType', params.workerType);
    if (params.registrationFeeStatus) qp.append('registrationFeeStatus', params.registrationFeeStatus);
    if (params.availability) qp.append('availability', params.availability);
    
    const response = await api.get(`/admin/workers${qp.toString() ? `?${qp.toString()}` : ''}`);
    return response.data;
  },

  /**
   * Get specific worker details
   */
  getWorkerDetails: async (id) => {
    const response = await api.get(`/admin/workers/${id}`);
    return response.data;
  },

  /**
   * Approve a pending worker
   */
  approveWorker: async (id) => {
    const response = await api.post(`/admin/workers/${id}/approve`);
    return response.data;
  },

  /**
   * Reject a pending worker
   */
  rejectWorker: async (id, reason = '') => {
    const response = await api.post(`/admin/workers/${id}/reject`, { reason });
    return response.data;
  },

  /**
   * Suspend an active worker
   */
  suspendWorker: async (id) => {
    const response = await api.post(`/admin/workers/${id}/suspend`);
    return response.data;
  },

  /**
   * Delete worker
   */
  deleteWorker: async (id) => {
    const response = await api.delete(`/admin/workers/${id}`);
    return response.data;
  },

  /**
   * Toggle worker availability (Online / Offline) by admin
   */
  toggleWorkerAvailability: async (id, status) => {
    const response = await api.patch(`/admin/workers/${id}/availability`, { status });
    return response.data;
  },

  /**
   * Get all worker jobs globally (for admin view)
   */
  getAllWorkerJobs: async (params = {}) => {
    const qp = new URLSearchParams();
    if (params.page) qp.append('page', params.page);
    if (params.limit) qp.append('limit', params.limit);
    if (params.status) qp.append('status', params.status);
    if (params.search) qp.append('search', params.search);
    
    const response = await api.get(`/admin/workers/jobs${qp.toString() ? `?${qp.toString()}` : ''}`);
    return response.data;
  },

  /**
   * Farmer worker requests still waiting on workers / the farmer (no booking yet)
   */
  getOpenWorkerRequests: async (params = {}) => {
    const qp = new URLSearchParams();
    if (params.page) qp.append('page', params.page);
    if (params.limit) qp.append('limit', params.limit);
    if (params.search) qp.append('search', params.search);
    if (params.scope) qp.append('scope', params.scope);

    const response = await api.get(`/admin/workers/requests${qp.toString() ? `?${qp.toString()}` : ''}`);
    return response.data;
  },

  /**
   * Get worker analytics overview
   */
  getWorkerAnalytics: async (params = {}) => {
    const qp = new URLSearchParams();
    if (params.period) qp.append('period', params.period);
    
    const response = await api.get(`/admin/workers/analytics${qp.toString() ? `?${qp.toString()}` : ''}`);
    return response.data;
  },

  /**
   * Get jobs for a specific worker
   */
  getWorkerJobs: async (id, params = {}) => {
    const qp = new URLSearchParams();
    if (params.page) qp.append('page', params.page);
    if (params.limit) qp.append('limit', params.limit);
    
    const response = await api.get(`/admin/workers/${id}/jobs${qp.toString() ? `?${qp.toString()}` : ''}`);
    return response.data;
  },

  /**
   * Get worker payments summary
   */
  getWorkerPaymentsSummary: async () => {
    const response = await api.get(`/admin/workers/payments`);
    return response.data;
  },

  /**
   * Get earnings for a specific worker
   */
  getWorkerEarnings: async (id) => {
    const response = await api.get(`/admin/workers/${id}/earnings`);
    return response.data;
  }
};

export default workerService;

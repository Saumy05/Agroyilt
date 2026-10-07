import api from './api';

const adminSupportService = {
  // Get all support tickets with filtering and pagination
  getTickets: async (params = {}) => {
    const response = await api.get('/admin/support/tickets', { params });
    return response.data;
  },

  // Get single ticket details and conversation
  getTicketById: async (ticketId) => {
    const response = await api.get(`/admin/support/tickets/${ticketId}`);
    return response.data;
  },

  // Send admin reply or internal note
  replyTicket: async (ticketId, payload) => {
    const response = await api.post(`/admin/support/tickets/${ticketId}/messages`, payload);
    return response.data;
  },

  // Update ticket status
  updateStatus: async (ticketId, status) => {
    const response = await api.patch(`/admin/support/tickets/${ticketId}/status`, { status });
    return response.data;
  },

  // Update ticket priority
  updatePriority: async (ticketId, priority) => {
    const response = await api.patch(`/admin/support/tickets/${ticketId}/priority`, { priority });
    return response.data;
  },

  // Assign ticket to admin
  assignTicket: async (ticketId, payload) => {
    const response = await api.patch(`/admin/support/tickets/${ticketId}/assign`, payload);
    return response.data;
  },

  // Claim an unclaimed ticket (first agent wins)
  claimTicket: async (ticketId) => {
    const response = await api.post(`/admin/support/tickets/${ticketId}/claim`);
    return response.data;
  },

  // Put a claimed ticket back in the shared queue
  releaseTicket: async (ticketId) => {
    const response = await api.post(`/admin/support/tickets/${ticketId}/release`);
    return response.data;
  },

  // Super admin: what each support agent is holding
  getTeam: async () => {
    const response = await api.get('/admin/support/team');
    return response.data;
  },

  // Legacy fallback: Get all support queries
  getQueries: async (params = {}) => {
    const response = await api.get('/admin/support/all', { params });
    return response.data;
  },

  // Legacy fallback: Respond to a query
  respondToQuery: async (id, data) => {
    const response = await api.put(`/admin/support/respond/${id}`, data);
    return response.data;
  }
};

export default adminSupportService;

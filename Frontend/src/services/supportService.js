import api from './api';

const supportService = {
  // Create a support ticket
  createTicket: async (ticketData) => {
    const response = await api.post('/support/tickets', ticketData);
    return response.data;
  },

  // Get current user's support tickets (paginated)
  getMyTickets: async (params = {}) => {
    const response = await api.get('/support/tickets/my', { params });
    return response.data;
  },

  // Get ticket detail and conversation thread
  getTicketById: async (ticketId) => {
    const response = await api.get(`/support/tickets/${ticketId}`);
    return response.data;
  },

  // Send message/reply to a ticket
  sendMessage: async (ticketId, payload) => {
    const response = await api.post(`/support/tickets/${ticketId}/messages`, payload);
    return response.data;
  },

  // Reopen a resolved ticket
  reopenTicket: async (ticketId, payload) => {
    const response = await api.post(`/support/tickets/${ticketId}/reopen`, payload);
    return response.data;
  },

  // Get unread replies count
  getUnreadCount: async () => {
    const response = await api.get('/support/unread-count');
    return response.data;
  }
};

export default supportService;

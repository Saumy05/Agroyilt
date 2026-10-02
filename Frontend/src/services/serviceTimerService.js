import api from './api';

export const serviceTimerService = {
  getStatus: async (bookingId) => {
    const res = await api.get(`/bookings/service-timer/${bookingId}/status`);
    return res.data;
  },

  start: async (bookingId) => {
    const res = await api.post(`/bookings/service-timer/${bookingId}/start`);
    return res.data;
  },

  pause: async (bookingId, { reason = 'machine_issue', notes = '' } = {}) => {
    const res = await api.post(`/bookings/service-timer/${bookingId}/pause`, { reason, notes });
    return res.data;
  },

  resume: async (bookingId, { otp = null } = {}) => {
    const res = await api.post(`/bookings/service-timer/${bookingId}/resume`, { otp });
    return res.data;
  },

  end: async (bookingId, { isPartial = false, reason = '', end_otp = null } = {}) => {
    const res = await api.post(`/bookings/service-timer/${bookingId}/end`, { isPartial, reason, end_otp });
    return res.data;
  }
};

export default serviceTimerService;

import api from './api';

export const paymentDefaultService = {
  // Vendor: the farmer will not pay the final bill. Opens an urgent support dispute.
  report: async (bookingId, { reason, notes = '' }) => {
    const res = await api.post(`/bookings/payment-default/${bookingId}/report`, { reason, notes });
    return res.data;
  },

  // Farmer: dues owed after an unpaid bill was resolved against them
  getMyDues: async () => {
    const res = await api.get('/bookings/payment-default/my-dues');
    return res.data;
  },

  payFromWallet: async () => {
    const res = await api.post('/bookings/payment-default/pay-wallet');
    return res.data;
  }
};

export default paymentDefaultService;

import api from './api';

const workerWalletService = {
  getWallet: async () => {
    try {
      const response = await api.get('/workers/wallet');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  getTransactions: async (params) => {
    try {
      const response = await api.get('/workers/wallet/transactions', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // ── Dues the worker owes the platform ──
  createDuesOrder: async (amount) => {
    try {
      const response = await api.post('/workers/wallet/dues/create-order', amount ? { amount } : {});
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  verifyDuesPayment: async (payload) => {
    try {
      const response = await api.post('/workers/wallet/dues/verify', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  submitOfflineDuesPayment: async (payload) => {
    try {
      const response = await api.post('/workers/wallet/dues/offline', payload);
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  getDuesPayments: async () => {
    try {
      const response = await api.get('/workers/wallet/dues/payments');
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  requestPayout: async (bookingId) => {
    try {
      const response = await api.post('/workers/wallet/request-payout', { bookingId });
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  }
};

export default workerWalletService;

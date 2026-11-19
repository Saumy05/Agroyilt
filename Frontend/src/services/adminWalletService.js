import api from './api';

/**
 * Admin Wallet & Incentives Service
 * Handles polymorphic wallet balances, adjustments, incentives, and ledgers
 * across Vendors, Workers, and Users/Farmers.
 */
const adminWalletService = {
  /**
   * Get wallet balances list
   * @param {Object} params - { role: 'vendor'|'worker'|'user', page, limit, search, filterDue }
   */
  getWallets: async (params = {}) => {
    const response = await api.get('/admin/wallets', { params });
    return response.data;
  },

  /**
   * Adjust entity wallet balance or COD dues (Matches Screen 1 Modal)
   * @param {Object} data - { role, targetId, walletTarget, actionType, amount, reason, allowNegative }
   */
  adjustWallet: async (data) => {
    const response = await api.post('/admin/wallets/adjust', data);
    return response.data;
  },

  /**
   * Get entity ledger and transaction history
   * @param {string} role - 'vendor'|'worker'|'user'
   * @param {string} id - Entity ID
   * @param {Object} params - { page, limit }
   */
  getLedger: async (role, id, params = {}) => {
    const response = await api.get(`/admin/wallets/ledger/${role}/${id}`, { params });
    return response.data;
  },

  /**
   * Get incentives leaderboard and period rankings (Matches Screen 2 Table)
   * @param {Object} params - { role: 'vendor'|'worker'|'user', period, page, limit, search }
   */
  getIncentives: async (params = {}) => {
    const response = await api.get('/admin/incentives', { params });
    return response.data;
  },

  /**
   * Award performance incentive to entity (Matches Screen 2 Modal)
   * @param {Object} data - { role, targetId, amount, reason, period }
   */
  awardIncentive: async (data) => {
    const response = await api.post('/admin/incentives/award', data);
    return response.data;
  }
};

export default adminWalletService;

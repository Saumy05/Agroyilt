import api from './api';

export const referralService = {
  /**
   * Validate referral code (Public / Onboarding)
   * @param {string} code
   */
  validateReferralCode: async (code) => {
    try {
      const response = await api.get('/referrals/validate', {
        params: { code: code.trim().toUpperCase() }
      });
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Invalid referral code'
      };
    }
  },

  /**
   * Public: which roles currently have the referral program on
   */
  getPublicStatus: async () => {
    const response = await api.get('/referrals/status');
    return response.data;
  },

  /**
   * Public: the Play Store and registration links the invite page (/r/<CODE>) sends people to
   */
  getInviteConfig: async () => {
    const response = await api.get('/referrals/invite-config');
    return response.data;
  },

  /**
   * Get authenticated user's referral code, link, and statistics
   */
  getMyReferralStats: async () => {
    try {
      const response = await api.get('/referrals/me');
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  /**
   * Admin: Get referral system settings & audit history
   */
  getAdminSettings: async () => {
    const response = await api.get('/admin/referrals/settings');
    return response.data;
  },

  /**
   * Admin: Update referral system configuration & role rewards
   */
  updateAdminSettings: async (settings) => {
    const response = await api.put('/admin/referrals/settings', settings);
    return response.data;
  },

  /**
   * Admin: Get attributions list and dashboard statistics
   */
  getAdminAttributions: async (params = {}) => {
    const response = await api.get('/admin/referrals/attributions', { params });
    return response.data;
  },

  /**
   * Admin: Reverse a referral reward
   */
  reverseReward: async (attributionId, reason) => {
    const response = await api.post(`/admin/referrals/attributions/${attributionId}/reverse`, { reason });
    return response.data;
  }
};

export default referralService;

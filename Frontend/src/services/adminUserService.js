import api from './api';

export const adminUserService = {
  // Get all users with pagination and filtering
  getAllUsers: async (params) => {
    try {
      const response = await api.get('/admin/users', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch users' };
    }
  },

  // Add a new farmer directly
  addUser: async (data) => {
    try {
      const response = await api.post('/admin/users', data);
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to add farmer' };
    }
  },

  // Get all user bookings
  getAllUserBookings: async (params) => {
    try {
      const response = await api.get('/admin/users/bookings', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch user bookings' };
    }
  },

  // Get user details
  getUserDetails: async (id) => {
    try {
      const response = await api.get(`/admin/users/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch user details' };
    }
  },

  // Block/Unblock user
  toggleUserStatus: async (id, isActive) => {
    try {
      const response = await api.put(`/admin/users/${id}/status`, { isActive });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to update user status' };
    }
  },

  // Delete user (soft delete)
  deleteUser: async (id) => {
    try {
      const response = await api.delete(`/admin/users/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to delete user' };
    }
  },

  // Restore soft-deleted user
  restoreUser: async (id) => {
    try {
      const response = await api.patch(`/admin/users/${id}/restore`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to restore user' };
    }
  },

  // Update farmer approval status (approved / rejected)
  updateApprovalStatus: async (id, approvalStatus, rejectionReason = '') => {
    try {
      const response = await api.put(`/admin/users/${id}/approval`, { approvalStatus, rejectionReason });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to update farmer approval status' };
    }
  },

  // Get user bookings
  getUserBookings: async (id, params) => {
    try {
      const response = await api.get(`/admin/users/${id}/bookings`, { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch user bookings' };
    }
  },

  // Get user wallet transactions
  getUserWalletTransactions: async (id) => {
    try {
      const response = await api.get(`/admin/users/${id}/wallet`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch wallet transactions' };
    }
  },

  // Get all users with KYC documents submitted (Equipment Owners)
  getUsersWithKyc: async (params) => {
    try {
      const response = await api.get('/admin/users', { params: { ...params, hasKyc: true } });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch KYC users' };
    }
  },

  // Update KYC status - approve or reject
  updateKycStatus: async (userId, status) => {
    try {
      const response = await api.put(`/admin/users/${userId}/kyc-status`, { kyc_status: status });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to update KYC status' };
    }
  }
};

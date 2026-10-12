import api from '../../../services/api';

const adminLandLeaseService = {
  list: async (params = {}) => {
    const response = await api.get('/admin/land-leases', { params });
    return response.data;
  },
  stats: async () => {
    const response = await api.get('/admin/land-leases/stats');
    return response.data;
  },
  getById: async (id) => {
    const response = await api.get(`/admin/land-leases/${id}`);
    return response.data;
  }
};

export default adminLandLeaseService;

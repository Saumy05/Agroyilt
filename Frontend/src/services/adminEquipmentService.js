import api from './api';

const adminEquipmentService = {
  getPending: async () => {
    const response = await api.get('/admin/equipment?status=pending');
    return response.data;
  },
  
  getAll: async (params) => {
    const response = await api.get('/admin/equipment', { params });
    return response.data;
  },

  updateStatus: async (id, { status, remarks, rentByUnit, unitLabel }) => {
    const response = await api.patch(`/admin/equipment/${id}/status`, { status, remarks, rentByUnit, unitLabel });
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/admin/equipment/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/admin/equipment/${id}`);
    return response.data;
  }
};

export default adminEquipmentService;

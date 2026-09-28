/**
 * Geographic Management Service (Admin)
 * Handles State, District, and Sub-District API calls.
 *
 * Hierarchy: GLOBAL_INDIA → State → District → SubDistrict
 */
import api from '../../../services/api';

// ── States ────────────────────────────────────────────────────────────────────
export const stateService = {
  getAll: async (params = {}) => {
    const response = await api.get('/admin/states', { params });
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/admin/states', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/admin/states/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/admin/states/${id}`);
    return response.data;
  },
  toggleStatus: async (id) => {
    const response = await api.patch(`/admin/states/${id}/status`);
    return response.data;
  }
};

// ── Districts ─────────────────────────────────────────────────────────────────
export const districtService = {
  getAll: async (params = {}) => {
    const response = await api.get('/admin/districts', { params });
    return response.data;
  },
  getByState: async (stateId) => {
    const response = await api.get('/admin/districts', { params: { stateId, isActive: 'true' } });
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/admin/districts', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/admin/districts/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/admin/districts/${id}`);
    return response.data;
  },
  toggleStatus: async (id) => {
    const response = await api.patch(`/admin/districts/${id}/status`);
    return response.data;
  }
};

// ── Sub-Districts ─────────────────────────────────────────────────────────────
export const subDistrictService = {
  getAll: async (params = {}) => {
    const response = await api.get('/admin/sub-districts', { params });
    return response.data;
  },
  getByDistrict: async (districtId) => {
    const response = await api.get('/admin/sub-districts', { params: { districtId, isActive: 'true' } });
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/admin/sub-districts', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/admin/sub-districts/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/admin/sub-districts/${id}`);
    return response.data;
  },
  toggleStatus: async (id) => {
    const response = await api.patch(`/admin/sub-districts/${id}/status`);
    return response.data;
  }
};

export const geoService = {
  stateService,
  districtService,
  subDistrictService
};

export default geoService;

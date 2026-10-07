import api from '../../../services/api';

// Saved permission sets ("Support Agent", "Site Manager"). Super admin only.
export const getRoles = async () => (await api.get('/admin/roles')).data;
export const getRole = async (id) => (await api.get(`/admin/roles/${id}`)).data;
export const createRole = async (data) => (await api.post('/admin/roles', data)).data;
export const updateRole = async (id, data) => (await api.put(`/admin/roles/${id}`, data)).data;
export const deleteRole = async (id) => (await api.delete(`/admin/roles/${id}`)).data;
export const seedStarterRoles = async () => (await api.post('/admin/roles/seed-starters')).data;

import api from '../../../services/api';

const adminWorkCategoryService = {
  list: async () => (await api.get('/admin/work-categories')).data,
  create: async (data) => (await api.post('/admin/work-categories', data)).data,
  update: async (id, data) => (await api.put(`/admin/work-categories/${id}`, data)).data,
  remove: async (id) => (await api.delete(`/admin/work-categories/${id}`)).data
};

export default adminWorkCategoryService;

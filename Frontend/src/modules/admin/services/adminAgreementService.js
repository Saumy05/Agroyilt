import api from '../../../services/api';

const adminAgreementService = {
  list: async (params = {}) => (await api.get('/admin/agreements', { params })).data,
  get: async (id) => (await api.get(`/admin/agreements/${id}`)).data,
  audit: async (id) => (await api.get(`/admin/agreements/${id}/audit`)).data,
  evidencePdf: async (id) => (await api.get(`/admin/agreements/${id}/audit.pdf`, { responseType: 'blob' })).data,
  pdf: async (id) => (await api.get(`/admin/agreements/${id}/pdf`, { responseType: 'blob' })).data,
  flagDispute: async (id, notes) => (await api.post(`/admin/agreements/${id}/dispute`, { notes })).data,
  resolveDispute: async (id, notes) => (await api.post(`/admin/agreements/${id}/dispute/resolve`, { notes })).data,
  remind: async (id) => (await api.post(`/admin/agreements/${id}/remind`)).data,
  cancel: async (id, reason) => (await api.post(`/admin/agreements/${id}/cancel`, { reason })).data,

  listTemplates: async () => (await api.get('/admin/agreement-templates')).data,
  placeholders: async () => (await api.get('/admin/agreement-templates/placeholders')).data,
  createTemplate: async (body) => (await api.post('/admin/agreement-templates', body)).data,
  updateTemplate: async (id, body) => (await api.put(`/admin/agreement-templates/${id}`, body)).data,
  activateTemplate: async (id) => (await api.post(`/admin/agreement-templates/${id}/activate`)).data,
  deleteTemplate: async (id) => (await api.delete(`/admin/agreement-templates/${id}`)).data,
  previewTemplate: async (body) => (await api.post('/admin/agreement-templates/preview', body)).data
};

export default adminAgreementService;

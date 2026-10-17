import api from './api';

const adminProductService = {
    // Admin Store Management (Central Store)
    getAll: async () => {
        const response = await api.get('/admin/products');
        return response.data;
    },

    create: async (data) => {
        const response = await api.post('/admin/products', data);
        return response.data;
    },

    update: async (id, data) => {
        const response = await api.put(`/admin/products/${id}`, data);
        return response.data;
    },

    delete: async (id) => {
        const response = await api.delete(`/admin/products/${id}`);
        return response.data;
    },

    // Vendor Submission Workflow
    getVendorSubmissions: async (approvalStatus = '', type = '') => {
        const params = {};
        if (approvalStatus) params.approvalStatus = approvalStatus;
        if (type) params.type = type;
        const response = await api.get('/admin/vendor-submissions', { params });
        return response.data;
    },

    approveProduct: async (id, data) => {
        // data: { commissionPercentage, gstPercentage }
        const response = await api.post(`/admin/vendor-submissions/${id}/approve`, data);
        return response.data;
    },

    rejectProduct: async (id, reason = '') => {
        const response = await api.post(`/admin/vendor-submissions/${id}/reject`, { reason });
        return response.data;
    }
};

export default adminProductService;

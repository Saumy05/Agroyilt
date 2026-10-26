import api from './api';

export const workCategoryService = {
  /** The active work categories, in the admin's order (public) */
  getAll: async () => {
    const response = await api.get('/work-categories');
    return response.data;
  }
};

export default workCategoryService;

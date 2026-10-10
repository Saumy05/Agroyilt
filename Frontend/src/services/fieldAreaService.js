import api from './api';

export const fieldAreaService = {
  /**
   * Calculate field area via backend API
   */
  calculate: async ({ points, manualAcres, region = 'standard' }) => {
    try {
      const response = await api.post('/field-area/calculate', {
        points,
        manualAcres,
        region
      });
      return response.data;
    } catch (error) {
      console.error('Error calculating field area on server:', error);
      throw error;
    }
  },

  /**
   * Get supported regional conversion units
   */
  getRegions: async () => {
    try {
      const response = await api.get('/field-area/regions');
      return response.data;
    } catch (error) {
      console.error('Error fetching regions:', error);
      throw error;
    }
  },

  /**
   * Save field polygon boundary to farmer's profile
   */
  saveFarmBoundary: async (farmData) => {
    try {
      const response = await api.post('/field-area/save-farm', farmData);
      return response.data;
    } catch (error) {
      console.error('Error saving farm boundary:', error);
      throw error;
    }
  }
};

export default fieldAreaService;

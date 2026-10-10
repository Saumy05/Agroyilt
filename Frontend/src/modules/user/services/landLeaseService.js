import api from '../../../services/api';

/**
 * Land Lease / Theka Marketplace Service
 * Facilitates exploring land, listing farmland for rent/batai, and lease negotiations.
 */
const landLeaseService = {
  /**
   * Browse available land leases with filters
   * @param {Object} params - { type, search, minAcres, maxAcres, minPrice, maxPrice, page, limit }
   */
  browseLandLeases: async (params = {}) => {
    const response = await api.get('/farmer/land-leases', { params });
    return response.data;
  },

  /**
   * Get single land lease details by ID
   * @param {string} id 
   */
  getLandDetails: async (id) => {
    const response = await api.get(`/farmer/land-leases/${id}`);
    return response.data;
  },

  /**
   * Post new land for lease
   * @param {Object} data 
   */
  listLand: async (data) => {
    const response = await api.post('/farmer/land-leases', data);
    return response.data;
  },

  /**
   * Get lands listed by current user & applied offers
   */
  getMyLeases: async () => {
    const response = await api.get('/farmer/land-leases/my-leases');
    return response.data;
  },

  /**
   * Submit or negotiate an offer on a land listing
   * @param {string} id - Land Lease ID
   * @param {Object} offerData - { proposedPrice, proposedShare, durationMonths, proposedCrops, message }
   */
  submitOffer: async (id, offerData) => {
    const response = await api.post(`/farmer/land-leases/${id}/negotiate`, offerData);
    return response.data;
  },

  /**
   * Landowner accepts a tenant's offer
   * @param {string} id - Land Lease ID
   * @param {string} offerId - Offer ID
   */
  acceptOffer: async (id, offerId) => {
    const response = await api.post(`/farmer/land-leases/${id}/accept-offer`, { offerId });
    return response.data;
  },

  /**
   * Delete or withdraw a land listing
   * @param {string} id 
   */
  deleteLand: async (id) => {
    const response = await api.delete(`/farmer/land-leases/${id}`);
    return response.data;
  }
};

export default landLeaseService;

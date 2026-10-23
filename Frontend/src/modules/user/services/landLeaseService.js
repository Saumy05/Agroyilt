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
   * Owner ends the lease for unpaid rent, or starts the 15-day notice when the rules allow it
   * @param {string} id - Land Lease ID
   */
  endForNonPayment: async (id) => {
    const response = await api.post(`/farmer/land-leases/${id}/end-notice`);
    return response.data;
  },

  /**
   * Mark or correct the border of a listing (corner points marked on the map)
   * @param {string} id - Land Lease ID
   * @param {Array<{lat:number,lng:number}>} boundaryPoints
   */
  setBoundary: async (id, boundaryPoints) => {
    const response = await api.put(`/farmer/land-leases/${id}/boundary`, { boundaryPoints });
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
   * @param {'hi'|'en'} [language] - language of the lease agreement that is made
   */
  acceptOffer: async (id, offerId, language = 'hi') => {
    const response = await api.post(`/farmer/land-leases/${id}/accept-offer`, { offerId, language });
    return response.data;
  },

  /**
   * Landowner rejects a tenant's offer
   * @param {string} id - Land Lease ID
   * @param {string} offerId - Offer ID
   */
  rejectOffer: async (id, offerId) => {
    const response = await api.post(`/farmer/land-leases/${id}/reject-offer`, { offerId });
    return response.data;
  },

  /** Agreement, rent installments and crop-share settlements (owner and tenant only) */
  getPayments: async (id) => {
    const response = await api.get(`/farmer/land-leases/${id}/payments`);
    return response.data;
  },

  /** Tenant pays a monthly rent installment from the wallet */
  payInstallment: async (id, itemId) => {
    const response = await api.post(`/farmer/land-leases/${id}/installments/${itemId}/pay`);
    return response.data;
  },

  /** Tenant submits the harvest value for a crop-share lease */
  submitSettlement: async (id, data) => {
    const response = await api.post(`/farmer/land-leases/${id}/settlements`, data);
    return response.data;
  },

  /** Owner confirms or rejects a submitted settlement */
  reviewSettlement: async (id, itemId, decision) => {
    const response = await api.post(`/farmer/land-leases/${id}/settlements/${itemId}/${decision}`);
    return response.data;
  },

  /** Tenant pays a confirmed settlement from the wallet */
  paySettlement: async (id, itemId) => {
    const response = await api.post(`/farmer/land-leases/${id}/settlements/${itemId}/pay`);
    return response.data;
  },

  /** Online payment (when the wallet is short): open a Razorpay order for a rent installment or settlement */
  createOnlineOrder: async (id, kind, itemId) => {
    const response = await api.post(`/farmer/land-leases/${id}/${kind}s/${itemId}/pay-online/order`);
    return response.data;
  },

  /** Online payment: confirm the Razorpay checkout result so the owner gets paid */
  verifyOnlinePayment: async (id, kind, itemId, payload) => {
    const response = await api.post(`/farmer/land-leases/${id}/${kind}s/${itemId}/pay-online/verify`, payload);
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

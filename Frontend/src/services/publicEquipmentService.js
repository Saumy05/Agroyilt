import api from './api';

/**
 * Public Equipment Service for Farmers
 * Handles browsing machinery and checking availability for rentals.
 */
export const publicEquipmentService = {
  // Get all approved machinery (with city / state / district filter)
  getAllEquipment: async (filters = {}) => {
    const { cityId, stateId, districtId, subDistrictId, categoryId, implementId, search, isFeatured, mode } = filters;
    const params = {};
    if (cityId) params.cityId = cityId;
    if (stateId) params.stateId = stateId;
    if (districtId) params.districtId = districtId;
    if (subDistrictId) params.subDistrictId = subDistrictId;
    if (categoryId) params.categoryId = categoryId;
    if (implementId) params.implementId = implementId;
    if (search) params.search = search;
    if (isFeatured) params.isFeatured = true;
    if (mode) params.mode = mode; // 'rental' -> only admin-marked rental machines

    const response = await api.get('/public/equipment', { params });
    return response.data;
  },

  // Get single equipment details by ID
  getEquipmentById: async (id) => {
    const response = await api.get(`/public/equipment/${id}`);
    return response.data;
  },

  // Check equipment availability for specific date/time
  checkAvailability: async (equipmentId, date, timeSlot) => {
    const response = await api.get(`/public/equipment/${equipmentId}/availability`, {
      params: { date, timeSlot }
    });
    return response.data;
  },

  // Get categories specifically for machinery (e.g. Tractor, Harvester)
  getMachineryCategories: async (geo = {}) => {
    const geoParams = typeof geo === 'string' ? { cityId: geo } : (geo || {});
    const params = { type: 'service' }; // Machinery are services in this project
    if (geoParams.cityId) params.cityId = geoParams.cityId;
    if (geoParams.stateId) params.stateId = geoParams.stateId;
    if (geoParams.districtId) params.districtId = geoParams.districtId;
    if (geoParams.subDistrictId) params.subDistrictId = geoParams.subDistrictId;
    if (geoParams.mode) params.mode = geoParams.mode; // 'rental' | 'service'
    
    const response = await api.get('/public/categories', { params });
    if (response.data.success && Array.isArray(response.data.categories)) {
      return {
        success: true,
        // Show main categories + filter out WORKER for machinery specific views
        data: response.data.categories.filter(c => (!c.parentCategory || c.isAlwaysMain) && c.bookingType !== 'WORKER' && !c.slug.includes('worker'))
      };
    }
    return { success: false, data: [] };
  },

  // Get implements (subcategories) for a specific main category
  getImplementsForCategory: async (categoryId, geo = {}) => {
    const geoParams = typeof geo === 'string' ? { cityId: geo } : (geo || {});
    const params = {};
    if (geoParams.cityId) params.cityId = geoParams.cityId;
    if (geoParams.stateId) params.stateId = geoParams.stateId;
    if (geoParams.districtId) params.districtId = geoParams.districtId;
    if (geoParams.subDistrictId) params.subDistrictId = geoParams.subDistrictId;
    const response = await api.get('/public/categories', { params });
    if (response.data.success && Array.isArray(response.data.categories)) {
      return {
        success: true,
        data: response.data.categories.filter(c => {
          // Check legacy single parent category
          const hasLegacyParent = c.parentCategory && (
            c.parentCategory === categoryId || 
            c.parentCategory.id === categoryId || 
            c.parentCategory._id === categoryId
          );
          
          // Check new multiple parent categories array
          const hasArrayParent = Array.isArray(c.parentCategories) && c.parentCategories.some(p => 
            p === categoryId || p.id === categoryId || p._id === categoryId
          );

          return hasLegacyParent || hasArrayParent;
        })
      };
    }
    return { success: false, data: [] };
  },

  // Find qualified nearby vendors for tractor/equipment with HP, implement, and real availability
  getQualifiedVendors: async (payload = {}) => {
    const response = await api.post('/public/equipment/qualified-vendors', payload);
    return response.data;
  }
};

export default publicEquipmentService;

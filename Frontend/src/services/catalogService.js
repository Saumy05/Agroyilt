import api, { apiCache } from './api';
import { uploadToCloudinary } from '../utils/cloudinaryUpload';

/**
 * Catalog Service
 * Handles all API calls for Categories, Brands (formerly Services), Services (Sub-services), and Home Content
 */

/**
 * Category API calls
 */
export const categoryService = {
  // Get all categories
  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.showOnHome !== undefined) queryParams.append('showOnHome', params.showOnHome);
    if (params.isPopular !== undefined) queryParams.append('isPopular', params.isPopular);
    if (params.cityId) queryParams.append('cityId', params.cityId);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.search) queryParams.append('search', params.search);

    const response = await api.get(`/admin/categories${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  },

  // Get single category by ID
  getById: async (id) => {
    const response = await api.get(`/admin/categories/${id}`);
    return response.data;
  },

  // Create new category
  create: async (data) => {
    const response = await api.post('/admin/categories', data);
    return response.data;
  },

  // Update category
  update: async (id, data) => {
    const response = await api.put(`/admin/categories/${id}`, data);
    return response.data;
  },

  // Delete category
  delete: async (id) => {
    const response = await api.delete(`/admin/categories/${id}`);
    return response.data;
  },

  // Update category order
  updateOrder: async (id, homeOrder) => {
    const response = await api.patch(`/admin/categories/${id}/order`, { homeOrder });
    return response.data;
  }
};

/**
 * Brand API calls (Formerly Service)
 */
export const brandService = {
  // Get all brands
  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.categoryId) queryParams.append('categoryId', params.categoryId);
    if (params.cityId) queryParams.append('cityId', params.cityId);

    const response = await api.get(`/admin/brands${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  },

  // Get single brand by ID
  getById: async (id) => {
    const response = await api.get(`/admin/brands/${id}`);
    return response.data;
  },

  // Create new brand
  create: async (data) => {
    const response = await api.post('/admin/brands', data);
    return response.data;
  },

  // Update brand
  update: async (id, data) => {
    const response = await api.put(`/admin/brands/${id}`, data);
    return response.data;
  },

  // Delete brand
  delete: async (id) => {
    const response = await api.delete(`/admin/brands/${id}`);
    return response.data;
  },

  // Update brand page content
  updatePage: async (id, page) => {
    const response = await api.patch(`/admin/brands/${id}/page`, { page });
    return response.data;
  },

  // Upload brand image/video directly to Cloudinary
  uploadImage: async (file, folder = 'brands', onProgress) => {
    try {
      const url = await uploadToCloudinary(file, folder, onProgress);
      return {
        success: true,
        imageUrl: url,
        message: 'File uploaded successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to upload file',
        error: error.message
      };
    }
  }
};



/**
 * Service API calls (New Service Model - Child of Brand)
 */
export const serviceService = {
  // Get all services
  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.brandId) queryParams.append('brandId', params.brandId);
    if (params.categoryId) queryParams.append('categoryId', params.categoryId);

    const response = await api.get(`/admin/services${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  },

  // Get single service by ID
  getById: async (id) => {
    const response = await api.get(`/admin/services/${id}`);
    return response.data;
  },

  // Create new service
  create: async (data) => {
    const response = await api.post('/admin/services', data);
    return response.data;
  },

  // Update service
  update: async (id, data) => {
    const response = await api.put(`/admin/services/${id}`, data);
    return response.data;
  },

  // Delete service
  delete: async (id) => {
    const response = await api.delete(`/admin/services/${id}`);
    return response.data;
  },

  // Upload service image directly to Cloudinary
  uploadImage: async (file, folder = 'services', onProgress) => {
    try {
      const url = await uploadToCloudinary(file, folder, onProgress);
      return {
        success: true,
        imageUrl: url,
        message: 'File uploaded successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to upload file',
        error: error.message
      };
    }
  }
};

/**
 * Home Content API calls
 */
export const homeContentService = {
  // Get home content
  get: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.cityId) queryParams.append('cityId', params.cityId);

    const response = await api.get(`/admin/home-content${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  },

  // Update home content
  update: async (data, params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.cityId) queryParams.append('cityId', params.cityId);

    const response = await api.put(`/admin/home-content${queryParams.toString() ? `?${queryParams.toString()}` : ''}`, data);
    return response.data;
  }
};

/**
 * Public Catalog Service (for user app - no authentication required)
 * Now with caching for faster data retrieval
 */
export const publicCatalogService = {
  // Get all active categories (cached for 5 minutes)
  getCategories: async (params = {}) => {
    // Legacy support for passing cityId directly or null
    const normalizedParams = typeof params === 'string' ? { cityId: params } : (params || {});
    
    const queryParams = new URLSearchParams();
    if (normalizedParams.stateId) queryParams.append('stateId', normalizedParams.stateId);
    if (normalizedParams.districtId) queryParams.append('districtId', normalizedParams.districtId);
    if (normalizedParams.subDistrictId) queryParams.append('subDistrictId', normalizedParams.subDistrictId);
    if (normalizedParams.cityId) queryParams.append('cityId', normalizedParams.cityId);
    if (normalizedParams.type) queryParams.append('type', normalizedParams.type);
    if (normalizedParams.showOnHome !== undefined) queryParams.append('showOnHome', normalizedParams.showOnHome);
    if (normalizedParams.all !== undefined) queryParams.append('all', normalizedParams.all);
    
    const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const response = await api.get(`/public/categories${queryStr}`);
    return response.data;
  },

  // Get all active brands (formerly services)
  getBrands: async (params = {}) => {
    const normalizedParams = typeof params === 'string' ? { categoryId: params } : (params || {});
    const queryParams = new URLSearchParams();
    if (normalizedParams.categoryId) queryParams.append('categoryId', normalizedParams.categoryId);
    if (normalizedParams.categorySlug) queryParams.append('categorySlug', normalizedParams.categorySlug);
    if (normalizedParams.search) queryParams.append('search', normalizedParams.search);
    if (normalizedParams.stateId) queryParams.append('stateId', normalizedParams.stateId);
    if (normalizedParams.districtId) queryParams.append('districtId', normalizedParams.districtId);
    if (normalizedParams.subDistrictId) queryParams.append('subDistrictId', normalizedParams.subDistrictId);
    if (normalizedParams.cityId) queryParams.append('cityId', normalizedParams.cityId);

    const cacheKey = `public:brands:${queryParams.toString()}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return cached;

    const response = await api.get(`/public/brands${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    if (response.data.success) {
      apiCache.set(cacheKey, response.data, 120); // 2 minutes
    }
    return response.data;
  },

  // Alias for backward compatibility if needed, but preferable to use getBrands
  getServices: async (params = {}) => {
    const normalizedParams = params || {};
    // New Service model endpoint
    const queryParams = new URLSearchParams();
    if (normalizedParams.brandId) queryParams.append('brandId', normalizedParams.brandId);
    if (normalizedParams.brandSlug) queryParams.append('brandSlug', normalizedParams.brandSlug);
    if (normalizedParams.categoryId) queryParams.append('categoryId', normalizedParams.categoryId);
    if (normalizedParams.parentSourceId) queryParams.append('parentSourceId', normalizedParams.parentSourceId);
    if (normalizedParams.pricing_context) queryParams.append('pricing_context', normalizedParams.pricing_context);
    if (normalizedParams.stateId) queryParams.append('stateId', normalizedParams.stateId);
    if (normalizedParams.districtId) queryParams.append('districtId', normalizedParams.districtId);
    if (normalizedParams.search) queryParams.append('search', normalizedParams.search);

    const cacheKey = `public:services:${queryParams.toString()}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return cached;

    const response = await api.get(`/public/services${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    if (response.data.success) {
      apiCache.set(cacheKey, response.data, 120);
    }
    return response.data;
  },

  // Get brand by slug (cached for 1 minute)
  getBrandBySlug: async (slug, cityId) => {
    const cacheKey = `public:brand:${slug}:${cityId || 'default'}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return cached;

    const query = cityId ? `?cityId=${cityId}` : '';
    const response = await api.get(`/public/brands/slug/${slug}${query}`);
    if (response.data.success) {
      apiCache.set(cacheKey, response.data, 60); // 1 minute
    }
    return response.data;
  },

  // Get home content (cached for 2 minutes)
  getHomeContent: async (params = {}) => {
    const normalizedParams = typeof params === 'string' ? { cityId: params } : (params || {});
    const queryParams = new URLSearchParams();
    if (normalizedParams.stateId) queryParams.append('stateId', normalizedParams.stateId);
    if (normalizedParams.districtId) queryParams.append('districtId', normalizedParams.districtId);
    if (normalizedParams.cityId) queryParams.append('cityId', normalizedParams.cityId);

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const cacheKey = `public:homeContent:${queryParams.toString() || 'default'}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return cached;

    const response = await api.get(`/public/home-content${query}`);
    if (response.data.success) {
      apiCache.set(cacheKey, response.data, 120); // 2 minutes
    }
    return response.data;
  },

  // Invalidate all public caches (useful after admin updates)
  invalidateCache: () => {
    apiCache.invalidatePrefix('public:');
  }
};

import axios from 'axios';
import { apiCache } from '../utils/apiCache';
import authStorage, { normalizeRole, getCurrentPortalRole } from '../utils/authStorage';

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true // For cookies
});

/**
 * Determine the canonical role for an API request based on endpoint and current portal
 * @param {string} url 
 * @returns {'user' | 'worker' | 'vendor' | 'admin'}
 */
export const getRoleForRequest = (url, config = null) => {
  // 1. Explicit role override in config
  if (config?.role) {
    return normalizeRole(config.role);
  }
  if (config?.headers?.['X-Auth-Role']) {
    return normalizeRole(config.headers['X-Auth-Role']);
  }

  // 2. Explicitly detect endpoint prefix
  if (url) {
    if (url.includes('/admin/') || url.startsWith('/admin')) return 'admin';
    if (url.includes('/vendors/') || url.startsWith('/vendors') || url.includes('/vendor/')) return 'vendor';
    if (url.includes('/workers/') || url.startsWith('/workers') || url.includes('/worker/')) return 'worker';
    if (url.includes('/users/') || url.startsWith('/users') || url.includes('/user/')) return 'user';
  }

  // 3. Otherwise prioritize current portal/session role in this browser tab
  return getCurrentPortalRole();
};

// Request interceptor - Add tab-isolated auth token
api.interceptors.request.use(
  (config) => {
    // If uploading FormData, delete Content-Type to let browser/Axios compute boundary dynamically
    if (config.data instanceof FormData) {
      if (config.headers) {
        delete config.headers['Content-Type'];
      }
    }

    const role = getRoleForRequest(config.url, config);
    const token = authStorage.getAccessToken(role);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Track if we're currently refreshing
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor - Handle role-scoped token refresh
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Check if the request is an authentication/login endpoint
    const reqUrl = (originalRequest?.url || '').toLowerCase();
    const isAuthRequest = [
      '/auth/login',
      '/auth/login-mpin',
      '/auth/login-with-mpin',
      '/auth/verify-login',
      '/auth/send-otp',
      '/auth/verify-otp',
      '/auth/register',
      '/auth/refresh-token',
      '/auth/set-mpin',
      '/auth/reset-mpin',
      '/auth/forgot-mpin',
      '/auth/mpin-status',
      '/app/identify-role'
    ].some(pattern => reqUrl.includes(pattern));

    // If an auth or login request returned 401 (e.g. wrong credentials/MPIN),
    // NEVER attempt token refresh or trigger logout/redirect. Let the login form catch block handle it gracefully!
    if (isAuthRequest) {
      return Promise.reject(error);
    }

    const currentPath = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';
    const isOnLoginPage = currentPath.includes('/login') || currentPath.includes('/app') || currentPath.includes('/signup');

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      const role = getRoleForRequest(originalRequest.url);

      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch(err => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = authStorage.getRefreshToken(role);

      if (!refreshToken) {
        // No refresh token in tab session, logout this role only if not already on login/auth page
        isRefreshing = false;
        if (!isOnLoginPage) {
          handleLogout(role);
        }
        return Promise.reject(error);
      }

      try {
        // Determine correct refresh endpoint based on role
        let refreshEndpoint = '/users/auth/refresh-token';
        if (role === 'vendor') refreshEndpoint = '/vendors/auth/refresh-token';
        else if (role === 'worker') refreshEndpoint = '/workers/auth/refresh-token';
        else if (role === 'admin') refreshEndpoint = '/admin/auth/refresh-token';

        // Try to refresh the token
        const response = await axios.post(`${API_BASE_URL}${refreshEndpoint}`, {
          refreshToken
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data;

        // Save new access token into current tab's role session
        const currentSession = authStorage.getAuthSession(role) || { role };
        authStorage.setAuthSession(role, {
          ...currentSession,
          accessToken,
          refreshToken: newRefreshToken || refreshToken
        });

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        // Process queued requests
        processQueue(null, accessToken);
        isRefreshing = false;

        // Retry original request
        return api(originalRequest);
      } catch (refreshError) {
        console.error(`[API] RefreshToken failed for ${role}:`, refreshError);
        processQueue(refreshError, null);
        isRefreshing = false;
        if (!isOnLoginPage) {
          handleLogout(role);
        }
        return Promise.reject(refreshError);
      }
    }

    // Handle 403 Forbidden - Role mismatch or Invalid Token
    if (error.response?.status === 403) {
      console.error('Access Denied (403):', error.response.data?.message);
    }

    return Promise.reject(error);
  }
);

// Handle role-specific tab logout
export const handleLogout = (role = null) => {
  const targetRole = role ? normalizeRole(role) : getCurrentPortalRole();

  // Clear this specific role session from the tab
  authStorage.clearAuthSession(targetRole);

  // If already on a login/auth page, DO NOT reload or redirect via window.location.href!
  const currentPath = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';
  if (currentPath.includes('/login') || currentPath.includes('/app') || currentPath.includes('/signup')) {
    return;
  }

  // Navigate to portal login without affecting other tabs
  if (targetRole === 'vendor') {
    window.location.href = '/vendor/login';
  } else if (targetRole === 'worker') {
    window.location.href = '/worker/login';
  } else if (targetRole === 'admin') {
    window.location.href = '/admin/login';
  } else {
    window.location.href = '/user/login';
  }
};

export { apiCache };
export default api;


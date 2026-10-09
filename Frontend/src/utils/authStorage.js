/**
 * Centralized Tab-Isolated Authentication Storage Utility
 * AgroYilt Production Session Isolation Architecture
 * 
 * Provides strict tab isolation using sessionStorage to allow concurrent,
 * independent sessions across tabs (e.g. /user in Tab 1, /worker in Tab 2,
 * /vendor in Tab 3, /admin in Tab 4) without cross-role session leakage.
 */

// Canonical session keys per role in sessionStorage
export const AUTH_KEYS = {
  user: 'agroyilt_auth_user',
  worker: 'agroyilt_auth_worker',
  vendor: 'agroyilt_auth_vendor',
  admin: 'agroyilt_auth_admin'
};

// Legacy/Compatibility key maps
const COMPAT_KEYS = {
  user: {
    access: 'accessToken',
    refresh: 'refreshToken',
    data: 'userData'
  },
  worker: {
    access: 'workerAccessToken',
    refresh: 'workerRefreshToken',
    data: 'workerData'
  },
  vendor: {
    access: 'vendorAccessToken',
    refresh: 'vendorRefreshToken',
    data: 'vendorData'
  },
  admin: {
    access: 'adminAccessToken',
    refresh: 'adminRefreshToken',
    data: 'adminData'
  }
};

/**
 * Normalizes input role string to lowercase canonical role
 * @param {string} role 
 * @returns {'user' | 'worker' | 'vendor' | 'admin'}
 */
export const normalizeRole = (role) => {
  if (!role) return 'user';
  const lower = String(role).toLowerCase();
  if (lower === 'farmer') return 'user';
  if (lower.includes('worker')) return 'worker';
  if (lower.includes('vendor')) return 'vendor';
  if (lower.includes('admin')) return 'admin';
  return 'user';
};

/**
 * Detects current portal role from window.location.pathname or active session
 * @returns {'user' | 'worker' | 'vendor' | 'admin'}
 */
export const getCurrentPortalRole = () => {
  if (typeof window === 'undefined') return 'user';
  const path = window.location.pathname;
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/vendor')) return 'vendor';
  if (path.startsWith('/worker')) return 'worker';
  if (path.startsWith('/user')) return 'user';

  // When on common routes (e.g. /app, /, modals): detect active session across storage
  try {
    const roles = ['user', 'worker', 'vendor', 'admin'];
    for (const r of roles) {
      const sKey = AUTH_KEYS[r];
      const cKey = COMPAT_KEYS[r]?.access;
      if (
        sessionStorage.getItem(sKey) ||
        localStorage.getItem(sKey) ||
        (cKey && (sessionStorage.getItem(cKey) || localStorage.getItem(cKey)))
      ) {
        return r;
      }
    }
  } catch (e) {}

  return 'user';
};

/**
 * Decode JWT payload safely without throwing
 * @param {string} token 
 * @returns {object|null}
 */
export const decodeToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

/**
 * Checks if a JWT token is structurally valid and unexpired
 * @param {string} token 
 * @returns {boolean}
 */
export const isTokenValid = (token) => {
  if (!token || typeof token !== 'string') return false;
  const decoded = decodeToken(token);
  if (!decoded) return false;
  if (decoded.exp) {
    const currentTime = Date.now() / 1000;
    return decoded.exp > currentTime;
  }
  return true;
};

/**
 * Get structured authentication session for a role.
 * Checks sessionStorage first, then falls back to persistent localStorage
 * (which survives WebView restarts, app termination, and process recreation).
 * Rehydrates sessionStorage when restored from localStorage.
 * 
 * @param {'user' | 'worker' | 'vendor' | 'admin'} role 
 * @returns {object|null}
 */
export const getAuthSession = (role) => {
  if (typeof window === 'undefined') return null;
  const canonicalRole = normalizeRole(role);
  const sessionKey = AUTH_KEYS[canonicalRole];
  const compat = COMPAT_KEYS[canonicalRole];

  try {
    // 1. Check current tab's structured session in sessionStorage
    let raw = sessionStorage.getItem(sessionKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.accessToken) {
          if (isTokenValid(parsed.accessToken)) {
            return parsed;
          } else {
            // Expired in sessionStorage - clean up
            clearAuthSession(canonicalRole);
            return null;
          }
        }
      } catch (e) {}
    }

    // 2. Check persistent localStorage (survives app restart / process kill in WebView)
    let localRaw = localStorage.getItem(sessionKey);
    if (localRaw) {
      try {
        const parsed = JSON.parse(localRaw);
        if (parsed && parsed.accessToken) {
          if (isTokenValid(parsed.accessToken)) {
            // Rehydrate sessionStorage for fast in-tab access
            try {
              sessionStorage.setItem(sessionKey, localRaw);
              if (parsed.accessToken) sessionStorage.setItem(compat.access, parsed.accessToken);
              if (parsed.refreshToken) sessionStorage.setItem(compat.refresh, parsed.refreshToken);
              if (parsed.user) sessionStorage.setItem(compat.data, JSON.stringify(parsed.user));
            } catch (e) {}
            return parsed;
          } else {
            // Stale/expired token in localStorage - clean up
            clearAuthSession(canonicalRole);
            return null;
          }
        }
      } catch (e) {}
    }

    // 3. Fallback: check compat keys in sessionStorage
    const access = sessionStorage.getItem(compat.access);
    if (access) {
      if (isTokenValid(access)) {
        const refresh = sessionStorage.getItem(compat.refresh);
        let userData = {};
        try {
          userData = JSON.parse(sessionStorage.getItem(compat.data) || '{}');
        } catch {}
        const reconstructed = {
          accessToken: access,
          refreshToken: refresh || null,
          user: userData || {},
          role: canonicalRole
        };
        const recStr = JSON.stringify(reconstructed);
        try {
          sessionStorage.setItem(sessionKey, recStr);
          localStorage.setItem(sessionKey, recStr);
        } catch (e) {}
        return reconstructed;
      } else {
        clearAuthSession(canonicalRole);
        return null;
      }
    }

    // 4. Fallback: check compat keys in localStorage
    const localAccess = localStorage.getItem(compat.access);
    if (localAccess) {
      if (isTokenValid(localAccess)) {
        const refresh = localStorage.getItem(compat.refresh);
        let userData = {};
        try {
          userData = JSON.parse(localStorage.getItem(compat.data) || '{}');
        } catch {}
        const reconstructed = {
          accessToken: localAccess,
          refreshToken: refresh || null,
          user: userData || {},
          role: canonicalRole
        };
        const recStr = JSON.stringify(reconstructed);
        try {
          sessionStorage.setItem(sessionKey, recStr);
          localStorage.setItem(sessionKey, recStr);
          if (localAccess) sessionStorage.setItem(compat.access, localAccess);
          if (refresh) sessionStorage.setItem(compat.refresh, refresh);
          sessionStorage.setItem(compat.data, JSON.stringify(userData));
        } catch (e) {}
        return reconstructed;
      } else {
        clearAuthSession(canonicalRole);
        return null;
      }
    }

    // 5. Fallback: Check persistent cookie (managed by WebView CookieManager)
    try {
      const cookieMatch = document.cookie.match(/(?:^|;\s*)accessToken=([^;]+)/);
      const cookieRoleMatch = document.cookie.match(/(?:^|;\s*)agroyilt_role=([^;]+)/);
      if (cookieMatch) {
        const cookieRole = cookieRoleMatch ? normalizeRole(cookieRoleMatch[1]) : canonicalRole;
        if (cookieRole === canonicalRole) {
          const cookieToken = decodeURIComponent(cookieMatch[1]);
          if (isTokenValid(cookieToken)) {
            const reconstructed = {
              accessToken: cookieToken,
              refreshToken: null,
              user: {},
              role: canonicalRole
            };
            const recStr = JSON.stringify(reconstructed);
            try {
              sessionStorage.setItem(sessionKey, recStr);
              localStorage.setItem(sessionKey, recStr);
            } catch (e) {}
            return reconstructed;
          }
        }
      }
    } catch (e) {}

  } catch (err) {
    console.error(`[authStorage] Error reading session for ${canonicalRole}:`, err);
  }

  return null;
};

/**
 * Set structured authentication session for a role.
 * Writes to both sessionStorage (tab memory) and localStorage (persistent WebView storage).
 * Also writes an authenticated cookie for WebView CookieManager persistence.
 * 
 * @param {'user' | 'worker' | 'vendor' | 'admin'} role 
 * @param {object} sessionData - { accessToken, refreshToken, user, vendor, worker, admin, role }
 */
export const setAuthSession = (role, sessionData) => {
  if (typeof window === 'undefined' || !sessionData) return;
  const canonicalRole = normalizeRole(role || sessionData.role);
  const sessionKey = AUTH_KEYS[canonicalRole];
  const compat = COMPAT_KEYS[canonicalRole];

  const accessToken = sessionData.accessToken;
  const refreshToken = sessionData.refreshToken || null;
  const profile = sessionData.user || sessionData.vendor || sessionData.worker || sessionData.admin || {};

  const structuredSession = {
    accessToken,
    refreshToken,
    user: profile,
    role: canonicalRole,
    updatedAt: Date.now()
  };

  try {
    const sessionStr = JSON.stringify(structuredSession);
    const profileStr = JSON.stringify(profile);

    // 1. Write to sessionStorage (current tab memory)
    try {
      sessionStorage.setItem(sessionKey, sessionStr);
      if (accessToken) sessionStorage.setItem(compat.access, accessToken);
      if (refreshToken) sessionStorage.setItem(compat.refresh, refreshToken);
      if (profile) sessionStorage.setItem(compat.data, profileStr);
    } catch (e) {
      console.warn('[authStorage] Failed to write sessionStorage:', e);
    }

    // 2. Write to localStorage (persistent across WebView restarts, app kills, and phone reboots)
    try {
      localStorage.setItem(sessionKey, sessionStr);
      if (accessToken) localStorage.setItem(compat.access, accessToken);
      if (refreshToken) localStorage.setItem(compat.refresh, refreshToken);
      if (profile) localStorage.setItem(compat.data, profileStr);
    } catch (e) {
      console.warn('[authStorage] Failed to write localStorage:', e);
    }

    // 3. Write persistent cookie for native WebView CookieManager sync (7 days)
    try {
      if (accessToken) {
        document.cookie = `accessToken=${encodeURIComponent(accessToken)}; path=/; max-age=604800; SameSite=Lax`;
        document.cookie = `agroyilt_role=${canonicalRole}; path=/; max-age=604800; SameSite=Lax`;
      }
    } catch (e) {}

  } catch (err) {
    console.error(`[authStorage] Error saving session for ${canonicalRole}:`, err);
  }
};

/**
 * Clear authentication session for a specific role across all storage mechanisms:
 * sessionStorage, localStorage, and persistent cookies.
 * Also notifies Flutter WebView container if running inside WebView.
 * 
 * @param {'user' | 'worker' | 'vendor' | 'admin'} role 
 */
export const clearAuthSession = (role) => {
  if (typeof window === 'undefined') return;
  const canonicalRole = normalizeRole(role);
  const sessionKey = AUTH_KEYS[canonicalRole];
  const compat = COMPAT_KEYS[canonicalRole];

  try {
    // 1. Remove from sessionStorage
    try {
      sessionStorage.removeItem(sessionKey);
      sessionStorage.removeItem(compat.access);
      sessionStorage.removeItem(compat.refresh);
      sessionStorage.removeItem(compat.data);
    } catch (e) {}

    // 2. Remove from localStorage
    try {
      localStorage.removeItem(sessionKey);
      localStorage.removeItem(compat.access);
      localStorage.removeItem(compat.refresh);
      localStorage.removeItem(compat.data);
    } catch (e) {}

    // 3. Expire persistent cookies
    try {
      document.cookie = 'accessToken=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      document.cookie = 'agroyilt_role=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    } catch (e) {}

    // 4. Notify Flutter WebView container of explicit logout
    try {
      if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
        window.flutter_inappwebview.callHandler('onWebLogout', JSON.stringify({ role: canonicalRole }));
      }
    } catch (e) {}

  } catch (err) {
    console.error(`[authStorage] Error clearing session for ${canonicalRole}:`, err);
  }
};


/**
 * Get access token for a role (or current portal role if not specified)
 * @param {'user' | 'worker' | 'vendor' | 'admin'} [role] 
 * @returns {string|null}
 */
export const getAccessToken = (role) => {
  const targetRole = role ? normalizeRole(role) : getCurrentPortalRole();
  const session = getAuthSession(targetRole);
  return session?.accessToken || null;
};

/**
 * Get refresh token for a role
 * @param {'user' | 'worker' | 'vendor' | 'admin'} [role] 
 * @returns {string|null}
 */
export const getRefreshToken = (role) => {
  const targetRole = role ? normalizeRole(role) : getCurrentPortalRole();
  const session = getAuthSession(targetRole);
  return session?.refreshToken || null;
};

/**
 * Get user profile object for a role
 * @param {'user' | 'worker' | 'vendor' | 'admin'} [role] 
 * @returns {object|null}
 */
export const getUserData = (role) => {
  const targetRole = role ? normalizeRole(role) : getCurrentPortalRole();
  const session = getAuthSession(targetRole);
  return session?.user || null;
};

/**
 * Get user profile object for a role (alias for getUserData)
 * @param {'user' | 'worker' | 'vendor' | 'admin'} [role] 
 * @returns {object|null}
 */
export const getUser = (role) => {
  return getUserData(role);
};

/**
 * Update user profile in session without overwriting tokens
 * @param {'user' | 'worker' | 'vendor' | 'admin'} role 
 * @param {object} updatedProfile 
 */
export const updateUserData = (role, updatedProfile) => {
  if (!updatedProfile) return;
  const canonicalRole = normalizeRole(role);
  const current = getAuthSession(canonicalRole) || { role: canonicalRole };
  const mergedUser = {
    ...(current.user || {}),
    ...updatedProfile
  };

  setAuthSession(canonicalRole, {
    ...current,
    user: mergedUser
  });
};

/**
 * Checks if a role is authenticated in the current tab with a valid token
 * @param {'user' | 'worker' | 'vendor' | 'admin'} role 
 * @returns {boolean}
 */
export const isAuthenticated = (role) => {
  const canonicalRole = normalizeRole(role);
  const session = getAuthSession(canonicalRole);
  if (!session || !session.accessToken) return false;

  const valid = isTokenValid(session.accessToken);
  if (!valid) {
    // Session token is expired - clear this role's session
    clearAuthSession(canonicalRole);
    return false;
  }
  return true;
};

/**
 * Checks if ANY role is currently authenticated in this specific browser tab.
 * Returns the authenticated role name, or null.
 * @returns {'user' | 'worker' | 'vendor' | 'admin' | null}
 */
export const isAnyAuthenticated = () => {
  const currentRole = getCurrentPortalRole();
  if (isAuthenticated(currentRole)) return currentRole;

  const allRoles = ['user', 'worker', 'vendor', 'admin'];
  for (const r of allRoles) {
    if (r !== currentRole && isAuthenticated(r)) {
      return r;
    }
  }
  return null;
};

export default {
  AUTH_KEYS,
  normalizeRole,
  getCurrentPortalRole,
  decodeToken,
  isTokenValid,
  getAuthSession,
  setAuthSession,
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  getUserData,
  getUser,
  updateUserData,
  isAuthenticated,
  isAnyAuthenticated
};

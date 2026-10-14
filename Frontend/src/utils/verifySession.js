import api from '../services/api';
import authStorage from './authStorage';

const PROFILE_ENDPOINTS = {
  user: '/users/profile',
  vendor: '/vendors/profile',
  worker: '/workers/profile'
};

/**
 * Ask the server whether the stored login for `role` is still good.
 * A token that has not expired is not enough: the account may have been deleted,
 * suspended, or the token may have been issued by a different backend.
 * Network failures keep the session so an offline app still opens.
 * @returns {Promise<boolean>} true if the session may be used
 */
export const verifySession = async (role) => {
  if (!authStorage.isAuthenticated(role)) return false;
  try {
    await api.get(PROFILE_ENDPOINTS[role]);
    return true;
  } catch (error) {
    const status = error.response?.status;
    if (status === 401 || status === 403 || status === 404) {
      authStorage.clearAuthSession(role);
      return false;
    }
    return true;
  }
};

/** First role with a server-verified login, or null. */
export const findVerifiedRole = async () => {
  for (const role of ['user', 'vendor', 'worker']) {
    if (await verifySession(role)) return role;
  }
  return null;
};

// One server check per login token per page load, so guarded routes don't re-ask on every navigation
const checkedTokens = new Map();

export const verifySessionOnce = (role) => {
  const endpoint = PROFILE_ENDPOINTS[role];
  if (!endpoint) return Promise.resolve(true);
  const token = authStorage.getAccessToken(role);
  if (!token) return Promise.resolve(false);
  if (!checkedTokens.has(token)) {
    checkedTokens.set(token, verifySession(role));
  }
  return checkedTokens.get(token);
};

import api from './api';
import authStorage from '../utils/authStorage';

const SAVE_BY_ROLE = {
  user: (code) => api.put('/users/profile', { settings: { language: code } }),
  vendor: (code) => api.put('/vendors/settings', { language: code }),
  worker: (code) => api.put('/workers/profile', { settings: { language: code } })
};

/**
 * Save the chosen language on the signed-in profile, so notifications use it too and a
 * settings screen does not switch the app back to an older choice.
 */
export const saveLanguagePreference = (code) => {
  const role = authStorage.getCurrentPortalRole();
  if (!SAVE_BY_ROLE[role] || !authStorage.isAuthenticated(role)) return;
  SAVE_BY_ROLE[role](code).catch((err) => console.warn('Could not save language preference:', err?.message));
};

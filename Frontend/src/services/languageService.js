import api from './api';

/**
 * Frontend Language Service
 * Handles fetching active languages for Users & Workers,
 * and Admin language management.
 */

// Fallback defaults in case backend is loading or offline
const cachedDefaultCode = typeof localStorage !== 'undefined' ? localStorage.getItem('systemDefaultLanguageCode') : null;

export const FALLBACK_LANGUAGES = {
  English: {
    label: 'English',
    name: 'English',
    code: 'en',
    nativeName: 'English',
    flag: '🇬🇧',
    isDefault: cachedDefaultCode ? cachedDefaultCode === 'en' : true,
    isActive: true
  },
  Hindi: {
    label: 'Hindi',
    name: 'Hindi',
    code: 'hi',
    nativeName: 'हिन्दी',
    flag: '🇮🇳',
    isDefault: cachedDefaultCode === 'hi',
    isActive: true
  }
};

/**
 * Get active languages for Worker & User apps
 */
export const getActiveLanguages = async () => {
  try {
    const res = await api.get('/public/languages');
    if (res.data?.success && Array.isArray(res.data.languages)) {
      return res.data.languages;
    }
    return Object.values(FALLBACK_LANGUAGES);
  } catch (error) {
    console.warn('Could not fetch active languages from backend, using fallback:', error.message);
    return Object.values(FALLBACK_LANGUAGES);
  }
};

/**
 * Admin: Get all languages (active and inactive)
 */
export const getAdminLanguages = async () => {
  const res = await api.get('/admin/languages');
  return res.data;
};

/**
 * Admin: Toggle language active status
 */
export const toggleLanguageStatus = async (id, isActive) => {
  const res = await api.patch(`/admin/languages/${id}/toggle`, { isActive });
  return res.data;
};

/**
 * Admin: Set default language
 */
export const setDefaultLanguage = async (id) => {
  const res = await api.patch(`/admin/languages/${id}/default`);
  return res.data;
};

/**
 * Admin: Add new custom language
 */
export const addLanguage = async (languageData) => {
  const res = await api.post('/admin/languages', languageData);
  return res.data;
};

/**
 * Admin: Delete a custom language
 */
export const deleteLanguage = async (id) => {
  const res = await api.delete(`/admin/languages/${id}`);
  return res.data;
};

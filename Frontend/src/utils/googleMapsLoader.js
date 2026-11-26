// One script id and one library list for every screen. @react-google-maps/api throws
// "Loader must not be called again with different options" if two screens ask for different ones.
export const GOOGLE_MAPS_LOADER_ID = 'google-map-script';
export const GOOGLE_MAPS_LIBRARIES = ['places', 'geometry', 'drawing'];

/**
 * Get current language for Google Maps localization
 * Matches user's chosen language ('en', 'hi', etc.)
 */
export const getGoogleMapsLanguage = () => {
  if (typeof localStorage !== 'undefined') {
    const hasExplicit = localStorage.getItem('userLanguageExplicit') === 'true';
    if (hasExplicit) {
      return localStorage.getItem('userLanguageCode') || 'en';
    }
    return localStorage.getItem('userLanguageCode') || localStorage.getItem('systemDefaultLanguageCode') || 'en';
  }
  return 'en';
};

let loaderLanguage = null;

/**
 * Map language for the script loader. Fixed at first use: the loader refuses a different
 * value later, so a language change reaches the map labels when the app is reopened.
 */
export const getGoogleMapsLoaderLanguage = () => {
  if (!loaderLanguage) {
    const isAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
    loaderLanguage = isAdmin ? 'en' : getGoogleMapsLanguage();
  }
  return loaderLanguage;
};

/**
 * Common loader options for Google Maps API
 */
export const getGoogleMapsLoaderOptions = () => ({
  id: GOOGLE_MAPS_LOADER_ID,
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  libraries: GOOGLE_MAPS_LIBRARIES,
  language: getGoogleMapsLoaderLanguage()
});

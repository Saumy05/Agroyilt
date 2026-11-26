/**
 * Language Utilities
 * Handles normalization and mapping of language codes for AgroYilt
 */

export const languageCodeMap = {
  // Official Indian languages
  'English': 'en',
  'Hindi': 'hi',
  'Marathi': 'mr',
  'Gujarati': 'gu',
  'Punjabi': 'pa',
  'Tamil': 'ta',
  'Telugu': 'te',
  'Kannada': 'kn',
  'Malayalam': 'ml',
  'Bengali': 'bn',
  'Odia': 'or',
  'Oriya': 'or',
  'Assamese': 'as',
  'Urdu': 'ur',
  'Sanskrit': 'sa',
  'Bhojpuri': 'bho',
  'Maithili': 'mai',
  'Santali': 'sat',
  'Kashmiri': 'ks',
  'Nepali': 'ne',
  'Konkani': 'kok',
  'Sindhi': 'sd',
  'Dogri': 'doi',
  'Manipuri': 'mni',
  'Bodo': 'brx'
};

export const rtlLanguages = ["ar", "he", "ur", "fa"];

/**
 * Normalizes language codes for API and Google Cloud Translate use.
 * Accepts code (e.g. 'hi'), full name (e.g. 'Hindi'), or language object { code, name }.
 * @param {string|object} lang
 * @returns {string} - Two/three-letter ISO 639 code (e.g. 'hi')
 */
export const normalizeLanguageCode = (lang) => {
  if (!lang) return 'en';

  // If passed an object with a code property
  if (typeof lang === 'object' && lang.code) {
    return lang.code.toLowerCase().trim();
  }

  if (typeof lang !== 'string') return 'en';

  const clean = lang.trim();

  // If already a short ISO code (2 or 3 letters lowercase)
  if (/^[a-z]{2,3}$/i.test(clean) && !languageCodeMap[clean]) {
    return clean.toLowerCase();
  }

  // Exact match in map (e.g. 'Hindi' -> 'hi')
  if (languageCodeMap[clean]) {
    return languageCodeMap[clean];
  }

  // Case-insensitive match in map
  const match = Object.keys(languageCodeMap).find(
    k => k.toLowerCase() === clean.toLowerCase()
  );
  if (match) return languageCodeMap[match];

  // If it's already a code like 'hi', 'en', 'mr'
  return clean.toLowerCase();
};

/**
 * Checks if a language is RTL (Right-to-Left)
 */
export const isRTLLanguage = (lang) => {
  const normalized = normalizeLanguageCode(lang);
  return rtlLanguages.includes(normalized);
};

/**
 * Returns the Intl locale string matching the active app language (e.g. 'hi-IN', 'mr-IN', 'en-IN').
 */
export const getAppLocale = () => {
  if (typeof localStorage === 'undefined') return 'en-IN';
  const code = localStorage.getItem('userLanguageCode') || localStorage.getItem('systemDefaultLanguageCode') || 'en';
  return code === 'en' ? 'en-IN' : `${code}-IN`;
};

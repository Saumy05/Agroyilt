const { TranslationServiceClient } = require('@google-cloud/translate');

/**
 * Google Cloud Translate Client Configuration
 * Uses API Key from environment variables (falls back to GOOGLE_MAPS_API_KEY)
 */
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

const languageCodeMap = {
  'en': 'en',
  'hi': 'hi',
  'mr': 'mr',
  'gu': 'gu',
  'pa': 'pa',
  'ta': 'ta',
  'te': 'te',
  'kn': 'kn',
  'ml': 'ml',
  'bn': 'bn'
};

const rtlLanguages = ["ar", "he", "ur", "fa"];

module.exports = {
  GOOGLE_TRANSLATE_API_KEY,
  languageCodeMap,
  rtlLanguages
};

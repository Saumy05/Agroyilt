/**
 * Translation Service
 * Implements Google Cloud Translate API with 24-hour in-memory cache
 * Batching and Object translation support
 */
const axiosRaw = require('axios');
const axios = axiosRaw.default || axiosRaw;
const { GOOGLE_TRANSLATE_API_KEY, languageCodeMap } = require('../config/googleCloud');

const getApiKey = () => GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

// Simple 24h TTL Cache
const translationCache = new Map();
const TTL = 24 * 60 * 60 * 1000; // 24 Hours

/**
 * Cleanup expired cache entries
 */
const cleanupCache = () => {
    const now = Date.now();
    for (const [key, value] of translationCache.entries()) {
        if (now - value.timestamp > TTL) {
            translationCache.delete(key);
        }
    }
};

// Interval cleanup every hour
setInterval(cleanupCache, 60 * 60 * 1000);

/**
 * Core Translation Function
 */
const translateText = async (text, targetLang, sourceLang = 'en') => {
    if (!text || typeof text !== 'string' || text.trim() === '') return text;
    if (targetLang === sourceLang) return text;

    const cacheKey = `${sourceLang}_${targetLang}_${Buffer.from(text).toString('base64')}`;
    const cached = translationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < TTL)) {
        return cached.translation;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        console.warn('[TranslationService] No API key available for translation');
        return text;
    }

    // Exponential Backoff Retry Logic
    let retries = 0;
    const maxRetries = 3;
    const delays = [1000, 2000, 4000];

    while (retries <= maxRetries) {
        try {
            const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
            const response = await axios.post(url, {
                q: text,
                target: targetLang,
                source: sourceLang,
                format: 'text'
            });

            const translation = response.data.data.translations[0].translatedText;

            // Never cache if translation is the same as original
            if (translation !== text) {
                translationCache.set(cacheKey, {
                    translation,
                    timestamp: Date.now()
                });
            }

            return translation;
        } catch (error) {
            if (error.response?.status === 429) {
                if (retries === maxRetries) throw error;
                await new Promise(resolve => setTimeout(resolve, delays[retries]));
                retries++;
            } else {
                // DETAILED ERROR LOGGING FOR DEBUGGING
                console.error('[TranslationService] Error:', error.message);
                if (error.response?.data) {
                    console.error('[TranslationService] Google API Error Details:', JSON.stringify(error.response.data));
                }
                return text; // Fallback to original text
            }
        }
    }
    return text;
};

/**
 * High-performance Batch Translation
 * Checks cache first, then groups remaining texts into single API requests (chunks of 50)
 */
const translateBatch = async (texts, targetLang, sourceLang = 'en') => {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    if (targetLang === sourceLang) return texts;

    const apiKey = getApiKey();
    if (!apiKey) return texts;

    const uniqueTexts = [...new Set(texts.filter(t => t && typeof t === 'string' && t.trim() !== ''))];
    const translationMap = {};
    const uncached = [];

    for (const text of uniqueTexts) {
        const cacheKey = `${sourceLang}_${targetLang}_${Buffer.from(text).toString('base64')}`;
        const cached = translationCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < TTL)) {
            translationMap[text] = cached.translation;
        } else {
            uncached.push(text);
        }
    }

    // Process uncached texts in chunks of 50 in a single Google Translate API request
    const CHUNK_SIZE = 50;
    for (let i = 0; i < uncached.length; i += CHUNK_SIZE) {
        const chunk = uncached.slice(i, i + CHUNK_SIZE);
        try {
            const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
            const response = await axios.post(url, {
                q: chunk,
                target: targetLang,
                source: sourceLang,
                format: 'text'
            });

            if (response.data?.data?.translations) {
                response.data.data.translations.forEach((item, idx) => {
                    const original = chunk[idx];
                    const trans = item.translatedText;
                    translationMap[original] = trans;
                    if (trans !== original) {
                        const cacheKey = `${sourceLang}_${targetLang}_${Buffer.from(original).toString('base64')}`;
                        translationCache.set(cacheKey, { translation: trans, timestamp: Date.now() });
                    }
                });
            }
        } catch (error) {
            console.error('[TranslationService Batch] Error translating chunk:', error.message);
            // Fallback for this chunk to original texts
            chunk.forEach(t => { translationMap[t] = t; });
        }
    }

    return texts.map(text => translationMap[text] || text);
};

/**
 * Object Property Translation
 */
const translateObject = async (obj, targetLang, sourceLang = 'en', keysToTranslate = []) => {
    if (!obj || typeof obj !== 'object') return obj;

    const result = Array.isArray(obj) ? [...obj] : { ...obj };
    const itemsToTranslate = Array.isArray(obj) ? result : [result];

    for (const item of itemsToTranslate) {
        for (const key of keysToTranslate) {
            if (item[key] && typeof item[key] === 'string') {
                item[key] = await translateText(item[key], targetLang, sourceLang);
            }
        }
    }

    return result;
};

module.exports = {
    translateText,
    translateBatch,
    translateObject
};

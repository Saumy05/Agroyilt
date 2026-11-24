/**
 * Frontend Translation Service
 * Implements instant core dictionary lookups, request batching, caching,
 * and resilient dual-channel translation (Backend Batch -> Direct Google Cloud Translate v2).
 */

import api from './api';
import { getFromCache, saveToCache } from '../utils/translationCache';
import { getFromCoreDictionary } from '../utils/coreDictionary';

// Google Translate API Key for direct client-side fallback
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY || 'AIzaSyC2UW5-Nt9KidxOfBRrZImeBRh9SOMGluo';

// Batching & Queue Management
let requestQueue = [];
let batchTimeout = null;
const BATCH_WAIT_MS = 80; // 80ms debounce window to collect requests

/**
 * Decode HTML character entities returned by Google Translate
 */
const decodeHtmlEntities = (str) => {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x2F;/g, '/');
};

/**
 * Direct Google Cloud Translate REST v2 Call (reliable client-side fallback)
 */
const fetchDirectGoogleTranslate = async (texts, targetLang, sourceLang = 'en') => {
    if (!GOOGLE_API_KEY || !Array.isArray(texts) || texts.length === 0) return {};
    const translationMap = {};
    const CHUNK_SIZE = 50;

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
        const chunk = texts.slice(i, i + CHUNK_SIZE);
        try {
            const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    q: chunk,
                    target: targetLang,
                    source: sourceLang,
                    format: 'text'
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data?.data?.translations) {
                    data.data.translations.forEach((item, idx) => {
                        const original = chunk[idx];
                        translationMap[original] = decodeHtmlEntities(item.translatedText);
                    });
                }
            }
        } catch (err) {
            console.warn('[translationService] Direct Google Translate chunk failed:', err);
        }
    }
    return translationMap;
};

/**
 * Process the current queue of translation requests
 */
const processQueue = async (targetLang, sourceLang = 'en') => {
    if (requestQueue.length === 0) return;

    const currentQueue = [...requestQueue];
    requestQueue = [];

    const texts = currentQueue.map(q => q.text);
    const uniqueTexts = [...new Set(texts)];
    let translationMap = {};
    let backendSuccess = false;

    // 1. Attempt translation via Backend API proxy
    try {
        const res = await api.post('/v1/translate/batch', {
            texts: uniqueTexts,
            targetLang,
            sourceLang
        }, { timeout: 3500 });

        if (res.data?.success && Array.isArray(res.data?.data?.translations)) {
            uniqueTexts.forEach((text, index) => {
                const trans = res.data.data.translations[index];
                if (trans) {
                    translationMap[text] = decodeHtmlEntities(trans);
                }
            });
            backendSuccess = true;
        }
    } catch (err) {
        // Backend unreachable, Vercel SPA rewrite (HTML returned), or timeout -> proceed to direct fallback
    }

    // 2. Resilient Direct Google Cloud Translate Fallback
    const missingTexts = uniqueTexts.filter(t => !translationMap[t] || translationMap[t] === t);
    if ((!backendSuccess || missingTexts.length > 0) && GOOGLE_API_KEY) {
        try {
            const directTranslations = await fetchDirectGoogleTranslate(
                backendSuccess ? missingTexts : uniqueTexts,
                targetLang,
                sourceLang
            );
            translationMap = { ...translationMap, ...directTranslations };
        } catch (directErr) {
            console.error('[translationService] Direct Google fallback error:', directErr);
        }
    }

    // 3. Resolve all promises and persist to cache
    currentQueue.forEach(q => {
        const translation = translationMap[q.text] || q.text;
        if (translation && translation !== q.text) {
            saveToCache(sourceLang, targetLang, q.text, translation);
        }
        q.resolve(translation);
    });
};

/**
 * Core Translation Function
 * Priority: Core Dictionary -> IndexedDB/LocalStorage Cache -> Google Cloud API Batch
 */
export const translateText = (text, targetLang, sourceLang = 'en') => {
    if (!text || typeof text !== 'string' || text.trim() === '') return Promise.resolve(text);
    if (!targetLang || targetLang === sourceLang) return Promise.resolve(text);

    // 1. Instant Core Dictionary Check (0ms latency)
    const instant = getFromCoreDictionary(text, targetLang);
    if (instant) {
        return Promise.resolve(instant);
    }

    // 2. Cache Check (IndexedDB / LocalStorage)
    return getFromCache(sourceLang, targetLang, text).catch(() => null).then((cached) => {
        if (cached) return cached;

        // 3. Queue for Batch Translation
        return new Promise((resolve) => {
            requestQueue.push({ text, resolve });

            // Reset debounce timer
            if (batchTimeout) clearTimeout(batchTimeout);
            batchTimeout = setTimeout(() => {
                processQueue(targetLang, sourceLang);
            }, BATCH_WAIT_MS);
        });
    });
};

/**
 * Translate an array of strings
 */
export const translateBatch = async (texts, targetLang, sourceLang = 'en') => {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    return Promise.all(texts.map(text => translateText(text, targetLang, sourceLang)));
};

/**
 * Translate specific keys in an object
 */
export const translateObject = async (obj, targetLang, sourceLang = 'en', keysToTranslate = []) => {
    if (!obj || typeof obj !== 'object' || targetLang === sourceLang) return obj;

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

/**
 * Frontend Translation Service
 * Implements instant core dictionary lookups, request batching, and caching.
 */

import api from './api';
import { getFromCache, saveToCache } from '../utils/translationCache';
import { getFromCoreDictionary } from '../utils/coreDictionary';

// Batching & Queue Management
let requestQueue = [];
let batchTimeout = null;
const BATCH_WAIT_MS = 80; // 80ms debounce window to collect requests

/**
 * Process the current queue of translation requests
 */
const processQueue = async (targetLang, sourceLang = 'en') => {
    if (requestQueue.length === 0) return;

    const currentQueue = [...requestQueue];
    requestQueue = [];

    const texts = currentQueue.map(q => q.text);
    const uniqueTexts = [...new Set(texts)];

    try {
        const res = await api.post('/v1/translate/batch', {
            texts: uniqueTexts,
            targetLang,
            sourceLang
        });

        if (res.data?.success && Array.isArray(res.data?.data?.translations)) {
            const translationMap = uniqueTexts.reduce((acc, text, index) => {
                acc[text] = res.data.data.translations[index] || text;
                return acc;
            }, {});

            // Resolve all requests in the queue
            currentQueue.forEach(q => {
                const translation = translationMap[q.text] || q.text;
                saveToCache(sourceLang, targetLang, q.text, translation);
                q.resolve(translation);
            });
        } else {
            throw new Error('Batch translation failed or invalid response');
        }
    } catch (err) {
        console.error('Batch translation error:', err?.response?.data || err.message);
        currentQueue.forEach(q => q.resolve(q.text)); // Fallback to original text
    }
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

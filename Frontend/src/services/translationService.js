/**
 * Frontend Translation Service
 * Implements request batching and queuing to minimize API calls.
 */

import axios from 'axios';
import { getFromCache, saveToCache } from '../utils/translationCache';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : '/api');
const TRANSLATE_URL = `${API_BASE_URL}/v1/translate`;

// Batching & Queue Management
let requestQueue = [];
let batchTimeout = null;
const BATCH_WAIT_MS = 100; // 100ms window to collect requests
const MIN_REQUEST_INTERVAL_MS = 200; // Min 200ms between requests

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
        const res = await axios.post(`${TRANSLATE_URL}/batch`, {
            texts: uniqueTexts,
            targetLang,
            sourceLang
        });

        if (res.data.success) {
            const translationMap = uniqueTexts.reduce((acc, text, index) => {
                acc[text] = res.data.data.translations[index];
                return acc;
            }, {});

            // Resolve all requests in the queue
            currentQueue.forEach(q => {
                const translation = translationMap[q.text];
                saveToCache(sourceLang, targetLang, q.text, translation);
                q.resolve(translation);
            });
        } else {
            throw new Error('Batch translation failed');
        }
    } catch (err) {
        console.error('Batch translation error:', err);
        currentQueue.forEach(q => q.resolve(q.text)); // Fallback to original text
    }
};

/**
 * Core Translation Function
 */
export const translateText = (text, targetLang, sourceLang = 'en') => {
    if (!text || text.trim() === '') return Promise.resolve(text);
    if (targetLang === sourceLang) return Promise.resolve(text);

    // A cache failure must never block the translation itself
    return getFromCache(sourceLang, targetLang, text).catch(() => null).then((cached) => {
        if (cached) return cached;

        return new Promise((resolve) => {
            // Add to batching queue
            requestQueue.push({ text, resolve });

            // Wait for other requests before processing
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

/**
 * Frontend Translation Service
 * Implements instant core dictionary lookups, synchronous memory/localStorage cache,
 * request batching, and resilient dual-channel translation
 * (Backend Batch with circuit breaker -> Direct Google Cloud Translate v2).
 */

import api from './api';
import { getFromCache, getFromCacheSync, saveToCache } from '../utils/translationCache';
import { getFromCoreDictionary } from '../utils/coreDictionary';

// Google Translate API Keys for direct client-side fallback
const FALLBACK_GOOGLE_API_KEY = 'AIzaSyC2UW5-Nt9KidxOfBRrZImeBRh9SOMGluo';
const ENV_GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY;
const GOOGLE_API_KEYS = [...new Set([ENV_GOOGLE_API_KEY, FALLBACK_GOOGLE_API_KEY].filter(Boolean))];

// Batching & Queue Management
let requestQueue = [];
let batchTimeout = null;
const BATCH_WAIT_MS = 80; // 80ms debounce window to collect requests
let backendDownUntil = 0; // Circuit breaker timestamp when backend proxy fails/returns untranslated

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
    if (GOOGLE_API_KEYS.length === 0 || !Array.isArray(texts) || texts.length === 0) return {};
    const translationMap = {};
    const CHUNK_SIZE = 50;

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
        const chunk = texts.slice(i, i + CHUNK_SIZE);
        for (const apiKey of GOOGLE_API_KEYS) {
            try {
                const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
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
                    break; // Chunk succeeded with this key
                } else {
                    console.warn(`[translationService] Direct Google Translate HTTP ${res.status}`);
                }
            } catch (err) {
                console.warn('[translationService] Direct Google Translate chunk failed:', err?.message || err);
            }
        }
    }
    return translationMap;
};

/**
 * Process a single (sourceLang, targetLang) group
 */
const processLangGroup = async (groupQueue, targetLang, sourceLang) => {
    const uniqueTexts = [...new Set(groupQueue.map(q => q.text))];
    let translationMap = {};
    let backendSuccess = false;

    // 1. Attempt translation via Backend API proxy (skip for 60s if recently failed)
    if (Date.now() > backendDownUntil) {
        try {
            const res = await api.post('/v1/translate/batch', {
                texts: uniqueTexts,
                targetLang,
                sourceLang
            }, { timeout: 2500 });

            if (res.data?.success && Array.isArray(res.data?.data?.translations)) {
                let anyTranslated = false;
                uniqueTexts.forEach((text, index) => {
                    const trans = res.data.data.translations[index];
                    if (trans) {
                        const decoded = decodeHtmlEntities(trans);
                        translationMap[text] = decoded;
                        if (decoded !== text) anyTranslated = true;
                    }
                });
                if (anyTranslated || uniqueTexts.length === 0) {
                    backendSuccess = true;
                } else {
                    // Backend returned untranslated text (e.g. missing server API key) -> bypass for 60s
                    backendDownUntil = Date.now() + 60000;
                }
            } else {
                backendDownUntil = Date.now() + 60000;
            }
        } catch {
            // Backend unreachable, Vercel SPA rewrite, or timeout -> bypass for 60s and use direct fallback
            backendDownUntil = Date.now() + 60000;
        }
    }

    // 2. Resilient Direct Google Cloud Translate Fallback
    const missingTexts = uniqueTexts.filter(t => !translationMap[t] || translationMap[t] === t);
    if (!backendSuccess || missingTexts.length > 0) {
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
    groupQueue.forEach(q => {
        const translation = translationMap[q.text] || q.text;
        if (translation && translation !== q.text) {
            saveToCache(sourceLang, targetLang, q.text, translation);
        }
        q.resolve(translation);
    });
};

/**
 * Process the current queue of translation requests, grouped by language pair
 */
const processQueue = async () => {
    if (requestQueue.length === 0) return;

    const currentQueue = [...requestQueue];
    requestQueue = [];
    batchTimeout = null;

    const groups = new Map();
    for (const item of currentQueue) {
        const key = `${item.sourceLang}__${item.targetLang}`;
        if (!groups.has(key)) groups.set(key, { sourceLang: item.sourceLang, targetLang: item.targetLang, items: [] });
        groups.get(key).items.push(item);
    }

    await Promise.all(
        Array.from(groups.values()).map(g => processLangGroup(g.items, g.targetLang, g.sourceLang))
    );
};

/**
 * Core Translation Function
 * Priority: Core Dictionary -> Sync Memory/LocalStorage Cache -> IndexedDB Cache -> Batch API
 */
export const translateText = (text, targetLang, sourceLang = 'en') => {
    if (!text || typeof text !== 'string' || text.trim() === '') return Promise.resolve(text);
    if (!targetLang || targetLang === sourceLang) return Promise.resolve(text);

    // 1. Instant Core Dictionary Check (0ms latency)
    const instant = getFromCoreDictionary(text, targetLang);
    if (instant) {
        return Promise.resolve(instant);
    }

    // 2. Synchronous Cache Check (Memory / localStorage)
    const syncCached = getFromCacheSync(sourceLang, targetLang, text);
    if (syncCached) {
        return Promise.resolve(syncCached);
    }

    // 3. Async IndexedDB Cache Check -> Queue for Batch Translation
    return getFromCache(sourceLang, targetLang, text).catch(() => null).then((cached) => {
        if (cached) return cached;

        return new Promise((resolve) => {
            requestQueue.push({ text, targetLang, sourceLang, resolve });

            if (batchTimeout) clearTimeout(batchTimeout);
            batchTimeout = setTimeout(() => {
                processQueue();
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

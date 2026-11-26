/**
 * Translation Cache System
 * Uses an in-memory Map (0ms), localStorage mirror, and a singleton IndexedDB connection
 * with a timeout so WebViews never block on stalled IndexedDB opens.
 */

const DB_NAME = 'AgroyiltTranslationCache';
const STORE_NAME = 'translations';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 Hours
const IDB_TIMEOUT_MS = 400;

const memoryCache = new Map();
let dbPromise = null;

const makeCacheKey = (sourceLang, targetLang, text) => {
    const snippet = text.length <= 120 ? text : `${text.slice(0, 90)}_${text.length}_${text.slice(-20)}`;
    try {
        return `${sourceLang}_${targetLang}_${btoa(unescape(encodeURIComponent(snippet)))}`;
    } catch {
        return `${sourceLang}_${targetLang}_${snippet}`;
    }
};

const safeParseLocal = (raw) => {
    if (!raw) return null;
    try {
        const item = JSON.parse(raw);
        if (item && typeof item.translation === 'string' && Date.now() - item.timestamp < CACHE_TTL) {
            return item.translation;
        }
    } catch {
        // Ignore corrupted cache entry
    }
    return null;
};

/**
 * Singleton IndexedDB initialization with timeout safety
 */
const initDB = () => {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
        let settled = false;
        const finish = (db) => {
            if (!settled) {
                settled = true;
                resolve(db);
            }
        };

        const timer = setTimeout(() => {
            dbPromise = null;
            finish(null);
        }, IDB_TIMEOUT_MS);

        try {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = (e) => {
                clearTimeout(timer);
                finish(e.target.result);
            };
            request.onerror = () => {
                clearTimeout(timer);
                dbPromise = null;
                finish(null);
            };
            request.onblocked = () => {
                clearTimeout(timer);
                dbPromise = null;
                finish(null);
            };
        } catch {
            clearTimeout(timer);
            dbPromise = null;
            finish(null);
        }
    });

    return dbPromise;
};

/**
 * Synchronous memory / localStorage lookup
 */
export const getFromCacheSync = (sourceLang, targetLang, text) => {
    if (!text) return null;
    const cacheKey = makeCacheKey(sourceLang, targetLang, text);
    const mem = memoryCache.get(cacheKey);
    if (mem && Date.now() - mem.timestamp < CACHE_TTL) {
        return mem.translation;
    }
    if (typeof localStorage !== 'undefined') {
        const localVal = safeParseLocal(localStorage.getItem(`tr_${cacheKey}`));
        if (localVal) {
            memoryCache.set(cacheKey, { translation: localVal, timestamp: Date.now() });
            return localVal;
        }
    }
    return null;
};

/**
 * Get item from cache (Memory -> localStorage -> IndexedDB)
 */
export const getFromCache = async (sourceLang, targetLang, text) => {
    if (!text) return null;
    const syncHit = getFromCacheSync(sourceLang, targetLang, text);
    if (syncHit) return syncHit;

    const cacheKey = makeCacheKey(sourceLang, targetLang, text);
    try {
        const db = await initDB();
        if (!db) return null;

        return await new Promise((resolve) => {
            let done = false;
            const timer = setTimeout(() => {
                if (!done) { done = true; resolve(null); }
            }, IDB_TIMEOUT_MS);

            try {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(cacheKey);

                request.onsuccess = () => {
                    clearTimeout(timer);
                    if (done) return;
                    done = true;
                    const item = request.result;
                    if (item && Date.now() - item.timestamp < CACHE_TTL) {
                        memoryCache.set(cacheKey, item);
                        resolve(item.translation);
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => {
                    clearTimeout(timer);
                    if (!done) { done = true; resolve(null); }
                };
            } catch {
                clearTimeout(timer);
                if (!done) { done = true; resolve(null); }
            }
        });
    } catch {
        return null;
    }
};

/**
 * Save item to cache (Memory + localStorage + IndexedDB)
 */
export const saveToCache = async (sourceLang, targetLang, text, translation) => {
    if (!text || !translation || text === translation) return;
    const cacheKey = makeCacheKey(sourceLang, targetLang, text);
    const item = { translation, timestamp: Date.now() };

    memoryCache.set(cacheKey, item);
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(`tr_${cacheKey}`, JSON.stringify(item));
        }
    } catch {
        // Ignore localStorage quota exceeded
    }

    try {
        const db = await initDB();
        if (!db) return;
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(item, cacheKey);
    } catch {
        // Ignore IDB write error
    }
};

/**
 * Cleanup expired entries
 */
export const cleanupExpiredCache = async () => {
    try {
        const db = await initDB();
        if (db) {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.openCursor();
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (Date.now() - cursor.value.timestamp > CACHE_TTL) {
                        store.delete(cursor.key);
                    }
                    cursor.continue();
                }
            };
        }
    } catch {
        // Ignore IDB cleanup error
    }

    try {
        if (typeof localStorage !== 'undefined') {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith('tr_')) {
                    if (!safeParseLocal(localStorage.getItem(key))) {
                        localStorage.removeItem(key);
                    }
                }
            }
        }
    } catch {
        // Ignore
    }
};

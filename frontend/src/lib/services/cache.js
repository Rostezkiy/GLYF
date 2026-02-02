/* src/lib/services/cache.js - simple in-memory cache with TTL */

const cache = new Map();

/**
 * Set cache entry
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs Time to live in milliseconds (default 5 minutes)
 */
export function setCache(key, value, ttlMs = 5 * 60 * 1000) {
    const expiresAt = Date.now() + ttlMs;
    cache.set(key, { value, expiresAt });
}

/**
 * Get cache entry, returns null if expired or missing
 * @param {string} key
 * @returns {any|null}
 */
export function getCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

/**
 * Remove cache entry
 * @param {string} key
 */
export function deleteCache(key) {
    cache.delete(key);
}

/**
 * Clear all cache
 */
export function clearCache() {
    cache.clear();
}

/**
 * Generate cache key from URL and optional params
 * @param {string} url
 * @param {object} params
 * @returns {string}
 */
export function generateKey(url, params = {}) {
    const sortedParams = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
    return `${url}${sortedParams ? '?' + sortedParams : ''}`;
}

/**
 * Cached fetch wrapper for GET requests
 * @param {string} url
 * @param {object} options fetch options
 * @param {number} ttlMs cache TTL
 * @returns {Promise<any>} parsed JSON response
 */
export async function cachedFetch(url, options = {}, ttlMs = 5 * 60 * 1000) {
    if (options.method && options.method !== 'GET') {
        // Only cache GET requests
        const res = await fetch(url, options);
        return await res.json();
    }
    const key = generateKey(url, options.body ? JSON.parse(options.body) : {});
    const cached = getCache(key);
    if (cached) {
        console.debug('[Cache] Hit', key);
        return cached;
    }
    console.debug('[Cache] Miss', key);
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`Fetch failed: ${res.status}`);
    }
    const data = await res.json();
    setCache(key, data, ttlMs);
    return data;
}
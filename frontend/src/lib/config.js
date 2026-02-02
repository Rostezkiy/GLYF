/* src/lib/config.js - Centralized configuration */

/**
 * API Base URL
 * - Development: http://localhost:8080
 * - Production: https://...
 */
export const API_URL = import.meta.env.PROD 
    ? 'http://localhost:8080' 
    : 'http://localhost:8080';

/**
 * Application version
 */
export const APP_VERSION = '1.0.1';

/**
 * Storage keys for localStorage
 */
export const STORAGE_KEYS = {
    AUTH_TOKEN: 'glyf_auth_token',
    REFRESH_TOKEN: 'glyf_refresh_token',
    USER_DATA: 'glyf_user_data',
    PASSWORD_CACHE: 'glyf_local_pass',
    ENCRYPTED_KEY: 'glyf_enc_key',
    LAST_SYNC: 'last_sync_ts',
    THEME: 'glyf_theme',
    VIEW_MODE: 'glyf_viewMode'
};

/**
 * Sync configuration
 */
export const SYNC_CONFIG = {
    DEBOUNCE_DELAY: 2000, // milliseconds
    POLL_INTERVAL: 30000,  // milliseconds (30 seconds)
    RETRY_ATTEMPTS: 3
};

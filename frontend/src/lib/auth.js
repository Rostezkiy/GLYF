/* src/lib/auth.js */
import { writable, get } from 'svelte/store';
import { deriveKey, loadKeyLocally, clearKeyLocally } from './crypto';
// УБРАЛ СТАТИЧЕСКИЙ ИМПОРТ syncService
import { db } from './db';
import { API_URL, STORAGE_KEYS } from './config';
import { getCache, setCache } from './services/cache';

const TOKEN_KEY = STORAGE_KEYS.AUTH_TOKEN;
const REFRESH_KEY = STORAGE_KEYS.REFRESH_TOKEN;
const USER_KEY = STORAGE_KEYS.USER_DATA;
const PASSWORD_CACHE_KEY = STORAGE_KEYS.PASSWORD_CACHE;

export const user = writable(null);
export const isAuthenticated = writable(false);
export const isLocked = writable(false);

async function initAuth() {
    console.log('[Auth] Initializing...');
    if (typeof localStorage === 'undefined') return;

    const storedUser = localStorage.getItem(USER_KEY);
    const storedToken = localStorage.getItem(TOKEN_KEY);
    
    const savedPassword = sessionStorage.getItem('glyf_password') || localStorage.getItem(PASSWORD_CACHE_KEY);

    if (storedToken && storedUser) {
        user.set(JSON.parse(storedUser));
        isAuthenticated.set(true);

        if (savedPassword) {
            const keyLoaded = await loadKeyLocally(savedPassword);
            
            if (keyLoaded) {
                console.log('[Auth] Key restored automatically.');
                isLocked.set(false);
                sessionStorage.setItem('glyf_password', savedPassword);

                // ДИНАМИЧЕСКИЙ ИМПОРТ
                try {
                    const { syncService } = await import('./services/syncService');
                    if (syncService && syncService.scheduleSync) {
                         syncService.scheduleSync();
                    }
                } catch (e) { console.warn('Sync init delayed', e); }

            } else {
                console.warn('[Auth] Saved password failed to unlock key.');
                isLocked.set(true);
            }
        } else {
            console.warn('[Auth] No password found to unlock key.');
            isLocked.set(true);
        }
    } else {
        isAuthenticated.set(false);
    }
}
initAuth();

export const authService = {
    async login(email, password) {
        localStorage.removeItem('last_sync_ts');

        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password })
        });
        
        if (!res.ok) throw new Error('Неверный логин или пароль');
        
        const data = await res.json();
        
        await deriveKey(password, email);
        
        sessionStorage.setItem('glyf_password', password);
        localStorage.setItem(PASSWORD_CACHE_KEY, password);

        const name = (email && email.includes('@')) ? email.split('@')[0] : 'User';

        const userData = {
            id: data.user_id,
            email,
            name: name,
            storageLimit: data.storageLimit,
            storageUsed: data.storageUsed,
            tier: data.tier || 'free',
            maxFileSize: data.maxFileSize || 0,
            subscriptionExpiresAt: data.subscriptionExpiresAt,
            freeSince: data.freeSince,
            cleanupWarningDate: data.cleanupWarningDate,
            hasSyncAccess: data.hasSyncAccess || false
        };
        
        this.setSession(userData, data.token, data.refreshToken);
        isLocked.set(false);

        const now = new Date().toISOString();
        const isValidDate = (d) => d && !isNaN(new Date(d).getTime());

        await db.transaction('rw', db.notes, db.folders, db.files, async () => {
            await db.notes.toCollection().modify(n => {
                let changed = false;
                if (!isValidDate(n.createdAt)) { n.createdAt = now; changed = true; }
                if (!isValidDate(n.updatedAt)) { n.updatedAt = now; changed = true; }
                if (changed) n.syncStatus = 'dirty';
            });
            await db.folders.toCollection().modify(f => {
                if (!isValidDate(f.updatedAt)) { f.updatedAt = now; f.syncStatus = 'dirty'; }
            });
            await db.files.toCollection().modify(fl => {
                if (!isValidDate(fl.createdAt)) { fl.createdAt = now; fl.syncStatus = 'dirty'; }
            });
        });

        // ДИНАМИЧЕСКИЙ ИМПОРТ
        try {
            const { syncService } = await import('./services/syncService');
            if (syncService && syncService.syncData) syncService.syncData();
        } catch (e) { console.warn('Sync start delayed', e); }
        
        return userData;
    },

    async register(email, password) {
        localStorage.removeItem('last_sync_ts'); 
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password })
        });
        
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt || 'Ошибка регистрации');
        }
        
        return this.login(email, password);
    },

    logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem('last_sync_ts');
        localStorage.removeItem(PASSWORD_CACHE_KEY); 
        
        sessionStorage.removeItem('glyf_password');
        clearKeyLocally();
        
        user.set(null);
        isAuthenticated.set(false);
        isLocked.set(false);
        
        if (typeof window !== 'undefined') window.location.reload();
    },

    setSession(userData, token, refreshToken) {
        localStorage.setItem(TOKEN_KEY, token);
        if (refreshToken) {
            localStorage.setItem(REFRESH_KEY, refreshToken);
        }
        localStorage.setItem(USER_KEY, JSON.stringify(userData));
        user.set(userData);
        isAuthenticated.set(true);
    },

    getToken() {
        return localStorage.getItem(TOKEN_KEY);
    },

    getRefreshToken() {
        return localStorage.getItem(REFRESH_KEY);
    },

    async refreshSession() {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) throw new Error("No refresh token");

        const res = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ refreshToken })
        });

        if (!res.ok) {
            this.logout();
            throw new Error("Refresh failed");
        }

        const data = await res.json();
        localStorage.setItem(TOKEN_KEY, data.token);
        if (data.refreshToken) {
            localStorage.setItem(REFRESH_KEY, data.refreshToken);
        }
        return data.token;
    },
    
    async refreshUserProfile(force = false) {
        const token = this.getToken();
        if (!token) return;

        const CACHE_KEY = 'user_profile';
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

        // Return cached data if available and not forced
        if (!force) {
            const cached = getCache(CACHE_KEY);
            if (cached) {
                console.debug('[Auth] Using cached profile');
                // Update store and localStorage in case they are stale
                localStorage.setItem(USER_KEY, JSON.stringify(cached));
                user.set(cached);
                // Still refresh in background
                setTimeout(() => this.refreshUserProfile(true), 1000);
                return cached;
            }
        }

        try {
            const res = await fetch(`${API_URL}/user/profile`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const profile = await res.json();
                const currentUser = get(user) || {};
                const finalEmail = profile.email || currentUser.email || 'unknown';

                let finalName = profile.name;
                if (!finalName && finalEmail.includes('@')) {
                    finalName = finalEmail.split('@')[0];
                } else if (!finalName) {
                    finalName = currentUser.name || 'User';
                }

                const userData = {
                    id: profile.user_id || profile.id || currentUser.id,
                    email: finalEmail,
                    name: finalName,
                    storageLimit: profile.storageLimit,
                    storageUsed: profile.storageUsed,
                    tier: profile.tier || 'free',
                    maxFileSize: profile.maxFileSize || 0,
                    subscriptionExpiresAt: profile.subscriptionExpiresAt,
                    freeSince: profile.freeSince,
                    cleanupWarningDate: profile.cleanupWarningDate,
                    hasSyncAccess: profile.hasSyncAccess || false
                };
                
                localStorage.setItem(USER_KEY, JSON.stringify(userData));
                user.set(userData);
                setCache(CACHE_KEY, userData, CACHE_TTL);
                return userData;
            }
        } catch (e) {
            console.error('[Auth] Failed to refresh profile:', e);
        }
    }
};
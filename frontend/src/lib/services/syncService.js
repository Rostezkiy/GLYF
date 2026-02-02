/* src/lib/services/syncService.js - Объединенный сервис синхронизации */
import { writable, get } from 'svelte/store';
import { dbService, db } from '../db';
import { authService, user } from '../auth';
import { hasKey, decryptData, encryptData } from '../crypto';
import { API_URL, SYNC_CONFIG } from '../config';

// Сетевой статус
let isOnline = typeof navigator !== 'undefined' && navigator.onLine;
const onlineListeners = [];

function initNetworkListener() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => {
        isOnline = true;
        console.log('[Network] Online, triggering sync');
        onlineListeners.forEach(fn => fn());
    });
    window.addEventListener('offline', () => {
        isOnline = false;
        console.log('[Network] Offline');
    });
}
initNetworkListener();

export function getNetworkStatus() {
    return isOnline;
}

export function onOnline(callback) {
    onlineListeners.push(callback);
}

const DEBOUNCE_DELAY = SYNC_CONFIG.DEBOUNCE_DELAY;
let eventSource = null;
let tokenRefreshTimer = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 2000; // 2 seconds
const RECONNECT_MAX_DELAY = 60000; // 1 minute

export const syncState = writable({
    status: 'idle',
    lastSync: localStorage.getItem('last_sync_ts') || new Date(0).toISOString(),
    errorMessage: null
});

// Глобальный таймер для Debounce
let syncTimer = null;

// Хелпер для повторных попыток с экспоненциальной задержкой
async function retryWithExponentialBackoff(operation, maxAttempts = SYNC_CONFIG.RETRY_ATTEMPTS, baseDelay = 1000, maxDelay = 30000) {
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            // Если это ошибка сети или 5xx, 429, пробуем повтор
            const isNetworkError = error.name === 'TypeError' && error.message.includes('fetch');
            const isRetryableStatus = error.status && (error.status >= 500 || error.status === 429);
            if (!isNetworkError && !isRetryableStatus) {
                throw error; // Неповторяемая ошибка
            }
            if (attempt === maxAttempts - 1) break; // Последняя попытка
            const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
            console.warn(`Retryable error: ${error.message}. Retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

// Хелпер для умных запросов (Retry + Auto Refresh)
async function fetchWithRetry(url, options = {}, maxAttempts = SYNC_CONFIG.RETRY_ATTEMPTS) {
    let token = authService.getToken();
    if (!token) throw new Error("No token");

    const baseDelay = 1000; // 1 секунда
    const maxDelay = 30000; // 30 секунд

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        token = authService.getToken();

        const headers = {
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };

        let res;
        try {
            res = await fetch(url, { ...options, headers });
        } catch (networkError) {
            // Сетевая ошибка (TypeError: failed to fetch)
            console.warn(`Network error (attempt ${attempt + 1}/${maxAttempts}):`, networkError.message);
            if (attempt === maxAttempts - 1) throw networkError;
            const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
            console.log(`Retrying in ${Math.round(delay)}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        if (res.ok) return res;

        // 1. Ошибка авторизации -> Пытаемся обновить токен
        if (res.status === 401) {
            console.warn("Access token expired, trying refresh...");
            try {
                await authService.refreshSession();
                // После обновления токена повторяем попытку без увеличения счетчика попыток?
                // Продолжаем цикл с той же попыткой (не увеличиваем attempt)
                continue;
            } catch (refreshErr) {
                console.error("Refresh failed:", refreshErr);
                authService.logout();
                throw new Error("Session expired");
            }
        }

        // 2. Rate Limiting -> Ждем с экспоненциальной задержкой
        if (res.status === 429) {
            const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
            console.warn(`Rate limited (attempt ${attempt + 1}/${maxAttempts}). Waiting ${Math.round(delay)}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        // 3. Ошибки сервера (5xx) -> Повторяем с задержкой
        if (res.status >= 500 && res.status < 600) {
            const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
            console.warn(`Server error ${res.status} (attempt ${attempt + 1}/${maxAttempts}). Retrying in ${Math.round(delay)}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        // 4. Остальные ошибки клиента (4xx кроме 401, 429) -> Не повторяем
        const txt = await res.text();
        throw new Error(`API Error ${res.status}: ${txt}`);
    }
    throw new Error("Max retries exceeded");
}

// Внутренняя функция для S3 операций
async function fetchWithAuth(url, options = {}) {
    const token = authService.getToken();
    if (!token) throw new Error("No token");

    const headers = {
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    let retries = 3;
    for (let i = 0; i < retries; i++) {
        const res = await fetch(url, { ...options, headers });
        if (res.ok) return res;

        if (res.status === 401) {
            authService.logout();
            throw new Error("Session expired");
        }
        if (res.status === 429) {
            const wait = 1000 * Math.pow(2, i);
            await new Promise(r => setTimeout(r, wait));
            continue;
        }
        throw new Error(`Request failed: ${res.status}`);
    }
    throw new Error("Max retries exceeded");
}

// Планирование повторного подключения EventSource с экспоненциальной задержкой
function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('[SSE] Max reconnect attempts reached, stopping reconnection');
        return;
    }
    const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts) + Math.random() * 1000,
        RECONNECT_MAX_DELAY
    );
    console.log(`[SSE] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    reconnectTimer = setTimeout(() => {
        reconnectAttempts++;
        syncService.startListening();
    }, delay);
}

// Проверяет, есть ли у пользователя доступ к синхронизации
function hasSyncAccess() {
    const currentUser = get(user);
    return currentUser && currentUser.hasSyncAccess === true;
}

// S3 Client
export const s3Client = {
    async uploadFile(fileRecord) {
        // 1. Получаем Presigned URL
        const presignedRes = await fetchWithAuth(`${API_URL}/files/presigned-upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: fileRecord.id, size: fileRecord.size })
        });

        const { url, s3Key } = await presignedRes.json();

        // 2. Бинарная загрузка в S3 (тут без Bearer токена, это AWS/MinIO URL)
        // Но с retry на случай сетевых сбоев
        const maxAttempts = SYNC_CONFIG.RETRY_ATTEMPTS;
        const baseDelay = 1000;
        const maxDelay = 30000;
        let uploadOk = false;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const uploadRes = await fetch(url, {
                    method: 'PUT',
                    body: fileRecord.data,
                    headers: { 'Content-Type': fileRecord.type || 'application/octet-stream' }
                });
                if (uploadRes.ok) {
                    uploadOk = true;
                    break;
                } else {
                    console.warn(`S3 upload failed with status ${uploadRes.status} (attempt ${attempt + 1}/${maxAttempts})`);
                }
            } catch (e) {
                console.warn("Retrying S3 upload...", e);
            }
            if (attempt === maxAttempts - 1) break;
            const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
            console.log(`Waiting ${Math.round(delay)}ms before retry...`);
            await new Promise(r => setTimeout(r, delay));
        }

        if (!uploadOk) throw new Error("S3 Upload failed after retries");

        // 3. Коммит загрузки
        const commitRes = await fetchWithAuth(`${API_URL}/files/commit-upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: fileRecord.id, s3Key: s3Key })
        });

        const { storageUsed } = await commitRes.json();
        return { s3Key, storageUsed };
    },

    async getViewUrl(s3Key) {
        const currentUser = get(user);
        if (!currentUser || !currentUser.hasSyncAccess) {
            console.warn('Block S3 request: Free tier user');
            return null; // Возвращаем null, компонент отрисует заглушку
        }
        if (!s3Key) return null;
        try {
            const res = await fetchWithAuth(`${API_URL}/files/view-url?key=${s3Key}`);
            const { url } = await res.json();
            return url;
        } catch (e) {
            console.error('getViewUrl error:', e);
            return null;
        }
    }
};

// Crypto Helper
class CryptoService {
    static async encryptBatch(items, fields, transformer = null) {
        if (!items || !items.length) return [];

        // Создаем массив промисов для параллельного шифрования
        const promises = items.map(async (item) => {
            const encrypted = { ...item };

            for (const field of fields) {
                if (encrypted[field] !== undefined) {
                    encrypted[field] = await encryptData(encrypted[field] || '');
                }
            }

            // Применяем трансформатор, если предоставлен
            return transformer ? transformer(encrypted) : encrypted;
        });

        return Promise.all(promises);
    }

    static async decryptBatch(items, fields) {
        if (!items || !items.length) return [];

        const result = [];
        for (const item of items) {
            const decrypted = { ...item };
            for (const field of fields) {
                if (decrypted[field] !== undefined) {
                    decrypted[field] = await decryptData(decrypted[field]);
                }
            }
            result.push(decrypted);
        }
        return result;
    }

    static async encryptNotes(notes) {
        const fields = ['title', 'content'];
        const transformer = (note) => ({
            id: note.id,
            folderId: note.folderId,
            title: note.title,
            content: note.content,
            isPinned: !!note.isPinned,
            isArchived: !!note.isArchived,
            isDeleted: !!note.isDeleted,
            color: note.color,
            coverImage: note.coverImage,
            tags: note.tags || [],
            attachments: note.attachments || [],
            createdAt: CryptoService.ensureDate(note.createdAt),
            updatedAt: CryptoService.ensureDate(note.updatedAt)
        });
        return CryptoService.encryptBatch(notes, fields, transformer);
    }

    static async encryptFolders(folders) {
        const fields = ['name'];
        const transformer = (folder) => ({
            id: folder.id,
            parentId: folder.parentId,
            name: folder.name,
            color: folder.color,
            isDeleted: !!folder.isDeleted,
            updatedAt: CryptoService.ensureDate(folder.updatedAt)
        });
        return CryptoService.encryptBatch(folders, fields, transformer);
    }

    static async encryptTags(tags) {
        const fields = ['name'];
        const transformer = (tag) => ({
            id: tag.id,
            name: tag.name,
            color: tag.color,
            updatedAt: CryptoService.ensureDate(tag.updatedAt)
        });
        return CryptoService.encryptBatch(tags, fields, transformer);
    }

    static async encryptFileMeta(file) {
        return {
            ...file,
            name: await encryptData(file.name || ''),
            createdAt: CryptoService.ensureDate(file.createdAt)
        };
    }

    static async decryptNotes(remoteNotes) {
        return CryptoService.decryptBatch(remoteNotes, ['title', 'content']);
    }

    static async decryptFolders(remoteFolders) {
        return CryptoService.decryptBatch(remoteFolders, ['name']);
    }

    static async decryptTags(remoteTags) {
        return CryptoService.decryptBatch(remoteTags, ['name']);
    }

    static ensureDate(dateStr) {
        if (!dateStr) return new Date().toISOString();
        return dateStr;
    }
}

export const cryptoHelper = {
    encryptNotes: CryptoService.encryptNotes,
    encryptFolders: CryptoService.encryptFolders,
    encryptTags: CryptoService.encryptTags,
    encryptFileMeta: CryptoService.encryptFileMeta,
    decryptNotes: CryptoService.decryptNotes,
    decryptFolders: CryptoService.decryptFolders,
    decryptTags: CryptoService.decryptTags
};

// Sync Manager
export const syncService = {
    isSyncing: false,
    _pendingSync: false,
    async downloadFileFromS3(fileRec) {
        if (!fileRec.s3Key) throw new Error('No S3 key provided');

        // 1. Получаем временную ссылку на скачивание
        const url = await s3Client.getViewUrl(fileRec.s3Key);
        if (!url) throw new Error('Could not get download URL (Access Denied or Key missing)');

        // 2. Скачиваем сам файл
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);

        return await res.blob();
    },
    // --- НОВЫЙ МЕТОД: Вызывать при локальном сохранении (saveNote, etc.) ---
    scheduleSync() {
        if (syncTimer) clearTimeout(syncTimer);

        // Визуально показываем, что скоро будет синхронизация
        syncState.update(s => ({ ...s, status: 'pending' }));

        if (!isOnline) {
            console.log('[Sync] Network offline, deferring sync until online');
            // Установим флаг ожидания и подпишемся на онлайн
            if (!this._pendingSync) {
                this._pendingSync = true;
                onOnline(() => {
                    if (this._pendingSync) {
                        this._pendingSync = false;
                        this.syncData();
                    }
                });
            }
            return;
        }

        syncTimer = setTimeout(() => {
            this.syncData();
        }, DEBOUNCE_DELAY);
    },

    // --- НОВЫЙ МЕТОД: Вызывать для принудительного обновления (при старте / по таймеру) ---
    async forceSync() {
        if (syncTimer) clearTimeout(syncTimer);
        return this.syncData();
    },

    startListening() {
        if (eventSource && (eventSource.readyState === 0 || eventSource.readyState === 1)) {
            return;
        }
        // Очистка таймера переподключения перед новым подключением
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        const token = authService.getToken();
        if (!token) {
            console.warn('[SSE] No token, skipping EventSource');
            return;
        }

        // Проверка срока действия токена (если есть поле exp)
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.exp && payload.exp * 1000 - Date.now() < 60000) {
                console.warn('[SSE] Token expires soon (<1 min), refreshing before connect');
                // Запускаем обновление и откладываем подключение
                authService.refreshSession().then(() => {
                    // После обновления токена переподключаемся
                    this.stopListening();
                    setTimeout(() => this.startListening(), 100);
                }).catch(err => {
                    console.error('[SSE] Failed to refresh token:', err);
                });
                return;
            }
        } catch (e) {
            // Если не JWT или парсинг не удался, игнорируем
            console.debug('[SSE] Token not a JWT or parse error:', e);
        }

        // Передаем токен в URL, так как EventSource не поддерживает заголовки
        const url = `${API_URL}/sync/events?token=${token}`;

        // Закрываем старое, если "зависло" в состоянии connecting
        if (eventSource) eventSource.close();

        eventSource = new EventSource(url);

        eventSource.onopen = () => {
            console.log('[SSE] Connected');
            reconnectAttempts = 0; // Сброс счетчика попыток
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        };

        eventSource.onmessage = (event) => {
            // Выводим в консоль время и данные сообщения
            console.log(`[SSE] Message received at ${new Date().toLocaleTimeString()}:`, event.data);

            if (event.data === 'sync_needed') {
                console.log('[SSE] Triggering forceSync...');
                if (this.isSyncing) {
                    console.log('[SSE] Sync already in progress, skipping duplicate trigger');
                    return;
                }
                this.forceSync();
            }
        };

        eventSource.onerror = async (err) => {
            // readyState 2 означает, что мы закрыли соединение или произошла фатальная ошибка
            if (eventSource.readyState === 2) {
                console.error('[SSE] Fatal error or manual close:', err);
                // Если ошибка 401 (Unauthorized) – пробуем обновить токен и переподключиться
                // EventSource не предоставляет статус, но можем предположить по сообщению или поведению.
                // Для простоты делаем refresh при любой фатальной ошибке.
                try {
                    await authService.refreshSession();
                    console.log('[SSE] Token refreshed');
                } catch (refreshErr) {
                    console.error('[SSE] Failed to refresh token:', refreshErr);
                }
                this.stopListening();
                scheduleReconnect();
            } else {
                // readyState 0 (CONNECTING) — браузер сам пытается восстановить связь
                // после временного обрыва. Просто наблюдаем.
                console.warn('[SSE] Connection interrupted, browser is retrying...');
            }
        };

        // Запускаем таймер для предварительного обновления токена перед истечением срока
        this.scheduleTokenRefresh();
    },

    stopListening() {
        if (eventSource) {
            console.log('[SSE] Disconnecting...');
            eventSource.close();
            eventSource = null;
        }
        if (tokenRefreshTimer) {
            clearTimeout(tokenRefreshTimer);
            tokenRefreshTimer = null;
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        reconnectAttempts = 0;
    },

    scheduleTokenRefresh() {
        if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
        const token = authService.getToken();
        if (!token) return;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.exp) {
                const expiresAt = payload.exp * 1000; // milliseconds
                const now = Date.now();
                const timeUntilExpiry = expiresAt - now;
                // Если токен уже истек, обновим немедленно
                if (timeUntilExpiry <= 0) {
                    console.log('[SSE] Token has expired, refreshing now');
                    authService.refreshSession().then(() => {
                        this.stopListening();
                        setTimeout(() => this.startListening(), 100);
                    }).catch(err => {
                        console.error('[SSE] Failed to refresh expired token:', err);
                    });
                    return;
                }
                // Обновляем за 1 минуту до истечения
                const refreshDelay = timeUntilExpiry - 60000;
                if (refreshDelay > 0) {
                    console.log(`[SSE] Token refresh scheduled in ${Math.round(refreshDelay / 1000)} seconds`);
                    tokenRefreshTimer = setTimeout(() => {
                        console.log('[SSE] Preemptive token refresh triggered');
                        authService.refreshSession().then(() => {
                            // После обновления переподключаемся
                            this.stopListening();
                            setTimeout(() => this.startListening(), 100);
                        }).catch(err => {
                            console.error('[SSE] Failed to preemptively refresh token:', err);
                        });
                    }, refreshDelay);
                } else {
                    // Если осталось меньше минуты, обновить немедленно
                    console.log('[SSE] Token expires in less than 1 minute, refreshing now');
                    authService.refreshSession().then(() => {
                        this.stopListening();
                        setTimeout(() => this.startListening(), 100);
                    }).catch(err => {
                        console.error('[SSE] Failed to refresh token:', err);
                    });
                }
            }
        } catch (e) {
            // Если не JWT или парсинг не удался, игнорируем
            console.debug('[SSE] Token not a JWT or parse error in scheduleTokenRefresh:', e);
        }
    },

    async syncData() {
        console.log('[Sync] syncData called');
        if (this.isSyncing) {
            console.log('[Sync] Already syncing, skipping');
            return;
        }

        // Проверяем доступ к синхронизации по тарифу
        const syncAccess = hasSyncAccess();
        console.log('[Sync] hasSyncAccess:', syncAccess);
        if (!syncAccess) {
            console.warn('[Sync] Aborted: User does not have sync access (free tier).');
            // Попытаемся обновить профиль пользователя, возможно, подписка уже активна
            try {
                await authService.refreshUserProfile();
                const updatedAccess = hasSyncAccess();
                console.log('[Sync] After refreshUserProfile hasSyncAccess:', updatedAccess);
                if (updatedAccess) {
                    // Перезапускаем синхронизацию снова (рекурсивно, но ограничено)
                    setTimeout(() => this.syncData(), 100);
                    return;
                }
            } catch (err) {
                console.error('[Sync] Failed to refresh user profile:', err);
            }
            syncState.update(s => ({ ...s, status: 'idle' }));
            return;
        }

        // Исправление гонки условий при старте:
        // Если токена нет, ждем 500мс, вдруг authService еще грузится
        const token = authService.getToken();
        console.log('[Sync] auth token exists:', !!token);
        if (!token) {
            await new Promise(r => setTimeout(r, 500));
        }

        const tokenAfterWait = authService.getToken();
        const hasKeyValue = hasKey();
        console.log('[Sync] after wait token:', !!tokenAfterWait, 'hasKey:', hasKeyValue);
        if (!tokenAfterWait || !hasKeyValue) {
            console.warn('[Sync] Aborted: No auth token or encryption key available.');
            return;
        }

        this.isSyncing = true;
        this._pendingSync = false;
        syncState.update(s => ({ ...s, status: 'syncing', errorMessage: null }));

        // 1. Фиксируем время НАЧАЛА синхронизации для расчета следующего timestamp
        const syncStartTime = new Date();

        try {
            const lastSync = localStorage.getItem('last_sync_ts') || new Date(0).toISOString();
            console.log(`[Sync] Starting sync. Last sync was: ${lastSync}`);

            // --- 1. СБОР ЛОКАЛЬНЫХ ИЗМЕНЕНИЙ ---
            const dirtyNotes = await db.notes.where('syncStatus').equals('dirty').toArray();
            const dirtyFolders = await db.folders.where('syncStatus').equals('dirty').toArray();
            const dirtyTags = await db.tags.where('syncStatus').equals('dirty').toArray();
            const dirtyFiles = await db.files.where('syncStatus').equals('dirty').toArray();

            // --- 2. UPLOAD ФАЙЛОВ (S3) ---
            const processedFilesForPush = [];

            for (const file of dirtyFiles) {
                let currentS3Key = file.s3Key;

                // Если есть данные (blob) и файл еще не в облаке
                if (file.data && (!currentS3Key || !file.isUploaded)) {
                    try {
                        const { s3Key, storageUsed } = await s3Client.uploadFile(file);
                        currentS3Key = s3Key;
                        // Обновляем локально, что файл загружен
                        await db.files.update(file.id, { s3Key: s3Key, isUploaded: true });
                        user.update(u => ({ ...u, storageUsed }));
                    } catch (e) {
                        console.error(`Skipping file ${file.id} upload:`, e);
                        if (e.message && e.message.includes("Session expired")) throw e;
                        continue;
                    }
                }

                // Подготовка метаданных файла для отправки на сервер
                const { data, ...fileMeta } = file;
                const encryptedMeta = await cryptoHelper.encryptFileMeta(fileMeta);
                if (currentS3Key) encryptedMeta.s3Key = currentS3Key;
                processedFilesForPush.push(encryptedMeta);
            }

            // --- 3. ШИФРОВАНИЕ ЗАМЕТОК/ПАПОК/ТЕГОВ ---
            const encryptedNotes = await cryptoHelper.encryptNotes(dirtyNotes);
            const encryptedFolders = await cryptoHelper.encryptFolders(dirtyFolders);
            const encryptedTags = await cryptoHelper.encryptTags(dirtyTags);

            // --- 4. PUSH (ОТПРАВКА НА СЕРВЕР) ---
            const hasChanges = encryptedNotes.length || encryptedFolders.length || encryptedTags.length || processedFilesForPush.length;

            if (hasChanges) {
                console.log(`[Sync] Pushing changes: ${encryptedNotes.length} notes, ${encryptedFolders.length} folders, ${processedFilesForPush.length} files.`);
                await fetchWithRetry(`${API_URL}/sync/push`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        notes: encryptedNotes,
                        folders: encryptedFolders,
                        tags: encryptedTags,
                        files: processedFilesForPush
                    })
                });

                // Помечаем локальные данные как синхронизированные
                await db.transaction('rw', db.notes, db.folders, db.tags, db.files, async () => {
                    if (dirtyNotes.length) await db.notes.bulkPut(dirtyNotes.map(n => ({ ...n, syncStatus: 'synced' })));
                    if (dirtyFolders.length) await db.folders.bulkPut(dirtyFolders.map(f => ({ ...f, syncStatus: 'synced' })));
                    if (dirtyTags.length) await db.tags.bulkPut(dirtyTags.map(t => ({ ...t, syncStatus: 'synced' })));
                    if (dirtyFiles.length) {
                        const ids = dirtyFiles.map(f => f.id);
                        await db.files.where('id').anyOf(ids).modify({ syncStatus: 'synced' });
                    }
                });
            }

            // --- 5. PULL (ПОЛУЧЕНИЕ С СЕРВЕРА) ---
            const res = await fetchWithRetry(`${API_URL}/sync/pull?since=${lastSync}`);
            const remoteData = await res.json();

            const incomingCount = (remoteData.notes?.length || 0) + (remoteData.folders?.length || 0) + (remoteData.tags?.length || 0);
            if (incomingCount > 0) {
                console.log(`[Sync] Pulled ${incomingCount} items from server.`);

                // ДИАГНОСТИКА: Логируем полученные данные
                console.log('[Sync] Received notes:', remoteData.notes?.map(n => ({ id: n.id, updatedAt: n.updatedAt })));
                console.log('[Sync] Received folders:', remoteData.folders?.map(f => ({ id: f.id, updatedAt: f.updatedAt })));
                console.log('[Sync] Received tags:', remoteData.tags?.map(t => ({ id: t.id, updatedAt: t.updatedAt })));
            }

            // --- 6. DECRYPT & SAVE (СОХРАНЕНИЕ В БД) ---
            await db.transaction('rw', db.notes, db.folders, db.tags, db.files, async () => {
                const decryptedNotes = await cryptoHelper.decryptNotes(remoteData.notes);
                for (const n of decryptedNotes) await dbService.upsertSynced('notes', n);

                const decryptedFolders = await cryptoHelper.decryptFolders(remoteData.folders);
                for (const f of decryptedFolders) await dbService.upsertSynced('folders', f);

                const decryptedTags = await cryptoHelper.decryptTags(remoteData.tags);
                for (const t of decryptedTags) await dbService.upsertSynced('tags', t);

                for (const file of (remoteData.files || [])) {
                    file.name = await decryptData(file.name);
                    const existing = await db.files.get(file.id);
                    // Если локально файла нет или он пустой, он считается cloud_only
                    const localBlob = existing && existing.data ? existing.data : null;
                    const status = localBlob ? 'synced' : 'cloud_only';

                    await dbService.upsertSynced('files', {
                        ...file,
                        data: localBlob,
                        syncStatus: status,
                        isUploaded: true
                    });
                }
            });

            // --- 7. ВЫЧИСЛЕНИЕ СЛЕДУЮЩЕГО КУРСОРА СИНХРОНИЗАЦИИ ---
            // Используем server_updated_at из полученных данных для детерминированной синхронизации
            let maxServerUpdated = null;

            // Проверяем notes
            if (remoteData.notes) {
                for (const n of remoteData.notes) {
                    const ts = n.serverUpdatedAt || n.updatedAt;
                    if (ts && (!maxServerUpdated || new Date(ts) > maxServerUpdated)) {
                        maxServerUpdated = new Date(ts);
                    }
                }
            }
            // Проверяем folders
            if (remoteData.folders) {
                for (const f of remoteData.folders) {
                    const ts = f.serverUpdatedAt || f.updatedAt;
                    if (ts && (!maxServerUpdated || new Date(ts) > maxServerUpdated)) {
                        maxServerUpdated = new Date(ts);
                    }
                }
            }
            // Проверяем tags
            if (remoteData.tags) {
                for (const t of remoteData.tags) {
                    const ts = t.serverUpdatedAt || t.updatedAt;
                    if (ts && (!maxServerUpdated || new Date(ts) > maxServerUpdated)) {
                        maxServerUpdated = new Date(ts);
                    }
                }
            }
            // Проверяем files
            if (remoteData.files) {
                for (const file of remoteData.files) {
                    const ts = file.serverUpdatedAt || file.updatedAt;
                    if (ts && (!maxServerUpdated || new Date(ts) > maxServerUpdated)) {
                        maxServerUpdated = new Date(ts);
                    }
                }
            }

            // Если не нашли server_updated_at, используем время начала синхронизации (без буфера)
            const nextSyncTime = maxServerUpdated || syncStartTime;
            const nextSyncStr = nextSyncTime.toISOString();

            // ДИАГНОСТИКА: Проверяем, что данные сохранились в БД
            const afterSyncNotes = await db.notes.toArray();
            const afterSyncFolders = await db.folders.toArray();
            console.log('[Sync] After sync - notes in DB:', afterSyncNotes.length);
            console.log('[Sync] After sync - folders in DB:', afterSyncFolders.length);

            localStorage.setItem('last_sync_ts', nextSyncStr);
            syncState.update(s => ({ ...s, status: 'success', lastSync: nextSyncStr }));

            console.log(`[Sync] Finished successfully. Next sync from: ${nextSyncStr} (based on server_updated_at)`);

            // ДИАГНОСТИКА: Вызываем loadData чтобы обновить UI
            console.log('[Sync] Manually calling loadData to update UI...');
            const { loadData } = await import('../db.js');
            await loadData();
            console.log('[Sync] loadData completed');

        } catch (e) {
            console.error('[Sync] Process error:', e);
            if (e.message !== "Session expired") {
                syncState.update(s => ({ ...s, status: 'error', errorMessage: e.message }));
            }
        } finally {
            this.isSyncing = false;
        }
    }
};
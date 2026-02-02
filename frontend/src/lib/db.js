/* src/lib/db.js */
import Dexie from 'dexie';
import { notes } from './services/noteService';
import { folders } from './services/folderService';
import { tags } from './services/tagService';

export const db = new Dexie('GlyfProjectDB');

db.version(1).stores({
    notes: 'id, folderId, updatedAt, createdAt, [isPinned+updatedAt], syncStatus',
    folders: 'id, parentId, syncStatus',
    tags: 'id, syncStatus',
    files: 'id, noteId, syncStatus'
});

// Helper to validate and normalize date strings
export function normalizeDate(dateStr, fallback = null) {
    if (!dateStr) return fallback;
    // If already a Date object, convert to ISO string
    if (dateStr instanceof Date) {
        return dateStr.toISOString();
    }
    // If it's a number (timestamp), convert
    if (typeof dateStr === 'number') {
        return new Date(dateStr).toISOString();
    }
    // If it's a string, try to parse
    if (typeof dateStr === 'string') {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    }
    // Invalid date, return fallback
    return fallback;
}

export const dbService = {
    async getAll(table) {
        return await db.table(table).toArray();
    },

    async update(table, id, data) {
        const now = new Date().toISOString();
        const finalId = id || crypto.randomUUID();
        
        const existing = await db.table(table).get(finalId);
        let creationDate = now;
        
        if (existing && existing.createdAt) {
            creationDate = normalizeDate(existing.createdAt, now);
        } else if (data.createdAt) {
            creationDate = normalizeDate(data.createdAt, now);
        }

        // Normalize all date fields in data
        const normalizedData = { ...data };
        ['createdAt', 'updatedAt'].forEach(field => {
            if (normalizedData[field] !== undefined) {
                normalizedData[field] = normalizeDate(normalizedData[field], now);
            }
        });

        const item = {
            ...normalizedData,
            id: finalId,
            createdAt: creationDate,
            updatedAt: now,
            syncStatus: 'dirty'
        };

        await db.table(table).put(item);
        return item;
    },

    /**
     * МЕТОД ОБНОВЛЕН: Защита от воскрешения данных + валидация дат
     */
    async upsertSynced(table, remoteData) {
        const localExisting = await db.table(table).get(remoteData.id);

        // 1. Если сервер подтвердил удаление (прислал isDeleted: true)
        if (remoteData.isDeleted) {
            // Удаляем из локальной базы окончательно, так как сервер это "запомнил"
            await db.table(table).delete(remoteData.id);
            console.log(`[DB] ${table}:${remoteData.id} permanently deleted (confirmed by server)`);
            return;
        }

        // 2. Если у нас локально объект помечен как УДАЛЕННЫЙ, а сервер прислал его как ЖИВОЙ
        if (localExisting && localExisting.isDeleted && !remoteData.isDeleted) {
            // Игнорируем данные с сервера. Пока наш PUSH не дойдет до сервера успешно,
            // мы будем считать объект удаленным.
            console.warn(`[DB] Blocked resurrection of ${table}:${remoteData.id}. Waiting for server to process deletion.`);
            return;
        }

        // 3. Нормализуем даты из remoteData
        const normalizedRemote = { ...remoteData };
        ['createdAt', 'updatedAt'].forEach(field => {
            if (normalizedRemote[field] !== undefined) {
                normalizedRemote[field] = normalizeDate(normalizedRemote[field], new Date().toISOString());
            }
        });

        // 4. Если всё в порядке - сохраняем данные от сервера
        // Помечаем их как 'synced', чтобы они не улетели обратно в PUSH
        await db.table(table).put({
            ...normalizedRemote,
            syncStatus: 'synced'
        });
    },

    async upsert(table, data) {
        return this.update(table, data.id, data);
    },

    async add(table, data) {
        return this.update(table, null, data);
    },

    /**
     * МЕТОД ОБНОВЛЕН: Более надежный Soft Delete
     */
    async delete(table, id) {
        if (table === 'notes' || table === 'folders') {
            const item = await db.table(table).get(id);
            if (item) {
                // Не удаляем физически, а помечаем для синхронизации
                await db.table(table).update(id, { 
                    isDeleted: true, 
                    syncStatus: 'dirty',
                    updatedAt: new Date().toISOString()
                });
                console.log(`[DB] ${table}:${id} marked as isDeleted`);
            }
        } else {
            // Теги и файлы удаляем сразу
            await db.table(table).delete(id);
        }
    },

    /* --- ФАЙЛЫ --- */
    // ... (оставляем как есть в твоем коде) ...
    async saveFile(fileData) {
        const now = new Date().toISOString();
        const record = {
            id: fileData.id,
            noteId: fileData.noteId,
            name: fileData.name,
            type: fileData.type,
            size: fileData.size,
            data: fileData.data,
            thumbnail: fileData.thumbnail,
            createdAt: normalizeDate(fileData.createdAt, now),
            syncStatus: fileData.syncStatus || 'dirty',
            s3Key: fileData.s3Key || null
        };
        await db.files.put(record);
    },

    async getFile(id) { return await db.files.get(id); },
    async getFilesByNoteId(noteId) { return await db.files.where('noteId').equals(noteId).toArray(); },
    async deleteFilesByNoteId(noteId) {
        const fileIds = await db.files.where('noteId').equals(noteId).primaryKeys();
        await db.files.bulkDelete(fileIds);
    },
    async deleteFile(id) { await db.files.delete(id); },
    async clearCache() {
        const allFiles = await db.files.toArray();
        const updates = allFiles.map(f => ({ ...f, data: null, syncStatus: 'cloud_only' })); 
        await db.files.bulkPut(updates);
    },
    async cacheDownloadedFile(fileId, blob) {
        const existing = await db.files.get(fileId);
        if (existing) {
            await db.files.update(fileId, { data: blob, syncStatus: 'synced' });
        }
    }
};

export async function loadData() {
    try {
        const [notesData, foldersData, tagsData] = await Promise.all([
            db.table('notes').toArray(),
            db.table('folders').toArray(),
            db.table('tags').toArray()
        ]);

        notes.set(notesData.filter(n => !n.isDeleted));
        folders.set(foldersData.filter(f => !f.isDeleted));
        tags.set(tagsData);

        console.log('[DB] Data loaded successfully');
    } catch (error) {
        console.error('[DB] Failed to load data:', error);
    }
}
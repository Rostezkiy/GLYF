/* src/lib/services/tagService.js - Объединенный сервис тегов */
import { writable } from 'svelte/store';
import { dbService } from '../db';
import { saveNote } from './noteService';
// УБРАЛ СТАТИЧЕСКИЙ ИМПОРТ syncService

// Стор для тегов
export const tags = writable([]);

// Хелпер
async function triggerSync() {
    try {
        const { syncService } = await import('./syncService');
        if (syncService && syncService.scheduleSync) {
            syncService.scheduleSync();
        }
    } catch (e) {
        console.warn('Sync trigger failed:', e);
    }
}

// Функции сервиса тегов
export async function createTag(name) {
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const t = await dbService.update('tags', null, { name, color });
    tags.update(all => [...all, t]);
    
    await triggerSync();
    return t;
}

export async function renameTag(id, name) {
    const t = await dbService.update('tags', id, { name });
    tags.update(all => all.map(item => item.id === id ? { ...item, name } : item));
    
    await triggerSync();
}

export async function deleteTag(id) {
    await dbService.delete('tags', id);
    tags.update(all => all.filter(item => item.id !== id));
    
    const allNotes = await dbService.getAll('notes');
    for (const note of allNotes) {
        if (note.tags && note.tags.includes(id)) {
            note.tags = note.tags.filter(t => t !== id);
            await saveNote(note);
        }
    }
    
    await triggerSync();
}
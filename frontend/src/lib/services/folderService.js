/* src/lib/services/folderService.js - Объединенный сервис папок */
import { writable } from 'svelte/store';
import { dbService, db } from '../db';
// УБРАЛ СТАТИЧЕСКИЙ ИМПОРТ syncService
import { saveNote } from './noteService';

// Стор для папок
export const folders = writable([]);

// Хелпер для запуска синхронизации
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

export async function createFolder(name, parentId = null) {
    const f = await dbService.update('folders', null, { name, parentId, color: '#9ca3af', order: 0 });
    folders.update(all => [...all, f]);
    
    await triggerSync();
    return f;
}

export async function renameFolder(id, name) {
    const f = await dbService.update('folders', id, { name });
    folders.update(all => all.map(item => item.id === id ? { ...item, name } : item));
    
    await triggerSync();
}

export async function moveFolder(id, newParentId) {
    const all = await dbService.getAll('folders');
    const folder = all.find(f => f.id === id);
    if (!folder) return;
    const updated = await dbService.update('folders', id, { ...folder, parentId: newParentId });
    folders.update(all => all.map(item => item.id === id ? updated : item));
    
    await triggerSync();
}

export async function deleteFolder(id) {
    try {
        const folder = await db.folders.get(id);

        if (folder) {
            await db.folders.update(id, {
                isDeleted: true,
                syncStatus: 'dirty',
                updatedAt: new Date().toISOString()
            });

            folders.update(list => list.filter(item => item.id !== id));
            await triggerSync();
            console.log(`[Folder] Folder ${id} marked as deleted`);
        }
    } catch (error) {
        console.error('[Folder] Delete error:', error);
    }
}

// Логика из dndHandler
/**
 * Checks if a folder is a descendant of another folder.
 */
function isDescendant(folders, parentId, childId) {
    let current = folders.find(f => f.id === childId);
    while (current && current.parentId) {
        if (current.parentId === parentId) return true;
        current = folders.find(f => f.id === current.parentId);
    }
    return false;
}

export const dndHandler = {
    /**
     * Determines the drop effect and target ID based on what is being dragged over what.
     * @param {Object} draggedItem - The item being dragged {id, type, parentId}
     * @param {Object} targetItem - The item being hovered over (or null for root)
     * @param {Array} folders - Current list of folders from store
     * @returns {Object} { dropEffect: 'move'|'none', dropTargetId: string|null }
     */
    getDragOverState(draggedItem, targetItem, folders) {
        if (!draggedItem) return { dropEffect: 'none', dropTargetId: null };

        // Only allow dropping into folders or root
        if (targetItem && targetItem.type !== 'folder') {
            return { dropEffect: 'none', dropTargetId: null };
        }

        const targetId = targetItem ? targetItem.id : null;

        // Prevent dropping folder into itself or its descendants
        if (draggedItem.type === 'folder') {
            if (targetId === draggedItem.id) return { dropEffect: 'none', dropTargetId: null };
            if (targetId && isDescendant(folders, draggedItem.id, targetId)) {
                return { dropEffect: 'none', dropTargetId: null };
            }
        }

        return { dropEffect: 'move', dropTargetId: targetId || 'root' };
    },

    /**
     * Executes the move operation in the DB.
     * @param {Object} draggedItem 
     * @param {Object} targetItem 
     * @param {Array} folders 
     * @param {Array} notes 
     * @returns {Promise<boolean>} True if move was performed
     */
    async handleDrop(draggedItem, targetItem, folders, notes) {
        const targetId = targetItem ? targetItem.id : null;

        if (!draggedItem) return false;

        // Validation again to be safe
        if (draggedItem.type === 'folder') {
            if (targetId && (draggedItem.id === targetId || isDescendant(folders, draggedItem.id, targetId))) {
                return false;
            }
            // Don't move if parent hasn't changed
            if (draggedItem.parentId === targetId) return false;

            await moveFolder(draggedItem.id, targetId);
            return true;
        } 
        else if (draggedItem.type === 'note') {
            // Don't move if parent hasn't changed
            if (draggedItem.parentId === targetId) return false;

            const note = notes.find(n => n.id === draggedItem.id);
            if (note) {
                await saveNote({ ...note, folderId: targetId });
                return true;
            }
        }
        return false;
    }
};
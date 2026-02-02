/* src/lib/services/noteService.js - Объединенный сервис заметок */
import { writable, get } from 'svelte/store';
import { dbService, db } from '../db';
// УБИРАЕМ статические импорты, вызывающие циклы:
import { fileService } from './fileService';
import { generateThumbnailBlob, generateVideoThumbnailBlob } from '../imageUtils';

// Стор для заметок
export const notes = writable([]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Вспомогательная функция для создания снепшота заметки
function getSnapshot(note) {
    const { updatedAt, createdAt, ...rest } = note;
    return JSON.stringify(rest);
}

// Функции сервиса заметок
export async function saveNote(note) {
    const saved = await dbService.update('notes', note.id, note);
    notes.update(n => {
        const idx = n.findIndex(x => x.id === saved.id);
        if (idx !== -1) {
            const copy = [...n];
            copy[idx] = saved;
            return copy;
        }
        return [saved, ...n];
    });
    
    // Schedule sync using dynamic import
    try {
        const { syncService } = await import('./syncService');
        if (syncService && syncService.scheduleSync) {
            syncService.scheduleSync();
        }
    } catch (e) {
        console.warn('Sync scheduling failed (module not ready yet):', e);
    }
    
    return saved;
}

export async function deleteNote(id, permanent = false) {
    if (permanent) {
        await dbService.deleteFilesByNoteId(id);
        await dbService.delete('notes', id);
        notes.update(n => n.filter(x => x.id !== id));
    } else {
        const all = await dbService.getAll('notes');
        const note = all.find(n => n.id === id);
        if (note) {
            await saveNote({ ...note, isDeleted: true });
        }
    }
}

export async function moveNoteToTrash(id) {
    const all = await dbService.getAll('notes');
    const note = all.find(n => n.id === id);
    if (note) {
        await saveNote({ ...note, isDeleted: true });
    }
}

export async function duplicateNote(note) {
    const { id, createdAt, updatedAt, attachments, ...rest } = note;
    let newAttachments = [];
    if (attachments && attachments.length > 0) {
        for (const att of attachments) {
            const fileData = await dbService.getFile(att.id);
            if (fileData) {
                const newFileId = crypto.randomUUID();
                await dbService.saveFile({ ...fileData, id: newFileId, noteId: null });
                newAttachments.push({ ...att, id: newFileId });
            }
        }
    }
    const newNote = {
        ...rest,
        title: (rest.title || 'Без названия') + ' (Копия)',
        attachments: newAttachments,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    const savedNote = await saveNote(newNote);
    if (newAttachments.length > 0) {
        for (const att of newAttachments) {
            const file = await dbService.getFile(att.id);
            if (file) await dbService.saveFile({ ...file, noteId: savedNote.id });
        }
    }
    return savedNote;
}

export async function permanentDeleteNote(id) {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('glyf_auth_token') : null;
    
    await dbService.deleteFilesByNoteId(id);
    await dbService.delete('notes', id); 
    notes.update(n => n.filter(x => x.id !== id));

    if (token) {
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/notes/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
            console.error("Failed to delete on server", e);
        }
    }
}

// Логика из editorController
export function createEditorController() {
    let initialSnapshot = '';

    return {
        initializeNote(noteId, notesStore) {
            let note;
            let isNew = false;

            if (noteId === 'new') {
                note = {
                    id: crypto.randomUUID(),
                    title: '',
                    content: '',
                    tags: [],
                    folderId: null,
                    isPinned: false,
                    isArchived: false,
                    color: 'default',
                    coverImage: null,
                    attachments: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                initialSnapshot = getSnapshot({ ...note, title: '', content: '' });
                isNew = true;
            } else {
                const found = get(notesStore).find(n => n.id === noteId);
                if (found) {
                    note = JSON.parse(JSON.stringify(found));
                    initialSnapshot = getSnapshot(note);
                } else {
                    throw new Error('Note not found');
                }
            }
            return { note, isNew };
        },

        async saveIfChanged(note) {
            const currentSnapshot = getSnapshot(note);
            if (currentSnapshot === initialSnapshot) return null;
            const noteToSave = { ...note, updatedAt: new Date().toISOString() };
            const savedNote = await saveNote(noteToSave);
            initialSnapshot = getSnapshot(savedNote);
            return savedNote;
        },

        async uploadCover(note, file) {
            if (!file) return note;
            if (file.size > 10 * 1024 * 1024) throw new Error('Обложка слишком большая (макс 10МБ)');

            const optimizedBlob = await generateThumbnailBlob(file, 1280, 0.8);
            const fileId = crypto.randomUUID();

            await fileService.saveFileToDb({
                id: fileId,
                noteId: note.id,
                name: 'cover_' + file.name,
                type: 'image/jpeg',
                size: optimizedBlob.size,
                data: optimizedBlob,
                syncStatus: 'dirty'
            });

            if (note.coverImage && note.coverImage.length > 30) {
                await fileService.deleteFile(note.coverImage);
            }

            const updatedNote = { ...note, coverImage: fileId };
            await this.saveIfChanged(updatedNote); 
            return updatedNote;
        },

        async removeCover(note) {
            if (note.coverImage && note.coverImage.length > 30) {
                await fileService.deleteFile(note.coverImage);
            }
            const updatedNote = { ...note, coverImage: null };
            await this.saveIfChanged(updatedNote);
            return updatedNote;
        },

        async uploadAttachments(note, fileList) {
            const files = Array.from(fileList);
            if (!files.length) return note;

            const newAttachments = [];

            for (const file of files) {
                if (file.size > MAX_FILE_SIZE) {
                    console.warn(`Файл ${file.name} пропущен ( > 50MB)`);
                    continue;
                }

                const fileId = crypto.randomUUID();
                const arrayBuffer = await file.arrayBuffer();
                const originalBlob = new Blob([arrayBuffer], { type: file.type });

                let thumbnailBlob = null;
                if (file.type.startsWith('image/')) {
                    thumbnailBlob = await generateThumbnailBlob(file, 300, 0.6);
                } else if (file.type.startsWith('video/')) {
                    thumbnailBlob = await generateVideoThumbnailBlob(file, 300, 0.6);
                }

                await fileService.saveFileToDb({
                    id: fileId,
                    noteId: note.id,
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    data: originalBlob,
                    thumbnail: thumbnailBlob,
                    createdAt: new Date().toISOString()
                });

                newAttachments.push({
                    id: fileId,
                    name: file.name,
                    type: file.type,
                    size: file.size
                });
            }

            const updatedNote = { 
                ...note, 
                attachments: [...(note.attachments || []), ...newAttachments] 
            };
            
            await this.saveIfChanged(updatedNote);
            return updatedNote;
        },

        async removeAttachment(note, attachmentId) {
            await fileService.deleteFile(attachmentId);
            const updatedNote = {
                ...note,
                attachments: note.attachments.filter(a => a.id !== attachmentId)
            };
            await this.saveIfChanged(updatedNote);
            return updatedNote;
        },

        async resolveCoverUrl(coverId) {
            if (!coverId) return null;
            if (coverId.startsWith('data:')) return coverId;
    
            try {
                const file = await fileService.getFileFromDb(coverId);
                if (file?.data) return URL.createObjectURL(file.data);
                else if (file?.s3Key) {
                    const { s3Client } = await import('./syncService.js');
                    return await s3Client.getViewUrl(file.s3Key);
                }
            } catch (e) {
                console.error("Controller: Error resolving cover", e);
            }
            return null;
        },

        async openAttachmentViewer(att) {
            let fileRec = await fileService.getFileFromDb(att.id);
            if (!fileRec) {
                fileRec = { id: att.id, name: att.name, size: att.size, type: att.type, data: null, s3Key: att.s3Key || null };
            }
            if (!fileRec.data && fileRec.s3Key) {
                const { s3Client } = await import('./syncService.js');
                const blob = await this.downloadFileFromS3(fileRec, s3Client);
                await fileService.cacheDownloadedFile(fileRec.id, blob);
                fileRec = await fileService.getFileFromDb(att.id);
            }
    
            if (!fileRec.data && !fileRec.s3Key) throw new Error('Файл не найден ни локально, ни в облаке');
            
            const blobUrl = URL.createObjectURL(fileRec.data);
            
            // ДИНАМИЧЕСКИЙ ИМПОРТ uiStore
            const { mediaViewerItem } = await import('./uiStore');
            mediaViewerItem.set({
                type: fileRec.type.split('/')[0],
                src: blobUrl,
                name: fileRec.name,
                originalBlob: fileRec.data,
                size: fileRec.size,
                s3Key: fileRec.s3Key,
                id: fileRec.id
            });
            
            return att.id; 
        },
    
        async downloadFileFromS3(fileRec, s3Client) {
            if (!fileRec.s3Key) throw new Error('No S3 key for file');
            const viewUrl = await s3Client.getViewUrl(fileRec.s3Key);
            if (!viewUrl) throw new Error('Failed to get S3 view URL');
            const response = await fetch(viewUrl);
            if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
            return await response.blob();
        }
    };
}

// ВНИМАНИЕ: МЫ УДАЛИЛИ re-exports (export { ... } from ...), 
// чтобы разорвать циклическую зависимость.
// Теперь приложение должно запуститься.
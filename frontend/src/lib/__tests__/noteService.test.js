import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { notes, saveNote, deleteNote, moveNoteToTrash, duplicateNote, permanentDeleteNote, createEditorController } from '../services/noteService';
import { dbService } from '../db';

// Мокаем зависимости
vi.mock('../db', () => ({
    dbService: {
        update: vi.fn(),
        getAll: vi.fn(),
        delete: vi.fn(),
        deleteFilesByNoteId: vi.fn(),
        getFile: vi.fn(),
        saveFile: vi.fn(),
    }
}));

vi.mock('../services/syncService', () => ({
    syncService: {
        scheduleSync: vi.fn()
    }
}));

vi.mock('../services/fileService', () => ({
    fileService: {
        saveFileToDb: vi.fn(),
        deleteFile: vi.fn(),
        getFileFromDb: vi.fn(),
        cacheDownloadedFile: vi.fn(),
    }
}));

vi.mock('../imageUtils', () => ({
    generateThumbnailBlob: vi.fn(),
    generateVideoThumbnailBlob: vi.fn(),
}));

// Частичный мок для noteService, чтобы экспортировать notes как writable store
vi.mock('../services/noteService', async (importOriginal) => {
    const actual = await importOriginal();
    // Используем реальный store notes из actual
    return {
        ...actual,
        // Оставляем notes как есть (writable store)
    };
});

describe('noteService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        notes.set([]);
    });

    describe('saveNote', () => {
        it('should save a new note and update store', async () => {
            const mockNote = {
                id: 'note1',
                title: 'Test Note',
                content: 'Content',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z'
            };

            dbService.update.mockResolvedValue(mockNote);

            const result = await saveNote(mockNote);

            expect(dbService.update).toHaveBeenCalledWith('notes', 'note1', mockNote);
            expect(result).toEqual(mockNote);
            
            // Проверяем, что стор обновлен
            const currentNotes = get(notes);
            expect(currentNotes).toContainEqual(mockNote);
        });

        it('should update existing note in store', async () => {
            const existingNote = {
                id: 'note1',
                title: 'Old Title',
                content: 'Old Content',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z'
            };
            
            const updatedNote = {
                ...existingNote,
                title: 'Updated Title'
            };

            notes.set([existingNote]);
            dbService.update.mockResolvedValue(updatedNote);

            await saveNote(updatedNote);

            const currentNotes = get(notes);
            expect(currentNotes).toHaveLength(1);
            expect(currentNotes[0].title).toBe('Updated Title');
        });
    });

    describe('deleteNote', () => {
        it('should soft delete note when permanent=false', async () => {
            const mockNote = {
                id: 'note1',
                title: 'Test Note',
                isDeleted: false
            };

            dbService.getAll.mockResolvedValue([mockNote]);
            dbService.update.mockResolvedValue({ ...mockNote, isDeleted: true });

            await deleteNote('note1', false);

            expect(dbService.getAll).toHaveBeenCalledWith('notes');
            expect(dbService.update).toHaveBeenCalledWith('notes', 'note1', { ...mockNote, isDeleted: true });
        });

        it('should permanently delete note when permanent=true', async () => {
            await deleteNote('note1', true);

            expect(dbService.deleteFilesByNoteId).toHaveBeenCalledWith('note1');
            expect(dbService.delete).toHaveBeenCalledWith('notes', 'note1');
            
            const currentNotes = get(notes);
            expect(currentNotes).toHaveLength(0);
        });
    });

    describe('moveNoteToTrash', () => {
        it('should mark note as deleted', async () => {
            const mockNote = {
                id: 'note1',
                title: 'Test Note',
                isDeleted: false
            };

            dbService.getAll.mockResolvedValue([mockNote]);
            dbService.update.mockResolvedValue({ ...mockNote, isDeleted: true });

            await moveNoteToTrash('note1');

            expect(dbService.getAll).toHaveBeenCalledWith('notes');
            expect(dbService.update).toHaveBeenCalledWith('notes', 'note1', { ...mockNote, isDeleted: true });
        });
    });

    describe('duplicateNote', () => {
        it('should duplicate note with new ID and attachments', async () => {
            const originalNote = {
                id: 'note1',
                title: 'Original',
                content: 'Content',
                attachments: [
                    { id: 'att1', name: 'file1.pdf', type: 'application/pdf', size: 1000 }
                ],
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z'
            };

            const mockFileData = {
                id: 'att1',
                noteId: 'note1',
                name: 'file1.pdf',
                type: 'application/pdf',
                size: 1000,
                data: new Blob()
            };

            dbService.getFile.mockResolvedValue(mockFileData);
            dbService.update.mockImplementation(async (table, id, data) => data);
            dbService.saveFile.mockResolvedValue();

            const result = await duplicateNote(originalNote);

            expect(result.title).toBe('Original (Копия)');
            expect(result.id).not.toBe('note1');
            expect(result.attachments).toHaveLength(1);
            expect(result.attachments[0].id).not.toBe('att1');
            
            expect(dbService.getFile).toHaveBeenCalledWith('att1');
            expect(dbService.saveFile).toHaveBeenCalled();
        });
    });

    describe('permanentDeleteNote', () => {
        it('should delete note locally and attempt server deletion', async () => {
            // Мокаем localStorage
            const localStorageMock = {
                getItem: vi.fn(() => 'mock-token')
            };
            Object.defineProperty(global, 'localStorage', { value: localStorageMock });

            global.fetch = vi.fn(() => Promise.resolve({ ok: true }));

            await permanentDeleteNote('note1');

            expect(dbService.deleteFilesByNoteId).toHaveBeenCalledWith('note1');
            expect(dbService.delete).toHaveBeenCalledWith('notes', 'note1');
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/notes/note1'),
                expect.objectContaining({
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer mock-token' }
                })
            );
        });
    });

    describe('createEditorController', () => {
        it('should initialize new note', () => {
            const controller = createEditorController();
            const mockNotesStore = { get: () => [] };

            const result = controller.initializeNote('new', mockNotesStore);

            expect(result.isNew).toBe(true);
            expect(result.note.id).toBeDefined();
            expect(result.note.title).toBe('');
            expect(result.note.content).toBe('');
        });

        it('should initialize existing note', () => {
            const controller = createEditorController();
            const existingNote = {
                id: 'note1',
                title: 'Existing',
                content: 'Content',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z'
            };
            const mockNotesStore = { get: () => [existingNote] };

            const result = controller.initializeNote('note1', mockNotesStore);

            expect(result.isNew).toBe(false);
            expect(result.note.title).toBe('Existing');
            expect(result.note.content).toBe('Content');
        });

        it('should save note if changed', async () => {
            const controller = createEditorController();
            const note = {
                id: 'note1',
                title: 'Original',
                content: 'Content',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z'
            };

            // Инициализируем snapshot
            controller.initializeNote('note1', { get: () => [note] });

            // Меняем заметку
            const changedNote = { ...note, title: 'Changed' };
            dbService.update.mockResolvedValue(changedNote);

            const result = await controller.saveIfChanged(changedNote);

            expect(result).toEqual(changedNote);
            expect(dbService.update).toHaveBeenCalled();
        });

        it('should not save note if unchanged', async () => {
            const controller = createEditorController();
            const note = {
                id: 'note1',
                title: 'Original',
                content: 'Content',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z'
            };

            controller.initializeNote('note1', { get: () => [note] });

            const result = await controller.saveIfChanged(note);

            expect(result).toBeNull();
            expect(dbService.update).not.toHaveBeenCalled();
        });
    });
});
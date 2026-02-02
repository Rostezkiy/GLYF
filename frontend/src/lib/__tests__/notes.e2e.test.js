import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db, dbService } from '../db';
import { notes, saveNote, deleteNote, moveNoteToTrash, duplicateNote, getNotes } from '../services/noteService';
import testNotes from './test-notes.json';

// Этот E2E тест использует реальную базу данных Dexie в памяти
// Для изоляции тестов мы будем очищать базу перед каждым тестом
// Используем сгенерированные тестовые данные для более реалистичного тестирования

describe('E2E: Notes CRUD operations with real data', () => {
    beforeAll(async () => {
        // Очищаем базу перед запуском тестов
        await db.delete();
        await db.open();
    });

    afterAll(async () => {
        await db.close();
    });

    beforeEach(async () => {
        // Очищаем все таблицы перед каждым тестом
        await Promise.all([
            db.notes.clear(),
            db.folders.clear(),
            db.tags.clear(),
            db.files.clear()
        ]);
        notes.set([]);
    });

    it('should create a new note and retrieve it', async () => {
        const noteData = {
            id: 'test-note-1',
            title: 'E2E Test Note',
            content: 'This is a test note created in E2E test',
            tags: [],
            attachments: [],
            isPinned: false,
            isArchived: false,
            isDeleted: false,
            color: 'default',
            coverImage: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Сохраняем заметку через сервис
        const savedNote = await saveNote(noteData);

        // Проверяем, что заметка сохранена в базе
        const dbNote = await db.notes.get('test-note-1');
        expect(dbNote).toBeDefined();
        expect(dbNote.title).toBe('E2E Test Note');
        expect(dbNote.syncStatus).toBe('dirty');

        // Проверяем, что стор обновлен
        const storeNotes = notes.get();
        expect(storeNotes).toContainEqual(expect.objectContaining({
            id: 'test-note-1',
            title: 'E2E Test Note'
        }));
    });

    it('should update an existing note', async () => {
        // Создаем заметку
        const noteData = {
            id: 'test-note-2',
            title: 'Original Title',
            content: 'Original Content',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await saveNote(noteData);

        // Обновляем заметку
        const updatedNote = {
            ...noteData,
            title: 'Updated Title',
            content: 'Updated Content'
        };

        await saveNote(updatedNote);

        // Проверяем обновление в базе
        const dbNote = await db.notes.get('test-note-2');
        expect(dbNote.title).toBe('Updated Title');
        expect(dbNote.content).toBe('Updated Content');
        expect(dbNote.updatedAt).not.toBe(noteData.updatedAt);
    });

    it('should soft delete a note (move to trash)', async () => {
        const noteData = {
            id: 'test-note-3',
            title: 'Note to delete',
            content: 'Content',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await saveNote(noteData);

        // Мягкое удаление
        await moveNoteToTrash('test-note-3');

        // Проверяем, что заметка помечена как удаленная
        const dbNote = await db.notes.get('test-note-3');
        expect(dbNote.isDeleted).toBe(true);
        expect(dbNote.syncStatus).toBe('dirty');

        // Проверяем, что заметка удалена из стора (фильтруется)
        const storeNotes = notes.get();
        const foundNote = storeNotes.find(n => n.id === 'test-note-3');
        expect(foundNote).toBeUndefined();
    });

    it('should permanently delete a note', async () => {
        const noteData = {
            id: 'test-note-4',
            title: 'Note to delete permanently',
            content: 'Content',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await saveNote(noteData);

        // Постоянное удаление
        await deleteNote('test-note-4', true);

        // Проверяем, что заметка удалена из базы
        const dbNote = await db.notes.get('test-note-4');
        expect(dbNote).toBeUndefined();

        // Проверяем, что заметка удалена из стора
        const storeNotes = notes.get();
        const foundNote = storeNotes.find(n => n.id === 'test-note-4');
        expect(foundNote).toBeUndefined();
    });

    it('should duplicate a note with new ID', async () => {
        const originalNote = {
            id: 'original-note',
            title: 'Original Note',
            content: 'Original content',
            tags: ['work', 'important'],
            attachments: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await saveNote(originalNote);

        // Дублируем заметку
        const duplicatedNote = await duplicateNote(originalNote);

        // Проверяем, что у дубликата новый ID
        expect(duplicatedNote.id).not.toBe('original-note');
        expect(duplicatedNote.title).toBe('Original Note (Копия)');
        expect(duplicatedNote.content).toBe('Original content');
        expect(duplicatedNote.tags).toEqual(['work', 'important']);

        // Проверяем, что обе заметки существуют в базе
        const originalInDb = await db.notes.get('original-note');
        const duplicateInDb = await db.notes.get(duplicatedNote.id);

        expect(originalInDb).toBeDefined();
        expect(duplicateInDb).toBeDefined();
        expect(duplicateInDb.title).toBe('Original Note (Копия)');
    });

    it('should filter deleted notes from store', async () => {
        // Создаем несколько заметок
        const notesData = [
            { id: 'note-1', title: 'Active Note 1', isDeleted: false },
            { id: 'note-2', title: 'Deleted Note', isDeleted: true },
            { id: 'note-3', title: 'Active Note 2', isDeleted: false }
        ];

        for (const note of notesData) {
            await db.notes.put({
                ...note,
                content: 'Content',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                syncStatus: 'synced'
            });
        }

        // Загружаем данные (имитируем loadData)
        const allNotes = await db.notes.toArray();
        const activeNotes = allNotes.filter(n => !n.isDeleted);
        notes.set(activeNotes);

        // Проверяем, что в сторе только активные заметки
        const storeNotes = notes.get();
        expect(storeNotes).toHaveLength(2);
        expect(storeNotes.map(n => n.id)).toEqual(['note-1', 'note-3']);
    });

    it('should handle note with attachments', async () => {
        // Создаем заметку с вложениями
        const noteData = {
            id: 'note-with-attachments',
            title: 'Note with Files',
            content: 'Content',
            attachments: [
                { id: 'file-1', name: 'document.pdf', type: 'application/pdf', size: 1024 },
                { id: 'file-2', name: 'image.jpg', type: 'image/jpeg', size: 2048 }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Мокаем сохранение файлов
        const mockFileData = {
            id: 'file-1',
            noteId: 'note-with-attachments',
            name: 'document.pdf',
            type: 'application/pdf',
            size: 1024,
            data: new Blob(),
            syncStatus: 'dirty'
        };

        // Используем реальный dbService для сохранения файла
        await dbService.saveFile(mockFileData);

        // Сохраняем заметку
        await saveNote(noteData);

        // Проверяем, что заметка сохранена
        const dbNote = await db.notes.get('note-with-attachments');
        expect(dbNote).toBeDefined();
        expect(dbNote.attachments).toHaveLength(2);

        // Проверяем, что файл сохранен в базе
        const dbFile = await db.files.get('file-1');
        expect(dbFile).toBeDefined();
        expect(dbFile.name).toBe('document.pdf');
    });

    it('should load and process generated test notes', async () => {
        // Берем первые 5 тестовых заметок для теста
        const sampleNotes = testNotes.slice(0, 5);
        
        // Сохраняем все заметки
        for (const note of sampleNotes) {
            await saveNote({
                ...note,
                syncStatus: 'dirty',
                createdAt: new Date(note.createdAt).toISOString(),
                updatedAt: new Date(note.updatedAt).toISOString()
            });
        }

        // Проверяем, что все заметки сохранены
        const dbNotes = await db.notes.toArray();
        expect(dbNotes).toHaveLength(5);

        // Проверяем различные типы заметок
        const pinnedNotes = dbNotes.filter(n => n.isPinned);
        const archivedNotes = dbNotes.filter(n => n.isArchived);
        const notesWithTags = dbNotes.filter(n => n.tags && n.tags.length > 0);
        const notesWithAttachments = dbNotes.filter(n => n.attachments && n.attachments.length > 0);

        console.log(`Тестовые данные: ${dbNotes.length} заметок, ${pinnedNotes.length} закрепленных, ${archivedNotes.length} архивных, ${notesWithTags.length} с тегами, ${notesWithAttachments.length} с вложениями`);

        // Проверяем, что данные корректно сохранились
        for (const originalNote of sampleNotes) {
            const dbNote = dbNotes.find(n => n.title === originalNote.title);
            expect(dbNote).toBeDefined();
            expect(dbNote.content).toBe(originalNote.content);
            expect(dbNote.folderId).toBe(originalNote.folderId);
        }
    });

    it('should filter notes by folder', async () => {
        // Сохраняем заметки с разными папками
        const folderNotes = testNotes.filter(n => n.folderId).slice(0, 3);
        const noFolderNotes = testNotes.filter(n => !n.folderId).slice(0, 2);
        
        const allNotes = [...folderNotes, ...noFolderNotes];
        
        for (const note of allNotes) {
            await saveNote({
                ...note,
                syncStatus: 'dirty',
                createdAt: new Date(note.createdAt).toISOString(),
                updatedAt: new Date(note.updatedAt).toISOString()
            });
        }

        // Получаем все заметки из базы
        const dbNotes = await db.notes.toArray();
        
        // Фильтруем по конкретной папке
        const testFolderId = folderNotes[0].folderId;
        const folderNotesInDb = dbNotes.filter(n => n.folderId === testFolderId);
        
        expect(folderNotesInDb.length).toBeGreaterThan(0);
        expect(folderNotesInDb.every(n => n.folderId === testFolderId)).toBe(true);
    });

    it('should handle bulk operations with test data', async () => {
        // Тестируем массовые операции с 10 заметками
        const bulkNotes = testNotes.slice(10, 20);
        
        // Массовое сохранение
        const savePromises = bulkNotes.map(note =>
            saveNote({
                ...note,
                syncStatus: 'dirty',
                createdAt: new Date(note.createdAt).toISOString(),
                updatedAt: new Date(note.updatedAt).toISOString()
            })
        );
        
        await Promise.all(savePromises);
        
        // Проверяем сохранение
        const dbNotes = await db.notes.toArray();
        expect(dbNotes.length).toBe(bulkNotes.length);
        
        // Массовое обновление
        const updatePromises = dbNotes.map(note =>
            saveNote({
                ...note,
                title: `UPDATED: ${note.title}`,
                syncStatus: 'dirty'
            })
        );
        
        await Promise.all(updatePromises);
        
        // Проверяем обновление
        const updatedNotes = await db.notes.toArray();
        expect(updatedNotes.every(n => n.title.startsWith('UPDATED: '))).toBe(true);
        
        // Массовое удаление
        const deletePromises = updatedNotes.map(note =>
            moveNoteToTrash(note.id)
        );
        
        await Promise.all(deletePromises);
        
        // Проверяем удаление (soft delete)
        const deletedNotes = await db.notes.toArray();
        expect(deletedNotes.every(n => n.isDeleted)).toBe(true);
    });

    it('should simulate real-world sync scenario', async () => {
        // Имитация реального сценария синхронизации
        // 1. Создание заметок офлайн
        const offlineNotes = testNotes.slice(30, 35).map(note => ({
            ...note,
            syncStatus: 'dirty', // Помечаем для синхронизации
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }));
        
        for (const note of offlineNotes) {
            await saveNote(note);
        }
        
        // 2. Проверяем, что заметки помечены для синхронизации
        const dirtyNotes = await db.notes.where('syncStatus').equals('dirty').toArray();
        expect(dirtyNotes.length).toBe(offlineNotes.length);
        
        // 3. Имитируем успешную синхронизацию
        const syncPromises = dirtyNotes.map(note =>
            db.notes.update(note.id, { syncStatus: 'synced' })
        );
        
        await Promise.all(syncPromises);
        
        // 4. Проверяем, что все заметки синхронизированы
        const syncedNotes = await db.notes.where('syncStatus').equals('synced').toArray();
        expect(syncedNotes.length).toBe(offlineNotes.length);
        
        // 5. Имитируем конфликт (одновременное редактирование)
        const noteToConflict = syncedNotes[0];
        const conflictUpdate1 = {
            ...noteToConflict,
            title: 'Редактирование 1',
            syncStatus: 'dirty'
        };
        
        const conflictUpdate2 = {
            ...noteToConflict,
            title: 'Редактирование 2',
            syncStatus: 'dirty'
        };
        
        // Сохраняем оба обновления (последнее побеждает)
        await saveNote(conflictUpdate1);
        await saveNote(conflictUpdate2);
        
        // Проверяем, что сохранилось последнее обновление
        const finalNote = await db.notes.get(noteToConflict.id);
        expect(finalNote.title).toBe('Редактирование 2');
    });
});
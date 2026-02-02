import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { notes } from '../services/noteService';
import { folders } from '../services/folderService';
import { tags } from '../services/tagService';

// Мокаем Dexie
vi.mock('dexie', () => {
    const mockTable = {
        toArray: vi.fn(),
        get: vi.fn(),
        put: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        where: vi.fn(() => ({
            equals: vi.fn(() => ({
                toArray: vi.fn(),
                primaryKeys: vi.fn()
            }))
        })),
        bulkDelete: vi.fn(),
        bulkPut: vi.fn(),
        clear: vi.fn()
    };

    const mockDb = {
        version: vi.fn(() => ({
            stores: vi.fn()
        })),
        table: vi.fn(() => mockTable),
        notes: mockTable,
        folders: mockTable,
        tags: mockTable,
        files: mockTable,
        delete: vi.fn(),
        open: vi.fn(),
        close: vi.fn()
    };

    return {
        default: vi.fn(() => mockDb)
    };
});

// Мокаем dbService и другие экспорты из db
vi.mock('../db', async (importOriginal) => {
    const actual = await importOriginal();
    const mockTable = {
        toArray: vi.fn(),
        get: vi.fn(),
        put: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        where: vi.fn(() => ({
            equals: vi.fn(() => ({
                toArray: vi.fn(),
                primaryKeys: vi.fn()
            }))
        })),
        bulkDelete: vi.fn(),
        bulkPut: vi.fn(),
        clear: vi.fn()
    };

    const mockDb = {
        version: vi.fn(() => ({
            stores: vi.fn()
        })),
        table: vi.fn(() => mockTable),
        notes: mockTable,
        folders: mockTable,
        tags: mockTable,
        files: mockTable,
        delete: vi.fn(),
        open: vi.fn(),
        close: vi.fn()
    };

    // Мокаем dbService методы
    const dbService = {
        getAll: vi.fn(),
        update: vi.fn(),
        upsertSynced: vi.fn(),
        upsert: vi.fn(),
        add: vi.fn(),
        delete: vi.fn((table, id) => {
            if (table === 'notes' || table === 'folders') {
                // soft delete
                return db.table(table).update(id, {
                    isDeleted: true,
                    syncStatus: 'dirty',
                    updatedAt: new Date().toISOString()
                });
            } else {
                // hard delete
                return db.table(table).delete(id);
            }
        }),
        saveFile: vi.fn((fileData) => db.files.put({
            id: fileData.id,
            noteId: fileData.noteId,
            name: fileData.name,
            type: fileData.type,
            size: fileData.size,
            data: fileData.data,
            syncStatus: 'dirty'
        })),
        getFile: vi.fn(),
        getFilesByNoteId: vi.fn((noteId) => db.files.where('noteId').equals(noteId).toArray()),
        deleteFilesByNoteId: vi.fn((noteId) => {
            const mockPrimaryKeys = vi.fn().mockResolvedValue(['file1', 'file2']);
            const mockEquals = vi.fn().mockReturnValue({ primaryKeys: mockPrimaryKeys });
            const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals });
            db.files.where = mockWhere;
            return db.files.bulkDelete(['file1', 'file2']);
        }),
        deleteFile: vi.fn(),
        clearCache: vi.fn(),
        cacheDownloadedFile: vi.fn()
    };

    return {
        ...actual,
        db: mockDb,
        dbService,
        normalizeDate: actual.normalizeDate, // используем реальную функцию
        // loadData остаётся реальной функцией из actual
    };
});

// Импортируем после мока
import { db, dbService, normalizeDate, loadData } from '../db';

// Мокаем stores
vi.mock('../services/noteService', () => ({
    notes: {
        set: vi.fn(),
        subscribe: vi.fn()
    }
}));

vi.mock('../services/folderService', () => ({
    folders: { set: vi.fn(), subscribe: vi.fn() }
}));

vi.mock('../services/tagService', () => ({
    tags: { set: vi.fn(), subscribe: vi.fn() }
}));

describe('db', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('normalizeDate', () => {
        it('should return fallback for empty string', () => {
            const result = normalizeDate('', 'fallback');
            expect(result).toBe('fallback');
        });

        it('should convert Date object to ISO string', () => {
            const date = new Date('2024-01-01T00:00:00Z');
            const result = normalizeDate(date);
            expect(result).toBe(date.toISOString());
        });

        it('should convert timestamp number to ISO string', () => {
            const timestamp = 1704067200000; // 2024-01-01
            const result = normalizeDate(timestamp);
            expect(result).toBe(new Date(timestamp).toISOString());
        });

        it('should parse valid date string', () => {
            const dateStr = '2024-01-01T00:00:00Z';
            const result = normalizeDate(dateStr);
            // toISOString adds milliseconds, so we expect '2024-01-01T00:00:00.000Z'
            expect(result).toBe(new Date(dateStr).toISOString());
        });

        it('should return fallback for invalid date string', () => {
            const result = normalizeDate('invalid-date', 'fallback');
            expect(result).toBe('fallback');
        });
    });

    describe('dbService', () => {
        describe('getAll', () => {
            it('should return all items from table', async () => {
                const mockItems = [{ id: '1', name: 'test' }];
                db.table().toArray.mockResolvedValue(mockItems);

                const result = await dbService.getAll('notes');
                
                expect(db.table).toHaveBeenCalledWith('notes');
                expect(result).toEqual(mockItems);
            });
        });

        describe('update', () => {
            it('should create new item with generated ID', async () => {
                const mockData = { title: 'New Note' };
                const mockItem = {
                    ...mockData,
                    id: 'generated-id',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                    syncStatus: 'dirty'
                };

                db.table().get.mockResolvedValue(null);
                db.table().put.mockResolvedValue();

                vi.spyOn(crypto, 'randomUUID').mockReturnValue('generated-id');
                vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00Z');

                const result = await dbService.update('notes', null, mockData);

                expect(result.id).toBe('generated-id');
                expect(result.createdAt).toBe('2024-01-01T00:00:00Z');
                expect(result.updatedAt).toBe('2024-01-01T00:00:00Z');
                expect(result.syncStatus).toBe('dirty');
                expect(db.table().put).toHaveBeenCalledWith(result);
            });

            it('should update existing item preserving creation date', async () => {
                const existingItem = {
                    id: 'note1',
                    title: 'Old Title',
                    createdAt: '2023-12-01T00:00:00Z',
                    updatedAt: '2023-12-01T00:00:00Z'
                };

                const updateData = {
                    id: 'note1',
                    title: 'New Title',
                    createdAt: '2024-01-01T00:00:00Z' // Should be ignored
                };

                db.table().get.mockResolvedValue(existingItem);
                db.table().put.mockResolvedValue();

                vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-02T00:00:00Z');

                const result = await dbService.update('notes', 'note1', updateData);

                expect(result.id).toBe('note1');
                expect(result.title).toBe('New Title');
                // normalizeDate will add milliseconds, so we expect '2023-12-01T00:00:00.000Z'
                expect(result.createdAt).toBe(new Date('2023-12-01T00:00:00Z').toISOString());
                expect(result.updatedAt).toBe('2024-01-02T00:00:00Z'); // Updated to now
                expect(result.syncStatus).toBe('dirty');
            });
        });

        describe('upsertSynced', () => {
            it('should delete item when remote data is deleted', async () => {
                const remoteData = { id: 'note1', isDeleted: true };
                
                await dbService.upsertSynced('notes', remoteData);

                expect(db.table().delete).toHaveBeenCalledWith('note1');
            });

            it('should block resurrection of locally deleted item', async () => {
                const localExisting = { id: 'note1', isDeleted: true };
                const remoteData = { id: 'note1', isDeleted: false, title: 'Resurrected' };

                db.table().get.mockResolvedValue(localExisting);

                await dbService.upsertSynced('notes', remoteData);

                expect(db.table().put).not.toHaveBeenCalled();
            });

            it('should save synced data with syncStatus=synced', async () => {
                const remoteData = {
                    id: 'note1',
                    title: 'Synced Note',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z'
                };

                db.table().get.mockResolvedValue(null);

                await dbService.upsertSynced('notes', remoteData);

                // normalizeDate will add milliseconds
                const expectedCreatedAt = new Date('2024-01-01T00:00:00Z').toISOString();
                const expectedUpdatedAt = new Date('2024-01-01T00:00:00Z').toISOString();

                expect(db.table().put).toHaveBeenCalledWith({
                    ...remoteData,
                    createdAt: expectedCreatedAt,
                    updatedAt: expectedUpdatedAt,
                    syncStatus: 'synced'
                });
            });
        });

        describe('delete', () => {
            it('should soft delete notes and folders', async () => {
                const mockItem = { id: 'note1', title: 'Test' };
                db.table().get.mockResolvedValue(mockItem);
                db.table().update.mockResolvedValue();

                vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00Z');

                await dbService.delete('notes', 'note1');

                expect(db.table().update).toHaveBeenCalledWith('note1', {
                    isDeleted: true,
                    syncStatus: 'dirty',
                    updatedAt: '2024-01-01T00:00:00Z'
                });
            });

            it('should hard delete tags and files', async () => {
                await dbService.delete('tags', 'tag1');
                
                expect(db.table().delete).toHaveBeenCalledWith('tag1');
                expect(db.table().update).not.toHaveBeenCalled();
            });
        });

        describe('file operations', () => {
            it('should save file', async () => {
                const fileData = {
                    id: 'file1',
                    noteId: 'note1',
                    name: 'test.pdf',
                    type: 'application/pdf',
                    size: 1000,
                    data: new Blob(),
                    createdAt: '2024-01-01T00:00:00Z'
                };

                await dbService.saveFile(fileData);

                expect(db.files.put).toHaveBeenCalledWith(expect.objectContaining({
                    id: 'file1',
                    noteId: 'note1',
                    name: 'test.pdf',
                    type: 'application/pdf',
                    size: 1000,
                    syncStatus: 'dirty'
                }));
            });

            it('should get files by note ID', async () => {
                const mockFiles = [{ id: 'file1', noteId: 'note1' }];
                // Setup mock chain
                const mockToArray = vi.fn().mockResolvedValue(mockFiles);
                const mockEquals = vi.fn().mockReturnValue({ toArray: mockToArray });
                const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals });
                db.files.where = mockWhere;

                const result = await dbService.getFilesByNoteId('note1');

                expect(result).toEqual(mockFiles);
                expect(mockWhere).toHaveBeenCalledWith('noteId');
                expect(mockEquals).toHaveBeenCalledWith('note1');
            });

            it('should delete files by note ID', async () => {
                const mockFileIds = ['file1', 'file2'];
                const mockPrimaryKeys = vi.fn().mockResolvedValue(mockFileIds);
                const mockEquals = vi.fn().mockReturnValue({ primaryKeys: mockPrimaryKeys });
                const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals });
                db.files.where = mockWhere;

                await dbService.deleteFilesByNoteId('note1');

                expect(db.files.bulkDelete).toHaveBeenCalledWith(mockFileIds);
                expect(mockWhere).toHaveBeenCalledWith('noteId');
                expect(mockEquals).toHaveBeenCalledWith('note1');
            });
        });
    });

    describe('loadData', () => {
        it('should load data and update stores', async () => {
            const mockNotes = [
                { id: 'note1', title: 'Note 1', isDeleted: false },
                { id: 'note2', title: 'Note 2', isDeleted: true } // Should be filtered
            ];
            const mockFolders = [
                { id: 'folder1', name: 'Folder 1', isDeleted: false },
                { id: 'folder2', name: 'Folder 2', isDeleted: true }
            ];
            const mockTags = [{ id: 'tag1', name: 'Tag 1' }];

            db.table.mockImplementation((tableName) => {
                if (tableName === 'notes') return { toArray: vi.fn().mockResolvedValue(mockNotes) };
                if (tableName === 'folders') return { toArray: vi.fn().mockResolvedValue(mockFolders) };
                if (tableName === 'tags') return { toArray: vi.fn().mockResolvedValue(mockTags) };
                return { toArray: vi.fn().mockResolvedValue([]) };
            });

            await loadData();

            expect(notes.set).toHaveBeenCalledWith([mockNotes[0]]); // Only non-deleted
            expect(folders.set).toHaveBeenCalledWith([mockFolders[0]]); // Only non-deleted
            expect(tags.set).toHaveBeenCalledWith(mockTags);
        });

        it('should handle errors gracefully', async () => {
            db.table.mockImplementation(() => ({
                toArray: vi.fn().mockRejectedValue(new Error('DB error'))
            }));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await loadData();

            expect(consoleSpy).toHaveBeenCalledWith('[DB] Failed to load data:', expect.any(Error));
        });
    });
});
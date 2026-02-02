import { vi } from 'vitest'

// Моки для глобальных объектов
global.window = {
  localStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  },
  indexedDB: {}
}

// Мок для Dexie
vi.mock('dexie', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      version: vi.fn().mockReturnThis(),
      stores: vi.fn().mockReturnThis(),
      open: vi.fn().mockResolvedValue(),
      notes: {
        toArray: vi.fn().mockResolvedValue([]),
        add: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue(1),
        delete: vi.fn().mockResolvedValue(),
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([])
          })
        })
      }
    }))
  }
})

// Мок для uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-uuid-123')
}))

// Мок для $lib/db
vi.mock('$lib/db', () => ({
  db: {},
  dbService: {
    saveFile: vi.fn(),
    getFilesByNoteId: vi.fn(),
    deleteFilesByNoteId: vi.fn(),
    getFile: vi.fn(),
    deleteFile: vi.fn(),
    clearCache: vi.fn(),
    cacheDownloadedFile: vi.fn()
  },
  normalizeDate: vi.fn(),
  loadData: vi.fn()
}))

// Мок для $lib/utils
vi.mock('$lib/utils', () => ({
  platform: 'web'
}))

// Мок для сервисов
vi.mock('$lib/services/noteService', () => ({
  default: {
    createNote: vi.fn(),
    getNotes: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn()
  }
}))

vi.mock('$lib/services/fileService', () => ({
  default: {
    uploadFile: vi.fn(),
    deleteFile: vi.fn()
  }
}))

vi.mock('$lib/services/syncService', () => ({
  default: {
    pushChanges: vi.fn(),
    pullChanges: vi.fn()
  }
}));
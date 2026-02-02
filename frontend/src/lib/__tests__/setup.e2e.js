import { vi } from 'vitest'

// Для E2E тестов используем реальный Dexie
// Не мокаем зависимости, чтобы тестировать реальную работу с IndexedDB

// Полифиллы для IndexedDB в Node.js
if (typeof window === 'undefined') {
  const { IndexedDB } = require('fake-indexeddb')
  const { IDBKeyRange } = require('fake-indexeddb/lib/FDBKeyRange')
  
  global.window = {
    indexedDB: IndexedDB,
    IDBKeyRange: IDBKeyRange
  }
}

// Глобальные переменные для тестов
global.testNotes = []

// Загрузка тестовых данных
beforeAll(async () => {
  try {
    const testData = await import('./test-notes.json')
    global.testNotes = testData.default || testData
  } catch (error) {
    console.warn('Test data not found, using empty array')
    global.testNotes = []
  }
})

// Очистка после каждого теста
afterEach(async () => {
  // Очистка IndexedDB если используется
  if (global.db) {
    try {
      await global.db.delete()
    } catch (error) {
      // Игнорируем ошибки удаления
    }
  }
})
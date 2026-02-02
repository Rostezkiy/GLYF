import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/notes.e2e.test.js'],
    setupFiles: ['./src/lib/__tests__/setup.e2e.js'],
    testTimeout: 10000
  }
})
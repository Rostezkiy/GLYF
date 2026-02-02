import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/lib')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['src/**/notes.e2e.test.js'],
    setupFiles: ['./src/lib/__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/lib/__tests__/',
        '**/*.config.js',
        '**/*.cjs',
        '**/*.mjs'
      ]
    }
  }
})
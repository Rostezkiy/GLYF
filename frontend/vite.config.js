import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Выясняем, собираем ли мы под Tauri
const isTauri = process.env.TAURI_ENV !== undefined;

export default defineConfig({
	plugins: [sveltekit()],

	// 1. Настройки сервера для разработки (Tauri будет подключаться сюда)
	server: {
		port: 1420,
		strictPort: true,
		// Чтобы Tauri мог подключаться к Vite
		host: process.env.TAURI_DEV_HOST || false,
		hmr: process.env.TAURI_DEV_HOST
			? {
					protocol: 'ws',
					host: process.env.TAURI_DEV_HOST,
					port: 1421
			  }
			: undefined,
	},

	// 2. Разрешаем переменные TAURI_ для использования в коде (import.meta.env.TAURI_...)
	envPrefix: ['VITE_', 'TAURI_'],

	// 3. Оптимизация сборки под нативные WebView
	build: {
		// Tauri поддерживает современные браузеры (Chromium на Windows, WebKit на macOS/iOS)
		target: process.env.TAURI_ENV === 'windows' ? 'chrome105' : 'safari13',
		// Не минифицировать для дебаг-сборок (помогает Tauri при поиске ошибок)
		minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
		// Генерировать sourcemap для отладки в продакшене
		sourcemap: !!process.env.TAURI_DEBUG,
	}
});
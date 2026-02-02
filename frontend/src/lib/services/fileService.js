/* src/lib/services/fileService.js */
import { dbService } from '$lib/db';
import { platform } from '$lib/utils';

export const fileService = {
    // --- Database Operations ---

    /**
     * Сохраняет метаданные файла и сам Blob (если есть) в локальную БД.
     */
    async saveFileToDb(fileData) {
        return await dbService.saveFile(fileData);
    },

    /**
     * Получает файл из БД по ID.
     */
    async getFileFromDb(id) {
        return await dbService.getFile(id);
    },

    /**
     * Удаляет файл из БД.
     */
    async deleteFile(id) {
        return await dbService.deleteFile(id);
    },

    /**
     * Кэширует скачанный Blob в БД.
     */
    async cacheDownloadedFile(fileId, blob) {
        return await dbService.cacheDownloadedFile(fileId, blob);
    },

    // --- Device Operations ---

    /**
     * Скачивает/Сохраняет файл на устройство пользователя (Диск/Документы).
     * @param {Blob} blob 
     * @param {string} fileName 
     */
    async downloadFileToDevice(blob, fileName) {
        if (!blob) {
            throw new Error('File data is missing');
        }
        return await platform.saveBlob(blob, fileName);
    },

    /**
     * Прокси для проверки платформы (если нужно в UI)
     */
    get isMobile() {
        return platform.isMobile;
    }
};
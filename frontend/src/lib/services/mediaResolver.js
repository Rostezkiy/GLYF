import { dbService } from '$lib/db';

const memoryCache = new Map();

export async function resolveMediaUrl(fileId) {
    if (!fileId) return null;
    if (typeof fileId !== 'string') return null;
    // Если уже base64
    if (fileId.startsWith('data:') || fileId.startsWith('blob:')) return fileId;

    if (memoryCache.has(fileId)) {
        return memoryCache.get(fileId);
    }

    try {
        const file = await dbService.getFile(fileId);
        let url = null;

        if (file?.thumbnail) {
            url = URL.createObjectURL(file.thumbnail);
        } else if (file?.data) {
            url = URL.createObjectURL(file.data);
        } else if (file?.s3Key) {
            // Динамический импорт для разрыва циклической зависимости
            const { s3Client } = await import('$lib/services/syncService.js');
            url = await s3Client.getViewUrl(file.s3Key);
        }

        if (url) {
            memoryCache.set(fileId, url);
        }
        return url;
    } catch (e) {
        console.error('[MediaResolver] Error:', e);
        return null;
    }
}
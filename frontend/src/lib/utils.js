/* src/lib/utils.js */
import { Capacitor } from '@capacitor/core';

export function formatTimeAgo(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    if (d.getFullYear() < 2000) return '';
    const now = new Date();
    const diff = (now - d) / 1000; // seconds

    if (diff < 60) return 'только что';
    if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} дн. назад`;
    
    return d.toLocaleDateString();
}

// Platform utilities (moved from logic/platform.js)
export const platform = {
    get isMobile() {
        return Capacitor.isNativePlatform();
    },

    async saveBlob(blob, fileName) {
        if (Capacitor.isNativePlatform()) {
            // For mobile, use Filesystem API
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            const base64 = await blobToBase64(blob);
            const result = await Filesystem.writeFile({
                path: fileName,
                data: base64,
                directory: Directory.Documents,
                recursive: true
            });
            return result.uri;
        } else {
            // For web, use download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return `downloaded:${fileName}`;
        }
    }
};

async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
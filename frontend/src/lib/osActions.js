import { Capacitor } from '@capacitor/core';

export async function saveFileToDisk(fileName, blob) {
    // 1. Если мы в мобильном приложении (Capacitor)
    if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const reader = new FileReader();
        return new Promise((resolve) => {
            reader.onload = async () => {
                const base64Data = reader.result.split(',')[1];
                await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Documents
                });
                resolve(true);
            };
            reader.readAsDataURL(blob);
        });
    }

    // 2. Если мы в десктопном приложении (Tauri)
    if (window.__TAURI__) {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeFile } = await import('@tauri-apps/plugin-fs');
        
        // Показываем нативное диалоговое окно "Сохранить как..."
        const filePath = await save({ defaultPath: fileName });
        
        if (filePath) {
            const arrayBuffer = await blob.arrayBuffer();
            await writeFile(filePath, new Uint8Array(arrayBuffer));
            return true;
        }
        return false;
    }

    // 3. Если мы просто в браузере
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}
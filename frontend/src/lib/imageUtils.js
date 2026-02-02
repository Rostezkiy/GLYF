/* src/lib/imageUtils.js */

// Для обложек (возвращает строку Base64)
export async function generateThumbnailDataURL(file, maxWidth = 1280, quality = 0.8) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                let { width, height } = img;

                // Сжимаем, только если больше лимита
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(e.target.result); // Fallback
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Для вложений в БД (возвращает Blob)
export async function generateThumbnailBlob(file, maxWidth = 300, quality = 0.6) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                let { width, height } = img;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
            img.onerror = () => resolve(null);
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Генерация thumbnail для видео (первый кадр)
export async function generateVideoThumbnailBlob(file, maxWidth = 300, quality = 0.6) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            video.src = e.target.result;
            
            video.addEventListener('loadeddata', () => {
                // Устанавливаем текущее время на первый кадр (0 секунд)
                video.currentTime = 0;
            });
            
            video.addEventListener('seeked', () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                let { videoWidth, videoHeight } = video;
                
                if (videoWidth > maxWidth) {
                    videoHeight = Math.round((videoHeight * maxWidth) / videoWidth);
                    videoWidth = maxWidth;
                }
                canvas.width = videoWidth;
                canvas.height = videoHeight;
                ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
                
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            });
            
            video.addEventListener('error', () => {
                resolve(null);
            });
            
            // Запускаем загрузку
            video.load();
        };
        reader.readAsDataURL(file);
    });
}
<!-- src/lib/components/MediaViewer.svelte -->
<svelte:options runes={false} />

<script>
    import { fade, scale } from 'svelte/transition';
    import { mediaViewerItem } from '$lib/services/uiStore';
    import { syncService } from '$lib/services/syncService';
    import { fileService } from '$lib/services/fileService';
    import { dbService } from '$lib/db'; 
    import { onMount } from 'svelte';

    export let item;

    let currentSrc = item.src;
    let currentBlob = item.originalBlob;
    let isDownloading = false;
    let error = null;

    onMount(async () => {
        // 1. Аварийное восстановление метаданных
        // Если открыли из Чата, у нас может быть ID, но не быть S3Key.
        // Ищем запись в локальной БД.
        if (!currentBlob && !item.s3Key && item.id) {
            try {
                const fileRec = await dbService.getFile(item.id);
                if (fileRec && fileRec.s3Key) {
                    item.s3Key = fileRec.s3Key; 
                    item.name = fileRec.name || item.name;
                    item.size = fileRec.size || item.size;
                    console.log('[MediaViewer] S3Key restored from DB:', item.s3Key);
                }
            } catch (e) {
                console.warn('[MediaViewer] Failed to restore meta from DB', e);
            }
        }

        // 2. Если файла нет локально (currentBlob), но есть ключ S3,
        // пробуем скачать автоматически (только для картинок и аудио, чтобы сразу показать)
        if (!currentBlob && item.s3Key && (item.type === 'image' || item.type === 'audio')) {
            downloadAndCache();
        }
    });

    function close() {
        mediaViewerItem.set(null);
    }

    async function downloadAndCache() {
        // Последняя проверка: если ключа нет, пробуем найти в БД еще раз
        if (!item.s3Key) {
            try {
                const rec = await dbService.getFile(item.id);
                if (rec?.s3Key) item.s3Key = rec.s3Key;
            } catch {}
        }

        if (!item.s3Key) { 
            error = 'Ошибка: Файл не найден в облаке (S3 Key is missing). Попробуйте синхронизировать приложение.'; 
            return; 
        }

        isDownloading = true;
        error = null;
        try {
            // Вызываем метод, который мы только что добавили в syncService.js
            const blob = await syncService.downloadFileFromS3({ s3Key: item.s3Key });
            
            // Сохраняем скачанный файл в локальный кэш (IndexedDB)
            await fileService.cacheDownloadedFile(item.id, blob);
            
            currentBlob = blob;
            currentSrc = URL.createObjectURL(blob);
        } catch (e) {
            console.error('Download error:', e);
            error = 'Не удалось скачать файл: ' + (e.message || 'Ошибка сети');
        } finally {
            isDownloading = false;
        }
    }

    async function saveToDevice() {
        // Если файла еще нет (только в облаке), сначала скачиваем
        if (!currentBlob) { 
            if (item.s3Key) {
                await downloadAndCache();
                if (!currentBlob) return; // Если скачивание не удалось
            } else {
                alert('Сначала нужно скачать файл.'); 
                return; 
            }
        }
        
        try {
            await fileService.downloadFileToDevice(currentBlob, item.name);
            if (fileService.isMobile) {
                alert('Файл сохранен в Документы');
            }
        } catch (e) {
            alert('Ошибка сохранения: ' + e.message);
        }
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div class="ui-media-overlay"
    transition:fade={{duration: 150}} 
    on:click|self={close} 
    on:keydown={(e) => e.key === 'Escape' && close()} 
    role="dialog" aria-modal="true" tabindex="-1">
    
    <button class="ui-media-close-btn"
        on:click={close} aria-label="Закрыть">
        <i class="fa-solid fa-xmark text-xl"></i>
    </button>

    <div class="relative max-w-full max-h-full flex flex-col items-center" 
         transition:scale={{start: 0.95, duration: 200}}>
        
        {#if !currentBlob}
            <!-- Download Prompt -->
            <div class="ui-media-dialog">
                <div class="w-24 h-24 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400 mx-auto">
                    <i class="fa-solid fa-cloud-arrow-down text-4xl"></i>
                </div>
                <div class="mt-4">
                    <h3 class="font-bold text-neutral-800 text-lg mb-1 truncate max-w-[250px]">{item.name}</h3>
                    <p class="text-sm text-neutral-500">Файл в облаке ({item.size ? (item.size/1024/1024).toFixed(1) : '?'} MB)</p>
                    {#if error} <p class="text-xs text-red-500 mt-2">{error}</p> {/if}
                </div>
                <button class="ui-btn-primary mt-6 w-full" on:click={downloadAndCache} disabled={isDownloading}>
                    <i class="fa-solid mr-2" class:fa-spinner={isDownloading} class:fa-spin={isDownloading} class:fa-download={!isDownloading}></i>
                    {isDownloading ? 'Скачивание...' : 'Скачать и просмотреть'}
                </button>
            </div>
        {:else}
            <!-- Content Display -->
            {#if item.type === 'image'}
                <img src={currentSrc} alt={item.name} class="ui-media-content-img">
            {:else if item.type === 'video'}
                <video src={currentSrc} controls autoplay class="ui-media-content-video">
                    <track kind="captions" label="Russian" src="" srclang="ru" default>
                </video>
            {:else if item.type === 'audio'}
                <div class="ui-media-dialog">
                    <div class="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-500 mb-4 mx-auto"> 
                        <i class="fa-solid fa-music text-3xl"></i> 
                    </div>
                    <div class="text-center mb-4">
                        <div class="font-bold text-neutral-800 truncate max-w-[250px]">{item.name}</div>
                        <div class="text-xs text-neutral-500">Аудиозапись</div>
                    </div>
                    <audio src={currentSrc} controls class="w-full"></audio>
                </div>
            {:else}
                <!-- Doc Save -->
                <div class="ui-media-dialog">
                    <div class="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-500 mb-4 mx-auto">
                        <i class="fa-solid fa-file-circle-check text-4xl"></i>
                    </div>
                    <div class="text-center">
                        <div class="font-bold text-neutral-800 break-all mb-1">{item.name}</div>
                        <div class="text-sm text-neutral-500 mb-6">Файл готов к сохранению</div>
                    </div>
                    <button class="ui-btn-primary w-full !bg-green-600 hover:!bg-green-700"
                        on:click={saveToDevice}>
                        <i class="fa-solid fa-file-export mr-2"></i> Сохранить на устройство
                    </button>
                </div>
            {/if}
        {/if}
    </div>
</div>
<!-- src/lib/components/AttachmentPreview.svelte -->
<script>
    import { createEventDispatcher, onDestroy } from 'svelte';
    import { dbService } from '$lib/db';
    import { syncService } from '$lib/services/syncService';

    export let attachment;

    const dispatch = createEventDispatcher();
    
    let src = null;
    let isLoading = true;
    let isCloud = false;
    let lastId = null;

    $: isImage = attachment.type?.startsWith('image/');
    $: isVideo = attachment.type?.startsWith('video/');
    $: isAudio = attachment.type?.startsWith('audio/');

    $: if (attachment?.id && (attachment.id !== lastId || !src)) {
        if (src && !isCloud) {
             // already loaded local
        } else {
            loadPreview();
        }
    }

    async function loadPreview() {
        if (!isImage && !isVideo) {
            isLoading = false;
            return;
        }

        if (lastId === attachment.id && src && !isCloud) return;

        isLoading = true;
        lastId = attachment.id;

        try {
            const fileRecord = await dbService.getFile(attachment.id);
            
            // Для видео игнорируем thumbnail, чтобы использовать оригинальный файл для элемента video
            if (fileRecord?.thumbnail && !attachment.type?.startsWith('video/')) {
                if (src) URL.revokeObjectURL(src);
                src = URL.createObjectURL(fileRecord.thumbnail);
                isCloud = false;
            } else if (fileRecord?.data) {
                if (src) URL.revokeObjectURL(src);
                src = URL.createObjectURL(new Blob([fileRecord.data], { type: attachment.type }));
                isCloud = false;
            } else {
                const s3Key = fileRecord?.s3Key || attachment.s3Key;
                if (s3Key) {
                    isCloud = true;
                    const { s3Client } = await import('$lib/services/syncService.js');
                    src = await s3Client.getViewUrl(s3Key);
                }
            }
        } catch (e) {
            console.error("Preview load error:", e);
        } finally {
            isLoading = false;
        }
    }

    onDestroy(() => {
        if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
    });

    function formatSize(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
    }

    function getDocIcon() {
        const type = attachment.type || '';
        if (type.includes('pdf')) return 'fa-file-pdf text-red-500';
        if (type.includes('zip') || type.includes('rar')) return 'fa-file-zipper text-yellow-600';
        if (type.includes('word') || type.includes('officedocument')) return 'fa-file-word text-blue-600';
        return 'fa-file-lines text-neutral-400';
    }
</script>

<div class="ui-attachment-card group"
    on:click={() => dispatch('click', attachment)}
    role="button"
    tabindex="0"
    on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && dispatch('click', attachment)}>

    <!-- Кнопка удаления -->
    <button class="ui-attachment-delete-btn"
        on:click|stopPropagation={() => dispatch('remove', attachment.id)} aria-label="Удалить">
        <i class="fa-solid fa-xmark text-[10px]"></i>
    </button>
    
    {#if isLoading && !src}
        <div class="flex flex-col items-center gap-2">
            <i class="fa-solid fa-spinner fa-spin text-primary-400"></i>
        </div>
    {:else if (isImage || isVideo) && src}
        <div class="w-full h-full relative">
            {#if isVideo}
                <video {src} class="ui-attachment-media" preload="metadata">
                    <track kind="captions" src="" label="Нет субтитров" default>
                </video>
                <div class="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <i class="fa-solid fa-play text-white text-xl drop-shadow-md"></i>
                </div>
            {:else}
                <img {src} alt={attachment.name} class="ui-attachment-media" crossorigin="anonymous" />
            {/if}
            
            {#if isCloud}
                <div class="ui-attachment-badge-cloud">
                    <i class="fa-solid fa-cloud mr-0.5"></i> В ОБЛАКЕ
                </div>
            {/if}
        </div>
    {:else}
        <!-- Placeholder -->
        <div class="ui-attachment-placeholder">
            <i class="fa-solid text-3xl mb-2 {isLoading ? 'animate-pulse' : ''} {isAudio ? 'fa-music text-primary-500' : getDocIcon()}"></i>
            <p class="text-[10px] font-semibold text-neutral-700 truncate w-full px-1 text-center">{attachment.name}</p>
            <p class="text-[9px] text-neutral-400 mt-0.5 uppercase">{formatSize(attachment.size)}</p>
            
            {#if !src && (isImage || isVideo)}
                <div class="mt-2 text-[7px] text-primary-400 font-bold flex items-center gap-1">
                    <i class="fa-solid fa-circle-notch fa-spin"></i> ПОИСК В ОБЛАКЕ...
                </div>
            {/if}
        </div>
    {/if}
</div>
<!-- src/lib/components/ChatBubble.svelte -->
<svelte:options runes={false} />

<script>
    import { createEventDispatcher, onMount, onDestroy } from 'svelte';
    import { tags } from '$lib/services/tagService';
    import { mediaViewerItem, uiState } from '$lib/services/uiStore';
    import { dbService } from '$lib/db';

    export let note;
    export let isDragging = false;

    const dispatch = createEventDispatcher();
    let imageUrls = {}; // Здесь храним ТОЛЬКО миниатюры для превью в чате

    // --- Логика определения контента ---
    $: visualAttachments = note.attachments?.filter(a => a.type?.startsWith('image/') || a.type?.startsWith('video/')) || [];
    $: hasVisual = visualAttachments.length > 0;
    $: hasManualCover = !!note.coverImage;
    $: showHeroImage = !note.title && (!note.content || note.content.replace(/<[^>]*>/g, '').trim() === '') && (hasManualCover || hasVisual);

    onMount(() => {
        loadThumbnails();
    });

    onDestroy(() => {
        Object.values(imageUrls).forEach(url => {
            if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
        });
    });

    // Получаем именно миниатюру для списка
    async function getThumbnailUrl(id) {
        if (!id) return null;
        if (imageUrls[id]) return imageUrls[id];

        try {
            const fileRecord = await dbService.getFile(id);
            // Приоритет: Thumbnail -> Data -> S3
            if (fileRecord?.thumbnail) {
                return URL.createObjectURL(fileRecord.thumbnail);
            } else if (fileRecord?.data) {
                // Если нет отдельного thumbnail, берем оригинал (но для списка это тяжело, зато точно покажет)
                return URL.createObjectURL(fileRecord.data);
            } else if (fileRecord?.s3Key) {
                const { s3Client } = await import('$lib/services/syncService.js');
                return await s3Client.getViewUrl(fileRecord.s3Key);
            }
        } catch (e) {
            console.error("Error resolving thumbnail for ID:", id, e);
        }
        return null;
    }

    async function loadThumbnails() {
        let hasChanged = false;

        const loadIds = [];
        if (note.coverImage) loadIds.push(note.coverImage);
        if (note.attachments) {
            note.attachments.forEach(att => {
                if (att.type.startsWith('image/') || att.type.startsWith('video/')) {
                    loadIds.push(att.id);
                }
            });
        }

        for (const id of loadIds) {
            const url = await getThumbnailUrl(id);
            if (url && imageUrls[id] !== url) {
                imageUrls[id] = url;
                hasChanged = true;
            }
        }

        if (hasChanged) imageUrls = { ...imageUrls };
    }

    function handleClick() {
        if (isDragging) return;
        uiState.update(s => ({ ...s, editorNoteId: note.id }));
    }

    // --- ИСПРАВЛЕННАЯ ФУНКЦИЯ ОТКРЫТИЯ ---
    async function openMedia(attOrId) {
        try {
            const fileId = typeof attOrId === 'string' ? attOrId : attOrId.id;
            
            // 1. Достаем полную запись
            let fileRec = await dbService.getFile(fileId);
            if (!fileRec && typeof attOrId === 'object') fileRec = { ...attOrId };
            if (!fileRec) return;

            let viewerSrc = null;

            // 2. Логика высокого качества:
            if (fileRec.data) {
                // Если есть локальный ОРИГИНАЛ (data), создаем Blob URL из него
                // (Игнорируем thumbnail, даже если он есть)
                viewerSrc = URL.createObjectURL(fileRec.data);
            } else if (fileRec.s3Key) {
                // Если локально нет, берем ссылку на полный файл из S3
                const { s3Client } = await import('$lib/services/syncService.js');
                viewerSrc = await s3Client.getViewUrl(fileRec.s3Key);
            } else if (imageUrls[fileId]) {
                // Крайний случай: если нет оригинала, но есть загруженная миниатюра, показываем её
                viewerSrc = imageUrls[fileId];
            }

            // 3. Открываем просмотрщик с качественной ссылкой
            mediaViewerItem.set({
                id: fileRec.id,
                type: (fileRec.type || 'application/octet-stream').split('/')[0],
                src: viewerSrc, // Сюда теперь попадает HD версия
                name: fileRec.name || 'Файл',
                originalBlob: fileRec.data, 
                size: fileRec.size,
                s3Key: fileRec.s3Key
            });
        } catch (e) {
            console.error('Error opening media in chat:', e);
        }
    }

    const colorClasses = {
        default: 'chat-default', red: 'chat-red', orange: 'chat-orange',
        yellow: 'chat-yellow', green: 'chat-green', blue: 'chat-blue',
        purple: 'chat-purple', pink: 'chat-pink'
    };
</script>

<div 
    class="ui-chat-wrapper"
    class:opacity-40={isDragging}
>
    <div 
        class="ui-chat-bubble {colorClasses[note.color] || 'chat-default'}"
        role="button"
        tabindex="0"
        on:click={handleClick}
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick()}
        on:contextmenu|preventDefault={(e) => {
            if (isDragging) return;
            const isTouch = e.pointerType === 'touch';
            if (!isTouch) dispatch('contextmenu', {x: e.clientX, y: e.clientY, note, source: 'mouse'});
        }}
    >
        <!-- 1. HERO IMAGE (Миниатюры из imageUrls) -->
        {#if hasManualCover}
            <div class="ui-chat-cover cursor-pointer" on:click|stopPropagation={() => openMedia(note.coverImage)} role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openMedia(note.coverImage)}>
                {#if imageUrls[note.coverImage]}
                    <img src={imageUrls[note.coverImage]} alt="" class="w-full h-auto max-h-80 object-cover rounded-lg mb-1">
                {:else}
                    <div class="w-full h-40 bg-neutral-100 animate-pulse rounded-lg mb-1 flex items-center justify-center"><span class="text-neutral-400">...</span></div>
                {/if}
            </div>
        {:else if showHeroImage && hasVisual}
            <div class="ui-chat-cover cursor-pointer" on:click|stopPropagation={() => openMedia(visualAttachments[0])} role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openMedia(visualAttachments[0])}>
                {#if imageUrls[visualAttachments[0].id]}
                    <img src={imageUrls[visualAttachments[0].id]} alt="" class="w-full h-full object-cover">
                    {#if visualAttachments[0].type.startsWith('video/')}
                        <div class="absolute inset-0 flex items-center justify-center bg-black/20"><i class="fa-solid fa-play text-white text-2xl opacity-80"></i></div>
                    {/if}
                {:else}
                    <div class="w-full h-32 bg-neutral-100 animate-pulse flex items-center justify-center"><i class="fa-solid fa-image text-neutral-300 text-2xl"></i></div>
                {/if}
            </div>
        {/if}

        {#if note.title}<div class="ui-chat-title">{note.title}</div>{/if}
        {#if note.content && note.content !== '<p></p>'}<div class="ui-chat-content">{@html note.content}</div>{/if}

        <!-- 2. ATTACHMENTS (Миниатюры из imageUrls) -->
        {#if note.attachments?.length > 0}
            {@const displayAttachments = showHeroImage ? note.attachments.slice(1) : note.attachments}
            
            {#if displayAttachments.length > 0}
                <div class="ui-chat-media-wrapper" class:has-content={note.content || note.title}>
                    {#each displayAttachments as att}
                        {#if att.type.startsWith('image/') || att.type.startsWith('video/')}
                            <div class="ui-chat-media-item" on:click|stopPropagation={() => openMedia(att)} role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openMedia(att)}>
                                {#if imageUrls[att.id]}
                                    <img src={imageUrls[att.id]} alt="" class="w-full h-full object-cover">
                                    {#if att.type.startsWith('video/')}
                                        <div class="absolute inset-0 flex items-center justify-center bg-black/10"><i class="fa-solid fa-play text-white opacity-80"></i></div>
                                    {/if}
                                {:else}
                                    <div class="p-8 text-neutral-400"><i class="fa-solid fa-spinner animate-spin"></i></div>
                                {/if}
                            </div>
                        {:else if att.type.startsWith('audio/')}
                            <div class="ui-chat-audio-item" on:click|stopPropagation={() => openMedia(att)} role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openMedia(att)}>
                                <i class="fa-solid fa-play-circle text-lg"></i>
                                <div class="flex-1 text-xs truncate">{att.name}</div>
                            </div>
                        {:else}
                            <div class="ui-chat-file-item" on:click|stopPropagation={() => openMedia(att)} role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openMedia(att)}>
                                <i class="fa-solid fa-file text-neutral-400"></i>
                                <span class="truncate flex-1">{att.name}</span>
                                <span class="opacity-50">{(att.size / 1024).toFixed(0)} KB</span>
                            </div>
                        {/if}
                    {/each}
                </div>
            {/if}
        {/if}

        <div class="ui-chat-footer">
            <div class="flex flex-wrap gap-1">
                {#if note.tags && note.tags.length}
                    {#each note.tags.slice(0, 3) as tId}
                        {@const tag = $tags.find(t => t.id === tId)}
                        {#if tag}<span class="text-[9px] font-bold text-primary-600/70 uppercase">#{tag.name}</span>{/if}
                    {/each}
                {/if}
            </div>
            <div class="ui-chat-time">
                {#if note.isPinned}<i class="fa-solid fa-thumbtack text-[8px]"></i>{/if}
                {new Date(note.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
        </div>
    </div>
</div>
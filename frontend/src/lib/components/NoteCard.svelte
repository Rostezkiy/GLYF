<svelte:options runes={false} />
<script>
    import { createEventDispatcher, onMount } from 'svelte';
    import { tags } from '$lib/services/tagService';
    import { longpress } from '$lib/actions';
    import { formatTimeAgo } from '$lib/utils';
    import { resolveMediaUrl } from '$lib/services/mediaResolver';
    
    export let note;
    export let mode = 'masonry';
    
    const dispatch = createEventDispatcher();
    let coverUrl = null;

    // Реактивно определяем, есть ли медиа для обложки
    $: hasManualCover = !!note.coverImage;
    $: visualAttachments = note.attachments?.filter(a => a.type?.startsWith('image/') || a.type?.startsWith('video/')) || [];
    $: hasVisual = visualAttachments.length > 0;
    
    // Если пустой текст, делаем карточку фото-типа
    $: isEmptyText = !note.title && (!note.content || note.content.replace(/<[^>]*>/g, '').trim() === '');
    $: isPhotoCard = isEmptyText && (hasManualCover || hasVisual);

    // Логика загрузки URL через новый сервис
    $: loadCover(note);

    async function loadCover(n) {
        coverUrl = null;
        if (n.coverImage) {
            coverUrl = await resolveMediaUrl(n.coverImage);
        } else if (hasVisual) {
            // Берем первое вложение как обложку
            coverUrl = await resolveMediaUrl(visualAttachments[0].id);
        }
    }

    // --- Events ---
    function handleClick() { dispatch('click', note); }
    
    function handleLongPress(e) {
        const pos = e.detail.originalEvent.touches ? e.detail.originalEvent.touches[0] : e.detail.originalEvent;
        dispatch('contextmenu', { x: pos.clientX, y: pos.clientY, note, source: 'touch' });
    }

    const colors = {
        default: 'note-default', red: 'note-red', orange: 'note-orange', 
        yellow: 'note-yellow', green: 'note-green', blue: 'note-blue', 
        purple: 'note-purple', pink: 'note-pink',
    };
</script>

<div 
    role="button" 
    tabindex="0"
    class="ui-note-card group {colors[note.color] || 'note-default'}"
    class:is-masonry={mode === 'masonry'}
    class:is-list={mode === 'list'}
    class:is-photo-card={isPhotoCard && mode === 'masonry'}
    use:longpress
    on:longpress={handleLongPress}
    on:click={handleClick}
    on:keydown={(e) => (e.key === 'Enter') && handleClick()}
    on:contextmenu|preventDefault={(e) => {
        if (e.pointerType !== 'touch') {
            dispatch('contextmenu', {x: e.clientX, y: e.clientY, note, source: 'mouse'});
        }
    }}
>
    {#if note.isPinned}
        <div class="ui-note-pin"><i class="fa-solid fa-thumbtack text-[10px]"></i></div>
    {/if}

    {#if coverUrl}
        <div class={mode === 'masonry' ? 'ui-note-cover-masonry' : 'ui-note-cover-list'}>
            <img src={coverUrl} alt="" class="w-full h-full object-cover transition-opacity duration-300"/>
            {#if !hasManualCover && visualAttachments[0]?.type.startsWith('video/')}
                <div class="absolute inset-0 flex items-center justify-center bg-black/10">
                    <i class="fa-solid fa-play text-white text-xs shadow-sm"></i>
                </div>
            {/if}
        </div>
    {/if}

    <div class="ui-note-body">
        <div class="ui-note-actions">
            <button class="ui-note-action-btn" on:click|stopPropagation={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                dispatch('contextmenu', {x: rect.left, y: rect.bottom, note, source: 'mouse'});
            }}>
                <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
        </div>

        {#if note.title}
            <h4 class="ui-note-title">{note.title}</h4>
        {/if}

        {#if note.content && note.content !== '<p></p>'}
            <div class="ui-note-content" style={mode === 'masonry' ? 'max-height: 200px;' : ''}>
                <div class:line-clamp-2={mode === 'list' && note.title} class:line-clamp-4={mode === 'list' && !note.title}>
                    {@html note.content}
                </div>
            </div>
        {/if}

        {#if note.attachments?.length > 0 && !isPhotoCard}
            <div class="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-neutral-400">
                <i class="fa-solid fa-paperclip"></i>
                {note.attachments.length}
            </div>
        {/if}

        <div class="ui-note-tags-container">
            <div class="flex flex-wrap gap-1 overflow-hidden h-4">
                {#if note.tags}
                    {#each note.tags.slice(0, mode === 'list' ? 4 : 2) as tId}
                        {@const tag = $tags.find(t => t.id === tId)}
                        {#if tag} <span class="ui-note-tag">#{tag.name}</span> {/if}
                    {/each}
                {/if}
            </div>
            <span class="text-[9px] text-neutral-400 whitespace-nowrap">{formatTimeAgo(note.updatedAt)}</span>
        </div>
    </div>
</div>
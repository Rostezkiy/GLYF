<svelte:options runes={false} />
<script>
    import { createEventDispatcher } from 'svelte';
    import NoteCard from '../NoteCard.svelte';
    import { uiState } from '$lib/services/uiStore';

    export let notes = [];
    const dispatch = createEventDispatcher();

    // Разделяем заметки, только если мы в режиме "Все" или "Закрепленные"
    $: showSections = $uiState.view === 'all' || $uiState.view === 'pinned';
    $: pinnedNotes = showSections ? notes.filter(n => n.isPinned) : [];
    $: otherNotes = showSections ? notes.filter(n => !n.isPinned) : notes;
</script>

<div class="p-4 pb-24">
    {#if pinnedNotes.length > 0}
        <h3 class="font-bold text-neutral-400 text-xs uppercase tracking-wider mb-3 ml-1">Закреплённые</h3>
        <div class="masonry-grid mb-8">
            {#each pinnedNotes as note (note.id)}
                <div class="break-inside-avoid mb-4">
                    <NoteCard 
                        {note} 
                        mode="masonry"
                        on:click={() => dispatch('noteClick', note)}
                        on:contextmenu={(e) => dispatch('contextmenu', e.detail)}
                    />
                </div>
            {/each}
        </div>
        
        {#if otherNotes.length > 0}
            <h3 class="font-bold text-neutral-400 text-xs uppercase tracking-wider mb-3 ml-1">Другие</h3>
        {/if}
    {/if}

    <div class="masonry-grid">
        {#each otherNotes as note (note.id)}
            <div class="break-inside-avoid mb-4">
                <NoteCard 
                    {note} 
                    mode="masonry"
                    on:click={() => dispatch('noteClick', note)}
                    on:contextmenu={(e) => dispatch('contextmenu', e.detail)}
                />
            </div>
        {/each}
    </div>
    
    {#if notes.length === 0}
        <div class="text-center text-neutral-400 mt-20">
            <p>Здесь пока пусто</p>
        </div>
    {/if}
</div>
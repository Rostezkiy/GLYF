<svelte:options runes={false} />
<script>
    import { createEventDispatcher } from 'svelte';
    import NoteCard from '../NoteCard.svelte';
    import { uiState } from '$lib/services/uiStore';

    export let notes = [];
    const dispatch = createEventDispatcher();

    $: showSections = $uiState.view === 'all' || $uiState.view === 'pinned';
    $: pinnedNotes = showSections ? notes.filter(n => n.isPinned) : [];
    $: otherNotes = showSections ? notes.filter(n => !n.isPinned) : notes;
</script>

<div class="flex flex-col gap-2 p-2 pb-24 max-w-4xl mx-auto w-full">
    {#if pinnedNotes.length > 0}
        <h3 class="font-bold text-neutral-400 text-xs uppercase tracking-wider mt-2 mb-1 px-2">Закреплённые</h3>
        {#each pinnedNotes as note (note.id)}
            <NoteCard 
                {note} 
                mode="list"
                on:click={() => dispatch('noteClick', note)}
                on:contextmenu={(e) => dispatch('contextmenu', e.detail)}
            />
        {/each}
        
        {#if otherNotes.length > 0}
            <h3 class="font-bold text-neutral-400 text-xs uppercase tracking-wider mt-4 mb-1 px-2">Другие</h3>
        {/if}
    {/if}

    {#each otherNotes as note (note.id)}
        <NoteCard 
            {note} 
            mode="list"
            on:click={() => dispatch('noteClick', note)}
            on:contextmenu={(e) => dispatch('contextmenu', e.detail)}
        />
    {/each}

    {#if notes.length === 0}
        <div class="text-center text-neutral-400 mt-20">
            <p>Нет заметок</p>
        </div>
    {/if}
</div>
<!-- src/lib/components/TagPicker.svelte -->
<svelte:options runes={false} />

<script>
    import { createEventDispatcher } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    import { createTag } from '$lib/services/tagService';

    export let tags = [];
    export let selectedTags = [];
    
    const dispatch = createEventDispatcher();
    let searchQuery = '';
    let inputEl;

    $: filteredTags = tags.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

    function toggle(id) {
        dispatch('toggle', id);
    }

    async function createNew() {
        if (!searchQuery.trim()) return;
        const newTag = await createTag(searchQuery.trim());
        dispatch('toggle', newTag.id);
        searchQuery = '';
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div class="ui-backdrop flex items-end sm:items-center justify-center" 
    role="dialog" tabindex="-1"
    on:click|self={() => dispatch('close')} transition:fade>
    
    <div class="ui-picker-window" transition:fly={{y:100}}>
        <div class="ui-picker-header">
            <h3 class="ui-picker-title">Управление тегами</h3>
            <button aria-label="Закрыть" class="ui-picker-close-btn" on:click={() => dispatch('close')}>
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        
        <div class="ui-picker-search-container">
            <div class="ui-picker-search-bar">
                <i class="fa-solid fa-search text-neutral-400"></i>
                <input 
                    bind:this={inputEl}
                    type="text" 
                    placeholder="Поиск или создание..." 
                    class="ui-picker-input"
                    bind:value={searchQuery}
                />
            </div>
        </div>

        <div class="ui-picker-list">
            {#if searchQuery && !filteredTags.find(t => t.name.toLowerCase() === searchQuery.toLowerCase())}
                <button class="ui-picker-create-btn" on:click={createNew}>
                    <i class="fa-solid fa-plus w-6 text-center"></i>
                    <span>Создать "{searchQuery}"</span>
                </button>
            {/if}

            {#each filteredTags as tag}
               {@const isSelected = selectedTags.includes(tag.id)}
               <button 
                  class="ui-picker-item"
                  class:is-selected={isSelected}
                  on:click={() => toggle(tag.id)}>
                   <div class="flex items-center gap-3">
                       <i class="fa-solid fa-tag w-6 text-center opacity-60"></i>
                       <span>{tag.name}</span>
                   </div>
                   {#if isSelected}
                        <i class="fa-solid fa-check text-primary-600"></i>
                   {/if}
               </button>
            {/each}
            
            {#if filteredTags.length === 0 && !searchQuery}
                <div class="text-center text-neutral-400 py-10">
                    Нет тегов
                </div>
            {/if}
        </div>
    </div>
</div>
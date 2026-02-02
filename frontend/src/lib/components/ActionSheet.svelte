<!-- src/lib/components/ActionSheet.svelte -->
<script>
    import { createEventDispatcher } from 'svelte';
    import { fly, fade } from 'svelte/transition';

    export let title = '';
    export let items = []; // { label, icon, action, danger }

    const dispatch = createEventDispatcher();
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div class="ui-backdrop ui-sheet-container"
     role="dialog" tabindex="-1"
     on:click|self={() => dispatch('close')}
     transition:fade={{duration: 150}}>
    
    <div class="ui-sheet"
         transition:fly={{y: 300, duration: 250, opacity: 1}}>
        
        <!-- Drag Handle / Header -->
        <div class="ui-sheet-header"
             role="presentation"
             on:click|stopPropagation>
            <div class="ui-sheet-handle"></div>
            {#if title}
                <h3 class="ui-sheet-title">{title}</h3>
            {/if}
            <button aria-label="Закрыть" class="ui-sheet-close-btn" on:click={() => dispatch('close')}>
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div class="ui-sheet-body">
            {#each items as item}
                <button class="ui-sheet-item"
                        class:is-danger={item.danger}
                        on:click={() => dispatch('select', item.action)}>
                    <div class="ui-sheet-icon">
                        <!-- ДОБАВЛЕН fa-solid -->
                        {#if item.icon}<i class="fa-solid {item.icon}"></i>{/if}
                    </div>
                    <span>{item.label}</span>
                </button>
            {/each}
        </div>
        
        <!-- Safe area for mobile bottom -->
        <div class="h-[env(safe-area-inset-bottom)] bg-surface shrink-0"></div>
    </div>
</div>
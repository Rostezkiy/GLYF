<!-- src/lib/components/ContextMenu.svelte -->
<script>
    import { createEventDispatcher, onMount } from 'svelte';
    import { scale } from 'svelte/transition';

    export let x = 0;
    export let y = 0;
    export let items = [];

    const dispatch = createEventDispatcher();
    let menuEl;
    let finalX = x;
    let finalY = y;

    onMount(() => {
        if (menuEl) {
            const rect = menuEl.getBoundingClientRect();
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            if (x + rect.width > winWidth) {
                finalX = x - rect.width;
            }
            if (y + rect.height > winHeight) {
                finalY = y - rect.height;
            }
        }
    });
</script>

<div 
    role="button"
    tabindex="-1"
    class="ui-backdrop-transparent" 
    on:click|self={() => dispatch('close')}
    on:contextmenu|preventDefault={() => dispatch('close')}
    on:keydown={(e) => e.key === 'Escape' && dispatch('close')}
>
    <div 
        bind:this={menuEl}
        role="menu"
        tabindex="-1"
        class="ui-context-menu"
        style="top: {finalY}px; left: {finalX}px;"
        transition:scale={{duration: 100, start: 0.95}}
    >
        {#each items as item}
            <button 
                role="menuitem"
                class="ui-menu-item"
                class:is-danger={item.danger}
                on:click={() => dispatch('select', item.action)}
            >
                <div class="ui-menu-icon">
                    <!-- ДОБАВЛЕН fa-solid -->
                    {#if item.icon}<i class="fa-solid {item.icon}"></i>{/if}
                </div>
                <span>{item.label}</span>
            </button>
        {/each}
    </div>
</div>
<!-- src/lib/components/PickerModal.svelte -->
<script>
    import { createEventDispatcher } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    export let title = 'Выберите папку';
    export let items = []; // Folders list
    export let excludeId = null; 
    
    const dispatch = createEventDispatcher();

    function isDescendant(parent, childId) {
        if (!parent.children) return false;
        for (let child of parent.children) {
            if (child.id === childId) return true;
            if (isDescendant(child, childId)) return true;
        }
        return false;
    }

    $: tree = (() => {
        const map = {};
        const roots = [];
        items.forEach(item => map[item.id] = { ...item, children: [] });
        items.forEach(item => {
            if (item.parentId && map[item.parentId]) map[item.parentId].children.push(map[item.id]);
            else roots.push(map[item.id]);
        });
        return roots;
    })();

    function flatten(nodes, level=0) {
        let res = [];
        nodes.forEach(node => {
            res.push({...node, level});
            if(node.children.length) res = [...res, ...flatten(node.children, level+1)];
        });
        return res;
    }

    $: flatList = flatten(tree);

    function canSelect(folder) {
        if (!excludeId) return true;
        if (folder.id === excludeId) return false;
        let curr = items.find(i => i.id === folder.id);
        while(curr && curr.parentId) {
            if(curr.parentId === excludeId) return false;
            curr = items.find(i => i.id === curr.parentId);
        }
        return true;
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div class="ui-backdrop flex items-end sm:items-center justify-center" 
    role="button" tabindex="0"
    on:keydown={(e) => e.key === 'Escape' && dispatch('cancel')}
    on:click|self={() => dispatch('cancel')} transition:fade>
    
    <div class="ui-picker-window" transition:fly={{y:100}}>
        <div class="ui-picker-header">
            <h3 class="ui-picker-title">{title}</h3>
            <button aria-label="Закрыть" class="ui-picker-close-btn" on:click={() => dispatch('cancel')}>
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        
        <div class="ui-picker-list">
            <!-- Root Option -->
            <button class="ui-picker-item hover:bg-neutral-50 text-neutral-600 font-medium"
               on:click={() => dispatch('select', null)}>
               <div class="w-6 text-center"><i class="fa-solid fa-house text-neutral-400"></i></div>
               Корень (Без папки)
            </button>
            <div class="h-px bg-neutral-100 my-2 mx-3"></div>
            
            {#each flatList as item}
               {@const disabled = !canSelect(item)}
               <button 
                  disabled={disabled}
                  class="ui-picker-item"
                  style="padding-left: {(item.level * 20) + 12}px"
                  on:click={() => !disabled && dispatch('select', item.id)}>
                   <div class="w-6 text-center"><i class="fa-regular fa-folder text-primary-400"></i></div>
                   <span class="truncate">{item.name}</span>
               </button>
            {/each}
            
            {#if items.length === 0}
                <div class="text-center text-neutral-400 py-10">
                    Нет других папок
                </div>
            {/if}
        </div>
    </div>
</div>
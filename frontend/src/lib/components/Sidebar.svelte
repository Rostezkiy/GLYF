<!-- src/lib/components/Sidebar.svelte -->
<svelte:options runes={false} />

<script>
    import { createEventDispatcher } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    import { uiState } from '$lib/services/uiStore';
    import { folders, createFolder, deleteFolder, dndHandler } from '$lib/services/folderService';
    import { tags } from '$lib/services/tagService';
    import { notes } from '$lib/services/noteService';
    import { longpress } from '$lib/actions';

    const dispatch = createEventDispatcher();
    
    let expandedFolders = {};
    let draggedItem = null;
    let dropTargetId = null;
    let displayTree = [];

    let dragStartX = 0;
    let dragStartY = 0;
    let isDragging = false;

    // Reactive tree builder (View Logic)
    $: {
        const map = {};
        const roots = [];
        // Map folders
        $folders.forEach(f => { map[f.id] = { ...f, type: 'folder', children: [] }; });
        // Build hierarchy
        $folders.forEach(f => {
            if (f.parentId && map[f.parentId]) map[f.parentId].children.push(map[f.id]);
            else roots.push(map[f.id]);
        });
        // Add notes to folders
        $notes.forEach(n => {
            if (!n.isDeleted && !n.isArchived && n.folderId && map[n.folderId]) {
                map[n.folderId].children.push({ ...n, type: 'note' });
            }
        });

        const flatten = (nodes, level = 0) => {
            let res = [];
            nodes.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return (a.name || a.title || '').localeCompare(b.name || b.title || '');
            });
            for (const node of nodes) {
                res.push({ ...node, level });
                if (node.type === 'folder' && expandedFolders[node.id]) {
                    if (node.children.length > 0) res = [...res, ...flatten(node.children, level + 1)];
                }
            }
            return res;
        };
        displayTree = flatten(roots);
    }

    function toggleExpand(id, e) {
        if (e) e.stopPropagation();
        expandedFolders[id] = !expandedFolders[id];
        expandedFolders = { ...expandedFolders };
    }

    function handleItemClick(item) {
        if (item.type === 'folder') {
            toggleExpand(item.id);
            // Optional: Select folder in view when clicked
            uiState.update(s => ({ ...s, selectedFolderId: item.id, view: 'folder' }));
        } else {
            // Note Click
            uiState.update(s => ({ ...s, editorNoteId: item.id, isSidebarOpen: false }));
        }
    }

    // --- Drag & Drop Delegates ---

    function onDragStart(e, item) {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        draggedItem = { id: item.id, type: item.type, parentId: item.parentId || item.folderId };
        
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify(draggedItem));
        
        // Visual feedback
        requestAnimationFrame(() => { if (e.target) e.target.classList.add('opacity-40'); });
    }

    function onDragEnd(e, item) {
        if (e.target) e.target.classList.remove('opacity-40');

        // Check for click-like drag (short distance) -> Context Menu
        const diffX = Math.abs(e.clientX - dragStartX);
        const diffY = Math.abs(e.clientY - dragStartY);
        if (diffX < 10 && diffY < 10) {
            dispatch('ctx', { x: e.clientX, y: e.clientY, type: item.type, item, source: 'touch' });
        }

        isDragging = false;
        draggedItem = null;
        dropTargetId = null;
    }

    function onDragOver(e, targetItem) {
        e.preventDefault();
        const { dropEffect, dropTargetId: targetId } = dndHandler.getDragOverState(draggedItem, targetItem, $folders);
        
        e.dataTransfer.dropEffect = dropEffect;
        dropTargetId = targetId;
    }

    async function onDrop(e, targetItem) {
        e.preventDefault();
        const success = await dndHandler.handleDrop(draggedItem, targetItem, $folders, $notes);
        
        if (success && targetItem) {
            expandedFolders[targetItem.id] = true; // Auto-expand target folder
        }
        
        dropTargetId = null;
        draggedItem = null;
    }

    // --- UI Helpers ---

    function setView(view, folderId = null, tagId = null) {
        uiState.update(s => ({ 
            ...s, 
            view, 
            selectedFolderId: folderId, 
            selectedTagId: tagId, 
            isSidebarOpen: false 
        }));
    }

    function handleCtx(e, item) {
        if (isDragging) return;
        let source = 'mouse';
        let x = e.clientX || 0;
        let y = e.clientY || 0;
        
        const isTouch = e.detail?.source === 'touch' || e.type === 'longpress';
        if (isTouch && e.detail?.originalEvent?.touches?.length) {
            x = e.detail.originalEvent.touches[0].clientX;
            y = e.detail.originalEvent.touches[0].clientY;
            source = 'touch';
        }

        dispatch('ctx', { x, y, type: item.type, item, source });
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div class="ui-sidebar-backdrop" transition:fade={{duration: 200}} role="button" tabindex="0" aria-label="Закрыть меню"
    on:keydown={(e)=> e.key === 'Escape' && uiState.update(s => ({...s, isSidebarOpen: false}))}
    on:click={() => uiState.update(s => ({...s, isSidebarOpen: false}))}>
</div>

<aside class="ui-sidebar" transition:fly={{x: -320, duration: 200}}>
    <div class="ui-sidebar-header group cursor-pointer">
        <div class="ui-sidebar-logo bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center transition-all duration-300 group-hover:border-primary-500">
            <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 6H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5v7" class="text-neutral-700 dark:text-neutral-200" />
                <rect x="12" y="12" width="2" height="2" fill="#6366F1" stroke="none" />
            </svg>
        </div>
        <span class="ui-sidebar-title tracking-[0.3em] font-medium ml-3 text-text-main">GLYF</span>
    </div>

    <div class="ui-sidebar-content">
        <!-- Navigation Groups -->
        <div class="space-y-1" role="group">
            {#each [
                { id: 'all', icon: 'fa-lightbulb', color: 'text-yellow-500', label: 'Все заметки' },
                { id: 'pinned', icon: 'fa-thumbtack', color: 'text-primary-500', label: 'Закреплённые' },
                { id: 'archive', icon: 'fa-archive', color: 'text-neutral-400', label: 'Архив' },
                { id: 'trash', icon: 'fa-trash', color: 'text-neutral-400', label: 'Корзина' }
            ] as item}
            <button type="button" class="ui-sidebar-nav-item" class:is-active={$uiState.view===item.id} on:click={()=> setView(item.id)}>
                <div class="ui-sidebar-nav-icon"><i class="fa-solid {item.icon} {item.color}"></i></div>
                {item.label}
            </button>
            {/each}
        </div>

        <!-- Folder Tree -->
        <div role="tree" aria-label="Папки">
            <!-- Root Drop Zone -->
            <div class="ui-sidebar-section-header" class:is-drop-target={dropTargetId==='root'} 
                role="treeitem" aria-selected="false" tabindex="0" 
                on:dragover={(e)=> onDragOver(e, null)}
                on:drop={(e) => onDrop(e, null)}>
                <span class="ui-sidebar-section-title">Папки</span>
                <button aria-label="Создать папку" class="ui-sidebar-add-btn" on:click|stopPropagation={()=> dispatch('create', 'folder')}>
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>

            <div class="space-y-0.5">
                {#each displayTree as item (item.type + item.id)}
                <div class="ui-sidebar-tree-item"
                    class:is-drop-target={item.type==='folder' && dropTargetId===item.id}
                    class:is-active={item.type==='folder' ? $uiState.selectedFolderId===item.id : $uiState.editorNoteId===item.id}
                    class:is-note={item.type==='note'}
                    style="padding-left: {item.level * 16}px"
                    role="treeitem"
                    aria-selected={item.type==='folder' ? $uiState.selectedFolderId===item.id : $uiState.editorNoteId===item.id}
                    tabindex="0"
                    draggable="true"
                    on:dragstart={(e)=> onDragStart(e, item)}
                    on:dragend={(e) => onDragEnd(e, item)}
                    on:dragover={(e) => onDragOver(e, item)}
                    on:drop={(e) => onDrop(e, item)}
                    on:contextmenu|preventDefault={(e) => handleCtx(e, item)}
                    on:click={() => handleItemClick(item)}
                    on:keydown={(e) => (e.key === 'Enter') && handleItemClick(item)}
                    >
                    <div class="ui-sidebar-caret-wrapper">
                        {#if item.type === 'folder'}
                        <i class="fa-solid {expandedFolders[item.id] ? 'fa-caret-down' : 'fa-caret-right'} text-[10px] text-neutral-400"></i>
                        {:else}
                        <i class="fa-regular fa-file-lines text-xs text-neutral-400"></i>
                        {/if}
                    </div>
                    <div class="ui-sidebar-item-content">
                        {#if item.type === 'folder'}
                        <i class="fa-regular {expandedFolders[item.id] ? 'fa-folder-open' : 'fa-folder'} text-sm text-primary-400"></i>
                        {/if}
                        <span class="truncate text-sm font-medium">{item.type === 'folder' ? item.name : (item.title || 'Без названия')}</span>
                    </div>
                </div>
                {/each}
            </div>
        </div>

        <!-- Tags -->
        <div role="group" aria-label="Теги">
            <div class="ui-sidebar-section-header">
                <span class="ui-sidebar-section-title">Теги</span>
                <button aria-label="Создать тег" class="ui-sidebar-add-btn" on:click={()=> dispatch('create', 'tag')}>
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
            <div class="flex flex-wrap gap-2 px-2">
                {#each $tags as t}
                <button type="button" class="ui-sidebar-tag-chip" class:is-active={$uiState.selectedTagId===t.id}
                    on:click={()=> setView('tag', null, t.id)}
                    use:longpress
                    on:longpress={(e) => handleCtx(e, { ...t, type: 'tag' })}
                    on:contextmenu|preventDefault={(e) => handleCtx(e, { ...t, type: 'tag' })}>
                    #{t.name}
                </button>
                {/each}
            </div>
        </div>
    </div>

    <div class="ui-sidebar-footer">
        <button type="button" class="ui-sidebar-settings-btn" on:click={()=> uiState.update(s => ({...s, isSidebarOpen: false, showSettingsModal: true}))}>
            <i class="fa-solid fa-gear text-neutral-400 w-6 text-center"></i>
            <span class="text-sm font-medium">Настройки</span>
        </button>
    </div>
</aside>
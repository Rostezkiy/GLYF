<!-- src/lib/components/Header.svelte -->
<script>
    import { uiState } from '$lib/services/uiStore';
    import { notes, permanentDeleteNote } from '$lib/services/noteService';
    import { fly, fade } from 'svelte/transition';

    let showViewMenu = false;
    let showSortMenu = false;
    let searchValue = $uiState.searchQuery;
    let searchTimer;
    let isMobileSearchActive = false;

    // Direct UI State helpers
    function updateState(updates) { uiState.update(s => ({...s, ...updates})); }
    
    function setSort(sortBy) { 
        updateState({ sortBy }); 
        showSortMenu = false; 
    }
    
    function setViewMode(viewMode) { 
        updateState({ viewMode }); 
        showViewMenu = false; 
    }

    function handleSearchInput(e) { 
        searchValue = e.target.value; 
        clearTimeout(searchTimer); 
        searchTimer = setTimeout(() => { updateState({ searchQuery: searchValue }); }, 300); 
    }

    function clearSearch() { 
        searchValue = ''; 
        updateState({ searchQuery: '' }); 
    }

    function openMobileSearch() { isMobileSearchActive = true; }
    function closeMobileSearch() { isMobileSearchActive = false; clearSearch(); }
    function focusOnMount(node) { node.focus(); }

    async function emptyTrash() {
        const trashNotes = $notes.filter(n => n.isDeleted);
        if (trashNotes.length === 0) return;
        
        if (!confirm(`Удалить все заметки (${trashNotes.length}) из корзины навсегда?`)) return;
        
        // Loop deletion via service
        for (const note of trashNotes) {
            await permanentDeleteNote(note.id);
        }
    }
</script>

<header class="ui-header">
    {#if isMobileSearchActive}
        <div class="ui-header-search-mobile" transition:fade={{duration: 100}}>
            <button class="ui-header-btn" on:click={closeMobileSearch} aria-label="Назад">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <div class="flex-1 relative">
                <input use:focusOnMount type="text" placeholder="Поиск..." class="ui-search-input-mobile" bind:value={searchValue} on:input={handleSearchInput}>
                {#if searchValue} 
                    <button class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 w-6 h-6 flex items-center justify-center" on:click={clearSearch} aria-label="Очистить поиск">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                {/if}
            </div>
        </div>
    {/if}

    <div class="flex items-center gap-3 h-14"> 
        <button class="ui-header-btn" on:click={() => updateState({ isSidebarOpen: true })} aria-label="Открыть боковую панель">
            <i class="fa-solid fa-bars text-lg"></i>
        </button>
        
        {#if $uiState.view === 'trash'}
            <h1 class="ui-header-title is-trash">Корзина</h1>
        {:else if $uiState.view === 'archive'}
            <h1 class="ui-header-title is-archive">Архив</h1>
        {:else}
            <h1 class="ui-header-title is-brand">GLYF</h1>
        {/if}
    </div>

    <div class="flex items-center gap-1 sm:gap-2">
        {#if $uiState.view === 'trash' && $notes.some(n => n.isDeleted)}
            <button on:click={emptyTrash} class="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-all active:scale-95 mr-2">
                <i class="fa-solid fa-trash-can"></i>
                <span class="hidden sm:inline">Очистить</span>
            </button>
        {/if}

        <button class="sm:hidden ui-header-btn" on:click={openMobileSearch} aria-label="Поиск"><i class="fa-solid fa-magnifying-glass"></i></button>

        <div class="ui-search-input-wrapper">
            <input type="text" placeholder="Поиск..." class="ui-search-input" bind:value={searchValue} on:input={handleSearchInput}>
            {#if searchValue}
                <button class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 w-5 h-5 flex items-center justify-center" on:click={clearSearch} aria-label="Очистить поиск">
                    <i class="fa-solid fa-xmark text-xs"></i>
                </button>
            {/if}
        </div>

        <div class="relative">
            <button class="ui-header-btn" class:is-active={$uiState.viewMode !== 'masonry'} on:click={() => { showViewMenu = !showViewMenu; showSortMenu = false; }} aria-label="Режим просмотра">
                <i class="fa-solid fa-grip-vertical"></i>
            </button>
            {#if showViewMenu}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div class="ui-header-dropdown-overlay" on:click={() => showViewMenu = false}></div>
                <div class="ui-header-dropdown w-48" transition:fly={{y:-10, duration:200}}>
                    <div class="ui-header-dropdown-title">Режим просмотра</div>
                    {#each [
                        {id: 'masonry', icon: 'fa-border-all', label: 'Плитка'},
                        {id: 'list', icon: 'fa-list', label: 'Список'},
                        {id: 'chat', icon: 'fa-regular fa-comments', label: 'Чат'}
                    ] as mode}
                        <button class="ui-header-dropdown-item" on:click={() => setViewMode(mode.id)}>
                            <span><i class="fa-solid {mode.icon} mr-2 w-4"></i>{mode.label}</span>
                            {#if $uiState.viewMode === mode.id}<i class="fa-solid fa-check text-primary-600"></i>{/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="relative">
            <button class="ui-header-btn" on:click={() => { showSortMenu = !showSortMenu; showViewMenu = false; }} aria-label="Сортировка">
                <i class="fa-solid fa-arrow-down-short-wide"></i>
            </button>
            {#if showSortMenu}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div class="ui-header-dropdown-overlay" on:click={() => showSortMenu = false}></div>
                <div class="ui-header-dropdown w-56" transition:fly={{y:-10, duration:200}}>
                    <div class="ui-header-dropdown-title">Сортировка</div>
                    {#each [{ id: 'updatedAt-desc', label: 'Сначала новые' }, { id: 'updatedAt-asc', label: 'Сначала старые' }, { id: 'title-asc', label: 'А-Я Название' }, { id: 'createdAt-desc', label: 'По созданию' }] as sort}
                        <button class="ui-header-dropdown-item" on:click={() => setSort(sort.id)}>
                            <span>{sort.label}</span>
                            {#if $uiState.sortBy === sort.id}<i class="fa-solid fa-check text-primary-600"></i>{/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</header>
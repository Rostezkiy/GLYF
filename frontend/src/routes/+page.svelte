<svelte:options runes={false} />

<script>
    import { onMount } from "svelte";
    import {
        uiState,
        filteredNotes,
        mediaViewerItem,
    } from "$lib/services/uiStore";
    import { folders, moveFolder } from "$lib/services/folderService";
    import { isAuthenticated } from "$lib/auth";
    import { syncService } from "$lib/services/syncService";
    import { loadData } from "$lib/db";

    // Components
    import Header from "$lib/components/Header.svelte";
    import Sidebar from "$lib/components/Sidebar.svelte";

    // NEW Views (keep static for now)
    import ViewMasonry from "$lib/components/views/ViewMasonry.svelte";
    import ViewList from "$lib/components/views/ViewList.svelte";
    import ViewChat from "$lib/components/views/ViewChat.svelte";
    import QuickInput from "$lib/components/QuickInput.svelte";

    // Lazy components will be imported dynamically when needed

    let renderLimit = 20;
    let mainScrollContainer;

    // Infinite Scroll Logic
    $: visibleNotes = $filteredNotes.slice(0, renderLimit);

    function handleMainScroll(e) {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        // Если до конца осталось меньше 300px, грузим еще
        if (scrollHeight - scrollTop - clientHeight < 300) {
            if (renderLimit < $filteredNotes.length) {
                renderLimit += 20;
            }
        }
    }

    onMount(async () => {
        await loadData();
        if ($isAuthenticated) {
            syncService.startListening();
            syncService.syncData();
        }
    });

    // --- Actions ---
    let dialogData = null;
    let actionSheetData = null;
    let contextMenuData = null;
    let toastMsg = null;
    let pickerData = null;

    function openNote(note) {
        uiState.update((s) => ({ ...s, editorNoteId: note.id }));
    }

    function createNote() {
        uiState.update((s) => ({ ...s, editorNoteId: "new" }));
    }

    function handleNoteCtx(e) {
        const { x, y, note, source } = e.detail;

        const options = [
            {
                icon: "fa-pen",
                label: "Редактировать",
                action: () => openNote(note),
            },
            {
                icon: "fa-copy",
                label: "Копировать",
                action: () => copyNoteContent(note),
            },
            {
                icon: "fa-folder",
                label: "В папку",
                action: () => openFolderPicker(note),
            },
            {
                icon: note.isPinned ? "fa-thumbtack-slash" : "fa-thumbtack",
                label: note.isPinned ? "Открепить" : "Закрепить",
                action: () => togglePin(note),
            },
            {
                icon: "fa-trash",
                label: "Удалить",
                action: () => deleteNoteConfirm(note),
            },
        ];

        if (source === "touch") {
            actionSheetData = {
                title: note.title || "Заметка",
                items: options,
            };
        } else {
            contextMenuData = { x, y, items: options };
        }
    }

    // --- Helpers (import dynamically to keep initial bundle small) ---
    async function togglePin(note) {
        const { saveNote } = await import("$lib/services/noteService");
        await saveNote({ ...note, isPinned: !note.isPinned });
    }

    function deleteNoteConfirm(note) {
        dialogData = {
            title: "Удалить заметку?",
            message: "Она будет перемещена в корзину.",
            danger: true,
            confirmLabel: "Удалить",
            action: async () => {
                const { moveNoteToTrash } = await import(
                    "$lib/services/noteService"
                );
                await moveNoteToTrash(note.id);
                toastMsg = "Заметка удалена";
                setTimeout(() => (toastMsg = null), 2000);
            },
        };
    }

    async function copyNoteContent(note) {
        if (!note.content) return;

        // Создаем временный элемент, чтобы получить чистый текст без HTML тегов (<p>, <br> и т.д.)
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = note.content;
        const text = tempDiv.innerText;

        try {
            await navigator.clipboard.writeText(text);
            // Показываем уведомление (используем вашу переменную toastMsg)
            toastMsg = "Скопировано в буфер обмена";
            setTimeout(() => (toastMsg = null), 2000);
        } catch (err) {
            console.error("Ошибка копирования:", err);
            toastMsg = "Ошибка при копировании";
            setTimeout(() => (toastMsg = null), 2000);
        }
    }

    function openFolderPicker(note) {
        pickerData = {
            title: "Переместить в папку",
            items: $folders,
            action: async (folderId) => {
                const { saveNote } = await import("$lib/services/noteService");
                await saveNote({ ...note, folderId });
            },
        };
    }

    // --- Sidebar Handlers ---
    function openCreateModal(type) {
        if (type === "folder") {
            dialogData = {
                title: "Новая папка",
                placeholder: "Название",
                confirmLabel: "Создать",
                value: "",
                action: async (name) => {
                    const { createFolder } = await import(
                        "$lib/services/folderService"
                    );
                    if (name) await createFolder(name);
                },
            };
        }
        // Tags usually handled inside sidebar directly or via separate picker
    }

    function handleFolderMove(e) {
        moveFolder(e.detail.id, e.detail.parentId);
    }
</script>

<div class="flex flex-col h-screen bg-bg-body overflow-hidden">
    <Header />

    <main class="flex-1 overflow-hidden relative flex flex-col pt-14">
        <!-- Folder Header info (если мы внутри папки) -->
        {#if $uiState.view === "folder"}
            <div
                class="px-4 py-2 flex items-center justify-between bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 shrink-0 z-10"
            >
                <div class="font-medium text-lg flex items-center gap-2">
                    <i class="fa-regular fa-folder-open text-primary-500"></i>
                    {$folders.find((f) => f.id === $uiState.selectedFolderId)
                        ?.name || "Неизвестно"}
                </div>
                <button
                    class="text-xs text-primary-600 font-bold uppercase hover:underline"
                    on:click={() =>
                        uiState.update((s) => ({ ...s, view: "all" }))}
                >
                    Показать все
                </button>
            </div>
        {/if}

        <!-- Основная область контента -->
        <div
            class="flex-1 overflow-hidden relative"
            class:flex={$uiState.viewMode === "chat"}
            class:flex-col={$uiState.viewMode === "chat"}
        >
            {#if $uiState.viewMode === "chat"}
                <!-- ЧАТ: Свой скролл внутри компонента -->
                <ViewChat
                    notes={visibleNotes}
                    on:noteClick={(e) => openNote(e.detail)}
                    on:contextmenu={handleNoteCtx}
                />
            {:else if $uiState.viewMode === "list"}
                <!-- СПИСОК: Общий скролл -->
                <div
                    class="h-full overflow-y-auto custom-scrollbar"
                    on:scroll={handleMainScroll}
                >
                    <ViewList
                        notes={visibleNotes}
                        on:noteClick={(e) => openNote(e.detail)}
                        on:contextmenu={handleNoteCtx}
                    />
                </div>
            {:else}
                <!-- ПЛИТКА: Общий скролл -->
                <div
                    class="h-full overflow-y-auto custom-scrollbar"
                    on:scroll={handleMainScroll}
                >
                    <ViewMasonry
                        notes={visibleNotes}
                        on:noteClick={(e) => openNote(e.detail)}
                        on:contextmenu={handleNoteCtx}
                    />
                </div>
            {/if}
        </div>

        <!-- Поле ввода (Только для Чата) -->
        {#if $uiState.viewMode === "chat"}
            <QuickInput folderId={$uiState.selectedFolderId} />
        {/if}
    </main>

    <!-- FAB (Только НЕ для Чата) -->
    {#if $uiState.viewMode !== "chat"}
        <button
            class="absolute right-6 bottom-6 w-14 h-14 bg-primary-600 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-primary-700 active:scale-95 transition-all z-20"
            on:click={createNote}
            aria-label="Создать заметку"
        >
            <i class="fa-solid fa-plus text-xl"></i>
        </button>
    {/if}

    <!-- Глобальные модалки и панели -->
    {#if $uiState.isSidebarOpen}
        <Sidebar
            on:create={(e) => openCreateModal(e.detail)}
            on:ctx={(e) => {
                /* Можно добавить обработку контекста папок */
            }}
            on:move={handleFolderMove}
        />
    {/if}

    {#if $uiState.editorNoteId}
        {#await import('$lib/components/Editor.svelte') then { default: Editor }}
            <Editor
                noteId={$uiState.editorNoteId}
                on:close={() =>
                    uiState.update((s) => ({ ...s, editorNoteId: null }))}
            />
        {/await}
    {/if}

    {#if $uiState.showAuthModal}
        {#await import('$lib/components/Auth.svelte') then { default: Auth }}
            <Auth
                on:close={() =>
                    uiState.update((s) => ({ ...s, showAuthModal: false }))}
            />
        {/await}
    {/if}

    {#if $uiState.showSettingsModal}
        {#await import('$lib/components/Settings.svelte') then { default: Settings }}
            <Settings
                on:close={() =>
                    uiState.update((s) => ({ ...s, showSettingsModal: false }))}
            />
        {/await}
    {/if}

    {#if dialogData}
        {#await import('$lib/components/Dialog.svelte') then { default: Dialog }}
            <Dialog
                {...dialogData}
                on:confirm={(e) => {
                    if (dialogData.action) dialogData.action(e.detail);
                    dialogData = null;
                }}
                on:cancel={() => (dialogData = null)}
            />
        {/await}
    {/if}

    {#if actionSheetData}
        {#await import('$lib/components/ActionSheet.svelte') then { default: ActionSheet }}
            <ActionSheet
                {...actionSheetData}
                on:select={(e) => {
                    e.detail();
                    actionSheetData = null;
                }}
                on:close={() => (actionSheetData = null)}
            />
        {/await}
    {/if}

    {#if contextMenuData}
        {#await import('$lib/components/ContextMenu.svelte') then { default: ContextMenu }}
            <ContextMenu
                {...contextMenuData}
                on:select={(e) => {
                    e.detail();
                    contextMenuData = null;
                }}
                on:close={() => (contextMenuData = null)}
            />
        {/await}
    {/if}

    {#if pickerData}
        {#await import('$lib/components/PickerModal.svelte') then { default: PickerModal }}
            <PickerModal
                {...pickerData}
                on:select={(e) => {
                    pickerData.action(e.detail);
                    pickerData = null;
                }}
                on:cancel={() => (pickerData = null)}
            />
        {/await}
    {/if}

    {#if $mediaViewerItem}
        {#await import('$lib/components/MediaViewer.svelte') then { default: MediaViewer }}
            <MediaViewer item={$mediaViewerItem} />
        {/await}
    {/if}

    {#if toastMsg}
        {#await import('$lib/components/Toast.svelte') then { default: Toast }}
            <Toast message={toastMsg} />
        {/await}
    {/if}
</div>

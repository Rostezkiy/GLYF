<!-- src/lib/components/Editor.svelte -->
<svelte:options runes={false} />

<script>
    import { createEventDispatcher, onMount, onDestroy } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    import { Editor } from '@tiptap/core';
    import StarterKit from '@tiptap/starter-kit';
    import TaskList from '@tiptap/extension-task-list';
    import TaskItem from '@tiptap/extension-task-item';
    import Placeholder from '@tiptap/extension-placeholder';
    
    // Stores & Services
    import { notes, deleteNote } from '$lib/services/noteService';
    import { tags } from '$lib/services/tagService';
    import { folders } from '$lib/services/folderService';
    import { syncService } from '$lib/services/syncService';
    import { createEditorController } from '$lib/services/noteService';

    // Components
    import PickerModal from './PickerModal.svelte';
    import TagPicker from './TagPicker.svelte';
    import AttachmentPreview from './AttachmentPreview.svelte';

    export let noteId;
    
    const dispatch = createEventDispatcher();
    const controller = createEditorController();

    // State
    let note = { tags: [], attachments: [] }; 
    let editor;
    let element;
    let isKeyboardOpen = false;
    let isLoadingCover = false;
    let downloadingId = null;
    
    // UI Toggles
    let showFormatting = false;
    let showMenu = false;
    let showFolderPicker = false;
    let showTagPicker = false;
    
    // Refs
    let coverInput;
    let attachmentInput;
    let titleInput;

    // --- Initialization ---
    onMount(async () => {
        try {
            const result = controller.initializeNote(noteId, notes);
            note = result.note;
            if (result.isNew && titleInput) titleInput.focus();
        } catch (e) {
            console.error(e);
            dispatch('close');
            return;
        }

        const handleViewportResize = () => {
            if (window.visualViewport) {
                isKeyboardOpen = window.visualViewport.height < window.innerHeight * 0.85;
            }
        };
        window.visualViewport?.addEventListener('resize', handleViewportResize);

        // Setup Tiptap
        editor = new Editor({
            element: element,
            extensions: [
                StarterKit,
                TaskList,
                TaskItem.configure({ nested: true }),
                Placeholder.configure({ placeholder: 'Текст заметки...' })
            ],
            content: note.content,
            onUpdate: ({ editor }) => {
                const newContent = editor.getHTML();
                if (newContent !== note.content) {
                    note.content = newContent;
                    saveDebounced();
                }
            },
            // ВАЖНО: Перехват вставки (Paste)
            editorProps: {
                attributes: { class: 'prose prose-lg focus:outline-none max-w-none min-h-[200px]' },
                handlePaste: (view, event, slice) => {
                    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
                    let handled = false;
                    for (const item of items) {
                        if (item.kind === 'file' && item.type.startsWith('image/')) {
                            const file = item.getAsFile();
                            if (file) {
                                // Загружаем как вложение
                                controller.uploadAttachments(note, [file]).then(updatedNote => {
                                    note = updatedNote;
                                });
                                handled = true; 
                            }
                        }
                    }
                    // Если обработали картинку, возвращаем true, чтобы Tiptap не вставлял её в текст
                    return handled; 
                }
            }
        });

        return () => {
            window.visualViewport?.removeEventListener('resize', handleViewportResize);
            if (editor) editor.destroy();
        };
    });

    // --- Save Logic ---
    let saveTimer;
    function saveDebounced() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveImmediate, 500);
    }

    async function saveImmediate() {
        const saved = await controller.saveIfChanged(note);
        if (saved) {
            note = saved;
        }
    }

    // --- Cover Logic ---
    let resolvedCoverUrl = null;
    let lastResolvedCoverId = null;

    $: if (note.coverImage !== lastResolvedCoverId) {
        lastResolvedCoverId = note.coverImage;
        if (note.coverImage) {
            controller.resolveCoverUrl(note.coverImage).then(url => {
                if (resolvedCoverUrl && resolvedCoverUrl.startsWith('blob:')) URL.revokeObjectURL(resolvedCoverUrl);
                resolvedCoverUrl = url;
            });
        } else {
            if (resolvedCoverUrl && resolvedCoverUrl.startsWith('blob:')) URL.revokeObjectURL(resolvedCoverUrl);
            resolvedCoverUrl = null;
        }
    }

    async function onCoverSelect(e) {
        try {
            isLoadingCover = true;
            note = await controller.uploadCover(note, e.target.files[0]);
        } catch(err) {
            alert(err.message);
        } finally {
            isLoadingCover = false;
        }
    }

    async function onRemoveCover() {
        if(confirm('Удалить обложку?')) {
            note = await controller.removeCover(note);
        }
    }

    // --- Attachment Logic ---
    async function onAttachmentSelect(e) {
        try {
            note = await controller.uploadAttachments(note, e.target.files);
        } catch(err) {
            console.error(err);
            alert('Ошибка при загрузке файлов');
        } finally {
            e.target.value = ''; 
        }
    }

    async function onRemoveAttachment(attId) {
        if (!confirm('Удалить файл?')) return;
        try {
            note = await controller.removeAttachment(note, attId);
        } catch (err) {
            console.error(err);
        }
    }

    async function onViewAttachment(att) {
        try {
            downloadingId = att.id;
            await controller.openAttachmentViewer(att);
        } catch (e) {
            alert(e.message);
        } finally {
            downloadingId = null;
        }
    }

    // --- General Actions ---
    function closeEditor() {
        saveImmediate();
        dispatch('close');
        syncService.scheduleSync();
    }

    function toggleArchive() {
        note.isArchived = !note.isArchived;
        saveImmediate();
        if (note.isArchived) closeEditor();
    }

    function toggleTag(tagId) {
        note.tags = note.tags.includes(tagId) 
            ? note.tags.filter(t => t !== tagId) 
            : [...note.tags, tagId];
        saveImmediate();
    }

    function handleTitleKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            editor?.commands.focus();
        }
    }

    onDestroy(() => {
        saveImmediate();
        if (resolvedCoverUrl && resolvedCoverUrl.startsWith('blob:')) {
            URL.revokeObjectURL(resolvedCoverUrl);
        }
    });
</script>

<div class="ui-editor-backdrop" 
    on:click|self={closeEditor} 
    on:keydown={(e)=> e.key === 'Escape' && closeEditor()}
    transition:fade={{duration: 150}}
    role="dialog" aria-modal="true" tabindex="-1">

    <div class="ui-editor-window" transition:fly={{y: 50, duration: 200}}>

        <!-- Top Toolbar -->
        <div class="ui-editor-toolbar">
            <button class="ui-editor-btn-back" aria-label="Назад" on:click={closeEditor}>
                <i class="fa-solid fa-arrow-left text-lg"></i>
            </button>

            <div class="flex items-center gap-1 sm:gap-2">
                <button class="ui-editor-btn-icon" class:is-active={note.isPinned} aria-label="Закрепить" 
                    on:click={()=> { note.isPinned = !note.isPinned; saveImmediate(); }}>
                    <i class="fa-solid fa-thumbtack"></i>
                </button>
                <button class="ui-editor-btn-icon" aria-label={note.isArchived ? "Разархивировать" : "Архивировать"}
                    on:click={toggleArchive}>
                    <i class="fa-solid {note.isArchived ? 'fa-box-open' : 'fa-box-archive'}"></i>
                </button>
                
                <input type="file" multiple class="hidden" bind:this={attachmentInput} on:change={onAttachmentSelect}>
                <input type="file" accept="image/*" class="hidden" bind:this={coverInput} on:change={onCoverSelect}>

                <button class="ui-editor-btn-icon" aria-label="Обложка" on:click={()=> coverInput.click()}>
                    <i class="fa-regular fa-image"></i>
                </button>

                <div class="relative">
                    <button class="ui-editor-btn-icon" class:is-active={showMenu} aria-label="Меню" on:click={()=> showMenu = !showMenu}>
                        <i class="fa-solid fa-ellipsis-vertical"></i>
                    </button>
                    {#if showMenu}
                    <div class="ui-editor-menu" transition:fade={{duration:100}}>
                        <div class="ui-editor-menu-info">Изменено: {new Date(note.updatedAt).toLocaleString()}</div>
                        <button class="ui-editor-menu-item" on:click={()=> { showMenu = false; showFolderPicker = true; }}>
                            <i class="fa-regular fa-folder w-4"></i> Переместить
                        </button>
                        <button class="ui-editor-menu-item" on:click={()=> { showMenu = false; showTagPicker = true; }}>
                            <i class="fa-solid fa-hashtag w-4"></i> Теги
                        </button>
                        {#if note.coverImage}
                        <button class="ui-editor-menu-item is-danger" on:click={()=> { showMenu = false; onRemoveCover(); }}>
                            <i class="fa-solid fa-image-slash w-4"></i> Удалить обложку
                        </button>
                        {/if}
                        <div class="h-px bg-neutral-100 my-1"></div>
                        <button class="ui-editor-menu-item is-danger" on:click={()=> { deleteNote(note.id); dispatch('close'); }}>
                            <i class="fa-regular fa-trash-can w-4"></i> Удалить заметку
                        </button>
                    </div>
                    <div class="ui-editor-menu-overlay" role="dialog" tabindex="-1" aria-label="Закрыть меню" on:click={()=> showMenu = false} on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (showMenu = false)}></div>
                    {/if}
                </div>
            </div>
        </div>

        <!-- Scrollable Content -->
        <div class="ui-editor-scroll-area">
            {#if resolvedCoverUrl}
            <div class="ui-editor-cover-container group">
                <img src={resolvedCoverUrl} alt="Обложка" class="ui-editor-cover-img">
                <button class="ui-editor-cover-remove-btn" aria-label="Удалить обложку" on:click={onRemoveCover}>
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            {/if}

            <div class="ui-editor-body">
                <input bind:this={titleInput} type="text" placeholder="Название" class="ui-editor-title-input"
                    bind:value={note.title} on:input={saveDebounced} on:keydown={handleTitleKeydown}>

                <div class="ui-editor-chips-wrapper">
                    <button class="ui-editor-chip-folder" on:click={()=> showFolderPicker = true}>
                        <i class="fa-regular fa-folder text-neutral-400"></i> {$folders.find(f => f.id === note.folderId)?.name || 'Без папки'}
                    </button>
                    {#each note.tags as tId}
                        {@const t = $tags.find(tag => tag.id === tId)}
                        {#if t}
                        <button class="ui-editor-chip-tag" on:click={()=> toggleTag(t.id)}>
                            <span class="opacity-50">#</span>{t.name}
                            <i class="fa-solid fa-xmark ui-editor-chip-remove"></i>
                        </button>
                        {/if}
                    {/each}
                    <button class="ui-editor-add-tag-btn" aria-label="Добавить тег" on:click={()=> showTagPicker = true}>
                        <i class="fa-solid fa-plus text-sm"></i>
                    </button>
                </div>

                {#if note.attachments && note.attachments.length > 0}
                <div class="ui-editor-attachments-section">
                    <div class="ui-editor-section-title">
                        <i class="fa-solid fa-paperclip"></i> Вложения ({note.attachments.length})
                    </div>
                    <div class="ui-editor-attachments-grid">
                        {#each note.attachments as att (att.id)}
                        <div class="relative">
                            <AttachmentPreview attachment={att} 
                                on:remove={(e)=> onRemoveAttachment(e.detail)}
                                on:click={() => onViewAttachment(att)}
                            />
                            {#if downloadingId === att.id}
                            <div class="ui-editor-download-overlay">
                                <i class="fa-solid fa-spinner fa-spin text-primary-500 text-xl"></i>
                            </div>
                            {/if}
                        </div>
                        {/each}
                    </div>
                </div>
                {/if}

                <div bind:this={element} class="ui-editor-content-wrapper"></div>
            </div>
        </div>

        <div class="ui-editor-bottom-bar relative border-t border-border-base bg-surface transition-all duration-200"
            style="overflow: visible; padding-bottom: {isKeyboardOpen ? '4px' : 'max(env(safe-area-inset-bottom), 12px)'};">

            {#if showFormatting}
            <div class="absolute bottom-full mb-2 left-2 right-2 md:left-4 md:right-auto md:w-max flex items-center gap-0.5 p-1 bg-surface border border-border-base shadow-xl rounded-lg z-[100]">
                <div class="flex items-center border-r border-border-base pr-1 mr-1">
                    <button type="button" class="w-10 h-9 flex items-center justify-center rounded transition-colors {editor?.isActive('heading', { level: 1 }) ? 'bg-primary-100 text-primary-600' : 'text-neutral-600 hover:bg-neutral-100'}"
                        on:mousedown|preventDefault={()=> editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
                        <span class="text-xs font-bold">H1</span>
                    </button>
                     <button type="button" class="w-9 h-9 flex items-center justify-center rounded text-neutral-400 hover:bg-neutral-100"
                        on:mousedown|preventDefault={()=> editor?.chain().focus().unsetAllMarks().clearNodes().run()}
                        aria-label="Очистить форматирование">
                        <i class="fa-solid fa-text-slash text-xs"></i>
                    </button>
                </div>
            </div>
            {/if}

            <div class="flex items-center justify-between w-full px-2">
                <div class="flex items-center gap-1">
                    <button type="button" class="ui-editor-bottom-btn {showFormatting ? 'text-primary-600 bg-primary-100' : ''}"
                        on:mousedown|preventDefault={()=> showFormatting = !showFormatting}
                        aria-label="Форматирование">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M1.1 21h21.8v2.18H1.1V21zm8.33-2.18l1.32-3.48h4.52l1.32 3.48h2.33L13.15 4.33h-2.31L5.06 18.82h2.37zm4.72-6.1l-1.15-3.07-1.15 3.07h2.3z" />
                        </svg>
                    </button>
                    <div class="ui-editor-divider"></div>
                    <button type="button" class="ui-editor-bottom-btn {editor?.isActive('taskList') ? 'text-primary-600 bg-primary-50' : ''}"
                        on:mousedown|preventDefault={()=> editor?.chain().focus().toggleTaskList().run()}
                        aria-label="Список задач">
                        <i class="fa-solid fa-list-check"></i>
                    </button>
                    <button type="button" class="ui-editor-bottom-btn {editor?.isActive('bulletList') ? 'text-primary-600 bg-primary-50' : ''}"
                        on:mousedown|preventDefault={()=> editor?.chain().focus().toggleBulletList().run()}
                        aria-label="Маркированный список">
                        <i class="fa-solid fa-list-ul"></i>
                    </button>
                </div>
                
                <div class="flex items-center gap-1">
                    <button class="ui-editor-btn-icon" aria-label="Прикрепить файл" on:click={() => attachmentInput.click()}>
                        <i class="fa-solid fa-paperclip"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>

    {#if showFolderPicker}
    <PickerModal title="Выберите папку" items={$folders} 
        on:select={(e)=> { note.folderId = e.detail; saveImmediate(); showFolderPicker = false; }} 
        on:cancel={() => showFolderPicker = false} />
    {/if}

    {#if showTagPicker}
    <TagPicker tags={$tags} selectedTags={note.tags} 
        on:toggle={(e)=> toggleTag(e.detail)} 
        on:close={() => showTagPicker = false} />
    {/if}
</div>
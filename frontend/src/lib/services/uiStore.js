/* src/lib/services/uiStore.js */
import { writable, derived } from 'svelte/store';
import { notes } from './noteService';
import { folders } from './folderService';

// Вспомогательная функция для работы с localStorage
const getStoredTheme = () => {
    if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('glyf_theme') || 'nord';
    }
    return 'nord';
};

const getStoredViewMode = () => {
    if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('glyf_viewMode') || 'masonry';
    }
    return 'masonry';
};

export const mediaViewerItem = writable(null);

export const syncState = writable({
    status: 'idle',
    lastSync: null,
    errorMessage: null
});

export const uiState = writable({
    view: 'all',
    viewMode: getStoredViewMode(),
    selectedFolderId: null,
    selectedTagId: null,
    searchQuery: '',
    sortBy: 'updatedAt-desc',
    isSidebarOpen: false,
    editorNoteId: null,
    showAuthModal: false,
    showSettingsModal: false,
    theme: getStoredTheme()
});

// Автоматическое сохранение темы и режима просмотра
if (typeof localStorage !== 'undefined') {
    uiState.subscribe(state => {
        localStorage.setItem('glyf_theme', state.theme);
        localStorage.setItem('glyf_viewMode', state.viewMode);
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', state.theme);
        }
    });
}

// Вычисляемый стор для фильтрации заметок
export const filteredNotes = derived([notes, uiState, folders], ([$notes, $ui, $folders]) => {
    let res = $notes || [];
    // Фильтрация по папкам/тегам/статусу
    if ($ui.view === 'pinned') res = res.filter(n => n.isPinned && !n.isArchived && !n.isDeleted);
    else if ($ui.view === 'archive') res = res.filter(n => n.isArchived && !n.isDeleted);
    else if ($ui.view === 'trash') res = res.filter(n => n.isDeleted);
    else if ($ui.view === 'folder') res = res.filter(n => n.folderId === $ui.selectedFolderId && !n.isArchived && !n.isDeleted);
    else if ($ui.view === 'tag') res = res.filter(n => n.tags?.includes($ui.selectedTagId) && !n.isArchived && !n.isDeleted);
    else res = res.filter(n => !n.isArchived && !n.isDeleted); 

    // Поиск
    if ($ui.searchQuery) {
        const q = $ui.searchQuery.toLowerCase().trim();
        res = res.filter(n => {
            const inTitle = n.title?.toLowerCase().includes(q);
            const inContent = n.content?.toLowerCase().includes(q);
            const inAttachments = n.attachments?.some(att => att.name.toLowerCase().includes(q));
            return inTitle || inContent || inAttachments;
        });
    }

    // Сортировка
    const [field, dir] = $ui.sortBy.split('-');
    
    return res.sort((a, b) => {
        let aVal = a[field] || '';
        let bVal = b[field] || '';
        
        if (field === 'updatedAt' || field === 'createdAt') {
            const tA = aVal ? new Date(aVal).getTime() : 0;
            const tB = bVal ? new Date(bVal).getTime() : 0;
            const safeA = isNaN(tA) ? 0 : tA;
            const safeB = isNaN(tB) ? 0 : tB;

            if (safeA > safeB) return dir === 'desc' ? -1 : 1;
            if (safeA < safeB) return dir === 'desc' ? 1 : -1;
            return (a.id || '').localeCompare(b.id || '');
        } else if (field === 'title') { 
            aVal = aVal.toLowerCase(); 
            bVal = bVal.toLowerCase(); 
        }

        if (aVal > bVal) return dir === 'desc' ? -1 : 1;
        if (aVal < bVal) return dir === 'desc' ? 1 : -1;
        return (a.id || '').localeCompare(b.id || '');
    });
});
<!-- src/routes/settings/+page.svelte -->
<svelte:options runes={false} />

<script>
    import { goto } from '$app/navigation';
    import { user, isAuthenticated, authService } from '$lib/auth';
    import { syncService, syncState } from '$lib/services/syncService';
    import { dbService } from '$lib/db';
    import Dialog from '$lib/components/Dialog.svelte';
    import Toast from '$lib/components/Toast.svelte';
    
    let email = '';
    let password = '';
    let isRegistering = false;
    let isLoading = false;
    
    let dialogData = null;
    let toastMsg = null;
    let fileInputImport;

    function showToast(msg) {
        toastMsg = msg;
        setTimeout(() => toastMsg = null, 3000);
    }

    async function handleAuth() {
        if(!email || !password) return;
        isLoading = true;
        try {
            if(isRegistering) {
                await authService.register(email, password);
            } else {
                await authService.login(email, password);
            }
        } catch(e) {
            alert('Ошибка: ' + e.message);
        } finally {
            isLoading = false;
        }
    }

    async function handleLogout() {
        authService.logout();
    }

    function handleBack() {
        goto('/');
    }

    async function forceSync() {
        await syncService.scheduleSync();
    }

    // --- Управление данными ---

    async function handleExport() {
        const data = await dbService.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], {type : 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `glyf-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Резервная копия создана');
    }

    function handleImportClick() {
        fileInputImport.click();
    }

    function handleImportFile(e) {
        const file = e.target.files[0];
        if(!file) return;
        
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const json = JSON.parse(evt.target.result);
                await dbService.importData(json);
                showToast('Данные успешно импортированы');
            } catch(e) {
                alert('Ошибка импорта: ' + e.message);
            }
        };
        reader.readAsText(file);
    }

    function confirmReset() {
        dialogData = {
            title: 'Сброс данных',
            message: 'ВНИМАНИЕ! Это действие удалит ВСЕ ваши заметки, папки и теги локально. Восстановить их будет невозможно.',
            confirmLabel: 'Удалить всё',
            danger: true,
            value: null,
            action: async () => {
                setTimeout(() => {
                    dialogData = {
                        title: 'Вы абсолютно уверены?',
                        message: 'Подтвердите окончательное удаление всех данных.',
                        confirmLabel: 'ДА, УДАЛИТЬ',
                        danger: true,
                        value: null,
                        action: async () => {
                            await dbService.clearDatabase();
                            showToast('Приложение очищено');
                        }
                    };
                }, 200);
            }
        };
    }
</script>

<div class="min-h-screen bg-neutral-50 flex flex-col pt-[env(safe-area-inset-top)]">
    <!-- Header -->
    <header class="bg-surface border-b border-neutral-100 px-4 h-14 flex items-center justify-between sticky top-0 z-10">
        <div class="flex items-center gap-3">
            <button aria-label="Назад" class="w-10 h-10 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600 transition-colors" on:click={handleBack}>
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <h1 class="font-bold text-lg text-neutral-800">Настройки</h1>
        </div>
    </header>

    <div class="p-4 max-w-lg mx-auto w-full space-y-6 pb-20">
        
        <!-- Account Section -->
        <div class="bg-surface rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
            <div class="p-4 border-b border-neutral-100 bg-neutral-50/50">
                <h2 class="font-bold text-neutral-800 flex items-center gap-2">
                    <i class="fa-solid fa-user-circle text-primary-500"></i> Аккаунт
                </h2>
            </div>
            
            <div class="p-5">
                {#if $isAuthenticated}
                    <div class="text-center py-4">
                        <div class="w-16 h-16 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
                            {$user.name[0].toUpperCase()}
                        </div>
                        <h3 class="font-bold text-lg">{$user.name}</h3>
                        <p class="text-sm text-neutral-500 mb-6">{$user.email}</p>
                        
                        <div class="flex flex-col gap-3">
                            <button class="w-full py-2.5 bg-primary-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform" 
                                on:click={forceSync} disabled={$syncState.status === 'syncing'}>
                                {#if $syncState.status === 'syncing'}
                                    <i class="fa-solid fa-circle-notch fa-spin"></i> Синхронизация...
                                {:else if $syncState.status === 'success'}
                                    <i class="fa-solid fa-check"></i> Синхронизировано
                                {:else}
                                    <i class="fa-solid fa-rotate"></i> Синхронизировать сейчас
                                {/if}
                            </button>
                            
                            {#if $syncState.lastSync}
                                <p class="text-xs text-neutral-400">Посл. синхронизация: {new Date($syncState.lastSync).toLocaleString()}</p>
                            {/if}

                            <button class="w-full py-2.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl font-medium transition-colors mt-2" on:click={handleLogout}>
                                Выйти
                            </button>
                        </div>
                    </div>
                {:else}
                    <div class="space-y-4">
                        <p class="text-sm text-neutral-500 text-center mb-4">Войдите, чтобы синхронизировать заметки между устройствами.</p>
                        
                        <div class="space-y-3">
                            <div>
                                <label for="email" class="block text-xs font-bold text-neutral-500 mb-1 ml-1">Email</label>
                                <input id="email" type="email" bind:value={email} class="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500 transition-all">
                            </div>
                            <div>
                                <label for="password" class="block text-xs font-bold text-neutral-500 mb-1 ml-1">Пароль</label>
                                <input id="password" type="password" bind:value={password} class="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500 transition-all">
                            </div>
                        </div>

                        <button class="w-full py-3 bg-primary-600 text-white rounded-xl font-bold shadow-lg shadow-primary-200 active:scale-95 transition-transform mt-2 flex items-center justify-center" 
                            on:click={handleAuth} disabled={isLoading}>
                            {#if isLoading} <i class="fa-solid fa-circle-notch fa-spin"></i> {:else} {isRegistering ? 'Зарегистрироваться' : 'Войти'} {/if}
                        </button>

                        <div class="text-center pt-2">
                            <button class="text-sm text-primary-600 font-medium" on:click={() => isRegistering = !isRegistering}>
                                {isRegistering ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Data Management -->
        <div class="bg-surface rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
            <div class="px-5 py-4 border-b border-neutral-100 font-bold text-neutral-800 bg-neutral-50/50 flex items-center gap-2">
                <i class="fa-solid fa-database text-neutral-400"></i> Данные
            </div>
            <div class="p-5 space-y-4">
                <div class="flex gap-4">
                    <button class="flex-1 py-3 px-4 bg-primary-50 text-primary-700 rounded-xl hover:bg-primary-100 font-medium transition-colors" on:click={handleExport}>
                        <i class="fa-solid fa-download mr-2"></i> Экспорт
                    </button>
                    <button class="flex-1 py-3 px-4 bg-neutral-50 text-neutral-700 rounded-xl hover:bg-neutral-100 font-medium transition-colors" on:click={handleImportClick}>
                        <i class="fa-solid fa-upload mr-2"></i> Импорт
                    </button>
                    <input type="file" accept=".json" class="hidden" bind:this={fileInputImport} on:change={handleImportFile}>
                </div>
                
                <div class="pt-2 border-t border-neutral-100">
                    <button class="w-full py-3 px-4 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-medium flex items-center justify-between transition-colors" on:click={confirmReset}>
                        <span class="flex items-center gap-2"><i class="fa-solid fa-triangle-exclamation"></i> Сброс всех данных</span>
                        <i class="fa-solid fa-chevron-right text-sm opacity-50"></i>
                    </button>
                </div>
            </div>
        </div>

        <!-- App Settings -->
        <div class="bg-surface rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
             <div class="p-4 border-b border-neutral-100 bg-neutral-50/50">
                <h2 class="font-bold text-neutral-800 flex items-center gap-2">
                    <i class="fa-solid fa-gear text-neutral-400"></i> Приложение
                </h2>
            </div>
            <div class="p-0">
                <button class="w-full text-left px-5 py-4 hover:bg-neutral-50 flex justify-between items-center transition-colors">
                    <span class="text-neutral-700">Темная тема</span>
                    <div class="w-10 h-6 bg-neutral-200 rounded-full relative"><div class="absolute left-1 top-1 w-4 h-4 bg-surface rounded-full shadow-sm"></div></div>
                </button>
                <div class="h-px bg-neutral-100 mx-5"></div>
                <button class="w-full text-left px-5 py-4 hover:bg-neutral-50 flex justify-between items-center transition-colors text-neutral-700">
                    <span>О приложении</span>
                    <span class="text-xs text-neutral-400">v1.0.0</span>
                </button>
            </div>
        </div>
    </div>
    
    {#if dialogData}
        <Dialog 
            title={dialogData.title} 
            message={dialogData.message}
            value={dialogData.value} 
            confirmLabel={dialogData.confirmLabel}
            danger={dialogData.danger}
            on:confirm={(e) => { if(dialogData.action) dialogData.action(e.detail); dialogData = null; }}
            on:cancel={() => dialogData = null} 
        />
    {/if}

    {#if toastMsg}
        <Toast message={toastMsg} />
    {/if}
</div>
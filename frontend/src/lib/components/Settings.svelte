<!-- src/lib/components/Settings.svelte -->
<svelte:options runes={false} />

<script>
    import { createEventDispatcher, onMount } from 'svelte';
    import { fade, fly, slide } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';
    import { user, isAuthenticated, authService } from '$lib/auth';
    import { dbService } from '$lib/db';
    import { uiState } from '$lib/services/uiStore';
    import { Capacitor } from '@capacitor/core';
    import { APP_VERSION, API_URL } from '$lib/config';

    const dispatch = createEventDispatcher();
    let storageUsed = 0;
    let storageLimit = $user?.storageLimit || 536870912;

    let updateAvailable = null;
    let availablePlans = [];
    let isLoadingPlans = false;
    let upgradeError = null;
    let showPlans = false;

    // Вычисляем процент заполнения для progress bar
    $: storagePercent = storageLimit > 0 ? Math.min(100, (storageUsed / storageLimit) * 100) : 0;

    // Ссылки на файлы (замени на свои реальные пути)
    const downloadLinks = {
        android: "https://glyf.ru/downloads/glyf-latest.apk",
        windows: "https://glyf.ru/downloads/glyf-setup.exe"
    };
    // Определяем платформу
    const isTauri = !!(window && window.__TAURI_INTERNALS__);
    const isNative = Capacitor.isNativePlatform(); // true для iOS/Android
    const currentPlatform = isTauri ? 'windows' : Capacitor.getPlatform();

    onMount(async () => {
        // 1. Расчет места (оставляем без изменений)
        const allFiles = await dbService.getAll('files');
        storageUsed = allFiles.reduce((acc, f) => acc + (f.size || 0), 0);

        // 2. Проверка обновлений
        await checkUpdates();
    });

async function checkUpdates() {
        let updateFound = false;

        // 1. Попытка через официальный плагин Tauri (для авто-установки)
        if (isTauri) {
            try {
                const { check } = await import('@tauri-apps/plugin-updater');
                const update = await check();
                if (update && update.available) {
                    updateAvailable = {
                        version: update.version,
                        notes: update.body,
                        isTauri: true,
                        rawUpdate: update // Есть подпись, будет работать авто-установка
                    };
                    updateFound = true;
                }
            } catch (e) {
                console.log("Tauri auto-update check skipped (possibly no signature)");
            }
        }
    }

async function handleUpdateAction() {
        // Если Tauri-плагин подтвердил возможность авто-обновления (есть SIG)
        if (updateAvailable.isTauri && updateAvailable.rawUpdate) {
            try {
                const update = updateAvailable.rawUpdate;
                await update.downloadAndInstall();
                const { relaunch } = await import('@tauri-apps/plugin-process');
                await relaunch();
            } catch (e) {
                console.error("Auto-install failed", e);
                // Если авто-установка не удалась, пробуем открыть ссылку вручную
                if (updateAvailable.url) window.open(updateAvailable.url, '_blank');
            }
        } else {
            // Для Android или Windows без подписи — просто открываем браузер
            const url = updateAvailable.url || "https://.../downloads/glyf-setup.msi";
            window.open(url, '_blank');
        }
    }

    // Функция закрытия: закрываем настройки и ОТКРЫВАЕМ сайдбар
    function closeAndBack() {
        dispatch('close');
        uiState.update(s => ({ ...s, isSidebarOpen: true }));
    }

    async function handleClearCache() {
        if (confirm('Удалить скачанные файлы с устройства? Они останутся в облаке.')) {
            await dbService.clearCache();
            alert('Кэш очищен');
        }
    }

    function openAuth() {
        dispatch('close');
        uiState.update(s => ({ ...s, showAuthModal: true }));
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
    }

    const themes = [
        { id: 'emerald', label: 'Изумруд', color: '#10b981' },
        { id: 'dark', label: 'Полуночный', color: '#2b2b30ff' },
        { id: 'nord', label: 'Арктика', color: '#0ea5e9' },
        { id: 'rose', label: 'Роза', color: '#f43f5e' },
        { id: 'solid', label: 'Деловая колбаса', color: '#334155' }
    ];

    function setTheme(themeId) {
        uiState.update(s => ({ ...s, theme: themeId }));
    }

    function formatDate(date) {
        if (!date) return '—';
        const d = new Date(date);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // Загружает доступные тарифные планы
    async function loadPlans() {
        if (!authService.getToken()) return;
        isLoadingPlans = true;
        upgradeError = null;
        try {
            const res = await fetch(`${API_URL}/subscription/plans`, {
                headers: { 'Authorization': `Bearer ${authService.getToken()}` }
            });
            if (!res.ok) throw new Error(`Failed to load plans: ${res.status}`);
            availablePlans = await res.json();
        } catch (err) {
            console.error('Error loading plans:', err);
            upgradeError = 'Не удалось загрузить тарифы';
        } finally {
            isLoadingPlans = false;
        }
    }

    // Обновляет профиль пользователя после смены тарифа
    async function refreshUserProfile() {
        try {
            const res = await fetch(`${API_URL}/user/profile`, {
                headers: { 'Authorization': `Bearer ${authService.getToken()}` }
            });
            if (!res.ok) throw new Error(`Failed to refresh profile: ${res.status}`);
            const profile = await res.json();
            // Обновляем store пользователя
            user.update(u => ({ ...u, ...profile }));
        } catch (err) {
            console.error('Error refreshing profile:', err);
        }
    }

    // Немедленная активация тарифа (для тестирования)
    async function upgradeTier(tier) {
        if (!confirm(`Активировать тариф "${tier}"? Это тестовая функция, платеж не требуется.`)) {
            return;
        }
        upgradeError = null;
        try {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30); // +30 дней
            const res = await fetch(`${API_URL}/subscription/upgrade`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authService.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tier, expiresAt: expiresAt.toISOString() })
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Upgrade failed: ${res.status} ${text}`);
            }
            // Обновляем профиль пользователя
            await refreshUserProfile();
            // Перезагружаем планы (на случай, если изменились)
            await loadPlans();
            alert(`Тариф "${tier}" успешно активирован!`);
        } catch (err) {
            console.error('Upgrade error:', err);
            upgradeError = err.message;
        }
    }

    // Загружаем планы при монтировании, если пользователь авторизован
    onMount(async () => {
        // 1. Расчет места (оставляем без изменений)
        const allFiles = await dbService.getAll('files');
        storageUsed = allFiles.reduce((acc, f) => acc + (f.size || 0), 0);

        // 2. Проверка обновлений
        await checkUpdates();

        // 3. Загрузка доступных тарифов
        if ($isAuthenticated) {
            loadPlans();
        }
    });
</script>

<div class="ui-backdrop flex justify-start" transition:fade={{duration: 200}} on:click|self={closeAndBack} role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && closeAndBack()}>

    <div class="ui-settings-modal shadow-2xl" transition:fly={{x: -320, duration: 250}}>
        <!-- Header -->
        <div class="ui-settings-header">
            <h2 class="ui-settings-title">Настройки</h2>
            <button class="ui-settings-close-btn" on:click={closeAndBack} aria-label="Назад">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
        </div>

        <div class="ui-settings-body custom-scrollbar">

            <!-- 1. Блок обновления (показываем только если есть новая версия) -->
            {#if updateAvailable}
            <div class="bg-primary-500 text-white p-4 rounded-2xl mb-6 shadow-lg shadow-primary-500/20">
                <div class="flex items-center gap-3 mb-2">
                    <i class="fa-solid fa-cloud-arrow-down animate-bounce"></i>
                    <span class="font-bold">
                        {updateAvailable.isTauri ? 'Доступно обновление системы' : `Доступна версия
                        ${updateAvailable.version}`}
                    </span>
                </div>
                <p class="text-xs opacity-90 mb-3">
                    {updateAvailable.notes || 'Улучшена стабильность и исправлены ошибки.'}
                </p>
                <button on:click={handleUpdateAction}
                    class="block w-full bg-white text-primary-600 text-center py-2 rounded-xl text-sm font-bold hover:bg-opacity-90 transition-all">
                    {updateAvailable.isTauri ? 'Перезапустить и обновить' : 'Скачать обновление'}
                </button>
            </div>
            {/if}

            {#if $isAuthenticated}
            <section>
                <h3 class="ui-settings-section-title">Аккаунт</h3>
                <div class="ui-settings-card flex items-center gap-4">
                    <div class="ui-settings-user-avatar">
                        {$user?.name[0].toUpperCase() || 'U'}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="font-bold text-neutral-900 truncate">{$user?.name || 'User'}</div>
                        <div class="text-sm text-neutral-500 truncate">{$user?.email}</div>
                    </div>
                </div>
            </section>


            <!-- НОВЫЙ БЛОК ПОДПИСКИ -->
            <section class="mb-8">
                <div class="flex justify-between items-end mb-3 px-1">
                    <h3 class="ui-settings-section-title mb-0">Моя подписка</h3>
                    {#if $user?.tier !== 'free'}
                        <span class="text-xs font-bold text-primary-600 bg-primary-50 px-2 py-1 rounded-lg">
                            PRO активен
                        </span>
                    {/if}
                </div>

                <!-- Карточка-герой -->
                <div class="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl transition-all duration-500 mb-4
                    {$user?.tier === 'free' ? 'bg-gradient-to-br from-neutral-700 to-neutral-800' : 'bg-gradient-to-br from-primary-500 to-primary-700'}">
                    
                    <!-- Декор фона -->
                    <div class="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl pointer-events-none"></div>

                    <!-- Инфо о тарифе -->
                    <div class="relative z-10">
                        <div class="text-xs font-medium opacity-70 uppercase tracking-wider mb-1">Текущий план</div>
                        <div class="flex justify-between items-center mb-6">
                            <h3 class="text-3xl font-bold tracking-tight">
                                {$user?.tier === 'free' ? 'Free' : $user?.tier?.toUpperCase()}
                            </h3>
                            <div class="text-right">
                                {#if $user?.tier === 'free'}
                                    <div class="text-2xl font-bold">
                                        Локально
                                    </div>
                                    <div class="text-[10px] opacity-80">без синхронизации</div>
                                {:else}
                                    <div class="text-2xl font-bold">
                                        {formatSize(storageLimit)}
                                    </div>
                                    <div class="text-[10px] opacity-80">доступно</div>
                                {/if}
                            </div>
                        </div>

                        <!-- Прогресс бар хранилища -->
                        {#if $user?.tier !== 'free'}
                        <div class="flex justify-between text-xs font-medium opacity-90 mb-1.5">
                            <span>Занято {formatSize(storageUsed)}</span>
                            <span>{Math.round(storagePercent)}%</span>
                        </div>
                        <div class="w-full h-2 bg-black/20 rounded-full overflow-hidden mb-5 border border-white/10">
                            <div class="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-1000 ease-out"
                                 style="width: {storagePercent}%"></div>
                        </div>
                        {:else}
                        <div class="flex justify-between text-xs font-medium opacity-90 mb-1.5">
                            <span>Занято {formatSize(storageUsed)}</span>
                            <span class="opacity-70">локальное хранилище</span>
                        </div>
                        <div class="w-full h-2 bg-black/20 rounded-full overflow-hidden mb-5 border border-white/10">
                            <div class="h-full bg-white/30 shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-all duration-1000 ease-out"
                                 style="width: 100%"></div>
                        </div>
                        {/if}

                        <!-- Кнопка раскрытия списка -->
                        <button class="w-full py-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white rounded-xl font-bold text-sm transition-all flex justify-center items-center gap-2 group"
                                on:click={() => { showPlans = !showPlans; if(showPlans) loadPlans(); }}>
                            <span>{showPlans ? 'Свернуть тарифы' : 'Улучшить подписку'}</span>
                            <i class="fa-solid fa-chevron-down transition-transform duration-300 group-hover:translate-y-0.5 {showPlans ? 'rotate-180' : ''}"></i>
                        </button>
                    </div>
                </div>

                <!-- Выдвижной список тарифов (Аккордеон) -->
                {#if showPlans}
                    <div transition:slide={{duration: 300, easing: quintOut}} class="space-y-3 pl-1 pr-1">
                        {#if isLoadingPlans}
                            <div class="text-center py-6 text-neutral-400">
                                <i class="fa-solid fa-circle-notch animate-spin text-2xl mb-2"></i>
                                <p class="text-xs">Загружаем варианты...</p>
                            </div>
                        {:else}
                            {#each availablePlans as plan}
                                <button class="w-full relative p-4 rounded-2xl border-2 text-left transition-all duration-200 group
                                    {$user?.tier === plan.tier
                                        ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-100'
                                        : 'border-transparent bg-white shadow-sm hover:border-primary-200 hover:shadow-md'}"
                                    on:click={() => upgradeTier(plan.tier)}
                                    disabled={$user?.tier === plan.tier}>
                                    
                                    <div class="flex justify-between items-center mb-1">
                                        <h4 class="font-bold text-neutral-800 text-lg">{plan.name}</h4>
                                        {#if $user?.tier === plan.tier}
                                            <span class="text-xs font-bold text-primary-600 flex items-center gap-1">
                                                <i class="fa-solid fa-check"></i> Текущий
                                            </span>
                                        {:else}
                                            <div class="text-neutral-900 font-bold bg-neutral-100 px-2.5 py-1 rounded-lg text-sm group-hover:bg-primary-100 group-hover:text-primary-700 transition-colors">
                                                {plan.price} {plan.currency}
                                            </div>
                                        {/if}
                                    </div>
                                    
                                    <div class="text-xs text-neutral-500 mb-3">
                                        <span class="font-bold text-neutral-700">{plan.storage}</span>, файлы до {plan.maxFileSize}
                                    </div>

                                    <!-- Теги фич -->
                                    <div class="flex flex-wrap gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                        {#each plan.features.slice(0, 3) as feature}
                                            <span class="text-[10px] bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 rounded text-neutral-600">
                                                {feature}
                                            </span>
                                        {/each}
                                    </div>
                                </button>
                            {/each}
                        {/if}
                        
                        {#if upgradeError}
                            <div class="p-3 bg-red-50 text-red-600 rounded-xl text-xs flex items-center gap-2" transition:slide>
                                <i class="fa-solid fa-circle-exclamation"></i>
                                {upgradeError}
                            </div>
                        {/if}
                    </div>
                {/if}
            </section>
            {:else}
            <div class="ui-guest-card">
                <div
                    class="w-16 h-16 bg-surface rounded-full flex items-center justify-center text-primary-500 mx-auto mb-4 shadow-sm">
                    <i class="fa-regular fa-user text-2xl"></i>
                </div>
                <h3 class="font-bold text-neutral-900 mb-2">Гостевой режим</h3>
                <p class="text-sm text-neutral-600 mb-6">Войдите, чтобы синхронизировать заметки и файлы.</p>
                <button class="ui-btn-primary" on:click={openAuth}>
                    Войти / Создать
                </button>
            </div>
            {/if}



            <section>
                <h3 class="ui-settings-section-title">Оформление</h3>
                <div class="grid grid-cols-2 gap-3">
                    {#each themes as t}
                    <button class="flex items-center gap-3 p-3 rounded-xl border-2 transition-all"
                        style="border-color: {$uiState.theme === t.id ? t.color : 'transparent'}; background: var(--neutral-50)"
                        on:click={()=> setTheme(t.id)}
                        >
                        <div class="w-6 h-6 rounded-full shadow-inner" style="background: {t.color}"></div>
                        <span class="text-xs font-bold text-neutral-700">{t.label}</span>
                    </button>
                    {/each}
                </div>
            </section>

            <section>
                <h3 class="ui-settings-section-title">О приложении</h3>
                <div class="ui-settings-card space-y-3">
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-neutral-600">Версия</span>
                        <span class="font-medium text-neutral-900">{APP_VERSION} (Beta)</span>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <span class="text-neutral-600">Шифрование E2E</span>
                        <span class="font-medium text-green-600 flex items-center gap-1">
                            <i class="fa-solid fa-shield-halved"></i> Активно
                        </span>
                    </div>
                    <div class="pt-2 border-t border-neutral-100">
                        <button class="ui-btn-danger-outline w-full" on:click={handleClearCache}>
                            <i class="fa-solid fa-trash-can mr-2"></i> Очистить локальный кэш
                        </button>
                    </div>
                </div>
            </section>

            <!-- 2. Секция загрузки на другие устройства -->
            <section>
                <h3 class="ui-settings-section-title">GLYF на других устройствах</h3>
                <div class="grid grid-cols-1 gap-2">
                    <!-- Ссылка на Android -->
                    <a href={downloadLinks.android} target="_blank"
                        class="flex items-center gap-4 p-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 hover:bg-neutral-100 transition-colors">
                        <div
                            class="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center text-xl">
                            <i class="fa-brands fa-android"></i>
                        </div>
                        <div class="flex-1">
                            <div class="text-sm font-bold text-neutral-800">Скачать для Android</div>
                            <div class="text-[10px] text-neutral-500">Прямая загрузка .APK</div>
                        </div>
                        <i class="fa-solid fa-chevron-right text-neutral-300 text-xs"></i>
                    </a>

                    <!-- Ссылка на Windows -->
                    <a href={downloadLinks.windows} target="_blank"
                        class="flex items-center gap-4 p-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 hover:bg-neutral-100 transition-colors">
                        <div
                            class="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl">
                            <i class="fa-brands fa-windows"></i>
                        </div>
                        <div class="flex-1">
                            <div class="text-sm font-bold text-neutral-800">Скачать для Windows</div>
                            <div class="text-[10px] text-neutral-500">Установщик .EXE</div>
                        </div>
                        <i class="fa-solid fa-chevron-right text-neutral-300 text-xs"></i>
                    </a>
                </div>
            </section>

</div>

        {#if $isAuthenticated}
        <div class="ui-settings-footer">
            <button class="ui-btn-logout" on:click={()=> { authService.logout(); dispatch('close'); }}>
                <i class="fa-solid fa-right-from-bracket"></i> Выйти из аккаунта
            </button>
        </div>
        {/if}
    </div>
</div>
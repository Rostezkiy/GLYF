<!-- src/lib/components/Auth.svelte -->
<svelte:options runes={false} />

<script>
    import { createEventDispatcher } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    import { authService } from '$lib/auth';
    
    const dispatch = createEventDispatcher();
    
    let isLogin = true;
    let email = '';
    let password = '';
    let confirmPassword = '';
    let isLoading = false;
    let error = '';

    async function handleSubmit() {
        error = '';
        if (!email || !password) { error = 'Заполните все поля'; return; }
        if (!isLogin && password !== confirmPassword) { error = 'Пароли не совпадают'; return; }
        
        isLoading = true;
        try {
            if (isLogin) await authService.login(email, password);
            else await authService.register(email, password);
            dispatch('close');
        } catch (e) {
            error = e.message || 'Ошибка авторизации';
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="ui-backdrop flex items-center justify-center p-4 bg-surface/80"
     transition:fade={{duration: 200}} on:click|self={() => dispatch('close')} on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && dispatch('close')} role="dialog" tabindex="-1">
     
    <div class="ui-auth-container" transition:fly={{y: 20, duration: 200}}>
        <div class="ui-auth-header">
            <h2 class="text-2xl font-bold text-neutral-800">{isLogin ? 'Вход' : 'Регистрация'}</h2>
            <p class="text-sm text-neutral-500 mt-1">Синхронизируйте свои заметки</p>
        </div>

        {#if error}
            <div class="ui-auth-error">{error}</div>
        {/if}

        <div class="space-y-4">
            <input type="email" placeholder="Email" bind:value={email} class="ui-input">
            <input type="password" placeholder="Пароль" bind:value={password} class="ui-input">
            {#if !isLogin}
                <input type="password" placeholder="Повторите пароль" bind:value={confirmPassword} class="ui-input">
            {/if}
        </div>

        <button class="ui-btn-primary" on:click={handleSubmit} disabled={isLoading}>
            {#if isLoading}<i class="fa-solid fa-spinner fa-spin mr-2"></i>{/if}
            {isLogin ? 'Войти' : 'Создать аккаунт'}
        </button>

        <div class="mt-6 text-center text-sm text-neutral-500">
            {isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
            <button class="text-primary-600 font-bold hover:underline ml-1" on:click={() => isLogin = !isLogin}>
                {isLogin ? 'Регистрация' : 'Вход'}
            </button>
        </div>
    </div>
</div>
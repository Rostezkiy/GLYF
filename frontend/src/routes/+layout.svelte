<!-- src/routes/+layout.svelte -->
<script>
    import { onMount } from 'svelte';
    import { uiState } from '$lib/services/uiStore';
    import '../app.css';

    // Применяем тему сразу при инициализации компонента
    onMount(() => {
        document.documentElement.setAttribute('data-theme', $uiState.theme);
    });
</script>

<slot />
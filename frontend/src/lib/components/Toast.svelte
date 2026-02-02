<!-- src/lib/components/Toast.svelte -->
<script>
    import { fly } from 'svelte/transition';
    export let message = '';
</script>

<div class="ui-toast" transition:fly={{y: 20}}>
    {message}
</div>
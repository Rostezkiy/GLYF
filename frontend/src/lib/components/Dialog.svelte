<!-- src/lib/components/Dialog.svelte -->
<script>
    import { createEventDispatcher, onMount } from 'svelte';
    import { fade, scale } from 'svelte/transition';

    export let title = '';
    export let message = ''; // Текст для Confirm
    export let value = null; // Если не null, значит это режим Input
    export let placeholder = '';
    export let confirmLabel = 'OK';
    export let danger = false; // Красная кнопка для удаления

    const dispatch = createEventDispatcher();
    let inputEl;

    function confirm() {
        dispatch('confirm', value); // Возвращаем value (текст или null)
    }

    onMount(() => {
        if (value !== null && inputEl) inputEl.focus();
    });
</script>

<div class="ui-backdrop ui-dialog-container"
    role="dialog" tabindex="-1"
    on:keydown={(e) => e.key === 'Escape' && dispatch('cancel')}
    on:click|self={() => dispatch('cancel')} 
    transition:fade={{duration: 150}}>
    
    <div class="ui-dialog" 
         transition:scale={{start: 0.95, duration: 150}}>
      
      <!-- Header -->
      <div class="ui-dialog-content">
        {#if danger}
            <div class="ui-dialog-icon-danger">
                <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
        {/if}
        <h3 class="ui-dialog-title">{title}</h3>
        {#if message}
            <p class="ui-dialog-message">{message}</p>
        {/if}
      </div>

      <!-- Input Mode -->
      {#if value !== null}
          <div class="ui-dialog-input-wrapper">
            <input 
              bind:this={inputEl}
              bind:value 
              on:keydown={e => e.key === 'Enter' && confirm()}
              type="text" 
              class="ui-dialog-input"
              {placeholder} 
            >
          </div>
      {/if}

      <!-- Buttons -->
      <div class="ui-dialog-actions">
        <button class="ui-dialog-btn ui-dialog-btn-cancel" 
                on:click={() => dispatch('cancel')}>
            Отмена
        </button>
        <div class="w-px bg-neutral-100"></div>
        <button class="ui-dialog-btn ui-dialog-btn-confirm"
                class:is-danger={danger}
                on:click={confirm}>
            {confirmLabel}
        </button>
      </div>
    </div>
</div>
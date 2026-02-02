<svelte:options runes={false} />
<script>
    import { createEventDispatcher, onMount, tick } from 'svelte';
    import ChatBubble from '../ChatBubble.svelte';

    export let notes = [];
    const dispatch = createEventDispatcher();
    let scrollContainer;
    let lastNoteId = null;
    let isReady = false; // Флаг готовности (чтобы скрыть рывок скролла)

    // Сортировка: Старые сверху, Новые снизу
    $: sortedNotes = [...notes].sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Умный автоскролл при появлении НОВЫХ сообщений
    $: if (isReady && sortedNotes && sortedNotes.length > 0) {
        const currentLastId = sortedNotes[sortedNotes.length - 1].id;
        
        // Если ID последнего сообщения изменился (значит пришло новое)
        if (currentLastId !== lastNoteId) {
            lastNoteId = currentLastId;
            // Ждем отрисовки и скроллим плавно
            tick().then(() => scrollToBottom('smooth'));
        }
    }

    // Универсальная функция скролла
    function scrollToBottom(behavior = 'smooth') {
        if (scrollContainer) {
            scrollContainer.scrollTo({
                top: scrollContainer.scrollHeight,
                behavior: behavior
            });
        }
    }

    onMount(async () => {
        // Инициализируем ID последнего сообщения
        if (sortedNotes.length > 0) {
            lastNoteId = sortedNotes[sortedNotes.length - 1].id;
        }

        // Ждем пока DOM отрисуется
        await tick();
        
        // 1. Мгновенно прыгаем вниз (пока элемент невидим)
        scrollToBottom('auto');

        // 2. Делаем элемент видимым
        // requestAnimationFrame гарантирует, что скролл применился ДО отрисовки кадра
        requestAnimationFrame(() => {
            isReady = true;
            // Страховочный скролл на случай подгрузки картинок
            setTimeout(() => scrollToBottom('auto'), 50);
        });
    });
</script>

<!-- Добавлены классы transition-opacity и управление прозрачностью -->
<div 
    class="flex-1 overflow-y-auto p-4 custom-scrollbar bg-neutral-50/50 dark:bg-neutral-900/50 transition-opacity duration-200"
    class:opacity-0={!isReady}
    class:opacity-100={isReady}
    bind:this={scrollContainer}
>
    <div class="flex flex-col gap-4 pb-4 justify-end min-h-full">
        {#if sortedNotes.length === 0}
            <div class="text-center text-neutral-400 py-10 opacity-60 m-auto">
                <i class="fa-regular fa-comments text-4xl mb-2"></i>
                <p>Сообщений нет. Напишите что-нибудь!</p>
            </div>
        {:else}
            {#each sortedNotes as note (note.id)}
                <ChatBubble 
                    {note} 
                    on:click={() => dispatch('noteClick', note)}
                    on:contextmenu={(e) => dispatch('contextmenu', e.detail)}
                />
            {/each}
        {/if}
    </div>
</div>
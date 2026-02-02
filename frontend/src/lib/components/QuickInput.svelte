<!-- src/lib/components/QuickInput.svelte -->
<svelte:options runes={false} />

<script>
    import { saveNote } from '$lib/services/noteService';
    import { generateThumbnailBlob } from '$lib/imageUtils';
    import { onDestroy } from 'svelte';
    import { fileService } from '$lib/services/fileService';

    export let folderId = null;

    let inputText = '';
    let attachments = [];
    
    // Audio State
    let isRecording = false;
    let isPaused = false;
    let mediaRecorder = null;
    let audioChunks = [];
    let recordingTime = 0;
    let recordingTimer;
    
    // Flags
    let fileInput;
    let isSubmitting = false;
    let isCancelled = false; // Флаг для отмены сохранения

    // --- PASTE LOGIC (Вставка из буфера) ---
    async function handlePaste(e) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let hasFile = false;
        
        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    hasFile = true;
                    await addAttachment(file);
                }
            }
        }
    }

    // --- AUDIO LOGIC ---
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            isCancelled = false;
            
            mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
            
            mediaRecorder.onstop = async () => {
                // Останавливаем треки (освобождаем микрофон)
                stream.getTracks().forEach(t => t.stop());

                if (isCancelled) {
                    audioChunks = [];
                    return; // Выходим без сохранения
                }

                if (audioChunks.length === 0) return;
                
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const file = new File([audioBlob], `Voice_${new Date().toLocaleTimeString()}.webm`, { type: 'audio/webm' });
                
                await addAttachment(file);
            };

            mediaRecorder.start();
            isRecording = true;
            isPaused = false;
            startTimer();
        } catch (e) {
            console.error('Mic error:', e);
            alert('Ошибка доступа к микрофону. Проверьте разрешения.');
        }
    }

    function togglePause() {
        if (!mediaRecorder) return;
        
        if (isPaused) {
            mediaRecorder.resume();
            isPaused = false;
            startTimer();
        } else {
            mediaRecorder.pause();
            isPaused = true;
            stopTimer();
        }
    }

    // Эта функция останавливает запись и НЕ сохраняет файл
    function cancelRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            isCancelled = true; // Помечаем как отмену
            mediaRecorder.stop();
        }
        resetRecordingState();
    }

    // Эта функция останавливает запись и сохраняет файл (через onstop)
    function finishRecordingAndSend() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop(); 
        }
        resetRecordingState();
    }

    // Таймер
    function startTimer() {
        stopTimer();
        recordingTimer = setInterval(() => {
            recordingTime += 100;
        }, 100);
    }

    function stopTimer() {
        clearInterval(recordingTimer);
    }

    function resetRecordingState() {
        stopTimer();
        isRecording = false;
        isPaused = false;
        recordingTime = 0;
    }

    function formatDuration(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    // --- FILE LOGIC ---
    async function handleFileSelect(e) {
        if (e.target.files) {
            for (const file of e.target.files) {
                await addAttachment(file);
            }
        }
        e.target.value = '';
    }

    async function addAttachment(file) {
        let preview = null;
        if (file.type.startsWith('image/')) {
            const blob = await generateThumbnailBlob(file, 200, 0.5);
            if (blob) preview = URL.createObjectURL(blob);
        }
        attachments = [...attachments, { file, id: crypto.randomUUID(), preview }];
    }

    function removeAttachment(index) {
        const att = attachments[index];
        if (att.preview) URL.revokeObjectURL(att.preview);
        attachments = attachments.filter((_, i) => i !== index);
    }

    // --- SEND LOGIC ---
    async function sendMessage() {
        if ((!inputText.trim() && attachments.length === 0) || isSubmitting) return;
        
        // Если идет запись, завершаем её
        if (isRecording) {
            finishRecordingAndSend();
            setTimeout(sendMessage, 200); 
            return;
        }

        isSubmitting = true;

        try {
            const processedAttachments = [];

            // 1. Сохраняем физические файлы в БД
            for (const att of attachments) {
                let thumbnailBlob = null;
                if (att.file.type.startsWith('image/')) {
                     thumbnailBlob = await generateThumbnailBlob(att.file);
                }

                await fileService.saveFileToDb({
                    id: att.id,
                    noteId: null,
                    name: att.file.name,
                    type: att.file.type,
                    size: att.file.size,
                    data: att.file,
                    thumbnail: thumbnailBlob,
                    createdAt: new Date().toISOString()
                });

                processedAttachments.push({
                    id: att.id,
                    name: att.file.name,
                    type: att.file.type,
                    size: att.file.size
                });
            }

            // 2. Создаем заметку
            const newNote = {
                id: crypto.randomUUID(),
                title: '',
                content: inputText.replace(/\n/g, '<br>'),
                folderId: folderId,
                attachments: processedAttachments,
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                syncStatus: 'dirty'
            };

            await saveNote(newNote);

            // 3. Очистка формы
            inputText = '';
            attachments.forEach(a => a.preview && URL.revokeObjectURL(a.preview));
            attachments = [];
            
            const ta = document.querySelector('.ui-chat-textarea');
            if(ta) ta.style.height = 'auto';

        } catch (e) {
            console.error('Send error:', e);
            alert('Ошибка отправки: ' + e.message);
        } finally {
            isSubmitting = false;
        }
    }

    // --- ИСПРАВЛЕННЫЙ LIFECYCLE ---
    onDestroy(() => {
        // Здесь была ошибка: stopRecording(true) не существовал
        cancelRecording(); 
        
        attachments.forEach(a => a.preview && URL.revokeObjectURL(a.preview));
    });
</script>

<div class="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2 md:p-4 z-20">
    <!-- Превью вложений -->
    {#if attachments.length > 0}
        <div class="flex gap-2 overflow-x-auto pb-2 mb-2 custom-scrollbar">
            {#each attachments as att, i}
                <div class="relative flex-shrink-0 w-16 h-16 bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200">
                    {#if att.preview}
                        <img src={att.preview} alt="" class="w-full h-full object-cover">
                    {:else}
                        <div class="w-full h-full flex items-center justify-center text-neutral-400">
                            <i class="fa-solid fa-file"></i>
                        </div>
                    {/if}
                    <button class="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-bl-lg hover:bg-red-600"
                        on:click={() => removeAttachment(i)}>
                        <i class="fa-solid fa-times text-xs"></i>
                    </button>
                </div>
            {/each}
        </div>
    {/if}

    <!-- UI Записи -->
    {#if isRecording}
        <div class="flex items-center gap-2 p-2 bg-red-50 text-red-600 rounded-xl mb-1 border border-red-100">
            <div class="flex items-center gap-2 flex-1">
                <div class="w-2 h-2 bg-red-600 rounded-full {isPaused ? '' : 'animate-pulse'}"></div>
                <span class="font-mono font-bold text-sm min-w-[3.5rem]">{formatDuration(recordingTime)}</span>
                
                {#if isPaused}
                    <span class="text-xs text-red-400 uppercase font-bold tracking-wider">Пауза</span>
                {/if}
            </div>
            
            <!-- Кнопки управления записью -->
            <button class="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-red-200 text-red-500 hover:bg-red-50" 
                on:click={cancelRecording} title="Отменить и удалить">
                <i class="fa-solid fa-trash-can"></i>
            </button>

            <button class="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-red-200 text-red-500 hover:bg-red-50" 
                on:click={togglePause} title={isPaused ? "Продолжить" : "Пауза"}>
                <i class="fa-solid {isPaused ? 'fa-play' : 'fa-pause'}"></i>
            </button>

            <button class="w-8 h-8 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 shadow-md" 
                on:click={finishRecordingAndSend} title="Готово">
                <i class="fa-solid fa-check"></i>
            </button>
        </div>
    {:else}
        <!-- Обычный ввод -->
        <div class="flex items-end gap-2">
            <button class="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-primary-600 transition-colors shrink-0"
                on:click={() => fileInput.click()} title="Прикрепить файл">
                <i class="fa-solid fa-paperclip text-lg"></i>
            </button>
            
            <div class="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-2xl px-4 py-2 min-h-[44px]">
                <textarea 
                    class="ui-chat-textarea w-full bg-transparent border-none outline-none resize-none max-h-32 py-1 text-sm dark:text-neutral-200"
                    placeholder="Сообщение..."
                    rows="1"
                    bind:value={inputText}
                    on:paste={handlePaste}
                    on:input={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                    on:keydown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                ></textarea>
            </div>

            {#if inputText.trim() || attachments.length > 0}
                <button class="w-10 h-10 flex items-center justify-center bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-all shadow-md disabled:opacity-50 shrink-0"
                    disabled={isSubmitting}
                    on:click={sendMessage}>
                    {#if isSubmitting}
                        <i class="fa-solid fa-spinner fa-spin"></i>
                    {:else}
                        <i class="fa-solid fa-arrow-up"></i>
                    {/if}
                </button>
            {:else}
                <button class="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-red-500 transition-colors shrink-0"
                    on:click={startRecording} title="Записать голосовое">
                    <i class="fa-solid fa-microphone text-lg"></i>
                </button>
            {/if}
        </div>
    {/if}

    <input type="file" multiple class="hidden" bind:this={fileInput} on:change={handleFileSelect} />
</div>
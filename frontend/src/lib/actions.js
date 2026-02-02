/* ===============================
   CLICK OUTSIDE
   =============================== */
export function clickOutside(node) {
    const handleClick = event => {
        if (node && !node.contains(event.target) && !event.defaultPrevented) {
            node.dispatchEvent(new CustomEvent('click_outside'));
        }
    };

    document.addEventListener('click', handleClick, true);

    return {
        destroy() {
            document.removeEventListener('click', handleClick, true);
        }
    };
}


/* ===============================
   LONG PRESS (WEB / TAGS)
   =============================== */
export function longpress(node, duration = 500) {
    let timer;

    const start = e => {
        if (e.type === 'mousedown' && e.button !== 0) return;

        timer = setTimeout(() => {
            node.dispatchEvent(
                new CustomEvent('longpress', { detail: { originalEvent: e } })
            );
        }, duration);
    };

    const cancel = () => clearTimeout(timer);

    node.addEventListener('mousedown', start);
    node.addEventListener('touchstart', start, { passive: true });

    node.addEventListener('mouseup', cancel);
    node.addEventListener('mouseleave', cancel);
    node.addEventListener('touchend', cancel);
    node.addEventListener('touchmove', cancel, { passive: true });

    return {
        destroy() {
            cancel();
            node.removeEventListener('mousedown', start);
            node.removeEventListener('touchstart', start);
            node.removeEventListener('mouseup', cancel);
            node.removeEventListener('mouseleave', cancel);
            node.removeEventListener('touchend', cancel);
            node.removeEventListener('touchmove', cancel);
        }
    };
}


/* ===============================
   OBSIDIAN-STYLE GESTURE DRAG
   (Capacitor / Mobile-first)
   =============================== */
export function gestureDrag(node, options) {
    const {
        item,
        onDragStart,
        onDragMove,
        onDragEnd,
        onMenu
    } = options;

    let state = 'idle'; // idle | pressing | dragging | menu
    let pressTimer;
    let startX = 0;
    let startY = 0;
    let pointerId = null;

    const LONG_PRESS_MS = 420;
    const MOVE_THRESHOLD = 8;

    function onPointerDown(e) {
        if (e.pointerType === 'mouse') return;

        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        state = 'pressing';

        node.setPointerCapture(pointerId);

        pressTimer = setTimeout(() => {
            state = 'menu';
            onDragStart?.(e, item, { preview: true });
        }, LONG_PRESS_MS);
    }

    function onPointerMove(e) {
        if (e.pointerId !== pointerId) return;
        if (state !== 'pressing' && state !== 'dragging') return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const dist = Math.hypot(dx, dy);

        if (state === 'pressing' && dist > MOVE_THRESHOLD) {
            clearTimeout(pressTimer);
            state = 'dragging';
            onDragStart?.(e, item, { preview: false });
        }

        if (state === 'dragging') {
            onDragMove?.(e, item);
        }
    }

    function onPointerUp(e) {
        if (e.pointerId !== pointerId) return;

        clearTimeout(pressTimer);

        if (state === 'menu') {
            onMenu?.(e, item);
        }

        if (state === 'dragging') {
            onDragEnd?.(e, item);
        }

        cleanup();
    }

    function cleanup() {
        state = 'idle';
        try {
            node.releasePointerCapture(pointerId);
        } catch {}
        pointerId = null;
    }

    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);
    node.addEventListener('pointercancel', cleanup);

    return {
        destroy() {
            clearTimeout(pressTimer);
            node.removeEventListener('pointerdown', onPointerDown);
            node.removeEventListener('pointermove', onPointerMove);
            node.removeEventListener('pointerup', onPointerUp);
            node.removeEventListener('pointercancel', cleanup);
        }
    };
}

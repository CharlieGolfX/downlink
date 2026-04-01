<script lang="ts">
    import { toasts, type Toast } from "$lib/stores/toasts";

    // Track toasts that are animating out so we can play the exit animation
    // before actually removing them from the store.
    let exiting = $state<Set<number>>(new Set());

    // Track which toasts already have auto-dismiss timers scheduled
    let scheduled = new Set<number>();

    function handleDismiss(toast: Toast) {
        if (exiting.has(toast.id)) return;

        // Start exit animation
        const next = new Set(exiting);
        next.add(toast.id);
        exiting = next;

        // After animation completes, remove from store
        setTimeout(() => {
            toasts.dismiss(toast.id);
            const cleanup = new Set(exiting);
            cleanup.delete(toast.id);
            exiting = cleanup;
            scheduled.delete(toast.id);
        }, 300);
    }

    // Whenever the toast list changes, schedule auto-dismiss for new toasts
    $effect(() => {
        const current = $toasts;
        for (const toast of current) {
            if (!scheduled.has(toast.id) && !exiting.has(toast.id)) {
                scheduled.add(toast.id);
                setTimeout(() => {
                    handleDismiss(toast);
                }, toast.duration);
            }
        }
    });
</script>

{#if $toasts.length > 0}
    <div class="toast-container" aria-live="polite" aria-atomic="false">
        {#each $toasts as toast (toast.id)}
            <button
                class="toast toast-{toast.type}"
                class:exiting={exiting.has(toast.id)}
                onclick={() => handleDismiss(toast)}
            >
                <span class="toast-icon">
                    {#if toast.type === "error"}
                        ✕
                    {:else if toast.type === "success"}
                        ✓
                    {:else}
                        ℹ
                    {/if}
                </span>
                <span class="toast-message">{toast.message}</span>
            </button>
        {/each}
    </div>
{/if}

<style>
    .toast-container {
        position: fixed;
        top: 3.5rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9000;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        pointer-events: none;
    }

    .toast {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 1rem;
        border: none;
        border-radius: 8px;
        font-family: inherit;
        font-size: 0.85rem;
        font-weight: 500;
        line-height: 1.3;
        max-width: 420px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        cursor: pointer;
        user-select: none;
        text-align: left;
        animation: slide-in 0.3s ease forwards;
        transition:
            opacity 0.3s ease,
            transform 0.3s ease;
    }

    .toast.exiting {
        animation: slide-out 0.3s ease forwards;
    }

    @keyframes slide-in {
        from {
            opacity: 0;
            transform: translateY(-12px) scale(0.96);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    @keyframes slide-out {
        from {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
        to {
            opacity: 0;
            transform: translateY(-12px) scale(0.96);
        }
    }

    .toast-icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.3rem;
        height: 1.3rem;
        border-radius: 50%;
        font-size: 0.7rem;
        font-weight: 700;
        line-height: 1;
        color: #fff;
    }

    /* ── Error variant ─────────────────── */
    .toast-error {
        background-color: #fef2f2;
        color: #991b1b;
        outline: 1px solid #fecaca;
    }

    .toast-error .toast-icon {
        background-color: #dc2626;
    }

    /* ── Success variant ────────────────── */
    .toast-success {
        background-color: #f0fdf4;
        color: #166534;
        outline: 1px solid #bbf7d0;
    }

    .toast-success .toast-icon {
        background-color: #16a34a;
    }

    /* ── Info variant ───────────────────── */
    .toast-info {
        background-color: #eff6ff;
        color: #1e40af;
        outline: 1px solid #bfdbfe;
    }

    .toast-info .toast-icon {
        background-color: #2563eb;
    }

    /* ── Dark mode ──────────────────────── */
    :global(html.dark) .toast-error {
        background-color: #3b1111;
        color: #fca5a5;
        outline-color: #7f1d1d;
    }

    :global(html.dark) .toast-error .toast-icon {
        background-color: #ef4444;
    }

    :global(html.dark) .toast-success {
        background-color: #0f2a1a;
        color: #86efac;
        outline-color: #14532d;
    }

    :global(html.dark) .toast-success .toast-icon {
        background-color: #22c55e;
    }

    :global(html.dark) .toast-info {
        background-color: #111827;
        color: #93c5fd;
        outline-color: #1e3a5f;
    }

    :global(html.dark) .toast-info .toast-icon {
        background-color: #3b82f6;
    }
</style>

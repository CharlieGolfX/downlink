<script lang="ts">
    import { modalOpen } from "$lib/stores/ui";

    let {
        open = $bindable(false),
    }: {
        open: boolean;
    } = $props();

    $effect(() => {
        modalOpen.set(open);
    });

    const shortcuts: { keys: string[]; action: string }[] = [
        { keys: ["W"], action: "Previous article" },
        { keys: ["S"], action: "Next article" },
        { keys: ["↑", "↓"], action: "Scroll article content" },
        { keys: ["Q", "Esc"], action: "Close article" },
        { keys: ["⌘ + N", "Ctrl + N"], action: "Add new feed" },
    ];

    function close() {
        open = false;
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            close();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            close();
        }
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="backdrop"
        onclick={handleBackdropClick}
        onkeydown={handleKeydown}
    >
        <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard Shortcuts"
        >
            <header class="modal-header">
                <h2>Keyboard Shortcuts</h2>
                <button class="close-btn" onclick={close} aria-label="Close"
                    >&times;</button
                >
            </header>

            <div class="body">
                <div class="shortcuts-table">
                    {#each shortcuts as shortcut}
                        <div class="shortcut-row">
                            <div class="shortcut-keys">
                                {#each shortcut.keys as key, i}
                                    {#if i > 0}
                                        <span class="separator">/</span>
                                    {/if}
                                    <kbd>{key}</kbd>
                                {/each}
                            </div>
                            <div class="shortcut-action">
                                {shortcut.action}
                            </div>
                        </div>
                    {/each}
                </div>

                <footer class="modal-footer">
                    <button type="button" class="btn btn-cancel" onclick={close}
                        >Close</button
                    >
                </footer>
            </div>
        </div>
    </div>
{/if}

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgba(0, 0, 0, 0.45);
    }

    .modal {
        background-color: #fff;
        border-radius: 10px;
        width: 90%;
        max-width: 460px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
        overflow: hidden;
    }

    :global(html.dark) .modal {
        background-color: #2a2a2a;
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid #e0e0e0;
    }

    :global(html.dark) .modal-header {
        border-bottom-color: #3a3a3a;
    }

    .modal-header h2 {
        font-size: 1.05rem;
        font-weight: 600;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.4rem;
        line-height: 1;
        cursor: pointer;
        color: inherit;
        opacity: 0.5;
        transition: opacity 0.15s;
    }

    .close-btn:hover {
        opacity: 1;
    }

    .body {
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    /* ── Shortcuts table ── */

    .shortcuts-table {
        display: flex;
        flex-direction: column;
    }

    .shortcut-row {
        display: flex;
        align-items: center;
        padding: 0.35rem 0;
        gap: 1rem;
    }

    .shortcut-keys {
        min-width: 120px;
        display: flex;
        align-items: center;
        gap: 0.25rem;
        flex-shrink: 0;
    }

    .separator {
        font-size: 0.75rem;
        opacity: 0.45;
        margin: 0 0.05rem;
    }

    kbd {
        display: inline-block;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        font-size: 0.8rem;
        font-family:
            ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono", Menlo,
            Monaco, Consolas, monospace;
        background-color: #f0f0f0;
        border: 1px solid #d0d0d0;
        line-height: 1.4;
    }

    :global(html.dark) kbd {
        background-color: #3a3a3a;
        border-color: #555;
    }

    .shortcut-action {
        font-size: 0.85rem;
    }

    /* ── Footer ── */

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding-top: 0.75rem;
    }

    .btn {
        padding: 0.45rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition:
            background-color 0.15s ease,
            opacity 0.15s ease;
    }

    .btn-cancel {
        background-color: transparent;
        color: inherit;
        opacity: 0.7;
    }

    .btn-cancel:hover {
        opacity: 1;
        background-color: rgba(128, 128, 128, 0.1);
    }
</style>

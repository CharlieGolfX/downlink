<script lang="ts">
    import { AVAILABLE_TAGS } from "$lib/tags";
    import { modalOpen } from "$lib/stores/ui";

    $effect(() => {
        modalOpen.set(open);
    });

    let {
        open = $bindable(false),
        onsubmit,
    }: {
        open: boolean;
        onsubmit?: (url: string, tags: string[]) => void;
    } = $props();

    let url = $state("");
    let selectedTags = $state<Set<string>>(new Set());
    let error = $state("");

    function toggleTag(tag: string) {
        const next = new Set(selectedTags);
        if (next.has(tag)) {
            next.delete(tag);
        } else {
            next.add(tag);
        }
        selectedTags = next;
    }

    function reset() {
        url = "";
        selectedTags = new Set();
        error = "";
    }

    function close() {
        reset();
        open = false;
    }

    function handleSubmit(e: Event) {
        e.preventDefault();

        const trimmed = url.trim();
        if (!trimmed) {
            error = "Please enter a feed URL.";
            return;
        }

        try {
            new URL(trimmed);
        } catch {
            error = "Please enter a valid URL.";
            return;
        }

        error = "";
        onsubmit?.(trimmed, [...selectedTags]);
        close();
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
            aria-label="Add RSS Feed"
        >
            <header class="modal-header">
                <h2>Add Feed</h2>
                <button class="close-btn" onclick={close} aria-label="Close"
                    >&times;</button
                >
            </header>

            <form onsubmit={handleSubmit}>
                <div class="field">
                    <label for="feed-url">Website or Feed URL</label>
                    <input
                        id="feed-url"
                        type="url"
                        placeholder="https://example.com"
                        bind:value={url}
                        autocomplete="off"
                    />
                    {#if error}
                        <p class="error">{error}</p>
                    {/if}
                </div>

                <div class="field">
                    <label for="feed-tags">Tags</label>
                    <div class="tags" id="feed-tags">
                        {#each AVAILABLE_TAGS as tag}
                            <button
                                type="button"
                                class="tag"
                                class:active={selectedTags.has(tag)}
                                onclick={() => toggleTag(tag)}
                            >
                                {tag}
                            </button>
                        {/each}
                    </div>
                </div>

                <footer class="modal-footer">
                    <button type="button" class="btn btn-cancel" onclick={close}
                        >Cancel</button
                    >
                    <button type="submit" class="btn btn-add">Add Feed</button>
                </footer>
            </form>
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

    @media (prefers-color-scheme: dark) {
        .modal {
            background-color: #2a2a2a;
        }
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid #e0e0e0;
    }

    @media (prefers-color-scheme: dark) {
        .modal-header {
            border-bottom-color: #3a3a3a;
        }
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

    form {
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .field label {
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        opacity: 0.7;
    }

    .field input {
        padding: 0.55rem 0.7rem;
        font-size: 0.9rem;
        border-radius: 6px;
        border: 1px solid #d0d0d0;
        background-color: #f9f9f9;
        color: inherit;
        outline: none;
        transition: border-color 0.15s;
    }

    .field input:focus {
        border-color: #5b9bd5;
    }

    @media (prefers-color-scheme: dark) {
        .field input {
            background-color: #333;
            border-color: #555;
        }
    }

    .error {
        font-size: 0.8rem;
        color: #d9534f;
    }

    .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
    }

    .tag {
        padding: 0.3rem 0.7rem;
        font-size: 0.8rem;
        border-radius: 999px;
        border: 1px solid #d0d0d0;
        background-color: transparent;
        color: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
    }

    .tag:hover {
        border-color: #5b9bd5;
    }

    .tag.active {
        background-color: #5b9bd5;
        border-color: #5b9bd5;
        color: #fff;
    }

    @media (prefers-color-scheme: dark) {
        .tag {
            border-color: #555;
        }

        .tag:hover {
            border-color: #5b9bd5;
        }

        .tag.active {
            background-color: #5b9bd5;
            border-color: #5b9bd5;
            color: #fff;
        }
    }

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding-top: 0.25rem;
    }

    .btn {
        padding: 0.45rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition: background-color 0.15s ease;
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

    .btn-add {
        background-color: #5b9bd5;
        color: #fff;
    }

    .btn-add:hover {
        background-color: #4a89c0;
    }

    .btn-add:active {
        background-color: #3d7ab0;
    }
</style>

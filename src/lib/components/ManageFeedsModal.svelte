<script lang="ts">
    import { AVAILABLE_TAGS } from "$lib/tags";
    import { feeds, removeFeed, updateFeedTags } from "$lib/stores/feeds";
    import { modalOpen } from "$lib/stores/ui";
    import type { Feed } from "$lib/types/feed";

    $effect(() => {
        modalOpen.set(open);
    });

    let {
        open = $bindable(false),
    }: {
        open: boolean;
    } = $props();

    let confirmingRemove = $state<string | null>(null);

    function close() {
        confirmingRemove = null;
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

    function toggleTag(feed: Feed, tag: string) {
        const current = feed.tags;
        const next = current.includes(tag)
            ? current.filter((t) => t !== tag)
            : [...current, tag];
        updateFeedTags(feed.id, next);
    }

    function handleRemove(feedId: string) {
        if (confirmingRemove === feedId) {
            removeFeed(feedId);
            confirmingRemove = null;
        } else {
            confirmingRemove = feedId;
        }
    }

    function cancelRemove() {
        confirmingRemove = null;
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
            aria-label="Manage Feeds"
        >
            <header class="modal-header">
                <h2>Manage Feeds</h2>
                <button class="close-btn" onclick={close} aria-label="Close"
                    >&times;</button
                >
            </header>

            <div class="modal-body">
                {#if $feeds.length === 0}
                    <p class="empty">No feeds added yet.</p>
                {:else}
                    <ul class="feed-list">
                        {#each $feeds as feed (feed.id)}
                            <li class="feed-item">
                                <div class="feed-info">
                                    <span class="feed-title">{feed.title}</span>
                                    <span class="feed-url">{feed.url}</span>
                                </div>

                                <div class="feed-tags">
                                    <span class="tags-label">Tags</span>
                                    <div class="tags">
                                        {#each AVAILABLE_TAGS as tag}
                                            <button
                                                type="button"
                                                class="tag"
                                                class:active={feed.tags.includes(
                                                    tag,
                                                )}
                                                onclick={() =>
                                                    toggleTag(feed, tag)}
                                            >
                                                {tag}
                                            </button>
                                        {/each}
                                    </div>
                                </div>

                                <div class="feed-actions">
                                    {#if confirmingRemove === feed.id}
                                        <span class="confirm-text"
                                            >Remove this feed?</span
                                        >
                                        <button
                                            class="btn btn-danger"
                                            onclick={() =>
                                                handleRemove(feed.id)}
                                        >
                                            Confirm
                                        </button>
                                        <button
                                            class="btn btn-cancel"
                                            onclick={cancelRemove}
                                        >
                                            Cancel
                                        </button>
                                    {:else}
                                        <button
                                            class="btn btn-remove"
                                            onclick={() =>
                                                handleRemove(feed.id)}
                                        >
                                            Remove
                                        </button>
                                    {/if}
                                </div>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>

            <footer class="modal-footer">
                <button class="btn btn-done" onclick={close}>Done</button>
            </footer>
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
        max-width: 540px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
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
        flex-shrink: 0;
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

    .modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 1rem 1.25rem;
    }

    .empty {
        text-align: center;
        color: #888;
        font-size: 0.9rem;
        padding: 2rem 0;
    }

    .feed-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .feed-item {
        padding: 0.85rem;
        border-radius: 8px;
        border: 1px solid #e4e4e4;
        background-color: #fafafa;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }

    @media (prefers-color-scheme: dark) {
        .feed-item {
            background-color: #333;
            border-color: #444;
        }
    }

    .feed-info {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
    }

    .feed-title {
        font-size: 0.9rem;
        font-weight: 600;
    }

    .feed-url {
        font-size: 0.72rem;
        color: #888;
        word-break: break-all;
    }

    .feed-tags {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }

    .tags-label {
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        opacity: 0.6;
    }

    .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
    }

    .tag {
        padding: 0.2rem 0.55rem;
        font-size: 0.72rem;
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

    .feed-actions {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding-top: 0.15rem;
    }

    .confirm-text {
        font-size: 0.78rem;
        color: #d9534f;
        margin-right: 0.2rem;
    }

    .btn {
        padding: 0.3rem 0.7rem;
        font-size: 0.78rem;
        font-weight: 500;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition: background-color 0.15s ease;
    }

    .btn-remove {
        background-color: transparent;
        color: #d9534f;
        border: 1px solid #d9534f;
    }

    .btn-remove:hover {
        background-color: #d9534f;
        color: #fff;
    }

    .btn-danger {
        background-color: #d9534f;
        color: #fff;
    }

    .btn-danger:hover {
        background-color: #c9302c;
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

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        padding: 0.75rem 1.25rem;
        border-top: 1px solid #e0e0e0;
        flex-shrink: 0;
    }

    @media (prefers-color-scheme: dark) {
        .modal-footer {
            border-top-color: #3a3a3a;
        }
    }

    .btn-done {
        background-color: #5b9bd5;
        color: #fff;
        padding: 0.45rem 1rem;
        font-size: 0.875rem;
    }

    .btn-done:hover {
        background-color: #4a89c0;
    }

    .btn-done:active {
        background-color: #3d7ab0;
    }
</style>

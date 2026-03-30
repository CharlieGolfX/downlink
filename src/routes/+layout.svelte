<script lang="ts">
    import type { Snippet } from "svelte";
    import { onMount, onDestroy } from "svelte";
    import AddFeedModal from "$lib/components/AddFeedModal.svelte";
    import ManageFeedsModal from "$lib/components/ManageFeedsModal.svelte";
    import { fetchFeed, refreshAllFeeds } from "$lib/services/rss";
    import { triggerRefresh, markUpdated } from "$lib/stores/ui";
    import {
        feeds,
        activeTag,
        upsertFeed,
        addFeedArticles,
    } from "$lib/stores/feeds";
    import { AVAILABLE_TAGS } from "$lib/tags";
    import type { Article } from "$lib/types/feed";

    const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    let { children }: { children: Snippet } = $props();

    let showAddFeed = $state(false);
    let showManageFeeds = $state(false);
    let loading = $state(false);
    let refreshing = $state(false);
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function handleAddFeed(url: string, tags: string[]) {
        loading = true;
        try {
            const result = await fetchFeed(url);

            const feedId = url;
            const feedTitle = result.title || url;
            const feedLogo = result.logo ?? undefined;

            upsertFeed({
                id: feedId,
                title: feedTitle,
                url,
                description: result.description ?? undefined,
                logo: feedLogo,
                tags,
                lastUpdated: new Date().toISOString(),
            });

            const articles: Article[] = result.articles.map((a) => ({
                id: a.id,
                feedId,
                feedTitle,
                feedLogo,
                title: a.title,
                url: a.url,
                content: a.content ?? undefined,
                summary: a.summary ?? undefined,
                author: a.author ?? undefined,
                publishedAt: a.published_at ?? undefined,
                read: false,
                categories: a.categories.length > 0 ? a.categories : undefined,
            }));

            addFeedArticles(articles);
        } catch (err) {
            console.error("Failed to add feed:", err);
        } finally {
            loading = false;
        }
    }

    async function handleRefresh() {
        if (refreshing) return;
        refreshing = true;
        triggerRefresh();
        try {
            const count = await refreshAllFeeds();
            markUpdated();
            console.log(`Refreshed ${count} feed(s)`);
        } catch (err) {
            console.error("Refresh failed:", err);
        } finally {
            refreshing = false;
        }
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(() => {
            handleRefresh();
        }, POLL_INTERVAL_MS);
    }

    function stopPolling() {
        if (pollTimer !== null) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    onMount(() => {
        startPolling();
    });

    onDestroy(() => {
        stopPolling();
    });
</script>

<div class="app">
    <header class="topbar">
        <div class="topbar-left">
            <select class="feed-select" bind:value={$activeTag}>
                <option value="all">All</option>
                {#each AVAILABLE_TAGS as tag}
                    <option value={tag}>{tag}</option>
                {/each}
            </select>
        </div>
        <div class="topbar-right">
            {#if loading || refreshing}
                <span class="loading-indicator">
                    {#if refreshing}Refreshing…{:else}Loading…{/if}
                </span>
            {/if}
            <button
                class="refresh-btn"
                title="Refresh all feeds"
                onclick={handleRefresh}
                disabled={refreshing}
                class:spin={refreshing}
            >
                &#8635;
            </button>
            <button
                class="manage-btn"
                title="Manage feeds"
                onclick={() => (showManageFeeds = true)}>&#9998;</button
            >
            <button
                class="add-btn"
                title="Add new source"
                onclick={() => (showAddFeed = true)}>+</button
            >
        </div>
    </header>

    <main class="content">
        {@render children()}
    </main>
</div>

<AddFeedModal bind:open={showAddFeed} onsubmit={handleAddFeed} />
<ManageFeedsModal bind:open={showManageFeeds} />

<style>
    :global(*) {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    :global(body) {
        font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
            Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
        color: #1a1a1a;
        background-color: #f5f5f5;
    }

    @media (prefers-color-scheme: dark) {
        :global(body) {
            color: #e4e4e4;
            background-color: #1a1a1a;
        }
    }

    .app {
        display: flex;
        flex-direction: column;
        height: 100vh;
    }

    .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 1rem;
        background-color: #ffffff;
        border-bottom: 1px solid #e0e0e0;
        flex-shrink: 0;
    }

    @media (prefers-color-scheme: dark) {
        .topbar {
            background-color: #2a2a2a;
            border-bottom-color: #3a3a3a;
        }
    }

    .feed-select {
        font-size: 0.875rem;
        padding: 0.35rem 0.6rem;
        border-radius: 6px;
        border: 1px solid #d0d0d0;
        background-color: #f9f9f9;
        color: inherit;
        cursor: pointer;
        outline: none;
    }

    .feed-select:focus {
        border-color: #5b9bd5;
    }

    @media (prefers-color-scheme: dark) {
        .feed-select {
            background-color: #333;
            border-color: #555;
        }

        .feed-select:focus {
            border-color: #5b9bd5;
        }
    }

    .topbar-right {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .loading-indicator {
        font-size: 0.75rem;
        color: #999;
    }

    .refresh-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        font-size: 1.15rem;
        line-height: 1;
        border: none;
        border-radius: 6px;
        background-color: transparent;
        color: inherit;
        cursor: pointer;
        opacity: 0.55;
        transition:
            opacity 0.15s ease,
            background-color 0.15s ease,
            transform 0.15s ease;
    }

    .refresh-btn:hover {
        opacity: 1;
        background-color: rgba(128, 128, 128, 0.12);
    }

    .refresh-btn:active {
        background-color: rgba(128, 128, 128, 0.2);
    }

    .refresh-btn:disabled {
        cursor: default;
    }

    .refresh-btn.spin {
        animation: spin 1s linear infinite;
        opacity: 0.8;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    .manage-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        font-size: 1rem;
        line-height: 1;
        border: none;
        border-radius: 6px;
        background-color: transparent;
        color: inherit;
        cursor: pointer;
        opacity: 0.55;
        transition:
            opacity 0.15s ease,
            background-color 0.15s ease;
    }

    .manage-btn:hover {
        opacity: 1;
        background-color: rgba(128, 128, 128, 0.12);
    }

    .manage-btn:active {
        background-color: rgba(128, 128, 128, 0.2);
    }

    .add-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        font-size: 1.25rem;
        font-weight: 600;
        line-height: 1;
        border: none;
        border-radius: 6px;
        background-color: #5b9bd5;
        color: #fff;
        cursor: pointer;
        transition: background-color 0.15s ease;
    }

    .add-btn:hover {
        background-color: #4a89c0;
    }

    .add-btn:active {
        background-color: #3d7ab0;
    }

    .content {
        flex: 1;
        overflow: hidden;
    }
</style>

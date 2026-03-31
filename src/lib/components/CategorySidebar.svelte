<script lang="ts">
    import {
        feedSidebarItems,
        activeFeedId,
        activeSubCategory,
        activeFeedCategories,
        totalUnreadCount,
    } from "$lib/stores/feeds";
    import { retrySingleFeed } from "$lib/services/rss";

    let retryingFeedId = $state<string | null>(null);

    function selectFeed(feedId: string) {
        // Toggle: clicking the already-open folder closes it
        if ($activeFeedId === feedId) {
            $activeFeedId = "all";
        } else {
            $activeFeedId = feedId;
        }
    }

    function selectSubCategory(category: string) {
        $activeSubCategory = category;
    }

    async function handleRetry(e: MouseEvent, feedId: string) {
        e.stopPropagation();
        if (retryingFeedId) return;
        retryingFeedId = feedId;
        try {
            await retrySingleFeed(feedId);
        } finally {
            retryingFeedId = null;
        }
    }

    function formatErrorTime(iso: string): string {
        try {
            const d = new Date(iso);
            return d.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return "";
        }
    }
</script>

<nav class="category-sidebar">
    <div class="sidebar-header">
        <span class="header-label">Sources</span>
    </div>

    <ul class="feed-list">
        <li>
            <button
                class="feed-item"
                class:active={$activeFeedId === "all"}
                onclick={() => selectFeed("all")}
            >
                <span class="feed-icon all-icon">⊞</span>
                <span class="feed-name">All Sources</span>
                {#if $totalUnreadCount > 0}
                    <span class="unread-badge">{$totalUnreadCount}</span>
                {/if}
            </button>
        </li>

        {#each $feedSidebarItems as feed (feed.feedId)}
            <li>
                <button
                    class="feed-item"
                    class:active={$activeFeedId === feed.feedId &&
                        $activeSubCategory === "all"}
                    class:expanded={$activeFeedId === feed.feedId}
                    class:errored={feed.health !== null}
                    onclick={() => selectFeed(feed.feedId)}
                >
                    <span
                        class="folder-chevron"
                        class:open={$activeFeedId === feed.feedId}>›</span
                    >
                    {#if feed.logo}
                        <img
                            class="feed-logo"
                            src={feed.logo}
                            alt=""
                            width="16"
                            height="16"
                        />
                    {:else}
                        <span class="feed-icon fallback-icon"
                            >{feed.title.charAt(0).toUpperCase()}</span
                        >
                    {/if}
                    <span class="feed-name">{feed.title}</span>

                    {#if feed.health}
                        <span class="health-warning" title={feed.health.error}
                            >⚠</span
                        >
                    {/if}

                    {#if feed.unreadCount > 0}
                        <span class="unread-badge">{feed.unreadCount}</span>
                    {/if}
                </button>

                <!-- Error details bar (shown when feed is expanded and has an error) -->
                {#if $activeFeedId === feed.feedId && feed.health}
                    <div class="error-bar">
                        <div class="error-content">
                            <span class="error-icon">⚠</span>
                            <div class="error-text">
                                <span class="error-message"
                                    >{feed.health.error}</span
                                >
                                <span class="error-time"
                                    >Failed at {formatErrorTime(
                                        feed.health.failedAt,
                                    )}</span
                                >
                            </div>
                        </div>
                        <button
                            class="retry-btn"
                            title="Retry fetching this feed"
                            disabled={retryingFeedId === feed.feedId}
                            onclick={(e) => handleRetry(e, feed.feedId)}
                        >
                            <span
                                class="retry-icon"
                                class:spin={retryingFeedId === feed.feedId}
                                >↻</span
                            >
                        </button>
                    </div>
                {/if}

                <!-- Subcategories (expanded when this feed is active) -->
                {#if $activeFeedId === feed.feedId && $activeFeedCategories.length > 0}
                    <ul class="subcategory-list">
                        <li>
                            <button
                                class="subcategory-item"
                                class:active={$activeSubCategory === "all"}
                                onclick={() => selectSubCategory("all")}
                            >
                                <span class="subcategory-name">All</span>
                                {#if feed.unreadCount > 0}
                                    <span class="unread-badge"
                                        >{feed.unreadCount}</span
                                    >
                                {/if}
                            </button>
                        </li>
                        {#each $activeFeedCategories as sub (sub.category)}
                            <li>
                                <button
                                    class="subcategory-item"
                                    class:active={$activeSubCategory ===
                                        sub.category}
                                    onclick={() =>
                                        selectSubCategory(sub.category)}
                                >
                                    <span class="subcategory-name"
                                        >{sub.category}</span
                                    >
                                    {#if sub.unreadCount > 0}
                                        <span class="unread-badge"
                                            >{sub.unreadCount}</span
                                        >
                                    {/if}
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </li>
        {/each}
    </ul>
</nav>

<style>
    .category-sidebar {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow-y: auto;
        user-select: none;
    }

    .sidebar-header {
        padding: 0.65rem 0.75rem;
        border-bottom: 1px solid #e0e0e0;
        flex-shrink: 0;
    }

    @media (prefers-color-scheme: dark) {
        .sidebar-header {
            border-bottom-color: #3a3a3a;
        }
    }

    .header-label {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.55;
    }

    .feed-list {
        list-style: none;
        margin: 0;
        padding: 0.25rem 0;
    }

    .feed-item {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        width: 100%;
        padding: 0.5rem 0.75rem;
        background: none;
        border: none;
        border-left: 3px solid transparent;
        cursor: pointer;
        color: inherit;
        font: inherit;
        font-size: 0.78rem;
        text-align: left;
        transition:
            background-color 0.12s ease,
            border-color 0.12s ease;
    }

    .feed-item:hover {
        background-color: rgba(91, 155, 213, 0.07);
    }

    .feed-item.active {
        background-color: rgba(91, 155, 213, 0.11);
        border-left-color: #5b9bd5;
        font-weight: 600;
    }

    .feed-item.expanded:not(.active) {
        background-color: rgba(91, 155, 213, 0.05);
        font-weight: 600;
    }

    .feed-item.errored {
        border-left-color: #d9534f;
    }

    .feed-item.errored.active {
        border-left-color: #d9534f;
    }

    @media (prefers-color-scheme: dark) {
        .feed-item:hover {
            background-color: rgba(91, 155, 213, 0.1);
        }
        .feed-item.active {
            background-color: rgba(91, 155, 213, 0.17);
        }
        .feed-item.expanded:not(.active) {
            background-color: rgba(91, 155, 213, 0.08);
        }
    }

    /* ── Folder chevron ──────────────────────────────── */
    .folder-chevron {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 10px;
        flex-shrink: 0;
        font-size: 0.78rem;
        font-weight: 600;
        opacity: 0.45;
        transition: transform 0.15s ease;
        transform: rotate(0deg);
    }

    .folder-chevron.open {
        transform: rotate(90deg);
        opacity: 0.7;
    }

    /* ── Logo / icon ─────────────────────────────────── */
    .feed-logo {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        object-fit: contain;
        flex-shrink: 0;
        background-color: rgba(128, 128, 128, 0.06);
    }

    .feed-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: 3px;
        flex-shrink: 0;
        font-size: 0.6rem;
        font-weight: 700;
        line-height: 1;
    }

    .all-icon {
        font-size: 0.82rem;
        opacity: 0.6;
    }

    .fallback-icon {
        background-color: rgba(91, 155, 213, 0.15);
        color: #5b9bd5;
    }

    @media (prefers-color-scheme: dark) {
        .fallback-icon {
            background-color: rgba(91, 155, 213, 0.22);
            color: #7db8e8;
        }
    }

    /* ── Name ────────────────────────────────────────── */
    .feed-name {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* ── Health warning icon ─────────────────────────── */
    .health-warning {
        flex-shrink: 0;
        font-size: 0.72rem;
        line-height: 1;
        color: #d9534f;
        cursor: help;
    }

    @media (prefers-color-scheme: dark) {
        .health-warning {
            color: #e8756f;
        }
    }

    /* ── Error detail bar ────────────────────────────── */
    .error-bar {
        display: flex;
        align-items: flex-start;
        gap: 0.4rem;
        padding: 0.4rem 0.75rem 0.4rem 2.2rem;
        background-color: rgba(217, 83, 79, 0.06);
        border-left: 3px solid #d9534f;
    }

    @media (prefers-color-scheme: dark) {
        .error-bar {
            background-color: rgba(217, 83, 79, 0.1);
        }
    }

    .error-content {
        flex: 1;
        display: flex;
        align-items: flex-start;
        gap: 0.35rem;
        min-width: 0;
    }

    .error-icon {
        flex-shrink: 0;
        font-size: 0.68rem;
        line-height: 1.4;
        color: #d9534f;
    }

    @media (prefers-color-scheme: dark) {
        .error-icon {
            color: #e8756f;
        }
    }

    .error-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
    }

    .error-message {
        font-size: 0.65rem;
        line-height: 1.35;
        color: #b94a48;
        word-break: break-word;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    @media (prefers-color-scheme: dark) {
        .error-message {
            color: #e8756f;
        }
    }

    .error-time {
        font-size: 0.58rem;
        color: #999;
    }

    .retry-btn {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border: 1px solid #d9534f;
        border-radius: 4px;
        background: none;
        color: #d9534f;
        cursor: pointer;
        font-size: 0.82rem;
        line-height: 1;
        transition:
            background-color 0.12s ease,
            color 0.12s ease;
    }

    .retry-btn:hover:not(:disabled) {
        background-color: #d9534f;
        color: #fff;
    }

    .retry-btn:disabled {
        opacity: 0.5;
        cursor: default;
    }

    @media (prefers-color-scheme: dark) {
        .retry-btn {
            border-color: #e8756f;
            color: #e8756f;
        }

        .retry-btn:hover:not(:disabled) {
            background-color: #e8756f;
            color: #1a1a1a;
        }
    }

    .retry-icon {
        display: inline-block;
        transition: transform 0.2s ease;
    }

    .retry-icon.spin {
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    /* ── Subcategory list ────────────────────────────── */
    .subcategory-list {
        list-style: none;
        margin: 0;
        padding: 0.1rem 0 0.25rem 0;
    }

    .subcategory-item {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        width: 100%;
        padding: 0.35rem 0.75rem 0.35rem 2.6rem;
        background: none;
        border: none;
        border-left: 3px solid transparent;
        cursor: pointer;
        color: inherit;
        font: inherit;
        font-size: 0.72rem;
        text-align: left;
        opacity: 0.85;
        transition:
            background-color 0.12s ease,
            border-color 0.12s ease,
            opacity 0.12s ease;
    }

    .subcategory-item:hover {
        background-color: rgba(91, 155, 213, 0.07);
        opacity: 1;
    }

    .subcategory-item.active {
        background-color: rgba(91, 155, 213, 0.11);
        border-left-color: #5b9bd5;
        font-weight: 600;
        opacity: 1;
    }

    @media (prefers-color-scheme: dark) {
        .subcategory-item:hover {
            background-color: rgba(91, 155, 213, 0.1);
        }
        .subcategory-item.active {
            background-color: rgba(91, 155, 213, 0.17);
        }
    }

    .subcategory-name {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* ── Unread badge (shared by feeds and subcategories) */
    .unread-badge {
        font-size: 0.62rem;
        font-weight: 500;
        padding: 0.1rem 0.4rem;
        border-radius: 999px;
        background-color: rgba(91, 155, 213, 0.1);
        color: #5b9bd5;
        flex-shrink: 0;
        min-width: 1.4rem;
        text-align: center;
    }

    @media (prefers-color-scheme: dark) {
        .unread-badge {
            background-color: rgba(91, 155, 213, 0.18);
            color: #7db8e8;
        }
    }
</style>

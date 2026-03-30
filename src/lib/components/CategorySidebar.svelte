<script lang="ts">
    import {
        feedSidebarItems,
        activeFeedId,
        activeSubCategory,
        activeFeedCategories,
        totalUnreadCount,
    } from "$lib/stores/feeds";

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
                    {#if feed.unreadCount > 0}
                        <span class="unread-badge">{feed.unreadCount}</span>
                    {/if}
                </button>

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

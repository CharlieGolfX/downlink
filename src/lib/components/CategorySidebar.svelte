<script lang="ts">
    import {
        categorizedArticles,
        activeCategory,
        articles,
        activeTag,
        feeds,
    } from "$lib/stores/feeds";
    import { derived } from "svelte/store";

    /** Unread article count respecting the current feed-tag filter. */
    const totalCount = derived(
        [articles, activeTag, feeds],
        ([$articles, $activeTag, $feeds]) => {
            let filtered = $articles.filter((a) => !a.read);
            if ($activeTag !== "all") {
                const feedIdsWithTag = new Set(
                    $feeds
                        .filter((f) => f.tags.includes($activeTag))
                        .map((f) => f.id),
                );
                filtered = filtered.filter((a) => feedIdsWithTag.has(a.feedId));
            }
            return filtered.length;
        },
    );

    function selectCategory(category: string) {
        $activeCategory = category;
    }
</script>

<nav class="category-sidebar">
    <div class="sidebar-header">
        <span class="header-label">Categories</span>
    </div>

    <ul class="category-list">
        <li>
            <button
                class="category-item"
                class:active={$activeCategory === "all"}
                onclick={() => selectCategory("all")}
            >
                <span class="category-name">All</span>
                <span class="category-count">{$totalCount}</span>
            </button>
        </li>

        {#each $categorizedArticles as group (group.category)}
            <li>
                <button
                    class="category-item"
                    class:active={$activeCategory === group.category}
                    onclick={() => selectCategory(group.category)}
                >
                    <span class="category-name">{group.category}</span>
                    <span class="category-count">{group.count}</span>
                </button>
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

    .category-list {
        list-style: none;
        margin: 0;
        padding: 0.25rem 0;
    }

    .category-item {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        width: 100%;
        padding: 0.45rem 0.75rem;
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

    .category-item:hover {
        background-color: rgba(91, 155, 213, 0.07);
    }

    .category-item.active {
        background-color: rgba(91, 155, 213, 0.11);
        border-left-color: #5b9bd5;
        font-weight: 600;
    }

    @media (prefers-color-scheme: dark) {
        .category-item:hover {
            background-color: rgba(91, 155, 213, 0.1);
        }
        .category-item.active {
            background-color: rgba(91, 155, 213, 0.17);
        }
    }

    .category-name {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .category-count {
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
        .category-count {
            background-color: rgba(91, 155, 213, 0.18);
            color: #7db8e8;
        }
    }
</style>

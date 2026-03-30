<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import {
        sortedArticles,
        selectedArticle,
        markArticleRead,
    } from "$lib/stores/feeds";
    import CategorySidebar from "$lib/components/CategorySidebar.svelte";
    import { modalOpen } from "$lib/stores/ui";
    import { evalReader, evalOriginal } from "$lib/services/webview";
    import ArticleCard from "$lib/components/ArticleCard.svelte";
    import ArticleView from "$lib/components/ArticleView.svelte";
    import WeatherWidget from "$lib/components/WeatherWidget.svelte";

    const SCROLL_AMOUNT = 120;

    function selectArticle(article: import("$lib/types/feed").Article) {
        $selectedArticle = article;
        if (!article.read) {
            markArticleRead(article.id);
        }
    }

    function navigateArticles(direction: -1 | 1) {
        const articles = $sortedArticles;
        if (articles.length === 0) return;

        const currentId = $selectedArticle?.id ?? null;
        const currentIndex = currentId
            ? articles.findIndex((a) => a.id === currentId)
            : -1;

        let nextIndex: number;
        if (currentIndex === -1) {
            // Nothing selected — pick first or last depending on direction
            nextIndex = direction === 1 ? 0 : articles.length - 1;
        } else {
            nextIndex = currentIndex + direction;
        }

        if (nextIndex < 0 || nextIndex >= articles.length) return;

        selectArticle(articles[nextIndex]);

        // Scroll the sidebar so the active item is visible
        requestAnimationFrame(() => {
            const active = document.querySelector(".sidebar-item.active");
            active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
    }

    function scrollWebview(direction: -1 | 1) {
        if (!$selectedArticle) return;
        const js = `window.scrollBy({ top: ${direction * SCROLL_AMOUNT}, behavior: "smooth" })`;
        // Fire into whichever webview is showing — one will no-op
        evalReader(js).catch(() => {});
        evalOriginal(js).catch(() => {});
    }

    function closeArticle() {
        $selectedArticle = null;
    }

    function handleKeydown(e: KeyboardEvent) {
        // Don't intercept when a modal is open
        if ($modalOpen) return;

        // Don't intercept when the user is typing in an input / textarea / select
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

        switch (e.key) {
            case "w":
                e.preventDefault();
                navigateArticles(-1);
                break;
            case "s":
                e.preventDefault();
                navigateArticles(1);
                break;
            case "ArrowUp":
                if ($selectedArticle) {
                    e.preventDefault();
                    scrollWebview(-1);
                }
                break;
            case "ArrowDown":
                if ($selectedArticle) {
                    e.preventDefault();
                    scrollWebview(1);
                }
                break;
            case "q":
            case "Escape":
                if ($selectedArticle) {
                    e.preventDefault();
                    closeArticle();
                }
                break;
        }
    }

    onMount(() => {
        window.addEventListener("keydown", handleKeydown);
    });

    onDestroy(() => {
        window.removeEventListener("keydown", handleKeydown);
    });
</script>

<div class="three-panel">
    <aside class="category-panel">
        <CategorySidebar />
    </aside>

    <aside class="sidebar">
        <WeatherWidget />
        {#if $sortedArticles.length === 0}
            <p class="empty">No articles yet. Add a feed to get started.</p>
        {:else}
            <ul class="article-list">
                {#each $sortedArticles as article (article.id)}
                    <li>
                        <button
                            class="sidebar-item"
                            class:active={$selectedArticle?.id === article.id}
                            onclick={() => selectArticle(article)}
                        >
                            <ArticleCard {article} />
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}
    </aside>

    <section class="main-content">
        <ArticleView article={$selectedArticle} />
    </section>
</div>

<style>
    .three-panel {
        display: flex;
        height: 100%;
        overflow: hidden;
    }

    .category-panel {
        width: 200px;
        min-width: 160px;
        max-width: 240px;
        flex-shrink: 0;
        overflow-y: auto;
        border-right: 1px solid #e0e0e0;
        background-color: #f2f2f2;
    }

    @media (prefers-color-scheme: dark) {
        .category-panel {
            background-color: #1e1e1e;
            border-right-color: #3a3a3a;
        }
    }

    .sidebar {
        width: 20%;
        min-width: 220px;
        max-width: 360px;
        flex-shrink: 0;
        overflow-y: auto;
        border-right: 1px solid #e0e0e0;
        background-color: #fafafa;
    }

    @media (prefers-color-scheme: dark) {
        .sidebar {
            background-color: #222;
            border-right-color: #3a3a3a;
        }
    }

    .empty {
        color: #888;
        text-align: center;
        padding: 2rem 1rem;
        font-size: 0.85rem;
    }

    .article-list {
        list-style: none;
        display: flex;
        flex-direction: column;
    }

    .article-list li {
        border-bottom: 1px solid #eaeaea;
    }

    @media (prefers-color-scheme: dark) {
        .article-list li {
            border-bottom-color: #333;
        }
    }

    .sidebar-item {
        display: block;
        width: 100%;
        padding: 0.65rem 0.75rem;
        text-align: left;
        background: none;
        border: none;
        cursor: pointer;
        color: inherit;
        font: inherit;
        transition: background-color 0.12s ease;
    }

    .sidebar-item:hover {
        background-color: rgba(91, 155, 213, 0.07);
    }

    .sidebar-item.active {
        background-color: rgba(91, 155, 213, 0.13);
        box-shadow: inset 3px 0 0 #5b9bd5;
    }

    @media (prefers-color-scheme: dark) {
        .sidebar-item:hover {
            background-color: rgba(91, 155, 213, 0.1);
        }

        .sidebar-item.active {
            background-color: rgba(91, 155, 213, 0.17);
        }
    }

    .main-content {
        flex: 1;
        overflow-y: auto;
        min-width: 0;
    }
</style>

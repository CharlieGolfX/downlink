<script lang="ts">
    import {
        sortedArticles,
        selectedArticle,
        markArticleRead,
    } from "$lib/stores/feeds";
    import ArticleCard from "$lib/components/ArticleCard.svelte";
    import ArticleView from "$lib/components/ArticleView.svelte";
    import WeatherWidget from "$lib/components/WeatherWidget.svelte";

    function selectArticle(article: import("$lib/types/feed").Article) {
        $selectedArticle = article;
        if (!article.read) {
            markArticleRead(article.id);
        }
    }
</script>

<div class="two-panel">
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
    .two-panel {
        display: flex;
        height: 100%;
        overflow: hidden;
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

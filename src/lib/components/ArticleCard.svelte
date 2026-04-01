<script lang="ts">
    import type { Article } from "$lib/types/feed";
    import { formatRelativeDate } from "$lib/utils/date";

    let { article }: { article: Article } = $props();
</script>

<div class="card">
    <div class="card-body">
        {#if !article.read}
            <span class="unread-dot" title="Unread"></span>
        {/if}
        {#if article.feedLogo}
            <img
                class="feed-logo"
                src={article.feedLogo}
                alt="{article.feedTitle} logo"
            />
        {/if}

        <div class="card-content">
            <div class="card-header">
                <span class="feed-title">{article.feedTitle}</span>
                {#if article.publishedAt}
                    <time class="timestamp" datetime={article.publishedAt}>
                        {formatRelativeDate(article.publishedAt)}
                    </time>
                {/if}
            </div>

            <h3 class="title">{article.title}</h3>

            {#if article.categories?.length}
                <span class="category">{article.categories[0]}</span>
            {/if}

            {#if article.summary}
                <p class="summary">{article.summary}</p>
            {/if}
        </div>
    </div>
</div>

<style>
    .card {
        display: block;
        width: 100%;
        color: inherit;
        position: relative;
    }

    .card-body {
        display: flex;
        align-items: flex-start;
        gap: 0.55rem;
    }

    .feed-logo {
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 4px;
        object-fit: contain;
        flex-shrink: 0;
        margin-top: 0.1rem;
        background-color: #f0f0f0;
    }

    :global(html.dark) .feed-logo {
        background-color: #3a3a3a;
    }

    .card-content {
        flex: 1;
        min-width: 0;
    }

    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.35rem;
        margin-bottom: 0.15rem;
    }

    .feed-title {
        font-size: 0.62rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: #5b9bd5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .timestamp {
        font-size: 0.62rem;
        color: #999;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .title {
        font-size: 0.8rem;
        font-weight: 600;
        line-height: 1.3;
        margin-bottom: 0.15rem;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .category {
        display: inline-block;
        font-size: 0.58rem;
        font-weight: 500;
        line-height: 1;
        padding: 0.15rem 0.35rem;
        margin-bottom: 0.2rem;
        border-radius: 3px;
        background-color: rgba(91, 155, 213, 0.1);
        color: #5b9bd5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    :global(html.dark) .category {
        background-color: rgba(91, 155, 213, 0.15);
        color: #7db8e8;
    }

    .summary {
        font-size: 0.7rem;
        line-height: 1.4;
        color: #666;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .unread-dot {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #5b9bd5;
        flex-shrink: 0;
        pointer-events: none;
    }

    :global(html.dark) .summary {
        color: #aaa;
    }

    :global(html.dark) .timestamp {
        color: #777;
    }
</style>

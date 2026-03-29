<script lang="ts">
    import type { Article } from "$lib/types/feed";
    import { formatRelativeDate } from "$lib/utils/date";
    import {
        extractArticle,
        buildReaderHtml,
        buildStyleUpdateJs,
        estimateReadingTime,
    } from "$lib/utils/reader-html";
    import {
        readerSettings,
        type ReaderTheme,
        type ReaderFont,
    } from "$lib/stores/reader";
    import {
        showOriginal,
        hideOriginal,
        resizeOriginal,
        showReader,
        hideReader,
        resizeReader,
        fetchPageHtml,
        evalReader,
    } from "$lib/services/webview";
    import { onDestroy, tick } from "svelte";
    import { modalOpen } from "$lib/stores/ui";

    let { article }: { article: Article | null } = $props();

    let viewMode = $state<"reader" | "original">("reader");
    let contentArea: HTMLElement | undefined = $state();
    let resizeObserver: ResizeObserver | null = null;

    let readerLoading = $state(false);
    let readerError = $state<string | null>(null);
    let readerReady = $state(false);
    let readingTime = $state(0);

    const FONT_SIZES = [14, 16, 18, 20, 22];
    let fontSizePx = $derived(FONT_SIZES[$readerSettings.fontSize - 1] ?? 18);

    // Track article changes to reset view and hide webviews
    let lastArticleId = $state<string | null>(null);
    $effect(() => {
        const currentId = article?.id ?? null;
        if (currentId !== lastArticleId) {
            lastArticleId = currentId;
            // Tear down any existing webviews
            hideOriginal().catch(() => {});
            hideReader().catch(() => {});
            viewMode = "reader";
            readerError = null;
            readerReady = false;
            readingTime = 0;

            if (article) {
                tick().then(() => loadReaderView());
            }
        }
    });

    // Manage ResizeObserver on the content area
    $effect(() => {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        const el = contentArea;
        if (!el) return;

        resizeObserver = new ResizeObserver(() => {
            const rect = el.getBoundingClientRect();
            if (viewMode === "original") {
                resizeOriginal(rect.x, rect.y, rect.width, rect.height).catch(
                    () => {},
                );
            } else if (viewMode === "reader" && readerReady) {
                resizeReader(rect.x, rect.y, rect.width, rect.height).catch(
                    () => {},
                );
            }
        });
        resizeObserver.observe(el);
    });

    // Hide/show webviews when a modal opens/closes
    let webviewHiddenByModal = $state(false);
    $effect(() => {
        const isModalOpen = $modalOpen;
        if (isModalOpen && !webviewHiddenByModal) {
            webviewHiddenByModal = true;
            if (viewMode === "reader" && readerReady) {
                resizeReader(-9999, -9999, 0, 0).catch(() => {});
            } else if (viewMode === "original") {
                resizeOriginal(-9999, -9999, 0, 0).catch(() => {});
            }
        } else if (!isModalOpen && webviewHiddenByModal) {
            webviewHiddenByModal = false;
            if (contentArea) {
                const rect = contentArea.getBoundingClientRect();
                if (viewMode === "reader" && readerReady) {
                    resizeReader(rect.x, rect.y, rect.width, rect.height).catch(
                        () => {},
                    );
                } else if (viewMode === "original") {
                    resizeOriginal(
                        rect.x,
                        rect.y,
                        rect.width,
                        rect.height,
                    ).catch(() => {});
                }
            }
        }
    });

    // Live-update reader webview styles when settings change
    let prevStyleKey = $state("");
    $effect(() => {
        const theme = $readerSettings.theme;
        const fontFamily = $readerSettings.fontFamily;
        const size = fontSizePx;
        const key = `${theme}-${fontFamily}-${size}`;

        if (viewMode === "reader" && readerReady && key !== prevStyleKey) {
            prevStyleKey = key;
            const js = buildStyleUpdateJs({
                theme,
                fontFamily,
                fontSizePx: size,
            });
            evalReader(js).catch(() => {});
        }
    });

    onDestroy(() => {
        resizeObserver?.disconnect();
        hideOriginal().catch(() => {});
        hideReader().catch(() => {});
    });

    async function loadReaderView() {
        if (!article) return;
        readerLoading = true;
        readerError = null;
        readerReady = false;

        try {
            // Fetch the full page HTML via Rust (avoids CORS)
            const html = await fetchPageHtml(article.url);

            // Extract the article content with Readability
            const extracted = extractArticle(html, article.url);
            if (!extracted) {
                readerError =
                    "Could not extract readable content from this page.";
                readerLoading = false;
                return;
            }

            readingTime = estimateReadingTime(extracted.textContent);

            // Build a self-contained reader HTML document
            const readerHtml = buildReaderHtml(extracted.content, {
                theme: $readerSettings.theme,
                fontFamily: $readerSettings.fontFamily,
                fontSizePx,
                articleUrl: article.url,
            });

            // Ensure contentArea DOM element is available
            await tick();
            if (!contentArea) {
                readerError = "Layout not ready — please try again.";
                readerLoading = false;
                return;
            }

            const rect = contentArea.getBoundingClientRect();
            await showReader(
                readerHtml,
                rect.x,
                rect.y,
                rect.width,
                rect.height,
            );

            readerReady = true;
            prevStyleKey = `${$readerSettings.theme}-${$readerSettings.fontFamily}-${fontSizePx}`;
        } catch (e) {
            console.error("[reader] Failed to load reader view:", e);
            readerError = `Failed to load article: ${e}`;
        } finally {
            readerLoading = false;
        }
    }

    async function switchToOriginal() {
        // Tear down reader webview first
        await hideReader();
        readerReady = false;

        viewMode = "original";
        await tick();

        if (contentArea && article) {
            const rect = contentArea.getBoundingClientRect();
            await showOriginal(
                article.url,
                rect.x,
                rect.y,
                rect.width,
                rect.height,
            );
        }
    }

    async function switchToReader() {
        // Tear down original webview first
        await hideOriginal();

        viewMode = "reader";
        readerError = null;
        readerReady = false;
        await tick();

        if (article) {
            await loadReaderView();
        }
    }

    function decreaseFontSize() {
        readerSettings.update((s) => ({
            ...s,
            fontSize: Math.max(1, s.fontSize - 1),
        }));
    }

    function increaseFontSize() {
        readerSettings.update((s) => ({
            ...s,
            fontSize: Math.min(5, s.fontSize + 1),
        }));
    }

    function setFont(font: ReaderFont) {
        readerSettings.update((s) => ({ ...s, fontFamily: font }));
    }

    function setTheme(theme: ReaderTheme) {
        readerSettings.update((s) => ({ ...s, theme }));
    }
</script>

{#if article}
    <div class="article-wrapper">
        <header class="article-header">
            <div class="header-top">
                <div class="article-meta">
                    {#if article.feedLogo}
                        <img
                            class="feed-logo"
                            src={article.feedLogo}
                            alt="{article.feedTitle} logo"
                        />
                    {/if}
                    <span class="feed-title">{article.feedTitle}</span>
                    {#if article.author}
                        <span class="author">{article.author}</span>
                    {/if}
                    {#if article.publishedAt}
                        <time class="timestamp" datetime={article.publishedAt}>
                            {formatRelativeDate(article.publishedAt)}
                        </time>
                    {/if}
                </div>

                <div class="view-toggle">
                    <button
                        class="toggle-btn"
                        class:active={viewMode === "reader"}
                        onclick={switchToReader}
                    >
                        Reader
                    </button>
                    <button
                        class="toggle-btn"
                        class:active={viewMode === "original"}
                        onclick={switchToOriginal}
                    >
                        Original
                    </button>
                </div>
            </div>

            <h1 class="title">{article.title}</h1>

            {#if viewMode === "reader"}
                <div class="reader-toolbar">
                    <div class="toolbar-group">
                        <button
                            class="tool-btn font-size-btn"
                            title="Decrease font size"
                            onclick={decreaseFontSize}
                            disabled={$readerSettings.fontSize <= 1}
                        >
                            <span class="size-label small-a">A</span>
                        </button>
                        <button
                            class="tool-btn font-size-btn"
                            title="Increase font size"
                            onclick={increaseFontSize}
                            disabled={$readerSettings.fontSize >= 5}
                        >
                            <span class="size-label large-a">A</span>
                        </button>
                    </div>

                    <span class="toolbar-sep"></span>

                    <div class="toolbar-group">
                        <button
                            class="tool-btn font-toggle"
                            class:active={$readerSettings.fontFamily ===
                                "serif"}
                            title="Serif font"
                            onclick={() => setFont("serif")}
                        >
                            <span style="font-family: Georgia, serif">Aa</span>
                        </button>
                        <button
                            class="tool-btn font-toggle"
                            class:active={$readerSettings.fontFamily ===
                                "sans-serif"}
                            title="Sans-serif font"
                            onclick={() => setFont("sans-serif")}
                        >
                            <span
                                style="font-family: -apple-system, system-ui, sans-serif"
                                >Aa</span
                            >
                        </button>
                    </div>

                    <span class="toolbar-sep"></span>

                    <div class="toolbar-group theme-group">
                        <button
                            class="theme-dot light-dot"
                            class:active={$readerSettings.theme === "light"}
                            title="Light theme"
                            onclick={() => setTheme("light")}
                        ></button>
                        <button
                            class="theme-dot sepia-dot"
                            class:active={$readerSettings.theme === "sepia"}
                            title="Sepia theme"
                            onclick={() => setTheme("sepia")}
                        ></button>
                        <button
                            class="theme-dot dark-dot"
                            class:active={$readerSettings.theme === "dark"}
                            title="Dark theme"
                            onclick={() => setTheme("dark")}
                        ></button>
                    </div>

                    {#if readingTime > 0}
                        <span class="reading-time">{readingTime} min read</span>
                    {/if}
                </div>
            {/if}
        </header>

        <div class="content-area" bind:this={contentArea}>
            {#if viewMode === "reader"}
                {#if readerLoading}
                    <div class="status-message">
                        <div class="spinner"></div>
                        <p>Extracting article…</p>
                    </div>
                {:else if readerError}
                    <div class="status-message error">
                        <p>{readerError}</p>
                        <button class="inline-link" onclick={switchToOriginal}>
                            View original page instead
                        </button>
                    </div>
                {:else}
                    <!-- Reader webview overlays this area -->
                    <div class="webview-placeholder"></div>
                {/if}
            {:else}
                <!-- Original webview overlays this area -->
                <div class="webview-placeholder">
                    <p>Loading original page…</p>
                </div>
            {/if}
        </div>
    </div>
{:else}
    <div class="empty">
        <p>Select an article to read</p>
    </div>
{/if}

<style>
    /* ------------------------------------------------------------------ */
    /*  Layout                                                             */
    /* ------------------------------------------------------------------ */

    .article-wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .article-header {
        padding: 1rem 1.5rem 0.75rem;
        border-bottom: 1px solid #e0e0e0;
        flex-shrink: 0;
    }

    @media (prefers-color-scheme: dark) {
        .article-header {
            border-bottom-color: #3a3a3a;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Header meta row                                                    */
    /* ------------------------------------------------------------------ */

    .header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.5rem;
    }

    .article-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .feed-logo {
        width: 1.25rem;
        height: 1.25rem;
        border-radius: 4px;
        object-fit: contain;
        flex-shrink: 0;
        background-color: #f0f0f0;
    }

    @media (prefers-color-scheme: dark) {
        .feed-logo {
            background-color: #3a3a3a;
        }
    }

    .feed-title {
        font-size: 0.78rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: #5b9bd5;
    }

    .author {
        font-size: 0.75rem;
        color: #888;
    }

    .author::before {
        content: "·";
        margin-right: 0.45rem;
        color: #ccc;
    }

    .timestamp {
        font-size: 0.75rem;
        color: #999;
    }

    .timestamp::before {
        content: "·";
        margin-right: 0.45rem;
        color: #ccc;
    }

    @media (prefers-color-scheme: dark) {
        .author {
            color: #888;
        }
        .author::before {
            color: #555;
        }
        .timestamp {
            color: #777;
        }
        .timestamp::before {
            color: #555;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  View toggle (Reader / Original)                                    */
    /* ------------------------------------------------------------------ */

    .view-toggle {
        display: flex;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid #d0d0d0;
        flex-shrink: 0;
    }

    @media (prefers-color-scheme: dark) {
        .view-toggle {
            border-color: #555;
        }
    }

    .toggle-btn {
        padding: 0.28rem 0.7rem;
        font-size: 0.72rem;
        font-weight: 500;
        border: none;
        background-color: transparent;
        color: inherit;
        cursor: pointer;
        transition:
            background-color 0.12s ease,
            color 0.12s ease;
        font-family: inherit;
    }

    .toggle-btn:not(:last-child) {
        border-right: 1px solid #d0d0d0;
    }

    @media (prefers-color-scheme: dark) {
        .toggle-btn:not(:last-child) {
            border-right-color: #555;
        }
    }

    .toggle-btn:hover {
        background-color: rgba(91, 155, 213, 0.08);
    }

    .toggle-btn.active {
        background-color: #5b9bd5;
        color: #fff;
    }

    /* ------------------------------------------------------------------ */
    /*  Article title                                                      */
    /* ------------------------------------------------------------------ */

    .title {
        font-size: 1.35rem;
        font-weight: 700;
        line-height: 1.3;
    }

    /* ------------------------------------------------------------------ */
    /*  Reader toolbar                                                     */
    /* ------------------------------------------------------------------ */

    .reader-toolbar {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin-top: 0.65rem;
        padding-top: 0.6rem;
        border-top: 1px solid #eaeaea;
    }

    @media (prefers-color-scheme: dark) {
        .reader-toolbar {
            border-top-color: #333;
        }
    }

    .toolbar-group {
        display: flex;
        align-items: center;
        gap: 0.2rem;
    }

    .toolbar-sep {
        width: 1px;
        height: 1rem;
        background-color: #d8d8d8;
        flex-shrink: 0;
    }

    @media (prefers-color-scheme: dark) {
        .toolbar-sep {
            background-color: #444;
        }
    }

    /* Font size buttons */
    .tool-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background-color: transparent;
        color: inherit;
        cursor: pointer;
        border-radius: 5px;
        transition:
            background-color 0.12s ease,
            opacity 0.12s ease;
        padding: 0.2rem 0.35rem;
    }

    .tool-btn:hover:not(:disabled) {
        background-color: rgba(128, 128, 128, 0.12);
    }

    .tool-btn:disabled {
        opacity: 0.3;
        cursor: default;
    }

    .font-size-btn {
        min-width: 1.6rem;
    }

    .size-label {
        font-weight: 700;
        line-height: 1;
    }

    .small-a {
        font-size: 0.7rem;
    }

    .large-a {
        font-size: 1rem;
    }

    /* Font family toggle */
    .font-toggle {
        font-size: 0.82rem;
        font-weight: 500;
        padding: 0.2rem 0.45rem;
        border-radius: 5px;
        opacity: 0.45;
        transition:
            opacity 0.12s ease,
            background-color 0.12s ease;
    }

    .font-toggle.active {
        opacity: 1;
        background-color: rgba(91, 155, 213, 0.12);
    }

    /* Theme dots */
    .theme-group {
        gap: 0.35rem;
    }

    .theme-dot {
        width: 1.1rem;
        height: 1.1rem;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        transition:
            border-color 0.12s ease,
            box-shadow 0.12s ease;
        padding: 0;
    }

    .theme-dot:hover {
        box-shadow: 0 0 0 2px rgba(91, 155, 213, 0.25);
    }

    .theme-dot.active {
        border-color: #5b9bd5;
    }

    .light-dot {
        background-color: #ffffff;
        box-shadow: inset 0 0 0 1px #d0d0d0;
    }

    .light-dot.active {
        box-shadow: inset 0 0 0 1px #d0d0d0;
    }

    .sepia-dot {
        background-color: #f4ecd8;
        box-shadow: inset 0 0 0 1px #d4c9a8;
    }

    .sepia-dot.active {
        box-shadow: inset 0 0 0 1px #d4c9a8;
    }

    .dark-dot {
        background-color: #2a2a2a;
        box-shadow: inset 0 0 0 1px #555;
    }

    .dark-dot.active {
        box-shadow: inset 0 0 0 1px #555;
    }

    /* Reading time */
    .reading-time {
        margin-left: auto;
        font-size: 0.72rem;
        color: #999;
        white-space: nowrap;
    }

    @media (prefers-color-scheme: dark) {
        .reading-time {
            color: #777;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Content area                                                       */
    /* ------------------------------------------------------------------ */

    .content-area {
        flex: 1;
        overflow: hidden;
        position: relative;
    }

    .webview-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #999;
        font-size: 0.85rem;
    }

    /* ------------------------------------------------------------------ */
    /*  Status messages (loading / error)                                   */
    /* ------------------------------------------------------------------ */

    .status-message {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 0.75rem;
        color: #888;
        font-size: 0.9rem;
        padding: 2rem;
        text-align: center;
    }

    .status-message.error {
        color: #cc6666;
    }

    @media (prefers-color-scheme: dark) {
        .status-message {
            color: #777;
        }
        .status-message.error {
            color: #e07070;
        }
    }

    .spinner {
        width: 1.5rem;
        height: 1.5rem;
        border: 2px solid rgba(91, 155, 213, 0.2);
        border-top-color: #5b9bd5;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .inline-link {
        background: none;
        border: none;
        color: #5b9bd5;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        padding: 0;
        text-decoration: underline;
    }

    .inline-link:hover {
        opacity: 0.8;
    }

    /* ------------------------------------------------------------------ */
    /*  Empty state                                                        */
    /* ------------------------------------------------------------------ */

    .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #888;
        font-size: 0.95rem;
    }
</style>

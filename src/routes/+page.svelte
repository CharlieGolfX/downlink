<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import {
        sortedArticles,
        selectedArticle,
        markArticleRead,
    } from "$lib/stores/feeds";
    import CategorySidebar from "$lib/components/CategorySidebar.svelte";
    import ArticleContextMenu from "$lib/components/ArticleContextMenu.svelte";
    import { modalOpen } from "$lib/stores/ui";
    import { evalReader, evalOriginal } from "$lib/services/webview";
    import VirtualArticleList from "$lib/components/VirtualArticleList.svelte";
    import ArticleView from "$lib/components/ArticleView.svelte";
    import WeatherWidget from "$lib/components/WeatherWidget.svelte";
    import { dbGetSetting, dbSetSetting } from "$lib/services/db";
    import type { Article } from "$lib/types/feed";

    const SCROLL_AMOUNT = 120;

    // ── Context menu state ──────────────────────────────────────────────
    let contextMenuArticle = $state<Article | null>(null);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);

    function handleArticleContextMenu(e: MouseEvent, article: Article) {
        e.preventDefault();
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;
        contextMenuArticle = article;
    }

    function closeContextMenu() {
        contextMenuArticle = null;
    }

    // ── Resize state ────────────────────────────────────────────────────
    const SETTING_CAT_WIDTH = "panel-category-width";
    const SETTING_SIDE_WIDTH = "panel-sidebar-width";
    const CAT_MIN = 120;
    const CAT_MAX = 320;
    const CAT_DEFAULT = 200;
    const SIDE_MIN = 200;
    const SIDE_MAX = 480;
    const SIDE_DEFAULT = 280;

    let categoryWidth = $state(CAT_DEFAULT);
    let sidebarWidth = $state(SIDE_DEFAULT);

    // Which handle is being dragged: null | "category" | "sidebar"
    let dragging = $state<"category" | "sidebar" | null>(null);
    let dragStartX = 0;
    let dragStartWidth = 0;

    async function loadWidths() {
        try {
            const [catRaw, sideRaw] = await Promise.all([
                dbGetSetting(SETTING_CAT_WIDTH),
                dbGetSetting(SETTING_SIDE_WIDTH),
            ]);
            if (catRaw) {
                categoryWidth = clamp(Number(catRaw), CAT_MIN, CAT_MAX);
            }
            if (sideRaw) {
                sidebarWidth = clamp(Number(sideRaw), SIDE_MIN, SIDE_MAX);
            }
        } catch {
            /* ignore — use defaults */
        }
    }

    function saveWidths() {
        dbSetSetting(SETTING_CAT_WIDTH, String(categoryWidth)).catch(() => {});
        dbSetSetting(SETTING_SIDE_WIDTH, String(sidebarWidth)).catch(() => {});
    }

    function clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }

    function onResizeMouseDown(handle: "category" | "sidebar", e: MouseEvent) {
        e.preventDefault();
        dragging = handle;
        dragStartX = e.clientX;
        dragStartWidth = handle === "category" ? categoryWidth : sidebarWidth;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        // Add a full-viewport overlay to prevent iframe/webview stealing events
        addDragOverlay();
    }

    function onResizeMouseMove(e: MouseEvent) {
        if (!dragging) return;
        const delta = e.clientX - dragStartX;
        if (dragging === "category") {
            categoryWidth = clamp(dragStartWidth + delta, CAT_MIN, CAT_MAX);
        } else {
            sidebarWidth = clamp(dragStartWidth + delta, SIDE_MIN, SIDE_MAX);
        }
    }

    function onResizeMouseUp() {
        if (!dragging) return;
        dragging = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        removeDragOverlay();
        saveWidths();
    }

    let dragOverlay: HTMLDivElement | null = null;

    function addDragOverlay() {
        removeDragOverlay();
        dragOverlay = document.createElement("div");
        dragOverlay.style.position = "fixed";
        dragOverlay.style.inset = "0";
        dragOverlay.style.zIndex = "9999";
        dragOverlay.style.cursor = "col-resize";
        document.body.appendChild(dragOverlay);
    }

    function removeDragOverlay() {
        if (dragOverlay) {
            dragOverlay.remove();
            dragOverlay = null;
        }
    }

    // ── Article selection & keyboard nav ─────────────────────────────────

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
            nextIndex = direction === 1 ? 0 : articles.length - 1;
        } else {
            nextIndex = currentIndex + direction;
        }

        if (nextIndex < 0 || nextIndex >= articles.length) return;

        selectArticle(articles[nextIndex]);
    }

    function scrollWebview(direction: -1 | 1) {
        if (!$selectedArticle) return;
        const js = `window.scrollBy({ top: ${direction * SCROLL_AMOUNT}, behavior: "smooth" })`;
        evalReader(js).catch(() => {});
        evalOriginal(js).catch(() => {});
    }

    function closeArticle() {
        $selectedArticle = null;
    }

    function handleKeydown(e: KeyboardEvent) {
        if ($modalOpen) return;

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

    onMount(async () => {
        await loadWidths();
        window.addEventListener("keydown", handleKeydown);
        window.addEventListener("mousemove", onResizeMouseMove);
        window.addEventListener("mouseup", onResizeMouseUp);
    });

    onDestroy(() => {
        window.removeEventListener("keydown", handleKeydown);
        window.removeEventListener("mousemove", onResizeMouseMove);
        window.removeEventListener("mouseup", onResizeMouseUp);
        removeDragOverlay();
    });
</script>

<div class="three-panel">
    <aside class="category-panel" style="width: {categoryWidth}px;">
        <CategorySidebar />
    </aside>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="resize-handle"
        class:active={dragging === "category"}
        onmousedown={(e) => onResizeMouseDown("category", e)}
    ></div>

    <aside class="sidebar" style="width: {sidebarWidth}px;">
        <WeatherWidget />
        {#if $sortedArticles.length === 0}
            <p class="empty">No articles yet. Add a feed to get started.</p>
        {:else}
            <VirtualArticleList
                articles={$sortedArticles}
                selectedId={$selectedArticle?.id ?? null}
                onselectarticle={selectArticle}
                oncontextmenu={handleArticleContextMenu}
            />
        {/if}
    </aside>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="resize-handle"
        class:active={dragging === "sidebar"}
        onmousedown={(e) => onResizeMouseDown("sidebar", e)}
    ></div>

    <section class="main-content">
        <ArticleView article={$selectedArticle} />
    </section>
</div>

{#if contextMenuArticle}
    <ArticleContextMenu
        article={contextMenuArticle}
        x={contextMenuX}
        y={contextMenuY}
        onclose={closeContextMenu}
    />
{/if}

<style>
    .three-panel {
        display: flex;
        height: 100%;
        overflow: hidden;
    }

    /* ── Category panel (left) ───────────────────────── */
    .category-panel {
        flex-shrink: 0;
        overflow-y: auto;
        border-right: 1px solid #e0e0e0;
        background-color: #f2f2f2;
    }

    :global(html.dark) .category-panel {
        background-color: #1e1e1e;
        border-right-color: #3a3a3a;
    }

    /* ── Article sidebar (middle) ────────────────────── */
    .sidebar {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-right: 1px solid #e0e0e0;
        background-color: #fafafa;
    }

    :global(html.dark) .sidebar {
        background-color: #222;
        border-right-color: #3a3a3a;
    }

    /* ── Resize handle ───────────────────────────────── */
    .resize-handle {
        width: 5px;
        flex-shrink: 0;
        cursor: col-resize;
        background-color: transparent;
        position: relative;
        z-index: 10;
        /* Widen the hit area without taking layout space */
        margin-left: -2px;
        margin-right: -3px;
        transition: background-color 0.15s ease;
    }

    .resize-handle::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 50%;
        width: 1px;
        background-color: transparent;
        transition: background-color 0.15s ease;
    }

    .resize-handle:hover::after,
    .resize-handle.active::after {
        background-color: #5b9bd5;
    }

    .resize-handle:hover,
    .resize-handle.active {
        background-color: rgba(91, 155, 213, 0.08);
    }

    :global(html.dark) .resize-handle:hover,
    :global(html.dark) .resize-handle.active {
        background-color: rgba(91, 155, 213, 0.12);
    }

    /* ── Main content ────────────────────────────────── */
    .main-content {
        flex: 1;
        overflow-y: auto;
        min-width: 0;
    }

    /* ── Misc ────────────────────────────────────────── */
    .empty {
        color: #888;
        text-align: center;
        padding: 2rem 1rem;
        font-size: 0.85rem;
    }
</style>

<script lang="ts">
    import { openUrl } from "@tauri-apps/plugin-opener";
    import type { Article } from "$lib/types/feed";
    import { markArticleRead, markArticleUnread } from "$lib/stores/feeds";

    let {
        article,
        x,
        y,
        onclose,
    }: {
        article: Article;
        x: number;
        y: number;
        onclose: () => void;
    } = $props();

    let menuEl: HTMLDivElement | undefined = $state();

    /** Clamp the menu so it doesn't overflow the viewport. */
    let posX = $derived.by(() => {
        const w = menuEl?.offsetWidth ?? 180;
        return Math.min(x, window.innerWidth - w - 8);
    });

    let posY = $derived.by(() => {
        const h = menuEl?.offsetHeight ?? 120;
        return Math.min(y, window.innerHeight - h - 8);
    });

    function handleOpenInBrowser() {
        if (article.url) {
            openUrl(article.url).catch((e) =>
                console.error("Failed to open URL:", e),
            );
        }
        onclose();
    }

    function handleToggleRead() {
        if (article.read) {
            markArticleUnread(article.id);
        } else {
            markArticleRead(article.id);
        }
        onclose();
    }

    async function handleCopyLink() {
        if (article.url) {
            try {
                await navigator.clipboard.writeText(article.url);
            } catch (e) {
                console.error("Failed to copy link:", e);
            }
        }
        onclose();
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            onclose();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            onclose();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="backdrop"
    onmousedown={handleBackdropClick}
    oncontextmenu={(e) => {
        e.preventDefault();
        onclose();
    }}
>
    <div
        class="context-menu"
        role="menu"
        bind:this={menuEl}
        style="left: {posX}px; top: {posY}px;"
    >
        <button class="menu-item" role="menuitem" onclick={handleOpenInBrowser}>
            <span class="menu-icon">↗</span>
            <span class="menu-label">Open in Browser</span>
        </button>

        <button class="menu-item" role="menuitem" onclick={handleToggleRead}>
            <span class="menu-icon">{article.read ? "○" : "●"}</span>
            <span class="menu-label"
                >{article.read ? "Mark as Unread" : "Mark as Read"}</span
            >
        </button>

        <div class="menu-separator"></div>

        <button class="menu-item" role="menuitem" onclick={handleCopyLink}>
            <span class="menu-icon">⎘</span>
            <span class="menu-label">Copy Link</span>
        </button>
    </div>
</div>

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 200;
    }

    .context-menu {
        position: fixed;
        z-index: 201;
        min-width: 170px;
        padding: 0.3rem;
        border-radius: 8px;
        background-color: #fff;
        border: 1px solid #e0e0e0;
        box-shadow:
            0 4px 16px rgba(0, 0, 0, 0.12),
            0 1px 4px rgba(0, 0, 0, 0.08);
        display: flex;
        flex-direction: column;
    }

    :global(html.dark) .context-menu {
        background-color: #2a2a2a;
        border-color: #444;
        box-shadow:
            0 4px 16px rgba(0, 0, 0, 0.35),
            0 1px 4px rgba(0, 0, 0, 0.2);
    }

    .menu-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.45rem 0.6rem;
        border: none;
        border-radius: 5px;
        background: none;
        color: inherit;
        font: inherit;
        font-size: 0.78rem;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.1s ease;
    }

    .menu-item:hover {
        background-color: rgba(91, 155, 213, 0.1);
    }

    .menu-item:active {
        background-color: rgba(91, 155, 213, 0.18);
    }

    :global(html.dark) .menu-item:hover {
        background-color: rgba(91, 155, 213, 0.15);
    }

    :global(html.dark) .menu-item:active {
        background-color: rgba(91, 155, 213, 0.22);
    }

    .menu-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        flex-shrink: 0;
        font-size: 0.82rem;
        opacity: 0.6;
    }

    .menu-label {
        flex: 1;
        white-space: nowrap;
    }

    .menu-separator {
        height: 1px;
        margin: 0.25rem 0.4rem;
        background-color: #e0e0e0;
    }

    :global(html.dark) .menu-separator {
        background-color: #444;
    }
</style>

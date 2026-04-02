<script lang="ts">
    import type { Snippet } from "svelte";
    import { onMount, onDestroy } from "svelte";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import { invoke } from "@tauri-apps/api/core";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { initTheme, destroyTheme } from "$lib/stores/theme";
    import { loadTemperatureUnit } from "$lib/stores/weather";
    import {
        loadCompactMode,
        loadDefaultArticleView,
        loadCloseToTray,
        closeToTray,
    } from "$lib/stores/ui";
    import {
        startBackupScheduler,
        stopBackupScheduler,
    } from "$lib/services/backup";
    import AddFeedModal from "$lib/components/AddFeedModal.svelte";
    import ManageFeedsModal from "$lib/components/ManageFeedsModal.svelte";
    import SettingsModal from "$lib/components/SettingsModal.svelte";
    import HelpWindow from "$lib/components/HelpWindow.svelte";
    import AboutModal from "$lib/components/AboutModal.svelte";
    import ImportExportModal from "$lib/components/ImportExportModal.svelte";
    import { fetchFeed, refreshAllFeeds } from "$lib/services/rss";
    import { triggerRefresh, markUpdated } from "$lib/stores/ui";
    import { toasts } from "$lib/stores/toasts";
    import Toast from "$lib/components/Toast.svelte";
    import {
        feeds,
        articles,
        activeTag,
        upsertFeed,
        addFeedArticles,
        globalUnreadCount,
    } from "$lib/stores/feeds";
    import { AVAILABLE_TAGS } from "$lib/tags";
    import type { Article } from "$lib/types/feed";
    import {
        getDb,
        dbLoadFeeds,
        dbLoadArticles,
        dbPruneOldArticles,
        dbGetSetting,
        dbSetSetting,
    } from "$lib/services/db";

    let { children }: { children: Snippet } = $props();

    let showAddFeed = $state(false);
    let showManageFeeds = $state(false);
    let showSettings = $state(false);
    let showHelp = $state(false);
    let showAbout = $state(false);
    let showImportExport = $state(false);
    let loading = $state(false);
    let refreshing = $state(false);
    let retentionHours: number = 48;
    let dbReady = $state(false);
    let unlistenTrayRefresh: UnlistenFn | null = null;
    let unlistenOpenSettings: UnlistenFn | null = null;
    let unlistenOpenHelp: UnlistenFn | null = null;
    let unlistenOpenAbout: UnlistenFn | null = null;
    let unlistenOpenImportExport: UnlistenFn | null = null;

    async function loadRetentionSetting() {
        try {
            const stored = await dbGetSetting("article-retention-hours");
            if (stored !== null) {
                retentionHours = Number(stored);
            }
        } catch {
            // keep default
        }
    }

    /** Load persisted feeds & articles from SQLite on startup. */
    async function loadFromDb() {
        try {
            await getDb();
            await loadRetentionSetting();

            // Remove old articles before loading
            const pruned = await dbPruneOldArticles(retentionHours);
            if (pruned > 0) {
                console.log(`Pruned ${pruned} old article(s)`);
            }

            const [savedFeeds, savedArticles] = await Promise.all([
                dbLoadFeeds(),
                dbLoadArticles(),
            ]);
            if (savedFeeds.length > 0) {
                feeds.set(savedFeeds);
            }
            if (savedArticles.length > 0) {
                articles.set(savedArticles);
            }
            dbReady = true;
        } catch (err) {
            console.error("Failed to load data from DB:", err);
            dbReady = true; // continue anyway so the app is usable
        }
    }

    async function handleAddFeed(url: string, tags: string[]) {
        loading = true;
        try {
            const result = await fetchFeed(url);

            // Use the discovered feed URL if auto-discovery found one,
            // otherwise keep the URL the user entered.
            const actualUrl = result.feed_url ?? url;
            const feedId = actualUrl;
            const feedTitle = result.title || actualUrl;
            const feedLogo = result.logo ?? undefined;

            upsertFeed({
                id: feedId,
                title: feedTitle,
                url: actualUrl,
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
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : "Unknown error";
            toasts.error(`Failed to add feed: ${msg}`);
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

            // Prune stale articles after refresh and sync the store
            const pruned = await dbPruneOldArticles(retentionHours);
            if (pruned > 0) {
                console.log(`Pruned ${pruned} old article(s)`);
                // Reload articles from DB so the in-memory store matches
                const freshArticles = await dbLoadArticles();
                articles.set(freshArticles);
            }

            markUpdated();
            console.log(`Refreshed ${count} feed(s)`);
        } catch (err) {
            console.error("Refresh failed:", err);
        } finally {
            refreshing = false;
        }
    }

    async function startTrayListener() {
        stopTrayListener();
        unlistenTrayRefresh = await listen("tray-refresh", () => {
            handleRefresh();
        });
        unlistenOpenSettings = await listen("open-settings", () => {
            showSettings = true;
        });
        unlistenOpenHelp = await listen("open-help", () => {
            showHelp = true;
        });
        unlistenOpenAbout = await listen("open-about", () => {
            showAbout = true;
        });
        unlistenOpenImportExport = await listen("open-import-export", () => {
            showImportExport = true;
        });
    }

    function stopTrayListener() {
        if (unlistenTrayRefresh) {
            unlistenTrayRefresh();
            unlistenTrayRefresh = null;
        }
        if (unlistenOpenSettings) {
            unlistenOpenSettings();
            unlistenOpenSettings = null;
        }
        if (unlistenOpenHelp) {
            unlistenOpenHelp();
            unlistenOpenHelp = null;
        }
        if (unlistenOpenAbout) {
            unlistenOpenAbout();
            unlistenOpenAbout = null;
        }
        if (unlistenOpenImportExport) {
            unlistenOpenImportExport();
            unlistenOpenImportExport = null;
        }
    }

    // ── Window geometry save/restore ────────────────────────────────────
    let saveGeometryTimer: ReturnType<typeof setTimeout> | null = null;

    async function saveWindowGeometry() {
        try {
            const win = getCurrentWindow();
            const pos = await win.outerPosition();
            const size = await win.outerSize();
            await Promise.all([
                dbSetSetting("window-x", String(pos.x)),
                dbSetSetting("window-y", String(pos.y)),
                dbSetSetting("window-width", String(size.width)),
                dbSetSetting("window-height", String(size.height)),
            ]);
        } catch (e) {
            console.error("Failed to save window geometry:", e);
        }
    }

    function debouncedSaveGeometry() {
        if (saveGeometryTimer) clearTimeout(saveGeometryTimer);
        saveGeometryTimer = setTimeout(saveWindowGeometry, 500);
    }

    async function restoreWindowGeometry() {
        try {
            const [xRaw, yRaw, wRaw, hRaw] = await Promise.all([
                dbGetSetting("window-x"),
                dbGetSetting("window-y"),
                dbGetSetting("window-width"),
                dbGetSetting("window-height"),
            ]);
            if (
                xRaw === null ||
                yRaw === null ||
                wRaw === null ||
                hRaw === null
            )
                return;

            const x = Number(xRaw);
            const y = Number(yRaw);
            const w = Number(wRaw);
            const h = Number(hRaw);

            if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) return;
            if (w < 400 || h < 300) return; // sanity check

            const win = getCurrentWindow();
            const { PhysicalPosition, PhysicalSize } =
                await import("@tauri-apps/api/dpi");
            await win.setPosition(new PhysicalPosition(x, y));
            await win.setSize(new PhysicalSize(w, h));
        } catch (e) {
            console.error("Failed to restore window geometry:", e);
        }
    }

    let windowUnlisteners: (() => void)[] = [];

    function handleKeydown(e: KeyboardEvent) {
        // Cmd+N (mac) or Ctrl+N (windows/linux) → open Add Feed modal
        if (
            e.key === "n" &&
            (e.metaKey || e.ctrlKey) &&
            !e.shiftKey &&
            !e.altKey
        ) {
            e.preventDefault();
            showAddFeed = true;
        }
    }

    onMount(async () => {
        await loadFromDb();
        await initTheme();
        await loadTemperatureUnit();
        await loadCompactMode();
        await loadDefaultArticleView();
        await loadCloseToTray();

        // Sync close-to-tray setting to Rust backend
        closeToTray.subscribe((enabled) => {
            invoke("set_close_to_tray", { enabled }).catch((e) =>
                console.error("Failed to sync close-to-tray:", e),
            );
        });

        // Keep tray badge in sync with unread count
        globalUnreadCount.subscribe((count) => {
            invoke("update_tray_badge", { count }).catch((e) =>
                console.error("Failed to update tray badge:", e),
            );
        });

        await startBackupScheduler();
        await startTrayListener();
        window.addEventListener("keydown", handleKeydown);

        // ── Startup behavior settings ───────────────────────────
        const [startMinimizedRaw, restoreWindowRaw, autoRefreshRaw] =
            await Promise.all([
                dbGetSetting("start-minimized"),
                dbGetSetting("restore-window"),
                dbGetSetting("auto-refresh-on-launch"),
            ]);

        const shouldRestoreWindow = restoreWindowRaw !== "false"; // default true
        const shouldStartMinimized = startMinimizedRaw === "true"; // default false
        const shouldAutoRefresh = autoRefreshRaw !== "false"; // default true

        // Restore window geometry if enabled
        if (shouldRestoreWindow) {
            await restoreWindowGeometry();
        }

        // Start minimized — hide to tray
        if (shouldStartMinimized) {
            const win = getCurrentWindow();
            await win.hide();
        }

        // Listen for move/resize to persist window geometry
        const win = getCurrentWindow();
        const unlistenMoved = await win.onMoved(() => debouncedSaveGeometry());
        const unlistenResized = await win.onResized(() =>
            debouncedSaveGeometry(),
        );

        // Store unlisten functions for cleanup
        windowUnlisteners = [unlistenMoved, unlistenResized];

        // Auto-refresh on launch (conditional)
        if (shouldAutoRefresh) {
            handleRefresh();
        }
    });

    onDestroy(() => {
        stopTrayListener();
        stopBackupScheduler();
        destroyTheme();
        window.removeEventListener("keydown", handleKeydown);
        for (const unlisten of windowUnlisteners) {
            unlisten();
        }
        if (saveGeometryTimer) clearTimeout(saveGeometryTimer);
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
<SettingsModal bind:open={showSettings} />
<HelpWindow bind:open={showHelp} />
<AboutModal bind:open={showAbout} />
<ImportExportModal bind:open={showImportExport} />
<Toast />

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

    :global(html.dark) :global(body) {
        color: #e4e4e4;
        background-color: #1a1a1a;
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

    :global(html.dark) .topbar {
        background-color: #2a2a2a;
        border-bottom-color: #3a3a3a;
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

    :global(html.dark) .feed-select {
        background-color: #333;
        border-color: #555;
    }

    :global(html.dark) .feed-select:focus {
        border-color: #5b9bd5;
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

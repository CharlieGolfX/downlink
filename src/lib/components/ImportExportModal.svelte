<script lang="ts">
    import { modalOpen } from "$lib/stores/ui";
    import { feeds, upsertFeed } from "$lib/stores/feeds";
    import { fetchFeed } from "$lib/services/rss";
    import { addFeedArticles } from "$lib/stores/feeds";
    import { toasts } from "$lib/stores/toasts";
    import { save, open as openDialog } from "@tauri-apps/plugin-dialog";
    import { invoke } from "@tauri-apps/api/core";
    import { get } from "svelte/store";
    import type { Article } from "$lib/types/feed";
    import { generateOpml } from "$lib/utils/opml";

    let { open = $bindable(false) }: { open: boolean } = $props();

    $effect(() => {
        modalOpen.set(open);
    });

    let importing = $state(false);
    let exporting = $state(false);
    let importProgress = $state("");

    async function handleExport() {
        exporting = true;
        try {
            const allFeeds = get(feeds);
            if (allFeeds.length === 0) {
                toasts.info("No feeds to export");
                return;
            }

            const opmlXml = generateOpml(allFeeds);

            const filePath = await save({
                title: "Export OPML",
                defaultPath: "downlink-feeds.opml",
                filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
            });

            if (!filePath) return;

            await invoke("write_text_file", {
                path: filePath,
                contents: opmlXml,
            });

            toasts.success(`Exported ${allFeeds.length} feed(s) to OPML`);
        } catch (err) {
            console.error("Failed to export OPML:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : "Unknown error";
            toasts.error(`Export failed: ${msg}`);
        } finally {
            exporting = false;
        }
    }

    async function handleImport() {
        importing = true;
        importProgress = "";
        try {
            const filePath = await openDialog({
                title: "Import OPML",
                multiple: false,
                filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
            });

            if (!filePath) return;

            const contents = await invoke<string>("read_text_file", {
                path: filePath,
            });

            const parser = new DOMParser();
            const doc = parser.parseFromString(contents, "text/xml");
            const outlines = doc.querySelectorAll("outline[xmlUrl]");

            if (outlines.length === 0) {
                toasts.info("No feeds found in the OPML file");
                return;
            }

            const existingFeeds = get(feeds);
            const existingUrls = new Set(existingFeeds.map((f) => f.url));

            interface DiscoveredFeed {
                url: string;
                title: string;
                tags: string[];
            }

            const discovered: DiscoveredFeed[] = [];
            for (const outline of outlines) {
                const xmlUrl = outline.getAttribute("xmlUrl");
                if (!xmlUrl) continue;

                const title =
                    outline.getAttribute("title") ||
                    outline.getAttribute("text") ||
                    xmlUrl;
                const category = outline.getAttribute("category");
                const tags = category
                    ? category
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean)
                    : [];

                discovered.push({ url: xmlUrl, title, tags });
            }

            let imported = 0;
            let skipped = 0;
            let failed = 0;
            const total = discovered.length;

            for (let i = 0; i < total; i++) {
                const entry = discovered[i];
                importProgress = `Importing feed ${i + 1} of ${total}...`;

                if (existingUrls.has(entry.url)) {
                    skipped++;
                    continue;
                }

                try {
                    const result = await fetchFeed(entry.url);

                    const actualUrl = result.feed_url ?? entry.url;
                    const feedId = actualUrl;
                    const feedTitle = result.title || entry.title;
                    const feedLogo = result.logo ?? undefined;

                    // Check again with the actual URL in case auto-discovery
                    // resolved to an already-subscribed feed
                    if (existingUrls.has(actualUrl)) {
                        skipped++;
                        continue;
                    }

                    upsertFeed({
                        id: feedId,
                        title: feedTitle,
                        url: actualUrl,
                        description: result.description ?? undefined,
                        logo: feedLogo,
                        tags: entry.tags,
                        lastUpdated: new Date().toISOString(),
                    });

                    const newArticles: Article[] = result.articles.map((a) => ({
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
                        categories:
                            a.categories.length > 0 ? a.categories : undefined,
                    }));

                    addFeedArticles(newArticles);
                    existingUrls.add(actualUrl);
                    imported++;
                } catch (err) {
                    console.error(
                        `Failed to import feed "${entry.title}" (${entry.url}):`,
                        err,
                    );
                    failed++;
                }
            }

            importProgress = "";

            const parts: string[] = [];
            if (imported > 0) parts.push(`${imported} imported`);
            if (skipped > 0) parts.push(`${skipped} skipped`);
            if (failed > 0) parts.push(`${failed} failed`);

            if (imported > 0) {
                toasts.success(`Feeds: ${parts.join(", ")}`);
            } else if (failed > 0) {
                toasts.error(`Feeds: ${parts.join(", ")}`);
            } else {
                toasts.info(`Feeds: ${parts.join(", ")}`);
            }
        } catch (err) {
            console.error("Failed to import OPML:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : "Unknown error";
            toasts.error(`Import failed: ${msg}`);
        } finally {
            importing = false;
            importProgress = "";
        }
    }

    function close() {
        if (importing || exporting) return;
        open = false;
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            close();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            close();
        }
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="backdrop"
        onclick={handleBackdropClick}
        onkeydown={handleKeydown}
    >
        <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Import / Export"
        >
            <header class="modal-header">
                <h2>Import / Export</h2>
                <button
                    class="close-btn"
                    onclick={close}
                    aria-label="Close"
                    disabled={importing || exporting}>&times;</button
                >
            </header>

            <div class="body">
                <section class="section">
                    <h3 class="section-title">Export</h3>
                    <p class="section-desc">
                        Export all your feed subscriptions as an OPML file for
                        backup or use in other readers.
                    </p>
                    <button
                        class="btn btn-action"
                        onclick={handleExport}
                        disabled={exporting || importing}
                    >
                        {exporting ? "Exporting\u2026" : "Export OPML"}
                    </button>
                </section>

                <section class="section">
                    <h3 class="section-title">Import</h3>
                    <p class="section-desc">
                        Import feed subscriptions from an OPML file. Duplicate
                        feeds will be skipped.
                    </p>
                    <button
                        class="btn btn-action"
                        onclick={handleImport}
                        disabled={importing || exporting}
                    >
                        {importing ? "Importing\u2026" : "Import OPML"}
                    </button>
                    {#if importProgress}
                        <p class="import-progress">{importProgress}</p>
                    {/if}
                </section>

                <footer class="modal-footer">
                    <button
                        type="button"
                        class="btn btn-cancel"
                        onclick={close}
                        disabled={importing || exporting}>Close</button
                    >
                </footer>
            </div>
        </div>
    </div>
{/if}

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgba(0, 0, 0, 0.45);
    }

    .modal {
        background-color: #fff;
        border-radius: 10px;
        width: 90%;
        max-width: 460px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
        overflow: hidden;
    }

    :global(html.dark) .modal {
        background-color: #2a2a2a;
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid #e0e0e0;
    }

    :global(html.dark) .modal-header {
        border-bottom-color: #3a3a3a;
    }

    .modal-header h2 {
        font-size: 1.05rem;
        font-weight: 600;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.4rem;
        line-height: 1;
        cursor: pointer;
        color: inherit;
        opacity: 0.5;
        transition: opacity 0.15s;
    }

    .close-btn:hover {
        opacity: 1;
    }

    .close-btn:disabled {
        opacity: 0.3;
        cursor: default;
    }

    .body {
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .section {
        display: flex;
        flex-direction: column;
    }

    .section-title {
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        opacity: 0.7;
        margin: 0 0 0.4rem 0;
    }

    .section-desc {
        font-size: 0.85rem;
        opacity: 0.7;
        line-height: 1.45;
        margin: 0 0 0.65rem 0;
    }

    .btn-action {
        padding: 0.5rem 1.2rem;
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 6px;
        border: none;
        background-color: #5b9bd5;
        color: #fff;
        cursor: pointer;
        transition: background-color 0.15s ease;
        align-self: flex-start;
    }

    .btn-action:hover:not(:disabled) {
        background-color: #4a89c0;
    }

    .btn-action:active:not(:disabled) {
        background-color: #3d7ab0;
    }

    .btn-action:disabled {
        opacity: 0.5;
        cursor: default;
    }

    .import-progress {
        font-size: 0.8rem;
        opacity: 0.6;
        margin: 0.45rem 0 0 0;
        line-height: 1.3;
    }

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding-top: 0.25rem;
    }

    .btn {
        padding: 0.45rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition:
            background-color 0.15s ease,
            opacity 0.15s ease;
    }

    .btn-cancel {
        background-color: transparent;
        color: inherit;
        opacity: 0.7;
    }

    .btn-cancel:hover:not(:disabled) {
        opacity: 1;
        background-color: rgba(128, 128, 128, 0.1);
    }

    .btn-cancel:disabled {
        opacity: 0.3;
        cursor: default;
    }
</style>

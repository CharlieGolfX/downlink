<script lang="ts">
    import { untrack, onDestroy } from "svelte";
    import type { Article } from "$lib/types/feed";
    import ArticleCard from "./ArticleCard.svelte";

    interface Props {
        articles: Article[];
        selectedId: string | null;
        onselectarticle: (article: Article) => void;
        oncontextmenu: (e: MouseEvent, article: Article) => void;
    }

    let { articles, selectedId, onselectarticle, oncontextmenu }: Props =
        $props();

    // ── Configuration ────────────────────────────────────────────────
    const ITEM_HEIGHT_ESTIMATE = 88;
    const OVERSCAN = 5;

    // ── DOM refs & scroll state ──────────────────────────────────────
    let viewport = $state<HTMLDivElement | undefined>(undefined);
    let scrollTop = $state(0);
    let viewportHeight = $state(600);

    // ── Height measurement cache ─────────────────────────────────────
    // Plain Map for performance; bump version counter to trigger Svelte
    // reactivity without making the entire map deeply reactive.
    const heightMap = new Map<string, number>();
    let heightVer = $state(0);

    // ── Lazy ResizeObserver for item measurement ─────────────────────
    let itemObserver: ResizeObserver | undefined;

    function getItemObserver(): ResizeObserver {
        if (!itemObserver) {
            itemObserver = new ResizeObserver((entries) => {
                let dirty = false;
                for (const entry of entries) {
                    const id = (entry.target as HTMLElement).dataset.aid;
                    if (!id) continue;
                    const box = entry.borderBoxSize?.[0];
                    const h = box
                        ? Math.round(box.blockSize)
                        : Math.round(
                              entry.target.getBoundingClientRect().height,
                          );
                    if (h > 0 && heightMap.get(id) !== h) {
                        heightMap.set(id, h);
                        dirty = true;
                    }
                }
                if (dirty) heightVer++;
            });
        }
        return itemObserver;
    }

    onDestroy(() => itemObserver?.disconnect());

    /** Svelte action — observe an item element while it lives in the DOM. */
    function measure(node: HTMLElement, aid: string) {
        node.dataset.aid = aid;
        getItemObserver().observe(node);
        return {
            update(newAid: string) {
                node.dataset.aid = newAid;
            },
            destroy() {
                itemObserver?.unobserve(node);
            },
        };
    }

    // ── Observe viewport size ────────────────────────────────────────
    $effect(() => {
        const vp = viewport;
        if (!vp) return;
        viewportHeight = vp.clientHeight;
        const ro = new ResizeObserver(() => {
            viewportHeight = vp.clientHeight;
        });
        ro.observe(vp);
        return () => ro.disconnect();
    });

    // ── Offset array (prefix sum of heights) ────────────────────────
    let offsets = $derived.by(() => {
        void heightVer; // reactive trigger
        const n = articles.length;
        const arr: number[] = new Array(n + 1);
        arr[0] = 0;
        for (let i = 0; i < n; i++) {
            arr[i + 1] =
                arr[i] +
                (heightMap.get(articles[i].id) ?? ITEM_HEIGHT_ESTIMATE);
        }
        return arr;
    });

    let totalHeight = $derived(offsets[articles.length] ?? 0);

    // ── Binary search: largest i where offsets[i] <= target ─────────
    function bsearch(target: number): number {
        let lo = 0;
        let hi = articles.length;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (offsets[mid] <= target) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }

    let rangeStart = $derived(Math.max(0, bsearch(scrollTop) - OVERSCAN));
    let rangeEnd = $derived(
        Math.min(
            articles.length,
            bsearch(scrollTop + viewportHeight) + 1 + OVERSCAN,
        ),
    );

    /** The window of items currently rendered in the DOM. */
    let visible = $derived(
        articles.slice(rangeStart, rangeEnd).map((article, i) => ({
            article,
            idx: rangeStart + i,
        })),
    );

    function handleScroll() {
        if (viewport) scrollTop = viewport.scrollTop;
    }

    // ── Reset scroll when the article list changes ───────────────────
    let prevFirstId = "";
    let didMount = false;

    $effect(() => {
        const fid = articles[0]?.id ?? "";
        if (didMount && fid !== prevFirstId) {
            if (viewport) viewport.scrollTop = 0;
            scrollTop = 0;
        }
        prevFirstId = fid;
        didMount = true;
    });

    // ── Scroll to keep selected article visible ──────────────────────
    $effect(() => {
        const id = selectedId;
        if (!id || !viewport) return;
        untrack(() => {
            const idx = articles.findIndex((a) => a.id === id);
            if (idx === -1) return;
            const top = offsets[idx];
            const h = heightMap.get(id) ?? ITEM_HEIGHT_ESTIMATE;
            const bottom = top + h;
            const st = viewport!.scrollTop;
            const vh = viewportHeight;
            if (top < st) {
                viewport!.scrollTo({
                    top: Math.max(0, top),
                    behavior: "smooth",
                });
            } else if (bottom > st + vh) {
                viewport!.scrollTo({
                    top: bottom - vh,
                    behavior: "smooth",
                });
            }
        });
    });
</script>

<div class="vlist" bind:this={viewport} onscroll={handleScroll}>
    <div class="vlist-rail" style="height:{totalHeight}px">
        {#each visible as { article, idx } (article.id)}
            <div
                class="vlist-row"
                style="top:{offsets[idx]}px"
                use:measure={article.id}
            >
                <button
                    class="sidebar-item"
                    class:active={selectedId === article.id}
                    onclick={() => onselectarticle(article)}
                    oncontextmenu={(e) => oncontextmenu(e, article)}
                >
                    <ArticleCard {article} />
                </button>
            </div>
        {/each}
    </div>
</div>

<style>
    .vlist {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .vlist-rail {
        position: relative;
        width: 100%;
    }

    .vlist-row {
        position: absolute;
        left: 0;
        width: 100%;
        border-bottom: 1px solid #eaeaea;
    }

    @media (prefers-color-scheme: dark) {
        .vlist-row {
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
</style>

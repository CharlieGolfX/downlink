import { writable, derived, get } from "svelte/store";
import type { Feed, Article } from "$lib/types/feed";
import { sortByDateDesc } from "$lib/utils/date";

export const feeds = writable<Feed[]>([]);
export const activeTag = writable<string>("all");
export const activeCategory = writable<string>("all");
export const articles = writable<Article[]>([]);
export const selectedArticle = writable<Article | null>(null);

/** Articles sorted newest-first, filtered by the active tag and active category. */
export const sortedArticles = derived(
  [articles, activeTag, activeCategory, feeds],
  ([$articles, $activeTag, $activeCategory, $feeds]) => {
    let filtered = $articles;

    // Filter by feed-level tag
    if ($activeTag !== "all") {
      const feedIdsWithTag = new Set(
        $feeds.filter((f) => f.tags.includes($activeTag)).map((f) => f.id),
      );
      filtered = filtered.filter((a) => feedIdsWithTag.has(a.feedId));
    }

    // Filter by article-level RSS category
    if ($activeCategory !== "all") {
      filtered = filtered.filter(
        (a) => (a.categories?.[0] ?? "Uncategorized") === $activeCategory,
      );
    }

    return sortByDateDesc(filtered, "publishedAt");
  },
);

/**
 * Flat list of category names with article counts, derived from currently
 * tag-filtered articles. Used by the CategorySidebar for display.
 * Categories are sorted alphabetically with "Uncategorized" last.
 */
export const categorizedArticles = derived(
  [articles, activeTag, feeds],
  ([$articles, $activeTag, $feeds]) => {
    // Apply the same feed-tag filtering
    let filtered: Article[];
    if ($activeTag === "all") {
      filtered = $articles;
    } else {
      const feedIdsWithTag = new Set(
        $feeds.filter((f) => f.tags.includes($activeTag)).map((f) => f.id),
      );
      filtered = $articles.filter((a) => feedIdsWithTag.has(a.feedId));
    }

    const counts = new Map<string, number>();
    for (const article of filtered) {
      const category = article.categories?.[0] ?? "Uncategorized";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }

    const result: { category: string; count: number }[] = [];
    for (const [category, count] of counts) {
      result.push({ category, count });
    }

    // Sort categories alphabetically, but put "Uncategorized" last
    result.sort((a, b) => {
      if (a.category === "Uncategorized") return 1;
      if (b.category === "Uncategorized") return -1;
      return a.category.localeCompare(b.category);
    });

    return result;
  },
);

/**
 * Merges new articles into the store, deduplicating by `id`,
 * so the same feed can be refreshed without creating duplicates.
 */
export function addFeedArticles(newArticles: Article[]) {
  articles.update((existing) => {
    const byId = new Map(existing.map((a) => [a.id, a]));
    for (const article of newArticles) {
      const prev = byId.get(article.id);
      // Preserve read state from the existing article on refresh
      if (prev?.read) {
        byId.set(article.id, { ...article, read: true });
      } else {
        byId.set(article.id, article);
      }
    }
    return sortByDateDesc([...byId.values()], "publishedAt");
  });
}

/**
 * Registers a feed in the feeds list if it doesn't already exist.
 * If it does exist, updates its metadata.
 */
export function upsertFeed(feed: Feed) {
  feeds.update((list) => {
    const idx = list.findIndex((f) => f.id === feed.id);
    if (idx >= 0) {
      const updated = [...list];
      updated[idx] = feed;
      return updated;
    }
    return [...list, feed];
  });
}

/**
 * Removes a feed and all of its articles from the stores.
 */
export function removeFeed(feedId: string) {
  feeds.update((list) => list.filter((f) => f.id !== feedId));
  articles.update((list) => list.filter((a) => a.feedId !== feedId));
}

/**
 * Marks a single article as read by its ID.
 */
export function markArticleRead(articleId: string) {
  articles.update((list) =>
    list.map((a) => (a.id === articleId ? { ...a, read: true } : a)),
  );
}

/**
 * Updates only the tags on an existing feed.
 */
export function updateFeedTags(feedId: string, tags: string[]) {
  feeds.update((list) =>
    list.map((f) => (f.id === feedId ? { ...f, tags } : f)),
  );
}

import { writable, derived, get } from "svelte/store";
import type { Feed, Article } from "$lib/types/feed";
import { sortByDateDesc } from "$lib/utils/date";

export const feeds = writable<Feed[]>([]);
export const activeTag = writable<string>("all");
export const articles = writable<Article[]>([]);
export const selectedArticle = writable<Article | null>(null);

/** Articles sorted newest-first, optionally filtered by the active tag. */
export const sortedArticles = derived(
  [articles, activeTag, feeds],
  ([$articles, $activeTag, $feeds]) => {
    if ($activeTag === "all") {
      return sortByDateDesc($articles, "publishedAt");
    }

    // Find all feed IDs that carry the selected tag
    const feedIdsWithTag = new Set(
      $feeds.filter((f) => f.tags.includes($activeTag)).map((f) => f.id),
    );

    const filtered = $articles.filter((a) => feedIdsWithTag.has(a.feedId));

    return sortByDateDesc(filtered, "publishedAt");
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
 * Updates only the tags on an existing feed.
 */
/**
 * Marks a single article as read by its ID.
 */
export function markArticleRead(articleId: string) {
  articles.update((list) =>
    list.map((a) => (a.id === articleId ? { ...a, read: true } : a)),
  );
}

export function updateFeedTags(feedId: string, tags: string[]) {
  feeds.update((list) =>
    list.map((f) => (f.id === feedId ? { ...f, tags } : f)),
  );
}

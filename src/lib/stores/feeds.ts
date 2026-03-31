import { writable, derived, get } from "svelte/store";
import type { Feed, Article } from "$lib/types/feed";
import { sortByDateDesc } from "$lib/utils/date";
import {
  dbUpsertFeed,
  dbRemoveFeed,
  dbUpdateFeedTags,
  dbUpsertArticles,
  dbMarkArticleRead,
  dbMarkArticleUnread,
  dbRemoveArticlesByFeed,
} from "$lib/services/db";

export const feeds = writable<Feed[]>([]);
export const activeTag = writable<string>("all");
export const activeFeedId = writable<string>("all");
export const activeSubCategory = writable<string>("all");
export const articles = writable<Article[]>([]);
export const selectedArticle = writable<Article | null>(null);

// ── Feed health tracking ────────────────────────────────────────────

export interface FeedHealthEntry {
  error: string;
  failedAt: string;
}

/**
 * Per-feed health status. A feed is "healthy" when it has no entry here.
 * When a fetch fails the feed ID is mapped to the error message and timestamp.
 */
export const feedHealth = writable<Map<string, FeedHealthEntry>>(new Map());

/** Record a fetch failure for a feed. */
export function setFeedError(feedId: string, error: string) {
  feedHealth.update((map) => {
    const next = new Map(map);
    next.set(feedId, { error, failedAt: new Date().toISOString() });
    return next;
  });
}

/** Clear any recorded error for a feed (called on successful fetch). */
export function clearFeedError(feedId: string) {
  feedHealth.update((map) => {
    if (!map.has(feedId)) return map;
    const next = new Map(map);
    next.delete(feedId);
    return next;
  });
}

// Reset subcategory whenever the active feed changes
let _prevFeedId = "all";
activeFeedId.subscribe((id) => {
  if (id !== _prevFeedId) {
    _prevFeedId = id;
    activeSubCategory.set("all");
  }
});

/** Articles sorted newest-first, filtered by the active tag, feed source, and subcategory. */
export const sortedArticles = derived(
  [articles, activeTag, activeFeedId, activeSubCategory, feeds],
  ([$articles, $activeTag, $activeFeedId, $activeSubCategory, $feeds]) => {
    let filtered = $articles;

    // Filter by feed-level tag
    if ($activeTag !== "all") {
      const feedIdsWithTag = new Set(
        $feeds.filter((f) => f.tags.includes($activeTag)).map((f) => f.id),
      );
      filtered = filtered.filter((a) => feedIdsWithTag.has(a.feedId));
    }

    // Filter by individual feed source
    if ($activeFeedId !== "all") {
      filtered = filtered.filter((a) => a.feedId === $activeFeedId);
    }

    // Filter by subcategory within the active feed
    if ($activeFeedId !== "all" && $activeSubCategory !== "all") {
      filtered = filtered.filter(
        (a) => (a.categories?.[0] ?? "Uncategorized") === $activeSubCategory,
      );
    }

    return sortByDateDesc(filtered, "publishedAt");
  },
);

/**
 * Sidebar items for each subscribed feed source, with its logo, title,
 * and unread article count. Respects the current tag filter.
 * Feeds are sorted alphabetically by title.
 */
export const feedSidebarItems = derived(
  [feeds, articles, activeTag, feedHealth],
  ([$feeds, $articles, $activeTag, $feedHealth]) => {
    // Determine which feeds are visible under the current tag filter
    let visibleFeeds: Feed[];
    if ($activeTag === "all") {
      visibleFeeds = $feeds;
    } else {
      visibleFeeds = $feeds.filter((f) => f.tags.includes($activeTag));
    }

    const visibleFeedIds = new Set(visibleFeeds.map((f) => f.id));

    // Count unread articles per feed (only for visible feeds)
    const unreadCounts = new Map<string, number>();
    for (const article of $articles) {
      if (!visibleFeedIds.has(article.feedId)) continue;
      if (article.read) continue;
      unreadCounts.set(
        article.feedId,
        (unreadCounts.get(article.feedId) ?? 0) + 1,
      );
    }

    const result: {
      feedId: string;
      title: string;
      logo: string | undefined;
      unreadCount: number;
      health: FeedHealthEntry | null;
    }[] = visibleFeeds.map((f) => ({
      feedId: f.id,
      title: f.title,
      logo: f.logo,
      unreadCount: unreadCounts.get(f.id) ?? 0,
      health: $feedHealth.get(f.id) ?? null,
    }));

    // Sort alphabetically by title
    result.sort((a, b) => a.title.localeCompare(b.title));

    return result;
  },
);

/**
 * Subcategories for the currently active feed source, each with its
 * unread article count. Only populated when a specific feed is selected.
 * Categories are sorted alphabetically with "Uncategorized" last.
 */
export const activeFeedCategories = derived(
  [articles, activeFeedId],
  ([$articles, $activeFeedId]) => {
    if ($activeFeedId === "all") return [];

    const feedArticles = $articles.filter((a) => a.feedId === $activeFeedId);

    const allCategories = new Set<string>();
    const unreadCounts = new Map<string, number>();

    for (const article of feedArticles) {
      const category = article.categories?.[0] ?? "Uncategorized";
      allCategories.add(category);
      if (!article.read) {
        unreadCounts.set(category, (unreadCounts.get(category) ?? 0) + 1);
      }
    }

    const result: { category: string; unreadCount: number }[] = [];
    for (const category of allCategories) {
      result.push({ category, unreadCount: unreadCounts.get(category) ?? 0 });
    }

    // Sort alphabetically, "Uncategorized" last
    result.sort((a, b) => {
      if (a.category === "Uncategorized") return 1;
      if (b.category === "Uncategorized") return -1;
      return a.category.localeCompare(b.category);
    });

    return result;
  },
);

/**
 * Total unread article count across all visible feeds (respects tag filter).
 * Used by the sidebar "All" item.
 */
export const totalUnreadCount = derived(
  [articles, activeTag, feeds],
  ([$articles, $activeTag, $feeds]) => {
    let filtered = $articles.filter((a) => !a.read);
    if ($activeTag !== "all") {
      const feedIdsWithTag = new Set(
        $feeds.filter((f) => f.tags.includes($activeTag)).map((f) => f.id),
      );
      filtered = filtered.filter((a) => feedIdsWithTag.has(a.feedId));
    }
    return filtered.length;
  },
);

/**
 * Merges new articles into the store, deduplicating by `id`,
 * so the same feed can be refreshed without creating duplicates.
 * Persists every upserted article to the SQLite database.
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
    const merged = sortByDateDesc([...byId.values()], "publishedAt");

    // Persist to DB — collect the articles that were actually touched
    const toSave = newArticles.map((a) => byId.get(a.id) ?? a);
    dbUpsertArticles(toSave).catch((err) =>
      console.error("Failed to persist articles:", err),
    );

    return merged;
  });
}

/**
 * Registers a feed in the feeds list if it doesn't already exist.
 * If it does exist, updates its metadata.
 * Persists the feed to the SQLite database.
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

  // Persist to DB
  dbUpsertFeed(feed).catch((err) =>
    console.error("Failed to persist feed:", err),
  );
}

/**
 * Removes a feed and all of its articles from the stores.
 * Also removes them from the SQLite database.
 * Resets the active feed filter if the removed feed was selected.
 */
export function removeFeed(feedId: string) {
  // Reset filter if the removed feed was the active one
  if (get(activeFeedId) === feedId) {
    activeFeedId.set("all");
  }

  feeds.update((list) => list.filter((f) => f.id !== feedId));
  articles.update((list) => list.filter((a) => a.feedId !== feedId));

  // Persist to DB (articles cascade-deleted via dbRemoveFeed)
  dbRemoveFeed(feedId).catch((err) =>
    console.error("Failed to remove feed from DB:", err),
  );
}

/**
 * Marks a single article as read by its ID.
 * Persists the read state to the SQLite database.
 */
export function markArticleRead(articleId: string) {
  articles.update((list) =>
    list.map((a) => (a.id === articleId ? { ...a, read: true } : a)),
  );

  // Persist to DB
  dbMarkArticleRead(articleId).catch((err) =>
    console.error("Failed to persist read state:", err),
  );
}

/**
 * Marks a single article as unread by its ID.
 * Persists the unread state to the SQLite database.
 */
export function markArticleUnread(articleId: string) {
  articles.update((list) =>
    list.map((a) => (a.id === articleId ? { ...a, read: false } : a)),
  );

  // Persist to DB
  dbMarkArticleUnread(articleId).catch((err) =>
    console.error("Failed to persist unread state:", err),
  );
}

/**
 * Updates only the tags on an existing feed.
 * Persists the tag change to the SQLite database.
 */
export function updateFeedTags(feedId: string, tags: string[]) {
  feeds.update((list) =>
    list.map((f) => (f.id === feedId ? { ...f, tags } : f)),
  );

  // Persist to DB
  dbUpdateFeedTags(feedId, tags).catch((err) =>
    console.error("Failed to persist feed tags:", err),
  );
}

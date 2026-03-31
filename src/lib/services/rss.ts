import { invoke } from "@tauri-apps/api/core";
import { get } from "svelte/store";
import type { FeedResult, Article } from "$lib/types/feed";
import {
  feeds,
  addFeedArticles,
  upsertFeed,
  setFeedError,
  clearFeedError,
} from "$lib/stores/feeds";

/**
 * Calls the Rust `fetch_feed` command which fetches the RSS/Atom feed at the
 * given URL, parses it, and returns structured feed + article data.
 */
export async function fetchFeed(url: string): Promise<FeedResult> {
  return await invoke<FeedResult>("fetch_feed", { url });
}

/**
 * Processes a successful feed result: updates feed metadata and merges articles.
 * Shared by `refreshAllFeeds` and `retrySingleFeed`.
 */
function processFeedResult(
  feed: {
    id: string;
    title: string;
    logo?: string;
    url: string;
    tags: string[];
    description?: string;
    lastUpdated?: string;
  },
  result: FeedResult,
) {
  const feedTitle = result.title || feed.title;
  const feedLogo = result.logo ?? feed.logo;

  upsertFeed({
    ...feed,
    title: feedTitle,
    logo: feedLogo,
    lastUpdated: new Date().toISOString(),
  });

  const articles: Article[] = result.articles.map((a) => ({
    id: a.id,
    feedId: feed.id,
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
}

/**
 * Extracts a short, human-friendly message from an unknown error value.
 */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

/**
 * Re-fetches every feed currently in the store, merges any new articles in,
 * and updates feed metadata (e.g. logo changes). Feeds are fetched in parallel.
 *
 * Per-feed health is tracked: successful fetches clear any prior error,
 * failed fetches record the error message and timestamp.
 *
 * Returns the number of feeds that were successfully refreshed.
 */
export async function refreshAllFeeds(): Promise<number> {
  const currentFeeds = get(feeds);
  if (currentFeeds.length === 0) return 0;

  const results = await Promise.allSettled(
    currentFeeds.map(async (feed) => {
      try {
        const result = await fetchFeed(feed.url);
        processFeedResult(feed, result);
        clearFeedError(feed.id);
      } catch (err) {
        const msg = errorMessage(err);
        setFeedError(feed.id, msg);
        throw err; // re-throw so Promise.allSettled marks it as rejected
      }
    }),
  );

  let successCount = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      successCount++;
    } else {
      console.error("Failed to refresh feed:", result.reason);
    }
  }

  return successCount;
}

/**
 * Re-fetches a single feed by its ID. Clears the health error on success,
 * or updates it with the new error on failure.
 *
 * Returns `true` if the retry succeeded.
 */
export async function retrySingleFeed(feedId: string): Promise<boolean> {
  const currentFeeds = get(feeds);
  const feed = currentFeeds.find((f) => f.id === feedId);
  if (!feed) return false;

  try {
    const result = await fetchFeed(feed.url);
    processFeedResult(feed, result);
    clearFeedError(feed.id);
    return true;
  } catch (err) {
    const msg = errorMessage(err);
    setFeedError(feed.id, msg);
    console.error(`Retry failed for feed "${feed.title}":`, err);
    return false;
  }
}

import { invoke } from "@tauri-apps/api/core";
import { get } from "svelte/store";
import type { FeedResult, Article } from "$lib/types/feed";
import { feeds, addFeedArticles, upsertFeed } from "$lib/stores/feeds";

/**
 * Calls the Rust `fetch_feed` command which fetches the RSS/Atom feed at the
 * given URL, parses it, and returns structured feed + article data.
 */
export async function fetchFeed(url: string): Promise<FeedResult> {
  return await invoke<FeedResult>("fetch_feed", { url });
}

/**
 * Re-fetches every feed currently in the store, merges any new articles in,
 * and updates feed metadata (e.g. logo changes). Feeds are fetched in parallel.
 *
 * Returns the number of feeds that were successfully refreshed.
 */
export async function refreshAllFeeds(): Promise<number> {
  const currentFeeds = get(feeds);
  if (currentFeeds.length === 0) return 0;

  const results = await Promise.allSettled(
    currentFeeds.map(async (feed) => {
      const result = await fetchFeed(feed.url);

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
      }));

      addFeedArticles(articles);
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

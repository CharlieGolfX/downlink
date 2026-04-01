import Database from "@tauri-apps/plugin-sql";
import type { Feed, Article } from "$lib/types/feed";

let db: Database | null = null;

/**
 * Initialises (or returns the existing) SQLite database connection.
 * Creates tables on first run.
 */
export async function getDb(): Promise<Database> {
  if (db) return db;
  db = await Database.load("sqlite:downlink.db");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS feeds (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      url         TEXT NOT NULL,
      description TEXT,
      logo        TEXT,
      tags        TEXT NOT NULL DEFAULT '[]',
      last_updated TEXT
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS articles (
      id           TEXT PRIMARY KEY,
      feed_id      TEXT NOT NULL,
      feed_title   TEXT NOT NULL,
      feed_logo    TEXT,
      title        TEXT NOT NULL,
      url          TEXT NOT NULL,
      content      TEXT,
      summary      TEXT,
      author       TEXT,
      published_at TEXT,
      read         INTEGER NOT NULL DEFAULT 0,
      categories   TEXT NOT NULL DEFAULT '[]',
      first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
    );
  `);

  // Migration: add first_seen_at to databases created before this column existed.
  // SQLite ignores ADD COLUMN if the column already exists when we catch the error.
  try {
    await db.execute(`
      ALTER TABLE articles ADD COLUMN first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    `);
  } catch {
    // Column already exists — nothing to do.
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

// ── Feed CRUD ────────────────────────────────────────────────────────

export async function dbLoadFeeds(): Promise<Feed[]> {
  const d = await getDb();
  const rows = await d.select<
    Array<{
      id: string;
      title: string;
      url: string;
      description: string | null;
      logo: string | null;
      tags: string;
      last_updated: string | null;
    }>
  >("SELECT * FROM feeds");

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    description: r.description ?? undefined,
    logo: r.logo ?? undefined,
    tags: JSON.parse(r.tags) as string[],
    lastUpdated: r.last_updated ?? undefined,
  }));
}

export async function dbUpsertFeed(feed: Feed): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO feeds (id, title, url, description, logo, tags, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       url = excluded.url,
       description = excluded.description,
       logo = excluded.logo,
       tags = excluded.tags,
       last_updated = excluded.last_updated`,
    [
      feed.id,
      feed.title,
      feed.url,
      feed.description ?? null,
      feed.logo ?? null,
      JSON.stringify(feed.tags),
      feed.lastUpdated ?? null,
    ],
  );
}

export async function dbRemoveFeed(feedId: string): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM articles WHERE feed_id = $1", [feedId]);
  await d.execute("DELETE FROM feeds WHERE id = $1", [feedId]);
}

export async function dbUpdateFeedTags(
  feedId: string,
  tags: string[],
): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE feeds SET tags = $1 WHERE id = $2", [
    JSON.stringify(tags),
    feedId,
  ]);
}

// ── Article CRUD ─────────────────────────────────────────────────────

export async function dbLoadArticles(): Promise<Article[]> {
  const d = await getDb();
  const rows = await d.select<
    Array<{
      id: string;
      feed_id: string;
      feed_title: string;
      feed_logo: string | null;
      title: string;
      url: string;
      content: string | null;
      summary: string | null;
      author: string | null;
      published_at: string | null;
      read: number;
      categories: string;
    }>
  >("SELECT * FROM articles ORDER BY published_at DESC");

  return rows.map((r) => {
    const cats = JSON.parse(r.categories) as string[];
    return {
      id: r.id,
      feedId: r.feed_id,
      feedTitle: r.feed_title,
      feedLogo: r.feed_logo ?? undefined,
      title: r.title,
      url: r.url,
      content: r.content ?? undefined,
      summary: r.summary ?? undefined,
      author: r.author ?? undefined,
      publishedAt: r.published_at ?? undefined,
      read: r.read === 1,
      categories: cats.length > 0 ? cats : undefined,
    };
  });
}

export async function dbUpsertArticle(article: Article): Promise<void> {
  const d = await getDb();
  const now = new Date().toISOString();
  await d.execute(
    `INSERT INTO articles (id, feed_id, feed_title, feed_logo, title, url, content, summary, author, published_at, read, categories, first_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT(id) DO UPDATE SET
       feed_title = excluded.feed_title,
       feed_logo = excluded.feed_logo,
       title = excluded.title,
       url = excluded.url,
       content = excluded.content,
       summary = excluded.summary,
       author = excluded.author,
       published_at = excluded.published_at,
       read = MAX(articles.read, excluded.read),
       categories = excluded.categories`,
    [
      article.id,
      article.feedId,
      article.feedTitle,
      article.feedLogo ?? null,
      article.title,
      article.url,
      article.content ?? null,
      article.summary ?? null,
      article.author ?? null,
      article.publishedAt ?? null,
      article.read ? 1 : 0,
      JSON.stringify(article.categories ?? []),
      now,
    ],
  );
}

export async function dbUpsertArticles(articles: Article[]): Promise<void> {
  const d = await getDb();
  for (const article of articles) {
    await dbUpsertArticle(article);
  }
}

export async function dbMarkArticleRead(articleId: string): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE articles SET read = 1 WHERE id = $1", [articleId]);
}

export async function dbMarkArticleUnread(articleId: string): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE articles SET read = 0 WHERE id = $1", [articleId]);
}

export async function dbRemoveArticlesByFeed(feedId: string): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM articles WHERE feed_id = $1", [feedId]);
}

// ── Pruning ──────────────────────────────────────────────────────────

/**
 * Deletes articles older than 48 hours from the database.
 *
 * Uses `published_at` (from RSS `<pubDate>` / Atom `<published>` / `<updated>`)
 * when available, falling back to `first_seen_at` (the timestamp recorded when
 * the article was first stored) for articles that lack any publication date.
 * This ensures every article can be aged out after 48 hours.
 */
export async function dbPruneOldArticles(): Promise<number> {
  const d = await getDb();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const result = await d.execute(
    "DELETE FROM articles WHERE COALESCE(published_at, first_seen_at) < $1",
    [cutoff],
  );
  return result.rowsAffected;
}

// ── Settings KV ──────────────────────────────────────────────────────

export async function dbGetSetting(key: string): Promise<string | null> {
  const d = await getDb();
  const rows = await d.select<Array<{ value: string }>>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows.length > 0 ? rows[0].value : null;
}

export async function dbSetSetting(key: string, value: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

// ── Size & stats ─────────────────────────────────────────────────────

export interface DbStats {
  /** Total database file size in bytes (page_count * page_size). */
  totalBytes: number;
  /** Number of rows in the articles table. */
  articleCount: number;
  /** Number of rows in the feeds table. */
  feedCount: number;
}

/**
 * Returns size and row-count statistics for the local database.
 * Uses SQLite PRAGMA values to compute the on-disk file size.
 */
export async function dbGetStats(): Promise<DbStats> {
  const d = await getDb();

  const [pageSizeRows, pageCountRows, articleCountRows, feedCountRows] =
    await Promise.all([
      d.select<Array<{ page_size: number }>>("PRAGMA page_size"),
      d.select<Array<{ page_count: number }>>("PRAGMA page_count"),
      d.select<Array<{ cnt: number }>>("SELECT COUNT(*) AS cnt FROM articles"),
      d.select<Array<{ cnt: number }>>("SELECT COUNT(*) AS cnt FROM feeds"),
    ]);

  const pageSize = pageSizeRows[0]?.page_size ?? 4096;
  const pageCount = pageCountRows[0]?.page_count ?? 0;

  return {
    totalBytes: pageSize * pageCount,
    articleCount: articleCountRows[0]?.cnt ?? 0,
    feedCount: feedCountRows[0]?.cnt ?? 0,
  };
}

// ── Clear cache (articles only) ──────────────────────────────────────

/**
 * Deletes **all** cached articles from the database.
 * Feeds and settings are preserved.
 * Returns the number of articles that were removed.
 */
export async function dbClearCache(): Promise<number> {
  const d = await getDb();
  const result = await d.execute("DELETE FROM articles");
  // Reclaim disk space after bulk delete
  await d.execute("VACUUM");
  return result.rowsAffected;
}

// ── Clear all data ───────────────────────────────────────────────────

/**
 * Deletes **everything** from the database: articles, feeds, and settings.
 * The tables themselves are kept so the app can continue operating.
 */
export async function dbClearAll(): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM articles");
  await d.execute("DELETE FROM feeds");
  await d.execute("DELETE FROM settings");
  // Reclaim disk space after bulk delete
  await d.execute("VACUUM");
}

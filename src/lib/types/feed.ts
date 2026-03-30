export interface Feed {
  id: string;
  title: string;
  url: string;
  description?: string;
  logo?: string;
  tags: string[];
  lastUpdated?: string;
}

export interface Article {
  id: string;
  feedId: string;
  feedTitle: string;
  feedLogo?: string;
  title: string;
  url: string;
  content?: string;
  summary?: string;
  author?: string;
  publishedAt?: string;
  read: boolean;
  categories?: string[];
}

/** Matches the Rust `FeedResult` struct returned by the `fetch_feed` command. */
export interface FeedResult {
  title: string;
  description: string | null;
  logo: string | null;
  articles: ArticleResult[];
}

/** Matches the Rust `ArticleResult` struct returned inside `FeedResult`. */
export interface ArticleResult {
  id: string;
  title: string;
  url: string;
  content: string | null;
  summary: string | null;
  author: string | null;
  published_at: string | null;
  categories: string[];
}

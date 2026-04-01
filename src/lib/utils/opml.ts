import type { Feed } from "$lib/types/feed";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates an OPML 2.0 XML string from the given list of feeds.
 * Each feed becomes an `<outline>` element with its title, URL,
 * and optional category (from tags).
 */
export function generateOpml(feeds: Feed[]): string {
  const outlines = feeds
    .map((feed) => {
      const text = escapeXml(feed.title);
      const xmlUrl = escapeXml(feed.url);
      const category =
        feed.tags.length > 0
          ? ` category="${escapeXml(feed.tags.join(","))}"`
          : "";
      return `    <outline text="${text}" title="${text}" type="rss" xmlUrl="${xmlUrl}"${category} />`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Downlink Feeds</title>
    <dateCreated>${new Date().toISOString()}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>`;
}

import { Readability } from "@mozilla/readability";

export interface ExtractedArticle {
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline: string;
  siteName: string;
  length: number;
}

/**
 * Uses Mozilla Readability to extract the main article content from raw HTML.
 * A <base> tag is injected so relative URLs (images, links) resolve correctly.
 */
export function extractArticle(
  html: string,
  url: string,
): ExtractedArticle | null {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Inject <base> so relative src/href resolve against the original page URL
  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);

  const reader = new Readability(doc, {
    charThreshold: 0, // be aggressive about extracting content
  });
  const result = reader.parse();
  if (!result || !result.content) return null;

  return {
    title: result.title ?? "",
    content: result.content,
    textContent: result.textContent ?? "",
    excerpt: result.excerpt ?? "",
    byline: result.byline ?? "",
    siteName: result.siteName ?? "",
    length: result.length ?? 0,
  };
}

/**
 * Estimates reading time in minutes from plain text.
 */
export function estimateReadingTime(text: string): number {
  if (!text) return 0;
  const words = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0).length;
  return Math.max(1, Math.ceil(words / 238));
}

export interface ReaderHtmlOptions {
  theme: "light" | "sepia" | "dark";
  fontFamily: "serif" | "sans-serif";
  fontSizePx: number;
  articleUrl: string;
}

const SERIF_STACK = `Georgia, Charter, "Bitstream Charter", "Iowan Old Style", "Palatino Linotype", Palatino, serif`;
const SANS_STACK = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", sans-serif`;

/**
 * Builds a complete, self-contained HTML document for the reader webview.
 * Includes all styling inline — no external dependencies.
 */
export function buildReaderHtml(
  content: string,
  options: ReaderHtmlOptions,
): string {
  const fontStack =
    options.fontFamily === "serif" ? SERIF_STACK : SANS_STACK;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${escapeAttr(options.articleUrl)}">
<style>
:root {
  --reader-font-size: ${options.fontSizePx}px;
  --reader-font-family: ${fontStack};
  --reader-line-height: 1.7;
  --reader-max-width: 680px;
}

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--reader-font-family);
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
  padding: 2rem 1.5rem 4rem;
  transition: background-color 0.2s ease, color 0.2s ease;
}

/* ── Themes ──────────────────────────────────────────── */
body.theme-light {
  background: #ffffff;
  color: #1d1d1f;
}
body.theme-light a { color: #0066cc; }
body.theme-light blockquote { border-left-color: #d1d1d6; color: #48484a; }
body.theme-light pre, body.theme-light code { background: #f5f5f7; }
body.theme-light hr { border-color: #d1d1d6; }
body.theme-light th { background: #f5f5f7; }
body.theme-light td { border-color: #d1d1d6; }

body.theme-sepia {
  background: #f4ecd8;
  color: #3b3121;
}
body.theme-sepia a { color: #7b5e2e; }
body.theme-sepia blockquote { border-left-color: #c9b99a; color: #5c4d33; }
body.theme-sepia pre, body.theme-sepia code { background: #ece4d0; }
body.theme-sepia hr { border-color: #c9b99a; }
body.theme-sepia th { background: #ece4d0; }
body.theme-sepia td { border-color: #c9b99a; }

body.theme-dark {
  background: #1c1c1e;
  color: #e5e5e7;
}
body.theme-dark a { color: #64a8f0; }
body.theme-dark blockquote { border-left-color: #48484a; color: #a1a1a6; }
body.theme-dark pre, body.theme-dark code { background: #2c2c2e; color: #e5e5e7; }
body.theme-dark hr { border-color: #48484a; }
body.theme-dark th { background: #2c2c2e; }
body.theme-dark td { border-color: #48484a; }

/* ── Article wrapper ─────────────────────────────────── */
.reader-article {
  max-width: var(--reader-max-width);
  margin: 0 auto;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* ── Typography ──────────────────────────────────────── */
p { margin: 0 0 1.2em; }

h1, h2, h3, h4, h5, h6 {
  margin: 1.6em 0 0.6em;
  line-height: 1.3;
  font-weight: 700;
}
h1 { font-size: 1.8em; margin-top: 0; }
h2 { font-size: 1.45em; }
h3 { font-size: 1.2em; }
h4, h5, h6 { font-size: 1.05em; }

/* ── Images ──────────────────────────────────────────── */
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5em auto;
  border-radius: 6px;
}

figure {
  margin: 1.5em 0;
  padding: 0;
}
figure img { margin-bottom: 0.5em; }

figcaption {
  font-size: 0.85em;
  opacity: 0.7;
  text-align: center;
  margin-top: 0.4em;
}

/* ── Links ───────────────────────────────────────────── */
a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
a:hover { opacity: 0.8; }

/* ── Blockquotes ─────────────────────────────────────── */
blockquote {
  margin: 1.2em 0;
  padding: 0.5em 0 0.5em 1.2em;
  border-left: 3px solid;
  font-style: italic;
}
blockquote p:last-child { margin-bottom: 0; }

/* ── Code ────────────────────────────────────────────── */
pre {
  padding: 1em 1.2em;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.88em;
  line-height: 1.5;
  margin: 1.2em 0;
}
code {
  font-family: "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.9em;
  padding: 0.15em 0.35em;
  border-radius: 4px;
}
pre code {
  padding: 0;
  background: transparent;
  font-size: inherit;
}

/* ── Lists ───────────────────────────────────────────── */
ul, ol {
  margin: 0.8em 0;
  padding-left: 1.5em;
}
li { margin-bottom: 0.35em; }
li > ul, li > ol { margin-top: 0.35em; margin-bottom: 0; }

/* ── Tables ──────────────────────────────────────────── */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.2em 0;
  font-size: 0.92em;
}
th, td {
  padding: 0.55em 0.75em;
  text-align: left;
  border-bottom: 1px solid;
}
th { font-weight: 600; }

/* ── Horizontal rule ─────────────────────────────────── */
hr {
  border: none;
  border-top: 1px solid;
  margin: 2em 0;
}

/* ── Misc ────────────────────────────────────────────── */
strong, b { font-weight: 700; }
em, i { font-style: italic; }

video, audio {
  max-width: 100%;
  margin: 1.2em 0;
}

/* ── Scrollbar (WebKit) ──────────────────────────────── */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.5); }
</style>
</head>
<body class="theme-${options.theme}">
  <div class="reader-article">
    ${content}
  </div>
</body>
</html>`;
}

/**
 * Generates JavaScript that can be eval'd in the reader webview to update
 * styling without a full page reload — preserves scroll position.
 */
export function buildStyleUpdateJs(options: {
  theme: "light" | "sepia" | "dark";
  fontFamily: "serif" | "sans-serif";
  fontSizePx: number;
}): string {
  const fontStack =
    options.fontFamily === "serif" ? SERIF_STACK : SANS_STACK;

  return `
    document.body.className = 'theme-${options.theme}';
    document.documentElement.style.setProperty('--reader-font-size', '${options.fontSizePx}px');
    document.documentElement.style.setProperty('--reader-font-family', '${fontStack.replace(/'/g, "\\'")}');
  `;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

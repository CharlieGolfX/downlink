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
 * Common lazy-load attributes that sites use instead of (or alongside) `src`.
 * Ordered by priority — first match wins.
 */
const LAZY_SRC_ATTRS = [
  "data-src",
  "data-lazy-src",
  "data-original",
  "data-orig-file",
  "data-full-src",
  "data-actualsrc",
  "data-hi-res-src",
  "data-delay-url",
  "data-li-src",
];

const LAZY_SRCSET_ATTRS = [
  "data-srcset",
  "data-lazy-srcset",
  "data-responsive",
];

/**
 * Pre-processes a parsed DOM document **before** Readability runs so that
 * lazy-loaded images are surfaced and tracking pixels / spacer GIFs are
 * removed.  This mutates the document in place.
 */
function preprocessDom(doc: Document): void {
  // ── 1. Rescue images from <noscript> tags ─────────────────────────────
  // Many sites duplicate images inside <noscript> for no-JS fallback.
  // The <noscript> content is the *real* <img> with a proper `src`,
  // while the visible sibling often has only a lazy-load placeholder.
  for (const noscript of Array.from(doc.querySelectorAll("noscript"))) {
    const parent = noscript.parentElement;
    if (!parent) continue;

    // Parse the noscript inner HTML in a temporary container
    const temp = doc.createElement("div");
    temp.innerHTML = noscript.textContent ?? "";
    const noscriptImgs = temp.querySelectorAll("img");
    if (noscriptImgs.length === 0) continue;

    // Check if there's already a sibling <img> directly before this <noscript>
    const prevSibling = noscript.previousElementSibling;
    if (
      prevSibling &&
      prevSibling.tagName === "IMG" &&
      noscriptImgs.length === 1
    ) {
      const noscriptImg = noscriptImgs[0];
      const realSrc = noscriptImg.getAttribute("src") ?? "";
      const existingSrc = prevSibling.getAttribute("src") ?? "";

      // If the existing sibling has a blank/placeholder src, replace it
      if (
        realSrc &&
        (!existingSrc ||
          existingSrc.startsWith("data:") ||
          existingSrc.includes("placeholder") ||
          existingSrc.includes("blank") ||
          existingSrc.includes("spacer") ||
          existingSrc.includes("1x1") ||
          existingSrc.includes("lazy"))
      ) {
        prevSibling.setAttribute("src", realSrc);

        // Also pull over srcset if available
        const nsSrcset = noscriptImg.getAttribute("srcset");
        if (nsSrcset) prevSibling.setAttribute("srcset", nsSrcset);

        // Copy width/height if present on the noscript img
        for (const attr of ["width", "height"]) {
          const val = noscriptImg.getAttribute(attr);
          if (val) prevSibling.setAttribute(attr, val);
        }
      }
    } else {
      // No matching sibling — insert the noscript images directly
      for (const img of Array.from(noscriptImgs)) {
        parent.insertBefore(doc.importNode(img, true), noscript);
      }
    }
  }

  // ── 2. Promote lazy-load data-* attributes to `src` / `srcset` ────────
  const allImgs = doc.querySelectorAll("img");
  for (const img of Array.from(allImgs)) {
    const currentSrc = img.getAttribute("src") ?? "";
    const isPlaceholder =
      !currentSrc ||
      currentSrc.startsWith("data:") ||
      currentSrc.includes("placeholder") ||
      currentSrc.includes("blank.") ||
      currentSrc.includes("spacer") ||
      currentSrc.includes("1x1") ||
      /lazy/i.test(currentSrc);

    if (isPlaceholder) {
      for (const attr of LAZY_SRC_ATTRS) {
        const val = img.getAttribute(attr);
        if (val && val.startsWith("http")) {
          img.setAttribute("src", val);
          break;
        }
      }
    }

    // Promote lazy srcset
    if (!img.getAttribute("srcset")) {
      for (const attr of LAZY_SRCSET_ATTRS) {
        const val = img.getAttribute(attr);
        if (val) {
          img.setAttribute("srcset", val);
          break;
        }
      }
    }

    // If still no src but has srcset, pull the first URL from srcset
    const srcAfter = img.getAttribute("src") ?? "";
    if (
      (!srcAfter || srcAfter.startsWith("data:")) &&
      img.getAttribute("srcset")
    ) {
      const firstUrl = (img.getAttribute("srcset") ?? "")
        .split(",")[0]
        ?.trim()
        .split(/\s+/)[0];
      if (firstUrl) {
        img.setAttribute("src", firstUrl);
      }
    }
  }

  // ── 3. Handle <picture> elements ──────────────────────────────────────
  for (const picture of Array.from(doc.querySelectorAll("picture"))) {
    const img = picture.querySelector("img");
    if (!img) {
      // No <img> child — try to create one from <source>
      const source = picture.querySelector("source[srcset]");
      if (source) {
        const srcset = source.getAttribute("srcset") ?? "";
        const firstUrl = srcset.split(",")[0]?.trim().split(/\s+/)[0];
        if (firstUrl) {
          const newImg = doc.createElement("img");
          newImg.setAttribute("src", firstUrl);
          picture.appendChild(newImg);
        }
      }
      continue;
    }

    // If the <img> inside <picture> still has a placeholder src, try sources
    const imgSrc = img.getAttribute("src") ?? "";
    if (
      !imgSrc ||
      imgSrc.startsWith("data:") ||
      imgSrc.includes("placeholder")
    ) {
      const source = picture.querySelector("source[srcset]");
      if (source) {
        const srcset = source.getAttribute("srcset") ?? "";
        const firstUrl = srcset.split(",")[0]?.trim().split(/\s+/)[0];
        if (firstUrl) {
          img.setAttribute("src", firstUrl);
        }
      }
    }
  }

  // ── 4. Remove tiny tracking pixels / spacer images ────────────────────
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const w = img.getAttribute("width");
    const h = img.getAttribute("height");
    if ((w === "1" || w === "0") && (h === "1" || h === "0")) {
      img.remove();
      continue;
    }

    // Also check inline style for 1px images
    const style = img.getAttribute("style") ?? "";
    if (
      /width\s*:\s*[01]px/i.test(style) &&
      /height\s*:\s*[01]px/i.test(style)
    ) {
      img.remove();
    }
  }
}

/**
 * Post-processes the HTML content produced by Readability to annotate
 * images with dimension hints so the reader CSS/JS can size them properly.
 */
function postprocessContent(html: string, baseUrl: string): string {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><head><base href="${baseUrl}"></head><body>${html}</body></html>`,
    "text/html",
  );

  for (const img of Array.from(doc.querySelectorAll("img"))) {
    // Resolve relative URLs against the base
    const src = img.getAttribute("src");
    if (
      src &&
      !src.startsWith("http") &&
      !src.startsWith("data:") &&
      !src.startsWith("//")
    ) {
      try {
        const resolved = new URL(src, baseUrl).href;
        img.setAttribute("src", resolved);
      } catch {
        // leave as-is
      }
    }

    // Protocol-relative URLs
    if (src && src.startsWith("//")) {
      try {
        const protocol = new URL(baseUrl).protocol;
        img.setAttribute("src", protocol + src);
      } catch {
        // leave as-is
      }
    }

    // Preserve width/height as data attributes for the sizing script
    const w = img.getAttribute("width");
    const h = img.getAttribute("height");
    if (w) img.setAttribute("data-orig-width", w);
    if (h) img.setAttribute("data-orig-height", h);

    // Also check style attribute for width/height
    const style = img.getAttribute("style") ?? "";
    const styleWidth = style.match(/width\s*:\s*(\d+)\s*px/i);
    const styleHeight = style.match(/height\s*:\s*(\d+)\s*px/i);
    if (styleWidth && !w) img.setAttribute("data-orig-width", styleWidth[1]);
    if (styleHeight && !h) img.setAttribute("data-orig-height", styleHeight[1]);

    // Remove any inline max-width/max-height styles that might interfere
    // but keep other styles intact
    if (style) {
      const cleaned = style
        .replace(/max-width\s*:[^;]+;?/gi, "")
        .replace(/max-height\s*:[^;]+;?/gi, "")
        .trim();
      if (cleaned) {
        img.setAttribute("style", cleaned);
      } else {
        img.removeAttribute("style");
      }
    }
  }

  return doc.body.innerHTML;
}

/**
 * Uses Mozilla Readability to extract the main article content from raw HTML.
 * A <base> tag is injected so relative URLs (images, links) resolve correctly.
 * The DOM is pre-processed to rescue lazy-loaded images before extraction.
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

  // Pre-process the DOM to rescue lazy-loaded images
  preprocessDom(doc);

  const reader = new Readability(doc, {
    charThreshold: 0, // be aggressive about extracting content
  });
  const result = reader.parse();
  if (!result || !result.content) return null;

  // Post-process extracted content for better image handling
  const processedContent = postprocessContent(result.content, url);

  return {
    title: result.title ?? "",
    content: processedContent,
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
 * JavaScript that runs inside the reader webview after page load.
 * It measures each image's natural dimensions once loaded and applies
 * appropriate sizing classes so small images aren't stretched.
 */
const IMAGE_SIZING_SCRIPT = `
<script>
(function() {
  var SMALL_THRESHOLD = 120;   // images narrower than this stay inline-ish
  var MEDIUM_THRESHOLD = 300;  // images narrower than this keep natural size

  function classifyImage(img) {
    var natural = img.naturalWidth;
    var origW = parseInt(img.dataset.origWidth, 10) || 0;
    var origH = parseInt(img.dataset.origHeight, 10) || 0;

    // Use the original attribute width if available and seems reasonable
    var effectiveWidth = origW || natural;
    var effectiveHeight = origH || img.naturalHeight;

    if (!effectiveWidth || effectiveWidth <= 0) return;

    // Remove any previous sizing classes
    img.classList.remove('img-tiny', 'img-small', 'img-medium', 'img-full');

    if (effectiveWidth <= SMALL_THRESHOLD && effectiveHeight <= SMALL_THRESHOLD) {
      // Very small: icon, emoji, badge — keep natural size, allow inline
      img.classList.add('img-tiny');
      img.style.width = effectiveWidth + 'px';
      img.style.height = effectiveHeight + 'px';
    } else if (effectiveWidth <= MEDIUM_THRESHOLD) {
      // Medium-small: keep at original dimensions, centered block
      img.classList.add('img-small');
      img.style.width = effectiveWidth + 'px';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
    } else {
      // Large image: responsive, max-width 100%
      img.classList.add('img-full');
      // If we have original dimensions and it's not huge, constrain to original width
      if (origW && origW < 680) {
        img.style.width = origW + 'px';
        img.style.maxWidth = '100%';
      }
    }
  }

  function processImages() {
    var imgs = document.querySelectorAll('.reader-article img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.complete && img.naturalWidth > 0) {
        classifyImage(img);
      } else {
        img.addEventListener('load', function() {
          classifyImage(this);
        });
        img.addEventListener('error', function() {
          // Hide broken images gracefully
          this.style.display = 'none';
        });
      }
    }
  }

  // Run immediately and also after a short delay for any late-loading images
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processImages);
  } else {
    processImages();
  }
  // Second pass to catch images that started loading later
  setTimeout(processImages, 1500);
})();
</script>`;

/**
 * Builds a complete, self-contained HTML document for the reader webview.
 * Includes all styling inline — no external dependencies.
 */
export function buildReaderHtml(
  content: string,
  options: ReaderHtmlOptions,
): string {
  const fontStack = options.fontFamily === "serif" ? SERIF_STACK : SANS_STACK;

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

/* ── Images (base) ───────────────────────────────────── */
img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  /* Do NOT force display:block — let the JS classify images first.
     Default to inline-block so small images/icons don't break layout. */
  vertical-align: middle;
  transition: opacity 0.3s ease;
}

/* Classified by the sizing script: */

/* Tiny images: icons, emojis, badges — keep inline at natural size */
img.img-tiny {
  display: inline-block;
  margin: 0 0.2em;
  border-radius: 2px;
  vertical-align: middle;
}

/* Small images: keep at original width, centered as block */
img.img-small {
  display: block;
  margin: 1.2em auto;
  height: auto;
}

/* Full/large images: responsive, full reader width */
img.img-full {
  display: block;
  margin: 1.5em auto;
  height: auto;
}

/* Before classification, treat images in <p> as potentially inline */
p > img:only-child {
  display: block;
  margin: 1.2em auto;
}

figure {
  margin: 1.5em 0;
  padding: 0;
}
figure img {
  display: block;
  margin: 0 auto 0.5em;
}

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
${IMAGE_SIZING_SCRIPT}
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
  const fontStack = options.fontFamily === "serif" ? SERIF_STACK : SANS_STACK;

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

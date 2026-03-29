/**
 * Selectors for elements that should be stripped from reader-view content.
 */
const REMOVE_SELECTORS = [
  "script",
  "style",
  "iframe",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "nav",
  "footer",
  "aside",
  "noscript",
  ".ad",
  ".ads",
  ".advert",
  ".advertisement",
  ".social-share",
  ".share-buttons",
  ".sharing",
  ".related-posts",
  ".related",
  ".comments",
  ".comment-section",
  ".sidebar",
  ".widget",
  ".newsletter",
  ".signup",
  ".subscribe",
  ".popup",
  ".modal",
  ".cookie",
  ".banner",
  ".promo",
  '[role="navigation"]',
  '[role="complementary"]',
  '[role="banner"]',
  '[aria-hidden="true"]',
];

/**
 * Strips non-article elements, tracking pixels, inline styles, and class
 * attributes from the given HTML string so the reader view can apply its
 * own clean typography.
 */
export function sanitizeContent(html: string): string {
  if (!html) return "";

  const doc = new DOMParser().parseFromString(html, "text/html");

  // Remove unwanted elements by selector
  for (const sel of REMOVE_SELECTORS) {
    try {
      doc.querySelectorAll(sel).forEach((el) => el.remove());
    } catch {
      /* invalid selector in this context – skip */
    }
  }

  // Remove hidden elements
  doc.querySelectorAll("[style]").forEach((el) => {
    const s = (el as HTMLElement).style;
    if (
      s.display === "none" ||
      s.visibility === "hidden" ||
      s.opacity === "0" ||
      (s.width === "0px" && s.height === "0px") ||
      (s.width === "1px" && s.height === "1px")
    ) {
      el.remove();
    }
  });

  // Remove tracking pixels (1×1 or 0×0 images)
  doc.querySelectorAll("img").forEach((img) => {
    const w = img.getAttribute("width");
    const h = img.getAttribute("height");
    if (
      (w === "1" || w === "0") &&
      (h === "1" || h === "0")
    ) {
      img.remove();
    }
  });

  // Strip all inline styles so the reader theme controls appearance
  doc.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));

  // Strip class names – reader CSS uses its own scoped styles
  doc.querySelectorAll("[class]").forEach((el) => el.removeAttribute("class"));

  // Strip id attributes to avoid style collisions
  doc.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));

  return doc.body.innerHTML;
}

/**
 * Returns estimated reading time in minutes (≥ 1) based on an average
 * reading speed of ~238 words per minute.
 */
export function estimateReadingTime(html: string): number {
  if (!html) return 0;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ").filter((w) => w.length > 0).length;
  return Math.max(1, Math.ceil(words / 238));
}

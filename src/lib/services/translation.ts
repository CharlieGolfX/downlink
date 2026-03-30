import { invoke } from "@tauri-apps/api/core";

/** Maximum characters per translation API call. */
const CHUNK_MAX_CHARS = 4500;

/**
 * Separator used to join multiple text blocks into a single API call.
 * Triple newline is preserved by most translation engines and is unlikely
 * to appear naturally inside a single block's text content.
 */
const BLOCK_SEP = "\n\n\n";

/** CSS selector for block-level elements whose text should be translated. */
const BLOCK_SELECTOR =
  "p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, dt, dd, caption";

/**
 * Translates the text content inside block-level HTML elements.
 *
 * The HTML structure (tags, attributes, images, links) is preserved —
 * only the visible text within each block is replaced with its translation.
 * Inline formatting (bold, italic, links) within a single block may be lost
 * because `textContent` replacement strips child markup; this is an accepted
 * trade-off for a lightweight, dependency-free implementation.
 *
 * Text is batched into chunks under {@link CHUNK_MAX_CHARS} to respect API
 * limits, and each chunk is translated in a single backend call.
 */
export async function translateHtml(
  html: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Collect all block elements that contain actual text
  const blocks = Array.from(doc.querySelectorAll(BLOCK_SELECTOR));
  const translatable: { el: Element; text: string }[] = [];

  for (const el of blocks) {
    const text = el.textContent?.trim();
    if (text && text.length > 0) {
      translatable.push({ el, text });
    }
  }

  if (translatable.length === 0) return html;

  // ── Batch blocks into translation chunks ──────────────────────────
  interface Batch {
    indices: number[];
    combined: string;
  }

  const batches: Batch[] = [];
  let curIndices: number[] = [];
  let curTexts: string[] = [];
  let curLen = 0;

  for (let i = 0; i < translatable.length; i++) {
    const text = translatable[i].text;
    const added = text.length + (curTexts.length > 0 ? BLOCK_SEP.length : 0);

    if (curLen + added > CHUNK_MAX_CHARS && curTexts.length > 0) {
      batches.push({
        indices: [...curIndices],
        combined: curTexts.join(BLOCK_SEP),
      });
      curIndices = [];
      curTexts = [];
      curLen = 0;
    }

    curIndices.push(i);
    curTexts.push(text);
    curLen += added;
  }

  if (curTexts.length > 0) {
    batches.push({
      indices: [...curIndices],
      combined: curTexts.join(BLOCK_SEP),
    });
  }

  // ── Translate each batch via the Rust backend ─────────────────────
  for (const batch of batches) {
    try {
      const translated: string = await invoke("translate_text", {
        text: batch.combined,
        sourceLang,
        targetLang,
      });

      const parts = translated.split(/\n\n\n/);

      for (let j = 0; j < batch.indices.length; j++) {
        const idx = batch.indices[j];
        const part = parts[j]?.trim();
        if (part) {
          translatable[idx].el.textContent = part;
        }
      }
    } catch (e) {
      console.error("[translation] Batch translation failed:", e);
      // Leave original text for this batch
    }
  }

  return doc.body.innerHTML;
}

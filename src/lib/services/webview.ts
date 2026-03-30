import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Computes the vertical offset between the Tauri window's content area and
 * the actual JS viewport. In Tauri v2 multiwebview mode on macOS the content
 * view can extend behind the title bar, so the window's logical inner height
 * may be larger than `window.innerHeight`. The difference is the y-offset we
 * need to add when positioning child webviews via `add_child` / `set_position`.
 */
async function getVerticalOffset(): Promise<number> {
  try {
    const win = getCurrentWindow();
    const innerSize = await win.innerSize();
    const scale = await win.scaleFactor();
    const logicalHeight = innerSize.height / scale;
    const logicalWidth = innerSize.width / scale;
    const offsetY = logicalHeight - window.innerHeight;
    const offsetX = logicalWidth - window.innerWidth;

    console.log("[webview] offset debug:", {
      physicalSize: { w: innerSize.width, h: innerSize.height },
      scale,
      logicalSize: { w: logicalWidth, h: logicalHeight },
      jsViewport: { w: window.innerWidth, h: window.innerHeight },
      computedOffset: { x: offsetX, y: offsetY },
    });

    return offsetY;
  } catch (e) {
    console.error("[webview] failed to compute vertical offset:", e);
    return 0;
  }
}

// ── Original webview ────────────────────────────────────────────────────────

/**
 * Creates or navigates the "original-content" webview overlay positioned
 * at the given logical coordinates within the main window.
 */
export async function showOriginal(
  url: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  const offsetY = await getVerticalOffset();
  console.log("[webview] showOriginal rect before offset:", {
    x,
    y,
    width,
    height,
  });
  const adjustedY = y + offsetY;
  console.log(
    "[webview] showOriginal adjusted y:",
    adjustedY,
    "(offset:",
    offsetY,
    ")",
  );
  await invoke("show_original", { url, x, y: adjustedY, width, height });
}

/**
 * Closes the "original-content" webview if it exists.
 */
export async function hideOriginal(): Promise<void> {
  await invoke("hide_original");
}

/**
 * Repositions and resizes the "original-content" webview.
 * No-op if the webview doesn't currently exist.
 */
export async function resizeOriginal(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  const offsetY = await getVerticalOffset();
  const adjustedY = y + offsetY;
  await invoke("resize_original", { x, y: adjustedY, width, height });
}

// ── Reader webview ──────────────────────────────────────────────────────────

/**
 * Fetches the full HTML of a page via the Rust backend (avoids CORS).
 */
export async function fetchPageHtml(url: string): Promise<string> {
  return await invoke<string>("fetch_page_html", { url });
}

/**
 * Creates or navigates the "reader-content" webview overlay.
 * The `html` parameter should be a complete HTML document string
 * (built by `buildReaderHtml`) that will be served via the custom
 * `reader://` protocol registered on the Rust side.
 */
export async function showReader(
  html: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  const offsetY = await getVerticalOffset();
  console.log("[webview] showReader rect before offset:", {
    x,
    y,
    width,
    height,
  });
  const adjustedY = y + offsetY;
  console.log(
    "[webview] showReader adjusted y:",
    adjustedY,
    "(offset:",
    offsetY,
    ")",
  );
  await invoke("show_reader", { html, x, y: adjustedY, width, height });
}

/**
 * Closes the "reader-content" webview if it exists.
 */
export async function hideReader(): Promise<void> {
  await invoke("hide_reader");
}

/**
 * Repositions and resizes the "reader-content" webview.
 * No-op if the webview doesn't currently exist.
 */
export async function resizeReader(
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  const offsetY = await getVerticalOffset();
  const adjustedY = y + offsetY;
  await invoke("resize_reader", { x, y: adjustedY, width, height });
}

/**
 * Evaluates JavaScript inside the reader webview.
 * Used to update styles (theme, font, size) without reloading the page.
 */
export async function evalReader(js: string): Promise<void> {
  await invoke("eval_reader", { js });
}

/**
 * Evaluates JavaScript inside the original-content webview.
 * Used for injecting scroll commands and other runtime behaviour.
 */
export async function evalOriginal(js: string): Promise<void> {
  await invoke("eval_original", { js });
}

import { writable } from "svelte/store";
import { dbGetSetting, dbSetSetting } from "$lib/services/db";

/**
 * Tracks whether any modal dialog is currently visible.
 * Child webviews (reader / original) listen to this and hide themselves
 * while a modal is open so they don't paint over the dialog.
 */
export const modalOpen = writable(false);

/**
 * Monotonically increasing counter that is bumped every time a global
 * refresh is triggered (hourly poll or manual refresh button).
 * Components that need to re-fetch data (e.g. weather) can subscribe
 * to this and react when the value changes.
 */
export const refreshSignal = writable(0);

/**
 * Timestamp (Date) of the last successful global refresh.
 * Set after feeds + weather have been refreshed.
 */
export const lastUpdated = writable<Date | null>(null);

export function triggerRefresh() {
  refreshSignal.update((n) => n + 1);
}

export function markUpdated() {
  lastUpdated.set(new Date());
}

export const compactMode = writable(false);

function applyCompactClass(enabled: boolean) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("compact", enabled);
  }
}

export async function loadCompactMode(): Promise<void> {
  try {
    const stored = await dbGetSetting("compact-mode");
    const enabled = stored === "true";
    compactMode.set(enabled);
    applyCompactClass(enabled);
  } catch {
    // keep default
  }
}

export async function setCompactMode(enabled: boolean): Promise<void> {
  await dbSetSetting("compact-mode", String(enabled));
  compactMode.set(enabled);
  applyCompactClass(enabled);
}

// ── Default article view ─────────────────────────────────────────────

export type ArticleViewDefault = "reader" | "original" | "browser";

export const defaultArticleView = writable<ArticleViewDefault>("reader");

export async function loadDefaultArticleView(): Promise<void> {
  try {
    const stored = await dbGetSetting("default-article-view");
    if (stored === "reader" || stored === "original" || stored === "browser") {
      defaultArticleView.set(stored);
    }
  } catch {
    // keep default
  }
}

export async function setDefaultArticleView(
  mode: ArticleViewDefault,
): Promise<void> {
  await dbSetSetting("default-article-view", mode);
  defaultArticleView.set(mode);
}

// ── Close to tray ────────────────────────────────────────────────────

export const closeToTray = writable(true);

export async function loadCloseToTray(): Promise<void> {
  try {
    const stored = await dbGetSetting("close-to-tray");
    if (stored !== null) {
      closeToTray.set(stored === "true");
    }
  } catch {
    // keep default (true)
  }
}

export async function setCloseToTray(enabled: boolean): Promise<void> {
  await dbSetSetting("close-to-tray", String(enabled));
  closeToTray.set(enabled);
}

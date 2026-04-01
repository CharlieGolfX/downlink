import { writable, get } from "svelte/store";
import { dbGetSetting, dbSetSetting } from "$lib/services/db";

export type ThemeMode = "system" | "light" | "dark";

/**
 * The user's chosen theme mode: "system" (follow OS), "light", or "dark".
 */
export const themeMode = writable<ThemeMode>("system");

let mediaQuery: MediaQueryList | null = null;
let unsubscribe: (() => void) | null = null;

/**
 * Resolves the current theme mode to an effective "light" or "dark" value,
 * taking the OS preference into account when mode is "system".
 */
function resolveEffectiveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

/**
 * Applies the effective theme by toggling the `dark` class on `<html>`.
 */
function applyTheme(mode: ThemeMode) {
  const effective = resolveEffectiveTheme(mode);
  document.documentElement.classList.toggle("dark", effective === "dark");
}

/**
 * Handles OS-level color-scheme changes while in "system" mode.
 */
function handleSystemChange() {
  if (get(themeMode) === "system") {
    applyTheme("system");
  }
}

/**
 * Initialises the theme system. Call once on app startup (after DB is ready).
 *
 * 1. Reads the persisted preference from the DB (defaults to "system").
 * 2. Applies the resolved theme immediately.
 * 3. Listens for OS preference changes and store updates.
 */
export async function initTheme() {
  // Set up OS media-query listener
  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", handleSystemChange);

  // Load persisted preference
  try {
    const saved = await dbGetSetting("theme-mode");
    if (saved === "light" || saved === "dark" || saved === "system") {
      themeMode.set(saved);
    }
  } catch {
    // use default ("system")
  }

  // Apply now
  applyTheme(get(themeMode));

  // React to future programmatic changes
  unsubscribe = themeMode.subscribe((mode) => {
    applyTheme(mode);
  });
}

/**
 * Sets the theme mode, persists it to the DB, and applies it immediately.
 */
export async function setThemeMode(mode: ThemeMode) {
  themeMode.set(mode);
  await dbSetSetting("theme-mode", mode);
}

/**
 * Tears down listeners (for cleanup, if ever needed).
 */
export function destroyTheme() {
  if (mediaQuery) {
    mediaQuery.removeEventListener("change", handleSystemChange);
    mediaQuery = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

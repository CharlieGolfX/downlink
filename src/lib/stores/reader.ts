import { writable } from "svelte/store";

export type ReaderTheme = "light" | "sepia" | "dark";
export type ReaderFont = "serif" | "sans-serif";

export interface ReaderSettings {
  fontSize: number; // 1–5 scale
  fontFamily: ReaderFont;
  theme: ReaderTheme;
}

const STORAGE_KEY = "downlink-reader-settings";

const defaults: ReaderSettings = {
  fontSize: 3,
  fontFamily: "serif",
  theme: "light",
};

function load(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...defaults };
}

function persist(settings: ReaderSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export const readerSettings = writable<ReaderSettings>(load());
readerSettings.subscribe(persist);

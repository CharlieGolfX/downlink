import { writable } from "svelte/store";

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

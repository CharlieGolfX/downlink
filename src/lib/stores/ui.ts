import { writable } from "svelte/store";

/**
 * Tracks whether any modal dialog is currently visible.
 * Child webviews (reader / original) listen to this and hide themselves
 * while a modal is open so they don't paint over the dialog.
 */
export const modalOpen = writable(false);

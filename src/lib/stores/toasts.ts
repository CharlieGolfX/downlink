import { writable } from "svelte/store";

export interface Toast {
  id: number;
  message: string;
  type: "error" | "info" | "success";
  duration: number;
}

let nextId = 0;

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  function dismiss(id: number) {
    update((all) => all.filter((t) => t.id !== id));
  }

  function push(
    message: string,
    type: Toast["type"] = "error",
    duration = 4000,
  ): number {
    const id = nextId++;
    update((all) => [...all, { id, message, type, duration }]);
    return id;
  }

  return {
    subscribe,
    push,
    dismiss,
    error: (message: string, duration?: number) =>
      push(message, "error", duration),
    info: (message: string, duration?: number) =>
      push(message, "info", duration),
    success: (message: string, duration?: number) =>
      push(message, "success", duration),
  };
}

export const toasts = createToastStore();

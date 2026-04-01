<script lang="ts">
    import { modalOpen } from "$lib/stores/ui";
    import { dbGetSetting, dbSetSetting } from "$lib/services/db";
    import { toasts } from "$lib/stores/toasts";
    import { invoke } from "@tauri-apps/api/core";
    import { tick } from "svelte";
    import { themeMode, setThemeMode, type ThemeMode } from "$lib/stores/theme";

    let {
        open = $bindable(false),
    }: {
        open: boolean;
    } = $props();

    $effect(() => {
        modalOpen.set(open);
    });

    const REFRESH_OPTIONS = [
        { label: "15 minutes", value: "900" },
        { label: "30 minutes", value: "1800" },
        { label: "1 hour", value: "3600" },
        { label: "2 hours", value: "7200" },
        { label: "4 hours", value: "14400" },
        { label: "12 hours", value: "43200" },
        { label: "24 hours", value: "86400" },
    ];

    const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
        { label: "System", value: "system" },
        { label: "Light", value: "light" },
        { label: "Dark", value: "dark" },
    ];

    const DEFAULT_REFRESH = "3600";

    let refreshInterval = $state(DEFAULT_REFRESH);
    let currentTheme = $state<ThemeMode>("system");
    let selectEl: HTMLSelectElement | undefined = $state();

    $effect(() => {
        if (open) {
            loadSettings();
            tick().then(() => selectEl?.focus());
        }
    });

    // Keep local state in sync with the store
    $effect(() => {
        currentTheme = $themeMode;
    });

    async function loadSettings() {
        try {
            const stored = await dbGetSetting("refresh-interval-secs");
            if (stored) {
                refreshInterval = stored;
            } else {
                refreshInterval = DEFAULT_REFRESH;
            }
        } catch {
            refreshInterval = DEFAULT_REFRESH;
        }

        // Theme is already synced via the store subscription above
    }

    async function handleRefreshChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        const value = target.value;
        refreshInterval = value;

        try {
            console.log("Saving refresh interval to DB:", value);
            await dbSetSetting("refresh-interval-secs", value);
            console.log(
                "DB save succeeded, invoking set_refresh_interval with secs:",
                Number(value),
            );
            await invoke("set_refresh_interval", { secs: Number(value) });
            console.log("invoke succeeded");
            toasts.success("Refresh interval updated");
        } catch (err) {
            console.error("Failed to update refresh interval:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to update refresh interval: ${msg}`);
        }
    }

    async function handleThemeChange(mode: ThemeMode) {
        currentTheme = mode;
        try {
            await setThemeMode(mode);
        } catch (err) {
            console.error("Failed to update theme:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to update theme: ${msg}`);
        }
    }

    function close() {
        open = false;
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            close();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            close();
        }
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="backdrop"
        onclick={handleBackdropClick}
        onkeydown={handleKeydown}
    >
        <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
        >
            <header class="modal-header">
                <h2>Settings</h2>
                <button class="close-btn" onclick={close} aria-label="Close"
                    >&times;</button
                >
            </header>

            <div class="body">
                <div class="field">
                    <label for="theme-mode">Appearance</label>
                    <div
                        class="theme-toggle"
                        role="radiogroup"
                        aria-label="Theme mode"
                    >
                        {#each THEME_OPTIONS as opt}
                            <button
                                class="theme-option"
                                class:active={currentTheme === opt.value}
                                role="radio"
                                aria-checked={currentTheme === opt.value}
                                onclick={() => handleThemeChange(opt.value)}
                            >
                                <span class="theme-icon">
                                    {#if opt.value === "system"}
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 16 16"
                                            fill="none"
                                            aria-hidden="true"
                                        >
                                            <rect
                                                x="2"
                                                y="3"
                                                width="12"
                                                height="8"
                                                rx="1"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                fill="none"
                                            />
                                            <line
                                                x1="5"
                                                y1="13"
                                                x2="11"
                                                y2="13"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                stroke-linecap="round"
                                            />
                                        </svg>
                                    {:else if opt.value === "light"}
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 16 16"
                                            fill="none"
                                            aria-hidden="true"
                                        >
                                            <circle
                                                cx="8"
                                                cy="8"
                                                r="3"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                fill="none"
                                            />
                                            <line
                                                x1="8"
                                                y1="1.5"
                                                x2="8"
                                                y2="3"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                stroke-linecap="round"
                                            />
                                            <line
                                                x1="8"
                                                y1="13"
                                                x2="8"
                                                y2="14.5"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                stroke-linecap="round"
                                            />
                                            <line
                                                x1="1.5"
                                                y1="8"
                                                x2="3"
                                                y2="8"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                stroke-linecap="round"
                                            />
                                            <line
                                                x1="13"
                                                y1="8"
                                                x2="14.5"
                                                y2="8"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                stroke-linecap="round"
                                            />
                                            <line
                                                x1="3.4"
                                                y1="3.4"
                                                x2="4.5"
                                                y2="4.5"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                stroke-linecap="round"
                                            />
                                            <line
                                                x1="11.5"
                                                y1="11.5"
                                                x2="12.6"
                                                y2="12.6"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                stroke-linecap="round"
                                            />
                                            <line
                                                x1="3.4"
                                                y1="12.6"
                                                x2="4.5"
                                                y2="11.5"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                stroke-linecap="round"
                                            />
                                            <line
                                                x1="11.5"
                                                y1="4.5"
                                                x2="12.6"
                                                y2="3.4"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                stroke-linecap="round"
                                            />
                                        </svg>
                                    {:else}
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 16 16"
                                            fill="none"
                                            aria-hidden="true"
                                        >
                                            <path
                                                d="M13.5 9.5a5.5 5.5 0 0 1-7-7 5.5 5.5 0 1 0 7 7Z"
                                                stroke="currentColor"
                                                stroke-width="1.3"
                                                stroke-linejoin="round"
                                                fill="none"
                                            />
                                        </svg>
                                    {/if}
                                </span>
                                {opt.label}
                            </button>
                        {/each}
                    </div>
                </div>

                <div class="field">
                    <label for="refresh-interval">Refresh Interval</label>
                    <select
                        bind:this={selectEl}
                        id="refresh-interval"
                        value={refreshInterval}
                        onchange={handleRefreshChange}
                    >
                        {#each REFRESH_OPTIONS as opt}
                            <option value={opt.value}>{opt.label}</option>
                        {/each}
                    </select>
                </div>

                <footer class="modal-footer">
                    <button type="button" class="btn btn-cancel" onclick={close}
                        >Close</button
                    >
                </footer>
            </div>
        </div>
    </div>
{/if}

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgba(0, 0, 0, 0.45);
    }

    .modal {
        background-color: #fff;
        border-radius: 10px;
        width: 90%;
        max-width: 460px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
        overflow: hidden;
    }

    :global(html.dark) .modal {
        background-color: #2a2a2a;
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid #e0e0e0;
    }

    :global(html.dark) .modal-header {
        border-bottom-color: #3a3a3a;
    }

    .modal-header h2 {
        font-size: 1.05rem;
        font-weight: 600;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.4rem;
        line-height: 1;
        cursor: pointer;
        color: inherit;
        opacity: 0.5;
        transition: opacity 0.15s;
    }

    .close-btn:hover {
        opacity: 1;
    }

    .body {
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .field label {
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        opacity: 0.7;
    }

    .field select {
        padding: 0.55rem 0.7rem;
        font-size: 0.9rem;
        border-radius: 6px;
        border: 1px solid #d0d0d0;
        background-color: #f9f9f9;
        color: inherit;
        outline: none;
        transition: border-color 0.15s;
        cursor: pointer;
        appearance: auto;
    }

    .field select:focus {
        border-color: #5b9bd5;
    }

    :global(html.dark) .field select {
        background-color: #333;
        border-color: #555;
    }

    /* ── Theme toggle ─────────────────────────────── */

    .theme-toggle {
        display: flex;
        gap: 0;
        border-radius: 8px;
        border: 1px solid #d0d0d0;
        overflow: hidden;
    }

    :global(html.dark) .theme-toggle {
        border-color: #555;
    }

    .theme-option {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        padding: 0.5rem 0.6rem;
        font-size: 0.82rem;
        font-weight: 500;
        border: none;
        background-color: transparent;
        color: inherit;
        cursor: pointer;
        transition:
            background-color 0.15s ease,
            color 0.15s ease;
        opacity: 0.6;
    }

    .theme-option:not(:last-child) {
        border-right: 1px solid #d0d0d0;
    }

    :global(html.dark) .theme-option:not(:last-child) {
        border-right-color: #555;
    }

    .theme-option:hover {
        opacity: 1;
        background-color: rgba(128, 128, 128, 0.08);
    }

    .theme-option.active {
        opacity: 1;
        background-color: rgba(91, 155, 213, 0.12);
        color: #5b9bd5;
    }

    :global(html.dark) .theme-option:hover {
        background-color: rgba(128, 128, 128, 0.15);
    }

    :global(html.dark) .theme-option.active {
        background-color: rgba(91, 155, 213, 0.2);
    }

    .theme-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
    }

    /* ── Footer ───────────────────────────────────── */

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding-top: 0.25rem;
    }

    .btn {
        padding: 0.45rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition: background-color 0.15s ease;
    }

    .btn-cancel {
        background-color: transparent;
        color: inherit;
        opacity: 0.7;
    }

    .btn-cancel:hover {
        opacity: 1;
        background-color: rgba(128, 128, 128, 0.1);
    }
</style>

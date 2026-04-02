<script lang="ts">
    import {
        modalOpen,
        compactMode,
        loadCompactMode,
        setCompactMode,
        defaultArticleView,
        loadDefaultArticleView,
        setDefaultArticleView,
        type ArticleViewDefault,
        closeToTray,
        loadCloseToTray,
        setCloseToTray,
    } from "$lib/stores/ui";
    import {
        dbGetSetting,
        dbSetSetting,
        dbGetStats,
        dbClearCache,
        dbClearAll,
        type DbStats,
    } from "$lib/services/db";
    import { toasts } from "$lib/stores/toasts";
    import { invoke } from "@tauri-apps/api/core";
    import { tick } from "svelte";
    import { themeMode, setThemeMode, type ThemeMode } from "$lib/stores/theme";
    import {
        temperatureUnit,
        loadTemperatureUnit,
        setTemperatureUnit,
        type TemperatureUnit,
    } from "$lib/stores/weather";
    import {
        feeds,
        articles,
        selectedArticle,
        activeTag,
        activeFeedId,
        activeSubCategory,
        feedHealth,
    } from "$lib/stores/feeds";
    import {
        loadBackupConfig,
        saveBackupConfig,
        loadBackupStatus,
        runBackupNow,
        type BackupConfig,
        type BackupFrequency,
        type BackupStatus,
    } from "$lib/services/backup";
    import { open as openDialog } from "@tauri-apps/plugin-dialog";

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

    const TEMP_UNIT_OPTIONS: { label: string; value: TemperatureUnit }[] = [
        { label: "°C", value: "metric" },
        { label: "°F", value: "imperial" },
    ];

    const RETENTION_OPTIONS = [
        { label: "24 hours", value: "24" },
        { label: "48 hours", value: "48" },
        { label: "7 days", value: "168" },
        { label: "30 days", value: "720" },
        { label: "Keep forever", value: "0" },
    ];

    const DEFAULT_RETENTION = "48";

    const ARTICLE_VIEW_OPTIONS: { label: string; value: ArticleViewDefault }[] =
        [
            { label: "Reader", value: "reader" },
            { label: "Original", value: "original" },
            { label: "Browser", value: "browser" },
        ];

    let refreshInterval = $state(DEFAULT_REFRESH);
    let currentTheme = $state<ThemeMode>("system");
    let currentTempUnit = $state<TemperatureUnit>("metric");
    let retentionHours = $state(DEFAULT_RETENTION);
    let currentCompact = $state(false);
    let currentArticleView = $state<ArticleViewDefault>("reader");
    let currentCloseToTray = $state(true);
    let selectEl: HTMLSelectElement | undefined = $state();

    // Collapsible section state
    let openSections = $state<Record<string, boolean>>({
        appearance: true,
        articles: true,
        window: false,
        backup: false,
        storage: false,
    });

    function toggleSection(key: string) {
        openSections = { ...openSections, [key]: !openSections[key] };
    }

    // Startup behavior
    let startMinimized = $state(false);
    let restoreWindow = $state(true);
    let autoRefreshOnLaunch = $state(true);

    // DB stats
    let dbStats = $state<DbStats | null>(null);
    let loadingStats = $state(false);

    // Confirmation states
    let confirmClearCache = $state(false);
    let confirmClearAll = $state(false);
    let clearingCache = $state(false);
    let clearingAll = $state(false);

    // Backup config state
    let backupEnabled = $state(false);
    let backupDirectory = $state("");
    let backupTime = $state("03:00");
    let backupFrequency = $state<BackupFrequency>("daily");
    let backupStatus = $state<BackupStatus>({ lastRun: null, lastError: null });
    let backingUp = $state(false);
    let savingBackup = $state(false);

    // Keep temp unit in sync with the store
    $effect(() => {
        currentTempUnit = $temperatureUnit;
    });

    // Keep compact mode in sync with the store
    $effect(() => {
        currentCompact = $compactMode;
    });

    // Keep article view in sync with the store
    $effect(() => {
        currentArticleView = $defaultArticleView;
    });

    // Keep close-to-tray in sync with the store
    $effect(() => {
        currentCloseToTray = $closeToTray;
    });

    $effect(() => {
        if (open) {
            loadSettings();
            loadStats();
            loadBackup();
            loadTemperatureUnit();
            loadCompactMode();
            loadDefaultArticleView();
            loadCloseToTray();
            tick().then(() => selectEl?.focus());
            // Reset confirmation states when modal opens
            confirmClearCache = false;
            confirmClearAll = false;
        }
    });

    // Keep local state in sync with the store
    $effect(() => {
        currentTheme = $themeMode;
    });

    async function handleCloseToTrayToggle() {
        const newValue = !currentCloseToTray;
        currentCloseToTray = newValue;
        try {
            await setCloseToTray(newValue);
            // Sync to Rust backend immediately
            await invoke("set_close_to_tray", { enabled: newValue });
            toasts.success(
                newValue
                    ? "App will minimize to tray on close"
                    : "App will quit on close",
            );
        } catch (err) {
            console.error("Failed to update close-to-tray:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to update close-to-tray: ${msg}`);
        }
    }

    async function handleCompactToggle() {
        const newValue = !currentCompact;
        currentCompact = newValue;
        try {
            await setCompactMode(newValue);
            toasts.success(
                newValue ? "Compact mode enabled" : "Compact mode disabled",
            );
        } catch (err) {
            console.error("Failed to update compact mode:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to update compact mode: ${msg}`);
        }
    }

    async function handleTempUnitChange(unit: TemperatureUnit) {
        currentTempUnit = unit;
        try {
            await setTemperatureUnit(unit);
            toasts.success(
                unit === "metric"
                    ? "Switched to Celsius (°C)"
                    : "Switched to Fahrenheit (°F)",
            );
        } catch (err) {
            console.error("Failed to update temperature unit:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to update temperature unit: ${msg}`);
        }
    }

    async function handleArticleViewChange(mode: ArticleViewDefault) {
        currentArticleView = mode;
        try {
            await setDefaultArticleView(mode);
            const labels: Record<ArticleViewDefault, string> = {
                reader: "Reader view",
                original: "Original page",
                browser: "External browser",
            };
            toasts.success(`Default article view set to ${labels[mode]}`);
        } catch (err) {
            console.error("Failed to update default article view:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to update default article view: ${msg}`);
        }
    }

    async function handleStartMinimizedToggle() {
        startMinimized = !startMinimized;
        try {
            await dbSetSetting("start-minimized", String(startMinimized));
            toasts.success(
                startMinimized
                    ? "App will start minimized to tray"
                    : "App will start with window visible",
            );
        } catch (err) {
            console.error("Failed to update start minimized:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to update setting: ${msg}`);
        }
    }

    async function handleRestoreWindowToggle() {
        restoreWindow = !restoreWindow;
        try {
            await dbSetSetting("restore-window", String(restoreWindow));
            toasts.success(
                restoreWindow
                    ? "Window position will be restored on launch"
                    : "Window will use default position on launch",
            );
        } catch (err) {
            console.error("Failed to update restore window:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to update setting: ${msg}`);
        }
    }

    async function handleAutoRefreshToggle() {
        autoRefreshOnLaunch = !autoRefreshOnLaunch;
        try {
            await dbSetSetting(
                "auto-refresh-on-launch",
                String(autoRefreshOnLaunch),
            );
            toasts.success(
                autoRefreshOnLaunch
                    ? "Feeds will auto-refresh on launch"
                    : "Feeds will not auto-refresh on launch",
            );
        } catch (err) {
            console.error("Failed to update auto-refresh:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to update setting: ${msg}`);
        }
    }

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

        try {
            const storedRetention = await dbGetSetting(
                "article-retention-hours",
            );
            if (storedRetention !== null) {
                retentionHours = storedRetention;
            } else {
                retentionHours = DEFAULT_RETENTION;
            }
        } catch {
            retentionHours = DEFAULT_RETENTION;
        }

        // Load startup settings
        try {
            const [smRaw, rwRaw, arRaw] = await Promise.all([
                dbGetSetting("start-minimized"),
                dbGetSetting("restore-window"),
                dbGetSetting("auto-refresh-on-launch"),
            ]);
            startMinimized = smRaw === "true";
            restoreWindow = rwRaw !== "false"; // default true
            autoRefreshOnLaunch = arRaw !== "false"; // default true
        } catch {
            startMinimized = false;
            restoreWindow = true;
            autoRefreshOnLaunch = true;
        }
    }

    async function loadBackup() {
        try {
            const [config, status] = await Promise.all([
                loadBackupConfig(),
                loadBackupStatus(),
            ]);
            backupEnabled = config.enabled;
            backupDirectory = config.directory;
            backupTime = config.time;
            backupFrequency = config.frequency;
            backupStatus = status;
        } catch (err) {
            console.error("Failed to load backup config:", err);
        }
    }

    async function loadStats() {
        loadingStats = true;
        try {
            dbStats = await dbGetStats();
        } catch (err) {
            console.error("Failed to load DB stats:", err);
            dbStats = null;
        } finally {
            loadingStats = false;
        }
    }

    function formatBytes(bytes: number): string {
        if (bytes === 0) return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const value = bytes / Math.pow(1024, i);
        return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    }

    async function handleRefreshChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        const value = target.value;
        refreshInterval = value;

        try {
            await dbSetSetting("refresh-interval-secs", value);
            await invoke("set_refresh_interval", { secs: Number(value) });
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

    async function handleRetentionChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        const value = target.value;
        retentionHours = value;

        try {
            await dbSetSetting("article-retention-hours", value);
            const label =
                RETENTION_OPTIONS.find((o) => o.value === value)?.label ??
                value;
            toasts.success(`Article retention set to ${label}`);
        } catch (err) {
            console.error("Failed to update article retention:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to update article retention: ${msg}`);
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

    async function handleBackupToggle() {
        backupEnabled = !backupEnabled;
        await persistBackupConfig();
    }

    async function handlePickDirectory() {
        try {
            const selected = await openDialog({
                directory: true,
                multiple: false,
                title: "Choose backup directory",
            });
            if (selected && typeof selected === "string") {
                backupDirectory = selected;
                await persistBackupConfig();
            }
        } catch (err) {
            console.error("Failed to pick directory:", err);
        }
    }

    async function handleBackupTimeChange(e: Event) {
        const target = e.target as HTMLInputElement;
        backupTime = target.value;
        await persistBackupConfig();
    }

    async function handleBackupFrequencyChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        backupFrequency = target.value as BackupFrequency;
        await persistBackupConfig();
    }

    async function persistBackupConfig() {
        savingBackup = true;
        try {
            const config: BackupConfig = {
                enabled: backupEnabled,
                directory: backupDirectory,
                time: backupTime,
                frequency: backupFrequency,
            };
            await saveBackupConfig(config);
        } catch (err) {
            console.error("Failed to save backup config:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to save backup settings: ${msg}`);
        } finally {
            savingBackup = false;
        }
    }

    async function handleBackupNow() {
        backingUp = true;
        try {
            const success = await runBackupNow();
            if (success) {
                toasts.success("Backup completed");
            } else {
                toasts.error("Backup failed — check directory permissions");
            }
            // Refresh status
            backupStatus = await loadBackupStatus();
        } catch (err) {
            console.error("Failed to run backup:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Backup failed: ${msg}`);
        } finally {
            backingUp = false;
        }
    }

    function formatLastBackup(iso: string): string {
        try {
            const d = new Date(iso);
            const now = new Date();
            const diffMs = now.getTime() - d.getTime();
            const diffMins = Math.floor(diffMs / 60_000);
            const diffHours = Math.floor(diffMs / 3_600_000);
            const diffDays = Math.floor(diffMs / 86_400_000);

            let relative: string;
            if (diffMins < 1) relative = "just now";
            else if (diffMins < 60)
                relative = `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
            else if (diffHours < 24)
                relative = `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
            else relative = `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

            const dateStr = d.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
            });
            const timeStr = d.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
            });

            return `${dateStr} ${timeStr} (${relative})`;
        } catch {
            return iso;
        }
    }

    async function handleClearCache() {
        if (!confirmClearCache) {
            confirmClearCache = true;
            return;
        }

        clearingCache = true;
        try {
            const removed = await dbClearCache();
            // Reset in-memory article stores
            articles.set([]);
            selectedArticle.set(null);
            confirmClearCache = false;
            toasts.success(
                `Cleared ${removed} cached article${removed !== 1 ? "s" : ""}`,
            );
            await loadStats();
        } catch (err) {
            console.error("Failed to clear cache:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to clear cache: ${msg}`);
        } finally {
            clearingCache = false;
        }
    }

    async function handleClearAll() {
        if (!confirmClearAll) {
            confirmClearAll = true;
            return;
        }

        clearingAll = true;
        try {
            await dbClearAll();

            // Reset all in-memory stores
            feeds.set([]);
            articles.set([]);
            selectedArticle.set(null);
            activeTag.set("all");
            activeFeedId.set("all");
            activeSubCategory.set("all");
            feedHealth.set(new Map());

            // Clear localStorage items
            localStorage.clear();

            // Reset theme to system default
            currentTheme = "system";
            await setThemeMode("system");

            // Reset refresh interval to default
            refreshInterval = DEFAULT_REFRESH;

            confirmClearAll = false;
            toasts.success("All data cleared");
            await loadStats();
        } catch (err) {
            console.error("Failed to clear all data:", err);
            const msg =
                err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : JSON.stringify(err);
            toasts.error(`Failed to clear all data: ${msg}`);
        } finally {
            clearingAll = false;
        }
    }

    function close() {
        open = false;
        confirmClearCache = false;
        confirmClearAll = false;
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            close();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            if (confirmClearCache) {
                confirmClearCache = false;
                e.stopPropagation();
                return;
            }
            if (confirmClearAll) {
                confirmClearAll = false;
                e.stopPropagation();
                return;
            }
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
                <!-- ═══════════════════════════════════════════ -->
                <!-- SECTION: Appearance                        -->
                <!-- ═══════════════════════════════════════════ -->
                <button
                    class="section-header"
                    class:open={openSections.appearance}
                    onclick={() => toggleSection("appearance")}
                    aria-expanded={openSections.appearance}
                >
                    <span class="section-icon">
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.3"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                        >
                            <path
                                d="M8 1.5C4.4 1.5 1.5 4.4 1.5 8C1.5 11.6 4.4 14.5 8 14.5C8.7 14.5 9.2 13.9 9.2 13.3C9.2 13 9.1 12.8 8.9 12.6C8.7 12.4 8.5 12.1 8.5 11.8C8.5 11.1 9.1 10.5 9.8 10.5H11C13 10.5 14.5 9.2 14.5 7.3C14.5 4 11.5 1.5 8 1.5Z"
                            />
                            <circle
                                cx="5"
                                cy="6"
                                r="0.9"
                                fill="currentColor"
                                stroke="none"
                            />
                            <circle
                                cx="8"
                                cy="4.2"
                                r="0.9"
                                fill="currentColor"
                                stroke="none"
                            />
                            <circle
                                cx="10.8"
                                cy="6.2"
                                r="0.9"
                                fill="currentColor"
                                stroke="none"
                            />
                            <circle
                                cx="5"
                                cy="9"
                                r="0.9"
                                fill="currentColor"
                                stroke="none"
                            />
                        </svg>
                    </span>
                    <span class="section-title">Appearance</span>
                    <span class="section-chevron">
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M3 4.5L6 7.5L9 4.5"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </span>
                </button>

                {#if openSections.appearance}
                    <div class="section-body">
                        <!-- Theme -->
                        <div class="field">
                            <label for="theme-mode">Theme</label>
                            <div
                                class="theme-toggle"
                                role="radiogroup"
                                aria-label="Theme mode"
                            >
                                {#each THEME_OPTIONS as opt}
                                    <button
                                        class="theme-option"
                                        class:active={currentTheme ===
                                            opt.value}
                                        role="radio"
                                        aria-checked={currentTheme ===
                                            opt.value}
                                        onclick={() =>
                                            handleThemeChange(opt.value)}
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

                        <!-- Temperature Unit -->
                        <div class="field">
                            <label for="temp-unit">Temperature</label>
                            <div
                                class="theme-toggle"
                                role="radiogroup"
                                aria-label="Temperature unit"
                            >
                                {#each TEMP_UNIT_OPTIONS as opt}
                                    <button
                                        class="theme-option"
                                        class:active={currentTempUnit ===
                                            opt.value}
                                        role="radio"
                                        aria-checked={currentTempUnit ===
                                            opt.value}
                                        onclick={() =>
                                            handleTempUnitChange(opt.value)}
                                    >
                                        <span class="theme-icon">
                                            {#if opt.value === "metric"}
                                                <svg
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 16 16"
                                                    fill="none"
                                                    aria-hidden="true"
                                                >
                                                    <circle
                                                        cx="4.5"
                                                        cy="4"
                                                        r="1.5"
                                                        stroke="currentColor"
                                                        stroke-width="1.2"
                                                        fill="none"
                                                    />
                                                    <text
                                                        x="8"
                                                        y="12"
                                                        font-size="10"
                                                        font-weight="600"
                                                        fill="currentColor"
                                                        font-family="system-ui, sans-serif"
                                                        >C</text
                                                    >
                                                </svg>
                                            {:else}
                                                <svg
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 16 16"
                                                    fill="none"
                                                    aria-hidden="true"
                                                >
                                                    <circle
                                                        cx="4.5"
                                                        cy="4"
                                                        r="1.5"
                                                        stroke="currentColor"
                                                        stroke-width="1.2"
                                                        fill="none"
                                                    />
                                                    <text
                                                        x="8"
                                                        y="12"
                                                        font-size="10"
                                                        font-weight="600"
                                                        fill="currentColor"
                                                        font-family="system-ui, sans-serif"
                                                        >F</text
                                                    >
                                                </svg>
                                            {/if}
                                        </span>
                                        {opt.label}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <!-- Compact Mode -->
                        <div class="field">
                            <span class="field-label">Compact Mode</span>
                            <div class="toggle-row">
                                <span class="toggle-label"
                                    >Denser article list with smaller text</span
                                >
                                <button
                                    class="toggle-switch"
                                    class:active={currentCompact}
                                    role="switch"
                                    aria-checked={currentCompact}
                                    aria-label="Toggle compact mode"
                                    onclick={handleCompactToggle}
                                >
                                    <span class="toggle-knob"></span>
                                </button>
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- ═══════════════════════════════════════════ -->
                <!-- SECTION: Articles                          -->
                <!-- ═══════════════════════════════════════════ -->
                <button
                    class="section-header"
                    class:open={openSections.articles}
                    onclick={() => toggleSection("articles")}
                    aria-expanded={openSections.articles}
                >
                    <span class="section-icon">
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.3"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                        >
                            <rect
                                x="3"
                                y="1.5"
                                width="10"
                                height="13"
                                rx="1.5"
                            />
                            <line x1="5.5" y1="5" x2="10.5" y2="5" />
                            <line x1="5.5" y1="7.5" x2="10.5" y2="7.5" />
                            <line x1="5.5" y1="10" x2="8.5" y2="10" />
                        </svg>
                    </span>
                    <span class="section-title">Articles</span>
                    <span class="section-chevron">
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M3 4.5L6 7.5L9 4.5"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </span>
                </button>

                {#if openSections.articles}
                    <div class="section-body">
                        <!-- Default Article View -->
                        <div class="field">
                            <label for="article-view">Default View</label>
                            <div
                                class="theme-toggle"
                                role="radiogroup"
                                aria-label="Default article view"
                            >
                                {#each ARTICLE_VIEW_OPTIONS as opt}
                                    <button
                                        class="theme-option"
                                        class:active={currentArticleView ===
                                            opt.value}
                                        role="radio"
                                        aria-checked={currentArticleView ===
                                            opt.value}
                                        onclick={() =>
                                            handleArticleViewChange(opt.value)}
                                    >
                                        <span class="theme-icon">
                                            {#if opt.value === "reader"}
                                                <svg
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 16 16"
                                                    fill="none"
                                                    aria-hidden="true"
                                                >
                                                    <rect
                                                        x="2"
                                                        y="2"
                                                        width="12"
                                                        height="12"
                                                        rx="1.5"
                                                        stroke="currentColor"
                                                        stroke-width="1.3"
                                                        fill="none"
                                                    />
                                                    <line
                                                        x1="5"
                                                        y1="5.5"
                                                        x2="11"
                                                        y2="5.5"
                                                        stroke="currentColor"
                                                        stroke-width="1.3"
                                                        stroke-linecap="round"
                                                    />
                                                    <line
                                                        x1="5"
                                                        y1="8"
                                                        x2="11"
                                                        y2="8"
                                                        stroke="currentColor"
                                                        stroke-width="1.3"
                                                        stroke-linecap="round"
                                                    />
                                                    <line
                                                        x1="5"
                                                        y1="10.5"
                                                        x2="9"
                                                        y2="10.5"
                                                        stroke="currentColor"
                                                        stroke-width="1.3"
                                                        stroke-linecap="round"
                                                    />
                                                </svg>
                                            {:else if opt.value === "original"}
                                                <svg
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 16 16"
                                                    fill="none"
                                                    aria-hidden="true"
                                                >
                                                    <rect
                                                        x="2"
                                                        y="2"
                                                        width="12"
                                                        height="12"
                                                        rx="1.5"
                                                        stroke="currentColor"
                                                        stroke-width="1.3"
                                                        fill="none"
                                                    />
                                                    <line
                                                        x1="2"
                                                        y1="5.5"
                                                        x2="14"
                                                        y2="5.5"
                                                        stroke="currentColor"
                                                        stroke-width="1.3"
                                                    />
                                                    <circle
                                                        cx="4"
                                                        cy="3.8"
                                                        r="0.7"
                                                        fill="currentColor"
                                                    />
                                                    <circle
                                                        cx="6"
                                                        cy="3.8"
                                                        r="0.7"
                                                        fill="currentColor"
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
                                                        d="M6 3H4a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 4 13h8a1.5 1.5 0 0 0 1.5-1.5V9"
                                                        stroke="currentColor"
                                                        stroke-width="1.3"
                                                        stroke-linecap="round"
                                                        fill="none"
                                                    />
                                                    <path
                                                        d="M9 2.5h4.5V7"
                                                        stroke="currentColor"
                                                        stroke-width="1.3"
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        fill="none"
                                                    />
                                                    <line
                                                        x1="13.5"
                                                        y1="2.5"
                                                        x2="8"
                                                        y2="8"
                                                        stroke="currentColor"
                                                        stroke-width="1.3"
                                                        stroke-linecap="round"
                                                    />
                                                </svg>
                                            {/if}
                                        </span>
                                        {opt.label}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <!-- Refresh Interval -->
                        <div class="field">
                            <label for="refresh-interval"
                                >Refresh Interval</label
                            >
                            <select
                                bind:this={selectEl}
                                id="refresh-interval"
                                value={refreshInterval}
                                onchange={handleRefreshChange}
                            >
                                {#each REFRESH_OPTIONS as opt}
                                    <option value={opt.value}
                                        >{opt.label}</option
                                    >
                                {/each}
                            </select>
                        </div>

                        <!-- Article Retention -->
                        <div class="field">
                            <label for="article-retention"
                                >Retention Period</label
                            >
                            <select
                                id="article-retention"
                                value={retentionHours}
                                onchange={handleRetentionChange}
                            >
                                {#each RETENTION_OPTIONS as opt}
                                    <option value={opt.value}
                                        >{opt.label}</option
                                    >
                                {/each}
                            </select>
                        </div>
                    </div>
                {/if}

                <!-- ═══════════════════════════════════════════ -->
                <!-- SECTION: Window & Startup                  -->
                <!-- ═══════════════════════════════════════════ -->
                <button
                    class="section-header"
                    class:open={openSections.window}
                    onclick={() => toggleSection("window")}
                    aria-expanded={openSections.window}
                >
                    <span class="section-icon">
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.3"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                        >
                            <rect x="1.5" y="2" width="13" height="12" rx="2" />
                            <line x1="1.5" y1="5.5" x2="14.5" y2="5.5" />
                            <circle
                                cx="4"
                                cy="3.75"
                                r="0.7"
                                fill="currentColor"
                                stroke="none"
                            />
                            <circle
                                cx="6"
                                cy="3.75"
                                r="0.7"
                                fill="currentColor"
                                stroke="none"
                            />
                            <circle
                                cx="8"
                                cy="3.75"
                                r="0.7"
                                fill="currentColor"
                                stroke="none"
                            />
                        </svg>
                    </span>
                    <span class="section-title">Window & Startup</span>
                    <span class="section-chevron">
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M3 4.5L6 7.5L9 4.5"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </span>
                </button>

                {#if openSections.window}
                    <div class="section-body">
                        <!-- Close to Tray -->
                        <div class="field">
                            <span class="field-label">Close to Tray</span>
                            <div class="toggle-row">
                                <span class="toggle-label"
                                    >Minimize to system tray instead of quitting</span
                                >
                                <button
                                    class="toggle-switch"
                                    class:active={currentCloseToTray}
                                    role="switch"
                                    aria-checked={currentCloseToTray}
                                    aria-label="Toggle close to tray"
                                    onclick={handleCloseToTrayToggle}
                                >
                                    <span class="toggle-knob"></span>
                                </button>
                            </div>
                        </div>

                        <!-- Start Minimized -->
                        <div class="field">
                            <div class="toggle-row">
                                <span class="toggle-label"
                                    >Start minimized to tray</span
                                >
                                <button
                                    class="toggle-switch"
                                    class:active={startMinimized}
                                    role="switch"
                                    aria-checked={startMinimized}
                                    aria-label="Toggle start minimized"
                                    onclick={handleStartMinimizedToggle}
                                >
                                    <span class="toggle-knob"></span>
                                </button>
                            </div>
                        </div>

                        <!-- Restore Window -->
                        <div class="field">
                            <div class="toggle-row">
                                <span class="toggle-label"
                                    >Restore last window size and position</span
                                >
                                <button
                                    class="toggle-switch"
                                    class:active={restoreWindow}
                                    role="switch"
                                    aria-checked={restoreWindow}
                                    aria-label="Toggle restore window position"
                                    onclick={handleRestoreWindowToggle}
                                >
                                    <span class="toggle-knob"></span>
                                </button>
                            </div>
                        </div>

                        <!-- Auto-refresh on launch -->
                        <div class="field">
                            <div class="toggle-row">
                                <span class="toggle-label"
                                    >Auto-refresh feeds on launch</span
                                >
                                <button
                                    class="toggle-switch"
                                    class:active={autoRefreshOnLaunch}
                                    role="switch"
                                    aria-checked={autoRefreshOnLaunch}
                                    aria-label="Toggle auto-refresh on launch"
                                    onclick={handleAutoRefreshToggle}
                                >
                                    <span class="toggle-knob"></span>
                                </button>
                            </div>
                        </div>
                    </div>
                {/if}

                <!-- ═══════════════════════════════════════════ -->
                <!-- SECTION: Backup                            -->
                <!-- ═══════════════════════════════════════════ -->
                <button
                    class="section-header"
                    class:open={openSections.backup}
                    onclick={() => toggleSection("backup")}
                    aria-expanded={openSections.backup}
                >
                    <span class="section-icon">
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.3"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                        >
                            <path
                                d="M4 10.5C2.2 10.5 1 9.3 1 7.7C1 6.2 2 5 3.5 4.7C4.1 3 5.8 1.5 8 1.5C10.2 1.5 11.9 3 12.5 4.7C13.9 5 15 6.2 15 7.7C15 9.3 13.7 10.5 12 10.5"
                            />
                            <line x1="8" y1="7.5" x2="8" y2="14" />
                            <polyline points="5.5 11.5 8 14 10.5 11.5" />
                        </svg>
                    </span>
                    <span class="section-title">Backup</span>
                    <span class="section-chevron">
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M3 4.5L6 7.5L9 4.5"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </span>
                </button>

                {#if openSections.backup}
                    <div class="section-body">
                        <div class="field">
                            <span class="field-label">Automatic Backup</span>
                            <p class="field-description">
                                Automatically export your feeds as OPML to a
                                local directory on a schedule.
                            </p>

                            <div class="toggle-row">
                                <span class="toggle-label"
                                    >Enable automatic backup</span
                                >
                                <button
                                    class="toggle-switch"
                                    class:active={backupEnabled}
                                    role="switch"
                                    aria-checked={backupEnabled}
                                    aria-label="Enable automatic backup"
                                    onclick={handleBackupToggle}
                                >
                                    <span class="toggle-knob"></span>
                                </button>
                            </div>

                            {#if backupEnabled}
                                <div class="backup-fields">
                                    <div class="backup-field">
                                        <span class="backup-field-label"
                                            >Frequency</span
                                        >
                                        <select
                                            class="backup-frequency-select"
                                            value={backupFrequency}
                                            onchange={handleBackupFrequencyChange}
                                        >
                                            <option value="daily">Daily</option>
                                            <option value="weekly"
                                                >Weekly</option
                                            >
                                            <option value="monthly"
                                                >Monthly</option
                                            >
                                        </select>
                                    </div>

                                    <div class="backup-field">
                                        <span class="backup-field-label"
                                            >Directory</span
                                        >
                                        <div class="backup-path-row">
                                            <button
                                                class="btn btn-outline backup-browse-btn"
                                                onclick={handlePickDirectory}
                                            >
                                                {backupDirectory
                                                    ? "Change…"
                                                    : "Choose folder…"}
                                            </button>
                                            {#if backupDirectory}
                                                <span
                                                    class="backup-path"
                                                    title={backupDirectory}
                                                >
                                                    {backupDirectory}
                                                </span>
                                            {:else}
                                                <span class="backup-path muted"
                                                    >No directory selected</span
                                                >
                                            {/if}
                                        </div>
                                    </div>

                                    <div class="backup-field">
                                        <span class="backup-field-label"
                                            >Time</span
                                        >
                                        <input
                                            type="time"
                                            class="backup-time-input"
                                            value={backupTime}
                                            onchange={handleBackupTimeChange}
                                        />
                                    </div>

                                    <div class="backup-field">
                                        <span class="backup-field-label"
                                            >Status</span
                                        >
                                        {#if backupStatus.lastRun}
                                            <span class="backup-status">
                                                Last backup: {formatLastBackup(
                                                    backupStatus.lastRun,
                                                )}
                                            </span>
                                        {:else}
                                            <span class="backup-status muted"
                                                >No backup yet</span
                                            >
                                        {/if}
                                        {#if backupStatus.lastError}
                                            <span class="backup-status error">
                                                Last error: {backupStatus.lastError}
                                            </span>
                                        {/if}
                                    </div>

                                    <button
                                        class="btn btn-outline"
                                        onclick={handleBackupNow}
                                        disabled={backingUp || !backupDirectory}
                                    >
                                        {backingUp
                                            ? "Backing up…"
                                            : "Back up now"}
                                    </button>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}

                <!-- ═══════════════════════════════════════════ -->
                <!-- SECTION: Storage                           -->
                <!-- ═══════════════════════════════════════════ -->
                <button
                    class="section-header"
                    class:open={openSections.storage}
                    onclick={() => toggleSection("storage")}
                    aria-expanded={openSections.storage}
                >
                    <span class="section-icon">
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.3"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                        >
                            <ellipse cx="8" cy="3.5" rx="5.5" ry="2" />
                            <path
                                d="M2.5 3.5V12.5C2.5 13.6 4.9 14.5 8 14.5C11.1 14.5 13.5 13.6 13.5 12.5V3.5"
                            />
                            <path
                                d="M2.5 8C2.5 9.1 4.9 10 8 10C11.1 10 13.5 9.1 13.5 8"
                            />
                        </svg>
                    </span>
                    <span class="section-title">Storage</span>
                    <span class="section-chevron">
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M3 4.5L6 7.5L9 4.5"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    </span>
                </button>

                {#if openSections.storage}
                    <div class="section-body">
                        <!-- Cache -->
                        <div class="field">
                            <span class="field-label">Cache</span>
                            <div class="stats-row">
                                {#if loadingStats}
                                    <span class="stats-text muted"
                                        >Loading…</span
                                    >
                                {:else if dbStats}
                                    <span class="stats-text">
                                        <strong
                                            >{formatBytes(
                                                dbStats.totalBytes,
                                            )}</strong
                                        >
                                        on disk
                                        <span class="stats-sep">&middot;</span>
                                        {dbStats.articleCount} article{dbStats.articleCount !==
                                        1
                                            ? "s"
                                            : ""}
                                        <span class="stats-sep">&middot;</span>
                                        {dbStats.feedCount} feed{dbStats.feedCount !==
                                        1
                                            ? "s"
                                            : ""}
                                    </span>
                                {:else}
                                    <span class="stats-text muted"
                                        >Unable to load stats</span
                                    >
                                {/if}
                            </div>

                            {#if confirmClearCache}
                                <div class="confirm-bar">
                                    <span class="confirm-text"
                                        >Delete all cached articles?</span
                                    >
                                    <div class="confirm-actions">
                                        <button
                                            class="btn btn-small btn-cancel"
                                            onclick={() =>
                                                (confirmClearCache = false)}
                                            disabled={clearingCache}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            class="btn btn-small btn-danger"
                                            onclick={handleClearCache}
                                            disabled={clearingCache}
                                        >
                                            {clearingCache
                                                ? "Clearing…"
                                                : "Confirm"}
                                        </button>
                                    </div>
                                </div>
                            {:else}
                                <button
                                    class="btn btn-outline"
                                    onclick={handleClearCache}
                                    disabled={dbStats?.articleCount === 0}
                                >
                                    Clear cache
                                </button>
                            {/if}
                        </div>

                        <hr class="divider" />

                        <!-- Reset -->
                        <div class="field">
                            <span class="field-label">Reset</span>
                            <p class="field-description">
                                Remove all feeds, articles, settings, and local
                                preferences. This cannot be undone.
                            </p>

                            {#if confirmClearAll}
                                <div class="confirm-bar danger">
                                    <span class="confirm-text"
                                        >Erase everything and reset the app?</span
                                    >
                                    <div class="confirm-actions">
                                        <button
                                            class="btn btn-small btn-cancel"
                                            onclick={() =>
                                                (confirmClearAll = false)}
                                            disabled={clearingAll}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            class="btn btn-small btn-danger"
                                            onclick={handleClearAll}
                                            disabled={clearingAll}
                                        >
                                            {clearingAll
                                                ? "Erasing…"
                                                : "Erase everything"}
                                        </button>
                                    </div>
                                </div>
                            {:else}
                                <button
                                    class="btn btn-outline btn-outline-danger"
                                    onclick={handleClearAll}
                                >
                                    Clear all data
                                </button>
                            {/if}
                        </div>
                    </div>
                {/if}

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
        max-height: 85vh;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
        overflow: hidden;
        display: flex;
        flex-direction: column;
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
        flex-shrink: 0;
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
        padding: 0.5rem 1.25rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0;
        overflow-y: auto;
    }

    /* ── Section accordion ────────────────────────── */

    .section-header {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        width: 100%;
        padding: 0.65rem 0.1rem;
        border: none;
        border-bottom: 1px solid #eaeaea;
        background: none;
        color: inherit;
        cursor: pointer;
        transition: background-color 0.15s ease;
        user-select: none;
        border-radius: 0;
    }

    .section-header:hover {
        background-color: rgba(128, 128, 128, 0.06);
    }

    :global(html.dark) .section-header {
        border-bottom-color: #3a3a3a;
    }

    :global(html.dark) .section-header:hover {
        background-color: rgba(128, 128, 128, 0.1);
    }

    .section-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        opacity: 0.5;
        flex-shrink: 0;
    }

    .section-title {
        font-size: 0.88rem;
        font-weight: 600;
        flex: 1;
        text-align: left;
    }

    .section-chevron {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        opacity: 0.35;
        transition: transform 0.2s ease;
        flex-shrink: 0;
    }

    .section-header.open .section-chevron {
        transform: rotate(180deg);
    }

    .section-body {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 0.75rem 0.1rem 0.85rem 0.35rem;
        border-bottom: 1px solid #eaeaea;
    }

    :global(html.dark) .section-body {
        border-bottom-color: #3a3a3a;
    }

    /* ── Fields ────────────────────────────────────── */

    .field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .field label,
    .field-label {
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

    .field-description {
        font-size: 0.8rem;
        line-height: 1.4;
        opacity: 0.6;
        margin: 0;
    }

    /* ── Divider ──────────────────────────────────── */

    .divider {
        border: none;
        border-top: 1px solid #e0e0e0;
        margin: 0.25rem 0;
    }

    :global(html.dark) .divider {
        border-top-color: #3a3a3a;
    }

    /* ── Theme toggle (radio group) ───────────────── */

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

    /* ── Toggle rows ──────────────────────────────── */

    .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
    }

    .toggle-label {
        font-size: 0.85rem;
    }

    .toggle-switch {
        position: relative;
        width: 40px;
        height: 22px;
        border-radius: 11px;
        border: none;
        background-color: #ccc;
        cursor: pointer;
        transition: background-color 0.2s ease;
        flex-shrink: 0;
        padding: 0;
    }

    .toggle-switch.active {
        background-color: #5b9bd5;
    }

    :global(html.dark) .toggle-switch {
        background-color: #555;
    }

    :global(html.dark) .toggle-switch.active {
        background-color: #5b9bd5;
    }

    .toggle-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background-color: #fff;
        transition: transform 0.2s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .toggle-switch.active .toggle-knob {
        transform: translateX(18px);
    }

    /* ── Backup section ───────────────────────────── */

    .backup-fields {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        margin-top: 0.15rem;
    }

    .backup-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .backup-field-label {
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        opacity: 0.5;
    }

    .backup-path-row {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        min-width: 0;
    }

    .backup-browse-btn {
        flex-shrink: 0;
        padding: 0.35rem 0.7rem;
        font-size: 0.8rem;
    }

    .backup-path {
        font-size: 0.8rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
        direction: rtl;
        text-align: left;
        opacity: 0.7;
    }

    .backup-path.muted {
        opacity: 0.45;
        direction: ltr;
    }

    .backup-frequency-select {
        padding: 0.4rem 0.6rem;
        font-size: 0.85rem;
        border-radius: 6px;
        border: 1px solid #d0d0d0;
        background-color: #f9f9f9;
        color: inherit;
        outline: none;
        transition: border-color 0.15s;
        cursor: pointer;
        appearance: auto;
        width: 140px;
    }

    .backup-frequency-select:focus {
        border-color: #5b9bd5;
    }

    :global(html.dark) .backup-frequency-select {
        background-color: #333;
        border-color: #555;
    }

    .backup-time-input {
        padding: 0.4rem 0.6rem;
        font-size: 0.85rem;
        border-radius: 6px;
        border: 1px solid #d0d0d0;
        background-color: #f9f9f9;
        color: inherit;
        outline: none;
        transition: border-color 0.15s;
        width: 120px;
    }

    .backup-time-input:focus {
        border-color: #5b9bd5;
    }

    :global(html.dark) .backup-time-input {
        background-color: #333;
        border-color: #555;
        color-scheme: dark;
    }

    .backup-status {
        font-size: 0.8rem;
        line-height: 1.4;
    }

    .backup-status.muted {
        opacity: 0.45;
    }

    .backup-status.error {
        color: #c0392b;
        font-size: 0.78rem;
    }

    :global(html.dark) .backup-status.error {
        color: #e8756f;
    }

    /* ── Stats row ────────────────────────────────── */

    .stats-row {
        display: flex;
        align-items: center;
        min-height: 1.6rem;
    }

    .stats-text {
        font-size: 0.82rem;
        line-height: 1.4;
    }

    .stats-text.muted {
        opacity: 0.5;
    }

    .stats-text strong {
        font-weight: 600;
    }

    .stats-sep {
        margin: 0 0.3rem;
        opacity: 0.35;
    }

    /* ── Confirmation bar ─────────────────────────── */

    .confirm-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.6rem 0.75rem;
        border-radius: 8px;
        background-color: rgba(91, 155, 213, 0.08);
        border: 1px solid rgba(91, 155, 213, 0.2);
    }

    .confirm-bar.danger {
        background-color: rgba(217, 83, 79, 0.08);
        border-color: rgba(217, 83, 79, 0.25);
    }

    :global(html.dark) .confirm-bar {
        background-color: rgba(91, 155, 213, 0.1);
        border-color: rgba(91, 155, 213, 0.25);
    }

    :global(html.dark) .confirm-bar.danger {
        background-color: rgba(217, 83, 79, 0.12);
        border-color: rgba(217, 83, 79, 0.3);
    }

    .confirm-text {
        font-size: 0.82rem;
        font-weight: 500;
    }

    .confirm-actions {
        display: flex;
        gap: 0.4rem;
        flex-shrink: 0;
    }

    /* ── Buttons ──────────────────────────────────── */

    .btn {
        padding: 0.45rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition:
            background-color 0.15s ease,
            opacity 0.15s ease;
    }

    .btn:disabled {
        opacity: 0.45;
        cursor: default;
    }

    .btn-small {
        padding: 0.3rem 0.7rem;
        font-size: 0.78rem;
    }

    .btn-cancel {
        background-color: transparent;
        color: inherit;
        opacity: 0.7;
    }

    .btn-cancel:hover:not(:disabled) {
        opacity: 1;
        background-color: rgba(128, 128, 128, 0.1);
    }

    .btn-outline {
        background-color: transparent;
        border: 1px solid #d0d0d0;
        color: inherit;
        transition:
            background-color 0.15s ease,
            border-color 0.15s ease;
    }

    .btn-outline:hover:not(:disabled) {
        background-color: rgba(128, 128, 128, 0.08);
        border-color: #bbb;
    }

    :global(html.dark) .btn-outline {
        border-color: #555;
    }

    :global(html.dark) .btn-outline:hover:not(:disabled) {
        background-color: rgba(128, 128, 128, 0.15);
        border-color: #777;
    }

    .btn-outline-danger {
        color: #c0392b;
        border-color: rgba(217, 83, 79, 0.4);
    }

    .btn-outline-danger:hover:not(:disabled) {
        background-color: rgba(217, 83, 79, 0.06);
        border-color: rgba(217, 83, 79, 0.6);
    }

    :global(html.dark) .btn-outline-danger {
        color: #e8756f;
        border-color: rgba(217, 83, 79, 0.35);
    }

    :global(html.dark) .btn-outline-danger:hover:not(:disabled) {
        background-color: rgba(217, 83, 79, 0.12);
        border-color: rgba(217, 83, 79, 0.55);
    }

    .btn-danger {
        background-color: #d9534f;
        color: #fff;
    }

    .btn-danger:hover:not(:disabled) {
        background-color: #c9302c;
    }

    /* ── Footer ───────────────────────────────────── */

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding-top: 0.25rem;
    }
</style>

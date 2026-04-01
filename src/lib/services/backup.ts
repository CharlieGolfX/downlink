import { get } from "svelte/store";
import { feeds } from "$lib/stores/feeds";
import { dbGetSetting, dbSetSetting } from "$lib/services/db";
import { generateOpml } from "$lib/utils/opml";
import { invoke } from "@tauri-apps/api/core";
import { toasts } from "$lib/stores/toasts";

// ── Types ────────────────────────────────────────────────────────────

export type BackupFrequency = "daily" | "weekly" | "monthly";

export interface BackupConfig {
  enabled: boolean;
  /** Directory path where backup files are written. */
  directory: string;
  /** Time of day to run the backup, in "HH:MM" 24-hour format. */
  time: string;
  /** How often to run the backup. */
  frequency: BackupFrequency;
}

export interface BackupStatus {
  /** ISO timestamp of the last successful backup, or null if never. */
  lastRun: string | null;
  /** Error message from the last failed attempt, or null. */
  lastError: string | null;
}

// ── DB keys ──────────────────────────────────────────────────────────

const KEY_ENABLED = "backup-enabled";
const KEY_DIRECTORY = "backup-directory";
const KEY_TIME = "backup-time";
const KEY_FREQUENCY = "backup-frequency";
const KEY_LAST_RUN = "backup-last-run";
const KEY_LAST_ERROR = "backup-last-error";

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_TIME = "03:00";
const DEFAULT_FREQUENCY: BackupFrequency = "daily";
const CHECK_INTERVAL_MS = 60_000; // check every 60 seconds

// ── State ────────────────────────────────────────────────────────────

let timerHandle: ReturnType<typeof setInterval> | null = null;
let running = false;

// ── Public API ───────────────────────────────────────────────────────

/**
 * Loads the backup configuration from the database.
 */
export async function loadBackupConfig(): Promise<BackupConfig> {
  const [enabled, directory, time, frequency] = await Promise.all([
    dbGetSetting(KEY_ENABLED),
    dbGetSetting(KEY_DIRECTORY),
    dbGetSetting(KEY_TIME),
    dbGetSetting(KEY_FREQUENCY),
  ]);

  return {
    enabled: enabled === "true",
    directory: directory ?? "",
    time: time ?? DEFAULT_TIME,
    frequency: isValidFrequency(frequency) ? frequency : DEFAULT_FREQUENCY,
  };
}

/**
 * Persists the backup configuration to the database and (re)starts or
 * stops the scheduler accordingly.
 */
export async function saveBackupConfig(config: BackupConfig): Promise<void> {
  await Promise.all([
    dbSetSetting(KEY_ENABLED, config.enabled ? "true" : "false"),
    dbSetSetting(KEY_DIRECTORY, config.directory),
    dbSetSetting(KEY_TIME, config.time),
    dbSetSetting(KEY_FREQUENCY, config.frequency),
  ]);

  // Restart the scheduler so it picks up the new config immediately
  if (config.enabled && config.directory) {
    startBackupScheduler();
  } else {
    stopBackupScheduler();
  }
}

/**
 * Loads the status of the last backup attempt.
 */
export async function loadBackupStatus(): Promise<BackupStatus> {
  const [lastRun, lastError] = await Promise.all([
    dbGetSetting(KEY_LAST_RUN),
    dbGetSetting(KEY_LAST_ERROR),
  ]);

  return {
    lastRun: lastRun ?? null,
    lastError: lastError ?? null,
  };
}

/**
 * Runs the OPML backup immediately, writing to the configured directory.
 * Updates the last-run / last-error status in the database.
 * Returns `true` on success.
 */
export async function runBackupNow(): Promise<boolean> {
  if (running) return false;
  running = true;

  try {
    const config = await loadBackupConfig();
    if (!config.directory) {
      throw new Error("No backup directory configured");
    }

    const allFeeds = get(feeds);
    if (allFeeds.length === 0) {
      // Nothing to back up — still count as success so we don't retry
      await dbSetSetting(KEY_LAST_RUN, new Date().toISOString());
      await dbSetSetting(KEY_LAST_ERROR, "");
      return true;
    }

    const opml = generateOpml(allFeeds);

    // Build a dated filename: downlink-backup-2024-01-15.opml
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const filename = `downlink-backup-${yyyy}-${mm}-${dd}.opml`;

    // Normalise directory separator and build full path
    const dir = config.directory.replace(/[/\\]+$/, "");
    const sep = dir.includes("\\") ? "\\" : "/";
    const fullPath = `${dir}${sep}${filename}`;

    await invoke("write_text_file", { path: fullPath, contents: opml });

    const now = new Date().toISOString();
    await dbSetSetting(KEY_LAST_RUN, now);
    await dbSetSetting(KEY_LAST_ERROR, "");

    console.log(`[backup] OPML backup written to ${fullPath}`);
    return true;
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : JSON.stringify(err);
    console.error("[backup] Backup failed:", msg);

    try {
      await dbSetSetting(KEY_LAST_ERROR, msg);
    } catch {
      // best-effort
    }
    return false;
  } finally {
    running = false;
  }
}

// ── Scheduler ────────────────────────────────────────────────────────

/**
 * Starts the background scheduler that checks once per minute whether
 * it's time to run the automatic backup.
 *
 * Safe to call multiple times — it will stop any existing timer first.
 */
export async function startBackupScheduler(): Promise<void> {
  stopBackupScheduler();

  const config = await loadBackupConfig();
  if (!config.enabled || !config.directory) return;

  // Do an immediate check in case the scheduled time already passed
  // while the app was closed.
  checkAndRun();

  timerHandle = setInterval(checkAndRun, CHECK_INTERVAL_MS);
}

/**
 * Stops the background scheduler.
 */
export function stopBackupScheduler(): void {
  if (timerHandle !== null) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

// ── Internals ────────────────────────────────────────────────────────

function isValidFrequency(value: string | null): value is BackupFrequency {
  return value === "daily" || value === "weekly" || value === "monthly";
}

/**
 * Returns today's date as a "YYYY-MM-DD" string in local time.
 */
function todayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Determines whether enough time has elapsed since the last successful
 * backup, based on the configured frequency.
 *
 * - **daily**:   the last backup was not today.
 * - **weekly**:  at least 7 days have passed since the last backup.
 * - **monthly**: at least 30 days have passed since the last backup.
 *
 * Returns `true` when a new backup is due.
 */
function isBackupDue(
  lastRunIso: string | null,
  frequency: BackupFrequency,
): boolean {
  if (!lastRunIso) return true; // never backed up → always due

  const lastRunDate = new Date(lastRunIso);
  const now = new Date();

  // Zero-out the time component so we compare calendar days only
  const lastDay = new Date(
    lastRunDate.getFullYear(),
    lastRunDate.getMonth(),
    lastRunDate.getDate(),
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffMs = today.getTime() - lastDay.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  switch (frequency) {
    case "daily":
      return diffDays >= 1;
    case "weekly":
      return diffDays >= 7;
    case "monthly":
      return diffDays >= 30;
    default:
      return diffDays >= 1;
  }
}

/**
 * Checks whether the scheduled backup time has been reached and, if so,
 * whether a backup is due according to the configured frequency. Runs
 * the backup if needed.
 */
async function checkAndRun(): Promise<void> {
  if (running) return;

  try {
    const config = await loadBackupConfig();
    if (!config.enabled || !config.directory) return;

    const now = new Date();
    const [targetHour, targetMinute] = config.time.split(":").map(Number);

    // Has the target time passed today?
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = targetHour * 60 + targetMinute;
    if (currentMinutes < targetMinutes) return;

    // Is a backup due based on the frequency?
    const status = await loadBackupStatus();
    if (!isBackupDue(status.lastRun, config.frequency)) return;

    // Extra guard: even when due, don't run more than once today.
    // This prevents repeated runs within the same day if, for example,
    // the frequency is "weekly" and the time window stays open.
    if (status.lastRun) {
      const lastRunDate = status.lastRun.slice(0, 10); // "YYYY-MM-DD"
      if (lastRunDate === todayDateString()) return;
    }

    // Time to back up
    const success = await runBackupNow();
    if (success) {
      toasts.success("Automatic backup completed");
    } else {
      toasts.error("Automatic backup failed — check settings");
    }
  } catch (err) {
    console.error("[backup] Scheduler tick error:", err);
  }
}

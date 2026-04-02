import { writable } from "svelte/store";
import { dbGetSetting, dbSetSetting } from "$lib/services/db";

export interface WeatherLocation {
  name: string;
  lat: number;
  lon: number;
}

const STORAGE_KEY = "weatherLocation";

const DEFAULT_LOCATION: WeatherLocation = {
  name: "Oslo",
  lat: 59.9139,
  lon: 10.7522,
};

function loadLocation(): WeatherLocation {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        typeof parsed.name === "string" &&
        typeof parsed.lat === "number" &&
        typeof parsed.lon === "number"
      ) {
        return parsed;
      }
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_LOCATION;
}

function createWeatherLocationStore() {
  const { subscribe, set, update } = writable<WeatherLocation>(loadLocation());

  return {
    subscribe,
    set: (loc: WeatherLocation) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
      set(loc);
    },
    update: (fn: (loc: WeatherLocation) => WeatherLocation) => {
      update((current) => {
        const next = fn(current);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
  };
}

export const weatherLocation = createWeatherLocationStore();

// ── Favorite locations ──────────────────────────────────────────────

const FAVORITES_KEY = "weatherFavorites";

function loadFavorites(): WeatherLocation[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (loc: unknown): loc is WeatherLocation =>
            typeof loc === "object" &&
            loc !== null &&
            typeof (loc as WeatherLocation).name === "string" &&
            typeof (loc as WeatherLocation).lat === "number" &&
            typeof (loc as WeatherLocation).lon === "number",
        );
      }
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function persistFavorites(favs: WeatherLocation[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function createFavoriteLocationsStore() {
  const { subscribe, set, update } =
    writable<WeatherLocation[]>(loadFavorites());

  return {
    subscribe,

    add(loc: WeatherLocation) {
      update((favs) => {
        // Don't add duplicates (match by lat+lon rounded to 4 decimals)
        const exists = favs.some(
          (f) =>
            f.lat.toFixed(4) === loc.lat.toFixed(4) &&
            f.lon.toFixed(4) === loc.lon.toFixed(4),
        );
        if (exists) return favs;
        const next = [...favs, loc];
        persistFavorites(next);
        return next;
      });
    },

    remove(loc: WeatherLocation) {
      update((favs) => {
        const next = favs.filter(
          (f) =>
            !(
              f.lat.toFixed(4) === loc.lat.toFixed(4) &&
              f.lon.toFixed(4) === loc.lon.toFixed(4)
            ),
        );
        persistFavorites(next);
        return next;
      });
    },

    has(loc: WeatherLocation): boolean {
      let found = false;
      // Peek at current value via a one-shot subscribe
      const unsub = subscribe((favs) => {
        found = favs.some(
          (f) =>
            f.lat.toFixed(4) === loc.lat.toFixed(4) &&
            f.lon.toFixed(4) === loc.lon.toFixed(4),
        );
      });
      unsub();
      return found;
    },
  };
}

export const favoriteLocations = createFavoriteLocationsStore();

// ── Temperature unit ────────────────────────────────────────────────

export type TemperatureUnit = "metric" | "imperial";

const TEMP_UNIT_KEY = "temperature-unit";

export const temperatureUnit = writable<TemperatureUnit>("metric");

export async function loadTemperatureUnit(): Promise<void> {
  const stored = await dbGetSetting(TEMP_UNIT_KEY);
  if (stored === "metric" || stored === "imperial") {
    temperatureUnit.set(stored);
  }
}

export async function setTemperatureUnit(unit: TemperatureUnit): Promise<void> {
  await dbSetSetting(TEMP_UNIT_KEY, unit);
  temperatureUnit.set(unit);
}

export function convertTemp(celsius: number, unit: TemperatureUnit): number {
  if (unit === "imperial") {
    return Math.round((celsius * 9) / 5 + 32);
  }
  return celsius;
}

export function tempUnitSymbol(unit: TemperatureUnit): string {
  return unit === "imperial" ? "°F" : "°C";
}

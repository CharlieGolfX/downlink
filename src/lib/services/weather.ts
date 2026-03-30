import { invoke } from "@tauri-apps/api/core";

export interface GeoResult {
  /** Display label, e.g. "Oslo, Norway" */
  displayName: string;
  /** Short name (city/town/village) */
  name: string;
  /** Country name */
  country: string;
  /** State / region (may be empty) */
  state: string;
  lat: number;
  lon: number;
}

/**
 * Searches for locations matching the given query string.
 * Uses Nominatim via the Rust backend to avoid CORS / User-Agent issues.
 */
export async function searchLocations(query: string): Promise<GeoResult[]> {
  const results: {
    display_name: string;
    lat: string;
    lon: string;
    name: string | null;
    country: string | null;
    state: string | null;
  }[] = await invoke("geocode_location", { query });

  return results.map((r) => ({
    displayName: r.display_name,
    name: r.name ?? r.display_name.split(",")[0]?.trim() ?? query,
    country: r.country ?? "",
    state: r.state ?? "",
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
  }));
}

export interface DayForecast {
  /** Date string YYYY-MM-DD */
  date: string;
  /** Human label: "Today", "Tomorrow", or weekday name */
  label: string;
  /** MET symbol_code for the day, e.g. "cloudy", "clearsky_day" */
  symbolCode: string;
  /** High temperature in °C, rounded to nearest integer */
  tempHigh: number;
  /** Low temperature in °C, rounded to nearest integer */
  tempLow: number;
}

/**
 * Weather icon URL from the MET Norway weathericons GitHub repo.
 */
export function weatherIconUrl(symbolCode: string): string {
  return `https://raw.githubusercontent.com/metno/weathericons/main/weather/svg/${symbolCode}.svg`;
}

/**
 * Fetches a 3-day forecast for the given coordinates.
 * Uses the Tauri `fetch_weather` command which calls the MET Norway API
 * with a proper User-Agent header.
 */
export async function fetchForecast(
  lat: number,
  lon: number,
): Promise<DayForecast[]> {
  const raw: string = await invoke("fetch_weather", { lat, lon });
  const data = JSON.parse(raw);

  const timeseries: any[] = data?.properties?.timeseries ?? [];
  if (timeseries.length === 0) return [];

  // Group timeseries entries by local date
  const dayMap = new Map<
    string,
    { temps: number[]; symbols: { time: string; code: string }[] }
  >();

  for (const entry of timeseries) {
    const dt = new Date(entry.time);
    const dateStr = localDateString(dt);
    if (!dayMap.has(dateStr)) {
      dayMap.set(dateStr, { temps: [], symbols: [] });
    }
    const day = dayMap.get(dateStr)!;

    // Collect instant temperature
    const temp = entry.data?.instant?.details?.air_temperature;
    if (typeof temp === "number") {
      day.temps.push(temp);
    }

    // Collect min/max from next_6_hours if available
    const next6 = entry.data?.next_6_hours?.details;
    if (next6) {
      if (typeof next6.air_temperature_max === "number")
        day.temps.push(next6.air_temperature_max);
      if (typeof next6.air_temperature_min === "number")
        day.temps.push(next6.air_temperature_min);
    }

    // Collect symbol codes with their time for picking the best one
    const sym6 = entry.data?.next_6_hours?.summary?.symbol_code;
    const sym12 = entry.data?.next_12_hours?.summary?.symbol_code;
    const sym1 = entry.data?.next_1_hours?.summary?.symbol_code;

    const code = sym6 ?? sym12 ?? sym1;
    if (code) {
      day.symbols.push({ time: entry.time, code });
    }
  }

  // Build forecast for today + next 2 days (3 total)
  const today = localDateString(new Date());
  const dates = Array.from(dayMap.keys()).sort();
  const targetDates = dates.filter((d) => d >= today).slice(0, 3);

  const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  return targetDates.map((dateStr, i) => {
    const info = dayMap.get(dateStr)!;

    // Pick the best symbol: prefer the one closest to 12:00 local time
    let bestSymbol = info.symbols[0]?.code ?? "cloudy";
    let bestDist = Infinity;
    for (const s of info.symbols) {
      const hour = new Date(s.time).getHours();
      const dist = Math.abs(hour - 12);
      if (dist < bestDist) {
        bestDist = dist;
        bestSymbol = s.code;
      }
    }

    const tempHigh = Math.round(Math.max(...info.temps));
    const tempLow = Math.round(Math.min(...info.temps));

    let label: string;
    if (i === 0) {
      label = "Today";
    } else if (i === 1) {
      label = "Tomorrow";
    } else {
      const d = new Date(dateStr + "T12:00:00");
      label = WEEKDAYS[d.getDay()];
    }

    return {
      date: dateStr,
      label,
      symbolCode: bestSymbol,
      tempHigh,
      tempLow,
    };
  });
}

/** Returns YYYY-MM-DD string in the user's local timezone. */
function localDateString(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

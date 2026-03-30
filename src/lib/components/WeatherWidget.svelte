<script lang="ts">
    import { onMount } from "svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import {
        weatherLocation,
        favoriteLocations,
        type WeatherLocation,
    } from "$lib/stores/weather";
    import { refreshSignal, lastUpdated, markUpdated } from "$lib/stores/ui";
    import {
        fetchForecast,
        weatherIconUrl,
        searchLocations,
        type DayForecast,
        type GeoResult,
    } from "$lib/services/weather";

    let forecast = $state<DayForecast[]>([]);
    let loading = $state(false);
    let error = $state<string | null>(null);
    let editing = $state(false);

    let searchQuery = $state("");
    let searchResults = $state<GeoResult[]>([]);
    let searching = $state(false);
    let searchError = $state<string | null>(null);
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;
    let searchInputEl: HTMLInputElement | undefined = $state();

    let lastFetchKey = $state("");

    function formatUpdatedTime(date: Date | null): string {
        if (!date) return "";
        const h = date.getHours().toString().padStart(2, "0");
        const m = date.getMinutes().toString().padStart(2, "0");
        return `${h}:${m}`;
    }

    let updatedLabel = $derived(formatUpdatedTime($lastUpdated));

    function isFavorited(loc: WeatherLocation): boolean {
        return $favoriteLocations.some(
            (f) =>
                f.lat.toFixed(4) === loc.lat.toFixed(4) &&
                f.lon.toFixed(4) === loc.lon.toFixed(4),
        );
    }

    function isResultFavorited(result: GeoResult): boolean {
        return $favoriteLocations.some(
            (f) =>
                f.lat.toFixed(4) === result.lat.toFixed(4) &&
                f.lon.toFixed(4) === result.lon.toFixed(4),
        );
    }

    let currentIsFavorited = $derived(isFavorited($weatherLocation));

    function toggleCurrentFavorite(e: MouseEvent) {
        e.stopPropagation();
        const loc = $weatherLocation;
        if (currentIsFavorited) {
            favoriteLocations.remove(loc);
        } else {
            favoriteLocations.add(loc);
        }
    }

    function toggleResultFavorite(e: MouseEvent, result: GeoResult) {
        e.stopPropagation();
        const loc: WeatherLocation = {
            name: result.name,
            lat: result.lat,
            lon: result.lon,
        };
        if (isResultFavorited(result)) {
            favoriteLocations.remove(loc);
        } else {
            favoriteLocations.add(loc);
        }
    }

    function removeFavorite(e: MouseEvent, fav: WeatherLocation) {
        e.stopPropagation();
        favoriteLocations.remove(fav);
    }

    async function loadForecast(lat: number, lon: number, force = false) {
        const key = `${lat},${lon}`;
        if (!force && key === lastFetchKey && forecast.length > 0) return;

        loading = true;
        error = null;
        try {
            forecast = await fetchForecast(lat, lon);
            lastFetchKey = key;
            if (forecast.length === 0) {
                error = "No forecast data";
            } else {
                markUpdated();
            }
        } catch (e) {
            console.error("[weather] Failed to fetch forecast:", e);
            error = "Could not load weather";
            forecast = [];
        } finally {
            loading = false;
        }
    }

    function openEditor() {
        searchQuery = "";
        searchResults = [];
        searchError = null;
        searching = false;
        editing = true;
        setTimeout(() => searchInputEl?.focus(), 20);
    }

    function cancelEdit() {
        editing = false;
        searchQuery = "";
        searchResults = [];
        searchError = null;
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
    }

    function selectLocation(loc: WeatherLocation) {
        weatherLocation.set({
            name: loc.name,
            lat: loc.lat,
            lon: loc.lon,
        });
        editing = false;
        searchQuery = "";
        searchResults = [];
        lastFetchKey = "";
        loadForecast(loc.lat, loc.lon);
    }

    function selectResult(result: GeoResult) {
        selectLocation({
            name: result.name,
            lat: result.lat,
            lon: result.lon,
        });
    }

    function handleSearchInput() {
        const q = searchQuery.trim();
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }

        if (q.length < 2) {
            searchResults = [];
            searchError = null;
            searching = false;
            return;
        }

        searching = true;
        searchError = null;

        searchTimeout = setTimeout(async () => {
            try {
                searchResults = await searchLocations(q);
                if (searchResults.length === 0) {
                    searchError = "No locations found";
                }
            } catch (e) {
                console.error("[weather] Geocoding failed:", e);
                searchError = "Search failed";
                searchResults = [];
            } finally {
                searching = false;
            }
        }, 400);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            cancelEdit();
        }
    }

    function openYr() {
        const loc = $weatherLocation;
        const url = `https://www.yr.no/en/forecast/daily-table/${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}`;
        openUrl(url).catch((e) =>
            console.error("[weather] Failed to open yr.no:", e),
        );
    }

    $effect(() => {
        const loc = $weatherLocation;
        loadForecast(loc.lat, loc.lon);
    });

    let lastSignal = $state(0);
    $effect(() => {
        const signal = $refreshSignal;
        if (signal > lastSignal) {
            lastSignal = signal;
            const loc = $weatherLocation;
            loadForecast(loc.lat, loc.lon, true);
        }
    });

    onMount(() => {
        lastSignal = $refreshSignal;
        loadForecast($weatherLocation.lat, $weatherLocation.lon);
    });
</script>

<div class="weather-widget">
    {#if editing}
        <div class="location-editor">
            <div class="search-field">
                <input
                    bind:this={searchInputEl}
                    type="text"
                    bind:value={searchQuery}
                    oninput={handleSearchInput}
                    onkeydown={handleKeydown}
                    placeholder="Search for a city…"
                    spellcheck="false"
                    autocomplete="off"
                />
                <button class="cancel-btn" onclick={cancelEdit} title="Cancel"
                    >✕</button
                >
            </div>

            {#if $favoriteLocations.length > 0 && searchQuery.trim().length === 0}
                <div class="favorites-section">
                    <span class="favorites-label">Favorites</span>
                    <ul class="favorites-list">
                        {#each $favoriteLocations as fav (fav.lat.toFixed(4) + "," + fav.lon.toFixed(4))}
                            <li>
                                <button
                                    class="fav-btn"
                                    onclick={() => selectLocation(fav)}
                                    title={`${fav.name} (${fav.lat.toFixed(2)}, ${fav.lon.toFixed(2)})`}
                                >
                                    <span class="fav-star">★</span>
                                    <span class="fav-name">{fav.name}</span>
                                </button>
                                <button
                                    class="fav-remove"
                                    onclick={(e) => removeFavorite(e, fav)}
                                    title="Remove from favorites"
                                >
                                    ✕
                                </button>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}

            {#if searching && searchResults.length === 0}
                <div class="search-status">
                    <span class="search-spinner"></span>
                </div>
            {:else if searchError && searchResults.length === 0}
                <div class="search-status muted">
                    <span>{searchError}</span>
                </div>
            {:else if searchResults.length > 0}
                <ul class="search-results">
                    {#each searchResults as result, i (result.displayName + i)}
                        <li>
                            <button
                                class="result-btn"
                                onclick={() => selectResult(result)}
                                title={result.displayName}
                            >
                                <div class="result-text">
                                    <span class="result-name"
                                        >{result.name}</span
                                    >
                                    {#if result.displayName}
                                        {@const detail = result.displayName
                                            .split(",")
                                            .slice(1)
                                            .map((s) => s.trim())
                                            .filter((s) => s.length > 0)
                                            .join(", ")}
                                        {#if detail}
                                            <span class="result-detail"
                                                >{detail}</span
                                            >
                                        {/if}
                                    {/if}
                                </div>
                            </button>
                            <button
                                class="result-star"
                                class:active={isResultFavorited(result)}
                                onclick={(e) => toggleResultFavorite(e, result)}
                                title={isResultFavorited(result)
                                    ? "Remove from favorites"
                                    : "Add to favorites"}
                            >
                                {isResultFavorited(result) ? "★" : "☆"}
                            </button>
                        </li>
                    {/each}
                </ul>
            {:else if searchQuery.trim().length > 0 && searchQuery.trim().length < 2}
                <div class="search-status muted">
                    <span>Type at least 2 characters</span>
                </div>
            {/if}
        </div>
    {:else}
        <div class="location-header-row">
            <button
                class="location-header"
                onclick={openEditor}
                title="Change location"
            >
                <span class="location-pin">📍</span>
                <span class="location-name">{$weatherLocation.name}</span>
                <span class="location-edit-icon">✎</span>
            </button>
            <button
                class="current-star"
                class:active={currentIsFavorited}
                onclick={toggleCurrentFavorite}
                title={currentIsFavorited
                    ? "Remove from favorites"
                    : "Add to favorites"}
            >
                {currentIsFavorited ? "★" : "☆"}
            </button>
        </div>

        {#if loading && forecast.length === 0}
            <div class="weather-status">
                <span class="weather-spinner"></span>
            </div>
        {:else if error && forecast.length === 0}
            <div class="weather-status error">
                <span class="error-text">{error}</span>
            </div>
        {:else if forecast.length > 0}
            <button class="forecast-row" onclick={openYr} title="Open in yr.no">
                {#each forecast as day (day.date)}
                    <div class="forecast-day">
                        <span class="day-label">{day.label}</span>
                        <img
                            class="weather-icon"
                            src={weatherIconUrl(day.symbolCode)}
                            alt={day.symbolCode.replace(/_/g, " ")}
                            width="36"
                            height="36"
                        />
                        <span class="temp-range">
                            <span class="temp-high">{day.tempHigh}°</span>
                            <span class="temp-low">{day.tempLow}°</span>
                        </span>
                    </div>
                {/each}
            </button>
        {/if}

        {#if updatedLabel}
            <div class="last-updated">Updated {updatedLabel}</div>
        {/if}
    {/if}
</div>

<style>
    .weather-widget {
        padding: 0.6rem 0.75rem 0.5rem;
        border-bottom: 1px solid #e0e0e0;
        user-select: none;
    }

    @media (prefers-color-scheme: dark) {
        .weather-widget {
            border-bottom-color: #3a3a3a;
        }
    }

    .last-updated {
        font-size: 0.62rem;
        opacity: 0.35;
        text-align: right;
        padding-top: 0.3rem;
        line-height: 1;
    }

    /* ── Location header ─────────────────────────────── */

    .location-header-row {
        display: flex;
        align-items: center;
        gap: 0.15rem;
        padding-bottom: 0.35rem;
    }

    .location-header {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        flex: 1;
        min-width: 0;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        color: inherit;
        font: inherit;
        font-size: 0.8rem;
        line-height: 1;
        text-align: left;
    }

    .location-pin {
        font-size: 0.7rem;
    }

    .location-name {
        font-weight: 600;
        opacity: 0.85;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .location-edit-icon {
        margin-left: auto;
        font-size: 0.7rem;
        opacity: 0;
        transition: opacity 0.15s ease;
        flex-shrink: 0;
    }

    .location-header:hover .location-edit-icon {
        opacity: 0.5;
    }

    /* ── Current location star ───────────────────────── */

    .current-star {
        flex-shrink: 0;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        font-size: 0.85rem;
        line-height: 1;
        cursor: pointer;
        color: inherit;
        opacity: 0.3;
        transition:
            opacity 0.15s ease,
            color 0.15s ease;
    }

    .current-star:hover {
        opacity: 0.7;
    }

    .current-star.active {
        color: #e8a320;
        opacity: 0.85;
    }

    .current-star.active:hover {
        opacity: 1;
    }

    /* ── Forecast row ────────────────────────────────── */

    .forecast-row {
        display: flex;
        justify-content: space-between;
        gap: 0.25rem;
        width: 100%;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        color: inherit;
        font: inherit;
        cursor: pointer;
        border-radius: 6px;
        transition: background-color 0.15s ease;
    }

    .forecast-row:hover {
        background-color: rgba(128, 128, 128, 0.08);
    }

    .forecast-day {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        min-width: 0;
        gap: 0.15rem;
    }

    .day-label {
        font-size: 0.68rem;
        font-weight: 600;
        opacity: 0.6;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    .weather-icon {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
    }

    .temp-range {
        display: flex;
        gap: 0.3rem;
        font-size: 0.75rem;
        line-height: 1;
    }

    .temp-high {
        font-weight: 600;
    }

    .temp-low {
        opacity: 0.5;
    }

    /* ── Status / loading ────────────────────────────── */

    .weather-status {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.75rem 0 0.5rem;
        font-size: 0.75rem;
        opacity: 0.5;
    }

    .weather-status.error {
        opacity: 0.7;
    }

    .error-text {
        font-size: 0.72rem;
        opacity: 0.7;
    }

    .weather-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(128, 128, 128, 0.2);
        border-top-color: rgba(128, 128, 128, 0.6);
        border-radius: 50%;
        animation: wspin 0.7s linear infinite;
    }

    @keyframes wspin {
        to {
            transform: rotate(360deg);
        }
    }

    /* ── Location editor ─────────────────────────────── */

    .location-editor {
        display: flex;
        flex-direction: column;
    }

    .search-field {
        display: flex;
        align-items: center;
        gap: 0.3rem;
    }

    .search-field input {
        flex: 1;
        min-width: 0;
        font-size: 0.78rem;
        padding: 0.35rem 0.5rem;
        border: 1px solid #d0d0d0;
        border-radius: 6px;
        background: #fff;
        color: inherit;
        outline: none;
    }

    .search-field input:focus {
        border-color: #5b9bd5;
    }

    .search-field input::placeholder {
        opacity: 0.45;
    }

    @media (prefers-color-scheme: dark) {
        .search-field input {
            background: #333;
            border-color: #555;
        }

        .search-field input:focus {
            border-color: #5b9bd5;
        }
    }

    .cancel-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.6rem;
        height: 1.6rem;
        flex-shrink: 0;
        border: none;
        border-radius: 5px;
        background: rgba(128, 128, 128, 0.1);
        color: inherit;
        font-size: 0.7rem;
        cursor: pointer;
        opacity: 0.5;
        transition:
            opacity 0.15s ease,
            background-color 0.15s ease;
    }

    .cancel-btn:hover {
        opacity: 0.9;
        background: rgba(128, 128, 128, 0.2);
    }

    /* ── Favorites ───────────────────────────────────── */

    .favorites-section {
        margin-top: 0.4rem;
    }

    .favorites-label {
        display: block;
        font-size: 0.62rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.4;
        padding-bottom: 0.25rem;
    }

    .favorites-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        overflow: hidden;
    }

    @media (prefers-color-scheme: dark) {
        .favorites-list {
            border-color: #444;
        }
    }

    .favorites-list li {
        display: flex;
        align-items: center;
        border-bottom: 1px solid #eee;
    }

    .favorites-list li:last-child {
        border-bottom: none;
    }

    @media (prefers-color-scheme: dark) {
        .favorites-list li {
            border-bottom-color: #3a3a3a;
        }
    }

    .fav-btn {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        flex: 1;
        min-width: 0;
        padding: 0.38rem 0.5rem;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.12s ease;
    }

    .fav-btn:hover {
        background: rgba(91, 155, 213, 0.1);
    }

    @media (prefers-color-scheme: dark) {
        .fav-btn:hover {
            background: rgba(91, 155, 213, 0.15);
        }
    }

    .fav-star {
        color: #e8a320;
        font-size: 0.72rem;
        flex-shrink: 0;
    }

    .fav-name {
        font-size: 0.76rem;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .fav-remove {
        flex-shrink: 0;
        background: none;
        border: none;
        padding: 0.3rem 0.5rem;
        margin: 0;
        font-size: 0.6rem;
        cursor: pointer;
        color: inherit;
        opacity: 0;
        transition: opacity 0.15s ease;
    }

    .favorites-list li:hover .fav-remove {
        opacity: 0.4;
    }

    .fav-remove:hover {
        opacity: 0.8 !important;
    }

    /* ── Search results ──────────────────────────────── */

    .search-results {
        list-style: none;
        margin: 0.35rem 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        overflow: hidden;
        max-height: 200px;
        overflow-y: auto;
    }

    @media (prefers-color-scheme: dark) {
        .search-results {
            border-color: #444;
        }
    }

    .search-results li {
        display: flex;
        align-items: center;
        border-bottom: 1px solid #eee;
    }

    .search-results li:last-child {
        border-bottom: none;
    }

    @media (prefers-color-scheme: dark) {
        .search-results li {
            border-bottom-color: #3a3a3a;
        }
    }

    .result-btn {
        display: flex;
        flex: 1;
        min-width: 0;
        padding: 0.4rem 0.55rem;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.12s ease;
    }

    .result-btn:hover {
        background: rgba(91, 155, 213, 0.1);
    }

    @media (prefers-color-scheme: dark) {
        .result-btn:hover {
            background: rgba(91, 155, 213, 0.15);
        }
    }

    .result-text {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
    }

    .result-name {
        font-size: 0.78rem;
        font-weight: 600;
        line-height: 1.2;
    }

    .result-detail {
        font-size: 0.68rem;
        opacity: 0.5;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .result-star {
        flex-shrink: 0;
        background: none;
        border: none;
        padding: 0.3rem 0.5rem;
        margin: 0;
        font-size: 0.82rem;
        line-height: 1;
        cursor: pointer;
        color: inherit;
        opacity: 0.25;
        transition:
            opacity 0.15s ease,
            color 0.15s ease;
    }

    .result-star:hover {
        opacity: 0.7;
    }

    .result-star.active {
        color: #e8a320;
        opacity: 0.85;
    }

    .result-star.active:hover {
        opacity: 1;
    }

    /* ── Search status ───────────────────────────────── */

    .search-status {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.6rem 0 0.3rem;
        font-size: 0.72rem;
    }

    .search-status.muted {
        opacity: 0.45;
    }

    .search-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(128, 128, 128, 0.2);
        border-top-color: rgba(128, 128, 128, 0.6);
        border-radius: 50%;
        animation: wspin 0.7s linear infinite;
    }
</style>

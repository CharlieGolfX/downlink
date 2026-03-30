# Downlink

A lightweight, native desktop RSS reader built with [Tauri 2](https://tauri.app/), [SvelteKit](https://kit.svelte.dev/), and Rust.

Downlink lets you subscribe to RSS and Atom feeds, read articles in a clean reader mode or their original format, and keep a compact weather forecast in your sidebar — all from a single, fast desktop app.

## Features

### Feed Reader

- **Subscribe to RSS / Atom feeds** — add any feed URL and organize sources with tags.
- **Reader mode** — extracts article content using [Mozilla Readability](https://github.com/mozilla/readability) with smart image handling (lazy-load rescue, relative URL resolution, dimension-aware sizing). Customizable theme, font, and text size.
- **Original view** — view articles in a native webview with cosmetic ad-blocking (CSS-based element hiding + MutationObserver).
- **Read / unread tracking** — articles are marked as read when opened; read state is preserved across feed refreshes.
- **Category badges** — article categories from the feed are displayed on each card.
- **Auto-refresh** — feeds refresh on an hourly poll with a manual refresh button; all timestamps are shared across the app.

### Weather Widget

- **3-day forecast** — compact sidebar widget powered by [MET Norway](https://api.met.no/) (`locationforecast/2.0`).
- **Location search** — find any location by name via [Nominatim](https://nominatim.openstreetmap.org/) geocoding (runs through the Rust backend to respect CORS and User-Agent policies).
- **Favorite locations** — save and quickly switch between locations; favorites persist across sessions.
- **yr.no integration** — click the forecast to open the full forecast on [yr.no](https://www.yr.no/) for the selected location.
- **Synced refresh** — weather updates automatically when feeds refresh.

### Desktop Experience

- **Native performance** — Tauri 2 backend with Rust; small binary, low memory footprint.
- **Dark mode** — respects the system color scheme out of the box.
- **Cross-platform** — builds for macOS, Windows, and Linux.

## Roadmap

For a full list of planned features, improvements, and ideas, see **[todo.md](todo.md)**.

## Tech Stack

| Layer    | Technology                                  |
| -------- | ------------------------------------------- |
| Backend  | Rust, Tauri 2, reqwest, feed-rs             |
| Frontend | SvelteKit (Svelte 5), TypeScript, Vite      |
| Reader   | Mozilla Readability, custom HTML renderer    |
| Weather  | MET Norway API, Nominatim (OpenStreetMap)    |

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Tauri 2 CLI and system dependencies — see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)

## Getting Started

```sh
# Clone the repository
git clone https://github.com/cgxeiji/downlink.git
cd downlink

# Install frontend dependencies
npm install

# Run in development mode (starts both Vite dev server and Tauri)
npm run tauri dev
```

## Building

```sh
# Create a production build
npm run tauri build
```

The bundled application will be output to `src-tauri/target/release/bundle/`.

## Project Structure

```
downlink/
├── src/                        # SvelteKit frontend
│   ├── lib/
│   │   ├── components/         # Svelte components
│   │   │   ├── AddFeedModal.svelte
│   │   │   ├── ArticleCard.svelte
│   │   │   ├── ArticleView.svelte
│   │   │   ├── ManageFeedsModal.svelte
│   │   │   └── WeatherWidget.svelte
│   │   ├── services/           # Backend communication
│   │   │   ├── rss.ts          # Feed fetching & refresh logic
│   │   │   ├── weather.ts      # Weather & geocoding client
│   │   │   └── webview.ts      # Native webview management
│   │   ├── stores/             # Svelte stores (state management)
│   │   │   ├── feeds.ts        # Feed & article state
│   │   │   ├── reader.ts       # Reader mode settings
│   │   │   ├── ui.ts           # Refresh signals, timestamps
│   │   │   └── weather.ts      # Weather location & favorites
│   │   ├── types/              # TypeScript type definitions
│   │   └── utils/              # Helpers (content processing, dates, reader HTML)
│   └── routes/                 # SvelteKit routes & layout
├── src-tauri/                  # Tauri / Rust backend
│   ├── src/
│   │   ├── lib.rs              # Tauri commands & app setup
│   │   └── main.rs             # Entry point
│   ├── Cargo.toml
│   └── tauri.conf.json
├── static/                     # Static assets
└── package.json
```

## Known Notes

- **macOS Keychain prompt** — when running unsigned development builds on macOS, WKWebView's WebCrypto may trigger a Keychain access dialog ("webcrypto masterkey for downlink"). This is expected and harmless; signing the app (even ad-hoc) prevents the prompt.
- **Webview layering** — Tauri child webviews are native OS-level overlays that sit above the app DOM. Modals move webviews off-screen so dialogs remain accessible.

## Contributing

Contributions are welcome! Here's how you can help:

1. **Fork** the repository and create a new branch from `main`.
2. **Make your changes** — whether it's a bug fix, new feature, or documentation improvement.
3. **Test locally** — make sure the app builds and runs cleanly:
   ```sh
   npm run check          # TypeScript / Svelte type checking
   cd src-tauri && cargo check  # Rust type checking
   npm run tauri dev      # Run the full app
   ```
4. **Open a pull request** with a clear description of what you changed and why.

### Ideas for Contributions

If you're looking for somewhere to start, here are a few areas that could use attention:

- **Cross-platform testing** — verify webview alignment, ad-blocking, and weather on Windows and Linux with various display scaling factors.
- **Keyboard shortcuts** — add bindings for reader toggle, font-size changes, mark read/unread, and navigation.
- **Accessibility** — ARIA attributes, focus management, and screen reader announcements.
- **Enhanced ad-blocking** — expand CSS selector lists or explore platform-native request blocking (e.g., WKWebView content rules on macOS).
- **Reader improvements** — progress indicators, keyboard navigation within articles, and better handling of JS-rendered pages.
- **Tests** — unit and integration tests for the feed parsing pipeline, store logic, and weather services.
- **Context menus** — right-click actions in the sidebar (mark unread, open in browser, copy link).

### Guidelines

- Keep pull requests focused — one feature or fix per PR.
- Match the existing code style (Prettier for the frontend, `rustfmt` for Rust).
- If you're adding a new dependency, mention why it's needed in the PR description.
- For larger changes, consider opening an issue first to discuss the approach.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
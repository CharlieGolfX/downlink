# Downlink — Roadmap & Ideas

> A living document of potential features, improvements, and fixes.
> Items are roughly ordered by impact within each category.

---

## Core — Feed Management

- [X] **Persist feeds & articles to disk** — feeds and articles currently live in in-memory Svelte stores and are lost on restart. Use a local database (SQLite via `tauri-plugin-sql` or a simple JSON file) so subscriptions and read state survive across sessions.
- [X] **OPML import / export** — allow users to import their subscriptions from other readers and export them as OPML for backup or migration.
- [ ] **Custom tags** — the tag list is currently hardcoded in `tags.ts`. Let users create, rename, reorder, and delete their own tags.
- [X] **Feed folders / groups** — support nested organization beyond flat tags (e.g. "Tech > Rust", "News > Local"). - Implemented by automatically categorizing feeds based on <category> elements in the feed and showing category badges on article cards.
- [X] **Feed health indicators** — show an icon or badge when a feed has been failing to fetch, with the last error message and a retry button.
- [ ] **Duplicate detection** — detect and merge feeds that resolve to the same source (e.g. different URL variants pointing to the same RSS endpoint).
- [X] **Feed auto-discovery** — given a website URL (not a feed URL), attempt to discover the RSS/Atom feed link from the page's `<link>` tags.

---

## Reading Experience

- [ ] **Mark all as read** — button to mark all visible articles (or all articles in a tag/feed) as read in one action.
- [ ] **Mark as unread** — allow toggling an article back to unread from the sidebar or article view.
- [ ] **Bookmarks / saved articles** — let users star or bookmark articles for later; persist independently from feed refreshes.
- [ ] **Full-text search** — search across all article titles and content with a quick-filter input in the sidebar.
- [ ] **Article sorting options** — sort by date (newest/oldest first), by feed, or by unread status.
- [X] **Unread count badges** — show unread counts per tag and per feed in the sidebar/filter dropdown.
- [X] **Keyboard shortcuts** — add bindings for common actions: next/previous article (`j`/`k`), toggle reader/original (`r`), mark read (`m`), refresh (`R`), search (`/`).
- [X] **Open in external browser** — quick action to open the current article in the system default browser.
- [X] **Context menu on article cards** — right-click actions: mark read/unread, bookmark, copy link, open in browser.
- [ ] **Article text-to-speech** — use the system TTS API to read articles aloud.

---

## Reader Mode

- [X] **Progress indicator** — show a reading progress bar or percentage as the user scrolls through an article.
- [X] **Estimated reading time** — already partially computed; surface it more prominently in the UI.
- [X] **Keyboard navigation in reader** — arrow keys or vim-style keys to scroll, `Esc` to close reader.
- [X] **Image lightbox** — click an image in reader mode to view it full-size in an overlay. ((Images do not load in high rez))
- [ ] **Code block syntax highlighting** — detect `<pre>`/`<code>` blocks in extracted content and apply syntax highlighting.
- [ ] **Remember scroll position** — when switching away from an article and coming back, restore the scroll position.
- [ ] **Offline reader cache** — cache extracted reader HTML locally so articles can be read without a network connection.

---

## Ad-Blocking & Content Filtering

- [ ] **Expanded cosmetic selector list** — grow the CSS selector list for hiding ads, newsletter popups, cookie banners, and social share overlays.
- [ ] **Platform-native request blocking** — on macOS, use WKWebView content rules (`WKContentRuleListStore`) to block ad network requests at the network level.
- [ ] **User-defined block rules** — let users add custom CSS selectors or URL patterns to block.
- [ ] **Cookie consent auto-dismiss** — detect and automatically dismiss GDPR/cookie consent banners.

---

## Weather Widget

- [ ] **Current conditions** — show current temperature, wind, and precipitation alongside the 3-day forecast.
- [ ] **Hourly forecast expansion** — tap a day to expand an hourly breakdown.
- [ ] **Manage favorites** — rename, reorder, and bulk-delete favorite locations.
- [ ] **Export / import favorites** — allow backing up and restoring weather favorites.
- [ ] **Geolocation** — detect the user's location automatically (with permission) instead of requiring manual search.
- [ ] **Units toggle** — switch between Celsius/Fahrenheit, km/h and mph.
- [ ] **Severe weather alerts** — surface warnings from MET Norway when available.

---

## UI & Desktop Experience

- [X] **Sidebar resize** — allow dragging to resize the article list sidebar width.
- [ ] **Compact / expanded list modes** — toggle between a dense title-only list and the current card layout.
- [ ] **System tray integration** — minimize to tray, show unread badge, and allow refresh from the tray menu.
- [ ] **Native notifications** — notify when new articles arrive (especially for high-priority feeds).
- [ ] **Theme customization** — go beyond light/dark system preference with user-selectable accent colors or full themes.
- [ ] **Multi-window support** — open articles in separate windows for side-by-side reading.
- [ ] **Drag and drop feed import** — drop an OPML file or a feed URL onto the window to add it.
- [X] **Configurable refresh interval** — let users choose the polling interval (15 min, 30 min, 1 hour, etc.) instead of the hardcoded 1-hour cycle.
- [ ] **Startup behavior** — option to start minimized, restore last window size/position, and auto-refresh on launch.

---

## Accessibility

- [ ] **ARIA attributes** — add proper roles, labels, and live regions throughout the app.
- [ ] **Focus management** — ensure logical tab order through sidebar, toolbar, and article content; trap focus inside modals.
- [ ] **Screen reader announcements** — announce feed refresh results, new article counts, and view switches.
- [ ] **High-contrast mode** — ensure all UI elements meet WCAG AA contrast ratios; add a high-contrast theme option.
- [ ] **Reduced motion** — respect `prefers-reduced-motion` for the refresh spinner and transitions.

---

## Performance & Reliability

- [ ] **Feed fetch timeout & retries** — add configurable timeouts and automatic retry with backoff for unreliable feeds.
- [X] **Lazy-load article list** — virtualize the sidebar article list for users with thousands of articles.
- [ ] **Cache feed responses** — use ETags / `If-Modified-Since` to avoid re-downloading unchanged feeds.
- [X] **Background refresh** — refresh feeds in the background even when the window is minimized (via system tray).
- [X] **Error boundary UI** — graceful error states throughout the app instead of silent console errors.

---

## Developer Experience

- [ ] **Unit & integration tests** — test the feed parsing pipeline, store logic (merge, dedup, read state), weather services, and Readability preprocessing.
- [ ] **E2E tests** — use Tauri's WebDriver support or Playwright to test the full app flow.
- [ ] **CI pipeline** — GitHub Actions for lint, type-check (`svelte-check` + `cargo check`), test, and build on all three platforms.
- [ ] **Dev overlay** — toggleable debug panel showing webview offsets, webview lifecycle, ad-block state, and store contents.
- [ ] **Logging** — structured logging in the Rust backend (e.g. `tracing`) and a way to view logs from the UI for debugging.

---

## Future / Exploratory

- [ ] **Podcast support** — detect audio enclosures in feeds and add a basic audio player.
- [ ] **Feed recommendations** — suggest popular feeds based on the user's current subscriptions or categories.
- [ ] **Sync across devices** — optional cloud sync for subscriptions, read state, and bookmarks.
- [ ] **Plugin / extension system** — allow third-party scripts to extend content processing, add custom sidebar widgets, or integrate other services.
- [ ] **Sharing** — share articles to Mastodon, email, clipboard, or other services via the system share sheet.
- [ ] **Newsletter-to-feed** — provide a local email endpoint that converts email newsletters into feed entries.

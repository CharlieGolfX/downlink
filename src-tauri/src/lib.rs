use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};

struct ReaderHtml(Mutex<String>);

#[derive(Debug, Serialize, Deserialize)]
pub struct FeedResult {
    pub title: String,
    pub description: Option<String>,
    pub logo: Option<String>,
    pub articles: Vec<ArticleResult>,
    /// When auto-discovery was used, this is the actual feed URL that was found.
    /// `None` means the input URL was already a valid feed.
    pub feed_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArticleResult {
    pub id: String,
    pub title: String,
    pub url: String,
    pub content: Option<String>,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<String>,
    pub categories: Vec<String>,
}

/// Converts a parsed `feed_rs` feed into our `FeedResult` struct.
/// `discovered_url` is set when auto-discovery was used to find the feed.
fn build_feed_result(feed: feed_rs::model::Feed, discovered_url: Option<String>) -> FeedResult {
    let title = feed.title.map(|t| t.content).unwrap_or_default();
    let description = feed.description.map(|d| d.content);
    let logo = feed
        .logo
        .map(|img| img.uri)
        .or_else(|| feed.icon.map(|img| img.uri));

    let articles: Vec<ArticleResult> = feed
        .entries
        .into_iter()
        .map(|entry| {
            let entry_title = entry.title.map(|t| t.content).unwrap_or_default();
            let entry_url = entry
                .links
                .first()
                .map(|l| l.href.clone())
                .unwrap_or_default();
            let content = entry.content.and_then(|c| c.body);
            let summary = entry.summary.map(|s| s.content);
            let author = entry.authors.first().map(|a| a.name.clone());
            let published_at = entry.published.or(entry.updated).map(|dt| dt.to_rfc3339());
            let categories: Vec<String> = entry
                .categories
                .iter()
                .map(|c| c.label.as_deref().unwrap_or(&c.term).to_string())
                .collect();

            ArticleResult {
                id: entry.id,
                title: entry_title,
                url: entry_url,
                content,
                summary,
                author,
                published_at,
                categories,
            }
        })
        .collect();

    FeedResult {
        title,
        description,
        logo,
        articles,
        feed_url: discovered_url,
    }
}

/// Extracts the value of an HTML attribute from a tag string.
/// Handles both double and single quotes.
fn extract_attr(tag: &str, attr_name: &str) -> Option<String> {
    let lower = tag.to_lowercase();
    for quote in ['"', '\''] {
        let pattern = format!("{}={}", attr_name, quote);
        if let Some(start) = lower.find(&pattern) {
            let value_start = start + pattern.len();
            if let Some(end) = tag[value_start..].find(quote) {
                return Some(tag[value_start..value_start + end].to_string());
            }
        }
    }
    None
}

/// Scans HTML for `<link>` tags that point to RSS/Atom feeds.
/// Returns a list of absolute feed URLs resolved against `base_url`.
fn discover_feed_links(html: &str, base_url: &str) -> Vec<String> {
    let mut feeds = Vec::new();
    let base = match url::Url::parse(base_url) {
        Ok(u) => u,
        Err(_) => return feeds,
    };

    let html_lower = html.to_lowercase();
    let mut search_from = 0;

    while let Some(start) = html_lower[search_from..].find("<link") {
        let abs_start = search_from + start;
        let remaining = &html_lower[abs_start..];

        if let Some(end) = remaining.find('>') {
            // Use original-case HTML for extracting the href value
            let tag = &html[abs_start..abs_start + end + 1];
            let tag_lower = &html_lower[abs_start..abs_start + end + 1];

            let is_feed = tag_lower.contains("application/rss+xml")
                || tag_lower.contains("application/atom+xml")
                || tag_lower.contains("application/feed+json");

            if is_feed {
                if let Some(href) = extract_attr(tag, "href") {
                    if let Ok(resolved) = base.join(&href) {
                        feeds.push(resolved.to_string());
                    } else if href.starts_with("http") {
                        feeds.push(href);
                    }
                }
            }

            search_from = abs_start + end + 1;
        } else {
            break;
        }
    }

    feeds
}

/// Well-known feed paths to probe when `<link>` discovery finds nothing.
const COMMON_FEED_PATHS: &[&str] = &[
    "/feed",
    "/feed.xml",
    "/rss",
    "/rss.xml",
    "/atom.xml",
    "/index.xml",
    "/feed/rss",
    "/feed/atom",
    "/.rss",
];

#[tauri::command]
async fn fetch_feed(url: String) -> Result<FeedResult, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch: {}", e))?;

    let body = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    // ── 1. Try to parse the response directly as a feed ─────────────
    if let Ok(feed) = feed_rs::parser::parse(&body[..]) {
        return Ok(build_feed_result(feed, None));
    }

    // ── 2. Not a feed — treat the response as HTML and look for <link> tags
    let html = String::from_utf8_lossy(&body);
    let discovered = discover_feed_links(&html, &url);

    for link in &discovered {
        if let Ok(resp) = client.get(link).send().await {
            if let Ok(feed_body) = resp.bytes().await {
                if let Ok(feed) = feed_rs::parser::parse(&feed_body[..]) {
                    return Ok(build_feed_result(feed, Some(link.clone())));
                }
            }
        }
    }

    // ── 3. No <link> tags found — probe common feed paths ───────────
    if discovered.is_empty() {
        if let Ok(base) = url::Url::parse(&url) {
            for path in COMMON_FEED_PATHS {
                if let Ok(probe_url) = base.join(path) {
                    let probe = probe_url.to_string();
                    if let Ok(resp) = client.get(&probe).send().await {
                        if let Ok(feed_body) = resp.bytes().await {
                            if let Ok(feed) = feed_rs::parser::parse(&feed_body[..]) {
                                return Ok(build_feed_result(feed, Some(probe)));
                            }
                        }
                    }
                }
            }
        }
    }

    // ── 4. Nothing worked ───────────────────────────────────────────
    if discovered.is_empty() {
        Err(format!(
            "\"{}\" is not a valid feed and no feed links were found on the page.",
            url
        ))
    } else {
        Err(format!(
            "Found {} feed link(s) on the page but none could be parsed.",
            discovered.len()
        ))
    }
}

#[tauri::command]
async fn fetch_page_html(url: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("Failed to fetch page: {}", e))?;

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    Ok(html)
}

#[tauri::command]
async fn fetch_weather(lat: f64, lon: f64) -> Result<String, String> {
    let url =
        format!("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={lat}&lon={lon}");

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "downlink/0.1.0 github.com/cgxeiji/downlink")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch weather: {}", e))?;

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    Ok(body)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeocodingResult {
    pub display_name: String,
    pub lat: String,
    pub lon: String,
    pub name: Option<String>,
    pub country: Option<String>,
    pub state: Option<String>,
}

#[tauri::command]
async fn geocode_location(query: String) -> Result<Vec<GeocodingResult>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://nominatim.openstreetmap.org/search")
        .query(&[
            ("q", query.as_str()),
            ("format", "json"),
            ("limit", "6"),
            ("addressdetails", "1"),
            ("accept-language", "en"),
        ])
        .header("User-Agent", "downlink/0.1.0 github.com/cgxeiji/downlink")
        .send()
        .await
        .map_err(|e| format!("Failed to geocode: {}", e))?;

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read geocoding response: {}", e))?;

    let raw: Vec<serde_json::Value> = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse geocoding JSON: {}", e))?;

    let results: Vec<GeocodingResult> = raw
        .into_iter()
        .map(|entry| {
            let address = entry.get("address");
            GeocodingResult {
                display_name: entry
                    .get("display_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                lat: entry
                    .get("lat")
                    .and_then(|v| v.as_str())
                    .unwrap_or("0")
                    .to_string(),
                lon: entry
                    .get("lon")
                    .and_then(|v| v.as_str())
                    .unwrap_or("0")
                    .to_string(),
                name: address
                    .and_then(|a| {
                        a.get("city")
                            .or_else(|| a.get("town"))
                            .or_else(|| a.get("village"))
                            .or_else(|| a.get("municipality"))
                    })
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                country: address
                    .and_then(|a| a.get("country"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                state: address
                    .and_then(|a| a.get("state"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            }
        })
        .collect();

    Ok(results)
}

#[tauri::command]
async fn translate_text(
    text: String,
    source_lang: String,
    target_lang: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://translate.googleapis.com/translate_a/single")
        .query(&[
            ("client", "gtx"),
            ("sl", &source_lang),
            ("tl", &target_lang),
            ("dt", "t"),
            ("q", &text),
        ])
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("Failed to call translation API: {}", e))?;

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read translation response: {}", e))?;

    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse translation JSON: {}", e))?;

    let mut translated = String::new();
    if let Some(outer) = json.get(0).and_then(|v| v.as_array()) {
        for segment in outer {
            if let Some(part) = segment.get(0).and_then(|v| v.as_str()) {
                translated.push_str(part);
            }
        }
    }

    if translated.is_empty() {
        return Err("Translation returned empty result".to_string());
    }

    Ok(translated)
}

const ORIGINAL_WEBVIEW_LABEL: &str = "original-content";

#[tauri::command]
async fn show_original(
    app: tauri::AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    if let Some(webview) = app.get_webview(ORIGINAL_WEBVIEW_LABEL) {
        webview
            .navigate(parsed)
            .map_err(|e: tauri::Error| e.to_string())?;
        webview
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e: tauri::Error| e.to_string())?;
        webview
            .set_size(LogicalSize::new(width, height))
            .map_err(|e: tauri::Error| e.to_string())?;
    } else {
        let window = app.get_window("main").ok_or("Main window not found")?;
        window
            .add_child(
                WebviewBuilder::new(ORIGINAL_WEBVIEW_LABEL, WebviewUrl::External(parsed)),
                LogicalPosition::new(x, y),
                LogicalSize::new(width, height),
            )
            .map_err(|e: tauri::Error| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn hide_original(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview(ORIGINAL_WEBVIEW_LABEL) {
        webview.close().map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn resize_original(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(webview) = app.get_webview(ORIGINAL_WEBVIEW_LABEL) {
        webview
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e: tauri::Error| e.to_string())?;
        webview
            .set_size(LogicalSize::new(width, height))
            .map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

const READER_WEBVIEW_LABEL: &str = "reader-content";

#[tauri::command]
async fn show_reader(
    app: tauri::AppHandle,
    html: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    {
        let state = app.state::<ReaderHtml>();
        let mut stored = state.0.lock().map_err(|e| e.to_string())?;
        *stored = html;
    }

    let reader_url = WebviewUrl::CustomProtocol("reader://localhost/index.html".parse().unwrap());

    if let Some(webview) = app.get_webview(READER_WEBVIEW_LABEL) {
        webview
            .navigate(
                "reader://localhost/index.html"
                    .parse()
                    .map_err(|e: url::ParseError| e.to_string())?,
            )
            .map_err(|e: tauri::Error| e.to_string())?;
        webview
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e: tauri::Error| e.to_string())?;
        webview
            .set_size(LogicalSize::new(width, height))
            .map_err(|e: tauri::Error| e.to_string())?;
    } else {
        let window = app.get_window("main").ok_or("Main window not found")?;
        let builder = WebviewBuilder::new(READER_WEBVIEW_LABEL, reader_url).auto_resize();
        window
            .add_child(
                builder,
                LogicalPosition::new(x, y),
                LogicalSize::new(width, height),
            )
            .map_err(|e: tauri::Error| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn hide_reader(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview(READER_WEBVIEW_LABEL) {
        webview.close().map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn resize_reader(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(webview) = app.get_webview(READER_WEBVIEW_LABEL) {
        webview
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e: tauri::Error| e.to_string())?;
        webview
            .set_size(LogicalSize::new(width, height))
            .map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn eval_reader(app: tauri::AppHandle, js: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(READER_WEBVIEW_LABEL) {
        webview.eval(&js).map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn eval_original(app: tauri::AppHandle, js: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(ORIGINAL_WEBVIEW_LABEL) {
        webview.eval(&js).map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ReaderHtml(Mutex::new(String::new())))
        .register_uri_scheme_protocol("reader", |ctx, _request| {
            let state = ctx.app_handle().state::<ReaderHtml>();
            let html = state.0.lock().unwrap_or_else(|e| e.into_inner());
            tauri::http::Response::builder()
                .status(200)
                .header("content-type", "text/html; charset=utf-8")
                .body(html.as_bytes().to_vec())
                .unwrap()
        })
        .invoke_handler(tauri::generate_handler![
            fetch_feed,
            fetch_page_html,
            fetch_weather,
            geocode_location,
            translate_text,
            show_original,
            hide_original,
            resize_original,
            eval_original,
            show_reader,
            hide_reader,
            resize_reader,
            eval_reader
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

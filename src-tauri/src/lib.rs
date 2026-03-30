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

#[tauri::command]
async fn fetch_feed(url: String) -> Result<FeedResult, String> {
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch feed: {}", e))?;

    let body = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let feed =
        feed_rs::parser::parse(&body[..]).map_err(|e| format!("Failed to parse feed: {}", e))?;

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

    Ok(FeedResult {
        title,
        description,
        logo,
        articles,
    })
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
            show_original,
            hide_original,
            resize_original,
            show_reader,
            hide_reader,
            resize_reader,
            eval_reader
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

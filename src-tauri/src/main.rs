// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod gpu;
mod lens;
mod lens_source;
mod setup;

use gpu::GpuInfo;
use lens::LensManager;
use setup::{SetupManager, SetupStatus};
use tauri_plugin_updater::UpdaterExt;

// ── Lens commands ──────────────────────────────────────────────────

#[tauri::command]
async fn get_lens_status(lens: tauri::State<'_, LensManager>) -> Result<serde_json::Value, String> {
    lens.status().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_lens(lens: tauri::State<'_, LensManager>) -> Result<(), String> {
    lens.start().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_lens(lens: tauri::State<'_, LensManager>) -> Result<(), String> {
    lens.stop().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn configure_lens(
    lens: tauri::State<'_, LensManager>,
    config: serde_json::Value,
) -> Result<(), String> {
    lens.configure(config).await.map_err(|e| e.to_string())
}

// ── GPU commands ───────────────────────────────────────────────────

#[tauri::command]
fn detect_gpu() -> GpuInfo {
    gpu::detect_gpu()
}

#[tauri::command]
fn detect_all_gpus() -> Vec<GpuInfo> {
    gpu::detect_all()
}

// ── Knowledge Base / Lens config commands ──────────────────────────

#[derive(serde::Serialize)]
struct LensConfigInfo {
    url: String,
    api_key: String,
    top_k: u32,
}

/// Returns the local lens server URL + API key for auto-fill into Custom Knowledge
/// Source. Generates a key on first call if none exists.
#[tauri::command]
async fn get_lens_config() -> Result<LensConfigInfo, String> {
    let key_file = lens::lens_data_dir().join("api_key");
    let api_key = if key_file.exists() {
        std::fs::read_to_string(&key_file)
            .map_err(|e| format!("Failed to read API key: {}", e))?
            .trim()
            .to_string()
    } else {
        let (stdout, stderr, ok) = lens::run_lens_command(&["key"])?;
        if !ok {
            return Err(format!("Failed to generate key: {}", stderr));
        }
        stdout.trim().to_string()
    };
    Ok(LensConfigInfo {
        url: "http://127.0.0.1:8321/query".into(),
        api_key,
        top_k: 5,
    })
}

#[derive(serde::Deserialize)]
struct IngestRequest {
    paths: Vec<String>,
}

#[derive(serde::Serialize)]
struct IngestResult {
    files_seen: u32,
    chunks_indexed: u32,
    skipped: Vec<String>,
}

/// Ingest documents into the local knowledge base. Handles multiple paths;
/// each is ingested independently and results are summed.
#[tauri::command]
async fn ingest_documents(req: IngestRequest) -> Result<IngestResult, String> {
    if req.paths.is_empty() {
        return Err("No paths provided".into());
    }
    let mut total = IngestResult {
        files_seen: 0,
        chunks_indexed: 0,
        skipped: vec![],
    };
    for path in &req.paths {
        let (stdout, stderr, ok) = lens::run_lens_command(&["ingest", "--json", path])?;
        if !ok {
            return Err(format!("Ingest of {} failed: {}", path, stderr));
        }
        let parsed: serde_json::Value = serde_json::from_str(stdout.trim())
            .map_err(|e| format!("Bad ingest JSON: {}", e))?;
        if let Some(err) = parsed.get("error").and_then(|v| v.as_str()) {
            return Err(format!("Ingest error: {}", err));
        }
        total.files_seen += parsed["files_seen"].as_u64().unwrap_or(0) as u32;
        total.chunks_indexed += parsed["chunks_indexed"].as_u64().unwrap_or(0) as u32;
        if let Some(skipped) = parsed["skipped"].as_array() {
            for s in skipped {
                if let Some(s) = s.as_str() {
                    total.skipped.push(s.into());
                }
            }
        }
    }
    Ok(total)
}

#[derive(serde::Serialize)]
struct KnowledgeStats {
    total_chunks: u32,
    documents: Vec<DocumentInfo>,
}

#[derive(serde::Serialize)]
struct DocumentInfo {
    source: String,
    chunks: u32,
}

#[tauri::command]
async fn get_knowledge_stats() -> Result<KnowledgeStats, String> {
    let (stdout, stderr, ok) = lens::run_lens_command(&["stats", "--json"])?;
    if !ok {
        return Err(format!("Stats failed: {}", stderr));
    }
    let parsed: serde_json::Value = serde_json::from_str(stdout.trim())
        .map_err(|e| format!("Bad stats JSON: {}", e))?;
    if let Some(err) = parsed.get("error").and_then(|v| v.as_str()) {
        return Err(err.to_string());
    }
    let documents: Vec<DocumentInfo> = parsed["documents"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|d| {
                    Some(DocumentInfo {
                        source: d.get("source")?.as_str()?.into(),
                        chunks: d.get("chunks")?.as_u64()? as u32,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(KnowledgeStats {
        total_chunks: parsed["total_chunks"].as_u64().unwrap_or(0) as u32,
        documents,
    })
}

#[tauri::command]
async fn delete_document(source: String) -> Result<u32, String> {
    let (stdout, stderr, ok) = lens::run_lens_command(&["delete", "--json", &source])?;
    if !ok {
        return Err(format!("Delete failed: {}", stderr));
    }
    let parsed: serde_json::Value = serde_json::from_str(stdout.trim())
        .map_err(|e| format!("Bad delete JSON: {}", e))?;
    Ok(parsed["deleted_chunks"].as_u64().unwrap_or(0) as u32)
}

// ── Setup commands ─────────────────────────────────────────────────

#[tauri::command]
fn get_setup_status(setup: tauri::State<'_, SetupManager>) -> SetupStatus {
    setup.status()
}

#[tauri::command]
async fn run_setup(setup: tauri::State<'_, SetupManager>) -> Result<(), String> {
    setup.run_setup().await
}

#[tauri::command]
fn reset_setup(setup: tauri::State<'_, SetupManager>) -> Result<(), String> {
    setup.reset()
}

// ── Auto-updater commands ──────────────────────────────────────────

#[derive(serde::Serialize)]
struct UpdateInfo {
    available: bool,
    current_version: String,
    new_version: Option<String>,
    notes: Option<String>,
    date: Option<String>,
}

#[tauri::command]
async fn check_for_update(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();
    let updater = app
        .updater()
        .map_err(|e| format!("Updater unavailable: {}", e))?;
    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateInfo {
            available: true,
            current_version,
            new_version: Some(update.version.clone()),
            notes: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
        }),
        Ok(None) => Ok(UpdateInfo {
            available: false,
            current_version,
            new_version: None,
            notes: None,
            date: None,
        }),
        Err(e) => Err(format!("Update check failed: {}", e)),
    }
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|e| format!("Updater unavailable: {}", e))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Update check failed: {}", e))?
        .ok_or("No update available")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Update install failed: {}", e))?;
    app.restart();
}

// ── Main ───────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(LensManager::new())
        .manage(SetupManager::new())
        .invoke_handler(tauri::generate_handler![
            // Lens sidecar
            get_lens_status,
            start_lens,
            stop_lens,
            configure_lens,
            // GPU detection
            detect_gpu,
            detect_all_gpus,
            // First-run setup
            get_setup_status,
            run_setup,
            reset_setup,
            // Knowledge base
            get_lens_config,
            ingest_documents,
            get_knowledge_stats,
            delete_document,
            // Auto-updater
            check_for_update,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running getbased");
}

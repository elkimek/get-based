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
            // Auto-updater
            check_for_update,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running getbased");
}

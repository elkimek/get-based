//! First-run setup manager — downloads everything Lens needs locally.
//!
//! Pipeline:
//!   1. Download Python standalone (cpython) if not present
//!   2. Create venv + install getbased-lens package
//!   3. Download ONNX Runtime with the right GPU provider
//!   4. Download BGE-M3 ONNX model
//!   5. Ready — Lens sidecar can start

use crate::gpu::{self, GpuInfo, OnnxProvider};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

// ── Paths ──────────────────────────────────────────────────────────

fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("getbased")
}

fn lens_dir() -> PathBuf {
    data_dir().join("lens")
}

fn python_dir() -> PathBuf {
    lens_dir().join("python")
}

fn models_dir() -> PathBuf {
    lens_dir().join("models")
}

pub fn venv_dir() -> PathBuf {
    lens_dir().join("venv")
}

fn setup_marker() -> PathBuf {
    lens_dir().join(".setup-complete")
}

// ── Setup State ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum SetupPhase {
    NotStarted,
    DetectingGpu,
    DownloadingPython { url: String, progress: f32 },
    InstallingLens { progress: f32 },
    DownloadingOnnxRuntime { provider: String, progress: f32 },
    DownloadingModel { name: String, progress: f32 },
    Completed,
    Failed { error: String },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SetupStatus {
    pub phase: SetupPhase,
    pub gpu: GpuInfo,
    pub is_first_run: bool,
    pub lens_binary: Option<String>,
}

// ── Setup Manager ──────────────────────────────────────────────────

pub struct SetupManager {
    phase: Mutex<SetupPhase>,
    gpu: Mutex<GpuInfo>,
    http: Client,
}

impl SetupManager {
    pub fn new() -> Self {
        Self {
            phase: Mutex::new(SetupPhase::NotStarted),
            gpu: Mutex::new(GpuInfo::default()),
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(600))
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    /// Has setup already been completed?
    pub fn is_setup_complete(&self) -> bool {
        setup_marker().exists()
    }

    /// Get the path to the Lens binary (if setup is complete).
    pub fn lens_binary_path(&self) -> Option<PathBuf> {
        if !self.is_setup_complete() {
            return None;
        }
        let venv = venv_dir();
        let bin = if cfg!(target_os = "windows") {
            venv.join("Scripts").join("lens.exe")
        } else {
            venv.join("bin").join("lens")
        };
        if bin.exists() {
            return Some(bin);
        }
        None
    }

    /// Get current setup status.
    pub fn status(&self) -> SetupStatus {
        let phase = self.phase.lock().unwrap().clone();
        let gpu = self.gpu.lock().unwrap().clone();
        SetupStatus {
            phase,
            gpu,
            is_first_run: !self.is_setup_complete(),
            lens_binary: self.lens_binary_path().map(|p| p.to_string_lossy().into_owned()),
        }
    }

    /// Reset setup state (delete downloaded files so setup runs again next time).
    pub fn reset(&self) -> Result<(), String> {
        let marker = setup_marker();
        if marker.exists() {
            fs::remove_file(&marker).map_err(|e| format!("Failed to remove setup marker: {}", e))?;
        }
        *self.phase.lock().unwrap() = SetupPhase::NotStarted;
        log::info!("Setup reset — will re-run on next launch");
        Ok(())
    }

    /// Run the full setup pipeline.
    pub async fn run_setup(&self) -> Result<(), String> {
        // Prevent double-run
        if self.is_setup_complete() {
            self.set_phase(SetupPhase::Completed);
            return Ok(());
        }

        // Ensure data directories exist
        fs::create_dir_all(lens_dir()).map_err(|e| format!("Failed to create lens dir: {}", e))?;
        fs::create_dir_all(models_dir())
            .map_err(|e| format!("Failed to create models dir: {}", e))?;

        // Phase 1: GPU detection
        self.set_phase(SetupPhase::DetectingGpu);
        let gpu_info = gpu::detect_gpu();
        *self.gpu.lock().unwrap() = gpu_info.clone();

        // Phase 2: Download Python standalone
        let python_url = python_standalone_url()?;
        self.set_phase(SetupPhase::DownloadingPython {
            url: python_url.clone(),
            progress: 0.0,
        });
        let python_bin = self.download_python().await?;

        // Phase 3: Install Lens in venv
        self.set_phase(SetupPhase::InstallingLens { progress: 0.0 });
        self.install_lens(&python_bin).await?;

        // Phase 4: Download ONNX Runtime provider
        let provider = gpu_info.recommended_provider;
        self.set_phase(SetupPhase::DownloadingOnnxRuntime {
            provider: provider.to_string(),
            progress: 0.0,
        });
        self.install_onnx_runtime(&python_bin, &provider).await?;

        // Phase 5: Download model
        self.set_phase(SetupPhase::DownloadingModel {
            name: "BAAI/bge-m3".into(),
            progress: 0.0,
        });
        self.download_model(&python_bin).await?;

        // Done
        fs::write(setup_marker(), timestamp())
            .map_err(|e| format!("Failed to write setup marker: {}", e))?;
        self.set_phase(SetupPhase::Completed);

        Ok(())
    }

    fn set_phase(&self, phase: SetupPhase) {
        *self.phase.lock().unwrap() = phase;
    }
}

// ── Python Download ────────────────────────────────────────────────

impl SetupManager {
    /// Download a standalone Python build from python-build-standalone.
    async fn download_python(&self) -> Result<PathBuf, String> {
        let target = python_dir();

        let python_bin = if cfg!(target_os = "windows") {
            target.join("python.exe")
        } else {
            target.join("bin").join("python3")
        };

        if python_bin.exists() {
            log::info!("Python already exists at {:?}", python_bin);
            return Ok(python_bin);
        }

        let url = python_standalone_url()?;
        log::info!("Downloading Python from {}", url);

        let archive_bytes = self.download_with_progress(&url, "Python").await?;

        let temp_dir = python_dir().with_extension("tmp");
        extract_tar_zstd(&archive_bytes, &temp_dir)?;

        // python-build-standalone extracts to a subdirectory like
        // cpython-3.11.15+20250415-x86_64-unknown-linux-gnu-pgo+lto-full/
        let inner = fs::read_dir(&temp_dir)
            .map_err(|e| format!("Failed to read extracted dir: {}", e))?
            .next()
            .ok_or("Empty archive")?
            .map_err(|e| e.to_string())?
            .path();

        if target.exists() {
            fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
        }
        fs::rename(&inner, &target).map_err(|e| {
            format!("Failed to move Python to {:?}: {}", target, e)
        })?;

        let _ = fs::remove_dir_all(&temp_dir);

        Ok(python_bin)
    }
}

/// Build the python-build-standalone download URL for the current platform.
fn python_standalone_url() -> Result<String, String> {
    let version = "3.11.15";
    let release = "20250415";

    let (platform_triple, ext) = if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        ("x86_64-unknown-linux-gnu", "tar.zst")
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "aarch64") {
        ("aarch64-unknown-linux-gnu", "tar.zst")
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        ("aarch64-apple-darwin", "tar.gz")
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        ("x86_64-apple-darwin", "tar.gz")
    } else if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
        ("x86_64-pc-windows-msvc-shared-pgo", "zip")
    } else {
        return Err(format!(
            "Unsupported platform: {} {}",
            std::env::consts::OS,
            std::env::consts::ARCH
        ));
    };

    let filename = format!(
        "cpython-{}+{}-{}-pgo+lto-full.{}",
        version, release, platform_triple, ext
    );

    Ok(format!(
        "https://github.com/indygreg/python-build-standalone/releases/download/{}/{}",
        release, filename
    ))
}

// ── Lens Installation ──────────────────────────────────────────────

impl SetupManager {
    async fn install_lens(&self, python_bin: &Path) -> Result<(), String> {
        let venv = venv_dir();
        if venv.join("bin").exists() || venv.join("Scripts").exists() {
            log::info!("Venv already exists at {:?}", venv);
            return Ok(());
        }

        // Create venv
        self.run_and_log(
            python_bin,
            &["-m", "venv", venv.to_str().unwrap_or(".")],
            "Creating virtual environment",
        )?;

        let pip = venv_pip();

        self.run_and_log(&pip, &["install", "--upgrade", "pip"], "Upgrading pip")?;
        self.run_and_log(
            &pip,
            &["install", "getbased-lens[full]"],
            "Installing getbased-lens",
        )?;

        Ok(())
    }

    async fn install_onnx_runtime(
        &self,
        _python_bin: &Path,
        provider: &OnnxProvider,
    ) -> Result<(), String> {
        let pip = venv_pip();

        // GPU-specific packages
        let gpu_pkg = match provider {
            OnnxProvider::Cuda => vec!["onnxruntime-gpu"],
            OnnxProvider::Rocm => vec!["onnxruntime-rocm"], // AMD via PyPI when available
            OnnxProvider::OpenVino => vec!["openvino"],
            OnnxProvider::CoreML => vec!["onnxruntime-coreml"],
            OnnxProvider::Cpu => vec![],
        };

        // Install base onnxruntime
        self.run_and_log(
            &pip,
            &["install", "onnxruntime"],
            "Installing onnxruntime",
        )?;

        // Install GPU provider package(s)
        for pkg in &gpu_pkg {
            self.run_and_log(&pip, &["install", pkg], &format!("Installing {}", pkg))?;
        }

        Ok(())
    }

    async fn download_model(&self, python_bin: &Path) -> Result<(), String> {
        // Use huggingface_hub to download BGE-M3 ONNX files
        let script = r#"
import sys
from huggingface_hub import snapshot_download
path = snapshot_download(
    "BAAI/bge-m3",
    allow_patterns=[
        "*.onnx", "*.onnx_data",
        "config.json", "tokenizer.json",
        "tokenizer_config.json", "special_tokens_map.json",
    ],
    cache_dir=sys.argv[1],
)
print(f"Model downloaded to: {path}")
"#;

        let script_path = models_dir().join("download_model.py");
        fs::write(&script_path, script)
            .map_err(|e| format!("Failed to write download script: {}", e))?;

        self.run_and_log(
            python_bin,
            &[script_path.to_str().unwrap_or(""), models_dir().to_str().unwrap_or("")],
            "Downloading BGE-M3 model",
        )?;

        Ok(())
    }
}

// ── Helpers ────────────────────────────────────────────────────────

impl SetupManager {
    async fn download_with_progress(
        &self,
        url: &str,
        label: &str,
    ) -> Result<Vec<u8>, String> {
        let resp = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Download failed for {}: {}", url, e))?;

        let total = resp.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;
        let mut data = Vec::with_capacity(total as usize);

        let mut stream = resp.bytes_stream();
        use futures_util::StreamExt;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download chunk error: {}", e))?;
            data.extend_from_slice(&chunk);
            downloaded += chunk.len() as u64;

            if total > 0 {
                let progress = downloaded as f32 / total as f32;
                log::info!("{}: {:.1}% ({}/{})", label, progress * 100.0, downloaded, total);
            }
        }

        Ok(data)
    }

    fn run_and_log(
        &self,
        cmd: &Path,
        args: &[&str],
        label: &str,
    ) -> Result<(), String> {
        log::info!("{}: {} {}", label, cmd.display(), args.join(" "));

        let output = std::process::Command::new(cmd)
            .args(args)
            .output()
            .map_err(|e| format!("{} failed: {}", label, e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("{} failed:\n{}", label, stderr));
        }

        Ok(())
    }
}

/// Get the pip binary path for the managed venv.
fn venv_pip() -> PathBuf {
    let venv = venv_dir();
    if cfg!(target_os = "windows") {
        venv.join("Scripts").join("pip.exe")
    } else {
        venv.join("bin").join("pip")
    }
}

/// Extract a .tar.zst archive using system tar.
fn extract_tar_zstd(data: &[u8], target: &Path) -> Result<(), String> {
    let tmp_archive = target.with_extension("tar.zst.tmp");

    fs::write(&tmp_archive, data).map_err(|e| format!("Failed to write archive: {}", e))?;
    fs::create_dir_all(target).map_err(|e| format!("Failed to create target dir: {}", e))?;

    let output = std::process::Command::new("tar")
        .args([
            "--zstd",
            "-xf",
            tmp_archive.to_str().unwrap_or(""),
            "-C",
            target.to_str().unwrap_or(""),
        ])
        .output()
        .map_err(|e| format!("tar extraction failed (is zstd installed?): {}", e))?;

    let _ = fs::remove_file(&tmp_archive);

    if !output.status.success() {
        return Err(format!(
            "tar failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Simple timestamp without heavy deps.
fn timestamp() -> String {
    std::process::Command::new("date")
        .args(["+%Y-%m-%dT%H:%M:%S"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "unknown".into())
}

// ── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_manager_new_starts_not_started() {
        let mgr = SetupManager::new();
        let status = mgr.status();
        assert!(matches!(status.phase, SetupPhase::NotStarted));
    }

    #[test]
    fn paths_are_under_data_dir() {
        assert!(lens_dir().starts_with(data_dir()));
        assert!(python_dir().starts_with(lens_dir()));
        assert!(models_dir().starts_with(lens_dir()));
        assert!(venv_dir().starts_with(lens_dir()));
    }

    #[test]
    fn python_standalone_url_is_valid() {
        let url = python_standalone_url().unwrap();
        assert!(url.contains("python-build-standalone"));
        assert!(url.contains("cpython-3.11"));
    }

    #[test]
    fn setup_phase_serializes() {
        let phase = SetupPhase::DownloadingPython {
            url: "https://example.com/python.tar.zst".into(),
            progress: 0.5,
        };
        let json = serde_json::to_string(&phase).unwrap();
        assert!(json.contains("downloading_python"));
        assert!(json.contains("0.5"));
    }

    #[test]
    fn reset_clears_phase() {
        let mgr = SetupManager::new();
        // Even without a marker file, reset should succeed and set phase
        mgr.reset().unwrap();
        let status = mgr.status();
        assert!(matches!(status.phase, SetupPhase::NotStarted));
    }
}

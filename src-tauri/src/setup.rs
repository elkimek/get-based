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

    /// Run the full setup pipeline. Idempotent — safe to re-run after partial failure.
    /// On any failure, sets phase to Failed with an actionable message and returns Err
    /// (caller can inspect via get_setup_status).
    pub async fn run_setup(&self) -> Result<(), String> {
        // Prevent double-run
        if self.is_setup_complete() {
            self.set_phase(SetupPhase::Completed);
            return Ok(());
        }

        match self.run_setup_inner().await {
            Ok(()) => Ok(()),
            Err(e) => {
                log::error!("Setup failed: {}", e);
                self.set_phase(SetupPhase::Failed { error: e.clone() });
                // Don't wipe partial files — let the user retry, run_setup_inner cleans tmp on entry.
                Err(e)
            }
        }
    }

    async fn run_setup_inner(&self) -> Result<(), String> {
        // Ensure data directories exist
        fs::create_dir_all(lens_dir()).map_err(|e| format!("Failed to create lens dir: {}", e))?;
        fs::create_dir_all(models_dir())
            .map_err(|e| format!("Failed to create models dir: {}", e))?;

        // Disk space precheck — fail loudly with actionable message
        let free_bytes = available_disk_space(&lens_dir()).unwrap_or(u64::MAX);
        const REQUIRED_BYTES: u64 = 4 * 1024 * 1024 * 1024; // 4GB headroom for Python+venv+ONNX+BGE-M3
        if free_bytes < REQUIRED_BYTES {
            let need_gb = REQUIRED_BYTES / 1024 / 1024 / 1024;
            let have_gb = free_bytes / 1024 / 1024 / 1024;
            return Err(format!(
                "Not enough disk space. Need {} GB free, you have {} GB. Free up space and try again.",
                need_gb, have_gb
            ));
        }

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

        // Phase 3: Install Lens in venv (always re-extracts bundled source for upgrades)
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

    /// Update progress within the current phase (called from chunked download loop).
    fn set_progress(&self, progress: f32) {
        let mut phase = self.phase.lock().unwrap();
        match &mut *phase {
            SetupPhase::DownloadingPython { progress: p, .. }
            | SetupPhase::InstallingLens { progress: p, .. }
            | SetupPhase::DownloadingOnnxRuntime { progress: p, .. }
            | SetupPhase::DownloadingModel { progress: p, .. } => {
                *p = progress.clamp(0.0, 1.0);
            }
            _ => {}
        }
    }
}

/// Cross-platform free disk space query for a path. Returns None if unavailable.
fn available_disk_space(path: &Path) -> Option<u64> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    // Find the disk whose mount_point is a prefix of the target path (longest match wins)
    disks
        .iter()
        .filter(|d| path.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len())
        .map(|d| d.available_space())
}

/// Compute SHA256 of bytes and compare against expected hex string (case-insensitive).
fn verify_sha256(data: &[u8], expected_hex: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let actual = hex::encode(Sha256::digest(data));
    if actual.eq_ignore_ascii_case(expected_hex.trim()) {
        Ok(())
    } else {
        Err(format!(
            "SHA256 mismatch: expected {}, got {}",
            expected_hex.trim(),
            actual
        ))
    }
}

impl SetupManager {
    /// Fetch the aggregate SHA256SUMS file from the python-build-standalone release
    /// and pull out the line matching our archive filename. Format:
    ///   `<hex>  <filename>`
    /// (two-space separator per shasum convention)
    async fn fetch_expected_sha256(&self, archive_filename: &str) -> Result<String, String> {
        let sums_url = format!(
            "https://github.com/{}/releases/download/{}/SHA256SUMS",
            PYTHON_REPO, PYTHON_RELEASE
        );
        let resp = self
            .http
            .get(&sums_url)
            .send()
            .await
            .map_err(|e| format!("SHA256SUMS fetch failed: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("SHA256SUMS fetch returned {}", resp.status()));
        }
        let body = resp
            .text()
            .await
            .map_err(|e| format!("SHA256SUMS read failed: {}", e))?;
        for line in body.lines() {
            // Expect: "<64 hex chars>  <filename>"
            let mut parts = line.splitn(2, char::is_whitespace);
            let hex = match parts.next() {
                Some(h) if h.len() == 64 => h,
                _ => continue,
            };
            let rest = parts.next().unwrap_or("").trim();
            if rest == archive_filename {
                return Ok(hex.to_string());
            }
        }
        Err(format!(
            "SHA256SUMS does not contain hash for {}",
            archive_filename
        ))
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

        // Verify SHA256 against the aggregate SHA256SUMS file from the same release.
        // Same trust boundary as the archive (both from GitHub Releases) — protects
        // against TLS-MITM and corrupt downloads, not against a compromised release.
        // For full supply-chain protection, embed a known-good hash at compile time.
        let archive_filename = python_archive_filename()?;
        match self.fetch_expected_sha256(&archive_filename).await {
            Ok(expected) => {
                verify_sha256(&archive_bytes, &expected)?;
                log::info!("Python archive SHA256 verified ({})", expected);
            }
            Err(e) => {
                // Skip-with-warning rather than block install on a transient SHA fetch failure.
                // Log clearly so it shows up in support tickets.
                log::warn!(
                    "SHA256 verification SKIPPED ({}). Archive may be corrupt or tampered.",
                    e
                );
            }
        }

        let format = ArchiveFormat::from_url(&url)?;

        let temp_dir = python_dir().with_extension("tmp");
        // Cleanup any previous failed extraction
        if temp_dir.exists() {
            fs::remove_dir_all(&temp_dir).map_err(|e| format!("Failed to clean tmp dir: {}", e))?;
        }
        extract_archive(&archive_bytes, &temp_dir, format)?;

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

// python-build-standalone moved from indygreg → astral-sh in 2025.
// Bump RELEASE here as new versions drop; SHA256SUMS verification ensures
// we don't pick up a tampered-with archive.
const PYTHON_VERSION: &str = "3.11.15";
const PYTHON_RELEASE: &str = "20260414";
const PYTHON_REPO: &str = "astral-sh/python-build-standalone";

/// Build the python-build-standalone download URL for the current platform.
/// Uses `install_only` archives (~50 MB tar.gz, simple `python/bin/python3` layout).
fn python_standalone_url() -> Result<String, String> {
    let filename = python_archive_filename()?;
    Ok(format!(
        "https://github.com/{}/releases/download/{}/{}",
        PYTHON_REPO, PYTHON_RELEASE, filename
    ))
}

fn python_archive_filename() -> Result<String, String> {
    let triple = python_target_triple()?;
    Ok(format!(
        "cpython-{}+{}-{}-install_only.tar.gz",
        PYTHON_VERSION, PYTHON_RELEASE, triple
    ))
}

fn python_target_triple() -> Result<&'static str, String> {
    if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        Ok("x86_64-unknown-linux-gnu")
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "aarch64") {
        Ok("aarch64-unknown-linux-gnu")
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        Ok("aarch64-apple-darwin")
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        Ok("x86_64-apple-darwin")
    } else if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
        Ok("x86_64-pc-windows-msvc")
    } else if cfg!(target_os = "windows") && cfg!(target_arch = "aarch64") {
        Ok("aarch64-pc-windows-msvc")
    } else {
        Err(format!(
            "Unsupported platform: {} {}",
            std::env::consts::OS,
            std::env::consts::ARCH
        ))
    }
}

// ── Lens Installation ──────────────────────────────────────────────

fn lens_source_dir() -> PathBuf {
    lens_dir().join("lens-source")
}

impl SetupManager {
    async fn install_lens(&self, python_bin: &Path) -> Result<(), String> {
        let venv = venv_dir();

        // Always re-extract the bundled lens/ source — ensures upgrades pick up code changes
        let source_dir = lens_source_dir();
        crate::lens_source::extract_to(&source_dir)?;
        log::info!(
            "Bundled lens version: {} (source at {:?})",
            crate::lens_source::embedded_version(),
            source_dir
        );

        // Create venv if missing (idempotent — pip install below handles upgrades)
        if !venv.join("bin").exists() && !venv.join("Scripts").exists() {
            self.run_and_log(
                python_bin,
                &["-m", "venv", venv.to_str().unwrap_or(".")],
                "Creating virtual environment",
            )?;
        } else {
            log::info!("Venv exists at {:?}, skipping create", venv);
        }

        let pip = venv_pip();

        self.run_and_log(&pip, &["install", "--upgrade", "pip"], "Upgrading pip")?;
        // Install the bundled lens source (with the [full] extras for ONNX + PDF + DOCX)
        let source_arg = format!(
            "{}[full]",
            source_dir.to_str().ok_or("Lens source path is not valid UTF-8")?
        );
        self.run_and_log(
            &pip,
            &["install", "--upgrade", &source_arg],
            "Installing getbased-lens (bundled)",
        )?;

        Ok(())
    }

    async fn install_onnx_runtime(
        &self,
        _python_bin: &Path,
        provider: &OnnxProvider,
    ) -> Result<(), String> {
        let pip = venv_pip();

        // Pick the right pip package per provider. CoreML support ships in base
        // `onnxruntime` on macOS — no separate package. Other providers need
        // their own package (mutually exclusive with the CPU `onnxruntime`).
        // Source: https://onnxruntime.ai/docs/install/
        let packages: Vec<&str> = match provider {
            OnnxProvider::Cuda => vec!["onnxruntime-gpu"],
            OnnxProvider::DirectML => vec!["onnxruntime-directml"],
            OnnxProvider::OpenVino => vec!["onnxruntime-openvino"],
            OnnxProvider::CoreML => vec!["onnxruntime"], // CoreML EP bundled on macOS
            OnnxProvider::Rocm => {
                // ROCm wheels for ONNX Runtime are not on PyPI as `onnxruntime-rocm`.
                // AMD ships them at https://repo.radeon.com/rocm/manylinux/ — out of scope
                // for first-run auto-install. Fall back to CPU + log a hint.
                log::warn!(
                    "ROCm provider requested but no PyPI package available. \
                    Falling back to onnxruntime (CPU). To enable ROCm acceleration, \
                    install AMD's ONNX Runtime wheels manually."
                );
                vec!["onnxruntime"]
            }
            OnnxProvider::Cpu => vec!["onnxruntime"],
        };

        for pkg in packages {
            self.run_and_log(&pip, &["install", "--upgrade", pkg], &format!("Installing {}", pkg))?;
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
                self.set_progress(progress);
                // Throttle log output — every ~5%
                if (downloaded as f32 / total as f32 * 20.0) as u64
                    != ((downloaded - chunk.len() as u64) as f32 / total as f32 * 20.0) as u64
                {
                    log::info!("{}: {:.0}% ({}/{})", label, progress * 100.0, downloaded, total);
                }
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

/// Extract an archive using pure-Rust crates — no system `tar` or external binaries.
/// Format inferred from the URL/extension at the call site.
fn extract_archive(data: &[u8], target: &Path, format: ArchiveFormat) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|e| format!("Failed to create target dir: {}", e))?;
    match format {
        ArchiveFormat::TarZst => extract_tar_zst_native(data, target),
        ArchiveFormat::TarGz => extract_tar_gz_native(data, target),
        ArchiveFormat::Zip => extract_zip_native(data, target),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveFormat {
    TarZst,
    TarGz,
    Zip,
}

impl ArchiveFormat {
    fn from_url(url: &str) -> Result<Self, String> {
        if url.ends_with(".tar.zst") || url.ends_with(".tzst") {
            Ok(Self::TarZst)
        } else if url.ends_with(".tar.gz") || url.ends_with(".tgz") {
            Ok(Self::TarGz)
        } else if url.ends_with(".zip") {
            Ok(Self::Zip)
        } else {
            Err(format!("Unsupported archive format for URL: {}", url))
        }
    }
}

fn extract_tar_zst_native(data: &[u8], target: &Path) -> Result<(), String> {
    let cursor = std::io::Cursor::new(data);
    let decoder = zstd::stream::read::Decoder::new(cursor)
        .map_err(|e| format!("zstd decoder init failed: {}", e))?;
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(target)
        .map_err(|e| format!("tar.zst unpack failed: {}", e))
}

fn extract_tar_gz_native(data: &[u8], target: &Path) -> Result<(), String> {
    let cursor = std::io::Cursor::new(data);
    let decoder = flate2::read::GzDecoder::new(cursor);
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(target)
        .map_err(|e| format!("tar.gz unpack failed: {}", e))
}

fn extract_zip_native(data: &[u8], target: &Path) -> Result<(), String> {
    let cursor = std::io::Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("zip open failed: {}", e))?;
    archive
        .extract(target)
        .map_err(|e| format!("zip extract failed: {}", e))
}

/// ISO-8601-ish timestamp without external deps. Returns unix seconds as a string.
fn timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}", secs)
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
    fn verify_sha256_matches() {
        // SHA256 of "hello\n" = "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03"
        let data = b"hello\n";
        let expected = "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03";
        assert!(verify_sha256(data, expected).is_ok());
    }

    #[test]
    fn verify_sha256_case_insensitive() {
        let data = b"hello\n";
        let expected_upper = "5891B5B522D5DF086D0FF0B110FBD9D21BB4FC7163AF34D08286A2E846F6BE03";
        assert!(verify_sha256(data, expected_upper).is_ok());
    }

    #[test]
    fn verify_sha256_rejects_mismatch() {
        let data = b"hello\n";
        let wrong = "0000000000000000000000000000000000000000000000000000000000000000";
        assert!(verify_sha256(data, wrong).is_err());
    }

    /// End-to-end network test — actually downloads the Python archive,
    /// verifies SHA256 from the aggregate SHA256SUMS, extracts it, and confirms
    /// the expected python_bin path exists.
    /// Marked #[ignore] so it doesn't run on every `cargo test` (slow, network-dependent).
    /// Run explicitly: cargo test --release -- --ignored test_real_python_download
    #[tokio::test]
    #[ignore]
    async fn test_real_python_download() {
        use std::time::Instant;

        let mgr = SetupManager::new();
        let url = python_standalone_url().expect("URL builds");
        eprintln!("Downloading: {}", url);
        let start = Instant::now();

        // 1. Download
        let bytes = mgr
            .download_with_progress(&url, "Python")
            .await
            .expect("download succeeds");
        eprintln!(
            "Downloaded {} bytes in {:?}",
            bytes.len(),
            start.elapsed()
        );
        assert!(bytes.len() > 1_000_000, "archive should be > 1 MB");

        // 2. SHA256 verify
        let archive_filename = python_archive_filename().unwrap();
        let expected_hash = mgr
            .fetch_expected_sha256(&archive_filename)
            .await
            .expect("SHA256SUMS fetch + match works");
        assert_eq!(expected_hash.len(), 64, "hash should be 64 hex chars");
        verify_sha256(&bytes, &expected_hash).expect("hash verification passes");
        eprintln!("SHA256 verified: {}", expected_hash);

        // 3. Extract to a temp dir
        let temp = std::env::temp_dir().join(format!("getbased-test-{}", std::process::id()));
        if temp.exists() {
            fs::remove_dir_all(&temp).ok();
        }
        extract_archive(&bytes, &temp, ArchiveFormat::TarGz).expect("extracts cleanly");

        // 4. Confirm install_only layout: temp/python/bin/python3 exists
        let python_bin = if cfg!(target_os = "windows") {
            temp.join("python").join("python.exe")
        } else {
            temp.join("python").join("bin").join("python3")
        };
        assert!(
            python_bin.exists(),
            "expected python_bin at {:?} but it doesn't exist. Layout was wrong.",
            python_bin
        );
        eprintln!("python_bin confirmed at: {:?}", python_bin);

        // 5. Run python --version to verify it works
        let out = std::process::Command::new(&python_bin)
            .arg("--version")
            .output()
            .expect("python_bin runs");
        let ver = String::from_utf8_lossy(&out.stdout).to_string()
            + &String::from_utf8_lossy(&out.stderr);
        assert!(ver.contains("Python 3"), "got: {}", ver);
        eprintln!("python reports: {}", ver.trim());

        // Cleanup
        fs::remove_dir_all(&temp).ok();
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

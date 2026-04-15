//! GPU detection — probes hardware, driver, and compute runtime availability.
//!
//! Supports: NVIDIA (CUDA), AMD (ROCm), Intel (OpenVINO), Apple (CoreML/Metal).
//! Returns the best available ONNX Runtime provider for the detected hardware.

use serde::{Deserialize, Serialize};
use std::process::Command as StdCommand;


// ── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
    Apple,
    Unknown,
}

impl std::fmt::Display for GpuVendor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Nvidia => write!(f, "nvidia"),
            Self::Amd => write!(f, "amd"),
            Self::Intel => write!(f, "intel"),
            Self::Apple => write!(f, "apple"),
            Self::Unknown => write!(f, "unknown"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OnnxProvider {
    Cuda,
    Rocm,
    OpenVino,
    CoreML,
    Cpu,
}

impl std::fmt::Display for OnnxProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Cuda => write!(f, "cuda"),
            Self::Rocm => write!(f, "rocm"),
            Self::OpenVino => write!(f, "openvino"),
            Self::CoreML => write!(f, "coreml"),
            Self::Cpu => write!(f, "cpu"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub vendor: GpuVendor,
    pub name: String,
    pub driver_version: Option<String>,
    pub vram_mb: Option<u64>,
    pub architecture: Option<String>,
    pub recommended_provider: OnnxProvider,
    /// Whether the compute runtime (CUDA, ROCm, etc.) is installed and working.
    pub runtime_installed: bool,
    /// Human-readable summary for UI display.
    pub summary: String,
}

impl Default for GpuInfo {
    fn default() -> Self {
        Self {
            vendor: GpuVendor::Unknown,
            name: "No GPU detected".into(),
            driver_version: None,
            vram_mb: None,
            architecture: None,
            recommended_provider: OnnxProvider::Cpu,
            runtime_installed: false,
            summary: "No dedicated GPU found. CPU inference will be used.".into(),
        }
    }
}

// ── Detection ──────────────────────────────────────────────────────

/// Probe the system for GPUs and return info about the best one for ML inference.
pub fn detect_gpu() -> GpuInfo {
    // Try each vendor in order of preference (fastest inference first)
    if let Some(info) = detect_nvidia() {
        return info;
    }
    if let Some(info) = detect_amd() {
        return info;
    }
    if let Some(info) = detect_intel() {
        return info;
    }
    if cfg!(target_os = "macos") {
        if let Some(info) = detect_apple() {
            return info;
        }
    }

    GpuInfo::default()
}

/// Detect all available GPUs (not just the best one).
pub fn detect_all() -> Vec<GpuInfo> {
    let mut gpus = Vec::new();

    if let Some(info) = detect_nvidia() {
        gpus.push(info);
    }
    if let Some(info) = detect_amd() {
        gpus.push(info);
    }
    if let Some(info) = detect_intel() {
        gpus.push(info);
    }
    if cfg!(target_os = "macos") {
        if let Some(info) = detect_apple() {
            gpus.push(info);
        }
    }

    if gpus.is_empty() {
        gpus.push(GpuInfo::default());
    }

    gpus
}

// ── NVIDIA ─────────────────────────────────────────────────────────

fn detect_nvidia() -> Option<GpuInfo> {
    let output = StdCommand::new("nvidia-smi")
        .args([
            "--query-gpu=name,driver_version,memory.total,compute_cap",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.lines().next()?.trim();

    // Parse: "NVIDIA GeForce RTX 5090, 570.0, 32768, 10.0"
    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    if parts.len() < 2 {
        return None;
    }

    let name = parts[0].to_string();
    let driver_version = Some(parts[1].to_string());
    let vram_mb = parts.get(2).and_then(|v| v.parse::<u64>().ok());
    let compute_cap = parts.get(3).map(|s| s.to_string());
    let architecture = compute_cap.as_deref().map(|cc| nvidia_arch_from_compute_cap(cc));

    let runtime_installed = true; // nvidia-smi working means CUDA driver is present

    let summary = format!(
        "{} ({}), {} MB VRAM, driver {}{}",
        name,
        architecture.as_deref().unwrap_or("unknown arch"),
        vram_mb.unwrap_or(0),
        driver_version.as_deref().unwrap_or("?"),
        if runtime_installed { ", CUDA ready" } else { "" },
    );

    Some(GpuInfo {
        vendor: GpuVendor::Nvidia,
        name,
        driver_version,
        vram_mb,
        architecture,
        recommended_provider: OnnxProvider::Cuda,
        runtime_installed,
        summary,
    })
}

/// Map NVIDIA compute capability to architecture codename.
fn nvidia_arch_from_compute_cap(cc: &str) -> String {
    // Major version mapping
    match cc.split('.').next().unwrap_or("") {
        "12" => "Blackwell".into(),
        "10" => "Hopper".into(),
        "9" => "Ada Lovelace / Hopper".into(),
        "8" => "Ampere".into(),
        "7" => "Turing / Volta".into(),
        "6" => "Pascal".into(),
        _ => format!("Compute {}", cc),
    }
}

// ── AMD ────────────────────────────────────────────────────────────

fn detect_amd() -> Option<GpuInfo> {
    // Try rocm-smi first (most reliable for RDNA3+)
    if let Some(info) = detect_amd_rocm() {
        return Some(info);
    }

    // Fallback: parse lspci for AMD GPUs
    detect_amd_lspci()
}

fn detect_amd_rocm() -> Option<GpuInfo> {
    let output = StdCommand::new("rocm-smi")
        .args(["--showproductname", "--showmeminfo", "vram"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse GPU name from rocm-smi output
    let name = stdout
        .lines()
        .find(|l| l.contains("Card series:") || l.contains("GPU id:"))
        .map(|l| {
            l.split(':')
                .last()
                .unwrap_or("AMD GPU")
                .trim()
                .to_string()
        })
        .unwrap_or_else(|| "AMD GPU".into());

    // Try to get VRAM
    let vram_mb = stdout
        .lines()
        .find(|l| l.contains("Total VRAM") || l.contains("VRAM"))
        .and_then(|l| {
            l.split_whitespace()
                .find_map(|w| w.parse::<u64>().ok())
        });

    let runtime_installed = true; // rocm-smi working means ROCm is installed

    let architecture = amd_arch_from_name(&name);

    let summary = format!(
        "{}{}{}, ROCm{}",
        name,
        if let Some(ref arch) = architecture {
            format!(" ({})", arch)
        } else {
            String::new()
        },
        if let Some(vram) = vram_mb {
            format!(", {} MB VRAM", vram)
        } else {
            String::new()
        },
        if runtime_installed {
            " installed"
        } else {
            " not found"
        },
    );

    Some(GpuInfo {
        vendor: GpuVendor::Amd,
        name,
        driver_version: None, // ROCm doesn't expose a single version easily
        vram_mb,
        architecture,
        recommended_provider: OnnxProvider::Rocm,
        runtime_installed,
        summary,
    })
}

fn detect_amd_lspci() -> Option<GpuInfo> {
    let output = StdCommand::new("lspci")
        .arg("-mm")
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let line = stdout
        .lines()
        .find(|l| l.to_lowercase().contains("vga") || l.to_lowercase().contains("display") || l.to_lowercase().contains("3d"))
        .filter(|l| {
            let lower = l.to_lowercase();
            lower.contains("amd") || lower.contains("ati") || lower.contains("radeon") || lower.contains("advanced micro")
        })?;

    // Extract device name from lspci -mm output
    let name = line.split('"').nth(3).unwrap_or("AMD GPU").to_string();
    let architecture = amd_arch_from_name(&name);

    Some(GpuInfo {
        vendor: GpuVendor::Amd,
        name: name.clone(),
        driver_version: None,
        vram_mb: None,
        architecture,
        recommended_provider: OnnxProvider::Rocm,
        runtime_installed: false, // No ROCm detected via rocm-smi
        summary: format!("{} detected via PCI. ROCm runtime not installed — CPU fallback.", name),
    })
}

/// Guess AMD architecture from GPU name.
fn amd_arch_from_name(name: &str) -> Option<String> {
    let lower = name.to_lowercase();
    if lower.contains("rx 907") || lower.contains("rdna4") {
        Some("RDNA 4".into())
    } else if lower.contains("rx 7") || lower.contains("rx 8") || lower.contains("rdna3") {
        Some("RDNA 3".into())
    } else if lower.contains("rx 6") || lower.contains("rdna2") {
        Some("RDNA 2".into())
    } else if lower.contains("rx 5") || lower.contains("rx 5000") || lower.contains("rdna") {
        Some("RDNA 1".into())
    } else if lower.contains("mi300") || lower.contains("mi250") || lower.contains("cdna") {
        Some("CDNA".into())
    } else {
        None
    }
}

// ── Intel ──────────────────────────────────────────────────────────

fn detect_intel() -> Option<GpuInfo> {
    let output = StdCommand::new("lspci").arg("-mm").output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);

    let line = stdout.lines().find(|l| {
        let lower = l.to_lowercase();
        (lower.contains("vga") || lower.contains("display") || lower.contains("3d"))
            && (lower.contains("intel") || lower.contains("arc"))
    })?;

    let name = line.split('"').nth(3).unwrap_or("Intel GPU").to_string();
    let architecture = intel_arch_from_name(&name);

    // Check if OpenVINO runtime is available
    let runtime_installed = StdCommand::new("python3")
        .args(["-c", "import openvino; print(openvino.__version__)"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let summary = format!(
        "{}{}{}",
        name,
        if let Some(ref arch) = architecture {
            format!(" ({})", arch)
        } else {
            String::new()
        },
        if runtime_installed {
            ", OpenVINO ready".to_string()
        } else {
            ", OpenVINO not installed — CPU fallback".to_string()
        },
    );

    Some(GpuInfo {
        vendor: GpuVendor::Intel,
        name: name.clone(),
        driver_version: None,
        vram_mb: None, // Intel Arc VRAM varies; detect via sysfs on Linux
        architecture,
        recommended_provider: OnnxProvider::OpenVino,
        runtime_installed,
        summary,
    })
}

fn intel_arch_from_name(name: &str) -> Option<String> {
    let lower = name.to_lowercase();
    if lower.contains("battlemage") || lower.contains("arc b") {
        Some("Battlemage".into())
    } else if lower.contains("alchemist") || lower.contains("arc a") || lower.contains("arc 7") || lower.contains("arc 5") || lower.contains("arc 3") {
        Some("Alchemist".into())
    } else if lower.contains("celestial") {
        Some("Celestial".into())
    } else if lower.contains("xe") {
        Some("Xe".into())
    } else {
        None
    }
}

// ── Apple ──────────────────────────────────────────────────────────

fn detect_apple() -> Option<GpuInfo> {
    // macOS only — check for Apple Silicon
    let output = StdCommand::new("sysctl")
        .args(["-n", "hw.optional.arm64"])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout != "1" {
        return None;
    }

    // Get chip name
    let chip_output = StdCommand::new("sysctl")
        .args(["-n", "machdep.cpu.brand_string"])
        .output()
        .ok();

    let name = chip_output
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "Apple Silicon".into());

    // Get memory (unified on Apple Silicon)
    let mem_output = StdCommand::new("sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .ok();

    let vram_mb = mem_output.and_then(|o| {
        let s = String::from_utf8_lossy(&o.stdout).trim().parse::<u64>().ok();
        s.map(|bytes| bytes / 1024 / 1024) // total RAM, shared with GPU
    });

    let architecture = apple_arch_from_name(&name);

    Some(GpuInfo {
        vendor: GpuVendor::Apple,
        name: name.clone(),
        driver_version: None,
        vram_mb,
        architecture,
        recommended_provider: OnnxProvider::CoreML,
        runtime_installed: true, // CoreML is always available on Apple Silicon
        summary: format!("{} — CoreML acceleration built-in", name),
    })
}

fn apple_arch_from_name(name: &str) -> Option<String> {
    let lower = name.to_lowercase();
    if lower.contains("m4") {
        Some("M4".into())
    } else if lower.contains("m3") {
        Some("M3".into())
    } else if lower.contains("m2") {
        Some("M2".into())
    } else if lower.contains("m1") {
        Some("M1".into())
    } else {
        None
    }
}

// ── Tests ──────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nvidia_arch_mapping() {
        assert_eq!(nvidia_arch_from_compute_cap("12.0"), "Blackwell");
        assert_eq!(nvidia_arch_from_compute_cap("10.0"), "Hopper");
        assert_eq!(nvidia_arch_from_compute_cap("9.0"), "Ada Lovelace / Hopper");
        assert_eq!(nvidia_arch_from_compute_cap("8.6"), "Ampere");
        assert_eq!(nvidia_arch_from_compute_cap("7.5"), "Turing / Volta");
    }

    #[test]
    fn amd_arch_from_name_mapping() {
        assert_eq!(amd_arch_from_name("AMD Radeon RX 9070 XT"), Some("RDNA 4".into()));
        assert_eq!(amd_arch_from_name("AMD Radeon RX 7900 XTX"), Some("RDNA 3".into()));
        assert_eq!(amd_arch_from_name("AMD Radeon RX 6800 XT"), Some("RDNA 2".into()));
    }

    #[test]
    fn intel_arch_from_name_mapping() {
        assert_eq!(intel_arch_from_name("Intel Arc B580"), Some("Battlemage".into()));
        assert_eq!(intel_arch_from_name("Intel Arc A770"), Some("Alchemist".into()));
    }

    #[test]
    fn apple_arch_from_name_mapping() {
        assert_eq!(apple_arch_from_name("Apple M4 Pro"), Some("M4".into()));
        assert_eq!(apple_arch_from_name("Apple M3 Max"), Some("M3".into()));
    }

    #[test]
    fn default_is_cpu_fallback() {
        let info = GpuInfo::default();
        assert_eq!(info.vendor, GpuVendor::Unknown);
        assert_eq!(info.recommended_provider, OnnxProvider::Cpu);
        assert!(!info.runtime_installed);
    }

    #[test]
    fn detect_runs_without_crash() {
        // On a VM with no GPU, should return CPU fallback
        let info = detect_gpu();
        // Don't assert specific vendor since test env varies
        assert!(!info.name.is_empty());
    }

    #[test]
    fn detect_all_returns_at_least_one() {
        let gpus = detect_all();
        assert!(!gpus.is_empty());
    }

    #[test]
    fn gpu_info_serializes() {
        let info = GpuInfo::default();
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("cpu"));
        assert!(json.contains("unknown"));
    }
}

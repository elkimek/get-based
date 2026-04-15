//! GPU detection — probes hardware, driver, and compute runtime availability.
//!
//! Cross-platform strategy:
//!   - Linux: nvidia-smi (NVIDIA), rocm-smi (AMD), lspci (AMD/Intel fallback)
//!   - macOS: sysctl (Apple Silicon), system_profiler -json (Intel Mac discrete GPUs/eGPU)
//!   - Windows: nvidia-smi (NVIDIA), WMI Win32_VideoController (AMD/Intel),
//!              DirectML provider (works for any DirectX 12 capable GPU)
//!
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OnnxProvider {
    Cuda,
    Rocm,
    OpenVino,
    CoreML,
    DirectML,
    Cpu,
}

impl std::fmt::Display for OnnxProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Cuda => write!(f, "cuda"),
            Self::Rocm => write!(f, "rocm"),
            Self::OpenVino => write!(f, "openvino"),
            Self::CoreML => write!(f, "coreml"),
            Self::DirectML => write!(f, "directml"),
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

// ── Public API ─────────────────────────────────────────────────────

/// Probe the system for GPUs and return info about the best one for ML inference.
pub fn detect_gpu() -> GpuInfo {
    detect_all().into_iter().next().unwrap_or_default()
}

/// Detect all available GPUs, sorted best-first (NVIDIA → AMD → Intel → Apple → CPU).
pub fn detect_all() -> Vec<GpuInfo> {
    let mut gpus = Vec::new();

    // NVIDIA works the same on Linux + Windows via nvidia-smi
    if let Some(info) = detect_nvidia() {
        gpus.push(info);
    }

    // Platform-specific paths for AMD/Intel/Apple
    #[cfg(target_os = "windows")]
    {
        gpus.extend(detect_windows_non_nvidia());
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(info) = detect_apple() {
            gpus.push(info);
        }
        gpus.extend(detect_macos_discrete());
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(info) = detect_amd_linux() {
            gpus.push(info);
        }
        if let Some(info) = detect_intel_linux() {
            gpus.push(info);
        }
    }

    if gpus.is_empty() {
        gpus.push(GpuInfo::default());
    }

    gpus
}

// ── NVIDIA (cross-platform via nvidia-smi) ─────────────────────────

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
    // Pick the GPU with most VRAM if multiple
    let best = stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.trim().split(',').map(|s| s.trim()).collect();
            if parts.len() < 2 || parts[0].is_empty() {
                return None;
            }
            let vram = parts.get(2).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
            Some((parts.into_iter().map(String::from).collect::<Vec<_>>(), vram))
        })
        .max_by_key(|(_, vram)| *vram)?
        .0;

    let name = best[0].clone();
    let driver_version = Some(best[1].clone());
    let vram_mb = best.get(2).and_then(|v| v.parse::<u64>().ok());
    let compute_cap = best.get(3).cloned();
    let architecture = compute_cap.as_deref().map(nvidia_arch_from_compute_cap);

    let summary = format!(
        "{}{}{}, driver {}, CUDA ready",
        name,
        architecture
            .as_deref()
            .map(|a| format!(" ({})", a))
            .unwrap_or_default(),
        vram_mb.map(|v| format!(", {} MB VRAM", v)).unwrap_or_default(),
        driver_version.as_deref().unwrap_or("?"),
    );

    Some(GpuInfo {
        vendor: GpuVendor::Nvidia,
        name,
        driver_version,
        vram_mb,
        architecture,
        recommended_provider: OnnxProvider::Cuda,
        runtime_installed: true,
        summary,
    })
}

/// Map NVIDIA compute capability to architecture codename.
/// Source: https://developer.nvidia.com/cuda-gpus
fn nvidia_arch_from_compute_cap(cc: &str) -> String {
    let major_minor: Vec<&str> = cc.split('.').collect();
    let major: u32 = major_minor.first().and_then(|s| s.parse().ok()).unwrap_or(0);
    let minor: u32 = major_minor.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);

    match (major, minor) {
        (12, _) => "Blackwell".into(),     // RTX 50 series
        (9, _) => "Hopper".into(),          // H100/H200
        (8, 9) => "Ada Lovelace".into(),    // RTX 40 series
        (8, _) => "Ampere".into(),          // RTX 30 series, A100
        (7, 5) => "Turing".into(),          // RTX 20, GTX 16
        (7, 0) | (7, 2) => "Volta".into(), // V100
        (6, _) => "Pascal".into(),          // GTX 10
        (5, _) => "Maxwell".into(),         // GTX 900
        _ => format!("Compute {}", cc),
    }
}

// ── AMD (Linux) ────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn detect_amd_linux() -> Option<GpuInfo> {
    detect_amd_rocm().or_else(detect_amd_lspci)
}

#[cfg(target_os = "linux")]
fn detect_amd_rocm() -> Option<GpuInfo> {
    let output = StdCommand::new("rocm-smi")
        .args(["--showproductname", "--showmeminfo", "vram"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let name = stdout
        .lines()
        .find(|l| l.contains("Card series:") || l.contains("GPU id:"))
        .map(|l| l.split(':').last().unwrap_or("AMD GPU").trim().to_string())
        .unwrap_or_else(|| "AMD GPU".into());

    let vram_mb = stdout
        .lines()
        .find(|l| l.contains("Total VRAM") || l.contains("VRAM"))
        .and_then(|l| l.split_whitespace().find_map(|w| w.parse::<u64>().ok()));

    let architecture = amd_arch_from_name(&name);
    let summary = format!(
        "{} (ROCm), {}",
        name,
        vram_mb.map(|v| format!("{} MB VRAM", v)).unwrap_or_else(|| "VRAM unknown".into())
    );

    Some(GpuInfo {
        vendor: GpuVendor::Amd,
        name,
        driver_version: None,
        vram_mb,
        architecture,
        recommended_provider: OnnxProvider::Rocm,
        runtime_installed: true,
        summary,
    })
}

#[cfg(target_os = "linux")]
fn detect_amd_lspci() -> Option<GpuInfo> {
    let output = StdCommand::new("lspci").arg("-mm").output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);

    let line = stdout
        .lines()
        .find(|l| {
            let lower = l.to_lowercase();
            (lower.contains("vga") || lower.contains("display") || lower.contains("3d"))
                && (lower.contains("amd") || lower.contains("ati") || lower.contains("radeon") || lower.contains("advanced micro"))
        })?;

    let name = line.split('"').nth(3).unwrap_or("AMD GPU").to_string();
    let architecture = amd_arch_from_name(&name);

    Some(GpuInfo {
        vendor: GpuVendor::Amd,
        name: name.clone(),
        driver_version: None,
        vram_mb: None,
        architecture,
        recommended_provider: OnnxProvider::Rocm,
        runtime_installed: false,
        summary: format!("{} detected via PCI. ROCm not installed — CPU fallback. Install ROCm for GPU acceleration.", name),
    })
}

// ── Intel (Linux) ──────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn detect_intel_linux() -> Option<GpuInfo> {
    let output = StdCommand::new("lspci").arg("-mm").output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);

    let line = stdout.lines().find(|l| {
        let lower = l.to_lowercase();
        (lower.contains("vga") || lower.contains("display") || lower.contains("3d"))
            && (lower.contains("intel") || lower.contains("arc"))
    })?;

    let name = line.split('"').nth(3).unwrap_or("Intel GPU").to_string();
    let architecture = intel_arch_from_name(&name);

    let runtime_installed = StdCommand::new("python3")
        .args(["-c", "import openvino"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    Some(GpuInfo {
        vendor: GpuVendor::Intel,
        name: name.clone(),
        driver_version: None,
        vram_mb: None,
        architecture,
        recommended_provider: OnnxProvider::OpenVino,
        runtime_installed,
        summary: format!(
            "{}{}",
            name,
            if runtime_installed { ", OpenVINO ready" } else { ", install OpenVINO for acceleration" }
        ),
    })
}

// ── Windows (WMI for AMD/Intel/all non-NVIDIA) ─────────────────────

#[cfg(target_os = "windows")]
fn detect_windows_non_nvidia() -> Vec<GpuInfo> {
    use wmi::{COMLibrary, WMIConnection};

    let mut out = Vec::new();
    let com_con = match COMLibrary::new() {
        Ok(c) => c,
        Err(e) => {
            log::warn!("WMI COM init failed: {}", e);
            return out;
        }
    };
    let wmi_con = match WMIConnection::new(com_con) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("WMI connection failed: {}", e);
            return out;
        }
    };

    let results: Vec<std::collections::HashMap<String, wmi::Variant>> = match wmi_con
        .raw_query("SELECT Name, AdapterRAM, DriverVersion FROM Win32_VideoController")
    {
        Ok(r) => r,
        Err(e) => {
            log::warn!("WMI Win32_VideoController query failed: {}", e);
            return out;
        }
    };

    for row in results {
        let name = row
            .get("Name")
            .and_then(variant_string)
            .unwrap_or_else(|| "Unknown GPU".into());
        let lower = name.to_lowercase();

        // NVIDIA already handled by nvidia-smi
        if lower.contains("nvidia") || lower.contains("geforce") || lower.contains("quadro") || lower.contains("tesla") {
            continue;
        }
        // Skip virtual/basic adapters
        if lower.contains("basic display") || lower.contains("microsoft remote") {
            continue;
        }

        let driver_version = row.get("DriverVersion").and_then(variant_string);
        let vram_bytes = row.get("AdapterRAM").and_then(variant_u64);
        let vram_mb = vram_bytes.map(|b| b / 1024 / 1024);

        let (vendor, architecture) = if lower.contains("amd") || lower.contains("radeon") || lower.contains("ati") {
            (GpuVendor::Amd, amd_arch_from_name(&name))
        } else if lower.contains("intel") || lower.contains("arc") {
            (GpuVendor::Intel, intel_arch_from_name(&name))
        } else {
            (GpuVendor::Unknown, None)
        };

        // DirectML works for any DX12-capable GPU on Windows 10+ — best portable choice
        let summary = format!(
            "{}{}{}, DirectML on Windows",
            name,
            architecture.as_deref().map(|a| format!(" ({})", a)).unwrap_or_default(),
            vram_mb.map(|v| format!(", {} MB VRAM", v)).unwrap_or_default(),
        );

        out.push(GpuInfo {
            vendor,
            name,
            driver_version,
            vram_mb,
            architecture,
            recommended_provider: OnnxProvider::DirectML,
            runtime_installed: true,
            summary,
        });
    }

    out
}

#[cfg(target_os = "windows")]
fn variant_string(v: &wmi::Variant) -> Option<String> {
    match v {
        wmi::Variant::String(s) => Some(s.clone()),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn variant_u64(v: &wmi::Variant) -> Option<u64> {
    match v {
        wmi::Variant::UI8(n) => Some(*n),
        wmi::Variant::UI4(n) => Some(*n as u64),
        wmi::Variant::I8(n) if *n >= 0 => Some(*n as u64),
        wmi::Variant::I4(n) if *n >= 0 => Some(*n as u64),
        _ => None,
    }
}

// ── macOS (Apple Silicon + Intel Mac discrete GPUs) ────────────────

#[cfg(target_os = "macos")]
fn detect_apple() -> Option<GpuInfo> {
    // Determine Mac type
    let arm = StdCommand::new("sysctl")
        .args(["-n", "hw.optional.arm64"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "1")
        .unwrap_or(false);

    let chip_brand = StdCommand::new("sysctl")
        .args(["-n", "machdep.cpu.brand_string"])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    // Intel Mac CoreML works too (uses Metal backend). Don't gate on Apple Silicon only.
    let (vendor, name, architecture) = if arm {
        (GpuVendor::Apple, chip_brand.clone(), apple_arch_from_name(&chip_brand))
    } else {
        // Report Intel CPU brand on Intel Macs but flag CoreML still works
        (GpuVendor::Intel, format!("{} (Intel Mac)", chip_brand), None)
    };

    // Memory — unified on Apple Silicon, system RAM on Intel
    let vram_mb = StdCommand::new("sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .ok()
        .and_then(|o| {
            String::from_utf8_lossy(&o.stdout).trim().parse::<u64>().ok()
                .map(|bytes| bytes / 1024 / 1024)
        });

    let summary = if arm {
        format!("{} — CoreML acceleration (unified memory)", name)
    } else {
        format!("{} — CoreML on Intel Mac", name)
    };

    Some(GpuInfo {
        vendor,
        name,
        driver_version: None,
        vram_mb,
        architecture,
        recommended_provider: OnnxProvider::CoreML,
        runtime_installed: true,
        summary,
    })
}

/// Detect discrete AMD/Intel GPUs on macOS (Intel Macs with eGPU or built-in dGPU).
#[cfg(target_os = "macos")]
fn detect_macos_discrete() -> Vec<GpuInfo> {
    let mut out = Vec::new();
    let output = match StdCommand::new("system_profiler")
        .args(["SPDisplaysDataType", "-json"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return out,
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = match serde_json::from_str(&stdout) {
        Ok(j) => j,
        Err(_) => return out,
    };

    let displays = json["SPDisplaysDataType"].as_array().cloned().unwrap_or_default();
    for d in displays {
        let name = d["sppci_model"]
            .as_str()
            .or_else(|| d["_name"].as_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        let lower = name.to_lowercase();
        if lower.contains("apple") {
            continue; // Already handled by detect_apple
        }

        let vendor = if lower.contains("amd") || lower.contains("radeon") {
            GpuVendor::Amd
        } else if lower.contains("intel") {
            GpuVendor::Intel
        } else if lower.contains("nvidia") || lower.contains("geforce") {
            GpuVendor::Nvidia
        } else {
            continue;
        };

        let vram_mb = d["sppci_vram"]
            .as_str()
            .or_else(|| d["spdisplays_vram"].as_str())
            .and_then(parse_vram_string);

        let architecture = match vendor {
            GpuVendor::Amd => amd_arch_from_name(&name),
            GpuVendor::Intel => intel_arch_from_name(&name),
            _ => None,
        };

        out.push(GpuInfo {
            vendor,
            name: name.clone(),
            driver_version: None,
            vram_mb,
            architecture,
            recommended_provider: OnnxProvider::CoreML,
            runtime_installed: true,
            summary: format!("{} on Intel Mac — CoreML/Metal", name),
        });
    }
    out
}

#[cfg(target_os = "macos")]
fn parse_vram_string(s: &str) -> Option<u64> {
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() < 2 {
        return None;
    }
    let n: u64 = parts[0].parse().ok()?;
    let unit = parts[1].to_uppercase();
    if unit.starts_with("GB") {
        Some(n * 1024)
    } else if unit.starts_with("MB") {
        Some(n)
    } else {
        None
    }
}

// ── Architecture name helpers (shared) ─────────────────────────────

fn amd_arch_from_name(name: &str) -> Option<String> {
    let lower = name.to_lowercase();
    if lower.contains("rx 907") || lower.contains("rdna4") {
        Some("RDNA 4".into())
    } else if lower.contains("rx 7") || lower.contains("rx 8") || lower.contains("rdna3") {
        Some("RDNA 3".into())
    } else if lower.contains("rx 6") || lower.contains("rdna2") {
        Some("RDNA 2".into())
    } else if lower.contains("rx 5") || lower.contains("rdna") {
        Some("RDNA 1".into())
    } else if lower.contains("mi300") || lower.contains("mi250") || lower.contains("cdna") {
        Some("CDNA".into())
    } else {
        None
    }
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

#[cfg(target_os = "macos")]
fn apple_arch_from_name(name: &str) -> Option<String> {
    let lower = name.to_lowercase();
    if lower.contains("m5") {
        Some("M5".into())
    } else if lower.contains("m4") {
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
        assert_eq!(nvidia_arch_from_compute_cap("9.0"), "Hopper");
        assert_eq!(nvidia_arch_from_compute_cap("8.9"), "Ada Lovelace");
        assert_eq!(nvidia_arch_from_compute_cap("8.6"), "Ampere");
        assert_eq!(nvidia_arch_from_compute_cap("7.5"), "Turing");
        assert_eq!(nvidia_arch_from_compute_cap("7.0"), "Volta");
        assert_eq!(nvidia_arch_from_compute_cap("6.1"), "Pascal");
        assert_eq!(nvidia_arch_from_compute_cap("5.2"), "Maxwell");
    }

    #[test]
    fn amd_arch_from_name_mapping() {
        assert_eq!(amd_arch_from_name("AMD Radeon RX 9070 XT"), Some("RDNA 4".into()));
        assert_eq!(amd_arch_from_name("AMD Radeon RX 7900 XTX"), Some("RDNA 3".into()));
        assert_eq!(amd_arch_from_name("AMD Radeon RX 6800 XT"), Some("RDNA 2".into()));
        assert_eq!(amd_arch_from_name("AMD Radeon RX 5700 XT"), Some("RDNA 1".into()));
    }

    #[test]
    fn intel_arch_from_name_mapping() {
        assert_eq!(intel_arch_from_name("Intel Arc B580"), Some("Battlemage".into()));
        assert_eq!(intel_arch_from_name("Intel Arc A770"), Some("Alchemist".into()));
        assert_eq!(intel_arch_from_name("Intel Iris Xe Graphics"), Some("Xe".into()));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn apple_arch_from_name_mapping() {
        assert_eq!(apple_arch_from_name("Apple M5 Pro"), Some("M5".into()));
        assert_eq!(apple_arch_from_name("Apple M4 Max"), Some("M4".into()));
        assert_eq!(apple_arch_from_name("Apple M3"), Some("M3".into()));
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
        let info = detect_gpu();
        assert!(!info.name.is_empty());
    }

    #[test]
    fn detect_all_returns_at_least_one() {
        let gpus = detect_all();
        assert!(!gpus.is_empty());
    }

    #[test]
    fn directml_provider_serializes() {
        assert_eq!(OnnxProvider::DirectML.to_string(), "directml");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn parse_vram_string_works() {
        assert_eq!(parse_vram_string("8 GB"), Some(8192));
        assert_eq!(parse_vram_string("1024 MB"), Some(1024));
        assert_eq!(parse_vram_string("invalid"), None);
    }
}

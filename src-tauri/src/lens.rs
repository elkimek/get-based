use std::process::Command as StdCommand;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Manages the Lens Python sidecar process lifecycle.
pub struct LensManager {
    process: Mutex<Option<std::process::Child>>,
    config: Mutex<serde_json::Value>,
    started_at: Mutex<Option<Instant>>,
}

impl LensManager {
    pub fn new() -> Self {
        let default_config = serde_json::json!({
            "host": "127.0.0.1",
            "port": 8321,
            "reranker": false,
        });
        Self {
            process: Mutex::new(None),
            config: Mutex::new(default_config),
            started_at: Mutex::new(None),
        }
    }

    /// Start the Lens sidecar process.
    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Check if already running (drop lock before await)
        {
            let proc = self.process.lock().unwrap();
            if proc.is_some() {
                return Err("Lens is already running".into());
            }
        }

        // Read config and release lock before spawning
        let (host, port) = {
            let config = self.config.lock().unwrap();
            let host = config["host"].as_str().unwrap_or("127.0.0.1").to_string();
            let port = config["port"].as_u64().unwrap_or(8321);
            (host, port)
        };

        let binary_path = Self::resolve_lens_binary()?;

        // Detect GPU provider for ONNX Runtime
        let gpu_provider = crate::gpu::detect_gpu().recommended_provider;

        let child = StdCommand::new(&binary_path)
            .env("LENS_HOST", &host)
            .env("LENS_PORT", port.to_string())
            .env("LENS_RERANKER", "0")
            .env("LENS_ONNX_PROVIDER", gpu_provider.to_string())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;

        // Store the child process
        {
            let mut proc = self.process.lock().unwrap();
            *proc = Some(child);
        }

        {
            let mut started = self.started_at.lock().unwrap();
            *started = Some(Instant::now());
        }

        // Wait briefly for Lens to become healthy
        tokio::time::sleep(Duration::from_secs(3)).await;

        // Health check loop (up to 15 seconds)
        let health_url = format!("http://{}:{}/health", host, port);
        for _ in 0..15 {
            match reqwest::get(&health_url).await {
                Ok(resp) if resp.status().is_success() => return Ok(()),
                _ => tokio::time::sleep(Duration::from_secs(1)).await,
            }
        }

        // Even if health check didn't pass, the process is running
        Ok(())
    }

    /// Stop the Lens sidecar process.
    pub async fn stop(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        {
            let mut proc = self.process.lock().unwrap();
            if let Some(mut child) = proc.take() {
                child.kill()?;
                child.wait()?;
            }
        }
        {
            let mut started = self.started_at.lock().unwrap();
            *started = None;
        }
        Ok(())
    }

    /// Get the current status of the Lens sidecar.
    pub async fn status(&self) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let (host, port) = {
            let config = self.config.lock().unwrap();
            let host = config["host"].as_str().unwrap_or("127.0.0.1").to_string();
            let port = config["port"].as_u64().unwrap_or(8321);
            (host, port)
        };

        let running = self.process.lock().unwrap().is_some();
        let uptime = self.started_at.lock().unwrap().map(|t| t.elapsed().as_secs());

        let health_url = format!("http://{}:{}/health", host, port);
        let health = match reqwest::get(&health_url).await {
            Ok(resp) if resp.status().is_success() => {
                Some(resp.json::<serde_json::Value>().await.unwrap_or(serde_json::json!({"status": "ok"})))
            }
            _ => None,
        };

        // Include GPU info in status
        let gpu = crate::gpu::detect_gpu();

        Ok(serde_json::json!({
            "running": running,
            "uptime_seconds": uptime,
            "health": health,
            "url": format!("http://{}:{}", host, port),
            "gpu": {
                "vendor": gpu.vendor.to_string(),
                "name": gpu.name,
                "provider": gpu.recommended_provider.to_string(),
                "runtime_installed": gpu.runtime_installed,
            },
        }))
    }

    /// Update Lens configuration (applied on next start).
    pub async fn configure(&self, config: serde_json::Value) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut current = self.config.lock().unwrap();
        if let serde_json::Value::Object(map) = config {
            for (k, v) in map {
                current[&k] = v;
            }
        }
        Ok(())
    }

    /// Resolve the path to the Lens binary.
    ///
    /// Priority:
    /// 1. Setup-managed venv (first-run download)
    /// 2. Bundled sidecar binary
    /// 3. System-installed `lens`
    /// 4. Fallback to `python3 -m lens`
    fn resolve_lens_binary() -> Result<std::path::PathBuf, Box<dyn std::error::Error + Send + Sync>> {
        // 1. Check setup-managed venv first
        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("getbased")
            .join("lens")
            .join("venv");

        let venv_bin = if cfg!(target_os = "windows") {
            data_dir.join("Scripts").join("lens.exe")
        } else {
            data_dir.join("bin").join("lens")
        };

        if venv_bin.exists() {
            return Ok(venv_bin);
        }

        // Also check for `lens` via pip-installed entry point in venv
        let venv_python = if cfg!(target_os = "windows") {
            data_dir.join("Scripts").join("python.exe")
        } else {
            data_dir.join("bin").join("python3")
        };
        if venv_python.exists() {
            // venv exists but `lens` entry point missing — use python -m
            return Ok(venv_python);
        }

        // 2. Check for bundled sidecar
        if let Ok(exe_dir) = std::env::current_exe() {
            if let Some(dir) = exe_dir.parent() {
                let sidecar = dir.join("lens");
                if sidecar.exists() {
                    return Ok(sidecar);
                }
                let sidecar_exe = dir.join("lens.exe");
                if sidecar_exe.exists() {
                    return Ok(sidecar_exe);
                }
            }
        }

        // 3. Check common system locations
        let candidates = [
            std::path::PathBuf::from("../lens/.venv/bin/lens"),
            std::path::PathBuf::from("/usr/local/bin/lens"),
            std::path::PathBuf::from(
                dirs::executable_dir().unwrap_or_else(|| std::path::PathBuf::from("/usr/local/bin"))
                .join("lens")
            ),
        ];

        for candidate in &candidates {
            if StdCommand::new(candidate)
                .arg("--version")
                .output()
                .is_ok()
            {
                return Ok(candidate.clone());
            }
        }

        // 4. Fallback to system python
        Ok(std::path::PathBuf::from("python3"))
    }
}

impl Drop for LensManager {
    fn drop(&mut self) {
        if let Some(mut child) = self.process.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_manager_has_no_process() {
        let mgr = LensManager::new();
        assert!(mgr.process.lock().unwrap().is_none());
        assert!(mgr.started_at.lock().unwrap().is_none());
    }

    #[test]
    fn default_config_is_localhost_8321() {
        let mgr = LensManager::new();
        let config = mgr.config.lock().unwrap();
        assert_eq!(config["host"], "127.0.0.1");
        assert_eq!(config["port"], 8321);
        assert_eq!(config["reranker"], false);
    }

    #[tokio::test]
    async fn configure_merges_into_existing() {
        let mgr = LensManager::new();
        mgr.configure(serde_json::json!({"port": 9999, "custom": "value"})).await.unwrap();
        let config = mgr.config.lock().unwrap();
        assert_eq!(config["host"], "127.0.0.1"); // preserved
        assert_eq!(config["port"], 9999);        // overridden
        assert_eq!(config["custom"], "value");   // added
    }

    #[tokio::test]
    async fn stop_when_not_running_is_ok() {
        let mgr = LensManager::new();
        mgr.stop().await.unwrap();
    }

    #[tokio::test]
    async fn status_when_not_running_reports_correctly() {
        let mgr = LensManager::new();
        let status = mgr.status().await.unwrap();
        assert_eq!(status["running"], false);
        assert!(status["url"].is_string());
        // GPU info should be present
        assert!(status["gpu"].is_object());
    }

    #[test]
    fn resolve_lens_binary_returns_something() {
        let result = LensManager::resolve_lens_binary();
        assert!(result.is_ok());
    }
}

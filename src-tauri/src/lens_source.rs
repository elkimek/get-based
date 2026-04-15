//! Embeds the lens/ Python package source into the binary at compile time.
//!
//! At first-run setup, the embedded source is extracted to data_dir/lens-source/
//! and pip-installed via `pip install --upgrade {path}[full]` into the managed venv.
//!
//! This means lens/ fixes ship with each desktop release — no PyPI re-publish needed.
//! Each time the desktop app starts setup, the source is re-extracted (overwriting
//! the previous version) and pip --upgrade reinstalls the package with any changes.

use include_dir::{include_dir, Dir};
use std::fs;
use std::path::{Path, PathBuf};

/// Embedded copy of the lens/ Python package source (relative to src-tauri/).
/// `include_dir!` walks the directory at compile time and bakes every file into the binary.
static LENS_SOURCE: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../lens");

/// Extract the embedded lens/ source to the given directory.
/// Idempotent — overwrites existing files so each app version updates the source.
pub fn extract_to(target: &Path) -> Result<PathBuf, String> {
    if target.exists() {
        // Wipe so old files can't shadow new ones (e.g., renamed modules)
        fs::remove_dir_all(target)
            .map_err(|e| format!("Failed to clear lens-source dir: {}", e))?;
    }
    fs::create_dir_all(target)
        .map_err(|e| format!("Failed to create lens-source dir: {}", e))?;

    LENS_SOURCE
        .extract(target)
        .map_err(|e| format!("Failed to extract embedded lens/ source: {}", e))?;

    log::info!("Extracted bundled lens/ source to {:?}", target);
    Ok(target.to_path_buf())
}

/// Returns the embedded lens version (read from pyproject.toml at compile time).
/// Falls back to "unknown" if parse fails.
pub fn embedded_version() -> &'static str {
    LENS_SOURCE
        .get_file("pyproject.toml")
        .and_then(|f| f.contents_utf8())
        .and_then(|s| {
            // Naive line-based parse — avoids pulling in toml crate just for one field
            for line in s.lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("version") {
                    if let Some(eq_idx) = rest.find('=') {
                        let val = rest[eq_idx + 1..].trim();
                        if let Some(v) = val.strip_prefix('"').and_then(|v| v.strip_suffix('"')) {
                            return Some(v);
                        }
                    }
                }
            }
            None
        })
        .unwrap_or("unknown")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_source_includes_pyproject() {
        assert!(LENS_SOURCE.get_file("pyproject.toml").is_some());
    }

    #[test]
    fn embedded_source_includes_python_modules() {
        assert!(LENS_SOURCE.get_file("src/lens/embedder.py").is_some());
        assert!(LENS_SOURCE.get_file("src/lens/config.py").is_some());
    }

    #[test]
    fn embedded_version_is_parseable() {
        let v = embedded_version();
        assert_ne!(v, "unknown", "Failed to parse version from embedded pyproject.toml");
        // Should look like X.Y.Z
        let parts: Vec<&str> = v.split('.').collect();
        assert!(parts.len() >= 2, "Version {} doesn't look like semver", v);
    }
}

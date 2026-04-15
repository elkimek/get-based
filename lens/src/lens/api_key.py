"""API key generation + persistence for the Lens HTTP server.

Auto-generates a key on first start if one doesn't exist. The desktop wrapper
(Tauri) reads this file via `getbased_lens_config` MCP tool to display the
key for the user to paste into the getbased web app's Custom Knowledge Source.
"""

from __future__ import annotations

import os
import secrets
import stat
from pathlib import Path


def get_or_create_api_key(key_file: Path) -> str:
    """Read the API key from disk; generate + write one if missing.

    Permissions are tightened to 0600 (owner read/write only) on POSIX.
    """
    if key_file.exists():
        try:
            key = key_file.read_text().strip()
            if key:
                return key
        except OSError:
            pass

    key_file.parent.mkdir(parents=True, exist_ok=True)
    key = secrets.token_urlsafe(32)
    key_file.write_text(key + "\n")
    # POSIX-only: tighten to user-read/write
    if hasattr(os, "chmod") and not os.name == "nt":
        try:
            os.chmod(key_file, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass
    return key


def load_api_key(key_file: Path) -> str | None:
    """Read existing API key without generating one."""
    try:
        if key_file.exists():
            key = key_file.read_text().strip()
            return key if key else None
    except OSError:
        pass
    return None

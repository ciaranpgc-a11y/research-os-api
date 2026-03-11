"""Runtime configuration helpers."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


class ConfigurationError(RuntimeError):
    """Raised when required runtime configuration is missing."""


def _clean_openai_api_key(value: str | None) -> str:
    clean = str(value or "").strip().strip('"').strip("'")
    if clean.startswith("PASTE_YOUR_REAL_KEY_HERE") and "sk-" in clean:
        clean = clean[clean.index("sk-") :]
    return clean


def _get_windows_user_environment_variable(name: str) -> str | None:
    if not sys.platform.startswith("win"):
        return None
    try:
        import winreg
    except ImportError:
        return None
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as key:
            value, _ = winreg.QueryValueEx(key, name)
    except OSError:
        return None
    clean = str(value or "").strip()
    return clean or None


def get_openai_api_key() -> str:
    """Return the OpenAI API key from environment variables."""
    raw_process_value = os.getenv("OPENAI_API_KEY")
    process_key = _clean_openai_api_key(raw_process_value)
    user_key = _clean_openai_api_key(
        _get_windows_user_environment_variable("OPENAI_API_KEY")
    )

    if str(raw_process_value or "").strip().startswith("PASTE_YOUR_REAL_KEY_HERE") and user_key:
        return user_key
    chosen_key = process_key or user_key
    if not chosen_key:
        raise ConfigurationError("OPENAI_API_KEY is not set.")
    return chosen_key


def get_data_library_root() -> Path:
    """
    Return a stable data-library root path.

    - If DATA_LIBRARY_ROOT is set, use it.
    - Otherwise use an OS-level user data folder outside the repository/build tree.
    """
    explicit = str(os.getenv("DATA_LIBRARY_ROOT", "")).strip()
    if explicit:
        root = Path(explicit).expanduser()
    elif sys.platform.startswith("win"):
        base = (
            Path(os.getenv("LOCALAPPDATA") or "")
            if str(os.getenv("LOCALAPPDATA", "")).strip()
            else Path(os.getenv("APPDATA") or "")
        )
        if not str(base).strip():
            base = Path.home() / "AppData" / "Local"
        root = base / "ResearchOS" / "data_library_store"
    elif sys.platform == "darwin":
        root = (
            Path.home()
            / "Library"
            / "Application Support"
            / "research-os"
            / "data_library_store"
        )
    else:
        persistent_mount_raw = str(
            os.getenv("AAWE_PERSISTENT_MOUNT_ROOT", "/var/data")
        ).strip()
        persistent_mount = Path(persistent_mount_raw).expanduser() if persistent_mount_raw else None
        if (
            persistent_mount is not None
            and persistent_mount.exists()
            and persistent_mount.is_dir()
        ):
            root = persistent_mount / "data_library_store"
        else:
            xdg_data_home = str(os.getenv("XDG_DATA_HOME", "")).strip()
            base = (
                Path(xdg_data_home)
                if xdg_data_home
                else Path.home() / ".local" / "share"
            )
            root = base / "research-os" / "data_library_store"

    root = root.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root

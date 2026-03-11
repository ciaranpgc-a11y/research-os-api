from __future__ import annotations

from pathlib import Path

import research_os.config as config_module


def test_get_openai_api_key_prefers_windows_user_env_when_process_value_is_placeholder(
    monkeypatch,
) -> None:
    monkeypatch.setattr(config_module.sys, "platform", "win32")
    monkeypatch.setenv(
        "OPENAI_API_KEY",
        "PASTE_YOUR_REAL_KEY_HEREsk-proj-stale-process-key",
    )
    monkeypatch.setattr(
        config_module,
        "_get_windows_user_environment_variable",
        lambda name: "sk-proj-user-env-key" if name == "OPENAI_API_KEY" else None,
    )

    assert config_module.get_openai_api_key() == "sk-proj-user-env-key"


def test_get_openai_api_key_prefers_process_env_when_it_is_already_clean(
    monkeypatch,
) -> None:
    monkeypatch.setattr(config_module.sys, "platform", "win32")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-proj-process-env-key")
    monkeypatch.setattr(
        config_module,
        "_get_windows_user_environment_variable",
        lambda name: "sk-proj-user-env-key" if name == "OPENAI_API_KEY" else None,
    )

    assert config_module.get_openai_api_key() == "sk-proj-process-env-key"


def test_get_data_library_root_prefers_explicit_env(monkeypatch, tmp_path) -> None:
    explicit_root = (tmp_path / "explicit_data_root").resolve()
    mount_root = (tmp_path / "mount").resolve()
    mount_root.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(config_module.sys, "platform", "linux")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str(explicit_root))
    monkeypatch.setenv("AAWE_PERSISTENT_MOUNT_ROOT", str(mount_root))
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)

    resolved = config_module.get_data_library_root()
    assert resolved == explicit_root
    assert resolved.exists() and resolved.is_dir()


def test_get_data_library_root_prefers_persistent_mount_on_linux(
    monkeypatch, tmp_path
) -> None:
    mount_root = (tmp_path / "mount").resolve()
    mount_root.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(config_module.sys, "platform", "linux")
    monkeypatch.delenv("DATA_LIBRARY_ROOT", raising=False)
    monkeypatch.setenv("AAWE_PERSISTENT_MOUNT_ROOT", str(mount_root))
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)

    resolved = config_module.get_data_library_root()
    assert resolved == (mount_root / "data_library_store")
    assert resolved.exists() and resolved.is_dir()


def test_get_data_library_root_uses_xdg_when_mount_missing(
    monkeypatch, tmp_path
) -> None:
    xdg_root = (tmp_path / "xdg").resolve()
    missing_mount = (tmp_path / "missing-mount").resolve()

    monkeypatch.setattr(config_module.sys, "platform", "linux")
    monkeypatch.delenv("DATA_LIBRARY_ROOT", raising=False)
    monkeypatch.setenv("AAWE_PERSISTENT_MOUNT_ROOT", str(missing_mount))
    monkeypatch.setenv("XDG_DATA_HOME", str(xdg_root))

    resolved = config_module.get_data_library_root()
    expected = (xdg_root / "research-os" / "data_library_store").resolve()
    assert resolved == expected
    assert resolved.exists() and resolved.is_dir()

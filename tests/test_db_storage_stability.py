from __future__ import annotations

from pathlib import Path
import sqlite3

from research_os.db import get_database_url


def _sqlite_url_to_path(url: str) -> Path:
    prefix = "sqlite+pysqlite:///"
    assert url.startswith(prefix)
    raw_path = url[len(prefix) :]
    return Path(raw_path)


def test_get_database_url_defaults_to_stable_absolute_path(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local_appdata"))
    monkeypatch.delenv("APPDATA", raising=False)
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)

    url = get_database_url()
    path = _sqlite_url_to_path(url)

    assert path.name == "research_os.db"
    assert path.is_absolute()
    assert "ResearchOS" in str(path.parent)


def test_get_database_url_migrates_legacy_relative_database(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local_appdata"))
    monkeypatch.delenv("APPDATA", raising=False)
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)
    monkeypatch.chdir(tmp_path)

    legacy_path = tmp_path / "research_os.db"
    legacy_bytes = b"legacy-sqlite-db"
    legacy_path.write_bytes(legacy_bytes)

    url = get_database_url()
    stable_path = _sqlite_url_to_path(url)

    assert stable_path.exists()
    assert stable_path.read_bytes() == legacy_bytes


def test_get_database_url_recovers_legacy_db_when_stable_is_empty(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local_appdata"))
    monkeypatch.delenv("APPDATA", raising=False)
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)
    monkeypatch.chdir(tmp_path)

    # Seed legacy DB with recoverable data.
    legacy_path = tmp_path / "research_os.db"
    legacy_conn = sqlite3.connect(str(legacy_path))
    legacy_cursor = legacy_conn.cursor()
    legacy_cursor.execute("CREATE TABLE users (id TEXT PRIMARY KEY)")
    legacy_cursor.execute("CREATE TABLE projects (id TEXT PRIMARY KEY)")
    legacy_cursor.execute(
        "CREATE TABLE data_library_assets (id TEXT PRIMARY KEY, storage_path TEXT)"
    )
    legacy_cursor.execute("INSERT INTO users (id) VALUES ('user-1')")
    legacy_conn.commit()
    legacy_conn.close()

    # Create an empty stable DB schema (no rows) to emulate first run after build path change.
    stable_dir = tmp_path / "local_appdata" / "ResearchOS"
    stable_dir.mkdir(parents=True, exist_ok=True)
    stable_path = stable_dir / "research_os.db"
    stable_conn = sqlite3.connect(str(stable_path))
    stable_cursor = stable_conn.cursor()
    stable_cursor.execute("CREATE TABLE users (id TEXT PRIMARY KEY)")
    stable_cursor.execute("CREATE TABLE projects (id TEXT PRIMARY KEY)")
    stable_cursor.execute(
        "CREATE TABLE data_library_assets (id TEXT PRIMARY KEY, storage_path TEXT)"
    )
    stable_conn.commit()
    stable_conn.close()

    url = get_database_url()
    resolved_stable = _sqlite_url_to_path(url)
    assert resolved_stable == stable_path

    verify_conn = sqlite3.connect(str(resolved_stable))
    verify_cursor = verify_conn.cursor()
    verify_cursor.execute("SELECT COUNT(*) FROM users")
    recovered_users = int(verify_cursor.fetchone()[0] or 0)
    verify_conn.close()
    assert recovered_users == 1

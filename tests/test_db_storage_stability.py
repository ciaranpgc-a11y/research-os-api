from __future__ import annotations

from pathlib import Path
import sqlite3

from sqlalchemy.exc import ProgrammingError

import research_os.db as db_module
from research_os.db import (
    Base,
    DataLibraryAsset,
    User,
    create_all_tables,
    get_database_url,
    reset_database_state,
    session_scope,
)
from research_os.services.data_planner_service import list_library_assets


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


def test_get_database_url_stabilizes_explicit_relative_sqlite_url(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local_appdata"))
    monkeypatch.delenv("APPDATA", raising=False)
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DATABASE_URL", "sqlite+pysqlite:///./research_os.db")

    legacy_path = tmp_path / "research_os.db"
    legacy_bytes = b"relative-explicit-db"
    legacy_path.write_bytes(legacy_bytes)

    url = get_database_url()
    stable_path = _sqlite_url_to_path(url)

    assert stable_path.is_absolute()
    assert "ResearchOS" in str(stable_path.parent)
    assert stable_path.exists()
    assert stable_path.read_bytes() == legacy_bytes


def test_get_database_url_keeps_explicit_absolute_sqlite_url(monkeypatch, tmp_path) -> None:
    explicit_path = (tmp_path / "explicit_absolute.db").resolve()
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{explicit_path.as_posix()}")

    url = get_database_url()
    resolved = _sqlite_url_to_path(url)

    assert resolved == explicit_path


def test_create_all_tables_repairs_legacy_asset_and_project_columns(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = (tmp_path / "legacy_schema.db").resolve()
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path.as_posix()}")
    data_root = (tmp_path / "data_library").resolve()
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str(data_root))
    reset_database_state()

    create_all_tables()
    data_root.mkdir(parents=True, exist_ok=True)
    storage_path = (data_root / "legacy-asset.csv").resolve()
    storage_path.write_bytes(b"col_a,col_b\n1,2\n")

    with session_scope() as session:
        user = User(
            email="legacy-schema-user@example.com",
            password_hash="pbkdf2_sha256$390000$test$test",
            name="Legacy Schema User",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        asset = DataLibraryAsset(
            owner_user_id=user_id,
            project_id=None,
            shared_with_user_ids=[],
            filename="legacy-asset.csv",
            kind="csv",
            mime_type="text/csv",
            byte_size=storage_path.stat().st_size,
            storage_path=str(storage_path),
        )
        session.add(asset)
        session.flush()
        asset_id = str(asset.id)

    connection = sqlite3.connect(str(db_path))
    cursor = connection.cursor()
    cursor.execute("ALTER TABLE data_library_assets RENAME TO data_library_assets_legacy_source")
    cursor.execute(
        """
        CREATE TABLE data_library_assets (
            id VARCHAR(36) PRIMARY KEY NOT NULL,
            project_id VARCHAR(36),
            filename VARCHAR(255) NOT NULL,
            kind VARCHAR(32) NOT NULL,
            mime_type VARCHAR(128),
            byte_size INTEGER NOT NULL,
            storage_path TEXT NOT NULL,
            uploaded_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
        """
    )
    cursor.execute(
        """
        INSERT INTO data_library_assets (
            id, project_id, filename, kind, mime_type, byte_size, storage_path, uploaded_at, updated_at
        )
        SELECT
            id, project_id, filename, kind, mime_type, byte_size, storage_path, uploaded_at, updated_at
        FROM data_library_assets_legacy_source
        """
    )
    cursor.execute("DROP TABLE data_library_assets_legacy_source")

    cursor.execute("ALTER TABLE projects RENAME TO projects_legacy_source")
    cursor.execute(
        """
        CREATE TABLE projects (
            id VARCHAR(36) PRIMARY KEY NOT NULL,
            title VARCHAR(255) NOT NULL,
            target_journal VARCHAR(128) NOT NULL,
            journal_voice VARCHAR(128),
            language VARCHAR(24) NOT NULL,
            study_type VARCHAR(128),
            study_brief TEXT,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
        """
    )
    cursor.execute(
        """
        INSERT INTO projects (
            id, title, target_journal, journal_voice, language, study_type, study_brief, created_at, updated_at
        )
        SELECT
            id, title, target_journal, journal_voice, language, study_type, study_brief, created_at, updated_at
        FROM projects_legacy_source
        """
    )
    cursor.execute("DROP TABLE projects_legacy_source")

    cursor.execute("ALTER TABLE data_profiles RENAME TO data_profiles_legacy_source")
    cursor.execute(
        """
        CREATE TABLE data_profiles (
            id VARCHAR(36) PRIMARY KEY NOT NULL,
            asset_ids JSON NOT NULL,
            data_profile_json JSON NOT NULL,
            human_summary TEXT NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
        """
    )
    cursor.execute(
        """
        INSERT INTO data_profiles (
            id, asset_ids, data_profile_json, human_summary, created_at, updated_at
        )
        SELECT
            id, asset_ids, data_profile_json, human_summary, created_at, updated_at
        FROM data_profiles_legacy_source
        """
    )
    cursor.execute("DROP TABLE data_profiles_legacy_source")
    connection.commit()
    connection.close()

    reset_database_state()
    create_all_tables()

    verify_connection = sqlite3.connect(str(db_path))
    verify_cursor = verify_connection.cursor()
    verify_cursor.execute("PRAGMA table_info(data_library_assets)")
    asset_columns = {str(row[1]) for row in verify_cursor.fetchall()}
    assert "owner_user_id" in asset_columns
    assert "shared_with_user_ids" in asset_columns
    assert "content_blob" in asset_columns

    verify_cursor.execute("PRAGMA table_info(projects)")
    project_columns = {str(row[1]) for row in verify_cursor.fetchall()}
    assert "owner_user_id" in project_columns
    assert "collaborator_user_ids" in project_columns
    assert "workspace_id" in project_columns

    verify_cursor.execute("PRAGMA table_info(data_profiles)")
    profile_columns = {str(row[1]) for row in verify_cursor.fetchall()}
    assert "owner_user_id" in profile_columns

    verify_cursor.execute("PRAGMA table_info(users)")
    user_columns = {str(row[1]) for row in verify_cursor.fetchall()}
    assert "account_key" in user_columns
    verify_cursor.execute(
        "SELECT account_key FROM users WHERE id = ?",
        (user_id,),
    )
    account_key_row = verify_cursor.fetchone()
    assert account_key_row is not None
    assert str(account_key_row[0] or "").strip() != ""

    verify_cursor.execute(
        "SELECT owner_user_id FROM data_library_assets WHERE id = ?",
        (asset_id,),
    )
    owner_row = verify_cursor.fetchone()
    verify_connection.close()
    assert owner_row is not None
    assert str(owner_row[0] or "") == user_id

    payload = list_library_assets(project_id=None, user_id=user_id)
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert asset_id in listed_ids


def test_create_all_tables_ignores_duplicate_programming_error(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = (tmp_path / "duplicate_programming_error.db").resolve()
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path.as_posix()}")
    reset_database_state()

    def _raise_duplicate(*args, **kwargs):
        raise ProgrammingError(
            "CREATE INDEX ix_already_exists ON table_name (column_name)",
            {},
            Exception('relation "ix_already_exists" already exists'),
        )

    monkeypatch.setattr(Base.metadata, "create_all", _raise_duplicate)
    create_all_tables()


def test_create_all_tables_initializes_once_per_engine(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = (tmp_path / "create_all_once.db").resolve()
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path.as_posix()}")
    reset_database_state()

    calls = {
        "create_all": 0,
        "sqlite_compat": 0,
        "postgres_compat": 0,
    }

    def _create_all(*args, **kwargs):
        calls["create_all"] += 1

    def _sqlite_compat(engine):
        calls["sqlite_compat"] += 1

    def _postgres_compat(engine):
        calls["postgres_compat"] += 1

    monkeypatch.setattr(Base.metadata, "create_all", _create_all)
    monkeypatch.setattr(db_module, "_ensure_sqlite_schema_compatibility", _sqlite_compat)
    monkeypatch.setattr(
        db_module,
        "_ensure_postgresql_schema_compatibility",
        _postgres_compat,
    )

    create_all_tables()
    create_all_tables()
    create_all_tables()
    assert calls == {
        "create_all": 1,
        "sqlite_compat": 1,
        "postgres_compat": 1,
    }

    reset_database_state()
    create_all_tables()
    assert calls == {
        "create_all": 2,
        "sqlite_compat": 2,
        "postgres_compat": 2,
    }


def test_ensure_postgresql_schema_compatibility_backfills_account_key() -> None:
    class _FakeResult:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return list(self._rows)

    class _FakeConnection:
        def __init__(self):
            self.calls: list[tuple[str, dict | None]] = []

        def execute(self, statement, params=None):
            sql = str(statement)
            self.calls.append((sql, params))
            if "SELECT id FROM users" in sql:
                return _FakeResult([("user-1",), ("",), (None,)])
            return _FakeResult([])

    class _FakeBegin:
        def __init__(self, connection):
            self._connection = connection

        def __enter__(self):
            return self._connection

        def __exit__(self, exc_type, exc, tb):
            return False

    class _FakeDialect:
        name = "postgresql"

    class _FakeEngine:
        def __init__(self):
            self.dialect = _FakeDialect()
            self.connection = _FakeConnection()

        def begin(self):
            return _FakeBegin(self.connection)

    fake_engine = _FakeEngine()
    db_module._ensure_postgresql_schema_compatibility(fake_engine)

    sql_calls = [sql for sql, _ in fake_engine.connection.calls]
    assert any("ADD COLUMN IF NOT EXISTS account_key" in sql for sql in sql_calls)
    assert any("ADD COLUMN IF NOT EXISTS content_blob BYTEA" in sql for sql in sql_calls)
    assert any("SELECT id FROM users" in sql for sql in sql_calls)
    assert any("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_account_key" in sql for sql in sql_calls)

    update_calls = [
        params
        for sql, params in fake_engine.connection.calls
        if "UPDATE users " in sql and params is not None
    ]
    assert len(update_calls) == 1
    assert str(update_calls[0].get("user_id") or "") == "user-1"
    assert str(update_calls[0].get("account_key") or "").strip() != ""

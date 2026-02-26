from __future__ import annotations

import json
from pathlib import Path

from research_os.db import (
    DataLibraryAsset,
    User,
    create_all_tables,
    reset_database_state,
    session_scope,
)
from research_os.services.data_planner_service import (
    download_library_asset,
    list_library_assets,
    upload_library_assets,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_test_data_library_resilience.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str(tmp_path / "data_library"))
    reset_database_state()


def _create_user(*, email: str, name: str = "Resilience User") -> str:
    create_all_tables()
    with session_scope() as session:
        user = User(
            email=email,
            password_hash="pbkdf2_sha256$390000$test$test",
            name=name,
        )
        session.add(user)
        session.flush()
        return str(user.id)


def _metadata_path(root: Path, asset_id: str) -> Path:
    return root / f"{asset_id}.meta.json"


def _metadata_index_path(root: Path) -> Path:
    return root / "metadata.index.json"


def test_list_library_assets_restores_missing_row_from_metadata(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id = _create_user(email="library-resilience@example.com")
    storage_root = (tmp_path / "data_library").resolve()

    asset_id = upload_library_assets(
        files=[("resilience.csv", "text/csv", b"col_a,col_b\n1,2\n")],
        project_id=None,
        user_id=user_id,
    )[0]

    metadata_path = _metadata_path(storage_root, asset_id)
    assert metadata_path.exists() and metadata_path.is_file()
    metadata_index_path = _metadata_index_path(storage_root)
    assert metadata_index_path.exists() and metadata_index_path.is_file()
    metadata_index_payload = json.loads(metadata_index_path.read_text(encoding="utf-8"))
    assert asset_id in (metadata_index_payload.get("asset_ids") or [])

    with session_scope() as session:
        row = session.get(DataLibraryAsset, asset_id)
        assert row is not None
        session.delete(row)

    payload = list_library_assets(project_id=None, user_id=user_id)
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert asset_id in listed_ids

    with session_scope() as session:
        restored = session.get(DataLibraryAsset, asset_id)
        assert restored is not None
        assert Path(str(restored.storage_path)).exists()
        assert str(restored.owner_user_id) == user_id


def test_list_library_assets_rebinds_owner_by_email_when_user_id_changes(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    email = "library-owner-rebind@example.com"
    first_user_id = _create_user(email=email, name="Owner First")
    storage_root = (tmp_path / "data_library").resolve()

    asset_id = upload_library_assets(
        files=[("owner-rebind.csv", "text/csv", b"col_a,col_b\n10,20\n")],
        project_id=None,
        user_id=first_user_id,
    )[0]

    metadata_payload = json.loads(_metadata_path(storage_root, asset_id).read_text(encoding="utf-8"))
    assert str(metadata_payload.get("owner_email", "")).lower() == email

    with session_scope() as session:
        row = session.get(DataLibraryAsset, asset_id)
        assert row is not None
        session.delete(row)
        first_user = session.get(User, first_user_id)
        assert first_user is not None
        session.delete(first_user)

    second_user_id = _create_user(email=email, name="Owner Second")
    assert second_user_id != first_user_id

    payload = list_library_assets(project_id=None, user_id=second_user_id)
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert asset_id in listed_ids
    listed_row = next(
        item for item in payload.get("items", []) if str(item.get("id")) == asset_id
    )
    assert str(listed_row.get("owner_user_id") or "") == second_user_id

    downloaded = download_library_asset(asset_id=asset_id, user_id=second_user_id)
    assert downloaded["file_name"] == "owner-rebind.csv"
    assert downloaded["content"] == b"col_a,col_b\n10,20\n"


def test_list_library_assets_recovers_when_metadata_index_is_corrupt(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id = _create_user(email="library-index-corrupt@example.com")
    storage_root = (tmp_path / "data_library").resolve()

    asset_id = upload_library_assets(
        files=[("index-corrupt.csv", "text/csv", b"col_a,col_b\n5,6\n")],
        project_id=None,
        user_id=user_id,
    )[0]

    index_path = _metadata_index_path(storage_root)
    assert index_path.exists() and index_path.is_file()
    index_path.write_text("{not-json", encoding="utf-8")

    with session_scope() as session:
        row = session.get(DataLibraryAsset, asset_id)
        assert row is not None
        session.delete(row)

    payload = list_library_assets(project_id=None, user_id=user_id)
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert asset_id in listed_ids

from __future__ import annotations

import json
from pathlib import Path

from research_os.db import (
    DataLibraryAsset,
    DataLibraryAssetBlob,
    Project,
    User,
    create_all_tables,
    reset_database_state,
    session_scope,
)
from research_os.services.data_planner_service import (
    download_library_asset,
    list_library_assets,
    reconcile_library_for_user,
    upload_library_assets,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_test_data_library_resilience.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str(tmp_path / "data_library"))
    reset_database_state()


def _create_user(
    *,
    email: str,
    name: str = "Resilience User",
    account_key: str | None = None,
    orcid_id: str | None = None,
    google_sub: str | None = None,
    microsoft_sub: str | None = None,
) -> str:
    create_all_tables()
    with session_scope() as session:
        payload = {
            "email": email,
            "password_hash": "pbkdf2_sha256$390000$test$test",
            "name": name,
        }
        if account_key:
            payload["account_key"] = account_key
        if orcid_id:
            payload["orcid_id"] = orcid_id
        if google_sub:
            payload["google_sub"] = google_sub
        if microsoft_sub:
            payload["microsoft_sub"] = microsoft_sub
        user = User(
            **payload,
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


def test_list_library_assets_restores_missing_storage_from_db_backup(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id = _create_user(email="library-backup-restore@example.com")

    asset_id = upload_library_assets(
        files=[("backup-restore.csv", "text/csv", b"col_a,col_b\n11,22\n")],
        project_id=None,
        user_id=user_id,
    )[0]

    with session_scope() as session:
        backup_row = session.get(DataLibraryAssetBlob, asset_id)
        assert backup_row is not None
        assert int(backup_row.byte_size or 0) > 0
        row = session.get(DataLibraryAsset, asset_id)
        assert row is not None
        stale_path = Path(str(row.storage_path))
        stale_path.unlink(missing_ok=True)
        assert not stale_path.exists()

    payload = list_library_assets(project_id=None, user_id=user_id)
    listed = {
        str(item.get("id")): item for item in payload.get("items", [])
    }
    assert asset_id in listed
    assert bool(listed[asset_id].get("is_available")) is True

    downloaded = download_library_asset(asset_id=asset_id, user_id=user_id)
    assert downloaded["content"] == b"col_a,col_b\n11,22\n"

    with session_scope() as session:
        restored = session.get(DataLibraryAsset, asset_id)
        assert restored is not None
        assert Path(str(restored.storage_path)).exists()


def test_reconcile_library_for_user_restores_missing_row_from_metadata(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id = _create_user(email="library-reconcile@example.com")

    asset_id = upload_library_assets(
        files=[("reconcile.csv", "text/csv", b"col_a,col_b\n9,10\n")],
        project_id=None,
        user_id=user_id,
    )[0]

    with session_scope() as session:
        row = session.get(DataLibraryAsset, asset_id)
        assert row is not None
        session.delete(row)

    summary = reconcile_library_for_user(user_id=user_id)
    assert int(summary.get("restored_rows") or 0) >= 1

    payload = list_library_assets(project_id=None, user_id=user_id)
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert asset_id in listed_ids


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


def test_list_library_assets_rebinds_owner_by_account_key_when_metadata_ids_stale(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    account_key = "f5f39872-5d5c-41f7-9d0b-c6608bd7bbf0"
    first_user_id = _create_user(
        email="library-account-key-first@example.com",
        name="Owner First",
        account_key=account_key,
    )
    storage_root = (tmp_path / "data_library").resolve()

    asset_id = upload_library_assets(
        files=[("account-key-rebind.csv", "text/csv", b"col_a,col_b\n15,30\n")],
        project_id=None,
        user_id=first_user_id,
    )[0]

    metadata_path = _metadata_path(storage_root, asset_id)
    metadata_payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    assert str(metadata_payload.get("owner_account_key") or "") == account_key
    metadata_payload["owner_user_id"] = "missing-owner-id"
    metadata_payload["owner_email"] = "not-a-real-owner@example.com"
    metadata_path.write_text(json.dumps(metadata_payload), encoding="utf-8")

    with session_scope() as session:
        row = session.get(DataLibraryAsset, asset_id)
        assert row is not None
        session.delete(row)
        first_user = session.get(User, first_user_id)
        assert first_user is not None
        session.delete(first_user)

    second_user_id = _create_user(
        email="library-account-key-second@example.com",
        name="Owner Second",
        account_key=account_key,
    )
    assert second_user_id != first_user_id

    payload = list_library_assets(project_id=None, user_id=second_user_id)
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert asset_id in listed_ids
    listed_row = next(
        item for item in payload.get("items", []) if str(item.get("id")) == asset_id
    )
    assert str(listed_row.get("owner_user_id") or "") == second_user_id


def test_list_library_assets_rebinds_owner_for_linked_orcid_identity(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    shared_orcid = "0000-0002-1825-0097"
    first_user_id = _create_user(
        email="library-orcid-first@example.com",
        name="Owner First",
        orcid_id=shared_orcid,
    )

    asset_id = upload_library_assets(
        files=[("orcid-linked.csv", "text/csv", b"col_a,col_b\n55,66\n")],
        project_id=None,
        user_id=first_user_id,
    )[0]

    second_user_id = _create_user(
        email="library-orcid-second@example.com",
        name="Owner Second",
        orcid_id=shared_orcid,
    )
    assert second_user_id != first_user_id

    payload = list_library_assets(project_id=None, user_id=second_user_id)
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert asset_id in listed_ids

    listed_row = next(
        item for item in payload.get("items", []) if str(item.get("id")) == asset_id
    )
    assert str(listed_row.get("owner_user_id") or "") == second_user_id

    downloaded = download_library_asset(asset_id=asset_id, user_id=second_user_id)
    assert downloaded["file_name"] == "orcid-linked.csv"
    assert downloaded["content"] == b"col_a,col_b\n55,66\n"


def test_list_library_assets_rebinds_owner_by_account_key_hint(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    shared_account_key = "b7900f30-c51a-4f15-9f5e-4d6e0d35b874"
    first_user_id = _create_user(
        email="library-account-hint-first@example.com",
        name="Owner First",
        account_key=shared_account_key,
    )

    asset_id = upload_library_assets(
        files=[("account-hint.csv", "text/csv", b"col_a,col_b\n77,88\n")],
        project_id=None,
        user_id=first_user_id,
    )[0]

    second_user_id = _create_user(
        email="library-account-hint-second@example.com",
        name="Owner Second",
    )

    payload = list_library_assets(
        project_id=None,
        user_id=second_user_id,
        account_key_hint=shared_account_key,
    )
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert asset_id in listed_ids

    listed_row = next(
        item for item in payload.get("items", []) if str(item.get("id")) == asset_id
    )
    assert str(listed_row.get("owner_user_id") or "") == second_user_id

    downloaded = download_library_asset(
        asset_id=asset_id,
        user_id=second_user_id,
        account_key_hint=shared_account_key,
    )
    assert downloaded["file_name"] == "account-hint.csv"
    assert downloaded["content"] == b"col_a,col_b\n77,88\n"


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


def test_list_library_assets_assigns_single_user_owner_for_ownerless_metadata(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id = _create_user(email="library-ownerless-meta@example.com")
    storage_root = (tmp_path / "data_library").resolve()
    storage_root.mkdir(parents=True, exist_ok=True)

    asset_id = "8ef94844-3396-4e63-804a-cdbb4bf6ff33"
    data_path = storage_root / f"{asset_id}.csv"
    data_bytes = b"col_a,col_b\n7,8\n"
    data_path.write_bytes(data_bytes)

    metadata_payload = {
        "id": asset_id,
        "owner_user_id": None,
        "owner_email": "",
        "project_id": None,
        "shared_with_user_ids": [],
        "filename": "ownerless.csv",
        "kind": "csv",
        "mime_type": "text/csv",
        "byte_size": len(data_bytes),
        "storage_path": str(data_path),
        "uploaded_at": "2026-02-26T00:00:00+00:00",
    }
    _metadata_path(storage_root, asset_id).write_text(
        json.dumps(metadata_payload),
        encoding="utf-8",
    )
    _metadata_index_path(storage_root).write_text(
        json.dumps({"asset_ids": [asset_id]}),
        encoding="utf-8",
    )

    payload = list_library_assets(project_id=None, user_id=user_id)
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert asset_id in listed_ids
    listed_row = next(
        item for item in payload.get("items", []) if str(item.get("id")) == asset_id
    )
    assert str(listed_row.get("owner_user_id") or "") == user_id


def test_list_library_assets_claims_ownerless_legacy_asset_to_first_requesting_user(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    first_user_id = _create_user(email="legacy-claim-first@example.com")
    second_user_id = _create_user(email="legacy-claim-second@example.com")
    storage_root = (tmp_path / "data_library").resolve()
    storage_root.mkdir(parents=True, exist_ok=True)

    asset_id = "dc3dd596-f8ba-4a4d-9ca1-0c5d8a98f82a"
    data_path = storage_root / f"{asset_id}.csv"
    data_bytes = b"col_a,col_b\n11,12\n"
    data_path.write_bytes(data_bytes)

    metadata_payload = {
        "id": asset_id,
        "owner_user_id": None,
        "owner_email": "",
        "project_id": None,
        "shared_with_user_ids": [],
        "filename": "legacy-claim.csv",
        "kind": "csv",
        "mime_type": "text/csv",
        "byte_size": len(data_bytes),
        "storage_path": str(data_path),
        "uploaded_at": "2026-02-26T00:00:00+00:00",
    }
    _metadata_path(storage_root, asset_id).write_text(
        json.dumps(metadata_payload),
        encoding="utf-8",
    )
    _metadata_index_path(storage_root).write_text(
        json.dumps({"asset_ids": [asset_id]}),
        encoding="utf-8",
    )

    first_payload = list_library_assets(project_id=None, user_id=first_user_id)
    first_ids = [str(item.get("id")) for item in first_payload.get("items", [])]
    assert asset_id in first_ids

    with session_scope() as session:
        row = session.get(DataLibraryAsset, asset_id)
        assert row is not None
        assert str(row.owner_user_id or "") == first_user_id

    second_payload = list_library_assets(project_id=None, user_id=second_user_id)
    second_ids = [str(item.get("id")) for item in second_payload.get("items", [])]
    assert asset_id not in second_ids


def test_list_library_assets_claims_orphan_project_asset_for_requesting_user(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id = _create_user(email="legacy-project-claim@example.com")
    storage_root = (tmp_path / "data_library").resolve()
    storage_root.mkdir(parents=True, exist_ok=True)

    data_path = storage_root / "legacy-project-asset.csv"
    data_bytes = b"col_a,col_b\n13,14\n"
    data_path.write_bytes(data_bytes)

    with session_scope() as session:
        project = Project(
            title="Legacy orphan project",
            target_journal="ehj",
            owner_user_id=None,
            collaborator_user_ids=[],
        )
        session.add(project)
        session.flush()
        project_id = str(project.id)

        asset = DataLibraryAsset(
            owner_user_id=None,
            project_id=project_id,
            shared_with_user_ids=None,
            filename="legacy-project-asset.csv",
            kind="csv",
            mime_type="text/csv",
            byte_size=len(data_bytes),
            storage_path=str(data_path),
        )
        session.add(asset)
        session.flush()
        asset_id = str(asset.id)

    payload = list_library_assets(project_id=None, user_id=user_id)
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert asset_id in listed_ids

    with session_scope() as session:
        refreshed_project = session.get(Project, project_id)
        refreshed_asset = session.get(DataLibraryAsset, asset_id)
        assert refreshed_project is not None
        assert refreshed_asset is not None
        assert str(refreshed_project.owner_user_id or "") == user_id
        assert str(refreshed_asset.owner_user_id or "") == user_id


def test_list_library_assets_owned_repairs_stale_owner_rows_when_user_has_owned_assets(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id = _create_user(email="owned-repair@example.com")
    storage_root = (tmp_path / "data_library").resolve()
    storage_root.mkdir(parents=True, exist_ok=True)

    owned_asset_id = upload_library_assets(
        files=[("owned.csv", "text/csv", b"col_a,col_b\n1,2\n")],
        project_id=None,
        user_id=user_id,
    )[0]

    stale_asset_path = storage_root / "stale-owner.csv"
    stale_bytes = b"col_a,col_b\n3,4\n"
    stale_asset_path.write_bytes(stale_bytes)

    with session_scope() as session:
        stale_row = DataLibraryAsset(
            owner_user_id="missing-user-id",
            project_id=None,
            shared_with_user_ids=[],
            filename="stale-owner.csv",
            kind="csv",
            mime_type="text/csv",
            byte_size=len(stale_bytes),
            storage_path=str(stale_asset_path),
        )
        session.add(stale_row)
        session.flush()
        stale_asset_id = str(stale_row.id)

    payload = list_library_assets(
        project_id=None,
        user_id=user_id,
        ownership="owned",
    )
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert owned_asset_id in listed_ids
    assert stale_asset_id in listed_ids

    with session_scope() as session:
        stale_row = session.get(DataLibraryAsset, stale_asset_id)
        assert stale_row is not None
        assert str(stale_row.owner_user_id or "") == user_id


def test_list_library_assets_claims_stale_owner_rows_even_with_other_valid_owners(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    requesting_user_id = _create_user(email="stale-owner-requester@example.com")
    other_user_id = _create_user(email="stale-owner-other@example.com")
    storage_root = (tmp_path / "data_library").resolve()
    storage_root.mkdir(parents=True, exist_ok=True)

    # Ensure at least one valid owner exists in the database.
    upload_library_assets(
        files=[("other-owned.csv", "text/csv", b"col_a,col_b\n1,2\n")],
        project_id=None,
        user_id=other_user_id,
    )

    stale_path = storage_root / "stale-owner-visible.csv"
    stale_bytes = b"col_a,col_b\n3,4\n"
    stale_path.write_bytes(stale_bytes)

    with session_scope() as session:
        stale_row = DataLibraryAsset(
            owner_user_id="missing-user-id",
            project_id=None,
            shared_with_user_ids=[],
            filename="stale-owner-visible.csv",
            kind="csv",
            mime_type="text/csv",
            byte_size=len(stale_bytes),
            storage_path=str(stale_path),
        )
        session.add(stale_row)
        session.flush()
        stale_asset_id = str(stale_row.id)

    payload = list_library_assets(project_id=None, user_id=requesting_user_id)
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert stale_asset_id in listed_ids

    with session_scope() as session:
        refreshed = session.get(DataLibraryAsset, stale_asset_id)
        assert refreshed is not None
        assert str(refreshed.owner_user_id or "") == requesting_user_id

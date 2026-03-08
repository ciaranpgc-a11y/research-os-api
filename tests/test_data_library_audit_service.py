from __future__ import annotations

import pytest

from research_os.db import DataLibraryAsset, User, create_all_tables, reset_database_state, session_scope
from research_os.services.data_planner_service import (
    PlannerValidationError,
    create_data_profile,
    download_library_asset,
    list_library_assets,
    update_library_asset_access,
    update_library_asset_metadata,
    upload_library_assets,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_test_data_library_audit_service.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str(tmp_path / "data_library"))
    reset_database_state()


def _create_user(*, email: str, name: str) -> str:
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


def _asset_for_user(user_id: str, asset_id: str) -> dict:
    items = list_library_assets(project_id=None, user_id=user_id)["items"]
    for item in items:
        if str(item.get("id") or "") == asset_id:
            return item
    raise AssertionError(f"Asset '{asset_id}' not found for user '{user_id}'.")


def test_library_asset_audit_logs_are_filtered_for_shared_editor(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    owner_id = _create_user(email="asset-owner@example.com", name="Asset Owner")
    editor_id = _create_user(email="asset-editor@example.com", name="Asset Editor")

    asset_id = upload_library_assets(
        files=[("audit-source.csv", "text/csv", b"col_a,col_b\n1,2\n")],
        user_id=owner_id,
    )[0]

    update_library_asset_access(
        asset_id=asset_id,
        user_id=owner_id,
        collaborators=[{"user_id": editor_id, "role": "editor"}],
    )
    update_library_asset_metadata(
        asset_id=asset_id,
        user_id=owner_id,
        filename="audit-renamed.csv",
    )
    download_library_asset(asset_id=asset_id, user_id=owner_id)
    download_library_asset(asset_id=asset_id, user_id=editor_id)

    owner_asset = _asset_for_user(owner_id, asset_id)
    owner_events = owner_asset["audit_log_entries"]
    owner_event_types = [str(entry.get("event_type") or "") for entry in owner_events]
    assert owner_event_types == [
        "asset_uploaded",
        "access_granted",
        "asset_renamed",
        "asset_downloaded",
        "asset_downloaded",
    ]

    editor_asset = _asset_for_user(editor_id, asset_id)
    editor_events = editor_asset["audit_log_entries"]
    editor_event_types = [str(entry.get("event_type") or "") for entry in editor_events]
    assert editor_event_types == [
        "asset_uploaded",
        "access_granted",
        "asset_renamed",
        "asset_downloaded",
    ]
    assert editor_asset["current_user_role"] == "editor"
    assert editor_asset["can_download"] is True
    assert sum(1 for entry in editor_events if entry.get("event_type") == "asset_downloaded") == 1
    assert str(editor_events[-1].get("actor_user_id") or "") == editor_id


def test_library_asset_audit_logs_restore_from_metadata(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    owner_id = _create_user(email="asset-restore-owner@example.com", name="Restore Owner")
    viewer_id = _create_user(email="asset-restore-viewer@example.com", name="Restore Viewer")

    asset_id = upload_library_assets(
        files=[("restore-source.csv", "text/csv", b"col_a,col_b\n3,4\n")],
        user_id=owner_id,
    )[0]
    update_library_asset_access(
        asset_id=asset_id,
        user_id=owner_id,
        collaborators=[{"user_id": viewer_id, "role": "viewer"}],
    )
    update_library_asset_metadata(
        asset_id=asset_id,
        user_id=owner_id,
        filename="restore-renamed.csv",
    )

    with session_scope() as session:
        row = session.get(DataLibraryAsset, asset_id)
        assert row is not None
        session.delete(row)

    restored_asset = _asset_for_user(owner_id, asset_id)
    restored_event_types = [
        str(entry.get("event_type") or "") for entry in restored_asset["audit_log_entries"]
    ]
    assert restored_event_types == [
        "asset_uploaded",
        "access_granted",
        "asset_renamed",
    ]
    assert restored_asset["shared_with"] == [
        {
            "user_id": viewer_id,
            "name": "Restore Viewer",
            "role": "viewer",
        }
    ]


def test_library_asset_access_roles_control_download_and_audit(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    owner_id = _create_user(email="asset-role-owner@example.com", name="Role Owner")
    editor_id = _create_user(email="asset-role-editor@example.com", name="Role Editor")
    viewer_id = _create_user(email="asset-role-viewer@example.com", name="Role Viewer")

    asset_id = upload_library_assets(
        files=[("role-source.csv", "text/csv", b"col_a,col_b\n5,6\n")],
        user_id=owner_id,
    )[0]

    update_library_asset_access(
        asset_id=asset_id,
        user_id=owner_id,
        collaborators=[
            {"user_id": editor_id, "role": "editor"},
            {"user_id": viewer_id, "role": "viewer"},
        ],
    )

    viewer_asset = _asset_for_user(viewer_id, asset_id)
    assert viewer_asset["current_user_role"] == "viewer"
    assert viewer_asset["can_download"] is False

    with pytest.raises(PlannerValidationError, match="Only file owners and editors can download files."):
        download_library_asset(asset_id=asset_id, user_id=viewer_id)

    with pytest.raises(PlannerValidationError, match="Only file owners and editors can analyse shared data files."):
        create_data_profile(asset_ids=[asset_id], user_id=viewer_id)

    update_library_asset_access(
        asset_id=asset_id,
        user_id=owner_id,
        collaborators=[
            {"user_id": editor_id, "role": "editor"},
            {"user_id": viewer_id, "role": "editor"},
        ],
    )

    promoted_asset = _asset_for_user(viewer_id, asset_id)
    promoted_event_types = [str(entry.get("event_type") or "") for entry in promoted_asset["audit_log_entries"]]
    assert promoted_asset["current_user_role"] == "editor"
    assert promoted_asset["can_download"] is True
    assert promoted_event_types == [
        "asset_uploaded",
        "access_granted",
        "access_role_changed",
    ]

    owner_asset = _asset_for_user(owner_id, asset_id)
    owner_event_types = [str(entry.get("event_type") or "") for entry in owner_asset["audit_log_entries"]]
    assert owner_event_types == [
        "asset_uploaded",
        "access_granted",
        "access_granted",
        "access_role_changed",
    ]

    downloaded = download_library_asset(asset_id=asset_id, user_id=viewer_id)
    assert downloaded["file_name"] == "role-source.csv"


def test_library_asset_lock_blocks_team_member_download_and_restores_on_unlock(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    owner_id = _create_user(email="asset-lock-owner@example.com", name="Lock Owner")
    editor_id = _create_user(email="asset-lock-editor@example.com", name="Lock Editor")

    asset_id = upload_library_assets(
        files=[("lock-source.csv", "text/csv", b"col_a,col_b\n7,8\n")],
        user_id=owner_id,
    )[0]

    update_library_asset_access(
        asset_id=asset_id,
        user_id=owner_id,
        collaborators=[{"user_id": editor_id, "role": "editor"}],
    )

    locked_asset = update_library_asset_metadata(
        asset_id=asset_id,
        user_id=owner_id,
        locked_for_team_members=True,
    )
    assert locked_asset["locked_for_team_members"] is True

    editor_asset = _asset_for_user(editor_id, asset_id)
    assert editor_asset["current_user_role"] == "editor"
    assert editor_asset["locked_for_team_members"] is True
    assert editor_asset["can_download"] is False

    with pytest.raises(PlannerValidationError, match="Only file owners and editors can download files."):
        download_library_asset(asset_id=asset_id, user_id=editor_id)

    with pytest.raises(PlannerValidationError, match="Only file owners and editors can analyse shared data files."):
        create_data_profile(asset_ids=[asset_id], user_id=editor_id)

    unlocked_asset = update_library_asset_metadata(
        asset_id=asset_id,
        user_id=owner_id,
        locked_for_team_members=False,
    )
    assert unlocked_asset["locked_for_team_members"] is False

    editor_asset_after_unlock = _asset_for_user(editor_id, asset_id)
    assert editor_asset_after_unlock["can_download"] is True
    assert [str(entry.get("event_type") or "") for entry in editor_asset_after_unlock["audit_log_entries"]] == [
        "asset_uploaded",
        "access_granted",
        "asset_locked",
        "asset_unlocked",
    ]


def test_library_asset_archive_is_personal_and_filters_by_scope(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    owner_id = _create_user(email="asset-archive-owner@example.com", name="Archive Owner")
    viewer_id = _create_user(email="asset-archive-viewer@example.com", name="Archive Viewer")

    asset_id = upload_library_assets(
        files=[("archive-source.csv", "text/csv", b"col_a,col_b\n9,10\n")],
        user_id=owner_id,
    )[0]

    update_library_asset_access(
        asset_id=asset_id,
        user_id=owner_id,
        collaborators=[{"user_id": viewer_id, "role": "viewer"}],
    )

    archived_asset = update_library_asset_metadata(
        asset_id=asset_id,
        user_id=viewer_id,
        archived_for_current_user=True,
    )
    assert archived_asset["archived_for_current_user"] is True

    viewer_all_items = list_library_assets(user_id=viewer_id, scope="all")["items"]
    assert len(viewer_all_items) == 1
    assert viewer_all_items[0]["archived_for_current_user"] is True

    viewer_active_items = list_library_assets(user_id=viewer_id, scope="active")["items"]
    assert viewer_active_items == []

    viewer_archived_items = list_library_assets(user_id=viewer_id, scope="archived")["items"]
    assert len(viewer_archived_items) == 1
    assert viewer_archived_items[0]["id"] == asset_id

    owner_items = list_library_assets(user_id=owner_id, scope="active")["items"]
    assert len(owner_items) == 1
    assert owner_items[0]["archived_for_current_user"] is False

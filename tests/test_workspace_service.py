from __future__ import annotations

from research_os.db import User, create_all_tables, reset_database_state, session_scope
from research_os.services.workspace_service import (
    WorkspaceNotFoundError,
    WorkspaceValidationError,
    accept_workspace_author_request,
    create_workspace_invitation,
    create_workspace_record,
    list_workspace_inbox_messages,
    list_workspace_inbox_reads,
    list_workspace_author_requests,
    list_workspace_invitations_sent,
    list_workspace_records,
    update_workspace_invitation_status,
    update_workspace_record,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "research_os_test_workspace_service.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    reset_database_state()


def _seed_user(*, email: str, name: str) -> str:
    with session_scope() as session:
        user = User(
            email=email,
            password_hash="test-hash",
            name=name,
        )
        session.add(user)
        session.flush()
        return str(user.id)


def _workspace_by_id(user_id: str, workspace_id: str) -> dict:
    items = list_workspace_records(user_id=user_id)["items"]
    for item in items:
        if item["id"] == workspace_id:
            return item
    raise AssertionError(f"Workspace '{workspace_id}' not found for user '{user_id}'.")


def _workspace_missing_for_user(user_id: str, workspace_id: str) -> bool:
    items = list_workspace_records(user_id=user_id)["items"]
    return all(item["id"] != workspace_id for item in items)


def _participant_ids(items: list[dict]) -> list[str]:
    return [str(item.get("user_id") or "") for item in items]


def test_declining_invitation_removes_pending_collaborator(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    owner_id = _seed_user(email="workspace-owner@example.com", name="Workspace Owner")
    invitee_id = _seed_user(email="workspace-invitee@example.com", name="Pending Invitee")

    workspace = create_workspace_record(
        user_id=owner_id,
        payload={"name": "Workspace Decline Flow", "owner_name": "Workspace Owner"},
    )
    invitation = create_workspace_invitation(
        user_id=owner_id,
        payload={
            "workspace_id": workspace["id"],
            "invitee_user_id": invitee_id,
            "role": "viewer",
        },
    )

    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert _participant_ids(owner_workspace["pending_collaborators"]) == [invitee_id]

    updated = update_workspace_invitation_status(
        user_id=owner_id,
        invitation_id=invitation["id"],
        status="declined",
    )

    assert updated["status"] == "declined"
    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert owner_workspace["pending_collaborators"] == []
    assert owner_workspace["pending_collaborator_roles"] == {}
    invitations = list_workspace_invitations_sent(user_id=owner_id)["items"]
    assert next(item for item in invitations if item["id"] == invitation["id"])["status"] == "declined"


def test_removed_collaborator_reinvite_returns_to_pending_then_back_to_active(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    owner_id = _seed_user(email="workspace-owner-reinvite@example.com", name="Workspace Owner")
    invitee_id = _seed_user(email="workspace-returning@example.com", name="Returning Collaborator")

    workspace = create_workspace_record(
        user_id=owner_id,
        payload={"name": "Workspace Reinvite Flow", "owner_name": "Workspace Owner"},
    )
    initial_invitation = create_workspace_invitation(
        user_id=owner_id,
        payload={
            "workspace_id": workspace["id"],
            "invitee_user_id": invitee_id,
            "role": "reviewer",
        },
    )
    request = list_workspace_author_requests(user_id=invitee_id)["items"][0]
    accept_workspace_author_request(user_id=invitee_id, request_id=request["id"])

    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    removed_participant = next(
        item for item in owner_workspace["collaborators"] if item["user_id"] == invitee_id
    )
    update_workspace_record(
        user_id=owner_id,
        workspace_id=workspace["id"],
        patch={
            "removed_collaborators": [removed_participant],
        },
    )

    removed_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert invitee_id in _participant_ids(removed_workspace["removed_collaborators"])
    assert _workspace_missing_for_user(invitee_id, workspace["id"]) is True

    for inbox_reader in (list_workspace_inbox_messages, list_workspace_inbox_reads):
        try:
            inbox_reader(user_id=invitee_id, workspace_id=workspace["id"])
        except WorkspaceNotFoundError:
            pass
        else:
            raise AssertionError("Expected removed collaborator workspace inbox access to be rejected.")

    reinvite = create_workspace_invitation(
        user_id=owner_id,
        payload={
            "workspace_id": workspace["id"],
            "invitee_user_id": invitee_id,
            "role": "viewer",
        },
    )

    pending_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert invitee_id in _participant_ids(pending_workspace["pending_collaborators"])
    assert pending_workspace["pending_collaborator_roles"][invitee_id] == "viewer"
    assert invitee_id in _participant_ids(pending_workspace["removed_collaborators"])

    pending_request = next(
        item
        for item in list_workspace_author_requests(user_id=invitee_id)["items"]
        if item["source_invitation_id"] == reinvite["id"]
    )
    accept_workspace_author_request(user_id=invitee_id, request_id=pending_request["id"])

    restored_workspace = _workspace_by_id(owner_id, workspace["id"])
    restored_collaborator_workspace = _workspace_by_id(invitee_id, workspace["id"])
    assert invitee_id not in _participant_ids(restored_workspace["pending_collaborators"])
    assert invitee_id not in _participant_ids(restored_workspace["removed_collaborators"])
    assert invitee_id in _participant_ids(restored_workspace["collaborators"])
    assert restored_workspace["collaborator_roles"][invitee_id] == "viewer"
    assert restored_collaborator_workspace["owner_user_id"] == owner_id

    invitations = list_workspace_invitations_sent(user_id=owner_id)["items"]
    assert next(item for item in invitations if item["id"] == initial_invitation["id"])["status"] == "accepted"
    assert next(item for item in invitations if item["id"] == reinvite["id"])["status"] == "accepted"


def test_workspace_role_edits_apply_for_pending_and_active_collaborators(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    owner_id = _seed_user(email="workspace-owner-roles@example.com", name="Workspace Owner")
    invitee_id = _seed_user(email="workspace-roles@example.com", name="Role Test Collaborator")

    workspace = create_workspace_record(
        user_id=owner_id,
        payload={"name": "Workspace Role Flow", "owner_name": "Workspace Owner"},
    )
    invitation = create_workspace_invitation(
        user_id=owner_id,
        payload={
            "workspace_id": workspace["id"],
            "invitee_user_id": invitee_id,
            "role": "editor",
        },
    )

    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    update_workspace_record(
        user_id=owner_id,
        workspace_id=workspace["id"],
        patch={
            "pending_collaborator_roles": {
                **owner_workspace["pending_collaborator_roles"],
                invitee_id: "reviewer",
            },
        },
    )

    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert owner_workspace["pending_collaborator_roles"][invitee_id] == "reviewer"

    pending_request = next(
        item
        for item in list_workspace_author_requests(user_id=invitee_id)["items"]
        if item["source_invitation_id"] == invitation["id"]
    )
    accept_workspace_author_request(user_id=invitee_id, request_id=pending_request["id"])

    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert owner_workspace["collaborator_roles"][invitee_id] == "reviewer"

    update_workspace_record(
        user_id=owner_id,
        workspace_id=workspace["id"],
        patch={
            "collaborator_roles": {
                **owner_workspace["collaborator_roles"],
                invitee_id: "viewer",
            },
        },
    )

    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert owner_workspace["collaborator_roles"][invitee_id] == "viewer"


def test_non_owner_cannot_rename_workspace_but_can_update_personal_pin_and_archive_while_owner_lock_is_shared_and_owner_keeps_edit_and_member_access(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    owner_id = _seed_user(email="workspace-owner-metadata@example.com", name="Workspace Owner")
    invitee_id = _seed_user(email="workspace-collaborator-metadata@example.com", name="Workspace Collaborator")

    workspace = create_workspace_record(
        user_id=owner_id,
        payload={"name": "Workspace Metadata Flow", "owner_name": "Workspace Owner"},
    )
    invitation = create_workspace_invitation(
        user_id=owner_id,
        payload={
            "workspace_id": workspace["id"],
            "invitee_user_id": invitee_id,
            "role": "editor",
        },
    )
    pending_request = next(
        item
        for item in list_workspace_author_requests(user_id=invitee_id)["items"]
        if item["source_invitation_id"] == invitation["id"]
    )
    accept_workspace_author_request(user_id=invitee_id, request_id=pending_request["id"])

    try:
        update_workspace_record(
            user_id=invitee_id,
            workspace_id=workspace["id"],
            patch={"name": "Collaborator Rename Attempt"},
        )
    except WorkspaceValidationError as exc:
        assert str(exc) == "Only the workspace owner can edit workspace details."
    else:
        raise AssertionError("Expected non-owner rename attempt to be rejected.")

    collaborator_workspace = _workspace_by_id(invitee_id, workspace["id"])
    assert collaborator_workspace["name"] == "Workspace Metadata Flow"

    update_workspace_record(
        user_id=invitee_id,
        workspace_id=workspace["id"],
        patch={"pinned": True, "archived": True},
    )

    collaborator_workspace = _workspace_by_id(invitee_id, workspace["id"])
    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert collaborator_workspace["pinned"] is True
    assert collaborator_workspace["archived"] is True
    assert owner_workspace["pinned"] is False
    assert owner_workspace["archived"] is False

    update_workspace_record(
        user_id=owner_id,
        workspace_id=workspace["id"],
        patch={"owner_archived": True},
    )

    collaborator_workspace = _workspace_by_id(invitee_id, workspace["id"])
    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert owner_workspace["archived"] is False
    assert owner_workspace["owner_archived"] is True
    assert collaborator_workspace["archived"] is True
    assert collaborator_workspace["owner_archived"] is True

    update_workspace_record(
        user_id=owner_id,
        workspace_id=workspace["id"],
        patch={"version": "2.0"},
    )

    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    collaborator_workspace = _workspace_by_id(invitee_id, workspace["id"])
    assert owner_workspace["version"] == "2.0"
    assert collaborator_workspace["version"] == "2.0"

    another_invitee_id = _seed_user(
        email="workspace-lock-governed@example.com",
        name="Locked Invitee",
    )
    locked_invitation = create_workspace_invitation(
        user_id=owner_id,
        payload={
            "workspace_id": workspace["id"],
            "invitee_user_id": another_invitee_id,
            "role": "viewer",
        },
    )
    locked_owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert another_invitee_id in _participant_ids(locked_owner_workspace["pending_collaborators"])
    assert locked_owner_workspace["pending_collaborator_roles"][another_invitee_id] == "viewer"

    update_workspace_record(
        user_id=owner_id,
        workspace_id=workspace["id"],
        patch={
            "pending_collaborator_roles": {
                **locked_owner_workspace["pending_collaborator_roles"],
                another_invitee_id: "reviewer",
            },
        },
    )
    locked_owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert locked_owner_workspace["pending_collaborator_roles"][another_invitee_id] == "reviewer"

    pending_request = next(
        item
        for item in list_workspace_author_requests(user_id=another_invitee_id)["items"]
        if item["source_invitation_id"] == locked_invitation["id"]
    )
    accept_workspace_author_request(user_id=another_invitee_id, request_id=pending_request["id"])
    locked_collaborator_workspace = _workspace_by_id(another_invitee_id, workspace["id"])
    assert locked_collaborator_workspace["owner_archived"] is True
    assert locked_collaborator_workspace["collaborator_roles"][another_invitee_id] == "reviewer"

    update_workspace_record(
        user_id=owner_id,
        workspace_id=workspace["id"],
        patch={"owner_archived": False},
    )

    collaborator_workspace = _workspace_by_id(invitee_id, workspace["id"])
    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    assert owner_workspace["archived"] is False
    assert owner_workspace["owner_archived"] is False
    assert collaborator_workspace["archived"] is True
    assert collaborator_workspace["owner_archived"] is False


def test_active_collaborator_receives_relevant_workspace_audit_log_subset(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    owner_id = _seed_user(email="workspace-owner-audit@example.com", name="Workspace Owner")
    invitee_id = _seed_user(email="workspace-collaborator-audit@example.com", name="Workspace Collaborator")

    workspace = create_workspace_record(
        user_id=owner_id,
        payload={"name": "Workspace Audit Model", "owner_name": "Workspace Owner"},
    )
    invitation = create_workspace_invitation(
        user_id=owner_id,
        payload={
            "workspace_id": workspace["id"],
            "invitee_user_id": invitee_id,
            "role": "editor",
        },
    )
    pending_request = next(
        item
        for item in list_workspace_author_requests(user_id=invitee_id)["items"]
        if item["source_invitation_id"] == invitation["id"]
    )
    accept_workspace_author_request(user_id=invitee_id, request_id=pending_request["id"])

    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    base_entries = list(owner_workspace.get("audit_log_entries") or [])
    shared_entry = {
        "id": f"{workspace['id']}-audit-shared-rename",
        "workspace_id": workspace["id"],
        "category": "workspace_changes",
        "event_type": "workspace_renamed",
        "actor_user_id": owner_id,
        "actor_name": "Workspace Owner",
        "subject_name": "Workspace",
        "from_value": "Workspace Audit Draft",
        "to_value": "Workspace Audit Model",
        "metadata": {},
        "message": "Workspace renamed from Workspace Audit Draft to Workspace Audit Model by Workspace Owner.",
        "created_at": "2026-03-06T09:00:00Z",
    }
    targeted_entry = {
        "id": f"{workspace['id']}-audit-role-targeted",
        "workspace_id": workspace["id"],
        "category": "collaborator_changes",
        "event_type": "member_role_changed",
        "actor_user_id": owner_id,
        "actor_name": "Workspace Owner",
        "subject_user_id": invitee_id,
        "subject_name": "Workspace Collaborator",
        "from_value": "editor",
        "to_value": "reviewer",
        "role": "reviewer",
        "metadata": {},
        "message": "Workspace Collaborator collaborator role switched from editor to reviewer by Workspace Owner.",
        "created_at": "2026-03-06T10:00:00Z",
    }
    unrelated_entry = {
        "id": f"{workspace['id']}-audit-other-member",
        "workspace_id": workspace["id"],
        "category": "collaborator_changes",
        "event_type": "member_removed",
        "actor_user_id": owner_id,
        "actor_name": "Workspace Owner",
        "subject_user_id": "someone-else",
        "subject_name": "Another Member",
        "from_value": "active",
        "to_value": "removed",
        "metadata": {},
        "message": "Another Member collaborator status switched from active to removed by Workspace Owner.",
        "created_at": "2026-03-06T11:00:00Z",
    }
    update_workspace_record(
        user_id=owner_id,
        workspace_id=workspace["id"],
        patch={"audit_log_entries": [unrelated_entry, targeted_entry, shared_entry, *base_entries]},
    )

    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    collaborator_workspace = _workspace_by_id(invitee_id, workspace["id"])

    assert any(
        entry.get("event_type") == "workspace_renamed"
        for entry in owner_workspace["audit_log_entries"]
    )
    collaborator_event_types = {
        entry.get("event_type") for entry in collaborator_workspace["audit_log_entries"]
    }
    assert "workspace_renamed" in collaborator_event_types
    assert "member_role_changed" in collaborator_event_types
    assert "member_removed" not in collaborator_event_types


def test_removed_collaborator_loses_workspace_and_cannot_receive_further_updates(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    owner_id = _seed_user(email="workspace-owner-removed@example.com", name="Workspace Owner")
    invitee_id = _seed_user(email="workspace-removed@example.com", name="Removed Collaborator")

    workspace = create_workspace_record(
        user_id=owner_id,
        payload={"name": "Workspace Removed Access", "owner_name": "Workspace Owner"},
    )
    invitation = create_workspace_invitation(
        user_id=owner_id,
        payload={
            "workspace_id": workspace["id"],
            "invitee_user_id": invitee_id,
            "role": "editor",
        },
    )
    pending_request = next(
        item
        for item in list_workspace_author_requests(user_id=invitee_id)["items"]
        if item["source_invitation_id"] == invitation["id"]
    )
    accept_workspace_author_request(user_id=invitee_id, request_id=pending_request["id"])

    owner_workspace = _workspace_by_id(owner_id, workspace["id"])
    removed_participant = next(
        item for item in owner_workspace["collaborators"] if item["user_id"] == invitee_id
    )
    update_workspace_record(
        user_id=owner_id,
        workspace_id=workspace["id"],
        patch={"removed_collaborators": [removed_participant]},
    )

    assert _workspace_missing_for_user(invitee_id, workspace["id"]) is True

    update_workspace_record(
        user_id=owner_id,
        workspace_id=workspace["id"],
        patch={"version": "3.0"},
    )
    assert _workspace_missing_for_user(invitee_id, workspace["id"]) is True

    try:
        update_workspace_record(
            user_id=invitee_id,
            workspace_id=workspace["id"],
            patch={"pinned": True},
        )
    except WorkspaceNotFoundError:
        pass
    else:
        raise AssertionError("Expected removed collaborator workspace mutation to be rejected.")

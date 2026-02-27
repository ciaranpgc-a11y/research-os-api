from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from research_os.api.app import app
from research_os.db import User, reset_database_state, session_scope


def _set_test_environment(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    import research_os.api.app as api_module

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_rbac_test.db"
    data_root = tmp_path / "data_library_store"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str(data_root))
    api_module.AUTH_REGISTER_RATE_LIMIT = 500
    api_module.AUTH_LOGIN_RATE_LIMIT = 500
    api_module.AUTH_PASSWORD_RESET_RATE_LIMIT = 500
    api_module._AUTH_RATE_LIMIT_EVENTS.clear()
    reset_database_state()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_user(
    client: TestClient,
    *,
    email: str,
    name: str,
    password: str = "StrongPassword123",
) -> dict[str, Any]:
    response = client.post(
        "/v1/auth/register",
        json={"email": email, "password": password, "name": name},
    )
    assert response.status_code == 200, response.text
    token = response.json()["session_token"]
    headers = _auth_headers(token)
    me = client.get("/v1/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    user = me.json()
    return {
        "id": user["id"],
        "name": name,
        "email": email,
        "token": token,
        "headers": headers,
    }


def _promote_to_admin(user_id: str) -> None:
    with session_scope() as session:
        user = session.get(User, user_id)
        assert user is not None
        user.role = "admin"


def _find_author_request_id(
    client: TestClient,
    *,
    headers: dict[str, str],
    workspace_id: str,
    inviter_user_id: str | None = None,
) -> str:
    response = client.get("/v1/workspaces/author-requests", headers=headers)
    assert response.status_code == 200, response.text
    items = response.json().get("items", [])
    for item in items:
        if item.get("workspace_id") != workspace_id:
            continue
        if inviter_user_id and item.get("source_inviter_user_id") != inviter_user_id:
            continue
        return str(item["id"])
    raise AssertionError(f"No author request found for workspace '{workspace_id}'.")


@pytest.fixture
def rbac_environment(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)


@pytest.fixture
def client(rbac_environment) -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def rbac_seed(client: TestClient) -> dict[str, Any]:
    users: dict[str, dict[str, Any]] = {}
    for alias, name, email in [
        ("owner_a", "Owner A", "rbac-owner-a@example.com"),
        ("admin_a", "Admin A", "rbac-admin-a@example.com"),
        ("editor_a", "Editor A", "rbac-editor-a@example.com"),
        ("viewer_a", "Viewer A", "rbac-viewer-a@example.com"),
        ("pending_a", "Pending A", "rbac-pending-a@example.com"),
        ("accepted_a", "Accepted A", "rbac-accepted-a@example.com"),
        ("revoked_a", "Revoked A", "rbac-revoked-a@example.com"),
        ("expired_a", "Expired A", "rbac-expired-a@example.com"),
        ("owner_b", "Owner B", "rbac-owner-b@example.com"),
        ("admin_b", "Admin B", "rbac-admin-b@example.com"),
        ("editor_b", "Editor B", "rbac-editor-b@example.com"),
        ("viewer_b", "Viewer B", "rbac-viewer-b@example.com"),
        ("pending_b", "Pending B", "rbac-pending-b@example.com"),
        ("outsider", "Outsider", "rbac-outsider@example.com"),
    ]:
        users[alias] = _register_user(client, email=email, name=name)

    _promote_to_admin(users["admin_a"]["id"])
    _promote_to_admin(users["admin_b"]["id"])

    workspace_a_create = client.post(
        "/v1/workspaces",
        headers=users["owner_a"]["headers"],
        json={
            "id": "workspace-a",
            "name": "Workspace A",
            "owner_name": users["owner_a"]["name"],
        },
    )
    assert workspace_a_create.status_code == 200, workspace_a_create.text

    workspace_b_create = client.post(
        "/v1/workspaces",
        headers=users["owner_b"]["headers"],
        json={
            "id": "workspace-b",
            "name": "Workspace B",
            "owner_name": users["owner_b"]["name"],
        },
    )
    assert workspace_b_create.status_code == 200, workspace_b_create.text

    workspace_a_patch = client.patch(
        "/v1/workspaces/workspace-a",
        headers=users["owner_a"]["headers"],
        json={
            "collaborators": [
                users["admin_a"]["name"],
                users["editor_a"]["name"],
                users["viewer_a"]["name"],
            ],
            "collaborator_roles": {
                users["admin_a"]["name"]: "editor",
                users["editor_a"]["name"]: "reviewer",
                users["viewer_a"]["name"]: "viewer",
            },
        },
    )
    assert workspace_a_patch.status_code == 200, workspace_a_patch.text

    workspace_b_patch = client.patch(
        "/v1/workspaces/workspace-b",
        headers=users["owner_b"]["headers"],
        json={
            "collaborators": [
                users["admin_b"]["name"],
                users["editor_b"]["name"],
                users["viewer_b"]["name"],
            ],
            "collaborator_roles": {
                users["admin_b"]["name"]: "editor",
                users["editor_b"]["name"]: "reviewer",
                users["viewer_b"]["name"]: "viewer",
            },
        },
    )
    assert workspace_b_patch.status_code == 200, workspace_b_patch.text

    project_a = client.post(
        "/v1/projects",
        headers=users["owner_a"]["headers"],
        json={
            "title": "Workspace A Project",
            "target_journal": "ehj",
            "workspace_id": "workspace-a",
            "collaborator_user_ids": [
                users["admin_a"]["id"],
                users["editor_a"]["id"],
                users["viewer_a"]["id"],
            ],
        },
    )
    assert project_a.status_code == 200, project_a.text

    project_b = client.post(
        "/v1/projects",
        headers=users["owner_b"]["headers"],
        json={
            "title": "Workspace B Project",
            "target_journal": "ehj",
            "workspace_id": "workspace-b",
            "collaborator_user_ids": [
                users["admin_b"]["id"],
                users["editor_b"]["id"],
                users["viewer_b"]["id"],
            ],
        },
    )
    assert project_b.status_code == 200, project_b.text

    project_a_id = project_a.json()["id"]
    project_b_id = project_b.json()["id"]

    encoded_a = base64.b64encode(b"row,value\nA,1\n").decode("ascii")
    encoded_b = base64.b64encode(b"row,value\nB,2\n").decode("ascii")

    asset_a_upload = client.post(
        "/v1/library/assets/upload",
        headers=users["owner_a"]["headers"],
        json={
            "project_id": project_a_id,
            "files": [
                {
                    "filename": "workspace-a.csv",
                    "mime_type": "text/csv",
                    "content_base64": encoded_a,
                }
            ],
        },
    )
    assert asset_a_upload.status_code == 200, asset_a_upload.text

    asset_b_upload = client.post(
        "/v1/library/assets/upload",
        headers=users["owner_b"]["headers"],
        json={
            "project_id": project_b_id,
            "files": [
                {
                    "filename": "workspace-b.csv",
                    "mime_type": "text/csv",
                    "content_base64": encoded_b,
                }
            ],
        },
    )
    assert asset_b_upload.status_code == 200, asset_b_upload.text

    asset_a_id = asset_a_upload.json()["asset_ids"][0]
    asset_b_id = asset_b_upload.json()["asset_ids"][0]

    for workspace_key, owner_alias, asset_id, collaborator_aliases in [
        ("workspace-a", "owner_a", asset_a_id, ["admin_a", "editor_a", "viewer_a"]),
        ("workspace-b", "owner_b", asset_b_id, ["admin_b", "editor_b", "viewer_b"]),
    ]:
        update_access = client.patch(
            f"/v1/library/assets/{asset_id}/access",
            headers=users[owner_alias]["headers"],
            json={
                "collaborator_user_ids": [users[alias]["id"] for alias in collaborator_aliases],
                "collaborator_names": [users[alias]["name"] for alias in collaborator_aliases],
            },
        )
        assert update_access.status_code == 200, (workspace_key, update_access.text)

    now = datetime.now(timezone.utc)
    old_invite_time = (now - timedelta(days=40)).isoformat()

    pending_a = client.post(
        "/v1/workspaces/invitations/sent",
        headers=users["owner_a"]["headers"],
        json={
            "workspace_id": "workspace-a",
            "invitee_name": users["pending_a"]["name"],
            "role": "viewer",
        },
    )
    assert pending_a.status_code == 200, pending_a.text

    accepted_a = client.post(
        "/v1/workspaces/invitations/sent",
        headers=users["owner_a"]["headers"],
        json={
            "workspace_id": "workspace-a",
            "invitee_name": users["accepted_a"]["name"],
            "role": "reviewer",
        },
    )
    assert accepted_a.status_code == 200, accepted_a.text

    accepted_request_id = _find_author_request_id(
        client,
        headers=users["accepted_a"]["headers"],
        workspace_id="workspace-a",
        inviter_user_id=users["owner_a"]["id"],
    )
    accepted_apply = client.post(
        f"/v1/workspaces/author-requests/{accepted_request_id}/accept",
        headers=users["accepted_a"]["headers"],
        json={},
    )
    assert accepted_apply.status_code == 200, accepted_apply.text

    revoked_a = client.post(
        "/v1/workspaces/invitations/sent",
        headers=users["owner_a"]["headers"],
        json={
            "workspace_id": "workspace-a",
            "invitee_name": users["revoked_a"]["name"],
            "role": "viewer",
        },
    )
    assert revoked_a.status_code == 200, revoked_a.text

    revoked_update = client.patch(
        f"/v1/workspaces/invitations/sent/{revoked_a.json()['id']}",
        headers=users["owner_a"]["headers"],
        json={"status": "declined"},
    )
    assert revoked_update.status_code == 200, revoked_update.text

    expired_a = client.post(
        "/v1/workspaces/invitations/sent",
        headers=users["owner_a"]["headers"],
        json={
            "workspace_id": "workspace-a",
            "invitee_name": users["expired_a"]["name"],
            "role": "reviewer",
            "invited_at": old_invite_time,
            "expires_at": (now - timedelta(days=10)).isoformat(),
        },
    )
    assert expired_a.status_code == 200, expired_a.text

    pending_b = client.post(
        "/v1/workspaces/invitations/sent",
        headers=users["owner_b"]["headers"],
        json={
            "workspace_id": "workspace-b",
            "invitee_name": users["pending_b"]["name"],
            "role": "viewer",
        },
    )
    assert pending_b.status_code == 200, pending_b.text

    role_headers = {
        "OwnerA": users["owner_a"]["headers"],
        "AdminA": users["admin_a"]["headers"],
        "EditorA": users["editor_a"]["headers"],
        "ViewerA": users["viewer_a"]["headers"],
        "OwnerB": users["owner_b"]["headers"],
        "AdminB": users["admin_b"]["headers"],
        "EditorB": users["editor_b"]["headers"],
        "ViewerB": users["viewer_b"]["headers"],
        "Outsider": users["outsider"]["headers"],
    }

    return {
        "users": users,
        "role_headers": role_headers,
        "workspaces": {
            "a": {"id": "workspace-a", "owner_alias": "owner_a"},
            "b": {"id": "workspace-b", "owner_alias": "owner_b"},
        },
        "projects": {
            "a": project_a_id,
            "b": project_b_id,
        },
        "assets": {
            "a": asset_a_id,
            "b": asset_b_id,
        },
        "invitations": {
            "workspace_a": {
                "pending": pending_a.json(),
                "accepted": accepted_a.json(),
                "revoked": revoked_a.json(),
                "expired": expired_a.json(),
            },
            "workspace_b": {
                "pending": pending_b.json(),
            },
        },
    }

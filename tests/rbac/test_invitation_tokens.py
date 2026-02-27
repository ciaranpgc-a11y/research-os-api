from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient


def _workspace_record(
    client: TestClient,
    *,
    headers: dict[str, str],
    workspace_id: str,
) -> dict[str, Any]:
    response = client.get("/v1/workspaces", headers=headers)
    assert response.status_code == 200, response.text
    for item in response.json().get("items", []):
        if item.get("id") == workspace_id:
            return item
    raise AssertionError(f"Workspace '{workspace_id}' not found.")


def _owner_denied_invite_logs(
    client: TestClient,
    *,
    owner_headers: dict[str, str],
) -> list[dict[str, Any]]:
    workspace = _workspace_record(
        client,
        headers=owner_headers,
        workspace_id="workspace-a",
    )
    return [
        entry
        for entry in workspace.get("audit_log_entries", [])
        if entry.get("action") == "workspace.invitation.accept"
        and entry.get("outcome") == "denied"
    ]


def _workspace_state(client: TestClient, *, headers: dict[str, str]) -> dict[str, Any]:
    response = client.get("/v1/workspaces/state", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _save_workspace_state(
    client: TestClient,
    *,
    headers: dict[str, str],
    state: dict[str, Any],
) -> dict[str, Any]:
    response = client.put("/v1/workspaces/state", headers=headers, json=state)
    assert response.status_code == 200, response.text
    return response.json()


def _append_author_request(
    client: TestClient,
    *,
    headers: dict[str, str],
    request_payload: dict[str, Any],
) -> str:
    state = _workspace_state(client, headers=headers)
    requests = list(state.get("author_requests") or [])
    request_id = request_payload["id"]
    requests = [item for item in requests if item.get("id") != request_id]
    requests.insert(0, request_payload)
    state["author_requests"] = requests
    _save_workspace_state(client, headers=headers, state=state)
    return request_id


def _find_author_request_id(
    client: TestClient,
    *,
    headers: dict[str, str],
    workspace_id: str,
) -> str:
    response = client.get("/v1/workspaces/author-requests", headers=headers)
    assert response.status_code == 200, response.text
    for item in response.json().get("items", []):
        if item.get("workspace_id") == workspace_id:
            return str(item["id"])
    raise AssertionError(f"Author request for '{workspace_id}' not found.")


def test_expired_invitation_token_is_rejected(
    client: TestClient,
    rbac_seed: dict[str, Any],
) -> None:
    expired_headers = rbac_seed["users"]["expired_a"]["headers"]
    owner_headers = rbac_seed["users"]["owner_a"]["headers"]

    request_id = _find_author_request_id(
        client,
        headers=expired_headers,
        workspace_id="workspace-a",
    )
    response = client.post(
        f"/v1/workspaces/author-requests/{request_id}/accept",
        headers=expired_headers,
        json={},
    )
    assert response.status_code == 400
    assert "expired" in response.json()["error"]["detail"].lower()

    logs = _owner_denied_invite_logs(client, owner_headers=owner_headers)
    assert any("expired" in str(entry.get("message", "")).lower() for entry in logs)


def test_revoked_invitation_token_is_rejected(
    client: TestClient,
    rbac_seed: dict[str, Any],
) -> None:
    revoked_headers = rbac_seed["users"]["revoked_a"]["headers"]
    owner_headers = rbac_seed["users"]["owner_a"]["headers"]
    owner_user = rbac_seed["users"]["owner_a"]
    revoked_invitation_id = rbac_seed["invitations"]["workspace_a"]["revoked"]["id"]

    request_id = _append_author_request(
        client,
        headers=revoked_headers,
        request_payload={
            "id": "edge-revoked-request",
            "workspace_id": "workspace-a",
            "workspace_name": "Workspace A",
            "author_name": owner_user["name"],
            "collaborator_role": "viewer",
            "invited_at": datetime.now(timezone.utc).isoformat(),
            "source_inviter_user_id": owner_user["id"],
            "source_invitation_id": revoked_invitation_id,
        },
    )

    response = client.post(
        f"/v1/workspaces/author-requests/{request_id}/accept",
        headers=revoked_headers,
        json={},
    )
    assert response.status_code == 400
    assert "revoked" in response.json()["error"]["detail"].lower()

    logs = _owner_denied_invite_logs(client, owner_headers=owner_headers)
    assert any("revoked" in str(entry.get("message", "")).lower() for entry in logs)


def test_already_accepted_invitation_token_is_rejected(
    client: TestClient,
    rbac_seed: dict[str, Any],
) -> None:
    accepted_headers = rbac_seed["users"]["accepted_a"]["headers"]
    owner_headers = rbac_seed["users"]["owner_a"]["headers"]
    owner_user = rbac_seed["users"]["owner_a"]
    accepted_invitation_id = rbac_seed["invitations"]["workspace_a"]["accepted"]["id"]

    request_id = _append_author_request(
        client,
        headers=accepted_headers,
        request_payload={
            "id": "edge-accepted-request",
            "workspace_id": "workspace-a",
            "workspace_name": "Workspace A",
            "author_name": owner_user["name"],
            "collaborator_role": "reviewer",
            "invited_at": datetime.now(timezone.utc).isoformat(),
            "source_inviter_user_id": owner_user["id"],
            "source_invitation_id": accepted_invitation_id,
        },
    )

    response = client.post(
        f"/v1/workspaces/author-requests/{request_id}/accept",
        headers=accepted_headers,
        json={},
    )
    assert response.status_code == 400
    assert "already been accepted" in response.json()["error"]["detail"].lower()

    logs = _owner_denied_invite_logs(client, owner_headers=owner_headers)
    assert any("already been accepted" in str(entry.get("message", "")).lower() for entry in logs)


def test_wrong_workspace_token_usage_is_rejected(
    client: TestClient,
    rbac_seed: dict[str, Any],
) -> None:
    pending_headers = rbac_seed["users"]["pending_a"]["headers"]
    owner_headers = rbac_seed["users"]["owner_a"]["headers"]

    state = _workspace_state(client, headers=pending_headers)
    requests = list(state.get("author_requests") or [])
    assert requests, "Expected at least one pending invitation request."
    requests[0]["workspace_id"] = "workspace-b"
    requests[0]["workspace_name"] = "Workspace B"
    request_id = str(requests[0]["id"])
    state["author_requests"] = requests
    _save_workspace_state(client, headers=pending_headers, state=state)

    response = client.post(
        f"/v1/workspaces/author-requests/{request_id}/accept",
        headers=pending_headers,
        json={},
    )
    assert response.status_code == 400
    assert "does not match" in response.json()["error"]["detail"].lower()

    logs = _owner_denied_invite_logs(client, owner_headers=owner_headers)
    assert any("does not match" in str(entry.get("message", "")).lower() for entry in logs)

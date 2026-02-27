from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

MATRIX_PATH = Path(__file__).with_name("permission_matrix.json")


def _load_matrix() -> dict[str, Any]:
    return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))


def _role_alias(workspace_key: str, role: str) -> str:
    if role == "outsider":
        return "outsider"
    return f"{role}_{workspace_key}"


def _target_workspace(scope: str, workspace_key: str) -> str:
    if scope == "same":
        return f"workspace-{workspace_key}"
    return "workspace-b" if workspace_key == "a" else "workspace-a"


def _target_workspace_key(scope: str, workspace_key: str) -> str:
    if scope == "same":
        return workspace_key
    return "b" if workspace_key == "a" else "a"


def _workspace_owner_alias(workspace_key: str) -> str:
    return f"owner_{workspace_key}"


def _actor_headers(seed: dict[str, Any], workspace_key: str, role: str) -> dict[str, str]:
    alias = _role_alias(workspace_key, role)
    return seed["users"][alias]["headers"]


def _actor_name(seed: dict[str, Any], workspace_key: str, role: str) -> str:
    alias = _role_alias(workspace_key, role)
    return seed["users"][alias]["name"]


def _actor_id(seed: dict[str, Any], workspace_key: str, role: str) -> str:
    alias = _role_alias(workspace_key, role)
    return seed["users"][alias]["id"]


def _workspace_records(client: TestClient, headers: dict[str, str]) -> list[dict[str, Any]]:
    response = client.get("/v1/workspaces", headers=headers)
    assert response.status_code == 200, response.text
    return response.json().get("items", [])


def _workspace_record_by_id(
    client: TestClient,
    *,
    headers: dict[str, str],
    workspace_id: str,
) -> dict[str, Any] | None:
    for item in _workspace_records(client, headers):
        if item.get("id") == workspace_id:
            return item
    return None


def _execute_action(
    client: TestClient,
    *,
    seed: dict[str, Any],
    action_id: str,
    workspace_key: str,
    scope: str,
    role: str,
) -> dict[str, Any]:
    target_workspace_key = _target_workspace_key(scope, workspace_key)
    target_workspace_id = _target_workspace(scope, workspace_key)
    actor_headers = _actor_headers(seed, workspace_key, role)
    actor_name = _actor_name(seed, workspace_key, role)
    target_asset_id = seed["assets"][target_workspace_key]
    target_project_id = seed["projects"][target_workspace_key]

    result: dict[str, Any] = {
        "status_code": None,
        "allowed": False,
        "target_workspace_id": target_workspace_id,
        "target_workspace_key": target_workspace_key,
        "target_asset_id": target_asset_id,
        "response": None,
    }

    if action_id == "workspace.list.visibility":
        response = client.get("/v1/workspaces", headers=actor_headers)
        assert response.status_code == 200, response.text
        items = response.json().get("items", [])
        result["status_code"] = response.status_code
        result["allowed"] = any(item.get("id") == target_workspace_id for item in items)
        result["response"] = response
        return result

    if action_id == "workspace.run_context.read":
        response = client.get(
            f"/v1/workspaces/{target_workspace_id}/run-context",
            headers=actor_headers,
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        result["status_code"] = response.status_code
        result["allowed"] = bool(payload.get("project_id"))
        result["response"] = response
        return result

    if action_id == "workspace.collaborators.update":
        editor_name = seed["users"][f"editor_{target_workspace_key}"]["name"]
        response = client.patch(
            f"/v1/workspaces/{target_workspace_id}",
            headers=actor_headers,
            json={
                "collaborator_roles": {
                    editor_name: "reviewer",
                }
            },
        )
        result["status_code"] = response.status_code
        result["allowed"] = response.status_code == 200
        result["response"] = response
        return result

    if action_id == "workspace.invitation.create":
        unique = int(time.time() * 1000000)
        response = client.post(
            "/v1/workspaces/invitations/sent",
            headers=actor_headers,
            json={
                "workspace_id": target_workspace_id,
                "invitee_name": f"Invite {workspace_key}-{scope}-{role}-{unique}",
                "role": "viewer",
            },
        )
        result["status_code"] = response.status_code
        result["allowed"] = response.status_code == 200
        result["response"] = response
        return result

    if action_id == "workspace.inbox.message.create":
        unique = int(time.time() * 1000000)
        response = client.post(
            "/v1/workspaces/inbox/messages",
            headers=actor_headers,
            json={
                "id": f"msg-{workspace_key}-{scope}-{role}-{unique}",
                "workspace_id": target_workspace_id,
                "sender_name": actor_name,
                "encrypted_body": "YWJj",
                "iv": "aXY=",
            },
        )
        result["status_code"] = response.status_code
        result["allowed"] = response.status_code == 200
        result["response"] = response
        return result

    if action_id == "library.asset.list":
        response = client.get(
            "/v1/library/assets",
            headers=actor_headers,
            params={"project_id": target_project_id},
        )
        result["status_code"] = response.status_code
        if response.status_code != 200:
            result["allowed"] = False
            result["response"] = response
            return result
        items = response.json().get("items", [])
        result["allowed"] = any(item.get("id") == target_asset_id for item in items)
        result["response"] = response
        return result

    if action_id == "library.asset.download":
        response = client.get(
            f"/v1/library/assets/{target_asset_id}/download",
            headers=actor_headers,
        )
        result["status_code"] = response.status_code
        result["allowed"] = response.status_code == 200
        result["response"] = response
        return result

    if action_id == "library.asset.rename":
        unique = int(time.time() * 1000000)
        response = client.patch(
            f"/v1/library/assets/{target_asset_id}",
            headers=actor_headers,
            json={"filename": f"renamed-{workspace_key}-{scope}-{role}-{unique}.csv"},
        )
        result["status_code"] = response.status_code
        result["allowed"] = response.status_code == 200
        result["response"] = response
        return result

    if action_id == "library.asset.access.update":
        collaborator_aliases = [
            f"admin_{target_workspace_key}",
            f"editor_{target_workspace_key}",
            f"viewer_{target_workspace_key}",
        ]
        collaborator_user_ids = [
            seed["users"][alias]["id"] for alias in collaborator_aliases
        ]
        collaborator_names = [
            seed["users"][alias]["name"] for alias in collaborator_aliases
        ]
        response = client.patch(
            f"/v1/library/assets/{target_asset_id}/access",
            headers=actor_headers,
            json={
                "collaborator_user_ids": collaborator_user_ids,
                "collaborator_names": collaborator_names,
            },
        )
        result["status_code"] = response.status_code
        result["allowed"] = response.status_code == 200
        result["response"] = response
        return result

    if action_id == "library.asset.audit.append.roles":
        viewer_alias = f"viewer_{target_workspace_key}"
        response = client.post(
            f"/v1/library/assets/{target_asset_id}/audit-logs",
            headers=actor_headers,
            json={
                "collaborator_name": seed["users"][viewer_alias]["name"],
                "collaborator_user_id": seed["users"][viewer_alias]["id"],
                "category": "roles",
                "from_label": "Viewer",
                "to_label": "Editor",
            },
        )
        result["status_code"] = response.status_code
        result["allowed"] = response.status_code == 200
        result["response"] = response
        return result

    if action_id == "library.asset.audit.append.activity":
        response = client.post(
            f"/v1/library/assets/{target_asset_id}/audit-logs",
            headers=actor_headers,
            json={
                "collaborator_name": actor_name,
                "collaborator_user_id": _actor_id(seed, workspace_key, role),
                "category": "activity",
                "to_label": "Viewed",
            },
        )
        result["status_code"] = response.status_code
        result["allowed"] = response.status_code == 200
        result["response"] = response
        return result

    raise AssertionError(f"Unknown action id: {action_id}")


def _assert_workspace_audit(
    client: TestClient,
    *,
    seed: dict[str, Any],
    action_id: str,
    workspace_key: str,
    role: str,
    expected_outcome: str,
) -> None:
    # Canonical workspace security audit is owner-scoped.
    if role == "outsider" and expected_outcome == "denied":
        return
    owner_headers = seed["users"][_workspace_owner_alias(workspace_key)]["headers"]
    workspace_id = f"workspace-{workspace_key}"
    record = _workspace_record_by_id(
        client,
        headers=owner_headers,
        workspace_id=workspace_id,
    )
    if record is None:
        return
    entries = record.get("audit_log_entries") or []
    actor_name = _actor_name(seed, workspace_key, role)
    assert any(
        entry.get("action") == action_id
        and entry.get("outcome") == expected_outcome
        and entry.get("actor") == actor_name
        for entry in entries
    ), f"Missing workspace audit log: action={action_id}, outcome={expected_outcome}, role={role}, workspace={workspace_key}"


def _assert_library_audit(
    client: TestClient,
    *,
    seed: dict[str, Any],
    action_id: str,
    actor_workspace_key: str,
    role: str,
    target_workspace_key: str,
    expected_outcome: str,
) -> None:
    if role == "outsider" and expected_outcome == "denied":
        return
    canonical_action = {
        "library.asset.audit.append.roles": "library.asset.audit.append",
        "library.asset.audit.append.activity": "library.asset.audit.append",
    }.get(action_id, action_id)
    owner_alias = _workspace_owner_alias(target_workspace_key)
    owner_headers = seed["users"][owner_alias]["headers"]
    asset_id = seed["assets"][target_workspace_key]
    response = client.get(
        f"/v1/library/assets/{asset_id}/audit-logs",
        headers=owner_headers,
    )
    assert response.status_code == 200, response.text
    entries = response.json().get("items", [])
    actor_id = _actor_id(seed, actor_workspace_key, role)
    assert any(
        entry.get("action") == canonical_action
        and entry.get("outcome") == expected_outcome
        and entry.get("actor_user_id") == actor_id
        for entry in entries
    ), (
        "Missing library audit log: "
        f"action={action_id}, outcome={expected_outcome}, role={role}, "
        f"actor_workspace={actor_workspace_key}, target_workspace={target_workspace_key}"
    )


@pytest.mark.parametrize("workspace_key", ["a", "b"])
def test_rbac_permission_matrix_and_audit_logs(
    client: TestClient,
    rbac_seed: dict[str, Any],
    workspace_key: str,
) -> None:
    matrix = _load_matrix()
    roles = matrix["roles"]

    for action in matrix["actions"]:
        action_id = action["id"]
        sensitive = bool(action.get("sensitive"))
        for scope in ["same", "cross"]:
            for role in roles:
                expected = action["expect"][scope][role]
                expected_allowed = expected == "allow"
                result = _execute_action(
                    client,
                    seed=rbac_seed,
                    action_id=action_id,
                    workspace_key=workspace_key,
                    scope=scope,
                    role=role,
                )
                assert result["allowed"] == expected_allowed, (
                    f"Permission mismatch for action={action_id}, workspace={workspace_key}, "
                    f"scope={scope}, role={role}, status={result['status_code']}"
                )

                if not sensitive:
                    continue

                # Workspace cross-scope denies intentionally return not-found semantics.
                if action_id.startswith("workspace.") and scope == "cross":
                    continue
                # Some library deny paths intentionally use not-found semantics and
                # therefore do not emit actor-addressable denied audit entries.
                if (
                    action_id.startswith("library.")
                    and not expected_allowed
                    and result["status_code"] == 404
                ):
                    continue

                expected_outcome = "allowed" if expected_allowed else "denied"
                if action_id.startswith("workspace."):
                    _assert_workspace_audit(
                        client,
                        seed=rbac_seed,
                        action_id=action_id,
                        workspace_key=workspace_key,
                        role=role,
                        expected_outcome=expected_outcome,
                    )
                elif action_id.startswith("library."):
                    _assert_library_audit(
                        client,
                        seed=rbac_seed,
                        action_id=action_id,
                        actor_workspace_key=workspace_key,
                        role=role,
                        target_workspace_key=result["target_workspace_key"],
                        expected_outcome=expected_outcome,
                    )

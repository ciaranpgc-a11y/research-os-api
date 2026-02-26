from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select

from research_os.db import (
    User,
    WorkspaceInboxStateCache,
    WorkspaceStateCache,
    create_all_tables,
    session_scope,
)


WORKSPACE_HEALTH_VALUES = {"green", "amber", "red"}
INVITATION_STATUS_VALUES = {"pending", "accepted", "declined"}
WORKSPACE_COLLABORATOR_ROLE_VALUES = {"editor", "reviewer", "viewer"}
WORKSPACE_FALLBACK_NAME = "Workspace"
WORKSPACE_FALLBACK_OWNER_NAME = "Not set"


class WorkspaceValidationError(RuntimeError):
    pass


class WorkspaceNotFoundError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _trim(value: Any) -> str:
    return str(value or "").strip()


def _normalize_name(value: Any) -> str:
    return " ".join(_trim(value).split())


def _parse_timestamp(value: Any) -> datetime | None:
    clean = _trim(value)
    if not clean:
        return None
    try:
        parsed = datetime.fromisoformat(clean.replace("Z", "+00:00"))
    except Exception:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _iso_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_timestamp(value: Any) -> str:
    parsed = _parse_timestamp(value)
    if parsed is None:
        parsed = _utcnow()
    return _iso_timestamp(parsed)


def _normalize_str_list(values: Any) -> list[str]:
    source = values if isinstance(values, list) else []
    seen: set[str] = set()
    output: list[str] = []
    for item in source:
        clean = _normalize_name(item)
        if not clean:
            continue
        key = clean.casefold()
        if key in seen:
            continue
        seen.add(key)
        output.append(clean)
    return output


def _normalize_collaborator_role(value: Any) -> str:
    clean = _trim(value).lower()
    if clean in WORKSPACE_COLLABORATOR_ROLE_VALUES:
        return clean
    return "editor"


def _normalize_role_map(values: Any, allowed_names: list[str]) -> dict[str, str]:
    source = values if isinstance(values, dict) else {}
    canonical_by_key: dict[str, str] = {}
    for name in allowed_names:
        clean = _normalize_name(name)
        if not clean:
            continue
        canonical_by_key[clean.casefold()] = clean

    output: dict[str, str] = {}
    for raw_name, raw_role in source.items():
        clean_name = _normalize_name(raw_name)
        if not clean_name:
            continue
        canonical = canonical_by_key.get(clean_name.casefold())
        if not canonical:
            continue
        output[canonical] = _normalize_collaborator_role(raw_role)

    for canonical in canonical_by_key.values():
        if canonical not in output:
            output[canonical] = "editor"
    return output


def _slugify_workspace_id(value: str) -> str:
    lowered = value.strip().lower()
    cleaned = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    if not cleaned:
        cleaned = f"workspace-{uuid4().hex[:8]}"
    return cleaned


def _workspace_ids(workspaces: list[dict[str, Any]]) -> set[str]:
    return {_trim(item.get("id")) for item in workspaces if _trim(item.get("id"))}


def _ensure_unique_workspace_id(
    *, desired_id: str, existing_ids: set[str], reserve_current: str | None = None
) -> str:
    base = _trim(desired_id)
    if not base:
        base = f"workspace-{uuid4().hex[:8]}"
    candidate = base
    attempt = 1
    reserved = _trim(reserve_current) or None
    while candidate in existing_ids and candidate != reserved:
        candidate = f"{base}-{attempt}"
        attempt += 1
    return candidate


def _normalize_workspace_record(payload: Any) -> dict[str, Any]:
    source = payload if isinstance(payload, dict) else {}
    workspace_id = _trim(source.get("id"))
    if not workspace_id:
        workspace_id = f"workspace-{uuid4().hex[:10]}"

    owner_name = _normalize_name(source.get("owner_name")) or WORKSPACE_FALLBACK_OWNER_NAME
    owner_key = owner_name.casefold()
    collaborators = [
        value
        for value in _normalize_str_list(source.get("collaborators"))
        if value.casefold() != owner_key
    ]
    collaborator_key_set = {name.casefold() for name in collaborators}
    removed = [
        value
        for value in _normalize_str_list(source.get("removed_collaborators"))
        if value.casefold() in collaborator_key_set
    ]
    removed_keys = {value.casefold() for value in removed}
    active_collaborator_keys = {
        value.casefold() for value in collaborators if value.casefold() not in removed_keys
    }
    pending = [
        value
        for value in _normalize_str_list(source.get("pending_collaborators"))
        if value.casefold() not in active_collaborator_keys
        and value.casefold() != owner_key
    ]
    collaborator_roles = _normalize_role_map(
        source.get("collaborator_roles"), collaborators
    )
    pending_collaborator_roles = _normalize_role_map(
        source.get("pending_collaborator_roles"), pending
    )
    health = _trim(source.get("health")).lower()
    if health not in WORKSPACE_HEALTH_VALUES:
        health = "amber"

    return {
        "id": workspace_id,
        "name": _normalize_name(source.get("name")) or WORKSPACE_FALLBACK_NAME,
        "owner_name": owner_name,
        "collaborators": collaborators,
        "pending_collaborators": pending,
        "collaborator_roles": collaborator_roles,
        "pending_collaborator_roles": pending_collaborator_roles,
        "removed_collaborators": removed,
        "version": _trim(source.get("version")) or "0.1",
        "health": health,
        "updated_at": _normalize_timestamp(source.get("updated_at")),
        "pinned": bool(source.get("pinned")),
        "archived": bool(source.get("archived")),
    }


def _normalize_author_request(payload: Any) -> dict[str, Any]:
    source = payload if isinstance(payload, dict) else {}
    workspace_id = _trim(source.get("workspace_id")) or f"workspace-{uuid4().hex[:10]}"
    normalized = {
        "id": _trim(source.get("id")) or f"author-request-{uuid4().hex[:10]}",
        "workspace_id": workspace_id,
        "workspace_name": _normalize_name(source.get("workspace_name"))
        or "Untitled workspace",
        "author_name": _normalize_name(source.get("author_name")) or "Unknown author",
        "collaborator_role": _normalize_collaborator_role(
            source.get("collaborator_role")
        ),
        "invited_at": _normalize_timestamp(source.get("invited_at")),
    }
    source_inviter_user_id = _trim(source.get("source_inviter_user_id"))
    if source_inviter_user_id:
        normalized["source_inviter_user_id"] = source_inviter_user_id
    source_invitation_id = _trim(source.get("source_invitation_id"))
    if source_invitation_id:
        normalized["source_invitation_id"] = source_invitation_id
    return normalized


def _normalize_invitation_sent(payload: Any) -> dict[str, Any]:
    source = payload if isinstance(payload, dict) else {}
    status = _trim(source.get("status")).lower()
    if status not in INVITATION_STATUS_VALUES:
        status = "pending"
    workspace_id = _trim(source.get("workspace_id")) or f"workspace-{uuid4().hex[:10]}"
    normalized = {
        "id": _trim(source.get("id")) or f"invite-{uuid4().hex[:10]}",
        "workspace_id": workspace_id,
        "workspace_name": _normalize_name(source.get("workspace_name"))
        or "Untitled workspace",
        "invitee_name": _normalize_name(source.get("invitee_name"))
        or "Unknown collaborator",
        "role": _normalize_collaborator_role(source.get("role")),
        "invited_at": _normalize_timestamp(source.get("invited_at")),
        "status": status,
    }
    invitee_user_id = _trim(source.get("invitee_user_id"))
    if invitee_user_id:
        normalized["invitee_user_id"] = invitee_user_id
    linked_author_request_id = _trim(source.get("linked_author_request_id"))
    if linked_author_request_id:
        normalized["linked_author_request_id"] = linked_author_request_id
    return normalized


def normalize_workspace_state(payload: dict[str, Any] | None) -> dict[str, Any]:
    source = payload if isinstance(payload, dict) else {}

    workspace_items = source.get("workspaces")
    workspace_source = workspace_items if isinstance(workspace_items, list) else []
    seen_workspace_ids: set[str] = set()
    workspaces: list[dict[str, Any]] = []
    for item in workspace_source:
        normalized = _normalize_workspace_record(item)
        if normalized["id"] in seen_workspace_ids:
            continue
        seen_workspace_ids.add(normalized["id"])
        workspaces.append(normalized)

    active_workspace_id = _trim(source.get("active_workspace_id")) or None
    if active_workspace_id and active_workspace_id not in seen_workspace_ids:
        active_workspace_id = None
    if not active_workspace_id and workspaces:
        active_workspace_id = str(workspaces[0]["id"])

    author_requests_source = source.get("author_requests")
    author_requests_items = (
        author_requests_source if isinstance(author_requests_source, list) else []
    )
    author_requests: list[dict[str, Any]] = []
    seen_request_ids: set[str] = set()
    for item in author_requests_items:
        normalized = _normalize_author_request(item)
        if normalized["id"] in seen_request_ids:
            continue
        seen_request_ids.add(normalized["id"])
        author_requests.append(normalized)

    invitations_source = source.get("invitations_sent")
    invitations_items = invitations_source if isinstance(invitations_source, list) else []
    invitations_sent: list[dict[str, Any]] = []
    seen_invitation_ids: set[str] = set()
    for item in invitations_items:
        normalized = _normalize_invitation_sent(item)
        if normalized["id"] in seen_invitation_ids:
            continue
        seen_invitation_ids.add(normalized["id"])
        invitations_sent.append(normalized)

    return {
        "workspaces": workspaces,
        "active_workspace_id": active_workspace_id,
        "author_requests": author_requests,
        "invitations_sent": invitations_sent,
    }


def _normalize_inbox_message(payload: Any) -> dict[str, Any] | None:
    source = payload if isinstance(payload, dict) else {}
    workspace_id = _trim(source.get("workspace_id"))
    encrypted_body = _trim(source.get("encrypted_body"))
    iv = _trim(source.get("iv"))
    if not workspace_id or not encrypted_body or not iv:
        return None
    return {
        "id": _trim(source.get("id")) or f"msg-{uuid4().hex[:10]}",
        "workspace_id": workspace_id,
        "sender_name": _normalize_name(source.get("sender_name")) or "Unknown sender",
        "encrypted_body": encrypted_body,
        "iv": iv,
        "created_at": _normalize_timestamp(source.get("created_at")),
    }


def normalize_workspace_inbox_state(payload: dict[str, Any] | None) -> dict[str, Any]:
    source = payload if isinstance(payload, dict) else {}
    messages_source = source.get("messages")
    message_items = messages_source if isinstance(messages_source, list) else []
    seen_message_ids: set[str] = set()
    messages: list[dict[str, Any]] = []
    for item in message_items:
        normalized = _normalize_inbox_message(item)
        if normalized is None:
            continue
        if normalized["id"] in seen_message_ids:
            continue
        seen_message_ids.add(normalized["id"])
        messages.append(normalized)

    messages.sort(
        key=lambda row: (
            _parse_timestamp(row.get("created_at"))
            or datetime(1970, 1, 1, tzinfo=timezone.utc)
        )
    )

    reads_source = source.get("reads")
    reads_input = reads_source if isinstance(reads_source, dict) else {}
    reads: dict[str, dict[str, str]] = {}
    for workspace_id, reader_map_raw in reads_input.items():
        clean_workspace_id = _trim(workspace_id)
        if not clean_workspace_id or not isinstance(reader_map_raw, dict):
            continue
        reader_map: dict[str, str] = {}
        for reader_name, timestamp in reader_map_raw.items():
            reader_key = _normalize_name(reader_name).casefold()
            parsed = _parse_timestamp(timestamp)
            if not reader_key or parsed is None:
                continue
            reader_map[reader_key] = _iso_timestamp(parsed)
        if reader_map:
            reads[clean_workspace_id] = reader_map

    return {"messages": messages, "reads": reads}


def _resolve_user_or_raise(*, session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise WorkspaceValidationError("User account was not found.")
    return user


def _load_workspace_state_row(
    *, session, user_id: str
) -> tuple[WorkspaceStateCache, dict[str, Any]]:
    row = session.scalars(
        select(WorkspaceStateCache).where(WorkspaceStateCache.user_id == user_id)
    ).first()
    payload = row.payload_json if row and isinstance(row.payload_json, dict) else {}
    normalized = normalize_workspace_state(payload)
    if row is None:
        row = WorkspaceStateCache(user_id=user_id, payload_json=normalized)
        session.add(row)
        session.flush()
    elif payload != normalized:
        row.payload_json = normalized
    # Return a detached normalized copy so callers can mutate state safely
    # without relying on SQLAlchemy JSON mutation tracking.
    return row, normalize_workspace_state(normalized)


def _save_workspace_state_row(
    *, row: WorkspaceStateCache, state: dict[str, Any]
) -> dict[str, Any]:
    normalized = normalize_workspace_state(state)
    row.payload_json = normalized
    return normalized


def _load_workspace_inbox_state_row(
    *, session, user_id: str
) -> tuple[WorkspaceInboxStateCache, dict[str, Any]]:
    row = session.scalars(
        select(WorkspaceInboxStateCache).where(
            WorkspaceInboxStateCache.user_id == user_id
        )
    ).first()
    payload = row.payload_json if row and isinstance(row.payload_json, dict) else {}
    normalized = normalize_workspace_inbox_state(payload)
    if row is None:
        row = WorkspaceInboxStateCache(user_id=user_id, payload_json=normalized)
        session.add(row)
        session.flush()
    elif payload != normalized:
        row.payload_json = normalized
    # Return a detached normalized copy so callers can mutate state safely
    # without relying on SQLAlchemy JSON mutation tracking.
    return row, normalize_workspace_inbox_state(normalized)


def _save_workspace_inbox_state_row(
    *, row: WorkspaceInboxStateCache, state: dict[str, Any]
) -> dict[str, Any]:
    normalized = normalize_workspace_inbox_state(state)
    row.payload_json = normalized
    return normalized


def _workspace_index(state: dict[str, Any], workspace_id: str) -> int:
    clean_id = _trim(workspace_id)
    for index, item in enumerate(state.get("workspaces") or []):
        if _trim(item.get("id")) == clean_id:
            return index
    return -1


def _workspace_record_for_id(
    state: dict[str, Any], workspace_id: str
) -> dict[str, Any] | None:
    clean_workspace_id = _trim(workspace_id)
    if not clean_workspace_id:
        return None
    for item in state.get("workspaces") or []:
        if _trim(item.get("id")) != clean_workspace_id:
            continue
        return dict(item)
    return None


def _workspace_membership_role(
    *, workspace: dict[str, Any], user_display_name: str
) -> str | None:
    user_key = _normalize_name(user_display_name).casefold()
    if not user_key:
        return None

    owner_key = _normalize_name(workspace.get("owner_name")).casefold()
    if owner_key and owner_key == user_key:
        return "owner"

    collaborator_keys = {
        value.casefold() for value in _normalize_str_list(workspace.get("collaborators"))
    }
    removed_keys = {
        value.casefold()
        for value in _normalize_str_list(workspace.get("removed_collaborators"))
    }
    if user_key in collaborator_keys and user_key not in removed_keys:
        return "collaborator"
    return None


def _resolve_workspace_access_context(
    *, session, user_id: str, workspace_id: str
) -> tuple[User, dict[str, Any], dict[str, Any]]:
    user = _resolve_user_or_raise(session=session, user_id=user_id)
    _, state = _load_workspace_state_row(session=session, user_id=user_id)
    workspace = _workspace_record_for_id(state, workspace_id)
    clean_workspace_id = _trim(workspace_id)
    if workspace is None:
        raise WorkspaceNotFoundError(
            f"Workspace '{clean_workspace_id}' was not found."
        )
    role = _workspace_membership_role(
        workspace=workspace, user_display_name=_normalize_name(user.name)
    )
    if role is None:
        raise WorkspaceNotFoundError(
            f"Workspace '{clean_workspace_id}' was not found."
        )
    return user, state, workspace


def _workspace_participant_user_ids(
    *, session, workspace_id: str
) -> list[str]:
    clean_workspace_id = _trim(workspace_id)
    if not clean_workspace_id:
        return []

    users = session.scalars(select(User)).all()
    users_by_id = {_trim(row.id): row for row in users if _trim(row.id)}
    state_rows = session.scalars(select(WorkspaceStateCache)).all()

    participant_ids: list[str] = []
    seen_ids: set[str] = set()
    for state_row in state_rows:
        row_user_id = _trim(state_row.user_id)
        if not row_user_id or row_user_id in seen_ids:
            continue
        user = users_by_id.get(row_user_id)
        if user is None:
            continue
        payload = (
            state_row.payload_json
            if isinstance(state_row.payload_json, dict)
            else {}
        )
        state = normalize_workspace_state(payload)
        workspace = _workspace_record_for_id(state, clean_workspace_id)
        if workspace is None:
            continue
        role = _workspace_membership_role(
            workspace=workspace, user_display_name=_normalize_name(user.name)
        )
        if role is None:
            continue
        seen_ids.add(row_user_id)
        participant_ids.append(row_user_id)
    return participant_ids


def _sync_workspace_collaborator_states(
    *,
    session,
    owner_user_id: str,
    owner_workspace: dict[str, Any],
    previous_owner_name: str | None = None,
) -> None:
    clean_owner_user_id = _trim(owner_user_id)
    workspace_id = _trim(owner_workspace.get("id"))
    if not clean_owner_user_id or not workspace_id:
        return

    owner_name = _normalize_name(owner_workspace.get("owner_name"))
    if not owner_name:
        return
    owner_name_key = owner_name.casefold()
    removable_owner_keys = {owner_name_key}
    previous_owner_key = _normalize_name(previous_owner_name).casefold()
    if previous_owner_key:
        removable_owner_keys.add(previous_owner_key)

    collaborator_names = _normalize_str_list(owner_workspace.get("collaborators"))
    collaborator_keys = {value.casefold() for value in collaborator_names}
    collaborator_name_by_key = {value.casefold(): value for value in collaborator_names}
    collaborator_role_by_name = _normalize_role_map(
        owner_workspace.get("collaborator_roles"),
        collaborator_names,
    )
    removed_keys = {
        value.casefold()
        for value in _normalize_str_list(owner_workspace.get("removed_collaborators"))
    }

    users = session.scalars(select(User)).all()
    users_by_id = {_trim(row.id): row for row in users if _trim(row.id)}

    for user in users:
        user_id = _trim(user.id)
        if not user_id or user_id == clean_owner_user_id:
            continue
        user_name_key = _normalize_name(user.name).casefold()
        if not user_name_key:
            continue

        row, state = _load_workspace_state_row(session=session, user_id=user_id)
        index = _workspace_index(state, workspace_id)

        if user_name_key == owner_name_key:
            existing_workspace = (
                dict((state.get("workspaces") or [])[index]) if index >= 0 else {}
            )
            promoted_workspace_source = dict(owner_workspace)
            promoted_workspace_source["pinned"] = bool(existing_workspace.get("pinned"))
            promoted_workspace_source["archived"] = bool(
                owner_workspace.get("archived")
            ) or bool(existing_workspace.get("archived"))
            promoted_workspace = _normalize_workspace_record(promoted_workspace_source)
            promoted_workspace["id"] = workspace_id
            items = list(state.get("workspaces") or [])
            if index >= 0:
                items[index] = promoted_workspace
            else:
                items.insert(0, promoted_workspace)
            state["workspaces"] = items
            if not _trim(state.get("active_workspace_id")):
                state["active_workspace_id"] = workspace_id
            _save_workspace_state_row(row=row, state=state)
            continue

        if user_name_key not in collaborator_keys:
            if index < 0:
                continue
            current_workspace = dict((state.get("workspaces") or [])[index])
            current_owner_key = _normalize_name(current_workspace.get("owner_name")).casefold()
            if current_owner_key not in removable_owner_keys:
                continue
            state["workspaces"] = [
                item
                for item in (state.get("workspaces") or [])
                if _trim(item.get("id")) != workspace_id
            ]
            if _trim(state.get("active_workspace_id")) == workspace_id:
                next_active = None
                for item in state.get("workspaces") or []:
                    candidate = _trim(item.get("id"))
                    if candidate:
                        next_active = candidate
                        break
                state["active_workspace_id"] = next_active
            _save_workspace_state_row(row=row, state=state)
            continue

        collaborator_display_name = collaborator_name_by_key[user_name_key]
        collaborator_role = collaborator_role_by_name.get(
            collaborator_display_name, "editor"
        )
        archived_flag = bool(owner_workspace.get("archived"))
        existing_workspace = (
            dict((state.get("workspaces") or [])[index]) if index >= 0 else {}
        )
        synced_workspace = _normalize_workspace_record(
            {
                "id": workspace_id,
                "name": _normalize_name(owner_workspace.get("name"))
                or _normalize_name(existing_workspace.get("name"))
                or WORKSPACE_FALLBACK_NAME,
                "owner_name": owner_name,
                "collaborators": [collaborator_display_name],
                "collaborator_roles": {
                    collaborator_display_name: collaborator_role
                },
                "pending_collaborators": [],
                "pending_collaborator_roles": {},
                "removed_collaborators": (
                    [collaborator_display_name]
                    if user_name_key in removed_keys
                    else []
                ),
                "version": _trim(owner_workspace.get("version"))
                or _trim(existing_workspace.get("version"))
                or "0.1",
                "health": _trim(owner_workspace.get("health"))
                or _trim(existing_workspace.get("health"))
                or "amber",
                "updated_at": _trim(owner_workspace.get("updated_at"))
                or _iso_timestamp(_utcnow()),
                "pinned": bool(existing_workspace.get("pinned")),
                "archived": archived_flag or bool(existing_workspace.get("archived")),
            }
        )
        synced_workspace["id"] = workspace_id
        items = list(state.get("workspaces") or [])
        if index >= 0:
            items[index] = synced_workspace
        else:
            items.insert(0, synced_workspace)
        state["workspaces"] = items
        if not _trim(state.get("active_workspace_id")):
            state["active_workspace_id"] = workspace_id
        _save_workspace_state_row(row=row, state=state)


def _latest_timestamp(left: str | None, right: str | None) -> str | None:
    if not left and not right:
        return None
    if not left:
        return right
    if not right:
        return left
    left_parsed = _parse_timestamp(left)
    right_parsed = _parse_timestamp(right)
    if left_parsed is None:
        return right
    if right_parsed is None:
        return left
    return (
        _iso_timestamp(left_parsed)
        if left_parsed >= right_parsed
        else _iso_timestamp(right_parsed)
    )


def _find_user_id_by_display_name(
    *, session, name: str, exclude_user_id: str | None = None
) -> str | None:
    clean_name = _normalize_name(name)
    if not clean_name:
        return None
    lowered = clean_name.casefold()
    query = select(User).where(func.lower(User.name) == lowered)
    rows = session.scalars(query).all()
    for row in rows:
        row_id = _trim(row.id)
        if exclude_user_id and row_id == exclude_user_id:
            continue
        return row_id
    return None


def _sync_workspace_pending_collaborator(
    *,
    state: dict[str, Any],
    workspace_id: str,
    collaborator_name: str,
    pending: bool,
    role: str | None = None,
) -> bool:
    clean_workspace_id = _trim(workspace_id)
    clean_collaborator_name = _normalize_name(collaborator_name)
    if not clean_workspace_id or not clean_collaborator_name:
        return False
    workspace_index = _workspace_index(state, clean_workspace_id)
    if workspace_index < 0:
        return False

    workspaces = list(state.get("workspaces") or [])
    workspace = dict(workspaces[workspace_index])
    pending_collaborators = _normalize_str_list(
        workspace.get("pending_collaborators")
    )
    pending_roles = _normalize_role_map(
        workspace.get("pending_collaborator_roles"), pending_collaborators
    )
    collaborator_key = clean_collaborator_name.casefold()
    pending_keys = {value.casefold() for value in pending_collaborators}
    normalized_role = _normalize_collaborator_role(role)

    collaborators = _normalize_str_list(workspace.get("collaborators"))
    removed_keys = {
        value.casefold()
        for value in _normalize_str_list(workspace.get("removed_collaborators"))
    }
    active_keys = {
        value.casefold() for value in collaborators if value.casefold() not in removed_keys
    }

    changed = False
    if pending:
        if collaborator_key in active_keys:
            next_pending = [
                value
                for value in pending_collaborators
                if value.casefold() != collaborator_key
            ]
            if len(next_pending) != len(pending_collaborators):
                pending_collaborators = next_pending
                pending_roles = {
                    name: value
                    for name, value in pending_roles.items()
                    if _normalize_name(name).casefold() != collaborator_key
                }
                changed = True
        elif collaborator_key not in pending_keys:
            pending_collaborators.append(clean_collaborator_name)
            pending_roles[clean_collaborator_name] = normalized_role
            changed = True
        else:
            existing_name = next(
                (
                    name
                    for name in pending_collaborators
                    if _normalize_name(name).casefold() == collaborator_key
                ),
                clean_collaborator_name,
            )
            if pending_roles.get(existing_name) != normalized_role:
                pending_roles[existing_name] = normalized_role
                changed = True
    else:
        next_pending = [
            value
            for value in pending_collaborators
            if value.casefold() != collaborator_key
        ]
        if len(next_pending) != len(pending_collaborators):
            pending_collaborators = next_pending
            pending_roles = {
                name: value
                for name, value in pending_roles.items()
                if _normalize_name(name).casefold() != collaborator_key
            }
            changed = True

    if not changed:
        return False

    workspace["pending_collaborators"] = pending_collaborators
    workspace["pending_collaborator_roles"] = pending_roles
    workspace["updated_at"] = _iso_timestamp(_utcnow())
    normalized_workspace = _normalize_workspace_record(workspace)
    normalized_workspace["id"] = clean_workspace_id
    workspaces[workspace_index] = normalized_workspace
    state["workspaces"] = workspaces
    return True


def _set_invitation_status_for_user(
    *, session, user_id: str, invitation_id: str, status: str
) -> bool:
    clean_status = _trim(status).lower()
    if clean_status not in INVITATION_STATUS_VALUES:
        return False
    row = session.scalars(
        select(WorkspaceStateCache).where(WorkspaceStateCache.user_id == user_id)
    ).first()
    payload = row.payload_json if row and isinstance(row.payload_json, dict) else {}
    state = normalize_workspace_state(payload)
    changed = False
    invitation_record: dict[str, Any] | None = None
    for item in state.get("invitations_sent") or []:
        if _trim(item.get("id")) == _trim(invitation_id):
            invitation_record = item
            if _trim(item.get("status")).lower() != clean_status:
                item["status"] = clean_status
                changed = True
            break
    if invitation_record is None:
        return False

    pending_changed = _sync_workspace_pending_collaborator(
        state=state,
        workspace_id=_trim(invitation_record.get("workspace_id")),
        collaborator_name=_normalize_name(invitation_record.get("invitee_name")),
        pending=clean_status == "pending",
        role=_normalize_collaborator_role(invitation_record.get("role")),
    )

    if not changed and not pending_changed:
        return False
    if row is None:
        row = WorkspaceStateCache(user_id=user_id, payload_json=state)
        session.add(row)
    else:
        row.payload_json = state
    return True


def get_workspace_state(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session=session, user_id=user_id)
        _, state = _load_workspace_state_row(session=session, user_id=user_id)
        return state


def save_workspace_state(*, user_id: str, payload: dict[str, Any] | None) -> dict[str, Any]:
    normalized = normalize_workspace_state(payload)
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session=session, user_id=user_id)
        row, _ = _load_workspace_state_row(session=session, user_id=user_id)
        row.payload_json = normalized
        session.flush()
    return normalized


def get_workspace_inbox_state(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session=session, user_id=user_id)
        _, state = _load_workspace_inbox_state_row(session=session, user_id=user_id)
        return state


def save_workspace_inbox_state(
    *, user_id: str, payload: dict[str, Any] | None
) -> dict[str, Any]:
    normalized = normalize_workspace_inbox_state(payload)
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session=session, user_id=user_id)
        row, _ = _load_workspace_inbox_state_row(session=session, user_id=user_id)
        row.payload_json = normalized
        session.flush()
    return normalized


def list_workspace_records(*, user_id: str) -> dict[str, Any]:
    state = get_workspace_state(user_id=user_id)
    return {
        "items": state.get("workspaces") or [],
        "active_workspace_id": state.get("active_workspace_id"),
    }


def create_workspace_record(*, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session=session, user_id=user_id)
        row, state = _load_workspace_state_row(session=session, user_id=user_id)
        workspaces = list(state.get("workspaces") or [])
        existing_ids = _workspace_ids(workspaces)

        normalized_input = _normalize_workspace_record(payload)
        owner_name = _normalize_name(user.name)
        if not owner_name:
            raise WorkspaceValidationError(
                "Owner name is required to create a workspace."
            )
        requested_owner_name = _normalize_name(normalized_input.get("owner_name"))
        if (
            requested_owner_name
            and requested_owner_name.casefold() != owner_name.casefold()
        ):
            raise WorkspaceValidationError(
                "Workspace owner must match the signed-in user."
            )

        requested_id = _trim(payload.get("id")) or _slugify_workspace_id(
            _normalize_name(normalized_input.get("name")) or WORKSPACE_FALLBACK_NAME
        )
        workspace_id = _ensure_unique_workspace_id(
            desired_id=requested_id, existing_ids=existing_ids
        )
        normalized_input["id"] = workspace_id
        normalized_input["owner_name"] = owner_name
        normalized_input["updated_at"] = _iso_timestamp(_utcnow())

        workspaces.insert(0, normalized_input)
        state["workspaces"] = workspaces
        if not _trim(state.get("active_workspace_id")):
            state["active_workspace_id"] = workspace_id
        _save_workspace_state_row(row=row, state=state)
        _sync_workspace_collaborator_states(
            session=session,
            owner_user_id=user_id,
            owner_workspace=normalized_input,
        )
        session.flush()
        return normalized_input


def update_workspace_record(
    *, user_id: str, workspace_id: str, patch: dict[str, Any]
) -> dict[str, Any]:
    clean_workspace_id = _trim(workspace_id)
    if not clean_workspace_id:
        raise WorkspaceValidationError("Workspace id is required.")

    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session=session, user_id=user_id)
        row, state = _load_workspace_state_row(session=session, user_id=user_id)
        items = list(state.get("workspaces") or [])
        index = _workspace_index(state, clean_workspace_id)
        if index < 0:
            raise WorkspaceNotFoundError(
                f"Workspace '{clean_workspace_id}' was not found."
            )

        current = dict(items[index])
        current_owner_name = _normalize_name(current.get("owner_name"))
        requested_owner_name = _normalize_name((patch or {}).get("owner_name"))
        requester_is_owner = (
            _workspace_membership_role(
                workspace=current, user_display_name=_normalize_name(user.name)
            )
            == "owner"
        )
        transferring_owner = (
            bool(requested_owner_name)
            and bool(current_owner_name)
            and requested_owner_name.casefold() != current_owner_name.casefold()
        )
        if transferring_owner and not requester_is_owner:
            raise WorkspaceValidationError(
                "Only the workspace owner can transfer ownership."
            )
        touches_collaborators = any(
            key in (patch or {})
            for key in (
                "collaborators",
                "pending_collaborators",
                "collaborator_roles",
                "pending_collaborator_roles",
                "removed_collaborators",
            )
        )
        if touches_collaborators and not requester_is_owner:
            raise WorkspaceValidationError(
                "Only the workspace owner can manage collaborators."
            )

        transfer_previous_owner_name: str | None = None
        transfer_new_owner_name: str | None = None
        if transferring_owner:
            requested_owner_key = requested_owner_name.casefold()
            current_owner_key = current_owner_name.casefold()
            active_collaborator_names = [
                value
                for value in _normalize_str_list(current.get("collaborators"))
                if value.casefold()
                not in {
                    removed.casefold()
                    for removed in _normalize_str_list(
                        current.get("removed_collaborators")
                    )
                }
            ]
            active_collaborator_keys = {
                value.casefold() for value in active_collaborator_names
            }
            if requested_owner_key not in active_collaborator_keys:
                raise WorkspaceValidationError(
                    "New workspace owner must be an active collaborator."
                )
            target_owner_user_id = _find_user_id_by_display_name(
                session=session, name=requested_owner_name
            )
            if not target_owner_user_id:
                raise WorkspaceValidationError(
                    "New workspace owner must have a registered account."
                )

            next_collaborators = [
                value
                for value in _normalize_str_list(current.get("collaborators"))
                if value.casefold() != requested_owner_key
            ]
            if current_owner_name and current_owner_key not in {
                value.casefold() for value in next_collaborators
            }:
                next_collaborators.append(current_owner_name)

            next_removed = [
                value
                for value in _normalize_str_list(current.get("removed_collaborators"))
                if value.casefold() not in {requested_owner_key, current_owner_key}
            ]
            next_pending = [
                value
                for value in _normalize_str_list(current.get("pending_collaborators"))
                if value.casefold() not in {requested_owner_key, current_owner_key}
            ]
            next_roles = {
                name: role
                for name, role in _normalize_role_map(
                    current.get("collaborator_roles"), next_collaborators
                ).items()
                if _normalize_name(name).casefold() != requested_owner_key
            }
            if current_owner_name:
                next_roles[current_owner_name] = _normalize_collaborator_role(
                    next_roles.get(current_owner_name)
                )
            next_pending_roles = {
                name: role
                for name, role in _normalize_role_map(
                    current.get("pending_collaborator_roles"), next_pending
                ).items()
                if _normalize_name(name).casefold()
                not in {requested_owner_key, current_owner_key}
            }

            transfer_previous_owner_name = current_owner_name
            transfer_new_owner_name = requested_owner_name
            patch = {
                **(patch if isinstance(patch, dict) else {}),
                "owner_name": requested_owner_name,
                "collaborators": next_collaborators,
                "removed_collaborators": next_removed,
                "pending_collaborators": next_pending,
                "collaborator_roles": next_roles,
                "pending_collaborator_roles": next_pending_roles,
            }

        merged = {**current, **(patch if isinstance(patch, dict) else {})}
        merged["id"] = clean_workspace_id
        merged["owner_name"] = (
            transfer_new_owner_name
            or current_owner_name
            or _normalize_name(user.name)
        )
        if "updated_at" not in (patch or {}):
            merged["updated_at"] = _iso_timestamp(_utcnow())
        normalized = _normalize_workspace_record(merged)
        normalized["id"] = clean_workspace_id
        items[index] = normalized
        state["workspaces"] = items
        _save_workspace_state_row(row=row, state=state)
        if requester_is_owner:
            _sync_workspace_collaborator_states(
                session=session,
                owner_user_id=user_id,
                owner_workspace=normalized,
                previous_owner_name=transfer_previous_owner_name,
            )
        session.flush()
        return normalized


def delete_workspace_record(*, user_id: str, workspace_id: str) -> dict[str, Any]:
    clean_workspace_id = _trim(workspace_id)
    if not clean_workspace_id:
        raise WorkspaceValidationError("Workspace id is required.")

    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session=session, user_id=user_id)
        row, state = _load_workspace_state_row(session=session, user_id=user_id)
        items = list(state.get("workspaces") or [])
        next_items = [
            item for item in items if _trim(item.get("id")) != clean_workspace_id
        ]
        if len(next_items) == len(items):
            raise WorkspaceNotFoundError(
                f"Workspace '{clean_workspace_id}' was not found."
            )
        state["workspaces"] = next_items
        state["author_requests"] = [
            item
            for item in (state.get("author_requests") or [])
            if _trim(item.get("workspace_id")) != clean_workspace_id
        ]
        state["invitations_sent"] = [
            item
            for item in (state.get("invitations_sent") or [])
            if _trim(item.get("workspace_id")) != clean_workspace_id
        ]

        active_workspace_id = _trim(state.get("active_workspace_id"))
        if active_workspace_id == clean_workspace_id:
            next_active = None
            for item in next_items:
                if not bool(item.get("archived")):
                    next_active = _trim(item.get("id"))
                    break
            if not next_active and next_items:
                next_active = _trim(next_items[0].get("id")) or None
            state["active_workspace_id"] = next_active

        normalized = _save_workspace_state_row(row=row, state=state)
        session.flush()
        return {
            "success": True,
            "active_workspace_id": normalized.get("active_workspace_id"),
        }


def set_active_workspace(*, user_id: str, workspace_id: str | None) -> dict[str, Any]:
    clean_workspace_id = _trim(workspace_id)
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session=session, user_id=user_id)
        row, state = _load_workspace_state_row(session=session, user_id=user_id)
        items = state.get("workspaces") or []
        if clean_workspace_id:
            if _workspace_index(state, clean_workspace_id) < 0:
                raise WorkspaceNotFoundError(
                    f"Workspace '{clean_workspace_id}' was not found."
                )
            state["active_workspace_id"] = clean_workspace_id
        else:
            state["active_workspace_id"] = _trim(items[0].get("id")) if items else None
        normalized = _save_workspace_state_row(row=row, state=state)
        session.flush()
        return {"active_workspace_id": normalized.get("active_workspace_id")}


def list_workspace_author_requests(*, user_id: str) -> dict[str, Any]:
    state = get_workspace_state(user_id=user_id)
    return {"items": state.get("author_requests") or []}


def list_workspace_invitations_sent(*, user_id: str) -> dict[str, Any]:
    state = get_workspace_state(user_id=user_id)
    return {"items": state.get("invitations_sent") or []}


def create_workspace_invitation(*, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    clean_workspace_id = _trim(payload.get("workspace_id"))
    invitee_name = _normalize_name(payload.get("invitee_name"))
    collaborator_role = _normalize_collaborator_role(payload.get("role"))
    if not clean_workspace_id:
        raise WorkspaceValidationError("Workspace id is required.")
    if not invitee_name:
        raise WorkspaceValidationError("Invitee name is required.")

    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session=session, user_id=user_id)
        sender_row, sender_state = _load_workspace_state_row(
            session=session, user_id=user_id
        )
        workspace_index = _workspace_index(sender_state, clean_workspace_id)
        if workspace_index < 0:
            raise WorkspaceNotFoundError(
                f"Workspace '{clean_workspace_id}' was not found."
            )
        workspace = dict((sender_state.get("workspaces") or [])[workspace_index])
        owner_name = _normalize_name(workspace.get("owner_name"))
        requester_name = _normalize_name(user.name)
        if (
            not owner_name
            or not requester_name
            or owner_name.casefold() != requester_name.casefold()
        ):
            raise WorkspaceValidationError(
                "Only the workspace owner can invite collaborators."
            )
        collaborator_keys = {
            value.casefold() for value in _normalize_str_list(workspace.get("collaborators"))
        }
        removed_keys = {
            value.casefold()
            for value in _normalize_str_list(workspace.get("removed_collaborators"))
        }
        pending_keys = {
            value.casefold()
            for value in _normalize_str_list(workspace.get("pending_collaborators"))
        }
        if invitee_name.casefold() in collaborator_keys and invitee_name.casefold() not in removed_keys:
            raise WorkspaceValidationError(
                "Invitee is already an active collaborator."
            )
        if invitee_name.casefold() in pending_keys:
            raise WorkspaceValidationError(
                "Invitee already has pending access."
            )
        if owner_name and owner_name.casefold() == invitee_name.casefold():
            raise WorkspaceValidationError(
                "Invitee cannot match the workspace owner."
            )

        invitations = list(sender_state.get("invitations_sent") or [])
        has_pending_duplicate = any(
            _trim(item.get("workspace_id")) == clean_workspace_id
            and _normalize_name(item.get("invitee_name")).casefold()
            == invitee_name.casefold()
            and _trim(item.get("status")).lower() == "pending"
            for item in invitations
        )
        if has_pending_duplicate:
            raise WorkspaceValidationError(
                "A pending invitation already exists for this collaborator."
            )

        invitation = _normalize_invitation_sent(
            {
                "id": _trim(payload.get("id")) or f"invite-{uuid4().hex[:10]}",
                "workspace_id": clean_workspace_id,
                "workspace_name": _normalize_name(workspace.get("name")),
                "invitee_name": invitee_name,
                "role": collaborator_role,
                "invited_at": _normalize_timestamp(payload.get("invited_at")),
                "status": _trim(payload.get("status")) or "pending",
            }
        )
        invitee_user_id = _find_user_id_by_display_name(
            session=session, name=invitee_name, exclude_user_id=user_id
        )
        if invitee_user_id:
            invitation["invitee_user_id"] = invitee_user_id
            invitee_row, invitee_state = _load_workspace_state_row(
                session=session, user_id=invitee_user_id
            )
            request_id = f"author-request-{uuid4().hex[:10]}"
            invitation["linked_author_request_id"] = request_id
            author_request = _normalize_author_request(
                {
                    "id": request_id,
                    "workspace_id": clean_workspace_id,
                    "workspace_name": _normalize_name(workspace.get("name")),
                    "author_name": owner_name or "Unknown author",
                    "collaborator_role": collaborator_role,
                    "invited_at": invitation.get("invited_at"),
                    "source_inviter_user_id": user_id,
                    "source_invitation_id": invitation.get("id"),
                }
            )
            invitee_requests = list(invitee_state.get("author_requests") or [])
            invitee_requests.insert(0, author_request)
            invitee_state["author_requests"] = invitee_requests
            _save_workspace_state_row(row=invitee_row, state=invitee_state)

        invitations.insert(0, invitation)
        _sync_workspace_pending_collaborator(
            state=sender_state,
            workspace_id=clean_workspace_id,
            collaborator_name=invitee_name,
            pending=True,
            role=collaborator_role,
        )
        sender_state["invitations_sent"] = invitations
        _save_workspace_state_row(row=sender_row, state=sender_state)
        session.flush()
        return invitation


def update_workspace_invitation_status(
    *, user_id: str, invitation_id: str, status: str
) -> dict[str, Any]:
    clean_invitation_id = _trim(invitation_id)
    clean_status = _trim(status).lower()
    if clean_status not in INVITATION_STATUS_VALUES:
        raise WorkspaceValidationError(
            "Invitation status must be pending, accepted, or declined."
        )
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session=session, user_id=user_id)
        row, state = _load_workspace_state_row(session=session, user_id=user_id)
        invitations = list(state.get("invitations_sent") or [])
        updated: dict[str, Any] | None = None
        for item in invitations:
            if _trim(item.get("id")) != clean_invitation_id:
                continue
            item["status"] = clean_status
            updated = item
            break
        if updated is None:
            raise WorkspaceNotFoundError(
                f"Invitation '{clean_invitation_id}' was not found."
            )
        _sync_workspace_pending_collaborator(
            state=state,
            workspace_id=_trim(updated.get("workspace_id")),
            collaborator_name=_normalize_name(updated.get("invitee_name")),
            pending=clean_status == "pending",
            role=_normalize_collaborator_role(updated.get("role")),
        )
        state["invitations_sent"] = invitations
        _save_workspace_state_row(row=row, state=state)
        session.flush()
        return updated


def accept_workspace_author_request(
    *, user_id: str, request_id: str, collaborator_name: str | None = None
) -> dict[str, Any]:
    clean_request_id = _trim(request_id)
    if not clean_request_id:
        raise WorkspaceValidationError("Author request id is required.")
    clean_collaborator_name = _normalize_name(collaborator_name)

    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session=session, user_id=user_id)
        row, state = _load_workspace_state_row(session=session, user_id=user_id)
        requests = list(state.get("author_requests") or [])
        request_index = -1
        request: dict[str, Any] | None = None
        for index, item in enumerate(requests):
            if _trim(item.get("id")) == clean_request_id:
                request_index = index
                request = dict(item)
                break
        if request_index < 0 or request is None:
            raise WorkspaceNotFoundError(
                f"Author request '{clean_request_id}' was not found."
            )

        workspaces = list(state.get("workspaces") or [])
        existing_ids = _workspace_ids(workspaces)
        requested_workspace_id = _trim(request.get("workspace_id")) or _slugify_workspace_id(
            _normalize_name(request.get("workspace_name")) or WORKSPACE_FALLBACK_NAME
        )
        workspace_id = _ensure_unique_workspace_id(
            desired_id=requested_workspace_id, existing_ids=existing_ids
        )
        collaborator_display_name = clean_collaborator_name or _normalize_name(user.name)
        collaborator_role = _normalize_collaborator_role(
            request.get("collaborator_role")
        )
        collaborators = (
            [collaborator_display_name] if collaborator_display_name else []
        )
        next_workspace = _normalize_workspace_record(
            {
                "id": workspace_id,
                "name": _normalize_name(request.get("workspace_name"))
                or WORKSPACE_FALLBACK_NAME,
                "owner_name": _normalize_name(request.get("author_name"))
                or WORKSPACE_FALLBACK_OWNER_NAME,
                "collaborators": collaborators,
                "collaborator_roles": {
                    collaborator_display_name: collaborator_role
                }
                if collaborator_display_name
                else {},
                "pending_collaborators": [],
                "pending_collaborator_roles": {},
                "removed_collaborators": [],
                "version": "0.1",
                "health": "amber",
                "updated_at": _iso_timestamp(_utcnow()),
                "pinned": False,
                "archived": False,
            }
        )

        workspaces.insert(0, next_workspace)
        state["workspaces"] = workspaces
        state["author_requests"] = [
            item
            for item in requests
            if _trim(item.get("id")) != clean_request_id
        ]
        state["active_workspace_id"] = next_workspace["id"]
        _save_workspace_state_row(row=row, state=state)

        inviter_user_id = _trim(request.get("source_inviter_user_id"))
        invitation_id = _trim(request.get("source_invitation_id"))
        if inviter_user_id:
            inviter_row, inviter_state = _load_workspace_state_row(
                session=session, user_id=inviter_user_id
            )
            inviter_index = _workspace_index(inviter_state, requested_workspace_id)
            if inviter_index >= 0:
                inviter_items = list(inviter_state.get("workspaces") or [])
                inviter_workspace = dict(inviter_items[inviter_index])
                owner_workspace_collaborators = _normalize_str_list(
                    inviter_workspace.get("collaborators")
                )
                collaborator_key = collaborator_display_name.casefold()
                if collaborator_key not in {
                    value.casefold() for value in owner_workspace_collaborators
                }:
                    owner_workspace_collaborators.append(collaborator_display_name)
                owner_workspace_roles = _normalize_role_map(
                    inviter_workspace.get("collaborator_roles"),
                    owner_workspace_collaborators,
                )
                owner_workspace_roles[collaborator_display_name] = collaborator_role
                owner_workspace_removed = [
                    value
                    for value in _normalize_str_list(
                        inviter_workspace.get("removed_collaborators")
                    )
                    if value.casefold() != collaborator_key
                ]
                owner_workspace_pending = [
                    value
                    for value in _normalize_str_list(
                        inviter_workspace.get("pending_collaborators")
                    )
                    if value.casefold() != collaborator_key
                ]
                owner_workspace_pending_roles = {
                    name: value
                    for name, value in _normalize_role_map(
                        inviter_workspace.get("pending_collaborator_roles"),
                        owner_workspace_pending,
                    ).items()
                    if _normalize_name(name).casefold() != collaborator_key
                }
                inviter_workspace["collaborators"] = owner_workspace_collaborators
                inviter_workspace["collaborator_roles"] = owner_workspace_roles
                inviter_workspace["pending_collaborators"] = owner_workspace_pending
                inviter_workspace["pending_collaborator_roles"] = owner_workspace_pending_roles
                inviter_workspace["removed_collaborators"] = owner_workspace_removed
                inviter_workspace["updated_at"] = _iso_timestamp(_utcnow())
                normalized_inviter_workspace = _normalize_workspace_record(
                    inviter_workspace
                )
                normalized_inviter_workspace["id"] = requested_workspace_id
                inviter_items[inviter_index] = normalized_inviter_workspace
                inviter_state["workspaces"] = inviter_items
                _save_workspace_state_row(row=inviter_row, state=inviter_state)
                _sync_workspace_collaborator_states(
                    session=session,
                    owner_user_id=inviter_user_id,
                    owner_workspace=normalized_inviter_workspace,
                )
        if inviter_user_id and invitation_id:
            _set_invitation_status_for_user(
                session=session,
                user_id=inviter_user_id,
                invitation_id=invitation_id,
                status="accepted",
            )

        session.flush()
        return {
            "workspace": next_workspace,
            "removed_request_id": clean_request_id,
        }


def decline_workspace_author_request(*, user_id: str, request_id: str) -> dict[str, Any]:
    clean_request_id = _trim(request_id)
    if not clean_request_id:
        raise WorkspaceValidationError("Author request id is required.")
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session=session, user_id=user_id)
        row, state = _load_workspace_state_row(session=session, user_id=user_id)
        requests = list(state.get("author_requests") or [])
        target: dict[str, Any] | None = None
        for item in requests:
            if _trim(item.get("id")) == clean_request_id:
                target = dict(item)
                break
        if target is None:
            raise WorkspaceNotFoundError(
                f"Author request '{clean_request_id}' was not found."
            )
        state["author_requests"] = [
            item
            for item in requests
            if _trim(item.get("id")) != clean_request_id
        ]
        _save_workspace_state_row(row=row, state=state)

        inviter_user_id = _trim(target.get("source_inviter_user_id"))
        invitation_id = _trim(target.get("source_invitation_id"))
        if inviter_user_id and invitation_id:
            _set_invitation_status_for_user(
                session=session,
                user_id=inviter_user_id,
                invitation_id=invitation_id,
                status="declined",
            )
        session.flush()
        return {"success": True, "removed_request_id": clean_request_id}


def list_workspace_inbox_messages(
    *, user_id: str, workspace_id: str | None = None
) -> dict[str, Any]:
    clean_workspace_id = _trim(workspace_id)
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session=session, user_id=user_id)
        if clean_workspace_id:
            _resolve_workspace_access_context(
                session=session,
                user_id=user_id,
                workspace_id=clean_workspace_id,
            )
        _, state = _load_workspace_inbox_state_row(session=session, user_id=user_id)
        messages = list(state.get("messages") or [])
        if clean_workspace_id:
            messages = [
                item
                for item in messages
                if _trim(item.get("workspace_id")) == clean_workspace_id
            ]
        return {"items": messages}


def create_workspace_inbox_message(
    *, user_id: str, payload: dict[str, Any]
) -> dict[str, Any]:
    message = _normalize_inbox_message(payload)
    if message is None:
        raise WorkspaceValidationError(
            "workspace_id, encrypted_body, and iv are required."
        )
    create_all_tables()
    with session_scope() as session:
        user, _, workspace = _resolve_workspace_access_context(
            session=session,
            user_id=user_id,
            workspace_id=_trim(message.get("workspace_id")),
        )
        sender_name = _normalize_name(message.get("sender_name"))
        if not sender_name:
            sender_name = _normalize_name(user.name) or "Unknown sender"
        sender_key = sender_name.casefold()
        sender_role = _workspace_membership_role(
            workspace=workspace,
            user_display_name=_normalize_name(user.name),
        )
        if sender_role is None:
            raise WorkspaceValidationError(
                "Only workspace participants can send inbox messages."
            )
        message["sender_name"] = sender_name
        sender_inbox_row, sender_inbox_state = _load_workspace_inbox_state_row(
            session=session, user_id=user_id
        )
        sender_existing_ids = {
            _trim(item.get("id"))
            for item in (sender_inbox_state.get("messages") or [])
        }

        participant_user_ids = _workspace_participant_user_ids(
            session=session,
            workspace_id=_trim(message.get("workspace_id")),
        )
        clean_user_id = _trim(user_id)
        if clean_user_id and clean_user_id not in participant_user_ids:
            participant_user_ids.append(clean_user_id)

        base_message_id = _trim(message.get("id")) or f"msg-{uuid4().hex[:10]}"
        while base_message_id in sender_existing_ids:
            base_message_id = f"msg-{uuid4().hex[:10]}"
        message["id"] = base_message_id
        for participant_user_id in participant_user_ids:
            row, state = (
                (sender_inbox_row, sender_inbox_state)
                if participant_user_id == clean_user_id
                else _load_workspace_inbox_state_row(
                    session=session, user_id=participant_user_id
                )
            )
            messages = list(state.get("messages") or [])
            existing_ids = {_trim(item.get("id")) for item in messages}
            if base_message_id in existing_ids:
                # Message already synced to this participant.
                continue
            messages.append(dict(message))
            messages.sort(
                key=lambda item: (
                    _parse_timestamp(item.get("created_at"))
                    or datetime(1970, 1, 1, tzinfo=timezone.utc)
                )
            )
            state["messages"] = messages

            if participant_user_id == clean_user_id and sender_key:
                reads = dict(state.get("reads") or {})
                workspace_reads = dict(
                    reads.get(_trim(message.get("workspace_id"))) or {}
                )
                existing_read_at = workspace_reads.get(sender_key)
                resolved_read = _latest_timestamp(
                    existing_read_at, message.get("created_at")
                )
                if resolved_read:
                    workspace_reads[sender_key] = resolved_read
                    reads[_trim(message.get("workspace_id"))] = workspace_reads
                    state["reads"] = reads

            _save_workspace_inbox_state_row(row=row, state=state)
        session.flush()
        return message


def list_workspace_inbox_reads(
    *, user_id: str, workspace_id: str | None = None
) -> dict[str, Any]:
    clean_workspace_id = _trim(workspace_id)
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session=session, user_id=user_id)
        if clean_workspace_id:
            _resolve_workspace_access_context(
                session=session,
                user_id=user_id,
                workspace_id=clean_workspace_id,
            )
        _, state = _load_workspace_inbox_state_row(session=session, user_id=user_id)
        reads = dict(state.get("reads") or {})
        if clean_workspace_id:
            return {"reads": {clean_workspace_id: reads.get(clean_workspace_id) or {}}}
        return {"reads": reads}


def mark_workspace_inbox_read(*, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    clean_workspace_id = _trim(payload.get("workspace_id"))
    reader_name = _normalize_name(payload.get("reader_name"))
    if not clean_workspace_id:
        raise WorkspaceValidationError("workspace_id is required.")
    if not reader_name:
        raise WorkspaceValidationError("reader_name is required.")
    requested_read_at = _normalize_timestamp(payload.get("read_at"))
    reader_key = reader_name.casefold()

    create_all_tables()
    with session_scope() as session:
        _resolve_workspace_access_context(
            session=session,
            user_id=user_id,
            workspace_id=clean_workspace_id,
        )
        row, state = _load_workspace_inbox_state_row(session=session, user_id=user_id)
        reads = dict(state.get("reads") or {})
        workspace_reads = dict(reads.get(clean_workspace_id) or {})
        existing_read_at = workspace_reads.get(reader_key)
        resolved = _latest_timestamp(existing_read_at, requested_read_at)
        if not resolved:
            resolved = requested_read_at
        workspace_reads[reader_key] = resolved
        reads[clean_workspace_id] = workspace_reads
        state["reads"] = reads
        _save_workspace_inbox_state_row(row=row, state=state)
        session.flush()
        return {
            "workspace_id": clean_workspace_id,
            "reader_key": reader_key,
            "read_at": resolved,
        }


def has_workspace_access(*, user_id: str, workspace_id: str) -> bool:
    create_all_tables()
    with session_scope() as session:
        try:
            _resolve_workspace_access_context(
                session=session,
                user_id=user_id,
                workspace_id=workspace_id,
            )
            return True
        except (WorkspaceValidationError, WorkspaceNotFoundError):
            return False

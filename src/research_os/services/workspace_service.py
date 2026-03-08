from __future__ import annotations

import re
from datetime import datetime, timezone
from hashlib import sha1
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
WORKSPACE_AUDIT_CATEGORY_VALUES = {
    "collaborator_changes",
    "invitation_decisions",
    "workspace_changes",
    "conversation",
}
WORKSPACE_AUDIT_EVENT_TYPE_VALUES = {
    "member_invited",
    "invitation_cancelled",
    "invitation_accepted",
    "invitation_declined",
    "member_removed",
    "member_reinvited",
    "member_role_changed",
    "pending_role_changed",
    "workspace_locked",
    "workspace_unlocked",
    "workspace_renamed",
    "message_logged",
    "other",
}
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


def _normalize_role_map(
    values: Any, allowed_participants: list[dict[str, str]]
) -> dict[str, str]:
    source = values if isinstance(values, dict) else {}
    canonical_ids: list[str] = []
    canonical_by_name_key: dict[str, str] = {}
    seen_name_keys: set[str] = set()
    for participant in allowed_participants:
        participant_id = _trim(participant.get("user_id"))
        participant_name = _normalize_name(participant.get("name"))
        if not participant_id or not participant_name:
            continue
        canonical_ids.append(participant_id)
        name_key = participant_name.casefold()
        if name_key in seen_name_keys:
            canonical_by_name_key.pop(name_key, None)
            continue
        seen_name_keys.add(name_key)
        canonical_by_name_key[name_key] = participant_id

    output: dict[str, str] = {}
    for raw_key, raw_role in source.items():
        clean_key = _trim(raw_key)
        if not clean_key:
            continue
        canonical_id = (
            clean_key
            if clean_key in canonical_ids
            else canonical_by_name_key.get(_normalize_name(raw_key).casefold())
        )
        if not canonical_id:
            continue
        output[canonical_id] = _normalize_collaborator_role(raw_role)

    for canonical_id in canonical_ids:
        if canonical_id not in output:
            output[canonical_id] = "editor"
    return output


def _normalize_workspace_audit_entries(
    values: Any, workspace_id: str
) -> list[dict[str, Any]]:
    source = values if isinstance(values, list) else []
    clean_workspace_id = _trim(workspace_id)
    output: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, item in enumerate(source):
        record = item if isinstance(item, dict) else {}
        message = _normalize_name(record.get("message"))
        if not message:
            continue
        category = _trim(record.get("category")).lower()
        if category not in WORKSPACE_AUDIT_CATEGORY_VALUES:
            category = "collaborator_changes"
        event_type = _trim(
            record.get("event_type") or record.get("eventType")
        ).lower()
        if event_type not in WORKSPACE_AUDIT_EVENT_TYPE_VALUES:
            event_type = ""
        actor_user_id = _trim(
            record.get("actor_user_id") or record.get("actorUserId")
        ) or None
        actor_name = _normalize_name(
            record.get("actor_name") or record.get("actorName")
        ) or None
        subject_user_id = _trim(
            record.get("subject_user_id") or record.get("subjectUserId")
        ) or None
        subject_name = _normalize_name(
            record.get("subject_name") or record.get("subjectName")
        ) or None
        from_value = _trim(record.get("from_value") or record.get("fromValue")) or None
        to_value = _trim(record.get("to_value") or record.get("toValue")) or None
        role = _normalize_collaborator_role(record.get("role")) if record.get("role") else None
        metadata = (
            dict(record.get("metadata"))
            if isinstance(record.get("metadata"), dict)
            else {}
        )
        created_at = _normalize_timestamp(record.get("created_at"))
        entry_workspace_id = _trim(record.get("workspace_id")) or clean_workspace_id
        if not entry_workspace_id:
            continue
        entry_id = _trim(record.get("id")) or f"{entry_workspace_id}-audit-{index}"
        if entry_id in seen_ids:
            continue
        seen_ids.add(entry_id)
        output.append(
            {
                "id": entry_id,
                "workspace_id": entry_workspace_id,
                "category": category,
                "event_type": event_type or None,
                "actor_user_id": actor_user_id,
                "actor_name": actor_name,
                "subject_user_id": subject_user_id,
                "subject_name": subject_name,
                "from_value": from_value,
                "to_value": to_value,
                "role": role,
                "metadata": metadata,
                "message": message,
                "created_at": created_at,
            }
        )
    output.sort(
        key=lambda row: (
            _parse_timestamp(row.get("created_at"))
            or datetime(1970, 1, 1, tzinfo=timezone.utc)
        ),
        reverse=True,
    )
    return output


def _audit_entry_mentions_user(entry: dict[str, Any], user_display_name: str) -> bool:
    clean_user = _normalize_name(user_display_name)
    if not clean_user:
        return False
    message = _normalize_name(entry.get("message"))
    if not message:
        return False
    pattern = re.compile(
        rf"(^|[^0-9A-Za-z]){re.escape(clean_user)}([^0-9A-Za-z]|$)",
        flags=re.IGNORECASE,
    )
    return bool(pattern.search(message))


def _is_workspace_wide_audit_entry(entry: dict[str, Any]) -> bool:
    event_type = _trim(entry.get("event_type")).lower()
    category = _trim(entry.get("category")).lower()
    return event_type in {
        "workspace_locked",
        "workspace_unlocked",
        "workspace_renamed",
    } or category == "workspace_changes"


def _filter_workspace_audit_entries_for_collaborator(
    *,
    entries: Any,
    workspace_id: str,
    collaborator_user_id: str | None,
    collaborator_name: str,
) -> list[dict[str, Any]]:
    normalized_entries = _normalize_workspace_audit_entries(entries, workspace_id)
    clean_collaborator_user_id = _trim(collaborator_user_id)
    clean_collaborator_name = _normalize_name(collaborator_name)
    if not clean_collaborator_user_id and not clean_collaborator_name:
        return []
    filtered: list[dict[str, Any]] = []
    for entry in normalized_entries:
        if _is_workspace_wide_audit_entry(entry):
            filtered.append(entry)
            continue
        subject_user_id = _trim(entry.get("subject_user_id"))
        if clean_collaborator_user_id and subject_user_id == clean_collaborator_user_id:
            filtered.append(entry)
            continue
        subject_name = _normalize_name(entry.get("subject_name"))
        if clean_collaborator_name and subject_name == clean_collaborator_name:
            filtered.append(entry)
            continue
        if clean_collaborator_name and _audit_entry_mentions_user(entry, clean_collaborator_name):
            filtered.append(entry)
    return filtered


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


def _legacy_workspace_participant_id(*, workspace_id: str, name: str) -> str:
    clean_workspace_id = _trim(workspace_id) or "workspace"
    clean_name = _normalize_name(name) or "collaborator"
    digest = sha1(
        f"{clean_workspace_id}:{clean_name.casefold()}".encode("utf-8")
    ).hexdigest()[:12]
    return f"legacy:{digest}"


def _participant_has_real_user_id(value: Any) -> bool:
    clean = _trim(value)
    return bool(clean) and not clean.startswith("legacy:")


def _normalize_workspace_participant(
    payload: Any,
    *,
    workspace_id: str,
    fallback_name: str = "Unknown collaborator",
) -> dict[str, str] | None:
    if isinstance(payload, dict):
        clean_name = _normalize_name(payload.get("name"))
        clean_user_id = _trim(payload.get("user_id")) or _trim(payload.get("id"))
    else:
        clean_name = _normalize_name(payload)
        clean_user_id = ""
    if not clean_name and not clean_user_id:
        return None
    if not clean_name:
        clean_name = fallback_name
    if not clean_user_id:
        clean_user_id = _legacy_workspace_participant_id(
            workspace_id=workspace_id,
            name=clean_name,
        )
    return {
        "user_id": clean_user_id,
        "name": clean_name,
    }


def _normalize_participant_list(values: Any, *, workspace_id: str) -> list[dict[str, str]]:
    source = values if isinstance(values, list) else []
    output: list[dict[str, str]] = []
    index_by_name_key: dict[str, int] = {}
    seen_user_ids: set[str] = set()
    for item in source:
        participant = _normalize_workspace_participant(
            item,
            workspace_id=workspace_id,
        )
        if participant is None:
            continue
        participant_id = _trim(participant.get("user_id"))
        participant_name = _normalize_name(participant.get("name"))
        if not participant_id or not participant_name:
            continue
        name_key = participant_name.casefold()
        existing_index = index_by_name_key.get(name_key)
        if existing_index is not None:
            existing = output[existing_index]
            existing_id = _trim(existing.get("user_id"))
            if (
                not _participant_has_real_user_id(existing_id)
                and _participant_has_real_user_id(participant_id)
            ):
                seen_user_ids.discard(existing_id)
                output[existing_index] = participant
                seen_user_ids.add(participant_id)
            continue
        if participant_id in seen_user_ids:
            continue
        index_by_name_key[name_key] = len(output)
        seen_user_ids.add(participant_id)
        output.append(participant)
    return output


def _participant_ids(values: list[dict[str, str]]) -> list[str]:
    return [_trim(item.get("user_id")) for item in values if _trim(item.get("user_id"))]


def _participant_name_by_id(values: list[dict[str, str]]) -> dict[str, str]:
    output: dict[str, str] = {}
    for item in values:
        participant_id = _trim(item.get("user_id"))
        participant_name = _normalize_name(item.get("name"))
        if not participant_id or not participant_name:
            continue
        output[participant_id] = participant_name
    return output


def _participant_for_user_id(
    values: list[dict[str, str]], user_id: str
) -> dict[str, str] | None:
    clean_user_id = _trim(user_id)
    if not clean_user_id:
        return None
    for item in values:
        if _trim(item.get("user_id")) == clean_user_id:
            return dict(item)
    return None


def _upsert_participant(
    values: list[dict[str, str]], *, user_id: str, name: str
) -> list[dict[str, str]]:
    participant = _normalize_workspace_participant(
        {"user_id": user_id, "name": name},
        workspace_id="workspace",
    )
    if participant is None:
        return values
    clean_user_id = _trim(participant.get("user_id"))
    if not clean_user_id:
        return values
    next_values = [dict(item) for item in values]
    for index, item in enumerate(next_values):
        if _trim(item.get("user_id")) == clean_user_id:
            next_values[index] = participant
            return next_values
    next_values.append(participant)
    return next_values


def _filter_participants_by_user_ids(
    values: list[dict[str, str]], *, allowed_user_ids: set[str]
) -> list[dict[str, str]]:
    return [
        dict(item)
        for item in values
        if _trim(item.get("user_id")) in allowed_user_ids
    ]


def _normalize_workspace_record(payload: Any) -> dict[str, Any]:
    source = payload if isinstance(payload, dict) else {}
    workspace_id = _trim(source.get("id"))
    if not workspace_id:
        workspace_id = f"workspace-{uuid4().hex[:10]}"

    owner_name = _normalize_name(source.get("owner_name")) or WORKSPACE_FALLBACK_OWNER_NAME
    owner_user_id = _trim(source.get("owner_user_id")) or None
    collaborators = _normalize_participant_list(
        source.get("collaborators"),
        workspace_id=workspace_id,
    )
    if owner_user_id:
        collaborators = [
            value
            for value in collaborators
            if _trim(value.get("user_id")) != owner_user_id
        ]
    collaborator_ids = set(_participant_ids(collaborators))
    removed = _filter_participants_by_user_ids(
        _normalize_participant_list(
            source.get("removed_collaborators"),
            workspace_id=workspace_id,
        ),
        allowed_user_ids=collaborator_ids,
    )
    removed_ids = set(_participant_ids(removed))
    active_collaborator_ids = {
        value
        for value in _participant_ids(collaborators)
        if value not in removed_ids
    }
    pending = _normalize_participant_list(
        source.get("pending_collaborators"),
        workspace_id=workspace_id,
    )
    pending = [
        value
        for value in pending
        if _trim(value.get("user_id")) not in active_collaborator_ids
        and _trim(value.get("user_id")) != _trim(owner_user_id)
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
    audit_log_entries = _normalize_workspace_audit_entries(
        source.get("audit_log_entries"), workspace_id
    )

    return {
        "id": workspace_id,
        "name": _normalize_name(source.get("name")) or WORKSPACE_FALLBACK_NAME,
        "owner_name": owner_name,
        "owner_user_id": owner_user_id,
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
        "owner_archived": bool(source.get("owner_archived")),
        "audit_log_entries": audit_log_entries,
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
        "author_user_id": _trim(source.get("author_user_id")) or None,
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
        "invitee_user_id": _trim(source.get("invitee_user_id")) or None,
        "role": _normalize_collaborator_role(source.get("role")),
        "invited_at": _normalize_timestamp(source.get("invited_at")),
        "status": status,
    }
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


def _rewrite_role_map_keys(
    role_map: dict[str, str], replacements: dict[str, str]
) -> dict[str, str]:
    output: dict[str, str] = {}
    for key, value in (role_map or {}).items():
        clean_key = _trim(key)
        if not clean_key:
            continue
        output[replacements.get(clean_key, clean_key)] = _normalize_collaborator_role(
            value
        )
    return output


def _resolve_unique_user_id_by_name(
    *, session, name: str, exclude_user_id: str | None = None
) -> str | None:
    clean_name = _normalize_name(name)
    if not clean_name:
        return None
    lowered = clean_name.casefold()
    rows = session.scalars(select(User).where(func.lower(User.name) == lowered)).all()
    matched_ids = [
        _trim(row.id)
        for row in rows
        if _trim(row.id) and _trim(row.id) != _trim(exclude_user_id)
    ]
    unique_ids = list(dict.fromkeys(matched_ids))
    if len(unique_ids) != 1:
        return None
    return unique_ids[0]


def _resolve_workspace_participant_user_id(
    *,
    session,
    workspace_id: str,
    participant: dict[str, str],
    exclude_user_id: str | None = None,
) -> str | None:
    participant_id = _trim(participant.get("user_id"))
    if _participant_has_real_user_id(participant_id):
        return participant_id
    participant_name = _normalize_name(participant.get("name"))
    if not participant_name:
        return None
    return _resolve_unique_user_id_by_name(
        session=session,
        name=participant_name,
        exclude_user_id=exclude_user_id,
    )


def _backfill_workspace_identity_state(
    *, session, state_user_id: str, state: dict[str, Any]
) -> dict[str, Any]:
    next_state = normalize_workspace_state(state)
    changed = False

    next_author_requests: list[dict[str, Any]] = []
    for item in next_state.get("author_requests") or []:
        request = dict(item)
        if not _trim(request.get("author_user_id")) and _normalize_name(
            request.get("author_name")
        ):
            resolved_author_user_id = _resolve_unique_user_id_by_name(
                session=session,
                name=_normalize_name(request.get("author_name")),
                exclude_user_id=None,
            )
            if resolved_author_user_id:
                request["author_user_id"] = resolved_author_user_id
                changed = True
        next_author_requests.append(_normalize_author_request(request))
    next_state["author_requests"] = next_author_requests

    next_invitations: list[dict[str, Any]] = []
    for item in next_state.get("invitations_sent") or []:
        invitation = dict(item)
        if not _trim(invitation.get("invitee_user_id")) and _normalize_name(
            invitation.get("invitee_name")
        ):
            resolved_invitee_user_id = _resolve_unique_user_id_by_name(
                session=session,
                name=_normalize_name(invitation.get("invitee_name")),
                exclude_user_id=state_user_id,
            )
            if resolved_invitee_user_id:
                invitation["invitee_user_id"] = resolved_invitee_user_id
                changed = True
        next_invitations.append(_normalize_invitation_sent(invitation))
    next_state["invitations_sent"] = next_invitations

    next_workspaces: list[dict[str, Any]] = []
    for item in next_state.get("workspaces") or []:
        workspace = dict(item)
        workspace_id = _trim(workspace.get("id")) or f"workspace-{uuid4().hex[:10]}"
        replacements: dict[str, str] = {}

        owner_user_id = _trim(workspace.get("owner_user_id"))
        if not owner_user_id and _normalize_name(workspace.get("owner_name")):
            resolved_owner_user_id = _resolve_unique_user_id_by_name(
                session=session,
                name=_normalize_name(workspace.get("owner_name")),
                exclude_user_id=None,
            )
            if resolved_owner_user_id:
                workspace["owner_user_id"] = resolved_owner_user_id
                changed = True

        def _resolve_participants(values: Any) -> list[dict[str, str]]:
            nonlocal changed
            resolved: list[dict[str, str]] = []
            for participant in _normalize_participant_list(values, workspace_id=workspace_id):
                resolved_user_id = _resolve_workspace_participant_user_id(
                    session=session,
                    workspace_id=workspace_id,
                    participant=participant,
                    exclude_user_id=_trim(workspace.get("owner_user_id")) or None,
                )
                if resolved_user_id and resolved_user_id != _trim(participant.get("user_id")):
                    replacements[_trim(participant.get("user_id"))] = resolved_user_id
                    participant = {
                        "user_id": resolved_user_id,
                        "name": _normalize_name(participant.get("name")) or "Unknown collaborator",
                    }
                    changed = True
                resolved.append(participant)
            return resolved

        collaborators = _resolve_participants(workspace.get("collaborators"))
        pending_collaborators = _resolve_participants(
            workspace.get("pending_collaborators")
        )
        removed_collaborators = _resolve_participants(
            workspace.get("removed_collaborators")
        )
        collaborator_roles = _rewrite_role_map_keys(
            _normalize_role_map(workspace.get("collaborator_roles"), collaborators),
            replacements,
        )
        pending_collaborator_roles = _rewrite_role_map_keys(
            _normalize_role_map(
                workspace.get("pending_collaborator_roles"), pending_collaborators
            ),
            replacements,
        )
        normalized_workspace = _normalize_workspace_record(
            {
                **workspace,
                "id": workspace_id,
                "collaborators": collaborators,
                "pending_collaborators": pending_collaborators,
                "removed_collaborators": removed_collaborators,
                "collaborator_roles": collaborator_roles,
                "pending_collaborator_roles": pending_collaborator_roles,
            }
        )
        normalized_workspace["id"] = workspace_id
        next_workspaces.append(normalized_workspace)
    next_state["workspaces"] = next_workspaces
    return normalize_workspace_state(next_state) if changed else next_state


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
    normalized = _backfill_workspace_identity_state(
        session=session,
        state_user_id=user_id,
        state=normalized,
    )
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


def _remove_workspace_from_inbox_state(
    *,
    session,
    user_id: str,
    workspace_id: str,
) -> None:
    clean_user_id = _trim(user_id)
    clean_workspace_id = _trim(workspace_id)
    if not clean_user_id or not clean_workspace_id:
        return
    row, state = _load_workspace_inbox_state_row(session=session, user_id=clean_user_id)
    messages = [
        item
        for item in (state.get("messages") or [])
        if _trim(item.get("workspace_id")) != clean_workspace_id
    ]
    reads = dict(state.get("reads") or {})
    reads.pop(clean_workspace_id, None)
    state["messages"] = messages
    state["reads"] = reads
    _save_workspace_inbox_state_row(row=row, state=state)


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
    *, workspace: dict[str, Any], user_id: str
) -> str | None:
    clean_user_id = _trim(user_id)
    if not clean_user_id:
        return None

    owner_user_id = _trim(workspace.get("owner_user_id"))
    if owner_user_id and owner_user_id == clean_user_id:
        return "owner"

    collaborator_ids = set(
        _participant_ids(
            _normalize_participant_list(
                workspace.get("collaborators"),
                workspace_id=_trim(workspace.get("id")) or "workspace",
            )
        )
    )
    removed_ids = set(
        _participant_ids(
            _normalize_participant_list(
                workspace.get("removed_collaborators"),
                workspace_id=_trim(workspace.get("id")) or "workspace",
            )
        )
    )
    if clean_user_id in collaborator_ids and clean_user_id not in removed_ids:
        return "collaborator"
    return None


def _workspace_is_removed_collaborator(
    *, workspace: dict[str, Any], user_id: str
) -> bool:
    clean_user_id = _trim(user_id)
    if not clean_user_id:
        return False
    collaborator_ids = set(
        _participant_ids(
            _normalize_participant_list(
                workspace.get("collaborators"),
                workspace_id=_trim(workspace.get("id")) or "workspace",
            )
        )
    )
    removed_ids = set(
        _participant_ids(
            _normalize_participant_list(
                workspace.get("removed_collaborators"),
                workspace_id=_trim(workspace.get("id")) or "workspace",
            )
        )
    )
    return clean_user_id in collaborator_ids and clean_user_id in removed_ids


def _resolve_workspace_access_context(
    *,
    session,
    user_id: str,
    workspace_id: str,
    include_removed_collaborator: bool = False,
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
        workspace=workspace, user_id=user_id
    )
    if role is None:
        if include_removed_collaborator and _workspace_is_removed_collaborator(
            workspace=workspace, user_id=user_id
        ):
            return user, state, workspace
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
    state_rows = session.scalars(select(WorkspaceStateCache)).all()

    participant_ids: list[str] = []
    seen_ids: set[str] = set()
    for state_row in state_rows:
        row_user_id = _trim(state_row.user_id)
        if not row_user_id or row_user_id in seen_ids:
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
        role = _workspace_membership_role(workspace=workspace, user_id=row_user_id)
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
    collaborator_participants = _normalize_participant_list(
        owner_workspace.get("collaborators"),
        workspace_id=workspace_id,
    )
    collaborator_ids = set(_participant_ids(collaborator_participants))
    collaborator_name_by_id = _participant_name_by_id(collaborator_participants)
    collaborator_role_by_id = _normalize_role_map(
        owner_workspace.get("collaborator_roles"),
        collaborator_participants,
    )
    removed_ids = set(
        _participant_ids(
            _normalize_participant_list(
                owner_workspace.get("removed_collaborators"),
                workspace_id=workspace_id,
            )
        )
    )

    relevant_user_ids = set(collaborator_ids)
    previous_owner_user_id = _resolve_unique_user_id_by_name(
        session=session,
        name=previous_owner_name or "",
        exclude_user_id=None,
    )
    if previous_owner_user_id and previous_owner_user_id != clean_owner_user_id:
        relevant_user_ids.add(previous_owner_user_id)

    users = session.scalars(select(User)).all()
    for user in users:
        user_id = _trim(user.id)
        if (
            not user_id
            or user_id == clean_owner_user_id
            or user_id not in relevant_user_ids
        ):
            continue

        row, state = _load_workspace_state_row(session=session, user_id=user_id)
        index = _workspace_index(state, workspace_id)
        existing_workspace = (
            dict((state.get("workspaces") or [])[index]) if index >= 0 else {}
        )

        is_removed_for_user = user_id in removed_ids

        if user_id not in collaborator_ids or is_removed_for_user:
            if index < 0:
                if is_removed_for_user:
                    _remove_workspace_from_inbox_state(
                        session=session,
                        user_id=user_id,
                        workspace_id=workspace_id,
                    )
                continue
            if _trim(existing_workspace.get("owner_user_id")) != clean_owner_user_id:
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
            _remove_workspace_from_inbox_state(
                session=session,
                user_id=user_id,
                workspace_id=workspace_id,
            )
            continue

        collaborator_display_name = (
            collaborator_name_by_id.get(user_id) or _normalize_name(user.name) or "Collaborator"
        )
        collaborator_role = collaborator_role_by_id.get(user_id, "editor")
        locked_flag = bool(owner_workspace.get("owner_archived"))
        existing_archived = bool(existing_workspace.get("archived"))
        archived_for_user = existing_archived
        collaborator_audit_entries = _filter_workspace_audit_entries_for_collaborator(
            entries=owner_workspace.get("audit_log_entries"),
            workspace_id=workspace_id,
            collaborator_user_id=user_id,
            collaborator_name=collaborator_display_name,
        )
        synced_workspace = _normalize_workspace_record(
            {
                "id": workspace_id,
                "name": _normalize_name(owner_workspace.get("name"))
                or _normalize_name(existing_workspace.get("name"))
                or WORKSPACE_FALLBACK_NAME,
                "owner_name": owner_name,
                "owner_user_id": clean_owner_user_id,
                "collaborators": [
                    {
                        "user_id": user_id,
                        "name": collaborator_display_name,
                    }
                ],
                "collaborator_roles": {
                    user_id: collaborator_role
                },
                "pending_collaborators": [],
                "pending_collaborator_roles": {},
                "removed_collaborators": [],
                "version": _trim(owner_workspace.get("version"))
                or _trim(existing_workspace.get("version"))
                or "0.1",
                "health": _trim(owner_workspace.get("health"))
                or _trim(existing_workspace.get("health"))
                or "amber",
                "updated_at": _trim(owner_workspace.get("updated_at"))
                or _iso_timestamp(_utcnow()),
                "pinned": bool(existing_workspace.get("pinned")),
                "archived": archived_for_user,
                "owner_archived": locked_flag,
                "audit_log_entries": collaborator_audit_entries,
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
    return _resolve_unique_user_id_by_name(
        session=session,
        name=name,
        exclude_user_id=exclude_user_id,
    )


def _sync_workspace_pending_collaborator(
    *,
    state: dict[str, Any],
    workspace_id: str,
    collaborator_user_id: str,
    collaborator_name: str,
    pending: bool,
    role: str | None = None,
) -> bool:
    clean_workspace_id = _trim(workspace_id)
    clean_collaborator_user_id = _trim(collaborator_user_id)
    clean_collaborator_name = _normalize_name(collaborator_name)
    if (
        not clean_workspace_id
        or not clean_collaborator_user_id
        or not clean_collaborator_name
    ):
        return False
    workspace_index = _workspace_index(state, clean_workspace_id)
    if workspace_index < 0:
        return False

    workspaces = list(state.get("workspaces") or [])
    workspace = dict(workspaces[workspace_index])
    pending_collaborators = _normalize_participant_list(
        workspace.get("pending_collaborators"),
        workspace_id=clean_workspace_id,
    )
    pending_roles = _normalize_role_map(
        workspace.get("pending_collaborator_roles"), pending_collaborators
    )
    pending_ids = set(_participant_ids(pending_collaborators))
    normalized_role = _normalize_collaborator_role(role)

    collaborators = _normalize_participant_list(
        workspace.get("collaborators"),
        workspace_id=clean_workspace_id,
    )
    removed_ids = set(
        _participant_ids(
            _normalize_participant_list(
                workspace.get("removed_collaborators"),
                workspace_id=clean_workspace_id,
            )
        )
    )
    active_keys = {
        value for value in _participant_ids(collaborators) if value not in removed_ids
    }

    changed = False
    if pending:
        if clean_collaborator_user_id in active_keys:
            next_pending = [
                value
                for value in pending_collaborators
                if _trim(value.get("user_id")) != clean_collaborator_user_id
            ]
            if len(next_pending) != len(pending_collaborators):
                pending_collaborators = next_pending
                pending_roles = {
                    participant_id: value
                    for participant_id, value in pending_roles.items()
                    if _trim(participant_id) != clean_collaborator_user_id
                }
                changed = True
        elif clean_collaborator_user_id not in pending_ids:
            pending_collaborators.append(
                {
                    "user_id": clean_collaborator_user_id,
                    "name": clean_collaborator_name,
                }
            )
            pending_roles[clean_collaborator_user_id] = normalized_role
            changed = True
        else:
            existing_participant_id = next(
                (
                    _trim(item.get("user_id"))
                    for name in pending_collaborators
                    if _trim(name.get("user_id")) == clean_collaborator_user_id
                ),
                clean_collaborator_user_id,
            )
            if pending_roles.get(existing_participant_id) != normalized_role:
                pending_roles[existing_participant_id] = normalized_role
                changed = True
    else:
        next_pending = [
            value
            for value in pending_collaborators
            if _trim(value.get("user_id")) != clean_collaborator_user_id
        ]
        if len(next_pending) != len(pending_collaborators):
            pending_collaborators = next_pending
            pending_roles = {
                participant_id: value
                for participant_id, value in pending_roles.items()
                if _trim(participant_id) != clean_collaborator_user_id
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


def _workspace_role_label(value: Any) -> str:
    role = _normalize_collaborator_role(value)
    if role == "reviewer":
        return "reviewer"
    if role == "viewer":
        return "viewer"
    return "editor"


def _append_workspace_audit_entry(
    *,
    state: dict[str, Any],
    workspace_id: str,
    category: str,
    message: str,
    event_type: str | None = None,
    actor_user_id: str | None = None,
    actor_name: str | None = None,
    subject_user_id: str | None = None,
    subject_name: str | None = None,
    from_value: str | None = None,
    to_value: str | None = None,
    role: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> bool:
    clean_workspace_id = _trim(workspace_id)
    clean_message = _normalize_name(message)
    clean_category = _trim(category).lower()
    if clean_category not in WORKSPACE_AUDIT_CATEGORY_VALUES:
        clean_category = "collaborator_changes"
    clean_event_type = _trim(event_type).lower()
    if clean_event_type not in WORKSPACE_AUDIT_EVENT_TYPE_VALUES:
        clean_event_type = ""
    clean_actor_user_id = _trim(actor_user_id) or None
    clean_actor_name = _normalize_name(actor_name) or None
    clean_subject_user_id = _trim(subject_user_id) or None
    clean_subject_name = _normalize_name(subject_name) or None
    clean_from_value = _trim(from_value) or None
    clean_to_value = _trim(to_value) or None
    clean_role = _normalize_collaborator_role(role) if role else None
    clean_metadata = metadata if isinstance(metadata, dict) else {}
    if not clean_workspace_id or not clean_message:
        return False
    workspace_index = _workspace_index(state, clean_workspace_id)
    if workspace_index < 0:
        return False
    workspaces = list(state.get("workspaces") or [])
    workspace = dict(workspaces[workspace_index])
    current_entries = _normalize_workspace_audit_entries(
        workspace.get("audit_log_entries"), clean_workspace_id
    )
    created_at = _iso_timestamp(_utcnow())
    entry = {
        "id": f"{clean_workspace_id}-audit-{uuid4().hex[:10]}",
        "workspace_id": clean_workspace_id,
        "category": clean_category,
        "event_type": clean_event_type or None,
        "actor_user_id": clean_actor_user_id,
        "actor_name": clean_actor_name,
        "subject_user_id": clean_subject_user_id,
        "subject_name": clean_subject_name,
        "from_value": clean_from_value,
        "to_value": clean_to_value,
        "role": clean_role,
        "metadata": clean_metadata,
        "message": clean_message,
        "created_at": created_at,
    }
    workspace["audit_log_entries"] = [entry, *current_entries]
    workspace["updated_at"] = created_at
    normalized_workspace = _normalize_workspace_record(workspace)
    normalized_workspace["id"] = clean_workspace_id
    workspaces[workspace_index] = normalized_workspace
    state["workspaces"] = workspaces
    return True


def _append_owner_workspace_inbox_message_audit_entry(
    *,
    session,
    workspace_id: str,
    owner_name: str,
    owner_user_id: str | None,
    sender_user_id: str | None,
    sender_name: str,
    message_id: str,
    created_at: str,
    encrypted_body: str,
    iv: str,
) -> bool:
    clean_workspace_id = _trim(workspace_id)
    clean_owner_name = _normalize_name(owner_name)
    clean_sender_name = _normalize_name(sender_name) or "Unknown sender"
    clean_message_id = _trim(message_id)
    clean_created_at = _normalize_timestamp(created_at)
    clean_owner_user_id = _trim(owner_user_id)
    if not clean_workspace_id or not clean_message_id:
        return False

    resolved_owner_user_id = clean_owner_user_id or _find_user_id_by_display_name(
        session=session, name=clean_owner_name
    )
    if not resolved_owner_user_id:
        return False

    owner_row, owner_state = _load_workspace_state_row(
        session=session, user_id=resolved_owner_user_id
    )
    if _workspace_index(owner_state, clean_workspace_id) < 0:
        return False

    audit_message = (
        f"Inbox message logged: id {clean_message_id}, sender {clean_sender_name}, "
        f"created_at {clean_created_at}, ciphertext_length {len(encrypted_body)}, "
        f"iv_length {len(iv)}."
    )
    changed = _append_workspace_audit_entry(
        state=owner_state,
        workspace_id=clean_workspace_id,
        category="conversation",
        message=audit_message,
        event_type="message_logged",
        actor_user_id=_trim(sender_user_id) or None,
        actor_name=clean_sender_name,
        subject_user_id=_trim(sender_user_id) or None,
        subject_name=clean_sender_name,
        metadata={
            "message_id": clean_message_id,
            "message_created_at": clean_created_at,
            "ciphertext_length": len(encrypted_body),
            "iv_length": len(iv),
        },
    )
    if changed:
        _save_workspace_state_row(row=owner_row, state=owner_state)
    return changed


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
    previous_status = "pending"
    for item in state.get("invitations_sent") or []:
        if _trim(item.get("id")) == _trim(invitation_id):
            invitation_record = item
            current_status = _trim(item.get("status")).lower()
            if current_status in INVITATION_STATUS_VALUES:
                previous_status = current_status
            if current_status != clean_status:
                item["status"] = clean_status
                changed = True
            break
    if invitation_record is None:
        return False

    pending_changed = _sync_workspace_pending_collaborator(
        state=state,
        workspace_id=_trim(invitation_record.get("workspace_id")),
        collaborator_user_id=_trim(invitation_record.get("invitee_user_id")),
        collaborator_name=_normalize_name(invitation_record.get("invitee_name")),
        pending=clean_status == "pending",
        role=_normalize_collaborator_role(invitation_record.get("role")),
    )

    audit_changed = False
    if clean_status in {"accepted", "declined"} and previous_status != clean_status:
        invitee_name = _normalize_name(invitation_record.get("invitee_name")) or "Collaborator"
        role_label = _workspace_role_label(invitation_record.get("role"))
        audit_changed = _append_workspace_audit_entry(
            state=state,
            workspace_id=_trim(invitation_record.get("workspace_id")),
            category="invitation_decisions",
            event_type=(
                "invitation_accepted" if clean_status == "accepted" else "invitation_declined"
            ),
            actor_user_id=_trim(user_id) or None,
            actor_name=invitee_name,
            subject_user_id=_trim(invitation_record.get("invitee_user_id")) or None,
            subject_name=invitee_name,
            from_value=previous_status,
            to_value=clean_status,
            role=role_label,
            message=(
                f"{invitee_name} collaborator invitation status switched from "
                f"{previous_status} to {clean_status} by {invitee_name} as {role_label}."
            ),
        )

    if not changed and not pending_changed and not audit_changed:
        return False

    workspace_id = _trim(invitation_record.get("workspace_id"))
    updated_workspace = (
        _workspace_record_for_id(state, workspace_id) if workspace_id else None
    )

    if row is None:
        row = WorkspaceStateCache(user_id=user_id, payload_json=state)
        session.add(row)
    else:
        row.payload_json = state

    if updated_workspace is not None:
        if _trim(updated_workspace.get("owner_user_id")) == _trim(user_id):
            _sync_workspace_collaborator_states(
                session=session,
                owner_user_id=user_id,
                owner_workspace=updated_workspace,
            )
    return True


def _remove_author_request_for_invitation(
    *,
    session,
    inviter_user_id: str,
    invitation_record: dict[str, Any],
) -> bool:
    invitee_user_id = _trim(invitation_record.get("invitee_user_id"))
    if not invitee_user_id:
        return False

    invitee_row, invitee_state = _load_workspace_state_row(
        session=session, user_id=invitee_user_id
    )
    requests = list(invitee_state.get("author_requests") or [])
    request_id = _trim(invitation_record.get("linked_author_request_id"))
    invitation_id = _trim(invitation_record.get("id"))
    inviter_id = _trim(inviter_user_id)

    next_requests: list[dict[str, Any]] = []
    removed = False
    for item in requests:
        if request_id and _trim(item.get("id")) == request_id:
            removed = True
            continue
        if invitation_id and _trim(item.get("source_invitation_id")) == invitation_id:
            removed = True
            continue
        if (
            inviter_id
            and invitation_id
            and _trim(item.get("source_inviter_user_id")) == inviter_id
            and _trim(item.get("source_invitation_id")) == invitation_id
        ):
            removed = True
            continue
        next_requests.append(item)

    if not removed:
        return False

    invitee_state["author_requests"] = next_requests
    _save_workspace_state_row(row=invitee_row, state=invitee_state)
    return True


def _sync_pending_invitation_roles(
    *,
    session,
    owner_user_id: str,
    state: dict[str, Any],
    workspace: dict[str, Any],
) -> bool:
    workspace_id = _trim(workspace.get("id"))
    if not workspace_id:
        return False

    pending_collaborators = _normalize_participant_list(
        workspace.get("pending_collaborators"),
        workspace_id=workspace_id,
    )
    pending_roles = _normalize_role_map(
        workspace.get("pending_collaborator_roles"),
        pending_collaborators,
    )
    if not pending_roles:
        return False

    changed = False
    for invitation in state.get("invitations_sent") or []:
        if _trim(invitation.get("workspace_id")) != workspace_id:
            continue
        if _trim(invitation.get("status")).lower() != "pending":
            continue
        invitee_user_id = _trim(invitation.get("invitee_user_id"))
        next_role = pending_roles.get(invitee_user_id)
        if not next_role:
            continue
        normalized_next_role = _normalize_collaborator_role(next_role)
        if (
            _normalize_collaborator_role(invitation.get("role"))
            != normalized_next_role
        ):
            invitation["role"] = normalized_next_role
            changed = True

        invitee_row, invitee_state = _load_workspace_state_row(
            session=session,
            user_id=invitee_user_id,
        )
        request_changed = False
        for request in invitee_state.get("author_requests") or []:
            same_inviter = _trim(request.get("source_inviter_user_id")) == _trim(
                owner_user_id
            )
            same_invitation = _trim(request.get("source_invitation_id")) == _trim(
                invitation.get("id")
            )
            same_workspace = _trim(request.get("workspace_id")) == workspace_id
            if not same_workspace or (not same_invitation and not same_inviter):
                continue
            if (
                _normalize_collaborator_role(request.get("collaborator_role"))
                == normalized_next_role
            ):
                continue
            request["collaborator_role"] = normalized_next_role
            request_changed = True
        if request_changed:
            _save_workspace_state_row(row=invitee_row, state=invitee_state)
            changed = True

    return changed


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
        normalized_input["owner_user_id"] = user_id
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
        incoming_patch = dict(patch) if isinstance(patch, dict) else {}
        if "audit_log_entries" in incoming_patch:
            requested_entries = _normalize_workspace_audit_entries(
                incoming_patch.get("audit_log_entries"), clean_workspace_id
            )
            current_entries = _normalize_workspace_audit_entries(
                current.get("audit_log_entries"), clean_workspace_id
            )
            current_ids = {
                _trim(item.get("id")) for item in current_entries if _trim(item.get("id"))
            }
            # Enforce append-only audit history: existing ids are immutable and non-removable.
            new_entries = [
                item
                for item in requested_entries
                if _trim(item.get("id")) and _trim(item.get("id")) not in current_ids
            ]
            incoming_patch["audit_log_entries"] = [*new_entries, *current_entries]
        current_owner_name = _normalize_name(current.get("owner_name"))
        current_owner_user_id = _trim(current.get("owner_user_id"))
        requested_owner_name = _normalize_name(incoming_patch.get("owner_name"))
        requested_owner_user_id = _trim(incoming_patch.get("owner_user_id"))
        requester_is_owner = (
            _workspace_membership_role(workspace=current, user_id=user_id) == "owner"
        )
        transferring_owner = (
            bool(requested_owner_user_id)
            and requested_owner_user_id != current_owner_user_id
        )
        if transferring_owner and not requester_is_owner:
            raise WorkspaceValidationError(
                "Only the workspace owner can transfer ownership."
            )
        touches_collaborators_or_audit = any(
            key in incoming_patch
            for key in (
                "collaborators",
                "pending_collaborators",
                "collaborator_roles",
                "pending_collaborator_roles",
                "removed_collaborators",
                "audit_log_entries",
            )
        )
        if touches_collaborators_or_audit and not requester_is_owner:
            raise WorkspaceValidationError(
                "Only the workspace owner can manage collaborators."
            )
        touches_owner_managed_metadata = any(
            key in incoming_patch
            for key in (
                "name",
                "version",
                "health",
                "owner_archived",
            )
        )
        if touches_owner_managed_metadata and not requester_is_owner:
            raise WorkspaceValidationError(
                "Only the workspace owner can edit workspace details."
            )
        transfer_previous_owner_name: str | None = None
        transfer_previous_owner_user_id: str | None = None
        transfer_new_owner_name: str | None = None
        transfer_new_owner_user_id: str | None = None
        if transferring_owner:
            active_collaborators = _normalize_participant_list(
                current.get("collaborators"),
                workspace_id=clean_workspace_id,
            )
            removed_ids = set(
                _participant_ids(
                    _normalize_participant_list(
                        current.get("removed_collaborators"),
                        workspace_id=clean_workspace_id,
                    )
                )
            )
            active_collaborator_ids = {
                participant_id
                for participant_id in _participant_ids(active_collaborators)
                if participant_id not in removed_ids
            }
            if requested_owner_user_id not in active_collaborator_ids:
                raise WorkspaceValidationError(
                    "New workspace owner must be an active collaborator."
                )
            target_owner = session.get(User, requested_owner_user_id)
            if target_owner is None:
                raise WorkspaceValidationError(
                    "New workspace owner must have a registered account."
                )

            next_collaborators = [
                value
                for value in active_collaborators
                if _trim(value.get("user_id")) != requested_owner_user_id
            ]
            if current_owner_user_id and current_owner_name and current_owner_user_id not in {
                _trim(value.get("user_id")) for value in next_collaborators
            }:
                next_collaborators.append(
                    {
                        "user_id": current_owner_user_id,
                        "name": current_owner_name,
                    }
                )

            next_removed = [
                value
                for value in _normalize_participant_list(
                    current.get("removed_collaborators"),
                    workspace_id=clean_workspace_id,
                )
                if _trim(value.get("user_id"))
                not in {requested_owner_user_id, current_owner_user_id}
            ]
            next_pending = [
                value
                for value in _normalize_participant_list(
                    current.get("pending_collaborators"),
                    workspace_id=clean_workspace_id,
                )
                if _trim(value.get("user_id"))
                not in {requested_owner_user_id, current_owner_user_id}
            ]
            next_roles = {
                participant_id: role
                for name, role in _normalize_role_map(
                    current.get("collaborator_roles"), next_collaborators
                ).items()
                if _trim(name) != requested_owner_user_id
            }
            if current_owner_user_id:
                next_roles[current_owner_user_id] = _normalize_collaborator_role(
                    next_roles.get(current_owner_user_id)
                )
            next_pending_roles = {
                participant_id: role
                for name, role in _normalize_role_map(
                    current.get("pending_collaborator_roles"), next_pending
                ).items()
                if _trim(name)
                not in {requested_owner_user_id, current_owner_user_id}
            }

            transfer_previous_owner_name = current_owner_name
            transfer_previous_owner_user_id = current_owner_user_id
            transfer_new_owner_name = _normalize_name(target_owner.name)
            transfer_new_owner_user_id = requested_owner_user_id
            patch = {
                **incoming_patch,
                "owner_name": transfer_new_owner_name,
                "owner_user_id": transfer_new_owner_user_id,
                "collaborators": next_collaborators,
                "removed_collaborators": next_removed,
                "pending_collaborators": next_pending,
                "collaborator_roles": next_roles,
                "pending_collaborator_roles": next_pending_roles,
            }
            incoming_patch = patch

        merged = {**current, **incoming_patch}
        merged["id"] = clean_workspace_id
        merged["owner_name"] = (
            transfer_new_owner_name
            or current_owner_name
            or _normalize_name(user.name)
        )
        merged["owner_user_id"] = (
            transfer_new_owner_user_id or current_owner_user_id or user_id
        )
        if "updated_at" not in incoming_patch:
            merged["updated_at"] = _iso_timestamp(_utcnow())
        normalized = _normalize_workspace_record(merged)
        normalized["id"] = clean_workspace_id
        items[index] = normalized
        state["workspaces"] = items
        if requester_is_owner:
            _sync_pending_invitation_roles(
                session=session,
                owner_user_id=_trim(normalized.get("owner_user_id")) or user_id,
                state=state,
                workspace=normalized,
            )
        _save_workspace_state_row(row=row, state=state)
        if requester_is_owner:
            _sync_workspace_collaborator_states(
                session=session,
                owner_user_id=_trim(normalized.get("owner_user_id")) or user_id,
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


def search_workspace_accounts(*, user_id: str, query: str, limit: int = 8) -> dict[str, Any]:
    clean_query = _normalize_name(query)
    if len(clean_query) < 2:
        return {"items": []}
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session=session, user_id=user_id)
        lowered_query = clean_query.casefold()
        like = f"%{lowered_query}%"
        rows = session.execute(
            select(User.id, User.name, User.email)
            .where(
                User.id != user_id,
                func.lower(
                    func.trim(func.coalesce(User.name, User.email, ""))
                ).like(like)
                | func.lower(func.trim(func.coalesce(User.email, ""))).like(like),
            )
            .order_by(
                func.lower(func.trim(func.coalesce(User.name, User.email, ""))),
                func.lower(func.trim(func.coalesce(User.email, ""))),
            )
            .limit(max(1, min(int(limit or 8), 20)))
        ).all()
        items: list[dict[str, str]] = []
        for candidate_user_id, candidate_name, candidate_email in rows:
            clean_candidate_user_id = _trim(candidate_user_id)
            if not clean_candidate_user_id:
                continue
            clean_candidate_email = _trim(candidate_email)
            items.append(
                {
                    "user_id": clean_candidate_user_id,
                    "name": _normalize_name(candidate_name)
                    or clean_candidate_email
                    or clean_candidate_user_id,
                    "email": clean_candidate_email,
                }
            )
        return {"items": items}


def create_workspace_invitation(*, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    clean_workspace_id = _trim(payload.get("workspace_id"))
    invitee_user_id = _trim(payload.get("invitee_user_id"))
    collaborator_role = _normalize_collaborator_role(payload.get("role"))
    if not clean_workspace_id:
        raise WorkspaceValidationError("Workspace id is required.")
    if not invitee_user_id:
        raise WorkspaceValidationError("Invitee account is required.")

    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session=session, user_id=user_id)
        invitee = session.get(User, invitee_user_id)
        if invitee is None:
            raise WorkspaceValidationError("Invitee account was not found.")
        invitee_name = _normalize_name(invitee.name) or _normalize_name(invitee.email) or "Collaborator"
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
        owner_user_id = _trim(workspace.get("owner_user_id"))
        if owner_user_id != user_id:
            raise WorkspaceValidationError(
                "Only the workspace owner can invite collaborators."
            )
        collaborator_ids = set(
            _participant_ids(
                _normalize_participant_list(
                    workspace.get("collaborators"),
                    workspace_id=clean_workspace_id,
                )
            )
        )
        removed_ids = set(
            _participant_ids(
                _normalize_participant_list(
                    workspace.get("removed_collaborators"),
                    workspace_id=clean_workspace_id,
                )
            )
        )
        pending_ids = set(
            _participant_ids(
                _normalize_participant_list(
                    workspace.get("pending_collaborators"),
                    workspace_id=clean_workspace_id,
                )
            )
        )
        if invitee_user_id in collaborator_ids and invitee_user_id not in removed_ids:
            raise WorkspaceValidationError(
                "Invitee is already an active collaborator."
            )
        if invitee_user_id in pending_ids:
            raise WorkspaceValidationError(
                "Invitee already has pending access."
            )
        if owner_user_id and owner_user_id == invitee_user_id:
            raise WorkspaceValidationError(
                "Invitee cannot match the workspace owner."
            )

        invitations = list(sender_state.get("invitations_sent") or [])
        has_pending_duplicate = any(
            _trim(item.get("workspace_id")) == clean_workspace_id
            and _trim(item.get("invitee_user_id")) == invitee_user_id
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
                "invitee_user_id": invitee_user_id,
                "role": collaborator_role,
                "invited_at": _normalize_timestamp(payload.get("invited_at")),
                "status": _trim(payload.get("status")) or "pending",
            }
        )
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
                "author_user_id": user_id,
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
            collaborator_user_id=invitee_user_id,
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
        user = _resolve_user_or_raise(session=session, user_id=user_id)
        row, state = _load_workspace_state_row(session=session, user_id=user_id)
        invitations = list(state.get("invitations_sent") or [])
        updated: dict[str, Any] | None = None
        previous_status = "pending"
        for item in invitations:
            if _trim(item.get("id")) != clean_invitation_id:
                continue
            current_status = _trim(item.get("status")).lower()
            if current_status in INVITATION_STATUS_VALUES:
                previous_status = current_status
            item["status"] = clean_status
            updated = item
            break
        if updated is None:
            raise WorkspaceNotFoundError(
                f"Invitation '{clean_invitation_id}' was not found."
            )
        pending_changed = _sync_workspace_pending_collaborator(
            state=state,
            workspace_id=_trim(updated.get("workspace_id")),
            collaborator_user_id=_trim(updated.get("invitee_user_id")),
            collaborator_name=_normalize_name(updated.get("invitee_name")),
            pending=clean_status == "pending",
            role=_normalize_collaborator_role(updated.get("role")),
        )
        request_removed = False
        if previous_status == "pending" and clean_status != "pending":
            request_removed = _remove_author_request_for_invitation(
                session=session,
                inviter_user_id=user_id,
                invitation_record=updated,
            )

        audit_changed = False
        if clean_status in {"accepted", "declined"} and previous_status != clean_status:
            invitee_name = _normalize_name(updated.get("invitee_name")) or "Collaborator"
            actor_name = _normalize_name(user.name) or "Unknown user"
            role_label = _workspace_role_label(updated.get("role"))
            audit_changed = _append_workspace_audit_entry(
                state=state,
                workspace_id=_trim(updated.get("workspace_id")),
                category="invitation_decisions",
                event_type=(
                    "invitation_accepted" if clean_status == "accepted" else "invitation_declined"
                ),
                actor_user_id=_trim(user_id) or None,
                actor_name=actor_name,
                subject_user_id=_trim(updated.get("invitee_user_id")) or None,
                subject_name=invitee_name,
                from_value=previous_status,
                to_value=clean_status,
                role=role_label,
                message=(
                    f"{invitee_name} collaborator invitation status switched from "
                    f"{previous_status} to {clean_status} by {actor_name} as {role_label}."
                ),
            )
        state["invitations_sent"] = invitations
        if pending_changed or request_removed or audit_changed or previous_status != clean_status:
            _save_workspace_state_row(row=row, state=state)
        session.flush()
        return updated


def accept_workspace_author_request(*, user_id: str, request_id: str) -> dict[str, Any]:
    clean_request_id = _trim(request_id)
    if not clean_request_id:
        raise WorkspaceValidationError("Author request id is required.")

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
        requested_workspace_index = _workspace_index(state, requested_workspace_id)
        requested_workspace_existing = (
            dict(workspaces[requested_workspace_index])
            if requested_workspace_index >= 0
            else None
        )
        request_owner_name = (
            _normalize_name(request.get("author_name")) or WORKSPACE_FALLBACK_OWNER_NAME
        )
        request_owner_user_id = _trim(request.get("author_user_id")) or _trim(
            request.get("source_inviter_user_id")
        )
        can_reuse_requested_workspace = bool(
            requested_workspace_existing
            and _trim(requested_workspace_existing.get("owner_user_id"))
            == request_owner_user_id
        )
        workspace_id = (
            requested_workspace_id
            if can_reuse_requested_workspace
            else _ensure_unique_workspace_id(
                desired_id=requested_workspace_id, existing_ids=existing_ids
            )
        )
        collaborator_display_name = _normalize_name(user.name) or _normalize_name(
            user.email
        ) or "Collaborator"
        collaborator_role = _normalize_collaborator_role(
            request.get("collaborator_role")
        )
        accepted_at = _iso_timestamp(_utcnow())
        collaborator_participant = {
            "user_id": user_id,
            "name": collaborator_display_name,
        }
        next_workspace = _normalize_workspace_record(
            {
                "id": workspace_id,
                "name": _normalize_name(request.get("workspace_name"))
                or WORKSPACE_FALLBACK_NAME,
                "owner_name": request_owner_name,
                "owner_user_id": request_owner_user_id or None,
                "collaborators": [collaborator_participant],
                "collaborator_roles": {
                    user_id: collaborator_role
                },
                "pending_collaborators": [],
                "pending_collaborator_roles": {},
                "removed_collaborators": [],
                "version": "0.1",
                "health": "amber",
                "updated_at": accepted_at,
                "pinned": False,
                "archived": False,
                "audit_log_entries": [
                    {
                        "id": f"{workspace_id}-audit-{uuid4().hex[:10]}",
                        "workspace_id": workspace_id,
                        "category": "invitation_decisions",
                        "event_type": "invitation_accepted",
                        "actor_user_id": user_id,
                        "actor_name": collaborator_display_name,
                        "subject_user_id": user_id,
                        "subject_name": collaborator_display_name,
                        "from_value": "pending",
                        "to_value": "accepted",
                        "role": _workspace_role_label(collaborator_role),
                        "metadata": {},
                        "message": (
                            f"{collaborator_display_name} collaborator "
                            f"invitation status switched from pending to accepted by "
                            f"{collaborator_display_name} as "
                            f"{_workspace_role_label(collaborator_role)}."
                        ),
                        "created_at": accepted_at,
                    }
                ],
            }
        )

        if can_reuse_requested_workspace and requested_workspace_index >= 0:
            workspaces[requested_workspace_index] = next_workspace
        else:
            workspaces.insert(0, next_workspace)
        state["workspaces"] = workspaces
        state["author_requests"] = [
            item
            for item in requests
            if _trim(item.get("id")) != clean_request_id
        ]
        state["active_workspace_id"] = next_workspace["id"]
        _save_workspace_state_row(row=row, state=state)

        # On acceptance, inbox history becomes scoped to the new active membership
        # window for this collaborator.
        inbox_row, inbox_state = _load_workspace_inbox_state_row(
            session=session, user_id=user_id
        )
        inbox_messages = list(inbox_state.get("messages") or [])
        filtered_messages = [
            item
            for item in inbox_messages
            if _trim(item.get("workspace_id")) != workspace_id
        ]
        reads = dict(inbox_state.get("reads") or {})
        had_reads = workspace_id in reads
        if had_reads:
            reads.pop(workspace_id, None)
        if len(filtered_messages) != len(inbox_messages) or had_reads:
            inbox_state["messages"] = filtered_messages
            inbox_state["reads"] = reads
            _save_workspace_inbox_state_row(row=inbox_row, state=inbox_state)

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
                owner_workspace_collaborators = _normalize_participant_list(
                    inviter_workspace.get("collaborators"),
                    workspace_id=requested_workspace_id,
                )
                if user_id not in {
                    _trim(value.get("user_id")) for value in owner_workspace_collaborators
                }:
                    owner_workspace_collaborators.append(collaborator_participant)
                owner_workspace_roles = _normalize_role_map(
                    inviter_workspace.get("collaborator_roles"),
                    owner_workspace_collaborators,
                )
                owner_workspace_roles[user_id] = collaborator_role
                owner_workspace_removed = [
                    value
                    for value in _normalize_participant_list(
                        inviter_workspace.get("removed_collaborators"),
                        workspace_id=requested_workspace_id,
                    )
                    if _trim(value.get("user_id")) != user_id
                ]
                owner_workspace_pending = [
                    value
                    for value in _normalize_participant_list(
                        inviter_workspace.get("pending_collaborators"),
                        workspace_id=requested_workspace_id,
                    )
                    if _trim(value.get("user_id")) != user_id
                ]
                owner_workspace_pending_roles = {
                    participant_id: value
                    for name, value in _normalize_role_map(
                        inviter_workspace.get("pending_collaborator_roles"),
                        owner_workspace_pending,
                    ).items()
                    if _trim(name) != user_id
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
        if bool(workspace.get("owner_archived")) and _trim(workspace.get("owner_user_id")) != _trim(user_id):
            raise WorkspaceValidationError(
                "Locked workspaces are read-only until unlocked."
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
        _append_owner_workspace_inbox_message_audit_entry(
            session=session,
            workspace_id=_trim(message.get("workspace_id")),
            owner_name=_normalize_name(workspace.get("owner_name")),
            owner_user_id=_trim(workspace.get("owner_user_id")) or None,
            sender_user_id=_trim(user_id) or None,
            sender_name=sender_name,
            message_id=_trim(message.get("id")),
            created_at=_trim(message.get("created_at")),
            encrypted_body=_trim(message.get("encrypted_body")),
            iv=_trim(message.get("iv")),
        )
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

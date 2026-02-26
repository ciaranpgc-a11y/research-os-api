from __future__ import annotations

import csv
import io
import json
import mimetypes
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import func, select

from research_os.config import get_data_library_root
from research_os.db import (
    DataLibraryAsset,
    DataProfile,
    Manuscript,
    ManuscriptAssetLink,
    ManuscriptPlan,
    PlannerArtifact,
    Project,
    User,
    create_all_tables,
    session_scope,
)

SECTION_CONTEXTS = {"RESULTS", "TABLES", "FIGURES", "PLANNER"}
TOOL_NAMES = {
    "improve",
    "critique",
    "alternatives",
    "subheadings",
    "link_to_data",
    "checklist",
}


class DataAssetNotFoundError(RuntimeError):
    pass


class PlannerValidationError(RuntimeError):
    pass


_STORAGE_MIGRATED_ROOTS: set[str] = set()


def _trim(value: Any) -> str:
    return str(value or "").strip()


def _normalize_optional_id(value: Any) -> str | None:
    clean = _trim(value)
    if not clean:
        return None
    if clean.lower() in {"none", "null", "undefined"}:
        return None
    return clean


def _normalize_user_ids(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    deduped: list[str] = []
    seen: set[str] = set()
    for item in values:
        user_id = _trim(item)
        if not user_id or user_id in seen:
            continue
        seen.add(user_id)
        deduped.append(user_id)
    return deduped


def _resolve_user_ids_by_names(
    *, session, names: list[str], exclude_user_id: str | None = None
) -> list[str]:
    clean_names = [_trim(name) for name in names if _trim(name)]
    if not clean_names:
        return []

    excluded = _trim(exclude_user_id)
    deduped_ids: list[str] = []
    seen_ids: set[str] = set()
    unresolved: list[str] = []
    for name in clean_names:
        user = session.scalars(select(User).where(func.lower(User.name) == name.lower())).first()
        if user is None:
            unresolved.append(name)
            continue
        user_id = _trim(user.id)
        if not user_id or user_id == excluded or user_id in seen_ids:
            continue
        seen_ids.add(user_id)
        deduped_ids.append(user_id)
    if unresolved:
        raise PlannerValidationError(
            "Could not resolve collaborator account(s): " + ", ".join(unresolved) + "."
        )
    return deduped_ids


def _project_allows_user(project: Project, user_id: str | None) -> bool:
    clean_user_id = _trim(user_id)
    if not clean_user_id:
        return True
    if _trim(project.owner_user_id) == clean_user_id:
        return True
    return clean_user_id in _normalize_user_ids(project.collaborator_user_ids)


def _resolve_project_for_user(*, session, project_id: str, user_id: str | None) -> Project:
    project = session.get(Project, _trim(project_id))
    if project is None:
        raise PlannerValidationError(f"Project '{project_id}' was not found.")
    if not _project_allows_user(project, user_id):
        raise PlannerValidationError(f"Project '{project_id}' was not found.")
    return project


def _resolve_manuscript_for_user(
    *, session, manuscript_id: str, user_id: str | None
) -> Manuscript:
    manuscript = session.get(Manuscript, _trim(manuscript_id))
    if manuscript is None:
        raise PlannerValidationError(f"Manuscript '{manuscript_id}' was not found.")
    project = _resolve_project_for_user(
        session=session, project_id=str(manuscript.project_id), user_id=user_id
    )
    if str(manuscript.project_id) != str(project.id):
        raise PlannerValidationError(f"Manuscript '{manuscript_id}' was not found.")
    return manuscript


def _asset_accessible_for_user(
    *, session, asset: DataLibraryAsset, user_id: str | None
) -> bool:
    clean_user_id = _trim(user_id)
    if not clean_user_id:
        return False
    if _trim(asset.owner_user_id) == clean_user_id:
        return True
    shared_ids_raw = asset.shared_with_user_ids
    if shared_ids_raw is not None:
        return clean_user_id in _normalize_user_ids(shared_ids_raw)
    project_id = _trim(asset.project_id)
    if not project_id:
        return False
    project = session.get(Project, project_id)
    if project is None:
        return False
    return _project_allows_user(project, clean_user_id)


def _asset_shared_user_ids(asset: DataLibraryAsset) -> list[str]:
    return _normalize_user_ids(asset.shared_with_user_ids)


def _legacy_storage_roots(primary_root: Path) -> list[Path]:
    candidates: list[Path] = []
    repo_root_candidate = Path(__file__).resolve().parents[3] / "data_library_store"
    cwd_candidate = Path.cwd() / "data_library_store"
    for candidate in [repo_root_candidate, cwd_candidate]:
        resolved = candidate.resolve()
        if resolved == primary_root:
            continue
        if resolved not in candidates:
            candidates.append(resolved)
    return candidates


def _migrate_legacy_storage_files(primary_root: Path) -> None:
    root_key = str(primary_root.resolve())
    if root_key in _STORAGE_MIGRATED_ROOTS:
        return
    _STORAGE_MIGRATED_ROOTS.add(root_key)
    for legacy_root in _legacy_storage_roots(primary_root):
        if not legacy_root.exists() or not legacy_root.is_dir():
            continue
        for source_path in legacy_root.iterdir():
            if not source_path.is_file():
                continue
            target_path = primary_root / source_path.name
            if target_path.exists():
                continue
            try:
                shutil.copy2(source_path, target_path)
            except OSError:
                continue


def _candidate_asset_paths(asset: DataLibraryAsset, primary_root: Path) -> list[Path]:
    candidates: list[Path] = []
    suffix = Path(_trim(asset.filename)).suffix
    if suffix:
        candidates.append(primary_root / f"{asset.id}{suffix}")
    candidates.append(primary_root / f"{asset.id}.bin")

    for match in primary_root.glob(f"{asset.id}.*"):
        candidates.append(match)

    raw_storage_path = _trim(asset.storage_path)
    if raw_storage_path:
        candidates.append(Path(raw_storage_path))

    for legacy_root in _legacy_storage_roots(primary_root):
        if suffix:
            candidates.append(legacy_root / f"{asset.id}{suffix}")
        candidates.append(legacy_root / f"{asset.id}.bin")
        if legacy_root.exists():
            for match in legacy_root.glob(f"{asset.id}.*"):
                candidates.append(match)

    deduped: list[Path] = []
    seen: set[str] = set()
    for path in candidates:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(path)
    return deduped


def _resolve_existing_asset_path(asset: DataLibraryAsset, primary_root: Path) -> Path | None:
    for candidate in _candidate_asset_paths(asset, primary_root):
        try:
            if candidate.exists() and candidate.is_file():
                resolved = candidate.resolve()
                if resolved.parent != primary_root:
                    migrated_target = (primary_root / resolved.name).resolve()
                    if not migrated_target.exists():
                        try:
                            shutil.copy2(resolved, migrated_target)
                        except OSError:
                            return resolved
                    return migrated_target
                return resolved
        except OSError:
            continue
    return None


def _asset_storage_exists(asset: DataLibraryAsset, primary_root: Path) -> bool:
    return _resolve_existing_asset_path(asset, primary_root) is not None


def _display_name_for_user(*, user: User | None, fallback_user_id: str | None = None) -> str:
    if user is not None:
        name = _trim(user.name)
        if name:
            return name
    clean_id = _trim(fallback_user_id)
    return clean_id or "Unknown user"


def _serialize_library_asset(
    *,
    session,
    asset: DataLibraryAsset,
    requesting_user_id: str | None = None,
) -> dict[str, object]:
    owner_id = _trim(asset.owner_user_id) or None
    owner_user = session.get(User, owner_id) if owner_id else None
    owner_name = _display_name_for_user(user=owner_user, fallback_user_id=owner_id)
    shared_ids = _asset_shared_user_ids(asset)
    shared_with: list[dict[str, str]] = []
    for shared_id in shared_ids:
        shared_user = session.get(User, shared_id)
        shared_with.append(
            {
                "user_id": shared_id,
                "name": _display_name_for_user(
                    user=shared_user, fallback_user_id=shared_id
                ),
            }
        )
    return {
        "id": asset.id,
        "owner_user_id": asset.owner_user_id,
        "owner_name": owner_name,
        "project_id": asset.project_id,
        "filename": asset.filename,
        "kind": asset.kind,
        "mime_type": asset.mime_type,
        "byte_size": int(asset.byte_size or 0),
        "uploaded_at": asset.uploaded_at,
        "shared_with_user_ids": shared_ids,
        "shared_with": shared_with,
        "can_manage_access": bool(
            _trim(requesting_user_id) and _trim(requesting_user_id) == _trim(asset.owner_user_id)
        ),
    }


def _storage_root() -> Path:
    root = get_data_library_root()
    _migrate_legacy_storage_files(root)
    return root


def _asset_metadata_path(*, asset_id: str, root: Path) -> Path:
    return root / f"{asset_id}.meta.json"


def _parse_iso_datetime(value: Any) -> datetime | None:
    raw = _trim(value)
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _metadata_asset_id(payload: dict[str, Any]) -> str:
    return _trim(payload.get("id") or payload.get("asset_id"))


def _load_asset_metadata(path: Path) -> dict[str, Any] | None:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _write_asset_metadata(*, root: Path, payload: dict[str, Any]) -> None:
    asset_id = _metadata_asset_id(payload)
    if not asset_id:
        return
    path = _asset_metadata_path(asset_id=asset_id, root=root)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp")
    try:
        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=True, sort_keys=True),
            encoding="utf-8",
        )
        os.replace(tmp_path, path)
    except OSError:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass


def _resolve_owner_user_id_from_metadata(*, session, payload: dict[str, Any]) -> str | None:
    owner_user_id = _trim(payload.get("owner_user_id"))
    if owner_user_id:
        owner_user = session.get(User, owner_user_id)
        if owner_user is not None:
            return owner_user_id
    owner_email = _trim(payload.get("owner_email")).lower()
    if owner_email:
        owner_user = session.scalars(
            select(User).where(func.lower(User.email) == owner_email)
        ).first()
        if owner_user is not None:
            resolved_owner_user_id = _trim(owner_user.id)
            if resolved_owner_user_id:
                return resolved_owner_user_id
    return None


def _resolve_project_id_from_metadata(*, session, payload: dict[str, Any]) -> str | None:
    project_id = _trim(payload.get("project_id"))
    if not project_id:
        return None
    project = session.get(Project, project_id)
    return project_id if project is not None else None


def _resolve_shared_ids_from_metadata(*, session, payload: dict[str, Any], owner_user_id: str | None) -> list[str]:
    raw_shared_ids = payload.get("shared_with_user_ids")
    normalized = _normalize_user_ids(raw_shared_ids if isinstance(raw_shared_ids, list) else [])
    owner_id = _trim(owner_user_id)
    resolved: list[str] = []
    seen: set[str] = set()
    for user_id in normalized:
        if user_id in seen or user_id == owner_id:
            continue
        if session.get(User, user_id) is None:
            continue
        seen.add(user_id)
        resolved.append(user_id)
    return resolved


def _metadata_storage_candidates(*, payload: dict[str, Any], primary_root: Path) -> list[Path]:
    asset_id = _metadata_asset_id(payload)
    if not asset_id:
        return []
    candidates: list[Path] = []
    filename = _trim(payload.get("filename"))
    suffix = Path(filename).suffix
    if suffix:
        candidates.append(primary_root / f"{asset_id}{suffix}")
    candidates.append(primary_root / f"{asset_id}.bin")
    for match in primary_root.glob(f"{asset_id}.*"):
        if match.name.endswith(".meta.json"):
            continue
        candidates.append(match)
    raw_storage_path = _trim(payload.get("storage_path"))
    if raw_storage_path:
        candidates.append(Path(raw_storage_path))
    for legacy_root in _legacy_storage_roots(primary_root):
        if suffix:
            candidates.append(legacy_root / f"{asset_id}{suffix}")
        candidates.append(legacy_root / f"{asset_id}.bin")
        if legacy_root.exists():
            for match in legacy_root.glob(f"{asset_id}.*"):
                if match.name.endswith(".meta.json"):
                    continue
                candidates.append(match)
    deduped: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
    return deduped


def _resolve_storage_path_from_metadata(*, payload: dict[str, Any], primary_root: Path) -> Path | None:
    for candidate in _metadata_storage_candidates(payload=payload, primary_root=primary_root):
        try:
            if not candidate.exists() or not candidate.is_file():
                continue
            resolved = candidate.resolve()
            if resolved.parent != primary_root:
                migrated_target = (primary_root / resolved.name).resolve()
                if not migrated_target.exists():
                    try:
                        shutil.copy2(resolved, migrated_target)
                    except OSError:
                        return resolved
                return migrated_target
            return resolved
        except OSError:
            continue
    return None


def _build_asset_metadata_payload(
    *, session, asset: DataLibraryAsset, primary_root: Path
) -> dict[str, Any]:
    owner_user_id = _trim(asset.owner_user_id) or None
    owner_email = ""
    if owner_user_id:
        owner_user = session.get(User, owner_user_id)
        owner_email = _trim(owner_user.email).lower() if owner_user is not None else ""
    uploaded_at = asset.uploaded_at
    uploaded_at_str = ""
    if isinstance(uploaded_at, datetime):
        if uploaded_at.tzinfo is None:
            uploaded_at = uploaded_at.replace(tzinfo=timezone.utc)
        uploaded_at_str = uploaded_at.astimezone(timezone.utc).isoformat()
    resolved_storage_path = _resolve_existing_asset_path(asset, primary_root)
    storage_path = str(resolved_storage_path) if resolved_storage_path is not None else _trim(asset.storage_path)
    shared_with_user_ids = _asset_shared_user_ids(asset)
    return {
        "id": asset.id,
        "owner_user_id": owner_user_id,
        "owner_email": owner_email,
        "project_id": _trim(asset.project_id) or None,
        "shared_with_user_ids": shared_with_user_ids,
        "filename": _trim(asset.filename) or "asset.bin",
        "kind": _trim(asset.kind) or _guess_kind(_trim(asset.filename)),
        "mime_type": _trim(asset.mime_type) or None,
        "byte_size": int(asset.byte_size or 0),
        "storage_path": storage_path,
        "uploaded_at": uploaded_at_str,
    }


def _sync_asset_metadata_for_row(*, session, asset: DataLibraryAsset, primary_root: Path) -> None:
    payload = _build_asset_metadata_payload(
        session=session,
        asset=asset,
        primary_root=primary_root,
    )
    _write_asset_metadata(root=primary_root, payload=payload)


def _restore_asset_row_from_metadata(
    *,
    session,
    primary_root: Path,
    asset_id: str | None = None,
) -> bool:
    requested_asset_id = _trim(asset_id)
    metadata_paths = (
        [_asset_metadata_path(asset_id=requested_asset_id, root=primary_root)]
        if requested_asset_id
        else list(primary_root.glob("*.meta.json"))
    )
    restored_any = False
    for metadata_path in metadata_paths:
        if not metadata_path.exists() or not metadata_path.is_file():
            continue
        payload = _load_asset_metadata(metadata_path)
        if not payload:
            continue
        metadata_asset_id = _metadata_asset_id(payload)
        if not metadata_asset_id:
            continue
        if requested_asset_id and metadata_asset_id != requested_asset_id:
            continue
        storage_path = _resolve_storage_path_from_metadata(
            payload=payload,
            primary_root=primary_root,
        )
        if storage_path is None:
            continue
        existing = session.get(DataLibraryAsset, metadata_asset_id)
        owner_user_id = _resolve_owner_user_id_from_metadata(session=session, payload=payload)
        project_id = _resolve_project_id_from_metadata(session=session, payload=payload)
        shared_with_user_ids = _resolve_shared_ids_from_metadata(
            session=session,
            payload=payload,
            owner_user_id=owner_user_id,
        )
        byte_size_from_metadata = int(payload.get("byte_size") or 0)
        byte_size = byte_size_from_metadata if byte_size_from_metadata > 0 else int(storage_path.stat().st_size)
        filename = _trim(payload.get("filename")) or "asset.bin"
        mime_type = _trim(payload.get("mime_type")) or None
        kind = _trim(payload.get("kind")) or _guess_kind(filename)
        uploaded_at = _parse_iso_datetime(payload.get("uploaded_at")) or datetime.now(timezone.utc)

        if existing is None:
            restored = DataLibraryAsset(
                id=metadata_asset_id,
                owner_user_id=owner_user_id,
                project_id=project_id,
                shared_with_user_ids=shared_with_user_ids,
                filename=filename,
                kind=kind,
                mime_type=mime_type,
                byte_size=byte_size,
                storage_path=str(storage_path),
                uploaded_at=uploaded_at,
            )
            session.add(restored)
            session.flush()
            _sync_asset_metadata_for_row(
                session=session,
                asset=restored,
                primary_root=primary_root,
            )
            restored_any = True
            continue

        changed = False
        existing_storage_path = _trim(existing.storage_path)
        resolved_storage_path = str(storage_path)
        if existing_storage_path != resolved_storage_path:
            existing.storage_path = resolved_storage_path
            changed = True
        if _trim(existing.filename) == "" and filename:
            existing.filename = filename
            changed = True
        if _trim(existing.kind) == "" and kind:
            existing.kind = kind
            changed = True
        if _trim(existing.mime_type) == "" and mime_type:
            existing.mime_type = mime_type
            changed = True
        if int(existing.byte_size or 0) <= 0 and byte_size > 0:
            existing.byte_size = byte_size
            changed = True
        if existing.project_id is None and project_id is not None:
            existing.project_id = project_id
            changed = True
        existing_owner_user_id = _trim(existing.owner_user_id)
        if owner_user_id and existing_owner_user_id != owner_user_id:
            if not existing_owner_user_id or session.get(User, existing_owner_user_id) is None:
                existing.owner_user_id = owner_user_id
                changed = True
        if (
            not _asset_shared_user_ids(existing)
            and shared_with_user_ids
            and bool(existing.owner_user_id)
        ):
            existing.shared_with_user_ids = shared_with_user_ids
            changed = True
        if changed:
            session.flush()
            restored_any = True
        _sync_asset_metadata_for_row(
            session=session,
            asset=existing,
            primary_root=primary_root,
        )
    return restored_any


def _slugify_filename(value: str) -> str:
    candidate = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip(".-")
    return candidate or "asset"


def _guess_kind(filename: str) -> str:
    lowered = filename.lower()
    if lowered.endswith(".pdf"):
        return "pdf"
    if lowered.endswith(".csv"):
        return "csv"
    if lowered.endswith(".tsv"):
        return "tsv"
    if lowered.endswith(".xlsx"):
        return "xlsx"
    if lowered.endswith(".txt"):
        return "txt"
    return "unknown"


def upload_library_assets(
    *,
    files: list[tuple[str, str | None, bytes]],
    project_id: str | None = None,
    user_id: str | None = None,
) -> list[str]:
    create_all_tables()
    if not files:
        raise PlannerValidationError("At least one file is required for upload.")
    asset_ids: list[str] = []
    storage_root = _storage_root()
    with session_scope() as session:
        clean_project_id = _normalize_optional_id(project_id)
        clean_user_id = _trim(user_id) or None
        if not clean_user_id:
            raise PlannerValidationError("Session token is required.")
        default_shared_with_ids: list[str] | None = []
        if clean_project_id:
            project = _resolve_project_for_user(
                session=session, project_id=clean_project_id, user_id=clean_user_id
            )
            default_shared_with_ids = _normalize_user_ids(project.collaborator_user_ids)
        for raw_filename, mime_type, content in files:
            filename = _slugify_filename(raw_filename)
            asset = DataLibraryAsset(
                owner_user_id=clean_user_id,
                project_id=clean_project_id,
                shared_with_user_ids=list(default_shared_with_ids or []),
                filename=filename,
                kind=_guess_kind(filename),
                mime_type=(mime_type or "").strip() or None,
                byte_size=len(content),
                storage_path="",
            )
            session.add(asset)
            session.flush()
            extension = Path(filename).suffix or ".bin"
            path = storage_root / f"{asset.id}{extension}"
            tmp_path = path.with_suffix(f"{path.suffix}.tmp")
            tmp_path.write_bytes(content)
            os.replace(tmp_path, path)
            asset.storage_path = str(path.resolve())
            session.flush()
            _sync_asset_metadata_for_row(
                session=session,
                asset=asset,
                primary_root=storage_root,
            )
            asset_ids.append(asset.id)
    return asset_ids


def list_library_assets(
    *,
    project_id: str | None = None,
    user_id: str | None = None,
    query: str | None = None,
    ownership: Literal["all", "owned", "shared"] = "all",
    page: int = 1,
    page_size: int = 50,
    sort_by: Literal[
        "uploaded_at", "filename", "byte_size", "kind", "owner_name"
    ] = "uploaded_at",
    sort_direction: Literal["asc", "desc"] = "desc",
) -> dict[str, object]:
    create_all_tables()
    clean_ownership = _trim(ownership).lower() or "all"
    if clean_ownership not in {"all", "owned", "shared"}:
        raise PlannerValidationError("ownership must be all, owned, or shared.")
    clean_sort_by = _trim(sort_by).lower() or "uploaded_at"
    if clean_sort_by not in {
        "uploaded_at",
        "filename",
        "byte_size",
        "kind",
        "owner_name",
    }:
        raise PlannerValidationError(
            "sort_by must be uploaded_at, filename, byte_size, kind, or owner_name."
        )
    clean_sort_direction = _trim(sort_direction).lower() or "desc"
    if clean_sort_direction not in {"asc", "desc"}:
        raise PlannerValidationError("sort_direction must be asc or desc.")
    clean_page = max(1, int(page or 1))
    clean_page_size = max(1, min(int(page_size or 50), 200))
    clean_query = _trim(query).lower()

    with session_scope() as session:
        clean_user_id = _trim(user_id) or None
        if not clean_user_id:
            return {
                "items": [],
                "page": clean_page,
                "page_size": clean_page_size,
                "total": 0,
                "has_more": False,
                "sort_by": clean_sort_by,
                "sort_direction": clean_sort_direction,
                "query": clean_query,
                "ownership": clean_ownership,
            }
        clean_project_id = _normalize_optional_id(project_id)
        storage_root = _storage_root()
        _restore_asset_row_from_metadata(
            session=session,
            primary_root=storage_root,
        )
        query = select(DataLibraryAsset).order_by(DataLibraryAsset.uploaded_at.desc())
        if clean_project_id:
            _resolve_project_for_user(
                session=session, project_id=clean_project_id, user_id=clean_user_id
            )
            query = query.where(DataLibraryAsset.project_id == clean_project_id)
        rows = session.scalars(query).all()
        for row in rows:
            resolved_storage_path = _resolve_existing_asset_path(row, storage_root)
            if resolved_storage_path is None:
                continue
            resolved_storage_str = str(resolved_storage_path)
            if _trim(row.storage_path) != resolved_storage_str:
                row.storage_path = resolved_storage_str
            _sync_asset_metadata_for_row(
                session=session,
                asset=row,
                primary_root=storage_root,
            )
        session.flush()
        accessible_rows = [
            row
            for row in rows
            if _asset_accessible_for_user(session=session, asset=row, user_id=clean_user_id)
            and _asset_storage_exists(row, storage_root)
        ]
        payload_items = [
            _serialize_library_asset(
                session=session,
                asset=row,
                requesting_user_id=clean_user_id,
            )
            for row in accessible_rows
        ]

        if clean_ownership == "owned":
            payload_items = [
                item for item in payload_items if bool(item.get("can_manage_access"))
            ]
        elif clean_ownership == "shared":
            payload_items = [
                item for item in payload_items if not bool(item.get("can_manage_access"))
            ]

        if clean_query:
            def _matches(item: dict[str, object]) -> bool:
                shared_with = item.get("shared_with")
                shared_names = ""
                if isinstance(shared_with, list):
                    shared_names = " ".join(
                        _trim(entry.get("name")) if isinstance(entry, dict) else ""
                        for entry in shared_with
                    )
                haystack = " ".join(
                    [
                        _trim(item.get("filename")),
                        _trim(item.get("kind")),
                        _trim(item.get("mime_type")),
                        _trim(item.get("owner_name")),
                        shared_names,
                    ]
                ).lower()
                return clean_query in haystack

            payload_items = [item for item in payload_items if _matches(item)]

        reverse = clean_sort_direction == "desc"

        def _sort_key(item: dict[str, object]):
            if clean_sort_by == "filename":
                return _trim(item.get("filename")).lower()
            if clean_sort_by == "byte_size":
                return int(item.get("byte_size") or 0)
            if clean_sort_by == "kind":
                return _trim(item.get("kind")).lower()
            if clean_sort_by == "owner_name":
                return _trim(item.get("owner_name")).lower()
            uploaded_at = item.get("uploaded_at")
            if isinstance(uploaded_at, datetime):
                return uploaded_at
            if isinstance(uploaded_at, str):
                try:
                    return datetime.fromisoformat(uploaded_at.replace("Z", "+00:00"))
                except ValueError:
                    return datetime.fromtimestamp(0)
            return datetime.fromtimestamp(0)

        payload_items = sorted(payload_items, key=_sort_key, reverse=reverse)
        total = len(payload_items)
        start_index = (clean_page - 1) * clean_page_size
        end_index = start_index + clean_page_size
        paged_items = payload_items[start_index:end_index]

        return {
            "items": paged_items,
            "page": clean_page,
            "page_size": clean_page_size,
            "total": total,
            "has_more": end_index < total,
            "sort_by": clean_sort_by,
            "sort_direction": clean_sort_direction,
            "query": clean_query,
            "ownership": clean_ownership,
        }


def update_library_asset_access(
    *,
    asset_id: str,
    user_id: str,
    collaborator_user_ids: list[str] | None = None,
    collaborator_names: list[str] | None = None,
) -> dict[str, object]:
    create_all_tables()
    clean_asset_id = _trim(asset_id)
    clean_user_id = _trim(user_id)
    if not clean_asset_id:
        raise PlannerValidationError("asset_id is required.")
    if not clean_user_id:
        raise PlannerValidationError("Session token is required.")

    with session_scope() as session:
        storage_root = _storage_root()
        asset = session.get(DataLibraryAsset, clean_asset_id)
        if asset is None:
            _restore_asset_row_from_metadata(
                session=session,
                primary_root=storage_root,
                asset_id=clean_asset_id,
            )
            asset = session.get(DataLibraryAsset, clean_asset_id)
        if asset is None:
            raise DataAssetNotFoundError(f"Data asset '{clean_asset_id}' was not found.")
        if _trim(asset.owner_user_id) != clean_user_id:
            raise PlannerValidationError("Only the asset owner can manage file access.")

        requested_ids = _normalize_user_ids(collaborator_user_ids or [])
        resolved_name_ids = _resolve_user_ids_by_names(
            session=session,
            names=collaborator_names or [],
            exclude_user_id=clean_user_id,
        )
        merged_ids = _normalize_user_ids([*requested_ids, *resolved_name_ids])
        merged_ids = [item for item in merged_ids if item != clean_user_id]

        clean_project_id = _trim(asset.project_id)
        if clean_project_id:
            project = session.get(Project, clean_project_id)
            if project is not None:
                project_collaborator_ids = set(
                    _normalize_user_ids(project.collaborator_user_ids)
                )
                disallowed = [
                    collaborator_id
                    for collaborator_id in merged_ids
                    if collaborator_id not in project_collaborator_ids
                ]
                if disallowed:
                    raise PlannerValidationError(
                        "Access can only be granted to workspace collaborators."
                    )

        asset.shared_with_user_ids = merged_ids
        session.flush()
        _sync_asset_metadata_for_row(
            session=session,
            asset=asset,
            primary_root=storage_root,
        )
        return _serialize_library_asset(
            session=session,
            asset=asset,
            requesting_user_id=clean_user_id,
        )


def download_library_asset(
    *, asset_id: str, user_id: str
) -> dict[str, object]:
    create_all_tables()
    clean_asset_id = _trim(asset_id)
    clean_user_id = _trim(user_id)
    if not clean_asset_id:
        raise PlannerValidationError("asset_id is required.")
    if not clean_user_id:
        raise PlannerValidationError("Session token is required.")

    with session_scope() as session:
        storage_root = _storage_root()
        asset = session.get(DataLibraryAsset, clean_asset_id)
        if asset is None:
            _restore_asset_row_from_metadata(
                session=session,
                primary_root=storage_root,
                asset_id=clean_asset_id,
            )
            asset = session.get(DataLibraryAsset, clean_asset_id)
        if asset is None:
            raise DataAssetNotFoundError(f"Data asset '{clean_asset_id}' was not found.")
        if not _asset_accessible_for_user(
            session=session, asset=asset, user_id=clean_user_id
        ):
            raise DataAssetNotFoundError(f"Data asset '{clean_asset_id}' was not found.")

        storage_path = _resolve_existing_asset_path(asset, storage_root)
        if storage_path is None:
            raise DataAssetNotFoundError(f"Data asset '{clean_asset_id}' was not found.")
        resolved_storage_str = str(storage_path)
        if _trim(asset.storage_path) != resolved_storage_str:
            asset.storage_path = resolved_storage_str
            session.flush()
        _sync_asset_metadata_for_row(
            session=session,
            asset=asset,
            primary_root=storage_root,
        )

        file_name = _trim(asset.filename) or "asset.bin"
        content = storage_path.read_bytes()
        media_type = _trim(asset.mime_type)
        if not media_type:
            guessed, _ = mimetypes.guess_type(file_name)
            media_type = guessed or "application/octet-stream"
        return {
            "id": asset.id,
            "file_name": file_name,
            "content_type": media_type,
            "content": content,
        }


def attach_assets_to_manuscript(
    *,
    manuscript_id: str,
    asset_ids: list[str],
    section_context: str,
    user_id: str | None = None,
) -> list[str]:
    create_all_tables()
    context = section_context.strip().upper()
    clean_ids = [item.strip() for item in asset_ids if item.strip()]
    if context not in SECTION_CONTEXTS:
        raise PlannerValidationError(
            "section_context must be RESULTS, TABLES, FIGURES, or PLANNER."
        )
    if not clean_ids:
        raise PlannerValidationError("asset_ids must contain at least one id.")

    with session_scope() as session:
        clean_user_id = _trim(user_id) or None
        manuscript = _resolve_manuscript_for_user(
            session=session, manuscript_id=manuscript_id, user_id=clean_user_id
        )
        found = session.scalars(
            select(DataLibraryAsset).where(DataLibraryAsset.id.in_(clean_ids))
        ).all()
        found = [
            row
            for row in found
            if _asset_accessible_for_user(
                session=session, asset=row, user_id=clean_user_id
            )
        ]
        found_ids = {row.id for row in found}
        missing = [item for item in clean_ids if item not in found_ids]
        if missing:
            raise DataAssetNotFoundError(
                f"Data assets not found: {', '.join(missing)}."
            )

        for asset_id in clean_ids:
            existing = session.scalars(
                select(ManuscriptAssetLink).where(
                    ManuscriptAssetLink.manuscript_id == manuscript_id,
                    ManuscriptAssetLink.asset_id == asset_id,
                    ManuscriptAssetLink.section_context == context,
                )
            ).first()
            if existing is None:
                session.add(
                    ManuscriptAssetLink(
                        manuscript_id=manuscript_id,
                        asset_id=asset_id,
                        section_context=context,
                    )
                )
        return clean_ids


def _decode_sample(content: bytes, max_chars: int) -> str:
    chunk = content[: max(0, max_chars)]
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return chunk.decode(encoding, errors="ignore")
        except Exception:
            continue
    return chunk.decode("utf-8", errors="ignore")


def _parse_csv_like(
    text: str, delimiter: str, max_rows: int
) -> tuple[list[str], list[dict[str, str]], list[str]]:
    warnings: list[str] = []
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    if not rows:
        return [], [], ["No rows detected in sampled content."]
    header = [item.strip() for item in rows[0]]
    if not any(header):
        header = [f"column_{idx + 1}" for idx in range(len(rows[0]))]
        warnings.append("Header row was empty; synthetic column names were assigned.")
    preview: list[dict[str, str]] = []
    for row in rows[1 : max_rows + 1]:
        preview.append(
            {
                header[idx]: (str(row[idx]).strip() if idx < len(row) else "")
                for idx in range(len(header))
            }
        )
    return header, preview, warnings


def _role_guesses(columns: list[str]) -> dict[str, list[str]]:
    tokens = [item.lower() for item in columns]

    def _match(words: tuple[str, ...]) -> list[str]:
        return [token for token in tokens if any(word in token for word in words)]

    return {
        "outcomes": _match(
            (
                "outcome",
                "event",
                "death",
                "mortality",
                "survival",
                "readmission",
                "time_to",
            )
        ),
        "exposures": _match(("exposure", "treatment", "drug", "group", "intervention")),
        "covariates": _match(
            ("age", "sex", "bmi", "covariate", "comorbidity", "pressure", "rate")
        ),
        "identifiers": _match(("id", "patient", "subject", "mrn")),
        "time_variables": _match(("time", "visit", "follow", "month", "week", "day")),
    }


def create_data_profile(
    *,
    asset_ids: list[str],
    sampling: dict[str, int] | None = None,
    user_id: str | None = None,
) -> dict[str, object]:
    create_all_tables()
    ids = [item.strip() for item in asset_ids if item.strip()]
    if not ids:
        raise PlannerValidationError("asset_ids must contain at least one value.")
    max_rows = max(20, min(int((sampling or {}).get("max_rows", 200)), 1000))
    max_chars = max(1000, min(int((sampling or {}).get("max_chars", 20000)), 200000))

    with session_scope() as session:
        clean_user_id = _trim(user_id) or None
        assets = session.scalars(
            select(DataLibraryAsset).where(DataLibraryAsset.id.in_(ids))
        ).all()
        if clean_user_id:
            assets = [
                row
                for row in assets
                if _asset_accessible_for_user(
                    session=session, asset=row, user_id=clean_user_id
                )
            ]
        found_ids = {row.id for row in assets}
        missing = [item for item in ids if item not in found_ids]
        if missing:
            raise DataAssetNotFoundError(
                f"Data assets not found: {', '.join(missing)}."
            )

        all_columns: list[str] = []
        warnings: list[str] = []
        rows_sampled = 0
        previews: list[dict[str, object]] = []
        storage_root = _storage_root()

        for asset in assets:
            storage_path = _resolve_existing_asset_path(asset, storage_root)
            if storage_path is None:
                raise DataAssetNotFoundError(
                    f"Data asset '{asset.id}' was not found."
                )
            resolved_storage_str = str(storage_path)
            if _trim(asset.storage_path) != resolved_storage_str:
                asset.storage_path = resolved_storage_str
                session.flush()
            content = storage_path.read_bytes()
            sample = _decode_sample(content, max_chars=max_chars)
            if asset.kind in {"csv", "tsv", "txt"}:
                delimiter = "\t" if asset.kind == "tsv" else ","
                columns, preview_rows, parser_warnings = _parse_csv_like(
                    sample, delimiter, max_rows
                )
                all_columns.extend(columns)
                rows_sampled += len(preview_rows)
                warnings.extend(parser_warnings)
                previews.append(
                    {
                        "asset_id": asset.id,
                        "filename": asset.filename,
                        "columns": columns,
                        "sample_rows": preview_rows[:3],
                    }
                )
            else:
                warnings.append(
                    f"Asset '{asset.filename}' is {asset.kind.upper()}; variable parsing is limited."
                )
                previews.append(
                    {
                        "asset_id": asset.id,
                        "filename": asset.filename,
                        "columns": [],
                        "sample_rows": [],
                    }
                )

        deduped_columns = list(
            dict.fromkeys([col for col in all_columns if col.strip()])
        )
        roles = _role_guesses(deduped_columns)
        hints: list[str] = []
        if roles["time_variables"] and roles["identifiers"]:
            hints.append("Possible repeated-measures or longitudinal structure.")
        if any("survival" in item or "time_to" in item for item in roles["outcomes"]):
            hints.append("Potential time-to-event outcome framing.")
        if any(
            "sensitivity" in item or "specificity" in item
            for item in [col.lower() for col in deduped_columns]
        ):
            hints.append("Potential diagnostic-accuracy framing.")
        if not hints:
            hints.append(
                "Likely observational tabular dataset; confirm design explicitly."
            )

        unresolved: list[str] = []
        if any("time-to-event" in hint.lower() for hint in hints):
            unresolved.append(
                "Should time-to-event modelling (Kaplan-Meier/Cox) be the primary analysis?"
            )
        if roles["time_variables"] and roles["identifiers"]:
            unresolved.append(
                "Are repeated measurements expected per participant and therefore mixed-effects modelling required?"
            )
        if any("diagnostic" in hint.lower() for hint in hints):
            unresolved.append(
                "Is there a validated reference standard for diagnostic performance evaluation?"
            )
        if not roles["outcomes"]:
            unresolved.append(
                "Which variable should be treated as the primary outcome?"
            )
        if not roles["exposures"]:
            unresolved.append(
                "Which variable(s) should be treated as primary exposure(s)?"
            )

        uncertainty: list[str] = []
        if any(asset.kind in {"xlsx", "unknown"} for asset in assets):
            uncertainty.append(
                "Non-CSV assets were profiled with limited variable extraction; verify mappings manually."
            )

        profile_json: dict[str, object] = {
            "dataset_kind": "mixed"
            if len({asset.kind for asset in assets}) > 1
            else (assets[0].kind if assets else "unknown"),
            "likely_design_hints": hints,
            "variable_role_guesses": roles,
            "sample_size_signals": {
                "assets_count": len(assets),
                "rows_sampled": rows_sampled,
                "columns_detected": len(deduped_columns),
            },
            "warnings": list(dict.fromkeys(warnings)),
            "uncertainty": uncertainty,
            "unresolved_questions": unresolved,
            "preview": previews,
        }
        human_summary = f"Profiled {len(assets)} asset(s); sampled {rows_sampled} row(s), detected {len(deduped_columns)} column(s)."

        profile = DataProfile(
            owner_user_id=clean_user_id,
            asset_ids=ids,
            data_profile_json=profile_json,
            human_summary=human_summary,
        )
        session.add(profile)
        session.flush()
        return {
            "profile_id": profile.id,
            "data_profile_json": profile_json,
            "human_summary": human_summary,
        }


def _confirmed_fields(fields: dict[str, Any] | None) -> dict[str, str]:
    payload = dict(fields or {})
    return {
        "design": str(payload.get("design", "")).strip(),
        "unit_of_analysis": str(payload.get("unit_of_analysis", "")).strip(),
        "primary_outcome": str(payload.get("primary_outcome", "")).strip(),
        "key_exposures": str(payload.get("key_exposures", "")).strip(),
        "key_covariates": str(payload.get("key_covariates", "")).strip(),
    }


def _load_profile_json(
    profile_id: str | None, *, user_id: str | None = None
) -> dict[str, Any]:
    if not (profile_id or "").strip():
        return {}
    with session_scope() as session:
        profile = session.get(DataProfile, profile_id)
        if profile is None:
            raise DataAssetNotFoundError(f"Data profile '{profile_id}' was not found.")
        clean_user_id = _trim(user_id) or None
        if clean_user_id and not _trim(profile.owner_user_id):
            pass
        elif clean_user_id and _trim(profile.owner_user_id) != clean_user_id:
            asset_ids = _normalize_user_ids(profile.asset_ids)
            if asset_ids:
                assets = session.scalars(
                    select(DataLibraryAsset).where(DataLibraryAsset.id.in_(asset_ids))
                ).all()
                inaccessible = [
                    row
                    for row in assets
                    if not _asset_accessible_for_user(
                        session=session, asset=row, user_id=clean_user_id
                    )
                ]
                if inaccessible:
                    raise DataAssetNotFoundError(
                        f"Data profile '{profile_id}' was not found."
                    )
        return dict(profile.data_profile_json or {})


def _create_artifact(
    *,
    manuscript_id: str,
    profile_id: str | None,
    artifact_type: str,
    scaffold_json: dict[str, Any],
    human_summary: str,
    user_id: str | None = None,
) -> dict[str, object]:
    create_all_tables()
    with session_scope() as session:
        _resolve_manuscript_for_user(
            session=session, manuscript_id=manuscript_id, user_id=user_id
        )
        artifact = PlannerArtifact(
            manuscript_id=manuscript_id,
            profile_id=profile_id or None,
            artifact_type=artifact_type,
            scaffold_json=scaffold_json,
            human_summary=human_summary,
        )
        session.add(artifact)
        session.flush()
        return {
            f"{artifact_type}_scaffold_id": artifact.id,
            f"{artifact_type}_scaffold_json": scaffold_json,
            "human_summary": human_summary,
        }


def create_analysis_scaffold(
    *,
    manuscript_id: str,
    profile_id: str | None,
    confirmed_fields: dict[str, Any] | None,
    user_id: str | None = None,
) -> dict[str, object]:
    fields = _confirmed_fields(confirmed_fields)
    profile_json = _load_profile_json(profile_id, user_id=user_id)
    roles = dict(profile_json.get("variable_role_guesses", {}) or {})
    outcome = (
        fields["primary_outcome"]
        or ", ".join(roles.get("outcomes", [])[:1])
        or "Primary outcome to confirm"
    )
    exposure = (
        fields["key_exposures"]
        or ", ".join(roles.get("exposures", [])[:2])
        or "Primary exposure to confirm"
    )
    covariates = (
        fields["key_covariates"]
        or ", ".join(roles.get("covariates", [])[:4])
        or "Covariates to confirm"
    )
    scaffold_json = {
        "methods_analytic_approach": [
            {
                "analysis_name": "Primary analysis",
                "model_family": "Generalised linear model",
                "outcome": outcome,
                "exposure": exposure,
                "covariates": covariates,
                "assumptions": "Model assumptions will be checked and reported.",
                "qc": "Methods/Results consistency checks.",
                "missing_data": "Specify complete-case vs imputation strategy.",
            }
        ],
        "results_narrative_outline": [
            {
                "subheading": "Primary findings",
                "what_goes_here": "Report primary estimate with uncertainty.",
            },
            {
                "subheading": "Sensitivity analyses",
                "what_goes_here": "Report robustness checks and key divergences.",
            },
        ],
        "unresolved_questions": list(
            profile_json.get("unresolved_questions", []) or []
        ),
    }
    return _create_artifact(
        manuscript_id=manuscript_id,
        profile_id=profile_id,
        artifact_type="analysis",
        scaffold_json=scaffold_json,
        human_summary="Analysis scaffold generated.",
        user_id=user_id,
    )


def create_tables_scaffold(
    *,
    manuscript_id: str,
    profile_id: str | None,
    confirmed_fields: dict[str, Any] | None,
    user_id: str | None = None,
) -> dict[str, object]:
    profile_json = _load_profile_json(profile_id, user_id=user_id)
    unresolved = list(profile_json.get("unresolved_questions", []) or [])
    scaffold_json = {
        "proposed_tables": [
            {
                "table_id": "T1",
                "title": "Table 1. Baseline characteristics",
                "purpose": "Describe cohort composition.",
                "columns": ["Variable", "Overall", "Group A", "Group B"],
                "footnotes": ["Define abbreviations and denominators."],
                "unresolved_inputs": unresolved[:2],
            },
            {
                "table_id": "T2",
                "title": "Table 2. Primary analysis results",
                "purpose": "Report primary estimate and uncertainty.",
                "columns": ["Outcome", "Estimate", "Uncertainty", "Adjusted model"],
                "footnotes": ["State covariates and model family."],
                "unresolved_inputs": unresolved[2:4],
            },
            {
                "table_id": "T3",
                "title": "Table 3. Sensitivity analyses",
                "purpose": "Summarise robustness checks.",
                "columns": ["Analysis", "Estimate", "Uncertainty", "Interpretation"],
                "footnotes": ["Pre-specify subgroup and sensitivity definitions."],
                "unresolved_inputs": unresolved[4:6],
            },
        ]
    }
    return _create_artifact(
        manuscript_id=manuscript_id,
        profile_id=profile_id,
        artifact_type="tables",
        scaffold_json=scaffold_json,
        human_summary="Tables scaffold generated.",
        user_id=user_id,
    )


def create_figures_scaffold(
    *,
    manuscript_id: str,
    profile_id: str | None,
    confirmed_fields: dict[str, Any] | None,
    user_id: str | None = None,
) -> dict[str, object]:
    profile_json = _load_profile_json(profile_id, user_id=user_id)
    unresolved = list(profile_json.get("unresolved_questions", []) or [])
    scaffold_json = {
        "proposed_figures": [
            {
                "figure_id": "F1",
                "title": "Figure 1. Cohort selection flow",
                "purpose": "Visualise eligibility and exclusions.",
                "figure_type": "Flow diagram",
                "caption_stub": "Flow of participants into final analytic set.",
                "inputs_needed": [
                    "Screened count",
                    "Excluded count by reason",
                    "Final sample",
                ],
                "unresolved_inputs": unresolved[:2],
            },
            {
                "figure_id": "F2",
                "title": "Figure 2. Primary outcome visual summary",
                "purpose": "Visualise primary outcome pattern.",
                "figure_type": "Forest/line/bar (confirm)",
                "caption_stub": "Primary outcome summary with uncertainty.",
                "inputs_needed": [
                    "Primary estimate",
                    "Uncertainty intervals",
                    "Group labels",
                ],
                "unresolved_inputs": unresolved[2:4],
            },
        ]
    }
    return _create_artifact(
        manuscript_id=manuscript_id,
        profile_id=profile_id,
        artifact_type="figures",
        scaffold_json=scaffold_json,
        human_summary="Figures scaffold generated.",
        user_id=user_id,
    )


def save_manuscript_plan(
    *, manuscript_id: str, plan_json: dict[str, Any], user_id: str | None = None
) -> dict[str, object]:
    create_all_tables()
    if not isinstance(plan_json.get("sections"), list):
        raise PlannerValidationError("plan_json.sections must be a list.")
    with session_scope() as session:
        _resolve_manuscript_for_user(
            session=session, manuscript_id=manuscript_id, user_id=user_id
        )
        existing = session.scalars(
            select(ManuscriptPlan).where(ManuscriptPlan.manuscript_id == manuscript_id)
        ).first()
        if existing is None:
            existing = ManuscriptPlan(manuscript_id=manuscript_id, plan_json=plan_json)
            session.add(existing)
        else:
            existing.plan_json = plan_json
        session.flush()
        return {
            "manuscript_id": manuscript_id,
            "plan_json": dict(existing.plan_json or {}),
            "updated_at": existing.updated_at,
        }


def improve_plan_section(
    *,
    manuscript_id: str,
    section_key: str,
    current_text: str,
    context: dict[str, Any] | None,
    tool: str,
    user_id: str | None = None,
) -> dict[str, object]:
    create_all_tables()
    with session_scope() as session:
        _resolve_manuscript_for_user(
            session=session, manuscript_id=manuscript_id, user_id=user_id
        )

    tool_name = tool.strip().lower()
    if tool_name not in TOOL_NAMES:
        raise PlannerValidationError(
            "tool must be one of improve, critique, alternatives, subheadings, link_to_data, checklist."
        )

    text = (
        re.sub(r"\s+", " ", current_text or "").strip()
        or f"Plan placeholder for {section_key}."
    )
    suggestions: list[str] = []
    to_confirm: list[str] = []
    updated_text = text

    if tool_name == "improve":
        updated_text = f"Plan: {text}\n\nAssumptions: This is a planning scaffold, not completed results.\n\nTo confirm: Confirm unresolved methods and data constraints before drafting."
    elif tool_name == "critique":
        if len(text.split()) < 20:
            suggestions.append(
                "Section plan is brief; add explicit scope and sequencing."
            )
        if section_key.upper() == "RESULTS" and "uncertainty" not in text.lower():
            suggestions.append(
                "Add explicit uncertainty language for primary findings."
            )
        if not suggestions:
            suggestions.append(
                "No major structural gaps detected; refine precision and order."
            )
    elif tool_name == "alternatives":
        suggestions = [
            f"Alternative A: {text}",
            f"Alternative B: {text}",
            f"Alternative C: {text}",
        ]
    elif tool_name == "subheadings":
        suggestions = (
            ["Clinical context", "Evidence gap", "Objective"]
            if section_key.upper() == "INTRODUCTION"
            else ["Design", "Analysis", "To confirm"]
        )
    elif tool_name == "link_to_data":
        profile_id = str((context or {}).get("profile_id", "")).strip()
        profile_json = (
            _load_profile_json(profile_id, user_id=user_id) if profile_id else {}
        )
        role_summary = (
            profile_json.get("variable_role_guesses", {})
            if isinstance(profile_json.get("variable_role_guesses", {}), dict)
            else {}
        )
        updated_text = f"{text}\n\nData link: outcomes={', '.join(role_summary.get('outcomes', [])[:2]) or 'to confirm'}; exposures={', '.join(role_summary.get('exposures', [])[:2]) or 'to confirm'}."
        to_confirm.extend(list(profile_json.get("unresolved_questions", []) or [])[:3])
    elif tool_name == "checklist":
        suggestions = [
            "STROBE prompt: specify participants, variables, bias handling, and statistical methods.",
            "Checklist prompt: define missing-data handling and sensitivity analyses.",
        ]

    return {
        "updated_text": updated_text,
        "suggestions": suggestions,
        "to_confirm": list(
            dict.fromkeys([item for item in to_confirm if str(item).strip()])
        ),
    }

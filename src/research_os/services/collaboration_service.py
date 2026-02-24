from __future__ import annotations

import csv
import logging
import os
import re
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from io import StringIO
from typing import Any
from uuid import uuid4

import httpx
from sqlalchemy import delete, func, or_, select

from research_os.db import (
    AppRuntimeLock,
    Author,
    Collaborator,
    CollaborationMetric,
    Manuscript,
    ManuscriptAffiliation,
    ManuscriptAuthor,
    MetricsSnapshot,
    User,
    Work,
    WorkAuthorship,
    create_all_tables,
    session_scope,
)

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except Exception:  # pragma: no cover
    BackgroundScheduler = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)

READY_STATUS = "READY"
RUNNING_STATUS = "RUNNING"
FAILED_STATUS = "FAILED"
STATUSES = {READY_STATUS, RUNNING_STATUS, FAILED_STATUS}

CLASSIFICATION_CORE = "CORE"
CLASSIFICATION_ACTIVE = "ACTIVE"
CLASSIFICATION_OCCASIONAL = "OCCASIONAL"
CLASSIFICATION_HISTORIC = "HISTORIC"
CLASSIFICATION_UNCLASSIFIED = "UNCLASSIFIED"
CLASSIFICATIONS = {
    CLASSIFICATION_CORE,
    CLASSIFICATION_ACTIVE,
    CLASSIFICATION_OCCASIONAL,
    CLASSIFICATION_HISTORIC,
    CLASSIFICATION_UNCLASSIFIED,
}

FORMULA_VERSION = "collab_strength_v1"
SCHEDULER_LOCK_NAME = "collaboration_metrics_scheduler"
RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
_INSTANCE_ID = f"collab-{uuid4().hex[:12]}"
_ORCID_RE = re.compile(r"^\d{4}-\d{4}-\d{4}-[\dX]{4}$")

_executor_lock = threading.Lock()
_executor: ThreadPoolExecutor | None = None
_scheduler_lock = threading.Lock()
_scheduler: Any = None


class CollaborationValidationError(RuntimeError):
    pass


class CollaborationNotFoundError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime | None) -> datetime:
    if not isinstance(value, datetime):
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _coerce_utc_or_none(value: datetime | None) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    return _coerce_utc(value)


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        try:
            return int(value.strip())
        except Exception:
            return None
    return None


def _safe_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return None
    return None


def _normalize_status(value: str | None) -> str:
    clean = str(value or "").strip().upper()
    if clean in STATUSES:
        return clean
    return READY_STATUS


def _normalize_classification(value: str | None) -> str:
    clean = str(value or "").strip().upper()
    if clean in CLASSIFICATIONS:
        return clean
    return CLASSIFICATION_UNCLASSIFIED


def _ttl_seconds() -> int:
    value = _safe_int(os.getenv("COLLAB_ANALYTICS_TTL_SECONDS", "86400"))
    return max(900, value if value is not None else 86400)


def _schedule_hours() -> int:
    value = _safe_int(os.getenv("COLLAB_ANALYTICS_SCHEDULE_HOURS", "24"))
    return max(1, value if value is not None else 24)


def _max_concurrent_jobs() -> int:
    value = _safe_int(os.getenv("COLLAB_ANALYTICS_MAX_CONCURRENT_JOBS", "2"))
    return max(1, value if value is not None else 2)


def _failure_backoff_seconds(failures_in_row: int) -> int:
    if failures_in_row <= 1:
        return 60 * 60
    if failures_in_row == 2:
        return 3 * 60 * 60
    if failures_in_row == 3:
        return 12 * 60 * 60
    return 24 * 60 * 60


def _openalex_timeout_seconds() -> float:
    value = _safe_float(os.getenv("COLLAB_OPENALEX_TIMEOUT_SECONDS", "12"))
    return max(5.0, value if value is not None else 12.0)


def _openalex_retry_count() -> int:
    value = _safe_int(os.getenv("COLLAB_OPENALEX_RETRY_COUNT", "2"))
    return max(0, min(6, value if value is not None else 2))


def _openalex_max_pages() -> int:
    value = _safe_int(os.getenv("COLLAB_OPENALEX_IMPORT_MAX_PAGES", "5"))
    return max(1, min(20, value if value is not None else 5))


def _normalize_orcid_id(orcid_id: str | None) -> str:
    clean = str(orcid_id or "").strip()
    if clean.startswith("https://orcid.org/"):
        clean = clean.removeprefix("https://orcid.org/")
    if clean.startswith("http://orcid.org/"):
        clean = clean.removeprefix("http://orcid.org/")
    return clean.strip().strip("/")


def _orcid_checksum_valid(orcid_id: str) -> bool:
    digits = orcid_id.replace("-", "")
    if len(digits) != 16:
        return False
    if not re.fullmatch(r"\d{15}[\dX]", digits):
        return False
    total = 0
    for char in digits[:15]:
        total = (total + int(char)) * 2
    remainder = total % 11
    result = (12 - remainder) % 11
    checksum = "X" if result == 10 else str(result)
    return checksum == digits[-1]


def validate_orcid_id(orcid_id: str | None) -> str | None:
    clean = _normalize_orcid_id(orcid_id)
    if not clean:
        return None
    if not _ORCID_RE.fullmatch(clean):
        raise CollaborationValidationError(
            "ORCID must match ####-####-####-#### (last character may be X)."
        )
    if not _orcid_checksum_valid(clean):
        raise CollaborationValidationError("ORCID checksum is invalid.")
    return clean


def _safe_validate_orcid(orcid_id: str | None) -> str | None:
    try:
        return validate_orcid_id(orcid_id)
    except CollaborationValidationError:
        return None


def _normalize_name(value: str) -> str:
    clean = re.sub(r"\s+", " ", str(value or "").strip())
    if len(clean) < 2:
        raise CollaborationValidationError("full_name is required.")
    if len(clean) > 255:
        raise CollaborationValidationError("full_name must be 255 characters or fewer.")
    return clean


def _normalize_name_lower(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _normalize_email(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    if len(clean) > 320:
        raise CollaborationValidationError("email must be 320 characters or fewer.")
    if "@" not in clean:
        raise CollaborationValidationError("email must be valid if provided.")
    return clean


def _normalize_domains(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    domains: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = re.sub(r"\s+", " ", str(item or "").strip())
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        domains.append(text[:64])
    return domains[:20]


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise CollaborationNotFoundError(f"User '{user_id}' was not found.")
    return user


def _resolve_collaborator_or_raise(session, *, user_id: str, collaborator_id: str) -> Collaborator:
    collaborator = session.scalars(
        select(Collaborator).where(
            Collaborator.id == collaborator_id,
            Collaborator.owner_user_id == user_id,
        )
    ).first()
    if collaborator is None:
        raise CollaborationNotFoundError(
            f"Collaborator '{collaborator_id}' was not found."
        )
    return collaborator


def _metric_by_collaborator(session, *, user_id: str, collaborator_ids: list[str]) -> dict[str, CollaborationMetric]:
    if not collaborator_ids:
        return {}
    rows = session.scalars(
        select(CollaborationMetric).where(
            CollaborationMetric.owner_user_id == user_id,
            CollaborationMetric.collaborator_id.in_(collaborator_ids),
        )
    ).all()
    return {str(row.collaborator_id): row for row in rows}


def _serialize_metric(row: CollaborationMetric | None) -> dict[str, Any]:
    if row is None:
        return {
            "coauthored_works_count": 0,
            "shared_citations_total": 0,
            "first_collaboration_year": None,
            "last_collaboration_year": None,
            "citations_last_12m": 0,
            "collaboration_strength_score": 0.0,
            "classification": CLASSIFICATION_UNCLASSIFIED,
            "computed_at": None,
            "status": READY_STATUS,
        }
    return {
        "coauthored_works_count": int(row.coauthored_works_count or 0),
        "shared_citations_total": int(row.shared_citations_total or 0),
        "first_collaboration_year": row.first_collaboration_year,
        "last_collaboration_year": row.last_collaboration_year,
        "citations_last_12m": int(row.citations_last_12m or 0),
        "collaboration_strength_score": float(row.collaboration_strength_score or 0.0),
        "classification": _normalize_classification(row.classification),
        "computed_at": _coerce_utc_or_none(row.computed_at),
        "status": _normalize_status(row.status),
    }


def _serialize_collaborator(
    collaborator: Collaborator,
    *,
    metric: CollaborationMetric | None,
    duplicate_warnings: list[str] | None = None,
) -> dict[str, Any]:
    metric_payload = _serialize_metric(metric)
    return {
        "id": str(collaborator.id),
        "owner_user_id": str(collaborator.owner_user_id),
        "full_name": collaborator.full_name,
        "preferred_name": collaborator.preferred_name,
        "email": collaborator.email,
        "orcid_id": collaborator.orcid_id,
        "openalex_author_id": collaborator.openalex_author_id,
        "primary_institution": collaborator.primary_institution,
        "department": collaborator.department,
        "country": collaborator.country,
        "current_position": collaborator.current_position,
        "research_domains": list(collaborator.research_domains or []),
        "notes": collaborator.notes,
        "created_at": _coerce_utc(collaborator.created_at),
        "updated_at": _coerce_utc(collaborator.updated_at),
        "metrics": metric_payload,
        "duplicate_warnings": list(duplicate_warnings or []),
    }


def _affiliation_similarity(a: str | None, b: str | None) -> float:
    left = _normalize_name_lower(a or "")
    right = _normalize_name_lower(b or "")
    if not left or not right:
        return 0.0
    return SequenceMatcher(None, left, right).ratio()


def _name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize_name_lower(a), _normalize_name_lower(b)).ratio()


def _find_duplicate_warnings(
    session,
    *,
    user_id: str,
    full_name: str,
    orcid_id: str | None,
    primary_institution: str | None,
    exclude_collaborator_id: str | None = None,
) -> list[str]:
    rows = session.scalars(
        select(Collaborator).where(Collaborator.owner_user_id == user_id)
    ).all()
    warnings: list[str] = []
    for row in rows:
        if exclude_collaborator_id and str(row.id) == str(exclude_collaborator_id):
            continue
        if orcid_id and row.orcid_id and _normalize_orcid_id(row.orcid_id) == orcid_id:
            warnings.append(
                f"Potential duplicate: ORCID already exists on collaborator '{row.full_name}'."
            )
            continue
        if not row.full_name:
            continue
        name_ratio = _name_similarity(full_name, row.full_name)
        if name_ratio < 0.9:
            continue
        inst_ratio = _affiliation_similarity(primary_institution, row.primary_institution)
        if inst_ratio >= 0.82:
            warnings.append(
                (
                    "Potential duplicate: name and institution are very similar to "
                    f"'{row.full_name}'."
                )
            )
    return warnings[:3]


def _collab_sort_key(item: dict[str, Any], sort: str) -> tuple:
    metrics = item.get("metrics") if isinstance(item.get("metrics"), dict) else {}
    normalized = (sort or "name").strip().lower()
    if normalized in {"coauthored", "coauthored_works", "works"}:
        return (-int(metrics.get("coauthored_works_count") or 0), item["full_name"].lower())
    if normalized in {"strength", "score"}:
        return (-float(metrics.get("collaboration_strength_score") or 0.0), item["full_name"].lower())
    if normalized in {"last_year", "last_collaboration_year"}:
        year = _safe_int(metrics.get("last_collaboration_year"))
        return (-(year if year is not None else -1), item["full_name"].lower())
    if normalized in {"updated", "updated_at"}:
        updated = item.get("updated_at")
        timestamp = _coerce_utc(updated).timestamp() if isinstance(updated, datetime) else 0.0
        return (-timestamp, item["full_name"].lower())
    return (item["full_name"].lower(),)


def list_collaborators_for_user(
    *,
    user_id: str,
    query: str = "",
    sort: str = "name",
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    create_all_tables()
    clean_query = re.sub(r"\s+", " ", str(query or "").strip().lower())
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 50), 200))
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        base_query = select(Collaborator).where(Collaborator.owner_user_id == user_id)
        if clean_query:
            search_like = f"%{clean_query}%"
            base_query = base_query.where(
                or_(
                    func.lower(Collaborator.full_name).like(search_like),
                    func.lower(Collaborator.email).like(search_like),
                    func.lower(Collaborator.orcid_id).like(search_like),
                    func.lower(Collaborator.primary_institution).like(search_like),
                )
            )
        collaborators = session.scalars(base_query).all()
        metrics_by_collaborator = _metric_by_collaborator(
            session,
            user_id=user_id,
            collaborator_ids=[str(item.id) for item in collaborators],
        )
        rows = [
            _serialize_collaborator(
                item,
                metric=metrics_by_collaborator.get(str(item.id)),
            )
            for item in collaborators
        ]
        rows.sort(key=lambda item: _collab_sort_key(item, sort))
        total = len(rows)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": rows[start:end],
            "page": page,
            "page_size": page_size,
            "total": total,
            "has_more": end < total,
        }


def create_collaborator_for_user(*, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    create_all_tables()
    full_name = _normalize_name(str(payload.get("full_name") or ""))
    orcid_id = validate_orcid_id(payload.get("orcid_id"))
    preferred_name = re.sub(r"\s+", " ", str(payload.get("preferred_name") or "").strip()) or None
    primary_institution = (
        re.sub(r"\s+", " ", str(payload.get("primary_institution") or "").strip()) or None
    )
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        warnings = _find_duplicate_warnings(
            session,
            user_id=user_id,
            full_name=full_name,
            orcid_id=orcid_id,
            primary_institution=primary_institution,
            exclude_collaborator_id=None,
        )
        collaborator = Collaborator(
            owner_user_id=user_id,
            full_name=full_name,
            full_name_lower=_normalize_name_lower(full_name),
            preferred_name=preferred_name,
            email=_normalize_email(payload.get("email")),
            orcid_id=orcid_id,
            openalex_author_id=(str(payload.get("openalex_author_id") or "").strip() or None),
            primary_institution=primary_institution,
            department=(re.sub(r"\s+", " ", str(payload.get("department") or "").strip()) or None),
            country=(re.sub(r"\s+", " ", str(payload.get("country") or "").strip()) or None),
            current_position=(
                re.sub(r"\s+", " ", str(payload.get("current_position") or "").strip())
                or None
            ),
            research_domains=_normalize_domains(payload.get("research_domains")),
            notes=(str(payload.get("notes") or "").strip() or None),
        )
        session.add(collaborator)
        session.flush()
        metric = CollaborationMetric(
            owner_user_id=user_id,
            collaborator_id=collaborator.id,
            status=READY_STATUS,
            classification=CLASSIFICATION_UNCLASSIFIED,
            next_scheduled_at=_utcnow(),
            source_json={"formula_version": FORMULA_VERSION, "failures_in_row": 0},
        )
        session.add(metric)
        session.flush()
        response = _serialize_collaborator(
            collaborator,
            metric=metric,
            duplicate_warnings=warnings,
        )
    enqueue_collaboration_metrics_recompute(
        user_id=user_id,
        reason="collaborator_created",
    )
    return response


def get_collaborator_for_user(*, user_id: str, collaborator_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        collaborator = _resolve_collaborator_or_raise(
            session,
            user_id=user_id,
            collaborator_id=collaborator_id,
        )
        metric = session.scalars(
            select(CollaborationMetric).where(
                CollaborationMetric.owner_user_id == user_id,
                CollaborationMetric.collaborator_id == collaborator.id,
            )
        ).first()
        return _serialize_collaborator(collaborator, metric=metric)


def update_collaborator_for_user(
    *,
    user_id: str,
    collaborator_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        collaborator = _resolve_collaborator_or_raise(
            session,
            user_id=user_id,
            collaborator_id=collaborator_id,
        )
        if "full_name" in payload:
            collaborator.full_name = _normalize_name(str(payload.get("full_name") or ""))
            collaborator.full_name_lower = _normalize_name_lower(collaborator.full_name)
        if "preferred_name" in payload:
            collaborator.preferred_name = (
                re.sub(r"\s+", " ", str(payload.get("preferred_name") or "").strip()) or None
            )
        if "email" in payload:
            collaborator.email = _normalize_email(payload.get("email"))
        if "orcid_id" in payload:
            collaborator.orcid_id = validate_orcid_id(payload.get("orcid_id"))
        if "openalex_author_id" in payload:
            collaborator.openalex_author_id = (
                str(payload.get("openalex_author_id") or "").strip() or None
            )
        if "primary_institution" in payload:
            collaborator.primary_institution = (
                re.sub(r"\s+", " ", str(payload.get("primary_institution") or "").strip()) or None
            )
        if "department" in payload:
            collaborator.department = (
                re.sub(r"\s+", " ", str(payload.get("department") or "").strip()) or None
            )
        if "country" in payload:
            collaborator.country = (
                re.sub(r"\s+", " ", str(payload.get("country") or "").strip()) or None
            )
        if "current_position" in payload:
            collaborator.current_position = (
                re.sub(r"\s+", " ", str(payload.get("current_position") or "").strip()) or None
            )
        if "research_domains" in payload:
            collaborator.research_domains = _normalize_domains(payload.get("research_domains"))
        if "notes" in payload:
            collaborator.notes = str(payload.get("notes") or "").strip() or None
        warnings = _find_duplicate_warnings(
            session,
            user_id=user_id,
            full_name=collaborator.full_name,
            orcid_id=_safe_validate_orcid(collaborator.orcid_id),
            primary_institution=collaborator.primary_institution,
            exclude_collaborator_id=collaborator_id,
        )
        metric = session.scalars(
            select(CollaborationMetric).where(
                CollaborationMetric.owner_user_id == user_id,
                CollaborationMetric.collaborator_id == collaborator.id,
            )
        ).first()
        if metric is None:
            metric = CollaborationMetric(
                owner_user_id=user_id,
                collaborator_id=collaborator.id,
                status=READY_STATUS,
                classification=CLASSIFICATION_UNCLASSIFIED,
                source_json={"formula_version": FORMULA_VERSION, "failures_in_row": 0},
            )
            session.add(metric)
            session.flush()
        response = _serialize_collaborator(
            collaborator,
            metric=metric,
            duplicate_warnings=warnings,
        )
    enqueue_collaboration_metrics_recompute(
        user_id=user_id,
        reason="collaborator_updated",
    )
    return response


def delete_collaborator_for_user(*, user_id: str, collaborator_id: str) -> dict[str, Any]:
    create_all_tables()
    deleted = False
    with session_scope() as session:
        collaborator = _resolve_collaborator_or_raise(
            session,
            user_id=user_id,
            collaborator_id=collaborator_id,
        )
        session.delete(collaborator)
        deleted = True
    if deleted:
        enqueue_collaboration_metrics_recompute(
            user_id=user_id,
            reason="collaborator_deleted",
        )
    return {"deleted": deleted}


def export_collaborators_csv(*, user_id: str) -> tuple[str, str]:
    payload = list_collaborators_for_user(
        user_id=user_id,
        page=1,
        page_size=2000,
    )
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "full_name",
            "preferred_name",
            "email",
            "orcid_id",
            "openalex_author_id",
            "primary_institution",
            "department",
            "country",
            "current_position",
            "classification",
            "coauthored_works_count",
            "shared_citations_total",
            "last_collaboration_year",
        ]
    )
    for item in payload.get("items", []):
        metrics = item.get("metrics") if isinstance(item.get("metrics"), dict) else {}
        writer.writerow(
            [
                item.get("full_name") or "",
                item.get("preferred_name") or "",
                item.get("email") or "",
                item.get("orcid_id") or "",
                item.get("openalex_author_id") or "",
                item.get("primary_institution") or "",
                item.get("department") or "",
                item.get("country") or "",
                item.get("current_position") or "",
                metrics.get("classification") or CLASSIFICATION_UNCLASSIFIED,
                int(metrics.get("coauthored_works_count") or 0),
                int(metrics.get("shared_citations_total") or 0),
                metrics.get("last_collaboration_year") or "",
            ]
        )
    content = output.getvalue()
    output.close()
    return "collaborators.csv", content


def _latest_metrics_by_work(session, *, work_ids: list[str]) -> dict[str, MetricsSnapshot]:
    if not work_ids:
        return {}
    rows = session.scalars(
        select(MetricsSnapshot).where(MetricsSnapshot.work_id.in_(work_ids))
    ).all()
    best: dict[str, MetricsSnapshot] = {}
    for row in rows:
        existing = best.get(str(row.work_id))
        if existing is None:
            best[str(row.work_id)] = row
            continue
        existing_time = _coerce_utc(existing.captured_at)
        current_time = _coerce_utc(row.captured_at)
        if current_time >= existing_time:
            best[str(row.work_id)] = row
    return best


def _latest_metrics_by_work_at_or_before(
    session,
    *,
    work_ids: list[str],
    cutoff: datetime,
) -> dict[str, MetricsSnapshot]:
    if not work_ids:
        return {}
    rows = session.scalars(
        select(MetricsSnapshot).where(
            MetricsSnapshot.work_id.in_(work_ids),
            MetricsSnapshot.captured_at <= _coerce_utc(cutoff),
        )
    ).all()
    best: dict[str, MetricsSnapshot] = {}
    for row in rows:
        existing = best.get(str(row.work_id))
        if existing is None:
            best[str(row.work_id)] = row
            continue
        existing_time = _coerce_utc(existing.captured_at)
        current_time = _coerce_utc(row.captured_at)
        if current_time >= existing_time:
            best[str(row.work_id)] = row
    return best


def _author_match_indexes(authors: list[Author]) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    by_orcid: dict[str, set[str]] = defaultdict(set)
    by_name: dict[str, set[str]] = defaultdict(set)
    for author in authors:
        if author.orcid_id:
            by_orcid[_normalize_orcid_id(author.orcid_id)].add(str(author.id))
        normalized_name = _normalize_name_lower(author.canonical_name or "")
        if normalized_name:
            by_name[normalized_name].add(str(author.id))
    return by_orcid, by_name


def _recency_weight(last_year: int | None, *, now_year: int) -> float:
    if last_year is None:
        return 0.0
    delta = now_year - int(last_year)
    if delta <= 1:
        return 1.0
    if delta == 2:
        return 0.75
    if delta == 3:
        return 0.5
    if delta == 4:
        return 0.25
    return 0.0


def _classify_collaboration(
    *,
    score: float,
    coauthored_works_count: int,
    last_collaboration_year: int | None,
    now_year: int,
    threshold_core: float,
) -> str:
    if coauthored_works_count <= 0:
        return CLASSIFICATION_UNCLASSIFIED
    if last_collaboration_year is not None and last_collaboration_year <= now_year - 4:
        return CLASSIFICATION_HISTORIC
    recency = _recency_weight(last_collaboration_year, now_year=now_year)
    if score >= threshold_core or (coauthored_works_count >= 5 and recency >= 0.75):
        return CLASSIFICATION_CORE
    if recency >= 0.5 and score >= 0.25:
        return CLASSIFICATION_ACTIVE
    return CLASSIFICATION_OCCASIONAL


def _read_failures_in_row(source_json: dict[str, Any]) -> int:
    if not isinstance(source_json, dict):
        return 0
    value = _safe_int(source_json.get("failures_in_row"))
    return max(0, value if value is not None else 0)


def _collaborator_rows_with_metrics(session, *, user_id: str, for_update: bool = False) -> tuple[list[Collaborator], dict[str, CollaborationMetric]]:
    collaborators_query = select(Collaborator).where(Collaborator.owner_user_id == user_id)
    if for_update:
        collaborators_query = collaborators_query.with_for_update()
    collaborators = session.scalars(collaborators_query).all()
    ids = [str(item.id) for item in collaborators]
    metric_query = select(CollaborationMetric).where(
        CollaborationMetric.owner_user_id == user_id,
        CollaborationMetric.collaborator_id.in_(ids or [""]),
    )
    if for_update:
        metric_query = metric_query.with_for_update()
    metric_rows = session.scalars(metric_query).all()
    return collaborators, {str(item.collaborator_id): item for item in metric_rows}


def _is_stale(*, collaborators: list[Collaborator], metric_rows: dict[str, CollaborationMetric], now: datetime) -> bool:
    if not collaborators:
        return False
    if not metric_rows:
        return True
    for collaborator in collaborators:
        metric = metric_rows.get(str(collaborator.id))
        if metric is None:
            return True
        computed_at = _coerce_utc_or_none(metric.computed_at)
        if computed_at is None:
            return True
        if (now - computed_at).total_seconds() > _ttl_seconds():
            return True
    return False


def _is_running(metric_rows: dict[str, CollaborationMetric]) -> bool:
    for row in metric_rows.values():
        if _normalize_status(row.status) == RUNNING_STATUS:
            return True
    return False


def _acquire_user_enqueue_lock(session, *, user_id: str, now: datetime) -> bool:
    lock_name = f"collaboration_metrics_user:{user_id}"
    lease_expires = now + timedelta(seconds=max(300, _ttl_seconds() // 4))
    row = session.scalars(
        select(AppRuntimeLock).where(AppRuntimeLock.lock_name == lock_name).with_for_update()
    ).first()
    if row is None:
        session.add(
            AppRuntimeLock(
                lock_name=lock_name,
                owner_id=_INSTANCE_ID,
                lease_expires_at=lease_expires,
            )
        )
        session.flush()
        return True
    if _coerce_utc(row.lease_expires_at) <= now or str(row.owner_id) == _INSTANCE_ID:
        row.owner_id = _INSTANCE_ID
        row.lease_expires_at = lease_expires
        session.flush()
        return True
    return False


def _mark_running(*, user_id: str, force: bool = False) -> bool:
    now = _utcnow()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        if not _acquire_user_enqueue_lock(session, user_id=user_id, now=now):
            return False
        collaborators, metric_rows = _collaborator_rows_with_metrics(
            session,
            user_id=user_id,
            for_update=True,
        )
        if not collaborators:
            return False
        if _is_running(metric_rows):
            return False
        stale = _is_stale(collaborators=collaborators, metric_rows=metric_rows, now=now)
        if not force and not stale:
            due = False
            for row in metric_rows.values():
                next_scheduled = _coerce_utc_or_none(row.next_scheduled_at)
                if next_scheduled and next_scheduled <= now:
                    due = True
                    break
            if not due:
                return False
        for collaborator in collaborators:
            row = metric_rows.get(str(collaborator.id))
            if row is None:
                row = CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=collaborator.id,
                    status=RUNNING_STATUS,
                    classification=CLASSIFICATION_UNCLASSIFIED,
                    source_json={
                        "formula_version": FORMULA_VERSION,
                        "failures_in_row": 0,
                    },
                    computed_at=None,
                    next_scheduled_at=now,
                )
                session.add(row)
            else:
                row.status = RUNNING_STATUS
                row.last_error = None
                row.next_scheduled_at = now
        session.flush()
        return True


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(
                max_workers=_max_concurrent_jobs(),
                thread_name_prefix="collab-metrics",
            )
        return _executor


def _shutdown_executor() -> None:
    global _executor
    with _executor_lock:
        if _executor is not None:
            _executor.shutdown(wait=False, cancel_futures=False)
            _executor = None


def _persist_failed(*, user_id: str, detail: str) -> None:
    now = _utcnow()
    with session_scope() as session:
        collaborators, rows_by_collab = _collaborator_rows_with_metrics(
            session,
            user_id=user_id,
            for_update=True,
        )
        if not collaborators:
            return
        failures_max = 0
        for collaborator in collaborators:
            row = rows_by_collab.get(str(collaborator.id))
            if row is None:
                row = CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=collaborator.id,
                    classification=CLASSIFICATION_UNCLASSIFIED,
                    source_json={"formula_version": FORMULA_VERSION, "failures_in_row": 0},
                )
                session.add(row)
                rows_by_collab[str(collaborator.id)] = row
                session.flush()
            failures = _read_failures_in_row(row.source_json) + 1
            failures_max = max(failures_max, failures)
            row.status = FAILED_STATUS
            row.last_error = str(detail or "Collaboration recompute failed.")[:2000]
            row.source_json = {
                **(row.source_json if isinstance(row.source_json, dict) else {}),
                "formula_version": FORMULA_VERSION,
                "failures_in_row": failures,
            }
            row.next_scheduled_at = now + timedelta(seconds=_failure_backoff_seconds(failures))
            row.updated_at = now
        logger.warning(
            "collaboration_metrics_compute_failed",
            extra={"user_id": user_id, "detail": str(detail), "failures_in_row": failures_max},
        )
        session.flush()


def _run_background_compute(user_id: str) -> None:
    try:
        compute_collaboration_metrics(user_id=user_id)
    except Exception as exc:
        _persist_failed(user_id=user_id, detail=str(exc))


def enqueue_collaboration_metrics_recompute(
    *,
    user_id: str,
    force: bool = False,
    reason: str | None = None,
) -> bool:
    create_all_tables()
    should_enqueue = _mark_running(user_id=user_id, force=force)
    if not should_enqueue:
        return False
    try:
        _get_executor().submit(_run_background_compute, user_id)
        if reason:
            logger.info(
                "collaboration_metrics_enqueue",
                extra={"user_id": user_id, "reason": reason},
            )
        return True
    except Exception as exc:
        _persist_failed(
            user_id=user_id,
            detail=f"Failed to enqueue collaboration recompute: {exc}",
        )
        return False


def _build_collaboration_work_index(
    *,
    collaborators: list[Collaborator],
    works: list[Work],
    authorships: list[WorkAuthorship],
    authors_by_id: dict[str, Author],
) -> dict[str, set[str]]:
    by_orcid, by_name = _author_match_indexes(list(authors_by_id.values()))
    work_ids_by_author: dict[str, set[str]] = defaultdict(set)
    for authorship in authorships:
        if authorship.is_user:
            continue
        work_ids_by_author[str(authorship.author_id)].add(str(authorship.work_id))
    shared_by_collaborator: dict[str, set[str]] = defaultdict(set)
    for collaborator in collaborators:
        author_ids: set[str] = set()
        normalized_orcid = _normalize_orcid_id(collaborator.orcid_id)
        if normalized_orcid and normalized_orcid in by_orcid:
            author_ids.update(by_orcid[normalized_orcid])
        normalized_name = _normalize_name_lower(collaborator.full_name)
        if normalized_name and normalized_name in by_name:
            author_ids.update(by_name[normalized_name])
        if not author_ids and normalized_name:
            for author in authors_by_id.values():
                if not author.canonical_name:
                    continue
                if _name_similarity(collaborator.full_name, author.canonical_name) < 0.94:
                    continue
                author_ids.add(str(author.id))
        for author_id in author_ids:
            shared_by_collaborator[str(collaborator.id)].update(
                work_ids_by_author.get(author_id, set())
            )
    return shared_by_collaborator


def compute_collaboration_metrics(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    now = _utcnow()
    now_year = now.year
    cutoff_12m = now - timedelta(days=365)
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        collaborators, existing_rows = _collaborator_rows_with_metrics(
            session,
            user_id=user_id,
            for_update=True,
        )
        if not collaborators:
            return {
                "updated_collaborators": 0,
                "computed_at": now,
            }
        works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
        work_by_id = {str(work.id): work for work in works}
        work_ids = [str(work.id) for work in works]
        authorships = session.scalars(
            select(WorkAuthorship).where(
                WorkAuthorship.work_id.in_(work_ids or [""]),
                WorkAuthorship.is_user.is_(False),
            )
        ).all()
        author_ids = [str(item.author_id) for item in authorships]
        authors = session.scalars(
            select(Author).where(Author.id.in_(author_ids or [""]))
        ).all()
        authors_by_id = {str(author.id): author for author in authors}
        shared_by_collaborator = _build_collaboration_work_index(
            collaborators=collaborators,
            works=works,
            authorships=authorships,
            authors_by_id=authors_by_id,
        )

        latest_snapshots = _latest_metrics_by_work(session, work_ids=work_ids)
        snapshots_12m = _latest_metrics_by_work_at_or_before(
            session,
            work_ids=work_ids,
            cutoff=cutoff_12m,
        )

        raw_stats: dict[str, dict[str, Any]] = {}
        max_works = 0
        max_shared_citations = 0
        for collaborator in collaborators:
            collab_id = str(collaborator.id)
            shared_work_ids = sorted(shared_by_collaborator.get(collab_id, set()))
            coauthored_count = len(shared_work_ids)
            max_works = max(max_works, coauthored_count)
            shared_citations = 0
            citations_last_12m = 0
            years: list[int] = []
            top_works: list[tuple[str, int]] = []
            for work_id in shared_work_ids:
                work = work_by_id.get(work_id)
                if work and isinstance(work.year, int):
                    years.append(int(work.year))
                latest = latest_snapshots.get(work_id)
                at_12 = snapshots_12m.get(work_id)
                current_citations = int(latest.citations_count or 0) if latest else 0
                shared_citations += max(0, current_citations)
                prior_citations = int(at_12.citations_count or 0) if at_12 else 0
                citations_last_12m += max(0, current_citations - prior_citations)
                top_works.append((work_id, current_citations))
            max_shared_citations = max(max_shared_citations, shared_citations)
            first_year = min(years) if years else None
            last_year = max(years) if years else None
            raw_stats[collab_id] = {
                "coauthored_works_count": coauthored_count,
                "shared_citations_total": shared_citations,
                "first_collaboration_year": first_year,
                "last_collaboration_year": last_year,
                "citations_last_12m": citations_last_12m,
                "top_work_ids": [work_id for work_id, _ in sorted(top_works, key=lambda item: item[1], reverse=True)[:3]],
            }

        scores: list[float] = []
        for values in raw_stats.values():
            works_norm = (
                float(values["coauthored_works_count"]) / float(max_works)
                if max_works > 0
                else 0.0
            )
            citations_norm = (
                float(values["shared_citations_total"]) / float(max_shared_citations)
                if max_shared_citations > 0
                else 0.0
            )
            recency = _recency_weight(values["last_collaboration_year"], now_year=now_year)
            score = round((0.55 * works_norm) + (0.25 * citations_norm) + (0.20 * recency), 4)
            values["score"] = score
            scores.append(score)

        score_threshold_core = 0.0
        if scores:
            sorted_scores = sorted(scores, reverse=True)
            index = max(0, int(round(len(sorted_scores) * 0.1)) - 1)
            score_threshold_core = sorted_scores[index]

        for collaborator in collaborators:
            collab_id = str(collaborator.id)
            values = raw_stats.get(collab_id, {})
            row = existing_rows.get(collab_id)
            if row is None:
                row = CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=collaborator.id,
                    source_json={"formula_version": FORMULA_VERSION, "failures_in_row": 0},
                )
                session.add(row)
                existing_rows[collab_id] = row
            score = float(values.get("score", 0.0) or 0.0)
            classification = _classify_collaboration(
                score=score,
                coauthored_works_count=int(values.get("coauthored_works_count") or 0),
                last_collaboration_year=values.get("last_collaboration_year"),
                now_year=now_year,
                threshold_core=score_threshold_core,
            )
            row.coauthored_works_count = int(values.get("coauthored_works_count") or 0)
            row.shared_citations_total = int(values.get("shared_citations_total") or 0)
            row.first_collaboration_year = values.get("first_collaboration_year")
            row.last_collaboration_year = values.get("last_collaboration_year")
            row.citations_last_12m = int(values.get("citations_last_12m") or 0)
            row.collaboration_strength_score = score
            row.classification = classification
            row.status = READY_STATUS
            row.last_error = None
            row.computed_at = now
            row.next_scheduled_at = now + timedelta(hours=_schedule_hours())
            row.source_json = {
                "formula_version": FORMULA_VERSION,
                "normalised_works_weight": 0.55,
                "normalised_shared_citations_weight": 0.25,
                "recency_weight_weight": 0.20,
                "top_shared_work_ids": list(values.get("top_work_ids") or []),
                "failures_in_row": 0,
            }

        orphan_rows = session.scalars(
            select(CollaborationMetric).where(
                CollaborationMetric.owner_user_id == user_id,
                ~CollaborationMetric.collaborator_id.in_(
                    [str(item.id) for item in collaborators] or [""]
                ),
            )
        ).all()
        for orphan in orphan_rows:
            session.delete(orphan)
        session.flush()
        return {
            "updated_collaborators": len(collaborators),
            "computed_at": now,
        }


def _build_summary_response(
    *,
    collaborators: list[Collaborator],
    metrics_rows: dict[str, CollaborationMetric],
    now: datetime,
    force_running: bool = False,
) -> dict[str, Any]:
    total_collaborators = len(collaborators)
    rows: list[CollaborationMetric] = []
    for collaborator in collaborators:
        metric = metrics_rows.get(str(collaborator.id))
        if metric is not None:
            rows.append(metric)
    computed_values = [
        _coerce_utc_or_none(row.computed_at)
        for row in rows
        if _coerce_utc_or_none(row.computed_at) is not None
    ]
    last_computed_at = max(computed_values) if computed_values else None
    core_collaborators = sum(
        1
        for row in rows
        if _normalize_classification(row.classification) == CLASSIFICATION_CORE
    )
    active_collaborations_12m = sum(
        1
        for row in rows
        if (
            int(row.citations_last_12m or 0) > 0
            or (
                isinstance(row.last_collaboration_year, int)
                and row.last_collaboration_year >= now.year - 1
            )
        )
    )
    # Count genuinely new collaboration relationships, not recently imported records.
    # We only have year-level granularity, so treat current/previous year as the 12m window.
    new_collaborators_12m = sum(
        1
        for row in rows
        if (
            isinstance(row.first_collaboration_year, int)
            and row.first_collaboration_year >= now.year - 1
        )
    )
    stale = _is_stale(collaborators=collaborators, metric_rows=metrics_rows, now=now)
    if force_running:
        status = RUNNING_STATUS
    elif _is_running(metrics_rows):
        status = RUNNING_STATUS
    elif any(_normalize_status(row.status) == FAILED_STATUS for row in rows):
        status = FAILED_STATUS
    else:
        status = READY_STATUS
    return {
        "total_collaborators": total_collaborators,
        "core_collaborators": core_collaborators,
        "active_collaborations_12m": active_collaborations_12m,
        "new_collaborators_12m": new_collaborators_12m,
        "last_computed_at": last_computed_at,
        "status": status,
        "is_stale": stale,
        "is_updating": status == RUNNING_STATUS,
        "last_update_failed": status == FAILED_STATUS,
    }


def get_collaboration_metrics_summary(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    now = _utcnow()
    should_enqueue = False
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        collaborators, metrics_rows = _collaborator_rows_with_metrics(
            session,
            user_id=user_id,
            for_update=False,
        )
        stale = _is_stale(collaborators=collaborators, metric_rows=metrics_rows, now=now)
        running = _is_running(metrics_rows)
        should_enqueue = stale and not running and len(collaborators) > 0
        payload = _build_summary_response(
            collaborators=collaborators,
            metrics_rows=metrics_rows,
            now=now,
            force_running=should_enqueue,
        )
    if should_enqueue and enqueue_collaboration_metrics_recompute(
        user_id=user_id,
        reason="stale_summary_read",
    ):
        payload["status"] = RUNNING_STATUS
        payload["is_updating"] = True
    return payload


def trigger_collaboration_metrics_recompute(*, user_id: str, force: bool = False) -> dict[str, Any]:
    enqueued = enqueue_collaboration_metrics_recompute(
        user_id=user_id,
        force=force,
        reason="manual_trigger",
    )
    return {"enqueued": enqueued}


def _openalex_mailto(*, fallback_email: str | None = None) -> str | None:
    explicit = str(os.getenv("OPENALEX_MAILTO", "")).strip()
    if explicit and "@" in explicit:
        return explicit
    clean_fallback = str(fallback_email or "").strip()
    if clean_fallback and "@" in clean_fallback:
        return clean_fallback
    bootstrap = str(os.getenv("AAWE_BOOTSTRAP_EMAIL", "")).strip()
    if bootstrap and "@" in bootstrap:
        return bootstrap
    return None


def _openalex_request_with_retry(*, url: str, params: dict[str, Any]) -> dict[str, Any]:
    timeout = httpx.Timeout(_openalex_timeout_seconds())
    retries = _openalex_retry_count()
    last_exception: Exception | None = None
    with httpx.Client(timeout=timeout) as client:
        for attempt in range(retries + 1):
            try:
                response = client.get(url, params=params)
            except Exception as exc:
                last_exception = exc
                if attempt < retries:
                    time.sleep(0.35 * (attempt + 1))
                    continue
                break
            if response.status_code < 400:
                payload = response.json()
                return payload if isinstance(payload, dict) else {}
            if response.status_code not in RETRYABLE_STATUS_CODES or attempt >= retries:
                return {}
            time.sleep(0.35 * (attempt + 1))
    if last_exception:
        logger.warning("collaboration_openalex_request_failed", extra={"detail": str(last_exception)})
    return {}


def _resolve_openalex_author_id(*, orcid_id: str | None, mailto: str | None) -> str | None:
    normalized_orcid = _normalize_orcid_id(orcid_id)
    if not normalized_orcid:
        return None
    params: dict[str, Any] = {
        "filter": f"orcid:https://orcid.org/{normalized_orcid}",
        "per-page": 1,
    }
    if mailto:
        params["mailto"] = mailto
    payload = _openalex_request_with_retry(
        url="https://api.openalex.org/authors",
        params=params,
    )
    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list) or not results:
        return None
    first = results[0]
    if not isinstance(first, dict):
        return None
    author_id = str(first.get("id") or "").strip()
    return author_id or None


def _normalize_openalex_author_id(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    if clean.startswith("http://openalex.org/"):
        clean = "https://openalex.org/" + clean.removeprefix("http://openalex.org/")
    if clean.startswith("https://openalex.org/"):
        suffix = clean.removeprefix("https://openalex.org/").strip().strip("/")
        return f"https://openalex.org/{suffix}" if suffix else None
    if re.fullmatch(r"(?i)A\d+", clean):
        return f"https://openalex.org/{clean.upper()}"
    return clean


def _openalex_author_lookup_id(openalex_author_id: str) -> str | None:
    normalized = _normalize_openalex_author_id(openalex_author_id)
    if not normalized:
        return None
    if normalized.startswith("https://openalex.org/"):
        return normalized.removeprefix("https://openalex.org/").strip().strip("/") or None
    return normalized.strip().strip("/") or None


def _extract_openalex_domains(author_payload: dict[str, Any]) -> list[str]:
    topics = author_payload.get("topics")
    if isinstance(topics, list) and topics:
        ranked_topics: list[tuple[float, str]] = []
        for item in topics:
            if not isinstance(item, dict):
                continue
            label = re.sub(r"\s+", " ", str(item.get("display_name") or "").strip())
            if not label and isinstance(item.get("subfield"), dict):
                label = re.sub(
                    r"\s+",
                    " ",
                    str(item.get("subfield", {}).get("display_name") or "").strip(),
                )
            if not label:
                continue
            score = _safe_float(item.get("score")) or 0.0
            ranked_topics.append((score, label))
        ranked_topics.sort(key=lambda row: (-row[0], row[1].lower()))
        return _normalize_domains([label for _, label in ranked_topics])[:8]

    concepts = author_payload.get("x_concepts")
    ranked_concepts: list[tuple[float, str]] = []
    if isinstance(concepts, list):
        for item in concepts:
            if not isinstance(item, dict):
                continue
            score = _safe_float(item.get("score")) or 0.0
            if score < 0.35:
                continue
            label = re.sub(r"\s+", " ", str(item.get("display_name") or "").strip())
            if not label:
                continue
            ranked_concepts.append((score, label))
    ranked_concepts.sort(key=lambda row: (-row[0], row[1].lower()))
    return _normalize_domains([label for _, label in ranked_concepts])[:8]


def _fetch_openalex_author_profile(
    *,
    openalex_author_id: str,
    mailto: str | None,
) -> dict[str, Any]:
    lookup_id = _openalex_author_lookup_id(openalex_author_id)
    if not lookup_id:
        return {}
    params: dict[str, Any] = {
        "select": (
            "id,orcid,ids,last_known_institution,last_known_institutions,"
            "topics,x_concepts"
        ),
    }
    if mailto:
        params["mailto"] = mailto
    payload = _openalex_request_with_retry(
        url=f"https://api.openalex.org/authors/{lookup_id}",
        params=params,
    )
    if not payload:
        return {}

    orcid_id = _safe_validate_orcid(payload.get("orcid"))
    if not orcid_id and isinstance(payload.get("ids"), dict):
        orcid_id = _safe_validate_orcid(payload.get("ids", {}).get("orcid"))

    institution_payload = payload.get("last_known_institutions")
    institution_rows: list[dict[str, Any]] = []
    if isinstance(institution_payload, list):
        institution_rows.extend(
            item for item in institution_payload if isinstance(item, dict)
        )
    if isinstance(payload.get("last_known_institution"), dict):
        institution_rows.append(payload["last_known_institution"])

    primary_institution = None
    country = None
    for item in institution_rows:
        if primary_institution is None:
            name = re.sub(r"\s+", " ", str(item.get("display_name") or "").strip())
            primary_institution = name or None
        if country is None:
            code = re.sub(r"\s+", " ", str(item.get("country_code") or "").strip())
            country = code or None
        if primary_institution and country:
            break

    author_id = _normalize_openalex_author_id(
        str(payload.get("id") or "").strip() or openalex_author_id
    )
    domains = _extract_openalex_domains(payload)
    return {
        "openalex_author_id": author_id,
        "orcid_id": orcid_id,
        "primary_institution": primary_institution,
        "country": country,
        "research_domains": domains,
    }


def _iter_openalex_coauthors(
    *,
    openalex_author_id: str,
    mailto: str | None,
) -> list[dict[str, Any]]:
    max_pages = _openalex_max_pages()
    coauthors: dict[str, dict[str, Any]] = {}
    for page in range(1, max_pages + 1):
        params: dict[str, Any] = {
            "filter": f"author.id:{openalex_author_id}",
            "per-page": 200,
            "page": page,
            "select": "id,authorships",
        }
        if mailto:
            params["mailto"] = mailto
        payload = _openalex_request_with_retry(
            url="https://api.openalex.org/works",
            params=params,
        )
        results = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(results, list) or not results:
            break
        for work in results:
            if not isinstance(work, dict):
                continue
            work_id = str(work.get("id") or "").strip()
            authorships = work.get("authorships")
            if not isinstance(authorships, list):
                continue
            for authorship in authorships:
                if not isinstance(authorship, dict):
                    continue
                author = authorship.get("author")
                if not isinstance(author, dict):
                    continue
                candidate_openalex_id = str(author.get("id") or "").strip()
                if not candidate_openalex_id or candidate_openalex_id == openalex_author_id:
                    continue
                name = re.sub(r"\s+", " ", str(author.get("display_name") or "").strip())
                if not name:
                    continue
                candidate_orcid = (
                    _safe_validate_orcid(author.get("orcid")) if author.get("orcid") else None
                )
                institutions = authorship.get("institutions")
                institution_name = None
                country = None
                if isinstance(institutions, list) and institutions:
                    first = institutions[0]
                    if isinstance(first, dict):
                        institution_name = (
                            re.sub(r"\s+", " ", str(first.get("display_name") or "").strip()) or None
                        )
                        country = (
                            re.sub(r"\s+", " ", str(first.get("country_code") or "").strip()) or None
                        )
                key = candidate_orcid or candidate_openalex_id
                existing = coauthors.get(key)
                if existing is None:
                    coauthors[key] = {
                        "full_name": name,
                        "orcid_id": candidate_orcid,
                        "openalex_author_id": candidate_openalex_id,
                        "primary_institution": institution_name,
                        "country": country,
                        "shared_openalex_work_ids": [work_id] if work_id else [],
                    }
                    continue
                if work_id and work_id not in existing["shared_openalex_work_ids"]:
                    existing["shared_openalex_work_ids"].append(work_id)
                if not existing.get("primary_institution") and institution_name:
                    existing["primary_institution"] = institution_name
                if not existing.get("country") and country:
                    existing["country"] = country
        if len(results) < 200:
            break
        time.sleep(0.12)
    return list(coauthors.values())


def _most_common_text(values: list[str]) -> str | None:
    counts: dict[str, int] = defaultdict(int)
    first_seen_order: dict[str, int] = {}
    for item in values:
        clean = re.sub(r"\s+", " ", str(item or "").strip())
        if not clean:
            continue
        key = clean.lower()
        if key not in first_seen_order:
            first_seen_order[key] = len(first_seen_order)
        counts[key] += 1
    if not counts:
        return None
    ranked = sorted(
        counts.items(),
        key=lambda row: (-row[1], first_seen_order.get(row[0], 0), row[0]),
    )
    best_key = ranked[0][0]
    for item in values:
        clean = re.sub(r"\s+", " ", str(item or "").strip())
        if clean and clean.lower() == best_key:
            return clean
    return best_key


def _extract_author_affiliations(author_payload: dict[str, Any]) -> list[str]:
    raw_affiliations = author_payload.get("affiliations")
    values: list[str] = []
    if isinstance(raw_affiliations, list):
        for item in raw_affiliations:
            if isinstance(item, dict):
                clean = re.sub(r"\s+", " ", str(item.get("name") or "").strip())
            else:
                clean = re.sub(r"\s+", " ", str(item or "").strip())
            if clean:
                values.append(clean)
    elif isinstance(raw_affiliations, dict):
        clean = re.sub(r"\s+", " ", str(raw_affiliations.get("name") or "").strip())
        if clean:
            values.append(clean)
    else:
        clean = re.sub(r"\s+", " ", str(raw_affiliations or "").strip())
        if clean:
            values.append(clean)
    deduped: list[str] = []
    seen: set[str] = set()
    for item in values:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _work_affiliation_country_map(work: Work) -> dict[str, str]:
    rows = work.affiliations_json if isinstance(work.affiliations_json, list) else []
    mapping: dict[str, str] = {}
    for item in rows:
        if not isinstance(item, dict):
            continue
        name = re.sub(r"\s+", " ", str(item.get("name") or "").strip())
        if not name:
            continue
        country = re.sub(
            r"\s+",
            " ",
            str(item.get("country_code") or item.get("country") or "").strip(),
        ).upper()
        if not country:
            continue
        key = _normalize_name_lower(name)
        if key not in mapping:
            mapping[key] = country
    return mapping


def _infer_collaborator_profile_from_publication_authors(
    *,
    collaborator: Collaborator,
    works: list[Work],
) -> dict[str, Any]:
    collaborator_name = re.sub(r"\s+", " ", str(collaborator.full_name or "").strip())
    if not collaborator_name:
        return {}
    collaborator_orcid = _safe_validate_orcid(collaborator.orcid_id)
    normalized_collaborator_name = _normalize_name_lower(collaborator_name)

    orcid_candidates: list[str] = []
    institution_candidates: list[str] = []
    country_candidates: list[str] = []
    domain_candidates: list[str] = []

    for work in works:
        authors = work.authors_json if isinstance(work.authors_json, list) else []
        if not authors:
            continue
        affiliation_country_map = _work_affiliation_country_map(work)
        matched_author: dict[str, Any] | None = None
        matched_author_orcid: str | None = None
        best_score = 0.0

        for item in authors:
            if not isinstance(item, dict):
                continue
            candidate_name = re.sub(
                r"\s+",
                " ",
                str(
                    item.get("name")
                    or item.get("display_name")
                    or item.get("full_name")
                    or ""
                ).strip(),
            )
            candidate_orcid = _safe_validate_orcid(
                item.get("orcid_id") or item.get("orcid")
            )
            score = 0.0
            if collaborator_orcid and candidate_orcid:
                if _normalize_orcid_id(collaborator_orcid) == _normalize_orcid_id(
                    candidate_orcid
                ):
                    score = 1.2
            if score <= 0 and candidate_name:
                if _normalize_name_lower(candidate_name) == normalized_collaborator_name:
                    score = 1.0
                else:
                    similarity = _name_similarity(collaborator_name, candidate_name)
                    if similarity >= 0.95:
                        score = similarity
            if score <= 0:
                continue
            if matched_author is None or score > best_score:
                matched_author = item
                matched_author_orcid = candidate_orcid
                best_score = score

        if matched_author is None:
            continue

        if matched_author_orcid:
            orcid_candidates.append(matched_author_orcid)

        for institution in _extract_author_affiliations(matched_author):
            institution_candidates.append(institution)
            mapped_country = affiliation_country_map.get(
                _normalize_name_lower(institution)
            )
            if mapped_country:
                country_candidates.append(mapped_country)

        for keyword in list(work.keywords or []):
            clean_keyword = re.sub(r"\s+", " ", str(keyword or "").strip())
            if clean_keyword:
                domain_candidates.append(clean_keyword)

    inferred_orcid = _safe_validate_orcid(_most_common_text(orcid_candidates))
    inferred_institution = _most_common_text(institution_candidates)
    inferred_country = _most_common_text(country_candidates)
    inferred_domains = _normalize_domains(domain_candidates)[:8]
    if not (
        inferred_orcid
        or inferred_institution
        or inferred_country
        or len(inferred_domains) > 0
    ):
        return {}
    return {
        "orcid_id": inferred_orcid,
        "primary_institution": inferred_institution,
        "country": inferred_country,
        "research_domains": inferred_domains,
    }


def _match_existing_for_import(
    session,
    *,
    user_id: str,
    candidate: dict[str, Any],
) -> Collaborator | None:
    candidate_orcid = _safe_validate_orcid(candidate.get("orcid_id"))
    candidate_openalex = str(candidate.get("openalex_author_id") or "").strip() or None
    candidate_name = str(candidate.get("full_name") or "").strip()
    candidate_inst = str(candidate.get("primary_institution") or "").strip()
    if candidate_orcid:
        found = session.scalars(
            select(Collaborator).where(
                Collaborator.owner_user_id == user_id,
                Collaborator.orcid_id == candidate_orcid,
            )
        ).first()
        if found is not None:
            return found
    if candidate_openalex:
        found = session.scalars(
            select(Collaborator).where(
                Collaborator.owner_user_id == user_id,
                Collaborator.openalex_author_id == candidate_openalex,
            )
        ).first()
        if found is not None:
            return found
    rows = session.scalars(
        select(Collaborator).where(Collaborator.owner_user_id == user_id)
    ).all()
    for row in rows:
        if _name_similarity(candidate_name, row.full_name) < 0.92:
            continue
        if _affiliation_similarity(candidate_inst, row.primary_institution) < 0.8:
            continue
        return row
    return None


def import_collaborators_from_openalex(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        user_orcid = validate_orcid_id(user.orcid_id)
        if not user_orcid:
            raise CollaborationValidationError(
                "ORCID must be linked before importing collaborators from OpenAlex."
            )
        user_email = user.email
    openalex_author_id = _resolve_openalex_author_id(
        orcid_id=user_orcid,
        mailto=_openalex_mailto(fallback_email=user_email),
    )
    if not openalex_author_id:
        raise CollaborationValidationError(
            "Could not resolve OpenAlex author from linked ORCID."
        )
    candidates = _iter_openalex_coauthors(
        openalex_author_id=openalex_author_id,
        mailto=_openalex_mailto(fallback_email=user_email),
    )
    created_count = 0
    updated_count = 0
    skipped_count = 0
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        for candidate in candidates:
            full_name = _normalize_name(str(candidate.get("full_name") or ""))
            candidate_orcid = _safe_validate_orcid(candidate.get("orcid_id"))
            existing = _match_existing_for_import(
                session,
                user_id=user_id,
                candidate=candidate,
            )
            if existing is None:
                collaborator = Collaborator(
                    owner_user_id=user_id,
                    full_name=full_name,
                    full_name_lower=_normalize_name_lower(full_name),
                    orcid_id=candidate_orcid,
                    openalex_author_id=str(candidate.get("openalex_author_id") or "").strip() or None,
                    primary_institution=(
                        re.sub(
                            r"\s+",
                            " ",
                            str(candidate.get("primary_institution") or "").strip(),
                        )
                        or None
                    ),
                    country=(
                        re.sub(r"\s+", " ", str(candidate.get("country") or "").strip())
                        or None
                    ),
                )
                session.add(collaborator)
                session.flush()
                session.add(
                    CollaborationMetric(
                        owner_user_id=user_id,
                        collaborator_id=collaborator.id,
                        status=READY_STATUS,
                        classification=CLASSIFICATION_UNCLASSIFIED,
                        source_json={
                            "formula_version": FORMULA_VERSION,
                            "failures_in_row": 0,
                            "top_shared_work_ids": list(
                                candidate.get("shared_openalex_work_ids") or []
                            )[:3],
                        },
                        next_scheduled_at=_utcnow(),
                    )
                )
                created_count += 1
                continue

            changed = False
            if not existing.orcid_id and candidate_orcid:
                existing.orcid_id = candidate_orcid
                changed = True
            if (
                not existing.openalex_author_id
                and str(candidate.get("openalex_author_id") or "").strip()
            ):
                existing.openalex_author_id = str(candidate["openalex_author_id"]).strip()
                changed = True
            if not existing.primary_institution and candidate.get("primary_institution"):
                existing.primary_institution = (
                    re.sub(
                        r"\s+",
                        " ",
                        str(candidate.get("primary_institution") or "").strip(),
                    )
                    or None
                )
                changed = True
            if not existing.country and candidate.get("country"):
                existing.country = (
                    re.sub(r"\s+", " ", str(candidate.get("country") or "").strip()) or None
                )
                changed = True
            if changed:
                updated_count += 1
            else:
                skipped_count += 1
        session.flush()
    enqueue_collaboration_metrics_recompute(
        user_id=user_id,
        force=True,
        reason="openalex_import",
    )
    return {
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "openalex_author_id": openalex_author_id,
        "imported_candidates": len(candidates),
    }


def enrich_collaborators_from_openalex(
    *,
    user_id: str,
    only_missing: bool = True,
    limit: int = 200,
) -> dict[str, Any]:
    create_all_tables()
    normalized_limit = max(1, min(int(limit or 200), 500))
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        mailto = _openalex_mailto(fallback_email=user.email)
        collaborators = session.scalars(
            select(Collaborator)
            .where(Collaborator.owner_user_id == user_id)
            .order_by(Collaborator.updated_at.desc())
        ).all()

        if only_missing:
            collaborators = [
                row
                for row in collaborators
                if not (
                    _normalize_openalex_author_id(row.openalex_author_id)
                    and _safe_validate_orcid(row.orcid_id)
                    and str(row.primary_institution or "").strip()
                    and str(row.country or "").strip()
                    and len(list(row.research_domains or [])) > 0
                )
            ]

        target_rows = collaborators[:normalized_limit]
        works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
        field_updates: dict[str, int] = defaultdict(int)
        updated_count = 0
        unchanged_count = 0
        skipped_without_identifier = 0
        failed_count = 0
        resolved_author_count = 0

        for collaborator in target_rows:
            changed = False
            fallback_profile = _infer_collaborator_profile_from_publication_authors(
                collaborator=collaborator,
                works=works,
            )
            resolved_author_id = _normalize_openalex_author_id(collaborator.openalex_author_id)
            if not resolved_author_id:
                resolved_author_id = _normalize_openalex_author_id(
                    _resolve_openalex_author_id(
                        orcid_id=collaborator.orcid_id,
                        mailto=mailto,
                    )
                )
                if resolved_author_id and not collaborator.openalex_author_id:
                    collaborator.openalex_author_id = resolved_author_id
                    field_updates["openalex_author_id"] += 1
                    changed = True

            if not collaborator.orcid_id and fallback_profile.get("orcid_id"):
                collaborator.orcid_id = str(fallback_profile["orcid_id"]).strip()
                field_updates["orcid_id"] += 1
                changed = True
            if (
                not collaborator.primary_institution
                and fallback_profile.get("primary_institution")
            ):
                collaborator.primary_institution = str(
                    fallback_profile["primary_institution"]
                ).strip()
                field_updates["primary_institution"] += 1
                changed = True
            if not collaborator.country and fallback_profile.get("country"):
                collaborator.country = str(fallback_profile["country"]).strip()
                field_updates["country"] += 1
                changed = True
            if (
                len(list(collaborator.research_domains or [])) == 0
                and isinstance(fallback_profile.get("research_domains"), list)
                and fallback_profile["research_domains"]
            ):
                collaborator.research_domains = _normalize_domains(
                    fallback_profile["research_domains"]
                )
                if collaborator.research_domains:
                    field_updates["research_domains"] += 1
                    changed = True

            if not resolved_author_id and collaborator.orcid_id:
                resolved_author_id = _normalize_openalex_author_id(
                    _resolve_openalex_author_id(
                        orcid_id=collaborator.orcid_id,
                        mailto=mailto,
                    )
                )
                if resolved_author_id and not collaborator.openalex_author_id:
                    collaborator.openalex_author_id = resolved_author_id
                    field_updates["openalex_author_id"] += 1
                    changed = True

            if not resolved_author_id:
                skipped_without_identifier += 1
                if changed:
                    updated_count += 1
                else:
                    unchanged_count += 1
                continue

            resolved_author_count += 1
            profile = _fetch_openalex_author_profile(
                openalex_author_id=resolved_author_id,
                mailto=mailto,
            )
            if not profile:
                failed_count += 1
                if changed:
                    updated_count += 1
                else:
                    unchanged_count += 1
                continue

            canonical_author_id = _normalize_openalex_author_id(
                str(profile.get("openalex_author_id") or "").strip()
            )
            if not collaborator.openalex_author_id and canonical_author_id:
                collaborator.openalex_author_id = canonical_author_id
                field_updates["openalex_author_id"] += 1
                changed = True
            if not collaborator.orcid_id and profile.get("orcid_id"):
                collaborator.orcid_id = str(profile["orcid_id"]).strip()
                field_updates["orcid_id"] += 1
                changed = True
            if not collaborator.primary_institution and profile.get("primary_institution"):
                collaborator.primary_institution = str(profile["primary_institution"]).strip()
                field_updates["primary_institution"] += 1
                changed = True
            if not collaborator.country and profile.get("country"):
                collaborator.country = str(profile["country"]).strip()
                field_updates["country"] += 1
                changed = True
            if (
                len(list(collaborator.research_domains or [])) == 0
                and isinstance(profile.get("research_domains"), list)
                and profile["research_domains"]
            ):
                collaborator.research_domains = _normalize_domains(
                    profile.get("research_domains") or []
                )
                if collaborator.research_domains:
                    field_updates["research_domains"] += 1
                    changed = True

            if changed:
                updated_count += 1
            else:
                unchanged_count += 1
            time.sleep(0.08)

        session.flush()

    enqueued = False
    if updated_count > 0:
        enqueued = enqueue_collaboration_metrics_recompute(
            user_id=user_id,
            force=True,
            reason="openalex_enrichment",
        )
    return {
        "targeted_count": len(target_rows),
        "resolved_author_count": resolved_author_count,
        "updated_count": updated_count,
        "unchanged_count": unchanged_count,
        "skipped_without_identifier": skipped_without_identifier,
        "failed_count": failed_count,
        "enqueued_metrics_recompute": enqueued,
        "field_updates": dict(field_updates),
    }


def get_manuscript_author_suggestions(
    *,
    user_id: str,
    query: str = "",
    limit: int = 50,
) -> dict[str, Any]:
    listing = list_collaborators_for_user(
        user_id=user_id,
        query=query,
        sort="strength",
        page=1,
        page_size=max(1, min(limit, 200)),
    )
    items = listing.get("items", [])
    suggestions = [
        {
            "collaborator_id": item["id"],
            "full_name": item["full_name"],
            "preferred_name": item.get("preferred_name"),
            "orcid_id": item.get("orcid_id"),
            "institution": item.get("primary_institution"),
            "classification": (
                item.get("metrics", {}).get("classification")
                if isinstance(item.get("metrics"), dict)
                else CLASSIFICATION_UNCLASSIFIED
            ),
            "collaboration_strength_score": (
                float(item.get("metrics", {}).get("collaboration_strength_score") or 0.0)
                if isinstance(item.get("metrics"), dict)
                else 0.0
            ),
        }
        for item in items
    ]
    return {"items": suggestions}


def _normalize_keyword_list(values: list[str] | None) -> list[str]:
    if not isinstance(values, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in values:
        token = re.sub(r"\s+", " ", str(raw or "").strip().lower())
        if not token:
            continue
        if token in seen:
            continue
        seen.add(token)
        normalized.append(token[:80])
    return normalized[:20]


def _parse_roles(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    parsed: list[str] = []
    seen: set[str] = set()
    for raw in values:
        role = re.sub(r"\s+", " ", str(raw or "").strip())
        if not role:
            continue
        key = role.lower()
        if key in seen:
            continue
        seen.add(key)
        parsed.append(role[:80])
    return parsed[:8]


def generate_collaboration_ai_insights_draft(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
    summary = get_collaboration_metrics_summary(user_id=user_id)
    listing = list_collaborators_for_user(
        user_id=user_id,
        sort="strength",
        page=1,
        page_size=200,
    )
    items = list(listing.get("items") or [])
    now_year = _utcnow().year

    domain_counter: defaultdict[str, int] = defaultdict(int)
    active_last_24m = 0
    for item in items:
        metrics = item.get("metrics") if isinstance(item.get("metrics"), dict) else {}
        last_year = _safe_int(metrics.get("last_collaboration_year"))
        if last_year is not None and last_year >= now_year - 1:
            active_last_24m += 1
        for domain in item.get("research_domains") or []:
            text = str(domain or "").strip()
            if text:
                domain_counter[text] += 1

    dominant_domain = None
    if domain_counter:
        dominant_domain = sorted(
            domain_counter.items(),
            key=lambda row: (-row[1], row[0].lower()),
        )[0]

    top_three = items[:3]
    insights: list[str] = []
    if int(summary.get("total_collaborators") or 0) == 0:
        insights.append(
            "No collaborator records yet. Import from publications to bootstrap the graph."
        )
    else:
        insights.append(
            (
                f"{int(summary.get('core_collaborators') or 0)} core collaborators out of "
                f"{int(summary.get('total_collaborators') or 0)} total records."
            )
        )
        insights.append(
            f"{active_last_24m} collaborators show activity in the last 24 months."
        )
        if dominant_domain is not None:
            insights.append(
                f"Most represented domain is {dominant_domain[0]} ({dominant_domain[1]} collaborators)."
            )
        if top_three:
            names = ", ".join(str(item.get("full_name") or "").strip() for item in top_three if item.get("full_name"))
            if names:
                insights.append(f"Current strongest collaboration cluster: {names}.")

    actions: list[str] = []
    if int(summary.get("core_collaborators") or 0) < 3:
        actions.append(
            "Stabilise recurring collaborations by planning one near-term project with your top two partners."
        )
    if active_last_24m < max(2, int(summary.get("total_collaborators") or 0) // 3):
        actions.append(
            "Re-activate historic collaborations with a short outreach cycle and co-authorship opportunities."
        )
    if dominant_domain is not None and dominant_domain[1] >= 4:
        actions.append(
            f"Balance portfolio by adding collaborators outside {dominant_domain[0]} for topic breadth."
        )
    if not actions:
        actions.append(
            "Maintain cadence with existing collaborators and review domain balance quarterly."
        )

    return {
        "status": "draft",
        "insights": insights[:6],
        "suggested_actions": actions[:5],
        "provenance": {
            "source": "collaborator_db",
            "generated_at": _utcnow(),
            "formula_version": FORMULA_VERSION,
            "collaborator_ids": [str(item.get("id")) for item in items[:20]],
        },
    }


def suggest_collaborators_for_manuscript_draft(
    *,
    user_id: str,
    topic_keywords: list[str] | None = None,
    methods: list[str] | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)

    keywords = _normalize_keyword_list(topic_keywords)
    methods_normalized = _normalize_keyword_list(methods)
    listing = list_collaborators_for_user(
        user_id=user_id,
        sort="strength",
        page=1,
        page_size=200,
    )
    items = list(listing.get("items") or [])
    limit = max(1, min(int(limit or 5), 20))
    now_year = _utcnow().year

    ranked: list[dict[str, Any]] = []
    for item in items:
        metrics = item.get("metrics") if isinstance(item.get("metrics"), dict) else {}
        domains = [str(value or "").strip().lower() for value in item.get("research_domains") or []]
        strength = min(
            1.0,
            max(
                0.0,
                float(metrics.get("collaboration_strength_score") or 0.0),
            ),
        )
        last_year = _safe_int(metrics.get("last_collaboration_year"))
        recency = 0.0
        if last_year is not None:
            if last_year >= now_year - 1:
                recency = 1.0
            elif last_year >= now_year - 2:
                recency = 0.7
            elif last_year >= now_year - 4:
                recency = 0.4

        keyword_hits = 0
        matched_keywords: list[str] = []
        for keyword in keywords:
            if any(keyword in domain or domain in keyword for domain in domains):
                keyword_hits += 1
                matched_keywords.append(keyword)
        method_hits = 0
        matched_methods: list[str] = []
        for method in methods_normalized:
            if any(method in domain or domain in method for domain in domains):
                method_hits += 1
                matched_methods.append(method)

        topic_match = (
            keyword_hits / len(keywords)
            if keywords
            else 0.0
        )
        method_match = (
            method_hits / len(methods_normalized)
            if methods_normalized
            else 0.0
        )
        domain_fit = min(1.0, 0.75 * topic_match + 0.25 * method_match)
        score = round((0.5 * strength) + (0.35 * domain_fit) + (0.15 * recency), 4)

        rationale_parts: list[str] = []
        if matched_keywords:
            rationale_parts.append(f"keyword match: {', '.join(matched_keywords[:3])}")
        if matched_methods:
            rationale_parts.append(f"method match: {', '.join(matched_methods[:3])}")
        if recency >= 0.7:
            rationale_parts.append("recent collaboration signal")
        if strength >= 0.7:
            rationale_parts.append("high collaboration strength")
        explanation = "; ".join(rationale_parts) or "ranked by prior collaboration strength"

        ranked.append(
            {
                "collaborator_id": str(item.get("id")),
                "full_name": str(item.get("full_name") or "").strip(),
                "institution": str(item.get("primary_institution") or "").strip() or None,
                "orcid_id": item.get("orcid_id"),
                "classification": (
                    metrics.get("classification")
                    if isinstance(metrics.get("classification"), str)
                    else CLASSIFICATION_UNCLASSIFIED
                ),
                "score": score,
                "explanation": explanation,
                "matched_keywords": matched_keywords[:5],
                "matched_methods": matched_methods[:5],
            }
        )

    ranked.sort(key=lambda row: (-float(row.get("score") or 0.0), str(row.get("full_name") or "").lower()))
    if not keywords and not methods_normalized:
        ranked = ranked[:limit]
    else:
        positive = [item for item in ranked if float(item.get("score") or 0.0) > 0.1]
        ranked = (positive or ranked)[:limit]

    return {
        "status": "draft",
        "topic_keywords": keywords,
        "methods": methods_normalized,
        "suggestions": ranked,
        "provenance": {
            "source": "collaborator_db",
            "generated_at": _utcnow(),
            "formula_version": "collab_author_suggestions_v1",
        },
    }


def draft_contribution_statement(
    *,
    user_id: str,
    authors: list[dict[str, Any]],
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
    if not isinstance(authors, list) or not authors:
        raise CollaborationValidationError("At least one author is required for contribution draft.")

    lines: list[str] = []
    roles_payload: list[dict[str, Any]] = []
    equal_names: list[str] = []
    corresponding_names: list[str] = []

    for item in authors:
        if not isinstance(item, dict):
            continue
        full_name = _normalize_name(str(item.get("full_name") or ""))
        roles = _parse_roles(item.get("roles"))
        is_corresponding = bool(item.get("is_corresponding"))
        equal_contribution = bool(item.get("equal_contribution"))
        is_external = bool(item.get("is_external"))

        if not roles:
            inferred: list[str] = []
            if is_external:
                inferred.append("Investigation")
            if is_corresponding:
                inferred.extend(["Supervision", "Writing - review & editing"])
            if not inferred:
                inferred.extend(["Conceptualization", "Writing - original draft"])
            roles = inferred

        if equal_contribution:
            equal_names.append(full_name)
        if is_corresponding:
            corresponding_names.append(full_name)

        lines.append(f"{full_name}: {', '.join(roles)}.")
        roles_payload.append(
            {
                "full_name": full_name,
                "roles": roles,
                "is_corresponding": is_corresponding,
                "equal_contribution": equal_contribution,
                "is_external": is_external,
            }
        )

    if not lines:
        raise CollaborationValidationError("At least one valid author is required for contribution draft.")

    if equal_names:
        lines.append(
            f"Equal contribution: {', '.join(equal_names)}."
        )
    if corresponding_names:
        lines.append(
            f"Corresponding author(s): {', '.join(corresponding_names)}."
        )

    return {
        "status": "draft",
        "credit_statements": roles_payload,
        "draft_text": "\n".join(lines).strip(),
        "provenance": {
            "source": "collaborator_db",
            "generated_at": _utcnow(),
        },
    }


def normalize_affiliations_and_coi_draft(
    *,
    user_id: str,
    authors: list[dict[str, Any]],
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
    if not isinstance(authors, list) or not authors:
        raise CollaborationValidationError("At least one author is required for affiliation normalisation.")

    normalized_authors: list[dict[str, Any]] = []
    institution_map: dict[str, int] = {}

    for item in authors:
        if not isinstance(item, dict):
            continue
        full_name = _normalize_name(str(item.get("full_name") or ""))
        institution = re.sub(r"\s+", " ", str(item.get("institution") or "").strip())
        institution_clean = institution or "Institution not provided"
        if institution_clean not in institution_map:
            institution_map[institution_clean] = len(institution_map) + 1
        superscript = institution_map[institution_clean]
        normalized_authors.append(
            {
                "full_name": full_name,
                "orcid_id": validate_orcid_id(item.get("orcid_id")),
                "institution": institution_clean,
                "superscript_number": superscript,
            }
        )

    if not normalized_authors:
        raise CollaborationValidationError("At least one valid author is required for affiliation normalisation.")

    affiliations = [
        {
            "superscript_number": number,
            "institution_name": institution,
        }
        for institution, number in sorted(
            institution_map.items(),
            key=lambda row: row[1],
        )
    ]
    author_tokens = [
        f"{item['full_name']}{int(item['superscript_number'])}"
        for item in normalized_authors
    ]
    affiliation_lines = [
        f"{int(item['superscript_number'])}. {str(item['institution_name'])}"
        for item in affiliations
    ]
    affiliations_block = ", ".join(author_tokens)
    if affiliation_lines:
        affiliations_block = f"{affiliations_block}\n\n" + "\n".join(affiliation_lines)

    return {
        "status": "draft",
        "normalized_authors": normalized_authors,
        "affiliations": affiliations,
        "affiliations_block": affiliations_block.strip(),
        "coi_boilerplate": (
            "Draft: The authors declare no competing interests. "
            "Please review and edit before submission."
        ),
        "provenance": {
            "source": "collaborator_db",
            "generated_at": _utcnow(),
        },
    }


def _render_authors_block(*, authors: list[dict[str, Any]], affiliations: list[dict[str, Any]]) -> str:
    superscript_by_institution = {
        str(item.get("institution_name") or "").strip(): int(item.get("superscript_number") or 0)
        for item in affiliations
        if str(item.get("institution_name") or "").strip()
    }
    author_tokens: list[str] = []
    corresponding_names: list[str] = []
    for author in authors:
        name = str(author.get("full_name") or "").strip()
        if not name:
            continue
        institution = str(author.get("institution") or "").strip()
        superscript = superscript_by_institution.get(institution)
        suffix = ""
        if superscript and superscript > 0:
            suffix += str(superscript)
        if bool(author.get("equal_contribution")):
            suffix += "†"
        if bool(author.get("is_corresponding")):
            suffix += "*"
            corresponding_names.append(name)
        author_tokens.append(f"{name}{suffix}" if suffix else name)

    affiliation_lines = [
        f"{int(item.get('superscript_number') or 0)}. {str(item.get('institution_name') or '').strip()}"
        for item in affiliations
    ]
    lines = [", ".join(author_tokens).strip()]
    if affiliation_lines:
        lines.append("")
        lines.extend(affiliation_lines)
    if corresponding_names:
        lines.append("")
        lines.append(f"Corresponding author: {', '.join(corresponding_names)}")
    return "\n".join(line for line in lines if line is not None).strip()


def save_manuscript_authors(
    *,
    user_id: str,
    workspace_id: str,
    authors: list[dict[str, Any]],
    affiliations: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    create_all_tables()
    if not isinstance(authors, list) or not authors:
        raise CollaborationValidationError("At least one author is required.")
    normalized_authors: list[dict[str, Any]] = []
    for index, author in enumerate(authors, start=1):
        if not isinstance(author, dict):
            continue
        full_name = _normalize_name(str(author.get("full_name") or ""))
        normalized_authors.append(
            {
                "author_order": index,
                "collaborator_id": str(author.get("collaborator_id") or "").strip() or None,
                "full_name": full_name,
                "orcid_id": validate_orcid_id(author.get("orcid_id")),
                "institution": (
                    re.sub(r"\s+", " ", str(author.get("institution") or "").strip()) or None
                ),
                "is_corresponding": bool(author.get("is_corresponding")),
                "equal_contribution": bool(author.get("equal_contribution")),
                "is_external": bool(author.get("is_external")),
            }
        )
    if not normalized_authors:
        raise CollaborationValidationError("At least one valid author is required.")

    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        manuscript = session.get(Manuscript, workspace_id)
        if manuscript is None:
            raise CollaborationNotFoundError(f"Workspace '{workspace_id}' was not found.")

        session.execute(
            delete(ManuscriptAuthor).where(
                ManuscriptAuthor.owner_user_id == user_id,
                ManuscriptAuthor.manuscript_id == workspace_id,
            )
        )
        session.execute(
            delete(ManuscriptAffiliation).where(
                ManuscriptAffiliation.owner_user_id == user_id,
                ManuscriptAffiliation.manuscript_id == workspace_id,
            )
        )

        affiliation_rows: list[dict[str, Any]] = []
        if isinstance(affiliations, list) and affiliations:
            used_numbers: set[int] = set()
            for raw in affiliations:
                if not isinstance(raw, dict):
                    continue
                institution_name = (
                    re.sub(r"\s+", " ", str(raw.get("institution_name") or "").strip()) or None
                )
                if not institution_name:
                    continue
                superscript_number = _safe_int(raw.get("superscript_number")) or 0
                if superscript_number <= 0:
                    superscript_number = len(used_numbers) + 1
                while superscript_number in used_numbers:
                    superscript_number += 1
                used_numbers.add(superscript_number)
                affiliation_rows.append(
                    {
                        "institution_name": institution_name,
                        "department": (
                            re.sub(r"\s+", " ", str(raw.get("department") or "").strip()) or None
                        ),
                        "city": re.sub(r"\s+", " ", str(raw.get("city") or "").strip()) or None,
                        "country": (
                            re.sub(r"\s+", " ", str(raw.get("country") or "").strip()) or None
                        ),
                        "superscript_number": superscript_number,
                    }
                )
        else:
            dedup: dict[str, int] = {}
            for author in normalized_authors:
                institution = str(author.get("institution") or "").strip()
                if not institution:
                    continue
                if institution in dedup:
                    continue
                dedup[institution] = len(dedup) + 1
            affiliation_rows = [
                {
                    "institution_name": institution,
                    "department": None,
                    "city": None,
                    "country": None,
                    "superscript_number": superscript,
                }
                for institution, superscript in dedup.items()
            ]

        collaborator_ids = [
            item["collaborator_id"] for item in normalized_authors if item.get("collaborator_id")
        ]
        collaborator_rows = session.scalars(
            select(Collaborator).where(
                Collaborator.owner_user_id == user_id,
                Collaborator.id.in_(collaborator_ids or [""]),
            )
        ).all()
        collaborator_by_id = {str(item.id): item for item in collaborator_rows}

        persisted_authors: list[dict[str, Any]] = []
        for item in normalized_authors:
            collaborator_id = item.get("collaborator_id")
            collaborator = (
                collaborator_by_id.get(collaborator_id) if isinstance(collaborator_id, str) else None
            )
            author_row = ManuscriptAuthor(
                manuscript_id=workspace_id,
                owner_user_id=user_id,
                collaborator_id=collaborator.id if collaborator is not None else None,
                full_name=item["full_name"],
                orcid_id=item["orcid_id"],
                institution=item["institution"],
                author_order=int(item["author_order"]),
                is_corresponding=bool(item["is_corresponding"]),
                equal_contribution=bool(item["equal_contribution"]),
                is_external=bool(item["is_external"]),
            )
            session.add(author_row)
            persisted_authors.append(
                {
                    "author_order": int(item["author_order"]),
                    "collaborator_id": collaborator_id,
                    "full_name": item["full_name"],
                    "orcid_id": item["orcid_id"],
                    "institution": item["institution"],
                    "is_corresponding": bool(item["is_corresponding"]),
                    "equal_contribution": bool(item["equal_contribution"]),
                    "is_external": bool(item["is_external"]),
                }
            )

        persisted_affiliations: list[dict[str, Any]] = []
        for item in sorted(
            affiliation_rows,
            key=lambda row: int(row.get("superscript_number") or 0),
        ):
            row = ManuscriptAffiliation(
                manuscript_id=workspace_id,
                owner_user_id=user_id,
                institution_name=str(item.get("institution_name") or "").strip(),
                department=item.get("department"),
                city=item.get("city"),
                country=item.get("country"),
                superscript_number=int(item.get("superscript_number") or 0),
            )
            session.add(row)
            persisted_affiliations.append(
                {
                    "institution_name": row.institution_name,
                    "department": row.department,
                    "city": row.city,
                    "country": row.country,
                    "superscript_number": row.superscript_number,
                }
            )
        session.flush()

    rendered = _render_authors_block(
        authors=persisted_authors,
        affiliations=persisted_affiliations,
    )
    return {
        "workspace_id": workspace_id,
        "authors": persisted_authors,
        "affiliations": persisted_affiliations,
        "rendered_authors_block": rendered,
    }


def get_manuscript_authors(*, user_id: str, workspace_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        manuscript = session.get(Manuscript, workspace_id)
        if manuscript is None:
            raise CollaborationNotFoundError(f"Workspace '{workspace_id}' was not found.")
        author_rows = session.scalars(
            select(ManuscriptAuthor).where(
                ManuscriptAuthor.owner_user_id == user_id,
                ManuscriptAuthor.manuscript_id == workspace_id,
            ).order_by(ManuscriptAuthor.author_order.asc())
        ).all()
        affiliation_rows = session.scalars(
            select(ManuscriptAffiliation).where(
                ManuscriptAffiliation.owner_user_id == user_id,
                ManuscriptAffiliation.manuscript_id == workspace_id,
            ).order_by(ManuscriptAffiliation.superscript_number.asc())
        ).all()
        authors = [
            {
                "author_order": int(row.author_order or 0),
                "collaborator_id": str(row.collaborator_id) if row.collaborator_id else None,
                "full_name": row.full_name,
                "orcid_id": row.orcid_id,
                "institution": row.institution,
                "is_corresponding": bool(row.is_corresponding),
                "equal_contribution": bool(row.equal_contribution),
                "is_external": bool(row.is_external),
            }
            for row in author_rows
        ]
        affiliations = [
            {
                "institution_name": row.institution_name,
                "department": row.department,
                "city": row.city,
                "country": row.country,
                "superscript_number": int(row.superscript_number or 0),
            }
            for row in affiliation_rows
        ]
    rendered = _render_authors_block(authors=authors, affiliations=affiliations)
    return {
        "workspace_id": workspace_id,
        "authors": authors,
        "affiliations": affiliations,
        "rendered_authors_block": rendered,
    }


def _try_acquire_scheduler_leader(now: datetime) -> bool:
    lease_seconds = max(300, min(_schedule_hours() * 3600, 3600))
    lease_expires = now + timedelta(seconds=lease_seconds)
    create_all_tables()
    with session_scope() as session:
        row = session.scalars(
            select(AppRuntimeLock).where(AppRuntimeLock.lock_name == SCHEDULER_LOCK_NAME).with_for_update()
        ).first()
        if row is None:
            session.add(
                AppRuntimeLock(
                    lock_name=SCHEDULER_LOCK_NAME,
                    owner_id=_INSTANCE_ID,
                    lease_expires_at=lease_expires,
                )
            )
            session.flush()
            return True
        if _coerce_utc(row.lease_expires_at) <= now or str(row.owner_id or "") == _INSTANCE_ID:
            row.owner_id = _INSTANCE_ID
            row.lease_expires_at = lease_expires
            session.flush()
            return True
        return False


def run_collaboration_metrics_scheduler_tick() -> int:
    now = _utcnow()
    if not _try_acquire_scheduler_leader(now):
        return 0
    with session_scope() as session:
        user_ids = [str(item) for item in session.scalars(
            select(Collaborator.owner_user_id).distinct()
        ).all()]
    enqueued = 0
    for user_id in user_ids:
        with session_scope() as session:
            collaborators, metric_rows = _collaborator_rows_with_metrics(
                session,
                user_id=user_id,
                for_update=False,
            )
            stale = _is_stale(collaborators=collaborators, metric_rows=metric_rows, now=now)
            running = _is_running(metric_rows)
        if stale and not running:
            if enqueue_collaboration_metrics_recompute(
                user_id=user_id,
                reason="scheduled_due",
            ):
                enqueued += 1
    return enqueued


def start_collaboration_metrics_scheduler() -> None:
    global _scheduler
    if BackgroundScheduler is None:
        logger.warning("collaboration_scheduler_unavailable")
        return
    with _scheduler_lock:
        if _scheduler is not None:
            return
        create_all_tables()
        scheduler = BackgroundScheduler(timezone="UTC")
        scheduler.add_job(
            run_collaboration_metrics_scheduler_tick,
            trigger="interval",
            hours=_schedule_hours(),
            id="collaboration-metrics-sweep",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=_utcnow() + timedelta(seconds=60),
        )
        scheduler.start()
        _scheduler = scheduler


def stop_collaboration_metrics_scheduler() -> None:
    global _scheduler
    with _scheduler_lock:
        if _scheduler is not None:
            _scheduler.shutdown(wait=False)
            _scheduler = None
    _shutdown_executor()

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from research_os.db import (
    PersonaSyncJob,
    User,
    create_all_tables,
    get_session_factory,
)
from research_os.services.orcid_service import import_orcid_works
from research_os.services.persona_service import sync_metrics
from research_os.services.publications_analytics_service import (
    get_publications_analytics_summary,
)


class PersonaSyncJobNotFoundError(RuntimeError):
    """Raised when a persona sync job cannot be located."""


class PersonaSyncJobConflictError(RuntimeError):
    """Raised when a conflicting persona sync job already exists."""


class PersonaSyncJobValidationError(RuntimeError):
    """Raised when a persona sync request is invalid."""


_ACTIVE_STATUSES = ("queued", "running")
_ALLOWED_JOB_TYPES = {"orcid_import", "metrics_sync", "analytics_refresh"}
_ALLOWED_PROVIDERS = {"openalex", "semantic_scholar", "manual"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_providers(
    providers: list[str] | None, *, default: list[str] | None = None
) -> list[str]:
    source = providers if providers is not None else (default or [])
    normalized: list[str] = []
    seen: set[str] = set()
    for item in source:
        clean = str(item or "").strip().lower()
        if not clean:
            continue
        if clean == "semanticscholar":
            clean = "semantic_scholar"
        if clean not in _ALLOWED_PROVIDERS:
            continue
        if clean in seen:
            continue
        seen.add(clean)
        normalized.append(clean)
    return normalized


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime):
        return _coerce_utc(value).isoformat() if _coerce_utc(value) else None
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise PersonaSyncJobNotFoundError(f"User '{user_id}' was not found.")
    return user


def serialize_persona_sync_job(job: PersonaSyncJob) -> dict[str, Any]:
    return {
        "id": str(job.id),
        "user_id": str(job.user_id),
        "job_type": str(job.job_type),
        "status": str(job.status),
        "overwrite_user_metadata": bool(job.overwrite_user_metadata),
        "run_metrics_sync": bool(job.run_metrics_sync),
        "refresh_analytics": bool(job.refresh_analytics),
        "refresh_metrics": bool(job.refresh_metrics),
        "providers": list(job.providers or []),
        "progress_percent": int(job.progress_percent or 0),
        "current_stage": job.current_stage,
        "result_json": _json_safe(dict(job.result_json or {})),
        "error_detail": job.error_detail,
        "started_at": _coerce_utc(job.started_at),
        "completed_at": _coerce_utc(job.completed_at),
        "created_at": _coerce_utc(job.created_at),
        "updated_at": _coerce_utc(job.updated_at),
    }


def _mark_job_failed(job: PersonaSyncJob, detail: str) -> None:
    job.status = "failed"
    job.error_detail = detail
    job.current_stage = None
    job.progress_percent = 100
    job.completed_at = _utcnow()


def _set_stage(job: PersonaSyncJob, *, stage: str, progress: int) -> None:
    job.current_stage = stage
    job.progress_percent = max(0, min(100, int(progress)))


def _run_persona_sync_job(job_id: str) -> None:
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        job = session.get(PersonaSyncJob, job_id)
        if job is None:
            return
        if job.status != "queued":
            return
        if job.job_type not in _ALLOWED_JOB_TYPES:
            _mark_job_failed(job, f"Unsupported job type '{job.job_type}'.")
            session.commit()
            return

        job.status = "running"
        job.error_detail = None
        job.started_at = _utcnow()
        job.completed_at = None
        _set_stage(job, stage="initialising", progress=5)
        session.commit()

        result_payload: dict[str, Any] = {}
        user_id = str(job.user_id)
        providers = _normalize_providers(list(job.providers or []))

        if job.job_type == "orcid_import":
            _set_stage(job, stage="importing_orcid", progress=25)
            session.commit()
            import_payload = import_orcid_works(
                user_id=user_id,
                overwrite_user_metadata=bool(job.overwrite_user_metadata),
            )
            result_payload["orcid_import"] = _json_safe(import_payload)

            if job.run_metrics_sync and providers:
                _set_stage(job, stage="syncing_metrics", progress=70)
                session.commit()
                metrics_payload = sync_metrics(user_id=user_id, providers=providers)
                result_payload["metrics_sync"] = _json_safe(metrics_payload)

        elif job.job_type == "metrics_sync":
            if not providers:
                providers = ["openalex"]
            _set_stage(job, stage="syncing_metrics", progress=70)
            session.commit()
            metrics_payload = sync_metrics(user_id=user_id, providers=providers)
            result_payload["metrics_sync"] = _json_safe(metrics_payload)

        if bool(job.refresh_analytics):
            _set_stage(job, stage="refreshing_analytics", progress=90)
            session.commit()
            summary_payload = get_publications_analytics_summary(
                user_id=user_id,
                refresh=True,
                refresh_metrics=bool(job.refresh_metrics),
            )
            result_payload["analytics_summary"] = _json_safe(summary_payload)

        job.status = "completed"
        job.error_detail = None
        job.current_stage = None
        job.progress_percent = 100
        job.completed_at = _utcnow()
        job.result_json = _json_safe(result_payload)
        session.commit()
    except Exception as exc:
        session.rollback()
        job = session.get(PersonaSyncJob, job_id)
        if job is not None:
            _mark_job_failed(job, str(exc))
            session.commit()
    finally:
        session.close()


def _start_persona_sync_thread(job_id: str) -> None:
    thread = threading.Thread(
        target=_run_persona_sync_job,
        args=(job_id,),
        daemon=True,
        name=f"persona-sync-job-{job_id[:8]}",
    )
    thread.start()


def enqueue_persona_sync_job(
    *,
    user_id: str,
    job_type: str,
    overwrite_user_metadata: bool = False,
    run_metrics_sync: bool = False,
    providers: list[str] | None = None,
    refresh_analytics: bool = True,
    refresh_metrics: bool = False,
) -> PersonaSyncJob:
    create_all_tables()
    normalized_job_type = str(job_type or "").strip().lower()
    if normalized_job_type not in _ALLOWED_JOB_TYPES:
        raise PersonaSyncJobValidationError(
            f"Unsupported job_type '{job_type}'. Expected one of: "
            + ", ".join(sorted(_ALLOWED_JOB_TYPES))
        )
    normalized_providers = _normalize_providers(providers)
    if normalized_job_type == "metrics_sync" and not normalized_providers:
        normalized_providers = ["openalex"]

    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        _resolve_user_or_raise(session, user_id)
        active = session.scalars(
            select(PersonaSyncJob).where(
                PersonaSyncJob.user_id == user_id,
                PersonaSyncJob.status.in_(_ACTIVE_STATUSES),
            )
        ).first()
        if active is not None:
            raise PersonaSyncJobConflictError(
                (
                    "Another persona sync job is already active "
                    f"(job_id={active.id}, status={active.status})."
                )
            )

        job = PersonaSyncJob(
            user_id=user_id,
            job_type=normalized_job_type,
            status="queued",
            overwrite_user_metadata=bool(overwrite_user_metadata),
            run_metrics_sync=bool(run_metrics_sync),
            refresh_analytics=bool(refresh_analytics),
            refresh_metrics=bool(refresh_metrics),
            providers=normalized_providers,
            progress_percent=0,
            current_stage="queued",
            result_json={},
        )
        session.add(job)
        session.commit()
        session.refresh(job)
        session.expunge(job)
    finally:
        session.close()

    _start_persona_sync_thread(job.id)
    return job


def get_persona_sync_job(*, user_id: str, job_id: str) -> PersonaSyncJob:
    create_all_tables()
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        _resolve_user_or_raise(session, user_id)
        job = session.get(PersonaSyncJob, job_id)
        if job is None or str(job.user_id) != str(user_id):
            raise PersonaSyncJobNotFoundError(
                f"Persona sync job '{job_id}' was not found."
            )
        session.expunge(job)
        return job
    finally:
        session.close()


def list_persona_sync_jobs(*, user_id: str, limit: int = 20) -> list[PersonaSyncJob]:
    create_all_tables()
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        _resolve_user_or_raise(session, user_id)
        normalized_limit = max(1, min(int(limit), 100))
        jobs = session.scalars(
            select(PersonaSyncJob)
            .where(PersonaSyncJob.user_id == user_id)
            .order_by(PersonaSyncJob.created_at.desc())
            .limit(normalized_limit)
        ).all()
        for job in jobs:
            session.expunge(job)
        return jobs
    finally:
        session.close()

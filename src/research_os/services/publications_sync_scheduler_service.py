from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from research_os.db import AppRuntimeLock, User, create_all_tables, session_scope
from research_os.services.persona_sync_job_service import (
    PersonaSyncJobConflictError,
    PersonaSyncJobNotFoundError,
    PersonaSyncJobValidationError,
    enqueue_persona_sync_job,
)

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except Exception:  # pragma: no cover
    BackgroundScheduler = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)

SCHEDULER_LOCK_NAME = "publications_auto_sync_scheduler"
_scheduler_lock = threading.Lock()
_scheduler: Any = None
_INSTANCE_ID = f"pub-auto-sync-{uuid4().hex[:12]}"
_AUTO_SYNC_PROVIDERS = ["openalex", "semantic_scholar"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        clean = value.strip()
        if not clean:
            return None
        try:
            return int(clean)
        except Exception:
            return None
    return None


def _auto_sync_enabled() -> bool:
    return str(
        os.getenv("PUBLICATIONS_AUTO_SYNC_ENABLED", "true")
    ).strip().lower() in {"1", "true", "yes", "on"}


def _auto_sync_interval_hours() -> int:
    value = _safe_int(os.getenv("PUBLICATIONS_AUTO_SYNC_INTERVAL_HOURS", "168"))
    return max(6, min(24 * 90, value if value is not None else 168))


def _scheduler_sweep_minutes() -> int:
    value = _safe_int(os.getenv("PUBLICATIONS_AUTO_SYNC_SWEEP_MINUTES", "60"))
    return max(5, min(360, value if value is not None else 60))


def _try_acquire_scheduler_leader(now: datetime) -> bool:
    lease_seconds = max(300, min(_scheduler_sweep_minutes() * 60, 3600))
    lease_expires = now + timedelta(seconds=lease_seconds)
    create_all_tables()
    with session_scope() as session:
        row = session.scalars(
            select(AppRuntimeLock)
            .where(AppRuntimeLock.lock_name == SCHEDULER_LOCK_NAME)
            .with_for_update()
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
        if (
            _coerce_utc(row.lease_expires_at) <= now
            or str(row.owner_id or "") == _INSTANCE_ID
        ):
            row.owner_id = _INSTANCE_ID
            row.lease_expires_at = lease_expires
            session.flush()
            return True
        return False


def _enqueue_import_job_for_user(
    *, user_id: str, openalex_author_id: str, reason: str
) -> tuple[str, str | None]:
    clean_author_id = str(openalex_author_id or "").strip()
    if not clean_author_id:
        return "failed", "OpenAlex author ID is required."
    try:
        job = enqueue_persona_sync_job(
            user_id=user_id,
            job_type="openalex_import",
            overwrite_user_metadata=False,
            run_metrics_sync=True,
            providers=_AUTO_SYNC_PROVIDERS,
            refresh_analytics=True,
            refresh_metrics=False,
            openalex_author_id=clean_author_id,
        )
        logger.info(
            "publications_auto_sync_job_enqueued",
            extra={
                "user_id": user_id,
                "openalex_author_id": clean_author_id,
                "reason": reason,
                "job_id": str(job.id),
            },
        )
        return "enqueued", str(job.id)
    except PersonaSyncJobConflictError:
        return "conflict", None
    except (
        PersonaSyncJobValidationError,
        PersonaSyncJobNotFoundError,
    ) as exc:
        logger.warning(
            "publications_auto_sync_job_failed",
            extra={"user_id": user_id, "reason": reason, "detail": str(exc)},
        )
        return "failed", str(exc)
    except Exception as exc:
        logger.warning(
            "publications_auto_sync_job_failed",
            extra={"user_id": user_id, "reason": reason, "detail": str(exc)},
        )
        return "failed", str(exc)


def _queue_publications_sync_batch(
    *,
    trigger: str,
    only_due: bool,
) -> dict[str, int]:
    now = _utcnow()
    interval_hours = _auto_sync_interval_hours()
    due_threshold = now - timedelta(hours=interval_hours)
    create_all_tables()
    with session_scope() as session:
        user_rows = session.execute(
            select(
                User.id,
                User.is_active,
                User.name,
                User.openalex_author_id,
                User.openalex_integration_approved,
                User.openalex_auto_update_enabled,
                User.orcid_last_synced_at,
            )
        ).all()

    summary: dict[str, int] = {
        "processed_users": 0,
        "enqueued_users": 0,
        "skipped_inactive": 0,
        "skipped_not_approved": 0,
        "skipped_auto_update_disabled": 0,
        "skipped_not_linked": 0,
        "skipped_not_due": 0,
        "conflict_users": 0,
        "failed_users": 0,
        "interval_hours": interval_hours,
    }
    for (
        user_id,
        is_active,
        name,
        openalex_author_id,
        openalex_integration_approved,
        openalex_auto_update_enabled,
        last_synced_at,
    ) in user_rows:
        summary["processed_users"] += 1
        if not bool(is_active):
            summary["skipped_inactive"] += 1
            continue
        if not bool(openalex_integration_approved):
            summary["skipped_not_approved"] += 1
            continue
        if not bool(openalex_auto_update_enabled):
            summary["skipped_auto_update_disabled"] += 1
            continue
        clean_openalex_author_id = str(openalex_author_id or "").strip()
        has_identity = bool(clean_openalex_author_id or str(name or "").strip())
        if not has_identity or not clean_openalex_author_id:
            summary["skipped_not_linked"] += 1
            continue
        last_synced = _coerce_utc(last_synced_at)
        due = last_synced is None or last_synced <= due_threshold
        if only_due and not due:
            summary["skipped_not_due"] += 1
            continue
        status, _ = _enqueue_import_job_for_user(
            user_id=str(user_id),
            openalex_author_id=clean_openalex_author_id,
            reason=f"{trigger}_auto_publications_sync",
        )
        if status == "enqueued":
            summary["enqueued_users"] += 1
        elif status == "conflict":
            summary["conflict_users"] += 1
        else:
            summary["failed_users"] += 1
    return summary


def get_publications_auto_sync_runtime_settings() -> dict[str, object]:
    enabled = _auto_sync_enabled()
    interval_hours = _auto_sync_interval_hours()
    sweep_minutes = _scheduler_sweep_minutes()
    return {
        "enabled": enabled,
        "interval_hours": interval_hours,
        "sweep_minutes": sweep_minutes,
        "scope": "process",
        "persistence": "restart_resets",
        "description": (
            "Automatically queues publication sync jobs for active users who confirmed an OpenAlex profile, approved integration, and enabled auto-update."
        ),
        "note": (
            "Scheduler checks due users periodically and enqueues import jobs. "
            "Changes are process-local and reset on API restart."
        ),
    }


def update_publications_auto_sync_runtime_settings(
    *,
    enabled: bool | None = None,
    interval_hours: int | None = None,
) -> dict[str, object]:
    if enabled is None and interval_hours is None:
        raise ValueError("At least one setting must be provided.")
    if enabled is not None:
        os.environ["PUBLICATIONS_AUTO_SYNC_ENABLED"] = "true" if enabled else "false"
    if interval_hours is not None:
        normalized_interval = max(6, min(24 * 90, int(interval_hours)))
        os.environ["PUBLICATIONS_AUTO_SYNC_INTERVAL_HOURS"] = str(normalized_interval)
    return get_publications_auto_sync_runtime_settings()


def trigger_publications_auto_sync_for_all_users(
    *,
    due_only: bool = False,
) -> dict[str, object]:
    summary = _queue_publications_sync_batch(
        trigger="admin_manual",
        only_due=bool(due_only),
    )
    summary["due_only"] = bool(due_only)
    summary["generated_at"] = _utcnow()
    return summary


def run_publications_auto_sync_scheduler_tick() -> int:
    if not _auto_sync_enabled():
        return 0
    now = _utcnow()
    if not _try_acquire_scheduler_leader(now):
        return 0
    summary = _queue_publications_sync_batch(
        trigger="scheduled",
        only_due=True,
    )
    return int(summary.get("enqueued_users") or 0)


def start_publications_auto_sync_scheduler() -> None:
    global _scheduler
    if BackgroundScheduler is None:
        logger.warning("publications_auto_sync_scheduler_unavailable")
        return
    with _scheduler_lock:
        if _scheduler is not None:
            return
        create_all_tables()
        scheduler = BackgroundScheduler(timezone="UTC")
        scheduler.add_job(
            run_publications_auto_sync_scheduler_tick,
            trigger="interval",
            minutes=_scheduler_sweep_minutes(),
            id="publications-auto-sync-sweep",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=_utcnow() + timedelta(seconds=75),
        )
        scheduler.start()
        _scheduler = scheduler


def stop_publications_auto_sync_scheduler() -> None:
    global _scheduler
    with _scheduler_lock:
        if _scheduler is not None:
            _scheduler.shutdown(wait=False)
            _scheduler = None

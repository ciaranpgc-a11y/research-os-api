from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from research_os.db import AppRuntimeLock, PublicationFile, User, Work, create_all_tables, session_scope
from research_os.services.publication_console_service import (
    FILE_SOURCE_OA_LINK,
    _publication_file_has_local_copy,
    link_publication_open_access_pdf,
)

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except Exception:  # pragma: no cover
    BackgroundScheduler = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)

SCHEDULER_LOCK_NAME = "open_access_auto_sync_scheduler"
_scheduler_lock = threading.Lock()
_attempt_cache_lock = threading.Lock()
_scheduler: Any = None
_INSTANCE_ID = f"oa-auto-sync-{uuid4().hex[:12]}"
_attempt_cache: dict[str, tuple[datetime, str]] = {}


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
        os.getenv("PUBLICATION_OA_AUTO_SYNC_ENABLED", "true")
    ).strip().lower() in {"1", "true", "yes", "on"}


def _sweep_minutes() -> int:
    value = _safe_int(os.getenv("PUBLICATION_OA_AUTO_SYNC_SWEEP_MINUTES", "15"))
    return max(5, min(360, value if value is not None else 15))


def _batch_size() -> int:
    value = _safe_int(os.getenv("PUBLICATION_OA_AUTO_SYNC_BATCH_SIZE", "20"))
    return max(1, min(200, value if value is not None else 20))


def _missing_retry_hours() -> int:
    value = _safe_int(os.getenv("PUBLICATION_OA_AUTO_SYNC_MISSING_RETRY_HOURS", "6"))
    return max(1, min(24 * 30, value if value is not None else 6))


def _error_retry_minutes() -> int:
    value = _safe_int(os.getenv("PUBLICATION_OA_AUTO_SYNC_ERROR_RETRY_MINUTES", "60"))
    return max(5, min(24 * 60, value if value is not None else 60))


def _checking_retry_minutes() -> int:
    value = _safe_int(
        os.getenv("PUBLICATION_OA_AUTO_SYNC_CHECKING_RETRY_MINUTES", "15")
    )
    return max(5, min(24 * 60, value if value is not None else 15))


def _cache_retry_delta(status: str) -> timedelta:
    normalized = str(status or "").strip().lower()
    if normalized == "missing":
        return timedelta(hours=_missing_retry_hours())
    if normalized == "checking":
        return timedelta(minutes=_checking_retry_minutes())
    if normalized == "available":
        return timedelta(days=365 * 20)
    return timedelta(minutes=_error_retry_minutes())


def _mark_attempt(publication_id: str, status: str) -> None:
    clean_publication_id = str(publication_id or "").strip()
    if not clean_publication_id:
        return
    with _attempt_cache_lock:
        _attempt_cache[clean_publication_id] = (_utcnow(), str(status or "").strip().lower())


def _should_attempt(publication_id: str, now: datetime | None = None) -> bool:
    clean_publication_id = str(publication_id or "").strip()
    if not clean_publication_id:
        return False
    current_now = now or _utcnow()
    with _attempt_cache_lock:
        entry = _attempt_cache.get(clean_publication_id)
    if entry is None:
        return True
    attempted_at, status = entry
    attempted_utc = _coerce_utc(attempted_at) or current_now
    return attempted_utc + _cache_retry_delta(status) <= current_now


def _prune_attempt_cache(now: datetime) -> None:
    cutoff = now - timedelta(days=14)
    with _attempt_cache_lock:
        stale_ids = [
            publication_id
            for publication_id, (attempted_at, _status) in _attempt_cache.items()
            if (_coerce_utc(attempted_at) or now) < cutoff
        ]
        for publication_id in stale_ids:
            _attempt_cache.pop(publication_id, None)


def _try_acquire_scheduler_leader(now: datetime) -> bool:
    lease_seconds = max(300, min(_sweep_minutes() * 60, 3600))
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


def _work_has_active_local_oa_file(publication_id: str) -> bool:
    create_all_tables()
    with session_scope() as session:
        rows = session.scalars(
            select(PublicationFile).where(
                PublicationFile.publication_id == publication_id,
                PublicationFile.source == FILE_SOURCE_OA_LINK,
                PublicationFile.deleted.is_(False),
            )
        ).all()
        for row in rows:
            if _publication_file_has_local_copy(row):
                return True
    return False


def _candidate_work_rows(limit: int) -> list[tuple[str, str]]:
    create_all_tables()
    with session_scope() as session:
        rows = session.execute(
            select(Work.id, Work.user_id)
            .join(User, User.id == Work.user_id)
            .where(
                User.is_active.is_(True),
                Work.oa_link_suppressed.is_(False),
                (Work.doi.is_not(None) | Work.pmid.is_not(None)),
            )
            .order_by(Work.updated_at.asc(), Work.created_at.asc(), Work.id.asc())
            .limit(max(1, limit))
        ).all()
    return [(str(publication_id), str(user_id)) for publication_id, user_id in rows]


def run_open_access_auto_sync_scheduler_tick() -> int:
    if not _auto_sync_enabled():
        return 0
    now = _utcnow()
    if not _try_acquire_scheduler_leader(now):
        return 0
    _prune_attempt_cache(now)
    processed = 0
    for publication_id, user_id in _candidate_work_rows(limit=max(_batch_size() * 6, 50)):
        if processed >= _batch_size():
            break
        if _work_has_active_local_oa_file(publication_id):
            _mark_attempt(publication_id, "available")
            continue
        if not _should_attempt(publication_id, now):
            continue
        _mark_attempt(publication_id, "checking")
        try:
            result = link_publication_open_access_pdf(
                user_id=user_id,
                publication_id=publication_id,
                allow_suppressed=False,
            )
            if result.get("file"):
                _mark_attempt(publication_id, "available")
            else:
                _mark_attempt(publication_id, "missing")
        except Exception as exc:
            logger.warning(
                "publication_oa_auto_sync_failed",
                extra={"publication_id": publication_id, "detail": str(exc)},
            )
            _mark_attempt(publication_id, "error")
        processed += 1
    return processed


def start_open_access_auto_sync_scheduler() -> None:
    global _scheduler
    if BackgroundScheduler is None:
        logger.warning("open_access_auto_sync_scheduler_unavailable")
        return
    with _scheduler_lock:
        if _scheduler is not None:
            return
        scheduler = BackgroundScheduler(timezone="UTC")
        scheduler.add_job(
            run_open_access_auto_sync_scheduler_tick,
            trigger="interval",
            minutes=_sweep_minutes(),
            id="open-access-auto-sync-sweep",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=_utcnow() + timedelta(seconds=90),
        )
        scheduler.start()
        _scheduler = scheduler


def stop_open_access_auto_sync_scheduler() -> None:
    global _scheduler
    with _scheduler_lock:
        if _scheduler is not None:
            _scheduler.shutdown(wait=False)
            _scheduler = None

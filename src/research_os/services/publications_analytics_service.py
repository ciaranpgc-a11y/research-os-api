from __future__ import annotations

import logging
import os
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import httpx
from sqlalchemy import select

from research_os.db import (
    AppRuntimeLock,
    MetricsSnapshot,
    PublicationMetric,
    User,
    Work,
    create_all_tables,
    session_scope,
)

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except Exception:  # pragma: no cover
    BackgroundScheduler = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)

SUMMARY_KEY = "summary"
TIMESERIES_KEY = "timeseries"
TOP_DRIVERS_KEY = "top_drivers"
DEFAULT_TOP_DRIVERS_LIMIT = 5
ANALYTICS_SCHEMA_VERSION = 3

READY_STATUS = "READY"
RUNNING_STATUS = "RUNNING"
FAILED_STATUS = "FAILED"
BUNDLE_METRIC_KEY = "bundle"
SCHEDULER_LOCK_NAME = "publications_analytics_scheduler"
RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}

_executor_lock = threading.Lock()
_executor: ThreadPoolExecutor | None = None
_scheduler_lock = threading.Lock()
_scheduler: Any = None
_INSTANCE_ID = f"pub-analytics-{uuid4().hex[:12]}"


class PublicationsAnalyticsValidationError(RuntimeError):
    pass


class PublicationsAnalyticsNotFoundError(RuntimeError):
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


def _to_iso_utc(value: datetime) -> str:
    return _coerce_utc(value).isoformat()


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


def _parse_metric_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        return _coerce_utc(value)
    if isinstance(value, str):
        text = value.strip()
        if text:
            try:
                return _coerce_utc(datetime.fromisoformat(text.replace("Z", "+00:00")))
            except Exception:
                return _utcnow()
    return _utcnow()


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise PublicationsAnalyticsNotFoundError(f"User '{user_id}' was not found.")
    return user


def _provider_priority(name: str) -> int:
    normalized = (name or "").strip().lower()
    if normalized == "openalex":
        return 30
    if normalized in {"semantic_scholar", "semanticscholar"}:
        return 20
    if normalized == "manual":
        return 10
    return 0


def _snapshot_rank(row: MetricsSnapshot) -> tuple[int, datetime]:
    return _provider_priority(row.provider), _coerce_utc(row.captured_at)


def _latest_metrics_by_work(session, *, work_ids: list[str]) -> dict[str, MetricsSnapshot]:
    if not work_ids:
        return {}
    rows = session.scalars(
        select(MetricsSnapshot).where(MetricsSnapshot.work_id.in_(work_ids))
    ).all()
    best: dict[str, MetricsSnapshot] = {}
    for row in rows:
        existing = best.get(row.work_id)
        if existing is None or _snapshot_rank(row) > _snapshot_rank(existing):
            best[row.work_id] = row
    return best


def _latest_metrics_by_work_at_or_before(
    session, *, work_ids: list[str], cutoff: datetime
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
        existing = best.get(row.work_id)
        if existing is None or _snapshot_rank(row) > _snapshot_rank(existing):
            best[row.work_id] = row
    return best


def _sum_citations(rows: dict[str, MetricsSnapshot]) -> int:
    return sum(max(0, int(snapshot.citations_count or 0)) for snapshot in rows.values())


def _extract_counts_by_year(snapshot: MetricsSnapshot, *, now_year: int) -> dict[int, int]:
    payload = snapshot.metric_payload if isinstance(snapshot.metric_payload, dict) else {}
    raw = payload.get("counts_by_year")
    if not isinstance(raw, list):
        return {}
    yearly: dict[int, int] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        year = _safe_int(item.get("year"))
        count = _safe_int(item.get("cited_by_count"))
        if count is None:
            count = _safe_int(item.get("citation_count"))
        if count is None:
            count = _safe_int(item.get("citations"))
        if year is None or count is None or year < 1900 or year > now_year:
            continue
        yearly[year] = max(0, count)
    return yearly


def _fallback_year_for_work(work: Work | None, *, now_year: int) -> int:
    if work is not None and isinstance(work.year, int) and 1900 <= work.year <= now_year:
        return int(work.year)
    return now_year


def _estimate_window_citations(
    yearly_counts: dict[int, int], *, start: datetime, end: datetime, now: datetime
) -> int:
    start_utc = _coerce_utc(start)
    end_utc = _coerce_utc(end)
    now_utc = _coerce_utc(now)
    if end_utc <= start_utc or not yearly_counts:
        return 0
    estimated = 0.0
    for year, count in yearly_counts.items():
        citations = max(0, int(count or 0))
        if citations <= 0:
            continue
        segment_start = datetime(year, 1, 1, tzinfo=timezone.utc)
        segment_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        if year == now_utc.year:
            segment_end = min(segment_end, now_utc)
        if segment_end <= segment_start:
            continue
        overlap_start = max(start_utc, segment_start)
        overlap_end = min(end_utc, segment_end)
        if overlap_end <= overlap_start:
            continue
        overlap_seconds = (overlap_end - overlap_start).total_seconds()
        segment_seconds = (segment_end - segment_start).total_seconds()
        estimated += citations * max(0.0, min(1.0, overlap_seconds / segment_seconds))
    return max(0, int(round(estimated)))


def _build_timeseries_points_from_yearly_counts(
    yearly_counts: dict[int, int]
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    running_total = 0
    for year in sorted(yearly_counts):
        added = max(0, int(yearly_counts[year] or 0))
        running_total += added
        points.append(
            {
                "year": year,
                "citations_added": added,
                "total_citations_end_year": running_total,
            }
        )
    return points


def _compute_h_index(citations: list[int]) -> int:
    values = sorted([max(0, int(v or 0)) for v in citations], reverse=True)
    h_index = 0
    for idx, value in enumerate(values, start=1):
        if value >= idx:
            h_index = idx
        else:
            break
    return h_index


def _compute_per_year_with_yoy(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    prev_added: int | None = None
    for point in points:
        added = max(0, int(point.get("citations_added") or 0))
        yoy_delta: int | None = None
        yoy_pct: float | None = None
        if prev_added is not None:
            yoy_delta = added - prev_added
            if prev_added > 0:
                yoy_pct = round((yoy_delta / prev_added) * 100.0, 1)
        rows.append(
            {
                "year": int(point.get("year") or 0),
                "citations_added": added,
                "total_citations_end_year": max(0, int(point.get("total_citations_end_year") or 0)),
                "yoy_delta": yoy_delta,
                "yoy_pct": yoy_pct,
            }
        )
        prev_added = added
    return rows


def _domain_label(work: Work | None) -> str:
    if work is None:
        return "General"
    text = " ".join(
        [
            str(work.title or ""),
            str(work.venue_name or ""),
            str(work.publisher or ""),
            " ".join(str(x) for x in (work.keywords or [])),
        ]
    ).lower()
    if any(token in text for token in ["cardio", "heart", "aortic", "vascular", "hypertension"]):
        return "Cardiovascular"
    if any(token in text for token in ["cancer", "oncology", "tumour", "tumor", "carcinoma"]):
        return "Oncology"
    if any(token in text for token in ["education", "learning", "training", "beme", "curriculum"]):
        return "Medical Education"
    if any(token in text for token in ["respiratory", "pulmonary", "lung"]):
        return "Respiratory"
    return "General"


def _momentum_badge(*, citations_last_12: int, share_12m_pct: float) -> str:
    if citations_last_12 >= 120 or share_12m_pct >= 30.0:
        return "surging"
    if citations_last_12 >= 40 or share_12m_pct >= 12.0:
        return "rising"
    return "steady"


def _ttl_seconds() -> int:
    value = _safe_int(os.getenv("PUB_ANALYTICS_TTL_SECONDS", "86400"))
    return max(900, value if value is not None else 86400)


def _schedule_hours() -> int:
    value = _safe_int(os.getenv("PUB_ANALYTICS_SCHEDULE_HOURS", "24"))
    return max(1, value if value is not None else 24)


def _max_concurrent_jobs() -> int:
    value = _safe_int(os.getenv("PUB_ANALYTICS_MAX_CONCURRENT_JOBS", "2"))
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
    value = _safe_float(os.getenv("PUB_ANALYTICS_OPENALEX_TIMEOUT_SECONDS", "12"))
    return max(5.0, value if value is not None else 12.0)


def _openalex_retry_count() -> int:
    value = _safe_int(os.getenv("PUB_ANALYTICS_OPENALEX_RETRY_COUNT", "2"))
    return max(0, min(6, value if value is not None else 2))


def _is_stale(*, computed_at: datetime | None, now: datetime) -> bool:
    if computed_at is None:
        return True
    return (now - _coerce_utc(computed_at)).total_seconds() > _ttl_seconds()


def _normalize_status(value: str | None) -> str:
    clean = str(value or "").strip().upper()
    if clean in {READY_STATUS, RUNNING_STATUS, FAILED_STATUS}:
        return clean
    return READY_STATUS


def _is_metric_payload_current(payload: dict[str, Any]) -> bool:
    return _safe_int(payload.get("schema_version")) == ANALYTICS_SCHEMA_VERSION


def _build_empty_payload(*, computed_at: datetime, failures_in_row: int = 0) -> dict[str, Any]:
    now_iso = _to_iso_utc(computed_at)
    return {
        "schema_version": ANALYTICS_SCHEMA_VERSION,
        "computed_at": now_iso,
        "summary": {
            "schema_version": ANALYTICS_SCHEMA_VERSION,
            "total_citations": 0,
            "h_index": 0,
            "citation_velocity_12m": 0.0,
            "citations_last_12_months": 0,
            "citations_previous_12_months": 0,
            "citations_per_month_12m": 0.0,
            "citations_per_month_previous_12m": 0.0,
            "acceleration_citations_per_month": 0.0,
            "yoy_percent": None,
            "yoy_pct": None,
            "citations_ytd": 0,
            "ytd_year": computed_at.year,
            "cagr_3y": None,
            "slope_3y": None,
            "top5_share_12m_pct": 0.0,
            "top10_share_12m_pct": 0.0,
            "computed_at": now_iso,
        },
        "timeseries": {
            "schema_version": ANALYTICS_SCHEMA_VERSION,
            "computed_at": now_iso,
            "points": [],
        },
        "top_drivers": {
            "schema_version": ANALYTICS_SCHEMA_VERSION,
            "computed_at": now_iso,
            "window": "last_12_months",
            "drivers": [],
        },
        "per_year": [],
        "domain_breakdown_12m": [],
        "metadata": {
            "window_start_12m": _to_iso_utc(computed_at - timedelta(days=365)),
            "window_end_12m": now_iso,
            "window_start_previous_12m": _to_iso_utc(computed_at - timedelta(days=730)),
            "window_end_previous_12m": _to_iso_utc(computed_at - timedelta(days=365)),
            "schema_version": ANALYTICS_SCHEMA_VERSION,
            "failures_in_row": max(0, int(failures_in_row)),
        },
    }


def _read_failures_in_row(payload: dict[str, Any]) -> int:
    metadata = payload.get("metadata") if isinstance(payload, dict) else None
    if not isinstance(metadata, dict):
        return 0
    value = _safe_int(metadata.get("failures_in_row"))
    return max(0, value if value is not None else 0)


def _set_failures_in_row(payload: dict[str, Any], failures_in_row: int) -> dict[str, Any]:
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    metadata["failures_in_row"] = max(0, int(failures_in_row))
    payload["metadata"] = metadata
    return payload


def _bundle_row_query(user_id: str):
    return select(PublicationMetric).where(
        PublicationMetric.user_id == user_id,
        PublicationMetric.metric_key == BUNDLE_METRIC_KEY,
    )


def _load_bundle_row(session, *, user_id: str, for_update: bool = False) -> PublicationMetric | None:
    query = _bundle_row_query(user_id)
    if for_update:
        query = query.with_for_update()
    return session.scalars(query).first()


def _bundle_payload_from_row(row: PublicationMetric | None) -> dict[str, Any]:
    if row is None:
        return {}
    payload = row.payload_json if isinstance(row.payload_json, dict) else {}
    if payload and isinstance(payload.get("summary"), dict):
        return dict(payload)
    metric_json = row.metric_json if isinstance(row.metric_json, dict) else {}
    if metric_json and _is_metric_payload_current(metric_json):
        return {
            "schema_version": ANALYTICS_SCHEMA_VERSION,
            "computed_at": metric_json.get("computed_at"),
            "summary": metric_json,
            "timeseries": {"schema_version": ANALYTICS_SCHEMA_VERSION, "computed_at": metric_json.get("computed_at"), "points": []},
            "top_drivers": {"schema_version": ANALYTICS_SCHEMA_VERSION, "computed_at": metric_json.get("computed_at"), "window": "last_12_months", "drivers": []},
            "per_year": [],
            "domain_breakdown_12m": [],
            "metadata": {"schema_version": ANALYTICS_SCHEMA_VERSION, "failures_in_row": 0},
        }
    return {}


def _legacy_bundle_payload(session, *, user_id: str) -> dict[str, Any] | None:
    rows = session.scalars(
        select(PublicationMetric).where(
            PublicationMetric.user_id == user_id,
            PublicationMetric.metric_key.in_([SUMMARY_KEY, TIMESERIES_KEY, TOP_DRIVERS_KEY]),
        )
    ).all()
    if not rows:
        return None
    by_key = {str(row.metric_key): row for row in rows}
    summary_row = by_key.get(SUMMARY_KEY)
    if summary_row is None or not isinstance(summary_row.metric_json, dict):
        return None
    summary = dict(summary_row.metric_json)
    timeseries = (
        dict(by_key[TIMESERIES_KEY].metric_json)
        if TIMESERIES_KEY in by_key and isinstance(by_key[TIMESERIES_KEY].metric_json, dict)
        else {"schema_version": ANALYTICS_SCHEMA_VERSION, "computed_at": summary.get("computed_at"), "points": []}
    )
    top_drivers = (
        dict(by_key[TOP_DRIVERS_KEY].metric_json)
        if TOP_DRIVERS_KEY in by_key and isinstance(by_key[TOP_DRIVERS_KEY].metric_json, dict)
        else {"schema_version": ANALYTICS_SCHEMA_VERSION, "computed_at": summary.get("computed_at"), "window": "last_12_months", "drivers": []}
    )
    computed_at = _parse_metric_timestamp(summary.get("computed_at"))
    return {
        "schema_version": ANALYTICS_SCHEMA_VERSION,
        "computed_at": _to_iso_utc(computed_at),
        "summary": summary,
        "timeseries": timeseries,
        "top_drivers": top_drivers,
        "per_year": _compute_per_year_with_yoy(timeseries.get("points") if isinstance(timeseries.get("points"), list) else []),
        "domain_breakdown_12m": [],
        "metadata": {"schema_version": ANALYTICS_SCHEMA_VERSION, "failures_in_row": 0},
    }


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


def _normalize_orcid_id(orcid_id: str | None) -> str:
    clean = str(orcid_id or "").strip()
    if clean.startswith("https://orcid.org/"):
        clean = clean.removeprefix("https://orcid.org/")
    if clean.startswith("http://orcid.org/"):
        clean = clean.removeprefix("http://orcid.org/")
    return clean.strip().strip("/")


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
        logger.warning("openalex_lookup_failed", extra={"detail": str(last_exception)})
    return {}


def _resolve_openalex_author_id(*, orcid_id: str | None, mailto: str | None) -> str | None:
    clean_orcid = _normalize_orcid_id(orcid_id)
    if not clean_orcid:
        return None
    params: dict[str, Any] = {
        "filter": f"orcid:https://orcid.org/{clean_orcid}",
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


def _compute_payload(session, *, user_id: str, computed_at: datetime) -> dict[str, Any]:
    _resolve_user_or_raise(session, user_id)
    works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
    work_ids = [str(work.id) for work in works]
    now = _coerce_utc(computed_at)
    now_iso = _to_iso_utc(now)
    cutoff_12 = now - timedelta(days=365)
    cutoff_24 = now - timedelta(days=730)

    latest = _latest_metrics_by_work(session, work_ids=work_ids)
    at_12 = _latest_metrics_by_work_at_or_before(session, work_ids=work_ids, cutoff=cutoff_12)
    at_24 = _latest_metrics_by_work_at_or_before(session, work_ids=work_ids, cutoff=cutoff_24)
    latest_total = _sum_citations(latest)
    work_by_id = {str(work.id): work for work in works}

    yearly_by_work: dict[str, dict[int, int]] = {}
    fallback_yearly: dict[int, int] = defaultdict(int)
    aggregate_yearly: dict[int, int] = defaultdict(int)
    has_provider_yearly_history = False
    for work_id in work_ids:
        snap = latest.get(work_id)
        if snap is None:
            continue
        citations = max(0, int(snap.citations_count or 0))
        yearly = _extract_counts_by_year(snap, now_year=now.year)
        if yearly:
            has_provider_yearly_history = True
            distributed = sum(yearly.values())
            if distributed < citations:
                fallback_year = _fallback_year_for_work(work_by_id.get(work_id), now_year=now.year)
                yearly[fallback_year] = yearly.get(fallback_year, 0) + (citations - distributed)
            yearly_by_work[work_id] = yearly
            for year, count in yearly.items():
                aggregate_yearly[year] += max(0, int(count or 0))
        elif citations > 0:
            fallback_year = _fallback_year_for_work(work_by_id.get(work_id), now_year=now.year)
            fallback_yearly[fallback_year] += citations

    growth_by_work: dict[str, int] = {}
    citations_last_12 = 0
    citations_previous_12 = 0
    for work_id in work_ids:
        current = max(0, int((latest.get(work_id).citations_count if latest.get(work_id) else 0) or 0))
        snap_12 = at_12.get(work_id)
        snap_24 = at_24.get(work_id)
        yearly = yearly_by_work.get(work_id, {})
        if snap_12 is not None:
            last_12 = max(0, current - int(snap_12.citations_count or 0))
        elif yearly:
            last_12 = _estimate_window_citations(yearly, start=cutoff_12, end=now, now=now)
        else:
            last_12 = 0

        if snap_12 is not None and snap_24 is not None:
            prev_12 = max(0, int(snap_12.citations_count or 0) - int(snap_24.citations_count or 0))
        elif yearly:
            prev_12 = _estimate_window_citations(yearly, start=cutoff_24, end=cutoff_12, now=now)
        elif snap_12 is not None:
            prev_12 = max(0, int(snap_12.citations_count or 0))
        else:
            prev_12 = 0

        growth_by_work[work_id] = last_12
        citations_last_12 += last_12
        citations_previous_12 += prev_12

    yoy_percent: float | None = None
    if citations_previous_12 > 0:
        yoy_percent = round(((citations_last_12 - citations_previous_12) / citations_previous_12) * 100.0, 1)
    citations_pm_12 = round(citations_last_12 / 12.0, 2)
    citations_pm_prev_12 = round(citations_previous_12 / 12.0, 2)
    acceleration_pm = round(citations_pm_12 - citations_pm_prev_12, 2)
    h_index = _compute_h_index([int(s.citations_count or 0) for s in latest.values()])

    if has_provider_yearly_history:
        for year, count in fallback_yearly.items():
            aggregate_yearly[year] += max(0, int(count or 0))
        timeseries_points = _build_timeseries_points_from_yearly_counts(aggregate_yearly)
    elif fallback_yearly:
        timeseries_points = _build_timeseries_points_from_yearly_counts(fallback_yearly)
    else:
        timeseries_points = []

    per_year = _compute_per_year_with_yoy(timeseries_points)
    complete_years = [row for row in per_year if int(row.get("year") or 0) < now.year]
    cagr_3y: float | None = None
    slope_3y: float | None = None
    if len(complete_years) >= 3:
        last3 = complete_years[-3:]
        first_val = max(0, int(last3[0].get("citations_added") or 0))
        last_val = max(0, int(last3[-1].get("citations_added") or 0))
        slope_3y = round((last_val - first_val) / 2.0, 2)
        if first_val > 0:
            cagr_3y = round((((last_val / first_val) ** (1 / 2.0)) - 1.0) * 100.0, 2)

    citations_ytd = max(0, int(aggregate_yearly.get(now.year, 0))) if aggregate_yearly else 0
    top_drivers: list[dict[str, Any]] = []
    domain_totals: dict[str, int] = defaultdict(int)
    domain_works: dict[str, set[str]] = defaultdict(set)
    for work_id in work_ids:
        growth = int(growth_by_work.get(work_id, 0))
        if growth <= 0:
            continue
        work = work_by_id.get(work_id)
        snap = latest.get(work_id)
        current = int(snap.citations_count or 0) if snap is not None else 0
        share = round((growth / citations_last_12) * 100.0, 2) if citations_last_12 > 0 else 0.0
        domain = _domain_label(work)
        top_drivers.append(
            {
                "work_id": work_id,
                "title": work.title if work else "",
                "year": work.year if work else None,
                "doi": work.doi if work else None,
                "citations_last_12_months": growth,
                "current_citations": current,
                "provider": snap.provider if snap is not None else "none",
                "share_12m_pct": share,
                "primary_domain_label": domain,
                "momentum_badge": _momentum_badge(citations_last_12=growth, share_12m_pct=share),
            }
        )
        domain_totals[domain] += growth
        domain_works[domain].add(work_id)
    top_drivers.sort(key=lambda item: (int(item["citations_last_12_months"]), int(item["current_citations"]), int(item["year"] or 0)), reverse=True)
    top5 = sum(int(item["citations_last_12_months"]) for item in top_drivers[:5])
    top10 = sum(int(item["citations_last_12_months"]) for item in top_drivers[:10])
    top5_share = round((top5 / citations_last_12) * 100.0, 2) if citations_last_12 > 0 else 0.0
    top10_share = round((top10 / citations_last_12) * 100.0, 2) if citations_last_12 > 0 else 0.0
    domain_breakdown = [
        {
            "label": label,
            "citations_last_12_months": int(total),
            "share_12m_pct": round((int(total) / citations_last_12) * 100.0, 2) if citations_last_12 > 0 else 0.0,
            "works_count": len(domain_works.get(label, set())),
        }
        for label, total in sorted(domain_totals.items(), key=lambda item: int(item[1]), reverse=True)
    ]

    summary = {
        "schema_version": ANALYTICS_SCHEMA_VERSION,
        "total_citations": latest_total,
        "h_index": h_index,
        "citation_velocity_12m": citations_pm_12,
        "citations_last_12_months": citations_last_12,
        "citations_previous_12_months": citations_previous_12,
        "citations_per_month_12m": citations_pm_12,
        "citations_per_month_previous_12m": citations_pm_prev_12,
        "acceleration_citations_per_month": acceleration_pm,
        "yoy_percent": yoy_percent,
        "yoy_pct": yoy_percent,
        "citations_ytd": citations_ytd,
        "ytd_year": now.year,
        "cagr_3y": cagr_3y,
        "slope_3y": slope_3y,
        "top5_share_12m_pct": top5_share,
        "top10_share_12m_pct": top10_share,
        "computed_at": now_iso,
    }
    return {
        "schema_version": ANALYTICS_SCHEMA_VERSION,
        "computed_at": now_iso,
        "summary": summary,
        "timeseries": {"schema_version": ANALYTICS_SCHEMA_VERSION, "computed_at": now_iso, "points": timeseries_points},
        "top_drivers": {"schema_version": ANALYTICS_SCHEMA_VERSION, "computed_at": now_iso, "window": "last_12_months", "drivers": top_drivers},
        "per_year": per_year,
        "domain_breakdown_12m": domain_breakdown,
        "metadata": {
            "window_start_12m": _to_iso_utc(cutoff_12),
            "window_end_12m": now_iso,
            "window_start_previous_12m": _to_iso_utc(cutoff_24),
            "window_end_previous_12m": _to_iso_utc(cutoff_12),
            "schema_version": ANALYTICS_SCHEMA_VERSION,
            "failures_in_row": 0,
        },
    }


def _persist_ready_bundle(
    *,
    user_id: str,
    payload: dict[str, Any],
    computed_at: datetime,
    orcid_id: str | None,
    openalex_author_id: str | None,
) -> None:
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        row = _load_bundle_row(session, user_id=user_id, for_update=True)
        if row is None:
            row = PublicationMetric(user_id=user_id, metric_key=BUNDLE_METRIC_KEY)
            session.add(row)
            session.flush()
        payload_copy = _set_failures_in_row(dict(payload), 0)
        row.metric_json = (
            payload_copy.get("summary")
            if isinstance(payload_copy.get("summary"), dict)
            else {}
        )
        row.payload_json = payload_copy
        row.status = READY_STATUS
        row.last_error = None
        row.computed_at = _coerce_utc(computed_at)
        row.updated_at = _utcnow()
        row.next_scheduled_at = _utcnow() + timedelta(hours=_schedule_hours())
        row.orcid_id = orcid_id or user.orcid_id
        row.openalex_author_id = openalex_author_id
        session.flush()


def _persist_failed_bundle(*, user_id: str, detail: str) -> None:
    now = _utcnow()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        row = _load_bundle_row(session, user_id=user_id, for_update=True)
        if row is None:
            row = PublicationMetric(
                user_id=user_id,
                metric_key=BUNDLE_METRIC_KEY,
                payload_json=_build_empty_payload(computed_at=now),
                metric_json={},
                computed_at=now,
                updated_at=now,
            )
            session.add(row)
            session.flush()
        payload = _bundle_payload_from_row(row)
        if not payload:
            payload = _build_empty_payload(computed_at=now)
        failures = _read_failures_in_row(payload) + 1
        payload = _set_failures_in_row(payload, failures)
        row.payload_json = payload
        row.metric_json = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
        row.status = FAILED_STATUS
        row.last_error = str(detail or "Unknown analytics failure")[:2000]
        row.updated_at = now
        row.next_scheduled_at = now + timedelta(seconds=_failure_backoff_seconds(failures))
        row.orcid_id = user.orcid_id
        session.flush()


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(
                max_workers=_max_concurrent_jobs(),
                thread_name_prefix="pub-analytics",
            )
        return _executor


def _shutdown_executor() -> None:
    global _executor
    with _executor_lock:
        if _executor is not None:
            _executor.shutdown(wait=False, cancel_futures=False)
            _executor = None


def _run_background_compute(user_id: str) -> None:
    try:
        compute_publications_analytics(user_id=user_id)
    except Exception as exc:
        _persist_failed_bundle(user_id=user_id, detail=str(exc))


def _should_enqueue_from_row(
    row: PublicationMetric | None,
    *,
    now: datetime,
    stale: bool,
    force: bool = False,
) -> bool:
    if force:
        return row is None or _normalize_status(row.status) != RUNNING_STATUS
    if row is None:
        return True
    status = _normalize_status(row.status)
    if status == RUNNING_STATUS:
        return False
    next_scheduled = _coerce_utc_or_none(row.next_scheduled_at)
    if status == FAILED_STATUS and next_scheduled and next_scheduled > now:
        return False
    if next_scheduled and next_scheduled <= now:
        return True
    return stale


def _mark_job_running(*, user_id: str, force: bool) -> bool:
    now = _utcnow()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        row = _load_bundle_row(session, user_id=user_id, for_update=True)
        if row is None:
            row = PublicationMetric(
                user_id=user_id,
                metric_key=BUNDLE_METRIC_KEY,
                metric_json={},
                payload_json=_build_empty_payload(computed_at=now),
                status=RUNNING_STATUS,
                last_error=None,
                computed_at=now,
                updated_at=now,
                orcid_id=user.orcid_id,
                next_scheduled_at=now,
            )
            session.add(row)
            session.flush()
            return True
        payload = _bundle_payload_from_row(row)
        if not payload:
            payload = _build_empty_payload(computed_at=now)
            row.payload_json = payload
            row.metric_json = payload.get("summary", {})
        stale = _is_stale(computed_at=_coerce_utc_or_none(row.computed_at), now=now) or not _is_metric_payload_current(payload)
        if _should_enqueue_from_row(row, now=now, stale=stale, force=force):
            row.status = RUNNING_STATUS
            row.last_error = None
            row.updated_at = now
            row.orcid_id = user.orcid_id
            if row.next_scheduled_at is None:
                row.next_scheduled_at = now
            session.flush()
            return True
        return False


def enqueue_publications_analytics_recompute(
    *,
    user_id: str,
    force: bool = False,
    reason: str | None = None,
) -> bool:
    create_all_tables()
    should_enqueue = _mark_job_running(user_id=user_id, force=force)
    if not should_enqueue:
        return False
    try:
        _get_executor().submit(_run_background_compute, user_id)
        if reason:
            logger.info("publications_analytics_enqueue", extra={"user_id": user_id, "reason": reason})
        return True
    except Exception as exc:
        _persist_failed_bundle(user_id=user_id, detail=f"Failed to enqueue publications analytics recompute: {exc}")
        return False


def compute_publications_analytics(
    *,
    user_id: str,
    refresh_metrics: bool = False,
) -> dict[str, Any]:
    create_all_tables()
    if refresh_metrics:
        from research_os.services.persona_service import sync_metrics

        sync_metrics(user_id=user_id, providers=["openalex"])

    computed_at = _utcnow()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        payload = _compute_payload(session, user_id=user_id, computed_at=computed_at)
        orcid_id = user.orcid_id
        user_email = user.email
    openalex_author_id = _resolve_openalex_author_id(
        orcid_id=orcid_id,
        mailto=_openalex_mailto(fallback_email=user_email),
    )
    _persist_ready_bundle(
        user_id=user_id,
        payload=payload,
        computed_at=computed_at,
        orcid_id=orcid_id,
        openalex_author_id=openalex_author_id,
    )
    return payload

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from research_os.db import (
    MetricsSnapshot,
    PublicationMetric,
    User,
    Work,
    create_all_tables,
    session_scope,
)
from research_os.services.persona_service import sync_metrics

SUMMARY_KEY = "summary"
TIMESERIES_KEY = "timeseries"
TOP_DRIVERS_KEY = "top_drivers"
DEFAULT_TOP_DRIVERS_LIMIT = 5


class PublicationsAnalyticsValidationError(RuntimeError):
    pass


class PublicationsAnalyticsNotFoundError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso_utc(value: datetime) -> str:
    return _coerce_utc(value).isoformat()


def _parse_metric_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        return _coerce_utc(value)
    if isinstance(value, str):
        text = value.strip()
        if text:
            try:
                return _coerce_utc(datetime.fromisoformat(text.replace("Z", "+00:00")))
            except ValueError:
                return _utcnow()
    return _utcnow()


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise PublicationsAnalyticsNotFoundError(f"User '{user_id}' was not found.")
    return user


def _coerce_utc(value: datetime | None) -> datetime:
    if not isinstance(value, datetime):
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


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
    provider_rank = _provider_priority(row.provider)
    captured = _coerce_utc(row.captured_at)
    return provider_rank, captured


def _latest_metrics_by_work(
    session,
    *,
    work_ids: list[str],
) -> dict[str, MetricsSnapshot]:
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
    session,
    *,
    work_ids: list[str],
    cutoff: datetime,
) -> dict[str, MetricsSnapshot]:
    if not work_ids:
        return {}
    cutoff_utc = _coerce_utc(cutoff)
    rows = session.scalars(
        select(MetricsSnapshot).where(
            MetricsSnapshot.work_id.in_(work_ids),
            MetricsSnapshot.captured_at <= cutoff_utc,
        )
    ).all()
    best: dict[str, MetricsSnapshot] = {}
    for row in rows:
        existing = best.get(row.work_id)
        if existing is None or _snapshot_rank(row) > _snapshot_rank(existing):
            best[row.work_id] = row
    return best


def _sum_citations(rows: dict[str, MetricsSnapshot]) -> int:
    total = 0
    for snapshot in rows.values():
        total += max(0, int(snapshot.citations_count or 0))
    return total


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value.is_integer():
            return int(value)
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return int(text)
        except ValueError:
            return None
    return None


def _fallback_year_for_work(work: Work | None, *, now_year: int) -> int:
    if work is not None and isinstance(work.year, int) and 1900 <= work.year <= now_year:
        return int(work.year)
    return now_year


def _extract_counts_by_year(
    snapshot: MetricsSnapshot,
    *,
    now_year: int,
) -> dict[int, int]:
    payload = snapshot.metric_payload if isinstance(snapshot.metric_payload, dict) else {}
    raw = payload.get("counts_by_year")
    if not isinstance(raw, list):
        return {}
    yearly: dict[int, int] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        year = _safe_int(item.get("year"))
        citations = _safe_int(item.get("cited_by_count"))
        if citations is None:
            citations = _safe_int(item.get("citation_count"))
        if citations is None:
            citations = _safe_int(item.get("citations"))
        if year is None or citations is None:
            continue
        if year < 1900 or year > now_year:
            continue
        yearly[year] = max(0, citations)
    return yearly


def _window_overlap_fraction(
    *,
    start: datetime,
    end: datetime,
    segment_start: datetime,
    segment_end: datetime,
) -> float:
    overlap_start = max(start, segment_start)
    overlap_end = min(end, segment_end)
    if overlap_end <= overlap_start:
        return 0.0
    segment_seconds = (segment_end - segment_start).total_seconds()
    if segment_seconds <= 0:
        return 0.0
    overlap_seconds = (overlap_end - overlap_start).total_seconds()
    return max(0.0, min(1.0, overlap_seconds / segment_seconds))


def _estimate_window_citations(
    yearly_counts: dict[int, int],
    *,
    start: datetime,
    end: datetime,
    now: datetime,
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
        year_start = datetime(year, 1, 1, tzinfo=timezone.utc)
        year_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        if year == now_utc.year:
            ytd_end = min(now_utc, year_end)
            if ytd_end <= year_start:
                continue
            fraction = _window_overlap_fraction(
                start=start_utc,
                end=end_utc,
                segment_start=year_start,
                segment_end=ytd_end,
            )
        else:
            fraction = _window_overlap_fraction(
                start=start_utc,
                end=end_utc,
                segment_start=year_start,
                segment_end=year_end,
            )
        estimated += citations * fraction
    return max(0, int(round(estimated)))


def _build_timeseries_points_from_yearly_counts(
    yearly_counts: dict[int, int],
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    running_total = 0
    for year in sorted(yearly_counts.keys()):
        citations_added = max(0, int(yearly_counts[year] or 0))
        running_total += citations_added
        points.append(
            {
                "year": year,
                "citations_added": citations_added,
                "total_citations_end_year": running_total,
            }
        )
    return points


def _compute_h_index(citations: list[int]) -> int:
    sorted_values = sorted(
        [max(0, int(value or 0)) for value in citations], reverse=True
    )
    h_index = 0
    for idx, value in enumerate(sorted_values, start=1):
        if value >= idx:
            h_index = idx
            continue
        break
    return h_index


def _upsert_metric(
    session,
    *,
    user_id: str,
    metric_key: str,
    metric_json: dict[str, Any],
    computed_at: datetime,
) -> None:
    existing = session.scalars(
        select(PublicationMetric).where(
            PublicationMetric.user_id == user_id,
            PublicationMetric.metric_key == metric_key,
        )
    ).first()
    if existing is None:
        session.add(
            PublicationMetric(
                user_id=user_id,
                metric_key=metric_key,
                metric_json=metric_json,
                computed_at=computed_at,
            )
        )
        return
    existing.metric_json = metric_json
    existing.computed_at = computed_at


def _compute_bundle(
    session,
    *,
    user_id: str,
    computed_at: datetime | None = None,
) -> dict[str, dict[str, Any]]:
    _resolve_user_or_raise(session, user_id)
    works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
    work_ids = [str(work.id) for work in works]
    now = _coerce_utc(computed_at or _utcnow())
    now_iso = _to_iso_utc(now)
    cutoff_12 = now - timedelta(days=365)
    cutoff_24 = now - timedelta(days=730)

    latest = _latest_metrics_by_work(session, work_ids=work_ids)
    at_12 = _latest_metrics_by_work_at_or_before(
        session,
        work_ids=work_ids,
        cutoff=cutoff_12,
    )
    at_24 = _latest_metrics_by_work_at_or_before(
        session,
        work_ids=work_ids,
        cutoff=cutoff_24,
    )

    latest_total = _sum_citations(latest)
    work_by_id = {str(work.id): work for work in works}
    yearly_citations_by_work: dict[str, dict[int, int]] = {}
    has_provider_yearly_history = False
    fallback_yearly_counts: dict[int, int] = defaultdict(int)
    aggregated_yearly_counts: dict[int, int] = defaultdict(int)
    for work_id in work_ids:
        current_snapshot = latest.get(work_id)
        if current_snapshot is None:
            continue
        current_citations = max(0, int(current_snapshot.citations_count or 0))
        yearly_counts = _extract_counts_by_year(current_snapshot, now_year=now.year)
        if yearly_counts:
            has_provider_yearly_history = True
            distributed_total = sum(yearly_counts.values())
            if distributed_total < current_citations:
                fallback_year = _fallback_year_for_work(
                    work_by_id.get(work_id), now_year=now.year
                )
                yearly_counts[fallback_year] = yearly_counts.get(fallback_year, 0) + (
                    current_citations - distributed_total
                )
            yearly_citations_by_work[work_id] = yearly_counts
            for year, count in yearly_counts.items():
                aggregated_yearly_counts[year] += max(0, int(count or 0))
        elif current_citations > 0:
            fallback_year = _fallback_year_for_work(
                work_by_id.get(work_id), now_year=now.year
            )
            fallback_yearly_counts[fallback_year] += current_citations

    growth_last_12_by_work: dict[str, int] = {}
    citations_last_12 = 0
    citations_previous_12 = 0
    for work_id in work_ids:
        current_snapshot = latest.get(work_id)
        current_citations = (
            max(0, int(current_snapshot.citations_count or 0))
            if current_snapshot is not None
            else 0
        )
        at_12_snapshot = at_12.get(work_id)
        at_24_snapshot = at_24.get(work_id)
        yearly_counts = yearly_citations_by_work.get(work_id, {})

        if at_12_snapshot is not None:
            last_12 = max(0, current_citations - int(at_12_snapshot.citations_count or 0))
        elif yearly_counts:
            last_12 = _estimate_window_citations(
                yearly_counts,
                start=cutoff_12,
                end=now,
                now=now,
            )
        else:
            last_12 = current_citations

        if at_12_snapshot is not None and at_24_snapshot is not None:
            previous_12 = max(
                0,
                int(at_12_snapshot.citations_count or 0)
                - int(at_24_snapshot.citations_count or 0),
            )
        elif yearly_counts:
            previous_12 = _estimate_window_citations(
                yearly_counts,
                start=cutoff_24,
                end=cutoff_12,
                now=now,
            )
        elif at_12_snapshot is not None:
            previous_12 = max(0, int(at_12_snapshot.citations_count or 0))
        else:
            previous_12 = 0

        growth_last_12_by_work[work_id] = last_12
        citations_last_12 += last_12
        citations_previous_12 += previous_12

    yoy_percent: float | None = None
    if citations_previous_12 > 0:
        yoy_percent = round(
            ((citations_last_12 - citations_previous_12) / citations_previous_12)
            * 100.0,
            1,
        )
    citation_velocity_12m = round(citations_last_12 / 12.0, 2)
    h_index = _compute_h_index(
        [int(snapshot.citations_count or 0) for snapshot in latest.values()]
    )

    timeseries_points: list[dict[str, Any]] = []
    if has_provider_yearly_history:
        for year, count in fallback_yearly_counts.items():
            aggregated_yearly_counts[year] += max(0, int(count or 0))
        timeseries_points = _build_timeseries_points_from_yearly_counts(
            aggregated_yearly_counts
        )
    else:
        first_snapshot_at = session.scalar(
            select(MetricsSnapshot.captured_at)
            .where(MetricsSnapshot.work_id.in_(work_ids or [""]))
            .order_by(MetricsSnapshot.captured_at.asc())
            .limit(1)
        )
        if isinstance(first_snapshot_at, datetime):
            start_year = _coerce_utc(first_snapshot_at).year
            end_year = now.year
            for year in range(start_year, end_year + 1):
                year_end = datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
                prev_year_end = datetime(
                    year - 1, 12, 31, 23, 59, 59, tzinfo=timezone.utc
                )
                at_year_end = _latest_metrics_by_work_at_or_before(
                    session,
                    work_ids=work_ids,
                    cutoff=year_end,
                )
                at_prev_year_end = _latest_metrics_by_work_at_or_before(
                    session,
                    work_ids=work_ids,
                    cutoff=prev_year_end,
                )
                total_year = _sum_citations(at_year_end)
                total_prev = _sum_citations(at_prev_year_end)
                timeseries_points.append(
                    {
                        "year": year,
                        "citations_added": max(0, total_year - total_prev),
                        "total_citations_end_year": total_year,
                    }
                )

    top_drivers: list[dict[str, Any]] = []
    for work_id in work_ids:
        current_snapshot = latest.get(work_id)
        current_citations = (
            int(current_snapshot.citations_count or 0) if current_snapshot else 0
        )
        growth = int(growth_last_12_by_work.get(work_id, 0))
        if growth <= 0:
            continue
        work = work_by_id[work_id]
        top_drivers.append(
            {
                "work_id": work_id,
                "title": work.title,
                "year": work.year,
                "doi": work.doi,
                "citations_last_12_months": growth,
                "current_citations": current_citations,
                "provider": current_snapshot.provider if current_snapshot else "none",
            }
        )
    top_drivers.sort(
        key=lambda item: (
            int(item["citations_last_12_months"]),
            int(item["current_citations"]),
            int(item["year"] or 0),
        ),
        reverse=True,
    )

    summary = {
        "total_citations": latest_total,
        "h_index": h_index,
        "citation_velocity_12m": citation_velocity_12m,
        "citations_last_12_months": citations_last_12,
        "citations_previous_12_months": citations_previous_12,
        "yoy_percent": yoy_percent,
        "computed_at": now_iso,
    }
    timeseries = {"computed_at": now_iso, "points": timeseries_points}
    top_drivers_payload = {
        "computed_at": now_iso,
        "window": "last_12_months",
        "drivers": top_drivers,
    }
    return {
        SUMMARY_KEY: summary,
        TIMESERIES_KEY: timeseries,
        TOP_DRIVERS_KEY: top_drivers_payload,
    }


def _compute_and_store(
    *,
    user_id: str,
    refresh_metrics: bool = False,
) -> dict[str, dict[str, Any]]:
    create_all_tables()
    if refresh_metrics:
        sync_metrics(user_id=user_id, providers=["openalex"])
    computed_at = _utcnow()
    with session_scope() as session:
        bundle = _compute_bundle(session, user_id=user_id, computed_at=computed_at)
        persisted_at = _parse_metric_timestamp(bundle[SUMMARY_KEY].get("computed_at"))
        _upsert_metric(
            session,
            user_id=user_id,
            metric_key=SUMMARY_KEY,
            metric_json=bundle[SUMMARY_KEY],
            computed_at=persisted_at,
        )
        _upsert_metric(
            session,
            user_id=user_id,
            metric_key=TIMESERIES_KEY,
            metric_json=bundle[TIMESERIES_KEY],
            computed_at=persisted_at,
        )
        _upsert_metric(
            session,
            user_id=user_id,
            metric_key=TOP_DRIVERS_KEY,
            metric_json=bundle[TOP_DRIVERS_KEY],
            computed_at=persisted_at,
        )
        session.flush()
        return bundle


def _get_metric_or_refresh(
    *,
    user_id: str,
    metric_key: str,
    refresh: bool = False,
    refresh_metrics: bool = False,
) -> dict[str, Any]:
    if refresh:
        return _compute_and_store(
            user_id=user_id,
            refresh_metrics=refresh_metrics,
        )[metric_key]
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        row = session.scalars(
            select(PublicationMetric).where(
                PublicationMetric.user_id == user_id,
                PublicationMetric.metric_key == metric_key,
            )
        ).first()
        if row is not None and isinstance(row.metric_json, dict):
            return dict(row.metric_json)
    bundle = _compute_and_store(user_id=user_id, refresh_metrics=refresh_metrics)
    return bundle[metric_key]


def get_publications_analytics_summary(
    *,
    user_id: str,
    refresh: bool = False,
    refresh_metrics: bool = False,
) -> dict[str, Any]:
    return _get_metric_or_refresh(
        user_id=user_id,
        metric_key=SUMMARY_KEY,
        refresh=refresh,
        refresh_metrics=refresh_metrics,
    )


def get_publications_analytics_timeseries(
    *,
    user_id: str,
    refresh: bool = False,
    refresh_metrics: bool = False,
) -> dict[str, Any]:
    return _get_metric_or_refresh(
        user_id=user_id,
        metric_key=TIMESERIES_KEY,
        refresh=refresh,
        refresh_metrics=refresh_metrics,
    )


def get_publications_analytics_top_drivers(
    *,
    user_id: str,
    limit: int = DEFAULT_TOP_DRIVERS_LIMIT,
    refresh: bool = False,
    refresh_metrics: bool = False,
) -> dict[str, Any]:
    if limit < 1:
        raise PublicationsAnalyticsValidationError("limit must be at least 1.")
    payload = _get_metric_or_refresh(
        user_id=user_id,
        metric_key=TOP_DRIVERS_KEY,
        refresh=refresh,
        refresh_metrics=refresh_metrics,
    )
    drivers = [
        item for item in (payload.get("drivers") or []) if isinstance(item, dict)
    ]
    payload["drivers"] = drivers[:limit]
    return payload

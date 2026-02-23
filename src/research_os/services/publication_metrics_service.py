from __future__ import annotations

import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from research_os.db import (
    MetricsSnapshot,
    PublicationMetric,
    PublicationMetricsSourceCache,
    User,
    Work,
    create_all_tables,
    session_scope,
)

logger = logging.getLogger(__name__)

READY_STATUS = "READY"
RUNNING_STATUS = "RUNNING"
FAILED_STATUS = "FAILED"
STATUSES = {READY_STATUS, RUNNING_STATUS, FAILED_STATUS}
TOP_METRICS_KEY = "top_metrics_strip_v1"
TOP_METRICS_SCHEMA_VERSION = 3

DELTA_COLOR_BY_TONE = {
    "positive": "#166534",
    "neutral": "#475569",
    "caution": "#B45309",
    "negative": "#B91C1C",
}

_executor_lock = threading.Lock()
_executor: ThreadPoolExecutor | None = None
_inflight_lock = threading.Lock()
_inflight_users: set[str] = set()


class PublicationMetricsValidationError(RuntimeError):
    pass


class PublicationMetricsNotFoundError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime | None) -> datetime:
    if not isinstance(value, datetime):
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
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


def _provider_priority(name: str) -> int:
    normalized = str(name or "").strip().lower()
    if normalized == "openalex":
        return 30
    if normalized in {"semantic_scholar", "semanticscholar"}:
        return 20
    if normalized == "manual":
        return 10
    if normalized == "dimensions":
        return 5
    return 0


def _ttl_seconds() -> int:
    value = _safe_int(os.getenv("PUB_ANALYTICS_TTL_SECONDS", "86400"))
    return max(300, value if value is not None else 86400)


def _max_workers() -> int:
    value = _safe_int(os.getenv("PUB_ANALYTICS_MAX_CONCURRENT_JOBS", "2"))
    return max(1, value if value is not None else 2)


def _is_stale(*, computed_at: datetime | None, now: datetime) -> bool:
    if computed_at is None:
        return True
    return (now - _coerce_utc(computed_at)).total_seconds() > _ttl_seconds()


def _dimensions_enabled() -> bool:
    enabled = str(os.getenv("DIMENSIONS_METRICS_ENABLED", "")).strip().lower()
    if enabled not in {"1", "true", "yes", "on"}:
        return False
    api_key = str(os.getenv("DIMENSIONS_METRICS_API_KEY", "")).strip()
    return bool(api_key)


def _format_int(value: int | None) -> str:
    return f"{max(0, int(value or 0)):,}"


def _format_float(value: float | None, *, digits: int = 2) -> str:
    return f"{float(value or 0.0):,.{digits}f}"


def _format_pct(value: float | None, *, digits: int = 1) -> str:
    if value is None:
        return "n/a"
    return f"{value:+.{digits}f}%"


def _delta_direction(value: float | int | None) -> str:
    parsed = _safe_float(value)
    if parsed is None:
        return "na"
    if parsed > 0:
        return "up"
    if parsed < 0:
        return "down"
    return "flat"


def _delta_tone_for_metric(*, key: str, delta_value: float | int | None) -> str:
    parsed = _safe_float(delta_value)
    if parsed is None:
        return "neutral"
    metric_key = str(key or "").strip().lower()

    if metric_key in {"citations_last_12m", "yoy_change"}:
        if parsed < -10.0:
            return "negative"
        if parsed < 0.0:
            return "caution"
        if parsed <= 10.0:
            return "caution"
        return "positive"

    if metric_key == "citation_concentration_risk":
        # Lower concentration is better (less risk concentration).
        if parsed < 0:
            return "positive"
        if parsed > 10:
            return "negative"
        if parsed > 0:
            return "caution"
        return "neutral"

    if parsed > 0:
        return "positive"
    if parsed < 0:
        return "caution" if abs(parsed) < 10 else "negative"
    return "neutral"


def _delta_color_code_for_metric(*, key: str, delta_value: float | int | None) -> str:
    tone = _delta_tone_for_metric(key=key, delta_value=delta_value)
    return DELTA_COLOR_BY_TONE.get(tone, DELTA_COLOR_BY_TONE["neutral"])


def _update_frequency_label() -> str:
    return "Daily (24h TTL, stale-while-revalidate)."


def _build_tooltip(
    *,
    definition: str,
    data_sources: list[str],
    computation: str,
) -> tuple[str, dict[str, Any]]:
    sources_text = ", ".join([item for item in data_sources if str(item).strip()]) or "Not available"
    update_frequency = _update_frequency_label()
    tooltip = (
        f"{definition} "
        f"Data source: {sources_text}. "
        f"Computed as: {computation}. "
        f"Update frequency: {update_frequency}"
    )
    details = {
        "definition": definition,
        "data_sources": data_sources,
        "computation": computation,
        "update_frequency": update_frequency,
    }
    return tooltip, details


def _doi_url(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    if clean.lower().startswith("http://") or clean.lower().startswith("https://"):
        return clean
    return f"https://doi.org/{clean}"


def _confidence_score_from_publications(publications: list[dict[str, Any]]) -> float:
    values: list[float] = []
    for item in publications:
        if not isinstance(item, dict):
            continue
        parsed = _safe_float(item.get("confidence_score"))
        if parsed is None:
            continue
        values.append(max(0.0, min(1.0, float(parsed))))
    if not values:
        return 0.0
    return round(sum(values) / len(values), 2)


def _publication_item_with_links(item: dict[str, Any]) -> dict[str, Any]:
    row = dict(item)
    doi = str(row.get("doi") or "").strip() or None
    row["doi_url"] = _doi_url(doi)
    source = str(row.get("match_source") or "").strip()
    row["data_sources"] = [source] if source else []
    return row


def _concentration_risk_label(value: float) -> str:
    if value < 30.0:
        return "Low"
    if value <= 50.0:
        return "Moderate"
    return "High"


def _month_start(value: datetime) -> datetime:
    utc_value = _coerce_utc(value)
    return datetime(utc_value.year, utc_value.month, 1, tzinfo=timezone.utc)


def _shift_month(value: datetime, delta: int) -> datetime:
    month_index = (value.year * 12 + (value.month - 1)) + int(delta)
    year = month_index // 12
    month = (month_index % 12) + 1
    return datetime(year, month, 1, tzinfo=timezone.utc)


def _month_end(month_value: datetime, *, now: datetime) -> datetime:
    next_month = _shift_month(month_value, 1)
    end = next_month - timedelta(seconds=1)
    if month_value.year == now.year and month_value.month == now.month:
        return now
    return end


def _month_end_points(*, now: datetime, months: int) -> list[datetime]:
    current_month = _month_start(now)
    oldest_month = _shift_month(current_month, -months)
    points: list[datetime] = []
    for index in range(months + 1):
        month_value = _shift_month(oldest_month, index)
        points.append(_month_end(month_value, now=now))
    return points


def _extract_counts_by_year(rows: list[MetricsSnapshot], *, now_year: int) -> dict[int, int]:
    if not rows:
        return {}

    def _rank(item: MetricsSnapshot) -> tuple[int, datetime]:
        provider = str(item.provider or "").strip().lower()
        is_openalex = 1 if provider == "openalex" else 0
        return (is_openalex, _coerce_utc(item.captured_at))

    ordered = sorted(rows, key=_rank, reverse=True)
    for snapshot in ordered:
        payload = snapshot.metric_payload if isinstance(snapshot.metric_payload, dict) else {}
        raw = payload.get("counts_by_year")
        if not isinstance(raw, list):
            continue
        counts: dict[int, int] = {}
        for item in raw:
            if not isinstance(item, dict):
                continue
            year = _safe_int(item.get("year"))
            value = _safe_int(item.get("cited_by_count"))
            if value is None:
                value = _safe_int(item.get("citation_count"))
            if value is None:
                value = _safe_int(item.get("citations"))
            if year is None or value is None or year < 1900 or year > now_year:
                continue
            counts[year] = max(0, int(value))
        if counts:
            return counts
    return {}


def _estimate_window_citations(
    yearly_counts: dict[int, int], *, start: datetime, end: datetime, now: datetime
) -> int:
    if not yearly_counts:
        return 0
    start_utc = _coerce_utc(start)
    end_utc = _coerce_utc(end)
    now_utc = _coerce_utc(now)
    if end_utc <= start_utc:
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


def _monthly_from_yearly_counts(
    yearly_counts: dict[int, int], *, now: datetime, months: int = 24
) -> list[int]:
    if not yearly_counts:
        return [0 for _ in range(months)]
    oldest_month = _shift_month(_month_start(now), -months)
    values: list[int] = []
    for index in range(months):
        start = _shift_month(oldest_month, index)
        end = _shift_month(start, 1)
        if start.year == now.year and start.month == now.month:
            end = now
        values.append(
            _estimate_window_citations(yearly_counts, start=start, end=end, now=now)
        )
    return values


def _normalize_monthly_to_total(*, monthly_added: list[int], target_total: int) -> list[int]:
    clean = [max(0, int(value or 0)) for value in monthly_added]
    total = int(sum(clean))
    target = max(0, int(target_total or 0))
    if total <= 0:
        return [0 for _ in clean]
    if total <= target:
        return clean

    scaled = [int(round((value / total) * target)) for value in clean]
    diff = target - int(sum(scaled))
    if diff > 0:
        for index in range(len(scaled) - 1, -1, -1):
            if diff <= 0:
                break
            scaled[index] += 1
            diff -= 1
    elif diff < 0:
        for index in range(len(scaled) - 1, -1, -1):
            if diff >= 0:
                break
            removable = min(scaled[index], abs(diff))
            scaled[index] -= removable
            diff += removable
    return [max(0, int(value)) for value in scaled]


def _cumulative_from_monthly(*, monthly_added: list[int], target_total: int) -> list[int]:
    clean = _normalize_monthly_to_total(monthly_added=monthly_added, target_total=target_total)
    base = max(0, int(target_total or 0) - int(sum(clean)))
    cumulative: list[int] = [base]
    for value in clean:
        cumulative.append(cumulative[-1] + max(0, int(value or 0)))
    return cumulative


def _snapshot_rank(row: MetricsSnapshot) -> tuple[int, int, int, datetime]:
    citations = max(0, int(row.citations_count or 0))
    has_quality = int(row.influential_citations is not None or row.altmetric_score is not None)
    priority = _provider_priority(row.provider)
    captured = _coerce_utc(row.captured_at)
    return (citations, has_quality, priority, captured)


def _best_snapshot(rows: list[MetricsSnapshot]) -> MetricsSnapshot | None:
    if not rows:
        return None
    return max(rows, key=_snapshot_rank)


def _is_history_snapshot_usable(row: MetricsSnapshot) -> bool:
    payload = row.metric_payload if isinstance(row.metric_payload, dict) else {}
    note = str(payload.get("note") or "").strip().lower()
    if not note:
        return True
    if (
        "lookup unavailable" in note
        or "provider lookup failed" in note
        or "no confident" in note
        or "failed" in note
    ):
        return False
    return True


def _best_snapshot_at_or_before(
    rows: list[MetricsSnapshot],
    *,
    cutoff: datetime,
    preferred_provider: str | None = None,
    fallback_to_other_providers: bool = True,
) -> MetricsSnapshot | None:
    eligible = [
        row
        for row in rows
        if _coerce_utc(row.captured_at) <= cutoff and _is_history_snapshot_usable(row)
    ]
    if not eligible:
        return None
    preferred = str(preferred_provider or "").strip().lower()
    if preferred:
        preferred_rows = [
            row for row in eligible if str(row.provider or "").strip().lower() == preferred
        ]
        if preferred_rows:
            return max(preferred_rows, key=_snapshot_rank)
        if not fallback_to_other_providers:
            return None
    return max(eligible, key=_snapshot_rank)


def compute_h_index(citations: list[int]) -> int:
    values = sorted([max(0, int(v or 0)) for v in citations], reverse=True)
    h_value = 0
    for index, value in enumerate(values, start=1):
        if value >= index:
            h_value = index
        else:
            break
    return h_value


def compute_m_index(*, h_index: int, first_publication_year: int | None, current_year: int) -> float:
    first_year = int(first_publication_year or 0)
    if first_year < 1900 or first_year > current_year:
        return 0.0
    career_years = max(1, int(current_year) - first_year + 1)
    return round(max(0.0, float(h_index)) / float(career_years), 3)


def compute_yoy_percent(*, citations_last_12m: int, citations_prev_12m: int) -> float | None:
    current = max(0, int(citations_last_12m or 0))
    previous = max(0, int(citations_prev_12m or 0))
    if previous <= 0:
        return None
    return round(((current - previous) / previous) * 100.0, 1)


def compute_citation_momentum_score(monthly_last_12: list[int]) -> float:
    if not monthly_last_12:
        return 0.0
    values = [max(0, int(value or 0)) for value in monthly_last_12][-12:]
    if len(values) < 12:
        values = [0] * (12 - len(values)) + values
    older_nine = values[:9]
    latest_three = values[9:]
    score = float(sum(older_nine)) + (float(sum(latest_three)) * 1.5)
    return round(score, 2)


def compute_concentration_risk_percent(*, total_citations: int, top3_citations: int) -> float:
    total = max(0, int(total_citations or 0))
    head = max(0, int(top3_citations or 0))
    if total <= 0:
        return 0.0
    return round((head / total) * 100.0, 2)


def _extract_match_method(snapshot: MetricsSnapshot | None) -> str:
    if snapshot is None or not isinstance(snapshot.metric_payload, dict):
        return ""
    return str(snapshot.metric_payload.get("match_method") or "").strip().lower()


def _estimate_match_confidence(*, work: Work, snapshot: MetricsSnapshot | None) -> float:
    has_doi = bool(str(work.doi or "").strip())
    method = _extract_match_method(snapshot)
    if method == "doi":
        return 0.98
    if method == "pmid":
        return 0.92
    if method == "title":
        return 0.72 if has_doi else 0.66
    if snapshot is not None and has_doi:
        return 0.85
    if snapshot is not None:
        return 0.60
    if has_doi:
        return 0.55
    return 0.40


def _confidence_label(value: float) -> str:
    if value >= 0.85:
        return "HIGH"
    if value >= 0.65:
        return "MEDIUM"
    return "LOW"


def _confidence_note() -> str:
    return (
        "Confidence is based on identifier quality (DOI/PMID), provider match method, "
        "and whether matching required title/year fallback."
    )


def _series_to_sparkline(values: list[int | float], *, digits: int = 2) -> list[float]:
    output: list[float] = []
    for item in values:
        if isinstance(item, bool):
            output.append(0.0)
            continue
        if isinstance(item, (int, float)):
            output.append(round(float(item), digits))
            continue
        parsed = _safe_float(item)
        output.append(round(parsed if parsed is not None else 0.0, digits))
    return output


def _rolling_sum(values: list[int], window_size: int, index: int) -> int:
    start = max(0, index - window_size + 1)
    return int(sum(max(0, int(v or 0)) for v in values[start : index + 1]))


def _rolling_yoy_percent(values: list[int], index: int) -> float | None:
    current = _rolling_sum(values, 12, index)
    previous_start = max(0, index - 23)
    previous_end = max(0, index - 11)
    previous = int(sum(max(0, int(v or 0)) for v in values[previous_start:previous_end]))
    return compute_yoy_percent(citations_last_12m=current, citations_prev_12m=previous)


def _metric_tile(
    *,
    key: str,
    label: str,
    value: float | int | None,
    value_display: str,
    delta_value: float | int | None,
    delta_display: str | None,
    unit: str | None,
    sparkline: list[int | float],
    sparkline_overlay: list[int | float] | None = None,
    tooltip: str,
    tooltip_details: dict[str, Any],
    data_source: list[str],
    drilldown: dict[str, Any],
    confidence_score: float = 0.0,
    stability: str = "stable",
) -> dict[str, Any]:
    direction = _delta_direction(delta_value)
    tone = _delta_tone_for_metric(key=key, delta_value=delta_value)
    color = _delta_color_code_for_metric(key=key, delta_value=delta_value)
    return {
        "id": key,
        "key": key,
        "label": label,
        "main_value": value,
        "value": value,
        "main_value_display": value_display,
        "value_display": value_display,
        "delta_value": delta_value,
        "delta_display": delta_display,
        "delta_direction": direction,
        "delta_tone": tone,
        "delta_color_code": color,
        "unit": unit,
        "sparkline": _series_to_sparkline(sparkline),
        "sparkline_overlay": _series_to_sparkline(sparkline_overlay or []),
        "tooltip": tooltip,
        "tooltip_details": tooltip_details,
        "data_source": data_source,
        "confidence_score": round(max(0.0, min(1.0, float(confidence_score or 0.0))), 2),
        "stability": stability,
        "drilldown": drilldown,
    }


def _empty_metrics_payload() -> dict[str, Any]:
    return {
        "tiles": [],
        "data_sources": [],
        "data_last_refreshed": None,
        "metadata": {
            "schema_version": TOP_METRICS_SCHEMA_VERSION,
            "message": "Metrics are being computed in the background.",
        },
    }


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise PublicationMetricsNotFoundError(f"User '{user_id}' was not found.")
    return user


def _bundle_row_query(user_id: str):
    return select(PublicationMetric).where(
        PublicationMetric.user_id == user_id,
        PublicationMetric.metric_key == TOP_METRICS_KEY,
    )


def _load_bundle_row(session, *, user_id: str, for_update: bool = False) -> PublicationMetric | None:
    query = _bundle_row_query(user_id)
    if for_update:
        query = query.with_for_update()
    return session.scalars(query).first()


def _read_bundle_payload(row: PublicationMetric | None) -> dict[str, Any]:
    if row is None:
        return _empty_metrics_payload()
    payload = row.payload_json if isinstance(row.payload_json, dict) else {}
    if not payload:
        payload = row.metric_json if isinstance(row.metric_json, dict) else {}
    if not payload:
        return _empty_metrics_payload()
    return payload


def _upsert_source_cache(
    session,
    *,
    user_id: str,
    source: str,
    refresh_date: date,
    payload: dict[str, Any],
) -> None:
    row = session.scalars(
        select(PublicationMetricsSourceCache).where(
            PublicationMetricsSourceCache.user_id == user_id,
            PublicationMetricsSourceCache.source == source,
            PublicationMetricsSourceCache.refresh_date == refresh_date,
        )
    ).first()
    now = _utcnow()
    if row is None:
        row = PublicationMetricsSourceCache(
            user_id=user_id,
            source=source,
            refresh_date=refresh_date,
            payload_json=payload,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        return
    row.payload_json = payload
    row.updated_at = now


def _build_payload(session, *, user_id: str, computed_at: datetime) -> dict[str, Any]:
    user = _resolve_user_or_raise(session, user_id)
    works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
    now = _coerce_utc(computed_at)
    if not works:
        return {
            "tiles": [],
            "data_sources": ["ORCID"] if str(user.orcid_id or "").strip() else [],
            "data_last_refreshed": now.isoformat(),
            "metadata": {
                "schema_version": TOP_METRICS_SCHEMA_VERSION,
                "works_count": 0,
                "message": "No publications available.",
                "confidence_note": _confidence_note(),
            },
        }

    work_ids = [str(work.id) for work in works]
    snapshot_rows = session.scalars(
        select(MetricsSnapshot).where(MetricsSnapshot.work_id.in_(work_ids))
    ).all()
    snapshots_by_work: dict[str, list[MetricsSnapshot]] = {work_id: [] for work_id in work_ids}
    semantic_by_work: dict[str, list[MetricsSnapshot]] = {work_id: [] for work_id in work_ids}
    for row in snapshot_rows:
        work_id = str(row.work_id)
        snapshots_by_work.setdefault(work_id, []).append(row)
        provider = str(row.provider or "").strip().lower()
        if provider in {"semantic_scholar", "semanticscholar"}:
            semantic_by_work.setdefault(work_id, []).append(row)

    month_end_points = _month_end_points(now=now, months=24)
    cutoff_12 = now - timedelta(days=365)
    cutoff_24 = now - timedelta(days=730)
    per_work_rows: list[dict[str, Any]] = []
    monthly_added_totals = [0] * 24
    monthly_cumulative_totals = [0] * 25
    provider_counts_latest: dict[str, int] = {}
    window_basis_counts = {
        "yearly_counts": 0,
        "snapshot_delta": 0,
        "insufficient_history": 0,
    }

    for work in works:
        work_id = str(work.id)
        rows = snapshots_by_work.get(work_id, [])
        semantic_rows = semantic_by_work.get(work_id, [])
        latest = _best_snapshot(rows)
        latest_semantic = _best_snapshot(semantic_rows)
        latest_citations = (
            max(0, int(latest.citations_count or 0))
            if latest is not None
            else max(0, int(work.citations_total or 0))
        )
        latest_influential = (
            max(0, int(latest_semantic.influential_citations or 0))
            if latest_semantic is not None and latest_semantic.influential_citations is not None
            else None
        )
        latest_provider = str(latest.provider or "manual").strip().lower() if latest is not None else "manual"
        provider_counts_latest[latest_provider] = provider_counts_latest.get(latest_provider, 0) + 1

        yearly_counts = _extract_counts_by_year(rows, now_year=now.year)
        if yearly_counts:
            monthly_added = _monthly_from_yearly_counts(yearly_counts, now=now, months=24)
            monthly_added = _normalize_monthly_to_total(
                monthly_added=monthly_added,
                target_total=latest_citations,
            )
            cumulative_series = _cumulative_from_monthly(
                monthly_added=monthly_added,
                target_total=latest_citations,
            )
            last_12 = _estimate_window_citations(
                yearly_counts,
                start=cutoff_12,
                end=now,
                now=now,
            )
            prev_12 = _estimate_window_citations(
                yearly_counts,
                start=cutoff_24,
                end=cutoff_12,
                now=now,
            )
            if last_12 + prev_12 > latest_citations and latest_citations > 0:
                scale = latest_citations / max(1, last_12 + prev_12)
                last_12 = int(round(last_12 * scale))
                prev_12 = int(round(prev_12 * scale))
            window_basis = "yearly_counts"
        else:
            latest_provider = (
                str(latest.provider or "").strip().lower() if latest is not None else None
            )
            best_12 = _best_snapshot_at_or_before(
                rows,
                cutoff=cutoff_12,
                preferred_provider=latest_provider,
                fallback_to_other_providers=False,
            )
            best_24 = _best_snapshot_at_or_before(
                rows,
                cutoff=cutoff_24,
                preferred_provider=latest_provider,
                fallback_to_other_providers=False,
            )
            if best_12 is None:
                monthly_added = [0 for _ in range(24)]
                cumulative_series = [latest_citations for _ in range(25)]
                last_12 = 0
                prev_12 = 0
                window_basis = "insufficient_history"
            else:
                cumulative_from_snapshots: list[int] = []
                for endpoint in month_end_points:
                    best_at_endpoint = _best_snapshot_at_or_before(
                        rows,
                        cutoff=endpoint,
                        preferred_provider=latest_provider,
                        fallback_to_other_providers=False,
                    )
                    if best_at_endpoint is None:
                        cumulative_from_snapshots.append(0)
                    else:
                        cumulative_from_snapshots.append(
                            max(0, int(best_at_endpoint.citations_count or 0))
                        )
                monthly_added = [
                    max(0, cumulative_from_snapshots[index + 1] - cumulative_from_snapshots[index])
                    for index in range(24)
                ]
                monthly_added = _normalize_monthly_to_total(
                    monthly_added=monthly_added,
                    target_total=latest_citations,
                )
                cumulative_series = _cumulative_from_monthly(
                    monthly_added=monthly_added,
                    target_total=latest_citations,
                )
                baseline_12 = max(0, int(best_12.citations_count or 0))
                baseline_24 = max(0, int(best_24.citations_count or 0)) if best_24 is not None else 0
                last_12 = max(0, latest_citations - baseline_12)
                prev_12 = max(0, baseline_12 - baseline_24)
                window_basis = "snapshot_delta"

        semantic_latest_total = max(0, int(latest_influential or 0))
        semantic_12 = _best_snapshot_at_or_before(
            semantic_rows,
            cutoff=cutoff_12,
            preferred_provider="semantic_scholar",
            fallback_to_other_providers=False,
        )
        if semantic_12 is None:
            monthly_semantic_added = [0 for _ in range(24)]
            semantic_cumulative_series = [semantic_latest_total for _ in range(25)]
        else:
            semantic_cumulative_raw: list[int] = []
            for endpoint in month_end_points:
                semantic_at_endpoint = _best_snapshot_at_or_before(
                    semantic_rows,
                    cutoff=endpoint,
                    preferred_provider="semantic_scholar",
                    fallback_to_other_providers=False,
                )
                if semantic_at_endpoint is None or semantic_at_endpoint.influential_citations is None:
                    semantic_cumulative_raw.append(0)
                else:
                    semantic_cumulative_raw.append(
                        max(0, int(semantic_at_endpoint.influential_citations or 0))
                    )
            monthly_semantic_added = [
                max(
                    0,
                    semantic_cumulative_raw[index + 1] - semantic_cumulative_raw[index],
                )
                for index in range(24)
            ]
            monthly_semantic_added = _normalize_monthly_to_total(
                monthly_added=monthly_semantic_added,
                target_total=semantic_latest_total,
            )
            semantic_cumulative_series = _cumulative_from_monthly(
                monthly_added=monthly_semantic_added,
                target_total=semantic_latest_total,
            )

        window_basis_counts[window_basis] += 1
        momentum = compute_citation_momentum_score(monthly_added[-12:])
        confidence_score = _estimate_match_confidence(work=work, snapshot=latest)
        confidence_label = _confidence_label(confidence_score)
        match_method = _extract_match_method(latest)

        per_work_rows.append(
            {
                "work_id": work_id,
                "title": str(work.title or "").strip() or "Untitled",
                "year": int(work.year) if isinstance(work.year, int) else None,
                "journal": str(work.venue_name or "").strip() or str(work.journal or "").strip() or "Not available",
                "doi": str(work.doi or "").strip() or None,
                "pmid": str(work.pmid or "").strip() or None,
                "citations_lifetime": latest_citations,
                "citations_last_12m": last_12,
                "citations_prev_12m": prev_12,
                "yoy_delta": last_12 - prev_12,
                "momentum_contribution": momentum,
                "influential_citations": latest_influential,
                "influential_last_12m": int(sum(monthly_semantic_added[-12:])),
                "confidence_score": round(confidence_score, 2),
                "confidence_label": confidence_label,
                "match_method": match_method or "unknown",
                "match_source": latest_provider,
                "window_basis": window_basis,
                "monthly_added_24": monthly_added,
                "monthly_cumulative_25": cumulative_series,
                "semantic_monthly_added_24": monthly_semantic_added,
                "semantic_cumulative_25": semantic_cumulative_series,
            }
        )

        for index, value in enumerate(monthly_added):
            monthly_added_totals[index] += int(value or 0)
        for index, value in enumerate(cumulative_series):
            monthly_cumulative_totals[index] += int(value or 0)

    per_work_rows.sort(key=lambda row: int(row["citations_lifetime"]), reverse=True)

    total_citations = int(sum(int(row["citations_lifetime"]) for row in per_work_rows))
    citations_last_12m = int(sum(int(row["citations_last_12m"]) for row in per_work_rows))
    citations_prev_12m = int(sum(int(row["citations_prev_12m"]) for row in per_work_rows))
    yoy_pct = compute_yoy_percent(
        citations_last_12m=citations_last_12m,
        citations_prev_12m=citations_prev_12m,
    )
    yoy_delta = citations_last_12m - citations_prev_12m
    momentum_score = compute_citation_momentum_score(monthly_added_totals[-12:])
    top3_citations = int(sum(int(row["citations_lifetime"]) for row in per_work_rows[:3]))
    concentration_risk = compute_concentration_risk_percent(
        total_citations=total_citations,
        top3_citations=top3_citations,
    )

    citation_values = [int(row["citations_lifetime"]) for row in per_work_rows]
    h_index = compute_h_index(citation_values)
    first_publication_year: int | None = None
    for row in per_work_rows:
        year = row.get("year")
        if isinstance(year, int):
            if first_publication_year is None or year < first_publication_year:
                first_publication_year = year
    m_index = compute_m_index(
        h_index=h_index,
        first_publication_year=first_publication_year,
        current_year=now.year,
    )

    h_index_series: list[int] = []
    for month_index in range(13, 25):
        month_citations = [
            int(row["monthly_cumulative_25"][month_index]) for row in per_work_rows
        ]
        h_index_series.append(compute_h_index(month_citations))

    rolling_last_12_series = [
        _rolling_sum(monthly_added_totals, 12, index) for index in range(12, 24)
    ]
    yoy_series = [
        _rolling_yoy_percent(monthly_added_totals, index) for index in range(12, 24)
    ]
    momentum_series = [
        compute_citation_momentum_score(monthly_added_totals[max(0, index - 11) : index + 1])
        for index in range(12, 24)
    ]

    concentration_series: list[float] = []
    for month_index in range(13, 25):
        ranked = sorted(
            [int(row["monthly_cumulative_25"][month_index]) for row in per_work_rows],
            reverse=True,
        )
        total_month = int(sum(ranked))
        top3_month = int(sum(ranked[:3]))
        concentration_series.append(
            compute_concentration_risk_percent(
                total_citations=total_month,
                top3_citations=top3_month,
            )
        )

    influence_candidates = [
        row
        for row in per_work_rows
        if isinstance(row.get("influential_citations"), int)
    ]
    influence_available = len(influence_candidates) > 0
    influence_total = int(
        sum(int(row.get("influential_citations") or 0) for row in influence_candidates)
    )
    influence_last_12m = int(
        sum(int(row.get("influential_last_12m") or 0) for row in influence_candidates)
    )
    influence_series = [
        int(
            sum(int(row["semantic_cumulative_25"][month_index]) for row in influence_candidates)
        )
        for month_index in range(13, 25)
    ]

    data_sources: list[str] = []
    if str(user.orcid_id or "").strip():
        data_sources.append("ORCID")
    if provider_counts_latest.get("openalex", 0) > 0:
        data_sources.append("OpenAlex")
    if (
        provider_counts_latest.get("semantic_scholar", 0) > 0
        or provider_counts_latest.get("semanticscholar", 0) > 0
        or influence_available
    ):
        data_sources.append("Semantic Scholar")

    dimensions_tile: dict[str, Any] | None = None
    if _dimensions_enabled():
        dimensions_values: list[float] = []
        for row in snapshots_by_work.values():
            latest_dimensions = _best_snapshot(
                [item for item in row if str(item.provider or "").strip().lower() == "dimensions"]
            )
            if latest_dimensions is None or not isinstance(latest_dimensions.metric_payload, dict):
                continue
            parsed = _safe_float(latest_dimensions.metric_payload.get("field_normalized_impact"))
            if parsed is not None:
                dimensions_values.append(parsed)
        if dimensions_values:
            field_norm = round(sum(dimensions_values) / len(dimensions_values), 3)
            dimensions_tooltip, dimensions_tooltip_details = _build_tooltip(
                definition=(
                    "Average field-normalized citation impact across publications where Dimensions "
                    "returns Normalised Citation Impact."
                ),
                data_sources=["Dimensions Metrics"],
                computation="mean(field_normalized_impact)",
            )
            dimensions_tile = _metric_tile(
                key="field_normalized_impact",
                label="Field-normalized impact",
                value=field_norm,
                value_display=_format_float(field_norm, digits=3),
                delta_value=None,
                delta_display=None,
                unit="index",
                sparkline=[field_norm for _ in range(12)],
                tooltip=dimensions_tooltip,
                tooltip_details=dimensions_tooltip_details,
                data_source=["Dimensions Metrics"],
                confidence_score=1.0,
                stability="stable",
                drilldown={
                    "title": "Field-normalized impact",
                    "definition": (
                        "Average field-normalized impact across publications where "
                        "Dimensions provided metric values."
                    ),
                    "formula": "mean(field_normalized_impact)",
                    "confidence_note": _confidence_note(),
                    "publications": [],
                    "metadata": {
                        "intermediate_values": {
                            "field_normalized_values_count": len(dimensions_values),
                            "field_normalized_values_mean": field_norm,
                        }
                    },
                },
            )
            data_sources.append("Dimensions Metrics")

    confidence_average = (
        sum(float(row["confidence_score"]) for row in per_work_rows) / len(per_work_rows)
        if per_work_rows
        else 0.0
    )
    stability = "stable" if confidence_average >= 0.70 else "unstable"

    total_citation_publications = [
        _publication_item_with_links(
            {
            "work_id": row["work_id"],
            "title": row["title"],
            "doi": row["doi"],
            "year": row["year"],
            "journal": row["journal"],
            "citations_lifetime": row["citations_lifetime"],
            "confidence_score": row["confidence_score"],
            "confidence_label": row["confidence_label"],
            "match_source": row["match_source"],
            "match_method": row["match_method"],
            }
        )
        for row in per_work_rows[:100]
    ]

    h_threshold_publications = [
        _publication_item_with_links(
            {
            "work_id": row["work_id"],
            "title": row["title"],
            "doi": row["doi"],
            "year": row["year"],
            "journal": row["journal"],
            "citations_lifetime": row["citations_lifetime"],
            "meets_h_threshold": int(row["citations_lifetime"]) >= int(h_index),
            "confidence_score": row["confidence_score"],
            "confidence_label": row["confidence_label"],
            "match_source": row["match_source"],
            "match_method": row["match_method"],
            }
        )
        for row in per_work_rows[:100]
    ]

    growth_publications = sorted(
        [
            _publication_item_with_links(
                {
                "work_id": row["work_id"],
                "title": row["title"],
                "doi": row["doi"],
                "year": row["year"],
                "journal": row["journal"],
                "citations_last_12m": row["citations_last_12m"],
                "citations_prev_12m": row["citations_prev_12m"],
                "yoy_delta": row["yoy_delta"],
                "confidence_score": row["confidence_score"],
                "confidence_label": row["confidence_label"],
                "match_source": row["match_source"],
                "match_method": row["match_method"],
                }
            )
            for row in per_work_rows
        ],
        key=lambda item: (int(item["citations_last_12m"]), int(item["yoy_delta"])),
        reverse=True,
    )[:100]

    momentum_publications = sorted(
        [
            _publication_item_with_links(
                {
                "work_id": row["work_id"],
                "title": row["title"],
                "doi": row["doi"],
                "year": row["year"],
                "journal": row["journal"],
                "momentum_contribution": row["momentum_contribution"],
                "citations_last_12m": row["citations_last_12m"],
                "confidence_score": row["confidence_score"],
                "confidence_label": row["confidence_label"],
                "match_source": row["match_source"],
                "match_method": row["match_method"],
                }
            )
            for row in per_work_rows
        ],
        key=lambda item: float(item["momentum_contribution"]),
        reverse=True,
    )[:100]

    concentration_publications = [
        _publication_item_with_links(
            {
            "work_id": row["work_id"],
            "title": row["title"],
            "doi": row["doi"],
            "year": row["year"],
            "journal": row["journal"],
            "citations_lifetime": row["citations_lifetime"],
            "share_of_total_pct": round(
                (int(row["citations_lifetime"]) / total_citations) * 100.0, 2
            )
            if total_citations > 0
            else 0.0,
            "confidence_score": row["confidence_score"],
            "confidence_label": row["confidence_label"],
            "match_source": row["match_source"],
            "match_method": row["match_method"],
            }
        )
        for row in per_work_rows[:3]
    ]

    influence_publications = sorted(
        [
            _publication_item_with_links(
                {
                "work_id": row["work_id"],
                "title": row["title"],
                "doi": row["doi"],
                "year": row["year"],
                "journal": row["journal"],
                "influential_citations": int(row.get("influential_citations") or 0),
                "influential_last_12m": int(row.get("influential_last_12m") or 0),
                "confidence_score": row["confidence_score"],
                "confidence_label": row["confidence_label"],
                "match_source": row["match_source"],
                "match_method": row["match_method"],
                }
            )
            for row in influence_candidates
        ],
        key=lambda item: int(item["influential_citations"]),
        reverse=True,
    )[:100]

    momentum_previous_score = compute_citation_momentum_score(monthly_added_totals[:12])
    momentum_delta = round(momentum_score - momentum_previous_score, 2)
    concentration_previous = concentration_series[0] if concentration_series else 0.0
    concentration_delta = round(concentration_risk - concentration_previous, 2)
    yoy_series_numbers = [0.0 if value is None else float(value) for value in yoy_series]
    has_insufficient_history = window_basis_counts["insufficient_history"] > 0
    yoy_stability = (
        "stable"
        if citations_prev_12m > 0 and not has_insufficient_history
        else "unstable"
    )
    last12_stability = "unstable" if has_insufficient_history else "stable"

    rolling_last_12_series_24 = [
        _rolling_sum(monthly_added_totals, 12, index) for index in range(24)
    ]
    momentum_weighted_monthly = [
        round(float(value) * (1.5 if index >= 9 else 1.0), 2)
        for index, value in enumerate(monthly_added_totals[-12:])
    ]
    influence_monthly_added_totals = [0 for _ in range(24)]
    for row in influence_candidates:
        additions = row.get("semantic_monthly_added_24")
        if not isinstance(additions, list):
            continue
        for idx in range(min(24, len(additions))):
            influence_monthly_added_totals[idx] += max(0, int(additions[idx] or 0))

    concentration_label = _concentration_risk_label(float(concentration_risk))

    total_tooltip, total_tooltip_details = _build_tooltip(
        definition="Lifetime citations across all publications in your portfolio.",
        data_sources=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
        computation="sum(latest_citations_per_publication)",
    )
    h_tooltip, h_tooltip_details = _build_tooltip(
        definition="h-index and m-index summarize sustained publication impact over career length.",
        data_sources=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
        computation=(
            "h = max(h such that >= h papers have >= h citations); "
            "m = h / years_since_first_publication"
        ),
    )
    roll12_tooltip, roll12_tooltip_details = _build_tooltip(
        definition=(
            "Citations gained in the most recent rolling 12-month window; delta compares with the previous 12-month window."
        ),
        data_sources=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
        computation="sum(monthly_citation_growth[-12:]) vs sum(monthly_citation_growth[-24:-12])",
    )
    yoy_tooltip, yoy_tooltip_details = _build_tooltip(
        definition="Year-over-year change in citations comparing last 12 months with previous 12 months.",
        data_sources=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
        computation="((citations_last_12m - citations_prev_12m) / citations_prev_12m) * 100",
    )
    momentum_tooltip, momentum_tooltip_details = _build_tooltip(
        definition="Weighted citation momentum emphasizing the most recent quarter.",
        data_sources=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
        computation="(sum(months[-3:]) * 1.5) + sum(months[-12:-3])",
    )
    concentration_tooltip, concentration_tooltip_details = _build_tooltip(
        definition=(
            "Citation concentration risk is the percentage of lifetime citations coming from your top 3 publications."
        ),
        data_sources=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
        computation="(sum(top_3_paper_citations) / total_citations) * 100",
    )
    influence_tooltip, influence_tooltip_details = _build_tooltip(
        definition="Influence-weighted citations from Semantic Scholar influentialCitationCount.",
        data_sources=["Semantic Scholar"],
        computation="sum(semantic_scholar.influentialCitationCount)",
    )

    tiles = [
        _metric_tile(
            key="total_citations_lifetime",
            label="Total citations",
            value=total_citations,
            value_display=_format_int(total_citations),
            delta_value=citations_last_12m,
            delta_display=f"+{_format_int(citations_last_12m)} in last 12 months",
            unit="citations",
            sparkline=monthly_cumulative_totals[1:],
            tooltip=total_tooltip,
            tooltip_details=total_tooltip_details,
            data_source=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
            confidence_score=_confidence_score_from_publications(total_citation_publications),
            stability=stability,
            drilldown={
                "title": "Total citations (lifetime)",
                "definition": "Sum of latest known citation counts for all publications.",
                "formula": "sum(latest_citations_per_publication)",
                "confidence_note": _confidence_note(),
                "publications": total_citation_publications,
                "metadata": {
                    "intermediate_values": {
                        "total_citations": total_citations,
                        "citations_last_12_months": citations_last_12m,
                    },
                    "data_sources": [src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
                },
            },
        ),
        _metric_tile(
            key="h_index_m_index",
            label="h-index / m-index",
            value=h_index,
            value_display=f"h {h_index} | m {_format_float(m_index, digits=2)}",
            delta_value=m_index,
            delta_display=f"m-index {_format_float(m_index, digits=2)}",
            unit="index",
            sparkline=h_index_series,
            tooltip=h_tooltip,
            tooltip_details=h_tooltip_details,
            data_source=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
            confidence_score=_confidence_score_from_publications(h_threshold_publications),
            stability=stability,
            drilldown={
                "title": "h-index and m-index",
                "definition": (
                    "h-index captures scale and consistency of citation impact. "
                    "m-index normalizes h-index by academic career length."
                ),
                "formula": (
                    "h = max(h such that >= h papers have >= h citations); "
                    "m = h / years_since_first_publication"
                ),
                "confidence_note": _confidence_note(),
                "publications": h_threshold_publications,
                "metadata": {
                    "intermediate_values": {
                        "h_index": h_index,
                        "m_index": m_index,
                        "first_publication_year": first_publication_year,
                    },
                    "data_sources": [src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
                },
            },
        ),
        _metric_tile(
            key="citations_last_12m",
            label="Citations (rolling 12m)",
            value=citations_last_12m,
            value_display=_format_int(citations_last_12m),
            delta_value=yoy_pct,
            delta_display=_format_pct(yoy_pct),
            unit="citations",
            sparkline=monthly_added_totals[-12:],
            tooltip=roll12_tooltip,
            tooltip_details=roll12_tooltip_details,
            data_source=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
            confidence_score=_confidence_score_from_publications(growth_publications),
            stability=last12_stability,
            drilldown={
                "title": "Citations (rolling last 12 months)",
                "definition": "Sum of citation growth over the latest 12 months.",
                "formula": "sum(monthly_citation_growth[-12:])",
                "confidence_note": _confidence_note(),
                "publications": growth_publications,
                "metadata": {
                    "intermediate_values": {
                        "citations_last_12m": citations_last_12m,
                        "citations_prev_12m": citations_prev_12m,
                        "yoy_pct": yoy_pct,
                    },
                    "raw_monthly_citations_12m": monthly_added_totals[-12:],
                },
            },
        ),
        _metric_tile(
            key="yoy_change",
            label="YoY change",
            value=yoy_pct,
            value_display=_format_pct(yoy_pct),
            delta_value=yoy_delta,
            delta_display=f"{yoy_delta:+,} citations",
            unit="percent",
            sparkline=monthly_added_totals[-24:],
            sparkline_overlay=rolling_last_12_series_24,
            tooltip=yoy_tooltip,
            tooltip_details=yoy_tooltip_details,
            data_source=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
            confidence_score=_confidence_score_from_publications(growth_publications),
            stability=yoy_stability,
            drilldown={
                "title": "Year-over-year citation change",
                "definition": "Compares recent 12-month citation gain to the prior 12-month window.",
                "formula": "((citations_last_12m - citations_prev_12m) / citations_prev_12m) * 100",
                "confidence_note": _confidence_note(),
                "publications": growth_publications,
                "metadata": {
                    "intermediate_values": {
                        "citations_last_12m": citations_last_12m,
                        "citations_prev_12m": citations_prev_12m,
                        "yoy_pct": yoy_pct,
                        "yoy_delta": yoy_delta,
                    },
                    "raw_monthly_citations_24m": monthly_added_totals[-24:],
                    "rolling_12m_overlay_24m": rolling_last_12_series_24,
                    "yoy_series_12m": yoy_series_numbers,
                },
            },
        ),
        _metric_tile(
            key="citation_momentum",
            label="Citation momentum score",
            value=momentum_score,
            value_display=_format_float(momentum_score, digits=2),
            delta_value=momentum_delta,
            delta_display=f"{momentum_delta:+.2f} vs previous 12m window",
            unit="score",
            sparkline=momentum_weighted_monthly,
            tooltip=momentum_tooltip,
            tooltip_details=momentum_tooltip_details,
            data_source=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
            confidence_score=_confidence_score_from_publications(momentum_publications),
            stability="stable",
            drilldown={
                "title": "Citation momentum score",
                "definition": "Weighted recency score emphasizing the latest quarter.",
                "formula": "(sum(months[-3:]) * 1.5) + sum(months[-12:-3])",
                "confidence_note": _confidence_note(),
                "publications": momentum_publications,
                "metadata": {
                    "intermediate_values": {
                        "momentum_score_last_12m": momentum_score,
                        "momentum_score_prev_12m": momentum_previous_score,
                        "momentum_delta": momentum_delta,
                    },
                    "weighted_monthly_values_12m": momentum_weighted_monthly,
                },
            },
        ),
        _metric_tile(
            key="citation_concentration_risk",
            label="Citation concentration risk",
            value=concentration_risk,
            value_display=f"{concentration_risk:.2f}%",
            delta_value=concentration_delta,
            delta_display=f"{concentration_label} risk | {concentration_delta:+.2f}pp",
            unit="percent",
            sparkline=concentration_series,
            tooltip=concentration_tooltip,
            tooltip_details=concentration_tooltip_details,
            data_source=[src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}],
            confidence_score=_confidence_score_from_publications(concentration_publications),
            stability="unstable" if concentration_risk >= 70.0 else "stable",
            drilldown={
                "title": "Citation concentration risk",
                "definition": "Share of lifetime citations concentrated in the top 3 papers.",
                "formula": "(sum(top_3_paper_citations) / total_citations) * 100",
                "confidence_note": _confidence_note(),
                "publications": concentration_publications,
                "metadata": {
                    "intermediate_values": {
                        "top3_citations": top3_citations,
                        "total_citations": total_citations,
                        "risk_percent": concentration_risk,
                        "risk_label": concentration_label,
                    },
                    "concentration_series_12m": concentration_series,
                },
            },
        ),
    ]

    if influence_available:
        influence_prev_12m = max(0, int(sum(influence_monthly_added_totals[:12])))
        influence_delta = influence_last_12m - influence_prev_12m
        tiles.append(
            _metric_tile(
                key="influence_weighted_citations",
                label="Influence-weighted citations",
                value=influence_total,
                value_display=_format_int(influence_total),
                delta_value=influence_delta,
                delta_display=f"{influence_delta:+,} vs previous 12m",
                unit="influential citations",
                sparkline=influence_monthly_added_totals[-12:],
                tooltip=influence_tooltip,
                tooltip_details=influence_tooltip_details,
                data_source=["Semantic Scholar"],
                confidence_score=_confidence_score_from_publications(influence_publications),
                stability="stable",
                drilldown={
                    "title": "Influence-weighted citations",
                    "definition": "Total influential citations aggregated from Semantic Scholar.",
                    "formula": "sum(semantic_scholar.influentialCitationCount)",
                    "confidence_note": _confidence_note(),
                    "publications": influence_publications,
                    "metadata": {
                        "intermediate_values": {
                            "influence_total": influence_total,
                            "influence_last_12m": influence_last_12m,
                            "influence_prev_12m": influence_prev_12m,
                            "influence_delta": influence_delta,
                        },
                        "influential_monthly_counts_24m": influence_monthly_added_totals,
                    },
                },
            )
        )

    if dimensions_tile is not None:
        tiles.append(dimensions_tile)

    refresh_date = now.date()
    source_payload = {
        "works_count": len(per_work_rows),
        "provider_counts_latest": provider_counts_latest,
        "computed_at": now.isoformat(),
    }
    for source in data_sources:
        source_key = source.strip().lower().replace(" ", "_")
        _upsert_source_cache(
            session,
            user_id=user_id,
            source=source_key,
            refresh_date=refresh_date,
            payload=source_payload,
        )

    return {
        "tiles": tiles[:8],
        "data_sources": data_sources,
        "data_last_refreshed": now.isoformat(),
        "metadata": {
            "schema_version": TOP_METRICS_SCHEMA_VERSION,
            "works_count": len(per_work_rows),
            "confidence_note": _confidence_note(),
            "provider_counts_latest": provider_counts_latest,
            "window_basis_counts": window_basis_counts,
            "citations_prev_12m": citations_prev_12m,
            "update_frequency": _update_frequency_label(),
            "sparkline_sets": {
                "raw_monthly_citations_24m": _series_to_sparkline(monthly_added_totals),
                "rolling_citations_12m": _series_to_sparkline(rolling_last_12_series_24),
                "momentum_weighted_monthly_12m": _series_to_sparkline(momentum_weighted_monthly),
                "influential_monthly_citations_24m": _series_to_sparkline(influence_monthly_added_totals),
                "concentration_risk_12m": _series_to_sparkline(concentration_series),
            },
        },
    }


def _persist_ready_bundle(*, user_id: str, payload: dict[str, Any], computed_at: datetime) -> None:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        row = _load_bundle_row(session, user_id=user_id, for_update=True)
        if row is None:
            row = PublicationMetric(
                user_id=user_id,
                metric_key=TOP_METRICS_KEY,
                metric_json=payload,
                payload_json=payload,
                status=READY_STATUS,
                last_error=None,
                computed_at=computed_at,
                updated_at=computed_at,
                orcid_id=str(user.orcid_id or "").strip() or None,
            )
            session.add(row)
            session.flush()
            return
        row.metric_json = payload
        row.payload_json = payload
        row.status = READY_STATUS
        row.last_error = None
        row.computed_at = computed_at
        row.updated_at = computed_at
        row.orcid_id = str(user.orcid_id or "").strip() or None
        session.flush()


def _persist_failed_bundle(*, user_id: str, detail: str) -> None:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        now = _utcnow()
        row = _load_bundle_row(session, user_id=user_id, for_update=True)
        if row is None:
            row = PublicationMetric(
                user_id=user_id,
                metric_key=TOP_METRICS_KEY,
                metric_json=_empty_metrics_payload(),
                payload_json=_empty_metrics_payload(),
                status=FAILED_STATUS,
                last_error=str(detail or "")[:2000],
                computed_at=now,
                updated_at=now,
            )
            session.add(row)
            session.flush()
            return
        if not isinstance(row.payload_json, dict) or not row.payload_json:
            row.payload_json = _empty_metrics_payload()
        row.status = FAILED_STATUS
        row.last_error = str(detail or "")[:2000]
        row.updated_at = now
        session.flush()


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(
                max_workers=_max_workers(),
                thread_name_prefix="pub-top-metrics",
            )
        return _executor


def _run_background_compute(user_id: str) -> None:
    try:
        compute_publication_top_metrics(user_id=user_id)
    except Exception as exc:
        _persist_failed_bundle(
            user_id=user_id,
            detail=f"Failed to compute publication top metrics: {exc}",
        )
    finally:
        with _inflight_lock:
            _inflight_users.discard(user_id)


def _mark_job_running(*, user_id: str, force: bool) -> bool:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        now = _utcnow()
        row = _load_bundle_row(session, user_id=user_id, for_update=True)
        if row is None:
            row = PublicationMetric(
                user_id=user_id,
                metric_key=TOP_METRICS_KEY,
                metric_json=_empty_metrics_payload(),
                payload_json=_empty_metrics_payload(),
                status=RUNNING_STATUS,
                last_error=None,
                computed_at=now,
                updated_at=now,
            )
            session.add(row)
            session.flush()
            return True
        status = _normalize_status(row.status)
        if status == RUNNING_STATUS and not force:
            return False
        row.status = RUNNING_STATUS
        row.last_error = None
        row.updated_at = now
        session.flush()
        return True


def enqueue_publication_top_metrics_refresh(
    *,
    user_id: str,
    reason: str = "manual",
    force: bool = False,
) -> bool:
    create_all_tables()
    marked = _mark_job_running(user_id=user_id, force=force)
    if not marked:
        return False
    with _inflight_lock:
        if user_id in _inflight_users:
            return False
        _inflight_users.add(user_id)
    try:
        _get_executor().submit(_run_background_compute, user_id)
        logger.info(
            "publication_top_metrics_enqueued",
            extra={"user_id": user_id, "reason": reason},
        )
        return True
    except Exception as exc:
        _persist_failed_bundle(
            user_id=user_id,
            detail=f"Failed to enqueue publication top metrics refresh: {exc}",
        )
        with _inflight_lock:
            _inflight_users.discard(user_id)
        return False


def compute_publication_top_metrics(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    computed_at = _utcnow()
    with session_scope() as session:
        payload = _build_payload(session, user_id=user_id, computed_at=computed_at)
    _persist_ready_bundle(user_id=user_id, payload=payload, computed_at=computed_at)
    return payload


def _response_from_row(
    row: PublicationMetric | None, *, status_override: str | None = None
) -> dict[str, Any]:
    payload = _read_bundle_payload(row)
    computed_at = row.computed_at if row is not None else None
    status = _normalize_status(
        status_override or (row.status if row is not None else RUNNING_STATUS)
    )
    now = _utcnow()
    stale = _is_stale(
        computed_at=_coerce_utc(computed_at) if computed_at else None,
        now=now,
    )
    return {
        "tiles": payload.get("tiles", []),
        "data_sources": payload.get("data_sources", []),
        "data_last_refreshed": payload.get("data_last_refreshed"),
        "metadata": payload.get("metadata", {}),
        "computed_at": computed_at,
        "status": status,
        "is_stale": stale,
        "is_updating": status == RUNNING_STATUS,
        "last_error": str(row.last_error or "").strip() or None if row is not None else None,
    }


def get_publication_top_metrics(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    enqueue = False
    response: dict[str, Any]
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        row = _load_bundle_row(session, user_id=user_id)
        if row is None:
            response = _response_from_row(None, status_override=RUNNING_STATUS)
            enqueue = True
        else:
            status = _normalize_status(row.status)
            computed_at = _coerce_utc(row.computed_at) if row.computed_at is not None else None
            stale = _is_stale(computed_at=computed_at, now=_utcnow())
            payload = _read_bundle_payload(row)
            metadata = payload.get("metadata") if isinstance(payload, dict) else {}
            schema_version = (
                _safe_int(metadata.get("schema_version")) if isinstance(metadata, dict) else None
            )
            schema_outdated = (schema_version or 0) < TOP_METRICS_SCHEMA_VERSION
            if (stale or schema_outdated) and status != RUNNING_STATUS:
                enqueue = True
                status = RUNNING_STATUS
            response = _response_from_row(row, status_override=status)
            response["is_stale"] = bool(response.get("is_stale")) or schema_outdated
    if enqueue:
        enqueue_publication_top_metrics_refresh(user_id=user_id, reason="stale_read")
    return response


def get_publication_metric_detail(*, user_id: str, metric_id: str) -> dict[str, Any]:
    response = get_publication_top_metrics(user_id=user_id)
    metric_key = str(metric_id or "").strip()
    if not metric_key:
        raise PublicationMetricsValidationError("metric_id is required.")

    tiles = response.get("tiles")
    if not isinstance(tiles, list):
        raise PublicationMetricsNotFoundError("Publication metrics payload is unavailable.")

    for tile in tiles:
        if not isinstance(tile, dict):
            continue
        tile_key = str(tile.get("key") or tile.get("id") or "").strip()
        if tile_key == metric_key:
            return {
                "metric_id": metric_key,
                "tile": tile,
                "data_sources": response.get("data_sources", []),
                "data_last_refreshed": response.get("data_last_refreshed"),
                "computed_at": response.get("computed_at"),
                "status": response.get("status", RUNNING_STATUS),
                "is_stale": bool(response.get("is_stale")),
                "is_updating": bool(response.get("is_updating")),
                "last_error": response.get("last_error"),
            }

    raise PublicationMetricsNotFoundError(f"Metric '{metric_key}' was not found.")


def trigger_publication_top_metrics_refresh(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    enqueued = enqueue_publication_top_metrics_refresh(
        user_id=user_id,
        reason="api_refresh",
        force=True,
    )
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        row = _load_bundle_row(session, user_id=user_id)
        status = _normalize_status(row.status if row is not None else RUNNING_STATUS)
    return {
        "enqueued": bool(enqueued),
        "status": status,
        "metric_key": TOP_METRICS_KEY,
    }

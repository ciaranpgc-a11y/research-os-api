from __future__ import annotations

from bisect import bisect_left, bisect_right
import logging
import math
import os
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select

from research_os.db import (
    Collaborator,
    CollaboratorAffiliation,
    MetricsSnapshot,
    PublicationMetric,
    PublicationMetricsSourceCache,
    User,
    Work,
    WorkAuthorship,
    create_all_tables,
    session_scope,
)
from research_os.services.api_telemetry_service import record_api_usage_event

logger = logging.getLogger(__name__)

READY_STATUS = "READY"
RUNNING_STATUS = "RUNNING"
FAILED_STATUS = "FAILED"
STATUSES = {READY_STATUS, RUNNING_STATUS, FAILED_STATUS}
TOP_METRICS_KEY = "top_metrics_strip_v1"
TOP_METRICS_SCHEMA_VERSION = 22
RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
FIELD_PERCENTILE_THRESHOLDS = [50, 75, 90, 95, 99]
DRILLDOWN_TILE_ID_BY_KEY = {
    "this_year_vs_last": "t1_total_publications",
    "total_citations": "t2_total_citations",
    "momentum": "t3_momentum",
    "h_index_projection": "t4_h_index",
    "impact_concentration": "t5_impact_concentration",
    "influential_citations": "t6_influential_citations",
    "field_percentile_share": "t7_field_percentile_share",
    "authorship_composition": "t8_authorship_composition",
    "collaboration_structure": "t9_collaboration_structure",
}

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


def _safe_publication_month_start(value: Any) -> date | None:
    if isinstance(value, datetime):
        return date(value.year, value.month, 1)
    if isinstance(value, date):
        return date(value.year, value.month, 1)
    token = str(value or "").strip()
    if not token:
        return None
    if len(token) >= 7:
        prefix = token[:7]
        try:
            parsed = datetime.strptime(prefix, "%Y-%m")
            return date(parsed.year, parsed.month, 1)
        except Exception:
            pass
    try:
        normalized = token.replace("Z", "+00:00")
        parsed_dt = datetime.fromisoformat(normalized)
        return date(parsed_dt.year, parsed_dt.month, 1)
    except Exception:
        return None


def _safe_publication_date_iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    token = str(value or "").strip()
    if not token:
        return None
    normalized = token.replace("/", "-").replace("Z", "+00:00")
    try:
        parsed_dt = datetime.fromisoformat(normalized)
        return parsed_dt.date().isoformat()
    except Exception:
        pass
    parts = normalized.split("-")
    if len(parts) >= 2:
        year = _safe_int(parts[0])
        month = _safe_int(parts[1])
        day = _safe_int(parts[2]) if len(parts) >= 3 else 1
        if (
            year is not None
            and month is not None
            and day is not None
            and 1 <= int(month) <= 12
            and 1 <= int(day) <= 31
        ):
            try:
                return date(int(year), int(month), int(day)).isoformat()
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
    # Extended to 7 days (604800s) to reduce unnecessary recalculations
    # Metrics are auto-recomputed when new publications are imported
    value = _safe_int(os.getenv("PUB_ANALYTICS_TTL_SECONDS", "604800"))
    return max(300, value if value is not None else 604800)


def _max_workers() -> int:
    value = _safe_int(os.getenv("PUB_ANALYTICS_MAX_CONCURRENT_JOBS", "2"))
    return max(1, value if value is not None else 2)


def _openalex_timeout_seconds() -> float:
    value = _safe_float(os.getenv("PUB_ANALYTICS_OPENALEX_TIMEOUT_SECONDS", "12"))
    return max(5.0, value if value is not None else 12.0)


def _openalex_retry_count() -> int:
    value = _safe_int(os.getenv("PUB_ANALYTICS_OPENALEX_RETRY_COUNT", "2"))
    return max(0, min(6, value if value is not None else 2))


def _openalex_field_cohort_max_pages() -> int:
    value = _safe_int(os.getenv("PUB_METRICS_FIELD_PERCENTILE_MAX_PAGES", "3"))
    return max(1, min(20, value if value is not None else 3))


def _openalex_field_cohort_min_size() -> int:
    value = _safe_int(os.getenv("PUB_METRICS_FIELD_PERCENTILE_MIN_COHORT", "100"))
    return max(20, value if value is not None else 100)


def _openalex_field_percentile_max_exact_ranks() -> int:
    value = _safe_int(os.getenv("PUB_METRICS_FIELD_PERCENTILE_MAX_EXACT_RANKS", "120"))
    return max(0, min(5000, value if value is not None else 120))


def _openalex_field_percentile_exact_runtime_seconds() -> float:
    value = _safe_float(
        os.getenv("PUB_METRICS_FIELD_PERCENTILE_EXACT_RUNTIME_SECONDS", "25")
    )
    return max(2.0, min(300.0, value if value is not None else 25.0))


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

    if metric_key in {"this_year_vs_last"}:
        if parsed <= -25.0:
            return "negative"
        if parsed < 0.0:
            return "caution"
        if parsed <= 10.0:
            return "neutral"
        return "positive"

    if metric_key in {"momentum"}:
        if parsed < -10.0:
            return "negative"
        if parsed < 0.0:
            return "caution"
        if parsed <= 10.0:
            return "neutral"
        return "positive"

    if metric_key in {"h_index_projection"}:
        if parsed >= 60.0:
            return "positive"
        if parsed >= 35.0:
            return "neutral"
        return "caution"

    if metric_key in {"impact_concentration"}:
        # Lower concentration is better (more diversified impact).
        if parsed < 0:
            return "positive"
        if parsed > 10:
            return "negative"
        if parsed > 0:
            return "caution"
        return "neutral"

    if metric_key in {"influential_citations"}:
        if parsed > 5.0:
            return "positive"
        if parsed < -5.0:
            return "negative"
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
    sources_text = (
        ", ".join([item for item in data_sources if str(item).strip()])
        or "Not available"
    )
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


def _openalex_request_with_retry(*, url: str, params: dict[str, Any]) -> dict[str, Any]:
    timeout = httpx.Timeout(_openalex_timeout_seconds())
    retries = _openalex_retry_count()
    last_exception: Exception | None = None
    with httpx.Client(timeout=timeout) as client:
        for attempt in range(retries + 1):
            started = time.perf_counter()
            try:
                response = client.get(url, params=params)
            except Exception as exc:
                last_exception = exc
                record_api_usage_event(
                    provider="openalex",
                    operation="publication_metrics_lookup",
                    endpoint=url,
                    success=False,
                    duration_ms=int((time.perf_counter() - started) * 1000),
                    error_code=type(exc).__name__,
                )
                if attempt < retries:
                    time.sleep(0.35 * (attempt + 1))
                    continue
                break
            if response.status_code < 400:
                payload = response.json()
                record_api_usage_event(
                    provider="openalex",
                    operation="publication_metrics_lookup",
                    endpoint=url,
                    success=True,
                    status_code=response.status_code,
                    duration_ms=int((time.perf_counter() - started) * 1000),
                )
                return payload if isinstance(payload, dict) else {}
            record_api_usage_event(
                provider="openalex",
                operation="publication_metrics_lookup",
                endpoint=url,
                success=False,
                status_code=response.status_code,
                duration_ms=int((time.perf_counter() - started) * 1000),
                error_code=f"http_{response.status_code}",
            )
            if response.status_code not in RETRYABLE_STATUS_CODES or attempt >= retries:
                return {}
            time.sleep(0.35 * (attempt + 1))
    if last_exception:
        logger.warning(
            "publication_metrics_openalex_lookup_failed",
            extra={"detail": str(last_exception)},
        )
    return {}


def _extract_openalex_work_id(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    clean = clean.rstrip("/")
    if clean.startswith("https://api.openalex.org/works/"):
        clean = clean.removeprefix("https://api.openalex.org/works/")
    elif clean.startswith("http://api.openalex.org/works/"):
        clean = clean.removeprefix("http://api.openalex.org/works/")
    elif clean.startswith("https://openalex.org/"):
        clean = clean.removeprefix("https://openalex.org/")
    elif clean.startswith("http://openalex.org/"):
        clean = clean.removeprefix("http://openalex.org/")
    clean = clean.strip().strip("/")
    if not clean:
        return None
    token = clean.split("/")[-1].strip()
    if not token:
        return None
    if token[0].lower() == "w":
        return token.upper()
    return None


def _normalize_openalex_field_id(value: Any) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    clean = clean.rstrip("/")
    if clean.startswith("https://api.openalex.org/fields/"):
        suffix = clean.removeprefix("https://api.openalex.org/fields/").strip("/")
        return f"https://openalex.org/fields/{suffix}" if suffix else None
    if clean.startswith("http://api.openalex.org/fields/"):
        suffix = clean.removeprefix("http://api.openalex.org/fields/").strip("/")
        return f"https://openalex.org/fields/{suffix}" if suffix else None
    if clean.startswith("https://openalex.org/fields/"):
        suffix = clean.removeprefix("https://openalex.org/fields/").strip("/")
        return f"https://openalex.org/fields/{suffix}" if suffix else None
    if clean.startswith("http://openalex.org/fields/"):
        suffix = clean.removeprefix("http://openalex.org/fields/").strip("/")
        return f"https://openalex.org/fields/{suffix}" if suffix else None
    if clean.startswith("https://openalex.org/"):
        suffix = clean.removeprefix("https://openalex.org/").strip("/")
        return f"https://openalex.org/{suffix}" if suffix else None
    if clean.startswith("http://openalex.org/"):
        suffix = clean.removeprefix("http://openalex.org/").strip("/")
        return f"https://openalex.org/{suffix}" if suffix else None
    if clean.isdigit():
        return f"https://openalex.org/fields/{clean}"
    if clean[0].lower() == "f":
        return f"https://openalex.org/{clean.upper()}"
    return None


def _openalex_field_filter_token(value: Any) -> str | None:
    normalized = _normalize_openalex_field_id(value)
    if not normalized:
        return None
    if "/fields/" in normalized:
        suffix = normalized.rsplit("/fields/", 1)[-1].strip().strip("/")
        return suffix or None
    token = normalized.removeprefix("https://openalex.org/").strip().strip("/")
    return token or None


def _openalex_primary_field_and_year_for_work(
    *,
    openalex_work_id: str,
    mailto: str | None,
) -> dict[str, Any]:
    work_id = _extract_openalex_work_id(openalex_work_id)
    if not work_id:
        return {}
    params: dict[str, Any] = {
        "select": "id,publication_year,cited_by_count,primary_topic",
    }
    if mailto:
        params["mailto"] = mailto
    payload = _openalex_request_with_retry(
        url=f"https://api.openalex.org/works/{work_id}",
        params=params,
    )
    if not payload:
        return {}
    primary_topic = (
        payload.get("primary_topic")
        if isinstance(payload.get("primary_topic"), dict)
        else {}
    )
    field = (
        primary_topic.get("field")
        if isinstance(primary_topic.get("field"), dict)
        else {}
    )
    field_id = _normalize_openalex_field_id(field.get("id"))
    field_name = str(field.get("display_name") or "").strip() or None
    publication_year = _safe_int(payload.get("publication_year"))
    cited_by_count = _safe_int(payload.get("cited_by_count"))
    return {
        "field_id": field_id,
        "field_name": field_name,
        "publication_year": publication_year,
        "cited_by_count": max(0, int(cited_by_count or 0)),
    }


def _openalex_field_year_citation_cohort(
    *,
    field_id: str,
    year: int,
    mailto: str | None,
    max_pages: int,
) -> dict[str, Any]:
    clean_field_id = _normalize_openalex_field_id(field_id)
    field_filter_id = _openalex_field_filter_token(field_id)
    if not clean_field_id or not field_filter_id:
        return {"citations": [], "total_results": 0}
    if year < 1900 or year > 2100:
        return {"citations": [], "total_results": 0}

    citations: list[int] = []
    seen_ids: set[str] = set()
    for page_index in range(max_pages):
        seed_value = (
            abs(hash(f"{field_filter_id}:{int(year)}:{page_index}")) % 10_000_000
        )
        params: dict[str, Any] = {
            "filter": f"primary_topic.field.id:{field_filter_id},publication_year:{int(year)}",
            "select": "id,cited_by_count",
            "per-page": 200,
            "sample": 200,
            "seed": seed_value,
        }
        if mailto:
            params["mailto"] = mailto
        payload = _openalex_request_with_retry(
            url="https://api.openalex.org/works",
            params=params,
        )
        if not payload:
            continue
        results = payload.get("results")
        if not isinstance(results, list):
            continue
        for item in results:
            if not isinstance(item, dict):
                continue
            work_id = str(item.get("id") or "").strip()
            if work_id:
                if work_id in seen_ids:
                    continue
                seen_ids.add(work_id)
            citations.append(max(0, int(_safe_int(item.get("cited_by_count")) or 0)))

    citations.sort()
    return {
        "citations": citations,
        "total_results": len(citations),
    }


def _openalex_field_year_total_count(
    *,
    field_id: str,
    year: int,
    mailto: str | None,
) -> int | None:
    field_filter_id = _openalex_field_filter_token(field_id)
    if not field_filter_id:
        return None
    if year < 1900 or year > 2100:
        return None

    params: dict[str, Any] = {
        "filter": f"primary_topic.field.id:{field_filter_id},publication_year:{int(year)}",
        "select": "id",
        "per-page": 1,
    }
    if mailto:
        params["mailto"] = mailto
    payload = _openalex_request_with_retry(
        url="https://api.openalex.org/works",
        params=params,
    )
    if not payload:
        return None
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    total = _safe_int(meta.get("count"))
    if total is None or total < 0:
        return None
    return int(total)


def _openalex_field_year_count_below_or_equal(
    *,
    field_id: str,
    year: int,
    citations: int,
    mode: str,
    mailto: str | None,
) -> int | None:
    field_filter_id = _openalex_field_filter_token(field_id)
    if not field_filter_id:
        return None
    if year < 1900 or year > 2100:
        return None
    citation_count = max(0, int(citations or 0))
    if mode == "lt":
        citation_filter = f"cited_by_count:<{citation_count}"
    elif mode == "eq":
        citation_filter = f"cited_by_count:{citation_count}"
    else:
        return None

    params: dict[str, Any] = {
        "filter": (
            f"primary_topic.field.id:{field_filter_id},publication_year:{int(year)},{citation_filter}"
        ),
        "select": "id",
        "per-page": 1,
    }
    if mailto:
        params["mailto"] = mailto
    payload = _openalex_request_with_retry(
        url="https://api.openalex.org/works",
        params=params,
    )
    if not payload:
        return None
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    total = _safe_int(meta.get("count"))
    if total is None or total < 0:
        return None
    return int(total)


def _openalex_field_year_percentile_rank_exact(
    *,
    field_id: str,
    year: int,
    citations: int,
    mailto: str | None,
    total_count: int | None = None,
) -> dict[str, Any]:
    resolved_total = (
        int(total_count)
        if total_count is not None and int(total_count) >= 0
        else _openalex_field_year_total_count(
            field_id=field_id,
            year=year,
            mailto=mailto,
        )
    )
    if resolved_total is None or resolved_total <= 0:
        return {
            "percentile_rank": None,
            "total_results": max(0, int(resolved_total or 0)),
        }

    below_count = _openalex_field_year_count_below_or_equal(
        field_id=field_id,
        year=year,
        citations=citations,
        mode="lt",
        mailto=mailto,
    )
    equal_count = _openalex_field_year_count_below_or_equal(
        field_id=field_id,
        year=year,
        citations=citations,
        mode="eq",
        mailto=mailto,
    )
    if below_count is None or equal_count is None:
        return {"percentile_rank": None, "total_results": int(resolved_total)}

    percentile_rank = (
        (below_count + (equal_count / 2.0)) / float(max(1, resolved_total))
    ) * 100.0
    percentile_rank = max(0.0, min(100.0, percentile_rank))
    return {
        "percentile_rank": round(percentile_rank, 2),
        "total_results": int(resolved_total),
    }


def _empirical_percentile_rank(
    sorted_values: list[int], value: int | float
) -> float | None:
    if not sorted_values:
        return None
    n = len(sorted_values)
    sample_value = max(0.0, float(value or 0.0))
    left = bisect_left(sorted_values, sample_value)
    right = bisect_right(sorted_values, sample_value)
    rank = ((left + right) / 2.0) / float(n)
    return round(max(0.0, min(1.0, rank)) * 100.0, 2)


def _percentile_cutoff(sorted_values: list[int], percentile: float) -> int | None:
    if not sorted_values:
        return None
    n = len(sorted_values)
    p = max(0.0, min(100.0, float(percentile)))
    if n == 1:
        return int(sorted_values[0])
    position = (p / 100.0) * (n - 1)
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return int(sorted_values[lower])
    fraction = position - lower
    low = float(sorted_values[lower])
    high = float(sorted_values[upper])
    interpolated = low + ((high - low) * fraction)
    return int(round(interpolated))


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


def _extract_counts_by_year(
    rows: list[MetricsSnapshot], *, now_year: int
) -> dict[int, int]:
    if not rows:
        return {}

    def _rank(item: MetricsSnapshot) -> tuple[int, datetime]:
        provider = str(item.provider or "").strip().lower()
        is_openalex = 1 if provider == "openalex" else 0
        return (is_openalex, _coerce_utc(item.captured_at))

    ordered = sorted(rows, key=_rank, reverse=True)
    for snapshot in ordered:
        payload = (
            snapshot.metric_payload if isinstance(snapshot.metric_payload, dict) else {}
        )
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


def _normalize_monthly_to_total(
    *, monthly_added: list[int], target_total: int
) -> list[int]:
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


def _cumulative_from_monthly(
    *, monthly_added: list[int], target_total: int
) -> list[int]:
    clean = _normalize_monthly_to_total(
        monthly_added=monthly_added, target_total=target_total
    )
    base = max(0, int(target_total or 0) - int(sum(clean)))
    cumulative: list[int] = [base]
    for value in clean:
        cumulative.append(cumulative[-1] + max(0, int(value or 0)))
    return cumulative


def _snapshot_rank(row: MetricsSnapshot) -> tuple[int, int, int, datetime]:
    citations = max(0, int(row.citations_count or 0))
    has_quality = int(
        row.influential_citations is not None or row.altmetric_score is not None
    )
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
            row
            for row in eligible
            if str(row.provider or "").strip().lower() == preferred
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


def compute_m_index(
    *, h_index: int, first_publication_year: int | None, current_year: int
) -> float:
    first_year = int(first_publication_year or 0)
    if first_year < 1900 or first_year > current_year:
        return 0.0
    career_years = max(1, int(current_year) - first_year + 1)
    return round(max(0.0, float(h_index)) / float(career_years), 3)


def compute_yoy_percent(
    *, citations_last_12m: int, citations_prev_12m: int
) -> float | None:
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


def compute_momentum_index(monthly_last_12: list[int]) -> float:
    values = [max(0, int(value or 0)) for value in (monthly_last_12 or [])][-12:]
    if len(values) < 12:
        values = [0] * (12 - len(values)) + values
    older_nine = values[:9]
    latest_three = values[9:]
    avg_old = float(sum(older_nine)) / 9.0
    avg_new = float(sum(latest_three)) / 3.0
    if avg_old <= 0.0:
        return 150.0 if avg_new > 0.0 else 100.0
    index_value = (avg_new / avg_old) * 100.0
    return round(max(0.0, min(300.0, index_value)), 1)


def momentum_index_label(index_value: float) -> str:
    if index_value < 95.0:
        return "Slowing"
    if index_value <= 105.0:
        return "Stable"
    return "Accelerating"


def _linear_slope(values: list[int | float]) -> float:
    if len(values) < 2:
        return 0.0
    clean = [float(max(0.0, float(item))) for item in values]
    n = len(clean)
    x_mean = (n - 1) / 2.0
    y_mean = sum(clean) / float(n)
    numerator = sum(
        (idx - x_mean) * (value - y_mean) for idx, value in enumerate(clean)
    )
    denominator = sum((idx - x_mean) ** 2 for idx in range(n))
    if denominator <= 0.0:
        return 0.0
    return numerator / denominator


def _growth_state_from_series(values: list[int]) -> tuple[str, str, float]:
    clean = [max(0, int(item or 0)) for item in values]
    if len(clean) < 3:
        return ("Limited history", "neutral", 0.0)
    mean_value = sum(clean) / float(len(clean))
    if mean_value <= 0.0:
        return ("Limited history", "neutral", 0.0)
    slope = _linear_slope(clean)
    normalized_slope = slope / max(1.0, mean_value)
    if normalized_slope <= -0.08:
        return ("Growth slowing", "negative", normalized_slope)
    if normalized_slope < -0.03:
        return ("Growth slowing", "caution", normalized_slope)
    if normalized_slope >= 0.03:
        return ("Growth accelerating", "positive", normalized_slope)
    return ("Growth steady", "neutral", normalized_slope)


def compute_concentration_risk_percent(
    *, total_citations: int, top3_citations: int
) -> float:
    total = max(0, int(total_citations or 0))
    head = max(0, int(top3_citations or 0))
    if total <= 0:
        return 0.0
    return round((head / total) * 100.0, 2)


def compute_gini_coefficient(values: list[int | float]) -> float:
    clean: list[float] = []
    for item in values:
        parsed = _safe_float(item)
        if parsed is None:
            continue
        clean.append(max(0.0, float(parsed)))
    n = len(clean)
    if n <= 0:
        return 0.0
    total = float(sum(clean))
    if total <= 0.0:
        return 0.0
    sorted_values = sorted(clean)
    weighted_sum = 0.0
    for index, value in enumerate(sorted_values, start=1):
        weighted_sum += ((2 * index) - n - 1) * value
    gini = weighted_sum / (float(n) * total)
    return round(max(0.0, min(1.0, gini)), 4)


def _concentration_profile_from_gini(value: float) -> str:
    if value < 0.40:
        return "Strongly diversified"
    if value < 0.55:
        return "Balanced"
    # Keep continuity for the unspecified 0.70-0.90 interval.
    if value < 0.90:
        return "Breakthrough-skewed"
    return "Landmark-dominant"


def project_h_index(
    *,
    current_h_index: int,
    publications: list[dict[str, Any]],
) -> dict[str, Any]:
    h_now = max(0, int(current_h_index or 0))
    next_h = h_now + 1
    if next_h <= 0:
        return {
            "current_h_index": h_now,
            "projected_h_index": h_now,
            "projection_probability": 0.0,
            "progress_to_next_pct": 0.0,
            "candidate_papers": [],
            "label": "Likely stable",
        }

    candidate_papers: list[dict[str, Any]] = []
    expected_above = 0.0
    current_above = 0
    projected_above = 0
    for item in publications:
        citations_now = max(0, int(item.get("citations_lifetime") or 0))
        citations_last_12 = max(0, int(item.get("citations_last_12m") or 0))
        projected_citations = citations_now + citations_last_12
        if citations_now >= next_h:
            current_above += 1
        if projected_citations >= next_h:
            projected_above += 1
        if citations_now >= next_h:
            probability = 1.0
        else:
            needed = max(1, next_h - citations_now)
            probability = min(1.0, float(citations_last_12) / float(needed))
        expected_above += probability

        if (h_now - 2) <= citations_now <= (h_now + 2):
            candidate_papers.append(
                {
                    **item,
                    "citations_to_next_h": max(0, next_h - citations_now),
                    "projection_probability": round(probability, 2),
                    "projected_citations_12m": projected_citations,
                }
            )

    projected_h = next_h if projected_above >= next_h else h_now
    # Keep progress grounded in current state only (not projected state).
    progress_to_next = (
        100.0
        if current_above >= next_h
        else round(min(99.0, (float(current_above) / float(next_h)) * 100.0), 1)
    )
    # Convert expected papers at threshold into a bounded confidence estimate.
    delta = expected_above - float(next_h)
    projection_probability = 1.0 / (1.0 + math.exp(-2.2 * delta))
    if projected_h > h_now:
        projection_probability = max(0.51, projection_probability)
    else:
        projection_probability = min(0.49, projection_probability)
    projection_probability = max(0.05, min(0.97, projection_probability))
    label = (
        f"{h_now} -> {projected_h} ({round(projection_probability * 100)}%)"
        if projected_h > h_now
        else f"{h_now} (likely)"
    )
    candidate_papers.sort(
        key=lambda row: (
            int(row.get("citations_lifetime") or 0),
            float(row.get("projection_probability") or 0.0),
        ),
        reverse=True,
    )
    return {
        "current_h_index": h_now,
        "projected_h_index": projected_h,
        "projection_probability": round(projection_probability, 2),
        "progress_to_next_pct": progress_to_next,
        "current_papers_meeting_next_h": int(current_above),
        "projected_papers_meeting_next_h": int(projected_above),
        "papers_needed_now": max(0, int(next_h - current_above)),
        "papers_needed_projected": max(0, int(next_h - projected_above)),
        "candidate_papers": candidate_papers[:20],
        "label": label,
    }


def _extract_match_method(snapshot: MetricsSnapshot | None) -> str:
    if snapshot is None or not isinstance(snapshot.metric_payload, dict):
        return ""
    return str(snapshot.metric_payload.get("match_method") or "").strip().lower()


def _estimate_match_confidence(
    *, work: Work, snapshot: MetricsSnapshot | None
) -> float:
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
    previous = int(
        sum(max(0, int(v or 0)) for v in values[previous_start:previous_end])
    )
    return compute_yoy_percent(citations_last_12m=current, citations_prev_12m=previous)


def _year_back_safe(base: date, years: int) -> date:
    target_year = base.year - years
    day = base.day
    while day > 1:
        try:
            return date(target_year, base.month, day)
        except ValueError:
            day -= 1
    return date(target_year, base.month, 1)


def _month_ranges_last_n(*, now_date: date, months: int) -> list[tuple[date, date]]:
    if months <= 0:
        return []
    anchor = date(now_date.year, now_date.month, 1)
    ranges: list[tuple[date, date]] = []
    for idx in range(months):
        shift = (months - 1) - idx
        month = anchor.month - shift
        year = anchor.year
        while month <= 0:
            month += 12
            year -= 1
        start = date(year, month, 1)
        if month == 12:
            next_start = date(year + 1, 1, 1)
        else:
            next_start = date(year, month + 1, 1)
        ranges.append((start, next_start - timedelta(days=1)))
    return ranges


def _contract_windows(
    *,
    metric_key: str,
    now_date: date,
    min_publication_year: int | None,
) -> list[dict[str, Any]]:
    start_year = (
        int(min_publication_year)
        if isinstance(min_publication_year, int)
        and 1900 <= int(min_publication_year) <= now_date.year
        else now_date.year
    )
    lifetime_start = date(start_year, 1, 1)
    if metric_key == "this_year_vs_last":
        return [
            {
                "window_id": "1y",
                "label": "1y",
                "start_date": _year_back_safe(now_date, 1).isoformat(),
                "end_date": now_date.isoformat(),
                "is_default": False,
            },
            {
                "window_id": "3y",
                "label": "3y",
                "start_date": _year_back_safe(now_date, 3).isoformat(),
                "end_date": now_date.isoformat(),
                "is_default": False,
            },
            {
                "window_id": "5y",
                "label": "5y",
                "start_date": _year_back_safe(now_date, 5).isoformat(),
                "end_date": now_date.isoformat(),
                "is_default": True,
            },
            {
                "window_id": "all",
                "label": "All",
                "start_date": lifetime_start.isoformat(),
                "end_date": now_date.isoformat(),
                "is_default": False,
            },
        ]
    return [
        {
            "window_id": "last_12m",
            "label": "Last 12m",
            "start_date": _year_back_safe(now_date, 1).isoformat(),
            "end_date": now_date.isoformat(),
            "is_default": True,
        },
        {
            "window_id": "last_3y",
            "label": "Last 3y",
            "start_date": _year_back_safe(now_date, 3).isoformat(),
            "end_date": now_date.isoformat(),
            "is_default": False,
        },
        {
            "window_id": "last_5y",
            "label": "Last 5y",
            "start_date": _year_back_safe(now_date, 5).isoformat(),
            "end_date": now_date.isoformat(),
            "is_default": False,
        },
        {
            "window_id": "ytd",
            "label": "YTD",
            "start_date": date(now_date.year, 1, 1).isoformat(),
            "end_date": now_date.isoformat(),
            "is_default": False,
        },
        {
            "window_id": "lifetime",
            "label": "Lifetime",
            "start_date": lifetime_start.isoformat(),
            "end_date": now_date.isoformat(),
            "is_default": False,
        },
    ]


def _default_window_id(windows: list[dict[str, Any]]) -> str:
    for window in windows:
        if bool(window.get("is_default")):
            return str(window.get("window_id") or "")
    if windows:
        return str(windows[0].get("window_id") or "")
    return "lifetime"


def _contract_metric_row(
    *,
    metric_id: str,
    label: str,
    value: float | int | None,
    value_display: str | None = None,
    unit: str = "",
    window_id: str = "",
) -> dict[str, Any]:
    display = str(value_display or "").strip()
    if not display:
        if value is None:
            display = "Not available"
        elif unit == "percent":
            display = f"{float(value):.1f}%"
        elif abs(float(value) - round(float(value))) <= 1e-9:
            display = _format_int(int(round(float(value))))
        else:
            display = f"{float(value):,.2f}"
    return {
        "metric_id": metric_id,
        "label": label,
        "value": value,
        "value_display": display,
        "unit": unit,
        "window_id": window_id,
    }


def _contract_headline_metrics(
    *,
    tile: dict[str, Any],
    chart_data: dict[str, Any],
    metric_key: str,
    default_window_id: str,
) -> list[dict[str, Any]]:
    rows = [
        _contract_metric_row(
            metric_id="primary",
            label=str(tile.get("label") or "Metric"),
            value=_safe_float(tile.get("value")),
            value_display=str(
                tile.get("main_value_display")
                or tile.get("value_display")
                or "Not available"
            ),
            unit=str(tile.get("unit") or ""),
            window_id=default_window_id,
        )
    ]
    years = [max(0, int(value or 0)) for value in (chart_data.get("years") or []) if _safe_int(value) is not None]
    values = [
        max(0, int(_safe_int(value) or 0)) for value in (chart_data.get("values") or [])
    ]
    monthly_values = [
        max(0.0, float(_safe_float(value) or 0.0))
        for value in (chart_data.get("monthly_values_12m") or [])
    ]
    if metric_key == "this_year_vs_last":
        paired_year_values = [
            (int(years[idx]), max(0, int(values[idx])))
            for idx in range(min(len(years), len(values)))
            if 1900 <= int(years[idx]) <= 3000
        ]
        projected_year = _safe_int(chart_data.get("projected_year"))
        reference_year = (
            int(projected_year)
            if projected_year is not None and 1900 <= int(projected_year) <= 3000
            else (
                paired_year_values[-1][0]
                if paired_year_values
                else date.today().year
            )
        )
        current_ytd_raw = _safe_int(chart_data.get("current_year_ytd"))
        existing_current_year_value = next(
            (value for year, value in paired_year_values if year == reference_year),
            0,
        )
        current_year_value = (
            max(0, int(current_ytd_raw))
            if current_ytd_raw is not None
            else max(0, int(existing_current_year_value))
        )
        history_by_year: dict[int, int] = {
            int(year): max(0, int(value))
            for year, value in paired_year_values
            if int(year) != reference_year
        }
        if paired_year_values or current_ytd_raw is not None:
            history_by_year[int(reference_year)] = max(0, int(current_year_value))
        history_series = sorted(history_by_year.items(), key=lambda item: item[0])
        history_values = [max(0, int(value)) for _, value in history_series]
        positive_history_values = [value for value in history_values if value > 0]

        drilldown_payload = tile.get("drilldown") if isinstance(tile.get("drilldown"), dict) else {}
        publication_rows = (
            drilldown_payload.get("publications")
            if isinstance(drilldown_payload.get("publications"), list)
            else []
        )
        publication_years: list[int] = []
        for row in publication_rows:
            if not isinstance(row, dict):
                continue
            year_value = _safe_int(row.get("year"))
            if year_value is None:
                continue
            if 1900 <= int(year_value) <= int(reference_year):
                publication_years.append(int(year_value))
        first_publication_candidates = publication_years + [
            int(year)
            for year, value in history_series
            if int(value) > 0
        ]
        first_publication_year = (
            min(first_publication_candidates) if first_publication_candidates else None
        )
        active_years = (
            max(1, int(reference_year) - int(first_publication_year) + 1)
            if first_publication_year is not None
            else 0
        )
        median_per_year = (
            float(
                sorted(positive_history_values)[
                    len(positive_history_values) // 2
                ]
            )
            if positive_history_values
            else 0.0
        )
        rolling_window_values = history_values[-5:]
        rolling_5 = (
            round(
                sum(rolling_window_values) / float(max(1, len(rolling_window_values))),
                1,
            )
            if rolling_window_values
            else 0.0
        )
        rows.extend(
            [
                _contract_metric_row(
                    metric_id="active_years",
                    label="Active years",
                    value=active_years,
                    window_id="all",
                ),
                _contract_metric_row(
                    metric_id="median_per_year",
                    label="Median per year",
                    value=median_per_year,
                    window_id="all",
                ),
                _contract_metric_row(
                    metric_id="current_ytd",
                    label="Current YTD",
                    value=max(0, int(current_year_value)),
                    window_id="ytd",
                ),
                _contract_metric_row(
                    metric_id="rolling_mean_5y",
                    label="5y rolling mean",
                    value=rolling_5,
                    window_id="5y",
                ),
            ]
        )
        if history_series:
            peak_idx = max(range(len(history_series)), key=lambda idx: history_series[idx][1])
            peak_year, peak_value = history_series[peak_idx]
            rows.append(
                _contract_metric_row(
                    metric_id="career_peak",
                    label="Career peak",
                    value=peak_value,
                    value_display=f"{peak_value} ({peak_year})",
                    window_id="all",
                )
            )
    elif metric_key == "momentum":
        recent = monthly_values[-3:] if len(monthly_values) >= 3 else monthly_values
        prior = monthly_values[:-3] if len(monthly_values) > 3 else []
        recent_rate = sum(recent) / float(len(recent)) if recent else 0.0
        prior_rate = sum(prior) / float(len(prior)) if prior else 0.0
        lift_pct = (
            ((recent_rate - prior_rate) / prior_rate) * 100.0 if prior_rate > 0 else None
        )
        rows.extend(
            [
                _contract_metric_row(
                    metric_id="recent_rate",
                    label="Recent pace (3m avg)",
                    value=round(recent_rate, 2),
                    window_id="last_12m",
                ),
                _contract_metric_row(
                    metric_id="prior_rate",
                    label="Prior pace (9m avg)",
                    value=round(prior_rate, 2),
                    window_id="last_12m",
                ),
                _contract_metric_row(
                    metric_id="lift_pct",
                    label="Lift vs prior pace",
                    value=round(lift_pct, 1) if lift_pct is not None else None,
                    unit="percent",
                    window_id="last_12m",
                ),
            ]
        )
    return rows[:6]


def _contract_series(
    *,
    chart_data: dict[str, Any],
    now_date: date,
    metric_key: str,
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    years = [int(value) for value in (chart_data.get("years") or []) if _safe_int(value) is not None]
    year_values = [float(_safe_float(value) or 0.0) for value in (chart_data.get("values") or [])]
    if years and year_values:
        points = []
        for idx in range(min(len(years), len(year_values))):
            year = years[idx]
            points.append(
                {
                    "label": str(year),
                    "period_start": date(year, 1, 1).isoformat(),
                    "period_end": date(year, 12, 31).isoformat(),
                    "value": year_values[idx],
                }
            )
        output.append(
            {
                "series_id": "yearly",
                "label": "Yearly trend",
                "granularity": "year",
                "window_id": "5y" if metric_key == "this_year_vs_last" else "last_5y",
                "unit": "count",
                "points": points,
            }
        )
    monthly_values = [float(_safe_float(value) or 0.0) for value in (chart_data.get("monthly_values_12m") or [])]
    month_labels = [str(value or "").strip() for value in (chart_data.get("month_labels_12m") or [])]
    if monthly_values:
        ranges = _month_ranges_last_n(now_date=now_date, months=len(monthly_values))
        points = []
        for idx, value in enumerate(monthly_values):
            start, end = ranges[idx]
            label = month_labels[idx] if idx < len(month_labels) and month_labels[idx] else start.strftime("%b %Y")
            points.append(
                {
                    "label": label,
                    "period_start": start.isoformat(),
                    "period_end": end.isoformat(),
                    "value": value,
                }
            )
        output.append(
            {
                "series_id": "monthly",
                "label": "Monthly trend",
                "granularity": "month",
                "window_id": "last_12m",
                "unit": "count",
                "points": points,
            }
        )
    return output


def _contract_breakdowns(
    *,
    metric_key: str,
    publications: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not publications:
        return []
    type_counts: dict[str, int] = defaultdict(int)
    venue_counts: dict[str, int] = defaultdict(int)
    venue_citations: dict[str, list[int]] = defaultdict(list)
    article_type_counts: dict[str, int] = defaultdict(int)
    article_type_citations: dict[str, list[int]] = defaultdict(list)
    topic_counts: dict[str, int] = defaultdict(int)
    topic_citations: dict[str, list[int]] = defaultdict(list)
    oa_status_counts: dict[str, int] = defaultdict(int)
    oa_status_citations: dict[str, list[int]] = defaultdict(list)
    
    for publication in publications:
        publication_type = (
            str(publication.get("publication_type") or publication.get("work_type") or "Unspecified").strip()
            or "Unspecified"
        )
        venue = str(publication.get("journal") or publication.get("venue") or "Unknown venue").strip() or "Unknown venue"
        article_type = str(publication.get("article_type") or "Original").strip() or "Original"
        citations = max(0, int(_safe_int(publication.get("citations_lifetime")) or 0))
        
        type_counts[publication_type] += 1
        venue_counts[venue] += 1
        venue_citations[venue].append(citations)
        article_type_counts[article_type] += 1
        article_type_citations[article_type].append(citations)
        
        # Aggregate by topics
        topics = publication.get("topics") or []
        if isinstance(topics, list):
            for topic in topics[:3]:  # Count each publication for its top 3 topics
                if topic:
                    topic_counts[topic] += 1
                    topic_citations[topic].append(citations)
        
        # Aggregate by OA status
        oa_status = str(publication.get("oa_status") or "").strip()
        if oa_status:
            oa_status_counts[oa_status] += 1
            oa_status_citations[oa_status].append(citations)
        else:
            is_oa = publication.get("is_oa")
            if is_oa:
                oa_status_counts["open_access"] += 1
                oa_status_citations["open_access"].append(citations)
            else:
                oa_status_counts["closed"] += 1
                oa_status_citations["closed"].append(citations)
        
    total = max(1, len(publications))

    def _rows_from_counts(counts: dict[str, int], limit: int = 10) -> list[dict[str, Any]]:
        ranked = sorted(counts.items(), key=lambda item: (-int(item[1]), item[0]))
        return [
            {
                "key": key,
                "label": key,
                "value": int(value),
                "share_pct": round((int(value) / float(total)) * 100.0, 1),
            }
            for key, value in ranked[:limit]
        ]

    def _venue_rows_with_citations(counts: dict[str, int], citations_map: dict[str, list[int]], limit: int = 10) -> list[dict[str, Any]]:
        ranked = sorted(counts.items(), key=lambda item: (-int(item[1]), item[0]))
        return [
            {
                "key": key,
                "label": key,
                "value": int(value),
                "share_pct": round((int(value) / float(total)) * 100.0, 1),
                "avg_citations": round(sum(citations_map.get(key, [0])) / max(1, len(citations_map.get(key, [0]))), 1) if citations_map.get(key) else 0.0,
            }
            for key, value in ranked[:limit]
        ]

    output = []
    if metric_key == "this_year_vs_last":
        output.append(
            {
                "breakdown_id": "by_publication_type",
                "label": "By publication type",
                "dimension": "publication_type",
                "items": _rows_from_counts(type_counts, limit=12),
            }
        )
        output.append(
            {
                "breakdown_id": "by_venue",
                "label": "By venue (top 10)",
                "dimension": "venue",
                "items": _venue_rows_with_citations(venue_counts, venue_citations, limit=10),
            }
        )
        output.append(
            {
                "breakdown_id": "by_venue_full",
                "label": "By venue (all)",
                "dimension": "venue",
                "items": _venue_rows_with_citations(venue_counts, venue_citations, limit=9999),
            }
        )
        output.append(
            {
                "breakdown_id": "by_article_type",
                "label": "By article classification",
                "dimension": "article_type",
                "items": _venue_rows_with_citations(article_type_counts, article_type_citations, limit=20),
            }
        )
        output.append(
            {
                "breakdown_id": "by_topic",
                "label": "By research topic",
                "dimension": "topic",
                "items": _venue_rows_with_citations(topic_counts, topic_citations, limit=50),
            }
        )
        output.append(
            {
                "breakdown_id": "by_oa_status",
                "label": "By open access status",
                "dimension": "oa_status",
                "items": _venue_rows_with_citations(oa_status_counts, oa_status_citations, limit=20),
            }
        )
    top_publications = sorted(
        publications,
        key=lambda item: max(
            0, int(_safe_int(item.get("citations_lifetime")) or 0)
        ),
        reverse=True,
    )[:10]
    output.append(
        {
            "breakdown_id": "top_publications",
            "label": "Top publications",
            "dimension": "publication",
            "items": [
                {
                    "key": str(item.get("work_id") or item.get("title") or ""),
                    "label": str(item.get("title") or "Untitled"),
                    "value": max(0, int(_safe_int(item.get("citations_lifetime")) or 0)),
                    "year": _safe_int(item.get("year")),
                }
                for item in top_publications
            ],
        }
    )
    return output


def _contract_benchmarks(*, metric_key: str, chart_data: dict[str, Any]) -> list[dict[str, Any]]:
    if metric_key == "field_percentile_share":
        default_threshold = int(_safe_int(chart_data.get("default_threshold")) or 75)
        share_map = (
            chart_data.get("share_by_threshold_pct")
            if isinstance(chart_data.get("share_by_threshold_pct"), dict)
            else {}
        )
        value = _safe_float(share_map.get(str(default_threshold)))
        return [
            {
                "benchmark_id": "field_cohort",
                "label": "Field/year cohort percentile share",
                "value": value,
                "value_display": f"{float(value or 0.0):.1f}%",
                "unit": "percent",
                "context": f"Threshold {default_threshold}th percentile",
            }
        ]
    if metric_key == "h_index_projection":
        value = _safe_float(chart_data.get("progress_to_next_pct"))
        return [
            {
                "benchmark_id": "next_h_progress",
                "label": "Progress to next h-index",
                "value": value,
                "value_display": f"{float(value or 0.0):.1f}%",
                "unit": "percent",
                "context": "Threshold benchmark",
            }
        ]
    return []


def _contract_qc_flags(
    *,
    publications: list[dict[str, Any]],
    chart_data: dict[str, Any],
    benchmarks: list[dict[str, Any]],
    now_date: date,
) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    missing_dates = 0
    doi_seen: set[str] = set()
    title_seen: set[str] = set()
    duplicates = 0
    for item in publications:
        if _safe_int(item.get("year")) is None:
            missing_dates += 1
        doi = str(item.get("doi") or "").strip().lower()
        if doi:
            if doi in doi_seen:
                duplicates += 1
            doi_seen.add(doi)
        else:
            key = f"{str(item.get('title') or '').strip().lower()}|{_safe_int(item.get('year')) or 'na'}"
            if key in title_seen:
                duplicates += 1
            title_seen.add(key)
    if missing_dates > 0:
        flags.append(
            {
                "code": "missing_dates",
                "severity": "warning",
                "message": f"{missing_dates} records are missing publication dates.",
            }
        )
    if duplicates > 0:
        flags.append(
            {
                "code": "suspected_duplicates",
                "severity": "warning",
                "message": f"{duplicates} potential duplicate records were detected.",
            }
        )
    if chart_data.get("projected_year") is not None and now_date.month < 12:
        flags.append(
            {
                "code": "partial_window",
                "severity": "info",
                "message": f"Current-year window is partial as of {now_date.isoformat()}.",
            }
        )
    if not benchmarks:
        flags.append(
            {
                "code": "benchmark_unavailable",
                "severity": "info",
                "message": "Benchmark data is not available for this metric.",
            }
        )
    return flags


def _attach_canonical_drilldown(*, tile: dict[str, Any], now: datetime) -> dict[str, Any]:
    chart_data = tile.get("chart_data") if isinstance(tile.get("chart_data"), dict) else {}
    drilldown = tile.get("drilldown") if isinstance(tile.get("drilldown"), dict) else {}
    publications = (
        [dict(item) for item in drilldown.get("publications", []) if isinstance(item, dict)]
        if isinstance(drilldown.get("publications"), list)
        else []
    )
    publication_years = [
        int(value)
        for value in (
            _safe_int(item.get("year")) for item in publications
        )
        if value is not None and 1900 <= int(value) <= now.year
    ]
    windows = _contract_windows(
        metric_key=str(tile.get("key") or ""),
        now_date=now.date(),
        min_publication_year=min(publication_years) if publication_years else None,
    )
    default_window_id = _default_window_id(windows)
    benchmarks = _contract_benchmarks(
        metric_key=str(tile.get("key") or ""),
        chart_data=chart_data,
    )
    merged = dict(drilldown)
    merged.update(
        {
            "tile_id": DRILLDOWN_TILE_ID_BY_KEY.get(str(tile.get("key") or ""), str(tile.get("key") or "")),
            "as_of_date": now.date().isoformat(),
            "windows": windows,
            "headline_metrics": _contract_headline_metrics(
                tile=tile,
                chart_data=chart_data,
                metric_key=str(tile.get("key") or ""),
                default_window_id=default_window_id,
            ),
            "series": _contract_series(
                chart_data=chart_data,
                now_date=now.date(),
                metric_key=str(tile.get("key") or ""),
            ),
            "breakdowns": _contract_breakdowns(
                metric_key=str(tile.get("key") or ""),
                publications=publications,
            ),
            "benchmarks": benchmarks,
            "methods": {
                "definition": str(merged.get("definition") or ""),
                "formula": str(merged.get("formula") or ""),
                "data_sources": [
                    str(item).strip()
                    for item in (tile.get("data_source") or [])
                    if str(item).strip()
                ],
                "caveats": [str(merged.get("confidence_note") or "")],
                "refresh_cadence": str(
                    (tile.get("tooltip_details") or {}).get("update_frequency") or ""
                )
                or _update_frequency_label(),
                "dedupe_rules": [
                    "DOI/PMID identity match takes precedence.",
                    "Fallback duplicate checks use title + publication year.",
                ],
                "last_updated": now.isoformat(),
            },
            "qc_flags": _contract_qc_flags(
                publications=publications,
                chart_data=chart_data,
                benchmarks=benchmarks,
                now_date=now.date(),
            ),
        }
    )
    tile["drilldown"] = merged
    return tile


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
    subtext: str | None = None,
    badge: dict[str, Any] | None = None,
    chart_type: str = "line",
    chart_data: dict[str, Any] | None = None,
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
        "subtext": str(subtext or delta_display or ""),
        "badge": badge or {"label": "Neutral", "severity": "info"},
        "chart_type": chart_type,
        "chart_data": chart_data or {},
        "sparkline": _series_to_sparkline(sparkline),
        "sparkline_overlay": _series_to_sparkline(sparkline_overlay or []),
        "tooltip": tooltip,
        "tooltip_details": tooltip_details,
        "data_source": data_source,
        "confidence_score": round(
            max(0.0, min(1.0, float(confidence_score or 0.0))), 2
        ),
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


def _load_bundle_row(
    session, *, user_id: str, for_update: bool = False
) -> PublicationMetric | None:
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
    authorship_rows = session.scalars(
        select(WorkAuthorship).where(WorkAuthorship.work_id.in_(work_ids))
    ).all()
    author_count_by_work: dict[str, int] = defaultdict(int)
    user_author_position_by_work: dict[str, int] = {}
    collaborator_keys_by_work: dict[str, set[str]] = defaultdict(set)
    collaborator_work_count_by_key: dict[str, int] = defaultdict(int)
    for link in authorship_rows:
        work_id = str(link.work_id)
        author_count_by_work[work_id] = author_count_by_work.get(work_id, 0) + 1
        if bool(link.is_user) and work_id not in user_author_position_by_work:
            parsed_order = _safe_int(link.author_order)
            if parsed_order is not None and parsed_order > 0:
                user_author_position_by_work[work_id] = int(parsed_order)
        if not bool(link.is_user):
            collaborator_key = f"author:{str(link.author_id)}"
            if collaborator_key not in collaborator_keys_by_work[work_id]:
                collaborator_keys_by_work[work_id].add(collaborator_key)
                collaborator_work_count_by_key[collaborator_key] += 1

    collaborators = session.scalars(
        select(Collaborator).where(Collaborator.owner_user_id == user_id)
    ).all()
    collaborator_ids = [str(row.id) for row in collaborators]
    collaborator_affiliations = session.scalars(
        select(CollaboratorAffiliation).where(
            CollaboratorAffiliation.collaborator_id.in_(collaborator_ids or [""])
        )
    ).all()

    def _authorship_role_for_work(*, work_id: str) -> str | None:
        position = user_author_position_by_work.get(work_id)
        author_count = int(author_count_by_work.get(work_id, 0) or 0)
        if position is None or position <= 0 or author_count <= 0:
            return None
        if position == 1:
            return "first"
        if position == 2:
            return "second"
        if author_count > 1 and position == author_count:
            return "last"
        return "other"

    snapshot_rows = session.scalars(
        select(MetricsSnapshot).where(MetricsSnapshot.work_id.in_(work_ids))
    ).all()
    snapshots_by_work: dict[str, list[MetricsSnapshot]] = {
        work_id: [] for work_id in work_ids
    }
    semantic_by_work: dict[str, list[MetricsSnapshot]] = {
        work_id: [] for work_id in work_ids
    }
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
    aggregate_yearly_totals: dict[int, int] = defaultdict(int)
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
        latest_openalex = _best_snapshot(
            [
                item
                for item in rows
                if str(item.provider or "").strip().lower() == "openalex"
            ]
        )
        latest_openalex_payload = (
            latest_openalex.metric_payload
            if latest_openalex is not None
            and isinstance(latest_openalex.metric_payload, dict)
            else {}
        )
        publication_date_iso = _safe_publication_date_iso(
            latest_openalex_payload.get("publication_date")
            or latest_openalex_payload.get("from_publication_date")
            or latest_openalex_payload.get("publication_month")
        )
        publication_month_start = _safe_publication_month_start(
            publication_date_iso
            or latest_openalex_payload.get("publication_date")
            or latest_openalex_payload.get("publication_month")
            or latest_openalex_payload.get("from_publication_date")
        )
        latest_semantic = _best_snapshot(semantic_rows)
        latest_citations = (
            max(0, int(latest.citations_count or 0))
            if latest is not None
            else max(0, int(work.citations_total or 0))
        )
        latest_influential = (
            max(0, int(latest_semantic.influential_citations or 0))
            if latest_semantic is not None
            and latest_semantic.influential_citations is not None
            else None
        )
        latest_provider = (
            str(latest.provider or "manual").strip().lower()
            if latest is not None
            else "manual"
        )
        provider_counts_latest[latest_provider] = (
            provider_counts_latest.get(latest_provider, 0) + 1
        )
        fallback_year_for_row: int | None = None
        openalex_work_id = _extract_openalex_work_id(
            str(work.openalex_work_id or "").strip() or None
        )
        if latest_openalex is not None and isinstance(
            latest_openalex.metric_payload, dict
        ):
            snapshot_openalex_id = _extract_openalex_work_id(
                str(latest_openalex.metric_payload.get("id") or "").strip() or None
            )
            if snapshot_openalex_id:
                openalex_work_id = snapshot_openalex_id

        yearly_counts = _extract_counts_by_year(rows, now_year=now.year)
        if yearly_counts:
            for year, value in yearly_counts.items():
                if year <= now.year:
                    aggregate_yearly_totals[int(year)] += max(0, int(value or 0))
            monthly_added = _monthly_from_yearly_counts(
                yearly_counts, now=now, months=24
            )
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
                str(latest.provider or "").strip().lower()
                if latest is not None
                else None
            )
            fallback_year = (
                int(work.year)
                if isinstance(work.year, int) and 1900 <= int(work.year) <= now.year
                else now.year
            )
            fallback_year_for_row = fallback_year
            aggregate_yearly_totals[fallback_year] += latest_citations
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
                    max(
                        0,
                        cumulative_from_snapshots[index + 1]
                        - cumulative_from_snapshots[index],
                    )
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
                baseline_24 = (
                    max(0, int(best_24.citations_count or 0))
                    if best_24 is not None
                    else 0
                )
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
                if (
                    semantic_at_endpoint is None
                    or semantic_at_endpoint.influential_citations is None
                ):
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

        # Extract topics from OpenAlex payload
        primary_topic_name = None
        topics_list = []
        if latest_openalex_payload:
            primary_topic = latest_openalex_payload.get("primary_topic") or {}
            if isinstance(primary_topic, dict):
                primary_topic_name = str(primary_topic.get("display_name") or "").strip() or None
            topics = latest_openalex_payload.get("topics") or []
            if isinstance(topics, list):
                for topic in topics[:5]:  # Top 5 topics
                    if isinstance(topic, dict):
                        topic_name = str(topic.get("display_name") or "").strip()
                        if topic_name:
                            topics_list.append(topic_name)
        
        # Extract OA status from OpenAlex payload
        oa_status = None
        is_oa = False
        if latest_openalex_payload:
            open_access = latest_openalex_payload.get("open_access") or {}
            if isinstance(open_access, dict):
                oa_status = str(open_access.get("oa_status") or "").strip() or None
                is_oa = bool(open_access.get("is_oa"))

        per_work_rows.append(
            {
                "work_id": work_id,
                "title": str(work.title or "").strip() or "Untitled",
                "year": int(work.year) if isinstance(work.year, int) else None,
                "journal": str(work.venue_name or "").strip()
                or str(work.journal or "").strip()
                or "Not available",
                # Publication type tracks work-format (e.g., journal article, conference abstract).
                "publication_type": str(work.work_type or "").strip()
                or str(work.publication_type or "").strip()
                or None,
                "work_type": str(work.work_type or "").strip() or None,
                # Article type tracks study/editorial style (e.g., original, review, protocol).
                "article_type": str(work.publication_type or "").strip() or None,
                "doi": str(work.doi or "").strip() or None,
                "pmid": str(work.pmid or "").strip() or None,
                "openalex_work_id": openalex_work_id,
                "primary_topic": primary_topic_name,
                "topics": topics_list,
                "oa_status": oa_status,
                "is_oa": is_oa,
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
                "yearly_counts": {
                    int(year): int(count) for year, count in yearly_counts.items()
                }
                if yearly_counts
                else {},
                "publication_date": publication_date_iso,
                "publication_month_start": publication_month_start.isoformat()
                if publication_month_start is not None
                else None,
                "fallback_year": fallback_year_for_row,
                "user_author_position": user_author_position_by_work.get(work_id),
                "author_count": int(author_count_by_work.get(work_id, 0) or 0),
                "user_author_role": _authorship_role_for_work(work_id=work_id),
            }
        )

        for index, value in enumerate(monthly_added):
            monthly_added_totals[index] += int(value or 0)
        for index, value in enumerate(cumulative_series):
            monthly_cumulative_totals[index] += int(value or 0)

    per_work_rows.sort(key=lambda row: int(row["citations_lifetime"]), reverse=True)

    total_citations = int(sum(int(row["citations_lifetime"]) for row in per_work_rows))
    citations_last_12m = int(
        sum(int(row["citations_last_12m"]) for row in per_work_rows)
    )
    citations_prev_12m = int(
        sum(int(row["citations_prev_12m"]) for row in per_work_rows)
    )
    momentum_score = compute_citation_momentum_score(monthly_added_totals[-12:])
    top3_citations = int(
        sum(int(row["citations_lifetime"]) for row in per_work_rows[:3])
    )
    concentration_risk = compute_concentration_risk_percent(
        total_citations=total_citations,
        top3_citations=top3_citations,
    )

    citation_values = [int(row["citations_lifetime"]) for row in per_work_rows]
    concentration_gini = compute_gini_coefficient(citation_values)
    concentration_classification = _concentration_profile_from_gini(concentration_gini)
    h_index = compute_h_index(citation_values)
    first_publication_year: int | None = None
    for row in per_work_rows:
        year = row.get("year")
        if isinstance(year, int):
            if first_publication_year is None or year < first_publication_year:
                first_publication_year = year
    h_index_series: list[int] = []
    for month_index in range(13, 25):
        month_citations = [
            int(row["monthly_cumulative_25"][month_index]) for row in per_work_rows
        ]
        h_index_series.append(compute_h_index(month_citations))

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

    def _available_metric_sources(*preferred: str) -> list[str]:
        selected: list[str] = []
        for source in preferred:
            if source in data_sources and source not in selected:
                selected.append(source)
        return selected if selected else list(data_sources)

    dimensions_tile: dict[str, Any] | None = None
    if _dimensions_enabled():
        dimensions_values: list[float] = []
        for row in snapshots_by_work.values():
            latest_dimensions = _best_snapshot(
                [
                    item
                    for item in row
                    if str(item.provider or "").strip().lower() == "dimensions"
                ]
            )
            if latest_dimensions is None or not isinstance(
                latest_dimensions.metric_payload, dict
            ):
                continue
            parsed = _safe_float(
                latest_dimensions.metric_payload.get("field_normalized_impact")
            )
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

    total_citation_publications = [
        _publication_item_with_links(
            {
                "work_id": row["work_id"],
                "title": row["title"],
                "doi": row["doi"],
                "year": row["year"],
                "journal": row["journal"],
                "publication_date": row.get("publication_date"),
                "publication_month_start": row.get("publication_month_start"),
                "citations_lifetime": row["citations_lifetime"],
                "confidence_score": row["confidence_score"],
                "confidence_label": row["confidence_label"],
                "match_source": row["match_source"],
                "match_method": row["match_method"],
            }
        )
        for row in per_work_rows[:100]
    ]

    publication_volume_publications = sorted(
        [
            _publication_item_with_links(
                {
                    "work_id": row["work_id"],
                    "title": row["title"],
                    "doi": row["doi"],
                    "year": row["year"],
                    "journal": row["journal"],
                    "publication_date": row.get("publication_date"),
                    "publication_month_start": row.get("publication_month_start"),
                    "publication_type": row.get("publication_type"),
                    "work_type": row.get("work_type"),
                    "article_type": row.get("article_type"),
                    "citations_lifetime": row.get("citations_lifetime"),
                    "publication_count": 1,
                    "user_author_position": row.get("user_author_position"),
                    "author_count": row.get("author_count"),
                    "user_author_role": row.get("user_author_role"),
                    "primary_topic": row.get("primary_topic"),
                    "topics": row.get("topics") or [],
                    "oa_status": row.get("oa_status"),
                    "is_oa": bool(row.get("is_oa")),
                    "confidence_score": row["confidence_score"],
                    "confidence_label": row["confidence_label"],
                    "match_source": row["match_source"],
                    "match_method": row["match_method"],
                }
            )
            for row in per_work_rows
        ],
        key=lambda item: (
            int(item.get("year") or 0),
            str(item.get("title") or "").lower(),
        ),
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

    rolling_last_12_series_24 = [
        _rolling_sum(monthly_added_totals, 12, index) for index in range(24)
    ]
    momentum_weighted_monthly = [
        round(float(value) * (1.5 if index >= 9 else 1.0), 2)
        for index, value in enumerate(monthly_added_totals[-12:])
    ]
    monthly_last_12 = monthly_added_totals[-12:]
    momentum_index = compute_momentum_index(monthly_last_12)
    momentum_index_state = momentum_index_label(momentum_index)

    # Growth badge is based on complete years only (exclude the in-progress year).
    last5_complete_years = [
        now.year - 5,
        now.year - 4,
        now.year - 3,
        now.year - 2,
        now.year - 1,
    ]
    last5_complete_values = [
        max(0, int(aggregate_yearly_totals.get(year, 0)))
        for year in last5_complete_years
    ]
    growth_label, growth_severity, growth_slope_norm = _growth_state_from_series(
        last5_complete_values
    )
    five_year_delta = (
        int(last5_complete_values[-1] - last5_complete_values[0])
        if last5_complete_values
        else 0
    )
    five_year_mean = (
        float(sum(last5_complete_values)) / float(len(last5_complete_values))
        if last5_complete_values
        else 0.0
    )
    current_year_ytd = max(0, int(aggregate_yearly_totals.get(now.year, 0)))
    start_of_year = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    elapsed_days = max(1, int((now - start_of_year).days) + 1)
    elapsed_fraction = min(1.0, float(elapsed_days) / 365.25)
    ytd_run_rate_projection = int(round(current_year_ytd / max(0.01, elapsed_fraction)))
    trend_projection = int(
        round(
            (last5_complete_values[-1] if last5_complete_values else 0)
            + _linear_slope(last5_complete_values)
        )
    )
    projected_current_year = max(
        0,
        int(
            round(
                (0.50 * float(max(0, ytd_run_rate_projection)))
                + (0.30 * float(max(0, trend_projection)))
                + (0.20 * float(max(0.0, five_year_mean)))
            )
        ),
    )
    projected_current_year = max(current_year_ytd, projected_current_year)
    projection_confidence = (
        "high" if elapsed_days >= 240 else "medium" if elapsed_days >= 120 else "low"
    )
    projection_subtext = (
        f"Projected {now.year}: {_format_int(projected_current_year)} ({projection_confidence} confidence)"
        if projected_current_year > 0
        else "Projection unavailable"
    )

    def _citations_at_year(row: dict[str, Any], year: int) -> int:
        yearly = row.get("yearly_counts")
        if isinstance(yearly, dict) and yearly:
            total = 0
            for key, value in yearly.items():
                parsed_year = _safe_int(key)
                if parsed_year is None:
                    continue
                if parsed_year <= year:
                    total += max(0, int(_safe_int(value) or 0))
            return max(0, int(total))
        fallback_year = _safe_int(row.get("fallback_year"))
        if fallback_year is not None and fallback_year <= year:
            return max(0, int(row.get("citations_lifetime") or 0))
        publication_year = _safe_int(row.get("year"))
        if publication_year is not None and publication_year > year:
            return 0
        return max(0, int(row.get("citations_lifetime") or 0))

    h_projection = project_h_index(current_h_index=h_index, publications=per_work_rows)

    h_yearly_values = [
        compute_h_index([_citations_at_year(row, year) for row in per_work_rows])
        for year in last5_complete_years
    ]
    h_projected_current_year = max(
        h_yearly_values[-1] if h_yearly_values else h_index,
        int(h_projection.get("projected_h_index") or h_index),
    )
    h_progress_to_next = float(h_projection.get("progress_to_next_pct") or 0.0)
    h_next_target = int(h_index) + 1
    h_projection_probability = float(h_projection.get("projection_probability") or 0.0)
    h_confidence_label = (
        "High"
        if h_projection_probability >= 0.75
        else "Medium"
        if h_projection_probability >= 0.45
        else "Low"
    )
    h_candidate_gaps = sorted(
        [
            max(0, int(item.get("citations_to_next_h") or 0))
            for item in (h_projection.get("candidate_papers") or [])
            if isinstance(item, dict)
        ]
    )
    h_candidate_gaps = [gap for gap in h_candidate_gaps if gap > 0][:3]
    h_gap_text = (
        f"Nearest papers need: {', '.join(f'+{gap}' for gap in h_candidate_gaps)} citations"
        if h_candidate_gaps
        else "No near-threshold papers identified"
    )
    h_subtext = f"Target h={h_next_target}"
    h_delta_display = (
        f"Projection: h{h_projected_current_year} ({h_confidence_label} confidence)"
    )

    publication_counts_by_year: dict[int, int] = defaultdict(int)
    unknown_year_publications = 0
    for row in per_work_rows:
        parsed_year = _safe_int(row.get("year"))
        if parsed_year is None:
            unknown_year_publications += 1
            continue
        publication_counts_by_year[int(parsed_year)] += 1
    total_publications = len(per_work_rows)
    influence_by_publication_year: dict[int, int] = defaultdict(int)
    unknown_year_influential_citations = 0
    for row in influence_candidates:
        influential_value = max(0, int(row.get("influential_citations") or 0))
        parsed_year = _safe_int(row.get("year"))
        if parsed_year is None:
            unknown_year_influential_citations += influential_value
            continue
        influence_by_publication_year[int(parsed_year)] += influential_value
    influential_history_years: list[int] = []
    influential_history_values: list[int] = []
    if publication_counts_by_year:
        start_year = int(min(publication_counts_by_year.keys()))
        end_year = int(max(publication_counts_by_year.keys()))
        influential_history_years = list(range(start_year, end_year + 1))
    elif influence_by_publication_year:
        influential_history_years = sorted(
            int(year) for year in influence_by_publication_year.keys()
        )
    if influential_history_years:
        running_total = 0
        influential_history_values = []
        for index, year in enumerate(influential_history_years):
            additions = max(0, int(influence_by_publication_year.get(year, 0)))
            if index == 0 and unknown_year_influential_citations > 0:
                additions += int(unknown_year_influential_citations)
            running_total += additions
            influential_history_values.append(running_total)
    uncited_publications_count = int(
        sum(1 for row in per_work_rows if int(row.get("citations_lifetime") or 0) <= 0)
    )
    uncited_publications_pct = (
        (float(uncited_publications_count) / float(total_publications)) * 100.0
        if total_publications > 0
        else 0.0
    )
    author_role_counts = {
        "first": 0,
        "second": 0,
        "last": 0,
        "other": 0,
    }
    author_role_unknown = 0
    for row in per_work_rows:
        role = str(row.get("user_author_role") or "").strip().lower()
        if role in author_role_counts:
            author_role_counts[role] += 1
        else:
            author_role_unknown += 1
    authorship_total_papers = max(0, int(total_publications))
    authorship_known_papers = max(0, authorship_total_papers - int(author_role_unknown))
    first_authorship_count = int(author_role_counts.get("first", 0) or 0)
    second_authorship_count = int(author_role_counts.get("second", 0) or 0)
    senior_authorship_count = int(author_role_counts.get("last", 0) or 0)
    leadership_count = max(0, first_authorship_count + senior_authorship_count)

    def _pct_of_total_publications(count: int) -> float:
        if authorship_total_papers <= 0:
            return 0.0
        return round(
            (float(max(0, int(count))) / float(authorship_total_papers)) * 100.0, 1
        )

    first_authorship_pct = _pct_of_total_publications(first_authorship_count)
    second_authorship_pct = _pct_of_total_publications(second_authorship_count)
    senior_authorship_pct = _pct_of_total_publications(senior_authorship_count)
    leadership_index_pct = _pct_of_total_publications(leadership_count)
    author_positions_known = sorted(
        [
            int(parsed_position)
            for parsed_position in (
                _safe_int(row.get("user_author_position")) for row in per_work_rows
            )
            if parsed_position is not None and parsed_position > 0
        ]
    )
    median_author_position: float | None = None
    if author_positions_known:
        middle = len(author_positions_known) // 2
        if len(author_positions_known) % 2 == 1:
            median_author_position = float(author_positions_known[middle])
        else:
            median_author_position = round(
                (author_positions_known[middle - 1] + author_positions_known[middle])
                / 2.0,
                1,
            )
    median_author_position_display = (
        f"{int(round(median_author_position))}"
        if median_author_position is not None
        and abs(median_author_position - round(median_author_position)) < 1e-6
        else f"{median_author_position:.1f}"
        if median_author_position is not None
        else "Not available"
    )
    authorship_structure_publications = [
        _publication_item_with_links(
            {
                "work_id": row.get("work_id"),
                "title": row.get("title"),
                "doi": row.get("doi"),
                "year": row.get("year"),
                "journal": row.get("journal"),
                "citations_lifetime": int(row.get("citations_lifetime") or 0),
                "user_author_role": str(row.get("user_author_role") or "")
                .strip()
                .lower()
                or "unknown",
                "user_author_position": _safe_int(row.get("user_author_position")),
                "author_count": _safe_int(row.get("author_count")),
                "confidence_score": row.get("confidence_score"),
                "confidence_label": row.get("confidence_label"),
                "match_source": row.get("match_source"),
                "match_method": row.get("match_method"),
            }
        )
        for row in per_work_rows
    ]
    authorship_structure_publications.sort(
        key=lambda item: (
            {
                "first": 0,
                "last": 1,
                "second": 2,
                "other": 3,
            }.get(str(item.get("user_author_role") or "").strip().lower(), 4),
            -max(0, int(_safe_int(item.get("citations_lifetime")) or 0)),
            str(item.get("title") or "").lower(),
        )
    )
    authorship_structure_publications = authorship_structure_publications[:100]
    work_by_id: dict[str, Work] = {str(work.id): work for work in works}

    def _clean_text(value: Any) -> str:
        return " ".join(str(value or "").strip().split())

    def _normalize_country_token(value: Any) -> str | None:
        clean = _clean_text(value)
        if not clean:
            return None
        if len(clean) <= 3 and clean.isalpha():
            return clean.upper()
        return clean

    country_code_to_continent: dict[str, str] = {
        # North America
        "US": "north_america",
        "CA": "north_america",
        "MX": "north_america",
        # South America
        "AR": "south_america",
        "BR": "south_america",
        "CL": "south_america",
        "CO": "south_america",
        "PE": "south_america",
        "VE": "south_america",
        "UY": "south_america",
        # Europe
        "AT": "europe",
        "BE": "europe",
        "BG": "europe",
        "CH": "europe",
        "CY": "europe",
        "CZ": "europe",
        "DE": "europe",
        "DK": "europe",
        "EE": "europe",
        "ES": "europe",
        "FI": "europe",
        "FR": "europe",
        "GB": "europe",
        "GR": "europe",
        "HR": "europe",
        "HU": "europe",
        "IE": "europe",
        "IS": "europe",
        "IT": "europe",
        "LT": "europe",
        "LU": "europe",
        "LV": "europe",
        "MT": "europe",
        "NL": "europe",
        "NO": "europe",
        "PL": "europe",
        "PT": "europe",
        "RO": "europe",
        "RS": "europe",
        "SE": "europe",
        "SI": "europe",
        "SK": "europe",
        "UA": "europe",
        "UK": "europe",
        # Asia
        "AE": "asia",
        "BD": "asia",
        "CN": "asia",
        "HK": "asia",
        "ID": "asia",
        "IL": "asia",
        "IN": "asia",
        "IR": "asia",
        "JP": "asia",
        "KR": "asia",
        "KZ": "asia",
        "MY": "asia",
        "NP": "asia",
        "PK": "asia",
        "PH": "asia",
        "QA": "asia",
        "SA": "asia",
        "SG": "asia",
        "TH": "asia",
        "TR": "asia",
        "TW": "asia",
        "VN": "asia",
        # Africa
        "DZ": "africa",
        "EG": "africa",
        "ET": "africa",
        "GH": "africa",
        "KE": "africa",
        "MA": "africa",
        "NG": "africa",
        "TN": "africa",
        "ZA": "africa",
        # Oceania
        "AU": "oceania",
        "NZ": "oceania",
    }

    country_name_to_continent: dict[str, str] = {
        "argentina": "south_america",
        "australia": "oceania",
        "austria": "europe",
        "bangladesh": "asia",
        "belgium": "europe",
        "brazil": "south_america",
        "bulgaria": "europe",
        "canada": "north_america",
        "chile": "south_america",
        "china": "asia",
        "colombia": "south_america",
        "croatia": "europe",
        "cyprus": "europe",
        "czech republic": "europe",
        "czechia": "europe",
        "denmark": "europe",
        "egypt": "africa",
        "estonia": "europe",
        "ethiopia": "africa",
        "finland": "europe",
        "france": "europe",
        "germany": "europe",
        "ghana": "africa",
        "greece": "europe",
        "hong kong": "asia",
        "hungary": "europe",
        "iceland": "europe",
        "india": "asia",
        "indonesia": "asia",
        "iran": "asia",
        "ireland": "europe",
        "israel": "asia",
        "italy": "europe",
        "japan": "asia",
        "kazakhstan": "asia",
        "kenya": "africa",
        "lithuania": "europe",
        "luxembourg": "europe",
        "latvia": "europe",
        "malaysia": "asia",
        "malta": "europe",
        "mexico": "north_america",
        "morocco": "africa",
        "netherlands": "europe",
        "new zealand": "oceania",
        "nigeria": "africa",
        "norway": "europe",
        "pakistan": "asia",
        "peru": "south_america",
        "philippines": "asia",
        "poland": "europe",
        "portugal": "europe",
        "qatar": "asia",
        "romania": "europe",
        "russia": "europe",
        "russian federation": "europe",
        "saudi arabia": "asia",
        "serbia": "europe",
        "singapore": "asia",
        "slovakia": "europe",
        "slovenia": "europe",
        "south africa": "africa",
        "south korea": "asia",
        "spain": "europe",
        "sweden": "europe",
        "switzerland": "europe",
        "taiwan": "asia",
        "thailand": "asia",
        "tunisia": "africa",
        "turkey": "asia",
        "uk": "europe",
        "ukraine": "europe",
        "united arab emirates": "asia",
        "united kingdom": "europe",
        "united states": "north_america",
        "united states of america": "north_america",
        "uruguay": "south_america",
        "venezuela": "south_america",
        "vietnam": "asia",
    }

    def _continent_from_country_token(value: Any) -> str | None:
        clean = _clean_text(value)
        if not clean:
            return None
        upper = clean.upper()
        if len(upper) in {2, 3} and upper.isalpha():
            direct = country_code_to_continent.get(upper)
            if direct:
                return direct
        normalized = clean.casefold()
        normalized = normalized.replace(".", " ").replace(",", " ")
        normalized = " ".join(normalized.split())
        return country_name_to_continent.get(normalized)

    if not collaborator_work_count_by_key:
        normalized_user_name = _clean_text(str(user.name or "")).casefold()
        for work in works:
            authors_json = (
                work.authors_json if isinstance(work.authors_json, list) else []
            )
            if len(authors_json) <= 1:
                continue
            work_id = str(work.id)
            for author in authors_json:
                if not isinstance(author, dict):
                    continue
                author_name = _clean_text(author.get("name"))
                if not author_name:
                    continue
                if (
                    normalized_user_name
                    and author_name.casefold() == normalized_user_name
                ):
                    continue
                collaborator_key = f"name:{author_name.casefold()}"
                if collaborator_key in collaborator_keys_by_work[work_id]:
                    continue
                collaborator_keys_by_work[work_id].add(collaborator_key)
                collaborator_work_count_by_key[collaborator_key] += 1

    collaborative_work_ids: set[str] = {
        work_id for work_id, keys in collaborator_keys_by_work.items() if keys
    }
    if not collaborative_work_ids:
        for work in works:
            authors_json = (
                work.authors_json if isinstance(work.authors_json, list) else []
            )
            if len(authors_json) > 1:
                collaborative_work_ids.add(str(work.id))

    institution_keys_global: set[str] = set()
    country_keys_global: set[str] = set()
    institution_count_by_work: dict[str, int] = {}
    country_count_by_work: dict[str, int] = {}

    def _collect_affiliation_tokens(
        *,
        raw: Any,
        institutions: set[str],
        countries: set[str],
    ) -> None:
        if isinstance(raw, dict):
            institution_name = _clean_text(
                raw.get("name")
                or raw.get("display_name")
                or raw.get("institution_name")
                or raw.get("institution")
                or raw.get("organization")
                or raw.get("organization_name")
            )
            if institution_name:
                institutions.add(institution_name.casefold())
            country_token = _normalize_country_token(
                raw.get("country_code")
                or raw.get("country_name")
                or raw.get("country")
            )
            if country_token:
                countries.add(country_token.casefold())
            return
        if isinstance(raw, str):
            institution_name = _clean_text(raw)
            if institution_name:
                institutions.add(institution_name.casefold())

    for work_id in collaborative_work_ids:
        work = work_by_id.get(work_id)
        if work is None:
            continue
        work_institutions: set[str] = set()
        work_countries: set[str] = set()

        affiliations_json = (
            work.affiliations_json if isinstance(work.affiliations_json, list) else []
        )
        for affiliation in affiliations_json:
            _collect_affiliation_tokens(
                raw=affiliation,
                institutions=work_institutions,
                countries=work_countries,
            )

        authors_json = work.authors_json if isinstance(work.authors_json, list) else []
        for author in authors_json:
            if not isinstance(author, dict):
                continue
            for candidate_key in (
                "affiliation",
                "institution",
                "institution_name",
                "organization",
                "organization_name",
            ):
                _collect_affiliation_tokens(
                    raw=author.get(candidate_key),
                    institutions=work_institutions,
                    countries=work_countries,
                )
            affiliations = author.get("affiliations")
            if isinstance(affiliations, list):
                for affiliation in affiliations:
                    _collect_affiliation_tokens(
                        raw=affiliation,
                        institutions=work_institutions,
                        countries=work_countries,
                    )
            else:
                _collect_affiliation_tokens(
                    raw=affiliations,
                    institutions=work_institutions,
                    countries=work_countries,
                )

        institution_count_by_work[work_id] = len(work_institutions)
        country_count_by_work[work_id] = len(work_countries)
        institution_keys_global.update(work_institutions)
        country_keys_global.update(work_countries)

    work_derived_institution_count = len(institution_keys_global)
    work_derived_country_count = len(country_keys_global)

    collaborator_institution_keys: set[str] = set()
    collaborator_country_keys: set[str] = set()
    for collaborator in collaborators:
        institution_name = _clean_text(collaborator.primary_institution)
        if institution_name:
            collaborator_institution_keys.add(institution_name.casefold())
        country_token = _normalize_country_token(collaborator.country)
        if country_token:
            collaborator_country_keys.add(country_token.casefold())
    for affiliation in collaborator_affiliations:
        institution_name = _clean_text(affiliation.institution_name)
        if institution_name:
            collaborator_institution_keys.add(institution_name.casefold())
        country_token = _normalize_country_token(affiliation.country)
        if country_token:
            collaborator_country_keys.add(country_token.casefold())

    institution_keys_global.update(collaborator_institution_keys)
    country_keys_global.update(collaborator_country_keys)
    collaborator_derived_institution_count = len(collaborator_institution_keys)
    collaborator_derived_country_count = len(collaborator_country_keys)

    unique_collaborators_count = len(collaborator_work_count_by_key)
    repeat_collaborator_keys = {
        collaborator_key
        for collaborator_key, shared_count in collaborator_work_count_by_key.items()
        if int(shared_count or 0) >= 2
    }
    repeat_collaborators_count = len(repeat_collaborator_keys)
    repeat_collaborator_rate_pct = (
        round(
            (repeat_collaborators_count / float(unique_collaborators_count)) * 100.0, 1
        )
        if unique_collaborators_count > 0
        else 0.0
    )
    unique_institutions_count = len(institution_keys_global)
    unique_countries_count = len(country_keys_global)
    continent_keys_global: set[str] = set()
    for country_key in country_keys_global:
        continent = _continent_from_country_token(country_key)
        if continent:
            continent_keys_global.add(continent)
    unique_continents_count = len(continent_keys_global)
    if unique_continents_count <= 0 and unique_countries_count > 0:
        # Keep the tile from showing a misleading zero when country breadth exists
        # but country tokens are not currently mapped.
        unique_continents_count = 1
    collaborative_works_count = len(collaborative_work_ids)

    collaboration_structure_publications = []
    for row in per_work_rows:
        work_id = str(row.get("work_id") or "")
        collaborator_keys = collaborator_keys_by_work.get(work_id, set())
        collaborator_count = len(collaborator_keys)
        if collaborator_count <= 0:
            continue
        repeat_in_work = sum(
            1
            for collaborator_key in collaborator_keys
            if collaborator_key in repeat_collaborator_keys
        )
        collaboration_structure_publications.append(
            _publication_item_with_links(
                {
                    "work_id": row.get("work_id"),
                    "title": row.get("title"),
                    "doi": row.get("doi"),
                    "year": row.get("year"),
                    "journal": row.get("journal"),
                    "citations_lifetime": int(row.get("citations_lifetime") or 0),
                    "collaborators_in_work": collaborator_count,
                    "repeat_collaborators_in_work": repeat_in_work,
                    "institutions_in_work": int(
                        institution_count_by_work.get(work_id, 0)
                    ),
                    "countries_in_work": int(country_count_by_work.get(work_id, 0)),
                    "confidence_score": row.get("confidence_score"),
                    "confidence_label": row.get("confidence_label"),
                    "match_source": row.get("match_source"),
                    "match_method": row.get("match_method"),
                }
            )
        )
    collaboration_structure_publications.sort(
        key=lambda item: (
            -max(0, int(_safe_int(item.get("collaborators_in_work")) or 0)),
            -max(0, int(_safe_int(item.get("repeat_collaborators_in_work")) or 0)),
            -max(0, int(_safe_int(item.get("citations_lifetime")) or 0)),
            str(item.get("title") or "").lower(),
        )
    )
    collaboration_structure_publications = collaboration_structure_publications[:100]
    last5_publication_values = [
        max(0, int(publication_counts_by_year.get(year, 0)))
        for year in last5_complete_years
    ]
    current_year_publications = max(0, int(publication_counts_by_year.get(now.year, 0)))
    projected_current_publications = max(
        current_year_publications,
        int(round(current_year_publications / max(0.01, elapsed_fraction))),
    )
    publication_mean_5y = (
        float(sum(last5_publication_values)) / float(len(last5_publication_values))
        if last5_publication_values
        else 0.0
    )
    total_publications_subtext = (
        f"{current_year_publications} in {now.year} (to date)"
        if current_year_publications > 0
        else f"0 in {now.year} (to date)"
    )
    last_complete_month_end = _month_start(now) - timedelta(seconds=1)
    last_complete_month_start = _month_start(last_complete_month_end)
    publication_counts_by_month_exact: dict[tuple[int, int], int] = defaultdict(int)
    publication_counts_by_year_fallback: dict[int, int] = defaultdict(int)
    unknown_publication_month_or_year = 0
    for row in per_work_rows:
        month_start = _safe_publication_month_start(row.get("publication_month_start"))
        if month_start is not None:
            month_dt = datetime(
                month_start.year, month_start.month, 1, tzinfo=timezone.utc
            )
            if month_dt <= last_complete_month_start:
                publication_counts_by_month_exact[
                    (month_start.year, month_start.month)
                ] += 1
                continue
        parsed_year = _safe_int(row.get("year"))
        if parsed_year is not None and 1900 <= int(parsed_year) <= int(now.year):
            publication_counts_by_year_fallback[int(parsed_year)] += 1
        else:
            unknown_publication_month_or_year += 1
    lifetime_start_year_candidates = [
        year for year in publication_counts_by_year_fallback.keys()
    ] + [year for year, _ in publication_counts_by_month_exact.keys()]
    lifetime_publication_year_start = (
        min(lifetime_start_year_candidates)
        if lifetime_start_year_candidates
        else int(now.year)
    )
    lifetime_publication_year_start = max(
        1900, min(int(now.year), int(lifetime_publication_year_start))
    )
    if unknown_publication_month_or_year > 0:
        publication_counts_by_year_fallback[lifetime_publication_year_start] = (
            int(
                publication_counts_by_year_fallback.get(
                    lifetime_publication_year_start, 0
                )
            )
            + int(unknown_publication_month_or_year)
        )
    lifetime_month_start_point = datetime(
        lifetime_publication_year_start, 1, 1, tzinfo=timezone.utc
    )
    if lifetime_month_start_point > last_complete_month_start:
        lifetime_month_start_point = datetime(
            last_complete_month_start.year,
            last_complete_month_start.month,
            1,
            tzinfo=timezone.utc,
        )
    lifetime_publication_month_count = max(
        1,
        (
            (last_complete_month_start.year - lifetime_month_start_point.year) * 12
            + (last_complete_month_start.month - lifetime_month_start_point.month)
            + 1
        ),
    )
    lifetime_month_points = [
        _shift_month(lifetime_month_start_point, index)
        for index in range(lifetime_publication_month_count)
    ]
    monthly_publication_by_month_key: dict[tuple[int, int], int] = defaultdict(int)
    for key, value in publication_counts_by_month_exact.items():
        monthly_publication_by_month_key[key] += max(0, int(value or 0))
    for year, yearly_count in publication_counts_by_year_fallback.items():
        safe_count = max(0, int(yearly_count or 0))
        if safe_count <= 0:
            continue
        year_month_points = [
            point
            for point in lifetime_month_points
            if int(point.year) == int(year)
        ]
        if not year_month_points:
            continue
        month_slots = len(year_month_points)
        base = safe_count // month_slots
        remainder = safe_count % month_slots
        for index, point in enumerate(year_month_points):
            monthly_publication_by_month_key[(point.year, point.month)] += base + (
                1 if index < remainder else 0
            )
    monthly_publication_values_lifetime = [
        max(0, int(monthly_publication_by_month_key.get((point.year, point.month), 0)))
        for point in lifetime_month_points
    ]
    yearly_publication_totals_from_months: dict[int, int] = defaultdict(int)
    for point, value in zip(lifetime_month_points, monthly_publication_values_lifetime):
        yearly_publication_totals_from_months[int(point.year)] += max(0, int(value or 0))
    lifetime_publication_years = list(
        range(int(lifetime_month_start_point.year), int(now.year) + 1)
    )
    lifetime_publication_values = [
        max(0, int(yearly_publication_totals_from_months.get(year, 0)))
        for year in lifetime_publication_years
    ]
    exact_publication_month_count = int(
        sum(max(0, int(value or 0)) for value in publication_counts_by_month_exact.values())
    )
    fallback_publication_year_count = int(
        sum(max(0, int(value or 0)) for value in publication_counts_by_year_fallback.values())
    )
    publication_month_source = (
        "exact_month"
        if fallback_publication_year_count <= 0
        else (
            "exact_plus_year_fallback"
            if exact_publication_month_count > 0
            else "year_fallback_only"
        )
    )
    lifetime_month_labels = [
        f"{point.year:04d}-{point.month:02d}" for point in lifetime_month_points
    ]
    monthly_publication_values_12m_raw = monthly_publication_values_lifetime[-12:]
    monthly_publication_values_12m = [0 for _ in range(max(0, 12 - len(monthly_publication_values_12m_raw)))] + [
        int(value) for value in monthly_publication_values_12m_raw
    ]
    month_points_12m = [
        _shift_month(last_complete_month_start, -offset) for offset in range(11, -1, -1)
    ]
    month_labels_12m = [point.strftime("%b") for point in month_points_12m]
    lifetime_month_start_iso = (
        f"{lifetime_month_start_point.year:04d}-{lifetime_month_start_point.month:02d}-01"
    )
    lifetime_month_end_iso = (
        f"{last_complete_month_start.year:04d}-{last_complete_month_start.month:02d}-01"
    )
    publication_event_dates = sorted(
        [
            str(event_date)
            for event_date in (
                _safe_publication_date_iso(row.get("publication_date"))
                or _safe_publication_date_iso(row.get("publication_month_start"))
                or (
                    f"{int(row.get('year')):04d}-01-01"
                    if _safe_int(row.get("year")) is not None
                    and 1900 <= int(_safe_int(row.get("year")) or 0) <= int(now.year)
                    else None
                )
                or (
                    f"{int(row.get('fallback_year')):04d}-01-01"
                    if _safe_int(row.get("fallback_year")) is not None
                    and 1900 <= int(_safe_int(row.get("fallback_year")) or 0) <= int(now.year)
                    else None
                )
            for row in per_work_rows
            )
            if event_date is not None
        ]
    )
    influence_monthly_added_totals = [0 for _ in range(24)]
    for row in influence_candidates:
        additions = row.get("semantic_monthly_added_24")
        if not isinstance(additions, list):
            continue
        for idx in range(min(24, len(additions))):
            influence_monthly_added_totals[idx] += max(0, int(additions[idx] or 0))
    influence_prev_12m = max(0, int(sum(influence_monthly_added_totals[:12])))
    influence_delta = influence_last_12m - influence_prev_12m
    influential_ratio = (
        round((influence_total / total_citations) * 100.0, 1)
        if total_citations > 0
        else 0.0
    )
    influential_subtext = f"{influential_ratio:.1f}% of total citations"
    if not influence_available:
        influential_subtext = "Semantic Scholar influential signal unavailable"
    fallback_monthly_influential = [
        max(0, int(value or 0)) for value in influence_monthly_added_totals[-12:]
    ]
    fallback_monthly_cumulative: list[int] = []
    fallback_running_total = 0
    for value in fallback_monthly_influential:
        fallback_running_total += max(0, int(value))
        fallback_monthly_cumulative.append(fallback_running_total)
    influential_chart_values = (
        influential_history_values
        if influential_history_values
        else fallback_monthly_cumulative
    )
    if influential_chart_values:
        normalized_chart_values: list[int] = []
        normalized_running = 0
        for value in influential_chart_values:
            normalized_running = max(normalized_running, max(0, int(value or 0)))
            normalized_chart_values.append(normalized_running)
        influential_chart_values = normalized_chart_values
    influential_chart_labels = (
        [int(year) for year in influential_history_years]
        if influential_history_values
        else list(range(1, len(influential_chart_values) + 1))
    )

    field_percentile_default_threshold = 75
    field_percentile_counts: dict[int, int] = {
        threshold: 0 for threshold in FIELD_PERCENTILE_THRESHOLDS
    }
    field_percentile_shares: dict[str, float] = {
        str(threshold): 0.0 for threshold in FIELD_PERCENTILE_THRESHOLDS
    }
    field_percentile_publications: list[dict[str, Any]] = []
    field_percentile_evaluated = 0
    field_percentile_coverage_pct = 0.0
    field_percentile_median_rank = 0.0
    field_percentile_available = False
    field_percentile_used_cohort_sizes: list[int] = []
    field_percentile_cohort_count = 0

    if "OpenAlex" in data_sources:
        openalex_mailto = _openalex_mailto(
            fallback_email=str(user.email or "").strip() or None
        )
        field_cohort_max_pages = _openalex_field_cohort_max_pages()
        field_cohort_min_size = _openalex_field_cohort_min_size()
        field_exact_rank_max_requests = _openalex_field_percentile_max_exact_ranks()
        field_exact_rank_runtime_limit_seconds = (
            _openalex_field_percentile_exact_runtime_seconds()
        )
        work_field_cache: dict[str, dict[str, Any]] = {}
        cohort_cache: dict[tuple[str, int], dict[str, Any]] = {}
        exact_rank_cache: dict[tuple[str, int, int], float | None] = {}
        percentile_ranks: list[float] = []
        used_cohort_keys: set[tuple[str, int]] = set()
        exact_rank_requests_made = 0
        exact_rank_window_start = time.monotonic()
        exact_rank_budget_exhausted = False
        exact_rank_runtime_exhausted = False

        for row in per_work_rows:
            openalex_work_id = _extract_openalex_work_id(
                str(row.get("openalex_work_id") or "").strip() or None
            )
            if not openalex_work_id:
                continue
            work_field = work_field_cache.get(openalex_work_id)
            if work_field is None:
                work_field = _openalex_primary_field_and_year_for_work(
                    openalex_work_id=openalex_work_id,
                    mailto=openalex_mailto,
                )
                work_field_cache[openalex_work_id] = work_field
            field_id = _normalize_openalex_field_id(work_field.get("field_id"))
            if not field_id:
                continue
            paper_year = _safe_int(row.get("year"))
            resolved_year = (
                int(paper_year)
                if paper_year is not None and 1900 <= paper_year <= now.year
                else _safe_int(work_field.get("publication_year"))
            )
            if (
                resolved_year is None
                or resolved_year < 1900
                or resolved_year > now.year
            ):
                continue

            cohort_key = (field_id, int(resolved_year))
            cohort_entry = cohort_cache.get(cohort_key)
            if cohort_entry is None:
                cohort_payload = _openalex_field_year_citation_cohort(
                    field_id=field_id,
                    year=int(resolved_year),
                    mailto=openalex_mailto,
                    max_pages=field_cohort_max_pages,
                )
                cohort_values = [
                    max(0, int(_safe_int(value) or 0))
                    for value in (
                        cohort_payload.get("citations")
                        if isinstance(cohort_payload, dict)
                        else []
                    )
                ]
                cohort_values.sort()
                total_results_exact = _openalex_field_year_total_count(
                    field_id=field_id,
                    year=int(resolved_year),
                    mailto=openalex_mailto,
                )
                sampled_total_results = max(
                    0,
                    int(_safe_int((cohort_payload or {}).get("total_results")) or 0),
                )
                resolved_total_results = (
                    int(total_results_exact)
                    if total_results_exact is not None and total_results_exact >= 0
                    else sampled_total_results
                )
                cohort_entry = {
                    "citations": cohort_values,
                    "sample_size": len(cohort_values),
                    "total_results": max(0, int(resolved_total_results)),
                    "cutoffs": {
                        str(threshold): _percentile_cutoff(
                            cohort_values, float(threshold)
                        )
                        for threshold in FIELD_PERCENTILE_THRESHOLDS
                    },
                }
                cohort_cache[cohort_key] = cohort_entry
            cohort_values = (
                cohort_entry.get("citations")
                if isinstance(cohort_entry.get("citations"), list)
                else []
            )
            sampled_cohort_size = len(cohort_values)
            total_results = max(
                0,
                int(_safe_int(cohort_entry.get("total_results")) or 0),
            )
            cohort_size = max(sampled_cohort_size, total_results)
            if cohort_size < field_cohort_min_size:
                continue

            paper_citations = max(0, int(row.get("citations_lifetime") or 0))
            exact_rank_key = (field_id, int(resolved_year), paper_citations)
            percentile_rank = exact_rank_cache.get(exact_rank_key)
            if exact_rank_key not in exact_rank_cache:
                elapsed = time.monotonic() - exact_rank_window_start
                can_call_exact = (
                    field_exact_rank_max_requests > 0
                    and exact_rank_requests_made < field_exact_rank_max_requests
                    and elapsed < field_exact_rank_runtime_limit_seconds
                )
                if can_call_exact:
                    exact_rank_requests_made += 1
                    exact_rank_payload = _openalex_field_year_percentile_rank_exact(
                        field_id=field_id,
                        year=int(resolved_year),
                        citations=paper_citations,
                        mailto=openalex_mailto,
                        total_count=total_results if total_results > 0 else None,
                    )
                    rank_raw = exact_rank_payload.get("percentile_rank")
                    percentile_rank = (
                        float(rank_raw) if isinstance(rank_raw, (int, float)) else None
                    )
                else:
                    if (
                        not exact_rank_budget_exhausted
                        and exact_rank_requests_made >= field_exact_rank_max_requests
                    ):
                        exact_rank_budget_exhausted = True
                        logger.info(
                            "Field percentile exact rank budget reached for user %s after %s requests",
                            user_id,
                            exact_rank_requests_made,
                        )
                    if (
                        not exact_rank_runtime_exhausted
                        and elapsed >= field_exact_rank_runtime_limit_seconds
                    ):
                        exact_rank_runtime_exhausted = True
                        logger.info(
                            "Field percentile exact rank runtime reached for user %s after %.1fs",
                            user_id,
                            elapsed,
                        )
                if percentile_rank is None:
                    percentile_rank = _empirical_percentile_rank(
                        cohort_values, paper_citations
                    )
                exact_rank_cache[exact_rank_key] = percentile_rank
            if percentile_rank is None:
                continue

            percentile_ranks.append(percentile_rank)
            field_percentile_evaluated += 1
            for threshold in FIELD_PERCENTILE_THRESHOLDS:
                if percentile_rank >= float(threshold):
                    field_percentile_counts[threshold] += 1

            if cohort_key not in used_cohort_keys:
                used_cohort_keys.add(cohort_key)
                field_percentile_used_cohort_sizes.append(cohort_size)

            field_percentile_publications.append(
                _publication_item_with_links(
                    {
                        "work_id": row.get("work_id"),
                        "title": row.get("title"),
                        "doi": row.get("doi"),
                        "year": row.get("year"),
                        "journal": row.get("journal"),
                        "citations_lifetime": paper_citations,
                        "field_percentile_rank": round(percentile_rank, 2),
                        "field_name": str(work_field.get("field_name") or "").strip()
                        or "Unknown field",
                        "field_id": field_id,
                        "cohort_year": int(resolved_year),
                        "cohort_sample_size": cohort_size,
                        "cohort_total_results": total_results,
                        "cohort_percentile_cutoffs": cohort_entry.get("cutoffs"),
                        "confidence_score": row.get("confidence_score"),
                        "confidence_label": row.get("confidence_label"),
                        "match_source": row.get("match_source"),
                        "match_method": row.get("match_method"),
                    }
                )
            )

        if field_percentile_evaluated > 0:
            field_percentile_available = True
            for threshold in FIELD_PERCENTILE_THRESHOLDS:
                share = (
                    field_percentile_counts[threshold]
                    / float(field_percentile_evaluated)
                ) * 100.0
                field_percentile_shares[str(threshold)] = round(share, 2)
            field_percentile_coverage_pct = round(
                (field_percentile_evaluated / float(max(1, len(per_work_rows))))
                * 100.0,
                1,
            )
            sorted_ranks = sorted(percentile_ranks)
            middle = len(sorted_ranks) // 2
            if len(sorted_ranks) % 2 == 1:
                field_percentile_median_rank = round(sorted_ranks[middle], 2)
            else:
                field_percentile_median_rank = round(
                    (sorted_ranks[middle - 1] + sorted_ranks[middle]) / 2.0,
                    2,
                )
            field_percentile_cohort_count = len(used_cohort_keys)

    if not field_percentile_available and per_work_rows:
        portfolio_citations = sorted(
            [max(0, int(row.get("citations_lifetime") or 0)) for row in per_work_rows]
        )
        if portfolio_citations:
            portfolio_ranks: list[float] = []
            field_percentile_publications = []
            for row in per_work_rows:
                citations_value = max(0, int(row.get("citations_lifetime") or 0))
                rank = _empirical_percentile_rank(portfolio_citations, citations_value)
                if rank is None:
                    continue
                rank_value = float(rank)
                portfolio_ranks.append(rank_value)
                for threshold in FIELD_PERCENTILE_THRESHOLDS:
                    if rank_value >= float(threshold):
                        field_percentile_counts[threshold] += 1
                field_percentile_publications.append(
                    _publication_item_with_links(
                        {
                            "work_id": row.get("work_id"),
                            "title": row.get("title"),
                            "doi": row.get("doi"),
                            "year": row.get("year"),
                            "journal": row.get("journal"),
                            "citations_lifetime": citations_value,
                            "field_percentile_rank": round(rank_value, 2),
                            "field_name": "Portfolio proxy",
                            "field_id": "portfolio_proxy",
                            "cohort_year": row.get("year"),
                            "cohort_sample_size": len(portfolio_citations),
                            "cohort_total_results": len(portfolio_citations),
                            "cohort_percentile_cutoffs": {
                                str(threshold): _percentile_cutoff(
                                    portfolio_citations, float(threshold)
                                )
                                for threshold in FIELD_PERCENTILE_THRESHOLDS
                            },
                            "confidence_score": row.get("confidence_score"),
                            "confidence_label": row.get("confidence_label"),
                            "match_source": "portfolio_proxy",
                            "match_method": "portfolio_distribution",
                        }
                    )
                )
            if portfolio_ranks:
                field_percentile_available = True
                field_percentile_evaluated = len(portfolio_ranks)
                for threshold in FIELD_PERCENTILE_THRESHOLDS:
                    share = (
                        field_percentile_counts[threshold]
                        / float(field_percentile_evaluated)
                    ) * 100.0
                    field_percentile_shares[str(threshold)] = round(share, 2)
                field_percentile_coverage_pct = 100.0
                sorted_ranks = sorted(portfolio_ranks)
                middle = len(sorted_ranks) // 2
                if len(sorted_ranks) % 2 == 1:
                    field_percentile_median_rank = round(sorted_ranks[middle], 2)
                else:
                    field_percentile_median_rank = round(
                        (sorted_ranks[middle - 1] + sorted_ranks[middle]) / 2.0,
                        2,
                    )
                field_percentile_cohort_count = 1
                field_percentile_used_cohort_sizes = [len(portfolio_citations)]

    field_percentile_publications = sorted(
        field_percentile_publications,
        key=lambda item: float(item.get("field_percentile_rank") or 0.0),
        reverse=True,
    )[:100]
    field_percentile_default_share = (
        float(
            field_percentile_shares.get(str(field_percentile_default_threshold)) or 0.0
        )
        if field_percentile_available
        else 0.0
    )
    field_percentile_cohort_size_median = (
        float(
            sorted(field_percentile_used_cohort_sizes)[
                len(field_percentile_used_cohort_sizes) // 2
            ]
        )
        if field_percentile_used_cohort_sizes
        else 0.0
    )

    h_projection_publications = [
        _publication_item_with_links(dict(item))
        for item in (h_projection.get("candidate_papers") or [])
        if isinstance(item, dict)
    ]

    total_tooltip, total_tooltip_details = _build_tooltip(
        definition="What is this: lifetime citations and annual citation growth across your portfolio.",
        data_sources=["OpenAlex"] if "OpenAlex" in data_sources else data_sources,
        computation=(
            "sum(latest citations per publication); growth badge from last 5 complete years; "
            "ghost bar is current-year projection from YTD run-rate"
        ),
    )
    this_year_tooltip, this_year_tooltip_details = _build_tooltip(
        definition="What is this: total authored publications with per-year output over the latest 5 complete years.",
        data_sources=_available_metric_sources("ORCID", "OpenAlex"),
        computation="count(publications) grouped by publication year",
    )
    momentum_tooltip, momentum_tooltip_details = _build_tooltip(
        definition="What is this: MomentumIndex compares recent citation pace with prior pace.",
        data_sources=[
            src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}
        ],
        computation="MomentumIndex = (avg/month last 3m)/(avg/month prior 9m)*100",
    )
    h_tooltip, h_tooltip_details = _build_tooltip(
        definition="What is this: current h-index with a one-year projection.",
        data_sources=[
            src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}
        ],
        computation=(
            "estimate from papers near threshold [h-2,h+2] using last-12m citation velocity; "
            "reported as low/medium/high confidence band"
        ),
    )
    concentration_tooltip, concentration_tooltip_details = _build_tooltip(
        definition="What is this: percentage of lifetime citations coming from your top 3 papers.",
        data_sources=[
            src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}
        ],
        computation="Top3Share=(sum(top3 citations)/total citations)*100; profile band from Gini(citations across papers)",
    )
    influence_tooltip, influence_tooltip_details = _build_tooltip(
        definition="What is this: influential citations from Semantic Scholar.",
        data_sources=["Semantic Scholar"] if influence_available else ["OpenAlex"],
        computation=(
            "sum(influentialCitationCount) when available; line chart shows totals by publication year "
            "across full publication history"
        ),
    )
    field_percentile_tooltip, field_percentile_tooltip_details = _build_tooltip(
        definition=(
            "What is this: share of your papers at or above citation percentile thresholds "
            "within same-field, same-year OpenAlex cohorts."
        ),
        data_sources=["OpenAlex"] if "OpenAlex" in data_sources else data_sources,
        computation=(
            "For each paper: percentile_rank = empirical percentile of cited_by_count in OpenAlex works "
            "filtered by primary field and publication year; portfolio metric is % of papers >= selected threshold "
            "(50/75/90/95/99)"
        ),
    )
    authorship_tooltip, authorship_tooltip_details = _build_tooltip(
        definition=(
            "What is this: authorship role composition and leadership share across your publication portfolio."
        ),
        data_sources=["OpenAlex"] if "OpenAlex" in data_sources else data_sources,
        computation=(
            "FirstAuthorship% = first-authored papers / total papers * 100; "
            "SecondAuthorship% = second-authored papers / total papers * 100; "
            "SeniorAuthorship% = last-authored papers / total papers * 100; "
            "LeadershipIndex% = (first + last authored papers) / total papers * 100; "
            "MedianAuthorPosition = median(user author_order where available)"
        ),
    )
    collaboration_tooltip, collaboration_tooltip_details = _build_tooltip(
        definition=(
            "What is this: collaboration network breadth and repeat-collaboration structure."
        ),
        data_sources=_available_metric_sources("OpenAlex", "ORCID"),
        computation=(
            "UniqueCollaborators = distinct non-user coauthors across works; "
            "RepeatCollaboratorRate% = collaborators with >=2 shared works / unique collaborators * 100; "
            "Institutions and Countries = distinct affiliation entities across collaborative works."
        ),
    )

    tiles = [
        _metric_tile(
            key="total_citations",
            label="Total citations",
            value=total_citations,
            value_display=_format_int(total_citations),
            subtext=f"+{_format_int(citations_last_12m)} in last 12 months",
            badge={"label": "", "severity": "neutral"},
            chart_type="bar_year_5",
            chart_data={
                "years": last5_complete_years,
                "values": last5_complete_values,
                "monthly_values_12m": monthly_last_12,
                "mean_value": round(five_year_mean, 2),
                "projected_year": now.year,
                "projected_value": projected_current_year,
                "projected_confidence": projection_confidence,
                "current_year_ytd": current_year_ytd,
                "projection_components": {
                    "ytd_run_rate_projection": ytd_run_rate_projection,
                    "trend_projection": trend_projection,
                    "five_year_mean": round(five_year_mean, 2),
                    "weights": {
                        "ytd_run_rate": 0.5,
                        "trend_projection": 0.3,
                        "five_year_mean": 0.2,
                    },
                },
            },
            delta_value=None,
            delta_display=projection_subtext,
            unit="citations",
            sparkline=last5_complete_values,
            tooltip=total_tooltip,
            tooltip_details=total_tooltip_details,
            data_source=["OpenAlex"] if "OpenAlex" in data_sources else data_sources,
            confidence_score=_confidence_score_from_publications(
                total_citation_publications
            ),
            stability="stable",
            drilldown={
                "title": "Total citations",
                "definition": "Lifetime citations across all publications with annual growth context.",
                "formula": "sum(latest citations per publication)",
                "confidence_note": _confidence_note(),
                "publications": total_citation_publications,
                "metadata": {
                    "intermediate_values": {
                        "total_citations": total_citations,
                        "citations_last_12_months": citations_last_12m,
                        "five_year_delta": five_year_delta,
                        "five_year_growth_state": growth_label,
                        "five_year_growth_slope_norm": round(growth_slope_norm, 4),
                        "current_year_ytd": current_year_ytd,
                        "projected_current_year": projected_current_year,
                        "projection_confidence": projection_confidence,
                        "ytd_run_rate_projection": ytd_run_rate_projection,
                        "trend_projection": trend_projection,
                    },
                    "year_bar_values": {
                        "years": last5_complete_years,
                        "values": last5_complete_values,
                        "mean_value": round(five_year_mean, 2),
                        "projected_year": now.year,
                        "projected_value": projected_current_year,
                    },
                },
            },
        ),
        _metric_tile(
            key="this_year_vs_last",
            label="Total publications",
            value=total_publications,
            value_display=_format_int(total_publications),
            subtext=total_publications_subtext,
            badge={"label": "", "severity": "neutral"},
            chart_type="bar_year_5",
            chart_data={
                "years": lifetime_publication_years,
                "values": lifetime_publication_values,
                "monthly_values_12m": monthly_publication_values_12m,
                "month_labels_12m": month_labels_12m,
                "monthly_values_lifetime": monthly_publication_values_lifetime,
                "month_labels_lifetime": lifetime_month_labels,
                "publication_event_dates": publication_event_dates,
                "lifetime_month_start": lifetime_month_start_iso,
                "lifetime_month_end": lifetime_month_end_iso,
                "publication_month_source": publication_month_source,
                "publication_month_exact_count": exact_publication_month_count,
                "publication_month_fallback_count": fallback_publication_year_count,
                "mean_value": round(publication_mean_5y, 2),
                "projected_year": now.year,
                "projected_value": projected_current_publications,
                "projected_confidence": projection_confidence,
                "current_year_ytd": current_year_publications,
                "author_role_counts": author_role_counts,
                "author_role_unknown": author_role_unknown,
            },
            delta_value=None,
            delta_display=None,
            unit="publications",
            sparkline=last5_publication_values,
            tooltip=this_year_tooltip,
            tooltip_details=this_year_tooltip_details,
            data_source=_available_metric_sources("ORCID", "OpenAlex"),
            confidence_score=_confidence_score_from_publications(
                publication_volume_publications
            ),
            stability="stable",
            drilldown={
                "title": "Total publications",
                "definition": "Counts authored publications and groups them by publication year.",
                "formula": "count(publications) by year",
                "confidence_note": _confidence_note(),
                "publications": publication_volume_publications,
                "metadata": {
                    "intermediate_values": {
                        "total_publications": total_publications,
                        "known_year_publications": int(
                            sum(
                                max(0, int(value or 0))
                                for value in publication_counts_by_year.values()
                            )
                        ),
                        "unknown_year_publications": unknown_year_publications,
                        "last5_years": last5_complete_years,
                        "last5_values": last5_publication_values,
                        "lifetime_years": lifetime_publication_years,
                        "lifetime_values": lifetime_publication_values,
                        "lifetime_month_start": lifetime_month_start_iso,
                        "lifetime_month_end": lifetime_month_end_iso,
                        "publication_month_source": publication_month_source,
                        "publication_month_exact_count": exact_publication_month_count,
                        "publication_month_fallback_count": fallback_publication_year_count,
                        "current_year_ytd": current_year_publications,
                        "projected_current_year": projected_current_publications,
                        "projection_confidence": projection_confidence,
                        "author_role_counts": author_role_counts,
                        "author_role_unknown": author_role_unknown,
                    }
                },
            },
        ),
        _metric_tile(
            key="momentum",
            label="Momentum",
            value=momentum_index,
            value_display=f"Momentum {int(round(momentum_index))}",
            subtext=momentum_index_state,
            badge={
                "label": momentum_index_state,
                "severity": "positive"
                if momentum_index_state == "Accelerating"
                else "caution"
                if momentum_index_state == "Slowing"
                else "neutral",
            },
            chart_type="gauge",
            chart_data={
                "min": 0,
                "max": 150,
                "value": momentum_index,
                "zones": [
                    {"label": "cool", "from": 0, "to": 95},
                    {"label": "neutral", "from": 95, "to": 105},
                    {"label": "hot", "from": 105, "to": 150},
                ],
                "monthly_values_12m": monthly_last_12,
                "highlight_last_n": 3,
            },
            delta_value=momentum_delta,
            delta_display=f"{momentum_delta:+.2f} vs previous window",
            unit="index",
            sparkline=monthly_last_12,
            tooltip=momentum_tooltip,
            tooltip_details=momentum_tooltip_details,
            data_source=[
                src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}
            ],
            confidence_score=_confidence_score_from_publications(momentum_publications),
            stability="stable" if momentum_index_state != "Slowing" else "unstable",
            drilldown={
                "title": "Momentum",
                "definition": "Momentum index compares the latest 3-month citation pace vs prior 9 months.",
                "formula": "MomentumIndex = (avg/month last 3m)/(avg/month prior 9m)*100",
                "confidence_note": _confidence_note(),
                "publications": momentum_publications,
                "metadata": {
                    "intermediate_values": {
                        "momentum_index": momentum_index,
                        "momentum_score_last_12m": momentum_score,
                        "momentum_score_prev_12m": momentum_previous_score,
                    },
                    "monthly_values_12m": monthly_last_12,
                    "weighted_monthly_values_12m": momentum_weighted_monthly,
                },
            },
        ),
        _metric_tile(
            key="h_index_projection",
            label="h-index",
            value=h_index,
            value_display=f"{h_index}",
            subtext=h_subtext,
            badge={"label": "", "severity": "neutral"},
            chart_type="bar_year_5_h",
            chart_data={
                "years": last5_complete_years,
                "values": h_yearly_values,
                "projected_year": now.year,
                "projected_value": h_projected_current_year,
                "progress_to_next_pct": float(
                    h_projection.get("progress_to_next_pct") or 0.0
                ),
                "current_h_index": h_index,
                "next_h_index": h_index + 1,
                "projection_probability": float(
                    h_projection.get("projection_probability") or 0.0
                ),
                "projection_confidence_label": h_confidence_label,
                "candidate_gaps": h_candidate_gaps,
                "gap_text": h_gap_text,
            },
            delta_value=None,
            delta_display=h_delta_display,
            unit="index",
            sparkline=h_index_series,
            tooltip=h_tooltip,
            tooltip_details=h_tooltip_details,
            data_source=[
                src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}
            ],
            confidence_score=_confidence_score_from_publications(
                h_projection_publications
            ),
            stability="stable",
            drilldown={
                "title": "h-index projection",
                "definition": "Current h-index and a 12-month projection using near-threshold papers.",
                "formula": "Use papers in [h-2,h+2] and last-12m velocity to estimate crossing probability.",
                "confidence_note": _confidence_note(),
                "publications": h_projection_publications,
                "metadata": {
                    "intermediate_values": {
                        **h_projection,
                        "h_yearly_values_last5_complete_years": h_yearly_values,
                        "h_projected_current_year": h_projected_current_year,
                        "progress_to_next_h_pct": h_progress_to_next,
                        "next_h_target": h_next_target,
                        "projection_confidence_label": h_confidence_label,
                        "candidate_gap_text": h_gap_text,
                    },
                },
            },
        ),
        _metric_tile(
            key="impact_concentration",
            label="Impact concentration",
            value=concentration_risk,
            value_display=f"{concentration_risk:.1f}%",
            subtext=concentration_classification,
            badge={
                "label": concentration_classification,
                "severity": "neutral",
            },
            chart_type="donut",
            chart_data={
                "labels": ["Top 3 papers", "All other papers"],
                "values": [top3_citations, max(0, total_citations - top3_citations)],
                "gini_coefficient": concentration_gini,
                "gini_profile_label": concentration_classification,
                "top_papers_count": min(3, total_publications),
                "remaining_papers_count": max(
                    0, total_publications - min(3, total_publications)
                ),
                "total_publications": total_publications,
                "uncited_publications_count": uncited_publications_count,
                "uncited_publications_pct": round(uncited_publications_pct, 2),
            },
            delta_value=concentration_delta,
            delta_display=f"{concentration_delta:+.2f}pp",
            unit="percent",
            sparkline=concentration_series,
            tooltip=concentration_tooltip,
            tooltip_details=concentration_tooltip_details,
            data_source=[
                src for src in data_sources if src in {"OpenAlex", "Semantic Scholar"}
            ],
            confidence_score=_confidence_score_from_publications(
                concentration_publications
            ),
            stability="stable",
            drilldown={
                "title": "Impact concentration",
                "definition": "Share of lifetime citations attributable to the top 3 papers.",
                "formula": "(top3 citations / total citations) * 100",
                "confidence_note": _confidence_note(),
                "publications": concentration_publications,
                "metadata": {
                    "intermediate_values": {
                        "top3_citations": top3_citations,
                        "total_citations": total_citations,
                        "top_papers_count": min(3, total_publications),
                        "remaining_papers_count": max(
                            0, total_publications - min(3, total_publications)
                        ),
                        "total_publications": total_publications,
                        "concentration_pct": concentration_risk,
                        "classification": concentration_classification,
                        "gini_coefficient": concentration_gini,
                        "gini_profile_label": concentration_classification,
                        "uncited_publications_count": uncited_publications_count,
                        "uncited_publications_pct": round(uncited_publications_pct, 2),
                    }
                },
            },
        ),
        _metric_tile(
            key="influential_citations",
            label="Influential citations",
            value=influence_total if influence_available else None,
            value_display=_format_int(influence_total)
            if influence_available
            else "Not available",
            subtext=influential_subtext,
            badge={
                "label": "Available" if influence_available else "Unavailable",
                "severity": "neutral" if influence_available else "caution",
            },
            chart_type="bar_month_12",
            chart_data={
                "years": influential_history_years,
                "labels": influential_chart_labels,
                "values": influential_chart_values,
                "monthly_values_12m": influence_monthly_added_totals[-12:],
                "influential_ratio_pct": influential_ratio,
            },
            delta_value=None,
            delta_display=None,
            unit="influential citations",
            sparkline=influential_chart_values,
            tooltip=influence_tooltip,
            tooltip_details=influence_tooltip_details,
            data_source=["Semantic Scholar"] if influence_available else ["OpenAlex"],
            confidence_score=_confidence_score_from_publications(
                influence_publications
            ),
            stability="stable",
            drilldown={
                "title": "Influential citations",
                "definition": "Citations judged influential by Semantic Scholar for your publications.",
                "formula": "sum(semantic_scholar.influentialCitationCount)",
                "confidence_note": _confidence_note(),
                "publications": influence_publications if influence_available else [],
                "metadata": {
                    "intermediate_values": {
                        "influence_total": influence_total,
                        "influence_last_12m": influence_last_12m,
                        "influence_prev_12m": influence_prev_12m,
                        "influence_delta": influence_delta,
                        "influential_ratio_pct": influential_ratio,
                        "unknown_year_influential_citations": unknown_year_influential_citations,
                    },
                    "influential_monthly_counts_24m": influence_monthly_added_totals,
                    "influential_yearly_values": {
                        "years": influential_history_years,
                        "values": influential_history_values,
                    },
                },
            },
        ),
        _metric_tile(
            key="field_percentile_share",
            label="Field percentile share",
            value=field_percentile_default_share
            if field_percentile_available
            else None,
            value_display=f"{int(round(field_percentile_default_share))}%"
            if field_percentile_available
            else "Not available",
            subtext=(
                f"{field_percentile_evaluated} papers benchmarked"
                if field_percentile_available
                else "OpenAlex cohort data unavailable"
            ),
            badge={"label": "", "severity": "neutral"},
            chart_type="percentile_toggle",
            chart_data={
                "thresholds": FIELD_PERCENTILE_THRESHOLDS,
                "default_threshold": field_percentile_default_threshold,
                "share_by_threshold_pct": field_percentile_shares,
                "count_by_threshold": {
                    str(threshold): int(field_percentile_counts.get(threshold, 0))
                    for threshold in FIELD_PERCENTILE_THRESHOLDS
                },
                "evaluated_papers": field_percentile_evaluated,
                "total_papers": len(per_work_rows),
                "coverage_pct": field_percentile_coverage_pct,
                "median_percentile_rank": field_percentile_median_rank,
                "cohort_count": field_percentile_cohort_count,
                "cohort_median_sample_size": field_percentile_cohort_size_median,
            },
            delta_value=None,
            delta_display=None,
            unit="percent",
            sparkline=[
                float(field_percentile_shares.get(str(threshold)) or 0.0)
                for threshold in FIELD_PERCENTILE_THRESHOLDS
            ],
            tooltip=field_percentile_tooltip,
            tooltip_details=field_percentile_tooltip_details,
            data_source=["OpenAlex"] if "OpenAlex" in data_sources else data_sources,
            confidence_score=_confidence_score_from_publications(
                field_percentile_publications
            ),
            stability="stable" if field_percentile_available else "unstable",
            drilldown={
                "title": "Field percentile share",
                "definition": (
                    "Share of papers meeting citation percentile thresholds in OpenAlex "
                    "cohorts matched by primary field and publication year."
                ),
                "formula": (
                    "% at threshold T = count(papers with percentile_rank >= T) / "
                    "count(papers with cohort match)"
                ),
                "confidence_note": _confidence_note(),
                "publications": field_percentile_publications,
                "metadata": {
                    "intermediate_values": {
                        "thresholds": FIELD_PERCENTILE_THRESHOLDS,
                        "default_threshold": field_percentile_default_threshold,
                        "share_by_threshold_pct": field_percentile_shares,
                        "count_by_threshold": {
                            str(threshold): int(
                                field_percentile_counts.get(threshold, 0)
                            )
                            for threshold in FIELD_PERCENTILE_THRESHOLDS
                        },
                        "evaluated_papers": field_percentile_evaluated,
                        "total_papers": len(per_work_rows),
                        "coverage_pct": field_percentile_coverage_pct,
                        "median_percentile_rank": field_percentile_median_rank,
                        "cohort_count": field_percentile_cohort_count,
                        "cohort_median_sample_size": field_percentile_cohort_size_median,
                    }
                },
            },
        ),
        _metric_tile(
            key="authorship_composition",
            label="Authorship composition",
            value=leadership_index_pct if authorship_total_papers > 0 else None,
            value_display=f"{int(round(leadership_index_pct))}%"
            if authorship_total_papers > 0
            else "Not available",
            subtext="Leadership index",
            badge={"label": "", "severity": "neutral"},
            chart_type="authorship_structure",
            chart_data={
                "first_authorship_pct": first_authorship_pct,
                "second_authorship_pct": second_authorship_pct,
                "senior_authorship_pct": senior_authorship_pct,
                "leadership_index_pct": leadership_index_pct,
                "median_author_position": median_author_position,
                "median_author_position_display": median_author_position_display,
                "first_authorship_count": first_authorship_count,
                "second_authorship_count": second_authorship_count,
                "senior_authorship_count": senior_authorship_count,
                "leadership_count": leadership_count,
                "known_role_count": authorship_known_papers,
                "unknown_role_count": int(author_role_unknown),
                "known_position_count": len(author_positions_known),
                "total_papers": authorship_total_papers,
            },
            delta_value=None,
            delta_display=None,
            unit="percent",
            sparkline=[
                first_authorship_pct,
                second_authorship_pct,
                senior_authorship_pct,
                leadership_index_pct,
            ],
            tooltip=authorship_tooltip,
            tooltip_details=authorship_tooltip_details,
            data_source=["OpenAlex"] if "OpenAlex" in data_sources else data_sources,
            confidence_score=_confidence_score_from_publications(
                authorship_structure_publications
            ),
            stability="stable" if authorship_known_papers > 0 else "unstable",
            drilldown={
                "title": "Authorship composition",
                "definition": (
                    "Role distribution across your publications with leadership share and median author position."
                ),
                "formula": (
                    "LeadershipIndex = (First + Last authored papers) / Total papers; "
                    "Median position computed from known author_order values."
                ),
                "confidence_note": _confidence_note(),
                "publications": authorship_structure_publications,
                "metadata": {
                    "intermediate_values": {
                        "first_authorship_pct": first_authorship_pct,
                        "second_authorship_pct": second_authorship_pct,
                        "senior_authorship_pct": senior_authorship_pct,
                        "leadership_index_pct": leadership_index_pct,
                        "median_author_position": median_author_position,
                        "first_authorship_count": first_authorship_count,
                        "second_authorship_count": second_authorship_count,
                        "senior_authorship_count": senior_authorship_count,
                        "leadership_count": leadership_count,
                        "known_role_count": authorship_known_papers,
                        "unknown_role_count": int(author_role_unknown),
                        "known_position_count": len(author_positions_known),
                        "total_papers": authorship_total_papers,
                    }
                },
            },
        ),
        _metric_tile(
            key="collaboration_structure",
            label="Collaboration structure",
            value=float(unique_collaborators_count),
            value_display=_format_int(unique_collaborators_count),
            subtext="Unique collaborators",
            badge={"label": "", "severity": "neutral"},
            chart_type="collaboration_structure",
            chart_data={
                "unique_collaborators": int(unique_collaborators_count),
                "repeat_collaborator_rate_pct": float(repeat_collaborator_rate_pct),
                "repeat_collaborators": int(repeat_collaborators_count),
                "institutions": int(unique_institutions_count),
                "countries": int(unique_countries_count),
                "continents": int(unique_continents_count),
                "collaborative_works": int(collaborative_works_count),
                "institutions_from_works": int(work_derived_institution_count),
                "countries_from_works": int(work_derived_country_count),
                "institutions_from_collaborators": int(
                    collaborator_derived_institution_count
                ),
                "countries_from_collaborators": int(
                    collaborator_derived_country_count
                ),
            },
            delta_value=None,
            delta_display=None,
            unit="count",
            sparkline=[
                float(unique_collaborators_count),
                float(repeat_collaborator_rate_pct),
                float(unique_institutions_count),
                float(unique_countries_count),
                float(unique_continents_count),
            ],
            tooltip=collaboration_tooltip,
            tooltip_details=collaboration_tooltip_details,
            data_source=_available_metric_sources("OpenAlex", "ORCID"),
            confidence_score=_confidence_score_from_publications(
                collaboration_structure_publications
            ),
            stability="stable" if unique_collaborators_count > 0 else "unstable",
            drilldown={
                "title": "Collaboration structure",
                "definition": (
                    "Breadth and recurrence of your collaborator network, plus affiliation diversity."
                ),
                "formula": (
                    "RepeatCollaboratorRate = collaborators with >=2 shared works / "
                    "unique collaborators * 100"
                ),
                "confidence_note": _confidence_note(),
                "publications": collaboration_structure_publications,
                "metadata": {
                    "intermediate_values": {
                        "unique_collaborators": int(unique_collaborators_count),
                        "repeat_collaborator_rate_pct": float(
                            repeat_collaborator_rate_pct
                        ),
                        "repeat_collaborators": int(repeat_collaborators_count),
                        "institutions": int(unique_institutions_count),
                        "countries": int(unique_countries_count),
                        "continents": int(unique_continents_count),
                        "collaborative_works": int(collaborative_works_count),
                        "institutions_from_works": int(
                            work_derived_institution_count
                        ),
                        "countries_from_works": int(work_derived_country_count),
                        "institutions_from_collaborators": int(
                            collaborator_derived_institution_count
                        ),
                        "countries_from_collaborators": int(
                            collaborator_derived_country_count
                        ),
                    }
                },
            },
        ),
    ]

    if dimensions_tile is not None:
        tiles.append(dimensions_tile)

    for index, tile in enumerate(tiles):
        if not isinstance(tile, dict):
            continue
        tiles[index] = _attach_canonical_drilldown(tile=tile, now=now)

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
        "tiles": tiles[:10],
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
                "rolling_citations_12m": _series_to_sparkline(
                    rolling_last_12_series_24
                ),
                "momentum_weighted_monthly_12m": _series_to_sparkline(
                    momentum_weighted_monthly
                ),
                "influential_monthly_citations_24m": _series_to_sparkline(
                    influence_monthly_added_totals
                ),
                "influential_yearly_citations_lifespan": _series_to_sparkline(
                    influential_history_values
                ),
                "field_percentile_share_by_threshold": _series_to_sparkline(
                    [
                        float(field_percentile_shares.get(str(threshold)) or 0.0)
                        for threshold in FIELD_PERCENTILE_THRESHOLDS
                    ]
                ),
                "authorship_composition_pct": _series_to_sparkline(
                    [
                        first_authorship_pct,
                        second_authorship_pct,
                        senior_authorship_pct,
                        leadership_index_pct,
                    ]
                ),
                "collaboration_structure": _series_to_sparkline(
                    [
                        float(unique_collaborators_count),
                        float(repeat_collaborator_rate_pct),
                        float(unique_institutions_count),
                        float(unique_countries_count),
                    ]
                ),
                "concentration_risk_12m": _series_to_sparkline(concentration_series),
            },
        },
    }


def _persist_ready_bundle(
    *, user_id: str, payload: dict[str, Any], computed_at: datetime
) -> None:
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
        "last_error": str(row.last_error or "").strip() or None
        if row is not None
        else None,
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
            computed_at = (
                _coerce_utc(row.computed_at) if row.computed_at is not None else None
            )
            stale = _is_stale(computed_at=computed_at, now=_utcnow())
            payload = _read_bundle_payload(row)
            metadata = payload.get("metadata") if isinstance(payload, dict) else {}
            schema_version = (
                _safe_int(metadata.get("schema_version"))
                if isinstance(metadata, dict)
                else None
            )
            schema_outdated = (schema_version or 0) < TOP_METRICS_SCHEMA_VERSION
            should_retry_failed = status == FAILED_STATUS
            if (
                stale or schema_outdated or should_retry_failed
            ) and status != RUNNING_STATUS:
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
        raise PublicationMetricsNotFoundError(
            "Publication metrics payload is unavailable."
        )

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

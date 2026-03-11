from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import json
import math
import os
import re
import time
from collections import Counter
from typing import Any, Callable, Literal

from research_os.clients.openai_client import create_response
from research_os.clients.openai_client import get_client
from research_os.config import ConfigurationError
from research_os.config import get_openai_api_key
from research_os.services.publication_metrics_service import (
    PublicationMetricsNotFoundError,
    get_publication_top_metrics,
)

AGENT_NAME = "Publication insights agent"
PROMPT_VERSION = "publication_insights_agent_v12"
PREFERRED_MODEL = "gpt-5.4"
PUBLICATION_INSIGHTS_AVAILABILITY_CACHE_TTL_SECONDS = 60

_publication_insights_availability_checked_at: float | None = None
_publication_insights_availability_value = False

WINDOW_CONFIG: dict[str, dict[str, str]] = {
    "1y": {
        "field": "citations_1y_rolling",
        "label": "1y",
        "phrase": "in the last year",
    },
    "3y": {
        "field": "citations_3y_rolling",
        "label": "3y",
        "phrase": "in the last 3 years",
    },
    "5y": {
        "field": "citations_5y_rolling",
        "label": "5y",
        "phrase": "in the last 5 years",
    },
    "all": {
        "field": "citations_life_rolling",
        "label": "Life",
        "phrase": "across your full publication history",
    },
}

UNCITED_RECENT_YEARS = 3
DEFAULT_PUBLICATION_INSIGHTS_OPENAI_TIMEOUT_SECONDS = 45.0
DEFAULT_PUBLICATION_INSIGHTS_REASONING_EFFORT = "medium"
DEFAULT_PUBLICATION_INSIGHTS_MAX_OUTPUT_TOKENS = 2400
DEFAULT_PUBLICATION_OUTPUT_PATTERN_MAX_OUTPUT_TOKENS = 1600
PUBLICATION_OUTPUT_PATTERN_SCHEMA_NAME = "publication_output_pattern_insight"
PUBLICATION_OUTPUT_PATTERN_OPTIONS: tuple[str, ...] = (
    "too early to read",
    "continuous growth",
    "broadly stable",
    "growth flattening",
    "output easing",
    "peak-led record",
    "burst-led output",
    "interrupted pattern",
    "rebuilding output",
    "active across years",
)
DEFAULT_PUBLICATION_PRODUCTION_PHASE_MAX_OUTPUT_TOKENS = 1200
PUBLICATION_PRODUCTION_PHASE_SCHEMA_NAME = "publication_production_phase_insight"
PUBLICATION_PRODUCTION_PHASE_OPTIONS: tuple[str, ...] = (
    "early build",
    "accelerating",
    "established expansion",
    "established but concentrated",
    "intermittent",
    "plateauing",
    "reactivated",
)
DEFAULT_PUBLICATION_YEAR_OVER_YEAR_TRAJECTORY_MAX_OUTPUT_TOKENS = 1200
PUBLICATION_YEAR_OVER_YEAR_TRAJECTORY_SCHEMA_NAME = (
    "publication_year_over_year_trajectory_insight"
)
PUBLICATION_YEAR_OVER_YEAR_TRAJECTORY_OPTIONS: tuple[str, ...] = (
    "expanding",
    "stable",
    "contracting",
)
DEFAULT_PUBLICATION_MIX_MAX_OUTPUT_TOKENS = 1400
PUBLICATION_ARTICLE_TYPE_OVER_TIME_SCHEMA_NAME = (
    "publication_article_type_over_time_insight"
)
PUBLICATION_TYPE_OVER_TIME_SCHEMA_NAME = "publication_type_over_time_insight"
PUBLICATION_MIX_PATTERN_OPTIONS: tuple[str, ...] = (
    "short_record",
    "late_leader_shift",
    "leader_shift",
    "same_leader_more_concentrated",
    "same_leader_narrower",
    "broader_recent",
    "stable_anchor",
)


class PublicationInsightsAgentValidationError(RuntimeError):
    pass


def _publication_insights_openai_timeout_seconds() -> float:
    raw_value = str(
        os.getenv(
            "PUBLICATION_INSIGHTS_OPENAI_TIMEOUT_SECONDS",
            str(DEFAULT_PUBLICATION_INSIGHTS_OPENAI_TIMEOUT_SECONDS),
        )
        or ""
    ).strip()
    try:
        parsed = float(raw_value)
    except Exception:
        return DEFAULT_PUBLICATION_INSIGHTS_OPENAI_TIMEOUT_SECONDS
    if not math.isfinite(parsed) or parsed < 5.0:
        return DEFAULT_PUBLICATION_INSIGHTS_OPENAI_TIMEOUT_SECONDS
    return min(parsed, 120.0)


def _publication_insights_reasoning_effort() -> str:
    raw_value = str(
        os.getenv(
            "PUBLICATION_INSIGHTS_REASONING_EFFORT",
            DEFAULT_PUBLICATION_INSIGHTS_REASONING_EFFORT,
        )
        or ""
    ).strip().lower()
    allowed = {"none", "minimal", "low", "medium", "high", "xhigh"}
    if raw_value in allowed:
        return raw_value
    return DEFAULT_PUBLICATION_INSIGHTS_REASONING_EFFORT


def _publication_insights_text_config() -> dict[str, Any]:
    return {"format": {"type": "json_object"}}


def _publication_insights_max_output_tokens() -> int:
    raw_value = str(
        os.getenv(
            "PUBLICATION_INSIGHTS_MAX_OUTPUT_TOKENS",
            str(DEFAULT_PUBLICATION_INSIGHTS_MAX_OUTPUT_TOKENS),
        )
        or ""
    ).strip()
    try:
        parsed = int(raw_value)
    except Exception:
        return DEFAULT_PUBLICATION_INSIGHTS_MAX_OUTPUT_TOKENS
    if parsed < 512:
        return DEFAULT_PUBLICATION_INSIGHTS_MAX_OUTPUT_TOKENS
    return min(parsed, 4096)


def _publication_output_pattern_max_output_tokens() -> int:
    return min(
        _publication_insights_max_output_tokens(),
        DEFAULT_PUBLICATION_OUTPUT_PATTERN_MAX_OUTPUT_TOKENS,
    )


def _publication_production_phase_max_output_tokens() -> int:
    return min(
        _publication_insights_max_output_tokens(),
        DEFAULT_PUBLICATION_PRODUCTION_PHASE_MAX_OUTPUT_TOKENS,
    )


def _publication_year_over_year_trajectory_max_output_tokens() -> int:
    return min(
        _publication_insights_max_output_tokens(),
        DEFAULT_PUBLICATION_YEAR_OVER_YEAR_TRAJECTORY_MAX_OUTPUT_TOKENS,
    )


def _publication_mix_max_output_tokens() -> int:
    return min(
        _publication_insights_max_output_tokens(),
        DEFAULT_PUBLICATION_MIX_MAX_OUTPUT_TOKENS,
    )


PUBLICATION_PHASE_LABELS: tuple[str, ...] = (
    "Emerging",
    "Scaling",
    "Established",
    "Plateauing",
    "Contracting",
    "Rebuilding",
)
MONTH_SHORT_LABELS: tuple[str, ...] = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)
ARTICLE_TYPE_META_ANALYSIS_PATTERN = re.compile(
    r"\b(meta[-\s]?analysis|meta[-\s]?review|pooled analysis)\b", flags=re.IGNORECASE
)
ARTICLE_TYPE_SCOPING_PATTERN = re.compile(
    r"\b(scoping review|evidence map)\b", flags=re.IGNORECASE
)
ARTICLE_TYPE_SR_PATTERN = re.compile(
    r"\b(systematic review|umbrella review|rapid review)\b", flags=re.IGNORECASE
)
ARTICLE_TYPE_LITERATURE_PATTERN = re.compile(
    r"\b(literature review|narrative review|review article|review)\b",
    flags=re.IGNORECASE,
)
ARTICLE_TYPE_EDITORIAL_PATTERN = re.compile(
    r"\b(editorial|commentary|perspective|viewpoint|opinion)\b", flags=re.IGNORECASE
)
ARTICLE_TYPE_CASE_PATTERN = re.compile(
    r"\b(case report|case series)\b", flags=re.IGNORECASE
)
ARTICLE_TYPE_PROTOCOL_PATTERN = re.compile(
    r"\b(protocol|study protocol)\b", flags=re.IGNORECASE
)
ARTICLE_TYPE_LETTER_PATTERN = re.compile(
    r"\b(letter|correspondence)\b", flags=re.IGNORECASE
)
ARTICLE_TYPE_PUBLICATION_ONLY_KEYS = {
    "article",
    "journal-article",
    "journal-paper",
    "conference-abstract",
    "conference-paper",
    "conference-poster",
    "conference-presentation",
    "proceedings",
    "proceedings-article",
    "book",
    "book-chapter",
    "dataset",
    "data-set",
    "preprint",
    "pre-print",
    "posted-content",
    "dissertation",
    "other",
}
PUBLICATION_TYPE_LABEL_OVERRIDES: dict[str, str] = {
    "article": "Journal article",
    "journal-article": "Journal article",
    "journal-paper": "Journal article",
    "preprint": "Other",
    "pre-print": "Other",
    "posted-content": "Other",
    "conference-abstract": "Published abstract",
    "meeting-abstract": "Published abstract",
    "conference-paper": "Published abstract",
    "conference-poster": "Published abstract",
    "conference-presentation": "Published abstract",
    "proceedings-article": "Published abstract",
    "proceedings": "Published abstract",
    "review": "Review article",
    "review-article": "Review article",
    "book-chapter": "Book chapter",
    "book": "Book chapter",
    "dissertation": "Other",
    "dataset": "Dataset",
    "data-set": "Dataset",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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


def _extract_json_object(text: str) -> dict[str, Any]:
    clean = str(text or "").strip()
    if clean.startswith("```"):
        clean = re.sub(r"^```(?:json)?\s*", "", clean)
        clean = re.sub(r"\s*```$", "", clean)
    match = re.search(r"\{.*\}", clean, flags=re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in model output.")
    payload = json.loads(match.group(0))
    if not isinstance(payload, dict):
        raise ValueError("Model output is not a JSON object.")
    return payload


def _window_config(window_id: str) -> dict[str, str]:
    config = WINDOW_CONFIG.get(str(window_id or "").strip().lower())
    if config is None:
        raise PublicationInsightsAgentValidationError(
            "window_id must be one of: 1y, 3y, 5y, all."
        )
    return config


def _resolve_total_citations_tile(payload: dict[str, Any]) -> dict[str, Any]:
    tiles = payload.get("tiles")
    if not isinstance(tiles, list):
        raise PublicationMetricsNotFoundError("Publication metrics payload is unavailable.")
    for tile in tiles:
        if not isinstance(tile, dict):
            continue
        if str(tile.get("key") or "").strip() == "total_citations":
            return tile
    raise PublicationMetricsNotFoundError(
        "Total citations metric is unavailable for publication insights."
    )


def _resolve_tile_by_key(payload: dict[str, Any], key: str) -> dict[str, Any] | None:
    tiles = payload.get("tiles")
    if not isinstance(tiles, list):
        return None
    normalized_key = str(key or "").strip()
    for tile in tiles:
        if not isinstance(tile, dict):
            continue
        if str(tile.get("key") or "").strip() == normalized_key:
            return tile
    return None


def _sort_ranked_publications(
    publications: list[dict[str, Any]], *, field_name: str
) -> list[dict[str, Any]]:
    ranked: list[dict[str, Any]] = []
    for item in publications:
        if not isinstance(item, dict):
            continue
        value = max(0, int(_safe_int(item.get(field_name)) or 0))
        if value <= 0:
            continue
        row = dict(item)
        row["_window_citations"] = value
        ranked.append(row)
    ranked.sort(
        key=lambda item: (
            int(item.get("_window_citations") or 0),
            max(0, int(_safe_int(item.get("citations_lifetime")) or 0)),
            max(0, int(_safe_int(item.get("year")) or 0)),
            str(item.get("title") or "").lower(),
        ),
        reverse=True,
    )
    return ranked


def _classify_driver_pattern(
    *, concentration_pct: float, top_publication_share_pct: float
) -> str:
    driver_pattern = "broad"
    if concentration_pct >= 70.0:
        driver_pattern = "highly_concentrated"
    elif concentration_pct >= 50.0:
        driver_pattern = "concentrated"
    elif concentration_pct >= 35.0:
        driver_pattern = "mixed"
    if top_publication_share_pct >= 60.0:
        driver_pattern = "single_standout"
    elif top_publication_share_pct >= 45.0 and concentration_pct >= 50.0:
        driver_pattern = "lead_paper"
    return driver_pattern


def _build_driver_window_snapshot(
    publications: list[dict[str, Any]], *, window_id: str
) -> dict[str, Any]:
    window = _window_config(window_id)
    ranked = _sort_ranked_publications(publications, field_name=window["field"])
    top_publications = ranked[:3]
    total_window_citations = sum(int(item.get("_window_citations") or 0) for item in ranked)
    top_window_citations = sum(
        int(item.get("_window_citations") or 0) for item in top_publications
    )
    other_window_citations = max(0, total_window_citations - top_window_citations)
    concentration_pct = (
        round((float(top_window_citations) / float(total_window_citations)) * 100.0, 1)
        if total_window_citations > 0
        else 0.0
    )
    top_publication = top_publications[0] if top_publications else None
    top_publication_citations = (
        int(top_publication.get("_window_citations") or 0) if top_publication else 0
    )
    top_publication_share_pct = (
        round((float(top_publication_citations) / float(top_window_citations)) * 100.0, 1)
        if top_window_citations > 0 and top_publication_citations > 0
        else 0.0
    )
    driver_pattern = _classify_driver_pattern(
        concentration_pct=concentration_pct,
        top_publication_share_pct=top_publication_share_pct,
    )
    return {
        "window_id": window_id,
        "window_label": window["label"],
        "window_phrase": window["phrase"],
        "driver_publications_count": len(top_publications),
        "driver_citations": top_window_citations,
        "other_citations": other_window_citations,
        "window_citations_total": total_window_citations,
        "driver_share_pct": concentration_pct,
        "top_publication_citations": top_publication_citations,
        "top_publication_share_pct": top_publication_share_pct,
        "driver_pattern": driver_pattern,
        "top_publications": [
            {
                "work_id": str(item.get("work_id") or ""),
                "title": str(item.get("title") or "Untitled"),
                "year": _safe_int(item.get("year")),
                "citations": int(item.get("_window_citations") or 0),
            }
            for item in top_publications
        ],
    }


def _build_activation_snapshot(publications: list[dict[str, Any]]) -> dict[str, Any]:
    activated_publications = _sort_ranked_publications(
        publications, field_name=WINDOW_CONFIG["1y"]["field"]
    )
    newly_active_publications: list[dict[str, Any]] = []
    still_active_publications: list[dict[str, Any]] = []
    for item in activated_publications:
        prior_two_year_citations = max(
            0,
            int(_safe_int(item.get("citations_3y_rolling")) or 0)
            - int(item.get("_window_citations") or 0),
        )
        if prior_two_year_citations > 0:
            still_active_publications.append(item)
        else:
            newly_active_publications.append(item)
    return {
        "activation_publications": activated_publications,
        "newly_active_publications": newly_active_publications,
        "still_active_publications": still_active_publications,
    }


def _build_portfolio_context(metrics: dict[str, Any]) -> dict[str, Any]:
    total_publications_tile = _resolve_tile_by_key(metrics, "this_year_vs_last") or {}
    total_citations_tile = _resolve_tile_by_key(metrics, "total_citations") or {}
    momentum_tile = _resolve_tile_by_key(metrics, "momentum") or {}
    h_index_tile = _resolve_tile_by_key(metrics, "h_index_projection") or {}
    impact_tile = _resolve_tile_by_key(metrics, "impact_concentration") or {}
    field_tile = _resolve_tile_by_key(metrics, "field_percentile_share") or {}
    authorship_tile = _resolve_tile_by_key(metrics, "authorship_composition") or {}
    collaboration_tile = _resolve_tile_by_key(metrics, "collaboration_structure") or {}

    h_metadata = (
        h_index_tile.get("drilldown", {}).get("metadata", {}).get("intermediate_values", {})
        if isinstance(h_index_tile.get("drilldown"), dict)
        else {}
    )
    impact_metadata = (
        impact_tile.get("drilldown", {}).get("metadata", {}).get("intermediate_values", {})
        if isinstance(impact_tile.get("drilldown"), dict)
        else {}
    )
    field_chart = field_tile.get("chart_data") if isinstance(field_tile.get("chart_data"), dict) else {}
    authorship_chart = (
        authorship_tile.get("chart_data") if isinstance(authorship_tile.get("chart_data"), dict) else {}
    )
    collaboration_chart = (
        collaboration_tile.get("chart_data")
        if isinstance(collaboration_tile.get("chart_data"), dict)
        else {}
    )

    return {
        "total_publications": _safe_int(total_publications_tile.get("value")),
        "total_citations": _safe_int(total_citations_tile.get("value")),
        "citations_last_12_months": _safe_int(
            total_citations_tile.get("drilldown", {})
            .get("metadata", {})
            .get("intermediate_values", {})
            .get("citations_last_12_months")
            if isinstance(total_citations_tile.get("drilldown"), dict)
            else None
        ),
        "momentum_index": _safe_float(momentum_tile.get("value")),
        "momentum_state": str(momentum_tile.get("subtext") or "").strip() or None,
        "h_index": _safe_int(h_index_tile.get("value")),
        "projected_h_index": _safe_int(h_metadata.get("projected_h_index")),
        "h_core_share_total_citations_pct": _safe_float(
            h_metadata.get("h_core_share_total_citations_pct")
        ),
        "impact_concentration_pct": _safe_float(impact_metadata.get("concentration_pct")),
        "impact_concentration_classification": str(
            impact_metadata.get("classification") or impact_tile.get("subtext") or ""
        ).strip()
        or None,
        "portfolio_uncited_pct": _safe_float(impact_metadata.get("uncited_publications_pct")),
        "field_percentile_share_pct": _safe_float(field_tile.get("value")),
        "field_percentile_coverage_pct": _safe_float(field_chart.get("coverage_pct")),
        "leadership_index_pct": _safe_float(authorship_tile.get("value")),
        "repeat_collaborator_rate_pct": _safe_float(
            collaboration_chart.get("repeat_collaborator_rate_pct")
        ),
        "unique_collaborators": _safe_int(collaboration_chart.get("unique_collaborators")),
        "countries": _safe_int(collaboration_chart.get("countries")),
    }


def _sort_publication_library_records(
    publications: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    sorted_rows = [dict(item) for item in publications if isinstance(item, dict)]
    sorted_rows.sort(
        key=lambda item: (
            _resolve_publication_output_date(item) or date.min,
            _resolve_publication_output_year(item) or 0,
            str(item.get("title") or "").lower(),
        ),
        reverse=True,
    )
    return sorted_rows


def _serialize_publication_library_record(record: dict[str, Any]) -> dict[str, Any]:
    title = str(record.get("title") or "").strip() or "Untitled"
    row: dict[str, Any] = {
        "work_id": str(record.get("work_id") or ""),
        "title": title,
        "year": _resolve_publication_output_year(record),
        "publication_date": _format_publication_output_date_label(record),
        "article_type": _format_publication_article_type_label(record),
        "publication_type": _format_publication_type_label(record),
    }
    citations_lifetime = _safe_int(record.get("citations_lifetime"))
    if citations_lifetime is not None:
        row["citations_lifetime"] = citations_lifetime
    journal = str(
        record.get("journal")
        or record.get("journal_name")
        or record.get("venue")
        or record.get("source_title")
        or ""
    ).strip()
    if journal:
        row["journal"] = journal
    return row


def _build_publication_library_context(
    publications: list[dict[str, Any]], *, as_of_date: date | None
) -> dict[str, Any]:
    sorted_rows = _sort_publication_library_records(publications)
    serialized_rows = [
        _serialize_publication_library_record(record)
        for record in sorted_rows
    ]
    year_counts = Counter(
        _resolve_publication_output_year(record)
        for record in sorted_rows
        if _resolve_publication_output_year(record) is not None
    )
    article_type_counts = Counter(
        _format_publication_article_type_label(record)
        for record in sorted_rows
        if str(record.get("title") or "").strip() or str(record.get("article_type") or "").strip()
    )
    publication_type_counts = Counter(
        _format_publication_type_label(record)
        for record in sorted_rows
        if str(record.get("work_type") or record.get("publication_type") or record.get("type") or "").strip()
    )
    years = sorted(year_counts.keys())
    return {
        "total_records": len(serialized_rows),
        "first_publication_year": years[0] if years else None,
        "last_publication_year": years[-1] if years else None,
        "years_with_output": [
            {"year": int(year), "count": int(year_counts[year])}
            for year in years
        ],
        "article_type_counts": [
            {"label": str(label), "count": int(count)}
            for label, count in article_type_counts.most_common()
        ],
        "publication_type_counts": [
            {"label": str(label), "count": int(count)}
            for label, count in publication_type_counts.most_common()
        ],
        "records": serialized_rows,
        "as_of_date": as_of_date.isoformat() if isinstance(as_of_date, date) else None,
    }


def _compact_publication_library_for_section_prompt(
    publication_library: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(publication_library, dict):
        return {}

    years_with_output = publication_library.get("years_with_output")
    article_type_counts = publication_library.get("article_type_counts")
    publication_type_counts = publication_library.get("publication_type_counts")

    compact_payload: dict[str, Any] = {
        "total_records": max(0, int(publication_library.get("total_records") or 0)),
        "first_publication_year": _safe_int(
            publication_library.get("first_publication_year")
        ),
        "last_publication_year": _safe_int(
            publication_library.get("last_publication_year")
        ),
        "years_with_output": [
            {
                "year": max(0, int(item.get("year") or 0)),
                "count": max(0, int(item.get("count") or 0)),
            }
            for item in (years_with_output or [])
            if isinstance(item, dict) and _safe_int(item.get("year")) is not None
        ],
        "article_type_counts": [
            {
                "label": str(item.get("label") or "").strip(),
                "count": max(0, int(item.get("count") or 0)),
            }
            for item in (article_type_counts or [])
            if isinstance(item, dict) and str(item.get("label") or "").strip()
        ],
        "publication_type_counts": [
            {
                "label": str(item.get("label") or "").strip(),
                "count": max(0, int(item.get("count") or 0)),
            }
            for item in (publication_type_counts or [])
            if isinstance(item, dict) and str(item.get("label") or "").strip()
        ],
        "as_of_date": (
            str(publication_library.get("as_of_date") or "").strip() or None
        ),
    }
    return compact_payload


def _parse_iso_date(value: Any) -> date | None:
    token = str(value or "").strip()
    if not token:
        return None
    try:
        normalized = token.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized).date()
    except Exception:
        pass
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", token)
    if not match:
        return None
    year = _safe_int(match.group(1))
    month = _safe_int(match.group(2))
    day = _safe_int(match.group(3))
    if year is None or month is None or day is None:
        return None
    try:
        return date(int(year), int(month), int(day))
    except Exception:
        return None


def _resolve_publication_output_year(record: dict[str, Any]) -> int | None:
    raw_year = _safe_int(record.get("year"))
    if raw_year is not None and 1900 <= raw_year <= 3000:
        return raw_year
    publication_date = _parse_iso_date(record.get("publication_date"))
    if publication_date:
        return publication_date.year
    publication_month_start = _parse_iso_date(record.get("publication_month_start"))
    if publication_month_start:
        return publication_month_start.year
    month_start = str(record.get("publication_month_start") or "").strip()
    if re.match(r"^\d{4}-\d{2}$", month_start):
        year = _safe_int(month_start[:4])
        if year is not None and 1900 <= year <= 3000:
            return year
    return None


def _build_publication_output_year_series(tile: dict[str, Any]) -> dict[str, Any]:
    chart_data = tile.get("chart_data") if isinstance(tile.get("chart_data"), dict) else {}
    drilldown = tile.get("drilldown") if isinstance(tile.get("drilldown"), dict) else {}
    publications = [
        dict(item)
        for item in (drilldown.get("publications") or [])
        if isinstance(item, dict)
    ]
    year_counts: dict[int, int] = {}
    chart_years = chart_data.get("years") if isinstance(chart_data.get("years"), list) else []
    chart_values = chart_data.get("values") if isinstance(chart_data.get("values"), list) else []
    for index, raw_year in enumerate(chart_years):
        year = _safe_int(raw_year)
        value = _safe_int(chart_values[index]) if index < len(chart_values) else None
        if year is None or value is None or year < 1900 or year > 3000:
            continue
        year_counts[int(year)] = max(0, int(value))

    if not year_counts:
        for publication in publications:
            year = _resolve_publication_output_year(publication)
            if year is None:
                continue
            year_counts[year] = year_counts.get(year, 0) + 1

    as_of_date = _parse_iso_date(drilldown.get("as_of_date")) or _utcnow().date()
    projected_year = _safe_int(chart_data.get("projected_year")) or as_of_date.year
    current_year_ytd = _safe_int(chart_data.get("current_year_ytd"))
    if current_year_ytd is not None:
        year_counts[int(projected_year)] = max(0, int(current_year_ytd))

    current_year_is_partial = (
        projected_year == as_of_date.year
        and (as_of_date.month < 12 or as_of_date.day < 31)
    )
    scoped_counts = dict(year_counts)
    if current_year_is_partial:
        scoped_counts.pop(int(projected_year), None)

    positive_years = sorted(year for year, count in scoped_counts.items() if count > 0)
    if not positive_years:
        return {
            "years": [],
            "series": [],
            "year_counts": scoped_counts,
            "first_publication_year": None,
            "last_publication_year": None,
            "active_span": 0,
            "scoped_publications": 0,
            "includes_partial_year": bool(current_year_is_partial and year_counts.get(int(projected_year), 0) > 0),
            "partial_year": int(projected_year) if current_year_is_partial else None,
            "as_of_date": as_of_date,
            "publications": publications,
        }

    first_year = positive_years[0]
    last_year = positive_years[-1]
    years = list(range(first_year, last_year + 1))
    series = [max(0, int(scoped_counts.get(year, 0))) for year in years]
    return {
        "years": years,
        "series": series,
        "year_counts": scoped_counts,
        "first_publication_year": first_year,
        "last_publication_year": last_year,
        "active_span": len(years),
        "scoped_publications": sum(series),
        "includes_partial_year": bool(current_year_is_partial and year_counts.get(int(projected_year), 0) > 0),
        "partial_year": int(projected_year) if current_year_is_partial else None,
        "as_of_date": as_of_date,
        "publications": publications,
    }


def _calculate_publication_consistency_index(series: list[int]) -> float | None:
    if len(series) < 2:
        return None
    mean_value = sum(series) / len(series)
    if mean_value <= 1e-9:
        return 0.0
    variance = sum((value - mean_value) ** 2 for value in series) / len(series)
    coefficient_of_variation = math.sqrt(variance) / mean_value
    return max(0.0, min(1.0, 1.0 - coefficient_of_variation))


def _calculate_publication_burstiness_score(series: list[int]) -> float | None:
    if len(series) < 2:
        return None
    mean_value = sum(series) / len(series)
    if mean_value <= 1e-9:
        return 0.0
    variance = sum((value - mean_value) ** 2 for value in series) / len(series)
    coefficient_of_variation = math.sqrt(variance) / mean_value
    return max(0.0, min(1.0, coefficient_of_variation / (1.0 + coefficient_of_variation)))


def _calculate_publication_peak_year_share(series: list[int]) -> float | None:
    if not series:
        return None
    total = sum(series)
    if total <= 0:
        return None
    return max(0.0, min(1.0, max(series) / total))


def _calculate_publication_output_continuity(series: list[int]) -> float | None:
    if not series:
        return None
    years_with_output = sum(1 for value in series if value >= 1)
    return max(0.0, min(1.0, years_with_output / len(series)))


def _calculate_publication_longest_streak(series: list[int]) -> int:
    current_streak = 0
    longest_streak = 0
    for value in series:
        if value >= 1:
            current_streak += 1
            longest_streak = max(longest_streak, current_streak)
        else:
            current_streak = 0
    return longest_streak


def _calculate_publication_output_slope(years: list[int], series: list[int]) -> float | None:
    pair_count = min(len(years), len(series))
    if pair_count < 2:
        return None
    safe_years = [float(year) for year in years[:pair_count]]
    safe_values = [float(max(0, value)) for value in series[:pair_count]]
    mean_year = sum(safe_years) / pair_count
    mean_value = sum(safe_values) / pair_count
    denominator = sum((year - mean_year) ** 2 for year in safe_years)
    if denominator <= 1e-9:
        return 0.0
    numerator = sum(
        (safe_years[index] - mean_year) * (safe_values[index] - mean_value)
        for index in range(pair_count)
    )
    return numerator / denominator


def _mean_publication_series(series: list[int]) -> float | None:
    if not series:
        return None
    return sum(series) / len(series)


def _get_publication_consistency_label(value: float | None) -> str | None:
    if value is None:
        return None
    normalized = max(0.0, min(1.0, float(value)))
    if normalized >= 0.75:
        return "Very consistent"
    if normalized >= 0.55:
        return "Consistent"
    if normalized >= 0.35:
        return "Moderately variable"
    if normalized >= 0.2:
        return "Bursty"
    return "Highly bursty"


def _get_publication_burstiness_label(value: float | None) -> str | None:
    if value is None:
        return None
    normalized = max(0.0, min(1.0, float(value)))
    if normalized > 0.8:
        return "Highly bursty"
    if normalized > 0.6:
        return "Bursty"
    if normalized > 0.4:
        return "Moderately bursty"
    if normalized > 0.2:
        return "Moderately steady"
    return "Very steady"


def _get_publication_peak_year_share_label(value_pct: float | None) -> str | None:
    if value_pct is None:
        return None
    normalized = max(0.0, min(1.0, float(value_pct) / 100.0))
    if normalized < 0.12:
        return "Very distributed"
    if normalized < 0.2:
        return "Distributed"
    if normalized < 0.3:
        return "Moderately concentrated"
    if normalized < 0.4:
        return "Concentrated"
    return "Highly concentrated"


def _get_publication_output_continuity_label(value_pct: float | None) -> str | None:
    if value_pct is None:
        return None
    normalized = max(0.0, min(1.0, float(value_pct) / 100.0))
    if normalized >= 0.85:
        return "Continuous output"
    if normalized >= 0.7:
        return "Highly active"
    if normalized >= 0.5:
        return "Intermittent"
    if normalized >= 0.3:
        return "Episodic"
    return "Sporadic"


def _get_publication_production_phase_interpretation(phase: str | None) -> str:
    if phase == "Emerging":
        return "Early-stage publication portfolio beginning to grow."
    if phase == "Scaling":
        return "Publication output is increasing steadily."
    if phase == "Established":
        return "Publication output is stable across recent years."
    if phase == "Plateauing":
        return "Publication growth has levelled off recently."
    if phase == "Contracting":
        return "Publication output has declined from earlier levels."
    if phase == "Rebuilding":
        return "Publication activity is recovering after an earlier lull."
    return "At least two complete publication years are needed to estimate a production phase."


def _format_year_list(years: list[int]) -> str:
    clean_years = [int(year) for year in years]
    if not clean_years:
        return "no years"
    if len(clean_years) == 1:
        return str(clean_years[0])
    if len(clean_years) == 2:
        return f"{clean_years[0]} and {clean_years[1]}"
    return f"{', '.join(str(year) for year in clean_years[:-1])}, and {clean_years[-1]}"


def _format_publication_year_range(start_year: int | None, end_year: int | None) -> str | None:
    if start_year is None or end_year is None:
        return None
    if start_year == end_year:
        return str(start_year)
    return f"{start_year}-{end_year}"


def _format_publication_span_label(active_span: int) -> str:
    return f"{active_span}-year publication span"


def _shift_month_start(value: date, delta: int) -> date:
    month_index = (value.year * 12 + (value.month - 1)) + delta
    next_year = month_index // 12
    next_month = (month_index % 12) + 1
    return date(next_year, next_month, 1)


def _format_period_list(labels: list[str]) -> str:
    clean_labels = [str(label).strip() for label in labels if str(label).strip()]
    if not clean_labels:
        return "no periods"
    if len(clean_labels) == 1:
        return clean_labels[0]
    if len(clean_labels) == 2:
        return f"{clean_labels[0]} and {clean_labels[1]}"
    return f"{', '.join(clean_labels[:-1])}, and {clean_labels[-1]}"


def _format_insight_date(value: date | None) -> str | None:
    if value is None:
        return None
    month_label = MONTH_SHORT_LABELS[value.month - 1]
    return f"{value.day} {month_label} {value.year}"


def _format_insight_month_year(value: date | None) -> str | None:
    if value is None:
        return None
    month_label = MONTH_SHORT_LABELS[value.month - 1]
    return f"{month_label} {value.year}"


def _format_insight_month_window(start: date | None, end: date | None) -> str | None:
    start_label = _format_insight_month_year(start)
    end_label = _format_insight_month_year(end)
    if not start_label or not end_label:
        return None
    return start_label if start_label == end_label else f"{start_label}-{end_label}"


def _resolve_reference_month_start(as_of_date: date | None) -> date:
    reference = as_of_date or _utcnow().date()
    return date(reference.year, reference.month, 1)


def _build_trailing_month_starts(*, as_of_date: date | None, count: int) -> list[date]:
    if count <= 0:
        return []
    current_month_start = _resolve_reference_month_start(as_of_date)
    first_month = _shift_month_start(current_month_start, -count)
    return [_shift_month_start(first_month, index) for index in range(count)]


def _month_abbreviation_to_index(value: str | None) -> int | None:
    clean = str(value or "").strip().lower()
    if not clean:
        return None
    for index, label in enumerate(MONTH_SHORT_LABELS):
        if clean == label.lower():
            return index
    return None


def _resolve_publication_output_date(record: dict[str, Any]) -> date | None:
    publication_date = _parse_iso_date(record.get("publication_date"))
    if publication_date:
        return publication_date
    publication_month_start = _parse_iso_date(record.get("publication_month_start"))
    if publication_month_start:
        return publication_month_start
    month_start = str(record.get("publication_month_start") or "").strip()
    if re.match(r"^\d{4}-\d{2}$", month_start):
        year = _safe_int(month_start[:4])
        month = _safe_int(month_start[5:7])
        if year is not None and month is not None:
            try:
                return date(year, month, 1)
            except Exception:
                return None
    year = _resolve_publication_output_year(record)
    if year is None:
        return None
    try:
        return date(year, 1, 1)
    except Exception:
        return None


def _resolve_publication_output_date_precision(
    record: dict[str, Any],
) -> Literal["day", "month", "year"] | None:
    publication_date = _parse_iso_date(record.get("publication_date"))
    if publication_date:
        return "day"
    publication_month_start = _parse_iso_date(record.get("publication_month_start"))
    if publication_month_start:
        return "month"
    month_start = str(record.get("publication_month_start") or "").strip()
    if re.match(r"^\d{4}-\d{2}$", month_start):
        return "month"
    year = _resolve_publication_output_year(record)
    if year is not None:
        return "year"
    return None


def _format_publication_output_date_label(record: dict[str, Any]) -> str | None:
    publication_date = _parse_iso_date(record.get("publication_date"))
    if publication_date:
        return _format_insight_date(publication_date)
    publication_month_start = _parse_iso_date(record.get("publication_month_start"))
    if publication_month_start:
        return _format_insight_month_year(publication_month_start)
    month_start = str(record.get("publication_month_start") or "").strip()
    if re.match(r"^\d{4}-\d{2}$", month_start):
        year = _safe_int(month_start[:4])
        month = _safe_int(month_start[5:7])
        if year is not None and month is not None:
            try:
                return _format_insight_month_year(date(year, month, 1))
            except Exception:
                return None
    year = _resolve_publication_output_year(record)
    return str(year) if year is not None else None


def _build_publication_volume_recent_monthly_summary(
    chart_data: dict[str, Any], *, as_of_date: date | None
) -> dict[str, Any]:
    raw_values = [
        max(0, int(round(_safe_float(value) or 0.0)))
        for value in (chart_data.get("monthly_values_12m") or [])
    ]
    raw_labels = [str(value or "").strip() for value in (chart_data.get("month_labels_12m") or [])]
    current_month_start = _resolve_reference_month_start(as_of_date)
    current_month_index = current_month_start.month - 1
    source_last_month_index = (
        _month_abbreviation_to_index(raw_labels[-1]) if raw_labels else None
    )
    source_likely_includes_current_month = (
        source_last_month_index is not None
        and source_last_month_index == current_month_index
    )
    source_values_window = (
        raw_values[-13:-1]
        if len(raw_values) >= 13 and source_likely_includes_current_month
        else raw_values[-12:]
    )
    values = (
        source_values_window[-12:]
        if len(source_values_window) >= 12
        else ([0] * max(0, 12 - len(source_values_window))) + source_values_window
    )
    month_starts = _build_trailing_month_starts(as_of_date=as_of_date, count=12)
    points = [
        {
            "month_start": month_starts[index],
            "label": _format_insight_month_year(month_starts[index]),
            "count": int(values[index]) if index < len(values) else 0,
        }
        for index in range(min(len(month_starts), len(values)))
    ]
    peak_count = max((int(point["count"]) for point in points), default=0)
    peak_periods = [
        str(point["label"])
        for point in points
        if int(point["count"]) == peak_count and peak_count > 0
    ]
    period_label = (
        _format_insight_month_window(month_starts[0], month_starts[-1])
        if month_starts
        else None
    )
    end_month = month_starts[-1] if month_starts else None
    end_of_period = (
        _shift_month_start(end_month, 1) - timedelta(days=1)
        if isinstance(end_month, date)
        else None
    )
    return {
        "period_label": period_label,
        "period_end_label": _format_insight_date(end_of_period),
        "points": points,
        "total": sum(int(point["count"]) for point in points),
        "active_months": sum(1 for point in points if int(point["count"]) > 0),
        "peak_count": peak_count if peak_count > 0 else None,
        "peak_periods": peak_periods[:3],
    }


def _build_publication_volume_lifetime_monthly_points(
    chart_data: dict[str, Any], *, as_of_date: date | None
) -> list[dict[str, Any]]:
    raw_values = [
        max(0, int(round(_safe_float(value) or 0.0)))
        for value in (chart_data.get("monthly_values_lifetime") or [])
    ]
    raw_labels = [str(value or "").strip() for value in (chart_data.get("month_labels_lifetime") or [])]
    if not raw_values:
        return []
    fallback_start = _parse_iso_date(chart_data.get("lifetime_month_start"))
    points: list[dict[str, Any]] = []
    for index, value in enumerate(raw_values):
        month_start = _parse_iso_date(raw_labels[index]) if index < len(raw_labels) else None
        if month_start is None and fallback_start is not None:
            month_start = _shift_month_start(fallback_start, index)
        if month_start is None:
            continue
        points.append(
            {
                "month_start": month_start,
                "label": _format_insight_month_year(month_start),
                "count": int(value),
            }
        )
    return points


def _build_publication_volume_rolling_window_summary(
    lifetime_points: list[dict[str, Any]], *, years: int
) -> dict[str, Any]:
    month_count = max(0, years * 12)
    source_points = lifetime_points[-month_count:] if month_count > 0 else []
    if not source_points:
        return {
            "period_label": None,
            "blocks": [],
            "latest_count": None,
            "earliest_count": None,
            "direction": "flat",
        }
    blocks: list[dict[str, Any]] = []
    for index in range(0, len(source_points), 12):
        chunk = source_points[index : index + 12]
        if not chunk:
            continue
        start_month = chunk[0].get("month_start")
        end_month = chunk[-1].get("month_start")
        label = _format_insight_month_window(
            start_month if isinstance(start_month, date) else None,
            end_month if isinstance(end_month, date) else None,
        )
        blocks.append(
            {
                "label": label,
                "count": sum(max(0, int(item.get("count") or 0)) for item in chunk),
            }
        )
    earliest_count = int(blocks[0]["count"]) if blocks else None
    latest_count = int(blocks[-1]["count"]) if blocks else None
    direction = "flat"
    if earliest_count is not None and latest_count is not None:
        if latest_count > earliest_count:
            direction = "up"
        elif latest_count < earliest_count:
            direction = "down"
    start_month = source_points[0].get("month_start")
    end_month = source_points[-1].get("month_start")
    return {
        "period_label": _format_insight_month_window(
            start_month if isinstance(start_month, date) else None,
            end_month if isinstance(end_month, date) else None,
        ),
        "blocks": blocks,
        "latest_count": latest_count,
        "earliest_count": earliest_count,
        "direction": direction,
    }


def _annualize_publication_monthly_counts(values: list[int]) -> float | None:
    safe_values = [max(0, int(value)) for value in values]
    if not safe_values:
        return None
    return round((sum(safe_values) / float(len(safe_values))) * 12.0, 1)


def _format_publication_rolling_period_label(month_count: int, *, prefix: str) -> str | None:
    safe_month_count = max(0, int(month_count))
    if safe_month_count <= 0:
        return None
    if safe_month_count % 12 == 0:
        year_count = safe_month_count // 12
        return f"{prefix}{year_count} year" + ("" if year_count == 1 else "s")
    if safe_month_count < 12:
        return f"{prefix}{safe_month_count} month" + ("" if safe_month_count == 1 else "s")
    year_label = f"{safe_month_count / 12.0:.1f}".rstrip("0").rstrip(".")
    return f"{prefix}{year_label} years"


def _build_publication_production_phase_rolling_pace_summary(
    chart_data: dict[str, Any],
    *,
    as_of_date: date | None,
    recent_window_years: int,
) -> dict[str, Any]:
    empty_state = {
        "rolling_cutoff_label": None,
        "rolling_one_year_total": None,
        "rolling_one_year_pace": None,
        "rolling_one_year_window_months": 0,
        "rolling_three_year_pace": None,
        "rolling_three_year_window_months": 0,
        "rolling_prior_period_pace": None,
        "rolling_prior_period_months": 0,
        "rolling_prior_period_years": None,
        "rolling_prior_period_label": None,
    }
    safe_as_of_date = as_of_date or _utcnow().date()
    current_month_start = _resolve_reference_month_start(safe_as_of_date)
    lifetime_points = _build_publication_volume_lifetime_monthly_points(
        chart_data,
        as_of_date=safe_as_of_date,
    )
    complete_points = [
        point
        for point in lifetime_points
        if isinstance(point, dict)
        and isinstance(point.get("month_start"), date)
        and point["month_start"] < current_month_start
    ]
    if not complete_points:
        return empty_state

    rolling_one_year_window_months = min(12, len(complete_points))
    target_recent_window_years = max(1, int(recent_window_years or 0))
    rolling_three_year_window_months = min(
        max(12, target_recent_window_years * 12),
        len(complete_points),
    )

    rolling_one_year_points = complete_points[-rolling_one_year_window_months:]
    rolling_three_year_points = complete_points[-rolling_three_year_window_months:]
    prior_points = complete_points[:-rolling_three_year_window_months]
    last_complete_month = complete_points[-1].get("month_start")

    rolling_one_year_counts = [
        max(0, int(point.get("count") or 0)) for point in rolling_one_year_points
    ]
    rolling_three_year_counts = [
        max(0, int(point.get("count") or 0)) for point in rolling_three_year_points
    ]
    prior_counts = [max(0, int(point.get("count") or 0)) for point in prior_points]
    prior_period_months = len(prior_counts)

    return {
        "rolling_cutoff_label": (
            _format_insight_month_year(last_complete_month)
            if isinstance(last_complete_month, date)
            else None
        ),
        "rolling_one_year_total": sum(rolling_one_year_counts)
        if rolling_one_year_counts
        else None,
        "rolling_one_year_pace": _annualize_publication_monthly_counts(
            rolling_one_year_counts
        ),
        "rolling_one_year_window_months": rolling_one_year_window_months,
        "rolling_three_year_pace": _annualize_publication_monthly_counts(
            rolling_three_year_counts
        ),
        "rolling_three_year_window_months": rolling_three_year_window_months,
        "rolling_prior_period_pace": _annualize_publication_monthly_counts(prior_counts),
        "rolling_prior_period_months": prior_period_months,
        "rolling_prior_period_years": (
            round(prior_period_months / 12.0, 1) if prior_period_months > 0 else None
        ),
        "rolling_prior_period_label": _format_publication_rolling_period_label(
            prior_period_months,
            prefix="Prior ",
        ),
    }


def _build_publication_volume_table_summary(
    publications: list[dict[str, Any]], *, as_of_date: date | None
) -> dict[str, Any]:
    dated_rows: list[dict[str, Any]] = []
    for raw_record in publications:
        if not isinstance(raw_record, dict):
            continue
        publication_date = _resolve_publication_output_date(raw_record)
        if publication_date is None:
            continue
        title = str(raw_record.get("title") or "").strip()
        article_type = (
            str(raw_record.get("article_type") or raw_record.get("work_type") or "")
            .strip()
        )
        date_precision = _resolve_publication_output_date_precision(raw_record)
        date_label = _format_publication_output_date_label(raw_record)
        dated_rows.append(
            {
                "publication_date": publication_date,
                "title": title,
                "article_type": article_type,
                "date_precision": date_precision,
                "date_label": date_label,
            }
        )
    dated_rows.sort(
        key=lambda item: (
            item["publication_date"],
            str(item.get("title") or "").lower(),
        ),
        reverse=True,
    )
    current_month_start = _resolve_reference_month_start(as_of_date)
    windows = {
        "1y": _shift_month_start(current_month_start, -12),
        "3y": _shift_month_start(current_month_start, -36),
        "5y": _shift_month_start(current_month_start, -60),
    }
    counts_by_window = {
        "all": len(dated_rows),
        **{
            key: sum(
                1
                for row in dated_rows
                if start_date <= row["publication_date"] < current_month_start
            )
            for key, start_date in windows.items()
        },
    }
    recent_rows = [
        row
        for row in dated_rows
        if windows["1y"] <= row["publication_date"] < current_month_start
    ]
    recent_oldest = recent_rows[-1]["publication_date"] if recent_rows else None
    recent_newest = recent_rows[0]["publication_date"] if recent_rows else None
    recent_oldest_label = str(recent_rows[-1].get("date_label") or "").strip() if recent_rows else None
    recent_newest_label = str(recent_rows[0].get("date_label") or "").strip() if recent_rows else None
    recent_range_label = (
        f"{recent_oldest_label} to {recent_newest_label}"
        if recent_oldest_label and recent_newest_label
        else None
    )
    recent_titles = [
        str(row.get("title") or "").strip()
        for row in recent_rows[:3]
        if str(row.get("title") or "").strip()
    ]
    recent_article_types = [
        article_type
        for article_type, _count in Counter(
            str(row.get("article_type") or "").strip()
            for row in recent_rows
            if str(row.get("article_type") or "").strip()
        ).most_common(3)
    ]
    recent_precision_counts = {
        precision: count
        for precision, count in Counter(
            str(row.get("date_precision") or "").strip()
            for row in recent_rows
            if str(row.get("date_precision") or "").strip()
        ).items()
    }
    return {
        "counts_by_window": counts_by_window,
        "recent_rows": recent_rows,
        "recent_range_label": recent_range_label,
        "recent_titles": recent_titles,
        "recent_article_types": recent_article_types,
        "recent_precision_counts": recent_precision_counts,
        "most_recent_date": recent_newest_label or _format_insight_date(recent_newest if isinstance(recent_newest, date) else None),
        "most_recent_title": recent_titles[0] if recent_titles else None,
    }


def _normalize_publication_category_key(value: Any) -> str:
    return re.sub(
        r"^-+|-+$",
        "",
        re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()),
    )


def _to_sentence_case_label(value: Any) -> str:
    clean = re.sub(r"\s+", " ", re.sub(r"[-_/]+", " ", str(value or "").strip())).lower()
    if not clean:
        return "Unspecified"
    return clean[0].upper() + clean[1:]


def _infer_article_type_from_text(value: Any) -> str:
    clean = str(value or "").strip()
    if not clean:
        return "Original research"
    if ARTICLE_TYPE_META_ANALYSIS_PATTERN.search(clean):
        return "Systematic review"
    if ARTICLE_TYPE_SCOPING_PATTERN.search(clean):
        return "Systematic review"
    if ARTICLE_TYPE_SR_PATTERN.search(clean):
        return "Systematic review"
    if ARTICLE_TYPE_LITERATURE_PATTERN.search(clean):
        return "Literature review"
    if ARTICLE_TYPE_EDITORIAL_PATTERN.search(clean):
        return "Editorial"
    if ARTICLE_TYPE_CASE_PATTERN.search(clean):
        return "Case report"
    if ARTICLE_TYPE_PROTOCOL_PATTERN.search(clean):
        return "Protocol"
    if ARTICLE_TYPE_LETTER_PATTERN.search(clean):
        return "Letter"
    return "Original research"


def _format_publication_article_type_label(record: dict[str, Any]) -> str:
    article_type_value = record.get("article_type")
    publication_type_value = record.get("work_type") or record.get("publication_type")
    article_key = _normalize_publication_category_key(article_type_value)
    if not article_key:
        return _infer_article_type_from_text(record.get("title"))
    if article_key in {
        "sr",
        "systematic-review",
        "meta-analysis",
        "meta-review",
        "umbrella-review",
        "rapid-review",
        "scoping",
        "scoping-review",
        "evidence-map",
    }:
        return "Systematic review"
    if article_key in {"literature-review", "narrative-review"}:
        return "Literature review"
    if article_key in {
        "original",
        "original-article",
        "original-research",
        "research-article",
    }:
        return "Original research"
    if article_key in {"editorial", "commentary", "perspective", "opinion"}:
        return "Editorial"
    if article_key in {"case-report", "case-series"}:
        return "Case report"
    if article_key in {"protocol", "study-protocol"}:
        return "Protocol"
    if article_key in {"letter", "correspondence"}:
        return "Letter"
    publication_key = _normalize_publication_category_key(publication_type_value)
    if (
        article_key in ARTICLE_TYPE_PUBLICATION_ONLY_KEYS
        or publication_key in ARTICLE_TYPE_PUBLICATION_ONLY_KEYS
    ):
        return _infer_article_type_from_text(record.get("title"))
    return _to_sentence_case_label(article_type_value)


def _format_publication_type_label(record: dict[str, Any]) -> str:
    publication_type_value = (
        record.get("work_type") or record.get("publication_type") or record.get("type")
    )
    publication_key = _normalize_publication_category_key(publication_type_value)
    if not publication_key:
        return "Unspecified"
    return PUBLICATION_TYPE_LABEL_OVERRIDES.get(publication_key) or _to_sentence_case_label(
        publication_type_value
    )


def _build_publication_article_type_window_summary(
    *,
    publications: list[dict[str, Any]],
    full_years: list[int],
    window_id: Literal["1y", "3y", "5y", "all"],
) -> dict[str, Any] | None:
    if not full_years:
        return None
    window_size = {
        "1y": 1,
        "3y": 3,
        "5y": 5,
        "all": None,
    }[window_id]
    window_years = full_years if window_size is None else full_years[-window_size:]
    if not window_years:
        return None
    year_set = set(window_years)
    counts: Counter[str] = Counter()
    for raw_record in publications:
        if not isinstance(raw_record, dict):
            continue
        year = _safe_int(raw_record.get("year"))
        if year is None or year not in year_set:
            continue
        counts[_format_publication_article_type_label(raw_record)] += 1
    sorted_entries = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    total_count = sum(max(0, count) for _label, count in sorted_entries)
    top_count = max((count for _label, count in sorted_entries), default=0)
    top_labels = [
        label for label, count in sorted_entries if top_count > 0 and count == top_count
    ]
    second_entry = next(
        (item for item in sorted_entries if item[1] < top_count),
        None,
    )
    return {
        "window_id": window_id,
        "range_label": (
            str(window_years[0])
            if window_years[0] == window_years[-1]
            else f"{window_years[0]}-{window_years[-1]}"
        ),
        "total_count": total_count,
        "distinct_type_count": len(sorted_entries),
        "top_labels": top_labels,
        "top_count": top_count,
        "top_share_pct": (
            (float(top_count) / float(total_count)) * 100.0
            if total_count > 0 and top_count > 0
            else None
        ),
        "second_label": second_entry[0] if second_entry else None,
        "second_share_pct": (
            (float(second_entry[1]) / float(total_count)) * 100.0
            if total_count > 0 and second_entry is not None
            else None
        ),
        "ordered_labels": [label for label, _count in sorted_entries[:4]],
    }


def _build_publication_type_window_summary(
    *,
    publications: list[dict[str, Any]],
    full_years: list[int],
    window_id: Literal["1y", "3y", "5y", "all"],
) -> dict[str, Any] | None:
    if not full_years:
        return None
    window_size = {
        "1y": 1,
        "3y": 3,
        "5y": 5,
        "all": None,
    }[window_id]
    window_years = full_years if window_size is None else full_years[-window_size:]
    if not window_years:
        return None
    year_set = set(window_years)
    counts: Counter[str] = Counter()
    for raw_record in publications:
        if not isinstance(raw_record, dict):
            continue
        year = _safe_int(raw_record.get("year"))
        if year is None or year not in year_set:
            continue
        counts[_format_publication_type_label(raw_record)] += 1
    sorted_entries = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    total_count = sum(max(0, count) for _label, count in sorted_entries)
    top_count = max((count for _label, count in sorted_entries), default=0)
    top_labels = [
        label for label, count in sorted_entries if top_count > 0 and count == top_count
    ]
    second_entry = next(
        (item for item in sorted_entries if item[1] < top_count),
        None,
    )
    return {
        "window_id": window_id,
        "range_label": (
            str(window_years[0])
            if window_years[0] == window_years[-1]
            else f"{window_years[0]}-{window_years[-1]}"
        ),
        "total_count": total_count,
        "distinct_type_count": len(sorted_entries),
        "top_labels": top_labels,
        "top_count": top_count,
        "top_share_pct": (
            (float(top_count) / float(total_count)) * 100.0
            if total_count > 0 and top_count > 0
            else None
        ),
        "second_label": second_entry[0] if second_entry else None,
        "second_share_pct": (
            (float(second_entry[1]) / float(total_count)) * 100.0
            if total_count > 0 and second_entry is not None
            else None
        ),
        "ordered_labels": [label for label, _count in sorted_entries[:4]],
    }


def _same_article_type_leader_set(
    left: dict[str, Any] | None, right: dict[str, Any] | None
) -> bool:
    if not isinstance(left, dict) or not isinstance(right, dict):
        return True
    left_labels = sorted(
        {
            str(label).strip()
            for label in (left.get("top_labels") or [])
            if str(label).strip()
        }
    )
    right_labels = sorted(
        {
            str(label).strip()
            for label in (right.get("top_labels") or [])
            if str(label).strip()
        }
    )
    return left_labels == right_labels


def _build_recent_publication_window_summary(
    years: list[int], series: list[int], scoped_publications: int
) -> dict[str, Any]:
    usable_years = min(len(years), len(series))
    if usable_years <= 0:
        return {
            "window_size": 0,
            "recent_years": [],
            "earlier_years": [],
            "recent_mean": None,
            "earlier_mean": None,
            "momentum": None,
            "recent_share_pct": None,
            "recent_output_count": 0,
            "earlier_output_count": 0,
            "recent_trend_slope": None,
            "latest_year": None,
            "latest_output_count": None,
            "historical_gap_years_present": False,
        }

    safe_years = years[:usable_years]
    safe_series = [max(0, int(value)) for value in series[:usable_years]]
    recent_window_size = max(1, min(3, usable_years))
    recent_series = safe_series[-recent_window_size:]
    recent_years = safe_years[-recent_window_size:]
    earlier_series = safe_series[:-recent_window_size] if usable_years > recent_window_size else []
    earlier_years = safe_years[:-recent_window_size] if usable_years > recent_window_size else []
    recent_mean = _mean_publication_series(recent_series)
    earlier_mean = _mean_publication_series(earlier_series) if earlier_series else 0.0
    momentum = (
        (recent_mean - earlier_mean)
        if recent_mean is not None and earlier_mean is not None
        else None
    )
    recent_output_count = sum(recent_series)
    earlier_output_count = sum(earlier_series)
    recent_trend_slope = (
        _calculate_publication_output_slope(recent_years, recent_series)
        if len(recent_years) >= 2
        else None
    )
    latest_year = safe_years[-1] if safe_years else None
    latest_output_count = safe_series[-1] if safe_series else None
    recent_share_pct = (
        round((float(recent_output_count) / float(scoped_publications)) * 100.0, 1)
        if scoped_publications > 0
        else None
    )
    historical_gap_years_present = any(value <= 0 for value in earlier_series)
    return {
        "window_size": recent_window_size,
        "recent_years": recent_years,
        "earlier_years": earlier_years,
        "recent_mean": recent_mean,
        "earlier_mean": earlier_mean,
        "momentum": momentum,
        "recent_share_pct": recent_share_pct,
        "recent_output_count": recent_output_count,
        "earlier_output_count": earlier_output_count,
        "recent_trend_slope": recent_trend_slope,
        "latest_year": latest_year,
        "latest_output_count": latest_output_count,
        "historical_gap_years_present": historical_gap_years_present,
    }


def _build_publication_production_current_pace_summary(
    chart_data: dict[str, Any],
    *,
    as_of_date: date | None,
    comparison_years: list[int],
) -> dict[str, Any]:
    safe_as_of_date = as_of_date or _utcnow().date()
    if safe_as_of_date.month <= 1:
        return {
            "current_pace_year": None,
            "current_pace_cutoff_label": None,
            "current_pace_count": None,
            "current_pace_comparison_years": [],
            "current_pace_comparison_label": None,
            "current_pace_comparison_mean": None,
            "current_pace_comparison_delta": None,
            "current_pace_signal": None,
        }

    current_year = int(safe_as_of_date.year)
    normalized_comparison_years = [
        int(year)
        for year in comparison_years
        if _safe_int(year) is not None and int(year) < current_year
    ]
    latest_comparison_year = (
        max(normalized_comparison_years) if normalized_comparison_years else None
    )
    if latest_comparison_year is not None and current_year <= latest_comparison_year:
        return {
            "current_pace_year": None,
            "current_pace_cutoff_label": None,
            "current_pace_count": None,
            "current_pace_comparison_years": [],
            "current_pace_comparison_label": None,
            "current_pace_comparison_mean": None,
            "current_pace_comparison_delta": None,
            "current_pace_signal": None,
        }

    lifetime_points = _build_publication_volume_lifetime_monthly_points(
        chart_data, as_of_date=safe_as_of_date
    )
    if not lifetime_points:
        return {
            "current_pace_year": None,
            "current_pace_cutoff_label": None,
            "current_pace_count": None,
            "current_pace_comparison_years": [],
            "current_pace_comparison_label": None,
            "current_pace_comparison_mean": None,
            "current_pace_comparison_delta": None,
            "current_pace_signal": None,
        }

    cutoff_month = safe_as_of_date.month - 1
    counts_by_year: dict[int, int] = {}
    for point in lifetime_points:
        month_start = point.get("month_start")
        if not isinstance(month_start, date) or month_start.month > cutoff_month:
            continue
        point_year = int(month_start.year)
        counts_by_year[point_year] = counts_by_year.get(point_year, 0) + max(
            0, int(point.get("count") or 0)
        )

    if current_year not in counts_by_year:
        return {
            "current_pace_year": None,
            "current_pace_cutoff_label": None,
            "current_pace_count": None,
            "current_pace_comparison_years": [],
            "current_pace_comparison_label": None,
            "current_pace_comparison_mean": None,
            "current_pace_comparison_delta": None,
            "current_pace_signal": None,
        }

    current_pace_count = max(0, int(counts_by_year.get(current_year) or 0))
    comparison_values = [
        max(0, int(counts_by_year.get(year, 0))) for year in normalized_comparison_years
    ]
    comparison_mean = (
        round(sum(comparison_values) / len(comparison_values), 1)
        if comparison_values
        else None
    )
    comparison_delta = (
        round(float(current_pace_count) - float(comparison_mean), 1)
        if comparison_mean is not None
        else None
    )
    comparison_signal = (
        "ahead"
        if comparison_delta is not None and comparison_delta > 0.75
        else "behind"
        if comparison_delta is not None and comparison_delta < -0.75
        else "in_line"
        if comparison_delta is not None
        else None
    )
    comparison_label = (
        _format_publication_year_range(
            normalized_comparison_years[0], normalized_comparison_years[-1]
        )
        if normalized_comparison_years
        else None
    )
    return {
        "current_pace_year": current_year,
        "current_pace_cutoff_label": _format_insight_month_year(
            date(current_year, cutoff_month, 1)
        ),
        "current_pace_count": current_pace_count,
        "current_pace_comparison_years": normalized_comparison_years,
        "current_pace_comparison_label": comparison_label,
        "current_pace_comparison_mean": comparison_mean,
        "current_pace_comparison_delta": comparison_delta,
        "current_pace_signal": comparison_signal,
    }


def _build_publication_production_high_run_summary(
    *,
    years: list[int],
    series: list[int],
    peak_years: list[int],
    average_per_active_year: float | None,
    earlier_mean: float | None,
) -> dict[str, Any]:
    if not years or not series or not peak_years:
        return {
            "high_run_years": [],
            "high_run_label": None,
            "high_run_min_count": None,
            "high_run_max_count": None,
            "high_run_mean": None,
            "high_run_threshold": None,
            "last_peak_year": None,
            "years_since_last_peak": None,
            "post_peak_complete_years": 0,
            "latest_gap_from_high_run_mean": None,
        }

    safe_peak_years = [int(year) for year in peak_years if year in years]
    if not safe_peak_years:
        return {
            "high_run_years": [],
            "high_run_label": None,
            "high_run_min_count": None,
            "high_run_max_count": None,
            "high_run_mean": None,
            "high_run_threshold": None,
            "last_peak_year": None,
            "years_since_last_peak": None,
            "post_peak_complete_years": 0,
            "latest_gap_from_high_run_mean": None,
        }

    peak_count = max(series)
    threshold_candidates = [1]
    if peak_count > 0:
        threshold_candidates.append(max(1, int(math.floor(float(peak_count) * 0.55))))
    if average_per_active_year is not None and average_per_active_year > 0:
        threshold_candidates.append(max(1, int(round(float(average_per_active_year)))))
    if earlier_mean is not None and earlier_mean > 0:
        threshold_candidates.append(max(1, int(round(float(earlier_mean)))))
    threshold = max(threshold_candidates)

    last_peak_year = max(safe_peak_years)
    last_peak_index = max(
        index for index, year in enumerate(years) if int(year) == last_peak_year
    )
    start_index = last_peak_index
    while start_index - 1 >= 0 and int(series[start_index - 1]) >= threshold:
        start_index -= 1
    end_index = last_peak_index
    while end_index + 1 < len(series) and int(series[end_index + 1]) >= threshold:
        end_index += 1

    high_run_years = [int(year) for year in years[start_index : end_index + 1]]
    high_run_counts = [max(0, int(value)) for value in series[start_index : end_index + 1]]
    latest_year = int(years[-1]) if years else None
    latest_count = max(0, int(series[-1])) if series else None
    high_run_mean = (
        round(sum(high_run_counts) / float(len(high_run_counts)), 1)
        if high_run_counts
        else None
    )
    latest_gap_from_high_run_mean = (
        round(float(high_run_mean) - float(latest_count), 1)
        if high_run_mean is not None and latest_count is not None
        else None
    )
    post_peak_complete_years = (
        max(0, latest_year - last_peak_year)
        if latest_year is not None
        else 0
    )

    return {
        "high_run_years": high_run_years,
        "high_run_label": _format_publication_year_range(
            high_run_years[0] if high_run_years else None,
            high_run_years[-1] if high_run_years else None,
        ),
        "high_run_min_count": min(high_run_counts) if high_run_counts else None,
        "high_run_max_count": max(high_run_counts) if high_run_counts else None,
        "high_run_mean": high_run_mean,
        "high_run_threshold": threshold,
        "last_peak_year": last_peak_year,
        "years_since_last_peak": (
            max(0, latest_year - last_peak_year)
            if latest_year is not None
            else None
        ),
        "post_peak_complete_years": post_peak_complete_years,
        "latest_gap_from_high_run_mean": latest_gap_from_high_run_mean,
    }


def _normalize_publication_generated_text(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip())


def _validate_generated_text_contract(
    *,
    text: Any,
    section_key: str,
    field_name: str,
    require_sentence_end: bool = False,
    allow_empty: bool = False,
) -> str:
    clean = _normalize_publication_generated_text(text)
    if not clean:
        if allow_empty:
            return ""
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned an empty {field_name} for {section_key}."
        )
    if require_sentence_end and clean[-1] not in ".!?":
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned an unfinished {field_name} for {section_key}."
        )
    return clean


def _validate_generated_note_label(*, label: Any, section_key: str) -> str:
    clean = _normalize_publication_generated_text(label)
    if not clean:
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned an empty consideration_label for {section_key}."
        )
    return clean


def _classify_publication_production_phase(
    *,
    years: list[int],
    series: list[int],
    active_span: int,
    total_publications: int,
    scoped_publications: int,
) -> dict[str, Any]:
    usable_years = min(len(years), len(series))
    if usable_years <= 1:
        return {
            "phase": None,
            "phase_label": "Insufficient history",
            "phase_interpretation": _get_publication_production_phase_interpretation(None),
            "confidence_low": True,
            "confidence_note": "Phase estimate has lower confidence due to limited publication history.",
            "insufficient_history": True,
            "recent_mean": None,
            "baseline_mean": None,
            "momentum": None,
            "recent_share_pct": None,
            "recent_output_count": 0,
            "earlier_output_count": 0,
            "recent_years": [],
            "earlier_years": [],
            "recent_window_size": 0,
            "recent_trend_slope": None,
            "latest_year": None,
            "latest_output_count": None,
            "latest_vs_peak_ratio": None,
            "historical_gap_years_present": False,
            "peak_year": None,
            "peak_count": None,
            "career_length": active_span,
        }

    safe_years = years[:usable_years]
    safe_series = [max(0, int(value)) for value in series[:usable_years]]
    slope = _calculate_publication_output_slope(safe_years, safe_series)
    recent_summary = _build_recent_publication_window_summary(
        safe_years, safe_series, scoped_publications
    )
    recent_mean = recent_summary["recent_mean"]
    baseline_mean = recent_summary["earlier_mean"]
    momentum = recent_summary["momentum"]
    recent_share_pct = recent_summary["recent_share_pct"]
    historical_gap_years_present = bool(
        recent_summary["historical_gap_years_present"]
    )
    peak_count = max(safe_series) if safe_series else None
    peak_years = (
        [safe_years[index] for index, value in enumerate(safe_series) if value == peak_count]
        if peak_count is not None
        else []
    )
    peak_year = peak_years[0] if peak_years else None
    recent_trend_slope = recent_summary["recent_trend_slope"]
    latest_year = recent_summary["latest_year"]
    latest_output_count = recent_summary["latest_output_count"]
    latest_vs_peak_ratio = (
        round(float(latest_output_count) / float(peak_count), 2)
        if latest_output_count is not None and peak_count is not None and peak_count > 0
        else None
    )
    recent_cooling = (
        recent_trend_slope is not None and float(recent_trend_slope) < -0.75
    )
    recent_peak_fade = (
        any(year in recent_summary["recent_years"] for year in peak_years)
        and latest_vs_peak_ratio is not None
        and latest_vs_peak_ratio < 0.6
        and latest_year is not None
        and latest_year not in peak_years
    )
    career_length = active_span
    confidence_low = total_publications < 10 or active_span < 4 or usable_years < 4
    confidence_note = (
        "Phase estimate has lower confidence due to limited publication history."
        if confidence_low
        else None
    )

    safe_slope = slope or 0.0
    safe_momentum = momentum or 0.0
    safe_recent_share = (recent_share_pct or 0.0) / 100.0
    safe_recent_mean = recent_mean or 0.0
    safe_baseline_mean = baseline_mean or 0.0

    if safe_momentum > 1 and safe_recent_share > 0.35 and historical_gap_years_present and not recent_cooling:
        phase = "Rebuilding"
    elif safe_slope < -0.3 and safe_momentum < 0 and safe_recent_share < 0.2:
        phase = "Contracting"
    elif career_length > 6 and (recent_cooling or recent_peak_fade) and not historical_gap_years_present:
        phase = "Plateauing"
    elif career_length > 8 and abs(safe_slope) < 0.3 and safe_momentum < 0:
        phase = "Plateauing"
    elif career_length > 8 and abs(safe_slope) < 0.3 and 0.2 <= safe_recent_share <= 0.4:
        phase = "Established"
    elif career_length <= 5 and safe_recent_mean >= safe_baseline_mean:
        phase = "Emerging"
    elif safe_slope > 0.3 and safe_momentum > 0 and safe_recent_share > 0.3 and not recent_cooling and not recent_peak_fade:
        phase = "Scaling"
    elif historical_gap_years_present and safe_momentum > 0 and not recent_cooling:
        phase = "Rebuilding"
    elif career_length <= 5:
        phase = "Emerging"
    elif safe_slope < -0.1 or safe_momentum < -0.5:
        phase = "Contracting" if safe_recent_share < 0.2 else "Plateauing"
    elif safe_slope > 0.1 or safe_momentum > 0.5:
        phase = "Plateauing" if recent_cooling or recent_peak_fade else "Scaling"
    else:
        phase = "Established"

    return {
        "phase": phase,
        "phase_label": phase,
        "phase_interpretation": _get_publication_production_phase_interpretation(phase),
        "confidence_low": confidence_low,
        "confidence_note": confidence_note,
        "insufficient_history": False,
        "recent_mean": round(recent_mean, 1) if recent_mean is not None else None,
        "baseline_mean": round(baseline_mean, 1) if baseline_mean is not None else None,
        "momentum": round(momentum, 1) if momentum is not None else None,
        "recent_share_pct": recent_share_pct,
        "recent_output_count": recent_summary["recent_output_count"],
        "earlier_output_count": recent_summary["earlier_output_count"],
        "recent_years": recent_summary["recent_years"],
        "earlier_years": recent_summary["earlier_years"],
        "recent_window_size": recent_summary["window_size"],
        "recent_trend_slope": round(recent_trend_slope, 2) if recent_trend_slope is not None else None,
        "latest_year": latest_year,
        "latest_output_count": latest_output_count,
        "latest_vs_peak_ratio": latest_vs_peak_ratio,
        "historical_gap_years_present": historical_gap_years_present,
        "peak_year": peak_year,
        "peak_count": peak_count,
        "career_length": career_length,
    }


def _summarize_publication_volume_window_blocks(
    blocks: list[dict[str, Any]],
) -> dict[str, Any]:
    clean_blocks = [
        {
            "label": str(item.get("label") or "").strip() or None,
            "count": max(0, int(item.get("count") or 0)),
        }
        for item in blocks
        if isinstance(item, dict)
    ]
    if not clean_blocks:
        return {
            "start_label": None,
            "start_count": None,
            "latest_label": None,
            "latest_count": None,
            "prior_peak_label": None,
            "prior_peak_count": None,
            "prior_average_count": None,
            "material_direction": "flat",
        }

    start_block = clean_blocks[0]
    latest_block = clean_blocks[-1]
    prior_blocks = clean_blocks[:-1]
    prior_peak_block = (
        max(prior_blocks, key=lambda item: int(item["count"]))
        if prior_blocks
        else None
    )
    prior_average_count = (
        round(
            sum(int(item["count"]) for item in prior_blocks) / float(len(prior_blocks)),
            1,
        )
        if prior_blocks
        else None
    )
    material_direction = "flat"
    start_count = int(start_block["count"])
    latest_count = int(latest_block["count"])
    diff = latest_count - start_count
    if (
        diff >= 2
        or (start_count == 0 and latest_count >= 2)
        or (start_count > 0 and diff >= 1 and latest_count >= start_count * 1.15)
    ):
        material_direction = "up"
    elif (
        diff <= -2
        or (latest_count == 0 and start_count >= 2)
        or (start_count > 0 and diff <= -1 and latest_count <= start_count * 0.85)
    ):
        material_direction = "down"

    return {
        "start_label": start_block["label"],
        "start_count": start_count,
        "latest_label": latest_block["label"],
        "latest_count": latest_count,
        "prior_peak_label": prior_peak_block["label"] if prior_peak_block else None,
        "prior_peak_count": int(prior_peak_block["count"]) if prior_peak_block else None,
        "prior_average_count": prior_average_count,
        "material_direction": material_direction,
    }


def _extract_publication_volume_block_year_bounds(
    label: str | None,
) -> tuple[int | None, int | None]:
    years = [int(value) for value in re.findall(r"\b(?:19|20)\d{2}\b", str(label or ""))]
    if not years:
        return None, None
    return years[0], years[-1]


def _format_publication_volume_block_span(blocks: list[dict[str, Any]]) -> str | None:
    clean_blocks = [item for item in blocks if isinstance(item, dict)]
    if not clean_blocks:
        return None
    first_label = str(clean_blocks[0].get("label") or "").strip() or None
    last_label = str(clean_blocks[-1].get("label") or "").strip() or None
    first_start_year, _ = _extract_publication_volume_block_year_bounds(first_label)
    _, last_end_year = _extract_publication_volume_block_year_bounds(last_label)
    if first_start_year is not None and last_end_year is not None:
        if first_start_year == last_end_year:
            return str(first_start_year)
        return f"{first_start_year}-{last_end_year}"
    if first_label and last_label:
        if first_label == last_label:
            return first_label
        return f"{first_label} to {last_label}"
    return first_label or last_label


def _format_publication_volume_count_band(
    min_count: int | None, max_count: int | None
) -> str | None:
    if min_count is None or max_count is None:
        return None
    if min_count == max_count:
        return str(min_count)
    return f"{min_count}-{max_count}"


def _build_publication_volume_stronger_run_summary(
    *,
    rolling_5y_blocks: list[dict[str, Any]],
    rolling_3y_blocks: list[dict[str, Any]],
    recent_position: str | None,
) -> dict[str, Any]:
    if str(recent_position or "").strip() not in {
        "recently_lighter_than_long_run",
        "very_sparse_recent_window",
        "short_term_softening",
        "longer_run_softening",
    }:
        return {
            "label": None,
            "source": None,
            "block_count": 0,
            "min_count": None,
            "max_count": None,
            "mean": None,
            "latest_count": None,
            "latest_label": None,
            "gap_from_mean": None,
        }

    selected_source = None
    selected_prior_blocks: list[dict[str, Any]] = []
    selected_latest_block: dict[str, Any] | None = None
    for source, raw_blocks in (("5y", rolling_5y_blocks), ("3y", rolling_3y_blocks)):
        clean_blocks = [item for item in raw_blocks if isinstance(item, dict)]
        prior_blocks = clean_blocks[:-1]
        latest_block = clean_blocks[-1] if clean_blocks else None
        if len(prior_blocks) >= 2 and isinstance(latest_block, dict):
            selected_source = source
            selected_prior_blocks = prior_blocks
            selected_latest_block = latest_block
            break

    if not selected_prior_blocks or not isinstance(selected_latest_block, dict):
        return {
            "label": None,
            "source": None,
            "block_count": 0,
            "min_count": None,
            "max_count": None,
            "mean": None,
            "latest_count": None,
            "latest_label": None,
            "gap_from_mean": None,
        }

    counts = [max(0, int(item.get("count") or 0)) for item in selected_prior_blocks]
    latest_count = max(0, int(selected_latest_block.get("count") or 0))
    mean = round(sum(counts) / float(len(counts)), 1) if counts else None
    gap_from_mean = (
        round(float(latest_count) - float(mean), 1)
        if mean is not None
        else None
    )
    return {
        "label": _format_publication_volume_block_span(selected_prior_blocks),
        "source": selected_source,
        "block_count": len(selected_prior_blocks),
        "min_count": min(counts) if counts else None,
        "max_count": max(counts) if counts else None,
        "mean": mean,
        "latest_count": latest_count,
        "latest_label": str(selected_latest_block.get("label") or "").strip() or None,
        "gap_from_mean": gap_from_mean,
    }


def _classify_publication_volume_recent_support_strength(
    *,
    recent_detail_pattern: str | None,
    table_recent_count: int,
    recent_monthly_active_months: int,
) -> str:
    detail_pattern = str(recent_detail_pattern or "").strip()
    if detail_pattern in {"no_recent_output", "very_small_dated_set", "limited_recent_detail"}:
        return "thin"
    if detail_pattern == "small_dated_set" and (
        table_recent_count <= 4 or recent_monthly_active_months <= 4
    ):
        return "thin"
    if detail_pattern == "clustered_recent_months":
        return "moderate"
    if detail_pattern == "broad_recent_spread":
        return "broad"
    return "moderate"


def _classify_publication_volume_read_mode(
    *,
    overall_trajectory: str | None,
    recent_position: str | None,
    stronger_run_label: str | None,
    stronger_run_min_count: int | None,
    stronger_run_latest_count: int | None,
    recent_support_strength: str | None,
) -> str:
    trajectory = str(overall_trajectory or "").strip()
    recent = str(recent_position or "").strip()
    support = str(recent_support_strength or "").strip()
    has_stronger_run = bool(str(stronger_run_label or "").strip())

    if recent in {"recently_lighter_than_long_run", "very_sparse_recent_window", "short_term_softening", "longer_run_softening"}:
        if (
            has_stronger_run
            and stronger_run_min_count is not None
            and stronger_run_latest_count is not None
            and stronger_run_latest_count < stronger_run_min_count
        ):
            if support == "thin":
                return "pause_below_band"
            return "lower_recent_baseline"
        if support == "thin":
            return "soft_patch_with_limited_support"
        return "recent_softening"
    if trajectory == "interrupted_then_rebuilding" and recent in {
        "recently_stronger",
        "recent_rebound",
        "longer_run_strength",
    }:
        return "renewed_rebuild"
    if recent in {"recently_stronger", "recent_rebound", "longer_run_strength"}:
        return "continuing_build"
    if recent == "recently_in_line" and trajectory in {"broadly_stable", "stable_with_peaks"}:
        return "holding_range"
    return "mixed_recent_read"


def _classify_publication_volume_overall_trajectory(
    *,
    total_publications: int,
    active_span: int,
    phase_label: str | None,
    low_year_position: str | None,
    peak_year_position: str | None,
    gap_years: int,
    peak_vs_average_ratio: float | None,
    burstiness_score: float | None,
    peak_year_share_pct: float | None,
) -> str:
    phase = str(phase_label or "").strip()
    low_position = str(low_year_position or "").strip()
    peak_position = str(peak_year_position or "").strip()
    if total_publications < 10 or active_span < 4:
        return "limited_history"
    if phase == "Rebuilding":
        return "interrupted_then_rebuilding"
    if phase == "Scaling" and low_position == "early" and gap_years == 0:
        return "rise_from_quiet_start"
    if phase == "Scaling":
        return "broader_rise"
    if phase == "Established" and gap_years == 0 and (burstiness_score is None or burstiness_score < 0.45):
        return "broadly_stable"
    if phase == "Established":
        return "stable_with_peaks"
    if phase == "Plateauing":
        return "build_then_flatter"
    if phase == "Contracting" and peak_position == "early":
        return "early_high_then_softer"
    if phase == "Contracting":
        return "higher_then_softer"
    if gap_years > 0:
        return "interrupted_record"
    if peak_year_share_pct is not None and peak_year_share_pct >= 30:
        return "peak_led_record"
    if peak_vs_average_ratio is not None and peak_vs_average_ratio >= 1.8:
        return "uneven_high_concentration"
    return "mixed_record"


def _classify_publication_volume_recent_position(
    *,
    rolling_3y_blocks: list[dict[str, Any]],
    rolling_5y_blocks: list[dict[str, Any]],
    recent_monthly_total: int,
    recent_monthly_active_months: int,
) -> str:
    rolling_3y_summary = _summarize_publication_volume_window_blocks(rolling_3y_blocks)
    rolling_5y_summary = _summarize_publication_volume_window_blocks(rolling_5y_blocks)
    direction_3y = str(rolling_3y_summary.get("material_direction") or "flat")
    direction_5y = str(rolling_5y_summary.get("material_direction") or "flat")

    if recent_monthly_total <= 0 and max(
        int(rolling_3y_summary.get("latest_count") or 0),
        int(rolling_5y_summary.get("latest_count") or 0),
    ) <= 0:
        return "no_recent_output"
    if (
        (recent_monthly_total <= 2 or recent_monthly_active_months <= 2)
        and (direction_3y == "down" or direction_5y == "down")
    ):
        return "very_sparse_recent_window"
    if direction_3y == "up" and direction_5y == "up":
        return "recently_stronger"
    if direction_3y == "down" and direction_5y == "down":
        return "recently_lighter_than_long_run"
    if direction_3y == "down":
        return "short_term_softening"
    if direction_3y == "up":
        return "recent_rebound"
    if direction_5y == "down":
        return "longer_run_softening"
    if direction_5y == "up":
        return "longer_run_strength"
    return "recently_in_line"


def _classify_publication_volume_recent_detail_pattern(
    *,
    table_recent_count: int,
    recent_monthly_total: int,
    recent_monthly_active_months: int,
) -> str:
    if recent_monthly_total <= 0 and table_recent_count <= 0:
        return "no_recent_output"
    if table_recent_count <= 0:
        return "limited_recent_detail"
    if table_recent_count <= 2:
        return "very_small_dated_set"
    if recent_monthly_active_months <= 2:
        return "clustered_recent_months"
    if table_recent_count <= 4:
        return "small_dated_set"
    if table_recent_count >= 6 and recent_monthly_active_months >= 5:
        return "broad_recent_spread"
    return "moderate_recent_spread"


def _build_publication_output_pattern_shape_headline(evidence: dict[str, Any]) -> str:
    phase = str(evidence.get("phase_label") or "").strip()
    gap_years = max(0, int(evidence.get("gap_years") or 0))
    burstiness_score = _safe_float(evidence.get("burstiness_score"))
    peak_year_share_pct = _safe_float(evidence.get("peak_year_share_pct"))
    low_year_position = str(evidence.get("low_year_position") or "").strip()

    if phase == "Rebuilding":
        return "Rebuilding output"
    if phase == "Scaling" and gap_years == 0 and low_year_position == "early":
        return "Continuous growth"
    if phase == "Established" and gap_years == 0:
        return "Broadly stable"
    if phase == "Plateauing":
        return "Growth flattening"
    if phase == "Contracting":
        return "Output easing"
    if peak_year_share_pct is not None and peak_year_share_pct >= 30:
        return "Peak-led record"
    if burstiness_score is not None and burstiness_score >= 0.6:
        return "Burst-led output"
    if gap_years > 0:
        return "Interrupted pattern"
    return "Active across years"


def _build_publication_production_phase_headline(evidence: dict[str, Any]) -> str:
    phase = str(evidence.get("phase_label") or "").strip()
    gap_years = max(0, int(evidence.get("gap_years") or 0))
    low_year_position = str(evidence.get("low_year_position") or "").strip()

    if not phase or phase == "Insufficient history":
        return "Too early to read"
    if phase == "Scaling" and low_year_position == "early" and gap_years == 0:
        return "Build from early base"
    if phase == "Scaling":
        return "Still scaling"
    if phase == "Rebuilding":
        return "Recovery after lull"
    if phase == "Established":
        return "Stable working range"
    if phase == "Plateauing":
        return "Rise, then flattening"
    if phase == "Contracting":
        return "Peak now behind"
    if phase == "Emerging":
        return "Early build-up"
    return f"{phase} phase"


def _classify_publication_output_pattern_position(years: list[int], all_years: list[int]) -> str:
    if not years or not all_years:
        return "mixed"
    first_year = min(all_years)
    last_year = max(all_years)
    span = max(1, last_year - first_year)
    positions = [((year - first_year) / span) for year in years]
    average_position = sum(positions) / len(positions)
    if average_position <= 0.33:
        return "early"
    if average_position >= 0.67:
        return "recent"
    return "middle" if len(years) == 1 else "mixed"


def _build_publication_output_pattern_evidence(*, user_id: str) -> dict[str, Any]:
    metrics = get_publication_top_metrics(user_id=user_id)
    tile = _resolve_tile_by_key(metrics, "this_year_vs_last") or {}
    if not tile:
        raise PublicationMetricsNotFoundError(
            "Total publications metric is unavailable for publication output insights."
        )

    chart_data = tile.get("chart_data") if isinstance(tile.get("chart_data"), dict) else {}
    series_payload = _build_publication_output_year_series(tile)
    years = list(series_payload.get("years") or [])
    series = [max(0, int(value)) for value in (series_payload.get("series") or [])]
    scoped_publications = max(0, int(series_payload.get("scoped_publications") or 0))
    total_publications = max(
        0,
        int(
            _safe_int(tile.get("main_value"))
            or _safe_int(tile.get("value"))
            or len(series_payload.get("publications") or [])
        ),
    )
    active_span = max(0, int(series_payload.get("active_span") or 0))
    years_with_output = sum(1 for value in series if value >= 1)
    gap_years = max(0, active_span - years_with_output)
    longest_streak = _calculate_publication_longest_streak(series)
    consistency_index = _calculate_publication_consistency_index(series)
    burstiness_score = _calculate_publication_burstiness_score(series)
    peak_year_share = _calculate_publication_peak_year_share(series)
    output_continuity = _calculate_publication_output_continuity(series)
    average_per_active_year = (
        (float(scoped_publications) / float(active_span)) if active_span > 0 else None
    )
    slope = _calculate_publication_output_slope(years, series)
    max_count = max(series) if series else 0
    min_count = min(series) if series else 0
    peak_years = [years[index] for index, value in enumerate(series) if value == max_count] if series else []
    low_years = [years[index] for index, value in enumerate(series) if value == min_count] if series else []
    standout_years = []
    if average_per_active_year is not None and average_per_active_year > 0:
        standout_years = [
            {"year": years[index], "count": int(value)}
            for index, value in enumerate(series)
            if value > average_per_active_year
            and (value >= average_per_active_year * 1.35 or (value - average_per_active_year) >= 2)
        ]
    recent_summary = _build_recent_publication_window_summary(
        years, series, scoped_publications
    )
    phase_summary = _classify_publication_production_phase(
        years=years,
        series=series,
        active_span=active_span,
        total_publications=total_publications,
        scoped_publications=scoped_publications,
    )
    recent_mean = recent_summary["recent_mean"]
    earlier_mean = recent_summary["earlier_mean"]
    high_run_summary = _build_publication_production_high_run_summary(
        years=years,
        series=series,
        peak_years=peak_years,
        average_per_active_year=average_per_active_year,
        earlier_mean=earlier_mean,
    )
    low_year_position = _classify_publication_output_pattern_position(low_years, years)
    peak_year_position = _classify_publication_output_pattern_position(peak_years, years)
    as_of_date = series_payload.get("as_of_date")
    first_publication_year = series_payload.get("first_publication_year")
    last_publication_year = series_payload.get("last_publication_year")
    peak_vs_average_ratio = (
        round(float(max_count) / float(average_per_active_year), 2)
        if average_per_active_year is not None and average_per_active_year > 0 and max_count > 0
        else None
    )
    even_annual_share_pct = (
        round(100.0 / float(active_span), 1)
        if active_span > 0
        else None
    )
    span_years_label = _format_publication_year_range(
        _safe_int(first_publication_year),
        _safe_int(last_publication_year),
    )
    recent_years = [int(year) for year in (recent_summary.get("recent_years") or [])]
    earlier_years = [int(year) for year in (recent_summary.get("earlier_years") or [])]
    expected_recent_share_pct = (
        round((float(recent_summary["window_size"]) / float(active_span)) * 100.0, 1)
        if active_span > 0 and recent_summary["window_size"] > 0
        else None
    )
    recent_share_vs_even_ratio = (
        round(float(recent_summary["recent_share_pct"]) / float(expected_recent_share_pct), 2)
        if recent_summary["recent_share_pct"] is not None
        and expected_recent_share_pct is not None
        and expected_recent_share_pct > 0
        else None
    )
    current_pace_summary = _build_publication_production_current_pace_summary(
        chart_data,
        as_of_date=as_of_date if isinstance(as_of_date, date) else None,
        comparison_years=recent_years,
    )
    rolling_pace_summary = _build_publication_production_phase_rolling_pace_summary(
        chart_data,
        as_of_date=as_of_date if isinstance(as_of_date, date) else None,
        recent_window_years=max(1, int(recent_summary.get("window_size") or 0)),
    )

    return {
        "metrics_status": "READY",
        "window_id": "all",
        "window_label": "All",
        "window_phrase": "across completed publication years",
        "data_sources": tile.get("data_source") or [],
        "portfolio_context": _build_portfolio_context(metrics),
        "publication_library": _build_publication_library_context(
            [
                dict(item)
                for item in (series_payload.get("publications") or [])
                if isinstance(item, dict)
            ],
            as_of_date=as_of_date if isinstance(as_of_date, date) else None,
        ),
        "total_publications": total_publications,
        "scoped_publications": scoped_publications,
        "first_publication_year": first_publication_year,
        "last_publication_year": last_publication_year,
        "active_span": active_span,
        "span_years_label": span_years_label,
        "years_with_output": years_with_output,
        "gap_years": gap_years,
        "longest_streak": longest_streak,
        "consistency_index": round(consistency_index, 2) if consistency_index is not None else None,
        "consistency_label": _get_publication_consistency_label(consistency_index),
        "burstiness_score": round(burstiness_score, 2) if burstiness_score is not None else None,
        "burstiness_label": _get_publication_burstiness_label(burstiness_score),
        "peak_year_share_pct": round((peak_year_share or 0.0) * 100.0, 1) if peak_year_share is not None else None,
        "peak_year_share_label": _get_publication_peak_year_share_label(
            round((peak_year_share or 0.0) * 100.0, 1) if peak_year_share is not None else None
        ),
        "output_continuity_pct": round((output_continuity or 0.0) * 100.0, 1) if output_continuity is not None else None,
        "output_continuity_label": _get_publication_output_continuity_label(
            round((output_continuity or 0.0) * 100.0, 1) if output_continuity is not None else None
        ),
        "average_per_active_year": round(average_per_active_year, 1) if average_per_active_year is not None else None,
        "slope": round(slope, 2) if slope is not None else None,
        "peak_years": peak_years,
        "peak_years_label": _format_year_list(peak_years) if peak_years else None,
        "peak_year_count": len(peak_years),
        "peak_count": max_count if series else None,
        "peak_vs_average_ratio": peak_vs_average_ratio,
        "low_years": low_years,
        "low_years_label": _format_year_list(low_years) if low_years else None,
        "low_count": min_count if series else None,
        "standout_years": standout_years[:4],
        "low_year_position": low_year_position,
        "peak_year_position": peak_year_position,
        "even_annual_share_pct": even_annual_share_pct,
        "recent_mean": round(recent_mean, 1) if recent_mean is not None else None,
        "earlier_mean": round(earlier_mean, 1) if earlier_mean is not None else None,
        "recent_output_count": recent_summary["recent_output_count"],
        "earlier_output_count": recent_summary["earlier_output_count"],
        "recent_share_pct": recent_summary["recent_share_pct"],
        "expected_recent_share_pct": expected_recent_share_pct,
        "recent_share_vs_even_ratio": recent_share_vs_even_ratio,
        "recent_window_size": recent_summary["window_size"],
        "recent_trend_slope": phase_summary["recent_trend_slope"],
        "recent_years": recent_years,
        "recent_years_label": _format_publication_year_range(
            recent_years[0] if recent_years else None,
            recent_years[-1] if recent_years else None,
        ),
        "earlier_years": earlier_years,
        "earlier_years_label": _format_publication_year_range(
            earlier_years[0] if earlier_years else None,
            earlier_years[-1] if earlier_years else None,
        ),
        "momentum": phase_summary["momentum"],
        "phase_label": phase_summary["phase_label"],
        "phase_interpretation": phase_summary["phase_interpretation"],
        "phase_confidence_low": phase_summary["confidence_low"],
        "phase_confidence_note": phase_summary["confidence_note"],
        "latest_year": phase_summary["latest_year"],
        "latest_output_count": phase_summary["latest_output_count"],
        "latest_vs_peak_ratio": phase_summary["latest_vs_peak_ratio"],
        "high_run_years": high_run_summary["high_run_years"],
        "high_run_label": high_run_summary["high_run_label"],
        "high_run_min_count": high_run_summary["high_run_min_count"],
        "high_run_max_count": high_run_summary["high_run_max_count"],
        "high_run_mean": high_run_summary["high_run_mean"],
        "high_run_threshold": high_run_summary["high_run_threshold"],
        "last_peak_year": high_run_summary["last_peak_year"],
        "years_since_last_peak": high_run_summary["years_since_last_peak"],
        "post_peak_complete_years": high_run_summary["post_peak_complete_years"],
        "latest_gap_from_high_run_mean": high_run_summary["latest_gap_from_high_run_mean"],
        "current_pace_year": current_pace_summary["current_pace_year"],
        "current_pace_cutoff_label": current_pace_summary["current_pace_cutoff_label"],
        "current_pace_count": current_pace_summary["current_pace_count"],
        "current_pace_comparison_years": current_pace_summary["current_pace_comparison_years"],
        "current_pace_comparison_label": current_pace_summary["current_pace_comparison_label"],
        "current_pace_comparison_mean": current_pace_summary["current_pace_comparison_mean"],
        "current_pace_comparison_delta": current_pace_summary["current_pace_comparison_delta"],
        "current_pace_signal": current_pace_summary["current_pace_signal"],
        "rolling_cutoff_label": rolling_pace_summary["rolling_cutoff_label"],
        "rolling_one_year_total": rolling_pace_summary["rolling_one_year_total"],
        "rolling_one_year_pace": rolling_pace_summary["rolling_one_year_pace"],
        "rolling_one_year_window_months": rolling_pace_summary["rolling_one_year_window_months"],
        "rolling_three_year_pace": rolling_pace_summary["rolling_three_year_pace"],
        "rolling_three_year_window_months": rolling_pace_summary["rolling_three_year_window_months"],
        "rolling_prior_period_pace": rolling_pace_summary["rolling_prior_period_pace"],
        "rolling_prior_period_months": rolling_pace_summary["rolling_prior_period_months"],
        "rolling_prior_period_years": rolling_pace_summary["rolling_prior_period_years"],
        "rolling_prior_period_label": rolling_pace_summary["rolling_prior_period_label"],
        "historical_gap_years_present": phase_summary["historical_gap_years_present"],
        "includes_partial_year": bool(series_payload.get("includes_partial_year")),
        "partial_year": series_payload.get("partial_year"),
        "as_of_date": as_of_date.isoformat() if isinstance(as_of_date, date) else None,
        "year_series": [
            {"year": years[index], "count": int(series[index])}
            for index in range(len(years))
        ],
    }


def _build_publication_production_phase_evidence(*, user_id: str) -> dict[str, Any]:
    return _build_publication_output_pattern_evidence(user_id=user_id)


def _classify_publication_year_over_year_trajectory(
    *, years: list[int], series: list[int]
) -> str:
    slope = _calculate_publication_output_slope(years, series)
    if slope is None:
        return "stable"
    if slope > 0.2:
        return "expanding"
    if slope < -0.2:
        return "contracting"
    return "stable"


def _build_publication_year_over_year_trajectory_evidence(
    *, user_id: str
) -> dict[str, Any]:
    evidence = _build_publication_output_pattern_evidence(user_id=user_id)
    year_series = [
        dict(item) for item in (evidence.get("year_series") or []) if isinstance(item, dict)
    ]
    years = [int(item["year"]) for item in year_series if _safe_int(item.get("year")) is not None]
    series = [max(0, int(item.get("count") or 0)) for item in year_series]
    evidence["trajectory_phase_label"] = _classify_publication_year_over_year_trajectory(
        years=years,
        series=series,
    )
    return evidence


def _build_publication_output_pattern_shape_phrase(evidence: dict[str, Any]) -> str:
    consistency_label = str(evidence.get("consistency_label") or "").strip().lower() or None
    burstiness_label = str(evidence.get("burstiness_label") or "").strip().lower() or None

    if consistency_label and burstiness_label:
        return (
            f"year-to-year variation is {consistency_label}, while spike structure is {burstiness_label}"
        )
    if consistency_label:
        return f"year-to-year variation is {consistency_label}"
    if burstiness_label:
        return f"spike structure is {burstiness_label}"
    return "variation and spike structure remain mixed"


def _format_publication_output_pattern_number(value: float | None) -> str | None:
    if value is None:
        return None
    rounded = round(float(value))
    return str(int(rounded))


def _build_publication_output_pattern_prompt_brief(
    evidence: dict[str, Any],
) -> dict[str, str | None]:
    phase_label = str(evidence.get("phase_label") or "").strip() or None
    first_year = _safe_int(evidence.get("first_publication_year"))
    last_year = _safe_int(evidence.get("last_publication_year"))
    gap_years = max(0, int(evidence.get("gap_years") or 0))
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    peak_count = _safe_int(evidence.get("peak_count"))
    latest_year = _safe_int(evidence.get("latest_year"))
    latest_output_count = _safe_int(evidence.get("latest_output_count"))
    recent_mean = _safe_float(evidence.get("recent_mean"))
    earlier_mean = _safe_float(evidence.get("earlier_mean"))
    high_run_label = str(evidence.get("high_run_label") or "").strip() or None
    high_run_min_count = _safe_int(evidence.get("high_run_min_count"))
    high_run_max_count = _safe_int(evidence.get("high_run_max_count"))
    peak_year_share_pct = _safe_float(evidence.get("peak_year_share_pct"))
    low_year_position = str(evidence.get("low_year_position") or "").strip() or "mixed"

    if gap_years <= 0 and first_year is not None and last_year is not None:
        continuity_summary = f"No gap years across {first_year}-{last_year}."
    elif gap_years == 1:
        continuity_summary = "One gap year interrupts the span."
    elif gap_years > 1:
        continuity_summary = f"{gap_years} gap years interrupt the span."
    else:
        continuity_summary = None

    recent_mean_label = _format_publication_output_pattern_number(recent_mean)
    earlier_mean_label = _format_publication_output_pattern_number(earlier_mean)
    peak_years_label = _format_year_list(peak_years) if peak_years else None

    if phase_label == "Plateauing" and latest_year is not None and latest_output_count is not None:
        structural_read = f"Repeated highs, then a clear break in {latest_year}."
    elif phase_label == "Contracting" and latest_year is not None and latest_output_count is not None:
        structural_read = f"Output has pulled back into a weaker recent run by {latest_year}."
    elif phase_label == "Scaling" and gap_years == 0 and low_year_position == "early":
        structural_read = "Continuous output has built upward from a light early base."
    elif phase_label == "Rebuilding":
        structural_read = "Earlier disruption is being followed by a stronger recent rebuild."
    elif phase_label == "Established":
        structural_read = "Output sits in a broad working range rather than one dominant spike."
    else:
        structural_read = "The record is active across the span but shaped by uneven stronger years."

    if (
        phase_label in {"Plateauing", "Contracting"}
        and recent_mean_label
        and earlier_mean_label
        and latest_year is not None
        and latest_output_count is not None
    ):
        primary_driver = (
            f"Recent years averaged {recent_mean_label} publications versus {earlier_mean_label} earlier, "
            f"but {latest_year} fell to {latest_output_count}."
        )
    elif recent_mean_label and earlier_mean_label:
        primary_driver = (
            f"Recent years averaged {recent_mean_label} publications versus {earlier_mean_label} earlier in the span."
        )
    else:
        primary_driver = None

    if len(peak_years) > 1 and peak_count is not None and peak_years_label:
        concentration_read = (
            f"Shared peaks in {peak_years_label} at {peak_count} each mean the record is not being carried by one isolated year."
        )
    elif len(peak_years) == 1 and peak_count is not None and peak_year_share_pct is not None:
        concentration_read = (
            f"The single strongest year, {peak_years[0]}, carries about {round(peak_year_share_pct):.0f}% of the record."
        )
    else:
        concentration_read = None

    if phase_label in {"Plateauing", "Contracting"} and len(peak_years) > 1 and latest_year is not None and latest_output_count is not None:
        why_it_matters_hint = (
            f"Because the highs are shared rather than isolated, the drop to {latest_output_count} in {latest_year} matters as broader lost momentum rather than the fading of one standout year."
        )
    elif phase_label in {"Scaling", "Rebuilding"} and gap_years == 0:
        why_it_matters_hint = "Because the stronger years are recent and continuous, the shape looks like real build rather than legacy concentration."
    elif len(peak_years) > 1 and concentration_read:
        why_it_matters_hint = "Repeated strong years matter more here than one exceptional spike."
    else:
        why_it_matters_hint = None

    if (
        phase_label in {"Plateauing", "Contracting"}
        and high_run_label
        and high_run_min_count is not None
        and high_run_max_count is not None
        and latest_output_count is not None
    ):
        band_label = (
            f"{high_run_min_count}"
            if high_run_min_count == high_run_max_count
            else f"{high_run_min_count}-{high_run_max_count}"
        )
        what_changes_it_hint = (
            f"A next complete year back in the {band_label} publication band seen across {high_run_label} would make {latest_year} look like a dip; another year near {latest_output_count} would confirm a more durable break."
        )
    else:
        what_changes_it_hint = None

    return {
        "structural_read": structural_read,
        "continuity_summary": continuity_summary,
        "primary_driver": primary_driver,
        "concentration_read": concentration_read,
        "why_it_matters_hint": why_it_matters_hint,
        "what_changes_it_hint": what_changes_it_hint,
    }


def _build_publication_production_phase_prompt_brief(
    evidence: dict[str, Any],
) -> dict[str, str]:
    brief: dict[str, str] = {
        "primary_focus": (
            "Anchor the stage call on rolling publication pace through the last completed month. "
            "Use complete-year peaks only to place that pace inside the longer publication span."
        )
    }

    peak_years = [
        int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None
    ]
    peak_years_label = _format_year_list(peak_years) if peak_years else None
    peak_count = _safe_int(evidence.get("peak_count"))
    latest_year = _safe_int(evidence.get("latest_year"))
    latest_output_count = _safe_int(evidence.get("latest_output_count"))
    rolling_one_year_total = _safe_int(evidence.get("rolling_one_year_total"))
    rolling_cutoff_label = str(evidence.get("rolling_cutoff_label") or "").strip() or None
    rolling_three_year_pace = _safe_float(evidence.get("rolling_three_year_pace"))
    rolling_prior_period_pace = _safe_float(evidence.get("rolling_prior_period_pace"))
    rolling_prior_period_label = (
        str(evidence.get("rolling_prior_period_label") or "").strip() or None
    )
    phase_confidence_note = (
        str(evidence.get("phase_confidence_note") or "").strip() or None
    )

    if peak_years_label and peak_count is not None and latest_year is not None and latest_output_count is not None:
        brief["structural_anchor"] = (
            f"Across the full publication span, output peaked in {peak_years_label} at {peak_count} publications, "
            f"then fell to {latest_output_count} in {latest_year}."
        )
    elif latest_year is not None and latest_output_count is not None:
        brief["structural_anchor"] = (
            f"The latest complete year is {latest_year} with {latest_output_count} publications."
        )

    if (
        rolling_one_year_total is not None
        and rolling_three_year_pace is not None
        and rolling_prior_period_pace is not None
        and rolling_prior_period_label
    ):
        cutoff_clause = f" to end {rolling_cutoff_label}" if rolling_cutoff_label else ""
        brief["rolling_pace_summary"] = (
            f"Last 12 months{cutoff_clause}: {rolling_one_year_total} publications. "
            f"Trailing 3-year pace: {rolling_three_year_pace:.1f}/year. "
            f"{rolling_prior_period_label}: {rolling_prior_period_pace:.1f}/year."
        )
    elif rolling_one_year_total is not None and rolling_cutoff_label:
        brief["rolling_pace_summary"] = (
            f"Last 12 months to end {rolling_cutoff_label}: {rolling_one_year_total} publications."
        )

    if phase_confidence_note:
        brief["confidence_hint"] = phase_confidence_note

    return brief


def _build_publication_year_over_year_trajectory_prompt_brief(
    evidence: dict[str, Any],
) -> dict[str, str]:
    brief: dict[str, str] = {
        "primary_focus": (
            "Use complete publication years to anchor the year-over-year read. "
            "Then make the recent rolling comparison explicit in the body: name the last 12 months and compare it with the trailing 3-year pace, "
            "and with the prior period when that evidence is available."
        )
    }
    span_years_label = str(evidence.get("span_years_label") or "").strip() or None
    peak_years = [
        int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None
    ]
    peak_years_label = _format_year_list(peak_years) if peak_years else None
    peak_count = _safe_int(evidence.get("peak_count"))
    latest_year = _safe_int(evidence.get("latest_year"))
    latest_output_count = _safe_int(evidence.get("latest_output_count"))
    trajectory_phase_label = (
        str(evidence.get("trajectory_phase_label") or "").strip().lower() or "stable"
    )
    rolling_summary = _format_publication_production_phase_rolling_pace_summary(evidence)

    if (
        trajectory_phase_label == "contracting"
        and peak_years_label
        and peak_count is not None
        and latest_year is not None
        and latest_output_count is not None
    ):
        brief["structural_anchor"] = (
            f"Across complete years from {span_years_label or 'the full span'}, output peaked in "
            f"{peak_years_label} at {peak_count} publications before falling to {latest_output_count} in {latest_year}."
        )
    elif (
        trajectory_phase_label == "expanding"
        and peak_years_label
        and peak_count is not None
    ):
        brief["structural_anchor"] = (
            f"Across complete years from {span_years_label or 'the full span'}, later years build into "
            f"higher output, reaching {peak_count} in {peak_years_label}."
        )
    elif latest_year is not None and latest_output_count is not None:
        brief["structural_anchor"] = (
            f"The latest complete year is {latest_year} with {latest_output_count} publications."
        )

    if rolling_summary:
        brief["rolling_pace_summary"] = rolling_summary
        brief["body_requirement"] = (
            "Do not leave the rolling read implied. State the latest 12-month total and compare it directly with the trailing 3-year pace."
        )

    return brief


def _build_publication_output_pattern_peak_structure_note(
    evidence: dict[str, Any],
) -> tuple[str | None, str | None]:
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    peak_count = _safe_int(evidence.get("peak_count"))
    peak_year_share_pct = _safe_float(evidence.get("peak_year_share_pct"))
    scoped_publications = max(0, int(evidence.get("scoped_publications") or 0))

    if not peak_years or peak_count is None or peak_year_share_pct is None or scoped_publications <= 0:
        return None, None

    publication_noun = "publication" if peak_count == 1 else "publications"
    per_year_share_label = f"{round(peak_year_share_pct):.0f}%"
    if len(peak_years) > 1:
        combined_share_pct = min(100.0, peak_year_share_pct * len(peak_years))
        combined_share_label = f"{round(combined_share_pct):.0f}%"
        return (
            "Peak structure",
            (
                f"Shared peaks in {_format_year_list(peak_years)} mean the record is being lifted by repeated strong years rather than one isolated spike; "
                f"together those peaks account for about {combined_share_label} of the record."
            ),
        )

    return (
        "Concentration",
        (
            f"{peak_years[0]} contributes {peak_count} of {scoped_publications} {publication_noun} ({per_year_share_label}), "
            "so the overall shape is more concentrated around one standout year than a broad high-output run."
        ),
    )


def _build_publication_output_pattern_consideration(
    evidence: dict[str, Any],
) -> tuple[str | None, str | None]:
    phase_label = str(evidence.get("phase_label") or "").strip() or None
    gap_years = max(0, int(evidence.get("gap_years") or 0))
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    latest_year = _safe_int(evidence.get("latest_year"))
    latest_output_count = _safe_int(evidence.get("latest_output_count"))
    high_run_label = str(evidence.get("high_run_label") or "").strip() or None
    high_run_min_count = _safe_int(evidence.get("high_run_min_count"))
    high_run_max_count = _safe_int(evidence.get("high_run_max_count"))
    prompt_brief = _build_publication_output_pattern_prompt_brief(evidence)

    if (
        phase_label in {"Plateauing", "Contracting"}
        and high_run_label
        and high_run_min_count is not None
        and high_run_max_count is not None
        and latest_output_count is not None
    ):
        band_label = (
            f"{high_run_min_count}"
            if high_run_min_count == high_run_max_count
            else f"{high_run_min_count}-{high_run_max_count}"
        )
        return (
            "What would confirm it",
            (
                f"A next complete year back into the {band_label} publication band seen across {high_run_label} "
                f"would make {latest_year} look like a dip; another year near {latest_output_count} would confirm a more durable break."
            ),
        )

    why_it_matters_hint = str(prompt_brief.get("why_it_matters_hint") or "").strip() or None
    if why_it_matters_hint:
        return "Why it matters", why_it_matters_hint

    if gap_years > 0:
        longest_streak = max(0, int(evidence.get("longest_streak") or 0))
        return (
            "Continuity",
            f"The longest uninterrupted stretch is {longest_streak} years, so gaps still shape the pattern as well as the peaks.",
        )

    if latest_year is not None and latest_output_count is not None and len(peak_years) > 1:
        return (
            "Why it matters",
            (
                f"Because the highs are shared rather than isolated, the drop to {latest_output_count} in {latest_year} "
                "looks more like broader lost momentum than the fading of one standout year."
            ),
        )

    return _build_publication_output_pattern_peak_structure_note(evidence)


def _build_publication_output_pattern_fallback_payload(evidence: dict[str, Any]) -> dict[str, Any]:
    first_year = _safe_int(evidence.get("first_publication_year"))
    last_year = _safe_int(evidence.get("last_publication_year"))
    active_span = max(0, int(evidence.get("active_span") or 0))
    years_with_output = max(0, int(evidence.get("years_with_output") or 0))
    gap_years = max(0, int(evidence.get("gap_years") or 0))
    longest_streak = max(0, int(evidence.get("longest_streak") or 0))
    phase_label = str(evidence.get("phase_label") or "").strip() or None
    consistency_index = _safe_float(evidence.get("consistency_index"))
    consistency_label = str(evidence.get("consistency_label") or "").strip() or None
    burstiness_score = _safe_float(evidence.get("burstiness_score"))
    burstiness_label = str(evidence.get("burstiness_label") or "").strip() or None
    peak_year_share_pct = _safe_float(evidence.get("peak_year_share_pct"))
    peak_year_share_label = str(evidence.get("peak_year_share_label") or "").strip() or None
    output_continuity_label = str(evidence.get("output_continuity_label") or "").strip() or None
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    peak_count = _safe_int(evidence.get("peak_count"))
    peak_vs_average_ratio = _safe_float(evidence.get("peak_vs_average_ratio"))
    low_year_position = str(evidence.get("low_year_position") or "").strip() or "mixed"
    low_years = [int(item) for item in (evidence.get("low_years") or []) if _safe_int(item) is not None]
    recent_mean = _safe_float(evidence.get("recent_mean"))
    earlier_mean = _safe_float(evidence.get("earlier_mean"))
    recent_share_pct = _safe_float(evidence.get("recent_share_pct"))
    recent_years_label = str(evidence.get("recent_years_label") or "").strip() or None
    latest_year = _safe_int(evidence.get("latest_year"))
    latest_output_count = _safe_int(evidence.get("latest_output_count"))
    phase_confidence_low = bool(evidence.get("phase_confidence_low"))
    phase_confidence_note = str(evidence.get("phase_confidence_note") or "").strip() or None
    shape_phrase = _build_publication_output_pattern_shape_phrase(evidence)
    peak_structure_label, peak_structure_note = _build_publication_output_pattern_peak_structure_note(evidence)
    headline = _build_publication_output_pattern_shape_headline(evidence)

    if active_span <= 1:
        headline = "Too early to read"
        body = "There is not yet enough completed publication history to interpret an output pattern."
        consideration_label = None
        consideration = None
    else:
        if gap_years <= 0 and first_year is not None and last_year is not None:
            continuity_phrase = f"you published in every year from {first_year} to {last_year}"
        elif gap_years == 1:
            continuity_phrase = f"you published in {years_with_output} of {active_span} years with one gap year"
        else:
            continuity_phrase = f"you published in {years_with_output} of {active_span} years with {gap_years} gap years"

        if peak_years and peak_count is not None:
            if len(peak_years) == 1:
                peak_phrase = (
                    f"the strongest year was {peak_years[0]} with {peak_count} publications"
                )
            else:
                peak_phrase = (
                    f"the strongest years were { _format_year_list(peak_years) } with {peak_count} publications each"
                )
        else:
            peak_phrase = "no single year dominates the record"

        if (
            phase_label in {"Scaling", "Emerging"}
            and low_year_position == "early"
            and gap_years == 0
        ):
            body = (
                f"Your record looks growth-led rather than spike-led: {continuity_phrase}, "
                f"the quietest years sit early in the span, {shape_phrase}, and {peak_phrase}."
            )
        elif phase_label == "Rebuilding":
            body = (
                f"Your record looks interrupted but recovering: {continuity_phrase}, "
                f"recent output is back above the earlier baseline, {shape_phrase}, and {peak_phrase}."
            )
        elif (
            phase_label in {"Plateauing", "Contracting"}
            and recent_mean is not None
            and earlier_mean is not None
            and latest_year is not None
            and latest_output_count is not None
            and peak_years
            and peak_count is not None
        ):
            peak_descriptor = (
                f"shared peaks of {peak_count} in {_format_year_list(peak_years)}"
                if len(peak_years) > 1
                else f"a peak of {peak_count} in {peak_years[0]}"
            )
            body = (
                f"This is a broad record rather than a one-peak record: {continuity_phrase}, "
                f"and recent years averaged {recent_mean:.1f} publications versus {earlier_mean:.1f} earlier. "
                f"But {latest_year} fell to {latest_output_count} after {peak_descriptor}, so the pattern now looks softer than that earlier stronger run."
            )
        elif phase_label in {"Plateauing", "Contracting"} and recent_mean is not None and earlier_mean is not None:
            body = (
                f"Your recent pattern looks softer than earlier output: {continuity_phrase}, "
                f"{shape_phrase}, recent years average {recent_mean:.1f} publications versus {earlier_mean:.1f} earlier, and {peak_phrase}."
            )
        elif peak_year_share_pct is not None and peak_year_share_pct >= 30:
            body = (
                f"Your record is being pulled toward a small number of stronger years: {peak_phrase}, "
                f"{shape_phrase}, and the peak year share is {round(peak_year_share_pct)}%."
            )
        elif consistency_index is not None and consistency_index >= 0.55 and burstiness_score is not None and burstiness_score <= 0.4:
            body = (
                f"Your record looks broad and steady overall: {continuity_phrase}, "
                f"{shape_phrase}, and concentration remains {str(peak_year_share_label or 'limited').lower()}."
            )
        else:
            body = (
                f"Your record is active across the span but not fully even: {continuity_phrase}, "
                f"{shape_phrase}, {peak_phrase}, and the overall pattern remains {str(burstiness_label or 'mixed').lower()}."
            )

        consideration_label, consideration = _build_publication_output_pattern_consideration(evidence)
        if not consideration_label and not consideration:
            if peak_structure_label and peak_structure_note:
                consideration_label = peak_structure_label
                consideration = peak_structure_note
            elif recent_share_pct is not None and recent_years_label and phase_label in {"Scaling", "Rebuilding"}:
                consideration_label = "Recent build"
                consideration = (
                    f"{round(recent_share_pct)}% of publications fall in {recent_years_label}, reinforcing that the pattern is being driven by the recent part of the span."
                )
            elif low_year_position == "early":
                consideration_label = "Career timing"
                low_years_phrase = (
                    f" ({_format_year_list(low_years)})"
                    if low_years
                    else ""
                )
                consideration = (
                    f"The quietest years sit early{low_years_phrase}, so some unevenness likely reflects portfolio build-up rather than a recent slowdown."
                )
            elif low_year_position == "recent":
                consideration_label = "Recent signal"
                consideration = (
                    "The quietest years sit toward the recent end of the span, so the pattern may reflect flattening rather than early-career build-up."
                )
            elif gap_years > 0 and longest_streak > 0:
                consideration_label = "Continuity"
                consideration = (
                    f"The longest uninterrupted stretch is {longest_streak} years, so the pattern is being shaped by gaps as well as peaks."
                )
            elif peak_vs_average_ratio is not None and peak_vs_average_ratio >= 1.6:
                consideration_label = "How to read it"
                consideration = (
                    f"The strongest year sits about {peak_vs_average_ratio:.1f}x above a typical active year, so the record is broader than a single spike but still uneven."
                )
            else:
                consideration_label = None
                consideration = None

        if phase_confidence_low and phase_confidence_note:
            consideration_label = consideration_label or "Confidence"
            consideration = consideration or phase_confidence_note

    return {
        "overall_summary": body,
        "sections": [
            {
                "key": "publication_output_pattern",
                "title": "Publication output pattern",
                "headline": headline,
                "body": body,
                "consideration_label": consideration_label,
                "consideration": consideration,
                "evidence": {
                    "active_span": active_span,
                    "years_with_output": years_with_output,
                    "peak_years": peak_years,
                    "low_year_position": low_year_position,
                },
            }
        ],
    }


def _format_publication_production_phase_slope_summary(evidence: dict[str, Any]) -> str:
    slope = _safe_float(evidence.get("slope"))
    first_year = _safe_int(evidence.get("first_publication_year"))
    last_year = _safe_int(evidence.get("last_publication_year"))
    if slope is None or first_year is None or last_year is None:
        return "the fitted trend cannot yet be estimated reliably"
    period_label = (
        f"from {first_year} to {last_year}"
        if first_year != last_year
        else f"in {first_year}"
    )
    magnitude = f"{abs(slope):.1f}".rstrip("0").rstrip(".")
    paper_unit = (
        "publication" if abs(abs(slope) - 1.0) < 0.05 else "publications"
    )
    if abs(slope) < 0.15:
        return f"the fitted slope is essentially flat {period_label}"
    if slope > 0:
        return (
            f"the fitted slope remains upward at +{magnitude} {paper_unit} per year {period_label}"
        )
    return f"the fitted slope runs downward at -{magnitude} {paper_unit} per year {period_label}"


def _format_publication_production_phase_recent_share_summary(evidence: dict[str, Any]) -> str:
    recent_share_pct = _safe_float(evidence.get("recent_share_pct"))
    total_publications = max(
        0, int(evidence.get("scoped_publications") or evidence.get("total_publications") or 0)
    )
    recent_years_label = str(evidence.get("recent_years_label") or "").strip()
    active_span = max(0, int(evidence.get("active_span") or 0))
    recent_window_size = max(0, int(evidence.get("recent_window_size") or 0))
    recent_mean = _safe_float(evidence.get("recent_mean"))
    earlier_mean = _safe_float(evidence.get("earlier_mean"))
    momentum = _safe_float(evidence.get("momentum"))
    recent_trend_slope = _safe_float(evidence.get("recent_trend_slope"))
    latest_year = _safe_int(evidence.get("latest_year"))
    latest_output_count = _safe_int(evidence.get("latest_output_count"))
    peak_count = _safe_int(evidence.get("peak_count"))
    latest_vs_peak_ratio = _safe_float(evidence.get("latest_vs_peak_ratio"))
    if recent_share_pct is None or total_publications <= 0:
        return "recent-window context is not yet available"
    period_label = recent_years_label or "the recent complete years"
    base_summary = f"{period_label} accounts for {round(recent_share_pct):.0f}% of total output"
    if recent_mean is None or earlier_mean is None:
        return base_summary

    earlier_year_count = max(0, active_span - recent_window_size)
    if earlier_year_count <= 0:
        return f"{base_summary} and makes up nearly all of the complete-year history currently available"
    if earlier_mean <= 0.05:
        return f"{base_summary} because the earlier years were very light"

    recent_cooling = recent_trend_slope is not None and recent_trend_slope < -0.75
    latest_well_below_peak = latest_vs_peak_ratio is not None and latest_vs_peak_ratio < 0.6
    if (
        recent_cooling
        and latest_year is not None
        and latest_output_count is not None
        and peak_count is not None
        and latest_well_below_peak
    ):
        return (
            f"{base_summary}, but it closes with {latest_output_count} in {latest_year} after a peak of {peak_count}"
        )
    if recent_cooling:
        return f"{base_summary}, but the latest complete years cool against the earlier baseline"
    if momentum is not None and momentum > 0.5:
        return f"{base_summary} and still sits above the earlier baseline"
    if momentum is not None and momentum < -0.5:
        return f"{base_summary} and now sits below the earlier baseline"
    return f"{base_summary} and remains close to the earlier baseline"


def _format_publication_production_phase_continuity_summary(
    evidence: dict[str, Any]
) -> str:
    gap_years = max(0, int(evidence.get("gap_years") or 0))
    if gap_years <= 0:
        return "there are no gap years in the span"
    if gap_years == 1:
        return "there is 1 gap year in the span"
    return f"there are {gap_years} gap years in the span"


def _format_publication_production_phase_current_pace_summary(
    evidence: dict[str, Any]
) -> str | None:
    current_pace_year = _safe_int(evidence.get("current_pace_year"))
    current_pace_cutoff_label = str(evidence.get("current_pace_cutoff_label") or "").strip()
    current_pace_count = _safe_int(evidence.get("current_pace_count"))
    comparison_label = str(evidence.get("current_pace_comparison_label") or "").strip()
    comparison_mean = _safe_float(evidence.get("current_pace_comparison_mean"))
    current_pace_signal = str(evidence.get("current_pace_signal") or "").strip()
    latest_year = _safe_int(evidence.get("latest_year"))
    if current_pace_year is None or not current_pace_cutoff_label or current_pace_count is None:
        return None

    basis_prefix = (
        f"The phase is fixed on complete years through {latest_year}. "
        if latest_year is not None
        else "The phase is fixed on complete years. "
    )
    base_summary = (
        f"Through {current_pace_cutoff_label}, {current_pace_year} has {current_pace_count} "
        f"{'publication' if current_pace_count == 1 else 'publications'}."
    )
    if comparison_mean is None or not comparison_label:
        return f"{basis_prefix}{base_summary}"

    comparison_count_label = f"{comparison_mean:.1f}".rstrip("0").rstrip(".")
    comparison_count_noun = (
        "publication" if abs(comparison_mean - 1.0) < 0.05 else "publications"
    )
    signal_clause = (
        " The live year is currently ahead of recent pace."
        if current_pace_signal == "ahead"
        else " The live year is currently behind recent pace."
        if current_pace_signal == "behind"
        else " The live year is currently in line with recent pace."
        if current_pace_signal == "in_line"
        else ""
    )
    return (
        f"{basis_prefix}{base_summary} The same cutoff averaged {comparison_count_label} "
        f"{comparison_count_noun} across {comparison_label}.{signal_clause}"
    )


def _format_publication_production_phase_rolling_pace_summary(
    evidence: dict[str, Any]
) -> str | None:
    rolling_one_year_total = _safe_int(evidence.get("rolling_one_year_total"))
    rolling_one_year_window_months = max(
        0, int(evidence.get("rolling_one_year_window_months") or 0)
    )
    rolling_cutoff_label = str(evidence.get("rolling_cutoff_label") or "").strip() or None
    rolling_three_year_pace = _safe_float(evidence.get("rolling_three_year_pace"))
    rolling_three_year_window_months = max(
        0, int(evidence.get("rolling_three_year_window_months") or 0)
    )
    rolling_prior_period_pace = _safe_float(evidence.get("rolling_prior_period_pace"))
    rolling_prior_period_label = (
        str(evidence.get("rolling_prior_period_label") or "").strip() or None
    )
    if rolling_one_year_total is None:
        return None

    one_year_label = (
        "the last 12 months"
        if rolling_one_year_window_months == 12
        else f"the last {rolling_one_year_window_months} months"
        if rolling_one_year_window_months > 0
        else "the latest rolling window"
    )
    cutoff_clause = f" to end {rolling_cutoff_label}" if rolling_cutoff_label else ""
    count_noun = "publication" if rolling_one_year_total == 1 else "publications"
    base_summary = (
        f"In {one_year_label}{cutoff_clause}, output was {rolling_one_year_total} {count_noun}."
    )
    if (
        rolling_three_year_pace is None
        or rolling_three_year_window_months <= 0
        or rolling_prior_period_pace is None
        or not rolling_prior_period_label
    ):
        return base_summary

    trailing_label = (
        "the trailing 3-year pace"
        if rolling_three_year_window_months == 36
        else f"the trailing {rolling_three_year_window_months}-month pace"
    )
    return (
        f"In {one_year_label}{cutoff_clause}, output was {rolling_one_year_total} {count_noun}, "
        f"below {trailing_label} of {rolling_three_year_pace:.1f}/year and "
        f"{rolling_prior_period_label.lower()} at {rolling_prior_period_pace:.1f}/year."
    )


def _format_publication_production_phase_peak_summary(evidence: dict[str, Any]) -> str:
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    peak_count = _safe_int(evidence.get("peak_count"))
    if not peak_years:
        return "peak-year context is not yet available"
    if len(peak_years) == 1:
        if peak_count is None:
            return f"the strongest year is {peak_years[0]}"
        return f"the strongest year is {peak_years[0]} with {peak_count} publications"
    if peak_count is None:
        return f"the strongest years are {_format_year_list(peak_years)}"
    return f"the strongest years are {_format_year_list(peak_years)} with {peak_count} publications each"


def _build_publication_production_phase_body(evidence: dict[str, Any]) -> str:
    phase_label = str(evidence.get("phase_label") or "").strip()
    slope_summary = _format_publication_production_phase_slope_summary(evidence)
    recent_share_summary = _format_publication_production_phase_recent_share_summary(evidence)
    rolling_pace_summary = _format_publication_production_phase_rolling_pace_summary(
        evidence
    )
    continuity_summary = _format_publication_production_phase_continuity_summary(evidence)
    peak_years = [
        int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None
    ]
    peak_count = _safe_int(evidence.get("peak_count"))
    latest_year = _safe_int(evidence.get("latest_year"))
    latest_output_count = _safe_int(evidence.get("latest_output_count"))
    peak_years_label = _format_year_list(peak_years) if peak_years else None
    high_run_label = str(evidence.get("high_run_label") or "").strip() or None
    high_run_min_count = _safe_int(evidence.get("high_run_min_count"))
    high_run_max_count = _safe_int(evidence.get("high_run_max_count"))

    if phase_label == "Plateauing":
        if (
            peak_years_label
            and peak_count is not None
            and latest_year is not None
            and latest_output_count is not None
            and rolling_pace_summary
        ):
            return (
                f"Across the full publication span, output peaked in {peak_years_label} at {peak_count} publications, "
                f"then fell to {latest_output_count} in {latest_year}. "
                f"{rolling_pace_summary}"
            )
        if (
            high_run_label
            and high_run_min_count is not None
            and high_run_max_count is not None
            and latest_year is not None
            and latest_output_count is not None
        ):
            band_count_label = (
                str(high_run_min_count)
                if high_run_min_count == high_run_max_count
                else f"{high_run_min_count}-{high_run_max_count}"
            )
            peak_phrase = (
                f"joint peaks of {peak_count} in {peak_years_label}"
                if peak_years_label and peak_count is not None and len(peak_years) > 1
                else f"a peak of {peak_count} in {peak_years_label}"
                if peak_years_label and peak_count is not None
                else None
            )
            second_sentence = (
                f"{latest_year} fell to {latest_output_count} after {peak_phrase}, so this now reads as flattening rather than continued scaling."
                if peak_phrase
                else f"{latest_year} fell to {latest_output_count}, so this now reads as flattening rather than continued scaling."
            )
            return (
                f"{slope_summary[0].upper()}{slope_summary[1:]}, but the record has moved out of the higher-output band that ran at "
                f"{band_count_label} publications across {high_run_label}. "
                f"{second_sentence}"
            )
        if (
            peak_years_label
            and peak_count is not None
            and latest_year is not None
            and latest_output_count is not None
        ):
            peak_phrase = (
                f"joint peaks of {peak_count} in {peak_years_label}"
                if len(peak_years) > 1
                else f"a peak of {peak_count} in {peak_years_label}"
            )
            read_verb = "read" if len(peak_years) > 1 else "reads"
            return (
                f"{slope_summary[0].upper()}{slope_summary[1:]}, but the record has stopped converting that earlier rise into stronger recent years. "
                f"Because {continuity_summary}, {peak_phrase} followed by {latest_output_count} in {latest_year} "
                f"{read_verb} as genuine flattening rather than a gap-driven interruption."
            )
        if rolling_pace_summary:
            return (
                "The stronger publication run is no longer being sustained. "
                f"{rolling_pace_summary}"
            )
        return (
            f"{slope_summary[0].upper()}{slope_summary[1:]}, but the recent complete years are no longer building on that earlier rise. "
            f"{recent_share_summary[0].upper()}{recent_share_summary[1:]}."
        )

    if phase_label == "Scaling":
        return (
            f"{slope_summary[0].upper()}{slope_summary[1:]}, and the record is still turning time into higher annual output rather than settling into a fixed range. "
            f"{recent_share_summary[0].upper()}{recent_share_summary[1:]}, and because {continuity_summary}, this looks like build-up rather than instability."
        )

    if phase_label == "Established":
        return (
            f"{slope_summary[0].upper()}{slope_summary[1:]}, but recent years remain close to the earlier baseline rather than pulling away from it. "
            f"{recent_share_summary[0].upper()}{recent_share_summary[1:]}, and because {continuity_summary}, this supports a settled working range."
        )

    if phase_label == "Contracting":
        if (
            peak_years_label
            and peak_count is not None
            and latest_year is not None
            and latest_output_count is not None
        ):
            peak_phrase = (
                f"joint peaks of {peak_count} in {peak_years_label}"
                if len(peak_years) > 1
                else f"a peak of {peak_count} in {peak_years_label}"
            )
            return (
                f"{slope_summary[0].upper()}{slope_summary[1:]}, and the latest complete years now sit below the earlier high-water mark. "
                f"Because {continuity_summary}, the move from {peak_phrase} to {latest_output_count} in {latest_year} reads as a real pullback rather than a one-year interruption."
            )
        return (
            f"{slope_summary[0].upper()}{slope_summary[1:]}, and the recent complete years now sit below the earlier baseline. "
            f"{recent_share_summary[0].upper()}{recent_share_summary[1:]}."
        )

    if phase_label == "Rebuilding":
        return (
            f"{slope_summary[0].upper()}{slope_summary[1:]}, but the more decisive feature is recovery after an earlier low-output stretch. "
            f"{recent_share_summary[0].upper()}{recent_share_summary[1:]}, which is more consistent with rebuilding than with a stable mature pattern."
        )

    if phase_label == "Emerging":
        return (
            "The complete-year record is still short, so this is better read as an early build than as a settled phase. "
            f"{recent_share_summary[0].upper()}{recent_share_summary[1:]}, and because {continuity_summary}, the record looks more like growth than fade."
        )

    return (
        f"{slope_summary[0].upper()}{slope_summary[1:]}. "
        f"{recent_share_summary[0].upper()}{recent_share_summary[1:]}, with {continuity_summary} shaping the overall read."
    )


def _build_publication_production_phase_fallback_payload(evidence: dict[str, Any]) -> dict[str, Any]:
    phase_label = str(evidence.get("phase_label") or "").strip() or "Insufficient history"
    phase_interpretation = str(evidence.get("phase_interpretation") or "").strip()
    insufficient_history = bool(evidence.get("insufficient_history"))
    confidence_note = str(evidence.get("phase_confidence_note") or "").strip() or None
    low_year_position = str(evidence.get("low_year_position") or "").strip() or "mixed"
    gap_years = max(0, int(evidence.get("gap_years") or 0))
    longest_streak = max(0, int(evidence.get("longest_streak") or 0))
    peak_year_count = max(0, int(evidence.get("peak_year_count") or 0))
    recent_share_pct = _safe_float(evidence.get("recent_share_pct"))
    expected_recent_share_pct = _safe_float(evidence.get("expected_recent_share_pct"))
    recent_share_vs_even_ratio = _safe_float(evidence.get("recent_share_vs_even_ratio"))
    recent_years_label = str(evidence.get("recent_years_label") or "").strip() or None
    recent_mean = _safe_float(evidence.get("recent_mean"))
    earlier_mean = _safe_float(evidence.get("earlier_mean"))
    momentum = _safe_float(evidence.get("momentum"))
    current_pace_summary = _format_publication_production_phase_current_pace_summary(
        evidence
    )
    high_run_label = str(evidence.get("high_run_label") or "").strip() or None
    high_run_min_count = _safe_int(evidence.get("high_run_min_count"))
    high_run_max_count = _safe_int(evidence.get("high_run_max_count"))
    latest_output_count = _safe_int(evidence.get("latest_output_count"))
    current_pace_cutoff_label = str(evidence.get("current_pace_cutoff_label") or "").strip() or None
    current_pace_signal = str(evidence.get("current_pace_signal") or "").strip() or None
    headline = _build_publication_production_phase_headline(evidence)

    if insufficient_history:
        body = "There is not yet enough complete publication history to classify your current production phase confidently."
        consideration_label = "Confidence"
        consideration = confidence_note or "Wait for more complete publication years before reading this as a stable phase."
    else:
        body = _build_publication_production_phase_body(evidence)

        if (
            phase_label == "Plateauing"
            and high_run_label
            and high_run_min_count is not None
            and high_run_max_count is not None
            and latest_output_count is not None
        ):
            band_count_label = (
                str(high_run_min_count)
                if high_run_min_count == high_run_max_count
                else f"{high_run_min_count}-{high_run_max_count}"
            )
            consideration_label = "What would confirm it"
            pace_clause = (
                f" Through {current_pace_cutoff_label}, the live year is still behind that pace."
                if current_pace_cutoff_label and current_pace_signal == "behind"
                else ""
            )
            consideration = (
                f"A next complete year back into the {band_count_label} range seen across {high_run_label} would push this toward scaling again; "
                f"another year near {latest_output_count} would strengthen plateauing.{pace_clause}"
            )
        elif current_pace_summary:
            consideration_label = "Live year"
            consideration = current_pace_summary
        elif (
            phase_label in {"Scaling", "Emerging", "Rebuilding"}
            and recent_share_pct is not None
            and expected_recent_share_pct is not None
            and recent_share_vs_even_ratio is not None
            and recent_share_vs_even_ratio >= 1.15
            and recent_years_label
        ):
            consideration_label = "Recent build"
            consideration = (
                f"{round(recent_share_pct):.0f}% of your output falls in {recent_years_label}, versus about {round(expected_recent_share_pct):.0f}% under an even spread across the full span."
            )
        elif low_year_position == "early" and phase_label in {"Scaling", "Emerging"}:
            consideration_label = "Early base"
            consideration = (
                "The quietest years sit at the start of the span, so this phase reads more like portfolio build-up than a recent reset."
            )
        elif phase_label in {"Plateauing", "Contracting"} and recent_mean is not None and earlier_mean is not None:
            consideration_label = "Recent signal"
            consideration = (
                f"Recent years average {recent_mean:.1f} publications versus {earlier_mean:.1f} earlier, so the softer phase reflects recent output rather than the whole record."
            )
        elif gap_years > 0:
            consideration_label = "Continuity"
            consideration = (
                f"The longest uninterrupted run is {longest_streak} years, so the phase is being shaped by breaks in activity as well as by output level."
            )
        elif peak_year_count > 1:
            consideration_label = "Peak structure"
            consideration = (
                "Several years share the top output, so the current phase is not being created by one isolated peak alone."
            )
        elif momentum is not None:
            consideration_label = "Momentum"
            if momentum > 0:
                consideration = "Recent years are still running above the earlier baseline, which supports the current upward phase reading."
            elif momentum < 0:
                consideration = "Recent years are running below the earlier baseline, which supports the softer phase reading."
            else:
                consideration = phase_interpretation or "Recent years are close to the earlier baseline, which supports a stable phase reading."
        else:
            consideration_label = None
            consideration = None

        if confidence_note:
            consideration_label = consideration_label or "Confidence"
            consideration = consideration or confidence_note

    return {
        "overall_summary": body,
        "sections": [
            {
                "key": "publication_production_phase",
                "title": "Production phase",
                "headline": headline,
                "body": body,
                "consideration_label": consideration_label,
                "consideration": consideration,
                "evidence": {
                    "phase_label": phase_label,
                    "slope": evidence.get("slope"),
                    "recent_share_pct": evidence.get("recent_share_pct"),
                    "recent_years_label": evidence.get("recent_years_label"),
                    "peak_years": list(evidence.get("peak_years") or []),
                    "peak_count": evidence.get("peak_count"),
                    "high_run_label": evidence.get("high_run_label"),
                    "high_run_min_count": evidence.get("high_run_min_count"),
                    "high_run_max_count": evidence.get("high_run_max_count"),
                    "years_since_last_peak": evidence.get("years_since_last_peak"),
                },
            }
        ],
    }


def _build_publication_year_over_year_trajectory_fallback_payload(
    evidence: dict[str, Any]
) -> dict[str, Any]:
    trajectory_phase_label = (
        str(evidence.get("trajectory_phase_label") or "").strip().lower() or "stable"
    )
    span_years_label = str(evidence.get("span_years_label") or "").strip() or "the full span"
    peak_years = [
        int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None
    ]
    peak_years_label = _format_year_list(peak_years) if peak_years else None
    peak_count = _safe_int(evidence.get("peak_count"))
    latest_year = _safe_int(evidence.get("latest_year"))
    latest_output_count = _safe_int(evidence.get("latest_output_count"))
    rolling_summary = _format_publication_production_phase_rolling_pace_summary(evidence)

    if trajectory_phase_label == "contracting":
        headline = "Stronger run, then a pullback"
        if (
            peak_years_label
            and peak_count is not None
            and latest_year is not None
            and latest_output_count is not None
        ):
            body = (
                f"Across complete years from {span_years_label}, output peaked in {peak_years_label} at "
                f"{peak_count} publications before falling to {latest_output_count} in {latest_year}. "
                f"{rolling_summary or ''}"
            ).strip()
        else:
            body = (
                f"Across complete years from {span_years_label}, the later years now sit below the stronger earlier run. "
                f"{rolling_summary or ''}"
            ).strip()
    elif trajectory_phase_label == "expanding":
        headline = "Later years still building"
        if peak_years_label and peak_count is not None:
            body = (
                f"Across complete years from {span_years_label}, output builds into stronger later years, "
                f"reaching {peak_count} in {peak_years_label}. "
                f"{rolling_summary or ''}"
            ).strip()
        else:
            body = (
                f"Across complete years from {span_years_label}, later years still sit above the earlier run. "
                f"{rolling_summary or ''}"
            ).strip()
    else:
        headline = "Run stays broadly level"
        body = (
            f"Across complete years from {span_years_label}, output moves year to year without breaking decisively upward or downward. "
            f"{rolling_summary or ''}"
        ).strip()

    return {
        "overall_summary": body,
        "sections": [
            {
                "key": "publication_year_over_year_trajectory",
                "title": "Year-over-year trajectory",
                "headline": headline,
                "body": body,
                "consideration_label": None,
                "consideration": None,
                "evidence": {
                    "trajectory_phase_label": trajectory_phase_label,
                    "span_years_label": evidence.get("span_years_label"),
                    "peak_years": list(evidence.get("peak_years") or []),
                    "peak_count": evidence.get("peak_count"),
                    "latest_year": evidence.get("latest_year"),
                    "latest_output_count": evidence.get("latest_output_count"),
                    "rolling_cutoff_label": evidence.get("rolling_cutoff_label"),
                    "rolling_one_year_total": evidence.get("rolling_one_year_total"),
                    "rolling_three_year_pace": evidence.get("rolling_three_year_pace"),
                    "rolling_prior_period_pace": evidence.get("rolling_prior_period_pace"),
                    "rolling_prior_period_label": evidence.get("rolling_prior_period_label"),
                },
            }
        ],
    }


def _build_publication_volume_over_time_evidence(*, user_id: str) -> dict[str, Any]:
    pattern_evidence = _build_publication_output_pattern_evidence(user_id=user_id)
    metrics = get_publication_top_metrics(user_id=user_id)
    tile = _resolve_tile_by_key(metrics, "this_year_vs_last") or {}
    if not tile:
        raise PublicationMetricsNotFoundError(
            "Total publications metric is unavailable for publication volume insights."
        )
    chart_data = tile.get("chart_data") if isinstance(tile.get("chart_data"), dict) else {}
    drilldown = tile.get("drilldown") if isinstance(tile.get("drilldown"), dict) else {}
    as_of_date = _parse_iso_date(drilldown.get("as_of_date")) or _utcnow().date()
    publications = [item for item in (drilldown.get("publications") or []) if isinstance(item, dict)]
    recent_monthly = _build_publication_volume_recent_monthly_summary(
        chart_data, as_of_date=as_of_date
    )
    lifetime_points = _build_publication_volume_lifetime_monthly_points(
        chart_data, as_of_date=as_of_date
    )
    rolling_3y = _build_publication_volume_rolling_window_summary(lifetime_points, years=3)
    rolling_5y = _build_publication_volume_rolling_window_summary(lifetime_points, years=5)
    rolling_3y_blocks = [item for item in (rolling_3y.get("blocks") or []) if isinstance(item, dict)]
    rolling_5y_blocks = [item for item in (rolling_5y.get("blocks") or []) if isinstance(item, dict)]
    rolling_3y_summary = _summarize_publication_volume_window_blocks(rolling_3y_blocks)
    rolling_5y_summary = _summarize_publication_volume_window_blocks(rolling_5y_blocks)
    table_summary = _build_publication_volume_table_summary(
        publications, as_of_date=as_of_date
    )
    table_counts = table_summary.get("counts_by_window") if isinstance(table_summary.get("counts_by_window"), dict) else {}
    table_recent_count = max(0, int(table_counts.get("1y") or 0))
    peak_years = [int(item) for item in (pattern_evidence.get("peak_years") or []) if _safe_int(item) is not None]
    peak_count = _safe_int(pattern_evidence.get("peak_count"))
    low_years = [int(item) for item in (pattern_evidence.get("low_years") or []) if _safe_int(item) is not None]
    low_count = _safe_int(pattern_evidence.get("low_count"))
    overall_trajectory = _classify_publication_volume_overall_trajectory(
        total_publications=max(0, int(pattern_evidence.get("total_publications") or 0)),
        active_span=max(0, int(pattern_evidence.get("active_span") or 0)),
        phase_label=str(pattern_evidence.get("phase_label") or "").strip() or None,
        low_year_position=str(pattern_evidence.get("low_year_position") or "").strip() or None,
        peak_year_position=str(pattern_evidence.get("peak_year_position") or "").strip() or None,
        gap_years=max(0, int(pattern_evidence.get("gap_years") or 0)),
        peak_vs_average_ratio=_safe_float(pattern_evidence.get("peak_vs_average_ratio")),
        burstiness_score=_safe_float(pattern_evidence.get("burstiness_score")),
        peak_year_share_pct=_safe_float(pattern_evidence.get("peak_year_share_pct")),
    )
    recent_position = _classify_publication_volume_recent_position(
        rolling_3y_blocks=rolling_3y_blocks,
        rolling_5y_blocks=rolling_5y_blocks,
        recent_monthly_total=max(0, int(recent_monthly.get("total") or 0)),
        recent_monthly_active_months=max(0, int(recent_monthly.get("active_months") or 0)),
    )
    recent_detail_pattern = _classify_publication_volume_recent_detail_pattern(
        table_recent_count=table_recent_count,
        recent_monthly_total=max(0, int(recent_monthly.get("total") or 0)),
        recent_monthly_active_months=max(0, int(recent_monthly.get("active_months") or 0)),
    )
    stronger_run_summary = _build_publication_volume_stronger_run_summary(
        rolling_5y_blocks=rolling_5y_blocks,
        rolling_3y_blocks=rolling_3y_blocks,
        recent_position=recent_position,
    )
    recent_support_strength = _classify_publication_volume_recent_support_strength(
        recent_detail_pattern=recent_detail_pattern,
        table_recent_count=table_recent_count,
        recent_monthly_active_months=max(0, int(recent_monthly.get("active_months") or 0)),
    )
    volume_read_mode = _classify_publication_volume_read_mode(
        overall_trajectory=overall_trajectory,
        recent_position=recent_position,
        stronger_run_label=stronger_run_summary.get("label"),
        stronger_run_min_count=_safe_int(stronger_run_summary.get("min_count")),
        stronger_run_latest_count=_safe_int(stronger_run_summary.get("latest_count")),
        recent_support_strength=recent_support_strength,
    )
    return {
        "metrics_status": "READY",
        "window_id": "all",
        "window_label": "All",
        "window_phrase": "across all publication-volume views",
        "data_sources": tile.get("data_source") or [],
        "portfolio_context": pattern_evidence.get("portfolio_context") or {},
        "publication_library": _build_publication_library_context(
            publications,
            as_of_date=as_of_date,
        ),
        "total_publications": pattern_evidence.get("total_publications"),
        "scoped_publications": pattern_evidence.get("scoped_publications"),
        "first_publication_year": pattern_evidence.get("first_publication_year"),
        "last_publication_year": pattern_evidence.get("last_publication_year"),
        "active_span": pattern_evidence.get("active_span"),
        "span_years_label": pattern_evidence.get("span_years_label"),
        "consistency_index": pattern_evidence.get("consistency_index"),
        "consistency_label": pattern_evidence.get("consistency_label"),
        "burstiness_score": pattern_evidence.get("burstiness_score"),
        "burstiness_label": pattern_evidence.get("burstiness_label"),
        "peak_year_share_pct": pattern_evidence.get("peak_year_share_pct"),
        "peak_year_share_label": pattern_evidence.get("peak_year_share_label"),
        "output_continuity_pct": pattern_evidence.get("output_continuity_pct"),
        "output_continuity_label": pattern_evidence.get("output_continuity_label"),
        "gap_years": pattern_evidence.get("gap_years"),
        "longest_streak": pattern_evidence.get("longest_streak"),
        "peak_vs_average_ratio": pattern_evidence.get("peak_vs_average_ratio"),
        "peak_year_position": pattern_evidence.get("peak_year_position"),
        "low_year_position": pattern_evidence.get("low_year_position"),
        "recent_years_label": pattern_evidence.get("recent_years_label"),
        "earlier_years_label": pattern_evidence.get("earlier_years_label"),
        "phase_confidence_low": pattern_evidence.get("phase_confidence_low"),
        "phase_confidence_note": pattern_evidence.get("phase_confidence_note"),
        "phase_label": pattern_evidence.get("phase_label"),
        "phase_interpretation": pattern_evidence.get("phase_interpretation"),
        "slope": pattern_evidence.get("slope"),
        "peak_years": peak_years,
        "peak_count": peak_count,
        "low_years": low_years,
        "low_count": low_count,
        "recent_mean": pattern_evidence.get("recent_mean"),
        "earlier_mean": pattern_evidence.get("earlier_mean"),
        "momentum": pattern_evidence.get("momentum"),
        "recent_monthly_period_label": recent_monthly.get("period_label"),
        "recent_monthly_period_end_label": recent_monthly.get("period_end_label"),
        "recent_monthly_total": recent_monthly.get("total"),
        "recent_monthly_active_months": recent_monthly.get("active_months"),
        "recent_monthly_peak_count": recent_monthly.get("peak_count"),
        "recent_monthly_peak_periods": recent_monthly.get("peak_periods") or [],
        "recent_monthly_points": recent_monthly.get("points") or [],
        "rolling_3y_period_label": rolling_3y.get("period_label"),
        "rolling_3y_blocks": rolling_3y_blocks,
        "rolling_3y_latest_count": rolling_3y.get("latest_count"),
        "rolling_3y_earliest_count": rolling_3y.get("earliest_count"),
        "rolling_3y_direction": rolling_3y.get("direction"),
        "rolling_3y_start_label": rolling_3y_summary.get("start_label"),
        "rolling_3y_start_count": rolling_3y_summary.get("start_count"),
        "rolling_3y_latest_label": rolling_3y_summary.get("latest_label"),
        "rolling_3y_prior_peak_label": rolling_3y_summary.get("prior_peak_label"),
        "rolling_3y_prior_peak_count": rolling_3y_summary.get("prior_peak_count"),
        "rolling_3y_prior_average_count": rolling_3y_summary.get("prior_average_count"),
        "rolling_3y_material_direction": rolling_3y_summary.get("material_direction"),
        "rolling_5y_period_label": rolling_5y.get("period_label"),
        "rolling_5y_blocks": rolling_5y_blocks,
        "rolling_5y_latest_count": rolling_5y.get("latest_count"),
        "rolling_5y_earliest_count": rolling_5y.get("earliest_count"),
        "rolling_5y_direction": rolling_5y.get("direction"),
        "rolling_5y_start_label": rolling_5y_summary.get("start_label"),
        "rolling_5y_start_count": rolling_5y_summary.get("start_count"),
        "rolling_5y_latest_label": rolling_5y_summary.get("latest_label"),
        "rolling_5y_prior_peak_label": rolling_5y_summary.get("prior_peak_label"),
        "rolling_5y_prior_peak_count": rolling_5y_summary.get("prior_peak_count"),
        "rolling_5y_prior_average_count": rolling_5y_summary.get("prior_average_count"),
        "rolling_5y_material_direction": rolling_5y_summary.get("material_direction"),
        "table_counts_by_window": table_counts,
        "table_recent_count": table_recent_count,
        "table_recent_range_label": table_summary.get("recent_range_label"),
        "table_recent_titles": table_summary.get("recent_titles") or [],
        "table_recent_article_types": table_summary.get("recent_article_types") or [],
        "table_recent_precision_counts": table_summary.get("recent_precision_counts") or {},
        "table_most_recent_date": table_summary.get("most_recent_date"),
        "table_most_recent_title": table_summary.get("most_recent_title"),
        "overall_trajectory": overall_trajectory,
        "recent_position": recent_position,
        "recent_detail_pattern": recent_detail_pattern,
        "stronger_run_label": stronger_run_summary.get("label"),
        "stronger_run_source": stronger_run_summary.get("source"),
        "stronger_run_block_count": stronger_run_summary.get("block_count"),
        "stronger_run_min_count": stronger_run_summary.get("min_count"),
        "stronger_run_max_count": stronger_run_summary.get("max_count"),
        "stronger_run_mean": stronger_run_summary.get("mean"),
        "stronger_run_latest_count": stronger_run_summary.get("latest_count"),
        "stronger_run_latest_label": stronger_run_summary.get("latest_label"),
        "stronger_run_gap_from_mean": stronger_run_summary.get("gap_from_mean"),
        "recent_support_strength": recent_support_strength,
        "volume_read_mode": volume_read_mode,
        "as_of_date": as_of_date.isoformat(),
    }


def _build_publication_volume_over_time_headline(evidence: dict[str, Any]) -> str:
    volume_read_mode = str(evidence.get("volume_read_mode") or "").strip()
    overall_trajectory = str(evidence.get("overall_trajectory") or "").strip()
    recent_position = str(evidence.get("recent_position") or "").strip()
    if volume_read_mode == "pause_below_band":
        return "Paused below recent band"
    if volume_read_mode == "lower_recent_baseline":
        return "Lower recent baseline"
    if volume_read_mode == "soft_patch_with_limited_support":
        return "Softer, still thin"
    if volume_read_mode == "continuing_build":
        return "Build still holding"
    if volume_read_mode == "holding_range":
        return "Holding the range"
    if volume_read_mode == "renewed_rebuild":
        return "Rebuild still carrying"
    if overall_trajectory == "limited_history":
        return "Early volume read"
    if recent_position == "no_recent_output":
        return "Recent volume lull"
    if overall_trajectory in {"rise_from_quiet_start", "broader_rise"} and recent_position in {
        "recently_lighter_than_long_run",
        "very_sparse_recent_window",
        "short_term_softening",
        "longer_run_softening",
    }:
        return "Rise then ease"
    if overall_trajectory in {"rise_from_quiet_start", "broader_rise"} and recent_position in {
        "recently_stronger",
        "recent_rebound",
        "longer_run_strength",
    }:
        return "Growth still building"
    if overall_trajectory in {"broadly_stable", "stable_with_peaks"} and recent_position == "recently_in_line":
        return "Stable through time"
    if overall_trajectory == "interrupted_then_rebuilding" and recent_position in {
        "recently_stronger",
        "recent_rebound",
        "longer_run_strength",
    }:
        return "Rebuild after lull"
    if overall_trajectory in {
        "build_then_flatter",
        "early_high_then_softer",
        "higher_then_softer",
    }:
        return "Earlier high, softer"
    if overall_trajectory == "peak_led_record":
        return "Peak-led volume"
    return "Mixed volume rhythm"


def _format_publication_volume_peak_phrase(
    peak_years: list[int], peak_count: int | None
) -> str | None:
    if not peak_years:
        return None
    if len(peak_years) == 1:
        if peak_count is None:
            return f"peaking in {peak_years[0]}"
        return f"peaking in {peak_years[0]} at {peak_count} publications"
    if peak_count is None:
        return f"peaking in {_format_year_list(peak_years)}"
    return f"peaking in {_format_year_list(peak_years)} at {peak_count} publications each"


def _format_publication_volume_peak_years_phrase(peak_years: list[int]) -> str | None:
    if not peak_years:
        return None
    if len(peak_years) == 1:
        return f"peaking in {peak_years[0]}"
    return f"peaking in {_format_year_list(peak_years)}"


def _build_publication_volume_context_sentence(evidence: dict[str, Any]) -> str:
    phase_label = str(evidence.get("phase_label") or "").strip()
    output_continuity_pct = _safe_float(evidence.get("output_continuity_pct"))
    burstiness_score = _safe_float(evidence.get("burstiness_score"))
    peak_year_share_pct = _safe_float(evidence.get("peak_year_share_pct"))
    gap_years = max(0, int(evidence.get("gap_years") or 0))

    if phase_label == "Scaling" and output_continuity_pct is not None and output_continuity_pct >= 90:
        return "which fits a continuous scaling record rather than a flat annual baseline"
    if phase_label == "Scaling":
        return "which still fits a broader scaling record rather than a fully settled one"
    if phase_label == "Established" and (burstiness_score is None or burstiness_score < 0.4):
        return "which fits a mature record with breadth rather than one built around isolated surges"
    if phase_label == "Rebuilding":
        return "which reads more like recovery after an earlier lull than one uninterrupted climb"
    if phase_label in {"Plateauing", "Contracting"}:
        return "which points to a softer later phase rather than continued build"
    if peak_year_share_pct is not None and peak_year_share_pct >= 30:
        return "which leaves the record more dependent on standout years than on a steady annual baseline"
    if burstiness_score is not None and burstiness_score >= 0.6:
        return "which leaves the record more surge-led than evenly paced"
    if gap_years > 0:
        return "which sits inside a stop-start record rather than a continuous one"
    return "which reads as an established record with a mixed but not random shape"


def _build_publication_volume_recent_detail_clause(evidence: dict[str, Any]) -> str:
    recent_detail_pattern = str(evidence.get("recent_detail_pattern") or "").strip()
    table_recent_count = max(0, int(evidence.get("table_recent_count") or 0))
    table_recent_range_label = str(evidence.get("table_recent_range_label") or "").strip() or None
    precision_counts = (
        evidence.get("table_recent_precision_counts")
        if isinstance(evidence.get("table_recent_precision_counts"), dict)
        else {}
    )
    year_only_count = max(0, int(precision_counts.get("year") or 0))
    month_only_count = max(0, int(precision_counts.get("month") or 0))

    if recent_detail_pattern == "no_recent_output":
        return "there are no recent dated publications behind that latest window"
    if recent_detail_pattern == "limited_recent_detail":
        if year_only_count > 0 and month_only_count <= 0:
            return "the recent rows only have year-level dating, so they support the broader read without pinning down recency very tightly"
        if month_only_count > 0:
            return "the recent rows rely on month-level dating, so they support the broader read without giving a full day-by-day cadence"
        return "the recent rows add only limited date detail, so they support the broader read rather than fully anchoring it"
    if recent_detail_pattern == "very_small_dated_set":
        return (
            f"only {table_recent_count} dated publication{'s' if table_recent_count != 1 else ''} sit behind the latest 12 months, so that recent read can still move quickly"
        )
    if recent_detail_pattern == "small_dated_set":
        range_phrase = f", spanning {table_recent_range_label}" if table_recent_range_label else ""
        return (
            f"those recent windows are still being carried by a small dated set of {table_recent_count} publications{range_phrase}"
        )
    if recent_detail_pattern == "clustered_recent_months":
        return "the recent rows are clustered into only a few active months, so the latest period is real but not yet broad-based"
    if recent_detail_pattern == "broad_recent_spread":
        return "the recent rows are broad enough to support that read, rather than hinging on one isolated month or paper"
    return "the recent rows support that reading without pointing to one isolated paper or one-off month as the whole explanation"


def _build_publication_volume_overall_clause(evidence: dict[str, Any]) -> str:
    span_years_label = str(evidence.get("span_years_label") or "").strip() or None
    overall_trajectory = str(evidence.get("overall_trajectory") or "").strip()
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    low_years = [int(item) for item in (evidence.get("low_years") or []) if _safe_int(item) is not None]
    low_count = _safe_int(evidence.get("low_count"))
    gap_years = max(0, int(evidence.get("gap_years") or 0))
    peak_phrase = _format_publication_volume_peak_years_phrase(peak_years)
    span_phrase = span_years_label or "the full publication span"
    low_phrase = (
        f"{_format_year_list(low_years)} at {low_count} publication{'s' if low_count != 1 else ''}"
        if low_years and low_count is not None
        else None
    )

    if overall_trajectory == "limited_history":
        return (
            "There is only limited publication history so far, so this section is showing an early volume pattern rather than a settled long-run shape."
        )
    if overall_trajectory == "rise_from_quiet_start":
        if low_phrase and peak_phrase:
            return f"Across {span_phrase}, volume builds from a very quiet start ({low_phrase}) into later stronger years, {peak_phrase}, {_build_publication_volume_context_sentence(evidence)}."
        if peak_phrase:
            return f"Across {span_phrase}, volume builds from a quieter start into later stronger years, {peak_phrase}, {_build_publication_volume_context_sentence(evidence)}."
        return f"Across {span_phrase}, volume builds from a quieter start into a stronger later run, {_build_publication_volume_context_sentence(evidence)}."
    if overall_trajectory == "broader_rise":
        if peak_phrase:
            return f"Across {span_phrase}, volume trends upward overall, with later years stronger than the start of the record and {peak_phrase}, {_build_publication_volume_context_sentence(evidence)}."
        return f"Across {span_phrase}, volume trends upward overall, with later years stronger than the start of the record, {_build_publication_volume_context_sentence(evidence)}."
    if overall_trajectory in {"broadly_stable", "stable_with_peaks"}:
        if peak_phrase:
            return f"Across {span_phrase}, volume stays broadly stable rather than shifting sharply across the record, even while {peak_phrase}, {_build_publication_volume_context_sentence(evidence)}."
        return f"Across {span_phrase}, volume stays broadly stable rather than shifting sharply across the record, {_build_publication_volume_context_sentence(evidence)}."
    if overall_trajectory == "build_then_flatter":
        return f"Across {span_phrase}, volume built into a stronger middle-to-late run, but later years have not kept pushing beyond that level, {_build_publication_volume_context_sentence(evidence)}."
    if overall_trajectory == "early_high_then_softer":
        if peak_phrase:
            return f"Across {span_phrase}, the strongest output sits earlier in the record, {peak_phrase}, and later years have stayed below that earlier high point, {_build_publication_volume_context_sentence(evidence)}."
        return f"Across {span_phrase}, the strongest output sits earlier in the record and later years stay below that earlier high point, {_build_publication_volume_context_sentence(evidence)}."
    if overall_trajectory == "higher_then_softer":
        return f"Across {span_phrase}, volume reaches higher levels before easing in the later part of the record, {_build_publication_volume_context_sentence(evidence)}."
    if overall_trajectory == "interrupted_then_rebuilding":
        return f"Across {span_phrase}, volume includes an earlier lull or break, but later years rebuild from that quieter patch, {_build_publication_volume_context_sentence(evidence)}."
    if overall_trajectory == "interrupted_record":
        return f"Across {span_phrase}, volume is shaped by {gap_years} gap {'year' if gap_years == 1 else 'years'} and uneven periods rather than one smooth build, {_build_publication_volume_context_sentence(evidence)}."
    if overall_trajectory == "peak_led_record":
        return f"Across {span_phrase}, volume is active overall but still leans on a small number of standout years, {_build_publication_volume_context_sentence(evidence)}."
    if overall_trajectory == "uneven_high_concentration":
        return f"Across {span_phrase}, volume varies sharply from year to year and leans more on standout periods than on a steady annual baseline, {_build_publication_volume_context_sentence(evidence)}."
    return f"Across {span_phrase}, volume shifts across the record without settling into a single simple shape, {_build_publication_volume_context_sentence(evidence)}."


def _build_publication_volume_recent_clause(evidence: dict[str, Any]) -> str:
    recent_position = str(evidence.get("recent_position") or "").strip()
    recent_detail_pattern = str(evidence.get("recent_detail_pattern") or "").strip()
    recent_monthly_total = max(0, int(evidence.get("recent_monthly_total") or 0))
    recent_monthly_active_months = max(0, int(evidence.get("recent_monthly_active_months") or 0))
    recent_monthly_period_end_label = str(evidence.get("recent_monthly_period_end_label") or "").strip() or None

    if recent_position in {"recently_lighter_than_long_run", "very_sparse_recent_window", "short_term_softening"}:
        if recent_detail_pattern in {"very_small_dated_set", "small_dated_set", "limited_recent_detail"}:
            opening = "The latest 5-year, 3-year, and 12-month views all sit below the stronger middle-to-late part of the record, so recent volume currently looks more like a pause below your earlier high-water mark than a settled long-run decline"
        else:
            opening = "The latest 5-year, 3-year, and 12-month views all sit below the stronger middle-to-late part of the record, so recent volume now sits clearly below your earlier high-water mark"
    elif recent_position in {"recently_stronger", "recent_rebound", "longer_run_strength"}:
        opening = "The latest 5-year, 3-year, and 12-month views are reinforcing the broader record rather than pulling away from it"
    elif recent_position == "recently_in_line":
        opening = "The latest 5-year, 3-year, and 12-month views are not materially changing the broader pattern"
    elif recent_position == "no_recent_output":
        opening = "The latest 12-month window is currently empty enough to leave the recent end of the record distinctly quieter than the rest of the span"
    elif recent_position == "longer_run_softening":
        opening = "The latest 5-year view ends below its earlier blocks, which puts a drag on the recent end of the record even though the shorter window is more mixed"
    else:
        opening = "The latest windows give a mixed recent picture against the longer-run record"

    monthly_context = (
        f"{recent_monthly_total} publication{'s' if recent_monthly_total != 1 else ''} across {recent_monthly_active_months} active month{'s' if recent_monthly_active_months != 1 else ''} in the latest 12 completed months"
        if recent_monthly_total > 0
        else "no publications in the latest 12 completed months"
    )
    if recent_monthly_period_end_label:
        monthly_context = f"{monthly_context}, through {recent_monthly_period_end_label}"
    detail_clause = _build_publication_volume_recent_detail_clause(evidence)
    return f"{opening}, with {monthly_context}, and {detail_clause}."


def _build_publication_volume_over_time_body(evidence: dict[str, Any]) -> str:
    overall_trajectory = str(evidence.get("overall_trajectory") or "").strip()
    recent_position = str(evidence.get("recent_position") or "").strip()
    volume_read_mode = str(evidence.get("volume_read_mode") or "").strip()
    span_years_label = str(evidence.get("span_years_label") or "").strip() or "the full publication span"
    stronger_run_label = str(evidence.get("stronger_run_label") or "").strip() or None
    stronger_run_min_count = _safe_int(evidence.get("stronger_run_min_count"))
    stronger_run_max_count = _safe_int(evidence.get("stronger_run_max_count"))
    stronger_run_mean = _safe_float(evidence.get("stronger_run_mean"))
    stronger_run_latest_count = _safe_int(evidence.get("stronger_run_latest_count"))
    stronger_run_gap_from_mean = _safe_float(evidence.get("stronger_run_gap_from_mean"))
    table_recent_count = max(0, int(evidence.get("table_recent_count") or 0))
    recent_monthly_total = max(0, int(evidence.get("recent_monthly_total") or 0))
    recent_support_strength = str(evidence.get("recent_support_strength") or "").strip()

    if (
        recent_position in {
            "recently_lighter_than_long_run",
            "very_sparse_recent_window",
            "short_term_softening",
            "longer_run_softening",
        }
        and stronger_run_label
        and stronger_run_min_count is not None
        and stronger_run_max_count is not None
        and stronger_run_latest_count is not None
    ):
        count_band = _format_publication_volume_count_band(
            stronger_run_min_count, stronger_run_max_count
        )
        first_sentence = (
            f"Across {span_years_label}, publication volume moved into a stronger {stronger_run_label} run, "
            f"with rolling annual output typically between {count_band} publication{'s' if count_band != '1' else ''}."
        )
        latest_count = recent_monthly_total or stronger_run_latest_count
        latest_phrase = f"the latest 12 months contain {latest_count} publication{'s' if latest_count != 1 else ''}"
        if volume_read_mode == "pause_below_band":
            second_sentence = (
                f"Both recent rolling views now sit below that band, and {latest_phrase}, "
                "so the record currently looks paused rather than reset into a durable lower baseline."
            )
        elif volume_read_mode == "lower_recent_baseline":
            second_sentence = (
                f"Both recent rolling views now sit below that band, and {latest_phrase}, "
                "so recent volume now looks more like a lower current baseline than a brief wobble."
            )
        elif recent_support_strength == "thin":
            second_sentence = (
                f"Both recent rolling views now sit below that band, and {latest_phrase}, "
                "so the ending looks like a thinner patch below the recent run, with too little new depth to treat it as settled."
            )
        else:
            second_sentence = (
                f"Both recent rolling views now sit below that band, and {latest_phrase}, "
                "so the ending now looks more like a pause below that earlier band than continued build."
            )
        if overall_trajectory in {"early_high_then_softer", "higher_then_softer"}:
            second_sentence = (
                f"Both recent rolling views now sit below that band, and {latest_phrase}, "
                "so recent volume now sits below that stronger band and looks more like a lower recent run than a brief interruption."
            )
        return f"{first_sentence} {second_sentence}"

    return (
        f"{_build_publication_volume_overall_clause(evidence)} "
        f"{_build_publication_volume_recent_clause(evidence)}"
    ).strip()


def _build_publication_volume_over_time_fallback_payload(evidence: dict[str, Any]) -> dict[str, Any]:
    headline = _build_publication_volume_over_time_headline(evidence)
    overall_trajectory = str(evidence.get("overall_trajectory") or "").strip()
    recent_position = str(evidence.get("recent_position") or "").strip()
    recent_detail_pattern = str(evidence.get("recent_detail_pattern") or "").strip()
    phase_confidence_low = bool(evidence.get("phase_confidence_low"))
    phase_confidence_note = str(evidence.get("phase_confidence_note") or "").strip() or None
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    gap_years = max(0, int(evidence.get("gap_years") or 0))
    table_recent_count = max(0, int(evidence.get("table_recent_count") or 0))
    stronger_run_label = str(evidence.get("stronger_run_label") or "").strip() or None
    stronger_run_min_count = _safe_int(evidence.get("stronger_run_min_count"))
    stronger_run_max_count = _safe_int(evidence.get("stronger_run_max_count"))
    stronger_run_latest_count = _safe_int(evidence.get("stronger_run_latest_count"))
    volume_read_mode = str(evidence.get("volume_read_mode") or "").strip()
    recent_support_strength = str(evidence.get("recent_support_strength") or "").strip()

    body = _build_publication_volume_over_time_body(evidence)

    if phase_confidence_low and phase_confidence_note:
        consideration_label = "Confidence"
        consideration = phase_confidence_note
    elif (
        volume_read_mode in {"pause_below_band", "lower_recent_baseline", "soft_patch_with_limited_support"}
        and stronger_run_label
        and stronger_run_min_count is not None
        and stronger_run_max_count is not None
        and stronger_run_latest_count is not None
    ):
        consideration_label = "Why it matters"
        if volume_read_mode == "lower_recent_baseline":
            consideration = (
                "If that lighter run holds, near-term assessments of the portfolio will be shaped more by older strong years than by fresh output."
            )
        elif recent_support_strength == "thin":
            consideration = (
                "If this pause holds, near-term assessments of the portfolio will be driven more by earlier strong years than by fresh output."
            )
        else:
            consideration = (
                "If this softer patch holds, the record will lean more on older strong years than on fresh publication volume."
            )
    elif recent_detail_pattern == "limited_recent_detail":
        consideration_label = "Date detail"
        consideration = (
            "Recent publication rows have limited date precision, so use them as support for the monthly view rather than as a complete recency count."
        )
    elif recent_detail_pattern in {"very_small_dated_set", "small_dated_set"}:
        consideration_label = "Recent detail"
        consideration = (
            f"Because only {table_recent_count} dated publication{'s' if table_recent_count != 1 else ''} sit in the latest 12 months, this recent read can still shift quickly as new papers are added."
        )
    elif recent_position in {"recently_lighter_than_long_run", "very_sparse_recent_window", "short_term_softening"} and overall_trajectory in {
        "rise_from_quiet_start",
        "broader_rise",
        "interrupted_then_rebuilding",
    }:
        consideration_label = "How to read it"
        consideration = (
            "The latest window is softer than the stronger middle-to-late part of the record, but the full span still reads as a broader build rather than a flat baseline."
        )
    elif recent_position in {"recently_stronger", "recent_rebound", "longer_run_strength"}:
        consideration_label = "Recent position"
        consideration = (
            "The latest windows are reinforcing the broader record rather than sitting below it."
        )
    elif gap_years > 0:
        consideration_label = "Continuity"
        consideration = (
            f"The record includes {gap_years} gap {'year' if gap_years == 1 else 'years'}, so recent windows sit inside a more interrupted publication span."
        )
    elif len(peak_years) > 1:
        consideration_label = "Peak structure"
        consideration = (
            "Several years share the top annual output, so the long-run record is not being defined by one isolated peak alone."
        )
    else:
        consideration_label = None
        consideration = None

    return {
        "overall_summary": body,
        "sections": [
            {
                "key": "publication_volume_over_time",
                "title": "Publication volume over time",
                "headline": headline,
                "body": body,
                "consideration_label": consideration_label,
                "consideration": consideration,
                "evidence": {
                    "span_years_label": evidence.get("span_years_label"),
                    "phase_label": evidence.get("phase_label"),
                    "overall_trajectory": overall_trajectory,
                    "recent_position": recent_position,
                    "recent_detail_pattern": recent_detail_pattern,
                    "recent_monthly_period_label": evidence.get("recent_monthly_period_label"),
                    "recent_monthly_total": evidence.get("recent_monthly_total"),
                    "rolling_3y_blocks": list(evidence.get("rolling_3y_blocks") or []),
                "rolling_5y_blocks": list(evidence.get("rolling_5y_blocks") or []),
                "table_recent_count": table_recent_count,
                "table_recent_range_label": evidence.get("table_recent_range_label"),
                "stronger_run_label": evidence.get("stronger_run_label"),
                "stronger_run_min_count": evidence.get("stronger_run_min_count"),
                "stronger_run_max_count": evidence.get("stronger_run_max_count"),
                "stronger_run_mean": evidence.get("stronger_run_mean"),
                "stronger_run_latest_count": evidence.get("stronger_run_latest_count"),
                "stronger_run_gap_from_mean": evidence.get("stronger_run_gap_from_mean"),
                "recent_support_strength": evidence.get("recent_support_strength"),
                "volume_read_mode": evidence.get("volume_read_mode"),
            },
        }
        ],
    }


def _serialize_publication_article_type_window_summary(
    summary: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not isinstance(summary, dict):
        return None
    return {
        "window_id": str(summary.get("window_id") or "").strip() or None,
        "range_label": str(summary.get("range_label") or "").strip() or None,
        "total_count": max(0, int(summary.get("total_count") or 0)),
        "distinct_type_count": max(0, int(summary.get("distinct_type_count") or 0)),
        "top_labels": [str(label).strip() for label in (summary.get("top_labels") or []) if str(label).strip()],
        "top_count": max(0, int(summary.get("top_count") or 0)),
        "top_share_pct": _safe_float(summary.get("top_share_pct")),
        "second_label": str(summary.get("second_label") or "").strip() or None,
        "second_share_pct": _safe_float(summary.get("second_share_pct")),
        "ordered_labels": [str(label).strip() for label in (summary.get("ordered_labels") or []) if str(label).strip()],
    }


def _build_publication_article_type_over_time_evidence(*, user_id: str) -> dict[str, Any]:
    metrics = get_publication_top_metrics(user_id=user_id)
    tile = _resolve_tile_by_key(metrics, "this_year_vs_last") or {}
    if not tile:
        raise PublicationMetricsNotFoundError(
            "Total publications metric is unavailable for article-type-over-time insights."
        )
    drilldown = tile.get("drilldown") if isinstance(tile.get("drilldown"), dict) else {}
    as_of_date = _parse_iso_date(drilldown.get("as_of_date")) or _utcnow().date()
    publications = [
        dict(item) for item in (drilldown.get("publications") or []) if isinstance(item, dict)
    ]
    portfolio_context = _build_portfolio_context(metrics)
    publication_library = _build_publication_library_context(
        publications,
        as_of_date=as_of_date,
    )
    years_with_data = sorted(
        {
            year
            for raw_record in publications
            for year in [_safe_int(raw_record.get("year"))]
            if year is not None
        }
    )
    if not years_with_data:
        return {
            "metrics_status": "READY",
            "window_id": "all",
            "window_label": "All",
            "window_phrase": "across the full article-type section",
            "data_sources": tile.get("data_source") or [],
            "portfolio_context": portfolio_context,
            "publication_library": publication_library,
            "total_publications": 0,
            "first_publication_year": None,
            "last_publication_year": None,
            "span_years_label": None,
            "all_window": None,
            "five_year_window": None,
            "three_year_window": None,
            "one_year_window": None,
            "latest_window": None,
            "distinct_recent_windows": [],
            "full_record_mix_state": "no_data",
            "recent_window_change_state": "no_data",
            "recent_window_confidence": "no_data",
            "recent_breadth_direction": "unknown",
            "five_matches_all": True,
            "three_matches_all": True,
            "one_matches_all": True,
            "latest_year_is_partial": False,
            "latest_partial_year_label": None,
            "latest_window_total_count": 0,
            "as_of_date": as_of_date.isoformat(),
        }

    first_publication_year = years_with_data[0]
    last_publication_year = years_with_data[-1]
    full_years = list(range(first_publication_year, last_publication_year + 1))
    all_window = _build_publication_article_type_window_summary(
        publications=publications,
        full_years=full_years,
        window_id="all",
    )
    five_year_window = _build_publication_article_type_window_summary(
        publications=publications,
        full_years=full_years,
        window_id="5y",
    )
    three_year_window = _build_publication_article_type_window_summary(
        publications=publications,
        full_years=full_years,
        window_id="3y",
    )
    one_year_window = _build_publication_article_type_window_summary(
        publications=publications,
        full_years=full_years,
        window_id="1y",
    )
    all_window_serialized = _serialize_publication_article_type_window_summary(all_window)
    five_year_window_serialized = _serialize_publication_article_type_window_summary(
        five_year_window
    )
    three_year_window_serialized = _serialize_publication_article_type_window_summary(
        three_year_window
    )
    one_year_window_serialized = _serialize_publication_article_type_window_summary(
        one_year_window
    )
    distinct_recent_windows: list[dict[str, Any]] = []
    seen_range_labels: set[str] = set()
    all_range_label = (
        str(all_window_serialized.get("range_label") or "").strip()
        if isinstance(all_window_serialized, dict)
        else ""
    )
    for summary in (
        five_year_window_serialized,
        three_year_window_serialized,
        one_year_window_serialized,
    ):
        if not isinstance(summary, dict):
            continue
        range_label = str(summary.get("range_label") or "").strip()
        if not range_label or range_label == all_range_label or range_label in seen_range_labels:
            continue
        distinct_recent_windows.append(summary)
        seen_range_labels.add(range_label)
    latest_window = (
        one_year_window_serialized
        or three_year_window_serialized
        or five_year_window_serialized
        or all_window_serialized
    )
    latest_year_is_partial = bool(
        last_publication_year == as_of_date.year
        and (as_of_date.month < 12 or as_of_date.day < 31)
    )
    latest_partial_year_label = (
        f"{last_publication_year} (through {_format_insight_date(as_of_date)})"
        if latest_year_is_partial
        else None
    )
    recent_windows_shift_leader = any(
        not _same_article_type_leader_set(summary, all_window_serialized)
        for summary in distinct_recent_windows
    )
    all_comparable_windows_keep_leader = all(
        _same_article_type_leader_set(summary, all_window_serialized)
        for summary in distinct_recent_windows
    )
    five_matches_all = _same_article_type_leader_set(
        five_year_window_serialized, all_window_serialized
    )
    three_matches_all = _same_article_type_leader_set(
        three_year_window_serialized, all_window_serialized
    )
    one_matches_all = _same_article_type_leader_set(
        one_year_window_serialized, all_window_serialized
    )
    all_top_labels = (
        list(all_window_serialized.get("top_labels") or [])
        if isinstance(all_window_serialized, dict)
        else []
    )
    all_top_share_pct = (
        _safe_float(all_window_serialized.get("top_share_pct"))
        if isinstance(all_window_serialized, dict)
        else None
    )
    latest_top_share_pct = (
        _safe_float(latest_window.get("top_share_pct"))
        if isinstance(latest_window, dict)
        else None
    )
    all_distinct_type_count = (
        max(0, int(all_window_serialized.get("distinct_type_count") or 0))
        if isinstance(all_window_serialized, dict)
        else 0
    )
    latest_distinct_type_count = (
        max(0, int(latest_window.get("distinct_type_count") or 0))
        if isinstance(latest_window, dict)
        else 0
    )
    latest_window_total_count = (
        max(0, int(latest_window.get("total_count") or 0))
        if isinstance(latest_window, dict)
        else 0
    )
    if not all_window_serialized or max(0, int(all_window_serialized.get("total_count") or 0)) <= 0:
        full_record_mix_state = "no_data"
    elif len(all_top_labels) > 1:
        full_record_mix_state = "tied_lead"
    elif all_top_share_pct is not None and all_top_share_pct >= 60:
        full_record_mix_state = "strong_anchor"
    elif all_top_share_pct is not None and all_top_share_pct >= 45:
        full_record_mix_state = "anchored"
    else:
        full_record_mix_state = "mixed"
    if not distinct_recent_windows:
        recent_window_change_state = "short_record"
    elif five_matches_all and not three_matches_all and not one_matches_all:
        recent_window_change_state = "late_leader_shift"
    elif recent_windows_shift_leader:
        recent_window_change_state = "leader_shift"
    elif (
        latest_top_share_pct is not None
        and all_top_share_pct is not None
        and all_comparable_windows_keep_leader
        and latest_top_share_pct >= all_top_share_pct + 12.0
    ):
        recent_window_change_state = "same_leader_more_concentrated"
    elif one_matches_all and latest_distinct_type_count < all_distinct_type_count:
        recent_window_change_state = "same_leader_narrower"
    elif latest_distinct_type_count > all_distinct_type_count:
        recent_window_change_state = "broader_recent"
    else:
        recent_window_change_state = "stable_anchor"
    if latest_window_total_count <= 3:
        recent_window_confidence = "too_thin"
    elif latest_year_is_partial:
        recent_window_confidence = "partial_current_year"
    elif latest_window_total_count <= 5:
        recent_window_confidence = "thin"
    else:
        recent_window_confidence = "supported"
    if latest_distinct_type_count > all_distinct_type_count:
        recent_breadth_direction = "broader"
    elif latest_distinct_type_count < all_distinct_type_count:
        recent_breadth_direction = "narrower"
    else:
        recent_breadth_direction = "similar"
    return {
        "metrics_status": "READY",
        "window_id": "all",
        "window_label": "All",
        "window_phrase": "across the full article-type section",
        "data_sources": tile.get("data_source") or [],
        "portfolio_context": portfolio_context,
        "publication_library": publication_library,
        "total_publications": max(
            0, int((all_window_serialized or {}).get("total_count") or len(publications))
        ),
        "first_publication_year": first_publication_year,
        "last_publication_year": last_publication_year,
        "span_years_label": _format_publication_year_range(
            first_publication_year, last_publication_year
        ),
        "all_window": all_window_serialized,
        "five_year_window": five_year_window_serialized,
        "three_year_window": three_year_window_serialized,
        "one_year_window": one_year_window_serialized,
        "latest_window": latest_window,
        "distinct_recent_windows": distinct_recent_windows,
        "full_record_mix_state": full_record_mix_state,
        "recent_window_change_state": recent_window_change_state,
        "recent_window_confidence": recent_window_confidence,
        "recent_breadth_direction": recent_breadth_direction,
        "five_matches_all": five_matches_all,
        "three_matches_all": three_matches_all,
        "one_matches_all": one_matches_all,
        "latest_year_is_partial": latest_year_is_partial,
        "latest_partial_year_label": latest_partial_year_label,
        "latest_window_total_count": latest_window_total_count,
        "as_of_date": as_of_date.isoformat(),
    }


def _build_publication_mix_prompt_brief(
    evidence: dict[str, Any], *, mix_name: str
) -> dict[str, Any]:
    full_record_read = _build_publication_mix_full_record_clause(
        evidence,
        mix_name=mix_name,
    )
    recent_window_summary = _build_publication_mix_recent_clause(
        evidence,
        mix_name=mix_name,
    )
    note_label, note_text = _build_publication_mix_consideration(
        evidence,
        mix_name=mix_name,
    )
    return {
        "full_record_summary": full_record_read,
        "recent_window_summary": recent_window_summary,
        "preferred_evidence_order": "full span first, then 5-year and 3-year windows, with the newest 1-year slice only as support or caution when it is thin",
        "avoid_stock_phrases": [
            "anchors the full record",
            "the record",
            "recent signal",
            "latest view",
            "centre of gravity",
            "this read",
            "soften",
        ],
        "suggested_follow_on": {
            "label": note_label,
            "text": note_text,
        }
        if note_label and note_text
        else None,
    }


def _build_publication_mix_extra_guidance(mix_name: str) -> str:
    return (
        f"Treat this as a composition question about {mix_name}, not a rank-order summary.\n"
        "Base the main interpretation on the full span plus the 5-year and 3-year windows unless the history is too short to do that sensibly.\n"
        "Use the newest 1-year slice only to confirm or qualify the pattern unless it has enough volume to stand on its own.\n"
        "Avoid stock phrases such as 'anchors the full record', 'recent signal', 'latest view', 'this read', or 'centre of gravity'.\n"
        "Avoid leaning on the word 'record' when 'full span', direct year ranges, or the named types are clearer.\n"
        "Keep headlines, note labels, and common-noun category names in sentence case unless they begin a sentence.\n"
        "Name the relevant types directly and explain whether the newer mix looks steady, more contested, broader, or genuinely shifted.\n"
    )


def _preferred_publication_mix_window(evidence: dict[str, Any]) -> dict[str, Any]:
    three_year_window = (
        evidence.get("three_year_window")
        if isinstance(evidence.get("three_year_window"), dict)
        else {}
    )
    five_year_window = (
        evidence.get("five_year_window")
        if isinstance(evidence.get("five_year_window"), dict)
        else {}
    )
    one_year_window = (
        evidence.get("one_year_window")
        if isinstance(evidence.get("one_year_window"), dict)
        else {}
    )
    for window in (three_year_window, five_year_window, one_year_window):
        if max(0, int(window.get("total_count") or 0)) > 0:
            return window
    latest_window = evidence.get("latest_window")
    return latest_window if isinstance(latest_window, dict) else {}


def _select_publication_mix_change_window(
    evidence: dict[str, Any], *, change_kind: Literal["concentration", "narrower", "broader"]
) -> dict[str, Any] | None:
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    recent_window_confidence = str(
        evidence.get("recent_window_confidence") or ""
    ).strip()
    all_top_labels = sorted(str(label).strip() for label in (all_window.get("top_labels") or []) if str(label).strip())
    all_top_share_pct = _safe_float(all_window.get("top_share_pct"))
    all_distinct_type_count = max(0, int(all_window.get("distinct_type_count") or 0))
    candidates = []
    for window in (
        evidence.get("three_year_window"),
        evidence.get("five_year_window"),
        evidence.get("one_year_window"),
    ):
        if not isinstance(window, dict):
            continue
        window_total = max(0, int(window.get("total_count") or 0))
        if window_total <= 0:
            continue
        if (
            str(window.get("window_id") or "").strip() == "1y"
            and recent_window_confidence in {"too_thin", "thin", "partial_current_year"}
        ):
            continue
        window_top_labels = sorted(
            str(label).strip() for label in (window.get("top_labels") or []) if str(label).strip()
        )
        window_top_share_pct = _safe_float(window.get("top_share_pct"))
        window_distinct_type_count = max(0, int(window.get("distinct_type_count") or 0))
        same_leader = window_top_labels == all_top_labels
        if change_kind == "concentration":
            if (
                same_leader
                and all_top_share_pct is not None
                and window_top_share_pct is not None
                and window_top_share_pct > all_top_share_pct + 3.0
            ):
                candidates.append(window)
        elif change_kind == "narrower":
            if same_leader and window_distinct_type_count < all_distinct_type_count:
                candidates.append(window)
        elif change_kind == "broader":
            if window_distinct_type_count > all_distinct_type_count:
                candidates.append(window)
    return candidates[0] if candidates else None


def _build_publication_mix_headline(
    evidence: dict[str, Any], *, mixed_label: str, stable_label: str
) -> str:
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    full_record_mix_state = str(evidence.get("full_record_mix_state") or "").strip()
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    preferred_window = _preferred_publication_mix_window(evidence)
    all_leader = _format_period_list(list(all_window.get("top_labels") or []))
    preferred_leader = _format_period_list(list(preferred_window.get("top_labels") or []))

    if recent_window_change_state == "short_record":
        return "Early composition read"
    if recent_window_change_state in {"late_leader_shift", "leader_shift"}:
        if preferred_leader and all_leader and preferred_leader != all_leader:
            return f"{preferred_leader} is gaining ground"
        return "Recent mix is shifting"
    if recent_window_change_state in {
        "same_leader_more_concentrated",
        "same_leader_narrower",
    }:
        if all_leader:
            return f"{all_leader} takes more of the newer share"
        return "Recent mix is tighter"
    if recent_window_change_state == "broader_recent":
        return "Recent mix is broader"
    if full_record_mix_state in {"mixed", "tied_lead"}:
        return mixed_label
    if all_leader:
        return f"{all_leader} remains the main strand"
    return stable_label


def _build_publication_mix_full_record_clause(
    evidence: dict[str, Any], *, mix_name: str
) -> str:
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    span_years_label = str(evidence.get("span_years_label") or "").strip() or "the full span"
    top_labels = [str(label).strip() for label in (all_window.get("top_labels") or []) if str(label).strip()]
    if not top_labels:
        return f"{mix_name.capitalize()} data is not available yet."
    top_label_text = _format_period_list(top_labels)
    top_count = max(0, int(all_window.get("top_count") or 0))
    total_count = max(0, int(all_window.get("total_count") or 0))
    top_share_pct = _safe_float(all_window.get("top_share_pct"))
    second_label = str(all_window.get("second_label") or "").strip() or None
    second_share_pct = _safe_float(all_window.get("second_share_pct"))
    distinct_type_count = max(0, int(all_window.get("distinct_type_count") or 0))
    if len(top_labels) > 1:
        return (
            f"Across {span_years_label}, {top_label_text} are joint largest, "
            f"with {top_count} publications each, so the long-run mix is shared rather than led by one type."
        )
    if top_share_pct is not None and top_share_pct < 45 and second_label and second_share_pct is not None:
        return (
            f"Across {span_years_label}, the mix stays fairly spread: {top_label_text} is largest at "
            f"{round(top_share_pct)}%, with {second_label} close behind at {round(second_share_pct)}% "
            f"across {distinct_type_count} categories."
        )
    secondary_clause = (
        f", with {second_label} next at {round(second_share_pct)}%"
        if second_label and second_share_pct is not None
        else ""
    )
    return (
        f"Across {span_years_label}, {top_label_text} makes up {round(top_share_pct or 0)}% of publications "
        f"({top_count} of {total_count}){secondary_clause}."
    )


def _build_publication_mix_recent_clause(
    evidence: dict[str, Any], *, mix_name: str
) -> str:
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    five_year_window = (
        evidence.get("five_year_window") if isinstance(evidence.get("five_year_window"), dict) else {}
    )
    three_year_window = (
        evidence.get("three_year_window") if isinstance(evidence.get("three_year_window"), dict) else {}
    )
    one_year_window = (
        evidence.get("one_year_window") if isinstance(evidence.get("one_year_window"), dict) else {}
    )
    preferred_window = _preferred_publication_mix_window(evidence)
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    all_leader = _format_period_list(list(all_window.get("top_labels") or []))
    preferred_leader = _format_period_list(list(preferred_window.get("top_labels") or []))
    preferred_label = str(preferred_window.get("range_label") or "").strip() or "the shorter recent window"
    three_label = str(three_year_window.get("range_label") or "").strip() or preferred_label
    five_label = str(five_year_window.get("range_label") or "").strip() or "the broader recent window"
    preferred_top_share_pct = _safe_float(preferred_window.get("top_share_pct"))
    all_top_share_pct = _safe_float(all_window.get("top_share_pct"))
    preferred_second_label = str(preferred_window.get("second_label") or "").strip() or None
    preferred_second_share_pct = _safe_float(preferred_window.get("second_share_pct"))
    preferred_distinct_type_count = max(0, int(preferred_window.get("distinct_type_count") or 0))
    all_distinct_type_count = max(0, int(all_window.get("distinct_type_count") or 0))
    latest_window_total_count = max(0, int(evidence.get("latest_window_total_count") or 0))

    if recent_window_change_state == "short_record":
        return (
            f"The 5-year and 3-year cuts still overlap too heavily with the full span to call a settled change in {mix_name}."
        )
    if recent_window_change_state == "late_leader_shift":
        return (
            f"The clearer change sits in {three_label}: {preferred_leader or 'a different type'} now carries more of the mix there, "
            f"while {five_label} still looks closer to the longer-run ordering led by {all_leader}."
        )
    if recent_window_change_state == "leader_shift":
        if preferred_second_label and preferred_second_share_pct is not None:
            return (
                f"The recent change is broader than a single tie-break: in {preferred_label}, {preferred_leader or 'the newer leader'} leads, "
                f"with {preferred_second_label} still substantial at {round(preferred_second_share_pct)}%."
            )
        return (
            f"In {preferred_label}, the ordering now differs from the longer run, so the recent {mix_name} looks genuinely shifted rather than merely compressed."
        )
    if recent_window_change_state == "same_leader_more_concentrated":
        concentration_window = _select_publication_mix_change_window(
            evidence,
            change_kind="concentration",
        )
        concentration_label = (
            str(concentration_window.get("range_label") or "").strip()
            if isinstance(concentration_window, dict)
            else None
        )
        concentration_top_share_pct = (
            _safe_float(concentration_window.get("top_share_pct"))
            if isinstance(concentration_window, dict)
            else None
        )
        if (
            concentration_window
            and concentration_label
            and concentration_top_share_pct is not None
            and all_top_share_pct is not None
        ):
            return (
                f"The main recent change is concentration rather than replacement: {all_leader} rises from "
                f"{round(all_top_share_pct)}% across the full span to {round(concentration_top_share_pct)}% in {concentration_label}, "
                "while smaller categories recede."
            )
        return (
            "The 5-year and 3-year windows still sit close to the broader mix. The only stronger concentration appears in the newest rolling year, which is too small to carry the interpretation by itself."
        )
    if recent_window_change_state == "same_leader_narrower":
        narrower_window = _select_publication_mix_change_window(
            evidence,
            change_kind="narrower",
        )
        narrower_label = (
            str(narrower_window.get("range_label") or "").strip()
            if isinstance(narrower_window, dict)
            else None
        )
        narrower_distinct_type_count = (
            max(0, int(narrower_window.get("distinct_type_count") or 0))
            if isinstance(narrower_window, dict)
            else None
        )
        if narrower_window and narrower_label and narrower_distinct_type_count is not None:
            return (
                f"The main recent change is narrowing rather than replacement: {all_leader} still leads, but {narrower_label} contains "
                f"{narrower_distinct_type_count} categories instead of {all_distinct_type_count}."
            )
        return (
            "The 5-year and 3-year windows still look close to the broader mix. Only the newest rolling year narrows, and it is too small to treat as a reset."
        )
    if recent_window_change_state == "broader_recent":
        broader_window = _select_publication_mix_change_window(
            evidence,
            change_kind="broader",
        )
        broader_label = (
            str(broader_window.get("range_label") or "").strip()
            if isinstance(broader_window, dict)
            else None
        )
        broader_distinct_type_count = (
            max(0, int(broader_window.get("distinct_type_count") or 0))
            if isinstance(broader_window, dict)
            else None
        )
        broader_second_label = (
            str(broader_window.get("second_label") or "").strip() or None
            if isinstance(broader_window, dict)
            else None
        )
        broader_second_share_pct = (
            _safe_float(broader_window.get("second_share_pct"))
            if isinstance(broader_window, dict)
            else None
        )
        if broader_window and broader_label and broader_distinct_type_count is not None:
            broader_clause = (
                f", with {broader_second_label} also taking a meaningful share"
                if broader_second_label and broader_second_share_pct is not None
                else ""
            )
            return (
                f"The recent mix is broader than the long-run pattern: {broader_label} contains "
                f"{broader_distinct_type_count} categories instead of {all_distinct_type_count}{broader_clause}."
            )
        broader_clause = (
            f", with {preferred_second_label} also taking a meaningful share"
            if preferred_second_label and preferred_second_share_pct is not None
            else ""
        )
        return (
            f"The recent mix is broader than the long-run pattern: {preferred_label} contains "
            f"{preferred_distinct_type_count} categories instead of {all_distinct_type_count}{broader_clause}."
        )
    thin_suffix = (
        f" The newest rolling year contains only {latest_window_total_count} publication{'s' if latest_window_total_count != 1 else ''}, so it is best used as a check on that read."
        if latest_window_total_count <= 3
        else ""
    )
    return (
        f"The 5-year and 3-year windows stay close to the longer-run ordering, so the recent {mix_name} looks more persistent than remade.{thin_suffix}"
    )


def _build_publication_mix_consideration(
    evidence: dict[str, Any], *, mix_name: str
) -> tuple[str | None, str | None]:
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    latest_window_total_count = max(0, int(evidence.get("latest_window_total_count") or 0))
    latest_partial_year_label = str(evidence.get("latest_partial_year_label") or "").strip() or None
    if latest_window_total_count <= 3:
        partial_clause = (
            f" and includes {latest_partial_year_label}"
            if latest_partial_year_label
            else ""
        )
        return (
            "Confidence",
            f"The newest rolling year only contains {latest_window_total_count} publication{'s' if latest_window_total_count != 1 else ''}{partial_clause}, so it should confirm the 5-year and 3-year pattern, not override it.",
        )
    if latest_partial_year_label:
        return (
            "Confidence",
            f"The newest rolling year includes {latest_partial_year_label}, so treat it as an early check on the broader {mix_name}, not a reset on its own.",
        )
    if recent_window_change_state in {"late_leader_shift", "leader_shift"}:
        return (
            "What to watch",
            "If the same ordering persists beyond the shortest rolling slice, this starts to look like a real shift rather than a recent lean.",
        )
    if recent_window_change_state in {
        "same_leader_more_concentrated",
        "same_leader_narrower",
    }:
        return (
            "What to watch",
            "If smaller categories stay quieter for another cycle, this becomes a genuine concentration story rather than normal variation.",
        )
    if recent_window_change_state == "broader_recent":
        return (
            "What to watch",
            "If those added categories keep appearing across the next rolling window, the mix is broadening rather than just having one unusually diverse year.",
        )
    return (None, None)


def _build_publication_article_type_over_time_headline(evidence: dict[str, Any]) -> str:
    return _build_publication_mix_headline(
        evidence,
        mixed_label="Article mix is shared",
        stable_label="Article mix is stable",
    )


def _build_publication_article_type_over_time_full_record_clause(
    evidence: dict[str, Any]
) -> str:
    return _build_publication_mix_full_record_clause(
        evidence,
        mix_name="article types",
    )


def _build_publication_article_type_over_time_recent_clause(
    evidence: dict[str, Any]
) -> str:
    return _build_publication_mix_recent_clause(
        evidence,
        mix_name="article types",
    )


def _build_publication_article_type_over_time_fallback_payload(
    evidence: dict[str, Any]
) -> dict[str, Any]:
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    if max(0, int(all_window.get("total_count") or 0)) <= 0:
        body = "There is not yet enough article-type data to interpret how your mix changes over time."
        return {
            "overall_summary": body,
            "sections": [
                {
                    "key": "publication_article_type_over_time",
                    "title": "Type of articles published over time",
                    "headline": "No mix read",
                    "body": body,
                    "consideration_label": "Coverage",
                    "consideration": "Add article-type metadata or more dated publications before reading this section as a stable pattern.",
                    "evidence": {
                        "full_record_mix_state": evidence.get("full_record_mix_state"),
                        "recent_window_change_state": evidence.get("recent_window_change_state"),
                        "recent_window_confidence": evidence.get("recent_window_confidence"),
                    },
                }
            ],
        }

    body = (
        f"{_build_publication_article_type_over_time_full_record_clause(evidence)} "
        f"{_build_publication_article_type_over_time_recent_clause(evidence)}"
    ).strip()
    consideration_label, consideration = _build_publication_mix_consideration(
        evidence,
        mix_name="article types",
    )
    return {
        "overall_summary": body,
        "sections": [
            {
                "key": "publication_article_type_over_time",
                "title": "Type of articles published over time",
                "headline": _build_publication_article_type_over_time_headline(evidence),
                "body": body,
                "consideration_label": consideration_label,
                "consideration": consideration,
                "evidence": {
                    "span_years_label": evidence.get("span_years_label"),
                    "full_record_mix_state": evidence.get("full_record_mix_state"),
                    "recent_window_change_state": evidence.get("recent_window_change_state"),
                    "recent_window_confidence": evidence.get("recent_window_confidence"),
                    "recent_breadth_direction": evidence.get("recent_breadth_direction"),
                    "all_window": evidence.get("all_window"),
                    "five_year_window": evidence.get("five_year_window"),
                    "three_year_window": evidence.get("three_year_window"),
                    "one_year_window": evidence.get("one_year_window"),
                    "latest_year_is_partial": evidence.get("latest_year_is_partial"),
                    "latest_partial_year_label": evidence.get("latest_partial_year_label"),
                },
            }
        ],
    }


def _build_publication_insight_prompt_preamble(
    *, request_line: str, allow_wider_context: bool = False
) -> str:
    wider_context_line = (
        "Use wider portfolio context only when it materially sharpens the interpretation, and fold it into the main reading rather than tacking it on.\n"
        if allow_wider_context
        else "Do not mention citations, journal prestige, collaboration, field percentiles, or authorship unless the section instructions explicitly allow wider portfolio context.\n"
    )
    return (
        "You are Publication insights agent for a research analytics product.\n"
        "Return JSON only, with no markdown.\n"
        f"{request_line}\n"
        "Write for a highly capable academic reader who wants interpretation, not reassurance.\n"
        "Write like a sharp human analyst: precise, varied, and concrete rather than templated.\n"
        "Use only the evidence provided. Do not invent causes, mechanisms, advice, or future outcomes.\n"
        "Lead with the structural story, not the metric label.\n"
        "Prefer the fewest concrete numbers that materially change the interpretation.\n"
        "Choose comparisons that earn their place: earlier versus later, established leader versus challenger, broad versus concentrated, persistent versus provisional.\n"
        "If a short recent window is thin, demote it to a qualifier rather than letting it carry the main claim.\n"
        "Do not narrate the interface or restate obvious section labels, charts, tables, toggles, or controls.\n"
        "Avoid canned phrases such as 'this read', 'reads as', 'soften', 'softening', 'softer', 'this means', 'based on your metrics', or 'over time' in place of analysis.\n"
        "Use sentence case in headlines and note labels. Do not add random capital letters for emphasis.\n"
        "Write to the response shape without sounding boxed in, templated, or synthetic.\n"
        f"{wider_context_line}"
        "Write directly to the user in plain English.\n"
    )


def _build_publication_insight_slot_guidance(*, multi_section: bool) -> str:
    body_guidance = (
        "Each body should usually be 1 to 3 sentences and roughly 30 to 70 words, unless the evidence genuinely calls for a little less or more.\n"
        if multi_section
        else "Body should usually be 2 to 4 sentences and roughly 45 to 90 words, unless the evidence genuinely calls for a little less or more.\n"
    )
    return (
        "The response shape maps to UI slots, not a checklist: an optional overall summary, a headline, a body, and optional supporting blocks.\n"
        "overall_summary is optional and should usually be one crisp sentence, roughly 12 to 30 words, only when it adds value beyond the section bodies.\n"
        "Headline should be a short non-generic phrase, usually 2 to 6 words.\n"
        + body_guidance
        + "Supporting blocks are optional. Most sections need none or just one.\n"
        "Use a paragraph block for one extra analytic move, or a callout block for a caveat, confidence qualifier, or next angle.\n"
        "If no supporting block helps, omit blocks entirely.\n"
        "If you include a callout block, its label should stay brief and specific, and its text should usually be 1 or 2 sentences, roughly 12 to 40 words.\n"
    )


def _build_publication_section_prompt(
    *,
    request_line: str,
    section_key: str,
    section_question: str,
    evidence_payload: dict[str, Any],
    allow_wider_context: bool,
    extra_guidance: str | None = None,
) -> str:
    evidence_json = json.dumps(evidence_payload, ensure_ascii=True, default=str)
    return (
        _build_publication_insight_prompt_preamble(
            request_line=request_line,
            allow_wider_context=allow_wider_context,
        )
        + f"Section question: {section_question}\n"
        "Use one shared publication-insight reasoning style: find the deepest supported insight for this question, then present it clearly.\n"
        "You are given evidence layers named portfolio_context, publication_library, section_data, and optional analysis_brief, confidence_flags, or ui_context.\n"
        "publication_library contains compact whole-record library context rather than a record-by-record dump.\n"
        "Use the whole library when it sharpens the interpretation, but stay focused on the section question.\n"
        "Treat analysis_brief as a starting point, not a script. You may go beyond it if the raw evidence supports a stronger insight.\n"
        "Treat ui_context as the section's current hover or explainer copy: useful context for what the section is trying to show, but not a script to paraphrase.\n"
        "Choose the evidence that matters most. Do not force every metric into the body.\n"
        "Prefer the fewest concrete numbers that materially change the interpretation.\n"
        "Do not define metrics back to the user unless that definition is necessary for the insight.\n"
        "Do not narrate the interface or restate obvious labels, charts, tables, toggles, or controls.\n"
        "Return one section only. Use compact, high-value language for a highly capable academic reader.\n"
        "Avoid template transitions or stock analyst jargon; the prose should feel written, not generated.\n"
        + _build_publication_insight_slot_guidance(multi_section=False)
        + (f"{extra_guidance.rstrip()}\n" if extra_guidance else "")
        + "Schema:\n"
        "{\n"
        '  "overall_summary": "optional concise summary sentence; omit or leave empty when it adds no value",\n'
        '  "sections": [\n'
        "    {\n"
        f'      "key": "{section_key}",\n'
        '      "headline": "short non-generic phrase",\n'
        '      "body": "main analysis in natural prose",\n'
        '      "blocks": [\n'
        '        { "kind": "paragraph", "text": "optional extra analytic paragraph" },\n'
        '        { "kind": "callout", "label": "optional brief label", "text": "optional caveat, confidence note, or next angle" }\n'
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}\n"
        f"Return the requested single section: {section_key}.\n"
        f"Evidence: {evidence_json}\n"
    )


def _build_publication_section_evidence_payload(
    evidence: dict[str, Any],
    *,
    analysis_brief: dict[str, Any] | None = None,
    confidence_flags: dict[str, Any] | None = None,
    ui_context: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "portfolio_context": (
            evidence.get("portfolio_context")
            if isinstance(evidence.get("portfolio_context"), dict)
            else {}
        ),
        "publication_library": _compact_publication_library_for_section_prompt(
            evidence.get("publication_library")
            if isinstance(evidence.get("publication_library"), dict)
            else {}
        ),
        "section_data": {
            key: value
            for key, value in evidence.items()
            if key not in {"portfolio_context", "publication_library", "ui_context"}
        },
    }
    if analysis_brief:
        payload["analysis_brief"] = analysis_brief
    if confidence_flags:
        payload["confidence_flags"] = confidence_flags
    if str(ui_context or "").strip():
        payload["ui_context"] = str(ui_context).strip()
    return payload


def _build_publication_production_phase_system_prompt() -> str:
    return (
        "You are Publication insights agent for a research analytics product.\n"
        "You are writing the Production Phase insight only.\n"
        "Decide one phase only.\n"
        "Available phase labels:\n"
        "- early build: a short but growing record that is not yet established.\n"
        "- accelerating: the full timeline shows strengthening output that the latest complete years still support.\n"
        "- established expansion: a sustained high-output range is present across the established record.\n"
        "- established but concentrated: the record is established, but its strength depends on a narrower cluster of peak years or concentrated highs.\n"
        "- intermittent: breaks in continuity materially shape the record.\n"
        "- plateauing: an earlier rise or stronger band is no longer being sustained, and rolling pace now sits below that higher run.\n"
        "- reactivated: a later recovery follows an earlier lull or broken run.\n"
        "Use the full publication span first, then use rolling pace to show whether that stronger run is still being sustained.\n"
        "If rolling pace fields are available, treat them as the main recent evidence: last 12 months, trailing multi-year pace, and the prior period pace.\n"
        "Do not anchor the read on Jan-Dec buckets when rolling pace is available.\n"
        "Use complete-year peaks or the latest complete year only when they materially explain where the rolling pace sits in the larger arc.\n"
        "Use the fewest facts that materially change the interpretation, and keep numbers sparse.\n"
        "Lead with the structural story, not metric names.\n"
        "Treat thin recent windows or low-confidence signals as qualifiers, not as the main claim.\n"
        "Use only the evidence in the user message. Do not speculate about causes, advice, or future outcomes.\n"
        "Do not narrate the interface.\n"
        "Do not mention citations, prestige, collaboration, field percentiles, or authorship.\n"
        "analysis_brief and ui_context may appear in the evidence. Use them as context, not as script text to paraphrase.\n"
        "Generic phase language is not enough unless you make it concrete immediately.\n"
        "Write in plain English for a highly capable academic reader.\n"
        "Return content that fits the provided schema exactly and use sentence case.\n"
        "Keep the headline compact and non-generic. Keep the body to the clearest 2 to 4 sentences.\n"
        "Supporting blocks are optional, and you may return at most one. Use it only for a confidence note or what would change the read.\n"
    )


def _publication_production_phase_text_config() -> dict[str, Any]:
    return {
        "format": {
            "type": "json_schema",
            "name": PUBLICATION_PRODUCTION_PHASE_SCHEMA_NAME,
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "overall_summary": {
                        "anyOf": [{"type": "string"}, {"type": "null"}]
                    },
                    "sections": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "key": {
                                    "type": "string",
                                    "const": "publication_production_phase",
                                },
                                "phase": {
                                    "type": "string",
                                    "enum": list(PUBLICATION_PRODUCTION_PHASE_OPTIONS),
                                },
                                "headline": {"type": "string"},
                                "body": {"type": "string"},
                                "blocks": {
                                    "type": "array",
                                    "maxItems": 1,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "properties": {
                                            "kind": {
                                                "type": "string",
                                                "enum": ["paragraph", "callout"],
                                            },
                                            "label": {
                                                "anyOf": [
                                                    {"type": "string"},
                                                    {"type": "null"},
                                                ]
                                            },
                                            "text": {"type": "string"},
                                        },
                                        "required": ["kind", "label", "text"],
                                    },
                                },
                            },
                            "required": ["key", "phase", "headline", "body", "blocks"],
                        },
                    },
                },
                "required": ["overall_summary", "sections"],
            },
        }
    }


def _build_publication_production_phase_messages(
    evidence: dict[str, Any],
) -> list[dict[str, str]]:
    analysis_brief = _build_publication_production_phase_prompt_brief(evidence)
    evidence_payload = _build_publication_section_evidence_payload(
        evidence,
        analysis_brief=analysis_brief,
        ui_context=str(evidence.get("ui_context") or "").strip() or None,
        confidence_flags={
            "phase_confidence_low": evidence.get("phase_confidence_low"),
            "current_pace_signal": evidence.get("current_pace_signal"),
        },
    )
    evidence_json = json.dumps(evidence_payload, ensure_ascii=True, default=str)
    return [
        {"role": "system", "content": _build_publication_production_phase_system_prompt()},
        {"role": "user", "content": evidence_json},
    ]


def _build_publication_output_pattern_system_prompt() -> str:
    return (
        "You are Publication insights agent for a research analytics product.\n"
        "You are writing the Publication Output Pattern insight only.\n"
        "Decide one steadiness pattern only.\n"
        "Available pattern labels:\n"
        "- too early to read: there is not enough complete publication history to interpret steadiness yet.\n"
        "- continuous growth: output is uninterrupted and the stronger years build later from a quieter early base.\n"
        "- broadly stable: output sits in a broad working range without a dominant spike.\n"
        "- growth flattening: an earlier build or stronger run is no longer being sustained in the latest complete years.\n"
        "- output easing: recent years now sit below the earlier high-water mark or baseline.\n"
        "- peak-led record: one or a few peak years carry too much of the record.\n"
        "- burst-led output: output arrives in spikes or bursts rather than a broad even run.\n"
        "- interrupted pattern: gap years materially shape the record.\n"
        "- rebuilding output: later output is recovering after an earlier lull or break.\n"
        "- active across years: the record stays active across the span but does not resolve into a cleaner steadiness pattern.\n"
        "Use the full timeline first. Let recent windows lead only when they materially change the whole-record shape.\n"
        "Use the fewest facts that materially change the interpretation, and use no more than 3 numbers in total.\n"
        "Lead with the structural story, not metric names.\n"
        "Steadiness comes from continuity, concentration, timing of quiet versus strong years, and whether the record depends on isolated peaks.\n"
        "Treat thin recent windows, partial current-year signals, and low-confidence flags as qualifiers rather than the main claim.\n"
        "Use only the evidence in the user message. Do not speculate about causes, advice, or future outcomes.\n"
        "Do not narrate the interface.\n"
        "Do not mention citations, prestige, collaboration, field percentiles, or authorship.\n"
        "analysis_brief and ui_context may appear in the evidence. Use them as context, not as script text to paraphrase.\n"
        "Generic phrases such as 'consistent record', 'steady pattern', or 'output pattern' are not enough unless you make them concrete immediately.\n"
        "Prefer at least one concrete year or count when it materially anchors the shape, but keep the total to the fewest numbers that matter.\n"
        "If you mention the partial live year, name the actual year explicitly rather than saying only 'current year'.\n"
        "Write in plain English for a highly capable academic reader.\n"
        "Return content that fits the provided schema exactly and use sentence case.\n"
        "Keep the headline compact and non-generic. Keep the body to the clearest 2 to 4 sentences.\n"
        "Supporting blocks are optional, and you may return at most one. Use it only for why the pattern matters, a confidence note, or what would change the read.\n"
    )


def _publication_output_pattern_text_config() -> dict[str, Any]:
    return {
        "format": {
            "type": "json_schema",
            "name": PUBLICATION_OUTPUT_PATTERN_SCHEMA_NAME,
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "overall_summary": {
                        "anyOf": [{"type": "string"}, {"type": "null"}]
                    },
                    "sections": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "key": {
                                    "type": "string",
                                    "const": "publication_output_pattern",
                                },
                                "pattern": {
                                    "type": "string",
                                    "enum": list(PUBLICATION_OUTPUT_PATTERN_OPTIONS),
                                },
                                "headline": {"type": "string"},
                                "body": {"type": "string"},
                                "blocks": {
                                    "type": "array",
                                    "maxItems": 1,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "properties": {
                                            "kind": {
                                                "type": "string",
                                                "enum": ["paragraph", "callout"],
                                            },
                                            "label": {
                                                "anyOf": [
                                                    {"type": "string"},
                                                    {"type": "null"},
                                                ]
                                            },
                                            "text": {"type": "string"},
                                        },
                                        "required": ["kind", "label", "text"],
                                    },
                                },
                            },
                            "required": ["key", "pattern", "headline", "body", "blocks"],
                        },
                    },
                },
                "required": ["overall_summary", "sections"],
            },
        }
    }


def _build_publication_output_pattern_messages(
    evidence: dict[str, Any],
) -> list[dict[str, str]]:
    analysis_brief = _build_publication_output_pattern_prompt_brief(evidence)
    evidence_payload = _build_publication_section_evidence_payload(
        evidence,
        analysis_brief=analysis_brief,
        ui_context=str(evidence.get("ui_context") or "").strip() or None,
        confidence_flags={
            "phase_confidence_low": evidence.get("phase_confidence_low"),
            "includes_partial_year": evidence.get("includes_partial_year"),
        },
    )
    evidence_json = json.dumps(evidence_payload, ensure_ascii=True, default=str)
    return [
        {"role": "system", "content": _build_publication_output_pattern_system_prompt()},
        {"role": "user", "content": evidence_json},
    ]


def _build_publication_output_pattern_prompt(
    evidence: dict[str, Any],
) -> list[dict[str, str]]:
    return _build_publication_output_pattern_messages(evidence)


def _build_publication_production_phase_prompt(
    evidence: dict[str, Any],
) -> list[dict[str, str]]:
    return _build_publication_production_phase_messages(evidence)


def _build_publication_year_over_year_trajectory_system_prompt() -> str:
    return (
        "You are Publication insights agent for a research analytics product.\n"
        "You are writing the Year-over-year Trajectory insight only.\n"
        "Decide one trajectory only.\n"
        "Available trajectory labels:\n"
        "- expanding: later complete years continue to build above the earlier run.\n"
        "- stable: output varies, but the later complete years do not break clearly upward or downward.\n"
        "- contracting: a stronger earlier or middle-to-late run is no longer being sustained in the latest complete years.\n"
        "Use complete years first. Use rolling pace through the last completed month as recent context, and let it lead only if it materially changes the complete-year picture.\n"
        "If rolling pace evidence is available, make that comparison explicit in the body rather than leaving it implied.\n"
        "Use the fewest facts that materially change the interpretation, and use no more than 3 numbers in total.\n"
        "Lead with the structural story, not metric names.\n"
        "Treat thin recent windows and partial live-year signals as qualifiers rather than the main claim.\n"
        "Use only the evidence in the user message. Do not speculate about causes, advice, or future outcomes.\n"
        "Do not narrate the interface.\n"
        "Do not mention citations, prestige, collaboration, field percentiles, or authorship.\n"
        "analysis_brief and ui_context may appear in the evidence. ui_context may describe the currently viewed trajectory range or mode; use it as framing context, not as script text to paraphrase.\n"
        "Generic phrases such as 'the trajectory changed' or 'the run shifted' are not enough unless you make them concrete immediately.\n"
        "Write in plain English for a highly capable academic reader.\n"
        "Return content that fits the provided schema exactly and use sentence case.\n"
        "Keep the headline compact and non-generic. Keep the body to the clearest 2 to 4 sentences.\n"
        "Supporting blocks are optional, and you may return at most one. Use it only for a confidence note or one extra reading aid.\n"
    )


def _publication_year_over_year_trajectory_text_config() -> dict[str, Any]:
    return {
        "format": {
            "type": "json_schema",
            "name": PUBLICATION_YEAR_OVER_YEAR_TRAJECTORY_SCHEMA_NAME,
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "overall_summary": {
                        "anyOf": [{"type": "string"}, {"type": "null"}]
                    },
                    "sections": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "key": {
                                    "type": "string",
                                    "const": "publication_year_over_year_trajectory",
                                },
                                "trajectory": {
                                    "type": "string",
                                    "enum": list(
                                        PUBLICATION_YEAR_OVER_YEAR_TRAJECTORY_OPTIONS
                                    ),
                                },
                                "headline": {"type": "string"},
                                "body": {"type": "string"},
                                "blocks": {
                                    "type": "array",
                                    "maxItems": 1,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "properties": {
                                            "kind": {
                                                "type": "string",
                                                "enum": ["paragraph", "callout"],
                                            },
                                            "label": {
                                                "anyOf": [
                                                    {"type": "string"},
                                                    {"type": "null"},
                                                ]
                                            },
                                            "text": {"type": "string"},
                                        },
                                        "required": ["kind", "label", "text"],
                                    },
                                },
                            },
                            "required": [
                                "key",
                                "trajectory",
                                "headline",
                                "body",
                                "blocks",
                            ],
                        },
                    },
                },
                "required": ["overall_summary", "sections"],
            },
        }
    }


def _build_publication_year_over_year_trajectory_messages(
    evidence: dict[str, Any],
) -> list[dict[str, str]]:
    analysis_brief = _build_publication_year_over_year_trajectory_prompt_brief(
        evidence
    )
    evidence_payload = _build_publication_section_evidence_payload(
        evidence,
        analysis_brief=analysis_brief,
        ui_context=str(evidence.get("ui_context") or "").strip() or None,
        confidence_flags={
            "includes_partial_year": evidence.get("includes_partial_year"),
            "phase_confidence_low": evidence.get("phase_confidence_low"),
        },
    )
    evidence_json = json.dumps(evidence_payload, ensure_ascii=True, default=str)
    return [
        {
            "role": "system",
            "content": _build_publication_year_over_year_trajectory_system_prompt(),
        },
        {"role": "user", "content": evidence_json},
    ]


def _build_publication_year_over_year_trajectory_prompt(
    evidence: dict[str, Any],
) -> list[dict[str, str]]:
    return _build_publication_year_over_year_trajectory_messages(evidence)


def _build_publication_volume_over_time_prompt(evidence: dict[str, Any]) -> str:
    wider_context_hint = _build_publication_volume_context_sentence(evidence)
    recent_window_hint = _build_publication_volume_recent_clause(evidence)
    body_hint = _build_publication_volume_over_time_body(evidence)
    evidence_payload = _build_publication_section_evidence_payload(
        evidence,
        analysis_brief={
            "body_hint": body_hint,
            "recent_window_hint": recent_window_hint,
            "wider_context_hint": wider_context_hint,
        },
        ui_context=str(evidence.get("ui_context") or "").strip() or None,
        confidence_flags={
            "recent_support_strength": evidence.get("recent_support_strength"),
            "phase_confidence_low": evidence.get("phase_confidence_low"),
        },
    )
    return _build_publication_section_prompt(
        request_line="This request is for the Publication Volume Over Time insight.",
        section_key="publication_volume_over_time",
        section_question="How has publication volume changed, and why does it matter?",
        evidence_payload=evidence_payload,
        allow_wider_context=True,
    )


def _build_publication_mix_system_prompt(
    *, section_label: str, mix_name: str
) -> str:
    return (
        "You are Publication insights agent for a research analytics product.\n"
        f"You are writing the {section_label} insight only.\n"
        "Decide one mix pattern only.\n"
        "Available mix-pattern labels:\n"
        "- short_record: the 5-year and 3-year windows still overlap too heavily with the full span to call a settled change.\n"
        "- late_leader_shift: the shorter recent window changes the ordering, but the broader recent window still resembles the long-run mix.\n"
        "- leader_shift: recent windows show a genuine change in the leading type, not just a tighter version of the same ordering.\n"
        "- same_leader_more_concentrated: the same leader remains on top, but the newer windows give it materially more share.\n"
        "- same_leader_narrower: the same leader remains on top, but the newer windows narrow into fewer categories.\n"
        "- broader_recent: the newer windows spread across more categories than the long-run mix.\n"
        "- stable_anchor: the recent windows stay close to the full-record ordering.\n"
        "Start with the full span, then the 5-year and 3-year windows. Let the newest 1-year slice lead only when it materially changes the broader mix and has enough volume to stand up.\n"
        "Use the fewest facts that materially change the interpretation, and use no more than 3 numbers in total.\n"
        "Lead with the structural composition story, not metric names.\n"
        f"Name the relevant {mix_name} directly when they materially shape the interpretation.\n"
        "Treat thin or partial recent windows as qualifiers rather than the main claim.\n"
        "Use only the evidence in the user message. Do not speculate about causes, advice, or future outcomes.\n"
        "Do not narrate the interface.\n"
        "Do not mention citations, prestige, collaboration, field percentiles, or authorship.\n"
        "analysis_brief and ui_context may appear in the evidence. Use them as context, not as script text to paraphrase.\n"
        "Generic phrases such as 'stable mix', 'recent mix', 'latest view', or 'centre of gravity' are not enough unless you make them concrete immediately.\n"
        "Avoid repeating 'record' when 'full span', direct year ranges, or the named types are clearer.\n"
        "Write in plain English for a highly capable academic reader.\n"
        "Return content that fits the provided schema exactly and use sentence case.\n"
        "Keep the headline compact and non-generic. Keep the body to the clearest 2 to 4 sentences.\n"
        "Supporting blocks are optional, and you may return at most one. Use it only for a confidence note or what to watch.\n"
    )


def _build_publication_article_type_over_time_system_prompt() -> str:
    return _build_publication_mix_system_prompt(
        section_label="Type of Articles Published Over Time",
        mix_name="article types",
    )


def _build_publication_type_over_time_system_prompt() -> str:
    return _build_publication_mix_system_prompt(
        section_label="Type of Publications Published Over Time",
        mix_name="publication types",
    )


def _publication_mix_text_config(*, schema_name: str, section_key: str) -> dict[str, Any]:
    return {
        "format": {
            "type": "json_schema",
            "name": schema_name,
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "overall_summary": {
                        "anyOf": [{"type": "string"}, {"type": "null"}]
                    },
                    "sections": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "key": {"type": "string", "const": section_key},
                                "mix_pattern": {
                                    "type": "string",
                                    "enum": list(PUBLICATION_MIX_PATTERN_OPTIONS),
                                },
                                "headline": {"type": "string"},
                                "body": {"type": "string"},
                                "blocks": {
                                    "type": "array",
                                    "maxItems": 1,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "properties": {
                                            "kind": {
                                                "type": "string",
                                                "enum": ["paragraph", "callout"],
                                            },
                                            "label": {
                                                "anyOf": [
                                                    {"type": "string"},
                                                    {"type": "null"},
                                                ]
                                            },
                                            "text": {"type": "string"},
                                        },
                                        "required": ["kind", "label", "text"],
                                    },
                                },
                            },
                            "required": [
                                "key",
                                "mix_pattern",
                                "headline",
                                "body",
                                "blocks",
                            ],
                        },
                    },
                },
                "required": ["overall_summary", "sections"],
            },
        }
    }


def _publication_article_type_over_time_text_config() -> dict[str, Any]:
    return _publication_mix_text_config(
        schema_name=PUBLICATION_ARTICLE_TYPE_OVER_TIME_SCHEMA_NAME,
        section_key="publication_article_type_over_time",
    )


def _publication_type_over_time_text_config() -> dict[str, Any]:
    return _publication_mix_text_config(
        schema_name=PUBLICATION_TYPE_OVER_TIME_SCHEMA_NAME,
        section_key="publication_type_over_time",
    )


def _build_publication_mix_messages(
    evidence: dict[str, Any], *, mix_name: str, system_prompt: str
) -> list[dict[str, str]]:
    analysis_brief = _build_publication_mix_prompt_brief(
        evidence,
        mix_name=mix_name,
    )
    evidence_payload = _build_publication_section_evidence_payload(
        evidence,
        analysis_brief=analysis_brief,
        ui_context=str(evidence.get("ui_context") or "").strip() or None,
        confidence_flags={
            "recent_window_confidence": evidence.get("recent_window_confidence"),
            "latest_year_is_partial": evidence.get("latest_year_is_partial"),
        },
    )
    evidence_json = json.dumps(evidence_payload, ensure_ascii=True, default=str)
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": evidence_json},
    ]


def _build_publication_article_type_over_time_messages(
    evidence: dict[str, Any],
) -> list[dict[str, str]]:
    return _build_publication_mix_messages(
        evidence,
        mix_name="article types",
        system_prompt=_build_publication_article_type_over_time_system_prompt(),
    )


def _build_publication_article_type_over_time_prompt(
    evidence: dict[str, Any],
) -> list[dict[str, str]]:
    return _build_publication_article_type_over_time_messages(evidence)


def _build_publication_type_over_time_evidence(*, user_id: str) -> dict[str, Any]:
    metrics = get_publication_top_metrics(user_id=user_id)
    tile = _resolve_tile_by_key(metrics, "this_year_vs_last") or {}
    if not tile:
        raise PublicationMetricsNotFoundError(
            "Total publications metric is unavailable for publication-type-over-time insights."
        )
    drilldown = tile.get("drilldown") if isinstance(tile.get("drilldown"), dict) else {}
    as_of_date = _parse_iso_date(drilldown.get("as_of_date")) or _utcnow().date()
    publications = [
        dict(item) for item in (drilldown.get("publications") or []) if isinstance(item, dict)
    ]
    portfolio_context = _build_portfolio_context(metrics)
    publication_library = _build_publication_library_context(
        publications,
        as_of_date=as_of_date,
    )
    years_with_data = sorted(
        {
            year
            for raw_record in publications
            for year in [_safe_int(raw_record.get("year"))]
            if year is not None
        }
    )
    if not years_with_data:
        return {
            "metrics_status": "READY",
            "window_id": "all",
            "window_label": "All",
            "window_phrase": "across the full publication-type section",
            "data_sources": tile.get("data_source") or [],
            "portfolio_context": portfolio_context,
            "publication_library": publication_library,
            "total_publications": 0,
            "first_publication_year": None,
            "last_publication_year": None,
            "span_years_label": None,
            "all_window": None,
            "five_year_window": None,
            "three_year_window": None,
            "one_year_window": None,
            "latest_window": None,
            "distinct_recent_windows": [],
            "full_record_mix_state": "no_data",
            "recent_window_change_state": "no_data",
            "recent_window_confidence": "no_data",
            "recent_breadth_direction": "unknown",
            "five_matches_all": True,
            "three_matches_all": True,
            "one_matches_all": True,
            "latest_year_is_partial": False,
            "latest_partial_year_label": None,
            "latest_window_total_count": 0,
            "as_of_date": as_of_date.isoformat(),
        }

    first_publication_year = years_with_data[0]
    last_publication_year = years_with_data[-1]
    full_years = list(range(first_publication_year, last_publication_year + 1))
    all_window = _build_publication_type_window_summary(
        publications=publications,
        full_years=full_years,
        window_id="all",
    )
    five_year_window = _build_publication_type_window_summary(
        publications=publications,
        full_years=full_years,
        window_id="5y",
    )
    three_year_window = _build_publication_type_window_summary(
        publications=publications,
        full_years=full_years,
        window_id="3y",
    )
    one_year_window = _build_publication_type_window_summary(
        publications=publications,
        full_years=full_years,
        window_id="1y",
    )
    all_window_serialized = _serialize_publication_article_type_window_summary(all_window)
    five_year_window_serialized = _serialize_publication_article_type_window_summary(
        five_year_window
    )
    three_year_window_serialized = _serialize_publication_article_type_window_summary(
        three_year_window
    )
    one_year_window_serialized = _serialize_publication_article_type_window_summary(
        one_year_window
    )
    distinct_recent_windows: list[dict[str, Any]] = []
    seen_range_labels: set[str] = set()
    all_range_label = (
        str(all_window_serialized.get("range_label") or "").strip()
        if isinstance(all_window_serialized, dict)
        else ""
    )
    for summary in (
        five_year_window_serialized,
        three_year_window_serialized,
        one_year_window_serialized,
    ):
        if not isinstance(summary, dict):
            continue
        range_label = str(summary.get("range_label") or "").strip()
        if not range_label or range_label == all_range_label or range_label in seen_range_labels:
            continue
        distinct_recent_windows.append(summary)
        seen_range_labels.add(range_label)
    latest_window = (
        one_year_window_serialized
        or three_year_window_serialized
        or five_year_window_serialized
        or all_window_serialized
    )
    latest_year_is_partial = bool(
        last_publication_year == as_of_date.year
        and (as_of_date.month < 12 or as_of_date.day < 31)
    )
    latest_partial_year_label = (
        f"{last_publication_year} (through {_format_insight_date(as_of_date)})"
        if latest_year_is_partial
        else None
    )
    recent_windows_shift_leader = any(
        not _same_article_type_leader_set(summary, all_window_serialized)
        for summary in distinct_recent_windows
    )
    all_comparable_windows_keep_leader = all(
        _same_article_type_leader_set(summary, all_window_serialized)
        for summary in distinct_recent_windows
    )
    five_matches_all = _same_article_type_leader_set(
        five_year_window_serialized, all_window_serialized
    )
    three_matches_all = _same_article_type_leader_set(
        three_year_window_serialized, all_window_serialized
    )
    one_matches_all = _same_article_type_leader_set(
        one_year_window_serialized, all_window_serialized
    )
    all_top_labels = (
        list(all_window_serialized.get("top_labels") or [])
        if isinstance(all_window_serialized, dict)
        else []
    )
    all_top_share_pct = (
        _safe_float(all_window_serialized.get("top_share_pct"))
        if isinstance(all_window_serialized, dict)
        else None
    )
    latest_top_share_pct = (
        _safe_float(latest_window.get("top_share_pct"))
        if isinstance(latest_window, dict)
        else None
    )
    all_distinct_type_count = (
        max(0, int(all_window_serialized.get("distinct_type_count") or 0))
        if isinstance(all_window_serialized, dict)
        else 0
    )
    latest_distinct_type_count = (
        max(0, int(latest_window.get("distinct_type_count") or 0))
        if isinstance(latest_window, dict)
        else 0
    )
    latest_window_total_count = (
        max(0, int(latest_window.get("total_count") or 0))
        if isinstance(latest_window, dict)
        else 0
    )
    if not all_window_serialized or max(0, int(all_window_serialized.get("total_count") or 0)) <= 0:
        full_record_mix_state = "no_data"
    elif len(all_top_labels) > 1:
        full_record_mix_state = "tied_lead"
    elif all_top_share_pct is not None and all_top_share_pct >= 60:
        full_record_mix_state = "strong_anchor"
    elif all_top_share_pct is not None and all_top_share_pct >= 45:
        full_record_mix_state = "anchored"
    else:
        full_record_mix_state = "mixed"
    if not distinct_recent_windows:
        recent_window_change_state = "short_record"
    elif five_matches_all and not three_matches_all and not one_matches_all:
        recent_window_change_state = "late_leader_shift"
    elif recent_windows_shift_leader:
        recent_window_change_state = "leader_shift"
    elif (
        latest_top_share_pct is not None
        and all_top_share_pct is not None
        and all_comparable_windows_keep_leader
        and latest_top_share_pct >= all_top_share_pct + 12.0
    ):
        recent_window_change_state = "same_leader_more_concentrated"
    elif one_matches_all and latest_distinct_type_count < all_distinct_type_count:
        recent_window_change_state = "same_leader_narrower"
    elif latest_distinct_type_count > all_distinct_type_count:
        recent_window_change_state = "broader_recent"
    else:
        recent_window_change_state = "stable_anchor"
    if latest_window_total_count <= 3:
        recent_window_confidence = "too_thin"
    elif latest_year_is_partial:
        recent_window_confidence = "partial_current_year"
    elif latest_window_total_count <= 5:
        recent_window_confidence = "thin"
    else:
        recent_window_confidence = "supported"
    if latest_distinct_type_count > all_distinct_type_count:
        recent_breadth_direction = "broader"
    elif latest_distinct_type_count < all_distinct_type_count:
        recent_breadth_direction = "narrower"
    else:
        recent_breadth_direction = "similar"
    return {
        "metrics_status": "READY",
        "window_id": "all",
        "window_label": "All",
        "window_phrase": "across the full publication-type section",
        "data_sources": tile.get("data_source") or [],
        "portfolio_context": portfolio_context,
        "publication_library": publication_library,
        "total_publications": max(
            0, int((all_window_serialized or {}).get("total_count") or len(publications))
        ),
        "first_publication_year": first_publication_year,
        "last_publication_year": last_publication_year,
        "span_years_label": _format_publication_year_range(
            first_publication_year, last_publication_year
        ),
        "all_window": all_window_serialized,
        "five_year_window": five_year_window_serialized,
        "three_year_window": three_year_window_serialized,
        "one_year_window": one_year_window_serialized,
        "latest_window": latest_window,
        "distinct_recent_windows": distinct_recent_windows,
        "full_record_mix_state": full_record_mix_state,
        "recent_window_change_state": recent_window_change_state,
        "recent_window_confidence": recent_window_confidence,
        "recent_breadth_direction": recent_breadth_direction,
        "five_matches_all": five_matches_all,
        "three_matches_all": three_matches_all,
        "one_matches_all": one_matches_all,
        "latest_year_is_partial": latest_year_is_partial,
        "latest_partial_year_label": latest_partial_year_label,
        "latest_window_total_count": latest_window_total_count,
        "as_of_date": as_of_date.isoformat(),
    }


def _build_publication_type_over_time_headline(evidence: dict[str, Any]) -> str:
    return _build_publication_mix_headline(
        evidence,
        mixed_label="Publication mix is shared",
        stable_label="Publication mix is stable",
    )


def _build_publication_type_over_time_full_record_clause(
    evidence: dict[str, Any]
) -> str:
    return _build_publication_mix_full_record_clause(
        evidence,
        mix_name="publication types",
    )


def _build_publication_type_over_time_recent_clause(
    evidence: dict[str, Any]
) -> str:
    return _build_publication_mix_recent_clause(
        evidence,
        mix_name="publication types",
    )


def _build_publication_type_over_time_fallback_payload(
    evidence: dict[str, Any]
) -> dict[str, Any]:
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    if max(0, int(all_window.get("total_count") or 0)) <= 0:
        body = "There is not yet enough publication-type data to interpret how your mix changes over time."
        return {
            "overall_summary": body,
            "sections": [
                {
                    "key": "publication_type_over_time",
                    "title": "Type of publications published over time",
                    "headline": "No mix read",
                    "body": body,
                    "consideration_label": "Coverage",
                    "consideration": "Add publication-type metadata or more dated publications before reading this section as a stable pattern.",
                    "evidence": {
                        "full_record_mix_state": evidence.get("full_record_mix_state"),
                        "recent_window_change_state": evidence.get("recent_window_change_state"),
                        "recent_window_confidence": evidence.get("recent_window_confidence"),
                    },
                }
            ],
        }

    body = (
        f"{_build_publication_type_over_time_full_record_clause(evidence)} "
        f"{_build_publication_type_over_time_recent_clause(evidence)}"
    ).strip()
    consideration_label, consideration = _build_publication_mix_consideration(
        evidence,
        mix_name="publication types",
    )

    return {
        "overall_summary": body,
        "sections": [
            {
                "key": "publication_type_over_time",
                "title": "Type of publications published over time",
                "headline": _build_publication_type_over_time_headline(evidence),
                "body": body,
                "consideration_label": consideration_label,
                "consideration": consideration,
                "evidence": {
                    "span_years_label": evidence.get("span_years_label"),
                    "full_record_mix_state": evidence.get("full_record_mix_state"),
                    "recent_window_change_state": evidence.get("recent_window_change_state"),
                    "recent_window_confidence": evidence.get("recent_window_confidence"),
                    "recent_breadth_direction": evidence.get("recent_breadth_direction"),
                    "all_window": evidence.get("all_window"),
                    "five_year_window": evidence.get("five_year_window"),
                    "three_year_window": evidence.get("three_year_window"),
                    "one_year_window": evidence.get("one_year_window"),
                    "latest_year_is_partial": evidence.get("latest_year_is_partial"),
                    "latest_partial_year_label": evidence.get("latest_partial_year_label"),
                },
            }
        ],
    }


def _build_publication_type_over_time_messages(
    evidence: dict[str, Any],
) -> list[dict[str, str]]:
    return _build_publication_mix_messages(
        evidence,
        mix_name="publication types",
        system_prompt=_build_publication_type_over_time_system_prompt(),
    )


def _build_publication_type_over_time_prompt(
    evidence: dict[str, Any],
) -> list[dict[str, str]]:
    return _build_publication_type_over_time_messages(evidence)


def _contains_numeric_or_fraction_signal(text: str) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return False
    if any(char.isdigit() for char in normalized):
        return True
    if re.search(
        r"\b(one|two|three|four|five|six|seven|eight|nine|ten)[-\s]?(half|halves|third|thirds|quarter|quarters|fifth|fifths|sixth|sixths)\b",
        normalized,
    ):
        return True
    return bool(re.search(r"\bhalf\b", normalized))


def _publication_mix_recent_signals(evidence: dict[str, Any]) -> tuple[str, ...]:
    latest_window = evidence.get("latest_window") if isinstance(evidence.get("latest_window"), dict) else {}
    five_year_window = (
        evidence.get("five_year_window")
        if isinstance(evidence.get("five_year_window"), dict)
        else {}
    )
    three_year_window = (
        evidence.get("three_year_window")
        if isinstance(evidence.get("three_year_window"), dict)
        else {}
    )
    return (
        "3-year",
        "5-year",
        "last 3 years",
        "last three years",
        "last 5 years",
        "last five years",
        "recent windows",
        "shorter windows",
        "newer record",
        str(latest_window.get("range_label") or "").strip().lower(),
        str(five_year_window.get("range_label") or "").strip().lower(),
        str(three_year_window.get("range_label") or "").strip().lower(),
    )


def _publication_type_over_time_body_is_too_generic(
    *, body: str, fallback_body: str, evidence: dict[str, Any]
) -> bool:
    normalized = str(body or "").strip().lower()
    fallback_normalized = str(fallback_body or "").strip().lower()
    if not normalized:
        return True
    if normalized == fallback_normalized:
        return False
    if not _contains_numeric_or_fraction_signal(normalized):
        return True
    generic_phrases = (
        "publication type over time",
        "publication types over time",
        "publication mix over time",
        "different publication types",
        "shows the publication mix",
        "anchors the full record",
        "latest view",
        "centre of gravity",
        "center of gravity",
    )
    if any(phrase in normalized for phrase in generic_phrases):
        return True
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    span_years_label = str(evidence.get("span_years_label") or "").strip().lower()
    long_run_signals = (
        "across",
        "full record",
        "full set",
        "long-run",
        "earlier record",
        span_years_label,
        str(((all_window.get("top_labels") or [None])[0]) or "").strip().lower(),
    )
    recent_signals = _publication_mix_recent_signals(evidence)
    categories_present = 0
    if any(signal and signal in normalized for signal in long_run_signals):
        categories_present += 1
    if any(signal and signal in normalized for signal in recent_signals):
        categories_present += 1
    if categories_present < 2:
        return True
    return False


def _publication_type_over_time_headline_is_too_generic(headline: str) -> bool:
    normalized = str(headline or "").strip().lower()
    if not normalized:
        return True
    generic = {
        "publication type",
        "publication types",
        "publication mix",
        "publication type over time",
        "types over time",
        "recent change",
        "recent mix shift",
        "tighter recent mix",
        "broader recent mix",
        "stable publication mix",
        "mixed publication mix",
    }
    return normalized in generic


def _publication_type_over_time_text_is_unsupported(text: str) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return False
    unsupported_tokens = (
        "citation",
        "citations",
        "journal prestige",
        "authorship",
        "collaboration",
        "field-weighted",
        "field normalized",
        "chart",
        "bar",
        "line",
        "toggle",
        "control",
        "recent signal",
        "latest view",
        "centre of gravity",
        "center of gravity",
    )
    return any(token in normalized for token in unsupported_tokens)

def _publication_output_pattern_body_is_too_generic(
    *, body: str, fallback_body: str, evidence: dict[str, Any]
) -> bool:
    normalized = str(body or "").strip().lower()
    fallback_normalized = str(fallback_body or "").strip().lower()
    if not normalized:
        return True
    if normalized == fallback_normalized:
        return False
    has_numeric_signal = _contains_numeric_or_fraction_signal(normalized)
    generic_phrases = (
        "publication pattern",
        "output pattern",
        "publication output",
        "yearly output",
        "steady, then higher",
        "active across the span",
    )
    if any(phrase in normalized for phrase in generic_phrases):
        return True
    long_run_signals = (
        "full span",
        "full record",
        "across the span",
        "across the full span",
        "whole record",
        "overall pattern",
    )
    continuity_signals = ("continuous", "every year", "uninterrupted", "gap", "no gap")
    career_timing_signals = (
        "early",
        "recent",
        "start",
        "later",
        "build-up",
        "slowdown",
        "quiet start",
        "quiet opening",
        "quieter start",
        "opening",
    )
    trend_signals = (
        "scaling",
        "growth",
        "recent years",
        "baseline",
        "earlier",
        "rebuild",
        "plateau",
        "declin",
        "step-up",
        "surge",
        "rise",
        "rose",
        "flatten",
        "sustain",
        "maintain",
        "break",
        "broke",
        "drop",
        "fell",
        "pause",
        "easing",
        "stronger run",
        "stronger period",
        "stronger stretch",
    )
    peak_signals = (
        "peak",
        "tied",
        "dominat",
        "isolated year",
        "single spike",
        "isolated peak",
        "peak-led",
        "peak dependent",
        "peak-dependent",
        "standout spike",
        "shared peaks",
        "shared highs",
    )
    categories_present = 0
    if any(signal in normalized for signal in long_run_signals):
        categories_present += 1
    if any(signal in normalized for signal in continuity_signals):
        categories_present += 1
    if any(signal in normalized for signal in career_timing_signals):
        categories_present += 1
    has_trend_category = any(signal in normalized for signal in trend_signals)
    if has_trend_category:
        categories_present += 1
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    peak_specific_year_present = any(str(year) in normalized for year in peak_years[:3])
    has_peak_category = any(signal in normalized for signal in peak_signals) or peak_specific_year_present
    if has_peak_category:
        categories_present += 1
    minimum_categories = 3 if has_numeric_signal else 4
    if categories_present < minimum_categories:
        return True
    peak_year_share_pct = _safe_float(evidence.get("peak_year_share_pct"))
    if peak_year_share_pct is not None and peak_year_share_pct >= 30 and not has_peak_category:
        return True
    momentum = _safe_float(evidence.get("momentum"))
    phase_label = str(evidence.get("phase_label") or "").strip()
    if (
        phase_label in {"Scaling", "Rebuilding", "Plateauing", "Contracting"}
        or (momentum is not None and abs(momentum) >= 0.5)
    ) and not has_trend_category:
        return True
    return False


def _publication_volume_over_time_body_is_too_generic(
    *, body: str, fallback_body: str, evidence: dict[str, Any]
) -> bool:
    normalized = str(body or "").strip().lower()
    fallback_normalized = str(fallback_body or "").strip().lower()
    if not normalized:
        return True
    if normalized == fallback_normalized:
        return False
    if not any(char.isdigit() for char in normalized):
        return True
    generic_phrases = (
        "publication volume over time",
        "volume over time",
        "publication trend",
        "shows publication volume",
        "publication activity",
        "middle-to-late run",
        "high-water mark",
        "recent detail",
    )
    if any(phrase in normalized for phrase in generic_phrases):
        return True
    long_run_signals = (
        "across",
        "full record",
        "full span",
        "peak",
        "peaking",
        str(evidence.get("span_years_label") or "").strip().lower(),
    )
    recent_signals = (
        "recent",
        "latest 12",
        "12-month",
        "3-year",
        "5-year",
        "rolling",
        "current 12-month",
    )
    detail_signals = (
        "dated publication",
        "dated set",
        "publication-level",
        "rows",
        "months",
        "spread",
        "table",
    )
    has_long_run = any(signal and signal in normalized for signal in long_run_signals)
    has_recent = any(signal and signal in normalized for signal in recent_signals)
    has_detail = any(signal and signal in normalized for signal in detail_signals)
    if not has_long_run or not has_recent:
        return True
    table_recent_count = max(0, int(evidence.get("table_recent_count") or 0))
    if table_recent_count > 0 and not has_detail:
        return True
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    if peak_years and not any(str(year) in normalized for year in peak_years[:3]) and "peak" not in normalized:
        return True
    stronger_run_label = str(evidence.get("stronger_run_label") or "").strip().lower()
    if stronger_run_label and str(evidence.get("recent_position") or "").strip() in {
        "recently_lighter_than_long_run",
        "very_sparse_recent_window",
        "short_term_softening",
        "longer_run_softening",
    }:
        if stronger_run_label not in normalized:
            return True
        if not any(
            signal in normalized
            for signal in ("pause", "lower baseline", "softer patch", "softer run", "below")
        ):
            return True
    interpretive_signals = (
        "rather than",
        "which fits",
        "which points",
        "so recent",
        "high-water",
        "pause",
        "reinforc",
        "undercut",
        "broadly in line",
        "genuine",
        "temporary",
        "materially",
    )
    if not any(signal in normalized for signal in interpretive_signals):
        return True
    return False


def _publication_article_type_over_time_body_is_too_generic(
    *, body: str, fallback_body: str, evidence: dict[str, Any]
) -> bool:
    normalized = str(body or "").strip().lower()
    fallback_normalized = str(fallback_body or "").strip().lower()
    if not normalized:
        return True
    if normalized == fallback_normalized:
        return False
    if not _contains_numeric_or_fraction_signal(normalized):
        return True
    generic_phrases = (
        "article type over time",
        "article types over time",
        "article mix over time",
        "different article types",
        "shows the article mix",
        "anchors the full record",
        "latest view",
        "centre of gravity",
        "center of gravity",
    )
    if any(phrase in normalized for phrase in generic_phrases):
        return True
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    long_run_signals = (
        "across",
        "full record",
        "full set",
        "long-run",
        "earlier record",
        str(evidence.get("span_years_label") or "").strip().lower(),
        *[
            str(label).strip().lower()
            for label in (all_window.get("top_labels") or [])
            if str(label).strip()
        ],
    )
    recent_signals = _publication_mix_recent_signals(evidence)
    mix_signals = (
        "mix",
        "tilt",
        "shift",
        "flip",
        "carry",
        "narrow",
        "broader",
        "concentrat",
        "lead",
        "led by",
        "overtak",
        "ordering",
        "largest",
        "replacement",
        "takes more",
    )
    has_long_run = any(signal and signal in normalized for signal in long_run_signals)
    has_recent = any(signal and signal in normalized for signal in recent_signals)
    has_mix = any(signal and signal in normalized for signal in mix_signals)
    if not has_long_run or not has_recent or not has_mix:
        return True
    return False


def _publication_production_phase_body_is_too_generic(
    *, body: str, fallback_body: str, evidence: dict[str, Any]
) -> bool:
    normalized = str(body or "").strip().lower()
    fallback_normalized = str(fallback_body or "").strip().lower()
    phase_label = str(evidence.get("phase_label") or "").strip().lower()
    if not normalized:
        return True
    if normalized == fallback_normalized:
        return False
    if not any(char.isdigit() for char in normalized):
        return True
    generic_phrases = (
        "production phase",
        "publication stage",
        "current stage",
        "output stage",
    )
    if any(phrase in normalized for phrase in generic_phrases) and len(normalized.split()) < 14:
        return True
    trend_signals = (
        phase_label,
        "rises",
        "falls",
        "flat",
        "pace",
        "scaling",
        "established",
        "plateau",
        "contract",
        "rebuild",
        "emerging",
        "recent",
        "earlier",
        "baseline",
        "slope",
        "sustain",
        "sustained",
        "higher run",
        "stronger run",
        "cool",
        "cooled",
        "slower",
    )
    recent_signals = (
        "recent",
        "earlier",
        "baseline",
        "rolling",
        "last 12 months",
        "12 months",
        "trailing",
        "prior",
        str(evidence.get("recent_years_label") or "").strip().lower(),
        str(evidence.get("rolling_cutoff_label") or "").strip().lower(),
        str(evidence.get("rolling_prior_period_label") or "").strip().lower(),
        "%",
    )
    continuity_signals = ("every year", "continuous", "uninterrupted", "gap")
    peak_signals = ("peak", "tied", "isolated year", "dominat")
    categories_present = 0
    if any(signal and signal in normalized for signal in trend_signals):
        categories_present += 1
    has_recent_category = any(signal and signal in normalized for signal in recent_signals)
    if has_recent_category:
        categories_present += 1
    if any(signal in normalized for signal in continuity_signals):
        categories_present += 1
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    has_peak_category = any(signal in normalized for signal in peak_signals) or any(str(year) in normalized for year in peak_years[:3])
    if has_peak_category:
        categories_present += 1
    if categories_present < 3:
        return True
    if (
        _safe_float(evidence.get("recent_share_pct")) is not None
        or _safe_float(evidence.get("rolling_three_year_pace")) is not None
        or _safe_int(evidence.get("rolling_one_year_total")) is not None
    ) and not has_recent_category:
        return True
    if peak_years and not has_peak_category:
        return True
    return False


def _publication_output_pattern_headline_is_too_generic(headline: str) -> bool:
    normalized = str(headline or "").strip().lower()
    if not normalized:
        return True
    generic = {
        "output pattern",
        "publication pattern",
        "publication output",
        "pattern",
        "steady",
        "growth",
    }
    return normalized in generic


def _publication_production_phase_headline_is_too_generic(headline: str, phase_label: str | None) -> bool:
    normalized = str(headline or "").strip().lower()
    if not normalized:
        return True
    phase_normalized = str(phase_label or "").strip().lower()
    generic = {
        "production phase",
        "publication phase",
        "current phase",
        "output phase",
        "phase",
    }
    if normalized in generic:
        return True
    return bool(phase_normalized) and normalized == phase_normalized


def _publication_year_over_year_trajectory_headline_is_too_generic(
    headline: str, trajectory: str | None
) -> bool:
    normalized = str(headline or "").strip().lower()
    if not normalized:
        return True
    trajectory_normalized = str(trajectory or "").strip().lower()
    generic = {
        "trajectory",
        "year-over-year trajectory",
        "publication trajectory",
        "year over year trajectory",
        "year-over-year run",
    }
    if normalized in generic:
        return True
    return bool(trajectory_normalized) and normalized == trajectory_normalized


def _publication_volume_over_time_headline_is_too_generic(headline: str) -> bool:
    normalized = str(headline or "").strip().lower()
    if not normalized:
        return True
    generic = {
        "publication volume",
        "volume over time",
        "publication trend",
        "publication activity",
        "recent activity",
    }
    return normalized in generic


def _publication_article_type_over_time_headline_is_too_generic(headline: str) -> bool:
    normalized = str(headline or "").strip().lower()
    if not normalized:
        return True
    generic = {
        "article type",
        "article types",
        "article mix",
        "article type over time",
        "types over time",
        "recent change",
        "recent mix shift",
        "tighter recent mix",
        "broader recent mix",
        "stable article mix",
        "mixed article mix",
    }
    return normalized in generic


def _publication_output_pattern_text_is_unsupported(*, text: str, evidence: dict[str, Any]) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return False
    if any(
        token in normalized
        for token in (
            "citation",
            "journal prestige",
            "authorship",
            "collaboration",
            "field-normal",
        )
    ):
        return True
    partial_year_phrases = (
        "partial year",
        "partial-year",
        "year-to-date",
        "ytd",
        "incomplete year",
        "current year",
    )
    if any(phrase in normalized for phrase in partial_year_phrases):
        partial_year = _safe_int(evidence.get("partial_year"))
        if not bool(evidence.get("includes_partial_year")) or partial_year is None:
            return True
        if str(partial_year) not in normalized:
            return True
    return False


def _publication_output_pattern_consideration_is_too_generic(
    *, label: str, consideration: str, evidence: dict[str, Any]
) -> bool:
    normalized = str(consideration or "").strip().lower()
    label_normalized = str(label or "").strip().lower()
    if not normalized:
        return False
    partial_year = _safe_int(evidence.get("partial_year"))
    if label_normalized in {"confidence note", "confidence"} and any(
        signal in normalized
        for signal in (
            "partial",
            "latest complete year",
            "full record",
            "full timeline",
            "continuous timeline",
            "no gap years",
            "completed timeline",
            "complete year",
            "post-peak year",
            "post peak year",
            "qualifier",
            str(partial_year) if partial_year is not None else "",
        )
    ):
        return False
    if label_normalized in {"peak share", "peak-year share"}:
        return True
    if "calculated per strongest year" in normalized:
        return True
    phase_label = str(evidence.get("phase_label") or "").strip()
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    if phase_label in {"Plateauing", "Contracting"} and len(peak_years) > 1:
        if not any(
            signal in normalized
            for signal in (
                "shared",
                "isolated",
                "momentum",
                "next complete year",
                "another year",
                "broader",
                "record",
            )
        ):
            return True
    return False


def _publication_volume_over_time_text_is_unsupported(text: str) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return False
    forbidden_phrases = (
        "citation",
        "citations",
        "journal prestige",
        "authorship",
        "collaboration",
        "field-weighted",
        "field normalized",
    )
    return any(phrase in normalized for phrase in forbidden_phrases)


def _publication_volume_over_time_consideration_is_too_generic(
    *, consideration_label: str, consideration: str, evidence: dict[str, Any]
) -> bool:
    label_normalized = str(consideration_label or "").strip().lower()
    consideration_normalized = str(consideration or "").strip().lower()
    if not consideration_normalized:
        return False
    if label_normalized in {"recent detail", "date detail"} and str(
        evidence.get("volume_read_mode") or ""
    ).strip() in {"pause_below_band", "lower_recent_baseline", "soft_patch_with_limited_support"}:
        return True
    if not any(
        signal in consideration_normalized
        for signal in (
            "record",
            "portfolio",
            "recent face",
            "older strong years",
            "fresh publication volume",
            "refreshed",
            "reverse",
            "rely",
        )
    ):
        return True
    return False


def _publication_production_phase_text_is_unsupported(text: str) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return False
    unsupported_tokens = (
        "citation",
        "journal prestige",
        "authorship",
        "collaboration",
        "field-normal",
        "partial year",
        "partial-year",
        "year-to-date",
        "ytd",
        "incomplete year",
        "current year",
    )
    return any(token in normalized for token in unsupported_tokens)


def _publication_year_over_year_trajectory_text_is_unsupported(
    *, text: str, evidence: dict[str, Any]
) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return False
    if any(
        token in normalized
        for token in (
            "citation",
            "citations",
            "journal prestige",
            "authorship",
            "collaboration",
            "field-normal",
            "field weighted",
        )
    ):
        return True
    partial_year_phrases = (
        "partial year",
        "partial-year",
        "year-to-date",
        "ytd",
        "incomplete year",
        "current year",
    )
    if any(phrase in normalized for phrase in partial_year_phrases):
        partial_year = _safe_int(evidence.get("partial_year"))
        if not bool(evidence.get("includes_partial_year")) or partial_year is None:
            return True
        if str(partial_year) not in normalized:
            return True
    return False


def _publication_year_over_year_trajectory_body_is_too_generic(
    *, body: str, fallback_body: str, evidence: dict[str, Any]
) -> bool:
    normalized = str(body or "").strip().lower()
    fallback_normalized = str(fallback_body or "").strip().lower()
    if not normalized:
        return True
    if normalized == fallback_normalized:
        return False
    if len(normalized.split()) < 12:
        return True
    if any(
        phrase in normalized
        for phrase in (
            "the trajectory changed over time",
            "the run shifted over time",
            "the trajectory has changed",
            "the run has shifted",
        )
    ):
        return True
    structural_signals = (
        "complete year",
        "complete years",
        "full span",
        "full record",
        "earlier",
        "later",
        "peak",
        "peaked",
        "fell",
        "rose",
        "pullback",
        "range",
        "stronger run",
        "higher run",
    )
    recent_signals = (
        "rolling",
        "pace",
        "last 12 months",
        "latest 12 months",
        "trailing",
        "prior",
        str(evidence.get("rolling_cutoff_label") or "").strip().lower(),
        str(evidence.get("rolling_prior_period_label") or "").strip().lower(),
    )
    has_structural_signal = any(
        signal and signal in normalized for signal in structural_signals
    )
    has_recent_signal = any(signal and signal in normalized for signal in recent_signals)
    if not has_structural_signal:
        return True
    if (
        _safe_int(evidence.get("rolling_one_year_total")) is not None
        or _safe_float(evidence.get("rolling_three_year_pace")) is not None
    ) and not has_recent_signal:
        return True
    return False


def _publication_year_over_year_trajectory_consideration_is_too_generic(
    *, label: str, consideration: str, evidence: dict[str, Any]
) -> bool:
    normalized = str(consideration or "").strip().lower()
    label_normalized = str(label or "").strip().lower()
    if not normalized:
        return False
    partial_year = _safe_int(evidence.get("partial_year"))
    if label_normalized in {"confidence note", "confidence"} and any(
        signal in normalized
        for signal in (
            "complete year",
            "complete years",
            "rolling",
            "pace",
            "last 12 months",
            "trailing",
            "through",
            "partial",
            str(partial_year) if partial_year is not None else "",
            str(evidence.get("rolling_cutoff_label") or "").strip().lower(),
        )
    ):
        return False
    return len(normalized.split()) < 8


def _publication_article_type_over_time_text_is_unsupported(text: str) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return False
    unsupported_tokens = (
        "citation",
        "citations",
        "journal prestige",
        "authorship",
        "collaboration",
        "field-weighted",
        "field normalized",
        "chart",
        "bar",
        "line",
        "toggle",
        "control",
        "recent signal",
        "latest view",
        "centre of gravity",
        "center of gravity",
    )
    return any(token in normalized for token in unsupported_tokens)


def _publication_mix_consideration_is_too_generic(
    *, consideration_label: str, consideration: str
) -> bool:
    label_normalized = str(consideration_label or "").strip().lower()
    consideration_normalized = str(consideration or "").strip().lower()
    if not consideration_normalized:
        return False
    if label_normalized in {"recent signal", "recent window"}:
        return True
    if any(
        phrase in consideration_normalized
        for phrase in (
            "latest view",
            "newest ordering",
            "centre of gravity",
            "center of gravity",
        )
    ):
        return True
    return False


def _publication_mix_headline_is_inconsistent(
    *, headline: str, evidence: dict[str, Any]
) -> bool:
    normalized = str(headline or "").strip().lower()
    if not normalized:
        return False
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    if recent_window_change_state == "broader_recent" and any(
        token in normalized for token in ("tighter", "narrow", "concentrat")
    ):
        return True
    if recent_window_change_state in {
        "same_leader_more_concentrated",
        "same_leader_narrower",
    } and any(token in normalized for token in ("broader", "broaden", "wider")):
        return True
    if recent_window_change_state in {"late_leader_shift", "leader_shift"} and "stable" in normalized:
        return True
    return False


def _find_generated_section(payload: dict[str, Any], section_key: str) -> dict[str, Any]:
    sections_raw = payload.get("sections")
    if not isinstance(sections_raw, list):
        return {}
    for item in sections_raw:
        if not isinstance(item, dict):
            continue
        if str(item.get("key") or "").strip() == section_key:
            return item
    return {}


def _require_object_keys(
    *,
    value: Any,
    allowed_keys: set[str],
    error_message: str,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise PublicationInsightsAgentValidationError(error_message)
    extra_keys = set(value.keys()) - allowed_keys
    if extra_keys:
        raise PublicationInsightsAgentValidationError(error_message)
    return value


def _require_publication_output_pattern_enum(value: Any) -> str:
    normalized = _normalize_publication_generated_text(value).lower()
    if normalized in PUBLICATION_OUTPUT_PATTERN_OPTIONS:
        return normalized
    raise PublicationInsightsAgentValidationError(
        "Publication insights AI returned an invalid pattern for publication_output_pattern."
    )


def _require_publication_production_phase_enum(value: Any) -> str:
    normalized = _normalize_publication_generated_text(value).lower()
    if normalized in PUBLICATION_PRODUCTION_PHASE_OPTIONS:
        return normalized
    raise PublicationInsightsAgentValidationError(
        "Publication insights AI returned an invalid phase for publication_production_phase."
    )


def _require_publication_year_over_year_trajectory_enum(value: Any) -> str:
    normalized = _normalize_publication_generated_text(value).lower()
    if normalized in PUBLICATION_YEAR_OVER_YEAR_TRAJECTORY_OPTIONS:
        return normalized
    raise PublicationInsightsAgentValidationError(
        "Publication insights AI returned an invalid trajectory for publication_year_over_year_trajectory."
    )


def _require_publication_mix_pattern_enum(*, value: Any, section_key: str) -> str:
    normalized = _normalize_publication_generated_text(value).lower()
    if normalized in PUBLICATION_MIX_PATTERN_OPTIONS:
        return normalized
    raise PublicationInsightsAgentValidationError(
        f"Publication insights AI returned an invalid mix_pattern for {section_key}."
    )


def _require_generated_text(
    *,
    text: Any,
    section_key: str,
    field_name: str,
    require_sentence_end: bool = False,
    generic_predicate: Callable[[str], bool] | None = None,
    unsupported_predicate: Callable[[str], bool] | None = None,
) -> str:
    clean = _validate_generated_text_contract(
        text=text,
        section_key=section_key,
        field_name=field_name,
        require_sentence_end=require_sentence_end,
    )
    if generic_predicate and generic_predicate(clean):
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned a generic {field_name} for {section_key}."
        )
    if unsupported_predicate and unsupported_predicate(clean):
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned unsupported {field_name} content for {section_key}."
        )
    return clean


def _normalize_generated_note(
    *,
    label: Any,
    consideration: Any,
    section_key: str,
    generic_predicate: Callable[[str, str], bool] | None = None,
    unsupported_predicate: Callable[[str], bool] | None = None,
) -> tuple[str | None, str | None]:
    note_label_raw = _normalize_publication_generated_text(label)
    note_text_raw = _normalize_publication_generated_text(consideration)
    if not note_label_raw and not note_text_raw:
        return None, None
    if not note_label_raw or not note_text_raw:
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned an incomplete consideration for {section_key}."
        )
    note_label = _validate_generated_note_label(
        label=note_label_raw,
        section_key=section_key,
    )
    note_text = _validate_generated_text_contract(
        text=note_text_raw,
        section_key=section_key,
        field_name="consideration",
        require_sentence_end=True,
    )
    if unsupported_predicate and unsupported_predicate(note_text):
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned unsupported consideration content for {section_key}."
        )
    if generic_predicate and generic_predicate(note_label, note_text):
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned a generic consideration for {section_key}."
        )
    return note_label, note_text


def _normalize_generated_block_kind(value: Any, *, section_key: str) -> Literal["paragraph", "callout"]:
    normalized = _normalize_publication_generated_text(value).lower()
    if normalized in {"paragraph", "narrative", "text"}:
        return "paragraph"
    if normalized in {"callout", "note", "aside"}:
        return "callout"
    raise PublicationInsightsAgentValidationError(
        f"Publication insights AI returned an invalid block kind for {section_key}."
    )


def _normalize_generated_section_blocks(
    *,
    blocks: Any,
    section_key: str,
    unsupported_predicate: Callable[[str], bool] | None = None,
) -> list[dict[str, Any]]:
    if blocks in (None, ""):
        return []
    if not isinstance(blocks, list):
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned invalid blocks for {section_key}."
        )

    normalized_blocks: list[dict[str, Any]] = []
    for item in blocks:
        if not isinstance(item, dict):
            raise PublicationInsightsAgentValidationError(
                f"Publication insights AI returned invalid blocks for {section_key}."
            )
        kind = _normalize_generated_block_kind(
            item.get("kind") or item.get("type"),
            section_key=section_key,
        )
        text = _validate_generated_text_contract(
            text=item.get("text") or item.get("body") or item.get("content"),
            section_key=section_key,
            field_name="block_text",
            require_sentence_end=True,
        )
        if unsupported_predicate and unsupported_predicate(text):
            raise PublicationInsightsAgentValidationError(
                f"Publication insights AI returned unsupported block_text content for {section_key}."
            )
        label_raw = _normalize_publication_generated_text(
            item.get("label") or item.get("title") or item.get("heading")
        )
        normalized_blocks.append(
            {
                "kind": kind,
                "label": label_raw or None,
                "text": text,
            }
        )
    return normalized_blocks


def _finalize_publication_insight_sections(
    sections: list[dict[str, Any]] | list[Any],
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for item in sections:
        if not isinstance(item, dict):
            continue
        section = dict(item)
        section_key = str(section.get("key") or "").strip() or "publication_insight"
        blocks = _normalize_generated_section_blocks(
            blocks=section.get("blocks"),
            section_key=section_key,
        )
        consideration_label = _normalize_publication_generated_text(
            section.get("consideration_label")
        )
        consideration = _normalize_publication_generated_text(section.get("consideration"))
        if consideration:
            legacy_block = {
                "kind": "callout",
                "label": consideration_label or None,
                "text": consideration,
            }
            if legacy_block not in blocks:
                blocks.append(legacy_block)
        section["blocks"] = blocks
        output.append(section)
    return output


def _coerce_publication_volume_over_time_payload(payload: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    scaffold = _build_publication_volume_over_time_fallback_payload(evidence)
    scaffold_section = dict((scaffold.get("sections") or [{}])[0] or {})
    model_section = _find_generated_section(payload, "publication_volume_over_time")
    if not model_section:
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned no section for publication_volume_over_time."
        )

    headline = _require_generated_text(
        text=model_section.get("headline"),
        section_key="publication_volume_over_time",
        field_name="headline",
        generic_predicate=_publication_volume_over_time_headline_is_too_generic,
    )
    body = _require_generated_text(
        text=model_section.get("body"),
        section_key="publication_volume_over_time",
        field_name="body",
        require_sentence_end=True,
        generic_predicate=lambda value: _publication_volume_over_time_body_is_too_generic(
            body=value,
            fallback_body="",
            evidence=evidence,
        ),
        unsupported_predicate=_publication_volume_over_time_text_is_unsupported,
    )
    consideration_label, consideration = _normalize_generated_note(
        label=model_section.get("consideration_label"),
        consideration=model_section.get("consideration"),
        section_key="publication_volume_over_time",
        generic_predicate=lambda label, note: _publication_volume_over_time_consideration_is_too_generic(
            consideration_label=label,
            consideration=note,
            evidence=evidence,
        ),
        unsupported_predicate=_publication_volume_over_time_text_is_unsupported,
    )
    overall_summary = _validate_generated_text_contract(
        text=payload.get("overall_summary"),
        section_key="publication_volume_over_time",
        field_name="overall_summary",
        allow_empty=True,
    )
    if _publication_volume_over_time_text_is_unsupported(overall_summary):
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned unsupported overall_summary content for publication_volume_over_time."
        )

    return {
        "overall_summary": overall_summary,
        "sections": [
            {
                **scaffold_section,
                "headline": headline,
                "body": body,
                "consideration_label": consideration_label,
                "consideration": consideration,
                "blocks": model_section.get("blocks"),
            }
        ],
    }


def _coerce_publication_year_over_year_trajectory_payload(
    payload: dict[str, Any], evidence: dict[str, Any]
) -> dict[str, Any]:
    scaffold = _build_publication_year_over_year_trajectory_fallback_payload(evidence)
    scaffold_section = dict((scaffold.get("sections") or [{}])[0] or {})
    payload_object = _require_object_keys(
        value=payload,
        allowed_keys={"overall_summary", "sections"},
        error_message="Publication insights AI returned invalid fields for publication_year_over_year_trajectory.",
    )
    sections_raw = payload_object.get("sections")
    if not isinstance(sections_raw, list) or len(sections_raw) != 1:
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned no section for publication_year_over_year_trajectory."
        )
    model_section = _require_object_keys(
        value=sections_raw[0],
        allowed_keys={"key", "trajectory", "headline", "body", "blocks"},
        error_message="Publication insights AI returned invalid fields for publication_year_over_year_trajectory.",
    )
    if str(model_section.get("key") or "").strip() != "publication_year_over_year_trajectory":
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned no section for publication_year_over_year_trajectory."
        )

    trajectory = _require_publication_year_over_year_trajectory_enum(
        model_section.get("trajectory")
    )
    headline = _require_generated_text(
        text=model_section.get("headline"),
        section_key="publication_year_over_year_trajectory",
        field_name="headline",
        generic_predicate=lambda value: _publication_year_over_year_trajectory_headline_is_too_generic(
            value, trajectory
        ),
    )
    body = _require_generated_text(
        text=model_section.get("body"),
        section_key="publication_year_over_year_trajectory",
        field_name="body",
        require_sentence_end=True,
        generic_predicate=lambda value: _publication_year_over_year_trajectory_body_is_too_generic(
            body=value,
            fallback_body="",
            evidence=evidence,
        ),
        unsupported_predicate=lambda value: _publication_year_over_year_trajectory_text_is_unsupported(
            text=value,
            evidence=evidence,
        ),
    )
    raw_blocks = model_section.get("blocks")
    if not isinstance(raw_blocks, list):
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned invalid blocks for publication_year_over_year_trajectory."
        )
    if len(raw_blocks) > 1:
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned too many blocks for publication_year_over_year_trajectory."
        )
    for item in raw_blocks:
        _require_object_keys(
            value=item,
            allowed_keys={"kind", "label", "text"},
            error_message="Publication insights AI returned invalid blocks for publication_year_over_year_trajectory.",
        )
    blocks = _normalize_generated_section_blocks(
        blocks=raw_blocks,
        section_key="publication_year_over_year_trajectory",
        unsupported_predicate=lambda value: _publication_year_over_year_trajectory_text_is_unsupported(
            text=value,
            evidence=evidence,
        ),
    )
    primary_callout = next(
        (
            block
            for block in blocks
            if str(block.get("kind") or "").strip() == "callout"
            and str(block.get("text") or "").strip()
        ),
        None,
    )
    primary_callout_label = _normalize_publication_generated_text(
        (primary_callout or {}).get("label")
    )
    if primary_callout and primary_callout_label:
        consideration_label, consideration = _normalize_generated_note(
            label=primary_callout_label,
            consideration=(primary_callout or {}).get("text"),
            section_key="publication_year_over_year_trajectory",
            generic_predicate=lambda label, note: _publication_year_over_year_trajectory_consideration_is_too_generic(
                label=label,
                consideration=note,
                evidence=evidence,
            ),
            unsupported_predicate=lambda value: _publication_year_over_year_trajectory_text_is_unsupported(
                text=value,
                evidence=evidence,
            ),
        )
    else:
        consideration_label, consideration = None, None
    overall_summary = _validate_generated_text_contract(
        text=payload_object.get("overall_summary"),
        section_key="publication_year_over_year_trajectory",
        field_name="overall_summary",
        allow_empty=True,
    )
    if _publication_year_over_year_trajectory_text_is_unsupported(
        text=overall_summary,
        evidence=evidence,
    ):
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned unsupported overall_summary content for publication_year_over_year_trajectory."
        )

    return {
        "overall_summary": overall_summary,
        "sections": [
            {
                **scaffold_section,
                "headline": headline,
                "body": body,
                "consideration_label": consideration_label,
                "consideration": consideration,
                "blocks": blocks,
                "evidence": {
                    **(
                        scaffold_section.get("evidence")
                        if isinstance(scaffold_section.get("evidence"), dict)
                        else {}
                    ),
                    "trajectory": trajectory,
                },
            }
        ],
    }


def _coerce_publication_mix_payload(
    *,
    payload: dict[str, Any],
    evidence: dict[str, Any],
    section_key: str,
    build_fallback_payload: Callable[[dict[str, Any]], dict[str, Any]],
    headline_generic_predicate: Callable[[str], bool],
    body_generic_predicate: Callable[[str], bool],
    unsupported_predicate: Callable[[str], bool],
) -> dict[str, Any]:
    scaffold = build_fallback_payload(evidence)
    scaffold_section = dict((scaffold.get("sections") or [{}])[0] or {})
    payload_object = _require_object_keys(
        value=payload,
        allowed_keys={"overall_summary", "sections"},
        error_message=f"Publication insights AI returned invalid fields for {section_key}.",
    )
    sections_raw = payload_object.get("sections")
    if not isinstance(sections_raw, list) or len(sections_raw) != 1:
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned no section for {section_key}."
        )
    model_section = _require_object_keys(
        value=sections_raw[0],
        allowed_keys={"key", "mix_pattern", "headline", "body", "blocks"},
        error_message=f"Publication insights AI returned invalid fields for {section_key}.",
    )
    if str(model_section.get("key") or "").strip() != section_key:
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned no section for {section_key}."
        )

    mix_pattern = _require_publication_mix_pattern_enum(
        value=model_section.get("mix_pattern"),
        section_key=section_key,
    )
    headline = _require_generated_text(
        text=model_section.get("headline"),
        section_key=section_key,
        field_name="headline",
        generic_predicate=lambda value: headline_generic_predicate(value)
        or _publication_mix_headline_is_inconsistent(headline=value, evidence=evidence),
    )
    body = _require_generated_text(
        text=model_section.get("body"),
        section_key=section_key,
        field_name="body",
        require_sentence_end=True,
        generic_predicate=body_generic_predicate,
        unsupported_predicate=unsupported_predicate,
    )
    raw_blocks = model_section.get("blocks")
    if not isinstance(raw_blocks, list):
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned invalid blocks for {section_key}."
        )
    if len(raw_blocks) > 1:
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned too many blocks for {section_key}."
        )
    for item in raw_blocks:
        _require_object_keys(
            value=item,
            allowed_keys={"kind", "label", "text"},
            error_message=f"Publication insights AI returned invalid blocks for {section_key}.",
        )
    blocks = _normalize_generated_section_blocks(
        blocks=raw_blocks,
        section_key=section_key,
        unsupported_predicate=unsupported_predicate,
    )
    primary_callout = next(
        (
            block
            for block in blocks
            if str(block.get("kind") or "").strip() == "callout"
            and str(block.get("text") or "").strip()
        ),
        None,
    )
    primary_callout_label = _normalize_publication_generated_text(
        (primary_callout or {}).get("label")
    )
    if primary_callout and primary_callout_label:
        consideration_label, consideration = _normalize_generated_note(
            label=primary_callout_label,
            consideration=(primary_callout or {}).get("text"),
            section_key=section_key,
            generic_predicate=lambda label, note: _publication_mix_consideration_is_too_generic(
                consideration_label=label,
                consideration=note,
            ),
            unsupported_predicate=unsupported_predicate,
        )
    else:
        consideration_label, consideration = None, None
    overall_summary = _validate_generated_text_contract(
        text=payload_object.get("overall_summary"),
        section_key=section_key,
        field_name="overall_summary",
        allow_empty=True,
    )
    if unsupported_predicate(overall_summary):
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI returned unsupported overall_summary content for {section_key}."
        )

    return {
        "overall_summary": overall_summary,
        "sections": [
            {
                **scaffold_section,
                "headline": headline,
                "body": body,
                "consideration_label": consideration_label,
                "consideration": consideration,
                "blocks": blocks,
                "evidence": {
                    **(
                        scaffold_section.get("evidence")
                        if isinstance(scaffold_section.get("evidence"), dict)
                        else {}
                    ),
                    "mix_pattern": mix_pattern,
                },
            }
        ],
    }


def _coerce_publication_article_type_over_time_payload(
    payload: dict[str, Any], evidence: dict[str, Any]
) -> dict[str, Any]:
    return _coerce_publication_mix_payload(
        payload=payload,
        evidence=evidence,
        section_key="publication_article_type_over_time",
        build_fallback_payload=_build_publication_article_type_over_time_fallback_payload,
        headline_generic_predicate=_publication_article_type_over_time_headline_is_too_generic,
        body_generic_predicate=lambda value: _publication_article_type_over_time_body_is_too_generic(
            body=value,
            fallback_body="",
            evidence=evidence,
        ),
        unsupported_predicate=_publication_article_type_over_time_text_is_unsupported,
    )


def _coerce_publication_type_over_time_payload(
    payload: dict[str, Any], evidence: dict[str, Any]
) -> dict[str, Any]:
    return _coerce_publication_mix_payload(
        payload=payload,
        evidence=evidence,
        section_key="publication_type_over_time",
        build_fallback_payload=_build_publication_type_over_time_fallback_payload,
        headline_generic_predicate=_publication_type_over_time_headline_is_too_generic,
        body_generic_predicate=lambda value: _publication_type_over_time_body_is_too_generic(
            body=value,
            fallback_body="",
            evidence=evidence,
        ),
        unsupported_predicate=_publication_type_over_time_text_is_unsupported,
    )


def _coerce_publication_output_pattern_payload(payload: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    scaffold = _build_publication_output_pattern_fallback_payload(evidence)
    scaffold_section = dict((scaffold.get("sections") or [{}])[0] or {})
    payload_object = _require_object_keys(
        value=payload,
        allowed_keys={"overall_summary", "sections"},
        error_message="Publication insights AI returned invalid fields for publication_output_pattern.",
    )
    sections_raw = payload_object.get("sections")
    if not isinstance(sections_raw, list) or len(sections_raw) != 1:
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned no section for publication_output_pattern."
        )
    model_section = _require_object_keys(
        value=sections_raw[0],
        allowed_keys={"key", "pattern", "headline", "body", "blocks"},
        error_message="Publication insights AI returned invalid fields for publication_output_pattern.",
    )
    if str(model_section.get("key") or "").strip() != "publication_output_pattern":
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned no section for publication_output_pattern."
        )

    pattern = _require_publication_output_pattern_enum(model_section.get("pattern"))
    headline = _require_generated_text(
        text=model_section.get("headline"),
        section_key="publication_output_pattern",
        field_name="headline",
        generic_predicate=_publication_output_pattern_headline_is_too_generic,
    )
    body = _require_generated_text(
        text=model_section.get("body"),
        section_key="publication_output_pattern",
        field_name="body",
        require_sentence_end=True,
        generic_predicate=lambda value: _publication_output_pattern_body_is_too_generic(
            body=value,
            fallback_body="",
            evidence=evidence,
        ),
        unsupported_predicate=lambda value: _publication_output_pattern_text_is_unsupported(
            text=value,
            evidence=evidence,
        ),
    )
    raw_blocks = model_section.get("blocks")
    if not isinstance(raw_blocks, list):
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned invalid blocks for publication_output_pattern."
        )
    if len(raw_blocks) > 1:
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned too many blocks for publication_output_pattern."
        )
    for item in raw_blocks:
        _require_object_keys(
            value=item,
            allowed_keys={"kind", "label", "text"},
            error_message="Publication insights AI returned invalid blocks for publication_output_pattern.",
        )
    blocks = _normalize_generated_section_blocks(
        blocks=raw_blocks,
        section_key="publication_output_pattern",
        unsupported_predicate=lambda value: _publication_output_pattern_text_is_unsupported(
            text=value,
            evidence=evidence,
        ),
    )
    primary_callout = next(
        (
            block
            for block in blocks
            if str(block.get("kind") or "").strip() == "callout"
            and str(block.get("text") or "").strip()
        ),
        None,
    )
    primary_callout_label = _normalize_publication_generated_text(
        (primary_callout or {}).get("label")
    )
    if primary_callout and primary_callout_label:
        consideration_label, consideration = _normalize_generated_note(
            label=primary_callout_label,
            consideration=(primary_callout or {}).get("text"),
            section_key="publication_output_pattern",
            generic_predicate=lambda label, note: _publication_output_pattern_consideration_is_too_generic(
                label=label,
                consideration=note,
                evidence=evidence,
            ),
            unsupported_predicate=lambda value: _publication_output_pattern_text_is_unsupported(
                text=value,
                evidence=evidence,
            ),
        )
    else:
        consideration_label, consideration = None, None
    overall_summary = _validate_generated_text_contract(
        text=payload_object.get("overall_summary"),
        section_key="publication_output_pattern",
        field_name="overall_summary",
        allow_empty=True,
    )
    if _publication_output_pattern_text_is_unsupported(text=overall_summary, evidence=evidence):
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned unsupported overall_summary content for publication_output_pattern."
        )

    return {
        "overall_summary": overall_summary,
        "sections": [
            {
                **scaffold_section,
                "headline": headline,
                "body": body,
                "consideration_label": consideration_label,
                "consideration": consideration,
                "blocks": blocks,
                "evidence": {
                    **(
                        scaffold_section.get("evidence")
                        if isinstance(scaffold_section.get("evidence"), dict)
                        else {}
                    ),
                    "pattern": pattern,
                },
            }
        ],
    }


def _coerce_publication_production_phase_payload(payload: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    scaffold = _build_publication_production_phase_fallback_payload(evidence)
    scaffold_section = dict((scaffold.get("sections") or [{}])[0] or {})
    payload_object = _require_object_keys(
        value=payload,
        allowed_keys={"overall_summary", "sections"},
        error_message="Publication insights AI returned invalid fields for publication_production_phase.",
    )
    sections_raw = payload_object.get("sections")
    if not isinstance(sections_raw, list) or len(sections_raw) != 1:
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned no section for publication_production_phase."
        )
    model_section = _require_object_keys(
        value=sections_raw[0],
        allowed_keys={"key", "phase", "headline", "body", "blocks"},
        error_message="Publication insights AI returned invalid fields for publication_production_phase.",
    )
    if str(model_section.get("key") or "").strip() != "publication_production_phase":
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned no section for publication_production_phase."
        )

    phase_label = str(evidence.get("phase_label") or "").strip() or None
    phase = _require_publication_production_phase_enum(model_section.get("phase"))
    headline = _require_generated_text(
        text=model_section.get("headline"),
        section_key="publication_production_phase",
        field_name="headline",
        generic_predicate=lambda value: _publication_production_phase_headline_is_too_generic(
            value, phase_label
        ),
    )
    body = _require_generated_text(
        text=model_section.get("body"),
        section_key="publication_production_phase",
        field_name="body",
        require_sentence_end=True,
        generic_predicate=lambda value: _publication_production_phase_body_is_too_generic(
            body=value,
            fallback_body="",
            evidence=evidence,
        ),
        unsupported_predicate=_publication_production_phase_text_is_unsupported,
    )
    raw_blocks = model_section.get("blocks")
    if not isinstance(raw_blocks, list):
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned invalid blocks for publication_production_phase."
        )
    if len(raw_blocks) > 1:
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned too many blocks for publication_production_phase."
        )
    for item in raw_blocks:
        _require_object_keys(
            value=item,
            allowed_keys={"kind", "label", "text"},
            error_message="Publication insights AI returned invalid blocks for publication_production_phase.",
        )
    blocks = _normalize_generated_section_blocks(
        blocks=raw_blocks,
        section_key="publication_production_phase",
        unsupported_predicate=_publication_production_phase_text_is_unsupported,
    )
    primary_callout = next(
        (
            block
            for block in blocks
            if str(block.get("kind") or "").strip() == "callout"
            and str(block.get("text") or "").strip()
        ),
        None,
    )
    primary_callout_label = _normalize_publication_generated_text(
        (primary_callout or {}).get("label")
    )
    if primary_callout and primary_callout_label:
        consideration_label, consideration = _normalize_generated_note(
            label=primary_callout_label,
            consideration=(primary_callout or {}).get("text"),
            section_key="publication_production_phase",
            unsupported_predicate=_publication_production_phase_text_is_unsupported,
        )
    else:
        consideration_label, consideration = None, None
    overall_summary = _validate_generated_text_contract(
        text=payload_object.get("overall_summary"),
        section_key="publication_production_phase",
        field_name="overall_summary",
        allow_empty=True,
    )
    if _publication_production_phase_text_is_unsupported(overall_summary):
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned unsupported overall_summary content for publication_production_phase."
        )

    return {
        "overall_summary": overall_summary,
        "sections": [
            {
                **scaffold_section,
                "headline": headline,
                "body": body,
                "consideration_label": consideration_label,
                "consideration": consideration,
                "blocks": blocks,
                "evidence": {
                    **(
                        scaffold_section.get("evidence")
                        if isinstance(scaffold_section.get("evidence"), dict)
                        else {}
                    ),
                    "phase": phase,
                },
            }
        ],
    }


def _build_evidence(
    *,
    user_id: str,
    window_id: str,
    section_key: Literal[
        "uncited_works", "citation_drivers", "citation_activation", "citation_activation_history"
    ]
    | None = None,
    scope: Literal["window", "section"] = "window",
) -> dict[str, Any]:
    metrics = get_publication_top_metrics(user_id=user_id)
    tile = _resolve_total_citations_tile(metrics)
    drilldown = tile.get("drilldown") if isinstance(tile.get("drilldown"), dict) else {}
    metadata = drilldown.get("metadata") if isinstance(drilldown.get("metadata"), dict) else {}
    intermediate = (
        metadata.get("intermediate_values")
        if isinstance(metadata.get("intermediate_values"), dict)
        else {}
    )
    activation_history = (
        metadata.get("activation_history")
        if isinstance(metadata.get("activation_history"), dict)
        else {}
    )
    publications = [
        dict(item)
        for item in (drilldown.get("publications") or [])
        if isinstance(item, dict)
    ]
    portfolio_context = _build_portfolio_context(metrics)
    total_publications = max(
        0,
        int(
            _safe_int(intermediate.get("total_publications"))
            or len(publications)
        ),
    )
    uncited_count = _safe_int(intermediate.get("uncited_publications_count"))
    if uncited_count is None:
        uncited_count = sum(
            1
            for item in publications
            if max(0, int(_safe_int(item.get("citations_lifetime")) or 0)) <= 0
        )
    uncited_pct = _safe_float(intermediate.get("uncited_publications_pct"))
    if uncited_pct is None:
        uncited_pct = (
            round((float(uncited_count) / float(total_publications)) * 100.0, 1)
            if total_publications > 0
            else 0.0
        )
    current_year = _utcnow().year
    uncited_recent_count = sum(
        1
        for item in publications
        if max(0, int(_safe_int(item.get("citations_lifetime")) or 0)) <= 0
        and (_safe_int(item.get("year")) or 0) >= current_year - (UNCITED_RECENT_YEARS - 1)
    )
    uncited_older_count = max(0, int(uncited_count) - uncited_recent_count)
    uncited_recent_pct = (
        round((float(uncited_recent_count) / float(uncited_count)) * 100.0, 1)
        if uncited_count > 0
        else 0.0
    )
    selected_snapshot = _build_driver_window_snapshot(publications, window_id=window_id)
    section_window_summaries = [
        _build_driver_window_snapshot(publications, window_id=window_key)
        for window_key in ("1y", "3y", "5y")
    ]
    activation_snapshot = _build_activation_snapshot(publications)
    activation_publications = list(activation_snapshot["activation_publications"])
    newly_active_publications = list(activation_snapshot["newly_active_publications"])
    still_active_publications = list(activation_snapshot["still_active_publications"])
    activation_count = len(activation_publications)
    newly_active_count = len(newly_active_publications)
    still_active_count = len(still_active_publications)
    inactive_count = max(0, total_publications - activation_count)
    activation_pct = (
        round((float(activation_count) / float(total_publications)) * 100.0, 1)
        if total_publications > 0
        else 0.0
    )
    activation_pattern = "none"
    if activation_pct >= 60.0:
        activation_pattern = "broad"
    elif activation_pct >= 35.0:
        activation_pattern = "mixed"
    elif activation_pct > 0:
        activation_pattern = "narrow"
    active_section_windows = [
        item for item in section_window_summaries if int(item.get("window_citations_total") or 0) > 0
    ]
    lead_title_counter = Counter(
        str((item.get("top_publications") or [{}])[0].get("title") or "").strip()
        for item in active_section_windows
        if item.get("top_publications")
    )
    lead_title_counter.pop("", None)
    persistent_lead_title = lead_title_counter.most_common(1)[0][0] if lead_title_counter else ""
    persistent_lead_window_count = (
        lead_title_counter.most_common(1)[0][1] if lead_title_counter else 0
    )
    high_concentration_windows = sum(
        1
        for item in active_section_windows
        if float(item.get("driver_share_pct") or 0.0) >= 50.0
    )
    standout_windows = sum(
        1
        for item in active_section_windows
        if str(item.get("driver_pattern") or "") == "single_standout"
    )
    section_citation_pattern = "limited_activity"
    if active_section_windows:
        if persistent_lead_window_count >= 2 and standout_windows >= 1:
            section_citation_pattern = "persistent_leader"
        elif high_concentration_windows >= max(1, len(active_section_windows) - 1):
            section_citation_pattern = "persistently_concentrated"
        elif len(
            {
                str((item.get("top_publications") or [{}])[0].get("title") or "").strip()
                for item in active_section_windows
                if item.get("top_publications")
            }
        ) >= 2:
            section_citation_pattern = "shifting_leaders"
        else:
            section_citation_pattern = "mixed"

    uncited_pattern = "none"
    if uncited_count > 0:
        if uncited_recent_pct >= 65.0:
            uncited_pattern = "mostly_recent"
        elif uncited_recent_pct <= 35.0:
            uncited_pattern = "mostly_older"
        else:
            uncited_pattern = "mixed_ages"

    activation_history_years = [
        int(value)
        for value in (activation_history.get("years") or [])
        if _safe_int(value) is not None
    ]
    activation_history_newly_active = [
        max(0, int(_safe_int(value) or 0))
        for value in (activation_history.get("newly_active") or [])
    ]
    activation_history_still_active = [
        max(0, int(_safe_int(value) or 0))
        for value in (activation_history.get("still_active") or [])
    ]
    activation_history_inactive = [
        max(0, int(_safe_int(value) or 0))
        for value in (activation_history.get("inactive") or [])
    ]
    activation_history_published = [
        max(0, int(_safe_int(value) or 0))
        for value in (activation_history.get("published_total") or [])
    ]
    activation_history_points: list[dict[str, Any]] = []
    for index in range(
        min(
            len(activation_history_years),
            len(activation_history_newly_active),
            len(activation_history_still_active),
            len(activation_history_inactive),
            len(activation_history_published),
        )
    ):
        published_total = activation_history_published[index]
        active_total = (
            activation_history_newly_active[index]
            + activation_history_still_active[index]
        )
        activation_history_points.append(
            {
                "year": activation_history_years[index],
                "newly_active": activation_history_newly_active[index],
                "still_active": activation_history_still_active[index],
                "inactive": activation_history_inactive[index],
                "published_total": published_total,
                "active_total": active_total,
                "active_share_pct": round(
                    (float(active_total) / float(published_total)) * 100.0, 1
                )
                if published_total > 0
                else 0.0,
            }
        )
    activation_history_last_complete_year = _safe_int(
        activation_history.get("last_complete_year")
    )
    activation_history_recent_points = activation_history_points[-5:]
    activation_history_pattern = "limited_history"
    if len(activation_history_recent_points) >= 2:
        first_recent = activation_history_recent_points[0]
        last_recent = activation_history_recent_points[-1]
        first_active_share = float(first_recent.get("active_share_pct") or 0.0)
        last_active_share = float(last_recent.get("active_share_pct") or 0.0)
        if last_active_share >= first_active_share + 10.0:
            activation_history_pattern = "broadening"
        elif last_active_share <= max(0.0, first_active_share - 10.0):
            activation_history_pattern = "narrowing"
        elif any(
            int(point.get("newly_active") or 0) > 0
            for point in activation_history_recent_points[-3:]
        ):
            activation_history_pattern = "renewing"
        else:
            activation_history_pattern = "stable"
    peak_newly_active_point = (
        max(
            activation_history_points,
            key=lambda item: (
                int(item.get("newly_active") or 0),
                int(item.get("year") or 0),
            ),
        )
        if activation_history_points
        else None
    )

    return {
        "window_id": str(selected_snapshot.get("window_id") or window_id),
        "window_label": str(selected_snapshot.get("window_label") or window_id),
        "window_phrase": str(selected_snapshot.get("window_phrase") or ""),
        "total_publications": total_publications,
        "uncited_publications_count": int(uncited_count),
        "uncited_publications_pct": float(uncited_pct),
        "uncited_recent_publications_count": int(uncited_recent_count),
        "uncited_older_publications_count": int(uncited_older_count),
        "uncited_recent_publications_pct": float(uncited_recent_pct),
        "uncited_pattern": uncited_pattern,
        "citation_scope": scope,
        "section_key": section_key,
        "driver_publications_count": int(selected_snapshot.get("driver_publications_count") or 0),
        "driver_citations": int(selected_snapshot.get("driver_citations") or 0),
        "other_citations": int(selected_snapshot.get("other_citations") or 0),
        "window_citations_total": int(selected_snapshot.get("window_citations_total") or 0),
        "driver_share_pct": float(selected_snapshot.get("driver_share_pct") or 0.0),
        "top_publication_citations": int(selected_snapshot.get("top_publication_citations") or 0),
        "top_publication_share_pct": float(selected_snapshot.get("top_publication_share_pct") or 0.0),
        "driver_pattern": str(selected_snapshot.get("driver_pattern") or "broad"),
        "top_publications": list(selected_snapshot.get("top_publications") or []),
        "citation_window_summaries": section_window_summaries,
        "citation_section_pattern": section_citation_pattern,
        "persistent_lead_title": persistent_lead_title,
        "persistent_lead_window_count": persistent_lead_window_count,
        "activation_publication_count": activation_count,
        "activation_newly_active_count": newly_active_count,
        "activation_still_active_count": still_active_count,
        "activation_inactive_count": inactive_count,
        "activation_publication_pct": activation_pct,
        "activation_pattern": activation_pattern,
        "activation_top_publications": [
            {
                "work_id": str(item.get("work_id") or ""),
                "title": str(item.get("title") or "Untitled"),
                "year": _safe_int(item.get("year")),
                "citations": int(item.get("_window_citations") or 0),
            }
            for item in activation_publications[:5]
        ],
        "activation_newly_active_publications": [
            {
                "work_id": str(item.get("work_id") or ""),
                "title": str(item.get("title") or "Untitled"),
                "year": _safe_int(item.get("year")),
                "citations": int(item.get("_window_citations") or 0),
            }
            for item in newly_active_publications[:5]
        ],
        "activation_history_points": activation_history_points,
        "activation_history_last_complete_year": activation_history_last_complete_year,
        "activation_history_pattern": activation_history_pattern,
        "activation_history_peak_newly_active_year": (
            _safe_int(peak_newly_active_point.get("year"))
            if peak_newly_active_point
            else None
        ),
        "activation_history_peak_newly_active_count": (
            int(peak_newly_active_point.get("newly_active") or 0)
            if peak_newly_active_point
            else 0
        ),
        "portfolio_context": portfolio_context,
        "data_sources": [
            str(item).strip()
            for item in (metrics.get("data_sources") or [])
            if str(item).strip()
        ],
        "computed_at": metrics.get("computed_at"),
        "metrics_status": str(metrics.get("status") or "READY"),
    }


def _build_fallback_sections(evidence: dict[str, Any]) -> list[dict[str, Any]]:
    uncited_count = max(0, int(evidence.get("uncited_publications_count") or 0))
    total_publications = max(0, int(evidence.get("total_publications") or 0))
    uncited_pct = float(evidence.get("uncited_publications_pct") or 0.0)
    uncited_recent_count = max(
        0, int(evidence.get("uncited_recent_publications_count") or 0)
    )
    uncited_pattern = str(evidence.get("uncited_pattern") or "none")
    window_phrase = str(evidence.get("window_phrase") or "in the last year")
    driver_count = max(0, int(evidence.get("driver_publications_count") or 0))
    driver_citations = max(0, int(evidence.get("driver_citations") or 0))
    total_window_citations = max(0, int(evidence.get("window_citations_total") or 0))
    driver_share_pct = float(evidence.get("driver_share_pct") or 0.0)
    top_publication_share_pct = float(evidence.get("top_publication_share_pct") or 0.0)
    driver_pattern = str(evidence.get("driver_pattern") or "broad")
    top_publications = list(evidence.get("top_publications") or [])
    citation_scope = str(evidence.get("citation_scope") or "window")
    citation_window_summaries = list(evidence.get("citation_window_summaries") or [])
    citation_section_pattern = str(evidence.get("citation_section_pattern") or "mixed")
    persistent_lead_title = str(evidence.get("persistent_lead_title") or "").strip()
    activation_count = max(0, int(evidence.get("activation_publication_count") or 0))
    activation_newly_active_count = max(
        0, int(evidence.get("activation_newly_active_count") or 0)
    )
    activation_still_active_count = max(
        0, int(evidence.get("activation_still_active_count") or 0)
    )
    activation_inactive_count = max(
        0, int(evidence.get("activation_inactive_count") or 0)
    )
    activation_pct = float(evidence.get("activation_publication_pct") or 0.0)
    activation_pattern = str(evidence.get("activation_pattern") or "none")
    activation_top_publications = list(evidence.get("activation_top_publications") or [])
    activation_newly_active_publications = list(
        evidence.get("activation_newly_active_publications") or []
    )
    activation_history_points = list(evidence.get("activation_history_points") or [])
    activation_history_last_complete_year = _safe_int(
        evidence.get("activation_history_last_complete_year")
    )
    activation_history_pattern = str(
        evidence.get("activation_history_pattern") or "limited_history"
    )
    activation_history_peak_newly_active_year = _safe_int(
        evidence.get("activation_history_peak_newly_active_year")
    )
    activation_history_peak_newly_active_count = max(
        0, int(evidence.get("activation_history_peak_newly_active_count") or 0)
    )
    portfolio_context = (
        evidence.get("portfolio_context")
        if isinstance(evidence.get("portfolio_context"), dict)
        else {}
    )
    momentum_state = str(portfolio_context.get("momentum_state") or "").strip()
    momentum_index = _safe_float(portfolio_context.get("momentum_index"))
    citations_last_12_months = _safe_int(
        portfolio_context.get("citations_last_12_months")
    )
    h_index = _safe_int(portfolio_context.get("h_index"))
    leadership_index_pct = _safe_float(portfolio_context.get("leadership_index_pct"))
    field_percentile_share_pct = _safe_float(
        portfolio_context.get("field_percentile_share_pct")
    )
    uncited_body_context = ""
    if (
        field_percentile_share_pct is not None
        and field_percentile_share_pct >= 50.0
        and uncited_pattern == "mostly_older"
    ):
        uncited_body_context = (
            f" {round(field_percentile_share_pct)}% of benchmarked papers still clear the field threshold, so that older uncited subset stands out more clearly."
        )
    elif (
        citations_last_12_months is not None
        and citations_last_12_months > 0
        and momentum_state == "Accelerating"
        and uncited_pattern in {"mostly_recent", "mixed_ages"}
    ):
        uncited_body_context = (
            f" The portfolio still added {citations_last_12_months} citations in the last 12 months, which points more to citation lag than to weak overall traction."
        )
    elif (
        citations_last_12_months is not None
        and citations_last_12_months > 0
        and momentum_state == "Slowing"
        and uncited_pattern == "mostly_older"
    ):
        uncited_body_context = (
            f" The portfolio added {citations_last_12_months} citations in the last 12 months, but momentum is currently softer."
        )
    elif (
        h_index is not None
        and h_index >= 10
        and uncited_pattern in {"mostly_older", "mixed_ages"}
    ):
        uncited_body_context = (
            f" This sits inside an h{h_index} portfolio rather than an early-stage profile."
        )

    if total_publications <= 0:
        uncited_body = "No publication records are available yet for uncited-work analysis."
        uncited_consideration_label = None
        uncited_consideration = None
    elif uncited_count <= 0:
        uncited_body = "You currently have no uncited publications in your library."
        uncited_consideration_label = None
        uncited_consideration = None
    else:
        if uncited_pattern == "mostly_recent":
            uncited_body = (
                f"Most of your {uncited_count} uncited publications ({round(uncited_pct)}%) "
                f"are recent outputs from the last {UNCITED_RECENT_YEARS} years."
                f"{uncited_body_context}"
            )
            uncited_consideration_label = "What this may mean"
            uncited_consideration = (
                "You may want to treat newer uncited papers as developing outputs rather than assuming they already have a visibility problem."
            )
        elif uncited_pattern == "mostly_older":
            uncited_body = (
                f"Your {uncited_count} uncited publications ({round(uncited_pct)}%) skew "
                "toward older papers rather than newer releases."
                f"{uncited_body_context}"
            )
            uncited_consideration_label = "What to look at"
            uncited_consideration = (
                "You may want to check whether older uncited papers need clearer linking, follow-on work, or stronger discoverability."
            )
        else:
            uncited_body = (
                f"Your {uncited_count} uncited publications ({round(uncited_pct)}%) are "
                "spread across both recent and older work."
                f"{uncited_body_context}"
            )
            uncited_consideration_label = "What to separate"
            uncited_consideration = (
                "You may want to separate newer uncited papers from older backlog so you can see where citation lag is most persistent."
            )
        if momentum_state == "Accelerating" and uncited_pattern == "mostly_recent":
            uncited_consideration_label = "How to read this"
            uncited_consideration = (
                "With momentum currently accelerating, some recent uncited papers may simply not have had enough time to convert growing attention into citations."
            )
        elif (
            field_percentile_share_pct is not None
            and field_percentile_share_pct >= 50.0
            and uncited_count > 0
            and uncited_pattern == "mostly_older"
        ):
            uncited_consideration_label = "Why it matters"
            uncited_consideration = (
                "If a strong share of your papers already perform well by field benchmarks, the older uncited subset may be worth treating as a distinct visibility problem."
            )

    if citation_scope == "section":
        active_windows = [
            item
            for item in citation_window_summaries
            if int(item.get("window_citations_total") or 0) > 0
        ]
        if not active_windows:
            citation_body = (
                "Across the last 1, 3, and 5 years, there is not enough citation activity yet to show a clear concentration pattern."
            )
            citation_consideration_label = None
            citation_consideration = None
        elif citation_section_pattern == "persistent_leader":
            leader_suffix = f" {persistent_lead_title} keeps appearing as a lead driver." if persistent_lead_title else ""
            citation_body = (
                "Across the last 1, 3, and 5 years, citation attention stays anchored to the same small part of your portfolio."
                f"{leader_suffix}"
            )
            citation_consideration_label = "What this suggests"
            citation_consideration = (
                "You may want to see whether newer papers are gaining visibility beyond your established citation leaders."
            )
        elif citation_section_pattern == "persistently_concentrated":
            citation_body = (
                "Across the last 1, 3, and 5 years, citation attention remains concentrated in a small cluster of papers rather than spreading broadly."
            )
            citation_consideration_label = "What to watch"
            citation_consideration = (
                "You may want to look at whether adjacent or newer papers are being surfaced alongside the papers that already lead."
            )
        elif citation_section_pattern == "shifting_leaders":
            citation_body = (
                "Across the last 1, 3, and 5 years, different papers lead in different windows, so citation attention is moving rather than staying fixed."
            )
            citation_consideration_label = "What this could mean"
            citation_consideration = (
                "You may want to see whether that movement reflects healthy breadth or short-term spikes around a few papers."
            )
        else:
            citation_body = (
                "Across the last 1, 3, and 5 years, citation activity is not tied to one persistent driver, even though a small leading group still stands out."
            )
            citation_consideration_label = None
            citation_consideration = None
        if leadership_index_pct is not None and leadership_index_pct >= 50.0 and citation_consideration:
            citation_consideration_label = "Portfolio implication"
            citation_consideration = (
                "Because your portfolio already shows a strong leadership profile, it may be useful to see whether citation concentration is reinforcing a narrow set of lead papers."
            )
    elif total_window_citations <= 0 or driver_count <= 0:
        citation_body = (
            f"Your citation-driver picture is limited {window_phrase} because no citations "
            "were recorded in that window."
        )
        citation_consideration_label = None
        citation_consideration = None
    else:
        titles = ", ".join(
            str(item.get("title") or "").strip()
            for item in top_publications[:2]
            if str(item.get("title") or "").strip()
        )
        title_suffix = f" Top drivers include {titles}." if titles else ""
        if driver_pattern == "single_standout":
            citation_body = (
                f"{window_phrase[:1].upper()}{window_phrase[1:]}, one standout paper is carrying "
                f"most of the top-3 activity, which together account for "
                f"{driver_citations} of {total_window_citations} citations ({round(driver_share_pct)}%).{title_suffix}"
            )
            citation_consideration_label = "What to think about"
            citation_consideration = (
                "You may want to think about how adjacent papers are surfaced if so much attention sits on one standout paper."
            )
        elif driver_pattern == "lead_paper":
            citation_body = (
                f"{window_phrase[:1].upper()}{window_phrase[1:]}, citation activity is "
                f"tilted toward one lead paper inside the top 3 ({round(top_publication_share_pct)}% of top-3 citations).{title_suffix}"
            )
            citation_consideration_label = "What to check"
            citation_consideration = (
                "You may want to check whether the rest of the portfolio is staying visible alongside the lead paper."
            )
        elif driver_pattern in {"highly_concentrated", "concentrated"}:
            citation_body = (
                f"{window_phrase[:1].upper()}{window_phrase[1:]}, a small cluster of papers is "
                f"driving citation activity, with the top 3 accounting for {round(driver_share_pct)}% of citations.{title_suffix}"
            )
            citation_consideration_label = "What to monitor"
            citation_consideration = (
                "You may want to monitor whether citation activity starts to spread across a broader part of the portfolio."
            )
        else:
            citation_body = (
                f"{window_phrase[:1].upper()}{window_phrase[1:]}, citation activity is shared "
                "across several papers, even though the top 3 still lead the window." + title_suffix
            )
            citation_consideration_label = None
            citation_consideration = None

    if total_publications <= 0:
        activation_body = "No publication records are available yet for citation-activation analysis."
        activation_consideration_label = None
        activation_consideration = None
    elif activation_count <= 0:
        activation_body = "None of your publications recorded a new citation in the last 12 months."
        activation_consideration_label = None
        activation_consideration = None
    else:
        activation_titles = ", ".join(
            str(item.get("title") or "").strip()
            for item in (activation_newly_active_publications[:2] or activation_top_publications[:2])
            if str(item.get("title") or "").strip()
        )
        activation_title_suffix = (
            f" Newly active papers include {activation_titles}." if activation_titles else ""
        )
        if activation_newly_active_count > 0 and activation_still_active_count > 0:
            activation_body = (
                f"In the last 12 months, {activation_newly_active_count} publications became newly active and "
                f"{activation_still_active_count} stayed active, while {activation_inactive_count} remained inactive."
                f"{activation_title_suffix}"
            )
            activation_consideration_label = "What this suggests"
            activation_consideration = (
                "You may want to see whether newly active papers keep converting into sustained activity rather than dropping back out."
            )
        elif activation_newly_active_count > 0:
            activation_body = (
                f"In the last 12 months, {activation_newly_active_count} of your publications became newly active, "
                f"while {activation_inactive_count} remained inactive."
                f"{activation_title_suffix}"
            )
            activation_consideration_label = "What to look at"
            activation_consideration = (
                "You may want to check whether those newly active papers are broadening the active set or only adding light activity."
            )
        else:
            activation_body = (
                f"In the last 12 months, {activation_still_active_count} publications stayed active, "
                f"but {activation_inactive_count} remained inactive, so recent attention is still concentrated in an established subset."
            )
            activation_consideration_label = "What to watch"
            activation_consideration = (
                "You may want to check whether recent citations are starting to spread beyond the same already active papers."
            )

    if not activation_history_points:
        activation_history_body = (
            "There is not yet enough complete-year citation history to describe activation over time."
        )
        activation_history_consideration_label = None
        activation_history_consideration = None
    else:
        latest_history_point = activation_history_points[-1]
        latest_year = _safe_int(latest_history_point.get("year"))
        latest_newly_active = max(0, int(latest_history_point.get("newly_active") or 0))
        latest_still_active = max(0, int(latest_history_point.get("still_active") or 0))
        resolved_latest_year = latest_year or activation_history_last_complete_year
        if activation_history_pattern == "broadening":
            activation_history_body = (
                f"Across complete years through {resolved_latest_year}, a larger share of your published portfolio is staying citation-active rather than inactive."
            )
            activation_history_consideration_label = "What this suggests"
            activation_history_consideration = (
                "You may want to see whether that broadening comes from genuinely new papers activating or from the same established papers staying active."
            )
        elif activation_history_pattern == "narrowing":
            activation_history_body = (
                f"Across complete years through {resolved_latest_year}, citation activity is narrowing into a smaller share of your published portfolio."
            )
            activation_history_consideration_label = "What to watch"
            activation_history_consideration = (
                "You may want to check whether newer papers are activating more slowly or whether older papers are dropping out of the active set."
            )
        elif activation_history_pattern == "renewing":
            activation_history_body = (
                f"Through {resolved_latest_year}, citation activity keeps adding newly active papers rather than relying only on an already active set."
            )
            activation_history_consideration_label = "How to read this"
            activation_history_consideration = (
                "You may want to compare the pace of newly active papers with how much of the portfolio still remains inactive."
            )
        else:
            activation_history_body = (
                f"Through {resolved_latest_year}, citation activity has stayed fairly steady, with {latest_newly_active} newly active and {latest_still_active} still-active papers in the latest complete year."
            )
            activation_history_consideration_label = None
            activation_history_consideration = None
        if (
            activation_history_peak_newly_active_year is not None
            and activation_history_peak_newly_active_count > 0
            and activation_history_pattern in {"renewing", "stable"}
        ):
            activation_history_consideration_label = "Peak year"
            activation_history_consideration = (
                f"The strongest year for newly active papers was {activation_history_peak_newly_active_year}, when {activation_history_peak_newly_active_count} papers activated for the first time."
            )

    return [
        {
            "key": "uncited_works",
            "title": "Uncited works",
            "headline": "Uncited works",
            "body": uncited_body,
            "consideration_label": uncited_consideration_label,
            "consideration": uncited_consideration,
            "evidence": {
                "publication_count": uncited_count,
                "publication_share_pct": round(uncited_pct, 1),
                "total_publications": total_publications,
                "recent_publication_count": uncited_recent_count,
                "recent_publication_share_pct": round(
                    float(evidence.get("uncited_recent_publications_pct") or 0.0), 1
                ),
                "pattern": uncited_pattern,
            },
        },
        {
            "key": "citation_drivers",
            "title": "Citation drivers",
            "headline": "Citation drivers",
            "body": citation_body,
            "consideration_label": citation_consideration_label,
            "consideration": citation_consideration,
            "evidence": {
                "window_id": str(evidence.get("window_id") or "1y"),
                "window_label": str(evidence.get("window_label") or "1y"),
                "window_phrase": window_phrase,
                "publication_count": driver_count,
                "citations": driver_citations,
                "other_citations": max(0, int(evidence.get("other_citations") or 0)),
                "citations_share_pct": round(driver_share_pct, 1),
                "top_publication_share_pct": round(top_publication_share_pct, 1),
                "pattern": driver_pattern,
                "section_pattern": citation_section_pattern,
                "publications": top_publications,
            },
        },
        {
            "key": "citation_activation",
            "title": "Citation activation",
            "headline": "Citation activation",
            "body": activation_body,
            "consideration_label": activation_consideration_label,
            "consideration": activation_consideration,
            "evidence": {
                "publication_count": activation_count,
                "newly_active_count": activation_newly_active_count,
                "still_active_count": activation_still_active_count,
                "inactive_count": activation_inactive_count,
                "publication_share_pct": round(activation_pct, 1),
                "total_publications": total_publications,
                "pattern": activation_pattern,
                "publications": activation_top_publications,
                "newly_active_publications": activation_newly_active_publications,
            },
        },
        {
            "key": "citation_activation_history",
            "title": "Activation over time",
            "headline": "Activation over time",
            "body": activation_history_body,
            "consideration_label": activation_history_consideration_label,
            "consideration": activation_history_consideration,
            "evidence": {
                "last_complete_year": activation_history_last_complete_year,
                "pattern": activation_history_pattern,
                "peak_newly_active_year": activation_history_peak_newly_active_year,
                "peak_newly_active_count": activation_history_peak_newly_active_count,
                "points": activation_history_points[-7:],
            },
        },
    ]


def _build_fallback_payload(evidence: dict[str, Any]) -> dict[str, Any]:
    total_publications = max(0, int(evidence.get("total_publications") or 0))
    uncited_count = max(0, int(evidence.get("uncited_publications_count") or 0))
    window_phrase = str(evidence.get("window_phrase") or "in the last year")
    total_window_citations = max(0, int(evidence.get("window_citations_total") or 0))

    if total_publications <= 0:
        overall_summary = "No publication records are available yet for insight generation."
    elif total_window_citations <= 0:
        overall_summary = (
            f"You have {uncited_count} uncited publications, and citation activity is currently limited {window_phrase}."
        )
    else:
        overall_summary = (
            f"You have {uncited_count} uncited publications, and a small set of papers is driving most citations {window_phrase}."
        )

    return {
        "overall_summary": overall_summary,
        "sections": _build_fallback_sections(evidence),
    }


def _build_prompt(evidence: dict[str, Any]) -> str:
    compact_evidence = {
        "citation_scope": evidence.get("citation_scope"),
        "window_phrase": evidence.get("window_phrase"),
        "total_publications": evidence.get("total_publications"),
        "uncited_publications_count": evidence.get("uncited_publications_count"),
        "uncited_publications_pct": round(
            float(evidence.get("uncited_publications_pct") or 0.0), 1
        ),
        "driver_publications_count": evidence.get("driver_publications_count"),
        "driver_citations": evidence.get("driver_citations"),
        "other_citations": evidence.get("other_citations"),
        "window_citations_total": evidence.get("window_citations_total"),
        "driver_share_pct": round(float(evidence.get("driver_share_pct") or 0.0), 1),
        "uncited_recent_publications_count": evidence.get(
            "uncited_recent_publications_count"
        ),
        "uncited_recent_publications_pct": round(
            float(evidence.get("uncited_recent_publications_pct") or 0.0), 1
        ),
        "uncited_pattern": evidence.get("uncited_pattern"),
        "top_publication_citations": evidence.get("top_publication_citations"),
        "top_publication_share_pct": round(
            float(evidence.get("top_publication_share_pct") or 0.0), 1
        ),
        "driver_pattern": evidence.get("driver_pattern"),
        "citation_section_pattern": evidence.get("citation_section_pattern"),
        "persistent_lead_title": evidence.get("persistent_lead_title"),
        "persistent_lead_window_count": evidence.get("persistent_lead_window_count"),
        "citation_window_summaries": evidence.get("citation_window_summaries") or [],
        "top_publications": evidence.get("top_publications") or [],
        "activation_publication_count": evidence.get("activation_publication_count"),
        "activation_newly_active_count": evidence.get(
            "activation_newly_active_count"
        ),
        "activation_still_active_count": evidence.get(
            "activation_still_active_count"
        ),
        "activation_inactive_count": evidence.get("activation_inactive_count"),
        "activation_publication_pct": round(
            float(evidence.get("activation_publication_pct") or 0.0), 1
        ),
        "activation_pattern": evidence.get("activation_pattern"),
        "activation_top_publications": evidence.get("activation_top_publications")
        or [],
        "activation_newly_active_publications": evidence.get(
            "activation_newly_active_publications"
        )
        or [],
        "activation_history_points": evidence.get("activation_history_points") or [],
        "activation_history_last_complete_year": evidence.get(
            "activation_history_last_complete_year"
        ),
        "activation_history_pattern": evidence.get("activation_history_pattern"),
        "activation_history_peak_newly_active_year": evidence.get(
            "activation_history_peak_newly_active_year"
        ),
        "activation_history_peak_newly_active_count": evidence.get(
            "activation_history_peak_newly_active_count"
        ),
        "portfolio_context": evidence.get("portfolio_context") or {},
    }
    evidence_json = json.dumps(compact_evidence, ensure_ascii=True)
    return (
        _build_publication_insight_prompt_preamble(
            request_line="This request is for the citation insights summary, covering uncited works, citation drivers, citation activation, and citation activation history.",
            allow_wider_context=True,
        )
        + "Read each section as a whole: counts, time window, concentration split, and leading papers all matter together.\n"
        "Do not just repeat the numbers or the section title. Explain what the pattern suggests inside each section.\n"
        "Avoid repetitive openings such as starting every section with 'You have'.\n"
        "Use at most one key number in each body unless a second number is necessary for contrast.\n"
        "Focus on what a strong academic reader would want to know: where citation attention concentrates, whether activation is renewing or narrowing, and whether inactivity looks like an old tail, a recent lag, or a broader problem.\n"
        "When wider portfolio context materially changes the interpretation, weave it into the main body rather than saving it only for the follow-on note.\n"
        "When you use wider context, ground it in a concrete number where possible, such as 12-month citations, h-index, field percentile share, or leadership index.\n"
        "For uncited_works, comment on whether the uncited set is mostly recent, mostly older, or mixed.\n"
        "For citation_drivers, comment on whether citations are driven by one standout paper, a small cluster, or a broader spread, and say what that concentration implies about the portfolio's citation base.\n"
        "For citation_activation, distinguish newly active papers from papers that stayed active, and comment on how much of the portfolio remains inactive.\n"
        "For citation_activation_history, interpret whether yearly activity is broadening, narrowing, renewing, or staying steady across complete years.\n"
        "If the evidence includes 1y, 3y, and 5y citation windows together, write one section-level interpretation across the whole section, not separate per-window summaries.\n"
        + _build_publication_insight_slot_guidance(multi_section=True)
        + "If you include a callout block, write it from the user's perspective and make it specific to the evidence available.\n"
        "Schema:\n"
        "{\n"
        '  "overall_summary": "optional concise summary sentence; omit or leave empty when it adds no value",\n'
        '  "sections": [\n'
        "    {\n"
        '      "key": "uncited_works" | "citation_drivers" | "citation_activation" | "citation_activation_history",\n'
        '      "headline": "short non-generic phrase",\n'
        '      "body": "main analysis in natural prose",\n'
        '      "blocks": [\n'
        '        { "kind": "paragraph", "text": "optional extra analytic paragraph" },\n'
        '        { "kind": "callout", "label": "optional brief label", "text": "optional caveat, confidence note, or next angle" }\n'
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}\n"
        "Return exactly four sections: uncited_works, citation_drivers, citation_activation, and citation_activation_history.\n"
        f"Evidence: {evidence_json}\n"
    )


def _body_is_too_generic(*, key: str, body: str, fallback_body: str) -> bool:
    normalized = str(body or "").strip().lower()
    fallback_normalized = str(fallback_body or "").strip().lower()
    if not normalized:
        return True
    if normalized == fallback_normalized:
        return False
    if key == "uncited_works":
        generic_phrases = (
            "you have uncited publications",
            "defined group of uncited publications",
            "group of uncited publications",
            "uncited publications",
        )
        if any(phrase in normalized for phrase in generic_phrases):
            return True
        if not any(char.isdigit() for char in normalized):
            return True
        if (
            "last 12 months" not in normalized
            and "field" not in normalized
            and "h" not in normalized
            and "recent" not in normalized
            and "older" not in normalized
            and "mixed" not in normalized
        ):
            return True
    if key == "citation_drivers":
        generic_phrases = (
            "driving recent citations",
            "concentrating citations",
        )
        if any(phrase in normalized for phrase in generic_phrases) and not any(
            char.isdigit() for char in normalized
        ):
            return True
    if key == "citation_activation":
        generic_phrases = (
            "publications recorded citations",
            "recent activity is present",
            "citation activation",
        )
        if any(phrase in normalized for phrase in generic_phrases) and not any(
            char.isdigit() for char in normalized
        ):
            return True
    if key == "citation_activation_history":
        generic_phrases = (
            "over time",
            "citation activity changed",
            "history is present",
        )
        if any(phrase in normalized for phrase in generic_phrases) and not any(
            char.isdigit() for char in normalized
        ):
            return True
    return False


def _coerce_model_payload(payload: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    scaffold = _build_fallback_payload(evidence)
    output_sections: list[dict[str, Any]] = []
    scaffold_by_key = {
        str(item["key"]): item for item in scaffold["sections"] if isinstance(item, dict)
    }
    for key in ("uncited_works", "citation_drivers", "citation_activation", "citation_activation_history"):
        scaffold_section = dict(scaffold_by_key[key])
        model_section = _find_generated_section(payload, key)
        if not model_section:
            raise PublicationInsightsAgentValidationError(
                f"Publication insights AI returned no section for {key}."
            )
        headline = _require_generated_text(
            text=model_section.get("headline"),
            section_key=key,
            field_name="headline",
        )
        body = _require_generated_text(
            text=model_section.get("body"),
            section_key=key,
            field_name="body",
            require_sentence_end=True,
            generic_predicate=lambda value, current_key=key: _body_is_too_generic(
                key=current_key,
                body=value,
                fallback_body="",
            ),
        )
        consideration_label, consideration = _normalize_generated_note(
            label=model_section.get("consideration_label"),
            consideration=model_section.get("consideration"),
            section_key=key,
        )
        if _body_is_too_generic(
            key=key,
            body=body,
            fallback_body="",
        ):
            raise PublicationInsightsAgentValidationError(
                f"Publication insights AI returned a generic body for {key}."
            )
        scaffold_section["headline"] = headline
        scaffold_section["body"] = body
        scaffold_section["consideration_label"] = consideration_label
        scaffold_section["consideration"] = consideration
        scaffold_section["blocks"] = model_section.get("blocks")
        output_sections.append(scaffold_section)

    overall_summary = _validate_generated_text_contract(
        text=payload.get("overall_summary"),
        section_key="citation_summary",
        field_name="overall_summary",
        allow_empty=True,
    )
    return {
        "overall_summary": overall_summary,
        "sections": output_sections,
    }


def _configured_publication_insights_model() -> str:
    return (
        str(os.getenv("PUBLICATION_INSIGHTS_AGENT_MODEL", PREFERRED_MODEL)).strip()
        or PREFERRED_MODEL
    )


def _openai_insights_enabled() -> bool:
    try:
        get_openai_api_key()
    except ConfigurationError:
        return False
    return True


def _publication_insights_availability_cache_ttl_seconds() -> int:
    raw_value = str(
        os.getenv(
            "PUBLICATION_INSIGHTS_AVAILABILITY_CACHE_TTL_SECONDS",
            str(PUBLICATION_INSIGHTS_AVAILABILITY_CACHE_TTL_SECONDS),
        )
    ).strip()
    try:
        return max(0, int(raw_value))
    except ValueError:
        return PUBLICATION_INSIGHTS_AVAILABILITY_CACHE_TTL_SECONDS


def _reset_publication_insights_availability_cache() -> None:
    global _publication_insights_availability_checked_at
    global _publication_insights_availability_value

    _publication_insights_availability_checked_at = None
    _publication_insights_availability_value = False


def _probe_publication_insights_availability() -> bool:
    if not _openai_insights_enabled():
        return False
    try:
        get_client().models.retrieve(_configured_publication_insights_model())
    except Exception:
        return False
    return True


def publication_insights_available(*, force_refresh: bool = False) -> bool:
    global _publication_insights_availability_checked_at
    global _publication_insights_availability_value

    ttl_seconds = _publication_insights_availability_cache_ttl_seconds()
    now = time.monotonic()
    if (
        not force_refresh
        and ttl_seconds > 0
        and _publication_insights_availability_checked_at is not None
        and (now - _publication_insights_availability_checked_at) < ttl_seconds
    ):
        return _publication_insights_availability_value

    available = _probe_publication_insights_availability()
    _publication_insights_availability_checked_at = now
    _publication_insights_availability_value = available
    return available


def _build_publication_insights_provenance_evidence(
    *, evidence: dict[str, Any], section_key: str | None
) -> dict[str, Any]:
    if section_key in {
        "publication_output_pattern",
        "publication_production_phase",
        "publication_year_over_year_trajectory",
    }:
        return {
            "window_phrase": evidence.get("window_phrase"),
            "total_publications": evidence.get("total_publications"),
            "scoped_publications": evidence.get("scoped_publications"),
            "first_publication_year": evidence.get("first_publication_year"),
            "last_publication_year": evidence.get("last_publication_year"),
            "active_span": evidence.get("active_span"),
            "years_with_output": evidence.get("years_with_output"),
            "gap_years": evidence.get("gap_years"),
            "longest_streak": evidence.get("longest_streak"),
            "phase_label": evidence.get("phase_label"),
            "phase_interpretation": evidence.get("phase_interpretation"),
            "consistency_index": evidence.get("consistency_index"),
            "consistency_label": evidence.get("consistency_label"),
            "burstiness_score": evidence.get("burstiness_score"),
            "burstiness_label": evidence.get("burstiness_label"),
            "peak_year_share_pct": evidence.get("peak_year_share_pct"),
            "peak_year_share_label": evidence.get("peak_year_share_label"),
            "output_continuity_pct": evidence.get("output_continuity_pct"),
            "output_continuity_label": evidence.get("output_continuity_label"),
            "average_per_active_year": evidence.get("average_per_active_year"),
            "slope": evidence.get("slope"),
            "recent_mean": evidence.get("recent_mean"),
            "earlier_mean": evidence.get("earlier_mean"),
            "momentum": evidence.get("momentum"),
            "recent_share_pct": evidence.get("recent_share_pct"),
            "peak_years": list(evidence.get("peak_years") or []),
            "peak_years_label": evidence.get("peak_years_label"),
            "peak_year_count": evidence.get("peak_year_count"),
            "peak_count": evidence.get("peak_count"),
            "peak_vs_average_ratio": evidence.get("peak_vs_average_ratio"),
            "low_years": list(evidence.get("low_years") or []),
            "low_years_label": evidence.get("low_years_label"),
            "low_count": evidence.get("low_count"),
            "standout_years": list(evidence.get("standout_years") or []),
            "low_year_position": evidence.get("low_year_position"),
            "peak_year_position": evidence.get("peak_year_position"),
            "even_annual_share_pct": evidence.get("even_annual_share_pct"),
            "recent_years_label": evidence.get("recent_years_label"),
            "earlier_years_label": evidence.get("earlier_years_label"),
            "expected_recent_share_pct": evidence.get("expected_recent_share_pct"),
            "recent_share_vs_even_ratio": evidence.get("recent_share_vs_even_ratio"),
            "includes_partial_year": evidence.get("includes_partial_year"),
            "partial_year": evidence.get("partial_year"),
            "current_pace_year": evidence.get("current_pace_year"),
            "current_pace_cutoff_label": evidence.get("current_pace_cutoff_label"),
            "current_pace_count": evidence.get("current_pace_count"),
            "current_pace_comparison_years": list(evidence.get("current_pace_comparison_years") or []),
            "current_pace_comparison_label": evidence.get("current_pace_comparison_label"),
            "current_pace_comparison_mean": evidence.get("current_pace_comparison_mean"),
            "current_pace_comparison_delta": evidence.get("current_pace_comparison_delta"),
            "current_pace_signal": evidence.get("current_pace_signal"),
            "rolling_cutoff_label": evidence.get("rolling_cutoff_label"),
            "rolling_one_year_total": evidence.get("rolling_one_year_total"),
            "rolling_one_year_pace": evidence.get("rolling_one_year_pace"),
            "rolling_one_year_window_months": evidence.get("rolling_one_year_window_months"),
            "rolling_three_year_pace": evidence.get("rolling_three_year_pace"),
            "rolling_three_year_window_months": evidence.get("rolling_three_year_window_months"),
            "rolling_prior_period_pace": evidence.get("rolling_prior_period_pace"),
            "rolling_prior_period_months": evidence.get("rolling_prior_period_months"),
            "rolling_prior_period_years": evidence.get("rolling_prior_period_years"),
            "rolling_prior_period_label": evidence.get("rolling_prior_period_label"),
            "trajectory_phase_label": evidence.get("trajectory_phase_label"),
            "high_run_years": list(evidence.get("high_run_years") or []),
            "high_run_label": evidence.get("high_run_label"),
            "high_run_min_count": evidence.get("high_run_min_count"),
            "high_run_max_count": evidence.get("high_run_max_count"),
            "high_run_mean": evidence.get("high_run_mean"),
            "last_peak_year": evidence.get("last_peak_year"),
            "years_since_last_peak": evidence.get("years_since_last_peak"),
            "post_peak_complete_years": evidence.get("post_peak_complete_years"),
            "latest_gap_from_high_run_mean": evidence.get("latest_gap_from_high_run_mean"),
            "as_of_date": evidence.get("as_of_date"),
        }
    if section_key == "publication_volume_over_time":
        return {
            "window_phrase": evidence.get("window_phrase"),
            "total_publications": evidence.get("total_publications"),
            "scoped_publications": evidence.get("scoped_publications"),
            "first_publication_year": evidence.get("first_publication_year"),
            "last_publication_year": evidence.get("last_publication_year"),
            "span_years_label": evidence.get("span_years_label"),
            "active_span": evidence.get("active_span"),
            "phase_label": evidence.get("phase_label"),
            "phase_confidence_low": evidence.get("phase_confidence_low"),
            "consistency_index": evidence.get("consistency_index"),
            "burstiness_score": evidence.get("burstiness_score"),
            "peak_year_share_pct": evidence.get("peak_year_share_pct"),
            "output_continuity_pct": evidence.get("output_continuity_pct"),
            "gap_years": evidence.get("gap_years"),
            "longest_streak": evidence.get("longest_streak"),
            "peak_year_position": evidence.get("peak_year_position"),
            "low_year_position": evidence.get("low_year_position"),
            "peak_vs_average_ratio": evidence.get("peak_vs_average_ratio"),
            "slope": evidence.get("slope"),
            "peak_years": list(evidence.get("peak_years") or []),
            "peak_count": evidence.get("peak_count"),
            "low_years": list(evidence.get("low_years") or []),
            "low_count": evidence.get("low_count"),
            "recent_mean": evidence.get("recent_mean"),
            "earlier_mean": evidence.get("earlier_mean"),
            "momentum": evidence.get("momentum"),
            "recent_years_label": evidence.get("recent_years_label"),
            "earlier_years_label": evidence.get("earlier_years_label"),
            "overall_trajectory": evidence.get("overall_trajectory"),
            "recent_position": evidence.get("recent_position"),
            "recent_detail_pattern": evidence.get("recent_detail_pattern"),
            "stronger_run_label": evidence.get("stronger_run_label"),
            "stronger_run_source": evidence.get("stronger_run_source"),
            "stronger_run_block_count": evidence.get("stronger_run_block_count"),
            "stronger_run_min_count": evidence.get("stronger_run_min_count"),
            "stronger_run_max_count": evidence.get("stronger_run_max_count"),
            "stronger_run_mean": evidence.get("stronger_run_mean"),
            "stronger_run_latest_count": evidence.get("stronger_run_latest_count"),
            "stronger_run_latest_label": evidence.get("stronger_run_latest_label"),
            "stronger_run_gap_from_mean": evidence.get("stronger_run_gap_from_mean"),
            "recent_support_strength": evidence.get("recent_support_strength"),
            "volume_read_mode": evidence.get("volume_read_mode"),
            "recent_monthly_period_label": evidence.get("recent_monthly_period_label"),
            "recent_monthly_period_end_label": evidence.get("recent_monthly_period_end_label"),
            "recent_monthly_total": evidence.get("recent_monthly_total"),
            "recent_monthly_active_months": evidence.get("recent_monthly_active_months"),
            "recent_monthly_peak_count": evidence.get("recent_monthly_peak_count"),
            "recent_monthly_peak_periods": list(evidence.get("recent_monthly_peak_periods") or []),
            "rolling_3y_period_label": evidence.get("rolling_3y_period_label"),
            "rolling_3y_blocks": list(evidence.get("rolling_3y_blocks") or []),
            "rolling_3y_start_count": evidence.get("rolling_3y_start_count"),
            "rolling_3y_latest_count": evidence.get("rolling_3y_latest_count"),
            "rolling_3y_material_direction": evidence.get("rolling_3y_material_direction"),
            "rolling_5y_period_label": evidence.get("rolling_5y_period_label"),
            "rolling_5y_blocks": list(evidence.get("rolling_5y_blocks") or []),
            "rolling_5y_start_count": evidence.get("rolling_5y_start_count"),
            "rolling_5y_latest_count": evidence.get("rolling_5y_latest_count"),
            "rolling_5y_material_direction": evidence.get("rolling_5y_material_direction"),
            "table_counts_by_window": dict(evidence.get("table_counts_by_window") or {}),
            "table_recent_count": evidence.get("table_recent_count"),
            "table_recent_range_label": evidence.get("table_recent_range_label"),
            "table_recent_titles": list(evidence.get("table_recent_titles") or []),
            "table_recent_article_types": list(evidence.get("table_recent_article_types") or []),
            "table_recent_precision_counts": dict(evidence.get("table_recent_precision_counts") or {}),
            "table_most_recent_date": evidence.get("table_most_recent_date"),
            "table_most_recent_title": evidence.get("table_most_recent_title"),
            "as_of_date": evidence.get("as_of_date"),
        }
    if section_key == "publication_article_type_over_time":
        return {
            "window_phrase": evidence.get("window_phrase"),
            "total_publications": evidence.get("total_publications"),
            "first_publication_year": evidence.get("first_publication_year"),
            "last_publication_year": evidence.get("last_publication_year"),
            "span_years_label": evidence.get("span_years_label"),
            "all_window": dict(evidence.get("all_window") or {}),
            "five_year_window": dict(evidence.get("five_year_window") or {}),
            "three_year_window": dict(evidence.get("three_year_window") or {}),
            "one_year_window": dict(evidence.get("one_year_window") or {}),
            "latest_window": dict(evidence.get("latest_window") or {}),
            "full_record_mix_state": evidence.get("full_record_mix_state"),
            "recent_window_change_state": evidence.get("recent_window_change_state"),
            "recent_window_confidence": evidence.get("recent_window_confidence"),
            "recent_breadth_direction": evidence.get("recent_breadth_direction"),
            "five_matches_all": evidence.get("five_matches_all"),
            "three_matches_all": evidence.get("three_matches_all"),
            "one_matches_all": evidence.get("one_matches_all"),
            "latest_year_is_partial": evidence.get("latest_year_is_partial"),
            "latest_partial_year_label": evidence.get("latest_partial_year_label"),
            "latest_window_total_count": evidence.get("latest_window_total_count"),
            "as_of_date": evidence.get("as_of_date"),
        }
    if section_key == "publication_type_over_time":
        return {
            "window_phrase": evidence.get("window_phrase"),
            "total_publications": evidence.get("total_publications"),
            "first_publication_year": evidence.get("first_publication_year"),
            "last_publication_year": evidence.get("last_publication_year"),
            "span_years_label": evidence.get("span_years_label"),
            "all_window": dict(evidence.get("all_window") or {}),
            "five_year_window": dict(evidence.get("five_year_window") or {}),
            "three_year_window": dict(evidence.get("three_year_window") or {}),
            "one_year_window": dict(evidence.get("one_year_window") or {}),
            "latest_window": dict(evidence.get("latest_window") or {}),
            "full_record_mix_state": evidence.get("full_record_mix_state"),
            "recent_window_change_state": evidence.get("recent_window_change_state"),
            "recent_window_confidence": evidence.get("recent_window_confidence"),
            "recent_breadth_direction": evidence.get("recent_breadth_direction"),
            "five_matches_all": evidence.get("five_matches_all"),
            "three_matches_all": evidence.get("three_matches_all"),
            "one_matches_all": evidence.get("one_matches_all"),
            "latest_year_is_partial": evidence.get("latest_year_is_partial"),
            "latest_partial_year_label": evidence.get("latest_partial_year_label"),
            "latest_window_total_count": evidence.get("latest_window_total_count"),
            "as_of_date": evidence.get("as_of_date"),
        }

    return {
        "window_phrase": evidence.get("window_phrase"),
        "total_publications": evidence.get("total_publications"),
        "uncited_publications_count": evidence.get(
            "uncited_publications_count"
        ),
        "uncited_publications_pct": round(
            float(evidence.get("uncited_publications_pct") or 0.0), 1
        ),
        "uncited_recent_publications_count": evidence.get(
            "uncited_recent_publications_count"
        ),
        "uncited_recent_publications_pct": round(
            float(evidence.get("uncited_recent_publications_pct") or 0.0), 1
        ),
        "uncited_pattern": evidence.get("uncited_pattern"),
        "driver_publications_count": evidence.get(
            "driver_publications_count"
        ),
        "driver_citations": evidence.get("driver_citations"),
        "other_citations": evidence.get("other_citations"),
        "window_citations_total": evidence.get("window_citations_total"),
        "driver_share_pct": round(
            float(evidence.get("driver_share_pct") or 0.0), 1
        ),
        "top_publication_citations": evidence.get(
            "top_publication_citations"
        ),
        "top_publication_share_pct": round(
            float(evidence.get("top_publication_share_pct") or 0.0), 1
        ),
        "driver_pattern": evidence.get("driver_pattern"),
        "top_publications": list(evidence.get("top_publications") or []),
    }


def generate_publication_insights_agent_draft(
    *,
    user_id: str,
    window_id: Literal["1y", "3y", "5y", "all"] = "1y",
    section_key: Literal[
        "uncited_works", "citation_drivers", "citation_activation", "citation_activation_history", "publication_output_pattern", "publication_production_phase", "publication_year_over_year_trajectory", "publication_volume_over_time", "publication_article_type_over_time", "publication_type_over_time"
    ]
    | None = None,
    scope: Literal["window", "section"] = "window",
    ui_context: str | None = None,
) -> dict[str, Any]:
    if section_key == "publication_output_pattern":
        evidence = _build_publication_output_pattern_evidence(user_id=user_id)
        request_input: Any = _build_publication_output_pattern_prompt(evidence)
    elif section_key == "publication_production_phase":
        evidence = _build_publication_production_phase_evidence(user_id=user_id)
        request_input = _build_publication_production_phase_prompt(evidence)
    elif section_key == "publication_year_over_year_trajectory":
        evidence = _build_publication_year_over_year_trajectory_evidence(user_id=user_id)
        request_input = _build_publication_year_over_year_trajectory_prompt(evidence)
    elif section_key == "publication_volume_over_time":
        evidence = _build_publication_volume_over_time_evidence(user_id=user_id)
        request_input = _build_publication_volume_over_time_prompt(evidence)
    elif section_key == "publication_article_type_over_time":
        evidence = _build_publication_article_type_over_time_evidence(user_id=user_id)
        request_input = _build_publication_article_type_over_time_prompt(evidence)
    elif section_key == "publication_type_over_time":
        evidence = _build_publication_type_over_time_evidence(user_id=user_id)
        request_input = _build_publication_type_over_time_prompt(evidence)
    else:
        evidence = _build_evidence(
            user_id=user_id,
            window_id=str(window_id),
            section_key=section_key,
            scope=scope,
        )
        request_input = _build_prompt(evidence)
    if str(ui_context or "").strip():
        evidence["ui_context"] = str(ui_context).strip()
        if section_key == "publication_output_pattern":
            request_input = _build_publication_output_pattern_prompt(evidence)
        elif section_key == "publication_production_phase":
            request_input = _build_publication_production_phase_prompt(evidence)
        elif section_key == "publication_year_over_year_trajectory":
            request_input = _build_publication_year_over_year_trajectory_prompt(
                evidence
            )
        elif section_key == "publication_volume_over_time":
            request_input = _build_publication_volume_over_time_prompt(evidence)
        elif section_key == "publication_article_type_over_time":
            request_input = _build_publication_article_type_over_time_prompt(evidence)
        elif section_key == "publication_type_over_time":
            request_input = _build_publication_type_over_time_prompt(evidence)
    if not _openai_insights_enabled():
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI is not configured."
        )

    model_used = _configured_publication_insights_model()
    text_config = (
        _publication_output_pattern_text_config()
        if section_key == "publication_output_pattern"
        else _publication_production_phase_text_config()
        if section_key == "publication_production_phase"
        else _publication_year_over_year_trajectory_text_config()
        if section_key == "publication_year_over_year_trajectory"
        else _publication_article_type_over_time_text_config()
        if section_key == "publication_article_type_over_time"
        else _publication_type_over_time_text_config()
        if section_key == "publication_type_over_time"
        else _publication_insights_text_config()
    )
    max_output_tokens = (
        _publication_output_pattern_max_output_tokens()
        if section_key == "publication_output_pattern"
        else _publication_production_phase_max_output_tokens()
        if section_key == "publication_production_phase"
        else _publication_year_over_year_trajectory_max_output_tokens()
        if section_key == "publication_year_over_year_trajectory"
        else _publication_mix_max_output_tokens()
        if section_key in {"publication_article_type_over_time", "publication_type_over_time"}
        else _publication_insights_max_output_tokens()
    )
    response_create_kwargs: dict[str, Any] = {}
    if section_key in {
        "publication_output_pattern",
        "publication_production_phase",
        "publication_year_over_year_trajectory",
        "publication_article_type_over_time",
        "publication_type_over_time",
    }:
        response_create_kwargs["store"] = False
    try:
        response = create_response(
            model=model_used,
            input=request_input,
            max_output_tokens=max_output_tokens,
            text=text_config,
            reasoning={"effort": _publication_insights_reasoning_effort()},
            timeout=_publication_insights_openai_timeout_seconds(),
            max_retries=0,
            **response_create_kwargs,
        )
    except Exception as exc:
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI generation failed."
        ) from exc

    response_status = str(getattr(response, "status", "") or "").strip().lower()
    if response_status == "incomplete":
        incomplete_details = getattr(response, "incomplete_details", None)
        reason = str(getattr(incomplete_details, "reason", "") or "").strip() or "unknown_reason"
        raise PublicationInsightsAgentValidationError(
            f"Publication insights AI response was incomplete ({reason})."
        )

    output_text = str(getattr(response, "output_text", "") or "")
    if not output_text.strip():
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned an empty body."
        )

    try:
        model_payload = _extract_json_object(output_text)
    except ValueError as exc:
        raise PublicationInsightsAgentValidationError(
            "Publication insights AI returned invalid JSON."
        ) from exc

    payload = (
        _coerce_publication_volume_over_time_payload(model_payload, evidence)
        if section_key == "publication_volume_over_time"
        else _coerce_publication_article_type_over_time_payload(model_payload, evidence)
        if section_key == "publication_article_type_over_time"
        else _coerce_publication_type_over_time_payload(model_payload, evidence)
        if section_key == "publication_type_over_time"
        else _coerce_publication_output_pattern_payload(model_payload, evidence)
        if section_key == "publication_output_pattern"
        else _coerce_publication_production_phase_payload(model_payload, evidence)
        if section_key == "publication_production_phase"
        else _coerce_publication_year_over_year_trajectory_payload(
            model_payload, evidence
        )
        if section_key == "publication_year_over_year_trajectory"
        else _coerce_model_payload(model_payload, evidence)
    )
    sections = _finalize_publication_insight_sections(
        list(payload.get("sections") or [])
    )

    return {
        "agent_name": AGENT_NAME,
        "status": "draft",
        "window_id": str(evidence.get("window_id") or "1y"),
        "window_label": str(evidence.get("window_label") or "1y"),
        "overall_summary": str(payload.get("overall_summary") or ""),
        "sections": sections,
        "provenance": {
            "source": "publication_metrics_bundle",
            "data_sources": list(evidence.get("data_sources") or []),
            "generated_at": _utcnow(),
            "generation_mode": "openai",
            "model": model_used,
            "prompt_version": PROMPT_VERSION,
            "metrics_status": str(evidence.get("metrics_status") or "READY"),
            "evidence": _build_publication_insights_provenance_evidence(
                evidence=evidence, section_key=section_key
            ),
        },
    }

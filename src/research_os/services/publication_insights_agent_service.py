from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import json
import math
import os
import re
from collections import Counter
from typing import Any, Literal

from research_os.clients.openai_client import create_response
from research_os.config import ConfigurationError
from research_os.config import get_openai_api_key
from research_os.services.publication_metrics_service import (
    PublicationMetricsNotFoundError,
    get_publication_top_metrics,
)

AGENT_NAME = "Publication insights agent"
PROMPT_VERSION = "publication_insights_agent_v7"
PREFERRED_MODEL = "gpt-5.2"
FALLBACK_MODEL = "gpt-4.1-mini"

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
DEFAULT_PUBLICATION_INSIGHTS_OPENAI_TIMEOUT_SECONDS = 20.0


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
    "conference-abstract": "Conference abstract",
    "meeting-abstract": "Conference abstract",
    "conference-paper": "Conference abstract",
    "conference-poster": "Conference abstract",
    "conference-presentation": "Conference abstract",
    "proceedings-article": "Conference abstract",
    "proceedings": "Conference abstract",
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


def _trim_publication_output_pattern_text(
    text: str | None, *, max_chars: int, require_sentence_end: bool = False
) -> str:
    clean = re.sub(r"\s+", " ", str(text or "").strip())
    if not clean:
        return ""
    if len(clean) <= max_chars:
        return clean
    snippet = clean[: max_chars + 1]
    sentence_cutoff = max(snippet.rfind(". "), snippet.rfind("! "), snippet.rfind("? "))
    if sentence_cutoff >= max(32, int(max_chars * 0.55)):
        return snippet[: sentence_cutoff + 1].strip()
    if require_sentence_end:
        return ""
    word_cutoff = snippet.rfind(" ")
    if word_cutoff >= max(24, int(max_chars * 0.45)):
        return snippet[:word_cutoff].rstrip(",;:- ").strip()
    return snippet[:max_chars].rstrip(",;:- ").strip()


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

    return {
        "metrics_status": "READY",
        "window_id": "all",
        "window_label": "All",
        "window_phrase": "across completed publication years",
        "data_sources": tile.get("data_source") or [],
        "portfolio_context": _build_portfolio_context(metrics),
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
        "current_pace_year": current_pace_summary["current_pace_year"],
        "current_pace_cutoff_label": current_pace_summary["current_pace_cutoff_label"],
        "current_pace_count": current_pace_summary["current_pace_count"],
        "current_pace_comparison_years": current_pace_summary["current_pace_comparison_years"],
        "current_pace_comparison_label": current_pace_summary["current_pace_comparison_label"],
        "current_pace_comparison_mean": current_pace_summary["current_pace_comparison_mean"],
        "current_pace_comparison_delta": current_pace_summary["current_pace_comparison_delta"],
        "current_pace_signal": current_pace_summary["current_pace_signal"],
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


def _build_publication_output_pattern_shape_phrase(evidence: dict[str, Any]) -> str:
    consistency_label = str(evidence.get("consistency_label") or "").strip().lower() or None
    burstiness_label = str(evidence.get("burstiness_label") or "").strip().lower() or None

    if consistency_label and burstiness_label:
        return (
            f"year-to-year variation reads as {consistency_label}, while spike structure is {burstiness_label}"
        )
    if consistency_label:
        return f"year-to-year variation reads as {consistency_label}"
    if burstiness_label:
        return f"spike structure is {burstiness_label}"
    return "variation and spike structure remain mixed"


def _build_publication_output_pattern_peak_share_note(
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
            "Peak share",
            (
                "Peak-year share is calculated per strongest year. "
                f"With tied peaks in {_format_year_list(peak_years)}, each year contributes "
                f"{peak_count} {publication_noun} ({per_year_share_label}), and together those peaks account for about "
                f"{combined_share_label} of the record."
            ),
        )

    return (
        "Peak share",
        (
            "Peak-year share is the share carried by the single strongest year. "
            f"{peak_years[0]} contributes {peak_count} of {scoped_publications} publications ({per_year_share_label})."
        ),
    )


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
    phase_confidence_low = bool(evidence.get("phase_confidence_low"))
    phase_confidence_note = str(evidence.get("phase_confidence_note") or "").strip() or None
    shape_phrase = _build_publication_output_pattern_shape_phrase(evidence)
    peak_share_label, peak_share_note = _build_publication_output_pattern_peak_share_note(evidence)
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

        if peak_share_label and peak_share_note and len(peak_years) > 1:
            consideration_label = peak_share_label
            consideration = peak_share_note
        elif recent_share_pct is not None and recent_years_label and phase_label in {"Scaling", "Rebuilding"}:
            consideration_label = "Recent build"
            consideration = (
                f"{round(recent_share_pct)}% of publications fall in {recent_years_label}, reinforcing that the pattern is being driven by the recent part of the span."
            )
        elif peak_share_label and peak_share_note:
            consideration_label = peak_share_label
            consideration = peak_share_note
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
    continuity_summary = _format_publication_production_phase_continuity_summary(evidence)
    peak_years = [
        int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None
    ]
    peak_count = _safe_int(evidence.get("peak_count"))
    latest_year = _safe_int(evidence.get("latest_year"))
    latest_output_count = _safe_int(evidence.get("latest_output_count"))
    peak_years_label = _format_year_list(peak_years) if peak_years else None

    if phase_label == "Plateauing":
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
    headline = _build_publication_production_phase_headline(evidence)

    if insufficient_history:
        body = "There is not yet enough complete publication history to classify your current production phase confidently."
        consideration_label = "Confidence"
        consideration = confidence_note or "Wait for more complete publication years before reading this as a stable phase."
    else:
        body = _build_publication_production_phase_body(evidence)

        if current_pace_summary:
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
    return {
        "metrics_status": "READY",
        "window_id": "all",
        "window_label": "All",
        "window_phrase": "across all publication-volume views",
        "data_sources": tile.get("data_source") or [],
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
        "as_of_date": as_of_date.isoformat(),
    }


def _build_publication_volume_over_time_headline(evidence: dict[str, Any]) -> str:
    overall_trajectory = str(evidence.get("overall_trajectory") or "").strip()
    recent_position = str(evidence.get("recent_position") or "").strip()
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
            opening = "The latest 5-year, 3-year, and 12-month views all sit below the stronger middle-to-late part of the record, so recent volume now looks genuinely softer than your earlier high-water mark"
    elif recent_position in {"recently_stronger", "recent_rebound", "longer_run_strength"}:
        opening = "The latest 5-year, 3-year, and 12-month views are reinforcing the broader record rather than pulling away from it"
    elif recent_position == "recently_in_line":
        opening = "The latest 5-year, 3-year, and 12-month views are not materially changing the broader reading"
    elif recent_position == "no_recent_output":
        opening = "The latest 12-month window is currently empty enough to leave the recent end of the record distinctly quieter than the rest of the span"
    elif recent_position == "longer_run_softening":
        opening = "The latest 5-year view ends softer than its earlier blocks, which puts a drag on the recent end of the record even though the shorter window is more mixed"
    else:
        opening = "The latest windows are giving a mixed recent read against the longer-run record"

    monthly_context = (
        f"{recent_monthly_total} publication{'s' if recent_monthly_total != 1 else ''} across {recent_monthly_active_months} active month{'s' if recent_monthly_active_months != 1 else ''} in the latest 12 completed months"
        if recent_monthly_total > 0
        else "no publications in the latest 12 completed months"
    )
    if recent_monthly_period_end_label:
        monthly_context = f"{monthly_context}, through {recent_monthly_period_end_label}"
    detail_clause = _build_publication_volume_recent_detail_clause(evidence)
    return f"{opening}, with {monthly_context}, and {detail_clause}."


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

    body = (
        f"{_build_publication_volume_overall_clause(evidence)} "
        f"{_build_publication_volume_recent_clause(evidence)}"
    ).strip()

    if phase_confidence_low and phase_confidence_note:
        consideration_label = "Confidence"
        consideration = phase_confidence_note
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


def _build_publication_article_type_over_time_headline(evidence: dict[str, Any]) -> str:
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    full_record_mix_state = str(evidence.get("full_record_mix_state") or "").strip()
    if recent_window_change_state == "short_record":
        return "Early mix read"
    if recent_window_change_state in {"late_leader_shift", "leader_shift"}:
        return "Recent mix shift"
    if recent_window_change_state in {
        "same_leader_more_concentrated",
        "same_leader_narrower",
    }:
        return "Tighter recent mix"
    if recent_window_change_state == "broader_recent":
        return "Broader recent mix"
    if full_record_mix_state in {"mixed", "tied_lead"}:
        return "Mixed article mix"
    return "Stable article mix"


def _build_publication_article_type_over_time_full_record_clause(
    evidence: dict[str, Any]
) -> str:
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    span_years_label = str(evidence.get("span_years_label") or "").strip() or "the full record"
    top_labels = [str(label).strip() for label in (all_window.get("top_labels") or []) if str(label).strip()]
    if not top_labels:
        return "Article-type data is not available yet."
    top_label_text = _format_period_list(top_labels)
    top_count = max(0, int(all_window.get("top_count") or 0))
    total_count = max(0, int(all_window.get("total_count") or 0))
    top_share_pct = _safe_float(all_window.get("top_share_pct"))
    second_label = str(all_window.get("second_label") or "").strip() or None
    second_share_pct = _safe_float(all_window.get("second_share_pct"))
    distinct_type_count = max(0, int(all_window.get("distinct_type_count") or 0))
    if len(top_labels) > 1:
        return (
            f"Across {span_years_label}, the leading article types are {top_label_text}, "
            f"with {top_count} publications each, so the long-run mix is shared rather than led by one type."
        )
    if top_share_pct is not None and top_share_pct < 45:
        return (
            f"Across {span_years_label}, {top_label_text} is the largest article type at "
            f"{round(top_share_pct)}% of publications, so the full record stays relatively broad."
        )
    secondary_clause = (
        f", ahead of {second_label} at {round(second_share_pct)}%"
        if second_label and second_share_pct is not None
        else ""
    )
    return (
        f"Across {span_years_label}, {top_label_text} anchors the full record with "
        f"{top_count} of {total_count} publications ({round(top_share_pct or 0)}%){secondary_clause}, "
        f"and {distinct_type_count} visible article types appear overall."
    )


def _build_publication_article_type_over_time_recent_clause(
    evidence: dict[str, Any]
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
    latest_window = evidence.get("latest_window") if isinstance(evidence.get("latest_window"), dict) else {}
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    recent_window_confidence = str(
        evidence.get("recent_window_confidence") or ""
    ).strip()
    all_leader = _format_period_list(list(all_window.get("top_labels") or []))
    latest_leader = _format_period_list(list(latest_window.get("top_labels") or []))
    latest_top_share_pct = _safe_float(latest_window.get("top_share_pct"))
    all_top_share_pct = _safe_float(all_window.get("top_share_pct"))
    latest_range_label = str(latest_window.get("range_label") or "").strip() or "the latest window"
    one_year_range_label = str(one_year_window.get("range_label") or "").strip() or None
    one_year_view_label = (
        f"the latest 1-year view ({one_year_range_label})"
        if one_year_range_label
        else "the latest 1-year view"
    )
    latest_distinct_type_count = max(0, int(latest_window.get("distinct_type_count") or 0))
    all_distinct_type_count = max(0, int(all_window.get("distinct_type_count") or 0))
    latest_window_total_count = max(0, int(evidence.get("latest_window_total_count") or 0))
    latest_partial_year_label = str(evidence.get("latest_partial_year_label") or "").strip() or None
    if recent_window_change_state == "short_record":
        sentence = (
            "Recent windows still collapse into much the same years as the full record, "
            "so there is not yet enough separation to call this a settled shift in article mix."
        )
    elif recent_window_change_state == "late_leader_shift":
        five_label = str(five_year_window.get("range_label") or "").strip() or "the latest 5-year window"
        three_label = str(three_year_window.get("range_label") or "").strip() or "the latest 3-year window"
        sentence = (
            f"The 5-year view ({five_label}) still keeps {all_leader} in front, but "
            f"the 3-year ({three_label}) and {one_year_view_label} move toward {latest_leader}, "
            "so the newer mix is tilting rather than simply shrinking."
        )
    elif recent_window_change_state == "leader_shift":
        sentence = (
            f"The latest windows move toward {latest_leader} instead of the full-record lead of {all_leader}, "
            "so the recent mix is not just a smaller copy of the longer-run portfolio."
        )
    elif recent_window_change_state == "same_leader_more_concentrated":
        sentence = (
            f"{all_leader} still leads, but it rises to {round(latest_top_share_pct or 0)}% in "
            f"{latest_range_label} versus {round(all_top_share_pct or 0)}% across the full record, "
            "so the recent mix is tightening around one type."
        )
    elif recent_window_change_state == "same_leader_narrower":
        sentence = (
            f"{all_leader} still leads, but {one_year_view_label} narrows to "
            f"{latest_distinct_type_count} visible type{'s' if latest_distinct_type_count != 1 else ''} "
            f"rather than {all_distinct_type_count} across the full record."
        )
    elif recent_window_change_state == "broader_recent":
        sentence = (
            f"{one_year_view_label} brings more secondary types into view than the full record, "
            "so the latest mix looks broader rather than more concentrated."
        )
    else:
        sentence = (
            "The 5-year, 3-year, and 1-year views broadly preserve the same article-type centre of gravity "
            "as the full record."
        )
    if recent_window_confidence == "too_thin":
        partial_clause = (
            f" and includes {latest_partial_year_label}"
            if latest_partial_year_label
            else ""
        )
        sentence += (
            f" Even so, {one_year_view_label} only contains {latest_window_total_count} "
            f"publication{'s' if latest_window_total_count != 1 else ''}{partial_clause}, so that newest ordering is still thin."
        )
    elif recent_window_confidence == "partial_current_year" and latest_partial_year_label:
        sentence += (
            f" Because the latest 1-year view includes {latest_partial_year_label}, "
            "that newest ordering can still move."
        )
    elif recent_window_confidence == "thin":
        sentence += (
            f" With only {latest_window_total_count} publications in the latest 1-year view, "
            "that recent read is still relatively lightweight."
        )
    return sentence


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
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    latest_window_total_count = max(0, int(evidence.get("latest_window_total_count") or 0))
    latest_partial_year_label = str(evidence.get("latest_partial_year_label") or "").strip() or None
    if latest_window_total_count <= 3:
        consideration_label = "Recent window"
        partial_clause = (
            f" and includes {latest_partial_year_label}"
            if latest_partial_year_label
            else ""
        )
        consideration = (
            f"Because the latest 1-year view only contains {latest_window_total_count} "
            f"publication{'s' if latest_window_total_count != 1 else ''}{partial_clause}, "
            "treat that newest ordering as directional rather than settled."
        )
    elif latest_partial_year_label:
        consideration_label = "Partial year"
        consideration = (
            f"The latest 1-year view includes {latest_partial_year_label}, so the newest ordering can still move as more publications land."
        )
    elif recent_window_change_state == "late_leader_shift":
        consideration_label = "How to read it"
        consideration = (
            "The shift shows up mainly in the shorter recent windows, so read it as a newer tilt rather than a full replacement of the long-run mix."
        )
    elif recent_window_change_state == "broader_recent":
        consideration_label = "Breadth"
        consideration = (
            "More secondary article types appear in the latest window, so the recent mix is broadening rather than simply flipping leaders."
        )
    elif recent_window_change_state in {
        "same_leader_more_concentrated",
        "same_leader_narrower",
    }:
        consideration_label = "Concentration"
        consideration = (
            "The leading type is still the same one, so the main change is how concentrated the recent mix has become."
        )
    else:
        consideration_label = None
        consideration = None
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
        "Use only the evidence provided. Do not invent causes, mechanisms, advice, or future outcomes.\n"
        "Lead with the structural story, not the metric label.\n"
        "Prefer the fewest concrete numbers that materially change the interpretation.\n"
        "Choose comparisons that earn their place: earlier versus later, anchor versus challenger, broad versus concentrated, persistent versus provisional.\n"
        "If a short recent window is thin, demote it to a qualifier rather than letting it carry the main claim.\n"
        "Do not narrate the interface or restate obvious section labels, charts, tables, toggles, or controls.\n"
        "Avoid product-copy phrases such as 'this means', 'current stage reads as', 'based on your metrics', or 'over time' in place of analysis.\n"
        f"{wider_context_line}"
        "Write directly to the user in plain English.\n"
    )


def _build_publication_insight_note_guidance() -> str:
    return (
        "Only include the follow-on note when it adds a distinct reading aid, caution, or confidence qualifier.\n"
        "If you include a follow-on note, use a short specific label such as Signal strength, Live year, Coverage, Recent signal, Peak structure, or Read this.\n"
        "Do not default to a generic label if a sharper one is available.\n"
    )


def _build_publication_output_pattern_prompt(evidence: dict[str, Any]) -> str:
    compact_evidence = {
        "total_publications": evidence.get("total_publications"),
        "scoped_publications": evidence.get("scoped_publications"),
        "first_publication_year": evidence.get("first_publication_year"),
        "last_publication_year": evidence.get("last_publication_year"),
        "span_years_label": evidence.get("span_years_label"),
        "active_span": evidence.get("active_span"),
        "years_with_output": evidence.get("years_with_output"),
        "gap_years": evidence.get("gap_years"),
        "longest_streak": evidence.get("longest_streak"),
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
        "peak_years": evidence.get("peak_years") or [],
        "peak_years_label": evidence.get("peak_years_label"),
        "peak_year_count": evidence.get("peak_year_count"),
        "peak_count": evidence.get("peak_count"),
        "peak_vs_average_ratio": evidence.get("peak_vs_average_ratio"),
        "low_years": evidence.get("low_years") or [],
        "low_years_label": evidence.get("low_years_label"),
        "low_count": evidence.get("low_count"),
        "standout_years": evidence.get("standout_years") or [],
        "low_year_position": evidence.get("low_year_position"),
        "peak_year_position": evidence.get("peak_year_position"),
        "even_annual_share_pct": evidence.get("even_annual_share_pct"),
        "recent_mean": evidence.get("recent_mean"),
        "earlier_mean": evidence.get("earlier_mean"),
        "recent_output_count": evidence.get("recent_output_count"),
        "earlier_output_count": evidence.get("earlier_output_count"),
        "recent_share_pct": evidence.get("recent_share_pct"),
        "expected_recent_share_pct": evidence.get("expected_recent_share_pct"),
        "recent_share_vs_even_ratio": evidence.get("recent_share_vs_even_ratio"),
        "recent_window_size": evidence.get("recent_window_size"),
        "recent_years": evidence.get("recent_years") or [],
        "recent_years_label": evidence.get("recent_years_label"),
        "earlier_years": evidence.get("earlier_years") or [],
        "earlier_years_label": evidence.get("earlier_years_label"),
        "momentum": evidence.get("momentum"),
        "phase_label": evidence.get("phase_label"),
        "phase_interpretation": evidence.get("phase_interpretation"),
        "phase_confidence_low": evidence.get("phase_confidence_low"),
        "phase_confidence_note": evidence.get("phase_confidence_note"),
        "historical_gap_years_present": evidence.get("historical_gap_years_present"),
        "year_series": evidence.get("year_series") or [],
        "portfolio_context": evidence.get("portfolio_context") or {},
    }
    evidence_json = json.dumps(compact_evidence, ensure_ascii=True)
    return (
        _build_publication_insight_prompt_preamble(
            request_line="This request is for the Publication Production Pattern insight, using publication counts by year only.",
            allow_wider_context=True,
        )
        + "The user has already seen the tiles and metric labels. Do not repeat the labels back to them.\n"
        "Your job is to synthesize the whole publication-output shape from the evidence bundle.\n"
        "This section now stands in for the four tile explainers, so make clear what consistency, burstiness, peak-year share, and years-with-output are collectively saying.\n"
        "Explain what is driving the pattern by combining phase, continuity, consistency, burstiness, concentration, peak years, quiet years, and recent-versus-earlier output.\n"
        "Distinguish structural pattern from career-stage effects when the evidence supports that distinction.\n"
        "If the quietest years are concentrated early in the span, say that explicitly and frame it as early build-up when supported.\n"
        "If the quietest years are recent, say that explicitly and frame it as flattening or decline only when the recent mean and momentum support that.\n"
        "If several peak years tie, say that explicitly and clarify that peak-year share is per tied peak year rather than one combined super-year.\n"
        "If there are no gap years, say that explicitly. If there are gap years, explain whether they matter to the overall reading.\n"
        "If the peak-year share is low, make clear that the record is not dominated by one isolated year even if output later steps up.\n"
        "If recent output is stronger than an even spread across the span would suggest, use that to explain why the phase reads as scaling or rebuilding.\n"
        "Do not speculate about a partial year, year-to-date data, or an incomplete current year unless the evidence explicitly says includes_partial_year is true.\n"
        "Use actual years or year ranges when they help the interpretation.\n"
        "Do not just say the record is steady or growing. Explain why it reads that way from the evidence.\n"
        "The headline should summarize the shape in 2 to 4 words and should not be generic.\n"
        "The body should be 2 short sentences, about 45 to 75 words total, and should integrate at least 3 distinct signals from the evidence.\n"
        "The body should sound like an analyst's reading of the whole pattern, not a paraphrase of one metric.\n"
        + _build_publication_insight_note_guidance()
        + "The consideration should add one genuinely useful nuance, caution, or reading aid, not a repeat of the body.\n"
        "Schema:\n"
        "{\n"
        '  "overall_summary": "string",\n'
        '  "sections": [\n'
        "    {\n"
        '      "key": "publication_output_pattern",\n'
        '      "headline": "2-4 words",\n'
        '      "body": "2 sentences, about 45-75 words",\n'
        '      "consideration_label": "optional, max 4 words",\n'
        '      "consideration": "optional, max 35 words"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Return exactly one section: publication_output_pattern.\n"
        f"Evidence: {evidence_json}\n"
    )


def _build_publication_production_phase_prompt(evidence: dict[str, Any]) -> str:
    compact_evidence = {
        "phase_label": evidence.get("phase_label"),
        "phase_interpretation": evidence.get("phase_interpretation"),
        "phase_confidence_low": evidence.get("phase_confidence_low"),
        "phase_confidence_note": evidence.get("phase_confidence_note"),
        "first_publication_year": evidence.get("first_publication_year"),
        "last_publication_year": evidence.get("last_publication_year"),
        "span_years_label": evidence.get("span_years_label"),
        "active_span": evidence.get("active_span"),
        "years_with_output": evidence.get("years_with_output"),
        "gap_years": evidence.get("gap_years"),
        "longest_streak": evidence.get("longest_streak"),
        "slope": evidence.get("slope"),
        "recent_mean": evidence.get("recent_mean"),
        "earlier_mean": evidence.get("earlier_mean"),
        "momentum": evidence.get("momentum"),
        "recent_output_count": evidence.get("recent_output_count"),
        "recent_share_pct": evidence.get("recent_share_pct"),
        "recent_years_label": evidence.get("recent_years_label"),
        "expected_recent_share_pct": evidence.get("expected_recent_share_pct"),
        "recent_share_vs_even_ratio": evidence.get("recent_share_vs_even_ratio"),
        "recent_trend_slope": evidence.get("recent_trend_slope"),
        "latest_year": evidence.get("latest_year"),
        "latest_output_count": evidence.get("latest_output_count"),
        "latest_vs_peak_ratio": evidence.get("latest_vs_peak_ratio"),
        "current_pace_year": evidence.get("current_pace_year"),
        "current_pace_cutoff_label": evidence.get("current_pace_cutoff_label"),
        "current_pace_count": evidence.get("current_pace_count"),
        "current_pace_comparison_label": evidence.get("current_pace_comparison_label"),
        "current_pace_comparison_mean": evidence.get("current_pace_comparison_mean"),
        "current_pace_signal": evidence.get("current_pace_signal"),
        "peak_years": evidence.get("peak_years") or [],
        "peak_count": evidence.get("peak_count"),
        "peak_year_share_pct": evidence.get("peak_year_share_pct"),
        "peak_year_share_label": evidence.get("peak_year_share_label"),
        "low_years": evidence.get("low_years") or [],
        "low_year_position": evidence.get("low_year_position"),
        "historical_gap_years_present": evidence.get("historical_gap_years_present"),
    }
    evidence_json = json.dumps(compact_evidence, ensure_ascii=True)
    return (
        _build_publication_insight_prompt_preamble(
            request_line="This request is for the Production Phase insight, using publication counts by year only.",
            allow_wider_context=False,
        )
        + "The user has already seen the phase label, slope, recent share, and peak-year support stats.\n"
        "Your job is to explain why this publication stage fits their record.\n"
        "The phase classification itself must stay anchored in complete publication years only.\n"
        "If current-year pace through the last completed month is provided, you may mention it only as separate live context, and you must explicitly say it does not change the complete-year phase basis.\n"
        "Explain the stage by combining phase, trend slope, recent-versus-earlier output, continuity or gaps, and peak structure when relevant.\n"
        "Lead with the decisive structural contrast in the record, then support it with the strongest years, counts, or ranges.\n"
        "Prefer language such as flattening, pullback, settled range, build-up, or recovery when the evidence supports it.\n"
        "Do not say 'this means' or 'your current stage reads as' or repeat the metric labels verbatim.\n"
        "If the long-run slope is positive but the recent complete years cool off a recent peak, frame that as flattening rather than ongoing acceleration.\n"
        "If the quietest years sit early and the phase is scaling or emerging, explain that as build-up rather than instability.\n"
        "If several peak years tie, say that explicitly.\n"
        "If there are no gap years, say that explicitly when it helps explain the phase.\n"
        "Use actual years, ranges, counts, or percentages when they strengthen the explanation.\n"
        "Headline should be 2 to 4 words and should not just repeat the phase label alone.\n"
        "Body should be 2 short sentences, about 45 to 75 words total, and should explain why the current phase fits.\n"
        + _build_publication_insight_note_guidance()
        + "Consideration should add one concise nuance, caution, or reading aid that is different from the body.\n"
        "Good consideration labels include Live year, Recent signal, Early base, Peak structure, or Continuity.\n"
        "Schema:\n"
        "{\n"
        '  "overall_summary": "string",\n'
        '  "sections": [\n'
        "    {\n"
        '      "key": "publication_production_phase",\n'
        '      "headline": "2-4 words",\n'
        '      "body": "2 sentences, about 45-75 words",\n'
        '      "consideration_label": "optional, max 4 words",\n'
        '      "consideration": "optional, max 35 words"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Return exactly one section: publication_production_phase.\n"
        f"Evidence: {evidence_json}\n"
    )


def _build_publication_volume_over_time_prompt(evidence: dict[str, Any]) -> str:
    wider_context_hint = _build_publication_volume_context_sentence(evidence)
    recent_read_hint = _build_publication_volume_recent_clause(evidence)
    compact_evidence = {
        "total_publications": evidence.get("total_publications"),
        "scoped_publications": evidence.get("scoped_publications"),
        "first_publication_year": evidence.get("first_publication_year"),
        "last_publication_year": evidence.get("last_publication_year"),
        "span_years_label": evidence.get("span_years_label"),
        "active_span": evidence.get("active_span"),
        "phase_label": evidence.get("phase_label"),
        "phase_interpretation": evidence.get("phase_interpretation"),
        "phase_confidence_low": evidence.get("phase_confidence_low"),
        "phase_confidence_note": evidence.get("phase_confidence_note"),
        "slope": evidence.get("slope"),
        "consistency_index": evidence.get("consistency_index"),
        "consistency_label": evidence.get("consistency_label"),
        "burstiness_score": evidence.get("burstiness_score"),
        "burstiness_label": evidence.get("burstiness_label"),
        "peak_year_share_pct": evidence.get("peak_year_share_pct"),
        "output_continuity_pct": evidence.get("output_continuity_pct"),
        "gap_years": evidence.get("gap_years"),
        "longest_streak": evidence.get("longest_streak"),
        "peak_years": evidence.get("peak_years") or [],
        "peak_count": evidence.get("peak_count"),
        "low_years": evidence.get("low_years") or [],
        "low_count": evidence.get("low_count"),
        "low_year_position": evidence.get("low_year_position"),
        "peak_year_position": evidence.get("peak_year_position"),
        "peak_vs_average_ratio": evidence.get("peak_vs_average_ratio"),
        "recent_mean": evidence.get("recent_mean"),
        "earlier_mean": evidence.get("earlier_mean"),
        "momentum": evidence.get("momentum"),
        "recent_years_label": evidence.get("recent_years_label"),
        "earlier_years_label": evidence.get("earlier_years_label"),
        "overall_trajectory": evidence.get("overall_trajectory"),
        "recent_position": evidence.get("recent_position"),
        "recent_detail_pattern": evidence.get("recent_detail_pattern"),
        "recent_monthly_period_label": evidence.get("recent_monthly_period_label"),
        "recent_monthly_period_end_label": evidence.get("recent_monthly_period_end_label"),
        "recent_monthly_total": evidence.get("recent_monthly_total"),
        "recent_monthly_active_months": evidence.get("recent_monthly_active_months"),
        "recent_monthly_peak_count": evidence.get("recent_monthly_peak_count"),
        "recent_monthly_peak_periods": evidence.get("recent_monthly_peak_periods") or [],
        "rolling_3y_period_label": evidence.get("rolling_3y_period_label"),
        "rolling_3y_start_count": evidence.get("rolling_3y_start_count"),
        "rolling_3y_latest_count": evidence.get("rolling_3y_latest_count"),
        "rolling_3y_material_direction": evidence.get("rolling_3y_material_direction"),
        "rolling_3y_prior_peak_count": evidence.get("rolling_3y_prior_peak_count"),
        "rolling_3y_prior_peak_label": evidence.get("rolling_3y_prior_peak_label"),
        "rolling_3y_blocks": evidence.get("rolling_3y_blocks") or [],
        "rolling_3y_direction": evidence.get("rolling_3y_direction"),
        "rolling_5y_period_label": evidence.get("rolling_5y_period_label"),
        "rolling_5y_start_count": evidence.get("rolling_5y_start_count"),
        "rolling_5y_latest_count": evidence.get("rolling_5y_latest_count"),
        "rolling_5y_material_direction": evidence.get("rolling_5y_material_direction"),
        "rolling_5y_prior_peak_count": evidence.get("rolling_5y_prior_peak_count"),
        "rolling_5y_prior_peak_label": evidence.get("rolling_5y_prior_peak_label"),
        "rolling_5y_blocks": evidence.get("rolling_5y_blocks") or [],
        "rolling_5y_direction": evidence.get("rolling_5y_direction"),
        "table_counts_by_window": evidence.get("table_counts_by_window") or {},
        "table_recent_count": evidence.get("table_recent_count"),
        "table_recent_range_label": evidence.get("table_recent_range_label"),
        "table_recent_titles": evidence.get("table_recent_titles") or [],
        "table_recent_article_types": evidence.get("table_recent_article_types") or [],
        "table_recent_precision_counts": evidence.get("table_recent_precision_counts") or {},
        "table_most_recent_date": evidence.get("table_most_recent_date"),
        "table_most_recent_title": evidence.get("table_most_recent_title"),
        "as_of_date": evidence.get("as_of_date"),
        "wider_context_hint": wider_context_hint,
        "recent_read_hint": recent_read_hint,
    }
    evidence_json = json.dumps(compact_evidence, ensure_ascii=True)
    return (
        _build_publication_insight_prompt_preamble(
            request_line="This request is for the Publication Volume Over Time insight.",
            allow_wider_context=True,
        )
        + "The user has already seen the section title, chart views, and recent publication rows.\n"
        "The insight must explain the whole section, not one active toggle.\n"
        "The section combines the full-span yearly record, rolling 3-year and 5-year views, the latest 12 completed months, and the publication-level rows.\n"
        "You are given three deterministic state labels in the evidence: overall_trajectory, recent_position, and recent_detail_pattern.\n"
        "Use those labels as guardrails for the synthesis, but do not copy them verbatim into the prose.\n"
        "This must add value beyond the tooltip. Do not simply restate yearly peaks, rolling-window counts, and the recent table range.\n"
        "Answer two questions: what is the bigger story of this publication record, and do the recent windows materially change that story?\n"
        "Treat the rolling 5-year and 3-year comparisons as the main recent evidence. Use the latest 12 completed months to refine cadence, confidence, or timing rather than to carry the whole thesis alone.\n"
        "Sentence 1 should explain the full-record shape and what kind of record this is in context.\n"
        "Sentence 2 should explain whether the latest 5-year, 3-year, and 12-month views reinforce, flatten, or undercut that broader story, and whether the recent publication rows make that read more or less trustworthy.\n"
        "You may use actual years, counts, periods, or date ranges when they sharpen the reading, but use no more than two numeric comparisons in the body.\n"
        "If the recent windows are lighter than the stronger part of the record, say that clearly without automatically calling it a long-run decline.\n"
        "If the recent windows are reinforcing the broader pattern, say that clearly.\n"
        "If multiple peak years exist, mention that.\n"
        "If recent date detail is sparse or imprecise, say that explicitly.\n"
        "Prefer meaning over inventory. Phrases like high-water mark, temporary lighter patch, reinforcing the longer-run build, broadly in line, or genuine recent slowdown are appropriate when supported by the evidence.\n"
        "Do not describe controls, toggles, bars, or lines. Read the evidence as a publication-output pattern.\n"
        "Avoid vague nouns like signal, activity, dynamics, or behaviour when a clearer phrase is available.\n"
        "Headline should be 2 to 4 words and should not be generic.\n"
        "Body should be 2 short sentences, about 55 to 95 words total, and should sound like an executive interpretation rather than a chart walk-through.\n"
        + _build_publication_insight_note_guidance()
        + "Consideration should add one concise caveat or reading aid that is different from the body, not a repeat.\n"
        "Schema:\n"
        "{\n"
        '  \"overall_summary\": \"string\",\n'
        '  \"sections\": [\n'
        "    {\n"
        '      \"key\": \"publication_volume_over_time\",\n'
        '      \"headline\": \"2-4 words\",\n'
        '      \"body\": \"2 sentences, about 50-85 words\",\n'
        '      \"consideration_label\": \"optional, max 4 words\",\n'
        '      \"consideration\": \"optional, max 35 words\"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Return exactly one section: publication_volume_over_time.\n"
        f"Evidence: {evidence_json}\n"
    )


def _build_publication_article_type_over_time_prompt(evidence: dict[str, Any]) -> str:
    compact_evidence = {
        "total_publications": evidence.get("total_publications"),
        "first_publication_year": evidence.get("first_publication_year"),
        "last_publication_year": evidence.get("last_publication_year"),
        "span_years_label": evidence.get("span_years_label"),
        "all_window": evidence.get("all_window"),
        "five_year_window": evidence.get("five_year_window"),
        "three_year_window": evidence.get("three_year_window"),
        "one_year_window": evidence.get("one_year_window"),
        "latest_window": evidence.get("latest_window"),
        "distinct_recent_windows": evidence.get("distinct_recent_windows") or [],
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
    evidence_json = json.dumps(compact_evidence, ensure_ascii=True)
    return (
        _build_publication_insight_prompt_preamble(
            request_line="This request is for the Type of Articles Published Over Time insight.",
            allow_wider_context=False,
        )
        + "The user has already seen the section title and supporting windows.\n"
        "The insight must explain the whole section, not one active toggle.\n"
        "The section combines the full-record article-type mix with the latest 5-year, 3-year, and 1-year windows.\n"
        "You are given deterministic state labels in the evidence: full_record_mix_state, recent_window_change_state, recent_window_confidence, and recent_breadth_direction.\n"
        "Use those labels as guardrails for synthesis, but do not copy them verbatim into the prose.\n"
        "This must add value beyond the tooltip. Do not simply repeat the leading type in each window.\n"
        "Answer two questions: what anchors the long-run article mix, and do the shorter recent windows meaningfully narrow, broaden, or change that mix?\n"
        "Treat the 5-year and 3-year windows as the main recent evidence. Use the 1-year window only to confirm or qualify the read unless it has enough volume to stand on its own.\n"
        "If the leader changes only in the shorter windows, explain that as a newer tilt rather than a full replacement of the long-run record.\n"
        "If the same leader stays in place but the recent mix narrows or becomes more contested, say that clearly.\n"
        "Do not over-focus on the top type if a secondary type is what makes the recent mix tighter, more contested, or genuinely reordered.\n"
        "If the latest read is based on very few publications or a partial current year, keep that as a short confidence qualifier rather than the main analytical point.\n"
        "Use actual years, ranges, labels, or percentages when they sharpen the interpretation, but avoid more than two numeric comparisons in the body.\n"
        "Do not talk about charts, tables, toggles, bars, or controls. Read the evidence as a publication-mix pattern.\n"
        "Headline should be 2 to 4 words and should not be generic.\n"
        "Body should be 2 short sentences, about 55 to 95 words total, and should sound like an analyst's interpretation of the section rather than an inventory of counts.\n"
        + _build_publication_insight_note_guidance()
        + "Consideration should add one concise nuance, caution, or reading aid that is different from the body.\n"
        "Schema:\n"
        "{\n"
        '  "overall_summary": "string",\n'
        '  "sections": [\n'
        "    {\n"
        '      "key": "publication_article_type_over_time",\n'
        '      "headline": "2-4 words",\n'
        '      "body": "2 sentences, about 55-95 words",\n'
        '      "consideration_label": "optional, max 4 words",\n'
        '      "consideration": "optional, max 35 words"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Return exactly one section: publication_article_type_over_time.\n"
        f"Evidence: {evidence_json}\n"
    )


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
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    full_record_mix_state = str(evidence.get("full_record_mix_state") or "").strip()
    if recent_window_change_state == "short_record":
        return "Early mix read"
    if recent_window_change_state in {"late_leader_shift", "leader_shift"}:
        return "Recent mix shift"
    if recent_window_change_state in {
        "same_leader_more_concentrated",
        "same_leader_narrower",
    }:
        return "Tighter recent mix"
    if recent_window_change_state == "broader_recent":
        return "Broader recent mix"
    if full_record_mix_state in {"mixed", "tied_lead"}:
        return "Mixed publication mix"
    return "Stable publication mix"


def _build_publication_type_over_time_full_record_clause(
    evidence: dict[str, Any]
) -> str:
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    span_years_label = str(evidence.get("span_years_label") or "").strip() or "the full record"
    top_labels = [str(label).strip() for label in (all_window.get("top_labels") or []) if str(label).strip()]
    if not top_labels:
        return "Publication-type data is not available yet."
    top_label_text = _format_period_list(top_labels)
    top_count = max(0, int(all_window.get("top_count") or 0))
    total_count = max(0, int(all_window.get("total_count") or 0))
    top_share_pct = _safe_float(all_window.get("top_share_pct"))
    second_label = str(all_window.get("second_label") or "").strip() or None
    second_share_pct = _safe_float(all_window.get("second_share_pct"))
    distinct_type_count = max(0, int(all_window.get("distinct_type_count") or 0))
    if len(top_labels) > 1:
        return (
            f"Across {span_years_label}, the leading publication types are {top_label_text}, "
            f"with {top_count} publications each, so the long-run mix is shared rather than led by one type."
        )
    if top_share_pct is not None and top_share_pct < 45:
        return (
            f"Across {span_years_label}, {top_label_text} is the largest publication type at "
            f"{round(top_share_pct)}% of publications, so the full record stays relatively broad."
        )
    secondary_clause = (
        f", ahead of {second_label} at {round(second_share_pct)}%"
        if second_label and second_share_pct is not None
        else ""
    )
    return (
        f"Across {span_years_label}, {top_label_text} anchors the full record with "
        f"{top_count} of {total_count} publications ({round(top_share_pct or 0)}%){secondary_clause}, "
        f"and {distinct_type_count} visible publication types appear overall."
    )


def _build_publication_type_over_time_recent_clause(
    evidence: dict[str, Any]
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
    latest_window = evidence.get("latest_window") if isinstance(evidence.get("latest_window"), dict) else {}
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    recent_window_confidence = str(
        evidence.get("recent_window_confidence") or ""
    ).strip()
    all_leader = _format_period_list(list(all_window.get("top_labels") or []))
    latest_leader = _format_period_list(list(latest_window.get("top_labels") or []))
    latest_top_share_pct = _safe_float(latest_window.get("top_share_pct"))
    all_top_share_pct = _safe_float(all_window.get("top_share_pct"))
    latest_range_label = str(latest_window.get("range_label") or "").strip() or "the latest window"
    latest_view_label = (
        f"the latest view ({latest_range_label})"
        if latest_range_label != "the latest window"
        else latest_range_label
    )
    latest_distinct_type_count = max(0, int(latest_window.get("distinct_type_count") or 0))
    all_distinct_type_count = max(0, int(all_window.get("distinct_type_count") or 0))
    latest_window_total_count = max(0, int(evidence.get("latest_window_total_count") or 0))
    latest_partial_year_label = str(evidence.get("latest_partial_year_label") or "").strip() or None
    distinct_recent_windows = [
        str(item.get("range_label") or "").strip()
        for item in (evidence.get("distinct_recent_windows") or [])
        if isinstance(item, dict) and str(item.get("range_label") or "").strip()
    ]
    recent_windows_text = _format_period_list(distinct_recent_windows)
    confidence_clause = ""
    if recent_window_confidence == "too_thin":
        confidence_clause = (
            f" The latest read still only contains {latest_window_total_count} publications, "
            "so treat that newest ordering as directional rather than settled."
        )
    elif recent_window_confidence == "thin":
        confidence_clause = (
            f" The latest read is still based on only {latest_window_total_count} publications, "
            "so read it as an early tilt rather than a fixed new baseline."
        )
    elif recent_window_confidence == "partial_current_year" and latest_partial_year_label:
        confidence_clause = (
            f" The latest 1-year view includes {latest_partial_year_label}, "
            "so that newest ordering can still move."
        )

    if recent_window_change_state == "short_record":
        return (
            "The recent 5-year, 3-year, and 1-year windows still overlap heavily with the full record, "
            "so this section is mainly establishing the current publication-type baseline."
        )
    if (
        recent_window_change_state == "late_leader_shift"
        and _same_article_type_leader_set(five_year_window, all_window)
        and not _same_article_type_leader_set(three_year_window, all_window)
        and not _same_article_type_leader_set(one_year_window, all_window)
    ):
        return (
            f"The latest 5-year view still looks like the full record, but the 3-year and 1-year views move toward "
            f"{latest_leader} instead of the long-run lead of {all_leader}.{confidence_clause}"
        )
    if recent_window_change_state in {"late_leader_shift", "leader_shift"}:
        return (
            f"The shorter recent windows move toward {latest_leader} instead of the full-record lead of "
            f"{all_leader}, so the newer mix is not just a smaller version of the whole portfolio.{confidence_clause}"
        )
    if (
        recent_window_change_state == "same_leader_more_concentrated"
        and latest_top_share_pct is not None
        and all_top_share_pct is not None
    ):
        return (
            f"The same leading type still anchors the newer windows, but its share rises from "
            f"{round(all_top_share_pct)}% across the full record to {round(latest_top_share_pct)}% in {latest_view_label}.{confidence_clause}"
        )
    if recent_window_change_state == "same_leader_narrower":
        return (
            f"The same leading type still anchors the newer windows, but {latest_view_label} narrows to "
            f"{latest_distinct_type_count} visible publication types instead of {all_distinct_type_count}.{confidence_clause}"
        )
    if recent_window_change_state == "broader_recent":
        return (
            f"{latest_view_label} brings {latest_distinct_type_count} visible publication types into view instead of "
            f"{all_distinct_type_count}, so the recent mix looks broader rather than more concentrated.{confidence_clause}"
        )
    if recent_windows_text:
        return (
            f"Across {recent_windows_text}, the recent windows broadly preserve the same publication-type centre of gravity "
            f"as the full record.{confidence_clause}"
        )
    return (
        f"The latest windows broadly preserve the same publication-type centre of gravity as the full record.{confidence_clause}"
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
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    latest_window_total_count = max(0, int(evidence.get("latest_window_total_count") or 0))
    latest_partial_year_label = str(evidence.get("latest_partial_year_label") or "").strip() or None
    if latest_window_total_count <= 3:
        consideration_label = "Recent window"
        partial_clause = (
            f" and includes {latest_partial_year_label}"
            if latest_partial_year_label
            else ""
        )
        consideration = (
            f"Because the latest 1-year view only contains {latest_window_total_count} "
            f"publication{'s' if latest_window_total_count != 1 else ''}{partial_clause}, "
            "treat that newest ordering as directional rather than settled."
        )
    elif latest_partial_year_label:
        consideration_label = "Partial year"
        consideration = (
            f"The latest 1-year view includes {latest_partial_year_label}, so the newest ordering can still move as more publications land."
        )
    elif recent_window_change_state in {"late_leader_shift", "leader_shift"}:
        consideration_label = "How to read it"
        consideration = (
            "Treat the newer leading type as a recent tilt unless it keeps holding beyond the shortest windows."
        )
    elif recent_window_change_state in {
        "same_leader_more_concentrated",
        "same_leader_narrower",
    }:
        consideration_label = "Concentration"
        consideration = (
            "Read the section as a tightening of the existing mix, not automatically as a new dominant publication model."
        )
    elif recent_window_change_state == "broader_recent":
        consideration_label = "Breadth"
        consideration = (
            "Use the shorter windows to see whether recent diversity is sustained or just a small-sample expansion."
        )
    else:
        consideration_label = "Coverage"
        consideration = (
            "Use the full record and recent windows together; neither alone captures how concentrated the mix really is."
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


def _build_publication_type_over_time_prompt(evidence: dict[str, Any]) -> str:
    compact_evidence = {
        "total_publications": evidence.get("total_publications"),
        "first_publication_year": evidence.get("first_publication_year"),
        "last_publication_year": evidence.get("last_publication_year"),
        "span_years_label": evidence.get("span_years_label"),
        "all_window": evidence.get("all_window"),
        "five_year_window": evidence.get("five_year_window"),
        "three_year_window": evidence.get("three_year_window"),
        "one_year_window": evidence.get("one_year_window"),
        "latest_window": evidence.get("latest_window"),
        "distinct_recent_windows": evidence.get("distinct_recent_windows") or [],
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
    evidence_json = json.dumps(compact_evidence, ensure_ascii=True)
    return (
        _build_publication_insight_prompt_preamble(
            request_line="This request is for the Type of Publications Published Over Time insight.",
            allow_wider_context=False,
        )
        + "The user has already seen the section title and supporting windows.\n"
        "The insight must explain the whole section, not one active toggle.\n"
        "The section combines the full-record publication-type mix with the latest 5-year, 3-year, and 1-year windows.\n"
        "You are given deterministic state labels in the evidence: full_record_mix_state, recent_window_change_state, recent_window_confidence, and recent_breadth_direction.\n"
        "Use those labels as guardrails for synthesis, but do not copy them verbatim into the prose.\n"
        "This must add value beyond the tooltip. Do not simply repeat the leading type in each window.\n"
        "Answer two questions: what anchors the long-run publication mix, and do the shorter recent windows meaningfully narrow, broaden, or change that mix?\n"
        "Treat the 5-year and 3-year windows as the main recent evidence. Use the 1-year window only to confirm or qualify the read unless it has enough volume to stand on its own.\n"
        "If the leader changes only in the shorter windows, explain that as a newer tilt rather than a full replacement of the long-run record.\n"
        "If the same leader stays in place but the recent mix narrows or becomes more contested, say that clearly.\n"
        "Do not over-focus on the top type if a secondary type is what makes the recent mix tighter, more contested, or genuinely reordered.\n"
        "If the latest read is based on very few publications or a partial current year, keep that as a short confidence qualifier rather than the main analytical point.\n"
        "Use actual years, ranges, labels, or percentages when they sharpen the interpretation, but avoid more than two numeric comparisons in the body.\n"
        "Do not talk about charts, tables, toggles, bars, or controls. Read the evidence as a publication-mix pattern.\n"
        "Headline should be 2 to 4 words and should not be generic.\n"
        "Body should be 2 short sentences, about 55 to 95 words total, and should sound like an analyst's interpretation of the section rather than an inventory of counts.\n"
        + _build_publication_insight_note_guidance()
        + "Consideration should add one concise nuance, caution, or reading aid that is different from the body.\n"
        "Schema:\n"
        "{\n"
        '  "overall_summary": "string",\n'
        '  "sections": [\n'
        "    {\n"
        '      "key": "publication_type_over_time",\n'
        '      "headline": "2-4 words",\n'
        '      "body": "2 sentences, about 55-95 words",\n'
        '      "consideration_label": "optional, max 4 words",\n'
        '      "consideration": "optional, max 35 words"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Return exactly one section: publication_type_over_time.\n"
        f"Evidence: {evidence_json}\n"
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
    if not any(char.isdigit() for char in normalized):
        return True
    generic_phrases = (
        "publication type over time",
        "publication types over time",
        "publication mix over time",
        "different publication types",
        "shows the publication mix",
    )
    if any(phrase in normalized for phrase in generic_phrases):
        return True
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    latest_window = evidence.get("latest_window") if isinstance(evidence.get("latest_window"), dict) else {}
    span_years_label = str(evidence.get("span_years_label") or "").strip().lower()
    long_run_signals = (
        "across",
        "full record",
        "long-run",
        span_years_label,
        str(((all_window.get("top_labels") or [None])[0]) or "").strip().lower(),
    )
    recent_signals = (
        "recent",
        "latest",
        "1-year",
        "3-year",
        "5-year",
        str(latest_window.get("range_label") or "").strip().lower(),
    )
    categories_present = 0
    if any(signal and signal in normalized for signal in long_run_signals):
        categories_present += 1
    if any(signal and signal in normalized for signal in recent_signals):
        categories_present += 1
    if categories_present < 2:
        return True
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    if recent_window_change_state in {"late_leader_shift", "leader_shift"} and not any(
        signal in normalized for signal in ("toward", "instead of", "tilt", "shift")
    ):
        return True
    if recent_window_change_state in {
        "same_leader_more_concentrated",
        "same_leader_narrower",
    } and not any(signal in normalized for signal in ("same", "still", "narrow", "concentrat")):
        return True
    if recent_window_change_state == "broader_recent" and not any(
        signal in normalized for signal in ("broader", "secondary", "more types")
    ):
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
    if not any(char.isdigit() for char in normalized):
        return True
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
    continuity_signals = ("continuous", "every year", "uninterrupted", "gap")
    career_timing_signals = (
        "early",
        "recent",
        "start",
        "later",
        "build-up",
        "slowdown",
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
    )
    peak_signals = ("peak", "tied", "dominat", "isolated year")
    categories_present = 0
    if any(signal in normalized for signal in continuity_signals):
        categories_present += 1
    if any(signal in normalized for signal in career_timing_signals):
        categories_present += 1
    if any(signal in normalized for signal in trend_signals):
        categories_present += 1
    peak_years = [int(item) for item in (evidence.get("peak_years") or []) if _safe_int(item) is not None]
    peak_specific_year_present = any(str(year) in normalized for year in peak_years[:3])
    if any(signal in normalized for signal in peak_signals) or peak_specific_year_present:
        categories_present += 1
    if categories_present < 3:
        return True
    if peak_years and not peak_specific_year_present and not any(
        signal in normalized for signal in peak_signals
    ):
        return True
    momentum = _safe_float(evidence.get("momentum"))
    phase_label = str(evidence.get("phase_label") or "").strip()
    if (
        phase_label in {"Scaling", "Rebuilding", "Plateauing", "Contracting"}
        or (momentum is not None and abs(momentum) >= 0.5)
    ) and not any(signal in normalized for signal in trend_signals):
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
    if not any(char.isdigit() for char in normalized):
        return True
    generic_phrases = (
        "article type over time",
        "article types over time",
        "article mix over time",
        "different article types",
        "shows the article mix",
    )
    if any(phrase in normalized for phrase in generic_phrases):
        return True
    all_window = evidence.get("all_window") if isinstance(evidence.get("all_window"), dict) else {}
    latest_window = evidence.get("latest_window") if isinstance(evidence.get("latest_window"), dict) else {}
    long_run_signals = (
        "across",
        "full record",
        "long-run",
        str(evidence.get("span_years_label") or "").strip().lower(),
        *[
            str(label).strip().lower()
            for label in (all_window.get("top_labels") or [])
            if str(label).strip()
        ],
    )
    recent_signals = (
        "recent",
        "latest",
        "1-year",
        "3-year",
        "5-year",
        "window",
        str(latest_window.get("range_label") or "").strip().lower(),
    )
    mix_signals = (
        "mix",
        "anchor",
        "tilt",
        "shift",
        "narrow",
        "broader",
        "concentrat",
        "lead",
        "ordering",
        "not just",
    )
    has_long_run = any(signal and signal in normalized for signal in long_run_signals)
    has_recent = any(signal and signal in normalized for signal in recent_signals)
    has_mix = any(signal and signal in normalized for signal in mix_signals)
    if not has_long_run or not has_recent or not has_mix:
        return True
    recent_window_change_state = str(
        evidence.get("recent_window_change_state") or ""
    ).strip()
    if recent_window_change_state in {"late_leader_shift", "leader_shift"} and not any(
        signal in normalized for signal in ("tilt", "shift", "moves toward", "instead of")
    ):
        return True
    if recent_window_change_state in {
        "same_leader_more_concentrated",
        "same_leader_narrower",
    } and not any(signal in normalized for signal in ("same", "still", "narrow", "concentrat")):
        return True
    if recent_window_change_state == "broader_recent" and not any(
        signal in normalized for signal in ("broader", "secondary", "more types")
    ):
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
    )
    recent_signals = (
        "recent",
        "earlier",
        "baseline",
        str(evidence.get("recent_years_label") or "").strip().lower(),
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
    if _safe_float(evidence.get("recent_share_pct")) is not None and not has_recent_category:
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
    )
    return any(token in normalized for token in unsupported_tokens)


def _coerce_publication_volume_over_time_payload(payload: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    fallback = _build_publication_volume_over_time_fallback_payload(evidence)
    fallback_section = dict((fallback.get("sections") or [{}])[0] or {})
    model_section = {}
    sections_raw = payload.get("sections")
    if isinstance(sections_raw, list):
        for item in sections_raw:
            if not isinstance(item, dict):
                continue
            if str(item.get("key") or "").strip() == "publication_volume_over_time":
                model_section = item
                break

    headline = str(model_section.get("headline") or "").strip() or str(fallback_section.get("headline") or "")
    if _publication_volume_over_time_headline_is_too_generic(headline):
        headline = str(fallback_section.get("headline") or headline)
    body = str(model_section.get("body") or "").strip() or str(fallback_section.get("body") or "")
    body = _trim_publication_output_pattern_text(body, max_chars=340, require_sentence_end=True)
    if _publication_volume_over_time_body_is_too_generic(
        body=body,
        fallback_body=str(fallback_section.get("body") or ""),
        evidence=evidence,
    ):
        body = str(fallback_section.get("body") or body)
    elif _publication_volume_over_time_text_is_unsupported(body):
        body = str(fallback_section.get("body") or body)

    consideration_label = str(model_section.get("consideration_label") or "").strip() or str(fallback_section.get("consideration_label") or "")
    consideration = str(model_section.get("consideration") or "").strip() or str(fallback_section.get("consideration") or "")
    consideration = _trim_publication_output_pattern_text(
        consideration,
        max_chars=180,
        require_sentence_end=True,
    )
    if _publication_volume_over_time_text_is_unsupported(consideration):
        consideration_label = str(fallback_section.get("consideration_label") or "")
        consideration = str(fallback_section.get("consideration") or "")
    overall_summary = _trim_publication_output_pattern_text(
        str(payload.get("overall_summary") or "").strip()
        or str(fallback.get("overall_summary") or "").strip(),
        max_chars=220,
        require_sentence_end=False,
    )
    if _publication_volume_over_time_text_is_unsupported(overall_summary):
        overall_summary = str(fallback.get("overall_summary") or "").strip()

    return {
        "overall_summary": overall_summary,
        "sections": [
            {
                **fallback_section,
                "headline": _trim_publication_output_pattern_text(headline, max_chars=80),
                "body": body,
                "consideration_label": consideration_label[:80] or fallback_section.get("consideration_label"),
                "consideration": consideration or fallback_section.get("consideration"),
            }
        ],
    }


def _coerce_publication_article_type_over_time_payload(
    payload: dict[str, Any], evidence: dict[str, Any]
) -> dict[str, Any]:
    fallback = _build_publication_article_type_over_time_fallback_payload(evidence)
    fallback_section = dict((fallback.get("sections") or [{}])[0] or {})
    model_section = {}
    sections_raw = payload.get("sections")
    if isinstance(sections_raw, list):
        for item in sections_raw:
            if not isinstance(item, dict):
                continue
            if str(item.get("key") or "").strip() == "publication_article_type_over_time":
                model_section = item
                break

    headline = str(model_section.get("headline") or "").strip() or str(
        fallback_section.get("headline") or ""
    )
    if _publication_article_type_over_time_headline_is_too_generic(headline):
        headline = str(fallback_section.get("headline") or headline)
    body = str(model_section.get("body") or "").strip() or str(
        fallback_section.get("body") or ""
    )
    body = _trim_publication_output_pattern_text(
        body,
        max_chars=340,
        require_sentence_end=True,
    )
    if _publication_article_type_over_time_body_is_too_generic(
        body=body,
        fallback_body=str(fallback_section.get("body") or ""),
        evidence=evidence,
    ):
        body = str(fallback_section.get("body") or body)
    elif _publication_article_type_over_time_text_is_unsupported(body):
        body = str(fallback_section.get("body") or body)

    consideration_label = str(model_section.get("consideration_label") or "").strip() or str(
        fallback_section.get("consideration_label") or ""
    )
    consideration = str(model_section.get("consideration") or "").strip() or str(
        fallback_section.get("consideration") or ""
    )
    consideration = _trim_publication_output_pattern_text(
        consideration,
        max_chars=180,
        require_sentence_end=True,
    )
    if _publication_article_type_over_time_text_is_unsupported(consideration):
        consideration_label = str(fallback_section.get("consideration_label") or "")
        consideration = str(fallback_section.get("consideration") or "")
    overall_summary = _trim_publication_output_pattern_text(
        str(payload.get("overall_summary") or "").strip()
        or str(fallback.get("overall_summary") or "").strip(),
        max_chars=220,
        require_sentence_end=False,
    )
    if _publication_article_type_over_time_text_is_unsupported(overall_summary):
        overall_summary = str(fallback.get("overall_summary") or "").strip()

    return {
        "overall_summary": overall_summary,
        "sections": [
            {
                **fallback_section,
                "headline": _trim_publication_output_pattern_text(headline, max_chars=80),
                "body": body,
                "consideration_label": consideration_label[:80]
                or fallback_section.get("consideration_label"),
                "consideration": consideration or fallback_section.get("consideration"),
            }
        ],
    }


def _coerce_publication_type_over_time_payload(
    payload: dict[str, Any], evidence: dict[str, Any]
) -> dict[str, Any]:
    fallback = _build_publication_type_over_time_fallback_payload(evidence)
    fallback_section = dict((fallback.get("sections") or [{}])[0] or {})
    model_section = {}
    sections_raw = payload.get("sections")
    if isinstance(sections_raw, list):
        for item in sections_raw:
            if not isinstance(item, dict):
                continue
            if str(item.get("key") or "").strip() == "publication_type_over_time":
                model_section = item
                break

    headline = str(model_section.get("headline") or "").strip() or str(
        fallback_section.get("headline") or ""
    )
    if _publication_type_over_time_headline_is_too_generic(headline):
        headline = str(fallback_section.get("headline") or headline)
    body = str(model_section.get("body") or "").strip() or str(
        fallback_section.get("body") or ""
    )
    body = _trim_publication_output_pattern_text(
        body,
        max_chars=340,
        require_sentence_end=True,
    )
    if _publication_type_over_time_body_is_too_generic(
        body=body,
        fallback_body=str(fallback_section.get("body") or ""),
        evidence=evidence,
    ):
        body = str(fallback_section.get("body") or body)
    elif _publication_type_over_time_text_is_unsupported(body):
        body = str(fallback_section.get("body") or body)

    consideration_label = str(model_section.get("consideration_label") or "").strip() or str(
        fallback_section.get("consideration_label") or ""
    )
    consideration = str(model_section.get("consideration") or "").strip() or str(
        fallback_section.get("consideration") or ""
    )
    consideration = _trim_publication_output_pattern_text(
        consideration,
        max_chars=180,
        require_sentence_end=True,
    )
    if _publication_type_over_time_text_is_unsupported(consideration):
        consideration_label = str(fallback_section.get("consideration_label") or "")
        consideration = str(fallback_section.get("consideration") or "")
    overall_summary = _trim_publication_output_pattern_text(
        str(payload.get("overall_summary") or "").strip()
        or str(fallback.get("overall_summary") or "").strip(),
        max_chars=220,
        require_sentence_end=False,
    )
    if _publication_type_over_time_text_is_unsupported(overall_summary):
        overall_summary = str(fallback.get("overall_summary") or "").strip()

    return {
        "overall_summary": overall_summary,
        "sections": [
            {
                **fallback_section,
                "headline": _trim_publication_output_pattern_text(headline, max_chars=80),
                "body": body,
                "consideration_label": consideration_label[:80]
                or fallback_section.get("consideration_label"),
                "consideration": consideration or fallback_section.get("consideration"),
            }
        ],
    }


def _coerce_publication_output_pattern_payload(payload: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    fallback = _build_publication_output_pattern_fallback_payload(evidence)
    fallback_section = dict((fallback.get("sections") or [{}])[0] or {})
    model_section = {}
    sections_raw = payload.get("sections")
    if isinstance(sections_raw, list):
        for item in sections_raw:
            if not isinstance(item, dict):
                continue
            if str(item.get("key") or "").strip() == "publication_output_pattern":
                model_section = item
                break

    headline = str(model_section.get("headline") or "").strip() or str(fallback_section.get("headline") or "")
    if _publication_output_pattern_headline_is_too_generic(headline):
        headline = str(fallback_section.get("headline") or headline)
    body = str(model_section.get("body") or "").strip() or str(fallback_section.get("body") or "")
    body = _trim_publication_output_pattern_text(body, max_chars=240, require_sentence_end=True)
    if _publication_output_pattern_body_is_too_generic(
        body=body,
        fallback_body=str(fallback_section.get("body") or ""),
        evidence=evidence,
    ):
        body = str(fallback_section.get("body") or body)
    elif _publication_output_pattern_text_is_unsupported(text=body, evidence=evidence):
        body = str(fallback_section.get("body") or body)
    consideration_label = str(model_section.get("consideration_label") or "").strip() or str(fallback_section.get("consideration_label") or "")
    consideration = str(model_section.get("consideration") or "").strip() or str(fallback_section.get("consideration") or "")
    consideration = _trim_publication_output_pattern_text(
        consideration,
        max_chars=180,
        require_sentence_end=True,
    )
    if _publication_output_pattern_text_is_unsupported(text=consideration, evidence=evidence):
        consideration_label = str(fallback_section.get("consideration_label") or "")
        consideration = str(fallback_section.get("consideration") or "")
    overall_summary = _trim_publication_output_pattern_text(
        str(payload.get("overall_summary") or "").strip()
        or str(fallback.get("overall_summary") or "").strip(),
        max_chars=220,
        require_sentence_end=False,
    )
    if _publication_output_pattern_text_is_unsupported(text=overall_summary, evidence=evidence):
        overall_summary = str(fallback.get("overall_summary") or "").strip()

    return {
        "overall_summary": overall_summary,
        "sections": [
            {
                **fallback_section,
                "headline": _trim_publication_output_pattern_text(headline, max_chars=80),
                "body": body,
                "consideration_label": consideration_label[:80] or fallback_section.get("consideration_label"),
                "consideration": consideration or fallback_section.get("consideration"),
            }
        ],
    }


def _coerce_publication_production_phase_payload(payload: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    fallback = _build_publication_production_phase_fallback_payload(evidence)
    fallback_section = dict((fallback.get("sections") or [{}])[0] or {})
    model_section = {}
    sections_raw = payload.get("sections")
    if isinstance(sections_raw, list):
        for item in sections_raw:
            if not isinstance(item, dict):
                continue
            if str(item.get("key") or "").strip() == "publication_production_phase":
                model_section = item
                break

    phase_label = str(evidence.get("phase_label") or "").strip() or None
    headline = str(model_section.get("headline") or "").strip() or str(fallback_section.get("headline") or "")
    if _publication_production_phase_headline_is_too_generic(headline, phase_label):
        headline = str(fallback_section.get("headline") or headline)
    body = str(model_section.get("body") or "").strip() or str(fallback_section.get("body") or "")
    body = _trim_publication_output_pattern_text(body, max_chars=240, require_sentence_end=True)
    if _publication_production_phase_body_is_too_generic(
        body=body,
        fallback_body=str(fallback_section.get("body") or ""),
        evidence=evidence,
    ):
        body = str(fallback_section.get("body") or body)
    elif _publication_production_phase_text_is_unsupported(body):
        body = str(fallback_section.get("body") or body)

    consideration_label = str(model_section.get("consideration_label") or "").strip() or str(fallback_section.get("consideration_label") or "")
    consideration = str(model_section.get("consideration") or "").strip() or str(fallback_section.get("consideration") or "")
    consideration = _trim_publication_output_pattern_text(
        consideration,
        max_chars=180,
        require_sentence_end=True,
    )
    if _publication_production_phase_text_is_unsupported(consideration):
        consideration_label = str(fallback_section.get("consideration_label") or "")
        consideration = str(fallback_section.get("consideration") or "")
    overall_summary = _trim_publication_output_pattern_text(
        str(payload.get("overall_summary") or "").strip()
        or str(fallback.get("overall_summary") or "").strip(),
        max_chars=220,
        require_sentence_end=False,
    )
    if _publication_production_phase_text_is_unsupported(overall_summary):
        overall_summary = str(fallback.get("overall_summary") or "").strip()

    return {
        "overall_summary": overall_summary,
        "sections": [
            {
                **fallback_section,
                "headline": _trim_publication_output_pattern_text(headline, max_chars=80),
                "body": body,
                "consideration_label": consideration_label[:80] or fallback_section.get("consideration_label"),
                "consideration": consideration or fallback_section.get("consideration"),
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
        + _build_publication_insight_note_guidance()
        + "If you include a follow-on note, write it from the user's perspective and make it specific to the evidence available.\n"
        "Schema:\n"
        "{\n"
        '  "overall_summary": "string",\n'
        '  "sections": [\n'
        "    {\n"
        '      "key": "uncited_works" | "citation_drivers" | "citation_activation" | "citation_activation_history",\n'
        '      "headline": "max 4 words",\n'
        '      "body": "max 45 words",\n'
        '      "consideration_label": "optional, max 4 words, only when a follow-on note is genuinely useful",\n'
        '      "consideration": "optional, max 28 words, only when genuinely useful"\n'
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
    fallback = _build_fallback_payload(evidence)
    sections_raw = payload.get("sections")
    by_key: dict[str, dict[str, Any]] = {}
    if isinstance(sections_raw, list):
        for item in sections_raw:
            if not isinstance(item, dict):
                continue
            key = str(item.get("key") or "").strip()
            if key in {"uncited_works", "citation_drivers", "citation_activation", "citation_activation_history"}:
                by_key[key] = item

    output_sections: list[dict[str, Any]] = []
    fallback_by_key = {
        str(item["key"]): item for item in fallback["sections"] if isinstance(item, dict)
    }
    for key in ("uncited_works", "citation_drivers", "citation_activation", "citation_activation_history"):
        fallback_section = dict(fallback_by_key[key])
        model_section = by_key.get(key) or {}
        headline = str(model_section.get("headline") or "").strip() or fallback_section["headline"]
        body = str(model_section.get("body") or "").strip() or fallback_section["body"]
        consideration_label_raw = str(model_section.get("consideration_label") or "").strip()
        consideration_raw = str(model_section.get("consideration") or "").strip()
        if _body_is_too_generic(
            key=key,
            body=body,
            fallback_body=str(fallback_section.get("body") or ""),
        ):
            body = str(fallback_section.get("body") or body)
        fallback_section["headline"] = headline[:80]
        fallback_section["body"] = body[:220]
        fallback_section["consideration_label"] = (
            consideration_label_raw[:80] or fallback_section.get("consideration_label")
        )
        fallback_section["consideration"] = consideration_raw[:160] or fallback_section.get("consideration")
        output_sections.append(fallback_section)

    overall_summary = (
        str(payload.get("overall_summary") or "").strip()
        or str(fallback.get("overall_summary") or "").strip()
    )
    return {
        "overall_summary": overall_summary[:220],
        "sections": output_sections,
    }


def _candidate_models() -> list[str]:
    preferred = str(
        os.getenv("PUBLICATION_INSIGHTS_AGENT_MODEL", PREFERRED_MODEL)
    ).strip() or PREFERRED_MODEL
    fallback = str(
        os.getenv("PUBLICATION_INSIGHTS_AGENT_FALLBACK_MODEL", FALLBACK_MODEL)
    ).strip() or FALLBACK_MODEL
    models = [preferred]
    if fallback not in models:
        models.append(fallback)
    return models


def _openai_insights_enabled() -> bool:
    try:
        get_openai_api_key()
    except ConfigurationError:
        return False
    return True


def _build_publication_insights_provenance_evidence(
    *, evidence: dict[str, Any], section_key: str | None
) -> dict[str, Any]:
    if section_key in {"publication_output_pattern", "publication_production_phase"}:
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
        "uncited_works", "citation_drivers", "citation_activation", "citation_activation_history", "publication_output_pattern", "publication_production_phase", "publication_volume_over_time", "publication_article_type_over_time", "publication_type_over_time"
    ]
    | None = None,
    scope: Literal["window", "section"] = "window",
) -> dict[str, Any]:
    if section_key == "publication_output_pattern":
        evidence = _build_publication_output_pattern_evidence(user_id=user_id)
        payload = _build_publication_output_pattern_fallback_payload(evidence)
        prompt = _build_publication_output_pattern_prompt(evidence)
    elif section_key == "publication_production_phase":
        evidence = _build_publication_production_phase_evidence(user_id=user_id)
        payload = _build_publication_production_phase_fallback_payload(evidence)
        prompt = _build_publication_production_phase_prompt(evidence)
    elif section_key == "publication_volume_over_time":
        evidence = _build_publication_volume_over_time_evidence(user_id=user_id)
        payload = _build_publication_volume_over_time_fallback_payload(evidence)
        prompt = _build_publication_volume_over_time_prompt(evidence)
    elif section_key == "publication_article_type_over_time":
        evidence = _build_publication_article_type_over_time_evidence(user_id=user_id)
        payload = _build_publication_article_type_over_time_fallback_payload(evidence)
        prompt = _build_publication_article_type_over_time_prompt(evidence)
    elif section_key == "publication_type_over_time":
        evidence = _build_publication_type_over_time_evidence(user_id=user_id)
        payload = _build_publication_type_over_time_fallback_payload(evidence)
        prompt = _build_publication_type_over_time_prompt(evidence)
    else:
        evidence = _build_evidence(
            user_id=user_id,
            window_id=str(window_id),
            section_key=section_key,
            scope=scope,
        )
        payload = _build_fallback_payload(evidence)
        prompt = _build_prompt(evidence)
    model_used: str | None = None
    generation_mode = "deterministic_fallback"
    if _openai_insights_enabled():
        for model_name in _candidate_models():
            try:
                response = create_response(
                    model=model_name,
                    input=prompt,
                    max_output_tokens=320,
                    timeout=_publication_insights_openai_timeout_seconds(),
                    max_retries=0,
                )
                model_payload = _extract_json_object(
                    str(getattr(response, "output_text", ""))
                )
                payload = (
                    _coerce_publication_volume_over_time_payload(model_payload, evidence)
                    if section_key == "publication_volume_over_time"
                    else
                    _coerce_publication_article_type_over_time_payload(model_payload, evidence)
                    if section_key == "publication_article_type_over_time"
                    else
                    _coerce_publication_type_over_time_payload(model_payload, evidence)
                    if section_key == "publication_type_over_time"
                    else
                    _coerce_publication_output_pattern_payload(model_payload, evidence)
                    if section_key == "publication_output_pattern"
                    else _coerce_publication_production_phase_payload(model_payload, evidence)
                    if section_key == "publication_production_phase"
                    else _coerce_model_payload(model_payload, evidence)
                )
                model_used = model_name
                generation_mode = "openai"
                break
            except Exception:
                continue

    return {
        "agent_name": AGENT_NAME,
        "status": "draft",
        "window_id": str(evidence.get("window_id") or "1y"),
        "window_label": str(evidence.get("window_label") or "1y"),
        "overall_summary": str(payload.get("overall_summary") or ""),
        "sections": list(payload.get("sections") or []),
        "provenance": {
            "source": "publication_metrics_bundle",
            "data_sources": list(evidence.get("data_sources") or []),
            "generated_at": _utcnow(),
            "generation_mode": generation_mode,
            "model": model_used,
            "prompt_version": PROMPT_VERSION,
            "metrics_status": str(evidence.get("metrics_status") or "READY"),
            "evidence": _build_publication_insights_provenance_evidence(
                evidence=evidence, section_key=section_key
            ),
        },
    }

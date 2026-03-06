from __future__ import annotations

from datetime import datetime, timezone
import json
import os
import re
from collections import Counter
from typing import Any, Literal

from research_os.clients.openai_client import create_response
from research_os.services.publication_metrics_service import (
    PublicationMetricsNotFoundError,
    get_publication_top_metrics,
)

AGENT_NAME = "Publication insights agent"
PROMPT_VERSION = "publication_insights_agent_v2"
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


class PublicationInsightsAgentValidationError(RuntimeError):
    pass


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
        "You are Publication insights agent for a research analytics product.\n"
        "Return JSON only, with no markdown.\n"
        "Use only the evidence provided. Do not invent causes, actions, or missing data.\n"
        "Write directly to the user using plain English.\n"
        "Keep the wording concise, interpretive, and non-judgmental.\n"
        "Do not just repeat the numbers or the section title. Explain what the pattern suggests inside each section.\n"
        "Avoid repetitive openings such as starting every section with 'You have'.\n"
        "Use at most one key number in each body unless a second number is necessary for contrast.\n"
        "Read each section as a whole: the counts, time window, concentration split, and leading papers all matter together.\n"
        "Also consider the wider publication context when it materially sharpens the interpretation, such as momentum, h-index trajectory, field percentile strength, authorship profile, or collaboration structure.\n"
        "Do not force the wider context into every section; only use it when it changes what is useful to say.\n"
        "When wider context materially changes the interpretation, weave it into the main body rather than saving it only for the follow-on note.\n"
        "When you use wider context, ground it in a concrete number where possible, such as 12-month citations, h-index, field percentile share, or leadership index.\n"
        "For uncited_works, comment on whether the uncited set is mostly recent, mostly older, or mixed.\n"
        "For citation_drivers, comment on whether citations are driven by one standout paper, a small cluster, or a broader spread.\n"
        "For citation_activation, distinguish newly active papers from papers that stayed active, and comment on how much of the portfolio remains inactive.\n"
        "For citation_activation_history, interpret whether yearly activity is broadening, narrowing, renewing, or staying steady across complete years.\n"
        "If the evidence includes 1y, 3y, and 5y citation windows together, write one section-level interpretation across the whole section, not separate per-window summaries.\n"
        "Only include a follow-on note when there is a genuinely useful next angle for the user to think about.\n"
        "If you include a follow-on note, choose a short label that fits the content, for example 'Why this matters', 'What to watch', or 'How to read this'. Do not default to one stock label.\n"
        "If you include a follow-on note, write it from the user's perspective and make it specific to the evidence available.\n"
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


def generate_publication_insights_agent_draft(
    *,
    user_id: str,
    window_id: Literal["1y", "3y", "5y", "all"] = "1y",
    section_key: Literal[
        "uncited_works", "citation_drivers", "citation_activation", "citation_activation_history"
    ]
    | None = None,
    scope: Literal["window", "section"] = "window",
) -> dict[str, Any]:
    evidence = _build_evidence(
        user_id=user_id,
        window_id=str(window_id),
        section_key=section_key,
        scope=scope,
    )
    payload = _build_fallback_payload(evidence)
    model_used: str | None = None
    generation_mode = "deterministic_fallback"

    prompt = _build_prompt(evidence)
    for model_name in _candidate_models():
        try:
            response = create_response(
                model=model_name,
                input=prompt,
                max_output_tokens=320,
            )
            model_payload = _extract_json_object(str(getattr(response, "output_text", "")))
            payload = _coerce_model_payload(model_payload, evidence)
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
            "evidence": {
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
            },
        },
    }

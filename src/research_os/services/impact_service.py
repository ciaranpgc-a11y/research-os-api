from __future__ import annotations

from datetime import datetime, timezone
import json
import re
from statistics import mean
from typing import Any

from sqlalchemy import select

from research_os.clients.openai_client import get_client
from research_os.db import ImpactSnapshot, User, create_all_tables, session_scope
from research_os.services.persona_service import (
    get_persona_context,
    get_themes,
    list_collaborators,
    persona_timeline,
    serialise_metrics_distribution,
)

PREFERRED_MODEL = "gpt-5.2"
FALLBACK_MODEL = "gpt-4.1-mini"


class ImpactValidationError(RuntimeError):
    pass


class ImpactNotFoundError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise ImpactNotFoundError(f"User '{user_id}' was not found.")
    return user


def _compute_h_index(citations: list[int]) -> int:
    ordered = sorted([max(0, int(value)) for value in citations], reverse=True)
    h = 0
    for index, value in enumerate(ordered, start=1):
        if value >= index:
            h = index
        else:
            break
    return h


def _linear_regression_slope(points: list[tuple[int, float]]) -> float:
    if len(points) < 2:
        return 0.0
    xs = [float(item[0]) for item in points]
    ys = [float(item[1]) for item in points]
    x_mean = mean(xs)
    y_mean = mean(ys)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys, strict=False))
    denominator = sum((x - x_mean) ** 2 for x in xs)
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _latest_snapshot_payload(snapshot: ImpactSnapshot | None) -> dict[str, Any] | None:
    if snapshot is None:
        return None
    payload = dict(snapshot.snapshot_json or {})
    payload.update(
        {
            "user_id": snapshot.user_id,
            "total_works": snapshot.total_works,
            "total_citations": snapshot.total_citations,
            "h_index": snapshot.h_index,
            "m_index": snapshot.m_index,
            "citation_velocity": snapshot.citation_velocity,
            "dominant_theme": snapshot.dominant_theme,
            "computed_at": snapshot.computed_at,
        }
    )
    return payload


def recompute_impact_snapshot(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    metrics = serialise_metrics_distribution(user_id=user_id)
    collaborators_payload = list_collaborators(user_id=user_id)
    themes_payload = get_themes(user_id=user_id)
    timeline = persona_timeline(user_id=user_id)

    works = metrics["works"]
    total_works = len(works)
    citations = [int(item["citations"]) for item in works]
    total_citations = int(sum(citations))
    h_index = _compute_h_index(citations)

    years = [int(item["year"]) for item in works if isinstance(item["year"], int)]
    if years:
        career_length = max(1, _utcnow().year - min(years) + 1)
    else:
        career_length = 1
    m_index = round(h_index / career_length, 4)

    velocity_points = [(int(item["year"]), float(item["citations"])) for item in timeline if int(item["year"]) > 0]
    citation_velocity = round(_linear_regression_slope(velocity_points), 4)

    most_cited_work = works[0] if works else None
    top_collaborator = collaborators_payload["collaborators"][0] if collaborators_payload["collaborators"] else None
    collaboration_density = round(
        (len(collaborators_payload["collaborators"]) / max(1, total_works)),
        4,
    )
    dominant_theme = themes_payload["clusters"][0]["label"] if themes_payload["clusters"] else ""
    theme_citation_averages = [
        {"cluster_id": item["cluster_id"], "label": item["label"], "citation_mean": item["citation_mean"]}
        for item in themes_payload["clusters"]
    ]

    snapshot_json = {
        "most_cited_work": most_cited_work,
        "top_collaborator": top_collaborator,
        "collaboration_density": collaboration_density,
        "theme_citation_averages": theme_citation_averages,
        "publication_timeline": timeline,
        "provider_attribution": sorted(
            {item["provider"] for item in works if item.get("provider")},
        ),
    }

    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        snapshot = ImpactSnapshot(
            user_id=user.id,
            total_works=total_works,
            total_citations=total_citations,
            h_index=h_index,
            m_index=m_index,
            citation_velocity=citation_velocity,
            dominant_theme=dominant_theme,
            snapshot_json=snapshot_json,
            computed_at=_utcnow(),
        )
        session.add(snapshot)
        user.impact_last_computed_at = snapshot.computed_at
        session.flush()
        return _latest_snapshot_payload(snapshot) or {}


def get_latest_impact_snapshot(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        snapshot = session.scalars(
            select(ImpactSnapshot)
            .where(ImpactSnapshot.user_id == user_id)
            .order_by(ImpactSnapshot.computed_at.desc())
        ).first()
        if snapshot is None:
            raise ImpactNotFoundError("No impact snapshot is available yet.")
        payload = _latest_snapshot_payload(snapshot)
        if payload is None:
            raise ImpactNotFoundError("No impact snapshot is available yet.")
        return payload


def _extract_json(text: str) -> dict[str, Any]:
    clean = text.strip()
    if clean.startswith("```"):
        clean = re.sub(r"^```(?:json)?\s*", "", clean)
        clean = re.sub(r"\s*```$", "", clean)
    match = re.search(r"\{.*\}", clean, flags=re.DOTALL)
    if not match:
        raise ValueError("No JSON object found.")
    return json.loads(match.group(0))


def _ask_model(prompt: str) -> tuple[dict[str, Any], str]:
    client = get_client()
    try:
        response = client.responses.create(model=PREFERRED_MODEL, input=prompt)
        return _extract_json(response.output_text), PREFERRED_MODEL
    except Exception:
        fallback = client.responses.create(model=FALLBACK_MODEL, input=prompt)
        return _extract_json(fallback.output_text), FALLBACK_MODEL


def analyse_impact(
    *,
    user_id: str,
    impact_snapshot: dict[str, Any] | None = None,
    collaborator_data: dict[str, Any] | None = None,
    theme_data: dict[str, Any] | None = None,
    publication_timeline: list[dict[str, Any]] | None = None,
    venue_distribution: dict[str, int] | None = None,
) -> dict[str, Any]:
    snapshot = impact_snapshot or get_latest_impact_snapshot(user_id=user_id)
    collaborators = collaborator_data or list_collaborators(user_id=user_id)
    themes = theme_data or get_themes(user_id=user_id)
    timeline = publication_timeline or persona_timeline(user_id=user_id)
    if venue_distribution is None:
        persona_context = get_persona_context(user_id=user_id)
        venue_distribution = {
            venue: index + 1
            for index, venue in enumerate(persona_context.get("top_venues", []))
        }

    prompt = f"""
You are generating strategic scholarly-impact analysis.
Only use the supplied metrics and do not fabricate.

Impact snapshot:
{json.dumps(snapshot, default=str)}

Collaborators:
{json.dumps(collaborators, default=str)}

Themes:
{json.dumps(themes, default=str)}

Publication timeline:
{json.dumps(timeline, default=str)}

Venue distribution:
{json.dumps(venue_distribution, default=str)}

Return JSON only with fields:
{{
  "scholarly_impact_summary": "string",
  "collaboration_analysis": "string",
  "thematic_evolution": "string",
  "strengths": ["string"],
  "blind_spots": ["string"],
  "strategic_suggestions": ["string"],
  "grant_positioning_notes": ["string"],
  "confidence_markers": ["string"]
}}

Rules:
- Separate factual statements from interpretation.
- Include confidence markers when data is sparse or incomplete.
- Use concise British English.
""".strip()
    try:
        parsed, model_used = _ask_model(prompt)
        return {
            "scholarly_impact_summary": str(parsed.get("scholarly_impact_summary", "")).strip(),
            "collaboration_analysis": str(parsed.get("collaboration_analysis", "")).strip(),
            "thematic_evolution": str(parsed.get("thematic_evolution", "")).strip(),
            "strengths": [str(item).strip() for item in parsed.get("strengths", []) if str(item).strip()],
            "blind_spots": [str(item).strip() for item in parsed.get("blind_spots", []) if str(item).strip()],
            "strategic_suggestions": [str(item).strip() for item in parsed.get("strategic_suggestions", []) if str(item).strip()],
            "grant_positioning_notes": [str(item).strip() for item in parsed.get("grant_positioning_notes", []) if str(item).strip()],
            "confidence_markers": [str(item).strip() for item in parsed.get("confidence_markers", []) if str(item).strip()],
            "model_used": model_used,
        }
    except Exception:
        confidence_markers = []
        if int(snapshot.get("total_works", 0) or 0) < 5:
            confidence_markers.append("Low publication count limits trend certainty.")
        if not timeline:
            confidence_markers.append("Timeline data is incomplete.")
        if not themes.get("clusters"):
            confidence_markers.append("Theme clustering is not yet available.")
        return {
            "scholarly_impact_summary": (
                f"Current profile includes {snapshot.get('total_works', 0)} works and "
                f"{snapshot.get('total_citations', 0)} citations with h-index {snapshot.get('h_index', 0)}."
            ),
            "collaboration_analysis": (
                f"Top collaborator count is based on {len(collaborators.get('collaborators', []))} collaborator edges."
            ),
            "thematic_evolution": (
                f"Dominant theme is '{snapshot.get('dominant_theme', '') or 'not established'}' based on current clustered works."
            ),
            "strengths": [
                "Structured citation tracking is available.",
                "Collaboration edges are precomputed.",
            ],
            "blind_spots": [
                "Some works may still be missing abstracts for thematic resolution.",
                "External citation providers may have incomplete coverage for some DOIs.",
            ],
            "strategic_suggestions": [
                "Prioritise venues aligned with dominant themes.",
                "Expand co-authorship breadth in the next publication cycle.",
            ],
            "grant_positioning_notes": [
                "Use h-index and citation velocity with explicit data completeness caveats.",
            ],
            "confidence_markers": confidence_markers,
            "model_used": "fallback-local",
        }


def generate_impact_report(*, user_id: str) -> dict[str, Any]:
    snapshot = get_latest_impact_snapshot(user_id=user_id)
    collaborators = list_collaborators(user_id=user_id)
    themes = get_themes(user_id=user_id)
    analysis = analyse_impact(
        user_id=user_id,
        impact_snapshot=snapshot,
        collaborator_data=collaborators,
        theme_data=themes,
        publication_timeline=persona_timeline(user_id=user_id),
    )
    projected = (
        "Simple linear citation trend suggests "
        f"{snapshot.get('citation_velocity', 0)} citation-change units per year."
    )
    return {
        "executive_summary": analysis["scholarly_impact_summary"],
        "scholarly_metrics": {
            "total_works": snapshot.get("total_works", 0),
            "total_citations": snapshot.get("total_citations", 0),
            "h_index": snapshot.get("h_index", 0),
            "m_index": snapshot.get("m_index", 0.0),
            "citation_velocity": snapshot.get("citation_velocity", 0.0),
        },
        "collaboration_profile": analysis["collaboration_analysis"],
        "thematic_profile": analysis["thematic_evolution"],
        "strategic_analysis": "\n".join(analysis.get("strategic_suggestions", [])),
        "projected_trajectory": projected,
    }

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

_CONFIDENCE_RANK = {"low": 1, "medium": 2, "high": 3}

_LINK_SUGGESTIONS: list[dict[str, str]] = [
    {
        "claim_id": "intro-p1",
        "claim_heading": "Clinical Burden",
        "result_id": "RES-001",
        "result_type": "Primary Endpoint",
        "confidence": "medium",
        "rationale": (
            "Registry burden framing is consistent with observed baseline event "
            "rates in the primary endpoint derivation cohort."
        ),
        "suggested_anchor_label": "Baseline burden cross-check",
    },
    {
        "claim_id": "methods-p1",
        "claim_heading": "Population Definition",
        "result_id": "RES-002",
        "result_type": "Secondary Endpoint",
        "confidence": "high",
        "rationale": (
            "Eligibility and exclusion logic maps directly to adjusted model "
            "denominator and covariate availability constraints."
        ),
        "suggested_anchor_label": "Adjusted denominator compatibility",
    },
    {
        "claim_id": "results-p1",
        "claim_heading": "Primary Endpoint Signal",
        "result_id": "RES-001",
        "result_type": "Primary Endpoint",
        "confidence": "high",
        "rationale": (
            "Primary claim statement matches HR and CI output from the canonical "
            "adjusted Cox model result object."
        ),
        "suggested_anchor_label": "Primary adjusted model output",
    },
    {
        "claim_id": "discussion-p1",
        "claim_heading": "Interpretation in Practice",
        "result_id": "RES-003",
        "result_type": "Subgroup",
        "confidence": "medium",
        "rationale": (
            "Interpretive comparison aligns with sensitivity and subgroup direction; "
            "language should remain cautious pending external validation."
        ),
        "suggested_anchor_label": "Sensitivity and subgroup consistency",
    },
]


def _normalize_claim_ids(claim_ids: list[str] | None) -> set[str]:
    if not claim_ids:
        return set()
    normalized = {claim_id.strip().lower() for claim_id in claim_ids if claim_id.strip()}
    return normalized


def suggest_claim_links(
    *,
    claim_ids: list[str] | None = None,
    min_confidence: Literal["high", "medium", "low"] = "low",
) -> dict[str, object]:
    allowed_claims = _normalize_claim_ids(claim_ids)
    threshold = _CONFIDENCE_RANK[min_confidence]

    suggestions = []
    for suggestion in _LINK_SUGGESTIONS:
        confidence = str(suggestion["confidence"]).lower()
        if _CONFIDENCE_RANK.get(confidence, 0) < threshold:
            continue
        if allowed_claims and str(suggestion["claim_id"]).lower() not in allowed_claims:
            continue
        suggestions.append(dict(suggestion))

    return {
        "run_id": f"lnk-{uuid4().hex[:10]}",
        "generated_at": datetime.now(timezone.utc),
        "suggestions": suggestions,
    }


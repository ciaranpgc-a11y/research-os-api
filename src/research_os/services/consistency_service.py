from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _extract_numbers(text: str) -> set[str]:
    return set(re.findall(r"\b\d+(?:\.\d+)?%?\b", text))


def _extract_sample_sizes(text: str) -> set[int]:
    values = re.findall(r"\bN\s*=\s*(\d+)\b", text, flags=re.IGNORECASE)
    return {int(value) for value in values}


def _find_missing_core_sections(sections: dict[str, str]) -> list[dict[str, str]]:
    missing: list[dict[str, str]] = []
    for section in ("introduction", "methods", "results", "discussion"):
        if not _clean_text(sections.get(section, "")):
            missing.append(
                {
                    "id": f"missing-{section}",
                    "severity": "high",
                    "type": "missing_section",
                    "summary": f"Section '{section}' is empty.",
                    "suggested_fix": "Populate the section before submission-ready checks.",
                    "sections": [section],
                }
            )
    return missing


def _find_n_mismatch_issue(methods: str, results: str) -> list[dict[str, str]]:
    method_sizes = _extract_sample_sizes(methods)
    result_sizes = _extract_sample_sizes(results)
    if not method_sizes or not result_sizes:
        return []
    if method_sizes == result_sizes:
        return []
    method_text = ", ".join(str(item) for item in sorted(method_sizes))
    result_text = ", ".join(str(item) for item in sorted(result_sizes))
    return [
        {
            "id": "n-mismatch",
            "severity": "high",
            "type": "sample_size_mismatch",
            "summary": f"Sample size mismatch between methods (N={method_text}) and results (N={result_text}).",
            "suggested_fix": "Reconcile denominator definitions and report aligned sample counts.",
            "sections": ["methods", "results"],
        }
    ]


def _find_results_discussion_number_drift(
    results: str, discussion: str
) -> list[dict[str, str]]:
    result_numbers = _extract_numbers(results)
    discussion_numbers = _extract_numbers(discussion)
    if not result_numbers or not discussion_numbers:
        return []

    drift = sorted(discussion_numbers - result_numbers)
    if not drift:
        return []
    drift_preview = ", ".join(drift[:5])
    return [
        {
            "id": "result-discussion-number-drift",
            "severity": "medium",
            "type": "number_drift",
            "summary": f"Discussion introduces numeric values absent from results ({drift_preview}).",
            "suggested_fix": "Ensure discussion numerics map to explicitly reported results.",
            "sections": ["results", "discussion"],
        }
    ]


def _find_directionality_conflict(results: str, discussion: str) -> list[dict[str, str]]:
    lowered_results = results.lower()
    lowered_discussion = discussion.lower()
    if not lowered_results or not lowered_discussion:
        return []

    has_lower_signal = any(
        token in lowered_results
        for token in ("lower risk", "reduced risk", "decreased risk", "hr < 1", "hr=0")
    )
    has_higher_signal = any(
        token in lowered_discussion
        for token in ("higher risk", "increased risk", "worse outcome", "harm")
    )
    if not (has_lower_signal and has_higher_signal):
        return []
    return [
        {
            "id": "directionality-conflict",
            "severity": "medium",
            "type": "directionality_conflict",
            "summary": (
                "Results imply lower risk while discussion language implies harm or higher risk."
            ),
            "suggested_fix": "Align directional interpretation across sections.",
            "sections": ["results", "discussion"],
        }
    ]


def run_cross_section_consistency_check(
    sections: dict[str, str],
) -> dict[str, object]:
    normalized = {key.strip().lower(): str(value) for key, value in sections.items()}

    methods = _clean_text(normalized.get("methods", ""))
    results = _clean_text(normalized.get("results", ""))
    discussion = _clean_text(normalized.get("discussion", ""))

    issues: list[dict[str, object]] = []
    issues.extend(_find_missing_core_sections(normalized))
    issues.extend(_find_n_mismatch_issue(methods, results))
    issues.extend(_find_results_discussion_number_drift(results, discussion))
    issues.extend(_find_directionality_conflict(results, discussion))

    high_count = sum(1 for issue in issues if issue["severity"] == "high")
    medium_count = sum(1 for issue in issues if issue["severity"] == "medium")
    low_count = sum(1 for issue in issues if issue["severity"] == "low")

    return {
        "run_id": f"cns-{uuid4().hex[:10]}",
        "generated_at": datetime.now(timezone.utc),
        "total_issues": len(issues),
        "high_severity_count": high_count,
        "medium_severity_count": medium_count,
        "low_severity_count": low_count,
        "issues": issues,
    }

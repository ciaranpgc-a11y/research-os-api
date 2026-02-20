from __future__ import annotations

from research_os.services.generation_job_service import estimate_generation_cost
from research_os.services.wizard_service import infer_wizard_state

_SECTION_BLUEPRINTS: dict[str, dict[str, object]] = {
    "title": {
        "objective": "State disease area, design, intervention/exposure, and endpoint succinctly.",
        "must_include": [
            "Disease focus",
            "Study design keyword",
            "Primary endpoint",
        ],
        "evidence_expectations": [
            "Consistent terminology with abstract and methods",
        ],
        "qc_focus": [
            "Avoid causal language beyond design capability",
            "Keep below journal title length norms",
        ],
        "word_range": (12, 28),
    },
    "abstract": {
        "objective": "Provide structured objective, methods, results, and conclusion summary.",
        "must_include": [
            "Objective statement",
            "Population and design",
            "Primary effect estimate and confidence interval",
            "Balanced conclusion",
        ],
        "evidence_expectations": [
            "At least one anchored result object",
            "Numerical consistency with results section",
        ],
        "qc_focus": [
            "Journal structure compliance",
            "Word budget check",
        ],
        "word_range": (180, 320),
    },
    "introduction": {
        "objective": "Frame clinical burden, evidence gap, and study objective.",
        "must_include": [
            "Disease burden context",
            "Unmet evidence gap",
            "Study objective/hypothesis",
        ],
        "evidence_expectations": [
            "Guideline or benchmark citation",
            "Cohort justification anchor",
        ],
        "qc_focus": [
            "No methods leakage",
            "Mandatory citation slots filled",
        ],
        "word_range": (220, 420),
    },
    "methods": {
        "objective": "Describe population, variables, modeling, and validation reproducibly.",
        "must_include": [
            "Eligibility criteria",
            "Primary/secondary endpoint definitions",
            "Model specification and adjustments",
            "Validation strategy",
        ],
        "evidence_expectations": [
            "Phenotype logic anchor",
            "Model derivation artifacts",
        ],
        "qc_focus": [
            "Reproducibility completeness",
            "Denominator consistency with results",
        ],
        "word_range": (320, 620),
    },
    "results": {
        "objective": "Report baseline and endpoint effects with calibrated uncertainty.",
        "must_include": [
            "Cohort flow and baseline profile",
            "Primary endpoint estimate",
            "Key secondary or subgroup outputs",
        ],
        "evidence_expectations": [
            "Linked result objects for each inferential sentence",
            "Validated model outputs",
        ],
        "qc_focus": [
            "Numeric consistency across manuscript",
            "Inferential language control",
        ],
        "word_range": (260, 520),
    },
    "discussion": {
        "objective": "Interpret findings against external evidence with limitations.",
        "must_include": [
            "Primary interpretation",
            "Clinical relevance",
            "Strengths and limitations",
            "Future work implication",
        ],
        "evidence_expectations": [
            "External comparator citation",
            "Sensitivity analysis anchor",
        ],
        "qc_focus": [
            "Unsupported claim screening",
            "Overstatement/casuality guard",
        ],
        "word_range": (280, 560),
    },
    "conclusion": {
        "objective": "Deliver restrained take-home aligned to evidence strength.",
        "must_include": [
            "Main finding",
            "Scope and caution statement",
        ],
        "evidence_expectations": [
            "Direct consistency with primary endpoint effect",
        ],
        "qc_focus": [
            "No new results introduced",
            "No absolute causal claims for observational designs",
        ],
        "word_range": (70, 170),
    },
}


def _normalize_sections(sections: list[str] | None) -> list[str]:
    if not sections:
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for section in sections:
        slug = section.strip().lower()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        normalized.append(slug)
    return normalized


def _notes_context_from_answers(answers: dict[str, str]) -> str:
    parts: list[str] = []
    for key, value in answers.items():
        cleaned = value.strip()
        if cleaned:
            parts.append(f"{key}: {cleaned}")
    return "\n".join(parts).strip() or "No additional study answers provided."


def _blueprint_for_section(section: str) -> dict[str, object]:
    if section in _SECTION_BLUEPRINTS:
        return _SECTION_BLUEPRINTS[section]
    return {
        "objective": "Draft a publication-ready section consistent with study objective.",
        "must_include": [
            "Core objective fit",
            "Evidence-anchored statements",
        ],
        "evidence_expectations": [
            "At least one evidence anchor",
        ],
        "qc_focus": [
            "Consistency with project-level rules",
        ],
        "word_range": (120, 320),
    }


def build_section_plan(
    *,
    target_journal: str,
    answers: dict[str, str],
    sections: list[str] | None = None,
) -> dict[str, object]:
    inference = infer_wizard_state(target_journal, answers)
    requested_sections = _normalize_sections(sections)
    recommended_sections = list(inference["recommended_sections"])
    resolved_sections = requested_sections or recommended_sections
    notes_context = _notes_context_from_answers(answers)

    items: list[dict[str, object]] = []
    total_low = 0.0
    total_high = 0.0
    for section in resolved_sections:
        blueprint = _blueprint_for_section(section)
        estimate = estimate_generation_cost(
            sections=[section],
            notes_context=notes_context,
        )
        word_low, word_high = blueprint["word_range"]  # type: ignore[index]
        low_cost = float(estimate["estimated_cost_usd_low"])
        high_cost = float(estimate["estimated_cost_usd_high"])
        total_low += low_cost
        total_high += high_cost
        items.append(
            {
                "section": section,
                "objective": str(blueprint["objective"]),
                "must_include": list(blueprint["must_include"]),  # type: ignore[arg-type]
                "evidence_expectations": list(blueprint["evidence_expectations"]),  # type: ignore[arg-type]
                "qc_focus": list(blueprint["qc_focus"]),  # type: ignore[arg-type]
                "target_words_low": int(word_low),
                "target_words_high": int(word_high),
                "estimated_cost_usd_low": round(low_cost, 6),
                "estimated_cost_usd_high": round(high_cost, 6),
            }
        )

    return {
        "inferred_study_type": str(inference["inferred_study_type"]),
        "inferred_primary_endpoint_type": str(
            inference["inferred_primary_endpoint_type"]
        ),
        "recommended_sections": recommended_sections,
        "items": items,
        "total_estimated_cost_usd_low": round(total_low, 6),
        "total_estimated_cost_usd_high": round(total_high, 6),
    }


from __future__ import annotations

from research_os.services.project_service import (
    create_manuscript_for_project,
    create_project_record,
)

JOURNAL_PRESETS = (
    {
        "slug": "ehj",
        "display_name": "European Heart Journal",
        "default_voice": "high-impact cardiovascular research",
    },
    {
        "slug": "jacc",
        "display_name": "Journal of the American College of Cardiology",
        "default_voice": "high-impact clinical cardiology",
    },
    {
        "slug": "generic-original",
        "display_name": "Generic Original Research",
        "default_voice": "formal research manuscript",
    },
)

_QUESTION_BANK: dict[str, dict[str, object]] = {
    "disease_focus": {
        "id": "disease_focus",
        "label": "What disease area is this manuscript focused on?",
        "kind": "text",
        "required": True,
    },
    "population": {
        "id": "population",
        "label": "What population was studied?",
        "kind": "text",
        "required": True,
    },
    "intervention_exposure": {
        "id": "intervention_exposure",
        "label": "What intervention or exposure is central to this study?",
        "kind": "text",
        "required": True,
    },
    "comparator": {
        "id": "comparator",
        "label": "What comparator or control was used?",
        "kind": "text",
        "required": True,
    },
    "primary_outcome": {
        "id": "primary_outcome",
        "label": "What is the primary outcome?",
        "kind": "text",
        "required": True,
    },
    "analysis_summary": {
        "id": "analysis_summary",
        "label": "Summarise the statistical analysis approach.",
        "kind": "textarea",
        "required": True,
    },
    "key_findings": {
        "id": "key_findings",
        "label": "What are the key findings available so far?",
        "kind": "textarea",
        "required": True,
    },
    "manuscript_goal": {
        "id": "manuscript_goal",
        "label": "What do you want AI to do first?",
        "kind": "select",
        "required": True,
        "options": [
            "generate_full_manuscript",
            "revise_existing_draft",
            "journal_reformat_existing_draft",
        ],
    },
    "data_source": {
        "id": "data_source",
        "label": "Which data source is available right now?",
        "kind": "select",
        "required": True,
        "options": [
            "csv_or_xlsx",
            "stats_text_output",
            "existing_draft",
            "manual_entry",
        ],
    },
}

_BASE_REQUIRED_FIELDS = (
    "disease_focus",
    "population",
    "primary_outcome",
    "analysis_summary",
    "key_findings",
    "manuscript_goal",
    "data_source",
)

_STUDY_REQUIRED_FIELDS = {
    "randomized_controlled_trial": ("intervention_exposure", "comparator"),
    "cohort": ("intervention_exposure",),
    "case_control": ("intervention_exposure", "comparator"),
}

_SECTIONS_BY_JOURNAL = {
    "ehj": [
        "title",
        "abstract",
        "introduction",
        "methods",
        "results",
        "discussion",
        "conclusion",
    ],
    "jacc": [
        "title",
        "abstract",
        "introduction",
        "methods",
        "results",
        "discussion",
        "conclusion",
    ],
    "generic-original": [
        "title",
        "abstract",
        "introduction",
        "methods",
        "results",
        "discussion",
        "conclusion",
    ],
}

_STUDY_KEYWORDS = {
    "randomized_controlled_trial": (
        "randomized",
        "randomised",
        "trial",
        "allocation",
    ),
    "cohort": ("cohort", "registry", "follow-up"),
    "case_control": ("case-control", "case control"),
    "cross_sectional": ("cross-sectional", "cross sectional", "survey"),
    "qualitative": ("qualitative", "interview", "focus group"),
}

_ENDPOINT_KEYWORDS = {
    "time_to_event": ("survival", "mortality", "time-to-event", "hazard"),
    "binary": ("event", "complication", "yes/no", "responder"),
    "continuous": ("change", "mean", "score", "biomarker"),
}


def _sanitize_answers(answers: dict[str, str]) -> dict[str, str]:
    sanitized: dict[str, str] = {}
    for key, value in answers.items():
        if not isinstance(value, str):
            continue
        trimmed = value.strip()
        if trimmed:
            sanitized[key] = trimmed
    return sanitized


def _infer_study_type(answers: dict[str, str]) -> str:
    corpus = " ".join(answers.values()).lower()
    best_match = "observational"
    best_score = 0
    for study_type, keywords in _STUDY_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword in corpus)
        if score > best_score:
            best_match = study_type
            best_score = score
    return best_match


def _infer_primary_endpoint_type(answers: dict[str, str]) -> str:
    primary_outcome = answers.get("primary_outcome", "").lower()
    if not primary_outcome:
        return "unspecified"
    best_match = "unspecified"
    best_score = 0
    for endpoint_type, keywords in _ENDPOINT_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword in primary_outcome)
        if score > best_score:
            best_match = endpoint_type
            best_score = score
    return best_match


def _resolve_journal_voice(target_journal: str) -> str:
    for preset in JOURNAL_PRESETS:
        if preset["slug"] == target_journal:
            return preset["default_voice"]
    return "formal research manuscript"


def _required_fields(study_type: str) -> list[str]:
    required = list(_BASE_REQUIRED_FIELDS)
    required.extend(_STUDY_REQUIRED_FIELDS.get(study_type, ()))
    return required


def _recommended_sections(target_journal: str) -> list[str]:
    return list(
        _SECTIONS_BY_JOURNAL.get(
            target_journal, _SECTIONS_BY_JOURNAL["generic-original"]
        )
    )


def infer_wizard_state(
    target_journal: str, answers: dict[str, str]
) -> dict[str, object]:
    sanitized_answers = _sanitize_answers(answers)
    inferred_study_type = _infer_study_type(sanitized_answers)
    required = _required_fields(inferred_study_type)
    missing = [field for field in required if field not in sanitized_answers]
    next_questions = [
        _QUESTION_BANK[field]
        for field in missing
        if field in _QUESTION_BANK
    ]
    return {
        "target_journal": target_journal,
        "journal_voice": _resolve_journal_voice(target_journal),
        "inferred_study_type": inferred_study_type,
        "inferred_primary_endpoint_type": _infer_primary_endpoint_type(
            sanitized_answers
        ),
        "recommended_sections": _recommended_sections(target_journal),
        "answered_fields": sorted(sanitized_answers.keys()),
        "next_questions": next_questions,
    }


def bootstrap_project_from_wizard(
    *,
    title: str,
    target_journal: str,
    answers: dict[str, str],
    journal_voice: str | None,
    language: str,
    branch_name: str,
):
    inference = infer_wizard_state(target_journal, answers)
    resolved_voice = journal_voice or str(inference["journal_voice"])
    study_brief_parts = [
        answers.get("disease_focus", ""),
        answers.get("population", ""),
        answers.get("primary_outcome", ""),
        answers.get("key_findings", ""),
    ]
    study_brief = (
        " | ".join(part.strip() for part in study_brief_parts if part.strip()) or None
    )
    project = create_project_record(
        title=title,
        target_journal=target_journal,
        journal_voice=resolved_voice,
        language=language,
        study_type=str(inference["inferred_study_type"]),
        study_brief=study_brief,
    )
    manuscript = create_manuscript_for_project(
        project_id=project.id,
        branch_name=branch_name,
        sections=list(inference["recommended_sections"]),
    )
    return project, manuscript, inference

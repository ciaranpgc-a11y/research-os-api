from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from research_os.clients.openai_client import ask_gpt

StyleProfile = Literal["technical", "concise", "narrative_review"]

_STYLE_GUIDANCE: dict[StyleProfile, str] = {
    "technical": (
        "Use formal scientific style, precise claims, and restrained interpretation."
    ),
    "concise": (
        "Use short direct sentences, remove redundancy, and prioritize key findings."
    ),
    "narrative_review": (
        "Use synthesis-oriented flow and reader-friendly transitions."
    ),
}


class SubmissionPackGenerationError(RuntimeError):
    """Raised when submission pack generation fails."""


def _normalize_sections(sections: dict[str, str]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for section, content in sections.items():
        key = section.strip().lower()
        value = str(content).strip()
        if not key or not value:
            continue
        normalized[key] = value
    return normalized


def _build_prompt(
    *,
    sections: dict[str, str],
    style_profile: StyleProfile,
    target_journal: str,
    include_plain_language_summary: bool,
) -> str:
    section_lines: list[str] = []
    for section, content in sections.items():
        section_lines.append(f"[{section.upper()}]")
        section_lines.append(content)
        section_lines.append("")

    plain_language_requirement = (
        "Include a plain-language summary."
        if include_plain_language_summary
        else "Set plain_language_summary to an empty string."
    )

    return (
        "You are preparing a manuscript submission pack for a journal.\n"
        f"TARGET JOURNAL: {target_journal}\n"
        f"STYLE PROFILE: {style_profile}\n"
        f"STYLE GUIDANCE: {_STYLE_GUIDANCE[style_profile]}\n"
        f"REQUIREMENT: {plain_language_requirement}\n\n"
        "SOURCE MANUSCRIPT:\n"
        f"{'\n'.join(section_lines).strip()}\n\n"
        "Return valid JSON only with keys:\n"
        "{\n"
        '  "cover_letter": "string",\n'
        '  "key_points": ["string", "string", "string"],\n'
        '  "highlights": ["string", "string", "string"],\n'
        '  "plain_language_summary": "string"\n'
        "}\n"
        "Rules:\n"
        "1) Use only information present in source manuscript content.\n"
        "2) Keep claims cautious and publication-ready.\n"
        "3) Keep cover letter concise (roughly 120-220 words).\n"
        "4) Key points and highlights should each contain 3 bullets.\n"
    )


def _extract_json_block(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        raise SubmissionPackGenerationError(
            "Submission pack output did not include a valid JSON object."
        )
    return match.group(0)


def _coerce_bullets(value: object, *, fallback_prefix: str) -> list[str]:
    if isinstance(value, list):
        bullets = [str(item).strip() for item in value if str(item).strip()]
        if bullets:
            return bullets[:3]
    return [f"{fallback_prefix} 1", f"{fallback_prefix} 2", f"{fallback_prefix} 3"]


def build_submission_pack(
    *,
    sections: dict[str, str],
    target_journal: str,
    style_profile: StyleProfile = "technical",
    include_plain_language_summary: bool = True,
    model: str = "gpt-4.1-mini",
) -> dict[str, object]:
    normalized_sections = _normalize_sections(sections)
    if not normalized_sections:
        raise SubmissionPackGenerationError(
            "Cannot build submission pack from empty manuscript content."
        )

    prompt = _build_prompt(
        sections=normalized_sections,
        style_profile=style_profile,
        target_journal=target_journal,
        include_plain_language_summary=include_plain_language_summary,
    )
    try:
        output = ask_gpt(prompt=prompt, model=model)
    except Exception as exc:
        raise SubmissionPackGenerationError(
            "Failed to generate submission pack."
        ) from exc

    try:
        payload = json.loads(_extract_json_block(output))
    except Exception as exc:  # pragma: no cover - guarded by tests via patching
        raise SubmissionPackGenerationError(
            "Submission pack output could not be parsed."
        ) from exc

    cover_letter = str(payload.get("cover_letter", "")).strip()
    if not cover_letter:
        raise SubmissionPackGenerationError("Generated cover letter was empty.")

    key_points = _coerce_bullets(payload.get("key_points"), fallback_prefix="Key point")
    highlights = _coerce_bullets(payload.get("highlights"), fallback_prefix="Highlight")
    plain_language_summary = str(payload.get("plain_language_summary", "")).strip()
    if not include_plain_language_summary:
        plain_language_summary = ""

    return {
        "run_id": f"spk-{uuid4().hex[:10]}",
        "generated_at": datetime.now(timezone.utc),
        "target_journal": target_journal,
        "style_profile": style_profile,
        "cover_letter": cover_letter,
        "key_points": key_points,
        "highlights": highlights,
        "plain_language_summary": plain_language_summary,
    }


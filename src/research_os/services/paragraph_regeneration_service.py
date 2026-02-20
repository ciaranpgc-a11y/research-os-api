from __future__ import annotations

import re
from typing import Literal

from research_os.clients.openai_client import ask_gpt

ConstraintPreset = Literal[
    "shorter",
    "more_cautious",
    "journal_tone",
    "keep_stats_unchanged",
]

_CONSTRAINT_GUIDANCE: dict[ConstraintPreset, str] = {
    "shorter": "Reduce length by roughly 20-35% while preserving core meaning.",
    "more_cautious": "Use more conservative causal language and explicit uncertainty.",
    "journal_tone": "Adjust style toward formal, publication-ready journal prose.",
    "keep_stats_unchanged": "Do not change any numeric value, CI, p-value, or effect size.",
}


class ParagraphRegenerationError(RuntimeError):
    """Raised when paragraph regeneration fails."""


def split_section_paragraphs(section_text: str) -> list[str]:
    chunks = re.split(r"\n\s*\n", section_text.strip())
    return [chunk.strip() for chunk in chunks if chunk.strip()]


def join_section_paragraphs(paragraphs: list[str]) -> str:
    return "\n\n".join(paragraphs).strip()


def replace_paragraph(
    section_text: str, paragraph_index: int, replacement_text: str
) -> tuple[str, str]:
    paragraphs = split_section_paragraphs(section_text)
    if not paragraphs:
        raise ParagraphRegenerationError("Section has no paragraphs to regenerate.")
    if paragraph_index < 0 or paragraph_index >= len(paragraphs):
        raise ParagraphRegenerationError(
            f"Paragraph index {paragraph_index} is out of range (0-{len(paragraphs) - 1})."
        )

    original = paragraphs[paragraph_index]
    paragraphs[paragraph_index] = replacement_text.strip()
    return original, join_section_paragraphs(paragraphs)


def _normalize_constraints(
    constraints: list[ConstraintPreset] | None,
) -> list[ConstraintPreset]:
    if not constraints:
        return []
    normalized: list[ConstraintPreset] = []
    for constraint in constraints:
        if constraint not in _CONSTRAINT_GUIDANCE:
            continue
        if constraint not in normalized:
            normalized.append(constraint)
    return normalized


def _normalize_evidence_links(
    evidence_links: list[dict[str, str]] | None,
) -> list[dict[str, str]]:
    if not evidence_links:
        return []
    normalized: list[dict[str, str]] = []
    for link in evidence_links:
        claim_id = str(link.get("claim_id", "")).strip()
        result_id = str(link.get("result_id", "")).strip()
        confidence = str(link.get("confidence", "")).strip()
        label = str(
            link.get("suggested_anchor_label", "") or link.get("anchor_label", "")
        ).strip()
        if not (claim_id or result_id or label):
            continue
        normalized.append(
            {
                "claim_id": claim_id or "n/a",
                "result_id": result_id or "n/a",
                "confidence": confidence or "medium",
                "label": label or "Evidence anchor",
            }
        )
    return normalized


def _build_prompt(
    *,
    section: str,
    paragraph_text: str,
    notes_context: str,
    constraints: list[ConstraintPreset],
    evidence_links: list[dict[str, str]],
    citation_ids: list[str],
    freeform_instruction: str | None,
) -> str:
    constraint_lines = [
        f"- {constraint}: {_CONSTRAINT_GUIDANCE[constraint]}" for constraint in constraints
    ]
    if not constraint_lines:
        constraint_lines = ["- None"]

    evidence_lines = []
    for index, link in enumerate(evidence_links, start=1):
        evidence_lines.append(
            (
                f"- [E{index}] claim_id={link['claim_id']} result_id={link['result_id']} "
                f"confidence={link['confidence']} label={link['label']}"
            )
        )
    if not evidence_lines:
        evidence_lines = ["- None"]

    citations_line = (
        ", ".join(f"[{citation_id}]" for citation_id in citation_ids)
        if citation_ids
        else "None"
    )
    instruction_text = (freeform_instruction or "").strip() or "None"

    return (
        "You are revising one manuscript paragraph.\n"
        f"SECTION: {section}\n\n"
        "CURRENT PARAGRAPH:\n"
        f"{paragraph_text}\n\n"
        "REVISION CONSTRAINTS:\n"
        f"{'\n'.join(constraint_lines)}\n\n"
        "EVIDENCE LINKS:\n"
        f"{'\n'.join(evidence_lines)}\n\n"
        "CITATION TOKENS:\n"
        f"- {citations_line}\n\n"
        "EXTRA INSTRUCTION:\n"
        f"{instruction_text}\n\n"
        "NOTES CONTEXT:\n"
        f"{notes_context}\n\n"
        "Rules:\n"
        "1) Preserve the original meaning unless constraints require softening.\n"
        "2) Keep or add evidence anchors ([E#] / [CIT-###]) for factual statements.\n"
        "3) Return only the revised paragraph text.\n"
    )


def _extract_unsupported_sentences(
    paragraph: str, evidence_count: int, citation_ids: list[str]
) -> list[str]:
    support_tokens = [f"[E{index}]" for index in range(1, evidence_count + 1)]
    support_tokens.extend(f"[{citation_id}]" for citation_id in citation_ids)
    if not support_tokens:
        return []

    unsupported: list[str] = []
    sentences = re.split(r"(?<=[.!?])\s+", paragraph.strip())
    for sentence in sentences:
        normalized = sentence.strip()
        if not normalized or not re.search(r"[A-Za-z]", normalized):
            continue
        if not any(token in normalized for token in support_tokens):
            unsupported.append(normalized)
    return unsupported


def regenerate_paragraph_text(
    *,
    section: str,
    paragraph_text: str,
    notes_context: str,
    constraints: list[ConstraintPreset] | None = None,
    evidence_links: list[dict[str, str]] | None = None,
    citation_ids: list[str] | None = None,
    freeform_instruction: str | None = None,
    model: str = "gpt-4.1-mini",
) -> dict[str, object]:
    normalized_constraints = _normalize_constraints(constraints)
    normalized_evidence = _normalize_evidence_links(evidence_links)
    normalized_citations = [
        citation_id.strip() for citation_id in (citation_ids or []) if citation_id.strip()
    ]

    prompt = _build_prompt(
        section=section.strip() or "section",
        paragraph_text=paragraph_text,
        notes_context=notes_context,
        constraints=normalized_constraints,
        evidence_links=normalized_evidence,
        citation_ids=normalized_citations,
        freeform_instruction=freeform_instruction,
    )
    try:
        revised = ask_gpt(prompt=prompt, model=model).strip()
    except Exception as exc:
        raise ParagraphRegenerationError("Failed to regenerate paragraph.") from exc

    unsupported = _extract_unsupported_sentences(
        revised,
        evidence_count=len(normalized_evidence),
        citation_ids=normalized_citations,
    )
    return {
        "section": section.strip() or "section",
        "constraints": normalized_constraints,
        "revised_paragraph": revised,
        "unsupported_sentences": unsupported,
    }

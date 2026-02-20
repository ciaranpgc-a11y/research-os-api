from __future__ import annotations

import re
from typing import Literal

from research_os.clients.openai_client import ask_gpt
from research_os.services.citation_service import get_claim_citation_state

StyleProfile = Literal["technical", "concise", "narrative_review"]
GenerationMode = Literal["full", "targeted"]

_STYLE_GUIDANCE: dict[StyleProfile, str] = {
    "technical": (
        "Use precise academic language with explicit methodological framing and "
        "measured interpretation."
    ),
    "concise": (
        "Prefer short sentences, compress redundancy, and prioritize the primary "
        "result narrative."
    ),
    "narrative_review": (
        "Use synthesis-oriented prose with stronger transitions while preserving "
        "claim restraint."
    ),
}


class GroundedDraftGenerationError(RuntimeError):
    """Raised when grounded section generation fails."""


def _normalize_text_items(items: list[str] | None) -> list[str]:
    if not items:
        return []
    normalized: list[str] = []
    for item in items:
        value = item.strip()
        if value:
            normalized.append(value)
    return normalized


def _normalize_evidence_links(
    evidence_links: list[dict[str, str]] | None,
) -> list[dict[str, str]]:
    if not evidence_links:
        return []

    normalized: list[dict[str, str]] = []
    for link in evidence_links:
        claim_id = str(link.get("claim_id", "")).strip()
        claim_heading = str(link.get("claim_heading", "")).strip()
        result_id = str(link.get("result_id", "")).strip()
        confidence = str(link.get("confidence", "")).strip().lower()
        rationale = str(link.get("rationale", "")).strip()
        anchor_label = str(
            link.get("suggested_anchor_label", "") or link.get("anchor_label", "")
        ).strip()
        if not (claim_id or claim_heading or result_id):
            continue
        normalized.append(
            {
                "claim_id": claim_id,
                "claim_heading": claim_heading,
                "result_id": result_id,
                "confidence": confidence or "medium",
                "rationale": rationale,
                "anchor_label": anchor_label or "Evidence anchor",
            }
        )
    return normalized


def _dedupe_preserving_order(items: list[str]) -> list[str]:
    deduped: list[str] = []
    for item in items:
        if item not in deduped:
            deduped.append(item)
    return deduped


def _resolve_citation_ids(
    evidence_links: list[dict[str, str]],
    explicit_citation_ids: list[str],
) -> list[str]:
    resolved: list[str] = list(explicit_citation_ids)
    for link in evidence_links:
        claim_id = str(link.get("claim_id", "")).strip()
        if not claim_id:
            continue
        state = get_claim_citation_state(claim_id, required_slots=0)
        claim_citations = state.get("attached_citation_ids", [])
        if isinstance(claim_citations, list):
            resolved.extend(str(citation_id) for citation_id in claim_citations)
    return _dedupe_preserving_order([item for item in resolved if item])


def _format_context_block(items: list[str], heading: str) -> str:
    if not items:
        return f"{heading}\n- None provided"
    lines = [heading]
    for item in items:
        lines.append(f"- {item}")
    return "\n".join(lines)


def _format_evidence_block(evidence_links: list[dict[str, str]]) -> str:
    if not evidence_links:
        return "EVIDENCE LINKS\n- None provided"

    lines = ["EVIDENCE LINKS"]
    for index, link in enumerate(evidence_links, start=1):
        lines.append(
            (
                f"- [E{index}] claim_id={link['claim_id'] or 'n/a'}; "
                f"heading={link['claim_heading'] or 'n/a'}; "
                f"result_id={link['result_id'] or 'n/a'}; "
                f"confidence={link['confidence']}; "
                f"anchor_label={link['anchor_label']}"
            )
        )
        if link["rationale"]:
            lines.append(f"  rationale: {link['rationale']}")
    return "\n".join(lines)


def _build_pass_prompt(
    *,
    pass_name: str,
    section: str,
    notes_context: str,
    style_profile: StyleProfile,
    plan_objective: str | None,
    must_include: list[str],
    evidence_links: list[dict[str, str]],
    citation_ids: list[str],
    generation_mode: GenerationMode,
    target_instruction: str | None,
    locked_text: str | None,
    current_draft: str | None,
) -> str:
    style_guidance = _STYLE_GUIDANCE[style_profile]

    pass_instruction = {
        "skeleton": (
            "Create a concise scaffold of 2-4 short paragraphs that cover core "
            "claims in logical order."
        ),
        "expansion": (
            "Expand the scaffold into a complete section draft with explicit claim "
            "to evidence mapping."
        ),
        "polish": (
            "Refine flow, tighten wording, and enforce the requested style while "
            "keeping evidence mapping intact."
        ),
        "targeted_edit": (
            "Apply a targeted revision only where requested and preserve unaffected "
            "content verbatim when possible."
        ),
    }[pass_name]

    mode_guidance = (
        "Targeted mode is active. Revise only the requested segment and keep all "
        "other section content stable."
        if generation_mode == "targeted"
        else "Full mode is active. Produce a complete section draft."
    )

    citation_text = (
        ", ".join(f"[{citation_id}]" for citation_id in citation_ids)
        if citation_ids
        else "None provided"
    )
    objective_text = plan_objective.strip() if plan_objective else "Not provided"
    must_include_block = _format_context_block(
        must_include,
        "MUST INCLUDE",
    )
    evidence_block = _format_evidence_block(evidence_links)
    prior_draft_block = current_draft.strip() if current_draft else "None"
    locked_text_block = locked_text.strip() if locked_text else "None"
    target_instruction_text = (
        target_instruction.strip() if target_instruction else "None"
    )

    return (
        "You are drafting a publication-ready manuscript section.\n"
        f"SECTION: {section}\n"
        f"PASS: {pass_name}\n"
        f"STYLE PROFILE: {style_profile}\n"
        f"STYLE GUIDANCE: {style_guidance}\n"
        f"MODE: {generation_mode}\n"
        f"MODE GUIDANCE: {mode_guidance}\n"
        f"PASS OBJECTIVE: {pass_instruction}\n"
        f"PLAN OBJECTIVE: {objective_text}\n"
        f"{must_include_block}\n\n"
        f"{evidence_block}\n\n"
        "CITATION TOKENS (use when relevant):\n"
        f"- {citation_text}\n\n"
        "TARGETED REVISION INSTRUCTION:\n"
        f"{target_instruction_text}\n\n"
        "LOCKED TEXT (if provided, preserve unchanged content):\n"
        f"{locked_text_block}\n\n"
        "CURRENT DRAFT FROM PREVIOUS PASS:\n"
        f"{prior_draft_block}\n\n"
        "SOURCE NOTES:\n"
        f"{notes_context}\n\n"
        "Rules:\n"
        "1) Use only supplied notes and evidence links.\n"
        "2) Keep claims cautious and publication-ready.\n"
        "3) Append at least one anchor token ([E#] or [CIT-###]) to each factual sentence.\n"
        "4) Return only the section text.\n"
    )


def _pass_sequence(mode: GenerationMode) -> list[str]:
    if mode == "targeted":
        return ["targeted_edit", "polish"]
    return ["skeleton", "expansion", "polish"]


def _extract_unsupported_sentences(
    draft: str, evidence_count: int, citation_ids: list[str]
) -> list[str]:
    support_tokens = [f"[E{index}]" for index in range(1, evidence_count + 1)]
    support_tokens.extend(f"[{citation_id}]" for citation_id in citation_ids)
    if not support_tokens:
        return []

    unsupported: list[str] = []
    sentences = re.split(r"(?<=[.!?])\s+", draft.strip())
    for sentence in sentences:
        normalized = sentence.strip()
        if not normalized or not re.search(r"[A-Za-z]", normalized):
            continue
        if not any(token in normalized for token in support_tokens):
            unsupported.append(normalized)
    return unsupported


def generate_grounded_section_draft(
    *,
    section: str,
    notes_context: str,
    style_profile: StyleProfile = "technical",
    generation_mode: GenerationMode = "full",
    plan_objective: str | None = None,
    must_include: list[str] | None = None,
    evidence_links: list[dict[str, str]] | None = None,
    citation_ids: list[str] | None = None,
    target_instruction: str | None = None,
    locked_text: str | None = None,
    model: str = "gpt-4.1-mini",
) -> dict[str, object]:
    section_name = section.strip() or "section"
    normalized_must_include = _normalize_text_items(must_include)
    normalized_evidence_links = _normalize_evidence_links(evidence_links)
    explicit_citation_ids = _normalize_text_items(citation_ids)
    resolved_citation_ids = _resolve_citation_ids(
        normalized_evidence_links,
        explicit_citation_ids,
    )

    if generation_mode == "targeted" and not (target_instruction or "").strip():
        raise GroundedDraftGenerationError(
            "Targeted generation mode requires a target instruction."
        )

    draft = ""
    passes: list[dict[str, str]] = []
    for pass_name in _pass_sequence(generation_mode):
        prompt = _build_pass_prompt(
            pass_name=pass_name,
            section=section_name,
            notes_context=notes_context,
            style_profile=style_profile,
            plan_objective=plan_objective,
            must_include=normalized_must_include,
            evidence_links=normalized_evidence_links,
            citation_ids=resolved_citation_ids,
            generation_mode=generation_mode,
            target_instruction=target_instruction,
            locked_text=locked_text,
            current_draft=draft,
        )
        try:
            draft = ask_gpt(prompt=prompt, model=model).strip()
        except Exception as exc:
            raise GroundedDraftGenerationError(
                f"Failed to generate grounded draft for '{section_name}' during pass '{pass_name}'."
            ) from exc
        passes.append({"name": pass_name, "content": draft})

    unsupported_sentences = _extract_unsupported_sentences(
        draft,
        evidence_count=len(normalized_evidence_links),
        citation_ids=resolved_citation_ids,
    )

    return {
        "section": section_name,
        "style_profile": style_profile,
        "generation_mode": generation_mode,
        "draft": draft,
        "passes": passes,
        "evidence_anchor_labels": [
            link["anchor_label"] for link in normalized_evidence_links
        ],
        "citation_ids": resolved_citation_ids,
        "unsupported_sentences": unsupported_sentences,
    }

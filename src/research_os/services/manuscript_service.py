"""Service layer for manuscript-related generation."""

from __future__ import annotations

from research_os.clients.openai_client import ask_gpt
from research_os.prompts.methods import build_section_prompt


class ManuscriptGenerationError(RuntimeError):
    """Raised when manuscript generation fails."""


def draft_section_from_notes(
    section: str, notes: str, model: str = "gpt-4.1-mini"
) -> str:
    """Generate a manuscript section draft from structured notes."""
    prompt = build_section_prompt(section, notes)
    try:
        return ask_gpt(prompt=prompt, model=model)
    except Exception as exc:
        section_name = section.strip() or "section"
        raise ManuscriptGenerationError(
            f"Failed to generate {section_name} draft."
        ) from exc


def draft_methods_from_notes(notes: str, model: str = "gpt-4.1-mini") -> str:
    """Generate a manuscript Methods paragraph from structured notes."""
    return draft_section_from_notes("methods", notes, model)

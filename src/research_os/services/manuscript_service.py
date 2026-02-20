"""Service layer for manuscript-related generation."""

from __future__ import annotations

from research_os.clients.openai_client import ask_gpt
from research_os.prompts.methods import build_methods_prompt


class ManuscriptGenerationError(RuntimeError):
    """Raised when manuscript generation fails."""


def draft_methods_from_notes(notes: str, model: str = "gpt-4.1-mini") -> str:
    """Generate a manuscript Methods paragraph from structured notes."""
    prompt = build_methods_prompt(notes)
    try:
        return ask_gpt(prompt=prompt, model=model)
    except Exception as exc:
        raise ManuscriptGenerationError("Failed to generate methods draft.") from exc

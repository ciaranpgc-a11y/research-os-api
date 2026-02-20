"""Prompt builders for manuscript generation."""

from __future__ import annotations


def build_methods_prompt(notes: str) -> str:
    """Build a constrained prompt for generating manuscript Methods text."""
    return (
        "You are an expert academic writer. Draft a concise Methods paragraph "
        "from the notes below. Use UK English. Do not invent details.\n\n"
        "NOTES:\n"
        f"{notes}\n"
    )

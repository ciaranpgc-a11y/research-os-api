"""Prompt builders for manuscript generation."""

from __future__ import annotations


_SECTION_GUIDANCE = {
    "title": (
        "Return a publication-ready title only. Keep it specific, informative, and concise."
    ),
    "abstract": (
        "Write a structured abstract-style paragraph with objective, methods, key result, and conclusion."
    ),
    "introduction": (
        "Focus on context, evidence gap, and the manuscript objective; avoid methods detail."
    ),
    "methods": (
        "Describe study design, population, measures, and analysis clearly, without inventing details."
    ),
    "results": (
        "Summarize findings objectively, prioritizing primary outcomes and key secondary results."
    ),
    "discussion": (
        "Interpret findings against prior evidence, include strengths/limitations, and clinical implications."
    ),
    "conclusion": (
        "Provide a restrained conclusion aligned with presented findings and uncertainty."
    ),
}


def build_section_prompt(section: str, notes: str) -> str:
    """Build a constrained prompt for generating a manuscript section draft."""
    section_name = section.strip() or "section"
    section_key = section_name.lower()
    guidance = _SECTION_GUIDANCE.get(
        section_key,
        "Write a clear, publication-ready manuscript section using only the provided notes.",
    )
    return (
        "You are an expert academic writer. Draft a concise manuscript "
        f"{section_name} section from the notes below. Use UK English. Do not "
        "invent details.\n"
        f"SECTION GUIDANCE: {guidance}\n\n"
        "NOTES:\n"
        f"{notes}\n"
    )


def build_methods_prompt(notes: str) -> str:
    """Build a constrained prompt for generating manuscript Methods text."""
    return build_section_prompt("methods", notes)

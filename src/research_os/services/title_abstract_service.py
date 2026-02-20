from __future__ import annotations

import re
from typing import Literal

from research_os.clients.openai_client import ask_gpt

StyleProfile = Literal["technical", "concise", "narrative_review"]

_STYLE_GUIDANCE: dict[StyleProfile, str] = {
    "technical": (
        "Use formal scientific style, restrained claims, and precise terminology."
    ),
    "concise": (
        "Use short, direct sentences and prioritize the highest-yield findings."
    ),
    "narrative_review": (
        "Use synthesis-focused prose with smooth transitions and clear framing."
    ),
}


class TitleAbstractSynthesisError(RuntimeError):
    """Raised when title/abstract synthesis fails."""


def _normalize_sections(sections: dict[str, str]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for section, content in sections.items():
        key = section.strip().lower()
        value = str(content).strip()
        if not key or not value:
            continue
        if key in {"title", "abstract"}:
            continue
        normalized[key] = value
    return normalized


def _build_prompt(
    *,
    sections: dict[str, str],
    style_profile: StyleProfile,
    max_abstract_words: int,
) -> str:
    lines: list[str] = []
    for section_name, content in sections.items():
        lines.append(f"[{section_name.upper()}]")
        lines.append(content)
        lines.append("")

    return (
        "You are synthesizing a manuscript title and abstract from section text.\n"
        f"STYLE PROFILE: {style_profile}\n"
        f"STYLE GUIDANCE: {_STYLE_GUIDANCE[style_profile]}\n"
        f"MAX ABSTRACT WORDS: {max_abstract_words}\n\n"
        "SOURCE SECTIONS:\n"
        f"{'\n'.join(lines).strip()}\n\n"
        "Rules:\n"
        "1) Use only supplied source sections.\n"
        "2) Keep wording publication-ready and uncertainty-aware.\n"
        "3) Return in this exact format:\n"
        "TITLE: <single-line title>\n"
        "ABSTRACT: <single paragraph abstract>\n"
    )


def _extract_block(output: str, marker: str) -> str | None:
    pattern = rf"{marker}\s*:\s*(.*?)(?=\n[A-Z]+\s*:|\Z)"
    match = re.search(pattern, output, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    return match.group(1).strip()


def _parse_output(output: str) -> tuple[str, str]:
    title = _extract_block(output, "TITLE")
    abstract = _extract_block(output, "ABSTRACT")
    if title and abstract:
        return title.replace("\n", " ").strip(), " ".join(abstract.split()).strip()

    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if len(lines) >= 2:
        fallback_title = lines[0]
        fallback_abstract = " ".join(lines[1:])
        return fallback_title, fallback_abstract

    raise TitleAbstractSynthesisError(
        "Model output could not be parsed into title and abstract."
    )


def synthesize_title_and_abstract(
    *,
    sections: dict[str, str],
    style_profile: StyleProfile = "technical",
    max_abstract_words: int = 250,
    model: str = "gpt-4.1-mini",
) -> dict[str, str]:
    normalized_sections = _normalize_sections(sections)
    if not normalized_sections:
        raise TitleAbstractSynthesisError(
            "Cannot synthesize title/abstract from empty manuscript sections."
        )

    prompt = _build_prompt(
        sections=normalized_sections,
        style_profile=style_profile,
        max_abstract_words=max_abstract_words,
    )
    try:
        output = ask_gpt(prompt=prompt, model=model)
    except Exception as exc:
        raise TitleAbstractSynthesisError(
            "Failed to synthesize title and abstract."
        ) from exc

    title, abstract = _parse_output(output)
    return {"title": title, "abstract": abstract}

from __future__ import annotations

import json
import re
from html import unescape
from typing import Any

import httpx

from research_os.clients.openai_client import get_client

PREFERRED_MODEL = "gpt-5.2"
FALLBACK_MODEL = "gpt-4.1-mini"

JOURNAL_GUIDANCE_URLS: dict[str, list[str]] = {
    "pulmonary-circulation": [
        "https://journals.sagepub.com/home/pul",
    ],
    "american-journal-respiratory-critical-care-medicine": [
        "https://www.atsjournals.org/action/showAuthorGuidelines?journalCode=ajrccm",
    ],
    "european-respiratory-journal": [
        "https://erj.ersjournals.com/site/misc/ifora.xhtml",
    ],
    "chest": [
        "https://journal.chestnet.org/content/authorinfo",
    ],
    "journal-heart-lung-transplantation": [
        "https://www.jhltonline.org/content/authorinfo",
    ],
    "respiration": [
        "https://karger.com/res/pages/instructions-for-authors",
    ],
    "erj-open-research": [
        "https://openres.ersjournals.com/site/misc/ifora.xhtml",
    ],
    "advances-pulmonary-hypertension": [
        "https://www.phaonlineuniv.org/journal",
    ],
    "journal-of-cardiovascular-magnetic-resonance": [
        "https://jcmr-online.biomedcentral.com/submission-guidelines",
    ],
    "jacc-cardiovascular-imaging": [
        "https://www.jacc.org/journal/jcmg/for-authors",
    ],
    "circulation-cardiovascular-imaging": [
        "https://www.ahajournals.org/journal/circimaging/pages/instructions-for-authors",
    ],
    "european-heart-journal-cardiovascular-imaging": [
        "https://academic.oup.com/ehjcimaging/pages/General_Instructions",
    ],
    "magnetic-resonance-in-medicine": [
        "https://onlinelibrary.wiley.com/page/journal/15222594/homepage/forauthors.html",
    ],
    "european-radiology": [
        "https://www.springer.com/journal/330/submission-guidelines",
    ],
    "radiology": [
        "https://pubs.rsna.org/page/radiology/author-center",
    ],
    "insights-into-imaging": [
        "https://insightsimaging.springeropen.com/submission-guidelines",
    ],
    "european-heart-journal": [
        "https://academic.oup.com/eurheartj/pages/General_Instructions",
    ],
    "circulation": [
        "https://www.ahajournals.org/journal/circ/pages/instructions-for-authors",
    ],
    "jacc": [
        "https://www.jacc.org/journal/jacc/for-authors",
    ],
    "heart": [
        "https://heart.bmj.com/pages/authors/",
    ],
    "european-journal-heart-failure": [
        "https://academic.oup.com/eurjhf/pages/General_Instructions",
    ],
    "circulation-heart-failure": [
        "https://www.ahajournals.org/journal/circheartfailure/pages/instructions-for-authors",
    ],
    "esc-heart-failure": [
        "https://onlinelibrary.wiley.com/page/journal/20555922/homepage/forauthors.html",
    ],
    "international-journal-cardiology": [
        "https://www.journals.elsevier.com/international-journal-of-cardiology/publish/guide-for-authors",
    ],
    "clinical-research-in-cardiology": [
        "https://www.springer.com/journal/392/submission-guidelines",
    ],
    "american-journal-cardiology": [
        "https://www.ajconline.org/content/authorinfo",
    ],
    "cardiology": [
        "https://karger.com/crd/pages/instructions-for-authors",
    ],
    "jacc-heart-failure": [
        "https://www.jacc.org/journal/jchf/for-authors",
    ],
    "journal-cardiac-failure": [
        "https://www.onlinejcf.com/content/authorinfo",
    ],
    "european-journal-preventive-cardiology": [
        "https://academic.oup.com/eurjpc/pages/General_Instructions",
    ],
    "frontiers-cardiovascular-medicine": [
        "https://www.frontiersin.org/journals/cardiovascular-medicine#for-authors",
    ],
    "open-heart": [
        "https://openheart.bmj.com/pages/authors/",
    ],
    "cardiovascular-research": [
        "https://academic.oup.com/cardiovascres/pages/General_Instructions",
    ],
    "basic-research-in-cardiology": [
        "https://www.springer.com/journal/395/submission-guidelines",
    ],
    "circulation-research": [
        "https://www.ahajournals.org/journal/res/pages/instructions-for-authors",
    ],
    "journal-american-heart-association": [
        "https://www.ahajournals.org/journal/jaha/pages/instructions-for-authors",
    ],
    "scientific-reports": [
        "https://www.nature.com/srep/author-instructions",
    ],
    "frontiers-physiology": [
        "https://www.frontiersin.org/journals/physiology#for-authors",
    ],
    "physiological-reports": [
        "https://physoc.onlinelibrary.wiley.com/hub/journal/2051817x/about/author-guidelines",
    ],
    "journal-thoracic-disease": [
        "https://jtd.amegroups.org/pages/view/author-instructions",
    ],
    "bmc-pulmonary-medicine": [
        "https://bmcpulmmed.biomedcentral.com/submission-guidelines",
    ],
    "lancet-respiratory-medicine": [
        "https://www.thelancet.com/journals/lanres/for-authors",
    ],
    "thorax": [
        "https://thorax.bmj.com/pages/authors/",
    ],
    "american-journal-physiology-lung-cellular-molecular-physiology": [
        "https://journals.physiology.org/journal/ajplung",
    ],
    "respirology": [
        "https://onlinelibrary.wiley.com/page/journal/14401843/homepage/forauthors.html",
    ],
    "respiratory-research": [
        "https://respiratory-research.biomedcentral.com/submission-guidelines",
    ],
    "respiratory-medicine": [
        "https://www.journals.elsevier.com/respiratory-medicine/publish/guide-for-authors",
    ],
    "journal-nuclear-cardiology": [
        "https://www.springer.com/journal/12350/submission-guidelines",
    ],
    "american-heart-journal": [
        "https://www.sciencedirect.com/journal/american-heart-journal/publish/guide-for-authors",
    ],
    "nature-reviews-cardiology": [
        "https://www.nature.com/nrcardio/for-authors-and-referees",
    ],
    "plos-one": [
        "https://journals.plos.org/plosone/s/submission-guidelines",
    ],
    "bmj-open": [
        "https://bmjopen.bmj.com/pages/authors/",
    ],

    # Backward-compatible aliases
    "ehj-cardiovascular-imaging": [
        "https://academic.oup.com/ehjcimaging/pages/General_Instructions",
    ],
    "circ-cardiovascular-imaging": [
        "https://www.ahajournals.org/journal/circimaging/pages/instructions-for-authors",
    ],
    "heart-bmj": [
        "https://heart.bmj.com/pages/authors/",
    ],
}

_KEYWORD_PATTERN = re.compile(
    r"\b(author|submission|word|length|limit|article|original|brief report|review|"
    r"manuscript|abstract|figure|table|references|instructions)\b",
    re.IGNORECASE,
)
_WORD_TOKEN_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9\-]*")
_NUMBER_PATTERN = re.compile(r"\b\d+(?:\.\d+)?%?\b")
_ACRONYM_PATTERN = re.compile(r"\b[A-Z]{2,}\b")
_INSTRUCTION_START_PATTERN = re.compile(
    r"^(add|include|report|state|specify|clarify|ensure|consider|use|avoid|keep|highlight|describe|outline|mention)\b",
    re.IGNORECASE,
)
_INSTRUCTION_INLINE_PATTERN = re.compile(
    r"\b(you should|should|must|need to|needs to|please|consider)\b",
    re.IGNORECASE,
)
_CAUSAL_REPLACEMENTS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bleads to\b", re.IGNORECASE), "is associated with"),
    (re.compile(r"\bled to\b", re.IGNORECASE), "was associated with"),
    (re.compile(r"\bcauses\b", re.IGNORECASE), "is associated with"),
    (re.compile(r"\bcause\b", re.IGNORECASE), "be associated with"),
    (re.compile(r"\bcaused\b", re.IGNORECASE), "was associated with"),
    (re.compile(r"\bimproves\b", re.IGNORECASE), "is associated with improved"),
    (re.compile(r"\bimproved\b", re.IGNORECASE), "was associated with improved"),
    (re.compile(r"\breduces\b", re.IGNORECASE), "is associated with lower"),
    (re.compile(r"\breduced\b", re.IGNORECASE), "was associated with lower"),
    (re.compile(r"\bincreases\b", re.IGNORECASE), "is associated with higher"),
    (re.compile(r"\bincreased\b", re.IGNORECASE), "was associated with higher"),
)
_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "this",
    "to",
    "was",
    "were",
    "with",
}
_INTERPRETATION_MODE_OPTIONS = (
    "Descriptive phenotype characterization",
    "Descriptive epidemiology and prevalence patterning",
    "Associative risk or prognostic inference",
    "Adjusted association interpretation (multivariable)",
    "Time-to-event prognostic interpretation",
    "Diagnostic performance interpretation",
    "Incremental diagnostic value interpretation",
    "Predictive model development interpretation",
    "Predictive model internal validation interpretation",
    "Predictive model external validation interpretation",
    "Comparative effectiveness interpretation (non-causal)",
    "Treatment-response heterogeneity exploration (non-causal)",
    "Hypothesis-generating mechanistic interpretation",
    "Pathophysiologic plausibility interpretation",
    "Replication or confirmatory association interpretation",
    "Safety and feasibility characterization",
    "Implementation and workflow feasibility interpretation",
)


def _html_to_candidate_lines(html: str) -> list[str]:
    without_scripts = re.sub(
        r"(?is)<(script|style|noscript).*?>.*?</\1>", " ", html
    )
    normalized_breaks = re.sub(
        r"(?i)</(p|li|h1|h2|h3|h4|h5|h6|div|tr|br|section|article)>", "\n", without_scripts
    )
    text = re.sub(r"(?s)<[^>]+>", " ", normalized_breaks)
    text = unescape(text)
    lines = []
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if len(line) < 40:
            continue
        lines.append(line)
    return lines


def _extract_relevant_excerpt(html: str) -> str:
    lines = _html_to_candidate_lines(html)
    keyword_lines = [line for line in lines if _KEYWORD_PATTERN.search(line)]
    selected = keyword_lines[:120] if keyword_lines else lines[:80]
    return "\n".join(selected)


def _fetch_journal_guidance(target_journal: str) -> tuple[list[str], str]:
    urls = JOURNAL_GUIDANCE_URLS.get(target_journal, [])
    if not urls:
        return [], ""

    fetched_urls: list[str] = []
    excerpts: list[str] = []

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        )
    }

    with httpx.Client(timeout=12.0, follow_redirects=True, headers=headers) as client:
        for url in urls[:2]:
            try:
                response = client.get(url)
            except Exception:
                continue
            if response.status_code >= 400:
                continue
            content_type = response.headers.get("content-type", "").lower()
            if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
                continue
            excerpt = _extract_relevant_excerpt(response.text)
            if not excerpt:
                continue
            fetched_urls.append(url)
            excerpts.append(f"Source URL: {url}\n{excerpt[:9000]}")

    return fetched_urls, "\n\n".join(excerpts)


def _strip_json_fences(raw_text: str) -> str:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _ask_model(prompt: str, preferred_model: str) -> tuple[str, str]:
    client = get_client()
    try:
        response = client.responses.create(model=preferred_model, input=prompt)
        return response.output_text, preferred_model
    except Exception:
        fallback_response = client.responses.create(model=FALLBACK_MODEL, input=prompt)
        return fallback_response.output_text, FALLBACK_MODEL


def _combine_model_labels(primary: str, secondary: str) -> str:
    first = primary.strip()
    second = secondary.strip()
    if not first:
        return second
    if not second:
        return first
    if first == second:
        return first
    return f"{first},{second}"


def _generate_summary_refinement(
    *,
    summary_of_research: str,
    research_type: str,
    interpretation_mode: str,
    preferred_model: str,
) -> tuple[list[str], str]:
    summary = _normalize_summary_text(summary_of_research)
    if not summary:
        return [], preferred_model

    prompt = f"""
You are an academic editor. Rewrite the research summary for clarity, flow, and precision.

Inputs:
- research_type: {research_type}
- interpretation_mode: {interpretation_mode}
- summary_of_research: {summary}

Rules:
- Keep all factual content from summary_of_research.
- Do not add new facts, numbers, outcomes, methods, or claims.
- Improve wording only.
- Use 2-4 sentences.
- Avoid bullet points and instruction language.
- For observational framing, keep claims associative and non-causal.

Return JSON only:
{{
  "summary_refinement": "string"
}}
""".strip()

    raw_output, model_used = _ask_model(prompt, preferred_model=preferred_model)
    candidates: list[str] = []
    try:
        parsed = json.loads(_strip_json_fences(raw_output))
        value = parsed.get("summary_refinement")
        if isinstance(value, str):
            candidates.append(value)
    except Exception:
        pass
    candidates.append(_strip_json_fences(raw_output))

    sanitized = _sanitize_summary_refinements(
        _coerce_str_list(candidates, max_items=2),
        summary,
        max_items=1,
    )
    return sanitized, model_used


def _coerce_str_list(value: Any, max_items: int = 3) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _coerce_recommendation(value: Any) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    recommendation = str(value.get("value", "")).strip()
    rationale = str(value.get("rationale", "")).strip()
    if not recommendation:
        return None
    return {
        "value": recommendation,
        "rationale": rationale or "Recommended from journal requirements and study framing.",
    }


def _coerce_interpretation_mode_recommendation(value: Any) -> dict[str, str] | None:
    recommendation = _coerce_recommendation(value)
    if not recommendation:
        return None
    if recommendation["value"] not in _INTERPRETATION_MODE_OPTIONS:
        return None
    return recommendation


def _normalize_summary_text(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return ""
    if normalized[-1] not in ".!?":
        normalized = f"{normalized}."
    return normalized


def _content_tokens(text: str) -> set[str]:
    tokens = {
        token.lower()
        for token in _WORD_TOKEN_PATTERN.findall(text)
        if len(token) > 2 and token.lower() not in _STOPWORDS
    }
    return tokens


def _looks_like_instruction(text: str) -> bool:
    stripped = text.strip()
    lowered = stripped.lower()
    if _INSTRUCTION_START_PATTERN.search(stripped):
        return True
    if _INSTRUCTION_INLINE_PATTERN.search(lowered):
        return True
    if "\n-" in stripped or "\n*" in stripped:
        return True
    return False


def _normalize_rewrite_candidate(candidate: str) -> str:
    normalized = candidate.strip()
    normalized = re.sub(r"^[\-\*\d\.\)\s]+", "", normalized).strip()
    normalized = re.sub(r"\s+", " ", normalized)
    return _normalize_summary_text(normalized)


def _is_valid_summary_rewrite(candidate: str, source_summary: str) -> bool:
    if not candidate:
        return False
    if len(candidate) < 15:
        return False
    if _looks_like_instruction(candidate):
        return False

    source_numbers = set(_NUMBER_PATTERN.findall(source_summary))
    candidate_numbers = set(_NUMBER_PATTERN.findall(candidate))
    if not candidate_numbers.issubset(source_numbers):
        return False

    source_acronyms = set(_ACRONYM_PATTERN.findall(source_summary))
    candidate_acronyms = set(_ACRONYM_PATTERN.findall(candidate))
    if not candidate_acronyms.issubset(source_acronyms):
        return False

    source_tokens = _content_tokens(source_summary)
    candidate_tokens = _content_tokens(candidate)
    if not candidate_tokens:
        return False
    if source_tokens:
        overlap_count = len(source_tokens.intersection(candidate_tokens))
        if overlap_count < 2 and len(source_tokens) >= 4:
            return False
    new_token_ratio = len(candidate_tokens.difference(source_tokens)) / max(1, len(candidate_tokens))
    if new_token_ratio > 0.85:
        return False
    return True


def _sanitize_summary_refinements(
    candidates: list[str], source_summary: str, max_items: int = 1
) -> list[str]:
    cleaned_summary = _normalize_summary_text(source_summary)
    if not cleaned_summary:
        return []

    accepted: list[str] = []
    seen: set[str] = set()
    for raw_candidate in candidates:
        candidate = _normalize_rewrite_candidate(raw_candidate)
        if not _is_valid_summary_rewrite(candidate, cleaned_summary):
            continue
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        accepted.append(candidate)
        if len(accepted) >= max_items:
            break
    return accepted


def _merge_unique_strings(primary: list[str], fallback: list[str], max_items: int = 3) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for source in (primary, fallback):
        for item in source:
            key = item.strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(item.strip())
            if len(merged) >= max_items:
                return merged
    return merged


def _empty_payload(
    *,
    fetched_urls: list[str],
    model_used: str,
    summary_refinements: list[str] | None = None,
) -> dict[str, object]:
    return {
        "summary_refinements": summary_refinements or [],
        "research_type_suggestion": None,
        "interpretation_mode_recommendation": None,
        "article_type_recommendation": None,
        "word_length_recommendation": None,
        "guidance_suggestions": [],
        "source_urls": fetched_urls,
        "model_used": model_used,
    }


def generate_research_overview_suggestions(
    *,
    target_journal: str,
    research_category: str,
    research_type: str,
    article_type: str,
    interpretation_mode: str,
    summary_of_research: str,
    preferred_model: str = PREFERRED_MODEL,
) -> dict[str, object]:
    fetched_urls, guidance_excerpt = _fetch_journal_guidance(target_journal)
    summary_editor_refinements, summary_editor_model = _generate_summary_refinement(
        summary_of_research=summary_of_research,
        research_type=research_type,
        interpretation_mode=interpretation_mode,
        preferred_model=preferred_model,
    )

    prompt = f"""
You are helping draft a rigorous manuscript plan for a small retrospective observational cardiovascular/imaging study.
Use only the supplied journal guidance excerpt when recommending article type and length.

Inputs:
- target_journal_slug: {target_journal}
- research_category: {research_category}
- research_type: {research_type}
- article_type: {article_type}
- interpretation_mode: {interpretation_mode}
- summary_of_research: {summary_of_research}

Journal guidance excerpt:
{guidance_excerpt or "No guidance text could be fetched from configured URLs."}

Return JSON only with this exact schema:
{{
  "summary_refinements": ["string"],
  "research_type_suggestion": {{"value": "string", "rationale": "string"}} | null,
  "interpretation_mode_recommendation": {{"value": "string", "rationale": "string"}} | null,
  "article_type_recommendation": {{"value": "string", "rationale": "string"}} | null,
  "word_length_recommendation": {{"value": "string", "rationale": "string"}} | null,
  "guidance_suggestions": ["string", "string", "string"]
}}

Rules:
- Provide exactly 1 summary_refinement.
- summary_refinements must be full rewritten versions of summary_of_research, each as 2-4 sentences.
- Do not add new facts, endpoints, sample sizes, methods, or results not already present in the inputs.
- Do not write instructions to the user (no "add/include/report/specify/clarify/ensure").
- interpretation_mode_recommendation.value must be one of:
  {", ".join(_INTERPRETATION_MODE_OPTIONS)}
- Keep causal language out for observational framing.
- For article_type_recommendation and word_length_recommendation, prioritize explicit journal requirements from excerpt.
- If explicit limits are absent, provide best-fit ranges and state that limits should be verified at submission.
- guidance_suggestions should be concrete manuscript-planning actions, not diagnostics.
""".strip()

    raw_output, model_used = _ask_model(prompt, preferred_model=preferred_model)
    combined_model_used = _combine_model_labels(summary_editor_model, model_used)
    base_payload = _empty_payload(
        fetched_urls=fetched_urls,
        model_used=combined_model_used,
        summary_refinements=summary_editor_refinements,
    )

    try:
        parsed = json.loads(_strip_json_fences(raw_output))
        summary_refinements = _sanitize_summary_refinements(
            _coerce_str_list(parsed.get("summary_refinements"), max_items=3),
            summary_of_research,
            max_items=1,
        )
        guidance_suggestions = _coerce_str_list(parsed.get("guidance_suggestions"), max_items=3)
        payload = _empty_payload(
            fetched_urls=fetched_urls,
            model_used=combined_model_used,
            summary_refinements=_merge_unique_strings(
                summary_editor_refinements,
                summary_refinements,
                max_items=1,
            ),
        )
        payload["research_type_suggestion"] = _coerce_recommendation(
            parsed.get("research_type_suggestion")
        )
        payload["interpretation_mode_recommendation"] = _coerce_interpretation_mode_recommendation(
            parsed.get("interpretation_mode_recommendation")
        )
        payload["article_type_recommendation"] = _coerce_recommendation(
            parsed.get("article_type_recommendation")
        )
        payload["word_length_recommendation"] = _coerce_recommendation(
            parsed.get("word_length_recommendation")
        )
        payload["guidance_suggestions"] = guidance_suggestions
        return payload
    except Exception:
        return base_payload

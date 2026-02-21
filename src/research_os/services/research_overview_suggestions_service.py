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


def _normalize_summary(summary_of_research: str) -> str:
    normalized = re.sub(r"\s+", " ", summary_of_research).strip()
    if normalized and not re.search(r"[.!?]$", normalized):
        normalized = f"{normalized}."
    return normalized


def _split_sentences(text: str) -> list[str]:
    chunks = [chunk.strip() for chunk in re.split(r"(?<=[.!?])\s+", text) if chunk.strip()]
    return chunks


def _content_words(text: str) -> set[str]:
    return set(re.findall(r"\b[a-z]{4,}\b", text.lower()))


def _number_tokens(text: str) -> set[str]:
    return set(re.findall(r"\b\d+(?:\.\d+)?%?\b", text))


def _looks_like_instruction(text: str) -> bool:
    return bool(
        re.match(
            r"^\s*(add|include|report|clarify|ensure|state|use|specify|consider|"
            r"highlight|emphasize|emphasise)\b",
            text.strip(),
            flags=re.IGNORECASE,
        )
    )


def _is_non_fabricating_rewrite(candidate: str, source_summary: str) -> bool:
    candidate_text = candidate.strip()
    source_text = source_summary.strip()
    if not candidate_text or not source_text:
        return False
    if _looks_like_instruction(candidate_text):
        return False

    source_numbers = _number_tokens(source_text)
    candidate_numbers = _number_tokens(candidate_text)
    if not candidate_numbers.issubset(source_numbers):
        return False

    source_words = _content_words(source_text)
    candidate_words = _content_words(candidate_text)
    if not candidate_words:
        return False
    overlap = len(source_words.intersection(candidate_words))
    overlap_ratio = overlap / max(1, len(candidate_words))
    return overlap_ratio >= 0.55


def _filter_non_fabricating_refinements(
    candidates: list[str], source_summary: str
) -> list[str]:
    filtered: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        cleaned = re.sub(r"\s+", " ", candidate).strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        if not _is_non_fabricating_rewrite(cleaned, source_summary):
            continue
        seen.add(key)
        filtered.append(cleaned)
        if len(filtered) >= 3:
            break
    return filtered


def _fallback_summary_refinements(
    summary_of_research: str,
) -> list[str]:
    normalized = _normalize_summary(summary_of_research)
    if not normalized:
        return []

    sentences = _split_sentences(normalized)
    option_one = normalized

    if len(sentences) > 1:
        option_two = " ".join(sentences[1:] + sentences[:1])
        option_three = " ".join(
            sentence if sentence.endswith(".") else f"{sentence}."
            for sentence in sentences
        )
    else:
        option_two = normalized
        option_three = normalized

    unique: list[str] = []
    seen: set[str] = set()
    for option in [option_one, option_two, option_three]:
        key = option.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(option)
    while len(unique) < 3:
        unique.append(option_one)
    return unique[:3]


def _fallback_payload(
    summary_of_research: str,
    research_type: str,
    fetched_urls: list[str],
    model_used: str,
) -> dict[str, object]:
    return {
        "summary_refinements": _fallback_summary_refinements(summary_of_research),
        "research_type_suggestion": None,
        "article_type_recommendation": {
            "value": "Original Research",
            "rationale": "Default recommendation for observational cohort submissions.",
        },
        "word_length_recommendation": {
            "value": "Abstract 250-300 words; main text 3000-4500 words.",
            "rationale": "Fallback range pending explicit limits from journal guidance.",
        },
        "guidance_suggestions": [
            "Ensure Methods lists eligibility, endpoints, modelling, and missing-data handling.",
            "Report the primary estimate with uncertainty in Results.",
            "Keep Discussion claims aligned to observed associations only.",
        ],
        "source_urls": fetched_urls,
        "model_used": model_used,
    }


def generate_research_overview_suggestions(
    *,
    target_journal: str,
    research_type: str,
    interpretation_mode: str,
    summary_of_research: str,
    preferred_model: str = PREFERRED_MODEL,
) -> dict[str, object]:
    fetched_urls, guidance_excerpt = _fetch_journal_guidance(target_journal)

    prompt = f"""
You are helping draft a rigorous manuscript plan for a small retrospective observational cardiovascular/imaging study.
Use only the supplied journal guidance excerpt when recommending article type and length.

Inputs:
- target_journal_slug: {target_journal}
- research_type: {research_type}
- interpretation_mode: {interpretation_mode}
- summary_of_research: {summary_of_research}

Journal guidance excerpt:
{guidance_excerpt or "No guidance text could be fetched from configured URLs."}

Return JSON only with this exact schema:
{{
  "summary_refinements": ["string", "string", "string"],
  "research_type_suggestion": {{"value": "string", "rationale": "string"}} | null,
  "article_type_recommendation": {{"value": "string", "rationale": "string"}} | null,
  "word_length_recommendation": {{"value": "string", "rationale": "string"}} | null,
  "guidance_suggestions": ["string", "string", "string"]
}}

Rules:
- summary_refinements must be three rewritten versions of summary_of_research only.
- Do not introduce any new facts, methods, outcomes, populations, devices, biomarkers, statistics, or numbers.
- Preserve all factual details already present in summary_of_research.
- If a detail is missing in summary_of_research, keep it missing; do not fill gaps.
- Keep each rewrite as a polished manuscript summary (not instructions or bullet-point advice).
- Keep causal language out for observational framing.
- For article_type_recommendation and word_length_recommendation, prioritize explicit journal requirements from excerpt.
- If explicit limits are absent, provide best-fit ranges and state that limits should be verified at submission.
- guidance_suggestions should be concrete manuscript-planning actions, not diagnostics.
""".strip()

    raw_output, model_used = _ask_model(prompt, preferred_model=preferred_model)

    try:
        parsed = json.loads(_strip_json_fences(raw_output))
        raw_summary_refinements = _coerce_str_list(
            parsed.get("summary_refinements"), max_items=5
        )
        summary_refinements = _filter_non_fabricating_refinements(
            raw_summary_refinements, source_summary=summary_of_research
        )
        guidance_suggestions = _coerce_str_list(parsed.get("guidance_suggestions"), max_items=3)
        payload = {
            "summary_refinements": summary_refinements
            or _fallback_summary_refinements(summary_of_research),
            "research_type_suggestion": _coerce_recommendation(
                parsed.get("research_type_suggestion")
            ),
            "article_type_recommendation": _coerce_recommendation(
                parsed.get("article_type_recommendation")
            ),
            "word_length_recommendation": _coerce_recommendation(
                parsed.get("word_length_recommendation")
            ),
            "guidance_suggestions": guidance_suggestions
            or [
                "Add the primary estimate and uncertainty to the summary and Results plan.",
                "Specify eligibility, endpoints, modelling, and sensitivity checks in Methods.",
                "Keep Discussion claims associative and include limitations explicitly.",
            ],
            "source_urls": fetched_urls,
            "model_used": model_used,
        }

        if not payload["article_type_recommendation"] or not payload["word_length_recommendation"]:
            fallback = _fallback_payload(
                summary_of_research=summary_of_research,
                research_type=research_type,
                fetched_urls=fetched_urls,
                model_used=model_used,
            )
            if not payload["article_type_recommendation"]:
                payload["article_type_recommendation"] = fallback["article_type_recommendation"]
            if not payload["word_length_recommendation"]:
                payload["word_length_recommendation"] = fallback["word_length_recommendation"]
        return payload
    except Exception:
        return _fallback_payload(
            summary_of_research=summary_of_research,
            research_type=research_type,
            fetched_urls=fetched_urls,
            model_used=model_used,
        )

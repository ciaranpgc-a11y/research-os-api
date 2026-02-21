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


def _fallback_summary_refinements(
    summary_of_research: str, research_type: str
) -> list[str]:
    summary = summary_of_research.strip().rstrip(".")
    if not summary:
        return [
            "Summarise the clinical problem, cohort, and imaging method in the first sentence.",
            "State the primary endpoint and model strategy in the second sentence.",
            "Report the primary estimate with uncertainty and keep interpretation associative.",
        ]
    design = research_type.strip().lower() or "retrospective observational cohort"
    return [
        f"In this {design}, {summary}. Clarify population, endpoint, and model strategy.",
        f"{summary}. Add the primary estimate with uncertainty in the final sentence.",
        f"{summary}. Keep interpretation non-causal and include a clear limitations statement.",
    ]


def _fallback_payload(
    summary_of_research: str,
    research_type: str,
    fetched_urls: list[str],
    model_used: str,
) -> dict[str, object]:
    return {
        "summary_refinements": _fallback_summary_refinements(
            summary_of_research, research_type
        ),
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
- summary_refinements must be specific and actionable, each in 1-2 sentences.
- Keep causal language out for observational framing.
- For article_type_recommendation and word_length_recommendation, prioritize explicit journal requirements from excerpt.
- If explicit limits are absent, provide best-fit ranges and state that limits should be verified at submission.
- guidance_suggestions should be concrete manuscript-planning actions, not diagnostics.
""".strip()

    raw_output, model_used = _ask_model(prompt, preferred_model=preferred_model)

    try:
        parsed = json.loads(_strip_json_fences(raw_output))
        summary_refinements = _coerce_str_list(parsed.get("summary_refinements"), max_items=3)
        guidance_suggestions = _coerce_str_list(parsed.get("guidance_suggestions"), max_items=3)
        payload = {
            "summary_refinements": summary_refinements
            or _fallback_summary_refinements(summary_of_research, research_type),
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

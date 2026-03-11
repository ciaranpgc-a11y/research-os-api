from __future__ import annotations

from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import hashlib
import math
import os
import re
import time
from statistics import mean, median
from typing import Any
import xml.etree.ElementTree as ET

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from research_os.clients.openai_client import create_response, get_client
from research_os.db import (
    Author,
    CollaboratorEdge,
    Embedding,
    ImpactSnapshot,
    JournalProfile,
    MetricsSnapshot,
    User,
    Work,
    WorkAuthorship,
    create_all_tables,
    session_scope,
)
from research_os.services.journal_identity import (
    extract_openalex_source_id,
    normalize_issn,
    normalize_issns,
    normalize_venue_type,
)
from research_os.services.metrics_provider_service import get_metrics_provider
from research_os.services.api_telemetry_service import record_api_usage_event
from research_os.services.journal_intelligence_service import (
    refresh_openalex_journal_profiles,
)
from research_os.services.supplementary_work_service import (
    is_supplementary_material_work,
    primary_publication_records,
)

DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
FALLBACK_EMBEDDING_MODEL = "local-hash-1"
TOKEN_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9\-]{2,}")
STOP_WORDS = {
    "and",
    "for",
    "the",
    "with",
    "from",
    "study",
    "analysis",
    "using",
    "pulmonary",
    "hypertension",
    "cardiovascular",
    "imaging",
}
METRICS_PROVIDER_PRIORITY = {
    "openalex": 30,
    "semantic_scholar": 20,
    "semanticscholar": 20,
    "manual": 10,
}
METRICS_SYNC_MAX_WORKERS = 6
PUBMED_FETCH_TIMEOUT_SECONDS = max(
    5.0, float(os.getenv("PUBMED_FETCH_TIMEOUT_SECONDS", "12"))
)
PUBMED_FETCH_RETRY_COUNT = max(0, int(os.getenv("PUBMED_FETCH_RETRY_COUNT", "1")))
PUBMED_FETCH_MAX_WORKERS = max(1, int(os.getenv("PUBMED_FETCH_MAX_WORKERS", "6")))
PUBMED_ARTICLE_TYPE_PRIORITY = 100
RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
MISSING_VENUE_VALUES = {
    "",
    "n/a",
    "na",
    "none",
    "null",
    "unknown",
    "unknown journal",
    "not available",
    "not available from source",
    "not set",
    "-",
    "—",
}
NON_JOURNAL_VENUE_TYPES = {
    "book-series",
    "conference",
    "dataset",
    "ebook-platform",
    "metadata",
    "other",
    "preprint",
    "repository",
}
NON_JOURNAL_VENUE_HINTS = (
    "arxiv",
    "biorxiv",
    "dataverse",
    "dryad",
    "figshare",
    "medrxiv",
    "osf",
    "research square",
    "ssrn",
    "zenodo",
)
JOURNAL_METRIC_LABEL = "2yr_mean_citedness"
PMID_PATTERNS = [
    re.compile(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d+)", re.IGNORECASE),
    re.compile(r"/pubmed/(\d+)", re.IGNORECASE),
    re.compile(r"pmid[:\s]+(\d+)", re.IGNORECASE),
]
ARTICLE_TYPE_META_ANALYSIS_PATTERN = re.compile(
    r"\b(meta[-\s]?analysis|pooled analysis)\b",
    re.IGNORECASE,
)
ARTICLE_TYPE_SCOPING_PATTERN = re.compile(
    r"\b(scoping review|evidence map)\b",
    re.IGNORECASE,
)
ARTICLE_TYPE_SR_PATTERN = re.compile(
    r"\b(systematic review|umbrella review|rapid review)\b",
    re.IGNORECASE,
)
ARTICLE_TYPE_LITERATURE_PATTERN = re.compile(
    r"\b(literature review|narrative review|review article|review)\b",
    re.IGNORECASE,
)
ARTICLE_TYPE_EDITORIAL_PATTERN = re.compile(
    r"\b(editorial|commentary|perspective|viewpoint|opinion)\b",
    re.IGNORECASE,
)
ARTICLE_TYPE_CASE_PATTERN = re.compile(r"\b(case report|case series)\b", re.IGNORECASE)
ARTICLE_TYPE_PROTOCOL_PATTERN = re.compile(
    r"\b(protocol|study protocol)\b", re.IGNORECASE
)
ARTICLE_TYPE_LETTER_PATTERN = re.compile(r"\b(letter|correspondence)\b", re.IGNORECASE)
WORK_TYPE_CONFERENCE_PATTERN = re.compile(
    r"\b(conference|congress|symposium|workshop|annual meeting|scientific sessions|proceedings|poster session)\b",
    re.IGNORECASE,
)
WORK_TYPE_CONFERENCE_TYPE_PATTERN = re.compile(
    r"\b(conference|proceedings|meeting|congress|symposium|workshop)\b",
    re.IGNORECASE,
)
WORK_TYPE_PREPRINT_PATTERN = re.compile(
    r"\b(preprint|arxiv|biorxiv|medrxiv|ssrn|research square|preprints\.org)\b",
    re.IGNORECASE,
)
WORK_TYPE_POSTER_PATTERN = re.compile(r"\bposter\b", re.IGNORECASE)
WORK_TYPE_ABSTRACT_PATTERN = re.compile(r"\babstract\b", re.IGNORECASE)
WORK_TYPE_NUMBERED_ABSTRACT_TITLE_PATTERN = re.compile(
    r"^\s*(?!(?:19|20)\d{2}\b)\d{1,4}\b"
)
WORK_TYPE_CODED_ABSTRACT_TITLE_PATTERN = re.compile(r"^\s*[A-Z]{1,6}\d{1,4}\b")
WORK_TYPE_ABSTRACT_DOI_PATTERN = re.compile(
    r"\b(?:doi\.org/)?10\.\d{4,9}/\S+\.\d{1,4}\b",
    re.IGNORECASE,
)
WORK_TYPE_HEART_SUPPLEMENT_ABSTRACT_DOI_PATTERN = re.compile(
    r"\b(?:doi\.org/)?10\.1136/heartjnl-\d{4}-(?:bcs|bscmr)\.\d+\b",
    re.IGNORECASE,
)
WORK_TYPE_FLGASTRO_SUPPLEMENT_ABSTRACT_DOI_PATTERN = re.compile(
    r"\b(?:doi\.org/)?10\.1136/flgastro-\d{4}-bspghan\.\d+\b",
    re.IGNORECASE,
)
WORK_TYPE_THESIS_PATTERN = re.compile(r"\b(thesis|dissertation)\b", re.IGNORECASE)
WORK_TYPE_DATASET_PATTERN = re.compile(
    r"\b(dataset|data set|data-set)\b", re.IGNORECASE
)
WORK_TYPE_SUPPLEMENTARY_PATTERN = re.compile(
    r"\b(additional file|supplementary|supplemental)\b", re.IGNORECASE
)
WORK_TYPE_BOOK_CHAPTER_PATTERN = re.compile(r"\bbook chapter\b", re.IGNORECASE)
WORK_TYPE_BOOK_PATTERN = re.compile(r"\bbook\b", re.IGNORECASE)
WORK_TYPE_REPORT_PATTERN = re.compile(
    r"\b(report|white paper|technical report)\b", re.IGNORECASE
)

WORK_TYPE_ALIASES = {
    "journal-article": "journal-article",
    "journal article": "journal-article",
    "article": "journal-article",
    "research-article": "journal-article",
    "original-article": "journal-article",
    "original-research": "journal-article",
    "review-article": "journal-article",
    "conference-paper": "conference-paper",
    "conference paper": "conference-paper",
    "proceedings-article": "conference-paper",
    "proceedings article": "conference-paper",
    "conference-abstract": "conference-abstract",
    "conference abstract": "conference-abstract",
    "meeting-abstract": "conference-abstract",
    "meeting abstract": "conference-abstract",
    "conference-poster": "conference-poster",
    "conference poster": "conference-poster",
    "conference-presentation": "conference-presentation",
    "conference presentation": "conference-presentation",
    "book-chapter": "book-chapter",
    "book chapter": "book-chapter",
    "book": "book",
    "preprint": "preprint",
    "working-paper": "working-paper",
    "working paper": "working-paper",
    "report": "report",
    "technical-report": "report",
    "dataset": "data-set",
    "data-set": "data-set",
    "data set": "data-set",
    "dissertation": "dissertation",
    "thesis": "dissertation",
    "patent": "patent",
    "standard": "standard",
    "technical-standard": "standard",
    "software": "software",
    "erratum": "erratum",
    "retracted": "retracted",
    "editorial": "editorial",
    "letter": "letter",
}
WORK_TYPE_CHOICES = [
    "journal-article",
    "conference-paper",
    "conference-abstract",
    "conference-poster",
    "conference-presentation",
    "book-chapter",
    "book",
    "preprint",
    "dissertation",
    "data-set",
    "report",
    "working-paper",
    "patent",
    "standard",
    "software",
    "editorial",
    "letter",
    "erratum",
    "retracted",
    "other",
]


def _normalize_publication_type_hint(value: Any) -> str:
    return re.sub(r"[\s_]+", "-", str(value or "").strip().lower())


def _classify_work_type_with_llm(
    *,
    title: str,
    venue_name: str,
    publisher: str,
    url: str,
    abstract: str,
) -> str | None:
    prompt = (
        "Classify the publication type using ONLY the allowed slugs below.\n"
        f"Allowed: {', '.join(WORK_TYPE_CHOICES)}\n\n"
        f"Title: {title or ''}\n"
        f"Venue: {venue_name or ''}\n"
        f"Publisher: {publisher or ''}\n"
        f"URL: {url or ''}\n"
        f"Abstract: {abstract or ''}\n\n"
        "Return a single slug from the allowed list, or 'other' if unsure."
    )
    try:
        response = create_response(model="gpt-4.1-mini", input=prompt)
        text = (response.output_text or "").strip().lower()
        if not text:
            return None
        token = re.split(r"[\\s\\n\\r\\t,.;:]+", text)[0]
        if token in WORK_TYPE_CHOICES:
            return token
        # Models sometimes answer in a short sentence; recover any valid slug present.
        for choice in sorted(WORK_TYPE_CHOICES, key=len, reverse=True):
            if re.search(rf"\b{re.escape(choice)}\b", text):
                return choice
        for candidate in re.findall(r"[a-z][a-z\-]+", text):
            if candidate in WORK_TYPE_CHOICES:
                return candidate
        return None
    except Exception:
        return None


def _normalize_work_type(
    *,
    work_type: Any,
    title: str,
    venue_name: str,
    publisher: str,
    url: str,
    abstract: str,
    allow_llm: bool,
) -> tuple[str, str | None]:
    raw = re.sub(r"\s+", " ", str(work_type or "").strip())
    normalized = raw.lower().replace("_", " ").strip()
    if normalized in WORK_TYPE_ALIASES:
        return WORK_TYPE_ALIASES[normalized], None
    if normalized:
        dashed = normalized.replace(" ", "-")
        if dashed in WORK_TYPE_ALIASES:
            return WORK_TYPE_ALIASES[dashed], None

    combined = " ".join(
        item for item in [title, venue_name, publisher, url] if str(item).strip()
    )
    _inferred_venue, inferred_work_type = _infer_conference_abstract_metadata(
        title=title,
        doi="",
        url=combined,
    )
    if inferred_work_type:
        return inferred_work_type, None
    if WORK_TYPE_PREPRINT_PATTERN.search(combined):
        return "preprint", None
    if WORK_TYPE_THESIS_PATTERN.search(combined):
        return "dissertation", None
    if WORK_TYPE_BOOK_CHAPTER_PATTERN.search(combined):
        return "book-chapter", None
    if WORK_TYPE_BOOK_PATTERN.search(combined):
        return "book", None
    if WORK_TYPE_DATASET_PATTERN.search(combined):
        return "data-set", None
    if WORK_TYPE_SUPPLEMENTARY_PATTERN.search(title):
        return "data-set", None
    if WORK_TYPE_REPORT_PATTERN.search(combined):
        return "report", None
    if WORK_TYPE_NUMBERED_ABSTRACT_TITLE_PATTERN.match(title) and venue_name.strip():
        return "conference-abstract", None
    if (
        WORK_TYPE_ABSTRACT_DOI_PATTERN.search(combined)
        and venue_name.strip()
        and not abstract.strip()
    ):
        return "conference-abstract", None

    if WORK_TYPE_CONFERENCE_TYPE_PATTERN.search(combined):
        if WORK_TYPE_POSTER_PATTERN.search(combined):
            return "conference-poster", None
        if WORK_TYPE_ABSTRACT_PATTERN.search(combined):
            return "conference-abstract", None
        return "conference-paper", None
    if WORK_TYPE_CONFERENCE_PATTERN.search(combined):
        return "conference-paper", None

    if allow_llm:
        llm = _classify_work_type_with_llm(
            title=title,
            venue_name=venue_name,
            publisher=publisher,
            url=url,
            abstract=abstract,
        )
        if llm:
            return llm, "llm"

    if venue_name.strip():
        return "journal-article", None

    return raw, None


def _infer_article_type_from_title(title: str) -> str:
    clean_title = re.sub(r"\s+", " ", str(title or "").strip())
    if not clean_title:
        return "Original research"
    if ARTICLE_TYPE_META_ANALYSIS_PATTERN.search(clean_title):
        return "Systematic review"
    if ARTICLE_TYPE_SCOPING_PATTERN.search(clean_title):
        return "Systematic review"
    if ARTICLE_TYPE_SR_PATTERN.search(clean_title):
        return "Systematic review"
    if ARTICLE_TYPE_LITERATURE_PATTERN.search(clean_title):
        return "Literature review"
    if ARTICLE_TYPE_EDITORIAL_PATTERN.search(clean_title):
        return "Editorial"
    if ARTICLE_TYPE_CASE_PATTERN.search(clean_title):
        return "Case report"
    if ARTICLE_TYPE_PROTOCOL_PATTERN.search(clean_title):
        return "Protocol"
    if ARTICLE_TYPE_LETTER_PATTERN.search(clean_title):
        return "Letter"
    return "Original research"


def _infer_article_type_for_work(
    *,
    work_payload: dict[str, Any],
    metric_payload: dict[str, Any],
) -> str | None:
    title = re.sub(r"\s+", " ", str(work_payload.get("title", "")).strip())
    work_type = _normalize_publication_type_hint(work_payload.get("work_type"))
    source_type = _normalize_publication_type_hint(metric_payload.get("type"))
    source_type_crossref = _normalize_publication_type_hint(
        metric_payload.get("type_crossref")
    )

    hints = [
        source_type_crossref,
        source_type,
        work_type,
    ]

    for hint in hints:
        if hint in {
            "systematic-review",
            "meta-analysis",
            "scoping-review",
            "umbrella-review",
            "rapid-review",
        }:
            inferred = _infer_article_type_from_title(title)
            if inferred in {"Systematic review"}:
                return inferred
            if hint == "meta-analysis":
                return "Systematic review"
            if hint == "scoping-review":
                return "Systematic review"
            return "Systematic review"
        if hint in {
            "review",
            "review-article",
            "narrative-review",
            "literature-review",
        }:
            inferred = _infer_article_type_from_title(title)
            if inferred in {"Systematic review", "Literature review"}:
                return inferred
            return "Literature review"
        if hint in {"editorial", "commentary", "perspective", "opinion"}:
            return "Editorial"
        if hint in {"letter", "correspondence"}:
            return "Letter"
        if hint in {"case-report", "case-series"}:
            return "Case report"
        if hint in {"protocol", "study-protocol"}:
            return "Protocol"

    journal_like_hints = {
        "journal-article",
        "article",
        "research-article",
        "original-article",
        "original-research",
    }
    conference_like_hints = {
        "conference-paper",
        "conference-abstract",
        "conference-poster",
        "conference-presentation",
        "meeting-abstract",
        "proceedings",
        "proceedings-article",
    }
    if any(hint in journal_like_hints for hint in hints):
        return _infer_article_type_from_title(title)
    if any(hint in conference_like_hints for hint in hints):
        return _infer_article_type_from_title(title)
    return None


def _pubmed_request_xml(pmid: str) -> str:
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
    params = {"db": "pubmed", "id": pmid, "retmode": "xml"}
    with httpx.Client(timeout=PUBMED_FETCH_TIMEOUT_SECONDS) as client:
        response: httpx.Response | None = None
        for attempt in range(PUBMED_FETCH_RETRY_COUNT + 1):
            started = time.perf_counter()
            response = client.get(url, params=params)
            record_api_usage_event(
                provider="pubmed",
                operation="efetch",
                endpoint=url,
                success=response.status_code < 400,
                status_code=response.status_code,
                duration_ms=int((time.perf_counter() - started) * 1000),
                error_code=(
                    None
                    if response.status_code < 400
                    else f"http_{response.status_code}"
                ),
            )
            if (
                response.status_code not in RETRYABLE_STATUS_CODES
                or attempt >= PUBMED_FETCH_RETRY_COUNT
            ):
                break
            time.sleep(0.3 * (attempt + 1))
        if response is None or response.status_code >= 400:
            return ""
        return str(response.text or "")


def _fetch_pubmed_publication_types(pmid: str) -> list[str]:
    xml_text = _pubmed_request_xml(str(pmid).strip())
    if not xml_text.strip():
        return []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return []

    values: list[str] = []
    seen: set[str] = set()
    for node in root.findall(".//PublicationTypeList/PublicationType"):
        text = re.sub(r"\s+", " ", str(node.text or "").strip())
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        values.append(text)
    return values


def _fetch_pubmed_publication_types_batch(pmids: list[str]) -> dict[str, list[str]]:
    normalized = [str(item).strip() for item in pmids if str(item).strip().isdigit()]
    unique_pmids: list[str] = list(dict.fromkeys(normalized))
    if not unique_pmids:
        return {}
    results: dict[str, list[str]] = {}
    max_workers = max(1, min(PUBMED_FETCH_MAX_WORKERS, len(unique_pmids)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_index = {
            executor.submit(_fetch_pubmed_publication_types, pmid): pmid
            for pmid in unique_pmids
        }
        for future in as_completed(future_index):
            pmid = future_index[future]
            try:
                results[pmid] = future.result()
            except Exception:
                results[pmid] = []
    return results


def _fetch_pubmed_publication_metadata(
    pmid: str,
) -> tuple[list[str], str | None]:
    xml_text = _pubmed_request_xml(str(pmid).strip())
    if not xml_text.strip():
        return [], None
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return [], None

    values: list[str] = []
    seen: set[str] = set()
    for node in root.findall(".//PublicationTypeList/PublicationType"):
        text = re.sub(r"\s+", " ", str(node.text or "").strip())
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        values.append(text)

    journal_name = None
    for path in (
        ".//Journal/Title",
        ".//MedlineJournalInfo/MedlineTA",
        ".//Journal/ISOAbbreviation",
    ):
        node = root.find(path)
        if node is None:
            continue
        candidate = _normalize_venue_candidate(node.text)
        if candidate:
            journal_name = candidate
            break

    return values, journal_name


def _fetch_pubmed_publication_metadata_batch(
    pmids: list[str],
) -> dict[str, dict[str, Any]]:
    normalized = [str(item).strip() for item in pmids if str(item).strip().isdigit()]
    unique_pmids: list[str] = list(dict.fromkeys(normalized))
    if not unique_pmids:
        return {}
    results: dict[str, dict[str, Any]] = {}
    max_workers = max(1, min(PUBMED_FETCH_MAX_WORKERS, len(unique_pmids)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_index = {
            executor.submit(_fetch_pubmed_publication_metadata, pmid): pmid
            for pmid in unique_pmids
        }
        for future in as_completed(future_index):
            pmid = future_index[future]
            try:
                publication_types, journal_name = future.result()
                results[pmid] = {
                    "publication_types": publication_types,
                    "journal_name": journal_name,
                }
            except Exception:
                results[pmid] = {
                    "publication_types": [],
                    "journal_name": None,
                }
    return results


def _classify_pubmed_publication_types(
    *, publication_types: list[str], title: str
) -> str | None:
    lowered = [re.sub(r"\s+", " ", item.strip().lower()) for item in publication_types]
    if not lowered:
        return None

    if any("meta-analysis" in item for item in lowered):
        return "Systematic review"
    if any("scoping review" in item for item in lowered):
        return "Systematic review"
    if any(
        item in {"systematic review", "umbrella review", "rapid review"}
        for item in lowered
    ):
        return "Systematic review"
    if any("review" in item for item in lowered):
        inferred = _infer_article_type_from_title(title)
        if inferred in {"Systematic review", "Literature review"}:
            return inferred
        return "Literature review"
    if any("editorial" in item for item in lowered):
        return "Editorial"
    if any(
        item in {"letter", "comment"} or "correspondence" in item for item in lowered
    ):
        return "Letter"
    if any("case reports" in item or "case report" in item for item in lowered):
        return "Case report"
    if any("protocol" in item for item in lowered):
        return "Protocol"
    if any(
        "congresses" in item or "conference" in item or "meeting abstract" in item
        for item in lowered
    ):
        return "Conference abstract"
    if any(
        item
        in {
            "journal article",
            "clinical trial",
            "randomized controlled trial",
            "observational study",
            "comparative study",
            "evaluation study",
            "multicenter study",
            "validation study",
        }
        for item in lowered
    ):
        return "Original research"
    return None


class PersonaValidationError(RuntimeError):
    pass


class PersonaNotFoundError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_title(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _normalize_doi(value: str | None) -> str | None:
    clean = re.sub(r"\s+", "", (value or "").strip()).lower()
    if not clean:
        return None
    if clean.startswith("https://doi.org/"):
        return clean.removeprefix("https://doi.org/")
    return clean


def _normalize_keywords(value: Any) -> list[str]:
    if isinstance(value, list):
        raw = value
    elif isinstance(value, str):
        raw = [item.strip() for item in value.split(",")]
    else:
        raw = []
    keywords: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = re.sub(r"\s+", " ", str(item).strip())
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        keywords.append(text)
    return keywords


def _extract_pmid(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.isdigit():
        return text
    for pattern in PMID_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1)
    return None


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except Exception:
        return None


def _safe_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except Exception:
        return None


def _normalize_venue_candidate(value: Any) -> str | None:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if not text:
        return None
    if text.lower() in MISSING_VENUE_VALUES:
        return None
    return text


def _canonical_venue_key(value: Any) -> str | None:
    clean = _normalize_venue_candidate(value)
    if not clean:
        return None
    key = re.sub(r"[^a-z0-9]+", " ", clean.lower()).strip()
    return key or None


def _venue_display_quality(value: Any) -> tuple[int, int, int]:
    clean = _normalize_venue_candidate(value)
    if not clean:
        return (0, 0, 0)
    words = [word for word in re.split(r"\s+", clean) if word]
    title_words = sum(
        1
        for word in words
        if any(character.isalpha() for character in word)
        and word[:1].isalpha()
        and word[:1].upper() == word[:1]
    )
    uppercase_letters = sum(1 for character in clean if character.isupper())
    return (title_words, uppercase_letters, len(clean))


def _prefer_venue_display_name(current: Any, candidate: Any) -> str | None:
    current_clean = _normalize_venue_candidate(current)
    candidate_clean = _normalize_venue_candidate(candidate)
    if not candidate_clean:
        return current_clean
    if not current_clean:
        return candidate_clean
    if _canonical_venue_key(current_clean) != _canonical_venue_key(candidate_clean):
        return current_clean
    if _venue_display_quality(candidate_clean) > _venue_display_quality(current_clean):
        return candidate_clean
    return current_clean


def _first_venue_candidate(*values: Any) -> str | None:
    for value in values:
        clean = _normalize_venue_candidate(value)
        if clean:
            return clean
    return None


def _first_preferred_venue_candidate(*values: Any) -> str | None:
    first_placeholder: str | None = None
    for value in values:
        clean = _normalize_venue_candidate(value)
        if not clean:
            continue
        if _is_abstracts_placeholder_venue(clean):
            if first_placeholder is None:
                first_placeholder = clean
            continue
        return clean
    return first_placeholder


def _normalize_work_issns(value: Any, *, issn_l: str | None = None) -> list[str]:
    normalized = normalize_issns(value)
    if issn_l and issn_l not in normalized:
        normalized = [issn_l, *normalized]
    return normalized


def _extract_journal_identity(metric_payload: dict[str, Any]) -> dict[str, Any]:
    source = metric_payload.get("source")
    if not isinstance(source, dict):
        primary_location = metric_payload.get("primary_location")
        if isinstance(primary_location, dict):
            source = (
                primary_location.get("source")
                if isinstance(primary_location.get("source"), dict)
                else {}
            )
        else:
            source = {}

    issn_l = normalize_issn(metric_payload.get("issn_l") or source.get("issn_l"))
    issns = _normalize_work_issns(
        metric_payload.get("issn") or metric_payload.get("issns") or source.get("issn"),
        issn_l=issn_l,
    )
    return {
        "openalex_source_id": extract_openalex_source_id(
            metric_payload.get("openalex_source_id") or source.get("id")
        ),
        "issn_l": issn_l,
        "issns": issns,
        "venue_type": normalize_venue_type(
            metric_payload.get("source_type")
            or metric_payload.get("venue_type")
            or source.get("type")
        ),
        "source": source,
    }


def _apply_journal_identity_to_work(
    work: Work,
    *,
    openalex_source_id: str | None,
    issn_l: str | None,
    issns: list[str],
    venue_type: str | None,
    overwrite_existing: bool,
) -> None:
    normalized_issns = _normalize_work_issns(issns, issn_l=issn_l)
    if openalex_source_id and (
        overwrite_existing or not str(work.openalex_source_id or "").strip()
    ):
        work.openalex_source_id = openalex_source_id
    if issn_l and (overwrite_existing or not normalize_issn(work.issn_l)):
        work.issn_l = issn_l
    existing_issns = _normalize_work_issns(
        work.issns_json, issn_l=normalize_issn(work.issn_l)
    )
    if normalized_issns:
        if overwrite_existing or not existing_issns:
            work.issns_json = list(normalized_issns)
        else:
            merged = list(existing_issns)
            for candidate in normalized_issns:
                if candidate not in merged:
                    merged.append(candidate)
            if merged != existing_issns:
                work.issns_json = merged
    if venue_type and (overwrite_existing or not normalize_venue_type(work.venue_type)):
        work.venue_type = venue_type


def _upsert_openalex_journal_profile(
    session: Session, *, metric_payload: dict[str, Any]
) -> None:
    identity = _extract_journal_identity(metric_payload)
    source = identity.get("source") if isinstance(identity.get("source"), dict) else {}
    provider_journal_id = str(identity.get("openalex_source_id") or "").strip() or None
    issn_l = str(identity.get("issn_l") or "").strip() or None
    display_name = _normalize_venue_candidate(
        source.get("display_name") or metric_payload.get("journal_name")
    )
    if not provider_journal_id and not issn_l and not display_name:
        return

    journal_profile: JournalProfile | None = None

    def _matches_pending_profile(candidate: Any) -> bool:
        if not isinstance(candidate, JournalProfile):
            return False
        if str(candidate.provider or "").strip().lower() != "openalex":
            return False
        candidate_provider_id = str(candidate.provider_journal_id or "").strip() or None
        candidate_issn_l = normalize_issn(candidate.issn_l)
        if provider_journal_id and candidate_provider_id == provider_journal_id:
            return True
        if issn_l and candidate_issn_l == issn_l:
            return True
        return False

    for pending in list(session.new) + list(session.identity_map.values()):
        if _matches_pending_profile(pending):
            journal_profile = pending
            break

    if provider_journal_id:
        if journal_profile is None:
            journal_profile = session.scalars(
                select(JournalProfile).where(
                    JournalProfile.provider == "openalex",
                    JournalProfile.provider_journal_id == provider_journal_id,
                )
            ).first()
    if journal_profile is None and issn_l:
        journal_profile = session.scalars(
            select(JournalProfile).where(
                JournalProfile.provider == "openalex",
                JournalProfile.issn_l == issn_l,
            )
        ).first()
    if journal_profile is None:
        journal_profile = JournalProfile(provider="openalex")
        session.add(journal_profile)

    if provider_journal_id:
        journal_profile.provider_journal_id = provider_journal_id
    if issn_l:
        journal_profile.issn_l = issn_l
    issns = identity.get("issns") if isinstance(identity.get("issns"), list) else []
    if issns:
        journal_profile.issns_json = list(issns)
    if display_name:
        journal_profile.display_name = display_name
    publisher = _normalize_venue_candidate(
        source.get("host_organization_name") or source.get("publisher")
    )
    if publisher:
        journal_profile.publisher = publisher
    venue_type = str(identity.get("venue_type") or "").strip() or None
    if venue_type:
        journal_profile.venue_type = venue_type
    summary_stats = source.get("summary_stats")
    if isinstance(summary_stats, dict) and summary_stats:
        journal_profile.summary_stats_json = dict(summary_stats)
    counts_by_year = metric_payload.get("counts_by_year")
    if isinstance(counts_by_year, list) and counts_by_year:
        journal_profile.counts_by_year_json = list(counts_by_year)
    if source.get("is_oa") is not None:
        journal_profile.is_oa = bool(source.get("is_oa"))
    if source.get("is_in_doaj") is not None:
        journal_profile.is_in_doaj = bool(source.get("is_in_doaj"))
    apc_usd = _safe_int(source.get("apc_usd"))
    if apc_usd is not None:
        journal_profile.apc_usd = apc_usd
    homepage_url = str(source.get("homepage_url") or "").strip() or None
    if homepage_url:
        journal_profile.homepage_url = homepage_url
    if isinstance(source, dict) and source:
        journal_profile.raw_payload_json = dict(source)
    journal_profile.last_synced_at = _utcnow()


def _is_abstracts_placeholder_venue(value: Any) -> bool:
    key = _canonical_venue_key(value)
    return key in {"abstract", "abstracts"}


def _infer_venue_from_identifiers(*, doi: Any, url: Any) -> str | None:
    combined = " ".join(
        str(item or "").strip() for item in [doi, url] if str(item or "").strip()
    )
    if WORK_TYPE_HEART_SUPPLEMENT_ABSTRACT_DOI_PATTERN.search(combined):
        return "Heart"
    if WORK_TYPE_FLGASTRO_SUPPLEMENT_ABSTRACT_DOI_PATTERN.search(combined):
        return "Frontline Gastroenterology"
    return None


def _infer_conference_abstract_metadata(
    *,
    title: Any,
    doi: Any,
    url: Any,
) -> tuple[str | None, str | None]:
    clean_title = re.sub(r"\s+", " ", str(title or "").strip())
    inferred_venue = _infer_venue_from_identifiers(doi=doi, url=url)
    if inferred_venue in {"Heart", "Frontline Gastroenterology"}:
        return inferred_venue, "conference-abstract"
    if not (
        WORK_TYPE_NUMBERED_ABSTRACT_TITLE_PATTERN.match(clean_title)
        or WORK_TYPE_CODED_ABSTRACT_TITLE_PATTERN.match(clean_title)
    ):
        return None, None
    return None, None


def _is_figshare_repository_value(value: Any) -> bool:
    return "figshare" in str(value or "").strip().lower()


def _is_figshare_repository_doi(value: Any) -> bool:
    return str(value or "").strip().lower().startswith("10.6084/m9.figshare")


def _has_authoritative_publication_identity(*, work: Work, pmid: str | None) -> bool:
    if str(pmid or "").strip():
        return True
    doi = str(work.doi or "").strip().lower()
    if doi and not _is_figshare_repository_doi(doi):
        return True
    publication_type = str(work.publication_type or "").strip()
    return bool(publication_type)


def _should_override_repository_metadata(*, work: Work, pmid: str | None) -> bool:
    if is_supplementary_material_work(work):
        return False
    if not _has_authoritative_publication_identity(work=work, pmid=pmid):
        return False
    venue_name = _normalize_venue_candidate(work.venue_name)
    journal_name = _normalize_venue_candidate(work.journal)
    return any(
        _is_figshare_repository_value(value)
        for value in [venue_name, journal_name, work.publisher, work.url]
    )


def _extract_pmid_and_journal_metric(
    metric_payload: dict[str, Any],
) -> tuple[str | None, float | None, str | None]:
    pmid = _extract_pmid(metric_payload.get("pmid"))
    if not pmid:
        pmid = _extract_pmid(metric_payload.get("pubmed_id"))
    if not pmid:
        pmid = _extract_pmid((metric_payload.get("ids") or {}).get("pmid"))
    if not pmid:
        pmid = _extract_pmid(metric_payload.get("url"))

    impact_factor = _safe_float(metric_payload.get("journal_impact_factor"))
    if impact_factor is None:
        impact_factor = _safe_float(metric_payload.get("impact_factor"))
    if impact_factor is None:
        impact_factor = _safe_float(metric_payload.get("journal_2yr_mean_citedness"))
    journal_name = _normalize_venue_candidate(metric_payload.get("journal_name"))
    if journal_name is None:
        journal_name = _normalize_venue_candidate(metric_payload.get("journal"))
    if journal_name is None:
        journal_name = _normalize_venue_candidate(metric_payload.get("venue_name"))
    if journal_name is None:
        source = metric_payload.get("source")
        if isinstance(source, dict):
            journal_name = _normalize_venue_candidate(source.get("display_name"))
    if journal_name is None:
        primary_location = metric_payload.get("primary_location")
        if isinstance(primary_location, dict):
            source = primary_location.get("source")
            if isinstance(source, dict):
                journal_name = _normalize_venue_candidate(source.get("display_name"))
    if journal_name and _is_abstracts_placeholder_venue(journal_name):
        inferred_journal = _infer_venue_from_identifiers(
            doi=metric_payload.get("doi"),
            url=(metric_payload.get("open_access") or {}).get("oa_url")
            or metric_payload.get("url"),
        )
        if inferred_journal:
            journal_name = inferred_journal
    return pmid, impact_factor, journal_name


def _journal_metric_from_profile(profile: JournalProfile | None) -> float | None:
    if profile is None:
        return None
    summary_stats = (
        dict(profile.summary_stats_json)
        if isinstance(profile.summary_stats_json, dict)
        else {}
    )
    return _safe_float(summary_stats.get("2yr_mean_citedness"))


def _journal_metric_from_payload(metric_payload: dict[str, Any]) -> float | None:
    _, derived_metric, _ = _extract_pmid_and_journal_metric(metric_payload)
    if derived_metric is not None:
        return derived_metric
    return _safe_float(metric_payload.get("journal_2yr_mean_citedness"))


def _journal_int_stat_from_profile(
    profile: JournalProfile | None, key: str
) -> int | None:
    if profile is None:
        return None
    summary_stats = (
        dict(profile.summary_stats_json)
        if isinstance(profile.summary_stats_json, dict)
        else {}
    )
    return _safe_int(summary_stats.get(key))


def _journal_import_row(profile: JournalProfile | None) -> dict[str, Any]:
    if profile is None or not isinstance(profile.editorial_raw_json, dict):
        return {}
    csv_import = profile.editorial_raw_json.get("csv_import")
    if not isinstance(csv_import, dict):
        return {}
    row = csv_import.get("row")
    return dict(row) if isinstance(row, dict) else {}


def _journal_import_float(profile: JournalProfile | None, *keys: str) -> float | None:
    row = _journal_import_row(profile)
    for key in keys:
        value = _safe_float(row.get(key))
        if value is not None:
            return value
    return None


def _journal_import_text(
    profile: JournalProfile | None,
    *keys: str,
    max_length: int | None = None,
) -> str | None:
    row = _journal_import_row(profile)
    for key in keys:
        value = _normalize_venue_candidate(row.get(key))
        if value:
            return value[:max_length].rstrip() if max_length is not None else value
    return None


def _is_non_journal_venue(
    *,
    venue_type: Any,
    venue_name: Any,
    publisher: Any,
) -> bool:
    normalized_type = normalize_venue_type(venue_type)
    if normalized_type in NON_JOURNAL_VENUE_TYPES:
        return True
    haystack = " ".join(
        str(item or "").strip().lower() for item in [venue_name, publisher]
    )
    if not haystack:
        return False
    return any(token in haystack for token in NON_JOURNAL_VENUE_HINTS)


def _journal_group_key(
    *,
    openalex_source_id: str | None,
    issn_l: str | None,
    display_name: str | None,
) -> str | None:
    if openalex_source_id:
        return f"openalex:{openalex_source_id}"
    if issn_l:
        return f"issn:{issn_l}"
    canonical_name = _canonical_venue_key(display_name)
    if canonical_name:
        return f"name:{canonical_name}"
    return None


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise PersonaNotFoundError(f"User '{user_id}' was not found.")
    return user


def _find_existing_work(
    session,
    *,
    user_id: str,
    doi: str | None,
    url: str | None,
    title_lower: str,
    year: int | None,
) -> Work | None:
    if doi:
        by_doi = session.scalars(
            select(Work).where(Work.user_id == user_id, Work.doi == doi)
        ).first()
        if by_doi is not None:
            return by_doi
    clean_url = re.sub(r"\s+", "", (url or "").strip())
    if clean_url:
        by_url = session.scalars(
            select(Work).where(Work.user_id == user_id, Work.url == url)
        ).first()
        if by_url is not None:
            return by_url
        # If the caller has a concrete URL but no DOI match, treat as a distinct work.
        if not doi:
            return None
    if title_lower:
        by_title = session.scalars(
            select(Work).where(
                Work.user_id == user_id,
                Work.title_lower == title_lower,
                Work.year == year,
            )
        ).first()
        if by_title is not None:
            return by_title
    return None


def _normalize_author_name(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _author_name_key(value: str) -> str:
    return _normalize_author_name(value).lower()


def _upsert_author(
    session, *, canonical_name: str, orcid_id: str | None = None
) -> Author:
    clean_name = _normalize_author_name(canonical_name)
    if not clean_name:
        raise PersonaValidationError("Author name cannot be empty.")
    clean_orcid = re.sub(r"\s+", "", (orcid_id or "").strip()) or None

    if clean_orcid:
        author = session.scalars(
            select(Author).where(Author.orcid_id == clean_orcid)
        ).first()
        if author is not None:
            author.canonical_name = clean_name
            author.canonical_name_lower = _author_name_key(clean_name)
            return author

    key = _author_name_key(clean_name)
    author = session.scalars(
        select(Author).where(Author.canonical_name_lower == key)
    ).first()
    if author is not None:
        if clean_orcid and not author.orcid_id:
            author.orcid_id = clean_orcid
        author.canonical_name = clean_name
        return author

    author = Author(
        canonical_name=clean_name,
        canonical_name_lower=key,
        orcid_id=clean_orcid,
    )
    session.add(author)
    session.flush()
    return author


def upsert_work(
    *,
    user_id: str,
    work: dict[str, Any],
    provenance: str,
    overwrite_user_metadata: bool = False,
    ensure_tables: bool = True,
    session: Session | None = None,
) -> dict[str, Any]:
    if ensure_tables:
        create_all_tables()
    title = _normalize_title(str(work.get("title", "")))
    if not title:
        raise PersonaValidationError("Work title is required.")
    title_lower = title.lower()
    year_raw = work.get("year")
    year = int(year_raw) if str(year_raw).strip().isdigit() else None
    doi = _normalize_doi(work.get("doi"))
    url = str(work.get("url", "")).strip()
    pmid = _extract_pmid(work.get("pmid")) or _extract_pmid(url)
    openalex_source_id = extract_openalex_source_id(work.get("openalex_source_id"))
    issn_l = normalize_issn(work.get("issn_l"))
    issns = _normalize_work_issns(
        work.get("issns") or work.get("issns_json"),
        issn_l=issn_l,
    )
    venue_type = normalize_venue_type(work.get("venue_type"))
    authors = work.get("authors", [])
    if not isinstance(authors, list):
        authors = []
    user_author_position_hint = _safe_int(work.get("user_author_position"))
    if user_author_position_hint is not None and user_author_position_hint <= 0:
        user_author_position_hint = None

    def _upsert(db_session: Session) -> dict[str, Any]:
        user = _resolve_user_or_raise(db_session, user_id)
        existing = _find_existing_work(
            db_session,
            user_id=user.id,
            doi=doi,
            url=url,
            title_lower=title_lower,
            year=year,
        )
        previous_abstract = (
            re.sub(r"\s+", " ", str(existing.abstract or "").strip()) or None
            if existing is not None
            else None
        )

        venue_name = _normalize_venue_candidate(work.get("venue_name")) or ""
        if not venue_name:
            venue_name = _normalize_venue_candidate(work.get("journal")) or ""
        if not venue_name:
            venue_name = _normalize_venue_candidate(work.get("journal_name")) or ""
        if not venue_name:
            venue_name = _infer_venue_from_identifiers(doi=doi, url=url) or ""
        journal_name = _normalize_venue_candidate(work.get("journal")) or venue_name
        publisher = re.sub(r"\s+", " ", str(work.get("publisher", "")).strip())
        raw_work_type = re.sub(r"\s+", " ", str(work.get("work_type", "")).strip())
        allow_llm = bool(
            str(os.getenv("OPENAI_API_KEY", "")).strip()
            and str(os.getenv("ENABLE_WORK_TYPE_LLM", "true")).strip().lower()
            in {"1", "true", "yes"}
            and (
                not existing
                or str(existing.work_type_source or "").strip().lower() != "llm"
            )
            and (not raw_work_type or raw_work_type.strip().lower() == "other")
        )
        normalized_work_type, work_type_source = _normalize_work_type(
            work_type=raw_work_type,
            title=title,
            venue_name=venue_name,
            publisher=publisher,
            url=url,
            abstract=re.sub(r"\s+", " ", str(work.get("abstract", "")).strip()),
            allow_llm=allow_llm,
        )

        mutable_fields = {
            "title": title,
            "title_lower": title_lower,
            "year": year,
            "doi": doi,
            "pmid": pmid,
            "work_type": normalized_work_type,
            "journal": journal_name,
            "venue_name": venue_name,
            "publisher": publisher,
            "abstract": re.sub(r"\s+", " ", str(work.get("abstract", "")).strip())
            or None,
            "keywords": _normalize_keywords(work.get("keywords")),
            "url": url,
            "provenance": provenance,
            "openalex_source_id": openalex_source_id,
            "issn_l": issn_l,
            "issns": issns,
            "venue_type": venue_type,
        }

        if existing is None:
            existing = Work(
                user_id=user.id,
                title=mutable_fields["title"],
                title_lower=mutable_fields["title_lower"],
                year=mutable_fields["year"],
                doi=mutable_fields["doi"],
                pmid=mutable_fields["pmid"],
                work_type=mutable_fields["work_type"],
                journal=mutable_fields["journal"],
                venue_name=mutable_fields["venue_name"],
                publisher=mutable_fields["publisher"],
                abstract=mutable_fields["abstract"],
                keywords=mutable_fields["keywords"],
                url=mutable_fields["url"],
                provenance=mutable_fields["provenance"] or "manual",
            )
            if work_type_source == "llm":
                existing.work_type_source = "llm"
                existing.work_type_llm_at = _utcnow()
            _apply_journal_identity_to_work(
                existing,
                openalex_source_id=mutable_fields["openalex_source_id"],
                issn_l=mutable_fields["issn_l"],
                issns=mutable_fields["issns"],
                venue_type=mutable_fields["venue_type"],
                overwrite_existing=True,
            )
            db_session.add(existing)
            db_session.flush()
        else:
            if overwrite_user_metadata or not existing.user_edited:
                existing.title = mutable_fields["title"]
                existing.title_lower = mutable_fields["title_lower"]
                existing.year = mutable_fields["year"]
                existing.work_type = mutable_fields["work_type"]
                existing.journal = mutable_fields["journal"]
                existing.venue_name = mutable_fields["venue_name"]
                existing.publisher = mutable_fields["publisher"]
                existing.abstract = mutable_fields["abstract"]
                existing.keywords = mutable_fields["keywords"]
                existing.url = mutable_fields["url"]
                if work_type_source == "llm":
                    existing.work_type_source = "llm"
                    existing.work_type_llm_at = _utcnow()
            elif mutable_fields["journal"] and not _normalize_venue_candidate(
                existing.journal
            ):
                existing.journal = mutable_fields["journal"]
            if doi and not existing.doi:
                existing.doi = doi
            if mutable_fields["pmid"] and not _extract_pmid(existing.pmid):
                existing.pmid = mutable_fields["pmid"]
            _apply_journal_identity_to_work(
                existing,
                openalex_source_id=mutable_fields["openalex_source_id"],
                issn_l=mutable_fields["issn_l"],
                issns=mutable_fields["issns"],
                venue_type=mutable_fields["venue_type"],
                overwrite_existing=bool(
                    overwrite_user_metadata or not existing.user_edited
                ),
            )
            existing.provenance = mutable_fields["provenance"] or existing.provenance

        if authors:
            existing_authorships = db_session.scalars(
                select(WorkAuthorship).where(WorkAuthorship.work_id == existing.id)
            ).all()
            by_author_id = {item.author_id: item for item in existing_authorships}
            seen_author_ids: set[str] = set()
            author_order_position = 0
            user_marked_from_identity = False
            user_marked_from_hint = False

            for author_item in authors:
                if not isinstance(author_item, dict):
                    continue
                author_name = _normalize_author_name(str(author_item.get("name", "")))
                if not author_name:
                    continue
                author_orcid = (
                    re.sub(r"\s+", "", str(author_item.get("orcid_id", "")).strip())
                    or None
                )
                author = _upsert_author(
                    db_session,
                    canonical_name=author_name,
                    orcid_id=author_orcid,
                )
                is_user_identity = bool(
                    user.orcid_id and author.orcid_id == user.orcid_id
                ) or (_author_name_key(author_name) == _author_name_key(user.name))
                explicit_user_flag = bool(author_item.get("is_user"))

                # ORCID/OpenAlex payloads can include the same person multiple times;
                # keep the first occurrence and avoid duplicate (work_id, author_id) inserts.
                if author.id in seen_author_ids:
                    link = by_author_id.get(author.id)
                    if link is not None:
                        link.is_user = bool(
                            link.is_user or is_user_identity or explicit_user_flag
                        )
                    continue

                seen_author_ids.add(author.id)
                author_order_position += 1
                is_user_from_hint = bool(
                    user_author_position_hint is not None
                    and author_order_position == user_author_position_hint
                )
                is_user = bool(
                    is_user_identity or explicit_user_flag or is_user_from_hint
                )
                link = by_author_id.get(author.id)
                if link is None:
                    link = WorkAuthorship(
                        work_id=existing.id,
                        author_id=author.id,
                        author_order=author_order_position,
                        is_user=is_user,
                    )
                    db_session.add(link)
                    by_author_id[author.id] = link
                else:
                    link.author_order = author_order_position
                    link.is_user = is_user

                if is_user_identity or explicit_user_flag:
                    user_marked_from_identity = True
                if is_user_from_hint:
                    user_marked_from_hint = True

            if user_author_position_hint is not None and not user_marked_from_identity:
                for link in existing_authorships:
                    if link.author_order == user_author_position_hint:
                        link.is_user = True
                        user_marked_from_hint = True
                    elif user_marked_from_hint:
                        link.is_user = False

            for link in existing_authorships:
                if link.author_id not in seen_author_ids:
                    db_session.delete(link)

        db_session.flush()
        current_abstract = (
            re.sub(r"\s+", " ", str(existing.abstract or "").strip()) or None
        )
        return {
            "id": existing.id,
            "title": existing.title,
            "year": existing.year,
            "doi": existing.doi,
            "work_type": existing.work_type,
            "provenance": existing.provenance,
            "openalex_source_id": existing.openalex_source_id,
            "issn_l": existing.issn_l,
            "issns": list(existing.issns_json or []),
            "venue_type": existing.venue_type,
            "updated_at": existing.updated_at,
            "structured_abstract_refresh_needed": previous_abstract != current_abstract,
        }

    if session is not None:
        return _upsert(session)
    with session_scope() as owned_session:
        result = _upsert(owned_session)
    publication_id = str(result.get("id") or "").strip()
    if publication_id:
        try:
            from research_os.services.publication_console_service import (
                enqueue_publication_drilldown_warmup,
            )

            enqueue_publication_drilldown_warmup(
                user_id=user_id,
                publication_id=publication_id,
                force_structured_abstract=bool(
                    result.get("structured_abstract_refresh_needed")
                ),
            )
        except Exception:
            pass
    return result


def list_works(*, user_id: str) -> list[dict[str, Any]]:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        works = session.scalars(
            select(Work)
            .where(Work.user_id == user_id)
            .order_by(Work.year.desc(), Work.updated_at.desc())
        ).all()
        works = primary_publication_records(works)
        work_ids = [work.id for work in works]
        latest_metrics = _latest_metrics_by_work(session, work_ids)
        authorship_rows = session.scalars(
            select(WorkAuthorship)
            .where(WorkAuthorship.work_id.in_(work_ids or [""]))
            .order_by(WorkAuthorship.work_id.asc(), WorkAuthorship.author_order.asc())
        ).all()
        author_ids = [row.author_id for row in authorship_rows]
        authors = session.scalars(
            select(Author).where(Author.id.in_(author_ids or [""]))
        ).all()
        author_name_by_id = {author.id: author.canonical_name for author in authors}
        authors_by_work: dict[str, list[str]] = defaultdict(list)
        user_author_position_by_work: dict[str, int] = {}
        author_count_by_work: dict[str, int] = defaultdict(int)
        for link in authorship_rows:
            author_count_by_work[link.work_id] = (
                author_count_by_work.get(link.work_id, 0) + 1
            )
            if bool(link.is_user) and link.work_id not in user_author_position_by_work:
                try:
                    position = int(link.author_order or 0)
                except (TypeError, ValueError):
                    position = 0
                if position > 0:
                    user_author_position_by_work[link.work_id] = position
            author_name = author_name_by_id.get(link.author_id, "").strip()
            if not author_name:
                continue
            existing = authors_by_work[link.work_id]
            if author_name in existing:
                continue
            existing.append(author_name)

        payload: list[dict[str, Any]] = []
        for work in works:
            snapshot = latest_metrics.get(work.id)
            metric_payload = dict(snapshot.metric_payload or {}) if snapshot else {}
            pmid = _extract_pmid(work.pmid) or _extract_pmid(work.url)
            journal_metric = None
            derived_pmid, derived_metric, _derived_journal = (
                _extract_pmid_and_journal_metric(metric_payload)
            )
            if not pmid:
                pmid = derived_pmid
            if derived_metric is not None:
                journal_metric = round(derived_metric, 3)
            author_count = author_count_by_work.get(work.id, 0)
            if author_count <= 0:
                author_count = len(authors_by_work.get(work.id, []))
            payload.append(
                {
                    "id": work.id,
                    "title": work.title,
                    "year": work.year,
                    "doi": work.doi,
                    "work_type": work.work_type,
                    "publication_type": str(work.publication_type or "").strip(),
                    "venue_name": work.venue_name,
                    "publisher": work.publisher,
                    "abstract": work.abstract,
                    "keywords": list(work.keywords or []),
                    "url": work.url,
                    "provenance": work.provenance,
                    "cluster_id": work.cluster_id,
                    "authors": authors_by_work.get(work.id, []),
                    "user_author_position": user_author_position_by_work.get(work.id),
                    "author_count": author_count if author_count > 0 else None,
                    "pmid": pmid,
                    "journal_impact_factor": journal_metric,
                    "openalex_source_id": work.openalex_source_id,
                    "issn_l": work.issn_l,
                    "issns": list(work.issns_json or []),
                    "venue_type": work.venue_type,
                    "created_at": work.created_at,
                    "updated_at": work.updated_at,
                }
            )
        return payload


def _load_openalex_journal_profiles(
    session: Session,
    *,
    works: list[Work],
    latest_metrics: dict[str, MetricsSnapshot],
) -> tuple[
    dict[str, JournalProfile],
    dict[str, JournalProfile],
    dict[str, JournalProfile],
]:
    source_ids: set[str] = set()
    issn_ls: set[str] = set()
    display_name_keys: set[str] = set()
    for work in works:
        source_id = extract_openalex_source_id(work.openalex_source_id)
        if source_id:
            source_ids.add(source_id)
        issn_l = normalize_issn(work.issn_l)
        if issn_l:
            issn_ls.add(issn_l)
        for candidate in [work.journal, work.venue_name]:
            canonical_name = _canonical_venue_key(candidate)
            if canonical_name:
                display_name_keys.add(canonical_name)
        snapshot = latest_metrics.get(work.id)
        metric_payload = dict(snapshot.metric_payload or {}) if snapshot else {}
        identity = _extract_journal_identity(metric_payload)
        payload_source_id = extract_openalex_source_id(
            identity.get("openalex_source_id")
        )
        if payload_source_id:
            source_ids.add(payload_source_id)
        payload_issn_l = normalize_issn(identity.get("issn_l"))
        if payload_issn_l:
            issn_ls.add(payload_issn_l)
        source = (
            identity.get("source") if isinstance(identity.get("source"), dict) else {}
        )
        for candidate in [
            identity.get("journal_name"),
            metric_payload.get("journal_name"),
            source.get("display_name"),
        ]:
            canonical_name = _canonical_venue_key(candidate)
            if canonical_name:
                display_name_keys.add(canonical_name)

    by_source_id: dict[str, JournalProfile] = {}
    if source_ids:
        rows = session.scalars(
            select(JournalProfile).where(
                JournalProfile.provider == "openalex",
                JournalProfile.provider_journal_id.in_(sorted(source_ids)),
            )
        ).all()
        by_source_id = {
            str(row.provider_journal_id).strip(): row
            for row in rows
            if str(row.provider_journal_id).strip()
        }

    by_issn_l: dict[str, JournalProfile] = {}
    if issn_ls:
        rows = session.scalars(
            select(JournalProfile).where(
                JournalProfile.provider == "openalex",
                JournalProfile.issn_l.in_(sorted(issn_ls)),
            )
        ).all()
        by_issn_l = {
            normalized_issn: row
            for row in rows
            for normalized_issn in [normalize_issn(row.issn_l)]
            if normalized_issn
        }

    by_display_name: dict[str, JournalProfile] = {}
    if display_name_keys:
        rows = session.scalars(
            select(JournalProfile).where(
                JournalProfile.provider == "openalex",
                func.lower(JournalProfile.display_name).in_(sorted(display_name_keys)),
            )
        ).all()
        for row in rows:
            canonical_name = _canonical_venue_key(row.display_name)
            if not canonical_name:
                continue
            current = by_display_name.get(canonical_name)
            if current is None:
                by_display_name[canonical_name] = row
                continue

            def _profile_score(profile: JournalProfile) -> tuple[int, int, int, int]:
                return (
                    1 if profile.publisher_reported_impact_factor is not None else 0,
                    1 if str(profile.provider_journal_id or "").strip() else 0,
                    1 if str(profile.issn_l or "").strip() else 0,
                    1 if profile.summary_stats_json else 0,
                )

            if _profile_score(row) > _profile_score(current):
                by_display_name[canonical_name] = row
    return by_source_id, by_issn_l, by_display_name


def list_journals(*, user_id: str) -> list[dict[str, Any]]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        works = session.scalars(
            select(Work)
            .where(Work.user_id == user_id)
            .order_by(Work.year.desc(), Work.updated_at.desc())
        ).all()
        works = primary_publication_records(works)
        if not works:
            return []

        work_ids = [work.id for work in works]
        latest_metrics = _latest_metrics_by_work(session, work_ids)
        (
            profiles_by_source_id,
            profiles_by_issn_l,
            profiles_by_display_name,
        ) = _load_openalex_journal_profiles(
            session,
            works=works,
            latest_metrics=latest_metrics,
        )
        total_works = len(works)
        grouped: dict[str, dict[str, Any]] = {}

        for work in works:
            snapshot = latest_metrics.get(work.id)
            metric_payload = dict(snapshot.metric_payload or {}) if snapshot else {}
            identity = _extract_journal_identity(metric_payload)
            _, _, resolved_metric_journal_name = _extract_pmid_and_journal_metric(
                metric_payload
            )
            source_id = extract_openalex_source_id(
                work.openalex_source_id or identity.get("openalex_source_id")
            )
            issn_l = normalize_issn(work.issn_l or identity.get("issn_l"))
            source = (
                identity.get("source")
                if isinstance(identity.get("source"), dict)
                else {}
            )
            matched_profile_by_name = False
            profile = profiles_by_source_id.get(
                source_id or ""
            ) or profiles_by_issn_l.get(issn_l or "")
            if profile is None:
                for candidate in [
                    resolved_metric_journal_name,
                    metric_payload.get("journal_name"),
                    source.get("display_name"),
                    work.journal,
                    work.venue_name,
                ]:
                    canonical_name = _canonical_venue_key(candidate)
                    if not canonical_name:
                        continue
                    profile = profiles_by_display_name.get(canonical_name)
                    if profile is not None:
                        matched_profile_by_name = True
                        break
            source_identity_display_name = _first_venue_candidate(
                profile.display_name if profile is not None else None,
                source.get("display_name"),
                metric_payload.get("journal_name"),
            )
            if matched_profile_by_name:
                display_name = _first_preferred_venue_candidate(
                    resolved_metric_journal_name,
                    metric_payload.get("journal_name"),
                    source.get("display_name"),
                    work.journal,
                    work.venue_name,
                    profile.display_name if profile is not None else None,
                )
            else:
                display_name = _first_preferred_venue_candidate(
                    profile.display_name if profile is not None else None,
                    resolved_metric_journal_name,
                    metric_payload.get("journal_name"),
                    source.get("display_name"),
                    work.journal,
                    work.venue_name,
                )
            if not display_name:
                continue
            publisher = next(
                (
                    candidate
                    for candidate in [
                        _normalize_venue_candidate(
                            profile.publisher if profile is not None else None
                        ),
                        _normalize_venue_candidate(work.publisher),
                        _normalize_venue_candidate(
                            source.get("host_organization_name")
                        ),
                        _normalize_venue_candidate(source.get("publisher")),
                    ]
                    if candidate
                ),
                None,
            )
            venue_type = next(
                (
                    candidate
                    for candidate in [
                        normalize_venue_type(work.venue_type),
                        normalize_venue_type(identity.get("venue_type")),
                        normalize_venue_type(
                            profile.venue_type if profile is not None else None
                        ),
                    ]
                    if candidate
                ),
                None,
            )
            if _is_non_journal_venue(
                venue_type=venue_type,
                venue_name=display_name,
                publisher=publisher,
            ):
                continue

            grouping_source_id = source_id
            if (
                grouping_source_id
                and source_identity_display_name
                and _is_abstracts_placeholder_venue(source_identity_display_name)
                and not _is_abstracts_placeholder_venue(display_name)
            ):
                grouping_source_id = None

            journal_key = _journal_group_key(
                openalex_source_id=grouping_source_id,
                issn_l=issn_l,
                display_name=display_name,
            )
            if not journal_key:
                continue

            citations = max(0, int(snapshot.citations_count or 0)) if snapshot else 0
            issns = _normalize_work_issns(
                work.issns_json or identity.get("issns"),
                issn_l=issn_l,
            )
            metric_value = _journal_metric_from_profile(profile)
            if metric_value is None:
                metric_value = _journal_metric_from_payload(metric_payload)

            group = grouped.setdefault(
                journal_key,
                {
                    "journal_key": journal_key,
                    "display_name": display_name,
                    "publisher": publisher or "",
                    "openalex_source_id": grouping_source_id,
                    "issn_l": issn_l,
                    "issns": list(issns),
                    "venue_type": venue_type,
                    "publication_count": 0,
                    "citation_values": [],
                    "total_citations": 0,
                    "latest_publication_year": None,
                    "journal_metric_value": metric_value,
                    "journal_metric_label": (
                        JOURNAL_METRIC_LABEL if metric_value is not None else None
                    ),
                    "h_index": (
                        _journal_int_stat_from_profile(profile, "h_index")
                        if profile is not None
                        else None
                    ),
                    "i10_index": (
                        _journal_int_stat_from_profile(profile, "i10_index")
                        if profile is not None
                        else None
                    ),
                    "works_count": profile.works_count if profile is not None else None,
                    "cited_by_count": (
                        profile.cited_by_count if profile is not None else None
                    ),
                    "publisher_reported_impact_factor": (
                        profile.publisher_reported_impact_factor
                        if profile is not None
                        else None
                    ),
                    "publisher_reported_impact_factor_year": (
                        profile.publisher_reported_impact_factor_year
                        if profile is not None
                        else None
                    ),
                    "publisher_reported_impact_factor_label": (
                        profile.publisher_reported_impact_factor_label
                        if profile is not None
                        else None
                    ),
                    "publisher_reported_impact_factor_source_url": (
                        profile.publisher_reported_impact_factor_source_url
                        if profile is not None
                        else None
                    ),
                    "five_year_impact_factor": (
                        _journal_import_float(profile, "5_year_jif")
                        if profile is not None
                        else None
                    ),
                    "journal_citation_indicator": (
                        _journal_import_float(profile, "jci")
                        if profile is not None
                        else None
                    ),
                    "jif_quartile": (
                        _journal_import_text(profile, "jif_quartile", max_length=32)
                        if profile is not None
                        else None
                    ),
                    "cited_half_life": (
                        _journal_import_text(profile, "cited_half_life", max_length=64)
                        if profile is not None
                        else None
                    ),
                    "time_to_first_decision_days": (
                        profile.time_to_first_decision_days
                        if profile is not None
                        else None
                    ),
                    "time_to_publication_days": (
                        profile.time_to_publication_days
                        if profile is not None
                        else None
                    ),
                    "editor_in_chief_name": (
                        profile.editor_in_chief_name if profile is not None else None
                    ),
                    "editorial_source_url": (
                        profile.editorial_source_url if profile is not None else None
                    ),
                    "editorial_source_title": (
                        profile.editorial_source_title if profile is not None else None
                    ),
                    "editorial_last_verified_at": (
                        profile.editorial_last_verified_at
                        if profile is not None
                        else None
                    ),
                    "is_oa": profile.is_oa if profile is not None else None,
                    "is_in_doaj": profile.is_in_doaj if profile is not None else None,
                    "apc_usd": profile.apc_usd if profile is not None else None,
                },
            )
            group["publication_count"] += 1
            group["citation_values"].append(citations)
            group["total_citations"] += citations
            year = _safe_int(work.year)
            if year is not None:
                existing_year = _safe_int(group.get("latest_publication_year"))
                if existing_year is None or year > existing_year:
                    group["latest_publication_year"] = year
            if not str(group.get("publisher") or "").strip() and publisher:
                group["publisher"] = publisher
            group["display_name"] = (
                _prefer_venue_display_name(
                    group.get("display_name"),
                    display_name,
                )
                or ""
            )
            if (
                not str(group.get("openalex_source_id") or "").strip()
                and grouping_source_id
            ):
                group["openalex_source_id"] = grouping_source_id
            if not str(group.get("issn_l") or "").strip() and issn_l:
                group["issn_l"] = issn_l
            if not str(group.get("venue_type") or "").strip() and venue_type:
                group["venue_type"] = venue_type
            if issns:
                merged_issns = list(group.get("issns") or [])
                for candidate in issns:
                    if candidate not in merged_issns:
                        merged_issns.append(candidate)
                group["issns"] = merged_issns
            if group.get("journal_metric_value") is None and metric_value is not None:
                group["journal_metric_value"] = metric_value
                group["journal_metric_label"] = JOURNAL_METRIC_LABEL
            if group.get("h_index") is None and profile is not None:
                group["h_index"] = _journal_int_stat_from_profile(profile, "h_index")
            if group.get("i10_index") is None and profile is not None:
                group["i10_index"] = _journal_int_stat_from_profile(
                    profile, "i10_index"
                )
            if group.get("works_count") is None and profile is not None:
                group["works_count"] = profile.works_count
            if group.get("cited_by_count") is None and profile is not None:
                group["cited_by_count"] = profile.cited_by_count
            if (
                group.get("publisher_reported_impact_factor") is None
                and profile is not None
            ):
                group["publisher_reported_impact_factor"] = (
                    profile.publisher_reported_impact_factor
                )
            if (
                group.get("publisher_reported_impact_factor_year") is None
                and profile is not None
            ):
                group["publisher_reported_impact_factor_year"] = (
                    profile.publisher_reported_impact_factor_year
                )
            if (
                not str(
                    group.get("publisher_reported_impact_factor_label") or ""
                ).strip()
                and profile is not None
                and str(profile.publisher_reported_impact_factor_label or "").strip()
            ):
                group["publisher_reported_impact_factor_label"] = (
                    profile.publisher_reported_impact_factor_label
                )
            if (
                not str(
                    group.get("publisher_reported_impact_factor_source_url") or ""
                ).strip()
                and profile is not None
                and str(
                    profile.publisher_reported_impact_factor_source_url or ""
                ).strip()
            ):
                group["publisher_reported_impact_factor_source_url"] = (
                    profile.publisher_reported_impact_factor_source_url
                )
            if group.get("five_year_impact_factor") is None and profile is not None:
                group["five_year_impact_factor"] = _journal_import_float(
                    profile,
                    "5_year_jif",
                )
            if group.get("journal_citation_indicator") is None and profile is not None:
                group["journal_citation_indicator"] = _journal_import_float(
                    profile,
                    "jci",
                )
            if not str(group.get("jif_quartile") or "").strip() and profile is not None:
                group["jif_quartile"] = _journal_import_text(
                    profile,
                    "jif_quartile",
                    max_length=32,
                )
            if (
                not str(group.get("cited_half_life") or "").strip()
                and profile is not None
            ):
                group["cited_half_life"] = _journal_import_text(
                    profile,
                    "cited_half_life",
                    max_length=64,
                )
            if group.get("time_to_first_decision_days") is None and profile is not None:
                group["time_to_first_decision_days"] = (
                    profile.time_to_first_decision_days
                )
            if group.get("time_to_publication_days") is None and profile is not None:
                group["time_to_publication_days"] = profile.time_to_publication_days
            if (
                not str(group.get("editor_in_chief_name") or "").strip()
                and profile is not None
                and str(profile.editor_in_chief_name or "").strip()
            ):
                group["editor_in_chief_name"] = profile.editor_in_chief_name
            if (
                not str(group.get("editorial_source_url") or "").strip()
                and profile is not None
                and str(profile.editorial_source_url or "").strip()
            ):
                group["editorial_source_url"] = profile.editorial_source_url
            if (
                not str(group.get("editorial_source_title") or "").strip()
                and profile is not None
                and str(profile.editorial_source_title or "").strip()
            ):
                group["editorial_source_title"] = profile.editorial_source_title
            if group.get("editorial_last_verified_at") is None and profile is not None:
                group["editorial_last_verified_at"] = profile.editorial_last_verified_at
            if (
                group.get("is_oa") is None
                and profile is not None
                and profile.is_oa is not None
            ):
                group["is_oa"] = profile.is_oa
            if (
                group.get("is_in_doaj") is None
                and profile is not None
                and profile.is_in_doaj is not None
            ):
                group["is_in_doaj"] = profile.is_in_doaj
            if group.get("apc_usd") is None and profile is not None:
                group["apc_usd"] = profile.apc_usd

        payload: list[dict[str, Any]] = []
        for row in grouped.values():
            citation_values = [int(value) for value in row.pop("citation_values", [])]
            publication_count = max(0, int(row["publication_count"]))
            avg_citations = mean(citation_values) if citation_values else 0.0
            median_citations = median(citation_values) if citation_values else 0.0
            share_pct = (
                (publication_count / total_works) * 100.0 if total_works > 0 else 0.0
            )
            payload.append(
                {
                    **row,
                    "share_pct": round(share_pct, 1),
                    "avg_citations": round(float(avg_citations), 1),
                    "median_citations": round(float(median_citations), 1),
                    "journal_metric_value": (
                        round(float(row["journal_metric_value"]), 3)
                        if row.get("journal_metric_value") is not None
                        else None
                    ),
                    "publisher_reported_impact_factor": (
                        round(float(row["publisher_reported_impact_factor"]), 3)
                        if row.get("publisher_reported_impact_factor") is not None
                        else None
                    ),
                    "five_year_impact_factor": (
                        round(float(row["five_year_impact_factor"]), 3)
                        if row.get("five_year_impact_factor") is not None
                        else None
                    ),
                    "journal_citation_indicator": (
                        round(float(row["journal_citation_indicator"]), 3)
                        if row.get("journal_citation_indicator") is not None
                        else None
                    ),
                    "jif_quartile": (
                        str(row.get("jif_quartile") or "").strip() or None
                    ),
                    "cited_half_life": (
                        str(row.get("cited_half_life") or "").strip() or None
                    ),
                }
            )

        payload.sort(
            key=lambda item: (
                -int(item["publication_count"]),
                -int(item["total_citations"]),
                str(item["display_name"]).lower(),
            )
        )
        return payload


def recompute_collaborator_edges(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        works = session.scalars(select(Work).where(Work.user_id == user.id)).all()
        works = primary_publication_records(works)
        work_ids = [work.id for work in works]
        if not work_ids:
            session.scalars(
                select(CollaboratorEdge).where(CollaboratorEdge.user_id == user.id)
            ).all()
            return {
                "core_collaborators": [],
                "new_collaborators_by_year": {},
            }

        authorships = session.scalars(
            select(WorkAuthorship).where(WorkAuthorship.work_id.in_(work_ids))
        ).all()
        work_year_by_id = {work.id: work.year for work in works}
        edge_data: dict[str, dict[str, Any]] = {}
        for link in authorships:
            if link.is_user:
                continue
            bucket = edge_data.setdefault(
                link.author_id,
                {"n_shared_works": 0, "first_year": None, "last_year": None},
            )
            bucket["n_shared_works"] += 1
            year = work_year_by_id.get(link.work_id)
            if isinstance(year, int):
                if bucket["first_year"] is None or year < bucket["first_year"]:
                    bucket["first_year"] = year
                if bucket["last_year"] is None or year > bucket["last_year"]:
                    bucket["last_year"] = year

        existing_edges = session.scalars(
            select(CollaboratorEdge).where(CollaboratorEdge.user_id == user.id)
        ).all()
        by_author = {edge.collaborator_author_id: edge for edge in existing_edges}
        seen_author_ids: set[str] = set()
        for author_id, values in edge_data.items():
            seen_author_ids.add(author_id)
            edge = by_author.get(author_id)
            if edge is None:
                edge = CollaboratorEdge(
                    user_id=user.id,
                    collaborator_author_id=author_id,
                )
                session.add(edge)
            edge.n_shared_works = int(values["n_shared_works"] or 0)
            edge.first_year = values["first_year"]
            edge.last_year = values["last_year"]

        for edge in existing_edges:
            if edge.collaborator_author_id not in seen_author_ids:
                session.delete(edge)

        session.flush()

        collaborator_names = {
            author.id: author.canonical_name
            for author in session.scalars(
                select(Author).where(Author.id.in_(list(edge_data.keys()) or [""]))
            ).all()
        }
        ordered_core = sorted(
            edge_data.items(),
            key=lambda item: item[1]["n_shared_works"],
            reverse=True,
        )[:10]
        core_collaborators = [
            {
                "author_id": author_id,
                "name": collaborator_names.get(author_id, "Unknown"),
                "n_shared_works": int(values["n_shared_works"]),
                "first_year": values["first_year"],
                "last_year": values["last_year"],
            }
            for author_id, values in ordered_core
        ]

        by_year: dict[int, int] = defaultdict(int)
        for values in edge_data.values():
            year = values.get("first_year")
            if isinstance(year, int):
                by_year[year] += 1
        return {
            "core_collaborators": core_collaborators,
            "new_collaborators_by_year": dict(sorted(by_year.items())),
        }


def list_collaborators(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        edges = session.scalars(
            select(CollaboratorEdge)
            .where(CollaboratorEdge.user_id == user_id)
            .order_by(CollaboratorEdge.n_shared_works.desc())
        ).all()
        author_ids = [edge.collaborator_author_id for edge in edges]
        authors = session.scalars(
            select(Author).where(Author.id.in_(author_ids or [""]))
        ).all()
        author_name = {author.id: author.canonical_name for author in authors}

        collaborators = [
            {
                "author_id": edge.collaborator_author_id,
                "name": author_name.get(edge.collaborator_author_id, "Unknown"),
                "n_shared_works": edge.n_shared_works,
                "first_year": edge.first_year,
                "last_year": edge.last_year,
            }
            for edge in edges
        ]
        new_by_year: dict[int, int] = defaultdict(int)
        for item in collaborators:
            if isinstance(item["first_year"], int):
                new_by_year[item["first_year"]] += 1
        return {
            "collaborators": collaborators,
            "new_collaborators_by_year": dict(sorted(new_by_year.items())),
        }


def _metrics_snapshot_rank(row: MetricsSnapshot) -> tuple[int, int, int, datetime]:
    provider_key = str(row.provider or "").strip().lower()
    citations = max(0, int(row.citations_count or 0))
    priority = METRICS_PROVIDER_PRIORITY.get(provider_key, 0)
    has_quality_marker = int(
        row.influential_citations is not None or row.altmetric_score is not None
    )
    captured = row.captured_at or datetime(1970, 1, 1, tzinfo=timezone.utc)
    return (
        citations,
        has_quality_marker,
        priority,
        captured,
    )


def _latest_metrics_by_work(session, work_ids: list[str]) -> dict[str, MetricsSnapshot]:
    rows = session.scalars(
        select(MetricsSnapshot).where(MetricsSnapshot.work_id.in_(work_ids or [""]))
    ).all()
    best: dict[str, MetricsSnapshot] = {}
    for row in rows:
        existing = best.get(row.work_id)
        if existing is None:
            best[row.work_id] = row
            continue
        if _metrics_snapshot_rank(row) > _metrics_snapshot_rank(existing):
            best[row.work_id] = row
    return best


def _latest_metrics_by_work_at_or_before(
    session,
    *,
    work_ids: list[str],
    cutoff: datetime,
) -> dict[str, MetricsSnapshot]:
    if not work_ids:
        return {}
    rows = session.scalars(
        select(MetricsSnapshot).where(
            MetricsSnapshot.work_id.in_(work_ids),
            MetricsSnapshot.captured_at <= cutoff,
        )
    ).all()
    best: dict[str, MetricsSnapshot] = {}
    for row in rows:
        existing = best.get(row.work_id)
        if existing is None:
            best[row.work_id] = row
            continue
        if _metrics_snapshot_rank(row) > _metrics_snapshot_rank(existing):
            best[row.work_id] = row
    return best


def _sum_citations(rows: dict[str, MetricsSnapshot]) -> int:
    total = 0
    for snapshot in rows.values():
        total += int(snapshot.citations_count or 0)
    return total


def _citation_trend_summary(
    *,
    session: Session,
    work_ids: list[str],
) -> dict[str, Any]:
    if not work_ids:
        return {
            "citations_last_12_months": 0,
            "citations_previous_12_months": 0,
            "yoy_growth_percent": None,
            "yearly_growth": [],
        }
    now = _utcnow()
    latest = _latest_metrics_by_work(session, work_ids)
    latest_total = _sum_citations(latest)

    cutoff_12 = now - timedelta(days=365)
    cutoff_24 = now - timedelta(days=730)

    at_12 = _latest_metrics_by_work_at_or_before(
        session,
        work_ids=work_ids,
        cutoff=cutoff_12,
    )
    at_24 = _latest_metrics_by_work_at_or_before(
        session,
        work_ids=work_ids,
        cutoff=cutoff_24,
    )
    total_12 = _sum_citations(at_12)
    total_24 = _sum_citations(at_24)

    last_12 = max(0, latest_total - total_12)
    previous_12 = max(0, total_12 - total_24)
    yoy_growth_percent: float | None = None
    if previous_12 > 0:
        yoy_growth_percent = round(((last_12 - previous_12) / previous_12) * 100.0, 1)

    first_snapshot_at = session.scalar(
        select(func.min(MetricsSnapshot.captured_at)).where(
            MetricsSnapshot.work_id.in_(work_ids)
        )
    )
    yearly_growth: list[dict[str, Any]] = []
    if isinstance(first_snapshot_at, datetime):
        start_year = int(first_snapshot_at.astimezone(timezone.utc).year)
        end_year = int(now.astimezone(timezone.utc).year)
        for year in range(start_year, end_year + 1):
            year_end = datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
            prev_year_end = datetime(
                year - 1,
                12,
                31,
                23,
                59,
                59,
                tzinfo=timezone.utc,
            )
            at_year_end = _latest_metrics_by_work_at_or_before(
                session,
                work_ids=work_ids,
                cutoff=year_end,
            )
            at_prev_year_end = _latest_metrics_by_work_at_or_before(
                session,
                work_ids=work_ids,
                cutoff=prev_year_end,
            )
            total_year_end = _sum_citations(at_year_end)
            total_prev_year_end = _sum_citations(at_prev_year_end)
            yearly_growth.append(
                {
                    "year": year,
                    "citations_added": max(0, total_year_end - total_prev_year_end),
                    "total_citations_end_year": total_year_end,
                }
            )

    return {
        "citations_last_12_months": last_12,
        "citations_previous_12_months": previous_12,
        "yoy_growth_percent": yoy_growth_percent,
        "yearly_growth": yearly_growth,
    }


def sync_metrics(
    *,
    user_id: str,
    providers: list[str],
    work_ids: list[str] | None = None,
) -> dict[str, Any]:
    create_all_tables()
    normalized = [item.strip().lower() for item in providers if item.strip()]
    seen: set[str] = set()
    selected: list[str] = []
    for provider_name in normalized:
        if provider_name in seen:
            continue
        seen.add(provider_name)
        selected.append(provider_name)
    if not selected:
        selected = ["openalex", "semantic_scholar", "manual"]

    def _fetch_provider_metrics(
        *, provider_name: str, work_payload: dict[str, Any]
    ) -> dict[str, Any]:
        provider = get_metrics_provider(provider_name)
        try:
            return provider.fetch_metrics(work_payload)
        except Exception as exc:
            return {
                "provider": provider.provider_name,
                "citations_count": 0,
                "influential_citations": None,
                "altmetric_score": None,
                "payload_subset": {
                    "note": "Provider lookup failed.",
                    "error": str(exc),
                },
            }

    target_ids = {str(item).strip() for item in (work_ids or []) if str(item).strip()}
    work_rows: list[tuple[str, dict[str, Any]]] = []
    work_payload_by_id: dict[str, dict[str, Any]] = {}
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        work_query = select(Work).where(Work.user_id == user_id)
        if target_ids:
            work_query = work_query.where(Work.id.in_(list(target_ids)))
        works = session.scalars(work_query).all()
        work_rows = [
            (
                str(work.id),
                {
                    "title": work.title,
                    "doi": work.doi,
                    "year": work.year,
                    "work_type": work.work_type,
                    "venue_name": work.venue_name,
                    "url": work.url,
                    "pmid": _extract_pmid(work.pmid) or _extract_pmid(work.url),
                },
            )
            for work in works
        ]
        work_payload_by_id = {work_id: payload for work_id, payload in work_rows}

    metric_rows: list[dict[str, Any]] = []
    if work_rows:
        max_workers = max(
            1,
            min(
                METRICS_SYNC_MAX_WORKERS,
                len(work_rows) * max(1, len(selected)),
            ),
        )
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_index: dict[Any, tuple[str, str]] = {}
            for work_id, work_payload in work_rows:
                for provider_name in selected:
                    future = executor.submit(
                        _fetch_provider_metrics,
                        provider_name=provider_name,
                        work_payload=work_payload,
                    )
                    future_index[future] = (work_id, provider_name)

            for future in as_completed(future_index):
                work_id, provider_name = future_index[future]
                provider = get_metrics_provider(provider_name)
                try:
                    metrics = future.result()
                except Exception as exc:
                    metrics = {
                        "provider": provider.provider_name,
                        "citations_count": 0,
                        "influential_citations": None,
                        "altmetric_score": None,
                        "payload_subset": {
                            "note": "Provider lookup failed.",
                            "error": str(exc),
                        },
                    }
                metric_rows.append(
                    {
                        "work_id": work_id,
                        "provider": str(
                            metrics.get("provider", provider.provider_name)
                        ),
                        "citations_count": int(metrics.get("citations_count", 0) or 0),
                        "influential_citations": (
                            int(metrics["influential_citations"])
                            if metrics.get("influential_citations") is not None
                            else None
                        ),
                        "altmetric_score": (
                            float(metrics["altmetric_score"])
                            if metrics.get("altmetric_score") is not None
                            else None
                        ),
                        "metric_payload": dict(metrics.get("payload_subset", {}) or {}),
                    }
                )

    best_abstract_by_work: dict[str, tuple[int, str]] = {}
    best_pmid_by_work: dict[str, tuple[int, str]] = {}
    best_article_type_by_work: dict[str, tuple[int, str]] = {}
    best_journal_by_work: dict[str, tuple[int, str]] = {}
    best_journal_identity_by_work: dict[str, tuple[int, dict[str, Any]]] = {}
    for row in metric_rows:
        work_id = str(row.get("work_id", "")).strip()
        if not work_id:
            continue
        payload = dict(row.get("metric_payload") or {})
        work_payload = work_payload_by_id.get(work_id) or {}
        provider_name = str(row.get("provider", "")).strip().lower()
        priority = METRICS_PROVIDER_PRIORITY.get(provider_name, 0)
        payload_pmid, _, payload_journal = _extract_pmid_and_journal_metric(payload)
        payload_identity = _extract_journal_identity(payload)
        if payload_pmid:
            existing_pmid = best_pmid_by_work.get(work_id)
            if existing_pmid is None or priority > existing_pmid[0]:
                best_pmid_by_work[work_id] = (priority, payload_pmid)
        if payload_journal:
            existing_journal = best_journal_by_work.get(work_id)
            if existing_journal is None or priority > existing_journal[0]:
                best_journal_by_work[work_id] = (priority, payload_journal)
        if any(
            payload_identity.get(key)
            for key in ["openalex_source_id", "issn_l", "issns", "venue_type"]
        ):
            existing_identity = best_journal_identity_by_work.get(work_id)
            if existing_identity is None or priority > existing_identity[0]:
                best_journal_identity_by_work[work_id] = (priority, payload_identity)
        article_type = _infer_article_type_for_work(
            work_payload=work_payload,
            metric_payload=payload,
        )
        if article_type:
            existing_type = best_article_type_by_work.get(work_id)
            if existing_type is None or priority > existing_type[0]:
                best_article_type_by_work[work_id] = (priority, article_type)

        abstract = re.sub(r"\s+", " ", str(payload.get("abstract", "")).strip())
        if not abstract:
            continue
        existing = best_abstract_by_work.get(work_id)
        if existing is None or priority > existing[0]:
            best_abstract_by_work[work_id] = (priority, abstract)

    resolved_pmid_by_work: dict[str, str] = {}
    for work_id, work_payload in work_payload_by_id.items():
        pmid_value = _extract_pmid(work_payload.get("pmid")) or _extract_pmid(
            work_payload.get("url")
        )
        if pmid_value:
            resolved_pmid_by_work[work_id] = pmid_value
    for work_id, (_, pmid_value) in best_pmid_by_work.items():
        resolved_pmid_by_work[work_id] = pmid_value

    if resolved_pmid_by_work:
        publication_metadata_by_pmid = _fetch_pubmed_publication_metadata_batch(
            list(set(resolved_pmid_by_work.values()))
        )
        for work_id, pmid_value in resolved_pmid_by_work.items():
            metadata = publication_metadata_by_pmid.get(pmid_value, {})
            publication_types = metadata.get("publication_types", [])
            journal_name = _normalize_venue_candidate(metadata.get("journal_name"))
            if journal_name:
                best_journal_by_work[work_id] = (
                    PUBMED_ARTICLE_TYPE_PRIORITY,
                    journal_name,
                )
            if not publication_types:
                continue
            work_payload = work_payload_by_id.get(work_id) or {}
            classified = _classify_pubmed_publication_types(
                publication_types=publication_types,
                title=str(work_payload.get("title", "")).strip(),
            )
            if not classified:
                continue
            best_article_type_by_work[work_id] = (
                PUBMED_ARTICLE_TYPE_PRIORITY,
                classified,
            )

    synced = 0
    provider_counts: dict[str, int] = defaultdict(int)
    structured_abstract_refresh_ids: set[str] = set()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        works_by_id: dict[str, Work] = {}
        hydrated_work_ids = list(
            set(best_abstract_by_work.keys())
            | set(best_article_type_by_work.keys())
            | set(best_journal_by_work.keys())
            | set(best_journal_identity_by_work.keys())
            | set(resolved_pmid_by_work.keys())
            | set(work_payload_by_id.keys())
        )
        if hydrated_work_ids:
            works = session.scalars(
                select(Work).where(
                    Work.user_id == user_id,
                    Work.id.in_(hydrated_work_ids),
                )
            ).all()
            works_by_id = {str(work.id): work for work in works}
        for row in metric_rows:
            snapshot = MetricsSnapshot(
                work_id=str(row["work_id"]),
                provider=str(row["provider"]),
                citations_count=int(row["citations_count"]),
                influential_citations=row["influential_citations"],
                altmetric_score=row["altmetric_score"],
                metric_payload=dict(row["metric_payload"] or {}),
                captured_at=_utcnow(),
            )
            session.add(snapshot)
            if str(snapshot.provider or "").strip().lower() == "openalex":
                _upsert_openalex_journal_profile(
                    session, metric_payload=dict(row["metric_payload"] or {})
                )
            synced += 1
            provider_counts[snapshot.provider] += 1
        openalex_metric_payloads = [
            dict(row.get("metric_payload") or {})
            for row in metric_rows
            if str(row.get("provider") or "").strip().lower() == "openalex"
            and isinstance(row.get("metric_payload"), dict)
        ]
        if openalex_metric_payloads:
            refresh_openalex_journal_profiles(
                session,
                user_email=str(user.email or "").strip() or None,
                metric_payloads=openalex_metric_payloads,
                force=False,
            )
        for work_id, (_, abstract) in best_abstract_by_work.items():
            work = works_by_id.get(work_id)
            if work is None:
                continue
            if work.user_edited:
                continue
            if re.sub(r"\s+", " ", str(work.abstract or "").strip()):
                continue
            work.abstract = abstract
            structured_abstract_refresh_ids.add(work_id)
        for work_id, (_, article_type) in best_article_type_by_work.items():
            work = works_by_id.get(work_id)
            if work is None:
                continue
            if work.user_edited and str(work.publication_type or "").strip():
                continue
            if str(work.publication_type or "").strip() == article_type:
                continue
            work.publication_type = article_type
        for work_id, (_, journal_name) in best_journal_by_work.items():
            work = works_by_id.get(work_id)
            if work is None:
                continue
            current_venue = _normalize_venue_candidate(work.venue_name)
            has_placeholder_venue = _is_abstracts_placeholder_venue(current_venue)
            pmid_value = resolved_pmid_by_work.get(work_id)
            should_override = _should_override_repository_metadata(
                work=work,
                pmid=pmid_value,
            )
            if current_venue and not should_override and not has_placeholder_venue:
                continue
            if (
                work.user_edited
                and str(work.venue_name or "").strip()
                and not has_placeholder_venue
                and not should_override
            ):
                continue
            work.venue_name = journal_name
            current_journal = _normalize_venue_candidate(work.journal)
            if (
                not current_journal
                or should_override
                or _is_abstracts_placeholder_venue(current_journal)
            ):
                work.journal = journal_name
        for work_id, (_, journal_identity) in best_journal_identity_by_work.items():
            work = works_by_id.get(work_id)
            if work is None:
                continue
            overwrite_existing = bool(
                journal_identity.get("venue_type")
                and normalize_venue_type(work.venue_type)
                in {"repository", "dataset", "data-set"}
                and journal_identity.get("venue_type")
                != normalize_venue_type(work.venue_type)
            )
            _apply_journal_identity_to_work(
                work,
                openalex_source_id=journal_identity.get("openalex_source_id"),
                issn_l=journal_identity.get("issn_l"),
                issns=list(journal_identity.get("issns") or []),
                venue_type=journal_identity.get("venue_type"),
                overwrite_existing=overwrite_existing,
            )
        for work_id, pmid_value in resolved_pmid_by_work.items():
            work = works_by_id.get(work_id)
            if work is None:
                continue
            if _extract_pmid(work.pmid):
                continue
            work.pmid = pmid_value
        for work_id, work_payload in work_payload_by_id.items():
            work = works_by_id.get(work_id)
            if work is None:
                continue
            inferred_venue, inferred_work_type = _infer_conference_abstract_metadata(
                title=work.title,
                doi=work.doi,
                url=work.url,
            )
            current_venue = _normalize_venue_candidate(work.venue_name)
            if inferred_venue and (
                not current_venue or _is_abstracts_placeholder_venue(current_venue)
            ):
                work.venue_name = inferred_venue
                current_journal = _normalize_venue_candidate(work.journal)
                if not current_journal or _is_abstracts_placeholder_venue(
                    current_journal
                ):
                    work.journal = inferred_venue
            if (
                inferred_work_type
                and str(work.work_type or "").strip().lower() == "journal-article"
            ):
                work.work_type = inferred_work_type
        for work_id, work in works_by_id.items():
            pmid_value = resolved_pmid_by_work.get(work_id)
            if not _should_override_repository_metadata(work=work, pmid=pmid_value):
                continue
            if work.user_edited and str(work.work_type or "").strip():
                continue
            current_work_type = str(work.work_type or "").strip().lower()
            if current_work_type in {"", "other", "dataset", "data-set"}:
                work.work_type = "journal-article"
        session.flush()

    if structured_abstract_refresh_ids:
        try:
            from research_os.services.publication_console_service import (
                enqueue_publication_drilldown_warmup,
            )

            for work_id in structured_abstract_refresh_ids:
                enqueue_publication_drilldown_warmup(
                    user_id=user_id,
                    publication_id=work_id,
                    force_structured_abstract=True,
                )
        except Exception:
            pass

    collaboration = recompute_collaborator_edges(user_id=user_id)
    return {
        "synced_snapshots": synced,
        "provider_attribution": dict(provider_counts),
        "core_collaborators": collaboration["core_collaborators"],
    }


def _local_embedding(text: str, size: int = 96) -> list[float]:
    vector = [0.0] * size
    tokens = [token.lower() for token in TOKEN_PATTERN.findall(text or "")]
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        for index in range(size):
            vector[index] += digest[index % len(digest)] / 255.0
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def _embed_text(
    text: str, preferred_model: str = DEFAULT_EMBEDDING_MODEL
) -> tuple[list[float], str]:
    clean = re.sub(r"\s+", " ", text).strip()
    if not clean:
        return [], FALLBACK_EMBEDDING_MODEL
    try:
        client = get_client()
        response = client.embeddings.create(model=preferred_model, input=clean)
        vector = list(response.data[0].embedding)
        return [float(value) for value in vector], preferred_model
    except Exception:
        return _local_embedding(clean), FALLBACK_EMBEDDING_MODEL


def _work_theme_key(work: Work) -> str:
    text = f"{work.title} {work.abstract or ''} {' '.join(work.keywords or [])}"
    tokens = [token.lower() for token in TOKEN_PATTERN.findall(text)]
    filtered = [token for token in tokens if token not in STOP_WORDS]
    if not filtered:
        return "general"
    counts = Counter(filtered)
    return counts.most_common(1)[0][0]


def _label_theme_from_text(cluster_key: str, titles: list[str]) -> str:
    candidate = cluster_key.replace("-", " ").strip().title()
    if len(candidate) >= 4:
        return candidate
    if titles:
        token = TOKEN_PATTERN.findall(titles[0])
        if token:
            return token[0].title()
    return "General"


def generate_embeddings(
    *, user_id: str, model_name: str = DEFAULT_EMBEDDING_MODEL
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
        generated = 0
        actual_model = model_name
        for work in works:
            source_text = f"{work.title}\n{work.abstract or ''}".strip()
            if not source_text:
                continue
            vector, used_model = _embed_text(source_text, preferred_model=model_name)
            actual_model = used_model
            existing = session.scalars(
                select(Embedding).where(
                    Embedding.work_id == work.id,
                    Embedding.model_name == used_model,
                )
            ).first()
            if existing is None:
                existing = Embedding(
                    work_id=work.id,
                    model_name=used_model,
                    embedding_vector=vector,
                )
                session.add(existing)
            else:
                existing.embedding_vector = vector
                existing.created_at = _utcnow()
            generated += 1

        session.flush()
        clustered = _cluster_themes_in_session(session, user_id)
        return {
            "generated_embeddings": generated,
            "model_name": actual_model,
            "clusters": clustered,
        }


def _cluster_themes_in_session(session, user_id: str) -> list[dict[str, Any]]:
    works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
    grouped: dict[str, list[Work]] = defaultdict(list)
    for work in works:
        key = _work_theme_key(work)
        cluster_id = (
            f"cluster-{re.sub(r'[^a-z0-9]+', '-', key.lower()).strip('-') or 'general'}"
        )
        work.cluster_id = cluster_id
        grouped[cluster_id].append(work)

    work_ids = [work.id for work in works]
    latest = _latest_metrics_by_work(session, work_ids)
    payload: list[dict[str, Any]] = []
    for cluster_id, cluster_works in grouped.items():
        citations = [
            int(latest[work.id].citations_count)
            for work in cluster_works
            if work.id in latest
        ]
        label = _label_theme_from_text(
            cluster_id.removeprefix("cluster-"),
            [work.title for work in cluster_works],
        )
        payload.append(
            {
                "cluster_id": cluster_id,
                "label": label,
                "n_works": len(cluster_works),
                "citation_mean": round(mean(citations), 3) if citations else 0.0,
            }
        )
    payload.sort(key=lambda item: item["n_works"], reverse=True)
    return payload


def get_themes(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        clusters = _cluster_themes_in_session(session, user_id)
        return {"clusters": clusters}


def get_persona_context(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
        work_ids = [work.id for work in works]
        latest = _latest_metrics_by_work(session, work_ids)
        themes = _cluster_themes_in_session(session, user_id)
        dominant_themes = [item["label"] for item in themes[:3]]

        study_types = Counter([work.work_type for work in works if work.work_type])
        top_venues = Counter([work.venue_name for work in works if work.venue_name])
        collaborators_payload = list_collaborators(user_id=user_id)
        frequent_collaborators = [
            item["name"] for item in collaborators_payload["collaborators"][:5]
        ]

        method_markers = Counter()
        for work in works:
            text = f"{work.title} {work.abstract or ''}".lower()
            if "cox" in text:
                method_markers["Cox modelling"] += 1
            if "regression" in text:
                method_markers["Regression modelling"] += 1
            if "mixed-effects" in text or "mixed effects" in text:
                method_markers["Mixed-effects modelling"] += 1
            if "diagnostic" in text:
                method_markers["Diagnostic accuracy"] += 1
        methodological_patterns = [item[0] for item in method_markers.most_common(5)]

        supporting_works = sorted(
            works,
            key=lambda work: (
                int(latest[work.id].citations_count) if work.id in latest else 0
            ),
            reverse=True,
        )[:8]
        cited_works = [
            {
                "work_id": work.id,
                "title": work.title,
                "year": work.year,
                "doi": work.doi,
            }
            for work in supporting_works
        ]

        return {
            "dominant_themes": dominant_themes,
            "common_study_types": [item[0] for item in study_types.most_common(5)],
            "top_venues": [item[0] for item in top_venues.most_common(5)],
            "frequent_collaborators": frequent_collaborators,
            "methodological_patterns": methodological_patterns,
            "works_used": cited_works,
        }


def persona_timeline(*, user_id: str) -> list[dict[str, Any]]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
        latest = _latest_metrics_by_work(session, [work.id for work in works])
        timeline: dict[int, dict[str, Any]] = defaultdict(
            lambda: {"year": 0, "n_works": 0, "citations": 0}
        )
        for work in works:
            if not isinstance(work.year, int):
                continue
            row = timeline[work.year]
            row["year"] = work.year
            row["n_works"] += 1
            row["citations"] += (
                int(latest[work.id].citations_count) if work.id in latest else 0
            )
        return [timeline[year] for year in sorted(timeline.keys())]


def serialise_metrics_distribution(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
        latest = _latest_metrics_by_work(session, [work.id for work in works])
        rows = []
        for work in works:
            citations = int(latest[work.id].citations_count) if work.id in latest else 0
            rows.append(
                {
                    "work_id": work.id,
                    "title": work.title,
                    "year": work.year,
                    "citations": citations,
                    "provider": latest[work.id].provider
                    if work.id in latest
                    else "none",
                }
            )
        rows.sort(key=lambda item: item["citations"], reverse=True)

        histogram = {"0": 0, "1-9": 0, "10-49": 0, "50+": 0}
        for row in rows:
            value = row["citations"]
            if value == 0:
                histogram["0"] += 1
            elif value < 10:
                histogram["1-9"] += 1
            elif value < 50:
                histogram["10-49"] += 1
            else:
                histogram["50+"] += 1
        trend = _citation_trend_summary(
            session=session,
            work_ids=[work.id for work in works],
        )
        return {"works": rows, "histogram": histogram, "trend": trend}


def _persona_sync_status(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        works_last_updated = session.scalar(
            select(func.max(Work.updated_at)).where(Work.user_id == user_id)
        )
        metrics_last_captured = session.scalar(
            select(func.max(MetricsSnapshot.captured_at))
            .select_from(MetricsSnapshot)
            .join(Work, MetricsSnapshot.work_id == Work.id)
            .where(Work.user_id == user_id)
        )
        themes_last_generated = session.scalar(
            select(func.max(Embedding.created_at))
            .select_from(Embedding)
            .join(Work, Embedding.work_id == Work.id)
            .where(Work.user_id == user_id)
        )
        impact_last_computed = user.impact_last_computed_at or session.scalar(
            select(func.max(ImpactSnapshot.computed_at)).where(
                ImpactSnapshot.user_id == user_id
            )
        )
        return {
            "works_last_synced_at": user.orcid_last_synced_at or works_last_updated,
            "works_last_updated_at": works_last_updated,
            "metrics_last_synced_at": metrics_last_captured,
            "themes_last_generated_at": themes_last_generated,
            "impact_last_computed_at": impact_last_computed,
            "orcid_last_synced_at": user.orcid_last_synced_at,
        }


def dump_persona_state(*, user_id: str) -> dict[str, Any]:
    return {
        "works": list_works(user_id=user_id),
        "collaborators": list_collaborators(user_id=user_id),
        "themes": get_themes(user_id=user_id),
        "timeline": persona_timeline(user_id=user_id),
        "metrics": serialise_metrics_distribution(user_id=user_id),
        "context": get_persona_context(user_id=user_id),
        "sync_status": _persona_sync_status(user_id=user_id),
    }

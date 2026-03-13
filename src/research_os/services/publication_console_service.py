from __future__ import annotations

import base64
import html
import hashlib
from io import BytesIO
import json
import logging
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import threading
import time
import traceback
import xml.etree.ElementTree as ET
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urljoin, urlsplit

import httpx
from sqlalchemy import select
from sqlalchemy.orm import object_session

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - optional import for page anchors
    PdfReader = None

try:
    import fitz as _fitz  # PyMuPDF — optional for figure cropping
except Exception:  # pragma: no cover - optional import
    _fitz = None

from research_os.db import (
    MetricsSnapshot,
    PublicationAiCache,
    PublicationFile,
    PublicationImpactCache,
    PublicationStructuredAbstractCache,
    PublicationStructuredPaperCache,
    User,
    Work,
    create_all_tables,
    session_scope,
)
from research_os.clients.openai_client import create_response
from research_os.services.supplementary_work_service import (
    extract_parent_publication_title,
    is_supplementary_material_work,
    normalized_text_key,
    supplementary_link_url,
)

logger = logging.getLogger(__name__)

READY_STATUS = "READY"
RUNNING_STATUS = "RUNNING"
FAILED_STATUS = "FAILED"
STATUSES = {READY_STATUS, RUNNING_STATUS, FAILED_STATUS}
RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
HTTP_URL_SCHEME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
OPEN_ACCESS_FETCH_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)
DOCLING_TABLE_NOTE_PREFIX_PATTERN = re.compile(
    r"^(?:notes?|abbreviations?|footnotes?|legend|symbols?)\b|^[*†‡§¶#]+|^[a-z0-9]+[.)]\s",
    re.IGNORECASE,
)

TRAJECTORY_VALUES = {
    "EARLY_SPIKE",
    "SLOW_BURN",
    "CONSISTENT",
    "DECLINING",
    "ACCELERATING",
    "UNKNOWN",
}

FILE_SOURCE_OA_LINK = "OA_LINK"
FILE_SOURCE_SUPPLEMENTARY_LINK = "SUPPLEMENTARY_LINK"
FILE_SOURCE_USER_UPLOAD = "USER_UPLOAD"
OA_LOCAL_COPY_REQUIRED_MESSAGE = "Open-access PDF was found, but a local stored copy could not be recovered for the reader."
PAPER_MODEL_ASSET_SOURCE_PARSED = "PARSED"
FILE_TYPE_PDF = "PDF"
FILE_TYPE_DOCX = "DOCX"
FILE_TYPE_OTHER = "OTHER"
FILE_CLASSIFICATION_PUBLISHED_MANUSCRIPT = "PUBLISHED_MANUSCRIPT"
FILE_CLASSIFICATION_SUPPLEMENTARY_MATERIALS = "SUPPLEMENTARY_MATERIALS"
FILE_CLASSIFICATION_DATASETS = "DATASETS"
FILE_CLASSIFICATION_TABLE = "TABLE"
FILE_CLASSIFICATION_FIGURE = "FIGURE"
FILE_CLASSIFICATION_COVER_LETTER = "COVER_LETTER"
FILE_CLASSIFICATION_OTHER = "OTHER"
FILE_CLASSIFICATIONS = {
    FILE_CLASSIFICATION_PUBLISHED_MANUSCRIPT,
    FILE_CLASSIFICATION_SUPPLEMENTARY_MATERIALS,
    FILE_CLASSIFICATION_DATASETS,
    FILE_CLASSIFICATION_TABLE,
    FILE_CLASSIFICATION_FIGURE,
    FILE_CLASSIFICATION_COVER_LETTER,
    FILE_CLASSIFICATION_OTHER,
}
FILE_CLASSIFICATION_LABELS = {
    FILE_CLASSIFICATION_PUBLISHED_MANUSCRIPT: "Published manuscript",
    FILE_CLASSIFICATION_SUPPLEMENTARY_MATERIALS: "Supplementary materials",
    FILE_CLASSIFICATION_DATASETS: "Datasets",
    FILE_CLASSIFICATION_TABLE: "Table",
    FILE_CLASSIFICATION_FIGURE: "Figure",
    FILE_CLASSIFICATION_COVER_LETTER: "Cover letter",
    FILE_CLASSIFICATION_OTHER: "Other",
}
PUBLICATION_PAPER_EDITORIAL_SECTION_KINDS = {
    "key_summary_known",
    "key_summary_adds",
    "research_practice_policy",
    "clinical_perspective",
    "clinical_implications",
    "key_questions",
    "highlights",
    "central_illustration",
    "graphical_abstract",
    "tweetable_abstract",
    "lay_summary",
}
PUBLICATION_PAPER_METADATA_SECTION_KINDS = {
    "registration",
    "ethics",
    "data_availability",
    "funding",
    "acknowledgements",
    "author_contributions",
    "conflicts",
    "patient_involvement",
    "provenance",
}
PUBLICATION_PAPER_ASSET_SECTION_KINDS = {
    "appendix",
    "supplementary_materials",
    "figure",
    "table",
}
PUBLICATION_PAPER_REFERENCE_SECTION_KINDS = {"references"}
PUBLICATION_PAPER_OUTLINE_GROUPS = (
    ("overview", "Overview"),
    ("main_text", "Main text"),
    ("assets", "Assets"),
    ("article_information", "Article information"),
    ("references", "References"),
)
PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS = (
    "introduction",
    "methods",
    "results",
    "discussion",
    "conclusions",
)
PUBLICATION_PAPER_MAJOR_MAIN_SECTION_ORDER = {
    "introduction": 10,
    "methods": 20,
    "results": 30,
    "discussion": 40,
    "conclusions": 50,
}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
STRUCTURED_ABSTRACT_CACHE_VERSION = "publication_structured_abstract_v5"
STRUCTURED_PAPER_CACHE_VERSION = "publication_structured_paper_v24"
STRUCTURED_PAPER_STATUS_STRUCTURE_ONLY = "STRUCTURE_ONLY"
STRUCTURED_PAPER_STATUS_PDF_ATTACHED = "PDF_ATTACHED"
STRUCTURED_PAPER_STATUS_PARSING = "PARSING"
STRUCTURED_PAPER_STATUS_FULL_TEXT_READY = "FULL_TEXT_READY"
STRUCTURED_PAPER_STATUS_FAILED = "FAILED"
STRUCTURED_PAPER_SECTION_SOURCE_GROBID = "grobid"
STRUCTURED_PAPER_SECTION_SOURCE_PMC_BIOC = "pmc_bioc"
STRUCTURED_PAPER_PARSER_PROVIDER_GROBID = "GROBID"
STRUCTURED_PAPER_PARSER_PROVIDER_PMC_BIOC = "PMC_BIOC"
STRUCTURED_PAPER_ASSET_ENRICHMENT_STATUS_PENDING = "PENDING"
STRUCTURED_PAPER_ASSET_ENRICHMENT_STATUS_COMPLETE = "COMPLETE"
STRUCTURED_PAPER_ASSET_ENRICHMENT_STATUS_EMPTY = "EMPTY"
STRUCTURED_PAPER_ASSET_ENRICHMENT_STATUS_FAILED = "FAILED"
GROBID_AVAILABILITY_CACHE_TTL_SECONDS = 60
STRUCTURED_PAPER_FULL_TEXT_SECTION_SOURCES = {
    STRUCTURED_PAPER_SECTION_SOURCE_GROBID,
    STRUCTURED_PAPER_SECTION_SOURCE_PMC_BIOC,
}

_executor_lock = threading.Lock()
_executors: dict[str, ThreadPoolExecutor] = {}
_inflight_lock = threading.Lock()
_inflight_jobs: set[tuple[str, str, str]] = set()
_grobid_availability_checked_at: float | None = None
_grobid_availability_value = False


class PublicationConsoleValidationError(RuntimeError):
    pass


class PublicationConsoleNotFoundError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime | None) -> datetime:
    if not isinstance(value, datetime):
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _coerce_utc_or_none(value: datetime | None) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    return _coerce_utc(value)


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        try:
            return int(value.strip())
        except Exception:
            return None
    return None


def _safe_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return None
    return None


def _normalize_status(value: str | None, *, fallback: str = READY_STATUS) -> str:
    clean = str(value or "").strip().upper()
    if clean in STATUSES:
        return clean
    return fallback


def _normalize_trajectory(value: str | None) -> str:
    clean = str(value or "").strip().upper()
    if clean in TRAJECTORY_VALUES:
        return clean
    return "UNKNOWN"


def _impact_ttl_seconds() -> int:
    value = _safe_int(os.getenv("PUB_IMPACT_TTL_SECONDS", "86400"))
    return max(300, value if value is not None else 86400)


def _ai_ttl_seconds() -> int:
    value = _safe_int(os.getenv("PUB_AI_TTL_SECONDS", "86400"))
    return max(300, value if value is not None else 86400)


def _authors_ttl_seconds() -> int:
    value = _safe_int(os.getenv("PUB_AUTHORS_TTL_SECONDS", "604800"))
    return max(3600, value if value is not None else 604800)


def _structured_abstract_model() -> str:
    return (
        str(os.getenv("PUB_STRUCTURED_ABSTRACT_MODEL", "gpt-4.1-mini")).strip()
        or "gpt-4.1-mini"
    )


def _structured_abstract_fallback_model() -> str:
    return str(os.getenv("PUB_STRUCTURED_ABSTRACT_FALLBACK_MODEL", "gpt-4.1")).strip()


def _structured_abstract_llm_enabled() -> bool:
    enabled = str(
        os.getenv("PUB_STRUCTURED_ABSTRACT_USE_LLM", "true")
    ).strip().lower() in {"1", "true", "yes", "on"}
    if not enabled:
        return False
    return bool(str(os.getenv("OPENAI_API_KEY", "")).strip())


def _structured_abstract_llm_min_length_ratio() -> float:
    value = _safe_float(
        os.getenv("PUB_STRUCTURED_ABSTRACT_LLM_MIN_LENGTH_RATIO", "0.55")
    )
    return max(0.25, min(0.95, value if value is not None else 0.55))


def _structured_abstract_llm_min_marker_recall() -> float:
    value = _safe_float(
        os.getenv("PUB_STRUCTURED_ABSTRACT_LLM_MIN_MARKER_RECALL", "0.7")
    )
    return max(0.0, min(1.0, value if value is not None else 0.7))


def _openalex_timeout_seconds() -> float:
    value = _safe_float(os.getenv("PUB_CONSOLE_OPENALEX_TIMEOUT_SECONDS", "12"))
    return max(5.0, value if value is not None else 12.0)


def _openalex_retry_count() -> int:
    value = _safe_int(os.getenv("PUB_CONSOLE_OPENALEX_RETRY_COUNT", "2"))
    return max(0, min(6, value if value is not None else 2))


def _pubmed_timeout_seconds() -> float:
    value = _safe_float(os.getenv("PUB_CONSOLE_PUBMED_TIMEOUT_SECONDS", "12"))
    return max(5.0, value if value is not None else 12.0)


def _pubmed_retry_count() -> int:
    value = _safe_int(os.getenv("PUB_CONSOLE_PUBMED_RETRY_COUNT", "2"))
    return max(0, min(6, value if value is not None else 2))


def _crossref_timeout_seconds() -> float:
    value = _safe_float(os.getenv("PUB_CONSOLE_CROSSREF_TIMEOUT_SECONDS", "12"))
    return max(5.0, value if value is not None else 12.0)


def _crossref_retry_count() -> int:
    value = _safe_int(os.getenv("PUB_CONSOLE_CROSSREF_RETRY_COUNT", "2"))
    return max(0, min(6, value if value is not None else 2))


def _unpaywall_timeout_seconds() -> float:
    value = _safe_float(os.getenv("PUB_CONSOLE_UNPAYWALL_TIMEOUT_SECONDS", "12"))
    return max(5.0, value if value is not None else 12.0)


def _unpaywall_retry_count() -> int:
    value = _safe_int(os.getenv("PUB_CONSOLE_UNPAYWALL_RETRY_COUNT", "2"))
    return max(0, min(6, value if value is not None else 2))


def _grobid_base_url() -> str:
    hostport = _normalize_http_base_url(os.getenv("PUB_GROBID_HOSTPORT", ""))
    if hostport:
        return hostport
    return _normalize_http_base_url(
        os.getenv("PUB_GROBID_BASE_URL", "http://127.0.0.1:8070")
    )


def _normalize_http_base_url(raw: object) -> str:
    clean = str(raw or "").strip()
    if not clean:
        return ""
    if not HTTP_URL_SCHEME_PATTERN.match(clean):
        clean = f"http://{clean}"
    return clean.rstrip("/")


def _grobid_timeout_seconds() -> float:
    value = _safe_float(os.getenv("PUB_GROBID_TIMEOUT_SECONDS", "90"))
    return max(15.0, value if value is not None else 90.0)


def _grobid_retry_count() -> int:
    value = _safe_int(os.getenv("PUB_GROBID_RETRY_COUNT", "1"))
    return max(0, min(4, value if value is not None else 1))


def _grobid_availability_cache_ttl_seconds() -> int:
    raw_value = str(
        os.getenv(
            "PUB_GROBID_AVAILABILITY_CACHE_TTL_SECONDS",
            str(GROBID_AVAILABILITY_CACHE_TTL_SECONDS),
        )
    ).strip()
    try:
        return max(0, int(raw_value))
    except ValueError:
        return GROBID_AVAILABILITY_CACHE_TTL_SECONDS


def _probe_grobid_availability() -> bool:
    base_url = _grobid_base_url()
    if not base_url:
        return False
    endpoint = f"{base_url}/api/isalive"
    timeout_seconds = min(3.0, max(1.0, _grobid_timeout_seconds()))
    try:
        with httpx.Client(
            timeout=httpx.Timeout(timeout_seconds), follow_redirects=True
        ) as client:
            response = client.get(endpoint)
    except Exception:
        return False
    return response.status_code < 400


def grobid_available(*, force_refresh: bool = False) -> bool:
    global _grobid_availability_checked_at
    global _grobid_availability_value

    ttl_seconds = _grobid_availability_cache_ttl_seconds()
    now = time.monotonic()
    if (
        not force_refresh
        and ttl_seconds > 0
        and _grobid_availability_checked_at is not None
        and (now - _grobid_availability_checked_at) < ttl_seconds
    ):
        return _grobid_availability_value

    available = _probe_grobid_availability()
    _grobid_availability_checked_at = now
    _grobid_availability_value = available
    return available


def _openalex_citing_pages() -> int:
    value = _safe_int(os.getenv("PUB_CONSOLE_OPENALEX_CITING_MAX_PAGES", "2"))
    return max(1, min(5, value if value is not None else 2))


def _max_workers() -> int:
    value = _safe_int(os.getenv("PUB_ANALYTICS_MAX_CONCURRENT_JOBS", "2"))
    return max(1, value if value is not None else 2)


def _structured_paper_max_workers() -> int:
    value = _safe_int(os.getenv("PUB_STRUCTURED_PAPER_MAX_CONCURRENT_JOBS", "4"))
    return max(1, min(8, value if value is not None else 4))


def _structured_paper_running_timeout_seconds() -> int:
    value = _safe_int(os.getenv("PUB_STRUCTURED_PAPER_RUNNING_TIMEOUT_SECONDS", "180"))
    return max(30, value if value is not None else 180)


def _structured_paper_asset_enrichment_retry_seconds() -> int:
    value = _safe_int(
        os.getenv("PUB_STRUCTURED_PAPER_ASSET_ENRICHMENT_RETRY_SECONDS", "1800")
    )
    return max(60, value if value is not None else 1800)


def _structured_paper_asset_enrichment_failure_retry_seconds() -> int:
    value = _safe_int(
        os.getenv(
            "PUB_STRUCTURED_PAPER_ASSET_ENRICHMENT_FAILURE_RETRY_SECONDS",
            "300",
        )
    )
    return max(60, value if value is not None else 300)


def _is_stale(
    *, computed_at: datetime | None, ttl_seconds: int, now: datetime | None = None
) -> bool:
    if computed_at is None:
        return True
    reference = _coerce_utc(now or _utcnow())
    return (reference - _coerce_utc(computed_at)).total_seconds() > ttl_seconds


def _parse_iso_datetime(value: Any) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return _coerce_utc(parsed)


def _request_json_with_retry(
    *,
    url: str,
    params: dict[str, Any] | None = None,
    timeout_seconds: float,
    retries: int,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    timeout = httpx.Timeout(timeout_seconds)
    with httpx.Client(
        timeout=timeout, follow_redirects=True, headers=headers or {}
    ) as client:
        for attempt in range(retries + 1):
            try:
                response = client.get(url, params=params)
            except Exception:
                if attempt < retries:
                    time.sleep(0.35 * (attempt + 1))
                    continue
                return {}
            if response.status_code < 400:
                payload = response.json()
                return payload if isinstance(payload, dict) else {}
            if response.status_code not in RETRYABLE_STATUS_CODES or attempt >= retries:
                return {}
            time.sleep(0.35 * (attempt + 1))
    return {}


def _request_text_with_retry(
    *,
    url: str,
    params: dict[str, Any] | None = None,
    timeout_seconds: float,
    retries: int,
    headers: dict[str, str] | None = None,
) -> str:
    timeout = httpx.Timeout(timeout_seconds)
    with httpx.Client(
        timeout=timeout, follow_redirects=True, headers=headers or {}
    ) as client:
        for attempt in range(retries + 1):
            try:
                response = client.get(url, params=params)
            except Exception:
                if attempt < retries:
                    time.sleep(0.35 * (attempt + 1))
                    continue
                return ""
            if response.status_code < 400:
                return str(response.text or "")
            if response.status_code not in RETRYABLE_STATUS_CODES or attempt >= retries:
                return ""
            time.sleep(0.35 * (attempt + 1))
    return ""


def _request_bytes_with_retry(
    *,
    url: str,
    params: dict[str, Any] | None = None,
    timeout_seconds: float,
    retries: int,
    headers: dict[str, str] | None = None,
) -> tuple[bytes, str | None]:
    timeout = httpx.Timeout(timeout_seconds)
    with httpx.Client(
        timeout=timeout, follow_redirects=True, headers=headers or {}
    ) as client:
        for attempt in range(retries + 1):
            try:
                response = client.get(url, params=params)
            except Exception:
                if attempt < retries:
                    time.sleep(0.35 * (attempt + 1))
                    continue
                return b"", None
            if response.status_code < 400:
                content_type = (
                    str(response.headers.get("content-type") or "").strip() or None
                )
                return bytes(response.content or b""), content_type
            if response.status_code not in RETRYABLE_STATUS_CODES or attempt >= retries:
                return b"", None
            time.sleep(0.35 * (attempt + 1))
    return b"", None


def _request_bytes_with_final_url_retry(
    *,
    url: str,
    params: dict[str, Any] | None = None,
    timeout_seconds: float,
    retries: int,
    headers: dict[str, str] | None = None,
) -> tuple[bytes, str | None, str | None]:
    timeout = httpx.Timeout(timeout_seconds)
    with httpx.Client(
        timeout=timeout, follow_redirects=True, headers=headers or {}
    ) as client:
        for attempt in range(retries + 1):
            try:
                response = client.get(url, params=params)
            except Exception:
                if attempt < retries:
                    time.sleep(0.35 * (attempt + 1))
                    continue
                return b"", None, None
            if response.status_code < 400:
                content_type = (
                    str(response.headers.get("content-type") or "").strip() or None
                )
                final_url = str(response.url or "").strip() or None
                return bytes(response.content or b""), content_type, final_url
            if response.status_code not in RETRYABLE_STATUS_CODES or attempt >= retries:
                return b"", None, None
            time.sleep(0.35 * (attempt + 1))
    return b"", None, None


def _openalex_mailto(*, user_email: str | None = None) -> str | None:
    explicit = str(os.getenv("OPENALEX_MAILTO", "")).strip()
    if explicit and "@" in explicit:
        return explicit
    if user_email and "@" in user_email:
        return user_email
    bootstrap = str(os.getenv("AAWE_BOOTSTRAP_EMAIL", "")).strip()
    if bootstrap and "@" in bootstrap:
        return bootstrap
    return None


def _unpaywall_email(*, user_email: str | None = None) -> str | None:
    explicit = str(os.getenv("UNPAYWALL_EMAIL", "")).strip()
    if explicit and "@" in explicit:
        return explicit
    fallback = _openalex_mailto(user_email=user_email)
    if fallback and "@" in fallback:
        return fallback
    return None


def _openalex_pdf_api_key() -> str | None:
    value = str(os.getenv("OPENALEX_API_KEY", "")).strip()
    return value or None


def _normalize_openalex_work_id(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if clean.startswith("https://openalex.org/"):
        clean = clean.removeprefix("https://openalex.org/")
    elif clean.startswith("http://openalex.org/"):
        clean = clean.removeprefix("http://openalex.org/")
    clean = clean.strip()
    return clean if re.fullmatch(r"W\d+", clean) else None


def _openalex_work_has_pdf_content(payload: dict[str, Any]) -> bool:
    has_content = payload.get("has_content")
    if isinstance(has_content, dict) and bool(has_content.get("pdf")):
        return True
    content_urls = payload.get("content_urls")
    if isinstance(content_urls, dict):
        return any(str(value or "").strip() for value in content_urls.values())
    if isinstance(content_urls, list):
        return any(str(value or "").strip() for value in content_urls)
    if isinstance(content_urls, str):
        return bool(content_urls.strip())
    return False


def _resolve_openalex_content_url(*, work: Work, user_email: str | None) -> str | None:
    openalex_work_id = _normalize_openalex_work_id(work.openalex_work_id)
    mailto = _openalex_mailto(user_email=user_email)
    if openalex_work_id:
        params: dict[str, Any] = {}
        if mailto:
            params["mailto"] = mailto
        payload = _request_json_with_retry(
            url=f"https://api.openalex.org/works/{quote(openalex_work_id, safe='')}",
            params=params,
            timeout_seconds=_unpaywall_timeout_seconds(),
            retries=max(1, _unpaywall_retry_count()),
            headers={"User-Agent": OPEN_ACCESS_FETCH_USER_AGENT},
        )
        if payload and _openalex_work_has_pdf_content(payload):
            resolved_work_id = _normalize_openalex_work_id(payload.get("id"))
            if resolved_work_id:
                return f"https://content.openalex.org/works/{resolved_work_id}"

    doi = _normalize_doi(work.doi)
    if not doi:
        return None
    params = {
        "filter": f"doi:{doi}",
        "select": "id,has_content,content_urls",
        "per-page": "1",
    }
    if mailto:
        params["mailto"] = mailto
    payload = _request_json_with_retry(
        url="https://api.openalex.org/works",
        params=params,
        timeout_seconds=_unpaywall_timeout_seconds(),
        retries=max(1, _unpaywall_retry_count()),
        headers={"User-Agent": OPEN_ACCESS_FETCH_USER_AGENT},
    )
    results = payload.get("results")
    if isinstance(results, list) and results:
        first = results[0]
        if isinstance(first, dict) and _openalex_work_has_pdf_content(first):
            resolved_work_id = _normalize_openalex_work_id(first.get("id"))
            if resolved_work_id:
                return f"https://content.openalex.org/works/{resolved_work_id}"
    return None


def _fetch_openalex_pdf_bytes(
    *, work: Work, user_email: str | None
) -> tuple[bytes, str | None, str | None]:
    api_key = _openalex_pdf_api_key()
    if not api_key:
        return b"", None, None
    content_url = _resolve_openalex_content_url(work=work, user_email=user_email)
    if not content_url:
        return b"", None, None
    pdf_url = (
        content_url if content_url.lower().endswith(".pdf") else f"{content_url}.pdf"
    )
    content, content_type, final_url = _request_bytes_with_final_url_retry(
        url=pdf_url,
        params={"api_key": api_key},
        timeout_seconds=_unpaywall_timeout_seconds(),
        retries=max(1, _unpaywall_retry_count()),
        headers={"User-Agent": OPEN_ACCESS_FETCH_USER_AGENT},
    )
    if not _looks_like_pdf_payload(content, content_type):
        return b"", None, None
    return content, content_type or "application/pdf", final_url or pdf_url


def _normalize_orcid_id(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    if clean.startswith("https://orcid.org/"):
        clean = clean.removeprefix("https://orcid.org/")
    if clean.startswith("http://orcid.org/"):
        clean = clean.removeprefix("http://orcid.org/")
    clean = clean.strip().strip("/")
    return clean or None


def _normalize_doi(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    if clean.lower().startswith("https://doi.org/"):
        clean = clean[16:]
    return clean.strip().strip("/") or None


def _normalize_pmid(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    if clean.isdigit():
        return clean
    match = re.search(r"(\d{5,})", clean)
    if match:
        return match.group(1)
    return None


_SURNAME_PARTICLES = {
    "da",
    "de",
    "del",
    "della",
    "der",
    "di",
    "du",
    "la",
    "le",
    "st",
    "st.",
    "van",
    "von",
}


def _extract_author_surname(author_value: Any) -> str | None:
    explicit_surname = ""
    display_name = ""
    if isinstance(author_value, dict):
        explicit_surname = str(
            author_value.get("surname")
            or author_value.get("family_name")
            or author_value.get("family")
            or author_value.get("last_name")
            or ""
        ).strip()
        display_name = str(
            author_value.get("name")
            or author_value.get("display_name")
            or author_value.get("canonical_name")
            or ""
        ).strip()
    else:
        display_name = str(author_value or "").strip()

    candidate = explicit_surname or display_name
    candidate = re.sub(r"\s+", " ", candidate).strip(" ,;")
    if not candidate:
        return None

    if "," in candidate:
        surname = candidate.split(",", 1)[0].strip()
        return surname or None

    tokens = [token for token in candidate.split(" ") if token]
    if not tokens:
        return None
    if len(tokens) == 1:
        return tokens[0]

    surname_tokens = [tokens[-1]]
    index = len(tokens) - 2
    while index >= 0 and tokens[index].strip(".'").casefold() in _SURNAME_PARTICLES:
        surname_tokens.insert(0, tokens[index])
        index -= 1
    return " ".join(surname_tokens).strip() or None


def _resolve_first_author_surname(work: Work) -> str | None:
    authorships = list(getattr(work, "authorships", []) or [])
    if authorships:
        ordered_authorships = sorted(
            authorships,
            key=lambda item: (
                int(getattr(item, "author_order", 10**6) or 10**6),
                str(getattr(getattr(item, "author", None), "canonical_name", "") or ""),
            ),
        )
        for authorship in ordered_authorships:
            author = getattr(authorship, "author", None)
            surname = _extract_author_surname(
                {"canonical_name": str(getattr(author, "canonical_name", "") or "")}
            )
            if surname:
                return surname

    authors_json = work.authors_json if isinstance(work.authors_json, list) else []
    for author in authors_json:
        surname = _extract_author_surname(author)
        if surname:
            return surname
    return None


def _resolve_publication_file_display_name(work: Work) -> str:
    surname = _resolve_first_author_surname(work) or "Publication"
    year_value = (
        work.year if isinstance(work.year, int) and 1000 <= work.year <= 9999 else None
    )
    year_label = str(year_value) if year_value is not None else "n.d."
    pmid = _normalize_pmid(work.pmid) or _extract_pmid_from_text(work.url)
    display_name = f"{surname} ({year_label})"
    if pmid:
        display_name = f"{display_name} - PMID {pmid}"
    return _slugify_filename(display_name)


def _infer_storage_suffix(
    *, filename: str, content_type: str | None = None, file_type: str | None = None
) -> str:
    clean_name = _slugify_filename(filename)
    suffix = Path(clean_name).suffix.strip().lower()
    if suffix and re.fullmatch(r"\.[a-z0-9]{1,16}", suffix):
        return suffix

    inferred_type = str(
        file_type or _infer_file_type(filename=clean_name, content_type=content_type)
    ).upper()
    if inferred_type == FILE_TYPE_PDF:
        return ".pdf"
    if inferred_type == FILE_TYPE_DOCX:
        return ".docx"
    return ".bin"


def _extract_pmid_from_text(value: str) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    patterns = [
        re.compile(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d+)", re.IGNORECASE),
        re.compile(r"pmid[:\s]+(\d+)", re.IGNORECASE),
    ]
    for pattern in patterns:
        match = pattern.search(clean)
        if match:
            return match.group(1)
    return None


def _search_pubmed_ids(term: str, *, max_results: int = 5) -> list[str]:
    clean_term = _normalize_abstract_text(term)
    if not clean_term:
        return []
    xml_text = _request_text_with_retry(
        url="https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
        params={
            "db": "pubmed",
            "retmode": "xml",
            "retmax": str(max(1, min(25, int(max_results)))),
            "term": clean_term,
        },
        timeout_seconds=_pubmed_timeout_seconds(),
        retries=_pubmed_retry_count(),
    )
    if not xml_text.strip():
        return []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return []
    ids: list[str] = []
    for node in root.findall(".//IdList/Id"):
        candidate = _normalize_pmid(str(node.text or ""))
        if candidate and candidate not in ids:
            ids.append(candidate)
    return ids


def _resolve_pubmed_pmid(
    *,
    pmid: str | None,
    doi: str | None,
    title: str | None,
    year: int | None,
) -> str | None:
    normalized_pmid = _normalize_pmid(pmid)
    if normalized_pmid:
        return normalized_pmid

    normalized_doi = _normalize_doi(doi)
    if normalized_doi:
        by_doi = _search_pubmed_ids(f'"{normalized_doi}"[AID]', max_results=3)
        if by_doi:
            return by_doi[0]

    clean_title = _normalize_abstract_text(title)
    if len(clean_title) < 12:
        return None
    safe_title = re.sub(r"[\[\]\"]+", " ", clean_title).strip()
    if not safe_title:
        return None
    if isinstance(year, int) and 1800 <= year <= 2100:
        term = f'"{safe_title}"[Title] AND ({year}[DP] OR {year}[PDAT])'
    else:
        term = f'"{safe_title}"[Title]'
    by_title = _search_pubmed_ids(term, max_results=1)
    if by_title:
        return by_title[0]
    return None


def _fetch_pubmed_article_xml_root(pmid: str) -> ET.Element | None:
    normalized_pmid = _normalize_pmid(pmid)
    if not normalized_pmid:
        return None
    xml_text = _request_text_with_retry(
        url="https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
        params={"db": "pubmed", "id": normalized_pmid, "retmode": "xml"},
        timeout_seconds=_pubmed_timeout_seconds(),
        retries=_pubmed_retry_count(),
    )
    if not xml_text.strip():
        return None
    try:
        return ET.fromstring(xml_text)
    except Exception:
        return None


def _resolve_pmcid(
    *,
    pmid: str | None,
    doi: str | None,
    title: str | None,
    year: int | None,
) -> str | None:
    resolved_pmid = _resolve_pubmed_pmid(
        pmid=pmid,
        doi=doi,
        title=title,
        year=year,
    )
    if not resolved_pmid:
        return None
    root = _fetch_pubmed_article_xml_root(resolved_pmid)
    if root is None:
        return None
    for node in root.findall(".//PubmedData/ArticleIdList/ArticleId"):
        if str(node.attrib.get("IdType") or "").strip().lower() != "pmc":
            continue
        clean = str(node.text or "").strip().upper()
        if clean.startswith("PMC"):
            return clean
    return None


def _extract_openalex_work_id(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    if clean.startswith("https://openalex.org/"):
        clean = clean.removeprefix("https://openalex.org/")
    clean = clean.strip().strip("/")
    if re.fullmatch(r"W\d+", clean):
        return clean
    return None


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise PublicationConsoleNotFoundError(f"User '{user_id}' was not found.")
    return user


def _resolve_work_or_raise(
    session, *, user_id: str, publication_id: str, for_update: bool = False
) -> Work:
    query = select(Work).where(
        Work.id == publication_id,
        Work.user_id == user_id,
    )
    if for_update:
        query = query.with_for_update()
    work = session.scalars(query).first()
    if work is None:
        raise PublicationConsoleNotFoundError(
            f"Publication '{publication_id}' was not found."
        )
    return work


def _provider_priority(value: str) -> int:
    clean = str(value or "").strip().lower()
    if clean == "openalex":
        return 30
    if clean in {"semantic_scholar", "semanticscholar"}:
        return 20
    if clean == "manual":
        return 10
    return 0


def _latest_metric_for_work(session, *, work_id: str) -> MetricsSnapshot | None:
    rows = session.scalars(
        select(MetricsSnapshot).where(MetricsSnapshot.work_id == work_id)
    ).all()
    if not rows:
        return None

    def _rank(item: MetricsSnapshot) -> tuple[int, datetime]:
        return (_provider_priority(item.provider), _coerce_utc(item.captured_at))

    return max(rows, key=_rank)


def _latest_metric_for_work_at_or_before(
    session, *, work_id: str, cutoff: datetime
) -> MetricsSnapshot | None:
    rows = session.scalars(
        select(MetricsSnapshot).where(
            MetricsSnapshot.work_id == work_id,
            MetricsSnapshot.captured_at <= _coerce_utc(cutoff),
        )
    ).all()
    if not rows:
        return None

    def _rank(item: MetricsSnapshot) -> tuple[int, datetime]:
        return (_provider_priority(item.provider), _coerce_utc(item.captured_at))

    return max(rows, key=_rank)


def _extract_counts_by_year(
    snapshot: MetricsSnapshot | None, *, now_year: int
) -> dict[int, int]:
    if snapshot is None:
        return {}
    payload = (
        snapshot.metric_payload if isinstance(snapshot.metric_payload, dict) else {}
    )
    raw = payload.get("counts_by_year")
    if not isinstance(raw, list):
        return {}
    counts: dict[int, int] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        year = _safe_int(item.get("year"))
        value = _safe_int(item.get("cited_by_count"))
        if value is None:
            value = _safe_int(item.get("citation_count"))
        if value is None:
            value = _safe_int(item.get("citations"))
        if year is None or value is None or year < 1900 or year > now_year:
            continue
        counts[year] = max(0, value)
    return counts


def _estimate_window_citations(
    yearly_counts: dict[int, int], *, start: datetime, end: datetime, now: datetime
) -> int:
    if not yearly_counts:
        return 0
    start_utc = _coerce_utc(start)
    end_utc = _coerce_utc(end)
    now_utc = _coerce_utc(now)
    if end_utc <= start_utc:
        return 0
    estimated = 0.0
    for year, count in yearly_counts.items():
        citations = max(0, int(count or 0))
        if citations <= 0:
            continue
        segment_start = datetime(year, 1, 1, tzinfo=timezone.utc)
        segment_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        if year == now_utc.year:
            segment_end = min(segment_end, now_utc)
        if segment_end <= segment_start:
            continue
        overlap_start = max(start_utc, segment_start)
        overlap_end = min(end_utc, segment_end)
        if overlap_end <= overlap_start:
            continue
        overlap_seconds = (overlap_end - overlap_start).total_seconds()
        segment_seconds = (segment_end - segment_start).total_seconds()
        estimated += citations * max(0.0, min(1.0, overlap_seconds / segment_seconds))
    return max(0, int(round(estimated)))


def _per_year_with_yoy(yearly_counts: dict[int, int]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    previous: int | None = None
    for year in sorted(yearly_counts):
        citations = max(0, int(yearly_counts[year] or 0))
        yoy_delta: int | None = None
        yoy_pct: float | None = None
        if previous is not None:
            yoy_delta = citations - previous
            if previous > 0:
                yoy_pct = round((yoy_delta / previous) * 100.0, 1)
        rows.append(
            {
                "year": int(year),
                "citations": citations,
                "yoy_delta": yoy_delta,
                "yoy_pct": yoy_pct,
            }
        )
        previous = citations
    return rows


def _infer_file_type(*, filename: str, content_type: str | None = None) -> str:
    name = filename.lower().strip()
    ctype = str(content_type or "").lower()
    if name.endswith(".pdf") or "application/pdf" in ctype:
        return FILE_TYPE_PDF
    if (
        name.endswith(".docx")
        or "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        in ctype
    ):
        return FILE_TYPE_DOCX
    return FILE_TYPE_OTHER


def _slugify_filename(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "publication-file"

    # Keep only the basename in case a client submits a full path.
    clean = raw.replace("\\", "/").split("/")[-1]
    clean = clean.replace("\x00", "").replace("\r", " ").replace("\n", " ")
    clean = re.sub(r"\s+", " ", clean).strip()
    clean = clean.strip()
    if not clean or clean in {".", ".."}:
        return "publication-file"

    max_len = 240
    if len(clean) > max_len:
        suffix = Path(clean).suffix
        if suffix and len(suffix) < max_len:
            stem_len = max_len - len(suffix)
            clean = f"{clean[:stem_len]}{suffix}"
        else:
            clean = clean[:max_len]
    return clean


def _coerce_download_filename(
    *, file_name: str | None, path: Path | None = None
) -> str:
    clean = str(file_name or "").strip().replace("\r", " ").replace("\n", " ")
    if not clean:
        clean = "file.bin"
    clean = clean.replace("\\", "/").split("/")[-1].strip(" .")
    if not clean or clean in {".", ".."}:
        clean = "file.bin"
    if not Path(clean).suffix and isinstance(path, Path):
        inferred_suffix = path.suffix.strip()
        if inferred_suffix:
            clean = f"{clean}{inferred_suffix}"
    return clean


def _file_storage_root() -> Path:
    root = Path(os.getenv("PUBLICATION_FILES_ROOT", "./publication_files_store"))
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def _storage_key_from_path(path: Path) -> str:
    resolved_path = path.resolve()
    root = _file_storage_root()
    try:
        return str(resolved_path.relative_to(root))
    except ValueError:
        return str(resolved_path)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _open_access_browser_fetch_enabled() -> bool:
    value = str(os.getenv("PUBLICATION_OA_BROWSER_FETCH", "1")).strip().lower()
    return value not in {"0", "false", "no", "off"}


def _open_access_browser_fetch_script_path() -> Path | None:
    configured = str(os.getenv("PUBLICATION_OA_BROWSER_FETCH_SCRIPT", "")).strip()
    candidates: list[Path] = []
    if configured:
        candidates.append(Path(configured))
    candidates.extend(
        [
            _repo_root() / "scripts" / "oa-browser-fetch" / "fetch-pdf-via-browser.mjs",
            _repo_root() / "frontend" / "scripts" / "fetch-pdf-via-browser.mjs",
        ]
    )
    for script in candidates:
        if script.exists() and script.is_file():
            return script
    return None


def _looks_like_pdf_payload(content: bytes, content_type: str | None = None) -> bool:
    if not content:
        return False
    if content.lstrip().startswith(b"%PDF"):
        return True
    return "application/pdf" in str(content_type or "").strip().lower()


def _looks_like_html_payload(content: bytes, content_type: str | None = None) -> bool:
    if not content:
        return False
    clean_content_type = str(content_type or "").strip().lower()
    if "text/html" in clean_content_type or "application/xhtml+xml" in clean_content_type:
        return True
    prefix = content.lstrip()[:256].lower()
    return prefix.startswith(b"<!doctype html") or prefix.startswith(b"<html")


def _normalize_open_access_html_candidate(
    raw_value: str | None, *, base_url: str
) -> str | None:
    candidate = html.unescape(str(raw_value or "").strip())
    if not candidate:
        return None
    absolute = urljoin(base_url, candidate)
    parsed = urlsplit(absolute)
    if parsed.scheme.lower() not in {"http", "https"}:
        return None
    return absolute.strip() or None


def _extract_open_access_pdf_urls_from_html(
    html_text: str, *, base_url: str
) -> list[str]:
    clean_html = str(html_text or "").strip()
    clean_base_url = str(base_url or "").strip()
    if not clean_html or not clean_base_url:
        return []

    patterns = (
        re.compile(
            r"""<meta[^>]+(?:name|property)\s*=\s*(["'])citation_pdf_url\1[^>]+content\s*=\s*(["'])(.*?)\2""",
            re.IGNORECASE | re.DOTALL,
        ),
        re.compile(
            r"""<link[^>]+type\s*=\s*(["'])application/pdf\1[^>]+href\s*=\s*(["'])(.*?)\2""",
            re.IGNORECASE | re.DOTALL,
        ),
        re.compile(
            r"""<(?:a|iframe|embed|object)[^>]+(?:href|src|data)\s*=\s*(["'])(.*?)\1""",
            re.IGNORECASE | re.DOTALL,
        ),
    )
    candidates: list[str] = []
    seen: set[str] = set()
    for pattern in patterns:
        for raw_match in pattern.findall(clean_html):
            candidate_raw = raw_match[-1] if isinstance(raw_match, tuple) else raw_match
            absolute = _normalize_open_access_html_candidate(
                candidate_raw,
                base_url=clean_base_url,
            )
            if not absolute:
                continue
            normalized = absolute.strip()
            normalized_lower = normalized.lower()
            if (
                ".pdf" not in normalized_lower
                and "pdf" not in normalized_lower
                and "download" not in normalized_lower
            ):
                continue
            if normalized in seen:
                continue
            seen.add(normalized)
            candidates.append(normalized)
    return candidates


def _extract_open_access_follow_urls_from_html(
    html_text: str, *, base_url: str
) -> list[str]:
    clean_html = str(html_text or "").strip()
    clean_base_url = str(base_url or "").strip()
    if not clean_html or not clean_base_url:
        return []

    base_host = urlsplit(clean_base_url).netloc.lower()
    candidates: list[str] = []
    seen: set[str] = set()

    def _append(raw_value: str | None) -> None:
        absolute = _normalize_open_access_html_candidate(raw_value, base_url=clean_base_url)
        if not absolute or absolute in seen:
            return
        absolute_lower = absolute.lower()
        if not any(
            marker in absolute_lower
            for marker in (
                "doi.org/",
                "linkinghub.",
                "science/article/",
                "/retrieve/",
                "fulltext",
                "full-text",
                "pii/",
                "pmc.ncbi.nlm.nih.gov/articles/",
                "pubmed.ncbi.nlm.nih.gov/",
                "doaj.org/article/",
            )
        ):
            return
        if any(
            absolute_lower.endswith(suffix)
            for suffix in (
                ".png",
                ".jpg",
                ".jpeg",
                ".gif",
                ".svg",
                ".css",
                ".js",
                ".ico",
                ".webmanifest",
            )
        ):
            return
        if any(
            marker in absolute_lower
            for marker in ("/static/", "/assets/", "/privacy", "/terms")
        ):
            return
        seen.add(absolute)
        candidates.append(absolute)

    meta_refresh_pattern = re.compile(
        r"""<meta[^>]+http-equiv\s*=\s*(["'])refresh\1[^>]+content\s*=\s*(["'])(.*?)\2""",
        re.IGNORECASE | re.DOTALL,
    )
    for _quote_one, _quote_two, content_value in meta_refresh_pattern.findall(clean_html):
        refresh_content = html.unescape(str(content_value or "").strip())
        match = re.search(r"""url\s*=\s*(.+)$""", refresh_content, flags=re.IGNORECASE)
        if match:
            _append(match.group(1).strip().strip("\"'"))

    patterns = (
        re.compile(
            r"""<meta[^>]+(?:property|name)\s*=\s*(["'])(?:og:url|citation_abstract_html_url)\1[^>]+content\s*=\s*(["'])(.*?)\2""",
            re.IGNORECASE | re.DOTALL,
        ),
        re.compile(
            r"""<link[^>]+rel\s*=\s*(["'])canonical\1[^>]+href\s*=\s*(["'])(.*?)\2""",
            re.IGNORECASE | re.DOTALL,
        ),
        re.compile(
            r"""<(?:a|link|iframe|embed|object)[^>]+(?:href|src|data)\s*=\s*(["'])(.*?)\1""",
            re.IGNORECASE | re.DOTALL,
        ),
    )
    for pattern in patterns:
        for raw_match in pattern.findall(clean_html):
            candidate_raw = raw_match[-1] if isinstance(raw_match, tuple) else raw_match
            _append(candidate_raw)
    return candidates


def _fetch_open_access_pdf_bytes_via_browser(oa_url: str) -> tuple[bytes, str | None]:
    clean_url = str(oa_url or "").strip()
    if not clean_url or not _open_access_browser_fetch_enabled():
        return b"", None
    parsed = urlsplit(clean_url)
    if parsed.scheme.lower() not in {"http", "https"}:
        return b"", None
    script_path = _open_access_browser_fetch_script_path()
    if script_path is None:
        return b"", None
    frontend_root = script_path.parent.parent
    if not frontend_root.exists() or not frontend_root.is_dir():
        return b"", None
    node_path = shutil.which("node")
    if not node_path:
        return b"", None

    temp_path: Path | None = None
    timeout_seconds = max(45, int(_unpaywall_timeout_seconds()) + 20)
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
            temp_path = Path(handle.name)
        completed = subprocess.run(
            [
                node_path,
                str(script_path),
                "--url",
                clean_url,
                "--output",
                str(temp_path),
                "--timeout-ms",
                str(timeout_seconds * 1000),
            ],
            cwd=str(frontend_root),
            capture_output=True,
            text=True,
            timeout=timeout_seconds + 15,
            check=False,
        )
        if completed.returncode != 0:
            logger.warning(
                "publication_oa_browser_fetch_failed",
                extra={
                    "oa_url": clean_url,
                    "returncode": completed.returncode,
                    "stderr": (completed.stderr or "").strip()[:1000],
                },
            )
            return b"", None
        if temp_path is None or not temp_path.exists() or not temp_path.is_file():
            return b"", None
        content = temp_path.read_bytes()
        if not _looks_like_pdf_payload(content, "application/pdf"):
            return b"", None
        return content, "application/pdf"
    except Exception:
        logger.exception(
            "publication_oa_browser_fetch_exception",
            extra={"oa_url": clean_url},
        )
        return b"", None
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def _storage_key_is_remote_url(value: str | None) -> bool:
    clean = str(value or "").strip()
    return bool(re.match(r"^[a-z][a-z0-9+.-]*://", clean, flags=re.IGNORECASE))


def _publication_file_storage_path(value: str | None) -> Path | None:
    clean = str(value or "").strip()
    if not clean or _storage_key_is_remote_url(clean):
        return None
    normalized = clean.replace("\\", "/")
    path = Path(normalized)
    root = _file_storage_root()
    if path.is_absolute():
        if path.exists() and path.is_file():
            return path
        root_marker = root.name
        parts = list(path.parts)
        if root_marker in parts:
            marker_index = parts.index(root_marker)
            relative_tail = parts[marker_index + 1 :]
            if relative_tail:
                return root.joinpath(*relative_tail)
        if len(parts) >= 3:
            return root.joinpath(*parts[-3:])
        return path
    return root / path


def _publication_file_has_local_copy(row: PublicationFile) -> bool:
    path = _publication_file_storage_path(row.storage_key)
    return bool(path is not None and path.exists() and path.is_file())


def _publication_file_is_viewable_pdf(row: PublicationFile) -> bool:
    if str(row.file_type or "").strip().upper() != FILE_TYPE_PDF:
        return False
    source = str(row.source or FILE_SOURCE_USER_UPLOAD).strip().upper()
    if source == FILE_SOURCE_OA_LINK:
        return _publication_file_has_local_copy(row)
    path = _publication_file_storage_path(row.storage_key)
    return bool(path is not None and path.exists() and path.is_file())


def _persist_publication_file_content(
    row: PublicationFile,
    *,
    content: bytes,
    content_type: str | None = None,
    preferred_filename: str | None = None,
) -> Path:
    if not content:
        raise PublicationConsoleValidationError("Publication file content is empty.")
    folder = _file_storage_root() / str(row.owner_user_id) / str(row.publication_id)
    folder.mkdir(parents=True, exist_ok=True)
    filename = _coerce_download_filename(
        file_name=preferred_filename or row.file_name or "publication-file"
    )
    resolved_file_type = _infer_file_type(filename=filename, content_type=content_type)
    storage_suffix = _infer_storage_suffix(
        filename=filename,
        content_type=content_type,
        file_type=resolved_file_type,
    )
    path = folder / f"{row.id}{storage_suffix}"
    path.write_bytes(content)
    row.storage_key = _storage_key_from_path(path)
    row.checksum = hashlib.sha256(content).hexdigest()
    row.file_type = resolved_file_type
    return path


def _open_access_pdf_request_headers(oa_url: str) -> dict[str, str]:
    clean_url = str(oa_url or "").strip()
    parsed = urlsplit(clean_url)
    origin = ""
    if parsed.scheme and parsed.netloc:
        origin = f"{parsed.scheme}://{parsed.netloc}"
    headers = {
        "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9,en-US;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "User-Agent": OPEN_ACCESS_FETCH_USER_AGENT,
    }
    if origin:
        headers["Origin"] = origin
        headers["Referer"] = f"{origin}/"
    return headers


def _fetch_open_access_pdf_bytes_from_candidate_urls(
    candidate_urls: list[str],
    *,
    _visited: set[str] | None = None,
    _depth: int = 0,
) -> tuple[bytes, str | None]:
    for candidate_url in candidate_urls:
        clean_candidate_url = str(candidate_url or "").strip()
        if not clean_candidate_url:
            continue
        content, content_type = _fetch_open_access_pdf_bytes(
            clean_candidate_url,
            _visited=_visited,
            _depth=_depth + 1,
        )
        if _looks_like_pdf_payload(content, content_type):
            return content, content_type
    return b"", None


def _extract_open_access_pdf_bytes_from_archive(
    archive_content: bytes,
) -> tuple[bytes, str | None]:
    if not archive_content:
        return b"", None
    try:
        with tarfile.open(fileobj=BytesIO(archive_content), mode="r:gz") as archive:
            pdf_members = [
                member
                for member in archive.getmembers()
                if member.isfile() and str(member.name or "").lower().endswith(".pdf")
            ]
            pdf_members.sort(key=lambda member: len(str(member.name or "")))
            for member in pdf_members:
                extracted = archive.extractfile(member)
                if extracted is None:
                    continue
                content = extracted.read()
                if _looks_like_pdf_payload(content, "application/pdf"):
                    return content, "application/pdf"
    except Exception:
        logger.exception("publication_oa_archive_extract_failed")
    return b"", None


def _fetch_open_access_pdf_bytes(
    oa_url: str,
    *,
    _visited: set[str] | None = None,
    _depth: int = 0,
) -> tuple[bytes, str | None]:
    clean_oa_url = str(oa_url or "").strip()
    if not clean_oa_url:
        return b"", None
    if _depth > 3:
        return b"", None
    visited = _visited if _visited is not None else set()
    if clean_oa_url in visited:
        return b"", None
    visited.add(clean_oa_url)
    content, content_type, final_url = _request_bytes_with_final_url_retry(
        url=clean_oa_url,
        timeout_seconds=_unpaywall_timeout_seconds(),
        retries=max(1, _unpaywall_retry_count()),
        headers=_open_access_pdf_request_headers(clean_oa_url),
    )
    if _looks_like_pdf_payload(content, content_type):
        return content, content_type
    if clean_oa_url.lower().endswith((".tar.gz", ".tgz")) or "gzip" in str(
        content_type or ""
    ).lower():
        archive_content, archive_content_type = (
            _extract_open_access_pdf_bytes_from_archive(content)
        )
        if _looks_like_pdf_payload(archive_content, archive_content_type):
            return archive_content, archive_content_type
    if _looks_like_html_payload(content, content_type):
        html_text = content.decode("utf-8", errors="ignore")
        html_base_url = str(final_url or clean_oa_url).strip() or clean_oa_url
        html_candidates = _extract_open_access_pdf_urls_from_html(
            html_text,
            base_url=html_base_url,
        )
        candidate_content, candidate_content_type = (
            _fetch_open_access_pdf_bytes_from_candidate_urls(
                html_candidates,
                _visited=visited,
                _depth=_depth,
            )
        )
        if _looks_like_pdf_payload(candidate_content, candidate_content_type):
            return candidate_content, candidate_content_type
        follow_candidates = _extract_open_access_follow_urls_from_html(
            html_text,
            base_url=html_base_url,
        )
        follow_content, follow_content_type = _fetch_open_access_pdf_bytes_from_candidate_urls(
            follow_candidates,
            _visited=visited,
            _depth=_depth,
        )
        if _looks_like_pdf_payload(follow_content, follow_content_type):
            return follow_content, follow_content_type
    browser_content, browser_content_type = _fetch_open_access_pdf_bytes_via_browser(
        clean_oa_url
    )
    if _looks_like_pdf_payload(browser_content, browser_content_type):
        return browser_content, browser_content_type or "application/pdf"
    return b"", None


def _reuse_existing_open_access_publication_file_local_copy(
    row: PublicationFile,
) -> bool:
    oa_url = str(row.oa_url or "").strip()
    if not oa_url:
        return False
    session = object_session(row)
    if session is None:
        return False
    donor_rows = session.scalars(
        select(PublicationFile)
        .where(
            PublicationFile.source == FILE_SOURCE_OA_LINK,
            PublicationFile.oa_url == oa_url,
            PublicationFile.id != row.id,
        )
        .order_by(PublicationFile.created_at.desc())
    ).all()
    for donor in donor_rows:
        donor_path = _publication_file_storage_path(donor.storage_key)
        if donor_path is None or not donor_path.exists() or not donor_path.is_file():
            continue
        try:
            content = donor_path.read_bytes()
        except Exception:
            continue
        if not content:
            continue
        preferred_filename = _coerce_download_filename(
            file_name=str(row.file_name or donor.file_name or "open-access.pdf"),
            path=donor_path,
        )
        content_type = (
            "application/pdf" if donor_path.suffix.lower() == ".pdf" else None
        )
        _persist_publication_file_content(
            row,
            content=content,
            content_type=content_type,
            preferred_filename=preferred_filename,
        )
        return True
    return False


def _merge_open_access_publication_file_metadata(
    target: PublicationFile, source: PublicationFile
) -> None:
    if not bool(target.custom_name) and bool(source.custom_name):
        target.file_name = source.file_name
        target.custom_name = True
    if (
        not bool(target.classification_custom)
        and bool(source.classification_custom)
        and str(source.classification or "").strip()
    ):
        target.classification = source.classification
        target.classification_custom = True
        target.classification_other_label = source.classification_other_label
    if (
        str(target.classification or "").strip().upper() == FILE_CLASSIFICATION_OTHER
        and not str(target.classification_other_label or "").strip()
        and str(source.classification or "").strip().upper() == FILE_CLASSIFICATION_OTHER
        and str(source.classification_other_label or "").strip()
    ):
        target.classification_other_label = source.classification_other_label


def _ensure_open_access_publication_file_local_copy(
    row: PublicationFile,
) -> bool:
    if _publication_file_has_local_copy(row):
        return True
    if _reuse_existing_open_access_publication_file_local_copy(row):
        return True
    oa_url = str(row.oa_url or "").strip()
    if not oa_url:
        return False
    content, content_type = _fetch_open_access_pdf_bytes(oa_url)
    if not content:
        return False
    _persist_publication_file_content(
        row,
        content=content,
        content_type=content_type,
        preferred_filename=str(row.file_name or "open-access.pdf"),
    )
    return True


def _prune_unstored_open_access_publication_file(
    row: PublicationFile, *, reason: str
) -> None:
    session = object_session(row)
    if session is None:
        return
    logger.info(
        "publication_open_access_file_pruned",
        extra={
            "file_id": str(row.id),
            "publication_id": str(row.publication_id),
            "owner_user_id": str(row.owner_user_id),
            "reason": reason,
        },
    )
    session.delete(row)
    session.flush()


def _normalize_publication_file_classification(value: str | None) -> str | None:
    normalized = str(value or "").strip().upper()
    if normalized in FILE_CLASSIFICATIONS:
        return normalized
    return None


def _validate_publication_file_classification(value: str | None) -> str:
    normalized = str(value or "").strip().upper()
    if normalized not in FILE_CLASSIFICATIONS:
        raise PublicationConsoleValidationError(
            "Classification must be one of: Published manuscript, Supplementary materials, Datasets, Table, Figure, Cover letter, or Other."
        )
    return normalized


def _validate_publication_file_other_label(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    if len(cleaned) > 80:
        raise PublicationConsoleValidationError(
            "Custom Other tag labels must be 80 characters or fewer."
        )
    return cleaned


def _serialize_file(publication_id: str, row: PublicationFile) -> dict[str, Any]:
    download_url: str | None = None
    source = str(row.source or FILE_SOURCE_USER_UPLOAD).upper()
    classification = (
        _normalize_publication_file_classification(
            str(row.classification or "").strip() or None
        )
        if bool(row.classification_custom)
        else None
    )
    classification_other_label = (
        _validate_publication_file_other_label(
            str(row.classification_other_label or "").strip() or None
        )
        if classification == FILE_CLASSIFICATION_OTHER
        else None
    )
    if source == FILE_SOURCE_OA_LINK:
        download_url = (
            f"/v1/publications/{publication_id}/files/{row.id}/download"
            if _publication_file_has_local_copy(row)
            else str(row.oa_url or "").strip() or None
        )
    else:
        download_url = f"/v1/publications/{publication_id}/files/{row.id}/download"
    return {
        "id": str(row.id),
        "file_name": str(row.file_name or ""),
        "file_type": str(row.file_type or FILE_TYPE_OTHER),
        "source": source,
        "oa_url": str(row.oa_url or "").strip() or None,
        "checksum": str(row.checksum or "").strip() or None,
        "created_at": row.created_at,
        "download_url": download_url,
        "label": "OA Manuscript Download"
        if source == FILE_SOURCE_OA_LINK
        else "Uploaded file",
        "classification": classification,
        "classification_label": (
            classification_other_label
            if classification == FILE_CLASSIFICATION_OTHER
            and classification_other_label
            else FILE_CLASSIFICATION_LABELS.get(classification)
            if classification
            else None
        ),
        "classification_other_label": classification_other_label,
        "is_stored_locally": source != FILE_SOURCE_OA_LINK
        or _publication_file_has_local_copy(row),
        "can_delete": True,
        "can_rename": True,
        "can_classify": True,
    }


def _serialize_supplementary_work_as_file(row: Work) -> dict[str, Any]:
    download_url = supplementary_link_url(row)
    return {
        "id": f"supplementary-work:{row.id}",
        "file_name": str(row.title or "").strip() or "Supplementary material",
        "file_type": FILE_TYPE_OTHER,
        "source": FILE_SOURCE_SUPPLEMENTARY_LINK,
        "oa_url": download_url,
        "checksum": None,
        "created_at": row.created_at,
        "download_url": download_url,
        "label": "Supplementary material",
        "classification": None,
        "classification_label": None,
        "classification_other_label": None,
        "can_delete": False,
        "can_rename": False,
        "can_classify": False,
    }


def _empty_impact_payload(*, work: Work, citations_total: int) -> dict[str, Any]:
    return {
        "citations_total": max(0, int(citations_total)),
        "citations_last_12m": 0,
        "citations_prev_12m": 0,
        "yoy_pct": None,
        "acceleration_citations_per_month": 0.0,
        "per_year": [],
        "portfolio_context": {
            "paper_share_total_pct": 0.0,
            "paper_share_12m_pct": 0.0,
            "portfolio_rank_total": None,
            "portfolio_rank_12m": None,
        },
        "top_citing_journals": [{"name": "Not available from source", "count": 0}],
        "top_citing_countries": [{"name": "Not available from source", "count": 0}],
        "key_citing_papers": [],
        "metadata": {
            "publication_id": str(work.id),
            "openalex_work_id": _extract_openalex_work_id(work.openalex_work_id),
            "source_notes": {
                "top_citing_journals": "Not available from source",
                "top_citing_countries": "Not available from source",
                "key_citing_papers": "Not available from source",
            },
        },
    }


def _empty_ai_payload() -> dict[str, Any]:
    return {
        "label": "AI-generated draft insights",
        "performance_summary": "Not available. Impact metrics are still being computed for this publication.",
        "trajectory_classification": "UNKNOWN",
        "extractive_key_points": {
            "objective": "Not stated in abstract.",
            "methods": "Not stated in abstract.",
            "main_findings": "Not stated in abstract.",
            "conclusion": "Not stated in abstract.",
        },
        "reuse_suggestions": [
            "Use this publication in manuscript drafting after impact and abstract metadata are available."
        ],
        "caution_flags": [
            "AI-generated draft insights. Verify against full text.",
        ],
    }


def _build_publication_summary(work: Work, *, citations_total: int) -> dict[str, Any]:
    journal = str(work.journal or "").strip() or str(work.venue_name or "").strip()
    publication_type = str(work.work_type or "").strip()
    article_type = str(work.publication_type or "").strip()
    return {
        "id": str(work.id),
        "title": str(work.title or "").strip(),
        "year": work.year if isinstance(work.year, int) else None,
        "journal": journal or "Not available",
        "publication_type": publication_type or "Not available",
        "article_type": article_type or None,
        "citations_total": max(0, int(citations_total)),
        "doi": _normalize_doi(work.doi),
        "pmid": _normalize_pmid(work.pmid) or _extract_pmid_from_text(work.url),
        "openalex_work_id": _extract_openalex_work_id(work.openalex_work_id),
        "abstract": str(work.abstract or "").strip() or None,
        "keywords_json": [
            str(item).strip() for item in (work.keywords or []) if str(item).strip()
        ],
        "authors_json": work.authors_json
        if isinstance(work.authors_json, list)
        else [],
        "affiliations_json": work.affiliations_json
        if isinstance(work.affiliations_json, list)
        else [],
        "oa_link_suppressed": bool(work.oa_link_suppressed),
        "created_at": work.created_at,
        "updated_at": work.updated_at,
    }


def _extract_openalex_work_record(
    *, work: Work, mailto: str | None
) -> tuple[dict[str, Any] | None, str | None]:
    params_base: dict[str, Any] = {"per-page": 1}
    if mailto:
        params_base["mailto"] = mailto

    openalex_id = _extract_openalex_work_id(work.openalex_work_id)
    if openalex_id:
        payload = _request_json_with_retry(
            url=f"https://api.openalex.org/works/{openalex_id}",
            timeout_seconds=_openalex_timeout_seconds(),
            retries=_openalex_retry_count(),
        )
        if payload:
            return payload, openalex_id

    doi = _normalize_doi(work.doi)
    if doi:
        params = dict(params_base)
        params["filter"] = f"doi:https://doi.org/{doi}"
        payload = _request_json_with_retry(
            url="https://api.openalex.org/works",
            params=params,
            timeout_seconds=_openalex_timeout_seconds(),
            retries=_openalex_retry_count(),
        )
        results = payload.get("results") if isinstance(payload, dict) else None
        if isinstance(results, list) and results:
            item = results[0]
            if isinstance(item, dict):
                return item, _extract_openalex_work_id(str(item.get("id") or ""))

    pmid = _normalize_pmid(work.pmid) or _extract_pmid_from_text(work.url)
    if pmid:
        params = dict(params_base)
        params["filter"] = f"pmid:{pmid}"
        payload = _request_json_with_retry(
            url="https://api.openalex.org/works",
            params=params,
            timeout_seconds=_openalex_timeout_seconds(),
            retries=_openalex_retry_count(),
        )
        results = payload.get("results") if isinstance(payload, dict) else None
        if isinstance(results, list) and results:
            item = results[0]
            if isinstance(item, dict):
                return item, _extract_openalex_work_id(str(item.get("id") or ""))

    title = str(work.title or "").strip()
    if title:
        params = dict(params_base)
        params["search"] = title
        payload = _request_json_with_retry(
            url="https://api.openalex.org/works",
            params=params,
            timeout_seconds=_openalex_timeout_seconds(),
            retries=_openalex_retry_count(),
        )
        results = payload.get("results") if isinstance(payload, dict) else None
        if isinstance(results, list) and results:
            item = results[0]
            if isinstance(item, dict):
                return item, _extract_openalex_work_id(str(item.get("id") or ""))

    return None, None


def _extract_authors_from_pubmed(
    pmid: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    root = _fetch_pubmed_article_xml_root(pmid)
    if root is None:
        return [], []

    authors: list[dict[str, Any]] = []
    affiliations_order: list[str] = []
    affiliations_index: dict[str, dict[str, Any]] = {}

    for author_node in root.findall(".//AuthorList/Author"):
        collective = (author_node.findtext("CollectiveName") or "").strip()
        fore_name = (author_node.findtext("ForeName") or "").strip()
        last_name = (author_node.findtext("LastName") or "").strip()
        initials = (author_node.findtext("Initials") or "").strip()
        if collective:
            display_name = collective
        else:
            display_name = (
                " ".join([part for part in [fore_name, last_name] if part]).strip()
                or last_name
                or fore_name
                or initials
            )
        display_name = re.sub(r"\s+", " ", display_name).strip()
        if not display_name:
            continue

        author_affiliations: list[str] = []
        for aff_node in author_node.findall("./AffiliationInfo/Affiliation"):
            text = re.sub(r"\s+", " ", str(aff_node.text or "").strip())
            if not text:
                continue
            author_affiliations.append(text)
            if text not in affiliations_index:
                affiliations_index[text] = {"name": text}
                affiliations_order.append(text)

        authors.append(
            {
                "name": display_name,
                "orcid_id": None,
                "affiliations": author_affiliations,
            }
        )

    return authors, [affiliations_index[name] for name in affiliations_order]


def _extract_structured_abstract_from_pubmed(
    pmid: str,
) -> tuple[str | None, list[dict[str, str]], list[str]]:
    root = _fetch_pubmed_article_xml_root(pmid)
    if root is None:
        return None, [], []

    sections: list[dict[str, str]] = []
    summary_parts: list[str] = []
    keywords: list[str] = []
    seen_keywords: set[str] = set()
    for node in root.findall(".//KeywordList/Keyword"):
        keyword_text = _normalize_abstract_text(str("".join(node.itertext()) or ""))
        if not keyword_text:
            continue
        marker = keyword_text.casefold()
        if marker in seen_keywords:
            continue
        seen_keywords.add(marker)
        keywords.append(keyword_text)

    for node in root.findall(".//Abstract/AbstractText"):
        content = re.sub(r"\s+", " ", str("".join(node.itertext()) or "").strip())
        if not content:
            continue
        raw_label = str(
            node.attrib.get("Label") or node.attrib.get("NlmCategory") or ""
        ).strip()
        label = _normalize_heading_label(raw_label) if raw_label else "Summary"
        key = _canonical_structured_section_key(raw_label or label) or "other"
        if raw_label:
            summary_parts.append(f"{raw_label}: {content}")
            sections.append({"key": key, "label": label, "content": content})
            continue

        inline_sections = _extract_inline_heading_sections(content)
        if inline_sections:
            summary_parts.append(content)
            sections.extend(inline_sections)
            continue

        summary_parts.append(content)
        sections.append({"key": key, "label": label, "content": content})

    if not summary_parts:
        return None, [], keywords
    return _normalize_abstract_text(" ".join(summary_parts)), sections, keywords


def _extract_authors_from_crossref(
    doi: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    payload = _request_json_with_retry(
        url=f"https://api.crossref.org/works/{quote(doi, safe='')}",
        timeout_seconds=_crossref_timeout_seconds(),
        retries=_crossref_retry_count(),
    )
    message = payload.get("message") if isinstance(payload, dict) else None
    authors_raw = message.get("author") if isinstance(message, dict) else None
    if not isinstance(authors_raw, list):
        return [], []

    authors: list[dict[str, Any]] = []
    affiliations_order: list[str] = []
    affiliations_index: dict[str, dict[str, Any]] = {}

    for item in authors_raw:
        if not isinstance(item, dict):
            continue
        given = str(item.get("given") or "").strip()
        family = str(item.get("family") or "").strip()
        display_name = (
            str(item.get("name") or "").strip()
            or " ".join([part for part in [given, family] if part]).strip()
        )
        display_name = re.sub(r"\s+", " ", display_name).strip()
        if not display_name:
            continue

        affiliations: list[str] = []
        aff_raw = item.get("affiliation")
        if isinstance(aff_raw, list):
            for aff in aff_raw:
                if not isinstance(aff, dict):
                    continue
                name = re.sub(r"\s+", " ", str(aff.get("name") or "").strip())
                if not name:
                    continue
                affiliations.append(name)
                if name not in affiliations_index:
                    affiliations_index[name] = {"name": name}
                    affiliations_order.append(name)

        authors.append(
            {
                "name": display_name,
                "orcid_id": _normalize_orcid_id(str(item.get("ORCID") or "") or None),
                "affiliations": affiliations,
            }
        )

    return authors, [affiliations_index[name] for name in affiliations_order]


def _extract_authors_from_openalex(
    work_record: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    authorships = work_record.get("authorships")
    if not isinstance(authorships, list):
        return [], []

    authors: list[dict[str, Any]] = []
    affiliations_order: list[str] = []
    affiliations_index: dict[str, dict[str, Any]] = {}

    for authorship in authorships:
        if not isinstance(authorship, dict):
            continue
        author = authorship.get("author")
        if not isinstance(author, dict):
            continue
        name = re.sub(r"\s+", " ", str(author.get("display_name") or "").strip())
        if not name:
            continue

        author_affiliations: list[str] = []
        institutions = authorship.get("institutions")
        if isinstance(institutions, list):
            for institution in institutions:
                if not isinstance(institution, dict):
                    continue
                inst_name = re.sub(
                    r"\s+", " ", str(institution.get("display_name") or "").strip()
                )
                country_code = (
                    str(institution.get("country_code") or "").strip().upper() or None
                )
                if not inst_name:
                    continue
                author_affiliations.append(inst_name)
                if inst_name not in affiliations_index:
                    affiliations_index[inst_name] = {
                        "name": inst_name,
                        "country_code": country_code,
                    }
                    affiliations_order.append(inst_name)

        authors.append(
            {
                "name": name,
                "orcid_id": _normalize_orcid_id(str(author.get("orcid") or "") or None),
                "affiliations": author_affiliations,
            }
        )

    return authors, [affiliations_index[name] for name in affiliations_order]


def _hydrate_authors_data(*, work: Work, user_email: str | None) -> dict[str, Any]:
    pmid = _normalize_pmid(work.pmid) or _extract_pmid_from_text(work.url)
    doi = _normalize_doi(work.doi)

    if pmid:
        authors, affiliations = _extract_authors_from_pubmed(pmid)
        if authors:
            return {
                "status": READY_STATUS,
                "authors_json": authors,
                "affiliations_json": affiliations,
                "source": "PUBMED",
                "openalex_work_id": _extract_openalex_work_id(work.openalex_work_id),
            }

    if doi:
        authors, affiliations = _extract_authors_from_crossref(doi)
        if authors:
            return {
                "status": READY_STATUS,
                "authors_json": authors,
                "affiliations_json": affiliations,
                "source": "CROSSREF",
                "openalex_work_id": _extract_openalex_work_id(work.openalex_work_id),
            }

    mailto = _openalex_mailto(user_email=user_email)
    record, openalex_id = _extract_openalex_work_record(work=work, mailto=mailto)
    if isinstance(record, dict):
        authors, affiliations = _extract_authors_from_openalex(record)
        if authors:
            return {
                "status": READY_STATUS,
                "authors_json": authors,
                "affiliations_json": affiliations,
                "source": "OPENALEX",
                "openalex_work_id": openalex_id,
            }

    return {
        "status": FAILED_STATUS,
        "authors_json": [],
        "affiliations_json": [],
        "source": "NONE",
        "openalex_work_id": _extract_openalex_work_id(work.openalex_work_id),
    }


def _executor_bucket_for_job_kind(kind: str) -> str:
    normalized = str(kind or "").strip().lower()
    if normalized in {"structured_paper", "structured_paper_assets"}:
        return "structured_paper"
    return "default"


def _get_executor(kind: str = "default") -> ThreadPoolExecutor:
    global _executors
    bucket = _executor_bucket_for_job_kind(kind)
    with _executor_lock:
        executor = _executors.get(bucket)
        if executor is None:
            max_workers = (
                _structured_paper_max_workers()
                if bucket == "structured_paper"
                else _max_workers()
            )
            executor = ThreadPoolExecutor(
                max_workers=max_workers,
                thread_name_prefix=f"pub-console-{bucket}",
            )
            _executors[bucket] = executor
        return executor


def _submit_background_job(*, kind: str, user_id: str, publication_id: str, fn) -> bool:  # noqa: ANN001
    key = (kind, user_id, publication_id)
    with _inflight_lock:
        if key in _inflight_jobs:
            return False
        _inflight_jobs.add(key)

    def _run() -> None:
        try:
            fn(user_id=user_id, publication_id=publication_id)
        except Exception:
            logger.exception(
                "publication_console_background_job_failed",
                extra={
                    "kind": kind,
                    "user_id": user_id,
                    "publication_id": publication_id,
                },
            )
        finally:
            with _inflight_lock:
                _inflight_jobs.discard(key)

    _get_executor(kind).submit(_run)
    return True


def _portfolio_context(
    session,
    *,
    user_id: str,
    publication_id: str,
    paper_total_citations: int,
    paper_last_12m: int,
) -> dict[str, Any]:
    works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
    now = _utcnow()
    cutoff_12 = now - timedelta(days=365)

    total_by_work: list[tuple[str, int]] = []
    last12_by_work: list[tuple[str, int]] = []
    portfolio_total = 0
    portfolio_last12 = 0

    for work in works:
        latest = _latest_metric_for_work(session, work_id=str(work.id))
        at_12 = _latest_metric_for_work_at_or_before(
            session, work_id=str(work.id), cutoff=cutoff_12
        )
        total = (
            int(latest.citations_count or 0)
            if latest is not None
            else int(work.citations_total or 0)
        )
        total = max(0, total)

        if latest is not None and at_12 is not None:
            last12 = max(
                0, int(latest.citations_count or 0) - int(at_12.citations_count or 0)
            )
        elif latest is not None:
            yearly = _extract_counts_by_year(latest, now_year=now.year)
            last12 = _estimate_window_citations(
                yearly, start=cutoff_12, end=now, now=now
            )
        else:
            last12 = 0

        total_by_work.append((str(work.id), total))
        last12_by_work.append((str(work.id), max(0, int(last12))))
        portfolio_total += total
        portfolio_last12 += max(0, int(last12))

    total_by_work.sort(key=lambda item: item[1], reverse=True)
    last12_by_work.sort(key=lambda item: item[1], reverse=True)

    rank_total = next(
        (
            index
            for index, item in enumerate(total_by_work, start=1)
            if item[0] == publication_id
        ),
        None,
    )
    rank_12m = next(
        (
            index
            for index, item in enumerate(last12_by_work, start=1)
            if item[0] == publication_id
        ),
        None,
    )

    share_total = (
        round((paper_total_citations / portfolio_total) * 100.0, 2)
        if portfolio_total > 0
        else 0.0
    )
    share_12m = (
        round((paper_last_12m / portfolio_last12) * 100.0, 2)
        if portfolio_last12 > 0
        else 0.0
    )

    return {
        "paper_share_total_pct": share_total,
        "paper_share_12m_pct": share_12m,
        "portfolio_rank_total": rank_total,
        "portfolio_rank_12m": rank_12m,
    }


def _fetch_openalex_citing_summaries(
    *, openalex_work_id: str | None, mailto: str | None
) -> dict[str, Any]:
    compact_id = _extract_openalex_work_id(openalex_work_id)
    if not compact_id:
        return {
            "top_citing_journals": [{"name": "Not available from source", "count": 0}],
            "top_citing_countries": [{"name": "Not available from source", "count": 0}],
            "key_citing_papers": [],
            "source_notes": {
                "top_citing_journals": "Not available from source",
                "top_citing_countries": "Not available from source",
                "key_citing_papers": "Not available from source",
            },
        }

    journal_counter: Counter[str] = Counter()
    country_counter: Counter[str] = Counter()
    citing_papers: list[dict[str, Any]] = []

    per_page = 100
    for page in range(1, _openalex_citing_pages() + 1):
        params: dict[str, Any] = {
            "filter": f"cites:{compact_id}",
            "per-page": per_page,
            "page": page,
            "select": "id,display_name,publication_year,host_venue,doi,ids,cited_by_count,authorships",
        }
        if mailto:
            params["mailto"] = mailto
        payload = _request_json_with_retry(
            url="https://api.openalex.org/works",
            params=params,
            timeout_seconds=_openalex_timeout_seconds(),
            retries=_openalex_retry_count(),
        )
        results = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(results, list) or not results:
            break
        for item in results:
            if not isinstance(item, dict):
                continue
            title = re.sub(r"\s+", " ", str(item.get("display_name") or "").strip())
            if not title:
                continue
            host = item.get("host_venue")
            journal = (
                re.sub(r"\s+", " ", str(host.get("display_name") or "").strip())
                if isinstance(host, dict)
                else ""
            )
            if journal:
                journal_counter[journal] += 1

            countries_in_work: set[str] = set()
            authorships = item.get("authorships")
            if isinstance(authorships, list):
                for authorship in authorships:
                    if not isinstance(authorship, dict):
                        continue
                    institutions = authorship.get("institutions")
                    if not isinstance(institutions, list):
                        continue
                    for institution in institutions:
                        if not isinstance(institution, dict):
                            continue
                        code = (
                            str(institution.get("country_code") or "").strip().upper()
                        )
                        if code:
                            countries_in_work.add(code)
            for country in countries_in_work:
                country_counter[country] += 1

            ids = item.get("ids")
            pmid = None
            if isinstance(ids, dict):
                pmid = _normalize_pmid(
                    _extract_pmid_from_text(str(ids.get("pmid") or ""))
                    or str(ids.get("pmid") or "")
                )

            citing_papers.append(
                {
                    "title": title,
                    "year": _safe_int(item.get("publication_year")),
                    "journal": journal or "Not available",
                    "doi": _normalize_doi(str(item.get("doi") or "")),
                    "pmid": pmid,
                    "citations_total": max(
                        0, int(_safe_int(item.get("cited_by_count")) or 0)
                    ),
                }
            )

        if len(results) < per_page:
            break

    top_journals = [
        {"name": name, "count": count} for name, count in journal_counter.most_common(5)
    ]
    top_countries = [
        {"name": name, "count": count} for name, count in country_counter.most_common(5)
    ]
    citing_papers.sort(
        key=lambda item: int(item.get("citations_total") or 0), reverse=True
    )
    key_papers = citing_papers[:8]

    source_notes: dict[str, str] = {}
    if not top_journals:
        top_journals = [{"name": "Not available from source", "count": 0}]
        source_notes["top_citing_journals"] = "Not available from source"
    if not top_countries:
        top_countries = [{"name": "Not available from source", "count": 0}]
        source_notes["top_citing_countries"] = "Not available from source"
    if not key_papers:
        source_notes["key_citing_papers"] = "Not available from source"

    return {
        "top_citing_journals": top_journals,
        "top_citing_countries": top_countries,
        "key_citing_papers": key_papers,
        "source_notes": source_notes,
    }


def _build_impact_payload(
    session, *, user_id: str, publication_id: str
) -> dict[str, Any]:
    user = _resolve_user_or_raise(session, user_id)
    work = _resolve_work_or_raise(
        session, user_id=user_id, publication_id=publication_id
    )
    now = _utcnow()
    cutoff_12 = now - timedelta(days=365)
    cutoff_24 = now - timedelta(days=730)

    latest = _latest_metric_for_work(session, work_id=publication_id)
    at_12 = _latest_metric_for_work_at_or_before(
        session, work_id=publication_id, cutoff=cutoff_12
    )
    at_24 = _latest_metric_for_work_at_or_before(
        session, work_id=publication_id, cutoff=cutoff_24
    )

    citations_total = (
        int(latest.citations_count or 0)
        if latest is not None
        else int(work.citations_total or 0)
    )
    citations_total = max(0, citations_total)

    yearly_counts = _extract_counts_by_year(latest, now_year=now.year)
    if not yearly_counts and citations_total > 0:
        bucket = (
            int(work.year)
            if isinstance(work.year, int) and 1900 <= int(work.year) <= now.year
            else now.year
        )
        yearly_counts[bucket] = citations_total
    if yearly_counts and citations_total > sum(yearly_counts.values()):
        yearly_counts[now.year] = yearly_counts.get(now.year, 0) + (
            citations_total - sum(yearly_counts.values())
        )

    if latest is not None and at_12 is not None:
        citations_last_12 = max(
            0, int(latest.citations_count or 0) - int(at_12.citations_count or 0)
        )
    else:
        citations_last_12 = _estimate_window_citations(
            yearly_counts, start=cutoff_12, end=now, now=now
        )

    if at_12 is not None and at_24 is not None:
        citations_prev_12 = max(
            0, int(at_12.citations_count or 0) - int(at_24.citations_count or 0)
        )
    else:
        citations_prev_12 = _estimate_window_citations(
            yearly_counts, start=cutoff_24, end=cutoff_12, now=now
        )

    yoy_pct = None
    if citations_prev_12 > 0:
        yoy_pct = round(
            ((citations_last_12 - citations_prev_12) / citations_prev_12) * 100.0, 1
        )
    acceleration = round((citations_last_12 / 12.0) - (citations_prev_12 / 12.0), 2)

    per_year = _per_year_with_yoy(yearly_counts)
    portfolio = _portfolio_context(
        session,
        user_id=user_id,
        publication_id=publication_id,
        paper_total_citations=citations_total,
        paper_last_12m=citations_last_12,
    )

    mailto = _openalex_mailto(user_email=user.email)
    record, resolved_id = _extract_openalex_work_record(work=work, mailto=mailto)
    compact_openalex_id = (
        resolved_id
        or _extract_openalex_work_id(work.openalex_work_id)
        or _extract_openalex_work_id(str((record or {}).get("id") or ""))
    )
    citing = _fetch_openalex_citing_summaries(
        openalex_work_id=compact_openalex_id, mailto=mailto
    )

    payload = _empty_impact_payload(work=work, citations_total=citations_total)
    payload["citations_total"] = citations_total
    payload["citations_last_12m"] = int(citations_last_12)
    payload["citations_prev_12m"] = int(citations_prev_12)
    payload["yoy_pct"] = yoy_pct
    payload["acceleration_citations_per_month"] = acceleration
    payload["per_year"] = per_year
    payload["portfolio_context"] = portfolio
    payload["top_citing_journals"] = citing["top_citing_journals"]
    payload["top_citing_countries"] = citing["top_citing_countries"]
    payload["key_citing_papers"] = citing["key_citing_papers"]
    payload["metadata"] = {
        "publication_id": str(work.id),
        "openalex_work_id": compact_openalex_id,
        "source_notes": citing["source_notes"],
    }
    return payload


def _split_sentences(value: str) -> list[str]:
    compact = re.sub(r"\s+", " ", str(value or "").strip())
    if not compact:
        return []
    return [
        part.strip() for part in re.split(r"(?<=[.!?])\s+", compact) if part.strip()
    ]


def _find_sentence(sentences: list[str], patterns: list[str]) -> str | None:
    for sentence in sentences:
        lower = sentence.lower()
        for pattern in patterns:
            if re.search(pattern, lower):
                return sentence
    return None


def _extract_key_points_from_abstract(abstract: str | None) -> dict[str, str]:
    default = {
        "objective": "Not stated in abstract.",
        "methods": "Not stated in abstract.",
        "main_findings": "Not stated in abstract.",
        "conclusion": "Not stated in abstract.",
    }
    text = str(abstract or "").strip()
    if not text:
        return default

    compact = re.sub(r"\s+", " ", text)
    heading_pattern = re.compile(
        r"(?i)\b(background|objective|objectives|aim|aims|purpose|methods?|results?|conclusions?)\s*[:.-]"
    )
    matches = list(heading_pattern.finditer(compact))
    if matches:
        sections: dict[str, str] = {}
        for index, match in enumerate(matches):
            label = match.group(1).strip().lower()
            start = match.end()
            end = (
                matches[index + 1].start() if index + 1 < len(matches) else len(compact)
            )
            body = compact[start:end].strip(" .;:")
            if body:
                sections[label] = body
        return {
            "objective": sections.get("objective")
            or sections.get("objectives")
            or sections.get("aim")
            or sections.get("aims")
            or sections.get("purpose")
            or sections.get("background")
            or default["objective"],
            "methods": sections.get("method")
            or sections.get("methods")
            or default["methods"],
            "main_findings": sections.get("result")
            or sections.get("results")
            or default["main_findings"],
            "conclusion": sections.get("conclusion")
            or sections.get("conclusions")
            or default["conclusion"],
        }

    sentences = _split_sentences(compact)
    objective = _find_sentence(
        sentences,
        [
            r"\b(aim|objective|purpose)\b",
            r"\bwe (investigated|evaluated|assessed|examined)\b",
        ],
    )
    methods = _find_sentence(
        sentences,
        [
            r"\b(method|methods)\b",
            r"\b(randomized|retrospective|prospective|cohort|meta-analysis|systematic review)\b",
            r"\bwe (conducted|performed|analysed|analyzed)\b",
        ],
    )
    findings = _find_sentence(
        sentences,
        [r"\b(result|results)\b", r"\bwe found\b", r"\bshowed\b", r"\bdemonstrated\b"],
    )
    conclusion = _find_sentence(
        sentences,
        [
            r"\bconclusion\b",
            r"\bwe conclude\b",
            r"\bthis suggests\b",
            r"\bthese findings indicate\b",
        ],
    )

    return {
        "objective": objective or default["objective"],
        "methods": methods or default["methods"],
        "main_findings": findings or default["main_findings"],
        "conclusion": conclusion or default["conclusion"],
    }


def _classify_trajectory(per_year: list[dict[str, Any]]) -> str:
    if not per_year:
        return "UNKNOWN"
    values = [max(0, int(_safe_int(item.get("citations")) or 0)) for item in per_year]
    if len(values) < 2:
        return "UNKNOWN"

    first = values[0]
    latest = values[-1]
    prev = values[-2]
    peak = max(values)
    peak_index = values.index(peak)
    mean = sum(values) / max(1, len(values))
    variance = sum((item - mean) ** 2 for item in values) / max(1, len(values))
    stddev = variance**0.5

    if peak_index <= 1 and latest < peak * 0.6 and len(values) >= 3:
        return "EARLY_SPIKE"
    if prev > 0 and latest >= prev * 1.5:
        return "ACCELERATING"
    if prev > 0 and latest <= prev * 0.6:
        return "DECLINING"
    if first > 0 and latest >= first * 1.8 and values[-1] >= values[-2]:
        return "SLOW_BURN"
    if mean > 0 and (stddev / mean) <= 0.25:
        return "CONSISTENT"
    return "UNKNOWN"


def _build_reuse_suggestions(
    *, title: str, journal: str, trajectory: str, key_points: dict[str, str]
) -> list[str]:
    suggestions: list[str] = []
    if (
        key_points.get("objective")
        and key_points["objective"] != "Not stated in abstract."
    ):
        suggestions.append(
            "Use for introduction framing and problem statement context."
        )
    if key_points.get("methods") and key_points["methods"] != "Not stated in abstract.":
        suggestions.append("Use for methods positioning and protocol comparison.")
    if (
        key_points.get("main_findings")
        and key_points["main_findings"] != "Not stated in abstract."
    ):
        suggestions.append(
            "Use in discussion to benchmark outcomes against prior evidence."
        )
    if trajectory in {"ACCELERATING", "CONSISTENT"}:
        suggestions.append(
            "Prioritise as a core citation in high-salience manuscript sections."
        )
    if trajectory == "DECLINING":
        suggestions.append(
            "Use selectively and pair with newer corroborating citations."
        )
    if journal and journal != "Not available":
        suggestions.append(f"Track follow-up papers in {journal} for updated evidence.")
    if not suggestions:
        suggestions.append(
            f"Use '{title}' as supplementary background until richer metadata is available."
        )

    seen: set[str] = set()
    result: list[str] = []
    for item in suggestions:
        key = item.lower().strip()
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result[:6]


def _build_caution_flags(
    *, abstract: str | None, key_points: dict[str, str]
) -> list[str]:
    flags: list[str] = []
    text = re.sub(r"\s+", " ", str(abstract or "").strip()).lower()
    if not text:
        return ["No abstract available for extractive analysis."]

    if not re.search(
        r"\b(n\s*=\s*\d+|\d+\s+(patients|participants|subjects|cases))\b", text
    ):
        flags.append("Abstract does not state sample size.")
    if key_points.get("methods") == "Not stated in abstract.":
        flags.append("Abstract does not clearly state methods.")
    if key_points.get("main_findings") == "Not stated in abstract.":
        flags.append("Abstract does not clearly state main findings.")
    if key_points.get("conclusion") == "Not stated in abstract.":
        flags.append("Abstract does not clearly state conclusion.")
    if not re.search(
        r"\b(outcome|endpoint|mortality|effect|improv|benefit|risk)\b", text
    ):
        flags.append("Abstract does not explicitly state outcomes.")
    if not flags:
        flags.append("No major caution flags detected in abstract-only analysis.")
    return flags[:6]


def _normalize_abstract_text(value: str | None) -> str:
    decoded = html.unescape(str(value or ""))
    decoded = re.sub(r"(?i)<br\s*/?>", "\n", decoded)
    decoded = re.sub(r"(?i)</?p\b[^>]*>", "\n", decoded)
    decoded = decoded.replace("\xa0", " ")
    return re.sub(r"\s+", " ", decoded.strip())


def _publication_paper_content_cleanup(value: str | None) -> str:
    clean = _normalize_abstract_text(value)
    if not clean:
        return ""
    clean = re.sub(
        r"(?is)\bprotected by copyright, including for uses related to text and data mining, ai training, and similar technologies\.?",
        " ",
        clean,
    )
    clean = re.sub(
        r"(?is)\bincluding for uses related to text and data mining, ai training, and similar technologies\.?",
        " ",
        clean,
    )
    clean = re.sub(
        r"(?is)\b\w[\w\s&-]{0,30}:\s*first published as\s+10\.\d{4,9}/\S+\s+on\s+\d{1,2}\s+[a-z]+\s+\d{4}\.?",
        " ",
        clean,
    )
    clean = re.sub(
        r"(?is)\bfirst published as\s+10\.\d{4,9}/\S+(?:\s+on\s+\d{1,2}\s+[a-z]+\s+\d{4}\.?)?",
        " ",
        clean,
    )
    clean = re.sub(
        r"(?is)\bon\s+(?:\d{1,2}\s+[a-z]+\s+\d{4}|[a-z]+\s+\d{1,2},?\s*\d{4})\s+by guest\.",
        " ",
        clean,
    )
    clean = re.sub(r"(?is)\bhttps?://\S+", " ", clean)
    clean = re.sub(r"(?is)\bbmj\.com/\s+\d{1,2}\s+[a-z]+\s+\d{4}\.", " ", clean)
    clean = re.sub(r"(?is)\bbmj\.com/", " ", clean)
    clean = re.sub(
        r"(?is)\bby guest on\s.{0,200}?\sdownloaded from(?:\s+\d{1,2}\s+[a-z]+\s+\d{4}\.?)?",
        " ",
        clean,
    )
    clean = re.sub(r"(?is)\bby guest on [^.]{0,160}\.", " ", clean)
    clean = re.sub(
        r"(?is)\b10\.\d{4,9}/[-._;()/:a-z0-9]+\s+on\s+\w[\w\s&-]{0,30}:\s*first published as\b",
        " ",
        clean,
    )
    clean = re.sub(r"(?is)\bon\s+\w[\w\s&-]{0,30}:\s*first published as\b", " ", clean)
    clean = re.sub(r"(?is)\bdownloaded from\b", " ", clean)
    clean = re.sub(
        r"(?is)\bfigure\s+\d+[a-z]?\s+[^.]*?(?:;[^.]*?)+\.(?=\s+[a-z])",
        " ",
        clean,
    )
    clean = re.sub(
        r"(?is)\bfigure\s+\d+[a-z]?\s+[^.]{0,240}\.\s+[^.]{0,400}\.\s+[A-Z]{2,},[^.]{0,800}\.",
        " ",
        clean,
    )
    clean = re.sub(
        r"(?is)(?:^|\.\s+)(?:figure|fig\.?|table)\s+\d+[a-z]?\s+"
        r"(?!(?:shows?|presents?|depicts?|illustrates?|demonstrates?|displays?"
        r"|compares?|summariz\w+|provides?|contains?|indicates?|reveals?"
        r"|highlights?|outlines?|represents?"
        r"|is\s|was\s|were\s|has\s|had\s|can\s|will\s|would\s|should\s"
        r"|could\s|may\s|might\s|also\s|further\s|and\s|below\s|above\s"
        r"|in\s+the\s|on\s+the\s)\b)"
        r"[^.]{40,600}\.",
        " ",
        clean,
    )
    clean = re.sub(r"(?is)\bopen access\b(?=\s+[a-z(0-9])", "", clean)
    clean = re.sub(r"(?i)\bis\.\s+(?=[a-z])", "is ", clean)
    clean = re.sub(r"([0-9%])\.\s+\(", r"\1 (", clean)
    clean = re.sub(r"\s+([,.;:!?])", r"\1", clean)
    clean = re.sub(r"\s*\.\s*\.", ".", clean)
    clean = re.sub(
        r"^[a-z]\s+(?=(?:To|We|This|These|A|An|The|Our|In|CMR)\b)",
        "",
        clean,
    )
    clean = re.sub(r"(?m)^\s*\d{1,2}\s*$", "", clean)
    clean = re.sub(r"(?m)^\s*[a-z]\s*$", "", clean)
    clean = re.sub(r"\bOPEN ACCESS\b", "", clean)
    clean = re.sub(r"\bOriginal research\b", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s{2,}", " ", clean)
    return clean.strip()


def _normalize_keywords(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        keyword = _normalize_abstract_text(str(value or ""))
        if not keyword:
            continue
        marker = keyword.casefold()
        if marker in seen:
            continue
        seen.add(marker)
        result.append(keyword)
    return result


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _normalize_heading_label(value: str | None) -> str:
    clean = re.sub(r"\s+", " ", str(value or "").strip())
    if not clean:
        return ""
    if re.fullmatch(r"[A-Z0-9 /\-]{2,}", clean):
        words = [part.capitalize() for part in clean.lower().split(" ")]
        return " ".join(words)
    return clean[0].upper() + clean[1:] if len(clean) > 1 else clean.upper()


def _structured_abstract_seed_hash(
    *,
    abstract: str | None,
    pmid: str | None,
    doi: str | None = None,
    title: str | None = None,
    year: int | None = None,
) -> str | None:
    normalized_abstract = _normalize_abstract_text(abstract)
    normalized_pmid = _normalize_abstract_text(pmid)
    normalized_doi = _normalize_abstract_text(doi)
    normalized_title = _normalize_abstract_text(title)
    normalized_year = (
        str(year) if isinstance(year, int) and 1800 <= year <= 2100 else ""
    )
    seed = "|".join(
        [
            normalized_abstract,
            normalized_pmid,
            normalized_doi,
            normalized_title,
            normalized_year,
        ]
    )
    if (
        not normalized_abstract
        and not normalized_pmid
        and not normalized_doi
        and not normalized_title
    ):
        return None
    return _sha256_text(seed)


def _extract_json_object(text: str) -> dict[str, Any]:
    clean = str(text or "").strip()
    if clean.startswith("```"):
        clean = re.sub(r"^```(?:json)?\s*", "", clean)
        clean = re.sub(r"\s*```$", "", clean)
    match = re.search(r"\{.*\}", clean, flags=re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in model response.")
    payload = json.loads(match.group(0))
    if not isinstance(payload, dict):
        raise ValueError("Model response JSON is not an object.")
    return payload


def _canonical_structured_section_key(value: str) -> str:
    clean = re.sub(r"[\s_-]+", " ", str(value or "").strip().lower())
    if not clean:
        return ""
    if any(token in clean for token in ["intro", "background", "objective", "aim"]):
        return "introduction"
    if any(token in clean for token in ["method", "design", "approach"]):
        return "methods"
    if any(
        token in clean
        for token in [
            "trial registration",
            "registration number",
            "registration",
            "prospero",
            "clinicaltrials.gov",
            "nct",
            "isrctn",
            "crd",
        ]
    ):
        return "registration"
    if any(
        token in clean
        for token in ["result", "finding", "outcome", "observation", "analysis"]
    ):
        return "results"
    if any(token in clean for token in ["conclusion", "interpretation", "implication"]):
        return "conclusions"
    return "other"


def _structured_section_label(key: str) -> str:
    if key == "introduction":
        return "Introduction"
    if key == "methods":
        return "Methods"
    if key == "registration":
        return "Registration"
    if key == "results":
        return "Results"
    if key == "conclusions":
        return "Conclusions"
    return "Summary"


def _normalize_structured_content(value: Any) -> str:
    if isinstance(value, list):
        joined = " ".join(str(item or "").strip() for item in value)
        return _normalize_abstract_text(joined)
    return _normalize_abstract_text(str(value or ""))


def _normalize_quantitative_marker(value: str) -> str:
    clean = _normalize_abstract_text(value).lower()
    clean = clean.replace("≥", ">=").replace("≤", "<=").replace("−", "-")
    clean = clean.replace("’", "'")
    return re.sub(r"\s+", "", clean)


def _extract_quantitative_markers(text: str | None) -> list[str]:
    clean_text = _normalize_abstract_text(text)
    if not clean_text:
        return []
    patterns = [
        r"\bp\s*[<>=]\s*0?\.\d+\b",
        r"\bn\s*=\s*\d+\b",
        r"\b\d+(?:\.\d+)?\s*%",
        r"(?:>=|<=|>|<|≥|≤)\s*\d+(?:\.\d+)?",
        r"\b(?:auc|hr|or|rr|ci|r)\s*[=:]?\s*\d+(?:\.\d+)?\b",
        r"\b(?:chi\s*2|χ2|x2)\s*=\s*\d+(?:\.\d+)?\b",
    ]
    markers: list[str] = []
    seen: set[str] = set()
    for pattern in patterns:
        for match in re.finditer(pattern, clean_text, flags=re.IGNORECASE):
            marker = _normalize_quantitative_marker(str(match.group(0) or ""))
            if not marker or marker in seen:
                continue
            seen.add(marker)
            markers.append(marker)
    return markers


def _structured_abstract_quality_report(
    *, source_abstract: str, sections: list[dict[str, str]]
) -> dict[str, Any]:
    source_text = _normalize_abstract_text(source_abstract)
    output_text = _normalize_abstract_text(
        " ".join(
            _normalize_structured_content(item.get("content"))
            for item in sections
            if isinstance(item, dict)
        )
    )
    source_len = len(source_text)
    output_len = len(output_text)
    length_ratio = round((output_len / source_len), 3) if source_len > 0 else 1.0
    min_length_ratio = _structured_abstract_llm_min_length_ratio()

    source_markers = _extract_quantitative_markers(source_text)
    output_markers_blob = _normalize_quantitative_marker(output_text)
    missing_markers = [
        marker
        for marker in source_markers
        if marker and marker not in output_markers_blob
    ]
    if source_markers:
        marker_recall = round(
            (len(source_markers) - len(missing_markers)) / len(source_markers), 3
        )
    else:
        marker_recall = 1.0
    min_marker_recall = _structured_abstract_llm_min_marker_recall()

    passes_length = length_ratio >= min_length_ratio
    passes_markers = marker_recall >= min_marker_recall if source_markers else True
    return {
        "passed": bool(passes_length and passes_markers),
        "length_ratio": length_ratio,
        "min_length_ratio": min_length_ratio,
        "source_marker_count": len(source_markers),
        "marker_recall": marker_recall,
        "min_marker_recall": min_marker_recall,
        "missing_markers": missing_markers[:12],
    }


def _coerce_structured_sections(payload: dict[str, Any]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []

    section_items = payload.get("sections")
    if isinstance(section_items, list):
        for item in section_items:
            if not isinstance(item, dict):
                continue
            heading_hint = (
                item.get("heading")
                or item.get("label")
                or item.get("title")
                or item.get("key")
            )
            content = _normalize_structured_content(
                item.get("content")
                if item.get("content") is not None
                else item.get("text")
            )
            if not content:
                continue
            key = _canonical_structured_section_key(str(heading_hint or ""))
            label = _normalize_heading_label(
                str(heading_hint or "")
            ) or _structured_section_label(key or "other")
            result.append(
                {
                    "key": key or "other",
                    "label": label,
                    "content": content,
                }
            )
        if result:
            return result

    direct_fields = [
        ("Introduction", "introduction"),
        ("Background", "background"),
        ("Objective", "objective"),
        ("Objectives", "objectives"),
        ("Aims", "aims"),
        ("Methods", "methods"),
        ("Results", "results"),
        ("Main findings", "main_findings"),
        ("Conclusions", "conclusions"),
        ("Conclusion", "conclusion"),
        ("Registration", "registration"),
        ("Trial registration", "trial_registration"),
        ("Registration number", "registration_number"),
        ("PROSPERO registration", "prospero_registration"),
        ("Trial registration number", "trial_registration_number"),
        ("Summary", "summary"),
    ]
    seen: set[str] = set()
    for label, field in direct_fields:
        text_value = _normalize_structured_content(payload.get(field))
        if not text_value:
            continue
        marker = f"{label.lower()}::{text_value.lower()}"
        if marker in seen:
            continue
        seen.add(marker)
        result.append(
            {
                "key": _canonical_structured_section_key(label) or "other",
                "label": label,
                "content": text_value,
            }
        )
    return result


def _extract_inline_heading_sections(text: str | None) -> list[dict[str, str]]:
    clean_text = _normalize_abstract_text(text)
    if not clean_text:
        return []

    heading_pattern = re.compile(
        r"(?im)(?:^|(?<=[\n\r])|(?<=[.!?]\s))("
        r"background|introduction|aims?|objective|objectives|purpose|"
        r"methods?|materials and methods|study design|design|"
        r"results?|findings?|"
        r"conclusion|conclusions|discussion|"
        r"trial registration(?: number)?|registration(?: number)?|prospero registration|prospero"
        r")\s*:?\s*"
    )
    matches = list(heading_pattern.finditer(clean_text))
    if not matches:
        return []

    sections: list[dict[str, str]] = []
    leading_text = clean_text[: matches[0].start()].strip(" ;")
    if leading_text and leading_text.lower() not in {"abstract", "abstract."}:
        sections.append(
            {
                "key": "other",
                "label": "Summary",
                "content": leading_text,
            }
        )

    for index, match in enumerate(matches):
        raw_label = str(match.group(1) or "").strip()
        start = match.end()
        end = (
            matches[index + 1].start() if index + 1 < len(matches) else len(clean_text)
        )
        content = clean_text[start:end].strip(" ;")
        if not content:
            continue
        key = _canonical_structured_section_key(raw_label) or "other"
        label = _normalize_heading_label(raw_label) or _structured_section_label(key)
        sections.append({"key": key, "label": label, "content": content})
    return sections


def _extract_publication_paper_inline_subsections(
    text: str | None,
) -> tuple[str, list[dict[str, str]]]:
    clean_text = _normalize_abstract_text(text)
    if not clean_text:
        return "", []

    heading_pattern = re.compile(
        r"(?im)(?:^|(?<=[\n\r])|(?<=[.!?]\s))("
        r"what is already known(?: on this topic)?|"
        r"what this study adds|"
        r"how this study might affect research,? practice(?: or policy)?|"
        r"strengths and limitations of this study|"
        r"background|introduction|insights?|aims?|objective|objectives|purpose|"
        r"design|setting|participants?|study population|"
        r"inclusion criteria|exclusion criteria|"
        r"patient and public involvement|patient involvement|"
        r"main outcome measures?|methods?|materials and methods|study design|"
        r"statistical analysis|intervention|interventions|"
        r"normal echocardiography study in patients with raised lvfp by cmr|"
        r"non[- ]diagnostic echocardiography study in patients with raised lvfp by cmr|"
        r"further sub[- ]phenotyping with cmr|"
        r"guidelines and clinical context|"
        r"results?|findings?|"
        r"conclusion|conclusions|discussion|"
        r"funding|acknowledg(?:e)?ments?|"
        r"data availability|ethics(?: approval)?|patient consent for publication|"
        r"trial registration(?: number)?|registration(?: number)?|prospero registration|prospero"
        r")\s*:?\s*"
    )
    matches = list(heading_pattern.finditer(clean_text))
    if len(matches) < 2:
        return "", []

    sections: list[dict[str, str]] = []
    leading_text = clean_text[: matches[0].start()].strip(" ;")
    for index, match in enumerate(matches):
        raw_label = str(match.group(1) or "").strip()
        start = match.end()
        end = (
            matches[index + 1].start() if index + 1 < len(matches) else len(clean_text)
        )
        content = clean_text[start:end].strip(" ;")
        if not content:
            continue
        key = _normalize_publication_paper_section_kind(raw_label)
        label = _normalize_heading_label(raw_label) or _publication_paper_section_label(
            key
        )
        sections.append({"key": key or "section", "label": label, "content": content})
    if len(sections) < 2:
        return "", []
    return leading_text, sections


def _extract_publication_paper_leading_heading_block(
    text: str | None,
) -> dict[str, str] | None:
    clean_text = _publication_paper_content_cleanup(text)
    if len(clean_text) < 24:
        return None
    match = re.match(
        r"(?is)^("
        r"what is already known(?: on this topic)?|"
        r"what this study adds|"
        r"how this study might affect research,? practice(?: or policy)?|"
        r"strengths and limitations of this study|"
        r"background|introduction|insights?|aims?|objective|objectives|purpose|"
        r"design|setting|participants?|study population|"
        r"inclusion criteria|exclusion criteria|"
        r"patient and public involvement|patient involvement|"
        r"main outcome measures?|methods?|materials and methods|study design|"
        r"statistical analysis|intervention|interventions|"
        r"normal echocardiography study in patients with raised lvfp by cmr|"
        r"non[- ]diagnostic echocardiography study in patients with raised lvfp by cmr|"
        r"further sub[- ]phenotyping with cmr|"
        r"guidelines and clinical context|"
        r"results?|findings?|"
        r"conclusion|conclusions|discussion|"
        r"funding|acknowledg(?:e)?ments?|contributors|"
        r"data availability(?: statement)?|"
        r"competing interests?|conflicts? of interest|"
        r"ethics(?: approval)?|patient consent for publication|provenance and peer review|"
        r"trial registration(?: number)?|registration(?: number)?|prospero registration|prospero"
        r")\s*:?\s+(.*)$",
        clean_text,
    )
    if not match:
        return None
    raw_label = str(match.group(1) or "").strip()
    content = _publication_paper_content_cleanup(match.group(2))
    if len(content) < 12:
        return None
    key = _normalize_publication_paper_section_kind(raw_label)
    label = _normalize_heading_label(raw_label) or _publication_paper_section_label(key)
    return {"key": key, "label": label, "content": content}


def _fallback_structured_sections(
    abstract: str | None,
) -> tuple[str, list[dict[str, str]]]:
    text = _normalize_abstract_text(abstract)
    if not text:
        return "UNAVAILABLE", []

    heading_sections = _extract_inline_heading_sections(text)
    if heading_sections:
        heading_keys = {item.get("key") for item in heading_sections}
        imrad_ready = {
            "introduction",
            "methods",
            "results",
            "conclusions",
        }.issubset(heading_keys)
        return ("IMRAD" if imrad_ready else "HEADING_BASED"), heading_sections

    sentences = _split_sentences(text)
    if not sentences:
        return (
            "STRUCTURED_PARAGRAPHS",
            [
                {
                    "key": "other",
                    "label": "Summary",
                    "content": text,
                }
            ],
        )

    buckets = min(4, max(1, len(sentences)))
    bucketed: list[list[str]] = [[] for _ in range(buckets)]
    total = len(sentences)
    for index, sentence in enumerate(sentences):
        position = min(buckets - 1, int((index * buckets) / max(1, total)))
        bucketed[position].append(sentence)

    section_keys = ["introduction", "methods", "results", "conclusions"]
    sections: list[dict[str, str]] = []
    for index, chunk in enumerate(bucketed):
        content = _normalize_abstract_text(" ".join(chunk))
        if not content:
            continue
        key = section_keys[min(index, len(section_keys) - 1)]
        sections.append(
            {
                "key": key,
                "label": _structured_section_label(key),
                "content": content,
            }
        )
    return "STRUCTURED_PARAGRAPHS", sections


def _build_structured_abstract_prompt(
    *, title: str, journal: str, year: int | None, abstract: str
) -> str:
    year_text = str(year) if isinstance(year, int) else "Not available"
    return (
        "You are structuring a publication abstract for UI display.\n"
        "Return JSON only (no markdown, no commentary).\n"
        "The output must follow this schema exactly:\n"
        "{\n"
        '  "format": "HEADING_BASED" | "IMRAD" | "STRUCTURED_PARAGRAPHS",\n'
        '  "sections": [\n'
        "    {\n"
        '      "heading": "<heading from source when available>",\n'
        '      "content": "<section text>"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Rules:\n"
        "1) Use extractive rewriting only: do not invent, infer, or add facts not present in source.\n"
        "2) Preserve quantitative details exactly (n=, p-values, %, AUC, CI, hazard/risk ratios, thresholds).\n"
        "3) If source headings exist (e.g., Aims, Background, Methods), keep them.\n"
        "4) If headings are absent, infer best-effort section headings.\n"
        "5) You are not restricted to 4 sections; include additional sections when the source supports them.\n"
        "6) If trial/PROSPERO registration details are present, include a dedicated Registration section.\n\n"
        f"TITLE: {title}\n"
        f"JOURNAL: {journal}\n"
        f"YEAR: {year_text}\n"
        f"ABSTRACT: {abstract}\n"
    )


def _generate_structured_abstract_with_model(
    *, title: str, journal: str, year: int | None, abstract: str
) -> tuple[str, list[dict[str, str]], str]:
    prompt = _build_structured_abstract_prompt(
        title=title, journal=journal, year=year, abstract=abstract
    )
    preferred = _structured_abstract_model()
    fallback = _structured_abstract_fallback_model()
    candidates = [preferred]
    if fallback and fallback not in candidates:
        candidates.append(fallback)

    last_error: Exception | None = None
    for model_name in candidates:
        try:
            response = create_response(model=model_name, input=prompt)
            payload = _extract_json_object(str(response.output_text or ""))
            sections = _coerce_structured_sections(payload)
            if not sections:
                raise ValueError("No structured sections found in model output.")
            format_value = str(payload.get("format") or "").strip().upper()
            if format_value not in {"HEADING_BASED", "IMRAD", "STRUCTURED_PARAGRAPHS"}:
                format_value = (
                    "HEADING_BASED"
                    if any(
                        _normalize_heading_label(section.get("label"))
                        not in {"Introduction", "Methods", "Results", "Conclusions"}
                        for section in sections
                    )
                    else ("IMRAD" if len(sections) >= 3 else "STRUCTURED_PARAGRAPHS")
                )
            return format_value, sections, model_name
        except Exception as exc:
            last_error = exc
            continue
    if last_error is not None:
        raise last_error
    raise RuntimeError("Structured abstract model returned no response.")


def _empty_structured_abstract_payload() -> dict[str, Any]:
    return {
        "format": "UNAVAILABLE",
        "sections": [],
        "keywords": [],
        "source_abstract": None,
        "metadata": {
            "parser_version": STRUCTURED_ABSTRACT_CACHE_VERSION,
            "generation_method": "empty",
        },
    }


def _build_structured_abstract_payload(
    *, publication: dict[str, Any]
) -> tuple[dict[str, Any], str | None]:
    title = _normalize_abstract_text(str(publication.get("title") or ""))
    journal = _normalize_abstract_text(str(publication.get("journal") or ""))
    year = _safe_int(publication.get("year"))
    doi = _normalize_doi(publication.get("doi"))
    pmid = _resolve_pubmed_pmid(
        pmid=_normalize_pmid(publication.get("pmid")),
        doi=doi,
        title=title,
        year=year,
    )
    abstract = _normalize_abstract_text(publication.get("abstract"))
    publication_keywords = _normalize_keywords(publication.get("keywords_json"))
    pubmed_abstract, pubmed_sections, pubmed_keywords = (None, [], [])
    if pmid:
        pubmed_abstract, pubmed_sections, pubmed_keywords = (
            _extract_structured_abstract_from_pubmed(pmid)
        )
        if pubmed_abstract:
            abstract = _normalize_abstract_text(pubmed_abstract)
    effective_keywords = _normalize_keywords(pubmed_keywords) or publication_keywords
    if not abstract:
        empty = _empty_structured_abstract_payload()
        empty["keywords"] = effective_keywords
        return empty, None

    source_hash = _sha256_text(abstract)
    generated_at = _utcnow().isoformat()
    parser_version = STRUCTURED_ABSTRACT_CACHE_VERSION

    if pubmed_sections:
        return (
            {
                "format": "HEADING_BASED",
                "sections": pubmed_sections,
                "keywords": effective_keywords,
                "source_abstract": abstract,
                "metadata": {
                    "parser_version": parser_version,
                    "source_abstract_sha256": source_hash,
                    "generation_method": "pubmed",
                    "pmid": pmid,
                    "generated_at": generated_at,
                },
            },
            None,
        )

    model_fallback: dict[str, Any] | None = None
    if _structured_abstract_llm_enabled():
        try:
            model_format, model_sections, model_name = (
                _generate_structured_abstract_with_model(
                    title=title,
                    journal=journal,
                    year=year,
                    abstract=abstract,
                )
            )
            quality = _structured_abstract_quality_report(
                source_abstract=abstract,
                sections=model_sections,
            )
            if bool(quality.get("passed")):
                return (
                    {
                        "format": model_format,
                        "sections": model_sections,
                        "keywords": effective_keywords,
                        "source_abstract": abstract,
                        "metadata": {
                            "parser_version": parser_version,
                            "source_abstract_sha256": source_hash,
                            "generation_method": "model_extractive",
                            "generated_at": generated_at,
                            "title": title,
                            "journal": journal,
                            "year": year,
                            "quality_guard": quality,
                        },
                    },
                    model_name,
                )
            model_fallback = {
                "reason": "quality_guard_failed",
                "model_name": model_name,
                "quality_guard": quality,
            }
            logger.warning(
                "structured_abstract_model_quality_guard_failed",
                extra={
                    "publication_title": title[:180],
                    "year": year,
                    "length_ratio": quality.get("length_ratio"),
                    "marker_recall": quality.get("marker_recall"),
                },
            )
        except Exception as exc:
            model_fallback = {
                "reason": f"model_error:{type(exc).__name__}",
            }

    fallback_format, fallback_sections = _fallback_structured_sections(abstract)
    fallback_metadata: dict[str, Any] = {
        "parser_version": parser_version,
        "source_abstract_sha256": source_hash,
        "generation_method": "deterministic",
        "generated_at": generated_at,
        "title": title,
        "journal": journal,
        "year": year,
    }
    if model_fallback is not None:
        fallback_metadata["model_fallback"] = model_fallback
    return (
        {
            "format": fallback_format,
            "sections": fallback_sections,
            "keywords": effective_keywords,
            "source_abstract": abstract,
            "metadata": fallback_metadata,
        },
        None,
    )


def _structured_abstract_view_payload(
    *,
    row: PublicationStructuredAbstractCache | None,
    abstract: str | None,
    pmid: str | None,
    doi: str | None = None,
    title: str | None = None,
    year: int | None = None,
) -> tuple[dict[str, Any], str, datetime | None, str | None]:
    normalized_abstract = _normalize_abstract_text(abstract)
    source_hash = _structured_abstract_seed_hash(
        abstract=normalized_abstract,
        pmid=pmid,
        doi=doi,
        title=title,
        year=year,
    )

    if row is not None:
        payload = row.payload_json if isinstance(row.payload_json, dict) else {}
        row_hash = (
            _normalize_abstract_text(str(row.source_abstract_sha256 or "")) or None
        )
        status = _normalize_status(row.status, fallback=RUNNING_STATUS)
        computed_at = _coerce_utc_or_none(row.computed_at)
        last_error = _normalize_abstract_text(str(row.last_error or "")) or None
        if payload and row_hash == source_hash:
            return payload, status, computed_at, last_error
        if status in {RUNNING_STATUS, FAILED_STATUS} and normalized_abstract:
            fallback_format, fallback_sections = _fallback_structured_sections(
                normalized_abstract
            )
            return (
                {
                    "format": fallback_format,
                    "sections": fallback_sections,
                    "keywords": [],
                    "source_abstract": normalized_abstract,
                    "metadata": {
                        "parser_version": STRUCTURED_ABSTRACT_CACHE_VERSION,
                        "source_abstract_sha256": source_hash,
                        "generation_method": "raw_fallback",
                    },
                },
                status,
                computed_at,
                last_error,
            )

    if normalized_abstract:
        fallback_format, fallback_sections = _fallback_structured_sections(
            normalized_abstract
        )
        return (
            {
                "format": fallback_format,
                "sections": fallback_sections,
                "keywords": [],
                "source_abstract": normalized_abstract,
                "metadata": {
                    "parser_version": STRUCTURED_ABSTRACT_CACHE_VERSION,
                    "source_abstract_sha256": source_hash,
                    "generation_method": "raw_fallback",
                },
            },
            "MISSING",
            None,
            None,
        )
    return _empty_structured_abstract_payload(), "MISSING", None, None


def _normalize_publication_author_names(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for item in values:
        if isinstance(item, dict):
            raw_name = str(
                item.get("name")
                or item.get("full_name")
                or item.get("display_name")
                or ""
            ).strip()
        else:
            raw_name = str(item or "").strip()
        if not raw_name:
            continue
        marker = raw_name.casefold()
        if marker in seen:
            continue
        seen.add(marker)
        result.append(raw_name)
    return result


def _publication_file_direct_url(value: dict[str, Any]) -> str | None:
    download_url = str(value.get("download_url") or "").strip()
    if download_url:
        return download_url
    oa_url = str(value.get("oa_url") or "").strip()
    return oa_url or None


def _publication_paper_section_id(*, order: int, key: str, title: str) -> str:
    base = (
        str(key or "").strip() or str(title or "").strip() or f"section-{order + 1}"
    ).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", base).strip("-") or f"section-{order + 1}"
    return f"paper-section-{order + 1}-{slug}"


def _strip_publication_paper_heading_prefix(value: str | None) -> str:
    clean = re.sub(r"\s+", " ", str(value or "").strip())
    if not clean:
        return ""
    clean = re.sub(
        r"^(?:section\s+)?(?:\d+(?:\.\d+)*|[ivxlcdm]+)(?:[\]\).:-]|\s)+(.*)$",
        r"\1",
        clean,
        flags=re.IGNORECASE,
    )
    clean = re.sub(r"^(?:[A-Z])[\]\).:-]\s+(.*)$", r"\1", clean)
    return clean.strip()


def _normalize_publication_paper_section_kind(value: str | None) -> str:
    clean = re.sub(
        r"[\s_-]+",
        " ",
        _strip_publication_paper_heading_prefix(value).lower(),
    ).strip()
    if not clean:
        return "section"
    canonical_candidate = clean.replace(" ", "_")
    if canonical_candidate in {
        "abstract",
        "keywords",
        "key_summary_known",
        "key_summary_adds",
        "research_practice_policy",
        "clinical_perspective",
        "clinical_implications",
        "key_questions",
        "highlights",
        "central_illustration",
        "graphical_abstract",
        "tweetable_abstract",
        "lay_summary",
        "introduction",
        "methods",
        "results",
        "discussion",
        "conclusions",
        "limitations",
        "ethics",
        "data_availability",
        "funding",
        "acknowledgements",
        "author_contributions",
        "conflicts",
        "patient_involvement",
        "provenance",
        "references",
        "appendix",
        "supplementary_materials",
        "figure",
        "table",
        "registration",
        "section",
        "title",
    }:
        return canonical_candidate
    if clean.startswith("abstract"):
        return "abstract"
    if clean.startswith("keyword"):
        return "keywords"
    if any(
        token in clean
        for token in [
            "what is already known",
            "already known on this topic",
            "known on this topic",
        ]
    ):
        return "key_summary_known"
    if any(
        token in clean
        for token in ["what this study adds", "this study adds", "adds to the field"]
    ):
        return "key_summary_adds"
    if any(
        token in clean
        for token in [
            "how this study might affect",
            "research practice or policy",
            "practice or policy",
        ]
    ):
        return "research_practice_policy"
    if "clinical perspective" in clean:
        return "clinical_perspective"
    if "clinical implication" in clean:
        return "clinical_implications"
    if "key question" in clean:
        return "key_questions"
    if "insight" in clean:
        return "highlights"
    if "strengths and limitations" in clean:
        return "highlights"
    if "highlight" in clean:
        return "highlights"
    if "central illustration" in clean:
        return "central_illustration"
    if "graphical abstract" in clean:
        return "graphical_abstract"
    if "tweetable abstract" in clean:
        return "tweetable_abstract"
    if "lay summary" in clean:
        return "lay_summary"
    if any(
        token in clean
        for token in [
            "normal echocardiography study in patients with raised lvfp by cmr",
            "non diagnostic echocardiography study in patients with raised lvfp by cmr",
            "non-diagnostic echocardiography study in patients with raised lvfp by cmr",
            "further sub phenotyping with cmr",
            "further sub-phenotyping with cmr",
            "echocardiographic diagnosis in patients with high cmr lvfp",
        ]
    ):
        return "results"
    if any(
        token in clean
        for token in [
            "introduction",
            "background",
            "objective",
            "objectives",
            "aim",
            "aims",
            "purpose",
        ]
    ):
        return "introduction"
    if any(
        token in clean
        for token in [
            "methods",
            "materials and methods",
            "material and methods",
            "methodology",
            "patients and methods",
            "design",
            "study design",
            "setting",
            "main outcome measure",
            "main outcome measures",
            "patient and public involvement",
            "public involvement",
            "intervention",
            "interventions",
            "statistical analysis",
            "protocol",
            "experimental procedures",
            "approach",
        ]
    ):
        return "methods"
    if any(
        token in clean
        for token in [
            "patient and public involvement",
            "patient involvement",
            "public involvement",
        ]
    ):
        return "patient_involvement"
    if any(token in clean for token in ["results", "findings", "outcomes"]):
        return "results"
    if any(token in clean for token in ["discussion", "interpretation"]):
        return "discussion"
    if any(token in clean for token in ["conclusion", "summary"]):
        return "conclusions"
    if "limitation" in clean:
        return "limitations"
    if any(
        token in clean
        for token in ["ethics", "ethical approval", "consent", "patient consent"]
    ):
        return "ethics"
    if any(
        token in clean
        for token in ["data availability", "data sharing", "availability of data"]
    ):
        return "data_availability"
    if any(
        token in clean
        for token in ["funding", "financial support", "support statement"]
    ):
        return "funding"
    if any(
        token in clean
        for token in ["acknowledg", "author contributions", "contributors"]
    ):
        if "author contribution" in clean or "contributors" in clean:
            return "author_contributions"
        return "acknowledgements"
    if any(
        token in clean
        for token in ["conflict", "competing interest", "declaration of interest"]
    ):
        return "conflicts"
    if "provenance and peer review" in clean:
        return "provenance"
    if any(
        token in clean for token in ["reference", "bibliography", "literature cited"]
    ):
        return "references"
    if any(token in clean for token in ["appendix", "appendices"]):
        return "appendix"
    if any(
        token in clean
        for token in ["supplementary", "supporting information", "supplements"]
    ):
        return "supplementary_materials"
    if re.match(r"^(figure|fig)\b", clean):
        return "figure"
    if re.match(r"^table\b", clean):
        return "table"
    structured_key = _canonical_structured_section_key(clean)
    if structured_key and structured_key != "other":
        return structured_key
    return "section"


def _publication_paper_section_label(kind: str) -> str:
    labels = {
        "abstract": "Abstract",
        "keywords": "Keywords",
        "key_summary_known": "What is already known",
        "key_summary_adds": "What this study adds",
        "research_practice_policy": "Research, practice or policy",
        "clinical_perspective": "Clinical perspective",
        "clinical_implications": "Clinical implications",
        "key_questions": "Key questions",
        "highlights": "Highlights",
        "central_illustration": "Central illustration",
        "graphical_abstract": "Graphical abstract",
        "tweetable_abstract": "Tweetable abstract",
        "lay_summary": "Lay summary",
        "introduction": "Introduction",
        "methods": "Methods",
        "results": "Results",
        "discussion": "Discussion",
        "conclusions": "Conclusions",
        "limitations": "Limitations",
        "ethics": "Ethics",
        "data_availability": "Data availability",
        "funding": "Funding",
        "acknowledgements": "Acknowledgements",
        "author_contributions": "Author contributions",
        "conflicts": "Conflicts of interest",
        "patient_involvement": "Patient and public involvement",
        "provenance": "Provenance and peer review",
        "references": "References",
        "appendix": "Appendix",
        "supplementary_materials": "Supplementary materials",
        "figure": "Figure",
        "table": "Table",
        "registration": "Registration",
        "section": "Section",
    }
    return labels.get(kind, "Section")


def _publication_paper_title_cleanup(
    value: str | None, *, canonical_kind: str | None = None
) -> str:
    clean = _normalize_heading_label(value)
    if not clean:
        return ""
    clean = clean.strip(" :-")
    lowered = clean.casefold()
    normalized_kind = _normalize_publication_paper_section_kind(canonical_kind or clean)
    if lowered.endswith(" not applicable.") or lowered.endswith(" not applicable"):
        for prefix in (
            "patient consent for publication",
            "consent for publication",
            "ethics approval",
            "ethical approval",
            "ethics statement",
            "ethics statements",
        ):
            if lowered.startswith(prefix):
                return _normalize_heading_label(prefix)
    if normalized_kind == "ethics":
        for prefix in (
            "patient consent for publication",
            "consent for publication",
            "ethics approval",
            "ethical approval",
            "ethics statement",
            "ethics statements",
        ):
            if lowered.startswith(prefix):
                return _normalize_heading_label(prefix)
    return clean


def _is_transparent_publication_paper_wrapper_title(value: str | None) -> bool:
    clean = re.sub(r"[\s_-]+", " ", str(value or "").strip().lower()).strip()
    return clean in {"open access", "original research"}


def _publication_paper_major_map_hints_from_text(
    value: str | None,
) -> list[str]:
    clean = re.sub(
        r"[\s_-]+",
        " ",
        _strip_publication_paper_heading_prefix(value).lower(),
    ).strip()
    if not clean:
        return []
    hints: list[str] = []

    def add_hint(value: str) -> None:
        if value not in hints:
            hints.append(value)

    if any(
        token in clean
        for token in ["introduction", "background", "objective", "aim", "purpose"]
    ):
        add_hint("introduction")
    if any(
        token in clean
        for token in [
            "method",
            "design",
            "protocol",
            "statistical analysis",
            "patient involvement",
            "eligibility",
            "inclusion criteria",
            "exclusion criteria",
            "echocardiography",
            "cmr protocol",
            "study procedure",
        ]
    ):
        add_hint("methods")
    if any(
        token in clean
        for token in [
            "result",
            "finding",
            "outcome",
            "diagnostic",
            "performance",
            "characteristic",
            "comparison",
            "association",
            "predictor",
            "response",
            "survival",
            "follow-up",
            "follow up",
        ]
    ):
        add_hint("results")
    if any(
        token in clean
        for token in ["discussion", "interpretation", "clinical implication"]
    ):
        add_hint("discussion")
    if any(token in clean for token in ["conclusion", "summary conclusion"]):
        add_hint("conclusions")
    return hints


def _is_probable_publication_paper_results_transition_title(
    value: str | None,
) -> bool:
    clean = re.sub(
        r"[\s_-]+",
        " ",
        _strip_publication_paper_heading_prefix(value).lower(),
    ).strip()
    return clean in {
        "study population",
        "patient characteristics",
        "baseline characteristics",
        "cohort characteristics",
        "participant characteristics",
    }


def _publication_paper_explicit_major_heading(
    *, title: str | None, canonical_map: str | None
) -> bool:
    normalized_map = _normalize_publication_paper_section_kind(canonical_map)
    if normalized_map not in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS:
        return False
    clean = re.sub(
        r"[\s_-]+",
        " ",
        _strip_publication_paper_heading_prefix(title).lower(),
    ).strip()
    if not clean:
        return False
    if normalized_map == "introduction":
        return clean in {"introduction", "background"}
    if normalized_map == "methods":
        return clean in {
            "methods",
            "materials and methods",
            "methods and materials",
            "patients and methods",
        }
    if normalized_map == "results":
        return clean in {"results", "findings"}
    if normalized_map == "discussion":
        return clean in {"discussion", "interpretation"}
    if normalized_map == "conclusions":
        return clean in {"conclusion", "conclusions"}
    return False


def _infer_publication_paper_section_canonical_map(
    *,
    title: str | None,
    canonical_kind: str | None,
    content: str | None,
    current_main_kind: str | None,
    future_titles: list[str],
) -> str:
    normalized_kind = _normalize_publication_paper_section_kind(canonical_kind or title)
    if normalized_kind in {"abstract", "keywords"}:
        return normalized_kind
    if normalized_kind in PUBLICATION_PAPER_EDITORIAL_SECTION_KINDS:
        return normalized_kind
    if normalized_kind in PUBLICATION_PAPER_METADATA_SECTION_KINDS:
        return normalized_kind
    if normalized_kind in PUBLICATION_PAPER_ASSET_SECTION_KINDS:
        return normalized_kind
    if normalized_kind in PUBLICATION_PAPER_REFERENCE_SECTION_KINDS:
        return normalized_kind
    if normalized_kind in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS:
        return normalized_kind
    if normalized_kind == "limitations":
        return "discussion"
    title_hints = _publication_paper_major_map_hints_from_text(title)
    if title_hints:
        return title_hints[0]
    if (
        current_main_kind == "methods"
        and _is_probable_publication_paper_results_transition_title(title)
        and next(
            (
                hint
                for candidate in future_titles
                for hint in _publication_paper_major_map_hints_from_text(candidate)
            ),
            None,
        )
        == "results"
    ):
        return "results"
    if current_main_kind in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS:
        return current_main_kind
    content_hints = _publication_paper_major_map_hints_from_text(content)
    if content_hints:
        return content_hints[0]
    return normalized_kind


def _publication_paper_major_section_key(
    *,
    canonical_map: str | None,
    canonical_kind: str | None,
    document_zone: str | None,
) -> str:
    normalized_map = _normalize_publication_paper_section_kind(canonical_map)
    normalized_kind = _normalize_publication_paper_section_kind(canonical_kind)
    normalized_zone = str(document_zone or "").strip().lower()
    if normalized_map in {"abstract", "keywords"}:
        return "overview"
    if normalized_kind in PUBLICATION_PAPER_EDITORIAL_SECTION_KINDS:
        return "overview"
    if normalized_kind in PUBLICATION_PAPER_METADATA_SECTION_KINDS:
        return "article_information"
    if normalized_kind in PUBLICATION_PAPER_REFERENCE_SECTION_KINDS:
        return "references"
    if normalized_kind in PUBLICATION_PAPER_ASSET_SECTION_KINDS:
        return "assets"
    if normalized_map in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS:
        return normalized_map
    if normalized_map == "discussion" and normalized_kind == "limitations":
        return "discussion"
    if normalized_zone == "front":
        return "overview"
    if normalized_zone == "back":
        return "article_information"
    return normalized_map if normalized_map != "section" else "main_text"


def _publication_paper_section_role(
    *,
    canonical_map: str | None,
    canonical_kind: str | None,
    document_zone: str | None,
    is_explicit_major_heading: bool,
    parent_id: str | None,
    level: int,
) -> str:
    normalized_map = _normalize_publication_paper_section_kind(canonical_map)
    normalized_kind = _normalize_publication_paper_section_kind(canonical_kind)
    normalized_zone = str(document_zone or "").strip().lower()
    if normalized_kind in PUBLICATION_PAPER_METADATA_SECTION_KINDS:
        return "metadata"
    if normalized_kind in PUBLICATION_PAPER_REFERENCE_SECTION_KINDS:
        return "reference"
    if normalized_kind in PUBLICATION_PAPER_ASSET_SECTION_KINDS:
        return "asset"
    if normalized_map == "abstract":
        return "major"
    if (
        normalized_kind in PUBLICATION_PAPER_EDITORIAL_SECTION_KINDS
        or normalized_zone == "front"
    ):
        return "summary_box"
    if is_explicit_major_heading:
        return "major"
    if parent_id or int(level or 1) > 1:
        return "subsection"
    return "section"


def _publication_paper_journal_section_family(
    *, title: str | None, journal: str | None
) -> str | None:
    clean_title = re.sub(
        r"[\s_-]+",
        " ",
        _strip_publication_paper_heading_prefix(title).lower(),
    ).strip()
    clean_journal = re.sub(r"\s+", " ", str(journal or "").lower()).strip()
    if not clean_title:
        return None
    if "bmj" in clean_journal:
        if clean_title in {
            "what is already known on this topic",
            "what this study adds",
            "how this study might affect research practice or policy",
            "strengths and limitations of this study",
        }:
            return "bmj_summary_box"
        if clean_title in {"patient and public involvement", "patient involvement"}:
            return "bmj_house_style"
    return None


def _split_publication_paper_editorial_overflow(
    *,
    title: str | None,
    canonical_kind: str | None,
    journal: str | None,
    content: str | None,
) -> tuple[str, str | None, str | None]:
    clean_content = _publication_paper_content_cleanup(content)
    if not clean_content:
        return "", None, None
    normalized_kind = _normalize_publication_paper_section_kind(canonical_kind or title)
    if normalized_kind not in PUBLICATION_PAPER_EDITORIAL_SECTION_KINDS:
        return clean_content, None, None
    if (
        _publication_paper_journal_section_family(title=title, journal=journal)
        != "bmj_summary_box"
    ):
        return clean_content, None, None
    sentences = _split_sentences(clean_content)
    if len(sentences) < 4:
        return clean_content, None, None

    overflow_starters = (
        "despite its potential",
        "yet, the extent",
        "yet the extent",
        "this gap is particularly",
        "for this study",
        "we hypothesised",
        "we hypothesized",
        "the main objective",
        "the main aim",
    )
    for index in range(2, len(sentences)):
        leading = _publication_paper_content_cleanup(" ".join(sentences[:index]))
        trailing = _publication_paper_content_cleanup(" ".join(sentences[index:]))
        if len(leading) < 120 or len(trailing) < 160:
            continue
        trailing_hints = _publication_paper_major_map_hints_from_text(trailing)
        if not trailing_hints:
            continue
        trailing_hint = trailing_hints[0]
        if trailing_hint not in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS:
            continue
        sentence_marker = sentences[index].strip().lower()
        if not (
            re.match(r"^[a-z]", sentence_marker)
            or any(sentence_marker.startswith(prefix) for prefix in overflow_starters)
        ):
            continue
        return leading, trailing, trailing_hint
    return clean_content, None, None


def _refine_publication_paper_sections(
    sections: list[dict[str, Any]],
    *,
    journal: str | None = None,
) -> list[dict[str, Any]]:
    ordered_sections = [
        dict(section)
        for section in sorted(
            [item for item in sections if isinstance(item, dict)],
            key=lambda item: int(_safe_int(item.get("order")) or 0),
        )
    ]
    if not ordered_sections:
        return []
    existing_child_parent_ids = {
        str(section.get("parent_id") or "").strip()
        for section in ordered_sections
        if str(section.get("parent_id") or "").strip()
    }
    refined_sections: list[dict[str, Any]] = []
    current_main_kind: str | None = None
    explicit_main_section_id_by_map: dict[str, str] = {}
    for index, section in enumerate(ordered_sections):
        refined = dict(section)
        raw_title = str(
            refined.get("title")
            or refined.get("label_normalized")
            or refined.get("raw_label")
            or ""
        ).strip()
        raw_label = str(refined.get("raw_label") or raw_title).strip()
        section_id = (
            str(refined.get("id") or "").strip() or f"paper-section-refined-{index + 1}"
        )
        canonical_kind = _normalize_publication_paper_section_kind(
            refined.get("canonical_kind") or refined.get("kind") or raw_title
        )
        document_zone = (
            str(refined.get("document_zone") or "").strip().lower() or "body"
        )
        if document_zone == "body":
            raw_title_marker = re.sub(r"[\s_-]+", " ", raw_title.casefold()).strip()
            if raw_title_marker in {
                "patient and public involvement",
                "patient involvement",
                "public involvement",
            }:
                canonical_kind = "methods"
        if document_zone == "back":
            raw_title_marker = re.sub(r"[\s_-]+", " ", raw_title.casefold()).strip()
            if raw_title_marker in {
                "patient and public involvement",
                "patient involvement",
                "public involvement",
            }:
                canonical_kind = "patient_involvement"
        clean_title = _publication_paper_title_cleanup(
            raw_title or raw_label,
            canonical_kind=canonical_kind,
        ) or _publication_paper_section_label(canonical_kind)
        clean_raw_label = (
            _publication_paper_title_cleanup(
                raw_label or clean_title,
                canonical_kind=canonical_kind,
            )
            or clean_title
        )
        future_titles = [
            str(
                candidate.get("raw_label")
                or candidate.get("title")
                or candidate.get("label_normalized")
                or ""
            ).strip()
            for candidate in ordered_sections[index + 1 : index + 4]
            if isinstance(candidate, dict)
        ]
        canonical_map = _infer_publication_paper_section_canonical_map(
            title=clean_title,
            canonical_kind=canonical_kind,
            content=refined.get("content"),
            current_main_kind=current_main_kind,
            future_titles=future_titles,
        )
        major_section_key = _publication_paper_major_section_key(
            canonical_map=canonical_map,
            canonical_kind=canonical_kind,
            document_zone=document_zone,
        )
        is_explicit_major_heading = _publication_paper_explicit_major_heading(
            title=clean_title or clean_raw_label,
            canonical_map=canonical_map,
        )
        refined["id"] = section_id
        refined["title"] = clean_title
        refined["raw_label"] = clean_raw_label or None
        refined["label_original"] = clean_raw_label or None
        refined["label_normalized"] = clean_title
        refined["kind"] = canonical_kind
        refined["canonical_kind"] = canonical_kind
        refined["canonical_map"] = canonical_map
        refined["section_type"] = _publication_paper_section_type(canonical_kind)
        refined["document_zone"] = document_zone
        refined["journal_section_family"] = _publication_paper_journal_section_family(
            title=clean_title,
            journal=journal,
        )

        if canonical_map in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS:
            explicit_parent_id = explicit_main_section_id_by_map.get(canonical_map)
            if is_explicit_major_heading:
                refined["parent_id"] = None
                refined["level"] = 1
                explicit_main_section_id_by_map[canonical_map] = section_id
            elif explicit_parent_id:
                refined["parent_id"] = explicit_parent_id
                refined["level"] = max(2, int(_safe_int(refined.get("level")) or 2))
            else:
                refined["parent_id"] = None
                refined["level"] = max(2, int(_safe_int(refined.get("level")) or 2))
            current_main_kind = canonical_map
        elif (
            canonical_kind in PUBLICATION_PAPER_EDITORIAL_SECTION_KINDS
            or document_zone == "front"
        ):
            refined["parent_id"] = None
            refined["level"] = 1
            current_main_kind = None
        elif canonical_kind in (
            *PUBLICATION_PAPER_METADATA_SECTION_KINDS,
            *PUBLICATION_PAPER_REFERENCE_SECTION_KINDS,
            *PUBLICATION_PAPER_ASSET_SECTION_KINDS,
        ):
            refined["parent_id"] = None
            refined["level"] = 1
            current_main_kind = None
        refined["major_section_key"] = major_section_key
        refined["section_role"] = _publication_paper_section_role(
            canonical_map=canonical_map,
            canonical_kind=canonical_kind,
            document_zone=document_zone,
            is_explicit_major_heading=is_explicit_major_heading,
            parent_id=str(refined.get("parent_id") or "").strip() or None,
            level=int(_safe_int(refined.get("level")) or 1),
        )
        refined_sections.append(refined)

        if section_id in existing_child_parent_ids:
            continue
        can_split_inline = (
            canonical_map == "abstract"
            or refined["section_role"] == "major"
            or document_zone == "front"
        )
        if not can_split_inline:
            continue
        leading_text, inline_subsections = (
            _extract_publication_paper_inline_subsections(refined.get("content"))
        )
        if len(inline_subsections) < 2:
            continue
        refined["content"] = leading_text
        refined["word_count"] = len(
            re.findall(r"[A-Za-z0-9][A-Za-z0-9'/-]*", leading_text)
        )
        refined["paragraph_count"] = len(
            _publication_paper_section_paragraphs(leading_text)
        )
        for child_index, inline_section in enumerate(inline_subsections):
            child_title = (
                _publication_paper_title_cleanup(
                    inline_section.get("label"),
                    canonical_kind=inline_section.get("key"),
                )
                or _normalize_heading_label(inline_section.get("label"))
                or "Subsection"
            )
            child_kind = _normalize_publication_paper_section_kind(
                inline_section.get("key") or child_title
            )
            child_map = _normalize_publication_paper_section_kind(
                child_kind or child_title
            )
            child_slug = (
                re.sub(r"[^a-z0-9]+", "-", child_title.lower()).strip("-")
                or f"subsection-{child_index + 1}"
            )
            child_content = _publication_paper_content_cleanup(
                inline_section.get("content")
            )
            child_section = {
                "id": f"{section_id}-inline-{child_index + 1}-{child_slug}",
                "title": child_title,
                "raw_label": child_title,
                "label_original": child_title,
                "label_normalized": child_title,
                "kind": child_kind,
                "canonical_kind": child_kind,
                "section_type": _publication_paper_section_type(child_kind),
                "canonical_map": child_map,
                "content": child_content,
                "source": refined.get("source"),
                "source_parser": refined.get("source_parser"),
                "order": 0,
                "page_start": refined.get("page_start"),
                "page_end": refined.get("page_end"),
                "level": max(2, int(_safe_int(refined.get("level")) or 1) + 1),
                "parent_id": section_id,
                "bounding_boxes": list(refined.get("bounding_boxes") or []),
                "confidence": refined.get("confidence"),
                "is_generated_heading": False,
                "word_count": len(
                    re.findall(r"[A-Za-z0-9][A-Za-z0-9'/-]*", child_content)
                ),
                "paragraph_count": len(
                    _publication_paper_section_paragraphs(child_content)
                ),
                "document_zone": document_zone,
                "section_role": "subsection",
                "journal_section_family": refined.get("journal_section_family"),
                "major_section_key": major_section_key,
            }
            refined_sections.append(child_section)

    for order, section in enumerate(refined_sections):
        section["order"] = order
    return _dedupe_publication_paper_sections(refined_sections)


def _dedupe_publication_paper_sections(
    sections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    child_parent_ids = {
        str(section.get("parent_id") or "").strip()
        for section in sections
        if str(section.get("parent_id") or "").strip()
    }
    seen_leaf_markers: dict[str, dict[str, Any]] = {}
    deduped_sections: list[dict[str, Any]] = []
    for section in sections:
        section_id = str(section.get("id") or "").strip()
        title_marker = _normalize_publication_pdf_search_text(
            section.get("raw_label") or section.get("title")
        )
        content_marker = _normalize_publication_pdf_search_text(section.get("content"))
        is_leaf = bool(section_id) and section_id not in child_parent_ids
        if is_leaf and title_marker and len(content_marker) >= 24:
            marker = f"{title_marker}|{content_marker}"
            previous_section = seen_leaf_markers.get(marker)
            if previous_section:
                previous_zone = str(previous_section.get("document_zone") or "").strip()
                current_zone = str(section.get("document_zone") or "").strip()
                previous_map = _normalize_publication_paper_section_kind(
                    previous_section.get("canonical_map")
                    or previous_section.get("canonical_kind")
                    or previous_section.get("title")
                )
                current_map = _normalize_publication_paper_section_kind(
                    section.get("canonical_map")
                    or section.get("canonical_kind")
                    or section.get("title")
                )
                if (
                    previous_zone == "front"
                    and current_zone == "body"
                    and (
                        current_map == "introduction"
                        or title_marker
                        in {
                            "objective",
                            "objectives",
                            "aim",
                            "aims",
                            "purpose",
                            "background",
                        }
                    )
                    and previous_map in {"abstract", "introduction"}
                ):
                    continue
            else:
                seen_leaf_markers[marker] = dict(section)
        deduped = dict(section)
        deduped["order"] = len(deduped_sections)
        deduped_sections.append(deduped)
    return deduped_sections


def _publication_paper_section_paragraphs(value: str) -> list[str]:
    clean = (
        _publication_paper_content_cleanup(value)
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .strip()
    )
    if not clean:
        return []
    paragraphs = [
        _normalize_abstract_text(part)
        for part in re.split(r"\n{2,}", clean)
        if _normalize_abstract_text(part)
    ]
    if paragraphs:
        return paragraphs
    normalized = _normalize_abstract_text(clean)
    return [normalized] if normalized else []


def _publication_paper_section_type(kind: str | None) -> str:
    normalized_kind = _normalize_publication_paper_section_kind(kind)
    if normalized_kind in PUBLICATION_PAPER_EDITORIAL_SECTION_KINDS:
        return "editorial"
    if normalized_kind in PUBLICATION_PAPER_METADATA_SECTION_KINDS:
        return "metadata"
    if normalized_kind in PUBLICATION_PAPER_ASSET_SECTION_KINDS:
        return "asset"
    if normalized_kind in PUBLICATION_PAPER_REFERENCE_SECTION_KINDS:
        return "reference"
    if normalized_kind == "title":
        return "canonical"
    return "canonical"


def _serialize_publication_paper_section(
    *,
    order: int,
    title: str | None,
    canonical_kind: str | None,
    content: str | None,
    source: str,
    raw_label: str | None = None,
    page_start: int | None = None,
    page_end: int | None = None,
    level: int = 1,
    parent_id: str | None = None,
    allow_empty: bool = False,
    is_generated_heading: bool = False,
    document_zone: str | None = None,
    section_role: str | None = None,
    journal_section_family: str | None = None,
    major_section_key: str | None = None,
) -> dict[str, Any] | None:
    normalized_content = _publication_paper_content_cleanup(content)
    if not normalized_content and not allow_empty:
        return None
    normalized_kind = _normalize_publication_paper_section_kind(
        canonical_kind or raw_label or title or ""
    )
    normalized_title = _normalize_heading_label(
        title or raw_label or ""
    ) or _publication_paper_section_label(normalized_kind)
    normalized_raw_label = (
        _normalize_heading_label(raw_label or normalized_title) or None
    )
    paragraph_count = len(_publication_paper_section_paragraphs(normalized_content))
    word_count = len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'/-]*", normalized_content))
    section_type = _publication_paper_section_type(normalized_kind)
    return {
        "id": _publication_paper_section_id(
            order=order, key=normalized_kind, title=normalized_title
        ),
        "title": normalized_title,
        "raw_label": normalized_raw_label,
        "label_original": normalized_raw_label,
        "label_normalized": normalized_title,
        "kind": normalized_kind,
        "canonical_kind": normalized_kind,
        "section_type": section_type,
        "canonical_map": normalized_kind,
        "content": normalized_content,
        "source": source,
        "source_parser": source,
        "order": order,
        "page_start": page_start,
        "page_end": page_end,
        "level": max(1, int(level or 1)),
        "parent_id": parent_id,
        "bounding_boxes": [],
        "confidence": None,
        "is_generated_heading": bool(is_generated_heading),
        "word_count": word_count,
        "paragraph_count": paragraph_count,
        "document_zone": str(document_zone or "").strip() or None,
        "section_role": str(section_role or "").strip() or None,
        "journal_section_family": str(journal_section_family or "").strip() or None,
        "major_section_key": str(major_section_key or "").strip() or None,
    }


def _build_publication_paper_sections(
    *, structured_abstract_payload: dict[str, Any], abstract: str | None
) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    raw_sections = (
        structured_abstract_payload.get("sections")
        if isinstance(structured_abstract_payload, dict)
        else []
    )
    if isinstance(raw_sections, list):
        for index, item in enumerate(raw_sections):
            if not isinstance(item, dict):
                continue
            title = _normalize_heading_label(str(item.get("label") or "")) or "Summary"
            kind = (
                _canonical_structured_section_key(str(item.get("key") or ""))
                or "section"
            )
            content = _normalize_structured_content(item.get("content"))
            if not content:
                continue
            serialized = _serialize_publication_paper_section(
                order=index,
                title=title,
                raw_label=title,
                canonical_kind=kind,
                content=content,
                source="structured_abstract",
                is_generated_heading=False,
            )
            if serialized is not None:
                sections.append(serialized)
    if sections:
        return sections

    normalized_abstract = _normalize_abstract_text(abstract)
    if not normalized_abstract:
        return []
    serialized = _serialize_publication_paper_section(
        order=0,
        title="Abstract",
        raw_label="Abstract",
        canonical_kind="abstract",
        content=normalized_abstract,
        source="abstract",
        is_generated_heading=False,
    )
    return [serialized] if serialized is not None else []


def _serialize_publication_paper_asset(value: dict[str, Any]) -> dict[str, Any]:
    raw_classification = str(value.get("classification") or "").strip() or None
    classification: str | None = None
    if raw_classification:
        try:
            classification = _normalize_publication_file_classification(
                raw_classification
            )
        except PublicationConsoleValidationError:
            classification = None
    classification_label = str(value.get("classification_label") or "").strip() or None
    page_start = _safe_int(value.get("page_start"))
    page_end = _safe_int(value.get("page_end"))
    asset_kind = str(value.get("asset_kind") or "").strip().lower() or None
    if not asset_kind:
        if classification == FILE_CLASSIFICATION_FIGURE:
            asset_kind = "figure"
        elif classification == FILE_CLASSIFICATION_TABLE:
            asset_kind = "table"
        elif classification == FILE_CLASSIFICATION_DATASETS:
            asset_kind = "dataset"
        else:
            asset_kind = "attachment"
    return {
        "id": f"paper-asset-{value.get('id')}",
        "file_id": str(value.get("id") or "").strip() or None,
        "file_name": str(value.get("file_name") or "").strip() or "Untitled file",
        "source": str(value.get("source") or FILE_SOURCE_USER_UPLOAD).strip()
        or FILE_SOURCE_USER_UPLOAD,
        "download_url": _publication_file_direct_url(value),
        "is_stored_locally": bool(value.get("is_stored_locally")),
        "classification": classification,
        "classification_label": classification_label,
        "is_pdf": str(value.get("file_type") or "").strip().upper() == FILE_TYPE_PDF,
        "title": str(value.get("title") or value.get("file_name") or "").strip()
        or "Untitled asset",
        "caption": str(value.get("caption") or "").strip() or None,
        "page_start": page_start,
        "page_end": page_end,
        "asset_kind": asset_kind,
        "origin": str(value.get("origin") or "file").strip() or "file",
        "source_parser": str(value.get("source_parser") or "").strip() or None,
        "coords": str(value.get("coords") or "").strip() or None,
        "graphic_coords": str(value.get("graphic_coords") or "").strip() or None,
        "image_data": str(value.get("image_data") or "").strip() or None,
        "structured_html": str(value.get("structured_html") or "").strip() or None,
    }


def _build_parsed_publication_paper_asset(
    *,
    asset_id: str,
    title: str,
    classification: str,
    caption: str | None = None,
    page_start: int | None = None,
    page_end: int | None = None,
    coords: str | None = None,
    graphic_coords: str | None = None,
    source_parser: str = STRUCTURED_PAPER_SECTION_SOURCE_GROBID,
) -> dict[str, Any]:
    normalized_classification = _normalize_publication_file_classification(
        classification
    )
    asset_kind = (
        "figure"
        if normalized_classification == FILE_CLASSIFICATION_FIGURE
        else "table"
        if normalized_classification == FILE_CLASSIFICATION_TABLE
        else "attachment"
    )
    return {
        "id": asset_id,
        "file_id": None,
        "file_name": title,
        "title": title,
        "source": PAPER_MODEL_ASSET_SOURCE_PARSED,
        "download_url": None,
        "classification": normalized_classification,
        "classification_label": FILE_CLASSIFICATION_LABELS.get(
            normalized_classification
        ),
        "is_pdf": False,
        "caption": str(caption or "").strip() or None,
        "page_start": page_start,
        "page_end": page_end,
        "asset_kind": asset_kind,
        "origin": "parsed",
        "source_parser": str(source_parser or STRUCTURED_PAPER_SECTION_SOURCE_GROBID),
        "coords": str(coords or "").strip() or None,
        "graphic_coords": str(graphic_coords or "").strip() or None,
        "image_data": None,
        "structured_html": None,
    }


def _merge_publication_paper_asset_collections(
    *,
    parsed_assets: list[dict[str, Any]],
    file_assets: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged_assets: list[dict[str, Any]] = []
    asset_index_by_key: dict[str, int] = {}
    for asset in [*parsed_assets, *file_assets]:
        if not isinstance(asset, dict):
            continue
        asset_copy = dict(asset)
        asset_key = _publication_paper_asset_dedupe_key(asset_copy)
        existing_index = asset_index_by_key.get(asset_key)
        if existing_index is None:
            asset_index_by_key[asset_key] = len(merged_assets)
            merged_assets.append(asset_copy)
            continue
        merged_assets[existing_index] = _merge_publication_paper_asset_candidate(
            merged_assets[existing_index],
            asset_copy,
        )
    return merged_assets


def _select_primary_publication_pdf(
    assets: list[dict[str, Any]],
) -> dict[str, Any] | None:
    ranked = [
        asset
        for asset in assets
        if bool(asset.get("is_pdf"))
        and asset.get("download_url")
        and (
            str(asset.get("source") or "") != FILE_SOURCE_OA_LINK
            or bool(asset.get("is_stored_locally"))
        )
    ]
    if not ranked:
        return None

    def _priority(asset: dict[str, Any]) -> tuple[int, int]:
        source = str(asset.get("source") or "")
        classification = str(asset.get("classification") or "")
        if source == FILE_SOURCE_OA_LINK:
            return (0, 0)
        if classification == FILE_CLASSIFICATION_PUBLISHED_MANUSCRIPT:
            return (1, 0)
        return (2, 0)

    ranked.sort(key=_priority)
    return ranked[0]


def _publication_paper_seed_hash(
    *,
    publication: dict[str, Any],
    structured_abstract_payload: dict[str, Any],
    structured_abstract_status: str,
    files: list[dict[str, Any]],
) -> str:
    seed_payload = {
        "publication": publication,
        "structured_abstract_status": structured_abstract_status,
        "structured_abstract": structured_abstract_payload,
        "files": files,
        "parser_version": STRUCTURED_PAPER_CACHE_VERSION,
    }
    return _sha256_text(json.dumps(seed_payload, sort_keys=True, default=str))


def _publication_paper_component_summary(
    *,
    sections: list[dict[str, Any]],
    figures: list[dict[str, Any]],
    tables: list[dict[str, Any]],
    datasets: list[dict[str, Any]],
    attachments: list[dict[str, Any]],
    references: list[dict[str, Any]],
) -> dict[str, Any]:
    section_kinds = Counter(
        str(section.get("canonical_kind") or section.get("kind") or "section")
        for section in sections
        if isinstance(section, dict)
    )
    return {
        "section_count": len(sections),
        "full_text_section_count": sum(
            1
            for section in sections
            if str(section.get("source") or "").strip()
            in STRUCTURED_PAPER_FULL_TEXT_SECTION_SOURCES
        ),
        "reference_count": len(references),
        "figure_asset_count": len(figures),
        "table_asset_count": len(tables),
        "dataset_asset_count": len(datasets),
        "attachment_count": len(attachments),
        "section_kind_counts": dict(section_kinds),
    }


def _publication_paper_outline_group_for_section(section: dict[str, Any]) -> str:
    major_section_key = str(section.get("major_section_key") or "").strip().lower()
    if major_section_key in {"overview", "article_information", "references", "assets"}:
        return {
            "overview": "overview",
            "article_information": "article_information",
            "references": "references",
            "assets": "assets",
        }[major_section_key]
    if major_section_key in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS:
        return "main_text"
    section_type = str(section.get("section_type") or "").strip().lower()
    canonical_map = _normalize_publication_paper_section_kind(
        str(section.get("canonical_map") or section.get("canonical_kind") or "")
    )
    if canonical_map in {"abstract", "keywords"} or section_type == "editorial":
        return "overview"
    if section_type == "metadata":
        return "article_information"
    if section_type == "reference" or canonical_map == "references":
        return "references"
    if section_type == "asset" or canonical_map in {
        "appendix",
        "supplementary_materials",
        "figure",
        "table",
    }:
        return "assets"
    return "main_text"


def _publication_paper_outline_asset_group(
    asset: dict[str, Any],
) -> tuple[str, str]:
    classification = _normalize_publication_file_classification(
        str(asset.get("classification") or "").strip() or None
    )
    if classification == FILE_CLASSIFICATION_FIGURE:
        return "outline-group-assets-figures", "Figures"
    if classification == FILE_CLASSIFICATION_TABLE:
        return "outline-group-assets-tables", "Tables"
    if classification == FILE_CLASSIFICATION_DATASETS:
        return "outline-group-assets-datasets", "Datasets"
    if str(asset.get("source") or "").strip() == FILE_SOURCE_SUPPLEMENTARY_LINK:
        return "outline-group-assets-supplementary", "Supplementary files"
    return "outline-group-assets-files", "Additional files"


def _build_publication_paper_outline(
    *,
    publication: dict[str, Any],
    sections: list[dict[str, Any]],
    figures: list[dict[str, Any]],
    tables: list[dict[str, Any]],
    datasets: list[dict[str, Any]],
    attachments: list[dict[str, Any]],
    references: list[dict[str, Any]],
    page_count: int | None,
) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    node_by_id: dict[str, dict[str, Any]] = {}
    section_node_id_by_section_id: dict[str, str] = {}
    section_group_by_section_id: dict[str, str] = {}
    group_children: dict[str, list[dict[str, Any]]] = {
        group_id: [] for group_id, _ in PUBLICATION_PAPER_OUTLINE_GROUPS
    }
    asset_group_children: dict[str, list[dict[str, Any]]] = {}
    section_level_stack: dict[str, dict[int, str]] = {
        group_id: {} for group_id, _ in PUBLICATION_PAPER_OUTLINE_GROUPS
    }
    first_section = sections[0] if sections else None
    first_page = (
        _safe_int(first_section.get("page_start"))
        if isinstance(first_section, dict)
        else None
    )
    title_page = first_page or (1 if page_count else None)
    title_label = str(publication.get("title") or "").strip() or "Title"
    group_children["overview"].append(
        {
            "id": "outline-node-title",
            "parent_id": "outline-group-overview",
            "label_original": title_label,
            "label_normalized": "Title",
            "section_type": "canonical",
            "canonical_map": "title",
            "level": 2,
            "order_index": 0,
            "page_start": title_page,
            "page_end": title_page,
            "bounding_boxes": [],
            "text_content": title_label,
            "confidence": 1.0,
            "source_parser": "paper_model",
            "is_generated_heading": False,
            "node_type": "synthetic",
            "target_kind": "page",
            "target_id": None,
            "target_page": title_page,
            "is_collapsible": False,
        }
    )
    explicit_main_section_id_by_map: dict[str, str] = {}
    for section in sorted(
        [item for item in sections if isinstance(item, dict)],
        key=lambda item: int(_safe_int(item.get("order")) or 0),
    ):
        canonical_map = _normalize_publication_paper_section_kind(
            str(section.get("canonical_map") or section.get("canonical_kind") or "")
        )
        if canonical_map not in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS:
            continue
        section_id = str(section.get("id") or "").strip()
        if not section_id:
            continue
        title_hint = str(
            section.get("label_normalized")
            or section.get("title")
            or section.get("label_original")
            or section.get("raw_label")
            or ""
        ).strip()
        if _publication_paper_explicit_major_heading(
            title=title_hint,
            canonical_map=canonical_map,
        ):
            explicit_main_section_id_by_map.setdefault(canonical_map, section_id)

    synthetic_main_text_node_ids: dict[str, str] = {}

    def ensure_synthetic_main_text_node(
        canonical_map: str, *, target_page: int | None
    ) -> str:
        existing_node_id = synthetic_main_text_node_ids.get(canonical_map)
        if existing_node_id:
            existing_node = node_by_id.get(existing_node_id)
            if (
                existing_node is not None
                and existing_node.get("target_page") is None
                and target_page
            ):
                existing_node["target_page"] = target_page
                existing_node["page_start"] = target_page
                existing_node["page_end"] = target_page
                if existing_node.get("target_kind") is None:
                    existing_node["target_kind"] = "page"
            return existing_node_id
        node_id = f"outline-node-main-text-{canonical_map}"
        synthetic_node = {
            "id": node_id,
            "parent_id": "outline-group-main_text",
            "label_original": _publication_paper_section_label(canonical_map),
            "label_normalized": _publication_paper_section_label(canonical_map),
            "section_type": "canonical",
            "canonical_map": canonical_map,
            "level": 2,
            "order_index": PUBLICATION_PAPER_MAJOR_MAIN_SECTION_ORDER.get(
                canonical_map, 90
            )
            * 100,
            "page_start": target_page,
            "page_end": target_page,
            "bounding_boxes": [],
            "text_content": None,
            "confidence": 1.0,
            "source_parser": "paper_model",
            "is_generated_heading": True,
            "node_type": "synthetic",
            "target_kind": "page" if target_page else None,
            "target_id": None,
            "target_page": target_page,
            "is_collapsible": True,
        }
        synthetic_main_text_node_ids[canonical_map] = node_id
        group_children["main_text"].append(synthetic_node)
        node_by_id[node_id] = synthetic_node
        return node_id

    for section in sorted(
        sections,
        key=lambda item: int(_safe_int(item.get("order")) or 0),
    ):
        if not isinstance(section, dict):
            continue
        group_id = _publication_paper_outline_group_for_section(section)
        section_id = str(section.get("id") or "").strip() or None
        section_level = max(1, int(_safe_int(section.get("level")) or 1))
        canonical_map = _normalize_publication_paper_section_kind(
            str(
                section.get("canonical_map")
                or section.get("canonical_kind")
                or "section"
            )
        )
        parent_outline_id = f"outline-group-{group_id}"
        parent_section_id = str(section.get("parent_id") or "").strip() or None
        if (
            parent_section_id
            and section_group_by_section_id.get(parent_section_id) == group_id
            and section_node_id_by_section_id.get(parent_section_id)
        ):
            parent_outline_id = section_node_id_by_section_id[parent_section_id]
        elif (
            group_id == "main_text"
            and canonical_map in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS
        ):
            explicit_main_section_id = explicit_main_section_id_by_map.get(
                canonical_map
            )
            explicit_outline_id = (
                f"outline-node-{explicit_main_section_id}"
                if explicit_main_section_id
                else None
            )
            current_outline_id = f"outline-node-{section_id}" if section_id else None
            title_hint = str(
                section.get("label_normalized")
                or section.get("title")
                or section.get("label_original")
                or section.get("raw_label")
                or ""
            ).strip()
            is_explicit_major_heading = _publication_paper_explicit_major_heading(
                title=title_hint,
                canonical_map=canonical_map,
            )
            if explicit_outline_id and current_outline_id != explicit_outline_id:
                parent_outline_id = explicit_outline_id
            elif not explicit_outline_id and not is_explicit_major_heading:
                parent_outline_id = ensure_synthetic_main_text_node(
                    canonical_map,
                    target_page=_safe_int(section.get("page_start"))
                    or _safe_int(section.get("page_end")),
                )
        elif section_level > 1:
            for candidate_level in range(section_level - 1, 0, -1):
                candidate_node_id = section_level_stack[group_id].get(candidate_level)
                if candidate_node_id:
                    parent_outline_id = candidate_node_id
                    break
        node_id = f"outline-node-{section.get('id')}"
        parent_level = 1
        if parent_outline_id in node_by_id:
            parent_level = max(
                1, int(_safe_int(node_by_id[parent_outline_id].get("level")) or 1)
            )
        section_node = {
            "id": node_id,
            "parent_id": parent_outline_id,
            "label_original": str(
                section.get("label_original")
                or section.get("raw_label")
                or section.get("title")
                or ""
            ).strip()
            or None,
            "label_normalized": str(
                section.get("label_normalized") or section.get("title") or ""
            ).strip()
            or "Section",
            "section_type": str(
                section.get("section_type")
                or _publication_paper_section_type(section.get("canonical_kind"))
            ),
            "canonical_map": canonical_map,
            "level": parent_level + 1,
            "order_index": int(_safe_int(section.get("order")) or 0) + 1,
            "page_start": _safe_int(section.get("page_start")),
            "page_end": _safe_int(section.get("page_end")),
            "bounding_boxes": list(section.get("bounding_boxes") or []),
            "text_content": str(section.get("content") or "").strip() or None,
            "confidence": section.get("confidence"),
            "source_parser": str(
                section.get("source_parser") or section.get("source") or ""
            ).strip()
            or None,
            "is_generated_heading": bool(section.get("is_generated_heading")),
            "node_type": "section",
            "target_kind": "section",
            "target_id": section_id,
            "target_page": _safe_int(section.get("page_start"))
            or _safe_int(section.get("page_end")),
            "is_collapsible": False,
        }
        group_children[group_id].append(section_node)
        node_by_id[node_id] = section_node
        if section_id:
            section_node_id_by_section_id[section_id] = node_id
            section_group_by_section_id[section_id] = group_id
        effective_stack_level = section_level
        if (
            group_id == "main_text"
            and canonical_map in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS
            and parent_outline_id != f"outline-group-{group_id}"
        ):
            effective_stack_level = max(2, section_level)
        section_level_stack[group_id][effective_stack_level] = node_id
        for candidate_level in list(section_level_stack[group_id]):
            if candidate_level > effective_stack_level:
                section_level_stack[group_id].pop(candidate_level, None)

    asset_items = [
        *figures,
        *tables,
        *datasets,
        *attachments,
    ]
    for asset in asset_items:
        if not isinstance(asset, dict):
            continue
        asset_group_id, asset_group_label = _publication_paper_outline_asset_group(
            asset
        )
        asset_group_children.setdefault(asset_group_id, [])
        asset_group_children[asset_group_id].append(
            {
                "id": f"outline-node-{asset.get('id')}",
                "parent_id": asset_group_id,
                "label_original": str(asset.get("file_name") or "").strip()
                or "Untitled file",
                "label_normalized": str(asset.get("file_name") or "").strip()
                or "Untitled file",
                "section_type": "asset",
                "canonical_map": str(asset.get("classification") or "").strip().lower()
                or "asset",
                "level": 3,
                "order_index": len(asset_group_children[asset_group_id]) + 1,
                "page_start": _safe_int(asset.get("page_start")),
                "page_end": _safe_int(asset.get("page_end")),
                "bounding_boxes": [],
                "text_content": str(asset.get("caption") or "").strip() or None,
                "confidence": None,
                "source_parser": str(
                    asset.get("source_parser") or asset.get("source") or ""
                ).strip()
                or None,
                "is_generated_heading": False,
                "node_type": "asset",
                "target_kind": "asset",
                "target_id": str(asset.get("id") or "").strip() or None,
                "target_page": _safe_int(asset.get("page_start"))
                or _safe_int(asset.get("page_end")),
                "is_collapsible": False,
                "group_label": asset_group_label,
            }
        )

    for asset_group_id, items in asset_group_children.items():
        if not items:
            continue
        if asset_group_id == "outline-group-assets-appendices":
            group_label = "Appendices"
        else:
            group_label = str(items[0].get("group_label") or "Assets")
        asset_group_node = {
            "id": asset_group_id,
            "parent_id": "outline-group-assets",
            "label_original": group_label,
            "label_normalized": group_label,
            "section_type": "group",
            "canonical_map": "asset_group",
            "level": 2,
            "order_index": 100 + len(group_children["assets"]),
            "page_start": None,
            "page_end": None,
            "bounding_boxes": [],
            "text_content": None,
            "confidence": None,
            "source_parser": "paper_model",
            "is_generated_heading": False,
            "node_type": "group",
            "target_kind": None,
            "target_id": None,
            "target_page": None,
            "is_collapsible": True,
        }
        group_children["assets"].append(asset_group_node)
        node_by_id[asset_group_id] = asset_group_node
        for item in items:
            item.pop("group_label", None)
            node_by_id[str(item.get("id") or "")] = item
        nodes.extend(items)

    if references and not any(
        str(node.get("canonical_map") or "") == "references"
        for node in group_children["references"]
    ):
        group_children["references"].append(
            {
                "id": "outline-node-references",
                "parent_id": "outline-group-references",
                "label_original": "References",
                "label_normalized": "References",
                "section_type": "reference",
                "canonical_map": "references",
                "level": 2,
                "order_index": 0,
                "page_start": None,
                "page_end": None,
                "bounding_boxes": [],
                "text_content": None,
                "confidence": None,
                "source_parser": "paper_model",
                "is_generated_heading": True,
                "node_type": "synthetic",
                "target_kind": None,
                "target_id": None,
                "target_page": None,
                "is_collapsible": False,
            }
        )

    order_cursor = 0
    for group_key, group_label in PUBLICATION_PAPER_OUTLINE_GROUPS:
        items = sorted(
            group_children[group_key],
            key=lambda item: (
                int(_safe_int(item.get("order_index")) or 0),
                str(item.get("label_normalized") or ""),
            ),
        )
        if not items:
            continue
        order_cursor += 1
        nodes.append(
            {
                "id": f"outline-group-{group_key}",
                "parent_id": None,
                "label_original": group_label,
                "label_normalized": group_label,
                "section_type": "group",
                "canonical_map": group_key,
                "level": 1,
                "order_index": order_cursor,
                "page_start": None,
                "page_end": None,
                "bounding_boxes": [],
                "text_content": None,
                "confidence": None,
                "source_parser": "paper_model",
                "is_generated_heading": False,
                "node_type": "group",
                "target_kind": None,
                "target_id": None,
                "target_page": None,
                "is_collapsible": True,
            }
        )
        node_by_id[f"outline-group-{group_key}"] = nodes[-1]
        nodes.extend(items)

    child_ids_by_parent: dict[str, list[str]] = {}
    for node in nodes:
        node_id = str(node.get("id") or "").strip()
        if not node_id:
            continue
        node_by_id[node_id] = node
        parent_id = str(node.get("parent_id") or "").strip() or None
        if parent_id:
            child_ids_by_parent.setdefault(parent_id, []).append(node_id)
    for node in nodes:
        node_id = str(node.get("id") or "").strip()
        node["is_collapsible"] = bool(child_ids_by_parent.get(node_id))
    expanded_nodes: list[dict[str, Any]] = []
    for group_key, _ in PUBLICATION_PAPER_OUTLINE_GROUPS:
        group_id = f"outline-group-{group_key}"
        group_node = node_by_id.get(group_id)
        if group_node is None:
            continue
        expanded_nodes.append(group_node)

        def append_children(parent_id: str) -> None:
            child_ids = child_ids_by_parent.get(parent_id, [])
            child_nodes = sorted(
                (
                    node_by_id[child_id]
                    for child_id in child_ids
                    if child_id in node_by_id
                ),
                key=lambda item: (
                    int(_safe_int(item.get("order_index")) or 0),
                    str(item.get("label_normalized") or ""),
                ),
            )
            for child_node in child_nodes:
                expanded_nodes.append(child_node)
                append_children(str(child_node.get("id") or ""))

        append_children(group_id)
    return expanded_nodes


def _build_publication_paper_payload(
    *,
    publication: dict[str, Any],
    structured_abstract_payload: dict[str, Any],
    structured_abstract_status: str,
    files: list[dict[str, Any]],
    parsed_paper: dict[str, Any] | None = None,
    parser_status: str | None = None,
    parser_last_error: str | None = None,
) -> tuple[dict[str, Any], str]:
    seed_sections = _build_publication_paper_sections(
        structured_abstract_payload=structured_abstract_payload,
        abstract=publication.get("abstract"),
    )
    author_names = _normalize_publication_author_names(publication.get("authors_json"))
    keyword_values = _normalize_keywords(publication.get("keywords_json"))
    structured_keywords = _normalize_keywords(
        structured_abstract_payload.get("keywords")
        if isinstance(structured_abstract_payload, dict)
        else []
    )
    for keyword in structured_keywords:
        marker = keyword.casefold()
        if marker not in {entry.casefold() for entry in keyword_values}:
            keyword_values.append(keyword)

    serialized_assets = [
        _serialize_publication_paper_asset(item)
        for item in files
        if isinstance(item, dict)
    ]
    primary_pdf = _select_primary_publication_pdf(serialized_assets)
    file_figures = [
        asset
        for asset in serialized_assets
        if asset.get("classification") == FILE_CLASSIFICATION_FIGURE
    ]
    file_tables = [
        asset
        for asset in serialized_assets
        if asset.get("classification") == FILE_CLASSIFICATION_TABLE
    ]
    datasets = [
        asset
        for asset in serialized_assets
        if asset.get("classification") == FILE_CLASSIFICATION_DATASETS
    ]
    attachments = [
        asset
        for asset in serialized_assets
        if asset.get("file_id") != (primary_pdf or {}).get("file_id")
        and asset.get("classification")
        not in {
            FILE_CLASSIFICATION_FIGURE,
            FILE_CLASSIFICATION_TABLE,
            FILE_CLASSIFICATION_DATASETS,
        }
    ]
    parsed_payload = parsed_paper if isinstance(parsed_paper, dict) else {}
    parsed_sections = (
        parsed_payload.get("sections")
        if isinstance(parsed_payload.get("sections"), list)
        else []
    )
    has_parsed_paper = bool(parsed_payload)
    parsed_section_items = [
        item
        for item in parsed_sections
        if isinstance(item, dict)
        and (
            str(item.get("content") or "").strip()
            or str(item.get("title") or "").strip()
        )
    ]
    parsed_sections_already_structured = bool(parsed_section_items) and all(
        str(item.get("major_section_key") or "").strip()
        and str(item.get("section_role") or "").strip()
        for item in parsed_section_items
    )
    if has_parsed_paper and parsed_sections_already_structured:
        sections = []
        journal = str(publication.get("journal") or "").strip() or None
        for item in parsed_section_items:
            serialized_section = dict(item)
            if not str(serialized_section.get("journal_section_family") or "").strip():
                serialized_section["journal_section_family"] = (
                    _publication_paper_journal_section_family(
                        title=serialized_section.get("title")
                        or serialized_section.get("label_original")
                        or serialized_section.get("raw_label"),
                        journal=journal,
                    )
                )
            sections.append(serialized_section)
    else:
        sections = (
            _refine_publication_paper_sections(
                parsed_section_items,
                journal=str(publication.get("journal") or "").strip() or None,
            )
            if has_parsed_paper
            else seed_sections
        )
    references = (
        [item for item in parsed_payload.get("references") if isinstance(item, dict)]
        if isinstance(parsed_payload.get("references"), list)
        else []
    )
    parsed_figures = (
        [
            _serialize_publication_paper_asset(item)
            for item in parsed_payload.get("figures")
            if isinstance(item, dict)
        ]
        if isinstance(parsed_payload.get("figures"), list)
        else []
    )
    parsed_tables = (
        [
            _serialize_publication_paper_asset(item)
            for item in parsed_payload.get("tables")
            if isinstance(item, dict)
        ]
        if isinstance(parsed_payload.get("tables"), list)
        else []
    )
    figures = _merge_publication_paper_asset_collections(
        parsed_assets=parsed_figures,
        file_assets=file_figures,
    )
    tables = _merge_publication_paper_asset_collections(
        parsed_assets=parsed_tables,
        file_assets=file_tables,
    )
    page_count = _safe_int(parsed_payload.get("page_count"))
    has_full_text_sections = any(
        str(section.get("source") or "").strip()
        in STRUCTURED_PAPER_FULL_TEXT_SECTION_SOURCES
        for section in sections
        if isinstance(section, dict)
    )
    parser_available = grobid_available()
    has_attachable_oa_pdf_candidate = any(
        bool(asset.get("is_pdf"))
        and bool(asset.get("download_url"))
        and str(asset.get("source") or "").strip().upper() == FILE_SOURCE_OA_LINK
        for asset in serialized_assets
    )
    can_auto_attach_reader_pdf = bool(
        parser_available
        and primary_pdf is None
        and not has_full_text_sections
        and (
            has_attachable_oa_pdf_candidate
            or (
                not bool(publication.get("oa_link_suppressed"))
                and bool(_normalize_doi(publication.get("doi")))
            )
        )
    )
    reader_entry_available = bool(
        primary_pdf is not None or has_full_text_sections or can_auto_attach_reader_pdf
    )
    outline = _build_publication_paper_outline(
        publication=publication,
        sections=sections,
        figures=figures,
        tables=tables,
        datasets=datasets,
        attachments=attachments,
        references=references,
        page_count=page_count,
    )
    outline_depth = max(
        1,
        max(
            (
                max(1, int(_safe_int(node.get("level")) or 1))
                for node in outline
                if isinstance(node, dict)
            ),
            default=1,
        ),
    )
    effective_parser_status = parser_status or (
        STRUCTURED_PAPER_STATUS_FULL_TEXT_READY
        if has_full_text_sections
        else (
            STRUCTURED_PAPER_STATUS_PDF_ATTACHED
            if primary_pdf is not None
            else STRUCTURED_PAPER_STATUS_STRUCTURE_ONLY
        )
    )
    component_summary = _publication_paper_component_summary(
        sections=sections,
        figures=figures,
        tables=tables,
        datasets=datasets,
        attachments=attachments,
        references=references,
    )

    payload = {
        "metadata": {
            "publication_id": str(publication.get("id") or "").strip(),
            "title": str(publication.get("title") or "").strip(),
            "journal": str(publication.get("journal") or "").strip() or "Not available",
            "year": _safe_int(publication.get("year")),
            "publication_type": str(publication.get("publication_type") or "").strip()
            or "Not available",
            "article_type": str(publication.get("article_type") or "").strip() or None,
            "doi": _normalize_doi(publication.get("doi")),
            "pmid": _normalize_pmid(publication.get("pmid")),
            "openalex_work_id": str(publication.get("openalex_work_id") or "").strip()
            or None,
            "citations_total": max(
                0, int(_safe_int(publication.get("citations_total")) or 0)
            ),
            "authors": author_names,
            "keywords": keyword_values,
        },
        "document": {
            "has_viewable_pdf": primary_pdf is not None,
            "primary_pdf_file_id": (primary_pdf or {}).get("file_id"),
            "primary_pdf_file_name": (primary_pdf or {}).get("file_name"),
            "primary_pdf_download_url": (primary_pdf or {}).get("download_url"),
            "primary_pdf_source": (primary_pdf or {}).get("source"),
            "parser_status": effective_parser_status,
            "parser_version": STRUCTURED_PAPER_CACHE_VERSION,
            "generation_method": str(
                parsed_payload.get("generation_method")
                or "metadata_abstract_files_seed"
            ),
            "has_full_text_sections": has_full_text_sections,
            "total_file_count": len(serialized_assets),
            "parser_last_error": parser_last_error,
            "page_count": page_count,
            "search_ready": len(sections) > 0,
            "outline_depth": outline_depth,
            "reader_entry_available": reader_entry_available,
        },
        "sections": sections,
        "outline": outline,
        "figures": figures,
        "tables": tables,
        "datasets": datasets,
        "attachments": attachments,
        "references": references,
        "annotations": [],
        "component_summary": component_summary,
        "provenance": {
            "structured_abstract_status": structured_abstract_status,
            "structured_abstract_format": (
                str(structured_abstract_payload.get("format") or "").strip() or None
                if isinstance(structured_abstract_payload, dict)
                else None
            ),
            "parser_version": STRUCTURED_PAPER_CACHE_VERSION,
            "full_text_generation_method": str(
                parsed_payload.get("generation_method") or ""
            ).strip()
            or None,
            "parser_provider": str(parsed_payload.get("parser_provider") or "").strip()
            or None,
            "asset_enrichment_status": str(
                parsed_payload.get("asset_enrichment_status") or ""
            ).strip()
            or None,
            "asset_enrichment_checked_at": str(
                parsed_payload.get("asset_enrichment_checked_at") or ""
            ).strip()
            or None,
            "asset_enrichment_last_error": str(
                parsed_payload.get("asset_enrichment_last_error") or ""
            ).strip()
            or None,
        },
    }
    source_signature = _publication_paper_seed_hash(
        publication=publication,
        structured_abstract_payload=structured_abstract_payload,
        structured_abstract_status=structured_abstract_status,
        files=files,
    )
    return payload, source_signature


def _normalize_publication_pdf_text_line(value: str | None) -> str:
    clean = re.sub(r"\s+", " ", str(value or "").strip())
    if not clean:
        return ""
    clean = (
        clean.replace("â€™", "'")
        .replace("â€œ", '"')
        .replace("â€", '"')
        .replace("â€“", "-")
        .replace("â€”", "-")
    )
    return clean.strip()


def _coalesce_publication_pdf_section_lines(lines: list[str]) -> str:
    paragraphs: list[str] = []
    current: list[str] = []
    for raw_line in lines:
        line = _normalize_publication_pdf_text_line(raw_line)
        if not line:
            continue
        if re.match(r"^(?:[-*•]|\d+[\).])\s+", line) and current:
            paragraphs.append(_normalize_abstract_text(" ".join(current)))
            current = [line]
            continue
        current.append(line)
        joined = " ".join(current)
        if line.endswith((".", "?", "!")) and len(joined) >= 220:
            paragraphs.append(_normalize_abstract_text(joined))
            current = []
    if current:
        paragraphs.append(_normalize_abstract_text(" ".join(current)))
    return "\n\n".join(part for part in paragraphs if part)


def _normalize_publication_pdf_search_text(value: str | None) -> str:
    clean = _normalize_publication_pdf_text_line(value)
    if not clean:
        return ""
    clean = re.sub(r"(?<=\w)\s*-\s+(?=\w)", "", clean)
    clean = clean.casefold()
    clean = re.sub(r"[^a-z0-9]+", " ", clean)
    return re.sub(r"\s+", " ", clean).strip()


def _is_publication_paper_boilerplate_block(value: str | None) -> bool:
    clean = _normalize_abstract_text(value)
    if not clean:
        return False
    lowered = clean.casefold()
    if "protected by copyright" in lowered:
        return True
    if "all rights reserved" in lowered:
        return True
    if "author(s) (or their employer(s))" in lowered:
        return True
    if "prepublication history for this paper is available online" in lowered:
        return True
    if "downloaded from" in lowered and "bmj" in lowered:
        return True
    if "bmj open" in lowered and "doi:" in lowered and len(clean) < 220:
        return True
    if lowered in {"open access", "original research"}:
        return True
    if "creative commons" in lowered and len(clean) < 300:
        return True
    if "licence and your intended use is not permitted" in lowered:
        return True
    if "to cite:" in lowered and len(clean) < 200:
        return True
    if re.match(r"^(bmj|doi|http)\s", lowered) and len(clean) < 120:
        return True
    return False


def _should_skip_publication_paper_section(
    *,
    title: str | None,
    canonical_kind: str | None,
    content: str | None,
) -> bool:
    normalized_title = _normalize_heading_label(title or "")
    normalized_kind = _normalize_publication_paper_section_kind(
        canonical_kind or normalized_title
    )
    normalized_content = _normalize_abstract_text(content)
    if not normalized_title and normalized_kind in {"section", "appendix"}:
        return True
    if normalized_title in {"Open access", "Section"}:
        return True
    if (
        normalized_kind == "appendix"
        and normalized_title == "Appendix"
        and len(normalized_content) < 120
    ):
        return True
    if _is_publication_paper_boilerplate_block(normalized_content):
        return True
    return False


def _publication_paper_section_anchor_candidates(
    section: dict[str, Any],
) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def add_candidate(value: str | None) -> None:
        normalized = _normalize_publication_pdf_search_text(
            _strip_publication_paper_heading_prefix(value)
        )
        if (
            not normalized
            or len(normalized) < 6
            or normalized in {"section", "full text", "back matter", "appendix"}
            or normalized in seen
        ):
            return
        seen.add(normalized)
        candidates.append(normalized)

    add_candidate(str(section.get("raw_label") or "").strip() or None)
    add_candidate(str(section.get("title") or "").strip() or None)

    content = _normalize_abstract_text(section.get("content"))
    if content and not _is_publication_paper_boilerplate_block(content):
        words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'/-]*", content)
        for snippet_len in (18, 12, 8):
            if len(words) < snippet_len:
                continue
            add_candidate(" ".join(words[:snippet_len]))
    return candidates


def _find_publication_paper_section_anchor_page(
    *,
    section: dict[str, Any],
    page_search_texts: list[str],
    preferred_start_index: int = 0,
) -> int | None:
    if not page_search_texts:
        return None
    start_index = max(
        0, min(len(page_search_texts) - 1, int(preferred_start_index or 0))
    )
    search_ranges = [range(start_index, len(page_search_texts))]
    if start_index > 0:
        search_ranges.append(range(0, start_index))
    for candidate in _publication_paper_section_anchor_candidates(section):
        for search_range in search_ranges:
            for page_index in search_range:
                if candidate and candidate in page_search_texts[page_index]:
                    return page_index + 1
    return None


def _publication_pdf_page_search_texts_from_content(
    content: bytes,
) -> tuple[list[str], int | None]:
    if not content or PdfReader is None:
        return [], None
    try:
        reader = PdfReader(BytesIO(content))
    except Exception:
        return [], None
    page_search_texts = [
        _normalize_publication_pdf_search_text(page.extract_text() or "")
        for page in reader.pages
    ]
    return page_search_texts, (len(page_search_texts) or None)


def _align_structured_publication_sections_to_pdf_pages(
    *,
    sections: list[dict[str, Any]],
    content: bytes,
) -> tuple[list[dict[str, Any]], int | None]:
    if not sections or not content:
        return sections, None
    page_search_texts, page_count = _publication_pdf_page_search_texts_from_content(
        content
    )
    if not page_search_texts:
        return sections, page_count

    aligned_sections = [dict(section) for section in sections]
    preferred_start_index = 0
    for section in aligned_sections:
        current_page_start = _safe_int(section.get("page_start"))
        if current_page_start is None:
            current_page_start = _find_publication_paper_section_anchor_page(
                section=section,
                page_search_texts=page_search_texts,
                preferred_start_index=preferred_start_index,
            )
        if current_page_start is None:
            continue
        section["page_start"] = current_page_start
        preferred_start_index = max(
            0, min(len(page_search_texts) - 1, current_page_start - 1)
        )

    previous_anchor: int | None = None
    for section in aligned_sections:
        current_page_start = _safe_int(section.get("page_start"))
        if current_page_start is None and previous_anchor is not None:
            section["page_start"] = previous_anchor
            current_page_start = previous_anchor
        if current_page_start is not None:
            previous_anchor = current_page_start

    next_anchor: int | None = None
    for section in reversed(aligned_sections):
        current_page_start = _safe_int(section.get("page_start"))
        if current_page_start is None and next_anchor is not None:
            section["page_start"] = next_anchor
            current_page_start = next_anchor
        if current_page_start is not None:
            next_anchor = current_page_start

    for index, section in enumerate(aligned_sections):
        current_page_start = _safe_int(section.get("page_start"))
        if current_page_start is None:
            continue
        next_page_start = next(
            (
                candidate_start
                for candidate in aligned_sections[index + 1 :]
                for candidate_start in [_safe_int(candidate.get("page_start"))]
                if candidate_start is not None
            ),
            None,
        )
        if next_page_start is None:
            section["page_end"] = page_count or current_page_start
            continue
        if next_page_start > current_page_start:
            section["page_end"] = max(current_page_start, next_page_start - 1)
        else:
            section["page_end"] = current_page_start
    return aligned_sections, page_count


def _publication_paper_asset_anchor_candidates(
    asset: dict[str, Any],
) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def add_candidate(value: str | None) -> None:
        normalized = _normalize_publication_pdf_search_text(value)
        if not normalized or len(normalized) < 5 or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    add_candidate(str(asset.get("title") or "").strip() or None)
    add_candidate(str(asset.get("file_name") or "").strip() or None)

    caption = _normalize_abstract_text(asset.get("caption"))
    if caption and not _is_publication_paper_boilerplate_block(caption):
        words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'/-]*", caption)
        for snippet_len in (16, 12, 8):
            if len(words) < snippet_len:
                continue
            add_candidate(" ".join(words[:snippet_len]))
    return candidates


def _find_publication_paper_asset_anchor_page(
    *,
    asset: dict[str, Any],
    page_search_texts: list[str],
) -> int | None:
    for candidate in _publication_paper_asset_anchor_candidates(asset):
        for page_index, page_text in enumerate(page_search_texts):
            if candidate and candidate in page_text:
                return page_index + 1
    return None


def _align_structured_publication_assets_to_pdf_pages(
    *,
    assets: list[dict[str, Any]],
    content: bytes,
) -> list[dict[str, Any]]:
    if not assets or not content:
        return assets
    page_search_texts, _page_count = _publication_pdf_page_search_texts_from_content(
        content
    )
    if not page_search_texts:
        return assets
    aligned_assets = [dict(asset) for asset in assets]
    for asset in aligned_assets:
        if _safe_int(asset.get("page_start")) is not None:
            continue
        anchor_page = _find_publication_paper_asset_anchor_page(
            asset=asset,
            page_search_texts=page_search_texts,
        )
        if anchor_page is None:
            continue
        asset["page_start"] = anchor_page
        asset["page_end"] = anchor_page
    return aligned_assets


def _infer_publication_paper_section_level(value: str | None) -> int:
    clean = str(value or "").strip()
    match = re.match(
        r"^(?:section\s+)?(?P<number>\d+(?:\.\d+)*)\b", clean, flags=re.IGNORECASE
    )
    if not match:
        return 1
    return max(1, min(4, match.group("number").count(".") + 1))


def _is_probable_publication_paper_heading(value: str | None) -> bool:
    clean = _normalize_publication_pdf_text_line(value)
    if not clean:
        return False
    word_count = len(clean.split())
    if word_count == 0 or word_count > 14 or len(clean) > 120:
        return False
    if clean.endswith((".", ";", "?", "!")):
        return False
    kind = _normalize_publication_paper_section_kind(clean)
    if kind in {
        "abstract",
        "keywords",
        "introduction",
        "methods",
        "results",
        "discussion",
        "conclusions",
        "limitations",
        "ethics",
        "data_availability",
        "funding",
        "acknowledgements",
        "conflicts",
        "references",
        "appendix",
        "supplementary_materials",
        "registration",
    }:
        return True
    if re.match(r"^(?:\d+(?:\.\d+)*|[IVXLC]+)[\).]?\s+[A-Z]", clean):
        return True
    return clean == clean.upper() and any(char.isalpha() for char in clean)


def _extract_publication_paper_reference_entries(
    sections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    reference_section = next(
        (
            section
            for section in sections
            if str(section.get("canonical_kind") or section.get("kind") or "")
            == "references"
        ),
        None,
    )
    if reference_section is None:
        return []
    content = str(reference_section.get("content") or "").strip()
    if not content:
        return []
    candidates = re.split(
        r"\n{2,}|(?=(?:\[\d+\]|\d+\.\s+[A-Z]))",
        content,
    )
    references: list[dict[str, Any]] = []
    for index, candidate in enumerate(candidates):
        raw_text = _normalize_abstract_text(candidate)
        if len(raw_text) < 12:
            continue
        references.append(
            {
                "id": f"paper-reference-{index + 1}",
                "label": f"Reference {index + 1}",
                "raw_text": raw_text,
            }
        )
    return references[:250]


def _extract_structured_publication_paper_from_pdf(
    *, content: bytes, title: str | None = None
) -> dict[str, Any]:
    raise PublicationConsoleValidationError(
        "Local full-paper parsing is disabled. GROBID is required for full-paper parsing."
    )


def _xml_local_name(value: str | None) -> str:
    clean = str(value or "").strip()
    if not clean:
        return ""
    if "}" in clean:
        clean = clean.rsplit("}", 1)[-1]
    return clean.strip().lower()


def _tei_direct_children(node: ET.Element | None, *names: str) -> list[ET.Element]:
    if node is None:
        return []
    wanted = {_xml_local_name(name) for name in names if str(name or "").strip()}
    if not wanted:
        return [child for child in list(node) if isinstance(child.tag, str)]
    return [
        child
        for child in list(node)
        if isinstance(child.tag, str) and _xml_local_name(child.tag) in wanted
    ]


def _tei_first_direct_child(node: ET.Element | None, *names: str) -> ET.Element | None:
    children = _tei_direct_children(node, *names)
    return children[0] if children else None


def _tei_node_text(node: ET.Element | None) -> str:
    if node is None:
        return ""
    chunks: list[str] = []
    for part in node.itertext():
        clean = _normalize_publication_pdf_text_line(part)
        if clean:
            chunks.append(clean)
    return _normalize_abstract_text(" ".join(chunks))


def _tei_page_numbers(node: ET.Element | None) -> list[int]:
    numbers: list[int] = []
    if node is None:
        return numbers
    for child in node.iter():
        if _xml_local_name(getattr(child, "tag", "")) != "pb":
            continue
        page_number = _safe_int(child.attrib.get("n"))
        if page_number is not None:
            numbers.append(page_number)
    return numbers


def _tei_page_range(node: ET.Element | None) -> tuple[int | None, int | None]:
    numbers = _tei_page_numbers(node)
    if not numbers:
        return None, None
    return min(numbers), max(numbers)


def _tei_page_count(root: ET.Element) -> int | None:
    numbers = _tei_page_numbers(root)
    if numbers:
        return max(numbers)
    for node in root.iter():
        if _xml_local_name(getattr(node, "tag", "")) != "extent":
            continue
        match = re.search(
            r"(\d+)\s+pages?\b", _tei_node_text(node), flags=re.IGNORECASE
        )
        if match:
            page_count = _safe_int(match.group(1))
            if page_count is not None:
                return page_count
    return None


def _tei_split_displaced_paragraphs(
    node: ET.Element,
) -> tuple[list[str], list[str]]:
    """Split a TEI div's paragraphs into native blocks and displaced blocks.

    GROBID sometimes merges continuation paragraphs from the **previous**
    section into a div when a page header (e.g. "Open access" or
    "Protected by copyright") appears between them in the PDF.  After the
    boilerplate paragraph is stripped the remaining prose looks out of place
    in the current section.

    This helper inspects the raw ``<p>`` children of *node* and returns two
    lists of cleaned, non-boilerplate block strings:

    * **native** – blocks that appeared *before* any boilerplate paragraph
      (these belong to the section).
    * **displaced** – blocks that appeared *after* a boilerplate paragraph
      and look like free-flowing prose rather than continuation of the
      section's own style.  These likely belong to the preceding section.
    """
    native: list[str] = []
    displaced: list[str] = []
    saw_boilerplate = False

    for child in list(node):
        tag = _xml_local_name(getattr(child, "tag", "")).casefold()
        if tag not in {"p"}:
            continue
        raw_text = _tei_node_text(child)
        if _is_publication_paper_boilerplate_block(raw_text):
            saw_boilerplate = True
            continue
        cleaned = _publication_paper_content_cleanup(raw_text)
        if not cleaned:
            continue
        if saw_boilerplate:
            displaced.append(cleaned)
        else:
            native.append(cleaned)

    return native, displaced


_FIGURE_LEGEND_PARAGRAPH_START_RE = re.compile(
    r"^(?:figure|fig\.?|table)\s+\d+[a-z]?\s+",
    flags=re.IGNORECASE,
)
_FIGURE_REFERENCE_VERB_AFTER_LABEL_RE = re.compile(
    r"^(?:figure|fig\.?|table)\s+\d+[a-z]?\s+"
    r"(?:shows?|presents?|depicts?|illustrates?|demonstrates?|displays?"
    r"|compares?|summariz\w+|provides?|contains?|indicates?|reveals?"
    r"|highlights?|outlines?|represents?"
    r"|is\s|was\s|were\s|has\s|had\s|can\s|will\s|would\s|should\s"
    r"|could\s|may\s|might\s|also\s|further\s|and\s|below\s|above\s"
    r"|in\s+the\s|on\s+the\s)",
    flags=re.IGNORECASE,
)
_FIGURE_LEGEND_PARAGRAPH_MIN_LEN = 80


def _is_figure_legend_paragraph(text: str) -> bool:
    clean = text.strip()
    if len(clean) < _FIGURE_LEGEND_PARAGRAPH_MIN_LEN:
        return False
    if not _FIGURE_LEGEND_PARAGRAPH_START_RE.match(clean):
        return False
    if _FIGURE_REFERENCE_VERB_AFTER_LABEL_RE.match(clean):
        return False
    return True


def _tei_section_blocks(node: ET.Element | None) -> list[str]:
    blocks: list[str] = []
    if node is None:
        return blocks
    for child in list(node):
        tag = _xml_local_name(getattr(child, "tag", "")).casefold()
        if tag in {
            "head",
            "div",
            "figure",
            "table",
            "formula",
            "graphic",
            "pb",
            "listorg",
        }:
            continue
        if tag == "note":
            note_type = str(child.attrib.get("type") or "").strip().lower()
            if note_type in {"foot", "footnote", "tail"}:
                continue
            note_text = _publication_paper_content_cleanup(_tei_node_text(child))
            if (
                note_text
                and len(note_text) >= 40
                and not _is_publication_paper_boilerplate_block(note_text)
            ):
                blocks.append(note_text)
            continue
        if tag == "list":
            items = [
                f"- {text}"
                for item in child.iter()
                if _xml_local_name(getattr(item, "tag", "")) == "item"
                for text in [_tei_node_text(item)]
                if text and not _is_publication_paper_boilerplate_block(text)
            ]
            if items:
                blocks.extend(items)
            continue
        if tag == "listbibl":
            bibliography_blocks = [
                text
                for item in child.iter()
                if _xml_local_name(getattr(item, "tag", "")) in {"bibl", "biblstruct"}
                for text in [_tei_node_text(item)]
                if text
            ]
            if bibliography_blocks:
                blocks.extend(bibliography_blocks)
            continue
        raw_text = _tei_node_text(child)
        if _is_figure_legend_paragraph(raw_text or ""):
            continue
        text = _publication_paper_content_cleanup(raw_text)
        if text and not _is_publication_paper_boilerplate_block(text):
            blocks.append(text)
    deduped_blocks: list[str] = []
    previous = ""
    for block in blocks:
        if block == previous:
            continue
        deduped_blocks.append(block)
        previous = block
    return deduped_blocks


def _request_grobid_fulltext_tei(*, content: bytes, file_name: str) -> str:
    if not content:
        raise PublicationConsoleValidationError("Publication PDF bytes are empty.")
    base_url = _grobid_base_url()
    if not base_url:
        raise PublicationConsoleValidationError(
            "GROBID is required for full-paper parsing but PUB_GROBID_HOSTPORT or "
            "PUB_GROBID_BASE_URL is not configured."
        )
    endpoint = f"{base_url}/api/processFulltextDocument"
    timeout = httpx.Timeout(_grobid_timeout_seconds())
    retries = _grobid_retry_count()
    last_error = f"GROBID is required for full-paper parsing and could not be reached at {endpoint}."
    with httpx.Client(
        timeout=timeout,
        follow_redirects=True,
        headers={"Accept": "application/xml"},
    ) as client:
        for attempt in range(retries + 1):
            try:
                response = client.post(
                    endpoint,
                    data={
                        "consolidateHeader": "0",
                        "consolidateCitations": "0",
                        "includeRawCitations": "1",
                        "includeRawAffiliations": "1",
                        "teiCoordinates": "head,p,s,ref,biblStruct,formula,figure,table",
                    },
                    files={
                        "input": (
                            file_name or "publication.pdf",
                            content,
                            "application/pdf",
                        )
                    },
                )
            except Exception as exc:
                last_error = f"GROBID is required for full-paper parsing and could not be reached at {endpoint}: {exc}"
                if attempt < retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise PublicationConsoleValidationError(last_error) from exc
            if response.status_code < 400:
                tei_xml = str(response.text or "").strip()
                if tei_xml:
                    return tei_xml
                last_error = "GROBID returned an empty TEI payload."
                break
            error_preview = re.sub(r"\s+", " ", str(response.text or "").strip())[:400]
            last_error = (
                f"GROBID full-text parsing failed with status {response.status_code}."
                + (f" {error_preview}" if error_preview else "")
            )
            if response.status_code in RETRYABLE_STATUS_CODES and attempt < retries:
                time.sleep(0.5 * (attempt + 1))
                continue
            break
    raise PublicationConsoleValidationError(last_error)


def _extract_publication_paper_reference_entries_from_tei(
    root: ET.Element,
) -> list[dict[str, Any]]:
    reference_roots = [
        node
        for node in root.iter()
        if (
            _xml_local_name(getattr(node, "tag", "")) == "listBibl"
            or (
                _xml_local_name(getattr(node, "tag", "")) == "div"
                and str(node.attrib.get("type") or "").strip().lower() == "references"
            )
        )
    ]
    candidate_iterables = reference_roots or [root]
    references: list[dict[str, Any]] = []
    seen: set[str] = set()
    for container in candidate_iterables:
        for node in container.iter():
            if _xml_local_name(getattr(node, "tag", "")).casefold() not in {
                "bibl",
                "biblstruct",
            }:
                continue
            raw_text = _tei_node_text(node)
            if len(raw_text) < 12:
                continue
            marker = raw_text.casefold()
            if marker in seen or _is_publication_paper_boilerplate_block(raw_text):
                continue
            seen.add(marker)
            references.append(
                {
                    "id": f"paper-reference-{len(references) + 1}",
                    "label": f"Reference {len(references) + 1}",
                    "raw_text": raw_text,
                }
            )
    return references[:500]


def _publication_paper_asset_display_title(
    *,
    label_text: str | None,
    head_text: str | None,
    classification: str,
    index: int,
) -> str:
    default_label = (
        "Figure" if classification == FILE_CLASSIFICATION_FIGURE else "Table"
    )
    for candidate in (label_text, head_text):
        clean = _normalize_heading_label(candidate)
        if not clean:
            continue
        match = re.match(
            r"^(?:fig(?:ure)?|table)\s*(\d+[A-Za-z]?)\b",
            clean,
            flags=re.IGNORECASE,
        )
        if match:
            return f"{default_label} {match.group(1).upper()}"
        numeric_match = re.fullmatch(r"(\d+[A-Za-z]?)", clean)
        if numeric_match:
            return f"{default_label} {numeric_match.group(1).upper()}"
    label = _normalize_heading_label(label_text)
    head = _normalize_heading_label(head_text)
    if label:
        return label
    if head:
        return head
    return f"{default_label} {index}"


def _publication_paper_asset_caption_cleanup(
    value: str | None,
    *,
    title: str | None = None,
    label_text: str | None = None,
    head_text: str | None = None,
) -> str | None:
    caption = _normalize_abstract_text(value)
    if not caption:
        return None
    sentences = re.split(r"(?<=[.!?])\s+", caption)
    filtered_sentences = [
        sentence
        for sentence in sentences
        if sentence
        and not _is_publication_paper_boilerplate_block(sentence)
        and "creativecommons" not in sentence.casefold()
        and "http://" not in sentence.casefold()
        and "https://" not in sentence.casefold()
    ]
    cleaned = _normalize_abstract_text(" ".join(filtered_sentences)) or caption
    for prefix in (
        _normalize_heading_label(label_text),
        _normalize_heading_label(head_text),
        _normalize_heading_label(title),
    ):
        normalized_prefix = str(prefix or "").strip()
        if not normalized_prefix:
            continue
        cleaned = re.sub(
            rf"^{re.escape(normalized_prefix)}(?:\s*[:.\-]\s*|\s+)",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip()
    cleaned = cleaned.strip(" :-")
    if cleaned and title and cleaned.casefold() == str(title).strip().casefold():
        return None
    return cleaned or None


def _publication_paper_asset_caption_text(
    node: ET.Element,
    *,
    label_text: str | None,
    head_text: str | None,
    title: str | None,
) -> str | None:
    parts: list[str] = []
    for candidate in (
        _tei_first_direct_child(node, "figDesc"),
        _tei_first_direct_child(node, "head"),
    ):
        text = _tei_node_text(candidate)
        if text and not _is_publication_paper_boilerplate_block(text):
            parts.append(text)
    for child in list(node):
        tag = _xml_local_name(getattr(child, "tag", ""))
        if tag in {"label", "head", "figDesc", "graphic", "table"}:
            continue
        text = _tei_node_text(child)
        if text and not _is_publication_paper_boilerplate_block(text):
            parts.append(text)
    deduped: list[str] = []
    seen: set[str] = set()
    label_marker = str(label_text or "").strip().casefold()
    head_marker = str(head_text or "").strip().casefold()
    for part in parts:
        marker = part.casefold()
        if marker in seen or marker == label_marker:
            continue
        if (
            head_marker
            and marker == head_marker
            and label_marker
            and head_marker == label_marker
        ):
            continue
        seen.add(marker)
        deduped.append(part)
    return _publication_paper_asset_caption_cleanup(
        " ".join(deduped),
        title=title,
        label_text=label_text,
        head_text=head_text,
    )


def _publication_paper_asset_dedupe_key(asset: dict[str, Any]) -> str:
    classification = _normalize_publication_file_classification(
        str(asset.get("classification") or "").strip() or FILE_CLASSIFICATION_OTHER
    )
    title = str(asset.get("title") or asset.get("file_name") or "").strip()
    normalized_title = _normalize_publication_pdf_search_text(title)
    label_match = re.search(
        r"\b(?:fig(?:ure)?|table)\s*(\d+[a-z]?)\b",
        normalized_title,
        flags=re.IGNORECASE,
    )
    if label_match:
        return f"{classification}|label|{label_match.group(1).lower()}"
    numeric_match = re.fullmatch(r"(\d+[a-z]?)", normalized_title)
    if numeric_match:
        return f"{classification}|label|{numeric_match.group(1).lower()}"
    if normalized_title:
        return f"{classification}|title|{normalized_title}"
    caption = _normalize_publication_pdf_search_text(asset.get("caption"))
    if caption:
        return f"{classification}|caption|{caption[:120]}"
    return f"{classification}|asset|{str(asset.get('id') or '').strip()}"


def _publication_paper_asset_title_score(value: str | None) -> int:
    clean = _normalize_heading_label(value)
    if not clean:
        return 0
    if re.fullmatch(r"\d+[A-Za-z]?", clean):
        return 1
    if re.match(r"^(?:Figure|Table)\s+\d+[A-Za-z]?$", clean):
        return 3
    return 2


def _merge_publication_paper_asset_candidate(
    existing: dict[str, Any], candidate: dict[str, Any]
) -> dict[str, Any]:
    merged = dict(existing)
    existing_source = str(existing.get("source") or "").strip()
    candidate_source = str(candidate.get("source") or "").strip()
    if _publication_paper_asset_title_score(
        candidate.get("title")
    ) > _publication_paper_asset_title_score(existing.get("title")):
        merged["title"] = candidate.get("title")
        merged["file_name"] = candidate.get("file_name") or candidate.get("title")
    existing_caption = str(existing.get("caption") or "").strip()
    candidate_caption = str(candidate.get("caption") or "").strip()
    if len(candidate_caption) > len(existing_caption):
        merged["caption"] = candidate_caption or None
    if (
        _safe_int(merged.get("page_start")) is None
        and _safe_int(candidate.get("page_start")) is not None
    ):
        merged["page_start"] = _safe_int(candidate.get("page_start"))
    if (
        _safe_int(merged.get("page_end")) is None
        and _safe_int(candidate.get("page_end")) is not None
    ):
        merged["page_end"] = _safe_int(candidate.get("page_end"))
    if (
        existing_source == PAPER_MODEL_ASSET_SOURCE_PARSED
        and candidate_source
        and candidate_source != PAPER_MODEL_ASSET_SOURCE_PARSED
    ):
        merged["source"] = candidate_source
    if not merged.get("download_url") and candidate.get("download_url"):
        merged["download_url"] = candidate.get("download_url")
    if not merged.get("file_id") and candidate.get("file_id"):
        merged["file_id"] = candidate.get("file_id")
    if not merged.get("classification") and candidate.get("classification"):
        merged["classification"] = candidate.get("classification")
    if not merged.get("classification_label") and candidate.get("classification_label"):
        merged["classification_label"] = candidate.get("classification_label")
    if not merged.get("asset_kind") and candidate.get("asset_kind"):
        merged["asset_kind"] = candidate.get("asset_kind")
    if not merged.get("origin") and candidate.get("origin"):
        merged["origin"] = candidate.get("origin")
    if not merged.get("source_parser") and candidate.get("source_parser"):
        merged["source_parser"] = candidate.get("source_parser")
    if not merged.get("is_stored_locally") and candidate.get("is_stored_locally"):
        merged["is_stored_locally"] = True
    if not merged.get("is_pdf") and candidate.get("is_pdf"):
        merged["is_pdf"] = True
    if not merged.get("coords") and candidate.get("coords"):
        merged["coords"] = candidate.get("coords")
    if not merged.get("graphic_coords") and candidate.get("graphic_coords"):
        merged["graphic_coords"] = candidate.get("graphic_coords")
    if not merged.get("image_data") and candidate.get("image_data"):
        merged["image_data"] = candidate.get("image_data")
    if not merged.get("structured_html") and candidate.get("structured_html"):
        merged["structured_html"] = candidate.get("structured_html")
    return merged


def _extract_publication_paper_assets_from_tei(
    root: ET.Element,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    figures_by_key: dict[str, dict[str, Any]] = {}
    tables_by_key: dict[str, dict[str, Any]] = {}
    figure_index = 0
    table_index = 0
    for node in root.iter():
        tag_name = _xml_local_name(getattr(node, "tag", ""))
        if tag_name not in {"figure", "table"}:
            continue
        node_type = str(node.attrib.get("type") or "").strip().lower()
        head_text = _tei_node_text(_tei_first_direct_child(node, "head"))
        label_text = _tei_node_text(_tei_first_direct_child(node, "label"))
        is_table = (
            tag_name == "table"
            or node_type == "table"
            or bool(
                re.match(
                    r"^table\b", str(label_text or "").strip(), flags=re.IGNORECASE
                )
            )
            or bool(
                re.match(r"^table\b", str(head_text or "").strip(), flags=re.IGNORECASE)
            )
        )
        classification = (
            FILE_CLASSIFICATION_TABLE if is_table else FILE_CLASSIFICATION_FIGURE
        )
        if classification == FILE_CLASSIFICATION_TABLE:
            table_index += 1
            asset_index = table_index
        else:
            figure_index += 1
            asset_index = figure_index
        title_text = _publication_paper_asset_display_title(
            label_text=label_text,
            head_text=head_text,
            classification=classification,
            index=asset_index,
        )
        caption_text = _publication_paper_asset_caption_text(
            node,
            label_text=label_text,
            head_text=head_text,
            title=title_text,
        )
        page_start, page_end = _tei_page_range(node)
        figure_coords = str(node.attrib.get("coords") or "").strip() or None
        graphic_coords: str | None = None
        for graphic_child in node:
            if _xml_local_name(getattr(graphic_child, "tag", "")) == "graphic":
                graphic_coords = (
                    str(graphic_child.attrib.get("coords") or "").strip() or None
                )
                break
        parsed_asset = _build_parsed_publication_paper_asset(
            asset_id=f"parsed-{'table' if is_table else 'figure'}-{asset_index}",
            title=title_text,
            classification=classification,
            caption=caption_text,
            page_start=page_start,
            page_end=page_end,
            coords=figure_coords,
            graphic_coords=graphic_coords,
        )
        asset_key = _publication_paper_asset_dedupe_key(parsed_asset)
        if classification == FILE_CLASSIFICATION_TABLE:
            existing_asset = tables_by_key.get(asset_key)
            tables_by_key[asset_key] = (
                _merge_publication_paper_asset_candidate(existing_asset, parsed_asset)
                if existing_asset
                else parsed_asset
            )
        else:
            existing_asset = figures_by_key.get(asset_key)
            figures_by_key[asset_key] = (
                _merge_publication_paper_asset_candidate(existing_asset, parsed_asset)
                if existing_asset
                else parsed_asset
            )
    return list(figures_by_key.values()), list(tables_by_key.values())


def _remove_publication_paper_asset_caption_bleed(
    *,
    sections: list[dict[str, Any]],
    figures: list[dict[str, Any]],
    tables: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    caption_candidates = [
        _publication_paper_content_cleanup(asset.get("caption"))
        for asset in [*figures, *tables]
        if isinstance(asset, dict)
    ]
    caption_candidates = [
        candidate for candidate in caption_candidates if len(candidate) >= 40
    ]
    if not caption_candidates:
        return sections
    cleaned_sections: list[dict[str, Any]] = []
    for section in sections:
        cleaned_section = dict(section)
        content = _publication_paper_content_cleanup(cleaned_section.get("content"))
        if not content:
            cleaned_sections.append(cleaned_section)
            continue
        next_content = content
        for caption in caption_candidates:
            if caption and caption in next_content:
                next_content = next_content.replace(caption, " ")
        next_content = _publication_paper_content_cleanup(next_content)
        if next_content != content:
            cleaned_section["content"] = next_content
            cleaned_section["word_count"] = len(
                re.findall(r"[A-Za-z0-9][A-Za-z0-9'/-]*", next_content)
            )
            cleaned_section["paragraph_count"] = len(
                _publication_paper_section_paragraphs(next_content)
            )
        cleaned_sections.append(cleaned_section)
    return cleaned_sections


def _parse_grobid_tei_into_structured_paper(
    *, tei_xml: str, title: str | None = None
) -> dict[str, Any]:
    try:
        root = ET.fromstring(tei_xml)
    except ET.ParseError as exc:
        raise PublicationConsoleValidationError(
            f"GROBID returned invalid TEI XML: {exc}"
        ) from exc

    sections: list[dict[str, Any]] = []
    section_index_by_id: dict[str, int] = {}
    order = 0
    abstract_markers: set[str] = set()
    last_body_major_kind: str | None = None
    last_body_major_section_id: str | None = None
    last_body_major_section_id_by_kind: dict[str, str] = {}

    def append_section(
        *,
        title_value: str | None,
        raw_label: str | None,
        canonical_kind: str | None,
        content: str | None,
        page_start: int | None = None,
        page_end: int | None = None,
        level: int = 1,
        parent_id: str | None = None,
        allow_empty: bool = False,
        is_generated_heading: bool = False,
        document_zone: str | None = None,
    ) -> str | None:
        nonlocal order
        if _should_skip_publication_paper_section(
            title=title_value or raw_label,
            canonical_kind=canonical_kind,
            content=content,
        ):
            return None
        serialized = _serialize_publication_paper_section(
            order=order,
            title=title_value,
            raw_label=raw_label,
            canonical_kind=canonical_kind,
            content=content,
            source=STRUCTURED_PAPER_SECTION_SOURCE_GROBID,
            page_start=page_start,
            page_end=page_end,
            level=level,
            parent_id=parent_id,
            allow_empty=allow_empty,
            is_generated_heading=is_generated_heading,
            document_zone=document_zone,
        )
        if serialized is None:
            return None
        sections.append(serialized)
        serialized_id = str(serialized.get("id") or "").strip()
        if serialized_id:
            section_index_by_id[serialized_id] = len(sections) - 1
        order += 1
        return serialized_id or None

    def append_content_to_existing_section(
        section_id: str | None,
        *,
        content: str | None,
        page_end: int | None = None,
    ) -> bool:
        target_id = str(section_id or "").strip()
        if not target_id:
            return False
        index = section_index_by_id.get(target_id)
        if index is None or index >= len(sections):
            return False
        extra_content = _publication_paper_content_cleanup(content)
        if not extra_content:
            return False
        existing_section = sections[index]
        existing_content = _publication_paper_content_cleanup(
            existing_section.get("content")
        )
        combined_content = (
            f"{existing_content}\n\n{extra_content}".strip()
            if existing_content
            else extra_content
        )
        existing_section["content"] = combined_content
        existing_section["word_count"] = len(
            re.findall(r"[A-Za-z0-9][A-Za-z0-9'/-]*", combined_content)
        )
        existing_section["paragraph_count"] = len(
            _publication_paper_section_paragraphs(combined_content)
        )
        existing_page_end = _safe_int(existing_section.get("page_end"))
        next_page_end = _safe_int(page_end)
        if next_page_end is not None and (
            existing_page_end is None or next_page_end > existing_page_end
        ):
            existing_section["page_end"] = next_page_end
        return True

    def current_body_major_anchor_id(kind: str | None) -> str | None:
        normalized_kind = _normalize_publication_paper_section_kind(kind)
        if normalized_kind in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS:
            anchor_id = last_body_major_section_id_by_kind.get(normalized_kind)
            if anchor_id:
                return anchor_id
        return last_body_major_section_id

    for abstract_node in root.iter():
        if _xml_local_name(getattr(abstract_node, "tag", "")) != "abstract":
            continue
        abstract_blocks = _tei_section_blocks(abstract_node)
        abstract_content = (
            "\n\n".join(abstract_blocks)
            if abstract_blocks
            else _tei_node_text(abstract_node)
        )
        if not abstract_content:
            continue
        marker = abstract_content.casefold()
        if marker in abstract_markers:
            continue
        abstract_markers.add(marker)
        abstract_heading = _tei_node_text(
            _tei_first_direct_child(abstract_node, "head")
        )
        abstract_type = str(abstract_node.attrib.get("type") or "").strip() or None
        page_start, page_end = _tei_page_range(abstract_node)
        abstract_kind = _normalize_publication_paper_section_kind(
            abstract_heading or abstract_type or "abstract"
        )
        if abstract_kind not in PUBLICATION_PAPER_EDITORIAL_SECTION_KINDS:
            abstract_kind = "abstract"
        append_section(
            title_value=abstract_heading
            or _publication_paper_section_label(abstract_kind),
            raw_label=abstract_heading
            or _publication_paper_section_label(abstract_kind),
            canonical_kind=abstract_kind,
            content=abstract_content,
            page_start=page_start,
            page_end=page_end,
            level=1,
            is_generated_heading=not bool(abstract_heading),
            document_zone="front",
        )

    def walk_div(
        node: ET.Element,
        *,
        parent_id: str | None = None,
        level: int = 1,
        fallback_kind: str = "section",
        document_zone: str = "body",
        prefixed_blocks: list[str] | None = None,
    ) -> None:
        nonlocal last_body_major_kind, last_body_major_section_id
        heading_text = _tei_node_text(_tei_first_direct_child(node, "head"))
        div_type = str(node.attrib.get("type") or "").strip() or None
        page_start, page_end = _tei_page_range(node)
        child_divs = _tei_direct_children(node, "div")
        blocks = [block for block in (prefixed_blocks or []) if block]
        blocks.extend(_tei_section_blocks(node))

        if (
            heading_text
            and document_zone == "body"
            and not child_divs
            and last_body_major_section_id
        ):
            _, displaced = _tei_split_displaced_paragraphs(node)
            if displaced:
                displaced_set = set(displaced)
                kept: list[str] = []
                for block in blocks:
                    if block in displaced_set:
                        displaced_set.discard(block)
                    else:
                        kept.append(block)
                if len(kept) < len(blocks):
                    displaced_content = "\n\n".join(displaced)
                    append_content_to_existing_section(
                        last_body_major_section_id,
                        content=displaced_content,
                        page_end=page_end,
                    )
                    blocks = kept

        section_content = "\n\n".join(blocks)
        if _is_transparent_publication_paper_wrapper_title(heading_text):
            heading_text = None
        future_titles = [
            _tei_node_text(_tei_first_direct_child(child_div, "head"))
            for child_div in child_divs[:4]
        ]
        fallback_canonical_kind = _normalize_publication_paper_section_kind(
            div_type or fallback_kind
        )
        leading_heading_block = (
            _extract_publication_paper_leading_heading_block(section_content)
            if not heading_text and not child_divs
            else None
        )
        contextual_main_kind = (
            last_body_major_kind
            if document_zone == "body"
            and last_body_major_kind in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS
            else None
        )
        current_major_anchor_id = current_body_major_anchor_id(contextual_main_kind)
        structured_split_inputs = [
            candidate
            for candidate in (
                (
                    [heading_text]
                    if heading_text and document_zone == "back" and not child_divs
                    else []
                )
                + blocks
            )
            if candidate
        ]
        if not child_divs and len(structured_split_inputs) > 1:
            structured_split_pairs = [
                (
                    candidate,
                    _extract_publication_paper_leading_heading_block(candidate),
                )
                for candidate in structured_split_inputs
            ]
            recognized_split_blocks = sum(
                1 for _, parsed in structured_split_pairs if isinstance(parsed, dict)
            )
            should_split_structured_blocks = recognized_split_blocks >= 2 or (
                document_zone == "back"
                and bool(heading_text)
                and recognized_split_blocks >= 1
            )
            if should_split_structured_blocks:
                handled_blocks = False
                remaining_blocks: list[str] = []
                for candidate, parsed_block in structured_split_pairs:
                    if isinstance(parsed_block, dict):
                        append_section(
                            title_value=parsed_block.get("label"),
                            raw_label=parsed_block.get("label"),
                            canonical_kind=parsed_block.get("key"),
                            content=parsed_block.get("content"),
                            page_start=page_start,
                            page_end=page_end,
                            level=max(1, min(level, 4)),
                            parent_id=parent_id,
                            allow_empty=False,
                            is_generated_heading=False,
                            document_zone=document_zone,
                        )
                        handled_blocks = True
                        continue
                    if candidate == heading_text:
                        continue
                    if (
                        document_zone == "body"
                        and contextual_main_kind
                        and append_content_to_existing_section(
                            current_major_anchor_id,
                            content=candidate,
                            page_end=page_end,
                        )
                    ):
                        handled_blocks = True
                        continue
                    remaining_blocks.append(candidate)
                if handled_blocks and not remaining_blocks:
                    return
                if handled_blocks:
                    blocks = remaining_blocks
                    section_content = "\n\n".join(blocks)
                    leading_heading_block = (
                        _extract_publication_paper_leading_heading_block(
                            section_content
                        )
                        if not heading_text and section_content
                        else None
                    )
        if not heading_text and not child_divs and len(blocks) > 1:
            handled_blocks = False
            remaining_blocks: list[str] = []
            for block in blocks:
                block_heading = _extract_publication_paper_leading_heading_block(block)
                if block_heading:
                    append_section(
                        title_value=block_heading.get("label"),
                        raw_label=block_heading.get("label"),
                        canonical_kind=block_heading.get("key"),
                        content=block_heading.get("content"),
                        page_start=page_start,
                        page_end=page_end,
                        level=max(1, min(level, 4)),
                        parent_id=parent_id,
                        allow_empty=False,
                        is_generated_heading=False,
                        document_zone=document_zone,
                    )
                    handled_blocks = True
                    continue
                if (
                    document_zone == "body"
                    and contextual_main_kind
                    and append_content_to_existing_section(
                        current_major_anchor_id,
                        content=block,
                        page_end=page_end,
                    )
                ):
                    handled_blocks = True
                    continue
                remaining_blocks.append(block)
            if handled_blocks and not remaining_blocks:
                return
            if handled_blocks:
                blocks = remaining_blocks
                section_content = "\n\n".join(blocks)
                leading_heading_block = (
                    _extract_publication_paper_leading_heading_block(section_content)
                )
        if not heading_text and child_divs:
            if not section_content:
                for child_div in child_divs:
                    walk_div(
                        child_div,
                        parent_id=parent_id,
                        level=level,
                        fallback_kind=div_type or fallback_kind,
                        document_zone=document_zone,
                    )
                return
            inferred_map = _infer_publication_paper_section_canonical_map(
                title=None,
                canonical_kind=fallback_canonical_kind,
                content=section_content,
                current_main_kind=contextual_main_kind
                or (
                    fallback_canonical_kind
                    if fallback_canonical_kind
                    in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS
                    else None
                ),
                future_titles=[item for item in future_titles if item],
            )
            generated_kind = _normalize_publication_paper_section_kind(
                inferred_map or fallback_canonical_kind
            )
            can_create_generated_wrapper = not parent_id and generated_kind in (
                *PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS,
                *PUBLICATION_PAPER_EDITORIAL_SECTION_KINDS,
                *PUBLICATION_PAPER_METADATA_SECTION_KINDS,
                *PUBLICATION_PAPER_REFERENCE_SECTION_KINDS,
            )
            if not can_create_generated_wrapper:
                for child_index, child_div in enumerate(child_divs):
                    walk_div(
                        child_div,
                        parent_id=parent_id,
                        level=level,
                        fallback_kind=div_type or fallback_kind,
                        document_zone=document_zone,
                        prefixed_blocks=blocks if child_index == 0 else None,
                    )
                return
            canonical_kind = generated_kind
            section_title = _publication_paper_section_label(canonical_kind)
        else:
            inferred_map = (
                _infer_publication_paper_section_canonical_map(
                    title=(leading_heading_block or {}).get("label"),
                    canonical_kind=(
                        (leading_heading_block or {}).get("key")
                        or fallback_canonical_kind
                    ),
                    content=(
                        (leading_heading_block or {}).get("content") or section_content
                    ),
                    current_main_kind=contextual_main_kind,
                    future_titles=[item for item in future_titles if item],
                )
                if not heading_text
                else None
            )
            if (
                not heading_text
                and not child_divs
                and document_zone == "body"
                and contextual_main_kind
                and inferred_map == contextual_main_kind
                and append_content_to_existing_section(
                    current_major_anchor_id,
                    content=section_content,
                    page_end=page_end,
                )
            ):
                return
            canonical_kind = _normalize_publication_paper_section_kind(
                heading_text
                or (leading_heading_block or {}).get("key")
                or (
                    inferred_map
                    if inferred_map not in {"section", "appendix"}
                    else contextual_main_kind or div_type or fallback_kind
                )
            )
            section_title = (
                _normalize_heading_label(heading_text)
                or _normalize_heading_label((leading_heading_block or {}).get("label"))
                or (
                    _publication_paper_section_label(canonical_kind)
                    if canonical_kind not in {"section", "appendix"}
                    else _publication_paper_section_label(
                        contextual_main_kind or canonical_kind
                    )
                )
            )
            if leading_heading_block:
                section_content = str(
                    leading_heading_block.get("content") or ""
                ).strip()
        is_explicit_major_heading = _publication_paper_explicit_major_heading(
            title=section_title or heading_text,
            canonical_map=canonical_kind,
        )
        current_parent_id = parent_id
        created_section_id = append_section(
            title_value=section_title,
            raw_label=heading_text or None,
            canonical_kind=canonical_kind,
            content=section_content,
            page_start=page_start,
            page_end=page_end,
            level=max(1, min(level, 4)),
            parent_id=parent_id,
            allow_empty=bool(child_divs)
            or (document_zone == "body" and is_explicit_major_heading),
            is_generated_heading=not bool(heading_text),
            document_zone=document_zone,
        )
        if created_section_id:
            current_parent_id = created_section_id
        inferred_section_map = _infer_publication_paper_section_canonical_map(
            title=section_title,
            canonical_kind=canonical_kind,
            content=section_content,
            current_main_kind=contextual_main_kind,
            future_titles=[item for item in future_titles if item],
        )
        if (
            document_zone == "body"
            and inferred_section_map in PUBLICATION_PAPER_MAJOR_MAIN_SECTION_KINDS
        ):
            last_body_major_kind = inferred_section_map
            if created_section_id:
                last_body_major_section_id = created_section_id
                last_body_major_section_id_by_kind[inferred_section_map] = (
                    created_section_id
                )
        for child_div in child_divs:
            walk_div(
                child_div,
                parent_id=current_parent_id,
                level=min(level + 1, 4),
                fallback_kind=div_type or canonical_kind or "section",
                document_zone=document_zone,
            )

    for container_name, fallback_kind, fallback_title, document_zone in (
        ("front", "section", None, "front"),
        ("body", "section", title or "Full text", "body"),
        ("back", "appendix", "Back matter", "back"),
    ):
        container = next(
            (
                node
                for node in root.iter()
                if _xml_local_name(getattr(node, "tag", "")) == container_name
            ),
            None,
        )
        if container is None:
            continue
        container_page_start, container_page_end = _tei_page_range(container)
        container_child_divs = _tei_direct_children(container, "div")
        container_blocks = _tei_section_blocks(container)
        structured_container_blocks = [
            _extract_publication_paper_leading_heading_block(block)
            for block in container_blocks
        ]
        structured_container_blocks = [
            block for block in structured_container_blocks if isinstance(block, dict)
        ]
        if document_zone == "back" and structured_container_blocks:
            for block in structured_container_blocks:
                append_section(
                    title_value=block.get("label"),
                    raw_label=block.get("label"),
                    canonical_kind=block.get("key"),
                    content=block.get("content"),
                    page_start=container_page_start,
                    page_end=container_page_end,
                    level=1,
                    is_generated_heading=False,
                    document_zone=document_zone,
                )
            container_blocks = [
                block
                for block in container_blocks
                if _extract_publication_paper_leading_heading_block(block) is None
            ]
        container_parent_id: str | None = None
        leading_blocks_for_first_child = (
            container_blocks if container_child_divs else []
        )
        if container_blocks and not container_child_divs:
            container_parent_id = append_section(
                title_value=fallback_title,
                raw_label=fallback_title,
                canonical_kind=fallback_kind,
                content="\n\n".join(container_blocks),
                page_start=container_page_start,
                page_end=container_page_end,
                level=1,
                is_generated_heading=True,
                document_zone=document_zone,
            )
            leading_blocks_for_first_child = []
        elif container_blocks and container_child_divs:
            future_titles = [
                _tei_node_text(_tei_first_direct_child(div, "head"))
                for div in container_child_divs[:4]
            ]
            inferred_map = _infer_publication_paper_section_canonical_map(
                title=fallback_title,
                canonical_kind=fallback_kind,
                content="\n\n".join(container_blocks),
                current_main_kind=None,
                future_titles=[item for item in future_titles if item],
            )
            generated_kind = _normalize_publication_paper_section_kind(
                inferred_map or fallback_kind
            )
            if generated_kind not in {"section", "appendix"}:
                generated_title = fallback_title or _publication_paper_section_label(
                    generated_kind
                )
                container_parent_id = append_section(
                    title_value=generated_title,
                    raw_label=generated_title,
                    canonical_kind=generated_kind,
                    content="\n\n".join(container_blocks),
                    page_start=container_page_start,
                    page_end=container_page_end,
                    level=1,
                    is_generated_heading=True,
                    document_zone=document_zone,
                )
                leading_blocks_for_first_child = []
        for div_index, div in enumerate(container_child_divs):
            walk_div(
                div,
                parent_id=container_parent_id,
                level=2 if container_parent_id else 1,
                fallback_kind=fallback_kind,
                document_zone=document_zone,
                prefixed_blocks=leading_blocks_for_first_child
                if div_index == 0
                else None,
            )

    if not sections:
        raise PublicationConsoleValidationError(
            "GROBID did not return any readable full-text sections."
        )

    parsed_figures, parsed_tables = _extract_publication_paper_assets_from_tei(root)
    cleaned_sections = _remove_publication_paper_asset_caption_bleed(
        sections=sections,
        figures=parsed_figures,
        tables=parsed_tables,
    )
    refined_sections = _refine_publication_paper_sections(cleaned_sections)

    return {
        "sections": refined_sections,
        "figures": parsed_figures,
        "tables": parsed_tables,
        "references": _extract_publication_paper_reference_entries_from_tei(root),
        "page_count": _tei_page_count(root),
        "generation_method": "grobid_tei_fulltext_v3",
        "parser_provider": STRUCTURED_PAPER_PARSER_PROVIDER_GROBID,
    }


_FIGURE_CROP_MIN_BYTES = 2048
_FIGURE_CROP_SCALE = 2.0


def _parse_grobid_coords(
    coords_str: str | None,
) -> list[tuple[int, float, float, float, float]]:
    entries: list[tuple[int, float, float, float, float]] = []
    raw = str(coords_str or "").strip()
    if not raw:
        return entries
    for part in raw.split(";"):
        tokens = part.strip().split(",")
        if len(tokens) < 5:
            continue
        try:
            page = int(tokens[0])
            x1, y1, x2, y2 = (
                float(tokens[1]),
                float(tokens[2]),
                float(tokens[3]),
                float(tokens[4]),
            )
            entries.append((page, x1, y1, x2, y2))
        except (ValueError, IndexError):
            continue
    return entries


def _crop_figure_images_from_pdf(
    content: bytes,
    figures: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if _fitz is None or not content or not figures:
        return figures
    try:
        doc = _fitz.open(stream=content, filetype="pdf")
    except Exception:
        logger.warning("PyMuPDF could not open PDF for figure cropping")
        return figures
    try:
        updated_figures: list[dict[str, Any]] = []
        for figure in figures:
            figure_copy = dict(figure)
            coords_str = figure_copy.get("graphic_coords") or figure_copy.get("coords")
            coord_entries = _parse_grobid_coords(coords_str)
            if not coord_entries:
                updated_figures.append(figure_copy)
                continue
            page_num, x1, y1, x2, y2 = coord_entries[0]
            if page_num < 0 or page_num >= len(doc):
                updated_figures.append(figure_copy)
                continue
            page = doc[page_num]
            rect = _fitz.Rect(x1, y1, x2, y2)
            mat = _fitz.Matrix(_FIGURE_CROP_SCALE, _FIGURE_CROP_SCALE)
            try:
                pix = page.get_pixmap(matrix=mat, clip=rect)
                img_bytes = pix.tobytes("png")
            except Exception:
                updated_figures.append(figure_copy)
                continue
            if len(img_bytes) < _FIGURE_CROP_MIN_BYTES:
                updated_figures.append(figure_copy)
                continue
            b64 = base64.b64encode(img_bytes).decode("ascii")
            figure_copy["image_data"] = f"data:image/png;base64,{b64}"
            updated_figures.append(figure_copy)
        return updated_figures
    finally:
        doc.close()


def _extract_docling_tables_html(content: bytes) -> list[dict[str, Any]]:
    try:
        from docling.document_converter import DocumentConverter
    except Exception:
        return []
    if not content:
        return []
    tmp_path: Path | None = None
    try:
        hf_endpoint = os.getenv("HF_ENDPOINT", "").strip()
        if not hf_endpoint:
            os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_file:
            tmp_file.write(content)
            tmp_path = Path(tmp_file.name)
        converter = DocumentConverter()
        result = converter.convert(str(tmp_path))
        document = result.document
        tables_out: list[dict[str, Any]] = []
        for table in document.tables:
            html_text = ""
            export_to_html = getattr(table, "export_to_html", None)
            if callable(export_to_html):
                try:
                    html_text = str(export_to_html(document) or "").strip()
                except TypeError:
                    html_text = str(export_to_html() or "").strip()
            html_text = _canonicalize_docling_table_html(html_text)
            page_no: int | None = None
            coords: str | None = None
            if hasattr(table, "prov") and table.prov:
                first_prov = table.prov[0]
                if hasattr(first_prov, "page_no"):
                    page_no = int(first_prov.page_no)
                bbox = getattr(first_prov, "bbox", None)
                bbox_tuple = _extract_docling_bbox_tuple(bbox)
                if page_no is not None and bbox_tuple is not None:
                    coords = (
                        f"{page_no},{bbox_tuple[0]:.3f},{bbox_tuple[1]:.3f},"
                        f"{bbox_tuple[2]:.3f},{bbox_tuple[3]:.3f}"
                    )
            num_rows = 0
            num_cols = 0
            if hasattr(table, "data") and hasattr(table.data, "grid"):
                grid = table.data.grid
                num_rows = len(grid)
                if num_rows > 0:
                    num_cols = len(grid[0])
            tables_out.append(
                {
                    "html": html_text,
                    "page": page_no,
                    "coords": coords,
                    "num_rows": num_rows,
                    "num_cols": num_cols,
                }
            )
        return tables_out
    except Exception as exc:
        logger.warning("Docling table extraction failed: %s", exc)
        return []
    finally:
        if tmp_path is not None:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass


def _match_docling_tables_to_assets(
    docling_tables: list[dict[str, Any]],
    table_assets: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not docling_tables or not table_assets:
        return table_assets
    updated_assets: list[dict[str, Any]] = []
    used_docling: set[int] = set()
    for asset in table_assets:
        asset_copy = dict(asset)
        asset_page = _safe_int(asset_copy.get("page_start"))
        best_idx: int | None = None
        best_score = -1
        for idx, dt in enumerate(docling_tables):
            if idx in used_docling:
                continue
            docling_page = dt.get("page")
            score = 0
            if (
                asset_page is not None
                and docling_page is not None
                and asset_page == docling_page
            ):
                score += 10
            score += int(
                round(
                    _docling_table_asset_coordinate_overlap_score(
                        docling_coords=str(dt.get("coords") or "").strip() or None,
                        asset_coords=str(asset_copy.get("coords") or "").strip()
                        or None,
                    )
                    * 100
                )
            )
            if dt.get("num_rows", 0) > 1:
                score += 5
            if score > best_score:
                best_score = score
                best_idx = idx
        if best_idx is not None and best_score > 0:
            used_docling.add(best_idx)
            asset_copy["structured_html"] = docling_tables[best_idx].get("html")
        updated_assets.append(asset_copy)
    return updated_assets


def _extract_docling_bbox_tuple(value: Any) -> tuple[float, float, float, float] | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple)) and len(value) >= 4:
        coords = [_safe_float(item) for item in value[:4]]
        if all(item is not None for item in coords):
            x1, y1, x2, y2 = [float(item) for item in coords if item is not None]
            return (x1, y1, x2, y2)
    if isinstance(value, dict):
        for keys in (
            ("l", "t", "r", "b"),
            ("left", "top", "right", "bottom"),
            ("x0", "y0", "x1", "y1"),
        ):
            coords = [_safe_float(value.get(key)) for key in keys]
            if all(item is not None for item in coords):
                x1, y1, x2, y2 = [float(item) for item in coords if item is not None]
                return (x1, y1, x2, y2)
    for keys in (
        ("l", "t", "r", "b"),
        ("left", "top", "right", "bottom"),
        ("x0", "y0", "x1", "y1"),
    ):
        coords = [_safe_float(getattr(value, key, None)) for key in keys]
        if all(item is not None for item in coords):
            x1, y1, x2, y2 = [float(item) for item in coords if item is not None]
            return (x1, y1, x2, y2)
    return None


def _publication_table_xml_local_name(tag: str) -> str:
    if not tag:
        return ""
    if "}" in tag:
        return tag.rsplit("}", 1)[-1].lower()
    return str(tag).strip().lower()


def _publication_table_row_cell_total(cells: list[dict[str, Any]]) -> int:
    total = 0
    for cell in cells:
        total += max(1, _safe_int(cell.get("colspan")) or 1)
    return total


def _publication_table_extract_rows(table_element: ET.Element) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    direct_rows = [
        child
        for child in list(table_element)
        if _publication_table_xml_local_name(child.tag) == "tr"
    ]
    if direct_rows:
        section_elements = [("tbody", direct_rows)]
    else:
        section_elements = []
        for child in list(table_element):
            section_name = _publication_table_xml_local_name(child.tag)
            if section_name not in {"thead", "tbody", "tfoot"}:
                continue
            child_rows = [
                row for row in list(child) if _publication_table_xml_local_name(row.tag) == "tr"
            ]
            if child_rows:
                section_elements.append((section_name, child_rows))
    for section_name, child_rows in section_elements:
        for row in child_rows:
            cells: list[dict[str, Any]] = []
            for cell in list(row):
                cell_tag = _publication_table_xml_local_name(cell.tag)
                if cell_tag not in {"th", "td"}:
                    continue
                text = _normalize_abstract_text(" ".join(cell.itertext()))
                cells.append(
                    {
                        "tag": cell_tag,
                        "text": text,
                        "colspan": _safe_int(cell.attrib.get("colspan")) or 1,
                        "rowspan": _safe_int(cell.attrib.get("rowspan")) or 1,
                    }
                )
            if cells:
                rows.append({"section": section_name, "cells": cells})
    return rows


def _publication_table_note_like_row(
    *,
    cells: list[dict[str, Any]],
    total_columns: int,
    seen_data_rows: bool,
) -> bool:
    if not seen_data_rows or total_columns <= 1 or not cells:
        return False
    texts = [str(cell.get("text") or "").strip() for cell in cells if str(cell.get("text") or "").strip()]
    if not texts:
        return False
    combined = _normalize_abstract_text(" ".join(texts))
    if not combined:
        return False
    non_empty_count = len(texts)
    cell_total = _publication_table_row_cell_total(cells)
    if DOCLING_TABLE_NOTE_PREFIX_PATTERN.match(combined):
        return True
    if non_empty_count == 1 and cell_total >= max(total_columns - 1, 2):
        if len(combined) >= 18:
            return True
    return False


def _publication_table_render_cells(cells: list[dict[str, Any]]) -> str:
    rendered: list[str] = []
    for cell in cells:
        tag = "th" if str(cell.get("tag") or "").lower() == "th" else "td"
        attrs: list[str] = []
        colspan = max(1, _safe_int(cell.get("colspan")) or 1)
        rowspan = max(1, _safe_int(cell.get("rowspan")) or 1)
        if colspan > 1:
            attrs.append(f' colspan="{colspan}"')
        if rowspan > 1:
            attrs.append(f' rowspan="{rowspan}"')
        text = html.escape(str(cell.get("text") or ""))
        rendered.append(f"<{tag}{''.join(attrs)}>{text}</{tag}>")
    return "".join(rendered)


def _canonicalize_docling_table_html(html_text: str) -> str:
    raw = str(html_text or "").strip()
    if "<table" not in raw.lower():
        return raw
    try:
        wrapped = ET.fromstring(f"<root>{raw}</root>")
    except Exception:
        return raw
    table_element = None
    for candidate in wrapped.iter():
        if _publication_table_xml_local_name(candidate.tag) == "table":
            table_element = candidate
            break
    if table_element is None:
        return raw

    rows = _publication_table_extract_rows(table_element)
    if not rows:
        return raw

    total_columns = max((_publication_table_row_cell_total(row["cells"]) for row in rows), default=0)
    header_rows: list[list[dict[str, Any]]] = []
    body_rows: list[list[dict[str, Any]]] = []
    notes: list[str] = []
    seen_data_rows = False
    inferred_header = False
    for index, row in enumerate(rows):
        cells = row["cells"]
        section = str(row.get("section") or "tbody").lower()
        if section == "tfoot" and _publication_table_note_like_row(
            cells=cells,
            total_columns=total_columns,
            seen_data_rows=seen_data_rows or bool(body_rows),
        ):
            note_text = _normalize_abstract_text(" ".join(str(cell.get("text") or "") for cell in cells))
            if note_text:
                notes.append(note_text)
            continue
        if _publication_table_note_like_row(
            cells=cells,
            total_columns=total_columns,
            seen_data_rows=seen_data_rows,
        ):
            note_text = _normalize_abstract_text(" ".join(str(cell.get("text") or "") for cell in cells))
            if note_text:
                notes.append(note_text)
            continue
        if section == "thead":
            header_rows.append(cells)
            continue
        if (
            not header_rows
            and not inferred_header
            and index == 0
            and all(str(cell.get("tag") or "").lower() == "th" for cell in cells)
        ):
            header_rows.append(cells)
            inferred_header = True
            continue
        body_rows.append(cells)
        seen_data_rows = True

    if not body_rows and header_rows:
        body_rows = header_rows
        header_rows = []
    if not body_rows:
        return raw

    parts = ["<table>"]
    if header_rows:
        parts.append("<thead>")
        for row in header_rows:
            parts.append(f"<tr>{_publication_table_render_cells(row)}</tr>")
        parts.append("</thead>")
    parts.append("<tbody>")
    for row in body_rows:
        parts.append(f"<tr>{_publication_table_render_cells(row)}</tr>")
    parts.append("</tbody></table>")
    if notes:
        parts.append('<div class="publication-structured-table-notes">')
        for note in notes:
            parts.append(f"<p>{html.escape(note)}</p>")
        parts.append("</div>")
    return "".join(parts)


def _docling_table_asset_coordinate_overlap_score(
    *,
    docling_coords: str | None,
    asset_coords: str | None,
) -> float:
    docling_entries = _parse_grobid_coords(docling_coords)
    asset_entries = _parse_grobid_coords(asset_coords)
    if not docling_entries or not asset_entries:
        return 0.0
    best = 0.0
    for doc_page, dx1, dy1, dx2, dy2 in docling_entries:
        doc_area = max(0.0, dx2 - dx1) * max(0.0, dy2 - dy1)
        if doc_area <= 0:
            continue
        for asset_page, ax1, ay1, ax2, ay2 in asset_entries:
            if doc_page != asset_page:
                continue
            ix1 = max(dx1, ax1)
            iy1 = max(dy1, ay1)
            ix2 = min(dx2, ax2)
            iy2 = min(dy2, ay2)
            intersection = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
            if intersection <= 0:
                continue
            best = max(best, intersection / doc_area)
    return best


def _extract_structured_publication_paper_with_grobid(
    *, content: bytes, title: str | None = None, file_name: str | None = None
) -> dict[str, Any]:
    tei_xml = _request_grobid_fulltext_tei(
        content=content,
        file_name=file_name or "publication.pdf",
    )
    parsed_payload = _parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml, title=title
    )
    aligned_sections, aligned_page_count = (
        _align_structured_publication_sections_to_pdf_pages(
            sections=(
                parsed_payload.get("sections")
                if isinstance(parsed_payload.get("sections"), list)
                else []
            ),
            content=content,
        )
    )
    parsed_payload["sections"] = aligned_sections
    parsed_payload["figures"] = _align_structured_publication_assets_to_pdf_pages(
        assets=(
            parsed_payload.get("figures")
            if isinstance(parsed_payload.get("figures"), list)
            else []
        ),
        content=content,
    )
    parsed_payload["tables"] = _align_structured_publication_assets_to_pdf_pages(
        assets=(
            parsed_payload.get("tables")
            if isinstance(parsed_payload.get("tables"), list)
            else []
        ),
        content=content,
    )
    if aligned_page_count is not None:
        parsed_payload["page_count"] = aligned_page_count

    figures = (
        parsed_payload.get("figures")
        if isinstance(parsed_payload.get("figures"), list)
        else []
    )
    if figures:
        parsed_payload["figures"] = _crop_figure_images_from_pdf(content, figures)

    tables = (
        parsed_payload.get("tables")
        if isinstance(parsed_payload.get("tables"), list)
        else []
    )
    if tables:
        try:
            docling_tables = _extract_docling_tables_html(content)
            if docling_tables:
                parsed_payload["tables"] = _match_docling_tables_to_assets(
                    docling_tables, tables
                )
        except Exception as exc:
            logger.warning("Docling table enrichment skipped: %s", exc)

    return parsed_payload


def _extract_structured_publication_assets_with_grobid(
    *, content: bytes, file_name: str | None = None, title: str | None = None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    tei_xml = _request_grobid_fulltext_tei(
        content=content,
        file_name=file_name or "publication.pdf",
    )
    parsed_payload = _parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml, title=title
    )
    figures = _align_structured_publication_assets_to_pdf_pages(
        assets=(
            parsed_payload.get("figures")
            if isinstance(parsed_payload.get("figures"), list)
            else []
        ),
        content=content,
    )
    tables = _align_structured_publication_assets_to_pdf_pages(
        assets=(
            parsed_payload.get("tables")
            if isinstance(parsed_payload.get("tables"), list)
            else []
        ),
        content=content,
    )
    if figures:
        figures = _crop_figure_images_from_pdf(content, figures)
    if tables:
        try:
            docling_tables = _extract_docling_tables_html(content)
            if docling_tables:
                tables = _match_docling_tables_to_assets(docling_tables, tables)
        except Exception as exc:
            logger.warning("Docling table enrichment skipped: %s", exc)
    return figures, tables


def _request_pmc_bioc_payload(pmcid: str) -> Any:
    clean_pmcid = str(pmcid or "").strip().upper()
    if not clean_pmcid.startswith("PMC"):
        return None
    json_text = _request_text_with_retry(
        url=(
            "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/"
            f"BioC_json/{clean_pmcid}/unicode"
        ),
        timeout_seconds=_unpaywall_timeout_seconds(),
        retries=max(1, _unpaywall_retry_count()),
        headers={
            "Accept": "application/json",
            "User-Agent": OPEN_ACCESS_FETCH_USER_AGENT,
        },
    )
    if not json_text.strip():
        return None
    try:
        return json.loads(json_text)
    except Exception:
        return None


def _pmc_bioc_document_zone(section_type: str | None) -> str | None:
    clean = str(section_type or "").strip().upper()
    if clean in {"TITLE", "ABSTRACT"}:
        return "front"
    if clean in {"REF", "ACK_FUND", "SUPPL"}:
        return "back"
    if clean:
        return "body"
    return None


def _pmc_bioc_canonical_kind(section_type: str | None, title: str | None) -> str:
    clean = str(section_type or "").strip().upper()
    mapping = {
        "INTRO": "introduction",
        "METHODS": "methods",
        "RESULTS": "results",
        "DISCUSS": "discussion",
        "CONCL": "conclusions",
        "REF": "references",
        "SUPPL": "supplementary_materials",
        "FIG": "figure",
        "TABLE": "table",
    }
    if clean == "ACK_FUND":
        guessed = _normalize_publication_paper_section_kind(title or "Funding")
        if guessed in {"funding", "acknowledgements", "conflicts", "data_availability"}:
            return guessed
        return "funding"
    if clean in mapping:
        return mapping[clean]
    return _normalize_publication_paper_section_kind(title or clean or "section")


def _pmc_bioc_default_title(section_type: str | None) -> str:
    return _publication_paper_section_label(
        _pmc_bioc_canonical_kind(section_type, section_type)
    )


def _pmc_bioc_asset_title(
    *, caption: str, default_label: str, index: int
) -> str:
    clean_caption = _normalize_abstract_text(caption)
    match = re.match(
        r"^(?:figure|fig\.?|table)\s+(\d+[A-Za-z]?)\b",
        clean_caption,
        flags=re.IGNORECASE,
    )
    if match:
        return f"{default_label} {match.group(1).upper()}"
    return f"{default_label} {index}"


def _parse_pmc_bioc_into_structured_paper(
    *, payload: Any, title: str | None = None
) -> dict[str, Any]:
    collections = payload if isinstance(payload, list) else [payload]
    document = None
    for collection in collections:
        if not isinstance(collection, dict):
            continue
        documents = collection.get("documents")
        if isinstance(documents, list) and documents:
            for candidate in documents:
                if isinstance(candidate, dict):
                    document = candidate
                    break
        if document is not None:
            break
    if document is None:
        raise PublicationConsoleValidationError(
            "PMC BioC did not return a readable document payload."
        )

    passages = document.get("passages")
    if not isinstance(passages, list) or not passages:
        raise PublicationConsoleValidationError(
            "PMC BioC did not return any readable passages."
        )

    section_states: list[dict[str, Any]] = []
    state_by_temp_id: dict[str, dict[str, Any]] = {}
    current_temp_ids: dict[int, str] = {}
    figures: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    references: list[dict[str, Any]] = []
    seen_reference_markers: set[str] = set()

    def _create_state(
        *,
        heading: str,
        section_type: str | None,
        level: int,
        parent_temp_id: str | None,
        generated: bool,
    ) -> dict[str, Any]:
        temp_id = f"pmc-bioc-section-{len(section_states) + 1}"
        state = {
            "temp_id": temp_id,
            "heading": heading,
            "section_type": str(section_type or "").strip().upper() or None,
            "canonical_kind": _pmc_bioc_canonical_kind(section_type, heading),
            "document_zone": _pmc_bioc_document_zone(section_type),
            "level": max(1, int(level or 1)),
            "parent_temp_id": parent_temp_id,
            "blocks": [],
            "is_generated_heading": generated,
        }
        section_states.append(state)
        state_by_temp_id[temp_id] = state
        current_temp_ids[state["level"]] = temp_id
        for depth in list(current_temp_ids):
            if depth > state["level"]:
                current_temp_ids.pop(depth, None)
        return state

    def _match_current_state(section_type: str | None) -> dict[str, Any] | None:
        clean_type = str(section_type or "").strip().upper() or None
        for level in sorted(current_temp_ids.keys(), reverse=True):
            state = state_by_temp_id.get(current_temp_ids[level])
            if state is None:
                continue
            if clean_type is None or state.get("section_type") == clean_type:
                return state
        return None

    for passage in passages:
        if not isinstance(passage, dict):
            continue
        infons = passage.get("infons") if isinstance(passage.get("infons"), dict) else {}
        passage_type = str(infons.get("type") or "").strip().lower()
        section_type = str(infons.get("section_type") or "").strip().upper() or None
        passage_text = _normalize_abstract_text(str(passage.get("text") or ""))
        if passage_type in {"front", "abstract", "abstract_title_1"}:
            continue
        if passage_type in {"fig_caption", "table_caption"}:
            if not passage_text:
                continue
            default_label = "Figure" if passage_type == "fig_caption" else "Table"
            asset_list = figures if passage_type == "fig_caption" else tables
            asset_list.append(
                _build_parsed_publication_paper_asset(
                    asset_id=f"pmc-bioc-{default_label.lower()}-{len(asset_list) + 1}",
                    title=_pmc_bioc_asset_title(
                        caption=passage_text,
                        default_label=default_label,
                        index=len(asset_list) + 1,
                    ),
                    classification=(
                        FILE_CLASSIFICATION_FIGURE
                        if passage_type == "fig_caption"
                        else FILE_CLASSIFICATION_TABLE
                    ),
                    caption=passage_text,
                    source_parser=STRUCTURED_PAPER_SECTION_SOURCE_PMC_BIOC,
                )
            )
            continue
        if passage_type == "ref":
            if not passage_text:
                continue
            marker = passage_text.casefold()
            if marker in seen_reference_markers:
                continue
            seen_reference_markers.add(marker)
            references.append(
                {
                    "id": f"paper-reference-{len(references) + 1}",
                    "label": f"Reference {len(references) + 1}",
                    "raw_text": passage_text,
                }
            )
            continue
        if passage_type.startswith("title"):
            if not passage_text or section_type in {"TITLE", "ABSTRACT", "REF"}:
                continue
            level = _safe_int(passage_type.rsplit("_", 1)[-1]) or 1
            parent_temp_id = current_temp_ids.get(level - 1) if level > 1 else None
            _create_state(
                heading=passage_text,
                section_type=section_type,
                level=level,
                parent_temp_id=parent_temp_id,
                generated=False,
            )
            continue
        if passage_type != "paragraph" or not passage_text:
            continue
        if section_type in {"TITLE", "ABSTRACT", "REF"}:
            continue
        state = _match_current_state(section_type)
        if state is None:
            state = _create_state(
                heading=_pmc_bioc_default_title(section_type),
                section_type=section_type,
                level=1,
                parent_temp_id=None,
                generated=True,
            )
        state["blocks"].append(passage_text)

    child_temp_ids = {
        str(state.get("parent_temp_id") or "")
        for state in section_states
        if str(state.get("parent_temp_id") or "").strip()
    }
    kept_states = [
        state
        for state in section_states
        if state.get("blocks") or str(state.get("temp_id") or "") in child_temp_ids
    ]

    sections: list[dict[str, Any]] = []
    temp_to_real_id: dict[str, str] = {}
    for order, state in enumerate(kept_states):
        parent_temp_id = str(state.get("parent_temp_id") or "").strip() or None
        serialized = _serialize_publication_paper_section(
            order=order,
            title=str(state.get("heading") or "").strip() or _pmc_bioc_default_title(
                state.get("section_type")
            ),
            raw_label=str(state.get("heading") or "").strip() or None,
            canonical_kind=str(state.get("canonical_kind") or "section"),
            content="\n\n".join(state.get("blocks") or []),
            source=STRUCTURED_PAPER_SECTION_SOURCE_PMC_BIOC,
            level=_safe_int(state.get("level")) or 1,
            parent_id=temp_to_real_id.get(parent_temp_id) if parent_temp_id else None,
            allow_empty=not bool(state.get("blocks")),
            is_generated_heading=bool(state.get("is_generated_heading")),
            document_zone=str(state.get("document_zone") or "").strip() or None,
        )
        if serialized is None:
            continue
        temp_to_real_id[str(state.get("temp_id") or "")] = str(serialized["id"])
        sections.append(serialized)

    return {
        "sections": sections,
        "figures": figures,
        "tables": tables,
        "references": references[:500],
        "page_count": None,
        "generation_method": "pmc_bioc_fulltext_v1",
        "parser_provider": STRUCTURED_PAPER_PARSER_PROVIDER_PMC_BIOC,
    }


def _extract_structured_publication_paper_with_pmc_bioc(
    *,
    pmcid: str,
    content: bytes,
    title: str | None = None,
    enrich_assets: bool = True,
    align_to_pdf: bool = True,
) -> dict[str, Any]:
    payload = _request_pmc_bioc_payload(pmcid)
    if payload is None:
        raise PublicationConsoleValidationError(
            f"PMC BioC full-text parsing was unavailable for {pmcid}."
        )
    parsed_payload = _parse_pmc_bioc_into_structured_paper(payload=payload, title=title)
    aligned_page_count: int | None = None
    if align_to_pdf:
        aligned_sections, aligned_page_count = (
            _align_structured_publication_sections_to_pdf_pages(
                sections=(
                    parsed_payload.get("sections")
                    if isinstance(parsed_payload.get("sections"), list)
                    else []
                ),
                content=content,
            )
        )
        parsed_payload["sections"] = aligned_sections
        parsed_payload["figures"] = _align_structured_publication_assets_to_pdf_pages(
            assets=(
                parsed_payload.get("figures")
                if isinstance(parsed_payload.get("figures"), list)
                else []
            ),
            content=content,
        )
        parsed_payload["tables"] = _align_structured_publication_assets_to_pdf_pages(
            assets=(
                parsed_payload.get("tables")
                if isinstance(parsed_payload.get("tables"), list)
                else []
            ),
            content=content,
        )
    else:
        parsed_payload["sections"] = [
            dict(item)
            for item in parsed_payload.get("sections", [])
            if isinstance(item, dict)
        ]
        parsed_payload["figures"] = [
            dict(item)
            for item in parsed_payload.get("figures", [])
            if isinstance(item, dict)
        ]
        parsed_payload["tables"] = [
            dict(item)
            for item in parsed_payload.get("tables", [])
            if isinstance(item, dict)
        ]
    if enrich_assets and (not parsed_payload["figures"] or not parsed_payload["tables"]):
        try:
            grobid_figures, grobid_tables = (
                _extract_structured_publication_assets_with_grobid(
                    content=content,
                    file_name="publication.pdf",
                    title=title,
                )
            )
            if grobid_figures and not parsed_payload["figures"]:
                parsed_payload["figures"] = grobid_figures
            if grobid_tables and not parsed_payload["tables"]:
                parsed_payload["tables"] = grobid_tables
        except Exception as exc:
            logger.warning(
                "GROBID asset enrichment skipped for %s: %s", pmcid, exc
            )
    if aligned_page_count is not None:
        parsed_payload["page_count"] = aligned_page_count
    return parsed_payload


def _extract_structured_publication_paper_with_best_available_parser(
    *,
    content: bytes,
    title: str | None = None,
    file_name: str | None = None,
    pmid: str | None = None,
    doi: str | None = None,
    year: int | None = None,
    enrich_assets: bool = True,
    align_to_pdf: bool = True,
) -> dict[str, Any]:
    pmcid = _resolve_pmcid(
        pmid=pmid,
        doi=doi,
        title=title,
        year=year,
    )
    if pmcid:
        try:
            return _extract_structured_publication_paper_with_pmc_bioc(
                pmcid=pmcid,
                content=content,
                title=title,
                enrich_assets=enrich_assets,
                align_to_pdf=align_to_pdf,
            )
        except Exception as exc:
            logger.warning("PMC BioC parse skipped for %s: %s", pmcid, exc)
    return _extract_structured_publication_paper_with_grobid(
        content=content,
        title=title,
        file_name=file_name,
    )


def _publication_paper_payload_needs_asset_enrichment(
    payload: dict[str, Any] | None,
    *,
    now: datetime | None = None,
) -> bool:
    if not isinstance(payload, dict):
        return False
    document = payload.get("document") if isinstance(payload.get("document"), dict) else {}
    provenance = (
        payload.get("provenance") if isinstance(payload.get("provenance"), dict) else {}
    )
    if not bool(document.get("has_viewable_pdf")):
        return False
    if str(document.get("parser_status") or "").strip().upper() != STRUCTURED_PAPER_STATUS_FULL_TEXT_READY:
        return False
    if (
        str(provenance.get("parser_provider") or "").strip().upper()
        != STRUCTURED_PAPER_PARSER_PROVIDER_PMC_BIOC
    ):
        return False
    component_summary = (
        payload.get("component_summary")
        if isinstance(payload.get("component_summary"), dict)
        else {}
    )
    figure_count = max(
        0, int(_safe_int(component_summary.get("figure_asset_count")) or 0)
    )
    table_count = max(
        0, int(_safe_int(component_summary.get("table_asset_count")) or 0)
    )
    if figure_count > 0 and table_count > 0:
        return False
    enrichment_status = (
        str(provenance.get("asset_enrichment_status") or "").strip().upper() or None
    )
    enrichment_checked_at = _parse_iso_datetime(
        provenance.get("asset_enrichment_checked_at")
    )
    if enrichment_status in {
        STRUCTURED_PAPER_ASSET_ENRICHMENT_STATUS_COMPLETE,
        STRUCTURED_PAPER_ASSET_ENRICHMENT_STATUS_EMPTY,
    } and enrichment_checked_at is not None:
        return _is_stale(
            computed_at=enrichment_checked_at,
            ttl_seconds=_structured_paper_asset_enrichment_retry_seconds(),
            now=now,
        )
    if (
        enrichment_status == STRUCTURED_PAPER_ASSET_ENRICHMENT_STATUS_FAILED
        and enrichment_checked_at is not None
    ):
        return _is_stale(
            computed_at=enrichment_checked_at,
            ttl_seconds=_structured_paper_asset_enrichment_failure_retry_seconds(),
            now=now,
        )
    return True


def _build_publication_paper_asset_enrichment_payload(
    *,
    publication: dict[str, Any],
    structured_abstract_payload: dict[str, Any],
    structured_abstract_status: str,
    files: list[dict[str, Any]],
    current_payload: dict[str, Any],
    figures: list[dict[str, Any]] | None,
    tables: list[dict[str, Any]] | None,
    asset_enrichment_status: str,
    asset_enrichment_checked_at: datetime,
    asset_enrichment_last_error: str | None = None,
) -> tuple[dict[str, Any], str]:
    document = (
        current_payload.get("document")
        if isinstance(current_payload.get("document"), dict)
        else {}
    )
    provenance = (
        current_payload.get("provenance")
        if isinstance(current_payload.get("provenance"), dict)
        else {}
    )
    parsed_paper = {
        "sections": [
            item
            for item in current_payload.get("sections", [])
            if isinstance(item, dict)
        ],
        "references": [
            item
            for item in current_payload.get("references", [])
            if isinstance(item, dict)
        ],
        "figures": (
            figures
            if figures is not None
            else [
                item
                for item in current_payload.get("figures", [])
                if isinstance(item, dict)
            ]
        ),
        "tables": (
            tables
            if tables is not None
            else [
                item
                for item in current_payload.get("tables", [])
                if isinstance(item, dict)
            ]
        ),
        "page_count": _safe_int(document.get("page_count")),
        "generation_method": str(document.get("generation_method") or "").strip()
        or str(provenance.get("full_text_generation_method") or "").strip()
        or None,
        "parser_provider": str(provenance.get("parser_provider") or "").strip()
        or None,
        "asset_enrichment_status": asset_enrichment_status,
        "asset_enrichment_checked_at": _coerce_utc(asset_enrichment_checked_at).isoformat(),
        "asset_enrichment_last_error": _normalize_abstract_text(
            asset_enrichment_last_error
        )
        or None,
    }
    return _build_publication_paper_payload(
        publication=publication,
        structured_abstract_payload=structured_abstract_payload,
        structured_abstract_status=structured_abstract_status,
        files=files,
        parsed_paper=parsed_paper,
        parser_status=STRUCTURED_PAPER_STATUS_FULL_TEXT_READY,
        parser_last_error=(
            _normalize_abstract_text(str(document.get("parser_last_error") or ""))
            or None
        ),
    )


def _build_ai_payload(
    *, publication: dict[str, Any], impact_payload: dict[str, Any]
) -> dict[str, Any]:
    title = str(publication.get("title") or "").strip() or "This publication"
    journal = str(publication.get("journal") or "").strip() or "Not available"
    total = max(0, int(_safe_int(impact_payload.get("citations_total")) or 0))
    last12 = max(0, int(_safe_int(impact_payload.get("citations_last_12m")) or 0))
    prev12 = max(0, int(_safe_int(impact_payload.get("citations_prev_12m")) or 0))
    yoy = _safe_float(impact_payload.get("yoy_pct"))
    acceleration = (
        _safe_float(impact_payload.get("acceleration_citations_per_month")) or 0.0
    )

    per_year = (
        impact_payload.get("per_year")
        if isinstance(impact_payload.get("per_year"), list)
        else []
    )
    trajectory = _normalize_trajectory(_classify_trajectory(per_year))

    summary_parts = [
        f"{title} has {total} total citations, with {last12} citations in the last 12 months."
    ]
    if prev12 > 0 and yoy is not None:
        summary_parts.append(
            f"This is {yoy}% versus the previous 12-month window ({prev12} citations)."
        )
    elif prev12 == 0 and last12 > 0:
        summary_parts.append(
            "No prior 12-month baseline is available for direct YoY comparison."
        )
    else:
        summary_parts.append("Recent citation momentum is currently limited.")
    summary_parts.append(
        f"Estimated acceleration is {round(acceleration, 2)} citations per month."
    )
    summary_parts.append(
        f"Trajectory classification: {trajectory.replace('_', ' ').title()}."
    )

    key_points = _extract_key_points_from_abstract(publication.get("abstract"))
    reuse = _build_reuse_suggestions(
        title=title, journal=journal, trajectory=trajectory, key_points=key_points
    )
    caution = _build_caution_flags(
        abstract=publication.get("abstract"), key_points=key_points
    )

    return {
        "label": "AI-generated draft insights",
        "performance_summary": " ".join(summary_parts),
        "trajectory_classification": trajectory,
        "extractive_key_points": key_points,
        "reuse_suggestions": reuse,
        "caution_flags": caution,
    }


def _load_impact_cache(
    session, *, user_id: str, publication_id: str, for_update: bool = False
) -> PublicationImpactCache | None:
    query = select(PublicationImpactCache).where(
        PublicationImpactCache.owner_user_id == user_id,
        PublicationImpactCache.publication_id == publication_id,
    )
    if for_update:
        query = query.with_for_update()
    return session.scalars(query).first()


def _load_ai_cache(
    session, *, user_id: str, publication_id: str, for_update: bool = False
) -> PublicationAiCache | None:
    query = select(PublicationAiCache).where(
        PublicationAiCache.owner_user_id == user_id,
        PublicationAiCache.publication_id == publication_id,
    )
    if for_update:
        query = query.with_for_update()
    return session.scalars(query).first()


def _load_structured_abstract_cache(
    session, *, user_id: str, publication_id: str, for_update: bool = False
) -> PublicationStructuredAbstractCache | None:
    query = select(PublicationStructuredAbstractCache).where(
        PublicationStructuredAbstractCache.owner_user_id == user_id,
        PublicationStructuredAbstractCache.publication_id == publication_id,
    )
    if for_update:
        query = query.with_for_update()
    return session.scalars(query).first()


def _load_structured_paper_cache(
    session, *, user_id: str, publication_id: str, for_update: bool = False
) -> PublicationStructuredPaperCache | None:
    query = select(PublicationStructuredPaperCache).where(
        PublicationStructuredPaperCache.owner_user_id == user_id,
        PublicationStructuredPaperCache.publication_id == publication_id,
    )
    if for_update:
        query = query.with_for_update()
    return session.scalars(query).first()


def _load_publication_paper_source_state(
    *, user_id: str, publication_id: str
) -> dict[str, Any]:
    with session_scope() as session:
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        latest = _latest_metric_for_work(session, work_id=publication_id)
        citations_total = (
            int(latest.citations_count or 0)
            if latest is not None
            else int(work.citations_total or 0)
        )
        summary = _build_publication_summary(
            work, citations_total=max(0, citations_total)
        )
        structured_row = _load_structured_abstract_cache(
            session, user_id=user_id, publication_id=publication_id
        )
        (
            structured_payload,
            structured_status,
            _structured_computed_at,
            structured_last_error,
        ) = _structured_abstract_view_payload(
            row=structured_row,
            abstract=summary.get("abstract"),
            pmid=summary.get("pmid"),
            doi=summary.get("doi"),
            title=summary.get("title"),
            year=_safe_int(summary.get("year")),
        )
    files_payload = list_publication_files(
        user_id=user_id, publication_id=publication_id
    )
    active_files = (
        files_payload.get("items")
        if isinstance(files_payload.get("items"), list)
        else []
    )
    return {
        "publication": summary,
        "structured_abstract_payload": structured_payload,
        "structured_abstract_status": structured_status,
        "structured_abstract_last_error": structured_last_error,
        "files": active_files,
    }


def _enqueue_authors_if_needed(*, user_id: str, publication_id: str) -> bool:
    with session_scope() as session:
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id, for_update=True
        )
        status = _normalize_status(work.authors_status)
        now = _utcnow()
        has_cached = isinstance(work.authors_json, list) and len(work.authors_json) > 0
        stale = _is_stale(
            computed_at=_coerce_utc_or_none(work.authors_computed_at),
            ttl_seconds=_authors_ttl_seconds(),
            now=now,
        )
        should_enqueue = (not has_cached or stale) and status != RUNNING_STATUS
        if not should_enqueue:
            return False
        work.authors_status = RUNNING_STATUS
        work.authors_last_error = None
        session.flush()

    return _submit_background_job(
        kind="authors",
        user_id=user_id,
        publication_id=publication_id,
        fn=_run_authors_hydration_job,
    )


def _enqueue_impact_if_needed(*, user_id: str, publication_id: str) -> bool:
    with session_scope() as session:
        _resolve_work_or_raise(session, user_id=user_id, publication_id=publication_id)
        row = _load_impact_cache(
            session, user_id=user_id, publication_id=publication_id, for_update=True
        )
        now = _utcnow()
        if row is None:
            row = PublicationImpactCache(
                owner_user_id=user_id,
                publication_id=publication_id,
                payload_json={},
                computed_at=None,
                status=RUNNING_STATUS,
                last_error=None,
                updated_at=now,
            )
            session.add(row)
            session.flush()
            should_enqueue = True
        else:
            payload = row.payload_json if isinstance(row.payload_json, dict) else {}
            stale = _is_stale(
                computed_at=_coerce_utc_or_none(row.computed_at),
                ttl_seconds=_impact_ttl_seconds(),
                now=now,
            )
            status = _normalize_status(row.status)
            should_enqueue = (not payload or stale) and status != RUNNING_STATUS
            if should_enqueue:
                row.status = RUNNING_STATUS
                row.last_error = None
                row.updated_at = now
                session.flush()
        if not should_enqueue:
            return False

    return _submit_background_job(
        kind="impact",
        user_id=user_id,
        publication_id=publication_id,
        fn=_run_impact_compute_job,
    )


def _enqueue_ai_if_needed(*, user_id: str, publication_id: str) -> bool:
    with session_scope() as session:
        _resolve_work_or_raise(session, user_id=user_id, publication_id=publication_id)
        row = _load_ai_cache(
            session, user_id=user_id, publication_id=publication_id, for_update=True
        )
        now = _utcnow()
        if row is None:
            row = PublicationAiCache(
                owner_user_id=user_id,
                publication_id=publication_id,
                payload_json={},
                computed_at=None,
                status=RUNNING_STATUS,
                last_error=None,
                updated_at=now,
            )
            session.add(row)
            session.flush()
            should_enqueue = True
        else:
            payload = row.payload_json if isinstance(row.payload_json, dict) else {}
            stale = _is_stale(
                computed_at=_coerce_utc_or_none(row.computed_at),
                ttl_seconds=_ai_ttl_seconds(),
                now=now,
            )
            status = _normalize_status(row.status)
            should_enqueue = (not payload or stale) and status != RUNNING_STATUS
            if should_enqueue:
                row.status = RUNNING_STATUS
                row.last_error = None
                row.updated_at = now
                session.flush()
        if not should_enqueue:
            return False

    return _submit_background_job(
        kind="ai",
        user_id=user_id,
        publication_id=publication_id,
        fn=_run_ai_compute_job,
    )


def _enqueue_structured_abstract_if_needed(
    *, user_id: str, publication_id: str, force: bool = False
) -> bool:
    with session_scope() as session:
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id, for_update=True
        )
        row = _load_structured_abstract_cache(
            session, user_id=user_id, publication_id=publication_id, for_update=True
        )
        now = _utcnow()
        abstract = _normalize_abstract_text(work.abstract)
        pmid = _normalize_pmid(work.pmid) or _extract_pmid_from_text(work.url)
        doi = _normalize_doi(work.doi)
        title = _normalize_abstract_text(work.title)
        year = _safe_int(work.year)
        has_source_seed = bool(abstract or pmid or doi)
        abstract_seed_hash = _structured_abstract_seed_hash(
            abstract=abstract,
            pmid=pmid,
            doi=doi,
            title=title,
            year=year,
        )
        parser_version = STRUCTURED_ABSTRACT_CACHE_VERSION
        if row is None:
            row = PublicationStructuredAbstractCache(
                owner_user_id=user_id,
                publication_id=publication_id,
                payload_json={}
                if has_source_seed
                else _empty_structured_abstract_payload(),
                source_abstract_sha256=abstract_seed_hash,
                parser_version=parser_version,
                model_name=None,
                computed_at=None if has_source_seed else now,
                status=RUNNING_STATUS if has_source_seed else READY_STATUS,
                last_error=None,
                updated_at=now,
            )
            session.add(row)
            session.flush()
            should_enqueue = has_source_seed
            if not has_source_seed:
                return False
        else:
            payload = row.payload_json if isinstance(row.payload_json, dict) else {}
            status = _normalize_status(row.status)
            hash_changed = str(row.source_abstract_sha256 or "") != str(
                abstract_seed_hash or ""
            )
            version_changed = (
                _normalize_abstract_text(str(row.parser_version or ""))
                != parser_version
            )
            should_enqueue = has_source_seed and (
                force or not payload or hash_changed or version_changed
            )
            if should_enqueue and status != RUNNING_STATUS:
                row.last_error = None
                row.updated_at = now
                if payload:
                    # Keep existing structured payload visible while refresh runs in background.
                    row.status = READY_STATUS
                else:
                    row.status = RUNNING_STATUS
                    row.source_abstract_sha256 = abstract_seed_hash
                    row.parser_version = parser_version
                session.flush()
            elif not has_source_seed:
                row.payload_json = _empty_structured_abstract_payload()
                row.source_abstract_sha256 = None
                row.parser_version = parser_version
                row.model_name = None
                row.status = READY_STATUS
                row.last_error = None
                row.computed_at = now
                row.updated_at = now
                session.flush()
                return False
        if not should_enqueue:
            return False

    return _submit_background_job(
        kind="structured_abstract",
        user_id=user_id,
        publication_id=publication_id,
        fn=lambda *, user_id, publication_id: _run_structured_abstract_compute_job(
            user_id=user_id,
            publication_id=publication_id,
            force=force,
        ),
    )


def _run_authors_hydration_job(*, user_id: str, publication_id: str) -> None:
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id, for_update=True
        )
        result = _hydrate_authors_data(work=work, user_email=user.email)
        if result["status"] == READY_STATUS:
            work.authors_json = result["authors_json"]
            work.affiliations_json = result["affiliations_json"]
            work.authors_status = READY_STATUS
            work.authors_last_error = None
            work.authors_computed_at = _utcnow()
            openalex_work_id = _extract_openalex_work_id(result.get("openalex_work_id"))
            if openalex_work_id and not _extract_openalex_work_id(
                work.openalex_work_id
            ):
                work.openalex_work_id = openalex_work_id
            session.flush()
            return

        work.authors_status = FAILED_STATUS
        work.authors_last_error = (
            "Could not resolve authors from PubMed, Crossref, or OpenAlex."
        )
        session.flush()


def _run_impact_compute_job(*, user_id: str, publication_id: str) -> None:
    now = _utcnow()
    try:
        with session_scope() as session:
            payload = _build_impact_payload(
                session, user_id=user_id, publication_id=publication_id
            )
            work = _resolve_work_or_raise(
                session, user_id=user_id, publication_id=publication_id, for_update=True
            )
            row = _load_impact_cache(
                session, user_id=user_id, publication_id=publication_id, for_update=True
            )
            if row is None:
                row = PublicationImpactCache(
                    owner_user_id=user_id, publication_id=publication_id
                )
                session.add(row)
                session.flush()
            row.payload_json = payload
            row.status = READY_STATUS
            row.last_error = None
            row.computed_at = now
            row.updated_at = now
            work.citations_total = max(
                0, int(_safe_int(payload.get("citations_total")) or 0)
            )
            openalex_work_id = _extract_openalex_work_id(
                str(((payload.get("metadata") or {}).get("openalex_work_id")) or "")
            )
            if openalex_work_id and not _extract_openalex_work_id(
                work.openalex_work_id
            ):
                work.openalex_work_id = openalex_work_id
            session.flush()
    except Exception as exc:
        with session_scope() as session:
            _resolve_work_or_raise(
                session, user_id=user_id, publication_id=publication_id
            )
            row = _load_impact_cache(
                session, user_id=user_id, publication_id=publication_id, for_update=True
            )
            if row is None:
                row = PublicationImpactCache(
                    owner_user_id=user_id,
                    publication_id=publication_id,
                    payload_json={},
                    computed_at=None,
                )
                session.add(row)
                session.flush()
            row.status = FAILED_STATUS
            row.last_error = str(exc)[:2000]
            row.updated_at = _utcnow()
            session.flush()


def _run_ai_compute_job(*, user_id: str, publication_id: str) -> None:
    now = _utcnow()
    try:
        with session_scope() as session:
            work = _resolve_work_or_raise(
                session, user_id=user_id, publication_id=publication_id, for_update=True
            )
            latest = _latest_metric_for_work(session, work_id=publication_id)
            citations_total = (
                int(latest.citations_count or 0)
                if latest is not None
                else int(work.citations_total or 0)
            )
            publication = _build_publication_summary(
                work, citations_total=max(0, int(citations_total))
            )

            impact_row = _load_impact_cache(
                session, user_id=user_id, publication_id=publication_id
            )
            impact_payload = (
                impact_row.payload_json
                if impact_row is not None and isinstance(impact_row.payload_json, dict)
                else {}
            )
            if not impact_payload:
                impact_payload = _build_impact_payload(
                    session, user_id=user_id, publication_id=publication_id
                )
                if impact_row is None:
                    impact_row = PublicationImpactCache(
                        owner_user_id=user_id, publication_id=publication_id
                    )
                    session.add(impact_row)
                    session.flush()
                impact_row.payload_json = impact_payload
                impact_row.status = READY_STATUS
                impact_row.last_error = None
                impact_row.computed_at = now
                impact_row.updated_at = now

            ai_payload = _build_ai_payload(
                publication=publication, impact_payload=impact_payload
            )
            row = _load_ai_cache(
                session, user_id=user_id, publication_id=publication_id, for_update=True
            )
            if row is None:
                row = PublicationAiCache(
                    owner_user_id=user_id, publication_id=publication_id
                )
                session.add(row)
                session.flush()
            row.payload_json = ai_payload
            row.status = READY_STATUS
            row.last_error = None
            row.computed_at = now
            row.updated_at = now
            session.flush()
    except Exception as exc:
        with session_scope() as session:
            _resolve_work_or_raise(
                session, user_id=user_id, publication_id=publication_id
            )
            row = _load_ai_cache(
                session, user_id=user_id, publication_id=publication_id, for_update=True
            )
            if row is None:
                row = PublicationAiCache(
                    owner_user_id=user_id,
                    publication_id=publication_id,
                    payload_json={},
                    computed_at=None,
                )
                session.add(row)
                session.flush()
            row.status = FAILED_STATUS
            row.last_error = str(exc)[:2000]
            row.updated_at = _utcnow()
            session.flush()


def _run_structured_abstract_compute_job(
    *, user_id: str, publication_id: str, force: bool = False
) -> None:
    now = _utcnow()
    try:
        with session_scope() as session:
            work = _resolve_work_or_raise(
                session, user_id=user_id, publication_id=publication_id, for_update=True
            )
            row = _load_structured_abstract_cache(
                session, user_id=user_id, publication_id=publication_id, for_update=True
            )
            if row is None:
                row = PublicationStructuredAbstractCache(
                    owner_user_id=user_id,
                    publication_id=publication_id,
                )
                session.add(row)
                session.flush()

            publication = _build_publication_summary(
                work, citations_total=max(0, int(work.citations_total or 0))
            )
            abstract = _normalize_abstract_text(publication.get("abstract"))
            pmid = _normalize_pmid(publication.get("pmid"))
            doi = _normalize_doi(publication.get("doi"))
            title = _normalize_abstract_text(publication.get("title"))
            year = _safe_int(publication.get("year"))
            has_source_seed = bool(abstract or pmid or doi)
            abstract_seed_hash = _structured_abstract_seed_hash(
                abstract=abstract,
                pmid=pmid,
                doi=doi,
                title=title,
                year=year,
            )
            parser_version = STRUCTURED_ABSTRACT_CACHE_VERSION

            existing_payload = (
                row.payload_json if isinstance(row.payload_json, dict) else {}
            )
            if (
                not force
                and has_source_seed
                and existing_payload
                and str(row.source_abstract_sha256 or "")
                == str(abstract_seed_hash or "")
                and _normalize_abstract_text(str(row.parser_version or ""))
                == parser_version
            ):
                row.status = READY_STATUS
                row.last_error = None
                row.updated_at = now
                if row.computed_at is None:
                    row.computed_at = now
                session.flush()
                return

            if not has_source_seed:
                payload = _empty_structured_abstract_payload()
                model_name = None
            else:
                payload, model_name = _build_structured_abstract_payload(
                    publication=publication
                )
            row.payload_json = payload
            row.source_abstract_sha256 = abstract_seed_hash
            row.parser_version = parser_version
            row.model_name = model_name
            row.status = READY_STATUS
            row.last_error = None
            row.computed_at = now
            row.updated_at = now
            session.flush()
    except Exception as exc:
        with session_scope() as session:
            _resolve_work_or_raise(
                session, user_id=user_id, publication_id=publication_id
            )
            row = _load_structured_abstract_cache(
                session, user_id=user_id, publication_id=publication_id, for_update=True
            )
            if row is None:
                row = PublicationStructuredAbstractCache(
                    owner_user_id=user_id,
                    publication_id=publication_id,
                    payload_json={},
                    computed_at=None,
                )
                session.add(row)
                session.flush()
            row.status = FAILED_STATUS
            row.last_error = str(exc)[:2000]
            row.updated_at = _utcnow()
            session.flush()


def _run_structured_paper_parse_job(*, user_id: str, publication_id: str) -> None:
    now = _utcnow()
    job_started_at = time.perf_counter()
    source_state: dict[str, Any] | None = None
    source_signature: str | None = None
    should_enqueue_asset_enrichment = False
    try:
        source_state_started_at = time.perf_counter()
        source_state = _load_publication_paper_source_state(
            user_id=user_id, publication_id=publication_id
        )
        source_state_duration_ms = round(
            (time.perf_counter() - source_state_started_at) * 1000, 2
        )
        seed_payload, source_signature = _build_publication_paper_payload(
            publication=source_state["publication"],
            structured_abstract_payload=source_state["structured_abstract_payload"],
            structured_abstract_status=source_state["structured_abstract_status"],
            files=source_state["files"],
            parser_status=STRUCTURED_PAPER_STATUS_PARSING,
        )
        primary_pdf_file_id = str(
            ((seed_payload.get("document") or {}).get("primary_pdf_file_id")) or ""
        ).strip()
        if not primary_pdf_file_id:
            with session_scope() as session:
                _resolve_work_or_raise(
                    session, user_id=user_id, publication_id=publication_id
                )
                row = _load_structured_paper_cache(
                    session,
                    user_id=user_id,
                    publication_id=publication_id,
                    for_update=True,
                )
                if row is None:
                    row = PublicationStructuredPaperCache(
                        owner_user_id=user_id,
                        publication_id=publication_id,
                    )
                    session.add(row)
                    session.flush()
                row.payload_json = seed_payload
                row.source_signature_sha256 = source_signature
                row.parser_version = STRUCTURED_PAPER_CACHE_VERSION
                row.computed_at = now
                row.status = READY_STATUS
                row.last_error = None
                session.flush()
            logger.info(
                "structured_paper_parse_completed_without_pdf",
                extra={
                    "user_id": user_id,
                    "publication_id": publication_id,
                    "source_state_ms": source_state_duration_ms,
                    "total_ms": round(
                        (time.perf_counter() - job_started_at) * 1000, 2
                    ),
                },
            )
            return

        binary_payload_started_at = time.perf_counter()
        binary_payload = _resolve_publication_file_binary_payload(
            user_id=user_id,
            publication_id=publication_id,
            file_id=primary_pdf_file_id,
            proxy_remote=True,
        )
        binary_payload_duration_ms = round(
            (time.perf_counter() - binary_payload_started_at) * 1000, 2
        )
        parser_started_at = time.perf_counter()
        parsed_paper = _extract_structured_publication_paper_with_best_available_parser(
            content=bytes(binary_payload.get("content") or b""),
            title=str(source_state["publication"].get("title") or "").strip() or None,
            file_name=str(binary_payload.get("file_name") or "").strip() or None,
            pmid=str(source_state["publication"].get("pmid") or "").strip() or None,
            doi=str(source_state["publication"].get("doi") or "").strip() or None,
            year=_safe_int(source_state["publication"].get("year")),
            enrich_assets=False,
            align_to_pdf=False,
        )
        parser_duration_ms = round(
            (time.perf_counter() - parser_started_at) * 1000, 2
        )
        persist_started_at = time.perf_counter()
        payload, source_signature = _build_publication_paper_payload(
            publication=source_state["publication"],
            structured_abstract_payload=source_state["structured_abstract_payload"],
            structured_abstract_status=source_state["structured_abstract_status"],
            files=source_state["files"],
            parsed_paper=parsed_paper,
            parser_status=STRUCTURED_PAPER_STATUS_FULL_TEXT_READY,
        )
        should_enqueue_asset_enrichment = _publication_paper_payload_needs_asset_enrichment(
            payload
        )
        with session_scope() as session:
            _resolve_work_or_raise(
                session, user_id=user_id, publication_id=publication_id
            )
            row = _load_structured_paper_cache(
                session, user_id=user_id, publication_id=publication_id, for_update=True
            )
            if row is None:
                row = PublicationStructuredPaperCache(
                    owner_user_id=user_id,
                    publication_id=publication_id,
                )
                session.add(row)
                session.flush()
            row.payload_json = payload
            row.source_signature_sha256 = source_signature
            row.parser_version = STRUCTURED_PAPER_CACHE_VERSION
            row.computed_at = now
            row.status = READY_STATUS
            row.last_error = None
            session.flush()
        persist_duration_ms = round(
            (time.perf_counter() - persist_started_at) * 1000, 2
        )
        logger.info(
            "structured_paper_parse_completed",
            extra={
                "user_id": user_id,
                "publication_id": publication_id,
                "source_state_ms": source_state_duration_ms,
                "binary_payload_ms": binary_payload_duration_ms,
                "parser_ms": parser_duration_ms,
                "persist_ms": persist_duration_ms,
                "enqueued_asset_enrichment": should_enqueue_asset_enrichment,
                "parser_provider": parsed_paper.get("parser_provider"),
                "generation_method": parsed_paper.get("generation_method"),
                "total_ms": round((time.perf_counter() - job_started_at) * 1000, 2),
            },
        )
        if should_enqueue_asset_enrichment:
            _submit_background_job(
                kind="structured_paper_assets",
                user_id=user_id,
                publication_id=publication_id,
                fn=_run_structured_paper_asset_enrichment_job,
            )
    except Exception as exc:
        failure_message = str(exc)[:2000]
        failure_payload: dict[str, Any] = {}
        if source_state is None:
            try:
                source_state = _load_publication_paper_source_state(
                    user_id=user_id, publication_id=publication_id
                )
            except Exception:
                source_state = None
        if source_state is not None:
            failure_payload, source_signature = _build_publication_paper_payload(
                publication=source_state["publication"],
                structured_abstract_payload=source_state["structured_abstract_payload"],
                structured_abstract_status=source_state["structured_abstract_status"],
                files=source_state["files"],
                parser_status=STRUCTURED_PAPER_STATUS_FAILED,
                parser_last_error=failure_message,
            )
        with session_scope() as session:
            _resolve_work_or_raise(
                session, user_id=user_id, publication_id=publication_id
            )
            row = _load_structured_paper_cache(
                session, user_id=user_id, publication_id=publication_id, for_update=True
            )
            if row is None:
                row = PublicationStructuredPaperCache(
                    owner_user_id=user_id,
                    publication_id=publication_id,
                )
                session.add(row)
                session.flush()
            if failure_payload:
                row.payload_json = failure_payload
            if source_signature:
                row.source_signature_sha256 = source_signature
            row.parser_version = STRUCTURED_PAPER_CACHE_VERSION
            row.computed_at = now
            row.status = FAILED_STATUS
            row.last_error = failure_message
            session.flush()


def _run_structured_paper_asset_enrichment_job(
    *, user_id: str, publication_id: str
) -> None:
    job_started_at = time.perf_counter()
    source_state = _load_publication_paper_source_state(
        user_id=user_id, publication_id=publication_id
    )
    seed_payload, source_signature = _build_publication_paper_payload(
        publication=source_state["publication"],
        structured_abstract_payload=source_state["structured_abstract_payload"],
        structured_abstract_status=source_state["structured_abstract_status"],
        files=source_state["files"],
    )
    document = (
        seed_payload.get("document")
        if isinstance(seed_payload.get("document"), dict)
        else {}
    )
    primary_pdf_file_id = str(document.get("primary_pdf_file_id") or "").strip()
    if not primary_pdf_file_id:
        return

    with session_scope() as session:
        _resolve_work_or_raise(session, user_id=user_id, publication_id=publication_id)
        row = _load_structured_paper_cache(
            session, user_id=user_id, publication_id=publication_id, for_update=True
        )
        if row is None:
            return
        current_payload = row.payload_json if isinstance(row.payload_json, dict) else {}
        if (
            str(row.source_signature_sha256 or "").strip() != str(source_signature or "").strip()
            or row.parser_version != STRUCTURED_PAPER_CACHE_VERSION
            or not _publication_paper_payload_needs_asset_enrichment(current_payload)
        ):
            return

    try:
        binary_payload_started_at = time.perf_counter()
        binary_payload = _resolve_publication_file_binary_payload(
            user_id=user_id,
            publication_id=publication_id,
            file_id=primary_pdf_file_id,
            proxy_remote=True,
        )
        binary_payload_duration_ms = round(
            (time.perf_counter() - binary_payload_started_at) * 1000, 2
        )
        enrichment_started_at = time.perf_counter()
        figures, tables = _extract_structured_publication_assets_with_grobid(
            content=bytes(binary_payload.get("content") or b""),
            title=str(source_state["publication"].get("title") or "").strip() or None,
            file_name=str(binary_payload.get("file_name") or "").strip() or None,
        )
        enrichment_duration_ms = round(
            (time.perf_counter() - enrichment_started_at) * 1000, 2
        )
        if not figures and not tables:
            persist_started_at = time.perf_counter()
            with session_scope() as session:
                _resolve_work_or_raise(
                    session, user_id=user_id, publication_id=publication_id
                )
                row = _load_structured_paper_cache(
                    session,
                    user_id=user_id,
                    publication_id=publication_id,
                    for_update=True,
                )
                if row is None:
                    return
                current_payload = (
                    row.payload_json if isinstance(row.payload_json, dict) else {}
                )
                if (
                    str(row.source_signature_sha256 or "").strip()
                    != str(source_signature or "").strip()
                    or row.parser_version != STRUCTURED_PAPER_CACHE_VERSION
                    or not _publication_paper_payload_needs_asset_enrichment(
                        current_payload
                    )
                ):
                    return
                payload, _ = _build_publication_paper_asset_enrichment_payload(
                    publication=source_state["publication"],
                    structured_abstract_payload=source_state["structured_abstract_payload"],
                    structured_abstract_status=source_state["structured_abstract_status"],
                    files=source_state["files"],
                    current_payload=current_payload,
                    figures=None,
                    tables=None,
                    asset_enrichment_status=STRUCTURED_PAPER_ASSET_ENRICHMENT_STATUS_EMPTY,
                    asset_enrichment_checked_at=_utcnow(),
                )
                row.payload_json = payload
                row.source_signature_sha256 = source_signature
                row.parser_version = STRUCTURED_PAPER_CACHE_VERSION
                row.computed_at = _utcnow()
                row.status = READY_STATUS
                row.last_error = None
                session.flush()
            persist_duration_ms = round(
                (time.perf_counter() - persist_started_at) * 1000, 2
            )
            logger.info(
                "structured_paper_asset_enrichment_completed_without_assets",
                extra={
                    "user_id": user_id,
                    "publication_id": publication_id,
                    "binary_payload_ms": binary_payload_duration_ms,
                    "enrichment_ms": enrichment_duration_ms,
                    "persist_ms": persist_duration_ms,
                    "total_ms": round(
                        (time.perf_counter() - job_started_at) * 1000, 2
                    ),
                },
            )
            return
        persist_started_at = time.perf_counter()
        with session_scope() as session:
            _resolve_work_or_raise(
                session, user_id=user_id, publication_id=publication_id
            )
            row = _load_structured_paper_cache(
                session,
                user_id=user_id,
                publication_id=publication_id,
                for_update=True,
            )
            if row is None:
                return
            current_payload = (
                row.payload_json if isinstance(row.payload_json, dict) else {}
            )
            if (
                str(row.source_signature_sha256 or "").strip()
                != str(source_signature or "").strip()
                or row.parser_version != STRUCTURED_PAPER_CACHE_VERSION
                or not _publication_paper_payload_needs_asset_enrichment(current_payload)
            ):
                return
            payload, _ = _build_publication_paper_asset_enrichment_payload(
                publication=source_state["publication"],
                structured_abstract_payload=source_state["structured_abstract_payload"],
                structured_abstract_status=source_state["structured_abstract_status"],
                files=source_state["files"],
                current_payload=current_payload,
                figures=figures,
                tables=tables,
                asset_enrichment_status=STRUCTURED_PAPER_ASSET_ENRICHMENT_STATUS_COMPLETE,
                asset_enrichment_checked_at=_utcnow(),
            )
            row.payload_json = payload
            row.source_signature_sha256 = source_signature
            row.parser_version = STRUCTURED_PAPER_CACHE_VERSION
            row.computed_at = _utcnow()
            row.status = READY_STATUS
            row.last_error = None
            session.flush()
        persist_duration_ms = round(
            (time.perf_counter() - persist_started_at) * 1000, 2
        )
        logger.info(
            "structured_paper_asset_enrichment_completed",
            extra={
                "user_id": user_id,
                "publication_id": publication_id,
                "binary_payload_ms": binary_payload_duration_ms,
                "enrichment_ms": enrichment_duration_ms,
                "persist_ms": persist_duration_ms,
                "figure_count": len(figures),
                "table_count": len(tables),
                "total_ms": round((time.perf_counter() - job_started_at) * 1000, 2),
            },
        )
    except Exception:
        failure_message = traceback.format_exc(limit=12)
        logger.exception(
            "publication_paper_asset_enrichment_failed",
            extra={"user_id": user_id, "publication_id": publication_id},
        )
        persist_started_at = time.perf_counter()
        with session_scope() as session:
            _resolve_work_or_raise(
                session, user_id=user_id, publication_id=publication_id
            )
            row = _load_structured_paper_cache(
                session,
                user_id=user_id,
                publication_id=publication_id,
                for_update=True,
            )
            if row is None:
                return
            current_payload = (
                row.payload_json if isinstance(row.payload_json, dict) else {}
            )
            if (
                str(row.source_signature_sha256 or "").strip()
                != str(source_signature or "").strip()
                or row.parser_version != STRUCTURED_PAPER_CACHE_VERSION
                or not _publication_paper_payload_needs_asset_enrichment(current_payload)
            ):
                return
            payload, _ = _build_publication_paper_asset_enrichment_payload(
                publication=source_state["publication"],
                structured_abstract_payload=source_state["structured_abstract_payload"],
                structured_abstract_status=source_state["structured_abstract_status"],
                files=source_state["files"],
                current_payload=current_payload,
                figures=None,
                tables=None,
                asset_enrichment_status=STRUCTURED_PAPER_ASSET_ENRICHMENT_STATUS_FAILED,
                asset_enrichment_checked_at=_utcnow(),
                asset_enrichment_last_error=failure_message[:2000],
            )
            row.payload_json = payload
            row.source_signature_sha256 = source_signature
            row.parser_version = STRUCTURED_PAPER_CACHE_VERSION
            row.computed_at = _utcnow()
            row.status = READY_STATUS
            row.last_error = None
            session.flush()
        logger.info(
            "structured_paper_asset_enrichment_failed_persisted",
            extra={
                "user_id": user_id,
                "publication_id": publication_id,
                "persist_ms": round((time.perf_counter() - persist_started_at) * 1000, 2),
            },
        )


def enqueue_publication_structured_abstract_refresh(
    *, user_id: str, publication_id: str, force: bool = False
) -> bool:
    create_all_tables()
    return _enqueue_structured_abstract_if_needed(
        user_id=user_id,
        publication_id=publication_id,
        force=force,
    )


def _enqueue_drilldown_warmup_if_needed(
    *, user_id: str, publication_id: str, force_structured_abstract: bool = False
) -> dict[str, bool]:
    return {
        "authors": bool(
            _enqueue_authors_if_needed(user_id=user_id, publication_id=publication_id)
        ),
        "impact": bool(
            _enqueue_impact_if_needed(user_id=user_id, publication_id=publication_id)
        ),
        "ai": bool(
            _enqueue_ai_if_needed(user_id=user_id, publication_id=publication_id)
        ),
        "structured_abstract": bool(
            _enqueue_structured_abstract_if_needed(
                user_id=user_id,
                publication_id=publication_id,
                force=force_structured_abstract,
            )
        ),
    }


def enqueue_publication_drilldown_warmup(
    *, user_id: str, publication_id: str, force_structured_abstract: bool = False
) -> dict[str, bool]:
    create_all_tables()
    return _enqueue_drilldown_warmup_if_needed(
        user_id=user_id,
        publication_id=publication_id,
        force_structured_abstract=force_structured_abstract,
    )


def trigger_publication_structured_abstract_refresh(
    *, user_id: str, publication_id: str
) -> dict[str, Any]:
    create_all_tables()
    enqueued = _enqueue_structured_abstract_if_needed(
        user_id=user_id, publication_id=publication_id, force=True
    )
    with session_scope() as session:
        _resolve_work_or_raise(session, user_id=user_id, publication_id=publication_id)
        row = _load_structured_abstract_cache(
            session, user_id=user_id, publication_id=publication_id
        )
        status = "MISSING"
        if row is not None:
            status = _normalize_status(row.status)
        elif enqueued:
            status = RUNNING_STATUS
        return {
            "enqueued": bool(enqueued),
            "status": status,
        }


def _ensure_publication_reader_pdf_attached(
    *, user_id: str, publication_id: str
) -> bool:
    create_all_tables()
    with session_scope() as session:
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        existing_files = session.scalars(
            select(PublicationFile).where(
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
                PublicationFile.deleted.is_(False),
            )
        ).all()
        if any(_publication_file_is_viewable_pdf(row) for row in existing_files):
            return False
        for row in existing_files:
            if str(row.source or "").strip().upper() != FILE_SOURCE_OA_LINK:
                continue
            try:
                if _ensure_open_access_publication_file_local_copy(row):
                    session.flush()
                    return True
            except Exception:
                logger.exception(
                    "publication_reader_existing_oa_pdf_attach_failed",
                    extra={
                        "user_id": user_id,
                        "publication_id": publication_id,
                        "file_id": str(row.id),
                    },
                )
        if bool(work.oa_link_suppressed):
            return False
        if not _normalize_doi(work.doi):
            return False
    try:
        payload = link_publication_open_access_pdf(
            user_id=user_id,
            publication_id=publication_id,
            allow_suppressed=False,
        )
    except Exception:
        logger.exception(
            "publication_reader_pdf_attach_failed",
            extra={"user_id": user_id, "publication_id": publication_id},
        )
        return False
    if not (isinstance(payload, dict) and payload.get("file")):
        return False
    with session_scope() as session:
        existing_files = session.scalars(
            select(PublicationFile).where(
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
                PublicationFile.deleted.is_(False),
            )
        ).all()
        return any(_publication_file_is_viewable_pdf(row) for row in existing_files)


def get_publication_paper_model(
    *, user_id: str, publication_id: str, force_reparse: bool = False
) -> dict[str, Any]:
    create_all_tables()
    source_state = _load_publication_paper_source_state(
        user_id=user_id, publication_id=publication_id
    )
    seed_payload, source_signature = _build_publication_paper_payload(
        publication=source_state["publication"],
        structured_abstract_payload=source_state["structured_abstract_payload"],
        structured_abstract_status=source_state["structured_abstract_status"],
        files=source_state["files"],
    )
    has_viewable_pdf = bool(
        (seed_payload.get("document") or {}).get("has_viewable_pdf")
    )
    if not has_viewable_pdf and _ensure_publication_reader_pdf_attached(
        user_id=user_id,
        publication_id=publication_id,
    ):
        source_state = _load_publication_paper_source_state(
            user_id=user_id, publication_id=publication_id
        )
        seed_payload, source_signature = _build_publication_paper_payload(
            publication=source_state["publication"],
            structured_abstract_payload=source_state["structured_abstract_payload"],
            structured_abstract_status=source_state["structured_abstract_status"],
            files=source_state["files"],
        )
        has_viewable_pdf = bool(
            (seed_payload.get("document") or {}).get("has_viewable_pdf")
        )
    parsing_payload = (
        _build_publication_paper_payload(
            publication=source_state["publication"],
            structured_abstract_payload=source_state["structured_abstract_payload"],
            structured_abstract_status=source_state["structured_abstract_status"],
            files=source_state["files"],
            parser_status=STRUCTURED_PAPER_STATUS_PARSING,
        )[0]
        if has_viewable_pdf
        else seed_payload
    )
    should_enqueue_structured_paper = False
    should_enqueue_asset_enrichment = False
    response_payload: dict[str, Any] | None = None
    with session_scope() as session:
        _resolve_work_or_raise(session, user_id=user_id, publication_id=publication_id)
        row = _load_structured_paper_cache(
            session, user_id=user_id, publication_id=publication_id, for_update=True
        )
        now = _utcnow()
        if row is None:
            payload = parsing_payload if has_viewable_pdf else seed_payload
            row = PublicationStructuredPaperCache(
                owner_user_id=user_id,
                publication_id=publication_id,
                payload_json=payload,
                source_signature_sha256=source_signature,
                parser_version=STRUCTURED_PAPER_CACHE_VERSION,
                computed_at=now,
                status=RUNNING_STATUS if has_viewable_pdf else READY_STATUS,
                last_error=(
                    None
                    if has_viewable_pdf
                    else source_state["structured_abstract_last_error"]
                ),
            )
            session.add(row)
            session.flush()
            should_enqueue_structured_paper = has_viewable_pdf
        else:
            current_hash = (
                _normalize_abstract_text(str(row.source_signature_sha256 or "")) or None
            )
            current_status = _normalize_status(row.status, fallback=READY_STATUS)
            running_is_stale = current_status == RUNNING_STATUS and _is_stale(
                computed_at=_coerce_utc_or_none(row.computed_at),
                ttl_seconds=_structured_paper_running_timeout_seconds(),
                now=now,
            )
            cached_payload = (
                row.payload_json if isinstance(row.payload_json, dict) else {}
            )
            cached_document = (
                cached_payload.get("document")
                if isinstance(cached_payload.get("document"), dict)
                else {}
            )
            cached_parser_status = (
                str(cached_document.get("parser_status") or "").strip().upper()
            )
            needs_reseed = (
                current_hash != source_signature
                or row.parser_version != STRUCTURED_PAPER_CACHE_VERSION
                or not cached_payload
            )
            if needs_reseed:
                row.payload_json = parsing_payload if has_viewable_pdf else seed_payload
                row.source_signature_sha256 = source_signature
                row.parser_version = STRUCTURED_PAPER_CACHE_VERSION
                row.computed_at = now
                row.status = RUNNING_STATUS if has_viewable_pdf else READY_STATUS
                row.last_error = (
                    None
                    if has_viewable_pdf
                    else source_state["structured_abstract_last_error"]
                )
                session.flush()
                cached_payload = (
                    row.payload_json if isinstance(row.payload_json, dict) else {}
                )
                cached_parser_status = (
                    str(
                        (
                            (cached_payload.get("document") or {})
                            if isinstance(cached_payload.get("document"), dict)
                            else {}
                        ).get("parser_status")
                        or ""
                    )
                    .strip()
                    .upper()
                )
                should_enqueue_structured_paper = has_viewable_pdf
            elif force_reparse and has_viewable_pdf:
                row.payload_json = parsing_payload
                row.status = RUNNING_STATUS
                row.last_error = None
                row.computed_at = now
                session.flush()
                cached_payload = (
                    row.payload_json if isinstance(row.payload_json, dict) else {}
                )
                cached_parser_status = (
                    str(
                        (
                            (cached_payload.get("document") or {})
                            if isinstance(cached_payload.get("document"), dict)
                            else {}
                        ).get("parser_status")
                        or ""
                    )
                    .strip()
                    .upper()
                )
                should_enqueue_structured_paper = True
            elif (
                has_viewable_pdf
                and current_status not in {FAILED_STATUS}
                and (current_status != RUNNING_STATUS or running_is_stale)
                and cached_parser_status != STRUCTURED_PAPER_STATUS_FULL_TEXT_READY
            ):
                row.payload_json = parsing_payload
                row.status = RUNNING_STATUS
                row.last_error = None
                row.computed_at = now
                session.flush()
                cached_payload = (
                    row.payload_json if isinstance(row.payload_json, dict) else {}
                )
                should_enqueue_structured_paper = True
            elif not has_viewable_pdf and current_status != READY_STATUS:
                row.payload_json = seed_payload
                row.status = READY_STATUS
                row.last_error = source_state["structured_abstract_last_error"]
                row.computed_at = now
                session.flush()
                cached_payload = (
                    row.payload_json if isinstance(row.payload_json, dict) else {}
                )

            payload = cached_payload or (
                parsing_payload if has_viewable_pdf else seed_payload
            )
            should_enqueue_asset_enrichment = (
                not should_enqueue_structured_paper
                and _publication_paper_payload_needs_asset_enrichment(payload)
            )
        response_payload = {
            "payload": payload,
            "computed_at": _coerce_utc_or_none(row.computed_at),
            "status": _normalize_status(row.status, fallback=READY_STATUS),
            "is_stale": False,
            "last_error": _normalize_abstract_text(str(row.last_error or "")) or None,
        }

    if response_payload is None:
        raise PublicationConsoleNotFoundError("Publication reader could not be loaded.")
    _enqueue_structured_abstract_if_needed(
        user_id=user_id, publication_id=publication_id, force=False
    )
    if should_enqueue_structured_paper:
        _submit_background_job(
            kind="structured_paper",
            user_id=user_id,
            publication_id=publication_id,
            fn=_run_structured_paper_parse_job,
        )
    elif should_enqueue_asset_enrichment:
        _submit_background_job(
            kind="structured_paper_assets",
            user_id=user_id,
            publication_id=publication_id,
            fn=_run_structured_paper_asset_enrichment_job,
        )
    return response_payload


def get_publication_details(*, user_id: str, publication_id: str) -> dict[str, Any]:
    create_all_tables()
    response_payload: dict[str, Any] | None = None
    with session_scope() as session:
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        latest = _latest_metric_for_work(session, work_id=publication_id)
        citations_total = (
            int(latest.citations_count or 0)
            if latest is not None
            else int(work.citations_total or 0)
        )
        summary = _build_publication_summary(
            work, citations_total=max(0, citations_total)
        )
        structured_row = _load_structured_abstract_cache(
            session, user_id=user_id, publication_id=publication_id
        )
        (
            structured_payload,
            structured_status,
            structured_computed_at,
            structured_last_error,
        ) = _structured_abstract_view_payload(
            row=structured_row,
            abstract=summary.get("abstract"),
            pmid=summary.get("pmid"),
            doi=summary.get("doi"),
            title=summary.get("title"),
            year=_safe_int(summary.get("year")),
        )
        summary["structured_abstract"] = structured_payload
        summary["structured_abstract_status"] = structured_status
        summary["structured_abstract_computed_at"] = structured_computed_at
        summary["structured_abstract_last_error"] = structured_last_error
        response_payload = summary

    if response_payload is None:
        raise PublicationConsoleNotFoundError(
            "Publication details could not be loaded."
        )
    _enqueue_drilldown_warmup_if_needed(
        user_id=user_id,
        publication_id=publication_id,
        force_structured_abstract=False,
    )
    return response_payload


def get_publication_authors(*, user_id: str, publication_id: str) -> dict[str, Any]:
    create_all_tables()
    enqueue = False
    with session_scope() as session:
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        now = _utcnow()
        status = _normalize_status(work.authors_status)
        authors_json = work.authors_json if isinstance(work.authors_json, list) else []
        affiliations_json = (
            work.affiliations_json if isinstance(work.affiliations_json, list) else []
        )
        computed_at = _coerce_utc_or_none(work.authors_computed_at)
        stale = _is_stale(
            computed_at=computed_at, ttl_seconds=_authors_ttl_seconds(), now=now
        )
        if (not authors_json or stale) and status != RUNNING_STATUS:
            enqueue = True
            status = RUNNING_STATUS

        payload = {
            "status": status,
            "authors_json": authors_json,
            "affiliations_json": affiliations_json,
            "computed_at": computed_at,
            "is_stale": stale,
            "is_updating": status == RUNNING_STATUS,
            "last_error": str(work.authors_last_error or "").strip() or None,
        }

    if enqueue:
        _enqueue_authors_if_needed(user_id=user_id, publication_id=publication_id)
    return payload


def get_publication_impact(*, user_id: str, publication_id: str) -> dict[str, Any]:
    create_all_tables()
    enqueue = False
    with session_scope() as session:
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        latest = _latest_metric_for_work(session, work_id=publication_id)
        citations_total = (
            int(latest.citations_count or 0)
            if latest is not None
            else int(work.citations_total or 0)
        )
        row = _load_impact_cache(
            session, user_id=user_id, publication_id=publication_id
        )
        now = _utcnow()

        if row is None:
            payload = _empty_impact_payload(
                work=work, citations_total=max(0, citations_total)
            )
            status = RUNNING_STATUS
            computed_at = None
            stale = True
            last_error = None
            enqueue = True
        else:
            payload = row.payload_json if isinstance(row.payload_json, dict) else {}
            if not payload:
                payload = _empty_impact_payload(
                    work=work, citations_total=max(0, citations_total)
                )
            status = _normalize_status(row.status)
            computed_at = _coerce_utc_or_none(row.computed_at)
            stale = _is_stale(
                computed_at=computed_at, ttl_seconds=_impact_ttl_seconds(), now=now
            )
            last_error = str(row.last_error or "").strip() or None
            if (stale or not computed_at) and status != RUNNING_STATUS:
                enqueue = True
                status = RUNNING_STATUS

    if enqueue:
        _enqueue_impact_if_needed(user_id=user_id, publication_id=publication_id)

    return {
        "payload": payload,
        "computed_at": computed_at,
        "status": status,
        "is_stale": stale,
        "is_updating": status == RUNNING_STATUS,
        "last_error": last_error,
    }


def get_publication_ai_insights(*, user_id: str, publication_id: str) -> dict[str, Any]:
    create_all_tables()
    enqueue = False
    with session_scope() as session:
        _resolve_work_or_raise(session, user_id=user_id, publication_id=publication_id)
        row = _load_ai_cache(session, user_id=user_id, publication_id=publication_id)
        now = _utcnow()

        if row is None:
            payload = _empty_ai_payload()
            status = RUNNING_STATUS
            computed_at = None
            stale = True
            last_error = None
            enqueue = True
        else:
            payload = row.payload_json if isinstance(row.payload_json, dict) else {}
            if not payload:
                payload = _empty_ai_payload()
            status = _normalize_status(row.status)
            computed_at = _coerce_utc_or_none(row.computed_at)
            stale = _is_stale(
                computed_at=computed_at, ttl_seconds=_ai_ttl_seconds(), now=now
            )
            last_error = str(row.last_error or "").strip() or None
            if (stale or not computed_at) and status != RUNNING_STATUS:
                enqueue = True
                status = RUNNING_STATUS

    if enqueue:
        _enqueue_ai_if_needed(user_id=user_id, publication_id=publication_id)

    return {
        "payload": payload,
        "computed_at": computed_at,
        "status": status,
        "is_stale": stale,
        "is_updating": status == RUNNING_STATUS,
        "last_error": last_error,
    }


def list_publication_files(*, user_id: str, publication_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        publication = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        rows = session.scalars(
            select(PublicationFile)
            .where(
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
                PublicationFile.deleted.is_(False),
            )
            .order_by(PublicationFile.created_at.desc())
        ).all()
        default_file_name = _resolve_publication_file_display_name(publication)
        active_rows: list[PublicationFile] = []
        primary_active_oa_row: PublicationFile | None = None
        for row in rows:
            if (
                not bool(row.custom_name)
                and str(row.file_name or "").strip() != default_file_name
            ):
                row.file_name = default_file_name
            if str(row.source or "").upper() == FILE_SOURCE_OA_LINK:
                has_local_copy = False
                try:
                    has_local_copy = _ensure_open_access_publication_file_local_copy(
                        row
                    )
                except Exception:
                    logger.exception(
                        "publication_open_access_file_cache_failed",
                        extra={
                            "publication_id": publication_id,
                            "file_id": str(row.id),
                        },
                    )
                if not has_local_copy:
                    _prune_unstored_open_access_publication_file(
                        row,
                        reason="list_without_local_copy",
                    )
                    continue
                if primary_active_oa_row is not None:
                    _merge_open_access_publication_file_metadata(
                        primary_active_oa_row, row
                    )
                    row.deleted = True
                    continue
                primary_active_oa_row = row
            active_rows.append(row)
        session.flush()
        items = [_serialize_file(publication_id, row) for row in active_rows]

        publication_title_key = normalized_text_key(publication.title)
        supplementary_rows = session.scalars(
            select(Work).where(Work.user_id == user_id)
        ).all()
        for candidate in supplementary_rows:
            if str(candidate.id) == publication_id:
                continue
            if not is_supplementary_material_work(candidate):
                continue
            parent_title = extract_parent_publication_title(candidate.title)
            if normalized_text_key(parent_title) != publication_title_key:
                continue
            items.append(_serialize_supplementary_work_as_file(candidate))

        items.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
        has_deleted_oa_file = (
            session.scalars(
                select(PublicationFile.id).where(
                    PublicationFile.owner_user_id == user_id,
                    PublicationFile.publication_id == publication_id,
                    PublicationFile.source == FILE_SOURCE_OA_LINK,
                    PublicationFile.deleted.is_(True),
                )
            ).first()
            is not None
        )
        deleted_oa_rows = session.scalars(
            select(PublicationFile).where(
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
                PublicationFile.source == FILE_SOURCE_OA_LINK,
                PublicationFile.deleted.is_(True),
            )
        ).all()
        has_recoverable_deleted_oa_file = any(
            _publication_file_has_local_copy(row) for row in deleted_oa_rows
        )
        return {
            "items": items,
            "has_deleted_oa_file": has_deleted_oa_file,
            "has_recoverable_deleted_oa_file": has_recoverable_deleted_oa_file,
        }


def upload_publication_file(
    *,
    user_id: str,
    publication_id: str,
    filename: str,
    content_type: str | None,
    content: bytes,
) -> dict[str, Any]:
    create_all_tables()
    if not content:
        raise PublicationConsoleValidationError("Uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise PublicationConsoleValidationError("Uploaded file exceeds 50MB limit.")

    uploaded_name = _slugify_filename(filename)
    file_type = _infer_file_type(filename=uploaded_name, content_type=content_type)
    storage_suffix = _infer_storage_suffix(
        filename=uploaded_name,
        content_type=content_type,
        file_type=file_type,
    )
    checksum = hashlib.sha256(content).hexdigest()

    with session_scope() as session:
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        display_name = _resolve_publication_file_display_name(work)
        row = PublicationFile(
            publication_id=publication_id,
            owner_user_id=user_id,
            file_name=display_name,
            file_type=file_type,
            storage_key="",
            source=FILE_SOURCE_USER_UPLOAD,
            oa_url=None,
            checksum=checksum,
            custom_name=False,
            classification=None,
            classification_custom=False,
            created_at=_utcnow(),
        )
        session.add(row)
        session.flush()

        folder = _file_storage_root() / user_id / publication_id
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{row.id}{storage_suffix}"
        path.write_bytes(content)
        row.storage_key = _storage_key_from_path(path)
        session.flush()
        session.refresh(row)
        return _serialize_file(publication_id, row)


def _find_unpaywall_pdf_url(*, doi: str, email: str) -> str | None:
    payload = _request_json_with_retry(
        url=f"https://api.unpaywall.org/v2/{quote(doi, safe='')}",
        params={"email": email},
        timeout_seconds=_unpaywall_timeout_seconds(),
        retries=_unpaywall_retry_count(),
    )
    if not payload:
        return None
    best = payload.get("best_oa_location")
    if isinstance(best, dict):
        url_for_pdf = str(best.get("url_for_pdf") or "").strip()
        if url_for_pdf:
            return url_for_pdf
    locations = payload.get("oa_locations")
    if isinstance(locations, list):
        for location in locations:
            if not isinstance(location, dict):
                continue
            candidate = str(location.get("url_for_pdf") or "").strip()
            if candidate:
                return candidate
    return None


def _find_unpaywall_landing_page_urls(*, doi: str, email: str) -> list[str]:
    payload = _request_json_with_retry(
        url=f"https://api.unpaywall.org/v2/{quote(doi, safe='')}",
        params={"email": email},
        timeout_seconds=_unpaywall_timeout_seconds(),
        retries=_unpaywall_retry_count(),
    )
    if not payload:
        return []
    candidates: list[str] = []
    seen: set[str] = set()

    def _append(url_value: Any) -> None:
        clean_url = str(url_value or "").strip()
        if not clean_url:
            return
        parsed = urlsplit(clean_url)
        if parsed.scheme.lower() not in {"http", "https"}:
            return
        if clean_url in seen:
            return
        seen.add(clean_url)
        candidates.append(clean_url)

    best = payload.get("best_oa_location")
    if isinstance(best, dict):
        _append(best.get("url"))
    locations = payload.get("oa_locations")
    if isinstance(locations, list):
        for location in locations:
            if not isinstance(location, dict):
                continue
            _append(location.get("url"))
    return candidates


def _pmc_article_url(pmcid: str) -> str:
    return f"https://pmc.ncbi.nlm.nih.gov/articles/{pmcid.strip().upper()}/"


def _request_pmc_oa_record(pmcid: str) -> dict[str, str] | None:
    clean_pmcid = str(pmcid or "").strip().upper()
    if not clean_pmcid.startswith("PMC"):
        return None
    xml_text = _request_text_with_retry(
        url="https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi",
        params={"id": clean_pmcid},
        timeout_seconds=_unpaywall_timeout_seconds(),
        retries=max(1, _unpaywall_retry_count()),
        headers={"User-Agent": OPEN_ACCESS_FETCH_USER_AGENT},
    )
    if not xml_text.strip():
        return None
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return None
    record = root.find(".//record")
    if record is None:
        return None
    payload = {
        "pmcid": clean_pmcid,
        "license": str(record.attrib.get("license") or "").strip(),
    }
    link = record.find("./link")
    if link is not None:
        payload["archive_href"] = str(link.attrib.get("href") or "").strip()
        payload["archive_format"] = str(link.attrib.get("format") or "").strip()
    return payload


def _normalize_pmc_archive_url(url_value: str | None) -> str | None:
    clean_url = str(url_value or "").strip()
    if not clean_url:
        return None
    if clean_url.startswith("ftp://ftp.ncbi.nlm.nih.gov/"):
        return "https://ftp.ncbi.nlm.nih.gov/" + clean_url.removeprefix(
            "ftp://ftp.ncbi.nlm.nih.gov/"
        )
    parsed = urlsplit(clean_url)
    if parsed.scheme.lower() not in {"http", "https"}:
        return None
    return clean_url


def _find_open_access_pdf_candidates(*, work: Work, email: str | None) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def _append(url_value: Any) -> None:
        clean_url = str(url_value or "").strip()
        if not clean_url:
            return
        parsed = urlsplit(clean_url)
        if parsed.scheme.lower() not in {"http", "https"}:
            return
        if clean_url in seen:
            return
        seen.add(clean_url)
        candidates.append(clean_url)

    pmcid = _resolve_pmcid(
        pmid=work.pmid,
        doi=work.doi,
        title=work.title,
        year=_safe_int(work.year),
    )
    if pmcid:
        oa_record = _request_pmc_oa_record(pmcid)
        if oa_record is not None:
            _append(_normalize_pmc_archive_url(oa_record.get("archive_href")))
            _append(_pmc_article_url(pmcid))

    doi = _normalize_doi(work.doi)
    if doi:
        if email:
            direct_pdf_url = _find_unpaywall_pdf_url(doi=doi, email=email)
            _append(direct_pdf_url)
            if not direct_pdf_url:
                for landing_url in _find_unpaywall_landing_page_urls(
                    doi=doi, email=email
                ):
                    _append(landing_url)
        _append(f"https://doi.org/{quote(doi, safe='/')}")

    _append(work.url)
    pmid = _normalize_pmid(work.pmid)
    if pmid:
        _append(f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/")
    return candidates


def link_publication_open_access_pdf(
    *, user_id: str, publication_id: str, allow_suppressed: bool = False
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        active_oa_rows = session.scalars(
            select(PublicationFile)
            .where(
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
                PublicationFile.source == FILE_SOURCE_OA_LINK,
                PublicationFile.deleted.is_(False),
            )
            .order_by(PublicationFile.created_at.desc())
        ).all()
        primary_active_oa_row: PublicationFile | None = None
        for active_row in active_oa_rows:
            if not _ensure_open_access_publication_file_local_copy(active_row):
                _prune_unstored_open_access_publication_file(
                    active_row,
                    reason="link_existing_without_local_copy",
                )
                continue
            if primary_active_oa_row is None:
                primary_active_oa_row = active_row
                continue
            _merge_open_access_publication_file_metadata(
                primary_active_oa_row, active_row
            )
            active_row.deleted = True
        if primary_active_oa_row is not None:
            if bool(work.oa_link_suppressed):
                work.oa_link_suppressed = False
            session.flush()
            session.refresh(primary_active_oa_row)
            return {
                "created": False,
                "file": _serialize_file(publication_id, primary_active_oa_row),
                "message": "Open-access PDF already stored.",
            }
        deleted_oa_row = session.scalars(
            select(PublicationFile)
            .where(
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
                PublicationFile.source == FILE_SOURCE_OA_LINK,
                PublicationFile.deleted.is_(True),
            )
            .order_by(PublicationFile.created_at.desc())
        ).first()
        deleted_restore_failed = False
        if allow_suppressed and deleted_oa_row is not None:
            try:
                if _ensure_open_access_publication_file_local_copy(deleted_oa_row):
                    deleted_oa_row.deleted = False
                    work.oa_link_suppressed = False
                    session.flush()
                    session.refresh(deleted_oa_row)
                    return {
                        "created": False,
                        "file": _serialize_file(publication_id, deleted_oa_row),
                        "message": "Deleted open-access PDF restored.",
                    }
            except Exception:
                logger.exception(
                    "publication_open_access_restore_failed",
                    extra={
                        "user_id": user_id,
                        "publication_id": publication_id,
                        "file_id": str(deleted_oa_row.id),
                    },
                )
            deleted_restore_failed = True
        if bool(work.oa_link_suppressed) and not allow_suppressed:
            return {
                "created": False,
                "file": None,
                "message": (
                    "Open-access PDF relinking is turned off for this publication."
                ),
            }
        email = _unpaywall_email(user_email=user.email)
        candidate_urls = _find_open_access_pdf_candidates(work=work, email=email)
        if not candidate_urls:
            return {
                "created": False,
                "file": None,
                "message": (
                    "Deleted open-access PDF could not be restored to a local stored copy, and no new open-access PDF was found."
                    if deleted_restore_failed
                    else "No open access PDF found."
                ),
            }

        for pdf_url in candidate_urls:
            existing = session.scalars(
                select(PublicationFile).where(
                    PublicationFile.owner_user_id == user_id,
                    PublicationFile.publication_id == publication_id,
                    PublicationFile.source == FILE_SOURCE_OA_LINK,
                    PublicationFile.oa_url == pdf_url,
                    PublicationFile.deleted.is_(False),
                )
            ).first()
            if existing is not None:
                if not _ensure_open_access_publication_file_local_copy(existing):
                    _prune_unstored_open_access_publication_file(
                        existing,
                        reason="link_existing_without_local_copy",
                    )
                    continue
                if bool(work.oa_link_suppressed):
                    work.oa_link_suppressed = False
                    session.flush()
                return {
                    "created": False,
                    "file": _serialize_file(publication_id, existing),
                    "message": "Open-access PDF link already exists.",
                }

            matching_deleted = session.scalars(
                select(PublicationFile)
                .where(
                    PublicationFile.owner_user_id == user_id,
                    PublicationFile.publication_id == publication_id,
                    PublicationFile.source == FILE_SOURCE_OA_LINK,
                    PublicationFile.oa_url == pdf_url,
                    PublicationFile.deleted.is_(True),
                )
                .order_by(PublicationFile.created_at.desc())
            ).first()
            if matching_deleted is not None:
                if not _ensure_open_access_publication_file_local_copy(matching_deleted):
                    continue
                matching_deleted.deleted = False
                work.oa_link_suppressed = False
                session.flush()
                session.refresh(matching_deleted)
                return {
                    "created": False,
                    "file": _serialize_file(publication_id, matching_deleted),
                    "message": "Deleted open-access PDF restored.",
                }

            row = PublicationFile(
                publication_id=publication_id,
                owner_user_id=user_id,
                file_name=_resolve_publication_file_display_name(work),
                file_type=FILE_TYPE_PDF,
                storage_key="",
                source=FILE_SOURCE_OA_LINK,
                oa_url=pdf_url,
                checksum=None,
                custom_name=False,
                classification=None,
                classification_custom=False,
                deleted=False,
                created_at=_utcnow(),
            )
            session.add(row)
            session.flush()
            if not _ensure_open_access_publication_file_local_copy(row):
                session.delete(row)
                session.flush()
                continue
            work.oa_link_suppressed = False
            session.flush()
            session.refresh(row)
            return {
                "created": True,
                "file": _serialize_file(publication_id, row),
                "message": "Open-access PDF downloaded and stored.",
            }
        openalex_content, openalex_content_type, openalex_pdf_url = (
            _fetch_openalex_pdf_bytes(work=work, user_email=user.email)
        )
        if (
            openalex_pdf_url
            and _looks_like_pdf_payload(openalex_content, openalex_content_type)
        ):
            row = PublicationFile(
                publication_id=publication_id,
                owner_user_id=user_id,
                file_name=_resolve_publication_file_display_name(work),
                file_type=FILE_TYPE_PDF,
                storage_key="",
                source=FILE_SOURCE_OA_LINK,
                oa_url=openalex_pdf_url,
                checksum=None,
                custom_name=False,
                classification=None,
                classification_custom=False,
                deleted=False,
                created_at=_utcnow(),
            )
            session.add(row)
            session.flush()
            _persist_publication_file_content(
                row,
                content=openalex_content,
                content_type=openalex_content_type,
                preferred_filename=_resolve_publication_file_display_name(work),
            )
            work.oa_link_suppressed = False
            session.flush()
            session.refresh(row)
            return {
                "created": True,
                "file": _serialize_file(publication_id, row),
                "message": "Open-access PDF downloaded and stored.",
            }
        return {
            "created": False,
            "file": None,
            "message": OA_LOCAL_COPY_REQUIRED_MESSAGE,
        }


def delete_publication_file(
    *, user_id: str, publication_id: str, file_id: str
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        row = session.scalars(
            select(PublicationFile).where(
                PublicationFile.id == file_id,
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
                PublicationFile.deleted.is_(False),
            )
        ).first()
        if row is None:
            raise PublicationConsoleNotFoundError(
                f"Publication file '{file_id}' was not found."
            )
        storage_key = str(row.storage_key or "")
        source = str(row.source or "").upper()
        if source == FILE_SOURCE_OA_LINK:
            row.deleted = True
            session.flush()
            remaining_oa_link = session.scalars(
                select(PublicationFile.id).where(
                    PublicationFile.owner_user_id == user_id,
                    PublicationFile.publication_id == publication_id,
                    PublicationFile.source == FILE_SOURCE_OA_LINK,
                    PublicationFile.deleted.is_(False),
                )
            ).first()
            if remaining_oa_link is None:
                work.oa_link_suppressed = True
                session.flush()
        else:
            session.delete(row)
            session.flush()

    if source == FILE_SOURCE_USER_UPLOAD and storage_key:
        try:
            path = Path(storage_key)
            if path.exists():
                path.unlink(missing_ok=True)
        except Exception:
            logger.warning(
                "publication_file_delete_disk_warning",
                extra={"file_id": file_id, "storage_key": storage_key},
            )

    return {"deleted": True}


def update_publication_file(
    *,
    user_id: str,
    publication_id: str,
    file_id: str,
    file_name: str | None = None,
    classification: str | None = None,
    classification_provided: bool = False,
    classification_other_label: str | None = None,
    classification_other_label_provided: bool = False,
) -> dict[str, Any]:
    create_all_tables()
    should_update_file_name = file_name is not None
    should_update_classification = (
        classification_provided or classification_other_label_provided
    )
    clean_file_name = str(file_name or "").strip() if should_update_file_name else ""
    if not should_update_file_name and not should_update_classification:
        raise PublicationConsoleValidationError(
            "Provide a file name or classification update."
        )
    if should_update_file_name and not clean_file_name:
        raise PublicationConsoleValidationError("File name is required.")

    with session_scope() as session:
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        row = session.scalars(
            select(PublicationFile).where(
                PublicationFile.id == file_id,
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
                PublicationFile.deleted.is_(False),
            )
        ).first()
        if row is None:
            raise PublicationConsoleNotFoundError(
                f"Publication file '{file_id}' was not found."
            )

        if should_update_file_name:
            next_file_name = _slugify_filename(clean_file_name)
            default_file_name = _resolve_publication_file_display_name(work)
            row.file_name = next_file_name
            row.custom_name = next_file_name != default_file_name
        if should_update_classification:
            if classification_provided:
                if classification is None:
                    row.classification = None
                    row.classification_custom = False
                    row.classification_other_label = None
                else:
                    row.classification = _validate_publication_file_classification(
                        classification
                    )
                    row.classification_custom = True
                    if row.classification != FILE_CLASSIFICATION_OTHER:
                        row.classification_other_label = None
            current_classification = (
                _normalize_publication_file_classification(
                    str(row.classification or "").strip() or None
                )
                if bool(row.classification_custom)
                else None
            )
            if classification_other_label_provided:
                next_other_label = _validate_publication_file_other_label(
                    classification_other_label
                )
                if current_classification != FILE_CLASSIFICATION_OTHER:
                    if next_other_label is not None:
                        raise PublicationConsoleValidationError(
                            "Only files tagged as Other can have a custom label."
                        )
                    row.classification_other_label = None
                else:
                    row.classification_other_label = next_other_label
        session.flush()
        session.refresh(row)
        return _serialize_file(publication_id, row)


def rename_publication_file(
    *, user_id: str, publication_id: str, file_id: str, file_name: str
) -> dict[str, Any]:
    return update_publication_file(
        user_id=user_id,
        publication_id=publication_id,
        file_id=file_id,
        file_name=file_name,
    )


def _resolve_publication_file_binary_payload(
    *,
    user_id: str,
    publication_id: str,
    file_id: str,
    proxy_remote: bool,
) -> dict[str, Any]:
    with session_scope() as session:
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        row = session.scalars(
            select(PublicationFile).where(
                PublicationFile.id == file_id,
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
                PublicationFile.deleted.is_(False),
            )
        ).first()
        if row is None:
            raise PublicationConsoleNotFoundError(
                f"Publication file '{file_id}' was not found."
            )

        default_file_name = _resolve_publication_file_display_name(work)
        if (
            not bool(row.custom_name)
            and str(row.file_name or "").strip() != default_file_name
        ):
            row.file_name = default_file_name
            session.flush()

        source = str(row.source or "").upper()
        stored_path = _publication_file_storage_path(row.storage_key)
        if stored_path is not None and stored_path.exists() and stored_path.is_file():
            content = stored_path.read_bytes()
            file_name = _coerce_download_filename(
                file_name=row.file_name, path=stored_path
            )
            lower = file_name.lower()
            if lower.endswith(".pdf"):
                content_type = "application/pdf"
            elif lower.endswith(".docx"):
                content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            else:
                content_type = "application/octet-stream"
            return {
                "mode": "content",
                "url": None,
                "file_name": file_name,
                "content_type": content_type,
                "content": content,
            }

        if source == FILE_SOURCE_OA_LINK and row.oa_url:
            oa_name = _coerce_download_filename(
                file_name=str(row.file_name or "open-access.pdf")
            )
            if not proxy_remote:
                return {
                    "mode": "redirect",
                    "url": str(row.oa_url),
                    "file_name": oa_name,
                    "content_type": "application/pdf",
                    "content": b"",
                }
            content, content_type = _fetch_open_access_pdf_bytes(str(row.oa_url))
            if not content:
                raise PublicationConsoleValidationError(
                    "Open-access PDF bytes could not be retrieved for the in-app viewer."
                )
            _persist_publication_file_content(
                row,
                content=content,
                content_type=content_type,
                preferred_filename=oa_name,
            )
            session.flush()
            return {
                "mode": "content",
                "url": None,
                "file_name": oa_name,
                "content_type": content_type or "application/pdf",
                "content": content,
            }

        path = _publication_file_storage_path(row.storage_key)
        if path is None or not path.exists() or not path.is_file():
            raise PublicationConsoleNotFoundError(
                "Uploaded file bytes were not found on disk."
            )

        content = path.read_bytes()
        file_name = _coerce_download_filename(file_name=row.file_name, path=path)
        lower = file_name.lower()
        if lower.endswith(".pdf"):
            content_type = "application/pdf"
        elif lower.endswith(".docx"):
            content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        else:
            content_type = "application/octet-stream"

        return {
            "mode": "content",
            "url": None,
            "file_name": file_name,
            "content_type": content_type,
            "content": content,
        }


def get_publication_file_download(
    *, user_id: str, publication_id: str, file_id: str
) -> dict[str, Any]:
    create_all_tables()
    return _resolve_publication_file_binary_payload(
        user_id=user_id,
        publication_id=publication_id,
        file_id=file_id,
        proxy_remote=False,
    )


def get_publication_file_content(
    *, user_id: str, publication_id: str, file_id: str
) -> dict[str, Any]:
    create_all_tables()
    payload = _resolve_publication_file_binary_payload(
        user_id=user_id,
        publication_id=publication_id,
        file_id=file_id,
        proxy_remote=True,
    )
    payload["mode"] = "content"
    payload["url"] = None
    return payload


def trigger_publication_authors_hydration(
    *, user_id: str, publication_id: str
) -> dict[str, Any]:
    create_all_tables()
    return {
        "enqueued": bool(
            _enqueue_authors_if_needed(user_id=user_id, publication_id=publication_id)
        )
    }


def trigger_publication_impact_recompute(
    *, user_id: str, publication_id: str
) -> dict[str, Any]:
    create_all_tables()
    return {
        "enqueued": bool(
            _enqueue_impact_if_needed(user_id=user_id, publication_id=publication_id)
        )
    }


def trigger_publication_ai_recompute(
    *, user_id: str, publication_id: str
) -> dict[str, Any]:
    create_all_tables()
    return {
        "enqueued": bool(
            _enqueue_ai_if_needed(user_id=user_id, publication_id=publication_id)
        )
    }

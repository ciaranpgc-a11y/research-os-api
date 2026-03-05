from __future__ import annotations

import html
import hashlib
import json
import logging
import os
import re
import threading
import time
import xml.etree.ElementTree as ET
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from sqlalchemy import select

from research_os.db import (
    MetricsSnapshot,
    PublicationAiCache,
    PublicationFile,
    PublicationImpactCache,
    PublicationStructuredAbstractCache,
    User,
    Work,
    create_all_tables,
    session_scope,
)
from research_os.clients.openai_client import create_response

logger = logging.getLogger(__name__)

READY_STATUS = "READY"
RUNNING_STATUS = "RUNNING"
FAILED_STATUS = "FAILED"
STATUSES = {READY_STATUS, RUNNING_STATUS, FAILED_STATUS}
RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}

TRAJECTORY_VALUES = {
    "EARLY_SPIKE",
    "SLOW_BURN",
    "CONSISTENT",
    "DECLINING",
    "ACCELERATING",
    "UNKNOWN",
}

FILE_SOURCE_OA_LINK = "OA_LINK"
FILE_SOURCE_USER_UPLOAD = "USER_UPLOAD"
FILE_TYPE_PDF = "PDF"
FILE_TYPE_DOCX = "DOCX"
FILE_TYPE_OTHER = "OTHER"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
STRUCTURED_ABSTRACT_CACHE_VERSION = "publication_structured_abstract_v5"

_executor_lock = threading.Lock()
_executor: ThreadPoolExecutor | None = None
_inflight_lock = threading.Lock()
_inflight_jobs: set[tuple[str, str, str]] = set()


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
    enabled = (
        str(os.getenv("PUB_STRUCTURED_ABSTRACT_USE_LLM", "true")).strip().lower()
        in {"1", "true", "yes", "on"}
    )
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


def _openalex_citing_pages() -> int:
    value = _safe_int(os.getenv("PUB_CONSOLE_OPENALEX_CITING_MAX_PAGES", "2"))
    return max(1, min(5, value if value is not None else 2))


def _max_workers() -> int:
    value = _safe_int(os.getenv("PUB_ANALYTICS_MAX_CONCURRENT_JOBS", "2"))
    return max(1, value if value is not None else 2)


def _is_stale(
    *, computed_at: datetime | None, ttl_seconds: int, now: datetime | None = None
) -> bool:
    if computed_at is None:
        return True
    reference = _coerce_utc(now or _utcnow())
    return (reference - _coerce_utc(computed_at)).total_seconds() > ttl_seconds


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
        by_doi = _search_pubmed_ids(f"\"{normalized_doi}\"[AID]", max_results=3)
        if by_doi:
            return by_doi[0]

    clean_title = _normalize_abstract_text(title)
    if len(clean_title) < 12:
        return None
    safe_title = re.sub(r"[\[\]\"]+", " ", clean_title).strip()
    if not safe_title:
        return None
    if isinstance(year, int) and 1800 <= year <= 2100:
        term = f"\"{safe_title}\"[Title] AND ({year}[DP] OR {year}[PDAT])"
    else:
        term = f"\"{safe_title}\"[Title]"
    by_title = _search_pubmed_ids(term, max_results=1)
    if by_title:
        return by_title[0]
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


def _coerce_download_filename(*, file_name: str | None, path: Path | None = None) -> str:
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
    return root


def _serialize_file(publication_id: str, row: PublicationFile) -> dict[str, Any]:
    download_url: str | None = None
    source = str(row.source or FILE_SOURCE_USER_UPLOAD).upper()
    if source == FILE_SOURCE_OA_LINK:
        download_url = str(row.oa_url or "").strip() or None
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
    publication_type = (
        str(work.publication_type or "").strip() or str(work.work_type or "").strip()
    )
    return {
        "id": str(work.id),
        "title": str(work.title or "").strip(),
        "year": work.year if isinstance(work.year, int) else None,
        "journal": journal or "Not available",
        "publication_type": publication_type or "Not available",
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
    xml_text = _request_text_with_retry(
        url="https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
        params={"db": "pubmed", "id": pmid, "retmode": "xml"},
        timeout_seconds=_pubmed_timeout_seconds(),
        retries=_pubmed_retry_count(),
    )
    if not xml_text.strip():
        return [], []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
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
    xml_text = _request_text_with_retry(
        url="https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
        params={"db": "pubmed", "id": pmid, "retmode": "xml"},
        timeout_seconds=_pubmed_timeout_seconds(),
        retries=_pubmed_retry_count(),
    )
    if not xml_text.strip():
        return None, [], []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
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
        raw_label = (
            str(node.attrib.get("Label") or node.attrib.get("NlmCategory") or "").strip()
        )
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


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(
                max_workers=_max_workers(), thread_name_prefix="pub-console"
            )
        return _executor


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

    _get_executor().submit(_run)
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
        str(year)
        if isinstance(year, int) and 1800 <= year <= 2100
        else ""
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
    if any(
        token in clean for token in ["conclusion", "interpretation", "implication"]
    ):
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
        marker for marker in source_markers if marker and marker not in output_markers_blob
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
                item.get("content") if item.get("content") is not None else item.get("text")
            )
            if not content:
                continue
            key = _canonical_structured_section_key(str(heading_hint or ""))
            label = _normalize_heading_label(str(heading_hint or "")) or _structured_section_label(
                key or "other"
            )
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
        end = matches[index + 1].start() if index + 1 < len(matches) else len(clean_text)
        content = clean_text[start:end].strip(" ;")
        if not content:
            continue
        key = _canonical_structured_section_key(raw_label) or "other"
        label = _normalize_heading_label(raw_label) or _structured_section_label(key)
        sections.append({"key": key, "label": label, "content": content})
    return sections


def _fallback_structured_sections(abstract: str | None) -> tuple[str, list[dict[str, str]]]:
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
        row_hash = _normalize_abstract_text(str(row.source_abstract_sha256 or "")) or None
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
                payload_json={} if has_source_seed else _empty_structured_abstract_payload(),
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
                _normalize_abstract_text(str(row.parser_version or "")) != parser_version
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

            existing_payload = row.payload_json if isinstance(row.payload_json, dict) else {}
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
            _resolve_work_or_raise(session, user_id=user_id, publication_id=publication_id)
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
        "ai": bool(_enqueue_ai_if_needed(user_id=user_id, publication_id=publication_id)),
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
        summary = _build_publication_summary(work, citations_total=max(0, citations_total))
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
        raise PublicationConsoleNotFoundError("Publication details could not be loaded.")
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
        _resolve_work_or_raise(session, user_id=user_id, publication_id=publication_id)
        rows = session.scalars(
            select(PublicationFile)
            .where(
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
            )
            .order_by(PublicationFile.created_at.desc())
        ).all()
        return {"items": [_serialize_file(publication_id, row) for row in rows]}


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

    safe_name = _slugify_filename(filename)
    file_type = _infer_file_type(filename=safe_name, content_type=content_type)
    checksum = hashlib.sha256(content).hexdigest()

    with session_scope() as session:
        _resolve_work_or_raise(session, user_id=user_id, publication_id=publication_id)
        row = PublicationFile(
            publication_id=publication_id,
            owner_user_id=user_id,
            file_name=safe_name,
            file_type=file_type,
            storage_key="",
            source=FILE_SOURCE_USER_UPLOAD,
            oa_url=None,
            checksum=checksum,
            created_at=_utcnow(),
        )
        session.add(row)
        session.flush()

        extension = Path(safe_name).suffix or ".bin"
        folder = _file_storage_root() / user_id / publication_id
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{row.id}{extension}"
        path.write_bytes(content)
        row.storage_key = str(path.resolve())
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


def link_publication_open_access_pdf(
    *, user_id: str, publication_id: str
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        work = _resolve_work_or_raise(
            session, user_id=user_id, publication_id=publication_id
        )
        doi = _normalize_doi(work.doi)
        if not doi:
            raise PublicationConsoleValidationError(
                "DOI is required to search for open-access PDF links."
            )

        email = _unpaywall_email(user_email=user.email)
        if not email:
            raise PublicationConsoleValidationError(
                "UNPAYWALL_EMAIL or account email is required for Unpaywall requests."
            )

        pdf_url = _find_unpaywall_pdf_url(doi=doi, email=email)
        if not pdf_url:
            raise PublicationConsoleValidationError("No open access PDF found.")

        existing = session.scalars(
            select(PublicationFile).where(
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
                PublicationFile.source == FILE_SOURCE_OA_LINK,
                PublicationFile.oa_url == pdf_url,
            )
        ).first()
        if existing is not None:
            return {
                "created": False,
                "file": _serialize_file(publication_id, existing),
                "message": "Open-access PDF link already exists.",
            }

        row = PublicationFile(
            publication_id=publication_id,
            owner_user_id=user_id,
            file_name=f"{_slugify_filename(work.title)[:80] or 'open-access'}.pdf",
            file_type=FILE_TYPE_PDF,
            storage_key=pdf_url,
            source=FILE_SOURCE_OA_LINK,
            oa_url=pdf_url,
            checksum=None,
            created_at=_utcnow(),
        )
        session.add(row)
        session.flush()
        session.refresh(row)
        return {
            "created": True,
            "file": _serialize_file(publication_id, row),
            "message": "Open-access PDF link added.",
        }


def delete_publication_file(
    *, user_id: str, publication_id: str, file_id: str
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_work_or_raise(session, user_id=user_id, publication_id=publication_id)
        row = session.scalars(
            select(PublicationFile).where(
                PublicationFile.id == file_id,
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
            )
        ).first()
        if row is None:
            raise PublicationConsoleNotFoundError(
                f"Publication file '{file_id}' was not found."
            )
        storage_key = str(row.storage_key or "")
        source = str(row.source or "").upper()
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


def get_publication_file_download(
    *, user_id: str, publication_id: str, file_id: str
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_work_or_raise(session, user_id=user_id, publication_id=publication_id)
        row = session.scalars(
            select(PublicationFile).where(
                PublicationFile.id == file_id,
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == publication_id,
            )
        ).first()
        if row is None:
            raise PublicationConsoleNotFoundError(
                f"Publication file '{file_id}' was not found."
            )

        source = str(row.source or "").upper()
        if source == FILE_SOURCE_OA_LINK and row.oa_url:
            oa_name = _coerce_download_filename(
                file_name=str(row.file_name or "open-access.pdf")
            )
            return {
                "mode": "redirect",
                "url": str(row.oa_url),
                "file_name": oa_name,
                "content_type": "application/pdf",
                "content": b"",
            }

        path = Path(str(row.storage_key or ""))
        if not path.exists() or not path.is_file():
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

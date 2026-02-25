from __future__ import annotations

import hashlib
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
    User,
    Work,
    create_all_tables,
    session_scope,
)

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
    clean = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(value or "").strip()).strip(".-")
    return clean or "publication-file"


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


def get_publication_details(*, user_id: str, publication_id: str) -> dict[str, Any]:
    create_all_tables()
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
        return _build_publication_summary(work, citations_total=max(0, citations_total))


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
            return {
                "mode": "redirect",
                "url": str(row.oa_url),
                "file_name": str(row.file_name or "open-access.pdf"),
                "content_type": "application/pdf",
                "content": b"",
            }

        path = Path(str(row.storage_key or ""))
        if not path.exists() or not path.is_file():
            raise PublicationConsoleNotFoundError(
                "Uploaded file bytes were not found on disk."
            )

        content = path.read_bytes()
        file_name = str(row.file_name or path.name)
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

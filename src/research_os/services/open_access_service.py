from __future__ import annotations

from dataclasses import dataclass
import re
import time
from typing import Any
import httpx
from sqlalchemy import select

from research_os.db import (
    DataLibraryAsset,
    User,
    Work,
    create_all_tables,
    session_scope,
)
from research_os.services.data_planner_service import upload_library_assets

OPENALEX_WORKS_URL = "https://api.openalex.org/works"
OPEN_ACCESS_HTTP_TIMEOUT_SECONDS = 20.0
OPEN_ACCESS_RETRY_COUNT = 2
OPEN_ACCESS_RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
OPEN_ACCESS_RETRY_BASE_DELAY_SECONDS = 0.35
OPEN_ACCESS_MAX_PDF_BYTES = 25 * 1024 * 1024


class OpenAccessValidationError(RuntimeError):
    pass


class OpenAccessNotFoundError(RuntimeError):
    pass


@dataclass
class _WorkPayload:
    work_id: str
    title: str
    year: int | None
    doi: str | None
    pmid: str | None
    url: str | None


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise OpenAccessNotFoundError(f"User '{user_id}' was not found.")
    return user


def _normalize_doi(value: str | None) -> str | None:
    clean = re.sub(r"\s+", "", (value or "").strip()).lower()
    if not clean:
        return None
    if clean.startswith("https://doi.org/"):
        clean = clean.removeprefix("https://doi.org/")
    return clean


def _extract_pmid(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.isdigit():
        return text
    patterns = [
        re.compile(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d+)", re.IGNORECASE),
        re.compile(r"/pubmed/(\d+)", re.IGNORECASE),
        re.compile(r"pmid[:\s]+(\d+)", re.IGNORECASE),
    ]
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            return match.group(1)
    return None


def _normalize_title(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").strip().lower()).strip()


def _title_similarity(expected: str, observed: str) -> float:
    expected_tokens = set(_normalize_title(expected).split())
    observed_tokens = set(_normalize_title(observed).split())
    if not expected_tokens or not observed_tokens:
        return 0.0
    overlap = len(expected_tokens & observed_tokens)
    return overlap / max(1, len(expected_tokens))


def _request_with_retry(
    client: httpx.Client,
    *,
    url: str,
    params: dict[str, Any] | None = None,
) -> httpx.Response:
    response: httpx.Response | None = None
    for attempt in range(OPEN_ACCESS_RETRY_COUNT + 1):
        response = client.get(url, params=params)
        if (
            response.status_code not in OPEN_ACCESS_RETRYABLE_STATUS_CODES
            or attempt >= OPEN_ACCESS_RETRY_COUNT
        ):
            return response
        time.sleep(OPEN_ACCESS_RETRY_BASE_DELAY_SECONDS * (attempt + 1))
    return response if response is not None else client.get(url, params=params)


def _best_title_match(
    *,
    title: str,
    year: int | None,
    results: list[dict[str, Any]],
) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    best_score = 0.0
    for candidate in results:
        candidate_title = str(candidate.get("display_name", "")).strip()
        if not candidate_title:
            continue
        score = _title_similarity(title, candidate_title)
        candidate_year = candidate.get("publication_year")
        if year is not None and isinstance(candidate_year, int):
            if abs(candidate_year - year) <= 1:
                score += 0.12
            elif abs(candidate_year - year) > 3:
                score -= 0.12
        if score > best_score:
            best_score = score
            best = candidate
    if best is None or best_score < 0.65:
        return None
    return best


def _fetch_openalex_candidate(
    *,
    client: httpx.Client,
    work: _WorkPayload,
) -> tuple[dict[str, Any] | None, str]:
    doi = _normalize_doi(work.doi)
    pmid = _extract_pmid(work.pmid or work.url or "")
    title = str(work.title or "").strip()
    if doi:
        response = _request_with_retry(
            client,
            url=OPENALEX_WORKS_URL,
            params={"filter": f"doi:https://doi.org/{doi}", "per-page": 1},
        )
        if response.status_code < 400:
            results = (response.json().get("results") or []) if response.json() else []
            if results:
                return results[0], "doi"
    if pmid:
        response = _request_with_retry(
            client,
            url=OPENALEX_WORKS_URL,
            params={"filter": f"pmid:{pmid}", "per-page": 1},
        )
        if response.status_code < 400:
            results = (response.json().get("results") or []) if response.json() else []
            if results:
                return results[0], "pmid"
    if title:
        response = _request_with_retry(
            client,
            url=OPENALEX_WORKS_URL,
            params={
                "search": title,
                "per-page": 5,
                "sort": "cited_by_count:desc",
            },
        )
        if response.status_code < 400:
            payload = response.json()
            results = [
                item
                for item in (payload.get("results") or [])
                if isinstance(item, dict)
            ]
            best = _best_title_match(title=title, year=work.year, results=results)
            if best is not None:
                return best, "title"
    return None, "none"


def _extract_open_access_fields(
    candidate: dict[str, Any],
) -> tuple[bool, str | None, str | None]:
    open_access = candidate.get("open_access") or {}
    best_oa_location = candidate.get("best_oa_location") or {}
    locations = candidate.get("locations") or []

    is_oa = bool(open_access.get("is_oa"))
    oa_url = (
        str(open_access.get("oa_url", "")).strip()
        or str(best_oa_location.get("landing_page_url", "")).strip()
        or None
    )
    pdf_url = str(best_oa_location.get("pdf_url", "")).strip() or None
    if not pdf_url:
        for location in locations:
            if not isinstance(location, dict):
                continue
            candidate_pdf = str(location.get("pdf_url", "")).strip()
            if candidate_pdf:
                pdf_url = candidate_pdf
                break
    return is_oa, oa_url, pdf_url


def _safe_filename(value: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip()).strip(".-")
    return clean or "open-access-work"


def _pdf_filename(work: _WorkPayload) -> str:
    title = _safe_filename(work.title or "open-access-work")
    year = str(work.year) if isinstance(work.year, int) else "n-d"
    return f"{year}-{title[:80]}-{work.work_id}.pdf"


def _download_pdf(
    *,
    client: httpx.Client,
    pdf_url: str,
) -> bytes:
    response = _request_with_retry(client, url=pdf_url)
    if response.status_code >= 400:
        raise OpenAccessValidationError(
            f"PDF download failed ({response.status_code})."
        )
    content = bytes(response.content or b"")
    if not content:
        raise OpenAccessValidationError("PDF download returned empty content.")
    if len(content) > OPEN_ACCESS_MAX_PDF_BYTES:
        raise OpenAccessValidationError("PDF is larger than upload limit (25MB).")
    content_type = str(response.headers.get("content-type", "")).lower()
    is_pdf_content = content.startswith(b"%PDF")
    if "application/pdf" not in content_type and not is_pdf_content:
        raise OpenAccessValidationError("Resolved open-access file is not a PDF.")
    return content


def _existing_pdf_asset_id(
    *,
    work_id: str,
    project_id: str | None,
) -> str | None:
    with session_scope() as session:
        query = select(DataLibraryAsset).where(
            DataLibraryAsset.filename.like(f"%-{work_id}.pdf")
        )
        if project_id:
            query = query.where(DataLibraryAsset.project_id == project_id)
        else:
            query = query.where(DataLibraryAsset.project_id.is_(None))
        row = session.scalars(
            query.order_by(DataLibraryAsset.uploaded_at.desc())
        ).first()
        return str(row.id) if row is not None else None


def discover_open_access_for_persona(
    *,
    user_id: str,
    work_ids: list[str] | None = None,
    include_pdf_upload: bool = False,
    project_id: str | None = None,
    max_items: int = 200,
) -> dict[str, Any]:
    create_all_tables()
    if max_items < 1:
        raise OpenAccessValidationError("max_items must be at least 1.")

    selected_ids = {str(item).strip() for item in (work_ids or []) if str(item).strip()}
    works: list[_WorkPayload] = []
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        query = (
            select(Work).where(Work.user_id == user_id).order_by(Work.updated_at.desc())
        )
        if selected_ids:
            query = query.where(Work.id.in_(list(selected_ids)))
        rows = session.scalars(query).all()
        for row in rows[:max_items]:
            works.append(
                _WorkPayload(
                    work_id=str(row.id),
                    title=str(row.title or "").strip(),
                    year=row.year if isinstance(row.year, int) else None,
                    doi=row.doi,
                    pmid=_extract_pmid(row.url),
                    url=row.url,
                )
            )

    records: list[dict[str, Any]] = []
    uploaded_pdf_count = 0
    open_access_count = 0

    if not works:
        return {
            "checked_count": 0,
            "open_access_count": 0,
            "uploaded_pdf_count": 0,
            "records": [],
        }

    with httpx.Client(
        timeout=OPEN_ACCESS_HTTP_TIMEOUT_SECONDS, follow_redirects=True
    ) as client:
        for work in works:
            try:
                candidate, match_method = _fetch_openalex_candidate(
                    client=client, work=work
                )
            except Exception as exc:
                records.append(
                    {
                        "work_id": work.work_id,
                        "title": work.title,
                        "doi": work.doi,
                        "is_open_access": False,
                        "source": "openalex",
                        "open_access_url": None,
                        "pdf_url": None,
                        "pdf_asset_id": None,
                        "status": "lookup_error",
                        "note": str(exc),
                    }
                )
                continue

            if not candidate:
                records.append(
                    {
                        "work_id": work.work_id,
                        "title": work.title,
                        "doi": work.doi,
                        "is_open_access": False,
                        "source": "openalex",
                        "open_access_url": None,
                        "pdf_url": None,
                        "pdf_asset_id": None,
                        "status": "no_match",
                        "note": "No confident OpenAlex match.",
                    }
                )
                continue

            is_oa, oa_url, pdf_url = _extract_open_access_fields(candidate)
            if is_oa:
                open_access_count += 1
            record: dict[str, Any] = {
                "work_id": work.work_id,
                "title": work.title,
                "doi": work.doi,
                "is_open_access": is_oa,
                "source": "openalex",
                "open_access_url": oa_url,
                "pdf_url": pdf_url,
                "pdf_asset_id": None,
                "status": "open_access" if is_oa else "closed_access",
                "note": f"Matched by {match_method}.",
            }

            if include_pdf_upload and is_oa and pdf_url:
                existing_asset_id = _existing_pdf_asset_id(
                    work_id=work.work_id,
                    project_id=project_id,
                )
                if existing_asset_id:
                    record["pdf_asset_id"] = existing_asset_id
                    record["status"] = "pdf_already_uploaded"
                else:
                    try:
                        pdf_content = _download_pdf(client=client, pdf_url=pdf_url)
                        filename = _pdf_filename(work)
                        asset_ids = upload_library_assets(
                            files=[(filename, "application/pdf", pdf_content)],
                            project_id=project_id,
                            user_id=user_id,
                        )
                        if asset_ids:
                            record["pdf_asset_id"] = asset_ids[0]
                            record["status"] = "pdf_uploaded"
                            uploaded_pdf_count += 1
                    except Exception as exc:
                        record["status"] = "pdf_upload_failed"
                        record["note"] = str(exc)

            records.append(record)

    return {
        "checked_count": len(works),
        "open_access_count": open_access_count,
        "uploaded_pdf_count": uploaded_pdf_count,
        "records": records,
    }

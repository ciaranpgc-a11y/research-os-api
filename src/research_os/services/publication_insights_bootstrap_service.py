from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import func, select

from research_os.db import User, Work, create_all_tables, session_scope
from research_os.services.collaboration_service import (
    CollaborationValidationError,
    validate_orcid_id,
)
from research_os.services.persona_service import (
    PersonaNotFoundError,
    recompute_collaborator_edges,
    upsert_work,
)
from research_os.services.persona_sync_job_service import (
    PersonaSyncJobConflictError,
    PersonaSyncJobValidationError,
    enqueue_persona_sync_job,
    list_persona_sync_jobs,
    serialize_persona_sync_job,
)
from research_os.services.publication_console_service import (
    enqueue_publication_drilldown_warmup,
)

RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
ALLOWED_PROVIDERS = {"openalex", "semantic_scholar", "manual"}


class PublicationInsightsBootstrapValidationError(RuntimeError):
    pass


class PublicationInsightsBootstrapNotFoundError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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


def _openalex_timeout_seconds() -> float:
    value = os.getenv("PUB_INSIGHTS_OPENALEX_TIMEOUT_SECONDS", "12").strip()
    try:
        parsed = float(value)
    except Exception:
        parsed = 12.0
    return max(5.0, parsed)


def _openalex_retry_count() -> int:
    parsed = _safe_int(os.getenv("PUB_INSIGHTS_OPENALEX_RETRY_COUNT", "2"))
    return max(0, min(6, parsed if parsed is not None else 2))


def _openalex_max_pages() -> int:
    parsed = _safe_int(os.getenv("PUB_INSIGHTS_BOOTSTRAP_MAX_PAGES", "5"))
    return max(1, min(25, parsed if parsed is not None else 5))


def _openalex_default_max_works() -> int:
    parsed = _safe_int(os.getenv("PUB_INSIGHTS_BOOTSTRAP_MAX_WORKS", "500"))
    return max(1, min(2000, parsed if parsed is not None else 500))


def _openalex_mailto(*, fallback_email: str | None = None) -> str | None:
    explicit = str(os.getenv("OPENALEX_MAILTO", "")).strip()
    if explicit and "@" in explicit:
        return explicit
    clean_fallback = str(fallback_email or "").strip()
    if clean_fallback and "@" in clean_fallback:
        return clean_fallback
    bootstrap = str(os.getenv("AAWE_BOOTSTRAP_EMAIL", "")).strip()
    if bootstrap and "@" in bootstrap:
        return bootstrap
    return None


def _openalex_request_with_retry(*, url: str, params: dict[str, Any]) -> dict[str, Any]:
    timeout = httpx.Timeout(_openalex_timeout_seconds())
    retries = _openalex_retry_count()
    with httpx.Client(timeout=timeout) as client:
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


def _normalize_name(value: str | None) -> str:
    clean = re.sub(r"\s+", " ", str(value or "").strip())
    if len(clean) < 2:
        raise PublicationInsightsBootstrapValidationError("Name is required.")
    if len(clean) > 255:
        raise PublicationInsightsBootstrapValidationError(
            "Name must be 255 characters or fewer."
        )
    return clean


def _normalize_orcid_from_url(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    if clean.startswith("https://orcid.org/"):
        clean = clean.removeprefix("https://orcid.org/")
    elif clean.startswith("http://orcid.org/"):
        clean = clean.removeprefix("http://orcid.org/")
    clean = clean.strip().strip("/")
    return clean or None


def _normalize_doi(value: str | None) -> str | None:
    clean = re.sub(r"\s+", "", str(value or "").strip())
    if not clean:
        return None
    if clean.startswith("https://doi.org/"):
        clean = clean.removeprefix("https://doi.org/")
    elif clean.startswith("http://doi.org/"):
        clean = clean.removeprefix("http://doi.org/")
    return clean or None


def _extract_openalex_work_id(value: str | None) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    clean = clean.rstrip("/")
    if clean.startswith("https://openalex.org/"):
        clean = clean.removeprefix("https://openalex.org/")
    elif clean.startswith("http://openalex.org/"):
        clean = clean.removeprefix("http://openalex.org/")
    clean = clean.strip().strip("/")
    if not clean:
        return None
    token = clean.split("/")[-1].strip()
    if not token:
        return None
    if token[0].lower() != "w":
        return None
    return token.upper()


def _openalex_abstract_from_inverted_index(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    tokens_with_positions: list[tuple[int, str]] = []
    for token, positions in value.items():
        if not isinstance(token, str) or not isinstance(positions, list):
            continue
        for position in positions:
            if isinstance(position, int) and position >= 0:
                tokens_with_positions.append((position, token))
    if not tokens_with_positions:
        return None
    tokens_with_positions.sort(key=lambda item: item[0])
    abstract = re.sub(
        r"\s+", " ", " ".join(token for _, token in tokens_with_positions).strip()
    )
    return abstract or None


def _normalize_providers(providers: list[str] | None) -> list[str]:
    source = providers if providers is not None else ["openalex", "semantic_scholar"]
    normalized: list[str] = []
    seen: set[str] = set()
    for item in source:
        clean = str(item or "").strip().lower()
        if not clean:
            continue
        if clean == "semanticscholar":
            clean = "semantic_scholar"
        if clean not in ALLOWED_PROVIDERS:
            continue
        if clean in seen:
            continue
        seen.add(clean)
        normalized.append(clean)
    return normalized or ["openalex", "semantic_scholar"]


def _resolve_openalex_author(
    *,
    orcid_id: str,
    mailto: str | None,
    full_name: str,
) -> dict[str, str] | None:
    params: dict[str, Any] = {
        "filter": f"orcid:https://orcid.org/{orcid_id}",
        "per-page": 3,
        "select": "id,display_name,orcid",
    }
    if mailto:
        params["mailto"] = mailto
    payload = _openalex_request_with_retry(
        url="https://api.openalex.org/authors",
        params=params,
    )
    results = payload.get("results") if isinstance(payload.get("results"), list) else []
    if not results:
        return None

    clean_target = re.sub(r"\s+", " ", full_name.strip()).lower()
    selected: dict[str, Any] | None = None
    for item in results:
        if not isinstance(item, dict):
            continue
        candidate_name = re.sub(
            r"\s+", " ", str(item.get("display_name") or "").strip()
        ).lower()
        if (
            clean_target
            and candidate_name
            and (clean_target == candidate_name or clean_target in candidate_name)
        ):
            selected = item
            break
    if selected is None:
        selected = results[0] if isinstance(results[0], dict) else None
    if not selected:
        return None

    author_id = str(selected.get("id") or "").strip()
    if not author_id:
        return None
    author_name = re.sub(r"\s+", " ", str(selected.get("display_name") or "").strip())
    return {
        "openalex_author_id": author_id,
        "openalex_author_name": author_name or full_name,
    }


def _resolve_openalex_author_by_name(
    *,
    full_name: str,
    mailto: str | None,
) -> dict[str, str] | None:
    """Resolve OpenAlex author by name (no ORCID required).
    Useful for users who haven't linked ORCID.
    """
    clean_name = _normalize_name(full_name)
    params: dict[str, Any] = {
        "search": clean_name,
        "per-page": 10,
        "select": "id,display_name,orcid,works_count",
    }
    if mailto:
        params["mailto"] = mailto
    payload = _openalex_request_with_retry(
        url="https://api.openalex.org/authors",
        params=params,
    )
    results = payload.get("results") if isinstance(payload.get("results"), list) else []
    if not results:
        return None

    # Try to find exact or close match by name
    clean_target = re.sub(r"\s+", " ", clean_name.strip()).lower()
    selected: dict[str, Any] | None = None
    
    # Pass 1: Exact match or strong containment
    for item in results:
        if not isinstance(item, dict):
            continue
        candidate_name = re.sub(
            r"\s+", " ", str(item.get("display_name") or "").strip()
        ).lower()
        if clean_target == candidate_name:
            # Exact match - take it immediately
            selected = item
            break
        if (
            clean_target
            and candidate_name
            and (clean_target in candidate_name or candidate_name in clean_target)
        ):
            # Strong match - prefer this over first result
            if selected is None:
                selected = item
    
    # Fall back to first result with works if no match found
    if selected is None:
        for item in results:
            if isinstance(item, dict) and item.get("works_count", 0) > 0:
                selected = item
                break
    
    # Fall back to first result
    if selected is None:
        selected = results[0] if isinstance(results[0], dict) else None
    
    if not selected:
        return None

    author_id = str(selected.get("id") or "").strip()
    if not author_id:
        return None
    # Extract just the ID part (e.g., "A5023740689" from "https://openalex.org/A5023740689")
    if author_id.startswith("https://openalex.org/"):
        author_id = author_id.removeprefix("https://openalex.org/")
    elif author_id.startswith("http://openalex.org/"):
        author_id = author_id.removeprefix("http://openalex.org/")
    author_id = author_id.strip().strip("/")
    if not author_id:
        return None
    author_name = re.sub(r"\s+", " ", str(selected.get("display_name") or "").strip())
    return {
        "openalex_author_id": author_id,
        "openalex_author_name": author_name or full_name,
    }


def _fetch_openalex_works_for_author(
    *,
    openalex_author_id: str,
    mailto: str | None,
    max_works: int,
) -> list[dict[str, Any]]:
    clean_max_works = max(1, min(max_works, 2000))
    results: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    cursor = "*"
    pages = 0
    max_pages = _openalex_max_pages()
    while cursor and pages < max_pages and len(results) < clean_max_works:
        params: dict[str, Any] = {
            "filter": f"author.id:{openalex_author_id}",
            "select": (
                "id,display_name,publication_year,type,doi,ids,primary_location,"
                "authorships,abstract_inverted_index"
            ),
            "per-page": 200,
            "sort": "publication_date:desc",
            "cursor": cursor,
        }
        if mailto:
            params["mailto"] = mailto
        payload = _openalex_request_with_retry(
            url="https://api.openalex.org/works",
            params=params,
        )
        rows = (
            payload.get("results") if isinstance(payload.get("results"), list) else []
        )
        for row in rows:
            if not isinstance(row, dict):
                continue
            work_id = str(row.get("id") or "").strip()
            if not work_id:
                continue
            if work_id in seen_ids:
                continue
            seen_ids.add(work_id)
            results.append(row)
            if len(results) >= clean_max_works:
                break
        meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
        next_cursor = str(meta.get("next_cursor") or "").strip()
        if not next_cursor or next_cursor == cursor:
            break
        cursor = next_cursor
        pages += 1
    return results


def _extract_authors(work_payload: dict[str, Any]) -> list[dict[str, str]]:
    authorships = (
        work_payload.get("authorships")
        if isinstance(work_payload.get("authorships"), list)
        else []
    )
    authors: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in authorships:
        if not isinstance(item, dict):
            continue
        author = item.get("author") if isinstance(item.get("author"), dict) else {}
        display_name = re.sub(
            r"\s+", " ", str(author.get("display_name") or "").strip()
        )
        if not display_name:
            continue
        candidate_orcid = _normalize_orcid_from_url(
            str(author.get("orcid") or "").strip() or None
        )
        dedupe_key = f"{display_name.lower()}::{(candidate_orcid or '').lower()}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        authors.append(
            {
                "name": display_name,
                "orcid_id": candidate_orcid or "",
            }
        )
    return authors


def _work_from_openalex(
    work_payload: dict[str, Any], *, user_openalex_author_id: str | None = None
) -> dict[str, Any]:
    title = re.sub(r"\s+", " ", str(work_payload.get("display_name") or "").strip())
    doi = _normalize_doi(work_payload.get("doi"))
    ids = work_payload.get("ids") if isinstance(work_payload.get("ids"), dict) else {}
    if not doi:
        doi = _normalize_doi(ids.get("doi"))
    primary_location = (
        work_payload.get("primary_location")
        if isinstance(work_payload.get("primary_location"), dict)
        else {}
    )
    source = (
        primary_location.get("source")
        if isinstance(primary_location.get("source"), dict)
        else {}
    )
    host_venue = (
        work_payload.get("host_venue")
        if isinstance(work_payload.get("host_venue"), dict)
        else {}
    )
    venue_name = re.sub(
        r"\s+",
        " ",
        str(source.get("display_name") or host_venue.get("display_name") or "").strip(),
    )
    publisher = re.sub(
        r"\s+",
        " ",
        str(
            source.get("host_organization_name") or host_venue.get("publisher") or ""
        ).strip(),
    )
    abstract = (
        _openalex_abstract_from_inverted_index(
            work_payload.get("abstract_inverted_index")
        )
        or ""
    )
    work_id_url = str(work_payload.get("id") or "").strip()
    work_url = f"https://doi.org/{doi}" if doi else work_id_url
    
    # Determine user's author position if author ID is provided
    user_author_position: int | None = None
    if user_openalex_author_id:
        # Normalize the user's author ID for comparison
        normalized_user_id = user_openalex_author_id.strip()
        if normalized_user_id.startswith("https://openalex.org/"):
            normalized_user_id = normalized_user_id.removeprefix("https://openalex.org/")
        elif normalized_user_id.startswith("http://openalex.org/"):
            normalized_user_id = normalized_user_id.removeprefix("http://openalex.org/")
        normalized_user_id = normalized_user_id.strip("/").upper()
        
        # Look through authorships to find user's position
        authorships = work_payload.get("authorships")
        if isinstance(authorships, list):
            for idx, authorship in enumerate(authorships, 1):
                if not isinstance(authorship, dict):
                    continue
                author = authorship.get("author")
                if not isinstance(author, dict):
                    continue
                author_id = str(author.get("id") or "").strip()
                if author_id.startswith("https://openalex.org/"):
                    author_id = author_id.removeprefix("https://openalex.org/")
                elif author_id.startswith("http://openalex.org/"):
                    author_id = author_id.removeprefix("http://openalex.org/")
                author_id = author_id.strip("/").upper()
                if author_id == normalized_user_id:
                    user_author_position = idx
                    break
    
    result = {
        "title": title,
        "year": _safe_int(work_payload.get("publication_year")),
        "doi": doi,
        "work_type": re.sub(r"\s+", " ", str(work_payload.get("type") or "").strip()),
        "venue_name": venue_name,
        "publisher": publisher,
        "abstract": abstract,
        "keywords": [],
        "url": work_url,
        "authors": _extract_authors(work_payload),
        "openalex_work_id": _extract_openalex_work_id(work_id_url),
    }
    
    if user_author_position is not None:
        result["user_author_position"] = user_author_position
    
    return result


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise PublicationInsightsBootstrapNotFoundError(
            f"User '{user_id}' was not found."
        )
    return user


def bootstrap_publication_insights_from_orcid(
    *,
    user_id: str,
    orcid_id: str,
    full_name: str,
    providers: list[str] | None = None,
    refresh_analytics: bool = True,
    refresh_metrics: bool = True,
    max_works: int | None = None,
) -> dict[str, Any]:
    create_all_tables()
    try:
        clean_orcid = validate_orcid_id(orcid_id)
    except CollaborationValidationError as exc:
        raise PublicationInsightsBootstrapValidationError(str(exc)) from exc
    if not clean_orcid:
        raise PublicationInsightsBootstrapValidationError("ORCID is required.")
    clean_name = _normalize_name(full_name)
    normalized_providers = _normalize_providers(providers)
    target_max_works = max(
        1, min(int(max_works or _openalex_default_max_works()), 2000)
    )

    user_email: str | None = None
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        user_email = str(user.email or "").strip() or None
        previous_orcid = str(user.orcid_id or "").strip() or None
        orcid_changed = previous_orcid != clean_orcid
        existing_users = session.scalars(
            select(User).where(User.orcid_id == clean_orcid, User.id != user.id)
        ).all()
        for existing in existing_users:
            existing.orcid_id = None
            existing.orcid_access_token = None
            existing.orcid_refresh_token = None
            existing.orcid_token_expires_at = None
        user.orcid_id = clean_orcid
        user.name = clean_name
        # If ORCID changed, clear stale OAuth tokens tied to the previous ORCID account.
        if orcid_changed:
            user.orcid_access_token = None
            user.orcid_refresh_token = None
            user.orcid_token_expires_at = None
        session.flush()

    mailto = _openalex_mailto(fallback_email=user_email)
    author_identity = _resolve_openalex_author(
        orcid_id=clean_orcid,
        mailto=mailto,
        full_name=clean_name,
    )
    if not author_identity:
        raise PublicationInsightsBootstrapValidationError(
            "No OpenAlex author profile matched that ORCID."
        )
    openalex_author_id = str(author_identity.get("openalex_author_id") or "").strip()
    openalex_author_name = (
        str(author_identity.get("openalex_author_name") or "").strip() or clean_name
    )
    if not openalex_author_id:
        raise PublicationInsightsBootstrapValidationError(
            "Could not resolve OpenAlex author ID from ORCID."
        )

    openalex_works = _fetch_openalex_works_for_author(
        openalex_author_id=openalex_author_id,
        mailto=mailto,
        max_works=target_max_works,
    )

    upserted_ids: list[str] = []
    seen_upserted: set[str] = set()
    structured_abstract_refresh_ids: set[str] = set()
    imported_count = 0
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        baseline_count = (
            session.scalar(select(func.count(Work.id)).where(Work.user_id == user_id))
            or 0
        )
        existing_work_ids_before = {
            str(item)
            for item in session.scalars(
                select(Work.id).where(Work.user_id == user_id)
            ).all()
        }
        for item in openalex_works:
            if not isinstance(item, dict):
                continue
            work_payload = _work_from_openalex(item, user_openalex_author_id=openalex_author_id)
            if not work_payload.get("title"):
                continue
            record = upsert_work(
                user_id=user_id,
                work=work_payload,
                provenance="openalex",
                overwrite_user_metadata=False,
                ensure_tables=False,
                session=session,
            )
            work_id = str(record.get("id") or "").strip()
            if not work_id or work_id in seen_upserted:
                continue
            seen_upserted.add(work_id)
            upserted_ids.append(work_id)
            if bool(record.get("structured_abstract_refresh_needed")):
                structured_abstract_refresh_ids.add(work_id)
            if work_id not in existing_work_ids_before:
                imported_count += 1
            openalex_work_id = _extract_openalex_work_id(
                work_payload.get("openalex_work_id")
            )
            if openalex_work_id:
                row = session.get(Work, work_id)
                if row is not None and not str(row.openalex_work_id or "").strip():
                    row.openalex_work_id = openalex_work_id
        if imported_count <= 0:
            current_count = (
                session.scalar(
                    select(func.count(Work.id)).where(Work.user_id == user_id)
                )
                or baseline_count
            )
            imported_count = max(0, int(current_count) - int(baseline_count))
        user.orcid_last_synced_at = _utcnow()
        session.flush()

    for work_id in upserted_ids:
        try:
            enqueue_publication_drilldown_warmup(
                user_id=user_id,
                publication_id=work_id,
                force_structured_abstract=work_id in structured_abstract_refresh_ids,
            )
        except Exception:
            pass

    sync_job_payload: dict[str, Any] | None = None
    metrics_sync_enqueued = False
    message = f"Imported {imported_count} publication{'s' if imported_count != 1 else ''} from OpenAlex."
    try:
        sync_job = enqueue_persona_sync_job(
            user_id=user_id,
            job_type="metrics_sync",
            providers=normalized_providers,
            refresh_analytics=bool(refresh_analytics),
            refresh_metrics=bool(refresh_metrics),
        )
        sync_job_payload = serialize_persona_sync_job(sync_job)
        metrics_sync_enqueued = True
        message = f"{message} Metrics sync queued to populate publication insights."
    except PersonaSyncJobConflictError:
        active_jobs = list_persona_sync_jobs(user_id=user_id, limit=10)
        active = next(
            (item for item in active_jobs if str(item.status) in {"queued", "running"}),
            None,
        )
        if active is not None:
            sync_job_payload = serialize_persona_sync_job(active)
        message = f"{message} Another sync job is already active, so insights will refresh when it completes."
    except (PersonaSyncJobValidationError, PersonaNotFoundError) as exc:
        raise PublicationInsightsBootstrapValidationError(str(exc)) from exc

    collaboration = recompute_collaborator_edges(user_id=user_id)
    return {
        "orcid_id": clean_orcid,
        "full_name": clean_name,
        "openalex_author_id": openalex_author_id,
        "openalex_author_name": openalex_author_name,
        "imported_count": int(imported_count),
        "work_ids": upserted_ids,
        "metrics_sync_enqueued": metrics_sync_enqueued,
        "sync_job": sync_job_payload,
        "core_collaborators": collaboration.get("core_collaborators") or [],
        "message": message,
    }


def import_openalex_works_direct(
    *,
    user_id: str,
    openalex_author_id: str,
    overwrite_user_metadata: bool = False,
) -> dict[str, Any]:
    """Import publications directly from OpenAlex using a known author ID.
    
    This bypasses ORCID and name resolution, using the author ID provided.
    Returns the same structure as import_orcid_works for consistency.
    """
    from research_os.services.orcid_service import (
        _work_from_openalex,
        _upsert_imported_orcid_work,
        _openalex_mailto,
        OrcidValidationError,
    )
    
    # Normalize the author ID
    author_id = str(openalex_author_id).strip()
    if author_id.startswith("https://openalex.org/"):
        author_id = author_id.removeprefix("https://openalex.org/")
    elif author_id.startswith("http://openalex.org/"):
        author_id = author_id.removeprefix("http://openalex.org/")
    author_id = author_id.strip().strip("/")
    
    if not author_id:
        raise PublicationInsightsBootstrapValidationError("OpenAlex author ID is required")
    
    # Get user info
    create_all_tables()
    with session_scope() as session:
        user = session.get(User, user_id)
        if not user:
            raise PublicationInsightsBootstrapNotFoundError(f"User '{user_id}' not found")
        user_name = user.name or ""
        user_email = user.email
    
    mailto = _openalex_mailto(fallback_email=user_email)
    
    # Fetch publications from OpenAlex
    max_works = 2000
    openalex_works = _fetch_openalex_works_for_author(
        openalex_author_id=author_id,
        mailto=mailto,
        max_works=max_works,
    )
    
    # Transform OpenAlex payloads to work payloads
    imported: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for work_raw in openalex_works:
        if not isinstance(work_raw, dict):
            continue
        work_id = str(work_raw.get("id") or "").strip()
        if work_id and work_id in seen_ids:
            continue
        if work_id:
            seen_ids.add(work_id)
        work_payload = _work_from_openalex(work_raw, user_openalex_author_id=openalex_author_id)
        if not work_payload.get("title"):
            continue
        if work_id and not work_payload.get("url"):
            work_payload["url"] = work_id
        imported.append(work_payload)
    
    # Upsert all imported works
    upserted_ids: list[str] = []
    seen_upserted_ids: set[str] = set()
    new_work_ids: list[str] = []
    seen_new_work_ids: set[str] = set()
    new_works_count = 0
    with session_scope() as session:
        user = session.get(User, user_id)
        if not user:
            raise PublicationInsightsBootstrapNotFoundError(f"User '{user_id}' not found")
        
        existing_work_ids_before = {
            str(item)
            for item in session.scalars(
                select(Work.id).where(Work.user_id == user_id)
            ).all()
        }
        baseline_works_count = (
            session.scalar(select(func.count(Work.id)).where(Work.user_id == user_id))
            or 0
        )
        
        for work in imported:
            record = _upsert_imported_orcid_work(
                user_id=user_id,
                work=work,
                overwrite_user_metadata=overwrite_user_metadata,
                session=session,
            )
            work_id = str(record["id"])
            if work_id in seen_upserted_ids:
                continue
            seen_upserted_ids.add(work_id)
            upserted_ids.append(work_id)
            if work_id not in existing_work_ids_before and work_id not in seen_new_work_ids:
                seen_new_work_ids.add(work_id)
                new_work_ids.append(work_id)
        
        current_works_count = (
            session.scalar(select(func.count(Work.id)).where(Work.user_id == user_id))
            or 0
        )
        new_works_count = max(0, int(current_works_count) - int(baseline_works_count))
        session.flush()
    
    # Trigger warmup for imported publications
    for work_id in upserted_ids:
        try:
            enqueue_publication_drilldown_warmup(
                user_id=user_id,
                publication_id=work_id,
                force_structured_abstract=False,
            )
        except Exception:
            pass
    
    # Recompute collaborations
    collaboration = recompute_collaborator_edges(user_id=user_id)
    
    # Trigger analytics recompute
    try:
        from research_os.services.publications_analytics_service import (
            enqueue_publications_analytics_recompute,
        )
        enqueue_publications_analytics_recompute(
            user_id=user_id,
            force=True,
            reason="openalex_imported",
        )
    except Exception:
        pass
    
    # Proactively trigger metrics computation
    try:
        from research_os.services.publication_metrics_service import (
            enqueue_publication_top_metrics_refresh,
        )
        enqueue_publication_top_metrics_refresh(
            user_id=user_id,
            force=True,
            reason="post_import_precompute",
        )
    except Exception:
        pass
    
    return {
        "imported_count": len(upserted_ids),
        "work_ids": upserted_ids,
        "provenance": "openalex",
        "last_synced_at": _utcnow(),
        "core_collaborators": collaboration.get("core_collaborators") or [],
    }

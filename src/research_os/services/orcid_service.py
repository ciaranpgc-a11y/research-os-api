from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import inspect
import os
import re
import secrets
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy import func, select

from research_os.db import OrcidOAuthState, User, Work, create_all_tables, session_scope
from research_os.services.persona_service import (
    recompute_collaborator_edges,
    sync_metrics,
    upsert_work,
)
from research_os.services.security_service import decrypt_secret, encrypt_secret

ORCID_CONNECT_TTL_MINUTES = 20
ORCID_IMPORT_DETAIL_FETCH_MAX_STANDARD = max(
    0,
    int(
        os.getenv(
            "ORCID_IMPORT_DETAIL_FETCH_MAX_STANDARD",
            os.getenv("ORCID_IMPORT_DETAIL_FETCH_MAX", "250"),
        )
    ),
)
ORCID_IMPORT_DETAIL_FETCH_MAX_RICH = max(
    0,
    int(
        os.getenv(
            "ORCID_IMPORT_DETAIL_FETCH_MAX_RICH",
            os.getenv("ORCID_IMPORT_DETAIL_FETCH_MAX", "250"),
        )
    ),
)
ORCID_IMPORT_DETAIL_FETCH_WORKERS = max(
    1, int(os.getenv("ORCID_IMPORT_DETAIL_FETCH_WORKERS", "8"))
)
ORCID_HTTP_TIMEOUT_SECONDS = max(
    5.0, float(os.getenv("ORCID_HTTP_TIMEOUT_SECONDS", "20"))
)
UPSERT_WORK_ACCEPTS_SESSION = "session" in inspect.signature(upsert_work).parameters


class OrcidValidationError(RuntimeError):
    pass


class OrcidNotFoundError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _orcid_client_id() -> str:
    value = os.getenv("ORCID_CLIENT_ID", "").strip()
    if not value:
        raise OrcidValidationError("ORCID_CLIENT_ID is not configured.")
    return value


def _orcid_client_secret() -> str:
    value = os.getenv("ORCID_CLIENT_SECRET", "").strip()
    if not value:
        raise OrcidValidationError("ORCID_CLIENT_SECRET is not configured.")
    return value


def _frontend_base_url() -> str:
    return os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").strip().rstrip("/")


def _orcid_redirect_uri() -> str:
    return os.getenv(
        "ORCID_REDIRECT_URI",
        f"{_frontend_base_url()}/orcid/callback",
    ).strip()


def _orcid_authorize_url() -> str:
    return os.getenv("ORCID_AUTHORIZE_URL", "https://orcid.org/oauth/authorize").strip()


def _orcid_token_url() -> str:
    return os.getenv("ORCID_TOKEN_URL", "https://orcid.org/oauth/token").strip()


def _orcid_api_base() -> str:
    return (
        os.getenv("ORCID_API_BASE_URL", "https://pub.orcid.org/v3.0")
        .strip()
        .rstrip("/")
    )


def _orcid_auto_sync_metrics_enabled() -> bool:
    return os.getenv("ORCID_IMPORT_AUTO_SYNC_METRICS", "1").strip().lower() in {
        "1",
        "true",
        "yes",
    }


ORCID_IMPORT_AUTO_SYNC_METRICS_MAX_WORKS = max(
    0, int(os.getenv("ORCID_IMPORT_AUTO_SYNC_METRICS_MAX_WORKS", "25"))
)


def _orcid_sync_metric_providers() -> list[str]:
    raw = os.getenv("ORCID_IMPORT_SYNC_PROVIDERS", "openalex").strip()
    if not raw:
        return ["openalex"]
    providers: list[str] = []
    seen: set[str] = set()
    for item in raw.split(","):
        value = item.strip().lower()
        if not value:
            continue
        normalized = "semantic_scholar" if value in {"semanticscholar"} else value
        if normalized not in {"openalex", "semantic_scholar", "manual"}:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        providers.append(normalized)
    return providers or ["openalex"]


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise OrcidNotFoundError(f"User '{user_id}' was not found.")
    return user


def _orcid_config_issues() -> list[str]:
    issues: list[str] = []
    if not os.getenv("ORCID_CLIENT_ID", "").strip():
        issues.append("Missing ORCID_CLIENT_ID")
    if not os.getenv("ORCID_CLIENT_SECRET", "").strip():
        issues.append("Missing ORCID_CLIENT_SECRET")
    return issues


def create_orcid_connect_url(*, user_id: str) -> dict[str, str]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        state_token = secrets.token_urlsafe(24)
        state_row = OrcidOAuthState(
            user_id=user_id,
            state_token=state_token,
            expires_at=_utcnow() + timedelta(minutes=ORCID_CONNECT_TTL_MINUTES),
        )
        session.add(state_row)
        session.flush()

    query = urlencode(
        {
            "client_id": _orcid_client_id(),
            "response_type": "code",
            "scope": "/authenticate",
            "redirect_uri": _orcid_redirect_uri(),
            "state": state_token,
        }
    )
    return {
        "url": f"{_orcid_authorize_url()}?{query}",
        "state": state_token,
    }


def get_orcid_status(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    config_issues = _orcid_config_issues()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        linked = bool(user.orcid_id and user.orcid_access_token)
        return {
            "configured": len(config_issues) == 0,
            "linked": linked,
            "orcid_id": user.orcid_id,
            "redirect_uri": _orcid_redirect_uri(),
            "can_import": linked and len(config_issues) == 0,
            "issues": config_issues,
        }


def disconnect_orcid(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        has_alternative_oauth = bool(user.google_sub or user.microsoft_sub)
        has_placeholder_email = (
            str(user.email or "").strip().lower().endswith("@orcid.local")
        )
        if has_placeholder_email and not has_alternative_oauth:
            raise OrcidValidationError(
                "Cannot disconnect ORCID yet. This account currently depends on ORCID sign-in. "
                "First add another sign-in method (set a standard email/password or link Google/Microsoft)."
            )
        user.orcid_id = None
        user.orcid_access_token = None
        user.orcid_refresh_token = None
        user.orcid_token_expires_at = None
        user.orcid_last_synced_at = None
        session.flush()
    return get_orcid_status(user_id=user_id)


def _token_headers() -> dict[str, str]:
    return {"Accept": "application/json"}


def _extract_orcid_id(value: str) -> str:
    clean = re.sub(r"\s+", "", value or "").strip()
    return clean


def _exchange_authorization_code(code: str) -> dict[str, Any]:
    payload = {
        "client_id": _orcid_client_id(),
        "client_secret": _orcid_client_secret(),
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": _orcid_redirect_uri(),
    }
    with httpx.Client(timeout=15.0) as client:
        response = client.post(
            _orcid_token_url(), data=payload, headers=_token_headers()
        )
    if response.status_code >= 400:
        raise OrcidValidationError("ORCID token exchange failed.")
    return response.json()


def _refresh_access_token(refresh_token: str) -> dict[str, Any]:
    payload = {
        "client_id": _orcid_client_id(),
        "client_secret": _orcid_client_secret(),
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }
    with httpx.Client(timeout=15.0) as client:
        response = client.post(
            _orcid_token_url(), data=payload, headers=_token_headers()
        )
    if response.status_code >= 400:
        raise OrcidValidationError("ORCID token refresh failed.")
    return response.json()


def complete_orcid_callback(*, state: str, code: str) -> dict[str, Any]:
    create_all_tables()
    clean_state = (state or "").strip()
    clean_code = (code or "").strip()
    if not clean_state or not clean_code:
        raise OrcidValidationError("Both state and code are required.")

    token_payload = _exchange_authorization_code(clean_code)
    access_token = str(token_payload.get("access_token", "")).strip()
    if not access_token:
        raise OrcidValidationError("ORCID token response did not include access_token.")
    refresh_token = str(token_payload.get("refresh_token", "")).strip() or None
    orcid_id = _extract_orcid_id(
        str(token_payload.get("orcid") or token_payload.get("orcid_id") or "").strip()
    )
    if not orcid_id:
        raise OrcidValidationError("ORCID token response did not include ORCID iD.")

    expires_in = int(token_payload.get("expires_in", 3600) or 3600)
    expires_at = _utcnow() + timedelta(seconds=max(0, expires_in))

    with session_scope() as session:
        state_row = session.scalars(
            select(OrcidOAuthState).where(OrcidOAuthState.state_token == clean_state)
        ).first()
        if state_row is None:
            raise OrcidValidationError("OAuth state is invalid.")
        if state_row.consumed_at is not None:
            raise OrcidValidationError("OAuth state has already been used.")
        state_expires_at = _as_utc(state_row.expires_at)
        if state_expires_at and state_expires_at <= _utcnow():
            raise OrcidValidationError("OAuth state has expired.")

        user = _resolve_user_or_raise(session, state_row.user_id)
        existing_orcid_users = session.scalars(
            select(User).where(User.orcid_id == orcid_id, User.id != user.id)
        ).all()
        for existing_user in existing_orcid_users:
            # Keep ORCID ownership unique to avoid account resolution drift.
            existing_user.orcid_id = None
            existing_user.orcid_access_token = None
            existing_user.orcid_refresh_token = None
            existing_user.orcid_token_expires_at = None
        user.orcid_id = orcid_id
        user.orcid_access_token = encrypt_secret(access_token)
        user.orcid_refresh_token = (
            encrypt_secret(refresh_token) if refresh_token else None
        )
        user.orcid_token_expires_at = expires_at
        state_row.consumed_at = _utcnow()
        session.flush()
        return {
            "user_id": user.id,
            "orcid_id": user.orcid_id,
            "connected": True,
        }


def _orcid_headers(access_token: str | None = None) -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def _ensure_valid_access_token(session, user: User) -> str:
    encrypted = user.orcid_access_token
    if not encrypted:
        raise OrcidValidationError("ORCID access token is not linked for this user.")
    access_token = decrypt_secret(encrypted) or ""
    refresh_token = (
        decrypt_secret(user.orcid_refresh_token) if user.orcid_refresh_token else None
    )
    token_expires_at = _as_utc(user.orcid_token_expires_at)
    if token_expires_at and token_expires_at <= _utcnow() and refresh_token:
        access_token = _refresh_user_access_token(
            session=session,
            user=user,
            refresh_token=refresh_token,
        )
    if not access_token:
        raise OrcidValidationError("Unable to resolve a valid ORCID access token.")
    return access_token


def _refresh_user_access_token(*, session, user: User, refresh_token: str) -> str:
    refreshed = _refresh_access_token(refresh_token)
    access_token = str(refreshed.get("access_token", "")).strip()
    if not access_token:
        raise OrcidValidationError("ORCID token refresh did not return access token.")
    new_refresh = str(refreshed.get("refresh_token", "")).strip() or refresh_token
    expires_in = int(refreshed.get("expires_in", 3600) or 3600)
    user.orcid_access_token = encrypt_secret(access_token)
    user.orcid_refresh_token = encrypt_secret(new_refresh) if new_refresh else None
    user.orcid_token_expires_at = _utcnow() + timedelta(seconds=max(0, expires_in))
    session.flush()
    return access_token


def _extract_external_id(summary: dict[str, Any], target_type: str) -> str | None:
    external_ids = summary.get("external-ids") or {}
    values = external_ids.get("external-id") or []
    for item in values:
        if not isinstance(item, dict):
            continue
        id_type = str(item.get("external-id-type", "")).strip().lower()
        if id_type != target_type.lower():
            continue
        id_value = re.sub(r"\s+", "", str(item.get("external-id-value", "")).strip())
        if id_value:
            return id_value
    return None


def _extract_authors(work_detail: dict[str, Any]) -> list[dict[str, str]]:
    contributors = (work_detail.get("contributors") or {}).get("contributor") or []
    authors: list[dict[str, str]] = []
    for item in contributors:
        if not isinstance(item, dict):
            continue
        credit_name = (item.get("credit-name") or {}).get("value")
        if not credit_name:
            continue
        contributor_orcid = (
            (item.get("contributor-orcid") or {}).get("path") or ""
        ).strip() or None
        authors.append(
            {
                "name": str(credit_name).strip(),
                "orcid_id": contributor_orcid or "",
            }
        )
    return authors


def _extract_work_payload(
    summary: dict[str, Any], detail: dict[str, Any] | None
) -> dict[str, Any]:
    source = detail or summary
    title = (
        ((source.get("title") or {}).get("title") or {}).get("value") or ""
    ).strip()
    year_raw = (
        ((source.get("publication-date") or {}).get("year") or {}).get("value") or ""
    ).strip()
    work_type = str(source.get("type", "")).strip()
    doi = _extract_external_id(source, "doi")
    pmid = _extract_external_id(source, "pmid") or _extract_external_id(
        source, "pubmed-id"
    )
    venue = str((source.get("journal-title") or {}).get("value") or "").strip()
    publisher = str((source.get("publisher") or {}).get("value") or "").strip()
    url = str((source.get("url") or {}).get("value") or "").strip()
    if not url and pmid:
        url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    if not url and doi:
        url = f"https://doi.org/{doi}"
    keywords_raw = (source.get("keywords") or {}).get("keyword") or []
    keywords: list[str] = []
    for item in keywords_raw:
        if not isinstance(item, dict):
            continue
        text = str(item.get("content", "")).strip()
        if text:
            keywords.append(text)
    payload = {
        "title": title,
        "year": int(year_raw) if year_raw.isdigit() else None,
        "doi": doi,
        "work_type": work_type,
        "venue_name": venue,
        "publisher": publisher,
        "abstract": str((source.get("short-description") or "").strip())
        if source.get("short-description")
        else "",
        "keywords": keywords,
        "url": url,
        "authors": _extract_authors(source),
    }
    return payload


def _fetch_orcid_work_detail(
    *,
    orcid_id: str,
    put_code: str,
    access_token: str,
) -> dict[str, Any] | None:
    detail_url = f"{_orcid_api_base()}/{orcid_id}/work/{put_code}"
    try:
        with httpx.Client(timeout=ORCID_HTTP_TIMEOUT_SECONDS) as client:
            detail_response = client.get(
                detail_url, headers=_orcid_headers(access_token)
            )
        if detail_response.status_code >= 400:
            return None
        payload = detail_response.json()
        if not isinstance(payload, dict):
            return None
        return payload
    except Exception:
        return None


def _upsert_imported_orcid_work(
    *,
    user_id: str,
    work: dict[str, Any],
    overwrite_user_metadata: bool,
    session,
) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "user_id": user_id,
        "work": work,
        "provenance": "orcid",
        "overwrite_user_metadata": overwrite_user_metadata,
        "ensure_tables": False,
    }
    if UPSERT_WORK_ACCEPTS_SESSION:
        kwargs["session"] = session
    return upsert_work(**kwargs)


def import_orcid_works(
    *, user_id: str, overwrite_user_metadata: bool = False
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        if not user.orcid_id:
            raise OrcidValidationError("ORCID is not linked for this account.")
        access_token = _ensure_valid_access_token(session, user)
        orcid_id = user.orcid_id
        has_refresh_token = bool(user.orcid_refresh_token)

    works_url = f"{_orcid_api_base()}/{orcid_id}/works"
    try:
        with httpx.Client(timeout=ORCID_HTTP_TIMEOUT_SECONDS) as client:
            works_response = client.get(works_url, headers=_orcid_headers(access_token))
    except httpx.HTTPError as exc:
        raise OrcidValidationError(
            "Failed to fetch ORCID works list due to network timeout."
        ) from exc

    if works_response.status_code == 401 and has_refresh_token:
        with session_scope() as session:
            user = _resolve_user_or_raise(session, user_id)
            refresh_token = (
                decrypt_secret(user.orcid_refresh_token)
                if user.orcid_refresh_token
                else None
            )
            if refresh_token:
                access_token = _refresh_user_access_token(
                    session=session,
                    user=user,
                    refresh_token=refresh_token,
                )
        try:
            with httpx.Client(timeout=ORCID_HTTP_TIMEOUT_SECONDS) as client:
                works_response = client.get(
                    works_url, headers=_orcid_headers(access_token)
                )
        except httpx.HTTPError as exc:
            raise OrcidValidationError(
                "Failed to fetch ORCID works list after token refresh."
            ) from exc

    if works_response.status_code >= 400:
        raise OrcidValidationError(
            f"Failed to fetch ORCID works list (status {works_response.status_code})."
        )

    works_payload = works_response.json()
    groups = works_payload.get("group") or []

    candidates: list[tuple[dict[str, Any], Any]] = []
    seen_put_codes: set[str] = set()
    for group in groups:
        summaries = group.get("work-summary") or []
        for summary in summaries:
            if not isinstance(summary, dict):
                continue
            put_code = summary.get("put-code")
            put_code_key = str(put_code).strip()
            if put_code_key:
                if put_code_key in seen_put_codes:
                    continue
                seen_put_codes.add(put_code_key)
            candidates.append((summary, put_code))

    detail_fetch_cap = (
        ORCID_IMPORT_DETAIL_FETCH_MAX_RICH
        if overwrite_user_metadata
        else ORCID_IMPORT_DETAIL_FETCH_MAX_STANDARD
    )
    fetch_details_limit = min(len(candidates), detail_fetch_cap)
    fetch_details = fetch_details_limit > 0
    detail_payload_by_put_code: dict[str, dict[str, Any]] = {}
    if fetch_details:
        detail_put_codes: list[str] = []
        seen_detail_codes: set[str] = set()
        for index, (_, put_code) in enumerate(candidates):
            if index >= fetch_details_limit:
                break
            put_code_key = str(put_code).strip()
            if not put_code_key or put_code_key in seen_detail_codes:
                continue
            seen_detail_codes.add(put_code_key)
            detail_put_codes.append(put_code_key)
        if detail_put_codes:
            max_workers = min(ORCID_IMPORT_DETAIL_FETCH_WORKERS, len(detail_put_codes))
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {
                    executor.submit(
                        _fetch_orcid_work_detail,
                        orcid_id=orcid_id,
                        put_code=put_code_key,
                        access_token=access_token,
                    ): put_code_key
                    for put_code_key in detail_put_codes
                }
                for future in as_completed(future_map):
                    put_code_key = future_map[future]
                    payload = future.result()
                    if isinstance(payload, dict):
                        detail_payload_by_put_code[put_code_key] = payload

    imported: list[dict[str, Any]] = []
    for index, (summary, put_code) in enumerate(candidates):
        detail_payload = None
        if fetch_details and put_code is not None and index < fetch_details_limit:
            put_code_key = str(put_code).strip()
            if put_code_key:
                detail_payload = detail_payload_by_put_code.get(put_code_key)
        work_payload = _extract_work_payload(summary, detail_payload)
        if not work_payload.get("url") and put_code is not None:
            work_payload["url"] = f"https://orcid.org/{orcid_id}/work/{put_code}"
        if not work_payload["title"]:
            fallback_ref = str(work_payload.get("doi") or put_code or "").strip()
            if not fallback_ref:
                continue
            work_payload["title"] = f"ORCID work {fallback_ref}"
        imported.append(work_payload)

    upserted_ids: list[str] = []
    seen_upserted_ids: set[str] = set()
    new_work_ids: list[str] = []
    seen_new_work_ids: set[str] = set()
    new_works_count = 0
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
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
            if (
                work_id not in existing_work_ids_before
                and work_id not in seen_new_work_ids
            ):
                seen_new_work_ids.add(work_id)
                new_work_ids.append(work_id)
        current_works_count = (
            session.scalar(select(func.count(Work.id)).where(Work.user_id == user_id))
            or 0
        )
        new_works_count = max(0, int(current_works_count) - int(baseline_works_count))
        user.orcid_last_synced_at = _utcnow()
        session.flush()
    if _orcid_auto_sync_metrics_enabled() and new_work_ids:
        providers = _orcid_sync_metric_providers()
        target_ids = (
            new_work_ids[:ORCID_IMPORT_AUTO_SYNC_METRICS_MAX_WORKS]
            if ORCID_IMPORT_AUTO_SYNC_METRICS_MAX_WORKS > 0
            else new_work_ids
        )
        try:
            sync_metrics(
                user_id=user_id,
                providers=providers,
                work_ids=target_ids,
            )
        except Exception:
            # Keep ORCID import resilient even if external citation providers are unavailable.
            pass
    collaboration = recompute_collaborator_edges(user_id=user_id)
    return {
        "imported_count": new_works_count,
        "work_ids": upserted_ids,
        "provenance": "orcid",
        "last_synced_at": _utcnow(),
        "core_collaborators": collaboration["core_collaborators"],
    }

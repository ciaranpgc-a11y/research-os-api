from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
import re
import secrets
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy import select

from research_os.db import OrcidOAuthState, User, create_all_tables, session_scope
from research_os.services.persona_service import recompute_collaborator_edges, upsert_work
from research_os.services.security_service import decrypt_secret, encrypt_secret

ORCID_CONNECT_TTL_MINUTES = 20


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


def _orcid_redirect_uri() -> str:
    return os.getenv(
        "ORCID_REDIRECT_URI",
        "http://localhost:8000/v1/orcid/callback",
    ).strip()


def _orcid_authorize_url() -> str:
    return os.getenv("ORCID_AUTHORIZE_URL", "https://orcid.org/oauth/authorize").strip()


def _orcid_token_url() -> str:
    return os.getenv("ORCID_TOKEN_URL", "https://orcid.org/oauth/token").strip()


def _orcid_api_base() -> str:
    return os.getenv("ORCID_API_BASE_URL", "https://pub.orcid.org/v3.0").strip().rstrip("/")


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise OrcidNotFoundError(f"User '{user_id}' was not found.")
    return user


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
        response = client.post(_orcid_token_url(), data=payload, headers=_token_headers())
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
        response = client.post(_orcid_token_url(), data=payload, headers=_token_headers())
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
        user.orcid_id = orcid_id
        user.orcid_access_token = encrypt_secret(access_token)
        user.orcid_refresh_token = encrypt_secret(refresh_token) if refresh_token else None
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
    refresh_token = decrypt_secret(user.orcid_refresh_token) if user.orcid_refresh_token else None
    token_expires_at = _as_utc(user.orcid_token_expires_at)
    if token_expires_at and token_expires_at <= _utcnow() and refresh_token:
        refreshed = _refresh_access_token(refresh_token)
        access_token = str(refreshed.get("access_token", "")).strip()
        new_refresh = str(refreshed.get("refresh_token", "")).strip() or refresh_token
        expires_in = int(refreshed.get("expires_in", 3600) or 3600)
        user.orcid_access_token = encrypt_secret(access_token)
        user.orcid_refresh_token = encrypt_secret(new_refresh) if new_refresh else None
        user.orcid_token_expires_at = _utcnow() + timedelta(seconds=max(0, expires_in))
    if not access_token:
        raise OrcidValidationError("Unable to resolve a valid ORCID access token.")
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
    contributors = ((work_detail.get("contributors") or {}).get("contributor") or [])
    authors: list[dict[str, str]] = []
    for item in contributors:
        if not isinstance(item, dict):
            continue
        credit_name = (item.get("credit-name") or {}).get("value")
        if not credit_name:
            continue
        contributor_orcid = (
            ((item.get("contributor-orcid") or {}).get("path") or "").strip() or None
        )
        authors.append(
            {
                "name": str(credit_name).strip(),
                "orcid_id": contributor_orcid or "",
            }
        )
    return authors


def _extract_work_payload(summary: dict[str, Any], detail: dict[str, Any] | None) -> dict[str, Any]:
    source = detail or summary
    title = (((source.get("title") or {}).get("title") or {}).get("value") or "").strip()
    year_raw = (((source.get("publication-date") or {}).get("year") or {}).get("value") or "").strip()
    work_type = str(source.get("type", "")).strip()
    doi = _extract_external_id(source, "doi")
    venue = str((source.get("journal-title") or {}).get("value") or "").strip()
    url = str((source.get("url") or {}).get("value") or "").strip()
    payload = {
        "title": title,
        "year": int(year_raw) if year_raw.isdigit() else None,
        "doi": doi,
        "work_type": work_type,
        "venue_name": venue,
        "publisher": "",
        "abstract": str((source.get("short-description") or "").strip()) if source.get("short-description") else "",
        "keywords": [],
        "url": url,
        "authors": _extract_authors(source),
    }
    return payload


def import_orcid_works(*, user_id: str, overwrite_user_metadata: bool = False) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        if not user.orcid_id:
            raise OrcidValidationError("ORCID is not linked for this account.")
        access_token = _ensure_valid_access_token(session, user)
        orcid_id = user.orcid_id

    works_url = f"{_orcid_api_base()}/{orcid_id}/works"
    with httpx.Client(timeout=20.0) as client:
        works_response = client.get(works_url, headers=_orcid_headers(access_token))
        if works_response.status_code >= 400:
            raise OrcidValidationError("Failed to fetch ORCID works list.")
        works_payload = works_response.json()
        groups = works_payload.get("group") or []

        imported: list[dict[str, Any]] = []
        for group in groups:
            summaries = group.get("work-summary") or []
            if not summaries:
                continue
            summary = summaries[0]
            put_code = summary.get("put-code")
            detail_payload = None
            if put_code is not None:
                detail_url = f"{_orcid_api_base()}/{orcid_id}/work/{put_code}"
                detail_response = client.get(detail_url, headers=_orcid_headers(access_token))
                if detail_response.status_code < 400:
                    detail_payload = detail_response.json()
            work_payload = _extract_work_payload(summary, detail_payload)
            if not work_payload["title"]:
                continue
            imported.append(work_payload)

    upserted_ids: list[str] = []
    for work in imported:
        record = upsert_work(
            user_id=user_id,
            work=work,
            provenance="orcid",
            overwrite_user_metadata=overwrite_user_metadata,
        )
        upserted_ids.append(str(record["id"]))

    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        user.orcid_last_synced_at = _utcnow()
        session.flush()
    collaboration = recompute_collaborator_edges(user_id=user_id)
    return {
        "imported_count": len(upserted_ids),
        "work_ids": upserted_ids,
        "provenance": "orcid",
        "last_synced_at": _utcnow(),
        "core_collaborators": collaboration["core_collaborators"],
    }

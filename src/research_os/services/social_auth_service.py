from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
import secrets
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from research_os.db import (
    AuthOAuthState,
    AuthSession,
    User,
    create_all_tables,
    session_scope,
)
from research_os.services.auth_service import AuthNotFoundError, AuthValidationError
from research_os.services.security_service import (
    encrypt_secret,
    generate_session_token,
    hash_password,
    hash_session_token,
)

OAUTH_STATE_TTL_MINUTES = max(5, int(os.getenv("AUTH_OAUTH_STATE_TTL_MINUTES", "20")))
SESSION_DAYS = max(1, int(os.getenv("AUTH_SESSION_DAYS", "30")))
MAX_ACTIVE_SESSIONS = max(1, int(os.getenv("AUTH_MAX_ACTIVE_SESSIONS", "5")))

SUPPORTED_OAUTH_PROVIDERS = {"orcid", "google", "microsoft"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _serialize_user(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_active": bool(user.is_active),
        "role": user.role,
        "orcid_id": user.orcid_id,
        "impact_last_computed_at": user.impact_last_computed_at,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


def _normalize_provider(provider: str) -> str:
    clean = (provider or "").strip().lower()
    if clean not in SUPPORTED_OAUTH_PROVIDERS:
        raise AuthValidationError("Unsupported OAuth provider.")
    return clean


def _env_required(key: str, error_detail: str) -> str:
    value = os.getenv(key, "").strip()
    if not value:
        raise AuthValidationError(error_detail)
    return value


def _provider_config(provider: str) -> dict[str, str]:
    if provider == "orcid":
        return {
            "client_id": _env_required(
                "ORCID_CLIENT_ID",
                "ORCID is not configured (missing ORCID_CLIENT_ID).",
            ),
            "client_secret": _env_required(
                "ORCID_CLIENT_SECRET",
                "ORCID is not configured (missing ORCID_CLIENT_SECRET).",
            ),
            "authorize_url": os.getenv(
                "ORCID_AUTHORIZE_URL", "https://orcid.org/oauth/authorize"
            ).strip(),
            "token_url": os.getenv(
                "ORCID_TOKEN_URL", "https://orcid.org/oauth/token"
            ).strip(),
            "redirect_uri": os.getenv(
                "ORCID_SIGNIN_REDIRECT_URI",
                "http://localhost:5173/auth/callback?provider=orcid",
            ).strip(),
            "scope": "/authenticate",
        }

    if provider == "google":
        return {
            "client_id": _env_required(
                "GOOGLE_CLIENT_ID",
                "Google sign-in is not configured (missing GOOGLE_CLIENT_ID).",
            ),
            "client_secret": _env_required(
                "GOOGLE_CLIENT_SECRET",
                "Google sign-in is not configured (missing GOOGLE_CLIENT_SECRET).",
            ),
            "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_url": "https://oauth2.googleapis.com/token",
            "redirect_uri": os.getenv(
                "GOOGLE_REDIRECT_URI",
                "http://localhost:5173/auth/callback?provider=google",
            ).strip(),
            "scope": "openid email profile",
            "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        }

    tenant = os.getenv("MICROSOFT_TENANT_ID", "common").strip() or "common"
    return {
        "client_id": _env_required(
            "MICROSOFT_CLIENT_ID",
            "Microsoft sign-in is not configured (missing MICROSOFT_CLIENT_ID).",
        ),
        "client_secret": _env_required(
            "MICROSOFT_CLIENT_SECRET",
            "Microsoft sign-in is not configured (missing MICROSOFT_CLIENT_SECRET).",
        ),
        "authorize_url": f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
        "token_url": f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        "redirect_uri": os.getenv(
            "MICROSOFT_REDIRECT_URI",
            "http://localhost:5173/auth/callback?provider=microsoft",
        ).strip(),
        "scope": "openid profile email User.Read",
        "userinfo_url": "https://graph.microsoft.com/oidc/userinfo",
    }


def _build_authorize_url(provider: str, config: dict[str, str], state: str) -> str:
    params = {
        "client_id": config["client_id"],
        "response_type": "code",
        "redirect_uri": config["redirect_uri"],
        "state": state,
    }
    if provider == "orcid":
        params["scope"] = config["scope"]
    elif provider == "google":
        params["scope"] = config["scope"]
        params["access_type"] = "offline"
        params["prompt"] = "consent"
    else:
        params["scope"] = config["scope"]
        params["response_mode"] = "query"
    return f"{config['authorize_url']}?{urlencode(params)}"


def create_oauth_connect_url(*, provider: str) -> dict[str, str]:
    clean_provider = _normalize_provider(provider)
    config = _provider_config(clean_provider)
    create_all_tables()

    state_token = secrets.token_urlsafe(24)
    with session_scope() as session:
        state_row = AuthOAuthState(
            user_id=None,
            provider=clean_provider,
            state_token=state_token,
            expires_at=_utcnow() + timedelta(minutes=OAUTH_STATE_TTL_MINUTES),
        )
        session.add(state_row)
        session.flush()

    return {
        "provider": clean_provider,
        "state": state_token,
        "url": _build_authorize_url(clean_provider, config, state_token),
    }


def _exchange_oauth_code(
    *, provider: str, config: dict[str, str], code: str
) -> dict[str, Any]:
    payload = {
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": config["redirect_uri"],
    }
    headers = {"Accept": "application/json"}
    with httpx.Client(timeout=20.0) as client:
        response = client.post(config["token_url"], data=payload, headers=headers)
    if response.status_code >= 400:
        raise AuthValidationError(
            f"{provider.capitalize()} token exchange failed."
        )
    return response.json()


def _fetch_userinfo(
    *, provider: str, config: dict[str, str], token_payload: dict[str, Any]
) -> dict[str, str]:
    access_token = str(token_payload.get("access_token", "")).strip()
    if not access_token:
        raise AuthValidationError("OAuth token response did not include access_token.")

    if provider == "orcid":
        orcid_id = str(
            token_payload.get("orcid") or token_payload.get("orcid_id") or ""
        ).strip()
        if not orcid_id:
            raise AuthValidationError("ORCID token response did not include ORCID iD.")
        return {
            "provider_subject": orcid_id,
            "email": f"orcid-{orcid_id.replace('-', '')}@orcid.local",
            "name": f"ORCID {orcid_id}",
            "orcid_id": orcid_id,
        }

    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    with httpx.Client(timeout=20.0) as client:
        response = client.get(config["userinfo_url"], headers=headers)
    if response.status_code >= 400:
        raise AuthValidationError(
            f"Failed to fetch {provider.capitalize()} user profile."
        )
    payload = response.json()

    if provider == "google":
        subject = str(payload.get("sub", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        name = str(payload.get("name", "")).strip() or "Google User"
        if not subject:
            raise AuthValidationError("Google user profile is missing subject id.")
        return {
            "provider_subject": subject,
            "email": email or f"google-{subject}@oauth.local",
            "name": name,
            "orcid_id": "",
        }

    subject = str(payload.get("sub") or payload.get("oid") or "").strip()
    email = (
        str(payload.get("email", "")).strip().lower()
        or str(payload.get("preferred_username", "")).strip().lower()
    )
    name = str(payload.get("name", "")).strip() or "Microsoft User"
    if not subject:
        raise AuthValidationError("Microsoft user profile is missing subject id.")
    return {
        "provider_subject": subject,
        "email": email or f"microsoft-{subject}@oauth.local",
        "name": name,
        "orcid_id": "",
    }


def _prune_sessions(*, session, user_id: str) -> None:
    now = _utcnow()
    sessions = session.scalars(
        select(AuthSession).where(
            AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)
        )
    ).all()
    active: list[AuthSession] = []
    for row in sessions:
        expires_at = _as_utc(row.expires_at)
        if expires_at and expires_at <= now:
            row.revoked_at = now
            continue
        active.append(row)
    if len(active) < MAX_ACTIVE_SESSIONS:
        return
    active.sort(key=lambda row: _as_utc(row.created_at) or now)
    surplus = len(active) - (MAX_ACTIVE_SESSIONS - 1)
    for row in active[:max(0, surplus)]:
        row.revoked_at = now


def _create_session(*, session, user: User) -> tuple[str, AuthSession]:
    _prune_sessions(session=session, user_id=user.id)
    session_token = generate_session_token()
    auth_session = AuthSession(
        user_id=user.id,
        token_hash=hash_session_token(session_token),
        expires_at=_utcnow() + timedelta(days=SESSION_DAYS),
        revoked_at=None,
    )
    session.add(auth_session)
    session.flush()
    return session_token, auth_session


def _random_password_seed() -> str:
    return f"Aawe{secrets.token_hex(12)}9"


def _resolve_user_for_oauth(
    *,
    session,
    provider: str,
    identity: dict[str, str],
    token_payload: dict[str, Any],
) -> tuple[User, bool]:
    provider_subject = identity["provider_subject"]
    email = identity["email"]
    name = identity["name"] or "Research User"
    user: User | None = None
    is_new_user = False

    if provider == "orcid":
        orcid_id = identity["orcid_id"]
        user = session.scalars(select(User).where(User.orcid_id == orcid_id)).first()
        if user is None:
            user = session.scalars(select(User).where(User.email == email)).first()
        if user is None:
            user = User(
                email=email,
                password_hash=hash_password(_random_password_seed()),
                name=name,
                is_active=True,
                role="user",
            )
            session.add(user)
            is_new_user = True
        user.orcid_id = orcid_id
        access_token = str(token_payload.get("access_token", "")).strip()
        refresh_token = str(token_payload.get("refresh_token", "")).strip() or None
        expires_in = int(token_payload.get("expires_in", 3600) or 3600)
        if access_token:
            user.orcid_access_token = encrypt_secret(access_token)
            user.orcid_refresh_token = (
                encrypt_secret(refresh_token) if refresh_token else None
            )
            user.orcid_token_expires_at = _utcnow() + timedelta(
                seconds=max(0, expires_in)
            )
        return user, is_new_user

    if provider == "google":
        user = session.scalars(select(User).where(User.google_sub == provider_subject)).first()
    elif provider == "microsoft":
        user = session.scalars(
            select(User).where(User.microsoft_sub == provider_subject)
        ).first()
    if user is None:
        user = session.scalars(select(User).where(User.email == email)).first()

    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(_random_password_seed()),
            name=name,
            is_active=True,
            role="user",
        )
        session.add(user)
        is_new_user = True

    if provider == "google":
        user.google_sub = provider_subject
    else:
        user.microsoft_sub = provider_subject
    if not user.name:
        user.name = name
    return user, is_new_user


def complete_oauth_callback(
    *,
    provider: str,
    state: str,
    code: str,
) -> dict[str, object]:
    clean_provider = _normalize_provider(provider)
    clean_state = (state or "").strip()
    clean_code = (code or "").strip()
    if not clean_state or not clean_code:
        raise AuthValidationError("Provider, state, and code are required.")

    config = _provider_config(clean_provider)
    token_payload = _exchange_oauth_code(
        provider=clean_provider, config=config, code=clean_code
    )
    identity = _fetch_userinfo(
        provider=clean_provider,
        config=config,
        token_payload=token_payload,
    )

    create_all_tables()
    with session_scope() as session:
        state_row = session.scalars(
            select(AuthOAuthState).where(
                AuthOAuthState.provider == clean_provider,
                AuthOAuthState.state_token == clean_state,
            )
        ).first()
        if state_row is None:
            raise AuthValidationError("OAuth state is invalid.")
        if state_row.consumed_at is not None:
            raise AuthValidationError("OAuth state has already been used.")
        expires_at = _as_utc(state_row.expires_at)
        if expires_at and expires_at <= _utcnow():
            raise AuthValidationError("OAuth state has expired.")

        user, is_new_user = _resolve_user_for_oauth(
            session=session,
            provider=clean_provider,
            identity=identity,
            token_payload=token_payload,
        )
        try:
            session.flush()
        except IntegrityError as exc:
            raise AuthValidationError("OAuth sign-in could not be completed.") from exc

        if user is None:
            raise AuthNotFoundError("User was not resolved for OAuth sign-in.")
        state_row.user_id = user.id
        state_row.consumed_at = _utcnow()
        session_token, auth_session = _create_session(session=session, user=user)
        session.refresh(user)

        return {
            "provider": clean_provider,
            "is_new_user": is_new_user,
            "user": _serialize_user(user),
            "session_token": session_token,
            "session_expires_at": auth_session.expires_at,
        }

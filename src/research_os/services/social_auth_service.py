from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import os
import secrets
import time
import threading
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from research_os.db import (
    AuthOAuthState,
    AuthSession,
    MetricsSnapshot,
    User,
    Work,
    create_all_tables,
    session_scope,
)
from research_os.services.auth_service import AuthNotFoundError, AuthValidationError
from research_os.services.api_telemetry_service import record_api_usage_event
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
LOCAL_REDIRECT_HOSTS = {"localhost", "127.0.0.1"}
logger = logging.getLogger(__name__)
_SIGNIN_RECONCILE_LOCK = threading.Lock()
_SIGNIN_RECONCILE_INFLIGHT: set[str] = set()
_SIGNIN_RECONCILE_LAST_RUN_MONOTONIC: dict[str, float] = {}


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
        "account_key": user.account_key,
        "email": user.email,
        "name": user.name,
        "is_active": bool(user.is_active),
        "role": user.role,
        "orcid_id": user.orcid_id,
        "openalex_author_id": user.openalex_author_id,
        "openalex_integration_approved": bool(user.openalex_integration_approved),
        "openalex_auto_update_enabled": bool(user.openalex_auto_update_enabled),
        "impact_last_computed_at": user.impact_last_computed_at,
        "email_verified_at": user.email_verified_at,
        "last_sign_in_at": user.last_sign_in_at,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


def _signin_reconcile_async_enabled() -> bool:
    return str(os.getenv("AUTH_SIGNIN_RECONCILE_ASYNC", "1")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _signin_reconcile_min_interval_seconds() -> int:
    raw = str(os.getenv("AUTH_SIGNIN_RECONCILE_MIN_INTERVAL_SECONDS", "900")).strip()
    try:
        parsed = int(raw)
    except Exception:
        parsed = 900
    return max(0, min(24 * 60 * 60, parsed))


def _reconcile_data_library_sync(
    *, user_id: str, account_key_hint: str | None = None
) -> None:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return
    try:
        from research_os.services.data_planner_service import reconcile_library_for_user

        reconcile_library_for_user(
            user_id=clean_user_id,
            account_key_hint=account_key_hint,
        )
    except Exception:
        logger.warning(
            "signin_data_library_reconcile_failed",
            extra={"user_id": clean_user_id},
        )
        return


def _reconcile_data_library_after_sign_in(
    *, user_id: str, account_key_hint: str | None = None
) -> None:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return
    now_monotonic = time.monotonic()
    min_interval_seconds = _signin_reconcile_min_interval_seconds()

    with _SIGNIN_RECONCILE_LOCK:
        if clean_user_id in _SIGNIN_RECONCILE_INFLIGHT:
            return
        last_run = _SIGNIN_RECONCILE_LAST_RUN_MONOTONIC.get(clean_user_id)
        if (
            last_run is not None
            and min_interval_seconds > 0
            and (now_monotonic - last_run) < min_interval_seconds
        ):
            return
        _SIGNIN_RECONCILE_INFLIGHT.add(clean_user_id)
        _SIGNIN_RECONCILE_LAST_RUN_MONOTONIC[clean_user_id] = now_monotonic

    def _runner() -> None:
        try:
            _reconcile_data_library_sync(
                user_id=clean_user_id,
                account_key_hint=account_key_hint,
            )
        finally:
            with _SIGNIN_RECONCILE_LOCK:
                _SIGNIN_RECONCILE_INFLIGHT.discard(clean_user_id)
                _SIGNIN_RECONCILE_LAST_RUN_MONOTONIC[clean_user_id] = (
                    time.monotonic()
                )

    if _signin_reconcile_async_enabled():
        threading.Thread(
            target=_runner,
            name=f"signin-reconcile-{clean_user_id[:8]}",
            daemon=True,
        ).start()
        return
    _runner()


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


def _origin_base(value: str | None) -> str:
    clean = str(value or "").strip()
    if not clean:
        return ""
    try:
        parsed = urlparse(clean)
    except Exception:
        return ""
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _is_local_origin(value: str | None) -> bool:
    base = _origin_base(value)
    if not base:
        return False
    try:
        parsed = urlparse(base)
    except Exception:
        return False
    host = (parsed.hostname or "").strip().lower()
    return host in LOCAL_REDIRECT_HOSTS


def _orcid_signin_redirect_uri(frontend_origin: str | None = None) -> str:
    if _is_local_origin(frontend_origin):
        configured_dev = os.getenv("ORCID_SIGNIN_REDIRECT_URI_DEV", "").strip()
        if configured_dev:
            return configured_dev
        local_origin = _origin_base(frontend_origin)
        if local_origin:
            return f"{local_origin}/auth/callback?provider=orcid"
    return os.getenv(
        "ORCID_SIGNIN_REDIRECT_URI",
        "http://localhost:5173/auth/callback?provider=orcid",
    ).strip()


def _provider_config(
    provider: str,
    *,
    frontend_origin: str | None = None,
) -> dict[str, str]:
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
            "redirect_uri": _orcid_signin_redirect_uri(frontend_origin),
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


def create_oauth_connect_url(
    *,
    provider: str,
    frontend_origin: str | None = None,
) -> dict[str, str]:
    clean_provider = _normalize_provider(provider)
    config = _provider_config(clean_provider, frontend_origin=frontend_origin)
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


def _load_oauth_state(*, session, provider: str, state: str) -> AuthOAuthState:
    state_row = session.scalars(
        select(AuthOAuthState).where(
            AuthOAuthState.provider == provider,
            AuthOAuthState.state_token == state,
        )
    ).first()
    if state_row is None:
        raise AuthValidationError("OAuth state is invalid.")
    expires_at = _as_utc(state_row.expires_at)
    if expires_at and expires_at <= _utcnow():
        raise AuthValidationError("OAuth state has expired.")
    return state_row


def _claim_oauth_state(*, provider: str, state: str) -> str | None:
    create_all_tables()
    with session_scope() as session:
        state_row = _load_oauth_state(
            session=session,
            provider=provider,
            state=state,
        )
        if state_row.consumed_at is not None:
            # Allow idempotent callback completion when a prior callback
            # already finished and attached a user to this state.
            if state_row.user_id:
                return str(state_row.user_id)
            # A prior attempt consumed this state but did not complete binding
            # (for example token exchange/network failure). Allow safe retry.
            state_row.consumed_at = _utcnow()
            session.flush()
            return None
        # Claim callback state before token exchange so replayed callbacks
        # do not burn one-time provider auth codes.
        state_row.consumed_at = _utcnow()
        session.flush()
    return None


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
        started = time.perf_counter()
        response = client.post(config["token_url"], data=payload, headers=headers)
    record_api_usage_event(
        provider=provider,
        operation="oauth_token_exchange",
        endpoint=str(config.get("token_url") or ""),
        success=response.status_code < 400,
        status_code=response.status_code,
        duration_ms=int((time.perf_counter() - started) * 1000),
        error_code=(
            None if response.status_code < 400 else f"http_{response.status_code}"
        ),
    )
    if response.status_code >= 400:
        provider_label = "ORCID" if provider == "orcid" else provider.capitalize()
        error_code = ""
        try:
            raw_payload = response.json()
        except Exception:
            raw_payload = None
        if isinstance(raw_payload, dict):
            error_code = str(
                raw_payload.get("error")
                or raw_payload.get("error_code")
                or raw_payload.get("error_description")
                or ""
            ).strip()
        if error_code:
            raise AuthValidationError(
                f"{provider_label} token exchange failed ({error_code})."
            )
        raise AuthValidationError(
            f"{provider_label} token exchange failed (status {response.status_code})."
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
        started = time.perf_counter()
        response = client.get(config["userinfo_url"], headers=headers)
    record_api_usage_event(
        provider=provider,
        operation="oauth_userinfo",
        endpoint=str(config.get("userinfo_url") or ""),
        success=response.status_code < 400,
        status_code=response.status_code,
        duration_ms=int((time.perf_counter() - started) * 1000),
        error_code=(
            None if response.status_code < 400 else f"http_{response.status_code}"
        ),
    )
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
    for row in active[: max(0, surplus)]:
        row.revoked_at = now


def _create_session(*, session, user: User) -> tuple[str, AuthSession]:
    _prune_sessions(session=session, user_id=user.id)
    user.last_sign_in_at = _utcnow()
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
        users_with_orcid = session.scalars(
            select(User).where(User.orcid_id == orcid_id)
        ).all()
        user = None
        if users_with_orcid:
            if len(users_with_orcid) == 1:
                user = users_with_orcid[0]
            else:
                # Deterministically resolve duplicate ORCID mappings by choosing the
                # account with the most works, then most recent sign-in/update.
                candidate_ids = [candidate.id for candidate in users_with_orcid]
                work_counts = {
                    str(user_id): int(count or 0)
                    for user_id, count in session.execute(
                        select(Work.user_id, func.count(Work.id))
                        .where(Work.user_id.in_(candidate_ids))
                        .group_by(Work.user_id)
                    ).all()
                }
                citation_totals = {
                    str(user_id): int(total or 0)
                    for user_id, total in session.execute(
                        select(Work.user_id, func.sum(MetricsSnapshot.citations_count))
                        .select_from(MetricsSnapshot)
                        .join(Work, MetricsSnapshot.work_id == Work.id)
                        .where(Work.user_id.in_(candidate_ids))
                        .group_by(Work.user_id)
                    ).all()
                }

                def _candidate_rank(
                    candidate: User,
                ) -> tuple[int, int, datetime, datetime]:
                    works_count = int(work_counts.get(candidate.id, 0))
                    citations_total = int(citation_totals.get(candidate.id, 0))
                    last_sign_in = _as_utc(candidate.last_sign_in_at) or datetime(
                        1970, 1, 1, tzinfo=timezone.utc
                    )
                    updated = _as_utc(candidate.updated_at) or datetime(
                        1970, 1, 1, tzinfo=timezone.utc
                    )
                    return (works_count, citations_total, last_sign_in, updated)

                user = max(users_with_orcid, key=_candidate_rank)
                for duplicate in users_with_orcid:
                    if duplicate.id == user.id:
                        continue
                    duplicate.orcid_id = None
                    duplicate.orcid_access_token = None
                    duplicate.orcid_refresh_token = None
                    duplicate.orcid_token_expires_at = None
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
        if user.email_verified_at is None:
            user.email_verified_at = _utcnow()
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
        user = session.scalars(
            select(User).where(User.google_sub == provider_subject)
        ).first()
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
    if user.email_verified_at is None:
        user.email_verified_at = _utcnow()
    if not user.name:
        user.name = name
    return user, is_new_user


def get_oauth_provider_statuses() -> dict[str, object]:
    providers: list[dict[str, object]] = []
    for provider in sorted(SUPPORTED_OAUTH_PROVIDERS):
        try:
            _provider_config(provider)
            providers.append(
                {
                    "provider": provider,
                    "configured": True,
                    "reason": "",
                }
            )
        except AuthValidationError as exc:
            providers.append(
                {
                    "provider": provider,
                    "configured": False,
                    "reason": str(exc),
                }
            )
    return {
        "providers": providers,
    }


def complete_oauth_callback(
    *,
    provider: str,
    state: str,
    code: str,
    frontend_origin: str | None = None,
) -> dict[str, object]:
    clean_provider = _normalize_provider(provider)
    clean_state = (state or "").strip()
    clean_code = (code or "").strip().replace(" ", "+")
    if not clean_state or not clean_code:
        raise AuthValidationError("Provider, state, and code are required.")

    config = _provider_config(clean_provider, frontend_origin=frontend_origin)
    prior_user_id = _claim_oauth_state(provider=clean_provider, state=clean_state)
    if prior_user_id:
        response_payload: dict[str, object] = {}
        signed_in_user_id = ""
        signed_in_account_key = ""
        with session_scope() as session:
            user = session.get(User, prior_user_id)
            if user is None or not user.is_active:
                raise AuthNotFoundError("User was not resolved for OAuth sign-in.")
            session_token, auth_session = _create_session(session=session, user=user)
            session.refresh(user)
            response_payload = {
                "provider": clean_provider,
                "is_new_user": False,
                "user": _serialize_user(user),
                "session_token": session_token,
                "session_expires_at": auth_session.expires_at,
            }
            signed_in_user_id = str(user.id)
            signed_in_account_key = str(user.account_key or "").strip()

        if signed_in_user_id:
            _reconcile_data_library_after_sign_in(
                user_id=signed_in_user_id,
                account_key_hint=signed_in_account_key or None,
            )
            # Metrics refresh removed from sign-in - wasteful when no data changed
            # Metrics auto-compute after publication import and have 7-day TTL
        return response_payload

    token_payload = _exchange_oauth_code(
        provider=clean_provider, config=config, code=clean_code
    )
    identity = _fetch_userinfo(
        provider=clean_provider,
        config=config,
        token_payload=token_payload,
    )

    response_payload: dict[str, object] = {}
    signed_in_user_id = ""
    signed_in_account_key = ""
    with session_scope() as session:
        state_row = _load_oauth_state(
            session=session,
            provider=clean_provider,
            state=clean_state,
        )
        if state_row.user_id:
            user = session.get(User, state_row.user_id)
            if user is None or not user.is_active:
                raise AuthNotFoundError("User was not resolved for OAuth sign-in.")
            session_token, auth_session = _create_session(session=session, user=user)
            session.refresh(user)
            response_payload = {
                "provider": clean_provider,
                "is_new_user": False,
                "user": _serialize_user(user),
                "session_token": session_token,
                "session_expires_at": auth_session.expires_at,
            }
            signed_in_user_id = str(user.id)
            signed_in_account_key = str(user.account_key or "").strip()
            return response_payload

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
        session_token, auth_session = _create_session(session=session, user=user)
        session.refresh(user)

        response_payload = {
            "provider": clean_provider,
            "is_new_user": is_new_user,
            "user": _serialize_user(user),
            "session_token": session_token,
            "session_expires_at": auth_session.expires_at,
        }
        signed_in_user_id = str(user.id)
        signed_in_account_key = str(user.account_key or "").strip()

    if signed_in_user_id:
        _reconcile_data_library_after_sign_in(
            user_id=signed_in_user_id,
            account_key_hint=signed_in_account_key or None,
        )
        # Metrics refresh removed from sign-in - wasteful when no data changed
        # Metrics auto-compute after publication import and have 7-day TTL

    return response_payload

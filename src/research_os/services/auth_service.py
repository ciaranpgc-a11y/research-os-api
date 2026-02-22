from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from research_os.db import AuthSession, User, create_all_tables, session_scope
from research_os.services.security_service import (
    SecurityValidationError,
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)

SESSION_DAYS = max(1, int(os.getenv("AUTH_SESSION_DAYS", "30")))
MAX_ACTIVE_SESSIONS = max(1, int(os.getenv("AUTH_MAX_ACTIVE_SESSIONS", "5")))
_DUMMY_PASSWORD_HASH = hash_password("AaweDummyPassword123")


class AuthValidationError(RuntimeError):
    pass


class AuthNotFoundError(RuntimeError):
    pass


class AuthConflictError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_email(value: str) -> str:
    email = (value or "").strip().lower()
    if len(email) < 6 or len(email) > 320:
        raise AuthValidationError("A valid email address is required.")
    if "@" not in email or "." not in email.split("@", 1)[-1]:
        raise AuthValidationError("A valid email address is required.")
    return email


def _normalize_name(value: str) -> str:
    clean_name = (value or "").strip()
    if len(clean_name) < 2:
        raise AuthValidationError("Name must be at least 2 characters.")
    if len(clean_name) > 120:
        raise AuthValidationError("Name must be 120 characters or fewer.")
    return clean_name


def _normalize_password_input(value: str) -> str:
    clean_password = (value or "").strip()
    if not clean_password:
        raise AuthValidationError("Password is required.")
    if len(clean_password) > 256:
        raise AuthValidationError("Password is too long.")
    return clean_password


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


def _session_expiry() -> datetime:
    return _utcnow() + timedelta(days=SESSION_DAYS)


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
    plain_token = generate_session_token()
    token_hash = hash_session_token(plain_token)
    auth_session = AuthSession(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=_session_expiry(),
        revoked_at=None,
    )
    session.add(auth_session)
    session.flush()
    return plain_token, auth_session


def register_user(*, email: str, password: str, name: str) -> dict[str, object]:
    create_all_tables()
    normalized_email = _normalize_email(email)
    clean_name = _normalize_name(name)
    normalized_password = _normalize_password_input(password)
    try:
        password_hash_value = hash_password(normalized_password)
    except SecurityValidationError as exc:
        raise AuthValidationError(str(exc)) from exc

    with session_scope() as session:
        user = User(
            email=normalized_email,
            password_hash=password_hash_value,
            name=clean_name,
            is_active=True,
            role="user",
        )
        session.add(user)
        try:
            session.flush()
        except IntegrityError as exc:
            raise AuthConflictError("An account with this email already exists.") from exc
        token, auth_session = _create_session(session=session, user=user)
        session.refresh(user)
        return {
            "user": _serialize_user(user),
            "session_token": token,
            "session_expires_at": auth_session.expires_at,
        }


def login_user(*, email: str, password: str) -> dict[str, object]:
    create_all_tables()
    normalized_email = _normalize_email(email)
    normalized_password = _normalize_password_input(password)
    with session_scope() as session:
        user = session.scalars(select(User).where(User.email == normalized_email)).first()
        if user is None:
            verify_password(normalized_password, _DUMMY_PASSWORD_HASH)
            raise AuthValidationError("Invalid credentials.")
        if not verify_password(normalized_password, user.password_hash):
            raise AuthValidationError("Invalid credentials.")
        if not user.is_active:
            raise AuthValidationError("Account is inactive.")
        token, auth_session = _create_session(session=session, user=user)
        session.refresh(user)
        return {
            "user": _serialize_user(user),
            "session_token": token,
            "session_expires_at": auth_session.expires_at,
        }


def get_user_by_session_token(token: str) -> dict[str, object]:
    create_all_tables()
    clean_token = (token or "").strip()
    if not clean_token:
        raise AuthValidationError("Session token is required.")
    token_hash = hash_session_token(clean_token)
    now = _utcnow()
    with session_scope() as session:
        auth_session = session.scalars(
            select(AuthSession).where(
                AuthSession.token_hash == token_hash,
                AuthSession.revoked_at.is_(None),
            )
        ).first()
        expires_at = _as_utc(auth_session.expires_at) if auth_session else None
        if auth_session is None or (expires_at and expires_at <= now):
            raise AuthNotFoundError("Session is invalid or expired.")
        user = session.get(User, auth_session.user_id)
        if user is None or not user.is_active:
            raise AuthNotFoundError("Account is invalid or inactive.")
        return _serialize_user(user)


def logout_session(token: str) -> dict[str, object]:
    create_all_tables()
    clean_token = (token or "").strip()
    if not clean_token:
        raise AuthValidationError("Session token is required.")
    token_hash = hash_session_token(clean_token)
    with session_scope() as session:
        auth_session = session.scalars(
            select(AuthSession).where(
                AuthSession.token_hash == token_hash,
                AuthSession.revoked_at.is_(None),
            )
        ).first()
        if auth_session is None:
            raise AuthNotFoundError("Session was not found.")
        auth_session.revoked_at = _utcnow()
        session.flush()
    return {"success": True}


def update_current_user(
    *,
    session_token: str,
    name: str | None = None,
    email: str | None = None,
    password: str | None = None,
) -> dict[str, object]:
    create_all_tables()
    clean_token = (session_token or "").strip()
    if not clean_token:
        raise AuthValidationError("Session token is required.")
    token_hash = hash_session_token(clean_token)
    now = _utcnow()
    with session_scope() as session:
        auth_session = session.scalars(
            select(AuthSession).where(
                AuthSession.token_hash == token_hash,
                AuthSession.revoked_at.is_(None),
            )
        ).first()
        expires_at = _as_utc(auth_session.expires_at) if auth_session else None
        if auth_session is None or (expires_at and expires_at <= now):
            raise AuthNotFoundError("Session is invalid or expired.")
        user = session.get(User, auth_session.user_id)
        if user is None:
            raise AuthNotFoundError("User was not found.")

        if name is not None:
            next_name = name.strip()
            if not next_name:
                raise AuthValidationError("Name cannot be empty.")
            user.name = next_name
        if email is not None:
            user.email = _normalize_email(email)
        if password is not None:
            normalized_password = _normalize_password_input(password)
            try:
                user.password_hash = hash_password(normalized_password)
            except SecurityValidationError as exc:
                raise AuthValidationError(str(exc)) from exc

        try:
            session.flush()
        except IntegrityError as exc:
            raise AuthConflictError("An account with this email already exists.") from exc
        session.refresh(user)
        return _serialize_user(user)

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
    if "@" not in email or "." not in email.split("@", 1)[-1]:
        raise AuthValidationError("A valid email address is required.")
    return email


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


def _create_session(*, session, user: User) -> tuple[str, AuthSession]:
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
    clean_name = (name or "").strip()
    if not clean_name:
        raise AuthValidationError("Name is required.")
    try:
        password_hash_value = hash_password(password)
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
    with session_scope() as session:
        user = session.scalars(select(User).where(User.email == normalized_email)).first()
        if user is None or not verify_password(password, user.password_hash):
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
            try:
                user.password_hash = hash_password(password)
            except SecurityValidationError as exc:
                raise AuthValidationError(str(exc)) from exc

        try:
            session.flush()
        except IntegrityError as exc:
            raise AuthConflictError("An account with this email already exists.") from exc
        session.refresh(user)
        return _serialize_user(user)

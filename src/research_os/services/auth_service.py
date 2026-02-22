from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hmac
import os

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from research_os.db import (
    AuthLoginChallenge,
    AuthSession,
    User,
    create_all_tables,
    session_scope,
)
from research_os.services.security_service import (
    SecurityValidationError,
    build_totp_otpauth_uri,
    decrypt_secret,
    encrypt_secret,
    generate_backup_codes,
    generate_session_token,
    generate_totp_secret,
    hash_backup_code,
    hash_password,
    hash_session_token,
    verify_totp_code,
    verify_password,
)

SESSION_DAYS = max(1, int(os.getenv("AUTH_SESSION_DAYS", "30")))
MAX_ACTIVE_SESSIONS = max(1, int(os.getenv("AUTH_MAX_ACTIVE_SESSIONS", "5")))
LOGIN_CHALLENGE_MINUTES = max(3, int(os.getenv("AUTH_LOGIN_CHALLENGE_MINUTES", "10")))
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


def _login_challenge_expiry() -> datetime:
    return _utcnow() + timedelta(minutes=LOGIN_CHALLENGE_MINUTES)


def _serialize_session_payload(
    *, user: User, session_token: str, session_expires_at: datetime
) -> dict[str, object]:
    return {
        "user": _serialize_user(user),
        "session_token": session_token,
        "session_expires_at": session_expires_at,
    }


def _prune_login_challenges(*, session, user_id: str) -> None:
    now = _utcnow()
    challenges = session.scalars(
        select(AuthLoginChallenge).where(AuthLoginChallenge.user_id == user_id)
    ).all()
    for challenge in challenges:
        expires_at = _as_utc(challenge.expires_at)
        if challenge.consumed_at is not None:
            continue
        if expires_at and expires_at <= now:
            challenge.consumed_at = now


def _resolve_user_from_session_token(*, session, token: str) -> tuple[User, AuthSession]:
    clean_token = (token or "").strip()
    if not clean_token:
        raise AuthValidationError("Session token is required.")
    token_hash = hash_session_token(clean_token)
    now = _utcnow()
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
    return user, auth_session


def _get_user_by_credentials(*, session, email: str, password: str) -> User:
    normalized_email = _normalize_email(email)
    normalized_password = _normalize_password_input(password)
    user = session.scalars(select(User).where(User.email == normalized_email)).first()
    if user is None:
        verify_password(normalized_password, _DUMMY_PASSWORD_HASH)
        raise AuthValidationError("Invalid credentials.")
    if not verify_password(normalized_password, user.password_hash):
        raise AuthValidationError("Invalid credentials.")
    if not user.is_active:
        raise AuthValidationError("Account is inactive.")
    return user


def _validate_backup_code_list(codes: list[str] | None) -> list[str]:
    if not codes:
        return generate_backup_codes()
    normalized: list[str] = []
    seen: set[str] = set()
    for item in codes:
        clean = (item or "").strip().upper()
        if not clean:
            continue
        if clean in seen:
            continue
        seen.add(clean)
        normalized.append(clean)
    if len(normalized) < 4:
        raise AuthValidationError("Provide at least 4 backup codes.")
    return normalized[:16]


def _assert_two_factor_enabled(user: User) -> None:
    if not user.two_factor_enabled:
        raise AuthValidationError("Two-factor authentication is not enabled.")
    if not user.two_factor_secret:
        raise AuthValidationError("Two-factor authentication secret is missing.")


def _verify_two_factor_code(*, user: User, code: str) -> bool:
    _assert_two_factor_enabled(user)
    secret = decrypt_secret(user.two_factor_secret) if user.two_factor_secret else None
    if secret and verify_totp_code(secret, code):
        return True

    try:
        candidate_hash = hash_backup_code(code)
    except SecurityValidationError:
        return False

    hashes = list(user.two_factor_backup_codes or [])
    for index, stored in enumerate(hashes):
        if hmac.compare_digest(candidate_hash, str(stored)):
            hashes.pop(index)
            user.two_factor_backup_codes = hashes
            return True
    return False


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
        return _serialize_session_payload(
            user=user,
            session_token=token,
            session_expires_at=auth_session.expires_at,
        )


def login_user(*, email: str, password: str) -> dict[str, object]:
    create_all_tables()
    with session_scope() as session:
        user = _get_user_by_credentials(session=session, email=email, password=password)
        if user.two_factor_enabled:
            raise AuthValidationError(
                "Two-factor authentication is required; use login challenge."
            )
        token, auth_session = _create_session(session=session, user=user)
        session.refresh(user)
        return _serialize_session_payload(
            user=user,
            session_token=token,
            session_expires_at=auth_session.expires_at,
        )


def get_user_by_session_token(token: str) -> dict[str, object]:
    create_all_tables()
    with session_scope() as session:
        user, _ = _resolve_user_from_session_token(session=session, token=token)
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
    with session_scope() as session:
        user, _ = _resolve_user_from_session_token(session=session, token=session_token)

        if name is not None:
            user.name = _normalize_name(name)
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


def start_login_challenge(*, email: str, password: str) -> dict[str, object]:
    create_all_tables()
    with session_scope() as session:
        user = _get_user_by_credentials(session=session, email=email, password=password)
        if not user.two_factor_enabled:
            token, auth_session = _create_session(session=session, user=user)
            session.refresh(user)
            return {
                "status": "authenticated",
                "session": _serialize_session_payload(
                    user=user,
                    session_token=token,
                    session_expires_at=auth_session.expires_at,
                ),
                "challenge_token": None,
                "challenge_expires_at": None,
                "user_hint": {
                    "email": user.email,
                    "name": user.name,
                },
            }

        _prune_login_challenges(session=session, user_id=user.id)
        challenge_token = generate_session_token()
        challenge_hash = hash_session_token(challenge_token)
        challenge = AuthLoginChallenge(
            user_id=user.id,
            challenge_hash=challenge_hash,
            expires_at=_login_challenge_expiry(),
            consumed_at=None,
        )
        session.add(challenge)
        session.flush()
        return {
            "status": "two_factor_required",
            "session": None,
            "challenge_token": challenge_token,
            "challenge_expires_at": challenge.expires_at,
            "user_hint": {
                "email": user.email,
                "name": user.name,
            },
        }


def complete_login_challenge(*, challenge_token: str, code: str) -> dict[str, object]:
    create_all_tables()
    clean_token = (challenge_token or "").strip()
    if not clean_token:
        raise AuthValidationError("Challenge token is required.")

    challenge_hash = hash_session_token(clean_token)
    now = _utcnow()
    with session_scope() as session:
        challenge = session.scalars(
            select(AuthLoginChallenge).where(
                AuthLoginChallenge.challenge_hash == challenge_hash,
                AuthLoginChallenge.consumed_at.is_(None),
            )
        ).first()
        expires_at = _as_utc(challenge.expires_at) if challenge else None
        if challenge is None or (expires_at and expires_at <= now):
            raise AuthValidationError("Login challenge is invalid or expired.")

        user = session.get(User, challenge.user_id)
        if user is None or not user.is_active:
            raise AuthNotFoundError("Account is invalid or inactive.")

        if not _verify_two_factor_code(user=user, code=code):
            raise AuthValidationError("Two-factor code is invalid.")

        challenge.consumed_at = now
        token, auth_session = _create_session(session=session, user=user)
        session.flush()
        session.refresh(user)
        return _serialize_session_payload(
            user=user,
            session_token=token,
            session_expires_at=auth_session.expires_at,
        )


def get_two_factor_state(*, session_token: str) -> dict[str, object]:
    create_all_tables()
    with session_scope() as session:
        user, _ = _resolve_user_from_session_token(session=session, token=session_token)
        return {
            "enabled": bool(user.two_factor_enabled and user.two_factor_secret),
            "backup_codes_remaining": len(user.two_factor_backup_codes or []),
            "confirmed_at": user.two_factor_confirmed_at,
        }


def create_two_factor_setup(*, session_token: str) -> dict[str, object]:
    create_all_tables()
    with session_scope() as session:
        user, _ = _resolve_user_from_session_token(session=session, token=session_token)
        secret = generate_totp_secret()
        backup_codes = generate_backup_codes()
        otpauth_uri = build_totp_otpauth_uri(
            secret=secret,
            label=user.email,
            issuer="AAWE",
        )
        return {
            "secret": secret,
            "otpauth_uri": otpauth_uri,
            "backup_codes": backup_codes,
        }


def enable_two_factor(
    *,
    session_token: str,
    secret: str,
    code: str,
    backup_codes: list[str] | None = None,
) -> dict[str, object]:
    create_all_tables()
    clean_secret = (secret or "").strip().replace(" ", "").upper()
    if not clean_secret:
        raise AuthValidationError("2FA secret is required.")
    if not verify_totp_code(clean_secret, code):
        raise AuthValidationError("Two-factor code is invalid.")

    backup_code_list = _validate_backup_code_list(backup_codes)
    try:
        hashed_backup_codes = [hash_backup_code(item) for item in backup_code_list]
    except SecurityValidationError as exc:
        raise AuthValidationError(str(exc)) from exc

    with session_scope() as session:
        user, _ = _resolve_user_from_session_token(session=session, token=session_token)
        user.two_factor_enabled = True
        user.two_factor_secret = encrypt_secret(clean_secret)
        user.two_factor_backup_codes = hashed_backup_codes
        user.two_factor_confirmed_at = _utcnow()
        session.flush()
        return {
            "enabled": True,
            "backup_codes_remaining": len(hashed_backup_codes),
            "confirmed_at": user.two_factor_confirmed_at,
        }


def disable_two_factor(*, session_token: str, code: str) -> dict[str, object]:
    create_all_tables()
    with session_scope() as session:
        user, _ = _resolve_user_from_session_token(session=session, token=session_token)
        if not user.two_factor_enabled:
            return {
                "enabled": False,
                "backup_codes_remaining": 0,
                "confirmed_at": None,
            }
        if not _verify_two_factor_code(user=user, code=code):
            raise AuthValidationError("Two-factor code is invalid.")
        user.two_factor_enabled = False
        user.two_factor_secret = None
        user.two_factor_backup_codes = []
        user.two_factor_confirmed_at = None
        session.flush()
        return {
            "enabled": False,
            "backup_codes_remaining": 0,
            "confirmed_at": None,
        }

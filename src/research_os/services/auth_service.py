from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hmac
import os
import secrets
import shutil
import string
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from research_os.db import (
    AuthEmailVerificationCode,
    AuthLoginChallenge,
    AuthPasswordResetCode,
    AuthSession,
    PublicationFile,
    User,
    create_all_tables,
    session_scope,
)
from research_os.services.email_delivery_service import send_plain_email
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
    password_hash_supported,
    verify_totp_code,
    verify_password,
)

SESSION_DAYS = max(1, int(os.getenv("AUTH_SESSION_DAYS", "30")))
MAX_ACTIVE_SESSIONS = max(1, int(os.getenv("AUTH_MAX_ACTIVE_SESSIONS", "5")))
LOGIN_CHALLENGE_MINUTES = max(3, int(os.getenv("AUTH_LOGIN_CHALLENGE_MINUTES", "10")))
EMAIL_VERIFICATION_MINUTES = max(
    5, int(os.getenv("AUTH_EMAIL_VERIFICATION_MINUTES", "30"))
)
PASSWORD_RESET_MINUTES = max(5, int(os.getenv("AUTH_PASSWORD_RESET_MINUTES", "30")))
EXPOSE_AUTH_CODES_IN_RESPONSE = os.getenv("AUTH_EXPOSE_DEBUG_CODES", "1").strip() in {
    "1",
    "true",
    "yes",
    "on",
}
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
        "email_verified_at": user.email_verified_at,
        "last_sign_in_at": user.last_sign_in_at,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name, "1" if default else "0").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def ensure_bootstrap_user() -> dict[str, object] | None:
    seed_email = os.getenv("AAWE_BOOTSTRAP_EMAIL", "").strip()
    seed_password = os.getenv("AAWE_BOOTSTRAP_PASSWORD", "").strip()
    if not seed_email or not seed_password:
        return None

    default_name = os.getenv("AAWE_BOOTSTRAP_NAME", "AAWE Test User").strip()
    seed_name = default_name if len(default_name) >= 2 else "AAWE Test User"
    force_password_reset = _env_flag("AAWE_BOOTSTRAP_FORCE_PASSWORD", default=False)
    mark_email_verified = _env_flag("AAWE_BOOTSTRAP_EMAIL_VERIFIED", default=True)
    role = os.getenv("AAWE_BOOTSTRAP_ROLE", "user").strip().lower()
    if role not in {"user", "admin"}:
        role = "user"

    normalized_email = _normalize_email(seed_email)
    normalized_name = _normalize_name(seed_name)
    normalized_password = _normalize_password_input(seed_password)
    password_hash_value = hash_password(normalized_password)

    create_all_tables()
    with session_scope() as session:
        user = session.scalars(
            select(User).where(User.email == normalized_email)
        ).first()
        created = False
        updated = False
        if user is None:
            created = True
            user = User(
                email=normalized_email,
                password_hash=password_hash_value,
                name=normalized_name,
                is_active=True,
                role=role,
                email_verified_at=_utcnow() if mark_email_verified else None,
            )
            session.add(user)
        else:
            if user.name != normalized_name:
                user.name = normalized_name
                updated = True
            if not bool(user.is_active):
                user.is_active = True
                updated = True
            if user.role != role:
                user.role = role
                updated = True
            if mark_email_verified and user.email_verified_at is None:
                user.email_verified_at = _utcnow()
                updated = True
            if force_password_reset:
                user.password_hash = password_hash_value
                updated = True
        session.flush()
        return {
            "email": normalized_email,
            "created": created,
            "updated": updated,
            "email_verified": bool(user.email_verified_at),
            "role": user.role,
        }


def _session_expiry() -> datetime:
    return _utcnow() + timedelta(days=SESSION_DAYS)


def _login_challenge_expiry() -> datetime:
    return _utcnow() + timedelta(minutes=LOGIN_CHALLENGE_MINUTES)


def _email_verification_expiry() -> datetime:
    return _utcnow() + timedelta(minutes=EMAIL_VERIFICATION_MINUTES)


def _password_reset_expiry() -> datetime:
    return _utcnow() + timedelta(minutes=PASSWORD_RESET_MINUTES)


def _generate_human_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(max(6, length)))


def _serialize_session_payload(
    *, user: User, session_token: str, session_expires_at: datetime
) -> dict[str, object]:
    return {
        "user": _serialize_user(user),
        "session_token": session_token,
        "session_expires_at": session_expires_at,
    }


def _enqueue_post_sign_in_refresh(*, user_id: str, reason: str) -> None:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return
    try:
        from research_os.services.publication_metrics_service import (
            enqueue_publication_top_metrics_refresh,
        )

        enqueue_publication_top_metrics_refresh(
            user_id=clean_user_id,
            force=False,
            reason=reason or "auth_sign_in",
        )
    except Exception:
        return


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


def _prune_email_verification_codes(*, session, user_id: str) -> None:
    now = _utcnow()
    codes = session.scalars(
        select(AuthEmailVerificationCode).where(
            AuthEmailVerificationCode.user_id == user_id
        )
    ).all()
    for item in codes:
        expires_at = _as_utc(item.expires_at)
        if item.consumed_at is not None:
            continue
        if expires_at and expires_at <= now:
            item.consumed_at = now


def _prune_password_reset_codes(*, session, user_id: str) -> None:
    now = _utcnow()
    codes = session.scalars(
        select(AuthPasswordResetCode).where(AuthPasswordResetCode.user_id == user_id)
    ).all()
    for item in codes:
        expires_at = _as_utc(item.expires_at)
        if item.consumed_at is not None:
            continue
        if expires_at and expires_at <= now:
            item.consumed_at = now


def _issue_email_verification_code(*, session, user: User) -> tuple[str, datetime]:
    _prune_email_verification_codes(session=session, user_id=user.id)
    now = _utcnow()
    existing = session.scalars(
        select(AuthEmailVerificationCode).where(
            AuthEmailVerificationCode.user_id == user.id,
            AuthEmailVerificationCode.consumed_at.is_(None),
        )
    ).all()
    for row in existing:
        row.consumed_at = now
    plain_code = _generate_human_code(8)
    code_row = AuthEmailVerificationCode(
        user_id=user.id,
        code_hash=hash_session_token(plain_code),
        expires_at=_email_verification_expiry(),
        consumed_at=None,
    )
    session.add(code_row)
    session.flush()
    return plain_code, code_row.expires_at


def _issue_password_reset_code(*, session, user: User) -> tuple[str, datetime]:
    _prune_password_reset_codes(session=session, user_id=user.id)
    now = _utcnow()
    existing = session.scalars(
        select(AuthPasswordResetCode).where(
            AuthPasswordResetCode.user_id == user.id,
            AuthPasswordResetCode.consumed_at.is_(None),
        )
    ).all()
    for row in existing:
        row.consumed_at = now
    plain_code = _generate_human_code(10)
    code_row = AuthPasswordResetCode(
        user_id=user.id,
        code_hash=hash_session_token(plain_code),
        expires_at=_password_reset_expiry(),
        consumed_at=None,
    )
    session.add(code_row)
    session.flush()
    return plain_code, code_row.expires_at


def _resolve_user_from_session_token(
    *, session, token: str
) -> tuple[User, AuthSession]:
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
        if not password_hash_supported(user.password_hash):
            raise AuthValidationError(
                "Password format is legacy or unsupported. Use password reset, then sign in again."
            )
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
    for row in active[: max(0, surplus)]:
        row.revoked_at = now


def _create_session(*, session, user: User) -> tuple[str, AuthSession]:
    _prune_sessions(session=session, user_id=user.id)
    user.last_sign_in_at = _utcnow()
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

    response_payload: dict[str, object] = {}
    signed_in_user_id = ""
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
            raise AuthConflictError(
                "An account with this email already exists."
            ) from exc
        token, auth_session = _create_session(session=session, user=user)
        session.refresh(user)
        response_payload = _serialize_session_payload(
            user=user,
            session_token=token,
            session_expires_at=auth_session.expires_at,
        )
        signed_in_user_id = str(user.id)

    if signed_in_user_id:
        _enqueue_post_sign_in_refresh(
            user_id=signed_in_user_id,
            reason="auth_register_sign_in",
        )
    return response_payload


def login_user(*, email: str, password: str) -> dict[str, object]:
    create_all_tables()
    response_payload: dict[str, object] = {}
    signed_in_user_id = ""
    with session_scope() as session:
        user = _get_user_by_credentials(session=session, email=email, password=password)
        if user.two_factor_enabled:
            raise AuthValidationError(
                "Two-factor authentication is required; use login challenge."
            )
        token, auth_session = _create_session(session=session, user=user)
        session.refresh(user)
        response_payload = _serialize_session_payload(
            user=user,
            session_token=token,
            session_expires_at=auth_session.expires_at,
        )
        signed_in_user_id = str(user.id)

    if signed_in_user_id:
        _enqueue_post_sign_in_refresh(
            user_id=signed_in_user_id,
            reason="auth_login_sign_in",
        )
    return response_payload


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
    identity_changed = False
    updated_user_id = ""
    response_payload: dict[str, object] = {}
    with session_scope() as session:
        user, _ = _resolve_user_from_session_token(session=session, token=session_token)

        if name is not None:
            normalized_name = _normalize_name(name)
            if normalized_name != user.name:
                identity_changed = True
            user.name = normalized_name
        if email is not None:
            normalized_email = _normalize_email(email)
            if normalized_email != user.email:
                user.email = normalized_email
                user.email_verified_at = None
                identity_changed = True
        if password is not None:
            normalized_password = _normalize_password_input(password)
            try:
                user.password_hash = hash_password(normalized_password)
            except SecurityValidationError as exc:
                raise AuthValidationError(str(exc)) from exc

        try:
            session.flush()
        except IntegrityError as exc:
            raise AuthConflictError(
                "An account with this email already exists."
            ) from exc
        session.refresh(user)
        updated_user_id = str(user.id)
        response_payload = _serialize_user(user)

    if identity_changed and updated_user_id:
        try:
            from research_os.services.publications_analytics_service import (
                enqueue_publications_analytics_recompute,
            )
            from research_os.services.collaboration_service import (
                enqueue_collaboration_metrics_recompute,
            )

            enqueue_publications_analytics_recompute(
                user_id=updated_user_id,
                force=True,
                reason="profile_identity_updated",
            )
            enqueue_collaboration_metrics_recompute(
                user_id=updated_user_id,
                force=True,
                reason="profile_identity_updated",
            )
        except Exception:
            pass
    return response_payload


def _remove_publication_file_path(path_value: str | None) -> None:
    clean = str(path_value or "").strip()
    if not clean:
        return
    try:
        path = Path(clean)
        if path.exists() and path.is_file():
            path.unlink(missing_ok=True)
    except Exception:
        return


def delete_current_user(
    *, session_token: str, confirm_phrase: str
) -> dict[str, object]:
    create_all_tables()
    clean_phrase = str(confirm_phrase or "").strip().upper()
    if clean_phrase != "DELETE":
        raise AuthValidationError("Type DELETE to confirm account deletion.")

    deleted_user_id = ""
    stored_upload_paths: list[str] = []
    with session_scope() as session:
        user, _ = _resolve_user_from_session_token(session=session, token=session_token)
        deleted_user_id = str(user.id)
        file_rows = session.scalars(
            select(PublicationFile).where(
                PublicationFile.owner_user_id == deleted_user_id
            )
        ).all()
        for row in file_rows:
            source = str(row.source or "").strip().upper()
            storage_key = str(row.storage_key or "").strip()
            if source == "USER_UPLOAD" and storage_key:
                stored_upload_paths.append(storage_key)
        session.delete(user)
        session.flush()

    for path_value in stored_upload_paths:
        _remove_publication_file_path(path_value)

    if deleted_user_id:
        try:
            storage_root = Path(
                os.getenv("PUBLICATION_FILES_ROOT", "./publication_files_store")
            )
            shutil.rmtree(storage_root / deleted_user_id, ignore_errors=True)
        except Exception:
            pass

    return {"success": True}


def start_login_challenge(*, email: str, password: str) -> dict[str, object]:
    create_all_tables()
    response_payload: dict[str, object] = {}
    signed_in_user_id = ""
    with session_scope() as session:
        user = _get_user_by_credentials(session=session, email=email, password=password)
        if not user.two_factor_enabled:
            token, auth_session = _create_session(session=session, user=user)
            session.refresh(user)
            response_payload = {
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
            signed_in_user_id = str(user.id)
        else:
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
            response_payload = {
                "status": "two_factor_required",
                "session": None,
                "challenge_token": challenge_token,
                "challenge_expires_at": challenge.expires_at,
                "user_hint": {
                    "email": user.email,
                    "name": user.name,
                },
            }

    if signed_in_user_id:
        _enqueue_post_sign_in_refresh(
            user_id=signed_in_user_id,
            reason="auth_login_challenge_sign_in",
        )
    return response_payload


def complete_login_challenge(*, challenge_token: str, code: str) -> dict[str, object]:
    create_all_tables()
    clean_token = (challenge_token or "").strip()
    if not clean_token:
        raise AuthValidationError("Challenge token is required.")

    challenge_hash = hash_session_token(clean_token)
    now = _utcnow()
    response_payload: dict[str, object] = {}
    signed_in_user_id = ""
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
        response_payload = _serialize_session_payload(
            user=user,
            session_token=token,
            session_expires_at=auth_session.expires_at,
        )
        signed_in_user_id = str(user.id)

    if signed_in_user_id:
        _enqueue_post_sign_in_refresh(
            user_id=signed_in_user_id,
            reason="auth_login_2fa_sign_in",
        )
    return response_payload


def request_email_verification(*, session_token: str) -> dict[str, object]:
    create_all_tables()
    with session_scope() as session:
        user, _ = _resolve_user_from_session_token(session=session, token=session_token)
        if user.email_verified_at is not None:
            return {
                "requested": False,
                "already_verified": True,
                "expires_at": None,
                "delivery_hint": "Email already verified.",
                "code_preview": None,
            }
        plain_code, expires_at = _issue_email_verification_code(
            session=session, user=user
        )
        expires_hint = _as_utc(expires_at)
        expires_text = (
            expires_hint.strftime("%d %b %Y %H:%M UTC")
            if isinstance(expires_hint, datetime)
            else "soon"
        )
        delivered = send_plain_email(
            to_email=user.email,
            subject="AAWE email verification code",
            body=(
                "Use this AAWE verification code to confirm your email address:\n\n"
                f"{plain_code}\n\n"
                f"Code expiry: {expires_text}\n\n"
                "If you did not create an AAWE account, you can ignore this email."
            ),
        )
        return {
            "requested": True,
            "already_verified": False,
            "expires_at": expires_at,
            "delivery_hint": (
                "Verification code sent to your email."
                if delivered
                else "Verification code generated. Connect an outbound email provider for delivery."
            ),
            "code_preview": plain_code if EXPOSE_AUTH_CODES_IN_RESPONSE else None,
        }


def confirm_email_verification(*, session_token: str, code: str) -> dict[str, object]:
    create_all_tables()
    clean_code = (code or "").strip().upper()
    if not clean_code:
        raise AuthValidationError("Verification code is required.")
    with session_scope() as session:
        user, _ = _resolve_user_from_session_token(session=session, token=session_token)
        if user.email_verified_at is not None:
            return _serialize_user(user)

        _prune_email_verification_codes(session=session, user_id=user.id)
        code_hash = hash_session_token(clean_code)
        row = session.scalars(
            select(AuthEmailVerificationCode).where(
                AuthEmailVerificationCode.user_id == user.id,
                AuthEmailVerificationCode.code_hash == code_hash,
                AuthEmailVerificationCode.consumed_at.is_(None),
            )
        ).first()
        if row is None:
            raise AuthValidationError("Verification code is invalid or expired.")
        row.consumed_at = _utcnow()
        user.email_verified_at = _utcnow()
        session.flush()
        session.refresh(user)
        return _serialize_user(user)


def request_password_reset(*, email: str) -> dict[str, object]:
    create_all_tables()
    normalized_email = _normalize_email(email)
    with session_scope() as session:
        user = session.scalars(
            select(User).where(User.email == normalized_email)
        ).first()
        if user is None or not user.is_active:
            return {
                "requested": True,
                "expires_at": None,
                "delivery_hint": "If this email exists, a reset code has been generated.",
                "code_preview": None,
            }
        plain_code, expires_at = _issue_password_reset_code(session=session, user=user)
        expires_hint = _as_utc(expires_at)
        expires_text = (
            expires_hint.strftime("%d %b %Y %H:%M UTC")
            if isinstance(expires_hint, datetime)
            else "soon"
        )
        delivered = send_plain_email(
            to_email=user.email,
            subject="AAWE password reset code",
            body=(
                "Use this AAWE reset code to set a new password:\n\n"
                f"{plain_code}\n\n"
                f"Code expiry: {expires_text}\n\n"
                "If you did not request this, you can ignore this email."
            ),
        )
        return {
            "requested": True,
            "expires_at": expires_at,
            "delivery_hint": (
                "Reset code sent to your email."
                if delivered
                else "Reset code generated. Connect an outbound email provider for delivery."
            ),
            "code_preview": plain_code if EXPOSE_AUTH_CODES_IN_RESPONSE else None,
        }


def confirm_password_reset(
    *, email: str, code: str, new_password: str
) -> dict[str, object]:
    create_all_tables()
    normalized_email = _normalize_email(email)
    clean_code = (code or "").strip().upper()
    if not clean_code:
        raise AuthValidationError("Reset code is required.")
    normalized_password = _normalize_password_input(new_password)
    try:
        password_hash_value = hash_password(normalized_password)
    except SecurityValidationError as exc:
        raise AuthValidationError(str(exc)) from exc

    with session_scope() as session:
        user = session.scalars(
            select(User).where(User.email == normalized_email)
        ).first()
        if user is None or not user.is_active:
            raise AuthValidationError("Reset request is invalid.")
        _prune_password_reset_codes(session=session, user_id=user.id)
        code_hash = hash_session_token(clean_code)
        row = session.scalars(
            select(AuthPasswordResetCode).where(
                AuthPasswordResetCode.user_id == user.id,
                AuthPasswordResetCode.code_hash == code_hash,
                AuthPasswordResetCode.consumed_at.is_(None),
            )
        ).first()
        if row is None:
            raise AuthValidationError("Reset code is invalid or expired.")
        row.consumed_at = _utcnow()
        user.password_hash = password_hash_value
        session.flush()
        return {"success": True}


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

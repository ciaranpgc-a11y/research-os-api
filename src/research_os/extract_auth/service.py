"""Extract access control service — fully separate from Axiomos auth."""

import os
import secrets
from datetime import datetime, timezone

import bcrypt
from sqlalchemy import inspect, select, text

from research_os.db import create_all_tables, get_engine, session_scope
from research_os.extract_auth.models import ExtractAccessCode, ExtractSession

_admin_seeded = False
ADMIN_DISPLAY_NAME = "Ciaran Grafton-Clarke"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_tables() -> None:
    """Create tables (if needed) and seed the admin row."""
    global _admin_seeded
    create_all_tables()
    engine = get_engine()
    columns = {column["name"] for column in inspect(engine).get_columns("extract_access_codes")}
    if "code_plaintext" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE extract_access_codes ADD COLUMN code_plaintext TEXT"))
    if not _admin_seeded:
        with session_scope() as session:
            existing = session.get(ExtractAccessCode, "admin")
            if existing is None:
                admin_row = ExtractAccessCode(
                    id="admin",
                    name=ADMIN_DISPLAY_NAME,
                    code_hash=None,
                    code_plaintext=None,
                )
                session.add(admin_row)
            elif existing.name != ADMIN_DISPLAY_NAME:
                existing.name = ADMIN_DISPLAY_NAME
            session.commit()
        _admin_seeded = True


def _hash_code(code: str) -> str:
    return bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()


def _check_code(code: str, code_hash: str) -> bool:
    return bcrypt.checkpw(code.encode(), code_hash.encode())


def _dummy_bcrypt_check() -> None:
    """Run a dummy bcrypt check to prevent timing-based enumeration."""
    bcrypt.checkpw(b"dummy", bcrypt.gensalt())


def _create_admin_session() -> dict | None:
    _ensure_tables()
    with session_scope() as session:
        admin_row = session.get(ExtractAccessCode, "admin")
        if admin_row is None:
            return None

        token = secrets.token_hex(32)
        extract_session = ExtractSession(
            access_code_id="admin",
            session_token=token,
            is_admin=True,
        )
        session.add(extract_session)
        admin_row.last_accessed_at = _utcnow()
        admin_row.session_count += 1
        session.commit()

        return {
            "session_token": token,
            "name": admin_row.name,
            "is_admin": True,
            "access_code_id": "admin",
        }


# --- Admin login ---


def admin_login(password: str) -> dict | None:
    expected = os.environ.get("EXTRACT_ADMIN_PASSWORD", "")
    if not expected or not secrets.compare_digest(password, expected):
        return None

    return _create_admin_session()


# --- User login ---


def user_login(code: str) -> dict | None:
    expected_admin_password = os.environ.get("EXTRACT_ADMIN_PASSWORD", "")
    if expected_admin_password and secrets.compare_digest(code, expected_admin_password):
        return _create_admin_session()

    _ensure_tables()
    with session_scope() as session:
        stmt = select(ExtractAccessCode).where(
            ExtractAccessCode.is_active == True,  # noqa: E712
            ExtractAccessCode.code_hash.isnot(None),
        )
        rows = session.execute(stmt).scalars().all()

        matched_row = None
        for row in rows:
            if _check_code(code, row.code_hash):
                matched_row = row
                break

        if matched_row is None:
            _dummy_bcrypt_check()
            return None

        token = secrets.token_hex(32)
        extract_session = ExtractSession(
            access_code_id=matched_row.id,
            session_token=token,
            is_admin=False,
        )
        session.add(extract_session)
        matched_row.last_accessed_at = _utcnow()
        matched_row.session_count += 1
        session.commit()

        return {
            "session_token": token,
            "name": matched_row.name,
            "is_admin": False,
            "access_code_id": matched_row.id,
        }


# --- Session validation ---


def get_session_user(token: str) -> dict | None:
    context = get_session_context(token)
    if context is None:
        return None
    return {
        "name": context["name"],
        "is_admin": context["is_admin"],
        "access_code_id": context["access_code_id"],
    }


def get_session_context(token: str) -> dict | None:
    _ensure_tables()
    with session_scope() as session:
        stmt = (
            select(ExtractSession, ExtractAccessCode)
            .join(ExtractAccessCode)
            .where(ExtractSession.session_token == token)
        )
        result = session.execute(stmt).first()
        if result is None:
            return None

        extract_session, access_code = result
        if not access_code.is_active:
            return None

        return {
            "access_code_id": access_code.id,
            "name": access_code.name,
            "is_admin": extract_session.is_admin,
        }


def delete_session(token: str) -> bool:
    _ensure_tables()
    with session_scope() as session:
        stmt = select(ExtractSession).where(ExtractSession.session_token == token)
        extract_session = session.execute(stmt).scalar_one_or_none()
        if extract_session is None:
            return False
        session.delete(extract_session)
        session.commit()
        return True


# --- Code management (admin) ---


def create_access_code(name: str, code: str) -> dict:
    _ensure_tables()
    clean_code = str(code or "").strip()
    with session_scope() as session:
        row = ExtractAccessCode(
            name=name,
            code_hash=_hash_code(clean_code),
            code_plaintext=clean_code,
        )
        session.add(row)
        session.commit()
        return {"id": row.id, "name": row.name, "code": row.code_plaintext}


def list_access_codes() -> list[dict]:
    _ensure_tables()
    with session_scope() as session:
        stmt = select(ExtractAccessCode).order_by(ExtractAccessCode.created_at.desc())
        rows = session.execute(stmt).scalars().all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "code": r.code_plaintext,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "last_accessed_at": r.last_accessed_at.isoformat() if r.last_accessed_at else None,
                "session_count": r.session_count,
                "is_active": r.is_active,
            }
            for r in rows
            if r.id == "admin" or r.is_active
        ]


def revoke_access_code(code_id: str) -> bool | str:
    if code_id == "admin":
        return "Cannot revoke admin access"

    _ensure_tables()
    with session_scope() as session:
        row = session.get(ExtractAccessCode, code_id)
        if row is None:
            return "Access code not found"
        session.delete(row)
        session.commit()
        return True

"""CMR access control service — fully separate from Axiomos auth."""

import os
import secrets
from datetime import datetime, timezone

import bcrypt
from sqlalchemy import select

from research_os.cmr_auth.models import CmrAccessCode, CmrSession
from research_os.db import create_all_tables, session_scope

_admin_seeded = False


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_tables() -> None:
    """Create tables (if needed) and seed the admin row."""
    global _admin_seeded
    create_all_tables()
    if not _admin_seeded:
        with session_scope() as session:
            existing = session.get(CmrAccessCode, "admin")
            if existing is None:
                admin_row = CmrAccessCode(
                    id="admin",
                    name="Admin",
                    code_hash=None,
                )
                session.add(admin_row)
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
        admin_row = session.get(CmrAccessCode, "admin")
        if admin_row is None:
            return None

        token = secrets.token_hex(32)
        cmr_session = CmrSession(
            access_code_id="admin",
            session_token=token,
            is_admin=True,
        )
        session.add(cmr_session)
        admin_row.last_accessed_at = _utcnow()
        admin_row.session_count += 1
        session.commit()

        return {
            "session_token": token,
            "name": "Admin",
            "is_admin": True,
        }


# --- Admin login ---


def admin_login(password: str) -> dict | None:
    expected = os.environ.get("CMR_ADMIN_PASSWORD", "")
    if not expected or not secrets.compare_digest(password, expected):
        return None

    return _create_admin_session()


# --- User login ---


def user_login(code: str) -> dict | None:
    expected_admin_password = os.environ.get("CMR_ADMIN_PASSWORD", "")
    if expected_admin_password and secrets.compare_digest(code, expected_admin_password):
        return _create_admin_session()

    _ensure_tables()
    with session_scope() as session:
        stmt = select(CmrAccessCode).where(
            CmrAccessCode.is_active == True,  # noqa: E712
            CmrAccessCode.code_hash.isnot(None),
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
        cmr_session = CmrSession(
            access_code_id=matched_row.id,
            session_token=token,
            is_admin=False,
        )
        session.add(cmr_session)
        matched_row.last_accessed_at = _utcnow()
        matched_row.session_count += 1
        session.commit()

        return {
            "session_token": token,
            "name": matched_row.name,
            "is_admin": False,
        }


# --- Session validation ---


def get_session_user(token: str) -> dict | None:
    _ensure_tables()
    with session_scope() as session:
        stmt = (
            select(CmrSession, CmrAccessCode)
            .join(CmrAccessCode)
            .where(CmrSession.session_token == token)
        )
        result = session.execute(stmt).first()
        if result is None:
            return None

        cmr_session, access_code = result
        if not access_code.is_active:
            return None

        return {
            "name": access_code.name,
            "is_admin": cmr_session.is_admin,
        }


def delete_session(token: str) -> bool:
    _ensure_tables()
    with session_scope() as session:
        stmt = select(CmrSession).where(CmrSession.session_token == token)
        cmr_session = session.execute(stmt).scalar_one_or_none()
        if cmr_session is None:
            return False
        session.delete(cmr_session)
        session.commit()
        return True


# --- Code management (admin) ---


def create_access_code(name: str, code: str) -> dict:
    _ensure_tables()
    with session_scope() as session:
        row = CmrAccessCode(
            name=name,
            code_hash=_hash_code(code),
        )
        session.add(row)
        session.commit()
        return {"id": row.id, "name": row.name}


def list_access_codes() -> list[dict]:
    _ensure_tables()
    with session_scope() as session:
        stmt = select(CmrAccessCode).order_by(CmrAccessCode.created_at.desc())
        rows = session.execute(stmt).scalars().all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "last_accessed_at": r.last_accessed_at.isoformat() if r.last_accessed_at else None,
                "session_count": r.session_count,
                "is_active": r.is_active,
            }
            for r in rows
        ]


def revoke_access_code(code_id: str) -> bool | str:
    if code_id == "admin":
        return "Cannot revoke admin access"

    _ensure_tables()
    with session_scope() as session:
        row = session.get(CmrAccessCode, code_id)
        if row is None:
            return "Access code not found"
        row.is_active = False
        session.commit()
        return True

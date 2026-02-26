from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select

from research_os.db import User, create_all_tables, session_scope


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_admin_user(user: User) -> dict[str, object]:
    role = str(user.role or "").strip().lower()
    if role not in {"user", "admin"}:
        role = "user"
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_active": bool(user.is_active),
        "role": role,
        "email_verified_at": user.email_verified_at,
        "last_sign_in_at": user.last_sign_in_at,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


def get_admin_overview() -> dict[str, object]:
    create_all_tables()
    now = _utcnow()
    recent_threshold = now - timedelta(hours=24)
    active_7d_threshold = now - timedelta(days=7)
    active_30d_threshold = now - timedelta(days=30)
    with session_scope() as session:
        total_users = int(session.scalar(select(func.count()).select_from(User)) or 0)
        active_users = int(
            session.scalar(
                select(func.count()).select_from(User).where(User.is_active.is_(True))
            )
            or 0
        )
        admin_users = int(
            session.scalar(
                select(func.count()).select_from(User).where(User.role == "admin")
            )
            or 0
        )
        recent_signins_24h = int(
            session.scalar(
                select(func.count())
                .select_from(User)
                .where(
                    User.last_sign_in_at.is_not(None),
                    User.last_sign_in_at >= recent_threshold,
                )
            )
            or 0
        )
        active_users_7d = int(
            session.scalar(
                select(func.count())
                .select_from(User)
                .where(
                    User.last_sign_in_at.is_not(None),
                    User.last_sign_in_at >= active_7d_threshold,
                )
            )
            or 0
        )
        active_users_30d = int(
            session.scalar(
                select(func.count())
                .select_from(User)
                .where(
                    User.last_sign_in_at.is_not(None),
                    User.last_sign_in_at >= active_30d_threshold,
                )
            )
            or 0
        )

    denominator = max(1, total_users)
    return {
        "total_users": total_users,
        "active_users": active_users,
        "active_users_24h": recent_signins_24h,
        "active_users_7d": active_users_7d,
        "active_users_30d": active_users_30d,
        "retention_7d_pct": round((active_users_7d / denominator) * 100.0, 2),
        "retention_30d_pct": round((active_users_30d / denominator) * 100.0, 2),
        "inactive_users": max(0, total_users - active_users),
        "admin_users": admin_users,
        "recent_signins_24h": recent_signins_24h,
        "generated_at": now,
    }


def list_admin_users(
    *,
    query: str = "",
    limit: int = 50,
    offset: int = 0,
) -> dict[str, object]:
    create_all_tables()
    normalized_query = str(query or "").strip().lower()
    normalized_limit = max(1, min(200, int(limit)))
    normalized_offset = max(0, int(offset))

    with session_scope() as session:
        users_stmt = select(User)
        total_stmt = select(func.count()).select_from(User)
        if normalized_query:
            like = f"%{normalized_query}%"
            predicate = or_(
                func.lower(User.email).like(like),
                func.lower(User.name).like(like),
            )
            users_stmt = users_stmt.where(predicate)
            total_stmt = total_stmt.where(predicate)

        users = session.scalars(
            users_stmt
            .order_by(User.created_at.desc())
            .offset(normalized_offset)
            .limit(normalized_limit)
        ).all()
        total = int(session.scalar(total_stmt) or 0)
        items = [_serialize_admin_user(user) for user in users]

    return {
        "items": items,
        "total": total,
        "limit": normalized_limit,
        "offset": normalized_offset,
    }

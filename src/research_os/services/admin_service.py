from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select

from research_os.db import (
    DataLibraryAsset,
    GenerationJob,
    Project,
    User,
    Work,
    create_all_tables,
    session_scope,
)

PERSONAL_EMAIL_DOMAINS = {
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "yahoo.com",
    "icloud.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
}

PLAN_LIMITS: dict[str, dict[str, float | int]] = {
    "individual": {
        "rate_limit_rpm": 120,
        "monthly_token_quota": 500_000,
        "storage_quota_gb": 5,
        "data_retention_days": 180,
        "gross_margin_pct": 58.0,
    },
    "growth": {
        "rate_limit_rpm": 450,
        "monthly_token_quota": 2_000_000,
        "storage_quota_gb": 40,
        "data_retention_days": 365,
        "gross_margin_pct": 63.0,
    },
    "team": {
        "rate_limit_rpm": 1_200,
        "monthly_token_quota": 8_000_000,
        "storage_quota_gb": 250,
        "data_retention_days": 365,
        "gross_margin_pct": 68.0,
    },
    "enterprise": {
        "rate_limit_rpm": 3_000,
        "monthly_token_quota": 30_000_000,
        "storage_quota_gb": 1_200,
        "data_retention_days": 730,
        "gross_margin_pct": 74.0,
    },
}


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


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _extract_email_domain(email: str | None) -> str:
    clean = str(email or "").strip().lower()
    if "@" not in clean:
        return "unknown.local"
    _, _, domain = clean.rpartition("@")
    return domain or "unknown.local"


def _derive_org_name(domain: str) -> str:
    clean = str(domain or "").strip().lower()
    if not clean or clean == "unknown.local":
        return "Unknown Organisation"
    tokens = [token for token in clean.split(".") if token]
    if not tokens:
        return "Unknown Organisation"
    if len(tokens) >= 2:
        label = tokens[-2]
    else:
        label = tokens[0]
    return f"{label.replace('-', ' ').replace('_', ' ').title()} Organisation"


def _month_start(anchor: datetime, *, months_ago: int = 0) -> datetime:
    year = anchor.year
    month = anchor.month - max(0, int(months_ago))
    while month <= 0:
        year -= 1
        month += 12
    return datetime(year, month, 1, tzinfo=timezone.utc)


def _percent_change(current: float, previous: float) -> float:
    normalized_previous = float(previous)
    normalized_current = float(current)
    if normalized_previous <= 0:
        return 100.0 if normalized_current > 0 else 0.0
    return round(
        ((normalized_current - normalized_previous) / normalized_previous) * 100.0,
        2,
    )


def _resolve_plan(
    *,
    domain: str,
    member_count: int,
    project_count: int,
) -> str:
    if domain in PERSONAL_EMAIL_DOMAINS:
        return "individual"
    if member_count >= 15 or project_count >= 30:
        return "enterprise"
    if member_count >= 4 or project_count >= 6:
        return "team"
    return "growth"


def _workspace_token(workspace_id: str | None) -> str:
    clean = str(workspace_id or "").strip()
    if not clean or clean.lower() in {"none", "null", "undefined"}:
        return ""
    return clean


def _cost_to_revenue_ratio(plan: str) -> float:
    if plan == "individual":
        return 0.0
    if plan == "growth":
        return 1.6
    if plan == "team":
        return 1.9
    return 2.4


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


def list_admin_organisations(
    *,
    query: str = "",
    limit: int = 25,
    offset: int = 0,
) -> dict[str, object]:
    create_all_tables()
    now = _utcnow()
    month_current = _month_start(now, months_ago=0)
    month_previous = _month_start(now, months_ago=1)
    month_older = _month_start(now, months_ago=2)
    active_30d_threshold = now - timedelta(days=30)
    month_keys = [
        f"{month_older.year:04d}-{month_older.month:02d}",
        f"{month_previous.year:04d}-{month_previous.month:02d}",
        f"{month_current.year:04d}-{month_current.month:02d}",
    ]

    normalized_query = str(query or "").strip().lower()
    normalized_limit = max(1, min(200, int(limit)))
    normalized_offset = max(0, int(offset))

    with session_scope() as session:
        users = session.scalars(select(User)).all()
        projects = session.execute(
            select(Project.owner_user_id, Project.workspace_id)
        ).all()
        generation_rows = session.execute(
            select(
                Project.owner_user_id,
                GenerationJob.created_at,
                GenerationJob.estimated_input_tokens,
                GenerationJob.estimated_output_tokens_high,
                GenerationJob.estimated_cost_usd_high,
            ).join(Project, GenerationJob.project_id == Project.id)
        ).all()
        assets_rows = session.execute(
            select(DataLibraryAsset.owner_user_id, DataLibraryAsset.byte_size)
        ).all()
        work_rows = session.execute(select(Work.user_id, Work.provenance)).all()

    users_by_domain: dict[str, list[User]] = defaultdict(list)
    domain_by_user_id: dict[str, str] = {}
    for user in users:
        domain = _extract_email_domain(user.email)
        users_by_domain[domain].append(user)
        domain_by_user_id[user.id] = domain

    project_counts: dict[str, int] = defaultdict(int)
    workspace_ids: dict[str, set[str]] = defaultdict(set)
    for owner_user_id, workspace_id in projects:
        owner = str(owner_user_id or "").strip()
        if not owner or owner not in domain_by_user_id:
            continue
        domain = domain_by_user_id[owner]
        project_counts[domain] += 1
        workspace_token = _workspace_token(workspace_id)
        if workspace_token:
            workspace_ids[domain].add(workspace_token)

    usage_current_tokens: dict[str, int] = defaultdict(int)
    usage_previous_tokens: dict[str, int] = defaultdict(int)
    usage_current_tool_calls: dict[str, int] = defaultdict(int)
    cost_current_usd: dict[str, float] = defaultdict(float)
    cost_previous_usd: dict[str, float] = defaultdict(float)
    usage_by_month: dict[str, dict[str, dict[str, float | int]]] = defaultdict(
        lambda: {
            month_key: {"tokens": 0, "tool_calls": 0, "cost_usd": 0.0}
            for month_key in month_keys
        }
    )
    for owner_user_id, created_at, input_tokens, output_tokens_high, cost_usd in generation_rows:
        owner = str(owner_user_id or "").strip()
        if not owner or owner not in domain_by_user_id:
            continue
        domain = domain_by_user_id[owner]
        created = _coerce_utc(created_at)
        if created is None:
            continue

        token_count = int(max(0, int(input_tokens or 0)) + max(0, int(output_tokens_high or 0)))
        job_cost = max(0.0, float(cost_usd or 0.0))
        month_key = f"{created.year:04d}-{created.month:02d}"
        if month_key in usage_by_month[domain]:
            month_bucket = usage_by_month[domain][month_key]
            month_bucket["tokens"] = int(month_bucket["tokens"]) + token_count
            month_bucket["tool_calls"] = int(month_bucket["tool_calls"]) + 1
            month_bucket["cost_usd"] = float(month_bucket["cost_usd"]) + job_cost

        if created >= month_current:
            usage_current_tokens[domain] += token_count
            usage_current_tool_calls[domain] += 1
            cost_current_usd[domain] += job_cost
        elif created >= month_previous:
            usage_previous_tokens[domain] += token_count
            cost_previous_usd[domain] += job_cost

    storage_bytes: dict[str, int] = defaultdict(int)
    for owner_user_id, byte_size in assets_rows:
        owner = str(owner_user_id or "").strip()
        if not owner or owner not in domain_by_user_id:
            continue
        domain = domain_by_user_id[owner]
        storage_bytes[domain] += max(0, int(byte_size or 0))

    provenances_by_user: dict[str, set[str]] = defaultdict(set)
    for user_id, provenance in work_rows:
        clean_user_id = str(user_id or "").strip()
        if not clean_user_id or clean_user_id not in domain_by_user_id:
            continue
        clean_provenance = str(provenance or "").strip().lower()
        if clean_provenance:
            provenances_by_user[clean_user_id].add(clean_provenance)

    items: list[dict[str, object]] = []
    for domain, domain_users in users_by_domain.items():
        member_count = len(domain_users)
        admin_count = sum(
            1 for user in domain_users if str(user.role or "").strip().lower() == "admin"
        )
        active_members_30d = sum(
            1
            for user in domain_users
            if (
                _coerce_utc(user.last_sign_in_at) is not None
                and _coerce_utc(user.last_sign_in_at) >= active_30d_threshold
            )
        )
        last_active_at = max(
            (
                _coerce_utc(user.last_sign_in_at)
                for user in domain_users
                if _coerce_utc(user.last_sign_in_at) is not None
            ),
            default=None,
        )

        current_tokens = int(usage_current_tokens.get(domain, 0))
        previous_tokens = int(usage_previous_tokens.get(domain, 0))
        current_cost = round(float(cost_current_usd.get(domain, 0.0)), 4)
        previous_cost = round(float(cost_previous_usd.get(domain, 0.0)), 4)
        project_count = int(project_counts.get(domain, 0))
        workspace_count = len(workspace_ids.get(domain, set()))
        plan = _resolve_plan(
            domain=domain,
            member_count=member_count,
            project_count=project_count,
        )
        limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["growth"])
        openalex_connected_members = sum(
            1
            for user in domain_users
            if "openalex" in provenances_by_user.get(user.id, set())
        )
        orcid_connected_members = sum(
            1 for user in domain_users if str(user.orcid_id or "").strip()
        )
        orcid_last_sync_at = max(
            (
                _coerce_utc(user.orcid_last_synced_at)
                for user in domain_users
                if _coerce_utc(user.orcid_last_synced_at) is not None
            ),
            default=None,
        )
        has_orcid = orcid_connected_members > 0
        has_openalex = openalex_connected_members > 0

        feature_flags = [
            "admin_console_v2",
            "org_usage_dashboard",
            "workspace_projects",
            "quota_enforcement",
        ]
        if admin_count > 0:
            feature_flags.append("rbac_controls")
        if has_orcid:
            feature_flags.append("orcid_integration")
        if has_openalex:
            feature_flags.append("openalex_enrichment")
        if current_tokens > 0:
            feature_flags.append("usage_metering")
        if storage_bytes.get(domain, 0) > 0:
            feature_flags.append("data_library")

        monthly_usage_trend: list[dict[str, object]] = []
        for month_key in month_keys:
            month_usage = usage_by_month[domain][month_key]
            monthly_usage_trend.append(
                {
                    "month": month_key,
                    "tokens": int(month_usage["tokens"]),
                    "tool_calls": int(month_usage["tool_calls"]),
                    "cost_usd": round(float(month_usage["cost_usd"]), 4),
                }
            )

        cost_to_revenue_ratio = _cost_to_revenue_ratio(plan)
        estimated_revenue = current_cost * cost_to_revenue_ratio
        gross_margin_pct = 0.0
        if estimated_revenue > 0:
            gross_margin_pct = round(
                ((estimated_revenue - current_cost) / estimated_revenue) * 100.0,
                2,
            )
        elif current_cost <= 0:
            gross_margin_pct = float(limits["gross_margin_pct"])

        item = {
            "id": f"org-{domain}",
            "name": _derive_org_name(domain),
            "domain": domain,
            "plan": plan,
            "billing_status": "trial" if plan == "individual" else "active",
            "member_count": member_count,
            "admin_count": admin_count,
            "active_members_30d": active_members_30d,
            "last_active_at": last_active_at,
            "workspace_count": workspace_count,
            "project_count": project_count,
            "usage_tokens_current_month": current_tokens,
            "usage_tokens_previous_month": previous_tokens,
            "usage_tokens_trend_pct": _percent_change(current_tokens, previous_tokens),
            "usage_tool_calls_current_month": int(
                usage_current_tool_calls.get(domain, 0)
            ),
            "storage_bytes_current": int(storage_bytes.get(domain, 0)),
            "cost_usd_current_month": current_cost,
            "cost_usd_previous_month": previous_cost,
            "cost_trend_pct": _percent_change(current_cost, previous_cost),
            "gross_margin_pct": gross_margin_pct,
            "feature_flags_enabled": sorted(feature_flags),
            "rate_limit_rpm": int(limits["rate_limit_rpm"]),
            "monthly_token_quota": int(limits["monthly_token_quota"]),
            "storage_quota_gb": int(limits["storage_quota_gb"]),
            "data_retention_days": int(limits["data_retention_days"]),
            "integrations": [
                {
                    "key": "orcid",
                    "status": "connected" if has_orcid else "not_configured",
                    "connected_members": orcid_connected_members,
                    "last_sync_at": orcid_last_sync_at,
                    "detail": "ORCID profile linkage and work import telemetry.",
                },
                {
                    "key": "openalex",
                    "status": "connected" if has_openalex else "degraded",
                    "connected_members": openalex_connected_members,
                    "last_sync_at": None,
                    "detail": "OpenAlex enrichment observed from publication provenance.",
                },
                {
                    "key": "zotero",
                    "status": "not_configured",
                    "connected_members": 0,
                    "last_sync_at": None,
                    "detail": "Zotero connector is scaffolded and pending rollout.",
                },
            ],
            "monthly_usage_trend": monthly_usage_trend,
            "impersonation": {
                "available": True,
                "audited": True,
                "last_event_at": None,
                "note": "Internal-only control. All impersonation events must be audited.",
            },
        }
        if normalized_query:
            searchable = " ".join(
                [
                    str(item["domain"]),
                    str(item["name"]),
                    str(item["plan"]),
                    str(item["billing_status"]),
                ]
            ).lower()
            if normalized_query not in searchable:
                continue
        items.append(item)

    items.sort(
        key=lambda item: (
            -int(item["member_count"]),
            -int(item["active_members_30d"]),
            str(item["domain"]),
        )
    )
    total = len(items)
    paged_items = items[normalized_offset : normalized_offset + normalized_limit]

    return {
        "items": paged_items,
        "total": total,
        "limit": normalized_limit,
        "offset": normalized_offset,
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

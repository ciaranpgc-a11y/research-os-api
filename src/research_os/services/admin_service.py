from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import func, or_, select

from research_os.db import (
    AdminAuditEvent,
    DataLibraryAsset,
    GenerationJob,
    Manuscript,
    ManuscriptSnapshot,
    Project,
    User,
    Work,
    create_all_tables,
    session_scope,
)
from research_os.services.generation_job_service import (
    GenerationJobConflictError,
    GenerationJobStateError,
    enqueue_generation_job,
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

ADMIN_JOB_ACTIVE_STATUSES = {"queued", "running", "cancel_requested"}
ADMIN_JOB_RETRYABLE_STATUSES = {"failed", "cancelled"}
ADMIN_JOB_TERMINAL_STATUSES = {"completed", "failed", "cancelled"}


class AdminNotFoundError(RuntimeError):
    """Raised when an admin-targeted object cannot be located."""


class AdminStateError(RuntimeError):
    """Raised when an admin action cannot be executed in the current state."""


class AdminValidationError(RuntimeError):
    """Raised when admin action input is invalid."""


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


def _workspace_display_name(workspace_id: str) -> str:
    clean = _workspace_token(workspace_id)
    if not clean:
        return "Unassigned Workspace"
    parts = [part for part in clean.replace("_", "-").split("-") if part]
    if not parts:
        return clean
    return " ".join(part.capitalize() for part in parts)


def _normalize_user_ids(raw_ids: object) -> list[str]:
    if not isinstance(raw_ids, list):
        return []
    values: list[str] = []
    for raw in raw_ids:
        clean = str(raw or "").strip()
        if not clean:
            continue
        if clean not in values:
            values.append(clean)
    return values


def _max_timestamp(
    current: datetime | None,
    candidate: datetime | None,
) -> datetime | None:
    if candidate is None:
        return current
    if current is None:
        return candidate
    return candidate if candidate > current else current


def _cost_to_revenue_ratio(plan: str) -> float:
    if plan == "individual":
        return 0.0
    if plan == "growth":
        return 1.6
    if plan == "team":
        return 1.9
    return 2.4


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _serialize_admin_audit_event(
    event: AdminAuditEvent,
    actor_name: str,
    actor_email: str,
) -> dict[str, object]:
    metadata = event.metadata_json if isinstance(event.metadata_json, dict) else {}
    return {
        "id": event.id,
        "action": event.action,
        "target_type": event.target_type,
        "target_id": event.target_id,
        "status": event.status,
        "actor_user_id": event.actor_user_id,
        "actor_name": actor_name,
        "actor_email": actor_email,
        "metadata": metadata,
        "created_at": event.created_at,
    }


def _record_admin_audit_event(
    *,
    actor_user_id: str | None,
    action: str,
    target_type: str,
    target_id: str,
    status: str = "success",
    metadata: dict[str, object] | None = None,
) -> dict[str, object]:
    create_all_tables()
    clean_actor_user_id = str(actor_user_id or "").strip() or None
    clean_action = str(action or "").strip()[:96]
    clean_target_type = str(target_type or "").strip()[:64]
    clean_target_id = str(target_id or "").strip()[:128]
    clean_status = str(status or "").strip()[:24] or "success"
    clean_metadata = metadata if isinstance(metadata, dict) else {}

    with session_scope() as session:
        actor_name = "System"
        actor_email = ""
        if clean_actor_user_id:
            actor = session.get(User, clean_actor_user_id)
            if actor is not None:
                actor_name = str(actor.name or "").strip() or "Unknown user"
                actor_email = str(actor.email or "").strip()
        event = AdminAuditEvent(
            actor_user_id=clean_actor_user_id,
            action=clean_action,
            target_type=clean_target_type,
            target_id=clean_target_id,
            status=clean_status,
            metadata_json=clean_metadata,
        )
        session.add(event)
        session.flush()
        payload = _serialize_admin_audit_event(
            event,
            actor_name=actor_name,
            actor_email=actor_email,
        )
    return payload


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
        user_rows = session.execute(
            select(
                User.id,
                User.email,
                User.role,
                User.last_sign_in_at,
                User.orcid_id,
                User.orcid_last_synced_at,
            )
        ).all()
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

    users_by_domain: dict[str, list[dict[str, object]]] = defaultdict(list)
    domain_by_user_id: dict[str, str] = {}
    for (
        user_id,
        email,
        role,
        last_sign_in_at,
        orcid_id,
        orcid_last_synced_at,
    ) in user_rows:
        user_data = {
            "id": str(user_id or "").strip(),
            "email": str(email or "").strip(),
            "role": str(role or "").strip().lower(),
            "last_sign_in_at": _coerce_utc(last_sign_in_at),
            "orcid_id": str(orcid_id or "").strip(),
            "orcid_last_synced_at": _coerce_utc(orcid_last_synced_at),
        }
        if not user_data["id"]:
            continue
        domain = _extract_email_domain(user_data["email"])
        users_by_domain[domain].append(user_data)
        domain_by_user_id[str(user_data["id"])] = domain

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
            1 for user in domain_users if str(user["role"]) == "admin"
        )
        active_members_30d = sum(
            1
            for user in domain_users
            if (
                user["last_sign_in_at"] is not None
                and user["last_sign_in_at"] >= active_30d_threshold
            )
        )
        last_active_at = max(
            (
                user["last_sign_in_at"]
                for user in domain_users
                if user["last_sign_in_at"] is not None
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
            if "openalex" in provenances_by_user.get(str(user["id"]), set())
        )
        orcid_connected_members = sum(
            1 for user in domain_users if str(user["orcid_id"])
        )
        orcid_last_sync_at = max(
            (
                user["orcid_last_synced_at"]
                for user in domain_users
                if user["orcid_last_synced_at"] is not None
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


def list_admin_workspaces(
    *,
    query: str = "",
    limit: int = 50,
    offset: int = 0,
) -> dict[str, object]:
    create_all_tables()
    now = _utcnow()
    active_30d_threshold = now - timedelta(days=30)
    recent_7d_threshold = now - timedelta(days=7)
    normalized_query = str(query or "").strip().lower()
    normalized_limit = max(1, min(200, int(limit)))
    normalized_offset = max(0, int(offset))

    with session_scope() as session:
        user_rows = session.execute(
            select(
                User.id,
                User.name,
                User.email,
                User.role,
                User.last_sign_in_at,
            )
        ).all()
        project_rows = session.execute(
            select(
                Project.id,
                Project.title,
                Project.workspace_id,
                Project.owner_user_id,
                Project.collaborator_user_ids,
                Project.created_at,
                Project.updated_at,
            )
        ).all()
        manuscript_rows = session.execute(
            select(
                Manuscript.id,
                Manuscript.project_id,
                Manuscript.created_at,
                Manuscript.updated_at,
            )
        ).all()
        asset_rows = session.execute(
            select(
                DataLibraryAsset.id,
                DataLibraryAsset.project_id,
                DataLibraryAsset.byte_size,
                DataLibraryAsset.uploaded_at,
            )
        ).all()
        snapshot_rows = session.execute(
            select(
                ManuscriptSnapshot.id,
                ManuscriptSnapshot.project_id,
                ManuscriptSnapshot.created_at,
            )
        ).all()
        job_rows = session.execute(
            select(
                GenerationJob.id,
                GenerationJob.project_id,
                GenerationJob.status,
                GenerationJob.run_count,
                GenerationJob.parent_job_id,
                GenerationJob.estimated_input_tokens,
                GenerationJob.estimated_output_tokens_high,
                GenerationJob.estimated_cost_usd_high,
                GenerationJob.created_at,
                GenerationJob.completed_at,
                GenerationJob.updated_at,
            )
        ).all()

    users_by_id: dict[str, dict[str, object]] = {}
    for user_id, name, email, role, last_sign_in_at in user_rows:
        clean_user_id = str(user_id or "").strip()
        if not clean_user_id:
            continue
        normalized_role = str(role or "").strip().lower()
        if normalized_role not in {"user", "admin"}:
            normalized_role = "user"
        users_by_id[clean_user_id] = {
            "id": clean_user_id,
            "name": str(name or "").strip() or "Unknown user",
            "email": str(email or "").strip(),
            "role": normalized_role,
            "last_sign_in_at": _coerce_utc(last_sign_in_at),
        }

    project_by_id: dict[str, dict[str, object]] = {}
    workspace_by_project_id: dict[str, str] = {}
    workspace_data: dict[str, dict[str, object]] = {}

    def ensure_workspace(workspace_key: str) -> dict[str, object]:
        existing = workspace_data.get(workspace_key)
        if existing is not None:
            return existing
        created = {
            "id": workspace_key,
            "display_name": _workspace_display_name(workspace_key),
            "owner_votes": defaultdict(int),
            "member_ids": set(),
            "project_ids": set(),
            "project_collaborator_slots": 0,
            "project_count": 0,
            "manuscript_count": 0,
            "data_sources_count": 0,
            "storage_bytes": 0,
            "export_history_count": 0,
            "job_total_runs": 0,
            "job_status_counts": defaultdict(int),
            "job_failed_runs_7d": 0,
            "job_retry_runs_7d": 0,
            "job_token_total": 0,
            "job_cost_total_usd": 0.0,
            "last_job_at": None,
            "last_activity_at": None,
            "project_snippets": [],
        }
        workspace_data[workspace_key] = created
        return created

    manuscript_counts_by_project: dict[str, int] = defaultdict(int)
    asset_counts_by_project: dict[str, int] = defaultdict(int)
    asset_bytes_by_project: dict[str, int] = defaultdict(int)
    job_counts_by_project: dict[str, int] = defaultdict(int)
    snapshot_counts_by_project: dict[str, int] = defaultdict(int)
    latest_status_by_project: dict[str, str] = {}
    latest_status_time_by_project: dict[str, datetime] = {}
    project_last_activity: dict[str, datetime | None] = defaultdict(lambda: None)

    for (
        project_id,
        title,
        workspace_id,
        owner_user_id,
        collaborator_user_ids,
        created_at,
        updated_at,
    ) in project_rows:
        clean_project_id = str(project_id or "").strip()
        if not clean_project_id:
            continue
        workspace_key = _workspace_token(str(workspace_id or "").strip()) or "unassigned"
        workspace = ensure_workspace(workspace_key)
        workspace["project_ids"].add(clean_project_id)
        workspace["project_count"] = int(workspace["project_count"]) + 1

        clean_owner_id = str(owner_user_id or "").strip()
        collaborators = _normalize_user_ids(collaborator_user_ids)
        workspace["project_collaborator_slots"] = int(
            workspace["project_collaborator_slots"]
        ) + len(collaborators)

        if clean_owner_id:
            workspace["owner_votes"][clean_owner_id] += 1
            workspace["member_ids"].add(clean_owner_id)
        for collaborator_id in collaborators:
            workspace["member_ids"].add(collaborator_id)

        created_utc = _coerce_utc(created_at)
        updated_utc = _coerce_utc(updated_at)
        project_activity = _max_timestamp(updated_utc, created_utc)
        workspace["last_activity_at"] = _max_timestamp(
            workspace["last_activity_at"], project_activity
        )
        project_last_activity[clean_project_id] = _max_timestamp(
            project_last_activity[clean_project_id], project_activity
        )

        project_by_id[clean_project_id] = {
            "id": clean_project_id,
            "title": str(title or "").strip() or "Untitled project",
            "workspace_id": workspace_key,
            "owner_user_id": clean_owner_id,
            "collaborator_count": len(collaborators),
        }
        workspace_by_project_id[clean_project_id] = workspace_key

    for _, project_id, created_at, updated_at in manuscript_rows:
        clean_project_id = str(project_id or "").strip()
        workspace_key = workspace_by_project_id.get(clean_project_id)
        if not workspace_key:
            continue
        workspace = ensure_workspace(workspace_key)
        workspace["manuscript_count"] = int(workspace["manuscript_count"]) + 1
        manuscript_counts_by_project[clean_project_id] += 1
        manuscript_activity = _max_timestamp(_coerce_utc(updated_at), _coerce_utc(created_at))
        workspace["last_activity_at"] = _max_timestamp(
            workspace["last_activity_at"], manuscript_activity
        )
        project_last_activity[clean_project_id] = _max_timestamp(
            project_last_activity[clean_project_id], manuscript_activity
        )

    for _, project_id, byte_size, uploaded_at in asset_rows:
        clean_project_id = str(project_id or "").strip()
        workspace_key = workspace_by_project_id.get(clean_project_id)
        if not workspace_key:
            continue
        workspace = ensure_workspace(workspace_key)
        workspace["data_sources_count"] = int(workspace["data_sources_count"]) + 1
        workspace["storage_bytes"] = int(workspace["storage_bytes"]) + max(
            0, int(byte_size or 0)
        )
        asset_counts_by_project[clean_project_id] += 1
        asset_bytes_by_project[clean_project_id] += max(0, int(byte_size or 0))
        uploaded_utc = _coerce_utc(uploaded_at)
        workspace["last_activity_at"] = _max_timestamp(
            workspace["last_activity_at"], uploaded_utc
        )
        project_last_activity[clean_project_id] = _max_timestamp(
            project_last_activity[clean_project_id], uploaded_utc
        )

    for _, project_id, created_at in snapshot_rows:
        clean_project_id = str(project_id or "").strip()
        workspace_key = workspace_by_project_id.get(clean_project_id)
        if not workspace_key:
            continue
        workspace = ensure_workspace(workspace_key)
        workspace["export_history_count"] = int(workspace["export_history_count"]) + 1
        snapshot_counts_by_project[clean_project_id] += 1
        created_utc = _coerce_utc(created_at)
        workspace["last_activity_at"] = _max_timestamp(
            workspace["last_activity_at"], created_utc
        )
        project_last_activity[clean_project_id] = _max_timestamp(
            project_last_activity[clean_project_id], created_utc
        )

    for (
        _,
        project_id,
        status,
        run_count,
        parent_job_id,
        input_tokens,
        output_tokens,
        cost_usd,
        created_at,
        completed_at,
        updated_at,
    ) in job_rows:
        clean_project_id = str(project_id or "").strip()
        workspace_key = workspace_by_project_id.get(clean_project_id)
        if not workspace_key:
            continue
        workspace = ensure_workspace(workspace_key)
        normalized_status = str(status or "").strip().lower() or "unknown"
        workspace["job_total_runs"] = int(workspace["job_total_runs"]) + 1
        workspace["job_status_counts"][normalized_status] += 1
        job_counts_by_project[clean_project_id] += 1

        created_utc = _coerce_utc(created_at)
        completed_utc = _coerce_utc(completed_at)
        updated_utc = _coerce_utc(updated_at)
        latest_job_event = _max_timestamp(
            completed_utc,
            _max_timestamp(updated_utc, created_utc),
        )
        workspace["last_job_at"] = _max_timestamp(
            workspace["last_job_at"], latest_job_event
        )
        workspace["last_activity_at"] = _max_timestamp(
            workspace["last_activity_at"], latest_job_event
        )
        project_last_activity[clean_project_id] = _max_timestamp(
            project_last_activity[clean_project_id], latest_job_event
        )

        if created_utc and created_utc >= recent_7d_threshold:
            if normalized_status == "failed":
                workspace["job_failed_runs_7d"] = int(
                    workspace["job_failed_runs_7d"]
                ) + 1
            if int(run_count or 0) > 1 or str(parent_job_id or "").strip():
                workspace["job_retry_runs_7d"] = int(
                    workspace["job_retry_runs_7d"]
                ) + 1

        token_count = int(max(0, int(input_tokens or 0)) + max(0, int(output_tokens or 0)))
        workspace["job_token_total"] = int(workspace["job_token_total"]) + token_count
        workspace["job_cost_total_usd"] = float(workspace["job_cost_total_usd"]) + max(
            0.0, float(cost_usd or 0.0)
        )

        if latest_job_event is not None:
            previous_time = latest_status_time_by_project.get(clean_project_id)
            if previous_time is None or latest_job_event >= previous_time:
                latest_status_time_by_project[clean_project_id] = latest_job_event
                latest_status_by_project[clean_project_id] = normalized_status

    items: list[dict[str, object]] = []
    for workspace_id, data in workspace_data.items():
        project_ids = sorted(data["project_ids"])
        if not project_ids:
            continue

        owner_user_id: str | None = None
        owner_votes = data["owner_votes"]
        if owner_votes:
            owner_user_id = max(
                owner_votes.items(),
                key=lambda item: (int(item[1]), item[0]),
            )[0]
        elif data["member_ids"]:
            owner_user_id = sorted(data["member_ids"])[0]

        owner_payload = users_by_id.get(owner_user_id or "", {})
        owner_name = str(owner_payload.get("name") or "Unknown owner")
        owner_email = str(owner_payload.get("email") or "")

        member_rows: list[dict[str, object]] = []
        active_members_30d = 0
        for member_id in sorted(data["member_ids"]):
            member = users_by_id.get(member_id)
            if member is None:
                continue
            last_active_at = member["last_sign_in_at"]
            if last_active_at and last_active_at >= active_30d_threshold:
                active_members_30d += 1
            workspace_role = "collaborator"
            if owner_user_id and member_id == owner_user_id:
                workspace_role = "owner"
            elif member["role"] == "admin":
                workspace_role = "admin"
            member_rows.append(
                {
                    "id": member_id,
                    "name": member["name"],
                    "email": member["email"],
                    "platform_role": member["role"],
                    "workspace_role": workspace_role,
                    "last_active_at": last_active_at,
                }
            )

        project_snippets: list[dict[str, object]] = []
        for project_id in project_ids:
            project = project_by_id.get(project_id)
            if project is None:
                continue
            project_owner = users_by_id.get(str(project["owner_user_id"]), {})
            project_snippets.append(
                {
                    "id": project_id,
                    "title": project["title"],
                    "owner_user_id": project["owner_user_id"] or None,
                    "owner_name": str(project_owner.get("name") or "Unknown owner"),
                    "collaborator_count": int(project["collaborator_count"]),
                    "manuscript_count": int(manuscript_counts_by_project.get(project_id, 0)),
                    "data_sources_count": int(asset_counts_by_project.get(project_id, 0)),
                    "job_runs": int(job_counts_by_project.get(project_id, 0)),
                    "last_run_status": latest_status_by_project.get(project_id, "not_run"),
                    "last_activity_at": project_last_activity.get(project_id),
                }
            )
        project_snippets.sort(
            key=lambda item: item["last_activity_at"]
            or datetime(1970, 1, 1, tzinfo=timezone.utc),
            reverse=True,
        )

        member_count = len(member_rows)
        project_count = int(data["project_count"])
        collaborator_slots = int(data["project_collaborator_slots"])
        potential_slots = max(1, project_count * max(1, member_count - 1))
        collaboration_density_pct = round(
            min(100.0, (collaborator_slots / potential_slots) * 100.0),
            2,
        )

        job_total_runs = int(data["job_total_runs"])
        status_counts = data["job_status_counts"]
        active_runs = int(status_counts.get("queued", 0)) + int(
            status_counts.get("running", 0)
        )
        avg_tokens_per_run = 0
        avg_cost_usd_per_run = 0.0
        if job_total_runs > 0:
            avg_tokens_per_run = int(int(data["job_token_total"]) / job_total_runs)
            avg_cost_usd_per_run = round(
                float(data["job_cost_total_usd"]) / job_total_runs,
                4,
            )

        item = {
            "id": workspace_id,
            "display_name": data["display_name"],
            "owner_user_id": owner_user_id,
            "owner_name": owner_name,
            "owner_email": owner_email,
            "member_count": member_count,
            "active_members_30d": active_members_30d,
            "project_count": project_count,
            "manuscript_count": int(data["manuscript_count"]),
            "data_sources_count": int(data["data_sources_count"]),
            "storage_bytes": int(data["storage_bytes"]),
            "export_history_count": int(data["export_history_count"]),
            "collaboration_density_pct": collaboration_density_pct,
            "last_activity_at": data["last_activity_at"],
            "members": member_rows,
            "projects": project_snippets[:8],
            "job_health": {
                "total_runs": job_total_runs,
                "active_runs": active_runs,
                "queued_runs": int(status_counts.get("queued", 0)),
                "running_runs": int(status_counts.get("running", 0)),
                "completed_runs": int(status_counts.get("completed", 0)),
                "failed_runs": int(status_counts.get("failed", 0)),
                "cancelled_runs": int(status_counts.get("cancelled", 0)),
                "retry_runs_7d": int(data["job_retry_runs_7d"]),
                "failed_runs_7d": int(data["job_failed_runs_7d"]),
                "avg_tokens_per_run": avg_tokens_per_run,
                "avg_cost_usd_per_run": avg_cost_usd_per_run,
                "last_job_at": data["last_job_at"],
            },
        }
        if normalized_query:
            searchable = " ".join(
                [
                    str(item["id"]),
                    str(item["display_name"]),
                    str(item["owner_name"]),
                    str(item["owner_email"]),
                    " ".join(str(project["title"]) for project in item["projects"]),
                ]
            ).lower()
            if normalized_query not in searchable:
                continue
        items.append(item)

    items.sort(
        key=lambda item: (
            -int(item["project_count"]),
            -int(item["member_count"]),
            str(item["id"]),
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

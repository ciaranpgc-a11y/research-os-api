from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import shutil
import traceback
from typing import Any
from uuid import uuid4

from sqlalchemy import func, or_, select

from research_os.db import (
    AdminAuditEvent,
    DataLibraryAsset,
    GenerationJob,
    JournalProfile,
    Manuscript,
    ManuscriptSnapshot,
    PublicationFile,
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
from research_os.services.publication_metrics_service import (
    compute_publication_top_metrics,
    enqueue_publication_top_metrics_refresh,
)
from research_os.services.journal_csv_import_service import (
    import_journal_profiles_from_csv_bytes,
)
from research_os.services.publications_analytics_service import (
    compute_publications_analytics,
    enqueue_publications_analytics_recompute,
)
from research_os.services.publications_sync_scheduler_service import (
    get_publications_auto_sync_runtime_settings,
    trigger_publications_auto_sync_for_all_users,
    update_publications_auto_sync_runtime_settings,
)
from research_os.services.collaboration_service import (
    trigger_collaboration_metrics_recompute,
)
from research_os.services.api_telemetry_service import summarize_api_usage_for_admin

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


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_admin_user(user: User) -> dict[str, object]:
    role = str(user.role or "").strip().lower()
    if role not in {"user", "admin"}:
        role = "user"
    return {
        "id": user.id,
        "account_key": user.account_key,
        "email": user.email,
        "name": user.name,
        "is_active": bool(user.is_active),
        "role": role,
        "email_verified_at": user.email_verified_at,
        "last_sign_in_at": user.last_sign_in_at,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


def _count_owned_assets(*, session, user_id: str) -> int:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return 0
    return int(
        session.scalar(
            select(func.count())
            .select_from(DataLibraryAsset)
            .where(DataLibraryAsset.owner_user_id == clean_user_id)
        )
        or 0
    )


def _count_owned_personal_assets(*, session, user_id: str) -> int:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return 0
    return int(
        session.scalar(
            select(func.count())
            .select_from(DataLibraryAsset)
            .where(
                DataLibraryAsset.owner_user_id == clean_user_id,
                DataLibraryAsset.project_id.is_(None),
            )
        )
        or 0
    )


def _count_owned_project_assets(*, session, user_id: str) -> int:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return 0
    return int(
        session.scalar(
            select(func.count())
            .select_from(DataLibraryAsset)
            .where(
                DataLibraryAsset.owner_user_id == clean_user_id,
                DataLibraryAsset.project_id.is_not(None),
            )
        )
        or 0
    )


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
        impersonation_rows = session.execute(
            select(AdminAuditEvent.target_id, AdminAuditEvent.created_at).where(
                AdminAuditEvent.action == "admin_org_impersonation_start",
                AdminAuditEvent.target_type == "organisation",
            )
        ).all()

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

    impersonation_last_event_by_org_id: dict[str, datetime] = {}
    for target_id, created_at in impersonation_rows:
        clean_target_id = str(target_id or "").strip()
        created_utc = _coerce_utc(created_at)
        if not clean_target_id or created_utc is None:
            continue
        current_last = impersonation_last_event_by_org_id.get(clean_target_id)
        if current_last is None or created_utc > current_last:
            impersonation_last_event_by_org_id[clean_target_id] = created_utc

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
                "last_event_at": impersonation_last_event_by_org_id.get(
                    f"org-{domain}"
                ),
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


def get_admin_usage_costs(*, query: str = "") -> dict[str, object]:
    create_all_tables()
    now = _utcnow()
    month_current = _month_start(now, months_ago=0)
    month_previous = _month_start(now, months_ago=1)
    trend_months = [_month_start(now, months_ago=index) for index in range(5, -1, -1)]
    trend_keys = [f"{item.year:04d}-{item.month:02d}" for item in trend_months]
    normalized_query = str(query or "").strip().lower()

    with session_scope() as session:
        user_rows = session.execute(select(User.id, User.name, User.email)).all()
        project_rows = session.execute(select(Project.id, Project.owner_user_id)).all()
        job_rows = session.execute(
            select(
                GenerationJob.project_id,
                GenerationJob.pricing_model,
                GenerationJob.estimated_input_tokens,
                GenerationJob.estimated_output_tokens_high,
                GenerationJob.estimated_cost_usd_high,
                GenerationJob.status,
                GenerationJob.run_count,
                GenerationJob.created_at,
            )
        ).all()
        asset_rows = session.execute(
            select(
                DataLibraryAsset.owner_user_id,
                DataLibraryAsset.byte_size,
                DataLibraryAsset.uploaded_at,
            )
        ).all()
        snapshot_rows = session.execute(
            select(ManuscriptSnapshot.project_id, ManuscriptSnapshot.created_at)
        ).all()

    domain_by_user_id: dict[str, str] = {}
    user_by_id: dict[str, dict[str, str]] = {}
    for user_id, name, email in user_rows:
        clean_user_id = str(user_id or "").strip()
        if not clean_user_id:
            continue
        clean_email = str(email or "").strip()
        domain_by_user_id[clean_user_id] = _extract_email_domain(clean_email)
        user_by_id[clean_user_id] = {
            "name": str(name or "").strip() or clean_email or clean_user_id,
            "email": clean_email,
        }

    owner_by_project_id: dict[str, str] = {}
    for project_id, owner_user_id in project_rows:
        clean_project_id = str(project_id or "").strip()
        if clean_project_id:
            owner_by_project_id[clean_project_id] = str(owner_user_id or "").strip()

    model_usage: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {"tokens": 0, "cost_usd": 0.0, "tool_calls": 0}
    )
    org_usage: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {
            "tokens": 0,
            "cost_usd": 0.0,
            "tool_calls": 0,
            "storage_bytes": 0,
            "previous_tokens": 0,
            "previous_cost_usd": 0.0,
        }
    )
    user_usage: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {"tokens": 0, "cost_usd": 0.0, "tool_calls": 0, "storage_bytes": 0}
    )
    trend_usage: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {"tokens": 0, "cost_usd": 0.0, "tool_calls": 0}
    )

    month_jobs = 0
    month_tokens = 0
    month_cost = 0.0
    month_calls = 0
    month_chain_length = 0.0
    month_cancel_requested = 0
    month_failed = 0
    month_running = 0

    for (
        project_id,
        pricing_model,
        estimated_input_tokens,
        estimated_output_tokens_high,
        estimated_cost_usd_high,
        status,
        run_count,
        created_at,
    ) in job_rows:
        created_utc = _coerce_utc(created_at)
        if created_utc is None:
            continue
        owner_user_id = owner_by_project_id.get(str(project_id or "").strip(), "")
        domain = domain_by_user_id.get(owner_user_id, "unknown.local")
        model_name = str(pricing_model or "").strip() or "unknown-model"
        job_status = str(status or "").strip().lower()
        tokens = int(max(0, int(estimated_input_tokens or 0)) + max(0, int(estimated_output_tokens_high or 0)))
        cost_usd = max(0.0, _safe_float(estimated_cost_usd_high))
        month_key = f"{created_utc.year:04d}-{created_utc.month:02d}"
        if month_key in trend_keys:
            trend_bucket = trend_usage[month_key]
            trend_bucket["tokens"] = int(trend_bucket["tokens"]) + tokens
            trend_bucket["tool_calls"] = int(trend_bucket["tool_calls"]) + 1
            trend_bucket["cost_usd"] = _safe_float(trend_bucket["cost_usd"]) + cost_usd

        if created_utc >= month_current:
            month_jobs += 1
            month_tokens += tokens
            month_cost += cost_usd
            month_calls += 1
            month_chain_length += max(1.0, _safe_float(run_count))
            if job_status == "cancel_requested":
                month_cancel_requested += 1
            if job_status == "failed":
                month_failed += 1
            if job_status == "running":
                month_running += 1

            model_bucket = model_usage[model_name]
            model_bucket["tokens"] = int(model_bucket["tokens"]) + tokens
            model_bucket["tool_calls"] = int(model_bucket["tool_calls"]) + 1
            model_bucket["cost_usd"] = _safe_float(model_bucket["cost_usd"]) + cost_usd

            org_bucket = org_usage[domain]
            org_bucket["tokens"] = int(org_bucket["tokens"]) + tokens
            org_bucket["tool_calls"] = int(org_bucket["tool_calls"]) + 1
            org_bucket["cost_usd"] = _safe_float(org_bucket["cost_usd"]) + cost_usd
            if owner_user_id:
                user_bucket = user_usage[owner_user_id]
                user_bucket["tokens"] = int(user_bucket["tokens"]) + tokens
                user_bucket["tool_calls"] = int(user_bucket["tool_calls"]) + 1
                user_bucket["cost_usd"] = _safe_float(user_bucket["cost_usd"]) + cost_usd
        elif created_utc >= month_previous:
            org_bucket = org_usage[domain]
            org_bucket["previous_tokens"] = int(org_bucket["previous_tokens"]) + tokens
            org_bucket["previous_cost_usd"] = _safe_float(org_bucket["previous_cost_usd"]) + cost_usd

    storage_total = 0
    current_month_uploads = 0
    for owner_user_id, byte_size, uploaded_at in asset_rows:
        owner_id = str(owner_user_id or "").strip()
        domain = domain_by_user_id.get(owner_id, "unknown.local")
        bytes_value = max(0, int(byte_size or 0))
        storage_total += bytes_value
        org_usage[domain]["storage_bytes"] = int(org_usage[domain]["storage_bytes"]) + bytes_value
        if owner_id:
            user_usage[owner_id]["storage_bytes"] = int(user_usage[owner_id]["storage_bytes"]) + bytes_value
        uploaded_utc = _coerce_utc(uploaded_at)
        if uploaded_utc and uploaded_utc >= month_current:
            current_month_uploads += 1

    current_month_exports = 0
    for _, created_at in snapshot_rows:
        created_utc = _coerce_utc(created_at)
        if created_utc and created_utc >= month_current:
            current_month_exports += 1

    model_items = []
    for model_name, bucket in model_usage.items():
        tool_calls = int(bucket["tool_calls"])
        total_cost = round(_safe_float(bucket["cost_usd"]), 4)
        model_items.append(
            {
                "model": model_name,
                "tokens_current_month": int(bucket["tokens"]),
                "tool_calls_current_month": tool_calls,
                "cost_usd_current_month": total_cost,
                "avg_cost_usd_per_call": round(total_cost / max(1, tool_calls), 6),
            }
        )
    model_items.sort(key=lambda item: (-_safe_float(item["cost_usd_current_month"]), str(item["model"])))

    org_items = []
    quota_breaches = 0
    budget_alerts = 0
    for domain, bucket in org_usage.items():
        member_count = sum(1 for item in domain_by_user_id.values() if item == domain)
        plan = _resolve_plan(domain=domain, member_count=member_count, project_count=0)
        quota_tokens = int(PLAN_LIMITS.get(plan, PLAN_LIMITS["growth"])["monthly_token_quota"])
        tokens_current = int(bucket["tokens"])
        cost_current = round(_safe_float(bucket["cost_usd"]), 4)
        cost_previous = round(_safe_float(bucket["previous_cost_usd"]), 4)
        if tokens_current > quota_tokens:
            quota_breaches += 1
        if cost_previous > 0 and cost_current > cost_previous * 1.35:
            budget_alerts += 1
        item = {
            "org_id": f"org-{domain}",
            "org_name": _derive_org_name(domain),
            "domain": domain,
            "plan": plan,
            "tokens_current_month": tokens_current,
            "tokens_previous_month": int(bucket["previous_tokens"]),
            "tokens_trend_pct": _percent_change(tokens_current, int(bucket["previous_tokens"])),
            "tool_calls_current_month": int(bucket["tool_calls"]),
            "cost_usd_current_month": cost_current,
            "cost_usd_previous_month": cost_previous,
            "cost_trend_pct": _percent_change(cost_current, cost_previous),
            "storage_bytes": int(bucket["storage_bytes"]),
            "token_quota_monthly": quota_tokens,
            "quota_used_pct": round((tokens_current / max(1, quota_tokens)) * 100.0, 2),
        }
        if normalized_query:
            searchable = " ".join([item["org_name"], item["domain"], item["plan"]]).lower()
            if normalized_query not in searchable:
                continue
        org_items.append(item)
    org_items.sort(key=lambda item: (-_safe_float(item["cost_usd_current_month"]), str(item["domain"])))

    user_items = []
    for user_id, bucket in user_usage.items():
        user_meta = user_by_id.get(user_id)
        if not user_meta:
            continue
        item = {
            "user_id": user_id,
            "name": user_meta["name"],
            "email": user_meta["email"],
            "tokens_current_month": int(bucket["tokens"]),
            "tool_calls_current_month": int(bucket["tool_calls"]),
            "cost_usd_current_month": round(_safe_float(bucket["cost_usd"]), 4),
            "storage_bytes": int(bucket["storage_bytes"]),
        }
        if normalized_query:
            searchable = " ".join([item["name"], item["email"]]).lower()
            if normalized_query not in searchable:
                continue
        user_items.append(item)
    user_items.sort(key=lambda item: (-_safe_float(item["cost_usd_current_month"]), str(item["email"])))

    trend_items = []
    for month_key in trend_keys:
        bucket = trend_usage[month_key]
        trend_items.append(
            {
                "month": month_key,
                "tokens": int(bucket["tokens"]),
                "tool_calls": int(bucket["tool_calls"]),
                "cost_usd": round(_safe_float(bucket["cost_usd"]), 4),
            }
        )

    return {
        "generated_at": now,
        "summary": {
            "tokens_current_month": month_tokens,
            "tool_calls_current_month": month_calls,
            "cost_usd_current_month": round(month_cost, 4),
            "storage_bytes_total": storage_total,
            "avg_chain_length": round(month_chain_length / max(1, month_jobs), 3),
            "cache_hit_rate_pct": 0.0,
            "rate_limit_events_current_month": month_cancel_requested,
            "quota_breaches_current_month": quota_breaches,
            "budget_alerts_current_month": budget_alerts,
            "failed_runs_current_month": month_failed,
            "running_runs_current": month_running,
        },
        "model_usage": model_items[:20],
        "tool_usage": [
            {
                "tool_type": "manuscript_generation",
                "calls_current_month": month_calls,
                "cost_usd_current_month": round(month_cost, 4),
            },
            {
                "tool_type": "data_upload",
                "calls_current_month": current_month_uploads,
                "cost_usd_current_month": 0.0,
            },
            {
                "tool_type": "snapshot_export",
                "calls_current_month": current_month_exports,
                "cost_usd_current_month": 0.0,
            },
        ],
        "organisation_usage": org_items[:50],
        "user_usage": user_items[:50],
        "monthly_trend": trend_items,
    }


def _provider_configured(provider: str) -> bool:
    key_map = {
        "openai": "OPENAI_API_KEY",
        "openalex": "OPENALEX_MAILTO",
        "orcid": "ORCID_CLIENT_ID",
        "google": "GOOGLE_CLIENT_ID",
        "microsoft": "MICROSOFT_CLIENT_ID",
        "pubmed": "PUBMED_FETCH_TIMEOUT_SECONDS",
        "semantic_scholar": "SEMANTIC_SCHOLAR_API_KEY",
        "crossref": "CROSSREF_MAILTO",
    }
    key = key_map.get(provider)
    if not key:
        return False
    if provider == "pubmed":
        return True
    return bool(str(os.getenv(key, "")).strip())


def _provider_config_key(provider: str) -> str | None:
    key_map = {
        "openai": "OPENAI_API_KEY",
        "openalex": "OPENALEX_MAILTO",
        "orcid": "ORCID_CLIENT_ID",
        "google": "GOOGLE_CLIENT_ID",
        "microsoft": "MICROSOFT_CLIENT_ID",
        "pubmed": "PUBMED_FETCH_TIMEOUT_SECONDS",
        "semantic_scholar": "SEMANTIC_SCHOLAR_API_KEY",
        "crossref": "CROSSREF_MAILTO",
    }
    return key_map.get(provider)


def get_admin_api_monitor(*, query: str = "") -> dict[str, object]:
    telemetry = summarize_api_usage_for_admin(query=query)
    provider_rows = (
        telemetry.get("providers")
        if isinstance(telemetry.get("providers"), list)
        else []
    )
    provider_map: dict[str, dict[str, object]] = {}
    for row in provider_rows:
        if not isinstance(row, dict):
            continue
        key = str(row.get("provider") or "").strip().lower()
        if not key:
            continue
        provider_map[key] = row

    inventory = [
        {"provider": "openai", "category": "llm"},
        {"provider": "openalex", "category": "bibliography"},
        {"provider": "orcid", "category": "identity"},
        {"provider": "google", "category": "identity"},
        {"provider": "microsoft", "category": "identity"},
        {"provider": "pubmed", "category": "bibliography"},
        {"provider": "semantic_scholar", "category": "bibliography"},
        {"provider": "crossref", "category": "bibliography"},
    ]
    items: list[dict[str, object]] = []
    for item in inventory:
        provider = str(item["provider"])
        usage = provider_map.get(provider, {})
        configured = _provider_configured(provider)
        calls = int(usage.get("calls_current_month") or 0)
        errors = int(usage.get("errors_current_month") or 0)
        error_threshold = max(3, int(calls * 0.25))
        health = "healthy"
        health_reason = "Operational"
        if not configured:
            health = "not_configured"
            config_key = _provider_config_key(provider)
            if config_key:
                health_reason = f"Missing environment variable: {config_key}"
            else:
                health_reason = "Provider configuration missing"
        elif calls > 0 and errors >= error_threshold:
            health = "degraded"
            health_reason = (
                f"High error rate this month ({errors}/{calls}, "
                f"threshold {error_threshold})"
            )
        elif calls <= 0:
            health_reason = "No calls observed this month"
        items.append(
            {
                "provider": provider,
                "category": str(item["category"]),
                "configured": configured,
                "health": health,
                "health_reason": health_reason,
                "calls_current_month": calls,
                "errors_current_month": errors,
                "error_rate_pct_current_month": float(
                    usage.get("error_rate_pct_current_month") or 0.0
                ),
                "avg_latency_ms_current_month": float(
                    usage.get("avg_latency_ms_current_month") or 0.0
                ),
                "tokens_current_month": int(usage.get("tokens_current_month") or 0),
                "cost_usd_current_month": round(
                    float(usage.get("cost_usd_current_month") or 0.0), 6
                ),
                "last_called_at": usage.get("last_called_at"),
                "operations": (
                    usage.get("operations")
                    if isinstance(usage.get("operations"), list)
                    else []
                ),
                "recent_errors": (
                    usage.get("recent_errors")
                    if isinstance(usage.get("recent_errors"), list)
                    else []
                ),
            }
        )
    items.sort(
        key=lambda row: (-int(row.get("calls_current_month") or 0), str(row["provider"]))
    )
    return {
        "generated_at": telemetry.get("generated_at"),
        "summary": (
            telemetry.get("summary")
            if isinstance(telemetry.get("summary"), dict)
            else {
                "calls_current_month": 0,
                "errors_current_month": 0,
                "error_rate_pct_current_month": 0.0,
                "tokens_current_month": 0,
                "cost_usd_current_month": 0.0,
            }
        ),
        "providers": items,
        "monthly_trend": (
            telemetry.get("monthly_trend")
            if isinstance(telemetry.get("monthly_trend"), list)
            else []
        ),
    }


def _work_type_llm_setting_enabled(raw_value: object) -> bool:
    normalized = str(raw_value or "").strip().lower()
    return normalized in {"1", "true", "yes"}


def _build_work_type_llm_runtime_setting() -> dict[str, object]:
    raw_value = str(os.getenv("ENABLE_WORK_TYPE_LLM", "true")).strip()
    setting_enabled = _work_type_llm_setting_enabled(raw_value)
    openai_api_key_present = bool(str(os.getenv("OPENAI_API_KEY", "")).strip())
    effective_enabled = bool(openai_api_key_present and setting_enabled)

    note = "Process-local runtime toggle. Restarting the API process resets this value."
    if not openai_api_key_present:
        note = (
            "OPENAI_API_KEY is missing; work-type LLM classification will remain inactive "
            "until the key is configured."
        )
    elif not raw_value:
        note = (
            "ENABLE_WORK_TYPE_LLM is empty in this process; empty values are treated as disabled."
        )

    return {
        "setting_key": "ENABLE_WORK_TYPE_LLM",
        "setting_enabled": setting_enabled,
        "effective_enabled": effective_enabled,
        "raw_value": raw_value,
        "openai_api_key_present": openai_api_key_present,
        "scope": "process",
        "persistence": "restart_resets",
        "description": (
            "Controls whether persona work imports may use OpenAI to classify ambiguous "
            "work types."
        ),
        "note": note,
    }


def get_admin_runtime_settings() -> dict[str, object]:
    return {
        "generated_at": _utcnow(),
        "work_type_llm": _build_work_type_llm_runtime_setting(),
        "publications_auto_sync": get_publications_auto_sync_runtime_settings(),
    }


def update_admin_work_type_llm_setting(
    *,
    actor_user_id: str,
    enabled: bool,
    reason: str = "",
) -> dict[str, object]:
    clean_actor_user_id = str(actor_user_id or "").strip()
    if not clean_actor_user_id:
        raise AdminValidationError("Actor user id is required.")

    previous_setting = _build_work_type_llm_runtime_setting()
    os.environ["ENABLE_WORK_TYPE_LLM"] = "true" if bool(enabled) else "false"
    current_setting = _build_work_type_llm_runtime_setting()
    clean_reason = str(reason or "").strip()

    audit_event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id,
        action="work_type_llm_toggle",
        target_type="runtime_setting",
        target_id="ENABLE_WORK_TYPE_LLM",
        status="success",
        metadata={
            "previous_setting_enabled": bool(previous_setting.get("setting_enabled")),
            "new_setting_enabled": bool(current_setting.get("setting_enabled")),
            "effective_enabled": bool(current_setting.get("effective_enabled")),
            "openai_api_key_present": bool(
                current_setting.get("openai_api_key_present")
            ),
            "reason": clean_reason,
        },
    )
    state_label = "enabled" if bool(current_setting.get("setting_enabled")) else "disabled"
    message = (
        f"Set ENABLE_WORK_TYPE_LLM to {state_label}. "
        "This runtime setting applies only to the current API process."
    )
    if not bool(current_setting.get("openai_api_key_present")):
        message = (
            f"{message} OPENAI_API_KEY is not configured, so the effective state remains inactive."
        )
    return {
        "message": message,
        "generated_at": _utcnow(),
        "work_type_llm": current_setting,
        "audit_event": audit_event,
    }


def update_admin_publications_auto_sync_setting(
    *,
    actor_user_id: str,
    enabled: bool | None = None,
    interval_hours: int | None = None,
    reason: str = "",
) -> dict[str, object]:
    clean_actor_user_id = str(actor_user_id or "").strip()
    if not clean_actor_user_id:
        raise AdminValidationError("Actor user id is required.")
    if enabled is None and interval_hours is None:
        raise AdminValidationError(
            "At least one publications auto-sync setting must be provided."
        )

    previous_setting = get_publications_auto_sync_runtime_settings()
    try:
        current_setting = update_publications_auto_sync_runtime_settings(
            enabled=enabled,
            interval_hours=interval_hours,
        )
    except ValueError as exc:
        raise AdminValidationError(str(exc)) from exc

    clean_reason = str(reason or "").strip()
    audit_event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id,
        action="publications_auto_sync_settings_update",
        target_type="runtime_setting",
        target_id="publications_auto_sync",
        status="success",
        metadata={
            "previous_enabled": bool(previous_setting.get("enabled")),
            "new_enabled": bool(current_setting.get("enabled")),
            "previous_interval_hours": int(previous_setting.get("interval_hours") or 0),
            "new_interval_hours": int(current_setting.get("interval_hours") or 0),
            "reason": clean_reason,
        },
    )
    message = (
        "Updated publications auto-sync runtime settings. "
        "Changes apply to the current API process and reset on restart."
    )
    return {
        "message": message,
        "generated_at": _utcnow(),
        "publications_auto_sync": current_setting,
        "audit_event": audit_event,
    }


def admin_run_publications_sync_for_all_users(
    *,
    actor_user_id: str,
    due_only: bool = False,
    reason: str = "",
) -> dict[str, object]:
    clean_actor_user_id = str(actor_user_id or "").strip()
    if not clean_actor_user_id:
        raise AdminValidationError("Actor user id is required.")

    summary = trigger_publications_auto_sync_for_all_users(due_only=bool(due_only))
    clean_reason = str(reason or "").strip()
    audit_event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id,
        action="publications_sync_run_all",
        target_type="runtime_action",
        target_id="publications_auto_sync",
        status="success",
        metadata={
            "due_only": bool(due_only),
            "reason": clean_reason,
            "processed_users": int(summary.get("processed_users") or 0),
            "enqueued_users": int(summary.get("enqueued_users") or 0),
            "skipped_inactive": int(summary.get("skipped_inactive") or 0),
            "skipped_not_approved": int(summary.get("skipped_not_approved") or 0),
            "skipped_auto_update_disabled": int(
                summary.get("skipped_auto_update_disabled") or 0
            ),
            "skipped_not_linked": int(summary.get("skipped_not_linked") or 0),
            "skipped_not_due": int(summary.get("skipped_not_due") or 0),
            "conflict_users": int(summary.get("conflict_users") or 0),
            "failed_users": int(summary.get("failed_users") or 0),
            "interval_hours": int(summary.get("interval_hours") or 0),
        },
    )
    message = (
        f"Queued publication sync jobs for {int(summary.get('enqueued_users') or 0)} user(s). "
        f"Conflicts: {int(summary.get('conflict_users') or 0)}; "
        f"failed: {int(summary.get('failed_users') or 0)}."
    )
    return {
        "message": message,
        "generated_at": _utcnow(),
        "due_only": bool(summary.get("due_only")),
        "interval_hours": int(summary.get("interval_hours") or 0),
        "processed_users": int(summary.get("processed_users") or 0),
        "enqueued_users": int(summary.get("enqueued_users") or 0),
        "skipped_inactive": int(summary.get("skipped_inactive") or 0),
        "skipped_not_approved": int(summary.get("skipped_not_approved") or 0),
        "skipped_auto_update_disabled": int(
            summary.get("skipped_auto_update_disabled") or 0
        ),
        "skipped_not_linked": int(summary.get("skipped_not_linked") or 0),
        "skipped_not_due": int(summary.get("skipped_not_due") or 0),
        "conflict_users": int(summary.get("conflict_users") or 0),
        "failed_users": int(summary.get("failed_users") or 0),
        "audit_event": audit_event,
    }


def admin_import_journal_profiles_csv(
    *,
    actor_user_id: str,
    content: bytes,
    filename: str = "",
    source_label: str = "",
    impact_factor_label: str = "Impact Factor",
    default_metric_year: int | None = None,
    reason: str = "",
) -> dict[str, object]:
    clean_actor_user_id = str(actor_user_id or "").strip()
    if not clean_actor_user_id:
        raise AdminValidationError("Actor user id is required.")
    if not isinstance(content, (bytes, bytearray)) or not bytes(content):
        raise AdminValidationError("CSV content is required.")

    summary = import_journal_profiles_from_csv_bytes(
        content=bytes(content),
        filename=filename,
        source_label=source_label,
        impact_factor_label=impact_factor_label,
        default_metric_year=default_metric_year,
    )
    clean_reason = str(reason or "").strip()
    audit_event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id,
        action="journal_profiles_csv_import",
        target_type="journal_profile_cache",
        target_id=str(summary.get("file_name") or "journal-impact-factors.csv"),
        status="success",
        metadata={
            "reason": clean_reason,
            "source_label": str(summary.get("source_label") or ""),
            "impact_factor_label": str(summary.get("impact_factor_label") or ""),
            "rows_read": int(summary.get("rows_read") or 0),
            "rows_applied": int(summary.get("rows_applied") or 0),
            "created_profiles": int(summary.get("created_profiles") or 0),
            "updated_profiles": int(summary.get("updated_profiles") or 0),
            "matched_by_source_id": int(summary.get("matched_by_source_id") or 0),
            "matched_by_issn_l": int(summary.get("matched_by_issn_l") or 0),
            "matched_by_issn": int(summary.get("matched_by_issn") or 0),
            "matched_by_display_name": int(
                summary.get("matched_by_display_name") or 0
            ),
            "skipped_rows": int(summary.get("skipped_rows") or 0),
        },
    )
    return {
        "message": (
            f"Imported journal cache data from {summary.get('file_name')}. "
            f"Applied {int(summary.get('rows_applied') or 0)} row(s), "
            f"created {int(summary.get('created_profiles') or 0)} profile(s), "
            f"updated {int(summary.get('updated_profiles') or 0)} profile(s)."
        ),
        **summary,
        "audit_event": audit_event,
    }


def admin_run_collaboration_metrics_recompute_for_all_users(
    *,
    actor_user_id: str,
    include_inactive: bool = False,
    reason: str = "",
) -> dict[str, object]:
    clean_actor_user_id = str(actor_user_id or "").strip()
    if not clean_actor_user_id:
        raise AdminValidationError("Actor user id is required.")

    create_all_tables()
    with session_scope() as session:
        user_rows = session.execute(
            select(User.id, User.is_active).order_by(User.created_at.asc())
        ).all()
    users: list[tuple[str, bool]] = [
        (str(row[0] or "").strip(), bool(row[1])) for row in user_rows
    ]

    processed_users = 0
    enqueued_users = 0
    skipped_inactive = 0
    skipped_no_collaborators_or_running = 0
    failed_users = 0

    for user_id, is_active in users:
        if not user_id:
            continue
        if not include_inactive and not is_active:
            skipped_inactive += 1
            continue
        processed_users += 1
        try:
            result = trigger_collaboration_metrics_recompute(
                user_id=user_id,
                force=True,
            )
            if bool(result.get("enqueued")):
                enqueued_users += 1
            else:
                skipped_no_collaborators_or_running += 1
        except Exception:
            failed_users += 1

    clean_reason = str(reason or "").strip()
    audit_event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id,
        action="collaboration_metrics_recompute_all",
        target_type="runtime_action",
        target_id="collaboration_metrics",
        status="success",
        metadata={
            "include_inactive": bool(include_inactive),
            "reason": clean_reason,
            "processed_users": int(processed_users),
            "enqueued_users": int(enqueued_users),
            "skipped_inactive": int(skipped_inactive),
            "skipped_no_collaborators_or_running": int(
                skipped_no_collaborators_or_running
            ),
            "failed_users": int(failed_users),
        },
    )

    message = (
        f"Queued collaboration metrics recompute for {int(enqueued_users)} user(s). "
        f"Skipped no collaborators/already running: {int(skipped_no_collaborators_or_running)}; "
        f"failed: {int(failed_users)}."
    )
    return {
        "message": message,
        "generated_at": _utcnow(),
        "include_inactive": bool(include_inactive),
        "processed_users": int(processed_users),
        "enqueued_users": int(enqueued_users),
        "skipped_inactive": int(skipped_inactive),
        "skipped_no_collaborators_or_running": int(
            skipped_no_collaborators_or_running
        ),
        "failed_users": int(failed_users),
        "audit_event": audit_event,
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
                func.lower(User.id).like(like),
                func.lower(User.account_key).like(like),
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


def admin_delete_user_account(
    *,
    actor_user_id: str,
    user_id: str,
    confirm_phrase: str,
    reason: str = "",
) -> dict[str, object]:
    create_all_tables()
    clean_actor_user_id = str(actor_user_id or "").strip()
    clean_user_id = str(user_id or "").strip()
    clean_reason = str(reason or "").strip()
    clean_confirm_phrase = str(confirm_phrase or "").strip().upper()
    if not clean_user_id:
        raise AdminValidationError("user_id is required.")
    if clean_confirm_phrase != "DELETE":
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id or None,
            action="admin_user_delete",
            target_type="user",
            target_id=clean_user_id,
            status="failure",
            metadata={
                "reason": clean_reason,
                "failure": "invalid_confirm_phrase",
            },
        )
        raise AdminValidationError("Type DELETE to confirm account deletion.")
    if clean_actor_user_id and clean_actor_user_id == clean_user_id:
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id or None,
            action="admin_user_delete",
            target_type="user",
            target_id=clean_user_id,
            status="failure",
            metadata={
                "reason": clean_reason,
                "failure": "self_delete_forbidden",
            },
        )
        raise AdminValidationError(
            "Admin cannot delete their own account from this endpoint."
        )

    deleted_user_email = ""
    deleted_user_name = ""
    deleted_at = _utcnow()
    stored_upload_paths: list[str] = []
    owned_assets_count = 0
    owned_projects_count = 0
    owned_works_count = 0
    try:
        with session_scope() as session:
            user = session.get(User, clean_user_id)
            if user is None:
                raise AdminNotFoundError(f"User '{clean_user_id}' was not found.")
            deleted_user_email = str(user.email or "").strip()
            deleted_user_name = (
                str(user.name or "").strip() or deleted_user_email or clean_user_id
            )
            owned_assets_count = _count_owned_assets(
                session=session,
                user_id=clean_user_id,
            )
            owned_projects_count = int(
                session.scalar(
                    select(func.count())
                    .select_from(Project)
                    .where(Project.owner_user_id == clean_user_id)
                )
                or 0
            )
            owned_works_count = int(
                session.scalar(
                    select(func.count())
                    .select_from(Work)
                    .where(Work.user_id == clean_user_id)
                )
                or 0
            )
            file_rows = session.scalars(
                select(PublicationFile).where(PublicationFile.owner_user_id == clean_user_id)
            ).all()
            for row in file_rows:
                source = str(row.source or "").strip().upper()
                storage_key = str(row.storage_key or "").strip()
                if source == "USER_UPLOAD" and storage_key:
                    stored_upload_paths.append(storage_key)

            session.delete(user)
            session.flush()
    except (AdminValidationError, AdminNotFoundError):
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id or None,
            action="admin_user_delete",
            target_type="user",
            target_id=clean_user_id,
            status="failure",
            metadata={
                "reason": clean_reason,
                "target_email": deleted_user_email,
            },
        )
        raise

    for path_value in stored_upload_paths:
        _remove_publication_file_path(path_value)
    try:
        storage_root = Path(
            os.getenv("PUBLICATION_FILES_ROOT", "./publication_files_store")
        )
        shutil.rmtree(storage_root / clean_user_id, ignore_errors=True)
    except Exception:
        pass

    event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id or None,
        action="admin_user_delete",
        target_type="user",
        target_id=clean_user_id,
        status="success",
        metadata={
            "reason": clean_reason,
            "target_email": deleted_user_email,
            "target_name": deleted_user_name,
            "owned_assets_count": owned_assets_count,
            "owned_projects_count": owned_projects_count,
            "owned_works_count": owned_works_count,
        },
    )
    return {
        "success": True,
        "message": f"Deleted account '{deleted_user_name}'.",
        "deleted_user_id": clean_user_id,
        "deleted_user_email": deleted_user_email,
        "deleted_user_name": deleted_user_name,
        "deleted_at": deleted_at,
        "audit_event": event,
    }


def admin_reconcile_user_library(
    *,
    actor_user_id: str,
    user_id: str,
) -> dict[str, object]:
    create_all_tables()
    clean_actor_user_id = str(actor_user_id or "").strip()
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        raise AdminValidationError("user_id is required.")

    user_email = ""
    user_name = ""
    user_account_key: str | None = None
    owned_assets_before = 0
    owned_personal_before = 0
    owned_project_before = 0
    owned_assets_after = 0
    owned_personal_after = 0
    owned_project_after = 0
    reconcile_summary: dict[str, int] = {
        "restored_rows": 0,
        "claimed_rows": 0,
        "identity_recovered_rows": 0,
        "canonicalized_owner_rows": 0,
    }
    diagnostics_before: dict[str, object] = {}
    diagnostics_after: dict[str, object] = {}

    try:
        with session_scope() as session:
            user = session.get(User, clean_user_id)
            if user is None:
                raise AdminNotFoundError(f"User '{clean_user_id}' was not found.")
            user_email = str(user.email or "").strip()
            user_name = str(user.name or "").strip() or user_email or clean_user_id
            user_account_key = str(user.account_key or "").strip() or None
            owned_assets_before = _count_owned_assets(
                session=session, user_id=clean_user_id
            )
            owned_personal_before = _count_owned_personal_assets(
                session=session,
                user_id=clean_user_id,
            )
            owned_project_before = _count_owned_project_assets(
                session=session,
                user_id=clean_user_id,
            )

        from research_os.services.data_planner_service import (
            collect_library_reconcile_diagnostics,
            reconcile_library_for_user,
        )

        diagnostics_before = collect_library_reconcile_diagnostics(
            user_id=clean_user_id,
            account_key_hint=user_account_key,
        )
        reconcile_summary = reconcile_library_for_user(
            user_id=clean_user_id,
            account_key_hint=user_account_key,
        )

        with session_scope() as session:
            owned_assets_after = _count_owned_assets(
                session=session, user_id=clean_user_id
            )
            owned_personal_after = _count_owned_personal_assets(
                session=session,
                user_id=clean_user_id,
            )
            owned_project_after = _count_owned_project_assets(
                session=session,
                user_id=clean_user_id,
            )

        diagnostics_after = collect_library_reconcile_diagnostics(
            user_id=clean_user_id,
            account_key_hint=user_account_key,
        )
    except (AdminValidationError, AdminNotFoundError):
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id or None,
            action="user_library_reconcile",
            target_type="user",
            target_id=clean_user_id,
            status="failure",
            metadata={
                "target_email": user_email,
                "target_account_key": user_account_key or "",
                "owned_assets_before": owned_assets_before,
                "owned_personal_before": owned_personal_before,
                "owned_project_before": owned_project_before,
                "diagnostics_before": diagnostics_before,
                "error_type": "validation_or_not_found",
            },
        )
        raise
    except Exception as exc:
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id or None,
            action="user_library_reconcile",
            target_type="user",
            target_id=clean_user_id,
            status="failure",
            metadata={
                "target_email": user_email,
                "target_account_key": user_account_key or "",
                "owned_assets_before": owned_assets_before,
                "owned_personal_before": owned_personal_before,
                "owned_project_before": owned_project_before,
                "diagnostics_before": diagnostics_before,
                "error_type": exc.__class__.__name__,
                "error_detail": str(exc),
                "traceback_tail": traceback.format_exc(limit=10),
            },
        )
        raise AdminValidationError(
            "Library reconcile failed. Review admin audit log details for this user."
        )

    restored_rows = int(reconcile_summary.get("restored_rows") or 0)
    claimed_rows = int(reconcile_summary.get("claimed_rows") or 0)
    identity_recovered_rows = int(reconcile_summary.get("identity_recovered_rows") or 0)
    canonicalized_owner_rows = int(
        reconcile_summary.get("canonicalized_owner_rows") or 0
    )

    summary_text = (
        f"Reconciled {user_name}: "
        f"{restored_rows} restored, {claimed_rows} claimed, "
        f"{identity_recovered_rows} identity-recovered, "
        f"{canonicalized_owner_rows} canonicalized."
    )
    no_changes_detected = bool(
        restored_rows == 0
        and claimed_rows == 0
        and identity_recovered_rows == 0
        and canonicalized_owner_rows == 0
        and owned_assets_before == owned_assets_after
        and owned_personal_before == owned_personal_after
        and owned_project_before == owned_project_after
    )
    audit_event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id or None,
        action="user_library_reconcile",
        target_type="user",
        target_id=clean_user_id,
        status="success",
        metadata={
            "target_email": user_email,
            "target_account_key": user_account_key or "",
            "owned_assets_before": owned_assets_before,
            "owned_assets_after": owned_assets_after,
            "owned_personal_before": owned_personal_before,
            "owned_personal_after": owned_personal_after,
            "owned_project_before": owned_project_before,
            "owned_project_after": owned_project_after,
            "reconcile_summary": {
                "restored_rows": restored_rows,
                "claimed_rows": claimed_rows,
                "identity_recovered_rows": identity_recovered_rows,
                "canonicalized_owner_rows": canonicalized_owner_rows,
            },
            "diagnostics_before": diagnostics_before,
            "diagnostics_after": diagnostics_after,
            "no_changes_detected": no_changes_detected,
        },
    )

    return {
        "message": summary_text,
        "user_id": clean_user_id,
        "user_email": user_email,
        "user_name": user_name,
        "account_key": user_account_key,
        "owned_assets_before": owned_assets_before,
        "owned_assets_after": owned_assets_after,
        "owned_personal_before": owned_personal_before,
        "owned_personal_after": owned_personal_after,
        "owned_project_before": owned_project_before,
        "owned_project_after": owned_project_after,
        "reconcile_summary": {
            "restored_rows": restored_rows,
            "claimed_rows": claimed_rows,
            "identity_recovered_rows": identity_recovered_rows,
            "canonicalized_owner_rows": canonicalized_owner_rows,
        },
        "diagnostics": {
            "before": diagnostics_before,
            "after": diagnostics_after,
            "no_changes_detected": no_changes_detected,
        },
        "generated_at": _utcnow(),
        "audit_event": audit_event,
    }


def admin_recover_user_library_storage(
    *,
    actor_user_id: str,
    user_id: str,
    reason: str = "",
) -> dict[str, object]:
    create_all_tables()
    clean_actor_user_id = str(actor_user_id or "").strip()
    clean_user_id = str(user_id or "").strip()
    clean_reason = str(reason or "").strip()
    if not clean_user_id:
        raise AdminValidationError("user_id is required.")

    user_email = ""
    user_name = ""
    user_account_key: str | None = None
    diagnostics_before: dict[str, object] = {}
    diagnostics_after: dict[str, object] = {}
    recover_summary: dict[str, object] = {
        "scanned_assets": 0,
        "storage_rebound_rows": 0,
        "available_assets_before": 0,
        "available_assets_after": 0,
        "missing_assets_after": 0,
        "missing_asset_ids_sample": [],
    }

    try:
        with session_scope() as session:
            user = session.get(User, clean_user_id)
            if user is None:
                raise AdminNotFoundError(f"User '{clean_user_id}' was not found.")
            user_email = str(user.email or "").strip()
            user_name = str(user.name or "").strip() or user_email or clean_user_id
            user_account_key = str(user.account_key or "").strip() or None

        from research_os.services.data_planner_service import (
            collect_library_reconcile_diagnostics,
            recover_library_storage_for_user,
        )

        diagnostics_before = collect_library_reconcile_diagnostics(
            user_id=clean_user_id,
            account_key_hint=user_account_key,
        )
        recover_summary = recover_library_storage_for_user(
            user_id=clean_user_id,
            account_key_hint=user_account_key,
        )
        diagnostics_after = collect_library_reconcile_diagnostics(
            user_id=clean_user_id,
            account_key_hint=user_account_key,
        )
    except (AdminValidationError, AdminNotFoundError):
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id or None,
            action="user_library_storage_recover",
            target_type="user",
            target_id=clean_user_id,
            status="failure",
            metadata={
                "target_email": user_email,
                "target_account_key": user_account_key or "",
                "reason": clean_reason,
                "diagnostics_before": diagnostics_before,
                "error_type": "validation_or_not_found",
            },
        )
        raise
    except Exception as exc:
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id or None,
            action="user_library_storage_recover",
            target_type="user",
            target_id=clean_user_id,
            status="failure",
            metadata={
                "target_email": user_email,
                "target_account_key": user_account_key or "",
                "reason": clean_reason,
                "diagnostics_before": diagnostics_before,
                "error_type": exc.__class__.__name__,
                "error_detail": str(exc),
                "traceback_tail": traceback.format_exc(limit=10),
            },
        )
        raise AdminValidationError(
            "Library storage recovery failed. Review admin audit log details for this user."
        )

    scanned_assets = int(recover_summary.get("scanned_assets") or 0)
    storage_rebound_rows = int(recover_summary.get("storage_rebound_rows") or 0)
    available_assets_before = int(recover_summary.get("available_assets_before") or 0)
    available_assets_after = int(recover_summary.get("available_assets_after") or 0)
    missing_assets_after = int(recover_summary.get("missing_assets_after") or 0)
    missing_asset_ids_sample = [
        str(item or "").strip()
        for item in list(recover_summary.get("missing_asset_ids_sample") or [])
        if str(item or "").strip()
    ][:20]

    summary_text = (
        f"Recovered storage for {user_name}: "
        f"{storage_rebound_rows} path rebind(s), "
        f"available {available_assets_before} -> {available_assets_after}, "
        f"missing now {missing_assets_after}."
    )
    audit_event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id or None,
        action="user_library_storage_recover",
        target_type="user",
        target_id=clean_user_id,
        status="success",
        metadata={
            "target_email": user_email,
            "target_account_key": user_account_key or "",
            "reason": clean_reason,
            "recover_summary": {
                "scanned_assets": scanned_assets,
                "storage_rebound_rows": storage_rebound_rows,
                "available_assets_before": available_assets_before,
                "available_assets_after": available_assets_after,
                "missing_assets_after": missing_assets_after,
                "missing_asset_ids_sample": missing_asset_ids_sample,
            },
            "diagnostics_before": diagnostics_before,
            "diagnostics_after": diagnostics_after,
        },
    )

    return {
        "message": summary_text,
        "user_id": clean_user_id,
        "user_email": user_email,
        "user_name": user_name,
        "account_key": user_account_key,
        "recover_summary": {
            "scanned_assets": scanned_assets,
            "storage_rebound_rows": storage_rebound_rows,
            "available_assets_before": available_assets_before,
            "available_assets_after": available_assets_after,
            "missing_assets_after": missing_assets_after,
            "missing_asset_ids_sample": missing_asset_ids_sample,
        },
        "diagnostics": {
            "before": diagnostics_before,
            "after": diagnostics_after,
        },
        "generated_at": _utcnow(),
        "audit_event": audit_event,
    }


def admin_refresh_user_publications(
    *,
    actor_user_id: str,
    user_id: str,
    reason: str = "",
) -> dict[str, object]:
    create_all_tables()
    clean_actor_user_id = str(actor_user_id or "").strip()
    clean_user_id = str(user_id or "").strip()
    clean_reason = str(reason or "").strip()
    if not clean_user_id:
        raise AdminValidationError("user_id is required.")

    user_email = ""
    user_name = ""
    top_metrics_completed = False
    analytics_completed = False

    try:
        with session_scope() as session:
            user = session.get(User, clean_user_id)
            if user is None:
                raise AdminNotFoundError(f"User '{clean_user_id}' was not found.")
            user_email = str(user.email or "").strip()
            user_name = str(user.name or "").strip() or user_email or clean_user_id

        compute_publication_top_metrics(user_id=clean_user_id)
        top_metrics_completed = True
        
        compute_publications_analytics(user_id=clean_user_id)
        analytics_completed = True
    except (AdminValidationError, AdminNotFoundError):
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id or None,
            action="user_publications_refresh",
            target_type="user",
            target_id=clean_user_id,
            status="failure",
            metadata={
                "target_email": user_email,
                "reason": clean_reason,
                "error_type": "validation_or_not_found",
            },
        )
        raise
    except Exception as exc:
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id or None,
            action="user_publications_refresh",
            target_type="user",
            target_id=clean_user_id,
            status="failure",
            metadata={
                "target_email": user_email,
                "reason": clean_reason,
                "error_type": exc.__class__.__name__,
                "error_detail": str(exc),
                "traceback_tail": traceback.format_exc(limit=10),
            },
        )
        raise AdminValidationError(
            "Could not trigger publication refresh. Review admin audit log for details."
        )

    message = (
        f"Publication refresh completed for {user_name}. "
        f"Top metrics: {'refreshed' if top_metrics_completed else 'failed'}. "
        f"Analytics: {'refreshed' if analytics_completed else 'failed'}."
    )
    audit_event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id or None,
        action="user_publications_refresh",
        target_type="user",
        target_id=clean_user_id,
        status="success",
        metadata={
            "target_email": user_email,
            "reason": clean_reason,
            "top_metrics_completed": top_metrics_completed,
            "analytics_completed": analytics_completed,
        },
    )
    return {
        "message": message,
        "user_id": clean_user_id,
        "user_email": user_email,
        "user_name": user_name,
        "top_metrics_enqueued": top_metrics_completed,
        "analytics_enqueued": analytics_completed,
        "generated_at": _utcnow(),
        "audit_event": audit_event,
    }


def _serialize_admin_job_row(
    *,
    job: GenerationJob,
    project: Project | None,
    owner: User | None,
) -> dict[str, object]:
    workspace_id = _workspace_token(project.workspace_id if project is not None else "")
    started_at = _coerce_utc(job.started_at)
    completed_at = _coerce_utc(job.completed_at)
    created_at = _coerce_utc(job.created_at)
    updated_at = _coerce_utc(job.updated_at)
    duration_seconds: int | None = None
    if started_at is not None and completed_at is not None and completed_at >= started_at:
        duration_seconds = int((completed_at - started_at).total_seconds())

    estimated_tokens = int(
        max(0, int(job.estimated_input_tokens or 0))
        + max(0, int(job.estimated_output_tokens_high or 0))
    )

    owner_user_id = str(project.owner_user_id or "").strip() if project is not None else ""
    owner_name = str(owner.name or "").strip() if owner is not None else ""
    owner_email = str(owner.email or "").strip() if owner is not None else ""

    return {
        "id": job.id,
        "status": str(job.status or "").strip().lower(),
        "cancel_requested": bool(job.cancel_requested),
        "run_count": max(1, int(job.run_count or 1)),
        "retry_count": max(0, int(job.run_count or 1) - 1),
        "parent_job_id": job.parent_job_id,
        "project_id": job.project_id,
        "project_title": str(project.title or "").strip() if project is not None else "",
        "workspace_id": workspace_id,
        "workspace_name": _workspace_display_name(workspace_id),
        "manuscript_id": job.manuscript_id,
        "owner_user_id": owner_user_id or None,
        "owner_name": owner_name,
        "owner_email": owner_email,
        "pricing_model": str(job.pricing_model or "").strip() or "unknown-model",
        "estimated_tokens": estimated_tokens,
        "estimated_cost_usd_high": round(float(job.estimated_cost_usd_high or 0.0), 6),
        "sections_count": len(list(job.sections or [])),
        "progress_percent": max(0, min(100, int(job.progress_percent or 0))),
        "current_section": str(job.current_section or "").strip() or None,
        "error_detail": str(job.error_detail or "").strip() or None,
        "created_at": created_at,
        "started_at": started_at,
        "completed_at": completed_at,
        "updated_at": updated_at,
        "duration_seconds": duration_seconds,
    }


def _admin_journal_float(value: Any) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if numeric != numeric:
        return None
    return numeric


def _admin_journal_int(value: Any) -> int | None:
    numeric = _admin_journal_float(value)
    if numeric is None:
        return None
    return int(round(numeric))


def _admin_journal_summary_stats(profile: JournalProfile) -> dict[str, Any]:
    value = profile.summary_stats_json
    if isinstance(value, dict):
        return value
    return {}


def _admin_journal_two_year_mean_citedness(profile: JournalProfile) -> float | None:
    return _admin_journal_float(
        _admin_journal_summary_stats(profile).get("2yr_mean_citedness")
    )


def _admin_journal_h_index(profile: JournalProfile) -> int | None:
    return _admin_journal_int(_admin_journal_summary_stats(profile).get("h_index"))


def _admin_journal_i10_index(profile: JournalProfile) -> int | None:
    return _admin_journal_int(_admin_journal_summary_stats(profile).get("i10_index"))


def _admin_journal_has_openalex_metrics(profile: JournalProfile) -> bool:
    return any(
        value is not None
        for value in (
            _admin_journal_two_year_mean_citedness(profile),
            _admin_journal_h_index(profile),
            _admin_journal_i10_index(profile),
            profile.works_count,
            profile.cited_by_count,
        )
    )


def _admin_journal_has_editorial_data(profile: JournalProfile) -> bool:
    return any(
        value not in {None, ""}
        for value in (
            profile.publisher_reported_impact_factor,
            profile.editor_in_chief_name,
            profile.time_to_first_decision_days,
            profile.time_to_publication_days,
            profile.editorial_source_url,
            profile.editorial_last_verified_at,
        )
    )


def _serialize_admin_journal_profile(profile: JournalProfile) -> dict[str, object]:
    return {
        "id": profile.id,
        "provider": str(profile.provider or "").strip() or "openalex",
        "provider_journal_id": str(profile.provider_journal_id or "").strip() or None,
        "display_name": str(profile.display_name or "").strip(),
        "publisher": str(profile.publisher or "").strip() or None,
        "venue_type": str(profile.venue_type or "").strip() or None,
        "issn_l": str(profile.issn_l or "").strip() or None,
        "issns": [
            str(value).strip()
            for value in list(profile.issns_json or [])
            if str(value).strip()
        ],
        "two_year_mean_citedness": _admin_journal_two_year_mean_citedness(profile),
        "h_index": _admin_journal_h_index(profile),
        "i10_index": _admin_journal_i10_index(profile),
        "works_count": (
            max(0, int(profile.works_count or 0))
            if profile.works_count is not None
            else None
        ),
        "cited_by_count": (
            max(0, int(profile.cited_by_count or 0))
            if profile.cited_by_count is not None
            else None
        ),
        "publisher_reported_impact_factor": (
            float(profile.publisher_reported_impact_factor)
            if profile.publisher_reported_impact_factor is not None
            else None
        ),
        "publisher_reported_impact_factor_year": (
            max(0, int(profile.publisher_reported_impact_factor_year or 0))
            if profile.publisher_reported_impact_factor_year is not None
            else None
        ),
        "publisher_reported_impact_factor_label": (
            str(profile.publisher_reported_impact_factor_label or "").strip() or None
        ),
        "publisher_reported_impact_factor_source_url": (
            str(profile.publisher_reported_impact_factor_source_url or "").strip()
            or None
        ),
        "time_to_first_decision_days": (
            max(0, int(profile.time_to_first_decision_days or 0))
            if profile.time_to_first_decision_days is not None
            else None
        ),
        "time_to_publication_days": (
            max(0, int(profile.time_to_publication_days or 0))
            if profile.time_to_publication_days is not None
            else None
        ),
        "editor_in_chief_name": str(profile.editor_in_chief_name or "").strip() or None,
        "editorial_source_url": str(profile.editorial_source_url or "").strip() or None,
        "editorial_source_title": (
            str(profile.editorial_source_title or "").strip() or None
        ),
        "editorial_confidence": (
            str(profile.editorial_confidence or "").strip() or None
        ),
        "is_oa": profile.is_oa,
        "is_in_doaj": profile.is_in_doaj,
        "apc_usd": (
            max(0, int(profile.apc_usd or 0)) if profile.apc_usd is not None else None
        ),
        "homepage_url": str(profile.homepage_url or "").strip() or None,
        "last_synced_at": _coerce_utc(profile.last_synced_at),
        "editorial_last_verified_at": _coerce_utc(profile.editorial_last_verified_at),
        "updated_at": _coerce_utc(profile.updated_at),
        "created_at": _coerce_utc(profile.created_at),
    }


def list_admin_journal_profiles(
    *,
    query: str = "",
    limit: int = 100,
    offset: int = 0,
) -> dict[str, object]:
    create_all_tables()
    normalized_query = str(query or "").strip().lower()
    normalized_limit = max(1, min(500, int(limit)))
    normalized_offset = max(0, int(offset))
    with session_scope() as session:
        profiles = list(
            session.scalars(
                select(JournalProfile).order_by(
                    JournalProfile.updated_at.desc(),
                    JournalProfile.display_name.asc(),
                )
            ).all()
        )

        filtered: list[JournalProfile] = []
        with_openalex_metrics = 0
        with_editorial_data = 0
        with_impact_factor = 0
        with_editor_in_chief = 0
        with_decision_timing = 0

        for profile in profiles:
            haystack = " ".join(
                [
                    str(profile.display_name or ""),
                    str(profile.publisher or ""),
                    str(profile.issn_l or ""),
                    str(profile.provider_journal_id or ""),
                    str(profile.editor_in_chief_name or ""),
                ]
            ).strip().lower()
            if normalized_query and normalized_query not in haystack:
                continue
            filtered.append(profile)
            if _admin_journal_has_openalex_metrics(profile):
                with_openalex_metrics += 1
            if _admin_journal_has_editorial_data(profile):
                with_editorial_data += 1
            if profile.publisher_reported_impact_factor is not None:
                with_impact_factor += 1
            if str(profile.editor_in_chief_name or "").strip():
                with_editor_in_chief += 1
            if (
                profile.time_to_first_decision_days is not None
                or profile.time_to_publication_days is not None
            ):
                with_decision_timing += 1

        page = filtered[normalized_offset : normalized_offset + normalized_limit]
        items = [_serialize_admin_journal_profile(profile) for profile in page]

        return {
            "items": items,
            "total": len(filtered),
            "limit": normalized_limit,
            "offset": normalized_offset,
            "generated_at": _utcnow(),
            "summary": {
                "total_profiles": len(filtered),
                "with_openalex_metrics": with_openalex_metrics,
                "with_editorial_data": with_editorial_data,
                "with_publisher_reported_impact_factor": with_impact_factor,
                "with_editor_in_chief": with_editor_in_chief,
                "with_decision_timing": with_decision_timing,
            },
        }


def list_admin_jobs(
    *,
    query: str = "",
    status: str = "",
    workspace_id: str = "",
    project_id: str = "",
    owner_user_id: str = "",
    limit: int = 50,
    offset: int = 0,
) -> dict[str, object]:
    create_all_tables()
    now = _utcnow()
    normalized_query = str(query or "").strip().lower()
    normalized_status = str(status or "").strip().lower()
    normalized_workspace_id = _workspace_token(workspace_id)
    normalized_project_id = str(project_id or "").strip()
    normalized_owner_user_id = str(owner_user_id or "").strip()
    normalized_limit = max(1, min(200, int(limit)))
    normalized_offset = max(0, int(offset))

    with session_scope() as session:
        job_rows = session.execute(
            select(
                GenerationJob.id,
                GenerationJob.status,
                GenerationJob.cancel_requested,
                GenerationJob.run_count,
                GenerationJob.parent_job_id,
                GenerationJob.project_id,
                GenerationJob.manuscript_id,
                GenerationJob.pricing_model,
                GenerationJob.estimated_input_tokens,
                GenerationJob.estimated_output_tokens_high,
                GenerationJob.estimated_cost_usd_high,
                GenerationJob.sections,
                GenerationJob.progress_percent,
                GenerationJob.current_section,
                GenerationJob.error_detail,
                GenerationJob.created_at,
                GenerationJob.started_at,
                GenerationJob.completed_at,
                GenerationJob.updated_at,
            ).order_by(GenerationJob.created_at.desc())
        ).all()
        project_rows = session.execute(
            select(
                Project.id,
                Project.title,
                Project.owner_user_id,
                Project.workspace_id,
            )
        ).all()
        user_rows = session.execute(select(User.id, User.name, User.email)).all()

    project_by_id = {}
    for project_id, title, owner_id, workspace in project_rows:
        clean_project_id = str(project_id or "").strip()
        if not clean_project_id:
            continue
        project_by_id[clean_project_id] = {
            "title": str(title or "").strip(),
            "owner_user_id": str(owner_id or "").strip(),
            "workspace_id": _workspace_token(workspace),
        }

    user_by_id = {}
    for user_id, name, email in user_rows:
        clean_user_id = str(user_id or "").strip()
        if not clean_user_id:
            continue
        user_by_id[clean_user_id] = {
            "name": str(name or "").strip(),
            "email": str(email or "").strip(),
        }

    status_counts: dict[str, int] = defaultdict(int)
    active_count = 0
    terminal_count = 0
    items: list[dict[str, object]] = []

    for (
        job_id,
        status_value,
        cancel_requested,
        run_count,
        parent_job_id,
        project_id_value,
        manuscript_id,
        pricing_model,
        estimated_input_tokens,
        estimated_output_tokens_high,
        estimated_cost_usd_high,
        sections,
        progress_percent,
        current_section,
        error_detail,
        created_at,
        started_at,
        completed_at,
        updated_at,
    ) in job_rows:
        clean_status = str(status_value or "").strip().lower()
        if normalized_status and normalized_status not in {"all", "any"}:
            if clean_status != normalized_status:
                continue

        clean_project_id = str(project_id_value or "").strip()
        project = project_by_id.get(clean_project_id, {})
        workspace_token = str(project.get("workspace_id") or "").strip()
        if normalized_workspace_id and workspace_token != normalized_workspace_id:
            continue

        if normalized_project_id and clean_project_id != normalized_project_id:
            continue

        clean_owner_user_id = str(project.get("owner_user_id") or "").strip()
        if normalized_owner_user_id and clean_owner_user_id != normalized_owner_user_id:
            continue

        owner = user_by_id.get(clean_owner_user_id, {})
        started_at_utc = _coerce_utc(started_at)
        completed_at_utc = _coerce_utc(completed_at)
        created_at_utc = _coerce_utc(created_at)
        updated_at_utc = _coerce_utc(updated_at)
        duration_seconds: int | None = None
        if (
            started_at_utc is not None
            and completed_at_utc is not None
            and completed_at_utc >= started_at_utc
        ):
            duration_seconds = int((completed_at_utc - started_at_utc).total_seconds())
        estimated_tokens = int(
            max(0, int(estimated_input_tokens or 0))
            + max(0, int(estimated_output_tokens_high or 0))
        )
        item = {
            "id": str(job_id or "").strip(),
            "status": clean_status,
            "cancel_requested": bool(cancel_requested),
            "run_count": max(1, int(run_count or 1)),
            "retry_count": max(0, int(run_count or 1) - 1),
            "parent_job_id": str(parent_job_id or "").strip() or None,
            "project_id": clean_project_id,
            "project_title": str(project.get("title") or ""),
            "workspace_id": workspace_token,
            "workspace_name": _workspace_display_name(workspace_token),
            "manuscript_id": str(manuscript_id or "").strip(),
            "owner_user_id": clean_owner_user_id or None,
            "owner_name": str(owner.get("name") or ""),
            "owner_email": str(owner.get("email") or ""),
            "pricing_model": str(pricing_model or "").strip() or "unknown-model",
            "estimated_tokens": estimated_tokens,
            "estimated_cost_usd_high": round(float(estimated_cost_usd_high or 0.0), 6),
            "sections_count": len(list(sections or [])),
            "progress_percent": max(0, min(100, int(progress_percent or 0))),
            "current_section": str(current_section or "").strip() or None,
            "error_detail": str(error_detail or "").strip() or None,
            "created_at": created_at_utc,
            "started_at": started_at_utc,
            "completed_at": completed_at_utc,
            "updated_at": updated_at_utc,
            "duration_seconds": duration_seconds,
        }
        if normalized_query:
            searchable = " ".join(
                [
                    str(item["id"]),
                    str(item["status"]),
                    str(item["project_id"]),
                    str(item["project_title"]),
                    str(item["workspace_id"]),
                    str(item["owner_name"]),
                    str(item["owner_email"]),
                    str(item["pricing_model"]),
                    str(item["error_detail"]),
                ]
            ).lower()
            if normalized_query not in searchable:
                continue

        status_counts[str(item["status"])] += 1
        if str(item["status"]) in ADMIN_JOB_ACTIVE_STATUSES:
            active_count += 1
        if str(item["status"]) in ADMIN_JOB_TERMINAL_STATUSES:
            terminal_count += 1
        items.append(item)

    total = len(items)
    paged_items = items[normalized_offset : normalized_offset + normalized_limit]

    queued_count = int(status_counts.get("queued", 0))
    running_count = int(status_counts.get("running", 0))
    cancel_requested_count = int(status_counts.get("cancel_requested", 0))

    return {
        "items": paged_items,
        "total": total,
        "limit": normalized_limit,
        "offset": normalized_offset,
        "generated_at": now,
        "queue_health": {
            "total_jobs": total,
            "active_jobs": active_count,
            "terminal_jobs": terminal_count,
            "queued_jobs": queued_count,
            "running_jobs": running_count,
            "cancel_requested_jobs": cancel_requested_count,
            "failed_jobs": int(status_counts.get("failed", 0)),
            "completed_jobs": int(status_counts.get("completed", 0)),
            "cancelled_jobs": int(status_counts.get("cancelled", 0)),
            "retryable_jobs": int(status_counts.get("failed", 0))
            + int(status_counts.get("cancelled", 0)),
            "backlog_jobs": queued_count + cancel_requested_count,
        },
    }


def _normalize_org_domain(org_id: str) -> str:
    clean_org_id = str(org_id or "").strip().lower()
    if clean_org_id.startswith("org-"):
        clean_org_id = clean_org_id[4:]
    clean_org_id = clean_org_id.replace(" ", "")
    if not clean_org_id or "." not in clean_org_id:
        raise AdminValidationError("A valid organisation id is required.")
    return clean_org_id


def admin_cancel_job(
    *,
    job_id: str,
    actor_user_id: str | None,
    reason: str = "",
) -> dict[str, object]:
    create_all_tables()
    clean_job_id = str(job_id or "").strip()
    clean_reason = str(reason or "").strip()
    clean_actor_user_id = str(actor_user_id or "").strip() or None
    if not clean_job_id:
        raise AdminValidationError("A valid generation job id is required.")

    previous_status = "unknown"
    payload: dict[str, object] | None = None
    try:
        with session_scope() as session:
            job = session.get(GenerationJob, clean_job_id)
            if job is None:
                raise AdminNotFoundError(
                    f"Generation job '{clean_job_id}' was not found."
                )

            previous_status = str(job.status or "").strip().lower()
            if previous_status not in ADMIN_JOB_ACTIVE_STATUSES:
                raise AdminStateError(
                    (
                        f"Generation job '{clean_job_id}' cannot be cancelled from "
                        f"status '{previous_status}'."
                    )
                )

            if previous_status == "queued":
                job.status = "cancelled"
                job.cancel_requested = True
                if _coerce_utc(job.completed_at) is None:
                    job.completed_at = _utcnow()
            else:
                job.status = "cancel_requested"
                job.cancel_requested = True

            job.updated_at = _utcnow()
            session.flush()

            project = session.get(Project, job.project_id)
            owner = None
            if project is not None and str(project.owner_user_id or "").strip():
                owner = session.get(User, str(project.owner_user_id))
            payload = _serialize_admin_job_row(job=job, project=project, owner=owner)
    except (AdminValidationError, AdminNotFoundError, AdminStateError):
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id,
            action="admin_job_cancel",
            target_type="generation_job",
            target_id=clean_job_id,
            status="failure",
            metadata={
                "reason": clean_reason,
                "previous_status": previous_status,
            },
        )
        raise

    if payload is None:
        raise AdminStateError("Generation job cancellation did not produce a payload.")

    event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id,
        action="admin_job_cancel",
        target_type="generation_job",
        target_id=clean_job_id,
        status="success",
        metadata={
            "reason": clean_reason,
            "previous_status": previous_status,
            "new_status": str(payload["status"]),
            "workspace_id": str(payload["workspace_id"]),
            "project_id": str(payload["project_id"]),
        },
    )
    return {
        "action": "cancel",
        "message": f"Generation job '{clean_job_id}' cancellation request applied.",
        "source_job_id": clean_job_id,
        "job": payload,
        "audit_event": event,
    }


def admin_retry_job(
    *,
    job_id: str,
    actor_user_id: str | None,
    reason: str = "",
    max_estimated_cost_usd: float | None = None,
    project_daily_budget_usd: float | None = None,
) -> dict[str, object]:
    create_all_tables()
    clean_job_id = str(job_id or "").strip()
    clean_reason = str(reason or "").strip()
    clean_actor_user_id = str(actor_user_id or "").strip() or None
    if not clean_job_id:
        raise AdminValidationError("A valid generation job id is required.")

    source_status = "unknown"
    source_project_id = ""
    source_workspace_id = ""
    source_run_count = 1
    enqueue_payload: dict[str, object] | None = None
    try:
        with session_scope() as session:
            source_job = session.get(GenerationJob, clean_job_id)
            if source_job is None:
                raise AdminNotFoundError(
                    f"Generation job '{clean_job_id}' was not found."
                )

            source_status = str(source_job.status or "").strip().lower()
            if source_status not in ADMIN_JOB_RETRYABLE_STATUSES:
                raise AdminStateError(
                    (
                        f"Generation job '{clean_job_id}' cannot be retried from "
                        f"status '{source_status}'."
                    )
                )

            source_project_id = str(source_job.project_id or "").strip()
            source_run_count = max(1, int(source_job.run_count or 1))
            source_project = session.get(Project, source_job.project_id)
            source_workspace_id = _workspace_token(
                source_project.workspace_id if source_project is not None else ""
            )
            enqueue_payload = {
                "project_id": source_job.project_id,
                "manuscript_id": source_job.manuscript_id,
                "sections": list(source_job.sections or []),
                "notes_context": source_job.notes_context,
                "parent_job_id": source_job.id,
                "run_count": source_run_count + 1,
            }
    except (AdminValidationError, AdminNotFoundError, AdminStateError):
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id,
            action="admin_job_retry",
            target_type="generation_job",
            target_id=clean_job_id,
            status="failure",
            metadata={
                "reason": clean_reason,
                "source_status": source_status,
            },
        )
        raise

    if enqueue_payload is None:
        raise AdminStateError("Generation job retry payload was not prepared.")

    try:
        retried_job = enqueue_generation_job(
            project_id=str(enqueue_payload["project_id"]),
            manuscript_id=str(enqueue_payload["manuscript_id"]),
            sections=list(enqueue_payload["sections"]),
            notes_context=str(enqueue_payload["notes_context"]),
            max_estimated_cost_usd=max_estimated_cost_usd,
            project_daily_budget_usd=project_daily_budget_usd,
            parent_job_id=str(enqueue_payload["parent_job_id"]),
            run_count=int(enqueue_payload["run_count"]),
        )
    except (GenerationJobConflictError, GenerationJobStateError) as exc:
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id,
            action="admin_job_retry",
            target_type="generation_job",
            target_id=clean_job_id,
            status="failure",
            metadata={
                "reason": clean_reason,
                "source_status": source_status,
                "error": str(exc),
            },
        )
        raise AdminStateError(str(exc)) from exc

    with session_scope() as session:
        refreshed_job = session.get(GenerationJob, str(retried_job.id))
        if refreshed_job is None:
            raise AdminNotFoundError(
                f"Retried generation job '{retried_job.id}' was not found."
            )
        project = session.get(Project, refreshed_job.project_id)
        owner = None
        if project is not None and str(project.owner_user_id or "").strip():
            owner = session.get(User, str(project.owner_user_id))
        payload = _serialize_admin_job_row(job=refreshed_job, project=project, owner=owner)

    event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id,
        action="admin_job_retry",
        target_type="generation_job",
        target_id=clean_job_id,
        status="success",
        metadata={
            "reason": clean_reason,
            "source_status": source_status,
            "source_project_id": source_project_id,
            "source_workspace_id": source_workspace_id,
            "source_run_count": source_run_count,
            "retried_job_id": str(payload["id"]),
            "max_estimated_cost_usd": max_estimated_cost_usd,
            "project_daily_budget_usd": project_daily_budget_usd,
        },
    )
    return {
        "action": "retry",
        "message": (
            f"Generation job '{clean_job_id}' retried as '{payload['id']}'."
        ),
        "source_job_id": clean_job_id,
        "job": payload,
        "audit_event": event,
    }


def create_admin_org_impersonation(
    *,
    org_id: str,
    actor_user_id: str | None,
    reason: str = "",
) -> dict[str, object]:
    create_all_tables()
    clean_actor_user_id = str(actor_user_id or "").strip() or None
    clean_reason = str(reason or "").strip()
    domain = _normalize_org_domain(org_id)
    normalized_org_id = f"org-{domain}"

    try:
        with session_scope() as session:
            org_user_rows = session.execute(
                select(
                    User.id,
                    User.name,
                    User.email,
                    User.role,
                    User.is_active,
                    User.last_sign_in_at,
                ).where(func.lower(User.email).like(f"%@{domain}"))
            ).all()
    except Exception as exc:  # pragma: no cover - defensive guard
        raise AdminStateError("Could not query organisation users.") from exc

    if not org_user_rows:
        _record_admin_audit_event(
            actor_user_id=clean_actor_user_id,
            action="admin_org_impersonation_start",
            target_type="organisation",
            target_id=normalized_org_id,
            status="failure",
            metadata={"reason": clean_reason, "error": "organisation_not_found"},
        )
        raise AdminNotFoundError(
            f"Organisation '{normalized_org_id}' was not found."
        )

    users: list[dict[str, object]] = []
    for user_id, name, email, role, is_active, last_sign_in_at in org_user_rows:
        clean_user_id = str(user_id or "").strip()
        clean_email = str(email or "").strip()
        if not clean_user_id or not clean_email:
            continue
        users.append(
            {
                "id": clean_user_id,
                "name": str(name or "").strip(),
                "email": clean_email,
                "role": str(role or "").strip().lower(),
                "is_active": bool(is_active),
                "last_sign_in_at": _coerce_utc(last_sign_in_at),
            }
        )

    if not users:
        raise AdminNotFoundError(
            f"Organisation '{normalized_org_id}' was not found."
        )

    def _priority(user: dict[str, object]) -> tuple[int, int, float]:
        role = str(user.get("role") or "").strip().lower()
        last_sign_in = user.get("last_sign_in_at")
        if not isinstance(last_sign_in, datetime):
            last_sign_in = None
        return (
            0 if role == "admin" else 1,
            0 if bool(user.get("is_active")) else 1,
            -(last_sign_in.timestamp() if last_sign_in is not None else 0.0),
        )

    target_user = sorted(users, key=_priority)[0]
    started_at = _utcnow()
    expires_at = started_at + timedelta(minutes=20)
    impersonation_ticket = f"imp-{uuid4()}"

    event = _record_admin_audit_event(
        actor_user_id=clean_actor_user_id,
        action="admin_org_impersonation_start",
        target_type="organisation",
        target_id=normalized_org_id,
        status="success",
        metadata={
            "reason": clean_reason,
            "organisation_domain": domain,
            "target_user_id": str(target_user["id"]),
            "target_user_email": str(target_user["email"]),
            "impersonation_ticket": impersonation_ticket,
            "expires_at": expires_at.isoformat(),
        },
    )
    return {
        "org_id": normalized_org_id,
        "org_name": _derive_org_name(domain),
        "domain": domain,
        "target_user_id": str(target_user["id"]),
        "target_user_name": str(target_user["name"] or "").strip() or "Unknown user",
        "target_user_email": str(target_user["email"]),
        "impersonation_ticket": impersonation_ticket,
        "started_at": started_at,
        "expires_at": expires_at,
        "audited": True,
        "audit_event": event,
    }


def list_admin_audit_events(
    *,
    query: str = "",
    action: str = "",
    target_type: str = "",
    limit: int = 100,
    offset: int = 0,
) -> dict[str, object]:
    create_all_tables()
    now = _utcnow()
    normalized_query = str(query or "").strip().lower()
    normalized_action = str(action or "").strip().lower()
    normalized_target_type = str(target_type or "").strip().lower()
    normalized_limit = max(1, min(200, int(limit)))
    normalized_offset = max(0, int(offset))

    with session_scope() as session:
        event_rows = session.execute(
            select(
                AdminAuditEvent.id,
                AdminAuditEvent.action,
                AdminAuditEvent.target_type,
                AdminAuditEvent.target_id,
                AdminAuditEvent.status,
                AdminAuditEvent.actor_user_id,
                AdminAuditEvent.metadata_json,
                AdminAuditEvent.created_at,
            ).order_by(AdminAuditEvent.created_at.desc())
        ).all()
        user_rows = session.execute(select(User.id, User.name, User.email)).all()

    user_meta_by_id: dict[str, tuple[str, str]] = {}
    for user_id, name, email in user_rows:
        clean_user_id = str(user_id or "").strip()
        if not clean_user_id:
            continue
        user_meta_by_id[clean_user_id] = (
            str(name or "").strip() or "Unknown user",
            str(email or "").strip(),
        )

    items: list[dict[str, object]] = []
    status_counts: dict[str, int] = defaultdict(int)
    action_counts: dict[str, int] = defaultdict(int)
    for (
        event_id,
        action_value,
        target_type_value,
        target_id_value,
        status_value,
        actor_user_id,
        metadata_json,
        created_at,
    ) in event_rows:
        event_action = str(action_value or "").strip().lower()
        event_target_type = str(target_type_value or "").strip().lower()
        if normalized_action and normalized_action not in {"all", "any"}:
            if event_action != normalized_action:
                continue
        if normalized_target_type and normalized_target_type not in {"all", "any"}:
            if event_target_type != normalized_target_type:
                continue

        clean_actor_user_id = str(actor_user_id or "").strip()
        actor_name, actor_email = user_meta_by_id.get(
            clean_actor_user_id,
            ("System", ""),
        )
        item = {
            "id": str(event_id),
            "action": str(action_value or "").strip(),
            "target_type": str(target_type_value or "").strip(),
            "target_id": str(target_id_value or "").strip(),
            "status": str(status_value or "").strip(),
            "actor_user_id": clean_actor_user_id or None,
            "actor_name": actor_name,
            "actor_email": actor_email,
            "metadata": metadata_json if isinstance(metadata_json, dict) else {},
            "created_at": _coerce_utc(created_at),
        }
        if normalized_query:
            metadata_blob = str(item["metadata"])
            searchable = " ".join(
                [
                    str(item["action"]),
                    str(item["target_type"]),
                    str(item["target_id"]),
                    str(item["status"]),
                    str(item["actor_name"]),
                    str(item["actor_email"]),
                    metadata_blob,
                ]
            ).lower()
            if normalized_query not in searchable:
                continue

        status_counts[str(item["status"])] += 1
        action_counts[str(item["action"])] += 1
        items.append(item)

    total = len(items)
    paged_items = items[normalized_offset : normalized_offset + normalized_limit]
    action_totals = [
        {"action": key, "count": value}
        for key, value in sorted(
            action_counts.items(),
            key=lambda row: (-int(row[1]), str(row[0])),
        )
    ]

    return {
        "items": paged_items,
        "total": total,
        "limit": normalized_limit,
        "offset": normalized_offset,
        "generated_at": now,
        "summary": {
            "success_count": int(status_counts.get("success", 0)),
            "failure_count": int(status_counts.get("failure", 0)),
            "action_totals": action_totals[:12],
        },
    }

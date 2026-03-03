from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from research_os.db import ApiProviderUsageEvent, create_all_tables, session_scope


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except Exception:
        return 0


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _month_start(anchor: datetime, *, months_ago: int = 0) -> datetime:
    year = anchor.year
    month = anchor.month - max(0, int(months_ago))
    while month <= 0:
        year -= 1
        month += 12
    return datetime(year, month, 1, tzinfo=timezone.utc)


def record_api_usage_event(
    *,
    provider: str,
    operation: str,
    endpoint: str = "",
    success: bool = True,
    status_code: int | None = None,
    duration_ms: int | None = None,
    tokens_input: int | None = None,
    tokens_output: int | None = None,
    cost_usd: float | None = None,
    error_code: str | None = None,
    user_id: str | None = None,
    project_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    clean_provider = str(provider or "").strip().lower()
    clean_operation = str(operation or "").strip().lower()
    if not clean_provider or not clean_operation:
        return
    create_all_tables()
    try:
        with session_scope() as session:
            event = ApiProviderUsageEvent(
                provider=clean_provider[:64],
                operation=clean_operation[:128],
                endpoint=str(endpoint or "").strip()[:255],
                success=bool(success),
                status_code=(int(status_code) if status_code is not None else None),
                duration_ms=max(0, _safe_int(duration_ms)),
                tokens_input=max(0, _safe_int(tokens_input)),
                tokens_output=max(0, _safe_int(tokens_output)),
                cost_usd=max(0.0, _safe_float(cost_usd)),
                error_code=(str(error_code or "").strip()[:96] or None),
                user_id=(str(user_id or "").strip() or None),
                project_id=(str(project_id or "").strip() or None),
                metadata_json=metadata if isinstance(metadata, dict) else {},
            )
            session.add(event)
            session.flush()
    except Exception:
        return


def summarize_api_usage_for_admin(*, query: str = "") -> dict[str, Any]:
    create_all_tables()
    now = _utcnow()
    month_current = _month_start(now, months_ago=0)
    month_previous = _month_start(now, months_ago=1)
    month_older = _month_start(now, months_ago=2)
    month_window_start = month_older
    month_keys = [
        f"{month_older.year:04d}-{month_older.month:02d}",
        f"{month_previous.year:04d}-{month_previous.month:02d}",
        f"{month_current.year:04d}-{month_current.month:02d}",
    ]
    query_text = str(query or "").strip().lower()

    with session_scope() as session:
        rows = session.execute(
            select(
                ApiProviderUsageEvent.provider,
                ApiProviderUsageEvent.operation,
                ApiProviderUsageEvent.endpoint,
                ApiProviderUsageEvent.success,
                ApiProviderUsageEvent.status_code,
                ApiProviderUsageEvent.duration_ms,
                ApiProviderUsageEvent.tokens_input,
                ApiProviderUsageEvent.tokens_output,
                ApiProviderUsageEvent.cost_usd,
                ApiProviderUsageEvent.error_code,
                ApiProviderUsageEvent.created_at,
            ).where(ApiProviderUsageEvent.created_at >= month_window_start)
        ).all()

    by_provider: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "calls_current_month": 0,
            "errors_current_month": 0,
            "avg_latency_ms_current_month": 0.0,
            "cost_usd_current_month": 0.0,
            "tokens_current_month": 0,
            "last_called_at": None,
            "operations": defaultdict(int),
            "recent_errors": [],
        }
    )
    monthly_by_provider: dict[str, dict[str, dict[str, Any]]] = defaultdict(
        lambda: defaultdict(lambda: {"calls": 0, "errors": 0, "cost_usd": 0.0})
    )

    for (
        provider,
        operation,
        endpoint,
        success,
        status_code,
        duration_ms,
        tokens_input,
        tokens_output,
        cost_usd,
        error_code,
        created_at,
    ) in rows:
        name = str(provider or "").strip().lower()
        if not name:
            continue
        timestamp = created_at if isinstance(created_at, datetime) else None
        if timestamp is None:
            continue
        month_key = f"{timestamp.year:04d}-{timestamp.month:02d}"
        bucket = by_provider[name]
        monthly_bucket = monthly_by_provider[name][month_key]
        monthly_bucket["calls"] += 1
        monthly_bucket["cost_usd"] += max(0.0, _safe_float(cost_usd))
        if not bool(success):
            monthly_bucket["errors"] += 1
        if month_key == month_keys[-1]:
            bucket["calls_current_month"] += 1
            bucket["cost_usd_current_month"] += max(0.0, _safe_float(cost_usd))
            bucket["tokens_current_month"] += max(
                0, _safe_int(tokens_input) + _safe_int(tokens_output)
            )
            bucket["avg_latency_ms_current_month"] += max(0, _safe_int(duration_ms))
            op = str(operation or "").strip().lower() or "unknown"
            bucket["operations"][op] += 1
            if not bool(success):
                bucket["errors_current_month"] += 1
                if len(bucket["recent_errors"]) < 5:
                    bucket["recent_errors"].append(
                        {
                            "operation": op,
                            "endpoint": str(endpoint or "").strip(),
                            "status_code": (
                                int(status_code) if status_code is not None else None
                            ),
                            "error_code": str(error_code or "").strip() or None,
                            "created_at": timestamp,
                        }
                    )
        last_called = bucket["last_called_at"]
        if last_called is None or timestamp > last_called:
            bucket["last_called_at"] = timestamp

    provider_items: list[dict[str, Any]] = []
    monthly_items: list[dict[str, Any]] = []
    total_calls = 0
    total_errors = 0
    total_cost = 0.0
    total_tokens = 0
    for provider_name, bucket in by_provider.items():
        calls = int(bucket["calls_current_month"])
        errors = int(bucket["errors_current_month"])
        cost = round(float(bucket["cost_usd_current_month"]), 6)
        tokens = int(bucket["tokens_current_month"])
        avg_latency = (
            round(float(bucket["avg_latency_ms_current_month"]) / calls, 1)
            if calls > 0
            else 0.0
        )
        error_rate = round((errors / max(1, calls)) * 100.0, 2)
        operations = [
            {"operation": op, "calls": count}
            for op, count in sorted(
                dict(bucket["operations"]).items(),
                key=lambda item: (-int(item[1]), str(item[0])),
            )
        ]
        item = {
            "provider": provider_name,
            "calls_current_month": calls,
            "errors_current_month": errors,
            "error_rate_pct_current_month": error_rate,
            "avg_latency_ms_current_month": avg_latency,
            "tokens_current_month": tokens,
            "cost_usd_current_month": cost,
            "last_called_at": bucket["last_called_at"],
            "operations": operations,
            "recent_errors": list(bucket["recent_errors"]),
        }
        if query_text:
            haystack = f"{provider_name} {' '.join(op['operation'] for op in operations)}"
            if query_text not in haystack:
                continue
        provider_items.append(item)
        total_calls += calls
        total_errors += errors
        total_cost += cost
        total_tokens += tokens
        provider_months = monthly_by_provider.get(provider_name, {})
        for month_key in month_keys:
            monthly_bucket = provider_months.get(
                month_key, {"calls": 0, "errors": 0, "cost_usd": 0.0}
            )
            monthly_items.append(
                {
                    "provider": provider_name,
                    "month": month_key,
                    "calls": int(monthly_bucket["calls"]),
                    "errors": int(monthly_bucket["errors"]),
                    "cost_usd": round(float(monthly_bucket["cost_usd"]), 6),
                }
            )

    provider_items.sort(
        key=lambda item: (
            -int(item["calls_current_month"]),
            str(item["provider"]),
        )
    )
    monthly_items.sort(key=lambda item: (str(item["provider"]), str(item["month"])))
    return {
        "generated_at": now,
        "summary": {
            "calls_current_month": total_calls,
            "errors_current_month": total_errors,
            "error_rate_pct_current_month": round(
                (total_errors / max(1, total_calls)) * 100.0, 2
            ),
            "tokens_current_month": total_tokens,
            "cost_usd_current_month": round(float(total_cost), 6),
        },
        "providers": provider_items,
        "monthly_trend": monthly_items,
    }

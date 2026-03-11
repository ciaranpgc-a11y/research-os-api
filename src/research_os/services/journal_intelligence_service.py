from __future__ import annotations

import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from research_os.db import (
    JournalProfile,
    MetricsSnapshot,
    User,
    Work,
    create_all_tables,
    session_scope,
)
from research_os.services.api_telemetry_service import record_api_usage_event
from research_os.services.journal_identity import (
    extract_openalex_source_id,
    normalize_issn,
    normalize_issns,
    normalize_venue_type,
)
from research_os.services.supplementary_work_service import primary_publication_records

RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
OPENALEX_SOURCE_SELECT_FIELDS = (
    "id,display_name,issn_l,issn,host_organization_name,publisher,type,"
    "summary_stats,counts_by_year,is_oa,is_in_doaj,apc_usd,homepage_url,"
    "works_count,cited_by_count"
)
IMPACT_FACTOR_LABEL_FALLBACK = "publisher_reported_impact_factor"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return int(float(text))
    except Exception:
        return None


def _safe_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace(",", "")
    try:
        return float(text)
    except Exception:
        match = re.search(r"-?\d+(?:\.\d+)?", text)
        if not match:
            return None
        try:
            return float(match.group(0))
        except Exception:
            return None


def _sanitize_text(value: Any, *, max_length: int | None = None) -> str | None:
    clean = re.sub(r"\s+", " ", str(value or "").strip())
    if not clean:
        return None
    if max_length is not None:
        clean = clean[:max_length].rstrip()
    return clean or None


def _openalex_timeout_seconds() -> float:
    return max(
        5.0,
        float(str(os.getenv("PERSONA_JOURNAL_OPENALEX_TIMEOUT_SECONDS", "12")).strip()),
    )


def _openalex_retry_count() -> int:
    return max(
        0,
        min(
            6,
            _safe_int(os.getenv("PERSONA_JOURNAL_OPENALEX_RETRY_COUNT", "2")) or 2,
        ),
    )


def _openalex_profile_ttl_hours() -> int:
    return max(
        1,
        min(
            24 * 90,
            _safe_int(os.getenv("PERSONA_JOURNAL_OPENALEX_TTL_HOURS", "168")) or 168,
        ),
    )


def _openalex_mailto(*, fallback_email: str | None = None) -> str | None:
    explicit = _sanitize_text(os.getenv("OPENALEX_MAILTO")) or None
    if explicit and "@" in explicit:
        return explicit
    clean_fallback = _sanitize_text(fallback_email) or None
    if clean_fallback and "@" in clean_fallback:
        return clean_fallback
    bootstrap = _sanitize_text(os.getenv("AAWE_BOOTSTRAP_EMAIL")) or None
    if bootstrap and "@" in bootstrap:
        return bootstrap
    return None


def _openalex_api_key() -> str | None:
    return _sanitize_text(os.getenv("OPENALEX_API_KEY")) or None


def _openalex_request_with_retry(*, url: str, params: dict[str, Any]) -> dict[str, Any]:
    timeout = httpx.Timeout(_openalex_timeout_seconds())
    retries = _openalex_retry_count()
    last_exception: Exception | None = None
    with httpx.Client(timeout=timeout) as client:
        for attempt in range(retries + 1):
            started = time.perf_counter()
            try:
                response = client.get(url, params=params)
            except Exception as exc:
                last_exception = exc
                record_api_usage_event(
                    provider="openalex",
                    operation="journal_profile_lookup",
                    endpoint=url,
                    success=False,
                    duration_ms=int((time.perf_counter() - started) * 1000),
                    error_code=type(exc).__name__,
                )
                if attempt < retries:
                    time.sleep(0.35 * (attempt + 1))
                    continue
                break
            record_api_usage_event(
                provider="openalex",
                operation="journal_profile_lookup",
                endpoint=url,
                success=response.status_code < 400,
                status_code=response.status_code,
                duration_ms=int((time.perf_counter() - started) * 1000),
                error_code=(
                    None
                    if response.status_code < 400
                    else f"http_{response.status_code}"
                ),
            )
            if response.status_code < 400:
                payload = response.json()
                return payload if isinstance(payload, dict) else {}
            if response.status_code not in RETRYABLE_STATUS_CODES or attempt >= retries:
                return {}
            time.sleep(0.35 * (attempt + 1))
    if last_exception is not None:
        record_api_usage_event(
            provider="openalex",
            operation="journal_profile_lookup",
            endpoint=url,
            success=False,
            error_code=type(last_exception).__name__,
        )
    return {}


def _summary_stats_value(profile: JournalProfile, key: str) -> float | None:
    summary_stats = (
        dict(profile.summary_stats_json or {})
        if isinstance(profile.summary_stats_json, dict)
        else {}
    )
    return _safe_float(summary_stats.get(key))


def _profile_needs_openalex_refresh(
    profile: JournalProfile | None, *, force: bool = False
) -> bool:
    if force or profile is None:
        return True
    if _summary_stats_value(profile, "2yr_mean_citedness") is None:
        return True
    last_synced_at = _coerce_utc(profile.last_synced_at)
    if last_synced_at is None:
        return True
    return last_synced_at < (_utcnow() - timedelta(hours=_openalex_profile_ttl_hours()))


def _find_or_create_openalex_journal_profile(
    session: Session,
    *,
    source_id: str | None,
    issn_l: str | None,
    display_name: str | None,
) -> JournalProfile:
    def _matches(candidate: Any) -> bool:
        if not isinstance(candidate, JournalProfile):
            return False
        if str(candidate.provider or "").strip().lower() != "openalex":
            return False
        candidate_source_id = extract_openalex_source_id(candidate.provider_journal_id)
        candidate_issn_l = normalize_issn(candidate.issn_l)
        if source_id and candidate_source_id == source_id:
            return True
        if issn_l and candidate_issn_l == issn_l:
            return True
        return False

    journal_profile: JournalProfile | None = None
    for pending in list(session.new) + list(session.identity_map.values()):
        if _matches(pending):
            journal_profile = pending
            break
    if journal_profile is None and source_id:
        journal_profile = session.scalars(
            select(JournalProfile).where(
                JournalProfile.provider == "openalex",
                JournalProfile.provider_journal_id == source_id,
            )
        ).first()
    if journal_profile is None and issn_l:
        journal_profile = session.scalars(
            select(JournalProfile).where(
                JournalProfile.provider == "openalex",
                JournalProfile.issn_l == issn_l,
            )
        ).first()
    if journal_profile is None:
        journal_profile = JournalProfile(provider="openalex")
        session.add(journal_profile)
    if source_id:
        journal_profile.provider_journal_id = source_id
    if issn_l:
        journal_profile.issn_l = issn_l
    if display_name and not _sanitize_text(journal_profile.display_name):
        journal_profile.display_name = display_name
    return journal_profile


def _apply_openalex_source_payload(
    profile: JournalProfile, *, source_payload: dict[str, Any]
) -> None:
    source_id = extract_openalex_source_id(source_payload.get("id"))
    issn_l = normalize_issn(source_payload.get("issn_l"))
    issns = normalize_issns(source_payload.get("issn"))
    display_name = _sanitize_text(source_payload.get("display_name"), max_length=255)
    publisher = _sanitize_text(
        source_payload.get("host_organization_name") or source_payload.get("publisher"),
        max_length=255,
    )
    venue_type = normalize_venue_type(source_payload.get("type"))
    summary_stats = (
        dict(source_payload.get("summary_stats") or {})
        if isinstance(source_payload.get("summary_stats"), dict)
        else {}
    )
    counts_by_year = source_payload.get("counts_by_year")
    if not isinstance(counts_by_year, list):
        counts_by_year = []
    homepage_url = _sanitize_text(source_payload.get("homepage_url"))
    if source_id:
        profile.provider_journal_id = source_id
    if issn_l:
        profile.issn_l = issn_l
    if issns:
        profile.issns_json = list(issns)
    if display_name:
        profile.display_name = display_name
    if publisher:
        profile.publisher = publisher
    if venue_type:
        profile.venue_type = venue_type
    if summary_stats:
        profile.summary_stats_json = summary_stats
    if counts_by_year:
        profile.counts_by_year_json = list(counts_by_year)
    if source_payload.get("is_oa") is not None:
        profile.is_oa = bool(source_payload.get("is_oa"))
    if source_payload.get("is_in_doaj") is not None:
        profile.is_in_doaj = bool(source_payload.get("is_in_doaj"))
    apc_usd = _safe_int(source_payload.get("apc_usd"))
    if apc_usd is not None:
        profile.apc_usd = apc_usd
    if homepage_url:
        profile.homepage_url = homepage_url
    works_count = _safe_int(source_payload.get("works_count"))
    if works_count is not None:
        profile.works_count = works_count
    cited_by_count = _safe_int(source_payload.get("cited_by_count"))
    if cited_by_count is not None:
        profile.cited_by_count = cited_by_count
    profile.raw_payload_json = dict(source_payload)
    profile.last_synced_at = _utcnow()


def _fetch_openalex_source_detail(
    *,
    source_id: str | None,
    issn_l: str | None,
    user_email: str | None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"select": OPENALEX_SOURCE_SELECT_FIELDS}
    mailto = _openalex_mailto(fallback_email=user_email)
    if mailto:
        params["mailto"] = mailto
    api_key = _openalex_api_key()
    if api_key:
        params["api_key"] = api_key
    clean_source_id = extract_openalex_source_id(source_id)
    if clean_source_id:
        payload = _openalex_request_with_retry(
            url=f"https://api.openalex.org/sources/{clean_source_id}",
            params=params,
        )
        if payload.get("id"):
            return payload
    clean_issn_l = normalize_issn(issn_l)
    if not clean_issn_l:
        return {}
    search_params = {
        **params,
        "filter": f"issn_l:{clean_issn_l},type:journal",
        "per-page": 1,
    }
    payload = _openalex_request_with_retry(
        url="https://api.openalex.org/sources",
        params=search_params,
    )
    results = payload.get("results") if isinstance(payload.get("results"), list) else []
    for candidate in results:
        if isinstance(candidate, dict) and candidate.get("id"):
            return candidate
    return {}


def _should_replace_impact_factor(
    profile: JournalProfile,
    *,
    candidate_value: float | None,
    candidate_year: int | None,
) -> bool:
    if candidate_value is None:
        return False
    existing_value = _safe_float(profile.publisher_reported_impact_factor)
    existing_year = _safe_int(profile.publisher_reported_impact_factor_year)
    if existing_value is None:
        return True
    if candidate_year is not None:
        if existing_year is None:
            return True
        return candidate_year >= existing_year
    if existing_year is not None:
        return False
    return True


def _apply_editorial_payload(
    profile: JournalProfile,
    *,
    editorial_payload: dict[str, Any],
    sources: list[dict[str, str]],
) -> None:
    impact_factor = _safe_float(
        editorial_payload.get("publisher_reported_impact_factor")
    )
    impact_factor_year = _safe_int(
        editorial_payload.get("publisher_reported_impact_factor_year")
    )
    impact_factor_label = _sanitize_text(
        editorial_payload.get("publisher_reported_impact_factor_label"),
        max_length=64,
    )
    replace_impact_factor = _should_replace_impact_factor(
        profile,
        candidate_value=impact_factor,
        candidate_year=impact_factor_year,
    )
    if replace_impact_factor and impact_factor is not None:
        profile.publisher_reported_impact_factor = round(impact_factor, 3)
    if replace_impact_factor and impact_factor_year is not None:
        profile.publisher_reported_impact_factor_year = impact_factor_year
    if impact_factor_label:
        if replace_impact_factor:
            profile.publisher_reported_impact_factor_label = impact_factor_label
    elif (
        replace_impact_factor
        and impact_factor is not None
        and not _sanitize_text(profile.publisher_reported_impact_factor_label)
    ):
        profile.publisher_reported_impact_factor_label = IMPACT_FACTOR_LABEL_FALLBACK

    editorial_source_url = _sanitize_text(editorial_payload.get("editorial_source_url"))
    editorial_source_title = _sanitize_text(
        editorial_payload.get("editorial_source_title"), max_length=255
    )
    if (not editorial_source_url or not editorial_source_title) and sources:
        best_source = sources[0]
        editorial_source_url = editorial_source_url or best_source.get("url")
        editorial_source_title = editorial_source_title or best_source.get("title")
    if editorial_source_url:
        profile.editorial_source_url = editorial_source_url
        if replace_impact_factor and impact_factor is not None:
            profile.publisher_reported_impact_factor_source_url = editorial_source_url
    if editorial_source_title:
        profile.editorial_source_title = editorial_source_title

    time_to_first_decision = _safe_int(
        editorial_payload.get("time_to_first_decision_days")
    )
    if time_to_first_decision is not None:
        profile.time_to_first_decision_days = time_to_first_decision
    time_to_publication = _safe_int(editorial_payload.get("time_to_publication_days"))
    if time_to_publication is not None:
        profile.time_to_publication_days = time_to_publication
    editor_in_chief_name = _sanitize_text(
        editorial_payload.get("editor_in_chief_name"), max_length=255
    )
    if editor_in_chief_name:
        profile.editor_in_chief_name = editor_in_chief_name
    confidence = _sanitize_text(editorial_payload.get("confidence"), max_length=32)
    if confidence:
        profile.editorial_confidence = confidence.lower()
    notes = _sanitize_text(editorial_payload.get("notes"))
    if notes:
        profile.editorial_notes = notes

    profile.editorial_raw_json = {
        "payload": editorial_payload,
        "sources": sources,
    }
    profile.editorial_last_verified_at = _utcnow()


def _latest_metrics_by_work(
    session: Session, work_ids: list[str]
) -> dict[str, MetricsSnapshot]:
    if not work_ids:
        return {}
    rows = session.scalars(
        select(MetricsSnapshot)
        .where(MetricsSnapshot.work_id.in_(work_ids))
        .order_by(
            MetricsSnapshot.work_id.asc(),
            MetricsSnapshot.captured_at.desc(),
            MetricsSnapshot.created_at.desc(),
        )
    ).all()
    latest: dict[str, MetricsSnapshot] = {}
    for row in rows:
        work_id = str(row.work_id)
        if work_id not in latest:
            latest[work_id] = row
    return latest


def _journal_identities_from_user_records(
    *,
    works: list[Work],
    latest_metrics: dict[str, MetricsSnapshot],
) -> list[dict[str, Any]]:
    identities: dict[str, dict[str, Any]] = {}
    for work in works:
        source_id = extract_openalex_source_id(work.openalex_source_id)
        issn_l = normalize_issn(work.issn_l)
        display_name = _sanitize_text(work.journal or work.venue_name, max_length=255)
        key = source_id or issn_l or display_name or str(work.id)
        identities.setdefault(
            key,
            {
                "source_id": source_id,
                "issn_l": issn_l,
                "display_name": display_name,
            },
        )

        snapshot = latest_metrics.get(str(work.id))
        metric_payload = (
            dict(snapshot.metric_payload or {})
            if snapshot is not None and isinstance(snapshot.metric_payload, dict)
            else {}
        )
        source = metric_payload.get("source")
        source = source if isinstance(source, dict) else {}
        payload_source_id = extract_openalex_source_id(
            metric_payload.get("openalex_source_id") or source.get("id")
        )
        payload_issn_l = normalize_issn(
            metric_payload.get("issn_l") or source.get("issn_l")
        )
        payload_display_name = _sanitize_text(
            source.get("display_name") or metric_payload.get("journal_name"),
            max_length=255,
        )
        payload_key = payload_source_id or payload_issn_l or payload_display_name
        if not payload_key:
            continue
        current = identities.setdefault(
            payload_key,
            {
                "source_id": payload_source_id,
                "issn_l": payload_issn_l,
                "display_name": payload_display_name,
            },
        )
        if payload_source_id and not current.get("source_id"):
            current["source_id"] = payload_source_id
        if payload_issn_l and not current.get("issn_l"):
            current["issn_l"] = payload_issn_l
        if payload_display_name and not current.get("display_name"):
            current["display_name"] = payload_display_name
    return list(identities.values())


def refresh_openalex_journal_profiles(
    session: Session,
    *,
    user_email: str | None,
    metric_payloads: list[dict[str, Any]] | None = None,
    works: list[Work] | None = None,
    latest_metrics: dict[str, MetricsSnapshot] | None = None,
    force: bool = False,
) -> dict[str, int]:
    payloads = [
        dict(item or {})
        for item in (metric_payloads or [])
        if isinstance(item, dict) and item
    ]
    derived_latest_metrics = latest_metrics or {}
    if works is not None and not derived_latest_metrics:
        derived_latest_metrics = _latest_metrics_by_work(
            session, [str(work.id) for work in works]
        )
    identities = _journal_identities_from_user_records(
        works=works or [],
        latest_metrics=derived_latest_metrics,
    )
    for payload in payloads:
        source = (
            payload.get("source") if isinstance(payload.get("source"), dict) else {}
        )
        source_id = extract_openalex_source_id(
            payload.get("openalex_source_id") or source.get("id")
        )
        issn_l = normalize_issn(payload.get("issn_l") or source.get("issn_l"))
        display_name = _sanitize_text(
            source.get("display_name") or payload.get("journal_name"),
            max_length=255,
        )
        key = source_id or issn_l or display_name
        if not key:
            continue
        identities.append(
            {
                "source_id": source_id,
                "issn_l": issn_l,
                "display_name": display_name,
            }
        )

    unique_identities: dict[str, dict[str, Any]] = {}
    for identity in identities:
        key = (
            str(identity.get("source_id") or "").strip()
            or str(identity.get("issn_l") or "").strip()
            or str(identity.get("display_name") or "").strip().lower()
        )
        if not key:
            continue
        current = unique_identities.setdefault(key, dict(identity))
        for field in ["source_id", "issn_l", "display_name"]:
            if identity.get(field) and not current.get(field):
                current[field] = identity.get(field)

    refreshed = 0
    considered = 0
    if not _openalex_api_key():
        return {
            "journals_considered": sum(
                1
                for identity in unique_identities.values()
                if extract_openalex_source_id(identity.get("source_id"))
                or normalize_issn(identity.get("issn_l"))
            ),
            "profiles_refreshed": 0,
        }
    for identity in unique_identities.values():
        source_id = extract_openalex_source_id(identity.get("source_id"))
        issn_l = normalize_issn(identity.get("issn_l"))
        display_name = _sanitize_text(identity.get("display_name"), max_length=255)
        if not source_id and not issn_l:
            continue
        considered += 1
        profile = _find_or_create_openalex_journal_profile(
            session,
            source_id=source_id,
            issn_l=issn_l,
            display_name=display_name,
        )
        if not _profile_needs_openalex_refresh(profile, force=force):
            continue
        source_payload = _fetch_openalex_source_detail(
            source_id=source_id,
            issn_l=issn_l,
            user_email=user_email,
        )
        if not source_payload:
            continue
        _apply_openalex_source_payload(profile, source_payload=source_payload)
        refreshed += 1
    return {
        "journals_considered": considered,
        "profiles_refreshed": refreshed,
    }


def _matching_profiles_for_user(
    session: Session,
    *,
    works: list[Work],
    latest_metrics: dict[str, MetricsSnapshot],
) -> list[JournalProfile]:
    source_ids: set[str] = set()
    issn_ls: set[str] = set()
    for work in works:
        source_id = extract_openalex_source_id(work.openalex_source_id)
        if source_id:
            source_ids.add(source_id)
        issn_l = normalize_issn(work.issn_l)
        if issn_l:
            issn_ls.add(issn_l)
        snapshot = latest_metrics.get(str(work.id))
        metric_payload = (
            dict(snapshot.metric_payload or {})
            if snapshot is not None and isinstance(snapshot.metric_payload, dict)
            else {}
        )
        source = metric_payload.get("source")
        source = source if isinstance(source, dict) else {}
        payload_source_id = extract_openalex_source_id(
            metric_payload.get("openalex_source_id") or source.get("id")
        )
        if payload_source_id:
            source_ids.add(payload_source_id)
        payload_issn_l = normalize_issn(
            metric_payload.get("issn_l") or source.get("issn_l")
        )
        if payload_issn_l:
            issn_ls.add(payload_issn_l)
    rows: list[JournalProfile] = []
    if source_ids:
        rows.extend(
            session.scalars(
                select(JournalProfile).where(
                    JournalProfile.provider == "openalex",
                    JournalProfile.provider_journal_id.in_(sorted(source_ids)),
                )
            ).all()
        )
    if issn_ls:
        rows.extend(
            session.scalars(
                select(JournalProfile).where(
                    JournalProfile.provider == "openalex",
                    JournalProfile.issn_l.in_(sorted(issn_ls)),
                )
            ).all()
        )
    deduped: dict[str, JournalProfile] = {}
    for row in rows:
        key = (
            str(row.id).strip()
            or str(row.provider_journal_id or "").strip()
            or str(row.issn_l or "").strip()
        )
        deduped[key] = row
    return list(deduped.values())


def refresh_persona_journal_intelligence(
    *,
    user_id: str,
    include_editorial_intel: bool = False,
    force: bool = False,
) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        user = session.get(User, user_id)
        if user is None:
            raise ValueError(f"User '{user_id}' was not found.")
        works = session.scalars(
            select(Work)
            .where(Work.user_id == user_id)
            .order_by(Work.year.desc(), Work.updated_at.desc())
        ).all()
        works = primary_publication_records(works)
        if not works:
            return {
                "journals_considered": 0,
                "openalex_profiles_refreshed": 0,
                "editorial_profiles_refreshed": 0,
                "editorial_profiles_skipped": 0,
                "warnings": [],
            }
        latest_metrics = _latest_metrics_by_work(
            session, [str(work.id) for work in works]
        )
        openalex_result = refresh_openalex_journal_profiles(
            session,
            user_email=_sanitize_text(user.email),
            works=works,
            latest_metrics=latest_metrics,
            force=force,
        )
        session.flush()
        profiles = _matching_profiles_for_user(
            session,
            works=works,
            latest_metrics=latest_metrics,
        )
        # Publisher-reported fields are now sourced from the shared cache/import flow.
        _ = include_editorial_intel
        return {
            "journals_considered": max(
                int(openalex_result.get("journals_considered") or 0),
                len(profiles),
            ),
            "openalex_profiles_refreshed": int(
                openalex_result.get("profiles_refreshed") or 0
            ),
            "editorial_profiles_refreshed": 0,
            "editorial_profiles_skipped": 0,
            "warnings": [],
        }

from __future__ import annotations

import logging
import math
import os
import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import delete

from research_os.db import PersonaGrantRecord, create_all_tables, session_scope

from research_os.services.api_telemetry_service import record_api_usage_event

OPENALEX_BASE_URL = "https://api.openalex.org"
OPENALEX_RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
OPENALEX_SOURCE_PROVIDER = "openalex"

logger = logging.getLogger(__name__)


class GrantsValidationError(RuntimeError):
    pass


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except Exception:
        return 0


def _safe_float(value: Any) -> float | None:
    try:
        return float(value)
    except Exception:
        return None


def _sanitize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _normalize_name_part(value: Any) -> str:
    clean = _sanitize_text(value)
    clean = re.sub(r"[^A-Za-z0-9'\- ]+", " ", clean)
    return _sanitize_text(clean)


def _normalize_orcid(value: Any) -> str | None:
    clean = _sanitize_text(value).lower()
    if not clean:
        return None
    if clean.startswith("https://orcid.org/"):
        clean = clean.removeprefix("https://orcid.org/")
    elif clean.startswith("http://orcid.org/"):
        clean = clean.removeprefix("http://orcid.org/")
    clean = clean.strip().strip("/")
    return clean or None


def _tokenize_name(value: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9]+", value.lower()) if token]


def _openalex_timeout_seconds() -> float:
    raw = str(os.getenv("OPENALEX_GRANTS_TIMEOUT_SECONDS", "14")).strip()
    try:
        value = float(raw)
    except Exception:
        value = 14.0
    return max(4.0, min(30.0, value))


def _openalex_retry_count() -> int:
    raw = str(os.getenv("OPENALEX_GRANTS_RETRY_COUNT", "2")).strip()
    try:
        value = int(raw)
    except Exception:
        value = 2
    return max(0, min(6, value))


def _openalex_max_pages() -> int:
    raw = str(os.getenv("OPENALEX_GRANTS_MAX_PAGES", "8")).strip()
    try:
        value = int(raw)
    except Exception:
        value = 8
    return max(1, min(20, value))


def _openalex_mailto(*, fallback_email: str | None = None) -> str | None:
    explicit = _sanitize_text(os.getenv("OPENALEX_MAILTO", ""))
    if explicit and "@" in explicit:
        return explicit
    fallback = _sanitize_text(fallback_email)
    if fallback and "@" in fallback:
        return fallback
    return None


def _author_id_token(value: Any) -> str | None:
    clean = _sanitize_text(value)
    if not clean:
        return None
    if clean.startswith("https://openalex.org/"):
        clean = clean.removeprefix("https://openalex.org/")
    elif clean.startswith("http://openalex.org/"):
        clean = clean.removeprefix("http://openalex.org/")
    clean = clean.strip().strip("/")
    if not clean:
        return None
    return clean.upper()


def _request_openalex_json(
    *,
    client: httpx.Client,
    url: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    retries = _openalex_retry_count()
    for attempt in range(retries + 1):
        started = time.perf_counter()
        try:
            response = client.get(url, params=params)
        except Exception as exc:
            record_api_usage_event(
                provider="openalex",
                operation="grants_lookup",
                endpoint=url,
                success=False,
                duration_ms=int((time.perf_counter() - started) * 1000),
                error_code=type(exc).__name__,
            )
            if attempt < retries:
                time.sleep(0.25 * (attempt + 1))
                continue
            return {}

        duration_ms = int((time.perf_counter() - started) * 1000)
        if response.status_code < 400:
            record_api_usage_event(
                provider="openalex",
                operation="grants_lookup",
                endpoint=url,
                success=True,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )
            payload = response.json()
            return payload if isinstance(payload, dict) else {}

        record_api_usage_event(
            provider="openalex",
            operation="grants_lookup",
            endpoint=url,
            success=False,
            status_code=response.status_code,
            duration_ms=duration_ms,
            error_code=f"http_{response.status_code}",
        )
        if (
            response.status_code not in OPENALEX_RETRYABLE_STATUS_CODES
            or attempt >= retries
        ):
            return {}
        time.sleep(0.25 * (attempt + 1))
    return {}


def _score_author_match(*, candidate_name: str, first_name: str, last_name: str, works_count: int) -> float:
    candidate_tokens = _tokenize_name(candidate_name)
    if not candidate_tokens:
        return -1.0
    first_token = _tokenize_name(first_name)[:1]
    last_token = _tokenize_name(last_name)[:1]
    first = first_token[0] if first_token else ""
    last = last_token[0] if last_token else ""
    full_name = _sanitize_text(f"{first_name} {last_name}").lower()
    candidate_clean = _sanitize_text(candidate_name).lower()
    score = 0.0
    if full_name and candidate_clean == full_name:
        score += 30.0
    if first and candidate_tokens and candidate_tokens[0] == first:
        score += 8.0
    if last and candidate_tokens and candidate_tokens[-1] == last:
        score += 12.0
    if first and first in candidate_tokens:
        score += 4.0
    if last and last in candidate_tokens:
        score += 6.0
    if first and last and first in candidate_tokens and last in candidate_tokens:
        score += 8.0
    if first and first.startswith(candidate_tokens[0][:1]):
        score += 1.0
    if last and last.startswith(candidate_tokens[-1][:1]):
        score += 1.0
    score += min(8.0, math.log10(max(1, works_count) + 1) * 3.0)
    return score


def _resolve_openalex_author(
    *,
    client: httpx.Client,
    first_name: str,
    last_name: str,
    mailto: str | None,
) -> dict[str, Any] | None:
    full_name = _sanitize_text(f"{first_name} {last_name}")
    params: dict[str, Any] = {
        "search": full_name,
        "per-page": 15,
        "select": "id,display_name,orcid,works_count,cited_by_count",
    }
    if mailto:
        params["mailto"] = mailto
    payload = _request_openalex_json(
        client=client,
        url=f"{OPENALEX_BASE_URL}/authors",
        params=params,
    )
    rows = payload.get("results") if isinstance(payload.get("results"), list) else []
    ranked: list[tuple[float, dict[str, Any]]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        openalex_id = _sanitize_text(row.get("id"))
        if not openalex_id:
            continue
        display_name = _sanitize_text(row.get("display_name"))
        works_count = max(0, _safe_int(row.get("works_count")))
        score = _score_author_match(
            candidate_name=display_name,
            first_name=first_name,
            last_name=last_name,
            works_count=works_count,
        )
        ranked.append((score, row))
    if not ranked:
        return None
    ranked.sort(
        key=lambda item: (
            -item[0],
            -max(0, _safe_int(item[1].get("works_count"))),
            _sanitize_text(item[1].get("display_name")).lower(),
        )
    )
    selected = ranked[0][1]
    author_id = _sanitize_text(selected.get("id"))
    author_token = _author_id_token(author_id)
    if not author_id or not author_token:
        return None
    return {
        "openalex_author_id": author_id,
        "openalex_author_token": author_token,
        "display_name": _sanitize_text(selected.get("display_name")) or full_name,
        "orcid": _sanitize_text(selected.get("orcid")) or None,
        "works_count": max(0, _safe_int(selected.get("works_count"))),
        "cited_by_count": max(0, _safe_int(selected.get("cited_by_count"))),
    }


def _extract_author_position(*, authorships: Any, author_token: str) -> str | None:
    rows = authorships if isinstance(authorships, list) else []
    for row in rows:
        if not isinstance(row, dict):
            continue
        author = row.get("author") if isinstance(row.get("author"), dict) else {}
        candidate_token = _author_id_token(author.get("id"))
        if candidate_token and candidate_token == author_token:
            position = _sanitize_text(row.get("author_position")).lower()
            return position or None
    return None


def _grant_key(raw_award: dict[str, Any]) -> str | None:
    funder_id = _sanitize_text(raw_award.get("funder_id")).lower()
    funder_award_id = _sanitize_text(raw_award.get("funder_award_id")).lower()
    award_id = _sanitize_text(raw_award.get("id")).lower()
    if funder_id and funder_award_id:
        return f"{funder_id}|{funder_award_id}"
    if award_id:
        return f"id|{award_id}"
    return None


def _lookup_award_detail(
    *,
    client: httpx.Client,
    mailto: str | None,
    award_id: str | None,
    funder_id: str | None,
    funder_award_id: str | None,
) -> dict[str, Any] | None:
    clean_award_id = _sanitize_text(award_id)
    award_token = _author_id_token(clean_award_id) if clean_award_id else None
    clean_funder_id = _sanitize_text(funder_id)
    clean_funder_award_id = _sanitize_text(funder_award_id)

    if clean_funder_id and clean_funder_award_id:
        params: dict[str, Any] = {
            "filter": f"funder.id:{clean_funder_id},funder_award_id:{clean_funder_award_id}",
            "per-page": 1,
        }
        if mailto:
            params["mailto"] = mailto
        payload = _request_openalex_json(
            client=client,
            url=f"{OPENALEX_BASE_URL}/awards",
            params=params,
        )
        rows = payload.get("results") if isinstance(payload.get("results"), list) else []
        if rows and isinstance(rows[0], dict):
            return rows[0]

    if award_token:
        # Some works carry award IDs that are directly retrievable but not found by funder+award key.
        payload = _request_openalex_json(
            client=client,
            url=f"{OPENALEX_BASE_URL}/awards/{award_token}",
            params={"mailto": mailto} if mailto else {},
        )
        if isinstance(payload, dict) and _sanitize_text(payload.get("id")):
            return payload

        params: dict[str, Any] = {
            "filter": f"id:https://openalex.org/{award_token}",
            "per-page": 1,
        }
        if mailto:
            params["mailto"] = mailto
        payload = _request_openalex_json(
            client=client,
            url=f"{OPENALEX_BASE_URL}/awards",
            params=params,
        )
        rows = payload.get("results") if isinstance(payload.get("results"), list) else []
        if rows and isinstance(rows[0], dict):
            return rows[0]
    return None


def _merge_award_details(base_item: dict[str, Any], detail: dict[str, Any] | None) -> dict[str, Any]:
    if not detail:
        return base_item
    funder_raw = detail.get("funder") if isinstance(detail.get("funder"), dict) else {}
    merged_funder = {
        "id": _sanitize_text(funder_raw.get("id")) or base_item["funder"].get("id"),
        "display_name": _sanitize_text(funder_raw.get("display_name"))
        or base_item["funder"].get("display_name"),
        "doi": _sanitize_text(funder_raw.get("doi")) or base_item["funder"].get("doi"),
        "ror": _sanitize_text(funder_raw.get("ror")) or base_item["funder"].get("ror"),
    }
    return {
        **base_item,
        "openalex_award_id": _sanitize_text(detail.get("id")) or base_item.get("openalex_award_id"),
        "display_name": _sanitize_text(detail.get("display_name")) or base_item.get("display_name"),
        "description": _sanitize_text(detail.get("description")) or base_item.get("description"),
        "funder_award_id": _sanitize_text(detail.get("funder_award_id")) or base_item.get("funder_award_id"),
        "funder": merged_funder,
        "amount": _safe_float(detail.get("amount"))
        if _safe_float(detail.get("amount")) is not None
        else base_item.get("amount"),
        "currency": _sanitize_text(detail.get("currency")) or base_item.get("currency"),
        "funding_type": _sanitize_text(detail.get("funding_type")) or base_item.get("funding_type"),
        "funder_scheme": _sanitize_text(detail.get("funder_scheme")) or base_item.get("funder_scheme"),
        "start_date": _sanitize_text(detail.get("start_date")) or base_item.get("start_date"),
        "end_date": _sanitize_text(detail.get("end_date")) or base_item.get("end_date"),
        "start_year": _safe_int(detail.get("start_year")) or base_item.get("start_year"),
        "end_year": _safe_int(detail.get("end_year")) or base_item.get("end_year"),
        "landing_page_url": _sanitize_text(detail.get("landing_page_url")) or base_item.get("landing_page_url"),
        "doi": _sanitize_text(detail.get("doi")) or base_item.get("doi"),
        "updated_date": _sanitize_text(detail.get("updated_date")) or base_item.get("updated_date"),
        "lead_investigator": (
            detail.get("lead_investigator")
            if isinstance(detail.get("lead_investigator"), dict)
            else None
        ),
        "co_lead_investigator": detail.get("co_lead_investigator"),
        "investigators": (
            detail.get("investigators")
            if isinstance(detail.get("investigators"), list)
            else []
        ),
    }


def _build_holder(raw: dict[str, Any], *, role: str) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    given_name = _normalize_name_part(raw.get("given_name"))
    family_name = _normalize_name_part(raw.get("family_name"))
    display_name = _normalize_name_part(raw.get("display_name"))
    full_name = display_name or _sanitize_text(f"{given_name} {family_name}")
    if not full_name:
        return None
    return {
        "name": full_name,
        "role": role,
        "orcid": _normalize_orcid(raw.get("orcid")),
    }


def _award_holders_from_enriched(item: dict[str, Any]) -> list[dict[str, Any]]:
    holders: list[dict[str, Any]] = []
    lead = _build_holder(
        item.get("lead_investigator")
        if isinstance(item.get("lead_investigator"), dict)
        else {},
        role="lead_investigator",
    )
    if lead:
        holders.append(lead)
    co_lead_raw = item.get("co_lead_investigator")
    if isinstance(co_lead_raw, dict):
        holder = _build_holder(co_lead_raw, role="co_lead_investigator")
        if holder:
            holders.append(holder)
    elif isinstance(co_lead_raw, list):
        for row in co_lead_raw:
            holder = _build_holder(row if isinstance(row, dict) else {}, role="co_lead_investigator")
            if holder:
                holders.append(holder)
    investigators = item.get("investigators") if isinstance(item.get("investigators"), list) else []
    for row in investigators:
        holder = _build_holder(row if isinstance(row, dict) else {}, role="investigator")
        if holder:
            holders.append(holder)
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for holder in holders:
        key = (
            f"{_sanitize_text(holder.get('name')).lower()}|"
            f"{_sanitize_text(holder.get('role')).lower()}|"
            f"{_sanitize_text(holder.get('orcid')).lower()}"
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(holder)
    return deduped


def _holder_matches_target(
    *,
    holder: dict[str, Any],
    target_first_name: str,
    target_last_name: str,
    target_display_name: str,
    target_orcid: str | None,
) -> bool:
    holder_name = _sanitize_text(holder.get("name")).lower()
    if not holder_name:
        return False
    holder_orcid = _normalize_orcid(holder.get("orcid"))
    if target_orcid and holder_orcid and holder_orcid == target_orcid:
        return True
    target_display = _sanitize_text(target_display_name).lower()
    if target_display and holder_name == target_display:
        return True
    holder_tokens = _tokenize_name(holder_name)
    first_tokens = _tokenize_name(target_first_name)
    last_tokens = _tokenize_name(target_last_name)
    if not holder_tokens or not last_tokens:
        return False
    target_last = last_tokens[-1]
    if target_last not in holder_tokens:
        return False
    target_first = first_tokens[0] if first_tokens else ""
    if not target_first:
        return True
    first_holder = holder_tokens[0]
    return (
        target_first == first_holder
        or first_holder.startswith(target_first[:1])
        or target_first.startswith(first_holder[:1])
        or target_first in holder_tokens
    )


def _classify_grant_relationship(
    *,
    item: dict[str, Any],
    target_first_name: str,
    target_last_name: str,
    target_display_name: str,
    target_orcid: str | None,
) -> dict[str, Any]:
    holders = _award_holders_from_enriched(item)
    matched_holder = next(
        (
            holder
            for holder in holders
            if _holder_matches_target(
                holder=holder,
                target_first_name=target_first_name,
                target_last_name=target_last_name,
                target_display_name=target_display_name,
                target_orcid=target_orcid,
            )
        ),
        None,
    )
    if matched_holder:
        return {
            "relationship_to_person": "won_by_person",
            "grant_owner_name": _sanitize_text(matched_holder.get("name")) or target_display_name,
            "grant_owner_role": _sanitize_text(matched_holder.get("role")) or "investigator",
            "grant_owner_orcid": _normalize_orcid(matched_holder.get("orcid")),
            "grant_owner_is_target_person": True,
            "award_holders": holders[:8],
        }
    owner = next(
        (
            holder
            for holder in holders
            if _sanitize_text(holder.get("role")) in {"lead_investigator", "co_lead_investigator"}
        ),
        holders[0] if holders else None,
    )
    if owner:
        return {
            "relationship_to_person": "published_under_other_grant",
            "grant_owner_name": _sanitize_text(owner.get("name")) or None,
            "grant_owner_role": _sanitize_text(owner.get("role")) or None,
            "grant_owner_orcid": _normalize_orcid(owner.get("orcid")),
            "grant_owner_is_target_person": False,
            "award_holders": holders[:8],
        }
    return {
        "relationship_to_person": "published_under_unknown_grant",
        "grant_owner_name": None,
        "grant_owner_role": None,
        "grant_owner_orcid": None,
        "grant_owner_is_target_person": False,
        "award_holders": [],
    }


def _persona_role_from_relationship(
    *,
    relationship_to_person: str,
    grant_owner_role: str | None,
) -> str | None:
    if _sanitize_text(relationship_to_person) != "won_by_person":
        return None
    role = _sanitize_text(grant_owner_role).lower()
    if role == "lead_investigator":
        return "PI"
    if role in {"co_lead_investigator", "investigator"}:
        return "Co-I"
    return None


def _build_persona_grant_key(item: dict[str, Any]) -> str:
    funder = item.get("funder") if isinstance(item.get("funder"), dict) else {}
    funder_identifier = _sanitize_text(funder.get("id")).lower()
    award_identifier = _sanitize_text(item.get("funder_award_id")).lower()
    if not award_identifier:
        award_identifier = _sanitize_text(item.get("openalex_award_id")).lower()
    if not award_identifier:
        award_identifier = _sanitize_text(item.get("display_name")).lower()
    if not award_identifier:
        award_identifier = "unknown"
    if not funder_identifier:
        funder_identifier = _sanitize_text(funder.get("display_name")).lower() or "unknown"
    return f"{OPENALEX_SOURCE_PROVIDER}|{funder_identifier}|{award_identifier}"


def _parse_iso_timestamp(value: str) -> datetime:
    clean = _sanitize_text(value)
    if clean.endswith("Z"):
        clean = f"{clean[:-1]}+00:00"
    parsed = datetime.fromisoformat(clean) if clean else datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _persist_persona_grant_records(
    *,
    user_id: str,
    items: list[dict[str, Any]],
    source_timestamp_iso: str,
) -> None:
    clean_user_id = _sanitize_text(user_id)
    if not clean_user_id:
        return
    create_all_tables()
    source_timestamp = _parse_iso_timestamp(source_timestamp_iso)
    with session_scope() as session:
        session.execute(
            delete(PersonaGrantRecord).where(
                PersonaGrantRecord.user_id == clean_user_id,
                PersonaGrantRecord.source_provider == OPENALEX_SOURCE_PROVIDER,
            )
        )
        for item in items:
            funder = item.get("funder") if isinstance(item.get("funder"), dict) else {}
            session.add(
                PersonaGrantRecord(
                    user_id=clean_user_id,
                    grant_key=_build_persona_grant_key(item),
                    source_provider=OPENALEX_SOURCE_PROVIDER,
                    funder_name=_sanitize_text(funder.get("display_name")) or None,
                    funder_identifier=_sanitize_text(funder.get("id")) or None,
                    award_identifier=(
                        _sanitize_text(item.get("funder_award_id"))
                        or _sanitize_text(item.get("openalex_award_id"))
                        or None
                    ),
                    award_title=_sanitize_text(item.get("display_name")) or None,
                    person_role=_sanitize_text(item.get("person_role")) or None,
                    start_date=_sanitize_text(item.get("start_date")) or None,
                    end_date=_sanitize_text(item.get("end_date")) or None,
                    amount=_safe_float(item.get("amount")),
                    currency=_sanitize_text(item.get("currency")) or None,
                    source_timestamp=source_timestamp,
                    raw_payload=item,
                )
            )


def list_openalex_grants_for_person(
    *,
    first_name: str,
    last_name: str,
    user_email: str | None = None,
    user_id: str | None = None,
    limit: int = 30,
    relationship: str = "all",
) -> dict[str, Any]:
    clean_first_name = _normalize_name_part(first_name)
    clean_last_name = _normalize_name_part(last_name)
    if len(clean_first_name) < 1 or len(clean_last_name) < 1:
        raise GrantsValidationError("First name and last name are required.")
    relationship_filter = _sanitize_text(relationship).lower() or "all"
    if relationship_filter not in {"all", "won", "published_under"}:
        raise GrantsValidationError(
            "Relationship filter must be one of: all, won, published_under."
        )

    clean_limit = max(1, min(100, _safe_int(limit) or 30))
    mailto = _openalex_mailto(fallback_email=user_email)
    timeout = httpx.Timeout(_openalex_timeout_seconds())
    generated_at = _utcnow_iso()

    with httpx.Client(timeout=timeout) as client:
        author = _resolve_openalex_author(
            client=client,
            first_name=clean_first_name,
            last_name=clean_last_name,
            mailto=mailto,
        )
        if not author:
            return {
                "first_name": clean_first_name,
                "last_name": clean_last_name,
                "full_name": _sanitize_text(f"{clean_first_name} {clean_last_name}"),
                "author": {
                    "openalex_author_id": None,
                    "display_name": None,
                    "orcid": None,
                    "works_count": 0,
                    "cited_by_count": 0,
                },
                "items": [],
                "total": 0,
                "relationship_filter": relationship_filter,
                "source": OPENALEX_SOURCE_PROVIDER,
                "generated_at": generated_at,
            }

        author_token = str(author["openalex_author_token"])
        grant_map: dict[str, dict[str, Any]] = {}
        cursor = "*"
        pages = 0
        max_pages = _openalex_max_pages()
        while cursor and pages < max_pages:
            params: dict[str, Any] = {
                "filter": f"authorships.author.id:{author_token},awards.id:!null",
                "select": "id,display_name,publication_year,awards,authorships",
                "per-page": 200,
                "sort": "publication_date:desc",
                "cursor": cursor,
            }
            if mailto:
                params["mailto"] = mailto
            payload = _request_openalex_json(
                client=client,
                url=f"{OPENALEX_BASE_URL}/works",
                params=params,
            )
            rows = payload.get("results") if isinstance(payload.get("results"), list) else []
            if not rows:
                break
            for work in rows:
                if not isinstance(work, dict):
                    continue
                work_id = _sanitize_text(work.get("id"))
                work_title = _sanitize_text(work.get("display_name"))
                work_year = _safe_int(work.get("publication_year")) or None
                work_author_position = _extract_author_position(
                    authorships=work.get("authorships"),
                    author_token=author_token,
                )
                award_rows = (
                    work.get("awards") if isinstance(work.get("awards"), list) else []
                )
                for raw_award in award_rows:
                    if not isinstance(raw_award, dict):
                        continue
                    dedupe_key = _grant_key(raw_award)
                    if not dedupe_key:
                        continue
                    existing = grant_map.get(dedupe_key)
                    if existing is None:
                        existing = {
                            "openalex_award_id": _sanitize_text(raw_award.get("id")) or None,
                            "display_name": _sanitize_text(raw_award.get("display_name")) or None,
                            "description": None,
                            "funder_award_id": _sanitize_text(raw_award.get("funder_award_id")) or None,
                            "funder": {
                                "id": _sanitize_text(raw_award.get("funder_id")) or None,
                                "display_name": _sanitize_text(raw_award.get("funder_display_name")) or None,
                                "doi": None,
                                "ror": None,
                            },
                            "amount": None,
                            "currency": None,
                            "funding_type": None,
                            "funder_scheme": None,
                            "start_date": None,
                            "end_date": None,
                            "start_year": None,
                            "end_year": None,
                            "landing_page_url": None,
                            "doi": None,
                            "updated_date": None,
                            "supporting_works_count": 0,
                            "supporting_works": [],
                            "_latest_publication_year": work_year or 0,
                            "_supporting_work_ids": set(),
                        }
                        grant_map[dedupe_key] = existing
                    if work_id and work_id not in existing["_supporting_work_ids"]:
                        existing["_supporting_work_ids"].add(work_id)
                        existing["supporting_works_count"] += 1
                        existing["supporting_works"].append(
                            {
                                "id": work_id,
                                "title": work_title or "Untitled work",
                                "publication_year": work_year,
                                "user_author_position": work_author_position,
                            }
                        )
                    existing["_latest_publication_year"] = max(
                        int(existing["_latest_publication_year"]),
                        int(work_year or 0),
                    )

            meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
            next_cursor = _sanitize_text(meta.get("next_cursor"))
            if not next_cursor or next_cursor == cursor:
                break
            cursor = next_cursor
            pages += 1

        grants = list(grant_map.values())
        grants.sort(
            key=lambda item: (
                -max(0, _safe_int(item.get("supporting_works_count"))),
                -max(0, _safe_int(item.get("_latest_publication_year"))),
                _sanitize_text(item.get("funder_award_id")).lower(),
                _sanitize_text((item.get("funder") or {}).get("display_name")).lower(),
            )
        )

        output_items: list[dict[str, Any]] = []
        for item in grants:
            enriched = _merge_award_details(
                item,
                _lookup_award_detail(
                    client=client,
                    mailto=mailto,
                    award_id=item.get("openalex_award_id"),
                    funder_id=(item.get("funder") or {}).get("id"),
                    funder_award_id=item.get("funder_award_id"),
                ),
            )
            relationship_payload = _classify_grant_relationship(
                item=enriched,
                target_first_name=clean_first_name,
                target_last_name=clean_last_name,
                target_display_name=_sanitize_text(author.get("display_name")),
                target_orcid=_normalize_orcid(author.get("orcid")),
            )
            relation = str(relationship_payload.get("relationship_to_person") or "").strip()
            if relationship_filter == "won" and relation != "won_by_person":
                continue
            if relationship_filter == "published_under" and relation == "won_by_person":
                continue
            supporting = list(enriched.get("supporting_works") or [])
            supporting.sort(
                key=lambda work: (
                    -max(0, _safe_int(work.get("publication_year"))),
                    _sanitize_text(work.get("title")).lower(),
                )
            )
            output_items.append(
                {
                    "openalex_award_id": enriched.get("openalex_award_id"),
                    "display_name": enriched.get("display_name"),
                    "description": enriched.get("description"),
                    "funder_award_id": enriched.get("funder_award_id"),
                    "funder": enriched.get("funder") or {
                        "id": None,
                        "display_name": None,
                        "doi": None,
                        "ror": None,
                    },
                    "amount": enriched.get("amount"),
                    "currency": enriched.get("currency"),
                    "funding_type": enriched.get("funding_type"),
                    "funder_scheme": enriched.get("funder_scheme"),
                    "start_date": enriched.get("start_date"),
                    "end_date": enriched.get("end_date"),
                    "start_year": enriched.get("start_year"),
                    "end_year": enriched.get("end_year"),
                    "landing_page_url": enriched.get("landing_page_url"),
                    "doi": enriched.get("doi"),
                    "updated_date": enriched.get("updated_date"),
                    "supporting_works_count": max(
                        0, _safe_int(enriched.get("supporting_works_count"))
                    ),
                    "supporting_works": supporting[:8],
                    "relationship_to_person": relationship_payload.get("relationship_to_person"),
                    "grant_owner_name": relationship_payload.get("grant_owner_name"),
                    "grant_owner_role": relationship_payload.get("grant_owner_role"),
                    "grant_owner_orcid": relationship_payload.get("grant_owner_orcid"),
                    "grant_owner_is_target_person": bool(
                        relationship_payload.get("grant_owner_is_target_person")
                    ),
                    "award_holders": list(relationship_payload.get("award_holders") or []),
                    "person_role": _persona_role_from_relationship(
                        relationship_to_person=relation,
                        grant_owner_role=relationship_payload.get("grant_owner_role"),
                    ),
                    "source": OPENALEX_SOURCE_PROVIDER,
                    "source_timestamp": generated_at,
                }
            )
            if len(output_items) >= clean_limit:
                break

    clean_user_id = _sanitize_text(user_id)
    if clean_user_id:
        try:
            _persist_persona_grant_records(
                user_id=clean_user_id,
                items=output_items,
                source_timestamp_iso=generated_at,
            )
        except Exception:
            logger.exception("Could not persist persona grant records for user_id=%s", clean_user_id)

    return {
        "first_name": clean_first_name,
        "last_name": clean_last_name,
        "full_name": _sanitize_text(f"{clean_first_name} {clean_last_name}"),
        "author": {
            "openalex_author_id": author.get("openalex_author_id"),
            "display_name": author.get("display_name"),
            "orcid": author.get("orcid"),
            "works_count": max(0, _safe_int(author.get("works_count"))),
            "cited_by_count": max(0, _safe_int(author.get("cited_by_count"))),
        },
        "items": output_items,
        "total": len(output_items),
        "relationship_filter": relationship_filter,
        "source": OPENALEX_SOURCE_PROVIDER,
        "generated_at": generated_at,
    }

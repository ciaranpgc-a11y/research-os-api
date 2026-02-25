from __future__ import annotations

import os
import re
import time
from typing import Any

import httpx

RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}


class AffiliationSuggestionValidationError(RuntimeError):
    pass


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        try:
            return int(value.strip())
        except Exception:
            return None
    return None


def _safe_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return None
    return None


def _timeout_seconds() -> float:
    value = _safe_float(os.getenv("AFFILIATION_SUGGEST_TIMEOUT_SECONDS", "10"))
    return max(3.0, min(30.0, value if value is not None else 10.0))


def _retry_count() -> int:
    value = _safe_int(os.getenv("AFFILIATION_SUGGEST_RETRY_COUNT", "2"))
    return max(0, min(6, value if value is not None else 2))


def _openalex_mailto() -> str | None:
    explicit = str(os.getenv("OPENALEX_MAILTO", "")).strip()
    if explicit and "@" in explicit:
        return explicit
    return None


def _sanitize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _nullable_part(value: Any) -> str | None:
    clean = _sanitize_text(value)
    return clean or None


def _build_address(*, city: str | None, region: str | None, country_name: str | None) -> str | None:
    parts = [_sanitize_text(city), _sanitize_text(region), _sanitize_text(country_name)]
    output = ", ".join(part for part in parts if part)
    return output or None


def _build_label(
    *,
    name: str,
    city: str | None,
    country_name: str | None,
    country_code: str | None,
) -> str:
    location = ", ".join(part for part in [_sanitize_text(city), _sanitize_text(country_name)] if part)
    if location:
        return f"{name} ({location})"
    code = _sanitize_text(country_code).upper()
    if code:
        return f"{name} ({code})"
    return name


def _tokenize(value: str) -> set[str]:
    clean = _sanitize_text(value).lower()
    if not clean:
        return set()
    return {token for token in re.split(r"[^a-z0-9]+", clean) if len(token) >= 2}


def _jaccard_similarity(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    overlap = sum(1 for token in left if token in right)
    union = len(left) + len(right) - overlap
    if union <= 0:
        return 0.0
    return overlap / union


def _metadata_score(item: dict[str, Any]) -> int:
    score = 0
    if item.get("city"):
        score += 2
    if item.get("region"):
        score += 1
    if item.get("country_name"):
        score += 2
    if item.get("country_code"):
        score += 1
    if item.get("address"):
        score += 2
    return score


def _dedupe_key(item: dict[str, Any]) -> str:
    name = _sanitize_text(item.get("name")).lower()
    country = _sanitize_text(item.get("country_code") or item.get("country_name")).lower()
    return f"{name}|{country}"


def _merge_items(primary: dict[str, Any], secondary: dict[str, Any]) -> dict[str, Any]:
    preferred = primary
    fallback = secondary
    if _metadata_score(secondary) > _metadata_score(primary):
        preferred = secondary
        fallback = primary
    merged = {
        **preferred,
        "country_code": preferred.get("country_code") or fallback.get("country_code"),
        "country_name": preferred.get("country_name") or fallback.get("country_name"),
        "city": preferred.get("city") or fallback.get("city"),
        "region": preferred.get("region") or fallback.get("region"),
        "address": preferred.get("address") or fallback.get("address"),
    }
    merged["label"] = _build_label(
        name=str(merged.get("name") or ""),
        city=_nullable_part(merged.get("city")),
        country_name=_nullable_part(merged.get("country_name")),
        country_code=_nullable_part(merged.get("country_code")),
    )
    return merged


def _request_json(
    *,
    client: httpx.Client,
    url: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    retries = _retry_count()
    for attempt in range(retries + 1):
        try:
            response = client.get(url, params=params)
        except Exception:
            if attempt < retries:
                time.sleep(0.3 * (attempt + 1))
                continue
            return {}
        if response.status_code < 400:
            payload = response.json()
            return payload if isinstance(payload, dict) else {}
        if response.status_code not in RETRYABLE_STATUS_CODES or attempt >= retries:
            return {}
        time.sleep(0.3 * (attempt + 1))
    return {}


def _fetch_openalex(
    *,
    client: httpx.Client,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "search": query,
        "per-page": max(1, min(limit, 8)),
    }
    mailto = _openalex_mailto()
    if mailto:
        params["mailto"] = mailto
    payload = _request_json(
        client=client,
        url="https://api.openalex.org/institutions",
        params=params,
    )
    results = payload.get("results") if isinstance(payload.get("results"), list) else []
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in results:
        if not isinstance(raw, dict):
            continue
        name = _sanitize_text(raw.get("display_name"))
        if not name:
            continue
        geo = raw.get("geo") if isinstance(raw.get("geo"), dict) else {}
        country_code = _sanitize_text(raw.get("country_code")).upper() or None
        country_name = _nullable_part(geo.get("country") or raw.get("country"))
        city = _nullable_part(geo.get("city"))
        region = _nullable_part(geo.get("region"))
        item = {
            "name": name,
            "country_code": country_code,
            "country_name": country_name,
            "city": city,
            "region": region,
            "address": _build_address(city=city, region=region, country_name=country_name),
            "source": "openalex",
        }
        dedupe_key = _dedupe_key(item)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        item["label"] = _build_label(
            name=name,
            city=city,
            country_name=country_name,
            country_code=country_code,
        )
        output.append(item)
        if len(output) >= limit:
            break
    return output


def _extract_ror_name(raw: dict[str, Any]) -> str:
    names = raw.get("names")
    if not isinstance(names, list):
        return ""
    selected: dict[str, Any] | None = None
    for item in names:
        if not isinstance(item, dict):
            continue
        types = item.get("types")
        type_values = [str(value).lower() for value in types] if isinstance(types, list) else []
        if "ror_display" in type_values:
            selected = item
            break
    if selected is None:
        for item in names:
            if not isinstance(item, dict):
                continue
            types = item.get("types")
            type_values = [str(value).lower() for value in types] if isinstance(types, list) else []
            if "label" in type_values:
                selected = item
                break
    if selected is None and names and isinstance(names[0], dict):
        selected = names[0]
    return _sanitize_text(selected.get("value")) if selected else ""


def _fetch_ror(
    *,
    client: httpx.Client,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    payload = _request_json(
        client=client,
        url="https://api.ror.org/organizations",
        params={
            "query": query,
            "page": 1,
        },
    )
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in items:
        if not isinstance(raw, dict):
            continue
        name = _extract_ror_name(raw)
        if not name:
            continue
        locations = raw.get("locations") if isinstance(raw.get("locations"), list) else []
        location = locations[0] if locations and isinstance(locations[0], dict) else {}
        geonames = (
            location.get("geonames_details")
            if isinstance(location.get("geonames_details"), dict)
            else {}
        )
        city = _nullable_part(geonames.get("name"))
        region = _nullable_part(geonames.get("country_subdivision_name"))
        country_code = _sanitize_text(geonames.get("country_code")).upper() or None
        country_name = _nullable_part(geonames.get("country_name"))
        item = {
            "name": name,
            "country_code": country_code,
            "country_name": country_name,
            "city": city,
            "region": region,
            "address": _build_address(city=city, region=region, country_name=country_name),
            "source": "ror",
        }
        dedupe_key = _dedupe_key(item)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        item["label"] = _build_label(
            name=name,
            city=city,
            country_name=country_name,
            country_code=country_code,
        )
        output.append(item)
        if len(output) >= limit:
            break
    return output


def fetch_affiliation_suggestions(*, query: str, limit: int = 8) -> list[dict[str, Any]]:
    clean_query = _sanitize_text(query)
    if len(clean_query) < 2:
        raise AffiliationSuggestionValidationError(
            "Affiliation query must be at least 2 characters."
        )
    clean_limit = max(1, min(8, int(limit)))
    timeout = httpx.Timeout(_timeout_seconds())
    with httpx.Client(timeout=timeout) as client:
        openalex_items = _fetch_openalex(client=client, query=clean_query, limit=clean_limit)
        ror_items = _fetch_ror(client=client, query=clean_query, limit=clean_limit)
    combined = [*openalex_items, *ror_items]
    if not combined:
        return []
    merged_by_key: dict[str, dict[str, Any]] = {}
    for item in combined:
        key = _dedupe_key(item)
        existing = merged_by_key.get(key)
        if existing is None:
            merged_by_key[key] = item
            continue
        merged_by_key[key] = _merge_items(existing, item)
    query_tokens = _tokenize(clean_query)
    ranked = sorted(
        merged_by_key.values(),
        key=lambda item: (
            -_jaccard_similarity(query_tokens, _tokenize(str(item.get("name") or ""))),
            -_metadata_score(item),
            str(item.get("name") or "").lower(),
        ),
    )
    return ranked[:clean_limit]

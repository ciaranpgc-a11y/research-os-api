from __future__ import annotations

from concurrent.futures import (
    ThreadPoolExecutor,
    TimeoutError as FuturesTimeoutError,
    as_completed,
)
import os
import re
from threading import Lock
import time
from typing import Any

import httpx

RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
SUGGESTION_SOURCE_PRIORITY = {
    "ror": 4,
    "openalex": 3,
    "openstreetmap": 2,
    "clearbit": 1,
}
SUGGESTION_CACHE_MAX_ENTRIES = 512
_AFFILIATION_SUGGESTION_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_AFFILIATION_SUGGESTION_CACHE_LOCK = Lock()


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


def _fast_timeout_seconds() -> float:
    value = _safe_float(os.getenv("AFFILIATION_SUGGEST_FAST_TIMEOUT_SECONDS", "1.4"))
    return max(0.6, min(8.0, value if value is not None else 1.4))


def _fast_retry_count() -> int:
    value = _safe_int(os.getenv("AFFILIATION_SUGGEST_FAST_RETRY_COUNT", "0"))
    return max(0, min(2, value if value is not None else 0))


def _suggestion_cache_ttl_seconds() -> float:
    value = _safe_float(os.getenv("AFFILIATION_SUGGEST_CACHE_TTL_SECONDS", "300"))
    return max(10.0, min(3600.0, value if value is not None else 300.0))


def _read_suggestion_cache(cache_key: str) -> list[dict[str, Any]] | None:
    now = time.monotonic()
    ttl_seconds = _suggestion_cache_ttl_seconds()
    with _AFFILIATION_SUGGESTION_CACHE_LOCK:
        cached = _AFFILIATION_SUGGESTION_CACHE.get(cache_key)
        if not cached:
            return None
        cached_at, payload = cached
        if now - cached_at > ttl_seconds:
            _AFFILIATION_SUGGESTION_CACHE.pop(cache_key, None)
            return None
        return [dict(item) for item in payload]


def _write_suggestion_cache(cache_key: str, payload: list[dict[str, Any]]) -> None:
    now = time.monotonic()
    with _AFFILIATION_SUGGESTION_CACHE_LOCK:
        if len(_AFFILIATION_SUGGESTION_CACHE) >= SUGGESTION_CACHE_MAX_ENTRIES:
            oldest_key: str | None = None
            oldest_time = float("inf")
            for key, value in _AFFILIATION_SUGGESTION_CACHE.items():
                if value[0] < oldest_time:
                    oldest_key = key
                    oldest_time = value[0]
            if oldest_key:
                _AFFILIATION_SUGGESTION_CACHE.pop(oldest_key, None)
        _AFFILIATION_SUGGESTION_CACHE[cache_key] = (
            now,
            [dict(item) for item in payload],
        )


def _openalex_mailto() -> str | None:
    explicit = str(os.getenv("OPENALEX_MAILTO", "")).strip()
    if explicit and "@" in explicit:
        return explicit
    return None


def _nominatim_email() -> str | None:
    explicit = str(os.getenv("NOMINATIM_EMAIL", "")).strip()
    if explicit and "@" in explicit:
        return explicit
    return None


def _nominatim_user_agent() -> str:
    explicit = str(os.getenv("NOMINATIM_USER_AGENT", "")).strip()
    if explicit:
        return explicit
    return "research-os-api/1.0 (+https://axiomos.com)"


def _sanitize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _nullable_part(value: Any) -> str | None:
    clean = _sanitize_text(value)
    return clean or None


def _build_label(
    *,
    name: str,
    city: str | None,
    country_name: str | None,
    country_code: str | None,
) -> str:
    location = ", ".join(
        part for part in [_sanitize_text(city), _sanitize_text(country_name)] if part
    )
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
    if item.get("postal_code"):
        score += 2
    return score


def _dedupe_key(item: dict[str, Any]) -> str:
    name = _sanitize_text(item.get("name")).lower()
    country = _sanitize_text(
        item.get("country_code") or item.get("country_name")
    ).lower()
    return f"{name}|{country}"


def _can_merge_name_collision(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_name = _sanitize_text(left.get("name")).lower()
    right_name = _sanitize_text(right.get("name")).lower()
    if not left_name or left_name != right_name:
        return False
    left_country = _sanitize_text(
        left.get("country_code") or left.get("country_name")
    ).lower()
    right_country = _sanitize_text(
        right.get("country_code") or right.get("country_name")
    ).lower()
    if not left_country or not right_country:
        return True
    return left_country == right_country


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
        "postal_code": preferred.get("postal_code") or fallback.get("postal_code"),
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
    headers: dict[str, str] | None = None,
    retry_count: int | None = None,
) -> dict[str, Any]:
    retries = _retry_count() if retry_count is None else max(0, int(retry_count))
    for attempt in range(retries + 1):
        try:
            response = client.get(url, params=params, headers=headers or {})
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


def _request_json_list(
    *,
    client: httpx.Client,
    url: str,
    params: dict[str, Any],
    headers: dict[str, str] | None = None,
    retry_count: int | None = None,
) -> list[dict[str, Any]]:
    retries = _retry_count() if retry_count is None else max(0, int(retry_count))
    for attempt in range(retries + 1):
        try:
            response = client.get(url, params=params, headers=headers or {})
        except Exception:
            if attempt < retries:
                time.sleep(0.3 * (attempt + 1))
                continue
            return []
        if response.status_code < 400:
            payload = response.json()
            if isinstance(payload, list):
                return [item for item in payload if isinstance(item, dict)]
            return []
        if response.status_code not in RETRYABLE_STATUS_CODES or attempt >= retries:
            return []
        time.sleep(0.3 * (attempt + 1))
    return []


def _fetch_openalex(
    *,
    client: httpx.Client,
    query: str,
    limit: int,
    retry_count: int | None = None,
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
        retry_count=retry_count,
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
            "address": None,
            "postal_code": None,
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
        type_values = (
            [str(value).lower() for value in types] if isinstance(types, list) else []
        )
        if "ror_display" in type_values:
            selected = item
            break
    if selected is None:
        for item in names:
            if not isinstance(item, dict):
                continue
            types = item.get("types")
            type_values = (
                [str(value).lower() for value in types]
                if isinstance(types, list)
                else []
            )
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
    retry_count: int | None = None,
) -> list[dict[str, Any]]:
    payload = _request_json(
        client=client,
        url="https://api.ror.org/organizations",
        params={
            "query": query,
            "page": 1,
        },
        retry_count=retry_count,
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
        locations = (
            raw.get("locations") if isinstance(raw.get("locations"), list) else []
        )
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
            "address": None,
            "postal_code": None,
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


def _candidate_name_from_nominatim_item(item: dict[str, Any]) -> str:
    address = item.get("address") if isinstance(item.get("address"), dict) else {}
    return (
        _first_non_empty_address_part(
            address,
            (
                "university",
                "hospital",
                "college",
                "school",
                "research_institute",
                "laboratory",
                "clinic",
                "organisation",
                "building",
                "amenity",
            ),
        )
        or _sanitize_text(str(item.get("display_name") or "").split(",", maxsplit=1)[0])
        or ""
    )


def _should_keep_nominatim_suggestion(
    *,
    item: dict[str, Any],
    candidate_name: str,
    query_tokens: set[str],
) -> bool:
    if not candidate_name:
        return False
    lowered_name = candidate_name.lower()
    if re.search(r"\bstand\s+[a-z0-9]+\b", lowered_name):
        return False
    category = _sanitize_text(item.get("category")).lower()
    location_type = _sanitize_text(item.get("type")).lower()
    if location_type in {
        "bus_stop",
        "platform",
        "station",
        "tram_stop",
        "crossing",
        "steps",
        "traffic_signals",
        "service",
    }:
        return False
    relevance = _jaccard_similarity(query_tokens, _tokenize(candidate_name))
    if relevance >= 0.28:
        return True
    if location_type in {
        "university",
        "college",
        "school",
        "hospital",
        "research_institute",
        "clinic",
        "laboratory",
    }:
        return True
    return (
        category in {"amenity", "building", "office", "commercial"} and relevance >= 0.2
    )


def _fetch_nominatim_suggestions(
    *,
    client: httpx.Client,
    query: str,
    limit: int,
    retry_count: int | None = None,
) -> list[dict[str, Any]]:
    query_tokens = _tokenize(query)
    params: dict[str, Any] = {
        "q": query,
        "format": "jsonv2",
        "addressdetails": 1,
        "limit": max(1, min(limit * 2, 16)),
    }
    email = _nominatim_email()
    if email:
        params["email"] = email
    items = _request_json_list(
        client=client,
        url="https://nominatim.openstreetmap.org/search",
        params=params,
        headers={"User-Agent": _nominatim_user_agent()},
        retry_count=retry_count,
    )
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in items:
        if not isinstance(raw, dict):
            continue
        name = _sanitize_text(_candidate_name_from_nominatim_item(raw))
        if not _should_keep_nominatim_suggestion(
            item=raw,
            candidate_name=name,
            query_tokens=query_tokens,
        ):
            continue
        address = raw.get("address") if isinstance(raw.get("address"), dict) else {}
        city = _first_non_empty_address_part(
            address,
            ("city", "town", "village", "hamlet", "municipality"),
        )
        region = _first_non_empty_address_part(address, ("state", "region", "county"))
        country_name = _nullable_part(address.get("country"))
        country_code = _sanitize_text(address.get("country_code")).upper() or None
        item = {
            "name": name,
            "country_code": country_code,
            "country_name": country_name,
            "city": city,
            "region": region,
            "address": _nominatim_line_1(address),
            "postal_code": _nullable_part(address.get("postcode")),
            "source": "openstreetmap",
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


def _fetch_clearbit(
    *,
    client: httpx.Client,
    query: str,
    limit: int,
    retry_count: int | None = None,
) -> list[dict[str, Any]]:
    rows = _request_json_list(
        client=client,
        url="https://autocomplete.clearbit.com/v1/companies/suggest",
        params={"query": query},
        retry_count=retry_count,
    )
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = _sanitize_text(row.get("name"))
        if not name:
            continue
        item = {
            "name": name,
            "country_code": None,
            "country_name": None,
            "city": None,
            "region": None,
            "address": None,
            "postal_code": None,
            "source": "clearbit",
        }
        key = _dedupe_key(item)
        if key in seen:
            continue
        seen.add(key)
        item["label"] = _build_label(
            name=name,
            city=None,
            country_name=None,
            country_code=None,
        )
        output.append(item)
        if len(output) >= limit:
            break
    return output


def _fetch_openalex_provider(*, query: str, limit: int) -> list[dict[str, Any]]:
    timeout = httpx.Timeout(_fast_timeout_seconds())
    with httpx.Client(timeout=timeout) as client:
        return _fetch_openalex(
            client=client,
            query=query,
            limit=limit,
            retry_count=_fast_retry_count(),
        )


def _fetch_ror_provider(*, query: str, limit: int) -> list[dict[str, Any]]:
    timeout = httpx.Timeout(_fast_timeout_seconds())
    with httpx.Client(timeout=timeout) as client:
        return _fetch_ror(
            client=client,
            query=query,
            limit=limit,
            retry_count=_fast_retry_count(),
        )


def _fetch_openstreetmap_provider(*, query: str, limit: int) -> list[dict[str, Any]]:
    timeout = httpx.Timeout(_fast_timeout_seconds())
    with httpx.Client(timeout=timeout) as client:
        return _fetch_nominatim_suggestions(
            client=client,
            query=query,
            limit=limit,
            retry_count=_fast_retry_count(),
        )


def _fetch_clearbit_provider(*, query: str, limit: int) -> list[dict[str, Any]]:
    timeout = httpx.Timeout(_fast_timeout_seconds())
    with httpx.Client(timeout=timeout) as client:
        return _fetch_clearbit(
            client=client,
            query=query,
            limit=limit,
            retry_count=_fast_retry_count(),
        )


def _fetch_provider_suggestions_parallel(
    *, query: str, limit: int
) -> list[dict[str, Any]]:
    providers = [
        _fetch_ror_provider,
        _fetch_openalex_provider,
        _fetch_clearbit_provider,
    ]
    if len(query) >= 4:
        providers.append(_fetch_openstreetmap_provider)
    output: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=len(providers)) as executor:
        futures = [
            executor.submit(provider, query=query, limit=limit)
            for provider in providers
        ]
        timeout_budget = _fast_timeout_seconds() + 0.2
        try:
            for future in as_completed(futures, timeout=timeout_budget):
                try:
                    rows = future.result()
                except Exception:
                    rows = []
                if rows:
                    output.extend(rows)
        except FuturesTimeoutError:
            pass
        for future in futures:
            if not future.done():
                future.cancel()
    return output


def _source_priority(value: Any) -> int:
    return SUGGESTION_SOURCE_PRIORITY.get(_sanitize_text(value).lower(), 0)


def fetch_affiliation_suggestions(
    *, query: str, limit: int = 8
) -> list[dict[str, Any]]:
    clean_query = _sanitize_text(query)
    if len(clean_query) < 2:
        raise AffiliationSuggestionValidationError(
            "Affiliation query must be at least 2 characters."
        )
    clean_limit = max(1, min(8, int(limit)))
    cache_key = f"{clean_query.lower()}|{clean_limit}"
    cached = _read_suggestion_cache(cache_key)
    if cached is not None:
        return cached[:clean_limit]

    combined = _fetch_provider_suggestions_parallel(
        query=clean_query, limit=clean_limit
    )
    if not combined:
        _write_suggestion_cache(cache_key, [])
        return []
    merged_by_key: dict[str, dict[str, Any]] = {}
    for item in combined:
        key = _dedupe_key(item)
        existing = merged_by_key.get(key)
        if existing is None:
            merged_by_key[key] = item
            continue
        merged_by_key[key] = _merge_items(existing, item)
    merged_items = list(merged_by_key.values())
    if len(merged_items) > 1:
        collapsed: list[dict[str, Any]] = []
        for candidate in merged_items:
            merged = False
            for index, existing in enumerate(collapsed):
                if _can_merge_name_collision(existing, candidate):
                    collapsed[index] = _merge_items(existing, candidate)
                    merged = True
                    break
            if not merged:
                collapsed.append(candidate)
        merged_items = collapsed
    query_tokens = _tokenize(clean_query)
    ranked = sorted(
        merged_items,
        key=lambda item: (
            -_jaccard_similarity(query_tokens, _tokenize(str(item.get("name") or ""))),
            -_source_priority(item.get("source")),
            -_metadata_score(item),
            str(item.get("name") or "").lower(),
        ),
    )
    final_items = ranked[:clean_limit]
    _write_suggestion_cache(cache_key, final_items)
    return [dict(item) for item in final_items]


def _first_non_empty_address_part(
    address: dict[str, Any],
    keys: tuple[str, ...],
) -> str | None:
    for key in keys:
        value = _nullable_part(address.get(key))
        if value:
            return value
    return None


def _nominatim_line_1(address: dict[str, Any]) -> str | None:
    house_number = _nullable_part(address.get("house_number"))
    road = _first_non_empty_address_part(
        address,
        ("road", "pedestrian", "footway", "path", "cycleway"),
    )
    if house_number and road:
        return f"{house_number} {road}"
    if road:
        return road
    return _first_non_empty_address_part(
        address,
        (
            "university",
            "hospital",
            "building",
            "amenity",
            "office",
            "organisation",
            "industrial",
            "commercial",
        ),
    )


def _resolve_location_from_nominatim_item(
    *,
    item: dict[str, Any],
    query_name: str,
    expected_city: str | None = None,
    expected_region: str | None = None,
    expected_country: str | None = None,
) -> tuple[float, dict[str, Any]]:
    address = item.get("address") if isinstance(item.get("address"), dict) else {}
    display_name = _sanitize_text(item.get("display_name"))
    category = _sanitize_text(item.get("category")).lower()
    location_type = _sanitize_text(item.get("type")).lower()
    display_head = _sanitize_text(
        display_name.split(",", maxsplit=1)[0] if display_name else ""
    )
    candidate_name = " ".join(
        part
        for part in [
            _nullable_part(address.get("university")),
            _nullable_part(address.get("hospital")),
            _nullable_part(address.get("college")),
            _nullable_part(address.get("school")),
            _nullable_part(address.get("building")),
            _nullable_part(address.get("amenity")),
            display_head,
        ]
        if part
    )
    relevance = _jaccard_similarity(_tokenize(query_name), _tokenize(candidate_name))
    line_1 = _nominatim_line_1(address)
    city = _first_non_empty_address_part(
        address,
        ("city", "town", "village", "hamlet", "municipality"),
    )
    region = _first_non_empty_address_part(
        address,
        ("state", "region", "county"),
    )
    postal_code = _nullable_part(address.get("postcode"))
    country_name = _nullable_part(address.get("country"))
    country_code = _nullable_part(address.get("country_code"))
    metadata_score = 0
    if line_1:
        metadata_score += 2
    if city:
        metadata_score += 2
    if region:
        metadata_score += 1
    if postal_code:
        metadata_score += 2
    if country_name:
        metadata_score += 2
    expected_city_clean = _sanitize_text(expected_city).lower() if expected_city else ""
    expected_region_clean = (
        _sanitize_text(expected_region).lower() if expected_region else ""
    )
    expected_country_clean = (
        _sanitize_text(expected_country).lower() if expected_country else ""
    )
    city_clean = _sanitize_text(city).lower() if city else ""
    region_clean = _sanitize_text(region).lower() if region else ""
    country_name_clean = _sanitize_text(country_name).lower() if country_name else ""
    location_match_bonus = 0.0
    if expected_city_clean:
        if city_clean and (
            expected_city_clean in city_clean or city_clean in expected_city_clean
        ):
            location_match_bonus += 6.0
        elif city_clean:
            location_match_bonus -= 3.0
        else:
            location_match_bonus -= 1.0
    if expected_region_clean:
        if region_clean and (
            expected_region_clean in region_clean
            or region_clean in expected_region_clean
        ):
            location_match_bonus += 4.0
        elif region_clean:
            location_match_bonus -= 2.0
        else:
            location_match_bonus -= 1.0
    if expected_country_clean:
        if country_name_clean and (
            expected_country_clean in country_name_clean
            or country_name_clean in expected_country_clean
        ):
            location_match_bonus += 3.0
        elif country_name_clean:
            location_match_bonus -= 8.0
        else:
            location_match_bonus -= 2.0

    category_boost = 0.0
    if category in {"amenity", "building", "office"}:
        category_boost += 2.0
    if location_type in {
        "university",
        "college",
        "school",
        "hospital",
        "research_institute",
    }:
        category_boost += 4.0
    if location_type in {
        "administrative",
        "water",
        "river",
        "lake",
        "bay",
        "sea",
        "ocean",
        "city",
        "town",
    }:
        category_boost -= 8.0
    if category in {"natural", "waterway", "boundary", "highway", "landuse"}:
        category_boost -= 4.0
    if relevance < 0.2:
        category_boost -= 3.0

    importance = 0.0
    raw_importance = item.get("importance")
    if isinstance(raw_importance, (int, float)):
        importance = float(raw_importance)
    elif isinstance(raw_importance, str):
        try:
            importance = float(raw_importance)
        except Exception:
            importance = 0.0
    composite = (
        (relevance * 12.0)
        + metadata_score
        + location_match_bonus
        + category_boost
        + (importance * 0.5)
    )
    payload = {
        "line_1": line_1,
        "city": city,
        "region": region,
        "postal_code": postal_code,
        "country_name": country_name,
        "country_code": country_code.upper() if country_code else None,
        "formatted": display_name or None,
        "source": "openstreetmap",
    }
    return composite, payload


def resolve_affiliation_address(
    *,
    name: str,
    city: str | None = None,
    region: str | None = None,
    country: str | None = None,
) -> dict[str, Any] | None:
    clean_name = _sanitize_text(name)
    if len(clean_name) < 2:
        raise AffiliationSuggestionValidationError(
            "Affiliation name must be at least 2 characters."
        )
    clean_city = _nullable_part(city)
    clean_region = _nullable_part(region)
    clean_country = _nullable_part(country)
    timeout = httpx.Timeout(_timeout_seconds())
    query_variants = [clean_name]
    location_hint = ", ".join(
        part for part in [clean_city, clean_region, clean_country] if part
    )
    if location_hint:
        query_variants.append(f"{clean_name}, {location_hint}")
    email = _nominatim_email()
    headers = {
        "User-Agent": _nominatim_user_agent(),
    }
    all_items: list[dict[str, Any]] = []
    with httpx.Client(timeout=timeout) as client:
        for variant in query_variants:
            params: dict[str, Any] = {
                "q": variant,
                "format": "jsonv2",
                "addressdetails": 1,
                "limit": 8,
            }
            if email:
                params["email"] = email
            items = _request_json_list(
                client=client,
                url="https://nominatim.openstreetmap.org/search",
                params=params,
                headers=headers,
            )
            if items:
                all_items.extend(items)
    if not all_items:
        return None
    unique_items: list[dict[str, Any]] = []
    seen_place_ids: set[str] = set()
    for item in all_items:
        place_id = _sanitize_text(item.get("place_id"))
        if place_id and place_id in seen_place_ids:
            continue
        if place_id:
            seen_place_ids.add(place_id)
        unique_items.append(item)
    resolved_candidates = [
        _resolve_location_from_nominatim_item(
            item=item,
            query_name=clean_name,
            expected_city=clean_city,
            expected_region=clean_region,
            expected_country=clean_country,
        )
        for item in unique_items
    ]
    resolved_candidates.sort(key=lambda value: value[0], reverse=True)
    best = resolved_candidates[0][1] if resolved_candidates else None
    if not best:
        return None
    return {
        "resolved": True,
        "name": clean_name,
        "line_1": best.get("line_1"),
        "city": best.get("city"),
        "region": best.get("region"),
        "postal_code": best.get("postal_code"),
        "country_name": best.get("country_name"),
        "country_code": best.get("country_code"),
        "formatted": best.get("formatted"),
        "source": best.get("source"),
    }

from __future__ import annotations

import re
from typing import Any

_OPENALEX_PREFIX_PATTERN = re.compile(r"^https?://openalex\.org/", re.IGNORECASE)
_ISSN_STRIP_PATTERN = re.compile(r"[^0-9Xx]")


def extract_openalex_source_id(value: Any) -> str | None:
    clean = str(value or "").strip().rstrip("/")
    if not clean:
        return None
    clean = _OPENALEX_PREFIX_PATTERN.sub("", clean).strip().strip("/")
    if not clean:
        return None
    token = clean.split("/")[-1].strip().upper()
    if not token.startswith("S"):
        return None
    return token


def normalize_issn(value: Any) -> str | None:
    clean = _ISSN_STRIP_PATTERN.sub("", str(value or "").strip())
    if len(clean) != 8:
        return None
    return f"{clean[:4]}-{clean[4:]}".upper()


def normalize_issns(values: Any) -> list[str]:
    if isinstance(values, str):
        candidates = re.split(r"[,;]", values)
    elif isinstance(values, (list, tuple, set)):
        candidates = list(values)
    else:
        candidates = []
    normalized: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        clean = normalize_issn(candidate)
        if clean is None or clean in seen:
            continue
        seen.add(clean)
        normalized.append(clean)
    return normalized


def normalize_venue_type(value: Any) -> str | None:
    clean = re.sub(r"[\s_]+", "-", str(value or "").strip().lower())
    return clean or None

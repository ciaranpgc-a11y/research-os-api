from __future__ import annotations

import re
from typing import Any


SUPPLEMENTARY_TITLE_PATTERNS = (
    re.compile(r"^additional\s+file\s+\d+\s+of\s+(?P<parent>.+)$", re.IGNORECASE),
    re.compile(
        r"^supplement(?:ary|al)\s+(?:file|figure|table|appendix|appendices|material|materials|data|dataset|information)\s*(?:\d+)?\s*(?:for|of|to)\s+(?P<parent>.+)$",
        re.IGNORECASE,
    ),
    re.compile(
        r"^supplement(?:ary|al)\s+material(?:s)?\s*(?:for|of|to)\s+(?P<parent>.+)$",
        re.IGNORECASE,
    ),
)


def _value(record: Any, key: str) -> Any:
    if isinstance(record, dict):
        return record.get(key)
    return getattr(record, key, None)


def normalize_compact_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def normalized_text_key(value: Any) -> str:
    return normalize_compact_text(value).lower()


def extract_parent_publication_title(value: Any) -> str | None:
    title = normalize_compact_text(value)
    if not title:
        return None
    for pattern in SUPPLEMENTARY_TITLE_PATTERNS:
        match = pattern.match(title)
        if not match:
            continue
        parent = normalize_compact_text(match.group("parent"))
        return parent.rstrip(" .;:,") or None
    return None


def supplementary_link_url(record: Any) -> str | None:
    url = normalize_compact_text(_value(record, "url"))
    if url:
        return url
    doi = normalize_compact_text(_value(record, "doi"))
    if not doi:
        return None
    if doi.lower().startswith("https://doi.org/"):
        return doi
    return f"https://doi.org/{doi}"


def is_supplementary_material_work(record: Any) -> bool:
    parent_title = extract_parent_publication_title(_value(record, "title"))
    if not parent_title:
        return False

    work_type = normalized_text_key(_value(record, "work_type"))
    venue_name = normalized_text_key(
        _value(record, "venue_name")
        or _value(record, "journal")
        or _value(record, "journal_name")
    )
    publisher = normalized_text_key(_value(record, "publisher"))
    url = normalized_text_key(_value(record, "url"))

    return bool(
        "figshare" in venue_name
        or "figshare" in publisher
        or "figshare" in url
        or work_type in {"data-set", "dataset"}
    )


def primary_publication_records(records: list[Any]) -> list[Any]:
    return [record for record in records if not is_supplementary_material_work(record)]

from collections import OrderedDict
from typing import Literal


class CitationRecordNotFoundError(Exception):
    """Raised when one or more citation IDs cannot be resolved."""


_CITATION_LIBRARY: list[dict[str, str | int]] = [
    {
        "id": "CIT-001",
        "title": "TRIPOD+AI: Updated reporting guidance for clinical prediction models",
        "authors": "Collins GS; Moons KGM; Dhiman P; et al.",
        "journal": "BMJ",
        "year": 2024,
        "doi": "10.1136/bmj-2024-079234",
        "url": "https://doi.org/10.1136/bmj-2024-079234",
        "citation_text": "Collins GS, Moons KGM, Dhiman P, et al. TRIPOD+AI. BMJ. 2024.",
    },
    {
        "id": "CIT-002",
        "title": "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure",
        "authors": "McDonagh TA; Metra M; Adamo M; et al.",
        "journal": "European Heart Journal",
        "year": 2023,
        "doi": "10.1093/eurheartj/ehad195",
        "url": "https://doi.org/10.1093/eurheartj/ehad195",
        "citation_text": "McDonagh TA, Metra M, Adamo M, et al. Eur Heart J. 2023;44:3599-3726.",
    },
    {
        "id": "CIT-003",
        "title": "Regression Modeling Strategies for Biomedical Applications",
        "authors": "Harrell FE",
        "journal": "Springer",
        "year": 2024,
        "doi": "",
        "url": "https://link.springer.com/book/10.1007/978-3-031-42384-1",
        "citation_text": "Harrell FE. Regression Modeling Strategies. Springer; 2024.",
    },
    {
        "id": "CIT-004",
        "title": "Best practices for subgroup analyses in randomized and observational studies",
        "authors": "Wang R; Lagakos SW; Ware JH; et al.",
        "journal": "JAMA",
        "year": 2022,
        "doi": "10.1001/jama.2022.13188",
        "url": "https://doi.org/10.1001/jama.2022.13188",
        "citation_text": "Wang R, Lagakos SW, Ware JH, et al. JAMA. 2022;328(10):903-911.",
    },
    {
        "id": "CIT-005",
        "title": "ICMJE Recommendations for the Conduct, Reporting, Editing, and Publication of Scholarly Work",
        "authors": "International Committee of Medical Journal Editors",
        "journal": "ICMJE",
        "year": 2025,
        "doi": "",
        "url": "https://www.icmje.org/recommendations/",
        "citation_text": "ICMJE Recommendations. Updated 2025.",
    },
]

_CLAIM_CITATION_IDS: dict[str, list[str]] = {
    "intro-p1": ["CIT-002", "CIT-005"],
    "methods-p1": ["CIT-003"],
    "results-p1": ["CIT-001"],
    "discussion-p1": ["CIT-004"],
}


def _citation_lookup() -> dict[str, dict[str, str | int]]:
    return {record["id"]: record for record in _CITATION_LIBRARY}


def list_citation_records(query: str = "", limit: int = 50) -> list[dict[str, str | int]]:
    normalized = query.strip().lower()
    candidates = _CITATION_LIBRARY
    if normalized:
        candidates = [
            record
            for record in _CITATION_LIBRARY
            if normalized
            in " ".join(
                [
                    str(record["id"]),
                    str(record["title"]),
                    str(record["authors"]),
                    str(record["journal"]),
                    str(record["year"]),
                    str(record["citation_text"]),
                ]
            ).lower()
        ]
    return candidates[:limit]


def _validate_citation_ids(citation_ids: list[str]) -> list[str]:
    lookup = _citation_lookup()
    missing = [citation_id for citation_id in citation_ids if citation_id not in lookup]
    if missing:
        raise CitationRecordNotFoundError(
            "Unknown citation IDs: " + ", ".join(sorted(missing))
        )
    unique_ids = list(OrderedDict.fromkeys(citation_ids))
    return unique_ids


def _build_claim_citation_state(
    claim_id: str, citation_ids: list[str], required_slots: int
) -> dict[str, object]:
    lookup = _citation_lookup()
    attached = [lookup[citation_id] for citation_id in citation_ids]
    return {
        "claim_id": claim_id,
        "required_slots": required_slots,
        "attached_citation_ids": citation_ids,
        "attached_citations": attached,
        "missing_slots": max(0, required_slots - len(citation_ids)),
    }


def get_claim_citation_state(claim_id: str, required_slots: int = 0) -> dict[str, object]:
    citation_ids = list(_CLAIM_CITATION_IDS.get(claim_id, []))
    citation_ids = _validate_citation_ids(citation_ids)
    return _build_claim_citation_state(claim_id, citation_ids, required_slots)


def set_claim_citations(
    claim_id: str, citation_ids: list[str], required_slots: int = 0
) -> dict[str, object]:
    validated_ids = _validate_citation_ids(citation_ids)
    _CLAIM_CITATION_IDS[claim_id] = validated_ids
    return _build_claim_citation_state(claim_id, validated_ids, required_slots)


def _resolve_export_ids(
    citation_ids: list[str] | None, claim_id: str | None
) -> list[str]:
    if citation_ids:
        return _validate_citation_ids(citation_ids)
    if claim_id:
        return _validate_citation_ids(list(_CLAIM_CITATION_IDS.get(claim_id, [])))
    return []


def _resolve_claim_ids_to_citations(claim_ids: list[str] | None) -> list[str]:
    if not claim_ids:
        return []
    flattened: list[str] = []
    for claim_id in claim_ids:
        key = claim_id.strip()
        if not key:
            continue
        flattened.extend(_CLAIM_CITATION_IDS.get(key, []))
    return _validate_citation_ids(flattened) if flattened else []


def _format_reference_line(
    record: dict[str, str | int], style: Literal["vancouver", "ama"]
) -> str:
    if style == "ama":
        authors = str(record["authors"]).replace(";", ",")
        title = str(record["title"]).rstrip(".")
        journal = str(record["journal"])
        year = str(record["year"])
        return f"{authors}. {title}. {journal}. {year}."
    return str(record["citation_text"])


def export_citation_references(
    citation_ids: list[str] | None = None, claim_id: str | None = None
) -> tuple[str, str]:
    ids = _resolve_export_ids(citation_ids, claim_id)
    lookup = _citation_lookup()
    lines: list[str] = []
    lines.append("# AAWE References Export")
    lines.append("")
    if claim_id:
        lines.append(f"- Claim: `{claim_id}`")
    lines.append(f"- Total citations: {len(ids)}")
    lines.append("")

    if not ids:
        lines.append("No citations selected.")
    else:
        for index, citation_id in enumerate(ids, start=1):
            record = lookup[citation_id]
            lines.append(f"{index}. {record['citation_text']}")
            if record.get("doi"):
                lines.append(f"   DOI: {record['doi']}")
            if record.get("url"):
                lines.append(f"   URL: {record['url']}")
            lines.append("")

    return ("aawe-references.txt", "\n".join(lines).strip() + "\n")


def export_reference_pack(
    *,
    style: Literal["vancouver", "ama"] = "vancouver",
    claim_ids: list[str] | None = None,
    citation_ids: list[str] | None = None,
    include_urls: bool = True,
) -> tuple[str, str]:
    if citation_ids:
        resolved_ids = _validate_citation_ids(citation_ids)
    elif claim_ids:
        resolved_ids = _resolve_claim_ids_to_citations(claim_ids)
    else:
        resolved_ids = _resolve_claim_ids_to_citations(list(_CLAIM_CITATION_IDS.keys()))

    lookup = _citation_lookup()
    lines: list[str] = []
    lines.append("# AAWE Reference Pack")
    lines.append("")
    lines.append(f"- Style: {style.upper()}")
    lines.append(f"- Total citations: {len(resolved_ids)}")
    if claim_ids:
        lines.append(f"- Claims: {', '.join(claim_ids)}")
    lines.append("")

    if not resolved_ids:
        lines.append("No citations selected.")
        lines.append("")
    else:
        for index, citation_id in enumerate(resolved_ids, start=1):
            record = lookup[citation_id]
            reference_line = _format_reference_line(record, style)
            lines.append(f"{index}. {reference_line}")
            if record.get("doi"):
                lines.append(f"   DOI: {record['doi']}")
            if include_urls and record.get("url"):
                lines.append(f"   URL: {record['url']}")
            lines.append("")

    filename = f"aawe-reference-pack-{style}.txt"
    return filename, "\n".join(lines).strip() + "\n"

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


_INLINE_CITATION_RE = re.compile(r"\{\{cite:([^}]+)\}\}")
_BODY_CANONICAL_MAPS = {
    "introduction",
    "methods",
    "results",
    "discussion",
    "conclusions",
    "case_report",
}
_EXPECTED_PROVENANCE_FIELDS = (
    "structured_abstract_status",
    "structured_abstract_format",
    "parser_version",
    "full_text_generation_method",
    "parser_provider",
    "grobid_base_url",
    "parse_duration_ms",
    "asset_enrichment_status",
    "parse_steps",
)
_SEVERITY_RANK = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
    "info": 0,
}


def _as_mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_items(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _safe_ratio(*, numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_kind(value: Any) -> str:
    return _normalize_text(value).lower()


def _finding(
    *,
    code: str,
    severity: str,
    message: str,
    evidence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "message": message,
        "evidence": evidence or {},
    }


def _highest_severity(findings: list[dict[str, Any]]) -> str:
    if not findings:
        return "none"
    return max(
        (str(finding.get("severity") or "info") for finding in findings),
        key=lambda severity: _SEVERITY_RANK.get(severity, -1),
    )


def _readiness_summary(
    *,
    response: dict[str, Any],
    document: dict[str, Any],
    sections: list[dict[str, Any]],
) -> dict[str, Any]:
    response_status = _normalize_text(response.get("status")) or "UNKNOWN"
    parser_status = _normalize_text(document.get("parser_status")) or "UNKNOWN"
    has_full_text_sections = bool(document.get("has_full_text_sections")) or any(
        _normalize_kind(section.get("source")) == "grobid" for section in sections
    )
    return {
        "response_status": response_status,
        "parser_status": parser_status,
        "has_viewable_pdf": bool(document.get("has_viewable_pdf")),
        "has_full_text_sections": has_full_text_sections,
        "reader_entry_available": bool(document.get("reader_entry_available")),
        "search_ready": bool(document.get("search_ready")),
    }


def audit_publication_reader_response(response: dict[str, Any]) -> dict[str, Any]:
    payload = _as_mapping(response.get("payload")) or response
    metadata = _as_mapping(payload.get("metadata"))
    document = _as_mapping(payload.get("document"))
    provenance = _as_mapping(payload.get("provenance"))
    sections = _as_items(payload.get("sections"))
    figures = _as_items(payload.get("figures"))
    tables = _as_items(payload.get("tables"))
    references = _as_items(payload.get("references"))
    reference_id_map = _as_mapping(payload.get("reference_id_map"))

    readiness = _readiness_summary(response=response, document=document, sections=sections)
    parser_status = readiness["parser_status"]
    is_full_text_ready = parser_status == "FULL_TEXT_READY"

    section_anchor_known = sum(1 for section in sections if section.get("page_start") is not None)
    figure_anchor_known = sum(1 for figure in figures if figure.get("page_start") is not None)
    table_anchor_known = sum(1 for table in tables if table.get("page_start") is not None)

    figure_surface_count = sum(1 for figure in figures if _normalize_text(figure.get("image_data")))
    table_surface_count = sum(1 for table in tables if _normalize_text(table.get("structured_html")))

    section_ids = {
        _normalize_text(section.get("id")): section
        for section in sections
        if _normalize_text(section.get("id"))
    }
    duplicate_section_ids = [
        section_id
        for section_id, count in Counter(
            _normalize_text(section.get("id")) for section in sections if _normalize_text(section.get("id"))
        ).items()
        if count > 1
    ]
    duplicate_reference_ids = [
        reference_id
        for reference_id, count in Counter(
            _normalize_text(reference.get("id"))
            for reference in references
            if _normalize_text(reference.get("id"))
        ).items()
        if count > 1
    ]

    reference_sections = [
        section
        for section in sections
        if _normalize_kind(section.get("canonical_kind")) == "references"
        or _normalize_kind(section.get("canonical_map")) == "references"
        or _normalize_text(section.get("title")).casefold() == "references"
    ]
    generic_sections = [
        section for section in sections if _normalize_kind(section.get("canonical_kind")) == "section"
    ]
    body_metadata_sections = [
        section
        for section in sections
        if _normalize_kind(section.get("document_zone")) == "body"
        and (
            _normalize_kind(section.get("section_type")) == "metadata"
            or _normalize_kind(section.get("major_section_key")) == "article_information"
        )
    ]
    back_mapped_to_body_sections = [
        section
        for section in sections
        if _normalize_kind(section.get("document_zone")) == "back"
        and _normalize_kind(section.get("canonical_map")) in _BODY_CANONICAL_MAPS
    ]

    cross_zone_children: list[dict[str, Any]] = []
    orphaned_parent_links: list[dict[str, Any]] = []
    for section in sections:
        parent_id = _normalize_text(section.get("parent_id"))
        if not parent_id:
            continue
        parent = section_ids.get(parent_id)
        if parent is None:
            orphaned_parent_links.append(
                {
                    "id": _normalize_text(section.get("id")),
                    "title": _normalize_text(section.get("title")),
                    "parent_id": parent_id,
                }
            )
            continue
        section_zone = _normalize_kind(section.get("document_zone"))
        parent_zone = _normalize_kind(parent.get("document_zone"))
        if section_zone and parent_zone and section_zone != parent_zone:
            cross_zone_children.append(
                {
                    "id": _normalize_text(section.get("id")),
                    "title": _normalize_text(section.get("title")),
                    "parent_id": parent_id,
                    "parent_title": _normalize_text(parent.get("title")),
                    "section_zone": section_zone,
                    "parent_zone": parent_zone,
                }
            )

    inline_citation_ids: list[str] = []
    for section in sections:
        content = _normalize_text(section.get("content"))
        inline_citation_ids.extend(match.group(1).strip() for match in _INLINE_CITATION_RE.finditer(content))
    inline_citation_counts = Counter(citation_id for citation_id in inline_citation_ids if citation_id)
    resolved_reference_keys = {
        _normalize_text(key)
        for key in reference_id_map.keys()
        if _normalize_text(key)
    }
    resolved_reference_keys.update(
        _normalize_text(reference.get("xml_id")) for reference in references if _normalize_text(reference.get("xml_id"))
    )
    unresolved_inline_citations = sorted(
        citation_id
        for citation_id in inline_citation_counts
        if citation_id not in resolved_reference_keys
    )
    structured_reference_count = sum(
        1
        for reference in references
        if _normalize_text(reference.get("title"))
        and (
            _normalize_text(reference.get("year"))
            or _normalize_text(reference.get("journal"))
            or bool(reference.get("authors"))
        )
    )
    references_with_numeric_labels = sum(
        1 for reference in references if _normalize_text(reference.get("label")).isdigit()
    )

    present_provenance_fields = [
        field
        for field in _EXPECTED_PROVENANCE_FIELDS
        if provenance.get(field) not in (None, "", [])
    ]
    missing_provenance_fields = [
        field for field in _EXPECTED_PROVENANCE_FIELDS if field not in present_provenance_fields
    ]

    metrics = {
        "readiness": readiness,
        "counts": {
            "sections": len(sections),
            "references": len(references),
            "reference_sections": len(reference_sections),
            "figures": len(figures),
            "tables": len(tables),
        },
        "anchors": {
            "sections": {
                "known": section_anchor_known,
                "total": len(sections),
                "coverage_ratio": _safe_ratio(
                    numerator=section_anchor_known,
                    denominator=len(sections),
                ),
            },
            "figures": {
                "known": figure_anchor_known,
                "total": len(figures),
                "coverage_ratio": _safe_ratio(
                    numerator=figure_anchor_known,
                    denominator=len(figures),
                ),
            },
            "tables": {
                "known": table_anchor_known,
                "total": len(tables),
                "coverage_ratio": _safe_ratio(
                    numerator=table_anchor_known,
                    denominator=len(tables),
                ),
            },
        },
        "structure": {
            "generic_sections": {
                "count": len(generic_sections),
                "coverage_ratio": _safe_ratio(
                    numerator=len(generic_sections),
                    denominator=len(sections),
                ),
            },
            "cross_zone_children": cross_zone_children,
            "orphaned_parent_links": orphaned_parent_links,
            "body_metadata_sections": [
                {
                    "id": _normalize_text(section.get("id")),
                    "title": _normalize_text(section.get("title")),
                    "canonical_kind": _normalize_text(section.get("canonical_kind")),
                    "canonical_map": _normalize_text(section.get("canonical_map")),
                }
                for section in body_metadata_sections
            ],
            "back_mapped_to_body_sections": [
                {
                    "id": _normalize_text(section.get("id")),
                    "title": _normalize_text(section.get("title")),
                    "canonical_map": _normalize_text(section.get("canonical_map")),
                }
                for section in back_mapped_to_body_sections
            ],
            "duplicate_section_ids": duplicate_section_ids,
        },
        "assets": {
            "figures": {
                "surface_count": figure_surface_count,
                "surface_ratio": _safe_ratio(
                    numerator=figure_surface_count,
                    denominator=len(figures),
                ),
                "missing_surface_count": max(0, len(figures) - figure_surface_count),
                "with_graphic_coords": sum(
                    1 for figure in figures if _normalize_text(figure.get("graphic_coords"))
                ),
                "with_coords": sum(1 for figure in figures if _normalize_text(figure.get("coords"))),
            },
            "tables": {
                "surface_count": table_surface_count,
                "surface_ratio": _safe_ratio(
                    numerator=table_surface_count,
                    denominator=len(tables),
                ),
                "missing_surface_count": max(0, len(tables) - table_surface_count),
                "likely_low_fidelity_count": sum(
                    1
                    for table in tables
                    if _normalize_text(table.get("structured_html")).count("<tr>") <= 1
                ),
            },
        },
        "citations": {
            "inline_citation_markers": len(inline_citation_ids),
            "unique_inline_citation_ids": sorted(inline_citation_counts.keys()),
            "unresolved_inline_citations": unresolved_inline_citations,
            "structured_references": {
                "count": structured_reference_count,
                "coverage_ratio": _safe_ratio(
                    numerator=structured_reference_count,
                    denominator=len(references),
                ),
            },
            "numeric_reference_labels": {
                "count": references_with_numeric_labels,
                "coverage_ratio": _safe_ratio(
                    numerator=references_with_numeric_labels,
                    denominator=len(references),
                ),
            },
            "duplicate_reference_ids": duplicate_reference_ids,
        },
        "provenance": {
            "present_fields": present_provenance_fields,
            "missing_fields": missing_provenance_fields,
        },
    }

    findings: list[dict[str, Any]] = []

    if parser_status != "FULL_TEXT_READY":
        severity = "critical" if readiness["has_viewable_pdf"] else "medium"
        findings.append(
            _finding(
                code="PARSE_NOT_READY",
                severity=severity,
                message=(
                    "Reader payload is not in FULL_TEXT_READY state, so quality metrics reflect a seed "
                    "or in-flight parse rather than a completed structured reader."
                ),
                evidence={
                    "response_status": readiness["response_status"],
                    "parser_status": parser_status,
                    "has_viewable_pdf": readiness["has_viewable_pdf"],
                },
            )
        )

    if is_full_text_ready and len(sections) > 0 and section_anchor_known == 0:
        findings.append(
            _finding(
                code="MISSING_SECTION_PAGE_ANCHORS",
                severity="high",
                message=(
                    "Full-text sections have no page anchors, which weakens ordering confidence, "
                    "left-nav parity, and inline asset placement."
                ),
                evidence=metrics["anchors"]["sections"],
            )
        )

    if is_full_text_ready and (len(figures) + len(tables)) > 0 and (figure_anchor_known + table_anchor_known) == 0:
        findings.append(
            _finding(
                code="MISSING_ASSET_PAGE_ANCHORS",
                severity="medium",
                message=(
                    "Parsed assets have no page anchors, so section placement and PDF jumps rely on weaker heuristics."
                ),
                evidence={
                    "figures": metrics["anchors"]["figures"],
                    "tables": metrics["anchors"]["tables"],
                },
            )
        )

    if references and reference_sections:
        findings.append(
            _finding(
                code="DUPLICATE_REFERENCE_PRESENTATION_RISK",
                severity="high",
                message=(
                    "The payload contains both parsed reference sections and a normalized reference list, "
                    "which creates a strong risk of double-rendering in the structured reader."
                ),
                evidence={
                    "reference_count": len(references),
                    "reference_sections": [
                        _normalize_text(section.get("title")) or _normalize_text(section.get("id"))
                        for section in reference_sections
                    ],
                },
            )
        )

    if cross_zone_children:
        findings.append(
            _finding(
                code="CROSS_ZONE_SECTION_PARENT",
                severity="high",
                message=(
                    "One or more sections are parented across document zones, which creates duplication "
                    "and grouping conflicts between body and end matter."
                ),
                evidence={"items": cross_zone_children},
            )
        )

    if orphaned_parent_links:
        findings.append(
            _finding(
                code="ORPHANED_SECTION_PARENT",
                severity="medium",
                message="One or more sections reference parent IDs that are absent from the payload.",
                evidence={"items": orphaned_parent_links},
            )
        )

    if back_mapped_to_body_sections:
        findings.append(
            _finding(
                code="BACK_MATTER_MAPPED_TO_BODY",
                severity="high",
                message=(
                    "Back-matter sections are mapped into main narrative groups, which is a strong indicator "
                    "of reader ordering and duplication defects."
                ),
                evidence={"items": metrics["structure"]["back_mapped_to_body_sections"]},
            )
        )

    if body_metadata_sections:
        findings.append(
            _finding(
                code="BODY_SECTION_CLASSIFIED_AS_METADATA",
                severity="high",
                message=(
                    "Body sections are classified as metadata/article information, which will distort "
                    "display order and move narrative content into Declarations-like groups."
                ),
                evidence={"items": metrics["structure"]["body_metadata_sections"]},
            )
        )

    generic_section_ratio = metrics["structure"]["generic_sections"]["coverage_ratio"] or 0.0
    if len(sections) >= 8 and generic_section_ratio >= 0.25:
        findings.append(
            _finding(
                code="HIGH_GENERIC_SECTION_RATE",
                severity="medium",
                message=(
                    "A large share of sections remain generic `section` kinds, which reduces confidence "
                    "in ordering, grouping, and section-specific rendering."
                ),
                evidence=metrics["structure"]["generic_sections"],
            )
        )

    figure_surface_ratio = metrics["assets"]["figures"]["surface_ratio"]
    if len(figures) > 0 and (figure_surface_ratio or 0.0) < 0.5:
        findings.append(
            _finding(
                code="FIGURE_SURFACE_COVERAGE_LOW",
                severity="high" if is_full_text_ready else "medium",
                message=(
                    "Figure extraction coverage is low, so the reader is mostly showing figure metadata "
                    "instead of actual figure images."
                ),
                evidence=metrics["assets"]["figures"],
            )
        )

    table_surface_ratio = metrics["assets"]["tables"]["surface_ratio"]
    if len(tables) > 0 and (table_surface_ratio or 0.0) < 0.8:
        findings.append(
            _finding(
                code="TABLE_SURFACE_COVERAGE_LOW",
                severity="medium",
                message=(
                    "Table HTML coverage is low, so readers will frequently fall back to metadata-only table cards."
                ),
                evidence=metrics["assets"]["tables"],
            )
        )

    if metrics["assets"]["tables"]["likely_low_fidelity_count"] > 0:
        findings.append(
            _finding(
                code="LOW_FIDELITY_TABLE_HTML",
                severity="medium",
                message=(
                    "At least one table appears to have very thin HTML content, which often indicates a poor "
                    "match or a collapsed extraction result."
                ),
                evidence={"count": metrics["assets"]["tables"]["likely_low_fidelity_count"]},
            )
        )

    if unresolved_inline_citations:
        findings.append(
            _finding(
                code="UNRESOLVED_INLINE_CITATIONS",
                severity="medium",
                message=(
                    "Inline citation markers were emitted in section text but do not resolve to the reference map."
                ),
                evidence={"ids": unresolved_inline_citations},
            )
        )

    structured_reference_ratio = metrics["citations"]["structured_references"]["coverage_ratio"]
    if len(references) > 0 and (structured_reference_ratio or 0.0) < 0.8:
        findings.append(
            _finding(
                code="REFERENCE_STRUCTURE_COVERAGE_LOW",
                severity="medium",
                message=(
                    "A large share of references lack structured fields, which limits citation linking, "
                    "reference rendering quality, and downstream normalization."
                ),
                evidence=metrics["citations"]["structured_references"],
            )
        )

    if duplicate_section_ids:
        findings.append(
            _finding(
                code="DUPLICATE_SECTION_IDS",
                severity="medium",
                message="Section IDs are duplicated within the payload.",
                evidence={"ids": duplicate_section_ids},
            )
        )

    if duplicate_reference_ids:
        findings.append(
            _finding(
                code="DUPLICATE_REFERENCE_IDS",
                severity="medium",
                message="Reference IDs are duplicated within the payload.",
                evidence={"ids": duplicate_reference_ids},
            )
        )

    missing_provenance_core = [
        field
        for field in ("grobid_base_url", "parse_duration_ms", "asset_enrichment_status", "parse_steps")
        if field in missing_provenance_fields
    ]
    if is_full_text_ready and missing_provenance_core:
        findings.append(
            _finding(
                code="MISSING_READER_PROVENANCE",
                severity="medium",
                message=(
                    "Reader provenance is incomplete, so the UI has to infer parse/enrichment state instead "
                    "of reporting it explicitly."
                ),
                evidence={"missing_fields": missing_provenance_core},
            )
        )

    severity_counts = Counter(
        str(finding.get("severity") or "info") for finding in findings
    )

    return {
        "metadata": {
            "publication_id": _normalize_text(metadata.get("publication_id")),
            "title": _normalize_text(metadata.get("title")),
            "journal": _normalize_text(metadata.get("journal")),
            "year": metadata.get("year"),
        },
        "summary": {
            "finding_count": len(findings),
            "highest_severity": _highest_severity(findings),
            "severity_counts": dict(sorted(severity_counts.items())),
        },
        "metrics": metrics,
        "findings": findings,
    }


def summarize_publication_reader_audits(
    audits: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    audit_list = [audit for audit in audits if isinstance(audit, dict)]
    parser_status_counts = Counter()
    highest_severity_counts = Counter()
    finding_code_counts = Counter()

    section_anchor_ratios: list[float] = []
    figure_surface_ratios: list[float] = []
    table_surface_ratios: list[float] = []

    for audit in audit_list:
        metrics = _as_mapping(audit.get("metrics"))
        readiness = _as_mapping(metrics.get("readiness"))
        parser_status = _normalize_text(readiness.get("parser_status")) or "UNKNOWN"
        parser_status_counts[parser_status] += 1

        summary = _as_mapping(audit.get("summary"))
        highest_severity = _normalize_text(summary.get("highest_severity")) or "none"
        highest_severity_counts[highest_severity] += 1

        for finding in audit.get("findings", []):
            if isinstance(finding, dict):
                finding_code_counts[_normalize_text(finding.get("code")) or "UNKNOWN"] += 1

        anchors = _as_mapping(metrics.get("anchors"))
        assets = _as_mapping(metrics.get("assets"))
        section_ratio = _as_mapping(anchors.get("sections")).get("coverage_ratio")
        figure_ratio = _as_mapping(_as_mapping(assets.get("figures"))).get("surface_ratio")
        table_ratio = _as_mapping(_as_mapping(assets.get("tables"))).get("surface_ratio")
        if isinstance(section_ratio, (int, float)):
            section_anchor_ratios.append(float(section_ratio))
        if isinstance(figure_ratio, (int, float)):
            figure_surface_ratios.append(float(figure_ratio))
        if isinstance(table_ratio, (int, float)):
            table_surface_ratios.append(float(table_ratio))

    def _mean(values: list[float]) -> float | None:
        if not values:
            return None
        return round(sum(values) / len(values), 4)

    return {
        "publication_count": len(audit_list),
        "parser_status_counts": dict(sorted(parser_status_counts.items())),
        "highest_severity_counts": dict(sorted(highest_severity_counts.items())),
        "finding_code_counts": dict(sorted(finding_code_counts.items())),
        "average_section_anchor_coverage": _mean(section_anchor_ratios),
        "average_figure_surface_coverage": _mean(figure_surface_ratios),
        "average_table_surface_coverage": _mean(table_surface_ratios),
    }


def load_reader_response_json(path: str | Path) -> dict[str, Any]:
    raw = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if isinstance(raw, dict):
        return raw
    raise ValueError(f"Expected a JSON object in '{path}'.")

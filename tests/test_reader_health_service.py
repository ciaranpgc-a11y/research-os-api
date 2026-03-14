from __future__ import annotations

from research_os.services.reader_health_service import (
    audit_publication_reader_response,
    summarize_publication_reader_audits,
)


def _make_issue_heavy_response() -> dict:
    return {
        "status": "READY",
        "payload": {
            "metadata": {
                "publication_id": "pub-issue-heavy",
                "title": "Issue-heavy reader payload",
                "journal": "Journal of Reader Bugs",
                "year": 2026,
            },
            "document": {
                "parser_status": "FULL_TEXT_READY",
                "has_viewable_pdf": True,
                "has_full_text_sections": True,
                "reader_entry_available": True,
                "search_ready": True,
            },
            "sections": [
                {
                    "id": "section-abstract",
                    "title": "Abstract",
                    "canonical_kind": "abstract",
                    "canonical_map": "abstract",
                    "document_zone": "front",
                    "section_type": "canonical",
                    "major_section_key": "overview",
                    "content": "Summary text.",
                },
                {
                    "id": "section-introduction",
                    "title": "Introduction",
                    "canonical_kind": "introduction",
                    "canonical_map": "introduction",
                    "document_zone": "body",
                    "section_type": "canonical",
                    "major_section_key": "introduction",
                    "content": "Introduction {{cite:b0}} with one resolved citation.",
                },
                {
                    "id": "section-methods",
                    "title": "Methods",
                    "canonical_kind": "methods",
                    "canonical_map": "methods",
                    "document_zone": "body",
                    "section_type": "canonical",
                    "major_section_key": "methods",
                    "content": "Methods text.",
                },
                {
                    "id": "section-image-quality",
                    "title": "Image quality",
                    "canonical_kind": "section",
                    "canonical_map": "results",
                    "document_zone": "body",
                    "section_type": "canonical",
                    "major_section_key": "results",
                    "parent_id": "section-results",
                    "content": "Results detail {{cite:missing-ref}}.",
                },
                {
                    "id": "section-results",
                    "title": "Results",
                    "canonical_kind": "results",
                    "canonical_map": "results",
                    "document_zone": "body",
                    "section_type": "canonical",
                    "major_section_key": "results",
                    "content": "Results text.",
                },
                {
                    "id": "section-volumetric",
                    "title": "Volumetric and functional assessment",
                    "canonical_kind": "registration",
                    "canonical_map": "registration",
                    "document_zone": "body",
                    "section_type": "metadata",
                    "major_section_key": "article_information",
                    "content": "This is body content misclassified as metadata.",
                },
                {
                    "id": "section-biography",
                    "title": "Lead author biography",
                    "canonical_kind": "section",
                    "canonical_map": "introduction",
                    "document_zone": "back",
                    "section_type": "canonical",
                    "major_section_key": "introduction",
                    "parent_id": "section-introduction",
                    "content": "Biography should not be under Introduction.",
                },
                {
                    "id": "section-abbreviations",
                    "title": "Abbreviations",
                    "canonical_kind": "section",
                    "canonical_map": "section",
                    "document_zone": "back",
                    "section_type": "canonical",
                    "major_section_key": "article_information",
                    "content": "Abbreviation list.",
                },
                {
                    "id": "section-references",
                    "title": "References",
                    "canonical_kind": "references",
                    "canonical_map": "references",
                    "document_zone": "back",
                    "section_type": "reference",
                    "major_section_key": "references",
                    "content": "",
                },
            ],
            "figures": [
                {
                    "id": "figure-1",
                    "title": "Figure 1",
                    "graphic_coords": "1,10,10,100,100",
                    "caption": "Long caption for figure 1.",
                },
                {
                    "id": "figure-2",
                    "title": "Figure 2",
                    "graphic_coords": "2,10,10,100,100",
                    "caption": "Long caption for figure 2.",
                },
            ],
            "tables": [
                {
                    "id": "table-1",
                    "title": "Table 1",
                    "structured_html": "<table><tr><td>Only row</td></tr></table>",
                    "caption": "Table caption.",
                }
            ],
            "references": [
                {
                    "id": "paper-reference-1",
                    "label": "0",
                    "xml_id": "b0",
                    "raw_text": "Structured reference 1",
                    "title": "Structured reference 1",
                    "authors": ["A Example"],
                    "journal": "Example Journal",
                    "year": "2025",
                },
                {
                    "id": "paper-reference-2",
                    "label": "Ref 2",
                    "raw_text": "Unstructured reference 2",
                },
            ],
            "reference_id_map": {
                "b0": "paper-reference-1",
            },
            "provenance": {
                "parser_version": "publication_structured_paper_v24",
                "parser_provider": "GROBID",
            },
        },
    }


def _make_healthy_response() -> dict:
    return {
        "status": "READY",
        "payload": {
            "metadata": {
                "publication_id": "pub-healthy",
                "title": "Healthy reader payload",
                "journal": "Journal of Reader Health",
                "year": 2026,
            },
            "document": {
                "parser_status": "FULL_TEXT_READY",
                "has_viewable_pdf": True,
                "has_full_text_sections": True,
                "reader_entry_available": True,
                "search_ready": True,
            },
            "sections": [
                {
                    "id": "abstract",
                    "title": "Abstract",
                    "canonical_kind": "abstract",
                    "canonical_map": "abstract",
                    "document_zone": "front",
                    "section_type": "canonical",
                    "major_section_key": "overview",
                    "page_start": 1,
                    "page_end": 1,
                    "content": "Summary.",
                },
                {
                    "id": "introduction",
                    "title": "Introduction",
                    "canonical_kind": "introduction",
                    "canonical_map": "introduction",
                    "document_zone": "body",
                    "section_type": "canonical",
                    "major_section_key": "introduction",
                    "page_start": 2,
                    "page_end": 2,
                    "content": "Background {{cite:b0}}.",
                },
                {
                    "id": "methods",
                    "title": "Methods",
                    "canonical_kind": "methods",
                    "canonical_map": "methods",
                    "document_zone": "body",
                    "section_type": "canonical",
                    "major_section_key": "methods",
                    "page_start": 3,
                    "page_end": 4,
                    "content": "Methods.",
                },
                {
                    "id": "results",
                    "title": "Results",
                    "canonical_kind": "results",
                    "canonical_map": "results",
                    "document_zone": "body",
                    "section_type": "canonical",
                    "major_section_key": "results",
                    "page_start": 5,
                    "page_end": 6,
                    "content": "Results.",
                },
            ],
            "figures": [
                {
                    "id": "figure-healthy",
                    "title": "Figure 1",
                    "page_start": 5,
                    "page_end": 5,
                    "graphic_coords": "5,10,10,100,100",
                    "image_data": "data:image/png;base64,abc123",
                    "caption": "Figure caption.",
                }
            ],
            "tables": [
                {
                    "id": "table-healthy",
                    "title": "Table 1",
                    "page_start": 4,
                    "page_end": 4,
                    "structured_html": "<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>",
                    "caption": "Table caption.",
                }
            ],
            "references": [
                {
                    "id": "paper-reference-1",
                    "label": "1",
                    "xml_id": "b0",
                    "raw_text": "Healthy structured reference",
                    "title": "Healthy structured reference",
                    "authors": ["A Example"],
                    "journal": "Example Journal",
                    "year": "2025",
                }
            ],
            "reference_id_map": {
                "b0": "paper-reference-1",
            },
            "provenance": {
                "structured_abstract_status": "READY",
                "structured_abstract_format": "HEADING_BASED",
                "parser_version": "publication_structured_paper_v24",
                "full_text_generation_method": "grobid_tei_fulltext_v3",
                "parser_provider": "GROBID",
                "grobid_base_url": "http://grobid:8070",
                "parse_duration_ms": 1842,
                "asset_enrichment_status": "COMPLETE",
                "parse_steps": [{"label": "grobid", "duration_ms": 1200}],
            },
        },
    }


def test_audit_detects_reader_health_regressions() -> None:
    audit = audit_publication_reader_response(_make_issue_heavy_response())

    codes = {finding["code"] for finding in audit["findings"]}

    assert audit["summary"]["highest_severity"] == "high"
    assert audit["metrics"]["counts"]["sections"] == 9
    assert audit["metrics"]["assets"]["figures"]["surface_count"] == 0
    assert audit["metrics"]["anchors"]["sections"]["known"] == 0
    assert {
        "MISSING_SECTION_PAGE_ANCHORS",
        "MISSING_ASSET_PAGE_ANCHORS",
        "DUPLICATE_REFERENCE_PRESENTATION_RISK",
        "CROSS_ZONE_SECTION_PARENT",
        "BACK_MATTER_MAPPED_TO_BODY",
        "BODY_SECTION_CLASSIFIED_AS_METADATA",
        "HIGH_GENERIC_SECTION_RATE",
        "FIGURE_SURFACE_COVERAGE_LOW",
        "LOW_FIDELITY_TABLE_HTML",
        "UNRESOLVED_INLINE_CITATIONS",
        "REFERENCE_STRUCTURE_COVERAGE_LOW",
        "MISSING_READER_PROVENANCE",
    }.issubset(codes)


def test_audit_accepts_well_formed_reader_payload() -> None:
    audit = audit_publication_reader_response(_make_healthy_response())

    assert audit["summary"]["finding_count"] == 0
    assert audit["summary"]["highest_severity"] == "none"
    assert audit["metrics"]["anchors"]["sections"]["coverage_ratio"] == 1.0
    assert audit["metrics"]["assets"]["figures"]["surface_ratio"] == 1.0
    assert audit["metrics"]["assets"]["tables"]["surface_ratio"] == 1.0


def test_reader_health_audit_summary_aggregates_parser_and_finding_counts() -> None:
    issue_audit = audit_publication_reader_response(_make_issue_heavy_response())
    healthy_audit = audit_publication_reader_response(_make_healthy_response())
    parsing_audit = audit_publication_reader_response(
        {
            "status": "RUNNING",
            "payload": {
                "metadata": {
                    "publication_id": "pub-parsing",
                    "title": "Parsing reader payload",
                },
                "document": {
                    "parser_status": "PARSING",
                    "has_viewable_pdf": True,
                },
                "sections": [],
                "figures": [],
                "tables": [],
                "references": [],
                "provenance": {},
            },
        }
    )

    summary = summarize_publication_reader_audits([issue_audit, healthy_audit, parsing_audit])

    assert summary["publication_count"] == 3
    assert summary["parser_status_counts"]["FULL_TEXT_READY"] == 2
    assert summary["parser_status_counts"]["PARSING"] == 1
    assert summary["highest_severity_counts"]["high"] == 1
    assert summary["highest_severity_counts"]["none"] == 1
    assert summary["highest_severity_counts"]["critical"] == 1
    assert summary["finding_code_counts"]["PARSE_NOT_READY"] == 1

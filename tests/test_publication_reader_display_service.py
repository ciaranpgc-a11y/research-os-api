from __future__ import annotations

import research_os.services.publication_console_service as publication_console_service


def test_display_metadata_reconciles_body_and_back_matter_sections() -> None:
    sections = [
        {
            "id": "section-introduction",
            "title": "Introduction",
            "canonical_kind": "introduction",
            "canonical_map": "introduction",
            "section_type": "canonical",
            "order": 5,
            "document_zone": "body",
            "section_role": "major",
            "major_section_key": "introduction",
        },
        {
            "id": "section-results",
            "title": "Results",
            "canonical_kind": "results",
            "canonical_map": "results",
            "section_type": "canonical",
            "order": 12,
            "document_zone": "body",
            "section_role": "major",
            "major_section_key": "results",
        },
        {
            "id": "section-volumetric",
            "title": "Volumetric and functional assessment",
            "canonical_kind": "registration",
            "canonical_map": "registration",
            "section_type": "metadata",
            "order": 14,
            "document_zone": "body",
            "section_role": "metadata",
            "major_section_key": "article_information",
        },
        {
            "id": "section-biography",
            "title": "Lead author biography",
            "canonical_kind": "section",
            "canonical_map": "introduction",
            "section_type": "canonical",
            "order": 27,
            "document_zone": "back",
            "section_role": "subsection",
            "major_section_key": "introduction",
            "parent_id": "section-introduction",
        },
    ]

    displayed = publication_console_service._apply_publication_paper_display_metadata(sections)
    by_id = {section["id"]: section for section in displayed}

    assert by_id["section-volumetric"]["display_group"] == "results"
    assert by_id["section-volumetric"]["display_parent_id"] == "section-results"
    assert by_id["section-biography"]["display_group"] == "article_information"
    assert by_id["section-biography"]["display_parent_id"] is None
    assert by_id["section-introduction"]["display_order"] < by_id["section-biography"]["display_order"]


def test_display_metadata_preserves_same_group_child_parent() -> None:
    sections = [
        {
            "id": "section-methods",
            "title": "Methods",
            "canonical_kind": "methods",
            "canonical_map": "methods",
            "section_type": "canonical",
            "order": 3,
            "document_zone": "body",
            "section_role": "major",
            "major_section_key": "methods",
        },
        {
            "id": "section-protocol",
            "title": "Study protocol",
            "canonical_kind": "methods",
            "canonical_map": "methods",
            "section_type": "canonical",
            "order": 4,
            "document_zone": "body",
            "section_role": "subsection",
            "major_section_key": "methods",
            "parent_id": "section-methods",
        },
    ]

    displayed = publication_console_service._apply_publication_paper_display_metadata(sections)
    by_id = {section["id"]: section for section in displayed}

    assert by_id["section-methods"]["display_group"] == "methods"
    assert by_id["section-methods"]["display_parent_id"] is None
    assert by_id["section-protocol"]["display_group"] == "methods"
    assert by_id["section-protocol"]["display_parent_id"] == "section-methods"

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


def test_display_metadata_uses_nearest_same_group_parent_for_nested_levels() -> None:
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
            "level": 1,
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
            "level": 2,
        },
        {
            "id": "section-analysis",
            "title": "Image analysis",
            "canonical_kind": "methods",
            "canonical_map": "methods",
            "section_type": "canonical",
            "order": 5,
            "document_zone": "body",
            "section_role": "subsection",
            "major_section_key": "methods",
            "parent_id": "section-methods",
            "level": 2,
        },
        {
            "id": "section-volumetric",
            "title": "Volumetric and wall thickness assessment",
            "canonical_kind": "methods",
            "canonical_map": "methods",
            "section_type": "canonical",
            "order": 6,
            "document_zone": "body",
            "section_role": "subsection",
            "major_section_key": "methods",
            "parent_id": "section-methods",
            "level": 3,
        },
        {
            "id": "section-wall-motion",
            "title": "Wall motion assessment",
            "canonical_kind": "methods",
            "canonical_map": "methods",
            "section_type": "canonical",
            "order": 7,
            "document_zone": "body",
            "section_role": "subsection",
            "major_section_key": "methods",
            "parent_id": "section-methods",
            "level": 3,
        },
    ]

    displayed = publication_console_service._apply_publication_paper_display_metadata(sections)
    by_id = {section["id"]: section for section in displayed}

    assert by_id["section-protocol"]["display_parent_id"] == "section-methods"
    assert by_id["section-analysis"]["display_parent_id"] == "section-methods"
    assert by_id["section-volumetric"]["display_parent_id"] == "section-analysis"
    assert by_id["section-wall-motion"]["display_parent_id"] == "section-analysis"


def test_collapse_leaf_methods_subsections_absorbs_over_specific_long_heading() -> None:
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
            "level": 1,
            "content": "",
        },
        {
            "id": "section-protocol",
            "title": "CMR protocol and analysis",
            "canonical_kind": "methods",
            "canonical_map": "methods",
            "section_type": "canonical",
            "order": 4,
            "document_zone": "body",
            "section_role": "subsection",
            "major_section_key": "methods",
            "parent_id": "section-methods",
            "level": 2,
            "content": "All CMR studies were performed using a 1.5 Tesla system with a standardized protocol.",
        },
        {
            "id": "section-lvfp",
            "title": "Estimation of left ventricular filling pressure using sex-specific CMR-derived equations",
            "canonical_kind": "methods",
            "canonical_map": "methods",
            "section_type": "canonical",
            "order": 5,
            "document_zone": "body",
            "section_role": "subsection",
            "major_section_key": "methods",
            "parent_id": "section-methods",
            "level": 3,
            "content": "To estimate LVFP, we used sex-specific equations derived from CMR metrics. Where: PCWP is the pulmonary capillary wedge pressure in mm Hg.",
        },
        {
            "id": "section-stats",
            "title": "Statistical analysis",
            "canonical_kind": "methods",
            "canonical_map": "methods",
            "section_type": "canonical",
            "order": 6,
            "document_zone": "body",
            "section_role": "subsection",
            "major_section_key": "methods",
            "parent_id": "section-methods",
            "level": 2,
            "content": "Statistical analyses were performed using MedCalc.",
        },
    ]

    collapsed = publication_console_service._collapse_publication_paper_leaf_methods_subsections(
        sections
    )
    by_id = {section["id"]: section for section in collapsed}

    assert "section-lvfp" not in by_id
    assert "To estimate LVFP" in by_id["section-protocol"]["content"]
    assert (
        by_id["section-protocol"]["content"].count("sex-specific equations") == 1
    )

    displayed = publication_console_service._apply_publication_paper_display_metadata(
        collapsed
    )
    displayed_by_id = {section["id"]: section for section in displayed}

    assert displayed_by_id["section-protocol"]["display_parent_id"] == "section-methods"
    assert displayed_by_id["section-stats"]["display_parent_id"] == "section-methods"


def test_collapse_leaf_methods_subsections_keeps_short_nested_method_headings() -> None:
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
            "level": 1,
        },
        {
            "id": "section-analysis",
            "title": "Image analysis",
            "canonical_kind": "methods",
            "canonical_map": "methods",
            "section_type": "canonical",
            "order": 4,
            "document_zone": "body",
            "section_role": "subsection",
            "major_section_key": "methods",
            "parent_id": "section-methods",
            "level": 2,
            "content": "Dedicated software was used for image analysis across the cohort.",
        },
        {
            "id": "section-wall-motion",
            "title": "Wall motion assessment",
            "canonical_kind": "methods",
            "canonical_map": "methods",
            "section_type": "canonical",
            "order": 5,
            "document_zone": "body",
            "section_role": "subsection",
            "major_section_key": "methods",
            "parent_id": "section-analysis",
            "level": 3,
            "content": "Wall motion was assessed using a segmental scoring approach.",
        },
    ]

    collapsed = publication_console_service._collapse_publication_paper_leaf_methods_subsections(
        sections
    )
    by_id = {section["id"]: section for section in collapsed}

    assert "section-wall-motion" in by_id
    assert "segmental scoring approach" not in str(
        by_id["section-analysis"].get("content") or ""
    )

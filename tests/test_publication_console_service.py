from __future__ import annotations

import base64
from io import BytesIO
import tarfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

from fastapi.testclient import TestClient
from sqlalchemy import select

import research_os.services.publication_console_service as publication_console_service
from research_os.api.app import app
from research_os.db import (
    PublicationAiCache,
    PublicationFile,
    PublicationImpactCache,
    PublicationStructuredPaperCache,
    User,
    Work,
    create_all_tables,
    reset_database_state,
    session_scope,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    import research_os.api.app as api_module

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_publication_console.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("PUB_IMPACT_TTL_SECONDS", "60")
    monkeypatch.setenv("PUB_AI_TTL_SECONDS", "60")
    monkeypatch.setenv("PUB_AUTHORS_TTL_SECONDS", "60")
    monkeypatch.setenv("PUBLICATION_FILES_ROOT", str(tmp_path / "publication-files"))
    api_module._AUTH_RATE_LIMIT_EVENTS.clear()
    reset_database_state()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_user_and_work(*, email: str, title: str) -> tuple[str, str]:
    create_all_tables()
    with session_scope() as session:
        user = User(
            email=email,
            password_hash="test-hash",
            name=email.split("@")[0],
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title=title,
            title_lower=title.lower(),
            year=2024,
            doi=f"10.1000/{title.lower().replace(' ', '-')}",
            work_type="journal-article",
            venue_name="Test Journal",
            publisher="Test Publisher",
            abstract=(
                "Objectives: Evaluate intervention. Methods: Cohort study. "
                "Results: Improved outcomes. Conclusions: Intervention beneficial."
            ),
            keywords=["cardiology"],
            url="https://pubmed.ncbi.nlm.nih.gov/12345678/",
            provenance="manual",
        )
        session.add(work)
        session.flush()
        return user_id, str(work.id)


def _register(client: TestClient, *, email: str) -> tuple[str, str]:
    response = client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "name": email.split("@")[0],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    return str(payload["user"]["id"]), str(payload["session_token"])


def test_grobid_base_url_prefers_hostport_env(monkeypatch) -> None:
    monkeypatch.setenv("PUB_GROBID_HOSTPORT", "research-os-grobid-achk:8070")
    monkeypatch.setenv("PUB_GROBID_BASE_URL", "https://example.org/grobid")

    assert (
        publication_console_service._grobid_base_url()
        == "http://research-os-grobid-achk:8070"
    )


def test_grobid_base_url_normalizes_schemeless_base_url(monkeypatch) -> None:
    monkeypatch.delenv("PUB_GROBID_HOSTPORT", raising=False)
    monkeypatch.setenv("PUB_GROBID_BASE_URL", "research-os-grobid-achk:8070/")

    assert (
        publication_console_service._grobid_base_url()
        == "http://research-os-grobid-achk:8070"
    )


def test_publication_detail_endpoint_is_scoped_to_owner(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with TestClient(app) as client:
        owner_a_id, token_a = _register(client, email="owner-a@example.com")
        owner_b_id, _token_b = _register(client, email="owner-b@example.com")

        with session_scope() as session:
            work_a = Work(
                user_id=owner_a_id,
                title="Owner A work",
                title_lower="owner a work",
                year=2023,
                doi="10.1000/owner-a-work",
                work_type="journal-article",
                venue_name="Test",
                publisher="Test",
                abstract="A",
                keywords=[],
                url="",
                provenance="manual",
            )
            work_b = Work(
                user_id=owner_b_id,
                title="Owner B work",
                title_lower="owner b work",
                year=2023,
                doi="10.1000/owner-b-work",
                work_type="journal-article",
                venue_name="Test",
                publisher="Test",
                abstract="B",
                keywords=[],
                url="",
                provenance="manual",
            )
            session.add_all([work_a, work_b])
            session.flush()
            work_a_id = str(work_a.id)
            work_b_id = str(work_b.id)

        own_response = client.get(
            f"/v1/publications/{work_a_id}",
            headers=_auth_headers(token_a),
        )
        assert own_response.status_code == 200
        assert own_response.json()["id"] == work_a_id

        foreign_response = client.get(
            f"/v1/publications/{work_b_id}",
            headers=_auth_headers(token_a),
        )
        assert foreign_response.status_code == 404


def test_publication_paper_model_endpoint_returns_structured_reader_payload(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    def _immediate_submit(*, kind: str, user_id: str, publication_id: str, fn):  # noqa: ANN001
        fn(user_id=user_id, publication_id=publication_id)
        return True

    monkeypatch.setattr(
        publication_console_service, "_submit_background_job", _immediate_submit
    )
    monkeypatch.setattr(
        publication_console_service,
        "_resolve_publication_file_binary_payload",
        lambda **kwargs: {  # noqa: ANN003
            "content": b"%PDF-1.4 test",
            "content_type": "application/pdf",
            "file_name": "paper.pdf",
            "mode": "content",
            "url": None,
        },
    )
    monkeypatch.setattr(
        publication_console_service,
        "_fetch_open_access_pdf_bytes",
        lambda *args, **kwargs: (b"%PDF-1.7 locally cached oa payload", "application/pdf"),
    )
    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_paper_with_grobid",
        lambda **kwargs: {  # noqa: ANN003
            "sections": [
                {
                    "id": "paper-section-1-introduction",
                    "title": "Introduction",
                    "raw_label": "Introduction",
                    "label_original": "Introduction",
                    "label_normalized": "Introduction",
                    "kind": "introduction",
                    "canonical_kind": "introduction",
                    "section_type": "canonical",
                    "canonical_map": "introduction",
                    "content": "This paper introduces the reader scaffold.",
                    "source": "grobid",
                    "source_parser": "grobid",
                    "order": 0,
                    "page_start": 1,
                    "page_end": 2,
                    "level": 1,
                    "parent_id": None,
                    "bounding_boxes": [],
                    "confidence": 0.97,
                    "is_generated_heading": False,
                    "word_count": 7,
                    "paragraph_count": 1,
                },
                {
                    "id": "paper-section-2-methods",
                    "title": "Methods",
                    "raw_label": "Methods",
                    "label_original": "Methods",
                    "label_normalized": "Methods",
                    "kind": "methods",
                    "canonical_kind": "methods",
                    "section_type": "canonical",
                    "canonical_map": "methods",
                    "content": "We prototyped the popup reader against a structured paper model.",
                    "source": "grobid",
                    "source_parser": "grobid",
                    "order": 1,
                    "page_start": 2,
                    "page_end": 4,
                    "level": 1,
                    "parent_id": None,
                    "bounding_boxes": [],
                    "confidence": 0.96,
                    "is_generated_heading": False,
                    "word_count": 10,
                    "paragraph_count": 1,
                },
            ],
            "figures": [
                {
                    "id": "parsed-figure-1",
                    "file_name": "Figure 1",
                    "source": "PARSED",
                    "classification": "FIGURE",
                    "classification_label": "Figure",
                    "is_pdf": False,
                    "title": "Figure 1",
                    "caption": "Recruitment flow diagram.",
                    "page_start": 3,
                    "page_end": 3,
                    "asset_kind": "figure",
                    "origin": "parsed",
                    "source_parser": "grobid",
                }
            ],
            "tables": [
                {
                    "id": "parsed-table-1",
                    "file_name": "Table 1",
                    "source": "PARSED",
                    "classification": "TABLE",
                    "classification_label": "Table",
                    "is_pdf": False,
                    "title": "Table 1",
                    "caption": "Baseline cohort characteristics.",
                    "page_start": 4,
                    "page_end": 4,
                    "asset_kind": "table",
                    "origin": "parsed",
                    "source_parser": "grobid",
                }
            ],
            "references": [
                {
                    "id": "paper-reference-1",
                    "label": "Reference 1",
                    "raw_text": "Example A. Structured readers. 2026.",
                }
            ],
            "page_count": 12,
            "generation_method": "test_grobid_parser",
            "parser_provider": "GROBID",
        },
    )

    with TestClient(app) as client:
        owner_id, token = _register(client, email="reader@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="Structured reader paper",
                title_lower="structured reader paper",
                year=2026,
                doi="10.1000/structured-reader-paper",
                work_type="journal-article",
                publication_type="original-article",
                venue_name="Reader Journal",
                publisher="Reader Publisher",
                abstract=(
                    "Objectives: Evaluate scaffolded readers. "
                    "Methods: Prototype viewer shell. "
                    "Results: Better navigation. "
                    "Conclusions: Start with structure first."
                ),
                keywords=["reader", "structure"],
                authors_json=[
                    {"name": "Alice Example"},
                    {"name": "Bob Example"},
                ],
                url="https://pubmed.ncbi.nlm.nih.gov/12345678/",
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

            primary_pdf = PublicationFile(
                owner_user_id=owner_id,
                publication_id=work_id,
                file_name="Example (2026) - PMID 12345678.pdf",
                file_type="PDF",
                storage_key="",
                source="OA_LINK",
                oa_url="https://example.org/paper.pdf",
                checksum=None,
                custom_name=True,
                classification="PUBLISHED_MANUSCRIPT",
            )
            figure_file = PublicationFile(
                owner_user_id=owner_id,
                publication_id=work_id,
                file_name="Figure 1.png",
                file_type="OTHER",
                storage_key=str(tmp_path / "figure-1.png"),
                source="USER_UPLOAD",
                oa_url=None,
                checksum="figure-checksum",
                custom_name=True,
                classification="FIGURE",
                classification_custom=True,
            )
            session.add_all([primary_pdf, figure_file])
            session.flush()
            primary_pdf_id = str(primary_pdf.id)

        response = client.get(
            f"/v1/publications/{work_id}/paper-model",
            headers=_auth_headers(token),
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "RUNNING"
        assert payload["payload"]["metadata"]["publication_id"] == work_id
        assert payload["payload"]["metadata"]["title"] == "Structured reader paper"
        assert payload["payload"]["metadata"]["authors"] == [
            "Alice Example",
            "Bob Example",
        ]
        assert payload["payload"]["document"]["has_viewable_pdf"] is True
        assert payload["payload"]["document"]["primary_pdf_file_id"] == primary_pdf_id
        assert payload["payload"]["document"]["parser_status"] == "PARSING"

        refreshed_response = client.get(
            f"/v1/publications/{work_id}/paper-model",
            headers=_auth_headers(token),
        )
        assert refreshed_response.status_code == 200
        payload = refreshed_response.json()
        assert payload["status"] == "READY"
        assert payload["payload"]["document"]["parser_status"] == "FULL_TEXT_READY"
        assert payload["payload"]["document"]["page_count"] == 12
        assert payload["payload"]["component_summary"]["reference_count"] == 1
        assert len(payload["payload"]["sections"]) == 2
        assert payload["payload"]["sections"][0]["canonical_kind"] == "introduction"
        assert payload["payload"]["figures"][0]["classification"] == "FIGURE"
        assert payload["payload"]["figures"][0]["origin"] == "parsed"
        assert payload["payload"]["figures"][0]["caption"] == "Recruitment flow diagram."
        assert payload["payload"]["tables"][0]["page_start"] == 4
        assert payload["payload"]["outline"][0]["label_normalized"] == "Overview"
        assert any(
            node["label_normalized"] == "Main text"
            for node in payload["payload"]["outline"]
        )
        assert any(
            node["target_kind"] == "section"
            and node["target_id"] == "paper-section-1-introduction"
            for node in payload["payload"]["outline"]
        )

        with session_scope() as session:
            cached_row = session.scalars(
                select(PublicationStructuredPaperCache).where(
                    PublicationStructuredPaperCache.owner_user_id == owner_id,
                    PublicationStructuredPaperCache.publication_id == work_id,
                )
            ).first()
            assert cached_row is not None
            assert (
                cached_row.parser_version
                == publication_console_service.STRUCTURED_PAPER_CACHE_VERSION
            )


def test_parse_grobid_tei_promotes_editorial_sections_and_extracts_assets() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <front>
          <abstract>
            <head>Abstract</head>
            <p>Main scientific abstract text.</p>
          </abstract>
          <abstract>
            <head>What this study adds</head>
            <p>CMR adds incremental phenotyping value.</p>
          </abstract>
        </front>
        <body>
          <div>
            <head>Introduction</head>
            <p>Introductory text.</p>
          </div>
          <figure type="figure">
            <label>Figure 1</label>
            <figDesc>Recruitment flow diagram.</figDesc>
            <pb n="3" />
          </figure>
          <figure type="table">
            <label>Table 1</label>
            <head>Baseline characteristics</head>
            <figDesc>Baseline cohort characteristics.</figDesc>
            <pb n="4" />
          </figure>
        </body>
        <back>
          <div>
            <head>Funding</head>
            <p>Supported by a test grant.</p>
          </div>
          <div>
            <head>Data availability</head>
            <p>Available on request.</p>
          </div>
        </back>
      </text>
    </TEI>
    """
    payload = publication_console_service._parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml,
        title="Test paper",
    )

    section_kinds = [section["canonical_kind"] for section in payload["sections"]]
    assert "abstract" in section_kinds
    assert "key_summary_adds" in section_kinds
    assert "funding" in section_kinds
    assert "data_availability" in section_kinds
    assert len(payload["figures"]) == 1
    assert payload["figures"][0]["title"] == "Figure 1"
    assert payload["figures"][0]["caption"] == "Recruitment flow diagram."
    assert payload["figures"][0]["page_start"] == 3
    assert len(payload["tables"]) == 1
    assert payload["tables"][0]["title"] == "Table 1"
    assert payload["tables"][0]["page_start"] == 4


def test_parse_grobid_tei_refines_section_context_and_dedupes_assets() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <body>
          <div>
            <head>Design</head>
            <p>Prospective registry design.</p>
          </div>
          <div>
            <head>Study population</head>
            <p>Adults referred for imaging were enrolled before protocol allocation.</p>
          </div>
          <div>
            <head>Statistical analysis</head>
            <p>Regression models were prespecified.</p>
          </div>
          <div>
            <head>Study population</head>
            <p>A total of 125 participants were included in the final cohort.</p>
          </div>
          <div>
            <head>Echocardiographic findings</head>
            <p>Diagnostic discordance was present in 42% of participants.</p>
          </div>
          <div>
            <head>Discussion</head>
            <p>These findings support incremental phenotyping.</p>
          </div>
          <div>
            <head>Limitations</head>
            <p>This was a single-centre study.</p>
          </div>
          <figure type="figure">
            <label>Figure 1</label>
            <figDesc>Recruitment flow diagram.</figDesc>
            <pb n="5" />
          </figure>
          <figure type="figure">
            <label>1</label>
            <head>Figure 1</head>
            <figDesc>Recruitment flow diagram. Author(s) (or their employer(s)) 2026. No commercial re-use. See rights and permissions.</figDesc>
            <pb n="5" />
          </figure>
        </body>
        <back>
          <div>
            <head>Patient consent for publication Not applicable.</head>
            <p>Not applicable.</p>
          </div>
        </back>
      </text>
    </TEI>
    """
    payload = publication_console_service._parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml,
        title="Test paper",
    )

    study_population_sections = [
        section
        for section in payload["sections"]
        if section["title"] == "Study population"
    ]
    assert len(study_population_sections) == 2
    assert study_population_sections[0]["canonical_map"] == "methods"
    assert study_population_sections[1]["canonical_map"] == "results"

    discussion_section = next(
        section
        for section in payload["sections"]
        if section["title"] == "Discussion"
    )
    limitations_section = next(
        section
        for section in payload["sections"]
        if section["title"] == "Limitations"
    )
    consent_section = next(
        section
        for section in payload["sections"]
        if section["canonical_kind"] == "ethics"
    )
    assert limitations_section["parent_id"] == discussion_section["id"]
    assert consent_section["title"] == "Patient consent for publication"
    assert len(payload["figures"]) == 1
    assert payload["figures"][0]["title"] == "Figure 1"
    assert payload["figures"][0]["caption"] == "Recruitment flow diagram."


def test_parse_grobid_tei_preserves_headingless_wrapper_and_container_content() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <body>
          <p>Lead paragraph before the named manuscript sections.</p>
          <div>
            <p>Unheaded methods lead-in content should still be preserved.</p>
            <div>
              <head>Design</head>
              <p>Prospective registry study.</p>
            </div>
            <div>
              <head>Setting</head>
              <p>Single tertiary centre.</p>
            </div>
          </div>
        </body>
      </text>
    </TEI>
    """
    payload = publication_console_service._parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml,
        title="Test paper",
    )

    combined_content = "\n".join(
        str(section.get("content") or "")
        for section in payload["sections"]
        if isinstance(section, dict)
    )
    assert "Lead paragraph before the named manuscript sections." in combined_content
    assert "Unheaded methods lead-in content should still be preserved." in combined_content


def test_parse_grobid_tei_recovers_open_access_wrappers_and_direct_back_matter_blocks() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <body>
          <div>
            <head>Results</head>
            <p>Primary results text is presented here.</p>
          </div>
          <div>
            <head>Open access</head>
            <p>Additional results detail should not be dropped from the manuscript model.</p>
          </div>
          <div>
            <head>Discussion</head>
            <p>Primary discussion text is presented here.</p>
          </div>
          <div>
            <head>Open access</head>
            <p>Additional discussion interpretation should also be preserved in the manuscript model.</p>
          </div>
        </body>
        <back>
          <p>Data availability statement Data are available upon reasonable request.</p>
          <p>Competing interests Authors declare no competing interests.</p>
        </back>
      </text>
    </TEI>
    """
    payload = publication_console_service._parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml,
        title="Test paper",
    )

    combined_content = "\n".join(
        str(section.get("content") or "")
        for section in payload["sections"]
        if isinstance(section, dict)
    )
    assert "Additional results detail should not be dropped" in combined_content
    assert "Additional discussion interpretation should also be preserved" in combined_content
    assert any(
        section["canonical_kind"] == "data_availability"
        for section in payload["sections"]
    )
    assert any(
        section["canonical_kind"] == "conflicts"
        for section in payload["sections"]
    )


def test_refine_publication_paper_sections_creates_inline_subsections_for_major_sections() -> None:
    refined_sections = publication_console_service._refine_publication_paper_sections(
        [
            {
                "id": "paper-section-abstract",
                "title": "Abstract",
                "raw_label": "Abstract",
                "label_original": "Abstract",
                "label_normalized": "Abstract",
                "canonical_kind": "abstract",
                "kind": "abstract",
                "content": (
                    "Objectives: To evaluate incremental diagnostic yield. "
                    "Design: Prospective registry study. "
                    "Results: Diagnostic discordance was common. "
                    "Conclusions: CMR improved phenotyping."
                ),
                "source": "grobid",
                "order": 0,
                "level": 1,
                "parent_id": None,
            },
            {
                "id": "paper-section-methods",
                "title": "Methods",
                "raw_label": "Methods",
                "label_original": "Methods",
                "label_normalized": "Methods",
                "canonical_kind": "methods",
                "kind": "methods",
                "content": (
                    "Design: Prospective registry study. "
                    "Setting: Tertiary centre imaging service. "
                    "Main outcome measures: Aetiological reclassification."
                ),
                "source": "grobid",
                "order": 1,
                "level": 1,
                "parent_id": None,
            },
        ],
        journal="BMJ Open",
    )

    abstract_section = next(
        section for section in refined_sections if section["id"] == "paper-section-abstract"
    )
    methods_section = next(
        section for section in refined_sections if section["id"] == "paper-section-methods"
    )
    abstract_children = [
        section
        for section in refined_sections
        if section.get("parent_id") == "paper-section-abstract"
    ]
    methods_children = [
        section
        for section in refined_sections
        if section.get("parent_id") == "paper-section-methods"
    ]

    assert abstract_section["major_section_key"] == "overview"
    assert abstract_section["section_role"] == "major"
    assert [section["title"] for section in abstract_children] == [
        "Objective",
        "Design",
        "Results",
        "Conclusion",
    ]
    assert all(section["major_section_key"] == "overview" for section in abstract_children)
    assert methods_section["major_section_key"] == "methods"
    assert methods_section["section_role"] == "major"
    assert [section["title"] for section in methods_children] == [
        "Design",
        "Setting",
        "Main outcome measures",
    ]
    assert all(section["major_section_key"] == "methods" for section in methods_children)
    assert all(section["section_role"] == "subsection" for section in methods_children)


def test_refine_publication_paper_sections_dedupes_exact_repeated_leaf_sections() -> None:
    refined_sections = publication_console_service._refine_publication_paper_sections(
        [
            {
                "id": "paper-section-abstract",
                "title": "Abstract",
                "raw_label": "Abstract",
                "label_original": "Abstract",
                "label_normalized": "Abstract",
                "canonical_kind": "abstract",
                "kind": "abstract",
                "content": "",
                "source": "grobid",
                "order": 0,
                "level": 1,
                "parent_id": None,
                "document_zone": "front",
            },
            {
                "id": "paper-section-abstract-objective",
                "title": "Objective",
                "raw_label": "Objective",
                "label_original": "Objective",
                "label_normalized": "Objective",
                "canonical_kind": "introduction",
                "kind": "introduction",
                "content": "To evaluate incremental diagnostic yield in heart failure phenotyping.",
                "source": "grobid",
                "order": 1,
                "level": 2,
                "parent_id": "paper-section-abstract",
                "document_zone": "front",
            },
            {
                "id": "paper-section-introduction",
                "title": "Introduction",
                "raw_label": "Introduction",
                "label_original": "Introduction",
                "label_normalized": "Introduction",
                "canonical_kind": "introduction",
                "kind": "introduction",
                "content": "",
                "source": "grobid",
                "order": 2,
                "level": 1,
                "parent_id": None,
                "document_zone": "body",
            },
            {
                "id": "paper-section-introduction-objective",
                "title": "Objective",
                "raw_label": "Objective",
                "label_original": "Objective",
                "label_normalized": "Objective",
                "canonical_kind": "introduction",
                "kind": "introduction",
                "content": "To evaluate incremental diagnostic yield in heart failure phenotyping.",
                "source": "grobid",
                "order": 3,
                "level": 2,
                "parent_id": "paper-section-introduction",
                "document_zone": "body",
            },
        ],
        journal="BMJ Open",
    )

    objective_sections = [
        section
        for section in refined_sections
        if section["title"] == "Objective"
        and section["content"]
        == "To evaluate incremental diagnostic yield in heart failure phenotyping."
    ]
    assert len(objective_sections) == 1


def test_refine_publication_paper_sections_does_not_attach_body_subsections_to_future_back_heading() -> None:
    refined_sections = publication_console_service._refine_publication_paper_sections(
        [
            {
                "id": "paper-section-study-population",
                "title": "Study population",
                "raw_label": "Study population",
                "label_original": "Study population",
                "label_normalized": "Study population",
                "canonical_kind": "section",
                "kind": "section",
                "content": "Adults referred for imaging were enrolled.",
                "source": "grobid",
                "order": 0,
                "level": 1,
                "parent_id": None,
                "document_zone": "body",
            },
            {
                "id": "paper-section-statistical-analysis",
                "title": "Statistical analysis",
                "raw_label": "Statistical analysis",
                "label_original": "Statistical analysis",
                "label_normalized": "Statistical analysis",
                "canonical_kind": "methods",
                "kind": "methods",
                "content": "Regression models were prespecified.",
                "source": "grobid",
                "order": 1,
                "level": 1,
                "parent_id": None,
                "document_zone": "body",
            },
            {
                "id": "paper-section-back-methods",
                "title": "Methods",
                "raw_label": "Methods",
                "label_original": "Methods",
                "label_normalized": "Methods",
                "canonical_kind": "methods",
                "kind": "methods",
                "content": "Competing interests statement.",
                "source": "grobid",
                "order": 2,
                "level": 1,
                "parent_id": None,
                "document_zone": "back",
            },
        ],
        journal="BMJ Open",
    )

    study_population = next(
        section for section in refined_sections if section["id"] == "paper-section-study-population"
    )
    statistical_analysis = next(
        section for section in refined_sections if section["id"] == "paper-section-statistical-analysis"
    )
    assert study_population["parent_id"] is None
    assert statistical_analysis["parent_id"] is None


def test_refine_publication_paper_sections_nests_summary_boxes_under_abstract() -> None:
    refined_sections = publication_console_service._refine_publication_paper_sections(
        [
            {
                "id": "paper-section-abstract",
                "title": "Abstract",
                "raw_label": "Abstract",
                "label_original": "Abstract",
                "label_normalized": "Abstract",
                "canonical_kind": "abstract",
                "kind": "abstract",
                "content": "Structured abstract content.",
                "source": "grobid",
                "order": 0,
                "level": 1,
                "parent_id": None,
                "document_zone": "front",
            },
            {
                "id": "paper-section-known",
                "title": "What is already known on this topic",
                "raw_label": "What is already known on this topic",
                "label_original": "What is already known on this topic",
                "label_normalized": "What is already known on this topic",
                "canonical_kind": "section",
                "kind": "section",
                "content": "Prior echo phenotyping misses important subtypes.",
                "source": "grobid",
                "order": 1,
                "level": 1,
                "parent_id": None,
                "document_zone": "front",
            },
            {
                "id": "paper-section-adds",
                "title": "What this study adds",
                "raw_label": "What this study adds",
                "label_original": "What this study adds",
                "label_normalized": "What this study adds",
                "canonical_kind": "section",
                "kind": "section",
                "content": "CMR improved aetiological sub-phenotyping beyond echocardiography.",
                "source": "grobid",
                "order": 2,
                "level": 1,
                "parent_id": None,
                "document_zone": "front",
            },
        ],
        journal="BMJ Open",
    )

    known_section = next(
        section for section in refined_sections if section["id"] == "paper-section-known"
    )
    adds_section = next(
        section for section in refined_sections if section["id"] == "paper-section-adds"
    )

    assert known_section["canonical_kind"] == "key_summary_known"
    assert known_section["section_role"] == "summary_box"
    assert known_section["parent_id"] == "paper-section-abstract"
    assert known_section["level"] >= 2

    assert adds_section["canonical_kind"] == "key_summary_adds"
    assert adds_section["section_role"] == "summary_box"
    assert adds_section["parent_id"] == "paper-section-abstract"
    assert adds_section["level"] >= 2


def test_refine_publication_paper_sections_classifies_abbreviations_as_metadata() -> None:
    refined_sections = publication_console_service._refine_publication_paper_sections(
        [
            {
                "id": "paper-section-abbreviations",
                "title": "Abbreviations",
                "raw_label": "Abbreviations",
                "label_original": "Abbreviations",
                "label_normalized": "Abbreviations",
                "canonical_kind": "section",
                "kind": "section",
                "content": "CMR, cardiac magnetic resonance; LVFP, left ventricular filling pressure.",
                "source": "grobid",
                "order": 0,
                "level": 1,
                "parent_id": None,
                "document_zone": "front",
            },
        ],
        journal="Open Heart",
    )

    abbreviations = refined_sections[0]
    assert abbreviations["canonical_kind"] == "abbreviations"
    assert abbreviations["section_type"] == "metadata"
    assert abbreviations["major_section_key"] == "article_information"
    assert abbreviations["section_role"] == "metadata"


def test_refine_publication_paper_sections_trims_summary_box_overflow() -> None:
    contaminated_content = (
        "⇒ Prospective design with data from a real-world clinical registry, which reflects current clinical practice. "
        "⇒ The 'all-comers' approach for the registry enhances the generalisability of findings to patients who are referred "
        "for multi-modality imaging due to diagnostic uncertainty. "
        "⇒ A key limitation is that the cohort was derived from a single centre, which may introduce referral bias and limit applicability to other settings. "
        "⇒ Left ventricular filling pressure was estimated using a non-invasive Cardiovascular Magnetic Resonance (CMR)-derived equation without validation "
        "against the gold standard of invasive catheterisation. "
        "⇒ The study population included only patients referred for both Transthoracic Echocardiography and CMR, potentially skewing the cohort towards "
        "more diagnostically challenging cases. "
        "assess myocardial scar and extracellular matrix expansion through techniques like late gadolinium enhancement (LGE) and T1 mapping. "
        "{{cite:b3}} {{cite:b4}} {{cite:b5}} Despite its potential, the comparative diagnostic yield of CMR over TTE {{cite:b6}} in patients with raised LVFP remains underexplored."
    )
    refined_sections = publication_console_service._refine_publication_paper_sections(
        [
            {
                "id": "paper-section-strengths",
                "title": "Strengths And Limitations Of This Study",
                "raw_label": "Strengths And Limitations Of This Study",
                "label_original": "Strengths And Limitations Of This Study",
                "label_normalized": "Strengths And Limitations Of This Study",
                "canonical_kind": "highlights",
                "kind": "highlights",
                "content": contaminated_content,
                "source": "grobid",
                "order": 0,
                "level": 1,
                "parent_id": None,
                "document_zone": "body",
            },
        ],
        journal="BMJ Open",
    )

    strengths_section = refined_sections[0]
    assert "Prospective design with data from a real-world clinical registry" in strengths_section["content"]
    assert "The study population included only patients referred for both Transthoracic Echocardiography and CMR" in strengths_section["content"]
    assert "assess myocardial scar and extracellular matrix expansion" not in strengths_section["content"]
    assert "Despite its potential" not in strengths_section["content"]


def test_parse_grobid_tei_merges_headingless_body_continuation_into_current_major_section() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <body>
          <div>
            <head>Results</head>
            <p>Primary results text is presented here.</p>
          </div>
          <div>
            <p>Additional results detail should stay under the existing results section.</p>
          </div>
        </body>
      </text>
    </TEI>
    """
    payload = publication_console_service._parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml,
        title="Test paper",
    )

    results_sections = [
        section
        for section in payload["sections"]
        if section["canonical_map"] == "results"
        and section["document_zone"] == "body"
    ]
    assert len(results_sections) == 1
    assert "Primary results text is presented here." in results_sections[0]["content"]
    assert "Additional results detail should stay under the existing results section." in results_sections[0]["content"]


def test_parse_grobid_tei_splits_headingless_back_matter_blocks_into_separate_sections() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <back>
          <div>
            <p>Competing interests Authors declare no competing interests.</p>
            <p>Patient and public involvement Patients were not involved in the study design.</p>
          </div>
        </back>
      </text>
    </TEI>
    """
    payload = publication_console_service._parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml,
        title="Test paper",
    )

    titles = [section["title"] for section in payload["sections"]]
    assert "Competing interests" in titles
    assert "Patient and public involvement" in titles


def test_parse_grobid_tei_preserves_empty_explicit_major_wrappers_for_body_subsections() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <body>
          <div>
            <head>METHODS</head>
          </div>
          <div>
            <head>Statistical analysis</head>
            <p>Prespecified regression models were used.</p>
          </div>
          <div>
            <head>RESULTS</head>
          </div>
          <div>
            <head>Study population</head>
            <p>Two hundred participants completed the study.</p>
          </div>
        </body>
      </text>
    </TEI>
    """
    payload = publication_console_service._parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml,
        title="Test paper",
    )

    methods_section = next(
        section
        for section in payload["sections"]
        if section["title"] == "Methods" and section["document_zone"] == "body"
    )
    results_section = next(
        section
        for section in payload["sections"]
        if section["title"] == "Results" and section["document_zone"] == "body"
    )
    methods_child = next(
        section
        for section in payload["sections"]
        if section["title"] == "Statistical analysis"
        and section["document_zone"] == "body"
        and "Prespecified regression models" in section["content"]
    )
    results_child = next(
        section
        for section in payload["sections"]
        if section["title"] == "Study population"
        and section["document_zone"] == "body"
        and "Two hundred participants" in section["content"]
    )

    assert methods_section["parent_id"] is None
    assert results_section["parent_id"] is None
    assert methods_child["parent_id"] == methods_section["id"]
    assert results_child["parent_id"] == results_section["id"]


def test_parse_grobid_tei_ignores_body_note_blocks_when_div_sections_exist() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <body>
          <div>
            <head>Introduction</head>
            <p>Main introduction text.</p>
          </div>
          <note place="foot">10.1136/example on BMJ Open: first published as</note>
        </body>
      </text>
    </TEI>
    """
    payload = publication_console_service._parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml,
        title="Test paper title",
    )

    titles = [section["title"] for section in payload["sections"]]
    assert titles == ["Introduction"]


def test_parse_grobid_tei_ignores_body_citation_lines_before_real_sections() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <body>
          <p>Smith J, et al. Example Journal 2026;16:e102836. doi:10.1136/example-2025-102836</p>
          <div>
            <head>Introduction</head>
            <p>Main introduction text.</p>
          </div>
          <div>
            <head>Methods</head>
            <p>Main methods text.</p>
          </div>
        </body>
      </text>
    </TEI>
    """
    payload = publication_console_service._parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml,
        title="Test paper title",
    )

    titles = [section["title"] for section in payload["sections"]]
    combined_content = "\n".join(
        str(section.get("content") or "")
        for section in payload["sections"]
        if isinstance(section, dict)
    )

    assert titles == ["Introduction", "Methods"]
    assert "Smith J, et al. Example Journal 2026;16:e102836." not in combined_content
    assert "doi:10.1136/example-2025-102836" not in combined_content


def test_parse_grobid_tei_prefers_visible_numeric_bibliography_labels() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <body>
          <div>
            <head>Introduction</head>
            <p>
              Despite its potential, the comparative diagnostic yield of CMR over TTE
              <ref type="bibr" target="#b6">7</ref>
              in patients with raised LVFP remains underexplored.
            </p>
          </div>
        </body>
      </text>
    </TEI>
    """
    payload = publication_console_service._parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml,
        title="Test paper title",
    )

    intro = next(section for section in payload["sections"] if section["title"] == "Introduction")
    assert "TTE [7] in patients" in intro["content"]


def test_tei_split_displaced_paragraphs_preserves_visible_numeric_citations() -> None:
    tei_xml = """
    <div xmlns="http://www.tei-c.org/ns/1.0">
      <p>Visible summary bullet.</p>
      <p>Protected by copyright, including for uses related to text and data mining, AI training, and similar technologies.</p>
      <p>Overflow continuation over TTE <ref type="bibr" target="#b6">7</ref> in patients with raised LVFP.</p>
    </div>
    """
    node = ET.fromstring(tei_xml)

    native, displaced = publication_console_service._tei_split_displaced_paragraphs(node)

    assert native == ["Visible summary bullet."]
    assert displaced == ["Overflow continuation over TTE [7] in patients with raised LVFP."]


def test_parse_grobid_tei_splits_headed_back_matter_blocks_without_duplicate_listorg_noise() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <back>
          <div type="acknowledgement">
            <div>
              <p>Acknowledgements We thank the study team.</p>
              <p>Contributors AB drafted the manuscript.</p>
              <p>Funding Supported by the Wellcome Trust.</p>
            </div>
          </div>
          <listOrg type="funding">
            <orgName>Wellcome Trust</orgName>
          </listOrg>
          <div type="annex">
            <div>
              <head>Patient consent for publication Not applicable.</head>
              <p>Ethics approval Approved by the ethics committee.</p>
              <p>Provenance and peer review Not commissioned; externally peer reviewed.</p>
            </div>
          </div>
        </back>
      </text>
    </TEI>
    """
    payload = publication_console_service._parse_grobid_tei_into_structured_paper(
        tei_xml=tei_xml,
        title="Test paper",
    )

    titles = [section["title"] for section in payload["sections"]]
    assert titles.count("Contributors") == 1
    assert "Acknowledgements" in titles
    assert "Funding" in titles
    assert "Patient consent for publication" in titles
    assert "Ethics approval" in titles
    assert "Provenance and peer review" in titles


def test_extract_publication_paper_reference_entries_from_tei_ignores_source_desc_biblstruct() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <teiHeader>
        <fileDesc>
          <sourceDesc>
            <biblStruct>
              <analytic>
                <title>Front-matter record</title>
              </analytic>
            </biblStruct>
          </sourceDesc>
        </fileDesc>
      </teiHeader>
      <text>
        <back>
          <div type="references">
            <listBibl>
              <biblStruct>
                <analytic>
                  <title>Real reference</title>
                </analytic>
              </biblStruct>
            </listBibl>
          </div>
        </back>
      </text>
    </TEI>
    """
    root = ET.fromstring(tei_xml)

    references = publication_console_service._extract_publication_paper_reference_entries_from_tei(
        root
    )

    assert len(references) == 1
    assert references[0]["raw_text"] == "Real reference."


def test_extract_publication_paper_reference_entries_from_tei_formats_structured_citation() -> None:
    tei_xml = """
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <text>
        <back>
          <div type="references">
            <listBibl>
              <biblStruct>
                <label>[7]</label>
                <analytic>
                  <author>
                    <persName>
                      <forename type="first">Jane</forename>
                      <forename type="middle">Alice</forename>
                      <surname>Smith</surname>
                    </persName>
                  </author>
                  <author>
                    <persName>
                      <forename>Peter</forename>
                      <surname>Jones</surname>
                    </persName>
                  </author>
                  <title level="a">Structured readers in cardiology</title>
                </analytic>
                <monogr>
                  <title level="j">BMJ Open</title>
                  <imprint>
                    <date when="2026-05-01" />
                    <biblScope unit="volume" from="12" />
                    <biblScope unit="issue" from="3" />
                    <biblScope unit="page" from="45" to="52" />
                  </imprint>
                </monogr>
                <idno type="DOI">10.1136/bmjopen-2026-000001</idno>
                <idno type="PMID">12345678</idno>
              </biblStruct>
            </listBibl>
          </div>
        </back>
      </text>
    </TEI>
    """

    references = publication_console_service._extract_publication_paper_reference_entries_from_tei(
        ET.fromstring(tei_xml)
    )

    assert len(references) == 1
    assert references[0]["label"] == "[7]"
    assert references[0]["raw_text"] == (
        "Smith JA, Jones P. Structured readers in cardiology. "
        "BMJ Open. 2026;12(3):45-52. doi: 10.1136/bmjopen-2026-000001. "
        "PMID: 12345678."
    )


def test_build_publication_paper_payload_preserves_prestructured_section_hierarchy() -> None:
    payload, _ = publication_console_service._build_publication_paper_payload(
        publication={
            "title": "Structured paper",
            "journal": "BMJ Open",
            "abstract": None,
            "authors_json": "[]",
            "keywords_json": "[]",
            "year": 2026,
            "publication_type": "journal-article",
            "article_type": "Original research",
            "doi": "10.1136/example",
            "pmid": "12345678",
            "openalex_id": None,
            "citations": 0,
        },
        structured_abstract_payload={},
        structured_abstract_status="UNAVAILABLE",
        files=[],
        parsed_paper={
            "sections": [
                {
                    "id": "paper-section-abstract",
                    "title": "Abstract",
                    "raw_label": "Abstract",
                    "label_original": "Abstract",
                    "label_normalized": "Abstract",
                    "kind": "abstract",
                    "canonical_kind": "abstract",
                    "section_type": "canonical",
                    "canonical_map": "abstract",
                    "content": "",
                    "source": "grobid",
                    "source_parser": "grobid",
                    "order": 0,
                    "page_start": 1,
                    "page_end": 1,
                    "level": 1,
                    "parent_id": None,
                    "bounding_boxes": [],
                    "confidence": 1.0,
                    "is_generated_heading": False,
                    "word_count": 0,
                    "paragraph_count": 0,
                    "document_zone": "front",
                    "section_role": "major",
                    "journal_section_family": None,
                    "major_section_key": "overview",
                },
                {
                    "id": "paper-section-abstract-inline-objective",
                    "title": "Objective",
                    "raw_label": "Objective",
                    "label_original": "Objective",
                    "label_normalized": "Objective",
                    "kind": "introduction",
                    "canonical_kind": "introduction",
                    "section_type": "canonical",
                    "canonical_map": "introduction",
                    "content": "To evaluate incremental diagnostic yield.",
                    "source": "grobid",
                    "source_parser": "grobid",
                    "order": 1,
                    "page_start": 1,
                    "page_end": 1,
                    "level": 2,
                    "parent_id": "paper-section-abstract",
                    "bounding_boxes": [],
                    "confidence": 1.0,
                    "is_generated_heading": False,
                    "word_count": 6,
                    "paragraph_count": 1,
                    "document_zone": "front",
                    "section_role": "subsection",
                    "journal_section_family": None,
                    "major_section_key": "overview",
                },
                {
                    "id": "paper-section-introduction",
                    "title": "Introduction",
                    "raw_label": "Introduction",
                    "label_original": "Introduction",
                    "label_normalized": "Introduction",
                    "kind": "introduction",
                    "canonical_kind": "introduction",
                    "section_type": "canonical",
                    "canonical_map": "introduction",
                    "content": "Heart failure phenotyping remains challenging.",
                    "source": "grobid",
                    "source_parser": "grobid",
                    "order": 2,
                    "page_start": 2,
                    "page_end": 2,
                    "level": 1,
                    "parent_id": None,
                    "bounding_boxes": [],
                    "confidence": 1.0,
                    "is_generated_heading": False,
                    "word_count": 5,
                    "paragraph_count": 1,
                    "document_zone": "body",
                    "section_role": "major",
                    "journal_section_family": None,
                    "major_section_key": "introduction",
                },
            ],
            "figures": [],
            "tables": [],
            "references": [],
            "page_count": 8,
            "generation_method": "grobid_tei_fulltext_v3",
            "parser_provider": "grobid",
        },
        parser_status="FULL_TEXT_READY",
        parser_last_error=None,
    )

    child_section = next(
        section
        for section in payload["sections"]
        if section["id"] == "paper-section-abstract-inline-objective"
    )

    assert child_section["parent_id"] == "paper-section-abstract"
    assert child_section["major_section_key"] == "overview"
    assert child_section["section_role"] == "subsection"


def test_build_publication_paper_payload_keeps_seed_abstract_when_full_text_lacks_one() -> None:
    payload, _ = publication_console_service._build_publication_paper_payload(
        publication={
            "title": "PMC reader paper",
            "journal": "Reader Journal",
            "abstract": (
                "Objective: Evaluate reader structure. "
                "Methods: Prefer PMC sections. "
                "Results: Preserve the abstract. "
                "Conclusion: Keep the reader trustworthy."
            ),
            "authors_json": "[]",
            "keywords_json": "[]",
            "year": 2026,
            "publication_type": "journal-article",
            "article_type": "Original research",
            "doi": "10.1000/pmc-reader-paper",
            "pmid": "12345679",
            "openalex_id": None,
            "citations": 0,
        },
        structured_abstract_payload={
            "format": "structured",
            "sections": [
                {
                    "key": "introduction",
                    "label": "Objective",
                    "content": "Evaluate reader structure.",
                },
                {
                    "key": "methods",
                    "label": "Methods",
                    "content": "Prefer PMC sections.",
                },
                {
                    "key": "results",
                    "label": "Results",
                    "content": "Preserve the abstract.",
                },
            ],
        },
        structured_abstract_status="READY",
        files=[],
        parsed_paper={
            "sections": [
                {
                    "id": "paper-section-introduction",
                    "title": "Introduction",
                    "raw_label": "Introduction",
                    "label_original": "Introduction",
                    "label_normalized": "Introduction",
                    "kind": "introduction",
                    "canonical_kind": "introduction",
                    "section_type": "canonical",
                    "canonical_map": "introduction",
                    "content": "Full PMC introduction text.",
                    "source": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_BIOC,
                    "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_BIOC,
                    "order": 0,
                    "page_start": None,
                    "page_end": None,
                    "level": 1,
                    "parent_id": None,
                    "bounding_boxes": [],
                    "confidence": None,
                    "is_generated_heading": False,
                    "word_count": 4,
                    "paragraph_count": 1,
                    "document_zone": "body",
                    "section_role": "major",
                    "journal_section_family": None,
                    "major_section_key": "introduction",
                },
                {
                    "id": "paper-section-methods",
                    "title": "Methods",
                    "raw_label": "Methods",
                    "label_original": "Methods",
                    "label_normalized": "Methods",
                    "kind": "methods",
                    "canonical_kind": "methods",
                    "section_type": "canonical",
                    "canonical_map": "methods",
                    "content": "Full PMC methods text.",
                    "source": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_BIOC,
                    "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_BIOC,
                    "order": 1,
                    "page_start": None,
                    "page_end": None,
                    "level": 1,
                    "parent_id": None,
                    "bounding_boxes": [],
                    "confidence": None,
                    "is_generated_heading": False,
                    "word_count": 4,
                    "paragraph_count": 1,
                    "document_zone": "body",
                    "section_role": "major",
                    "journal_section_family": None,
                    "major_section_key": "methods",
                },
            ],
            "figures": [],
            "tables": [],
            "references": [],
            "page_count": None,
            "generation_method": "pmc_bioc_fulltext_v1",
            "parser_provider": publication_console_service.STRUCTURED_PAPER_PARSER_PROVIDER_PMC_BIOC,
        },
        parser_status="FULL_TEXT_READY",
        parser_last_error=None,
    )

    sources = [section["source"] for section in payload["sections"]]
    titles = [section["title"] for section in payload["sections"]]
    abstract_section = next(section for section in payload["sections"] if section["title"] == "Abstract")
    objective_section = next(section for section in payload["sections"] if section["title"] == "Objective")

    assert titles[:4] == ["Abstract", "Objective", "Methods", "Results"]
    assert sources[:4] == [
        "structured_abstract",
        "structured_abstract",
        "structured_abstract",
        "structured_abstract",
    ]
    assert objective_section["parent_id"] == abstract_section["id"]
    assert any(source == publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_BIOC for source in sources)
    assert "Introduction" in titles


def test_build_publication_paper_outline_adds_synthetic_main_text_wrappers() -> None:
    outline = publication_console_service._build_publication_paper_outline(
        publication={"title": "Outline paper"},
        sections=[
            {
                "id": "paper-section-design",
                "title": "Design",
                "raw_label": "Design",
                "label_original": "Design",
                "label_normalized": "Design",
                "canonical_kind": "methods",
                "canonical_map": "methods",
                "section_type": "canonical",
                "content": "Prospective registry design.",
                "order": 0,
                "page_start": 2,
                "page_end": 2,
                "level": 2,
                "parent_id": None,
            },
            {
                "id": "paper-section-study-population",
                "title": "Study population",
                "raw_label": "Study population",
                "label_original": "Study population",
                "label_normalized": "Study population",
                "canonical_kind": "section",
                "canonical_map": "results",
                "section_type": "canonical",
                "content": "A total of 125 participants were included in the final cohort.",
                "order": 1,
                "page_start": 4,
                "page_end": 4,
                "level": 2,
                "parent_id": None,
            },
        ],
        figures=[],
        tables=[],
        datasets=[],
        attachments=[],
        references=[],
        page_count=11,
    )

    methods_node = next(
        node for node in outline if node["label_normalized"] == "Methods"
    )
    results_node = next(
        node for node in outline if node["label_normalized"] == "Results"
    )
    design_node = next(
        node for node in outline if node.get("target_id") == "paper-section-design"
    )
    population_node = next(
        node
        for node in outline
        if node.get("target_id") == "paper-section-study-population"
    )
    assert methods_node["node_type"] == "synthetic"
    assert results_node["node_type"] == "synthetic"
    assert design_node["parent_id"] == methods_node["id"]
    assert population_node["parent_id"] == results_node["id"]


def test_publication_paper_model_endpoint_fails_when_grobid_is_unavailable(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    def _immediate_submit(*, kind: str, user_id: str, publication_id: str, fn):  # noqa: ANN001
        fn(user_id=user_id, publication_id=publication_id)
        return True

    monkeypatch.setattr(
        publication_console_service, "_submit_background_job", _immediate_submit
    )
    monkeypatch.setattr(
        publication_console_service,
        "_resolve_publication_file_binary_payload",
        lambda **kwargs: {  # noqa: ANN003
            "content": b"%PDF-1.4 test",
            "content_type": "application/pdf",
            "file_name": "paper.pdf",
            "mode": "content",
            "url": None,
        },
    )
    monkeypatch.setattr(
        publication_console_service,
        "_fetch_open_access_pdf_bytes",
        lambda *args, **kwargs: (b"%PDF-1.7 locally cached oa payload", "application/pdf"),
    )

    def _raise_grobid_unavailable(**kwargs):  # noqa: ANN003
        raise publication_console_service.PublicationConsoleValidationError(
            "GROBID is required for full-paper parsing and is not reachable."
        )

    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_paper_with_grobid",
        _raise_grobid_unavailable,
    )

    with TestClient(app) as client:
        owner_id, token = _register(client, email="reader-grobid@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="Structured reader paper",
                title_lower="structured reader paper",
                year=2026,
                doi="10.1000/structured-reader-paper",
                work_type="journal-article",
                publication_type="original-article",
                venue_name="Reader Journal",
                publisher="Reader Publisher",
                abstract=(
                    "Objectives: Evaluate scaffolded readers. "
                    "Methods: Prototype viewer shell. "
                    "Results: Better navigation. "
                    "Conclusions: Start with structure first."
                ),
                keywords=["reader", "structure"],
                authors_json=[{"name": "Alice Example"}],
                url="https://pubmed.ncbi.nlm.nih.gov/12345678/",
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

            primary_pdf = PublicationFile(
                owner_user_id=owner_id,
                publication_id=work_id,
                file_name="Example (2026) - PMID 12345678.pdf",
                file_type="PDF",
                storage_key="",
                source="OA_LINK",
                oa_url="https://example.org/paper.pdf",
                checksum=None,
                custom_name=True,
                classification="PUBLISHED_MANUSCRIPT",
            )
            session.add(primary_pdf)
            session.flush()

        first_response = client.get(
            f"/v1/publications/{work_id}/paper-model",
            headers=_auth_headers(token),
        )
        assert first_response.status_code == 200
        assert first_response.json()["status"] == "RUNNING"

        second_response = client.get(
            f"/v1/publications/{work_id}/paper-model",
            headers=_auth_headers(token),
        )
        assert second_response.status_code == 200
        payload = second_response.json()
        assert payload["status"] == "FAILED"
        assert payload["payload"]["document"]["parser_status"] == "FAILED"
        assert payload["payload"]["document"]["has_full_text_sections"] is False
        assert payload["payload"]["document"]["reader_entry_available"] is True
        assert "GROBID" in str(payload["payload"]["document"]["parser_last_error"] or "")
        assert payload["payload"]["sections"][0]["source"] in {"structured_abstract", "abstract"}


def test_publication_paper_model_hides_reader_entry_without_pdf_when_grobid_is_unavailable(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    monkeypatch.setattr(
        publication_console_service,
        "grobid_available",
        lambda **kwargs: False,
    )
    monkeypatch.setattr(
        publication_console_service,
        "_enqueue_structured_abstract_if_needed",
        lambda **kwargs: False,
    )

    user_id, work_id = _seed_user_and_work(
        email="reader-no-pdf-unavailable@example.com",
        title="Reader hidden without parser",
    )
    with session_scope() as session:
        work = session.get(Work, work_id)
        assert work is not None
        work.doi = None
        session.flush()

    payload = publication_console_service.get_publication_paper_model(
        user_id=user_id,
        publication_id=work_id,
    )
    assert payload["status"] == "READY"
    assert payload["payload"]["document"]["has_viewable_pdf"] is False
    assert payload["payload"]["document"]["parser_status"] == "STRUCTURE_ONLY"
    assert payload["payload"]["document"]["reader_entry_available"] is False


def test_publication_paper_model_keeps_reader_entry_without_pdf_when_grobid_is_available(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    monkeypatch.setattr(
        publication_console_service,
        "grobid_available",
        lambda **kwargs: True,
    )
    monkeypatch.setattr(
        publication_console_service,
        "_enqueue_structured_abstract_if_needed",
        lambda **kwargs: False,
    )

    user_id, work_id = _seed_user_and_work(
        email="reader-no-pdf-available@example.com",
        title="Reader visible without parser input",
    )
    with session_scope() as session:
        work = session.get(Work, work_id)
        assert work is not None
        work.doi = None
        session.flush()

    payload = publication_console_service.get_publication_paper_model(
        user_id=user_id,
        publication_id=work_id,
    )
    assert payload["status"] == "READY"
    assert payload["payload"]["document"]["has_viewable_pdf"] is False
    assert payload["payload"]["document"]["parser_status"] == "STRUCTURE_ONLY"
    assert payload["payload"]["document"]["reader_entry_available"] is True


def test_align_structured_publication_sections_to_pdf_pages_uses_stored_pdf_text(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    class _FakePage:
        def __init__(self, text: str) -> None:
            self._text = text

        def extract_text(self) -> str:
            return self._text

    class _FakePdfReader:
        def __init__(self, _stream) -> None:  # noqa: ANN001
            self.pages = [
                _FakePage("Abstract Objectives evaluate incremental diagnostic value."),
                _FakePage("Introduction Cardiovascular diseases remain a leading cause."),
                _FakePage("Study population Adults referred for imaging were enrolled."),
                _FakePage("Results CMR demonstrated diagnostic discordance with TTE."),
            ]

    monkeypatch.setattr(publication_console_service, "PdfReader", _FakePdfReader)

    aligned_sections, page_count = (
        publication_console_service._align_structured_publication_sections_to_pdf_pages(
            sections=[
                {
                    "id": "paper-section-1-abstract",
                    "title": "Abstract",
                    "raw_label": "Abstract",
                    "canonical_kind": "abstract",
                    "kind": "abstract",
                    "content": "Objectives evaluate incremental diagnostic value.",
                    "source": "grobid",
                    "order": 0,
                    "page_start": None,
                    "page_end": None,
                    "level": 1,
                    "parent_id": None,
                    "word_count": 5,
                    "paragraph_count": 1,
                },
                {
                    "id": "paper-section-2-introduction",
                    "title": "Introduction",
                    "raw_label": "Introduction",
                    "canonical_kind": "introduction",
                    "kind": "introduction",
                    "content": "Cardiovascular diseases remain a leading cause.",
                    "source": "grobid",
                    "order": 1,
                    "page_start": None,
                    "page_end": None,
                    "level": 1,
                    "parent_id": None,
                    "word_count": 6,
                    "paragraph_count": 1,
                },
                {
                    "id": "paper-section-3-study-population",
                    "title": "Study population",
                    "raw_label": "Study population",
                    "canonical_kind": "section",
                    "kind": "section",
                    "content": "Adults referred for imaging were enrolled.",
                    "source": "grobid",
                    "order": 2,
                    "page_start": None,
                    "page_end": None,
                    "level": 2,
                    "parent_id": "paper-section-2-introduction",
                    "word_count": 6,
                    "paragraph_count": 1,
                },
                {
                    "id": "paper-section-4-results",
                    "title": "Results",
                    "raw_label": "Results",
                    "canonical_kind": "results",
                    "kind": "results",
                    "content": "CMR demonstrated diagnostic discordance with TTE.",
                    "source": "grobid",
                    "order": 3,
                    "page_start": None,
                    "page_end": None,
                    "level": 1,
                    "parent_id": None,
                    "word_count": 6,
                    "paragraph_count": 1,
                },
            ],
            content=b"%PDF-1.7 anchor test",
        )
    )

    assert page_count == 4
    assert [section["page_start"] for section in aligned_sections] == [1, 2, 3, 4]
    assert [section["page_end"] for section in aligned_sections] == [1, 2, 3, 4]


def test_align_structured_publication_assets_to_pdf_pages_uses_stored_pdf_text(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    class _FakePage:
        def __init__(self, text: str) -> None:
            self._text = text

        def extract_text(self) -> str:
            return self._text

    class _FakePdfReader:
        def __init__(self, _stream) -> None:  # noqa: ANN001
            self.pages = [
                _FakePage("Figure 1 Recruitment flow diagram and cohort overview."),
                _FakePage("Table 1 Baseline cohort characteristics and outcomes."),
            ]

    monkeypatch.setattr(publication_console_service, "PdfReader", _FakePdfReader)

    aligned_assets = publication_console_service._align_structured_publication_assets_to_pdf_pages(
        assets=[
            {
                "id": "parsed-figure-1",
                "title": "Figure 1",
                "file_name": "Figure 1",
                "caption": "Recruitment flow diagram.",
                "classification": "FIGURE",
                "page_start": None,
                "page_end": None,
            },
            {
                "id": "parsed-table-1",
                "title": "Table 1",
                "file_name": "Table 1",
                "caption": "Baseline cohort characteristics.",
                "classification": "TABLE",
                "page_start": None,
                "page_end": None,
            },
        ],
        content=b"%PDF-1.7 asset anchor test",
    )

    assert [asset["page_start"] for asset in aligned_assets] == [1, 2]
    assert [asset["page_end"] for asset in aligned_assets] == [1, 2]


def test_render_pymupdf_table_html_strips_title_row_and_moves_notes() -> None:
    class _FakeTable:
        def extract(self) -> list[list[str | None]]:
            return [
                ["Table 1 Baseline cohort characteristics", None, None],
                ["Variable", "CMR", "P value"],
                ["Age", "62", "0.10"],
                ["a Values are median (IQR).", None, None],
            ]

    html_text = publication_console_service._render_pymupdf_table_html(_FakeTable())

    assert "Table 1 Baseline cohort characteristics" not in html_text
    assert "<thead>" in html_text
    assert "Variable" in html_text
    assert "publication-structured-table-notes" in html_text
    assert "Values are median (IQR)." in html_text


def test_match_docling_tables_to_assets_preserves_existing_structured_html() -> None:
    assets = publication_console_service._match_docling_tables_to_assets(
        docling_tables=[
            {
                "html": "<table><tbody><tr><td>Docling</td></tr></tbody></table>",
                "page": 4,
                "coords": "4,0,0,100,100",
            }
        ],
        table_assets=[
            {
                "id": "parsed-table-1",
                "page_start": 4,
                "coords": "4,0,0,100,100",
                "structured_html": "<table><tbody><tr><td>Native</td></tr></tbody></table>",
            }
        ],
    )

    assert assets[0]["structured_html"] == "<table><tbody><tr><td>Native</td></tr></tbody></table>"


def test_extract_structured_publication_assets_from_pmc_archive_content_returns_native_assets() -> None:
    archive_buffer = BytesIO()
    with tarfile.open(fileobj=archive_buffer, mode="w:gz") as archive:
        article_xml = """<?xml version="1.0" encoding="UTF-8"?>
        <article xmlns:xlink="http://www.w3.org/1999/xlink">
          <body>
            <fig id="f1">
              <label>Figure 4</label>
              <caption>
                <title>Diagnostic pathway</title>
                <p>Figure 4 Diagnostic pathway and case summary.</p>
              </caption>
              <graphic xlink:href="fig4.png" />
            </fig>
            <table-wrap id="t1">
              <label>Table 2</label>
              <caption>
                <title>Haemodynamic measures</title>
                <p>Table 2 Haemodynamic measures at baseline.</p>
              </caption>
              <table>
                <thead>
                  <tr><th>Metric</th><th>Value</th></tr>
                </thead>
                <tbody>
                  <tr><td>LVFP</td><td>17 mmHg</td></tr>
                </tbody>
              </table>
              <table-wrap-foot>
                <p>a Values are median (IQR).</p>
              </table-wrap-foot>
            </table-wrap>
          </body>
        </article>
        """.encode("utf-8")
        xml_info = tarfile.TarInfo("PMC0000001/article.nxml")
        xml_info.size = len(article_xml)
        archive.addfile(xml_info, BytesIO(article_xml))

        image_bytes = b"\x89PNG\r\n\x1a\n" + (b"x" * 64)
        image_info = tarfile.TarInfo("PMC0000001/fig4.png")
        image_info.size = len(image_bytes)
        archive.addfile(image_info, BytesIO(image_bytes))

    figures, tables = (
        publication_console_service._extract_structured_publication_assets_from_pmc_archive_content(
            archive_buffer.getvalue()
        )
    )

    assert len(figures) == 1
    assert figures[0]["title"] == "Figure 4"
    assert figures[0]["source_parser"] == "pmc_jats"
    assert str(figures[0]["image_data"]).startswith("data:image/png;base64,")

    assert len(tables) == 1
    assert tables[0]["title"] == "Table 2"
    assert "LVFP" in str(tables[0]["structured_html"] or "")
    assert "publication-structured-table-notes" in str(
        tables[0]["structured_html"] or ""
    )


def test_publication_paper_payload_needs_asset_enrichment_when_assets_are_caption_only() -> None:
    payload = {
        "document": {
            "has_viewable_pdf": True,
            "parser_status": publication_console_service.STRUCTURED_PAPER_STATUS_FULL_TEXT_READY,
        },
        "provenance": {
            "parser_provider": publication_console_service.STRUCTURED_PAPER_PARSER_PROVIDER_PMC_BIOC,
        },
        "component_summary": {
            "figure_asset_count": 1,
            "table_asset_count": 1,
        },
        "figures": [
            {
                "classification": "FIGURE",
                "title": "Figure 1",
                "caption": "Figure 1 Caption only",
                "image_data": None,
            }
        ],
        "tables": [
            {
                "classification": "TABLE",
                "title": "Table 1",
                "caption": "Table 1 Caption only",
                "structured_html": None,
            }
        ],
    }

    assert (
        publication_console_service._publication_paper_payload_needs_asset_enrichment(
            payload
        )
        is True
    )


def test_publication_paper_payload_needs_asset_enrichment_runs_initial_asset_pass_without_counts() -> None:
    payload = {
        "document": {
            "has_viewable_pdf": True,
            "parser_status": publication_console_service.STRUCTURED_PAPER_STATUS_FULL_TEXT_READY,
        },
        "provenance": {
            "parser_provider": publication_console_service.STRUCTURED_PAPER_PARSER_PROVIDER_PMC_BIOC,
        },
        "component_summary": {
            "figure_asset_count": 0,
            "table_asset_count": 0,
        },
        "figures": [],
        "tables": [],
    }

    assert (
        publication_console_service._publication_paper_payload_needs_asset_enrichment(
            payload
        )
        is True
    )


def test_publication_paper_payload_needs_asset_enrichment_when_figures_are_low_quality() -> None:
    weak_gif = (
        b"GIF89a"
        + (172).to_bytes(2, "little")
        + (80).to_bytes(2, "little")
        + (b"x" * 6000)
    )
    payload = {
        "document": {
            "has_viewable_pdf": True,
            "parser_status": publication_console_service.STRUCTURED_PAPER_STATUS_FULL_TEXT_READY,
        },
        "provenance": {
            "parser_provider": publication_console_service.STRUCTURED_PAPER_PARSER_PROVIDER_PMC_BIOC,
        },
        "component_summary": {
            "figure_asset_count": 1,
            "table_asset_count": 1,
        },
        "figures": [
            {
                "classification": "FIGURE",
                "title": "Figure 1",
                "image_data": "data:image/gif;base64,"
                + base64.b64encode(weak_gif).decode("ascii"),
            }
        ],
        "tables": [
            {
                "classification": "TABLE",
                "title": "Table 1",
                "structured_html": "<table><tr><td>ok</td></tr></table>",
            }
        ],
    }

    assert (
        publication_console_service._publication_paper_payload_needs_asset_enrichment(
            payload
        )
        is True
    )


def test_publication_paper_payload_needs_asset_enrichment_when_some_expected_assets_are_missing() -> None:
    strong_png = (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\rIHDR"
        + (1600).to_bytes(4, "big")
        + (900).to_bytes(4, "big")
        + b"\x08\x02\x00\x00\x00"
        + (b"z" * 40000)
    )
    payload = {
        "document": {
            "has_viewable_pdf": True,
            "parser_status": publication_console_service.STRUCTURED_PAPER_STATUS_FULL_TEXT_READY,
        },
        "provenance": {
            "parser_provider": publication_console_service.STRUCTURED_PAPER_PARSER_PROVIDER_PMC_BIOC,
        },
        "component_summary": {
            "figure_asset_count": 2,
            "table_asset_count": 1,
        },
        "figures": [
            {
                "classification": "FIGURE",
                "title": "Figure 1",
                "image_data": "data:image/png;base64,"
                + base64.b64encode(strong_png).decode("ascii"),
            },
            {
                "classification": "FIGURE",
                "title": "Figure 2",
                "caption": "Figure 2 Caption only",
                "image_data": None,
            },
        ],
        "tables": [
            {
                "classification": "TABLE",
                "title": "Table 1",
                "structured_html": "<table><tr><td>ok</td><td>still ok</td></tr></table>",
            }
        ],
    }

    assert (
        publication_console_service._publication_paper_payload_needs_asset_enrichment(
            payload
        )
        is True
    )


def test_publication_paper_payload_needs_asset_enrichment_when_tables_are_low_quality() -> None:
    strong_png = (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\rIHDR"
        + (1600).to_bytes(4, "big")
        + (900).to_bytes(4, "big")
        + b"\x08\x02\x00\x00\x00"
        + (b"q" * 40000)
    )
    payload = {
        "document": {
            "has_viewable_pdf": True,
            "parser_status": publication_console_service.STRUCTURED_PAPER_STATUS_FULL_TEXT_READY,
        },
        "provenance": {
            "parser_provider": publication_console_service.STRUCTURED_PAPER_PARSER_PROVIDER_GROBID,
        },
        "component_summary": {
            "figure_asset_count": 1,
            "table_asset_count": 1,
        },
        "figures": [
            {
                "classification": "FIGURE",
                "title": "Figure 1",
                "image_data": "data:image/png;base64,"
                + base64.b64encode(strong_png).decode("ascii"),
            }
        ],
        "tables": [
            {
                "classification": "TABLE",
                "title": "Table 1",
                "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_GROBID,
                "structured_html": "<table><tr><td>Open Hear t</td><td>Table 1. Cont.</td></tr></table>",
            }
        ],
    }

    assert (
        publication_console_service._publication_paper_payload_needs_asset_enrichment(
            payload
        )
        is True
    )


def test_extract_publication_paper_references_from_pmc_archive_content_formats_citations() -> None:
    xml = """
    <article>
      <back>
        <ref-list>
          <ref id="R1">
            <label>1</label>
            <element-citation publication-type="journal">
              <person-group person-group-type="author">
                <name><surname>Grafton-Clarke</surname><given-names>C</given-names></name>
                <name><surname>Assadi</surname><given-names>H</given-names></name>
              </person-group>
              <article-title>Clinical assessment of aortic valve stenosis</article-title>
              <source>Journal of Magnetic Resonance Imaging</source>
              <year>2020</year>
              <volume>51</volume>
              <fpage>472</fpage>
              <lpage>480</lpage>
              <pub-id pub-id-type="doi">10.1002/jmri.26847</pub-id>
              <pub-id pub-id-type="pmid">31999000</pub-id>
              <pub-id pub-id-type="pmcid">PMC7654321</pub-id>
            </element-citation>
          </ref>
        </ref-list>
      </back>
    </article>
    """.strip()
    buffer = BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        payload = xml.encode("utf-8")
        info = tarfile.TarInfo(name="PMC1234567/article.nxml")
        info.size = len(payload)
        archive.addfile(info, BytesIO(payload))
    references = publication_console_service._extract_publication_paper_references_from_pmc_archive_content(
        buffer.getvalue()
    )
    assert len(references) == 1
    assert references[0]["label"] == "1"
    assert "Grafton-Clarke C, Assadi H." in references[0]["raw_text"]
    assert "Clinical assessment of aortic valve stenosis." in references[0]["raw_text"]
    assert "Journal of Magnetic Resonance Imaging. 2020;51:472-480." in references[0]["raw_text"]
    assert "doi: 10.1002/jmri.26847." in references[0]["raw_text"]
    assert references[0]["title"] == "Clinical assessment of aortic valve stenosis"
    assert references[0]["authors"] == ["Grafton-Clarke C", "Assadi H"]
    assert references[0]["journal"] == "Journal of Magnetic Resonance Imaging"
    assert references[0]["year"] == "2020"
    assert references[0]["volume"] == "51"
    assert references[0]["pages"] == "472-480"
    assert references[0]["doi"] == "10.1002/jmri.26847"
    assert references[0]["pmid"] == "31999000"
    assert references[0]["pmcid"] == "PMC7654321"


def test_extract_structured_publication_assets_from_pmc_archive_ignores_non_image_supplementary_fig() -> None:
    xml = """
    <article xmlns:xlink="http://www.w3.org/1999/xlink">
      <body>
        <fig id="f1">
          <label>Figure 1</label>
          <caption><title>Valid figure</title></caption>
          <graphic xlink:href="figure-1.png" />
        </fig>
        <fig id="f2">
          <supplementary-material xlink:href="reviewer_comments.pdf" />
        </fig>
      </body>
    </article>
    """.strip()
    png_bytes = (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\rIHDR"
        + (32).to_bytes(4, "big")
        + (32).to_bytes(4, "big")
        + b"\x08\x02\x00\x00\x00"
        + (b"x" * 1024)
    )
    pdf_bytes = b"%PDF-1.7 reviewer comments"
    buffer = BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        xml_payload = xml.encode("utf-8")
        xml_info = tarfile.TarInfo(name="PMC7654321/article.nxml")
        xml_info.size = len(xml_payload)
        archive.addfile(xml_info, BytesIO(xml_payload))

        png_info = tarfile.TarInfo(name="PMC7654321/figure-1.png")
        png_info.size = len(png_bytes)
        archive.addfile(png_info, BytesIO(png_bytes))

        pdf_info = tarfile.TarInfo(name="PMC7654321/reviewer_comments.pdf")
        pdf_info.size = len(pdf_bytes)
        archive.addfile(pdf_info, BytesIO(pdf_bytes))

    figures, tables = publication_console_service._extract_structured_publication_assets_from_pmc_archive_content(
        buffer.getvalue()
    )
    assert len(tables) == 0
    assert len(figures) == 1
    assert figures[0]["title"] == "Figure 1"
    assert str(figures[0].get("image_data") or "").startswith("data:image/png;base64,")


def test_extract_structured_publication_paper_with_pmc_bioc_prefers_archive_assets(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        publication_console_service,
        "_request_pmc_bioc_payload",
        lambda _pmcid: {
            "documents": [
                {
                    "passages": [
                        {
                            "infons": {"type": "title_1", "section_type": "INTRO"},
                            "text": "Introduction",
                        },
                        {
                            "infons": {"type": "paragraph", "section_type": "INTRO"},
                            "text": "Full-text introduction paragraph.",
                        },
                        {
                            "infons": {"type": "fig_caption", "section_type": "FIG"},
                            "text": "Figure 1 Caption only.",
                        },
                        {
                            "infons": {"type": "table_caption", "section_type": "TABLE"},
                            "text": "Table 1 Caption only.",
                        },
                    ]
                }
            ]
        },
    )
    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_assets_from_pmc_archive",
        lambda _pmcid: (
            [
                {
                    "id": "pmc-jats-figure-1",
                    "classification": "FIGURE",
                    "title": "Figure 1",
                    "caption": "Figure 1 caption",
                    "source": "parsed",
                    "source_parser": "pmc_jats",
                    "image_data": "data:image/png;base64,abc",
                }
            ],
            [
                {
                    "id": "pmc-jats-table-1",
                    "classification": "TABLE",
                    "title": "Table 1",
                    "caption": "Table 1 caption",
                    "source": "parsed",
                    "source_parser": "pmc_jats",
                    "structured_html": "<table><tbody><tr><td>Native</td></tr></tbody></table>",
                }
            ],
        ),
    )
    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_assets_with_grobid",
        lambda **_kwargs: ([], []),
    )

    payload = publication_console_service._extract_structured_publication_paper_with_pmc_bioc(
        pmcid="PMC1234567",
        content=b"%PDF-1.7 test",
        title="PMC BioC paper",
        enrich_assets=True,
        align_to_pdf=False,
    )

    assert publication_console_service._publication_paper_asset_surface_count(
        payload.get("figures"),
        classification="FIGURE",
    ) == 1
    assert publication_console_service._publication_paper_asset_surface_count(
        payload.get("tables"),
        classification="TABLE",
    ) == 1


def test_extract_structured_publication_paper_with_pmc_bioc_overlays_grobid_inline_citations(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        publication_console_service,
        "_request_pmc_bioc_payload",
        lambda _pmcid: {
            "documents": [
                {
                    "passages": [
                        {
                            "infons": {"type": "title_1", "section_type": "INTRO"},
                            "text": "Introduction",
                        },
                        {
                            "infons": {"type": "paragraph", "section_type": "INTRO"},
                            "text": (
                                "Prior work informs current practice. "
                                "Further evidence is needed for complex imaging pathways."
                            ),
                        },
                    ]
                }
            ]
        },
    )
    monkeypatch.setattr(
        publication_console_service,
        "_request_pmc_archive_bytes",
        lambda _pmcid: b"archive",
    )
    monkeypatch.setattr(
        publication_console_service,
        "_extract_publication_paper_references_from_pmc_archive_content",
        lambda _archive_content: [
            {
                "id": "paper-reference-1",
                "label": "1",
                "raw_text": "Reference one.",
            },
            {
                "id": "paper-reference-2",
                "label": "2",
                "raw_text": "Reference two.",
                "authors_truncated": True,
                "doi": "10.1000/pmc-two",
            },
        ],
    )
    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_paper_with_grobid",
        lambda **_kwargs: {
            "sections": [
                {
                    "id": "paper-section-introduction",
                    "title": "Introduction",
                    "raw_label": "Introduction",
                    "label_original": "Introduction",
                    "label_normalized": "Introduction",
                    "kind": "introduction",
                    "canonical_kind": "introduction",
                    "section_type": "canonical",
                    "canonical_map": "introduction",
                    "content": (
                        "Prior work {{cite:b1}} informs current practice. "
                        "Further evidence {{cite:b2}} is needed for complex imaging pathways."
                    ),
                    "source": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_GROBID,
                    "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_GROBID,
                    "order": 0,
                    "page_start": None,
                    "page_end": None,
                    "level": 1,
                    "parent_id": None,
                    "bounding_boxes": [],
                    "confidence": None,
                    "is_generated_heading": False,
                    "word_count": 14,
                    "paragraph_count": 1,
                    "document_zone": "body",
                    "section_role": "major",
                    "journal_section_family": None,
                    "major_section_key": "introduction",
                }
            ],
            "figures": [],
            "tables": [],
            "references": [
                {
                    "id": "paper-reference-1",
                    "label": "1",
                    "raw_text": "Reference one.",
                    "xml_id": "b1",
                    "title": "Reference One Title",
                    "authors": ["Alpha A", "Beta B"],
                    "journal": "Structured Journal",
                    "year": "2023",
                    "doi": "10.1000/one",
                    "pmid": "12345678",
                },
                {
                    "id": "paper-reference-2",
                    "label": "2",
                    "raw_text": "Reference two.",
                    "xml_id": "b2",
                    "title": "Reference Two Title",
                    "authors": ["Gamma C"],
                    "journal": "Overlay Journal",
                    "year": "2024",
                    "pmid": "87654321",
                },
            ],
            "reference_id_map": {
                "b1": "paper-reference-1",
                "b2": "paper-reference-2",
            },
            "page_count": None,
            "generation_method": "grobid_tei_fulltext_v3",
            "parser_provider": publication_console_service.STRUCTURED_PAPER_PARSER_PROVIDER_GROBID,
        },
    )
    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_assets_with_grobid",
        lambda **_kwargs: ([], []),
    )

    payload = publication_console_service._extract_structured_publication_paper_with_pmc_bioc(
        pmcid="PMC1234567",
        content=b"%PDF-1.7 test",
        title="PMC citation overlay paper",
        enrich_assets=False,
        align_to_pdf=False,
    )

    intro = next(
        section for section in payload["sections"] if section["title"] == "Introduction"
    )
    assert "{{cite:b1}}" in intro["content"]
    assert "{{cite:b2}}" in intro["content"]
    assert payload["reference_id_map"] == {
        "b1": "paper-reference-1",
        "b2": "paper-reference-2",
    }
    assert payload["references"][0]["xml_id"] == "b1"
    assert payload["references"][0]["title"] == "Reference One Title"
    assert payload["references"][0]["authors"] == ["Alpha A", "Beta B"]
    assert payload["references"][0]["journal"] == "Structured Journal"
    assert payload["references"][0]["year"] == "2023"
    assert payload["references"][0]["doi"] == "10.1000/one"
    assert payload["references"][0]["pmid"] == "12345678"
    assert payload["references"][1]["xml_id"] == "b2"
    assert payload["references"][1]["title"] == "Reference Two Title"
    assert payload["references"][1]["authors"] == ["Gamma C"]
    assert payload["references"][1]["authors_truncated"] is True
    assert payload["references"][1]["journal"] == "Overlay Journal"
    assert payload["references"][1]["year"] == "2024"
    assert payload["references"][1]["doi"] == "10.1000/pmc-two"
    assert payload["references"][1]["pmid"] == "87654321"
    assert payload["generation_method"] == "pmc_bioc_fulltext_v1+grobid_citation_overlay_v1"


def test_format_pmc_archive_reference_preserves_explicit_etal_marker() -> None:
    ref_node = ET.fromstring(
        """
        <ref>
          <label>14</label>
          <element-citation publication-type="journal">
            <person-group person-group-type="author">
              <name><surname>Roifman</surname><given-names>I</given-names></name>
              <name><surname>Hammer</surname><given-names>M</given-names></name>
              <name><surname>Sparkes</surname><given-names>J</given-names></name>
              <etal>et al</etal>
            </person-group>
            <article-title>Cardiac magnetic resonance left ventricular filling pressure is linked to symptoms, signs and prognosis in heart failure</article-title>
            <source>ESC Heart Fail</source>
            <year>2023</year>
            <volume>10</volume>
            <fpage>3067</fpage>
            <lpage>3076</lpage>
            <pub-id pub-id-type="doi">10.1002/ehf2.14499</pub-id>
          </element-citation>
        </ref>
        """
    )

    reference = publication_console_service._format_pmc_archive_reference(ref_node, 14)

    assert reference is not None
    assert reference["authors"] == ["Roifman I", "Hammer M", "Sparkes J"]
    assert reference["authors_truncated"] is True
    assert reference["raw_text"].startswith("Roifman I, Hammer M, Sparkes J, et al.")


def test_merge_publication_paper_reference_metadata_preserves_author_truncation_flag() -> None:
    merged = publication_console_service._merge_publication_paper_reference_metadata(
        citation_references=[
            {
                "xml_id": "b14",
                "authors": ["Roifman I", "Hammer M", "Sparkes J"],
                "authors_truncated": True,
            }
        ],
        final_references=[
            {
                "id": "paper-reference-14",
                "label": "14",
                "raw_text": "Reference fourteen.",
                "xml_id": "b14",
                "authors": ["Roifman I", "Hammer M", "Sparkes J"],
            }
        ],
        reference_id_map={"b14": "paper-reference-14"},
    )

    assert merged[0]["authors_truncated"] is True


def test_extract_structured_publication_paper_with_best_available_parser_prefers_pmc_bioc(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        publication_console_service,
        "_resolve_pmcid",
        lambda **_kwargs: "PMC1234567",
    )
    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_paper_with_pmc_bioc",
        lambda **_kwargs: {
            "sections": [{"id": "s1", "title": "Introduction", "content": "Body"}],
            "figures": [],
            "tables": [],
            "references": [],
            "pmcid": "PMC1234567",
            "generation_method": "pmc_bioc_fulltext_v1",
            "parser_provider": publication_console_service.STRUCTURED_PAPER_PARSER_PROVIDER_PMC_BIOC,
        },
    )
    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_paper_with_grobid",
        lambda **_kwargs: {
            "sections": [{"id": "g1", "title": "Introduction", "content": "GROBID Body"}],
            "figures": [],
            "tables": [],
            "references": [],
            "generation_method": "grobid_tei_fulltext_v3",
            "parser_provider": publication_console_service.STRUCTURED_PAPER_PARSER_PROVIDER_GROBID,
        },
    )

    payload = publication_console_service._extract_structured_publication_paper_with_best_available_parser(
        content=b"%PDF-1.7 test",
        title="PMC preferred paper",
        file_name="paper.pdf",
        pmid="12345",
        doi="10.1000/example",
        year=2026,
    )

    assert payload["pmcid"] == "PMC1234567"
    assert payload["generation_method"] == "pmc_bioc_fulltext_v1"
    assert payload["parser_provider"] == publication_console_service.STRUCTURED_PAPER_PARSER_PROVIDER_PMC_BIOC


def test_extract_structured_publication_paper_with_best_available_parser_falls_back_to_grobid_overlay_when_pmc_bioc_unavailable(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        publication_console_service,
        "_resolve_pmcid",
        lambda **_kwargs: "PMC1234567",
    )

    def _raise_pmc_bioc(**_kwargs):  # noqa: ANN001
        raise publication_console_service.PublicationConsoleValidationError("pmc bioc down")

    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_paper_with_pmc_bioc",
        _raise_pmc_bioc,
    )
    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_paper_with_grobid",
        lambda **_kwargs: {
            "sections": [{"id": "s1", "title": "Introduction", "content": "Body"}],
            "figures": [],
            "tables": [],
            "references": [],
            "generation_method": "grobid_tei_fulltext_v3",
            "parser_provider": publication_console_service.STRUCTURED_PAPER_PARSER_PROVIDER_GROBID,
        },
    )
    monkeypatch.setattr(
        publication_console_service,
        "_overlay_pmc_archive_content_onto_structured_paper",
        lambda *, parsed_payload, pmcid: {
            **parsed_payload,
            "pmcid": pmcid,
            "figures": [
                {
                    "classification": "FIGURE",
                    "title": "Figure 1",
                    "image_data": "data:image/png;base64,abc",
                    "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_JATS,
                }
            ],
            "generation_method": "grobid_tei_fulltext_v3+pmc_native_assets_v1",
        },
    )

    payload = publication_console_service._extract_structured_publication_paper_with_best_available_parser(
        content=b"%PDF-1.7 test",
        title="PMC fallback paper",
        file_name="paper.pdf",
        pmid="12345",
        doi="10.1000/example",
        year=2026,
    )

    assert payload["pmcid"] == "PMC1234567"
    assert payload["generation_method"] == "grobid_tei_fulltext_v3+pmc_native_assets_v1"
    assert payload["figures"][0]["source_parser"] == publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_JATS


def test_publication_paper_model_auto_links_oa_pdf_for_reader(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    def _immediate_submit(*, kind: str, user_id: str, publication_id: str, fn):  # noqa: ANN001
        fn(user_id=user_id, publication_id=publication_id)
        return True

    monkeypatch.setattr(
        publication_console_service, "_submit_background_job", _immediate_submit
    )
    monkeypatch.setattr(
        publication_console_service,
        "_fetch_open_access_pdf_bytes",
        lambda *args, **kwargs: (b"%PDF-1.7 locally cached oa payload", "application/pdf"),
    )
    monkeypatch.setattr(
        publication_console_service,
        "_find_unpaywall_pdf_url",
        lambda **kwargs: "https://example.org/paper.pdf",
    )
    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_paper_with_grobid",
        lambda **kwargs: {  # noqa: ANN003
            "sections": [
                {
                    "id": "paper-section-1-introduction",
                    "title": "Introduction",
                    "raw_label": "Introduction",
                    "label_original": "Introduction",
                    "label_normalized": "Introduction",
                    "kind": "introduction",
                    "canonical_kind": "introduction",
                    "section_type": "canonical",
                    "canonical_map": "introduction",
                    "content": "This paper introduces the reader scaffold.",
                    "source": "grobid",
                    "source_parser": "grobid",
                    "order": 0,
                    "page_start": 1,
                    "page_end": 2,
                    "level": 1,
                    "parent_id": None,
                    "bounding_boxes": [],
                    "confidence": 0.97,
                    "is_generated_heading": False,
                    "word_count": 7,
                    "paragraph_count": 1,
                }
            ],
            "references": [],
            "page_count": 12,
            "generation_method": "test_grobid_parser",
            "parser_provider": "GROBID",
        },
    )

    with TestClient(app) as client:
        owner_id, token = _register(client, email="reader-autolink@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="Structured reader auto-link paper",
                title_lower="structured reader auto-link paper",
                year=2026,
                doi="10.1000/structured-reader-auto-link-paper",
                work_type="journal-article",
                publication_type="original-article",
                venue_name="Reader Journal",
                publisher="Reader Publisher",
                abstract="Objectives: Evaluate scaffolded readers.",
                keywords=["reader"],
                authors_json=[{"name": "Alice Example"}],
                url="https://pubmed.ncbi.nlm.nih.gov/12345678/",
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

        first_response = client.get(
            f"/v1/publications/{work_id}/paper-model",
            headers=_auth_headers(token),
        )
        assert first_response.status_code == 200
        first_payload = first_response.json()
        assert first_payload["status"] == "RUNNING"
        assert first_payload["payload"]["document"]["has_viewable_pdf"] is True
        assert first_payload["payload"]["document"]["parser_status"] == "PARSING"

        second_payload = None
        for _ in range(10):
            second_response = client.get(
                f"/v1/publications/{work_id}/paper-model",
                headers=_auth_headers(token),
            )
            assert second_response.status_code == 200
            second_payload = second_response.json()
            if second_payload["status"] == "READY":
                break
            time.sleep(0.05)

        assert second_payload is not None
        assert second_payload["status"] == "READY"
        assert second_payload["payload"]["document"]["parser_status"] == "FULL_TEXT_READY"
        assert second_payload["payload"]["document"]["has_viewable_pdf"] is True
        assert len(second_payload["payload"]["sections"]) == 1
        assert second_payload["payload"]["sections"][0]["source"] == "grobid"

        with session_scope() as session:
            file_row = session.scalars(
                select(PublicationFile).where(
                    PublicationFile.owner_user_id == owner_id,
                    PublicationFile.publication_id == work_id,
                    PublicationFile.deleted.is_(False),
                )
            ).first()
            assert file_row is not None
            assert str(file_row.source or "").upper() == "OA_LINK"


def test_publication_paper_model_auto_links_oa_pdf_when_only_non_pdf_files_exist(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    def _immediate_submit(*, kind: str, user_id: str, publication_id: str, fn):  # noqa: ANN001
        fn(user_id=user_id, publication_id=publication_id)
        return True

    monkeypatch.setattr(
        publication_console_service, "_submit_background_job", _immediate_submit
    )
    monkeypatch.setattr(
        publication_console_service,
        "_find_unpaywall_pdf_url",
        lambda **kwargs: "https://example.org/non-pdf-reader-paper.pdf",
    )
    monkeypatch.setattr(
        publication_console_service,
        "_fetch_open_access_pdf_bytes",
        lambda *args, **kwargs: (b"%PDF-1.7 auto-linked reader bytes", "application/pdf"),
    )
    monkeypatch.setattr(
        publication_console_service,
        "_extract_structured_publication_paper_with_grobid",
        lambda **kwargs: {  # noqa: ANN003
            "sections": [
                {
                    "id": "paper-section-1-methods",
                    "title": "Methods",
                    "raw_label": "Methods",
                    "label_original": "Methods",
                    "label_normalized": "Methods",
                    "kind": "methods",
                    "canonical_kind": "methods",
                    "section_type": "canonical",
                    "canonical_map": "methods",
                    "content": "Methods text from the linked PDF.",
                    "source": "grobid",
                    "source_parser": "grobid",
                    "order": 0,
                    "page_start": 1,
                    "page_end": 1,
                    "level": 1,
                    "parent_id": None,
                    "bounding_boxes": [],
                    "confidence": 0.96,
                    "is_generated_heading": False,
                    "word_count": 6,
                    "paragraph_count": 1,
                }
            ],
            "references": [],
            "page_count": 9,
            "generation_method": "test_grobid_parser",
            "parser_provider": "GROBID",
        },
    )

    with TestClient(app) as client:
        owner_id, token = _register(client, email="reader-non-pdf@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="Reader auto-link with attachment",
                title_lower="reader auto-link with attachment",
                year=2026,
                doi="10.1000/reader-auto-link-with-attachment",
                work_type="journal-article",
                publication_type="original-article",
                venue_name="Reader Journal",
                publisher="Reader Publisher",
                abstract="Objectives: Evaluate scaffolded readers.",
                keywords=["reader"],
                authors_json=[{"name": "Alice Example"}],
                url="https://pubmed.ncbi.nlm.nih.gov/12345678/",
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

            attachment_path = tmp_path / "reader-notes.docx"
            attachment_path.write_bytes(b"reader-notes")
            attachment = PublicationFile(
                owner_user_id=owner_id,
                publication_id=work_id,
                file_name="Reader notes.docx",
                file_type="DOCX",
                storage_key=str(attachment_path),
                source="USER_UPLOAD",
                checksum="reader-notes-checksum",
                custom_name=True,
                classification="SUPPLEMENTARY_MATERIALS",
                classification_custom=True,
            )
            session.add(attachment)
            session.flush()

        first_response = client.get(
            f"/v1/publications/{work_id}/paper-model",
            headers=_auth_headers(token),
        )
        assert first_response.status_code == 200
        first_payload = first_response.json()
        assert first_payload["status"] == "RUNNING"
        assert first_payload["payload"]["document"]["has_viewable_pdf"] is True
        assert first_payload["payload"]["document"]["parser_status"] == "PARSING"

        second_payload = None
        for _ in range(10):
            second_response = client.get(
                f"/v1/publications/{work_id}/paper-model",
                headers=_auth_headers(token),
            )
            assert second_response.status_code == 200
            second_payload = second_response.json()
            if second_payload["status"] == "READY":
                break
            time.sleep(0.05)

        assert second_payload is not None
        assert second_payload["status"] == "READY"
        assert second_payload["payload"]["document"]["parser_status"] == "FULL_TEXT_READY"
        assert second_payload["payload"]["document"]["has_viewable_pdf"] is True

        with session_scope() as session:
            files = session.scalars(
                select(PublicationFile).where(
                    PublicationFile.owner_user_id == owner_id,
                    PublicationFile.publication_id == work_id,
                    PublicationFile.deleted.is_(False),
                )
            ).all()
            assert len(files) == 2
            assert any(str(row.source or "").upper() == "OA_LINK" for row in files)
            assert any(str(row.file_type or "").upper() == "DOCX" for row in files)


def test_link_publication_open_access_pdf_reuses_existing_local_copy(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    monkeypatch.setattr(
        publication_console_service,
        "_find_unpaywall_pdf_url",
        lambda **kwargs: "https://example.org/paper.pdf",
    )
    monkeypatch.setattr(
        publication_console_service,
        "_fetch_open_access_pdf_bytes",
        lambda *args, **kwargs: (b"", None),
    )

    with session_scope() as session:
        donor_user = User(
            email="donor-reader@example.com",
            password_hash="test-hash",
            name="Donor Reader",
        )
        recipient_user = User(
            email="recipient-reader@example.com",
            password_hash="test-hash",
            name="Recipient Reader",
        )
        session.add_all([donor_user, recipient_user])
        session.flush()
        donor_user_id = str(donor_user.id)
        recipient_user_id = str(recipient_user.id)

        donor_work = Work(
            user_id=donor_user_id,
            title="Shared OA paper",
            title_lower="shared oa paper",
            year=2026,
            doi="10.1000/shared-oa-paper",
            work_type="journal-article",
            publication_type="original-article",
            venue_name="Reader Journal",
            publisher="Reader Publisher",
            abstract="Objectives: Evaluate scaffolded readers.",
            keywords=["reader"],
            url="https://pubmed.ncbi.nlm.nih.gov/12345678/",
            provenance="manual",
        )
        recipient_work = Work(
            user_id=recipient_user_id,
            title="Shared OA paper",
            title_lower="shared oa paper",
            year=2026,
            doi="10.1000/shared-oa-paper",
            work_type="journal-article",
            publication_type="original-article",
            venue_name="Reader Journal",
            publisher="Reader Publisher",
            abstract="Objectives: Evaluate scaffolded readers.",
            keywords=["reader"],
            url="https://pubmed.ncbi.nlm.nih.gov/12345678/",
            provenance="manual",
        )
        session.add_all([donor_work, recipient_work])
        session.flush()
        donor_work_id = str(donor_work.id)
        recipient_work_id = str(recipient_work.id)

        donor_path = tmp_path / "donor-paper.pdf"
        donor_bytes = b"%PDF-1.7 donor stored copy"
        donor_path.write_bytes(donor_bytes)
        donor_file = PublicationFile(
            owner_user_id=donor_user_id,
            publication_id=donor_work_id,
            file_name="Donor (2026).pdf",
            file_type="PDF",
            storage_key=str(donor_path),
            source="OA_LINK",
            oa_url="https://example.org/paper.pdf",
            checksum="donor-checksum",
            custom_name=True,
            classification="PUBLISHED_MANUSCRIPT",
            classification_custom=True,
        )
        session.add(donor_file)
        session.flush()

    payload = publication_console_service.link_publication_open_access_pdf(
        user_id=recipient_user_id,
        publication_id=recipient_work_id,
    )
    assert payload["created"] is True
    linked_file = payload["file"]
    assert linked_file is not None
    assert linked_file["source"] == "OA_LINK"
    assert linked_file["is_stored_locally"] is True

    with session_scope() as session:
        row = session.scalars(
            select(PublicationFile).where(
                PublicationFile.owner_user_id == recipient_user_id,
                PublicationFile.publication_id == recipient_work_id,
                PublicationFile.deleted.is_(False),
            )
        ).first()
        assert row is not None
        stored_path = Path(str(row.storage_key))
        assert stored_path.exists()
        assert stored_path.read_bytes() == donor_bytes


def test_authors_hydration_enqueues_and_persists(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id, work_id = _seed_user_and_work(
        email="authors@example.com", title="Hydration Work"
    )

    monkeypatch.setattr(
        publication_console_service,
        "_hydrate_authors_data",
        lambda **kwargs: {
            "status": "READY",
            "authors_json": [
                {
                    "name": "Alice Example",
                    "orcid_id": "0000-0000-0000-0001",
                    "affiliations": ["AAWE"],
                },
                {"name": "Bob Example", "orcid_id": None, "affiliations": ["AAWE"]},
            ],
            "affiliations_json": [{"name": "AAWE"}],
            "source": "PUBMED",
            "openalex_work_id": "W123",
        },
    )

    def _immediate_submit(*, kind: str, user_id: str, publication_id: str, fn):  # noqa: ANN001
        fn(user_id=user_id, publication_id=publication_id)
        return True

    monkeypatch.setattr(
        publication_console_service, "_submit_background_job", _immediate_submit
    )

    first = publication_console_service.get_publication_authors(
        user_id=user_id,
        publication_id=work_id,
    )
    assert first["status"] == "RUNNING"

    second = publication_console_service.get_publication_authors(
        user_id=user_id,
        publication_id=work_id,
    )
    assert second["status"] == "READY"
    assert len(second["authors_json"]) == 2
    assert second["authors_json"][0]["name"] == "Alice Example"


def test_authors_hydration_fallback_order(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id, work_id = _seed_user_and_work(
        email="fallback@example.com", title="Fallback Work"
    )

    with session_scope() as session:
        work = session.get(Work, work_id)
        assert work is not None
        # Case 1: PubMed misses, Crossref resolves.
        monkeypatch.setattr(
            publication_console_service,
            "_extract_authors_from_pubmed",
            lambda pmid: ([], []),
        )
        monkeypatch.setattr(
            publication_console_service,
            "_extract_authors_from_crossref",
            lambda doi: (
                [{"name": "Crossref Author", "orcid_id": None, "affiliations": []}],
                [],
            ),
        )
        result_crossref = publication_console_service._hydrate_authors_data(
            work=work,
            user_email="fallback@example.com",
        )
        assert result_crossref["status"] == "READY"
        assert result_crossref["source"] == "CROSSREF"

        # Case 2: PubMed and Crossref miss, OpenAlex resolves.
        monkeypatch.setattr(
            publication_console_service,
            "_extract_authors_from_crossref",
            lambda doi: ([], []),
        )
        monkeypatch.setattr(
            publication_console_service,
            "_extract_openalex_work_record",
            lambda **kwargs: (
                {"id": "https://openalex.org/W999", "authorships": []},
                "W999",
            ),
        )
        monkeypatch.setattr(
            publication_console_service,
            "_extract_authors_from_openalex",
            lambda work_record: (
                [{"name": "OpenAlex Author", "orcid_id": None, "affiliations": []}],
                [],
            ),
        )
        result_openalex = publication_console_service._hydrate_authors_data(
            work=work,
            user_email="fallback@example.com",
        )
        assert result_openalex["status"] == "READY"
        assert result_openalex["source"] == "OPENALEX"


def test_impact_endpoint_stale_while_revalidate_statuses(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id, work_id = _seed_user_and_work(
        email="impact@example.com", title="Impact Work"
    )

    now = datetime.now(timezone.utc)
    with session_scope() as session:
        row = PublicationImpactCache(
            owner_user_id=user_id,
            publication_id=work_id,
            payload_json={
                "citations_total": 42,
                "citations_last_12m": 8,
                "citations_prev_12m": 4,
                "yoy_pct": 100.0,
                "acceleration_citations_per_month": 0.33,
                "per_year": [],
                "portfolio_context": {},
                "top_citing_journals": [],
                "top_citing_countries": [],
                "key_citing_papers": [],
                "metadata": {},
            },
            computed_at=now - timedelta(days=2),
            status="READY",
            last_error=None,
            updated_at=now - timedelta(days=2),
        )
        session.add(row)
        session.flush()

    enqueued: list[str] = []
    monkeypatch.setattr(
        publication_console_service,
        "_enqueue_impact_if_needed",
        lambda **kwargs: enqueued.append(str(kwargs["publication_id"])) or True,
    )

    stale_response = publication_console_service.get_publication_impact(
        user_id=user_id,
        publication_id=work_id,
    )
    assert stale_response["status"] == "RUNNING"
    assert stale_response["is_stale"] is True
    assert stale_response["payload"]["citations_total"] == 42
    assert enqueued == [work_id]

    with session_scope() as session:
        row = session.scalars(
            select(PublicationImpactCache).where(
                PublicationImpactCache.owner_user_id == user_id,
                PublicationImpactCache.publication_id == work_id,
            )
        ).first()
        assert row is not None
        row.computed_at = datetime.now(timezone.utc)
        row.status = "READY"
        row.last_error = None
        session.flush()

    ready_response = publication_console_service.get_publication_impact(
        user_id=user_id,
        publication_id=work_id,
    )
    assert ready_response["status"] == "READY"
    assert ready_response["is_stale"] is False

    with session_scope() as session:
        row = session.scalars(
            select(PublicationImpactCache).where(
                PublicationImpactCache.owner_user_id == user_id,
                PublicationImpactCache.publication_id == work_id,
            )
        ).first()
        assert row is not None
        row.status = "FAILED"
        row.computed_at = datetime.now(timezone.utc)
        row.last_error = "compute failed"
        session.flush()

    failed_response = publication_console_service.get_publication_impact(
        user_id=user_id,
        publication_id=work_id,
    )
    assert failed_response["status"] == "FAILED"
    assert failed_response["last_error"] == "compute failed"


def test_ai_endpoint_stale_while_revalidate_statuses(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id, work_id = _seed_user_and_work(email="ai@example.com", title="AI Work")

    now = datetime.now(timezone.utc)
    with session_scope() as session:
        row = PublicationAiCache(
            owner_user_id=user_id,
            publication_id=work_id,
            payload_json={
                "label": "AI-generated draft insights",
                "performance_summary": "Summary",
                "trajectory_classification": "UNKNOWN",
                "extractive_key_points": {
                    "objective": "Not stated in abstract.",
                    "methods": "Not stated in abstract.",
                    "main_findings": "Not stated in abstract.",
                    "conclusion": "Not stated in abstract.",
                },
                "reuse_suggestions": [],
                "caution_flags": [],
            },
            computed_at=now - timedelta(days=2),
            status="READY",
            last_error=None,
            updated_at=now - timedelta(days=2),
        )
        session.add(row)
        session.flush()

    enqueued: list[str] = []
    monkeypatch.setattr(
        publication_console_service,
        "_enqueue_ai_if_needed",
        lambda **kwargs: enqueued.append(str(kwargs["publication_id"])) or True,
    )

    stale_response = publication_console_service.get_publication_ai_insights(
        user_id=user_id,
        publication_id=work_id,
    )
    assert stale_response["status"] == "RUNNING"
    assert stale_response["is_stale"] is True
    assert stale_response["payload"]["label"] == "AI-generated draft insights"
    assert enqueued == [work_id]

    with session_scope() as session:
        row = session.scalars(
            select(PublicationAiCache).where(
                PublicationAiCache.owner_user_id == user_id,
                PublicationAiCache.publication_id == work_id,
            )
        ).first()
        assert row is not None
        row.status = "FAILED"
        row.computed_at = datetime.now(timezone.utc)
        row.last_error = "ai failed"
        session.flush()

    failed_response = publication_console_service.get_publication_ai_insights(
        user_id=user_id,
        publication_id=work_id,
    )
    assert failed_response["status"] == "FAILED"
    assert failed_response["last_error"] == "ai failed"


def test_publication_file_upload_preserves_filename_and_download_header(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with TestClient(app) as client:
        owner_id, token = _register(client, email="file-owner@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="File upload work",
                title_lower="file upload work",
                year=2026,
                doi="10.1000/file-upload-work",
                pmid="38598659",
                work_type="journal-article",
                venue_name="Test Journal",
                publisher="Test Publisher",
                abstract="Abstract",
                keywords=[],
                url="",
                authors_json=[{"name": "Ciaran Grafton-Clarke"}],
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

        upload_filename = "My manuscript; v2.final.pdf"
        upload_response = client.post(
            f"/v1/publications/{work_id}/files/upload",
            headers=_auth_headers(token),
            json={
                "filename": upload_filename,
                "mime_type": "application/pdf",
                "content_base64": base64.b64encode(
                    b"%PDF-1.7 test payload"
                ).decode("ascii"),
            },
        )
        assert upload_response.status_code == 200
        uploaded = upload_response.json()
        assert uploaded["file_name"] == "Grafton-Clarke (2026) - PMID 38598659"
        assert uploaded["file_type"] == "PDF"
        assert uploaded["classification"] is None
        assert uploaded["classification_label"] is None
        assert uploaded["can_classify"] is True
        file_id = str(uploaded["id"])

        download_response = client.get(
            f"/v1/publications/{work_id}/files/{file_id}/download",
            headers=_auth_headers(token),
        )
        assert download_response.status_code == 200
        assert download_response.content == b"%PDF-1.7 test payload"
        disposition = str(download_response.headers.get("content-disposition") or "")
        assert (
            "filename*=UTF-8''Grafton-Clarke%20%282026%29%20-%20PMID%2038598659.pdf"
            in disposition
        )


def test_publication_file_download_restores_extension_for_legacy_filename(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with TestClient(app) as client:
        owner_id, token = _register(client, email="file-legacy@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="Legacy file upload work",
                title_lower="legacy file upload work",
                year=2024,
                doi="10.1000/legacy-file-upload-work",
                work_type="journal-article",
                venue_name="Test Journal",
                publisher="Test Publisher",
                abstract="Abstract",
                keywords=[],
                url="",
                authors_json=[{"name": "Ciaran Grafton-Clarke"}],
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

        upload_response = client.post(
            f"/v1/publications/{work_id}/files/upload",
            headers=_auth_headers(token),
            json={
                "filename": "legacy-final.pdf",
                "mime_type": "application/pdf",
                "content_base64": base64.b64encode(
                    b"%PDF-1.7 legacy payload"
                ).decode("ascii"),
            },
        )
        assert upload_response.status_code == 200
        file_id = str(upload_response.json()["id"])

        with session_scope() as session:
            row = session.get(PublicationFile, file_id)
            assert row is not None
            row.file_name = "legacy-final"
            session.flush()

        download_response = client.get(
            f"/v1/publications/{work_id}/files/{file_id}/download",
            headers=_auth_headers(token),
        )
        assert download_response.status_code == 200
        disposition = str(download_response.headers.get("content-disposition") or "")
        assert "filename*=UTF-8''Grafton-Clarke%20%282024%29.pdf" in disposition


def test_publication_file_content_route_proxies_open_access_pdf(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    monkeypatch.setattr(
        publication_console_service,
        "_request_bytes_with_retry",
        lambda **kwargs: (b"%PDF-1.7 proxied oa payload", "application/pdf"),
    )

    with TestClient(app) as client:
        owner_id, token = _register(client, email="file-content@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="OA content work",
                title_lower="oa content work",
                year=2026,
                doi="10.1000/oa-content-work",
                work_type="journal-article",
                venue_name="Reader Journal",
                publisher="Reader Publisher",
                abstract="Abstract",
                keywords=[],
                url="https://pubmed.ncbi.nlm.nih.gov/12345678/",
                authors_json=[{"name": "Alice Example"}],
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

            file_row = PublicationFile(
                owner_user_id=owner_id,
                publication_id=work_id,
                file_name="Example OA PDF.pdf",
                file_type="PDF",
                storage_key="",
                source="OA_LINK",
                oa_url="https://example.org/paper.pdf",
                checksum=None,
                custom_name=True,
            )
            session.add(file_row)
            session.flush()
            file_id = str(file_row.id)

        content_response = client.get(
            f"/v1/publications/{work_id}/files/{file_id}/content",
            headers=_auth_headers(token),
        )
        assert content_response.status_code == 200
        assert content_response.content == b"%PDF-1.7 proxied oa payload"
        assert content_response.headers.get("content-type") == "application/pdf"
        disposition = str(content_response.headers.get("content-disposition") or "")
        assert disposition.startswith("inline;")
        assert "filename*=UTF-8''Example%20OA%20PDF.pdf" in disposition

        with session_scope() as session:
            refreshed = session.get(PublicationFile, file_id)
            assert refreshed is not None
            assert refreshed.storage_key
            assert Path(str(refreshed.storage_key)).exists()
            assert refreshed.checksum is not None


def test_parent_publication_files_include_supplementary_figshare_links(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="supp-files@example.com",
            password_hash="test-hash",
            name="supp-files",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        parent = Work(
            user_id=user_id,
            title="Validation of aortic valve pressure gradient quantification using semi-automated 4D flow CMR pipeline",
            title_lower="validation of aortic valve pressure gradient quantification using semi-automated 4d flow cmr pipeline",
            year=2022,
            doi="10.1000/parent-work",
            work_type="journal-article",
            venue_name="Medical Teacher",
            publisher="Taylor & Francis",
            abstract="Parent abstract",
            keywords=[],
            url="https://example.org/parent",
            provenance="manual",
        )
        supplementary = Work(
            user_id=user_id,
            title="Additional file 1 of Validation of aortic valve pressure gradient quantification using semi-automated 4D flow CMR pipeline",
            title_lower="additional file 1 of validation of aortic valve pressure gradient quantification using semi-automated 4d flow cmr pipeline",
            year=2022,
            doi="10.6084/m9.figshare.123",
            work_type="data-set",
            venue_name="Figshare",
            publisher="Figshare",
            abstract="Supplementary file",
            keywords=[],
            url="https://figshare.com/articles/dataset/example/123",
            provenance="manual",
        )
        session.add_all([parent, supplementary])
        session.flush()
        parent_id = str(parent.id)

    payload = publication_console_service.list_publication_files(
        user_id=user_id,
        publication_id=parent_id,
    )

    assert len(payload["items"]) == 1
    item = payload["items"][0]
    assert item["source"] == "SUPPLEMENTARY_LINK"
    assert item["label"] == "Supplementary material"
    assert item["can_delete"] is False
    assert item["download_url"] == "https://figshare.com/articles/dataset/example/123"


def test_publication_files_list_backfills_default_saved_name(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="backfill-files@example.com",
            password_hash="test-hash",
            name="backfill-files",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="Backfill file upload work",
            title_lower="backfill file upload work",
            year=2026,
            doi="10.1000/backfill-file-upload-work",
            pmid="38598659",
            work_type="journal-article",
            venue_name="Test Journal",
            publisher="Test Publisher",
            abstract="Abstract",
            keywords=[],
            url="",
            authors_json=[{"name": "Ciaran Grafton-Clarke"}],
            provenance="manual",
        )
        session.add(work)
        session.flush()
        work_id = str(work.id)

        file_row = PublicationFile(
            publication_id=work_id,
            owner_user_id=user_id,
            file_name="legacy-upload-name.pdf",
            file_type="PDF",
            storage_key="",
            source="USER_UPLOAD",
            oa_url=None,
            checksum=None,
        )
        session.add(file_row)
        session.flush()
        file_id = str(file_row.id)

    payload = publication_console_service.list_publication_files(
        user_id=user_id,
        publication_id=work_id,
    )

    assert payload["items"][0]["file_name"] == "Grafton-Clarke (2026) - PMID 38598659"
    with session_scope() as session:
        refreshed = session.get(PublicationFile, file_id)
        assert refreshed is not None
        assert refreshed.file_name == "Grafton-Clarke (2026) - PMID 38598659"


def test_open_access_link_uses_default_publication_file_name(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    monkeypatch.setattr(
        publication_console_service,
        "_find_unpaywall_pdf_url",
        lambda **kwargs: "https://example.org/files/paper.pdf",
    )
    monkeypatch.setattr(
        publication_console_service,
        "_fetch_open_access_pdf_bytes",
        lambda *args, **kwargs: (b"%PDF-1.7 locally cached oa payload", "application/pdf"),
    )

    with TestClient(app) as client:
        owner_id, token = _register(client, email="oa-link-name@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="Open access naming work",
                title_lower="open access naming work",
                year=2026,
                doi="10.1000/open-access-naming-work",
                pmid=None,
                work_type="journal-article",
                venue_name="Test Journal",
                publisher="Test Publisher",
                abstract="Abstract",
                keywords=[],
                url="",
                authors_json=[{"name": "Ciaran Grafton-Clarke"}],
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

        response = client.post(
            f"/v1/publications/{work_id}/files/link-oa",
            headers=_auth_headers(token),
        )
        assert response.status_code == 200
    payload = response.json()
    assert payload["created"] is True
    assert payload["file"]["file_name"] == "Grafton-Clarke (2026)"
    assert payload["file"]["download_url"].endswith("/download")
    assert payload["file"]["classification"] is None
    assert payload["file"]["classification_label"] is None

    with session_scope() as session:
        stored_row = session.scalars(
            select(PublicationFile).where(
                PublicationFile.owner_user_id == owner_id,
                PublicationFile.publication_id == work_id,
            )
        ).first()
        assert stored_row is not None
        assert stored_row.storage_key
        assert publication_console_service._publication_file_storage_path(
            str(stored_row.storage_key)
        ).exists()
        assert stored_row.checksum is not None


def test_open_access_link_uses_browser_fallback_when_http_fetch_is_blocked(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    browser_calls: list[str] = []
    browser_bytes = b"%PDF-1.7 browser fallback payload"

    monkeypatch.setattr(
        publication_console_service,
        "_find_unpaywall_pdf_url",
        lambda **kwargs: "https://example.org/files/paper.pdf",
    )
    monkeypatch.setattr(
        publication_console_service,
        "_request_bytes_with_retry",
        lambda **kwargs: (b"", None),
    )

    def _browser_fetch(url: str) -> tuple[bytes, str | None]:
        browser_calls.append(url)
        return browser_bytes, "application/pdf"

    monkeypatch.setattr(
        publication_console_service,
        "_fetch_open_access_pdf_bytes_via_browser",
        _browser_fetch,
    )

    with TestClient(app) as client:
        owner_id, token = _register(client, email="oa-browser-fallback@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="Browser fallback OA work",
                title_lower="browser fallback oa work",
                year=2026,
                doi="10.1000/browser-fallback-oa-work",
                pmid=None,
                work_type="journal-article",
                venue_name="Test Journal",
                publisher="Test Publisher",
                abstract="Abstract",
                keywords=[],
                url="",
                authors_json=[{"name": "Ciaran Grafton-Clarke"}],
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

        response = client.post(
            f"/v1/publications/{work_id}/files/link-oa",
            headers=_auth_headers(token),
        )
        assert response.status_code == 200
        payload = response.json()

    assert payload["created"] is True
    assert payload["file"]["source"] == "OA_LINK"
    assert browser_calls == ["https://example.org/files/paper.pdf"]

    with session_scope() as session:
        stored_row = session.scalars(
            select(PublicationFile).where(
                PublicationFile.owner_user_id == owner_id,
                PublicationFile.publication_id == work_id,
            )
        ).first()
        assert stored_row is not None
        assert stored_row.storage_key
        assert publication_console_service._publication_file_storage_path(
            str(stored_row.storage_key)
        ).read_bytes() == browser_bytes


def test_open_access_link_keeps_external_link_when_local_cache_download_fails(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    monkeypatch.setattr(
        publication_console_service,
        "_find_unpaywall_pdf_url",
        lambda **kwargs: "https://example.org/files/paper.pdf",
    )
    monkeypatch.setattr(
        publication_console_service,
        "_fetch_open_access_pdf_bytes",
        lambda *args, **kwargs: (b"", None),
    )
    monkeypatch.setattr(
        publication_console_service,
        "_fetch_open_access_pdf_bytes_via_browser",
        lambda *args, **kwargs: (b"", None),
    )

    with TestClient(app) as client:
        owner_id, token = _register(client, email="oa-link-fallback@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="Open access fallback work",
                title_lower="open access fallback work",
                year=2026,
                doi="10.1000/open-access-fallback-work",
                pmid=None,
                work_type="journal-article",
                venue_name="Test Journal",
                publisher="Test Publisher",
                abstract="Abstract",
                keywords=[],
                url="",
                authors_json=[{"name": "Ciaran Grafton-Clarke"}],
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

        response = client.post(
            f"/v1/publications/{work_id}/files/link-oa",
            headers=_auth_headers(token),
        )
        assert response.status_code == 200
        payload = response.json()

    assert payload["created"] is True
    assert payload["file"] is not None
    assert payload["file"]["source"] == "OA_LINK"
    assert payload["file"]["oa_url"] == "https://example.org/files/paper.pdf"
    assert payload["file"]["download_url"] == "https://example.org/files/paper.pdf"
    assert payload["message"] == "Open-access PDF link added, but local download failed. Use the external link."

    with session_scope() as session:
        stored_row = session.scalars(
            select(PublicationFile).where(
                PublicationFile.owner_user_id == owner_id,
                PublicationFile.publication_id == work_id,
            )
        ).first()
        assert stored_row is not None
        assert stored_row.oa_url == "https://example.org/files/paper.pdf"
        assert stored_row.storage_key == ""
        assert stored_row.deleted is False


def test_deleted_open_access_file_restore_uses_remapped_persisted_local_copy(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="oa-remap@example.com",
            password_hash="test-hash",
            name="oa-remap",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="OA remap work",
            title_lower="oa remap work",
            year=2026,
            doi="10.1000/oa-remap-work",
            work_type="journal-article",
            venue_name="Test Journal",
            publisher="Test Publisher",
            abstract="Abstract",
            keywords=[],
            url="",
            authors_json=[{"name": "Ciaran Grafton-Clarke"}],
            provenance="manual",
            oa_link_suppressed=True,
        )
        session.add(work)
        session.flush()
        work_id = str(work.id)

        stored_path = tmp_path / "publication-files" / user_id / work_id / "oa-file.pdf"
        stored_path.parent.mkdir(parents=True, exist_ok=True)
        stored_path.write_bytes(b"%PDF-1.7 restored persisted payload")

        legacy_root = tmp_path / "old-release-root" / "legacy-publication-files"
        legacy_storage_key = legacy_root / user_id / work_id / "oa-file.pdf"
        oa_row = PublicationFile(
            publication_id=work_id,
            owner_user_id=user_id,
            file_name="open-access.pdf",
            file_type="PDF",
            storage_key=str(legacy_storage_key),
            source="OA_LINK",
            oa_url="https://example.org/files/paper.pdf",
            checksum=None,
            deleted=True,
            created_at=publication_console_service._utcnow(),
        )
        session.add(oa_row)
        session.flush()

    payload = publication_console_service.link_publication_open_access_pdf(
        user_id=user_id,
        publication_id=work_id,
        allow_suppressed=True,
    )

    assert payload["created"] is False
    assert payload["file"] is not None
    assert payload["file"]["download_url"].endswith("/download")
    assert payload["message"] == "Deleted open-access PDF restored."

    with session_scope() as session:
        restored = session.scalars(
            select(PublicationFile).where(
                PublicationFile.owner_user_id == user_id,
                PublicationFile.publication_id == work_id,
                PublicationFile.source == "OA_LINK",
            )
        ).first()
        assert restored is not None
        assert restored.deleted is False


def test_publication_file_rename_persists_for_open_access_link(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    monkeypatch.setattr(
        publication_console_service,
        "_find_unpaywall_pdf_url",
        lambda **kwargs: "https://example.org/files/paper.pdf",
    )
    monkeypatch.setattr(
        publication_console_service,
        "_fetch_open_access_pdf_bytes",
        lambda *args, **kwargs: (b"%PDF-1.7 locally cached oa payload", "application/pdf"),
    )

    with TestClient(app) as client:
        owner_id, token = _register(client, email="oa-rename@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="Open access rename work",
                title_lower="open access rename work",
                year=2026,
                doi="10.1000/open-access-rename-work",
                pmid="38598659",
                work_type="journal-article",
                venue_name="Test Journal",
                publisher="Test Publisher",
                abstract="Abstract",
                keywords=[],
                url="",
                authors_json=[{"name": "Ciaran Grafton-Clarke"}],
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

        link_response = client.post(
            f"/v1/publications/{work_id}/files/link-oa",
            headers=_auth_headers(token),
        )
        assert link_response.status_code == 200
        file_id = str(link_response.json()["file"]["id"])

        rename_response = client.patch(
            f"/v1/publications/{work_id}/files/{file_id}",
            headers=_auth_headers(token),
            json={"file_name": "Custom OA Rename"},
        )
        assert rename_response.status_code == 200
        assert rename_response.json()["file_name"] == "Custom OA Rename"
        assert rename_response.json()["can_rename"] is True

        list_response = client.get(
            f"/v1/publications/{work_id}/files",
            headers=_auth_headers(token),
        )
        assert list_response.status_code == 200
        assert list_response.json()["items"][0]["file_name"] == "Custom OA Rename"

        download_payload = publication_console_service.get_publication_file_download(
            user_id=owner_id,
            publication_id=work_id,
            file_id=file_id,
        )
        assert download_payload["file_name"] == "Custom OA Rename.pdf"

        with session_scope() as session:
            refreshed = session.get(PublicationFile, file_id)
            assert refreshed is not None
            assert refreshed.file_name == "Custom OA Rename"
            assert refreshed.custom_name is True
            assert refreshed.classification is None


def test_publication_file_classification_update_persists(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with TestClient(app) as client:
        owner_id, token = _register(client, email="classification@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="Classification work",
                title_lower="classification work",
                year=2026,
                doi="10.1000/classification-work",
                pmid=None,
                work_type="journal-article",
                venue_name="Test Journal",
                publisher="Test Publisher",
                abstract="Abstract",
                keywords=[],
                url="",
                authors_json=[{"name": "Ciaran Grafton-Clarke"}],
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

        upload_response = client.post(
            f"/v1/publications/{work_id}/files/upload",
            headers=_auth_headers(token),
            json={
                "filename": "classification-data.csv",
                "mime_type": "text/csv",
                "content_base64": base64.b64encode(b"col1,col2\n1,2\n").decode("ascii"),
            },
        )
        assert upload_response.status_code == 200
        file_id = str(upload_response.json()["id"])
        assert upload_response.json()["classification"] is None

        update_response = client.patch(
            f"/v1/publications/{work_id}/files/{file_id}",
            headers=_auth_headers(token),
            json={"classification": "TABLE"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["classification"] == "TABLE"
        assert update_response.json()["classification_label"] == "Table"
        assert update_response.json()["can_classify"] is True

        other_response = client.patch(
            f"/v1/publications/{work_id}/files/{file_id}",
            headers=_auth_headers(token),
            json={
                "classification": "OTHER",
                "classification_other_label": "Appendix note",
            },
        )
        assert other_response.status_code == 200
        assert other_response.json()["classification"] == "OTHER"
        assert other_response.json()["classification_label"] == "Appendix note"
        assert other_response.json()["classification_other_label"] == "Appendix note"

        clear_response = client.patch(
            f"/v1/publications/{work_id}/files/{file_id}",
            headers=_auth_headers(token),
            json={"classification": None, "classification_other_label": None},
        )
        assert clear_response.status_code == 200
        assert clear_response.json()["classification"] is None
        assert clear_response.json()["classification_label"] is None
        assert clear_response.json()["classification_other_label"] is None

        list_response = client.get(
            f"/v1/publications/{work_id}/files",
            headers=_auth_headers(token),
        )
        assert list_response.status_code == 200
        assert list_response.json()["items"][0]["classification"] is None

        with session_scope() as session:
            refreshed = session.get(PublicationFile, file_id)
            assert refreshed is not None
            assert refreshed.classification is None
            assert refreshed.classification_custom is False
            assert refreshed.classification_other_label is None


def test_deleted_open_access_link_stays_suppressed_until_explicit_readd(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    monkeypatch.setattr(
        publication_console_service,
        "_find_unpaywall_pdf_url",
        lambda **kwargs: "https://example.org/files/paper.pdf",
    )
    monkeypatch.setattr(
        publication_console_service,
        "_fetch_open_access_pdf_bytes",
        lambda *args, **kwargs: (b"%PDF-1.7 locally cached oa payload", "application/pdf"),
    )

    with TestClient(app) as client:
        owner_id, token = _register(client, email="oa-suppressed@example.com")

        with session_scope() as session:
            work = Work(
                user_id=owner_id,
                title="Suppressed OA work",
                title_lower="suppressed oa work",
                year=2026,
                doi="10.1000/suppressed-oa-work",
                pmid=None,
                work_type="journal-article",
                venue_name="Test Journal",
                publisher="Test Publisher",
                abstract="Abstract",
                keywords=[],
                url="",
                authors_json=[{"name": "Ciaran Grafton-Clarke"}],
                provenance="manual",
            )
            session.add(work)
            session.flush()
            work_id = str(work.id)

        link_response = client.post(
            f"/v1/publications/{work_id}/files/link-oa",
            headers=_auth_headers(token),
        )
        assert link_response.status_code == 200
        file_id = str(link_response.json()["file"]["id"])

        delete_response = client.delete(
            f"/v1/publications/{work_id}/files/{file_id}",
            headers=_auth_headers(token),
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["deleted"] is True

        with session_scope() as session:
            refreshed_work = session.get(Work, work_id)
            assert refreshed_work is not None
            assert refreshed_work.oa_link_suppressed is True

        suppressed_response = client.post(
            f"/v1/publications/{work_id}/files/link-oa",
            headers=_auth_headers(token),
        )
        assert suppressed_response.status_code == 200
        assert suppressed_response.json()["created"] is False
        assert suppressed_response.json()["file"] is None
        assert "turned off" in suppressed_response.json()["message"]

        list_response = client.get(
            f"/v1/publications/{work_id}/files",
            headers=_auth_headers(token),
        )
        assert list_response.status_code == 200
        assert list_response.json()["items"] == []
        assert list_response.json()["has_deleted_oa_file"] is True

        explicit_response = client.post(
            f"/v1/publications/{work_id}/files/link-oa",
            headers=_auth_headers(token),
            json={"allow_suppressed": True},
        )
        assert explicit_response.status_code == 200
        assert explicit_response.json()["created"] is False
        assert explicit_response.json()["file"] is not None
        assert explicit_response.json()["message"] == "Deleted open-access PDF restored."

        restored_list_response = client.get(
            f"/v1/publications/{work_id}/files",
            headers=_auth_headers(token),
        )
        assert restored_list_response.status_code == 200
        assert len(restored_list_response.json()["items"]) == 1
        assert restored_list_response.json()["has_deleted_oa_file"] is False

        with session_scope() as session:
            refreshed_work = session.get(Work, work_id)
            assert refreshed_work is not None
            assert refreshed_work.oa_link_suppressed is False
            restored_rows = session.scalars(
                select(PublicationFile).where(
                    PublicationFile.owner_user_id == owner_id,
                    PublicationFile.publication_id == work_id,
                )
            ).all()
            assert len(restored_rows) == 1
            assert restored_rows[0].source == "OA_LINK"


def test_structured_abstract_payload_uses_model_when_quality_guard_passes(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        publication_console_service,
        "_resolve_pubmed_pmid",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        publication_console_service,
        "_structured_abstract_llm_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        publication_console_service,
        "_generate_structured_abstract_with_model",
        lambda **kwargs: (
            "HEADING_BASED",
            [
                {
                    "key": "introduction",
                    "label": "Background",
                    "content": "Right atrial pressure is prognostic in heart failure.",
                },
                {
                    "key": "other",
                    "label": "Purpose",
                    "content": "Develop and validate a CMR-derived mRAP model.",
                },
                {
                    "key": "methods",
                    "label": "Methods",
                    "content": "Cohort n=672 with regression analyses.",
                },
                {
                    "key": "results",
                    "label": "Results",
                    "content": "AUC 0.93 with p<0.01 for hospitalisation outcomes.",
                },
                {
                    "key": "conclusions",
                    "label": "Conclusion",
                    "content": "CMR-derived mRAP supports risk stratification.",
                },
            ],
            "gpt-4.1-mini",
        ),
    )

    payload, model_name = publication_console_service._build_structured_abstract_payload(
        publication={
            "title": "Cardiac MRI-derived mean right atrial pressure and outcomes",
            "journal": "Open Heart",
            "year": 2025,
            "doi": None,
            "pmid": None,
            "keywords_json": ["heart failure"],
            "abstract": (
                "Background: Right atrial pressure is prognostic in heart failure. "
                "Purpose: Develop and validate a CMR-derived mRAP model. "
                "Methods: Cohort n=672 with regression analyses. "
                "Results: AUC 0.93 with p<0.01 for hospitalisation outcomes. "
                "Conclusion: CMR-derived mRAP supports risk stratification."
            ),
        }
    )

    assert model_name == "gpt-4.1-mini"
    assert payload["metadata"]["generation_method"] == "model_extractive"
    assert payload["metadata"]["quality_guard"]["passed"] is True
    assert any(section["label"] == "Purpose" for section in payload["sections"])


def test_structured_abstract_payload_falls_back_when_model_quality_guard_fails(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        publication_console_service,
        "_resolve_pubmed_pmid",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        publication_console_service,
        "_structured_abstract_llm_enabled",
        lambda: True,
    )
    monkeypatch.setattr(
        publication_console_service,
        "_generate_structured_abstract_with_model",
        lambda **kwargs: (
            "HEADING_BASED",
            [
                {
                    "key": "results",
                    "label": "Results",
                    "content": "Outcomes were favorable.",
                }
            ],
            "gpt-4.1-mini",
        ),
    )

    payload, model_name = publication_console_service._build_structured_abstract_payload(
        publication={
            "title": "Structured abstract fidelity guard",
            "journal": "Test Journal",
            "year": 2026,
            "doi": None,
            "pmid": None,
            "keywords_json": [],
            "abstract": (
                "Background: Cohort n=101 was studied. "
                "Results: AUC 0.75 and p<0.01 were observed."
            ),
        }
    )

    assert model_name is None
    assert payload["metadata"]["generation_method"] == "deterministic"
    model_fallback = payload["metadata"].get("model_fallback") or {}
    assert model_fallback.get("reason") == "quality_guard_failed"


# ---------------------------------------------------------------------------
# Figure legend detection tests
# ---------------------------------------------------------------------------


def test_is_figure_legend_paragraph_detects_captions() -> None:
    from research_os.services.publication_console_service import _is_figure_legend_paragraph

    assert _is_figure_legend_paragraph(
        "Figure 5 Multimodal cardiac assessment of a 39-year-old female patient "
        "with confirmed acute myocarditis showing diffuse edema and late gadolinium enhancement."
    ) is True

    assert _is_figure_legend_paragraph(
        "Table 2 Baseline characteristics of the study population stratified by "
        "treatment group showing demographics, comorbidities, and laboratory results."
    ) is True

    assert _is_figure_legend_paragraph(
        "Fig. 3 Kaplan-Meier survival curves for the primary endpoint of all-cause "
        "mortality stratified by baseline left ventricular ejection fraction."
    ) is True


def test_is_figure_legend_paragraph_preserves_sentences() -> None:
    from research_os.services.publication_console_service import _is_figure_legend_paragraph

    assert _is_figure_legend_paragraph(
        "Figure 1 shows the echocardiographic features of our cohort including "
        "ventricular dimensions and systolic function assessment at baseline."
    ) is False

    assert _is_figure_legend_paragraph(
        "Figure 2 demonstrates the relationship between cardiac biomarkers and "
        "clinical outcomes over the 12-month follow-up period in our population."
    ) is False

    assert _is_figure_legend_paragraph(
        "Table 1 presents the results of multivariate regression analysis with "
        "adjustment for age, sex, and baseline disease severity across subgroups."
    ) is False

    assert _is_figure_legend_paragraph("Figure 1") is False
    assert _is_figure_legend_paragraph("") is False
    assert _is_figure_legend_paragraph("Short text only.") is False


# ---------------------------------------------------------------------------
# GROBID coordinate parsing tests
# ---------------------------------------------------------------------------


def test_parse_grobid_coords_parses_valid_strings() -> None:
    from research_os.services.publication_console_service import _parse_grobid_coords

    entries = _parse_grobid_coords("3,72.0,200.5,500.3,600.8")
    assert len(entries) == 1
    assert entries[0] == (3, 72.0, 200.5, 500.3, 600.8)

    entries = _parse_grobid_coords("0,10,20,30,40;1,50,60,70,80")
    assert len(entries) == 2
    assert entries[0][0] == 0
    assert entries[1][0] == 1


def test_parse_grobid_coords_handles_empty_and_invalid() -> None:
    from research_os.services.publication_console_service import _parse_grobid_coords

    assert _parse_grobid_coords(None) == []
    assert _parse_grobid_coords("") == []
    assert _parse_grobid_coords("invalid") == []
    assert _parse_grobid_coords("1,2,3") == []


# ---------------------------------------------------------------------------
# Crop figure images tests
# ---------------------------------------------------------------------------


def test_crop_figure_images_returns_unchanged_without_fitz() -> None:
    from research_os.services.publication_console_service import _crop_figure_images_from_pdf

    figures = [{"id": "fig-1", "coords": "0,10,20,30,40", "image_data": None}]
    result = _crop_figure_images_from_pdf(b"", figures)
    assert result == figures

    result2 = _crop_figure_images_from_pdf(b"fake-pdf", [])
    assert result2 == []


def test_crop_figure_images_skips_text_heavy_page_sized_crop(monkeypatch) -> None:
    class _FakeRect:
        def __init__(self, x0: float, y0: float, x1: float, y1: float) -> None:
            self.x0 = x0
            self.y0 = y0
            self.x1 = x1
            self.y1 = y1

        @property
        def width(self) -> float:
            return max(0.0, self.x1 - self.x0)

        @property
        def height(self) -> float:
            return max(0.0, self.y1 - self.y0)

        @property
        def is_empty(self) -> bool:
            return self.width <= 0 or self.height <= 0

    class _FakePixmap:
        def tobytes(self, _fmt: str) -> bytes:
            return b"x" * 4096

    class _FakePage:
        def __init__(self) -> None:
            self.rect = _FakeRect(0, 0, 600, 800)

        def get_text(self, mode: str, clip=None):  # noqa: ANN001
            assert mode == "words"
            return [("w",)] * 220

        def get_pixmap(self, matrix=None, clip=None):  # noqa: ANN001
            return _FakePixmap()

    class _FakeDoc:
        def __init__(self) -> None:
            self._page = _FakePage()

        def __len__(self) -> int:
            return 1

        def __getitem__(self, index: int) -> _FakePage:
            assert index == 0
            return self._page

        def close(self) -> None:
            return None

    class _FakeFitzModule:
        @staticmethod
        def open(stream=None, filetype=None):  # noqa: ANN001
            return _FakeDoc()

        @staticmethod
        def Rect(x0: float, y0: float, x1: float, y1: float) -> _FakeRect:
            return _FakeRect(x0, y0, x1, y1)

        @staticmethod
        def Matrix(x: float, y: float) -> tuple[float, float]:
            return (x, y)

    monkeypatch.setattr(publication_console_service, "_fitz", _FakeFitzModule)

    result = publication_console_service._crop_figure_images_from_pdf(
        b"%PDF-1.7 fake payload",
        [{"id": "fig-1", "coords": "0,0,0,590,790", "image_data": None}],
    )

    assert result[0].get("image_data") is None


def test_crop_figure_images_prefers_native_pdf_image_when_available(monkeypatch) -> None:
    class _FakeRect:
        def __init__(self, x0: float, y0: float, x1: float, y1: float) -> None:
            self.x0 = x0
            self.y0 = y0
            self.x1 = x1
            self.y1 = y1

        @property
        def width(self) -> float:
            return max(0.0, self.x1 - self.x0)

        @property
        def height(self) -> float:
            return max(0.0, self.y1 - self.y0)

        @property
        def is_empty(self) -> bool:
            return self.width <= 0 or self.height <= 0

    class _FakePage:
        def __init__(self) -> None:
            self.rect = _FakeRect(0, 0, 600, 800)

        def get_text(self, mode: str, clip=None):  # noqa: ANN001
            assert mode == "words"
            return []

        def get_images(self, full: bool = False):  # noqa: FBT002
            assert full is True
            return [(17,)]

        def get_image_rects(self, xref: int):
            assert xref == 17
            return [_FakeRect(10, 20, 110, 140)]

        def get_pixmap(self, matrix=None, clip=None):  # noqa: ANN001
            raise AssertionError("native image extraction should bypass pixmap cropping")

    class _FakeDoc:
        def __init__(self) -> None:
            self._page = _FakePage()

        def __len__(self) -> int:
            return 1

        def __getitem__(self, index: int) -> _FakePage:
            assert index == 0
            return self._page

        def extract_image(self, xref: int):
            assert xref == 17
            return {"image": b"\x89PNG" + (b"x" * 4096), "ext": "png"}

        def close(self) -> None:
            return None

    class _FakeFitzModule:
        @staticmethod
        def open(stream=None, filetype=None):  # noqa: ANN001
            return _FakeDoc()

        @staticmethod
        def Rect(x0: float, y0: float, x1: float, y1: float) -> _FakeRect:
            return _FakeRect(x0, y0, x1, y1)

        @staticmethod
        def Matrix(x: float, y: float) -> tuple[float, float]:
            return (x, y)

    monkeypatch.setattr(publication_console_service, "_fitz", _FakeFitzModule)

    result = publication_console_service._crop_figure_images_from_pdf(
        b"%PDF-1.7 fake payload",
        [{"id": "fig-1", "coords": "0,10,20,110,140", "image_data": None}],
    )

    assert str(result[0].get("image_data") or "").startswith("data:image/png;base64,")


def test_crop_figure_images_upgrades_low_quality_pmc_figure_via_title_match(monkeypatch) -> None:
    class _FakeRect:
        def __init__(self, x0: float, y0: float, x1: float, y1: float) -> None:
            self.x0 = x0
            self.y0 = y0
            self.x1 = x1
            self.y1 = y1

        @property
        def width(self) -> float:
            return max(0.0, self.x1 - self.x0)

        @property
        def height(self) -> float:
            return max(0.0, self.y1 - self.y0)

        @property
        def is_empty(self) -> bool:
            return self.width <= 0 or self.height <= 0

    class _FakePage:
        def search_for(self, value: str):
            assert value == "Figure 2"
            return [_FakeRect(20, 40, 120, 60)]

        def get_images(self, full: bool = False):  # noqa: FBT002
            assert full is True
            return [(17,)]

        def get_image_rects(self, xref: int):
            assert xref == 17
            return [_FakeRect(40, 80, 500, 380)]

    class _FakeDoc:
        def __len__(self) -> int:
            return 1

        def __getitem__(self, index: int) -> _FakePage:
            assert index == 0
            return _FakePage()

        def extract_image(self, xref: int):
            assert xref == 17
            return {
                "image": (
                    b"\x89PNG\r\n\x1a\n"
                    + b"\x00\x00\x00\rIHDR"
                    + (1200).to_bytes(4, "big")
                    + (800).to_bytes(4, "big")
                    + b"\x08\x02\x00\x00\x00"
                    + (b"x" * 20000)
                ),
                "ext": "png",
                "width": 1200,
                "height": 800,
            }

        def close(self) -> None:
            return None

    class _FakeFitzModule:
        @staticmethod
        def open(stream=None, filetype=None):  # noqa: ANN001
            return _FakeDoc()

        @staticmethod
        def Rect(x0: float, y0: float, x1: float, y1: float) -> _FakeRect:
            return _FakeRect(x0, y0, x1, y1)

    weak_gif = (
        b"GIF89a"
        + (172).to_bytes(2, "little")
        + (80).to_bytes(2, "little")
        + (b"x" * 6000)
    )

    monkeypatch.setattr(publication_console_service, "_fitz", _FakeFitzModule)

    result = publication_console_service._crop_figure_images_from_pdf(
        b"%PDF-1.7 fake payload",
        [
            {
                "id": "fig-2",
                "title": "Figure 2",
                "classification": publication_console_service.FILE_CLASSIFICATION_FIGURE,
                "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_JATS,
                "image_data": "data:image/gif;base64,"
                + base64.b64encode(weak_gif).decode("ascii"),
            }
        ],
    )

    assert str(result[0].get("image_data") or "").startswith("data:image/png;base64,")


def test_crop_figure_images_rerenders_at_higher_scale_until_quality_target_met(
    monkeypatch,
) -> None:
    def _fake_png_bytes(width: int, height: int, fill: bytes) -> bytes:
        return (
            b"\x89PNG\r\n\x1a\n"
            + b"\x00\x00\x00\rIHDR"
            + width.to_bytes(4, "big")
            + height.to_bytes(4, "big")
            + b"\x08\x02\x00\x00\x00"
            + fill
        )

    class _FakeRect:
        def __init__(self, x0: float, y0: float, x1: float, y1: float) -> None:
            self.x0 = x0
            self.y0 = y0
            self.x1 = x1
            self.y1 = y1

        @property
        def width(self) -> float:
            return max(0.0, self.x1 - self.x0)

        @property
        def height(self) -> float:
            return max(0.0, self.y1 - self.y0)

        @property
        def is_empty(self) -> bool:
            return self.width <= 0 or self.height <= 0

    class _FakePixmap:
        def __init__(self, payload: bytes) -> None:
            self._payload = payload

        def tobytes(self, _fmt: str) -> bytes:
            return self._payload

    render_scales: list[float] = []

    class _FakePage:
        def __init__(self) -> None:
            self.rect = _FakeRect(0, 0, 600, 800)

        def get_text(self, mode: str, clip=None):  # noqa: ANN001
            assert mode == "words"
            return []

        def get_images(self, full: bool = False):  # noqa: FBT002
            assert full is True
            return []

        def get_pixmap(self, matrix=None, clip=None):  # noqa: ANN001
            scale = float(matrix[0])
            render_scales.append(scale)
            if scale < 6.0:
                return _FakePixmap(_fake_png_bytes(900, 520, b"x" * 16000))
            return _FakePixmap(_fake_png_bytes(1400, 820, b"y" * 50000))

    class _FakeDoc:
        def __init__(self) -> None:
            self._page = _FakePage()

        def __len__(self) -> int:
            return 1

        def __getitem__(self, index: int) -> _FakePage:
            assert index == 0
            return self._page

        def close(self) -> None:
            return None

    class _FakeFitzModule:
        @staticmethod
        def open(stream=None, filetype=None):  # noqa: ANN001
            return _FakeDoc()

        @staticmethod
        def Rect(x0: float, y0: float, x1: float, y1: float) -> _FakeRect:
            return _FakeRect(x0, y0, x1, y1)

        @staticmethod
        def Matrix(x: float, y: float) -> tuple[float, float]:
            return (x, y)

    monkeypatch.setattr(publication_console_service, "_fitz", _FakeFitzModule)

    result = publication_console_service._crop_figure_images_from_pdf(
        b"%PDF-1.7 fake payload",
        [{"id": "fig-1", "coords": "0,10,20,110,140", "image_data": None}],
    )

    metrics = publication_console_service._publication_paper_figure_image_metrics(
        {
            "classification": publication_console_service.FILE_CLASSIFICATION_FIGURE,
            "image_data": result[0].get("image_data"),
        }
    )
    assert render_scales == [4.0, 6.0]
    assert metrics is not None
    assert metrics["width"] == 1400
    assert metrics["height"] == 820


def test_extract_title_matched_pdf_figure_image_prefers_image_above_caption(
    monkeypatch,
) -> None:
    class _FakeRect:
        def __init__(self, x0: float, y0: float, x1: float, y1: float) -> None:
            self.x0 = x0
            self.y0 = y0
            self.x1 = x1
            self.y1 = y1

    class _FakePage:
        def search_for(self, value: str):
            assert value == "Figure 2"
            return [_FakeRect(40, 290, 90, 301)]

        def get_images(self, full: bool = False):  # noqa: FBT002
            assert full is True
            return [(54,), (55,)]

        def get_image_rects(self, xref: int):
            if xref == 54:
                return [_FakeRect(40, 48, 555, 287)]
            if xref == 55:
                return [_FakeRect(40, 457, 555, 684)]
            return []

    class _FakeDoc:
        def __len__(self) -> int:
            return 1

        def __getitem__(self, index: int) -> _FakePage:
            assert index == 0
            return _FakePage()

        def extract_image(self, xref: int):
            if xref == 54:
                return {
                    "image": (
                        b"\x89PNG\r\n\x1a\n"
                        + b"\x00\x00\x00\rIHDR"
                        + (2775).to_bytes(4, "big")
                        + (1288).to_bytes(4, "big")
                        + b"\x08\x02\x00\x00\x00"
                        + (b"a" * 30000)
                    ),
                    "ext": "png",
                    "width": 2775,
                    "height": 1288,
                }
            if xref == 55:
                return {
                    "image": (
                        b"\x89PNG\r\n\x1a\n"
                        + b"\x00\x00\x00\rIHDR"
                        + (2792).to_bytes(4, "big")
                        + (1232).to_bytes(4, "big")
                        + b"\x08\x02\x00\x00\x00"
                        + (b"b" * 30000)
                    ),
                    "ext": "png",
                    "width": 2792,
                    "height": 1232,
                }
            raise AssertionError(f"unexpected xref {xref}")

    data_uri = publication_console_service._extract_title_matched_pdf_figure_image(
        doc=_FakeDoc(),
        figure={"title": "Figure 2"},
    )

    assert isinstance(data_uri, str)
    assert data_uri.startswith("data:image/png;base64,")
    encoded = data_uri.split(",", 1)[1]
    decoded = base64.b64decode(encoded)
    assert b"a" * 100 in decoded
    assert b"b" * 100 not in decoded


def test_extract_title_matched_pdf_figure_image_uses_caption_anchor_terms() -> None:
    class _FakeRect:
        def __init__(self, x0: float, y0: float, x1: float, y1: float) -> None:
            self.x0 = x0
            self.y0 = y0
            self.x1 = x1
            self.y1 = y1

    class _FakePage:
        def search_for(self, value: str):
            if value == "Figure 4":
                return []
            if value.startswith("CMR sub-phenotyping in patients with IHD and HCM"):
                return [_FakeRect(40, 290, 380, 310)]
            return []

        def get_images(self, full: bool = False):  # noqa: FBT002
            assert full is True
            return [(61,), (62,)]

        def get_image_rects(self, xref: int):
            if xref == 61:
                return [_FakeRect(40, 60, 520, 270)]
            if xref == 62:
                return [_FakeRect(560, 60, 860, 270)]
            return []

    class _FakeDoc:
        def __len__(self) -> int:
            return 1

        def __getitem__(self, index: int) -> _FakePage:
            assert index == 0
            return _FakePage()

        def extract_image(self, xref: int):
            fill = b"c" if xref == 61 else b"d"
            return {
                "image": (
                    b"\x89PNG\r\n\x1a\n"
                    + b"\x00\x00\x00\rIHDR"
                    + (2408).to_bytes(4, "big")
                    + (1080).to_bytes(4, "big")
                    + b"\x08\x02\x00\x00\x00"
                    + (fill * 30000)
                ),
                "ext": "png",
                "width": 2408,
                "height": 1080,
            }

    data_uri = publication_console_service._extract_title_matched_pdf_figure_image(
        doc=_FakeDoc(),
        figure={
            "title": "Figure 4",
            "caption": "CMR sub-phenotyping in patients with IHD and HCM. CMR confirmed the echocardiographic diagnosis.",
        },
    )

    assert isinstance(data_uri, str)
    assert data_uri.startswith("data:image/png;base64,")
    decoded = base64.b64decode(data_uri.split(",", 1)[1])
    assert b"c" * 100 in decoded


def test_crop_figure_images_prefers_distinct_title_matched_images_across_figures(
    monkeypatch,
) -> None:
    class _FakePage:
        def search_for(self, value: str):
            if value == "Figure 2":
                return [type("Rect", (), {"x0": 40, "y0": 310, "x1": 120, "y1": 326})()]
            if value == "Figure 3":
                return [type("Rect", (), {"x0": 40, "y0": 320, "x1": 120, "y1": 336})()]
            return []

        def get_images(self, full: bool = False):  # noqa: FBT002
            assert full is True
            return [(54,), (55,)]

        def get_image_rects(self, xref: int):
            if xref == 54:
                return [type("Rect", (), {"x0": 35, "y0": 40, "x1": 555, "y1": 300})()]
            if xref == 55:
                return [type("Rect", (), {"x0": 48, "y0": 56, "x1": 540, "y1": 288})()]
            return []

    class _FakeDoc:
        def __len__(self) -> int:
            return 1

        def __getitem__(self, index: int) -> _FakePage:
            assert index == 0
            return _FakePage()

        def extract_image(self, xref: int):
            if xref == 54:
                return {
                    "image": (
                        b"\x89PNG\r\n\x1a\n"
                        + b"\x00\x00\x00\rIHDR"
                        + (2775).to_bytes(4, "big")
                        + (1288).to_bytes(4, "big")
                        + b"\x08\x02\x00\x00\x00"
                        + (b"a" * 30000)
                    ),
                    "ext": "png",
                    "width": 2775,
                    "height": 1288,
                }
            if xref == 55:
                return {
                    "image": (
                        b"\x89PNG\r\n\x1a\n"
                        + b"\x00\x00\x00\rIHDR"
                        + (2650).to_bytes(4, "big")
                        + (1200).to_bytes(4, "big")
                        + b"\x08\x02\x00\x00\x00"
                        + (b"b" * 28000)
                    ),
                    "ext": "png",
                    "width": 2650,
                    "height": 1200,
                }
            raise AssertionError(f"unexpected xref {xref}")

        def close(self) -> None:
            return None

    class _FakeFitzModule:
        @staticmethod
        def open(stream=None, filetype=None):  # noqa: ANN001
            return _FakeDoc()

    monkeypatch.setattr(publication_console_service, "_fitz", _FakeFitzModule)

    result = publication_console_service._crop_figure_images_from_pdf(
        b"%PDF-1.7 fake payload",
        [
            {"id": "fig-2", "title": "Figure 2", "image_data": None},
            {"id": "fig-3", "title": "Figure 3", "image_data": None},
        ],
    )

    assert len(result) == 2
    assert result[0]["image_data"] != result[1]["image_data"]
    assert result[0]["source_parser"] == publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PDF_TITLE_MATCH
    assert result[1]["source_parser"] == publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PDF_TITLE_MATCH


def test_merge_publication_paper_asset_candidate_prefers_higher_quality_figure_image() -> None:
    weak_gif = (
        b"GIF89a"
        + (172).to_bytes(2, "little")
        + (80).to_bytes(2, "little")
        + (b"x" * 6000)
    )
    strong_png = (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\rIHDR"
        + (640).to_bytes(4, "big")
        + (420).to_bytes(4, "big")
        + b"\x08\x02\x00\x00\x00"
        + (b"y" * 20000)
    )

    existing = {
        "classification": publication_console_service.FILE_CLASSIFICATION_FIGURE,
        "title": "Figure 2",
        "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_JATS,
        "image_data": "data:image/gif;base64,"
        + base64.b64encode(weak_gif).decode("ascii"),
    }
    candidate = {
        "classification": publication_console_service.FILE_CLASSIFICATION_FIGURE,
        "title": "Figure 2",
        "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_GROBID,
        "image_data": "data:image/png;base64,"
        + base64.b64encode(strong_png).decode("ascii"),
    }

    merged = publication_console_service._merge_publication_paper_asset_candidate(
        existing,
        candidate,
    )

    assert merged["image_data"] == candidate["image_data"]
    assert (
        merged["source_parser"]
        == publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_GROBID
    )


def test_merge_publication_paper_asset_candidate_prefers_higher_priority_figure_source_on_quality_tie() -> None:
    png_one = (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\rIHDR"
        + (1200).to_bytes(4, "big")
        + (700).to_bytes(4, "big")
        + b"\x08\x02\x00\x00\x00"
        + (b"a" * 25000)
    )
    png_two = (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\rIHDR"
        + (1200).to_bytes(4, "big")
        + (700).to_bytes(4, "big")
        + b"\x08\x02\x00\x00\x00"
        + (b"b" * 25000)
    )

    existing = {
        "classification": publication_console_service.FILE_CLASSIFICATION_FIGURE,
        "title": "Figure 2",
        "page_start": 6,
        "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_GROBID,
        "image_data": "data:image/png;base64," + base64.b64encode(png_one).decode("ascii"),
    }
    candidate = {
        "classification": publication_console_service.FILE_CLASSIFICATION_FIGURE,
        "title": "Figure 2",
        "page_start": 6,
        "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_JATS,
        "image_data": "data:image/png;base64," + base64.b64encode(png_two).decode("ascii"),
    }

    merged = publication_console_service._merge_publication_paper_asset_candidate(
        existing,
        candidate,
    )

    assert merged["image_data"] == candidate["image_data"]
    assert (
        merged["source_parser"]
        == publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_JATS
    )


def test_merge_publication_paper_asset_candidate_prefers_source_native_table_html() -> None:
    existing = {
        "classification": publication_console_service.FILE_CLASSIFICATION_TABLE,
        "title": "Table 1",
        "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_GROBID,
        "structured_html": (
            "<table><thead><tr><th>Op</th><th>en</th><th>acce</th></tr></thead>"
            "<tbody><tr><td>A</td><td>B</td><td>C</td></tr></tbody></table>"
        ),
    }
    candidate = {
        "classification": publication_console_service.FILE_CLASSIFICATION_TABLE,
        "title": "Table 1",
        "source_parser": publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_JATS,
        "structured_html": (
            "<table><thead><tr><th>Variable</th><th>Value</th></tr></thead>"
            "<tbody><tr><td>LVFP</td><td>14</td></tr></tbody></table>"
        ),
    }

    merged = publication_console_service._merge_publication_paper_asset_candidate(
        existing,
        candidate,
    )

    assert merged["structured_html"] == candidate["structured_html"]
    assert (
        merged["source_parser"]
        == publication_console_service.STRUCTURED_PAPER_SECTION_SOURCE_PMC_JATS
    )


# ---------------------------------------------------------------------------
# Docling table matching tests
# ---------------------------------------------------------------------------


def test_match_docling_tables_to_assets_matches_by_page() -> None:
    from research_os.services.publication_console_service import _match_docling_tables_to_assets

    docling_tables = [
        {"html": "<table><tr><td>A</td></tr></table>", "page": 3, "num_rows": 5, "num_cols": 3},
        {"html": "<table><tr><td>B</td></tr></table>", "page": 7, "num_rows": 10, "num_cols": 4},
    ]
    table_assets = [
        {"id": "t1", "page_start": 3, "structured_html": None},
        {"id": "t2", "page_start": 7, "structured_html": None},
    ]
    result = _match_docling_tables_to_assets(docling_tables, table_assets)
    assert len(result) == 2
    assert "<td>A</td>" in result[0]["structured_html"]
    assert "<td>B</td>" in result[1]["structured_html"]


def test_match_docling_tables_returns_unchanged_when_empty() -> None:
    from research_os.services.publication_console_service import _match_docling_tables_to_assets

    assets = [{"id": "t1", "page_start": 5, "structured_html": None}]
    result = _match_docling_tables_to_assets([], assets)
    assert result == assets
    result2 = _match_docling_tables_to_assets([{"html": "<table/>", "page": 5, "num_rows": 2, "num_cols": 2}], [])
    assert result2 == []


def test_extract_docling_tables_html_passes_document_to_html_export(monkeypatch) -> None:
    import sys
    import types

    seen_docs: list[object] = []

    class _FakeProv:
        page_no = 4

    class _FakeData:
        grid = [["Label", "Value"], ["A", "1"]]

    class _FakeTable:
        prov = [_FakeProv()]
        data = _FakeData()

        def export_to_html(self, document) -> str:
            seen_docs.append(document)
            return "<table><tr><td>A</td></tr></table>"

    fake_document = types.SimpleNamespace(tables=[_FakeTable()])

    class _FakeConverter:
        def convert(self, _path: str):
            return types.SimpleNamespace(document=fake_document)

    fake_docling_module = types.ModuleType("docling")
    fake_document_converter_module = types.ModuleType("docling.document_converter")
    fake_document_converter_module.DocumentConverter = _FakeConverter
    fake_docling_module.document_converter = fake_document_converter_module

    monkeypatch.setitem(sys.modules, "docling", fake_docling_module)
    monkeypatch.setitem(
        sys.modules,
        "docling.document_converter",
        fake_document_converter_module,
    )

    result = publication_console_service._extract_docling_tables_html(
        b"%PDF-1.7 fake docling table"
    )

    assert seen_docs == [fake_document]
    assert result == [
        {
            "html": "<table><tr><td>A</td></tr></table>",
            "page": 4,
            "num_rows": 2,
            "num_cols": 2,
        }
    ]


# ---------------------------------------------------------------------------
# Asset builder new fields tests
# ---------------------------------------------------------------------------


def test_build_parsed_asset_includes_new_fields() -> None:
    from research_os.services.publication_console_service import _build_parsed_publication_paper_asset

    asset = _build_parsed_publication_paper_asset(
        asset_id="parsed-figure-1",
        title="Figure 1",
        classification="FIGURE",
        caption="A test caption.",
        page_start=2,
        page_end=2,
        coords="1,10,20,100,200",
        graphic_coords="1,15,25,95,195",
    )
    assert asset["coords"] == "1,10,20,100,200"
    assert asset["graphic_coords"] == "1,15,25,95,195"
    assert asset["image_data"] is None
    assert asset["structured_html"] is None
    assert asset["origin"] == "parsed"
    assert asset["source_parser"] == "grobid"


# ---------------------------------------------------------------------------
# TEI extraction with coords tests
# ---------------------------------------------------------------------------


def test_extract_assets_from_tei_captures_coords() -> None:
    from research_os.services.publication_console_service import (
        _extract_publication_paper_assets_from_tei,
    )

    tei_xml = """<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text>
    <body>
      <figure coords="3,72.0,200.5,500.3,600.8">
        <head>Figure 1</head>
        <label>Figure 1</label>
        <figDesc>A sample figure description that is long enough to be a caption.</figDesc>
        <graphic coords="3,80.0,210.0,490.0,590.0" />
      </figure>
      <figure type="table" coords="5,50.0,100.0,540.0,700.0">
        <head>Table 1</head>
        <label>Table 1</label>
        <figDesc>Baseline characteristics of enrolled patients.</figDesc>
      </figure>
    </body>
  </text>
</TEI>"""
    root = ET.fromstring(tei_xml)
    figures, tables = _extract_publication_paper_assets_from_tei(root)

    assert len(figures) == 1
    assert figures[0]["coords"] == "3,72.0,200.5,500.3,600.8"
    assert figures[0]["graphic_coords"] == "3,80.0,210.0,490.0,590.0"

    assert len(tables) == 1
    assert tables[0]["coords"] == "5,50.0,100.0,540.0,700.0"
    assert tables[0]["graphic_coords"] is None


# ---------------------------------------------------------------------------
# Figure legend content cleanup test
# ---------------------------------------------------------------------------


def test_content_cleanup_strips_figure_legend_captions() -> None:
    from research_os.services.publication_console_service import _publication_paper_content_cleanup

    text = (
        "The patient underwent cardiac MRI. "
        "Figure 5 Multimodal cardiac assessment of a 39-year-old female patient "
        "with confirmed acute myocarditis showing diffuse biventricular oedema. "
        "The clinical follow-up continued."
    )
    result = _publication_paper_content_cleanup(text)
    assert "Figure 5 Multimodal" not in result
    assert "patient underwent" in result
    assert "clinical follow-up" in result


def test_content_cleanup_preserves_figure_references() -> None:
    from research_os.services.publication_console_service import _publication_paper_content_cleanup

    text = "Figure 1 shows the distribution of cardiac biomarkers across all study groups."
    result = _publication_paper_content_cleanup(text)
    assert "Figure 1 shows" in result

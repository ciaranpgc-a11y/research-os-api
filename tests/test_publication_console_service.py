from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

import research_os.services.publication_console_service as publication_console_service
from research_os.api.app import app
from research_os.db import (
    PublicationAiCache,
    PublicationFile,
    PublicationImpactCache,
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
                year=2024,
                doi="10.1000/file-upload-work",
                work_type="journal-article",
                venue_name="Test Journal",
                publisher="Test Publisher",
                abstract="Abstract",
                keywords=[],
                url="",
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
        assert uploaded["file_name"] == upload_filename
        assert uploaded["file_type"] == "PDF"
        file_id = str(uploaded["id"])

        download_response = client.get(
            f"/v1/publications/{work_id}/files/{file_id}/download",
            headers=_auth_headers(token),
        )
        assert download_response.status_code == 200
        assert download_response.content == b"%PDF-1.7 test payload"
        disposition = str(download_response.headers.get("content-disposition") or "")
        assert "filename*=UTF-8''My%20manuscript%3B%20v2.final.pdf" in disposition


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
        assert "filename*=UTF-8''legacy-final.pdf" in disposition


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

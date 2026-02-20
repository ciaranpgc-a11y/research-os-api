from fastapi.testclient import TestClient

from research_os.api.app import app
from research_os.db import reset_database_state


def _set_test_environment(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    reset_database_state()


def test_health_returns_ok(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_v1_health_returns_ok(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_draft_methods_returns_generated_draft(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    def _mock_draft(notes: str) -> str:
        assert notes == "Example notes"
        return "Generated methods draft"

    monkeypatch.setattr("research_os.api.app.draft_methods_from_notes", _mock_draft)

    with TestClient(app) as client:
        response = client.post("/draft/methods", json={"notes": "Example notes"})

    assert response.status_code == 200
    assert response.json() == {"draft": "Generated methods draft"}


def test_v1_draft_methods_returns_generated_draft(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    def _mock_draft(notes: str) -> str:
        assert notes == "Example notes"
        return "Generated methods draft"

    monkeypatch.setattr("research_os.api.app.draft_methods_from_notes", _mock_draft)

    with TestClient(app) as client:
        response = client.post("/v1/draft/methods", json={"notes": "Example notes"})

    assert response.status_code == 200
    assert response.json() == {"methods": "Generated methods draft"}


def test_draft_methods_returns_502_on_generation_error(monkeypatch) -> None:
    from research_os.services.manuscript_service import ManuscriptGenerationError

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    def _mock_fail(_: str) -> str:
        raise ManuscriptGenerationError("OpenAI down")

    monkeypatch.setattr("research_os.api.app.draft_methods_from_notes", _mock_fail)

    with TestClient(app) as client:
        response = client.post("/draft/methods", json={"notes": "Example notes"})

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "message": "OpenAI request failed",
            "type": "openai_error",
            "detail": "OpenAI down",
        }
    }


def test_v1_draft_methods_returns_502_on_generation_error(monkeypatch) -> None:
    from research_os.services.manuscript_service import ManuscriptGenerationError

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    def _mock_fail(_: str) -> str:
        raise ManuscriptGenerationError("OpenAI down")

    monkeypatch.setattr("research_os.api.app.draft_methods_from_notes", _mock_fail)

    with TestClient(app) as client:
        response = client.post("/v1/draft/methods", json={"notes": "Example notes"})

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "message": "OpenAI request failed",
            "type": "openai_error",
            "detail": "OpenAI down",
        }
    }


def test_v1_create_and_list_projects(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        create_response = client.post(
            "/v1/projects",
            json={
                "title": "Heart Failure Outcomes Cohort",
                "target_journal": "ehj",
                "study_type": "cohort",
            },
        )
        list_response = client.get("/v1/projects")

    assert create_response.status_code == 200
    payload = create_response.json()
    assert payload["title"] == "Heart Failure Outcomes Cohort"
    assert payload["target_journal"] == "ehj"

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


def test_v1_journals_returns_presets(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        response = client.get("/v1/journals")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 1
    assert {"slug", "display_name", "default_voice"}.issubset(payload[0].keys())


def test_v1_create_and_list_project_manuscripts(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Valve Intervention Registry",
                "target_journal": "jacc",
            },
        )
        project_id = project_response.json()["id"]
        create_manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={
                "branch_name": "journal-a",
                "sections": ["introduction", "methods", "results", "discussion"],
            },
        )
        list_manuscript_response = client.get(f"/v1/projects/{project_id}/manuscripts")

    assert create_manuscript_response.status_code == 200
    manuscript_payload = create_manuscript_response.json()
    assert manuscript_payload["branch_name"] == "journal-a"
    assert list(manuscript_payload["sections"].keys()) == [
        "introduction",
        "methods",
        "results",
        "discussion",
    ]

    assert list_manuscript_response.status_code == 200
    assert len(list_manuscript_response.json()) == 1


def test_v1_create_manuscript_uses_default_sections_when_not_provided(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Default Sections Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        create_manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "default-sections"},
        )

    assert create_manuscript_response.status_code == 200
    payload = create_manuscript_response.json()
    assert list(payload["sections"].keys()) == [
        "title",
        "abstract",
        "introduction",
        "methods",
        "results",
        "discussion",
        "conclusion",
    ]


def test_v1_get_and_patch_project_manuscript(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Section Edit Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "section-edit"},
        )
        manuscript_id = manuscript_response.json()["id"]
        patch_response = client.patch(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}",
            json={
                "sections": {
                    "methods": "Updated methods content",
                    "limitations": "Single-center retrospective design.",
                }
            },
        )
        get_response = client.get(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}"
        )

    assert patch_response.status_code == 200
    patched_payload = patch_response.json()
    assert patched_payload["sections"]["methods"] == "Updated methods content"
    assert (
        patched_payload["sections"]["limitations"]
        == "Single-center retrospective design."
    )

    assert get_response.status_code == 200
    fetched_payload = get_response.json()
    assert fetched_payload["sections"]["methods"] == "Updated methods content"
    assert (
        fetched_payload["sections"]["limitations"]
        == "Single-center retrospective design."
    )


def test_v1_get_project_manuscript_returns_404_for_missing_manuscript(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Missing Manuscript Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        response = client.get(f"/v1/projects/{project_id}/manuscripts/missing")

    assert response.status_code == 404
    assert response.json()["error"]["type"] == "not_found"


def test_v1_create_manuscript_returns_409_for_duplicate_branch(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Duplicate Branch Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        initial_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "main"},
        )
        duplicate_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "main"},
        )

    assert initial_response.status_code == 200
    assert duplicate_response.status_code == 409
    assert duplicate_response.json()["error"]["type"] == "conflict"


def test_v1_project_manuscripts_returns_404_for_missing_project(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        response = client.get("/v1/projects/missing-project/manuscripts")

    assert response.status_code == 404
    assert response.json()["error"]["type"] == "not_found"


def test_v1_wizard_infer_returns_adaptive_questions(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        response = client.post(
            "/v1/wizard/infer",
            json={
                "target_journal": "ehj",
                "answers": {
                    "disease_focus": "Heart failure",
                    "population": "Adults with reduced ejection fraction",
                    "primary_outcome": (
                        "Randomized trial primary endpoint was mortality"
                    ),
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["inferred_study_type"] == "randomized_controlled_trial"
    question_ids = {question["id"] for question in payload["next_questions"]}
    assert "intervention_exposure" in question_ids
    assert "comparator" in question_ids


def test_v1_wizard_bootstrap_creates_project_and_manuscript(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        response = client.post(
            "/v1/wizard/bootstrap",
            json={
                "title": "Registry Manuscript",
                "target_journal": "jacc",
                "answers": {
                    "disease_focus": "Aortic stenosis",
                    "population": "Adults undergoing TAVI",
                    "primary_outcome": "One-year mortality",
                    "analysis_summary": (
                        "Multivariable Cox model and sensitivity analyses"
                    ),
                    "key_findings": "Lower mortality with early intervention",
                    "manuscript_goal": "generate_full_manuscript",
                    "data_source": "csv_or_xlsx",
                    "intervention_exposure": "Early intervention strategy",
                },
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["project"]["title"] == "Registry Manuscript"
    assert payload["project"]["target_journal"] == "jacc"
    assert "introduction" in payload["manuscript"]["sections"]
    assert payload["inference"]["target_journal"] == "jacc"

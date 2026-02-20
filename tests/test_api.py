import time

from fastapi.testclient import TestClient

from research_os.api.app import app
from research_os.db import reset_database_state


def _set_test_environment(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    reset_database_state()


def _wait_for_job_terminal_status(
    client: TestClient, job_id: str, timeout_seconds: float = 5.0
):
    deadline = time.monotonic() + timeout_seconds
    last_payload = None
    while time.monotonic() < deadline:
        response = client.get(f"/v1/generation-jobs/{job_id}")
        assert response.status_code == 200
        payload = response.json()
        last_payload = payload
        if payload["status"] in {"completed", "failed", "cancelled"}:
            return payload
        time.sleep(0.05)
    raise AssertionError(f"Generation job '{job_id}' did not reach terminal state.")


def _assert_job_cost_estimates(payload: dict) -> None:
    assert payload["estimated_input_tokens"] > 0
    assert payload["estimated_output_tokens_low"] > 0
    assert payload["estimated_output_tokens_high"] >= payload["estimated_output_tokens_low"]
    assert payload["estimated_cost_usd_low"] >= 0
    assert payload["estimated_cost_usd_high"] >= payload["estimated_cost_usd_low"]
    assert payload["pricing_model"] == "gpt-4.1-mini"


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


def test_v1_draft_section_returns_generated_draft(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    def _mock_draft(section: str, notes: str) -> str:
        assert section == "results"
        assert notes == "Example results notes"
        return "Generated results draft"

    monkeypatch.setattr("research_os.api.app.draft_section_from_notes", _mock_draft)

    with TestClient(app) as client:
        response = client.post(
            "/v1/draft/section",
            json={"section": "results", "notes": "Example results notes"},
        )

    assert response.status_code == 200
    assert response.json() == {"section": "results", "draft": "Generated results draft"}


def test_draft_section_returns_generated_draft(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    def _mock_draft(section: str, notes: str) -> str:
        assert section == "discussion"
        assert notes == "Example discussion notes"
        return "Generated discussion draft"

    monkeypatch.setattr("research_os.api.app.draft_section_from_notes", _mock_draft)

    with TestClient(app) as client:
        response = client.post(
            "/draft/section",
            json={"section": "discussion", "notes": "Example discussion notes"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "section": "discussion",
        "draft": "Generated discussion draft",
    }


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


def test_v1_draft_section_returns_502_on_generation_error(monkeypatch) -> None:
    from research_os.services.manuscript_service import ManuscriptGenerationError

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    def _mock_fail(_: str, __: str) -> str:
        raise ManuscriptGenerationError("OpenAI down")

    monkeypatch.setattr("research_os.api.app.draft_section_from_notes", _mock_fail)

    with TestClient(app) as client:
        response = client.post(
            "/v1/draft/section",
            json={"section": "introduction", "notes": "Example notes"},
        )

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


def test_v1_aawe_selection_insight_returns_claim_payload(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.get("/v1/aawe/insights/claim/intro-p1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["selection_type"] == "claim"
    assert payload["item_id"] == "intro-p1"
    assert payload["title"] == "Clinical Burden"
    assert len(payload["evidence"]) >= 1
    assert len(payload["citations"]) >= 1


def test_v1_aawe_selection_insight_returns_result_payload(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.get("/v1/aawe/insights/result/RES-001")

    assert response.status_code == 200
    payload = response.json()
    assert payload["selection_type"] == "result"
    assert payload["item_id"] == "RES-001"
    assert payload["derivation"]["dataset"] == "HF Registry v2025.2"


def test_v1_aawe_selection_insight_returns_404_for_missing_item(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.get("/v1/aawe/insights/result/missing-id")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "message": "Resource not found",
            "type": "not_found",
            "detail": "No insight payload found for result 'missing-id'.",
        }
    }


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


def test_v1_create_list_and_restore_manuscript_snapshot(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Snapshot Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "snapshot-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]

        seeded_response = client.patch(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}",
            json={
                "sections": {
                    "methods": "Original methods snapshot content",
                    "results": "Original results snapshot content",
                }
            },
        )
        create_snapshot_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots",
            json={"label": "Baseline before edits"},
        )
        snapshot_id = create_snapshot_response.json()["id"]
        list_snapshots_response = client.get(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots"
        )

        client.patch(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}",
            json={"sections": {"methods": "Changed methods content"}},
        )
        restore_response = client.post(
            (
                f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots/"
                f"{snapshot_id}/restore"
            )
        )

    assert seeded_response.status_code == 200
    assert create_snapshot_response.status_code == 200
    snapshot_payload = create_snapshot_response.json()
    assert snapshot_payload["label"] == "Baseline before edits"
    assert snapshot_payload["sections"]["methods"] == "Original methods snapshot content"

    assert list_snapshots_response.status_code == 200
    assert len(list_snapshots_response.json()) == 1
    assert list_snapshots_response.json()[0]["id"] == snapshot_id

    assert restore_response.status_code == 200
    restored_sections = restore_response.json()["sections"]
    assert restored_sections["methods"] == "Original methods snapshot content"
    assert restored_sections["results"] == "Original results snapshot content"


def test_v1_restore_snapshot_returns_404_for_missing_snapshot(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Missing Snapshot Project",
                "target_journal": "jacc",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "snapshot-missing-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        response = client.post(
            (
                f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots/"
                "missing-snapshot-id/restore"
            )
        )

    assert response.status_code == 404
    assert response.json()["error"]["type"] == "not_found"


def test_v1_restore_snapshot_merge_mode_and_section_filter(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Snapshot Merge Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "snapshot-merge-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]

        client.patch(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}",
            json={
                "sections": {
                    "methods": "methods baseline",
                    "results": "results baseline",
                    "discussion": "discussion baseline",
                }
            },
        )
        snapshot_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots",
            json={
                "label": "Merge baseline",
                "include_sections": ["methods", "results"],
            },
        )
        snapshot_id = snapshot_response.json()["id"]

        client.patch(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}",
            json={
                "sections": {
                    "methods": "methods current",
                    "results": "results current",
                    "discussion": "discussion current",
                }
            },
        )
        restore_response = client.post(
            (
                f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots/"
                f"{snapshot_id}/restore"
            ),
            json={
                "mode": "merge",
                "sections": ["methods"],
            },
        )

    assert snapshot_response.status_code == 200
    assert restore_response.status_code == 200
    restored_sections = restore_response.json()["sections"]
    assert restored_sections["methods"] == "methods baseline"
    assert restored_sections["results"] == "results current"
    assert restored_sections["discussion"] == "discussion current"


def test_v1_restore_snapshot_returns_409_for_invalid_mode(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Snapshot Invalid Mode Project",
                "target_journal": "jacc",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "snapshot-invalid-mode-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        snapshot_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots",
            json={"label": "Any snapshot"},
        )
        snapshot_id = snapshot_response.json()["id"]
        response = client.post(
            (
                f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots/"
                f"{snapshot_id}/restore"
            ),
            json={"mode": "invalid-mode"},
        )

    assert snapshot_response.status_code == 200
    assert response.status_code == 409
    assert response.json()["error"]["type"] == "conflict"
    assert "replace" in response.json()["error"]["detail"]
    assert "merge" in response.json()["error"]["detail"]


def test_v1_export_manuscript_markdown_filters_empty_sections_by_default(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Export Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "export-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        client.patch(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}",
            json={
                "sections": {
                    "methods": "Methods text for export.",
                    "results": "",
                }
            },
        )

        response = client.get(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/export/markdown"
        )

    assert response.status_code == 200
    assert "text/markdown" in response.headers["content-type"]
    assert "attachment; filename=" in response.headers["content-disposition"]
    body = response.text
    assert "# Export Project" in body
    assert "## Methods" in body
    assert "Methods text for export." in body
    assert "## Results" not in body


def test_v1_export_manuscript_markdown_can_include_empty_sections(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Export Empty Sections Project",
                "target_journal": "jacc",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "export-empty-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        response = client.get(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/export/markdown",
            params={"include_empty": True},
        )

    assert response.status_code == 200
    body = response.text
    assert "## Title" in body
    assert "_No content provided._" in body


def test_v1_export_manuscript_markdown_returns_404_for_missing_manuscript(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Export Missing Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        response = client.get(
            f"/v1/projects/{project_id}/manuscripts/missing/export/markdown"
        )

    assert response.status_code == 404
    assert response.json()["error"]["type"] == "not_found"


def test_v1_generate_manuscript_job_completes_and_updates_sections(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    def _mock_draft(section: str, notes: str) -> str:
        assert notes == "Core trial notes"
        return f"{section} draft content"

    monkeypatch.setattr(
        "research_os.services.generation_job_service.draft_section_from_notes",
        _mock_draft,
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Async Generation Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "async-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        enqueue_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            json={
                "sections": ["introduction", "results"],
                "notes_context": "Core trial notes",
            },
        )
        job_id = enqueue_response.json()["id"]
        terminal_payload = _wait_for_job_terminal_status(client, job_id)
        manuscript_fetch = client.get(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}"
        )

    assert enqueue_response.status_code == 200
    _assert_job_cost_estimates(enqueue_response.json())
    assert terminal_payload["status"] == "completed"
    assert terminal_payload["progress_percent"] == 100
    assert terminal_payload["error_detail"] is None
    _assert_job_cost_estimates(terminal_payload)

    assert manuscript_fetch.status_code == 200
    sections = manuscript_fetch.json()["sections"]
    assert sections["introduction"] == "introduction draft content"
    assert sections["results"] == "results draft content"


def test_v1_generate_manuscript_job_fails_and_keeps_partial_progress(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    def _mock_draft(section: str, _: str) -> str:
        if section == "results":
            raise RuntimeError("Model timeout")
        return f"{section} draft content"

    monkeypatch.setattr(
        "research_os.services.generation_job_service.draft_section_from_notes",
        _mock_draft,
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Async Failure Project",
                "target_journal": "jacc",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "failing-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        enqueue_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            json={
                "sections": ["introduction", "results", "discussion"],
                "notes_context": "Failure notes",
            },
        )
        job_id = enqueue_response.json()["id"]
        terminal_payload = _wait_for_job_terminal_status(client, job_id)
        manuscript_fetch = client.get(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}"
        )

    assert enqueue_response.status_code == 200
    _assert_job_cost_estimates(enqueue_response.json())
    assert terminal_payload["status"] == "failed"
    assert "Model timeout" in (terminal_payload["error_detail"] or "")
    assert terminal_payload["progress_percent"] < 100
    _assert_job_cost_estimates(terminal_payload)

    assert manuscript_fetch.status_code == 200
    sections = manuscript_fetch.json()["sections"]
    assert sections["introduction"] == "introduction draft content"
    assert sections["discussion"] == ""


def test_v1_get_generation_job_returns_404_for_missing_job(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        response = client.get("/v1/generation-jobs/missing-job")

    assert response.status_code == 404
    assert response.json()["error"]["type"] == "not_found"


def test_v1_list_generation_jobs_returns_recent_jobs_for_manuscript(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.services.generation_job_service._start_generation_thread",
        lambda _: None,
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "History Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "history-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]

        first_enqueue = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            json={
                "sections": ["methods"],
                "notes_context": "History run one",
            },
        )
        first_job_id = first_enqueue.json()["id"]
        cancel_first = client.post(f"/v1/generation-jobs/{first_job_id}/cancel")
        second_enqueue = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            json={
                "sections": ["results"],
                "notes_context": "History run two",
            },
        )
        list_response = client.get(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generation-jobs",
            params={"limit": 1},
        )

    assert first_enqueue.status_code == 200
    assert cancel_first.status_code == 200
    assert second_enqueue.status_code == 200
    assert list_response.status_code == 200
    payload = list_response.json()
    assert len(payload) == 1
    assert payload[0]["id"] == second_enqueue.json()["id"]
    assert payload[0]["notes_context"] == "History run two"


def test_v1_list_generation_jobs_returns_404_for_missing_project_or_manuscript(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        missing_project_response = client.get(
            "/v1/projects/missing/manuscripts/missing/generation-jobs"
        )
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Missing Manuscript History Project",
                "target_journal": "jacc",
            },
        )
        project_id = project_response.json()["id"]
        missing_manuscript_response = client.get(
            f"/v1/projects/{project_id}/manuscripts/missing/generation-jobs"
        )

    assert missing_project_response.status_code == 404
    assert missing_project_response.json()["error"]["type"] == "not_found"
    assert missing_manuscript_response.status_code == 404
    assert missing_manuscript_response.json()["error"]["type"] == "not_found"


def test_v1_generate_manuscript_returns_409_when_per_job_budget_exceeded(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Budget Exceeded Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "budget-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            json={
                "sections": ["methods"],
                "notes_context": "Core trial notes with details",
                "max_estimated_cost_usd": 0.00001,
            },
        )

    assert response.status_code == 409
    assert response.json()["error"]["type"] == "conflict"
    assert "per-job cap" in response.json()["error"]["detail"]


def test_v1_generate_manuscript_returns_409_when_daily_budget_exceeded(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.services.generation_job_service._start_generation_thread",
        lambda _: None,
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Daily Budget Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "daily-budget-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        first_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            json={
                "sections": ["methods"],
                "notes_context": ("Detailed trial notes " * 20).strip(),
            },
        )
        second_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            json={
                "sections": ["results"],
                "notes_context": ("Detailed trial notes " * 20).strip(),
                "project_daily_budget_usd": 0.001,
            },
        )

    assert first_response.status_code == 200
    assert second_response.status_code == 409
    assert second_response.json()["error"]["type"] == "conflict"
    assert "daily budget" in second_response.json()["error"]["detail"]


def test_v1_generate_manuscript_returns_409_when_job_already_active(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.services.generation_job_service._start_generation_thread",
        lambda _: None,
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Conflict Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "conflict-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        first_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            json={
                "sections": ["methods"],
                "notes_context": "Queued generation",
            },
        )
        second_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            json={
                "sections": ["results"],
                "notes_context": "Second generation request",
            },
        )

    assert first_response.status_code == 200
    assert second_response.status_code == 409
    assert second_response.json()["error"]["type"] == "conflict"
    assert "already active" in second_response.json()["error"]["detail"]


def test_v1_cancel_generation_job_marks_queued_job_cancelled(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.services.generation_job_service._start_generation_thread",
        lambda _: None,
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Cancel Job Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "cancel-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        enqueue_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            json={
                "sections": ["methods"],
                "notes_context": "Cancel this before running",
            },
        )
        job_id = enqueue_response.json()["id"]
        cancel_response = client.post(f"/v1/generation-jobs/{job_id}/cancel")
        fetch_response = client.get(f"/v1/generation-jobs/{job_id}")

    assert enqueue_response.status_code == 200
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"
    assert fetch_response.status_code == 200
    assert fetch_response.json()["status"] == "cancelled"


def test_v1_retry_generation_job_enqueues_new_run_after_failure(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    def _fail_draft(_: str, __: str) -> str:
        raise RuntimeError("Model crash")

    monkeypatch.setattr(
        "research_os.services.generation_job_service.draft_section_from_notes",
        _fail_draft,
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Retry Job Project",
                "target_journal": "ehj",
            },
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "retry-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        failed_enqueue = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            json={
                "sections": ["methods"],
                "notes_context": "Fail then retry",
            },
        )
        failed_job_id = failed_enqueue.json()["id"]
        failed_terminal = _wait_for_job_terminal_status(client, failed_job_id)
        assert failed_terminal["status"] == "failed"

        def _success_draft(section: str, _: str) -> str:
            return f"{section} regenerated"

        monkeypatch.setattr(
            "research_os.services.generation_job_service.draft_section_from_notes",
            _success_draft,
        )

        retry_response = client.post(
            f"/v1/generation-jobs/{failed_job_id}/retry",
            json={},
        )
        retried_job_id = retry_response.json()["id"]
        retry_terminal = _wait_for_job_terminal_status(client, retried_job_id)

    assert failed_enqueue.status_code == 200
    assert retry_response.status_code == 200
    assert retry_response.json()["parent_job_id"] == failed_job_id
    assert retry_response.json()["run_count"] == 2
    assert retry_terminal["status"] == "completed"


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

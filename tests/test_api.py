import base64
import time

from fastapi.testclient import TestClient

from research_os.api.app import app
from research_os.db import GenerationJob, User, reset_database_state, session_scope
from research_os.services.persona_service import upsert_work


def _set_test_environment(monkeypatch, tmp_path) -> None:
    import research_os.api.app as api_module

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    api_module._AUTH_RATE_LIMIT_EVENTS.clear()
    reset_database_state()


def _wait_for_job_terminal_status(
    client: TestClient, job_id: str, timeout_seconds: float = 5.0
):
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        response = client.get(f"/v1/generation-jobs/{job_id}")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] in {"completed", "failed", "cancelled"}:
            return payload
        time.sleep(0.05)
    raise AssertionError(f"Generation job '{job_id}' did not reach terminal state.")


def _assert_job_cost_estimates(payload: dict) -> None:
    assert payload["estimated_input_tokens"] > 0
    assert payload["estimated_output_tokens_low"] > 0
    assert (
        payload["estimated_output_tokens_high"]
        >= payload["estimated_output_tokens_low"]
    )
    assert payload["estimated_cost_usd_low"] >= 0
    assert payload["estimated_cost_usd_high"] >= payload["estimated_cost_usd_low"]
    assert payload["pricing_model"] == "gpt-4.1-mini"


def _set_citation_state(monkeypatch) -> None:
    monkeypatch.setattr(
        "research_os.services.citation_service._CLAIM_CITATION_IDS",
        {
            "intro-p1": ["CIT-002", "CIT-005"],
            "methods-p1": ["CIT-003"],
            "results-p1": ["CIT-001"],
            "discussion-p1": ["CIT-004"],
        },
    )


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _promote_user_to_admin(user_id: str) -> None:
    with session_scope() as session:
        user = session.get(User, user_id)
        assert user is not None
        user.role = "admin"


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


def test_v1_health_ready_returns_ok(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.get("/v1/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


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


def test_v1_library_asset_upload_returns_400_when_multipart_parser_unavailable(
    monkeypatch, tmp_path
) -> None:
    from starlette.requests import Request as StarletteRequest

    _set_test_environment(monkeypatch, tmp_path)

    async def _broken_form(self):  # pragma: no cover - exercised via endpoint
        raise AssertionError("python-multipart missing")

    monkeypatch.setattr(StarletteRequest, "form", _broken_form)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "library-upload-user@example.com",
                "password": "StrongPassword123",
                "name": "Library Upload User",
            },
        )
        assert register_response.status_code == 200
        headers = _auth_headers(register_response.json()["session_token"])
        response = client.post(
            "/v1/library/assets/upload",
            headers=headers,
            files={"files": ("sample.csv", b"a,b\n1,2\n", "text/csv")},
        )

    assert response.status_code == 400
    assert response.json()["error"]["type"] == "bad_request"
    assert "Multipart parsing is unavailable" in response.json()["error"]["detail"]


def test_v1_library_asset_routes_require_session_token(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    encoded = base64.b64encode(b"a,b\n1,2\n").decode("ascii")

    with TestClient(app) as client:
        upload_response = client.post(
            "/v1/library/assets/upload",
            json={
                "files": [
                    {
                        "filename": "sample.csv",
                        "mime_type": "text/csv",
                        "content_base64": encoded,
                    }
                ]
            },
        )
        list_response = client.get("/v1/library/assets")
        patch_response = client.patch(
            "/v1/library/assets/asset-unknown/access",
            json={"collaborator_user_ids": []},
        )
        download_response = client.get("/v1/library/assets/asset-unknown/download")

    assert upload_response.status_code == 401
    assert list_response.status_code == 401
    assert patch_response.status_code == 401
    assert download_response.status_code == 401


def test_v1_library_asset_routes_ignore_sentinel_project_ids(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    encoded = base64.b64encode(b"a,b\n1,2\n").decode("ascii")

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "library-sentinel-user@example.com",
                "password": "StrongPassword123",
                "name": "Library Sentinel User",
            },
        )
        assert register_response.status_code == 200
        headers = _auth_headers(register_response.json()["session_token"])

        upload_none = client.post(
            "/v1/library/assets/upload",
            headers=headers,
            json={
                "project_id": "None",
                "files": [
                    {
                        "filename": "none-sentinel.csv",
                        "mime_type": "text/csv",
                        "content_base64": encoded,
                    }
                ],
            },
        )
        upload_null = client.post(
            "/v1/library/assets/upload",
            headers=headers,
            json={
                "project_id": "null",
                "files": [
                    {
                        "filename": "null-sentinel.csv",
                        "mime_type": "text/csv",
                        "content_base64": encoded,
                    }
                ],
            },
        )
        assert upload_none.status_code == 200
        assert upload_null.status_code == 200

        list_none = client.get(
            "/v1/library/assets",
            headers=headers,
            params={"project_id": "None"},
        )
        list_null = client.get(
            "/v1/library/assets",
            headers=headers,
            params={"project_id": "null"},
        )
        assert list_none.status_code == 200
        assert list_null.status_code == 200
        assert list_none.json()["total"] == 2
        assert list_null.json()["total"] == 2
        assert all(item["project_id"] is None for item in list_none.json()["items"])


def test_v1_library_asset_access_controls_and_download(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    file_bytes = b"patient_id,value\nP001,12\nP002,15\n"
    encoded = base64.b64encode(file_bytes).decode("ascii")

    with TestClient(app) as client:
        owner_register = client.post(
            "/v1/auth/register",
            json={
                "email": "library-owner@example.com",
                "password": "StrongPassword123",
                "name": "Library Owner",
            },
        )
        collaborator_register = client.post(
            "/v1/auth/register",
            json={
                "email": "library-collab@example.com",
                "password": "StrongPassword123",
                "name": "Library Collaborator",
            },
        )
        outsider_register = client.post(
            "/v1/auth/register",
            json={
                "email": "library-outsider@example.com",
                "password": "StrongPassword123",
                "name": "Library Outsider",
            },
        )
        assert owner_register.status_code == 200
        assert collaborator_register.status_code == 200
        assert outsider_register.status_code == 200

        owner_headers = _auth_headers(owner_register.json()["session_token"])
        collaborator_headers = _auth_headers(collaborator_register.json()["session_token"])
        outsider_headers = _auth_headers(outsider_register.json()["session_token"])

        owner_me = client.get("/v1/auth/me", headers=owner_headers)
        collaborator_me = client.get("/v1/auth/me", headers=collaborator_headers)
        assert owner_me.status_code == 200
        assert collaborator_me.status_code == 200
        owner_user_id = owner_me.json()["id"]
        collaborator_user_id = collaborator_me.json()["id"]

        create_project = client.post(
            "/v1/projects",
            headers=owner_headers,
            json={
                "title": "Library ACL Project",
                "target_journal": "ehj",
                "collaborator_user_ids": [collaborator_user_id],
            },
        )
        assert create_project.status_code == 200
        project_id = create_project.json()["id"]

        upload_response = client.post(
            "/v1/library/assets/upload",
            headers=owner_headers,
            json={
                "project_id": project_id,
                "files": [
                    {
                        "filename": "workspace-dataset.csv",
                        "mime_type": "text/csv",
                        "content_base64": encoded,
                    }
                ],
            },
        )
        assert upload_response.status_code == 200
        asset_id = upload_response.json()["asset_ids"][0]

        owner_assets = client.get(
            "/v1/library/assets",
            headers=owner_headers,
            params={"project_id": project_id},
        )
        collaborator_assets = client.get(
            "/v1/library/assets",
            headers=collaborator_headers,
            params={"project_id": project_id},
        )
        assert owner_assets.status_code == 200
        assert collaborator_assets.status_code == 200
        assert owner_assets.json()["total"] == 1
        assert collaborator_assets.json()["total"] == 1
        owner_asset_payload = owner_assets.json()["items"][0]
        collaborator_asset_payload = collaborator_assets.json()["items"][0]
        assert owner_asset_payload["id"] == asset_id
        assert owner_asset_payload["owner_user_id"] == owner_user_id
        assert owner_asset_payload["owner_name"] == "Library Owner"
        assert collaborator_user_id in owner_asset_payload["shared_with_user_ids"]
        assert owner_asset_payload["can_manage_access"] is True
        assert collaborator_asset_payload["can_manage_access"] is False

        collaborator_patch_attempt = client.patch(
            f"/v1/library/assets/{asset_id}/access",
            headers=collaborator_headers,
            json={"collaborator_user_ids": [collaborator_user_id]},
        )
        assert collaborator_patch_attempt.status_code == 400
        assert (
            "Only the asset owner can manage file access."
            in collaborator_patch_attempt.json()["error"]["detail"]
        )

        collaborator_download_before = client.get(
            f"/v1/library/assets/{asset_id}/download",
            headers=collaborator_headers,
        )
        assert collaborator_download_before.status_code == 200
        assert collaborator_download_before.content == file_bytes

        remove_access = client.patch(
            f"/v1/library/assets/{asset_id}/access",
            headers=owner_headers,
            json={"collaborator_user_ids": []},
        )
        assert remove_access.status_code == 200
        assert remove_access.json()["shared_with_user_ids"] == []

        collaborator_assets_after_removal = client.get(
            "/v1/library/assets",
            headers=collaborator_headers,
            params={"project_id": project_id},
        )
        assert collaborator_assets_after_removal.status_code == 200
        assert collaborator_assets_after_removal.json()["items"] == []
        assert collaborator_assets_after_removal.json()["total"] == 0

        collaborator_download_after = client.get(
            f"/v1/library/assets/{asset_id}/download",
            headers=collaborator_headers,
        )
        assert collaborator_download_after.status_code == 404

        add_access_by_name = client.patch(
            f"/v1/library/assets/{asset_id}/access",
            headers=owner_headers,
            json={
                "collaborator_user_ids": [],
                "collaborator_names": ["Library Collaborator"],
            },
        )
        assert add_access_by_name.status_code == 200
        assert collaborator_user_id in add_access_by_name.json()["shared_with_user_ids"]

        collaborator_download_after_add = client.get(
            f"/v1/library/assets/{asset_id}/download",
            headers=collaborator_headers,
        )
        assert collaborator_download_after_add.status_code == 200
        assert collaborator_download_after_add.content == file_bytes

        owner_download = client.get(
            f"/v1/library/assets/{asset_id}/download",
            headers=owner_headers,
        )
        assert owner_download.status_code == 200
        assert owner_download.content == file_bytes

        outsider_assets = client.get("/v1/library/assets", headers=outsider_headers)
        assert outsider_assets.status_code == 200
        assert outsider_assets.json()["items"] == []
        assert outsider_assets.json()["total"] == 0


def test_v1_library_assets_support_server_pagination_sort_and_filters(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        owner_register = client.post(
            "/v1/auth/register",
            json={
                "email": "library-page-owner@example.com",
                "password": "StrongPassword123",
                "name": "Library Page Owner",
            },
        )
        collaborator_register = client.post(
            "/v1/auth/register",
            json={
                "email": "library-page-collab@example.com",
                "password": "StrongPassword123",
                "name": "Library Page Collaborator",
            },
        )
        assert owner_register.status_code == 200
        assert collaborator_register.status_code == 200
        owner_headers = _auth_headers(owner_register.json()["session_token"])
        collaborator_headers = _auth_headers(collaborator_register.json()["session_token"])

        collaborator_user_id = client.get("/v1/auth/me", headers=collaborator_headers).json()[
            "id"
        ]
        project_response = client.post(
            "/v1/projects",
            headers=owner_headers,
            json={
                "title": "Library Paging Project",
                "target_journal": "ehj",
                "collaborator_user_ids": [collaborator_user_id],
            },
        )
        assert project_response.status_code == 200
        project_id = project_response.json()["id"]

        uploads = [
            ("zeta_notes.csv", b"col\n111\n"),
            ("alpha_trial.csv", b"col\n1\n2\n3\n"),
            ("beta_trial.csv", b"col\n9\n"),
            ("gamma_dictionary.csv", b"field,value\nx,1\n"),
        ]
        for filename, content in uploads:
            encoded = base64.b64encode(content).decode("ascii")
            upload_response = client.post(
                "/v1/library/assets/upload",
                headers=owner_headers,
                json={
                    "project_id": project_id,
                    "files": [
                        {
                            "filename": filename,
                            "mime_type": "text/csv",
                            "content_base64": encoded,
                        }
                    ],
                },
            )
            assert upload_response.status_code == 200

        owner_page_1 = client.get(
            "/v1/library/assets",
            headers=owner_headers,
            params={
                "project_id": project_id,
                "ownership": "owned",
                "sort_by": "filename",
                "sort_direction": "asc",
                "page": 1,
                "page_size": 2,
            },
        )
        assert owner_page_1.status_code == 200
        owner_page_1_payload = owner_page_1.json()
        assert owner_page_1_payload["total"] == 4
        assert owner_page_1_payload["page"] == 1
        assert owner_page_1_payload["page_size"] == 2
        assert owner_page_1_payload["has_more"] is True
        assert [item["filename"] for item in owner_page_1_payload["items"]] == [
            "alpha_trial.csv",
            "beta_trial.csv",
        ]

        owner_page_2 = client.get(
            "/v1/library/assets",
            headers=owner_headers,
            params={
                "project_id": project_id,
                "ownership": "owned",
                "sort_by": "filename",
                "sort_direction": "asc",
                "page": 2,
                "page_size": 2,
            },
        )
        assert owner_page_2.status_code == 200
        owner_page_2_payload = owner_page_2.json()
        assert owner_page_2_payload["has_more"] is False
        assert [item["filename"] for item in owner_page_2_payload["items"]] == [
            "gamma_dictionary.csv",
            "zeta_notes.csv",
        ]

        owner_query = client.get(
            "/v1/library/assets",
            headers=owner_headers,
            params={
                "project_id": project_id,
                "query": "trial",
                "sort_by": "filename",
                "sort_direction": "asc",
                "page": 1,
                "page_size": 10,
            },
        )
        assert owner_query.status_code == 200
        owner_query_payload = owner_query.json()
        assert owner_query_payload["total"] == 2
        assert [item["filename"] for item in owner_query_payload["items"]] == [
            "alpha_trial.csv",
            "beta_trial.csv",
        ]

        collaborator_shared = client.get(
            "/v1/library/assets",
            headers=collaborator_headers,
            params={
                "project_id": project_id,
                "ownership": "shared",
                "sort_by": "filename",
                "sort_direction": "asc",
                "page": 1,
                "page_size": 10,
            },
        )
        assert collaborator_shared.status_code == 200
        collaborator_shared_payload = collaborator_shared.json()
        assert collaborator_shared_payload["total"] == 4
        assert all(item["can_manage_access"] is False for item in collaborator_shared_payload["items"])

        collaborator_owned = client.get(
            "/v1/library/assets",
            headers=collaborator_headers,
            params={
                "project_id": project_id,
                "ownership": "owned",
            },
        )
        assert collaborator_owned.status_code == 200
        assert collaborator_owned.json()["total"] == 0
        assert collaborator_owned.json()["items"] == []


def test_v1_library_assets_persist_across_logout_and_login(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    encoded = base64.b64encode(b"col_a,col_b\n1,2\n").decode("ascii")
    email = "library-persist-user@example.com"
    password = "StrongPassword123"

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": email,
                "password": password,
                "name": "Library Persist User",
            },
        )
        assert register_response.status_code == 200
        first_token = register_response.json()["session_token"]
        first_headers = _auth_headers(first_token)

        upload_response = client.post(
            "/v1/library/assets/upload",
            headers=first_headers,
            json={
                "files": [
                    {
                        "filename": "persist-after-login.csv",
                        "mime_type": "text/csv",
                        "content_base64": encoded,
                    }
                ]
            },
        )
        assert upload_response.status_code == 200
        uploaded_asset_id = upload_response.json()["asset_ids"][0]

        logout_response = client.post("/v1/auth/logout", headers=first_headers)
        assert logout_response.status_code == 200

        login_response = client.post(
            "/v1/auth/login",
            json={"email": email, "password": password},
        )
        assert login_response.status_code == 200
        second_token = login_response.json()["session_token"]
        second_headers = _auth_headers(second_token)

        list_response = client.get("/v1/library/assets", headers=second_headers)
        assert list_response.status_code == 200
        payload = list_response.json()
        listed_ids = [item["id"] for item in payload["items"]]
        assert uploaded_asset_id in listed_ids


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


def test_v1_run_aawe_qc_returns_summary(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.post("/v1/aawe/qc/run")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_findings"] > 0
    assert payload["high_severity_count"] >= 0
    assert payload["medium_severity_count"] >= 0
    assert payload["low_severity_count"] >= 0
    assert len(payload["issues"]) >= 1
    assert payload["issues"][0]["severity"] in {"high", "medium", "low"}


def test_v1_list_aawe_citations_supports_query_filter(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.get("/v1/aawe/citations", params={"q": "tripod", "limit": 10})

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 1
    assert payload[0]["id"] == "CIT-001"


def test_v1_get_aawe_claim_citations_returns_attachment_state(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _set_citation_state(monkeypatch)

    with TestClient(app) as client:
        response = client.get(
            "/v1/aawe/claims/intro-p1/citations",
            params={"required_slots": 3},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["claim_id"] == "intro-p1"
    assert payload["attached_citation_ids"] == ["CIT-002", "CIT-005"]
    assert payload["missing_slots"] == 1


def test_v1_put_aawe_claim_citations_updates_claim_state(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _set_citation_state(monkeypatch)

    with TestClient(app) as client:
        update_response = client.put(
            "/v1/aawe/claims/methods-p1/citations",
            json={
                "citation_ids": ["CIT-001", "CIT-003", "CIT-001"],
                "required_slots": 2,
            },
        )
        get_response = client.get(
            "/v1/aawe/claims/methods-p1/citations",
            params={"required_slots": 3},
        )

    assert update_response.status_code == 200
    update_payload = update_response.json()
    assert update_payload["attached_citation_ids"] == ["CIT-001", "CIT-003"]
    assert update_payload["missing_slots"] == 0

    assert get_response.status_code == 200
    get_payload = get_response.json()
    assert get_payload["attached_citation_ids"] == ["CIT-001", "CIT-003"]
    assert get_payload["missing_slots"] == 1


def test_v1_put_aawe_claim_citations_returns_404_for_unknown_citation(
    monkeypatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _set_citation_state(monkeypatch)

    with TestClient(app) as client:
        response = client.put(
            "/v1/aawe/claims/intro-p1/citations",
            json={
                "citation_ids": ["CIT-999"],
                "required_slots": 1,
            },
        )

    assert response.status_code == 404
    assert response.json()["error"]["type"] == "not_found"
    assert "Unknown citation IDs: CIT-999" in response.json()["error"]["detail"]


def test_v1_export_aawe_citations_returns_references_text(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _set_citation_state(monkeypatch)

    with TestClient(app) as client:
        response = client.post(
            "/v1/aawe/citations/export",
            json={"claim_id": "intro-p1"},
        )

    assert response.status_code == 200
    assert 'attachment; filename="aawe-references.txt"' in response.headers.get(
        "content-disposition", ""
    )
    assert "# AAWE References Export" in response.text
    assert (
        "McDonagh TA, Metra M, Adamo M, et al. Eur Heart J. 2023;44:3599-3726."
        in response.text
    )


def test_v1_aawe_selection_insight_reflects_claim_citation_updates(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _set_citation_state(monkeypatch)

    with TestClient(app) as client:
        update_response = client.put(
            "/v1/aawe/claims/intro-p1/citations",
            json={"citation_ids": ["CIT-003"], "required_slots": 2},
        )
        insight_response = client.get("/v1/aawe/insights/claim/intro-p1")

    assert update_response.status_code == 200
    assert insight_response.status_code == 200
    payload = insight_response.json()
    assert payload["citations"] == [
        "Harrell FE. Regression Modeling Strategies. Springer; 2024."
    ]
    assert any("1 citation slot still open." == note for note in payload["qc"])


def test_v1_estimate_aawe_generation_returns_cost_projection(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.post(
            "/v1/aawe/generation/estimate",
            json={
                "sections": ["methods", "results"],
                "notes_context": "HF cohort with adjusted Cox and logistic models.",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["pricing_model"] == "gpt-4.1-mini"
    assert payload["estimated_cost_usd_high"] >= payload["estimated_cost_usd_low"]
    assert (
        payload["estimated_output_tokens_high"]
        >= payload["estimated_output_tokens_low"]
    )


def test_v1_plan_aawe_sections_returns_section_plan(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.post(
            "/v1/aawe/plan/sections",
            json={
                "target_journal": "ehj",
                "answers": {
                    "disease_focus": "Heart failure",
                    "population": "Adults with index HF admission",
                    "primary_outcome": "90-day readmission",
                    "analysis_summary": "Adjusted Cox with calibration checks.",
                    "key_findings": "Lower readmission with intervention.",
                    "manuscript_goal": "generate_full_manuscript",
                    "data_source": "manual_entry",
                },
                "sections": ["introduction", "methods", "results"],
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["inferred_study_type"] in {"observational", "cohort"}
    assert len(payload["items"]) == 3
    assert payload["items"][0]["section"] == "introduction"
    assert (
        payload["total_estimated_cost_usd_high"]
        >= payload["total_estimated_cost_usd_low"]
    )


def test_v1_generate_aawe_grounded_draft_returns_generated_payload(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    def _mock_grounded_draft(**kwargs) -> dict[str, object]:
        assert kwargs["section"] == "results"
        assert kwargs["style_profile"] == "concise"
        assert kwargs["generation_mode"] == "targeted"
        assert kwargs["target_instruction"] == "Tighten causal language."
        return {
            "section": "results",
            "style_profile": "concise",
            "generation_mode": "targeted",
            "draft": "Revised results text [E1].",
            "passes": [
                {"name": "targeted_edit", "content": "Revised draft [E1]."},
                {"name": "polish", "content": "Revised results text [E1]."},
            ],
            "evidence_anchor_labels": ["Primary adjusted model output"],
            "citation_ids": ["CIT-001"],
            "unsupported_sentences": [],
        }

    monkeypatch.setattr(
        "research_os.api.app.generate_grounded_section_draft",
        _mock_grounded_draft,
    )

    with TestClient(app) as client:
        response = client.post(
            "/v1/aawe/draft/grounded",
            json={
                "section": "results",
                "notes_context": "Primary endpoint favored intervention arm.",
                "style_profile": "concise",
                "generation_mode": "targeted",
                "plan_objective": "Summarize adjusted primary result.",
                "must_include": ["Adjusted effect estimate"],
                "evidence_links": [
                    {
                        "claim_id": "results-p1",
                        "claim_heading": "Primary Endpoint Signal",
                        "result_id": "RES-001",
                        "confidence": "high",
                        "rationale": "Claim maps to adjusted Cox output.",
                        "suggested_anchor_label": "Primary adjusted model output",
                    }
                ],
                "citation_ids": ["CIT-001"],
                "target_instruction": "Tighten causal language.",
                "locked_text": "Previous section draft [E1].",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["section"] == "results"
    assert payload["style_profile"] == "concise"
    assert payload["generation_mode"] == "targeted"
    assert payload["persisted"] is False
    assert payload["draft"] == "Revised results text [E1]."
    assert payload["citation_ids"] == ["CIT-001"]
    assert payload["manuscript"] is None


def test_v1_generate_aawe_grounded_draft_returns_400_for_missing_target_instruction(
    monkeypatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.post(
            "/v1/aawe/draft/grounded",
            json={
                "section": "discussion",
                "notes_context": "Interpretation notes.",
                "generation_mode": "targeted",
            },
        )

    assert response.status_code == 400
    assert response.json() == {
        "error": {
            "message": "Bad request",
            "type": "bad_request",
            "detail": "target_instruction is required when generation_mode is 'targeted'.",
        }
    }


def test_v1_generate_aawe_grounded_draft_persists_section_when_requested(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        "research_os.api.app.generate_grounded_section_draft",
        lambda **_: {
            "section": "methods",
            "style_profile": "technical",
            "generation_mode": "full",
            "draft": "Methods draft with anchors [E1] [CIT-003].",
            "passes": [
                {
                    "name": "polish",
                    "content": "Methods draft with anchors [E1] [CIT-003].",
                }
            ],
            "evidence_anchor_labels": ["Adjusted denominator compatibility"],
            "citation_ids": ["CIT-003"],
            "unsupported_sentences": [],
        },
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={"title": "Grounded Draft Project", "target_journal": "ehj"},
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "grounded-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]

        draft_response = client.post(
            "/v1/aawe/draft/grounded",
            json={
                "section": "methods",
                "notes_context": "Eligibility logic and adjusted model design.",
                "persist_to_manuscript": True,
                "project_id": project_id,
                "manuscript_id": manuscript_id,
            },
        )
        manuscript_fetch = client.get(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}"
        )

    assert draft_response.status_code == 200
    payload = draft_response.json()
    assert payload["persisted"] is True
    assert payload["manuscript"]["id"] == manuscript_id
    assert (
        payload["manuscript"]["sections"]["methods"]
        == "Methods draft with anchors [E1] [CIT-003]."
    )

    assert manuscript_fetch.status_code == 200
    assert (
        manuscript_fetch.json()["sections"]["methods"]
        == "Methods draft with anchors [E1] [CIT-003]."
    )


def test_v1_synthesize_title_abstract_persists_to_manuscript(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.api.app.synthesize_title_and_abstract",
        lambda **_: {
            "title": "Intervention and 90-day Readmission in Heart Failure Cohort",
            "abstract": "Background and methods synthesized abstract text.",
        },
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={"title": "Synthesis Project", "target_journal": "ehj"},
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "synthesis-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        patch_response = client.patch(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}",
            json={
                "sections": {
                    "introduction": "HF readmission burden remains high.",
                    "methods": "Adults were analyzed with adjusted Cox models.",
                    "results": "Readmission risk was lower in intervention arm.",
                    "discussion": "Findings aligned with contemporary programs.",
                }
            },
        )
        assert patch_response.status_code == 200

        synthesis_response = client.post(
            f"/v1/aawe/projects/{project_id}/manuscripts/{manuscript_id}/synthesize/title-abstract",
            json={"style_profile": "technical", "persist_to_manuscript": True},
        )
        manuscript_fetch = client.get(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}"
        )

    assert synthesis_response.status_code == 200
    payload = synthesis_response.json()
    assert payload["persisted"] is True
    assert payload["title"].startswith("Intervention")
    assert "synthesized abstract" in payload["abstract"]

    assert manuscript_fetch.status_code == 200
    sections = manuscript_fetch.json()["sections"]
    assert sections["title"] == payload["title"]
    assert sections["abstract"] == payload["abstract"]


def test_v1_generate_submission_pack_returns_cover_letter_and_bullets(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.api.app.build_submission_pack",
        lambda **_: {
            "run_id": "spk-test1234",
            "generated_at": "2026-02-20T20:00:00Z",
            "target_journal": "ehj",
            "style_profile": "technical",
            "cover_letter": "Please consider our manuscript for publication.",
            "key_points": [
                "Intervention reduced 90-day readmission risk.",
                "Adjusted models remained stable.",
                "Sensitivity checks were directionally consistent.",
            ],
            "highlights": [
                "Real-world heart failure cohort.",
                "Primary endpoint retained after adjustment.",
                "Findings align with contemporary evidence.",
            ],
            "plain_language_summary": "Patients receiving intervention had fewer readmissions.",
        },
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={"title": "Submission Pack Project", "target_journal": "ehj"},
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "submission-pack-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        patch_response = client.patch(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}",
            json={
                "sections": {
                    "introduction": "Heart failure readmission burden remains high.",
                    "methods": "Adults were modeled with adjusted Cox analysis.",
                    "results": "Readmission risk was lower with intervention.",
                    "discussion": "Findings were robust in sensitivity checks.",
                }
            },
        )
        assert patch_response.status_code == 200

        response = client.post(
            f"/v1/aawe/projects/{project_id}/manuscripts/{manuscript_id}/submission-pack",
            json={
                "style_profile": "technical",
                "include_plain_language_summary": True,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == "spk-test1234"
    assert payload["target_journal"] == "ehj"
    assert payload["style_profile"] == "technical"
    assert "Please consider our manuscript" in payload["cover_letter"]
    assert len(payload["key_points"]) == 3
    assert len(payload["highlights"]) == 3
    assert "fewer readmissions" in payload["plain_language_summary"]


def test_v1_cross_section_consistency_check_returns_issue_summary(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={"title": "Consistency Project", "target_journal": "jacc"},
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "consistency-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        patch_response = client.patch(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}",
            json={
                "sections": {
                    "methods": "Eligible adults were included (N=120).",
                    "results": "Primary endpoint favored intervention (N=98).",
                    "discussion": "We observed higher risk in intervention with 35% event burden.",
                }
            },
        )
        assert patch_response.status_code == 200

        consistency_response = client.post(
            f"/v1/aawe/projects/{project_id}/manuscripts/{manuscript_id}/consistency/check",
            json={"include_low_severity": False},
        )

    assert consistency_response.status_code == 200
    payload = consistency_response.json()
    assert payload["run_id"].startswith("cns-")
    assert payload["total_issues"] >= 1
    assert payload["high_severity_count"] >= 1
    assert payload["low_severity_count"] == 0


def test_v1_regenerate_paragraph_updates_manuscript_section(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.api.app.regenerate_paragraph_text",
        lambda **_: {
            "section": "discussion",
            "constraints": ["more_cautious"],
            "revised_paragraph": "Revised discussion sentence with caution [E1].",
            "unsupported_sentences": [],
        },
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={"title": "Paragraph Regen Project", "target_journal": "ehj"},
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "paragraph-branch"},
        )
        manuscript_id = manuscript_response.json()["id"]
        patch_response = client.patch(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}",
            json={
                "sections": {
                    "discussion": (
                        "Original first paragraph.\n\nOriginal second paragraph."
                    )
                }
            },
        )
        assert patch_response.status_code == 200

        regen_response = client.post(
            (
                f"/v1/aawe/projects/{project_id}/manuscripts/{manuscript_id}/"
                "sections/discussion/paragraphs/regenerate"
            ),
            json={
                "paragraph_index": 1,
                "notes_context": "Discussion notes context",
                "constraints": ["more_cautious"],
                "persist_to_manuscript": True,
            },
        )
        manuscript_fetch = client.get(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}"
        )

    assert regen_response.status_code == 200
    payload = regen_response.json()
    assert payload["paragraph_index"] == 1
    assert payload["persisted"] is True
    assert (
        "Revised discussion sentence with caution" in payload["regenerated_paragraph"]
    )

    assert manuscript_fetch.status_code == 200
    assert (
        "Revised discussion sentence with caution"
        in manuscript_fetch.json()["sections"]["discussion"]
    )


def test_v1_citation_autofill_returns_updated_claim_states(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(
        "research_os.services.citation_service._CLAIM_CITATION_IDS",
        {"results-p1": []},
    )

    with TestClient(app) as client:
        response = client.post(
            "/v1/aawe/citations/autofill",
            json={
                "claim_ids": ["results-p1"],
                "required_slots": 2,
                "overwrite_existing": False,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"].startswith("caf-")
    assert len(payload["updated_claims"]) == 1
    claim_state = payload["updated_claims"][0]
    assert claim_state["claim_id"] == "results-p1"
    assert len(claim_state["attached_citation_ids"]) >= 1
    assert claim_state["autofill_applied"] is True


def test_v1_link_aawe_claims_returns_filtered_suggestions(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with TestClient(app) as client:
        response = client.post(
            "/v1/aawe/linker/claims",
            json={
                "claim_ids": ["results-p1", "discussion-p1"],
                "min_confidence": "medium",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"].startswith("lnk-")
    claim_ids = {item["claim_id"] for item in payload["suggestions"]}
    assert claim_ids == {"results-p1", "discussion-p1"}


def test_v1_export_aawe_reference_pack_returns_ama_style(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _set_citation_state(monkeypatch)

    with TestClient(app) as client:
        response = client.post(
            "/v1/aawe/references/pack",
            json={
                "style": "ama",
                "claim_ids": ["results-p1"],
                "include_urls": False,
            },
        )

    assert response.status_code == 200
    assert 'attachment; filename="aawe-reference-pack-ama.txt"' in response.headers.get(
        "content-disposition",
        "",
    )
    assert "- Style: AMA" in response.text
    assert (
        "TRIPOD+AI: Updated reporting guidance for clinical prediction models."
        in response.text
    )


def test_v1_qc_gated_export_markdown_blocks_on_high_severity(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.api.app.run_qc_checks",
        lambda: {
            "run_id": "qc-run-1",
            "generated_at": "2026-02-20T20:00:00Z",
            "total_findings": 2,
            "high_severity_count": 1,
            "medium_severity_count": 1,
            "low_severity_count": 0,
            "issues": [],
        },
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={"title": "QC Gated Export Project", "target_journal": "ehj"},
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "qc-gated"},
        )
        manuscript_id = manuscript_response.json()["id"]
        export_response = client.post(
            f"/v1/aawe/projects/{project_id}/manuscripts/{manuscript_id}/export/markdown",
            json={"include_empty": False},
        )

    assert export_response.status_code == 409
    assert export_response.json()["error"]["type"] == "conflict"
    assert "QC gate blocked export" in export_response.json()["error"]["detail"]


def test_v1_qc_gated_export_markdown_returns_markdown_when_qc_passes(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.api.app.run_qc_checks",
        lambda: {
            "run_id": "qc-run-2",
            "generated_at": "2026-02-20T20:00:00Z",
            "total_findings": 0,
            "high_severity_count": 0,
            "medium_severity_count": 0,
            "low_severity_count": 0,
            "issues": [],
        },
    )

    with TestClient(app) as client:
        project_response = client.post(
            "/v1/projects",
            json={"title": "QC Pass Export Project", "target_journal": "ehj"},
        )
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "qc-pass"},
        )
        manuscript_id = manuscript_response.json()["id"]
        client.patch(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}",
            json={"sections": {"methods": "Methods content for gated export."}},
        )
        export_response = client.post(
            f"/v1/aawe/projects/{project_id}/manuscripts/{manuscript_id}/export/markdown",
            json={"include_empty": False},
        )

    assert export_response.status_code == 200
    assert "# QC Pass Export Project" in export_response.text
    assert "Methods content for gated export." in export_response.text


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


def test_v1_create_list_and_restore_manuscript_snapshot(monkeypatch, tmp_path) -> None:
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
    assert (
        snapshot_payload["sections"]["methods"] == "Original methods snapshot content"
    )

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


def test_v1_generation_job_id_endpoints_enforce_owner_collaborator_access(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.services.generation_job_service._start_generation_thread",
        lambda _: None,
    )

    with TestClient(app) as client:
        owner_register = client.post(
            "/v1/auth/register",
            json={
                "email": "jobs-owner@example.com",
                "password": "StrongPassword123",
                "name": "Jobs Owner",
            },
        )
        collaborator_register = client.post(
            "/v1/auth/register",
            json={
                "email": "jobs-collaborator@example.com",
                "password": "StrongPassword123",
                "name": "Jobs Collaborator",
            },
        )
        outsider_register = client.post(
            "/v1/auth/register",
            json={
                "email": "jobs-outsider@example.com",
                "password": "StrongPassword123",
                "name": "Jobs Outsider",
            },
        )
        assert owner_register.status_code == 200
        assert collaborator_register.status_code == 200
        assert outsider_register.status_code == 200
        owner_headers = _auth_headers(owner_register.json()["session_token"])
        collaborator_headers = _auth_headers(collaborator_register.json()["session_token"])
        outsider_headers = _auth_headers(outsider_register.json()["session_token"])

        collaborator_me = client.get("/v1/auth/me", headers=collaborator_headers)
        assert collaborator_me.status_code == 200
        collaborator_user_id = collaborator_me.json()["id"]

        create_project = client.post(
            "/v1/projects",
            headers=owner_headers,
            json={
                "title": "Owner Scoped Job Project",
                "target_journal": "ehj",
                "collaborator_user_ids": [collaborator_user_id],
                "workspace_id": "jobs-access-workspace",
            },
        )
        assert create_project.status_code == 200
        project_id = create_project.json()["id"]

        create_manuscript = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            headers=owner_headers,
            json={"branch_name": "main"},
        )
        assert create_manuscript.status_code == 200
        manuscript_id = create_manuscript.json()["id"]

        enqueue_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
            headers=owner_headers,
            json={
                "sections": ["methods"],
                "notes_context": "Scoped access test",
            },
        )
        assert enqueue_response.status_code == 200
        job_id = enqueue_response.json()["id"]

        owner_get = client.get(f"/v1/generation-jobs/{job_id}", headers=owner_headers)
        collaborator_get = client.get(
            f"/v1/generation-jobs/{job_id}", headers=collaborator_headers
        )
        outsider_get = client.get(f"/v1/generation-jobs/{job_id}", headers=outsider_headers)
        anonymous_get = client.get(f"/v1/generation-jobs/{job_id}")

        assert owner_get.status_code == 200
        assert collaborator_get.status_code == 200
        assert outsider_get.status_code == 404
        assert anonymous_get.status_code == 404

        outsider_cancel = client.post(
            f"/v1/generation-jobs/{job_id}/cancel", headers=outsider_headers
        )
        outsider_retry = client.post(
            f"/v1/generation-jobs/{job_id}/retry",
            headers=outsider_headers,
            json={},
        )
        assert outsider_cancel.status_code == 404
        assert outsider_retry.status_code == 404


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


def test_v1_auth_register_login_me_patch_logout(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "ciaran@example.com",
                "password": "StrongPassword123",
                "name": "Ciaran",
            },
        )
        assert register_response.status_code == 200
        register_payload = register_response.json()
        token = register_payload["session_token"]

        me_response = client.get("/v1/auth/me", headers=_auth_headers(token))
        patch_response = client.patch(
            "/v1/auth/me",
            headers=_auth_headers(token),
            json={"name": "Ciaran Updated"},
        )
        logout_response = client.post("/v1/auth/logout", headers=_auth_headers(token))
        me_after_logout = client.get("/v1/auth/me", headers=_auth_headers(token))
        login_response = client.post(
            "/v1/auth/login",
            json={"email": "ciaran@example.com", "password": "StrongPassword123"},
        )

    assert me_response.status_code == 200
    assert me_response.json()["email"] == "ciaran@example.com"
    assert patch_response.status_code == 200
    assert patch_response.json()["name"] == "Ciaran Updated"
    assert logout_response.status_code == 200
    assert logout_response.json()["success"] is True
    assert me_after_logout.status_code == 401
    assert login_response.status_code == 200
    assert login_response.json()["user"]["email"] == "ciaran@example.com"


def test_v1_admin_endpoints_require_authentication(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        overview_response = client.get("/v1/admin/overview")
        users_response = client.get("/v1/admin/users")
        organisations_response = client.get("/v1/admin/organisations")
        workspaces_response = client.get("/v1/admin/workspaces")
        usage_costs_response = client.get("/v1/admin/usage-costs")
        jobs_response = client.get("/v1/admin/jobs")
        reconcile_library_response = client.post(
            "/v1/admin/users/user-unknown/library/reconcile"
        )
        cancel_job_response = client.post("/v1/admin/jobs/job-unknown/cancel", json={})
        retry_job_response = client.post("/v1/admin/jobs/job-unknown/retry", json={})
        impersonate_response = client.post(
            "/v1/admin/organisations/org-example.com/impersonate",
            json={},
        )
        audit_response = client.get("/v1/admin/audit/events")

    assert overview_response.status_code == 401
    assert overview_response.json()["error"]["type"] == "unauthorized"
    assert users_response.status_code == 401
    assert users_response.json()["error"]["type"] == "unauthorized"
    assert organisations_response.status_code == 401
    assert organisations_response.json()["error"]["type"] == "unauthorized"
    assert workspaces_response.status_code == 401
    assert workspaces_response.json()["error"]["type"] == "unauthorized"
    assert usage_costs_response.status_code == 401
    assert usage_costs_response.json()["error"]["type"] == "unauthorized"
    assert jobs_response.status_code == 401
    assert jobs_response.json()["error"]["type"] == "unauthorized"
    assert reconcile_library_response.status_code == 401
    assert reconcile_library_response.json()["error"]["type"] == "unauthorized"
    assert cancel_job_response.status_code == 401
    assert cancel_job_response.json()["error"]["type"] == "unauthorized"
    assert retry_job_response.status_code == 401
    assert retry_job_response.json()["error"]["type"] == "unauthorized"
    assert impersonate_response.status_code == 401
    assert impersonate_response.json()["error"]["type"] == "unauthorized"
    assert audit_response.status_code == 401
    assert audit_response.json()["error"]["type"] == "unauthorized"


def test_v1_admin_endpoints_require_admin_role(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "standard-user@example.com",
                "password": "StrongPassword123",
                "name": "Standard User",
            },
        )
        assert register_response.status_code == 200
        token = register_response.json()["session_token"]

        overview_response = client.get("/v1/admin/overview", headers=_auth_headers(token))
        users_response = client.get("/v1/admin/users", headers=_auth_headers(token))
        organisations_response = client.get(
            "/v1/admin/organisations",
            headers=_auth_headers(token),
        )
        workspaces_response = client.get(
            "/v1/admin/workspaces",
            headers=_auth_headers(token),
        )
        usage_costs_response = client.get(
            "/v1/admin/usage-costs",
            headers=_auth_headers(token),
        )
        jobs_response = client.get(
            "/v1/admin/jobs",
            headers=_auth_headers(token),
        )
        reconcile_library_response = client.post(
            "/v1/admin/users/user-unknown/library/reconcile",
            headers=_auth_headers(token),
        )
        cancel_job_response = client.post(
            "/v1/admin/jobs/job-unknown/cancel",
            headers=_auth_headers(token),
            json={},
        )
        retry_job_response = client.post(
            "/v1/admin/jobs/job-unknown/retry",
            headers=_auth_headers(token),
            json={},
        )
        impersonate_response = client.post(
            "/v1/admin/organisations/org-example.com/impersonate",
            headers=_auth_headers(token),
            json={},
        )
        audit_response = client.get(
            "/v1/admin/audit/events",
            headers=_auth_headers(token),
        )

    assert overview_response.status_code == 403
    assert overview_response.json()["error"]["type"] == "forbidden"
    assert users_response.status_code == 403
    assert users_response.json()["error"]["type"] == "forbidden"
    assert organisations_response.status_code == 403
    assert organisations_response.json()["error"]["type"] == "forbidden"
    assert workspaces_response.status_code == 403
    assert workspaces_response.json()["error"]["type"] == "forbidden"
    assert usage_costs_response.status_code == 403
    assert usage_costs_response.json()["error"]["type"] == "forbidden"
    assert jobs_response.status_code == 403
    assert jobs_response.json()["error"]["type"] == "forbidden"
    assert reconcile_library_response.status_code == 403
    assert reconcile_library_response.json()["error"]["type"] == "forbidden"
    assert cancel_job_response.status_code == 403
    assert cancel_job_response.json()["error"]["type"] == "forbidden"
    assert retry_job_response.status_code == 403
    assert retry_job_response.json()["error"]["type"] == "forbidden"
    assert impersonate_response.status_code == 403
    assert impersonate_response.json()["error"]["type"] == "forbidden"
    assert audit_response.status_code == 403
    assert audit_response.json()["error"]["type"] == "forbidden"


def test_v1_admin_endpoints_return_admin_payloads(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    encoded = base64.b64encode(b"col_a,col_b\n1,2\n").decode("ascii")

    with TestClient(app) as client:
        admin_register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "admin-user@example.com",
                "password": "StrongPassword123",
                "name": "Admin User",
            },
        )
        assert admin_register_response.status_code == 200
        admin_user_payload = admin_register_response.json()["user"]
        _promote_user_to_admin(admin_user_payload["id"])
        admin_token = admin_register_response.json()["session_token"]

        viewer_register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "viewer-user@example.com",
                "password": "StrongPassword123",
                "name": "Viewer User",
            },
        )
        assert viewer_register_response.status_code == 200
        viewer_token = viewer_register_response.json()["session_token"]

        project_response = client.post(
            "/v1/projects",
            headers=_auth_headers(viewer_token),
            json={
                "title": "Org Analytics Project",
                "target_journal": "ehj",
                "workspace_id": "org-workspace-1",
            },
        )
        assert project_response.status_code == 200
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            headers=_auth_headers(viewer_token),
            json={"branch_name": "main", "sections": ["introduction"]},
        )
        assert manuscript_response.status_code == 200
        manuscript_id = manuscript_response.json()["id"]
        with session_scope() as session:
            queued_job = GenerationJob(
                project_id=project_id,
                manuscript_id=manuscript_id,
                status="queued",
                sections=["introduction"],
                notes_context="Queued job for admin control test",
                estimated_input_tokens=320,
                estimated_output_tokens_high=180,
                estimated_cost_usd_high=0.0142,
            )
            failed_job = GenerationJob(
                project_id=project_id,
                manuscript_id=manuscript_id,
                status="failed",
                sections=["introduction"],
                notes_context="Failed job for retry control test",
                error_detail="Synthetic failure for admin retry test",
                estimated_input_tokens=210,
                estimated_output_tokens_high=160,
                estimated_cost_usd_high=0.0111,
            )
            session.add(queued_job)
            session.add(failed_job)
            session.flush()
            queued_job_id = queued_job.id
            failed_job_id = failed_job.id
        snapshot_response = client.post(
            f"/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots",
            headers=_auth_headers(viewer_token),
            json={},
        )
        assert snapshot_response.status_code == 200

        upload_response = client.post(
            "/v1/library/assets/upload",
            headers=_auth_headers(viewer_token),
            json={
                "project_id": project_id,
                "files": [
                    {
                        "filename": "org-usage-sample.csv",
                        "mime_type": "text/csv",
                        "content_base64": encoded,
                    }
                ],
            },
        )
        assert upload_response.status_code == 200

        overview_response = client.get(
            "/v1/admin/overview",
            headers=_auth_headers(admin_token),
        )
        users_response = client.get(
            "/v1/admin/users",
            headers=_auth_headers(admin_token),
            params={"query": "viewer", "limit": 10, "offset": 0},
        )
        organisations_response = client.get(
            "/v1/admin/organisations",
            headers=_auth_headers(admin_token),
            params={"query": "example.com", "limit": 20, "offset": 0},
        )
        workspaces_response = client.get(
            "/v1/admin/workspaces",
            headers=_auth_headers(admin_token),
            params={"query": "org-workspace-1", "limit": 20, "offset": 0},
        )
        usage_costs_response = client.get(
            "/v1/admin/usage-costs",
            headers=_auth_headers(admin_token),
            params={"query": "example.com"},
        )
        jobs_response = client.get(
            "/v1/admin/jobs",
            headers=_auth_headers(admin_token),
            params={"query": "org-workspace-1", "limit": 20, "offset": 0},
        )
        reconcile_library_response = client.post(
            f"/v1/admin/users/{viewer_register_response.json()['user']['id']}/library/reconcile",
            headers=_auth_headers(admin_token),
        )
        cancel_job_response = client.post(
            f"/v1/admin/jobs/{queued_job_id}/cancel",
            headers=_auth_headers(admin_token),
            json={"reason": "Stop queued run from admin console test"},
        )
        retry_job_response = client.post(
            f"/v1/admin/jobs/{failed_job_id}/retry",
            headers=_auth_headers(admin_token),
            json={"reason": "Retry failed run from admin console test"},
        )
        impersonate_response = client.post(
            "/v1/admin/organisations/org-example.com/impersonate",
            headers=_auth_headers(admin_token),
            json={"reason": "Integration test audit check"},
        )
        audit_response = client.get(
            "/v1/admin/audit/events",
            headers=_auth_headers(admin_token),
            params={"limit": 20, "offset": 0},
        )

    assert overview_response.status_code == 200
    overview_payload = overview_response.json()
    assert overview_payload["total_users"] >= 2
    assert overview_payload["admin_users"] >= 1
    assert overview_payload["active_users"] >= 2
    assert overview_payload["active_users_24h"] >= 1
    assert overview_payload["active_users_7d"] >= 1
    assert overview_payload["active_users_30d"] >= 1
    assert overview_payload["retention_7d_pct"] >= 0
    assert overview_payload["retention_30d_pct"] >= 0
    assert overview_payload["inactive_users"] >= 0

    assert users_response.status_code == 200
    users_payload = users_response.json()
    assert users_payload["limit"] == 10
    assert users_payload["offset"] == 0
    assert users_payload["total"] >= 1
    assert len(users_payload["items"]) >= 1
    assert users_payload["items"][0]["email"] == "viewer-user@example.com"
    assert str(users_payload["items"][0]["id"]).strip() != ""
    assert str(users_payload["items"][0].get("account_key") or "").strip() != ""

    assert organisations_response.status_code == 200
    organisations_payload = organisations_response.json()
    assert organisations_payload["limit"] == 20
    assert organisations_payload["offset"] == 0
    assert organisations_payload["total"] >= 1
    assert len(organisations_payload["items"]) >= 1
    organisation = organisations_payload["items"][0]
    assert organisation["domain"] == "example.com"
    assert organisation["member_count"] >= 2
    assert organisation["project_count"] >= 1
    assert organisation["workspace_count"] >= 1
    assert organisation["storage_bytes_current"] > 0
    assert isinstance(organisation["feature_flags_enabled"], list)
    assert len(organisation["integrations"]) >= 3
    assert organisation["impersonation"]["available"] is True
    assert organisation["impersonation"]["audited"] is True

    assert workspaces_response.status_code == 200
    workspaces_payload = workspaces_response.json()
    assert workspaces_payload["limit"] == 20
    assert workspaces_payload["offset"] == 0
    assert workspaces_payload["total"] >= 1
    assert len(workspaces_payload["items"]) >= 1
    workspace = workspaces_payload["items"][0]
    assert workspace["id"] == "org-workspace-1"
    assert workspace["project_count"] >= 1
    assert workspace["manuscript_count"] >= 1
    assert workspace["data_sources_count"] >= 1
    assert workspace["storage_bytes"] > 0
    assert workspace["export_history_count"] >= 1
    assert workspace["member_count"] >= 1
    assert isinstance(workspace["members"], list)
    assert isinstance(workspace["projects"], list)
    assert "job_health" in workspace

    assert usage_costs_response.status_code == 200
    usage_costs_payload = usage_costs_response.json()
    assert usage_costs_payload["summary"]["tokens_current_month"] >= 1
    assert usage_costs_payload["summary"]["tool_calls_current_month"] >= 1
    assert isinstance(usage_costs_payload["model_usage"], list)
    assert isinstance(usage_costs_payload["organisation_usage"], list)
    assert isinstance(usage_costs_payload["user_usage"], list)
    assert len(usage_costs_payload["monthly_trend"]) >= 1

    assert jobs_response.status_code == 200
    jobs_payload = jobs_response.json()
    assert jobs_payload["limit"] == 20
    assert jobs_payload["offset"] == 0
    assert jobs_payload["total"] >= 2
    assert jobs_payload["queue_health"]["total_jobs"] >= 2
    assert jobs_payload["queue_health"]["retryable_jobs"] >= 1

    assert reconcile_library_response.status_code == 200
    reconcile_payload = reconcile_library_response.json()
    assert reconcile_payload["user_id"] == viewer_register_response.json()["user"]["id"]
    assert str(reconcile_payload.get("account_key") or "").strip() != ""
    assert "Reconciled" in str(reconcile_payload["message"])
    assert isinstance(reconcile_payload["reconcile_summary"], dict)
    assert "restored_rows" in reconcile_payload["reconcile_summary"]
    assert "audit_event" in reconcile_payload

    assert cancel_job_response.status_code == 200
    cancel_payload = cancel_job_response.json()
    assert cancel_payload["action"] == "cancel"
    assert cancel_payload["source_job_id"] == queued_job_id
    assert cancel_payload["audit_event"]["status"] == "success"
    assert cancel_payload["job"]["status"] in {"cancel_requested", "cancelled"}

    assert retry_job_response.status_code == 200
    retry_payload = retry_job_response.json()
    assert retry_payload["action"] == "retry"
    assert retry_payload["source_job_id"] == failed_job_id
    assert retry_payload["audit_event"]["status"] == "success"
    assert retry_payload["job"]["id"] != failed_job_id
    assert retry_payload["job"]["run_count"] >= 2

    assert impersonate_response.status_code == 200
    impersonate_payload = impersonate_response.json()
    assert impersonate_payload["org_id"] == "org-example.com"
    assert impersonate_payload["audited"] is True
    assert impersonate_payload["audit_event"]["status"] == "success"
    assert impersonate_payload["target_user_email"].endswith("@example.com")

    assert audit_response.status_code == 200
    audit_payload = audit_response.json()
    assert audit_payload["total"] >= 3
    assert audit_payload["summary"]["success_count"] >= 3
    assert isinstance(audit_payload["summary"]["action_totals"], list)
    actions = {item["action"] for item in audit_payload["items"]}
    assert "admin_job_cancel" in actions
    assert "admin_job_retry" in actions
    assert "admin_org_impersonation_start" in actions


def test_v1_workspace_state_round_trip_persists_for_authenticated_user(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-user@example.com",
                "password": "StrongPassword123",
                "name": "Workspace User",
            },
        )
        assert register_response.status_code == 200
        token = register_response.json()["session_token"]
        headers = _auth_headers(token)

        initial_state_response = client.get("/v1/workspaces/state", headers=headers)
        assert initial_state_response.status_code == 200
        assert initial_state_response.json() == {
            "workspaces": [],
            "active_workspace_id": None,
            "author_requests": [],
            "invitations_sent": [],
        }

        put_workspace_state = client.put(
            "/v1/workspaces/state",
            headers=headers,
            json={
                "workspaces": [
                    {
                        "id": "hf-registry",
                        "name": "HF Registry Manuscript",
                        "owner_name": "Workspace User",
                        "collaborators": ["Aisha Rahman", "Aisha Rahman"],
                        "removed_collaborators": ["Aisha Rahman", "Unknown Person"],
                        "version": "0.2",
                        "health": "amber",
                        "updated_at": "2026-02-25T10:00:00Z",
                        "pinned": True,
                        "archived": False,
                    }
                ],
                "active_workspace_id": "hf-registry",
                "author_requests": [
                    {
                        "id": "author-01",
                        "workspace_id": "hf-registry",
                        "workspace_name": "HF Registry Manuscript",
                        "author_name": "Eleanor Hart",
                        "invited_at": "2026-02-25T09:30:00Z",
                    }
                ],
                "invitations_sent": [
                    {
                        "id": "invite-01",
                        "workspace_id": "hf-registry",
                        "workspace_name": "HF Registry Manuscript",
                        "invitee_name": "Tom Price",
                        "invited_at": "2026-02-25T09:45:00Z",
                        "status": "pending",
                    }
                ],
            },
        )
        assert put_workspace_state.status_code == 200
        saved_state = put_workspace_state.json()
        assert saved_state["active_workspace_id"] == "hf-registry"
        assert saved_state["workspaces"][0]["collaborators"] == ["Aisha Rahman"]
        assert saved_state["workspaces"][0]["removed_collaborators"] == ["Aisha Rahman"]

        get_workspace_state = client.get("/v1/workspaces/state", headers=headers)
        assert get_workspace_state.status_code == 200
        assert get_workspace_state.json()["workspaces"][0]["id"] == "hf-registry"
        assert get_workspace_state.json()["author_requests"][0]["id"] == "author-01"
        assert get_workspace_state.json()["invitations_sent"][0]["id"] == "invite-01"

        put_inbox_state = client.put(
            "/v1/workspaces/inbox/state",
            headers=headers,
            json={
                "messages": [
                    {
                        "id": "msg-01",
                        "workspace_id": "hf-registry",
                        "sender_name": "Workspace User",
                        "encrypted_body": "ciphertext-1",
                        "iv": "iv-1",
                        "created_at": "2026-02-25T10:05:00Z",
                    }
                ],
                "reads": {
                    "hf-registry": {
                        "Workspace User": "2026-02-25T10:05:00Z",
                    }
                },
            },
        )
        assert put_inbox_state.status_code == 200
        assert put_inbox_state.json()["messages"][0]["id"] == "msg-01"
        assert "workspace user" in put_inbox_state.json()["reads"]["hf-registry"]

        get_inbox_state = client.get("/v1/workspaces/inbox/state", headers=headers)
        assert get_inbox_state.status_code == 200
        assert get_inbox_state.json()["messages"][0]["workspace_id"] == "hf-registry"
        assert get_inbox_state.json()["reads"]["hf-registry"]["workspace user"].endswith(
            "Z"
        )


def test_v1_workspace_granular_endpoints_round_trip(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-granular@example.com",
                "password": "StrongPassword123",
                "name": "Workspace Owner",
            },
        )
        assert register_response.status_code == 200
        headers = _auth_headers(register_response.json()["session_token"])

        list_initial = client.get("/v1/workspaces", headers=headers)
        assert list_initial.status_code == 200
        assert list_initial.json() == {"items": [], "active_workspace_id": None}

        create_workspace = client.post(
            "/v1/workspaces",
            headers=headers,
            json={
                "id": "hf-registry",
                "name": "HF Registry Manuscript",
                "owner_name": "Workspace Owner",
                "collaborators": [],
                "removed_collaborators": [],
                "version": "0.1",
                "health": "amber",
                "pinned": True,
                "archived": False,
            },
        )
        assert create_workspace.status_code == 200
        assert create_workspace.json()["id"] == "hf-registry"
        assert create_workspace.json()["owner_name"] == "Workspace Owner"

        set_active = client.put(
            "/v1/workspaces/active",
            headers=headers,
            json={"workspace_id": "hf-registry"},
        )
        assert set_active.status_code == 200
        assert set_active.json()["active_workspace_id"] == "hf-registry"

        patch_workspace = client.patch(
            "/v1/workspaces/hf-registry",
            headers=headers,
            json={
                "collaborators": ["Aisha Rahman", "Aisha Rahman"],
                "removed_collaborators": ["Aisha Rahman", "Ghost User"],
            },
        )
        assert patch_workspace.status_code == 200
        assert patch_workspace.json()["collaborators"] == ["Aisha Rahman"]
        assert patch_workspace.json()["removed_collaborators"] == ["Aisha Rahman"]

        create_invitation = client.post(
            "/v1/workspaces/invitations/sent",
            headers=headers,
            json={
                "workspace_id": "hf-registry",
                "invitee_name": "Tom Price",
                "status": "pending",
            },
        )
        assert create_invitation.status_code == 200
        invitation_id = create_invitation.json()["id"]
        assert create_invitation.json()["status"] == "pending"

        list_invitations = client.get("/v1/workspaces/invitations/sent", headers=headers)
        assert list_invitations.status_code == 200
        assert list_invitations.json()["items"][0]["id"] == invitation_id

        list_author_requests = client.get("/v1/workspaces/author-requests", headers=headers)
        assert list_author_requests.status_code == 200
        assert list_author_requests.json()["items"] == []

        create_message = client.post(
            "/v1/workspaces/inbox/messages",
            headers=headers,
            json={
                "workspace_id": "hf-registry",
                "sender_name": "Workspace Owner",
                "encrypted_body": "ciphertext-1",
                "iv": "iv-1",
            },
        )
        assert create_message.status_code == 200
        message_id = create_message.json()["id"]
        assert create_message.json()["workspace_id"] == "hf-registry"

        list_messages = client.get(
            "/v1/workspaces/inbox/messages",
            headers=headers,
            params={"workspace_id": "hf-registry"},
        )
        assert list_messages.status_code == 200
        assert len(list_messages.json()["items"]) == 1
        assert list_messages.json()["items"][0]["id"] == message_id

        mark_read = client.put(
            "/v1/workspaces/inbox/reads",
            headers=headers,
            json={
                "workspace_id": "hf-registry",
                "reader_name": "Workspace Owner",
                "read_at": "2026-02-25T10:05:00Z",
            },
        )
        assert mark_read.status_code == 200
        assert mark_read.json()["workspace_id"] == "hf-registry"
        assert mark_read.json()["reader_key"] == "workspace owner"

        list_reads = client.get("/v1/workspaces/inbox/reads", headers=headers)
        assert list_reads.status_code == 200
        assert list_reads.json()["reads"]["hf-registry"]["workspace owner"].endswith("Z")

        delete_workspace = client.delete("/v1/workspaces/hf-registry", headers=headers)
        assert delete_workspace.status_code == 200
        assert delete_workspace.json()["success"] is True
        assert delete_workspace.json()["active_workspace_id"] is None

        list_after_delete = client.get("/v1/workspaces", headers=headers)
        assert list_after_delete.status_code == 200
        assert list_after_delete.json()["items"] == []


def test_v1_workspace_author_request_accept_updates_invitation_status(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        owner_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-owner@example.com",
                "password": "StrongPassword123",
                "name": "Owner User",
            },
        )
        invitee_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-invitee@example.com",
                "password": "StrongPassword123",
                "name": "Invitee User",
            },
        )
        assert owner_register.status_code == 200
        assert invitee_register.status_code == 200
        owner_headers = _auth_headers(owner_register.json()["session_token"])
        invitee_headers = _auth_headers(invitee_register.json()["session_token"])

        create_workspace = client.post(
            "/v1/workspaces",
            headers=owner_headers,
            json={
                "id": "4d-flow-rhc-paper",
                "name": "4D flow RHC paper",
                "owner_name": "Owner User",
                "collaborators": [],
                "removed_collaborators": [],
                "version": "0.1",
                "health": "amber",
                "pinned": False,
                "archived": False,
            },
        )
        assert create_workspace.status_code == 200

        create_invitation = client.post(
            "/v1/workspaces/invitations/sent",
            headers=owner_headers,
            json={
                "workspace_id": "4d-flow-rhc-paper",
                "invitee_name": "Invitee User",
                "status": "pending",
            },
        )
        assert create_invitation.status_code == 200
        invitation_id = create_invitation.json()["id"]

        invitee_requests = client.get("/v1/workspaces/author-requests", headers=invitee_headers)
        assert invitee_requests.status_code == 200
        assert len(invitee_requests.json()["items"]) == 1
        request_id = invitee_requests.json()["items"][0]["id"]

        accept_request = client.post(
            f"/v1/workspaces/author-requests/{request_id}/accept",
            headers=invitee_headers,
            json={"collaborator_name": "Invitee User"},
        )
        assert accept_request.status_code == 200
        assert accept_request.json()["workspace"]["name"] == "4D flow RHC paper"
        assert accept_request.json()["workspace"]["owner_name"] == "Owner User"
        assert accept_request.json()["workspace"]["collaborators"] == ["Invitee User"]

        owner_invitations = client.get("/v1/workspaces/invitations/sent", headers=owner_headers)
        assert owner_invitations.status_code == 200
        matched = next(
            item
            for item in owner_invitations.json()["items"]
            if item["id"] == invitation_id
        )
        assert matched["status"] == "accepted"

        owner_workspaces = client.get("/v1/workspaces", headers=owner_headers)
        assert owner_workspaces.status_code == 200
        owner_workspace = next(
            item
            for item in owner_workspaces.json()["items"]
            if item["id"] == "4d-flow-rhc-paper"
        )
        assert "Invitee User" in owner_workspace["collaborators"]
        assert "Invitee User" not in owner_workspace["removed_collaborators"]


def test_v1_workspace_invitation_requires_workspace_owner(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        owner_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-owner-enforce@example.com",
                "password": "StrongPassword123",
                "name": "Owner User",
            },
        )
        collaborator_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-collab-enforce@example.com",
                "password": "StrongPassword123",
                "name": "Collaborator User",
            },
        )
        target_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-target-enforce@example.com",
                "password": "StrongPassword123",
                "name": "Target User",
            },
        )
        assert owner_register.status_code == 200
        assert collaborator_register.status_code == 200
        assert target_register.status_code == 200
        owner_headers = _auth_headers(owner_register.json()["session_token"])
        collaborator_headers = _auth_headers(collaborator_register.json()["session_token"])

        create_workspace = client.post(
            "/v1/workspaces",
            headers=owner_headers,
            json={
                "id": "owner-only-invites",
                "name": "Owner Only Invites",
                "owner_name": "Owner User",
                "collaborators": [],
                "removed_collaborators": [],
                "version": "0.1",
                "health": "amber",
                "pinned": False,
                "archived": False,
            },
        )
        assert create_workspace.status_code == 200

        invite_collaborator = client.post(
            "/v1/workspaces/invitations/sent",
            headers=owner_headers,
            json={
                "workspace_id": "owner-only-invites",
                "invitee_name": "Collaborator User",
                "status": "pending",
            },
        )
        assert invite_collaborator.status_code == 200

        collaborator_requests = client.get(
            "/v1/workspaces/author-requests", headers=collaborator_headers
        )
        assert collaborator_requests.status_code == 200
        request_id = collaborator_requests.json()["items"][0]["id"]

        accept_request = client.post(
            f"/v1/workspaces/author-requests/{request_id}/accept",
            headers=collaborator_headers,
            json={"collaborator_name": "Collaborator User"},
        )
        assert accept_request.status_code == 200

        collaborator_invite_attempt = client.post(
            "/v1/workspaces/invitations/sent",
            headers=collaborator_headers,
            json={
                "workspace_id": "owner-only-invites",
                "invitee_name": "Target User",
                "status": "pending",
            },
        )
        assert collaborator_invite_attempt.status_code == 400
        assert (
            "Only the workspace owner can invite collaborators."
            in collaborator_invite_attempt.json()["error"]["detail"]
        )


def test_v1_workspace_inbox_messages_are_shared_with_workspace_collaborators(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        owner_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-inbox-owner@example.com",
                "password": "StrongPassword123",
                "name": "Owner User",
            },
        )
        collaborator_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-inbox-collab@example.com",
                "password": "StrongPassword123",
                "name": "Collaborator User",
            },
        )
        assert owner_register.status_code == 200
        assert collaborator_register.status_code == 200
        owner_headers = _auth_headers(owner_register.json()["session_token"])
        collaborator_headers = _auth_headers(collaborator_register.json()["session_token"])

        create_workspace = client.post(
            "/v1/workspaces",
            headers=owner_headers,
            json={
                "id": "shared-inbox-workspace",
                "name": "Shared Inbox Workspace",
                "owner_name": "Owner User",
                "collaborators": [],
                "removed_collaborators": [],
                "version": "0.1",
                "health": "amber",
                "pinned": False,
                "archived": False,
            },
        )
        assert create_workspace.status_code == 200

        create_invitation = client.post(
            "/v1/workspaces/invitations/sent",
            headers=owner_headers,
            json={
                "workspace_id": "shared-inbox-workspace",
                "invitee_name": "Collaborator User",
                "status": "pending",
            },
        )
        assert create_invitation.status_code == 200

        collaborator_requests = client.get(
            "/v1/workspaces/author-requests", headers=collaborator_headers
        )
        assert collaborator_requests.status_code == 200
        request_id = collaborator_requests.json()["items"][0]["id"]

        accept_request = client.post(
            f"/v1/workspaces/author-requests/{request_id}/accept",
            headers=collaborator_headers,
            json={"collaborator_name": "Collaborator User"},
        )
        assert accept_request.status_code == 200

        create_message = client.post(
            "/v1/workspaces/inbox/messages",
            headers=owner_headers,
            json={
                "id": "msg-shared-01",
                "workspace_id": "shared-inbox-workspace",
                "sender_name": "Owner User",
                "encrypted_body": "ciphertext-shared",
                "iv": "iv-shared",
                "created_at": "2026-02-25T10:05:00Z",
            },
        )
        assert create_message.status_code == 200

        collaborator_messages = client.get(
            "/v1/workspaces/inbox/messages",
            headers=collaborator_headers,
            params={"workspace_id": "shared-inbox-workspace"},
        )
        assert collaborator_messages.status_code == 200
        assert any(
            item["id"] == "msg-shared-01"
            for item in collaborator_messages.json()["items"]
        )


def test_v1_workspace_run_context_requires_session_token(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        response = client.get("/v1/workspaces/hf-registry/run-context")

    assert response.status_code == 401
    assert response.json()["error"]["type"] == "unauthorized"


def test_v1_workspace_run_context_respects_owner_and_collaborator_access(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        owner_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-context-owner@example.com",
                "password": "StrongPassword123",
                "name": "Workspace Context Owner",
            },
        )
        collaborator_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-context-collab@example.com",
                "password": "StrongPassword123",
                "name": "Workspace Context Collaborator",
            },
        )
        outsider_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-context-outsider@example.com",
                "password": "StrongPassword123",
                "name": "Workspace Context Outsider",
            },
        )
        assert owner_register.status_code == 200
        assert collaborator_register.status_code == 200
        assert outsider_register.status_code == 200

        owner_token = owner_register.json()["session_token"]
        collaborator_token = collaborator_register.json()["session_token"]
        outsider_token = outsider_register.json()["session_token"]
        owner_headers = _auth_headers(owner_token)
        collaborator_headers = _auth_headers(collaborator_token)
        outsider_headers = _auth_headers(outsider_token)

        owner_me = client.get("/v1/auth/me", headers=owner_headers)
        collaborator_me = client.get("/v1/auth/me", headers=collaborator_headers)
        assert owner_me.status_code == 200
        assert collaborator_me.status_code == 200
        owner_user_id = owner_me.json()["id"]
        collaborator_user_id = collaborator_me.json()["id"]

        create_workspace = client.post(
            "/v1/workspaces",
            headers=owner_headers,
            json={
                "id": "workspace-context-paper",
                "name": "Workspace Context Paper",
                "owner_name": "Workspace Context Owner",
                "collaborators": ["Workspace Context Collaborator"],
                "removed_collaborators": [],
                "version": "0.1",
                "health": "amber",
                "pinned": False,
                "archived": False,
            },
        )
        assert create_workspace.status_code == 200

        create_project = client.post(
            "/v1/projects",
            headers=owner_headers,
            json={
                "title": "Workspace Context Project",
                "target_journal": "ehj",
                "workspace_id": "workspace-context-paper",
                "collaborator_user_ids": [collaborator_user_id],
            },
        )
        assert create_project.status_code == 200
        project_id = create_project.json()["id"]

        create_manuscript = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            headers=owner_headers,
            json={"branch_name": "main"},
        )
        assert create_manuscript.status_code == 200
        manuscript_id = create_manuscript.json()["id"]

        owner_context = client.get(
            "/v1/workspaces/workspace-context-paper/run-context",
            headers=owner_headers,
        )
        collaborator_context = client.get(
            "/v1/workspaces/workspace-context-paper/run-context",
            headers=collaborator_headers,
        )
        outsider_context = client.get(
            "/v1/workspaces/workspace-context-paper/run-context",
            headers=outsider_headers,
        )

        assert owner_context.status_code == 200
        assert collaborator_context.status_code == 200
        assert outsider_context.status_code == 200

        owner_payload = owner_context.json()
        collaborator_payload = collaborator_context.json()
        outsider_payload = outsider_context.json()

        assert owner_payload["project_id"] == project_id
        assert owner_payload["manuscript_id"] == manuscript_id
        assert owner_payload["owner_user_id"] == owner_user_id
        assert collaborator_user_id in owner_payload["collaborator_user_ids"]

        assert collaborator_payload["project_id"] == project_id
        assert collaborator_payload["manuscript_id"] == manuscript_id
        assert collaborator_payload["owner_user_id"] == owner_user_id
        assert collaborator_user_id in collaborator_payload["collaborator_user_ids"]

        assert outsider_payload["project_id"] is None
        assert outsider_payload["manuscript_id"] is None
        assert outsider_payload["owner_user_id"] is None
        assert outsider_payload["collaborator_user_ids"] == []


def test_v1_workspace_author_request_decline_updates_invitation_status(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        owner_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-owner-decline@example.com",
                "password": "StrongPassword123",
                "name": "Owner User",
            },
        )
        invitee_register = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-invitee-decline@example.com",
                "password": "StrongPassword123",
                "name": "Invitee User",
            },
        )
        assert owner_register.status_code == 200
        assert invitee_register.status_code == 200
        owner_headers = _auth_headers(owner_register.json()["session_token"])
        invitee_headers = _auth_headers(invitee_register.json()["session_token"])

        create_workspace = client.post(
            "/v1/workspaces",
            headers=owner_headers,
            json={
                "id": "decline-rhc-paper",
                "name": "Decline RHC paper",
                "owner_name": "Owner User",
                "collaborators": [],
                "removed_collaborators": [],
                "version": "0.1",
                "health": "amber",
                "pinned": False,
                "archived": False,
            },
        )
        assert create_workspace.status_code == 200

        create_invitation = client.post(
            "/v1/workspaces/invitations/sent",
            headers=owner_headers,
            json={
                "workspace_id": "decline-rhc-paper",
                "invitee_name": "Invitee User",
                "status": "pending",
            },
        )
        assert create_invitation.status_code == 200
        invitation_id = create_invitation.json()["id"]

        invitee_requests = client.get("/v1/workspaces/author-requests", headers=invitee_headers)
        assert invitee_requests.status_code == 200
        assert len(invitee_requests.json()["items"]) == 1
        request_id = invitee_requests.json()["items"][0]["id"]

        decline_request = client.post(
            f"/v1/workspaces/author-requests/{request_id}/decline",
            headers=invitee_headers,
        )
        assert decline_request.status_code == 200
        assert decline_request.json()["success"] is True
        assert decline_request.json()["removed_request_id"] == request_id

        invitee_requests_after = client.get("/v1/workspaces/author-requests", headers=invitee_headers)
        assert invitee_requests_after.status_code == 200
        assert invitee_requests_after.json()["items"] == []

        owner_invitations = client.get("/v1/workspaces/invitations/sent", headers=owner_headers)
        assert owner_invitations.status_code == 200
        matched = next(
            item
            for item in owner_invitations.json()["items"]
            if item["id"] == invitation_id
        )
        assert matched["status"] == "declined"


def test_v1_workspace_inbox_websocket_relays_typing_events(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        register_a = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-ws-a@example.com",
                "password": "StrongPassword123",
                "name": "Realtime User A",
            },
        )
        register_b = client.post(
            "/v1/auth/register",
            json={
                "email": "workspace-ws-b@example.com",
                "password": "StrongPassword123",
                "name": "Realtime User B",
            },
        )
        assert register_a.status_code == 200
        assert register_b.status_code == 200
        token_a = register_a.json()["session_token"]
        token_b = register_b.json()["session_token"]
        headers_a = _auth_headers(token_a)
        headers_b = _auth_headers(token_b)

        create_workspace = client.post(
            "/v1/workspaces",
            headers=headers_a,
            json={
                "id": "hf-registry",
                "name": "HF Registry",
                "owner_name": "Realtime User A",
                "collaborators": [],
                "removed_collaborators": [],
                "version": "0.1",
                "health": "amber",
                "pinned": False,
                "archived": False,
            },
        )
        assert create_workspace.status_code == 200

        create_invitation = client.post(
            "/v1/workspaces/invitations/sent",
            headers=headers_a,
            json={
                "workspace_id": "hf-registry",
                "invitee_name": "Realtime User B",
                "status": "pending",
            },
        )
        assert create_invitation.status_code == 200

        invitee_requests = client.get("/v1/workspaces/author-requests", headers=headers_b)
        assert invitee_requests.status_code == 200
        request_id = invitee_requests.json()["items"][0]["id"]
        accept_request = client.post(
            f"/v1/workspaces/author-requests/{request_id}/accept",
            headers=headers_b,
            json={"collaborator_name": "Realtime User B"},
        )
        assert accept_request.status_code == 200

        ws_url_a = f"/v1/workspaces/inbox/ws?workspace_id=hf-registry&token={token_a}"
        ws_url_b = f"/v1/workspaces/inbox/ws?workspace_id=hf-registry&token={token_b}"

        with client.websocket_connect(ws_url_a) as ws_a:
            with client.websocket_connect(ws_url_b) as ws_b:
                presence_event = ws_a.receive_json()
                assert presence_event["type"] == "presence"
                assert presence_event["workspace_id"] == "hf-registry"
                assert presence_event["status"] == "joined"
                assert presence_event["sender_name"] == "Realtime User B"

                ws_a.send_json(
                    {
                        "type": "typing",
                        "workspace_id": "hf-registry",
                        "active": True,
                    }
                )
                typing_event = ws_b.receive_json()
                assert typing_event["type"] == "typing"
                assert typing_event["workspace_id"] == "hf-registry"
                assert typing_event["sender_name"] == "Realtime User A"
                assert typing_event["active"] is True

                ws_b.send_json({"type": "ping"})
                pong_event = ws_b.receive_json()
                assert pong_event["type"] == "pong"
                assert pong_event["workspace_id"] == "hf-registry"


def test_v1_auth_delete_me_removes_account(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "delete-me@example.com",
                "password": "StrongPassword123",
                "name": "Delete Me",
            },
        )
        assert register_response.status_code == 200
        token = register_response.json()["session_token"]

        delete_response = client.request(
            "DELETE",
            "/v1/auth/me",
            headers=_auth_headers(token),
            json={"confirm_phrase": "DELETE"},
        )
        me_response = client.get("/v1/auth/me", headers=_auth_headers(token))
        login_response = client.post(
            "/v1/auth/login",
            json={"email": "delete-me@example.com", "password": "StrongPassword123"},
        )

    assert delete_response.status_code == 200
    assert delete_response.json()["success"] is True
    assert me_response.status_code == 401
    assert login_response.status_code == 400


def test_v1_auth_register_rejects_weak_password(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        response = client.post(
            "/v1/auth/register",
            json={
                "email": "weak@example.com",
                "password": "weakpass1",
                "name": "Weak User",
            },
        )

    assert response.status_code == 400
    assert response.json()["error"]["type"] == "bad_request"
    assert "password must" in response.json()["error"]["detail"].lower()


def test_v1_auth_login_rate_limit(monkeypatch, tmp_path) -> None:
    import research_os.api.app as api_module

    _set_test_environment(monkeypatch, tmp_path)
    api_module._AUTH_RATE_LIMIT_EVENTS.clear()
    monkeypatch.setattr(api_module, "AUTH_LOGIN_RATE_LIMIT", 2)
    monkeypatch.setattr(api_module, "AUTH_RATE_LIMIT_WINDOW_SECONDS", 60)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "ratelimit@example.com",
                "password": "StrongPassword123",
                "name": "Rate Limit User",
            },
        )
        assert register_response.status_code == 200

        first = client.post(
            "/v1/auth/login",
            json={"email": "ratelimit@example.com", "password": "wrong-password"},
        )
        second = client.post(
            "/v1/auth/login",
            json={"email": "ratelimit@example.com", "password": "wrong-password"},
        )
        third = client.post(
            "/v1/auth/login",
            json={"email": "ratelimit@example.com", "password": "wrong-password"},
        )

    assert first.status_code == 400
    assert second.status_code == 400
    assert third.status_code == 429
    assert third.json()["error"]["type"] == "rate_limited"
    api_module._AUTH_RATE_LIMIT_EVENTS.clear()


def test_v1_auth_login_challenge_and_two_factor_flow(monkeypatch, tmp_path) -> None:
    from research_os.services.security_service import generate_totp_code

    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "twofactor@example.com",
                "password": "StrongPassword123",
                "name": "Two Factor User",
            },
        )
        assert register_response.status_code == 200
        initial_token = register_response.json()["session_token"]

        setup_response = client.post(
            "/v1/auth/2fa/setup",
            headers=_auth_headers(initial_token),
        )
        assert setup_response.status_code == 200
        setup_payload = setup_response.json()
        code = generate_totp_code(setup_payload["secret"])
        enable_response = client.post(
            "/v1/auth/2fa/enable",
            headers=_auth_headers(initial_token),
            json={
                "secret": setup_payload["secret"],
                "code": code,
                "backup_codes": setup_payload["backup_codes"],
            },
        )
        assert enable_response.status_code == 200
        assert enable_response.json()["enabled"] is True

        logout_response = client.post(
            "/v1/auth/logout",
            headers=_auth_headers(initial_token),
        )
        assert logout_response.status_code == 200

        challenge_response = client.post(
            "/v1/auth/login/challenge",
            json={
                "email": "twofactor@example.com",
                "password": "StrongPassword123",
            },
        )
        assert challenge_response.status_code == 200
        challenge_payload = challenge_response.json()
        assert challenge_payload["status"] == "two_factor_required"
        assert challenge_payload["challenge_token"]

        verify_response = client.post(
            "/v1/auth/login/verify-2fa",
            json={
                "challenge_token": challenge_payload["challenge_token"],
                "code": generate_totp_code(setup_payload["secret"]),
            },
        )
        assert verify_response.status_code == 200
        session_token = verify_response.json()["session_token"]

        me_response = client.get("/v1/auth/me", headers=_auth_headers(session_token))

    assert me_response.status_code == 200
    assert me_response.json()["email"] == "twofactor@example.com"


def test_v1_auth_oauth_connect_and_callback_endpoints(monkeypatch, tmp_path) -> None:
    from datetime import datetime, timezone

    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        "research_os.api.app.create_oauth_connect_url",
        lambda provider, frontend_origin=None: {
            "provider": "orcid",
            "state": "state-123",
            "url": "https://orcid.org/oauth/authorize?state=state-123",
        },
    )
    monkeypatch.setattr(
        "research_os.api.app.complete_oauth_callback",
        lambda provider, state, code, frontend_origin=None: {
            "provider": "orcid",
            "is_new_user": False,
            "user": {
                "id": "user-1",
                "email": "orcid-0000@orcid.local",
                "name": "ORCID User",
                "is_active": True,
                "role": "user",
                "orcid_id": "0000-0002-1825-0097",
                "impact_last_computed_at": None,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            },
            "session_token": "session-token-1",
            "session_expires_at": datetime.now(timezone.utc),
        },
    )

    with TestClient(app) as client:
        connect_response = client.get(
            "/v1/auth/oauth/connect", params={"provider": "orcid"}
        )
        callback_response = client.post(
            "/v1/auth/oauth/callback",
            json={"provider": "orcid", "state": "state-123", "code": "code-123"},
        )

    assert connect_response.status_code == 200
    assert connect_response.json()["provider"] == "orcid"
    assert callback_response.status_code == 200
    assert callback_response.json()["provider"] == "orcid"
    assert callback_response.json()["session_token"] == "session-token-1"


def test_v1_auth_oauth_connect_unhandled_error_still_returns_cors_origin(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    def _raise_unexpected(*, provider, frontend_origin=None):
        raise RuntimeError("unexpected oauth connect failure")

    monkeypatch.setattr(
        "research_os.api.app.create_oauth_connect_url",
        _raise_unexpected,
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(
            "/v1/auth/oauth/connect",
            params={"provider": "orcid"},
            headers={"Origin": "https://app.axiomos.studio"},
        )

    assert response.status_code == 500
    assert (
        response.headers.get("access-control-allow-origin")
        == "https://app.axiomos.studio"
    )


def test_v1_orcid_connect_callback_and_import(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "orcid@example.com",
                "password": "StrongPassword123",
                "name": "ORCID User",
            },
        )
        token = register_response.json()["session_token"]

        monkeypatch.setattr(
            "research_os.api.app.create_orcid_connect_url",
            lambda user_id, frontend_origin=None: {
                "url": "https://orcid.org/oauth/authorize?state=test",
                "state": "test",
            },
        )
        connect_response = client.get("/v1/orcid/connect", headers=_auth_headers(token))

        monkeypatch.setattr(
            "research_os.api.app.complete_orcid_callback",
            lambda state, code, frontend_origin=None: {
                "connected": True,
                "user_id": register_response.json()["user"]["id"],
                "orcid_id": "0000-0002-1825-0097",
            },
        )
        callback_response = client.get(
            "/v1/orcid/callback",
            params={"state": "test", "code": "code-1"},
        )

        monkeypatch.setattr(
            "research_os.api.app.import_orcid_works",
            lambda user_id, overwrite_user_metadata=False: {
                "imported_count": 1,
                "work_ids": ["work-1"],
                "provenance": "orcid",
                "last_synced_at": "2026-02-22T00:00:00Z",
                "core_collaborators": [],
            },
        )
        import_response = client.post(
            "/v1/persona/import/orcid",
            headers=_auth_headers(token),
            json={"overwrite_user_metadata": False},
        )

    assert connect_response.status_code == 200
    assert connect_response.json()["state"] == "test"
    assert callback_response.status_code == 200
    assert callback_response.json()["connected"] is True
    assert import_response.status_code == 200
    assert import_response.json()["imported_count"] == 1


def test_v1_persona_sync_jobs_metrics_flow(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    import research_os.services.persona_sync_job_service as sync_job_service

    monkeypatch.setattr(
        "research_os.services.persona_sync_job_service.sync_metrics",
        lambda user_id, providers: {
            "synced_snapshots": 2,
            "provider_attribution": {"openalex": 2},
            "core_collaborators": [],
        },
    )
    monkeypatch.setattr(
        "research_os.services.persona_sync_job_service.get_publications_analytics_summary",
        lambda **kwargs: {
            "total_citations": 50,
            "h_index": 4,
            "citation_velocity_12m": 1.2,
            "citations_last_12_months": 14,
            "citations_previous_12_months": 9,
            "yoy_percent": 55.5,
            "computed_at": "2026-02-23T00:00:00Z",
        },
    )
    monkeypatch.setattr(
        "research_os.services.persona_sync_job_service._start_persona_sync_thread",
        lambda job_id: sync_job_service._run_persona_sync_job(job_id),
    )

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "persona-sync-jobs@example.com",
                "password": "StrongPassword123",
                "name": "Persona Sync Jobs User",
            },
        )
        token = register_response.json()["session_token"]
        headers = _auth_headers(token)

        enqueue_response = client.post(
            "/v1/persona/jobs/metrics-sync",
            headers=headers,
            json={
                "providers": ["openalex"],
                "refresh_analytics": True,
                "refresh_metrics": False,
            },
        )
        assert enqueue_response.status_code == 200
        enqueue_payload = enqueue_response.json()
        job_id = enqueue_payload["id"]
        assert enqueue_payload["status"] in {"queued", "running", "completed"}

        fetch_response = client.get(f"/v1/persona/jobs/{job_id}", headers=headers)
        assert fetch_response.status_code == 200
        assert fetch_response.json()["status"] == "completed"
        assert (
            fetch_response.json()["result_json"]["metrics_sync"]["synced_snapshots"]
            == 2
        )

        list_response = client.get("/v1/persona/jobs?limit=5", headers=headers)
        assert list_response.status_code == 200
        rows = list_response.json()
        assert len(rows) >= 1
        assert rows[0]["id"] == job_id


def test_v1_orcid_status(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setenv("ORCID_CLIENT_ID", "client-id")
    monkeypatch.setenv("ORCID_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("ORCID_REDIRECT_URI", "http://localhost:5173/orcid/callback")

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "orcid-status@example.com",
                "password": "StrongPassword123",
                "name": "ORCID Status User",
            },
        )
        token = register_response.json()["session_token"]
        headers = _auth_headers(token)
        status_response = client.get("/v1/orcid/status", headers=headers)

    assert status_response.status_code == 200
    payload = status_response.json()
    assert payload["configured"] is True
    assert payload["linked"] is False
    assert payload["can_import"] is False
    assert payload["redirect_uri"] == "http://localhost:5173/orcid/callback"


def test_v1_orcid_disconnect(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "orcid-disconnect@example.com",
                "password": "StrongPassword123",
                "name": "ORCID Disconnect User",
            },
        )
        token = register_response.json()["session_token"]
        monkeypatch.setattr(
            "research_os.api.app.disconnect_orcid",
            lambda user_id: {
                "configured": True,
                "linked": False,
                "orcid_id": None,
                "redirect_uri": "http://localhost:5173/orcid/callback",
                "can_import": False,
                "issues": [],
            },
        )
        response = client.post("/v1/orcid/disconnect", headers=_auth_headers(token))

    assert response.status_code == 200
    payload = response.json()
    assert payload["linked"] is False
    assert payload["orcid_id"] is None


def test_v1_persona_metrics_embeddings_and_impact_flow(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "impact@example.com",
                "password": "StrongPassword123",
                "name": "Impact User",
            },
        )
        assert register_response.status_code == 200
        user_id = register_response.json()["user"]["id"]
        token = register_response.json()["session_token"]
        headers = _auth_headers(token)

        upsert_work(
            user_id=user_id,
            provenance="manual",
            work={
                "title": "4D flow CMR haemodynamic assessment in pulmonary hypertension",
                "year": 2022,
                "doi": "10.0000/example.1",
                "work_type": "Original Research Article",
                "venue_name": "BMJ Open",
                "publisher": "BMJ",
                "abstract": "Retrospective cohort with multivariable regression and haemodynamic markers.",
                "keywords": ["4D flow", "CMR", "haemodynamics"],
                "url": "https://example.org/work1",
                "authors": [
                    {"name": "Impact User", "orcid_id": ""},
                    {"name": "A Collaborator", "orcid_id": ""},
                ],
            },
        )
        upsert_work(
            user_id=user_id,
            provenance="manual",
            work={
                "title": "Imaging biomarker reproducibility in pulmonary hypertension",
                "year": 2024,
                "doi": "10.0000/example.2",
                "work_type": "Original Research Article",
                "venue_name": "Circulation: Cardiovascular Imaging",
                "publisher": "AHA",
                "abstract": "Inter-reader reproducibility study with regression modelling.",
                "keywords": ["reproducibility", "imaging biomarker"],
                "url": "https://example.org/work2",
                "authors": [
                    {"name": "Impact User", "orcid_id": ""},
                    {"name": "A Collaborator", "orcid_id": ""},
                    {"name": "B Collaborator", "orcid_id": ""},
                ],
            },
        )

        metrics_response = client.post(
            "/v1/persona/metrics/sync",
            headers=headers,
            json={"providers": ["manual"]},
        )
        analytics_summary_response = client.get(
            "/v1/publications/analytics/summary",
            headers=headers,
        )
        analytics_timeseries_response = client.get(
            "/v1/publications/analytics/timeseries",
            headers=headers,
        )
        analytics_top_drivers_response = client.get(
            "/v1/publications/analytics/top-drivers",
            headers=headers,
        )
        analytics_bundle_response = client.get(
            "/v1/publications/analytics",
            headers=headers,
        )
        embeddings_response = client.post(
            "/v1/persona/embeddings/generate",
            headers=headers,
            json={},
        )
        recompute_response = client.post("/v1/impact/recompute", headers=headers)
        collaborators_response = client.get("/v1/impact/collaborators", headers=headers)
        themes_response = client.get("/v1/impact/themes", headers=headers)
        analyse_response = client.post("/v1/impact/analyse", headers=headers, json={})
        report_response = client.post("/v1/impact/report", headers=headers, json={})
        context_response = client.get("/v1/persona/context", headers=headers)
        works_response = client.get("/v1/persona/works", headers=headers)

    assert metrics_response.status_code == 200
    assert metrics_response.json()["provider_attribution"]["manual"] >= 1
    assert analytics_summary_response.status_code == 200
    assert analytics_summary_response.json()["total_citations"] >= 0
    assert "citation_velocity_12m" in analytics_summary_response.json()
    assert analytics_timeseries_response.status_code == 200
    assert "points" in analytics_timeseries_response.json()
    assert analytics_top_drivers_response.status_code == 200
    assert "drivers" in analytics_top_drivers_response.json()
    assert analytics_bundle_response.status_code == 200
    assert "payload" in analytics_bundle_response.json()
    assert "status" in analytics_bundle_response.json()
    assert embeddings_response.status_code == 200
    assert embeddings_response.json()["generated_embeddings"] >= 1
    assert recompute_response.status_code == 200
    assert recompute_response.json()["total_works"] == 2
    assert collaborators_response.status_code == 200
    assert len(collaborators_response.json()["collaborators"]) >= 1
    assert themes_response.status_code == 200
    assert len(themes_response.json()["clusters"]) >= 1
    assert analyse_response.status_code == 200
    assert "scholarly_impact_summary" in analyse_response.json()
    assert report_response.status_code == 200
    assert "scholarly_metrics" in report_response.json()
    assert context_response.status_code == 200
    assert "dominant_themes" in context_response.json()
    assert works_response.status_code == 200
    assert len(works_response.json()) == 2


def test_v1_plan_sections_can_include_persona_context(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "planner-context@example.com",
                "password": "StrongPassword123",
                "name": "Planner User",
            },
        )
        token = register_response.json()["session_token"]
        user_id = register_response.json()["user"]["id"]

        upsert_work(
            user_id=user_id,
            provenance="manual",
            work={
                "title": "Longitudinal CMR haemodynamic profiling in pulmonary hypertension",
                "year": 2025,
                "doi": "10.0000/example.3",
                "work_type": "Original Research Article",
                "venue_name": "BMJ Open",
                "publisher": "BMJ",
                "abstract": "Cohort analysis with regression modelling.",
                "keywords": ["CMR", "haemodynamics"],
                "url": "https://example.org/work3",
                "authors": [{"name": "Planner User", "orcid_id": ""}],
            },
        )

        response = client.post(
            "/v1/aawe/plan/sections",
            headers=_auth_headers(token),
            json={
                "target_journal": "ehj",
                "answers": {
                    "population": "Adults with pulmonary hypertension",
                    "analysis_summary": "Adjusted multivariable modelling",
                },
                "sections": ["introduction"],
            },
        )

    assert response.status_code == 200
    payload = response.json()
    evidence_expectations = payload["items"][0]["evidence_expectations"]
    assert any("Persona context from works:" in item for item in evidence_expectations)


def test_v1_collaboration_crud_and_summary(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **_: True,
    )

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "collab-crud@example.com",
                "password": "StrongPassword123",
                "name": "Collab CRUD User",
            },
        )
        token = register_response.json()["session_token"]
        headers = _auth_headers(token)

        create_response = client.post(
            "/v1/account/collaboration/collaborators",
            headers=headers,
            json={
                "full_name": "Jane Collaborator",
                "email": "jane@example.com",
                "orcid_id": "0000-0002-1825-0097",
                "primary_institution": "AAWE Institute",
                "research_domains": ["Cardiology"],
            },
        )
        assert create_response.status_code == 200
        collaborator_id = create_response.json()["id"]

        list_response = client.get(
            "/v1/account/collaboration/collaborators?query=jane&sort=name&page=1&page_size=20",
            headers=headers,
        )
        assert list_response.status_code == 200
        assert list_response.json()["total"] == 1

        get_response = client.get(
            f"/v1/account/collaboration/collaborators/{collaborator_id}",
            headers=headers,
        )
        assert get_response.status_code == 200
        assert get_response.json()["full_name"] == "Jane Collaborator"

        patch_response = client.patch(
            f"/v1/account/collaboration/collaborators/{collaborator_id}",
            headers=headers,
            json={"country": "GB", "current_position": "Professor"},
        )
        assert patch_response.status_code == 200
        assert patch_response.json()["country"] == "GB"

        summary_response = client.get(
            "/v1/account/collaboration/metrics/summary",
            headers=headers,
        )
        assert summary_response.status_code == 200
        assert summary_response.json()["total_collaborators"] == 1

        delete_response = client.delete(
            f"/v1/account/collaboration/collaborators/{collaborator_id}",
            headers=headers,
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["deleted"] is True


def test_v1_collaboration_scoped_to_authenticated_user(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **_: True,
    )

    with TestClient(app) as client:
        register_a = client.post(
            "/v1/auth/register",
            json={
                "email": "collab-a@example.com",
                "password": "StrongPassword123",
                "name": "Collab User A",
            },
        )
        register_b = client.post(
            "/v1/auth/register",
            json={
                "email": "collab-b@example.com",
                "password": "StrongPassword123",
                "name": "Collab User B",
            },
        )
        headers_a = _auth_headers(register_a.json()["session_token"])
        headers_b = _auth_headers(register_b.json()["session_token"])

        create_response = client.post(
            "/v1/account/collaboration/collaborators",
            headers=headers_a,
            json={
                "full_name": "Scoped Collaborator",
                "primary_institution": "Institute X",
            },
        )
        collaborator_id = create_response.json()["id"]

        forbidden_read = client.get(
            f"/v1/account/collaboration/collaborators/{collaborator_id}",
            headers=headers_b,
        )
        assert forbidden_read.status_code == 404


def test_v1_collaboration_import_openalex_endpoint(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.api.app.import_collaborators_from_openalex",
        lambda **_: {
            "created_count": 3,
            "updated_count": 2,
            "skipped_count": 1,
            "openalex_author_id": "https://openalex.org/A123",
            "imported_candidates": 6,
        },
    )

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "collab-import@example.com",
                "password": "StrongPassword123",
                "name": "Collab Import User",
            },
        )
        headers = _auth_headers(register_response.json()["session_token"])
        response = client.post(
            "/v1/account/collaboration/import/openalex",
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json()["created_count"] == 3
    assert response.json()["imported_candidates"] == 6


def test_v1_collaboration_enrich_openalex_endpoint(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.api.app.enrich_collaborators_from_openalex",
        lambda **_: {
            "targeted_count": 4,
            "resolved_author_count": 3,
            "updated_count": 2,
            "unchanged_count": 1,
            "skipped_without_identifier": 1,
            "failed_count": 0,
            "enqueued_metrics_recompute": True,
            "field_updates": {"country": 1, "research_domains": 2},
        },
    )

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "collab-enrich@example.com",
                "password": "StrongPassword123",
                "name": "Collab Enrich User",
            },
        )
        headers = _auth_headers(register_response.json()["session_token"])
        response = client.post(
            "/v1/account/collaboration/enrich/openalex",
            headers=headers,
            json={"only_missing": True, "limit": 200},
        )

    assert response.status_code == 200
    assert response.json()["targeted_count"] == 4
    assert response.json()["updated_count"] == 2
    assert response.json()["field_updates"]["research_domains"] == 2


def test_v1_collaboration_ai_tools_endpoints(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **_: True,
    )

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "collab-ai@example.com",
                "password": "StrongPassword123",
                "name": "Collab AI User",
            },
        )
        token = register_response.json()["session_token"]
        headers = _auth_headers(token)

        create_response = client.post(
            "/v1/account/collaboration/collaborators",
            headers=headers,
            json={
                "full_name": "AI Collaborator",
                "orcid_id": "0000-0002-1825-0097",
                "primary_institution": "AI Institute",
                "research_domains": ["Cardiology", "Machine Learning"],
            },
        )
        assert create_response.status_code == 200

        insights = client.post(
            "/v1/account/collaboration/ai/insights",
            headers=headers,
        )
        assert insights.status_code == 200
        assert insights.json()["status"] == "draft"
        assert isinstance(insights.json()["insights"], list)

        suggestions = client.post(
            "/v1/account/collaboration/ai/author-suggestions",
            headers=headers,
            json={
                "topic_keywords": ["cardiology"],
                "methods": ["machine learning"],
                "limit": 5,
            },
        )
        assert suggestions.status_code == 200
        assert suggestions.json()["status"] == "draft"
        assert isinstance(suggestions.json()["suggestions"], list)

        contribution = client.post(
            "/v1/account/collaboration/ai/contribution-statement",
            headers=headers,
            json={
                "authors": [
                    {
                        "full_name": "AI Collaborator",
                        "roles": ["Conceptualization"],
                        "is_corresponding": True,
                    }
                ]
            },
        )
        assert contribution.status_code == 200
        assert contribution.json()["status"] == "draft"
        assert "AI Collaborator" in contribution.json()["draft_text"]

        affiliations = client.post(
            "/v1/account/collaboration/ai/affiliations-normaliser",
            headers=headers,
            json={
                "authors": [
                    {
                        "full_name": "AI Collaborator",
                        "institution": "AI Institute",
                        "orcid_id": "0000-0002-1825-0097",
                    }
                ]
            },
        )
        assert affiliations.status_code == 200
        assert affiliations.json()["status"] == "draft"
        assert "AI Institute" in affiliations.json()["affiliations_block"]


def test_v1_manuscript_author_suggestions_and_save(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **_: True,
    )

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "manu-authors@example.com",
                "password": "StrongPassword123",
                "name": "Manuscript Authors User",
            },
        )
        token = register_response.json()["session_token"]
        headers = _auth_headers(token)

        create_collab = client.post(
            "/v1/account/collaboration/collaborators",
            headers=headers,
            json={
                "full_name": "Suggested Collaborator",
                "orcid_id": "0000-0002-1825-0097",
                "primary_institution": "Institution Suggestion",
            },
        )
        assert create_collab.status_code == 200
        collaborator_id = create_collab.json()["id"]

        project_response = client.post(
            "/v1/projects",
            json={
                "title": "Authors Project",
                "target_journal": "ehj",
                "study_type": "cohort",
            },
        )
        assert project_response.status_code == 200
        project_id = project_response.json()["id"]
        manuscript_response = client.post(
            f"/v1/projects/{project_id}/manuscripts",
            json={"branch_name": "main", "sections": ["introduction"]},
        )
        assert manuscript_response.status_code == 200
        manuscript_id = manuscript_response.json()["id"]

        suggestions_response = client.get(
            "/v1/manuscript/authors/suggestions?query=suggested&limit=20",
            headers=headers,
        )
        assert suggestions_response.status_code == 200
        assert len(suggestions_response.json()["items"]) >= 1

        save_response = client.post(
            f"/v1/manuscript/{manuscript_id}/authors",
            headers=headers,
            json={
                "authors": [
                    {
                        "collaborator_id": collaborator_id,
                        "full_name": "Suggested Collaborator",
                        "orcid_id": "0000-0002-1825-0097",
                        "institution": "Institution Suggestion",
                        "is_corresponding": True,
                        "equal_contribution": False,
                        "is_external": False,
                    },
                    {
                        "full_name": "External Author",
                        "institution": "External Institution",
                        "is_corresponding": False,
                        "equal_contribution": True,
                        "is_external": True,
                    },
                ],
                "affiliations": [
                    {
                        "institution_name": "Institution Suggestion",
                        "superscript_number": 1,
                    },
                    {
                        "institution_name": "External Institution",
                        "superscript_number": 2,
                    },
                ],
            },
        )
        assert save_response.status_code == 200
        assert len(save_response.json()["authors"]) == 2
        assert "Corresponding author" in save_response.json()["rendered_authors_block"]

        get_response = client.get(
            f"/v1/manuscript/{manuscript_id}/authors",
            headers=headers,
        )
        assert get_response.status_code == 200
        assert len(get_response.json()["authors"]) == 2

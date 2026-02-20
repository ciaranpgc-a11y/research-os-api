from fastapi.testclient import TestClient

from research_os.api.app import app


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

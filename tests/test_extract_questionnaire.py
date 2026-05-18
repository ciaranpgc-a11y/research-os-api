"""Tests for extract study entry questionnaire persistence."""


def _setup_extract_db(monkeypatch, tmp_path):
    db_path = tmp_path / "extract_questionnaire_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str((tmp_path / "dl").resolve()))

    from research_os.db import reset_database_state

    reset_database_state()

    import research_os.extract_auth.service as auth_svc

    auth_svc._admin_seeded = False


def test_questionnaire_empty_state(monkeypatch, tmp_path):
    _setup_extract_db(monkeypatch, tmp_path)

    from research_os.extract_questionnaire import service

    result = service.get_questionnaire("HN001")

    assert result["id"] is None
    assert result["hn"] == "HN001"
    assert result["data"] == {}


def test_questionnaire_save_and_update(monkeypatch, tmp_path):
    _setup_extract_db(monkeypatch, tmp_path)

    from research_os.extract_questionnaire import service

    created = service.save_questionnaire(
        "HN002",
        {
            "general_health": "Good",
            "conditions": ["Asthma", "Pulmonary hypertension"],
        },
    )
    updated = service.save_questionnaire(
        "HN002",
        {
            "general_health": "Very good",
            "overall_health_score": "82",
        },
    )

    assert created["id"] == updated["id"]
    assert updated["data"] == {
        "general_health": "Very good",
        "overall_health_score": "82",
    }

    fetched = service.get_questionnaire("HN002")
    assert fetched["data"]["general_health"] == "Very good"
    assert fetched["data"]["overall_health_score"] == "82"

"""Tests for Extract per-patient clinical data persistence."""


def _setup_extract_db(monkeypatch, tmp_path):
    db_path = tmp_path / "extract_clinical_data_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str((tmp_path / "dl").resolve()))

    from research_os.db import reset_database_state

    reset_database_state()

    import research_os.extract_auth.service as auth_svc

    auth_svc._admin_seeded = False


def test_clinical_data_empty_state(monkeypatch, tmp_path):
    _setup_extract_db(monkeypatch, tmp_path)

    from research_os.extract_clinical_data import service

    result = service.get_clinical_data("HN001")

    assert result["id"] is None
    assert result["hn"] == "HN001"
    assert result["data"] == {}


def test_clinical_data_save_and_update(monkeypatch, tmp_path):
    _setup_extract_db(monkeypatch, tmp_path)

    from research_os.extract_clinical_data import service

    created = service.save_clinical_data(
        "HN002",
        {
            "clinical_data_completed": True,
            "conditions": {"COPD / emphysema": "Relevant"},
            "medications": [
                {
                    "id": "med-1",
                    "name": "Furosemide",
                    "route": "PO",
                    "dose": "40 mg",
                    "frequency": "OD",
                    "indication": "Fluid overload",
                    "commenced": "2025",
                }
            ],
            "additional_conditions": [
                {
                    "id": "condition-1",
                    "condition": "Previous pneumothorax",
                    "details": "Right-sided, treated conservatively",
                }
            ],
        },
    )
    updated = service.save_clinical_data(
        "HN002",
        {
            "clinical_data_completed": False,
            "conditions": {"Atrial fibrillation / flutter": "Present"},
            "additional_conditions": [
                {
                    "id": "condition-2",
                    "condition": "Frailty",
                    "details": "Uses walking aid",
                }
            ],
            "medications": [],
        },
    )

    assert created["id"] == updated["id"]
    assert updated["data"] == {
        "conditions": {"Atrial fibrillation / flutter": "Present"},
        "clinical_data_completed": False,
        "additional_conditions": [
            {
                "id": "condition-2",
                "condition": "Frailty",
                "details": "Uses walking aid",
            }
        ],
        "medications": [],
    }

    fetched = service.get_clinical_data("HN002")
    assert fetched["data"]["conditions"]["Atrial fibrillation / flutter"] == "Present"
    assert fetched["data"]["additional_conditions"][0]["condition"] == "Frailty"
    assert fetched["data"]["medications"] == []

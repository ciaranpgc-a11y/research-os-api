"""Tests for extract records service functions."""

import pytest


def _setup_extract_db(monkeypatch, tmp_path):
    """Point the DB at a fresh SQLite file and reset singletons."""
    db_path = tmp_path / "extract_records_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str((tmp_path / "dl").resolve()))

    from research_os.db import reset_database_state

    reset_database_state()

    import research_os.extract_auth.service as auth_svc

    auth_svc._admin_seeded = False


@pytest.fixture()
def svc(monkeypatch, tmp_path):
    _setup_extract_db(monkeypatch, tmp_path)
    from research_os.extract_records import service as records_svc

    return records_svc


@pytest.fixture()
def patients_svc(monkeypatch, tmp_path):
    from research_os.extract_patients import service as svc

    return svc


# ---------------------------------------------------------------------------
# Helper to create a patient first (records need an hn but no FK enforced)
# ---------------------------------------------------------------------------


def _create_patient(patients_svc, hn="HN001"):
    """Create a patient for record tests."""
    patients_svc.create_patient(hn=hn, name=f"Patient {hn}")


# --- RHC records ---


def test_create_rhc_record(svc, patients_svc):
    _create_patient(patients_svc, "HN100")
    result = svc.create_record("rhc", {"hn": "HN100", "pa_mean": 25.0, "pvr_wu": 3.5})
    assert result["hn"] == "HN100"
    assert result["pa_mean"] == 25.0
    assert result["pvr_wu"] == 3.5
    assert "id" in result
    assert "created_at" in result


def test_list_rhc_records_by_hn(svc, patients_svc):
    _create_patient(patients_svc, "HN101")
    _create_patient(patients_svc, "HN102")

    svc.create_record("rhc", {"hn": "HN101", "pa_mean": 20.0})
    svc.create_record("rhc", {"hn": "HN101", "pa_mean": 22.0})
    svc.create_record("rhc", {"hn": "HN102", "pa_mean": 30.0})

    # List all
    all_records = svc.list_records("rhc")
    assert len(all_records) == 3

    # Filter by hn
    hn101_records = svc.list_records("rhc", hn="HN101")
    assert len(hn101_records) == 2
    assert all(r["hn"] == "HN101" for r in hn101_records)


def test_get_record_detail(svc, patients_svc):
    _create_patient(patients_svc, "HN103")
    created = svc.create_record(
        "rhc",
        {
            "hn": "HN103",
            "pa_mean": 28.0,
            "pvr_wu": 4.0,
            "cardiac_output": 5.5,
            "rhc_comments": "Test comment",
        },
    )
    record_id = created["id"]

    detail = svc.get_record("rhc", record_id)
    assert detail["id"] == record_id
    assert detail["hn"] == "HN103"
    assert detail["pa_mean"] == 28.0
    assert detail["rhc_comments"] == "Test comment"
    # Detail should include all columns (more than summary keys)
    assert "ra_mean" in detail
    assert "rv_systolic" in detail


def test_update_record(svc, patients_svc):
    _create_patient(patients_svc, "HN104")
    created = svc.create_record("rhc", {"hn": "HN104", "pa_mean": 20.0})
    record_id = created["id"]

    updated = svc.update_record("rhc", record_id, {"pa_mean": 35.0})
    assert updated["pa_mean"] == 35.0

    # Verify via get
    fetched = svc.get_record("rhc", record_id)
    assert fetched["pa_mean"] == 35.0


def test_delete_record(svc, patients_svc):
    _create_patient(patients_svc, "HN105")
    created = svc.create_record("rhc", {"hn": "HN105", "pa_mean": 15.0})
    record_id = created["id"]

    svc.delete_record("rhc", record_id)

    with pytest.raises(svc.ExtractRecordNotFoundError):
        svc.get_record("rhc", record_id)


def test_delete_record_not_found(svc):
    with pytest.raises(svc.ExtractRecordNotFoundError):
        svc.delete_record("rhc", "nonexistent-id")


# --- Invalid modality ---


def test_invalid_modality(svc):
    with pytest.raises(ValueError, match="Unknown modality"):
        svc.list_records("invalid")


# --- Echo records ---


def test_create_echo_record(svc, patients_svc):
    _create_patient(patients_svc, "HN200")
    result = svc.create_record(
        "echo", {"hn": "HN200", "lvef": 55.0, "tapse": 22.0, "rvsp": 35.0}
    )
    assert result["hn"] == "HN200"
    assert result["lvef"] == 55.0
    assert "id" in result


# --- CMR records ---


def test_create_cmr_record(svc, patients_svc):
    _create_patient(patients_svc, "HN300")
    result = svc.create_record(
        "cmr",
        {
            "hn": "HN300",
            "lvef": "60%",
            "rvef": "55%",
            "cmr_class": "Normal",
            "flow": "4D-flow",
        },
    )
    assert result["hn"] == "HN300"
    assert result["lvef"] == "60%"
    assert result["cmr_class"] == "Normal"
    assert result["flow"] == "4D-flow"
    assert svc.list_records("cmr", hn="HN300")[0]["flow"] == "4D-flow"
    assert "id" in result


# --- CPEX records ---


def test_create_cpex_record(svc, patients_svc):
    _create_patient(patients_svc, "HN400")
    result = svc.create_record(
        "cpex", {"hn": "HN400", "date_cpex": "2024-01-15", "source_file": "test.pdf"}
    )
    assert result["hn"] == "HN400"
    assert result["date_cpex"] == "2024-01-15"
    assert "id" in result

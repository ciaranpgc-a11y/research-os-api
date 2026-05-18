"""Tests for extract patients service functions."""

import pytest


def _setup_extract_db(monkeypatch, tmp_path):
    """Point the DB at a fresh SQLite file and reset singletons."""
    db_path = tmp_path / "extract_patients_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str((tmp_path / "dl").resolve()))

    from research_os.db import reset_database_state

    reset_database_state()

    import research_os.extract_auth.service as auth_svc

    auth_svc._admin_seeded = False


@pytest.fixture()
def patients_svc(monkeypatch, tmp_path):
    _setup_extract_db(monkeypatch, tmp_path)
    from research_os.extract_patients import service as svc

    return svc


@pytest.fixture()
def records_svc(monkeypatch, tmp_path):
    """Return the records service for stats tests (shares DB with patients_svc)."""
    from research_os.extract_records import service as svc

    return svc


@pytest.fixture()
def recruitment_svc(monkeypatch, tmp_path):
    from research_os.extract_recruitment import service as svc

    return svc


# --- Create patient ---


def test_create_patient(patients_svc):
    result = patients_svc.create_patient(
        hn="HN001",
        name="Alice Smith",
        dob="1990-01-01",
        gender="F",
        anonymisation_code="APH-001",
        tracking_details="Needs follow-up",
    )
    assert result["hn"] == "HN001"
    assert result["name"] == "Alice Smith"
    assert result["dob"] == "1990-01-01"
    assert result["gender"] == "F"
    assert result["anonymisation_code"] == "APH-001"
    assert result["images_uploaded"] is False
    assert result["rip_tag"] is False
    assert result["tracking_details"] == "Needs follow-up"
    assert "id" in result
    assert "created_at" in result


def test_create_duplicate_hn_fails(patients_svc):
    patients_svc.create_patient(hn="HN002", name="Bob")
    with pytest.raises(patients_svc.ExtractPatientValidationError):
        patients_svc.create_patient(hn="HN002", name="Bob Again")


# --- List patients ---


def test_list_patients(patients_svc):
    patients_svc.create_patient(hn="HN010", name="Patient A")
    patients_svc.create_patient(hn="HN011", name="Patient B")
    patients_svc.create_patient(hn="HN012", name="Patient C")

    results = patients_svc.list_patients()
    assert len(results) == 3


def test_list_patients_limit_zero_returns_all_rows(patients_svc):
    patients_svc.create_patient(hn="HN013", name="Patient D")
    patients_svc.create_patient(hn="HN014", name="Patient E")
    patients_svc.create_patient(hn="HN015", name="Patient F")

    results = patients_svc.list_patients(limit=0)
    assert len(results) == 3


# --- Search patients ---


def test_search_patients(patients_svc):
    patients_svc.create_patient(hn="HN020", name="Alice Wonder")
    patients_svc.create_patient(hn="HN021", name="Bob Builder")
    patients_svc.create_patient(hn="HN022", name="Alice Springs")

    results = patients_svc.list_patients(search="Alice")
    assert len(results) == 2
    names = [r["name"] for r in results]
    assert "Bob Builder" not in names


def test_filter_patients_by_recruitment_status_and_source(patients_svc, recruitment_svc):
    patients_svc.create_patient(hn="HN023", name="Source Match")
    patients_svc.create_patient(hn="HN024", name="Other Status")
    patients_svc.create_patient(hn="HN025", name="No Recruitment")

    recruitment_svc.create_recruitment(
        "HN023",
        {
            "recruitment_status": "Screening",
            "source": "Thoracic",
        },
    )
    recruitment_svc.create_recruitment(
        "HN024",
        {
            "recruitment_status": "Completed",
            "source": "RACPC",
        },
    )

    status_results = patients_svc.list_patients(status="Screening")
    assert [row["hn"] for row in status_results] == ["HN023"]

    source_results = patients_svc.list_patients(source="RACPC")
    assert [row["hn"] for row in source_results] == ["HN024"]

    no_status_results = patients_svc.list_patients(status="__none__")
    assert [row["hn"] for row in no_status_results] == ["HN025"]

    no_source_results = patients_svc.list_patients(source="__none__")
    assert [row["hn"] for row in no_source_results] == ["HN025"]

    assert patients_svc.count_patients(status="Screening") == 1
    assert patients_svc.count_patients(source="RACPC") == 1


def test_patient_summaries_translate_legacy_investigation_statuses(patients_svc):
    from research_os.db import create_all_tables, session_scope
    from research_os.extract_recruitment.models import ExtractStudyRecruitment

    patients_svc.create_patient(hn="HN026", name="Legacy Status")
    create_all_tables()
    with session_scope() as session:
        session.add(
            ExtractStudyRecruitment(
                hn="HN026",
                inx_rhc="Booked",
                inx_echo="Pending",
                inx_cmr="Booked",
                inx_cpex="Pending",
            )
        )

    listed = patients_svc.list_patients(search="Legacy Status")
    assert listed[0]["inx_rhc"] == "Requested"
    assert listed[0]["inx_echo"] == "Await report"
    assert listed[0]["inx_cmr"] == "Requested"
    assert listed[0]["inx_cpex"] == "Await report"

    detail = patients_svc.get_patient("HN026")
    assert detail["inx_rhc"] == "Requested"
    assert detail["inx_echo"] == "Await report"
    assert detail["inx_cmr"] == "Requested"
    assert detail["inx_cpex"] == "Await report"


# --- Get patient ---


def test_get_patient(patients_svc):
    patients_svc.create_patient(hn="HN030", name="Charlie")

    result = patients_svc.get_patient("HN030")
    assert result["hn"] == "HN030"
    assert result["name"] == "Charlie"
    # Record counts should all be 0
    assert result["rhc_count"] == 0
    assert result["echo_count"] == 0
    assert result["cmr_count"] == 0
    assert result["cpex_count"] == 0


def test_get_patient_not_found(patients_svc):
    with pytest.raises(patients_svc.ExtractPatientNotFoundError):
        patients_svc.get_patient("NONEXISTENT")


# --- Update patient ---


def test_update_patient(patients_svc):
    patients_svc.create_patient(hn="HN040", name="Original Name")

    result = patients_svc.update_patient(
        "HN040",
        name="Updated Name",
        anonymisation_code="APH-040",
        images_uploaded=True,
        rip_tag=True,
        tracking_details="Review CMR before clinic",
    )
    assert result["name"] == "Updated Name"
    assert result["anonymisation_code"] == "APH-040"
    assert result["images_uploaded"] is True
    assert result["rip_tag"] is True
    assert result["tracking_details"] == "Review CMR before clinic"
    assert result["hn"] == "HN040"

    # Verify via get
    fetched = patients_svc.get_patient("HN040")
    assert fetched["name"] == "Updated Name"
    assert fetched["anonymisation_code"] == "APH-040"
    assert fetched["images_uploaded"] is True
    assert fetched["rip_tag"] is True
    assert fetched["tracking_details"] == "Review CMR before clinic"


def test_update_patient_not_found(patients_svc):
    with pytest.raises(patients_svc.ExtractPatientNotFoundError):
        patients_svc.update_patient("NONEXISTENT", name="X")


# --- Find or create ---


def test_find_or_create_existing(patients_svc):
    patients_svc.create_patient(hn="HN050", name="Existing Patient")

    result = patients_svc.find_or_create_patient("HN050", name="Should Not Overwrite")
    assert result["hn"] == "HN050"
    assert result["name"] == "Existing Patient"  # name unchanged

    # Verify no duplicate created
    all_patients = patients_svc.list_patients()
    assert len(all_patients) == 1


def test_find_or_create_new(patients_svc):
    result = patients_svc.find_or_create_patient("HN060", name="New Patient")
    assert result["hn"] == "HN060"
    assert result["name"] == "New Patient"


# --- Stats ---


def test_get_stats(patients_svc, records_svc):
    patients_svc.create_patient(hn="HN070", name="Stats Patient 1")
    patients_svc.create_patient(hn="HN071", name="Stats Patient 2")

    # Create some records
    records_svc.create_record("rhc", {"hn": "HN070", "pa_mean": 25.0})
    records_svc.create_record("rhc", {"hn": "HN071", "pa_mean": 30.0})
    records_svc.create_record("echo", {"hn": "HN070", "lvef": 55.0})

    stats = patients_svc.get_stats()
    assert stats["total_patients"] == 2
    assert stats["rhc_count"] == 2
    assert stats["echo_count"] == 1
    assert stats["cmr_count"] == 0
    assert stats["cpex_count"] == 0


def test_delete_patient_removes_recruitment_and_records(patients_svc, records_svc, recruitment_svc):
    patient = patients_svc.create_patient(hn="HN080", name="Delete Me")
    recruitment_svc.create_recruitment(
        "HN080",
        {
            "patient_id": patient["id"],
            "cohort": "Suspected PH",
            "recruitment_status": "Identified",
        },
    )
    records_svc.create_record("echo", {"hn": "HN080", "study_date": "2025-04-02", "ph_prob": "High"})

    patients_svc.delete_patient("HN080")

    with pytest.raises(patients_svc.ExtractPatientNotFoundError):
        patients_svc.get_patient("HN080")
    assert recruitment_svc.list_recruitment() == []
    assert records_svc.list_records("echo", hn="HN080") == []

"""Tests for extract recruitment structured notes."""

import pytest


def _setup_extract_db(monkeypatch, tmp_path):
    db_path = tmp_path / "extract_recruitment_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str((tmp_path / "dl").resolve()))

    from research_os.db import reset_database_state

    reset_database_state()

    import research_os.extract_auth.service as auth_svc

    auth_svc._admin_seeded = False


@pytest.fixture()
def recruitment_svc(monkeypatch, tmp_path):
    _setup_extract_db(monkeypatch, tmp_path)
    from research_os.extract_recruitment import service as svc

    return svc


def test_structured_recruitment_note_crud(recruitment_svc):
    created = recruitment_svc.create_note(
        "HN700",
        {
            "author_name": "CGC",
            "note_date": "20/04/2026",
            "body": "Emailed PG. Suitable for CPEX.",
        },
        author_name="Admin",
        author_access_code_id="admin",
    )

    assert created["hn"] == "HN700"
    assert created["author_name"] == "CGC"
    assert created["author_access_code_id"] == "admin"
    assert created["note_date"] == "20/04/2026"
    assert created["body"] == "Emailed PG. Suitable for CPEX."

    listed = recruitment_svc.list_notes("HN700")
    assert [note["id"] for note in listed] == [created["id"]]

    updated = recruitment_svc.update_note(
        "HN700",
        created["id"],
        {
            "author_name": "CGC",
            "note_date": "21/04/2026",
            "body": "Updated note.",
        },
    )
    assert updated["note_date"] == "21/04/2026"
    assert updated["body"] == "Updated note."

    recruitment_svc.delete_note("HN700", created["id"])
    assert recruitment_svc.list_notes("HN700") == []


def test_structured_recruitment_note_requires_body(recruitment_svc):
    with pytest.raises(ValueError):
        recruitment_svc.create_note("HN701", {"body": "   "})


def test_recruitment_investigation_statuses_translate_booked_to_requested(recruitment_svc):
    from research_os.db import create_all_tables, session_scope
    from research_os.extract_recruitment.models import ExtractStudyRecruitment

    create_all_tables()
    with session_scope() as session:
        session.add(
            ExtractStudyRecruitment(
                hn="HN702",
                recruitment_status="Identified",
                inx_rhc="Booked",
                inx_echo="Booked",
                inx_cmr="Booked",
                inx_cpex="Pending",
            )
        )

    stored = recruitment_svc.get_recruitment("HN702")
    assert stored["inx_rhc"] == "Requested"
    assert stored["inx_echo"] == "Requested"
    assert stored["inx_cmr"] == "Requested"
    assert stored["inx_cpex"] == "Await report"

    updated = recruitment_svc.update_recruitment(
        "HN702",
        {
            "inx_rhc": "Booked",
            "inx_echo": "Scheduled",
            "inx_cmr": "Await report",
            "inx_cpex": "Declined",
        },
    )
    assert updated["inx_rhc"] == "Requested"
    assert updated["inx_echo"] == "Scheduled"
    assert updated["inx_cmr"] == "Await report"
    assert updated["inx_cpex"] == "Declined"

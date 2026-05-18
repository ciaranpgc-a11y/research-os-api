"""Tests for standalone extract tracking entries."""

import pytest


@pytest.fixture()
def tracking_svc(monkeypatch, tmp_path):
    db_path = tmp_path / "extract_tracking_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str((tmp_path / "dl").resolve()))

    from research_os.db import reset_database_state

    reset_database_state()

    from research_os.extract_tracking import service as svc

    return svc


def test_tracking_entries_are_separate_from_patients(tracking_svc):
    from research_os.extract_patients import service as patients_svc

    entry = tracking_svc.create_tracking_entry(
        name="New Referral",
        hn="HN900",
        details="Await referral letter",
    )

    assert entry["name"] == "New Referral"
    assert entry["hn"] == "HN900"
    assert entry["details"] == "Await referral letter"
    assert tracking_svc.list_tracking_entries()[0]["id"] == entry["id"]
    assert patients_svc.list_patients(limit=0) == []


def test_update_and_delete_tracking_entry(tracking_svc):
    entry = tracking_svc.create_tracking_entry(name="Before", hn="HN901")

    updated = tracking_svc.update_tracking_entry(
        entry["id"],
        name="After",
        details="Booked for triage",
    )
    assert updated["name"] == "After"
    assert updated["details"] == "Booked for triage"

    tracking_svc.delete_tracking_entry(entry["id"])
    assert tracking_svc.list_tracking_entries() == []


def test_tracking_entry_requires_name_or_hn(tracking_svc):
    with pytest.raises(tracking_svc.ExtractTrackingValidationError):
        tracking_svc.create_tracking_entry(details="No identity")


def test_booking_entries_are_separate_from_patients(tracking_svc):
    from research_os.extract_patients import service as patients_svc

    booking = tracking_svc.create_booking_entry(
        name="New Booking",
        hn="HN902",
        investigation="RHC",
        booking_date="2026-05-12",
        booking_time="13:30",
        details="Needs scanner slot",
    )

    assert booking["name"] == "New Booking"
    assert booking["hn"] == "HN902"
    assert booking["investigation"] == "RHC"
    assert booking["booking_date"] == "2026-05-12"
    assert booking["booking_time"] == "13:30"
    assert booking["details"] == "Needs scanner slot"
    assert tracking_svc.list_booking_entries()[0]["id"] == booking["id"]
    assert patients_svc.list_patients(limit=0) == []


def test_update_and_delete_booking_entry(tracking_svc):
    booking = tracking_svc.create_booking_entry(
        name="Before",
        hn="HN903",
        investigation="Echo",
        booking_date="2026-05-13",
    )

    updated = tracking_svc.update_booking_entry(
        booking["id"],
        investigation="CPEX",
        booking_date="2026-05-14",
        booking_time="09:15",
        details="Moved after phone call",
    )
    assert updated["investigation"] == "CPEX"
    assert updated["booking_date"] == "2026-05-14"
    assert updated["booking_time"] == "09:15"
    assert updated["details"] == "Moved after phone call"

    tracking_svc.delete_booking_entry(booking["id"])
    assert tracking_svc.list_booking_entries() == []


def test_booking_entry_validation(tracking_svc):
    with pytest.raises(tracking_svc.ExtractTrackingValidationError):
        tracking_svc.create_booking_entry(name="No date", investigation="CMR")

    with pytest.raises(tracking_svc.ExtractTrackingValidationError):
        tracking_svc.create_booking_entry(
            name="Bad investigation",
            investigation="CT",
            booking_date="2026-05-12",
        )

    with pytest.raises(tracking_svc.ExtractTrackingValidationError):
        tracking_svc.create_booking_entry(
            name="Bad time",
            investigation="CMR",
            booking_date="2026-05-12",
            booking_time="27:80",
        )

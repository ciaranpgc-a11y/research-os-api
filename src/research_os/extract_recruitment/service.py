"""Extract study recruitment persistence service."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, update

from research_os.db import create_all_tables, session_scope
from research_os.extract_patients import models as patient_models
from research_os.extract_recruitment.models import ExtractRecruitmentNote, ExtractStudyRecruitment

_EXTRACT_PATIENT_MODEL = patient_models.ExtractPatient
_INVESTIGATION_STATUS_FIELDS = {"inx_rhc", "inx_echo", "inx_cmr", "inx_cpex"}
_INVESTIGATION_STATUS_ALIASES = {
    "Booked": "Requested",
    "Pending": "Await report",
}


class ExtractRecruitmentNotFoundError(RuntimeError):
    pass


class ExtractRecruitmentNoteNotFoundError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _trim(value: Any) -> str:
    return str(value or "").strip()


def normalize_investigation_status(value: Any) -> Any:
    if value is None:
        return None
    clean_value = _trim(value)
    if not clean_value:
        return ""
    return _INVESTIGATION_STATUS_ALIASES.get(clean_value, clean_value)


def _normalize_recruitment_data(data: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(data)
    for field in _INVESTIGATION_STATUS_FIELDS:
        if field in normalized:
            normalized[field] = normalize_investigation_status(normalized[field])
    return normalized


def _serialize_recruitment(row: ExtractStudyRecruitment) -> dict[str, Any]:
    return {
        "id": row.id,
        "hn": row.hn,
        "patient_id": row.patient_id,
        "eligible_for_study": row.eligible_for_study,
        "cohort": row.cohort,
        "contact_method": row.contact_method,
        "contact_number": row.contact_number,
        "email_address": row.email_address,
        "recruitment_status": row.recruitment_status,
        "comments": row.comments,
        "date_identified": row.date_identified,
        "date_first_contact": row.date_first_contact,
        "date_pis_sent": row.date_pis_sent,
        "date_consent": row.date_consent,
        "cpex_date": row.cpex_date,
        "consent_to_email": row.consent_to_email,
        "pis_sent": row.pis_sent,
        "consent_obtained": row.consent_obtained,
        "cpex_required": row.cpex_required,
        "cpex_booked": row.cpex_booked,
        "cpex_completed": row.cpex_completed,
        "created_at": _iso(row.created_at),
        "status": row.status,
        "cpex_scheduled": row.cpex_scheduled,
        "cmr_required": row.cmr_required,
        "cmr_requested": row.cmr_requested,
        "cmr_scheduled": row.cmr_scheduled,
        "cmr_completed": row.cmr_completed,
        "rhc_required": row.rhc_required,
        "rhc_requested": row.rhc_requested,
        "rhc_scheduled": row.rhc_scheduled,
        "rhc_completed": row.rhc_completed,
        "echo_required": row.echo_required,
        "echo_requested": row.echo_requested,
        "echo_scheduled": row.echo_scheduled,
        "echo_completed": row.echo_completed,
        "cpex_appropriate": row.cpex_appropriate,
        "cmr_appropriate": row.cmr_appropriate,
        "rhc_appropriate": row.rhc_appropriate,
        "echo_appropriate": row.echo_appropriate,
        "source": row.source,
        "notes": getattr(row, 'notes', None),
        "inx_rhc": normalize_investigation_status(getattr(row, "inx_rhc", None)),
        "inx_echo": normalize_investigation_status(getattr(row, "inx_echo", None)),
        "inx_cmr": normalize_investigation_status(getattr(row, "inx_cmr", None)),
        "inx_cpex": normalize_investigation_status(getattr(row, "inx_cpex", None)),
    }


def _serialize_note(row: ExtractRecruitmentNote) -> dict[str, Any]:
    return {
        "id": row.id,
        "hn": row.hn,
        "author_name": row.author_name,
        "author_access_code_id": row.author_access_code_id,
        "note_date": row.note_date,
        "body": row.body,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }


def _clean_note_body(value: Any) -> str:
    body = str(value or "").strip()
    if not body:
        raise ValueError("note body is required")
    return body


def _clean_note_date(value: Any) -> str:
    return _trim(value) or _utcnow().strftime("%d/%m/%Y")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def list_recruitment(
    cohort: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """List recruitment records, filterable by cohort and recruitment_status."""
    create_all_tables()
    with session_scope() as session:
        stmt = select(ExtractStudyRecruitment)
        if cohort:
            stmt = stmt.where(ExtractStudyRecruitment.cohort == cohort)
        if status:
            stmt = stmt.where(ExtractStudyRecruitment.recruitment_status == status)
        stmt = stmt.order_by(ExtractStudyRecruitment.created_at.desc()).limit(limit).offset(offset)
        rows = session.scalars(stmt).all()
        return [_serialize_recruitment(row) for row in rows]


def get_recruitment(hn: str) -> dict[str, Any]:
    """Get recruitment record for a patient by hospital number."""
    create_all_tables()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractStudyRecruitment).where(ExtractStudyRecruitment.hn == hn)
        ).first()
        if row is None:
            raise ExtractRecruitmentNotFoundError("Recruitment record not found")
        return _serialize_recruitment(row)


def create_recruitment(hn: str, data: dict[str, Any]) -> dict[str, Any]:
    """Create recruitment record for a patient."""
    create_all_tables()
    clean_hn = _trim(hn)
    if not clean_hn:
        raise ValueError("hn is required")

    with session_scope() as session:
        row = ExtractStudyRecruitment(hn=clean_hn, **_normalize_recruitment_data(data))
        session.add(row)
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_recruitment(row)


def update_recruitment(hn: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update recruitment record fields."""
    create_all_tables()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractStudyRecruitment).where(ExtractStudyRecruitment.hn == hn)
        ).first()
        if row is None:
            raise ExtractRecruitmentNotFoundError("Recruitment record not found")

        for key, value in _normalize_recruitment_data(data).items():
            if hasattr(row, key) and key not in ("id", "hn", "created_at"):
                setattr(row, key, value)

        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_recruitment(row)


def bulk_update_status(hns: list[str], status: str) -> int:
    """Update recruitment_status for multiple patients. Returns count updated."""
    create_all_tables()
    with session_scope() as session:
        result = session.execute(
            update(ExtractStudyRecruitment)
            .where(ExtractStudyRecruitment.hn.in_(hns))
            .values(recruitment_status=status)
        )
        return result.rowcount


def list_notes(hn: str) -> list[dict[str, Any]]:
    """List structured recruitment notes for a patient."""
    clean_hn = _trim(hn)
    if not clean_hn:
        return []
    create_all_tables()
    with session_scope() as session:
        rows = session.scalars(
            select(ExtractRecruitmentNote)
            .where(ExtractRecruitmentNote.hn == clean_hn)
            .order_by(ExtractRecruitmentNote.created_at.desc())
        ).all()
        return [_serialize_note(row) for row in rows]


def create_note(
    hn: str,
    data: dict[str, Any],
    *,
    author_name: str | None = None,
    author_access_code_id: str | None = None,
) -> dict[str, Any]:
    """Create a structured recruitment note."""
    clean_hn = _trim(hn)
    if not clean_hn:
        raise ValueError("hn is required")
    body = _clean_note_body(data.get("body"))
    clean_author = _trim(data.get("author_name")) or _trim(author_name) or None
    clean_date = _clean_note_date(data.get("note_date"))

    create_all_tables()
    with session_scope() as session:
        row = ExtractRecruitmentNote(
            hn=clean_hn,
            author_name=clean_author,
            author_access_code_id=_trim(author_access_code_id) or None,
            note_date=clean_date,
            body=body,
            created_at=_utcnow(),
            updated_at=_utcnow(),
        )
        session.add(row)
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_note(row)


def update_note(
    hn: str,
    note_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Update a structured recruitment note."""
    clean_hn = _trim(hn)
    clean_id = _trim(note_id)
    if not clean_hn or not clean_id:
        raise ExtractRecruitmentNoteNotFoundError("Recruitment note not found")

    updates: dict[str, Any] = {}
    if "body" in data:
        updates["body"] = _clean_note_body(data.get("body"))
    if "author_name" in data:
        updates["author_name"] = _trim(data.get("author_name")) or None
    if "note_date" in data:
        updates["note_date"] = _clean_note_date(data.get("note_date"))

    create_all_tables()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractRecruitmentNote)
            .where(ExtractRecruitmentNote.hn == clean_hn)
            .where(ExtractRecruitmentNote.id == clean_id)
        ).first()
        if row is None:
            raise ExtractRecruitmentNoteNotFoundError("Recruitment note not found")

        for key, value in updates.items():
            setattr(row, key, value)
        row.updated_at = _utcnow()
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_note(row)


def delete_note(hn: str, note_id: str) -> None:
    """Delete a structured recruitment note."""
    clean_hn = _trim(hn)
    clean_id = _trim(note_id)
    if not clean_hn or not clean_id:
        raise ExtractRecruitmentNoteNotFoundError("Recruitment note not found")

    create_all_tables()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractRecruitmentNote)
            .where(ExtractRecruitmentNote.hn == clean_hn)
            .where(ExtractRecruitmentNote.id == clean_id)
        ).first()
        if row is None:
            raise ExtractRecruitmentNoteNotFoundError("Recruitment note not found")
        session.delete(row)

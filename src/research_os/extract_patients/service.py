"""Extract patients persistence service."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, inspect as sa_inspect, or_, select, text

from research_os.db import create_all_tables, get_engine, session_scope
from research_os.extract_patients.models import ExtractPatient
from research_os.extract_records.models import (
    ExtractCmr,
    ExtractCpex,
    ExtractEchocardiogram,
    ExtractRhc,
)
from research_os.extract_recruitment.models import ExtractStudyRecruitment
from research_os.extract_recruitment.service import normalize_investigation_status


class ExtractPatientNotFoundError(RuntimeError):
    pass


class ExtractPatientValidationError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _trim(value: Any) -> str:
    return str(value or "").strip()


def _ensure_patient_schema() -> None:
    create_all_tables()
    engine = get_engine()
    columns = {column["name"] for column in sa_inspect(engine).get_columns("extract_patients")}
    if "anonymisation_code" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE extract_patients ADD COLUMN anonymisation_code TEXT")
            )
    if "images_uploaded" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE extract_patients ADD COLUMN images_uploaded BOOLEAN NOT NULL DEFAULT 0")
            )
    if "rip_tag" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE extract_patients ADD COLUMN rip_tag BOOLEAN NOT NULL DEFAULT 0")
            )
    if "action_flag" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE extract_patients ADD COLUMN action_flag BOOLEAN NOT NULL DEFAULT 0")
            )
    if "tracking_details" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE extract_patients ADD COLUMN tracking_details TEXT")
            )


def _serialize_patient_summary(row: ExtractPatient) -> dict[str, Any]:
    return {
        "id": row.id,
        "hn": row.hn,
        "name": row.name,
        "dob": row.dob,
        "gender": row.gender,
        "anonymisation_code": row.anonymisation_code,
        "images_uploaded": bool(row.images_uploaded),
        "rip_tag": bool(row.rip_tag),
        "action_flag": bool(row.action_flag),
        "tracking_details": row.tracking_details,
        "study_id": row.study_id,
        "source": row.source,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }


def _serialize_patient(row: ExtractPatient, *, record_counts: dict[str, int] | None = None) -> dict[str, Any]:
    result = _serialize_patient_summary(row)
    if record_counts is not None:
        result.update(record_counts)
    return result


def _apply_patient_filters(
    stmt: Any,
    *,
    search: str | None = None,
    status: str | None = None,
    source: str | None = None,
) -> Any:
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                ExtractPatient.hn.ilike(pattern),
                ExtractPatient.name.ilike(pattern),
            )
        )
    if status:
        if status == "__none__":
            stmt = stmt.where(
                or_(
                    ExtractStudyRecruitment.recruitment_status.is_(None),
                    ExtractStudyRecruitment.recruitment_status == "",
                )
            )
        else:
            stmt = stmt.where(ExtractStudyRecruitment.recruitment_status == status)
    if source:
        if source == "__none__":
            stmt = stmt.where(
                or_(
                    ExtractStudyRecruitment.source.is_(None),
                    ExtractStudyRecruitment.source == "",
                )
            )
        else:
            stmt = stmt.where(ExtractStudyRecruitment.source == source)
    return stmt


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def list_patients(
    search: str | None = None,
    status: str | None = None,
    source: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """List patients, optionally filter by search, recruitment status, or source."""
    _ensure_patient_schema()
    with session_scope() as session:
        stmt = select(ExtractPatient).outerjoin(
            ExtractStudyRecruitment,
            ExtractStudyRecruitment.hn == ExtractPatient.hn,
        )
        stmt = _apply_patient_filters(stmt, search=search, status=status, source=source)
        stmt = stmt.order_by(ExtractPatient.updated_at.desc())
        if limit > 0:
            stmt = stmt.limit(limit).offset(offset)
        rows = session.scalars(stmt).all()
        results = []
        for row in rows:
            d = _serialize_patient_summary(row)
            hn = row.hn
            # Record counts
            d["rhc_count"] = session.scalar(
                select(func.count()).select_from(ExtractRhc).where(ExtractRhc.hn == hn)
            ) or 0
            d["echo_count"] = session.scalar(
                select(func.count()).select_from(ExtractEchocardiogram).where(ExtractEchocardiogram.hn == hn)
            ) or 0
            d["cmr_count"] = session.scalar(
                select(func.count()).select_from(ExtractCmr).where(ExtractCmr.hn == hn)
            ) or 0
            d["cpex_count"] = session.scalar(
                select(func.count()).select_from(ExtractCpex).where(ExtractCpex.hn == hn)
            ) or 0
            # Recruitment info
            rec = session.scalars(
                select(ExtractStudyRecruitment).where(ExtractStudyRecruitment.hn == hn)
            ).first()
            d["cohort"] = rec.cohort if rec else None
            d["recruitment_status"] = rec.recruitment_status if rec else None
            d["source"] = getattr(rec, 'source', None) if rec else None
            d["inx_rhc"] = normalize_investigation_status(getattr(rec, "inx_rhc", None)) if rec else None
            d["inx_echo"] = normalize_investigation_status(getattr(rec, "inx_echo", None)) if rec else None
            d["inx_cmr"] = normalize_investigation_status(getattr(rec, "inx_cmr", None)) if rec else None
            d["inx_cpex"] = normalize_investigation_status(getattr(rec, "inx_cpex", None)) if rec else None
            # Latest echo PH probability
            latest_echo = session.scalars(
                select(ExtractEchocardiogram).where(ExtractEchocardiogram.hn == hn).order_by(ExtractEchocardiogram.created_at.desc()).limit(1)
            ).first()
            d["echo_ph_prob"] = latest_echo.ph_prob if latest_echo and hasattr(latest_echo, 'ph_prob') else None
            # Latest CMR PH
            latest_cmr = session.scalars(
                select(ExtractCmr).where(ExtractCmr.hn == hn).order_by(ExtractCmr.created_at.desc()).limit(1)
            ).first()
            d["cmr_ph"] = latest_cmr.ph if latest_cmr and hasattr(latest_cmr, 'ph') else None
            # Latest RHC haemodynamics
            latest_rhc = session.scalars(
                select(ExtractRhc).where(ExtractRhc.hn == hn).order_by(ExtractRhc.created_at.desc()).limit(1)
            ).first()
            d["pa_mean"] = latest_rhc.pa_mean if latest_rhc else None
            d["pvr"] = latest_rhc.pvr_wu if latest_rhc else None
            d["pcwp"] = latest_rhc.pcwp_mean if latest_rhc else None
            results.append(d)
        return results


def count_patients(
    search: str | None = None,
    status: str | None = None,
    source: str | None = None,
) -> int:
    """Count patients matching the current list filters."""
    _ensure_patient_schema()
    with session_scope() as session:
        stmt = select(func.count(func.distinct(ExtractPatient.id))).select_from(ExtractPatient).outerjoin(
            ExtractStudyRecruitment,
            ExtractStudyRecruitment.hn == ExtractPatient.hn,
        )
        stmt = _apply_patient_filters(stmt, search=search, status=status, source=source)
        return session.scalar(stmt) or 0


def get_patient(hn: str) -> dict[str, Any]:
    """Get patient by hospital number, including record counts."""
    _ensure_patient_schema()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractPatient).where(ExtractPatient.hn == hn)
        ).first()
        if row is None:
            raise ExtractPatientNotFoundError("Patient not found")

        rhc_count = session.scalar(
            select(func.count()).select_from(ExtractRhc).where(ExtractRhc.hn == hn)
        ) or 0
        echo_count = session.scalar(
            select(func.count()).select_from(ExtractEchocardiogram).where(ExtractEchocardiogram.hn == hn)
        ) or 0
        cmr_count = session.scalar(
            select(func.count()).select_from(ExtractCmr).where(ExtractCmr.hn == hn)
        ) or 0
        cpex_count = session.scalar(
            select(func.count()).select_from(ExtractCpex).where(ExtractCpex.hn == hn)
        ) or 0

        # Recruitment info
        rec = session.scalars(
            select(ExtractStudyRecruitment).where(ExtractStudyRecruitment.hn == hn)
        ).first()

        result = _serialize_patient(row, record_counts={
            "rhc_count": rhc_count,
            "echo_count": echo_count,
            "cmr_count": cmr_count,
            "cpex_count": cpex_count,
        })
        result["cohort"] = rec.cohort if rec else None
        result["recruitment_status"] = rec.recruitment_status if rec else None
        result["recruitment_source"] = getattr(rec, 'source', None) if rec else None
        result["inx_rhc"] = normalize_investigation_status(getattr(rec, "inx_rhc", None)) if rec else None
        result["inx_echo"] = normalize_investigation_status(getattr(rec, "inx_echo", None)) if rec else None
        result["inx_cmr"] = normalize_investigation_status(getattr(rec, "inx_cmr", None)) if rec else None
        result["inx_cpex"] = normalize_investigation_status(getattr(rec, "inx_cpex", None)) if rec else None
        return result


def create_patient(
    hn: str,
    name: str | None = None,
    dob: str | None = None,
    gender: str | None = None,
    anonymisation_code: str | None = None,
    images_uploaded: bool = False,
    rip_tag: bool = False,
    action_flag: bool = False,
    tracking_details: str | None = None,
    study_id: str | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    """Create a new patient. Raises ExtractPatientValidationError if hn already exists."""
    _ensure_patient_schema()
    clean_hn = _trim(hn)
    if not clean_hn:
        raise ExtractPatientValidationError("hn is required")

    with session_scope() as session:
        existing = session.scalars(
            select(ExtractPatient).where(ExtractPatient.hn == clean_hn)
        ).first()
        if existing is not None:
            raise ExtractPatientValidationError("Patient with this hn already exists")

        row = ExtractPatient(
            hn=clean_hn,
            name=_trim(name) or None,
            dob=_trim(dob) or None,
            gender=_trim(gender) or None,
            anonymisation_code=_trim(anonymisation_code) or None,
            images_uploaded=bool(images_uploaded),
            rip_tag=bool(rip_tag),
            action_flag=bool(action_flag),
            tracking_details=_trim(tracking_details) or None,
            study_id=_trim(study_id) or None,
            source=_trim(source) or None,
        )
        session.add(row)
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_patient_summary(row)


def update_patient(
    hn: str,
    *,
    name: str | None | object = ...,
    dob: str | None | object = ...,
    gender: str | None | object = ...,
    anonymisation_code: str | None | object = ...,
    images_uploaded: bool | object = ...,
    rip_tag: bool | object = ...,
    action_flag: bool | object = ...,
    tracking_details: str | None | object = ...,
    study_id: str | None | object = ...,
    source: str | None | object = ...,
) -> dict[str, Any]:
    """Update patient fields. Uses ellipsis sentinel pattern."""
    _ensure_patient_schema()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractPatient).where(ExtractPatient.hn == hn)
        ).first()
        if row is None:
            raise ExtractPatientNotFoundError("Patient not found")

        if name is not ...:
            row.name = _trim(name) or None
        if dob is not ...:
            row.dob = _trim(dob) or None
        if gender is not ...:
            row.gender = _trim(gender) or None
        if anonymisation_code is not ...:
            row.anonymisation_code = _trim(anonymisation_code) or None
        if images_uploaded is not ...:
            row.images_uploaded = bool(images_uploaded)
        if rip_tag is not ...:
            row.rip_tag = bool(rip_tag)
        if action_flag is not ...:
            row.action_flag = bool(action_flag)
        if tracking_details is not ...:
            row.tracking_details = _trim(tracking_details) or None
        if study_id is not ...:
            row.study_id = _trim(study_id) or None
        if source is not ...:
            row.source = _trim(source) or None

        row.updated_at = _utcnow()
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_patient_summary(row)


def delete_patient(hn: str) -> None:
    """Delete a patient and all associated records."""
    _ensure_patient_schema()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractPatient).where(ExtractPatient.hn == hn)
        ).first()
        if row is None:
            raise ExtractPatientNotFoundError("Patient not found")

        # Delete associated records
        for model in [ExtractRhc, ExtractEchocardiogram, ExtractCmr, ExtractCpex]:
            for r in session.scalars(select(model).where(model.hn == hn)).all():
                session.delete(r)

        # Recruitment rows can be linked by hn and/or patient_id. Flush them first so the
        # patient row delete cannot race ahead of the foreign-key cleanup.
        recruitment_rows = session.scalars(
            select(ExtractStudyRecruitment).where(
                or_(
                    ExtractStudyRecruitment.hn == hn,
                    ExtractStudyRecruitment.patient_id == row.id,
                )
            )
        ).all()
        for rec in recruitment_rows:
            session.delete(rec)
        session.flush()

        session.delete(row)


def get_stats() -> dict[str, Any]:
    """Return summary stats: total_patients, rhc_count, echo_count, cmr_count, cpex_count."""
    _ensure_patient_schema()
    with session_scope() as session:
        total_patients = session.scalar(
            select(func.count()).select_from(ExtractPatient)
        ) or 0
        rhc_count = session.scalar(
            select(func.count()).select_from(ExtractRhc)
        ) or 0
        echo_count = session.scalar(
            select(func.count()).select_from(ExtractEchocardiogram)
        ) or 0
        cmr_count = session.scalar(
            select(func.count()).select_from(ExtractCmr)
        ) or 0
        cpex_count = session.scalar(
            select(func.count()).select_from(ExtractCpex)
        ) or 0
        return {
            "total_patients": total_patients,
            "rhc_count": rhc_count,
            "echo_count": echo_count,
            "cmr_count": cmr_count,
            "cpex_count": cpex_count,
        }


def find_or_create_patient(hn: str, **kwargs: Any) -> dict[str, Any]:
    """If patient with hn exists, return it. Otherwise create with kwargs."""
    _ensure_patient_schema()
    clean_hn = _trim(hn)
    if not clean_hn:
        raise ExtractPatientValidationError("hn is required")

    with session_scope() as session:
        row = session.scalars(
            select(ExtractPatient).where(ExtractPatient.hn == clean_hn)
        ).first()
        if row is not None:
            session.expunge(row)
            return _serialize_patient_summary(row)

    # Not found — create
    return create_patient(hn=clean_hn, **kwargs)

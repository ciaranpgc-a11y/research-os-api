"""Bulk export service — joins patients with latest records and recruitment."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Any

from openpyxl import Workbook
from sqlalchemy import select

from research_os.db import create_all_tables, session_scope
from research_os.extract_patients.models import ExtractPatient
from research_os.extract_records.models import (
    ExtractCmr,
    ExtractEchocardiogram,
    ExtractRhc,
)
from research_os.extract_recruitment.models import ExtractStudyRecruitment


# Column definitions for the flat export table
HEADERS = [
    # Patient
    "hn", "name", "dob", "gender", "study_id",
    # RHC
    "date_rhc", "pa_mean", "pa_systolic", "pa_diastolic",
    "pcwp_mean", "cardiac_output", "cardiac_index", "pvr_wu",
    # Echo
    "echo_study_date", "echo_lvef", "echo_lv_size", "echo_rv_size",
    "echo_rv_fn", "echo_rvsp", "echo_tapse",
    # CMR
    "date_cmr", "cmr_lvef", "cmr_rvef", "cmr_lv_size", "cmr_rv_size",
    "cmr_class", "cmr_primary_dx",
    # Recruitment
    "cohort", "recruitment_status", "eligible_for_study",
]


def _val(v: Any) -> str:
    """Stringify a value for CSV/Excel output."""
    if v is None:
        return ""
    return str(v)


def _get_latest_rhc(session: Any, hn: str) -> dict[str, Any]:
    """Return selected fields from the latest RHC for *hn*, or empty dict."""
    stmt = (
        select(ExtractRhc)
        .where(ExtractRhc.hn == hn)
        .order_by(
            ExtractRhc.date_rhc.desc().nulls_last(),
            ExtractRhc.created_at.desc(),
        )
        .limit(1)
    )
    row = session.scalars(stmt).first()
    if row is None:
        return {}
    return {
        "date_rhc": row.date_rhc,
        "pa_mean": row.pa_mean,
        "pa_systolic": row.pa_systolic,
        "pa_diastolic": row.pa_diastolic,
        "pcwp_mean": row.pcwp_mean,
        "cardiac_output": row.cardiac_output,
        "cardiac_index": row.cardiac_index,
        "pvr_wu": row.pvr_wu,
    }


def _get_latest_echo(session: Any, hn: str) -> dict[str, Any]:
    """Return selected fields from the latest echocardiogram for *hn*."""
    stmt = (
        select(ExtractEchocardiogram)
        .where(ExtractEchocardiogram.hn == hn)
        .order_by(
            ExtractEchocardiogram.study_date.desc().nulls_last(),
            ExtractEchocardiogram.created_at.desc(),
        )
        .limit(1)
    )
    row = session.scalars(stmt).first()
    if row is None:
        return {}
    return {
        "echo_study_date": row.study_date,
        "echo_lvef": row.lvef,
        "echo_lv_size": row.lv_size,
        "echo_rv_size": row.rv_size,
        "echo_rv_fn": row.rv_fn,
        "echo_rvsp": row.rvsp,
        "echo_tapse": row.tapse,
    }


def _get_latest_cmr(session: Any, hn: str) -> dict[str, Any]:
    """Return selected fields from the latest CMR for *hn*."""
    stmt = (
        select(ExtractCmr)
        .where(ExtractCmr.hn == hn)
        .order_by(
            ExtractCmr.date_cmr.desc().nulls_last(),
            ExtractCmr.created_at.desc(),
        )
        .limit(1)
    )
    row = session.scalars(stmt).first()
    if row is None:
        return {}
    return {
        "date_cmr": row.date_cmr,
        "cmr_lvef": row.lvef,
        "cmr_rvef": row.rvef,
        "cmr_lv_size": row.lv_size,
        "cmr_rv_size": row.rv_size,
        "cmr_class": row.cmr_class,
        "cmr_primary_dx": row.primary_dx,
    }


def _get_recruitment(session: Any, hn: str) -> dict[str, Any]:
    """Return recruitment fields for *hn*."""
    stmt = (
        select(ExtractStudyRecruitment)
        .where(ExtractStudyRecruitment.hn == hn)
        .order_by(ExtractStudyRecruitment.created_at.desc())
        .limit(1)
    )
    row = session.scalars(stmt).first()
    if row is None:
        return {}
    return {
        "cohort": row.cohort,
        "recruitment_status": row.recruitment_status,
        "eligible_for_study": row.eligible_for_study,
    }


def _build_rows() -> list[list[str]]:
    """Build all data rows (excluding header)."""
    create_all_tables()
    rows: list[list[str]] = []
    with session_scope() as session:
        patients = session.scalars(
            select(ExtractPatient).order_by(ExtractPatient.hn)
        ).all()
        for p in patients:
            rhc = _get_latest_rhc(session, p.hn)
            echo = _get_latest_echo(session, p.hn)
            cmr = _get_latest_cmr(session, p.hn)
            recruit = _get_recruitment(session, p.hn)

            merged: dict[str, Any] = {
                "hn": p.hn,
                "name": p.name,
                "dob": p.dob,
                "gender": p.gender,
                "study_id": p.study_id,
            }
            merged.update(rhc)
            merged.update(echo)
            merged.update(cmr)
            merged.update(recruit)

            rows.append([_val(merged.get(h)) for h in HEADERS])
    return rows


def _export_csv() -> bytes:
    """Generate CSV bytes."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(HEADERS)
    writer.writerows(_build_rows())
    return buf.getvalue().encode("utf-8-sig")


def _export_xlsx() -> bytes:
    """Generate XLSX bytes via openpyxl."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Cohort Export"
    ws.append(HEADERS)
    for row in _build_rows():
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_cohort(format: str) -> tuple[bytes, str, str]:
    """
    Export all patients joined with latest records and recruitment status.

    Returns ``(file_bytes, content_type, filename)``.

    *format*: ``"csv"`` or ``"xlsx"``.
    """
    now_tag = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    if format == "csv":
        data = _export_csv()
        return (
            data,
            "text/csv; charset=utf-8",
            f"cohort_export_{now_tag}.csv",
        )
    elif format == "xlsx":
        data = _export_xlsx()
        return (
            data,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            f"cohort_export_{now_tag}.xlsx",
        )
    else:
        raise ValueError(f"Unsupported export format: {format!r}")

"""Extract records CRUD service — generic across RHC, Echo, CMR, CPEX."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import inspect as sa_inspect, select

from research_os.db import create_all_tables, session_scope
from research_os.extract_records.models import (
    ExtractCmr,
    ExtractCpex,
    ExtractEchocardiogram,
    ExtractRhc,
)


class ExtractRecordNotFoundError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Summary keys per modality (used for list views)
# ---------------------------------------------------------------------------

RHC_SUMMARY_KEYS = [
    "id", "hn", "date_rhc", "pa_mean", "pvr_wu", "pcwp_mean",
    "cardiac_output", "cardiac_index", "status",
]
ECHO_SUMMARY_KEYS = [
    "id", "hn", "study_date", "lvef", "lv_size", "rv_size",
    "rv_fn", "rvsp", "tapse", "status", "ph_prob", "primary_dx", "secondary_path", "case_type",
]
CMR_SUMMARY_KEYS = [
    "id", "hn", "date_cmr", "lvef", "rvef", "lv_size", "rv_size",
    "cmr_class", "primary_dx", "secondary_dx", "ph", "flow", "lge", "status",
]
CPEX_SUMMARY_KEYS = [
    "id", "hn", "date_cpex", "source_file", "status",
]

# (model_class, summary_keys, date_column_name)
MODALITY_MAP: dict[str, tuple[type, list[str], str]] = {
    "rhc": (ExtractRhc, RHC_SUMMARY_KEYS, "date_rhc"),
    "echo": (ExtractEchocardiogram, ECHO_SUMMARY_KEYS, "study_date"),
    "cmr": (ExtractCmr, CMR_SUMMARY_KEYS, "date_cmr"),
    "cpex": (ExtractCpex, CPEX_SUMMARY_KEYS, "date_cpex"),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _serialize_row(row: Any, keys: list[str] | None = None) -> dict[str, Any]:
    """Serialize a SQLAlchemy model instance to a dict.

    If *keys* is given, only those columns are included (summary view).
    Otherwise all columns are included (detail view).
    """
    mapper = sa_inspect(type(row))
    result: dict[str, Any] = {}
    for attr in mapper.column_attrs:
        col_name = attr.key
        if keys is not None and col_name not in keys:
            continue
        value = getattr(row, col_name)
        if isinstance(value, datetime):
            value = _iso(value)
        result[col_name] = value
    return result


def _get_modality(modality: str) -> tuple[type, list[str], str]:
    """Look up modality info or raise ValueError."""
    entry = MODALITY_MAP.get(modality)
    if entry is None:
        raise ValueError(f"Unknown modality: {modality!r}")
    return entry


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_valid_columns(modality: str) -> set[str]:
    """Return the set of valid column names for a modality's DB model."""
    model_cls, _summary_keys, _date_col = _get_modality(modality)
    mapper = sa_inspect(model_cls)
    return {col.key for col in mapper.column_attrs}


def list_records(
    modality: str,
    hn: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """List records for a modality, optionally filtered by hn."""
    model_cls, summary_keys, _date_col = _get_modality(modality)
    create_all_tables()
    with session_scope() as session:
        stmt = select(model_cls)
        if hn:
            stmt = stmt.where(model_cls.hn == hn)
        stmt = stmt.order_by(model_cls.created_at.desc()).limit(limit).offset(offset)
        rows = session.scalars(stmt).all()
        return [_serialize_row(row, summary_keys) for row in rows]


def get_record(modality: str, record_id: str) -> dict[str, Any]:
    """Get a single record by id — returns ALL columns."""
    model_cls, _summary_keys, _date_col = _get_modality(modality)
    create_all_tables()
    with session_scope() as session:
        row = session.scalars(
            select(model_cls).where(model_cls.id == record_id)
        ).first()
        if row is None:
            raise ExtractRecordNotFoundError(f"{modality} record not found")
        return _serialize_row(row)


def create_record(modality: str, data: dict[str, Any]) -> dict[str, Any]:
    """Create a new record for the given modality."""
    model_cls, _summary_keys, _date_col = _get_modality(modality)
    create_all_tables()
    with session_scope() as session:
        row = model_cls(**data)
        session.add(row)
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_row(row)


def update_record(
    modality: str, record_id: str, data: dict[str, Any]
) -> dict[str, Any]:
    """Partial-update a record. Only supplied keys are changed."""
    model_cls, _summary_keys, _date_col = _get_modality(modality)
    create_all_tables()
    with session_scope() as session:
        row = session.scalars(
            select(model_cls).where(model_cls.id == record_id)
        ).first()
        if row is None:
            raise ExtractRecordNotFoundError(f"{modality} record not found")

        for key, value in data.items():
            if hasattr(row, key):
                setattr(row, key, value)

        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_row(row)


def delete_record(modality: str, record_id: str) -> None:
    """Delete a record by id."""
    model_cls, _summary_keys, _date_col = _get_modality(modality)
    create_all_tables()
    with session_scope() as session:
        row = session.scalars(
            select(model_cls).where(model_cls.id == record_id)
        ).first()
        if row is None:
            raise ExtractRecordNotFoundError(f"{modality} record not found")
        session.delete(row)

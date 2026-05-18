"""Extract per-patient clinical data service."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from research_os.db import create_all_tables, get_engine, session_scope
from research_os.extract_clinical_data.models import ExtractClinicalData


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _trim(value: Any) -> str:
    return str(value or "").strip()


def _ensure_table() -> None:
    create_all_tables()
    ExtractClinicalData.__table__.create(bind=get_engine(), checkfirst=True)


def _parse_data(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _serialize(row: ExtractClinicalData | None, hn: str) -> dict[str, Any]:
    if row is None:
        return {
            "id": None,
            "hn": hn,
            "data": {},
            "created_at": None,
            "updated_at": None,
        }
    return {
        "id": row.id,
        "hn": row.hn,
        "data": _parse_data(row.data_json),
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }


def get_clinical_data(hn: str) -> dict[str, Any]:
    clean_hn = _trim(hn)
    _ensure_table()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractClinicalData).where(ExtractClinicalData.hn == clean_hn)
        ).first()
        return _serialize(row, clean_hn)


def save_clinical_data(hn: str, data: dict[str, Any]) -> dict[str, Any]:
    clean_hn = _trim(hn)
    if not clean_hn:
        raise ValueError("hn is required")
    if not isinstance(data, dict):
        raise ValueError("data must be an object")

    _ensure_table()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractClinicalData).where(ExtractClinicalData.hn == clean_hn)
        ).first()
        now = _utcnow()
        if row is None:
            row = ExtractClinicalData(hn=clean_hn, data_json="{}", created_at=now)
            session.add(row)

        row.data_json = json.dumps(data, ensure_ascii=False, sort_keys=True)
        row.updated_at = now
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize(row, clean_hn)


"""Persistence service for the standalone extract tracking list."""

from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any

from sqlalchemy import select, text

from research_os.db import create_all_tables, get_engine, session_scope
from research_os.extract_tracking.models import ExtractBookingEntry, ExtractTrackingEntry


BOOKING_INVESTIGATIONS = {"RHC", "CMR", "CPEX", "Echo"}
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$")


class ExtractTrackingNotFoundError(RuntimeError):
    pass


class ExtractTrackingValidationError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _trim(value: Any) -> str:
    return str(value or "").strip()


def _ensure_schema() -> None:
    create_all_tables()
    engine = get_engine()
    if engine.dialect.name == "sqlite":
        with engine.begin() as connection:
            columns = {
                str(row[1])
                for row in connection.execute(text("PRAGMA table_info(extract_booking_entries)"))
            }
            if columns and "booking_time" not in columns:
                connection.execute(
                    text("ALTER TABLE extract_booking_entries ADD COLUMN booking_time TEXT")
                )
    elif engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE IF EXISTS extract_booking_entries "
                    "ADD COLUMN IF NOT EXISTS booking_time TEXT"
                )
            )


def _serialize(row: ExtractTrackingEntry) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "hn": row.hn,
        "details": row.details,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }


def _serialize_booking(row: ExtractBookingEntry) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "hn": row.hn,
        "investigation": row.investigation,
        "booking_date": row.booking_date,
        "booking_time": row.booking_time,
        "details": row.details,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }


def _clean_booking_investigation(value: str | None) -> str:
    raw = _trim(value)
    for allowed in BOOKING_INVESTIGATIONS:
        if raw.lower() == allowed.lower():
            return allowed
    raise ExtractTrackingValidationError("Investigation must be RHC, CMR, CPEX, or Echo")


def _clean_booking_time(value: str | None) -> str | None:
    raw = _trim(value)
    if not raw:
        return None
    match = _TIME_RE.match(raw)
    if not match:
        raise ExtractTrackingValidationError("Booking time must be HH:MM")
    return f"{match.group(1)}:{match.group(2)}"


def list_tracking_entries() -> list[dict[str, Any]]:
    _ensure_schema()
    with session_scope() as session:
        rows = session.scalars(
            select(ExtractTrackingEntry).order_by(ExtractTrackingEntry.created_at.desc())
        ).all()
        return [_serialize(row) for row in rows]


def create_tracking_entry(
    *,
    name: str | None = None,
    hn: str | None = None,
    details: str | None = None,
) -> dict[str, Any]:
    _ensure_schema()
    clean_name = _trim(name)
    clean_hn = _trim(hn)
    clean_details = _trim(details)
    if not clean_name and not clean_hn:
        raise ExtractTrackingValidationError("Name or HN is required")

    with session_scope() as session:
        if clean_hn:
            existing = session.scalars(
                select(ExtractTrackingEntry).where(ExtractTrackingEntry.hn == clean_hn)
            ).first()
            if existing is not None:
                raise ExtractTrackingValidationError("Tracking entry with this HN already exists")

        row = ExtractTrackingEntry(
            name=clean_name or None,
            hn=clean_hn or None,
            details=clean_details or None,
        )
        session.add(row)
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize(row)


def update_tracking_entry(
    entry_id: str,
    *,
    name: str | None | object = ...,
    hn: str | None | object = ...,
    details: str | None | object = ...,
) -> dict[str, Any]:
    _ensure_schema()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractTrackingEntry).where(ExtractTrackingEntry.id == entry_id)
        ).first()
        if row is None:
            raise ExtractTrackingNotFoundError("Tracking entry not found")

        if name is not ...:
            row.name = _trim(name) or None
        if hn is not ...:
            clean_hn = _trim(hn)
            if clean_hn:
                existing = session.scalars(
                    select(ExtractTrackingEntry).where(
                        ExtractTrackingEntry.hn == clean_hn,
                        ExtractTrackingEntry.id != entry_id,
                    )
                ).first()
                if existing is not None:
                    raise ExtractTrackingValidationError("Tracking entry with this HN already exists")
            row.hn = clean_hn or None
        if details is not ...:
            row.details = _trim(details) or None

        if not (row.name or row.hn):
            raise ExtractTrackingValidationError("Name or HN is required")

        row.updated_at = _utcnow()
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize(row)


def delete_tracking_entry(entry_id: str) -> None:
    _ensure_schema()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractTrackingEntry).where(ExtractTrackingEntry.id == entry_id)
        ).first()
        if row is None:
            raise ExtractTrackingNotFoundError("Tracking entry not found")
        session.delete(row)


def list_booking_entries() -> list[dict[str, Any]]:
    _ensure_schema()
    with session_scope() as session:
        rows = session.scalars(
            select(ExtractBookingEntry).order_by(
                ExtractBookingEntry.booking_date.asc(),
                ExtractBookingEntry.booking_time.asc(),
                ExtractBookingEntry.created_at.asc(),
            )
        ).all()
        return [_serialize_booking(row) for row in rows]


def create_booking_entry(
    *,
    name: str | None = None,
    hn: str | None = None,
    investigation: str | None = None,
    booking_date: str | None = None,
    booking_time: str | None = None,
    details: str | None = None,
) -> dict[str, Any]:
    _ensure_schema()
    clean_name = _trim(name)
    clean_hn = _trim(hn)
    clean_investigation = _clean_booking_investigation(investigation)
    clean_booking_date = _trim(booking_date)
    clean_booking_time = _clean_booking_time(booking_time)
    clean_details = _trim(details)
    if not clean_booking_date:
        raise ExtractTrackingValidationError("Booking date is required")
    if not clean_name and not clean_hn:
        raise ExtractTrackingValidationError("Name or HN is required")

    with session_scope() as session:
        row = ExtractBookingEntry(
            name=clean_name or None,
            hn=clean_hn or None,
            investigation=clean_investigation,
            booking_date=clean_booking_date,
            booking_time=clean_booking_time,
            details=clean_details or None,
        )
        session.add(row)
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_booking(row)


def update_booking_entry(
    entry_id: str,
    *,
    name: str | None | object = ...,
    hn: str | None | object = ...,
    investigation: str | None | object = ...,
    booking_date: str | None | object = ...,
    booking_time: str | None | object = ...,
    details: str | None | object = ...,
) -> dict[str, Any]:
    _ensure_schema()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractBookingEntry).where(ExtractBookingEntry.id == entry_id)
        ).first()
        if row is None:
            raise ExtractTrackingNotFoundError("Booking entry not found")

        if name is not ...:
            row.name = _trim(name) or None
        if hn is not ...:
            row.hn = _trim(hn) or None
        if investigation is not ...:
            row.investigation = _clean_booking_investigation(investigation)
        if booking_date is not ...:
            clean_booking_date = _trim(booking_date)
            if not clean_booking_date:
                raise ExtractTrackingValidationError("Booking date is required")
            row.booking_date = clean_booking_date
        if booking_time is not ...:
            row.booking_time = _clean_booking_time(booking_time)  # type: ignore[arg-type]
        if details is not ...:
            row.details = _trim(details) or None

        if not (row.name or row.hn):
            raise ExtractTrackingValidationError("Name or HN is required")

        row.updated_at = _utcnow()
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize_booking(row)


def delete_booking_entry(entry_id: str) -> None:
    _ensure_schema()
    with session_scope() as session:
        row = session.scalars(
            select(ExtractBookingEntry).where(ExtractBookingEntry.id == entry_id)
        ).first()
        if row is None:
            raise ExtractTrackingNotFoundError("Booking entry not found")
        session.delete(row)

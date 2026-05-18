#!/usr/bin/env python3
"""Migrate data from SQLite research.db to PostgreSQL extract_* tables.

Source: C:\\Users\\Ciaran\\AppData\\Local\\Cardiology Data Extractor\\research.db
Target: PostgreSQL (via DATABASE_URL env var) extract_* tables.

Usage:
    python scripts/migrate_research_db.py [--truncate] [--dry-run] [--sqlite-path PATH]

Flags:
    --truncate    Truncate target tables before inserting (prompts for confirmation).
    --dry-run     Read SQLite and report counts without writing to PostgreSQL.
    --sqlite-path Override the default SQLite database path.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from uuid import uuid4

# ---------------------------------------------------------------------------
# Ensure src/ is importable when running from repo root
# ---------------------------------------------------------------------------
from pathlib import Path

_repo_root = Path(__file__).resolve().parents[1]
_src_dir = _repo_root / "src"
if str(_src_dir) not in sys.path:
    sys.path.insert(0, str(_src_dir))

from research_os.db import Base, create_all_tables, get_engine, session_scope  # noqa: E402
from research_os.extract_patients.models import ExtractPatient  # noqa: E402
from research_os.extract_records.models import (  # noqa: E402
    ExtractCmr,
    ExtractCpex,
    ExtractEchocardiogram,
    ExtractRhc,
)
from research_os.extract_recruitment.models import ExtractStudyRecruitment  # noqa: E402

DEFAULT_SQLITE_PATH = (
    r"C:\Users\Ciaran\AppData\Local\Cardiology Data Extractor\research.db"
)

# Tables in migration order (patients first so we can build the ID map)
TABLE_MAP: list[dict] = [
    {
        "sqlite_table": "patients",
        "model": ExtractPatient,
        "label": "extract_patients",
    },
    {
        "sqlite_table": "rhc",
        "model": ExtractRhc,
        "label": "extract_rhc",
    },
    {
        "sqlite_table": "echocardiogram",
        "model": ExtractEchocardiogram,
        "label": "extract_echocardiogram",
    },
    {
        "sqlite_table": "cmr",
        "model": ExtractCmr,
        "label": "extract_cmr",
    },
    {
        "sqlite_table": "cpex",
        "model": ExtractCpex,
        "label": "extract_cpex",
    },
    {
        "sqlite_table": "study_recruitment",
        "model": ExtractStudyRecruitment,
        "label": "extract_study_recruitment",
    },
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_datetime(value: str | None) -> datetime | None:
    """Try to parse a SQLite datetime string into a timezone-aware datetime."""
    if not value:
        return None
    for fmt in (
        "%Y-%m-%d %H:%M:%S.%f%z",
        "%Y-%m-%d %H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            dt = datetime.strptime(value, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def _model_column_names(model_cls) -> set[str]:
    """Return the set of column attribute names for a SQLAlchemy model."""
    return {c.key for c in model_cls.__table__.columns}


def _read_sqlite_rows(conn: sqlite3.Connection, table: str) -> list[dict]:
    """Read all rows from a SQLite table as dicts."""
    conn.row_factory = sqlite3.Row
    cursor = conn.execute(f"SELECT * FROM [{table}]")
    return [dict(row) for row in cursor.fetchall()]


# ---------------------------------------------------------------------------
# Migration logic per table
# ---------------------------------------------------------------------------

def migrate_patients(
    session,
    rows: list[dict],
    *,
    dry_run: bool = False,
) -> dict[int, str]:
    """Migrate patients and return sqlite_id -> new_uuid mapping."""
    id_map: dict[int, str] = {}
    skipped = 0
    inserted = 0

    for row in rows:
        hn = row.get("hn")
        if not hn:
            skipped += 1
            continue

        new_id = str(uuid4())

        if dry_run:
            id_map[row["id"]] = new_id
            inserted += 1
            continue

        # Idempotency: skip if a patient with this HN already exists
        existing = session.query(ExtractPatient).filter_by(hn=hn).first()
        if existing:
            id_map[row["id"]] = existing.id
            skipped += 1
            continue

        id_map[row["id"]] = new_id

        patient = ExtractPatient(
            id=new_id,
            hn=hn,
            name=row.get("name"),
            dob=row.get("dob"),
            gender=row.get("gender"),
            study_id=row.get("study_id"),
            source=row.get("source"),
            created_at=_parse_datetime(row.get("created_at")) or datetime.now(timezone.utc),
            updated_at=_parse_datetime(row.get("updated_at")) or datetime.now(timezone.utc),
        )
        session.add(patient)
        inserted += 1

    if not dry_run:
        session.flush()

    print(f"  patients: {inserted} inserted, {skipped} skipped")
    return id_map


def migrate_record_table(
    session,
    model_cls,
    rows: list[dict],
    label: str,
    *,
    dry_run: bool = False,
) -> int:
    """Migrate a record table (rhc, echocardiogram, cmr, cpex).

    Returns the number of rows inserted.
    """
    valid_cols = _model_column_names(model_cls)
    skipped = 0
    inserted = 0
    batch: list = []

    for row in rows:
        hn = row.get("hn")
        if not hn:
            skipped += 1
            continue

        if dry_run:
            inserted += 1
            continue

        # Idempotency: check for duplicate by hn + date key
        # For tables with many records per patient, we check by a composite
        # of hn and the date column if present, otherwise just hn+source_file.
        date_col = _date_column_for(label)
        if date_col and row.get(date_col):
            existing = (
                session.query(model_cls)
                .filter_by(hn=hn, **{date_col: row[date_col]})
                .first()
            )
        elif row.get("source_file"):
            existing = (
                session.query(model_cls)
                .filter_by(hn=hn, source_file=row["source_file"])
                .first()
            )
        else:
            existing = None

        if existing:
            skipped += 1
            continue

        kwargs: dict = {"id": str(uuid4())}
        for col_name, value in row.items():
            if col_name == "id":
                continue  # skip SQLite integer id
            if col_name not in valid_cols:
                continue  # skip columns not in the PG model
            if col_name == "created_at":
                kwargs["created_at"] = _parse_datetime(value) or datetime.now(timezone.utc)
            else:
                kwargs[col_name] = value

        batch.append(model_cls(**kwargs))
        inserted += 1

        if len(batch) >= 50:
            session.add_all(batch)
            session.flush()
            batch = []

    if batch:
        session.add_all(batch)
        session.flush()

    print(f"  {label}: {inserted} inserted, {skipped} skipped")
    return inserted


def migrate_study_recruitment(
    session,
    rows: list[dict],
    patient_id_map: dict[int, str],
    *,
    dry_run: bool = False,
) -> int:
    """Migrate study_recruitment, remapping patient_id from SQLite int to UUID."""
    valid_cols = _model_column_names(ExtractStudyRecruitment)
    skipped = 0
    inserted = 0
    batch: list = []

    for row in rows:
        hn = row.get("hn")
        if not hn:
            skipped += 1
            continue

        if dry_run:
            inserted += 1
            continue

        # Idempotency: skip if a recruitment row with this HN already exists
        existing = session.query(ExtractStudyRecruitment).filter_by(hn=hn).first()
        if existing:
            skipped += 1
            continue

        kwargs: dict = {"id": str(uuid4())}
        for col_name, value in row.items():
            if col_name == "id":
                continue
            if col_name not in valid_cols:
                continue
            if col_name == "patient_id":
                # Remap SQLite integer patient_id -> new UUID
                sqlite_patient_id = value
                kwargs["patient_id"] = patient_id_map.get(sqlite_patient_id)
                continue
            if col_name == "created_at":
                kwargs["created_at"] = _parse_datetime(value) or datetime.now(timezone.utc)
                continue
            kwargs[col_name] = value

        batch.append(ExtractStudyRecruitment(**kwargs))
        inserted += 1

        if len(batch) >= 50:
            session.add_all(batch)
            session.flush()
            batch = []

    if batch:
        session.add_all(batch)
        session.flush()

    print(f"  study_recruitment: {inserted} inserted, {skipped} skipped")
    return inserted


def _date_column_for(label: str) -> str | None:
    """Return the date column used for deduplication per table."""
    return {
        "extract_rhc": "date_rhc",
        "extract_echocardiogram": "study_date",
        "extract_cmr": "date_cmr",
        "extract_cpex": "date_cpex",
    }.get(label)


# ---------------------------------------------------------------------------
# Truncation
# ---------------------------------------------------------------------------

def truncate_target_tables(session) -> None:
    """Delete all rows from target tables in reverse-dependency order."""
    tables_to_clear = [
        ExtractStudyRecruitment,
        ExtractCpex,
        ExtractCmr,
        ExtractEchocardiogram,
        ExtractRhc,
        ExtractPatient,
    ]
    for model_cls in tables_to_clear:
        count = session.query(model_cls).delete()
        print(f"  Deleted {count} rows from {model_cls.__tablename__}")
    session.flush()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate SQLite research.db data to PostgreSQL extract_* tables."
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Truncate target tables before migration (prompts for confirmation).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read SQLite and report counts without writing to PostgreSQL.",
    )
    parser.add_argument(
        "--sqlite-path",
        default=DEFAULT_SQLITE_PATH,
        help=f"Path to SQLite research.db (default: {DEFAULT_SQLITE_PATH})",
    )
    args = parser.parse_args()

    sqlite_path = Path(args.sqlite_path)
    if not sqlite_path.exists():
        print(f"ERROR: SQLite database not found at {sqlite_path}")
        sys.exit(1)

    print(f"Source: {sqlite_path}")
    print(f"Dry run: {args.dry_run}")
    print()

    # Ensure PostgreSQL schema exists
    if not args.dry_run:
        create_all_tables()

    sqlite_conn = sqlite3.connect(str(sqlite_path))

    # Pre-read all source data
    source_data: dict[str, list[dict]] = {}
    for entry in TABLE_MAP:
        rows = _read_sqlite_rows(sqlite_conn, entry["sqlite_table"])
        source_data[entry["sqlite_table"]] = rows
        print(f"Read {len(rows):>4} rows from SQLite {entry['sqlite_table']}")

    print()

    with session_scope() as session:
        # Optional truncation
        if args.truncate and not args.dry_run:
            answer = input(
                "This will DELETE all existing data in extract_* tables. Continue? [y/N] "
            )
            if answer.strip().lower() != "y":
                print("Aborted.")
                sqlite_conn.close()
                return
            print("Truncating target tables...")
            truncate_target_tables(session)
            print()

        # Step 1: Migrate patients (build hn -> uuid mapping)
        print("Migrating patients...")
        patient_id_map = migrate_patients(
            session,
            source_data["patients"],
            dry_run=args.dry_run,
        )

        # Step 2: Migrate record tables (rhc, echocardiogram, cmr, cpex)
        print("Migrating record tables...")
        for entry in TABLE_MAP:
            if entry["sqlite_table"] in ("patients", "study_recruitment"):
                continue
            migrate_record_table(
                session,
                entry["model"],
                source_data[entry["sqlite_table"]],
                entry["label"],
                dry_run=args.dry_run,
            )

        # Step 3: Migrate study_recruitment (with patient_id remapping)
        print("Migrating study_recruitment...")
        migrate_study_recruitment(
            session,
            source_data["study_recruitment"],
            patient_id_map,
            dry_run=args.dry_run,
        )

    sqlite_conn.close()

    print()
    print("Migration complete." if not args.dry_run else "Dry run complete (no data written).")


if __name__ == "__main__":
    main()

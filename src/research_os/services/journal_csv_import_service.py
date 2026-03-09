from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from research_os.db import JournalProfile, create_all_tables, session_scope
from research_os.services.journal_identity import (
    extract_openalex_source_id,
    normalize_issn,
    normalize_issns,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    text = str(value or "").strip()
    if not text:
        return None
    match = re.search(r"\d{4}|\d+", text)
    if not match:
        return None
    try:
        return int(match.group(0))
    except Exception:
        return None


def _safe_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace(",", "")
    try:
        return float(text)
    except Exception:
        match = re.search(r"-?\d+(?:\.\d+)?", text)
        if not match:
            return None
        try:
            return float(match.group(0))
        except Exception:
            return None


def _sanitize_text(value: Any, *, max_length: int | None = None) -> str | None:
    clean = re.sub(r"\s+", " ", str(value or "").strip())
    if not clean:
        return None
    if max_length is not None:
        clean = clean[:max_length].rstrip()
    return clean or None


def _normalize_header(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def _canonical_journal_name(value: Any) -> str | None:
    clean = _sanitize_text(value)
    if not clean:
        return None
    canonical = re.sub(r"[^a-z0-9]+", " ", clean.lower()).strip()
    return canonical or None


def _decode_csv_bytes(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return content.decode(encoding)
        except Exception:
            continue
    return content.decode("utf-8", errors="ignore")


def _csv_reader(text: str) -> csv.DictReader:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except Exception:
        dialect = csv.excel
    return csv.DictReader(io.StringIO(text), dialect=dialect)


def _row_value(row: dict[str, str], *candidates: str) -> str | None:
    for candidate in candidates:
        value = _sanitize_text(row.get(candidate))
        if value:
            return value
    return None


def _should_replace_impact_factor(
    *,
    existing_value: float | None,
    existing_year: int | None,
    candidate_value: float | None,
    candidate_year: int | None,
) -> bool:
    if candidate_value is None:
        return False
    if existing_value is None:
        return True
    if candidate_year is not None:
        if existing_year is None:
            return True
        return candidate_year >= existing_year
    if existing_year is not None:
        return False
    return True


def import_journal_profiles_from_csv_bytes(
    *,
    content: bytes,
    filename: str = "",
    source_label: str = "",
    impact_factor_label: str = "Impact Factor",
    default_metric_year: int | None = None,
) -> dict[str, Any]:
    create_all_tables()
    text = _decode_csv_bytes(content)
    reader = _csv_reader(text)
    fieldnames = list(reader.fieldnames or [])
    normalized_fieldnames = [_normalize_header(value) for value in fieldnames]
    clean_filename = _sanitize_text(Path(str(filename or "journal-impact-factors.csv")).name, max_length=255) or "journal-impact-factors.csv"
    clean_source_label = _sanitize_text(source_label, max_length=255) or clean_filename
    clean_impact_factor_label = (
        _sanitize_text(impact_factor_label, max_length=64) or "Impact Factor"
    )
    normalized_default_metric_year = _safe_int(default_metric_year)
    imported_at = _utcnow()

    with session_scope() as session:
        profiles = list(session.query(JournalProfile).all())
        by_source_id: dict[str, JournalProfile] = {}
        by_issn_l: dict[str, JournalProfile] = {}
        by_any_issn: dict[str, JournalProfile] = {}
        by_display_name: dict[str, JournalProfile] = {}

        def _index_profile(profile: JournalProfile) -> None:
            source_id = extract_openalex_source_id(profile.provider_journal_id)
            if source_id:
                by_source_id[source_id] = profile
            issn_l = normalize_issn(profile.issn_l)
            if issn_l:
                by_issn_l[issn_l] = profile
                by_any_issn[issn_l] = profile
            for issn in normalize_issns(list(profile.issns_json or [])):
                by_any_issn[issn] = profile
            display_key = _canonical_journal_name(profile.display_name)
            if display_key:
                by_display_name[display_key] = profile

        for profile in profiles:
            _index_profile(profile)

        rows_read = 0
        rows_applied = 0
        created_profiles = 0
        updated_profiles = 0
        matched_by_source_id = 0
        matched_by_issn_l = 0
        matched_by_issn = 0
        matched_by_display_name = 0
        skipped_rows = 0
        warnings: list[str] = []

        for raw_row in reader:
            rows_read += 1
            row = {
                _normalize_header(key): str(value or "").strip()
                for key, value in dict(raw_row or {}).items()
                if key is not None
            }
            if not any(_sanitize_text(value) for value in row.values()):
                skipped_rows += 1
                continue

            display_name = _row_value(
                row,
                "journal",
                "journal_name",
                "journal_title",
                "source_title",
                "source_name",
                "display_name",
                "title",
                "venue_name",
            )
            source_id = extract_openalex_source_id(
                _row_value(
                    row,
                    "openalex_source_id",
                    "openalex_id",
                    "provider_journal_id",
                    "source_id",
                    "journal_id",
                )
            )
            issn_l = normalize_issn(
                _row_value(
                    row,
                    "issn_l",
                    "issn_l_print",
                    "issn_l_online",
                    "issn_l_value",
                    "issnl",
                    "issn_linking",
                )
            )
            issns = normalize_issns(
                _row_value(row, "issns", "issn", "journal_issn", "print_issn")
            )
            publisher = _row_value(row, "publisher", "publisher_name")
            source_url = _row_value(
                row,
                "source_url",
                "impact_factor_source_url",
                "journal_url",
                "url",
                "homepage_url",
            )
            metric_year = _safe_int(
                _row_value(
                    row,
                    "impact_factor_year",
                    "journal_impact_factor_year",
                    "jif_year",
                    "metric_year",
                    "year",
                )
            )
            if metric_year is None:
                metric_year = normalized_default_metric_year
            metric_value = _safe_float(
                _row_value(
                    row,
                    "impact_factor",
                    "journal_impact_factor",
                    "publisher_reported_impact_factor",
                    "jif",
                    "if",
                )
            )
            label = _row_value(
                row,
                "impact_factor_label",
                "journal_impact_factor_label",
                "metric_label",
            ) or clean_impact_factor_label
            editor_in_chief_name = _row_value(
                row,
                "editor_in_chief_name",
                "editor_in_chief",
                "editor_in_chief_current",
            )
            time_to_first_decision_days = _safe_int(
                _row_value(
                    row,
                    "time_to_first_decision_days",
                    "first_decision_days",
                    "decision_days",
                )
            )
            time_to_publication_days = _safe_int(
                _row_value(
                    row,
                    "time_to_publication_days",
                    "publication_days",
                    "acceptance_to_publication_days",
                )
            )

            if (
                metric_value is None
                and not editor_in_chief_name
                and time_to_first_decision_days is None
                and time_to_publication_days is None
            ):
                skipped_rows += 1
                if len(warnings) < 25:
                    warnings.append(
                        f"Row {rows_read}: skipped because no impact-factor or editorial values were found."
                    )
                continue

            profile: JournalProfile | None = None
            match_kind = "created"
            for issn in ([issn_l] if issn_l else []) + list(issns):
                normalized_issn = normalize_issn(issn)
                if normalized_issn and normalized_issn not in issns:
                    issns = [normalized_issn, *issns]

            if source_id:
                profile = by_source_id.get(source_id)
                if profile is not None:
                    matched_by_source_id += 1
                    match_kind = "source_id"
            if profile is None and issn_l:
                profile = by_issn_l.get(issn_l)
                if profile is not None:
                    matched_by_issn_l += 1
                    match_kind = "issn_l"
            if profile is None:
                for issn in issns:
                    profile = by_any_issn.get(issn)
                    if profile is not None:
                        matched_by_issn += 1
                        match_kind = "issn"
                        break
            if profile is None and display_name:
                display_key = _canonical_journal_name(display_name)
                if display_key:
                    profile = by_display_name.get(display_key)
                    if profile is not None:
                        matched_by_display_name += 1
                        match_kind = "display_name"

            if profile is None:
                profile = JournalProfile(
                    provider="openalex",
                    display_name=display_name or "",
                    venue_type="journal",
                )
                session.add(profile)
                created_profiles += 1

            existing_if_value = _safe_float(profile.publisher_reported_impact_factor)
            existing_if_year = _safe_int(profile.publisher_reported_impact_factor_year)
            replace_impact_factor = _should_replace_impact_factor(
                existing_value=existing_if_value,
                existing_year=existing_if_year,
                candidate_value=metric_value,
                candidate_year=metric_year,
            )

            row_changed = False
            if source_id and extract_openalex_source_id(profile.provider_journal_id) != source_id:
                profile.provider_journal_id = source_id
                row_changed = True
            if issn_l and normalize_issn(profile.issn_l) != issn_l:
                profile.issn_l = issn_l
                row_changed = True
            merged_issns = normalize_issns(list(profile.issns_json or []) + list(issns))
            if merged_issns != normalize_issns(list(profile.issns_json or [])):
                profile.issns_json = merged_issns
                row_changed = True
            if display_name and not _sanitize_text(profile.display_name):
                profile.display_name = display_name
                row_changed = True
            if publisher and not _sanitize_text(profile.publisher):
                profile.publisher = publisher
                row_changed = True
            if not _sanitize_text(profile.venue_type):
                profile.venue_type = "journal"
                row_changed = True

            if replace_impact_factor and metric_value is not None:
                profile.publisher_reported_impact_factor = round(metric_value, 3)
                profile.publisher_reported_impact_factor_year = metric_year
                profile.publisher_reported_impact_factor_label = label
                if source_url:
                    profile.publisher_reported_impact_factor_source_url = source_url
                row_changed = True

            if editor_in_chief_name and editor_in_chief_name != _sanitize_text(profile.editor_in_chief_name):
                profile.editor_in_chief_name = editor_in_chief_name
                row_changed = True
            if (
                time_to_first_decision_days is not None
                and time_to_first_decision_days != profile.time_to_first_decision_days
            ):
                profile.time_to_first_decision_days = time_to_first_decision_days
                row_changed = True
            if (
                time_to_publication_days is not None
                and time_to_publication_days != profile.time_to_publication_days
            ):
                profile.time_to_publication_days = time_to_publication_days
                row_changed = True
            if source_url and source_url != _sanitize_text(profile.editorial_source_url):
                profile.editorial_source_url = source_url
                row_changed = True
            if clean_source_label and clean_source_label != _sanitize_text(profile.editorial_source_title):
                profile.editorial_source_title = clean_source_label
                row_changed = True

            if row_changed:
                raw_json = (
                    dict(profile.editorial_raw_json)
                    if isinstance(profile.editorial_raw_json, dict)
                    else {}
                )
                raw_json["csv_import"] = {
                    "file_name": clean_filename,
                    "source_label": clean_source_label,
                    "imported_at": imported_at.isoformat(),
                    "matched_by": match_kind,
                    "row_number": rows_read,
                    "row": row,
                }
                profile.editorial_raw_json = raw_json
                profile.editorial_notes = (
                    f"Imported from CSV '{clean_filename}' via {clean_source_label}."
                )[:2000]
                profile.editorial_last_verified_at = imported_at
                rows_applied += 1
                if match_kind == "created":
                    _index_profile(profile)
                else:
                    updated_profiles += 1
                _index_profile(profile)
            else:
                skipped_rows += 1
                if len(warnings) < 25:
                    warnings.append(
                        f"Row {rows_read}: skipped because cached journal data was newer or equivalent."
                    )

        return {
            "file_name": clean_filename,
            "source_label": clean_source_label,
            "impact_factor_label": clean_impact_factor_label,
            "detected_columns": normalized_fieldnames,
            "rows_read": rows_read,
            "rows_applied": rows_applied,
            "created_profiles": created_profiles,
            "updated_profiles": updated_profiles,
            "matched_by_source_id": matched_by_source_id,
            "matched_by_issn_l": matched_by_issn_l,
            "matched_by_issn": matched_by_issn,
            "matched_by_display_name": matched_by_display_name,
            "skipped_rows": skipped_rows,
            "warnings": warnings,
            "generated_at": imported_at,
        }

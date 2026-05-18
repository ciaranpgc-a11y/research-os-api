"""Persistence helpers for uploaded Extract source files."""

from __future__ import annotations

import hashlib
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select

from research_os.db import create_all_tables, get_engine, session_scope
from research_os.extract_source_files.models import ExtractSourceFile


class ExtractSourceFileNotFoundError(RuntimeError):
    pass


class ExtractSourceFileValidationError(RuntimeError):
    pass


class ExtractSourceFileConversionUnavailableError(RuntimeError):
    pass


class ExtractSourceFileConversionError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _ensure_table() -> None:
    create_all_tables()
    ExtractSourceFile.__table__.create(bind=get_engine(), checkfirst=True)


def _clean_filename(filename: str | None) -> str:
    raw = str(filename or "").strip().replace("\r", " ").replace("\n", " ")
    raw = Path(raw).name
    raw = re.sub(r"\s+", " ", raw).strip(" .")
    if not raw:
        return "uploaded-file"
    if len(raw) > 240:
        suffix = Path(raw).suffix
        stem_length = max(1, 240 - len(suffix))
        raw = f"{raw[:stem_length]}{suffix}" if suffix else raw[:240]
    return raw


def _serialize(row: ExtractSourceFile) -> dict[str, Any]:
    return {
        "id": row.id,
        "modality": row.modality,
        "hn": row.hn,
        "record_id": row.record_id,
        "filename": row.original_filename,
        "content_type": row.content_type,
        "byte_size": row.byte_size,
        "sha256": row.sha256,
        "source_type": row.source_type,
        "created_at": _iso(row.created_at),
        "linked_at": _iso(row.linked_at),
    }


def _word_extension_from_meta(meta: dict[str, Any]) -> str | None:
    filename = str(meta.get("filename") or "").lower()
    content_type = str(meta.get("content_type") or "").lower()
    if filename.endswith(".docx") or "openxmlformats-officedocument.wordprocessingml.document" in content_type:
        return ".docx"
    if filename.endswith(".doc") or content_type in {
        "application/msword",
        "application/vnd.ms-word",
    }:
        return ".doc"
    return None


def _find_office_converter() -> str | None:
    return shutil.which("soffice") or shutil.which("libreoffice")


def _convert_word_bytes_to_pdf(
    *,
    content: bytes,
    extension: str,
) -> bytes:
    office_path = _find_office_converter()
    if not office_path:
        raise ExtractSourceFileConversionUnavailableError(
            "Word preview requires LibreOffice in the API container"
        )

    suffix = extension if extension in {".doc", ".docx"} else ".docx"
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        source_path = temp_path / f"source{suffix}"
        source_path.write_bytes(content)
        profile_dir = temp_path / "office-profile"
        profile_uri = profile_dir.as_uri()

        try:
            result = subprocess.run(
                [
                    office_path,
                    f"-env:UserInstallation={profile_uri}",
                    "--headless",
                    "--nologo",
                    "--nofirststartwizard",
                    "--nodefault",
                    "--nolockcheck",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(temp_path),
                    str(source_path),
                ],
                capture_output=True,
                text=True,
                timeout=45,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ExtractSourceFileConversionError(
                f"Could not convert Word file to PDF: {exc}"
            ) from exc

        pdf_path = temp_path / "source.pdf"
        if result.returncode != 0 or not pdf_path.exists():
            detail = (result.stderr or result.stdout or "").strip()
            raise ExtractSourceFileConversionError(
                f"Could not convert Word file to PDF{': ' + detail[:300] if detail else ''}"
            )
        return pdf_path.read_bytes()


def create_source_file(
    *,
    modality: str,
    filename: str,
    content_type: str | None,
    content: bytes,
    source_type: str | None = None,
) -> dict[str, Any]:
    clean_modality = str(modality or "").strip().lower()
    if not clean_modality:
        raise ExtractSourceFileValidationError("modality is required")
    if not content:
        raise ExtractSourceFileValidationError("Uploaded file is empty")

    _ensure_table()
    now = _utcnow()
    with session_scope() as session:
        row = ExtractSourceFile(
            modality=clean_modality,
            original_filename=_clean_filename(filename),
            content_type=str(content_type or "").strip() or None,
            byte_size=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
            source_type=str(source_type or "").strip() or None,
            content=content,
            created_at=now,
        )
        session.add(row)
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize(row)


def get_source_file(file_id: str) -> dict[str, Any]:
    clean_id = str(file_id or "").strip()
    if not clean_id:
        raise ExtractSourceFileNotFoundError("Source file was not found")
    _ensure_table()
    with session_scope() as session:
        row = session.get(ExtractSourceFile, clean_id)
        if row is None:
            raise ExtractSourceFileNotFoundError("Source file was not found")
        session.expunge(row)
        return _serialize(row)


def get_source_file_content(file_id: str) -> tuple[dict[str, Any], bytes]:
    clean_id = str(file_id or "").strip()
    if not clean_id:
        raise ExtractSourceFileNotFoundError("Source file was not found")
    _ensure_table()
    with session_scope() as session:
        row = session.get(ExtractSourceFile, clean_id)
        if row is None:
            raise ExtractSourceFileNotFoundError("Source file was not found")
        meta = _serialize(row)
        content = bytes(row.content or b"")
        return meta, content


def get_source_file_pdf_preview(file_id: str) -> tuple[dict[str, Any], bytes]:
    meta, content = get_source_file_content(file_id)
    extension = _word_extension_from_meta(meta)
    if extension is None:
        raise ExtractSourceFileValidationError("PDF preview is only available for Word source files")

    pdf_content = _convert_word_bytes_to_pdf(content=content, extension=extension)
    preview_meta = dict(meta)
    original_name = str(meta.get("filename") or "source-file")
    preview_meta["filename"] = f"{Path(original_name).stem or 'source-file'}.pdf"
    preview_meta["content_type"] = "application/pdf"
    preview_meta["byte_size"] = len(pdf_content)
    return preview_meta, pdf_content


def delete_source_file(file_id: str) -> None:
    clean_id = str(file_id or "").strip()
    if not clean_id:
        raise ExtractSourceFileNotFoundError("Source file was not found")
    _ensure_table()
    with session_scope() as session:
        row = session.get(ExtractSourceFile, clean_id)
        if row is None:
            raise ExtractSourceFileNotFoundError("Source file was not found")
        session.delete(row)


def link_source_file(
    *,
    file_id: str,
    modality: str,
    hn: str,
    record_id: str,
) -> dict[str, Any]:
    clean_id = str(file_id or "").strip()
    clean_modality = str(modality or "").strip().lower()
    clean_hn = str(hn or "").strip()
    clean_record_id = str(record_id or "").strip()
    if not clean_id or not clean_modality or not clean_hn or not clean_record_id:
        raise ExtractSourceFileValidationError("file_id, modality, hn and record_id are required")

    _ensure_table()
    with session_scope() as session:
        row = session.get(ExtractSourceFile, clean_id)
        if row is None:
            raise ExtractSourceFileNotFoundError("Source file was not found")
        if row.modality != clean_modality:
            raise ExtractSourceFileValidationError("Source file modality does not match the saved record")
        if row.record_id and row.record_id != clean_record_id:
            raise ExtractSourceFileValidationError("Source file is already linked to another record")
        row.hn = clean_hn
        row.record_id = clean_record_id
        row.linked_at = _utcnow()
        session.flush()
        session.refresh(row)
        session.expunge(row)
        return _serialize(row)


def list_source_files_for_record(*, modality: str, record_id: str) -> list[dict[str, Any]]:
    clean_modality = str(modality or "").strip().lower()
    clean_record_id = str(record_id or "").strip()
    if not clean_modality or not clean_record_id:
        return []
    _ensure_table()
    with session_scope() as session:
        rows = session.scalars(
            select(ExtractSourceFile)
            .where(ExtractSourceFile.modality == clean_modality)
            .where(ExtractSourceFile.record_id == clean_record_id)
            .order_by(ExtractSourceFile.created_at.desc())
        ).all()
        for row in rows:
            session.expunge(row)
        return [_serialize(row) for row in rows]

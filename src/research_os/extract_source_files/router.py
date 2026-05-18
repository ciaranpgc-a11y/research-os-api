"""FastAPI router for uploaded Extract source files."""

from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from research_os.extract_auth import service as auth_service
from research_os.extract_records.service import MODALITY_MAP
from research_os.extract_source_files import service

router = APIRouter(prefix="/v1/extract", tags=["extract"])

VALID_MODALITIES = tuple(MODALITY_MAP.keys())


def _extract_token(request: Request) -> str:
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _require_session(request: Request) -> dict | JSONResponse:
    token = _extract_token(request)
    if not token:
        return JSONResponse({"detail": "Authentication required"}, status_code=401)
    user = auth_service.get_session_user(token)
    if user is None:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    return user


def _validate_modality(modality: str) -> JSONResponse | None:
    if modality not in MODALITY_MAP:
        return JSONResponse(
            {"detail": f"Invalid modality: {modality!r}. Must be one of {VALID_MODALITIES}"},
            status_code=400,
        )
    return None


@router.get("/source-files/{file_id}/content")
def extract_get_source_file_content(file_id: str, request: Request, format: str | None = None):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        if str(format or "").strip().lower() == "pdf":
            meta, content = service.get_source_file_pdf_preview(file_id)
        else:
            meta, content = service.get_source_file_content(file_id)
    except service.ExtractSourceFileNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)
    except service.ExtractSourceFileConversionUnavailableError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=501)
    except service.ExtractSourceFileValidationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    except service.ExtractSourceFileConversionError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=422)

    filename = str(meta.get("filename") or "source-file")
    media_type = str(meta.get("content_type") or "application/octet-stream")
    quoted = quote(filename)
    return Response(
        content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quoted}",
            "X-Extract-Source-Filename": filename,
        },
    )


@router.get("/source-files/{modality}/{record_id}")
def extract_list_source_files(modality: str, record_id: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    bad = _validate_modality(modality)
    if bad is not None:
        return bad
    return {
        "items": service.list_source_files_for_record(
            modality=modality,
            record_id=record_id,
        )
    }


@router.delete("/source-files/{file_id}", status_code=204)
def extract_delete_source_file(file_id: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        service.delete_source_file(file_id)
    except service.ExtractSourceFileNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)

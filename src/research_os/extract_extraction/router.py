"""FastAPI router for GPT-4o extraction — mounted under /v1/extract/."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from research_os.extract_auth import service as auth_service
from research_os.extract_extraction import service
from research_os.extract_source_files import service as source_files_service
from research_os.extract_extraction.service import (
    ExtractionError,
    ExtractionFileTooLargeError,
    ExtractionParseError,
    ExtractionRateLimitError,
    ExtractionTimeoutError,
    ExtractionTokenLimitError,
    ExtractionUnsupportedFileError,
    SUPPORTED_FILE_EXTENSIONS,
    VALID_MODALITIES,
)

router = APIRouter(prefix="/v1/extract", tags=["extract"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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
    if modality not in VALID_MODALITIES:
        return JSONResponse(
            {"detail": f"Invalid modality: {modality!r}. Must be one of {VALID_MODALITIES}"},
            status_code=400,
        )
    return None


def _handle_extraction_error(exc: ExtractionError) -> JSONResponse:
    """Map extraction exceptions to HTTP responses."""
    if isinstance(exc, ExtractionTimeoutError):
        return JSONResponse({"detail": str(exc)}, status_code=504)
    if isinstance(exc, ExtractionRateLimitError):
        return JSONResponse({"detail": str(exc)}, status_code=503)
    if isinstance(exc, ExtractionParseError):
        return JSONResponse({"detail": str(exc)}, status_code=422)
    if isinstance(exc, ExtractionTokenLimitError):
        return JSONResponse({"detail": str(exc)}, status_code=422)
    if isinstance(exc, ExtractionFileTooLargeError):
        return JSONResponse({"detail": str(exc)}, status_code=413)
    if isinstance(exc, ExtractionUnsupportedFileError):
        return JSONResponse({"detail": str(exc)}, status_code=400)
    return JSONResponse({"detail": str(exc)}, status_code=500)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/extraction/extract")
async def extract_from_text_or_image(request: Request):
    """Extract data from text or base64 image (JSON body).

    Accepts JSON with either:
      { "text": str, "modality": str, "source_type": str | None }
    or:
      { "image_base64": str, "modality": str, "source_type": str | None }
    """
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    body: dict[str, Any] = await request.json()

    modality = body.get("modality", "")
    bad = _validate_modality(modality)
    if bad is not None:
        return bad

    source_type = body.get("source_type")
    text = body.get("text")
    image_base64 = body.get("image_base64")

    if not text and not image_base64:
        return JSONResponse(
            {"detail": "Request must include either 'text' or 'image_base64'"},
            status_code=400,
        )

    try:
        if text:
            result = service.extract_from_text(text, modality, source_type)
        else:
            result = service.extract_from_image(image_base64, modality, source_type)
    except ExtractionError as exc:
        return _handle_extraction_error(exc)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)

    return result


@router.post("/extraction/extract-file")
async def extract_from_file(
    request: Request,
    file: UploadFile = File(...),
    modality: str = Form(...),
    source_type: str | None = Form(None),
):
    """Extract data from an uploaded file (multipart form).

    Supported file types: PDF, DOC/DOCX, PNG, JPG/JPEG.
    Maximum file size: 20 MB.
    """
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    bad = _validate_modality(modality)
    if bad is not None:
        return bad

    filename = file.filename or "unknown"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if f".{ext}" not in SUPPORTED_FILE_EXTENSIONS:
        return JSONResponse(
            {"detail": f"Unsupported file type: .{ext}. Supported: {sorted(SUPPORTED_FILE_EXTENSIONS)}"},
            status_code=400,
        )

    file_bytes = await file.read()

    if len(file_bytes) > service.MAX_FILE_SIZE:
        return JSONResponse(
            {"detail": f"File exceeds the 20 MB limit ({len(file_bytes)} bytes)"},
            status_code=413,
        )

    try:
        result = service.extract_from_file(file_bytes, filename, modality, source_type)
        result["source_file_upload"] = source_files_service.create_source_file(
            modality=modality,
            filename=filename,
            content_type=file.content_type,
            content=file_bytes,
            source_type=source_type,
        )
    except ExtractionError as exc:
        return _handle_extraction_error(exc)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)

    return result


@router.post("/extraction/save")
async def save_extraction(request: Request):
    """Save extraction results to the database.

    JSON body:
    {
        "modality": str,
        "hospital_number": str,
        "create_patient_if_missing": bool,
        "patient_data": dict,
        "record_data": dict
    }
    """
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    body: dict[str, Any] = await request.json()

    modality = body.get("modality", "")
    bad = _validate_modality(modality)
    if bad is not None:
        return bad

    hospital_number = body.get("hospital_number")
    if not hospital_number:
        return JSONResponse({"detail": "hospital_number is required"}, status_code=400)

    create_patient_if_missing = body.get("create_patient_if_missing", False)
    patient_data = body.get("patient_data", {})
    record_data = body.get("record_data", {})
    source_file_upload_id = body.get("source_file_upload_id")

    try:
        result = service.save_extraction(
            modality=modality,
            hospital_number=hospital_number,
            create_patient_if_missing=create_patient_if_missing,
            patient_data=patient_data,
            record_data=record_data,
            source_file_upload_id=source_file_upload_id,
        )
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)

    return result

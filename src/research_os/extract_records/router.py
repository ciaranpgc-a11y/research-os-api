"""FastAPI router for extract records — mounted under /v1/extract/."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from research_os.extract_auth import service as auth_service
from research_os.extract_records import service
from research_os.extract_records.service import MODALITY_MAP

router = APIRouter(prefix="/v1/extract", tags=["extract"])

VALID_MODALITIES = tuple(MODALITY_MAP.keys())


# --- Helpers ---


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


# --- Endpoints ---


@router.get("/records/{modality}")
def extract_list_records(
    modality: str,
    request: Request,
    hn: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    bad = _validate_modality(modality)
    if bad is not None:
        return bad
    return {"items": service.list_records(modality, hn=hn, limit=limit, offset=offset)}


@router.get("/records/{modality}/{record_id}")
def extract_get_record(modality: str, record_id: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    bad = _validate_modality(modality)
    if bad is not None:
        return bad
    try:
        return service.get_record(modality, record_id)
    except service.ExtractRecordNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)


@router.post("/records/{modality}", status_code=201)
async def extract_create_record(modality: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    bad = _validate_modality(modality)
    if bad is not None:
        return bad
    body = await request.json()
    try:
        return service.create_record(modality, body)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.patch("/records/{modality}/{record_id}")
async def extract_update_record(modality: str, record_id: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    bad = _validate_modality(modality)
    if bad is not None:
        return bad
    body = await request.json()
    try:
        return service.update_record(modality, record_id, body)
    except service.ExtractRecordNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.delete("/records/{modality}/{record_id}", status_code=204)
def extract_delete_record(modality: str, record_id: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    bad = _validate_modality(modality)
    if bad is not None:
        return bad
    try:
        service.delete_record(modality, record_id)
    except service.ExtractRecordNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)

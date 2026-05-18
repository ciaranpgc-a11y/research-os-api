"""FastAPI router for editable CMR reference data."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from research_os.cmr_auth import service as auth_service
from research_os.cmr_reference_data import service


router = APIRouter(prefix="/v1/cmr", tags=["cmr-reference-data"])


class ReferenceRangeUpdateRequest(BaseModel):
    updates: list[dict[str, Any]] = Field(default_factory=list)


class ParameterMetaUpdateRequest(BaseModel):
    parameter_key: str
    unit: str | None = None
    indexing: str | None = None
    abnormal_direction: str | None = None
    major_section: str | None = None
    sub_section: str | None = None
    pap_affected: bool | None = None
    sources: list[dict[str, Any]] | None = None
    severity_label: str | None = None
    severity_thresholds: dict[str, float | None] | None = None
    severity_label_override: dict[str, str | None] | None = None
    nested_under: str | None = None
    decimal_places: int | None = None


class EditModeSaveRequest(BaseModel):
    sections: dict[str, list[str]] | None = None
    section_renames: list[dict[str, str]] | None = None
    sub_section_renames: list[dict[str, str]] | None = None
    param_order: list[str] | None = None


def _extract_token(request: Request) -> str:
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _require_session(request: Request) -> dict[str, Any] | JSONResponse:
    token = _extract_token(request)
    if not token:
        return JSONResponse({"detail": "Authentication required"}, status_code=401)
    user = auth_service.get_session_user(token)
    if user is None:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    return user


@router.get("/reference-data")
def get_reference_data(request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    return service.read_reference_data()


@router.put("/reference-data")
def replace_reference_data(body: dict[str, Any], request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        service.replace_reference_data(body)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    return {"ok": True}


@router.put("/reference-data/ranges")
def update_reference_ranges(body: ReferenceRangeUpdateRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        updated = service.update_reference_ranges(body.updates)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    return {"updated": updated}


@router.put("/reference-data/param-meta")
def update_parameter_meta(body: ParameterMetaUpdateRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        service.update_parameter_meta(body.model_dump())
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    return {"ok": True}


@router.put("/reference-data/sections")
def update_sections(body: dict[str, list[str]], request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        service.update_sections(body)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    return {"ok": True}


@router.put("/reference-data/edit-mode")
def save_edit_mode(body: EditModeSaveRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        service.apply_edit_mode_changes(body.model_dump(exclude_none=True))
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    return {"ok": True}


@router.put("/reference-data/config")
def update_config(body: dict[str, Any], request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        service.update_config(body)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    return {"ok": True}

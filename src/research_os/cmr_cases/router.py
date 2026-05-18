"""FastAPI router for persisted CMR cases."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from research_os.cmr_auth import service as auth_service
from research_os.cmr_cases import service

router = APIRouter(prefix="/v1/cmr", tags=["cmr-cases"])


class CreateCaseRequest(BaseModel):
    title: str | None = None


class UpdateCaseRequest(BaseModel):
    title: str | None = None
    patient_label: str | None = None
    report_tag: str | None = None
    study_date: str | None = None
    status: str | None = None
    last_completed_step: str | None = None
    payload: dict[str, Any] | None = Field(default=None)


def _extract_token(request: Request) -> str:
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _require_session_token(request: Request) -> str | JSONResponse:
    token = _extract_token(request)
    if not token:
        return JSONResponse({"detail": "Authentication required"}, status_code=401)
    if auth_service.get_session_context(token) is None:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    return token


@router.get("/cases")
def cmr_list_cases(request: Request):
    token = _require_session_token(request)
    if isinstance(token, JSONResponse):
        return token
    return {"items": service.list_cases(token)}


@router.post("/cases", status_code=201)
def cmr_create_case(body: CreateCaseRequest, request: Request):
    token = _require_session_token(request)
    if isinstance(token, JSONResponse):
        return token
    return service.create_case(token, title=body.title)


@router.get("/cases/{case_id}")
def cmr_get_case(case_id: str, request: Request):
    token = _require_session_token(request)
    if isinstance(token, JSONResponse):
        return token
    try:
        return service.get_case(token, case_id=case_id)
    except service.CmrCaseNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)


@router.patch("/cases/{case_id}")
def cmr_update_case(case_id: str, body: UpdateCaseRequest, request: Request):
    token = _require_session_token(request)
    if isinstance(token, JSONResponse):
        return token

    updates: dict[str, Any] = {}
    for field_name in body.model_fields_set:
        updates[field_name] = getattr(body, field_name)

    try:
        return service.update_case(token, case_id=case_id, **updates)
    except service.CmrCaseNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)
    except service.CmrCaseValidationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.delete("/cases/{case_id}", status_code=204)
def cmr_delete_case(case_id: str, request: Request):
    token = _require_session_token(request)
    if isinstance(token, JSONResponse):
        return token
    try:
        service.delete_case(token, case_id=case_id)
    except service.CmrCaseNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)

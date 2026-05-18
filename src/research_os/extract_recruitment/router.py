"""FastAPI router for extract recruitment -- mounted under /v1/extract/."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from research_os.extract_auth import service as auth_service
from research_os.extract_recruitment import service

router = APIRouter(prefix="/v1/extract", tags=["extract"])


# --- Request models ---


class CreateRecruitmentRequest(BaseModel):
    hn: str
    patient_id: str | None = None
    eligible_for_study: int = 0
    cohort: str | None = None
    contact_method: str | None = None
    contact_number: str | None = None
    email_address: str | None = None
    recruitment_status: str | None = None
    comments: str | None = None
    date_identified: str | None = None
    date_first_contact: str | None = None
    date_pis_sent: str | None = None
    date_consent: str | None = None
    cpex_date: str | None = None
    consent_to_email: int = 0
    pis_sent: int = 0
    consent_obtained: int = 0
    cpex_required: int = 0
    cpex_booked: int = 0
    cpex_completed: int = 0
    status: str = "Pending"
    cpex_scheduled: int = 0
    cmr_required: int = 0
    cmr_requested: int = 0
    cmr_scheduled: int = 0
    cmr_completed: int = 0
    rhc_required: int = 0
    rhc_requested: int = 0
    rhc_scheduled: int = 0
    rhc_completed: int = 0
    echo_required: int = 0
    echo_requested: int = 0
    echo_scheduled: int = 0
    echo_completed: int = 0
    cpex_appropriate: int = 0
    cmr_appropriate: int = 0
    rhc_appropriate: int = 0
    echo_appropriate: int = 0
    source: str | None = None
    notes: str | None = None
    inx_rhc: str | None = None
    inx_echo: str | None = None
    inx_cmr: str | None = None
    inx_cpex: str | None = None


class UpdateRecruitmentRequest(BaseModel):
    patient_id: str | None = None
    eligible_for_study: int | None = None
    cohort: str | None = None
    contact_method: str | None = None
    contact_number: str | None = None
    email_address: str | None = None
    recruitment_status: str | None = None
    comments: str | None = None
    date_identified: str | None = None
    date_first_contact: str | None = None
    date_pis_sent: str | None = None
    date_consent: str | None = None
    cpex_date: str | None = None
    consent_to_email: int | None = None
    pis_sent: int | None = None
    consent_obtained: int | None = None
    cpex_required: int | None = None
    cpex_booked: int | None = None
    cpex_completed: int | None = None
    status: str | None = None
    cpex_scheduled: int | None = None
    cmr_required: int | None = None
    cmr_requested: int | None = None
    cmr_scheduled: int | None = None
    cmr_completed: int | None = None
    rhc_required: int | None = None
    rhc_requested: int | None = None
    rhc_scheduled: int | None = None
    rhc_completed: int | None = None
    echo_required: int | None = None
    echo_requested: int | None = None
    echo_scheduled: int | None = None
    echo_completed: int | None = None
    cpex_appropriate: int | None = None
    cmr_appropriate: int | None = None
    rhc_appropriate: int | None = None
    echo_appropriate: int | None = None
    source: str | None = None
    notes: str | None = None
    inx_rhc: str | None = None
    inx_echo: str | None = None
    inx_cmr: str | None = None
    inx_cpex: str | None = None


class BulkStatusRequest(BaseModel):
    hns: list[str]
    status: str


class CreateRecruitmentNoteRequest(BaseModel):
    author_name: str | None = None
    note_date: str | None = None
    body: str


class UpdateRecruitmentNoteRequest(BaseModel):
    author_name: str | None = None
    note_date: str | None = None
    body: str | None = None


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


# --- Endpoints ---


@router.get("/recruitment")
def extract_list_recruitment(
    request: Request,
    cohort: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    return {"items": service.list_recruitment(cohort=cohort, status=status, limit=limit, offset=offset)}


@router.patch("/recruitment/bulk-status")
def extract_bulk_update_status(body: BulkStatusRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    count = service.bulk_update_status(hns=body.hns, status=body.status)
    return {"updated": count}


@router.get("/recruitment/{hn}")
def extract_get_recruitment(hn: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        return service.get_recruitment(hn)
    except service.ExtractRecruitmentNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)


@router.get("/recruitment/{hn}/notes")
def extract_list_recruitment_notes(hn: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    return {"items": service.list_notes(hn)}


@router.post("/recruitment/{hn}/notes", status_code=201)
def extract_create_recruitment_note(hn: str, body: CreateRecruitmentNoteRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        return service.create_note(
            hn,
            body.model_dump(),
            author_name=str(guard.get("name") or ""),
            author_access_code_id=str(guard.get("access_code_id") or ""),
        )
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.patch("/recruitment/{hn}/notes/{note_id}")
def extract_update_recruitment_note(
    hn: str,
    note_id: str,
    body: UpdateRecruitmentNoteRequest,
    request: Request,
):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    updates: dict[str, Any] = {}
    for field_name in body.model_fields_set:
        updates[field_name] = getattr(body, field_name)
    try:
        return service.update_note(hn, note_id, updates)
    except service.ExtractRecruitmentNoteNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.delete("/recruitment/{hn}/notes/{note_id}", status_code=204)
def extract_delete_recruitment_note(hn: str, note_id: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        service.delete_note(hn, note_id)
    except service.ExtractRecruitmentNoteNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)


@router.post("/recruitment", status_code=201)
def extract_create_recruitment(body: CreateRecruitmentRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        data = body.model_dump(exclude={"hn"})
        return service.create_recruitment(hn=body.hn, data=data)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.patch("/recruitment/{hn}")
def extract_update_recruitment(hn: str, body: UpdateRecruitmentRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    updates: dict[str, Any] = {}
    for field_name in body.model_fields_set:
        updates[field_name] = getattr(body, field_name)
    try:
        return service.update_recruitment(hn, data=updates)
    except service.ExtractRecruitmentNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)

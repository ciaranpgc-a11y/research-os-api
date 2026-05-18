"""FastAPI router for extract patients — mounted under /v1/extract/."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from research_os.extract_auth import service as auth_service
from research_os.extract_patients import service

router = APIRouter(prefix="/v1/extract", tags=["extract"])


# --- Request models ---


class CreatePatientRequest(BaseModel):
    hn: str
    name: str | None = None
    dob: str | None = None
    gender: str | None = None
    anonymisation_code: str | None = None
    images_uploaded: bool = False
    rip_tag: bool = False
    action_flag: bool = False
    tracking_details: str | None = None
    study_id: str | None = None
    source: str | None = None


class UpdatePatientRequest(BaseModel):
    name: str | None = None
    dob: str | None = None
    gender: str | None = None
    anonymisation_code: str | None = None
    images_uploaded: bool | None = None
    rip_tag: bool | None = None
    action_flag: bool | None = None
    tracking_details: str | None = None
    study_id: str | None = None
    source: str | None = None


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


@router.get("/patients")
def extract_list_patients(
    request: Request,
    search: str | None = None,
    status: str | None = None,
    source: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    return {
        "items": service.list_patients(
            search=search,
            status=status,
            source=source,
            limit=limit,
            offset=offset,
        ),
        "total": service.count_patients(search=search, status=status, source=source),
    }


@router.get("/patients/stats")
def extract_patient_stats(request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    return service.get_stats()


@router.get("/patients/{hn}")
def extract_get_patient(hn: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        return service.get_patient(hn)
    except service.ExtractPatientNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)


@router.post("/patients", status_code=201)
def extract_create_patient(body: CreatePatientRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        return service.create_patient(
            hn=body.hn,
            name=body.name,
            dob=body.dob,
            gender=body.gender,
            anonymisation_code=body.anonymisation_code,
            images_uploaded=body.images_uploaded,
            rip_tag=body.rip_tag,
            action_flag=body.action_flag,
            tracking_details=body.tracking_details,
            study_id=body.study_id,
            source=body.source,
        )
    except service.ExtractPatientValidationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.patch("/patients/{hn}")
def extract_update_patient(hn: str, body: UpdatePatientRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    updates: dict[str, Any] = {}
    for field_name in body.model_fields_set:
        updates[field_name] = getattr(body, field_name)

    try:
        return service.update_patient(hn, **updates)
    except service.ExtractPatientNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)
    except service.ExtractPatientValidationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.delete("/patients/{hn}", status_code=204)
def extract_delete_patient(hn: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        service.delete_patient(hn)
    except service.ExtractPatientNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)

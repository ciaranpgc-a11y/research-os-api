"""FastAPI router for Extract per-patient clinical data."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from research_os.extract_auth import service as auth_service
from research_os.extract_clinical_data import service

router = APIRouter(prefix="/v1/extract", tags=["extract"])


class ClinicalDataSaveRequest(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


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


@router.get("/clinical-data/{hn}")
def extract_get_clinical_data(hn: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    return service.get_clinical_data(hn)


@router.put("/clinical-data/{hn}")
def extract_save_clinical_data(
    hn: str, body: ClinicalDataSaveRequest, request: Request
):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        return service.save_clinical_data(hn, body.data)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


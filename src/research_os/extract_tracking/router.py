"""FastAPI router for standalone extract tracking entries."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from research_os.extract_auth import service as auth_service
from research_os.extract_tracking import service

router = APIRouter(prefix="/v1/extract", tags=["extract"])


class TrackingEntryRequest(BaseModel):
    name: str | None = None
    hn: str | None = None
    details: str | None = None


class BookingEntryRequest(BaseModel):
    name: str | None = None
    hn: str | None = None
    investigation: str | None = None
    booking_date: str | None = None
    booking_time: str | None = None
    details: str | None = None


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


@router.get("/tracking")
def extract_list_tracking(request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    return {"items": service.list_tracking_entries()}


@router.post("/tracking", status_code=201)
def extract_create_tracking(body: TrackingEntryRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        return service.create_tracking_entry(
            name=body.name,
            hn=body.hn,
            details=body.details,
        )
    except service.ExtractTrackingValidationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.patch("/tracking/{entry_id}")
def extract_update_tracking(entry_id: str, body: TrackingEntryRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    updates: dict[str, Any] = {}
    for field_name in body.model_fields_set:
        updates[field_name] = getattr(body, field_name)
    try:
        return service.update_tracking_entry(entry_id, **updates)
    except service.ExtractTrackingNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)
    except service.ExtractTrackingValidationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.delete("/tracking/{entry_id}", status_code=204)
def extract_delete_tracking(entry_id: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        service.delete_tracking_entry(entry_id)
    except service.ExtractTrackingNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)


@router.get("/bookings")
def extract_list_bookings(request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    return {"items": service.list_booking_entries()}


@router.post("/bookings", status_code=201)
def extract_create_booking(body: BookingEntryRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        return service.create_booking_entry(
            name=body.name,
            hn=body.hn,
            investigation=body.investigation,
            booking_date=body.booking_date,
            booking_time=body.booking_time,
            details=body.details,
        )
    except service.ExtractTrackingValidationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.patch("/bookings/{entry_id}")
def extract_update_booking(entry_id: str, body: BookingEntryRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    updates: dict[str, Any] = {}
    for field_name in body.model_fields_set:
        updates[field_name] = getattr(body, field_name)
    try:
        return service.update_booking_entry(entry_id, **updates)
    except service.ExtractTrackingNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)
    except service.ExtractTrackingValidationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)


@router.delete("/bookings/{entry_id}", status_code=204)
def extract_delete_booking(entry_id: str, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard
    try:
        service.delete_booking_entry(entry_id)
    except service.ExtractTrackingNotFoundError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=404)

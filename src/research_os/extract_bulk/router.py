"""FastAPI router for bulk cohort export — mounted under /v1/extract/."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from research_os.extract_auth import service as auth_service
from research_os.extract_bulk import service

router = APIRouter(prefix="/v1/extract", tags=["extract"])


# --- Helpers (same pattern as other extract routers) ---


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


@router.get("/bulk/export")
def bulk_export(
    request: Request,
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
):
    """Export the full cohort as CSV or Excel."""
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        file_bytes, content_type, filename = service.export_cohort(format)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)

    return StreamingResponse(
        iter([file_bytes]),
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )

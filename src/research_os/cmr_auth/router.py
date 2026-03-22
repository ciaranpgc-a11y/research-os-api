"""FastAPI router for CMR access control — mounted under /v1/cmr/."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from research_os.cmr_auth import service

router = APIRouter(prefix="/v1/cmr", tags=["cmr"])


# --- Request/Response models ---

class UserLoginRequest(BaseModel):
    code: str

class AdminLoginRequest(BaseModel):
    password: str

class CreateCodeRequest(BaseModel):
    name: str
    code: str


# --- Helpers ---

def _extract_token(request: Request) -> str:
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _require_admin(request: Request) -> dict | JSONResponse:
    token = _extract_token(request)
    if not token:
        return JSONResponse({"detail": "Authentication required"}, status_code=401)
    user = service.get_session_user(token)
    if user is None:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    if not user["is_admin"]:
        return JSONResponse({"detail": "Admin access required"}, status_code=403)
    return user


# --- User endpoints ---

@router.post("/auth/login")
def cmr_user_login(body: UserLoginRequest):
    result = service.user_login(body.code)
    if result is None:
        return JSONResponse({"detail": "Invalid access code"}, status_code=401)
    return result


@router.get("/auth/me")
def cmr_auth_me(request: Request):
    token = _extract_token(request)
    if not token:
        return JSONResponse({"detail": "Authentication required"}, status_code=401)
    user = service.get_session_user(token)
    if user is None:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    return user


@router.post("/auth/logout", status_code=204)
def cmr_auth_logout(request: Request):
    token = _extract_token(request)
    if token:
        service.delete_session(token)
    return Response(status_code=204)


# --- Admin endpoints ---

@router.post("/admin/login")
def cmr_admin_login(body: AdminLoginRequest):
    result = service.admin_login(body.password)
    if result is None:
        return JSONResponse({"detail": "Invalid admin password"}, status_code=401)
    return result


@router.get("/admin/codes")
def cmr_admin_list_codes(request: Request):
    guard = _require_admin(request)
    if isinstance(guard, JSONResponse):
        return guard
    return service.list_access_codes()


@router.post("/admin/codes", status_code=201)
def cmr_admin_create_code(body: CreateCodeRequest, request: Request):
    guard = _require_admin(request)
    if isinstance(guard, JSONResponse):
        return guard
    result = service.create_access_code(body.name, body.code)
    return JSONResponse(result, status_code=201)


@router.delete("/admin/codes/{code_id}", status_code=204)
def cmr_admin_revoke_code(code_id: str, request: Request):
    guard = _require_admin(request)
    if isinstance(guard, JSONResponse):
        return guard
    result = service.revoke_access_code(code_id)
    if isinstance(result, str):
        return JSONResponse({"detail": result}, status_code=400)
    return Response(status_code=204)

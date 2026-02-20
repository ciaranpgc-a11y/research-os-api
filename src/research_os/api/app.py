import logging
import os
import time
from uuid import uuid4

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from research_os.config import get_openai_api_key
from research_os.api.schemas import (
    DraftMethodsRequest,
    DraftMethodsSuccessResponse,
    ErrorResponse,
    HealthResponse,
)
from research_os.services.manuscript_service import (
    ManuscriptGenerationError,
    draft_methods_from_notes,
)
from research_os.logging_config import configure_logging

configure_logging()
logger = logging.getLogger(__name__)

ERROR_RESPONSES = {
    500: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
}


app = FastAPI(title="Research OS API", version="0.1.0")

cors_allow_origins = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:5173,https://research-os-ui.onrender.com",
)
allow_origins = [
    origin.strip() for origin in cors_allow_origins.split(",") if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# Fail fast during startup to avoid confusing downstream OpenAI runtime errors.
# Tests set a dummy OPENAI_API_KEY before creating TestClient.
@app.on_event("startup")
def validate_configuration() -> None:
    get_openai_api_key()


@app.middleware("http")
async def add_request_context(request: Request, call_next):
    request_id = str(uuid4())
    request.state.request_id = request_id
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request_completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


@app.exception_handler(Exception)
async def handle_unexpected_exception(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    logger.exception(
        "unhandled_exception",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
        },
    )
    response = _build_error_response(exc)
    if request_id:
        response.headers["X-Request-ID"] = request_id
    return response


def _build_error_response(exc: Exception) -> JSONResponse:
    if isinstance(exc, ManuscriptGenerationError):
        return JSONResponse(
            status_code=502,
            content={
                "error": {
                    "message": "OpenAI request failed",
                    "type": "openai_error",
                    "detail": str(exc),
                }
            },
        )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "message": "Internal server error",
                "type": "internal_error",
                "detail": str(exc),
            }
        },
    )


def _generate_methods_response(
    request: DraftMethodsRequest,
) -> DraftMethodsSuccessResponse | JSONResponse:
    try:
        return DraftMethodsSuccessResponse(
            methods=draft_methods_from_notes(request.notes)
        )
    except Exception as exc:
        return _build_error_response(exc)


@app.get("/v1/health", response_model=HealthResponse, tags=["v1"])
def v1_health_check() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post(
    "/v1/draft/methods",
    response_model=DraftMethodsSuccessResponse,
    responses=ERROR_RESPONSES,
    tags=["v1"],
)
def v1_draft_methods(
    request: DraftMethodsRequest,
) -> DraftMethodsSuccessResponse | JSONResponse:
    return _generate_methods_response(request)


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return v1_health_check()


@app.post("/draft/methods", responses=ERROR_RESPONSES)
def draft_methods(request: DraftMethodsRequest):
    response = v1_draft_methods(request)
    if isinstance(response, JSONResponse):
        return response
    return {"draft": response.methods}

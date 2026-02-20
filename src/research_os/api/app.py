import logging
import os
import time
from contextlib import asynccontextmanager
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
    JournalOptionResponse,
    ManuscriptCreateRequest,
    ManuscriptResponse,
    ProjectCreateRequest,
    ProjectResponse,
    WizardBootstrapRequest,
    WizardBootstrapResponse,
    WizardInferRequest,
    WizardInferResponse,
)
from research_os.logging_config import configure_logging
from research_os.services.project_service import (
    ManuscriptBranchConflictError,
    ProjectNotFoundError,
    create_manuscript_for_project,
    create_project_record,
    list_project_manuscripts,
    list_project_records,
)
from research_os.services.manuscript_service import (
    ManuscriptGenerationError,
    draft_methods_from_notes,
)
from research_os.services.wizard_service import (
    JOURNAL_PRESETS,
    bootstrap_project_from_wizard,
    infer_wizard_state,
)

configure_logging()
logger = logging.getLogger(__name__)

ERROR_RESPONSES = {
    500: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
}

NOT_FOUND_RESPONSES = {
    404: {"model": ErrorResponse},
}

CONFLICT_RESPONSES = {
    409: {"model": ErrorResponse},
}

@asynccontextmanager
async def app_lifespan(_: FastAPI):
    # Fail fast during startup to avoid confusing downstream OpenAI runtime errors.
    # Tests set a dummy OPENAI_API_KEY before creating TestClient.
    get_openai_api_key()
    yield


app = FastAPI(title="Research OS API", version="0.1.0", lifespan=app_lifespan)

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


def _build_not_found_response(detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content={
            "error": {
                "message": "Resource not found",
                "type": "not_found",
                "detail": detail,
            }
        },
    )


def _build_conflict_response(detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={
            "error": {
                "message": "Conflict",
                "type": "conflict",
                "detail": detail,
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


@app.get("/v1/journals", response_model=list[JournalOptionResponse], tags=["v1"])
def v1_list_journal_presets() -> list[JournalOptionResponse]:
    return [JournalOptionResponse(**preset) for preset in JOURNAL_PRESETS]


@app.post("/v1/wizard/infer", response_model=WizardInferResponse, tags=["v1"])
def v1_wizard_infer(request: WizardInferRequest) -> WizardInferResponse:
    return WizardInferResponse(
        **infer_wizard_state(request.target_journal, request.answers)
    )


@app.post("/v1/wizard/bootstrap", response_model=WizardBootstrapResponse, tags=["v1"])
def v1_wizard_bootstrap(request: WizardBootstrapRequest) -> WizardBootstrapResponse:
    project, manuscript, inference = bootstrap_project_from_wizard(
        title=request.title,
        target_journal=request.target_journal,
        answers=request.answers,
        journal_voice=request.journal_voice,
        language=request.language,
        branch_name=request.branch_name,
    )
    return WizardBootstrapResponse(
        project=project,
        manuscript=manuscript,
        inference=WizardInferResponse(**inference),
    )


@app.get("/v1/projects", response_model=list[ProjectResponse], tags=["v1"])
def v1_list_projects() -> list[ProjectResponse]:
    return list_project_records()


@app.post("/v1/projects", response_model=ProjectResponse, tags=["v1"])
def v1_create_project(request: ProjectCreateRequest) -> ProjectResponse:
    return create_project_record(
        title=request.title,
        target_journal=request.target_journal,
        journal_voice=request.journal_voice,
        language=request.language,
        study_type=request.study_type,
        study_brief=request.study_brief,
    )


@app.get(
    "/v1/projects/{project_id}/manuscripts",
    response_model=list[ManuscriptResponse],
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_list_manuscripts(project_id: str) -> list[ManuscriptResponse] | JSONResponse:
    try:
        return list_project_manuscripts(project_id)
    except ProjectNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/projects/{project_id}/manuscripts",
    response_model=ManuscriptResponse,
    responses=NOT_FOUND_RESPONSES | CONFLICT_RESPONSES,
    tags=["v1"],
)
def v1_create_manuscript(
    project_id: str, request: ManuscriptCreateRequest
) -> ManuscriptResponse | JSONResponse:
    try:
        return create_manuscript_for_project(
            project_id=project_id,
            branch_name=request.branch_name,
            sections=request.sections,
        )
    except ProjectNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except ManuscriptBranchConflictError as exc:
        return _build_conflict_response(str(exc))


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

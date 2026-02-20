import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI
from fastapi import Query
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import PlainTextResponse

from research_os.config import get_openai_api_key
from research_os.api.schemas import (
    DraftMethodsRequest,
    DraftMethodsSuccessResponse,
    DraftSectionRequest,
    DraftSectionSuccessResponse,
    ErrorResponse,
    GenerationJobRetryRequest,
    GenerationJobResponse,
    HealthResponse,
    JournalOptionResponse,
    QCRunResponse,
    SelectionInsightResponse,
    ManuscriptCreateRequest,
    ManuscriptGenerateRequest,
    ManuscriptSnapshotCreateRequest,
    ManuscriptSnapshotRestoreRequest,
    ManuscriptSnapshotResponse,
    ManuscriptSectionsUpdateRequest,
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
    ManuscriptNotFoundError,
    ManuscriptSnapshotNotFoundError,
    ManuscriptSnapshotRestoreModeError,
    ProjectNotFoundError,
    export_project_manuscript_markdown,
    create_manuscript_snapshot,
    create_manuscript_for_project,
    create_project_record,
    get_project_manuscript,
    list_manuscript_snapshots,
    list_project_manuscripts,
    list_project_records,
    restore_manuscript_snapshot,
    update_project_manuscript_sections,
)
from research_os.services.generation_job_service import (
    GenerationBudgetExceededError,
    GenerationDailyBudgetExceededError,
    GenerationJobConflictError,
    GenerationJobNotFoundError,
    GenerationJobStateError,
    cancel_generation_job,
    enqueue_generation_job,
    get_generation_job_record,
    list_generation_jobs_for_manuscript,
    retry_generation_job,
    serialize_generation_job,
)
from research_os.services.insight_service import (
    SelectionInsightNotFoundError,
    get_selection_insight,
)
from research_os.services.qc_service import run_qc_checks
from research_os.services.manuscript_service import (
    ManuscriptGenerationError,
    draft_methods_from_notes,
    draft_section_from_notes,
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
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
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


def _generate_section_response(
    section: str, notes: str
) -> DraftSectionSuccessResponse | JSONResponse:
    try:
        return DraftSectionSuccessResponse(
            section=section,
            draft=draft_section_from_notes(section, notes),
        )
    except Exception as exc:
        return _build_error_response(exc)


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


@app.get(
    "/v1/aawe/insights/{selection_type}/{item_id}",
    response_model=SelectionInsightResponse,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_get_aawe_selection_insight(
    selection_type: Literal["claim", "result", "qc"],
    item_id: str,
) -> SelectionInsightResponse | JSONResponse:
    try:
        payload = get_selection_insight(selection_type, item_id)
        return SelectionInsightResponse(**payload)
    except SelectionInsightNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.post("/v1/aawe/qc/run", response_model=QCRunResponse, tags=["v1"])
def v1_run_aawe_qc() -> QCRunResponse:
    return QCRunResponse(**run_qc_checks())


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


@app.get(
    "/v1/projects/{project_id}/manuscripts/{manuscript_id}",
    response_model=ManuscriptResponse,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_get_manuscript(
    project_id: str, manuscript_id: str
) -> ManuscriptResponse | JSONResponse:
    try:
        return get_project_manuscript(project_id, manuscript_id)
    except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
        return _build_not_found_response(str(exc))


@app.patch(
    "/v1/projects/{project_id}/manuscripts/{manuscript_id}",
    response_model=ManuscriptResponse,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_update_manuscript_sections(
    project_id: str,
    manuscript_id: str,
    request: ManuscriptSectionsUpdateRequest,
) -> ManuscriptResponse | JSONResponse:
    try:
        return update_project_manuscript_sections(
            project_id=project_id,
            manuscript_id=manuscript_id,
            sections=request.sections,
        )
    except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
        return _build_not_found_response(str(exc))


@app.get(
    "/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots",
    response_model=list[ManuscriptSnapshotResponse],
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_list_manuscript_snapshots(
    project_id: str, manuscript_id: str, limit: int = Query(default=20, ge=1, le=100)
) -> list[ManuscriptSnapshotResponse] | JSONResponse:
    try:
        snapshots = list_manuscript_snapshots(
            project_id=project_id,
            manuscript_id=manuscript_id,
            limit=limit,
        )
        return [ManuscriptSnapshotResponse.model_validate(snapshot) for snapshot in snapshots]
    except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots",
    response_model=ManuscriptSnapshotResponse,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_create_manuscript_snapshot(
    project_id: str,
    manuscript_id: str,
    request: ManuscriptSnapshotCreateRequest,
) -> ManuscriptSnapshotResponse | JSONResponse:
    try:
        snapshot = create_manuscript_snapshot(
            project_id=project_id,
            manuscript_id=manuscript_id,
            label=request.label,
            include_sections=request.include_sections,
        )
        return ManuscriptSnapshotResponse.model_validate(snapshot)
    except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/projects/{project_id}/manuscripts/{manuscript_id}/snapshots/{snapshot_id}/restore",
    response_model=ManuscriptResponse,
    responses=NOT_FOUND_RESPONSES | CONFLICT_RESPONSES,
    tags=["v1"],
)
def v1_restore_manuscript_snapshot(
    project_id: str,
    manuscript_id: str,
    snapshot_id: str,
    request: ManuscriptSnapshotRestoreRequest | None = None,
) -> ManuscriptResponse | JSONResponse:
    try:
        restore_request = request or ManuscriptSnapshotRestoreRequest()
        manuscript = restore_manuscript_snapshot(
            project_id=project_id,
            manuscript_id=manuscript_id,
            snapshot_id=snapshot_id,
            restore_mode=restore_request.mode,
            sections=restore_request.sections,
        )
        return ManuscriptResponse.model_validate(manuscript)
    except (
        ProjectNotFoundError,
        ManuscriptNotFoundError,
        ManuscriptSnapshotNotFoundError,
    ) as exc:
        return _build_not_found_response(str(exc))
    except ManuscriptSnapshotRestoreModeError as exc:
        return _build_conflict_response(str(exc))


@app.get(
    "/v1/projects/{project_id}/manuscripts/{manuscript_id}/export/markdown",
    response_model=None,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_export_manuscript_markdown(
    project_id: str,
    manuscript_id: str,
    include_empty: bool = Query(default=False),
) -> PlainTextResponse:
    try:
        filename, markdown = export_project_manuscript_markdown(
            project_id=project_id,
            manuscript_id=manuscript_id,
            include_empty_sections=include_empty,
        )
        return PlainTextResponse(
            content=markdown,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/projects/{project_id}/manuscripts/{manuscript_id}/generate",
    response_model=GenerationJobResponse,
    responses=NOT_FOUND_RESPONSES | CONFLICT_RESPONSES,
    tags=["v1"],
)
def v1_generate_manuscript(
    project_id: str,
    manuscript_id: str,
    request: ManuscriptGenerateRequest,
) -> GenerationJobResponse | JSONResponse:
    try:
        job = enqueue_generation_job(
            project_id=project_id,
            manuscript_id=manuscript_id,
            sections=request.sections,
            notes_context=request.notes_context,
            max_estimated_cost_usd=request.max_estimated_cost_usd,
            project_daily_budget_usd=request.project_daily_budget_usd,
        )
        return GenerationJobResponse(**serialize_generation_job(job))
    except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
        return _build_not_found_response(str(exc))
    except (
        GenerationBudgetExceededError,
        GenerationDailyBudgetExceededError,
        GenerationJobConflictError,
    ) as exc:
        return _build_conflict_response(str(exc))


@app.get(
    "/v1/projects/{project_id}/manuscripts/{manuscript_id}/generation-jobs",
    response_model=list[GenerationJobResponse],
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_list_generation_jobs(
    project_id: str, manuscript_id: str, limit: int = Query(default=20, ge=1, le=100)
) -> list[GenerationJobResponse] | JSONResponse:
    try:
        jobs = list_generation_jobs_for_manuscript(
            project_id=project_id,
            manuscript_id=manuscript_id,
            limit=limit,
        )
        return [GenerationJobResponse(**serialize_generation_job(job)) for job in jobs]
    except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
        return _build_not_found_response(str(exc))


@app.get(
    "/v1/generation-jobs/{job_id}",
    response_model=GenerationJobResponse,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_get_generation_job(job_id: str) -> GenerationJobResponse | JSONResponse:
    try:
        job = get_generation_job_record(job_id)
        return GenerationJobResponse(**serialize_generation_job(job))
    except GenerationJobNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/generation-jobs/{job_id}/cancel",
    response_model=GenerationJobResponse,
    responses=NOT_FOUND_RESPONSES | CONFLICT_RESPONSES,
    tags=["v1"],
)
def v1_cancel_generation_job(job_id: str) -> GenerationJobResponse | JSONResponse:
    try:
        job = cancel_generation_job(job_id)
        return GenerationJobResponse(**serialize_generation_job(job))
    except GenerationJobNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except GenerationJobStateError as exc:
        return _build_conflict_response(str(exc))


@app.post(
    "/v1/generation-jobs/{job_id}/retry",
    response_model=GenerationJobResponse,
    responses=NOT_FOUND_RESPONSES | CONFLICT_RESPONSES,
    tags=["v1"],
)
def v1_retry_generation_job(
    job_id: str, request: GenerationJobRetryRequest
) -> GenerationJobResponse | JSONResponse:
    try:
        job = retry_generation_job(
            job_id,
            max_estimated_cost_usd=request.max_estimated_cost_usd,
            project_daily_budget_usd=request.project_daily_budget_usd,
        )
        return GenerationJobResponse(**serialize_generation_job(job))
    except GenerationJobNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except (
        GenerationJobStateError,
        GenerationBudgetExceededError,
        GenerationDailyBudgetExceededError,
        GenerationJobConflictError,
    ) as exc:
        return _build_conflict_response(str(exc))


@app.post(
    "/v1/draft/section",
    response_model=DraftSectionSuccessResponse,
    responses=ERROR_RESPONSES,
    tags=["v1"],
)
def v1_draft_section(
    request: DraftSectionRequest,
) -> DraftSectionSuccessResponse | JSONResponse:
    return _generate_section_response(request.section, request.notes)


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


@app.post("/draft/section", responses=ERROR_RESPONSES)
def draft_section(request: DraftSectionRequest):
    response = v1_draft_section(request)
    if isinstance(response, JSONResponse):
        return response
    return {"section": response.section, "draft": response.draft}

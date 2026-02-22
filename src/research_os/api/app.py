import base64
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
    AnalysisScaffoldRequest,
    AnalysisScaffoldResponse,
    AuthLoginRequest,
    AuthLogoutResponse,
    AuthMeUpdateRequest,
    AuthRegisterRequest,
    AuthSessionResponse,
    AuthUserResponse,
    ClaimLinkerRequest,
    ClaimLinkerResponse,
    CitationAutofillRequest,
    CitationAutofillResponse,
    CitationExportRequest,
    CitationRecordResponse,
    ClaimCitationStateResponse,
    ClaimCitationUpdateRequest,
    ConsistencyCheckRequest,
    ConsistencyCheckResponse,
    DataProfileRequest,
    DataProfileResponse,
    DraftMethodsRequest,
    DraftMethodsSuccessResponse,
    DraftSectionRequest,
    DraftSectionSuccessResponse,
    ErrorResponse,
    GenerationEstimateRequest,
    GenerationEstimateResponse,
    GenerationJobRetryRequest,
    GenerationJobResponse,
    FiguresScaffoldRequest,
    FiguresScaffoldResponse,
    GroundedDraftRequest,
    GroundedDraftResponse,
    HealthResponse,
    ImpactAnalyseRequest,
    ImpactAnalyseResponse,
    ImpactCollaboratorsResponse,
    ImpactRecomputeResponse,
    ImpactReportResponse,
    ImpactThemesResponse,
    JournalOptionResponse,
    LibraryAssetResponse,
    LibraryAssetUploadResponse,
    ManuscriptAttachAssetsRequest,
    ManuscriptAttachAssetsResponse,
    QCRunResponse,
    ResearchOverviewSuggestionsRequest,
    ResearchOverviewSuggestionsResponse,
    SelectionInsightResponse,
    ManuscriptCreateRequest,
    ManuscriptGenerateRequest,
    ManuscriptSnapshotCreateRequest,
    ManuscriptSnapshotRestoreRequest,
    ManuscriptSnapshotResponse,
    ManuscriptSectionsUpdateRequest,
    ManuscriptResponse,
    PlanClarificationNextQuestionRequest,
    PlanClarificationNextQuestionResponse,
    PlanClarificationQuestionsRequest,
    PlanClarificationQuestionsResponse,
    PlanSectionEditRequest,
    PlanSectionEditResponse,
    PlanSectionImproveRequest,
    PlanSectionImproveResponse,
    ParagraphRegenerationRequest,
    ParagraphRegenerationResponse,
    PersonaContextResponse,
    PersonaEmbeddingsGenerateRequest,
    PersonaEmbeddingsGenerateResponse,
    PersonaImportOrcidRequest,
    PersonaImportOrcidResponse,
    PersonaMetricsSyncRequest,
    PersonaMetricsSyncResponse,
    PersonaWorkResponse,
    ProjectCreateRequest,
    ProjectResponse,
    QCGatedExportRequest,
    ReferencePackRequest,
    SectionPlanRequest,
    SectionPlanResponse,
    TablesScaffoldRequest,
    TablesScaffoldResponse,
    ManuscriptPlanUpdateRequest,
    ManuscriptPlanUpdateResponse,
    SubmissionPackRequest,
    SubmissionPackResponse,
    TitleAbstractSynthesisRequest,
    TitleAbstractSynthesisResponse,
    OrcidCallbackResponse,
    OrcidConnectResponse,
    WizardBootstrapRequest,
    WizardBootstrapResponse,
    WizardInferRequest,
    WizardInferResponse,
)
from research_os.services.citation_service import (
    CitationRecordNotFoundError,
    autofill_claim_citations,
    export_citation_references,
    export_reference_pack,
    get_claim_citation_state,
    list_citation_records,
    set_claim_citations,
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
    get_project_record,
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
    estimate_generation_cost,
    enqueue_generation_job,
    get_generation_job_record,
    list_generation_jobs_for_manuscript,
    retry_generation_job,
    serialize_generation_job,
)
from research_os.services.claim_linker_service import suggest_claim_links
from research_os.services.consistency_service import run_cross_section_consistency_check
from research_os.services.grounded_draft_service import (
    GroundedDraftGenerationError,
    generate_grounded_section_draft,
)
from research_os.services.insight_service import (
    SelectionInsightNotFoundError,
    get_selection_insight,
)
from research_os.services.paragraph_regeneration_service import (
    ParagraphRegenerationError,
    regenerate_paragraph_text,
    replace_paragraph,
    split_section_paragraphs,
)
from research_os.services.qc_service import run_qc_checks
from research_os.services.section_planning_service import build_section_plan
from research_os.services.data_planner_service import (
    DataAssetNotFoundError,
    PlannerValidationError,
    attach_assets_to_manuscript,
    create_analysis_scaffold,
    create_data_profile,
    create_figures_scaffold,
    create_tables_scaffold,
    improve_plan_section,
    list_library_assets,
    save_manuscript_plan,
    upload_library_assets,
)
from research_os.services.auth_service import (
    AuthConflictError,
    AuthNotFoundError,
    AuthValidationError,
    get_user_by_session_token,
    login_user,
    logout_session,
    register_user,
    update_current_user,
)
from research_os.services.orcid_service import (
    OrcidNotFoundError,
    OrcidValidationError,
    complete_orcid_callback,
    create_orcid_connect_url,
    import_orcid_works,
)
from research_os.services.persona_service import (
    PersonaNotFoundError,
    PersonaValidationError,
    dump_persona_state,
    generate_embeddings,
    get_persona_context,
    get_themes,
    list_collaborators,
    list_works,
    sync_metrics,
)
from research_os.services.impact_service import (
    ImpactNotFoundError,
    ImpactValidationError,
    analyse_impact,
    generate_impact_report,
    recompute_impact_snapshot,
)
from research_os.services.plan_clarification_service import (
    generate_next_plan_clarification_question,
    generate_plan_clarification_questions,
    revise_manuscript_plan_section,
)
from research_os.services.research_overview_suggestions_service import (
    generate_research_overview_suggestions,
)
from research_os.services.submission_pack_service import (
    SubmissionPackGenerationError,
    build_submission_pack,
)
from research_os.services.manuscript_service import (
    ManuscriptGenerationError,
    draft_methods_from_notes,
    draft_section_from_notes,
)
from research_os.services.title_abstract_service import (
    TitleAbstractSynthesisError,
    synthesize_title_and_abstract,
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

BAD_REQUEST_RESPONSES = {
    400: {"model": ErrorResponse},
}

UNAUTHORIZED_RESPONSES = {
    401: {"model": ErrorResponse},
}

@asynccontextmanager
async def app_lifespan(_: FastAPI):
    # In local development, allow API startup even if OPENAI_API_KEY is not set so
    # non-LLM endpoints remain available. Set STRICT_OPENAI_STARTUP=1 to enforce fail-fast.
    strict_startup = os.getenv("STRICT_OPENAI_STARTUP", "0").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    try:
        get_openai_api_key()
    except Exception as exc:
        if strict_startup:
            raise
        logger.warning("openai_api_key_missing_at_startup", extra={"detail": str(exc)})
    yield


app = FastAPI(title="Research OS API", version="0.1.0", lifespan=app_lifespan)

default_allow_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "https://research-os-ui.onrender.com",
]
configured_allow_origins = os.getenv("CORS_ALLOW_ORIGINS", "")
allow_origins = list(default_allow_origins)
for origin in configured_allow_origins.split(","):
    value = origin.strip()
    if not value or value in allow_origins:
        continue
    allow_origins.append(value)
allow_origin_regex = os.getenv(
    "CORS_ALLOW_ORIGIN_REGEX",
    r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://[a-z0-9\-]+\.onrender\.com$",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
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
    if isinstance(
        exc,
        (
            ManuscriptGenerationError,
            GroundedDraftGenerationError,
            TitleAbstractSynthesisError,
            ParagraphRegenerationError,
            SubmissionPackGenerationError,
        ),
    ):
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


def _build_bad_request_response(detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "message": "Bad request",
                "type": "bad_request",
                "detail": detail,
            }
        },
    )


def _build_unauthorized_response(detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={
            "error": {
                "message": "Unauthorized",
                "type": "unauthorized",
                "detail": detail,
            }
        },
    )


def _extract_session_token(request: Request) -> str:
    auth_header = str(request.headers.get("Authorization", "")).strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    cookie_token = str(request.cookies.get("aawe_session", "")).strip()
    return cookie_token


def _session_response(payload: dict[str, object]) -> JSONResponse:
    response = JSONResponse(content=AuthSessionResponse(**payload).model_dump(mode="json"))
    session_token = str(payload.get("session_token", "")).strip()
    if session_token:
        response.set_cookie(
            key="aawe_session",
            value=session_token,
            httponly=True,
            secure=False,
            samesite="lax",
            max_age=60 * 60 * 24 * 30,
            path="/",
        )
    return response


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


@app.post(
    "/v1/auth/register",
    response_model=AuthSessionResponse,
    responses=BAD_REQUEST_RESPONSES | CONFLICT_RESPONSES,
    tags=["v1"],
)
def v1_auth_register(request: AuthRegisterRequest) -> AuthSessionResponse | JSONResponse:
    try:
        payload = register_user(
            email=request.email,
            password=request.password,
            name=request.name,
        )
        return _session_response(payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))
    except AuthConflictError as exc:
        return _build_conflict_response(str(exc))


@app.post(
    "/v1/auth/login",
    response_model=AuthSessionResponse,
    responses=BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_login(request: AuthLoginRequest) -> AuthSessionResponse | JSONResponse:
    try:
        payload = login_user(email=request.email, password=request.password)
        return _session_response(payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/auth/logout",
    response_model=AuthLogoutResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_auth_logout(request: Request) -> AuthLogoutResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_bad_request_response("Session token is required.")
    try:
        payload = logout_session(token)
        response = JSONResponse(content=AuthLogoutResponse(**payload).model_dump())
        response.delete_cookie(key="aawe_session", path="/")
        return response
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))
    except AuthNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.get(
    "/v1/auth/me",
    response_model=AuthUserResponse,
    responses=UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_auth_me(request: Request) -> AuthUserResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        payload = get_user_by_session_token(token)
        return AuthUserResponse(**payload)
    except (AuthValidationError, AuthNotFoundError) as exc:
        return _build_unauthorized_response(str(exc))


@app.patch(
    "/v1/auth/me",
    response_model=AuthUserResponse,
    responses=BAD_REQUEST_RESPONSES | CONFLICT_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_auth_update_me(
    request: Request,
    payload: AuthMeUpdateRequest,
) -> AuthUserResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user_payload = update_current_user(
            session_token=token,
            name=payload.name,
            email=payload.email,
            password=payload.password,
        )
        return AuthUserResponse(**user_payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))
    except AuthConflictError as exc:
        return _build_conflict_response(str(exc))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))


@app.get(
    "/v1/orcid/connect",
    response_model=OrcidConnectResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_orcid_connect(request: Request) -> OrcidConnectResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = create_orcid_connect_url(user_id=str(user["id"]))
        return OrcidConnectResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except OrcidNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except (OrcidValidationError, AuthValidationError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/orcid/callback",
    response_model=OrcidCallbackResponse,
    responses=BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_orcid_callback(
    state: str = Query(default=""),
    code: str = Query(default=""),
) -> OrcidCallbackResponse | JSONResponse:
    try:
        payload = complete_orcid_callback(state=state, code=code)
        return OrcidCallbackResponse(**payload)
    except OrcidValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/persona/import/orcid",
    response_model=PersonaImportOrcidResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_persona_import_orcid(
    request: Request,
    payload: PersonaImportOrcidRequest,
) -> PersonaImportOrcidResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        imported = import_orcid_works(
            user_id=str(user["id"]),
            overwrite_user_metadata=payload.overwrite_user_metadata,
        )
        return PersonaImportOrcidResponse(**imported)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except OrcidNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except OrcidValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/persona/works",
    response_model=list[PersonaWorkResponse],
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_persona_list_works(request: Request) -> list[PersonaWorkResponse] | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = list_works(user_id=str(user["id"]))
        return [PersonaWorkResponse(**item) for item in payload]
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PersonaNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/persona/metrics/sync",
    response_model=PersonaMetricsSyncResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_persona_metrics_sync(
    request: Request,
    payload: PersonaMetricsSyncRequest,
) -> PersonaMetricsSyncResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        data = sync_metrics(user_id=str(user["id"]), providers=payload.providers)
        return PersonaMetricsSyncResponse(**data)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PersonaNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except (PersonaValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/persona/embeddings/generate",
    response_model=PersonaEmbeddingsGenerateResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_persona_embeddings_generate(
    request: Request,
    payload: PersonaEmbeddingsGenerateRequest,
) -> PersonaEmbeddingsGenerateResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        data = generate_embeddings(
            user_id=str(user["id"]),
            model_name=payload.model_name or "text-embedding-3-small",
        )
        return PersonaEmbeddingsGenerateResponse(**data)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PersonaNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PersonaValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/impact/collaborators",
    response_model=ImpactCollaboratorsResponse,
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_impact_collaborators(
    request: Request,
) -> ImpactCollaboratorsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = list_collaborators(user_id=str(user["id"]))
        return ImpactCollaboratorsResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PersonaNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.get(
    "/v1/impact/themes",
    response_model=ImpactThemesResponse,
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_impact_themes(request: Request) -> ImpactThemesResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_themes(user_id=str(user["id"]))
        return ImpactThemesResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PersonaNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/impact/recompute",
    response_model=ImpactRecomputeResponse,
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_impact_recompute(request: Request) -> ImpactRecomputeResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = recompute_impact_snapshot(user_id=str(user["id"]))
        return ImpactRecomputeResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (ImpactNotFoundError, PersonaNotFoundError) as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/impact/analyse",
    response_model=ImpactAnalyseResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_impact_analyse(
    request: Request,
    payload: ImpactAnalyseRequest,
) -> ImpactAnalyseResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        output = analyse_impact(
            user_id=str(user["id"]),
            impact_snapshot=payload.impact_snapshot,
            collaborator_data=payload.collaborator_data,
            theme_data=payload.theme_data,
            publication_timeline=payload.publication_timeline,
            venue_distribution=payload.venue_distribution,
        )
        return ImpactAnalyseResponse(**output)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (ImpactNotFoundError, PersonaNotFoundError) as exc:
        return _build_not_found_response(str(exc))
    except ImpactValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/impact/report",
    response_model=ImpactReportResponse,
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_impact_report(request: Request) -> ImpactReportResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = generate_impact_report(user_id=str(user["id"]))
        return ImpactReportResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (ImpactNotFoundError, PersonaNotFoundError) as exc:
        return _build_not_found_response(str(exc))


@app.get(
    "/v1/persona/context",
    response_model=PersonaContextResponse,
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_persona_context(request: Request) -> PersonaContextResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_persona_context(user_id=str(user["id"]))
        return PersonaContextResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PersonaNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.get(
    "/v1/persona/state",
    response_model=dict[str, object],
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_persona_state(request: Request) -> dict[str, object] | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        return dump_persona_state(user_id=str(user["id"]))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PersonaNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.get("/v1/journals", response_model=list[JournalOptionResponse], tags=["v1"])
def v1_list_journal_presets() -> list[JournalOptionResponse]:
    return [JournalOptionResponse(**preset) for preset in JOURNAL_PRESETS]


@app.post(
    "/v1/library/assets/upload",
    response_model=LibraryAssetUploadResponse,
    responses=BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
async def v1_upload_library_assets(
    request: Request,
    project_id: str | None = Query(default=None),
) -> LibraryAssetUploadResponse | JSONResponse:
    try:
        project_id_value = project_id
        file_payloads: list[tuple[str, str | None, bytes]] = []
        content_type = request.headers.get("content-type", "").lower()

        if "application/json" in content_type:
            payload = await request.json()
            if not isinstance(payload, dict):
                return _build_bad_request_response("JSON payload must be an object.")

            payload_project_id = str(payload.get("project_id", "")).strip()
            if payload_project_id:
                project_id_value = payload_project_id

            raw_files = payload.get("files", [])
            if not isinstance(raw_files, list):
                return _build_bad_request_response("JSON payload field 'files' must be a list.")

            for item in raw_files:
                if not isinstance(item, dict):
                    continue
                filename = str(item.get("filename", "")).strip() or "asset.bin"
                mime_type_raw = str(item.get("mime_type", "")).strip()
                mime_type = mime_type_raw or None
                encoded = str(item.get("content_base64", "")).strip()
                if not encoded:
                    continue
                try:
                    content = base64.b64decode(encoded, validate=False)
                except Exception:
                    continue
                file_payloads.append((filename, mime_type, content))
        else:
            try:
                form = await request.form()
            except (RuntimeError, AssertionError):
                return _build_bad_request_response(
                    (
                        "Multipart parsing is unavailable in this deployment. "
                        "Install python-multipart or send JSON fallback payload."
                    )
                )

            form_project_id = str(form.get("project_id", "")).strip()
            if form_project_id:
                project_id_value = form_project_id

            files = form.getlist("files")
            for file in files:
                if not hasattr(file, "read"):
                    continue
                filename = (getattr(file, "filename", "") or "").strip() or "asset.bin"
                file_content_type = getattr(file, "content_type", None)
                content = await file.read()
                file_payloads.append((filename, file_content_type, content))

        if not file_payloads:
            return _build_bad_request_response("No valid file payloads were provided.")

        asset_ids = upload_library_assets(
            files=file_payloads,
            project_id=project_id_value,
        )
        return LibraryAssetUploadResponse(asset_ids=asset_ids)
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/library/assets",
    response_model=list[LibraryAssetResponse],
    tags=["v1"],
)
def v1_list_library_assets(
    project_id: str | None = Query(default=None),
) -> list[LibraryAssetResponse]:
    payload = list_library_assets(project_id=project_id)
    return [LibraryAssetResponse(**item) for item in payload]


@app.post(
    "/v1/manuscripts/{manuscript_id}/attach-assets",
    response_model=ManuscriptAttachAssetsResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_attach_assets_to_manuscript(
    manuscript_id: str,
    request: ManuscriptAttachAssetsRequest,
) -> ManuscriptAttachAssetsResponse | JSONResponse:
    try:
        attached = attach_assets_to_manuscript(
            manuscript_id=manuscript_id,
            asset_ids=request.asset_ids,
            section_context=request.section_context,
        )
        return ManuscriptAttachAssetsResponse(
            manuscript_id=manuscript_id,
            attached_asset_ids=attached,
            section_context=request.section_context,
        )
    except DataAssetNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/data/profile",
    response_model=DataProfileResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_create_data_profile(
    request: DataProfileRequest,
) -> DataProfileResponse | JSONResponse:
    try:
        payload = create_data_profile(
            asset_ids=request.asset_ids,
            sampling=request.sampling.model_dump(),
        )
        return DataProfileResponse(**payload)
    except DataAssetNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/scaffold/analysis-plan",
    response_model=AnalysisScaffoldResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_create_analysis_scaffold(
    request: AnalysisScaffoldRequest,
) -> AnalysisScaffoldResponse | JSONResponse:
    try:
        payload = create_analysis_scaffold(
            manuscript_id=request.manuscript_id,
            profile_id=request.profile_id,
            confirmed_fields=request.confirmed_fields.model_dump(),
        )
        return AnalysisScaffoldResponse(**payload)
    except DataAssetNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/scaffold/tables",
    response_model=TablesScaffoldResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_create_tables_scaffold(
    request: TablesScaffoldRequest,
) -> TablesScaffoldResponse | JSONResponse:
    try:
        payload = create_tables_scaffold(
            manuscript_id=request.manuscript_id,
            profile_id=request.profile_id,
            confirmed_fields=request.confirmed_fields.model_dump(),
        )
        return TablesScaffoldResponse(**payload)
    except DataAssetNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/scaffold/figures",
    response_model=FiguresScaffoldResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_create_figures_scaffold(
    request: FiguresScaffoldRequest,
) -> FiguresScaffoldResponse | JSONResponse:
    try:
        payload = create_figures_scaffold(
            manuscript_id=request.manuscript_id,
            profile_id=request.profile_id,
            confirmed_fields=request.confirmed_fields.model_dump(),
        )
        return FiguresScaffoldResponse(**payload)
    except DataAssetNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.put(
    "/v1/manuscripts/{manuscript_id}/plan",
    response_model=ManuscriptPlanUpdateResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_save_manuscript_plan(
    manuscript_id: str,
    request: ManuscriptPlanUpdateRequest,
) -> ManuscriptPlanUpdateResponse | JSONResponse:
    try:
        payload = save_manuscript_plan(
            manuscript_id=manuscript_id,
            plan_json=request.plan_json,
        )
        return ManuscriptPlanUpdateResponse(**payload)
    except DataAssetNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/manuscripts/{manuscript_id}/plan/section-improve",
    response_model=PlanSectionImproveResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_improve_manuscript_plan_section(
    manuscript_id: str,
    request: PlanSectionImproveRequest,
) -> PlanSectionImproveResponse | JSONResponse:
    try:
        payload = improve_plan_section(
            manuscript_id=manuscript_id,
            section_key=request.section_key,
            current_text=request.current_text,
            context=request.context.model_dump(),
            tool=request.tool,
        )
        return PlanSectionImproveResponse(**payload)
    except DataAssetNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


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


@app.post(
    "/v1/aawe/generation/estimate",
    response_model=GenerationEstimateResponse,
    tags=["v1"],
)
def v1_estimate_aawe_generation(
    request: GenerationEstimateRequest,
) -> GenerationEstimateResponse:
    payload = estimate_generation_cost(
        sections=request.sections,
        notes_context=request.notes_context,
        model=request.model or "gpt-4.1-mini",
    )
    return GenerationEstimateResponse(**payload)


@app.post(
    "/v1/aawe/plan/sections",
    response_model=SectionPlanResponse,
    tags=["v1"],
)
def v1_plan_aawe_sections(
    request: SectionPlanRequest,
    http_request: Request,
) -> SectionPlanResponse:
    persona_context = None
    token = _extract_session_token(http_request)
    if token:
        try:
            user = get_user_by_session_token(token)
            persona_context = get_persona_context(user_id=str(user["id"]))
        except Exception:
            persona_context = None
    payload = build_section_plan(
        target_journal=request.target_journal,
        answers=request.answers,
        sections=request.sections,
        persona_context=persona_context,
    )
    return SectionPlanResponse(**payload)


@app.post(
    "/v1/aawe/plan/clarification-questions",
    response_model=PlanClarificationQuestionsResponse,
    tags=["v1"],
)
def v1_plan_aawe_clarification_questions(
    request: PlanClarificationQuestionsRequest,
) -> PlanClarificationQuestionsResponse:
    payload = generate_plan_clarification_questions(
        project_title=request.project_title,
        target_journal=request.target_journal,
        target_journal_label=request.target_journal_label,
        research_category=request.research_category,
        study_type=request.study_type,
        interpretation_mode=request.interpretation_mode,
        article_type=request.article_type,
        word_length=request.word_length,
        summary_of_research=request.summary_of_research,
        preferred_model=request.model or "gpt-5.2",
    )
    return PlanClarificationQuestionsResponse(**payload)


@app.post(
    "/v1/aawe/plan/clarification-question/next",
    response_model=PlanClarificationNextQuestionResponse,
    tags=["v1"],
)
def v1_plan_aawe_next_clarification_question(
    request: PlanClarificationNextQuestionRequest,
) -> PlanClarificationNextQuestionResponse:
    payload = generate_next_plan_clarification_question(
        project_title=request.project_title,
        target_journal=request.target_journal,
        target_journal_label=request.target_journal_label,
        research_category=request.research_category,
        study_type=request.study_type,
        interpretation_mode=request.interpretation_mode,
        article_type=request.article_type,
        word_length=request.word_length,
        summary_of_research=request.summary_of_research,
        study_type_options=request.study_type_options,
        data_profile_json=request.data_profile_json,
        profile_unresolved_questions=request.profile_unresolved_questions,
        use_profile_tailoring=request.use_profile_tailoring,
        history=[item.model_dump() for item in request.history],
        max_questions=request.max_questions,
        force_next_question=request.force_next_question,
        preferred_model=request.model or "gpt-5.2",
    )
    return PlanClarificationNextQuestionResponse(**payload)


@app.post(
    "/v1/aawe/plan/manuscript-section/edit",
    response_model=PlanSectionEditResponse,
    responses=BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_plan_aawe_edit_manuscript_section(
    request: PlanSectionEditRequest,
) -> PlanSectionEditResponse | JSONResponse:
    try:
        payload = revise_manuscript_plan_section(
            section=request.section,
            section_text=request.section_text,
            edit_instruction=request.edit_instruction,
            selected_text=request.selected_text,
            project_title=request.project_title,
            target_journal_label=request.target_journal_label,
            research_category=request.research_category,
            study_type=request.study_type,
            interpretation_mode=request.interpretation_mode,
            article_type=request.article_type,
            word_length=request.word_length,
            summary_of_research=request.summary_of_research,
            preferred_model=request.model or "gpt-5.2",
        )
    except ValueError as exc:
        return _build_bad_request_response(str(exc))
    return PlanSectionEditResponse(**payload)


@app.post(
    "/v1/aawe/research-overview/suggestions",
    response_model=ResearchOverviewSuggestionsResponse,
    tags=["v1"],
)
def v1_research_overview_suggestions(
    request: ResearchOverviewSuggestionsRequest,
) -> ResearchOverviewSuggestionsResponse:
    study_type_options = getattr(request, "study_type_options", None) or []
    payload = generate_research_overview_suggestions(
        target_journal=request.target_journal,
        research_category=request.research_category,
        research_type=request.research_type,
        study_type_options=study_type_options,
        article_type=request.article_type,
        interpretation_mode=request.interpretation_mode,
        summary_of_research=request.summary_of_research,
        preferred_model=request.model or "gpt-5.2",
    )
    return ResearchOverviewSuggestionsResponse(**payload)


@app.post(
    "/v1/aawe/draft/grounded",
    response_model=GroundedDraftResponse,
    responses=ERROR_RESPONSES | NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_generate_aawe_grounded_draft(
    request: GroundedDraftRequest,
) -> GroundedDraftResponse | JSONResponse:
    if request.generation_mode == "targeted" and not (
        request.target_instruction or ""
    ).strip():
        return _build_bad_request_response(
            "target_instruction is required when generation_mode is 'targeted'."
        )

    payload = generate_grounded_section_draft(
        section=request.section,
        notes_context=request.notes_context,
        style_profile=request.style_profile,
        generation_mode=request.generation_mode,
        plan_objective=request.plan_objective,
        must_include=request.must_include,
        evidence_links=[link.model_dump() for link in request.evidence_links],
        citation_ids=request.citation_ids,
        target_instruction=request.target_instruction,
        locked_text=request.locked_text,
        model=request.model or "gpt-4.1-mini",
    )

    persisted = False
    manuscript_payload: ManuscriptResponse | None = None
    if request.persist_to_manuscript:
        project_id = (request.project_id or "").strip()
        manuscript_id = (request.manuscript_id or "").strip()
        if not project_id or not manuscript_id:
            return _build_bad_request_response(
                (
                    "project_id and manuscript_id are required when "
                    "persist_to_manuscript is true."
                )
            )
        try:
            manuscript = update_project_manuscript_sections(
                project_id=project_id,
                manuscript_id=manuscript_id,
                sections={payload["section"]: payload["draft"]},
            )
        except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
            return _build_not_found_response(str(exc))
        persisted = True
        manuscript_payload = ManuscriptResponse.model_validate(manuscript)

    response_payload = dict(payload)
    response_payload["persisted"] = persisted
    response_payload["manuscript"] = manuscript_payload
    return GroundedDraftResponse(**response_payload)


@app.post(
    "/v1/aawe/projects/{project_id}/manuscripts/{manuscript_id}/synthesize/title-abstract",
    response_model=TitleAbstractSynthesisResponse,
    responses=ERROR_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_synthesize_title_abstract(
    project_id: str,
    manuscript_id: str,
    request: TitleAbstractSynthesisRequest,
) -> TitleAbstractSynthesisResponse | JSONResponse:
    try:
        manuscript = get_project_manuscript(project_id, manuscript_id)
    except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
        return _build_not_found_response(str(exc))

    payload = synthesize_title_and_abstract(
        sections=dict(manuscript.sections or {}),
        style_profile=request.style_profile,
        max_abstract_words=max(80, min(request.max_abstract_words, 450)),
        model=request.model or "gpt-4.1-mini",
    )

    persisted = False
    manuscript_payload: ManuscriptResponse | None = None
    if request.persist_to_manuscript:
        updated_manuscript = update_project_manuscript_sections(
            project_id=project_id,
            manuscript_id=manuscript_id,
            sections={
                "title": payload["title"],
                "abstract": payload["abstract"],
            },
        )
        persisted = True
        manuscript_payload = ManuscriptResponse.model_validate(updated_manuscript)

    return TitleAbstractSynthesisResponse(
        title=payload["title"],
        abstract=payload["abstract"],
        style_profile=request.style_profile,
        persisted=persisted,
        manuscript=manuscript_payload,
    )


@app.post(
    "/v1/aawe/projects/{project_id}/manuscripts/{manuscript_id}/consistency/check",
    response_model=ConsistencyCheckResponse,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_run_cross_section_consistency_check(
    project_id: str,
    manuscript_id: str,
    request: ConsistencyCheckRequest,
) -> ConsistencyCheckResponse | JSONResponse:
    try:
        manuscript = get_project_manuscript(project_id, manuscript_id)
    except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
        return _build_not_found_response(str(exc))

    payload = run_cross_section_consistency_check(dict(manuscript.sections or {}))
    if not request.include_low_severity:
        filtered = [
            issue for issue in payload["issues"] if issue.get("severity") != "low"
        ]
        payload["issues"] = filtered
        payload["total_issues"] = len(filtered)
        payload["high_severity_count"] = sum(
            1 for issue in filtered if issue.get("severity") == "high"
        )
        payload["medium_severity_count"] = sum(
            1 for issue in filtered if issue.get("severity") == "medium"
        )
        payload["low_severity_count"] = sum(
            1 for issue in filtered if issue.get("severity") == "low"
        )
    return ConsistencyCheckResponse(**payload)


@app.post(
    "/v1/aawe/projects/{project_id}/manuscripts/{manuscript_id}/sections/{section}/paragraphs/regenerate",
    response_model=ParagraphRegenerationResponse,
    responses=ERROR_RESPONSES | NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_regenerate_section_paragraph(
    project_id: str,
    manuscript_id: str,
    section: str,
    request: ParagraphRegenerationRequest,
) -> ParagraphRegenerationResponse | JSONResponse:
    try:
        manuscript = get_project_manuscript(project_id, manuscript_id)
    except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
        return _build_not_found_response(str(exc))

    section_key = section.strip().lower()
    sections = dict(manuscript.sections or {})
    section_text = str(sections.get(section_key, "")).strip()
    if not section_text:
        return _build_bad_request_response(
            f"Section '{section_key}' is empty or missing in manuscript."
        )

    paragraphs = split_section_paragraphs(section_text)
    if not paragraphs:
        return _build_bad_request_response(
            f"Section '{section_key}' has no paragraphs to regenerate."
        )
    if request.paragraph_index < 0 or request.paragraph_index >= len(paragraphs):
        return _build_bad_request_response(
            (
                f"paragraph_index {request.paragraph_index} is out of range "
                f"(0-{len(paragraphs) - 1})."
            )
        )

    original_paragraph = paragraphs[request.paragraph_index]
    regen_payload = regenerate_paragraph_text(
        section=section_key,
        paragraph_text=original_paragraph,
        notes_context=request.notes_context,
        constraints=request.constraints,
        evidence_links=[link.model_dump() for link in request.evidence_links],
        citation_ids=request.citation_ids,
        freeform_instruction=request.freeform_instruction,
        model=request.model or "gpt-4.1-mini",
    )
    _, updated_section_text = replace_paragraph(
        section_text,
        request.paragraph_index,
        str(regen_payload["revised_paragraph"]),
    )

    persisted = False
    manuscript_payload: ManuscriptResponse | None = None
    if request.persist_to_manuscript:
        updated_manuscript = update_project_manuscript_sections(
            project_id=project_id,
            manuscript_id=manuscript_id,
            sections={section_key: updated_section_text},
        )
        persisted = True
        manuscript_payload = ManuscriptResponse.model_validate(updated_manuscript)

    return ParagraphRegenerationResponse(
        section=section_key,
        paragraph_index=request.paragraph_index,
        constraints=regen_payload["constraints"],
        original_paragraph=original_paragraph,
        regenerated_paragraph=regen_payload["revised_paragraph"],
        updated_section_text=updated_section_text,
        unsupported_sentences=regen_payload["unsupported_sentences"],
        persisted=persisted,
        manuscript=manuscript_payload,
    )


@app.post(
    "/v1/aawe/projects/{project_id}/manuscripts/{manuscript_id}/submission-pack",
    response_model=SubmissionPackResponse,
    responses=ERROR_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_generate_submission_pack(
    project_id: str,
    manuscript_id: str,
    request: SubmissionPackRequest,
) -> SubmissionPackResponse | JSONResponse:
    try:
        project = get_project_record(project_id)
        manuscript = get_project_manuscript(project_id, manuscript_id)
    except (ProjectNotFoundError, ManuscriptNotFoundError) as exc:
        return _build_not_found_response(str(exc))

    payload = build_submission_pack(
        sections=dict(manuscript.sections or {}),
        target_journal=project.target_journal,
        style_profile=request.style_profile,
        include_plain_language_summary=request.include_plain_language_summary,
        model=request.model or "gpt-4.1-mini",
    )
    return SubmissionPackResponse(**payload)


@app.post(
    "/v1/aawe/linker/claims",
    response_model=ClaimLinkerResponse,
    tags=["v1"],
)
def v1_link_aawe_claims(request: ClaimLinkerRequest) -> ClaimLinkerResponse:
    payload = suggest_claim_links(
        claim_ids=request.claim_ids,
        min_confidence=request.min_confidence,
    )
    return ClaimLinkerResponse(**payload)


@app.get("/v1/aawe/citations", response_model=list[CitationRecordResponse], tags=["v1"])
def v1_list_aawe_citations(
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[CitationRecordResponse]:
    records = list_citation_records(query=q, limit=limit)
    return [CitationRecordResponse(**record) for record in records]


@app.get(
    "/v1/aawe/claims/{claim_id}/citations",
    response_model=ClaimCitationStateResponse,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_get_aawe_claim_citations(
    claim_id: str,
    required_slots: int = Query(default=0, ge=0, le=20),
) -> ClaimCitationStateResponse | JSONResponse:
    try:
        payload = get_claim_citation_state(claim_id, required_slots=required_slots)
        return ClaimCitationStateResponse(**payload)
    except CitationRecordNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.put(
    "/v1/aawe/claims/{claim_id}/citations",
    response_model=ClaimCitationStateResponse,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_set_aawe_claim_citations(
    claim_id: str,
    request: ClaimCitationUpdateRequest,
) -> ClaimCitationStateResponse | JSONResponse:
    try:
        payload = set_claim_citations(
            claim_id,
            request.citation_ids,
            required_slots=request.required_slots,
        )
        return ClaimCitationStateResponse(**payload)
    except CitationRecordNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/aawe/citations/autofill",
    response_model=CitationAutofillResponse,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_autofill_aawe_citations(
    request: CitationAutofillRequest,
) -> CitationAutofillResponse | JSONResponse:
    try:
        payload = autofill_claim_citations(
            claim_ids=request.claim_ids,
            required_slots=request.required_slots,
            overwrite_existing=request.overwrite_existing,
        )
        return CitationAutofillResponse(**payload)
    except CitationRecordNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/aawe/citations/export",
    response_model=None,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_export_aawe_citations(
    request: CitationExportRequest,
) -> PlainTextResponse | JSONResponse:
    try:
        filename, body = export_citation_references(
            citation_ids=request.citation_ids,
            claim_id=request.claim_id,
        )
        return PlainTextResponse(
            content=body,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except CitationRecordNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/aawe/references/pack",
    response_model=None,
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_export_aawe_reference_pack(
    request: ReferencePackRequest,
) -> PlainTextResponse | JSONResponse:
    try:
        filename, body = export_reference_pack(
            style=request.style,
            claim_ids=request.claim_ids,
            citation_ids=request.citation_ids,
            include_urls=request.include_urls,
        )
        return PlainTextResponse(
            content=body,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except CitationRecordNotFoundError as exc:
        return _build_not_found_response(str(exc))


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
    "/v1/aawe/projects/{project_id}/manuscripts/{manuscript_id}/export/markdown",
    response_model=None,
    responses=NOT_FOUND_RESPONSES | CONFLICT_RESPONSES,
    tags=["v1"],
)
def v1_qc_gated_export_manuscript_markdown(
    project_id: str,
    manuscript_id: str,
    request: QCGatedExportRequest,
) -> PlainTextResponse | JSONResponse:
    qc_payload = run_qc_checks()
    high_severity_count = int(qc_payload.get("high_severity_count", 0))
    if high_severity_count > 0:
        return _build_conflict_response(
            (
                "QC gate blocked export: "
                f"{high_severity_count} high-severity issue(s) remain. "
                "Resolve high-severity findings before export."
            )
        )

    try:
        filename, markdown = export_project_manuscript_markdown(
            project_id=project_id,
            manuscript_id=manuscript_id,
            include_empty_sections=request.include_empty,
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

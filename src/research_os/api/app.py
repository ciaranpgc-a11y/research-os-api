import base64
import asyncio
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from threading import Lock
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import FastAPI
from fastapi import Query
from fastapi import Request
from fastapi import WebSocket
from fastapi import WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import PlainTextResponse
from fastapi.responses import RedirectResponse
from fastapi.responses import Response
from sqlalchemy import text

from research_os.config import get_openai_api_key
from research_os.db import session_scope
from research_os.api.schemas import (
    AnalysisScaffoldRequest,
    AnalysisScaffoldResponse,
    AffiliationAddressResolutionResponse,
    AffiliationSuggestionItemResponse,
    AffiliationSuggestionsResponse,
    AuthLoginRequest,
    AuthLoginChallengeRequest,
    AuthLoginChallengeResponse,
    AuthLoginVerifyTwoFactorRequest,
    AuthDeleteAccountRequest,
    AuthDeleteAccountResponse,
    AuthLogoutResponse,
    AuthMeUpdateRequest,
    AuthEmailVerificationConfirmRequest,
    AuthEmailVerificationRequestResponse,
    AuthOAuthCallbackRequest,
    AuthOAuthCallbackResponse,
    AuthOAuthConnectResponse,
    AuthOAuthProviderStatusesResponse,
    AuthPasswordResetConfirmRequest,
    AuthPasswordResetConfirmResponse,
    AuthPasswordResetRequestRequest,
    AuthPasswordResetRequestResponse,
    AuthRegisterRequest,
    AuthSessionResponse,
    AuthTwoFactorDisableRequest,
    AuthTwoFactorEnableRequest,
    AuthTwoFactorSetupResponse,
    AuthTwoFactorStateResponse,
    AuthUserResponse,
    ClaimLinkerRequest,
    ClaimLinkerResponse,
    CitationAutofillRequest,
    CitationAutofillResponse,
    CitationExportRequest,
    CitationRecordResponse,
    CollaboratorCreateRequest,
    CollaboratorDeleteResponse,
    CollaboratorResponse,
    CollaboratorsListResponse,
    CollaboratorUpdateRequest,
    CollaborationAiAffiliationsNormaliseRequest,
    CollaborationAiAffiliationsNormaliseResponse,
    CollaborationAiAuthorSuggestionsRequest,
    CollaborationAiAuthorSuggestionsResponse,
    CollaborationAiContributionDraftRequest,
    CollaborationAiContributionDraftResponse,
    CollaborationAiInsightsResponse,
    CollaborationEnrichOpenAlexRequest,
    CollaborationEnrichOpenAlexResponse,
    CollaborationImportOpenAlexResponse,
    CollaborationMetricsRecomputeResponse,
    CollaborationMetricsSummaryResponse,
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
    LibraryAssetAccessUpdateRequest,
    LibraryAssetListResponse,
    LibraryAssetResponse,
    LibraryAssetUploadResponse,
    ManuscriptAttachAssetsRequest,
    ManuscriptAttachAssetsResponse,
    QCRunResponse,
    ResearchOverviewSuggestionsRequest,
    ResearchOverviewSuggestionsResponse,
    SelectionInsightResponse,
    ManuscriptCreateRequest,
    ManuscriptAuthorSuggestionsResponse,
    ManuscriptAuthorsResponse,
    ManuscriptAuthorsSaveRequest,
    WorkspaceActiveUpdateRequest,
    WorkspaceActiveUpdateResponse,
    WorkspaceAuthorRequestAcceptRequest,
    WorkspaceAuthorRequestAcceptResponse,
    WorkspaceAuthorRequestDeclineResponse,
    WorkspaceAuthorRequestsResponse,
    WorkspaceCreateRequest,
    WorkspaceDeleteResponse,
    WorkspaceInboxMessageCreateRequest,
    WorkspaceInboxMessageResponse,
    WorkspaceInboxMessagesResponse,
    WorkspaceInboxReadMarkRequest,
    WorkspaceInboxReadMarkResponse,
    WorkspaceInboxReadsResponse,
    WorkspaceInboxStateResponse,
    WorkspaceInboxStateUpdateRequest,
    WorkspaceInvitationCreateRequest,
    WorkspaceInvitationSentResponse,
    WorkspaceInvitationsSentResponse,
    WorkspaceInvitationStatusUpdateRequest,
    WorkspaceRunContextResponse,
    WorkspaceListResponse,
    WorkspaceRecordResponse,
    WorkspaceStateResponse,
    WorkspaceStateUpdateRequest,
    WorkspaceUpdateRequest,
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
    PersonaSyncJobMetricsRequest,
    PersonaSyncJobOrcidImportRequest,
    PersonaSyncJobResponse,
    PersonaOpenAccessDiscoverRequest,
    PersonaOpenAccessDiscoverResponse,
    PublicationAiInsightsResponse,
    PublicationAuthorsResponse,
    PublicationDetailResponse,
    PublicationMetricDetailResponse,
    PublicationFileDeleteResponse,
    PublicationFileLinkResponse,
    PublicationFileResponse,
    PublicationFilesListResponse,
    PublicationImpactResponse,
    PublicationsTopMetricsRefreshResponse,
    PublicationsTopMetricsResponse,
    PublicationsAnalyticsResponse,
    PublicationsAnalyticsSummaryResponse,
    PublicationsAnalyticsTimeseriesResponse,
    PublicationsAnalyticsTopDriversResponse,
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
    OrcidStatusResponse,
    WizardBootstrapRequest,
    WizardBootstrapResponse,
    WizardInferRequest,
    WizardInferResponse,
)
from research_os.services.affiliation_suggestion_service import (
    AffiliationSuggestionValidationError,
    fetch_affiliation_suggestions,
    resolve_affiliation_address,
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
    get_workspace_run_context,
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
    download_library_asset,
    improve_plan_section,
    list_library_assets,
    save_manuscript_plan,
    update_library_asset_access,
    upload_library_assets,
)
from research_os.services.auth_service import (
    AuthConflictError,
    AuthNotFoundError,
    AuthValidationError,
    ensure_bootstrap_user,
    get_user_by_session_token,
    get_two_factor_state,
    login_user,
    logout_session,
    register_user,
    start_login_challenge,
    complete_login_challenge,
    create_two_factor_setup,
    disable_two_factor,
    enable_two_factor,
    confirm_email_verification,
    confirm_password_reset,
    request_email_verification,
    request_password_reset,
    delete_current_user,
    update_current_user,
)
from research_os.services.orcid_service import (
    disconnect_orcid,
    OrcidNotFoundError,
    OrcidValidationError,
    complete_orcid_callback,
    create_orcid_connect_url,
    get_orcid_status,
    import_orcid_works,
)
from research_os.services.social_auth_service import (
    complete_oauth_callback,
    create_oauth_connect_url,
    get_oauth_provider_statuses,
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
from research_os.services.persona_sync_job_service import (
    PersonaSyncJobConflictError,
    PersonaSyncJobNotFoundError,
    PersonaSyncJobValidationError,
    enqueue_persona_sync_job,
    get_persona_sync_job,
    list_persona_sync_jobs,
    serialize_persona_sync_job,
)
from research_os.services.open_access_service import (
    OpenAccessNotFoundError,
    OpenAccessValidationError,
    discover_open_access_for_persona,
)
from research_os.services.publications_analytics_service import (
    PublicationsAnalyticsNotFoundError,
    PublicationsAnalyticsValidationError,
    get_publications_analytics,
    get_publications_analytics_summary,
    get_publications_analytics_timeseries,
    get_publications_analytics_top_drivers,
    start_publications_analytics_scheduler,
    stop_publications_analytics_scheduler,
)
from research_os.services.publication_metrics_service import (
    PublicationMetricsNotFoundError,
    PublicationMetricsValidationError,
    get_publication_metric_detail,
    get_publication_top_metrics,
    trigger_publication_top_metrics_refresh,
)
from research_os.services.publication_console_service import (
    PublicationConsoleNotFoundError,
    PublicationConsoleValidationError,
    delete_publication_file,
    get_publication_ai_insights,
    get_publication_authors,
    get_publication_details,
    get_publication_file_download,
    get_publication_impact,
    link_publication_open_access_pdf,
    list_publication_files,
    upload_publication_file,
)
from research_os.services.collaboration_service import (
    CollaborationNotFoundError,
    CollaborationValidationError,
    create_collaborator_for_user,
    delete_collaborator_for_user,
    draft_contribution_statement,
    enrich_collaborators_from_openalex,
    export_collaborators_csv,
    generate_collaboration_ai_insights_draft,
    get_collaboration_metrics_summary,
    get_collaborator_for_user,
    get_manuscript_author_suggestions,
    get_manuscript_authors,
    import_collaborators_from_openalex,
    list_collaborators_for_user,
    normalize_affiliations_and_coi_draft,
    save_manuscript_authors,
    suggest_collaborators_for_manuscript_draft,
    start_collaboration_metrics_scheduler,
    stop_collaboration_metrics_scheduler,
    trigger_collaboration_metrics_recompute,
    update_collaborator_for_user,
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
from research_os.services.workspace_service import (
    WorkspaceNotFoundError,
    WorkspaceValidationError,
    accept_workspace_author_request,
    create_workspace_inbox_message,
    create_workspace_invitation,
    create_workspace_record,
    decline_workspace_author_request,
    delete_workspace_record,
    get_workspace_inbox_state,
    get_workspace_state,
    list_workspace_author_requests,
    list_workspace_inbox_messages,
    list_workspace_inbox_reads,
    list_workspace_invitations_sent,
    list_workspace_records,
    mark_workspace_inbox_read,
    has_workspace_access,
    save_workspace_inbox_state,
    save_workspace_state,
    set_active_workspace,
    update_workspace_invitation_status,
    update_workspace_record,
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

RATE_LIMIT_RESPONSES = {
    429: {"model": ErrorResponse},
}

AUTH_RATE_LIMIT_WINDOW_SECONDS = max(
    10, int(os.getenv("AUTH_RATE_LIMIT_WINDOW_SECONDS", "60"))
)
AUTH_LOGIN_RATE_LIMIT = max(5, int(os.getenv("AUTH_LOGIN_RATE_LIMIT", "15")))
AUTH_REGISTER_RATE_LIMIT = max(3, int(os.getenv("AUTH_REGISTER_RATE_LIMIT", "8")))
AUTH_PASSWORD_RESET_RATE_LIMIT = max(
    3, int(os.getenv("AUTH_PASSWORD_RESET_RATE_LIMIT", "8"))
)
AUTH_COOKIE_SECURE = os.getenv("AUTH_COOKIE_SECURE", "0").strip().lower() in {
    "1",
    "true",
    "yes",
}
AUTH_COOKIE_SAMESITE = os.getenv("AUTH_COOKIE_SAMESITE", "lax").strip().lower()
if AUTH_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    AUTH_COOKIE_SAMESITE = "lax"
_AUTH_RATE_LIMIT_EVENTS: dict[str, deque[float]] = defaultdict(deque)
_AUTH_RATE_LIMIT_LOCK = Lock()


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
    try:
        seed_result = ensure_bootstrap_user()
        if seed_result:
            logger.info(
                "bootstrap_user_ready",
                extra={
                    "email": seed_result["email"],
                    "created": seed_result["created"],
                    "updated": seed_result["updated"],
                    "role": seed_result["role"],
                },
            )
    except Exception as exc:
        logger.warning(
            "bootstrap_user_seed_failed",
            extra={"detail": str(exc)},
        )
    try:
        start_publications_analytics_scheduler()
    except Exception as exc:
        logger.warning(
            "publications_scheduler_start_failed",
            extra={"detail": str(exc)},
        )
    try:
        start_collaboration_metrics_scheduler()
    except Exception as exc:
        logger.warning(
            "collaboration_scheduler_start_failed",
            extra={"detail": str(exc)},
        )
    try:
        yield
    finally:
        try:
            stop_publications_analytics_scheduler()
        except Exception:
            pass
        try:
            stop_collaboration_metrics_scheduler()
        except Exception:
            pass


app = FastAPI(title="Research OS API", version="0.1.0", lifespan=app_lifespan)


class WorkspaceInboxRealtimeHub:
    def __init__(self) -> None:
        self._connections_by_workspace: dict[str, set[WebSocket]] = defaultdict(set)
        self._workspace_by_connection: dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()

    async def connect(self, *, workspace_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections_by_workspace[workspace_id].add(websocket)
            self._workspace_by_connection[websocket] = workspace_id

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            workspace_id = self._workspace_by_connection.pop(websocket, "")
            if not workspace_id:
                return
            connections = self._connections_by_workspace.get(workspace_id)
            if not connections:
                return
            connections.discard(websocket)
            if not connections:
                self._connections_by_workspace.pop(workspace_id, None)

    async def broadcast(
        self,
        *,
        workspace_id: str,
        payload: dict[str, Any],
        exclude: WebSocket | None = None,
    ) -> None:
        async with self._lock:
            targets = list(self._connections_by_workspace.get(workspace_id) or [])

        stale_targets: list[WebSocket] = []
        for target in targets:
            if exclude is not None and target is exclude:
                continue
            try:
                await target.send_json(payload)
            except Exception:
                stale_targets.append(target)

        for target in stale_targets:
            await self.disconnect(target)


_workspace_inbox_realtime_hub = WorkspaceInboxRealtimeHub()

default_allow_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5176",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:6006",
    "http://localhost:6007",
    "https://app.axiomos.studio",
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


def _is_local_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except Exception:
        return True
    host = (parsed.hostname or "").strip().lower()
    return host in {"localhost", "127.0.0.1"} or host.endswith(".local")


def _frontend_redirect_base() -> str:
    configured = os.getenv("FRONTEND_BASE_URL", "").strip().rstrip("/")
    if configured and not _is_local_url(configured):
        return configured
    for origin in allow_origins:
        candidate = str(origin).strip().rstrip("/")
        if not candidate:
            continue
        if _is_local_url(candidate):
            continue
        if candidate.startswith("https://"):
            return candidate
    return configured or "http://localhost:5173"


app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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


def _build_rate_limited_response(detail: str, retry_after: int) -> JSONResponse:
    response = JSONResponse(
        status_code=429,
        content={
            "error": {
                "message": "Too many requests",
                "type": "rate_limited",
                "detail": detail,
            }
        },
    )
    response.headers["Retry-After"] = str(max(1, retry_after))
    return response


def _client_ip(request: Request) -> str:
    forwarded = str(request.headers.get("x-forwarded-for", "")).strip()
    if forwarded:
        return forwarded.split(",", maxsplit=1)[0].strip()
    if request.client and request.client.host:
        return str(request.client.host).strip()
    return "unknown"


def _check_auth_rate_limit(
    *,
    key: str,
    limit: int,
    window_seconds: int,
) -> tuple[bool, int]:
    now = time.time()
    with _AUTH_RATE_LIMIT_LOCK:
        events = _AUTH_RATE_LIMIT_EVENTS[key]
        while events and (now - events[0]) >= window_seconds:
            events.popleft()
        if len(events) >= limit:
            retry_after = int(window_seconds - (now - events[0])) + 1
            return False, max(1, retry_after)
        events.append(now)
        return True, 0


def _extract_session_token(request: Request) -> str:
    auth_header = str(request.headers.get("Authorization", "")).strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    cookie_token = str(request.cookies.get("aawe_session", "")).strip()
    return cookie_token


def _normalize_optional_id(value: Any) -> str | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    if clean.lower() in {"none", "null", "undefined"}:
        return None
    return clean


def _resolve_request_user_optional(
    request: Request,
) -> tuple[str | None, JSONResponse | None]:
    token = _extract_session_token(request)
    if not token:
        return None, None
    try:
        user = get_user_by_session_token(token)
    except AuthNotFoundError as exc:
        return None, _build_unauthorized_response(str(exc))
    return str(user["id"]), None


def _resolve_request_user_required(
    request: Request,
) -> tuple[str | None, JSONResponse | None]:
    token = _extract_session_token(request)
    if not token:
        return None, _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
    except AuthNotFoundError as exc:
        return None, _build_unauthorized_response(str(exc))
    return str(user["id"]), None


def _extract_ws_session_token(websocket: WebSocket) -> str:
    query_token = str(websocket.query_params.get("token", "")).strip()
    if query_token:
        return query_token
    auth_header = str(websocket.headers.get("Authorization", "")).strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    cookie_token = str(websocket.cookies.get("aawe_session", "")).strip()
    return cookie_token


def _request_origin(request: Request) -> str:
    origin = str(request.headers.get("origin", "")).strip()
    if origin:
        return origin
    referer = str(request.headers.get("referer", "")).strip()
    if not referer:
        return ""
    try:
        parsed = urlparse(referer)
    except Exception:
        return ""
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def _session_response(payload: dict[str, object]) -> JSONResponse:
    response = JSONResponse(
        content=AuthSessionResponse(**payload).model_dump(mode="json")
    )
    session_token = str(payload.get("session_token", "")).strip()
    if session_token:
        response.set_cookie(
            key="aawe_session",
            value=session_token,
            httponly=True,
            secure=AUTH_COOKIE_SECURE,
            samesite=AUTH_COOKIE_SAMESITE,
            max_age=60 * 60 * 24 * 30,
            path="/",
        )
    return response


def _oauth_session_response(payload: dict[str, object]) -> JSONResponse:
    response = JSONResponse(
        content=AuthOAuthCallbackResponse(**payload).model_dump(mode="json")
    )
    session_token = str(payload.get("session_token", "")).strip()
    if session_token:
        response.set_cookie(
            key="aawe_session",
            value=session_token,
            httponly=True,
            secure=AUTH_COOKIE_SECURE,
            samesite=AUTH_COOKIE_SAMESITE,
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


@app.get("/v1/health/ready", response_model=dict[str, str], tags=["v1"])
def v1_readiness_check() -> dict[str, str] | JSONResponse:
    try:
        with session_scope() as session:
            session.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok"}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "database": "unavailable",
                "detail": "Database readiness check failed.",
            },
        )


@app.post(
    "/v1/auth/register",
    response_model=AuthSessionResponse,
    responses=BAD_REQUEST_RESPONSES | CONFLICT_RESPONSES | RATE_LIMIT_RESPONSES,
    tags=["v1"],
)
def v1_auth_register(
    http_request: Request,
    request: AuthRegisterRequest,
) -> AuthSessionResponse | JSONResponse:
    allowed, retry_after = _check_auth_rate_limit(
        key=f"auth-register:{_client_ip(http_request)}",
        limit=AUTH_REGISTER_RATE_LIMIT,
        window_seconds=AUTH_RATE_LIMIT_WINDOW_SECONDS,
    )
    if not allowed:
        return _build_rate_limited_response(
            "Too many registration attempts. Please retry shortly.",
            retry_after,
        )
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
    responses=BAD_REQUEST_RESPONSES | RATE_LIMIT_RESPONSES,
    tags=["v1"],
)
def v1_auth_login(
    http_request: Request,
    request: AuthLoginRequest,
) -> AuthSessionResponse | JSONResponse:
    login_key = f"auth-login:{_client_ip(http_request)}"
    allowed, retry_after = _check_auth_rate_limit(
        key=login_key,
        limit=AUTH_LOGIN_RATE_LIMIT,
        window_seconds=AUTH_RATE_LIMIT_WINDOW_SECONDS,
    )
    if not allowed:
        return _build_rate_limited_response(
            "Too many login attempts. Please retry shortly.",
            retry_after,
        )
    try:
        payload = login_user(email=request.email, password=request.password)
        return _session_response(payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/auth/login/challenge",
    response_model=AuthLoginChallengeResponse,
    responses=BAD_REQUEST_RESPONSES | RATE_LIMIT_RESPONSES,
    tags=["v1"],
)
def v1_auth_login_challenge(
    http_request: Request,
    request: AuthLoginChallengeRequest,
) -> AuthLoginChallengeResponse | JSONResponse:
    login_key = f"auth-login:{_client_ip(http_request)}"
    allowed, retry_after = _check_auth_rate_limit(
        key=login_key,
        limit=AUTH_LOGIN_RATE_LIMIT,
        window_seconds=AUTH_RATE_LIMIT_WINDOW_SECONDS,
    )
    if not allowed:
        return _build_rate_limited_response(
            "Too many login attempts. Please retry shortly.",
            retry_after,
        )
    try:
        payload = start_login_challenge(email=request.email, password=request.password)
        return AuthLoginChallengeResponse(**payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/auth/login/verify-2fa",
    response_model=AuthSessionResponse,
    responses=BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_login_verify_two_factor(
    request: AuthLoginVerifyTwoFactorRequest,
) -> AuthSessionResponse | JSONResponse:
    try:
        payload = complete_login_challenge(
            challenge_token=request.challenge_token,
            code=request.code,
        )
        return _session_response(payload)
    except (AuthValidationError, AuthNotFoundError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/auth/2fa",
    response_model=AuthTwoFactorStateResponse,
    responses=UNAUTHORIZED_RESPONSES | BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_two_factor_state(
    request: Request,
) -> AuthTwoFactorStateResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        payload = get_two_factor_state(session_token=token)
        return AuthTwoFactorStateResponse(**payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))


@app.post(
    "/v1/auth/2fa/setup",
    response_model=AuthTwoFactorSetupResponse,
    responses=UNAUTHORIZED_RESPONSES | BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_two_factor_setup(
    request: Request,
) -> AuthTwoFactorSetupResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        payload = create_two_factor_setup(session_token=token)
        return AuthTwoFactorSetupResponse(**payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))


@app.post(
    "/v1/auth/2fa/enable",
    response_model=AuthTwoFactorStateResponse,
    responses=UNAUTHORIZED_RESPONSES | BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_two_factor_enable(
    http_request: Request,
    request: AuthTwoFactorEnableRequest,
) -> AuthTwoFactorStateResponse | JSONResponse:
    token = _extract_session_token(http_request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        payload = enable_two_factor(
            session_token=token,
            secret=request.secret,
            code=request.code,
            backup_codes=request.backup_codes,
        )
        return AuthTwoFactorStateResponse(**payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))


@app.post(
    "/v1/auth/2fa/disable",
    response_model=AuthTwoFactorStateResponse,
    responses=UNAUTHORIZED_RESPONSES | BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_two_factor_disable(
    http_request: Request,
    request: AuthTwoFactorDisableRequest,
) -> AuthTwoFactorStateResponse | JSONResponse:
    token = _extract_session_token(http_request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        payload = disable_two_factor(session_token=token, code=request.code)
        return AuthTwoFactorStateResponse(**payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))


@app.get(
    "/v1/auth/oauth/providers",
    response_model=AuthOAuthProviderStatusesResponse,
    tags=["v1"],
)
def v1_auth_oauth_provider_statuses() -> AuthOAuthProviderStatusesResponse:
    payload = get_oauth_provider_statuses()
    return AuthOAuthProviderStatusesResponse(**payload)


@app.get(
    "/v1/auth/oauth/connect",
    response_model=AuthOAuthConnectResponse,
    responses=BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_oauth_connect(
    request: Request,
    provider: str = Query(default="orcid"),
) -> AuthOAuthConnectResponse | JSONResponse:
    try:
        payload = create_oauth_connect_url(
            provider=provider,
            frontend_origin=_request_origin(request),
        )
        return AuthOAuthConnectResponse(**payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/auth/oauth/callback",
    response_model=AuthOAuthCallbackResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_auth_oauth_callback(
    http_request: Request,
    request: AuthOAuthCallbackRequest,
) -> AuthOAuthCallbackResponse | JSONResponse:
    try:
        payload = complete_oauth_callback(
            provider=request.provider,
            state=request.state,
            code=request.code,
            frontend_origin=_request_origin(http_request),
        )
        return _oauth_session_response(payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))
    except AuthNotFoundError as exc:
        return _build_not_found_response(str(exc))


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


@app.get(
    "/v1/auth/me/affiliation-suggestions",
    response_model=AffiliationSuggestionsResponse,
    responses=UNAUTHORIZED_RESPONSES | BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_me_affiliation_suggestions(
    request: Request,
    query: str = Query(min_length=2),
    limit: int = Query(default=8, ge=1, le=8),
) -> AffiliationSuggestionsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        get_user_by_session_token(token)
        items = fetch_affiliation_suggestions(query=query, limit=limit)
        return AffiliationSuggestionsResponse(
            query=str(query).strip(),
            limit=max(1, min(8, int(limit))),
            items=[AffiliationSuggestionItemResponse(**item) for item in items],
        )
    except (AuthValidationError, AuthNotFoundError) as exc:
        return _build_unauthorized_response(str(exc))
    except AffiliationSuggestionValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/auth/me/affiliation-address",
    response_model=AffiliationAddressResolutionResponse,
    responses=UNAUTHORIZED_RESPONSES | BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_me_affiliation_address(
    request: Request,
    name: str = Query(min_length=2),
    city: str | None = Query(default=None),
    region: str | None = Query(default=None),
    country: str | None = Query(default=None),
) -> AffiliationAddressResolutionResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        get_user_by_session_token(token)
        resolved = resolve_affiliation_address(
            name=name,
            city=city,
            region=region,
            country=country,
        )
        if not resolved:
            return AffiliationAddressResolutionResponse(
                resolved=False,
                name=str(name).strip(),
            )
        return AffiliationAddressResolutionResponse(**resolved)
    except (AuthValidationError, AuthNotFoundError) as exc:
        return _build_unauthorized_response(str(exc))
    except AffiliationSuggestionValidationError as exc:
        return _build_bad_request_response(str(exc))


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


@app.delete(
    "/v1/auth/me",
    response_model=AuthDeleteAccountResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_auth_delete_me(
    request: Request,
    payload: AuthDeleteAccountRequest,
) -> AuthDeleteAccountResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        response_payload = delete_current_user(
            session_token=token,
            confirm_phrase=payload.confirm_phrase,
        )
        response = JSONResponse(
            content=AuthDeleteAccountResponse(**response_payload).model_dump()
        )
        response.delete_cookie(key="aawe_session", path="/")
        return response
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))


@app.post(
    "/v1/auth/email-verification/request",
    response_model=AuthEmailVerificationRequestResponse,
    responses=UNAUTHORIZED_RESPONSES | BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_email_verification_request(
    request: Request,
) -> AuthEmailVerificationRequestResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        payload = request_email_verification(session_token=token)
        return AuthEmailVerificationRequestResponse(**payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))


@app.post(
    "/v1/auth/email-verification/confirm",
    response_model=AuthUserResponse,
    responses=UNAUTHORIZED_RESPONSES | BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_email_verification_confirm(
    request: Request,
    payload: AuthEmailVerificationConfirmRequest,
) -> AuthUserResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user_payload = confirm_email_verification(
            session_token=token,
            code=payload.code,
        )
        return AuthUserResponse(**user_payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))


@app.post(
    "/v1/auth/password-reset/request",
    response_model=AuthPasswordResetRequestResponse,
    responses=BAD_REQUEST_RESPONSES | RATE_LIMIT_RESPONSES,
    tags=["v1"],
)
def v1_auth_password_reset_request(
    http_request: Request,
    payload: AuthPasswordResetRequestRequest,
) -> AuthPasswordResetRequestResponse | JSONResponse:
    allowed, retry_after = _check_auth_rate_limit(
        key=f"auth-password-reset:{_client_ip(http_request)}",
        limit=AUTH_PASSWORD_RESET_RATE_LIMIT,
        window_seconds=AUTH_RATE_LIMIT_WINDOW_SECONDS,
    )
    if not allowed:
        return _build_rate_limited_response(
            "Too many password reset requests. Please retry shortly.",
            retry_after,
        )
    try:
        response_payload = request_password_reset(email=payload.email)
        return AuthPasswordResetRequestResponse(**response_payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/auth/password-reset/confirm",
    response_model=AuthPasswordResetConfirmResponse,
    responses=BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_auth_password_reset_confirm(
    payload: AuthPasswordResetConfirmRequest,
) -> AuthPasswordResetConfirmResponse | JSONResponse:
    try:
        response_payload = confirm_password_reset(
            email=payload.email,
            code=payload.code,
            new_password=payload.new_password,
        )
        return AuthPasswordResetConfirmResponse(**response_payload)
    except AuthValidationError as exc:
        return _build_bad_request_response(str(exc))


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
        payload = create_orcid_connect_url(
            user_id=str(user["id"]),
            frontend_origin=_request_origin(request),
        )
        return OrcidConnectResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except OrcidNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except (OrcidValidationError, AuthValidationError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/orcid/status",
    response_model=OrcidStatusResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_orcid_status(request: Request) -> OrcidStatusResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_orcid_status(
            user_id=str(user["id"]),
            frontend_origin=_request_origin(request),
        )
        return OrcidStatusResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except OrcidNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except (OrcidValidationError, AuthValidationError) as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/orcid/disconnect",
    response_model=OrcidStatusResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_orcid_disconnect(request: Request) -> OrcidStatusResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = disconnect_orcid(user_id=str(user["id"]))
        return OrcidStatusResponse(**payload)
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
    request: Request,
    state: str = Query(default=""),
    code: str = Query(default=""),
    mode: str = Query(default="auto"),
) -> OrcidCallbackResponse | JSONResponse | RedirectResponse:
    try:
        payload = complete_orcid_callback(
            state=state,
            code=code,
            frontend_origin=_request_origin(request),
        )
        clean_mode = mode.strip().lower()
        accept_header = str(request.headers.get("accept", "")).lower()
        user_agent = str(request.headers.get("user-agent", "")).lower()
        sec_fetch_mode = str(request.headers.get("sec-fetch-mode", "")).lower()
        if clean_mode == "json":
            wants_json = True
        elif clean_mode in {"redirect", "html"}:
            wants_json = False
        else:
            # Auto mode: keep API clients JSON-first, but redirect browser navigations.
            is_browser_navigation = (
                "text/html" in accept_header
                or sec_fetch_mode == "navigate"
                or "mozilla/" in user_agent
            )
            wants_json = not is_browser_navigation
        if wants_json:
            return OrcidCallbackResponse(**payload)
        frontend_base = _frontend_redirect_base()
        redirect_url = (
            f"{frontend_base}/profile/integrations/?orcid=linked"
            f"&orcid_id={str(payload.get('orcid_id', '')).strip()}"
        )
        return RedirectResponse(url=redirect_url, status_code=303)
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


@app.post(
    "/v1/persona/jobs/orcid-import",
    response_model=PersonaSyncJobResponse,
    responses=(
        BAD_REQUEST_RESPONSES
        | NOT_FOUND_RESPONSES
        | CONFLICT_RESPONSES
        | UNAUTHORIZED_RESPONSES
    ),
    tags=["v1"],
)
def v1_persona_enqueue_orcid_import_job(
    request: Request,
    payload: PersonaSyncJobOrcidImportRequest,
) -> PersonaSyncJobResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        job = enqueue_persona_sync_job(
            user_id=str(user["id"]),
            job_type="orcid_import",
            overwrite_user_metadata=payload.overwrite_user_metadata,
            run_metrics_sync=payload.run_metrics_sync,
            providers=payload.providers,
            refresh_analytics=payload.refresh_analytics,
            refresh_metrics=payload.refresh_metrics,
        )
        return PersonaSyncJobResponse(**serialize_persona_sync_job(job))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (PersonaSyncJobNotFoundError, OrcidNotFoundError) as exc:
        return _build_not_found_response(str(exc))
    except PersonaSyncJobConflictError as exc:
        return _build_conflict_response(str(exc))
    except (PersonaSyncJobValidationError, OrcidValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/persona/jobs/metrics-sync",
    response_model=PersonaSyncJobResponse,
    responses=(
        BAD_REQUEST_RESPONSES
        | NOT_FOUND_RESPONSES
        | CONFLICT_RESPONSES
        | UNAUTHORIZED_RESPONSES
    ),
    tags=["v1"],
)
def v1_persona_enqueue_metrics_sync_job(
    request: Request,
    payload: PersonaSyncJobMetricsRequest,
) -> PersonaSyncJobResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        job = enqueue_persona_sync_job(
            user_id=str(user["id"]),
            job_type="metrics_sync",
            providers=payload.providers,
            refresh_analytics=payload.refresh_analytics,
            refresh_metrics=payload.refresh_metrics,
        )
        return PersonaSyncJobResponse(**serialize_persona_sync_job(job))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PersonaSyncJobNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PersonaSyncJobConflictError as exc:
        return _build_conflict_response(str(exc))
    except (PersonaSyncJobValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/persona/jobs/{job_id}",
    response_model=PersonaSyncJobResponse,
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_persona_get_sync_job(
    request: Request, job_id: str
) -> PersonaSyncJobResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        job = get_persona_sync_job(user_id=str(user["id"]), job_id=job_id)
        return PersonaSyncJobResponse(**serialize_persona_sync_job(job))
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PersonaSyncJobNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.get(
    "/v1/persona/jobs",
    response_model=list[PersonaSyncJobResponse],
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_persona_list_sync_jobs(
    request: Request, limit: int = Query(default=10, ge=1, le=50)
) -> list[PersonaSyncJobResponse] | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        jobs = list_persona_sync_jobs(user_id=str(user["id"]), limit=limit)
        return [
            PersonaSyncJobResponse(**serialize_persona_sync_job(job)) for job in jobs
        ]
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PersonaSyncJobNotFoundError as exc:
        return _build_not_found_response(str(exc))


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
    "/v1/persona/open-access/discover",
    response_model=PersonaOpenAccessDiscoverResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_persona_open_access_discover(
    request: Request,
    payload: PersonaOpenAccessDiscoverRequest,
) -> PersonaOpenAccessDiscoverResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        data = discover_open_access_for_persona(
            user_id=str(user["id"]),
            work_ids=payload.work_ids,
            include_pdf_upload=payload.include_pdf_upload,
            project_id=payload.project_id,
            max_items=payload.max_items,
        )
        return PersonaOpenAccessDiscoverResponse(**data)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (PersonaNotFoundError, OpenAccessNotFoundError) as exc:
        return _build_not_found_response(str(exc))
    except (OpenAccessValidationError, PersonaValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/publications/metrics",
    response_model=PublicationsTopMetricsResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
@app.get(
    "/publications/metrics",
    response_model=PublicationsTopMetricsResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publications_top_metrics(
    request: Request,
) -> PublicationsTopMetricsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_publication_top_metrics(user_id=str(user["id"]))
        return PublicationsTopMetricsResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (PersonaNotFoundError, PublicationMetricsNotFoundError) as exc:
        return _build_not_found_response(str(exc))
    except (PublicationMetricsValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/publications/refresh",
    response_model=PublicationsTopMetricsRefreshResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
@app.post(
    "/publications/refresh",
    response_model=PublicationsTopMetricsRefreshResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publications_top_metrics_refresh(
    request: Request,
) -> PublicationsTopMetricsRefreshResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = trigger_publication_top_metrics_refresh(user_id=str(user["id"]))
        return PublicationsTopMetricsRefreshResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (PersonaNotFoundError, PublicationMetricsNotFoundError) as exc:
        return _build_not_found_response(str(exc))
    except (PublicationMetricsValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/publications/metric/{metric_id}",
    response_model=PublicationMetricDetailResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
@app.get(
    "/publications/metric/{metric_id}",
    response_model=PublicationMetricDetailResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publications_metric_detail(
    request: Request,
    metric_id: str,
) -> PublicationMetricDetailResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_publication_metric_detail(
            user_id=str(user["id"]),
            metric_id=metric_id,
        )
        return PublicationMetricDetailResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (PersonaNotFoundError, PublicationMetricsNotFoundError) as exc:
        return _build_not_found_response(str(exc))
    except (PublicationMetricsValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/publications/analytics",
    response_model=PublicationsAnalyticsResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publications_analytics(
    request: Request,
) -> PublicationsAnalyticsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_publications_analytics(user_id=str(user["id"]))
        return PublicationsAnalyticsResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (PersonaNotFoundError, PublicationsAnalyticsNotFoundError) as exc:
        return _build_not_found_response(str(exc))
    except (PublicationsAnalyticsValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/publications/analytics/summary",
    response_model=PublicationsAnalyticsSummaryResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publications_analytics_summary(
    request: Request,
    refresh: bool = Query(default=False),
    refresh_metrics: bool = Query(default=False),
) -> PublicationsAnalyticsSummaryResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_publications_analytics_summary(
            user_id=str(user["id"]),
            refresh=refresh,
            refresh_metrics=refresh_metrics,
        )
        return PublicationsAnalyticsSummaryResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (PersonaNotFoundError, PublicationsAnalyticsNotFoundError) as exc:
        return _build_not_found_response(str(exc))
    except (PublicationsAnalyticsValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/publications/analytics/timeseries",
    response_model=PublicationsAnalyticsTimeseriesResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publications_analytics_timeseries(
    request: Request,
    refresh: bool = Query(default=False),
    refresh_metrics: bool = Query(default=False),
) -> PublicationsAnalyticsTimeseriesResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_publications_analytics_timeseries(
            user_id=str(user["id"]),
            refresh=refresh,
            refresh_metrics=refresh_metrics,
        )
        return PublicationsAnalyticsTimeseriesResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (PersonaNotFoundError, PublicationsAnalyticsNotFoundError) as exc:
        return _build_not_found_response(str(exc))
    except (PublicationsAnalyticsValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/publications/analytics/top-drivers",
    response_model=PublicationsAnalyticsTopDriversResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publications_analytics_top_drivers(
    request: Request,
    limit: int = Query(default=5, ge=1, le=25),
    refresh: bool = Query(default=False),
    refresh_metrics: bool = Query(default=False),
) -> PublicationsAnalyticsTopDriversResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_publications_analytics_top_drivers(
            user_id=str(user["id"]),
            limit=limit,
            refresh=refresh,
            refresh_metrics=refresh_metrics,
        )
        return PublicationsAnalyticsTopDriversResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (PersonaNotFoundError, PublicationsAnalyticsNotFoundError) as exc:
        return _build_not_found_response(str(exc))
    except (PublicationsAnalyticsValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/publications/{publication_id}",
    response_model=PublicationDetailResponse,
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publication_detail(
    request: Request,
    publication_id: str,
) -> PublicationDetailResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_publication_details(
            user_id=str(user["id"]),
            publication_id=publication_id,
        )
        return PublicationDetailResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PublicationConsoleNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.get(
    "/v1/publications/{publication_id}/authors",
    response_model=PublicationAuthorsResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publication_authors(
    request: Request,
    publication_id: str,
) -> PublicationAuthorsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_publication_authors(
            user_id=str(user["id"]),
            publication_id=publication_id,
        )
        return PublicationAuthorsResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PublicationConsoleNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PublicationConsoleValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/publications/{publication_id}/impact",
    response_model=PublicationImpactResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publication_impact(
    request: Request,
    publication_id: str,
) -> PublicationImpactResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_publication_impact(
            user_id=str(user["id"]),
            publication_id=publication_id,
        )
        return PublicationImpactResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PublicationConsoleNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PublicationConsoleValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/publications/{publication_id}/ai-insights",
    response_model=PublicationAiInsightsResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publication_ai_insights(
    request: Request,
    publication_id: str,
) -> PublicationAiInsightsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_publication_ai_insights(
            user_id=str(user["id"]),
            publication_id=publication_id,
        )
        return PublicationAiInsightsResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PublicationConsoleNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PublicationConsoleValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/publications/{publication_id}/files",
    response_model=PublicationFilesListResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publication_files_list(
    request: Request,
    publication_id: str,
) -> PublicationFilesListResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = list_publication_files(
            user_id=str(user["id"]),
            publication_id=publication_id,
        )
        return PublicationFilesListResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PublicationConsoleNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PublicationConsoleValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/publications/{publication_id}/files/upload",
    response_model=PublicationFileResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
async def v1_publication_files_upload(
    request: Request,
    publication_id: str,
) -> PublicationFileResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        content_type = request.headers.get("content-type", "").lower()
        file_name = "publication-file.bin"
        file_content_type: str | None = None
        content: bytes = b""

        if "application/json" in content_type:
            payload = await request.json()
            if not isinstance(payload, dict):
                return _build_bad_request_response("JSON payload must be an object.")
            file_name = (
                str(payload.get("filename") or "").strip() or "publication-file.bin"
            )
            file_content_type = str(payload.get("mime_type") or "").strip() or None
            raw = str(payload.get("content_base64") or "").strip()
            if not raw:
                return _build_bad_request_response("content_base64 is required.")
            try:
                content = base64.b64decode(raw, validate=False)
            except Exception:
                return _build_bad_request_response("content_base64 is invalid.")
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
            file = form.get("file")
            if file is None or not hasattr(file, "read"):
                files = form.getlist("files")
                file = files[0] if files else None
            if file is None or not hasattr(file, "read"):
                return _build_bad_request_response("No upload file was provided.")
            file_name = (
                str(getattr(file, "filename", "") or "").strip()
                or "publication-file.bin"
            )
            file_content_type = getattr(file, "content_type", None)
            content = await file.read()

        saved = upload_publication_file(
            user_id=str(user["id"]),
            publication_id=publication_id,
            filename=file_name,
            content_type=file_content_type,
            content=content,
        )
        return PublicationFileResponse(**saved)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PublicationConsoleNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PublicationConsoleValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/publications/{publication_id}/files/link-oa",
    response_model=PublicationFileLinkResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publication_files_link_oa(
    request: Request,
    publication_id: str,
) -> PublicationFileLinkResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = link_publication_open_access_pdf(
            user_id=str(user["id"]),
            publication_id=publication_id,
        )
        return PublicationFileLinkResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PublicationConsoleNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PublicationConsoleValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.delete(
    "/v1/publications/{publication_id}/files/{file_id}",
    response_model=PublicationFileDeleteResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publication_files_delete(
    request: Request,
    publication_id: str,
    file_id: str,
) -> PublicationFileDeleteResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = delete_publication_file(
            user_id=str(user["id"]),
            publication_id=publication_id,
            file_id=file_id,
        )
        return PublicationFileDeleteResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PublicationConsoleNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PublicationConsoleValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/publications/{publication_id}/files/{file_id}/download",
    response_model=None,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_publication_files_download(
    request: Request,
    publication_id: str,
    file_id: str,
) -> Response | RedirectResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_publication_file_download(
            user_id=str(user["id"]),
            publication_id=publication_id,
            file_id=file_id,
        )
        if payload.get("mode") == "redirect":
            url = str(payload.get("url") or "").strip()
            if not url:
                return _build_not_found_response("Download URL is unavailable.")
            return RedirectResponse(url=url)
        file_name = str(payload.get("file_name") or "file.bin")
        media_type = str(payload.get("content_type") or "application/octet-stream")
        content = payload.get("content") or b""
        headers = {"Content-Disposition": f'attachment; filename="{file_name}"'}
        return Response(content=content, media_type=media_type, headers=headers)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except PublicationConsoleNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PublicationConsoleValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/account/collaboration/collaborators",
    response_model=CollaboratorsListResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_list_collaborators(
    request: Request,
    query: str = Query(default=""),
    sort: str = Query(default="name"),
    page: int = Query(default=1, ge=1, le=100000),
    page_size: int = Query(default=50, ge=1, le=200),
) -> CollaboratorsListResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = list_collaborators_for_user(
            user_id=str(user["id"]),
            query=query,
            sort=sort,
            page=page,
            page_size=page_size,
        )
        return CollaboratorsListResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/account/collaboration/collaborators/export",
    response_model=None,
    responses=UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_export_collaborators_csv(
    request: Request,
) -> PlainTextResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        filename, body = export_collaborators_csv(user_id=str(user["id"]))
        return PlainTextResponse(
            content=body,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))


@app.post(
    "/v1/account/collaboration/collaborators",
    response_model=CollaboratorResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_create_collaborator(
    request: Request,
    payload: CollaboratorCreateRequest,
) -> CollaboratorResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        item = create_collaborator_for_user(
            user_id=str(user["id"]),
            payload=payload.model_dump(),
        )
        return CollaboratorResponse(**item)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/account/collaboration/collaborators/{collaborator_id}",
    response_model=CollaboratorResponse,
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_get_collaborator(
    request: Request,
    collaborator_id: str,
) -> CollaboratorResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        item = get_collaborator_for_user(
            user_id=str(user["id"]),
            collaborator_id=collaborator_id,
        )
        return CollaboratorResponse(**item)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except CollaborationNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.patch(
    "/v1/account/collaboration/collaborators/{collaborator_id}",
    response_model=CollaboratorResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_update_collaborator(
    request: Request,
    collaborator_id: str,
    payload: CollaboratorUpdateRequest,
) -> CollaboratorResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        item = update_collaborator_for_user(
            user_id=str(user["id"]),
            collaborator_id=collaborator_id,
            payload=payload.model_dump(exclude_unset=True),
        )
        return CollaboratorResponse(**item)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except CollaborationNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.delete(
    "/v1/account/collaboration/collaborators/{collaborator_id}",
    response_model=CollaboratorDeleteResponse,
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_delete_collaborator(
    request: Request,
    collaborator_id: str,
) -> CollaboratorDeleteResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = delete_collaborator_for_user(
            user_id=str(user["id"]),
            collaborator_id=collaborator_id,
        )
        return CollaboratorDeleteResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except CollaborationNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.get(
    "/v1/account/collaboration/metrics/summary",
    response_model=CollaborationMetricsSummaryResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_metrics_summary(
    request: Request,
) -> CollaborationMetricsSummaryResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_collaboration_metrics_summary(user_id=str(user["id"]))
        return CollaborationMetricsSummaryResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/account/collaboration/metrics/recompute",
    response_model=CollaborationMetricsRecomputeResponse,
    responses=UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_metrics_recompute(
    request: Request,
) -> CollaborationMetricsRecomputeResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = trigger_collaboration_metrics_recompute(
            user_id=str(user["id"]),
            force=True,
        )
        return CollaborationMetricsRecomputeResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))


@app.post(
    "/v1/account/collaboration/import/openalex",
    response_model=CollaborationImportOpenAlexResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_import_openalex(
    request: Request,
) -> CollaborationImportOpenAlexResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = import_collaborators_from_openalex(user_id=str(user["id"]))
        return CollaborationImportOpenAlexResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/account/collaboration/enrich/openalex",
    response_model=CollaborationEnrichOpenAlexResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_enrich_openalex(
    request: Request,
    payload: CollaborationEnrichOpenAlexRequest,
) -> CollaborationEnrichOpenAlexResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = enrich_collaborators_from_openalex(
            user_id=str(user["id"]),
            only_missing=bool(payload.only_missing),
            limit=int(payload.limit),
        )
        return CollaborationEnrichOpenAlexResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/account/collaboration/ai/insights",
    response_model=CollaborationAiInsightsResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_ai_insights(
    request: Request,
) -> CollaborationAiInsightsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = generate_collaboration_ai_insights_draft(user_id=str(user["id"]))
        return CollaborationAiInsightsResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/account/collaboration/ai/author-suggestions",
    response_model=CollaborationAiAuthorSuggestionsResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_ai_author_suggestions(
    request: Request,
    payload: CollaborationAiAuthorSuggestionsRequest,
) -> CollaborationAiAuthorSuggestionsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = suggest_collaborators_for_manuscript_draft(
            user_id=str(user["id"]),
            topic_keywords=payload.topic_keywords,
            methods=payload.methods,
            limit=payload.limit,
        )
        return CollaborationAiAuthorSuggestionsResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/account/collaboration/ai/contribution-statement",
    response_model=CollaborationAiContributionDraftResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_ai_contribution_statement(
    request: Request,
    payload: CollaborationAiContributionDraftRequest,
) -> CollaborationAiContributionDraftResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = draft_contribution_statement(
            user_id=str(user["id"]),
            authors=[item.model_dump() for item in payload.authors],
        )
        return CollaborationAiContributionDraftResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/account/collaboration/ai/affiliations-normaliser",
    response_model=CollaborationAiAffiliationsNormaliseResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_collaboration_ai_affiliations_normaliser(
    request: Request,
    payload: CollaborationAiAffiliationsNormaliseRequest,
) -> CollaborationAiAffiliationsNormaliseResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = normalize_affiliations_and_coi_draft(
            user_id=str(user["id"]),
            authors=[item.model_dump() for item in payload.authors],
        )
        return CollaborationAiAffiliationsNormaliseResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/manuscript/authors/suggestions",
    response_model=ManuscriptAuthorSuggestionsResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_manuscript_author_suggestions(
    request: Request,
    query: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=200),
) -> ManuscriptAuthorSuggestionsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_manuscript_author_suggestions(
            user_id=str(user["id"]),
            query=query,
            limit=limit,
        )
        return ManuscriptAuthorSuggestionsResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/manuscript/{workspace_id}/authors",
    response_model=ManuscriptAuthorsResponse,
    responses=NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_get_manuscript_authors(
    request: Request,
    workspace_id: str,
) -> ManuscriptAuthorsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_manuscript_authors(
            user_id=str(user["id"]),
            workspace_id=workspace_id,
        )
        return ManuscriptAuthorsResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except CollaborationNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/manuscript/{workspace_id}/authors",
    response_model=ManuscriptAuthorsResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_save_manuscript_authors(
    request: Request,
    workspace_id: str,
    payload: ManuscriptAuthorsSaveRequest,
) -> ManuscriptAuthorsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = save_manuscript_authors(
            user_id=str(user["id"]),
            workspace_id=workspace_id,
            authors=[item.model_dump() for item in payload.authors],
            affiliations=[item.model_dump() for item in payload.affiliations],
        )
        return ManuscriptAuthorsResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except CollaborationNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except (CollaborationValidationError, ValueError) as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/workspaces",
    response_model=WorkspaceListResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_list_workspaces(request: Request) -> WorkspaceListResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = list_workspace_records(user_id=str(user["id"]))
        return WorkspaceListResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/workspaces",
    response_model=WorkspaceRecordResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_create_workspace(
    request: Request, payload: WorkspaceCreateRequest
) -> WorkspaceRecordResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = create_workspace_record(
            user_id=str(user["id"]),
            payload=payload.model_dump(),
        )
        return WorkspaceRecordResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.patch(
    "/v1/workspaces/{workspace_id}",
    response_model=WorkspaceRecordResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_update_workspace(
    request: Request,
    workspace_id: str,
    payload: WorkspaceUpdateRequest,
) -> WorkspaceRecordResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = update_workspace_record(
            user_id=str(user["id"]),
            workspace_id=workspace_id,
            patch=payload.model_dump(exclude_none=True),
        )
        return WorkspaceRecordResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.delete(
    "/v1/workspaces/{workspace_id}",
    response_model=WorkspaceDeleteResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_delete_workspace(
    request: Request, workspace_id: str
) -> WorkspaceDeleteResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = delete_workspace_record(
            user_id=str(user["id"]),
            workspace_id=workspace_id,
        )
        return WorkspaceDeleteResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.put(
    "/v1/workspaces/active",
    response_model=WorkspaceActiveUpdateResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_set_active_workspace(
    request: Request,
    payload: WorkspaceActiveUpdateRequest,
) -> WorkspaceActiveUpdateResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = set_active_workspace(
            user_id=str(user["id"]),
            workspace_id=payload.workspace_id,
        )
        return WorkspaceActiveUpdateResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/workspaces/{workspace_id}/run-context",
    response_model=WorkspaceRunContextResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_get_workspace_run_context(
    request: Request,
    workspace_id: str,
) -> WorkspaceRunContextResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_required(request)
    if auth_error is not None:
        return auth_error
    try:
        payload = get_workspace_run_context(
            workspace_id=workspace_id,
            requesting_user_id=requesting_user_id or "",
        )
        return WorkspaceRunContextResponse(**payload)
    except ProjectNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.get(
    "/v1/workspaces/author-requests",
    response_model=WorkspaceAuthorRequestsResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_list_workspace_author_requests(
    request: Request,
) -> WorkspaceAuthorRequestsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = list_workspace_author_requests(user_id=str(user["id"]))
        return WorkspaceAuthorRequestsResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/workspaces/author-requests/{request_id}/accept",
    response_model=WorkspaceAuthorRequestAcceptResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_accept_workspace_author_request(
    request: Request,
    request_id: str,
    payload: WorkspaceAuthorRequestAcceptRequest,
) -> WorkspaceAuthorRequestAcceptResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = accept_workspace_author_request(
            user_id=str(user["id"]),
            request_id=request_id,
            collaborator_name=payload.collaborator_name,
        )
        return WorkspaceAuthorRequestAcceptResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/workspaces/author-requests/{request_id}/decline",
    response_model=WorkspaceAuthorRequestDeclineResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_decline_workspace_author_request(
    request: Request,
    request_id: str,
) -> WorkspaceAuthorRequestDeclineResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = decline_workspace_author_request(
            user_id=str(user["id"]),
            request_id=request_id,
        )
        return WorkspaceAuthorRequestDeclineResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/workspaces/invitations/sent",
    response_model=WorkspaceInvitationsSentResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_list_workspace_invitations_sent(
    request: Request,
) -> WorkspaceInvitationsSentResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = list_workspace_invitations_sent(user_id=str(user["id"]))
        return WorkspaceInvitationsSentResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/workspaces/invitations/sent",
    response_model=WorkspaceInvitationSentResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_create_workspace_invitation(
    request: Request,
    payload: WorkspaceInvitationCreateRequest,
) -> WorkspaceInvitationSentResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = create_workspace_invitation(
            user_id=str(user["id"]),
            payload=payload.model_dump(),
        )
        return WorkspaceInvitationSentResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.patch(
    "/v1/workspaces/invitations/sent/{invitation_id}",
    response_model=WorkspaceInvitationSentResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_update_workspace_invitation(
    request: Request,
    invitation_id: str,
    payload: WorkspaceInvitationStatusUpdateRequest,
) -> WorkspaceInvitationSentResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = update_workspace_invitation_status(
            user_id=str(user["id"]),
            invitation_id=invitation_id,
            status=payload.status,
        )
        return WorkspaceInvitationSentResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/workspaces/inbox/messages",
    response_model=WorkspaceInboxMessagesResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_list_workspace_inbox_messages(
    request: Request,
    workspace_id: str | None = Query(default=None),
) -> WorkspaceInboxMessagesResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = list_workspace_inbox_messages(
            user_id=str(user["id"]),
            workspace_id=workspace_id,
        )
        return WorkspaceInboxMessagesResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/workspaces/inbox/messages",
    response_model=WorkspaceInboxMessageResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_create_workspace_inbox_message(
    request: Request,
    payload: WorkspaceInboxMessageCreateRequest,
) -> WorkspaceInboxMessageResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = create_workspace_inbox_message(
            user_id=str(user["id"]),
            payload=payload.model_dump(),
        )
        return WorkspaceInboxMessageResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/workspaces/inbox/reads",
    response_model=WorkspaceInboxReadsResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_list_workspace_inbox_reads(
    request: Request,
    workspace_id: str | None = Query(default=None),
) -> WorkspaceInboxReadsResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = list_workspace_inbox_reads(
            user_id=str(user["id"]),
            workspace_id=workspace_id,
        )
        return WorkspaceInboxReadsResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.put(
    "/v1/workspaces/inbox/reads",
    response_model=WorkspaceInboxReadMarkResponse,
    responses=NOT_FOUND_RESPONSES | BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_mark_workspace_inbox_read(
    request: Request,
    payload: WorkspaceInboxReadMarkRequest,
) -> WorkspaceInboxReadMarkResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = mark_workspace_inbox_read(
            user_id=str(user["id"]),
            payload=payload.model_dump(),
        )
        return WorkspaceInboxReadMarkResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.websocket("/v1/workspaces/inbox/ws")
async def v1_workspace_inbox_ws(websocket: WebSocket) -> None:
    workspace_id = str(websocket.query_params.get("workspace_id", "")).strip()
    if not workspace_id:
        await websocket.close(code=1008, reason="workspace_id is required.")
        return

    token = _extract_ws_session_token(websocket)
    if not token:
        await websocket.close(code=1008, reason="Session token is required.")
        return

    try:
        user = get_user_by_session_token(token)
    except AuthNotFoundError:
        await websocket.close(code=1008, reason="Session token is invalid.")
        return

    sender_user_id = str(user.get("id") or "").strip()
    sender_name = str(user.get("name") or "").strip() or "Unknown user"
    if not has_workspace_access(user_id=sender_user_id, workspace_id=workspace_id):
        await websocket.close(code=1008, reason="Workspace access denied.")
        return

    await _workspace_inbox_realtime_hub.connect(
        workspace_id=workspace_id,
        websocket=websocket,
    )
    await _workspace_inbox_realtime_hub.broadcast(
        workspace_id=workspace_id,
        payload={
            "type": "presence",
            "workspace_id": workspace_id,
            "sender_user_id": sender_user_id,
            "sender_name": sender_name,
            "status": "joined",
            "sent_at_unix_ms": int(time.time() * 1000),
        },
        exclude=websocket,
    )
    try:
        while True:
            payload = await websocket.receive_json()
            if not isinstance(payload, dict):
                continue
            event_type = str(payload.get("type") or "").strip().lower()
            if event_type not in {"typing", "message_sent", "read_marked", "ping"}:
                continue

            if event_type == "ping":
                await websocket.send_json(
                    {
                        "type": "pong",
                        "workspace_id": workspace_id,
                        "sent_at_unix_ms": int(time.time() * 1000),
                    }
                )
                continue

            payload_workspace_id = str(payload.get("workspace_id") or workspace_id).strip()
            if payload_workspace_id != workspace_id:
                continue

            event_payload: dict[str, Any] = {
                "type": event_type,
                "workspace_id": workspace_id,
                "sender_user_id": sender_user_id,
                "sender_name": sender_name,
                "sent_at_unix_ms": int(time.time() * 1000),
            }
            if event_type == "typing":
                event_payload["active"] = bool(payload.get("active"))
            if event_type == "message_sent":
                message_id = str(payload.get("message_id") or "").strip()
                created_at = str(payload.get("created_at") or "").strip()
                if message_id:
                    event_payload["message_id"] = message_id
                if created_at:
                    event_payload["created_at"] = created_at
            if event_type == "read_marked":
                reader_name = str(payload.get("reader_name") or sender_name).strip() or sender_name
                read_at = str(payload.get("read_at") or "").strip()
                event_payload["reader_name"] = reader_name
                if read_at:
                    event_payload["read_at"] = read_at

            await _workspace_inbox_realtime_hub.broadcast(
                workspace_id=workspace_id,
                payload=event_payload,
                exclude=websocket,
            )
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning(
            "workspace_inbox_realtime_ws_error",
            extra={
                "workspace_id": workspace_id,
                "sender_user_id": sender_user_id,
                "detail": str(exc),
            },
        )
    finally:
        await _workspace_inbox_realtime_hub.disconnect(websocket)
        await _workspace_inbox_realtime_hub.broadcast(
            workspace_id=workspace_id,
            payload={
                "type": "presence",
                "workspace_id": workspace_id,
                "sender_user_id": sender_user_id,
                "sender_name": sender_name,
                "status": "left",
                "sent_at_unix_ms": int(time.time() * 1000),
            },
            exclude=websocket,
        )


@app.get(
    "/v1/workspaces/state",
    response_model=WorkspaceStateResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_get_workspace_state(request: Request) -> WorkspaceStateResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_workspace_state(user_id=str(user["id"]))
        return WorkspaceStateResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.put(
    "/v1/workspaces/state",
    response_model=WorkspaceStateResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_put_workspace_state(
    request: Request,
    payload: WorkspaceStateUpdateRequest,
) -> WorkspaceStateResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = save_workspace_state(
            user_id=str(user["id"]),
            payload=payload.model_dump(),
        )
        return WorkspaceStateResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/workspaces/inbox/state",
    response_model=WorkspaceInboxStateResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_get_workspace_inbox_state(
    request: Request,
) -> WorkspaceInboxStateResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        payload = get_workspace_inbox_state(user_id=str(user["id"]))
        return WorkspaceInboxStateResponse(**payload)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.put(
    "/v1/workspaces/inbox/state",
    response_model=WorkspaceInboxStateResponse,
    responses=BAD_REQUEST_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_put_workspace_inbox_state(
    request: Request,
    payload: WorkspaceInboxStateUpdateRequest,
) -> WorkspaceInboxStateResponse | JSONResponse:
    token = _extract_session_token(request)
    if not token:
        return _build_unauthorized_response("Session token is required.")
    try:
        user = get_user_by_session_token(token)
        result = save_workspace_inbox_state(
            user_id=str(user["id"]),
            payload=payload.model_dump(),
        )
        return WorkspaceInboxStateResponse(**result)
    except AuthNotFoundError as exc:
        return _build_unauthorized_response(str(exc))
    except WorkspaceValidationError as exc:
        return _build_bad_request_response(str(exc))


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
    requesting_user_id, auth_error = _resolve_request_user_required(request)
    if auth_error is not None:
        return auth_error
    try:
        project_id_value = _normalize_optional_id(project_id)
        file_payloads: list[tuple[str, str | None, bytes]] = []
        content_type = request.headers.get("content-type", "").lower()

        if "application/json" in content_type:
            payload = await request.json()
            if not isinstance(payload, dict):
                return _build_bad_request_response("JSON payload must be an object.")

            payload_project_id = _normalize_optional_id(payload.get("project_id"))
            if payload_project_id is not None:
                project_id_value = payload_project_id

            raw_files = payload.get("files", [])
            if not isinstance(raw_files, list):
                return _build_bad_request_response(
                    "JSON payload field 'files' must be a list."
                )

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

            form_project_id = _normalize_optional_id(form.get("project_id"))
            if form_project_id is not None:
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
            user_id=requesting_user_id,
        )
        return LibraryAssetUploadResponse(asset_ids=asset_ids)
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/library/assets",
    response_model=LibraryAssetListResponse,
    tags=["v1"],
)
def v1_list_library_assets(
    request: Request,
    project_id: str | None = Query(default=None),
    query: str = Query(default=""),
    ownership: Literal["all", "owned", "shared"] = Query(default="all"),
    page: int = Query(default=1, ge=1, le=100000),
    page_size: int = Query(default=50, ge=1, le=200),
    sort_by: Literal[
        "uploaded_at", "filename", "byte_size", "kind", "owner_name"
    ] = Query(default="uploaded_at"),
    sort_direction: Literal["asc", "desc"] = Query(default="desc"),
) -> LibraryAssetListResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_required(request)
    if auth_error is not None:
        return auth_error
    try:
        payload = list_library_assets(
            project_id=project_id,
            user_id=requesting_user_id,
            query=query,
            ownership=ownership,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_direction=sort_direction,
        )
        return LibraryAssetListResponse(
            items=[LibraryAssetResponse(**item) for item in payload.get("items", [])],
            page=int(payload.get("page") or page),
            page_size=int(payload.get("page_size") or page_size),
            total=int(payload.get("total") or 0),
            has_more=bool(payload.get("has_more")),
            sort_by=str(payload.get("sort_by") or sort_by),
            sort_direction=str(payload.get("sort_direction") or sort_direction),
            query=str(payload.get("query") or ""),
            ownership=str(payload.get("ownership") or ownership),
        )
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.patch(
    "/v1/library/assets/{asset_id}/access",
    response_model=LibraryAssetResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_update_library_asset_access(
    request: Request,
    asset_id: str,
    payload: LibraryAssetAccessUpdateRequest,
) -> LibraryAssetResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_required(request)
    if auth_error is not None:
        return auth_error
    try:
        updated = update_library_asset_access(
            asset_id=asset_id,
            user_id=requesting_user_id or "",
            collaborator_user_ids=payload.collaborator_user_ids,
            collaborator_names=payload.collaborator_names,
        )
        return LibraryAssetResponse(**updated)
    except DataAssetNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.get(
    "/v1/library/assets/{asset_id}/download",
    response_model=None,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES | UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_download_library_asset(
    request: Request,
    asset_id: str,
) -> Response | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_required(request)
    if auth_error is not None:
        return auth_error
    try:
        payload = download_library_asset(
            asset_id=asset_id,
            user_id=requesting_user_id or "",
        )
        file_name = str(payload.get("file_name") or "asset.bin")
        media_type = str(payload.get("content_type") or "application/octet-stream")
        content = payload.get("content") or b""
        headers = {"Content-Disposition": f'attachment; filename="{file_name}"'}
        return Response(content=content, media_type=media_type, headers=headers)
    except DataAssetNotFoundError as exc:
        return _build_not_found_response(str(exc))
    except PlannerValidationError as exc:
        return _build_bad_request_response(str(exc))


@app.post(
    "/v1/manuscripts/{manuscript_id}/attach-assets",
    response_model=ManuscriptAttachAssetsResponse,
    responses=BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_attach_assets_to_manuscript(
    manuscript_id: str,
    payload: ManuscriptAttachAssetsRequest,
    http_request: Request,
) -> ManuscriptAttachAssetsResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        attached = attach_assets_to_manuscript(
            manuscript_id=manuscript_id,
            asset_ids=payload.asset_ids,
            section_context=payload.section_context,
            user_id=requesting_user_id,
        )
        return ManuscriptAttachAssetsResponse(
            manuscript_id=manuscript_id,
            attached_asset_ids=attached,
            section_context=payload.section_context,
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
    payload: DataProfileRequest,
    http_request: Request,
) -> DataProfileResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        result = create_data_profile(
            asset_ids=payload.asset_ids,
            sampling=payload.sampling.model_dump(),
            user_id=requesting_user_id,
        )
        return DataProfileResponse(**result)
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
    payload: AnalysisScaffoldRequest,
    http_request: Request,
) -> AnalysisScaffoldResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        result = create_analysis_scaffold(
            manuscript_id=payload.manuscript_id,
            profile_id=payload.profile_id,
            confirmed_fields=payload.confirmed_fields.model_dump(),
            user_id=requesting_user_id,
        )
        return AnalysisScaffoldResponse(**result)
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
    payload: TablesScaffoldRequest,
    http_request: Request,
) -> TablesScaffoldResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        result = create_tables_scaffold(
            manuscript_id=payload.manuscript_id,
            profile_id=payload.profile_id,
            confirmed_fields=payload.confirmed_fields.model_dump(),
            user_id=requesting_user_id,
        )
        return TablesScaffoldResponse(**result)
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
    payload: FiguresScaffoldRequest,
    http_request: Request,
) -> FiguresScaffoldResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        result = create_figures_scaffold(
            manuscript_id=payload.manuscript_id,
            profile_id=payload.profile_id,
            confirmed_fields=payload.confirmed_fields.model_dump(),
            user_id=requesting_user_id,
        )
        return FiguresScaffoldResponse(**result)
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
    payload: ManuscriptPlanUpdateRequest,
    http_request: Request,
) -> ManuscriptPlanUpdateResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        result = save_manuscript_plan(
            manuscript_id=manuscript_id,
            plan_json=payload.plan_json,
            user_id=requesting_user_id,
        )
        return ManuscriptPlanUpdateResponse(**result)
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
    payload: PlanSectionImproveRequest,
    http_request: Request,
) -> PlanSectionImproveResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        result = improve_plan_section(
            manuscript_id=manuscript_id,
            section_key=payload.section_key,
            current_text=payload.current_text,
            context=payload.context.model_dump(),
            tool=payload.tool,
            user_id=requesting_user_id,
        )
        return PlanSectionImproveResponse(**result)
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
    http_request: Request,
) -> GroundedDraftResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    if (
        request.generation_mode == "targeted"
        and not (request.target_instruction or "").strip()
    ):
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
                requesting_user_id=requesting_user_id,
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
    http_request: Request,
) -> TitleAbstractSynthesisResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        manuscript = get_project_manuscript(
            project_id,
            manuscript_id,
            requesting_user_id=requesting_user_id,
        )
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
            requesting_user_id=requesting_user_id,
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
    http_request: Request,
) -> ConsistencyCheckResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        manuscript = get_project_manuscript(
            project_id,
            manuscript_id,
            requesting_user_id=requesting_user_id,
        )
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
    http_request: Request,
) -> ParagraphRegenerationResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        manuscript = get_project_manuscript(
            project_id,
            manuscript_id,
            requesting_user_id=requesting_user_id,
        )
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
            requesting_user_id=requesting_user_id,
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
    http_request: Request,
) -> SubmissionPackResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        project = get_project_record(
            project_id,
            requesting_user_id=requesting_user_id,
        )
        manuscript = get_project_manuscript(
            project_id,
            manuscript_id,
            requesting_user_id=requesting_user_id,
        )
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
def v1_wizard_bootstrap(
    request: WizardBootstrapRequest,
    http_request: Request,
) -> WizardBootstrapResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    project, manuscript, inference = bootstrap_project_from_wizard(
        title=request.title,
        target_journal=request.target_journal,
        answers=request.answers,
        journal_voice=request.journal_voice,
        language=request.language,
        branch_name=request.branch_name,
        owner_user_id=requesting_user_id,
        workspace_id=request.workspace_id,
        collaborator_names=request.collaborator_names,
    )
    return WizardBootstrapResponse(
        project=project,
        manuscript=manuscript,
        inference=WizardInferResponse(**inference),
    )


@app.get("/v1/projects", response_model=list[ProjectResponse], tags=["v1"])
def v1_list_projects(request: Request) -> list[ProjectResponse] | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(request)
    if auth_error is not None:
        return auth_error
    return list_project_records(requesting_user_id=requesting_user_id)


@app.post("/v1/projects", response_model=ProjectResponse, tags=["v1"])
def v1_create_project(
    request: ProjectCreateRequest,
    http_request: Request,
) -> ProjectResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    return create_project_record(
        title=request.title,
        target_journal=request.target_journal,
        journal_voice=request.journal_voice,
        language=request.language,
        study_type=request.study_type,
        study_brief=request.study_brief,
        owner_user_id=requesting_user_id,
        collaborator_user_ids=request.collaborator_user_ids,
        workspace_id=request.workspace_id,
    )


@app.get(
    "/v1/projects/{project_id}/manuscripts",
    response_model=list[ManuscriptResponse],
    responses=NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_list_manuscripts(
    project_id: str,
    request: Request,
) -> list[ManuscriptResponse] | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(request)
    if auth_error is not None:
        return auth_error
    try:
        return list_project_manuscripts(
            project_id, requesting_user_id=requesting_user_id
        )
    except ProjectNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/projects/{project_id}/manuscripts",
    response_model=ManuscriptResponse,
    responses=NOT_FOUND_RESPONSES | CONFLICT_RESPONSES,
    tags=["v1"],
)
def v1_create_manuscript(
    project_id: str,
    request: ManuscriptCreateRequest,
    http_request: Request,
) -> ManuscriptResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        return create_manuscript_for_project(
            project_id=project_id,
            branch_name=request.branch_name,
            sections=request.sections,
            requesting_user_id=requesting_user_id,
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
    project_id: str,
    manuscript_id: str,
    request: Request,
) -> ManuscriptResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(request)
    if auth_error is not None:
        return auth_error
    try:
        return get_project_manuscript(
            project_id,
            manuscript_id,
            requesting_user_id=requesting_user_id,
        )
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
    http_request: Request,
) -> ManuscriptResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        return update_project_manuscript_sections(
            project_id=project_id,
            manuscript_id=manuscript_id,
            sections=request.sections,
            requesting_user_id=requesting_user_id,
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
    project_id: str,
    manuscript_id: str,
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
) -> list[ManuscriptSnapshotResponse] | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(request)
    if auth_error is not None:
        return auth_error
    try:
        snapshots = list_manuscript_snapshots(
            project_id=project_id,
            manuscript_id=manuscript_id,
            limit=limit,
            requesting_user_id=requesting_user_id,
        )
        return [
            ManuscriptSnapshotResponse.model_validate(snapshot)
            for snapshot in snapshots
        ]
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
    http_request: Request,
) -> ManuscriptSnapshotResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        snapshot = create_manuscript_snapshot(
            project_id=project_id,
            manuscript_id=manuscript_id,
            label=request.label,
            include_sections=request.include_sections,
            requesting_user_id=requesting_user_id,
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
    http_request: Request,
    request: ManuscriptSnapshotRestoreRequest | None = None,
) -> ManuscriptResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        restore_request = request or ManuscriptSnapshotRestoreRequest()
        manuscript = restore_manuscript_snapshot(
            project_id=project_id,
            manuscript_id=manuscript_id,
            snapshot_id=snapshot_id,
            restore_mode=restore_request.mode,
            sections=restore_request.sections,
            requesting_user_id=requesting_user_id,
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
    request: Request,
    include_empty: bool = Query(default=False),
) -> PlainTextResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(request)
    if auth_error is not None:
        return auth_error
    try:
        filename, markdown = export_project_manuscript_markdown(
            project_id=project_id,
            manuscript_id=manuscript_id,
            include_empty_sections=include_empty,
            requesting_user_id=requesting_user_id,
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
    http_request: Request,
) -> PlainTextResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
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
            requesting_user_id=requesting_user_id,
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
    http_request: Request,
) -> GenerationJobResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        get_project_manuscript(
            project_id,
            manuscript_id,
            requesting_user_id=requesting_user_id,
        )
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
    project_id: str,
    manuscript_id: str,
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
) -> list[GenerationJobResponse] | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(request)
    if auth_error is not None:
        return auth_error
    try:
        get_project_manuscript(
            project_id,
            manuscript_id,
            requesting_user_id=requesting_user_id,
        )
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
def v1_get_generation_job(
    job_id: str, request: Request
) -> GenerationJobResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(request)
    if auth_error is not None:
        return auth_error
    try:
        job = get_generation_job_record(
            job_id, requesting_user_id=requesting_user_id
        )
        return GenerationJobResponse(**serialize_generation_job(job))
    except GenerationJobNotFoundError as exc:
        return _build_not_found_response(str(exc))


@app.post(
    "/v1/generation-jobs/{job_id}/cancel",
    response_model=GenerationJobResponse,
    responses=NOT_FOUND_RESPONSES | CONFLICT_RESPONSES,
    tags=["v1"],
)
def v1_cancel_generation_job(
    job_id: str, request: Request
) -> GenerationJobResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(request)
    if auth_error is not None:
        return auth_error
    try:
        job = cancel_generation_job(
            job_id, requesting_user_id=requesting_user_id
        )
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
    job_id: str,
    request: GenerationJobRetryRequest,
    http_request: Request,
) -> GenerationJobResponse | JSONResponse:
    requesting_user_id, auth_error = _resolve_request_user_optional(http_request)
    if auth_error is not None:
        return auth_error
    try:
        job = retry_generation_job(
            job_id,
            max_estimated_cost_usd=request.max_estimated_cost_usd,
            project_daily_budget_usd=request.project_daily_budget_usd,
            requesting_user_id=requesting_user_id,
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


@app.get("/health/ready", response_model=dict[str, str])
def health_ready_check() -> dict[str, str] | JSONResponse:
    return v1_readiness_check()


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

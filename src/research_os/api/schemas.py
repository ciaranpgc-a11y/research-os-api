from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: str


class DraftMethodsRequest(BaseModel):
    notes: str


class DraftMethodsSuccessResponse(BaseModel):
    methods: str


class DraftSectionRequest(BaseModel):
    section: str
    notes: str


class DraftSectionSuccessResponse(BaseModel):
    section: str
    draft: str


class ErrorDetail(BaseModel):
    message: str
    type: str
    detail: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class JournalOptionResponse(BaseModel):
    slug: str
    display_name: str
    default_voice: str


class ProjectCreateRequest(BaseModel):
    title: str
    target_journal: str
    journal_voice: str | None = None
    language: str = "en-GB"
    study_type: str | None = None
    study_brief: str | None = None
    workspace_id: str | None = None
    collaborator_user_ids: list[str] = Field(default_factory=list)


class ProjectResponse(BaseModel):
    id: str
    owner_user_id: str | None = None
    collaborator_user_ids: list[str] = Field(default_factory=list)
    workspace_id: str | None = None
    title: str
    target_journal: str
    journal_voice: str | None = None
    language: str
    study_type: str | None = None
    study_brief: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ManuscriptCreateRequest(BaseModel):
    branch_name: str = "main"
    sections: list[str] | None = None


class ManuscriptSectionsUpdateRequest(BaseModel):
    sections: dict[str, str] = Field(default_factory=dict)


class ManuscriptSnapshotCreateRequest(BaseModel):
    label: str | None = None
    include_sections: list[str] | None = None


class ManuscriptSnapshotRestoreRequest(BaseModel):
    mode: str = "replace"
    sections: list[str] | None = None


class ManuscriptGenerateRequest(BaseModel):
    sections: list[str] | None = None
    notes_context: str
    max_estimated_cost_usd: float | None = None
    project_daily_budget_usd: float | None = None


class GenerationJobRetryRequest(BaseModel):
    max_estimated_cost_usd: float | None = None
    project_daily_budget_usd: float | None = None


class ManuscriptResponse(BaseModel):
    id: str
    project_id: str
    branch_name: str
    status: str
    sections: dict[str, str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ManuscriptSnapshotResponse(BaseModel):
    id: str
    project_id: str
    manuscript_id: str
    label: str
    sections: dict[str, str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WizardQuestionResponse(BaseModel):
    id: str
    label: str
    kind: str
    required: bool
    options: list[str] | None = None


class WizardInferRequest(BaseModel):
    target_journal: str
    answers: dict[str, str] = Field(default_factory=dict)


class WizardInferResponse(BaseModel):
    target_journal: str
    journal_voice: str
    inferred_study_type: str
    inferred_primary_endpoint_type: str
    recommended_sections: list[str]
    answered_fields: list[str]
    next_questions: list[WizardQuestionResponse]


class WizardBootstrapRequest(BaseModel):
    title: str
    target_journal: str
    answers: dict[str, str] = Field(default_factory=dict)
    journal_voice: str | None = None
    language: str = "en-GB"
    branch_name: str = "main"
    workspace_id: str | None = None
    collaborator_names: list[str] = Field(default_factory=list)


class WizardBootstrapResponse(BaseModel):
    project: ProjectResponse
    manuscript: ManuscriptResponse
    inference: WizardInferResponse


class GenerationJobResponse(BaseModel):
    id: str
    project_id: str
    manuscript_id: str
    status: str
    cancel_requested: bool = False
    run_count: int = 1
    parent_job_id: str | None = None
    sections: list[str]
    notes_context: str
    progress_percent: int
    current_section: str | None = None
    error_detail: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    pricing_model: str
    estimated_input_tokens: int
    estimated_output_tokens_low: int
    estimated_output_tokens_high: int
    estimated_cost_usd_low: float
    estimated_cost_usd_high: float

    model_config = ConfigDict(from_attributes=True)


class InsightEvidenceResponse(BaseModel):
    id: str
    label: str
    source: str
    confidence: str | None = None


class InsightDerivationResponse(BaseModel):
    dataset: str
    population_filter: str
    model: str
    covariates: list[str] = Field(default_factory=list)
    validation_checks: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class SelectionInsightResponse(BaseModel):
    selection_type: Literal["claim", "result", "qc"]
    item_id: str
    title: str
    summary: str
    evidence: list[InsightEvidenceResponse] = Field(default_factory=list)
    qc: list[str] = Field(default_factory=list)
    derivation: InsightDerivationResponse
    citations: list[str] = Field(default_factory=list)


class QCIssueSummaryResponse(BaseModel):
    id: str
    category: str
    severity: Literal["high", "medium", "low"]
    count: int
    summary: str


class QCRunResponse(BaseModel):
    run_id: str
    generated_at: datetime
    total_findings: int
    high_severity_count: int
    medium_severity_count: int
    low_severity_count: int
    issues: list[QCIssueSummaryResponse] = Field(default_factory=list)


class CitationRecordResponse(BaseModel):
    id: str
    title: str
    authors: str
    journal: str
    year: int
    doi: str
    url: str
    citation_text: str


class ClaimCitationStateResponse(BaseModel):
    claim_id: str
    required_slots: int
    attached_citation_ids: list[str] = Field(default_factory=list)
    attached_citations: list[CitationRecordResponse] = Field(default_factory=list)
    missing_slots: int


class ClaimCitationUpdateRequest(BaseModel):
    citation_ids: list[str] = Field(default_factory=list)
    required_slots: int = 0


class CitationExportRequest(BaseModel):
    citation_ids: list[str] | None = None
    claim_id: str | None = None


class GenerationEstimateRequest(BaseModel):
    sections: list[str] | None = None
    notes_context: str
    model: str | None = None


class GenerationEstimateResponse(BaseModel):
    pricing_model: str
    estimated_input_tokens: int
    estimated_output_tokens_low: int
    estimated_output_tokens_high: int
    estimated_cost_usd_low: float
    estimated_cost_usd_high: float


class SectionPlanRequest(BaseModel):
    target_journal: str = "generic-original"
    answers: dict[str, str] = Field(default_factory=dict)
    sections: list[str] | None = None


class SectionPlanItemResponse(BaseModel):
    section: str
    objective: str
    must_include: list[str] = Field(default_factory=list)
    evidence_expectations: list[str] = Field(default_factory=list)
    qc_focus: list[str] = Field(default_factory=list)
    target_words_low: int
    target_words_high: int
    estimated_cost_usd_low: float
    estimated_cost_usd_high: float


class SectionPlanResponse(BaseModel):
    inferred_study_type: str
    inferred_primary_endpoint_type: str
    recommended_sections: list[str] = Field(default_factory=list)
    items: list[SectionPlanItemResponse] = Field(default_factory=list)
    total_estimated_cost_usd_low: float
    total_estimated_cost_usd_high: float


class PlanClarificationQuestionResponse(BaseModel):
    id: str
    prompt: str
    rationale: str


class PlanClarificationHistoryItemRequest(BaseModel):
    prompt: str
    answer: Literal["yes", "no"]
    comment: str = ""


class PlanClarificationQuestionsRequest(BaseModel):
    project_title: str = ""
    target_journal: str = ""
    target_journal_label: str = ""
    research_category: str = ""
    study_type: str = ""
    interpretation_mode: str = ""
    article_type: str = ""
    word_length: str = ""
    summary_of_research: str = ""
    model: str | None = None


class PlanClarificationQuestionsResponse(BaseModel):
    questions: list[PlanClarificationQuestionResponse] = Field(default_factory=list)
    model_used: str


class PlanClarificationNextQuestionRequest(BaseModel):
    project_title: str = ""
    target_journal: str = ""
    target_journal_label: str = ""
    research_category: str = ""
    study_type: str = ""
    interpretation_mode: str = ""
    article_type: str = ""
    word_length: str = ""
    summary_of_research: str = ""
    study_type_options: list[str] = Field(default_factory=list)
    data_profile_json: dict[str, Any] | None = None
    profile_unresolved_questions: list[str] = Field(default_factory=list)
    use_profile_tailoring: bool = False
    history: list[PlanClarificationHistoryItemRequest] = Field(default_factory=list)
    max_questions: int = 10
    force_next_question: bool = False
    model: str | None = None


class PlanClarificationFieldUpdatesResponse(BaseModel):
    summary_of_research: str = ""
    research_category: str = ""
    study_type: str = ""
    interpretation_mode: str = ""
    article_type: str = ""
    word_length: str = ""


class PlanManuscriptSectionsResponse(BaseModel):
    introduction: str = ""
    methods: str = ""
    results: str = ""
    discussion: str = ""


class PlanClarificationNextQuestionResponse(BaseModel):
    question: PlanClarificationQuestionResponse | None = None
    completed: bool
    ready_for_plan: bool
    confidence_percent: int = Field(default=0, ge=0, le=100)
    additional_questions_for_full_confidence: int = Field(default=0, ge=0)
    advice: str = ""
    updated_fields: PlanClarificationFieldUpdatesResponse | None = None
    manuscript_plan_summary: str = ""
    manuscript_plan_sections: PlanManuscriptSectionsResponse = Field(
        default_factory=PlanManuscriptSectionsResponse
    )
    asked_count: int
    max_questions: int
    model_used: str


class PlanSectionEditRequest(BaseModel):
    section: Literal["introduction", "methods", "results", "discussion"]
    section_text: str = ""
    edit_instruction: str = ""
    selected_text: str = ""
    project_title: str = ""
    target_journal_label: str = ""
    research_category: str = ""
    study_type: str = ""
    interpretation_mode: str = ""
    article_type: str = ""
    word_length: str = ""
    summary_of_research: str = ""
    model: str | None = None


class PlanSectionEditResponse(BaseModel):
    section: Literal["introduction", "methods", "results", "discussion"]
    updated_section_text: str
    applied_to_selection: bool = False
    model_used: str = ""


class LibraryAssetUploadResponse(BaseModel):
    asset_ids: list[str] = Field(default_factory=list)


class LibraryAssetAccessMemberResponse(BaseModel):
    user_id: str
    name: str


class LibraryAssetResponse(BaseModel):
    id: str
    owner_user_id: str | None = None
    owner_name: str | None = None
    project_id: str | None = None
    filename: str
    kind: str
    mime_type: str | None = None
    byte_size: int = 0
    uploaded_at: datetime
    shared_with_user_ids: list[str] = Field(default_factory=list)
    shared_with: list[LibraryAssetAccessMemberResponse] = Field(default_factory=list)
    can_manage_access: bool = False


class LibraryAssetListResponse(BaseModel):
    items: list[LibraryAssetResponse] = Field(default_factory=list)
    page: int = 1
    page_size: int = 50
    total: int = 0
    has_more: bool = False
    sort_by: Literal["uploaded_at", "filename", "byte_size", "kind", "owner_name"] = (
        "uploaded_at"
    )
    sort_direction: Literal["asc", "desc"] = "desc"
    query: str = ""
    ownership: Literal["all", "owned", "shared"] = "all"


class LibraryAssetAccessUpdateRequest(BaseModel):
    collaborator_user_ids: list[str] = Field(default_factory=list)
    collaborator_names: list[str] = Field(default_factory=list)


class ManuscriptAttachAssetsRequest(BaseModel):
    asset_ids: list[str] = Field(default_factory=list)
    section_context: Literal["RESULTS", "TABLES", "FIGURES", "PLANNER"] = "PLANNER"


class ManuscriptAttachAssetsResponse(BaseModel):
    manuscript_id: str
    attached_asset_ids: list[str] = Field(default_factory=list)
    section_context: Literal["RESULTS", "TABLES", "FIGURES", "PLANNER"]


class DataProfileSamplingRequest(BaseModel):
    max_rows: int = 200
    max_chars: int = 20000


class DataProfileRequest(BaseModel):
    asset_ids: list[str] = Field(default_factory=list)
    sampling: DataProfileSamplingRequest = Field(
        default_factory=DataProfileSamplingRequest
    )


class DataProfileResponse(BaseModel):
    profile_id: str
    data_profile_json: dict[str, Any] = Field(default_factory=dict)
    human_summary: str = ""


class PlannerConfirmedFields(BaseModel):
    design: str = ""
    unit_of_analysis: str = ""
    primary_outcome: str = ""
    key_exposures: str = ""
    key_covariates: str = ""


class AnalysisScaffoldRequest(BaseModel):
    manuscript_id: str
    profile_id: str | None = None
    confirmed_fields: PlannerConfirmedFields = Field(
        default_factory=PlannerConfirmedFields
    )


class AnalysisScaffoldResponse(BaseModel):
    analysis_scaffold_id: str
    analysis_scaffold_json: dict[str, Any] = Field(default_factory=dict)
    human_summary: str = ""


class TablesScaffoldRequest(BaseModel):
    manuscript_id: str
    profile_id: str | None = None
    confirmed_fields: PlannerConfirmedFields = Field(
        default_factory=PlannerConfirmedFields
    )


class TablesScaffoldResponse(BaseModel):
    tables_scaffold_id: str
    tables_scaffold_json: dict[str, Any] = Field(default_factory=dict)
    human_summary: str = ""


class FiguresScaffoldRequest(BaseModel):
    manuscript_id: str
    profile_id: str | None = None
    confirmed_fields: PlannerConfirmedFields = Field(
        default_factory=PlannerConfirmedFields
    )


class FiguresScaffoldResponse(BaseModel):
    figures_scaffold_id: str
    figures_scaffold_json: dict[str, Any] = Field(default_factory=dict)
    human_summary: str = ""


class ManuscriptPlanUpdateRequest(BaseModel):
    plan_json: dict[str, Any] = Field(default_factory=dict)


class ManuscriptPlanUpdateResponse(BaseModel):
    manuscript_id: str
    plan_json: dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime


class PlanSectionImproveContextRequest(BaseModel):
    profile_id: str | None = None
    confirmed_fields: PlannerConfirmedFields = Field(
        default_factory=PlannerConfirmedFields
    )


class PlanSectionImproveRequest(BaseModel):
    section_key: str
    current_text: str = ""
    context: PlanSectionImproveContextRequest = Field(
        default_factory=PlanSectionImproveContextRequest
    )
    tool: Literal[
        "improve",
        "critique",
        "alternatives",
        "subheadings",
        "link_to_data",
        "checklist",
    ]


class PlanSectionImproveResponse(BaseModel):
    updated_text: str = ""
    suggestions: list[str] = Field(default_factory=list)
    to_confirm: list[str] = Field(default_factory=list)


class ResearchOverviewSuggestionsRequest(BaseModel):
    target_journal: str
    research_category: str = ""
    research_type: str
    study_type_options: list[str] = Field(default_factory=list)
    article_type: str = ""
    interpretation_mode: str = ""
    summary_of_research: str
    model: str | None = None


class TextRecommendationResponse(BaseModel):
    value: str
    rationale: str


class ResearchOverviewSuggestionsResponse(BaseModel):
    summary_refinements: list[str] = Field(default_factory=list)
    research_category_suggestion: TextRecommendationResponse | None = None
    research_type_suggestion: TextRecommendationResponse | None = None
    interpretation_mode_recommendation: TextRecommendationResponse | None = None
    article_type_recommendation: TextRecommendationResponse | None = None
    word_length_recommendation: TextRecommendationResponse | None = None
    guidance_suggestions: list[str] = Field(default_factory=list)
    source_urls: list[str] = Field(default_factory=list)
    model_used: str


class GroundedDraftEvidenceLinkRequest(BaseModel):
    claim_id: str = ""
    claim_heading: str = ""
    result_id: str = ""
    confidence: Literal["high", "medium", "low"] = "medium"
    rationale: str = ""
    suggested_anchor_label: str = ""


class GroundedDraftRequest(BaseModel):
    section: str
    notes_context: str
    style_profile: Literal["technical", "concise", "narrative_review"] = "technical"
    generation_mode: Literal["full", "targeted"] = "full"
    plan_objective: str | None = None
    must_include: list[str] = Field(default_factory=list)
    evidence_links: list[GroundedDraftEvidenceLinkRequest] = Field(default_factory=list)
    citation_ids: list[str] = Field(default_factory=list)
    target_instruction: str | None = None
    locked_text: str | None = None
    model: str | None = None
    persist_to_manuscript: bool = False
    project_id: str | None = None
    manuscript_id: str | None = None


class GroundedDraftPassResponse(BaseModel):
    name: str
    content: str


class GroundedDraftResponse(BaseModel):
    section: str
    style_profile: Literal["technical", "concise", "narrative_review"]
    generation_mode: Literal["full", "targeted"]
    draft: str
    passes: list[GroundedDraftPassResponse] = Field(default_factory=list)
    evidence_anchor_labels: list[str] = Field(default_factory=list)
    citation_ids: list[str] = Field(default_factory=list)
    unsupported_sentences: list[str] = Field(default_factory=list)
    persisted: bool = False
    manuscript: ManuscriptResponse | None = None


class TitleAbstractSynthesisRequest(BaseModel):
    style_profile: Literal["technical", "concise", "narrative_review"] = "technical"
    max_abstract_words: int = 250
    model: str | None = None
    persist_to_manuscript: bool = True


class TitleAbstractSynthesisResponse(BaseModel):
    title: str
    abstract: str
    style_profile: Literal["technical", "concise", "narrative_review"]
    persisted: bool
    manuscript: ManuscriptResponse | None = None


class ConsistencyCheckRequest(BaseModel):
    include_low_severity: bool = True


class ConsistencyIssueResponse(BaseModel):
    id: str
    severity: Literal["high", "medium", "low"]
    type: str
    summary: str
    suggested_fix: str
    sections: list[str] = Field(default_factory=list)


class ConsistencyCheckResponse(BaseModel):
    run_id: str
    generated_at: datetime
    total_issues: int
    high_severity_count: int
    medium_severity_count: int
    low_severity_count: int
    issues: list[ConsistencyIssueResponse] = Field(default_factory=list)


class ParagraphRegenerationRequest(BaseModel):
    paragraph_index: int = 0
    notes_context: str
    constraints: list[
        Literal["shorter", "more_cautious", "journal_tone", "keep_stats_unchanged"]
    ] = Field(default_factory=list)
    freeform_instruction: str | None = None
    evidence_links: list[GroundedDraftEvidenceLinkRequest] = Field(default_factory=list)
    citation_ids: list[str] = Field(default_factory=list)
    model: str | None = None
    persist_to_manuscript: bool = True


class ParagraphRegenerationResponse(BaseModel):
    section: str
    paragraph_index: int
    constraints: list[
        Literal["shorter", "more_cautious", "journal_tone", "keep_stats_unchanged"]
    ] = Field(default_factory=list)
    original_paragraph: str
    regenerated_paragraph: str
    updated_section_text: str
    unsupported_sentences: list[str] = Field(default_factory=list)
    persisted: bool
    manuscript: ManuscriptResponse | None = None


class CitationAutofillRequest(BaseModel):
    claim_ids: list[str] | None = None
    required_slots: int = 2
    overwrite_existing: bool = False


class CitationAutofillSuggestionResponse(BaseModel):
    citation_id: str
    confidence: Literal["high", "medium", "low"]
    reason: str


class ClaimCitationAutofillStateResponse(BaseModel):
    claim_id: str
    required_slots: int
    attached_citation_ids: list[str] = Field(default_factory=list)
    attached_citations: list[CitationRecordResponse] = Field(default_factory=list)
    missing_slots: int
    suggestions: list[CitationAutofillSuggestionResponse] = Field(default_factory=list)
    autofill_applied: bool = False


class CitationAutofillResponse(BaseModel):
    run_id: str
    generated_at: datetime
    updated_claims: list[ClaimCitationAutofillStateResponse] = Field(
        default_factory=list
    )


class SubmissionPackRequest(BaseModel):
    style_profile: Literal["technical", "concise", "narrative_review"] = "technical"
    include_plain_language_summary: bool = True
    model: str | None = None


class SubmissionPackResponse(BaseModel):
    run_id: str
    generated_at: datetime
    target_journal: str
    style_profile: Literal["technical", "concise", "narrative_review"]
    cover_letter: str
    key_points: list[str] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)
    plain_language_summary: str = ""


class ClaimLinkerRequest(BaseModel):
    claim_ids: list[str] | None = None
    min_confidence: Literal["high", "medium", "low"] = "low"


class ClaimLinkSuggestionResponse(BaseModel):
    claim_id: str
    claim_heading: str
    result_id: str
    result_type: str
    confidence: Literal["high", "medium", "low"]
    rationale: str
    suggested_anchor_label: str


class ClaimLinkerResponse(BaseModel):
    run_id: str
    generated_at: datetime
    suggestions: list[ClaimLinkSuggestionResponse] = Field(default_factory=list)


class QCGatedExportRequest(BaseModel):
    include_empty: bool = False


class ReferencePackRequest(BaseModel):
    style: Literal["vancouver", "ama"] = "vancouver"
    claim_ids: list[str] | None = None
    citation_ids: list[str] | None = None
    include_urls: bool = True


class AuthUserResponse(BaseModel):
    id: str
    email: str
    name: str
    is_active: bool
    role: Literal["user", "admin"]
    orcid_id: str | None = None
    impact_last_computed_at: datetime | None = None
    email_verified_at: datetime | None = None
    last_sign_in_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AdminUserSummaryResponse(BaseModel):
    id: str
    email: str
    name: str
    is_active: bool
    role: Literal["user", "admin"]
    email_verified_at: datetime | None = None
    last_sign_in_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AdminUsersListResponse(BaseModel):
    items: list[AdminUserSummaryResponse] = Field(default_factory=list)
    total: int = 0
    limit: int = 50
    offset: int = 0


class AdminOverviewResponse(BaseModel):
    total_users: int = 0
    active_users: int = 0
    inactive_users: int = 0
    admin_users: int = 0
    recent_signins_24h: int = 0
    generated_at: datetime


class AffiliationSuggestionItemResponse(BaseModel):
    name: str
    label: str
    country_code: str | None = None
    country_name: str | None = None
    city: str | None = None
    region: str | None = None
    address: str | None = None
    postal_code: str | None = None
    source: Literal["openalex", "ror", "openstreetmap", "clearbit"]


class AffiliationSuggestionsResponse(BaseModel):
    query: str
    limit: int
    items: list[AffiliationSuggestionItemResponse] = Field(default_factory=list)


class AffiliationAddressResolutionResponse(BaseModel):
    resolved: bool
    name: str
    line_1: str | None = None
    city: str | None = None
    region: str | None = None
    postal_code: str | None = None
    country_name: str | None = None
    country_code: str | None = None
    formatted: str | None = None
    source: Literal["openstreetmap"] | None = None


class AuthRegisterRequest(BaseModel):
    email: str
    password: str
    name: str


class AuthLoginRequest(BaseModel):
    email: str
    password: str


class AuthLoginChallengeRequest(BaseModel):
    email: str
    password: str


class AuthSessionResponse(BaseModel):
    user: AuthUserResponse
    session_token: str
    session_expires_at: datetime


class AuthLoginChallengeResponse(BaseModel):
    status: Literal["authenticated", "two_factor_required"]
    session: AuthSessionResponse | None = None
    challenge_token: str | None = None
    challenge_expires_at: datetime | None = None
    user_hint: dict[str, str] = Field(default_factory=dict)


class AuthLoginVerifyTwoFactorRequest(BaseModel):
    challenge_token: str
    code: str


class AuthLogoutResponse(BaseModel):
    success: bool = True


class AuthMeUpdateRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None


class AuthDeleteAccountRequest(BaseModel):
    confirm_phrase: str


class AuthDeleteAccountResponse(BaseModel):
    success: bool = True


class AuthTwoFactorStateResponse(BaseModel):
    enabled: bool
    backup_codes_remaining: int
    confirmed_at: datetime | None = None


class AuthTwoFactorSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str
    backup_codes: list[str] = Field(default_factory=list)


class AuthTwoFactorEnableRequest(BaseModel):
    secret: str
    code: str
    backup_codes: list[str] = Field(default_factory=list)


class AuthTwoFactorDisableRequest(BaseModel):
    code: str


class AuthOAuthConnectResponse(BaseModel):
    provider: Literal["orcid", "google", "microsoft"]
    state: str
    url: str


class AuthOAuthProviderStatusItemResponse(BaseModel):
    provider: Literal["orcid", "google", "microsoft"]
    configured: bool
    reason: str = ""


class AuthOAuthProviderStatusesResponse(BaseModel):
    providers: list[AuthOAuthProviderStatusItemResponse] = Field(default_factory=list)


class AuthOAuthCallbackRequest(BaseModel):
    provider: Literal["orcid", "google", "microsoft"]
    state: str
    code: str


class AuthOAuthCallbackResponse(BaseModel):
    provider: Literal["orcid", "google", "microsoft"]
    is_new_user: bool = False
    user: AuthUserResponse
    session_token: str
    session_expires_at: datetime


class AuthEmailVerificationRequestResponse(BaseModel):
    requested: bool
    already_verified: bool = False
    expires_at: datetime | None = None
    delivery_hint: str = ""
    code_preview: str | None = None


class AuthEmailVerificationConfirmRequest(BaseModel):
    code: str


class AuthPasswordResetRequestRequest(BaseModel):
    email: str


class AuthPasswordResetRequestResponse(BaseModel):
    requested: bool
    expires_at: datetime | None = None
    delivery_hint: str = ""
    code_preview: str | None = None


class AuthPasswordResetConfirmRequest(BaseModel):
    email: str
    code: str
    new_password: str


class AuthPasswordResetConfirmResponse(BaseModel):
    success: bool


class OrcidConnectResponse(BaseModel):
    url: str
    state: str


class OrcidCallbackResponse(BaseModel):
    connected: bool
    user_id: str
    orcid_id: str


class OrcidStatusResponse(BaseModel):
    configured: bool
    linked: bool
    orcid_id: str | None = None
    redirect_uri: str
    can_import: bool
    issues: list[str] = Field(default_factory=list)


class PersonaImportOrcidRequest(BaseModel):
    overwrite_user_metadata: bool = False


class PersonaImportOrcidResponse(BaseModel):
    imported_count: int
    work_ids: list[str] = Field(default_factory=list)
    provenance: str
    last_synced_at: datetime
    core_collaborators: list[dict[str, Any]] = Field(default_factory=list)


class PersonaSyncJobOrcidImportRequest(BaseModel):
    overwrite_user_metadata: bool = False
    run_metrics_sync: bool = True
    providers: list[Literal["openalex", "semantic_scholar", "manual"]] = Field(
        default_factory=lambda: ["openalex", "semantic_scholar"]
    )
    refresh_analytics: bool = True
    refresh_metrics: bool = True


class PersonaSyncJobMetricsRequest(BaseModel):
    providers: list[Literal["openalex", "semantic_scholar", "manual"]] = Field(
        default_factory=lambda: ["openalex"]
    )
    refresh_analytics: bool = True
    refresh_metrics: bool = False


class PersonaSyncJobResponse(BaseModel):
    id: str
    user_id: str
    job_type: str
    status: str
    overwrite_user_metadata: bool = False
    run_metrics_sync: bool = False
    refresh_analytics: bool = True
    refresh_metrics: bool = False
    providers: list[str] = Field(default_factory=list)
    progress_percent: int = 0
    current_stage: str | None = None
    result_json: dict[str, Any] = Field(default_factory=dict)
    error_detail: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PersonaWorkResponse(BaseModel):
    id: str
    title: str
    year: int | None = None
    doi: str | None = None
    work_type: str
    venue_name: str
    publisher: str
    abstract: str | None = None
    keywords: list[str] = Field(default_factory=list)
    url: str
    provenance: str
    cluster_id: str | None = None
    authors: list[str] = Field(default_factory=list)
    user_author_position: int | None = None
    author_count: int | None = None
    pmid: str | None = None
    journal_impact_factor: float | None = None
    created_at: datetime
    updated_at: datetime


class PersonaMetricsSyncRequest(BaseModel):
    providers: list[Literal["openalex", "semantic_scholar", "manual"]] = Field(
        default_factory=lambda: ["openalex", "semantic_scholar", "manual"]
    )


class PersonaMetricsSyncResponse(BaseModel):
    synced_snapshots: int
    provider_attribution: dict[str, int] = Field(default_factory=dict)
    core_collaborators: list[dict[str, Any]] = Field(default_factory=list)


class PersonaOpenAccessDiscoverRequest(BaseModel):
    work_ids: list[str] = Field(default_factory=list)
    include_pdf_upload: bool = False
    project_id: str | None = None
    max_items: int = Field(default=200, ge=1, le=1000)


class PersonaOpenAccessRecordResponse(BaseModel):
    work_id: str
    title: str
    doi: str | None = None
    is_open_access: bool = False
    source: str = "openalex"
    open_access_url: str | None = None
    pdf_url: str | None = None
    pdf_asset_id: str | None = None
    status: str
    note: str | None = None


class PersonaOpenAccessDiscoverResponse(BaseModel):
    checked_count: int = 0
    open_access_count: int = 0
    uploaded_pdf_count: int = 0
    records: list[PersonaOpenAccessRecordResponse] = Field(default_factory=list)


class PublicationsAnalyticsSummaryResponse(BaseModel):
    total_citations: int = 0
    h_index: int = 0
    citation_velocity_12m: float = 0.0
    citations_last_12_months: int = 0
    citations_previous_12_months: int = 0
    citations_per_month_12m: float = 0.0
    citations_per_month_previous_12m: float = 0.0
    acceleration_citations_per_month: float = 0.0
    yoy_percent: float | None = None
    yoy_pct: float | None = None
    citations_ytd: int = 0
    ytd_year: int | None = None
    cagr_3y: float | None = None
    slope_3y: float | None = None
    top5_share_12m_pct: float = 0.0
    top10_share_12m_pct: float = 0.0
    computed_at: datetime


class PublicationsAnalyticsTimePointResponse(BaseModel):
    year: int
    citations_added: int = 0
    total_citations_end_year: int = 0


class PublicationsAnalyticsTimeseriesResponse(BaseModel):
    computed_at: datetime
    points: list[PublicationsAnalyticsTimePointResponse] = Field(default_factory=list)


class PublicationsAnalyticsDriverResponse(BaseModel):
    work_id: str
    title: str
    year: int | None = None
    doi: str | None = None
    citations_last_12_months: int = 0
    current_citations: int = 0
    provider: str = "none"
    share_12m_pct: float = 0.0
    primary_domain_label: str = "General"
    momentum_badge: str = "steady"


class PublicationsAnalyticsTopDriversResponse(BaseModel):
    computed_at: datetime
    window: str = "last_12_months"
    drivers: list[PublicationsAnalyticsDriverResponse] = Field(default_factory=list)


class PublicationsAnalyticsDomainBreakdownResponse(BaseModel):
    label: str
    citations_last_12_months: int = 0
    share_12m_pct: float = 0.0
    works_count: int = 0


class PublicationsAnalyticsPayloadResponse(BaseModel):
    schema_version: int = 0
    computed_at: datetime | None = None
    summary: PublicationsAnalyticsSummaryResponse
    timeseries: PublicationsAnalyticsTimeseriesResponse
    top_drivers: PublicationsAnalyticsTopDriversResponse
    per_year: list[dict[str, Any]] = Field(default_factory=list)
    domain_breakdown_12m: list[PublicationsAnalyticsDomainBreakdownResponse] = Field(
        default_factory=list
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class PublicationsAnalyticsResponse(BaseModel):
    payload: PublicationsAnalyticsPayloadResponse
    computed_at: datetime | None = None
    status: Literal["READY", "RUNNING", "FAILED"] = "RUNNING"
    is_stale: bool = False
    is_updating: bool = False
    last_update_failed: bool = False


class PublicationMetricDrilldownResponse(BaseModel):
    title: str
    definition: str
    formula: str
    confidence_note: str
    publications: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PublicationMetricTileResponse(BaseModel):
    id: str = ""
    key: str
    label: str
    main_value: float | int | None = None
    value: float | int | None = None
    main_value_display: str = ""
    value_display: str
    delta_value: float | int | None = None
    delta_display: str | None = None
    delta_direction: Literal["up", "down", "flat", "na"] = "na"
    delta_tone: Literal["positive", "neutral", "caution", "negative"] = "neutral"
    delta_color_code: str = "#475569"
    unit: str | None = None
    subtext: str = ""
    badge: dict[str, Any] = Field(default_factory=dict)
    chart_type: str = "line"
    chart_data: dict[str, Any] = Field(default_factory=dict)
    sparkline: list[float] = Field(default_factory=list)
    sparkline_overlay: list[float] = Field(default_factory=list)
    tooltip: str = ""
    tooltip_details: dict[str, Any] = Field(default_factory=dict)
    data_source: list[str] = Field(default_factory=list)
    confidence_score: float = 0.0
    stability: Literal["stable", "unstable"] = "stable"
    drilldown: PublicationMetricDrilldownResponse


class PublicationsTopMetricsResponse(BaseModel):
    tiles: list[PublicationMetricTileResponse] = Field(default_factory=list)
    data_sources: list[str] = Field(default_factory=list)
    data_last_refreshed: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    computed_at: datetime | None = None
    status: Literal["READY", "RUNNING", "FAILED"] = "RUNNING"
    is_stale: bool = False
    is_updating: bool = False
    last_error: str | None = None


class PublicationMetricDetailResponse(BaseModel):
    metric_id: str
    tile: PublicationMetricTileResponse
    data_sources: list[str] = Field(default_factory=list)
    data_last_refreshed: str | None = None
    computed_at: datetime | None = None
    status: Literal["READY", "RUNNING", "FAILED"] = "RUNNING"
    is_stale: bool = False
    is_updating: bool = False
    last_error: str | None = None


class PublicationsTopMetricsRefreshResponse(BaseModel):
    enqueued: bool = False
    status: Literal["READY", "RUNNING", "FAILED"] = "RUNNING"
    metric_key: str = "top_metrics_strip_v1"


class PublicationDetailResponse(BaseModel):
    id: str
    title: str
    year: int | None = None
    journal: str = "Not available"
    publication_type: str = "Not available"
    citations_total: int = 0
    doi: str | None = None
    pmid: str | None = None
    openalex_work_id: str | None = None
    abstract: str | None = None
    keywords_json: list[str] = Field(default_factory=list)
    authors_json: list[dict[str, Any]] = Field(default_factory=list)
    affiliations_json: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PublicationAuthorsResponse(BaseModel):
    status: Literal["READY", "RUNNING", "FAILED"] = "READY"
    authors_json: list[dict[str, Any]] = Field(default_factory=list)
    affiliations_json: list[dict[str, Any]] = Field(default_factory=list)
    computed_at: datetime | None = None
    is_stale: bool = False
    is_updating: bool = False
    last_error: str | None = None


class PublicationImpactSeriesPointResponse(BaseModel):
    year: int
    citations: int = 0
    yoy_delta: int | None = None
    yoy_pct: float | None = None


class PublicationImpactPortfolioContextResponse(BaseModel):
    paper_share_total_pct: float = 0.0
    paper_share_12m_pct: float = 0.0
    portfolio_rank_total: int | None = None
    portfolio_rank_12m: int | None = None


class PublicationImpactNamedCountResponse(BaseModel):
    name: str
    count: int = 0


class PublicationImpactCitingPaperResponse(BaseModel):
    title: str
    year: int | None = None
    journal: str = "Not available"
    doi: str | None = None
    pmid: str | None = None
    citations_total: int = 0


class PublicationImpactPayloadResponse(BaseModel):
    citations_total: int = 0
    citations_last_12m: int = 0
    citations_prev_12m: int = 0
    yoy_pct: float | None = None
    acceleration_citations_per_month: float = 0.0
    per_year: list[PublicationImpactSeriesPointResponse] = Field(default_factory=list)
    portfolio_context: PublicationImpactPortfolioContextResponse = Field(
        default_factory=PublicationImpactPortfolioContextResponse
    )
    top_citing_journals: list[PublicationImpactNamedCountResponse] = Field(
        default_factory=list
    )
    top_citing_countries: list[PublicationImpactNamedCountResponse] = Field(
        default_factory=list
    )
    key_citing_papers: list[PublicationImpactCitingPaperResponse] = Field(
        default_factory=list
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class PublicationImpactResponse(BaseModel):
    payload: PublicationImpactPayloadResponse
    computed_at: datetime | None = None
    status: Literal["READY", "RUNNING", "FAILED"] = "RUNNING"
    is_stale: bool = False
    is_updating: bool = False
    last_error: str | None = None


class PublicationAiExtractiveKeyPointsResponse(BaseModel):
    objective: str = "Not stated in abstract."
    methods: str = "Not stated in abstract."
    main_findings: str = "Not stated in abstract."
    conclusion: str = "Not stated in abstract."


class PublicationAiPayloadResponse(BaseModel):
    label: str = "AI-generated draft insights"
    performance_summary: str = ""
    trajectory_classification: Literal[
        "EARLY_SPIKE",
        "SLOW_BURN",
        "CONSISTENT",
        "DECLINING",
        "ACCELERATING",
        "UNKNOWN",
    ] = "UNKNOWN"
    extractive_key_points: PublicationAiExtractiveKeyPointsResponse = Field(
        default_factory=PublicationAiExtractiveKeyPointsResponse
    )
    reuse_suggestions: list[str] = Field(default_factory=list)
    caution_flags: list[str] = Field(default_factory=list)


class PublicationAiInsightsResponse(BaseModel):
    payload: PublicationAiPayloadResponse
    computed_at: datetime | None = None
    status: Literal["READY", "RUNNING", "FAILED"] = "RUNNING"
    is_stale: bool = False
    is_updating: bool = False
    last_error: str | None = None


class PublicationFileResponse(BaseModel):
    id: str
    file_name: str
    file_type: Literal["PDF", "DOCX", "OTHER"] = "OTHER"
    source: Literal["OA_LINK", "USER_UPLOAD"] = "USER_UPLOAD"
    oa_url: str | None = None
    checksum: str | None = None
    created_at: datetime
    download_url: str | None = None


class PublicationFilesListResponse(BaseModel):
    items: list[PublicationFileResponse] = Field(default_factory=list)


class PublicationFileLinkResponse(BaseModel):
    created: bool = False
    file: PublicationFileResponse | None = None
    message: str = ""


class PublicationFileDeleteResponse(BaseModel):
    deleted: bool = False


class CollaboratorMetricsResponse(BaseModel):
    coauthored_works_count: int = 0
    shared_citations_total: int = 0
    first_collaboration_year: int | None = None
    last_collaboration_year: int | None = None
    citations_last_12m: int = 0
    collaboration_strength_score: float = 0.0
    classification: Literal[
        "CORE", "ACTIVE", "OCCASIONAL", "HISTORIC", "UNCLASSIFIED"
    ] = "UNCLASSIFIED"
    computed_at: datetime | None = None
    status: Literal["READY", "RUNNING", "FAILED"] = "READY"


class CollaboratorResponse(BaseModel):
    id: str
    owner_user_id: str
    full_name: str
    preferred_name: str | None = None
    email: str | None = None
    orcid_id: str | None = None
    openalex_author_id: str | None = None
    primary_institution: str | None = None
    department: str | None = None
    country: str | None = None
    current_position: str | None = None
    research_domains: list[str] = Field(default_factory=list)
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    metrics: CollaboratorMetricsResponse
    duplicate_warnings: list[str] = Field(default_factory=list)


class CollaboratorCreateRequest(BaseModel):
    full_name: str
    preferred_name: str | None = None
    email: str | None = None
    orcid_id: str | None = None
    openalex_author_id: str | None = None
    primary_institution: str | None = None
    department: str | None = None
    country: str | None = None
    current_position: str | None = None
    research_domains: list[str] = Field(default_factory=list)
    notes: str | None = None


class CollaboratorUpdateRequest(BaseModel):
    full_name: str | None = None
    preferred_name: str | None = None
    email: str | None = None
    orcid_id: str | None = None
    openalex_author_id: str | None = None
    primary_institution: str | None = None
    department: str | None = None
    country: str | None = None
    current_position: str | None = None
    research_domains: list[str] | None = None
    notes: str | None = None


class CollaboratorsListResponse(BaseModel):
    items: list[CollaboratorResponse] = Field(default_factory=list)
    page: int = 1
    page_size: int = 50
    total: int = 0
    has_more: bool = False


class CollaboratorDeleteResponse(BaseModel):
    deleted: bool = False


class CollaborationMetricsSummaryResponse(BaseModel):
    total_collaborators: int = 0
    core_collaborators: int = 0
    active_collaborations_12m: int = 0
    new_collaborators_12m: int = 0
    last_computed_at: datetime | None = None
    status: Literal["READY", "RUNNING", "FAILED"] = "READY"
    is_stale: bool = False
    is_updating: bool = False
    last_update_failed: bool = False


class CollaborationMetricsRecomputeResponse(BaseModel):
    enqueued: bool = False


class CollaborationImportOpenAlexResponse(BaseModel):
    created_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    openalex_author_id: str | None = None
    imported_candidates: int = 0


class CollaborationEnrichOpenAlexRequest(BaseModel):
    only_missing: bool = True
    limit: int = 200


class CollaborationEnrichOpenAlexResponse(BaseModel):
    targeted_count: int = 0
    resolved_author_count: int = 0
    updated_count: int = 0
    unchanged_count: int = 0
    skipped_without_identifier: int = 0
    failed_count: int = 0
    enqueued_metrics_recompute: bool = False
    field_updates: dict[str, int] = Field(default_factory=dict)


class CollaborationAiInsightsResponse(BaseModel):
    status: Literal["draft"] = "draft"
    insights: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)
    provenance: dict[str, Any] = Field(default_factory=dict)


class CollaborationAiAuthorSuggestionsRequest(BaseModel):
    topic_keywords: list[str] = Field(default_factory=list)
    methods: list[str] = Field(default_factory=list)
    limit: int = 5


class CollaborationAiAuthorSuggestionItemResponse(BaseModel):
    collaborator_id: str
    full_name: str
    institution: str | None = None
    orcid_id: str | None = None
    classification: Literal[
        "CORE", "ACTIVE", "OCCASIONAL", "HISTORIC", "UNCLASSIFIED"
    ] = "UNCLASSIFIED"
    score: float = 0.0
    explanation: str = ""
    matched_keywords: list[str] = Field(default_factory=list)
    matched_methods: list[str] = Field(default_factory=list)


class CollaborationAiAuthorSuggestionsResponse(BaseModel):
    status: Literal["draft"] = "draft"
    topic_keywords: list[str] = Field(default_factory=list)
    methods: list[str] = Field(default_factory=list)
    suggestions: list[CollaborationAiAuthorSuggestionItemResponse] = Field(
        default_factory=list
    )
    provenance: dict[str, Any] = Field(default_factory=dict)


class CollaborationAiContributionAuthorInput(BaseModel):
    full_name: str
    roles: list[str] = Field(default_factory=list)
    is_corresponding: bool = False
    equal_contribution: bool = False
    is_external: bool = False


class CollaborationAiContributionDraftRequest(BaseModel):
    authors: list[CollaborationAiContributionAuthorInput] = Field(default_factory=list)


class CollaborationAiContributionRoleResponse(BaseModel):
    full_name: str
    roles: list[str] = Field(default_factory=list)
    is_corresponding: bool = False
    equal_contribution: bool = False
    is_external: bool = False


class CollaborationAiContributionDraftResponse(BaseModel):
    status: Literal["draft"] = "draft"
    credit_statements: list[CollaborationAiContributionRoleResponse] = Field(
        default_factory=list
    )
    draft_text: str = ""
    provenance: dict[str, Any] = Field(default_factory=dict)


class CollaborationAiAffiliationAuthorInput(BaseModel):
    full_name: str
    institution: str | None = None
    orcid_id: str | None = None


class CollaborationAiAffiliationsNormaliseRequest(BaseModel):
    authors: list[CollaborationAiAffiliationAuthorInput] = Field(default_factory=list)


class CollaborationAiAffiliationAuthorResponse(BaseModel):
    full_name: str
    institution: str
    orcid_id: str | None = None
    superscript_number: int


class CollaborationAiAffiliationResponse(BaseModel):
    superscript_number: int
    institution_name: str


class CollaborationAiAffiliationsNormaliseResponse(BaseModel):
    status: Literal["draft"] = "draft"
    normalized_authors: list[CollaborationAiAffiliationAuthorResponse] = Field(
        default_factory=list
    )
    affiliations: list[CollaborationAiAffiliationResponse] = Field(default_factory=list)
    affiliations_block: str = ""
    coi_boilerplate: str = ""
    provenance: dict[str, Any] = Field(default_factory=dict)


class ManuscriptAuthorSuggestionResponse(BaseModel):
    collaborator_id: str
    full_name: str
    preferred_name: str | None = None
    orcid_id: str | None = None
    institution: str | None = None
    classification: Literal[
        "CORE", "ACTIVE", "OCCASIONAL", "HISTORIC", "UNCLASSIFIED"
    ] = "UNCLASSIFIED"
    collaboration_strength_score: float = 0.0


class ManuscriptAuthorSuggestionsResponse(BaseModel):
    items: list[ManuscriptAuthorSuggestionResponse] = Field(default_factory=list)


class ManuscriptAuthorInput(BaseModel):
    collaborator_id: str | None = None
    full_name: str
    orcid_id: str | None = None
    institution: str | None = None
    is_corresponding: bool = False
    equal_contribution: bool = False
    is_external: bool = False


class ManuscriptAffiliationInput(BaseModel):
    institution_name: str
    department: str | None = None
    city: str | None = None
    country: str | None = None
    superscript_number: int | None = None


class ManuscriptAuthorsSaveRequest(BaseModel):
    authors: list[ManuscriptAuthorInput] = Field(default_factory=list)
    affiliations: list[ManuscriptAffiliationInput] = Field(default_factory=list)


class ManuscriptAuthorRecordResponse(BaseModel):
    author_order: int
    collaborator_id: str | None = None
    full_name: str
    orcid_id: str | None = None
    institution: str | None = None
    is_corresponding: bool = False
    equal_contribution: bool = False
    is_external: bool = False


class ManuscriptAffiliationRecordResponse(BaseModel):
    institution_name: str
    department: str | None = None
    city: str | None = None
    country: str | None = None
    superscript_number: int


class ManuscriptAuthorsResponse(BaseModel):
    workspace_id: str
    authors: list[ManuscriptAuthorRecordResponse] = Field(default_factory=list)
    affiliations: list[ManuscriptAffiliationRecordResponse] = Field(
        default_factory=list
    )
    rendered_authors_block: str = ""


class WorkspaceStateResponse(BaseModel):
    workspaces: list[dict[str, Any]] = Field(default_factory=list)
    active_workspace_id: str | None = None
    author_requests: list[dict[str, Any]] = Field(default_factory=list)
    invitations_sent: list[dict[str, Any]] = Field(default_factory=list)


class WorkspaceStateUpdateRequest(BaseModel):
    workspaces: list[dict[str, Any]] = Field(default_factory=list)
    active_workspace_id: str | None = None
    author_requests: list[dict[str, Any]] = Field(default_factory=list)
    invitations_sent: list[dict[str, Any]] = Field(default_factory=list)


class WorkspaceInboxStateResponse(BaseModel):
    messages: list[dict[str, Any]] = Field(default_factory=list)
    reads: dict[str, dict[str, str]] = Field(default_factory=dict)


class WorkspaceInboxStateUpdateRequest(BaseModel):
    messages: list[dict[str, Any]] = Field(default_factory=list)
    reads: dict[str, dict[str, str]] = Field(default_factory=dict)


class WorkspaceRecordResponse(BaseModel):
    id: str
    name: str
    owner_name: str
    collaborators: list[str] = Field(default_factory=list)
    removed_collaborators: list[str] = Field(default_factory=list)
    version: str = "0.1"
    health: Literal["green", "amber", "red"] = "amber"
    updated_at: str
    pinned: bool = False
    archived: bool = False


class WorkspaceListResponse(BaseModel):
    items: list[WorkspaceRecordResponse] = Field(default_factory=list)
    active_workspace_id: str | None = None


class WorkspaceCreateRequest(BaseModel):
    id: str | None = None
    name: str
    owner_name: str
    collaborators: list[str] = Field(default_factory=list)
    removed_collaborators: list[str] = Field(default_factory=list)
    version: str = "0.1"
    health: Literal["green", "amber", "red"] = "amber"
    updated_at: str | None = None
    pinned: bool = False
    archived: bool = False


class WorkspaceUpdateRequest(BaseModel):
    name: str | None = None
    owner_name: str | None = None
    collaborators: list[str] | None = None
    removed_collaborators: list[str] | None = None
    version: str | None = None
    health: Literal["green", "amber", "red"] | None = None
    updated_at: str | None = None
    pinned: bool | None = None
    archived: bool | None = None


class WorkspaceDeleteResponse(BaseModel):
    success: bool = False
    active_workspace_id: str | None = None


class WorkspaceActiveUpdateRequest(BaseModel):
    workspace_id: str | None = None


class WorkspaceActiveUpdateResponse(BaseModel):
    active_workspace_id: str | None = None


class WorkspaceAuthorRequestResponse(BaseModel):
    id: str
    workspace_id: str
    workspace_name: str
    author_name: str
    invited_at: str
    source_inviter_user_id: str | None = None
    source_invitation_id: str | None = None


class WorkspaceAuthorRequestsResponse(BaseModel):
    items: list[WorkspaceAuthorRequestResponse] = Field(default_factory=list)


class WorkspaceAuthorRequestAcceptRequest(BaseModel):
    collaborator_name: str | None = None


class WorkspaceAuthorRequestAcceptResponse(BaseModel):
    workspace: WorkspaceRecordResponse
    removed_request_id: str


class WorkspaceAuthorRequestDeclineResponse(BaseModel):
    success: bool = False
    removed_request_id: str


class WorkspaceInvitationSentResponse(BaseModel):
    id: str
    workspace_id: str
    workspace_name: str
    invitee_name: str
    invited_at: str
    status: Literal["pending", "accepted", "declined"] = "pending"
    invitee_user_id: str | None = None
    linked_author_request_id: str | None = None


class WorkspaceInvitationsSentResponse(BaseModel):
    items: list[WorkspaceInvitationSentResponse] = Field(default_factory=list)


class WorkspaceInvitationCreateRequest(BaseModel):
    id: str | None = None
    workspace_id: str
    invitee_name: str
    invited_at: str | None = None
    status: Literal["pending", "accepted", "declined"] = "pending"


class WorkspaceInvitationStatusUpdateRequest(BaseModel):
    status: Literal["pending", "accepted", "declined"]


class WorkspaceInboxMessageResponse(BaseModel):
    id: str
    workspace_id: str
    sender_name: str
    encrypted_body: str
    iv: str
    created_at: str


class WorkspaceInboxMessagesResponse(BaseModel):
    items: list[WorkspaceInboxMessageResponse] = Field(default_factory=list)


class WorkspaceInboxMessageCreateRequest(BaseModel):
    id: str | None = None
    workspace_id: str
    sender_name: str
    encrypted_body: str
    iv: str
    created_at: str | None = None


class WorkspaceInboxReadsResponse(BaseModel):
    reads: dict[str, dict[str, str]] = Field(default_factory=dict)


class WorkspaceInboxReadMarkRequest(BaseModel):
    workspace_id: str
    reader_name: str
    read_at: str | None = None


class WorkspaceInboxReadMarkResponse(BaseModel):
    workspace_id: str
    reader_key: str
    read_at: str


class WorkspaceRunContextResponse(BaseModel):
    workspace_id: str
    project_id: str | None = None
    manuscript_id: str | None = None
    owner_user_id: str | None = None
    collaborator_user_ids: list[str] = Field(default_factory=list)


class PersonaEmbeddingsGenerateRequest(BaseModel):
    model_name: str | None = None


class PersonaEmbeddingsGenerateResponse(BaseModel):
    generated_embeddings: int
    model_name: str
    clusters: list[dict[str, Any]] = Field(default_factory=list)


class ImpactCollaboratorsResponse(BaseModel):
    collaborators: list[dict[str, Any]] = Field(default_factory=list)
    new_collaborators_by_year: dict[int, int] = Field(default_factory=dict)


class ImpactThemesResponse(BaseModel):
    clusters: list[dict[str, Any]] = Field(default_factory=list)


class ImpactRecomputeResponse(BaseModel):
    user_id: str
    total_works: int
    total_citations: int
    h_index: int
    m_index: float
    citation_velocity: float
    dominant_theme: str
    computed_at: datetime
    most_cited_work: dict[str, Any] | None = None
    top_collaborator: dict[str, Any] | None = None
    collaboration_density: float = 0.0
    theme_citation_averages: list[dict[str, Any]] = Field(default_factory=list)
    publication_timeline: list[dict[str, Any]] = Field(default_factory=list)
    provider_attribution: list[str] = Field(default_factory=list)


class ImpactAnalyseRequest(BaseModel):
    impact_snapshot: dict[str, Any] | None = None
    collaborator_data: dict[str, Any] | None = None
    theme_data: dict[str, Any] | None = None
    publication_timeline: list[dict[str, Any]] | None = None
    venue_distribution: dict[str, int] | None = None


class ImpactAnalyseResponse(BaseModel):
    scholarly_impact_summary: str
    collaboration_analysis: str
    thematic_evolution: str
    strengths: list[str] = Field(default_factory=list)
    blind_spots: list[str] = Field(default_factory=list)
    strategic_suggestions: list[str] = Field(default_factory=list)
    grant_positioning_notes: list[str] = Field(default_factory=list)
    confidence_markers: list[str] = Field(default_factory=list)
    model_used: str


class ImpactReportResponse(BaseModel):
    executive_summary: str
    scholarly_metrics: dict[str, Any] = Field(default_factory=dict)
    collaboration_profile: str
    thematic_profile: str
    strategic_analysis: str
    projected_trajectory: str


class PersonaContextResponse(BaseModel):
    dominant_themes: list[str] = Field(default_factory=list)
    common_study_types: list[str] = Field(default_factory=list)
    top_venues: list[str] = Field(default_factory=list)
    frequent_collaborators: list[str] = Field(default_factory=list)
    methodological_patterns: list[str] = Field(default_factory=list)
    works_used: list[dict[str, Any]] = Field(default_factory=list)

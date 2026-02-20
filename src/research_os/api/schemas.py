from datetime import datetime
from typing import Literal

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


class ProjectResponse(BaseModel):
    id: str
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
    updated_claims: list[ClaimCitationAutofillStateResponse] = Field(default_factory=list)


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

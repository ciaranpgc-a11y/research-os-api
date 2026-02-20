from datetime import datetime

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


class ManuscriptGenerateRequest(BaseModel):
    sections: list[str] | None = None
    notes_context: str


class ManuscriptResponse(BaseModel):
    id: str
    project_id: str
    branch_name: str
    status: str
    sections: dict[str, str]
    created_at: datetime
    updated_at: datetime

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

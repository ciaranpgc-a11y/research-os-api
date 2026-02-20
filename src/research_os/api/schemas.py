from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: str


class DraftMethodsRequest(BaseModel):
    notes: str


class DraftMethodsSuccessResponse(BaseModel):
    methods: str


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

"""FastAPI router for CMR summary generation."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

from research_os.cmr_auth import service as auth_service
from research_os.cmr_summaries import service

router = APIRouter(prefix="/v1/cmr", tags=["cmr-summaries"])

_LOCAL_DEV_TOKEN_PREFIX = "cmr-local-dev-"
_LOCAL_DEV_HOSTS = {"127.0.0.1", "localhost"}


class LgeSummarySegment(BaseModel):
    name: str
    pattern: int
    transmurality: int
    territory: str
    wall: str
    level: str


class LgeSummaryTerritory(BaseModel):
    segments: list[str] = Field(default_factory=list)
    patterns: list[int] = Field(default_factory=list)
    transRange: tuple[int, int] = (0, 0)


class LgeSummaryPatternGroup(BaseModel):
    segments: list[str] = Field(default_factory=list)
    pattern: int


class LgeSummaryViability(BaseModel):
    viable: list[str] = Field(default_factory=list)
    nonViable: list[str] = Field(default_factory=list)


class GenerateLgeProseRequest(BaseModel):
    deterministicText: str = Field(min_length=1)
    rvInsertionPointFibrosis: bool = False
    segments: list[LgeSummarySegment] = Field(default_factory=list)
    territories: dict[str, LgeSummaryTerritory] = Field(default_factory=dict)
    territoryCount: int = 0
    isDiffuse: bool = False
    nonIschaemicSegments: list[LgeSummaryPatternGroup] = Field(default_factory=list)
    unspecifiedSegments: list[str] = Field(default_factory=list)
    viability: LgeSummaryViability | None = None
    ischaemicCount: int = 0
    scoreIndex: float = 0.0
    enhancedCount: int = 0


class GenerateLgeProseResponse(BaseModel):
    prose: str


class RwmaSummaryStateCounts(BaseModel):
    hypokinesis: int = 0
    akinesis: int = 0
    dyskinesis: int = 0


class RwmaSummarySegment(BaseModel):
    segment: int = Field(ge=1, le=17)
    state: int = Field(ge=1, le=3)
    stateLabel: str
    territory: str
    wall: str
    level: str


class GenerateRwmaProseRequest(BaseModel):
    deterministicText: str = Field(min_length=1)
    wmsi: float = 0.0
    severity: str = Field(min_length=1)
    hasAbnormality: bool = False
    territories: list[str] = Field(default_factory=list)
    abnormalCount: int = 0
    stateCounts: RwmaSummaryStateCounts = Field(default_factory=RwmaSummaryStateCounts)
    abnormalSegments: list[RwmaSummarySegment] = Field(default_factory=list)


class GenerateRwmaProseResponse(BaseModel):
    prose: str


class PerfusionSummarySegment(BaseModel):
    seg: int = Field(ge=1, le=17)
    name: str
    extent: int = Field(ge=1, le=2)
    territory: str
    wall: str
    level: str


class PerfusionSummaryPhase(BaseModel):
    abnormalCount: int = 0
    subendocardialCount: int = 0
    transmuralCount: int = 0
    persistenceBeats: int = Field(default=0, ge=0, le=15)
    territories: list[str] = Field(default_factory=list)
    segmentDescription: str | None = None
    segments: list[PerfusionSummarySegment] = Field(default_factory=list)


class PerfusionLgeContext(BaseModel):
    hasAnyLge: bool = False
    hasInfarctPatternLge: bool = False
    infarctPatternCount: int = 0
    infarctTerritories: list[str] = Field(default_factory=list)
    hasAnyOverlapLge: bool = False
    overlapAnyLgeCount: int = 0
    overlapNonInfarctCount: int = 0
    matchedWithinLgeCount: int = 0
    exceedsBySegmentCount: int = 0
    exceedsByThicknessCount: int = 0
    stressBeyondInfarctCount: int = 0
    lgeElsewhere: bool = False
    indeterminateRelation: bool = False
    matchedStressSegmentDescription: str | None = None
    stressBeyondInfarctSegmentDescription: str | None = None


class GeneratePerfusionProseRequest(BaseModel):
    deterministicText: str = Field(min_length=1)
    impression: str = Field(min_length=1)
    adequateStress: bool = True
    rest: PerfusionSummaryPhase
    stress: PerfusionSummaryPhase
    stressOnlyCount: int = 0
    fixedCount: int = 0
    restOnlyCount: int = 0
    stressOnlySegmentDescription: str | None = None
    fixedSegmentDescription: str | None = None
    restOnlySegmentDescription: str | None = None
    lge: PerfusionLgeContext = Field(default_factory=PerfusionLgeContext)


class GeneratePerfusionProseResponse(BaseModel):
    prose: str


class GeneratePhProseRequest(BaseModel):
    deterministicText: str = Field(min_length=1)
    probability: str = Field(min_length=1)
    probabilityLabel: str = Field(min_length=1)
    adaptation: str | None = None
    adaptationLabel: str | None = None
    severity: str | None = None
    severityLabel: str | None = None
    phenotype: str = Field(min_length=1)
    phenotypeLabel: str = Field(min_length=1)
    domainScores: dict[str, int] = Field(default_factory=dict)
    keyFindings: list[str] = Field(default_factory=list)
    leftHeartFindings: list[str] = Field(default_factory=list)
    contextualFindings: list[str] = Field(default_factory=list)
    rvRemodellingFindings: list[str] = Field(default_factory=list)
    rvMaladaptationFindings: list[str] = Field(default_factory=list)
    pressureOverloadFindings: list[str] = Field(default_factory=list)
    pulmonaryVascularFindings: list[str] = Field(default_factory=list)
    rvSize: str | None = None
    rvEndSystolicVolumeIndex: str | None = None
    rvFunction: str | None = None
    tapse: str | None = None
    rvMassIndex: str | None = None
    rvStrokeVolumeIndex: str | None = None
    rvCardiacIndex: str | None = None
    rvLvRatio: str | None = None
    raSize: str | None = None
    laSize: str | None = None
    lvFunction: str | None = None
    mainPa: str | None = None
    paDistensibility: str | None = None
    estimatedPcwp: str | None = None
    estimatedRap: str | None = None
    septalFlattening: str = Field(default='none')
    septalMotion: str = Field(default='normal')
    interatrialSeptalBowing: str = Field(default='none')
    pericardialEffusion: str = Field(default='none')
    pericardialEffusionSize: float | None = None
    venaCava: str = Field(default='normal')
    trSeverity: str | None = None
    trSeverityLabel: str | None = None
    mrSeverity: str | None = None
    mrSeverityLabel: str | None = None
    vortexFormation: str = Field(default='not-assessed')
    vortexSeverity: str | None = None
    helicity: str = Field(default='not-assessed')
    helicitySeverity: str | None = None
    rpaPercent: float | None = None
    lpaPercent: float | None = None


class GeneratePhProseResponse(BaseModel):
    prose: str


class GenerateMitralValveProseRequest(BaseModel):
    deterministicText: str = Field(min_length=1)
    severity: str | None = None
    severityLabel: str | None = None
    regurgitantFraction: float | None = None
    regurgitantVolume: float | None = None
    primaryMechanism: str | None = None
    primaryMechanismLabel: str | None = None
    descriptors: list[str] = Field(default_factory=list)
    findingKeys: list[str] = Field(default_factory=list)
    lvef: float | None = None
    lvedvi: float | None = None
    laMaxVolumeIndex: float | None = None


class GenerateMitralValveProseResponse(BaseModel):
    prose: str


class GenerateAorticValveProseRequest(BaseModel):
    deterministicText: str = Field(min_length=1)
    phenotype: str
    phenotypeLabel: str | None = None
    regurgitationSeverity: str | None = None
    regurgitationSeverityLabel: str | None = None
    regurgitantFraction: float | None = None
    regurgitantVolume: float | None = None
    stenosisSeverity: str | None = None
    stenosisSeverityLabel: str | None = None
    peakVelocity: float | None = None
    meanGradient: float | None = None
    peakGradient: float | None = None
    primaryMechanism: str | None = None
    primaryMechanismLabel: str | None = None
    descriptors: list[str] = Field(default_factory=list)
    findingKeys: list[str] = Field(default_factory=list)


class GenerateAorticValveProseResponse(BaseModel):
    prose: str


class GenerateTricuspidValveProseRequest(BaseModel):
    deterministicText: str = Field(min_length=1)
    severity: str | None = None
    severityLabel: str | None = None
    regurgitantFraction: float | None = None
    regurgitantVolume: float | None = None
    primaryMechanism: str | None = None
    primaryMechanismLabel: str | None = None
    descriptors: list[str] = Field(default_factory=list)
    findingKeys: list[str] = Field(default_factory=list)
    rvef: float | None = None
    rvedvi: float | None = None
    raMaxVolumeIndex: float | None = None


class GenerateTricuspidValveProseResponse(BaseModel):
    prose: str


class ThrombusSummaryEntry(BaseModel):
    location: str = Field(min_length=1)
    confidence: str | None = None
    maxDiameter: float | None = None
    descriptors: list[str] = Field(default_factory=list)
    postContrast: str | None = None
    postContrastLabel: str | None = None


class GenerateThrombusProseRequest(BaseModel):
    deterministicText: str = Field(min_length=1)
    hasThrombus: bool = False
    thrombusCount: int = 0
    locations: list[str] = Field(default_factory=list)
    confidenceLabels: list[str] = Field(default_factory=list)
    entries: list[ThrombusSummaryEntry] = Field(default_factory=list)


class GenerateThrombusProseResponse(BaseModel):
    prose: str


class GenerateReportConclusionsProseRequest(BaseModel):
    reportType: str = Field(min_length=1)
    deterministicLines: list[str] = Field(default_factory=list, min_length=1)


class GenerateReportConclusionsProseResponse(BaseModel):
    lines: list[str] = Field(default_factory=list)


class GenerateCaseLessonsProseRequest(BaseModel):
    mode: Literal["case-discussion", "advanced-teaching-point"] = "case-discussion"
    deterministicText: str = Field(min_length=1)
    reportType: str = Field(min_length=1)
    protocolHighlights: list[str] = Field(default_factory=list)
    confidenceHighlights: list[str] = Field(default_factory=list)
    interpretiveHighlights: list[str] = Field(default_factory=list)
    advancedLearningHighlights: list[str] = Field(default_factory=list)
    reportingPearls: list[str] = Field(default_factory=list)
    teachingThemes: list[str] = Field(default_factory=list)
    notableMeasurements: list[str] = Field(default_factory=list)
    sectionSummaries: dict[str, str | None] = Field(default_factory=dict)
    conclusionLines: list[str] = Field(default_factory=list)


class GenerateCaseLessonsProseResponse(BaseModel):
    prose: str


class CaseQuestionConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class GenerateCaseQuestionAnswerRequest(BaseModel):
    reportType: str = Field(min_length=1)
    question: str = Field(min_length=1)
    conversation: list[CaseQuestionConversationTurn] = Field(default_factory=list)
    reportOutputText: str | None = None
    sectionSummaries: dict[str, str | None] = Field(default_factory=dict)
    conclusionLines: list[str] = Field(default_factory=list)
    notableMeasurements: list[str] = Field(default_factory=list)


class GenerateCaseQuestionAnswerResponse(BaseModel):
    answer: str


class ReportSelectionRefinementConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)
    replacementText: str | None = None


class GenerateReportSelectionRefinementRequest(BaseModel):
    reportType: str = Field(min_length=1)
    instruction: str = Field(min_length=1)
    selectedText: str = Field(min_length=1)
    selectionContextBefore: str = ""
    selectionContextAfter: str = ""
    conversation: list[ReportSelectionRefinementConversationTurn] = Field(
        default_factory=list
    )
    reportOutputText: str | None = None
    sectionSummaries: dict[str, str | None] = Field(default_factory=dict)
    conclusionLines: list[str] = Field(default_factory=list)
    notableMeasurements: list[str] = Field(default_factory=list)


class GenerateReportSelectionRefinementResponse(BaseModel):
    answer: str
    replacementText: str


class ExpertChatImage(BaseModel):
    id: str | None = None
    name: str | None = None
    mimeType: str = Field(min_length=1)
    dataUrl: str = Field(min_length=1)


class ExpertChatConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = ""
    images: list[ExpertChatImage] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_content_or_images(self) -> "ExpertChatConversationTurn":
        if self.role == "assistant" and not self.content.strip():
            raise ValueError("Assistant messages must include content.")
        if self.role == "user" and not self.content.strip() and not self.images:
            raise ValueError("User messages must include content or images.")
        return self


class GenerateExpertChatAnswerRequest(BaseModel):
    scope: Literal["general", "case"] = "general"
    currentPage: str = Field(min_length=1)
    question: str = ""
    conversation: list[ExpertChatConversationTurn] = Field(default_factory=list)
    images: list[ExpertChatImage] = Field(default_factory=list)
    caseId: str | None = None
    caseTitle: str | None = None
    reportType: str | None = None
    sourceReportText: str | None = None
    reportOutputText: str | None = None
    sectionSummaries: dict[str, str | None] = Field(default_factory=dict)
    conclusionLines: list[str] = Field(default_factory=list)
    notableMeasurements: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_question_or_images(self) -> "GenerateExpertChatAnswerRequest":
        if not self.question.strip() and not self.images:
            raise ValueError("An expert chat request must include a question or uploaded images.")
        return self


class GenerateExpertChatAnswerResponse(BaseModel):
    answer: str


class ReportExtractionRequest(BaseModel):
    reportText: str = Field(min_length=1)


class ExtractedReportDemographics(BaseModel):
    sex: str | None = None
    age: float | int | None = None
    height_cm: float | int | None = None
    weight_kg: float | int | None = None
    bsa: float | int | None = None
    heart_rate: float | int | None = None
    study_date: str | None = None


class ExtractedReportMeasurement(BaseModel):
    parameter: str = Field(min_length=1)
    value: float | int


class ReportExtractionResponse(BaseModel):
    demographics: ExtractedReportDemographics = Field(
        default_factory=ExtractedReportDemographics
    )
    measurements: list[ExtractedReportMeasurement] = Field(default_factory=list)


def _extract_token(request: Request) -> str:
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _is_local_dev_request(request: Request) -> bool:
    host = (request.url.hostname or "").strip().lower()
    return host in _LOCAL_DEV_HOSTS


def _require_session(request: Request) -> dict[str, Any] | JSONResponse:
    token = _extract_token(request)
    if not token:
        return JSONResponse({"detail": "Authentication required"}, status_code=401)

    context = auth_service.get_session_context(token)
    if context is not None:
        return context

    if _is_local_dev_request(request) and token.startswith(_LOCAL_DEV_TOKEN_PREFIX):
        return {
            "access_code_id": "local-dev",
            "name": "Local Dev",
            "is_admin": False,
        }

    return JSONResponse({"detail": "Invalid session"}, status_code=401)


@router.post("/report-extraction", response_model=ReportExtractionResponse)
def cmr_extract_report(body: ReportExtractionRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        extracted = service.extract_report_measurements(body.reportText)
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return ReportExtractionResponse(**extracted)


@router.post("/summaries/lge/prose", response_model=GenerateLgeProseResponse)
def cmr_generate_lge_prose(body: GenerateLgeProseRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        prose = service.generate_lge_prose(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GenerateLgeProseResponse(prose=prose)


@router.post("/summaries/rwma/prose", response_model=GenerateRwmaProseResponse)
def cmr_generate_rwma_prose(body: GenerateRwmaProseRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        prose = service.generate_rwma_prose(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GenerateRwmaProseResponse(prose=prose)


@router.post("/summaries/perfusion/prose", response_model=GeneratePerfusionProseResponse)
def cmr_generate_perfusion_prose(body: GeneratePerfusionProseRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        prose = service.generate_perfusion_prose(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GeneratePerfusionProseResponse(prose=prose)


@router.post("/summaries/ph/prose", response_model=GeneratePhProseResponse)
def cmr_generate_ph_prose(body: GeneratePhProseRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        prose = service.generate_ph_prose(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GeneratePhProseResponse(prose=prose)


@router.post("/summaries/mitral-valve/prose", response_model=GenerateMitralValveProseResponse)
def cmr_generate_mitral_valve_prose(body: GenerateMitralValveProseRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        prose = service.generate_mitral_valve_prose(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GenerateMitralValveProseResponse(prose=prose)


@router.post("/summaries/aortic-valve/prose", response_model=GenerateAorticValveProseResponse)
def cmr_generate_aortic_valve_prose(body: GenerateAorticValveProseRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        prose = service.generate_aortic_valve_prose(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GenerateAorticValveProseResponse(prose=prose)


@router.post("/summaries/tricuspid-valve/prose", response_model=GenerateTricuspidValveProseResponse)
def cmr_generate_tricuspid_valve_prose(body: GenerateTricuspidValveProseRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        prose = service.generate_tricuspid_valve_prose(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GenerateTricuspidValveProseResponse(prose=prose)


@router.post("/summaries/thrombus/prose", response_model=GenerateThrombusProseResponse)
def cmr_generate_thrombus_prose(body: GenerateThrombusProseRequest, request: Request):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        prose = service.generate_thrombus_prose(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GenerateThrombusProseResponse(prose=prose)


@router.post(
    "/summaries/report-conclusions/prose",
    response_model=GenerateReportConclusionsProseResponse,
)
def cmr_generate_report_conclusions_prose(
    body: GenerateReportConclusionsProseRequest, request: Request
):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        lines = service.generate_report_conclusions_prose(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GenerateReportConclusionsProseResponse(lines=lines)


@router.post(
    "/summaries/case-lessons/prose",
    response_model=GenerateCaseLessonsProseResponse,
)
def cmr_generate_case_lessons_prose(
    body: GenerateCaseLessonsProseRequest, request: Request
):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        prose = service.generate_case_lessons_prose(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GenerateCaseLessonsProseResponse(prose=prose)


@router.post(
    "/summaries/case-question/answer",
    response_model=GenerateCaseQuestionAnswerResponse,
)
def cmr_generate_case_question_answer(
    body: GenerateCaseQuestionAnswerRequest, request: Request
):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        answer = service.generate_case_question_answer(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GenerateCaseQuestionAnswerResponse(answer=answer)


@router.post(
    "/summaries/report-selection-refinement/answer",
    response_model=GenerateReportSelectionRefinementResponse,
)
def cmr_generate_report_selection_refinement(
    body: GenerateReportSelectionRefinementRequest, request: Request
):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        result = service.generate_report_selection_refinement(
            body.model_dump(mode="json")
        )
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GenerateReportSelectionRefinementResponse(**result)


@router.post(
    "/summaries/expert-chat/answer",
    response_model=GenerateExpertChatAnswerResponse,
)
def cmr_generate_expert_chat_answer(
    body: GenerateExpertChatAnswerRequest, request: Request
):
    guard = _require_session(request)
    if isinstance(guard, JSONResponse):
        return guard

    try:
        answer = service.generate_expert_chat_answer(body.model_dump(mode="json"))
    except service.CmrSummaryGenerationError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=502)
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=500)

    return GenerateExpertChatAnswerResponse(answer=answer)

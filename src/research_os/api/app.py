from fastapi import FastAPI
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

ERROR_RESPONSES = {
    500: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
}


app = FastAPI(title="Research OS API", version="0.1.0")


# Fail fast during startup to avoid confusing downstream OpenAI runtime errors.
# Tests set a dummy OPENAI_API_KEY before creating TestClient.
@app.on_event("startup")
def validate_configuration() -> None:
    get_openai_api_key()


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

from pydantic import BaseModel


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

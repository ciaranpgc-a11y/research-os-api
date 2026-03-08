"""OpenAI client factory and request helpers."""

from __future__ import annotations

import time
from typing import Any

from openai import OpenAI

from research_os.config import get_openai_api_key
from research_os.services.api_telemetry_service import record_api_usage_event


def get_client() -> OpenAI:
    """Build an OpenAI client configured from environment variables."""
    return OpenAI(api_key=get_openai_api_key())


def _usage_int(usage: Any, key: str) -> int:
    if isinstance(usage, dict):
        try:
            return int(usage.get(key) or 0)
        except Exception:
            return 0
    try:
        return int(getattr(usage, key, 0) or 0)
    except Exception:
        return 0


def create_response(*, model: str, input: Any, **kwargs: Any) -> Any:
    client = get_client()
    request_timeout = kwargs.pop("timeout", None)
    request_max_retries = kwargs.pop("max_retries", None)
    if request_timeout is not None or request_max_retries is not None:
        client = client.with_options(
            timeout=request_timeout,
            max_retries=0 if request_max_retries is None else int(request_max_retries),
        )
    started = time.perf_counter()
    response = None
    success = False
    error_code: str | None = None
    try:
        response = client.responses.create(model=model, input=input, **kwargs)
        success = True
        return response
    except Exception as exc:
        error_code = type(exc).__name__
        raise
    finally:
        duration_ms = int((time.perf_counter() - started) * 1000)
        tokens_in = 0
        tokens_out = 0
        if response is not None:
            usage = getattr(response, "usage", None)
            tokens_in = _usage_int(usage, "input_tokens")
            tokens_out = _usage_int(usage, "output_tokens")
        record_api_usage_event(
            provider="openai",
            operation="responses.create",
            endpoint="/v1/responses",
            success=success,
            duration_ms=duration_ms,
            tokens_input=tokens_in,
            tokens_output=tokens_out,
            error_code=error_code,
            metadata={"model": str(model or "").strip()},
        )


def ask_gpt(prompt: str, model: str = "gpt-4.1-mini") -> str:
    """Send a prompt using the Responses API and return output text."""
    response = create_response(model=model, input=prompt)
    return response.output_text

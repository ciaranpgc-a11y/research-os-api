"""OpenAI client factory and request helpers."""

from __future__ import annotations

from openai import OpenAI

from research_os.config import get_openai_api_key


def get_client() -> OpenAI:
    """Build an OpenAI client configured from environment variables."""
    return OpenAI(api_key=get_openai_api_key())


def ask_gpt(prompt: str, model: str = "gpt-4.1-mini") -> str:
    """Send a prompt using the Responses API and return output text."""
    client = get_client()
    response = client.responses.create(model=model, input=prompt)
    return response.output_text

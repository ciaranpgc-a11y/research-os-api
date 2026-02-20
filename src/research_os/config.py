"""Runtime configuration helpers."""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


class ConfigurationError(RuntimeError):
    """Raised when required runtime configuration is missing."""


def get_openai_api_key() -> str:
    """Return the OpenAI API key from environment variables."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ConfigurationError("OPENAI_API_KEY is not set.")
    return api_key

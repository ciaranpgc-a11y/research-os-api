from __future__ import annotations

import pytest

from research_os.services.auth_service import AuthValidationError
from research_os.services.social_auth_service import (
    complete_oauth_callback,
    create_oauth_connect_url,
)


def test_create_oauth_connect_url_rejects_removed_orcid_provider() -> None:
    with pytest.raises(AuthValidationError, match="Unsupported OAuth provider"):
        create_oauth_connect_url(provider="orcid")


def test_complete_oauth_callback_rejects_removed_orcid_provider() -> None:
    with pytest.raises(AuthValidationError, match="Unsupported OAuth provider"):
        complete_oauth_callback(
            provider="orcid",
            state="state-any",
            code="code-any",
            frontend_origin="http://localhost:5173",
        )

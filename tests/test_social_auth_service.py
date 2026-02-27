from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from research_os.db import AuthOAuthState, create_all_tables, reset_database_state, session_scope
from research_os.services.auth_service import AuthValidationError
from research_os.services.social_auth_service import complete_oauth_callback


def _set_test_environment(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_test_social_auth.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("ORCID_CLIENT_ID", "orcid-client-id")
    monkeypatch.setenv("ORCID_CLIENT_SECRET", "orcid-client-secret")
    monkeypatch.setenv(
        "ORCID_SIGNIN_REDIRECT_URI",
        "http://localhost:5173/auth/callback?provider=orcid",
    )
    reset_database_state()


def _create_oauth_state(*, state: str, consumed: bool) -> None:
    create_all_tables()
    with session_scope() as session:
        row = AuthOAuthState(
            user_id=None,
            provider="orcid",
            state_token=state,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=20),
            consumed_at=datetime.now(timezone.utc) if consumed else None,
        )
        session.add(row)
        session.flush()


def test_complete_oauth_callback_allows_retry_for_consumed_unbound_state(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    _create_oauth_state(state="state-used", consumed=True)

    def _exchange_failure(**kwargs):
        del kwargs
        raise AuthValidationError("ORCID token exchange failed (invalid_grant).")

    monkeypatch.setattr(
        "research_os.services.social_auth_service._exchange_oauth_code",
        _exchange_failure,
    )

    with pytest.raises(AuthValidationError, match="invalid_grant"):
        complete_oauth_callback(
            provider="orcid",
            state="state-used",
            code="code-123",
            frontend_origin="http://localhost:5173",
        )


def test_complete_oauth_callback_claims_state_before_token_exchange_failure(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    _create_oauth_state(state="state-claim-first", consumed=False)

    def _exchange_failure(**kwargs):
        del kwargs
        raise AuthValidationError("ORCID token exchange failed (invalid_grant).")

    monkeypatch.setattr(
        "research_os.services.social_auth_service._exchange_oauth_code",
        _exchange_failure,
    )

    with pytest.raises(AuthValidationError, match="invalid_grant"):
        complete_oauth_callback(
            provider="orcid",
            state="state-claim-first",
            code="code-123",
            frontend_origin="http://localhost:5173",
        )

    with session_scope() as session:
        row = session.scalars(
            select(AuthOAuthState).where(AuthOAuthState.state_token == "state-claim-first")
        ).first()
        assert row is not None
        assert row.consumed_at is not None
        assert row.user_id is None


def test_complete_oauth_callback_sets_state_user_id_after_success(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    _create_oauth_state(state="state-success", consumed=False)
    reconciled: list[dict[str, object]] = []
    monkeypatch.setattr(
        "research_os.services.social_auth_service._reconcile_data_library_after_sign_in",
        lambda **kwargs: reconciled.append(kwargs) or None,
    )

    monkeypatch.setattr(
        "research_os.services.social_auth_service._exchange_oauth_code",
        lambda **kwargs: {
            "access_token": "access-123",
            "refresh_token": "refresh-123",
            "expires_in": 3600,
            "orcid": "0000-0002-1825-0097",
        },
    )

    payload = complete_oauth_callback(
        provider="orcid",
        state="state-success",
        code="code-123",
        frontend_origin="http://localhost:5173",
    )

    assert payload["provider"] == "orcid"
    assert isinstance(payload["session_token"], str)
    assert payload["session_token"]
    assert payload["user"]["orcid_id"] == "0000-0002-1825-0097"

    with session_scope() as session:
        row = session.scalars(
            select(AuthOAuthState).where(AuthOAuthState.state_token == "state-success")
        ).first()
        assert row is not None
        assert row.consumed_at is not None
        assert row.user_id == payload["user"]["id"]
    assert len(reconciled) == 1
    assert reconciled[0]["user_id"] == payload["user"]["id"]

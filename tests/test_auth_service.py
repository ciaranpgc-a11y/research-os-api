from __future__ import annotations

from sqlalchemy import select

from research_os.db import User, create_all_tables, reset_database_state, session_scope
from research_os.services.auth_service import (
    complete_login_challenge,
    login_user,
    register_user,
    start_login_challenge,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "research_os_test_auth_service.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    reset_database_state()


def test_register_user_enqueues_publication_metrics_refresh(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    enqueued: list[dict[str, object]] = []
    monkeypatch.setattr(
        "research_os.services.publication_metrics_service.enqueue_publication_top_metrics_refresh",
        lambda **kwargs: enqueued.append(kwargs) or True,
    )

    payload = register_user(
        email="auth-register-refresh@example.com",
        password="StrongPassword123",
        name="Auth Register",
    )
    user_id = str((payload.get("user") or {}).get("id") or "")

    assert user_id
    assert len(enqueued) == 1
    assert enqueued[0]["user_id"] == user_id
    assert enqueued[0]["reason"] == "auth_register_sign_in"
    assert enqueued[0]["force"] is False


def test_login_user_enqueues_publication_metrics_refresh(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    enqueued: list[dict[str, object]] = []
    monkeypatch.setattr(
        "research_os.services.publication_metrics_service.enqueue_publication_top_metrics_refresh",
        lambda **kwargs: enqueued.append(kwargs) or True,
    )

    created = register_user(
        email="auth-login-refresh@example.com",
        password="StrongPassword123",
        name="Auth Login",
    )
    created_user_id = str((created.get("user") or {}).get("id") or "")
    enqueued.clear()

    payload = login_user(
        email="auth-login-refresh@example.com",
        password="StrongPassword123",
    )
    user_id = str((payload.get("user") or {}).get("id") or "")

    assert user_id == created_user_id
    assert len(enqueued) == 1
    assert enqueued[0]["user_id"] == user_id
    assert enqueued[0]["reason"] == "auth_login_sign_in"
    assert enqueued[0]["force"] is False


def test_login_challenge_authenticated_enqueues_refresh(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    enqueued: list[dict[str, object]] = []
    monkeypatch.setattr(
        "research_os.services.publication_metrics_service.enqueue_publication_top_metrics_refresh",
        lambda **kwargs: enqueued.append(kwargs) or True,
    )

    created = register_user(
        email="auth-challenge-refresh@example.com",
        password="StrongPassword123",
        name="Auth Challenge",
    )
    created_user_id = str((created.get("user") or {}).get("id") or "")
    enqueued.clear()

    payload = start_login_challenge(
        email="auth-challenge-refresh@example.com",
        password="StrongPassword123",
    )

    assert payload["status"] == "authenticated"
    session_payload = payload.get("session") or {}
    user_id = str((session_payload.get("user") or {}).get("id") or "")
    assert user_id == created_user_id
    assert len(enqueued) == 1
    assert enqueued[0]["user_id"] == user_id
    assert enqueued[0]["reason"] == "auth_login_challenge_sign_in"
    assert enqueued[0]["force"] is False


def test_complete_login_challenge_enqueues_refresh(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    enqueued: list[dict[str, object]] = []
    monkeypatch.setattr(
        "research_os.services.publication_metrics_service.enqueue_publication_top_metrics_refresh",
        lambda **kwargs: enqueued.append(kwargs) or True,
    )

    created = register_user(
        email="auth-2fa-refresh@example.com",
        password="StrongPassword123",
        name="Auth Two Factor",
    )
    created_user_id = str((created.get("user") or {}).get("id") or "")
    enqueued.clear()

    with session_scope() as session:
        user = session.scalars(
            select(User).where(User.email == "auth-2fa-refresh@example.com")
        ).first()
        assert user is not None
        user.two_factor_enabled = True
        user.two_factor_secret = "test-secret"
        session.flush()

    challenge_payload = start_login_challenge(
        email="auth-2fa-refresh@example.com",
        password="StrongPassword123",
    )
    assert challenge_payload["status"] == "two_factor_required"
    assert enqueued == []

    monkeypatch.setattr(
        "research_os.services.auth_service._verify_two_factor_code",
        lambda **_: True,
    )
    session_payload = complete_login_challenge(
        challenge_token=str(challenge_payload.get("challenge_token") or ""),
        code="123456",
    )
    user_id = str((session_payload.get("user") or {}).get("id") or "")

    assert user_id == created_user_id
    assert len(enqueued) == 1
    assert enqueued[0]["user_id"] == user_id
    assert enqueued[0]["reason"] == "auth_login_2fa_sign_in"
    assert enqueued[0]["force"] is False

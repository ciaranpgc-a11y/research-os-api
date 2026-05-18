"""Tests for extract auth service functions."""

import os

import pytest


def _setup_extract_db(monkeypatch, tmp_path):
    """Point the DB at a fresh SQLite file and reset singletons."""
    db_path = tmp_path / "extract_auth_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str((tmp_path / "dl").resolve()))

    from research_os.db import reset_database_state

    reset_database_state()

    import research_os.extract_auth.service as auth_svc

    auth_svc._admin_seeded = False


@pytest.fixture()
def auth_env(monkeypatch, tmp_path):
    _setup_extract_db(monkeypatch, tmp_path)
    monkeypatch.setenv("EXTRACT_ADMIN_PASSWORD", "admin-secret")
    from research_os.extract_auth import service as auth_svc

    return auth_svc


# --- Admin login ---


def test_admin_login_correct_password(auth_env):
    result = auth_env.admin_login("admin-secret")
    assert result is not None
    assert "session_token" in result
    assert result["is_admin"] is True
    assert result["name"] == "Ciaran Grafton-Clarke"
    assert result["access_code_id"] == "admin"


def test_admin_login_wrong_password(auth_env):
    result = auth_env.admin_login("wrong-password")
    assert result is None


# --- Access code login ---


def test_create_and_login_with_access_code(auth_env):
    # Create a code
    code_result = auth_env.create_access_code("Dr. Test", "my-secret-code")
    assert "id" in code_result
    assert code_result["name"] == "Dr. Test"
    assert code_result["code"] == "my-secret-code"

    # Login with that code
    login_result = auth_env.user_login("my-secret-code")
    assert login_result is not None
    assert login_result["name"] == "Dr. Test"
    assert login_result["is_admin"] is False
    assert "session_token" in login_result


# --- Session validation ---


def test_session_validation(auth_env):
    login_result = auth_env.admin_login("admin-secret")
    assert login_result is not None
    token = login_result["session_token"]

    context = auth_env.get_session_context(token)
    assert context is not None
    assert context["name"] == "Ciaran Grafton-Clarke"
    assert context["is_admin"] is True
    assert context["access_code_id"] == "admin"


def test_get_session_user(auth_env):
    login_result = auth_env.admin_login("admin-secret")
    assert login_result is not None
    token = login_result["session_token"]

    user = auth_env.get_session_user(token)
    assert user is not None
    assert user["name"] == "Ciaran Grafton-Clarke"
    assert user["is_admin"] is True


def test_existing_admin_row_is_renamed(auth_env):
    from research_os.extract_auth.models import ExtractAccessCode
    from research_os.db import session_scope

    auth_env._ensure_tables()
    auth_env._admin_seeded = False
    with session_scope() as session:
        row = session.get(ExtractAccessCode, "admin")
        assert row is not None
        row.name = "Admin"
        session.commit()

    result = auth_env.admin_login("admin-secret")
    assert result is not None
    assert result["name"] == "Ciaran Grafton-Clarke"

    with session_scope() as session:
        row = session.get(ExtractAccessCode, "admin")
        assert row is not None
        assert row.name == "Ciaran Grafton-Clarke"


def test_invalid_token(auth_env):
    user = auth_env.get_session_user("totally-bogus-token-value")
    assert user is None


# --- Logout ---


def test_logout(auth_env):
    login_result = auth_env.admin_login("admin-secret")
    assert login_result is not None
    token = login_result["session_token"]

    # Token is valid before logout
    assert auth_env.get_session_user(token) is not None

    # Logout
    deleted = auth_env.delete_session(token)
    assert deleted is True

    # Token no longer valid
    assert auth_env.get_session_user(token) is None


# --- Code management ---


def test_list_access_codes(auth_env):
    auth_env.create_access_code("User A", "code-a")
    auth_env.create_access_code("User B", "code-b")

    codes = auth_env.list_access_codes()
    names = [c["name"] for c in codes]
    assert "User A" in names
    assert "User B" in names
    # Admin list exposes the issued code, but never the bcrypt hash.
    for c in codes:
        assert "code_hash" not in c
    code_map = {c["name"]: c.get("code") for c in codes}
    assert code_map["User A"] == "code-a"
    assert code_map["User B"] == "code-b"


def test_revoke_access_code(auth_env):
    code_result = auth_env.create_access_code("Revoke Me", "rev-code")
    code_id = code_result["id"]

    # Login should work before revoke
    assert auth_env.user_login("rev-code") is not None

    # Revoke
    result = auth_env.revoke_access_code(code_id)
    assert result is True

    # Login should fail after revoke
    assert auth_env.user_login("rev-code") is None
    assert all(c["id"] != code_id for c in auth_env.list_access_codes())


def test_revoke_admin_returns_error(auth_env):
    result = auth_env.revoke_access_code("admin")
    assert isinstance(result, str)  # Returns error message string

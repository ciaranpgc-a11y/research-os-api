"""Tests for CMR access control."""

import os
import pytest
from fastapi.testclient import TestClient


def _set_cmr_test_env(monkeypatch, tmp_path):
    """Isolate CMR tests with a fresh database."""
    import research_os.api.app as api_module

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "cmr_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str((tmp_path / "dl").resolve()))
    monkeypatch.setenv("CMR_ADMIN_PASSWORD", "test-admin-pass")
    api_module._AUTH_RATE_LIMIT_EVENTS.clear()

    from research_os.db import reset_database_state
    reset_database_state()

    import research_os.cmr_auth.service as cmr_service
    cmr_service._admin_seeded = False


@pytest.fixture()
def cmr_client(monkeypatch, tmp_path):
    _set_cmr_test_env(monkeypatch, tmp_path)
    from research_os.api.app import app
    with TestClient(app) as client:
        yield client


# --- Admin login ---

def test_admin_login_success(cmr_client):
    resp = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Admin"
    assert data["is_admin"] is True
    assert "session_token" in data


def test_admin_login_wrong_password(cmr_client):
    resp = cmr_client.post("/v1/cmr/admin/login", json={"password": "wrong"})
    assert resp.status_code == 401


# --- Admin CRUD ---

def test_admin_create_and_list_codes(cmr_client):
    login = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    token = login.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Dr. Smith", "code": "smith-secret-123"},
        headers=headers,
    )
    assert resp.status_code == 201
    code_id = resp.json()["id"]

    resp = cmr_client.get("/v1/cmr/admin/codes", headers=headers)
    assert resp.status_code == 200
    codes = resp.json()
    names = [c["name"] for c in codes]
    assert "Dr. Smith" in names
    for c in codes:
        assert "code" not in c
        assert "code_hash" not in c


def test_admin_revoke_code(cmr_client):
    login = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    token = login.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Temp User", "code": "temp-123"},
        headers=headers,
    )
    code_id = resp.json()["id"]

    resp = cmr_client.delete(f"/v1/cmr/admin/codes/{code_id}", headers=headers)
    assert resp.status_code == 204

    codes = cmr_client.get("/v1/cmr/admin/codes", headers=headers).json()
    revoked = [c for c in codes if c["id"] == code_id]
    assert revoked[0]["is_active"] is False


def test_admin_cannot_revoke_admin_row(cmr_client):
    login = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    token = login.json()["session_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = cmr_client.delete("/v1/cmr/admin/codes/admin", headers=headers)
    assert resp.status_code == 400


# --- User login ---

def test_user_login_success(cmr_client):
    login = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    headers = {"Authorization": f"Bearer {login.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Dr. Jones", "code": "jones-code"},
        headers=headers,
    )

    resp = cmr_client.post("/v1/cmr/auth/login", json={"code": "jones-code"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Dr. Jones"
    assert data["is_admin"] is False
    assert "session_token" in data


def test_user_login_invalid_code(cmr_client):
    resp = cmr_client.post("/v1/cmr/auth/login", json={"code": "nonexistent"})
    assert resp.status_code == 401


def test_user_login_revoked_code(cmr_client):
    login = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    headers = {"Authorization": f"Bearer {login.json()['session_token']}"}
    resp = cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Revoked", "code": "revoked-code"},
        headers=headers,
    )
    code_id = resp.json()["id"]
    cmr_client.delete(f"/v1/cmr/admin/codes/{code_id}", headers=headers)

    resp = cmr_client.post("/v1/cmr/auth/login", json={"code": "revoked-code"})
    assert resp.status_code == 401


# --- /me endpoint ---

def test_me_valid_session(cmr_client):
    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Dr. Patel", "code": "patel-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "patel-code"})
    user_token = user_login.json()["session_token"]

    resp = cmr_client.get(
        "/v1/cmr/auth/me",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Dr. Patel"
    assert resp.json()["is_admin"] is False


def test_me_invalid_token(cmr_client):
    resp = cmr_client.get(
        "/v1/cmr/auth/me",
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert resp.status_code == 401


def test_me_revoked_code_invalidates_session(cmr_client):
    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    resp = cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Soon Revoked", "code": "soon-revoked"},
        headers=admin_headers,
    )
    code_id = resp.json()["id"]
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "soon-revoked"})
    user_token = user_login.json()["session_token"]

    cmr_client.delete(f"/v1/cmr/admin/codes/{code_id}", headers=admin_headers)

    resp = cmr_client.get(
        "/v1/cmr/auth/me",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert resp.status_code == 401


# --- Logout ---

def test_logout(cmr_client):
    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Logout Test", "code": "logout-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "logout-code"})
    user_token = user_login.json()["session_token"]
    user_headers = {"Authorization": f"Bearer {user_token}"}

    resp = cmr_client.post("/v1/cmr/auth/logout", headers=user_headers)
    assert resp.status_code == 204

    resp = cmr_client.get("/v1/cmr/auth/me", headers=user_headers)
    assert resp.status_code == 401


# --- Admin endpoints require admin session ---

def test_admin_endpoints_reject_user_session(cmr_client):
    admin = cmr_client.post("/v1/cmr/admin/login", json={"password": "test-admin-pass"})
    admin_headers = {"Authorization": f"Bearer {admin.json()['session_token']}"}
    cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "Regular User", "code": "regular-code"},
        headers=admin_headers,
    )
    user_login = cmr_client.post("/v1/cmr/auth/login", json={"code": "regular-code"})
    user_headers = {"Authorization": f"Bearer {user_login.json()['session_token']}"}

    assert cmr_client.get("/v1/cmr/admin/codes", headers=user_headers).status_code == 403
    assert cmr_client.post(
        "/v1/cmr/admin/codes",
        json={"name": "X", "code": "x"},
        headers=user_headers,
    ).status_code == 403

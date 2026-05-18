"""Tests for uploaded Extract source-file routes."""

from types import SimpleNamespace
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _setup_extract_db(monkeypatch, tmp_path):
    """Point the DB at a fresh SQLite file and reset singletons."""
    db_path = tmp_path / "extract_source_files_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("EXTRACT_ADMIN_PASSWORD", "admin-secret")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str((tmp_path / "dl").resolve()))

    from research_os.db import reset_database_state

    reset_database_state()

    import research_os.extract_auth.service as auth_svc

    auth_svc._admin_seeded = False


@pytest.fixture()
def source_file_client(monkeypatch, tmp_path):
    _setup_extract_db(monkeypatch, tmp_path)

    from research_os.extract_auth import service as auth_svc
    from research_os.extract_source_files import service as source_files_svc
    from research_os.extract_source_files.router import router

    app = FastAPI()
    app.include_router(router)
    login = auth_svc.admin_login("admin-secret")
    assert login is not None
    headers = {"Authorization": f"Bearer {login['session_token']}"}

    with TestClient(app) as client:
        yield client, headers, source_files_svc


def test_source_file_content_route_returns_original_bytes(source_file_client):
    client, headers, source_files_svc = source_file_client
    source = source_files_svc.create_source_file(
        modality="cmr",
        filename="scan report.pdf",
        content_type="application/pdf",
        content=b"%PDF-test-content",
    )

    response = client.get(
        f"/v1/extract/source-files/{source['id']}/content",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.content == b"%PDF-test-content"
    assert response.headers["content-type"].startswith("application/pdf")
    assert "scan%20report.pdf" in response.headers["content-disposition"]


def test_source_file_list_route_still_returns_linked_files(source_file_client):
    client, headers, source_files_svc = source_file_client
    source = source_files_svc.create_source_file(
        modality="echo",
        filename="echo.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content=b"docx-content",
    )
    linked = source_files_svc.link_source_file(
        file_id=source["id"],
        modality="echo",
        hn="123456",
        record_id="record-1",
    )

    response = client.get(
        "/v1/extract/source-files/echo/record-1",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["id"] == linked["id"]
    assert response.json()["items"][0]["filename"] == "echo.docx"


def test_word_source_file_pdf_preview_converts_and_streams_pdf(
    source_file_client,
    monkeypatch,
):
    client, headers, source_files_svc = source_file_client
    source = source_files_svc.create_source_file(
        modality="rhc",
        filename="legacy report.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content=b"word-content",
    )

    def fake_run(args, **_kwargs):
        outdir = Path(args[args.index("--outdir") + 1])
        (outdir / "source.pdf").write_bytes(b"%PDF-converted-preview")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(source_files_svc, "_find_office_converter", lambda: "soffice")
    monkeypatch.setattr(source_files_svc.subprocess, "run", fake_run)

    response = client.get(
        f"/v1/extract/source-files/{source['id']}/content?format=pdf",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.content == b"%PDF-converted-preview"
    assert response.headers["content-type"].startswith("application/pdf")
    assert "legacy%20report.pdf" in response.headers["content-disposition"]

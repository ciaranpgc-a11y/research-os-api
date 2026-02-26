from __future__ import annotations

from typing import Any
from pathlib import Path

from research_os.db import (
    DataLibraryAsset,
    DataLibraryAssetBlob,
    User,
    Work,
    create_all_tables,
    reset_database_state,
    session_scope,
)
from research_os.services.data_planner_service import list_library_assets, upload_library_assets
from research_os.services.open_access_service import discover_open_access_for_persona


def _set_test_environment(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_test_open_access.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("DATA_LIBRARY_ROOT", str(tmp_path / "data_library"))
    reset_database_state()


def _create_user_with_work(
    *, email: str, doi: str | None, title: str
) -> tuple[str, str]:
    create_all_tables()
    with session_scope() as session:
        user = User(
            email=email,
            password_hash="pbkdf2_sha256$390000$test$test",
            name="Open Access Test User",
        )
        session.add(user)
        session.flush()
        work = Work(
            user_id=str(user.id),
            title=title,
            title_lower=title.lower(),
            year=2024,
            doi=doi,
            work_type="journal-article",
            venue_name="Test Journal",
            url="",
            provenance="manual",
        )
        session.add(work)
        session.flush()
        return str(user.id), str(work.id)


class _FakeResponse:
    def __init__(
        self,
        status_code: int,
        payload: dict[str, Any] | None = None,
        *,
        content: bytes | None = None,
        headers: dict[str, str] | None = None,
    ):
        self.status_code = status_code
        self._payload = payload or {}
        self.content = content or b""
        self.headers = headers or {}

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeClient:
    def __init__(self, responses: dict[str, _FakeResponse]):
        self._responses = responses

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url: str, params: dict[str, Any] | None = None) -> _FakeResponse:
        if "openalex.org/works" in url:
            filter_key = str((params or {}).get("filter", "")).strip()
            if filter_key:
                key = f"{url}|{filter_key}"
                return self._responses.get(key, _FakeResponse(404, {}))
            search_key = str((params or {}).get("search", "")).strip()
            if search_key:
                key = f"{url}|search:{search_key}"
                return self._responses.get(key, _FakeResponse(404, {}))
        return self._responses.get(url, _FakeResponse(404, {}))


def test_open_access_discovery_uploads_pdf_and_reuses_existing_asset(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    doi = "10.1000/open-access-test"
    user_id, _ = _create_user_with_work(
        email="open-access-1@example.com",
        doi=doi,
        title="Open access pulmonary hypertension study",
    )

    pdf_url = "https://example.org/test-paper.pdf"
    responses = {
        f"https://api.openalex.org/works|doi:https://doi.org/{doi}": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "display_name": "Open access pulmonary hypertension study",
                        "publication_year": 2024,
                        "open_access": {
                            "is_oa": True,
                            "oa_url": "https://example.org/landing",
                        },
                        "best_oa_location": {
                            "landing_page_url": "https://example.org/landing",
                            "pdf_url": pdf_url,
                        },
                    }
                ]
            },
        ),
        pdf_url: _FakeResponse(
            200,
            content=b"%PDF-1.4\n% OA PDF test\n",
            headers={"content-type": "application/pdf"},
        ),
    }
    monkeypatch.setattr(
        "research_os.services.open_access_service.httpx.Client",
        lambda timeout=20.0, follow_redirects=True: _FakeClient(responses),
    )

    first = discover_open_access_for_persona(
        user_id=user_id,
        include_pdf_upload=True,
    )
    assert first["checked_count"] == 1
    assert first["open_access_count"] == 1
    assert first["uploaded_pdf_count"] == 1
    assert first["records"][0]["status"] == "pdf_uploaded"
    assert first["records"][0]["pdf_asset_id"]

    assets = list_library_assets(project_id=None, user_id=user_id)
    assert assets["total"] == 1
    assert assets["items"][0]["kind"] == "pdf"

    second = discover_open_access_for_persona(
        user_id=user_id,
        include_pdf_upload=True,
    )
    assert second["checked_count"] == 1
    assert second["open_access_count"] == 1
    assert second["uploaded_pdf_count"] == 0
    assert second["records"][0]["status"] == "pdf_already_uploaded"
    assert second["records"][0]["pdf_asset_id"] == first["records"][0]["pdf_asset_id"]


def test_open_access_discovery_returns_no_match_when_lookup_fails(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id, _ = _create_user_with_work(
        email="open-access-2@example.com",
        doi=None,
        title="Unmatched publication title",
    )
    responses = {
        "https://api.openalex.org/works|search:Unmatched publication title": _FakeResponse(
            200,
            {"results": []},
        )
    }
    monkeypatch.setattr(
        "research_os.services.open_access_service.httpx.Client",
        lambda timeout=20.0, follow_redirects=True: _FakeClient(responses),
    )

    payload = discover_open_access_for_persona(
        user_id=user_id,
        include_pdf_upload=False,
    )
    assert payload["checked_count"] == 1
    assert payload["open_access_count"] == 0
    assert payload["uploaded_pdf_count"] == 0
    assert payload["records"][0]["status"] == "no_match"


def test_list_library_assets_marks_entries_with_missing_storage_unavailable(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    with session_scope() as session:
        user = User(
            email="open-access-missing-storage@example.com",
            password_hash="pbkdf2_sha256$390000$test$test",
            name="Open Access Test User",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

    asset_ids = upload_library_assets(
        files=[
            ("stale.csv", "text/csv", b"col_a,col_b\n1,2\n"),
            ("fresh.csv", "text/csv", b"col_a,col_b\n3,4\n"),
        ],
        project_id=None,
        user_id=user_id,
    )
    stale_asset_id = asset_ids[0]
    fresh_asset_id = asset_ids[1]

    with session_scope() as session:
        stale_asset = session.get(DataLibraryAsset, stale_asset_id)
        assert stale_asset is not None
        stale_path = Path(str(stale_asset.storage_path))
        stale_path.unlink(missing_ok=True)
        backup = session.get(DataLibraryAssetBlob, stale_asset_id)
        if backup is not None:
            session.delete(backup)

    payload = list_library_assets(project_id=None, user_id=user_id)
    listed_by_id = {
        str(item.get("id")): item for item in payload.get("items", [])
    }
    listed_ids = list(listed_by_id.keys())
    assert fresh_asset_id in listed_ids
    assert stale_asset_id in listed_ids
    assert bool(listed_by_id[fresh_asset_id].get("is_available")) is True
    assert bool(listed_by_id[stale_asset_id].get("is_available")) is False


def test_list_library_assets_migrates_legacy_storage_to_stable_root(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.chdir(tmp_path)
    create_all_tables()
    with session_scope() as session:
        user = User(
            email="open-access-legacy-storage@example.com",
            password_hash="pbkdf2_sha256$390000$test$test",
            name="Open Access Test User",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

    asset_ids = upload_library_assets(
        files=[("legacy.csv", "text/csv", b"col_a,col_b\n10,20\n")],
        project_id=None,
        user_id=user_id,
    )
    asset_id = asset_ids[0]
    stable_root = (tmp_path / "data_library").resolve()
    legacy_root = (tmp_path / "data_library_store").resolve()
    legacy_root.mkdir(parents=True, exist_ok=True)

    with session_scope() as session:
        asset = session.get(DataLibraryAsset, asset_id)
        assert asset is not None
        current_path = Path(str(asset.storage_path)).resolve()
        legacy_path = legacy_root / current_path.name
        current_path.replace(legacy_path)
        asset.storage_path = str(legacy_path)
        session.flush()

    payload = list_library_assets(project_id=None, user_id=user_id)
    listed_ids = [str(item.get("id")) for item in payload.get("items", [])]
    assert asset_id in listed_ids

    with session_scope() as session:
        refreshed = session.get(DataLibraryAsset, asset_id)
        assert refreshed is not None
        refreshed_path = Path(str(refreshed.storage_path)).resolve()
        assert refreshed_path.parent == stable_root
        assert refreshed_path.exists() and refreshed_path.is_file()

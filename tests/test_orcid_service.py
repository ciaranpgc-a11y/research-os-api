from __future__ import annotations

from typing import Any

from sqlalchemy import func, select

from research_os.db import (
    User,
    Work,
    WorkAuthorship,
    create_all_tables,
    reset_database_state,
    session_scope,
)
import pytest

from research_os.services.orcid_service import (
    OrcidValidationError,
    disconnect_orcid,
    import_orcid_works,
)
from research_os.services.persona_service import list_works
from research_os.services.security_service import encrypt_secret


def _set_test_environment(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_test_orcid.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    reset_database_state()


def _create_orcid_user(*, email: str, orcid_id: str) -> str:
    create_all_tables()
    with session_scope() as session:
        user = User(
            email=email,
            password_hash="pbkdf2_sha256$390000$test$test",
            name="ORCID Test User",
            orcid_id=orcid_id,
            orcid_access_token=encrypt_secret("access-token"),
        )
        session.add(user)
        session.flush()
        return str(user.id)


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeOrcidClient:
    def __init__(self, responses: dict[str, _FakeResponse]):
        self._responses = responses

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url: str, headers: dict[str, str] | None = None) -> _FakeResponse:
        del headers
        if url not in self._responses:
            return _FakeResponse(404, {})
        return self._responses[url]


def test_orcid_import_keeps_distinct_works_with_same_title_year(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    orcid_id = "0000-0002-1825-0097"
    user_id = _create_orcid_user(email="orcid-import-1@example.com", orcid_id=orcid_id)

    works_url = f"https://pub.orcid.org/v3.0/{orcid_id}/works"
    work_101_url = f"https://pub.orcid.org/v3.0/{orcid_id}/work/101"
    work_202_url = f"https://pub.orcid.org/v3.0/{orcid_id}/work/202"

    responses = {
        works_url: _FakeResponse(
            200,
            {
                "group": [
                    {
                        "work-summary": [
                            {"put-code": 101},
                            {"put-code": 202},
                        ]
                    }
                ]
            },
        ),
        work_101_url: _FakeResponse(
            200,
            {
                "title": {"title": {"value": "Shared title"}},
                "publication-date": {"year": {"value": "2024"}},
                "type": "journal-article",
            },
        ),
        work_202_url: _FakeResponse(
            200,
            {
                "title": {"title": {"value": "Shared title"}},
                "publication-date": {"year": {"value": "2024"}},
                "type": "journal-article",
            },
        ),
    }

    monkeypatch.setattr(
        "research_os.services.orcid_service._ensure_valid_access_token",
        lambda session, user: "access-token",
    )
    monkeypatch.setattr(
        "research_os.services.orcid_service.httpx.Client",
        lambda timeout=20.0: _FakeOrcidClient(responses),
    )
    monkeypatch.setattr(
        "research_os.services.orcid_service.sync_metrics",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        "research_os.services.orcid_service.recompute_collaborator_edges",
        lambda user_id: {"core_collaborators": [], "new_collaborators_by_year": {}},
    )

    result = import_orcid_works(user_id=user_id)
    works = list_works(user_id=user_id)

    assert result["imported_count"] == 2
    assert len(result["work_ids"]) == 2
    assert len(works) == 2
    assert len({item["url"] for item in works}) == 2
    assert all(
        item["url"].startswith(f"https://orcid.org/{orcid_id}/work/") for item in works
    )


def test_orcid_import_skips_auto_metrics_sync_by_default(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    orcid_id = "0000-0002-1825-0097"
    user_id = _create_orcid_user(email="orcid-import-2@example.com", orcid_id=orcid_id)

    works_url = f"https://pub.orcid.org/v3.0/{orcid_id}/works"
    work_303_url = f"https://pub.orcid.org/v3.0/{orcid_id}/work/303"
    responses = {
        works_url: _FakeResponse(
            200,
            {"group": [{"work-summary": [{"put-code": 303}]}]},
        ),
        work_303_url: _FakeResponse(
            200,
            {
                "title": {"title": {"value": "Single work"}},
                "publication-date": {"year": {"value": "2024"}},
                "type": "journal-article",
            },
        ),
    }

    monkeypatch.setenv("ORCID_IMPORT_AUTO_SYNC_METRICS", "0")
    monkeypatch.setattr(
        "research_os.services.orcid_service._ensure_valid_access_token",
        lambda session, user: "access-token",
    )
    monkeypatch.setattr(
        "research_os.services.orcid_service.httpx.Client",
        lambda timeout=20.0: _FakeOrcidClient(responses),
    )
    monkeypatch.setattr(
        "research_os.services.orcid_service.sync_metrics",
        lambda **kwargs: (_ for _ in ()).throw(
            RuntimeError("sync should not run by default")
        ),
    )
    monkeypatch.setattr(
        "research_os.services.orcid_service.recompute_collaborator_edges",
        lambda user_id: {"core_collaborators": [], "new_collaborators_by_year": {}},
    )

    result = import_orcid_works(user_id=user_id)
    assert result["imported_count"] == 1


def test_orcid_import_reports_zero_new_works_on_repeat_sync(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    orcid_id = "0000-0002-1825-0097"
    user_id = _create_orcid_user(
        email="orcid-import-repeat@example.com", orcid_id=orcid_id
    )

    works_url = f"https://pub.orcid.org/v3.0/{orcid_id}/works"
    work_404_url = f"https://pub.orcid.org/v3.0/{orcid_id}/work/404"
    responses = {
        works_url: _FakeResponse(
            200, {"group": [{"work-summary": [{"put-code": 404}]}]}
        ),
        work_404_url: _FakeResponse(
            200,
            {
                "title": {"title": {"value": "Repeatable ORCID work"}},
                "publication-date": {"year": {"value": "2024"}},
                "type": "journal-article",
            },
        ),
    }

    monkeypatch.setattr(
        "research_os.services.orcid_service._ensure_valid_access_token",
        lambda session, user: "access-token",
    )
    call_urls: list[str] = []

    class _TrackingOrcidClient(_FakeOrcidClient):
        def get(self, url: str, headers: dict[str, str] | None = None) -> _FakeResponse:
            call_urls.append(url)
            return super().get(url, headers=headers)

    monkeypatch.setattr(
        "research_os.services.orcid_service.httpx.Client",
        lambda timeout=20.0: _TrackingOrcidClient(responses),
    )
    sync_calls: list[dict[str, Any]] = []

    def _capture_sync_metrics(**kwargs):
        sync_calls.append(dict(kwargs))

    monkeypatch.setattr(
        "research_os.services.orcid_service.sync_metrics",
        _capture_sync_metrics,
    )
    monkeypatch.setattr(
        "research_os.services.orcid_service.recompute_collaborator_edges",
        lambda user_id: {"core_collaborators": [], "new_collaborators_by_year": {}},
    )

    first = import_orcid_works(user_id=user_id)
    second = import_orcid_works(user_id=user_id)

    assert first["imported_count"] == 1
    assert second["imported_count"] == 0
    assert len(sync_calls) == 1
    assert sync_calls[0].get("user_id") == user_id
    assert isinstance(sync_calls[0].get("work_ids"), list)
    assert len(sync_calls[0]["work_ids"]) == 1
    assert call_urls.count(works_url) == 2
    assert call_urls.count(work_404_url) == 1


def test_orcid_import_dedupes_duplicate_contributors(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    orcid_id = "0000-0002-1825-0097"
    user_id = _create_orcid_user(
        email="orcid-import-dup-authors@example.com", orcid_id=orcid_id
    )

    works_url = f"https://pub.orcid.org/v3.0/{orcid_id}/works"
    work_505_url = f"https://pub.orcid.org/v3.0/{orcid_id}/work/505"
    responses = {
        works_url: _FakeResponse(
            200,
            {"group": [{"work-summary": [{"put-code": 505}]}]},
        ),
        work_505_url: _FakeResponse(
            200,
            {
                "title": {"title": {"value": "Duplicate contributor work"}},
                "publication-date": {"year": {"value": "2022"}},
                "type": "journal-article",
                "contributors": {
                    "contributor": [
                        {
                            "credit-name": {"value": "Alex Author"},
                            "contributor-orcid": {"path": "0000-0001-1111-1111"},
                        },
                        {
                            "credit-name": {"value": "Alex Author"},
                            "contributor-orcid": {"path": "0000-0001-1111-1111"},
                        },
                    ]
                },
            },
        ),
    }

    monkeypatch.setattr(
        "research_os.services.orcid_service._ensure_valid_access_token",
        lambda session, user: "access-token",
    )
    monkeypatch.setattr(
        "research_os.services.orcid_service.httpx.Client",
        lambda timeout=20.0: _FakeOrcidClient(responses),
    )
    monkeypatch.setattr(
        "research_os.services.orcid_service.sync_metrics",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        "research_os.services.orcid_service.recompute_collaborator_edges",
        lambda user_id: {"core_collaborators": [], "new_collaborators_by_year": {}},
    )

    payload = import_orcid_works(user_id=user_id)
    assert payload["imported_count"] == 1

    with session_scope() as session:
        work = session.scalars(select(Work).where(Work.user_id == user_id)).first()
        assert work is not None
        authorship_count = session.scalar(
            select(func.count(WorkAuthorship.id)).where(
                WorkAuthorship.work_id == work.id
            )
        )
        assert int(authorship_count or 0) == 1


def test_disconnect_orcid_blocks_orcid_only_placeholder_account(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id = _create_orcid_user(
        email="orcid-0000000285370806@orcid.local",
        orcid_id="0000-0002-8537-0806",
    )

    with pytest.raises(OrcidValidationError) as exc:
        disconnect_orcid(user_id=user_id)

    assert "depends on ORCID sign-in" in str(exc.value)


def test_disconnect_orcid_clears_link_for_standard_account(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id = _create_orcid_user(
        email="standard-user@example.com",
        orcid_id="0000-0002-8537-0806",
    )

    payload = disconnect_orcid(user_id=user_id)
    assert payload["linked"] is False
    assert payload["orcid_id"] is None
    assert payload["can_import"] is False

    with session_scope() as session:
        user = session.get(User, user_id)
        assert user is not None
        assert user.orcid_id is None
        assert user.orcid_access_token is None
        assert user.orcid_refresh_token is None

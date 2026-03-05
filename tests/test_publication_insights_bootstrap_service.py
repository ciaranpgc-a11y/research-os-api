from __future__ import annotations

from sqlalchemy import select

from research_os.db import User, create_all_tables, reset_database_state, session_scope
from research_os.services.publication_insights_bootstrap_service import (
    import_openalex_works_direct,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "research_os_test_publication_insights_bootstrap.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    reset_database_state()


def _seed_user() -> tuple[str, str]:
    create_all_tables()
    with session_scope() as session:
        user = User(
            email="bootstrap-openalex@example.com",
            password_hash="test-hash",
            name="Bootstrap OpenAlex User",
            openalex_author_id="A1234567890",
        )
        session.add(user)
        session.flush()
        return str(user.id), str(user.openalex_author_id or "")


def test_import_openalex_works_direct_uses_local_transformers(
    monkeypatch,
    tmp_path,
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id, author_id = _seed_user()

    monkeypatch.setattr(
        "research_os.services.publication_insights_bootstrap_service._fetch_openalex_works_for_author",
        lambda **_: [{"id": "https://openalex.org/W1", "display_name": "Work 1"}],
    )
    monkeypatch.setattr(
        "research_os.services.publication_insights_bootstrap_service._work_from_openalex",
        lambda *_args, **_kwargs: {
            "title": "Work 1",
            "year": 2024,
            "doi": "10.1000/work-1",
            "url": "https://openalex.org/W1",
            "authors": [{"name": "Bootstrap OpenAlex User"}],
        },
    )
    monkeypatch.setattr(
        "research_os.services.orcid_service._upsert_imported_orcid_work",
        lambda **_: {"id": "work-local-1"},
    )
    monkeypatch.setattr(
        "research_os.services.publication_insights_bootstrap_service.recompute_collaborator_edges",
        lambda **_: {"core_collaborators": []},
    )

    payload = import_openalex_works_direct(
        user_id=user_id,
        openalex_author_id=author_id,
        overwrite_user_metadata=False,
    )

    assert payload["imported_count"] == 1
    assert payload["provenance"] == "openalex"
    assert payload["work_ids"] == ["work-local-1"]

    with session_scope() as session:
        row = session.scalar(select(User).where(User.id == user_id))
        assert row is not None
        assert str(row.openalex_author_id or "") == "A1234567890"

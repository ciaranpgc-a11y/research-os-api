from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

import research_os.services.publication_insights_agent_service as publication_insights_agent_service
from research_os.api.app import app
from research_os.db import MetricsSnapshot, User, Work, create_all_tables, reset_database_state, session_scope
from research_os.services.publication_metrics_service import compute_publication_top_metrics


def _set_test_environment(monkeypatch, tmp_path) -> None:
    import research_os.api.app as api_module

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_publication_insights_agent.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("PUB_ANALYTICS_TTL_SECONDS", "60")
    api_module._AUTH_RATE_LIMIT_EVENTS.clear()
    reset_database_state()


def _seed_publications_for_user(*, user_id: str) -> None:
    now = datetime.now(timezone.utc)
    with session_scope() as session:
        user = session.get(User, user_id)
        assert user is not None

        works = [
            Work(
                user_id=user_id,
                title="Driver Paper One",
                title_lower="driver paper one",
                year=2022,
                doi="10.1000/driver-one",
                venue_name="Journal A",
                journal="Journal A",
                publication_type="journal-article",
                citations_total=0,
                work_type="journal-article",
                publisher="Publisher A",
                abstract="Driver one abstract.",
                keywords=["cardiology"],
                url="https://example.org/driver-one",
                provenance="manual",
            ),
            Work(
                user_id=user_id,
                title="Driver Paper Two",
                title_lower="driver paper two",
                year=2024,
                doi="10.1000/driver-two",
                venue_name="Journal B",
                journal="Journal B",
                publication_type="journal-article",
                citations_total=0,
                work_type="journal-article",
                publisher="Publisher B",
                abstract="Driver two abstract.",
                keywords=["imaging"],
                url="https://example.org/driver-two",
                provenance="manual",
            ),
            Work(
                user_id=user_id,
                title="Uncited Paper",
                title_lower="uncited paper",
                year=2025,
                doi="10.1000/uncited-paper",
                venue_name="Journal C",
                journal="Journal C",
                publication_type="journal-article",
                citations_total=0,
                work_type="journal-article",
                publisher="Publisher C",
                abstract="Uncited paper abstract.",
                keywords=["education"],
                url="https://example.org/uncited-paper",
                provenance="manual",
            ),
        ]
        session.add_all(works)
        session.flush()

        session.add_all(
            [
                MetricsSnapshot(
                    work_id=str(works[0].id),
                    provider="openalex",
                    citations_count=30,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={
                        "match_method": "doi",
                        "counts_by_year": [
                            {"year": now.year - 2, "cited_by_count": 7},
                            {"year": now.year - 1, "cited_by_count": 9},
                            {"year": now.year, "cited_by_count": 5},
                        ],
                    },
                    captured_at=now - timedelta(days=20),
                ),
                MetricsSnapshot(
                    work_id=str(works[1].id),
                    provider="openalex",
                    citations_count=14,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={
                        "match_method": "doi",
                        "counts_by_year": [
                            {"year": now.year - 2, "cited_by_count": 2},
                            {"year": now.year - 1, "cited_by_count": 4},
                            {"year": now.year, "cited_by_count": 3},
                        ],
                    },
                    captured_at=now - timedelta(days=20),
                ),
                MetricsSnapshot(
                    work_id=str(works[2].id),
                    provider="openalex",
                    citations_count=0,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={"match_method": "doi", "counts_by_year": []},
                    captured_at=now - timedelta(days=20),
                ),
            ]
        )


def _seed_user(email: str) -> str:
    with session_scope() as session:
        user = User(
            email=email,
            password_hash="test-hash",
            name="Publication Agent User",
        )
        session.add(user)
        session.flush()
        return str(user.id)


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_generate_publication_insights_agent_draft_uses_openai_response(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user("pub-agent-openai@example.com")
    _seed_publications_for_user(user_id=user_id)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=
                '{"overall_summary":"Your uncited share is manageable and a small group of papers drives citation activity.",'
                '"sections":['
                '{"key":"uncited_works","headline":"Uncited works","body":"You have a defined group of uncited publications.","consideration_label":"What to separate","consideration":"Consider separating recent uncited work from older backlog."},'
                '{"key":"citation_drivers","headline":"Citation drivers","body":"A small set of papers is driving recent citations.","consideration_label":"What to watch","consideration":"Consider whether attention is concentrated in one paper."}'
                "]}"
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id=user_id,
        window_id="3y",
    )

    assert payload["agent_name"] == "Publication insights agent"
    assert payload["status"] == "draft"
    assert payload["window_id"] == "3y"
    assert len(payload["sections"]) == 4
    assert payload["provenance"]["generation_mode"] == "openai"
    assert payload["provenance"]["model"] in {"gpt-5.2", "gpt-4.1-mini"}
    uncited_section = next(
        section for section in payload["sections"] if section["key"] == "uncited_works"
    )
    assert "citations in the last 12 months" in uncited_section["body"]
    assert any(section["key"] == "citation_activation" for section in payload["sections"])
    assert any(section["key"] == "citation_activation_history" for section in payload["sections"])
    assert payload["sections"][0]["consideration_label"]
    assert payload["sections"][0]["consideration"]


def test_generate_publication_insights_agent_draft_falls_back_when_openai_fails(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user("pub-agent-fallback@example.com")
    _seed_publications_for_user(user_id=user_id)

    def _raise_error(**kwargs):  # noqa: ANN003
        raise RuntimeError("OpenAI unavailable")

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        _raise_error,
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id=user_id,
        window_id="1y",
    )

    assert payload["status"] == "draft"
    assert payload["window_id"] == "1y"
    assert payload["provenance"]["generation_mode"] == "deterministic_fallback"
    assert payload["provenance"]["model"] is None
    assert any(section["key"] == "uncited_works" for section in payload["sections"])
    assert any(section["key"] == "citation_drivers" for section in payload["sections"])
    assert any(section["key"] == "citation_activation" for section in payload["sections"])
    assert any(section["key"] == "citation_activation_history" for section in payload["sections"])
    assert any(section.get("consideration_label") for section in payload["sections"])
    assert any(section.get("consideration") for section in payload["sections"])
    uncited_section = next(
        section for section in payload["sections"] if section["key"] == "uncited_works"
    )
    assert "citations in the last 12 months" in uncited_section["body"]


def test_generate_publication_insights_agent_draft_builds_section_level_citation_read(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user("pub-agent-section@example.com")
    _seed_publications_for_user(user_id=user_id)

    def _raise_error(**kwargs):  # noqa: ANN003
        raise RuntimeError("OpenAI unavailable")

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        _raise_error,
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id=user_id,
        window_id="1y",
        section_key="citation_drivers",
        scope="section",
    )

    citation_section = next(
        section for section in payload["sections"] if section["key"] == "citation_drivers"
    )
    assert "Across the last 1, 3, and 5 years" in citation_section["body"]
    assert citation_section["consideration_label"]
    assert str(citation_section.get("consideration") or "").startswith("You may want")


def test_publication_insights_agent_api_returns_payload(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=
                '{"overall_summary":"A concise portfolio summary.",'
                '"sections":['
                '{"key":"uncited_works","headline":"Uncited works","body":"You have uncited publications.","consideration_label":"Why this matters","consideration":"Consider splitting recent and older uncited papers."},'
                '{"key":"citation_drivers","headline":"Citation drivers","body":"Your leading papers are concentrating citations.","consideration_label":"What to watch","consideration":"Consider whether visibility depends on one standout paper."}'
                "]}"
        ),
    )

    with TestClient(app) as client:
        register_response = client.post(
            "/v1/auth/register",
            json={
                "email": "pub-agent-api@example.com",
                "password": "StrongPassword123",
                "name": "Publication Agent API",
            },
        )
        assert register_response.status_code == 200
        token = register_response.json()["session_token"]
        user_id = register_response.json()["user"]["id"]
        _seed_publications_for_user(user_id=user_id)
        compute_publication_top_metrics(user_id=user_id)

        response = client.get(
            "/v1/publications/ai/insights?window_id=5y",
            headers=_auth_headers(token),
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["agent_name"] == "Publication insights agent"
    assert payload["window_id"] == "5y"
    assert len(payload["sections"]) == 4
    assert "citations in the last 12 months" in payload["sections"][0]["body"]
    assert any(section["key"] == "citation_activation" for section in payload["sections"])
    assert any(section["key"] == "citation_activation_history" for section in payload["sections"])
    assert payload["sections"][0]["consideration_label"]
    assert payload["sections"][0]["consideration"]

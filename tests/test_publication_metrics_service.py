from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

import research_os.services.publication_metrics_service as publication_metrics_service
from research_os.api.app import app
from research_os.db import (
    MetricsSnapshot,
    PublicationMetric,
    User,
    Work,
    create_all_tables,
    reset_database_state,
    session_scope,
)
from research_os.services.publication_metrics_service import (
    TOP_METRICS_KEY,
    compute_citation_momentum_score,
    compute_concentration_risk_percent,
    compute_m_index,
    compute_publication_top_metrics,
    compute_yoy_percent,
    enqueue_publication_top_metrics_refresh,
    get_publication_top_metrics,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    import research_os.api.app as api_module

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_publication_metrics.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("PUB_ANALYTICS_TTL_SECONDS", "60")
    monkeypatch.setenv("PUB_ANALYTICS_MAX_CONCURRENT_JOBS", "2")
    api_module._AUTH_RATE_LIMIT_EVENTS.clear()
    reset_database_state()
    publication_metrics_service._inflight_users.clear()
    publication_metrics_service._executor = None


def _seed_user_with_metrics(*, email: str) -> str:
    now = datetime.now(timezone.utc)
    with session_scope() as session:
        user = User(
            email=email,
            password_hash="test-hash",
            name="Metrics User",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work_a = Work(
            user_id=user_id,
            title="Work A",
            title_lower="work a",
            year=2022,
            doi="10.1000/work-a",
            venue_name="Journal A",
            journal="Journal A",
            publication_type="journal-article",
            citations_total=0,
            work_type="journal-article",
            publisher="Publisher A",
            abstract="Work A abstract",
            keywords=["cardiology"],
            url="https://example.org/a",
            provenance="manual",
        )
        work_b = Work(
            user_id=user_id,
            title="Work B",
            title_lower="work b",
            year=2024,
            doi="10.1000/work-b",
            venue_name="Journal B",
            journal="Journal B",
            publication_type="journal-article",
            citations_total=0,
            work_type="journal-article",
            publisher="Publisher B",
            abstract="Work B abstract",
            keywords=["imaging"],
            url="https://example.org/b",
            provenance="manual",
        )
        session.add_all([work_a, work_b])
        session.flush()

        session.add_all(
            [
                MetricsSnapshot(
                    work_id=str(work_a.id),
                    provider="openalex",
                    citations_count=10,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={"match_method": "doi"},
                    captured_at=now - timedelta(days=390),
                ),
                MetricsSnapshot(
                    work_id=str(work_a.id),
                    provider="openalex",
                    citations_count=25,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={"match_method": "doi"},
                    captured_at=now - timedelta(days=20),
                ),
                MetricsSnapshot(
                    work_id=str(work_a.id),
                    provider="semantic_scholar",
                    citations_count=24,
                    influential_citations=7,
                    altmetric_score=None,
                    metric_payload={"match_method": "doi"},
                    captured_at=now - timedelta(days=20),
                ),
                MetricsSnapshot(
                    work_id=str(work_b.id),
                    provider="openalex",
                    citations_count=4,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={"match_method": "title"},
                    captured_at=now - timedelta(days=390),
                ),
                MetricsSnapshot(
                    work_id=str(work_b.id),
                    provider="openalex",
                    citations_count=12,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={"match_method": "title"},
                    captured_at=now - timedelta(days=20),
                ),
            ]
        )
    return user_id


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_metric_compute_helpers() -> None:
    assert compute_m_index(h_index=20, first_publication_year=2016, current_year=2026) == 1.818
    assert compute_yoy_percent(citations_last_12m=120, citations_prev_12m=80) == 50.0
    assert compute_yoy_percent(citations_last_12m=100, citations_prev_12m=0) is None
    assert compute_citation_momentum_score([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) == 94.5
    assert compute_concentration_risk_percent(total_citations=200, top3_citations=80) == 40.0


def test_stale_while_revalidate_serves_cache_and_enqueues(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics(email="stale-top-metrics@example.com")
    compute_publication_top_metrics(user_id=user_id)

    with session_scope() as session:
        row = session.scalars(publication_metrics_service._bundle_row_query(user_id)).first()
        assert row is not None
        row.computed_at = datetime.now(timezone.utc) - timedelta(days=2)
        row.status = "READY"
        session.flush()

    enqueued: list[str] = []
    monkeypatch.setattr(
        publication_metrics_service,
        "enqueue_publication_top_metrics_refresh",
        lambda **kwargs: enqueued.append(str(kwargs["user_id"])) or True,
    )

    payload = get_publication_top_metrics(user_id=user_id)

    assert payload["is_stale"] is True
    assert payload["status"] == "RUNNING"
    assert len(payload["tiles"]) >= 6
    assert enqueued == [user_id]


def test_lock_prevents_duplicate_enqueue(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics(email="lock-top-metrics@example.com")
    compute_publication_top_metrics(user_id=user_id)

    with session_scope() as session:
        row = session.scalars(publication_metrics_service._bundle_row_query(user_id)).first()
        assert row is not None
        row.status = "RUNNING"
        session.flush()

    assert enqueue_publication_top_metrics_refresh(user_id=user_id) is False

    with session_scope() as session:
        row = session.scalars(publication_metrics_service._bundle_row_query(user_id)).first()
        assert row is not None
        row.status = "READY"
        session.flush()

    class _DummyExecutor:
        def __init__(self) -> None:
            self.submits = 0

        def submit(self, fn, *args, **kwargs):  # noqa: ANN001
            self.submits += 1
            return None

    dummy = _DummyExecutor()
    monkeypatch.setattr(publication_metrics_service, "_get_executor", lambda: dummy)

    first = enqueue_publication_top_metrics_refresh(user_id=user_id, force=True)
    second = enqueue_publication_top_metrics_refresh(user_id=user_id, force=True)
    assert first is True
    assert second is False
    assert dummy.submits == 1


def test_publications_metrics_api_response_contract(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with TestClient(app) as client:
        register = client.post(
            "/v1/auth/register",
            json={
                "email": "metrics-contract@example.com",
                "password": "StrongPassword123",
                "name": "Metrics Contract",
            },
        )
        assert register.status_code == 200
        token = register.json()["session_token"]
        user_id = register.json()["user"]["id"]

        with session_scope() as session:
            work = Work(
                user_id=user_id,
                title="Contract Work",
                title_lower="contract work",
                year=2023,
                doi="10.1000/contract-work",
                venue_name="Contract Journal",
                journal="Contract Journal",
                publication_type="journal-article",
                citations_total=0,
                work_type="journal-article",
                publisher="Publisher",
                abstract="Contract abstract",
                keywords=["contract"],
                url="https://example.org/contract",
                provenance="manual",
            )
            session.add(work)
            session.flush()
            session.add(
                MetricsSnapshot(
                    work_id=str(work.id),
                    provider="openalex",
                    citations_count=14,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={"match_method": "doi"},
                    captured_at=datetime.now(timezone.utc) - timedelta(days=7),
                )
            )
        compute_publication_top_metrics(user_id=user_id)

        response = client.get("/v1/publications/metrics", headers=_auth_headers(token))
        assert response.status_code == 200
        payload = response.json()

    assert {
        "tiles",
        "data_sources",
        "data_last_refreshed",
        "metadata",
        "computed_at",
        "status",
        "is_stale",
        "is_updating",
        "last_error",
    }.issubset(payload.keys())
    assert isinstance(payload["tiles"], list)
    assert len(payload["tiles"]) >= 6
    first_tile = payload["tiles"][0]
    assert {
        "key",
        "label",
        "value",
        "value_display",
        "delta_value",
        "delta_display",
        "unit",
        "sparkline",
        "tooltip",
        "data_source",
        "stability",
        "drilldown",
    }.issubset(first_tile.keys())
    assert {
        "title",
        "definition",
        "formula",
        "confidence_note",
        "publications",
        "metadata",
    }.issubset(first_tile["drilldown"].keys())


def test_refresh_endpoint_returns_status(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics(email="refresh-status@example.com")
    compute_publication_top_metrics(user_id=user_id)

    with session_scope() as session:
        row = session.scalars(
            select(PublicationMetric).where(
                PublicationMetric.user_id == user_id,
                PublicationMetric.metric_key == TOP_METRICS_KEY,
            )
        ).first()
        assert row is not None
        row.status = "READY"
        session.flush()

    class _ImmediateExecutor:
        def submit(self, fn, *args, **kwargs):  # noqa: ANN001
            fn(*args, **kwargs)
            return None

    monkeypatch.setattr(publication_metrics_service, "_get_executor", lambda: _ImmediateExecutor())
    payload = publication_metrics_service.trigger_publication_top_metrics_refresh(user_id=user_id)
    assert payload["enqueued"] is True
    assert payload["status"] in {"RUNNING", "READY"}
    assert payload["metric_key"] == TOP_METRICS_KEY

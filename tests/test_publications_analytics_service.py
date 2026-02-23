from __future__ import annotations

from datetime import datetime
from datetime import timedelta
from datetime import timezone

from sqlalchemy import select

from research_os.db import (
    MetricsSnapshot,
    PublicationMetric,
    User,
    Work,
    create_all_tables,
    reset_database_state,
    session_scope,
)
from research_os.services.publications_analytics_service import (
    get_publications_analytics_summary,
    get_publications_analytics_timeseries,
    get_publications_analytics_top_drivers,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "research_os_test_publications_analytics.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    reset_database_state()


def _seed_user_with_metrics() -> str:
    now = datetime.now(timezone.utc)
    with session_scope() as session:
        user = User(
            email="analytics-user@example.com",
            password_hash="test-hash",
            name="Analytics User",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work_a = Work(
            user_id=user_id,
            title="Work A",
            title_lower="work a",
            year=2024,
            doi="10.1000/work-a",
            work_type="journal-article",
            venue_name="BMJ Open",
            publisher="BMJ",
            abstract="Work A abstract",
            keywords=["a"],
            url="https://example.org/a",
            provenance="manual",
            user_edited=False,
        )
        work_b = Work(
            user_id=user_id,
            title="Work B",
            title_lower="work b",
            year=2025,
            doi="10.1000/work-b",
            work_type="journal-article",
            venue_name="Heart",
            publisher="BMJ",
            abstract="Work B abstract",
            keywords=["b"],
            url="https://example.org/b",
            provenance="manual",
            user_edited=False,
        )
        session.add_all([work_a, work_b])
        session.flush()

        session.add_all(
            [
                MetricsSnapshot(
                    work_id=str(work_a.id),
                    provider="openalex",
                    citations_count=3,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={},
                    captured_at=now - timedelta(days=800),
                ),
                MetricsSnapshot(
                    work_id=str(work_a.id),
                    provider="openalex",
                    citations_count=10,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={},
                    captured_at=now - timedelta(days=400),
                ),
                MetricsSnapshot(
                    work_id=str(work_a.id),
                    provider="openalex",
                    citations_count=15,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={},
                    captured_at=now - timedelta(days=10),
                ),
                MetricsSnapshot(
                    work_id=str(work_b.id),
                    provider="openalex",
                    citations_count=5,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={},
                    captured_at=now - timedelta(days=400),
                ),
                MetricsSnapshot(
                    work_id=str(work_b.id),
                    provider="openalex",
                    citations_count=12,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={},
                    captured_at=now - timedelta(days=10),
                ),
            ]
        )
    return user_id


def test_publications_analytics_compute_and_store(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics()

    summary = get_publications_analytics_summary(
        user_id=user_id,
        refresh=True,
        refresh_metrics=False,
    )

    assert summary["total_citations"] == 27
    assert summary["h_index"] == 2
    assert summary["citations_last_12_months"] == 12
    assert summary["citations_previous_12_months"] == 12
    assert summary["yoy_percent"] == 0.0
    assert summary["citation_velocity_12m"] == 1.0
    assert isinstance(summary.get("computed_at"), str)

    with session_scope() as session:
        rows = session.scalars(
            select(PublicationMetric).where(PublicationMetric.user_id == user_id)
        ).all()
        keys = sorted(row.metric_key for row in rows)
    assert keys == ["summary", "timeseries", "top_drivers"]


def test_publications_analytics_timeseries_and_top_drivers(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics()

    _ = get_publications_analytics_summary(
        user_id=user_id,
        refresh=True,
        refresh_metrics=False,
    )
    timeseries = get_publications_analytics_timeseries(
        user_id=user_id,
        refresh=False,
        refresh_metrics=False,
    )
    top_drivers = get_publications_analytics_top_drivers(
        user_id=user_id,
        limit=1,
        refresh=False,
        refresh_metrics=False,
    )

    assert isinstance(timeseries.get("points"), list)
    assert len(timeseries["points"]) >= 1
    assert timeseries["points"][-1]["year"] <= datetime.now(timezone.utc).year
    assert len(top_drivers["drivers"]) == 1
    assert top_drivers["drivers"][0]["citations_last_12_months"] >= 5

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import research_os.services.publications_analytics_service as analytics_service
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
    compute_publications_analytics,
    enqueue_publications_analytics_recompute,
    get_publications_analytics,
    run_publications_analytics_scheduler_tick,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "research_os_test_publications_analytics.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("PUB_ANALYTICS_TTL_SECONDS", "86400")
    monkeypatch.setenv("PUB_ANALYTICS_SCHEDULE_HOURS", "24")
    monkeypatch.setenv("PUB_ANALYTICS_MAX_CONCURRENT_JOBS", "2")
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
            keywords=["cardiology"],
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
            keywords=["education"],
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


def _bundle_row(user_id: str) -> PublicationMetric:
    with session_scope() as session:
        row = session.scalars(
            analytics_service._bundle_row_query(user_id)
        ).first()
        assert row is not None
        session.expunge(row)
        return row


def test_compute_publications_analytics_persists_bundle(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics()
    monkeypatch.setattr(
        "research_os.services.publications_analytics_service._resolve_openalex_author_id",
        lambda **kwargs: "https://openalex.org/A123",
    )

    payload = compute_publications_analytics(user_id=user_id)

    assert payload["summary"]["total_citations"] == 27
    row = _bundle_row(user_id)
    assert row.metric_key == "bundle"
    assert row.status == "READY"
    assert row.openalex_author_id == "https://openalex.org/A123"
    assert isinstance(row.payload_json, dict)
    assert "summary" in row.payload_json


def test_yearly_counts_preferred_over_mismatched_baseline_snapshot(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    now = datetime.now(timezone.utc)

    with session_scope() as session:
        user = User(
            email="analytics-yearly-preferred@example.com",
            password_hash="test-hash",
            name="Analytics Yearly",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="Yearly preferred work",
            title_lower="yearly preferred work",
            year=2021,
            doi="10.1000/yearly-preferred-work",
            work_type="journal-article",
            venue_name="Journal",
            publisher="Publisher",
            abstract="Abstract",
            keywords=["metrics"],
            url="https://example.org/yearly",
            provenance="manual",
            user_edited=False,
        )
        session.add(work)
        session.flush()

        session.add_all(
            [
                MetricsSnapshot(
                    work_id=str(work.id),
                    provider="manual",
                    citations_count=0,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={"note": "manual baseline"},
                    captured_at=now - timedelta(days=500),
                ),
                MetricsSnapshot(
                    work_id=str(work.id),
                    provider="openalex",
                    citations_count=120,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={
                        "counts_by_year": [
                            {"year": now.year - 2, "cited_by_count": 40},
                            {"year": now.year - 1, "cited_by_count": 50},
                            {"year": now.year, "cited_by_count": 30},
                        ]
                    },
                    captured_at=now - timedelta(days=2),
                ),
            ]
        )

    monkeypatch.setattr(
        "research_os.services.publications_analytics_service._resolve_openalex_author_id",
        lambda **kwargs: None,
    )
    payload = compute_publications_analytics(user_id=user_id)
    summary = payload["summary"]
    assert int(summary["total_citations"]) == 120
    assert int(summary["citations_last_12_months"]) < 120


def test_stale_while_revalidate_returns_cache_and_enqueues(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics()
    compute_publications_analytics(user_id=user_id)

    old_time = datetime.now(timezone.utc) - timedelta(days=10)
    with session_scope() as session:
        row = session.scalars(analytics_service._bundle_row_query(user_id)).first()
        assert row is not None
        row.computed_at = old_time
        row.status = "READY"
        session.flush()

    enqueued: list[str] = []
    monkeypatch.setattr(
        "research_os.services.publications_analytics_service.enqueue_publications_analytics_recompute",
        lambda **kwargs: enqueued.append(str(kwargs["user_id"])) or True,
    )
    monkeypatch.setenv("PUB_ANALYTICS_TTL_SECONDS", "60")

    response = get_publications_analytics(user_id=user_id)

    assert response["payload"]["summary"]["total_citations"] == 27
    assert response["is_stale"] is True
    assert response["status"] == "RUNNING"
    assert enqueued == [user_id]


def test_lock_prevents_duplicate_enqueue(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics()
    compute_publications_analytics(user_id=user_id)

    with session_scope() as session:
        row = session.scalars(analytics_service._bundle_row_query(user_id)).first()
        assert row is not None
        row.status = "RUNNING"
        session.flush()

    assert enqueue_publications_analytics_recompute(user_id=user_id) is False

    with session_scope() as session:
        row = session.scalars(analytics_service._bundle_row_query(user_id)).first()
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
    monkeypatch.setattr(
        "research_os.services.publications_analytics_service._get_executor",
        lambda: dummy,
    )

    first = enqueue_publications_analytics_recompute(user_id=user_id, force=True)
    second = enqueue_publications_analytics_recompute(user_id=user_id, force=True)
    assert first is True
    assert second is False
    assert dummy.submits == 1


def test_failure_keeps_cached_payload_and_sets_failed(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics()
    cached = compute_publications_analytics(user_id=user_id)
    cached_total = int(cached["summary"]["total_citations"])

    class _ImmediateExecutor:
        def submit(self, fn, *args, **kwargs):  # noqa: ANN001
            fn(*args, **kwargs)
            return None

    monkeypatch.setattr(
        "research_os.services.publications_analytics_service._get_executor",
        lambda: _ImmediateExecutor(),
    )
    monkeypatch.setattr(
        "research_os.services.publications_analytics_service.compute_publications_analytics",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("upstream failure")),
    )

    queued = enqueue_publications_analytics_recompute(user_id=user_id, force=True)
    assert queued is True

    response = get_publications_analytics(user_id=user_id)
    assert response["status"] == "FAILED"
    assert response["last_update_failed"] is True
    assert response["payload"]["summary"]["total_citations"] == cached_total


def test_backoff_scheduling_sets_next_scheduled_at(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics()
    compute_publications_analytics(user_id=user_id)

    for expected_hours in (1, 3, 12):
        analytics_service._persist_failed_bundle(user_id=user_id, detail="failure")
        row = _bundle_row(user_id)
        now = datetime.now(timezone.utc)
        next_due = row.next_scheduled_at
        assert next_due is not None
        delta_hours = (_coerce_utc(next_due) - now).total_seconds() / 3600.0
        assert expected_hours - 0.2 <= delta_hours <= expected_hours + 0.2


def _coerce_utc(value: datetime | None) -> datetime:
    if value is None:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def test_scheduler_tick_invokes_enqueue_for_due_records(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics()
    compute_publications_analytics(user_id=user_id)

    with session_scope() as session:
        row = session.scalars(analytics_service._bundle_row_query(user_id)).first()
        assert row is not None
        row.status = "READY"
        row.next_scheduled_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        session.flush()

    monkeypatch.setattr(
        "research_os.services.publications_analytics_service._try_acquire_scheduler_leader",
        lambda now: True,
    )
    enqueued_users: list[str] = []
    monkeypatch.setattr(
        "research_os.services.publications_analytics_service.enqueue_publications_analytics_recompute",
        lambda **kwargs: enqueued_users.append(str(kwargs["user_id"])) or True,
    )

    count = run_publications_analytics_scheduler_tick()
    assert count >= 1
    assert user_id in enqueued_users


def test_scheduler_registers_interval_job(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    monkeypatch.setenv("PUB_ANALYTICS_SCHEDULE_HOURS", "6")

    captured: dict[str, Any] = {}

    class _FakeScheduler:
        def __init__(self, timezone: str | None = None):
            captured["timezone"] = timezone

        def add_job(self, fn, **kwargs):  # noqa: ANN001
            captured["job_fn"] = fn
            captured["job_kwargs"] = kwargs

        def start(self) -> None:
            captured["started"] = True

        def shutdown(self, wait: bool = False) -> None:
            captured["shutdown"] = wait

    monkeypatch.setattr(
        "research_os.services.publications_analytics_service.BackgroundScheduler",
        _FakeScheduler,
    )
    analytics_service.stop_publications_analytics_scheduler()
    analytics_service.start_publications_analytics_scheduler()
    analytics_service.stop_publications_analytics_scheduler()

    assert captured["timezone"] == "UTC"
    assert captured["started"] is True
    assert captured["job_fn"] == analytics_service.run_publications_analytics_scheduler_tick
    assert captured["job_kwargs"]["trigger"] == "interval"
    assert captured["job_kwargs"]["hours"] == 6

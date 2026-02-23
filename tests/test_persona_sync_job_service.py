from __future__ import annotations

from datetime import datetime, timezone

import pytest

from research_os.db import User, create_all_tables, reset_database_state, session_scope
import research_os.services.persona_sync_job_service as job_service
from research_os.services.persona_sync_job_service import (
    PersonaSyncJobConflictError,
    enqueue_persona_sync_job,
    get_persona_sync_job,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "research_os_test_persona_sync_jobs.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    reset_database_state()


def _seed_user() -> str:
    create_all_tables()
    with session_scope() as session:
        user = User(
            email="persona-sync-user@example.com",
            password_hash="test-hash",
            name="Persona Sync User",
        )
        session.add(user)
        session.flush()
        return str(user.id)


def test_enqueue_metrics_sync_job_completes_and_stores_result(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id = _seed_user()

    monkeypatch.setattr(
        "research_os.services.persona_sync_job_service.sync_metrics",
        lambda user_id, providers: {
            "synced_snapshots": 4,
            "provider_attribution": {"openalex": 4},
            "core_collaborators": [],
        },
    )
    monkeypatch.setattr(
        "research_os.services.persona_sync_job_service.get_publications_analytics_summary",
        lambda **kwargs: {
            "total_citations": 123,
            "h_index": 4,
            "citation_velocity_12m": 1.0,
            "citations_last_12_months": 12,
            "citations_previous_12_months": 9,
            "yoy_percent": 33.3,
            "computed_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    monkeypatch.setattr(
        "research_os.services.persona_sync_job_service._start_persona_sync_thread",
        lambda job_id: job_service._run_persona_sync_job(job_id),
    )

    job = enqueue_persona_sync_job(
        user_id=user_id,
        job_type="metrics_sync",
        providers=["openalex"],
        refresh_analytics=True,
    )

    fetched = get_persona_sync_job(user_id=user_id, job_id=str(job.id))
    payload = job_service.serialize_persona_sync_job(fetched)
    assert payload["status"] == "completed"
    assert payload["progress_percent"] == 100
    assert "metrics_sync" in payload["result_json"]
    assert "analytics_summary" in payload["result_json"]


def test_enqueue_persona_sync_job_conflicts_when_active_job_exists(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    user_id = _seed_user()

    # Keep first job queued to simulate an active in-flight job.
    monkeypatch.setattr(
        "research_os.services.persona_sync_job_service._start_persona_sync_thread",
        lambda job_id: None,
    )

    _ = enqueue_persona_sync_job(
        user_id=user_id,
        job_type="metrics_sync",
        providers=["openalex"],
    )
    with pytest.raises(PersonaSyncJobConflictError):
        _ = enqueue_persona_sync_job(
            user_id=user_id,
            job_type="orcid_import",
            providers=["openalex"],
        )

from __future__ import annotations

from datetime import timedelta

from research_os.services import open_access_sync_scheduler_service as scheduler


def test_oa_scheduler_cooldown_respects_missing_retry(monkeypatch):
    now = scheduler._utcnow()
    scheduler._attempt_cache.clear()
    monkeypatch.setattr(
        scheduler,
        "_missing_retry_hours",
        lambda: 6,
    )
    scheduler._attempt_cache["pub-1"] = (now - timedelta(hours=5), "missing")

    assert scheduler._should_attempt("pub-1", now) is False
    assert scheduler._should_attempt("pub-1", now + timedelta(hours=1, minutes=1)) is True


def test_oa_scheduler_marks_available_as_long_lived():
    now = scheduler._utcnow()
    scheduler._attempt_cache.clear()
    scheduler._attempt_cache["pub-2"] = (now, "available")

    assert scheduler._should_attempt("pub-2", now + timedelta(days=30)) is False


def test_oa_scheduler_prunes_stale_cache_entries():
    now = scheduler._utcnow()
    scheduler._attempt_cache.clear()
    scheduler._attempt_cache["old-pub"] = (now - timedelta(days=15), "missing")
    scheduler._attempt_cache["fresh-pub"] = (now - timedelta(days=1), "missing")

    scheduler._prune_attempt_cache(now)

    assert "old-pub" not in scheduler._attempt_cache
    assert "fresh-pub" in scheduler._attempt_cache

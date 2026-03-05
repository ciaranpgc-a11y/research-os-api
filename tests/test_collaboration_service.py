from __future__ import annotations

from datetime import datetime, timedelta, timezone

import research_os.services.collaboration_service as collaboration_service
from sqlalchemy import func, select

from research_os.db import (
    Collaborator,
    CollaborationMetric,
    User,
    Work,
    create_all_tables,
    reset_database_state,
    session_scope,
)
from research_os.services.collaboration_service import (
    CollaborationNotFoundError,
    CollaborationValidationError,
    create_collaborator_for_user,
    enqueue_collaboration_metrics_recompute,
    get_collaboration_metrics_summary,
    get_collaborator_for_user,
    import_collaborators_from_openalex,
    list_collaborators_for_user,
    run_collaboration_metrics_scheduler_tick,
    validate_orcid_id,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "research_os_test_collaboration.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("COLLAB_ANALYTICS_TTL_SECONDS", "86400")
    monkeypatch.setenv("COLLAB_ANALYTICS_SCHEDULE_HOURS", "24")
    monkeypatch.setenv("COLLAB_ANALYTICS_MAX_CONCURRENT_JOBS", "2")
    reset_database_state()


def _seed_user(*, email: str, orcid_id: str | None = None) -> str:
    with session_scope() as session:
        user = User(
            email=email,
            password_hash="test-hash",
            name="Collab User",
            orcid_id=orcid_id,
        )
        session.add(user)
        session.flush()
        return str(user.id)


def test_orcid_validation_accepts_valid_and_rejects_invalid() -> None:
    assert validate_orcid_id("0000-0002-1825-0097") == "0000-0002-1825-0097"
    assert (
        validate_orcid_id("https://orcid.org/0000-0002-1825-0097")
        == "0000-0002-1825-0097"
    )
    assert validate_orcid_id(None) is None
    try:
        validate_orcid_id("0000-0002-1825-0098")
    except CollaborationValidationError:
        assert True
    else:  # pragma: no cover
        raise AssertionError("Expected ORCID checksum validation to fail.")


def test_collaborator_crud_is_scoped_to_user(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_a = _seed_user(email="user-a@example.com")
    user_b = _seed_user(email="user-b@example.com")
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **_: True,
    )

    created = create_collaborator_for_user(
        user_id=user_a,
        payload={
            "full_name": "Alice Example",
            "primary_institution": "AAWE Institute",
            "research_domains": ["Cardiology"],
        },
    )

    fetched = get_collaborator_for_user(
        user_id=user_a,
        collaborator_id=created["id"],
    )
    assert fetched["full_name"] == "Alice Example"

    try:
        get_collaborator_for_user(
            user_id=user_b,
            collaborator_id=created["id"],
        )
    except CollaborationNotFoundError:
        assert True
    else:  # pragma: no cover
        raise AssertionError("Expected cross-user lookup to be blocked.")


def test_import_mapping_logic_matches_orcid_openalex_and_name(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(
        email="import-user@example.com",
        orcid_id="0000-0002-1825-0097",
    )
    with session_scope() as session:
        session.add_all(
            [
                Collaborator(
                    owner_user_id=user_id,
                    full_name="ORCID Match",
                    full_name_lower="orcid match",
                    orcid_id="0000-0003-1234-5674",
                    openalex_author_id=None,
                    primary_institution=None,
                    country=None,
                    research_domains=[],
                ),
                Collaborator(
                    owner_user_id=user_id,
                    full_name="OpenAlex Match",
                    full_name_lower="openalex match",
                    orcid_id=None,
                    openalex_author_id="https://openalex.org/A-OPEN-1",
                    primary_institution=None,
                    country=None,
                    research_domains=[],
                ),
                Collaborator(
                    owner_user_id=user_id,
                    full_name="Jane Similar",
                    full_name_lower="jane similar",
                    orcid_id=None,
                    openalex_author_id=None,
                    primary_institution="St Mary's Hospital",
                    country=None,
                    research_domains=[],
                ),
            ]
        )
        session.flush()
    monkeypatch.setattr(
        "research_os.services.collaboration_service._resolve_openalex_author_id",
        lambda **kwargs: "https://openalex.org/A-USER",
    )
    monkeypatch.setattr(
        "research_os.services.collaboration_service._iter_openalex_coauthors",
        lambda **kwargs: [
            {
                "full_name": "ORCID Match",
                "orcid_id": "0000-0003-1234-5674",
                "openalex_author_id": "https://openalex.org/A-ORCID-1",
                "primary_institution": "Institution A",
                "country": "GB",
                "shared_openalex_work_ids": ["W1"],
            },
            {
                "full_name": "OpenAlex Match",
                "orcid_id": None,
                "openalex_author_id": "https://openalex.org/A-OPEN-1",
                "primary_institution": "Institution B",
                "country": "US",
                "shared_openalex_work_ids": ["W2"],
            },
            {
                "full_name": "Jane Similar",
                "orcid_id": None,
                "openalex_author_id": None,
                "primary_institution": "St Marys Hospital",
                "country": "GB",
                "shared_openalex_work_ids": ["W3"],
            },
            {
                "full_name": "Brand New Collaborator",
                "orcid_id": "0000-0001-0000-0009",
                "openalex_author_id": "https://openalex.org/A-NEW-1",
                "primary_institution": "Institution C",
                "country": "IE",
                "shared_openalex_work_ids": ["W4"],
            },
        ],
    )
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **_: True,
    )

    payload = import_collaborators_from_openalex(user_id=user_id)

    assert payload["created_count"] == 1
    assert payload["updated_count"] == 3
    assert payload["skipped_count"] == 0
    with session_scope() as session:
        total = session.scalar(
            select(func.count())
            .select_from(Collaborator)
            .where(Collaborator.owner_user_id == user_id)
        )
        assert int(total or 0) == 4


def test_list_collaborators_dedupes_openalex_id_format_variants(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="openalex-dedupe@example.com")
    with session_scope() as session:
        session.add_all(
            [
                Collaborator(
                    owner_user_id=user_id,
                    full_name="Case Variant",
                    full_name_lower="case variant",
                    openalex_author_id="A12345",
                    primary_institution="Institute One",
                ),
                Collaborator(
                    owner_user_id=user_id,
                    full_name="Case Variant",
                    full_name_lower="case variant",
                    openalex_author_id="https://openalex.org/a12345/",
                    primary_institution="Institute Two",
                ),
            ]
        )
        session.flush()

    listing = list_collaborators_for_user(user_id=user_id, page=1, page_size=50)
    assert listing["total"] == 1
    assert len(listing["items"]) == 1
    first = listing["items"][0]
    assert first["duplicate_count"] == 2
    assert sorted(first["institution_labels"]) == ["Institute One", "Institute Two"]

    summary = get_collaboration_metrics_summary(user_id=user_id)
    assert summary["total_collaborators"] == 1


def test_enrich_openalex_fills_missing_collaborator_fields(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="enrich-user@example.com")
    with session_scope() as session:
        collaborator = Collaborator(
            owner_user_id=user_id,
            full_name="Enrich Collaborator",
            full_name_lower="enrich collaborator",
            openalex_author_id="https://openalex.org/A123",
            research_domains=[],
        )
        session.add(collaborator)
        session.flush()
        session.add(
            CollaborationMetric(
                owner_user_id=user_id,
                collaborator_id=collaborator.id,
                status="READY",
                source_json={"formula_version": "test", "failures_in_row": 0},
            )
        )
        session.flush()
    monkeypatch.setattr(
        "research_os.services.collaboration_service._openalex_request_with_retry",
        lambda **kwargs: (
            {
                "id": "https://openalex.org/A123",
                "orcid": "https://orcid.org/0000-0002-1825-0097",
                "last_known_institutions": [
                    {
                        "display_name": "OpenAlex University",
                        "country_code": "GB",
                    }
                ],
                "topics": [
                    {"display_name": "Cardiovascular Imaging", "score": 0.88},
                    {"display_name": "Population Health", "score": 0.71},
                ],
            }
            if str(kwargs.get("url") or "").endswith("/authors/A123")
            else {}
        ),
    )
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **_: True,
    )

    payload = collaboration_service.enrich_collaborators_from_openalex(
        user_id=user_id,
        only_missing=True,
        limit=50,
    )

    assert payload["targeted_count"] == 1
    assert payload["resolved_author_count"] == 1
    assert payload["updated_count"] == 1
    assert payload["field_updates"]["orcid_id"] == 1
    assert payload["field_updates"]["primary_institution"] == 1
    assert payload["field_updates"]["country"] == 1
    assert payload["field_updates"]["research_domains"] == 1
    with session_scope() as session:
        row = session.scalars(
            select(Collaborator).where(Collaborator.owner_user_id == user_id)
        ).first()
        assert row is not None
        assert row.orcid_id == "0000-0002-1825-0097"
        assert row.primary_institution == "OpenAlex University"
        assert row.country == "GB"
        assert row.research_domains[:2] == [
            "Cardiovascular Imaging",
            "Population Health",
        ]


def test_enrich_openalex_fallbacks_to_publication_author_cache(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="enrich-fallback-user@example.com")
    with session_scope() as session:
        collaborator = Collaborator(
            owner_user_id=user_id,
            full_name="Fallback Collaborator",
            full_name_lower="fallback collaborator",
            openalex_author_id=None,
            research_domains=[],
        )
        session.add(collaborator)
        session.add(
            Work(
                user_id=user_id,
                title="Cross-source trial",
                title_lower="cross-source trial",
                year=2025,
                keywords=["Cardiology", "Clinical trials"],
                authors_json=[
                    {
                        "name": "Fallback Collaborator",
                        "orcid_id": "0000-0002-1825-0097",
                        "affiliations": ["Crossref University"],
                    }
                ],
                affiliations_json=[
                    {"name": "Crossref University", "country_code": "US"}
                ],
            )
        )
        session.flush()
    monkeypatch.setattr(
        "research_os.services.collaboration_service._openalex_request_with_retry",
        lambda **kwargs: (
            {"results": [{"id": "https://openalex.org/A999"}]}
            if str(kwargs.get("url") or "").endswith("/authors")
            else {}
        ),
    )
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **_: True,
    )

    payload = collaboration_service.enrich_collaborators_from_openalex(
        user_id=user_id,
        only_missing=True,
        limit=50,
    )

    assert payload["targeted_count"] == 1
    assert payload["resolved_author_count"] == 1
    assert payload["updated_count"] == 1
    assert payload["failed_count"] == 1
    assert payload["field_updates"]["openalex_author_id"] == 1
    assert payload["field_updates"]["orcid_id"] == 1
    assert payload["field_updates"]["primary_institution"] == 1
    assert payload["field_updates"]["country"] == 1
    assert payload["field_updates"]["research_domains"] == 1
    with session_scope() as session:
        row = session.scalars(
            select(Collaborator).where(Collaborator.owner_user_id == user_id)
        ).first()
        assert row is not None
        assert row.openalex_author_id == "https://openalex.org/A999"
        assert row.orcid_id == "0000-0002-1825-0097"
        assert row.primary_institution == "Crossref University"
        assert row.country == "US"
        assert row.research_domains[:2] == ["Cardiology", "Clinical trials"]


def test_stale_while_revalidate_returns_cache_and_enqueues(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="stale-user@example.com")
    with session_scope() as session:
        collaborator = Collaborator(
            owner_user_id=user_id,
            full_name="Stale Collaborator",
            full_name_lower="stale collaborator",
            research_domains=[],
        )
        session.add(collaborator)
        session.flush()
        session.add(
            CollaborationMetric(
                owner_user_id=user_id,
                collaborator_id=collaborator.id,
                coauthored_works_count=4,
                shared_citations_total=55,
                classification="CORE",
                computed_at=datetime.now(timezone.utc) - timedelta(days=7),
                status="READY",
                source_json={"formula_version": "test", "failures_in_row": 0},
            )
        )
        session.flush()
    monkeypatch.setenv("COLLAB_ANALYTICS_TTL_SECONDS", "60")
    enqueued: list[str] = []
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **kwargs: enqueued.append(str(kwargs["user_id"])) or True,
    )

    payload = get_collaboration_metrics_summary(user_id=user_id)

    assert payload["core_collaborators"] == 1
    assert payload["is_stale"] is True
    assert payload["status"] == "RUNNING"
    assert enqueued == [user_id]


def test_summary_new_collaborators_uses_first_collaboration_year(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="summary-window-user@example.com")
    now = datetime.now(timezone.utc)
    with session_scope() as session:
        historic = Collaborator(
            owner_user_id=user_id,
            full_name="Historic Import",
            full_name_lower="historic import",
            research_domains=[],
            created_at=now,
            updated_at=now,
        )
        recent = Collaborator(
            owner_user_id=user_id,
            full_name="Recent Collaborator",
            full_name_lower="recent collaborator",
            research_domains=[],
            created_at=now,
            updated_at=now,
        )
        session.add_all([historic, recent])
        session.flush()
        session.add_all(
            [
                CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=historic.id,
                    coauthored_works_count=7,
                    shared_citations_total=120,
                    first_collaboration_year=now.year - 6,
                    last_collaboration_year=now.year,
                    citations_last_12m=12,
                    classification="ACTIVE",
                    computed_at=now,
                    status="READY",
                    source_json={"formula_version": "test", "failures_in_row": 0},
                ),
                CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=recent.id,
                    coauthored_works_count=3,
                    shared_citations_total=45,
                    first_collaboration_year=now.year,
                    last_collaboration_year=now.year,
                    citations_last_12m=8,
                    classification="ACTIVE",
                    computed_at=now,
                    status="READY",
                    source_json={"formula_version": "test", "failures_in_row": 0},
                ),
            ]
        )
        session.flush()

    payload = get_collaboration_metrics_summary(user_id=user_id)

    assert payload["total_collaborators"] == 2
    assert payload["new_collaborators_12m"] == 1


def test_list_collaborators_dedupes_same_identity_and_merges_institutions(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="dedupe-list-user@example.com")
    with session_scope() as session:
        first = Collaborator(
            owner_user_id=user_id,
            full_name="Alex Researcher",
            full_name_lower="alex researcher",
            openalex_author_id="https://openalex.org/A123",
            primary_institution="University A",
            research_domains=["AI"],
        )
        second = Collaborator(
            owner_user_id=user_id,
            full_name="Alex Researcher",
            full_name_lower="alex researcher",
            openalex_author_id="https://openalex.org/A123",
            primary_institution="University B",
            research_domains=["Networks"],
        )
        session.add_all([first, second])
        session.flush()
        session.add_all(
            [
                CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=first.id,
                    coauthored_works_count=7,
                    shared_citations_total=90,
                    first_collaboration_year=2019,
                    last_collaboration_year=2025,
                    citations_last_12m=14,
                    collaboration_strength_score=0.88,
                    classification="CORE",
                    computed_at=datetime.now(timezone.utc),
                    status="READY",
                    source_json={"formula_version": "test", "failures_in_row": 0},
                ),
                CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=second.id,
                    coauthored_works_count=5,
                    shared_citations_total=60,
                    first_collaboration_year=2021,
                    last_collaboration_year=2024,
                    citations_last_12m=8,
                    collaboration_strength_score=0.71,
                    classification="ACTIVE",
                    computed_at=datetime.now(timezone.utc),
                    status="READY",
                    source_json={"formula_version": "test", "failures_in_row": 0},
                ),
            ]
        )
        session.flush()

    payload = list_collaborators_for_user(user_id=user_id, page=1, page_size=50)

    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["duplicate_count"] == 2
    assert "University A" in (item.get("institution_labels") or [])
    assert "University B" in (item.get("institution_labels") or [])
    assert item["metrics"]["coauthored_works_count"] == 7


def test_summary_dedupes_same_identity(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="dedupe-summary-user@example.com")
    now = datetime.now(timezone.utc)
    with session_scope() as session:
        first = Collaborator(
            owner_user_id=user_id,
            full_name="Jordan Scientist",
            full_name_lower="jordan scientist",
            openalex_author_id="https://openalex.org/A456",
            research_domains=[],
            created_at=now,
            updated_at=now,
        )
        second = Collaborator(
            owner_user_id=user_id,
            full_name="Jordan Scientist",
            full_name_lower="jordan scientist",
            openalex_author_id="https://openalex.org/A456",
            research_domains=[],
            created_at=now,
            updated_at=now,
        )
        session.add_all([first, second])
        session.flush()
        session.add_all(
            [
                CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=first.id,
                    coauthored_works_count=4,
                    shared_citations_total=50,
                    first_collaboration_year=now.year,
                    last_collaboration_year=now.year,
                    citations_last_12m=6,
                    classification="ACTIVE",
                    computed_at=now,
                    status="READY",
                    source_json={"formula_version": "test", "failures_in_row": 0},
                ),
                CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=second.id,
                    coauthored_works_count=3,
                    shared_citations_total=40,
                    first_collaboration_year=now.year,
                    last_collaboration_year=now.year,
                    citations_last_12m=4,
                    classification="ACTIVE",
                    computed_at=now,
                    status="READY",
                    source_json={"formula_version": "test", "failures_in_row": 0},
                ),
            ]
        )
        session.flush()

    payload = get_collaboration_metrics_summary(user_id=user_id)

    assert payload["total_collaborators"] == 1
    assert payload["active_collaborations_12m"] == 1
    assert payload["new_collaborators_12m"] == 1


def test_lock_prevents_duplicate_enqueue(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="lock-user@example.com")
    with session_scope() as session:
        collaborator = Collaborator(
            owner_user_id=user_id,
            full_name="Lock Collaborator",
            full_name_lower="lock collaborator",
            research_domains=[],
        )
        session.add(collaborator)
        session.flush()
        session.add(
            CollaborationMetric(
                owner_user_id=user_id,
                collaborator_id=collaborator.id,
                status="RUNNING",
                source_json={"formula_version": "test", "failures_in_row": 0},
            )
        )
        session.flush()

    assert enqueue_collaboration_metrics_recompute(user_id=user_id) is False

    with session_scope() as session:
        row = session.scalars(
            select(CollaborationMetric).where(
                CollaborationMetric.owner_user_id == user_id
            )
        ).first()
        assert row is not None
        row.status = "READY"
        row.computed_at = datetime.now(timezone.utc) - timedelta(days=2)
        session.flush()

    class _DummyExecutor:
        def __init__(self) -> None:
            self.submits = 0

        def submit(self, fn, *args, **kwargs):  # noqa: ANN001
            self.submits += 1
            return None

    dummy = _DummyExecutor()
    monkeypatch.setattr(
        "research_os.services.collaboration_service._get_executor",
        lambda: dummy,
    )
    monkeypatch.setenv("COLLAB_ANALYTICS_TTL_SECONDS", "60")
    first = enqueue_collaboration_metrics_recompute(user_id=user_id, force=True)
    second = enqueue_collaboration_metrics_recompute(user_id=user_id, force=True)
    assert first is True
    assert second is False
    assert dummy.submits == 1


def test_failure_keeps_cached_and_sets_failed(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="fail-user@example.com")
    with session_scope() as session:
        collaborator = Collaborator(
            owner_user_id=user_id,
            full_name="Fail Collaborator",
            full_name_lower="fail collaborator",
            research_domains=[],
        )
        session.add(collaborator)
        session.flush()
        session.add(
            CollaborationMetric(
                owner_user_id=user_id,
                collaborator_id=collaborator.id,
                coauthored_works_count=9,
                shared_citations_total=101,
                status="RUNNING",
                source_json={"formula_version": "test", "failures_in_row": 0},
                computed_at=datetime.now(timezone.utc) - timedelta(hours=2),
            )
        )
        session.flush()

    monkeypatch.setattr(
        "research_os.services.collaboration_service.compute_collaboration_metrics",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    collaboration_service._run_background_compute(user_id)
    with session_scope() as session:
        row = session.scalars(
            select(CollaborationMetric).where(
                CollaborationMetric.owner_user_id == user_id
            )
        ).first()
        assert row is not None
        assert row.status == "FAILED"
        assert "boom" in str(row.last_error or "")
        assert row.shared_citations_total == 101


def test_backoff_scheduling_progression(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="backoff-user@example.com")
    with session_scope() as session:
        collaborator = Collaborator(
            owner_user_id=user_id,
            full_name="Backoff Collaborator",
            full_name_lower="backoff collaborator",
            research_domains=[],
        )
        session.add(collaborator)
        session.flush()
        session.add(
            CollaborationMetric(
                owner_user_id=user_id,
                collaborator_id=collaborator.id,
                status="RUNNING",
                source_json={"formula_version": "test", "failures_in_row": 0},
            )
        )
        session.flush()

    now_a = datetime.now(timezone.utc)
    collaboration_service._persist_failed(user_id=user_id, detail="first")
    with session_scope() as session:
        row = session.scalars(
            select(CollaborationMetric).where(
                CollaborationMetric.owner_user_id == user_id
            )
        ).first()
        assert row is not None
        first_delay = (
            collaboration_service._coerce_utc(row.next_scheduled_at) - now_a
        ).total_seconds()
        assert 3500 <= first_delay <= 3800

    now_b = datetime.now(timezone.utc)
    collaboration_service._persist_failed(user_id=user_id, detail="second")
    with session_scope() as session:
        row = session.scalars(
            select(CollaborationMetric).where(
                CollaborationMetric.owner_user_id == user_id
            )
        ).first()
        assert row is not None
        second_delay = (
            collaboration_service._coerce_utc(row.next_scheduled_at) - now_b
        ).total_seconds()
        assert 10_600 <= second_delay <= 11_200


def test_scheduler_tick_enqueues_due_users(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="scheduler-user@example.com")
    with session_scope() as session:
        collaborator = Collaborator(
            owner_user_id=user_id,
            full_name="Scheduler Collaborator",
            full_name_lower="scheduler collaborator",
            research_domains=[],
        )
        session.add(collaborator)
        session.flush()
        session.add(
            CollaborationMetric(
                owner_user_id=user_id,
                collaborator_id=collaborator.id,
                status="READY",
                computed_at=datetime.now(timezone.utc) - timedelta(days=5),
                source_json={"formula_version": "test", "failures_in_row": 0},
            )
        )
        session.flush()
    monkeypatch.setenv("COLLAB_ANALYTICS_TTL_SECONDS", "60")
    monkeypatch.setattr(
        "research_os.services.collaboration_service._try_acquire_scheduler_leader",
        lambda now: True,
    )
    enqueued: list[str] = []
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **kwargs: enqueued.append(str(kwargs["user_id"])) or True,
    )

    count = run_collaboration_metrics_scheduler_tick()

    assert count >= 1
    assert user_id in enqueued

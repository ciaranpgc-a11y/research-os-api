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
    update_collaborator_for_user,
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


def test_create_collaborator_blocks_duplicate_identity(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="duplicate-create@example.com")
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **_: True,
    )

    create_collaborator_for_user(
        user_id=user_id,
        payload={
            "full_name": "Alice Example",
            "orcid_id": "0000-0002-1825-0097",
            "primary_institution": "AAWE Institute",
        },
    )

    try:
        create_collaborator_for_user(
            user_id=user_id,
            payload={
                "full_name": "Alice Example",
                "orcid_id": "0000-0002-1825-0097",
                "primary_institution": "AAWE Institute",
            },
        )
    except CollaborationValidationError as exc:
        assert "already exists" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("Expected duplicate collaborator creation to be blocked.")


def test_update_collaborator_blocks_identity_collision(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="duplicate-update@example.com")
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **_: True,
    )

    first = create_collaborator_for_user(
        user_id=user_id,
        payload={
            "full_name": "Alice Example",
            "email": "alice@example.com",
            "primary_institution": "AAWE Institute",
        },
    )
    second = create_collaborator_for_user(
        user_id=user_id,
        payload={
            "full_name": "Bob Example",
            "email": "bob@example.com",
            "primary_institution": "Elsewhere Institute",
        },
    )

    try:
        update_collaborator_for_user(
            user_id=user_id,
            collaborator_id=second["id"],
            payload={"email": "alice@example.com"},
        )
    except CollaborationValidationError as exc:
        assert "duplicate" in str(exc).lower()
    else:  # pragma: no cover
        raise AssertionError("Expected duplicate collaborator update to be blocked.")


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


def test_import_collaborators_uses_user_openalex_id_without_orcid(
    monkeypatch,
    tmp_path,
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="import-no-orcid@example.com", orcid_id=None)
    with session_scope() as session:
        user = session.get(User, user_id)
        assert user is not None
        user.openalex_author_id = "A12345"
        session.flush()

    def _should_not_resolve_author_id(**kwargs):
        raise AssertionError("_resolve_openalex_author_id should not be called")

    monkeypatch.setattr(
        "research_os.services.collaboration_service._resolve_openalex_author_id",
        _should_not_resolve_author_id,
    )
    monkeypatch.setattr(
        "research_os.services.collaboration_service._iter_openalex_coauthors",
        lambda **kwargs: [
            {
                "full_name": "OpenAlex Only Collaborator",
                "orcid_id": None,
                "openalex_author_id": "https://openalex.org/A777",
                "primary_institution": "Institute OA",
                "country": "GB",
                "shared_openalex_work_ids": ["W777"],
            }
        ],
    )
    monkeypatch.setattr(
        "research_os.services.collaboration_service.enqueue_collaboration_metrics_recompute",
        lambda **_: True,
    )

    payload = import_collaborators_from_openalex(user_id=user_id)

    assert payload["created_count"] == 1
    assert payload["updated_count"] == 0
    assert payload["skipped_count"] == 0
    assert payload["openalex_author_id"] == "https://openalex.org/A12345"
    assert payload["imported_candidates"] == 1


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


# ---------------------------------------------------------------------------
# Name matching / initial-compatible tests
# ---------------------------------------------------------------------------

def test_parse_name_parts():
    from research_os.services.collaboration_service import _parse_name_parts

    assert _parse_name_parts("Gareth Matthews") == ("matthews", ["gareth"])
    assert _parse_name_parts("Gareth J. Matthews") == ("matthews", ["gareth", "j"])
    assert _parse_name_parts("G. Matthews") == ("matthews", ["g"])
    assert _parse_name_parts("G. J. Matthews") == ("matthews", ["g", "j"])
    assert _parse_name_parts("Matthews, Gareth") == ("matthews", ["gareth"])
    assert _parse_name_parts("Matthews, Gareth James") == ("matthews", ["gareth", "james"])
    assert _parse_name_parts("") == ("", [])
    assert _parse_name_parts("Madonna") == ("madonna", [])
    # Compound surnames with particles
    assert _parse_name_parts("Rob J. van der Geest") == ("van der geest", ["rob", "j"])
    assert _parse_name_parts("van der Geest R") == ("van der geest", ["r"])
    assert _parse_name_parts("van der Geest, R.") == ("van der geest", ["r"])
    assert _parse_name_parts("Maria de la Cruz") == ("de la cruz", ["maria"])
    assert _parse_name_parts("de la Cruz M") == ("de la cruz", ["m"])


def test_name_initial_compatible_positive():
    from research_os.services.collaboration_service import _name_initial_compatible

    # Same person, different full-name formats
    assert _name_initial_compatible("Gareth Matthews", "Gareth J. Matthews")
    assert _name_initial_compatible("Matthews, Gareth", "Gareth Matthews")
    assert _name_initial_compatible("Gareth Matthews", "Gareth Matthews")
    assert _name_initial_compatible("Rob J. van der Geest", "van der Geest, Rob")


def test_name_initial_compatible_negative():
    from research_os.services.collaboration_service import _name_initial_compatible

    # Different people or ambiguous abbreviations — must NOT match
    assert not _name_initial_compatible("Gareth Matthews", "G. Matthews")
    assert not _name_initial_compatible("Gareth James Matthews", "G. J. Matthews")
    assert not _name_initial_compatible("Matthews, G.", "Gareth Matthews")
    assert not _name_initial_compatible("G Matthews", "Gareth Matthews")
    assert not _name_initial_compatible("Alice Swift", "A. Swift")
    assert not _name_initial_compatible("Pankaj Garg", "Puspendra Garg")
    assert not _name_initial_compatible("Alice Matthews", "Gareth Matthews")
    assert not _name_initial_compatible("Gareth Matthews", "Gareth Smith")
    assert not _name_initial_compatible("Gareth A. Matthews", "Gareth B. Matthews")
    assert not _name_initial_compatible("", "Gareth Matthews")
    assert not _name_initial_compatible("Madonna", "Gareth Matthews")


def test_list_collaborators_groups_full_first_name_variants(monkeypatch, tmp_path):
    """Full first-name variants at the same institution are grouped."""
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="name-variants@example.com")

    with session_scope() as session:
        names = [
            "Gareth Matthews",
            "Gareth J. Matthews",
        ]
        for name in names:
            session.add(
                Collaborator(
                    owner_user_id=user_id,
                    full_name=name,
                    full_name_lower=name.lower(),
                    primary_institution="Norfolk and Norwich University Hospitals NHS Foundation Trust",
                    research_domains=[],
                )
            )
            session.flush()

        for collab in session.scalars(
            select(Collaborator).where(Collaborator.owner_user_id == user_id)
        ).all():
            session.add(
                CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=collab.id,
                    status="READY",
                )
            )
        session.flush()

    result = list_collaborators_for_user(user_id=user_id)
    # Both rows should be grouped into a single canonical entry.
    assert result["total"] == 1, (
        f"Expected 1 grouped collaborator but got {result['total']}: "
        + ", ".join(item["full_name"] for item in result["items"])
    )
    item = result["items"][0]
    assert item["duplicate_count"] == 2


def test_list_collaborators_does_not_group_different_people(monkeypatch, tmp_path):
    """Same surname, different first initial, same institution — must stay separate."""
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="different-people@example.com")

    with session_scope() as session:
        for name in ["Gareth Matthews", "Alice Matthews"]:
            session.add(
                Collaborator(
                    owner_user_id=user_id,
                    full_name=name,
                    full_name_lower=name.lower(),
                    primary_institution="Norfolk and Norwich University Hospitals NHS Foundation Trust",
                    research_domains=[],
                )
            )
            session.flush()

        for collab in session.scalars(
            select(Collaborator).where(Collaborator.owner_user_id == user_id)
        ).all():
            session.add(
                CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=collab.id,
                    status="READY",
                )
            )
        session.flush()

    result = list_collaborators_for_user(user_id=user_id)
    assert result["total"] == 2, (
        f"Expected 2 separate collaborators but got {result['total']}"
    )


def test_singleton_no_institution_filtered_out(monkeypatch, tmp_path):
    """A singleton collaborator with no institution is removed from results."""
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="no-inst-filter@example.com")

    with session_scope() as session:
        # One with institution, one without
        session.add(
            Collaborator(
                owner_user_id=user_id,
                full_name="Alice Swift",
                full_name_lower="alice swift",
                primary_institution="University of Oxford",
                research_domains=[],
            )
        )
        session.add(
            Collaborator(
                owner_user_id=user_id,
                full_name="Bob Alone",
                full_name_lower="bob alone",
                primary_institution="",
                research_domains=[],
            )
        )
        session.flush()

        for collab in session.scalars(
            select(Collaborator).where(Collaborator.owner_user_id == user_id)
        ).all():
            session.add(
                CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=collab.id,
                    status="READY",
                )
            )
        session.flush()

    result = list_collaborators_for_user(user_id=user_id)
    # Bob (no institution, no group) should be filtered out
    assert result["total"] == 1, (
        f"Expected 1 collaborator but got {result['total']}: "
        + ", ".join(item["full_name"] for item in result["items"])
    )
    assert result["items"][0]["full_name"] == "Alice Swift"


def test_no_institution_does_not_merge_with_abbreviated_first_name(monkeypatch, tmp_path):
    """A. Swift can be a different person from Alice Swift and must stay separate."""
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="initial-merge@example.com")

    with session_scope() as session:
        session.add(
            Collaborator(
                owner_user_id=user_id,
                full_name="Alice Swift",
                full_name_lower="alice swift",
                primary_institution="University of Oxford",
                research_domains=[],
            )
        )
        session.add(
            Collaborator(
                owner_user_id=user_id,
                full_name="A. Swift",
                full_name_lower="a. swift",
                primary_institution="",
                research_domains=[],
            )
        )
        session.flush()

        for collab in session.scalars(
            select(Collaborator).where(Collaborator.owner_user_id == user_id)
        ).all():
            session.add(
                CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=collab.id,
                    status="READY",
                )
            )
        session.flush()

    result = list_collaborators_for_user(user_id=user_id)
    assert result["total"] == 2, (
        f"Expected 2 separate collaborators but got {result['total']}: "
        + ", ".join(item["full_name"] for item in result["items"])
    )


def test_no_institution_does_not_merge_different_full_first_names(monkeypatch, tmp_path):
    """Same initial + surname is insufficient when both first names are fully spelled."""
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user(email="initial-non-merge@example.com")

    with session_scope() as session:
        session.add(
            Collaborator(
                owner_user_id=user_id,
                full_name="Pankaj Garg",
                full_name_lower="pankaj garg",
                primary_institution="Norwich Research Park",
                research_domains=[],
            )
        )
        session.add(
            Collaborator(
                owner_user_id=user_id,
                full_name="Puspendra Garg",
                full_name_lower="puspendra garg",
                primary_institution="",
                research_domains=[],
            )
        )
        session.flush()

        for collab in session.scalars(
            select(Collaborator).where(Collaborator.owner_user_id == user_id)
        ).all():
            session.add(
                CollaborationMetric(
                    owner_user_id=user_id,
                    collaborator_id=collab.id,
                    status="READY",
                )
            )
        session.flush()

    result = list_collaborators_for_user(user_id=user_id)
    assert result["total"] == 2, (
        f"Expected 2 separate collaborators but got {result['total']}: "
        + ", ".join(item["full_name"] for item in result["items"])
    )

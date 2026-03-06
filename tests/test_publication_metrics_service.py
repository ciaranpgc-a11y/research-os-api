from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

import research_os.services.publication_metrics_service as publication_metrics_service
from research_os.api.app import app
from research_os.db import (
    Collaborator,
    CollaboratorAffiliation,
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
    compute_g_index,
    compute_m_index,
    compute_momentum_index,
    compute_publication_top_metrics,
    compute_yoy_percent,
    enqueue_publication_top_metrics_refresh,
    get_publication_top_metrics,
    momentum_index_label,
    project_h_index,
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


def _tile(payload: dict[str, object], key: str) -> dict[str, object]:
    items = payload.get("tiles")
    assert isinstance(items, list)
    for item in items:
        if isinstance(item, dict) and str(item.get("key")) == key:
            return item
    raise AssertionError(f"Tile '{key}' not found.")


def test_metric_compute_helpers() -> None:
    assert compute_g_index([40, 30, 20, 10, 5]) == 5
    assert (
        compute_m_index(h_index=20, first_publication_year=2016, current_year=2026)
        == 1.818
    )
    assert compute_yoy_percent(citations_last_12m=120, citations_prev_12m=80) == 50.0
    assert compute_yoy_percent(citations_last_12m=100, citations_prev_12m=0) is None
    assert (
        compute_citation_momentum_score([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) == 94.5
    )
    assert compute_momentum_index([10] * 9 + [20, 20, 20]) == 200.0
    assert momentum_index_label(92.0) == "Slowing"
    assert momentum_index_label(100.0) == "Stable"
    assert momentum_index_label(120.0) == "Accelerating"
    assert (
        compute_concentration_risk_percent(total_citations=200, top3_citations=80)
        == 40.0
    )
    assert (
        publication_metrics_service._delta_tone_for_metric(
            key="this_year_vs_last", delta_value=5.0
        )
        == "neutral"
    )
    assert (
        publication_metrics_service._delta_tone_for_metric(
            key="this_year_vs_last", delta_value=15.0
        )
        == "positive"
    )
    assert (
        publication_metrics_service._delta_tone_for_metric(
            key="this_year_vs_last", delta_value=-12.0
        )
        == "caution"
    )
    assert (
        publication_metrics_service._delta_tone_for_metric(
            key="impact_concentration", delta_value=-2.0
        )
        == "positive"
    )


def test_h_index_projection_helper_is_deterministic() -> None:
    projection = project_h_index(
        current_h_index=18,
        publications=[
            {"citations_lifetime": 25, "citations_last_12m": 2, "title": "A"},
            {"citations_lifetime": 19, "citations_last_12m": 1, "title": "B"},
            {"citations_lifetime": 18, "citations_last_12m": 3, "title": "C"},
            {"citations_lifetime": 17, "citations_last_12m": 2, "title": "D"},
            {"citations_lifetime": 16, "citations_last_12m": 0, "title": "E"},
        ],
    )
    assert projection["current_h_index"] == 18
    assert int(projection["projected_h_index"]) >= 18
    assert 0.0 <= float(projection["projection_probability"]) <= 1.0
    assert 0.0 <= float(projection["progress_to_next_pct"]) <= 100.0
    assert isinstance(projection["candidate_papers"], list)


def test_h_index_drilldown_includes_full_portfolio_and_context(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics(email="h-index-drilldown@example.com")

    payload = compute_publication_top_metrics(user_id=user_id)
    h_index_tile = _tile(payload, "h_index_projection")
    drilldown = h_index_tile.get("drilldown")
    assert isinstance(drilldown, dict)
    publications = drilldown.get("publications")
    assert isinstance(publications, list)

    metadata = drilldown.get("metadata")
    assert isinstance(metadata, dict)
    intermediate = metadata.get("intermediate_values")
    assert isinstance(intermediate, dict)
    assert isinstance(intermediate.get("candidate_papers"), list)
    assert len(intermediate["candidate_papers"]) <= len(publications)
    assert all(isinstance(item, dict) for item in publications)
    assert all("citations_lifetime" in item for item in publications if isinstance(item, dict))
    assert float(intermediate.get("m_index") or 0.0) >= 0.0
    assert int(intermediate.get("g_index") or 0) >= int(h_index_tile.get("value") or 0)
    assert int(intermediate.get("i10_index") or 0) >= 0
    assert int(intermediate.get("h_core_publication_count") or 0) >= int(h_index_tile.get("value") or 0)
    assert float(intermediate.get("h_core_share_total_citations_pct") or 0.0) >= 0.0
    assert isinstance(intermediate.get("h_milestone_years"), dict)


def test_counts_by_year_prevents_lifetime_lumping(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    now = datetime.now(timezone.utc)

    with session_scope() as session:
        user = User(
            email="counts-by-year@example.com",
            password_hash="test-hash",
            name="CountsByYear",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="Long history work",
            title_lower="long history work",
            year=2018,
            doi="10.1000/long-history-work",
            venue_name="History Journal",
            journal="History Journal",
            publication_type="journal-article",
            citations_total=0,
            work_type="journal-article",
            publisher="Publisher",
            abstract="Abstract",
            keywords=["history"],
            url="https://example.org/history",
            provenance="manual",
        )
        session.add(work)
        session.flush()

        session.add(
            MetricsSnapshot(
                work_id=str(work.id),
                provider="openalex",
                citations_count=1000,
                influential_citations=None,
                altmetric_score=None,
                metric_payload={
                    "match_method": "doi",
                    "counts_by_year": [
                        {"year": 2018, "cited_by_count": 80},
                        {"year": 2019, "cited_by_count": 100},
                        {"year": 2020, "cited_by_count": 120},
                        {"year": 2021, "cited_by_count": 140},
                        {"year": 2022, "cited_by_count": 170},
                        {"year": 2023, "cited_by_count": 190},
                        {"year": 2024, "cited_by_count": 170},
                        {"year": 2025, "cited_by_count": 25},
                        {"year": now.year, "cited_by_count": 5},
                    ],
                },
                captured_at=now - timedelta(days=5),
            )
        )

    payload = compute_publication_top_metrics(user_id=user_id)
    total_tile = _tile(payload, "total_citations")
    last12_tile = _tile(payload, "this_year_vs_last")
    total_chart_data = dict(total_tile.get("chart_data") or {})

    total_value = int(total_tile["value"] or 0)
    last12_value = int(last12_tile["value"] or 0)
    assert total_value >= 900
    assert last12_value >= 1
    assert total_tile["badge"]["label"] == ""
    assert "Projected" in str(total_tile["delta_display"] or "")
    assert str(last12_tile["label"]) == "Total publications"
    assert last12_tile["delta_display"] in {None, ""}
    assert len(list(total_chart_data.get("monthly_values_12m") or [])) == 12
    assert len(list(total_chart_data.get("month_labels_12m") or [])) == 12
    assert len(list(total_chart_data.get("monthly_values_lifetime") or [])) >= 12
    assert len(list(total_chart_data.get("month_labels_lifetime") or [])) == len(
        list(total_chart_data.get("monthly_values_lifetime") or [])
    )
    assert str(total_chart_data.get("lifetime_month_start") or "").startswith("2018-01")
    assert int(sum(int(value or 0) for value in total_chart_data.get("monthly_values_lifetime") or [])) >= 995
    total_drilldown = dict(total_tile.get("drilldown") or {})
    publication_rows = list(total_drilldown.get("publications") or [])
    older_publication = next(
        (
            row
            for row in publication_rows
            if isinstance(row, dict)
            and str(row.get("title") or "").strip() == "Long history work"
        ),
        None,
    )
    assert isinstance(older_publication, dict)
    assert "citations_life_rolling" in older_publication
    assert older_publication.get("publication_type") == "journal-article"
    assert older_publication.get("work_type") == "journal-article"
    assert str(older_publication.get("article_type") or "").strip() != ""


def test_counts_by_year_lifetime_months_reconcile_to_total(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    now = datetime.now(timezone.utc)

    with session_scope() as session:
        user = User(
            email="counts-by-year-reconcile@example.com",
            password_hash="test-hash",
            name="CountsByYearReconcile",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="Reconciled history work",
            title_lower="reconciled history work",
            year=2017,
            doi="10.1000/reconciled-history-work",
            venue_name="History Journal",
            journal="History Journal",
            publication_type="journal-article",
            citations_total=0,
            work_type="journal-article",
            publisher="Publisher",
            abstract="Abstract",
            keywords=["history"],
            url="https://example.org/reconciled-history",
            provenance="manual",
        )
        session.add(work)
        session.flush()

        session.add(
            MetricsSnapshot(
                work_id=str(work.id),
                provider="openalex",
                citations_count=450,
                influential_citations=None,
                altmetric_score=None,
                metric_payload={
                    "match_method": "doi",
                    "counts_by_year": [
                        {"year": 2022, "cited_by_count": 70},
                        {"year": 2023, "cited_by_count": 90},
                        {"year": 2024, "cited_by_count": 80},
                        {"year": 2025, "cited_by_count": 60},
                    ],
                },
                captured_at=now - timedelta(days=5),
            )
        )

    payload = compute_publication_top_metrics(user_id=user_id)
    total_tile = _tile(payload, "total_citations")
    total_chart_data = dict(total_tile.get("chart_data") or {})
    total_value = int(total_tile["value"] or 0)
    lifetime_values = [
        int(value or 0) for value in total_chart_data.get("monthly_values_lifetime") or []
    ]
    total_drilldown = dict(total_tile.get("drilldown") or {})
    total_metadata = dict(total_drilldown.get("metadata") or {})
    activation_history = dict(total_metadata.get("activation_history") or {})
    activation_years = [int(value or 0) for value in activation_history.get("years") or []]
    activation_newly = [int(value or 0) for value in activation_history.get("newly_active") or []]
    activation_still = [int(value or 0) for value in activation_history.get("still_active") or []]
    activation_inactive = [int(value or 0) for value in activation_history.get("inactive") or []]
    activation_series = {
        str(series.get("series_id") or ""): series
        for series in total_drilldown.get("series") or []
        if isinstance(series, dict)
    }

    assert total_value == 450
    assert sum(lifetime_values) == total_value
    assert len(lifetime_values) >= 12
    assert activation_years
    assert activation_years[-1] == now.year - 1
    assert len(activation_years) == len(activation_newly) == len(activation_still) == len(activation_inactive)
    assert sum(activation_newly) >= 1
    assert sum(activation_still) >= 1
    assert activation_newly[-1] == 0
    assert activation_still[-1] >= 1
    assert "activation_newly_active" in activation_series
    assert "activation_still_active" in activation_series
    assert "activation_inactive" in activation_series


def test_single_snapshot_without_history_is_conservative(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    now = datetime.now(timezone.utc)

    with session_scope() as session:
        user = User(
            email="single-snapshot@example.com",
            password_hash="test-hash",
            name="SingleSnapshot",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="Single snapshot work",
            title_lower="single snapshot work",
            year=2021,
            doi="10.1000/single-snapshot-work",
            venue_name="Snapshot Journal",
            journal="Snapshot Journal",
            publication_type="journal-article",
            citations_total=0,
            work_type="journal-article",
            publisher="Publisher",
            abstract="Abstract",
            keywords=["snapshot"],
            url="https://example.org/snapshot",
            provenance="manual",
        )
        session.add(work)
        session.flush()

        session.add(
            MetricsSnapshot(
                work_id=str(work.id),
                provider="openalex",
                citations_count=420,
                influential_citations=None,
                altmetric_score=None,
                metric_payload={"match_method": "doi"},
                captured_at=now - timedelta(days=2),
            )
        )

    payload = compute_publication_top_metrics(user_id=user_id)
    last12_tile = _tile(payload, "this_year_vs_last")
    assert int(last12_tile["value"] or 0) == 1
    assert last12_tile["delta_display"] in {None, ""}


def test_total_publications_sources_do_not_include_orcid_when_not_available(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics(email="sources-publications@example.com")

    payload = compute_publication_top_metrics(user_id=user_id)
    last12_tile = _tile(payload, "this_year_vs_last")
    sources = last12_tile.get("data_source")

    assert isinstance(sources, list)
    assert "OpenAlex" in sources
    assert "ORCID" not in sources


def test_collaboration_structure_uses_collaborator_affiliations_when_work_data_is_sparse(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="collab-affiliations@example.com",
            password_hash="test-hash",
            name="Coverage User",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        session.add_all(
            [
                Work(
                    user_id=user_id,
                    title="Sparse Collaboration Work A",
                    title_lower="sparse collaboration work a",
                    year=2023,
                    doi="10.1000/sparse-collab-a",
                    venue_name="Network Journal",
                    journal="Network Journal",
                    publication_type="journal-article",
                    citations_total=0,
                    work_type="journal-article",
                    publisher="Publisher",
                    abstract="Abstract",
                    keywords=["network"],
                    url="https://example.org/sparse-a",
                    provenance="manual",
                    authors_json=[
                        {"name": "Coverage User"},
                        {"name": "Alice Collaborator"},
                        {"name": "Bob Collaborator"},
                    ],
                    affiliations_json=[],
                ),
                Work(
                    user_id=user_id,
                    title="Sparse Collaboration Work B",
                    title_lower="sparse collaboration work b",
                    year=2024,
                    doi="10.1000/sparse-collab-b",
                    venue_name="Network Journal",
                    journal="Network Journal",
                    publication_type="journal-article",
                    citations_total=0,
                    work_type="journal-article",
                    publisher="Publisher",
                    abstract="Abstract",
                    keywords=["network"],
                    url="https://example.org/sparse-b",
                    provenance="manual",
                    authors_json=[
                        {"name": "Coverage User"},
                        {"name": "Alice Collaborator"},
                        {"name": "Cara Collaborator"},
                    ],
                    affiliations_json=[],
                ),
            ]
        )
        session.flush()

        alice = Collaborator(
            owner_user_id=user_id,
            full_name="Alice Collaborator",
            full_name_lower="alice collaborator",
            primary_institution="Alpha Institute",
            country="US",
        )
        bob = Collaborator(
            owner_user_id=user_id,
            full_name="Bob Collaborator",
            full_name_lower="bob collaborator",
            primary_institution="Beta Medical Center",
            country="UK",
        )
        session.add_all([alice, bob])
        session.flush()
        session.add(
            CollaboratorAffiliation(
                collaborator_id=alice.id,
                institution_name="Gamma University",
                country="CA",
                is_primary=False,
            )
        )

    payload = compute_publication_top_metrics(user_id=user_id)
    collaboration_tile = _tile(payload, "collaboration_structure")
    chart_data = collaboration_tile.get("chart_data") or {}
    assert isinstance(chart_data, dict)

    assert chart_data.get("unique_collaborators") == 3
    assert chart_data.get("institutions") == 3
    assert chart_data.get("countries") == 3
    assert chart_data.get("continents") == 2
    assert chart_data.get("institutions_from_works") == 0
    assert chart_data.get("countries_from_works") == 0
    assert chart_data.get("institutions_from_collaborators") == 3
    assert chart_data.get("countries_from_collaborators") == 3


def test_snapshot_delta_ignores_mismatched_provider_baseline(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    now = datetime.now(timezone.utc)

    with session_scope() as session:
        user = User(
            email="mismatched-baseline@example.com",
            password_hash="test-hash",
            name="Mismatched Baseline",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="Provider mismatch work",
            title_lower="provider mismatch work",
            year=2022,
            doi="10.1000/provider-mismatch-work",
            venue_name="Mismatch Journal",
            journal="Mismatch Journal",
            publication_type="journal-article",
            citations_total=0,
            work_type="journal-article",
            publisher="Publisher",
            abstract="Abstract",
            keywords=["mismatch"],
            url="https://example.org/mismatch",
            provenance="manual",
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
                    captured_at=now - timedelta(days=450),
                ),
                MetricsSnapshot(
                    work_id=str(work.id),
                    provider="semantic_scholar",
                    citations_count=100,
                    influential_citations=12,
                    altmetric_score=None,
                    metric_payload={"match_method": "doi"},
                    captured_at=now - timedelta(days=2),
                ),
            ]
        )

    payload = compute_publication_top_metrics(user_id=user_id)
    last12_tile = _tile(payload, "this_year_vs_last")
    assert int(last12_tile["value"] or 0) == 1
    assert last12_tile["delta_display"] in {None, ""}


def test_stale_while_revalidate_serves_cache_and_enqueues(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics(email="stale-top-metrics@example.com")
    compute_publication_top_metrics(user_id=user_id)

    with session_scope() as session:
        row = session.scalars(
            publication_metrics_service._bundle_row_query(user_id)
        ).first()
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

    assert payload["is_stale"] is False
    assert payload["status"] == "READY"
    assert payload["is_updating"] is False
    assert len(payload["tiles"]) >= 6
    assert enqueued == [user_id]


def test_incomplete_citation_bundle_serves_read_only_fallback(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics(email="citation-fallback@example.com")
    computed_payload = compute_publication_top_metrics(user_id=user_id)
    total_tile = _tile(computed_payload, "total_citations")
    original_publications = list((total_tile.get("drilldown") or {}).get("publications") or [])
    assert original_publications

    stale_payload = {
        **computed_payload,
        "tiles": [
            {
                **tile,
                "drilldown": {
                    **dict(tile.get("drilldown") or {}),
                    "publications": [
                        {
                            **dict(row),
                            "article_type": None,
                            "publication_type": None,
                            "work_type": None,
                            "citations_1y_rolling": None,
                            "citations_3y_rolling": None,
                            "citations_5y_rolling": None,
                            "citations_life_rolling": None,
                        }
                        if isinstance(row, dict)
                        else row
                        for row in original_publications
                    ],
                },
            }
            if isinstance(tile, dict) and str(tile.get("key") or "").strip() == "total_citations"
            else tile
            for tile in list(computed_payload.get("tiles") or [])
        ],
    }

    with session_scope() as session:
        row = session.scalars(
            publication_metrics_service._bundle_row_query(user_id)
        ).first()
        assert row is not None
        row.payload_json = stale_payload
        row.metric_json = stale_payload
        row.status = "RUNNING"
        session.flush()

    enqueued: list[str] = []
    monkeypatch.setattr(
        publication_metrics_service,
        "enqueue_publication_top_metrics_refresh",
        lambda **kwargs: enqueued.append(str(kwargs["user_id"])) or True,
    )

    response = get_publication_top_metrics(user_id=user_id)
    refreshed_total_tile = _tile(response, "total_citations")
    refreshed_publications = list(
        (refreshed_total_tile.get("drilldown") or {}).get("publications") or []
    )
    refreshed_row = next(
        (row for row in refreshed_publications if isinstance(row, dict)),
        None,
    )

    assert response["status"] == "READY"
    assert response["is_updating"] is False
    assert isinstance(refreshed_row, dict)
    assert str(refreshed_row.get("article_type") or "").strip() != ""
    assert str(refreshed_row.get("publication_type") or "").strip() != ""
    assert refreshed_row.get("citations_1y_rolling") is not None
    assert refreshed_row.get("citations_3y_rolling") is not None
    assert refreshed_row.get("citations_5y_rolling") is not None
    assert refreshed_row.get("citations_life_rolling") is not None
    assert enqueued == [user_id]


def test_lock_prevents_duplicate_enqueue(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics(email="lock-top-metrics@example.com")
    compute_publication_top_metrics(user_id=user_id)

    with session_scope() as session:
        row = session.scalars(
            publication_metrics_service._bundle_row_query(user_id)
        ).first()
        assert row is not None
        row.status = "RUNNING"
        session.flush()

    assert enqueue_publication_top_metrics_refresh(user_id=user_id) is False

    with session_scope() as session:
        row = session.scalars(
            publication_metrics_service._bundle_row_query(user_id)
        ).first()
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
        "id",
        "key",
        "label",
        "main_value",
        "value",
        "main_value_display",
        "value_display",
        "delta_value",
        "delta_display",
        "delta_direction",
        "delta_tone",
        "delta_color_code",
        "unit",
        "subtext",
        "badge",
        "chart_type",
        "chart_data",
        "sparkline",
        "sparkline_overlay",
        "tooltip",
        "tooltip_details",
        "data_source",
        "confidence_score",
        "stability",
        "drilldown",
    }.issubset(first_tile.keys())
    assert {
        "title",
        "definition",
        "formula",
        "confidence_note",
        "tile_id",
        "as_of_date",
        "windows",
        "headline_metrics",
        "series",
        "breakdowns",
        "benchmarks",
        "methods",
        "qc_flags",
        "publications",
        "metadata",
    }.issubset(first_tile["drilldown"].keys())
    tile_keys = {
        str(item.get("key")) for item in payload["tiles"] if isinstance(item, dict)
    }
    assert {
        "total_citations",
        "this_year_vs_last",
        "momentum",
        "h_index_projection",
        "impact_concentration",
        "influential_citations",
    }.issubset(tile_keys)


def test_publication_metrics_excludes_supplementary_figshare_rows(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    now = datetime.now(timezone.utc)

    with session_scope() as session:
        user = User(
            email="metrics-supp@example.com",
            password_hash="test-hash",
            name="Metrics User",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        main_work = Work(
            user_id=user_id,
            title="Main publication",
            title_lower="main publication",
            year=2024,
            doi="10.1000/main-publication",
            venue_name="Journal A",
            journal="Journal A",
            publication_type="journal-article",
            citations_total=0,
            work_type="journal-article",
            publisher="Publisher A",
            abstract="Main abstract",
            keywords=[],
            url="https://example.org/main",
            provenance="manual",
        )
        supplementary = Work(
            user_id=user_id,
            title="Additional file 1 of Main publication",
            title_lower="additional file 1 of main publication",
            year=2024,
            doi="10.6084/m9.figshare.456",
            venue_name="Figshare",
            journal="Figshare",
            publication_type="data-set",
            citations_total=0,
            work_type="data-set",
            publisher="Figshare",
            abstract="Supplementary abstract",
            keywords=[],
            url="https://figshare.com/articles/dataset/example/456",
            provenance="manual",
        )
        session.add_all([main_work, supplementary])
        session.flush()

        session.add_all(
            [
                MetricsSnapshot(
                    work_id=str(main_work.id),
                    provider="openalex",
                    citations_count=12,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={"match_method": "doi"},
                    captured_at=now - timedelta(days=5),
                ),
                MetricsSnapshot(
                    work_id=str(supplementary.id),
                    provider="openalex",
                    citations_count=99,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={"match_method": "doi"},
                    captured_at=now - timedelta(days=5),
                ),
            ]
        )

    payload = compute_publication_top_metrics(user_id=user_id)
    assert int(payload["metadata"]["works_count"]) == 1
    total_tile = _tile(payload, "total_citations")
    assert int(total_tile["value"] or 0) == 12


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

    monkeypatch.setattr(
        publication_metrics_service, "_get_executor", lambda: _ImmediateExecutor()
    )
    payload = publication_metrics_service.trigger_publication_top_metrics_refresh(
        user_id=user_id
    )
    assert payload["enqueued"] is True
    assert payload["status"] in {"RUNNING", "READY"}
    assert payload["metric_key"] == TOP_METRICS_KEY


def test_metric_detail_endpoint_returns_drilldown(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with TestClient(app) as client:
        register = client.post(
            "/v1/auth/register",
            json={
                "email": "metrics-detail@example.com",
                "password": "StrongPassword123",
                "name": "Metrics Detail",
            },
        )
        assert register.status_code == 200
        token = register.json()["session_token"]
        user_id = register.json()["user"]["id"]

        with session_scope() as session:
            work = Work(
                user_id=user_id,
                title="Metric Detail Work",
                title_lower="metric detail work",
                year=2021,
                doi="10.1000/metric-detail-work",
                venue_name="Detail Journal",
                journal="Detail Journal",
                publication_type="journal-article",
                citations_total=0,
                work_type="journal-article",
                publisher="Publisher",
                abstract="Detail abstract",
                keywords=["detail"],
                url="https://example.org/detail",
                provenance="manual",
            )
            session.add(work)
            session.flush()
            session.add(
                MetricsSnapshot(
                    work_id=str(work.id),
                    provider="openalex",
                    citations_count=42,
                    influential_citations=None,
                    altmetric_score=None,
                    metric_payload={"match_method": "doi"},
                    captured_at=datetime.now(timezone.utc) - timedelta(days=10),
                )
            )

        compute_publication_top_metrics(user_id=user_id)
        response = client.get(
            "/v1/publications/metric/total_citations",
            headers=_auth_headers(token),
        )
        assert response.status_code == 200
        payload = response.json()

    assert payload["metric_id"] == "total_citations"
    assert payload["tile"]["key"] == "total_citations"
    assert "drilldown" in payload["tile"]
    assert "publications" in payload["tile"]["drilldown"]


def test_total_publications_drilldown_contract_windows_and_series(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user_with_metrics(email="drilldown-contract@example.com")
    payload = compute_publication_top_metrics(user_id=user_id)

    total_publications_tile = _tile(payload, "this_year_vs_last")
    drilldown = total_publications_tile.get("drilldown")
    assert isinstance(drilldown, dict)

    windows = drilldown.get("windows")
    assert isinstance(windows, list)
    window_ids = {
        str(item.get("window_id"))
        for item in windows
        if isinstance(item, dict)
    }
    assert {"1y", "3y", "5y", "all"}.issubset(window_ids)

    headline_metrics = drilldown.get("headline_metrics")
    assert isinstance(headline_metrics, list)
    metric_ids = {
        str(item.get("metric_id"))
        for item in headline_metrics
        if isinstance(item, dict)
    }
    assert {"primary", "active_years", "median_per_year", "current_ytd"}.issubset(
        metric_ids
    )

    series = drilldown.get("series")
    assert isinstance(series, list)
    yearly_series = next(
        (
            item
            for item in series
            if isinstance(item, dict) and str(item.get("series_id")) == "yearly"
        ),
        None,
    )
    assert isinstance(yearly_series, dict)
    points = yearly_series.get("points")
    assert isinstance(points, list) and points
    first_point = points[0]
    assert isinstance(first_point, dict)
    assert "period_start" in first_point and "period_end" in first_point

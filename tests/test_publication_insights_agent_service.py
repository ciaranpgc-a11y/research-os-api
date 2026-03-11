from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest

import research_os.services.publication_insights_agent_service as publication_insights_agent_service
from research_os.api.app import app
from research_os.db import MetricsSnapshot, User, Work, create_all_tables, reset_database_state, session_scope
from research_os.services.publication_metrics_service import compute_publication_top_metrics


def _mock_citation_openai_output() -> str:
    return (
        '{"overall_summary":"Citation attention is concentrated in a lead paper, while the rest of the portfolio is still picking up activity.",'
        '"sections":['
        '{"key":"uncited_works","headline":"Recent uncited pocket","body":"Across the last 3 years, 1 of 3 papers is still uncited, and it is recent rather than old. The portfolio still added 44 citations in the last 12 months, so this looks like a recent lag, not a broader problem.","consideration_label":"What to separate","consideration":"Separate recent uncited work from older uncited papers before treating them as the same issue."},'
        '{"key":"citation_drivers","headline":"One paper still leads","body":"Across the last 3 years, Driver Paper One accounts for 30 of 44 citations, so recent attention is still concentrated in one lead paper rather than spread across the portfolio.","consideration_label":"What to watch","consideration":"Watch whether newer papers begin to share citation attention with the current lead paper."},'
        '{"key":"citation_activation","headline":"Activation is present","body":"In the last 3 years, 2 of 3 papers recorded citations, with 1 newly active paper and 1 that stayed active. That leaves 1 inactive paper, so activation is present but not yet broad.","consideration_label":"What to look at","consideration":"Check whether the inactive paper is simply newer or whether attention is staying narrow."},'
        '{"key":"citation_activation_history","headline":"Renewal is still happening","body":"Through 2025, newly active papers kept appearing instead of leaving citation activity with the same already-active titles. That points to renewal, although the active base is still a small cluster of papers.","consideration_label":"What to watch","consideration":"Watch whether that renewal keeps broadening beyond the same small cluster of papers."}'
        "]}"
    )


def _set_test_environment(monkeypatch, tmp_path) -> None:
    import research_os.api.app as api_module

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_publication_insights_agent.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    monkeypatch.setenv("PUB_ANALYTICS_TTL_SECONDS", "60")
    api_module._AUTH_RATE_LIMIT_EVENTS.clear()
    publication_insights_agent_service._reset_publication_insights_availability_cache()
    reset_database_state()


def test_publication_insights_available_returns_false_without_openai_key(
    monkeypatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_openai_api_key",
        lambda: (_ for _ in ()).throw(
            publication_insights_agent_service.ConfigurationError(
                "OPENAI_API_KEY is not set."
            )
        ),
    )
    publication_insights_agent_service._reset_publication_insights_availability_cache()

    assert publication_insights_agent_service.publication_insights_available(
        force_refresh=True
    ) is False


def test_publication_insights_available_returns_false_for_invalid_openai_access(
    monkeypatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    publication_insights_agent_service._reset_publication_insights_availability_cache()

    def _raise_invalid_model_access():  # noqa: ANN202
        raise RuntimeError("invalid_api_key")

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_client",
        lambda: SimpleNamespace(models=SimpleNamespace(retrieve=lambda model: _raise_invalid_model_access())),
    )

    assert publication_insights_agent_service.publication_insights_available(
        force_refresh=True
    ) is False


def test_publication_insights_available_probes_model_access_once_per_cache_window(
    monkeypatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("PUBLICATION_INSIGHTS_AVAILABILITY_CACHE_TTL_SECONDS", "60")
    publication_insights_agent_service._reset_publication_insights_availability_cache()
    calls: list[str] = []

    def _retrieve(model: str) -> SimpleNamespace:
        calls.append(model)
        return SimpleNamespace(id=model)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_client",
        lambda: SimpleNamespace(models=SimpleNamespace(retrieve=_retrieve)),
    )

    assert publication_insights_agent_service.publication_insights_available(
        force_refresh=True
    ) is True
    assert publication_insights_agent_service.publication_insights_available() is True
    assert calls == ["gpt-5.4"]


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


def _fake_publication_output_pattern_metrics() -> dict[str, object]:
    lifetime_month_start = datetime(2016, 3, 1, tzinfo=timezone.utc)
    lifetime_month_labels = [
        datetime(
            lifetime_month_start.year + ((lifetime_month_start.month - 1 + index) // 12),
            ((lifetime_month_start.month - 1 + index) % 12) + 1,
            1,
            tzinfo=timezone.utc,
        ).date().isoformat()
        for index in range(120)
    ]
    monthly_values_lifetime = [0] * 120
    for index, value in {
        0: 1,
        11: 1,
        24: 4,
        25: 4,
        26: 4,
        35: 4,
        38: 2,
        39: 2,
        40: 2,
        47: 2,
        52: 2,
        53: 2,
        60: 5,
        61: 5,
        62: 5,
        72: 3,
        73: 3,
        74: 2,
        83: 3,
        84: 3,
        85: 3,
        94: 3,
        95: 4,
        98: 4,
        99: 4,
        107: 1,
        109: 1,
        117: 1,
        119: 1,
    }.items():
        monthly_values_lifetime[index] = value
    return {
        "tiles": [
            {
                "key": "this_year_vs_last",
                "main_value": "101",
                "value": "101",
                "data_source": ["OpenAlex"],
                "chart_data": {
                    "years": [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
                    "values": [1, 1, 16, 8, 8, 19, 11, 14, 19, 4],
                    "monthly_values_12m": [0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1],
                    "month_labels_12m": ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"],
                    "monthly_values_lifetime": monthly_values_lifetime,
                    "month_labels_lifetime": lifetime_month_labels,
                    "lifetime_month_start": "2016-03-01",
                    "projected_year": 2026,
                    "current_year_ytd": 1,
                },
                "drilldown": {
                    "as_of_date": "2026-03-08",
                    "publications": [
                        {"work_id": "w1", "title": "Paper A", "year": 2025, "publication_date": "2025-04-12", "article_type": "original-article"},
                        {"work_id": "w2", "title": "Paper B", "year": 2025, "publication_date": "2025-11-22", "article_type": "review-article"},
                        {"work_id": "w3", "title": "Paper C", "year": 2026, "publication_date": "2026-01-14", "article_type": "original-article"},
                        {"work_id": "w4", "title": "Paper D", "year": 2026, "publication_date": "2026-02-15", "article_type": "original-article"},
                    ],
                },
            }
        ]
    }


def _fake_publication_article_type_over_time_metrics() -> dict[str, object]:
    return {
        "tiles": [
            {
                "key": "this_year_vs_last",
                "main_value": "15",
                "value": "15",
                "data_source": ["OpenAlex"],
                "chart_data": {
                    "years": [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
                    "values": [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
                    "projected_year": 2026,
                    "current_year_ytd": 2,
                },
                "drilldown": {
                    "as_of_date": "2026-03-08",
                    "publications": [
                        {"work_id": "w1", "title": "Paper 2016", "year": 2016, "publication_date": "2016-05-10", "article_type": "original-article"},
                        {"work_id": "w2", "title": "Paper 2017", "year": 2017, "publication_date": "2017-06-11", "article_type": "original-article"},
                        {"work_id": "w3", "title": "Paper 2018", "year": 2018, "publication_date": "2018-07-12", "article_type": "original-article"},
                        {"work_id": "w4", "title": "Paper 2019", "year": 2019, "publication_date": "2019-08-13", "article_type": "original-article"},
                        {"work_id": "w5", "title": "Paper 2020", "year": 2020, "publication_date": "2020-09-14", "article_type": "original-article"},
                        {"work_id": "w6", "title": "Paper 2021", "year": 2021, "publication_date": "2021-04-08", "article_type": "systematic-review"},
                        {"work_id": "w7", "title": "Paper 2022", "year": 2022, "publication_date": "2022-03-17", "article_type": "original-article"},
                        {"work_id": "w8", "title": "Paper 2023 A", "year": 2023, "publication_date": "2023-02-05", "article_type": "original-article"},
                        {"work_id": "w9", "title": "Paper 2023 B", "year": 2023, "publication_date": "2023-11-21", "article_type": "original-article"},
                        {"work_id": "w10", "title": "Paper 2024 A", "year": 2024, "publication_date": "2024-05-09", "article_type": "original-article"},
                        {"work_id": "w11", "title": "Paper 2024 B", "year": 2024, "publication_date": "2024-10-18", "article_type": "review-article"},
                        {"work_id": "w12", "title": "Paper 2025 A", "year": 2025, "publication_date": "2025-04-12", "article_type": "review-article"},
                        {"work_id": "w13", "title": "Paper 2025 B", "year": 2025, "publication_date": "2025-11-22", "article_type": "original-article"},
                        {"work_id": "w14", "title": "Paper 2026 A", "year": 2026, "publication_date": "2026-01-14", "article_type": "review-article"},
                        {"work_id": "w15", "title": "Paper 2026 B", "year": 2026, "publication_date": "2026-02-15", "article_type": "review-article"},
                    ],
                },
            }
        ]
    }


def _fake_publication_type_over_time_metrics() -> dict[str, object]:
    return {
        "tiles": [
            {
                "key": "this_year_vs_last",
                "main_value": "15",
                "value": "15",
                "data_source": ["OpenAlex"],
                "chart_data": {
                    "years": [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
                    "values": [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
                    "projected_year": 2026,
                    "current_year_ytd": 2,
                },
                "drilldown": {
                    "as_of_date": "2026-03-08",
                    "publications": [
                        {"work_id": "w1", "title": "Paper 2016", "year": 2016, "publication_date": "2016-05-10", "work_type": "journal-article"},
                        {"work_id": "w2", "title": "Paper 2017", "year": 2017, "publication_date": "2017-06-11", "work_type": "journal-article"},
                        {"work_id": "w3", "title": "Paper 2018", "year": 2018, "publication_date": "2018-07-12", "work_type": "journal-article"},
                        {"work_id": "w4", "title": "Paper 2019", "year": 2019, "publication_date": "2019-08-13", "work_type": "journal-article"},
                        {"work_id": "w5", "title": "Paper 2020", "year": 2020, "publication_date": "2020-09-14", "work_type": "journal-article"},
                        {"work_id": "w6", "title": "Paper 2021", "year": 2021, "publication_date": "2021-04-08", "work_type": "conference-paper"},
                        {"work_id": "w7", "title": "Paper 2022", "year": 2022, "publication_date": "2022-03-17", "work_type": "journal-article"},
                        {"work_id": "w8", "title": "Paper 2023 A", "year": 2023, "publication_date": "2023-02-05", "work_type": "journal-article"},
                        {"work_id": "w9", "title": "Paper 2023 B", "year": 2023, "publication_date": "2023-11-21", "work_type": "journal-article"},
                        {"work_id": "w10", "title": "Paper 2024 A", "year": 2024, "publication_date": "2024-05-09", "work_type": "journal-article"},
                        {"work_id": "w11", "title": "Paper 2024 B", "year": 2024, "publication_date": "2024-10-18", "work_type": "review-article"},
                        {"work_id": "w12", "title": "Paper 2025 A", "year": 2025, "publication_date": "2025-04-12", "work_type": "review-article"},
                        {"work_id": "w13", "title": "Paper 2025 B", "year": 2025, "publication_date": "2025-11-22", "work_type": "journal-article"},
                        {"work_id": "w14", "title": "Paper 2026 A", "year": 2026, "publication_date": "2026-01-14", "work_type": "review-article"},
                        {"work_id": "w15", "title": "Paper 2026 B", "year": 2026, "publication_date": "2026-02-15", "work_type": "review-article"},
                    ],
                },
            }
        ]
    }


def test_format_publication_output_date_label_avoids_fake_day_precision() -> None:
    assert (
        publication_insights_agent_service._format_publication_output_date_label(
            {"publication_month_start": "2026-02-01"}
        )
        == "Feb 2026"
    )


def test_format_publication_type_label_maps_conference_entries_to_published_abstract() -> None:
    assert (
        publication_insights_agent_service._format_publication_type_label(
            {"work_type": "conference-paper"}
        )
        == "Published abstract"
    )
    assert (
        publication_insights_agent_service._format_publication_output_date_label(
            {"year": 2026}
        )
        == "2026"
    )


def test_classify_publication_volume_overall_trajectory_handles_stable_record() -> None:
    state = publication_insights_agent_service._classify_publication_volume_overall_trajectory(
        total_publications=48,
        active_span=12,
        phase_label="Established",
        low_year_position="mixed",
        peak_year_position="mixed",
        gap_years=0,
        peak_vs_average_ratio=1.3,
        burstiness_score=0.28,
        peak_year_share_pct=14.0,
    )

    assert state == "broadly_stable"


def test_classify_publication_volume_recent_position_handles_recently_stronger() -> None:
    state = publication_insights_agent_service._classify_publication_volume_recent_position(
        rolling_3y_blocks=[
            {"label": "Mar 2021-Feb 2022", "count": 7},
            {"label": "Mar 2022-Feb 2023", "count": 9},
            {"label": "Mar 2023-Feb 2024", "count": 12},
        ],
        rolling_5y_blocks=[
            {"label": "Mar 2019-Feb 2020", "count": 6},
            {"label": "Mar 2020-Feb 2021", "count": 7},
            {"label": "Mar 2021-Feb 2022", "count": 8},
            {"label": "Mar 2022-Feb 2023", "count": 10},
            {"label": "Mar 2023-Feb 2024", "count": 12},
        ],
        recent_monthly_total=11,
        recent_monthly_active_months=7,
    )

    assert state == "recently_stronger"


def test_classify_publication_volume_recent_detail_pattern_handles_limited_rows() -> None:
    state = publication_insights_agent_service._classify_publication_volume_recent_detail_pattern(
        table_recent_count=0,
        recent_monthly_total=4,
        recent_monthly_active_months=3,
    )

    assert state == "limited_recent_detail"


def test_generate_publication_insights_agent_draft_uses_openai_response(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user("pub-agent-openai@example.com")
    _seed_publications_for_user(user_id=user_id)
    compute_publication_top_metrics(user_id=user_id)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(output_text=_mock_citation_openai_output()),
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
    assert payload["provenance"]["model"] == "gpt-5.4"
    uncited_section = next(
        section for section in payload["sections"] if section["key"] == "uncited_works"
    )
    assert "1 of 3 papers is still uncited" in uncited_section["body"]
    assert any(section["key"] == "citation_activation" for section in payload["sections"])
    assert any(section["key"] == "citation_activation_history" for section in payload["sections"])
    assert payload["sections"][0]["consideration_label"]
    assert payload["sections"][0]["consideration"]


def test_generate_publication_insights_agent_draft_raises_when_openai_fails(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user("pub-agent-fallback@example.com")
    _seed_publications_for_user(user_id=user_id)
    compute_publication_top_metrics(user_id=user_id)

    def _raise_error(**kwargs):  # noqa: ANN003
        raise RuntimeError("OpenAI unavailable")

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        _raise_error,
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="Publication insights AI generation failed",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id=user_id,
            window_id="1y",
        )


def test_generate_publication_insights_agent_draft_raises_when_openai_response_is_incomplete(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user("pub-agent-incomplete@example.com")
    _seed_publications_for_user(user_id=user_id)
    compute_publication_top_metrics(user_id=user_id)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            status="incomplete",
            incomplete_details=SimpleNamespace(reason="max_output_tokens"),
            output_text="",
        ),
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="Publication insights AI response was incomplete \\(max_output_tokens\\)",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id=user_id,
            window_id="1y",
        )


def test_build_fallback_payload_builds_section_level_citation_read(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()
    user_id = _seed_user("pub-agent-section@example.com")
    _seed_publications_for_user(user_id=user_id)
    compute_publication_top_metrics(user_id=user_id)

    evidence = publication_insights_agent_service._build_evidence(
        user_id=user_id,
        window_id="1y",
        section_key="citation_drivers",
        scope="section",
    )
    payload = publication_insights_agent_service._build_fallback_payload(evidence)

    citation_section = next(
        section for section in payload["sections"] if section["key"] == "citation_drivers"
    )
    assert "Across the last 1, 3, and 5 years" in citation_section["body"]
    assert citation_section["consideration_label"]
    assert str(citation_section.get("consideration") or "").startswith("You may want")


def test_build_publication_output_pattern_fallback_payload_is_richer(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )

    evidence = publication_insights_agent_service._build_publication_output_pattern_evidence(
        user_id="publication-output-test-user"
    )
    payload = publication_insights_agent_service._build_publication_output_pattern_fallback_payload(
        evidence
    )

    assert evidence["phase_label"] == "Plateauing"
    assert evidence["recent_years_label"] == "2023-2025"
    section = payload["sections"][0]
    assert section["headline"] == "Growth flattening"
    assert "every year from 2016 to 2025" in section["body"]
    assert "2025 fell to 4" in section["body"]
    assert "2021 and 2024" in section["body"]
    assert section["consideration_label"] == "What would confirm it"
    assert "11-19 publication band seen across 2021-2024" in str(section["consideration"] or "")
    assert "another year near 4 would confirm a more durable break" in str(section["consideration"] or "")


def test_generate_publication_insights_agent_draft_uses_stronger_openai_publication_output_pattern_read(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    captured_kwargs: dict[str, object] = {}

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: captured_kwargs.update(kwargs) or SimpleNamespace(
            output_text=(
                '{"overall_summary":"The record stays broad and continuous, but the latest complete year no longer sustains the stronger recent run.",'
                '"sections":['
                '{"key":"publication_output_pattern","pattern":"growth flattening","headline":"Repeated highs, then a clear break",'
                '"body":"You published in every year from 2016 to 2025, and recent years averaged 12 publications versus 9 earlier, so the record is broader than a one-peak profile. But 2025 fell to 4 after shared peaks of 19 in 2021 and 2024, which makes 2025 look more like a break from that stronger run than a continuation of it.",'
                '"blocks":[{"kind":"callout","label":"Why it matters","text":"Because the highs are shared rather than isolated, the drop to 4 in 2025 looks more like broader lost momentum than the fading of one standout year."}]}'
                "]}"
            )
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_output_pattern",
        scope="section",
    )

    assert payload["provenance"]["generation_mode"] == "openai"
    assert payload["provenance"]["evidence"]["phase_label"] == "Plateauing"
    section = payload["sections"][0]
    assert section["headline"] == "Repeated highs, then a clear break"
    assert "every year from 2016 to 2025" in section["body"]
    assert "2025 fell to 4" in section["body"]
    assert "2021 and 2024" in section["body"]
    assert section["evidence"]["pattern"] == "growth flattening"
    assert section["consideration_label"] == "Why it matters"
    assert "shared rather than isolated" in str(section["consideration"] or "")
    assert section["blocks"] == [
        {
            "kind": "callout",
            "label": "Why it matters",
            "text": "Because the highs are shared rather than isolated, the drop to 4 in 2025 looks more like broader lost momentum than the fading of one standout year.",
        }
    ]
    assert captured_kwargs["max_output_tokens"] == 1600
    assert captured_kwargs["reasoning"] == {"effort": "medium"}
    assert captured_kwargs["store"] is False
    assert captured_kwargs["text"] == publication_insights_agent_service._publication_output_pattern_text_config()
    input_messages = captured_kwargs["input"]
    assert isinstance(input_messages, list)
    assert len(input_messages) == 2
    assert input_messages[0]["role"] == "system"
    assert "Decide one steadiness pattern only." in input_messages[0]["content"]
    assert "Use the full timeline first." in input_messages[0]["content"]
    assert "no more than 3 numbers" in input_messages[0]["content"]
    assert input_messages[1]["role"] == "user"
    evidence_payload = json.loads(str(input_messages[1]["content"]))
    assert evidence_payload["section_data"]["phase_label"] == "Plateauing"
    assert "analysis_brief" in evidence_payload
    assert evidence_payload["confidence_flags"] == {
        "phase_confidence_low": False,
        "includes_partial_year": True,
    }
    assert "records" not in evidence_payload["publication_library"]


def test_generate_publication_insights_agent_draft_rebuilds_publication_output_pattern_messages_with_ui_context(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    captured_kwargs: dict[str, object] = {}

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: captured_kwargs.update(kwargs) or SimpleNamespace(
            output_text=(
                '{"sections":['
                '{"key":"publication_output_pattern","pattern":"growth flattening","headline":"Repeated highs, then a clear break","body":"You published in every year from 2016 to 2025, and recent years averaged 12 publications versus 9 earlier, so the record is broader than a one-peak profile. But 2025 fell to 4 after shared peaks of 19 in 2021 and 2024, which makes 2025 look more like a break from that stronger run than a continuation of it.","blocks":[]}'
                "]}",
            )
        ),
    )

    publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_output_pattern",
        scope="section",
        ui_context="Tooltip copy for output pattern.",
    )

    input_messages = captured_kwargs["input"]
    assert isinstance(input_messages, list)
    evidence_payload = json.loads(str(input_messages[1]["content"]))
    assert evidence_payload["ui_context"] == "Tooltip copy for output pattern."


def test_publication_output_pattern_structured_output_schema_is_strict() -> None:
    text_config = publication_insights_agent_service._publication_output_pattern_text_config()

    assert text_config["format"]["type"] == "json_schema"
    assert text_config["format"]["strict"] is True
    assert text_config["format"]["name"] == "publication_output_pattern_insight"
    schema = text_config["format"]["schema"]
    assert schema["additionalProperties"] is False
    assert schema["required"] == ["overall_summary", "sections"]
    assert schema["properties"]["overall_summary"]["anyOf"] == [
        {"type": "string"},
        {"type": "null"},
    ]
    assert schema["properties"]["sections"]["minItems"] == 1
    assert schema["properties"]["sections"]["maxItems"] == 1
    section_schema = schema["properties"]["sections"]["items"]
    assert section_schema["additionalProperties"] is False
    assert section_schema["required"] == ["key", "pattern", "headline", "body", "blocks"]
    assert section_schema["properties"]["key"] == {
        "type": "string",
        "const": "publication_output_pattern",
    }
    assert section_schema["properties"]["pattern"]["enum"] == [
        "too early to read",
        "continuous growth",
        "broadly stable",
        "growth flattening",
        "output easing",
        "peak-led record",
        "burst-led output",
        "interrupted pattern",
        "rebuilding output",
        "active across years",
    ]
    assert section_schema["properties"]["blocks"]["maxItems"] == 1
    block_schema = section_schema["properties"]["blocks"]["items"]
    assert block_schema["additionalProperties"] is False
    assert block_schema["properties"]["label"]["anyOf"] == [
        {"type": "string"},
        {"type": "null"},
    ]
    assert block_schema["required"] == ["kind", "label", "text"]


def test_publication_output_pattern_body_accepts_structural_story_without_explicit_peak_language(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    evidence = publication_insights_agent_service._build_publication_output_pattern_evidence(
        user_id="publication-output-test-user"
    )

    assert not publication_insights_agent_service._publication_output_pattern_body_is_too_generic(
        body=(
            "After a quieter start, the record built into a sustained stronger run, but that rise is no longer being maintained. "
            "Output stayed active every year, yet the latest complete year, 2025, fell to 4 after several stronger years, "
            "so this reads as growth flattening rather than broad stability. The partial 2026 signal is too early to outweigh that break."
        ),
        fallback_body="",
        evidence=evidence,
    )


def test_generate_publication_insights_agent_draft_accepts_null_overall_summary_and_null_callout_label_for_publication_output_pattern(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"overall_summary":null,"sections":['
                '{"key":"publication_output_pattern","pattern":"growth flattening","headline":"Late-run build, then a clear break","body":"The record builds from a very quiet start into a sustained stronger run later in the timeline, rather than depending on a single standout peak. That stronger level is not sustained in the latest complete year, with output falling to 4 in 2025, so the overall shape reads as growth flattening. The partial 2026 signal is too early to change that read.","blocks":[{"kind":"callout","label":null,"text":"The live 2026 signal is still partial, so this read rests on the break in the latest complete year."}]}]}'
            )
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_output_pattern",
        scope="section",
    )

    assert payload["overall_summary"] == ""
    section = payload["sections"][0]
    assert section["blocks"] == [
        {
            "kind": "callout",
            "label": None,
            "text": "The live 2026 signal is still partial, so this read rests on the break in the latest complete year.",
        }
    ]
    assert section["consideration_label"] is None
    assert section["consideration"] is None


def test_generate_publication_insights_agent_draft_accepts_live_confidence_note_for_publication_output_pattern(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"overall_summary":"growth flattening","sections":['
                '{"key":"publication_output_pattern","pattern":"growth flattening","headline":"Higher run breaks in the latest year","body":"The record stays active across the full span and builds from quieter early years into a stronger multi-year run, but that higher level is not sustained in the latest complete year. After repeated highs, output falls to 4 in 2025, which reads as a break from the stronger run rather than a one-off peak pattern.","blocks":[{"kind":"callout","label":"Confidence note","text":"This read rests on the full continuous timeline with no gap years, but only one complete post-peak year is available so far."}]}]}'
            )
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_output_pattern",
        scope="section",
    )

    section = payload["sections"][0]
    assert section["consideration_label"] == "Confidence note"
    assert section["consideration"] == (
        "This read rests on the full continuous timeline with no gap years, "
        "but only one complete post-peak year is available so far."
    )
    assert section["blocks"] == [
        {
            "kind": "callout",
            "label": "Confidence note",
            "text": (
                "This read rests on the full continuous timeline with no gap years, "
                "but only one complete post-peak year is available so far."
            ),
        }
    ]


def test_generate_publication_insights_agent_draft_rejects_extra_fields_for_publication_output_pattern(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"sections":['
                '{"key":"publication_output_pattern","pattern":"growth flattening","headline":"Repeated highs, then a clear break","body":"You published in every year from 2016 to 2025, and recent years averaged 12 publications versus 9 earlier, so the record is broader than a one-peak profile. But 2025 fell to 4 after shared peaks of 19 in 2021 and 2024, which makes 2025 look more like a break from that stronger run than a continuation of it.","blocks":[],"extra_note":"unexpected"}'
                "]}",
            )
        ),
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="invalid fields for publication_output_pattern",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id="publication-output-test-user",
            window_id="all",
            section_key="publication_output_pattern",
            scope="section",
        )


def test_generate_publication_insights_agent_draft_rejects_generic_publication_output_pattern_headline(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"sections":['
                '{"key":"publication_output_pattern","pattern":"growth flattening","headline":"Output pattern","body":"You published in every year from 2016 to 2025, and recent years averaged 12 publications versus 9 earlier, so the record is broader than a one-peak profile. But 2025 fell to 4 after shared peaks of 19 in 2021 and 2024, which makes 2025 look more like a break from that stronger run than a continuation of it.","blocks":[]}'
                "]}",
            )
        ),
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="generic headline for publication_output_pattern",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id="publication-output-test-user",
            window_id="all",
            section_key="publication_output_pattern",
            scope="section",
        )


def test_generate_publication_insights_agent_draft_rejects_too_many_blocks_for_publication_output_pattern(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"sections":['
                '{"key":"publication_output_pattern","pattern":"growth flattening","headline":"Repeated highs, then a clear break","body":"You published in every year from 2016 to 2025, and recent years averaged 12 publications versus 9 earlier, so the record is broader than a one-peak profile. But 2025 fell to 4 after shared peaks of 19 in 2021 and 2024, which makes 2025 look more like a break from that stronger run than a continuation of it.","blocks":[{"kind":"paragraph","text":"The record stayed active across the span."},{"kind":"callout","label":"Why it matters","text":"The highs are shared rather than isolated."}]}'
                "]}",
            )
        ),
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="too many blocks for publication_output_pattern",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id="publication-output-test-user",
            window_id="all",
            section_key="publication_output_pattern",
            scope="section",
        )


def test_generate_publication_insights_agent_draft_errors_on_unsupported_publication_output_pattern_partial_year_note(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
                output_text=(
                    '{"overall_summary":"Your record is continuous and growth-led across the full span.",'
                    '"sections":['
                    '{"key":"publication_output_pattern","pattern":"continuous growth","headline":"Continuous, later surge",'
                    '"body":"Publishing is uninterrupted across all 10 years, with the quietest years early in 2016-2017. Output then rises into shared peaks of 19 in 2021 and 2024, so recent years still sit above the early baseline rather than depending on one isolated year.",'
                    '"blocks":[{"kind":"callout","label":"Check recency","text":"Because 2025 is lower, verify whether it is a partial-year count before interpreting it as a slowdown."}]}'
                    "]}"
                )
        ),
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="unsupported block_text content for publication_output_pattern",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id="publication-output-test-user",
            window_id="all",
            section_key="publication_output_pattern",
            scope="section",
        )


def test_build_publication_production_phase_fallback_payload(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )

    evidence = publication_insights_agent_service._build_publication_production_phase_evidence(
        user_id="publication-output-test-user"
    )
    payload = publication_insights_agent_service._build_publication_production_phase_fallback_payload(
        evidence
    )

    assert evidence["phase_label"] == "Plateauing"
    assert evidence["rolling_cutoff_label"] == "Feb 2026"
    assert evidence["rolling_one_year_total"] == 3
    assert evidence["rolling_three_year_pace"] == 8.3
    assert evidence["rolling_prior_period_pace"] == 8.0
    assert evidence["rolling_prior_period_label"] == "Prior 7 years"
    assert evidence["current_pace_cutoff_label"] == "Feb 2026"
    assert evidence["current_pace_count"] == 1
    assert evidence["current_pace_comparison_label"] == "2023-2025"
    assert evidence["current_pace_comparison_mean"] == 3.7
    assert evidence["current_pace_signal"] == "behind"
    assert evidence["high_run_label"] == "2021-2024"
    assert evidence["high_run_min_count"] == 11
    assert evidence["high_run_max_count"] == 19
    section = payload["sections"][0]
    assert section["key"] == "publication_production_phase"
    assert section["headline"] == "Rise, then flattening"
    assert "Across the full publication span" in section["body"]
    assert "2025" in section["body"]
    assert "In the last 12 months to end Feb 2026, output was 3 publications" in section["body"]
    assert "trailing 3-year pace of 8.3/year" in section["body"]
    assert "prior 7 years at 8.0/year" in section["body"]
    assert section["consideration_label"] == "What would confirm it"
    assert "back into the 11-19 range seen across 2021-2024" in str(section["consideration"] or "")
    assert "another year near 4 would strengthen plateauing" in str(section["consideration"] or "")
    assert "Through Feb 2026, the live year is still behind that pace." in str(section["consideration"] or "")


def test_generate_publication_insights_agent_draft_uses_openai_publication_production_phase_read(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    captured_kwargs: dict[str, object] = {}

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: captured_kwargs.update(kwargs) or SimpleNamespace(
            output_text=(
                '{"overall_summary":"Your higher publication output is no longer being sustained.",'
                '"sections":['
                '{"key":"publication_production_phase","phase":"plateauing","headline":"Higher run no longer holds",'
                '"body":"Across the full publication span, output peaked in 2021 and 2024 at 19 publications, then fell to 4 in 2025. In the last 12 months to end Feb 2026, output was 3 publications, below the trailing 3-year pace of 8.3/year and prior 7 years at 8.0/year.",'
                '"blocks":[]}'
                "]}",
            )
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_production_phase",
        scope="section",
    )

    assert payload["provenance"]["generation_mode"] == "openai"
    section = payload["sections"][0]
    assert section["key"] == "publication_production_phase"
    assert section["headline"] == "Higher run no longer holds"
    assert "Across the full publication span" in section["body"]
    assert "2025" in section["body"]
    assert "last 12 months to end Feb 2026" in section["body"]
    assert "trailing 3-year pace of 8.3/year" in section["body"]
    assert "prior 7 years at 8.0/year" in section["body"]
    assert section["evidence"]["phase"] == "plateauing"
    assert section["consideration_label"] is None
    assert section["consideration"] is None
    assert section["blocks"] == []
    assert captured_kwargs["max_output_tokens"] == 1200
    assert captured_kwargs["reasoning"] == {"effort": "medium"}
    assert captured_kwargs["store"] is False
    assert captured_kwargs["text"] == publication_insights_agent_service._publication_production_phase_text_config()
    input_messages = captured_kwargs["input"]
    assert isinstance(input_messages, list)
    assert len(input_messages) == 2
    assert input_messages[0]["role"] == "system"
    assert "Decide one phase only." in input_messages[0]["content"]
    assert "Use the full publication span first" in input_messages[0]["content"]
    assert "Do not anchor the read on Jan-Dec buckets" in input_messages[0]["content"]
    assert "analysis_brief and ui_context may appear in the evidence" in input_messages[0]["content"]
    assert input_messages[1]["role"] == "user"
    evidence_payload = json.loads(str(input_messages[1]["content"]))
    assert evidence_payload["section_data"]["phase_label"] == "Plateauing"
    assert evidence_payload["section_data"]["rolling_one_year_total"] == 3
    assert evidence_payload["section_data"]["rolling_three_year_pace"] == 8.3
    assert evidence_payload["section_data"]["rolling_prior_period_label"] == "Prior 7 years"
    assert evidence_payload["analysis_brief"]["primary_focus"].startswith(
        "Anchor the stage call on rolling publication pace"
    )
    assert evidence_payload["analysis_brief"]["rolling_pace_summary"].startswith(
        "Last 12 months to end Feb 2026: 3 publications."
    )
    assert evidence_payload["confidence_flags"] == {
        "phase_confidence_low": False,
        "current_pace_signal": "behind",
    }
    assert "records" not in evidence_payload["publication_library"]


def test_generate_publication_insights_agent_draft_rebuilds_publication_production_phase_messages_with_ui_context(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    captured_kwargs: dict[str, object] = {}

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: captured_kwargs.update(kwargs) or SimpleNamespace(
            output_text=(
                '{"sections":['
                '{"key":"publication_production_phase","phase":"plateauing","headline":"Rise, then flattening","body":"The fitted slope remains upward at +1 publication per year from 2016 to 2025, and you published every year across the span. But recent years have moved out of the 11-19 publication band seen in 2021-2024, with 2025 falling to 4 after shared peaks of 19 in 2021 and 2024.","blocks":[]}'
                "]}",
            )
        ),
    )

    publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_production_phase",
        scope="section",
        ui_context="Tooltip copy for production phase.",
    )

    input_messages = captured_kwargs["input"]
    assert isinstance(input_messages, list)
    evidence_payload = json.loads(str(input_messages[1]["content"]))
    assert evidence_payload["ui_context"] == "Tooltip copy for production phase."


def test_publication_production_phase_body_accepts_rolling_pace_led_language(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )

    evidence = publication_insights_agent_service._build_publication_production_phase_evidence(
        user_id="publication-output-test-user"
    )

    assert not publication_insights_agent_service._publication_production_phase_body_is_too_generic(
        body=(
            "Across the full publication span, output peaked in 2021 and 2024 at 19 publications, then fell to 4 in 2025. "
            "In the last 12 months to end Feb 2026, output was 3 publications, below the trailing 3-year pace of 8.3/year "
            "and prior 7 years at 8.0/year."
        ),
        fallback_body="",
        evidence=evidence,
    )


def test_publication_production_phase_structured_output_schema_is_strict() -> None:
    text_config = publication_insights_agent_service._publication_production_phase_text_config()

    assert text_config["format"]["type"] == "json_schema"
    assert text_config["format"]["strict"] is True
    schema = text_config["format"]["schema"]
    assert text_config["format"]["name"] == "publication_production_phase_insight"
    assert schema["additionalProperties"] is False
    assert schema["required"] == ["overall_summary", "sections"]
    assert schema["properties"]["overall_summary"]["anyOf"] == [
        {"type": "string"},
        {"type": "null"},
    ]
    assert schema["properties"]["sections"]["minItems"] == 1
    assert schema["properties"]["sections"]["maxItems"] == 1
    section_schema = schema["properties"]["sections"]["items"]
    assert section_schema["additionalProperties"] is False
    assert section_schema["required"] == ["key", "phase", "headline", "body", "blocks"]
    assert section_schema["properties"]["key"] == {
        "type": "string",
        "const": "publication_production_phase",
    }
    assert section_schema["properties"]["phase"]["enum"] == [
        "early build",
        "accelerating",
        "established expansion",
        "established but concentrated",
        "intermittent",
        "plateauing",
        "reactivated",
    ]
    assert section_schema["properties"]["blocks"]["maxItems"] == 1
    block_schema = section_schema["properties"]["blocks"]["items"]
    assert block_schema["additionalProperties"] is False
    assert block_schema["properties"]["label"]["anyOf"] == [
        {"type": "string"},
        {"type": "null"},
    ]
    assert block_schema["required"] == ["kind", "label", "text"]


def test_generate_publication_insights_agent_draft_accepts_null_overall_summary_and_null_paragraph_label_for_publication_production_phase(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"overall_summary":null,"sections":['
                '{"key":"publication_production_phase","phase":"plateauing","headline":"Rise, then flattening","body":"The fitted slope remains upward at +1 publication per year from 2016 to 2025, and you published every year across the span. But recent years have moved out of the 11-19 publication band seen in 2021-2024, with 2025 falling to 4 after shared peaks of 19 in 2021 and 2024.","blocks":[{"kind":"paragraph","label":null,"text":"The stronger run is recent rather than evenly spread across the whole record."}]}]}'
            )
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_production_phase",
        scope="section",
    )

    assert payload["overall_summary"] == ""
    section = payload["sections"][0]
    assert section["blocks"] == [
        {
            "kind": "paragraph",
            "label": None,
            "text": "The stronger run is recent rather than evenly spread across the whole record.",
        }
    ]
    assert section["consideration_label"] is None
    assert section["consideration"] is None


def test_generate_publication_insights_agent_draft_rejects_extra_fields_for_publication_production_phase(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"sections":['
                '{"key":"publication_production_phase","phase":"plateauing","headline":"Rise, then flattening","body":"The record moved from 2016 to 2025 with 2025 falling to 4 after shared peaks in 2021 and 2024.","blocks":[],"extra_note":"unexpected"}'
                "]}",
            )
        ),
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="invalid fields for publication_production_phase",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id="publication-output-test-user",
            window_id="all",
            section_key="publication_production_phase",
            scope="section",
        )


def test_generate_publication_insights_agent_draft_rejects_too_many_blocks_for_publication_production_phase(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"sections":['
                '{"key":"publication_production_phase","phase":"plateauing","headline":"Rise, then flattening","body":"The fitted slope remains upward at +1 publication per year from 2016 to 2025, and you published every year across the span. But recent years have moved out of the 11-19 publication band seen in 2021-2024, with 2025 falling to 4 after shared peaks of 19 in 2021 and 2024.","blocks":[{"kind":"paragraph","text":"A stronger band held across several years."},{"kind":"callout","label":"Confidence","text":"The latest complete year now sits below that band."}]}'
                "]}",
            )
        ),
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="too many blocks for publication_production_phase",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id="publication-output-test-user",
            window_id="all",
            section_key="publication_production_phase",
            scope="section",
        )


def test_generate_publication_insights_agent_draft_rejects_generic_publication_production_phase_headline(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"sections":['
                '{"key":"publication_production_phase","phase":"plateauing","headline":"Plateauing","body":"The record rises from 2016 to 2025, but 2025 falls to 4 after shared peaks in 2021 and 2024.","blocks":[]}'
                "]}",
            )
        ),
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="generic headline for publication_production_phase",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id="publication-output-test-user",
            window_id="all",
            section_key="publication_production_phase",
            scope="section",
        )


def test_generate_publication_insights_agent_draft_uses_openai_publication_year_over_year_trajectory_read(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    captured_kwargs: dict[str, object] = {}

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: captured_kwargs.update(kwargs) or SimpleNamespace(
            output_text=(
                '{"overall_summary":"A stronger later run is no longer being sustained.","sections":['
                '{"key":"publication_year_over_year_trajectory","trajectory":"contracting","headline":"Stronger run, then a pullback","body":"Across complete years from 2016-2025, output peaked in 2021 and 2024 at 19 publications before falling to 4 in 2025. In the last 12 months to end Feb 2026, output was 3 publications, below the trailing 3-year pace of 8.3/year and prior 7 years at 8.0/year.","blocks":[{"kind":"callout","label":"Confidence note","text":"The full shape rests on complete years through 2025, while the live 2026 window is still partial."}]}]}'
            )
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_year_over_year_trajectory",
        scope="section",
    )

    assert payload["provenance"]["generation_mode"] == "openai"
    section = payload["sections"][0]
    assert section["key"] == "publication_year_over_year_trajectory"
    assert section["headline"] == "Stronger run, then a pullback"
    assert "Across complete years from 2016-2025" in section["body"]
    assert "2021 and 2024" in section["body"]
    assert "last 12 months to end Feb 2026" in section["body"]
    assert section["evidence"]["trajectory"] == "contracting"
    assert section["consideration_label"] == "Confidence note"
    assert "complete years through 2025" in str(section["consideration"] or "")
    assert section["blocks"] == [
        {
            "kind": "callout",
            "label": "Confidence note",
            "text": "The full shape rests on complete years through 2025, while the live 2026 window is still partial.",
        }
    ]
    assert captured_kwargs["max_output_tokens"] == 1200
    assert captured_kwargs["reasoning"] == {"effort": "medium"}
    assert captured_kwargs["store"] is False
    assert (
        captured_kwargs["text"]
        == publication_insights_agent_service._publication_year_over_year_trajectory_text_config()
    )
    input_messages = captured_kwargs["input"]
    assert isinstance(input_messages, list)
    assert len(input_messages) == 2
    assert input_messages[0]["role"] == "system"
    assert "Decide one trajectory only." in input_messages[0]["content"]
    assert "Use complete years first." in input_messages[0]["content"]
    assert "make that comparison explicit in the body" in input_messages[0]["content"]
    assert "no more than 3 numbers" in input_messages[0]["content"]
    assert input_messages[1]["role"] == "user"
    evidence_payload = json.loads(str(input_messages[1]["content"]))
    assert evidence_payload["section_data"]["trajectory_phase_label"] == "expanding"
    assert evidence_payload["analysis_brief"]["primary_focus"].startswith(
        "Use complete publication years to anchor the year-over-year read. Then make the recent rolling comparison explicit in the body"
    )
    assert evidence_payload["analysis_brief"]["body_requirement"].startswith(
        "Do not leave the rolling read implied."
    )
    assert evidence_payload["confidence_flags"] == {
        "includes_partial_year": True,
        "phase_confidence_low": False,
    }
    assert "records" not in evidence_payload["publication_library"]


def test_generate_publication_insights_agent_draft_rebuilds_publication_year_over_year_trajectory_messages_with_ui_context(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    captured_kwargs: dict[str, object] = {}

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: captured_kwargs.update(kwargs) or SimpleNamespace(
            output_text=(
                '{"sections":['
                '{"key":"publication_year_over_year_trajectory","trajectory":"contracting","headline":"Stronger run, then a pullback","body":"Across complete years from 2016-2025, output peaked in 2021 and 2024 at 19 publications before falling to 4 in 2025. In the last 12 months to end Feb 2026, output was 3 publications, below the trailing 3-year pace of 8.3/year and prior 7 years at 8.0/year.","blocks":[]}]}'
            )
        ),
    )

    publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_year_over_year_trajectory",
        scope="section",
        ui_context="Tooltip copy for trajectory.",
    )

    input_messages = captured_kwargs["input"]
    assert isinstance(input_messages, list)
    evidence_payload = json.loads(str(input_messages[1]["content"]))
    assert evidence_payload["ui_context"] == "Tooltip copy for trajectory."


def test_publication_year_over_year_trajectory_structured_output_schema_is_strict() -> None:
    text_config = (
        publication_insights_agent_service._publication_year_over_year_trajectory_text_config()
    )

    assert text_config["format"]["type"] == "json_schema"
    assert text_config["format"]["strict"] is True
    assert (
        text_config["format"]["name"]
        == "publication_year_over_year_trajectory_insight"
    )
    schema = text_config["format"]["schema"]
    assert schema["additionalProperties"] is False
    assert schema["required"] == ["overall_summary", "sections"]
    assert schema["properties"]["overall_summary"]["anyOf"] == [
        {"type": "string"},
        {"type": "null"},
    ]
    assert schema["properties"]["sections"]["minItems"] == 1
    assert schema["properties"]["sections"]["maxItems"] == 1
    section_schema = schema["properties"]["sections"]["items"]
    assert section_schema["additionalProperties"] is False
    assert section_schema["required"] == [
        "key",
        "trajectory",
        "headline",
        "body",
        "blocks",
    ]
    assert section_schema["properties"]["key"] == {
        "type": "string",
        "const": "publication_year_over_year_trajectory",
    }
    assert section_schema["properties"]["trajectory"]["enum"] == [
        "expanding",
        "stable",
        "contracting",
    ]
    assert section_schema["properties"]["blocks"]["maxItems"] == 1
    block_schema = section_schema["properties"]["blocks"]["items"]
    assert block_schema["additionalProperties"] is False
    assert block_schema["properties"]["label"]["anyOf"] == [
        {"type": "string"},
        {"type": "null"},
    ]
    assert block_schema["required"] == ["kind", "label", "text"]


def test_generate_publication_insights_agent_draft_rejects_generic_publication_year_over_year_trajectory_body(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"sections":['
                '{"key":"publication_year_over_year_trajectory","trajectory":"contracting","headline":"Stronger run, then a pullback","body":"The trajectory changed over time and the run shifted in the latest years.","blocks":[]}]}'
            )
        ),
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="generic body for publication_year_over_year_trajectory",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id="publication-output-test-user",
            window_id="all",
            section_key="publication_year_over_year_trajectory",
            scope="section",
        )


def test_build_publication_volume_over_time_fallback_payload(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )

    evidence = publication_insights_agent_service._build_publication_volume_over_time_evidence(
        user_id="publication-output-test-user"
    )
    payload = publication_insights_agent_service._build_publication_volume_over_time_fallback_payload(
        evidence
    )

    assert evidence["overall_trajectory"] == "build_then_flatter"
    assert evidence["recent_position"] == "recently_lighter_than_long_run"
    assert evidence["recent_detail_pattern"] == "small_dated_set"
    assert evidence["stronger_run_label"] == "2021-2025"
    assert evidence["stronger_run_min_count"] == 9
    assert evidence["stronger_run_max_count"] == 15
    assert evidence["stronger_run_latest_count"] == 3
    assert evidence["recent_support_strength"] == "thin"
    assert evidence["volume_read_mode"] == "pause_below_band"
    assert evidence["recent_monthly_period_label"] == "Mar 2025-Feb 2026"
    assert evidence["table_recent_range_label"] == "12 Apr 2025 to 15 Feb 2026"
    section = payload["sections"][0]
    assert section["key"] == "publication_volume_over_time"
    assert section["headline"] == "Paused below recent band"
    assert "2016-2025" in section["body"]
    assert "stronger 2021-2025 run" in section["body"]
    assert "rolling annual output typically between 9-15 publications" in section["body"]
    assert "Both recent rolling views now sit below that band" in section["body"]
    assert "latest 12 months contain 4 publications" in section["body"]
    assert section["consideration_label"] == "Why it matters"
    assert "near-term assessments of the portfolio" in str(
        section["consideration"] or ""
    )
    assert "earlier strong years than by fresh output" in str(section["consideration"] or "")


def test_generate_publication_insights_agent_draft_uses_openai_publication_volume_over_time_read(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    captured_kwargs: dict[str, object] = {}

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: captured_kwargs.update(kwargs) or SimpleNamespace(
            output_text=(
                '{"overall_summary":"The record builds into stronger later years, but the latest windows now sit below that earlier high-water mark and rest on a small recent set.",'
                '"sections":['
                '{"key":"publication_volume_over_time","headline":"Build then pause",'
                '"body":"Across 2016-2025, publication volume moved into a stronger 2021-2025 run, with rolling annual output typically between 9-15 publications. Both recent rolling views now sit below that band, and the latest 12 months contain 4 publications, so the record currently looks paused rather than reset into a durable lower baseline.",'
                '"consideration_label":"Confidence",'
                '"consideration":"Because only 4 dated publications sit in the latest 12 months, this part of the record can still shift quickly as new papers are added."}'
                "]}",
            )
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_volume_over_time",
        scope="section",
    )

    assert payload["provenance"]["generation_mode"] == "openai"
    assert payload["provenance"]["evidence"]["overall_trajectory"] == "build_then_flatter"
    assert payload["provenance"]["evidence"]["recent_position"] == "recently_lighter_than_long_run"
    assert payload["provenance"]["evidence"]["stronger_run_label"] == "2021-2025"
    section = payload["sections"][0]
    assert section["key"] == "publication_volume_over_time"
    assert section["headline"] == "Build then pause"
    assert "2016-2025" in section["body"]
    assert "stronger 2021-2025 run" in section["body"]
    assert "rolling annual output typically between 9-15 publications" in section["body"]
    assert "Both recent rolling views now sit below that band" in section["body"]
    assert "latest 12 months contain 4 publications" in section["body"]
    assert section["consideration_label"] == "Confidence"
    assert "part of the record can still shift quickly" in str(section["consideration"] or "")
    assert captured_kwargs["text"] == {"format": {"type": "json_object"}}
    prompt_text = str(captured_kwargs["input"])
    assert "Use one shared publication-insight reasoning style" in prompt_text
    assert "Section question: How has publication volume changed, and why does it matter?" in prompt_text
    assert "publication_library contains compact whole-record library context rather than a record-by-record dump" in prompt_text
    assert '"publication_library"' in prompt_text
    assert '"records"' not in prompt_text
    assert "Paper A" not in prompt_text
    assert "analysis_brief" in prompt_text


def test_build_publication_article_type_over_time_fallback_payload(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_article_type_over_time_metrics(),
    )

    evidence = publication_insights_agent_service._build_publication_article_type_over_time_evidence(
        user_id="publication-article-type-test-user"
    )
    payload = publication_insights_agent_service._build_publication_article_type_over_time_fallback_payload(
        evidence
    )

    assert evidence["full_record_mix_state"] == "strong_anchor"
    assert evidence["recent_window_change_state"] == "late_leader_shift"
    assert evidence["recent_window_confidence"] == "too_thin"
    assert evidence["latest_partial_year_label"] == "2026 (through 8 Mar 2026)"
    section = payload["sections"][0]
    assert section["key"] == "publication_article_type_over_time"
    assert section["headline"] == "Review article is gaining ground"
    assert "Across 2016-2026" in section["body"]
    assert "Original research makes up 67% of publications" in section["body"]
    assert "The clearer change sits in 2024-2026" in section["body"]
    assert "2022-2026 still looks closer" in section["body"]
    assert section["consideration_label"] == "Confidence"
    assert "should confirm the 5-year and 3-year pattern" in str(section["consideration"] or "")


def test_generate_publication_insights_agent_draft_uses_openai_publication_article_type_over_time_read(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    captured_kwargs: dict[str, object] = {}

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_article_type_over_time_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: captured_kwargs.update(kwargs) or SimpleNamespace(
            output_text=(
                '{"overall_summary":"Original research remains the largest share, but review articles have taken much more of the shorter recent windows.",'
                '"sections":['
                '{"key":"publication_article_type_over_time","mix_pattern":"late_leader_shift","headline":"Review article is gaining ground",'
                '"body":"Across 2016-2026, original research makes up 67% of the record (10 of 15), with review article next at 27%. The shift shows up in 2024-2026, where review article carries more of the mix, while 2022-2026 still stays closer to the longer-run ordering led by original research. The shorter windows do not fully reverse the hierarchy, but they do make review article a more visible second force than it is across the full record.",'
                '"blocks":[{"kind":"callout","label":"Confidence","text":"The newest rolling year only contains 2 publications and includes 2026 (through 8 Mar 2026), so it should confirm the 5-year and 3-year pattern, not override it."}]}'
                "]}",
            )
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-article-type-test-user",
        window_id="all",
        section_key="publication_article_type_over_time",
        scope="section",
        ui_context="Tooltip copy for article types.",
    )

    assert payload["provenance"]["generation_mode"] == "openai"
    evidence = payload["provenance"]["evidence"]
    assert evidence["recent_window_change_state"] == "late_leader_shift"
    section = payload["sections"][0]
    assert section["key"] == "publication_article_type_over_time"
    assert section["headline"] == "Review article is gaining ground"
    assert "Across 2016-2026" in section["body"]
    assert "original research makes up 67% of the record" in section["body"]
    assert "review article carries more of the mix" in section["body"]
    assert section["evidence"]["mix_pattern"] == "late_leader_shift"
    assert section["consideration_label"] == "Confidence"
    assert "should confirm the 5-year and 3-year pattern" in str(section["consideration"] or "")
    assert section["blocks"] == [
        {
            "kind": "callout",
            "label": "Confidence",
            "text": "The newest rolling year only contains 2 publications and includes 2026 (through 8 Mar 2026), so it should confirm the 5-year and 3-year pattern, not override it.",
        }
    ]
    assert captured_kwargs["timeout"] == 45.0
    assert captured_kwargs["max_retries"] == 0
    assert captured_kwargs["max_output_tokens"] == 1400
    assert captured_kwargs["store"] is False
    assert captured_kwargs["text"] == publication_insights_agent_service._publication_article_type_over_time_text_config()
    assert captured_kwargs["reasoning"] == {"effort": "medium"}
    input_messages = captured_kwargs["input"]
    assert isinstance(input_messages, list)
    assert len(input_messages) == 2
    assert input_messages[0]["role"] == "system"
    assert "Decide one mix pattern only." in input_messages[0]["content"]
    evidence_payload = json.loads(str(input_messages[1]["content"]))
    assert evidence_payload["ui_context"] == "Tooltip copy for article types."
    assert evidence_payload["section_data"]["recent_window_change_state"] == "late_leader_shift"
    assert "records" not in evidence_payload["publication_library"]


def test_publication_article_type_over_time_structured_output_schema_is_strict() -> None:
    text_config = publication_insights_agent_service._publication_article_type_over_time_text_config()

    assert text_config["format"]["type"] == "json_schema"
    assert text_config["format"]["strict"] is True
    assert text_config["format"]["name"] == "publication_article_type_over_time_insight"
    schema = text_config["format"]["schema"]
    assert schema["additionalProperties"] is False
    assert schema["required"] == ["overall_summary", "sections"]
    assert schema["properties"]["sections"]["maxItems"] == 1
    section_schema = schema["properties"]["sections"]["items"]
    assert section_schema["additionalProperties"] is False
    assert section_schema["required"] == ["key", "mix_pattern", "headline", "body", "blocks"]
    assert section_schema["properties"]["key"] == {
        "type": "string",
        "const": "publication_article_type_over_time",
    }
    assert section_schema["properties"]["mix_pattern"]["enum"] == [
        "short_record",
        "late_leader_shift",
        "leader_shift",
        "same_leader_more_concentrated",
        "same_leader_narrower",
        "broader_recent",
        "stable_anchor",
    ]
    assert section_schema["properties"]["blocks"]["maxItems"] == 1
    block_schema = section_schema["properties"]["blocks"]["items"]
    assert block_schema["additionalProperties"] is False
    assert block_schema["required"] == ["kind", "label", "text"]


def test_generate_publication_insights_agent_draft_rejects_extra_fields_for_publication_article_type_over_time(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_article_type_over_time_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"overall_summary":"summary","sections":['
                '{"key":"publication_article_type_over_time","mix_pattern":"late_leader_shift","headline":"Review article is gaining ground","body":"Across 2016-2026, original research still leads, but review article carries more of the newest mix.","blocks":[],"extra":"nope"}]}'
            )
        ),
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="invalid fields for publication_article_type_over_time",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id="publication-article-type-test-user",
            window_id="all",
            section_key="publication_article_type_over_time",
            scope="section",
        )


def test_publication_type_over_time_body_accepts_verbal_share_signal() -> None:
    evidence = {
        "all_window": {"top_labels": ["Journal article"]},
        "latest_window": {"range_label": "2026"},
        "five_year_window": {"range_label": "2022-2026"},
        "three_year_window": {"range_label": "2024-2026"},
        "span_years_label": "2018-2026",
        "recent_window_change_state": "same_leader_more_concentrated",
    }

    assert not publication_insights_agent_service._publication_type_over_time_body_is_too_generic(
        body=(
            "Journal articles have held a near-constant three-quarter share across the full record "
            "and in both the 5-year and 3-year windows, so there is no meaningful change in the leading format. "
            "What has changed is the remainder: earlier output included a broader tail of Other, datasets, letters, "
            "and reports, whereas the recent mix is narrower and the second position is now conference abstracts rather than Other."
        ),
        fallback_body="",
        evidence=evidence,
    )


def test_publication_article_type_over_time_body_accepts_written_recent_window_phrases() -> None:
    evidence = {
        "all_window": {"top_labels": ["Original research"]},
        "latest_window": {"range_label": "2026"},
        "five_year_window": {"range_label": "2022-2026"},
        "three_year_window": {"range_label": "2024-2026"},
        "span_years_label": "2018-2026",
        "recent_window_change_state": "same_leader_more_concentrated",
    }

    assert not publication_insights_agent_service._publication_article_type_over_time_body_is_too_generic(
        body=(
            "The older record was more mixed, but the newer portfolio is substantially less so: "
            "original research rises from 68% across the full set to 84% in the last five years and 88% in 2024-2026. "
            "Reviews remain present, but they no longer seriously compete for share, and the minor forms seen earlier-case reports and letters-drop out of the recent mix entirely."
        ),
        fallback_body="",
        evidence=evidence,
    )


def test_publication_article_type_over_time_body_accepts_flip_language() -> None:
    evidence = {
        "all_window": {"top_labels": ["Original research"]},
        "latest_window": {"range_label": "2026"},
        "five_year_window": {"range_label": "2022-2026"},
        "three_year_window": {"range_label": "2024-2026"},
        "span_years_label": "2016-2026",
        "recent_window_change_state": "late_leader_shift",
    }

    assert not publication_insights_agent_service._publication_article_type_over_time_body_is_too_generic(
        body=(
            "Across 2016-2026, original research set the portfolio's basic shape, making up two-thirds of publications, "
            "with review articles well behind. That longer-run ordering still holds in 2022-2026, but only just: "
            "5 original research papers versus 4 reviews. By 2024-2026, the mix has flipped, with review articles "
            "taking 4 of 6 publications and leaving a narrower two-type profile."
        ),
        fallback_body="",
        evidence=evidence,
    )


def test_build_publication_type_over_time_fallback_payload(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_type_over_time_metrics(),
    )

    evidence = publication_insights_agent_service._build_publication_type_over_time_evidence(
        user_id="publication-type-test-user"
    )
    payload = publication_insights_agent_service._build_publication_type_over_time_fallback_payload(
        evidence
    )

    assert evidence["full_record_mix_state"] == "strong_anchor"
    assert evidence["recent_window_change_state"] == "late_leader_shift"
    assert evidence["recent_window_confidence"] == "too_thin"
    assert evidence["latest_partial_year_label"] == "2026 (through 8 Mar 2026)"
    section = payload["sections"][0]
    assert section["key"] == "publication_type_over_time"
    assert section["headline"] == "Review article is gaining ground"
    assert "Across 2016-2026" in section["body"]
    assert "Journal article makes up 67% of publications" in section["body"]
    assert "The clearer change sits in 2024-2026" in section["body"]
    assert "2022-2026 still looks closer" in section["body"]
    assert section["consideration_label"] == "Confidence"
    assert "should confirm the 5-year and 3-year pattern" in str(section["consideration"] or "")


def test_generate_publication_insights_agent_draft_uses_openai_publication_type_over_time_read(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    captured_kwargs: dict[str, object] = {}

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_type_over_time_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: captured_kwargs.update(kwargs) or SimpleNamespace(
            output_text=(
                '{"overall_summary":"Journal articles remain the largest share, but review articles have taken much more of the shorter recent windows.",'
                '"sections":['
                '{"key":"publication_type_over_time","mix_pattern":"late_leader_shift","headline":"Review article is gaining ground",'
                '"body":"Across 2016-2026, journal article makes up 67% of the record (10 of 15), with review article next at 27%. The shift shows up in 2024-2026, where review article carries more of the mix, while 2022-2026 still stays closer to the longer-run ordering led by journal article. The newer windows make that second-position change easier to see, even though the broader record still keeps journal article firmly in first place.",'
                '"blocks":[{"kind":"callout","label":"Confidence","text":"The newest rolling year only contains 2 publications and includes 2026 (through 8 Mar 2026), so it should confirm the 5-year and 3-year pattern, not override it."}]}'
                "]}",
            )
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-type-test-user",
        window_id="all",
        section_key="publication_type_over_time",
        scope="section",
        ui_context="Tooltip copy for publication types.",
    )

    assert payload["provenance"]["generation_mode"] == "openai"
    evidence = payload["provenance"]["evidence"]
    assert evidence["recent_window_change_state"] == "late_leader_shift"
    section = payload["sections"][0]
    assert section["key"] == "publication_type_over_time"
    assert section["headline"] == "Review article is gaining ground"
    assert "Across 2016-2026" in section["body"]
    assert "journal article makes up 67% of the record" in section["body"]
    assert "review article carries more of the mix" in section["body"]
    assert section["evidence"]["mix_pattern"] == "late_leader_shift"
    assert section["consideration_label"] == "Confidence"
    assert "should confirm the 5-year and 3-year pattern" in str(section["consideration"] or "")
    assert section["blocks"] == [
        {
            "kind": "callout",
            "label": "Confidence",
            "text": "The newest rolling year only contains 2 publications and includes 2026 (through 8 Mar 2026), so it should confirm the 5-year and 3-year pattern, not override it.",
        }
    ]
    assert captured_kwargs["timeout"] == 45.0
    assert captured_kwargs["max_retries"] == 0
    assert captured_kwargs["max_output_tokens"] == 1400
    assert captured_kwargs["store"] is False
    assert captured_kwargs["text"] == publication_insights_agent_service._publication_type_over_time_text_config()
    assert captured_kwargs["reasoning"] == {"effort": "medium"}
    input_messages = captured_kwargs["input"]
    assert isinstance(input_messages, list)
    assert len(input_messages) == 2
    assert input_messages[0]["role"] == "system"
    assert "Decide one mix pattern only." in input_messages[0]["content"]
    evidence_payload = json.loads(str(input_messages[1]["content"]))
    assert evidence_payload["ui_context"] == "Tooltip copy for publication types."
    assert evidence_payload["section_data"]["recent_window_change_state"] == "late_leader_shift"
    assert "records" not in evidence_payload["publication_library"]


def test_publication_type_over_time_structured_output_schema_is_strict() -> None:
    text_config = publication_insights_agent_service._publication_type_over_time_text_config()

    assert text_config["format"]["type"] == "json_schema"
    assert text_config["format"]["strict"] is True
    assert text_config["format"]["name"] == "publication_type_over_time_insight"
    schema = text_config["format"]["schema"]
    assert schema["additionalProperties"] is False
    assert schema["required"] == ["overall_summary", "sections"]
    assert schema["properties"]["sections"]["maxItems"] == 1
    section_schema = schema["properties"]["sections"]["items"]
    assert section_schema["additionalProperties"] is False
    assert section_schema["required"] == ["key", "mix_pattern", "headline", "body", "blocks"]
    assert section_schema["properties"]["key"] == {
        "type": "string",
        "const": "publication_type_over_time",
    }
    assert section_schema["properties"]["mix_pattern"]["enum"] == [
        "short_record",
        "late_leader_shift",
        "leader_shift",
        "same_leader_more_concentrated",
        "same_leader_narrower",
        "broader_recent",
        "stable_anchor",
    ]
    assert section_schema["properties"]["blocks"]["maxItems"] == 1
    block_schema = section_schema["properties"]["blocks"]["items"]
    assert block_schema["additionalProperties"] is False
    assert block_schema["required"] == ["kind", "label", "text"]


def test_generate_publication_insights_agent_draft_rejects_extra_fields_for_publication_type_over_time(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_type_over_time_metrics(),
    )
    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(
            output_text=(
                '{"overall_summary":"summary","sections":['
                '{"key":"publication_type_over_time","mix_pattern":"late_leader_shift","headline":"Review article is gaining ground","body":"Across 2016-2026, journal article still leads, but review article carries more of the newest mix.","blocks":[],"extra":"nope"}]}'
            )
        ),
    )

    with pytest.raises(
        publication_insights_agent_service.PublicationInsightsAgentValidationError,
        match="invalid fields for publication_type_over_time",
    ):
        publication_insights_agent_service.generate_publication_insights_agent_draft(
            user_id="publication-type-test-user",
            window_id="all",
            section_key="publication_type_over_time",
            scope="section",
        )


def test_build_prompt_uses_shared_citation_insight_guidance() -> None:
    prompt = publication_insights_agent_service._build_prompt(
        {
            "citation_scope": "all",
            "window_phrase": "across the full citation section",
            "uncited_publications_pct": 20.0,
            "driver_share_pct": 42.0,
            "top_publication_share_pct": 30.0,
            "activation_publication_pct": 18.0,
            "portfolio_context": {},
        }
    )

    assert "highly capable academic reader" in prompt
    assert "where citation attention concentrates" in prompt
    assert "whether activation is renewing or narrowing" in prompt
    assert "old tail, a recent lag, or a broader problem" in prompt
    assert "Supporting blocks are optional. Most sections need none or just one." in prompt
    assert "The response shape maps to UI slots, not a checklist" in prompt
    assert "Each body should usually be 1 to 3 sentences and roughly 30 to 70 words" in prompt
    assert "If a field runs long, rewrite it shorter instead of expecting truncation or cleanup." not in prompt


def test_build_publication_section_evidence_payload_compacts_library_and_deduplicates_ui_context() -> None:
    payload = publication_insights_agent_service._build_publication_section_evidence_payload(
        {
            "portfolio_context": {"discipline": "Medicine"},
            "publication_library": {
                "total_records": 2,
                "first_publication_year": 2020,
                "last_publication_year": 2024,
                "years_with_output": [{"year": 2020, "count": 1}, {"year": 2024, "count": 1}],
                "article_type_counts": [{"label": "Original research", "count": 2}],
                "publication_type_counts": [{"label": "Journal article", "count": 2}],
                "records": [
                    {"title": "Paper A", "year": 2024},
                    {"title": "Paper B", "year": 2020},
                ],
                "as_of_date": "2026-03-09",
            },
            "phase_label": "Plateauing",
            "ui_context": "Hover copy from the question-mark tooltip.",
        },
        ui_context="Hover copy from the question-mark tooltip.",
    )

    assert payload["publication_library"] == {
        "total_records": 2,
        "first_publication_year": 2020,
        "last_publication_year": 2024,
        "years_with_output": [{"year": 2020, "count": 1}, {"year": 2024, "count": 1}],
        "article_type_counts": [{"label": "Original research", "count": 2}],
        "publication_type_counts": [{"label": "Journal article", "count": 2}],
        "as_of_date": "2026-03-09",
    }
    assert "records" not in payload["publication_library"]
    assert payload["ui_context"] == "Hover copy from the question-mark tooltip."
    assert payload["section_data"] == {"phase_label": "Plateauing"}


def test_require_generated_text_keeps_longer_body_without_trimming() -> None:
    overlong_body = (
        "This is a deliberately long sentence that keeps going past the slot because it repeats the same structural "
        "point about publication concentration and continuity until the validator has to decide whether to clip it or "
        "raise a real contract error for the generated body."
    )

    clean = publication_insights_agent_service._require_generated_text(
        text=overlong_body,
        section_key="publication_output_pattern",
        field_name="body",
        require_sentence_end=True,
    )

    assert clean == overlong_body


def test_normalize_generated_note_keeps_longer_label_without_slicing() -> None:
    label, consideration = publication_insights_agent_service._normalize_generated_note(
        label="What would confirm it next",
        consideration="A full next year near the earlier high band would make the stronger run look durable.",
        section_key="publication_output_pattern",
    )

    assert label == "What would confirm it next"
    assert consideration == "A full next year near the earlier high band would make the stronger run look durable."


def test_finalize_publication_insight_sections_merges_blocks_with_legacy_note() -> None:
    sections = publication_insights_agent_service._finalize_publication_insight_sections(
        [
            {
                "key": "publication_output_pattern",
                "title": "Publication output pattern",
                "headline": "Shared highs, then a break",
                "body": "The record remains continuous across the span.",
                "blocks": [
                    {"kind": "paragraph", "text": "The stronger run is recent rather than evenly spread."},
                    {"kind": "callout", "label": "Confidence", "text": "The live year is still incomplete."},
                ],
                "consideration_label": "Context",
                "consideration": "A full next year will show whether the break persists.",
            }
        ]
    )

    assert len(sections) == 1
    assert sections[0]["blocks"] == [
        {"kind": "paragraph", "label": None, "text": "The stronger run is recent rather than evenly spread."},
        {"kind": "callout", "label": "Confidence", "text": "The live year is still incomplete."},
        {"kind": "callout", "label": "Context", "text": "A full next year will show whether the break persists."},
    ]


def test_publication_insights_agent_api_returns_payload(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        lambda **kwargs: SimpleNamespace(output_text=_mock_citation_openai_output()),
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
    assert "1 of 3 papers is still uncited" in payload["sections"][0]["body"]
    assert any(section["key"] == "citation_activation" for section in payload["sections"])
    assert any(section["key"] == "citation_activation_history" for section in payload["sections"])
    assert payload["sections"][0]["consideration_label"]
    assert payload["sections"][0]["consideration"]

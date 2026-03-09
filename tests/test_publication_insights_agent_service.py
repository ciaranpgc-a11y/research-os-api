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
    assert payload["provenance"]["model"] in {"gpt-5.4", "gpt-4.1-mini"}
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


def test_generate_publication_insights_agent_draft_builds_richer_publication_output_pattern_fallback(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )

    def _raise_error(**kwargs):  # noqa: ANN003
        raise RuntimeError("OpenAI unavailable")

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        _raise_error,
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_output_pattern",
        scope="section",
    )

    assert payload["status"] == "draft"
    assert payload["provenance"]["generation_mode"] == "deterministic_fallback"
    assert payload["provenance"]["evidence"]["phase_label"] == "Plateauing"
    assert payload["provenance"]["evidence"]["recent_years_label"] == "2023-2025"
    section = payload["sections"][0]
    assert section["headline"] == "Growth flattening"
    assert "every year from 2016 to 2025" in section["body"]
    assert "2025 fell to 4" in section["body"]
    assert "2021 and 2024" in section["body"]
    assert section["consideration_label"] == "What changes it"
    assert "11-19 publication band seen across 2021-2024" in str(section["consideration"] or "")
    assert "another year near 4 would deepen it" in str(section["consideration"] or "")


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
                '{"key":"publication_output_pattern","headline":"Repeated highs, softer finish",'
                '"body":"You published in every year from 2016 to 2025, and recent years averaged 12 publications versus 9 earlier, so the record is broader than a one-peak profile. But 2025 fell to 4 after shared peaks of 19 in 2021 and 2024, which makes the pattern look more like a softer finish after repeated highs than continued build.",'
                '"consideration_label":"Why it matters",'
                '"consideration":"Because the highs are shared rather than isolated, the drop to 4 in 2025 reads more like broader lost momentum than the fading of one standout year."}'
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
    assert section["headline"] == "Repeated highs, softer finish"
    assert "every year from 2016 to 2025" in section["body"]
    assert "2025 fell to 4" in section["body"]
    assert "2021 and 2024" in section["body"]
    assert section["consideration_label"] == "Why it matters"
    assert "shared rather than isolated" in str(section["consideration"] or "")
    prompt_text = str(captured_kwargs["input"])
    assert "Use one shared publication-insight reasoning style" in prompt_text
    assert (
        "Section question: What is the deepest insight about the steadiness of this publication record?"
        in prompt_text
    )
    assert "publication_library contains the user's publication library as a whole-record evidence layer" in prompt_text
    assert '"publication_library"' in prompt_text
    assert "Paper A" in prompt_text
    assert "analysis_brief" in prompt_text
    assert "Treat analysis_brief as a starting point, not a script." in prompt_text


def test_generate_publication_insights_agent_draft_rejects_unsupported_publication_output_pattern_partial_year_note(
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
                '{"key":"publication_output_pattern","headline":"Continuous, later surge",'
                '"body":"Publishing is uninterrupted across all 10 years, with the quietest years concentrated early (2016-2017 at 1 each). Output then rises and becomes burstier, with two tied peak years (2021 and 2024 at 19). Recent years are generally stronger than the early baseline, so the pattern reads as scaling without dependence on one isolated year.",'
                '"consideration_label":"Check recency",'
                '"consideration":"Because 2025 is lower, verify whether it is a partial-year count before interpreting it as a slowdown."}'
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

    section = payload["sections"][0]
    assert section["headline"] == "Continuous, later surge"
    assert section["body"].endswith(".")
    assert "partial-year" not in str(section["consideration"] or "").lower()
    assert section["consideration_label"] == "What changes it"
    assert "11-19 publication band seen across 2021-2024" in str(section["consideration"] or "")


def test_generate_publication_insights_agent_draft_builds_publication_production_phase_fallback(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )

    def _raise_error(**kwargs):  # noqa: ANN003
        raise RuntimeError("OpenAI unavailable")

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        _raise_error,
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_production_phase",
        scope="section",
    )

    assert payload["status"] == "draft"
    assert payload["provenance"]["generation_mode"] == "deterministic_fallback"
    evidence = payload["provenance"]["evidence"]
    assert evidence["phase_label"] == "Plateauing"
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
    assert "+1 publication per year from 2016 to 2025" in section["body"]
    assert "higher-output band that ran at 11-19 publications across 2021-2024" in section["body"]
    assert "2025 fell to 4" in section["body"]
    assert section["consideration_label"] == "What changes it"
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
                '{"overall_summary":"The record expanded into a higher-output band, but the latest complete year no longer holds that stronger run.",'
                '"sections":['
                '{"key":"publication_production_phase","headline":"Rise, then flattening",'
                '"body":"The fitted slope remains upward at +1 publication per year from 2016 to 2025, but the record has moved out of the higher-output band that ran at 11-19 publications across 2021-2024. 2025 fell to 4 after joint peaks of 19 in 2021 and 2024, so this now reads as flattening rather than continued scaling.",'
                '"consideration_label":"What changes it",'
                '"consideration":"A next complete year back into the 2021-2024 band would move this toward scaling; another year near 4 would strengthen plateauing."}'
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
    assert section["headline"] == "Rise, then flattening"
    assert "+1 publication per year from 2016 to 2025" in section["body"]
    assert "2025 fell to 4" in section["body"]
    assert "11-19 publications across 2021-2024" in section["body"]
    assert section["consideration_label"] == "What changes it"
    assert "back into the 2021-2024 band" in str(section["consideration"] or "")
    assert "another year near 4 would strengthen plateauing" in str(section["consideration"] or "")
    prompt_text = str(captured_kwargs["input"])
    assert "Use one shared publication-insight reasoning style" in prompt_text
    assert "Section question: What stage is this publication record in, and why?" in prompt_text
    assert "publication_library contains the user's publication library as a whole-record evidence layer" in prompt_text
    assert '"publication_library"' in prompt_text
    assert "Paper A" in prompt_text
    assert "Only include the follow-on note when it adds a distinct reading aid" in prompt_text


def test_generate_publication_insights_agent_draft_builds_publication_volume_over_time_fallback(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_output_pattern_metrics(),
    )

    def _raise_error(**kwargs):  # noqa: ANN003
        raise RuntimeError("OpenAI unavailable")

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        _raise_error,
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-output-test-user",
        window_id="all",
        section_key="publication_volume_over_time",
        scope="section",
    )

    assert payload["status"] == "draft"
    assert payload["provenance"]["generation_mode"] == "deterministic_fallback"
    evidence = payload["provenance"]["evidence"]
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
                '{"overall_summary":"The record builds into stronger later years, but the latest windows now sit below that earlier high-water mark and are being read from a small recent set.",'
                '"sections":['
                '{"key":"publication_volume_over_time","headline":"Build then pause",'
                '"body":"Across 2016-2025, publication volume builds from a very quiet start into later peak years. The latest 5-year, 3-year, and 12-month views all sit below that stronger middle-to-late stretch, so recent volume currently looks more like a pause below your earlier high-water mark than a settled decline, and the recent rows are still being carried by only 4 dated publications.",'
                '"consideration_label":"Recent detail",'
                '"consideration":"Because only 4 dated publications sit in the latest 12 months, this recent read can still shift quickly as new papers are added."}'
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
    assert section["consideration_label"] == "Why it matters"
    assert "near-term assessments of the portfolio" in str(
        section["consideration"] or ""
    )
    prompt_text = str(captured_kwargs["input"])
    assert "Use one shared publication-insight reasoning style" in prompt_text
    assert "Section question: How has publication volume changed, and why does it matter?" in prompt_text
    assert "publication_library contains the user's publication library as a whole-record evidence layer" in prompt_text
    assert '"publication_library"' in prompt_text
    assert "Paper A" in prompt_text
    assert "analysis_brief" in prompt_text


def test_generate_publication_insights_agent_draft_builds_publication_article_type_over_time_fallback(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_article_type_over_time_metrics(),
    )

    def _raise_error(**kwargs):  # noqa: ANN003
        raise RuntimeError("OpenAI unavailable")

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        _raise_error,
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-article-type-test-user",
        window_id="all",
        section_key="publication_article_type_over_time",
        scope="section",
    )

    assert payload["status"] == "draft"
    assert payload["provenance"]["generation_mode"] == "deterministic_fallback"
    evidence = payload["provenance"]["evidence"]
    assert evidence["full_record_mix_state"] == "strong_anchor"
    assert evidence["recent_window_change_state"] == "late_leader_shift"
    assert evidence["recent_window_confidence"] == "too_thin"
    assert evidence["latest_partial_year_label"] == "2026 (through 8 Mar 2026)"
    section = payload["sections"][0]
    assert section["key"] == "publication_article_type_over_time"
    assert section["headline"] == "Review article is gaining ground"
    assert "Across 2016-2026" in section["body"]
    assert "Original research makes up 67% of the record" in section["body"]
    assert "The clearer change sits in 2024-2026" in section["body"]
    assert "2022-2026 still looks closer" in section["body"]
    assert section["consideration_label"] == "Confidence"
    assert "should confirm the 5-year and 3-year read" in str(section["consideration"] or "")


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
                '{"key":"publication_article_type_over_time","headline":"Review article is gaining ground",'
                '"body":"Across 2016-2026, Original research makes up 67% of the record (10 of 15), with Review article next at 27%. The clearer change sits in 2024-2026: Review article now carries more of the mix there, while 2022-2026 still looks closer to the longer-run ordering led by Original research.",'
                '"consideration_label":"Confidence",'
                '"consideration":"The newest rolling year only contains 2 publications and includes 2026 (through 8 Mar 2026), so it should confirm the 5-year and 3-year read, not override it."}'
                "]}",
            )
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-article-type-test-user",
        window_id="all",
        section_key="publication_article_type_over_time",
        scope="section",
    )

    assert payload["provenance"]["generation_mode"] == "openai"
    evidence = payload["provenance"]["evidence"]
    assert evidence["recent_window_change_state"] == "late_leader_shift"
    section = payload["sections"][0]
    assert section["key"] == "publication_article_type_over_time"
    assert section["headline"] == "Review article is gaining ground"
    assert "Across 2016-2026" in section["body"]
    assert "Original research makes up 67% of the record" in section["body"]
    assert "Review article now carries more of the mix there" in section["body"]
    assert section["consideration_label"] == "Confidence"
    assert "should confirm the 5-year and 3-year read" in str(section["consideration"] or "")
    assert captured_kwargs["timeout"] == 20.0
    assert captured_kwargs["max_retries"] == 0
    prompt_text = str(captured_kwargs["input"])
    assert "Use one shared publication-insight reasoning style" in prompt_text
    assert "Section question: How has the mix of article types changed?" in prompt_text
    assert "publication_library contains the user's publication library as a whole-record evidence layer" in prompt_text
    assert '"publication_library"' in prompt_text
    assert "Paper 2026 A" in prompt_text
    assert "Avoid stock phrases such as 'anchors the full record'" in prompt_text


def test_generate_publication_insights_agent_draft_builds_publication_type_over_time_fallback(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)

    monkeypatch.setattr(
        publication_insights_agent_service,
        "get_publication_top_metrics",
        lambda **kwargs: _fake_publication_type_over_time_metrics(),
    )

    def _raise_error(**kwargs):  # noqa: ANN003
        raise RuntimeError("OpenAI unavailable")

    monkeypatch.setattr(
        publication_insights_agent_service,
        "create_response",
        _raise_error,
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-type-test-user",
        window_id="all",
        section_key="publication_type_over_time",
        scope="section",
    )

    assert payload["status"] == "draft"
    assert payload["provenance"]["generation_mode"] == "deterministic_fallback"
    evidence = payload["provenance"]["evidence"]
    assert evidence["full_record_mix_state"] == "strong_anchor"
    assert evidence["recent_window_change_state"] == "late_leader_shift"
    assert evidence["recent_window_confidence"] == "too_thin"
    assert evidence["latest_partial_year_label"] == "2026 (through 8 Mar 2026)"
    section = payload["sections"][0]
    assert section["key"] == "publication_type_over_time"
    assert section["headline"] == "Review article is gaining ground"
    assert "Across 2016-2026" in section["body"]
    assert "Journal article makes up 67% of the record" in section["body"]
    assert "The clearer change sits in 2024-2026" in section["body"]
    assert "2022-2026 still looks closer" in section["body"]
    assert section["consideration_label"] == "Confidence"
    assert "should confirm the 5-year and 3-year read" in str(section["consideration"] or "")


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
                '{"key":"publication_type_over_time","headline":"Review article is gaining ground",'
                '"body":"Across 2016-2026, Journal article makes up 67% of the record (10 of 15), with Review article next at 27%. The clearer change sits in 2024-2026: Review article now carries more of the mix there, while 2022-2026 still looks closer to the longer-run ordering led by Journal article.",'
                '"consideration_label":"Confidence",'
                '"consideration":"The newest rolling year only contains 2 publications and includes 2026 (through 8 Mar 2026), so it should confirm the 5-year and 3-year read, not override it."}'
                "]}",
            )
        ),
    )

    payload = publication_insights_agent_service.generate_publication_insights_agent_draft(
        user_id="publication-type-test-user",
        window_id="all",
        section_key="publication_type_over_time",
        scope="section",
    )

    assert payload["provenance"]["generation_mode"] == "openai"
    evidence = payload["provenance"]["evidence"]
    assert evidence["recent_window_change_state"] == "late_leader_shift"
    section = payload["sections"][0]
    assert section["key"] == "publication_type_over_time"
    assert section["headline"] == "Review article is gaining ground"
    assert "Across 2016-2026" in section["body"]
    assert "Journal article makes up 67% of the record" in section["body"]
    assert "Review article now carries more of the mix there" in section["body"]
    assert section["consideration_label"] == "Confidence"
    assert "should confirm the 5-year and 3-year read" in str(section["consideration"] or "")
    assert captured_kwargs["timeout"] == 20.0
    assert captured_kwargs["max_retries"] == 0
    prompt_text = str(captured_kwargs["input"])
    assert "Use one shared publication-insight reasoning style" in prompt_text
    assert "Section question: How has the mix of publication types changed?" in prompt_text
    assert "publication_library contains the user's publication library as a whole-record evidence layer" in prompt_text
    assert '"publication_library"' in prompt_text
    assert "Paper 2026 A" in prompt_text
    assert "Avoid stock phrases such as 'anchors the full record'" in prompt_text


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
    assert "Only include the follow-on note when it adds a distinct reading aid" in prompt


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

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from research_os.db import (
    JournalProfile,
    MetricsSnapshot,
    User,
    Work,
    create_all_tables,
    reset_database_state,
    session_scope,
)
from research_os.services.journal_intelligence_service import (
    _apply_editorial_payload,
    refresh_persona_journal_intelligence,
)
from research_os.services.persona_service import list_journals


def _set_test_environment(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENALEX_API_KEY", "test-openalex-key")
    db_path = tmp_path / "research_os_test_journal_intel.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    reset_database_state()


def test_refresh_persona_journal_intelligence_populates_profile_fields(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="journal-intel@example.com",
            password_hash="test-hash",
            name="Journal Intel",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="Journal intelligence paper",
            title_lower="journal intelligence paper",
            year=2025,
            doi="10.1000/journal-intel-paper",
            work_type="journal-article",
            publication_type="Original research",
            venue_name="Heart",
            journal="Heart",
            publisher="BMJ",
            abstract="",
            keywords=[],
            url="https://doi.org/10.1000/journal-intel-paper",
            provenance="manual",
            openalex_source_id="S4210189124",
            issn_l="1355-6037",
            venue_type="journal",
        )
        session.add(work)
        session.flush()

        session.add(
            MetricsSnapshot(
                work_id=str(work.id),
                provider="openalex",
                citations_count=6,
                metric_payload={
                    "journal_name": "Heart",
                    "openalex_source_id": "S4210189124",
                    "issn_l": "1355-6037",
                    "source": {
                        "id": "https://openalex.org/S4210189124",
                        "display_name": "Heart",
                        "type": "journal",
                    },
                },
            )
        )

    def _fake_openalex_request(
        *, url: str, params: dict[str, object]
    ) -> dict[str, object]:
        assert "S4210189124" in url or params.get("filter")
        return {
            "id": "https://openalex.org/S4210189124",
            "display_name": "Heart",
            "issn_l": "1355-6037",
            "issn": ["1355-6037", "1468-201X"],
            "host_organization_name": "BMJ",
            "type": "journal",
            "summary_stats": {
                "2yr_mean_citedness": 4.321,
                "h_index": 140,
                "i10_index": 980,
            },
            "counts_by_year": [
                {"year": 2025, "works_count": 1000, "cited_by_count": 9000}
            ],
            "is_oa": False,
            "is_in_doaj": False,
            "apc_usd": 0,
            "homepage_url": "https://heart.bmj.com/",
            "works_count": 12000,
            "cited_by_count": 345678,
        }

    class _FakeOpenAIResponse:
        output_text = (
            "{"
            '"publisher_reported_impact_factor": 6.7, '
            '"publisher_reported_impact_factor_year": 2024, '
            '"publisher_reported_impact_factor_label": "Impact Factor", '
            '"time_to_first_decision_days": 18, '
            '"time_to_publication_days": 42, '
            '"editor_in_chief_name": "Professor Jane Smith", '
            '"editorial_source_url": "https://heart.bmj.com/pages/about/", '
            '"editorial_source_title": "About Heart", '
            '"confidence": "high", '
            '"notes": "Publisher page reported all requested values."'
            "}"
        )

        def model_dump(self) -> dict[str, object]:
            return {
                "output": [
                    {
                        "type": "web_search_call",
                        "action": {
                            "sources": [
                                {
                                    "url": "https://heart.bmj.com/pages/about/",
                                    "title": "About Heart",
                                }
                            ]
                        },
                    }
                ]
            }

    monkeypatch.setattr(
        "research_os.services.journal_intelligence_service._openalex_request_with_retry",
        _fake_openalex_request,
    )
    monkeypatch.setattr(
        "research_os.services.journal_intelligence_service.create_response",
        lambda **kwargs: _FakeOpenAIResponse(),
    )

    result = refresh_persona_journal_intelligence(
        user_id=user_id,
        include_editorial_intel=True,
        force=True,
    )

    assert result["journals_considered"] == 1
    assert result["openalex_profiles_refreshed"] == 1
    assert result["editorial_profiles_refreshed"] == 1
    assert result["warnings"] == []

    with session_scope() as session:
        profile = session.scalars(
            select(JournalProfile).where(
                JournalProfile.provider == "openalex",
                JournalProfile.provider_journal_id == "S4210189124",
            )
        ).first()
        assert profile is not None
        assert profile.display_name == "Heart"
        assert profile.works_count == 12000
        assert profile.cited_by_count == 345678
        assert profile.publisher_reported_impact_factor == 6.7
        assert profile.publisher_reported_impact_factor_year == 2024
        assert profile.time_to_first_decision_days == 18
        assert profile.time_to_publication_days == 42
        assert profile.editor_in_chief_name == "Professor Jane Smith"
        assert profile.editorial_source_url == "https://heart.bmj.com/pages/about/"


def test_list_journals_returns_cached_editorial_fields(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="journal-list@example.com",
            password_hash="test-hash",
            name="Journal List",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="Journal list paper",
            title_lower="journal list paper",
            year=2025,
            doi="10.1000/journal-list-paper",
            work_type="journal-article",
            publication_type="Original research",
            venue_name="Heart",
            journal="Heart",
            publisher="BMJ",
            abstract="",
            keywords=[],
            url="https://doi.org/10.1000/journal-list-paper",
            provenance="manual",
            openalex_source_id="S4210189124",
            issn_l="1355-6037",
            venue_type="journal",
        )
        session.add(work)
        session.flush()

        session.add(
            MetricsSnapshot(
                work_id=str(work.id),
                provider="openalex",
                citations_count=11,
                metric_payload={
                    "journal_name": "Heart",
                    "journal_2yr_mean_citedness": 4.321,
                    "source": {
                        "id": "https://openalex.org/S4210189124",
                        "display_name": "Heart",
                        "type": "journal",
                    },
                },
            )
        )
        session.add(
            JournalProfile(
                provider="openalex",
                provider_journal_id="S4210189124",
                issn_l="1355-6037",
                issns_json=["1355-6037", "1468-201X"],
                display_name="Heart",
                publisher="BMJ",
                venue_type="journal",
                summary_stats_json={
                    "2yr_mean_citedness": 4.321,
                    "h_index": 140,
                    "i10_index": 980,
                },
                works_count=12000,
                cited_by_count=345678,
                publisher_reported_impact_factor=6.7,
                publisher_reported_impact_factor_year=2024,
                publisher_reported_impact_factor_label="Impact Factor",
                publisher_reported_impact_factor_source_url="https://heart.bmj.com/pages/about/",
                time_to_first_decision_days=18,
                time_to_publication_days=42,
                editor_in_chief_name="Professor Jane Smith",
                editorial_source_url="https://heart.bmj.com/pages/about/",
                editorial_source_title="About Heart",
                editorial_last_verified_at=datetime.now(timezone.utc),
            )
        )

    journals = list_journals(user_id=user_id)

    assert len(journals) == 1
    payload = journals[0]
    assert payload["display_name"] == "Heart"
    assert payload["h_index"] == 140
    assert payload["i10_index"] == 980
    assert payload["works_count"] == 12000
    assert payload["cited_by_count"] == 345678
    assert payload["publisher_reported_impact_factor"] == 6.7
    assert payload["publisher_reported_impact_factor_year"] == 2024
    assert payload["time_to_first_decision_days"] == 18
    assert payload["time_to_publication_days"] == 42
    assert payload["editor_in_chief_name"] == "Professor Jane Smith"


def test_apply_editorial_payload_preserves_newer_impact_factor_year(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        profile = JournalProfile(
            provider="openalex",
            provider_journal_id="S1",
            display_name="Heart",
            publisher="BMJ",
            publisher_reported_impact_factor=6.7,
            publisher_reported_impact_factor_year=2024,
            publisher_reported_impact_factor_label="Impact Factor",
            publisher_reported_impact_factor_source_url="https://heart.bmj.com/current",
            time_to_first_decision_days=18,
            time_to_publication_days=42,
            editor_in_chief_name="Professor Jane Smith",
        )
        session.add(profile)
        session.flush()

        _apply_editorial_payload(
            profile,
            editorial_payload={
                "publisher_reported_impact_factor": 5.9,
                "publisher_reported_impact_factor_year": 2022,
                "publisher_reported_impact_factor_label": "Journal Impact Factor",
                "time_to_first_decision_days": 16,
                "time_to_publication_days": 37,
                "editor_in_chief_name": "Professor Jane Doe",
                "editorial_source_url": "https://heart.bmj.com/older",
                "editorial_source_title": "Heart archive",
                "confidence": "medium",
            },
            sources=[],
        )
        session.flush()

        assert profile.publisher_reported_impact_factor == 6.7
        assert profile.publisher_reported_impact_factor_year == 2024
        assert profile.publisher_reported_impact_factor_label == "Impact Factor"
        assert (
            profile.publisher_reported_impact_factor_source_url
            == "https://heart.bmj.com/current"
        )
        assert profile.time_to_first_decision_days == 16
        assert profile.time_to_publication_days == 37
        assert profile.editor_in_chief_name == "Professor Jane Doe"


def test_apply_editorial_payload_overwrites_older_impact_factor_with_newer_year(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        profile = JournalProfile(
            provider="openalex",
            provider_journal_id="S1",
            display_name="Heart",
            publisher="BMJ",
            publisher_reported_impact_factor=5.9,
            publisher_reported_impact_factor_year=2022,
            publisher_reported_impact_factor_label="Impact Factor",
            publisher_reported_impact_factor_source_url="https://heart.bmj.com/older",
        )
        session.add(profile)
        session.flush()

        _apply_editorial_payload(
            profile,
            editorial_payload={
                "publisher_reported_impact_factor": 6.8,
                "publisher_reported_impact_factor_year": 2024,
                "publisher_reported_impact_factor_label": "Journal Impact Factor",
                "editorial_source_url": "https://heart.bmj.com/current",
                "editorial_source_title": "Heart current",
                "confidence": "high",
            },
            sources=[],
        )
        session.flush()

        assert profile.publisher_reported_impact_factor == 6.8
        assert profile.publisher_reported_impact_factor_year == 2024
        assert profile.publisher_reported_impact_factor_label == "Journal Impact Factor"
        assert (
            profile.publisher_reported_impact_factor_source_url
            == "https://heart.bmj.com/current"
        )

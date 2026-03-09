from __future__ import annotations

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
from research_os.services.persona_service import (
    list_journals,
    list_works,
    sync_metrics,
    upsert_work,
)


def _set_test_environment(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    db_path = tmp_path / "research_os_test_persona.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    reset_database_state()


def test_sync_metrics_normalizes_pmid_backed_figshare_publication(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="persona-figshare@example.com",
            password_hash="test-hash",
            name="Persona Figshare",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="Virtual interviewing for graduate medical education recruitment and selection: A BEME systematic review: BEME Guide No. 80",
            title_lower="virtual interviewing for graduate medical education recruitment and selection: a beme systematic review: beme guide no. 80",
            year=2022,
            doi="10.1080/0142159x.2022.2130038",
            work_type="data-set",
            publication_type="",
            venue_name="Figshare",
            journal="",
            publisher="Figshare (United Kingdom)",
            abstract="",
            keywords=[],
            url="https://doi.org/10.6084/m9.figshare.21546128",
            provenance="orcid",
        )
        session.add(work)
        session.flush()
        work_id = str(work.id)

    class _FakeProvider:
        provider_name = "openalex"

        def fetch_metrics(self, work_payload):
            assert work_payload["doi"] == "10.1080/0142159x.2022.2130038"
            return {
                "provider": "openalex",
                "citations_count": 27,
                "influential_citations": None,
                "altmetric_score": None,
                "payload_subset": {
                    "ids": {"pmid": "https://pubmed.ncbi.nlm.nih.gov/36369939/"},
                    "journal_name": "Figshare",
                },
            }

    monkeypatch.setattr(
        "research_os.services.persona_service.get_metrics_provider",
        lambda provider_name: _FakeProvider(),
    )
    monkeypatch.setattr(
        "research_os.services.persona_service._fetch_pubmed_publication_metadata_batch",
        lambda pmids: {
            "36369939": {
                "journal_name": "Medical Teacher",
                "publication_types": ["Review", "Journal Article"],
            }
        },
    )
    monkeypatch.setattr(
        "research_os.services.persona_service.recompute_collaborator_edges",
        lambda user_id: {"core_collaborators": [], "new_collaborators_by_year": {}},
    )

    result = sync_metrics(user_id=user_id, providers=["openalex"], work_ids=[work_id])
    assert result["synced_snapshots"] == 1

    works = list_works(user_id=user_id)
    assert len(works) == 1
    payload = works[0]
    assert payload["pmid"] == "36369939"
    assert payload["venue_name"] == "Medical Teacher"
    assert payload["work_type"] == "journal-article"
    assert payload["publication_type"] == "Systematic review"

    with session_scope() as session:
        stored = session.get(Work, work_id)
        assert stored is not None
        assert stored.venue_name == "Medical Teacher"
        assert stored.journal == "Medical Teacher"
        assert stored.work_type == "journal-article"
        assert stored.publication_type == "Systematic review"


def test_sync_metrics_repairs_heart_conference_abstract_from_bcs_doi(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="persona-heart-bcs@example.com",
            password_hash="test-hash",
            name="Persona Heart BCS",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="179 Deriving mean right atrial pressure from CMR: development of a model from the aspire registry",
            title_lower="179 deriving mean right atrial pressure from cmr: development of a model from the aspire registry",
            year=2024,
            doi="10.1136/heartjnl-2024-bcs.176",
            work_type="journal-article",
            publication_type="Original",
            venue_name="",
            journal="",
            publisher="",
            abstract="",
            keywords=[],
            url="https://doi.org/10.1136/heartjnl-2024-bcs.176",
            provenance="orcid",
        )
        session.add(work)
        session.flush()
        work_id = str(work.id)

    class _OpenAlexProvider:
        provider_name = "openalex"

        def fetch_metrics(self, work_payload):
            return {
                "provider": "openalex",
                "citations_count": 0,
                "influential_citations": None,
                "altmetric_score": None,
                "payload_subset": {
                    "journal_name": "Abstracts",
                    "open_access": {
                        "oa_url": "https://heart.bmj.com/content/heartjnl/110/Suppl_1/A10.full.pdf",
                    },
                },
            }

    monkeypatch.setattr(
        "research_os.services.persona_service.get_metrics_provider",
        lambda provider_name: _OpenAlexProvider(),
    )
    monkeypatch.setattr(
        "research_os.services.persona_service.recompute_collaborator_edges",
        lambda user_id: {"core_collaborators": [], "new_collaborators_by_year": {}},
    )

    result = sync_metrics(user_id=user_id, providers=["openalex"], work_ids=[work_id])
    assert result["synced_snapshots"] == 1

    works = list_works(user_id=user_id)
    assert len(works) == 1
    payload = works[0]
    assert payload["venue_name"] == "Heart"
    assert payload["work_type"] == "conference-abstract"
    assert payload["publication_type"] == "Original research"


def test_sync_metrics_repairs_flgastro_conference_abstract_from_abstracts_placeholder(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="persona-flgastro@example.com",
            password_hash="test-hash",
            name="Persona FLGastro",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="OC51 Research priorities for patients and professionals in Chronic pain in inflammatory bowel disease",
            title_lower="oc51 research priorities for patients and professionals in chronic pain in inflammatory bowel disease",
            year=2024,
            doi="10.1136/flgastro-2024-bspghan.50",
            work_type="journal-article",
            publication_type="Original",
            venue_name="Abstracts",
            journal="Abstracts",
            publisher="",
            abstract="",
            keywords=[],
            url="https://doi.org/10.1136/flgastro-2024-bspghan.50",
            provenance="orcid",
        )
        session.add(work)
        session.flush()
        work_id = str(work.id)

    class _OpenAlexProvider:
        provider_name = "openalex"

        def fetch_metrics(self, work_payload):
            return {
                "provider": "openalex",
                "citations_count": 0,
                "influential_citations": None,
                "altmetric_score": None,
                "payload_subset": {
                    "journal_name": "Abstracts",
                },
            }

    monkeypatch.setattr(
        "research_os.services.persona_service.get_metrics_provider",
        lambda provider_name: _OpenAlexProvider(),
    )
    monkeypatch.setattr(
        "research_os.services.persona_service.recompute_collaborator_edges",
        lambda user_id: {"core_collaborators": [], "new_collaborators_by_year": {}},
    )

    result = sync_metrics(user_id=user_id, providers=["openalex"], work_ids=[work_id])
    assert result["synced_snapshots"] == 1

    works = list_works(user_id=user_id)
    assert len(works) == 1
    payload = works[0]
    assert payload["venue_name"] == "Frontline Gastroenterology"
    assert payload["work_type"] == "conference-abstract"
    assert payload["publication_type"] == "Original research"

    with session_scope() as session:
        stored = session.get(Work, work_id)
        assert stored is not None
        assert stored.venue_name == "Frontline Gastroenterology"
        assert stored.journal == "Frontline Gastroenterology"
        assert stored.work_type == "conference-abstract"


def test_sync_metrics_overrides_abstract_placeholder_with_pmid_journal_metadata(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="persona-pmid-abstract-placeholder@example.com",
            password_hash="test-hash",
            name="Persona PMID Placeholder",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="PMID-backed placeholder venue should be repaired",
            title_lower="pmid-backed placeholder venue should be repaired",
            year=2024,
            doi="10.1000/pmid-placeholder-journal",
            work_type="journal-article",
            publication_type="Original",
            venue_name="Abstract",
            journal="Abstract",
            publisher="",
            abstract="",
            keywords=[],
            url="https://pubmed.ncbi.nlm.nih.gov/36369939/",
            provenance="orcid",
        )
        session.add(work)
        session.flush()
        work_id = str(work.id)

    class _FakeProvider:
        provider_name = "openalex"

        def fetch_metrics(self, work_payload):
            return {
                "provider": "openalex",
                "citations_count": 8,
                "influential_citations": None,
                "altmetric_score": None,
                "payload_subset": {
                    "ids": {"pmid": "https://pubmed.ncbi.nlm.nih.gov/36369939/"},
                    "journal_name": "Abstract",
                },
            }

    monkeypatch.setattr(
        "research_os.services.persona_service.get_metrics_provider",
        lambda provider_name: _FakeProvider(),
    )
    monkeypatch.setattr(
        "research_os.services.persona_service._fetch_pubmed_publication_metadata_batch",
        lambda pmids: {
            "36369939": {
                "journal_name": "Medical Teacher",
                "publication_types": ["Journal Article"],
            }
        },
    )
    monkeypatch.setattr(
        "research_os.services.persona_service.recompute_collaborator_edges",
        lambda user_id: {"core_collaborators": [], "new_collaborators_by_year": {}},
    )

    result = sync_metrics(user_id=user_id, providers=["openalex"], work_ids=[work_id])
    assert result["synced_snapshots"] == 1

    works = list_works(user_id=user_id)
    assert len(works) == 1
    payload = works[0]
    assert payload["venue_name"] == "Medical Teacher"

    with session_scope() as session:
        stored = session.get(Work, work_id)
        assert stored is not None
        assert stored.venue_name == "Medical Teacher"
        assert stored.journal == "Medical Teacher"


def test_upsert_work_persists_openalex_journal_identity(monkeypatch, tmp_path) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="persona-openalex-import@example.com",
            password_hash="test-hash",
            name="Persona OpenAlex",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

    result = upsert_work(
        user_id=user_id,
        provenance="openalex",
        work={
            "title": "OpenAlex import should persist journal identity",
            "year": 2024,
            "doi": "10.1000/openalex-journal-identity",
            "work_type": "journal-article",
            "venue_name": "Heart",
            "publisher": "BMJ",
            "url": "https://doi.org/10.1000/openalex-journal-identity",
            "openalex_source_id": "https://openalex.org/S4210189124",
            "issn_l": "1355-6037",
            "issns": ["1355-6037", "1468-201X"],
            "venue_type": "journal",
        },
    )
    work_id = str(result["id"])

    works = list_works(user_id=user_id)
    assert len(works) == 1
    payload = works[0]
    assert payload["openalex_source_id"] == "S4210189124"
    assert payload["issn_l"] == "1355-6037"
    assert payload["issns"] == ["1355-6037", "1468-201X"]
    assert payload["venue_type"] == "journal"

    with session_scope() as session:
        stored = session.get(Work, work_id)
        assert stored is not None
        assert stored.journal == "Heart"
        assert stored.openalex_source_id == "S4210189124"
        assert stored.issn_l == "1355-6037"
        assert list(stored.issns_json or []) == ["1355-6037", "1468-201X"]
        assert stored.venue_type == "journal"


def test_sync_metrics_backfills_openalex_journal_identity(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="persona-openalex-metrics@example.com",
            password_hash="test-hash",
            name="Persona Metrics",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="Metrics sync should backfill journal identity",
            title_lower="metrics sync should backfill journal identity",
            year=2023,
            doi="10.1000/metrics-backfill",
            work_type="journal-article",
            publication_type="Original research",
            venue_name="",
            journal="",
            publisher="",
            abstract="",
            keywords=[],
            url="https://doi.org/10.1000/metrics-backfill",
            provenance="orcid",
        )
        session.add(work)
        session.flush()
        work_id = str(work.id)

    class _OpenAlexProvider:
        provider_name = "openalex"

        def fetch_metrics(self, work_payload):
            assert work_payload["doi"] == "10.1000/metrics-backfill"
            return {
                "provider": "openalex",
                "citations_count": 9,
                "influential_citations": None,
                "altmetric_score": None,
                "payload_subset": {
                    "journal_name": "Heart",
                    "openalex_source_id": "S4210189124",
                    "issn_l": "1355-6037",
                    "issn": ["1355-6037", "1468-201X"],
                    "source_type": "journal",
                    "source": {
                        "id": "S4210189124",
                        "display_name": "Heart",
                        "issn_l": "1355-6037",
                        "issn": ["1355-6037", "1468-201X"],
                        "type": "journal",
                        "host_organization_name": "BMJ",
                        "summary_stats": {"2yr_mean_citedness": 4.2},
                        "is_oa": True,
                        "is_in_doaj": False,
                        "apc_usd": 4200,
                        "homepage_url": "https://heart.bmj.com/",
                    },
                },
            }

    monkeypatch.setattr(
        "research_os.services.persona_service.get_metrics_provider",
        lambda provider_name: _OpenAlexProvider(),
    )
    monkeypatch.setattr(
        "research_os.services.persona_service.recompute_collaborator_edges",
        lambda user_id: {"core_collaborators": [], "new_collaborators_by_year": {}},
    )

    result = sync_metrics(user_id=user_id, providers=["openalex"], work_ids=[work_id])
    assert result["synced_snapshots"] == 1

    works = list_works(user_id=user_id)
    assert len(works) == 1
    payload = works[0]
    assert payload["venue_name"] == "Heart"
    assert payload["openalex_source_id"] == "S4210189124"
    assert payload["issn_l"] == "1355-6037"
    assert payload["issns"] == ["1355-6037", "1468-201X"]
    assert payload["venue_type"] == "journal"

    with session_scope() as session:
        stored = session.get(Work, work_id)
        assert stored is not None
        assert stored.openalex_source_id == "S4210189124"
        assert stored.issn_l == "1355-6037"
        assert list(stored.issns_json or []) == ["1355-6037", "1468-201X"]
        assert stored.venue_type == "journal"

        journal_profile = session.scalars(
            select(JournalProfile).where(
                JournalProfile.provider == "openalex",
                JournalProfile.provider_journal_id == "S4210189124",
            )
        ).first()
        assert journal_profile is not None
        assert journal_profile.display_name == "Heart"
        assert journal_profile.publisher == "BMJ"
        assert journal_profile.is_oa is True
        assert journal_profile.is_in_doaj is False
        assert journal_profile.apc_usd == 4200
        assert journal_profile.homepage_url == "https://heart.bmj.com/"


def test_list_journals_merges_case_variants_and_excludes_repositories(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="persona-journal-rollup@example.com",
            password_hash="test-hash",
            name="Persona Journal Rollup",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        first = Work(
            user_id=user_id,
            title="Journal rollup paper one",
            title_lower="journal rollup paper one",
            year=2024,
            doi="10.1000/journal-rollup-1",
            work_type="journal-article",
            publication_type="Original research",
            venue_name="Medical Teacher",
            journal="Medical Teacher",
            publisher="Taylor & Francis",
            abstract="",
            keywords=[],
            url="https://doi.org/10.1000/journal-rollup-1",
            provenance="manual",
        )
        second = Work(
            user_id=user_id,
            title="Journal rollup paper two",
            title_lower="journal rollup paper two",
            year=2025,
            doi="10.1000/journal-rollup-2",
            work_type="journal-article",
            publication_type="Review",
            venue_name="Medical teacher",
            journal="Medical teacher",
            publisher="Taylor & Francis",
            abstract="",
            keywords=[],
            url="https://doi.org/10.1000/journal-rollup-2",
            provenance="manual",
        )
        repository = Work(
            user_id=user_id,
            title="Repository record",
            title_lower="repository record",
            year=2025,
            doi="10.1000/repository-rollup",
            work_type="dataset",
            publication_type="Dataset",
            venue_name="Harvard Dataverse",
            journal="Harvard Dataverse",
            publisher="Harvard Dataverse",
            abstract="",
            keywords=[],
            url="https://dataverse.harvard.edu/",
            provenance="manual",
            venue_type="repository",
        )
        session.add_all([first, second, repository])
        session.flush()

        session.add_all(
            [
                MetricsSnapshot(
                    work_id=str(first.id),
                    provider="openalex",
                    citations_count=6,
                    metric_payload={
                        "journal_name": "Medical Teacher",
                        "journal_2yr_mean_citedness": 3.4,
                        "source": {
                            "display_name": "Medical Teacher",
                            "type": "journal",
                        },
                    },
                ),
                MetricsSnapshot(
                    work_id=str(second.id),
                    provider="openalex",
                    citations_count=12,
                    metric_payload={
                        "journal_name": "Medical teacher",
                        "journal_2yr_mean_citedness": 3.4,
                        "source": {
                            "display_name": "Medical teacher",
                            "type": "journal",
                        },
                    },
                ),
                MetricsSnapshot(
                    work_id=str(repository.id),
                    provider="openalex",
                    citations_count=1,
                    metric_payload={
                        "journal_name": "Harvard Dataverse",
                        "source": {
                            "display_name": "Harvard Dataverse",
                            "type": "repository",
                        },
                    },
                ),
            ]
        )

    journals = list_journals(user_id=user_id)
    assert len(journals) == 1
    payload = journals[0]
    assert payload["display_name"] == "Medical Teacher"
    assert payload["publication_count"] == 2
    assert payload["share_pct"] == 66.7
    assert payload["avg_citations"] == 9.0
    assert payload["median_citations"] == 9.0
    assert payload["total_citations"] == 18
    assert payload["latest_publication_year"] == 2025
    assert payload["journal_metric_value"] == 3.4


def test_list_journals_prefers_metric_journal_name_over_stale_work_venue(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="persona-journal-rollup-stale-venue@example.com",
            password_hash="test-hash",
            name="Persona Journal Rollup Stale Venue",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        work = Work(
            user_id=user_id,
            title="Journal rollup should prefer cleaned metric venue",
            title_lower="journal rollup should prefer cleaned metric venue",
            year=2025,
            doi="10.1000/journal-rollup-stale-venue",
            work_type="journal-article",
            publication_type="Original research",
            venue_name="Abstracts",
            journal="Abstracts",
            publisher="Taylor & Francis",
            abstract="",
            keywords=[],
            url="https://doi.org/10.1000/journal-rollup-stale-venue",
            provenance="manual",
        )
        session.add(work)
        session.flush()

        session.add(
            MetricsSnapshot(
                work_id=str(work.id),
                provider="openalex",
                citations_count=6,
                metric_payload={
                    "journal_name": "Medical Teacher",
                    "journal_2yr_mean_citedness": 3.4,
                    "source": {
                        "display_name": "Medical Teacher",
                        "type": "journal",
                    },
                },
            )
        )

    journals = list_journals(user_id=user_id)
    assert len(journals) == 1
    payload = journals[0]
    assert payload["display_name"] == "Medical Teacher"
    assert payload["publication_count"] == 1


def test_sync_metrics_reuses_pending_journal_profile_for_shared_source(
    monkeypatch, tmp_path
) -> None:
    _set_test_environment(monkeypatch, tmp_path)
    create_all_tables()

    with session_scope() as session:
        user = User(
            email="persona-shared-journal@example.com",
            password_hash="test-hash",
            name="Persona Shared Journal",
        )
        session.add(user)
        session.flush()
        user_id = str(user.id)

        first = Work(
            user_id=user_id,
            title="Shared journal paper one",
            title_lower="shared journal paper one",
            year=2024,
            doi="10.1000/shared-journal-1",
            work_type="journal-article",
            publication_type="Original research",
            venue_name="Heart",
            journal="Heart",
            publisher="BMJ",
            abstract="",
            keywords=[],
            url="https://doi.org/10.1000/shared-journal-1",
            provenance="manual",
        )
        second = Work(
            user_id=user_id,
            title="Shared journal paper two",
            title_lower="shared journal paper two",
            year=2025,
            doi="10.1000/shared-journal-2",
            work_type="journal-article",
            publication_type="Original research",
            venue_name="Heart",
            journal="Heart",
            publisher="BMJ",
            abstract="",
            keywords=[],
            url="https://doi.org/10.1000/shared-journal-2",
            provenance="manual",
        )
        session.add_all([first, second])
        session.flush()
        work_ids = [str(first.id), str(second.id)]

    class _OpenAlexProvider:
        provider_name = "openalex"

        def fetch_metrics(self, work_payload):
            doi = str(work_payload.get("doi") or "").strip()
            suffix = doi.rsplit("-", 1)[-1]
            return {
                "provider": "openalex",
                "citations_count": 5 if suffix == "1" else 8,
                "influential_citations": None,
                "altmetric_score": None,
                "payload_subset": {
                    "journal_name": "Heart",
                    "openalex_source_id": "S4210189124",
                    "issn_l": "1355-6037",
                    "issn": ["1355-6037", "1468-201X"],
                    "source_type": "journal",
                    "source": {
                        "id": "S4210189124",
                        "display_name": "Heart",
                        "issn_l": "1355-6037",
                        "issn": ["1355-6037", "1468-201X"],
                        "type": "journal",
                        "host_organization_name": "BMJ",
                        "summary_stats": {"2yr_mean_citedness": 4.2},
                    },
                },
            }

    monkeypatch.setattr(
        "research_os.services.persona_service.get_metrics_provider",
        lambda provider_name: _OpenAlexProvider(),
    )
    monkeypatch.setattr(
        "research_os.services.persona_service.recompute_collaborator_edges",
        lambda user_id: {"core_collaborators": [], "new_collaborators_by_year": {}},
    )

    result = sync_metrics(user_id=user_id, providers=["openalex"], work_ids=work_ids)
    assert result["synced_snapshots"] == 2

    with session_scope() as session:
        profiles = session.scalars(
            select(JournalProfile).where(
                JournalProfile.provider == "openalex",
                JournalProfile.provider_journal_id == "S4210189124",
            )
        ).all()
        assert len(profiles) == 1

from __future__ import annotations

from types import SimpleNamespace

from research_os.db import User, Work, create_all_tables, reset_database_state, session_scope
from research_os.services.persona_service import list_works, sync_metrics


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
    assert payload["publication_type"] == "Original"


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
    assert payload["publication_type"] == "Original"

    with session_scope() as session:
        stored = session.get(Work, work_id)
        assert stored is not None
        assert stored.venue_name == "Frontline Gastroenterology"
        assert stored.journal == "Frontline Gastroenterology"
        assert stored.work_type == "conference-abstract"
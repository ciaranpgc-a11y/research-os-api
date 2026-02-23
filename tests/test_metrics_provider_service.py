from __future__ import annotations

from typing import Any

from research_os.services.metrics_provider_service import (
    OpenAlexMetricsProvider,
    SemanticScholarMetricsProvider,
)


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeClient:
    def __init__(self, route_responses: dict[str, _FakeResponse]):
        self._route_responses = route_responses

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url: str, params: dict[str, Any] | None = None) -> _FakeResponse:
        if "openalex.org" in url:
            filter_key = str((params or {}).get("filter", "")).strip()
            if filter_key:
                key = f"{url}|{filter_key}"
                return self._route_responses.get(key, _FakeResponse(404, {}))
            search_key = str((params or {}).get("search", "")).strip()
            if search_key:
                key = f"{url}|search:{search_key}"
                return self._route_responses.get(key, _FakeResponse(404, {}))
        return self._route_responses.get(url, _FakeResponse(404, {}))


def test_openalex_provider_matches_with_pmid(monkeypatch) -> None:
    pmid = "12345678"
    responses = {
        f"https://api.openalex.org/works|pmid:{pmid}": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/W123",
                        "cited_by_count": 88,
                        "cited_by_api_url": "https://api.openalex.org/works?filter=cites:W123",
                        "ids": {"pmid": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}"},
                        "primary_location": {
                            "source": {
                                "display_name": "Test Journal",
                                "summary_stats": {"2yr_mean_citedness": 3.1},
                            }
                        },
                    }
                ]
            },
        )
    }
    monkeypatch.setattr(
        "research_os.services.metrics_provider_service.httpx.Client",
        lambda timeout=12.0: _FakeClient(responses),
    )

    provider = OpenAlexMetricsProvider()
    payload = provider.fetch_metrics(
        {
            "title": "A pulmonary hypertension work",
            "doi": "",
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        }
    )

    assert payload["provider"] == "openalex"
    assert payload["citations_count"] == 88
    assert payload["payload_subset"]["match_method"] == "pmid"


def test_semantic_scholar_provider_matches_with_pmid(monkeypatch) -> None:
    pmid = "12345678"
    responses = {
        f"https://api.semanticscholar.org/graph/v1/paper/PMID:{pmid}": _FakeResponse(
            200,
            {
                "paperId": "paper-1",
                "citationCount": 144,
                "influentialCitationCount": 12,
                "url": "https://api.semanticscholar.org/paper/paper-1",
            },
        )
    }
    monkeypatch.setattr(
        "research_os.services.metrics_provider_service.httpx.Client",
        lambda timeout=12.0: _FakeClient(responses),
    )

    provider = SemanticScholarMetricsProvider()
    payload = provider.fetch_metrics(
        {
            "title": "Another pulmonary hypertension work",
            "doi": "",
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        }
    )

    assert payload["provider"] == "semantic_scholar"
    assert payload["citations_count"] == 144
    assert payload["influential_citations"] == 12
    assert payload["payload_subset"]["match_method"] == "pmid"


def test_openalex_provider_extracts_abstract_from_inverted_index(monkeypatch) -> None:
    doi = "10.1000/test"
    responses = {
        f"https://api.openalex.org/works|doi:https://doi.org/{doi}": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/W777",
                        "cited_by_count": 12,
                        "ids": {},
                        "abstract_inverted_index": {
                            "Pulmonary": [0],
                            "hypertension": [1],
                            "analysis": [2],
                        },
                        "primary_location": {
                            "source": {"display_name": "Test Journal"}
                        },
                    }
                ]
            },
        )
    }
    monkeypatch.setattr(
        "research_os.services.metrics_provider_service.httpx.Client",
        lambda timeout=12.0: _FakeClient(responses),
    )

    provider = OpenAlexMetricsProvider()
    payload = provider.fetch_metrics(
        {
            "title": "Pulmonary hypertension analysis",
            "doi": doi,
            "url": "",
        }
    )

    assert payload["provider"] == "openalex"
    assert payload["payload_subset"]["abstract"] == "Pulmonary hypertension analysis"


def test_semantic_scholar_provider_returns_abstract(monkeypatch) -> None:
    doi = "10.1000/test"
    responses = {
        "https://api.semanticscholar.org/graph/v1/paper/DOI:10.1000%2Ftest": _FakeResponse(
            200,
            {
                "paperId": "paper-42",
                "citationCount": 18,
                "influentialCitationCount": 2,
                "url": "https://api.semanticscholar.org/paper/paper-42",
                "abstract": "This study evaluates pulmonary vascular patterns.",
            },
        )
    }
    monkeypatch.setattr(
        "research_os.services.metrics_provider_service.httpx.Client",
        lambda timeout=12.0: _FakeClient(responses),
    )

    provider = SemanticScholarMetricsProvider()
    payload = provider.fetch_metrics(
        {
            "title": "Pulmonary vascular patterns",
            "doi": doi,
            "url": "",
        }
    )

    assert payload["provider"] == "semantic_scholar"
    assert (
        payload["payload_subset"]["abstract"]
        == "This study evaluates pulmonary vascular patterns."
    )

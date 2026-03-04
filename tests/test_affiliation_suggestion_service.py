from __future__ import annotations

import pytest

from research_os.services import affiliation_suggestion_service as service
from research_os.services.affiliation_suggestion_service import (
    AffiliationSuggestionValidationError,
    fetch_affiliation_suggestions,
)


def _clear_cache() -> None:
    service._AFFILIATION_SUGGESTION_CACHE.clear()


def test_fetch_affiliation_suggestions_merges_and_ranks_sources(monkeypatch) -> None:
    _clear_cache()

    def _fake_parallel(*, query: str, limit: int) -> list[dict]:
        assert query == "Norfolk and Norwich University"
        assert limit == 8
        return [
            {
                "name": "Norfolk and Norwich University Hospital",
                "label": "Norfolk and Norwich University Hospital",
                "country_code": None,
                "country_name": None,
                "city": None,
                "region": None,
                "address": None,
                "postal_code": None,
                "source": "clearbit",
            },
            {
                "name": "Norfolk and Norwich University Hospital",
                "label": "Norfolk and Norwich University Hospital (Norwich, United Kingdom)",
                "country_code": "GB",
                "country_name": "United Kingdom",
                "city": "Norwich",
                "region": "England",
                "address": None,
                "postal_code": None,
                "source": "ror",
            },
            {
                "name": "Norwich & Norfolk Hospital",
                "label": "Norwich & Norfolk Hospital (Norwich, United Kingdom)",
                "country_code": "GB",
                "country_name": "United Kingdom",
                "city": "Norwich",
                "region": "England",
                "address": "Colney Lane",
                "postal_code": "NR4 7UY",
                "source": "openstreetmap",
            },
        ]

    monkeypatch.setattr(
        "research_os.services.affiliation_suggestion_service._fetch_provider_suggestions_parallel",
        _fake_parallel,
    )

    items = fetch_affiliation_suggestions(
        query="Norfolk and Norwich University",
        limit=8,
    )

    assert len(items) == 2
    assert items[0]["name"] == "Norfolk and Norwich University Hospital"
    assert items[0]["source"] == "ror"
    assert items[0]["city"] == "Norwich"
    assert items[1]["source"] == "openstreetmap"


def test_fetch_affiliation_suggestions_uses_cache(monkeypatch) -> None:
    _clear_cache()
    calls: list[str] = []

    def _fake_parallel(*, query: str, limit: int) -> list[dict]:
        calls.append(f"{query}:{limit}")
        return [
            {
                "name": "University of East Anglia",
                "label": "University of East Anglia (Norwich, United Kingdom)",
                "country_code": "GB",
                "country_name": "United Kingdom",
                "city": "Norwich",
                "region": "England",
                "address": None,
                "postal_code": None,
                "source": "ror",
            }
        ]

    monkeypatch.setattr(
        "research_os.services.affiliation_suggestion_service._fetch_provider_suggestions_parallel",
        _fake_parallel,
    )

    first = fetch_affiliation_suggestions(query="University of East Anglia", limit=8)
    second = fetch_affiliation_suggestions(query="University of East Anglia", limit=8)

    assert calls == ["University of East Anglia:8"]
    assert first == second


def test_fetch_affiliation_suggestions_requires_min_query() -> None:
    _clear_cache()
    with pytest.raises(AffiliationSuggestionValidationError):
        fetch_affiliation_suggestions(query="a", limit=8)


def test_fetch_affiliation_suggestions_returns_empty_when_fallbacks_unavailable(
    monkeypatch,
) -> None:
    _clear_cache()

    monkeypatch.setattr(
        "research_os.services.affiliation_suggestion_service._fetch_provider_suggestions_parallel",
        lambda **_: [],
    )

    def _fail_openai(_: str) -> dict:
        raise AffiliationSuggestionValidationError("OpenAI affiliation lookup failed.")

    monkeypatch.setattr(
        "research_os.services.affiliation_suggestion_service._ask_openai_json",
        _fail_openai,
    )

    items = fetch_affiliation_suggestions(query="University of East Anglia", limit=8)
    assert items == []

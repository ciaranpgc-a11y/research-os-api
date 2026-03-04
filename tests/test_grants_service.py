from __future__ import annotations

from typing import Any

import pytest

from research_os.services.grants_service import (
    GrantsValidationError,
    list_openalex_grants_for_person,
)


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeClient:
    def __init__(self, responses: dict[str, _FakeResponse]):
        self._responses = responses

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url: str, params: dict[str, Any] | None = None) -> _FakeResponse:
        params = params or {}
        if url.endswith("/authors"):
            key = f"{url}|search:{params.get('search')}"
            return self._responses.get(key, _FakeResponse(200, {"results": []}))
        if url.endswith("/works"):
            key = f"{url}|filter:{params.get('filter')}|cursor:{params.get('cursor')}"
            return self._responses.get(
                key,
                _FakeResponse(200, {"results": [], "meta": {"next_cursor": None}}),
            )
        if "/awards/" in url:
            return self._responses.get(url, _FakeResponse(404, {}))
        if url.endswith("/awards"):
            key = f"{url}|filter:{params.get('filter')}"
            return self._responses.get(key, _FakeResponse(200, {"results": []}))
        return _FakeResponse(404, {})


def test_list_openalex_grants_for_person_aggregates_and_enriches(monkeypatch) -> None:
    author_url = "https://api.openalex.org/authors"
    works_url = "https://api.openalex.org/works"
    awards_url = "https://api.openalex.org/awards"

    responses = {
        f"{author_url}|search:Ada Lovelace": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/A123",
                        "display_name": "Ada Lovelace",
                        "orcid": "https://orcid.org/0000-0001-2345-6789",
                        "works_count": 12,
                        "cited_by_count": 345,
                    }
                ]
            },
        ),
        f"{works_url}|filter:authorships.author.id:A123,awards.id:!null|cursor:*": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/W1",
                        "display_name": "Work one",
                        "publication_year": 2024,
                        "authorships": [
                            {
                                "author_position": "first",
                                "author": {"id": "https://openalex.org/A123"},
                            }
                        ],
                        "awards": [
                            {
                                "id": "https://openalex.org/G1",
                                "display_name": None,
                                "funder_award_id": "R01-123",
                                "funder_id": "https://openalex.org/F1",
                                "funder_display_name": "National Test Fund",
                            }
                        ],
                    },
                    {
                        "id": "https://openalex.org/W2",
                        "display_name": "Work two",
                        "publication_year": 2023,
                        "authorships": [
                            {
                                "author_position": "last",
                                "author": {"id": "https://openalex.org/A123"},
                            }
                        ],
                        "awards": [
                            {
                                "id": "https://openalex.org/G2",
                                "display_name": None,
                                "funder_award_id": "R01-123",
                                "funder_id": "https://openalex.org/F1",
                                "funder_display_name": "National Test Fund",
                            }
                        ],
                    },
                ],
                "meta": {"next_cursor": None},
            },
        ),
        f"{awards_url}|filter:funder.id:https://openalex.org/F1,funder_award_id:R01-123": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/G999",
                        "display_name": "Precision medicine trial",
                        "description": "Grant description",
                        "funder_award_id": "R01-123",
                        "funder": {
                            "id": "https://openalex.org/F1",
                            "display_name": "National Test Fund",
                            "doi": "10.13039/100000000",
                            "ror": "https://ror.org/01abcde00",
                        },
                        "amount": 1200000,
                        "currency": "USD",
                        "funding_type": "grant",
                        "funder_scheme": "R01",
                        "start_year": 2021,
                        "end_year": 2025,
                        "updated_date": "2026-01-01",
                        "lead_investigator": {
                            "given_name": "Ada",
                            "family_name": "Lovelace",
                            "orcid": "https://orcid.org/0000-0001-2345-6789",
                        },
                        "investigators": [
                            {
                                "given_name": "Grace",
                                "family_name": "Hopper",
                                "orcid": None,
                            }
                        ],
                    }
                ]
            },
        ),
    }

    monkeypatch.setattr(
        "research_os.services.grants_service.httpx.Client",
        lambda timeout: _FakeClient(responses),
    )

    payload = list_openalex_grants_for_person(
        first_name="Ada",
        last_name="Lovelace",
        user_email="ada@example.com",
        limit=20,
    )

    assert payload["author"]["openalex_author_id"] == "https://openalex.org/A123"
    assert payload["total"] == 1
    assert payload["items"][0]["display_name"] == "Precision medicine trial"
    assert payload["items"][0]["funder_award_id"] == "R01-123"
    assert payload["items"][0]["supporting_works_count"] == 2
    assert len(payload["items"][0]["supporting_works"]) == 2
    assert payload["items"][0]["relationship_to_person"] == "won_by_person"
    assert payload["items"][0]["grant_owner_name"] == "Ada Lovelace"
    assert payload["items"][0]["grant_owner_is_target_person"] is True


def test_list_openalex_grants_for_person_filters_published_under_with_owner(
    monkeypatch,
) -> None:
    author_url = "https://api.openalex.org/authors"
    works_url = "https://api.openalex.org/works"
    awards_url = "https://api.openalex.org/awards"

    responses = {
        f"{author_url}|search:Alan Turing": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/A321",
                        "display_name": "Alan Turing",
                        "orcid": None,
                        "works_count": 10,
                        "cited_by_count": 40,
                    }
                ]
            },
        ),
        f"{works_url}|filter:authorships.author.id:A321,awards.id:!null|cursor:*": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/W100",
                        "display_name": "Cryptanalysis work",
                        "publication_year": 1941,
                        "authorships": [
                            {
                                "author_position": "first",
                                "author": {"id": "https://openalex.org/A321"},
                            }
                        ],
                        "awards": [
                            {
                                "id": "https://openalex.org/G9",
                                "display_name": None,
                                "funder_award_id": "AWD-9",
                                "funder_id": "https://openalex.org/F9",
                                "funder_display_name": "Example Fund",
                            }
                        ],
                    }
                ],
                "meta": {"next_cursor": None},
            },
        ),
        f"{awards_url}|filter:funder.id:https://openalex.org/F9,funder_award_id:AWD-9": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/G9",
                        "display_name": "Signal analysis grant",
                        "funder_award_id": "AWD-9",
                        "funder": {
                            "id": "https://openalex.org/F9",
                            "display_name": "Example Fund",
                            "doi": None,
                            "ror": None,
                        },
                        "lead_investigator": {
                            "given_name": "John",
                            "family_name": "von Neumann",
                            "orcid": "https://orcid.org/0000-0002-9999-8888",
                        },
                    }
                ]
            },
        ),
    }

    monkeypatch.setattr(
        "research_os.services.grants_service.httpx.Client",
        lambda timeout: _FakeClient(responses),
    )

    payload = list_openalex_grants_for_person(
        first_name="Alan",
        last_name="Turing",
        relationship="published_under",
        limit=20,
    )
    assert payload["relationship_filter"] == "published_under"
    assert payload["total"] == 1
    assert payload["items"][0]["relationship_to_person"] == "published_under_other_grant"
    assert payload["items"][0]["grant_owner_name"] == "John von Neumann"
    assert payload["items"][0]["grant_owner_is_target_person"] is False


def test_list_openalex_grants_for_person_uses_award_id_fallback_for_details(
    monkeypatch,
) -> None:
    author_url = "https://api.openalex.org/authors"
    works_url = "https://api.openalex.org/works"
    awards_url = "https://api.openalex.org/awards"

    responses = {
        f"{author_url}|search:Marie Curie": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/A777",
                        "display_name": "Marie Curie",
                        "works_count": 4,
                    }
                ]
            },
        ),
        f"{works_url}|filter:authorships.author.id:A777,awards.id:!null|cursor:*": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/W777",
                        "display_name": "Radiation paper",
                        "publication_year": 1903,
                        "authorships": [
                            {
                                "author_position": "first",
                                "author": {"id": "https://openalex.org/A777"},
                            }
                        ],
                        "awards": [
                            {
                                "id": "https://openalex.org/G777",
                                "funder_award_id": "A-777",
                                "funder_id": "https://openalex.org/F777",
                                "funder_display_name": "Legacy Funder",
                            }
                        ],
                    }
                ],
                "meta": {"next_cursor": None},
            },
        ),
        # No hit on funder+award lookup
        f"{awards_url}|filter:funder.id:https://openalex.org/F777,funder_award_id:A-777": _FakeResponse(
            200,
            {"results": []},
        ),
        # Fallback direct award lookup returns amount
        f"{awards_url}/G777": _FakeResponse(
            200,
            {
                "id": "https://openalex.org/G777",
                "display_name": "Curie fellowship",
                "funder_award_id": "A-777",
                "funder": {
                    "id": "https://openalex.org/F777",
                    "display_name": "Legacy Funder",
                },
                "amount": 250000,
                "currency": "EUR",
            },
        ),
    }

    monkeypatch.setattr(
        "research_os.services.grants_service.httpx.Client",
        lambda timeout: _FakeClient(responses),
    )

    payload = list_openalex_grants_for_person(
        first_name="Marie",
        last_name="Curie",
        limit=10,
    )
    assert payload["total"] == 1
    assert payload["items"][0]["display_name"] == "Curie fellowship"
    assert payload["items"][0]["amount"] == 250000.0


def test_list_openalex_grants_for_person_returns_empty_when_author_not_found(
    monkeypatch,
) -> None:
    responses = {
        "https://api.openalex.org/authors|search:Unknown Person": _FakeResponse(
            200, {"results": []}
        )
    }

    monkeypatch.setattr(
        "research_os.services.grants_service.httpx.Client",
        lambda timeout: _FakeClient(responses),
    )

    payload = list_openalex_grants_for_person(
        first_name="Unknown",
        last_name="Person",
        user_email="unknown@example.com",
    )
    assert payload["total"] == 0
    assert payload["items"] == []


def test_list_openalex_grants_for_person_requires_name_parts() -> None:
    with pytest.raises(GrantsValidationError):
        list_openalex_grants_for_person(
            first_name="",
            last_name="Lovelace",
        )


def test_list_openalex_grants_for_person_rejects_invalid_relationship_filter() -> None:
    with pytest.raises(GrantsValidationError):
        list_openalex_grants_for_person(
            first_name="Ada",
            last_name="Lovelace",
            relationship="bad-filter",
        )

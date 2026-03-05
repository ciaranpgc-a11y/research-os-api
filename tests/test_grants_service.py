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

    def get(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, Any] | None = None,
    ) -> _FakeResponse:
        _ = headers
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
        if "gtr.ukri.org/api/search/project" in url:
            key = f"{url}|term:{params.get('term')}"
            return self._responses.get(key, _FakeResponse(200, {"facetedSearchResultBean": {"results": []}}))
        if "api.nsf.gov/services/v1/awards.json" in url:
            key = f"{url}|keyword:{params.get('keyword')}"
            return self._responses.get(key, _FakeResponse(200, {"response": {"award": []}}))
        if "cordis.europa.eu/search/en" in url:
            key = f"{url}|q:{params.get('q')}"
            return self._responses.get(key, _FakeResponse(200, {"result": {"hits": {"hit": []}}}))
        return _FakeResponse(404, {})

    def post(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        headers: dict[str, Any] | None = None,
    ) -> _FakeResponse:
        _ = params
        _ = headers
        criteria = json.get("criteria") if isinstance(json, dict) and isinstance(json.get("criteria"), dict) else {}
        pi_names = criteria.get("pi_names") if isinstance(criteria.get("pi_names"), list) else []
        first_pi = pi_names[0] if pi_names and isinstance(pi_names[0], dict) else {}
        any_name = first_pi.get("any_name") if isinstance(first_pi, dict) else ""
        key = f"{url}|pi:{any_name}"
        return self._responses.get(key, _FakeResponse(200, {"results": []}))


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


def test_list_openalex_grants_for_person_does_not_match_first_initial_only(
    monkeypatch,
) -> None:
    author_url = "https://api.openalex.org/authors"
    works_url = "https://api.openalex.org/works"
    awards_url = "https://api.openalex.org/awards"

    responses = {
        f"{author_url}|search:Ciaran Grafton-Clarke": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/A555",
                        "display_name": "Ciaran Grafton-Clarke",
                        "orcid": None,
                        "works_count": 5,
                        "cited_by_count": 10,
                    }
                ]
            },
        ),
        f"{works_url}|filter:authorships.author.id:A555,awards.id:!null|cursor:*": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/W555",
                        "display_name": "Example work",
                        "publication_year": 2024,
                        "authorships": [
                            {
                                "author_position": "first",
                                "author": {"id": "https://openalex.org/A555"},
                            }
                        ],
                        "awards": [
                            {
                                "id": "https://openalex.org/G555",
                                "funder_award_id": "CLARKE-1",
                                "funder_id": "https://openalex.org/F555",
                                "funder_display_name": "Example Funder",
                            }
                        ],
                    }
                ],
                "meta": {"next_cursor": None},
            },
        ),
        f"{awards_url}|filter:funder.id:https://openalex.org/F555,funder_award_id:CLARKE-1": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "id": "https://openalex.org/G555",
                        "display_name": "Example grant",
                        "funder_award_id": "CLARKE-1",
                        "funder": {
                            "id": "https://openalex.org/F555",
                            "display_name": "Example Funder",
                        },
                        "lead_investigator": {
                            "given_name": "Catherine",
                            "family_name": "Clarke",
                            "orcid": None,
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
        first_name="Ciaran",
        last_name="Grafton-Clarke",
        relationship="all",
    )

    assert payload["total"] == 1
    assert payload["items"][0]["relationship_to_person"] == "published_under_other_grant"
    assert payload["items"][0]["grant_owner_name"] == "Catherine Clarke"
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


def test_list_openalex_grants_for_person_includes_external_sources(
    monkeypatch,
) -> None:
    monkeypatch.setenv("ENABLE_UKRI_GRANTS_LOOKUP", "true")
    monkeypatch.setenv("ENABLE_NIH_GRANTS_LOOKUP", "true")
    monkeypatch.setenv("ENABLE_NSF_GRANTS_LOOKUP", "true")
    monkeypatch.setenv("ENABLE_CORDIS_GRANTS_LOOKUP", "true")

    author_url = "https://api.openalex.org/authors"
    ukri_url = "https://gtr.ukri.org/api/search/project"
    nih_url = "https://api.reporter.nih.gov/v2/projects/search"
    nsf_url = "https://api.nsf.gov/services/v1/awards.json"
    cordis_url = "https://cordis.europa.eu/search/en"

    responses = {
        f"{author_url}|search:Ada Lovelace": _FakeResponse(200, {"results": []}),
        f"{ukri_url}|term:Ada Lovelace": _FakeResponse(
            200,
            {
                "facetedSearchResultBean": {
                    "results": [
                        {
                            "projectComposition": {
                                "project": {
                                    "id": "UKRI-P1",
                                    "title": "UKRI project",
                                    "grantReference": "EP/ABC123",
                                    "abstractText": "A UKRI-funded study.",
                                    "resourceUrl": "http://gtr.ukri.org/api/projects?ref=EP%2FABC123",
                                    "fund": {
                                        "valuePounds": 250000,
                                        "start": 1672531200000,
                                        "end": 1735603200000,
                                        "funder": {"id": "EPSRC", "name": "EPSRC"},
                                    },
                                },
                                "personRoles": [
                                    {
                                        "fullName": "Ada Lovelace",
                                        "orcidId": "https://orcid.org/0000-0001-2345-6789",
                                        "principalInvestigator": True,
                                    }
                                ],
                            }
                        }
                    ]
                }
            },
        ),
        f"{nih_url}|pi:Ada Lovelace": _FakeResponse(
            200,
            {
                "results": [
                    {
                        "appl_id": 112233,
                        "project_title": "NIH project",
                        "project_num": "1R01HL000001-01",
                        "core_project_num": "R01HL000001",
                        "award_amount": 500000,
                        "project_start_date": "2024-01-01T00:00:00",
                        "project_end_date": "2028-12-31T00:00:00",
                        "principal_investigators": [
                            {"full_name": "Ada Lovelace", "is_contact_pi": True}
                        ],
                        "agency_ic_admin": {"code": "HL", "name": "NHLBI"},
                        "project_detail_url": "https://reporter.nih.gov/project-details/112233",
                    }
                ]
            },
        ),
        f"{nsf_url}|keyword:Ada Lovelace": _FakeResponse(
            200,
            {
                "response": {
                    "award": [
                        {
                            "id": "2554298",
                            "title": "NSF project",
                            "abstractText": "An NSF-funded project.",
                            "agency": "NSF",
                            "awardAgencyCode": "4900",
                            "estimatedTotalAmt": "25000",
                            "pi": ["Ada Lovelace ada@example.com"],
                            "startDate": "06/01/2024",
                            "expDate": "05/31/2026",
                        }
                    ]
                }
            },
        ),
        f"{cordis_url}|q:contenttype='project' AND \"Ada Lovelace\"": _FakeResponse(
            200,
            {
                "result": {
                    "hits": {
                        "hit": [
                            {
                                "project": {
                                    "id": "101052200",
                                    "title": "CORDIS project",
                                    "objective": "This project builds on Ada Lovelace research.",
                                    "startDate": "2021-01-01",
                                    "endDate": "2025-12-31",
                                    "ecMaxContribution": "549442000",
                                    "status": "SIGNED",
                                }
                            }
                        ]
                    }
                }
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
        relationship="all",
        limit=20,
    )

    assert payload["author"]["openalex_author_id"] is None
    assert payload["total"] == 4
    sources = {item.get("source") for item in payload["items"]}
    assert {"ukri", "nih_reporter", "nsf", "cordis"} <= sources
    won_rows = [item for item in payload["items"] if item.get("relationship_to_person") == "won_by_person"]
    assert len(won_rows) >= 3


def test_list_openalex_grants_for_person_external_sources_do_not_include_supporting_works(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "research_os.services.grants_service._resolve_openalex_author",
        lambda **_: None,
    )
    monkeypatch.setattr(
        "research_os.services.grants_service._fetch_external_provider_grants_for_person",
        lambda **_: [
            {
                "openalex_award_id": "EXT-001",
                "display_name": "External-only grant",
                "description": "External provider grant payload",
                "funder_award_id": "EXT-001",
                "funder": {
                    "id": "nsf",
                    "display_name": "NSF",
                    "doi": None,
                    "ror": None,
                },
                "amount": 12345.0,
                "currency": "USD",
                "funding_type": None,
                "funder_scheme": None,
                "start_date": "2024-01-01",
                "end_date": "2026-12-31",
                "start_year": 2024,
                "end_year": 2026,
                "landing_page_url": "https://example.org/grant/EXT-001",
                "doi": None,
                "updated_date": "2025-01-01",
                "supporting_works_count": 2,
                "supporting_works": [
                    {
                        "id": "https://openalex.org/WEXT1",
                        "title": "Should be suppressed",
                        "publication_year": 2025,
                        "user_author_position": "middle",
                    }
                ],
                "relationship_to_person": "won_by_person",
                "grant_owner_name": "Ada Lovelace",
                "grant_owner_role": "lead_investigator",
                "grant_owner_orcid": None,
                "grant_owner_is_target_person": True,
                "award_holders": [],
                "person_role": "PI",
                "source": "nsf",
                "source_timestamp": "2026-03-05T00:00:00+00:00",
            }
        ],
    )

    payload = list_openalex_grants_for_person(
        first_name="Ada",
        last_name="Lovelace",
        relationship="all",
        limit=20,
    )

    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["source"] == "nsf"
    assert item["supporting_works_count"] == 0
    assert item["supporting_works"] == []


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

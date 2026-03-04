#!/usr/bin/env python3
"""Test with the exact long select string."""

from research_os.services.publication_insights_bootstrap_service import (
    _openalex_request_with_retry,
    _openalex_mailto,
)


def main() -> int:
    mailto = _openalex_mailto(fallback_email="ciarang-c@hotmail.com")
    author_id = "A5029772193"
    
    # Exact parameters used in _fetch_openalex_works_for_author
    params = {
        "filter": f"author.id:{author_id}",
        "select": (
            "id,display_name,publication_year,type,doi,ids,primary_location,host_venue,"
            "authorships,abstract_inverted_index"
        ),
        "per-page": 200,
        "sort": "publication_date:desc",
        "cursor": "*",
        "mailto": mailto,
    }
    
    print("Testing with exact parameters from _fetch_openalex_works_for_author:")
    print(f"Select: {params['select']}\n")
    
    response = _openalex_request_with_retry(
        url="https://api.openalex.org/works",
        params=params,
    )
    
    results = response.get("results", [])
    meta = response.get("meta", {})
    
    print(f"Meta: {meta}")
    print(f"Results count: {len(results)}\n")
    
    if results:
        first = results[0]
        print(f"First result:")
        print(f"  Keys: {list(first.keys())}")
        print(f"  Title: {first.get('display_name', 'N/A')[:70]}")
        print(f"  Has authorships: {'authorships' in first}")
        print(f"  Has abstract_inverted_index: {'abstract_inverted_index' in first}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

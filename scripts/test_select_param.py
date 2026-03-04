#!/usr/bin/env python3
"""Test with and without select parameter."""

from research_os.services.publication_insights_bootstrap_service import (
    _openalex_request_with_retry,
    _openalex_mailto,
)


def main() -> int:
    mailto = _openalex_mailto(fallback_email="ciarang-c@hotmail.com")
    author_id = "A5029772193"
    
    # Test 1: With select (what the function uses)
    print("Test 1: WITH select parameter")
    params_with_select = {
        "filter": f"author.id:{author_id}",
        "select": "id,display_name,publication_year,type,doi,ids",
        "per-page": 10,
        "cursor": "*",
        "mailto": mailto,
    }
    response1 = _openalex_request_with_retry(
        url="https://api.openalex.org/works",
        params=params_with_select,
    )
    results1 = response1.get("results", [])
    print(f"  Got {len(results1)} results\n")
    
    # Test 2: Without select
    print("Test 2: WITHOUT select parameter")
    params_no_select = {
        "filter": f"author.id:{author_id}",
        "per-page": 10,
        "cursor": "*",
        "mailto": mailto,
    }
    response2 = _openalex_request_with_retry(
        url="https://api.openalex.org/works",
        params=params_no_select,
    )
    results2 = response2.get("results", [])
    print(f"  Got {len(results2)} results")
    
    if results2:
        print(f"\nFirst result keys: {list(results2[0].keys())}\n")
        print(f"First result title: {results2[0].get('title', 'No title')}\n")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

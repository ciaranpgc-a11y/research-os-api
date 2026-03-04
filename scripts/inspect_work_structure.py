#!/usr/bin/env python3
"""Inspect the actual work response structure."""

from research_os.services.publication_insights_bootstrap_service import (
    _openalex_request_with_retry,
    _openalex_mailto,
)


def main() -> int:
    mailto = _openalex_mailto(fallback_email="ciarang-c@hotmail.com")
    author_id = "A5029772193"
    
    params = {
        "filter": f"author.id:{author_id}",
        "per-page": 5,
        "select": "id,display_name,title,publication_year,type",
        "cursor": "*",
        "mailto": mailto,
    }
    
    response = _openalex_request_with_retry(
        url="https://api.openalex.org/works",
        params=params,
    )
    
    results = response.get("results", [])
    print(f"Found {len(results)} results\n")
    
    if results:
        first = results[0]
        print("First work structure:")
        print(f"  Keys: {list(first.keys())}")
        print(f"  ID: {first.get('id')}")
        print(f"  display_name: {first.get('display_name')}")
        print(f"  title: {first.get('title')}")
        print(f"  publication_year: {first.get('publication_year')}")
        print(f"  type: {first.get('type')}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

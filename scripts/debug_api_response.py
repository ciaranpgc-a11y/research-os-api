#!/usr/bin/env python3
"""Debug OpenAlex API response."""

import os
import httpx
from research_os.services.publication_insights_bootstrap_service import (
    _openalex_mailto,
    _openalex_request_with_retry,
)


def main() -> int:
    mailto = _openalex_mailto(fallback_email="test@example.com")
    
    # Test a direct API call
    author_id = "A5109805546"  # Albert Einstein
    
    params = {
        "filter": f"author.id:{author_id}",
        "select": "id,display_name,publication_year,type",
        "per-page": 50,
        "sort": "publication_date:desc",
        "cursor": "*",
    }
    if mailto:
        params["mailto"] = mailto
    
    print(f"Calling OpenAlex API with params: {params}\n")
    
    payload = _openalex_request_with_retry(
        url="https://api.openalex.org/works",
        params=params,
    )
    
    print(f"API Response: {payload}\n")
    
    meta = payload.get("meta", {})
    results = payload.get("results", [])
    
    print(f"Meta: {meta}")
    print(f"Results found: {len(results)}")
    
    if results:
        print("\nFirst 3 results:")
        for r in results[:3]:
            print(f"  - {r.get('display_name', r.get('title', 'Unknown'))}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

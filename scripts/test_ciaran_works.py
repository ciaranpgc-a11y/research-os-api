#!/usr/bin/env python3
"""Test direct works fetching for Ciaran Grafton-Clarke."""

from research_os.services.publication_insights_bootstrap_service import (
    _fetch_openalex_works_for_author,
    _openalex_mailto,
)


def main() -> int:
    mailto = _openalex_mailto(fallback_email="ciarang-c@hotmail.com")
    
    # Direct author ID for Ciaran Grafton-Clarke
    author_id = "A5029772193"
    
    print(f"Fetching works for author ID: {author_id}")
    print(f"Using mailto: {mailto}\n")
    
    works = _fetch_openalex_works_for_author(
        openalex_author_id=author_id,
        mailto=mailto,
        max_works=200,
    )
    
    print(f"✓ Found {len(works)} works\n")
    
    if works:
        print("First 10 works:")
        for i, work in enumerate(works[:10], 1):
            title = work.get("display_name", "No title")[:70]
            year = work.get("publication_year", "?")
            print(f"  {i}. {title}... ({year})")
    else:
        print("No works found")
        print(f"\nDEBUG: Let's check the API response directly...")
        
        import httpx
        from research_os.services.publication_insights_bootstrap_service import (
            _openalex_request_with_retry,
        )
        
        params = {
            "filter": f"author.id:{author_id}",
            "per-page": 50,
            "cursor": "*",
            "mailto": mailto,
        }
        
        response = _openalex_request_with_retry(
            url="https://api.openalex.org/works",
            params=params,
        )
        
        print(f"API Response keys: {response.keys()}")
        meta = response.get("meta", {})
        results = response.get("results", [])
        print(f"Meta: {meta}")
        print(f"Results count: {len(results)}")
        
        if results:
            print(f"\nFirst result: {results[0].get('display_name', 'No title')}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Test author resolution for Ciaran Grafton-Clarke."""

from research_os.services.publication_insights_bootstrap_service import (
    _resolve_openalex_author_by_name,
    _fetch_openalex_works_for_author,
    _openalex_mailto,
)


def main() -> int:
    mailto = _openalex_mailto(fallback_email="ciarang-c@hotmail.com")
    
    name = "Ciaran Grafton-Clarke"
    print(f"Resolving author: {name}")
    print(f"Using mailto: {mailto}\n")
    
    author = _resolve_openalex_author_by_name(
        full_name=name,
        mailto=mailto,
    )
    
    if author:
        print(f"✓ Author found:")
        print(f"  ID: {author.get('openalex_author_id')}")
        print(f"  Name: {author.get('openalex_author_name')}\n")
        
        # Try to fetch works
        author_id = author.get("openalex_author_id")
        print(f"Fetching works for {author_id}...")
        works = _fetch_openalex_works_for_author(
            openalex_author_id=author_id,
            mailto=mailto,
            max_works=100,
        )
        
        print(f"✓ Found {len(works)} works\n")
        
        if works:
            print("First 5 works:")
            for i, work in enumerate(works[:5], 1):
                title = work.get("display_name", "No title")[:70]
                year = work.get("publication_year", "?")
                print(f"  {i}. {title}... ({year})")
        
        return 0
    else:
        print(f"✗ Could not resolve author: {name}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Test with a well-known author."""

from research_os.services.publication_insights_bootstrap_service import (
    _resolve_openalex_author_by_name,
    _fetch_openalex_works_for_author,
    _openalex_mailto,
)


def main() -> int:
    mailto = _openalex_mailto(fallback_email="test@example.com")
    
    # Try with a famous researcher
    test_names = ["Albert Einstein", "Marie Curie", "Isaac Newton"]
    
    for name in test_names:
        print(f"\nTesting with: {name}")
        
        # Resolve author
        author = _resolve_openalex_author_by_name(
            full_name=name,
            mailto=mailto,
        )
        
        if not author:
            print(f"  ✗ Could not resolve author")
            continue
        
        author_id = author.get("openalex_author_id")
        print(f"  ✓ Author ID: {author_id}")
        
        # Fetch works
        works = _fetch_openalex_works_for_author(
            openalex_author_id=author_id,
            mailto=mailto,
            max_works=50,
        )
        
        print(f"  ✓ Found {len(works)} works")
        
        if works:
            print("    Sample works:")
            for work in works[:3]:
                title = work.get("title", "No title")[:50]
                year = work.get("publication_year", "?")
                print(f"      - {title}... ({year})")
            return 0
    
    print("\n✗ No authors found")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

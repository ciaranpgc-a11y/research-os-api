#!/usr/bin/env python3
"""Test OpenAlex work fetching for Einstein."""

from research_os.services.publication_insights_bootstrap_service import (
    _resolve_openalex_author_by_name,
    _fetch_openalex_works_for_author,
    _openalex_mailto,
)


def main() -> int:
    mailto = _openalex_mailto(fallback_email="test@example.com")
    
    print("Resolving author 'Albert Einstein'...")
    author = _resolve_openalex_author_by_name(
        full_name="Albert Einstein",
        mailto=mailto,
    )
    
    if not author:
        print("✗ Failed to resolve author")
        return 1
    
    author_id = author.get("openalex_author_id")
    print(f"✓ Found author ID: {author_id}\n")
    
    print(f"Fetching works for author {author_id}...")
    works = _fetch_openalex_works_for_author(
        openalex_author_id=author_id,
        mailto=mailto,
        max_works=100,
    )
    
    print(f"✓ Fetched {len(works)} works\n")
    
    if works:
        print("First 5 works:")
        for i, work in enumerate(works[:5], 1):
            title = work.get("title", "No title")[:60]
            year = work.get("publication_year", "?")
            print(f"  {i}. {title}... ({year})")
        return 0
    else:
        print("✗ No works found")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

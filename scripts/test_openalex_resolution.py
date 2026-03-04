#!/usr/bin/env python3
"""Test OpenAlex author resolution."""

from research_os.services.publication_insights_bootstrap_service import (
    _resolve_openalex_author_by_name,
    _openalex_mailto,
)


def main() -> int:
    # Test author resolution for "Stefan Larson"
    mailto = _openalex_mailto(fallback_email="test@example.com")
    print(f"Using mailto: {mailto}\n")
    
    print("Resolving OpenAlex author for 'Stefan Larson'...")
    author = _resolve_openalex_author_by_name(
        full_name="Stefan Larson",
        mailto=mailto,
    )
    
    if author:
        print(f"✓ Found author: {author}")
        return 0
    else:
        print("✗ No author found for 'Stefan Larson'")
        
        # Try with your name
        print("\nResolving OpenAlex author for 'Ciaran'...")
        author = _resolve_openalex_author_by_name(
            full_name="Ciaran",
            mailto=mailto,
        )
        if author:
            print(f"✓ Found author: {author}")
            return 0
        else:
            print("✗ No author found")
            return 1


if __name__ == "__main__":
    raise SystemExit(main())

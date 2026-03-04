#!/usr/bin/env python3
"""Find which select field is breaking the request."""

from research_os.services.publication_insights_bootstrap_service import (
    _openalex_request_with_retry,
    _openalex_mailto,
)


def test_selects(author_id, mailto):
    select_fields = [
        "id",
        "id,display_name",
        "id,display_name,publication_year",
        "id,display_name,publication_year,type",
        "id,display_name,publication_year,type,doi",
        "id,display_name,publication_year,type,doi,ids",
        "id,display_name,publication_year,type,doi,ids,primary_location",
        "id,display_name,publication_year,type,doi,ids,primary_location,host_venue",
        "id,display_name,publication_year,type,doi,ids,primary_location,host_venue,authorships",
        "id,display_name,publication_year,type,doi,ids,primary_location,host_venue,authorships,abstract_inverted_index",
    ]
    
    for select in select_fields:
        params = {
            "filter": f"author.id:{author_id}",
            "select": select,
            "per-page": 50,
            "cursor": "*",
            "mailto": mailto,
        }
        
        response = _openalex_request_with_retry(
            url="https://api.openalex.org/works",
            params=params,
        )
        
        results = response.get("results", [])
        status = "✓" if results else "✗"
        print(f"{status} {len(results):2d} results | select: {select}")


def main() -> int:
    mailto = _openalex_mailto(fallback_email="ciarang-c@hotmail.com")
    author_id = "A5029772193"
    
    print("Testing different select field combinations:\n")
    test_selects(author_id, mailto)
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

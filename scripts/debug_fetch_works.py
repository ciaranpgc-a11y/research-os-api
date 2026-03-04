#!/usr/bin/env python3
"""Debug the works fetching process."""

import os
from research_os.services.publication_insights_bootstrap_service import (
    _openalex_request_with_retry,
    _openalex_mailto,
    _openalex_max_pages,
)


def debug_fetch_works(openalex_author_id: str, mailto: str | None, max_works: int = 100):
    """Debug version of _fetch_openalex_works_for_author."""
    clean_max_works = max(1, min(max_works, 2000))
    results = []
    seen_ids = set()
    cursor = "*"
    pages = 0
    max_pages = _openalex_max_pages()
    
    print(f"Starting fetch with max_pages={max_pages}, max_works={clean_max_works}")
    print(f"Author ID: {openalex_author_id}\n")
    
    while cursor and pages < max_pages and len(results) < clean_max_works:
        params = {
            "filter": f"author.id:{openalex_author_id}",
            "select": (
                "id,display_name,publication_year,type,doi,ids,primary_location,host_venue,"
                "authorships,abstract_inverted_index"
            ),
            "per-page": 200,
            "sort": "publication_date:desc",
            "cursor": cursor,
        }
        if mailto:
            params["mailto"] = mailto
        
        print(f"Page {pages + 1}: Requesting with cursor={cursor[:20]}...")
        
        payload = _openalex_request_with_retry(
            url="https://api.openalex.org/works",
            params=params,
        )
        
        rows = payload.get("results", []) if isinstance(payload.get("results"), list) else []
        print(f"  Got {len(rows)} rows in response")
        
        for i, row in enumerate(rows):
            if not isinstance(row, dict):
                print(f"  Row {i}: Not a dict: {type(row)}")
                continue
            work_id = str(row.get("id") or "").strip()
            if not work_id:
                print(f"  Row {i}: No ID")
                continue
            if work_id in seen_ids:
                print(f"  Row {i}: Duplicate ID {work_id}")
                continue
            seen_ids.add(work_id)
            results.append(row)
            print(f"  Row {i}: Added {work_id[:30]}...")
            if len(results) >= clean_max_works:
                print(f"  Reached max_works limit ({clean_max_works})")
                break
        
        meta = payload.get("meta", {}) if isinstance(payload.get("meta"), dict) else {}
        next_cursor = str(meta.get("next_cursor") or "").strip()
        print(f"  Meta count: {meta.get('count')}, next_cursor: {next_cursor[:20] if next_cursor else None}")
        
        if not next_cursor or next_cursor == cursor:
            print(f"  No next cursor, breaking")
            break
        cursor = next_cursor
        pages += 1
        print()
    
    print(f"\nFinal result: {len(results)} works")
    return results


def main() -> int:
    mailto = _openalex_mailto(fallback_email="ciarang-c@hotmail.com")
    author_id = "A5029772193"
    
    works = debug_fetch_works(
        openalex_author_id=author_id,
        mailto=mailto,
        max_works=100,
    )
    
    print(f"\nReturned {len(works)} works")
    if works:
        print("\nFirst 3:")
        for work in works[:3]:
            print(f"  - {work.get('display_name', 'No title')[:70]}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

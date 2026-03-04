#!/usr/bin/env python3
"""Trigger ORCID publication import using OpenAlex as primary source."""

from sqlalchemy import select
from research_os.db import User, create_all_tables, session_scope
from research_os.services.orcid_service import import_orcid_works


def main() -> int:
    create_all_tables()
    
    # Find all users with ORCID IDs
    with session_scope() as session:
        users = session.scalars(
            select(User).where(User.orcid_id != None)
        ).all()
        
        if not users:
            print("No users with ORCID IDs found.")
            return 0
        
        print(f"Found {len(users)} user(s) with ORCID IDs\n")
        
        for user in users:
            print(f"Importing publications for: {user.name} (ID: {user.id})")
            print(f"  ORCID: {user.orcid_id}")
            
            try:
                result = import_orcid_works(user_id=user.id, overwrite_user_metadata=False)
                new_count = result.get("new_work_ids_count", 0)
                total_count = result.get("total_work_ids_count", 0)
                print(f"  ✓ Imported: {new_count} new works (total: {total_count})")
                print(f"  Result: {result}")
            except Exception as e:
                print(f"  ✗ Error: {e}")
            
            print()
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

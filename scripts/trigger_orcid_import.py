#!/usr/bin/env python3
"""Trigger publication import using OpenAlex (works with or without ORCID)."""

from sqlalchemy import select
from research_os.db import User, create_all_tables, session_scope
from research_os.services.orcid_service import import_orcid_works


def main() -> int:
    create_all_tables()
    
    with session_scope() as session:
        users = session.scalars(select(User)).all()
        
        if not users:
            print("No users found.")
            return 0
        
        print(f"Found {len(users)} user(s)\n")
        
        for user in users:
            print(f"Importing publications for: {user.name} (ID: {user.id})")
            print(f"  Email: {user.email}")
            print(f"  ORCID: {user.orcid_id or 'Not linked'}")
            
            try:
                result = import_orcid_works(user_id=user.id, overwrite_user_metadata=False)
                new_count = result.get("new_work_ids_count", 0)
                total_count = result.get("total_work_ids_count", 0)
                print(f"  ✓ Imported: {new_count} new works (total: {total_count})")
            except Exception as e:
                print(f"  ✗ Error: {e}")
            
            print()
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

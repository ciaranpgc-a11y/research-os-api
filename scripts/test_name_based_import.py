#!/usr/bin/env python3
"""Test publication import with a specific author name."""

from sqlalchemy import select, update
from research_os.db import User, create_all_tables, session_scope
from research_os.services.orcid_service import import_orcid_works


def main() -> int:
    create_all_tables()
    
    # Update one of the test users with a real researcher name
    with session_scope() as session:
        # Update "Test 123Ciaran" with a real name from OpenAlex
        user = session.scalar(
            select(User).where(User.name == "Test 123Ciaran")
        )
        if user:
            # Try with a known researcher
            user.name = "Stefan Larson"  # A researcher with publications and no ORCID requirement
            session.add(user)
            session.commit()
            print(f"Updated user name to: {user.name}")
            print(f"User ID: {user.id}\n")
            
            # Now try the import
            try:
                result = import_orcid_works(user_id=user.id, overwrite_user_metadata=False)
                new_count = result.get("new_work_ids_count", 0)
                total_count = result.get("total_work_ids_count", 0)
                print(f"✓ Success!")
                print(f"  New works: {new_count}")
                print(f"  Total works: {total_count}")
                return 0
            except Exception as e:
                print(f"✗ Error: {e}")
                return 1
        else:
            print("User not found")
            return 1


if __name__ == "__main__":
    raise SystemExit(main())

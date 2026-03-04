#!/usr/bin/env python3
"""Check what users exist in the database."""

from sqlalchemy import select
from research_os.db import User, create_all_tables, session_scope


def main() -> int:
    create_all_tables()
    
    with session_scope() as session:
        all_users = session.scalars(select(User)).all()
        
        print(f"Total users in database: {len(all_users)}\n")
        
        for user in all_users:
            print(f"User: {user.name}")
            print(f"  ID: {user.id}")
            print(f"  Email: {user.email}")
            print(f"  ORCID: {user.orcid_id}")
            print()
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

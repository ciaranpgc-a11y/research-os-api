#!/usr/bin/env python3
"""Test publication import with Ciaran."""

from sqlalchemy import select
from research_os.db import User, Work, create_all_tables, session_scope
from research_os.services.orcid_service import import_orcid_works


def main() -> int:
    create_all_tables()
    
    with session_scope() as session:
        user = session.scalar(
            select(User).where(User.name == "Stefan Larson")
        )
        if user:
            user_id = user.id
            # Check existing works before import
            existing_works = session.scalars(
                select(Work).where(Work.user_id == user_id)
            ).all()
            print(f"Existing works before import: {len(existing_works)}\n")
            
            # Delete existing works to test fresh import
            for work in existing_works:
                session.delete(work)
            session.commit()
            print("Cleared existing works for clean test\n")
            
            # Now try the import
            try:
                print("Importing publications...")
                result = import_orcid_works(user_id=user_id, overwrite_user_metadata=False)
                print(f"\nImport result: {result}\n")
                
                # Check works after import
                new_works = session.scalars(
                    select(Work).where(Work.user_id == user_id)
                ).all()
                print(f"✓ Works after import: {len(new_works)}")
                
                if new_works:
                    print("\nFirst 5 works:")
                    for work in new_works[:5]:
                        print(f"  - {work.title[:60]}... ({work.year})")
                
                return 0
            except Exception as e:
                import traceback
                print(f"✗ Error: {e}")
                traceback.print_exc()
                return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Test publication import with Ciaran Grafton-Clarke."""

from sqlalchemy import select, func
from research_os.db import User, Work, create_all_tables, session_scope
from research_os.services.orcid_service import import_orcid_works


def main() -> int:
    create_all_tables()
    
    with session_scope() as session:
        # Update user with real name
        user = session.scalar(
            select(User).where(User.email == "ciarang-c@hotmail.com")
        )
        if user:
            original_name = user.name
            user.name = "Ciaran Grafton-Clarke"
            session.add(user)
            session.commit()
            
            user_id = user.id
            print(f"Updated user from '{original_name}' to 'Ciaran Grafton-Clarke'")
            print(f"Email: {user.email}")
            print(f"User ID: {user_id}\n")
            
            # Check existing works
            existing_count = session.scalar(
                select(func.count(Work.id)).where(Work.user_id == user_id)
            ) or 0
            print(f"Existing publications: {existing_count}\n")
            
            # Import publications
            try:
                print("Importing publications from OpenAlex...")
                result = import_orcid_works(user_id=user_id, overwrite_user_metadata=False)
                print(f"\n✓ Import successful!")
                print(f"  Result: {result}\n")
                
                # Count works after import
                new_works = session.scalars(
                    select(Work).where(Work.user_id == user_id)
                ).all()
                print(f"Publications after import: {len(new_works)}")
                
                if new_works:
                    print("\nFirst 5 publications:")
                    for work in new_works[:5]:
                        print(f"  - {work.title[:70]}... ({work.year})")
                
                return 0
            except Exception as e:
                import traceback
                print(f"✗ Error: {e}")
                traceback.print_exc()
                return 1
        else:
            print("User not found")
            return 1


if __name__ == "__main__":
    raise SystemExit(main())

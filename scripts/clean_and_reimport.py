#!/usr/bin/env python3
"""Clear all publications and reimport fresh from OpenAlex."""

from sqlalchemy import select, delete
from research_os.db import User, Work, WorkAuthorship, MetricsSnapshot, Embedding, create_all_tables, session_scope
from research_os.services.orcid_service import import_orcid_works


def main() -> int:
    create_all_tables()
    
    with session_scope() as session:
        user = session.scalar(
            select(User).where(User.email == "ciarang-c@hotmail.com")
        )
        
        if not user:
            print("User not found")
            return 1
        
        user_id = user.id
        print(f"User: {user.name}")
        print(f"Email: {user.email}\n")
        
        # Get work IDs for this user
        work_ids = [
            str(w.id) for w in session.scalars(
                select(Work).where(Work.user_id == user_id)
            ).all()
        ]
        
        print(f"Found {len(work_ids)} existing publications")
        print("Deleting all existing publications and related data...\n")
        
        # Delete related data first
        if work_ids:
            session.execute(
                delete(MetricsSnapshot).where(MetricsSnapshot.work_id.in_(work_ids))
            )
            session.execute(
                delete(Embedding).where(Embedding.work_id.in_(work_ids))
            )
            session.execute(
                delete(WorkAuthorship).where(WorkAuthorship.work_id.in_(work_ids))
            )
        
        # Delete all works for this user
        session.execute(
            delete(Work).where(Work.user_id == user_id)
        )
        session.commit()
        
        print("✓ All old publications deleted\n")
        
        # Now do fresh import from OpenAlex
        print("Importing fresh publications from OpenAlex...")
        result = import_orcid_works(user_id=user_id, overwrite_user_metadata=False)
        
        print(f"\n✓ Import complete!")
        print(f"  New publications imported: {result.get('imported_count', 0)}")
        print(f"  Total work IDs: {len(result.get('work_ids', []))}")
        
        # Verify
        final_count = len(session.scalars(
            select(Work).where(Work.user_id == user_id)
        ).all())
        
        print(f"\n✓ Final publication count: {final_count}")
        
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

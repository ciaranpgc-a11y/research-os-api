#!/usr/bin/env python3
"""Check total publications in database for Ciaran."""

from sqlalchemy import select, func
from research_os.db import User, Work, create_all_tables, session_scope


def main() -> int:
    create_all_tables()
    
    with session_scope() as session:
        user = session.scalar(
            select(User).where(User.email == "ciarang-c@hotmail.com")
        )
        
        if not user:
            print("User not found")
            return 1
        
        total_works = session.scalar(
            select(func.count(Work.id)).where(Work.user_id == user.id)
        ) or 0
        
        print(f"User: {user.name}")
        print(f"Email: {user.email}")
        print(f"Total publications in database: {total_works}")
        
        # Get publication years to see distribution
        works = session.scalars(
            select(Work).where(Work.user_id == user.id)
        ).all()
        
        years = {}
        for work in works:
            year = work.year or "Unknown"
            years[year] = years.get(year, 0) + 1
        
        print(f"\nPublications by year:")
        for year in sorted([y for y in years.keys() if y != "Unknown"]):
            print(f"  {year}: {years[year]}")
        if "Unknown" in years:
            print(f"  Unknown: {years['Unknown']}")
        
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

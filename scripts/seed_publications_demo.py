from __future__ import annotations

import argparse

from sqlalchemy import func, select

from research_os.db import User, Work, create_all_tables, session_scope
from research_os.services.publication_metrics_service import compute_publication_top_metrics


def _build_work(*, user_id: str, owner_name: str, index: int) -> Work:
    year = 1998 + (index % 27)
    citations_total = max(0, int((index * 4.1) % 260) + (index % 13))
    title = f"Seeded Publication {index + 1}"
    return Work(
        user_id=user_id,
        title=title,
        title_lower=title.lower(),
        year=year,
        journal=f"Journal {(index % 10) + 1}",
        publication_type="journal-article",
        citations_total=citations_total,
        work_type="article",
        venue_name=f"Venue {(index % 6) + 1}",
        publisher="Seeded Publisher",
        authors_json=[{"name": owner_name, "position": "first"}],
        affiliations_json=[{"name": "Seeded Institute"}],
        keywords=["seeded", "local", "publications"],
        provenance="manual",
        url="",
    )


def _seed_for_user(
    *, user_id: str, user_email: str, user_name: str | None, target_works: int
) -> tuple[int, int]:
    with session_scope() as session:
        existing = int(
            session.scalar(
                select(func.count()).select_from(Work).where(Work.user_id == user_id)
            )
            or 0
        )

        owner_name = str(user_name or user_email or "Local User").strip() or "Local User"
        created = 0
        for index in range(existing, target_works):
            session.add(
                _build_work(user_id=user_id, owner_name=owner_name, index=index)
            )
            created += 1

    compute_publication_top_metrics(user_id=user_id)
    return existing, created


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed publication works for local development users."
    )
    parser.add_argument(
        "--email",
        default="",
        help="Target user email. Ignored when --all-users is set.",
    )
    parser.add_argument(
        "--all-users",
        action="store_true",
        help="Seed all users in the local database.",
    )
    parser.add_argument(
        "--target-works",
        type=int,
        default=180,
        help="Minimum number of works to ensure per target user.",
    )
    args = parser.parse_args()

    target_works = max(1, int(args.target_works))
    target_email = str(args.email or "").strip().lower()

    create_all_tables()
    with session_scope() as session:
        if args.all_users:
            rows = session.scalars(select(User).order_by(User.created_at.asc())).all()
            users = [
                {
                    "id": str(user.id),
                    "email": str(user.email),
                    "name": str(user.name or ""),
                }
                for user in rows
            ]
        elif target_email:
            user = session.scalars(select(User).where(User.email == target_email)).first()
            users = (
                [
                    {
                        "id": str(user.id),
                        "email": str(user.email),
                        "name": str(user.name or ""),
                    }
                ]
                if user is not None
                else []
            )
        else:
            first_user = session.scalars(select(User).order_by(User.created_at.asc())).first()
            users = (
                [
                    {
                        "id": str(first_user.id),
                        "email": str(first_user.email),
                        "name": str(first_user.name or ""),
                    }
                ]
                if first_user is not None
                else []
            )

    if not users:
        if target_email:
            print(f"No user found for email '{target_email}'.")
        else:
            print("No users found. Register a user first.")
        return 1

    for user in users:
        existing, created = _seed_for_user(
            user_id=str(user.get("id") or ""),
            user_email=str(user.get("email") or ""),
            user_name=str(user.get("name") or ""),
            target_works=target_works,
        )
        print(
            f"{user['email']}: had {existing} works, added {created}, target {target_works}."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

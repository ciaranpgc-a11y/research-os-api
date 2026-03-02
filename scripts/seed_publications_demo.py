from __future__ import annotations

import argparse

from sqlalchemy import func, select

from research_os.db import User, Work, create_all_tables, session_scope
from research_os.services.publication_metrics_service import compute_publication_top_metrics


def _build_demo_abstract(*, index: int) -> str:
    variant = index % 4
    if variant == 0:
        return (
            "Background: Structured publication intelligence can improve manuscript planning and portfolio decisions. "
            "Aim: To evaluate whether a drilldown-first publication console improves review speed and consistency. "
            "Methods: We analysed seeded publication records with deterministic ranking, citation snapshots, and abstract extraction. "
            "Results: Drilldown views improved retrieval of key metadata and reduced navigation steps across repeated review tasks. "
            "Conclusions: A structured publication drilldown supports faster evidence review and clearer reporting workflows."
        )
    if variant == 1:
        return (
            "Introduction: Publication libraries often mix high-level metrics with low-level record details. "
            "Methods: We implemented a block-based layout with consistent title, navigation, heading, and content contracts. "
            "Results: Users identified publication attributes and contribution signals with fewer interactions and fewer formatting ambiguities. "
            "Conclusion: Consistent block mapping and tokenized styling improve scanability for publication assessment."
        )
    if variant == 2:
        return (
            "Background: Teams need rapid access to publication context, methods, and outcomes. "
            "Study design: Local seeded records were used to test table scaling, drilldown parity, and abstract readability. "
            "Findings: Edge-to-edge content blocks and normalized spacing improved visual parity across tile and library drilldowns. "
            "Interpretation: Standardized abstract presentation reduces cognitive load during review."
        )
    return (
        "Aim: To provide locally seeded publications with realistic abstract content for UI validation. "
        "Methods: Deterministic sample abstracts were assigned during seeding and backfilled for existing records without abstracts. "
        "Results: Abstract tab rendering became immediately testable across records, including long-form and sectioned text. "
        "Conclusions: Seed-level abstract hydration accelerates local frontend iteration."
    )


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
        abstract=_build_demo_abstract(index=index),
        authors_json=[{"name": owner_name, "position": "first"}],
        affiliations_json=[{"name": "Seeded Institute"}],
        keywords=["seeded", "local", "publications"],
        provenance="manual",
        url="",
    )


def _seed_for_user(
    *, user_id: str, user_email: str, user_name: str | None, target_works: int
) -> tuple[int, int, int]:
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

        works = session.scalars(
            select(Work).where(Work.user_id == user_id).order_by(Work.created_at.asc())
        ).all()
        backfilled = 0
        for index, work in enumerate(works):
            if str(work.abstract or "").strip():
                continue
            work.abstract = _build_demo_abstract(index=index)
            backfilled += 1

    compute_publication_top_metrics(user_id=user_id)
    return existing, created, backfilled


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
        existing, created, backfilled = _seed_for_user(
            user_id=str(user.get("id") or ""),
            user_email=str(user.get("email") or ""),
            user_name=str(user.get("name") or ""),
            target_works=target_works,
        )
        print(
            f"{user['email']}: had {existing} works, added {created}, backfilled abstracts {backfilled}, target {target_works}."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

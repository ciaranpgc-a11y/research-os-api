from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from research_os.db import (
    Collaborator,
    CollaborationMetric,
    User,
    create_all_tables,
    session_scope,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed demo collaborator records for local development."
    )
    parser.add_argument(
        "--email",
        default="",
        help="Target user email. Defaults to first user in the database.",
    )
    args = parser.parse_args()

    create_all_tables()
    with session_scope() as session:
        user = None
        if args.email.strip():
            user = session.scalars(
                select(User).where(User.email == args.email.strip().lower())
            ).first()
        if user is None:
            user = session.scalars(select(User).order_by(User.created_at.asc())).first()
        if user is None:
            print("No users found. Register a user first.")
            return 1

        seed_rows = [
            {
                "full_name": "Alice Smith",
                "full_name_lower": "alice smith",
                "orcid_id": "0000-0002-1825-0097",
                "primary_institution": "King's College London",
                "country": "GB",
                "research_domains": ["Cardiology", "Imaging"],
                "coauthored_works_count": 8,
                "shared_citations_total": 180,
                "last_collaboration_year": _utcnow().year,
                "classification": "CORE",
                "score": 0.92,
            },
            {
                "full_name": "Brian O'Neill",
                "full_name_lower": "brian o'neill",
                "orcid_id": "0000-0001-5109-3700",
                "primary_institution": "University College Dublin",
                "country": "IE",
                "research_domains": ["Medical Education"],
                "coauthored_works_count": 4,
                "shared_citations_total": 65,
                "last_collaboration_year": _utcnow().year - 1,
                "classification": "ACTIVE",
                "score": 0.54,
            },
            {
                "full_name": "Chloe Patel",
                "full_name_lower": "chloe patel",
                "orcid_id": None,
                "primary_institution": "Imperial College London",
                "country": "GB",
                "research_domains": ["Thoracic Surgery"],
                "coauthored_works_count": 2,
                "shared_citations_total": 22,
                "last_collaboration_year": _utcnow().year - 3,
                "classification": "OCCASIONAL",
                "score": 0.27,
            },
        ]

        created = 0
        for item in seed_rows:
            existing = session.scalars(
                select(Collaborator).where(
                    Collaborator.owner_user_id == user.id,
                    Collaborator.full_name_lower == item["full_name_lower"],
                )
            ).first()
            if existing is None:
                existing = Collaborator(
                    owner_user_id=user.id,
                    full_name=item["full_name"],
                    full_name_lower=item["full_name_lower"],
                    orcid_id=item["orcid_id"],
                    primary_institution=item["primary_institution"],
                    country=item["country"],
                    research_domains=item["research_domains"],
                )
                session.add(existing)
                session.flush()
                created += 1

            metric = session.scalars(
                select(CollaborationMetric).where(
                    CollaborationMetric.owner_user_id == user.id,
                    CollaborationMetric.collaborator_id == existing.id,
                )
            ).first()
            if metric is None:
                metric = CollaborationMetric(
                    owner_user_id=user.id,
                    collaborator_id=existing.id,
                )
                session.add(metric)
            metric.coauthored_works_count = int(item["coauthored_works_count"])
            metric.shared_citations_total = int(item["shared_citations_total"])
            metric.first_collaboration_year = item["last_collaboration_year"] - 3
            metric.last_collaboration_year = int(item["last_collaboration_year"])
            metric.citations_last_12m = int(item["shared_citations_total"] * 0.2)
            metric.collaboration_strength_score = float(item["score"])
            metric.classification = str(item["classification"])
            metric.status = "READY"
            metric.last_error = None
            metric.computed_at = _utcnow() - timedelta(hours=3)
            metric.next_scheduled_at = _utcnow() + timedelta(hours=21)
            metric.source_json = {
                "formula_version": "collab_strength_v1",
                "top_shared_work_ids": [],
                "failures_in_row": 0,
            }

        print(
            f"Seed complete for user '{user.email}'. Created {created} collaborator(s)."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

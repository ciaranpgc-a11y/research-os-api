from __future__ import annotations

import argparse
from typing import Any

from sqlalchemy import select

from research_os.db import (
    PublicationStructuredAbstractCache,
    User,
    Work,
    create_all_tables,
    session_scope,
)
import research_os.services.publication_console_service as publication_console_service


def _payload_has_sections(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    sections = payload.get("sections")
    return isinstance(sections, list) and len(sections) > 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill publication structured abstract cache rows. "
            "Useful after parser updates or when abstracts show as unavailable."
        )
    )
    parser.add_argument(
        "--email",
        default="",
        help="Target a single user by email.",
    )
    parser.add_argument(
        "--user-id",
        default="",
        help="Target a single user by UUID.",
    )
    parser.add_argument(
        "--all-users",
        action="store_true",
        help="Process all users.",
    )
    parser.add_argument(
        "--only-missing",
        action="store_true",
        default=True,
        help=(
            "Process only missing/incomplete structured abstract rows "
            "(default behavior)."
        ),
    )
    parser.add_argument(
        "--include-ready",
        action="store_true",
        help="Also recompute rows already marked READY.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        default=True,
        help="Force recompute even when source hash matches (default behavior).",
    )
    parser.add_argument(
        "--max-items",
        type=int,
        default=0,
        help="Optional limit for number of publications to process.",
    )
    parser.add_argument(
        "--skip-pmid-lookup",
        action="store_true",
        help=(
            "Disable PubMed PMID resolution network lookup and rely on local "
            "abstract/metadata only."
        ),
    )
    args = parser.parse_args()

    create_all_tables()

    if args.skip_pmid_lookup:
        publication_console_service._resolve_pubmed_pmid = (  # type: ignore[attr-defined]
            lambda **kwargs: ""
        )

    target_email = str(args.email or "").strip().lower()
    target_user_id = str(args.user_id or "").strip()

    with session_scope() as session:
        if args.all_users:
            users = session.scalars(select(User.id).order_by(User.created_at.asc())).all()
            user_ids = [str(item) for item in users]
        elif target_user_id:
            exists = session.scalar(select(User.id).where(User.id == target_user_id))
            user_ids = [str(exists)] if exists else []
        elif target_email:
            user_id = session.scalar(select(User.id).where(User.email == target_email))
            user_ids = [str(user_id)] if user_id else []
        else:
            first_user = session.scalar(select(User.id).order_by(User.created_at.asc()))
            user_ids = [str(first_user)] if first_user else []

        if not user_ids:
            if target_email:
                print(f"No user found for email '{target_email}'.")
            elif target_user_id:
                print(f"No user found for user id '{target_user_id}'.")
            else:
                print("No users found.")
            return 1

        work_rows = session.execute(
            select(Work.user_id, Work.id)
            .where(Work.user_id.in_(user_ids))
            .order_by(Work.user_id.asc(), Work.created_at.asc())
        ).all()
        cache_rows = session.execute(
            select(
                PublicationStructuredAbstractCache.owner_user_id,
                PublicationStructuredAbstractCache.publication_id,
                PublicationStructuredAbstractCache.status,
                PublicationStructuredAbstractCache.payload_json,
            ).where(PublicationStructuredAbstractCache.owner_user_id.in_(user_ids))
        ).all()

    cache_index: dict[tuple[str, str], tuple[str, Any]] = {
        (str(owner_user_id), str(publication_id)): (str(status or ""), payload_json)
        for owner_user_id, publication_id, status, payload_json in cache_rows
    }

    queue: list[tuple[str, str]] = []
    for owner_user_id, publication_id in work_rows:
        key = (str(owner_user_id), str(publication_id))
        status, payload = cache_index.get(key, ("", None))
        if args.include_ready:
            queue.append(key)
            continue
        if args.only_missing:
            if status != "READY" or not _payload_has_sections(payload):
                queue.append(key)
            continue
        queue.append(key)

    max_items = max(0, int(args.max_items or 0))
    if max_items > 0:
        queue = queue[:max_items]

    processed = 0
    failed = 0
    for index, (owner_user_id, publication_id) in enumerate(queue, start=1):
        try:
            publication_console_service._run_structured_abstract_compute_job(  # type: ignore[attr-defined]
                user_id=owner_user_id,
                publication_id=publication_id,
                force=bool(args.force),
            )
            processed += 1
        except Exception:
            failed += 1
        if index % 50 == 0:
            print(f"progress {index}/{len(queue)} processed={processed} failed={failed}")

    print(f"done queued={len(queue)} processed={processed} failed={failed}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())

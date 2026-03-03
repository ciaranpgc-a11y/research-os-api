from __future__ import annotations

import argparse
import os

from datetime import datetime, timezone

from research_os.db import Work, session_scope
from research_os.services.persona_service import _normalize_work_type


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Normalize work_type values. By default only empty/'other' rows are touched."
        )
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help=(
            "Maximum number of eligible rows to evaluate. "
            "Use for staged rollout/testing (0 means no limit)."
        ),
    )
    parser.add_argument(
        "--reclassify-journal",
        action="store_true",
        help=(
            "Also re-evaluate rows currently marked as 'journal-article'. "
            "Useful for correcting legacy over-classification."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    updated = 0
    scanned = 0
    eligible = 0
    attempted = 0
    allow_llm = str(os.getenv("ENABLE_WORK_TYPE_LLM", "")).strip().lower() in {
        "1",
        "true",
        "yes",
    }
    with session_scope() as session:
        works = session.query(Work).all()
        for work in works:
            scanned += 1
            current = str(work.work_type or "").strip()
            current_lower = current.lower()
            force_reclassify_journal = (
                args.reclassify_journal and current_lower == "journal-article"
            )
            if current_lower not in {"", "other"} and not force_reclassify_journal:
                continue
            if work.user_edited and current:
                continue
            eligible += 1
            if args.limit > 0 and attempted >= args.limit:
                break
            attempted += 1
            work_type_input = "" if force_reclassify_journal else current
            normalized, source = _normalize_work_type(
                work_type=work_type_input,
                title=str(work.title or "").strip(),
                venue_name=str(work.venue_name or "").strip(),
                publisher=str(work.publisher or "").strip(),
                url=str(work.url or "").strip(),
                abstract=str(work.abstract or "").strip(),
                allow_llm=allow_llm,
            )
            if not normalized:
                continue
            if normalized != current:
                work.work_type = normalized
                if source == "llm":
                    work.work_type_source = "llm"
                    work.work_type_llm_at = work.work_type_llm_at or datetime.now(
                        timezone.utc
                    )
                updated += 1
        session.flush()
    print(
        f"scanned={scanned} eligible={eligible} attempted={attempted} updated={updated}"
    )


if __name__ == "__main__":
    main()

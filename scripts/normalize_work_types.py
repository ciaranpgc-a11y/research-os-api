from __future__ import annotations

import os

from datetime import datetime, timezone

from research_os.db import Work, session_scope
from research_os.services.persona_service import _normalize_work_type


def main() -> None:
    updated = 0
    scanned = 0
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
            if current and current.lower() not in {"other"}:
                continue
            if work.user_edited and current:
                continue
            normalized, source = _normalize_work_type(
                work_type=current,
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
    print(f"scanned={scanned} updated={updated}")


if __name__ == "__main__":
    main()

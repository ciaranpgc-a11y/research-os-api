from dotenv import load_dotenv; load_dotenv()
from research_os.db import session_scope, create_all_tables
from research_os.db import PublicationStructuredPaperCache
from sqlalchemy import select

create_all_tables()
with session_scope() as s:
    rows = s.scalars(
        select(PublicationStructuredPaperCache)
        .order_by(PublicationStructuredPaperCache.computed_at.desc())
        .limit(5)
    ).all()
    for r in rows:
        err = str(r.last_error or "")[:100]
        print(f"pub={r.publication_id}  status={r.status}  computed={r.computed_at}  error={err}")

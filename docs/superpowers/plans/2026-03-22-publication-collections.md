# Publication Collections System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a collections system that lets researchers organise publications into collections and subcollections, with a full-page viewport featuring Organise (drag-to-add) and Browse (view/reorder) modes.

**Architecture:** Three new SQLAlchemy models (Collection, Subcollection, CollectionMembership) with a dedicated service layer. FastAPI endpoints for CRUD + membership management. New React page at `/profile/publications/collections` with drag-and-drop via the HTML5 Drag API. The existing profile-publications-page gets a "My collections" toggle that navigates to the new route.

**Tech Stack:** Python/FastAPI/SQLAlchemy (backend), React 18/TypeScript/Tailwind CSS (frontend), Alembic (migrations), HTML5 Drag and Drop API.

**Spec:** `docs/superpowers/specs/2026-03-22-publication-collections-design.md`
**Prototype:** `.superpowers/brainstorm/15684-1774184218/collections-full-mockup.html`

---

## File Structure

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `src/research_os/services/collection_service.py` | All collection business logic: CRUD for collections, subcollections, memberships, reorder |
| `alembic/versions/20260322_0024_publication_collections.py` | Database migration for the three new tables |

### Backend — Modified Files
| File | Change |
|------|--------|
| `src/research_os/db.py` | Add Collection, Subcollection, CollectionMembership models |
| `src/research_os/api/schemas.py` | Add request/response Pydantic models |
| `src/research_os/api/app.py` | Add 17 new API endpoints |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/pages/profile-collections-page.tsx` | Full page component with Organise and Browse modes |
| `frontend/src/lib/collections-api.ts` | API client functions for all collection endpoints |
| `frontend/src/types/collections.ts` | TypeScript type definitions |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `frontend/src/AppRouter.tsx` | Add route for `/profile/publications/collections` |
| `frontend/src/pages/profile-publications-page.tsx` | Add "My collections" toggle button that navigates to the new route |

---

## Task 1: Database Models

**Files:**
- Modify: `src/research_os/db.py`

- [ ] **Step 1: Add the Collection model**

Add after the existing model definitions (near the end of the models section, before the utility functions):

```python
class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255))
    colour: Mapped[str] = mapped_column(String(20), default="indigo")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    subcollections: Mapped[list["Subcollection"]] = relationship(
        back_populates="collection", cascade="all, delete-orphan"
    )
    memberships: Mapped[list["CollectionMembership"]] = relationship(
        back_populates="collection", cascade="all, delete-orphan"
    )
```

- [ ] **Step 2: Add the Subcollection model**

```python
class Subcollection(Base):
    __tablename__ = "subcollections"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    collection_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("collections.id", ondelete="CASCADE"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    collection: Mapped["Collection"] = relationship(back_populates="subcollections")
    memberships: Mapped[list["CollectionMembership"]] = relationship(
        back_populates="subcollection", cascade="all, delete-orphan"
    )
```

- [ ] **Step 3: Add the CollectionMembership model**

```python
class CollectionMembership(Base):
    __tablename__ = "collection_memberships"
    __table_args__ = (
        UniqueConstraint("collection_id", "subcollection_id", "work_id"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    collection_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("collections.id", ondelete="CASCADE"),
        index=True,
    )
    subcollection_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("subcollections.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    work_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("works.id", ondelete="CASCADE"),
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    collection: Mapped["Collection"] = relationship(back_populates="memberships")
    subcollection: Mapped["Subcollection | None"] = relationship(back_populates="memberships")
```

- [ ] **Step 4: Verify models import correctly**

Run: `cd /c/Users/Ciaran/Documents/GitHub/research-os-api && python -c "from research_os.db import Collection, Subcollection, CollectionMembership; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add src/research_os/db.py
git commit -m "feat(collections): add Collection, Subcollection, CollectionMembership models"
```

---

## Task 2: Alembic Migration

**Files:**
- Create: `alembic/versions/20260322_0024_publication_collections.py`

- [ ] **Step 1: Create the migration file**

```python
"""Publication collections system.

Revision ID: 20260322_0024
Revises: 20260321_0001
Create Date: 2026-03-22
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260322_0024"
down_revision = "20260321_0001"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def upgrade() -> None:
    if not _table_exists("collections"):
        op.create_table(
            "collections",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("colour", sa.String(length=20), nullable=False, server_default="indigo"),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_collections_user_id", "collections", ["user_id"])

    if not _table_exists("subcollections"):
        op.create_table(
            "subcollections",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("collection_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(
                ["collection_id"], ["collections.id"], ondelete="CASCADE"
            ),
        )
        op.create_index(
            "ix_subcollections_collection_id", "subcollections", ["collection_id"]
        )

    if not _table_exists("collection_memberships"):
        op.create_table(
            "collection_memberships",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("collection_id", sa.String(length=36), nullable=False),
            sa.Column("subcollection_id", sa.String(length=36), nullable=True),
            sa.Column("work_id", sa.String(length=36), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(
                ["collection_id"], ["collections.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["subcollection_id"], ["subcollections.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["work_id"], ["works.id"], ondelete="CASCADE"
            ),
            sa.UniqueConstraint(
                "collection_id", "subcollection_id", "work_id",
                name="uq_collection_subcollection_work",
            ),
        )
        op.create_index(
            "ix_collection_memberships_collection_id",
            "collection_memberships",
            ["collection_id"],
        )
        op.create_index(
            "ix_collection_memberships_subcollection_id",
            "collection_memberships",
            ["subcollection_id"],
        )
        op.create_index(
            "ix_collection_memberships_work_id",
            "collection_memberships",
            ["work_id"],
        )


def downgrade() -> None:
    op.drop_table("collection_memberships")
    op.drop_table("subcollections")
    op.drop_table("collections")
```

- [ ] **Step 2: Verify migration runs**

Run: `cd /c/Users/Ciaran/Documents/GitHub/research-os-api && python -c "from research_os.db import create_all_tables; create_all_tables(); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add alembic/versions/20260322_0024_publication_collections.py
git commit -m "feat(collections): add alembic migration for collections tables"
```

---

## Task 3: Service Layer

**Files:**
- Create: `src/research_os/services/collection_service.py`

- [ ] **Step 1: Create collection_service.py with collection CRUD**

```python
from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func, distinct, delete, update
from sqlalchemy.orm import Session

from research_os.db import (
    Collection,
    CollectionMembership,
    Subcollection,
    Work,
    session_scope,
)

logger = logging.getLogger(__name__)

COLLECTION_COLOURS = [
    "indigo", "amber", "emerald", "red", "violet",
    "sky", "pink", "teal", "orange", "slate",
]


def list_collections(user_id: str) -> list[dict[str, Any]]:
    """List all collections for a user with distinct publication counts."""
    with session_scope() as session:
        collections = (
            session.execute(
                select(Collection)
                .where(Collection.user_id == user_id)
                .order_by(Collection.sort_order, Collection.created_at)
            )
            .scalars()
            .all()
        )
        result = []
        for col in collections:
            count = session.execute(
                select(func.count(distinct(CollectionMembership.work_id)))
                .where(CollectionMembership.collection_id == col.id)
            ).scalar() or 0
            result.append({
                "id": col.id,
                "user_id": col.user_id,
                "name": col.name,
                "colour": col.colour,
                "sort_order": col.sort_order,
                "publication_count": count,
                "created_at": col.created_at,
                "updated_at": col.updated_at,
            })
        return result


def create_collection(user_id: str, name: str, colour: str = "indigo") -> dict[str, Any]:
    """Create a new collection."""
    if colour not in COLLECTION_COLOURS:
        colour = "indigo"
    with session_scope() as session:
        max_order = session.execute(
            select(func.coalesce(func.max(Collection.sort_order), -1))
            .where(Collection.user_id == user_id)
        ).scalar()
        col = Collection(
            user_id=user_id,
            name=name.strip(),
            colour=colour,
            sort_order=(max_order or 0) + 1,
        )
        session.add(col)
        session.flush()
        return {
            "id": col.id,
            "user_id": col.user_id,
            "name": col.name,
            "colour": col.colour,
            "sort_order": col.sort_order,
            "publication_count": 0,
            "created_at": col.created_at,
            "updated_at": col.updated_at,
        }


def update_collection(
    user_id: str, collection_id: str, *, name: str | None = None, colour: str | None = None
) -> dict[str, Any]:
    """Update a collection's name and/or colour."""
    with session_scope() as session:
        col = session.execute(
            select(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        ).scalar_one_or_none()
        if not col:
            raise ValueError(f"Collection {collection_id} not found.")
        if name is not None:
            col.name = name.strip()
        if colour is not None and colour in COLLECTION_COLOURS:
            col.colour = colour
        session.flush()
        count = session.execute(
            select(func.count(distinct(CollectionMembership.work_id)))
            .where(CollectionMembership.collection_id == col.id)
        ).scalar() or 0
        return {
            "id": col.id,
            "user_id": col.user_id,
            "name": col.name,
            "colour": col.colour,
            "sort_order": col.sort_order,
            "publication_count": count,
            "created_at": col.created_at,
            "updated_at": col.updated_at,
        }


def delete_collection(user_id: str, collection_id: str) -> dict[str, Any]:
    """Delete a collection (cascades to subcollections and memberships)."""
    with session_scope() as session:
        col = session.execute(
            select(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        ).scalar_one_or_none()
        if not col:
            raise ValueError(f"Collection {collection_id} not found.")
        session.delete(col)
        return {"deleted": True, "id": collection_id}


def reorder_collections(user_id: str, ordered_ids: list[str]) -> list[dict[str, Any]]:
    """Reorder collections by providing the full ordered list of IDs."""
    with session_scope() as session:
        for idx, cid in enumerate(ordered_ids):
            session.execute(
                update(Collection)
                .where(Collection.id == cid, Collection.user_id == user_id)
                .values(sort_order=idx)
            )
    return list_collections(user_id)


# ── Subcollections ──────────────────────────────────────────────


def list_subcollections(user_id: str, collection_id: str) -> list[dict[str, Any]]:
    """List subcollections for a collection with counts."""
    with session_scope() as session:
        col = session.execute(
            select(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        ).scalar_one_or_none()
        if not col:
            raise ValueError(f"Collection {collection_id} not found.")
        subs = (
            session.execute(
                select(Subcollection)
                .where(Subcollection.collection_id == collection_id)
                .order_by(Subcollection.sort_order, Subcollection.created_at)
            )
            .scalars()
            .all()
        )
        result = []
        for sub in subs:
            count = session.execute(
                select(func.count(CollectionMembership.id))
                .where(CollectionMembership.subcollection_id == sub.id)
            ).scalar() or 0
            result.append({
                "id": sub.id,
                "collection_id": sub.collection_id,
                "name": sub.name,
                "sort_order": sub.sort_order,
                "publication_count": count,
                "created_at": sub.created_at,
                "updated_at": sub.updated_at,
            })
        return result


def create_subcollection(user_id: str, collection_id: str, name: str) -> dict[str, Any]:
    """Create a subcollection within a collection."""
    with session_scope() as session:
        col = session.execute(
            select(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        ).scalar_one_or_none()
        if not col:
            raise ValueError(f"Collection {collection_id} not found.")
        max_order = session.execute(
            select(func.coalesce(func.max(Subcollection.sort_order), -1))
            .where(Subcollection.collection_id == collection_id)
        ).scalar()
        sub = Subcollection(
            collection_id=collection_id,
            name=name.strip(),
            sort_order=(max_order or 0) + 1,
        )
        session.add(sub)
        session.flush()
        return {
            "id": sub.id,
            "collection_id": sub.collection_id,
            "name": sub.name,
            "sort_order": sub.sort_order,
            "publication_count": 0,
            "created_at": sub.created_at,
            "updated_at": sub.updated_at,
        }


def update_subcollection(
    user_id: str, collection_id: str, subcollection_id: str, *, name: str | None = None
) -> dict[str, Any]:
    """Update a subcollection's name."""
    with session_scope() as session:
        col = session.execute(
            select(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        ).scalar_one_or_none()
        if not col:
            raise ValueError(f"Collection {collection_id} not found.")
        sub = session.execute(
            select(Subcollection)
            .where(Subcollection.id == subcollection_id, Subcollection.collection_id == collection_id)
        ).scalar_one_or_none()
        if not sub:
            raise ValueError(f"Subcollection {subcollection_id} not found.")
        if name is not None:
            sub.name = name.strip()
        session.flush()
        count = session.execute(
            select(func.count(CollectionMembership.id))
            .where(CollectionMembership.subcollection_id == sub.id)
        ).scalar() or 0
        return {
            "id": sub.id,
            "collection_id": sub.collection_id,
            "name": sub.name,
            "sort_order": sub.sort_order,
            "publication_count": count,
            "created_at": sub.created_at,
            "updated_at": sub.updated_at,
        }


def delete_subcollection(user_id: str, collection_id: str, subcollection_id: str) -> dict[str, Any]:
    """Delete a subcollection (cascades to memberships)."""
    with session_scope() as session:
        col = session.execute(
            select(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        ).scalar_one_or_none()
        if not col:
            raise ValueError(f"Collection {collection_id} not found.")
        sub = session.execute(
            select(Subcollection)
            .where(Subcollection.id == subcollection_id, Subcollection.collection_id == collection_id)
        ).scalar_one_or_none()
        if not sub:
            raise ValueError(f"Subcollection {subcollection_id} not found.")
        session.delete(sub)
        return {"deleted": True, "id": subcollection_id}


# ── Collection Memberships ──────────────────────────────────────


def list_collection_publications(
    user_id: str, collection_id: str
) -> list[dict[str, Any]]:
    """List distinct publications in a collection (all subcollections included)."""
    with session_scope() as session:
        col = session.execute(
            select(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        ).scalar_one_or_none()
        if not col:
            raise ValueError(f"Collection {collection_id} not found.")
        rows = (
            session.execute(
                select(CollectionMembership, Work)
                .join(Work, CollectionMembership.work_id == Work.id)
                .where(CollectionMembership.collection_id == collection_id)
                .order_by(CollectionMembership.sort_order, CollectionMembership.created_at)
            )
            .all()
        )
        seen: set[str] = set()
        result: list[dict[str, Any]] = []
        for membership, work in rows:
            if work.id in seen:
                continue
            seen.add(work.id)
            result.append({
                "membership_id": membership.id,
                "work_id": work.id,
                "subcollection_id": membership.subcollection_id,
                "sort_order": membership.sort_order,
                "title": work.title,
                "year": work.year,
                "journal": work.venue_name or work.journal,
                "citations": work.citations_total or 0,
                "doi": work.doi,
            })
        return result


def add_publications_to_collection(
    user_id: str, collection_id: str, work_ids: list[str],
    subcollection_id: str | None = None,
) -> list[dict[str, Any]]:
    """Add publications to a collection (or subcollection). Skips duplicates."""
    with session_scope() as session:
        col = session.execute(
            select(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        ).scalar_one_or_none()
        if not col:
            raise ValueError(f"Collection {collection_id} not found.")
        if subcollection_id:
            sub = session.execute(
                select(Subcollection)
                .where(
                    Subcollection.id == subcollection_id,
                    Subcollection.collection_id == collection_id,
                )
            ).scalar_one_or_none()
            if not sub:
                raise ValueError(f"Subcollection {subcollection_id} not found.")
        max_order = session.execute(
            select(func.coalesce(func.max(CollectionMembership.sort_order), -1))
            .where(CollectionMembership.collection_id == collection_id)
        ).scalar() or 0
        created = []
        for idx, wid in enumerate(work_ids):
            existing = session.execute(
                select(CollectionMembership)
                .where(
                    CollectionMembership.collection_id == collection_id,
                    CollectionMembership.subcollection_id == subcollection_id,
                    CollectionMembership.work_id == wid,
                )
            ).scalar_one_or_none()
            if existing:
                continue
            m = CollectionMembership(
                collection_id=collection_id,
                subcollection_id=subcollection_id,
                work_id=wid,
                sort_order=max_order + 1 + idx,
            )
            session.add(m)
            session.flush()
            created.append({
                "id": m.id,
                "collection_id": m.collection_id,
                "subcollection_id": m.subcollection_id,
                "work_id": m.work_id,
                "sort_order": m.sort_order,
            })
        return created


def remove_publication_from_collection(
    user_id: str, collection_id: str, work_id: str,
    subcollection_id: str | None = None,
) -> dict[str, Any]:
    """Remove a publication from a collection (or subcollection)."""
    with session_scope() as session:
        col = session.execute(
            select(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        ).scalar_one_or_none()
        if not col:
            raise ValueError(f"Collection {collection_id} not found.")
        if subcollection_id:
            session.execute(
                delete(CollectionMembership).where(
                    CollectionMembership.collection_id == collection_id,
                    CollectionMembership.subcollection_id == subcollection_id,
                    CollectionMembership.work_id == work_id,
                )
            )
        else:
            session.execute(
                delete(CollectionMembership).where(
                    CollectionMembership.collection_id == collection_id,
                    CollectionMembership.work_id == work_id,
                )
            )
        return {"removed": True, "work_id": work_id}


def reorder_collection_publications(
    user_id: str, collection_id: str, ordered_work_ids: list[str],
    subcollection_id: str | None = None,
) -> dict[str, Any]:
    """Reorder publications within a collection or subcollection."""
    with session_scope() as session:
        col = session.execute(
            select(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        ).scalar_one_or_none()
        if not col:
            raise ValueError(f"Collection {collection_id} not found.")
        for idx, wid in enumerate(ordered_work_ids):
            stmt = (
                update(CollectionMembership)
                .where(
                    CollectionMembership.collection_id == collection_id,
                    CollectionMembership.work_id == wid,
                )
                .values(sort_order=idx)
            )
            if subcollection_id:
                stmt = stmt.where(
                    CollectionMembership.subcollection_id == subcollection_id
                )
            session.execute(stmt)
        return {"reordered": True}


def list_subcollection_publications(
    user_id: str, collection_id: str, subcollection_id: str
) -> list[dict[str, Any]]:
    """List publications in a specific subcollection."""
    with session_scope() as session:
        col = session.execute(
            select(Collection)
            .where(Collection.id == collection_id, Collection.user_id == user_id)
        ).scalar_one_or_none()
        if not col:
            raise ValueError(f"Collection {collection_id} not found.")
        rows = (
            session.execute(
                select(CollectionMembership, Work)
                .join(Work, CollectionMembership.work_id == Work.id)
                .where(
                    CollectionMembership.collection_id == collection_id,
                    CollectionMembership.subcollection_id == subcollection_id,
                )
                .order_by(CollectionMembership.sort_order, CollectionMembership.created_at)
            )
            .all()
        )
        return [
            {
                "membership_id": m.id,
                "work_id": w.id,
                "subcollection_id": m.subcollection_id,
                "sort_order": m.sort_order,
                "title": w.title,
                "year": w.year,
                "journal": w.venue_name or w.journal,
                "citations": w.citations_total or 0,
                "doi": w.doi,
            }
            for m, w in rows
        ]


def list_publication_collections(user_id: str, work_id: str) -> list[dict[str, Any]]:
    """List all collections a publication belongs to."""
    with session_scope() as session:
        rows = (
            session.execute(
                select(CollectionMembership, Collection)
                .join(Collection, CollectionMembership.collection_id == Collection.id)
                .where(
                    CollectionMembership.work_id == work_id,
                    Collection.user_id == user_id,
                )
            )
            .all()
        )
        seen: set[str] = set()
        result: list[dict[str, Any]] = []
        for m, col in rows:
            if col.id in seen:
                continue
            seen.add(col.id)
            result.append({
                "id": col.id,
                "name": col.name,
                "colour": col.colour,
            })
        return result
```

- [ ] **Step 2: Verify service imports**

Run: `cd /c/Users/Ciaran/Documents/GitHub/research-os-api && python -c "from research_os.services.collection_service import list_collections, create_collection; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/research_os/services/collection_service.py
git commit -m "feat(collections): add collection service layer with full CRUD"
```

---

## Task 4: API Schemas

**Files:**
- Modify: `src/research_os/api/schemas.py`

- [ ] **Step 1: Add request and response schemas**

Add at the end of the file:

```python
# ── Collections ─────────────────────────────────────────────────


class CollectionCreateRequest(BaseModel):
    name: str
    colour: str = "indigo"


class CollectionUpdateRequest(BaseModel):
    name: str | None = None
    colour: str | None = None


class CollectionReorderRequest(BaseModel):
    ordered_ids: list[str]


class CollectionResponse(BaseModel):
    id: str
    user_id: str
    name: str
    colour: str
    sort_order: int
    publication_count: int
    created_at: datetime
    updated_at: datetime


class CollectionListResponse(BaseModel):
    items: list[CollectionResponse]


class CollectionDeleteResponse(BaseModel):
    deleted: bool
    id: str


class SubcollectionCreateRequest(BaseModel):
    name: str


class SubcollectionUpdateRequest(BaseModel):
    name: str | None = None


class SubcollectionResponse(BaseModel):
    id: str
    collection_id: str
    name: str
    sort_order: int
    publication_count: int
    created_at: datetime
    updated_at: datetime


class SubcollectionListResponse(BaseModel):
    items: list[SubcollectionResponse]


class SubcollectionDeleteResponse(BaseModel):
    deleted: bool
    id: str


class CollectionPublicationAddRequest(BaseModel):
    work_ids: list[str]


class CollectionPublicationReorderRequest(BaseModel):
    ordered_work_ids: list[str]


class CollectionPublicationResponse(BaseModel):
    membership_id: str
    work_id: str
    subcollection_id: str | None = None
    sort_order: int
    title: str
    year: int | None = None
    journal: str | None = None
    citations: int = 0
    doi: str | None = None


class CollectionPublicationsListResponse(BaseModel):
    items: list[CollectionPublicationResponse]


class CollectionMembershipCreatedResponse(BaseModel):
    id: str
    collection_id: str
    subcollection_id: str | None = None
    work_id: str
    sort_order: int


class CollectionPublicationAddResponse(BaseModel):
    items: list[CollectionMembershipCreatedResponse]


class CollectionPublicationRemoveResponse(BaseModel):
    removed: bool
    work_id: str


class CollectionPublicationReorderResponse(BaseModel):
    reordered: bool


class PublicationCollectionSummary(BaseModel):
    id: str
    name: str
    colour: str


class PublicationCollectionsListResponse(BaseModel):
    items: list[PublicationCollectionSummary]
```

- [ ] **Step 2: Commit**

```bash
git add src/research_os/api/schemas.py
git commit -m "feat(collections): add Pydantic request/response schemas"
```

---

## Task 5: API Endpoints

**Files:**
- Modify: `src/research_os/api/app.py`

- [ ] **Step 1: Add import for collection service**

Near the top of app.py, add with the other service imports:

```python
from research_os.services.collection_service import (
    list_collections,
    create_collection,
    update_collection,
    delete_collection,
    reorder_collections,
    list_subcollections,
    create_subcollection,
    update_subcollection,
    delete_subcollection,
    list_collection_publications,
    add_publications_to_collection,
    remove_publication_from_collection,
    reorder_collection_publications,
    list_subcollection_publications,
    list_publication_collections,
)
```

And add the schema imports:

```python
from research_os.api.schemas import (
    # ... existing imports ...
    CollectionCreateRequest,
    CollectionUpdateRequest,
    CollectionReorderRequest,
    CollectionResponse,
    CollectionListResponse,
    CollectionDeleteResponse,
    SubcollectionCreateRequest,
    SubcollectionUpdateRequest,
    SubcollectionResponse,
    SubcollectionListResponse,
    SubcollectionDeleteResponse,
    CollectionPublicationAddRequest,
    CollectionPublicationReorderRequest,
    CollectionPublicationsListResponse,
    CollectionPublicationAddResponse,
    CollectionPublicationRemoveResponse,
    CollectionPublicationReorderResponse,
    PublicationCollectionsListResponse,
)
```

- [ ] **Step 2: Add collection CRUD endpoints**

Add near the end of the file, before any catch-all routes:

```python
# ── Collections ─────────────────────────────────────────────────


@app.get(
    "/v1/collections",
    response_model=CollectionListResponse,
    responses=UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_list_collections(request: Request) -> CollectionListResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        items = list_collections(user_id)
        return CollectionListResponse(items=items)
    except Exception as exc:
        return _build_error_response(exc)


@app.post(
    "/v1/collections",
    response_model=CollectionResponse,
    responses=UNAUTHORIZED_RESPONSES | BAD_REQUEST_RESPONSES,
    tags=["v1"],
)
def v1_create_collection(
    request: Request, body: CollectionCreateRequest
) -> CollectionResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        payload = create_collection(user_id, name=body.name, colour=body.colour)
        return CollectionResponse(**payload)
    except ValueError as exc:
        return _build_bad_request_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.patch(
    "/v1/collections/{collection_id}",
    response_model=CollectionResponse,
    responses=UNAUTHORIZED_RESPONSES | BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_update_collection(
    request: Request, collection_id: str, body: CollectionUpdateRequest
) -> CollectionResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        payload = update_collection(user_id, collection_id, name=body.name, colour=body.colour)
        return CollectionResponse(**payload)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.delete(
    "/v1/collections/{collection_id}",
    response_model=CollectionDeleteResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_delete_collection(
    request: Request, collection_id: str
) -> CollectionDeleteResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        payload = delete_collection(user_id, collection_id)
        return CollectionDeleteResponse(**payload)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.patch(
    "/v1/collections/reorder",
    response_model=CollectionListResponse,
    responses=UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_reorder_collections(
    request: Request, body: CollectionReorderRequest
) -> CollectionListResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        items = reorder_collections(user_id, body.ordered_ids)
        return CollectionListResponse(items=items)
    except Exception as exc:
        return _build_error_response(exc)
```

- [ ] **Step 3: Add subcollection endpoints**

```python
@app.get(
    "/v1/collections/{collection_id}/subcollections",
    response_model=SubcollectionListResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_list_subcollections(
    request: Request, collection_id: str
) -> SubcollectionListResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        items = list_subcollections(user_id, collection_id)
        return SubcollectionListResponse(items=items)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.post(
    "/v1/collections/{collection_id}/subcollections",
    response_model=SubcollectionResponse,
    responses=UNAUTHORIZED_RESPONSES | BAD_REQUEST_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_create_subcollection(
    request: Request, collection_id: str, body: SubcollectionCreateRequest
) -> SubcollectionResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        payload = create_subcollection(user_id, collection_id, name=body.name)
        return SubcollectionResponse(**payload)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.patch(
    "/v1/collections/{collection_id}/subcollections/{subcollection_id}",
    response_model=SubcollectionResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_update_subcollection(
    request: Request, collection_id: str, subcollection_id: str,
    body: SubcollectionUpdateRequest,
) -> SubcollectionResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        payload = update_subcollection(
            user_id, collection_id, subcollection_id, name=body.name
        )
        return SubcollectionResponse(**payload)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.delete(
    "/v1/collections/{collection_id}/subcollections/{subcollection_id}",
    response_model=SubcollectionDeleteResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_delete_subcollection(
    request: Request, collection_id: str, subcollection_id: str,
) -> SubcollectionDeleteResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        payload = delete_subcollection(user_id, collection_id, subcollection_id)
        return SubcollectionDeleteResponse(**payload)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)
```

- [ ] **Step 4: Add collection publication endpoints**

```python
@app.get(
    "/v1/collections/{collection_id}/publications",
    response_model=CollectionPublicationsListResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_list_collection_publications(
    request: Request, collection_id: str
) -> CollectionPublicationsListResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        items = list_collection_publications(user_id, collection_id)
        return CollectionPublicationsListResponse(items=items)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.post(
    "/v1/collections/{collection_id}/publications",
    response_model=CollectionPublicationAddResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_add_collection_publications(
    request: Request, collection_id: str, body: CollectionPublicationAddRequest
) -> CollectionPublicationAddResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        items = add_publications_to_collection(user_id, collection_id, body.work_ids)
        return CollectionPublicationAddResponse(items=items)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.delete(
    "/v1/collections/{collection_id}/publications/{work_id}",
    response_model=CollectionPublicationRemoveResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_remove_collection_publication(
    request: Request, collection_id: str, work_id: str
) -> CollectionPublicationRemoveResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        payload = remove_publication_from_collection(user_id, collection_id, work_id)
        return CollectionPublicationRemoveResponse(**payload)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.patch(
    "/v1/collections/{collection_id}/publications/reorder",
    response_model=CollectionPublicationReorderResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_reorder_collection_publications(
    request: Request, collection_id: str, body: CollectionPublicationReorderRequest
) -> CollectionPublicationReorderResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        payload = reorder_collection_publications(
            user_id, collection_id, body.ordered_work_ids
        )
        return CollectionPublicationReorderResponse(**payload)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)
```

- [ ] **Step 5: Add subcollection publication endpoints**

```python
@app.get(
    "/v1/collections/{collection_id}/subcollections/{subcollection_id}/publications",
    response_model=CollectionPublicationsListResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_list_subcollection_publications(
    request: Request, collection_id: str, subcollection_id: str
) -> CollectionPublicationsListResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        items = list_subcollection_publications(user_id, collection_id, subcollection_id)
        return CollectionPublicationsListResponse(items=items)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.post(
    "/v1/collections/{collection_id}/subcollections/{subcollection_id}/publications",
    response_model=CollectionPublicationAddResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_add_subcollection_publications(
    request: Request, collection_id: str, subcollection_id: str,
    body: CollectionPublicationAddRequest,
) -> CollectionPublicationAddResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        items = add_publications_to_collection(
            user_id, collection_id, body.work_ids, subcollection_id=subcollection_id
        )
        return CollectionPublicationAddResponse(items=items)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.delete(
    "/v1/collections/{collection_id}/subcollections/{subcollection_id}/publications/{work_id}",
    response_model=CollectionPublicationRemoveResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_remove_subcollection_publication(
    request: Request, collection_id: str, subcollection_id: str, work_id: str,
) -> CollectionPublicationRemoveResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        payload = remove_publication_from_collection(
            user_id, collection_id, work_id, subcollection_id=subcollection_id
        )
        return CollectionPublicationRemoveResponse(**payload)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.patch(
    "/v1/collections/{collection_id}/subcollections/{subcollection_id}/publications/reorder",
    response_model=CollectionPublicationReorderResponse,
    responses=UNAUTHORIZED_RESPONSES | NOT_FOUND_RESPONSES,
    tags=["v1"],
)
def v1_reorder_subcollection_publications(
    request: Request, collection_id: str, subcollection_id: str,
    body: CollectionPublicationReorderRequest,
) -> CollectionPublicationReorderResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        payload = reorder_collection_publications(
            user_id, collection_id, body.ordered_work_ids,
            subcollection_id=subcollection_id,
        )
        return CollectionPublicationReorderResponse(**payload)
    except ValueError as exc:
        return _build_not_found_response(str(exc))
    except Exception as exc:
        return _build_error_response(exc)


@app.get(
    "/v1/publications/{work_id}/collections",
    response_model=PublicationCollectionsListResponse,
    responses=UNAUTHORIZED_RESPONSES,
    tags=["v1"],
)
def v1_list_publication_collections(
    request: Request, work_id: str
) -> PublicationCollectionsListResponse | JSONResponse:
    user_id, err = _resolve_request_user_required(request)
    if err:
        return err
    try:
        items = list_publication_collections(user_id, work_id)
        return PublicationCollectionsListResponse(items=items)
    except Exception as exc:
        return _build_error_response(exc)
```

- [ ] **Step 6: Commit**

```bash
git add src/research_os/api/app.py
git commit -m "feat(collections): add 17 API endpoints for collections system"
```

---

## Task 6: Frontend Types and API Client

**Files:**
- Create: `frontend/src/types/collections.ts`
- Create: `frontend/src/lib/collections-api.ts`

- [ ] **Step 1: Create TypeScript types**

Create `frontend/src/types/collections.ts`:

```typescript
export type CollectionColour =
  | 'indigo' | 'amber' | 'emerald' | 'red' | 'violet'
  | 'sky' | 'pink' | 'teal' | 'orange' | 'slate'

export const COLLECTION_COLOUR_HEX: Record<CollectionColour, string> = {
  indigo: '#6366f1',
  amber: '#f59e0b',
  emerald: '#10b981',
  red: '#ef4444',
  violet: '#8b5cf6',
  sky: '#0ea5e9',
  pink: '#ec4899',
  teal: '#14b8a6',
  orange: '#f97316',
  slate: '#64748b',
}

export type CollectionPayload = {
  id: string
  user_id: string
  name: string
  colour: CollectionColour
  sort_order: number
  publication_count: number
  created_at: string
  updated_at: string
}

export type SubcollectionPayload = {
  id: string
  collection_id: string
  name: string
  sort_order: number
  publication_count: number
  created_at: string
  updated_at: string
}

export type CollectionPublicationPayload = {
  membership_id: string
  work_id: string
  subcollection_id: string | null
  sort_order: number
  title: string
  year: number | null
  journal: string | null
  citations: number
  doi: string | null
}

export type PublicationCollectionSummary = {
  id: string
  name: string
  colour: CollectionColour
}
```

- [ ] **Step 2: Create API client**

Create `frontend/src/lib/collections-api.ts`:

```typescript
import { API_BASE_URL } from '@/lib/api'
import { authHeaders, requestJson } from '@/lib/impact-api'
import type {
  CollectionPayload,
  SubcollectionPayload,
  CollectionPublicationPayload,
  PublicationCollectionSummary,
} from '@/types/collections'

// ── Collections ────────────────────────────────────────────

export async function fetchCollections(
  token: string,
): Promise<{ items: CollectionPayload[] }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections`,
    { method: 'GET', headers: authHeaders(token) },
    'Failed to fetch collections',
  )
}

export async function createCollection(
  token: string,
  input: { name: string; colour?: string },
): Promise<CollectionPayload> {
  return requestJson(
    `${API_BASE_URL}/v1/collections`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'Failed to create collection',
  )
}

export async function updateCollection(
  token: string,
  collectionId: string,
  input: { name?: string; colour?: string },
): Promise<CollectionPayload> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'Failed to update collection',
  )
}

export async function deleteCollection(
  token: string,
  collectionId: string,
): Promise<{ deleted: boolean; id: string }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
    'Failed to delete collection',
  )
}

export async function reorderCollections(
  token: string,
  orderedIds: string[],
): Promise<{ items: CollectionPayload[] }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/reorder`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordered_ids: orderedIds }),
    },
    'Failed to reorder collections',
  )
}

// ── Subcollections ─────────────────────────────────────────

export async function fetchSubcollections(
  token: string,
  collectionId: string,
): Promise<{ items: SubcollectionPayload[] }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}/subcollections`,
    { method: 'GET', headers: authHeaders(token) },
    'Failed to fetch subcollections',
  )
}

export async function createSubcollection(
  token: string,
  collectionId: string,
  input: { name: string },
): Promise<SubcollectionPayload> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}/subcollections`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'Failed to create subcollection',
  )
}

export async function updateSubcollection(
  token: string,
  collectionId: string,
  subcollectionId: string,
  input: { name?: string },
): Promise<SubcollectionPayload> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}/subcollections/${encodeURIComponent(subcollectionId)}`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'Failed to update subcollection',
  )
}

export async function deleteSubcollection(
  token: string,
  collectionId: string,
  subcollectionId: string,
): Promise<{ deleted: boolean; id: string }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}/subcollections/${encodeURIComponent(subcollectionId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
    'Failed to delete subcollection',
  )
}

// ── Collection Publications ────────────────────────────────

export async function fetchCollectionPublications(
  token: string,
  collectionId: string,
): Promise<{ items: CollectionPublicationPayload[] }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}/publications`,
    { method: 'GET', headers: authHeaders(token) },
    'Failed to fetch collection publications',
  )
}

export async function addPublicationsToCollection(
  token: string,
  collectionId: string,
  workIds: string[],
): Promise<{ items: { id: string; collection_id: string; work_id: string; sort_order: number }[] }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}/publications`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ work_ids: workIds }),
    },
    'Failed to add publications to collection',
  )
}

export async function removePublicationFromCollection(
  token: string,
  collectionId: string,
  workId: string,
): Promise<{ removed: boolean; work_id: string }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}/publications/${encodeURIComponent(workId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
    'Failed to remove publication from collection',
  )
}

export async function reorderCollectionPublications(
  token: string,
  collectionId: string,
  orderedWorkIds: string[],
): Promise<{ reordered: boolean }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}/publications/reorder`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordered_work_ids: orderedWorkIds }),
    },
    'Failed to reorder publications',
  )
}

// ── Subcollection Publications ─────────────────────────────

export async function fetchSubcollectionPublications(
  token: string,
  collectionId: string,
  subcollectionId: string,
): Promise<{ items: CollectionPublicationPayload[] }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}/subcollections/${encodeURIComponent(subcollectionId)}/publications`,
    { method: 'GET', headers: authHeaders(token) },
    'Failed to fetch subcollection publications',
  )
}

export async function addPublicationsToSubcollection(
  token: string,
  collectionId: string,
  subcollectionId: string,
  workIds: string[],
): Promise<{ items: { id: string; collection_id: string; subcollection_id: string; work_id: string; sort_order: number }[] }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}/subcollections/${encodeURIComponent(subcollectionId)}/publications`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ work_ids: workIds }),
    },
    'Failed to add publications to subcollection',
  )
}

export async function removePublicationFromSubcollection(
  token: string,
  collectionId: string,
  subcollectionId: string,
  workId: string,
): Promise<{ removed: boolean; work_id: string }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${encodeURIComponent(collectionId)}/subcollections/${encodeURIComponent(subcollectionId)}/publications/${encodeURIComponent(workId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
    'Failed to remove publication from subcollection',
  )
}

// ── Publication → Collections lookup ───────────────────────

export async function fetchPublicationCollections(
  token: string,
  workId: string,
): Promise<{ items: PublicationCollectionSummary[] }> {
  return requestJson(
    `${API_BASE_URL}/v1/publications/${encodeURIComponent(workId)}/collections`,
    { method: 'GET', headers: authHeaders(token) },
    'Failed to fetch publication collections',
  )
}
```

- [ ] **Step 3: Verify the `authHeaders` and `requestJson` functions are exported from impact-api.ts**

Check `frontend/src/lib/impact-api.ts` for these exports. If `authHeaders` and `requestJson` are not exported, add `export` to their declarations. If they use different names (e.g., the auth helper is inline), adjust the import in `collections-api.ts` to match the actual pattern.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/collections.ts frontend/src/lib/collections-api.ts
git commit -m "feat(collections): add frontend types and API client"
```

---

## Task 7: Frontend Route Registration

**Files:**
- Modify: `frontend/src/AppRouter.tsx`
- Modify: `frontend/src/pages/profile-publications-page.tsx`

- [ ] **Step 1: Add route in AppRouter.tsx**

Add import at the top:
```typescript
import { ProfileCollectionsPage } from '@/pages/profile-collections-page'
```

Add route after the existing `/profile/publications` route:
```typescript
<Route path="/profile/publications/collections" element={<ProfileCollectionsPage />} />
```

- [ ] **Step 2: Add "My collections" toggle in profile-publications-page.tsx**

Find the existing view toggle section (the `div` containing "My publications" and "My journals" buttons) and add a third button:

```tsx
<button
  className={cn(
    // match existing toggle button styling
  )}
  onClick={() => navigate('/profile/publications/collections')}
>
  My collections
</button>
```

Look for the exact CSS classes used by the existing toggle buttons and replicate them. The button should use `navigate` from `useNavigate()` (already imported in the file).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/AppRouter.tsx frontend/src/pages/profile-publications-page.tsx
git commit -m "feat(collections): add route and navigation toggle"
```

---

## Task 8: Collections Page — Organise Mode

**Files:**
- Create: `frontend/src/pages/profile-collections-page.tsx`

This is the largest task. Build the page with the Organise mode first, then add Browse mode in the next task.

- [ ] **Step 1: Create the page component skeleton**

Create `frontend/src/pages/profile-collections-page.tsx` with:
- Page header matching the publication library (title, view toggles with "My collections" active)
- Mode tabs ("Organise" / "Browse")
- Left sidebar panel (230px) with collection list
- Right panel with publication cards

Reference the prototype HTML at `.superpowers/brainstorm/15684-1774184218/collections-full-mockup.html` for the exact layout and styling.

Key implementation details:
- Use `useNavigate` for the "My publications" / "My journals" toggle buttons to navigate back to `/profile/publications`
- Fetch collections via `fetchCollections()` on mount
- Fetch the user's full publication list via the existing `fetchPersonaState()` API (which returns all works)
- Use the existing `getAuthSessionToken()` for auth

- [ ] **Step 2: Implement the collection sidebar**

The sidebar shows:
- "Collections" header with "+" button
- List of collections with colour dots, names, and publication counts
- Three-dot menu on hover (rename, change colour, delete)
- Inline create form when "+" is clicked
- Colour palette popover for creation and colour changes

Colour dot rendering — map colour name to hex:
```tsx
import { COLLECTION_COLOUR_HEX } from '@/types/collections'

// In JSX:
<div
  className="h-2 w-2 rounded-full flex-shrink-0"
  style={{ backgroundColor: COLLECTION_COLOUR_HEX[collection.colour] }}
/>
```

- [ ] **Step 3: Implement the publication cards list**

The right panel shows:
- Header with title ("All publications" / "Uncollected") and filter toggle
- Search box
- Publication cards with: drag handle (⠿), title, journal + year, colour dot badges, citations count
- Each card has `draggable="true"` attribute

Colour dot badges on each card — fetch `fetchPublicationCollections()` for each publication, or batch this by fetching all collections and memberships upfront to build a lookup map.

Efficient approach: after fetching collections, fetch all memberships for all collections and build a `Map<workId, CollectionSummary[]>` in memory.

- [ ] **Step 4: Implement drag-and-drop — adding to collections**

Use the HTML5 Drag and Drop API:

```tsx
// On publication card:
onDragStart={(e) => {
  e.dataTransfer.setData('text/plain', work.id)
  e.dataTransfer.effectAllowed = 'copy'
  setDraggingWorkId(work.id)
}}
onDragEnd={() => setDraggingWorkId(null)}

// On collection sidebar item:
onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
onDragEnter={(e) => { e.preventDefault(); setDropTargetId(collection.id) }}
onDragLeave={() => setDropTargetId(null)}
onDrop={(e) => {
  e.preventDefault()
  setDropTargetId(null)
  const workId = e.dataTransfer.getData('text/plain')
  handleAddToCollection(collection.id, workId)
}}
```

`handleAddToCollection` should:
1. Optimistically add the colour dot badge to the card
2. Call `addPublicationsToCollection(token, collectionId, [workId])`
3. Show toast "Added to [collection name]"
4. On error: revert optimistic update, show error toast

- [ ] **Step 5: Implement filter toggle (All / Uncollected)**

```tsx
const [filter, setFilter] = useState<'all' | 'uncollected'>('all')

const filteredWorks = useMemo(() => {
  if (filter === 'uncollected') {
    return allWorks.filter(w => !workCollectionsMap.has(w.id) || workCollectionsMap.get(w.id)!.length === 0)
  }
  return allWorks
}, [allWorks, workCollectionsMap, filter])
```

- [ ] **Step 6: Implement toast notifications**

Use a simple state-based toast:
```tsx
const [toast, setToast] = useState<string | null>(null)

useEffect(() => {
  if (toast) {
    const timer = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(timer)
  }
}, [toast])
```

Render a fixed-position toast bar at the bottom of the viewport.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/profile-collections-page.tsx
git commit -m "feat(collections): add collections page with Organise mode"
```

---

## Task 9: Collections Page — Browse Mode

**Files:**
- Modify: `frontend/src/pages/profile-collections-page.tsx`

- [ ] **Step 1: Add Browse mode layout**

When mode is `'browse'`, render:
- Left sidebar (same collection list, but clicking selects instead of being a drop target)
- Middle panel (185px) showing subcollections for the selected collection
- Right panel showing publications in the selected collection/subcollection

State to add:
```tsx
const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
const [selectedSubcollectionId, setSelectedSubcollectionId] = useState<string | null>(null)
const [subcollections, setSubcollections] = useState<SubcollectionPayload[]>([])
const [collectionPubs, setCollectionPubs] = useState<CollectionPublicationPayload[]>([])
```

- [ ] **Step 2: Implement subcollection panel**

- "All papers" entry at top (always present, shows total distinct count)
- Subcollection entries with counts
- "+ Add subcollection" link at bottom
- Inline create form
- Three-dot menu for rename/delete

When "All papers" is selected (`selectedSubcollectionId === null`), fetch via `fetchCollectionPublications()`.
When a subcollection is selected, fetch via `fetchSubcollectionPublications()`.

- [ ] **Step 3: Implement drag-to-reorder within a collection**

In Browse mode, publication cards can be dragged to reorder:

```tsx
onDragOver={(e) => {
  e.preventDefault()
  // Calculate insertion position based on mouse Y relative to card positions
  // Show insertion indicator line
}}
onDrop={(e) => {
  // Compute new order, call reorderCollectionPublications()
}}
```

Track insertion index in state. Render a visual indicator (thin coloured line) between cards at the insertion point.

After drop:
1. Optimistically reorder the list
2. Call `reorderCollectionPublications(token, collectionId, newOrderedWorkIds)`
3. On error: revert to previous order

- [ ] **Step 4: Implement drag between subcollections**

When dragging a publication card over a subcollection name in the middle panel:
1. Highlight the subcollection as a drop target
2. On drop: call `addPublicationsToSubcollection()` for the target, and optionally `removePublicationFromSubcollection()` from the source
3. Refresh the publication list

- [ ] **Step 5: Implement clicking a publication to open drilldown**

When a publication card is clicked (not dragged), navigate to the publications page with the publication selected:

```tsx
onClick={() => navigate(`/profile/publications?selectedWorkId=${work.work_id}`)}
```

This requires the publications page to read `selectedWorkId` from the URL search params and auto-select that work. Check if this is already supported in `profile-publications-page.tsx` — look for `useSearchParams` usage. If not, add it.

- [ ] **Step 6: Implement empty states**

Three empty states from the spec:
1. No collections yet → centred message with "Create collection" button
2. Empty collection → "No papers in this collection" with hint
3. Uncollected filter, all organised → "All papers organised"

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/profile-collections-page.tsx
git commit -m "feat(collections): add Browse mode with subcollections and reordering"
```

---

## Task 10: Collection Management UI (CRUD)

**Files:**
- Modify: `frontend/src/pages/profile-collections-page.tsx`

- [ ] **Step 1: Implement inline collection creation**

When "+" is clicked:
- Append a temporary "editing" entry at the bottom of the collection list
- Show a text input with auto-focus
- On Enter: call `createCollection(token, { name, colour })`, refresh collections list
- On Escape or blur: cancel

- [ ] **Step 2: Implement colour picker popover**

A small popover showing 10 colour circles in a 5×2 grid. Used during:
- Collection creation (appears next to the name input)
- "Change colour" from the three-dot menu

```tsx
const COLOURS: CollectionColour[] = [
  'indigo', 'amber', 'emerald', 'red', 'violet',
  'sky', 'pink', 'teal', 'orange', 'slate',
]
```

Render each as a clickable circle with the hex colour. Selected colour gets a ring/checkmark.

- [ ] **Step 3: Implement three-dot context menu**

On hover over a collection item, show ··· button. On click, show a small menu with:
- Rename
- Change colour
- Delete

For "Rename": switch the name to an inline input (same pattern as creation).
For "Change colour": open the colour picker popover.
For "Delete": show a confirmation dialog, then call `deleteCollection()`.

- [ ] **Step 4: Implement subcollection creation and management**

Same patterns as collections but in the subcollection panel:
- "+ Add subcollection" → inline input
- Three-dot menu with Rename / Delete
- No colour picker (subcollections inherit parent colour)

- [ ] **Step 5: Implement collection removal (dot badge click)**

In Organise mode, clicking a colour dot badge on a publication card should:
1. Show a small confirmation tooltip: "Remove from [collection name]?"
2. On confirm: call `removePublicationFromCollection()`
3. Remove the dot badge optimistically

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/profile-collections-page.tsx
git commit -m "feat(collections): add collection CRUD UI — create, rename, colour, delete"
```

---

## Task 11: Polish and Final Integration

**Files:**
- Modify: `frontend/src/pages/profile-collections-page.tsx`
- Modify: `frontend/src/pages/profile-publications-page.tsx`

- [ ] **Step 1: Style the "My collections" toggle to match existing toggles**

Ensure the toggle button in `profile-publications-page.tsx` uses exactly the same classes as "My publications" and "My journals". The active state should show when on the `/profile/publications/collections` route.

In `profile-collections-page.tsx`, the "My publications" and "My journals" buttons should navigate back to `/profile/publications` and be styled as inactive.

- [ ] **Step 2: Add search functionality in Organise mode**

Filter publications by title, journal, or year as the user types:

```tsx
const [searchQuery, setSearchQuery] = useState('')

const searchFilteredWorks = useMemo(() => {
  if (!searchQuery.trim()) return filteredWorks
  const q = searchQuery.toLowerCase()
  return filteredWorks.filter(w =>
    w.title?.toLowerCase().includes(q) ||
    w.journal?.toLowerCase().includes(q) ||
    String(w.year).includes(q)
  )
}, [filteredWorks, searchQuery])
```

- [ ] **Step 3: Add multi-select support**

Track selected work IDs in state:
```tsx
const [selectedWorkIds, setSelectedWorkIds] = useState<Set<string>>(new Set())
```

- Ctrl/Cmd-click toggles individual selection
- Shift-click selects a range
- Selected cards get a highlighted border
- When dragging a selected card, all selected cards are included in the drag

For drag data with multi-select:
```tsx
e.dataTransfer.setData('text/plain', JSON.stringify([...selectedWorkIds]))
```

And on drop, parse the array and call `addPublicationsToCollection()` with all IDs.

- [ ] **Step 4: Final visual polish**

- Ensure drag ghost (the visual element shown while dragging) looks clean — use `e.dataTransfer.setDragImage()` if the default is messy
- Ensure drop target highlight is visible and distinct (dashed indigo border per spec)
- Ensure smooth transitions when cards are added/removed
- Test that the toast appears and disappears cleanly
- Verify the page looks correct at different viewport widths

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/profile-collections-page.tsx frontend/src/pages/profile-publications-page.tsx
git commit -m "feat(collections): polish UI — search, multi-select, transitions"
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Database models | 10 min |
| 2 | Alembic migration | 10 min |
| 3 | Service layer | 20 min |
| 4 | API schemas | 10 min |
| 5 | API endpoints | 20 min |
| 6 | Frontend types + API client | 15 min |
| 7 | Route registration + navigation toggle | 10 min |
| 8 | Collections page — Organise mode | 45 min |
| 9 | Collections page — Browse mode | 45 min |
| 10 | Collection management UI (CRUD) | 30 min |
| 11 | Polish and final integration | 30 min |

**Total estimated: ~4 hours**

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
    """Delete a subcollection, moving its publications back to the parent collection."""
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
        # Null out subcollection_id on memberships so they fall back to the parent collection
        session.execute(
            update(CollectionMembership)
            .where(CollectionMembership.subcollection_id == subcollection_id)
            .values(subcollection_id=None)
            .execution_options(synchronize_session=False)
        )
        session.expire(sub)
        session.delete(sub)
        return {"deleted": True, "id": subcollection_id}


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
            sub_filter = (
                CollectionMembership.subcollection_id.is_(None)
                if subcollection_id is None
                else CollectionMembership.subcollection_id == subcollection_id
            )
            existing = session.execute(
                select(CollectionMembership)
                .where(
                    CollectionMembership.collection_id == collection_id,
                    sub_filter,
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


def move_publication_subcollection(
    user_id: str,
    collection_id: str,
    membership_id: str,
    target_subcollection_id: str | None,
) -> dict[str, Any]:
    """Move a publication membership to a different subcollection (or to top level if None)."""
    with session_scope() as session:
        collection = session.execute(
            select(Collection).where(
                Collection.id == collection_id,
                Collection.user_id == user_id,
            )
        ).scalar_one_or_none()
        if not collection:
            raise ValueError("Collection not found")

        membership = session.execute(
            select(CollectionMembership).where(
                CollectionMembership.id == membership_id,
                CollectionMembership.collection_id == collection_id,
            )
        ).scalar_one_or_none()
        if not membership:
            raise ValueError("Membership not found")

        if target_subcollection_id is not None:
            subcollection = session.execute(
                select(Subcollection).where(
                    Subcollection.id == target_subcollection_id,
                    Subcollection.collection_id == collection_id,
                )
            ).scalar_one_or_none()
            if not subcollection:
                raise ValueError("Subcollection not found in this collection")

        membership.subcollection_id = target_subcollection_id
        session.flush()
        return {
            "membership_id": membership.id,
            "work_id": membership.work_id,
            "collection_id": membership.collection_id,
            "subcollection_id": membership.subcollection_id,
            "sort_order": membership.sort_order,
        }

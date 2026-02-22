from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import math
import re
from statistics import mean
from typing import Any

from sqlalchemy import select

from research_os.clients.openai_client import get_client
from research_os.db import (
    Author,
    CollaboratorEdge,
    Embedding,
    MetricsSnapshot,
    User,
    Work,
    WorkAuthorship,
    create_all_tables,
    session_scope,
)
from research_os.services.metrics_provider_service import get_metrics_provider

DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
FALLBACK_EMBEDDING_MODEL = "local-hash-1"
TOKEN_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9\-]{2,}")
STOP_WORDS = {
    "and",
    "for",
    "the",
    "with",
    "from",
    "study",
    "analysis",
    "using",
    "pulmonary",
    "hypertension",
    "cardiovascular",
    "imaging",
}


class PersonaValidationError(RuntimeError):
    pass


class PersonaNotFoundError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_title(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _normalize_doi(value: str | None) -> str | None:
    clean = re.sub(r"\s+", "", (value or "").strip()).lower()
    if not clean:
        return None
    if clean.startswith("https://doi.org/"):
        return clean.removeprefix("https://doi.org/")
    return clean


def _normalize_keywords(value: Any) -> list[str]:
    if isinstance(value, list):
        raw = value
    elif isinstance(value, str):
        raw = [item.strip() for item in value.split(",")]
    else:
        raw = []
    keywords: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = re.sub(r"\s+", " ", str(item).strip())
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        keywords.append(text)
    return keywords


def _resolve_user_or_raise(session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise PersonaNotFoundError(f"User '{user_id}' was not found.")
    return user


def _find_existing_work(session, *, user_id: str, doi: str | None, title_lower: str, year: int | None) -> Work | None:
    if doi:
        by_doi = session.scalars(
            select(Work).where(Work.user_id == user_id, Work.doi == doi)
        ).first()
        if by_doi is not None:
            return by_doi
    if title_lower:
        by_title = session.scalars(
            select(Work).where(
                Work.user_id == user_id,
                Work.title_lower == title_lower,
                Work.year == year,
            )
        ).first()
        if by_title is not None:
            return by_title
    return None


def _normalize_author_name(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _author_name_key(value: str) -> str:
    return _normalize_author_name(value).lower()


def _upsert_author(session, *, canonical_name: str, orcid_id: str | None = None) -> Author:
    clean_name = _normalize_author_name(canonical_name)
    if not clean_name:
        raise PersonaValidationError("Author name cannot be empty.")
    clean_orcid = re.sub(r"\s+", "", (orcid_id or "").strip()) or None

    if clean_orcid:
        author = session.scalars(select(Author).where(Author.orcid_id == clean_orcid)).first()
        if author is not None:
            author.canonical_name = clean_name
            author.canonical_name_lower = _author_name_key(clean_name)
            return author

    key = _author_name_key(clean_name)
    author = session.scalars(
        select(Author).where(Author.canonical_name_lower == key)
    ).first()
    if author is not None:
        if clean_orcid and not author.orcid_id:
            author.orcid_id = clean_orcid
        author.canonical_name = clean_name
        return author

    author = Author(
        canonical_name=clean_name,
        canonical_name_lower=key,
        orcid_id=clean_orcid,
    )
    session.add(author)
    session.flush()
    return author


def upsert_work(
    *,
    user_id: str,
    work: dict[str, Any],
    provenance: str,
    overwrite_user_metadata: bool = False,
) -> dict[str, Any]:
    create_all_tables()
    title = _normalize_title(str(work.get("title", "")))
    if not title:
        raise PersonaValidationError("Work title is required.")
    title_lower = title.lower()
    year_raw = work.get("year")
    year = int(year_raw) if str(year_raw).strip().isdigit() else None
    doi = _normalize_doi(work.get("doi"))
    authors = work.get("authors", [])
    if not isinstance(authors, list):
        authors = []

    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        existing = _find_existing_work(
            session,
            user_id=user.id,
            doi=doi,
            title_lower=title_lower,
            year=year,
        )

        mutable_fields = {
            "title": title,
            "title_lower": title_lower,
            "year": year,
            "doi": doi,
            "work_type": re.sub(r"\s+", " ", str(work.get("work_type", "")).strip()),
            "venue_name": re.sub(r"\s+", " ", str(work.get("venue_name", "")).strip()),
            "publisher": re.sub(r"\s+", " ", str(work.get("publisher", "")).strip()),
            "abstract": re.sub(r"\s+", " ", str(work.get("abstract", "")).strip()) or None,
            "keywords": _normalize_keywords(work.get("keywords")),
            "url": str(work.get("url", "")).strip(),
            "provenance": provenance,
        }

        if existing is None:
            existing = Work(
                user_id=user.id,
                title=mutable_fields["title"],
                title_lower=mutable_fields["title_lower"],
                year=mutable_fields["year"],
                doi=mutable_fields["doi"],
                work_type=mutable_fields["work_type"],
                venue_name=mutable_fields["venue_name"],
                publisher=mutable_fields["publisher"],
                abstract=mutable_fields["abstract"],
                keywords=mutable_fields["keywords"],
                url=mutable_fields["url"],
                provenance=mutable_fields["provenance"] or "manual",
            )
            session.add(existing)
            session.flush()
        else:
            if overwrite_user_metadata or not existing.user_edited:
                existing.title = mutable_fields["title"]
                existing.title_lower = mutable_fields["title_lower"]
                existing.year = mutable_fields["year"]
                existing.work_type = mutable_fields["work_type"]
                existing.venue_name = mutable_fields["venue_name"]
                existing.publisher = mutable_fields["publisher"]
                existing.abstract = mutable_fields["abstract"]
                existing.keywords = mutable_fields["keywords"]
                existing.url = mutable_fields["url"]
            if doi and not existing.doi:
                existing.doi = doi
            existing.provenance = mutable_fields["provenance"] or existing.provenance

        if authors:
            existing_authorships = session.scalars(
                select(WorkAuthorship).where(WorkAuthorship.work_id == existing.id)
            ).all()
            by_author_id = {item.author_id: item for item in existing_authorships}
            seen_author_ids: set[str] = set()

            for index, author_item in enumerate(authors, start=1):
                if not isinstance(author_item, dict):
                    continue
                author_name = _normalize_author_name(str(author_item.get("name", "")))
                if not author_name:
                    continue
                author_orcid = re.sub(
                    r"\s+", "", str(author_item.get("orcid_id", "")).strip()
                ) or None
                author = _upsert_author(
                    session,
                    canonical_name=author_name,
                    orcid_id=author_orcid,
                )
                seen_author_ids.add(author.id)
                is_user = bool(user.orcid_id and author.orcid_id == user.orcid_id) or (
                    _author_name_key(author_name) == _author_name_key(user.name)
                )
                link = by_author_id.get(author.id)
                if link is None:
                    session.add(
                        WorkAuthorship(
                            work_id=existing.id,
                            author_id=author.id,
                            author_order=index,
                            is_user=is_user,
                        )
                    )
                else:
                    link.author_order = index
                    link.is_user = is_user
            for link in existing_authorships:
                if link.author_id not in seen_author_ids:
                    session.delete(link)

        session.flush()
        return {
            "id": existing.id,
            "title": existing.title,
            "year": existing.year,
            "doi": existing.doi,
            "work_type": existing.work_type,
            "provenance": existing.provenance,
            "updated_at": existing.updated_at,
        }


def list_works(*, user_id: str) -> list[dict[str, Any]]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        works = session.scalars(
            select(Work).where(Work.user_id == user_id).order_by(Work.year.desc(), Work.updated_at.desc())
        ).all()
        payload: list[dict[str, Any]] = []
        for work in works:
            payload.append(
                {
                    "id": work.id,
                    "title": work.title,
                    "year": work.year,
                    "doi": work.doi,
                    "work_type": work.work_type,
                    "venue_name": work.venue_name,
                    "publisher": work.publisher,
                    "abstract": work.abstract,
                    "keywords": list(work.keywords or []),
                    "url": work.url,
                    "provenance": work.provenance,
                    "cluster_id": work.cluster_id,
                    "created_at": work.created_at,
                    "updated_at": work.updated_at,
                }
            )
        return payload


def recompute_collaborator_edges(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        user = _resolve_user_or_raise(session, user_id)
        works = session.scalars(select(Work).where(Work.user_id == user.id)).all()
        work_ids = [work.id for work in works]
        if not work_ids:
            session.scalars(
                select(CollaboratorEdge).where(CollaboratorEdge.user_id == user.id)
            ).all()
            return {
                "core_collaborators": [],
                "new_collaborators_by_year": {},
            }

        authorships = session.scalars(
            select(WorkAuthorship).where(WorkAuthorship.work_id.in_(work_ids))
        ).all()
        work_year_by_id = {work.id: work.year for work in works}
        edge_data: dict[str, dict[str, Any]] = {}
        for link in authorships:
            if link.is_user:
                continue
            bucket = edge_data.setdefault(
                link.author_id,
                {"n_shared_works": 0, "first_year": None, "last_year": None},
            )
            bucket["n_shared_works"] += 1
            year = work_year_by_id.get(link.work_id)
            if isinstance(year, int):
                if bucket["first_year"] is None or year < bucket["first_year"]:
                    bucket["first_year"] = year
                if bucket["last_year"] is None or year > bucket["last_year"]:
                    bucket["last_year"] = year

        existing_edges = session.scalars(
            select(CollaboratorEdge).where(CollaboratorEdge.user_id == user.id)
        ).all()
        by_author = {edge.collaborator_author_id: edge for edge in existing_edges}
        seen_author_ids: set[str] = set()
        for author_id, values in edge_data.items():
            seen_author_ids.add(author_id)
            edge = by_author.get(author_id)
            if edge is None:
                edge = CollaboratorEdge(
                    user_id=user.id,
                    collaborator_author_id=author_id,
                )
                session.add(edge)
            edge.n_shared_works = int(values["n_shared_works"] or 0)
            edge.first_year = values["first_year"]
            edge.last_year = values["last_year"]

        for edge in existing_edges:
            if edge.collaborator_author_id not in seen_author_ids:
                session.delete(edge)

        session.flush()

        collaborator_names = {
            author.id: author.canonical_name
            for author in session.scalars(
                select(Author).where(Author.id.in_(list(edge_data.keys()) or [""]))
            ).all()
        }
        ordered_core = sorted(
            edge_data.items(),
            key=lambda item: item[1]["n_shared_works"],
            reverse=True,
        )[:10]
        core_collaborators = [
            {
                "author_id": author_id,
                "name": collaborator_names.get(author_id, "Unknown"),
                "n_shared_works": int(values["n_shared_works"]),
                "first_year": values["first_year"],
                "last_year": values["last_year"],
            }
            for author_id, values in ordered_core
        ]

        by_year: dict[int, int] = defaultdict(int)
        for values in edge_data.values():
            year = values.get("first_year")
            if isinstance(year, int):
                by_year[year] += 1
        return {
            "core_collaborators": core_collaborators,
            "new_collaborators_by_year": dict(sorted(by_year.items())),
        }


def list_collaborators(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        edges = session.scalars(
            select(CollaboratorEdge).where(CollaboratorEdge.user_id == user_id).order_by(CollaboratorEdge.n_shared_works.desc())
        ).all()
        author_ids = [edge.collaborator_author_id for edge in edges]
        authors = session.scalars(select(Author).where(Author.id.in_(author_ids or [""]))).all()
        author_name = {author.id: author.canonical_name for author in authors}

        collaborators = [
            {
                "author_id": edge.collaborator_author_id,
                "name": author_name.get(edge.collaborator_author_id, "Unknown"),
                "n_shared_works": edge.n_shared_works,
                "first_year": edge.first_year,
                "last_year": edge.last_year,
            }
            for edge in edges
        ]
        new_by_year: dict[int, int] = defaultdict(int)
        for item in collaborators:
            if isinstance(item["first_year"], int):
                new_by_year[item["first_year"]] += 1
        return {
            "collaborators": collaborators,
            "new_collaborators_by_year": dict(sorted(new_by_year.items())),
        }


def _latest_metrics_by_work(session, work_ids: list[str]) -> dict[str, MetricsSnapshot]:
    rows = session.scalars(
        select(MetricsSnapshot)
        .where(MetricsSnapshot.work_id.in_(work_ids or [""]))
        .order_by(MetricsSnapshot.work_id, MetricsSnapshot.captured_at.desc())
    ).all()
    latest: dict[str, MetricsSnapshot] = {}
    for row in rows:
        if row.work_id in latest:
            continue
        latest[row.work_id] = row
    return latest


def sync_metrics(*, user_id: str, providers: list[str]) -> dict[str, Any]:
    create_all_tables()
    normalized = [item.strip().lower() for item in providers if item.strip()]
    selected = normalized or ["openalex", "semantic_scholar", "manual"]
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
        synced = 0
        provider_counts: dict[str, int] = defaultdict(int)
        for work in works:
            work_payload = {
                "title": work.title,
                "doi": work.doi,
                "year": work.year,
                "work_type": work.work_type,
            }
            for provider_name in selected:
                provider = get_metrics_provider(provider_name)
                metrics = provider.fetch_metrics(work_payload)
                snapshot = MetricsSnapshot(
                    work_id=work.id,
                    provider=str(metrics.get("provider", provider.provider_name)),
                    citations_count=int(metrics.get("citations_count", 0) or 0),
                    influential_citations=(
                        int(metrics["influential_citations"])
                        if metrics.get("influential_citations") is not None
                        else None
                    ),
                    altmetric_score=(
                        float(metrics["altmetric_score"])
                        if metrics.get("altmetric_score") is not None
                        else None
                    ),
                    metric_payload=dict(metrics.get("payload_subset", {}) or {}),
                    captured_at=_utcnow(),
                )
                session.add(snapshot)
                synced += 1
                provider_counts[snapshot.provider] += 1
        session.flush()

    collaboration = recompute_collaborator_edges(user_id=user_id)
    return {
        "synced_snapshots": synced,
        "provider_attribution": dict(provider_counts),
        "core_collaborators": collaboration["core_collaborators"],
    }


def _local_embedding(text: str, size: int = 96) -> list[float]:
    vector = [0.0] * size
    tokens = [token.lower() for token in TOKEN_PATTERN.findall(text or "")]
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        for index in range(size):
            vector[index] += digest[index % len(digest)] / 255.0
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def _embed_text(text: str, preferred_model: str = DEFAULT_EMBEDDING_MODEL) -> tuple[list[float], str]:
    clean = re.sub(r"\s+", " ", text).strip()
    if not clean:
        return [], FALLBACK_EMBEDDING_MODEL
    try:
        client = get_client()
        response = client.embeddings.create(model=preferred_model, input=clean)
        vector = list(response.data[0].embedding)
        return [float(value) for value in vector], preferred_model
    except Exception:
        return _local_embedding(clean), FALLBACK_EMBEDDING_MODEL


def _work_theme_key(work: Work) -> str:
    text = f"{work.title} {work.abstract or ''} {' '.join(work.keywords or [])}"
    tokens = [token.lower() for token in TOKEN_PATTERN.findall(text)]
    filtered = [token for token in tokens if token not in STOP_WORDS]
    if not filtered:
        return "general"
    counts = Counter(filtered)
    return counts.most_common(1)[0][0]


def _label_theme_from_text(cluster_key: str, titles: list[str]) -> str:
    candidate = cluster_key.replace("-", " ").strip().title()
    if len(candidate) >= 4:
        return candidate
    if titles:
        token = TOKEN_PATTERN.findall(titles[0])
        if token:
            return token[0].title()
    return "General"


def generate_embeddings(*, user_id: str, model_name: str = DEFAULT_EMBEDDING_MODEL) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
        generated = 0
        actual_model = model_name
        for work in works:
            source_text = f"{work.title}\n{work.abstract or ''}".strip()
            if not source_text:
                continue
            vector, used_model = _embed_text(source_text, preferred_model=model_name)
            actual_model = used_model
            existing = session.scalars(
                select(Embedding).where(
                    Embedding.work_id == work.id,
                    Embedding.model_name == used_model,
                )
            ).first()
            if existing is None:
                existing = Embedding(
                    work_id=work.id,
                    model_name=used_model,
                    embedding_vector=vector,
                )
                session.add(existing)
            else:
                existing.embedding_vector = vector
                existing.created_at = _utcnow()
            generated += 1

        session.flush()
        clustered = _cluster_themes_in_session(session, user_id)
        return {
            "generated_embeddings": generated,
            "model_name": actual_model,
            "clusters": clustered,
        }


def _cluster_themes_in_session(session, user_id: str) -> list[dict[str, Any]]:
    works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
    grouped: dict[str, list[Work]] = defaultdict(list)
    for work in works:
        key = _work_theme_key(work)
        cluster_id = f"cluster-{re.sub(r'[^a-z0-9]+', '-', key.lower()).strip('-') or 'general'}"
        work.cluster_id = cluster_id
        grouped[cluster_id].append(work)

    work_ids = [work.id for work in works]
    latest = _latest_metrics_by_work(session, work_ids)
    payload: list[dict[str, Any]] = []
    for cluster_id, cluster_works in grouped.items():
        citations = [int(latest[work.id].citations_count) for work in cluster_works if work.id in latest]
        label = _label_theme_from_text(
            cluster_id.removeprefix("cluster-"),
            [work.title for work in cluster_works],
        )
        payload.append(
            {
                "cluster_id": cluster_id,
                "label": label,
                "n_works": len(cluster_works),
                "citation_mean": round(mean(citations), 3) if citations else 0.0,
            }
        )
    payload.sort(key=lambda item: item["n_works"], reverse=True)
    return payload


def get_themes(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        clusters = _cluster_themes_in_session(session, user_id)
        return {"clusters": clusters}


def get_persona_context(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
        work_ids = [work.id for work in works]
        latest = _latest_metrics_by_work(session, work_ids)
        themes = _cluster_themes_in_session(session, user_id)
        dominant_themes = [item["label"] for item in themes[:3]]

        study_types = Counter([work.work_type for work in works if work.work_type])
        top_venues = Counter([work.venue_name for work in works if work.venue_name])
        collaborators_payload = list_collaborators(user_id=user_id)
        frequent_collaborators = [
            item["name"] for item in collaborators_payload["collaborators"][:5]
        ]

        method_markers = Counter()
        for work in works:
            text = f"{work.title} {work.abstract or ''}".lower()
            if "cox" in text:
                method_markers["Cox modelling"] += 1
            if "regression" in text:
                method_markers["Regression modelling"] += 1
            if "mixed-effects" in text or "mixed effects" in text:
                method_markers["Mixed-effects modelling"] += 1
            if "diagnostic" in text:
                method_markers["Diagnostic accuracy"] += 1
        methodological_patterns = [item[0] for item in method_markers.most_common(5)]

        supporting_works = sorted(
            works,
            key=lambda work: int(latest[work.id].citations_count) if work.id in latest else 0,
            reverse=True,
        )[:8]
        cited_works = [
            {
                "work_id": work.id,
                "title": work.title,
                "year": work.year,
                "doi": work.doi,
            }
            for work in supporting_works
        ]

        return {
            "dominant_themes": dominant_themes,
            "common_study_types": [item[0] for item in study_types.most_common(5)],
            "top_venues": [item[0] for item in top_venues.most_common(5)],
            "frequent_collaborators": frequent_collaborators,
            "methodological_patterns": methodological_patterns,
            "works_used": cited_works,
        }


def persona_timeline(*, user_id: str) -> list[dict[str, Any]]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
        latest = _latest_metrics_by_work(session, [work.id for work in works])
        timeline: dict[int, dict[str, Any]] = defaultdict(lambda: {"year": 0, "n_works": 0, "citations": 0})
        for work in works:
            if not isinstance(work.year, int):
                continue
            row = timeline[work.year]
            row["year"] = work.year
            row["n_works"] += 1
            row["citations"] += int(latest[work.id].citations_count) if work.id in latest else 0
        return [timeline[year] for year in sorted(timeline.keys())]


def serialise_metrics_distribution(*, user_id: str) -> dict[str, Any]:
    create_all_tables()
    with session_scope() as session:
        _resolve_user_or_raise(session, user_id)
        works = session.scalars(select(Work).where(Work.user_id == user_id)).all()
        latest = _latest_metrics_by_work(session, [work.id for work in works])
        rows = []
        for work in works:
            citations = int(latest[work.id].citations_count) if work.id in latest else 0
            rows.append(
                {
                    "work_id": work.id,
                    "title": work.title,
                    "year": work.year,
                    "citations": citations,
                    "provider": latest[work.id].provider if work.id in latest else "none",
                }
            )
        rows.sort(key=lambda item: item["citations"], reverse=True)

        histogram = {"0": 0, "1-9": 0, "10-49": 0, "50+": 0}
        for row in rows:
            value = row["citations"]
            if value == 0:
                histogram["0"] += 1
            elif value < 10:
                histogram["1-9"] += 1
            elif value < 50:
                histogram["10-49"] += 1
            else:
                histogram["50+"] += 1
        return {"works": rows, "histogram": histogram}


def dump_persona_state(*, user_id: str) -> dict[str, Any]:
    return {
        "works": list_works(user_id=user_id),
        "collaborators": list_collaborators(user_id=user_id),
        "themes": get_themes(user_id=user_id),
        "timeline": persona_timeline(user_id=user_id),
        "metrics": serialise_metrics_distribution(user_id=user_id),
        "context": get_persona_context(user_id=user_id),
    }

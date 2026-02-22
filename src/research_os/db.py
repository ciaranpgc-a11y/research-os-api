from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Float,
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_database_url(database_url: str) -> str:
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


def get_database_url() -> str:
    raw_database_url = os.getenv("DATABASE_URL", "sqlite+pysqlite:///./research_os.db")
    return _normalize_database_url(raw_database_url)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    title: Mapped[str] = mapped_column(String(255))
    target_journal: Mapped[str] = mapped_column(String(128))
    journal_voice: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language: Mapped[str] = mapped_column(String(24), default="en-GB")
    study_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    study_brief: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    manuscripts: Mapped[list["Manuscript"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    generation_jobs: Mapped[list["GenerationJob"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    data_assets: Mapped[list["DataLibraryAsset"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    name: Mapped[str] = mapped_column(String(255), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    role: Mapped[str] = mapped_column(String(16), default="user")
    orcid_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    google_sub: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    microsoft_sub: Mapped[str | None] = mapped_column(
        String(128), nullable=True, index=True
    )
    orcid_access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    orcid_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    orcid_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    impact_last_computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    orcid_last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    two_factor_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    two_factor_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    two_factor_backup_codes: Mapped[list[str]] = mapped_column(JSON, default=list)
    two_factor_confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    works: Mapped[list["Work"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    collaborator_edges: Mapped[list["CollaboratorEdge"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    impact_snapshots: Mapped[list["ImpactSnapshot"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    orcid_states: Mapped[list["OrcidOAuthState"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    oauth_login_states: Mapped[list["AuthOAuthState"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    login_challenges: Mapped[list["AuthLoginChallenge"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped[User] = relationship(back_populates="sessions")


class AuthLoginChallenge(Base):
    __tablename__ = "auth_login_challenges"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    challenge_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped[User] = relationship(back_populates="login_challenges")


class OrcidOAuthState(Base):
    __tablename__ = "orcid_oauth_states"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    state_token: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped[User] = relationship(back_populates="orcid_states")


class AuthOAuthState(Base):
    __tablename__ = "auth_oauth_states"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    provider: Mapped[str] = mapped_column(String(32), index=True)
    state_token: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped[User | None] = relationship(back_populates="oauth_login_states")


class Manuscript(Base):
    __tablename__ = "manuscripts"
    __table_args__ = (UniqueConstraint("project_id", "branch_name"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE")
    )
    branch_name: Mapped[str] = mapped_column(String(128), default="main")
    status: Mapped[str] = mapped_column(String(32), default="draft")
    sections: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    project: Mapped[Project] = relationship(back_populates="manuscripts")
    snapshots: Mapped[list["ManuscriptSnapshot"]] = relationship(
        back_populates="manuscript", cascade="all, delete-orphan"
    )
    generation_jobs: Mapped[list["GenerationJob"]] = relationship(
        back_populates="manuscript", cascade="all, delete-orphan"
    )
    asset_links: Mapped[list["ManuscriptAssetLink"]] = relationship(
        back_populates="manuscript", cascade="all, delete-orphan"
    )
    planner_artifacts: Mapped[list["PlannerArtifact"]] = relationship(
        back_populates="manuscript", cascade="all, delete-orphan"
    )
    plan_state: Mapped["ManuscriptPlan | None"] = relationship(
        back_populates="manuscript",
        cascade="all, delete-orphan",
        uselist=False,
    )


class DataLibraryAsset(Base):
    __tablename__ = "data_library_assets"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(32), default="unknown")
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    byte_size: Mapped[int] = mapped_column(Integer, default=0)
    storage_path: Mapped[str] = mapped_column(Text)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    project: Mapped[Project | None] = relationship(back_populates="data_assets")
    manuscript_links: Mapped[list["ManuscriptAssetLink"]] = relationship(
        back_populates="asset", cascade="all, delete-orphan"
    )


class Work(Base):
    __tablename__ = "works"
    __table_args__ = (
        Index("ix_works_user_year", "user_id", "year"),
        Index("ix_works_title_lower", "title_lower"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(Text, default="")
    title_lower: Mapped[str] = mapped_column(String(512), default="")
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    doi: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    work_type: Mapped[str] = mapped_column(String(128), default="")
    venue_name: Mapped[str] = mapped_column(String(255), default="")
    publisher: Mapped[str] = mapped_column(String(255), default="")
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[list[str]] = mapped_column(JSON, default=list)
    url: Mapped[str] = mapped_column(Text, default="")
    provenance: Mapped[str] = mapped_column(String(32), default="manual")
    cluster_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    user: Mapped[User] = relationship(back_populates="works")
    authorships: Mapped[list["WorkAuthorship"]] = relationship(
        back_populates="work", cascade="all, delete-orphan"
    )
    metrics_snapshots: Mapped[list["MetricsSnapshot"]] = relationship(
        back_populates="work", cascade="all, delete-orphan"
    )
    embeddings: Mapped[list["Embedding"]] = relationship(
        back_populates="work", cascade="all, delete-orphan"
    )


class Author(Base):
    __tablename__ = "authors"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    canonical_name: Mapped[str] = mapped_column(String(255), default="")
    canonical_name_lower: Mapped[str] = mapped_column(
        String(255), default="", index=True
    )
    orcid_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    authorships: Mapped[list["WorkAuthorship"]] = relationship(
        back_populates="author", cascade="all, delete-orphan"
    )
    collaborations: Mapped[list["CollaboratorEdge"]] = relationship(
        back_populates="collaborator", cascade="all, delete-orphan"
    )


class WorkAuthorship(Base):
    __tablename__ = "work_authorships"
    __table_args__ = (UniqueConstraint("work_id", "author_id"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    work_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("works.id", ondelete="CASCADE")
    )
    author_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("authors.id", ondelete="CASCADE")
    )
    author_order: Mapped[int] = mapped_column(Integer, default=1)
    is_user: Mapped[bool] = mapped_column(Boolean, default=False)

    work: Mapped[Work] = relationship(back_populates="authorships")
    author: Mapped[Author] = relationship(back_populates="authorships")


class MetricsSnapshot(Base):
    __tablename__ = "metrics_snapshots"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    work_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("works.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(64), default="manual")
    citations_count: Mapped[int] = mapped_column(Integer, default=0)
    influential_citations: Mapped[int | None] = mapped_column(Integer, nullable=True)
    altmetric_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    metric_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    work: Mapped[Work] = relationship(back_populates="metrics_snapshots")


class Embedding(Base):
    __tablename__ = "embeddings"
    __table_args__ = (UniqueConstraint("work_id", "model_name"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    work_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("works.id", ondelete="CASCADE"), index=True
    )
    embedding_vector: Mapped[list[float]] = mapped_column(JSON, default=list)
    model_name: Mapped[str] = mapped_column(String(128), default="local-hash-1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    work: Mapped[Work] = relationship(back_populates="embeddings")


class CollaboratorEdge(Base):
    __tablename__ = "collaborator_edges"
    __table_args__ = (UniqueConstraint("user_id", "collaborator_author_id"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    collaborator_author_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("authors.id", ondelete="CASCADE"), index=True
    )
    n_shared_works: Mapped[int] = mapped_column(Integer, default=0)
    first_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    user: Mapped[User] = relationship(back_populates="collaborator_edges")
    collaborator: Mapped[Author] = relationship(back_populates="collaborations")


class ImpactSnapshot(Base):
    __tablename__ = "impact_snapshots"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    total_works: Mapped[int] = mapped_column(Integer, default=0)
    total_citations: Mapped[int] = mapped_column(Integer, default=0)
    h_index: Mapped[int] = mapped_column(Integer, default=0)
    m_index: Mapped[float] = mapped_column(Float, default=0.0)
    citation_velocity: Mapped[float] = mapped_column(Float, default=0.0)
    dominant_theme: Mapped[str] = mapped_column(String(255), default="")
    snapshot_json: Mapped[dict] = mapped_column(JSON, default=dict)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    user: Mapped[User] = relationship(back_populates="impact_snapshots")


class ManuscriptAssetLink(Base):
    __tablename__ = "manuscript_asset_links"
    __table_args__ = (
        UniqueConstraint("manuscript_id", "asset_id", "section_context"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    manuscript_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("manuscripts.id", ondelete="CASCADE")
    )
    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("data_library_assets.id", ondelete="CASCADE")
    )
    section_context: Mapped[str] = mapped_column(String(32), default="PLANNER")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    manuscript: Mapped[Manuscript] = relationship(back_populates="asset_links")
    asset: Mapped[DataLibraryAsset] = relationship(back_populates="manuscript_links")


class DataProfile(Base):
    __tablename__ = "data_profiles"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    asset_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    data_profile_json: Mapped[dict] = mapped_column(JSON, default=dict)
    human_summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    artifacts: Mapped[list["PlannerArtifact"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )


class PlannerArtifact(Base):
    __tablename__ = "planner_artifacts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    manuscript_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("manuscripts.id", ondelete="CASCADE")
    )
    profile_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("data_profiles.id", ondelete="SET NULL"), nullable=True
    )
    artifact_type: Mapped[str] = mapped_column(String(32))
    scaffold_json: Mapped[dict] = mapped_column(JSON, default=dict)
    human_summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    manuscript: Mapped[Manuscript] = relationship(back_populates="planner_artifacts")
    profile: Mapped[DataProfile | None] = relationship(back_populates="artifacts")


class ManuscriptPlan(Base):
    __tablename__ = "manuscript_plans"
    __table_args__ = (UniqueConstraint("manuscript_id"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    manuscript_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("manuscripts.id", ondelete="CASCADE")
    )
    plan_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    manuscript: Mapped[Manuscript] = relationship(back_populates="plan_state")


class ManuscriptSnapshot(Base):
    __tablename__ = "manuscript_snapshots"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE")
    )
    manuscript_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("manuscripts.id", ondelete="CASCADE")
    )
    label: Mapped[str] = mapped_column(String(255), default="")
    sections: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    manuscript: Mapped[Manuscript] = relationship(back_populates="snapshots")


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE")
    )
    manuscript_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("manuscripts.id", ondelete="CASCADE")
    )
    status: Mapped[str] = mapped_column(String(32), default="queued")
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    run_count: Mapped[int] = mapped_column(Integer, default=1)
    parent_job_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    sections: Mapped[list[str]] = mapped_column(JSON, default=list)
    notes_context: Mapped[str] = mapped_column(Text, default="")
    pricing_model: Mapped[str] = mapped_column(String(64), default="gpt-4.1-mini")
    estimated_input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_output_tokens_low: Mapped[int] = mapped_column(Integer, default=0)
    estimated_output_tokens_high: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd_low: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_cost_usd_high: Mapped[float] = mapped_column(Float, default=0.0)
    progress_percent: Mapped[int] = mapped_column(Integer, default=0)
    current_section: Mapped[str | None] = mapped_column(String(128), nullable=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    project: Mapped[Project] = relationship(back_populates="generation_jobs")
    manuscript: Mapped[Manuscript] = relationship(back_populates="generation_jobs")


_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        database_url = get_database_url()
        connect_args = (
            {"check_same_thread": False}
            if database_url.startswith("sqlite")
            else {}
        )
        _engine = create_engine(
            database_url,
            future=True,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=get_engine(), autocommit=False, autoflush=False, future=True
        )
    return _SessionLocal


def create_all_tables() -> None:
    Base.metadata.create_all(bind=get_engine())


@contextmanager
def session_scope():
    session: Session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def reset_database_state() -> None:
    global _engine
    global _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None

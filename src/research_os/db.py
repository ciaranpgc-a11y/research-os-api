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

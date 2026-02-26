from __future__ import annotations

import os
import sqlite3
import shutil
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Date,
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
from sqlalchemy.exc import OperationalError
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
    clean = (database_url or "").strip().strip('"').strip("'")
    if clean.startswith("postgres://"):
        return clean.replace("postgres://", "postgresql+psycopg://", 1)
    if clean.startswith("postgresql://"):
        return clean.replace("postgresql://", "postgresql+psycopg://", 1)
    if clean.startswith("postgresql+psycopg2://"):
        return clean.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
    if clean.startswith("postgresql+postgres://"):
        return clean.replace("postgresql+postgres://", "postgresql+psycopg://", 1)
    return clean


def _stable_default_sqlite_path() -> Path:
    from research_os.config import get_data_library_root

    stable_root = get_data_library_root().parent
    stable_root.mkdir(parents=True, exist_ok=True)
    return (stable_root / "research_os.db").resolve()


def _legacy_sqlite_candidates(stable_path: Path) -> list[Path]:
    candidates: list[Path] = []
    cwd_candidate = (Path.cwd() / "research_os.db").resolve()
    repo_candidate = (Path(__file__).resolve().parents[2] / "research_os.db").resolve()
    for candidate in [cwd_candidate, repo_candidate]:
        if candidate == stable_path:
            continue
        if candidate not in candidates:
            candidates.append(candidate)
    return candidates


def _copy_legacy_sqlite_if_needed(stable_path: Path) -> None:
    def _row_count(path: Path, table: str) -> int | None:
        try:
            connection = sqlite3.connect(str(path))
        except Exception:
            return None
        try:
            cursor = connection.cursor()
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            row = cursor.fetchone()
            if not row:
                return 0
            return int(row[0] or 0)
        except Exception:
            return None
        finally:
            connection.close()

    def _has_recoverable_data(path: Path) -> bool:
        users_count = _row_count(path, "users")
        projects_count = _row_count(path, "projects")
        assets_count = _row_count(path, "data_library_assets")
        values = [users_count, projects_count, assets_count]
        return any(value is not None and value > 0 for value in values)

    def _is_effectively_empty(path: Path) -> bool:
        users_count = _row_count(path, "users")
        projects_count = _row_count(path, "projects")
        assets_count = _row_count(path, "data_library_assets")
        values = [users_count, projects_count, assets_count]
        known = [value for value in values if value is not None]
        return bool(known) and all(value == 0 for value in known)

    def _replace_with_legacy(legacy_path: Path) -> None:
        backup_path = stable_path.with_name(f"{stable_path.stem}.pre-legacy-recovery{stable_path.suffix}")
        try:
            shutil.copy2(stable_path, backup_path)
        except Exception:
            pass
        shutil.copy2(legacy_path, stable_path)
        for suffix in ("-wal", "-shm"):
            legacy_sidecar = Path(f"{legacy_path}{suffix}")
            stable_sidecar = Path(f"{stable_path}{suffix}")
            if legacy_sidecar.exists() and legacy_sidecar.is_file():
                shutil.copy2(legacy_sidecar, stable_sidecar)

    if stable_path.exists():
        if _is_effectively_empty(stable_path):
            for legacy_path in _legacy_sqlite_candidates(stable_path):
                if not legacy_path.exists() or not legacy_path.is_file():
                    continue
                if _has_recoverable_data(legacy_path):
                    _replace_with_legacy(legacy_path)
                    return
        return
    for legacy_path in _legacy_sqlite_candidates(stable_path):
        if not legacy_path.exists() or not legacy_path.is_file():
            continue
        stable_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy_path, stable_path)
        for suffix in ("-wal", "-shm"):
            legacy_sidecar = Path(f"{legacy_path}{suffix}")
            stable_sidecar = Path(f"{stable_path}{suffix}")
            if legacy_sidecar.exists() and legacy_sidecar.is_file():
                shutil.copy2(legacy_sidecar, stable_sidecar)
        return


def _copy_sqlite_database_with_sidecars(*, source_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, target_path)
    for suffix in ("-wal", "-shm"):
        source_sidecar = Path(f"{source_path}{suffix}")
        target_sidecar = Path(f"{target_path}{suffix}")
        if source_sidecar.exists() and source_sidecar.is_file():
            shutil.copy2(source_sidecar, target_sidecar)


def _is_probably_absolute_sqlite_path(raw_path: str) -> bool:
    path = raw_path.strip()
    if not path:
        return False
    if Path(path).is_absolute():
        return True
    # Windows absolute path may be encoded as "/C:/path" in sqlite URL form.
    return (
        len(path) >= 4
        and path[0] == "/"
        and path[1].isalpha()
        and path[2] == ":"
        and path[3] in {"/", "\\"}
    )


def _resolve_explicit_database_url(database_url: str) -> str:
    clean = _normalize_database_url(database_url)
    lowered = clean.lower()
    if not lowered.startswith("sqlite"):
        return clean
    if ":memory:" in lowered:
        return clean

    sqlite_prefixes = ("sqlite+pysqlite:///", "sqlite:///")
    prefix = next((candidate for candidate in sqlite_prefixes if clean.startswith(candidate)), "")
    if not prefix:
        return clean

    raw_path = clean[len(prefix) :].split("?", 1)[0].split("#", 1)[0].strip()
    if not raw_path:
        return clean
    if raw_path.lower().startswith("file:"):
        return clean
    if _is_probably_absolute_sqlite_path(raw_path):
        return clean

    source_path = (Path.cwd() / Path(raw_path).expanduser()).resolve()
    stable_dir = _stable_default_sqlite_path().parent
    target_name = Path(raw_path).name or "research_os.db"
    target_path = (stable_dir / target_name).resolve()

    if (
        source_path.exists()
        and source_path.is_file()
        and source_path != target_path
        and not target_path.exists()
    ):
        _copy_sqlite_database_with_sidecars(
            source_path=source_path, target_path=target_path
        )

    _copy_legacy_sqlite_if_needed(target_path)
    return _normalize_database_url(f"sqlite+pysqlite:///{target_path.as_posix()}")


def get_database_url() -> str:
    explicit_database_url = os.getenv("DATABASE_URL")
    if explicit_database_url:
        return _resolve_explicit_database_url(explicit_database_url)
    stable_path = _stable_default_sqlite_path()
    _copy_legacy_sqlite_if_needed(stable_path)
    return _normalize_database_url(f"sqlite+pysqlite:///{stable_path.as_posix()}")


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    owner_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    collaborator_user_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    workspace_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
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
    owner_user: Mapped["User | None"] = relationship(back_populates="owned_projects")


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
    google_sub: Mapped[str | None] = mapped_column(
        String(128), nullable=True, index=True
    )
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
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_sign_in_at: Mapped[datetime | None] = mapped_column(
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
    publications_metrics: Mapped[list["PublicationMetric"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    publication_metrics_source_caches: Mapped[list["PublicationMetricsSourceCache"]] = (
        relationship(back_populates="user", cascade="all, delete-orphan")
    )
    publication_impact_caches: Mapped[list["PublicationImpactCache"]] = relationship(
        back_populates="owner_user", cascade="all, delete-orphan"
    )
    publication_ai_caches: Mapped[list["PublicationAiCache"]] = relationship(
        back_populates="owner_user", cascade="all, delete-orphan"
    )
    publication_files: Mapped[list["PublicationFile"]] = relationship(
        back_populates="owner_user", cascade="all, delete-orphan"
    )
    collaborators: Mapped[list["Collaborator"]] = relationship(
        back_populates="owner_user", cascade="all, delete-orphan"
    )
    collaboration_metrics: Mapped[list["CollaborationMetric"]] = relationship(
        back_populates="owner_user", cascade="all, delete-orphan"
    )
    manuscript_authors: Mapped[list["ManuscriptAuthor"]] = relationship(
        back_populates="owner_user", cascade="all, delete-orphan"
    )
    manuscript_affiliations: Mapped[list["ManuscriptAffiliation"]] = relationship(
        back_populates="owner_user", cascade="all, delete-orphan"
    )
    persona_sync_jobs: Mapped[list["PersonaSyncJob"]] = relationship(
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
    email_verification_codes: Mapped[list["AuthEmailVerificationCode"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    password_reset_codes: Mapped[list["AuthPasswordResetCode"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    workspace_state_caches: Mapped[list["WorkspaceStateCache"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    workspace_inbox_state_caches: Mapped[list["WorkspaceInboxStateCache"]] = (
        relationship(back_populates="user", cascade="all, delete-orphan")
    )
    owned_projects: Mapped[list["Project"]] = relationship(back_populates="owner_user")
    owned_data_assets: Mapped[list["DataLibraryAsset"]] = relationship(
        back_populates="owner_user", cascade="all, delete-orphan"
    )
    owned_data_profiles: Mapped[list["DataProfile"]] = relationship(
        back_populates="owner_user", cascade="all, delete-orphan"
    )


class WorkspaceStateCache(Base):
    __tablename__ = "workspace_state_cache"
    __table_args__ = (UniqueConstraint("user_id"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    user: Mapped[User] = relationship(back_populates="workspace_state_caches")


class WorkspaceInboxStateCache(Base):
    __tablename__ = "workspace_inbox_state_cache"
    __table_args__ = (UniqueConstraint("user_id"),)

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    user: Mapped[User] = relationship(back_populates="workspace_inbox_state_caches")


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


class AuthEmailVerificationCode(Base):
    __tablename__ = "auth_email_verification_codes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    code_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped[User] = relationship(back_populates="email_verification_codes")


class AuthPasswordResetCode(Base):
    __tablename__ = "auth_password_reset_codes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    code_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped[User] = relationship(back_populates="password_reset_codes")


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
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
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
    authors: Mapped[list["ManuscriptAuthor"]] = relationship(
        back_populates="manuscript", cascade="all, delete-orphan"
    )
    affiliations: Mapped[list["ManuscriptAffiliation"]] = relationship(
        back_populates="manuscript", cascade="all, delete-orphan"
    )


class DataLibraryAsset(Base):
    __tablename__ = "data_library_assets"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    owner_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    shared_with_user_ids: Mapped[list[str] | None] = mapped_column(
        JSON, nullable=True
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
    owner_user: Mapped[User | None] = relationship(back_populates="owned_data_assets")
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
    pmid: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    openalex_work_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True, index=True
    )
    journal: Mapped[str] = mapped_column(String(255), default="")
    publication_type: Mapped[str] = mapped_column(String(128), default="")
    citations_total: Mapped[int] = mapped_column(Integer, default=0)
    work_type: Mapped[str] = mapped_column(String(128), default="")
    venue_name: Mapped[str] = mapped_column(String(255), default="")
    publisher: Mapped[str] = mapped_column(String(255), default="")
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[list[str]] = mapped_column(JSON, default=list)
    authors_json: Mapped[list[dict]] = mapped_column(JSON, default=list)
    affiliations_json: Mapped[list[dict]] = mapped_column(JSON, default=list)
    authors_status: Mapped[str] = mapped_column(String(16), default="READY")
    authors_last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    authors_computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
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
    impact_cache_rows: Mapped[list["PublicationImpactCache"]] = relationship(
        back_populates="publication", cascade="all, delete-orphan"
    )
    ai_cache_rows: Mapped[list["PublicationAiCache"]] = relationship(
        back_populates="publication", cascade="all, delete-orphan"
    )
    files: Mapped[list["PublicationFile"]] = relationship(
        back_populates="publication", cascade="all, delete-orphan"
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


class PublicationMetric(Base):
    __tablename__ = "publications_metrics"
    __table_args__ = (
        UniqueConstraint("user_id", "metric_key"),
        Index("ix_publications_metrics_user_key", "user_id", "metric_key"),
        Index("ix_publications_metrics_next_scheduled_at", "next_scheduled_at"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    orcid_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    openalex_author_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    metric_key: Mapped[str] = mapped_column(String(64), default="summary")
    metric_json: Mapped[dict] = mapped_column(JSON, default=dict)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="READY")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    user: Mapped[User] = relationship(back_populates="publications_metrics")


class PublicationMetricsSourceCache(Base):
    __tablename__ = "publication_metrics_source_cache"
    __table_args__ = (
        UniqueConstraint("user_id", "source", "refresh_date"),
        Index(
            "ix_publication_metrics_source_cache_user_source_date",
            "user_id",
            "source",
            "refresh_date",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    source: Mapped[str] = mapped_column(String(64), default="unknown")
    refresh_date: Mapped[date] = mapped_column(Date, nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    user: Mapped[User] = relationship(
        back_populates="publication_metrics_source_caches"
    )


class PublicationImpactCache(Base):
    __tablename__ = "publication_impact_cache"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "publication_id"),
        Index("ix_publication_impact_cache_owner", "owner_user_id"),
        Index("ix_publication_impact_cache_publication", "publication_id"),
        Index("ix_publication_impact_cache_computed", "computed_at"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    publication_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("works.id", ondelete="CASCADE"), index=True
    )
    owner_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), default="READY")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    publication: Mapped[Work] = relationship(back_populates="impact_cache_rows")
    owner_user: Mapped[User] = relationship(back_populates="publication_impact_caches")


class PublicationAiCache(Base):
    __tablename__ = "publication_ai_cache"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "publication_id"),
        Index("ix_publication_ai_cache_owner", "owner_user_id"),
        Index("ix_publication_ai_cache_publication", "publication_id"),
        Index("ix_publication_ai_cache_computed", "computed_at"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    publication_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("works.id", ondelete="CASCADE"), index=True
    )
    owner_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict)
    computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), default="READY")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    publication: Mapped[Work] = relationship(back_populates="ai_cache_rows")
    owner_user: Mapped[User] = relationship(back_populates="publication_ai_caches")


class PublicationFile(Base):
    __tablename__ = "publication_files"
    __table_args__ = (
        Index("ix_publication_files_owner", "owner_user_id"),
        Index("ix_publication_files_publication", "publication_id"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    publication_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("works.id", ondelete="CASCADE"), index=True
    )
    owner_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    file_name: Mapped[str] = mapped_column(String(255), default="")
    file_type: Mapped[str] = mapped_column(String(16), default="OTHER")
    storage_key: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(16), default="USER_UPLOAD")
    oa_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    publication: Mapped[Work] = relationship(back_populates="files")
    owner_user: Mapped[User] = relationship(back_populates="publication_files")


class Collaborator(Base):
    __tablename__ = "collaborators"
    __table_args__ = (
        Index("ix_collaborators_owner_name_lower", "owner_user_id", "full_name_lower"),
        Index("ix_collaborators_owner_orcid", "owner_user_id", "orcid_id"),
        Index("ix_collaborators_owner_openalex", "owner_user_id", "openalex_author_id"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    owner_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    full_name: Mapped[str] = mapped_column(String(255))
    full_name_lower: Mapped[str] = mapped_column(String(255), default="", index=True)
    preferred_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    orcid_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    openalex_author_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    primary_institution: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    country: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_position: Mapped[str | None] = mapped_column(String(255), nullable=True)
    research_domains: Mapped[list[str]] = mapped_column(JSON, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    owner_user: Mapped[User] = relationship(back_populates="collaborators")
    affiliations: Mapped[list["CollaboratorAffiliation"]] = relationship(
        back_populates="collaborator", cascade="all, delete-orphan"
    )
    metrics: Mapped[list["CollaborationMetric"]] = relationship(
        back_populates="collaborator", cascade="all, delete-orphan"
    )
    manuscript_authors: Mapped[list["ManuscriptAuthor"]] = relationship(
        back_populates="collaborator"
    )


class CollaboratorAffiliation(Base):
    __tablename__ = "collaborator_affiliations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    collaborator_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("collaborators.id", ondelete="CASCADE"), index=True
    )
    institution_name: Mapped[str] = mapped_column(String(255))
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    country: Mapped[str | None] = mapped_column(String(64), nullable=True)
    start_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    collaborator: Mapped[Collaborator] = relationship(back_populates="affiliations")


class CollaborationMetric(Base):
    __tablename__ = "collaboration_metrics"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "collaborator_id"),
        Index("ix_collaboration_metrics_owner", "owner_user_id"),
        Index("ix_collaboration_metrics_collaborator", "collaborator_id"),
        Index("ix_collaboration_metrics_next_scheduled_at", "next_scheduled_at"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    owner_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    collaborator_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("collaborators.id", ondelete="CASCADE"), index=True
    )
    coauthored_works_count: Mapped[int] = mapped_column(Integer, default=0)
    shared_citations_total: Mapped[int] = mapped_column(Integer, default=0)
    first_collaboration_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_collaboration_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    citations_last_12m: Mapped[int] = mapped_column(Integer, default=0)
    collaboration_strength_score: Mapped[float] = mapped_column(Float, default=0.0)
    classification: Mapped[str] = mapped_column(String(16), default="UNCLASSIFIED")
    status: Mapped[str] = mapped_column(String(16), default="READY")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_json: Mapped[dict] = mapped_column(JSON, default=dict)
    computed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    owner_user: Mapped[User] = relationship(back_populates="collaboration_metrics")
    collaborator: Mapped[Collaborator] = relationship(back_populates="metrics")


class ManuscriptAuthor(Base):
    __tablename__ = "manuscript_authors"
    __table_args__ = (
        UniqueConstraint("manuscript_id", "owner_user_id", "author_order"),
        Index("ix_manuscript_authors_owner", "owner_user_id"),
        Index("ix_manuscript_authors_manuscript", "manuscript_id"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    manuscript_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("manuscripts.id", ondelete="CASCADE"), index=True
    )
    owner_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    collaborator_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("collaborators.id", ondelete="SET NULL"), nullable=True
    )
    full_name: Mapped[str] = mapped_column(String(255))
    orcid_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    institution: Mapped[str | None] = mapped_column(String(255), nullable=True)
    author_order: Mapped[int] = mapped_column(Integer, default=1)
    is_corresponding: Mapped[bool] = mapped_column(Boolean, default=False)
    equal_contribution: Mapped[bool] = mapped_column(Boolean, default=False)
    is_external: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    manuscript: Mapped[Manuscript] = relationship(back_populates="authors")
    owner_user: Mapped[User] = relationship(back_populates="manuscript_authors")
    collaborator: Mapped[Collaborator | None] = relationship(
        back_populates="manuscript_authors"
    )


class ManuscriptAffiliation(Base):
    __tablename__ = "manuscript_affiliations"
    __table_args__ = (
        UniqueConstraint("manuscript_id", "owner_user_id", "superscript_number"),
        Index("ix_manuscript_affiliations_owner", "owner_user_id"),
        Index("ix_manuscript_affiliations_manuscript", "manuscript_id"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    manuscript_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("manuscripts.id", ondelete="CASCADE"), index=True
    )
    owner_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    institution_name: Mapped[str] = mapped_column(String(255))
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    country: Mapped[str | None] = mapped_column(String(64), nullable=True)
    superscript_number: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    manuscript: Mapped[Manuscript] = relationship(back_populates="affiliations")
    owner_user: Mapped[User] = relationship(back_populates="manuscript_affiliations")


class PersonaSyncJob(Base):
    __tablename__ = "persona_sync_jobs"
    __table_args__ = (
        Index("ix_persona_sync_jobs_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    job_type: Mapped[str] = mapped_column(String(32), default="orcid_import")
    status: Mapped[str] = mapped_column(String(32), default="queued")
    overwrite_user_metadata: Mapped[bool] = mapped_column(Boolean, default=False)
    run_metrics_sync: Mapped[bool] = mapped_column(Boolean, default=False)
    refresh_analytics: Mapped[bool] = mapped_column(Boolean, default=True)
    refresh_metrics: Mapped[bool] = mapped_column(Boolean, default=False)
    providers: Mapped[list[str]] = mapped_column(JSON, default=list)
    progress_percent: Mapped[int] = mapped_column(Integer, default=0)
    current_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    result_json: Mapped[dict] = mapped_column(JSON, default=dict)
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

    user: Mapped[User] = relationship(back_populates="persona_sync_jobs")


class AppRuntimeLock(Base):
    __tablename__ = "app_runtime_locks"

    lock_name: Mapped[str] = mapped_column(String(128), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(128), default="")
    lease_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class ManuscriptAssetLink(Base):
    __tablename__ = "manuscript_asset_links"
    __table_args__ = (UniqueConstraint("manuscript_id", "asset_id", "section_context"),)

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
    owner_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
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
    owner_user: Mapped[User | None] = relationship(back_populates="owned_data_profiles")


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
            {"check_same_thread": False} if database_url.startswith("sqlite") else {}
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
    engine = get_engine()
    try:
        Base.metadata.create_all(bind=engine)
    except OperationalError as exc:
        # Concurrent startup/scheduler table checks can race in SQLite tests.
        if "already exists" not in str(exc).lower():
            raise


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

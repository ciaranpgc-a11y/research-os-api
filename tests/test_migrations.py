from __future__ import annotations

from datetime import datetime
from datetime import timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import JSON
from sqlalchemy import Column
from sqlalchemy import DateTime
from sqlalchemy import Float
from sqlalchemy import ForeignKey
from sqlalchemy import Integer
from sqlalchemy import MetaData
from sqlalchemy import String
from sqlalchemy import Table
from sqlalchemy import Text
from sqlalchemy import UniqueConstraint
from sqlalchemy import create_engine
from sqlalchemy import inspect
from sqlalchemy import select


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _alembic_config() -> Config:
    root = _repo_root()
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    return config


def _sqlite_url(path: Path) -> str:
    return f"sqlite+pysqlite:///{path}"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def test_alembic_upgrade_head_creates_schema_for_fresh_database(
    monkeypatch, tmp_path
) -> None:
    db_url = _sqlite_url(tmp_path / "migrations_fresh.db")
    monkeypatch.setenv("DATABASE_URL", db_url)

    command.upgrade(_alembic_config(), "head")

    inspector = inspect(create_engine(db_url))
    table_names = set(inspector.get_table_names())
    assert "projects" in table_names
    assert "manuscripts" in table_names
    assert "generation_jobs" in table_names
    assert "manuscript_snapshots" in table_names
    assert "alembic_version" in table_names


def test_alembic_upgrade_head_adds_missing_columns_for_legacy_generation_jobs(
    monkeypatch, tmp_path
) -> None:
    db_url = _sqlite_url(tmp_path / "migrations_legacy.db")
    monkeypatch.setenv("DATABASE_URL", db_url)
    engine = create_engine(db_url, future=True)

    metadata = MetaData()
    projects = Table(
        "projects",
        metadata,
        Column("id", String(36), primary_key=True),
        Column("title", String(255), nullable=False),
        Column("target_journal", String(128), nullable=False),
        Column("journal_voice", String(128), nullable=True),
        Column("language", String(24), nullable=False),
        Column("study_type", String(128), nullable=True),
        Column("study_brief", Text, nullable=True),
        Column("created_at", DateTime(timezone=True), nullable=False),
        Column("updated_at", DateTime(timezone=True), nullable=False),
    )
    manuscripts = Table(
        "manuscripts",
        metadata,
        Column("id", String(36), primary_key=True),
        Column("project_id", String(36), ForeignKey("projects.id", ondelete="CASCADE")),
        Column("branch_name", String(128), nullable=False),
        Column("status", String(32), nullable=False),
        Column("sections", JSON, nullable=False),
        Column("created_at", DateTime(timezone=True), nullable=False),
        Column("updated_at", DateTime(timezone=True), nullable=False),
        UniqueConstraint("project_id", "branch_name"),
    )
    generation_jobs = Table(
        "generation_jobs",
        metadata,
        Column("id", String(36), primary_key=True),
        Column("project_id", String(36), ForeignKey("projects.id", ondelete="CASCADE")),
        Column(
            "manuscript_id",
            String(36),
            ForeignKey("manuscripts.id", ondelete="CASCADE"),
        ),
        Column("status", String(32), nullable=False),
        Column("sections", JSON, nullable=False),
        Column("notes_context", Text, nullable=False),
        Column("progress_percent", Integer, nullable=False),
        Column("current_section", String(128), nullable=True),
        Column("error_detail", Text, nullable=True),
        Column("started_at", DateTime(timezone=True), nullable=True),
        Column("completed_at", DateTime(timezone=True), nullable=True),
        Column("created_at", DateTime(timezone=True), nullable=False),
        Column("updated_at", DateTime(timezone=True), nullable=False),
    )
    metadata.create_all(engine)

    now = _utcnow()
    with engine.begin() as connection:
        connection.execute(
            projects.insert().values(
                id="project-1",
                title="Legacy project",
                target_journal="ehj",
                journal_voice=None,
                language="en-GB",
                study_type=None,
                study_brief=None,
                created_at=now,
                updated_at=now,
            )
        )
        connection.execute(
            manuscripts.insert().values(
                id="manuscript-1",
                project_id="project-1",
                branch_name="main",
                status="draft",
                sections={"methods": "legacy methods"},
                created_at=now,
                updated_at=now,
            )
        )
        connection.execute(
            generation_jobs.insert().values(
                id="job-1",
                project_id="project-1",
                manuscript_id="manuscript-1",
                status="completed",
                sections=["methods"],
                notes_context="legacy context",
                progress_percent=100,
                current_section=None,
                error_detail=None,
                started_at=now,
                completed_at=now,
                created_at=now,
                updated_at=now,
            )
        )

    command.upgrade(_alembic_config(), "head")

    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("generation_jobs")}
    assert "cancel_requested" in columns
    assert "run_count" in columns
    assert "parent_job_id" in columns
    assert "pricing_model" in columns
    assert "estimated_input_tokens" in columns
    assert "estimated_output_tokens_low" in columns
    assert "estimated_output_tokens_high" in columns
    assert "estimated_cost_usd_low" in columns
    assert "estimated_cost_usd_high" in columns
    assert "manuscript_snapshots" in set(inspector.get_table_names())

    upgraded_metadata = MetaData()
    upgraded_generation_jobs = Table(
        "generation_jobs",
        upgraded_metadata,
        autoload_with=engine,
    )
    with engine.connect() as connection:
        row = connection.execute(
            select(
                upgraded_generation_jobs.c.cancel_requested,
                upgraded_generation_jobs.c.run_count,
                upgraded_generation_jobs.c.pricing_model,
                upgraded_generation_jobs.c.estimated_input_tokens,
                upgraded_generation_jobs.c.estimated_output_tokens_low,
                upgraded_generation_jobs.c.estimated_output_tokens_high,
                upgraded_generation_jobs.c.estimated_cost_usd_low,
                upgraded_generation_jobs.c.estimated_cost_usd_high,
            ).where(upgraded_generation_jobs.c.id == "job-1")
        ).one()

    assert bool(row.cancel_requested) is False
    assert int(row.run_count) == 1
    assert row.pricing_model == "gpt-4.1-mini"
    assert int(row.estimated_input_tokens) == 0
    assert int(row.estimated_output_tokens_low) == 0
    assert int(row.estimated_output_tokens_high) == 0
    assert float(row.estimated_cost_usd_low) == 0.0
    assert float(row.estimated_cost_usd_high) == 0.0

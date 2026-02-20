"""Baseline schema with generation guardrails and snapshots.

Revision ID: 20260220_0001
Revises:
Create Date: 2026-02-20
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260220_0001"
down_revision = None
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    column_names = {column["name"] for column in inspector.get_columns(table_name)}
    return column_name in column_names


def _create_projects_table() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("target_journal", sa.String(length=128), nullable=False),
        sa.Column("journal_voice", sa.String(length=128), nullable=True),
        sa.Column("language", sa.String(length=24), nullable=False),
        sa.Column("study_type", sa.String(length=128), nullable=True),
        sa.Column("study_brief", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def _create_manuscripts_table() -> None:
    op.create_table(
        "manuscripts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("branch_name", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "branch_name"),
    )


def _create_generation_jobs_table() -> None:
    op.create_table(
        "generation_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("manuscript_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False),
        sa.Column("run_count", sa.Integer(), nullable=False),
        sa.Column("parent_job_id", sa.String(length=36), nullable=True),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("notes_context", sa.Text(), nullable=False),
        sa.Column("pricing_model", sa.String(length=64), nullable=False),
        sa.Column("estimated_input_tokens", sa.Integer(), nullable=False),
        sa.Column("estimated_output_tokens_low", sa.Integer(), nullable=False),
        sa.Column("estimated_output_tokens_high", sa.Integer(), nullable=False),
        sa.Column("estimated_cost_usd_low", sa.Float(), nullable=False),
        sa.Column("estimated_cost_usd_high", sa.Float(), nullable=False),
        sa.Column("progress_percent", sa.Integer(), nullable=False),
        sa.Column("current_section", sa.String(length=128), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["manuscript_id"], ["manuscripts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def _create_manuscript_snapshots_table() -> None:
    op.create_table(
        "manuscript_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("manuscript_id", sa.String(length=36), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["manuscript_id"], ["manuscripts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def _add_generation_job_column_if_missing(
    column_name: str, column: sa.Column[sa.Any]
) -> None:
    if _column_exists("generation_jobs", column_name):
        return
    op.add_column("generation_jobs", column)


def upgrade() -> None:
    if not _table_exists("projects"):
        _create_projects_table()

    if not _table_exists("manuscripts"):
        _create_manuscripts_table()

    if not _table_exists("generation_jobs"):
        _create_generation_jobs_table()
    else:
        _add_generation_job_column_if_missing(
            "cancel_requested",
            sa.Column(
                "cancel_requested",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
        _add_generation_job_column_if_missing(
            "run_count",
            sa.Column(
                "run_count",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("1"),
            ),
        )
        _add_generation_job_column_if_missing(
            "parent_job_id",
            sa.Column("parent_job_id", sa.String(length=36), nullable=True),
        )
        _add_generation_job_column_if_missing(
            "pricing_model",
            sa.Column(
                "pricing_model",
                sa.String(length=64),
                nullable=False,
                server_default=sa.text("'gpt-4.1-mini'"),
            ),
        )
        _add_generation_job_column_if_missing(
            "estimated_input_tokens",
            sa.Column(
                "estimated_input_tokens",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
        _add_generation_job_column_if_missing(
            "estimated_output_tokens_low",
            sa.Column(
                "estimated_output_tokens_low",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
        _add_generation_job_column_if_missing(
            "estimated_output_tokens_high",
            sa.Column(
                "estimated_output_tokens_high",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
        _add_generation_job_column_if_missing(
            "estimated_cost_usd_low",
            sa.Column(
                "estimated_cost_usd_low",
                sa.Float(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
        _add_generation_job_column_if_missing(
            "estimated_cost_usd_high",
            sa.Column(
                "estimated_cost_usd_high",
                sa.Float(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )

    if not _table_exists("manuscript_snapshots"):
        _create_manuscript_snapshots_table()


def downgrade() -> None:
    # This baseline migration is intentionally non-destructive on downgrade.
    # Existing deployments may have pre-Alembic state that should not be dropped.
    return

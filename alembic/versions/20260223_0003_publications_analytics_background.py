"""Add publications analytics background-cache columns and runtime lock table.

Revision ID: 20260223_0003
Revises: 20260223_0002
Create Date: 2026-02-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260223_0003"
down_revision = "20260223_0002"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def _ensure_publications_metrics_columns() -> None:
    if not _table_exists("publications_metrics"):
        return

    with op.batch_alter_table("publications_metrics") as batch:
        if not _column_exists("publications_metrics", "orcid_id"):
            batch.add_column(sa.Column("orcid_id", sa.String(length=64), nullable=True))
        if not _column_exists("publications_metrics", "openalex_author_id"):
            batch.add_column(
                sa.Column("openalex_author_id", sa.String(length=128), nullable=True)
            )
        if not _column_exists("publications_metrics", "payload_json"):
            batch.add_column(sa.Column("payload_json", sa.JSON(), nullable=True))
        if not _column_exists("publications_metrics", "status"):
            batch.add_column(
                sa.Column(
                    "status",
                    sa.String(length=16),
                    nullable=True,
                    server_default="READY",
                )
            )
        if not _column_exists("publications_metrics", "last_error"):
            batch.add_column(sa.Column("last_error", sa.Text(), nullable=True))
        if not _column_exists("publications_metrics", "next_scheduled_at"):
            batch.add_column(
                sa.Column("next_scheduled_at", sa.DateTime(timezone=True), nullable=True)
            )

    if not _index_exists("publications_metrics", "ix_publications_metrics_next_scheduled_at"):
        op.create_index(
            "ix_publications_metrics_next_scheduled_at",
            "publications_metrics",
            ["next_scheduled_at"],
            unique=False,
        )


def _ensure_app_runtime_locks_table() -> None:
    if _table_exists("app_runtime_locks"):
        return
    op.create_table(
        "app_runtime_locks",
        sa.Column("lock_name", sa.String(length=128), nullable=False),
        sa.Column("owner_id", sa.String(length=128), nullable=False),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("lock_name"),
    )


def upgrade() -> None:
    _ensure_publications_metrics_columns()
    _ensure_app_runtime_locks_table()


def downgrade() -> None:
    # Non-destructive downgrade to preserve analytics/cache history and lock records.
    return

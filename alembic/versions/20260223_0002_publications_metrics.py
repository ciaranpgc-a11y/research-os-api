"""Add publications metrics table.

Revision ID: 20260223_0002
Revises: 20260220_0001
Create Date: 2026-02-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260223_0002"
down_revision = "20260220_0001"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def _create_publications_metrics_table() -> None:
    op.create_table(
        "publications_metrics",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("metric_key", sa.String(length=64), nullable=False),
        sa.Column("metric_json", sa.JSON(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "metric_key"),
    )
    op.create_index(
        "ix_publications_metrics_user_id",
        "publications_metrics",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_publications_metrics_user_key",
        "publications_metrics",
        ["user_id", "metric_key"],
        unique=False,
    )


def upgrade() -> None:
    if not _table_exists("publications_metrics"):
        _create_publications_metrics_table()
    elif not _index_exists("publications_metrics", "ix_publications_metrics_user_key"):
        op.create_index(
            "ix_publications_metrics_user_key",
            "publications_metrics",
            ["user_id", "metric_key"],
            unique=False,
        )


def downgrade() -> None:
    # Non-destructive downgrade to preserve production analytics history.
    return

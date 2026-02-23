"""Add publication metrics source cache for top metrics strip.

Revision ID: 20260223_0006
Revises: 20260223_0005
Create Date: 2026-02-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260223_0006"
down_revision = "20260223_0005"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if not _table_exists("publication_metrics_source_cache"):
        op.create_table(
            "publication_metrics_source_cache",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("source", sa.String(length=64), nullable=False),
            sa.Column("refresh_date", sa.Date(), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id",
                "source",
                "refresh_date",
                name="uq_publication_metrics_source_cache_user_source_date",
            ),
        )
    if not _index_exists(
        "publication_metrics_source_cache",
        "ix_publication_metrics_source_cache_user_id",
    ):
        op.create_index(
            "ix_publication_metrics_source_cache_user_id",
            "publication_metrics_source_cache",
            ["user_id"],
            unique=False,
        )
    if not _index_exists(
        "publication_metrics_source_cache",
        "ix_publication_metrics_source_cache_user_source_date",
    ):
        op.create_index(
            "ix_publication_metrics_source_cache_user_source_date",
            "publication_metrics_source_cache",
            ["user_id", "source", "refresh_date"],
            unique=False,
        )


def downgrade() -> None:
    # Non-destructive downgrade to preserve source cache history.
    return

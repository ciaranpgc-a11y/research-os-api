"""Add persisted workspace and workspace inbox state caches.

Revision ID: 20260225_0007
Revises: 20260223_0006
Create Date: 2026-02-25
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260225_0007"
down_revision = "20260223_0006"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def _ensure_workspace_state_cache_table() -> None:
    if not _table_exists("workspace_state_cache"):
        op.create_table(
            "workspace_state_cache",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", name="uq_workspace_state_cache_user_id"),
        )
    if not _index_exists("workspace_state_cache", "ix_workspace_state_cache_user_id"):
        op.create_index(
            "ix_workspace_state_cache_user_id",
            "workspace_state_cache",
            ["user_id"],
            unique=False,
        )


def _ensure_workspace_inbox_state_cache_table() -> None:
    if not _table_exists("workspace_inbox_state_cache"):
        op.create_table(
            "workspace_inbox_state_cache",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id", name="uq_workspace_inbox_state_cache_user_id"
            ),
        )
    if not _index_exists(
        "workspace_inbox_state_cache", "ix_workspace_inbox_state_cache_user_id"
    ):
        op.create_index(
            "ix_workspace_inbox_state_cache_user_id",
            "workspace_inbox_state_cache",
            ["user_id"],
            unique=False,
        )


def upgrade() -> None:
    _ensure_workspace_state_cache_table()
    _ensure_workspace_inbox_state_cache_table()


def downgrade() -> None:
    # Non-destructive downgrade to preserve user-authored workspace data.
    return

"""Publication collections system.

Revision ID: 20260322_0024
Revises: 20260321_0001
Create Date: 2026-03-22
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260322_0024"
down_revision = "20260321_0001"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def upgrade() -> None:
    if not _table_exists("collections"):
        op.create_table(
            "collections",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("colour", sa.String(length=20), nullable=False, server_default="indigo"),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_collections_user_id", "collections", ["user_id"])

    if not _table_exists("subcollections"):
        op.create_table(
            "subcollections",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("collection_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(
                ["collection_id"], ["collections.id"], ondelete="CASCADE"
            ),
        )
        op.create_index(
            "ix_subcollections_collection_id", "subcollections", ["collection_id"]
        )

    if not _table_exists("collection_memberships"):
        op.create_table(
            "collection_memberships",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("collection_id", sa.String(length=36), nullable=False),
            sa.Column("subcollection_id", sa.String(length=36), nullable=True),
            sa.Column("work_id", sa.String(length=36), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(
                ["collection_id"], ["collections.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["subcollection_id"], ["subcollections.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["work_id"], ["works.id"], ondelete="CASCADE"
            ),
            sa.UniqueConstraint(
                "collection_id", "subcollection_id", "work_id",
                name="uq_collection_subcollection_work",
            ),
        )
        op.create_index(
            "ix_collection_memberships_collection_id",
            "collection_memberships",
            ["collection_id"],
        )
        op.create_index(
            "ix_collection_memberships_subcollection_id",
            "collection_memberships",
            ["subcollection_id"],
        )
        op.create_index(
            "ix_collection_memberships_work_id",
            "collection_memberships",
            ["work_id"],
        )


def downgrade() -> None:
    op.drop_table("collection_memberships")
    op.drop_table("subcollections")
    op.drop_table("collections")

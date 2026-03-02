"""Add cache table for structured publication abstracts.

Revision ID: 20260302_0010
Revises: 20260225_0009
Create Date: 2026-03-02
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260302_0010"
down_revision = "20260225_0009"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if not _table_exists("publication_structured_abstract_cache"):
        op.create_table(
            "publication_structured_abstract_cache",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("publication_id", sa.String(length=36), nullable=False),
            sa.Column("owner_user_id", sa.String(length=36), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False),
            sa.Column("source_abstract_sha256", sa.String(length=64), nullable=True),
            sa.Column("parser_version", sa.String(length=64), nullable=False),
            sa.Column("model_name", sa.String(length=64), nullable=True),
            sa.Column("computed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["publication_id"], ["works.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("owner_user_id", "publication_id"),
        )

    if not _index_exists(
        "publication_structured_abstract_cache",
        "ix_pub_structured_abstract_cache_owner",
    ):
        op.create_index(
            "ix_pub_structured_abstract_cache_owner",
            "publication_structured_abstract_cache",
            ["owner_user_id"],
            unique=False,
        )
    if not _index_exists(
        "publication_structured_abstract_cache",
        "ix_pub_structured_abstract_cache_publication",
    ):
        op.create_index(
            "ix_pub_structured_abstract_cache_publication",
            "publication_structured_abstract_cache",
            ["publication_id"],
            unique=False,
        )
    if not _index_exists(
        "publication_structured_abstract_cache",
        "ix_pub_structured_abstract_cache_computed",
    ):
        op.create_index(
            "ix_pub_structured_abstract_cache_computed",
            "publication_structured_abstract_cache",
            ["computed_at"],
            unique=False,
        )


def downgrade() -> None:
    # Non-destructive downgrade to preserve cached user-facing structured abstracts.
    return

"""Add file-level collaborator access controls for data library assets.

Revision ID: 20260225_0009
Revises: 20260225_0008
Create Date: 2026-02-25
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260225_0009"
down_revision = "20260225_0008"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if not _table_exists("data_library_assets"):
        return
    if not _column_exists("data_library_assets", "shared_with_user_ids"):
        op.add_column(
            "data_library_assets",
            sa.Column("shared_with_user_ids", sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    # Non-destructive downgrade to preserve uploaded assets and ACL metadata.
    return

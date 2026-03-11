"""Add role map for data-library shared access.

Revision ID: 20260307_0018
Revises: 20260307_0017
Create Date: 2026-03-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260307_0018"
down_revision = "20260307_0017"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if not _table_exists("data_library_assets"):
        return
    existing = _column_names("data_library_assets")
    if "shared_with_roles_json" not in existing:
        op.add_column("data_library_assets", sa.Column("shared_with_roles_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    if not _table_exists("data_library_assets"):
        return
    existing = _column_names("data_library_assets")
    if "shared_with_roles_json" in existing:
        op.drop_column("data_library_assets", "shared_with_roles_json")

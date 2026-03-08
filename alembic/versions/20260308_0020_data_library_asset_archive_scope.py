"""Add personal archive state for data-library assets.

Revision ID: 20260308_0020
Revises: 20260308_0019
Create Date: 2026-03-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260308_0020"
down_revision = "20260308_0019"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    existing = _column_names("data_library_assets")
    if "archived_by_user_ids_json" not in existing:
        op.add_column(
            "data_library_assets",
            sa.Column("archived_by_user_ids_json", sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    existing = _column_names("data_library_assets")
    if "archived_by_user_ids_json" in existing:
        op.drop_column("data_library_assets", "archived_by_user_ids_json")
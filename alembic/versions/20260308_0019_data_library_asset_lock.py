"""Add team-member lock flag for data-library assets.

Revision ID: 20260308_0019
Revises: 20260307_0018
Create Date: 2026-03-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260308_0019"
down_revision = "20260307_0018"
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
    if "locked_for_team_members" not in existing:
        op.add_column(
            "data_library_assets",
            sa.Column(
                "locked_for_team_members",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )


def downgrade() -> None:
    if not _table_exists("data_library_assets"):
        return
    existing = _column_names("data_library_assets")
    if "locked_for_team_members" in existing:
        op.drop_column("data_library_assets", "locked_for_team_members")

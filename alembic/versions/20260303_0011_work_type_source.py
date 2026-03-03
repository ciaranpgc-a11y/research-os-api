"""Add work type source metadata.

Revision ID: 20260303_0011
Revises: 20260302_0010
Create Date: 2026-03-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260303_0011"
down_revision = "20260302_0010"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if not _column_exists("works", "work_type_source"):
        op.add_column(
            "works",
            sa.Column("work_type_source", sa.String(length=32), nullable=False, server_default=""),
        )
    if not _column_exists("works", "work_type_llm_at"):
        op.add_column(
            "works",
            sa.Column("work_type_llm_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    # Non-destructive downgrade to preserve work type metadata.
    return

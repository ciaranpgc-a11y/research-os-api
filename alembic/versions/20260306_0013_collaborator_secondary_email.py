"""Add secondary email to collaborators.

Revision ID: 20260306_0013
Revises: 20260303_0012
Create Date: 2026-03-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260306_0013"
down_revision = "20260303_0012"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if "secondary_email" not in _column_names("collaborators"):
        op.add_column(
            "collaborators",
            sa.Column("secondary_email", sa.String(length=320), nullable=True),
        )


def downgrade() -> None:
    if "secondary_email" in _column_names("collaborators"):
        op.drop_column("collaborators", "secondary_email")

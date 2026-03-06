"""Add secondary contact institution to collaborators.

Revision ID: 20260306_0015
Revises: 20260306_0014
Create Date: 2026-03-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260306_0015"
down_revision = "20260306_0014"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if "contact_secondary_institution" not in _column_names("collaborators"):
        op.add_column(
            "collaborators",
            sa.Column("contact_secondary_institution", sa.String(length=255), nullable=True),
        )


def downgrade() -> None:
    if "contact_secondary_institution" in _column_names("collaborators"):
        op.drop_column("collaborators", "contact_secondary_institution")

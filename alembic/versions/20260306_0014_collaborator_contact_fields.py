"""Add separate collaborator contact fields.

Revision ID: 20260306_0014
Revises: 20260306_0013
Create Date: 2026-03-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260306_0014"
down_revision = "20260306_0013"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    existing = _column_names("collaborators")
    columns = [
        ("contact_salutation", sa.String(length=64)),
        ("contact_first_name", sa.String(length=255)),
        ("contact_middle_initial", sa.String(length=32)),
        ("contact_surname", sa.String(length=255)),
        ("contact_email", sa.String(length=320)),
        ("contact_secondary_email", sa.String(length=320)),
        ("contact_primary_institution", sa.String(length=255)),
        ("contact_country", sa.String(length=64)),
    ]
    for name, column_type in columns:
        if name not in existing:
            op.add_column("collaborators", sa.Column(name, column_type, nullable=True))


def downgrade() -> None:
    existing = _column_names("collaborators")
    for name in [
        "contact_country",
        "contact_primary_institution",
        "contact_secondary_email",
        "contact_email",
        "contact_surname",
        "contact_middle_initial",
        "contact_first_name",
        "contact_salutation",
    ]:
        if name in existing:
            op.drop_column("collaborators", name)

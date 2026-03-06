"""Add collaborator affiliation identity and byline fields.

Revision ID: 20260306_0016
Revises: 20260306_0015
Create Date: 2026-03-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260306_0016"
down_revision = "20260306_0015"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    existing = _column_names("collaborators")
    columns = [
        ("contact_primary_institution_openalex_id", sa.String(length=128)),
        ("contact_secondary_institution_openalex_id", sa.String(length=128)),
        ("contact_primary_affiliation_department", sa.String(length=255)),
        ("contact_primary_affiliation_address_line_1", sa.String(length=255)),
        ("contact_primary_affiliation_city", sa.String(length=128)),
        ("contact_primary_affiliation_region", sa.String(length=128)),
        ("contact_primary_affiliation_postal_code", sa.String(length=32)),
        ("contact_primary_affiliation_country", sa.String(length=64)),
        ("contact_secondary_affiliation_department", sa.String(length=255)),
        ("contact_secondary_affiliation_address_line_1", sa.String(length=255)),
        ("contact_secondary_affiliation_city", sa.String(length=128)),
        ("contact_secondary_affiliation_region", sa.String(length=128)),
        ("contact_secondary_affiliation_postal_code", sa.String(length=32)),
        ("contact_secondary_affiliation_country", sa.String(length=64)),
    ]
    for name, column_type in columns:
        if name not in existing:
            op.add_column("collaborators", sa.Column(name, column_type, nullable=True))


def downgrade() -> None:
    existing = _column_names("collaborators")
    for name in [
        "contact_secondary_affiliation_country",
        "contact_secondary_affiliation_postal_code",
        "contact_secondary_affiliation_region",
        "contact_secondary_affiliation_city",
        "contact_secondary_affiliation_address_line_1",
        "contact_secondary_affiliation_department",
        "contact_primary_affiliation_country",
        "contact_primary_affiliation_postal_code",
        "contact_primary_affiliation_region",
        "contact_primary_affiliation_city",
        "contact_primary_affiliation_address_line_1",
        "contact_primary_affiliation_department",
        "contact_secondary_institution_openalex_id",
        "contact_primary_institution_openalex_id",
    ]:
        if name in existing:
            op.drop_column("collaborators", name)

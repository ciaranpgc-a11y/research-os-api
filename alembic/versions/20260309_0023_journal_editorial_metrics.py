"""Add journal source and editorial intelligence fields.

Revision ID: 20260309_0023
Revises: 20260309_0022
Create Date: 2026-03-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260309_0023"
down_revision = "20260309_0022"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    existing_columns = _column_names("journal_profiles")
    additions = [
        ("works_count", sa.Integer()),
        ("cited_by_count", sa.Integer()),
        ("publisher_reported_impact_factor", sa.Float()),
        ("publisher_reported_impact_factor_year", sa.Integer()),
        ("publisher_reported_impact_factor_label", sa.String(length=64)),
        ("publisher_reported_impact_factor_source_url", sa.Text()),
        ("time_to_first_decision_days", sa.Integer()),
        ("time_to_publication_days", sa.Integer()),
        ("editor_in_chief_name", sa.String(length=255)),
        ("editorial_source_url", sa.Text()),
        ("editorial_source_title", sa.String(length=255)),
        ("editorial_confidence", sa.String(length=32)),
        ("editorial_notes", sa.Text()),
        ("editorial_raw_json", sa.JSON()),
        ("editorial_last_verified_at", sa.DateTime(timezone=True)),
    ]
    for column_name, column_type in additions:
        if column_name in existing_columns:
            continue
        op.add_column(
            "journal_profiles",
            sa.Column(column_name, column_type, nullable=True),
        )

    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE journal_profiles "
            "SET editorial_raw_json = '{}' "
            "WHERE editorial_raw_json IS NULL"
        )
    )


def downgrade() -> None:
    existing_columns = _column_names("journal_profiles")
    for column_name in [
        "editorial_last_verified_at",
        "editorial_raw_json",
        "editorial_notes",
        "editorial_confidence",
        "editorial_source_title",
        "editorial_source_url",
        "editor_in_chief_name",
        "time_to_publication_days",
        "time_to_first_decision_days",
        "publisher_reported_impact_factor_source_url",
        "publisher_reported_impact_factor_label",
        "publisher_reported_impact_factor_year",
        "publisher_reported_impact_factor",
        "cited_by_count",
        "works_count",
    ]:
        if column_name in existing_columns:
            op.drop_column("journal_profiles", column_name)

"""Add journal identity fields for works and journal profile cache.

Revision ID: 20260309_0022
Revises: 20260308_0021
Create Date: 2026-03-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260309_0022"
down_revision = "20260308_0021"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _table_names() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return set(inspector.get_table_names())


def upgrade() -> None:
    existing_work_columns = _column_names("works")
    if "openalex_source_id" not in existing_work_columns:
        op.add_column(
            "works",
            sa.Column("openalex_source_id", sa.String(length=128), nullable=True),
        )
    if "issn_l" not in existing_work_columns:
        op.add_column("works", sa.Column("issn_l", sa.String(length=32), nullable=True))
    if "issns_json" not in existing_work_columns:
        op.add_column("works", sa.Column("issns_json", sa.JSON(), nullable=True))
    if "venue_type" not in existing_work_columns:
        op.add_column(
            "works", sa.Column("venue_type", sa.String(length=64), nullable=True)
        )

    existing_work_indexes = _index_names("works")
    if "ix_works_openalex_source_id" not in existing_work_indexes:
        op.create_index(
            "ix_works_openalex_source_id",
            "works",
            ["openalex_source_id"],
            unique=False,
        )
    if "ix_works_issn_l" not in existing_work_indexes:
        op.create_index("ix_works_issn_l", "works", ["issn_l"], unique=False)

    bind = op.get_bind()
    bind.execute(
        sa.text("UPDATE works SET issns_json = :empty WHERE issns_json IS NULL"),
        {"empty": "[]"},
    )

    table_names = _table_names()
    if "journal_profiles" not in table_names:
        op.create_table(
            "journal_profiles",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("provider", sa.String(length=64), nullable=False),
            sa.Column("provider_journal_id", sa.String(length=128), nullable=True),
            sa.Column("issn_l", sa.String(length=32), nullable=True),
            sa.Column("issns_json", sa.JSON(), nullable=True),
            sa.Column("display_name", sa.String(length=255), nullable=False),
            sa.Column("publisher", sa.String(length=255), nullable=True),
            sa.Column("venue_type", sa.String(length=64), nullable=True),
            sa.Column("summary_stats_json", sa.JSON(), nullable=True),
            sa.Column("counts_by_year_json", sa.JSON(), nullable=True),
            sa.Column("is_oa", sa.Boolean(), nullable=True),
            sa.Column("is_in_doaj", sa.Boolean(), nullable=True),
            sa.Column("apc_usd", sa.Integer(), nullable=True),
            sa.Column("homepage_url", sa.Text(), nullable=True),
            sa.Column("raw_payload_json", sa.JSON(), nullable=True),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "provider",
                "provider_journal_id",
                name="uq_journal_profiles_provider_journal_id",
            ),
        )

    existing_journal_indexes = _index_names("journal_profiles")
    if "ix_journal_profiles_provider_issn_l" not in existing_journal_indexes:
        op.create_index(
            "ix_journal_profiles_provider_issn_l",
            "journal_profiles",
            ["provider", "issn_l"],
            unique=False,
        )
    if "ix_journal_profiles_display_name" not in existing_journal_indexes:
        op.create_index(
            "ix_journal_profiles_display_name",
            "journal_profiles",
            ["display_name"],
            unique=False,
        )


def downgrade() -> None:
    table_names = _table_names()
    if "journal_profiles" in table_names:
        existing_journal_indexes = _index_names("journal_profiles")
        if "ix_journal_profiles_display_name" in existing_journal_indexes:
            op.drop_index(
                "ix_journal_profiles_display_name", table_name="journal_profiles"
            )
        if "ix_journal_profiles_provider_issn_l" in existing_journal_indexes:
            op.drop_index(
                "ix_journal_profiles_provider_issn_l",
                table_name="journal_profiles",
            )
        op.drop_table("journal_profiles")

    existing_work_indexes = _index_names("works")
    if "ix_works_issn_l" in existing_work_indexes:
        op.drop_index("ix_works_issn_l", table_name="works")
    if "ix_works_openalex_source_id" in existing_work_indexes:
        op.drop_index("ix_works_openalex_source_id", table_name="works")

    existing_work_columns = _column_names("works")
    if "venue_type" in existing_work_columns:
        op.drop_column("works", "venue_type")
    if "issns_json" in existing_work_columns:
        op.drop_column("works", "issns_json")
    if "issn_l" in existing_work_columns:
        op.drop_column("works", "issn_l")
    if "openalex_source_id" in existing_work_columns:
        op.drop_column("works", "openalex_source_id")

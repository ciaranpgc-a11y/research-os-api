"""Add publication console caches, files, and canonical publication metadata columns.

Revision ID: 20260223_0005
Revises: 20260223_0004
Create Date: 2026-02-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260223_0005"
down_revision = "20260223_0004"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    columns = inspector.get_columns(table_name)
    return column_name in {str(item.get("name")) for item in columns}


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def _ensure_work_columns() -> None:
    if not _column_exists("works", "pmid"):
        op.add_column("works", sa.Column("pmid", sa.String(length=64), nullable=True))
    if not _column_exists("works", "openalex_work_id"):
        op.add_column(
            "works", sa.Column("openalex_work_id", sa.String(length=128), nullable=True)
        )
    if not _column_exists("works", "journal"):
        op.add_column(
            "works",
            sa.Column(
                "journal",
                sa.String(length=255),
                nullable=False,
                server_default=sa.text("''"),
            ),
        )
    if not _column_exists("works", "publication_type"):
        op.add_column(
            "works",
            sa.Column(
                "publication_type",
                sa.String(length=128),
                nullable=False,
                server_default=sa.text("''"),
            ),
        )
    if not _column_exists("works", "citations_total"):
        op.add_column(
            "works",
            sa.Column(
                "citations_total",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
    if not _column_exists("works", "authors_json"):
        op.add_column("works", sa.Column("authors_json", sa.JSON(), nullable=True))
    if not _column_exists("works", "affiliations_json"):
        op.add_column("works", sa.Column("affiliations_json", sa.JSON(), nullable=True))
    if not _column_exists("works", "authors_status"):
        op.add_column(
            "works",
            sa.Column(
                "authors_status",
                sa.String(length=16),
                nullable=False,
                server_default=sa.text("'READY'"),
            ),
        )
    if not _column_exists("works", "authors_last_error"):
        op.add_column("works", sa.Column("authors_last_error", sa.Text(), nullable=True))
    if not _column_exists("works", "authors_computed_at"):
        op.add_column(
            "works", sa.Column("authors_computed_at", sa.DateTime(timezone=True), nullable=True)
        )

    if not _index_exists("works", "ix_works_pmid"):
        op.create_index("ix_works_pmid", "works", ["pmid"], unique=False)
    if not _index_exists("works", "ix_works_openalex_work_id"):
        op.create_index(
            "ix_works_openalex_work_id",
            "works",
            ["openalex_work_id"],
            unique=False,
        )


def _ensure_publication_impact_cache_table() -> None:
    if not _table_exists("publication_impact_cache"):
        op.create_table(
            "publication_impact_cache",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("publication_id", sa.String(length=36), nullable=False),
            sa.Column("owner_user_id", sa.String(length=36), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False),
            sa.Column("computed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["publication_id"],
                ["works.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["owner_user_id"],
                ["users.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "owner_user_id",
                "publication_id",
                name="uq_publication_impact_cache_owner_publication",
            ),
        )
    if not _index_exists("publication_impact_cache", "ix_publication_impact_cache_owner"):
        op.create_index(
            "ix_publication_impact_cache_owner",
            "publication_impact_cache",
            ["owner_user_id"],
            unique=False,
        )
    if not _index_exists(
        "publication_impact_cache",
        "ix_publication_impact_cache_publication",
    ):
        op.create_index(
            "ix_publication_impact_cache_publication",
            "publication_impact_cache",
            ["publication_id"],
            unique=False,
        )
    if not _index_exists("publication_impact_cache", "ix_publication_impact_cache_computed"):
        op.create_index(
            "ix_publication_impact_cache_computed",
            "publication_impact_cache",
            ["computed_at"],
            unique=False,
        )


def _ensure_publication_ai_cache_table() -> None:
    if not _table_exists("publication_ai_cache"):
        op.create_table(
            "publication_ai_cache",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("publication_id", sa.String(length=36), nullable=False),
            sa.Column("owner_user_id", sa.String(length=36), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False),
            sa.Column("computed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["publication_id"],
                ["works.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["owner_user_id"],
                ["users.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "owner_user_id",
                "publication_id",
                name="uq_publication_ai_cache_owner_publication",
            ),
        )
    if not _index_exists("publication_ai_cache", "ix_publication_ai_cache_owner"):
        op.create_index(
            "ix_publication_ai_cache_owner",
            "publication_ai_cache",
            ["owner_user_id"],
            unique=False,
        )
    if not _index_exists("publication_ai_cache", "ix_publication_ai_cache_publication"):
        op.create_index(
            "ix_publication_ai_cache_publication",
            "publication_ai_cache",
            ["publication_id"],
            unique=False,
        )
    if not _index_exists("publication_ai_cache", "ix_publication_ai_cache_computed"):
        op.create_index(
            "ix_publication_ai_cache_computed",
            "publication_ai_cache",
            ["computed_at"],
            unique=False,
        )


def _ensure_publication_files_table() -> None:
    if not _table_exists("publication_files"):
        op.create_table(
            "publication_files",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("publication_id", sa.String(length=36), nullable=False),
            sa.Column("owner_user_id", sa.String(length=36), nullable=False),
            sa.Column("file_name", sa.String(length=255), nullable=False),
            sa.Column("file_type", sa.String(length=16), nullable=False),
            sa.Column("storage_key", sa.Text(), nullable=False),
            sa.Column("source", sa.String(length=16), nullable=False),
            sa.Column("oa_url", sa.Text(), nullable=True),
            sa.Column("checksum", sa.String(length=128), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["publication_id"],
                ["works.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["owner_user_id"],
                ["users.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _index_exists("publication_files", "ix_publication_files_owner"):
        op.create_index(
            "ix_publication_files_owner",
            "publication_files",
            ["owner_user_id"],
            unique=False,
        )
    if not _index_exists("publication_files", "ix_publication_files_publication"):
        op.create_index(
            "ix_publication_files_publication",
            "publication_files",
            ["publication_id"],
            unique=False,
        )


def upgrade() -> None:
    _ensure_work_columns()
    _ensure_publication_impact_cache_table()
    _ensure_publication_ai_cache_table()
    _ensure_publication_files_table()


def downgrade() -> None:
    # Non-destructive downgrade: preserve publication caches and uploaded references.
    return


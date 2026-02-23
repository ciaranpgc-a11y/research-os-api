"""Add collaboration domain tables and manuscript author persistence.

Revision ID: 20260223_0004
Revises: 20260223_0003
Create Date: 2026-02-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260223_0004"
down_revision = "20260223_0003"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def _ensure_collaborators_table() -> None:
    if not _table_exists("collaborators"):
        op.create_table(
            "collaborators",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("owner_user_id", sa.String(length=36), nullable=False),
            sa.Column("full_name", sa.String(length=255), nullable=False),
            sa.Column("full_name_lower", sa.String(length=255), nullable=False),
            sa.Column("preferred_name", sa.String(length=255), nullable=True),
            sa.Column("email", sa.String(length=320), nullable=True),
            sa.Column("orcid_id", sa.String(length=64), nullable=True),
            sa.Column("openalex_author_id", sa.String(length=128), nullable=True),
            sa.Column("primary_institution", sa.String(length=255), nullable=True),
            sa.Column("department", sa.String(length=255), nullable=True),
            sa.Column("country", sa.String(length=64), nullable=True),
            sa.Column("current_position", sa.String(length=255), nullable=True),
            sa.Column("research_domains", sa.JSON(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["owner_user_id"],
                ["users.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _index_exists("collaborators", "ix_collaborators_owner_user_id"):
        op.create_index(
            "ix_collaborators_owner_user_id",
            "collaborators",
            ["owner_user_id"],
            unique=False,
        )
    if not _index_exists("collaborators", "ix_collaborators_full_name_lower"):
        op.create_index(
            "ix_collaborators_full_name_lower",
            "collaborators",
            ["full_name_lower"],
            unique=False,
        )
    if not _index_exists("collaborators", "ix_collaborators_owner_name_lower"):
        op.create_index(
            "ix_collaborators_owner_name_lower",
            "collaborators",
            ["owner_user_id", "full_name_lower"],
            unique=False,
        )
    if not _index_exists("collaborators", "ix_collaborators_owner_orcid"):
        op.create_index(
            "ix_collaborators_owner_orcid",
            "collaborators",
            ["owner_user_id", "orcid_id"],
            unique=False,
        )
    if not _index_exists("collaborators", "ix_collaborators_owner_openalex"):
        op.create_index(
            "ix_collaborators_owner_openalex",
            "collaborators",
            ["owner_user_id", "openalex_author_id"],
            unique=False,
        )


def _ensure_collaborator_affiliations_table() -> None:
    if not _table_exists("collaborator_affiliations"):
        op.create_table(
            "collaborator_affiliations",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("collaborator_id", sa.String(length=36), nullable=False),
            sa.Column("institution_name", sa.String(length=255), nullable=False),
            sa.Column("department", sa.String(length=255), nullable=True),
            sa.Column("city", sa.String(length=128), nullable=True),
            sa.Column("country", sa.String(length=64), nullable=True),
            sa.Column("start_year", sa.Integer(), nullable=True),
            sa.Column("end_year", sa.Integer(), nullable=True),
            sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["collaborator_id"],
                ["collaborators.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _index_exists(
        "collaborator_affiliations",
        "ix_collaborator_affiliations_collaborator_id",
    ):
        op.create_index(
            "ix_collaborator_affiliations_collaborator_id",
            "collaborator_affiliations",
            ["collaborator_id"],
            unique=False,
        )


def _ensure_collaboration_metrics_table() -> None:
    if not _table_exists("collaboration_metrics"):
        op.create_table(
            "collaboration_metrics",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("owner_user_id", sa.String(length=36), nullable=False),
            sa.Column("collaborator_id", sa.String(length=36), nullable=False),
            sa.Column("coauthored_works_count", sa.Integer(), nullable=False),
            sa.Column("shared_citations_total", sa.Integer(), nullable=False),
            sa.Column("first_collaboration_year", sa.Integer(), nullable=True),
            sa.Column("last_collaboration_year", sa.Integer(), nullable=True),
            sa.Column("citations_last_12m", sa.Integer(), nullable=False),
            sa.Column("collaboration_strength_score", sa.Float(), nullable=False),
            sa.Column("classification", sa.String(length=16), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("source_json", sa.JSON(), nullable=False),
            sa.Column("computed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("next_scheduled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["owner_user_id"],
                ["users.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["collaborator_id"],
                ["collaborators.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "owner_user_id",
                "collaborator_id",
                name="uq_collaboration_metrics_owner_collaborator",
            ),
        )
    if not _index_exists("collaboration_metrics", "ix_collaboration_metrics_owner_user_id"):
        op.create_index(
            "ix_collaboration_metrics_owner_user_id",
            "collaboration_metrics",
            ["owner_user_id"],
            unique=False,
        )
    if not _index_exists("collaboration_metrics", "ix_collaboration_metrics_collaborator_id"):
        op.create_index(
            "ix_collaboration_metrics_collaborator_id",
            "collaboration_metrics",
            ["collaborator_id"],
            unique=False,
        )
    if not _index_exists("collaboration_metrics", "ix_collaboration_metrics_owner"):
        op.create_index(
            "ix_collaboration_metrics_owner",
            "collaboration_metrics",
            ["owner_user_id"],
            unique=False,
        )
    if not _index_exists("collaboration_metrics", "ix_collaboration_metrics_collaborator"):
        op.create_index(
            "ix_collaboration_metrics_collaborator",
            "collaboration_metrics",
            ["collaborator_id"],
            unique=False,
        )
    if not _index_exists(
        "collaboration_metrics",
        "ix_collaboration_metrics_next_scheduled_at",
    ):
        op.create_index(
            "ix_collaboration_metrics_next_scheduled_at",
            "collaboration_metrics",
            ["next_scheduled_at"],
            unique=False,
        )


def _ensure_manuscript_authors_table() -> None:
    if not _table_exists("manuscript_authors"):
        op.create_table(
            "manuscript_authors",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("manuscript_id", sa.String(length=36), nullable=False),
            sa.Column("owner_user_id", sa.String(length=36), nullable=False),
            sa.Column("collaborator_id", sa.String(length=36), nullable=True),
            sa.Column("full_name", sa.String(length=255), nullable=False),
            sa.Column("orcid_id", sa.String(length=64), nullable=True),
            sa.Column("institution", sa.String(length=255), nullable=True),
            sa.Column("author_order", sa.Integer(), nullable=False),
            sa.Column("is_corresponding", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("equal_contribution", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("is_external", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["manuscript_id"],
                ["manuscripts.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["owner_user_id"],
                ["users.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["collaborator_id"],
                ["collaborators.id"],
                ondelete="SET NULL",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "manuscript_id",
                "owner_user_id",
                "author_order",
                name="uq_manuscript_authors_order",
            ),
        )
    if not _index_exists("manuscript_authors", "ix_manuscript_authors_manuscript_id"):
        op.create_index(
            "ix_manuscript_authors_manuscript_id",
            "manuscript_authors",
            ["manuscript_id"],
            unique=False,
        )
    if not _index_exists("manuscript_authors", "ix_manuscript_authors_owner_user_id"):
        op.create_index(
            "ix_manuscript_authors_owner_user_id",
            "manuscript_authors",
            ["owner_user_id"],
            unique=False,
        )
    if not _index_exists("manuscript_authors", "ix_manuscript_authors_owner"):
        op.create_index(
            "ix_manuscript_authors_owner",
            "manuscript_authors",
            ["owner_user_id"],
            unique=False,
        )
    if not _index_exists("manuscript_authors", "ix_manuscript_authors_manuscript"):
        op.create_index(
            "ix_manuscript_authors_manuscript",
            "manuscript_authors",
            ["manuscript_id"],
            unique=False,
        )


def _ensure_manuscript_affiliations_table() -> None:
    if not _table_exists("manuscript_affiliations"):
        op.create_table(
            "manuscript_affiliations",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("manuscript_id", sa.String(length=36), nullable=False),
            sa.Column("owner_user_id", sa.String(length=36), nullable=False),
            sa.Column("institution_name", sa.String(length=255), nullable=False),
            sa.Column("department", sa.String(length=255), nullable=True),
            sa.Column("city", sa.String(length=128), nullable=True),
            sa.Column("country", sa.String(length=64), nullable=True),
            sa.Column("superscript_number", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["manuscript_id"],
                ["manuscripts.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["owner_user_id"],
                ["users.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "manuscript_id",
                "owner_user_id",
                "superscript_number",
                name="uq_manuscript_affiliations_superscript",
            ),
        )
    if not _index_exists("manuscript_affiliations", "ix_manuscript_affiliations_manuscript_id"):
        op.create_index(
            "ix_manuscript_affiliations_manuscript_id",
            "manuscript_affiliations",
            ["manuscript_id"],
            unique=False,
        )
    if not _index_exists("manuscript_affiliations", "ix_manuscript_affiliations_owner_user_id"):
        op.create_index(
            "ix_manuscript_affiliations_owner_user_id",
            "manuscript_affiliations",
            ["owner_user_id"],
            unique=False,
        )
    if not _index_exists("manuscript_affiliations", "ix_manuscript_affiliations_owner"):
        op.create_index(
            "ix_manuscript_affiliations_owner",
            "manuscript_affiliations",
            ["owner_user_id"],
            unique=False,
        )
    if not _index_exists("manuscript_affiliations", "ix_manuscript_affiliations_manuscript"):
        op.create_index(
            "ix_manuscript_affiliations_manuscript",
            "manuscript_affiliations",
            ["manuscript_id"],
            unique=False,
        )


def upgrade() -> None:
    _ensure_collaborators_table()
    _ensure_collaborator_affiliations_table()
    _ensure_collaboration_metrics_table()
    _ensure_manuscript_authors_table()
    _ensure_manuscript_affiliations_table()


def downgrade() -> None:
    # Non-destructive downgrade; collaboration records can be large and user-authored.
    return

"""Baseline schema with generation guardrails and snapshots.

Revision ID: 20260220_0001
Revises:
Create Date: 2026-02-20
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260220_0001"
down_revision = None
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    column_names = {column["name"] for column in inspector.get_columns(table_name)}
    return column_name in column_names


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def _create_index_if_missing(
    index_name: str,
    table_name: str,
    columns: list[str],
    *,
    unique: bool = False,
) -> None:
    if _index_exists(table_name, index_name):
        return
    op.create_index(index_name, table_name, columns, unique=unique)


def _create_projects_table() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("target_journal", sa.String(length=128), nullable=False),
        sa.Column("journal_voice", sa.String(length=128), nullable=True),
        sa.Column("language", sa.String(length=24), nullable=False),
        sa.Column("study_type", sa.String(length=128), nullable=True),
        sa.Column("study_brief", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def _create_manuscripts_table() -> None:
    op.create_table(
        "manuscripts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("branch_name", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "branch_name"),
    )


def _create_generation_jobs_table() -> None:
    op.create_table(
        "generation_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("manuscript_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False),
        sa.Column("run_count", sa.Integer(), nullable=False),
        sa.Column("parent_job_id", sa.String(length=36), nullable=True),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("notes_context", sa.Text(), nullable=False),
        sa.Column("pricing_model", sa.String(length=64), nullable=False),
        sa.Column("estimated_input_tokens", sa.Integer(), nullable=False),
        sa.Column("estimated_output_tokens_low", sa.Integer(), nullable=False),
        sa.Column("estimated_output_tokens_high", sa.Integer(), nullable=False),
        sa.Column("estimated_cost_usd_low", sa.Float(), nullable=False),
        sa.Column("estimated_cost_usd_high", sa.Float(), nullable=False),
        sa.Column("progress_percent", sa.Integer(), nullable=False),
        sa.Column("current_section", sa.String(length=128), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["manuscript_id"], ["manuscripts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def _create_manuscript_snapshots_table() -> None:
    op.create_table(
        "manuscript_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("manuscript_id", sa.String(length=36), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("sections", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["manuscript_id"], ["manuscripts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def _create_users_table() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("role", sa.String(length=16), nullable=False, server_default=sa.text("'user'")),
        sa.Column("orcid_id", sa.String(length=64), nullable=True),
        sa.Column("google_sub", sa.String(length=128), nullable=True),
        sa.Column("microsoft_sub", sa.String(length=128), nullable=True),
        sa.Column("orcid_access_token", sa.Text(), nullable=True),
        sa.Column("orcid_refresh_token", sa.Text(), nullable=True),
        sa.Column("orcid_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("impact_last_computed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("orcid_last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("two_factor_secret", sa.Text(), nullable=True),
        sa.Column("two_factor_backup_codes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("two_factor_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    op.create_index("ix_users_orcid_id", "users", ["orcid_id"], unique=False)
    op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=False)
    op.create_index("ix_users_microsoft_sub", "users", ["microsoft_sub"], unique=False)


def _create_auth_sessions_table() -> None:
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"], unique=False)
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"], unique=False)


def _create_orcid_oauth_states_table() -> None:
    op.create_table(
        "orcid_oauth_states",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("state_token", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("state_token"),
    )
    op.create_index("ix_orcid_oauth_states_user_id", "orcid_oauth_states", ["user_id"], unique=False)
    op.create_index("ix_orcid_oauth_states_state_token", "orcid_oauth_states", ["state_token"], unique=False)


def _create_auth_login_challenges_table() -> None:
    op.create_table(
        "auth_login_challenges",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("challenge_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("challenge_hash"),
    )
    op.create_index(
        "ix_auth_login_challenges_user_id",
        "auth_login_challenges",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_auth_login_challenges_challenge_hash",
        "auth_login_challenges",
        ["challenge_hash"],
        unique=False,
    )


def _create_auth_oauth_states_table() -> None:
    op.create_table(
        "auth_oauth_states",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("state_token", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("state_token"),
    )
    op.create_index(
        "ix_auth_oauth_states_user_id",
        "auth_oauth_states",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_auth_oauth_states_provider",
        "auth_oauth_states",
        ["provider"],
        unique=False,
    )
    op.create_index(
        "ix_auth_oauth_states_state_token",
        "auth_oauth_states",
        ["state_token"],
        unique=False,
    )


def _create_works_table() -> None:
    op.create_table(
        "works",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("title_lower", sa.String(length=512), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("doi", sa.String(length=255), nullable=True),
        sa.Column("work_type", sa.String(length=128), nullable=False),
        sa.Column("venue_name", sa.String(length=255), nullable=False),
        sa.Column("publisher", sa.String(length=255), nullable=False),
        sa.Column("abstract", sa.Text(), nullable=True),
        sa.Column("keywords", sa.JSON(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("provenance", sa.String(length=32), nullable=False),
        sa.Column("cluster_id", sa.String(length=64), nullable=True),
        sa.Column("user_edited", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_works_user_id", "works", ["user_id"], unique=False)
    op.create_index("ix_works_doi", "works", ["doi"], unique=False)
    op.create_index("ix_works_title_lower", "works", ["title_lower"], unique=False)
    op.create_index("ix_works_user_year", "works", ["user_id", "year"], unique=False)


def _create_authors_table() -> None:
    op.create_table(
        "authors",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("canonical_name", sa.String(length=255), nullable=False),
        sa.Column("canonical_name_lower", sa.String(length=255), nullable=False),
        sa.Column("orcid_id", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_authors_canonical_name_lower", "authors", ["canonical_name_lower"], unique=False)
    op.create_index("ix_authors_orcid_id", "authors", ["orcid_id"], unique=False)


def _create_work_authorships_table() -> None:
    op.create_table(
        "work_authorships",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("work_id", sa.String(length=36), nullable=False),
        sa.Column("author_id", sa.String(length=36), nullable=False),
        sa.Column("author_order", sa.Integer(), nullable=False),
        sa.Column("is_user", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(["author_id"], ["authors.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("work_id", "author_id"),
    )


def _create_metrics_snapshots_table() -> None:
    op.create_table(
        "metrics_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("work_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("citations_count", sa.Integer(), nullable=False),
        sa.Column("influential_citations", sa.Integer(), nullable=True),
        sa.Column("altmetric_score", sa.Float(), nullable=True),
        sa.Column("metric_payload", sa.JSON(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_metrics_snapshots_work_id", "metrics_snapshots", ["work_id"], unique=False)


def _create_embeddings_table() -> None:
    op.create_table(
        "embeddings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("work_id", sa.String(length=36), nullable=False),
        sa.Column("embedding_vector", sa.JSON(), nullable=False),
        sa.Column("model_name", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("work_id", "model_name"),
    )
    op.create_index("ix_embeddings_work_id", "embeddings", ["work_id"], unique=False)


def _create_collaborator_edges_table() -> None:
    op.create_table(
        "collaborator_edges",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("collaborator_author_id", sa.String(length=36), nullable=False),
        sa.Column("n_shared_works", sa.Integer(), nullable=False),
        sa.Column("first_year", sa.Integer(), nullable=True),
        sa.Column("last_year", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["collaborator_author_id"], ["authors.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "collaborator_author_id"),
    )
    op.create_index("ix_collaborator_edges_user_id", "collaborator_edges", ["user_id"], unique=False)
    op.create_index(
        "ix_collaborator_edges_collaborator_author_id",
        "collaborator_edges",
        ["collaborator_author_id"],
        unique=False,
    )


def _create_impact_snapshots_table() -> None:
    op.create_table(
        "impact_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("total_works", sa.Integer(), nullable=False),
        sa.Column("total_citations", sa.Integer(), nullable=False),
        sa.Column("h_index", sa.Integer(), nullable=False),
        sa.Column("m_index", sa.Float(), nullable=False),
        sa.Column("citation_velocity", sa.Float(), nullable=False),
        sa.Column("dominant_theme", sa.String(length=255), nullable=False),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_impact_snapshots_user_id", "impact_snapshots", ["user_id"], unique=False)


def _add_generation_job_column_if_missing(
    column_name: str, column: sa.Column[sa.Any]
) -> None:
    if _column_exists("generation_jobs", column_name):
        return
    op.add_column("generation_jobs", column)


def upgrade() -> None:
    if not _table_exists("projects"):
        _create_projects_table()

    if not _table_exists("manuscripts"):
        _create_manuscripts_table()

    if not _table_exists("generation_jobs"):
        _create_generation_jobs_table()
    else:
        _add_generation_job_column_if_missing(
            "cancel_requested",
            sa.Column(
                "cancel_requested",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
        _add_generation_job_column_if_missing(
            "run_count",
            sa.Column(
                "run_count",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("1"),
            ),
        )
        _add_generation_job_column_if_missing(
            "parent_job_id",
            sa.Column("parent_job_id", sa.String(length=36), nullable=True),
        )
        _add_generation_job_column_if_missing(
            "pricing_model",
            sa.Column(
                "pricing_model",
                sa.String(length=64),
                nullable=False,
                server_default=sa.text("'gpt-4.1-mini'"),
            ),
        )
        _add_generation_job_column_if_missing(
            "estimated_input_tokens",
            sa.Column(
                "estimated_input_tokens",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
        _add_generation_job_column_if_missing(
            "estimated_output_tokens_low",
            sa.Column(
                "estimated_output_tokens_low",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
        _add_generation_job_column_if_missing(
            "estimated_output_tokens_high",
            sa.Column(
                "estimated_output_tokens_high",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
        _add_generation_job_column_if_missing(
            "estimated_cost_usd_low",
            sa.Column(
                "estimated_cost_usd_low",
                sa.Float(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
        _add_generation_job_column_if_missing(
            "estimated_cost_usd_high",
            sa.Column(
                "estimated_cost_usd_high",
                sa.Float(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )

    if not _table_exists("manuscript_snapshots"):
        _create_manuscript_snapshots_table()

    if not _table_exists("users"):
        _create_users_table()
    else:
        if not _column_exists("users", "google_sub"):
            op.add_column("users", sa.Column("google_sub", sa.String(length=128), nullable=True))
        if not _column_exists("users", "microsoft_sub"):
            op.add_column(
                "users", sa.Column("microsoft_sub", sa.String(length=128), nullable=True)
            )
        if not _column_exists("users", "two_factor_enabled"):
            op.add_column(
                "users",
                sa.Column(
                    "two_factor_enabled",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("0"),
                ),
            )
        if not _column_exists("users", "two_factor_secret"):
            op.add_column("users", sa.Column("two_factor_secret", sa.Text(), nullable=True))
        if not _column_exists("users", "two_factor_backup_codes"):
            op.add_column(
                "users",
                sa.Column(
                    "two_factor_backup_codes",
                    sa.JSON(),
                    nullable=False,
                    server_default=sa.text("'[]'"),
                ),
            )
        if not _column_exists("users", "two_factor_confirmed_at"):
            op.add_column(
                "users",
                sa.Column("two_factor_confirmed_at", sa.DateTime(timezone=True), nullable=True),
            )
        _create_index_if_missing("ix_users_google_sub", "users", ["google_sub"])
        _create_index_if_missing("ix_users_microsoft_sub", "users", ["microsoft_sub"])

    if not _table_exists("auth_sessions"):
        _create_auth_sessions_table()

    if not _table_exists("orcid_oauth_states"):
        _create_orcid_oauth_states_table()

    if not _table_exists("auth_login_challenges"):
        _create_auth_login_challenges_table()

    if not _table_exists("auth_oauth_states"):
        _create_auth_oauth_states_table()

    if not _table_exists("works"):
        _create_works_table()

    if not _table_exists("authors"):
        _create_authors_table()

    if not _table_exists("work_authorships"):
        _create_work_authorships_table()

    if not _table_exists("metrics_snapshots"):
        _create_metrics_snapshots_table()

    if not _table_exists("embeddings"):
        _create_embeddings_table()

    if not _table_exists("collaborator_edges"):
        _create_collaborator_edges_table()

    if not _table_exists("impact_snapshots"):
        _create_impact_snapshots_table()


def downgrade() -> None:
    # This baseline migration is intentionally non-destructive on downgrade.
    # Existing deployments may have pre-Alembic state that should not be dropped.
    return

"""Add CMR access control tables.

Revision ID: 20260321_0001
Revises: 20260309_0023
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa

revision = "20260321_0001"
down_revision = "20260309_0023"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    from sqlalchemy import inspect as sa_inspect
    conn = op.get_bind()
    return name in sa_inspect(conn).get_table_names()


def upgrade() -> None:
    if not _table_exists("cmr_access_codes"):
        op.create_table(
            "cmr_access_codes",
            sa.Column("id", sa.String(36), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("code_hash", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("session_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists("cmr_sessions"):
        op.create_table(
            "cmr_sessions",
            sa.Column("id", sa.String(36), nullable=False),
            sa.Column("access_code_id", sa.String(36), nullable=False),
            sa.Column("session_token", sa.String(128), nullable=False),
            sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(
                ["access_code_id"],
                ["cmr_access_codes.id"],
                ondelete="CASCADE",
            ),
        )
        op.create_index(
            "ix_cmr_sessions_session_token",
            "cmr_sessions",
            ["session_token"],
            unique=True,
        )
        op.create_index(
            "ix_cmr_sessions_access_code_id",
            "cmr_sessions",
            ["access_code_id"],
        )

    # Seed the reserved admin row
    from datetime import datetime, timezone
    op.execute(
        sa.text(
            "INSERT OR IGNORE INTO cmr_access_codes (id, name, code_hash, created_at, session_count, is_active) "
            "VALUES (:id, :name, NULL, :now, 0, 1)"
        ).bindparams(
            id="admin",
            name="Admin",
            now=datetime.now(timezone.utc).isoformat(),
        )
    )


def downgrade() -> None:
    return  # Non-destructive downgrade

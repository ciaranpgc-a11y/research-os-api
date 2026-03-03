"""Create API provider usage events table.

Revision ID: 20260303_0012
Revises: 20260303_0011
Create Date: 2026-03-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260303_0012"
down_revision = "20260303_0011"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    if not _table_exists("api_provider_usage_events"):
        op.create_table(
            "api_provider_usage_events",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("provider", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("operation", sa.String(length=128), nullable=False, server_default=""),
            sa.Column("endpoint", sa.String(length=255), nullable=False, server_default=""),
            sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("status_code", sa.Integer(), nullable=True),
            sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("tokens_input", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("tokens_output", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("error_code", sa.String(length=96), nullable=True),
            sa.Column("user_id", sa.String(length=36), nullable=True),
            sa.Column("project_id", sa.String(length=36), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _index_exists(
        "api_provider_usage_events", "ix_api_provider_usage_events_created_at"
    ):
        op.create_index(
            "ix_api_provider_usage_events_created_at",
            "api_provider_usage_events",
            ["created_at"],
            unique=False,
        )
    if not _index_exists(
        "api_provider_usage_events",
        "ix_api_provider_usage_events_provider_created",
    ):
        op.create_index(
            "ix_api_provider_usage_events_provider_created",
            "api_provider_usage_events",
            ["provider", "created_at"],
            unique=False,
        )
    if not _index_exists(
        "api_provider_usage_events",
        "ix_api_provider_usage_events_success_created",
    ):
        op.create_index(
            "ix_api_provider_usage_events_success_created",
            "api_provider_usage_events",
            ["success", "created_at"],
            unique=False,
        )


def downgrade() -> None:
    # Non-destructive downgrade to preserve telemetry history.
    return

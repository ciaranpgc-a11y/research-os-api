"""Add ownership/collaborator columns for projects and data assets.

Revision ID: 20260225_0008
Revises: 20260225_0007
Create Date: 2026-02-25
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260225_0008"
down_revision = "20260225_0007"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table_name in set(inspector.get_table_names())


def _is_sqlite() -> bool:
    return op.get_bind().dialect.name == "sqlite"


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return index_name in {index["name"] for index in inspector.get_indexes(table_name)}


def _ensure_projects_columns() -> None:
    if not _table_exists("projects"):
        return
    if not _column_exists("projects", "owner_user_id"):
        op.add_column(
            "projects",
            sa.Column("owner_user_id", sa.String(length=36), nullable=True),
        )
        if not _is_sqlite():
            op.create_foreign_key(
                "fk_projects_owner_user_id_users",
                "projects",
                "users",
                ["owner_user_id"],
                ["id"],
                ondelete="SET NULL",
            )
    if not _column_exists("projects", "collaborator_user_ids"):
        op.add_column(
            "projects",
            sa.Column("collaborator_user_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        )
    if not _column_exists("projects", "workspace_id"):
        op.add_column(
            "projects",
            sa.Column("workspace_id", sa.String(length=128), nullable=True),
        )

    if not _index_exists("projects", "ix_projects_owner_user_id"):
        op.create_index("ix_projects_owner_user_id", "projects", ["owner_user_id"], unique=False)
    if not _index_exists("projects", "ix_projects_workspace_id"):
        op.create_index("ix_projects_workspace_id", "projects", ["workspace_id"], unique=False)

    # Remove server default after backfill-friendly creation.
    with op.batch_alter_table("projects") as batch_op:
        batch_op.alter_column("collaborator_user_ids", server_default=None)


def _ensure_data_library_assets_columns() -> None:
    if not _table_exists("data_library_assets"):
        return
    if not _column_exists("data_library_assets", "owner_user_id"):
        op.add_column(
            "data_library_assets",
            sa.Column("owner_user_id", sa.String(length=36), nullable=True),
        )
        if not _is_sqlite():
            op.create_foreign_key(
                "fk_data_library_assets_owner_user_id_users",
                "data_library_assets",
                "users",
                ["owner_user_id"],
                ["id"],
                ondelete="SET NULL",
            )
    if not _index_exists("data_library_assets", "ix_data_library_assets_owner_user_id"):
        op.create_index(
            "ix_data_library_assets_owner_user_id",
            "data_library_assets",
            ["owner_user_id"],
            unique=False,
        )


def _ensure_data_profiles_columns() -> None:
    if not _table_exists("data_profiles"):
        return
    if not _column_exists("data_profiles", "owner_user_id"):
        op.add_column(
            "data_profiles",
            sa.Column("owner_user_id", sa.String(length=36), nullable=True),
        )
        if not _is_sqlite():
            op.create_foreign_key(
                "fk_data_profiles_owner_user_id_users",
                "data_profiles",
                "users",
                ["owner_user_id"],
                ["id"],
                ondelete="SET NULL",
            )
    if not _index_exists("data_profiles", "ix_data_profiles_owner_user_id"):
        op.create_index(
            "ix_data_profiles_owner_user_id",
            "data_profiles",
            ["owner_user_id"],
            unique=False,
        )


def upgrade() -> None:
    _ensure_projects_columns()
    _ensure_data_library_assets_columns()
    _ensure_data_profiles_columns()


def downgrade() -> None:
    # Non-destructive downgrade to preserve user-authored data.
    return

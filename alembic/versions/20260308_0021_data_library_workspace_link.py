"""Add data-library workspace placement columns.

Revision ID: 20260308_0021
Revises: 20260308_0020
Create Date: 2026-03-08
"""

from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260308_0021"
down_revision = "20260308_0020"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    existing_columns = _column_names("data_library_assets")
    if "workspace_id" not in existing_columns:
        op.add_column(
            "data_library_assets",
            sa.Column("workspace_id", sa.String(length=128), nullable=True),
        )
    if "workspace_ids_json" not in existing_columns:
        op.add_column(
            "data_library_assets",
            sa.Column("workspace_ids_json", sa.JSON(), nullable=True),
        )
    if "origin_workspace_id" not in existing_columns:
        op.add_column(
            "data_library_assets",
            sa.Column("origin_workspace_id", sa.String(length=128), nullable=True),
        )

    existing_indexes = _index_names("data_library_assets")
    if "ix_data_library_assets_workspace_id" not in existing_indexes:
        op.create_index(
            "ix_data_library_assets_workspace_id",
            "data_library_assets",
            ["workspace_id"],
            unique=False,
        )

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    project_columns = {
        column["name"] for column in inspector.get_columns("projects")
    }
    asset_columns = _column_names("data_library_assets")
    if "project_id" in asset_columns and "workspace_id" in project_columns:
        bind.execute(
            sa.text(
                "UPDATE data_library_assets "
                "SET workspace_id = ("
                "  SELECT projects.workspace_id "
                "  FROM projects "
                "  WHERE projects.id = data_library_assets.project_id"
                ") "
                "WHERE workspace_id IS NULL "
                "  AND project_id IS NOT NULL "
                "  AND EXISTS ("
                "    SELECT 1 FROM projects "
                "    WHERE projects.id = data_library_assets.project_id "
                "      AND projects.workspace_id IS NOT NULL "
                "      AND TRIM(projects.workspace_id) != ''"
                "  )"
            )
        )
    if "origin_workspace_id" in asset_columns and "workspace_id" in asset_columns:
        bind.execute(
            sa.text(
                "UPDATE data_library_assets "
                "SET origin_workspace_id = workspace_id "
                "WHERE origin_workspace_id IS NULL "
                "  AND workspace_id IS NOT NULL "
                "  AND TRIM(workspace_id) != ''"
            )
        )
    if "workspace_ids_json" in asset_columns and "workspace_id" in asset_columns:
        rows = bind.execute(
            sa.text(
                "SELECT id, workspace_id "
                "FROM data_library_assets "
                "WHERE workspace_ids_json IS NULL "
                "  AND workspace_id IS NOT NULL "
                "  AND TRIM(workspace_id) != ''"
            )
        ).fetchall()
        for asset_id, workspace_id in rows:
            bind.execute(
                sa.text(
                    "UPDATE data_library_assets "
                    "SET workspace_ids_json = :workspace_ids_json "
                    "WHERE id = :asset_id"
                ),
                {
                    "asset_id": asset_id,
                    "workspace_ids_json": json.dumps([str(workspace_id)]),
                },
            )


def downgrade() -> None:
    existing_indexes = _index_names("data_library_assets")
    if "ix_data_library_assets_workspace_id" in existing_indexes:
        op.drop_index("ix_data_library_assets_workspace_id", table_name="data_library_assets")
    existing_columns = _column_names("data_library_assets")
    if "origin_workspace_id" in existing_columns:
        op.drop_column("data_library_assets", "origin_workspace_id")
    if "workspace_ids_json" in existing_columns:
        op.drop_column("data_library_assets", "workspace_ids_json")
    if "workspace_id" in existing_columns:
        op.drop_column("data_library_assets", "workspace_id")

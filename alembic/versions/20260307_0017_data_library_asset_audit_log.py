"""Add data-library asset audit log column.

Revision ID: 20260307_0017
Revises: 20260306_0016
Create Date: 2026-03-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260307_0017"
down_revision = "20260306_0016"
branch_labels = None
depends_on = None


def _column_names(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    existing = _column_names("data_library_assets")
    if "audit_log_json" not in existing:
        op.add_column("data_library_assets", sa.Column("audit_log_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    existing = _column_names("data_library_assets")
    if "audit_log_json" in existing:
        op.drop_column("data_library_assets", "audit_log_json")

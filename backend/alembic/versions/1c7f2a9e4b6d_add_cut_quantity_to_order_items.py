"""add_cut_quantity_to_order_items

Revision ID: 1c7f2a9e4b6d
Revises: 040840699daa
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "1c7f2a9e4b6d"
down_revision: Union[str, Sequence[str], None] = "040840699daa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cmt_order_items",
        sa.Column("cut_quantity", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("cmt_order_items", "cut_quantity", server_default=None)


def downgrade() -> None:
    op.drop_column("cmt_order_items", "cut_quantity")

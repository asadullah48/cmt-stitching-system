"""standalone bills — make order_id nullable

Revision ID: q7l8m9n0o1p2
Revises: p6k7l8m9n0o1
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa

revision = 'q7l8m9n0o1p2'
down_revision = 'p6k7l8m9n0o1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('cmt_bills', 'order_id', nullable=True)


def downgrade() -> None:
    # Remove standalone bills first — ALTER will fail if any order_id is NULL
    op.execute("DELETE FROM cmt_bills WHERE order_id IS NULL")
    op.alter_column('cmt_bills', 'order_id', nullable=False)

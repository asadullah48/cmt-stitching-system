"""add deleted_at to quality tables

Revision ID: l2g3h4i5j6k7
Revises: k1f2g3h4i5j6
Create Date: 2026-03-14 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'l2g3h4i5j6k7'
down_revision = 'k1f2g3h4i5j6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('cmt_quality_checkpoints', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.add_column('cmt_defect_logs', sa.Column('deleted_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('cmt_quality_checkpoints', 'deleted_at')
    op.drop_column('cmt_defect_logs', 'deleted_at')

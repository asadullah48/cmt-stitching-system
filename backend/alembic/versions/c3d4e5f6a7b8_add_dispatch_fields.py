"""add dispatch fields to cmt_orders

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('cmt_orders', sa.Column('carrier', sa.String(50), nullable=True))
    op.add_column('cmt_orders', sa.Column('tracking_number', sa.String(100), nullable=True))
    op.add_column('cmt_orders', sa.Column('dispatch_date', sa.Date, nullable=True))
    op.add_column('cmt_orders', sa.Column('carton_count', sa.Integer, nullable=True))
    op.add_column('cmt_orders', sa.Column('total_weight', sa.Numeric(8, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('cmt_orders', 'total_weight')
    op.drop_column('cmt_orders', 'carton_count')
    op.drop_column('cmt_orders', 'dispatch_date')
    op.drop_column('cmt_orders', 'tracking_number')
    op.drop_column('cmt_orders', 'carrier')

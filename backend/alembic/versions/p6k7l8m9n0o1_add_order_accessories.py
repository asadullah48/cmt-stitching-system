"""add order accessories table

Revision ID: p6k7l8m9n0o1
Revises: o5j6k7l8m9n0
Create Date: 2026-04-01

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

revision = 'p6k7l8m9n0o1'
down_revision = 'o5j6k7l8m9n0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'cmt_order_accessories',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('order_id', UUID(as_uuid=True), sa.ForeignKey('cmt_orders.id'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('total_qty', sa.Numeric(10, 2), nullable=False),
        sa.Column('unit_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('from_stock', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('purchased_qty', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('purchase_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_cmt_order_accessories_order_id', 'cmt_order_accessories', ['order_id'])


def downgrade() -> None:
    op.drop_index('ix_cmt_order_accessories_order_id', 'cmt_order_accessories')
    op.drop_table('cmt_order_accessories')

"""add lot number and sub-order columns

Revision ID: s9n0o1p2q3r4
Revises: r8m9n0o1p2q3
Create Date: 2026-04-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = 's9n0o1p2q3r4'
down_revision = 'r8m9n0o1p2q3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('cmt_orders', sa.Column('lot_number', sa.Integer(), nullable=True))
    op.add_column('cmt_orders', sa.Column('sub_suffix', sa.String(5), nullable=True))
    op.add_column('cmt_orders', sa.Column('parent_order_id', UUID(as_uuid=True), nullable=True))
    op.add_column('cmt_orders', sa.Column('sub_stages', JSONB(), nullable=True))
    op.add_column('cmt_orders', sa.Column('current_stage', sa.String(30), nullable=True))
    op.create_foreign_key(
        'fk_cmt_orders_parent_order_id',
        'cmt_orders', 'cmt_orders',
        ['parent_order_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_cmt_orders_parent_order_id', 'cmt_orders', type_='foreignkey')
    op.drop_column('cmt_orders', 'current_stage')
    op.drop_column('cmt_orders', 'sub_stages')
    op.drop_column('cmt_orders', 'parent_order_id')
    op.drop_column('cmt_orders', 'sub_suffix')
    op.drop_column('cmt_orders', 'lot_number')

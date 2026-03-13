"""add reference fields to inventory transactions

Revision ID: k1f2g3h4i5j6
Revises: j0e1f2g3h4i5
Create Date: 2026-03-13

"""
from alembic import op
import sqlalchemy as sa

revision = 'k1f2g3h4i5j6'
down_revision = 'j0e1f2g3h4i5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cmt_inventory_transactions',
        sa.Column('order_number', sa.String(50), nullable=True))
    op.add_column('cmt_inventory_transactions',
        sa.Column('bill_number', sa.String(50), nullable=True))
    op.add_column('cmt_inventory_transactions',
        sa.Column('party_reference', sa.String(100), nullable=True))


def downgrade():
    op.drop_column('cmt_inventory_transactions', 'party_reference')
    op.drop_column('cmt_inventory_transactions', 'bill_number')
    op.drop_column('cmt_inventory_transactions', 'order_number')

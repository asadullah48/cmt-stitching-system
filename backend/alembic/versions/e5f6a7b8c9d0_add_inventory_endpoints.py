"""add inventory location and condition fields

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-08 00:01:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cmt_inventory_items',
        sa.Column('location', sa.String(100), nullable=True))
    op.add_column('cmt_inventory_items',
        sa.Column('condition', sa.String(20), nullable=True, server_default='good'))


def downgrade():
    op.drop_column('cmt_inventory_items', 'condition')
    op.drop_column('cmt_inventory_items', 'location')

"""add expense fields to orders

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cmt_orders', sa.Column('transport_expense', sa.Numeric(10, 2), nullable=True, server_default='0'))
    op.add_column('cmt_orders', sa.Column('loading_expense', sa.Numeric(10, 2), nullable=True, server_default='0'))
    op.add_column('cmt_orders', sa.Column('miscellaneous_expense', sa.Numeric(10, 2), nullable=True, server_default='0'))
    op.add_column('cmt_orders', sa.Column('rent', sa.Numeric(10, 2), nullable=True, server_default='0'))
    op.add_column('cmt_orders', sa.Column('loading_charges', sa.Numeric(10, 2), nullable=True, server_default='0'))


def downgrade():
    op.drop_column('cmt_orders', 'loading_charges')
    op.drop_column('cmt_orders', 'rent')
    op.drop_column('cmt_orders', 'miscellaneous_expense')
    op.drop_column('cmt_orders', 'loading_expense')
    op.drop_column('cmt_orders', 'transport_expense')

"""add bill discount and previous_balance

Revision ID: i9d0e1f2g3h4
Revises: h8c9d0e1f2g3
Create Date: 2026-03-12

"""
from alembic import op
import sqlalchemy as sa

revision = 'i9d0e1f2g3h4'
down_revision = 'h8c9d0e1f2g3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cmt_bills', sa.Column('discount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.add_column('cmt_bills', sa.Column('previous_balance', sa.Numeric(10, 2), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('cmt_bills', 'previous_balance')
    op.drop_column('cmt_bills', 'discount')

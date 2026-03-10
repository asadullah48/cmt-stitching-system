"""add image_url to products

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-03-10

"""
from alembic import op
import sqlalchemy as sa

revision = 'g7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cmt_products', sa.Column('image_url', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('cmt_products', 'image_url')

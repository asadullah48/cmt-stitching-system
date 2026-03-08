"""add products and bom tables

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-03-08

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Products table
    op.create_table(
        'cmt_products',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('is_deleted', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # BOM items table
    op.create_table(
        'cmt_product_bom_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('product_id', UUID(as_uuid=True),
                  sa.ForeignKey('cmt_products.id'), nullable=False),
        sa.Column('inventory_item_id', UUID(as_uuid=True),
                  sa.ForeignKey('cmt_inventory_items.id'), nullable=False),
        sa.Column('material_quantity', sa.Numeric(10, 4), nullable=False),
        sa.Column('covers_quantity', sa.Numeric(10, 4), nullable=False, server_default='1'),
        sa.Column('department', sa.String(20), nullable=False),
        sa.Column('notes', sa.String(200), nullable=True),
        sa.Column('is_deleted', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # Add product_id to orders
    op.add_column('cmt_orders',
        sa.Column('product_id', UUID(as_uuid=True),
                  sa.ForeignKey('cmt_products.id'), nullable=True))


def downgrade() -> None:
    op.drop_column('cmt_orders', 'product_id')
    op.drop_table('cmt_product_bom_items')
    op.drop_table('cmt_products')

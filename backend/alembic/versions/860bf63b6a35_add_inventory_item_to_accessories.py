"""add_inventory_item_to_accessories

Revision ID: 860bf63b6a35
Revises: s9n0o1p2q3r4
Create Date: 2026-04-12 20:26:11.581604

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '860bf63b6a35'
down_revision: Union[str, Sequence[str], None] = 's9n0o1p2q3r4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'cmt_order_accessories',
        sa.Column('inventory_item_id', sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        'fk_cmt_order_accessories_inventory_item_id',
        'cmt_order_accessories',
        'cmt_inventory_items',
        ['inventory_item_id'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_cmt_order_accessories_inventory_item_id',
        'cmt_order_accessories',
        type_='foreignkey',
    )
    op.drop_column('cmt_order_accessories', 'inventory_item_id')

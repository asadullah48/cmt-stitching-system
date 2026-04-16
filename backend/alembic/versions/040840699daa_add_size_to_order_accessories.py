"""add_size_to_order_accessories

Revision ID: 040840699daa
Revises: 750a1916cced
Create Date: 2026-04-16 15:26:02.752231

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '040840699daa'
down_revision: Union[str, Sequence[str], None] = '750a1916cced'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cmt_order_accessories', sa.Column('size', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('cmt_order_accessories', 'size')

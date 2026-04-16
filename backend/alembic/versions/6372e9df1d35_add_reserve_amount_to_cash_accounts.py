"""add_reserve_amount_to_cash_accounts

Revision ID: 6372e9df1d35
Revises: 860bf63b6a35
Create Date: 2026-04-16 10:18:37.562935

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '6372e9df1d35'
down_revision: Union[str, Sequence[str], None] = '860bf63b6a35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cmt_cash_accounts',
        sa.Column('reserve_amount', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0')
    )
    op.alter_column('cmt_financial_transactions', 'transaction_type',
        existing_type=sa.VARCHAR(length=20),
        type_=sa.String(length=30),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column('cmt_financial_transactions', 'transaction_type',
        existing_type=sa.String(length=30),
        type_=sa.VARCHAR(length=20),
        existing_nullable=False,
    )
    op.drop_column('cmt_cash_accounts', 'reserve_amount')

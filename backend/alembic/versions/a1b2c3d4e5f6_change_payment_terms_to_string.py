"""change payment_terms to string

Revision ID: a1b2c3d4e5f6
Revises: 4d1e3598580f
Create Date: 2026-03-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '4d1e3598580f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'cmt_parties',
        'payment_terms',
        type_=sa.String(100),
        existing_type=sa.Integer(),
        postgresql_using='payment_terms::VARCHAR',
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'cmt_parties',
        'payment_terms',
        type_=sa.Integer(),
        existing_type=sa.String(100),
        postgresql_using="CASE WHEN payment_terms ~ '^[0-9]+$' THEN payment_terms::INTEGER ELSE 30 END",
        nullable=True,
    )

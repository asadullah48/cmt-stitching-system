"""replace bill_number unique constraint with partial index (exclude soft-deleted)

Revision ID: m3h4i5j6k7l8
Revises: l2g3h4i5j6k7
Create Date: 2026-03-14 00:00:01.000000
"""
from alembic import op

revision = 'm3h4i5j6k7l8'
down_revision = 'l2g3h4i5j6k7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the global unique constraint
    op.drop_constraint('cmt_bills_bill_number_key', 'cmt_bills', type_='unique')
    # Create a partial unique index that ignores soft-deleted bills
    op.execute(
        "CREATE UNIQUE INDEX cmt_bills_bill_number_active_uidx "
        "ON cmt_bills (bill_number) WHERE is_deleted = false"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS cmt_bills_bill_number_active_uidx")
    op.create_unique_constraint('cmt_bills_bill_number_key', 'cmt_bills', ['bill_number'])

"""add bill_id to cmt_financial_transactions

Revision ID: j0e1f2g3h4i5
Revises: i9d0e1f2g3h4
Create Date: 2026-03-13 00:00:00.000000

Adds a nullable bill_id FK column to cmt_financial_transactions so that
payment transactions can be linked back to a specific bill. This enables
computing bill.amount_paid as a SUM of linked transactions rather than
relying on a separate counter column.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "j0e1f2g3h4i5"
down_revision = "i9d0e1f2g3h4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cmt_financial_transactions",
        sa.Column(
            "bill_id",
            UUID(as_uuid=True),
            sa.ForeignKey("cmt_bills.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_cmt_financial_transactions_bill_id",
        "cmt_financial_transactions",
        ["bill_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_cmt_financial_transactions_bill_id",
        table_name="cmt_financial_transactions",
    )
    op.drop_column("cmt_financial_transactions", "bill_id")

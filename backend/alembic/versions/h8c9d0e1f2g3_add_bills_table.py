"""add bills table

Revision ID: h8c9d0e1f2g3
Revises: g7b8c9d0e1f2
Create Date: 2026-03-12

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'h8c9d0e1f2g3'
down_revision = 'g7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cmt_bills',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('bill_number', sa.String(20), unique=True, nullable=False),
        sa.Column('bill_series', sa.String(5), nullable=False),
        sa.Column('bill_sequence', sa.Integer(), nullable=False),
        sa.Column('order_id', UUID(as_uuid=True), sa.ForeignKey('cmt_orders.id'), nullable=False),
        sa.Column('party_id', UUID(as_uuid=True), sa.ForeignKey('cmt_parties.id'), nullable=True),
        sa.Column('bill_date', sa.Date(), nullable=False),
        sa.Column('carrier', sa.String(50), nullable=True),
        sa.Column('tracking_number', sa.String(100), nullable=True),
        sa.Column('carton_count', sa.Integer(), nullable=True),
        sa.Column('total_weight', sa.Numeric(8, 2), nullable=True),
        sa.Column('payment_status', sa.String(20), nullable=False, server_default='unpaid'),
        sa.Column('amount_due', sa.Numeric(10, 2), nullable=False),
        sa.Column('amount_paid', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('cmt_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_cmt_bills_bill_series', 'cmt_bills', ['bill_series'])
    op.create_index('ix_cmt_bills_order_id', 'cmt_bills', ['order_id'])


def downgrade():
    op.drop_index('ix_cmt_bills_order_id', table_name='cmt_bills')
    op.drop_index('ix_cmt_bills_bill_series', table_name='cmt_bills')
    op.drop_table('cmt_bills')

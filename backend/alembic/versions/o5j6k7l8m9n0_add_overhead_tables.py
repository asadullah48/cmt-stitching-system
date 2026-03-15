"""add overhead and cash tables

Revision ID: o5j6k7l8m9n0
Revises: n4i5j6k7l8m9
Create Date: 2026-03-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'o5j6k7l8m9n0'
down_revision = 'n4i5j6k7l8m9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cmt_cash_accounts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('account_type', sa.String(10), nullable=False),
        sa.Column('opening_balance', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('note', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_table(
        'cmt_cash_entries',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('cmt_cash_accounts.id'), nullable=False),
        sa.Column('entry_type', sa.String(10), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('description', sa.String(200), nullable=False),
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column('source', sa.String(20), nullable=True),
        sa.Column('source_id', UUID(as_uuid=True), nullable=True),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('cmt_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_cmt_cash_entries_account_id', 'cmt_cash_entries', ['account_id'])
    op.create_index('ix_cmt_cash_entries_entry_date', 'cmt_cash_entries', ['entry_date'])
    op.create_table(
        'cmt_overhead_expenses',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('category', sa.String(20), nullable=False, server_default='other'),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(10), nullable=False, server_default='unpaid'),
        sa.Column('paid_date', sa.Date(), nullable=True),
        sa.Column('paid_from_account_id', UUID(as_uuid=True), sa.ForeignKey('cmt_cash_accounts.id'), nullable=True),
        sa.Column('recurrence', sa.String(10), nullable=True),
        sa.Column('recurrence_days', sa.Integer(), nullable=True),
        sa.Column('parent_expense_id', UUID(as_uuid=True), sa.ForeignKey('cmt_overhead_expenses.id'), nullable=True),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('cmt_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_cmt_overhead_expenses_status', 'cmt_overhead_expenses', ['status'])
    op.create_index('ix_cmt_overhead_expenses_due_date', 'cmt_overhead_expenses', ['due_date'])


def downgrade():
    op.drop_index('ix_cmt_overhead_expenses_due_date', table_name='cmt_overhead_expenses')
    op.drop_index('ix_cmt_overhead_expenses_status', table_name='cmt_overhead_expenses')
    op.drop_table('cmt_overhead_expenses')
    op.drop_index('ix_cmt_cash_entries_entry_date', table_name='cmt_cash_entries')
    op.drop_index('ix_cmt_cash_entries_account_id', table_name='cmt_cash_entries')
    op.drop_table('cmt_cash_entries')
    op.drop_table('cmt_cash_accounts')

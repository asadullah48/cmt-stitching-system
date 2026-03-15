"""add todos table

Revision ID: n4i5j6k7l8m9
Revises: m3h4i5j6k7l8
Create Date: 2026-03-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'n4i5j6k7l8m9'
down_revision = 'm3h4i5j6k7l8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cmt_todos',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('priority', sa.String(10), nullable=False, server_default='medium'),
        sa.Column('category', sa.String(20), nullable=False, server_default='other'),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('order_id', UUID(as_uuid=True), sa.ForeignKey('cmt_orders.id'), nullable=True),
        sa.Column('assigned_to', UUID(as_uuid=True), sa.ForeignKey('cmt_users.id'), nullable=True),
        sa.Column('recurrence', sa.String(10), nullable=True),
        sa.Column('recurrence_days', sa.Integer(), nullable=True),
        sa.Column('parent_todo_id', UUID(as_uuid=True), sa.ForeignKey('cmt_todos.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_cmt_todos_status', 'cmt_todos', ['status'])
    op.create_index('ix_cmt_todos_assigned_to', 'cmt_todos', ['assigned_to'])
    op.create_index('ix_cmt_todos_due_date', 'cmt_todos', ['due_date'])


def downgrade():
    op.drop_index('ix_cmt_todos_due_date', table_name='cmt_todos')
    op.drop_index('ix_cmt_todos_assigned_to', table_name='cmt_todos')
    op.drop_index('ix_cmt_todos_status', table_name='cmt_todos')
    op.drop_table('cmt_todos')

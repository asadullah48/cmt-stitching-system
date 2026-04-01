"""add share links table

Revision ID: r8m9n0o1p2q3
Revises: q7l8m9n0o1p2
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'r8m9n0o1p2q3'
down_revision = 'q7l8m9n0o1p2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'cmt_share_links',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('token', UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('party_id', UUID(as_uuid=True), sa.ForeignKey('cmt_parties.id'), nullable=False),
        sa.Column('date_from', sa.Date(), nullable=False),
        sa.Column('date_to', sa.Date(), nullable=False),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('cmt_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('is_revoked', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.create_index('ix_cmt_share_links_token', 'cmt_share_links', ['token'], unique=True)
    op.create_index('ix_cmt_share_links_party_id', 'cmt_share_links', ['party_id'])


def downgrade() -> None:
    op.drop_index('ix_cmt_share_links_party_id', table_name='cmt_share_links')
    op.drop_index('ix_cmt_share_links_token', table_name='cmt_share_links')
    op.drop_table('cmt_share_links')

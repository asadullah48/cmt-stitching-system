"""Add piecework fields and align bill rate templates with the ORM."""

import sqlalchemy as sa
from alembic import op

revision = "2d9f4b8c1a60"
down_revision = "1c7f2a9e4b6d"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cmt_bill_rate_templates", sa.Column("deleted_at", sa.DateTime()))
    op.add_column("cmt_production_sessions", sa.Column("operator_name", sa.String(100)))
    op.add_column("cmt_production_sessions", sa.Column("pieces", sa.Integer()))
    op.add_column("cmt_production_sessions", sa.Column("piece_rate", sa.Numeric(10, 2)))
    op.add_column("cmt_production_sessions", sa.Column("wastage", sa.Integer()))


def downgrade():
    for column in ("wastage", "piece_rate", "pieces", "operator_name"):
        op.drop_column("cmt_production_sessions", column)
    op.drop_column("cmt_bill_rate_templates", "deleted_at")

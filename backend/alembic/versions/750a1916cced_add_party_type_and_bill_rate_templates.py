"""add_party_type_and_bill_rate_templates

Revision ID: 750a1916cced
Revises: 6372e9df1d35
Create Date: 2026-04-16 10:49:42.721295

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '750a1916cced'
down_revision: Union[str, Sequence[str], None] = '6372e9df1d35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add party_type to cmt_parties
    op.add_column('cmt_parties',
        sa.Column('party_type', sa.String(10), nullable=False, server_default='customer')
    )

    # 2. Create cmt_bill_rate_templates
    op.create_table(
        'cmt_bill_rate_templates',
        sa.Column('id',            sa.UUID(),         nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('goods_type',    sa.String(50),     nullable=False),
        sa.Column('bill_series',   sa.String(1),      nullable=False),
        sa.Column('description',   sa.String(200),    nullable=True),
        sa.Column('customer_rate', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('labour_rate',   sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('vendor_rate',   sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('is_active',     sa.Boolean(),      nullable=False, server_default='true'),
        sa.Column('is_deleted',    sa.Boolean(),      nullable=False, server_default='false'),
        sa.Column('created_at',    sa.DateTime(),     nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at',    sa.DateTime(),     nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )

    # 3. Seed internal parties
    op.execute("""
        INSERT INTO cmt_parties (id, name, party_type, balance, is_deleted, created_at, updated_at)
        VALUES
          (gen_random_uuid(), 'CMT Labour',  'labour', 0, false, now(), now()),
          (gen_random_uuid(), 'CMT Vendors', 'vendor', 0, false, now(), now())
    """)

    # 4. Seed rate templates
    op.execute("""
        INSERT INTO cmt_bill_rate_templates
            (id, goods_type, bill_series, description, customer_rate, labour_rate, vendor_rate, is_active, is_deleted, created_at, updated_at)
        VALUES
          (gen_random_uuid(), 'bedrail',      'A', 'Stitching 40 + Polybag 2', 135, 42,  0,  true, false, now(), now()),
          (gen_random_uuid(), 'bedrail',      'C', 'Packing',                   80, 60,  0,  true, false, now(), now()),
          (gen_random_uuid(), 'castel',       'A', 'Stitching',                360, 200, 0,  true, false, now(), now()),
          (gen_random_uuid(), 'castel',       'C', 'Packing',                   30, 20,  0,  true, false, now(), now()),
          (gen_random_uuid(), 'tent',         'A', 'Stitching',                360, 200, 0,  true, false, now(), now()),
          (gen_random_uuid(), 'tent',         'C', 'Packing',                   30, 20,  0,  true, false, now(), now()),
          (gen_random_uuid(), 'garment rack', 'A', 'Stitching + Material',      50, 20,  10, true, false, now(), now()),
          (gen_random_uuid(), 'zip',          'B', 'Bedrail Zip Accessories',   34, 0,   20, true, false, now(), now())
    """)


def downgrade() -> None:
    op.execute("DELETE FROM cmt_bill_rate_templates")
    op.execute("DELETE FROM cmt_parties WHERE party_type IN ('labour', 'vendor')")
    op.drop_table('cmt_bill_rate_templates')
    op.drop_column('cmt_parties', 'party_type')

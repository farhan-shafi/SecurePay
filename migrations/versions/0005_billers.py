"""add billers (bill payments) with seeded system payees

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-05 13:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Demo billers. Each gets its own system user + PKR wallet, because a bill
# payment is just a transfer into that wallet (same locking/FX/idempotency
# path as P2P). The '!' password hash can never match a real password, so
# these accounts cannot be logged into.
BILLERS = [
    ("K-Electric", "electricity", "kelectric"),
    ("PTCL Internet", "internet", "ptcl"),
    ("SSGC Gas", "gas", "ssgc"),
    ("Jazz Load", "mobile", "jazz"),
]


def upgrade() -> None:
    op.create_table(
        'billers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('category', sa.String(length=30), nullable=False),
        sa.Column('wallet_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['wallet_id'], ['wallets.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    for i, (name, category, slug) in enumerate(BILLERS, start=1):
        op.execute(
            f"""
            INSERT INTO users (email, phone_number, password_hash, first_name,
                               last_name, kyc_verified)
            VALUES ('{slug}@billers.securepay.internal', '+92000000000{i}', '!',
                    '{name}', 'Biller', true);
            INSERT INTO wallets (user_id, balance, currency, is_active)
            VALUES (currval('users_id_seq'), 0, 'PKR', true);
            INSERT INTO billers (name, category, wallet_id)
            VALUES ('{name}', '{category}', currval('wallets_id_seq'));
            """
        )


def downgrade() -> None:
    op.drop_table('billers')
    op.execute(
        """
        DELETE FROM wallets WHERE user_id IN
            (SELECT id FROM users WHERE email LIKE '%@billers.securepay.internal');
        DELETE FROM users WHERE email LIKE '%@billers.securepay.internal';
        """
    )

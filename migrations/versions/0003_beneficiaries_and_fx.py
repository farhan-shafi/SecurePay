"""add beneficiaries and cross-currency transfer fields

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-14 00:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Saved payees (like a bank's beneficiary list).
    op.create_table(
        'beneficiaries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('owner_user_id', sa.Integer(), nullable=False),
        sa.Column('wallet_id', sa.Integer(), nullable=False),
        sa.Column('nickname', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['owner_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['wallet_id'], ['wallets.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('owner_user_id', 'wallet_id', name='uq_beneficiary_owner_wallet'),
    )
    op.create_index(op.f('ix_beneficiaries_owner_user_id'), 'beneficiaries', ['owner_user_id'], unique=False)

    # Cross-currency transfers: what the recipient actually received, in their
    # currency, and the rate used. Null for same-currency transfers/deposits.
    op.add_column('transactions', sa.Column('recipient_amount', sa.Numeric(precision=15, scale=2), nullable=True))
    op.add_column('transactions', sa.Column('exchange_rate', sa.Numeric(precision=18, scale=8), nullable=True))


def downgrade() -> None:
    op.drop_column('transactions', 'exchange_rate')
    op.drop_column('transactions', 'recipient_amount')
    op.drop_index(op.f('ix_beneficiaries_owner_user_id'), table_name='beneficiaries')
    op.drop_table('beneficiaries')

"""allow multiple wallets per user (one per currency)

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-06 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0006'
down_revision: Union[str, None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # One wallet per user becomes one wallet per user PER CURRENCY.
    op.drop_index('ix_wallets_user_id', table_name='wallets')
    op.create_index('ix_wallets_user_id', 'wallets', ['user_id'], unique=False)
    op.create_index(
        'uq_wallets_user_currency', 'wallets', ['user_id', 'currency'], unique=True
    )


def downgrade() -> None:
    op.drop_index('uq_wallets_user_currency', table_name='wallets')
    op.drop_index('ix_wallets_user_id', table_name='wallets')
    op.create_index('ix_wallets_user_id', 'wallets', ['user_id'], unique=True)

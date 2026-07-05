"""add the transactional outbox table

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-05 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Events written in the same DB transaction as the change they describe,
    # published to RabbitMQ by a drainer (at-least-once delivery).
    op.create_table(
        'outbox_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('routing_key', sa.String(length=100), nullable=False),
        sa.Column('payload', JSONB(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_outbox_events_status', 'outbox_events', ['status'])


def downgrade() -> None:
    op.drop_index('ix_outbox_events_status', table_name='outbox_events')
    op.drop_table('outbox_events')

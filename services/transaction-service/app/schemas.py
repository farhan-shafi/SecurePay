from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class P2PRequest(BaseModel):
    recipient_wallet_id: int
    amount: Decimal = Field(gt=0, max_digits=15, decimal_places=2)
    description: str | None = Field(default=None, max_length=500)
    # Optional but recommended: a unique key (e.g. a UUID) so that retrying the
    # same request never sends the money twice.
    idempotency_key: str | None = Field(default=None, max_length=255)


class TransactionOut(BaseModel):
    id: int
    wallet_id: int
    transaction_type: str
    amount: Decimal
    recipient_wallet_id: int | None
    status: str
    description: str | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}

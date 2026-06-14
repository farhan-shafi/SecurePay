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
    # Cross-currency detail: what the recipient received, in their currency, and
    # the rate used. Null for same-currency transfers and deposits.
    recipient_amount: Decimal | None
    exchange_rate: Decimal | None
    status: str
    description: str | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class QuoteOut(BaseModel):
    """A preview of a cross-currency transfer, shown before the user sends."""

    amount: Decimal  # what the sender pays, in their currency
    currency: str  # sender's currency
    recipient_amount: Decimal  # what the recipient receives
    recipient_currency: str
    exchange_rate: Decimal  # recipient units per 1 sender unit
    same_currency: bool

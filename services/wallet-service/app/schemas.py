from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class WalletOut(BaseModel):
    id: int
    user_id: int
    balance: Decimal
    currency: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class DepositRequest(BaseModel):
    # Mock top-up for development. In production a real payment processor
    # (e.g. Stripe) would fund the wallet instead.
    amount: Decimal = Field(gt=0, max_digits=15, decimal_places=2)


class StatementEntry(BaseModel):
    id: int
    transaction_type: str
    amount: Decimal
    direction: str  # 'credit' or 'debit' relative to this wallet
    status: str
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

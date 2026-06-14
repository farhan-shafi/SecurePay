from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from shared.fx import ALLOWED_CURRENCIES


class WalletOut(BaseModel):
    id: int
    user_id: int
    balance: Decimal
    currency: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateWalletRequest(BaseModel):
    # The currency the wallet holds. Defaults to USD so an empty POST (as the
    # smoke test sends) still works.
    currency: str = "USD"

    @field_validator("currency")
    @classmethod
    def _allowed(cls, v: str) -> str:
        v = v.upper()
        if v not in ALLOWED_CURRENCIES:
            raise ValueError(
                f"currency must be one of {', '.join(ALLOWED_CURRENCIES)}"
            )
        return v


class DepositRequest(BaseModel):
    # Mock top-up for development. In production a real payment processor
    # (e.g. Stripe) would fund the wallet instead.
    amount: Decimal = Field(gt=0, max_digits=15, decimal_places=2)


class StatementEntry(BaseModel):
    id: int
    transaction_type: str
    amount: Decimal  # in THIS wallet's currency
    currency: str  # this wallet's currency
    direction: str  # 'credit' or 'debit' relative to this wallet
    status: str
    description: str | None
    created_at: datetime
    completed_at: datetime | None
    # Who the money went to / came from (None for deposits).
    counterparty_name: str | None
    counterparty_wallet_id: int | None
    # The absolute transfer, both sides — lets the detail view show a
    # cross-currency conversion regardless of which side this wallet is on.
    from_amount: Decimal | None
    from_currency: str | None
    to_amount: Decimal | None
    to_currency: str | None
    exchange_rate: Decimal | None

    model_config = {"from_attributes": True}


class AddBeneficiaryRequest(BaseModel):
    wallet_id: int
    nickname: str | None = Field(default=None, max_length=100)


class BeneficiaryOut(BaseModel):
    id: int
    wallet_id: int
    name: str  # the payee's real name, resolved from their account
    nickname: str | None
    currency: str
    created_at: datetime


class LookupOut(BaseModel):
    """Result of resolving a person by email or wallet id, before deciding to
    save them as a payee or send them money."""

    wallet_id: int
    name: str
    currency: str

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    """What the transaction service sends before completing a transfer."""

    wallet_id: int  # the sender's wallet
    amount: Decimal = Field(gt=0, max_digits=15, decimal_places=2)
    recipient_wallet_id: int


class AnalyzeResponse(BaseModel):
    fraud_score: float
    risk_level: str  # low / medium / high / critical
    signals_detected: list[str]
    recommended_action: str  # approve / review / block


class FraudLogOut(BaseModel):
    id: int
    transaction_id: int | None
    wallet_id: int
    fraud_score: Decimal
    risk_level: str
    detected_signals: list
    action_taken: str
    created_at: datetime

    model_config = {"from_attributes": True}

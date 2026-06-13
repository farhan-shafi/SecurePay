"""ORM models shared across services.

This MVP covers the core slice (users, wallets, transactions) plus fraud_logs,
which backs the rule-based fraud service. The remaining tables in the
architecture doc (merchants, bills, audit_logs) can be added the same way as
the project grows.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shared.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    kyc_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    wallet: Mapped["Wallet"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class Wallet(Base):
    __tablename__ = "wallets"
    __table_args__ = (
        CheckConstraint("balance >= 0", name="balance_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    balance: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="wallet")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    wallet_id: Mapped[int] = mapped_column(ForeignKey("wallets.id"), index=True)
    transaction_type: Mapped[str] = mapped_column(String(50))  # 'p2p', 'deposit'
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    recipient_wallet_id: Mapped[int | None] = mapped_column(
        ForeignKey("wallets.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # A client-supplied key that makes retries safe: the same key never creates
    # two transfers. The unique constraint enforces this at the database level.
    idempotency_key: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class FraudLog(Base):
    """One row per transfer that the fraud service flagged or blocked.

    The fraud service writes these during analysis, *before* the transfer is
    committed, so `transaction_id` is null for blocked attempts that never
    become a real transaction. `detected_signals` is JSONB so we can store the
    list of rules that fired (e.g. ["high_velocity", "unusual_amount"]) and
    query into it later.
    """

    __tablename__ = "fraud_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int | None] = mapped_column(nullable=True)
    wallet_id: Mapped[int] = mapped_column(ForeignKey("wallets.id"), index=True)
    fraud_score: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    risk_level: Mapped[str] = mapped_column(String(20), index=True)  # low/medium/high/critical
    detected_signals: Mapped[list] = mapped_column(JSONB, default=list)
    action_taken: Mapped[str] = mapped_column(String(20))  # approve/review/block
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

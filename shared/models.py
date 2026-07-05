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
    UniqueConstraint,
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

    wallets: Mapped[list["Wallet"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Wallet(Base):
    __tablename__ = "wallets"
    __table_args__ = (
        CheckConstraint("balance >= 0", name="balance_non_negative"),
        # A user may hold several wallets, but only one per currency.
        UniqueConstraint("user_id", "currency", name="uq_wallets_user_currency"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    balance: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), nullable=False
    )
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="wallets")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    wallet_id: Mapped[int] = mapped_column(ForeignKey("wallets.id"), index=True)
    transaction_type: Mapped[str] = mapped_column(String(50))  # 'p2p', 'deposit'
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2))  # debited, in sender's currency
    recipient_wallet_id: Mapped[int | None] = mapped_column(
        ForeignKey("wallets.id"), nullable=True
    )
    # For cross-currency transfers, the amount actually credited to the
    # recipient, in the recipient's currency, and the rate used (recipient units
    # per 1 sender unit). Null/equal-to-amount when both wallets share a currency.
    recipient_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    exchange_rate: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 8), nullable=True
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


class Beneficiary(Base):
    """A payee a user has saved so they can send to them by name.

    Like a bank's saved-payees list: instead of typing a wallet id every time,
    the user adds a beneficiary once (by wallet id) and we resolve the owner's
    real name from their account. `nickname` is an optional user-set label
    ("Mum", "Rent"). A user can't save the same wallet twice (unique pair).
    """

    __tablename__ = "beneficiaries"
    __table_args__ = (
        UniqueConstraint(
            "owner_user_id", "wallet_id", name="uq_beneficiary_owner_wallet"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    wallet_id: Mapped[int] = mapped_column(ForeignKey("wallets.id"))
    nickname: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
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


class Notification(Base):
    """A message the notification-service 'sent' in response to an event.

    The notification-service consumes transfer events from RabbitMQ and writes
    one row per recipient (sender + payee). `channel`/`destination` record how
    and where it was delivered (e.g. email -> user's address); this MVP only
    logs the send, but the row is the audit trail a real sender would update.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=True
    )
    channel: Mapped[str] = mapped_column(String(20))  # email / sms
    destination: Mapped[str] = mapped_column(String(255))  # email address or phone
    message: Mapped[str] = mapped_column(Text)
    transaction_id: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="sent")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class OutboxEvent(Base):
    """Transactional outbox: an event recorded in the SAME database transaction
    as the change it describes (e.g. a transfer), then published to RabbitMQ by
    a drainer afterwards. If publishing fails the row stays 'pending' and is
    retried, so a committed transfer can never silently lose its event —
    at-least-once delivery instead of fire-and-forget."""

    __tablename__ = "outbox_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    routing_key: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Biller(Base):
    """A payee for bill payments (electricity, internet, ...). Each biller is
    backed by a system-owned wallet that receives the payments, so a bill
    payment reuses the exact same money-movement path as a P2P transfer."""

    __tablename__ = "billers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    category: Mapped[str] = mapped_column(String(30))  # electricity / internet / ...
    wallet_id: Mapped[int] = mapped_column(ForeignKey("wallets.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    wallet: Mapped["Wallet"] = relationship()

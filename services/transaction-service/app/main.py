"""Transaction service: peer-to-peer transfers.

The transfer runs inside a single database transaction with both wallet rows
locked, so the debit and credit either both happen or neither does.
"""

from datetime import datetime, timezone
from decimal import Decimal

import httpx
from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.schemas import P2PRequest, TransactionOut
from shared.config import settings
from shared.database import get_db
from shared.events import publish_event
from shared.models import Transaction, Wallet
from shared.security import get_current_user_id

# A short-lived client for the synchronous call to the fraud service. The whole
# transfer is a sync request, so we use httpx's sync client here.
_fraud_client = httpx.Client(timeout=2.0)

app = FastAPI(title="SecurePay Transaction Service")


def _fraud_check(sender_wallet_id: int, amount: Decimal, recipient_wallet_id: int) -> None:
    """Ask the fraud service to screen this transfer; raise 403 if it blocks.

    Fail-open: if the fraud service is unreachable or errors, we let the
    transfer proceed rather than halting all payments during a fraud outage.
    That's the right availability tradeoff for this MVP; a production system
    might fail closed for large amounts.
    """
    try:
        resp = _fraud_client.post(
            f"{settings.fraud_service_url}/analyze",
            json={
                "wallet_id": sender_wallet_id,
                "amount": str(amount),
                "recipient_wallet_id": recipient_wallet_id,
            },
        )
        resp.raise_for_status()
        verdict = resp.json()
    except (httpx.RequestError, httpx.HTTPStatusError):
        return  # fail open

    if verdict.get("recommended_action") == "block":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "Transfer blocked by fraud screening",
                "fraud_score": verdict.get("fraud_score"),
                "risk_level": verdict.get("risk_level"),
                "signals": verdict.get("signals_detected", []),
            },
        )


@app.get("/health")
def health():
    return {"status": "ok", "service": "transaction-service"}


@app.post("/p2p", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def transfer(
    payload: P2PRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    # 1. Idempotency: if we've already processed this key, return the original
    #    transaction instead of creating a second transfer.
    if payload.idempotency_key:
        existing = db.scalar(
            select(Transaction).where(
                Transaction.idempotency_key == payload.idempotency_key
            )
        )
        if existing:
            return existing

    sender = db.scalar(select(Wallet).where(Wallet.user_id == user_id))
    if sender is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Sender has no wallet"
        )

    recipient = db.get(Wallet, payload.recipient_wallet_id)
    if recipient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Recipient wallet not found"
        )
    if recipient.id == sender.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot transfer to your own wallet",
        )

    # 2. Screen the transfer for fraud *before* we take any row locks. The
    #    fraud service writes a fraud_logs row keyed to this wallet, and that
    #    INSERT's foreign-key check needs a lock on the same wallet row. If we
    #    held a FOR UPDATE lock here, that INSERT would block until our httpx
    #    timeout fired (fail-open) and the block would never take effect. A
    #    blocked transfer raises 403 here and never debits the sender.
    _fraud_check(sender.id, payload.amount, recipient.id)

    # 3. Lock both wallet rows. We lock in a deterministic order (lowest id
    #    first) so two opposite transfers can never deadlock each other.
    first_id, second_id = sorted((sender.id, recipient.id))
    locked = {
        w.id: w
        for w in db.scalars(
            select(Wallet)
            .where(Wallet.id.in_((first_id, second_id)))
            .order_by(Wallet.id)
            .with_for_update()
        ).all()
    }
    sender = locked[sender.id]
    recipient = locked[recipient.id]

    # 4. Re-check funds now that we hold the lock (balance may have changed).
    if sender.balance < payload.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient funds"
        )

    # 5. Move the money and record it, all in one commit.
    sender.balance -= payload.amount
    recipient.balance += payload.amount
    tx = Transaction(
        wallet_id=sender.id,
        transaction_type="p2p",
        amount=payload.amount,
        recipient_wallet_id=recipient.id,
        status="completed",
        description=payload.description,
        idempotency_key=payload.idempotency_key,
        completed_at=datetime.now(timezone.utc),
    )
    # Capture the ids before commit; afterwards the ORM objects are expired and
    # reading them would trigger a reload.
    sender_id, recipient_id = sender.id, recipient.id
    db.add(tx)
    db.commit()
    db.refresh(tx)

    # 6. Announce the completed transfer. This is fire-and-forget: the money has
    #    already moved, so a broker hiccup must not fail the request (see
    #    publish_event's best-effort contract). The notification-service reacts.
    publish_event(
        "transaction.completed",
        {
            "transaction_id": tx.id,
            "sender_wallet_id": sender_id,
            "recipient_wallet_id": recipient_id,
            "amount": str(payload.amount),
        },
    )
    return tx

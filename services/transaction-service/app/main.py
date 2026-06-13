"""Transaction service: peer-to-peer transfers.

The transfer runs inside a single database transaction with both wallet rows
locked, so the debit and credit either both happen or neither does.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.schemas import P2PRequest, TransactionOut
from shared.database import get_db, init_db
from shared.models import Transaction, Wallet
from shared.security import get_current_user_id


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="SecurePay Transaction Service", lifespan=lifespan)


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

    # 2. Lock both wallet rows. We lock in a deterministic order (lowest id
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

    # 3. Re-check funds now that we hold the lock (balance may have changed).
    if sender.balance < payload.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient funds"
        )

    # 4. Move the money and record it, all in one commit.
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
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx
